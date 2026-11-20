import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Req,
  HttpCode,
} from "@nestjs/common";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { pool, fail, tx } from "../db.js";
import { auth } from "../domain.js";
import { fcmConfigured } from "../native-push.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const limits = new Map<string, { until: number; count: number }>();
@Controller("api/native-push")
export class NativePushController {
  @Post("pair") @HttpCode(200) async pair(@Req() req: any) {
    if (!fcmConfigured())
      fail(503, "Notificaciones Android pendientes de configurar");
    const ip = req.ip || "unknown",
      now = Date.now(),
      rate = limits.get(ip);
    if (!rate || rate.until < now)
      limits.set(ip, { until: now + 60000, count: 1 });
    else if (++rate.count > 10) fail(429, "Intenta vincular en un minuto");
    if (limits.size > 1000)
      for (const [key, v] of limits) if (v.until < now) limits.delete(key);
    const { token, deviceKey } = req.body;
    if (
      typeof token !== "string" ||
      token.length < 30 ||
      token.length > 4096 ||
      typeof deviceKey !== "string" ||
      !/^[a-f0-9]{64}$/.test(deviceKey)
    )
      fail(400, "Dispositivo inválido");
    await pool.query(
      "DELETE FROM native_push_devices WHERE user_id IS NULL AND expires_at<now()",
    );
    const code = randomBytes(32).toString("hex"),
      hash = digest(deviceKey);
    const row = (
      await pool.query(
        `INSERT INTO native_push_devices(id,device_hash,token,pair_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(device_hash) DO UPDATE SET token=excluded.token,pair_hash=excluded.pair_hash,expires_at=excluded.expires_at,updated_at=now() RETURNING id`,
        [randomUUID(), hash, token, digest(code)],
      )
    ).rows[0];
    return {
      code,
      deviceId: row.id,
      verification: code.slice(-4).toUpperCase(),
    };
  }
  @Post("claim") @HttpCode(200) async claim(@Req() req: any) {
    const u = auth(req);
    const code = req.body.code;
    if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code))
      fail(400, "Vinculación inválida");
    return tx(async (c) => {
      const r = await c.query(
        "UPDATE native_push_devices SET user_id=$1,enabled=true,pair_hash=NULL,expires_at=NULL,updated_at=now() WHERE pair_hash=$2 AND expires_at>now() RETURNING id",
        [u.id, digest(code)],
      );
      if (!r.rowCount)
        fail(409, "La vinculación expiró. Abre nuevamente la app Android.");
      return { id: r.rows[0].id };
    });
  }
  @Get("device") async get(@Req() req: any) {
    const u = auth(req);
    if (!/^[a-f0-9-]{36}$/.test(req.query.id || ""))
      return { id: null, enabled: false };
    return (
      (
        await pool.query(
          "SELECT id,enabled FROM native_push_devices WHERE id=$1 AND user_id=$2",
          [req.query.id, u.id],
        )
      ).rows[0] || { id: null, enabled: false }
    );
  }
  @Put("device") @HttpCode(200) async update(@Req() req: any) {
    const u = auth(req);
    if (!/^[a-f0-9-]{36}$/.test(req.body.id || ""))
      fail(400, "Dispositivo inválido");
    const r = await pool.query(
      "UPDATE native_push_devices SET enabled=$3 WHERE id=$1 AND user_id=$2",
      [req.body.id, u.id, req.body.enabled === true],
    );
    if (!r.rowCount) fail(404, "Dispositivo no vinculado");
    return { ok: true };
  }
}
