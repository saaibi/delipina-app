import { Controller, Get, Post, Req, HttpCode } from "@nestjs/common";
import { auth, broadcast } from "../domain.js";
import { pool, tx, fail } from "../db.js";
import { businessDate, daySummary } from "../business-day.js";
@Controller("api")
export class BusinessDayController {
  @Get("business-day") @HttpCode(200) async current(@Req() req: any) {
    auth(req);
    const day = await businessDate();
    await pool.query(
      "INSERT INTO business_days(day) VALUES($1) ON CONFLICT DO NOTHING",
      [day],
    );
    const r = (
      await pool.query("SELECT * FROM business_days WHERE day=$1", [day])
    ).rows[0];
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0].data;
    const hour = Number(
      (
        await pool.query(
          "SELECT EXTRACT(hour FROM now() AT TIME ZONE 'America/Bogota') AS hour",
        )
      ).rows[0].hour,
    );
    return {
      day,
      isOpen: !r.closed_at && hour >= cfg.open && hour < cfg.close,
      closedAt: r.closed_at,
      reason: r.closed_at
        ? "daily_close"
        : hour < cfg.open || hour >= cfg.close
          ? "outside_hours"
          : "open",
      openHour: cfg.open,
      closeHour: cfg.close,
    };
  }
  @Get("business-days") @HttpCode(200) async list(@Req() req: any) {
    auth(req, ["admin"]);
    return (
      await pool.query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day,closed_at,summary FROM business_days WHERE closed_at IS NOT NULL ORDER BY day DESC LIMIT 90",
      )
    ).rows;
  }
  @Post("business-day/close") @HttpCode(200) async close(@Req() req: any) {
    const u = auth(req, ["admin"]);
    const today = await businessDate(),
      day = req.body.day || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today)
      fail(400, "Solo puedes cerrar la jornada actual o una anterior");
    const result = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "delipina:day:" + day,
      ]);
      await c.query(
        "INSERT INTO business_days(day) VALUES($1) ON CONFLICT DO NOTHING",
        [day],
      );
      const prior = (
        await c.query("SELECT * FROM business_days WHERE day=$1 FOR UPDATE", [
          day,
        ])
      ).rows[0];
      if (prior.closed_at)
        return { day, summary: prior.summary, alreadyClosed: true };
      const summary = await daySummary(c, day);
      if (summary.unresolved > 0)
        fail(
          409,
          `Hay ${summary.unresolved} pedidos del día pendientes de resolver. Los pedidos de mañana no impiden este cierre.`,
        );
      if (summary.unverified_count > 0)
        fail(
          409,
          "Verifica las transferencias de esta jornada antes de cerrar",
        );
      await c.query(
        "UPDATE business_days SET closed_at=now(),closed_by=$2,summary=$3 WHERE day=$1",
        [day, u.id, summary],
      );
      await c.query("INSERT INTO audit(actor_id,action) VALUES($1,$2)", [
        u.id,
        "business-day:" + day + ":closed",
      ]);
      return { day, summary };
    });
    await broadcast();
    return result;
  }
}
