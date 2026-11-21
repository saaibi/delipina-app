import { noticeTitle } from "../status-labels.js";
import { noticeVisibility } from "../notification-store.js";
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
        `SELECT n.*,o.window_start,o.window_end,o.status AS current_status,(SELECT name FROM users WHERE id=o.client_id) client_name FROM notifications n LEFT JOIN orders o ON o.id=n.order_id WHERE ${noticeVisibility()} ORDER BY n.updated_at DESC LIMIT 100`,
        [u.id, u.role],
      )
    ).rows.map((n) => ({ ...n, title: noticeTitle(n.title) }));
  }
  @Get("notifications/counts") @HttpCode(200) async counts(@Req() req: any) {
    const u = auth(req);
    return (
      await pool.query(
        `SELECT n.module,count(*)::int AS count FROM notifications n LEFT JOIN orders o ON o.id=n.order_id WHERE ${noticeVisibility()} AND NOT n.read GROUP BY n.module`,
        [u.id, u.role],
      )
    ).rows;
  }
  @Post("notifications/:id/read") @HttpCode(200) async readOne(
    @Req() req: any,
  ) {
    const u = auth(req);
    const revision = req.body.revision;
    if (
      revision !== undefined &&
      (!Number.isSafeInteger(revision) || revision < 1)
    )
      fail(400, "Revisión inválida");
    const r = await pool.query(
      "UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2 AND ($3::int IS NULL OR revision<=$3) RETURNING id,read,revision",
      [req.params.id, u.id, revision ?? null],
    );
    if (!r.rowCount) {
      const exists = await pool.query(
        "SELECT id FROM notifications WHERE id=$1 AND user_id=$2",
        [req.params.id, u.id],
      );
      if (!exists.rowCount) fail(404, "Aviso no disponible");
      return { read: false };
    }
    return r.rows[0];
  }
  @Post("notifications/:id/dismiss") @HttpCode(200) async dismiss(
    @Req() req: any,
  ) {
    const u = auth(req),
      revision = req.body.revision;
    if (!Number.isSafeInteger(revision) || revision < 1)
      fail(400, "Revisión inválida");
    const result = await pool.query(
      "UPDATE notifications SET read=true,dismissed=true WHERE id=$1 AND user_id=$2 AND revision=$3 RETURNING id,revision,read,dismissed",
      [req.params.id, u.id, revision],
    );
    if (!result.rowCount) {
      if (
        !(
          await pool.query(
            "SELECT 1 FROM notifications WHERE id=$1 AND user_id=$2",
            [req.params.id, u.id],
          )
        ).rowCount
      )
        fail(404, "Aviso no disponible");
      fail(409, "El aviso cambió. Actualiza las notificaciones.");
    }
    await broadcast();
    return result.rows[0];
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
