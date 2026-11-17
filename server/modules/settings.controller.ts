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
    return (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
      .data;
  }
  @Put("settings")
  @HttpCode(200)
  async putSettings(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    const b = req.body;
    if (
      !Number.isInteger(b.open) ||
      !Number.isInteger(b.close) ||
      b.open < 0 ||
      b.close > 24 ||
      b.open >= b.close ||
      !Number.isFinite(b.leadHours) ||
      b.leadHours < 0
    )
      fail(400, "Horario inválido");
    await pool.query("UPDATE settings SET data=$1 WHERE id=1", [
      {
        origin: text(b.origin),
        open: b.open,
        close: b.close,
        leadHours: b.leadHours,
      },
    ]);
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
