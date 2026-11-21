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
export class AuthController {
  @Get("config")
  @HttpCode(200)
  async getConfig(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return {
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      devAuth: !production && process.env.DEV_AUTH === "true",
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    };
  }
  @Post("auth/dev")
  @HttpCode(200)
  async postAuthDev(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (production || process.env.DEV_AUTH !== "true")
      fail(404, "No disponible");
    const u = (
      await pool.query("SELECT * FROM users WHERE email=$1 AND active", [
        req.body.email,
      ])
    ).rows[0];
    if (!u) fail(401, "Usuario demo inexistente");
    return login(res, u);
  }
  @Post("auth/google")
  @HttpCode(200)
  async postAuthGoogle(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!process.env.GOOGLE_CLIENT_ID) fail(503, "Google aún no configurado");
    const ticket = await new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
    ).verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p.email_verified || !p.sub) fail(401, "Correo no verificado");
    const email = p.email.toLowerCase();
    const u = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
      let u = (
        await c.query(
          "SELECT * FROM users WHERE google_sub=$1 OR email=$2 FOR UPDATE",
          [p.sub, email],
        )
      ).rows[0];
      if (u) {
        if (!u.active || (u.google_sub && u.google_sub !== p.sub))
          fail(403, "Cuenta no disponible");
        if (!u.google_sub) {
          if (!email.endsWith("@gmail.com") && !p.hd)
            fail(
              403,
              "Vinculación de correo externo requiere revisión administrativa",
            );
          await c.query("UPDATE users SET google_sub=$1 WHERE id=$2", [
            p.sub,
            u.id,
          ]);
        }
      } else {
        u = (
          await c.query(
            "INSERT INTO users(id,email,name,role,google_sub) VALUES($1,$2,$3,'client',$4) RETURNING *",
            [randomUUID(), email, p.name || email, p.sub],
          )
        ).rows[0];
      }
      let avatar = null;
      if (typeof p.picture === "string" && p.picture.length < 2000) {
        try {
          const url = new URL(p.picture);
          if (
            url.protocol === "https:" &&
            (url.hostname === "googleusercontent.com" ||
              url.hostname.endsWith(".googleusercontent.com"))
          )
            avatar = url.href;
        } catch {}
      }
      u = (
        await c.query(
          "UPDATE users SET avatar_url=COALESCE($2,avatar_url) WHERE id=$1 RETURNING *",
          [u.id, avatar],
        )
      ).rows[0];
      return u;
    });
    if (
      u.role === "client_member" &&
      !(
        await pool.query(
          "SELECT id FROM users WHERE id=$1 AND role='client' AND active",
          [u.client_account_id],
        )
      ).rowCount
    )
      fail(403, "Cliente no disponible");
    return login(res, u);
  }
  @Post("logout")
  @HttpCode(200)
  async postLogout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await pool.query("DELETE FROM sessions WHERE token=$1", [
      req.cookies.session,
    ]);
    res.clearCookie("session");
    return { ok: true };
  }
  @Get("me")
  @HttpCode(200)
  async getMe(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return safeUser(auth(req));
  }
}
