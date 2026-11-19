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
        isOpen: schedule.enabled && !r.closed_at && localTime >= schedule.open,
        closedAt: r.closed_at,
        cutoffAt: r.cutoff_at,
        nextOperatingDay: await operatingDate(c),
        reason: r.closed_at
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
    return (
      await pool.query(
        "SELECT to_char(day,'YYYY-MM-DD') AS day,closed_at,processed_at,automatic,summary FROM business_days WHERE closed_at IS NOT NULL ORDER BY day DESC LIMIT 90",
      )
    ).rows;
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
      fail(409, "El cierre es automático a la hora configurada para este día");
    return { day, summary: r.summary, automatic: true };
  }
}
