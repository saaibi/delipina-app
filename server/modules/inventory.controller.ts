import { removeLotStock, consumeOrderInventory } from "../inventory.js";
import { Controller, Get, Post, Put, Req, HttpCode } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { pool, tx, fail } from "../db.js";
import { auth, broadcast, text, cents } from "../domain.js";
import { businessDate } from "../business-day.js";
const unitFactors = { kg: 1, libra: 0.5, arroba: 12.5, unidad: 1 };
@Controller("api/inventory")
export class InventoryController {
  @Get() @HttpCode(200) async summary(@Req() req: any) {
    auth(req, ["admin"]);
    const stock = (
      await pool.query("SELECT * FROM inventory_stock ORDER BY unit")
    ).rows;
    const suppliers = (
      await pool.query("SELECT id,name FROM inventory_suppliers ORDER BY name")
    ).rows;
    const purchases = (
      await pool.query(
        "SELECT COALESCE(sum(total_cost),0) AS cost,count(*)::int count FROM inventory_movements WHERE kind='purchase'",
      )
    ).rows[0];
    const rules = (
      await pool.query(
        "SELECT r.*,p.name,p.presentation,p.unit,g.name AS product_name FROM inventory_rules r JOIN products p ON p.id=r.product_id LEFT JOIN catalog_products g ON g.id=p.catalog_product_id ORDER BY p.name,p.presentation,p.unit",
      )
    ).rows;
    const products = (
      await pool.query(
        "SELECT p.id,p.name,p.presentation,p.unit,g.name AS product_name FROM products p LEFT JOIN catalog_products g ON g.id=p.catalog_product_id WHERE p.active ORDER BY g.name,p.name,p.unit",
      )
    ).rows;
    const lots = (
      await pool.query(
        "SELECT l.*,m.original_quantity,m.notes,s.name supplier FROM inventory_lots l JOIN inventory_movements m ON m.id=l.id LEFT JOIN inventory_suppliers s ON s.id=m.supplier_id WHERE l.remaining_kg>0 ORDER BY l.received_on,l.created_at,l.id",
      )
    ).rows;
    const pending = (
      await pool.query(
        "SELECT p.*,u.name client_name,o.window_start,o.status FROM inventory_pending p JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.client_id WHERE o.status<>'cancelled' ORDER BY p.created_at",
      )
    ).rows;
    return {
      stock: stock.length ? stock : [{ unit: "kg", quantity: 0 }],
      suppliers,
      purchases,
      rules,
      products,
      lots,
      pending,
    };
  }
  @Get("movements") @HttpCode(200) async movements(@Req() req: any) {
    auth(req, ["admin"]);
    const page = Number(req.query.page || 0),
      size = Number(req.query.pageSize || 10);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 1000000 ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100
    )
      fail(400, "Paginación inválida");
    const supplier = req.query.supplierId || null,
      kind = req.query.kind || null;
    if (supplier && !/^[0-9a-f-]{36}$/i.test(supplier))
      fail(400, "Proveedor inválido");
    if (
      kind &&
      ![
        "purchase",
        "consumption",
        "waste",
        "adjustment",
        "order",
        "reversal",
      ].includes(kind)
    )
      fail(400, "Tipo inválido");
    const where =
      "($1::uuid IS NULL OR m.supplier_id=$1) AND ($2::text IS NULL OR m.kind=$2)";
    const rows = (
      await pool.query(
        `SELECT m.*,s.name supplier,a.name actor FROM inventory_movements m LEFT JOIN inventory_suppliers s ON s.id=m.supplier_id JOIN users a ON a.id=m.actor_id WHERE ${where} ORDER BY m.occurred_on DESC,m.created_at DESC,m.id LIMIT $3 OFFSET $4`,
        [supplier, kind, size, page * size],
      )
    ).rows;
    const total = Number(
      (
        await pool.query(
          `SELECT count(*) n FROM inventory_movements m WHERE ${where}`,
          [supplier, kind],
        )
      ).rows[0].n,
    );
    return { rows, total, page, pageSize: size };
  }
  @Put("rules") @HttpCode(200) async rule(@Req() req: any) {
    auth(req, ["admin"]);
    const b = req.body;
    if (
      !["en_punto", "verde", "madura"].includes(b.maturity) ||
      b.rawUnit !== "kg" ||
      !Number.isFinite(Number(b.rawQuantity)) ||
      Number(b.rawQuantity) <= 0 ||
      Number(b.rawQuantity) > 1e9 ||
      !Number.isFinite(Number(b.outputQuantity)) ||
      Number(b.outputQuantity) <= 0 ||
      Number(b.outputQuantity) > 1e9 ||
      typeof b.active !== "boolean"
    )
      fail(400, "Rendimiento inválido");
    const p = (
      await pool.query("SELECT id,unit FROM products WHERE id=$1", [
        b.productId,
      ])
    ).rows[0];
    if (!p) fail(404, "Presentación no disponible");
    if (
      b.active &&
      !["kg", "libra", "arroba", "lb"].includes(p.unit.toLowerCase())
    )
      fail(
        400,
        "Configura el rendimiento en una presentación de peso (kg, libra o arroba)",
      );
    await pool.query(
      "INSERT INTO inventory_rules(product_id,maturity,raw_kg,output_quantity,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id,maturity) DO UPDATE SET raw_kg=excluded.raw_kg,output_quantity=excluded.output_quantity,active=excluded.active",
      [
        p.id,
        b.maturity,
        Number(b.rawQuantity),
        Number(b.outputQuantity),
        b.active,
      ],
    );
    await broadcast();
    return { ok: true };
  }
  @Put("lots/:id") @HttpCode(200) async lot(@Req() req: any) {
    auth(req, ["admin"]);
    const b = req.body;
    if (
      !["en_punto", "verde", "madura"].includes(b.maturity) ||
      !Array.isArray(b.yields) ||
      b.yields.length > 500 ||
      new Set(b.yields.map((r) => r.productId)).size !== b.yields.length
    )
      fail(400, "Rendimientos inválidos");
    await tx(async (c) => {
      await c.query(
        "SELECT quantity FROM inventory_stock WHERE unit='kg' FOR UPDATE",
      );
      const lot = (
        await c.query("SELECT * FROM inventory_lots WHERE id=$1 FOR UPDATE", [
          req.params.id,
        ])
      ).rows[0];
      if (!lot || Number(lot.remaining_kg) <= 0)
        fail(409, "La compra ya no tiene existencias");
      const yields = [];
      for (const r of b.yields) {
        if (
          !(await c.query("SELECT id FROM products WHERE id=$1", [r.productId]))
            .rowCount ||
          !Number.isFinite(Number(r.rawQuantity)) ||
          Number(r.rawQuantity) <= 0 ||
          Number(r.rawQuantity) > 1e9 ||
          !Number.isFinite(Number(r.outputQuantity)) ||
          Number(r.outputQuantity) <= 0 ||
          Number(r.outputQuantity) > 1e9
        )
          fail(400, "Rendimiento inválido");
        yields.push({
          product_id: r.productId,
          raw_kg: Number(r.rawQuantity),
          output_quantity: Number(r.outputQuantity),
        });
      }
      await c.query(
        "UPDATE inventory_lots SET yields=$2,maturity=$3 WHERE id=$1",
        [lot.id, JSON.stringify(yields), b.maturity],
      );
    });
    await broadcast();
    return { ok: true };
  }
  @Post("reconcile") @HttpCode(200) async reconcile(@Req() req: any) {
    const u = auth(req, ["admin"]);
    await tx(async (c) => {
      const p = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          req.body.orderId,
        ])
      ).rows[0];
      if (!p || ["pending", "cancelled"].includes(p.status))
        fail(409, "Pedido no disponible para conciliar");
      await consumeOrderInventory(c, p, u.id);
    });
    await broadcast();
    return { ok: true };
  }
  @Post("movements") @HttpCode(200) async move(@Req() req: any) {
    const user = auth(req, ["admin"]),
      b = req.body,
      key = req.get("Idempotency-Key");
    if (!key || key.length > 160) fail(400, "Falta clave de registro");
    const hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
    const result = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        user.id + key,
      ]);
      const prev = (
        await c.query("SELECT * FROM idempotency WHERE user_id=$1 AND key=$2", [
          user.id,
          key,
        ])
      ).rows[0];
      if (prev) {
        if (prev.request_hash !== hash) fail(409, "Clave reutilizada");
        return prev.response;
      }
      if (
        !["purchase", "consumption", "waste", "adjustment"].includes(b.kind) ||
        b.unit !== "kg"
      )
        fail(400, "Movimiento o unidad inválidos");
      const qty = Number(b.quantity),
        factor = unitFactors[b.unit],
        unit = b.unit === "unidad" ? "unidad" : "kg";
      if (
        !Number.isFinite(qty) ||
        qty < 0 ||
        qty > 1e9 ||
        (b.kind !== "adjustment" && qty === 0) ||
        Math.abs(qty * 1000 - Math.round(qty * 1000)) > 0.00001 ||
        (unit === "unidad" && !Number.isInteger(qty))
      )
        fail(400, "Cantidad inválida: hasta 3 decimales; unidades enteras");
      const today = await businessDate(c),
        date = b.date || today;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date > today ||
        new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
      )
        fail(400, "Usa una fecha válida de hoy o anterior");
      const notes = text(b.notes, 1000) || "";
      const maturity = b.maturity || "en_punto";
      if (!["en_punto", "verde", "madura"].includes(maturity))
        fail(400, "Madurez inválida");
      if (b.kind !== "purchase" && !notes.trim())
        fail(400, "Indica el motivo de la salida, merma o ajuste");
      let supplier = null,
        cost = null;
      if (b.kind === "purchase") {
        cost = cents(b.totalCost);
        if (!cost) fail(400, "Indica el valor total de la compra en COP");
        if (b.supplierId) {
          supplier = (
            await c.query("SELECT id FROM inventory_suppliers WHERE id=$1", [
              b.supplierId,
            ])
          ).rows[0]?.id;
        } else {
          const name = text(b.supplierName, 160)?.trim();
          if (name) {
            supplier = (
              await c.query(
                "INSERT INTO inventory_suppliers(id,name) VALUES($1,$2) ON CONFLICT(lower(name)) DO UPDATE SET name=inventory_suppliers.name RETURNING id",
                [randomUUID(), name],
              )
            ).rows[0].id;
          }
        }
        if (!supplier) fail(400, "Selecciona o escribe un proveedor");
      }
      await c.query(
        "INSERT INTO inventory_stock(unit) VALUES('kg') ON CONFLICT(unit) DO NOTHING",
      );
      const current = Number(
        (
          await c.query(
            "SELECT quantity FROM inventory_stock WHERE unit=$1 FOR UPDATE",
            [unit],
          )
        ).rows[0].quantity,
      );
      const normalized = Math.round(qty * factor * 1000) / 1000;
      if (qty > 0 && normalized === 0)
        fail(400, "La cantidad es menor que la precisión admitida");
      const delta =
        b.kind === "adjustment"
          ? normalized - current
          : ["consumption", "waste"].includes(b.kind)
            ? -normalized
            : normalized;
      const next = Math.round((current + delta) * 1000) / 1000;
      if (delta === 0) fail(400, "El conteo coincide con el saldo actual");
      if (next < 0) fail(409, "La salida supera las existencias disponibles");
      const id = randomUUID();
      await c.query("UPDATE inventory_stock SET quantity=$2 WHERE unit=$1", [
        unit,
        next,
      ]);
      await c.query(
        "INSERT INTO inventory_movements(id,kind,unit,quantity,purchase_unit,original_quantity,total_cost,supplier_id,occurred_on,notes,actor_id,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          id,
          b.kind,
          unit,
          delta,
          b.unit,
          qty,
          cost,
          supplier,
          date,
          notes,
          user.id,
          next,
        ],
      );
      if (delta > 0) {
        let yields = (
          await c.query(
            "SELECT product_id,raw_kg,output_quantity FROM inventory_rules WHERE maturity=$1 AND active",
            [maturity],
          )
        ).rows;
        if (b.yields !== undefined) {
          if (
            !Array.isArray(b.yields) ||
            b.yields.length > 500 ||
            new Set(b.yields.map((r) => r.productId)).size !== b.yields.length
          )
            fail(400, "Rendimientos inválidos");
          yields = [];
          for (const r of b.yields) {
            const product = (
              await c.query("SELECT id FROM products WHERE id=$1", [
                r.productId,
              ])
            ).rows[0];
            if (
              !product ||
              !Number.isFinite(Number(r.rawQuantity)) ||
              Number(r.rawQuantity) <= 0 ||
              Number(r.rawQuantity) > 1e9 ||
              !Number.isFinite(Number(r.outputQuantity)) ||
              Number(r.outputQuantity) <= 0 ||
              Number(r.outputQuantity) > 1e9
            )
              fail(400, "Rendimiento inválido");
            yields.push({
              product_id: product.id,
              raw_kg: Number(r.rawQuantity),
              output_quantity: Number(r.outputQuantity),
            });
          }
        }
        await c.query(
          "INSERT INTO inventory_lots(id,remaining_kg,maturity,received_on,yields) VALUES($1,$2,$3,$4,$5)",
          [id, delta, maturity, date, JSON.stringify(yields)],
        );
      } else await removeLotStock(c, -delta);
      await c.query("UPDATE inventory_movements SET maturity=$2 WHERE id=$1", [
        id,
        maturity,
      ]);
      const response = { id, unit, balance: next };
      await c.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
        user.id,
        key,
        hash,
        response,
      ]);
      return response;
    });
    await broadcast();
    return result;
  }
}
