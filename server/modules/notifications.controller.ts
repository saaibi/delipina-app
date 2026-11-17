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
import { pool, tx, fail } from "../db.js";
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
export class NotificationsController {
  @Get("notifications")
  @HttpCode(200)
  async getNotifications(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req);
    return (
      await pool.query(
        "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [u.id],
      )
    ).rows;
  }
  @Post("notifications/read")
  @HttpCode(200)
  async postNotificationsRead(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req);
    await pool.query("UPDATE notifications SET read=true WHERE user_id=$1", [
      u.id,
    ]);
    return { ok: true };
  }
  @Post("push")
  @HttpCode(200)
  async postPush(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const u = auth(req),
      b = req.body;
    if (!b.endpoint?.startsWith("https://") || !b.keys?.auth || !b.keys?.p256dh)
      fail(400, "Suscripción inválida");
    const url = new URL(b.endpoint);
    if (
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname)
    )
      fail(400, "Proveedor push no admitido");
    await pool.query(
      "INSERT INTO subscriptions VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,payload=excluded.payload",
      [u.id, b.endpoint, b],
    );
    return { ok: true };
  }
  @Delete("push") @HttpCode(200) async deletePush(@Req() req: any) {
    const u = auth(req);
    await pool.query(
      "DELETE FROM subscriptions WHERE user_id=$1 AND endpoint=$2",
      [u.id, req.body.endpoint],
    );
    return { ok: true };
  }
}
