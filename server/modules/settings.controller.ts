import {
  validateSchedule,
  weeklySchedule,
  businessDate,
  ensureBusinessClock,
} from "../business-day.js";
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Req,
  Res,
  HttpCode,
} from "@nestjs/common";
import type { Response } from "express";
import { pool, tx, fail, databaseSchema } from "../db.js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import {
  production,
  safeUser,
  session,
  auth,
  login,
  cents,
  text,
  notify,
  broadcast,
  createInvoice,
  orderVisible,
  applyAllocation,
} from "../domain.js";

@Controller("api")
export class SettingsController {
  @Get("settings")
  @HttpCode(200)
  async getSettings(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req);
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0].data;
    return { ...cfg, weeklySchedule: weeklySchedule(cfg) };
  }
  @Put("settings")
  @HttpCode(200)
  async putSettings(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    const b = req.body;
    const week = validateSchedule(b),
      cfg = {
        origin: text(b.origin),
        leadHours: b.leadHours,
        weeklySchedule: week,
      };
    await tx(async (c) => {
      await c.query("UPDATE settings SET data=$1 WHERE id=1", [cfg]);
      const today = await businessDate(c);
      const days = (
        await c.query(
          "SELECT to_char(day,'YYYY-MM-DD') AS day,EXTRACT(ISODOW FROM day)::int AS weekday FROM business_days WHERE closed_at IS NULL AND day>=$1",
          [today],
        )
      ).rows;
      for (const d of days) {
        const schedule = week[d.weekday];
        await c.query(
          "UPDATE business_days SET cutoff_at=GREATEST(($1::date+$2::time) AT TIME ZONE 'America/Bogota',now()) WHERE day=$1",
          [d.day, schedule.enabled ? schedule.close : "00:00"],
        );
      }
    });
    await ensureBusinessClock();
    await broadcast();
    return { ok: true };
  }
  @Get("health")
  @HttpCode(200)
  async getHealth(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const r = await pool.query("SELECT current_schema() AS schema");
    if (r.rows[0].schema !== databaseSchema) fail(503, "Schema no disponible");
    const audit = (
      await pool.query(
        "SELECT unchanged FROM schema_audits ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    return {
      ok: true,
      schema: databaseSchema,
      schemaIsolationVerified: audit?.unchanged === true,
    };
  }
}
