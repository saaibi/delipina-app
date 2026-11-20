import { Controller, Get, Post, Req, HttpCode } from "@nestjs/common";
import { auth } from "../domain.js";
import { pool, tx, fail } from "../db.js";
import {
  businessDate,
  ensureBusinessClock,
  operatingDate,
  prepareDay,
} from "../business-day.js";
@Controller("api")
export class BusinessDayController {
  @Get("business-day") @HttpCode(200) async current(@Req() req: any) {
    auth(req);
    await ensureBusinessClock();
    return tx(async (c) => {
      const day = await businessDate(c),
        cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
          .data;
      const { schedule } = await prepareDay(c, day, cfg);
      const r = (
        await c.query("SELECT * FROM business_days WHERE day=$1", [day])
      ).rows[0];
      const localTime = (
        await c.query(
          "SELECT to_char(now() AT TIME ZONE 'America/Bogota','HH24:MI') AS time",
        )
      ).rows[0].time;
      return {
        day,
        isOpen:
          schedule.enabled &&
          !r.intake_closed_at &&
          localTime >= schedule.open &&
          localTime < schedule.close,
        closedAt: r.intake_closed_at,
        accountingClosedAt: r.closed_at,
        cutoffAt: r.cutoff_at,
        nextOperatingDay: await operatingDate(c),
        reason: r.intake_closed_at
          ? "daily_close"
          : !schedule.enabled || localTime < schedule.open
            ? "outside_hours"
            : "open",
        schedule,
      };
    });
  }
  @Get("business-days") @HttpCode(200) async list(@Req() req: any) {
    auth(req, ["admin"]);
    await ensureBusinessClock();
    const page = Number(req.query.page ?? 0),
      pageSize = Number(req.query.pageSize ?? 25);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      fail(400, "Paginación inválida");
    const where = "WHERE intake_closed_at IS NOT NULL OR closed_at IS NOT NULL";
    const rows = (
      await pool.query(
        `SELECT to_char(day,'YYYY-MM-DD') AS day,intake_closed_at,closed_at,processed_at,automatic,summary,(SELECT count(*)::int FROM (SELECT DISTINCT COALESCE(o.delivered_by,o.courier_id) id FROM orders o WHERE o.operation_day=d.day AND COALESCE(o.delivered_by,o.courier_id) IS NOT NULL UNION SELECT p.receiver_id FROM payments p WHERE p.business_day=d.day) actors JOIN users u ON u.id=actors.id AND u.role='courier' WHERE NOT EXISTS(SELECT 1 FROM settlements s WHERE s.day=d.day AND s.courier_id=actors.id AND s.status='confirmed')) pending_settlements FROM business_days d ${where} ORDER BY day DESC LIMIT $1 OFFSET $2`,
        [pageSize, page * pageSize],
      )
    ).rows;
    if (req.query.page === undefined) return rows;
    const total = (
      await pool.query(`SELECT count(*)::int n FROM business_days ${where}`)
    ).rows[0].n;
    return { rows, total, page, pageSize };
  }
  @Post("business-day/close") @HttpCode(200) async close(@Req() req: any) {
    auth(req, ["admin"]);
    await ensureBusinessClock();
    const day = req.body.day || (await businessDate());
    const r = (
      await pool.query(
        "SELECT closed_at,summary FROM business_days WHERE day=$1",
        [day],
      )
    ).rows[0];
    if (!r?.closed_at)
      fail(409, "El cierre contable espera entregas resueltas, transferencias verificadas y todos los cuadres confirmados");
    return { day, summary: r.summary, automatic: true };
  }
}
