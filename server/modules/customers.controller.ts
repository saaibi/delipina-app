import { customerId, isCustomer, hasModule, modules } from "../access.js";
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
    const actor = auth(req, ["admin", "plant_admin"]);
    if (actor.role === "plant_admin" || actor.role === "custom")
      return (
        await pool.query(
          "SELECT id,name,role FROM users WHERE role='client' AND active AND deleted_at IS NULL ORDER BY name",
        )
      ).rows;
    return (
      await pool.query(
        "SELECT id,email,name,role,permissions,client_account_id,credit_limit,credit_used,active,deleted_at FROM users ORDER BY name",
      )
    ).rows;
  }
  @Post("users")
  @HttpCode(200)
  async postUsers(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    auth(req, ["admin"]);
    const b = req.body;
    if (
      ![
        "admin",
        "courier",
        "client",
        "preparation",
        "plant_admin",
        "custom",
      ].includes(b.role)
    )
      fail(400, "Rol inválido");
    return (
      await pool.query(
        "INSERT INTO users(id,email,name,role,credit_limit,permissions) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,name,role,permissions",
        [
          randomUUID(),
          text(b.email, 200).toLowerCase(),
          text(b.name, 100),
          b.role,
          b.role === "client" ? cents(b.creditLimit || 0) : 0,
          JSON.stringify(
            b.role === "custom"
              ? validatePermissions(b.permissions ?? ["orders", "plant"])
              : [],
          ),
        ],
      )
    ).rows[0];
  }
  @Patch("users/:id") @HttpCode(200) async patchUsersId(@Req() req: any) {
    return this.updateUser(req, false);
  }
  @Delete("users/:id") @HttpCode(200) async deleteUsersId(@Req() req: any) {
    return this.updateUser(req, true);
  }
  private async updateUser(req: any, deleting: boolean) {
    const admin = auth(req, ["admin"]);
    const b = deleting ? { active: false } : req.body;
    return tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('delipina:users'))");
      const u = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!u) fail(404, "Usuario inexistente");
      const name = b.name === undefined ? u.name : text(b.name, 100),
        email =
          b.email === undefined ? u.email : text(b.email, 200).toLowerCase(),
        role = b.role === undefined ? u.role : b.role,
        active = b.active === undefined ? u.active : b.active === true;
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        ![
          "admin",
          "courier",
          "client",
          "preparation",
          "plant_admin",
          "custom",
        ].includes(role)
      )
        fail(400, "Correo o rol inválido");
      if (u.id === admin.id && (!active || role !== "admin"))
        fail(
          409,
          "No puedes eliminar o retirar tu propio acceso administrativo",
        );
      if (u.deleted_at && active && !b.restore)
        fail(409, "Restaura explícitamente el usuario eliminado");
      if (
        u.role === "admin" &&
        u.active &&
        (!active || role !== "admin") &&
        Number(
          (
            await c.query(
              "SELECT count(*) AS n FROM users WHERE role='admin' AND active",
            )
          ).rows[0].n,
        ) <= 1
      )
        fail(409, "Debe conservarse un administrador activo");
      if (!active || role !== u.role) {
        const pending = (
          await c.query(
            "SELECT 1 FROM orders WHERE (client_id=$1 OR courier_id=$1) AND status NOT IN ('delivered','rejected','cancelled') LIMIT 1",
            [u.id],
          )
        ).rowCount;
        if (pending)
          fail(
            409,
            "Completa, cancela o reasigna sus pedidos activos antes de cambiar el acceso",
          );
        if (
          role !== u.role &&
          u.role === "client" &&
          (Number(u.credit_used) > 0 ||
            (
              await c.query(
                "SELECT 1 FROM invoices WHERE client_id=$1 AND balance>0 LIMIT 1",
                [u.id],
              )
            ).rowCount)
        )
          fail(
            409,
            "El cliente tiene saldos pendientes y debe conservar su rol",
          );
      }
      if (u.role === "courier" && (!active || role !== u.role)) {
        const unsettled = (
          await c.query(
            `SELECT 1 FROM business_days d
          WHERE d.closed_at IS NULL AND EXISTS (
            SELECT 1 FROM orders o WHERE o.operation_day=d.day AND (o.courier_id=$1 OR o.delivered_by=$1)
            UNION ALL SELECT 1 FROM payments p WHERE p.business_day=d.day AND p.receiver_id=$1
          ) AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.day=d.day AND s.courier_id=$1 AND s.status='confirmed') LIMIT 1`,
            [u.id],
          )
        ).rowCount;
        if (unsettled)
          fail(
            409,
            "Confirma sus cuadres pendientes antes de cambiar el acceso del mensajero",
          );
      }
      const limit =
        role === "client"
          ? cents(
              b.creditLimit === undefined
                ? Number(u.credit_limit)
                : b.creditLimit,
            )
          : 0;
      if (limit < Number(u.credit_used))
        fail(409, "El cupo no puede ser inferior al saldo reservado");
      const permissions =
        role === "custom"
          ? validatePermissions(
              b.permissions ?? u.permissions ?? ["orders", "plant"],
            )
          : [];
      const changedIdentity =
        email !== u.email ||
        role !== u.role ||
        JSON.stringify(permissions) !== JSON.stringify(u.permissions);
      await c.query("UPDATE users SET permissions=$2 WHERE id=$1", [
        u.id,
        JSON.stringify(permissions),
      ]);
      await c.query(
        "UPDATE users SET name=$2,email=$3,role=$4,credit_limit=$5,active=$6,google_sub=CASE WHEN email<>$3 THEN NULL ELSE google_sub END,deleted_at=CASE WHEN $7 THEN now() WHEN $8 THEN NULL ELSE deleted_at END WHERE id=$1",
        [u.id, name, email, role, limit, active, deleting, !!b.restore],
      );
      if (!active || changedIdentity) {
        await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await c.query("DELETE FROM subscriptions WHERE user_id=$1", [u.id]);
      }
      await c.query("INSERT INTO audit(actor_id,action) VALUES($1,$2)", [
        admin.id,
        "user:" + u.id + ":" + (deleting ? "deleted" : "edited"),
      ]);
      return { ok: true };
    });
  }
  @Get("branches")
  @HttpCode(200)
  async getBranches(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "client", "plant_admin"]);
    return (
      await pool.query("SELECT * FROM branches WHERE client_id=$1 OR $2", [
        customerId(u),
        !isCustomer(u),
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
        isCustomer(u) ? customerId(u) : b.clientId,
        text(b.address),
        text(b.city, 100),
      ])
    ).rows[0];
  }
}

function validatePermissions(value: any) {
  if (!Array.isArray(value) || value.some((p) => !modules.includes(p)))
    fail(400, "Permisos inválidos");
  return [...new Set(value)];
}
