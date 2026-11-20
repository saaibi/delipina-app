import { createDemoData } from "../demo-data.js";
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Req,
  HttpCode,
} from "@nestjs/common";
import { pool, tx, fail } from "../db.js";
import { auth, text, cents, broadcast } from "../domain.js";
import { customerId, isCustomer, hasModule, modules } from "../access.js";
import { randomUUID } from "node:crypto";
import { imagePayload } from "../images.js";
function page(q: any) {
  const p = Number(q.page ?? 0),
    size = Number(q.pageSize ?? 25);
  if (
    !Number.isInteger(p) ||
    p < 0 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100
  )
    fail(400, "Paginación inválida");
  return { p, size };
}
@Controller("api")
export class OperationsController {
  @Post("demo-data") @HttpCode(200) async demo(@Req() req: any) {
    const actor = auth(req, ["admin"]);
    const result = await createDemoData(
      actor,
      text(req.body.email, 200),
      req.body.courierId || undefined,
    );
    await broadcast();
    return result;
  }

  @Get("audit") @HttpCode(200) async audit(@Req() req: any) {
    const u = auth(req);
    if (!hasModule(u, "audit")) fail(403, "Sin permiso de trazabilidad");
    const { p, size } = page(req.query),
      q = "%" + String(req.query.q || "").slice(0, 200) + "%";
    const where =
      "WHERE (a.action ILIKE $1 OR COALESCE(u.name,'Sistema') ILIKE $1 OR a.order_id::text ILIKE $1)";
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT a.*,u.name AS actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT $2 OFFSET $3`,
        [q, size, p * size],
      ),
      pool.query(
        `SELECT count(*)::int total FROM audit a LEFT JOIN users u ON u.id=a.actor_id ${where}`,
        [q],
      ),
    ]);
    return {
      rows: rows.rows,
      total: count.rows[0].total,
      page: p,
      pageSize: size,
    };
  }
  @Get("client-members") @HttpCode(200) async members(@Req() req: any) {
    const u = auth(req);
    if (u.role !== "admin" && u.role !== "client")
      fail(403, "Solo el titular administra usuarios del cliente");
    const id = u.role === "admin" ? req.query.clientId : u.id;
    if (!id) return [];
    return (
      await pool.query(
        "SELECT id,name,email,active,can_view_portfolio,client_account_id FROM users WHERE role='client_member' AND client_account_id=$1 ORDER BY name",
        [id],
      )
    ).rows;
  }
  @Post("client-members") @HttpCode(200) async addMember(@Req() req: any) {
    const u = auth(req);
    if (!["admin", "client"].includes(u.role))
      fail(403, "Solo el titular administra usuarios");
    const b = req.body,
      owner = u.role === "admin" ? b.clientId : u.id;
    const result = await tx(async (c) => {
      if (
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND role='client' AND active FOR UPDATE",
            [owner],
          )
        ).rowCount
      )
        fail(400, "Cliente inválido");
      const email = text(b.email, 200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        fail(400, "Correo inválido");
      const r = (
        await c.query(
          "INSERT INTO users(id,name,email,role,client_account_id,can_view_portfolio) VALUES($1,$2,$3,'client_member',$4,$5) RETURNING id,name,email,active,can_view_portfolio",
          [
            randomUUID(),
            text(b.name, 100),
            email,
            owner,
            b.canViewPortfolio === true,
          ],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,'member-created','client',$2)",
        [u.id, owner],
      );
      return r;
    });
    await broadcast();
    return result;
  }
  @Patch("client-members/:id") @HttpCode(200) async editMember(
    @Req() req: any,
  ) {
    const u = auth(req);
    if (!["admin", "client"].includes(u.role))
      fail(403, "Solo el titular administra usuarios");
    await tx(async (c) => {
      const m = (
        await c.query(
          "SELECT * FROM users WHERE id=$1 AND role='client_member' FOR UPDATE",
          [req.params.id],
        )
      ).rows[0];
      if (!m || (u.role !== "admin" && m.client_account_id !== u.id))
        fail(404, "Usuario no disponible");
      const b = req.body;
      await c.query(
        "UPDATE users SET name=$2,active=$3,can_view_portfolio=$4 WHERE id=$1",
        [
          m.id,
          b.name === undefined ? m.name : text(b.name, 100),
          b.active === undefined ? m.active : b.active === true,
          b.canViewPortfolio === undefined
            ? m.can_view_portfolio
            : b.canViewPortfolio === true,
        ],
      );
      await c.query("DELETE FROM sessions WHERE user_id=$1", [m.id]);
      await c.query("DELETE FROM subscriptions WHERE user_id=$1", [m.id]);
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id,details) VALUES($1,'member-edited','user',$2,$3)",
        [
          u.id,
          m.id,
          { active: b.active, canViewPortfolio: b.canViewPortfolio },
        ],
      );
    });
    await broadcast();
    return { ok: true };
  }
  @Get("product-groups") @HttpCode(200) async groups(@Req() req: any) {
    auth(req);
    return (
      await pool.query(
        "SELECT g.*,count(p.id)::int AS variants FROM catalog_products g LEFT JOIN products p ON p.catalog_product_id=g.id GROUP BY g.id ORDER BY g.name",
      )
    ).rows;
  }
  @Patch("product-groups/:id") @HttpCode(200) async toggleGroup(
    @Req() req: any,
  ) {
    const u = auth(req, ["admin"]);
    await pool.query("UPDATE catalog_products SET active=$2 WHERE id=$1", [
      req.params.id,
      req.body.active === true,
    ]);
    await pool.query(
      "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,'catalog-availability','product',$2)",
      [u.id, req.params.id],
    );
    await broadcast();
    return { ok: true };
  }
  @Get("product-groups/:id") @HttpCode(200) async group(@Req() req: any) {
    auth(req, ["admin"]);
    const g = (
      await pool.query("SELECT * FROM catalog_products WHERE id=$1", [
        req.params.id,
      ])
    ).rows[0];
    if (!g) fail(404, "Producto no encontrado");
    return {
      ...g,
      variants: (
        await pool.query(
          "SELECT p.*,EXISTS(SELECT 1 FROM product_photos f WHERE f.product_id=p.id) has_image FROM products p WHERE catalog_product_id=$1 ORDER BY presentation,unit",
          [g.id],
        )
      ).rows,
    };
  }
  @Post("product-groups") @HttpCode(200) async createGroup(@Req() req: any) {
    return this.saveGroup(req);
  }
  @Put("product-groups/:id") @HttpCode(200) async updateGroup(@Req() req: any) {
    return this.saveGroup(req);
  }
  async saveGroup(req: any) {
    const u = auth(req, ["admin"]),
      b = req.body;
    const presentations = b.presentations;
    if (
      !Array.isArray(presentations) ||
      !presentations.length ||
      presentations.length > 100
    )
      fail(400, "Agrega presentaciones");
    const id = req.params.id || randomUUID();
    await tx(async (c) => {
      if (req.params.id) {
        if (
          !(
            await c.query(
              "SELECT id FROM catalog_products WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rowCount
        )
          fail(404, "Producto no encontrado");
        await c.query(
          "UPDATE catalog_products SET name=$2,active=$3 WHERE id=$1",
          [id, text(b.name, 100), b.active !== false],
        );
      } else
        await c.query("INSERT INTO catalog_products VALUES($1,$2,$3)", [
          id,
          text(b.name, 100),
          b.active !== false,
        ]);
      const kept = [];
      const combos = new Set();
      for (const p of presentations) {
        const label = text(p.label, 100);
        if (!Array.isArray(p.units) || !p.units.length)
          fail(400, "Cada presentación necesita una medida");
        const template = (
          await c.query(
            "SELECT p.* FROM products p WHERE catalog_product_id=$1 AND (presentation=$2 OR id=ANY($3::uuid[])) ORDER BY EXISTS(SELECT 1 FROM product_photos f WHERE f.product_id=p.id) DESC LIMIT 1",
            [id, label, p.units.map((v) => v.id).filter(Boolean)],
          )
        ).rows[0];
        for (const v of p.units) {
          if (typeof v.unit === "string") v.unit = v.unit.trim();
          if (
            typeof v.unit !== "string" ||
            !v.unit.trim() ||
            v.unit.length > 40 ||
            combos.has(label.toLowerCase() + "|" + v.unit.toLowerCase())
          )
            fail(400, "Medida duplicada o inválida");
          combos.add(label.toLowerCase() + "|" + v.unit.toLowerCase());
          const old = v.id
            ? (
                await c.query(
                  "SELECT * FROM products WHERE id=$1 AND catalog_product_id=$2",
                  [v.id, id],
                )
              ).rows[0]
            : null;
          if (v.id && !old) fail(400, "Presentación ajena al producto");
          const vid = old?.id || randomUUID();
          await c.query(
            "INSERT INTO products(id,name,presentation,unit,price,active,image_key,catalog_product_id,allows_fraction) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=excluded.name,presentation=excluded.presentation,unit=excluded.unit,price=excluded.price,active=excluded.active,allows_fraction=excluded.allows_fraction",
            [
              vid,
              text(b.name, 100),
              label,
              v.unit,
              cents(v.price),
              v.active !== false,
              old?.image_key || template?.image_key || null,
              id,
              v.fractional ??
                old?.allows_fraction ??
                ["kg", "lb", "arroba"].includes(v.unit),
            ],
          );
          if (p.image) {
            const { mime, data } = imagePayload(p.image);
            await c.query(
              "INSERT INTO product_photos VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET mime=excluded.mime,data=excluded.data",
              [vid, mime, data],
            );
            await c.query(
              "UPDATE products SET image_updated_at=clock_timestamp() WHERE id=$1",
              [vid],
            );
          }
          if (!p.image && !old && template) {
            await c.query(
              "INSERT INTO product_photos SELECT $1,mime,data FROM product_photos WHERE product_id=$2 ON CONFLICT(product_id) DO NOTHING",
              [vid, template.id],
            );
            await c.query(
              "UPDATE products SET image_updated_at=(SELECT image_updated_at FROM products WHERE id=$2) WHERE id=$1",
              [vid, template.id],
            );
          }
          kept.push(vid);
        }
      }
      await c.query(
        "UPDATE products SET active=false WHERE catalog_product_id=$1 AND NOT(id=ANY($2::uuid[]))",
        [id, kept],
      );
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,'catalog-saved','product',$2)",
        [u.id, id],
      );
    });
    await broadcast();
    return { id };
  }
}
