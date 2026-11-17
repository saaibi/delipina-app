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
export class CustomersController {
  @Get("users")
  @HttpCode(200)
  async getUsers(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    auth(req, ["admin"]);
    return (
      await pool.query(
        "SELECT id,email,name,role,credit_limit,credit_used,active FROM users ORDER BY name",
      )
    ).rows;
  }
  @Post("users")
  @HttpCode(200)
  async postUsers(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    auth(req, ["admin"]);
    const b = req.body;
    if (!["admin", "courier", "client", "preparation"].includes(b.role))
      fail(400, "Rol inválido");
    return (
      await pool.query(
        "INSERT INTO users(id,email,name,role,credit_limit) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role",
        [
          randomUUID(),
          text(b.email, 200).toLowerCase(),
          text(b.name, 100),
          b.role,
          cents(b.creditLimit || 0),
        ],
      )
    ).rows[0];
  }
  @Patch("users/:id")
  @HttpCode(200)
  async patchUsersId(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = auth(req, ["admin"]);
    const b = req.body;
    return tx(async (c) => {
      const u = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!u) fail(404, "Usuario inexistente");
      if (u.id === admin.id && b.active === false)
        fail(409, "No puedes deshabilitar tu propia cuenta");
      const limit = cents(b.creditLimit);
      if (limit < Number(u.credit_used))
        fail(409, "El cupo no puede ser inferior al saldo reservado");
      await c.query("UPDATE users SET credit_limit=$2,active=$3 WHERE id=$1", [
        u.id,
        limit,
        b.active !== false,
      ]);
      if (b.active === false)
        await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
      return { ok: true };
    });
  }
  @Get("branches")
  @HttpCode(200)
  async getBranches(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "client"]);
    return (
      await pool.query("SELECT * FROM branches WHERE client_id=$1 OR $2", [
        u.id,
        u.role === "admin",
      ])
    ).rows;
  }
  @Post("branches")
  @HttpCode(200)
  async postBranches(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "client"]);
    const b = req.body;
    return (
      await pool.query("INSERT INTO branches VALUES($1,$2,$3,$4) RETURNING *", [
        randomUUID(),
        u.role === "client" ? u.id : b.clientId,
        text(b.address),
        b.city,
      ])
    ).rows[0];
  }
}
