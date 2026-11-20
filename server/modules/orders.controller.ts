import { saveOrderSchedule } from "../recurrence.js";
import { customerId, isCustomer, hasModule, metropolitan } from "../access.js";
import {
  assertBusinessDateOpen,
  validateDeliveryWindow,
  operatingDate,
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
export class OrdersController {
  @Get("orders")
  @HttpCode(200)
  async getOrders(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const u = auth(req);
    if (
      u.role === "custom" &&
      !hasModule(u, "orders") &&
      !hasModule(u, "plant")
    )
      fail(403, "Módulo no autorizado");
    const rows = (
      await pool.query(
        `SELECT o.*,b.address,b.city,b.lat,b.lng,u.name AS client_name,(SELECT json_agg(i) FROM items i WHERE i.order_id=o.id) AS items FROM orders o JOIN branches b ON b.id=o.branch_id JOIN users u ON u.id=o.client_id ORDER BY o.created_at`,
      )
    ).rows.filter((o) => orderVisible(u, o));
    return rows.map((o) => {
      if (
        u.role === "preparation" ||
        (u.role === "custom" && !hasModule(u, "orders"))
      ) {
        const { id, status, window_start, window_end, notes, created_at } = o;
        return {
          id,
          status,
          window_start,
          window_end,
          notes,
          created_at,
          items: o.items.map(({ name, quantity }) => ({ name, quantity })),
        };
      }
      if (isCustomer(u)) {
        delete o.courier_id;
        delete o.delivered_by;
      }
      return o;
    });
  }
  @Get("orders/:id")
  @HttpCode(200)
  async getOrder(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const orders = await this.getOrders(req, res);
    const order = orders.find((o) => o.id === req.params.id);
    if (!order) fail(404, "Pedido no disponible");
    return order;
  }
  @Post("orders")
  @HttpCode(200)
  async postOrders(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const u = auth(req, ["admin", "client", "plant_admin"]);
    const b = req.body;
    const key = req.get("Idempotency-Key");
    if (!key || key.length > 100) fail(400, "Falta clave de sincronización");
    const hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
    const result = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [u.id + key]);
      const previous = (
        await c.query("SELECT * FROM idempotency WHERE user_id=$1 AND key=$2", [
          u.id,
          key,
        ])
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== hash)
          fail(409, "Clave reutilizada con datos distintos");
        return previous.response;
      }
      const clientId = isCustomer(u) ? customerId(u) : b.clientId;
      const client = (
        await c.query(
          "SELECT * FROM users WHERE id=$1 AND role='client' AND active FOR UPDATE",
          [clientId],
        )
      ).rows[0];
      if (!client) fail(400, "Cliente inválido");
      const branch = (
        await c.query("SELECT * FROM branches WHERE id=$1 AND client_id=$2", [
          b.branchId,
          clientId,
        ])
      ).rows[0];
      if (!branch) fail(400, "Sucursal inválida");
      const { start, end, day } = await validateDeliveryWindow(
        c,
        b.start,
        b.end,
        isCustomer(u) && !req.recurring,
      );
      const paymentMethod = b.credit
        ? "credit"
        : b.paymentMethod || (metropolitan(branch.city) ? "cash" : "online");
      if (
        !["cash", "online", "credit"].includes(paymentMethod) ||
        (paymentMethod === "cash" && !metropolitan(branch.city))
      )
        fail(400, "Fuera del área metropolitana el pago debe ser electrónico");
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100)
        fail(400, "Agrega productos");
      let total = 0;
      const items = [];
      for (const item of b.items) {
        const p = (
          await c.query(
            "SELECT p.*,g.name AS product_name,COALESCE(s.price,p.price) AS actual_price FROM products p LEFT JOIN catalog_products g ON g.id=p.catalog_product_id LEFT JOIN prices s ON s.product_id=p.id AND s.client_id=$2 WHERE p.id=$1 AND p.active AND NOT EXISTS(SELECT 1 FROM catalog_products g WHERE g.id=p.catalog_product_id AND NOT g.active)",
            [item.productId, clientId],
          )
        ).rows[0];
        const q = Number(item.quantity);
        if (
          !p ||
          !Number.isFinite(q) ||
          q <= 0 ||
          q > 10000 ||
          Math.abs(q * 1000 - Math.round(q * 1000)) > 0.000001 ||
          (p.unit === "pack" && !Number.isInteger(q))
        )
          fail(400, "Cantidad o producto inválido");
        const price = Number(p.actual_price);
        total += Math.round(price * q);
        items.push({ p, q, price });
      }
      if (!Number.isSafeInteger(total)) fail(400, "Total inválido");
      if (b.credit && Number(client.credit_limit) === 0)
        fail(409, "Crédito no autorizado");
      const status =
        u.role === "admin" && !req.recurring ? "confirmed" : "pending";
      if (status === "confirmed" && b.credit) {
        if (Number(client.credit_used) + total > Number(client.credit_limit))
          fail(409, "Cupo insuficiente");
        await c.query(
          "UPDATE users SET credit_used=credit_used+$2 WHERE id=$1",
          [clientId, total],
        );
      }
      const o = (
        await c.query(
          "INSERT INTO orders(id,client_id,branch_id,status,window_start,window_end,total,credit,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            randomUUID(),
            clientId,
            branch.id,
            status,
            start,
            end,
            total,
            !!b.credit,
            typeof b.notes === "string" ? b.notes.slice(0, 1000) : "",
          ],
        )
      ).rows[0];
      await c.query(
        "UPDATE orders SET operation_day=$2,payment_method=$3 WHERE id=$1",
        [o.id, day, paymentMethod],
      );
      for (const { p, q, price } of items)
        await c.query("INSERT INTO items VALUES($1,$2,$3,$4,$5)", [
          o.id,
          p.id,
          `${p.product_name||p.name} · ${p.presentation} (${p.unit === "kg" ? "kg" : p.unit === "lb" ? "libra" : p.unit === "arroba" ? "arroba" : "empaque"})`,
          q,
          price,
        ]);
      if (status === "confirmed") await createInvoice(c, o);
      await c.query(
        "INSERT INTO audit(order_id,actor_id,action,next_status) VALUES($1,$2,$3,$4)",
        [o.id, u.id, "created", status],
      );
      if (!req.recurring) await saveOrderSchedule(c, u, o, b.recurrence, b);
      await notify(c, o, "Nuevo pedido", ["admin", "courier", "preparation"]);
      await c.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
        u.id,
        key,
        hash,
        o,
      ]);
      return o;
    });
    await broadcast();
    return result;
  }
  @Post("orders/:id/action")
  @HttpCode(200)
  async postOrdersIdAction(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req),
      b = req.body;
    const result = await tx(async (c) => {
      const o = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!o || !orderVisible(u, o)) fail(404, "Pedido no disponible");
      const admin = u.role === "admin";
      let status = o.status;
      if (b.action === "take") {
        if (
          u.role !== "courier" ||
          o.courier_id ||
          !["confirmed", "preparing", "ready"].includes(status)
        )
          fail(409, "Pedido no disponible para tomar");
        await c.query("UPDATE orders SET courier_id=$2 WHERE id=$1", [
          o.id,
          u.id,
        ]);
        await notify(c, o, "Mensajero tomó un pedido", ["admin"]);
      } else if (b.action === "assign") {
        if (!admin) fail(403, "Solo administración");
        if (!["confirmed", "preparing", "ready", "enroute"].includes(status))
          fail(409, "Estado no asignable");
        const courier = (
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND role='courier' AND active",
            [b.courierId],
          )
        ).rows[0];
        if (!courier) fail(400, "Mensajero inválido");
        await c.query("UPDATE orders SET courier_id=$2 WHERE id=$1", [
          o.id,
          b.courierId,
        ]);
      } else if (b.action === "reschedule") {
        if (!admin || ["delivered", "cancelled", "rejected"].includes(status))
          fail(403, "No se puede reprogramar");
        const next = await validateDeliveryWindow(c, b.start, b.end);
        status = o.status === "pending" ? "pending" : "confirmed";
        await c.query(
          "UPDATE orders SET window_start=$2,window_end=$3,status=$4,courier_id=NULL,reason=NULL WHERE id=$1",
          [o.id, next.start, next.end, status],
        );
        await notify(c, o, "Pedido reprogramado", [
          "client",
          "courier",
          "preparation",
        ]);
      } else if (b.action === "request_cancel") {
        if (
          !isCustomer(u) ||
          ["delivered", "cancelled", "rejected"].includes(status)
        )
          fail(409, "No se puede solicitar");
        await c.query("UPDATE orders SET cancel_requested=true WHERE id=$1", [
          o.id,
        ]);
        await notify(c, o, "Solicitud de cancelación", ["admin"]);
      } else if (b.action === "deny_cancel") {
        if (!admin || !o.cancel_requested) fail(403, "No disponible");
        await c.query("UPDATE orders SET cancel_requested=false WHERE id=$1", [
          o.id,
        ]);
      } else if (b.action === "failed") {
        if (
          u.role !== "courier" ||
          o.courier_id !== u.id ||
          status !== "enroute"
        )
          fail(403, "No disponible");
        await c.query("UPDATE orders SET reason=$2 WHERE id=$1", [
          o.id,
          text(b.reason),
        ]);
        await notify(c, o, "Entrega fallida: requiere revisión", ["admin"]);
      } else {
        const transitions = {
          confirm: ["pending", "confirmed"],
          reject: ["pending", "rejected"],
          prepare: ["confirmed", "preparing"],
          ready: ["preparing", "ready"],
          depart: ["ready", "enroute"],
          deliver: ["enroute", "delivered"],
        };
        if (b.action === "cancel") {
          if (!admin || ["delivered", "cancelled", "rejected"].includes(status))
            fail(403, "Cancelación no permitida");
          status = "cancelled";
        } else {
          const t = transitions[b.action];
          if (!t || t[0] !== status) fail(409, "Transición no válida");
          if (["confirm", "reject"].includes(b.action) && !admin)
            fail(403, "Solo administración");
          if (
            ["prepare", "ready"].includes(b.action) &&
            !admin &&
            !["preparation", "plant_admin"].includes(u.role) &&
            !hasModule(u, "plant")
          )
            fail(403, "Solo planta");
          if (
            ["depart", "deliver"].includes(b.action) &&
            !admin &&
            !(u.role === "courier" && o.courier_id === u.id)
          )
            fail(403, "Solo mensajero asignado");
          if (["depart", "deliver"].includes(b.action) && !o.courier_id)
            fail(409, "Asigna un mensajero");
          status = t[1];
        }
        if (status === "confirmed") {
          if (o.credit) {
            const client = (
              await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
                o.client_id,
              ])
            ).rows[0];
            if (
              Number(client.credit_used) + Number(o.total) >
              Number(client.credit_limit)
            )
              fail(409, "Cupo insuficiente");
            await c.query(
              "UPDATE users SET credit_used=credit_used+$2 WHERE id=$1",
              [o.client_id, o.total],
            );
          }
          await createInvoice(c, o);
        }
        if (status === "cancelled" && o.status !== "pending") {
          const inv = (
            await c.query(
              "SELECT * FROM invoices WHERE order_id=$1 FOR UPDATE",
              [o.id],
            )
          ).rows[0];
          if (inv && Number(inv.balance) !== Number(inv.total))
            fail(
              409,
              "Pedido con abonos: requiere conciliación antes de cancelar",
            );
          if (o.credit)
            await c.query(
              "UPDATE users SET credit_used=credit_used-$2 WHERE id=$1",
              [o.client_id, o.total],
            );
          await c.query("DELETE FROM invoices WHERE order_id=$1", [o.id]);
        }
        if (status === "delivered")
          await c.query("UPDATE orders SET sale_day=$2 WHERE id=$1", [
            o.id,
            o.operation_day || (await operatingDate(c)),
          ]);
        await c.query(
          "UPDATE orders SET status=$2,reason=$3,delivered_by=CASE WHEN $2='delivered' THEN courier_id ELSE delivered_by END,delivered_at=CASE WHEN $2='delivered' THEN clock_timestamp() ELSE delivered_at END WHERE id=$1",
          [o.id, status, b.reason || null],
        );
        await notify(
          c,
          o,
          `Pedido: ${status}`,
          ["preparing", "enroute", "delivered"].includes(status)
            ? ["client"]
            : ["courier", "preparation"],
        );
      }
      await c.query(
        "INSERT INTO audit(order_id,actor_id,action,next_status) VALUES($1,$2,$3,$4)",
        [o.id, u.id, b.action, status],
      );
      return { ok: true };
    });
    await broadcast();
    return result;
  }
  @Post("location")
  @HttpCode(200)
  async postLocation(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["courier"]);
    const { lat, lng } = req.body;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      fail(400, "Coordenadas inválidas");
    if (
      !(
        await pool.query(
          "SELECT 1 FROM orders WHERE courier_id=$1 AND status='enroute'",
          [u.id],
        )
      ).rowCount
    )
      fail(409, "No hay entregas en recorrido");
    await pool.query(
      "INSERT INTO locations VALUES($1,$2,$3,now()) ON CONFLICT(courier_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=now()",
      [u.id, Math.round(lat * 100) / 100, Math.round(lng * 100) / 100],
    );
    await broadcast();
    return { ok: true };
  }
  @Delete("location")
  @HttpCode(200)
  async deleteLocation(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["courier"]);
    await pool.query("DELETE FROM locations WHERE courier_id=$1", [u.id]);
    return { ok: true };
  }
  @Get("orders/:id/tracking")
  @HttpCode(200)
  async getOrdersIdTracking(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req);
    const o = (
      await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id])
    ).rows[0];
    if (
      !o ||
      (u.role !== "admin" &&
        !(isCustomer(u) && o.client_id === customerId(u)) &&
        !(u.role === "courier" && o.courier_id === u.id))
    )
      fail(404, "Pedido no disponible");
    if (o.status !== "enroute") return { active: false };
    const loc = (
      await pool.query(
        "SELECT lat,lng,updated_at FROM locations WHERE courier_id=$1",
        [o.courier_id],
      )
    ).rows[0];
    return {
      active: true,
      location: loc || null,
      signalLost: !loc || Date.now() - +new Date(loc.updated_at) > 120000,
      eta: null,
    };
  }
}
