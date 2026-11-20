import { customerId, isCustomer, metropolitan } from "../access.js";
import { notifyEvent } from "../notification-store.js";
import {
  assertBusinessDateOpen,
  operatingDate,
  accountingDate,
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
export class PaymentsController {
  @Get("invoices")
  @HttpCode(200)
  async getInvoices(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "courier", "client"]);
    return (
      await pool.query(
        "SELECT i.*,u.name AS client_name FROM invoices i JOIN users u ON u.id=i.client_id JOIN orders o ON o.id=i.order_id WHERE (i.client_id=$1 OR $2) AND ($3<>'courier' OR o.courier_id=$4 OR o.delivered_by=$4)",
        [customerId(u), !isCustomer(u), u.role, u.id],
      )
    ).rows;
  }
  @Patch("invoices/:id")
  @HttpCode(200)
  async patchInvoicesId(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    await pool.query("UPDATE invoices SET number=$2,photo_url=$3 WHERE id=$1", [
      req.params.id,
      text(req.body.number, 100),
      req.body.photoUrl || null,
    ]);
    return { ok: true };
  }
  @Post("payments")
  @HttpCode(200)
  async postPayments(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "courier"]),
      b = req.body;
    const key = req.get("Idempotency-Key");
    if (!key) fail(400, "Falta clave");
    const hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
    const r = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [u.id + key]);
      const prev = (
        await c.query("SELECT * FROM idempotency WHERE user_id=$1 AND key=$2", [
          u.id,
          key,
        ])
      ).rows[0];
      if (prev) {
        if (prev.request_hash !== hash) fail(409, "Clave reutilizada");
        return prev.response;
      }
      let receiptDay: string;
      if (
        !["cash", "nequi", "bancolombia"].includes(b.method) ||
        !cents(b.amount)
      )
        fail(400, "Medio o importe inválido");
      // Serialize receipts with submission/confirmation for this courier.
      if (u.role === "courier") await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
      const owner = (
        await c.query(
          "SELECT id FROM users WHERE id=$1 AND role='client' FOR UPDATE",
          [b.clientId],
        )
      ).rows[0];
      if (!owner) fail(400, "Cliente inválido");
      receiptDay = await accountingDate(c, u.id);
      if (
        u.role === "courier" &&
        (
          await c.query(
            "SELECT id FROM settlements WHERE courier_id=$1 AND day=$2 AND status='confirmed'",
            [u.id, receiptDay],
          )
        ).rowCount
      )
        fail(
          409,
          "Tu cuadre ya fue confirmado; solicita revisión administrativa",
        );
      if (!Array.isArray(b.allocations)) {
        const invoices = (
          await c.query(
            "SELECT i.*,COALESCE((SELECT sum(a.amount) FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND NOT p.verified),0) AS pending FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.client_id=$1 AND i.balance>0 AND ($2<>'courier' OR o.courier_id=$3 OR o.delivered_by=$3) ORDER BY o.created_at,i.id FOR UPDATE OF i",
            [b.clientId, u.role, u.id],
          )
        ).rows;
        let remaining = b.amount;
        b.allocations = [];
        for (const inv of invoices) {
          const amount = Math.min(
            remaining,
            Number(inv.balance) - Number(inv.pending),
          );
          if (amount > 0) {
            b.allocations.push({ invoiceId: inv.id, amount });
            remaining -= amount;
          }
          if (!remaining) break;
        }
        if (remaining > 0)
          fail(409, "El abono supera el saldo disponible del cliente");
      }
      if (
        !b.allocations.length ||
        new Set(b.allocations.map((a) => a.invoiceId)).size !==
          b.allocations.length ||
        b.allocations.reduce((sum, a) => sum + cents(a.amount), 0) !== b.amount
      )
        fail(400, "El abono debe coincidir con lo recibido");
      const id = randomUUID();
      await c.query(
        "INSERT INTO payments(id,client_id,receiver_id,method,amount,verified,created_at,business_day,verified_at,verified_day) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp(),$7,CASE WHEN $6 THEN clock_timestamp() END,CASE WHEN $6 THEN $7::date END)",
        [
          id,
          b.clientId,
          u.id,
          b.method,
          b.amount,
          b.method === "cash",
          receiptDay,
        ],
      );
      for (const a of [...b.allocations].sort((a, b) =>
        a.invoiceId.localeCompare(b.invoiceId),
      )) {
        const inv = (
          await c.query(
            "SELECT i.*,o.courier_id,o.delivered_by,b.city FROM invoices i JOIN orders o ON o.id=i.order_id JOIN branches b ON b.id=o.branch_id WHERE i.id=$1 AND i.client_id=$2 FOR UPDATE OF i",
            [a.invoiceId, b.clientId],
          )
        ).rows[0];
        if (
          inv &&
          u.role === "courier" &&
          inv.courier_id !== u.id &&
          inv.delivered_by !== u.id
        )
          fail(403, "Solo puedes cobrar tus pedidos asignados");
        if (inv && b.method === "cash" && !metropolitan(inv.city))
          fail(400, "Fuera del área metropolitana no se permite efectivo");
        const pending = Number(
          (
            await c.query(
              "SELECT COALESCE(sum(a.amount),0) AS n FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=$1 AND NOT p.verified",
              [a.invoiceId],
            )
          ).rows[0].n,
        );
        if (!inv || a.amount <= 0 || a.amount > Number(inv.balance) - pending)
          fail(409, "Abono supera saldo disponible");
        await c.query("INSERT INTO allocations VALUES($1,$2,$3)", [
          id,
          a.invoiceId,
          a.amount,
        ]);
        if (b.method === "cash") await applyAllocation(c, inv, a.amount);
      }
      await notifyEvent(c, ["admin"], [b.clientId, u.id], {
        key: "payment:" + id,
        module: "credits",
        targetId: b.clientId,
        title:
          b.method === "cash"
            ? "Abono recibido"
            : "Transferencia pendiente de verificación",
        status: b.method === "cash" ? "verified" : "pending",
      });
      const r = {
        id,
        businessDay: receiptDay,
        appliedOrders: b.allocations.length,
      };
      await c.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
        u.id,
        key,
        hash,
        r,
      ]);
      return r;
    });
    await broadcast();
    return r;
  }
  @Post("invoices/:id/photo")
  @HttpCode(200)
  async postInvoicesIdPhoto(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    const data = Buffer.from(req.body.data || "", "base64");
    const png = data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
      jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    if (data.length > 1500000 || (!png && !jpg))
      fail(400, "Usa PNG o JPG de hasta 1,5 MB");
    await pool.query(
      "INSERT INTO invoice_photos VALUES($1,$2,$3) ON CONFLICT(invoice_id) DO UPDATE SET mime=excluded.mime,data=excluded.data",
      [req.params.id, png ? "image/png" : "image/jpeg", data],
    );
    return { ok: true };
  }
  @Get("invoices/:id/photo")
  @HttpCode(200)
  async photo(@Req() req: any, @Res() res: Response) {
    try {
      const u = auth(req, ["admin", "courier", "client"]);
      const p = (
        await pool.query(
          "SELECT p.* FROM invoice_photos p JOIN invoices i ON i.id=p.invoice_id JOIN orders o ON o.id=i.order_id WHERE p.invoice_id=$1 AND (i.client_id=$2 OR $3) AND ($4<>'courier' OR o.courier_id=$5 OR o.delivered_by=$5)",
          [req.params.id, customerId(u), !isCustomer(u),u.role,u.id],
        )
      ).rows[0];
      if (!p) fail(404, "Sin fotografía");
      res.set("Cache-Control", "private, no-store").type(p.mime).send(p.data);
    } catch (e) {
      throw e;
    }
  }
  @Get("payments")
  @HttpCode(200)
  async getPayments(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "courier"]);
    return (
      await pool.query(
        "SELECT p.*,u.name AS receiver FROM payments p JOIN users u ON u.id=p.receiver_id WHERE receiver_id=$1 OR $2 ORDER BY created_at DESC",
        [u.id, u.role === "admin"],
      )
    ).rows;
  }
  @Post("payments/:id/verify")
  @HttpCode(200)
  async postPaymentsIdVerify(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    auth(req, ["admin"]);
    await tx(async (c) => {
      const p = (
        await c.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!p) fail(404, "No existe");
      if (p.verified) return;
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        p.client_id,
      ]);
      const allocations = (
        await c.query(
          "SELECT * FROM allocations WHERE payment_id=$1 ORDER BY invoice_id",
          [p.id],
        )
      ).rows;
      for (const a of allocations) {
        const inv = (
          await c.query("SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [
            a.invoice_id,
          ])
        ).rows[0];
        if (Number(a.amount) > Number(inv.balance))
          fail(409, "Saldo insuficiente");
        await applyAllocation(c, inv, a.amount);
      }
      await c.query(
        "UPDATE payments SET verified=true,verified_at=clock_timestamp(),verified_day=$2 WHERE id=$1",
        [p.id, await accountingDate(c)],
      );
      await notifyEvent(c, ["admin"], [p.client_id, p.receiver_id], {
        key: "payment:" + p.id,
        module: "credits",
        targetId: p.client_id,
        title: "Transferencia verificada · abono aplicado",
        status: "verified",
      });
    });
    await broadcast();
    return { ok: true };
  }
  @Get("settlement-days") @HttpCode(200) async settlementDays(@Req() req: any) {
    const u = auth(req, ["admin", "courier"]);
    return (
      await pool.query(
        `SELECT to_char(d.day,'YYYY-MM-DD') AS day,courier.id courier_id,courier.name courier_name,s.id,s.status,s.received_cash,s.expected_cash,s.verified_transfers,(SELECT COALESCE(sum(p.amount),0) FROM payments p WHERE p.receiver_id=courier.id AND p.business_day=d.day AND p.method='cash') AS current_cash FROM business_days d JOIN (SELECT DISTINCT operation_day AS day,COALESCE(delivered_by,courier_id) id FROM orders WHERE demo_batch_id IS NULL AND COALESCE(delivered_by,courier_id) IS NOT NULL UNION SELECT business_day,receiver_id FROM payments) activity ON activity.day=d.day JOIN users courier ON courier.id=activity.id AND courier.role='courier' LEFT JOIN settlements s ON s.day=d.day AND s.courier_id=courier.id WHERE d.closed_at IS NULL AND ($1 OR courier.id=$2) ORDER BY d.day,courier.name`,
        [u.role === "admin", u.id],
      )
    ).rows;
  }
  @Get("settlements")
  @HttpCode(200)
  async getSettlements(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "courier"]);
    return (
      await pool.query(
        "SELECT s.*,u.name AS courier_name FROM settlements s JOIN users u ON u.id=s.courier_id WHERE courier_id=$1 OR $2 ORDER BY day DESC",
        [u.id, u.role === "admin"],
      )
    ).rows;
  }
  @Post("settlements")
  @HttpCode(200)
  async postSettlements(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const u = auth(req, ["admin", "courier"]),
      b = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day)) fail(400, "Fecha inválida");
    const result = await tx(async (c) => {
      const courierId = u.role === "courier" ? u.id : b.courierId;
      if (
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND role='courier' FOR UPDATE",
            [courierId],
          )
        ).rowCount
      )
        fail(400, "Mensajero inválido");
      const day = (
        await c.query("SELECT * FROM business_days WHERE day=$1", [b.day])
      ).rows[0];
      if (!day || day.closed_at) fail(409, "Jornada no disponible");
      const existing = (
        await c.query(
          "SELECT * FROM settlements WHERE courier_id=$1 AND day=$2 FOR UPDATE",
          [courierId, b.day],
        )
      ).rows[0];
      const sums = (
        await c.query(
          "SELECT COALESCE(sum(amount) FILTER(WHERE method='cash'),0) cash,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND verified),0) transfers FROM payments WHERE receiver_id=$1 AND business_day=$2",
          [courierId, b.day],
        )
      ).rows[0];
      const outstanding = (
        await c.query(
          "SELECT count(*)::int n FROM orders WHERE demo_batch_id IS NULL AND operation_day=$1 AND courier_id=$2 AND status NOT IN ('delivered','cancelled','rejected')",
          [b.day, courierId],
        )
      ).rows[0].n;
      if (outstanding)
        fail(409, "Resuelve tus entregas antes de enviar el cuadre");
      if (
        (
          await c.query(
            "SELECT id FROM payments WHERE receiver_id=$1 AND business_day=$2 AND NOT verified",
            [courierId, b.day],
          )
        ).rowCount
      )
        fail(409, "Las transferencias deben verificarse antes del cuadre");
      if (u.role === "admin" && b.confirm) {
        if (!existing || existing.status !== "submitted")
          fail(409, "El mensajero debe enviar su cuadre primero");
        if (
          Number(existing.expected_cash) !== Number(sums.cash) ||
          Number(existing.verified_transfers) !== Number(sums.transfers)
        )
          fail(
            409,
            "Hubo nuevos movimientos; solicita al mensajero reenviar el cuadre",
          );
        await c.query(
          "UPDATE settlements SET status='confirmed',confirmed_at=clock_timestamp(),confirmed_by=$2 WHERE id=$1",
          [existing.id, u.id],
        );
      } else {
        if (u.role !== "courier")
          fail(403, "El mensajero debe enviar su propio cuadre");
        if (existing?.status === "confirmed") fail(409, "Cuadre ya confirmado");
        await c.query(
          "INSERT INTO settlements(id,courier_id,day,expected_cash,received_cash,verified_transfers,confirmed_by,confirmed_at,status,submitted_at) VALUES($1,$2,$3,$4,$5,$6,NULL,NULL,'submitted',clock_timestamp()) ON CONFLICT(courier_id,day) DO UPDATE SET expected_cash=excluded.expected_cash,received_cash=excluded.received_cash,verified_transfers=excluded.verified_transfers,status='submitted',submitted_at=excluded.submitted_at",
          [
            randomUUID(),
            courierId,
            b.day,
            sums.cash,
            cents(b.receivedCash),
            sums.transfers,
          ],
        );
      }
      await c.query(
        "INSERT INTO audit(actor_id,action,entity_type,entity_id) VALUES($1,$2,'business_day',$3)",
        [
          u.id,
          b.confirm ? "settlement-confirmed" : "settlement-submitted",
          b.day,
        ],
      );
      return { ok: true };
    });
    await ensureBusinessClock();
    await broadcast();
    return result;
  }
}
