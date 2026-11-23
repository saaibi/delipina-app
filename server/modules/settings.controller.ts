import { enabledModules, featureLabels } from "../../shared/modules.js";
import { locationMetadata } from "../google-locations.js";
import { coordinates } from "../coordinates.js";
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
  @Get("maps/config") @HttpCode(200) mapsConfig(@Req() req: any) {
    auth(req);
    return { browserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null };
  }
  @Get("settings")
  @HttpCode(200)
  async getSettings(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req);
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0].data;
    return {
      ...cfg,
      enabledModules: enabledModules(cfg),
      weeklySchedule: weeklySchedule(cfg),
    };
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
        originCity: b.originCity ? text(b.originCity, 100) : "Bucaramanga",
        originLocation:
          b.originLocation === undefined
            ? (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
                .data.originLocation
            : b.originLocation
              ? {
                  ...coordinates(b.originLocation?.lat, b.originLocation?.lng),
                  ...(() => {
                    const meta = locationMetadata(
                      b.originLocation,
                      b.originLocation,
                    );
                    return {
                      source: meta.source,
                      placeId: meta.placeId,
                      expiresAt: meta.expires,
                    };
                  })(),
                }
              : null,
        weeklySchedule: week,
      };
    await tx(async (c) => {
      await c.query("UPDATE settings SET data=data || $1::jsonb WHERE id=1", [
        cfg,
      ]);
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
  @Put("settings/modules") @HttpCode(200) async modules(@Req() req: any) {
    auth(req, ["admin"]);
    const changes = req.body.enabledModules;
    if (
      !changes ||
      typeof changes !== "object" ||
      Array.isArray(changes) ||
      Object.entries(changes).some(
        ([k, v]) => !Object.hasOwn(featureLabels, k) || typeof v !== "boolean",
      )
    )
      fail(400, "Configuración de módulos inválida");
    await tx(async (c) => {
      const cfg = (
        await c.query("SELECT data FROM settings WHERE id=1 FOR UPDATE")
      ).rows[0].data;
      await c.query(
        "UPDATE settings SET data=jsonb_set(data,'{enabledModules}',$1::jsonb) WHERE id=1",
        [{ ...enabledModules(cfg), ...changes }],
      );
    });
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
