import { assertBusinessDateOpen } from "../business-day.js";
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
        "SELECT i.*,u.name AS client_name FROM invoices i JOIN users u ON u.id=i.client_id WHERE i.client_id=$1 OR $2",
        [u.id, u.role !== "client"],
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
      await assertBusinessDateOpen(c);
      if (
        !["cash", "nequi", "bancolombia"].includes(b.method) ||
        !Array.isArray(b.allocations) ||
        !b.allocations.length ||
        new Set(b.allocations.map((a) => a.invoiceId)).size !==
          b.allocations.length
      )
        fail(400, "Distribución inválida");
      cents(b.amount);
      if (
        b.amount <= 0 ||
        b.allocations.reduce((s, a) => s + cents(a.amount), 0) !== b.amount
      )
        fail(400, "El abono debe coincidir con lo recibido");
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        b.clientId,
      ]);
      const id = randomUUID();
      await c.query("INSERT INTO payments VALUES($1,$2,$3,$4,$5,$6,now())", [
        id,
        b.clientId,
        u.id,
        b.method,
        b.amount,
        b.method === "cash",
      ]);
      for (const a of [...b.allocations].sort((a, b) =>
        a.invoiceId.localeCompare(b.invoiceId),
      )) {
        const inv = (
          await c.query(
            "SELECT * FROM invoices WHERE id=$1 AND client_id=$2 FOR UPDATE",
            [a.invoiceId, b.clientId],
          )
        ).rows[0];
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
      const r = { id };
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
          "SELECT p.* FROM invoice_photos p JOIN invoices i ON i.id=p.invoice_id WHERE p.invoice_id=$1 AND (i.client_id=$2 OR $3)",
          [req.params.id, u.id, u.role !== "client"],
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
      await c.query("UPDATE payments SET verified=true WHERE id=$1", [p.id]);
    });
    await broadcast();
    return { ok: true };
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
    const u = auth(req, ["admin"]);
    const b = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day)) fail(400, "Fecha inválida");
    const received = cents(b.receivedCash);
    return tx(async (c) => {
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        b.courierId,
      ]);
      const sums = (
        await c.query(
          "SELECT COALESCE(sum(amount) FILTER(WHERE method='cash'),0) AS cash,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND verified),0) AS transfers FROM payments WHERE receiver_id=$1 AND (created_at AT TIME ZONE 'America/Bogota')::date=$2",
          [b.courierId, b.day],
        )
      ).rows[0];
      return (
        await c.query(
          "INSERT INTO settlements VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *",
          [
            randomUUID(),
            b.courierId,
            b.day,
            sums.cash,
            received,
            sums.transfers,
            u.id,
          ],
        )
      ).rows[0];
    });
  }
}
