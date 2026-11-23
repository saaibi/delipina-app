import { fail } from "./db.js";
import { randomUUID } from "node:crypto";
import { isModuleEnabled } from "../shared/modules.js";
export async function removeLotStock(c: any, amount: number) {
  const lots = (
    await c.query(
      "SELECT * FROM inventory_lots WHERE remaining_kg>0 ORDER BY received_on,created_at,id FOR UPDATE",
    )
  ).rows;
  let rest = amount;
  for (const lot of lots) {
    const take = Math.min(rest, Number(lot.remaining_kg));
    if (take > 0)
      await c.query(
        "UPDATE inventory_lots SET remaining_kg=remaining_kg-$2 WHERE id=$1",
        [lot.id, take],
      );
    rest = Math.round((rest - take) * 1000) / 1000;
    if (rest <= 0) break;
  }
  if (rest > 0)
    fail(409, "No hay suficientes kilos disponibles en los ingresos");
}
async function applyOrderInventory(c: any, order: any, actor: string) {
  const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
  if (!isModuleEnabled(cfg, "inventory")) return;
  if (
    (
      await c.query(
        "SELECT order_id FROM inventory_order_effects WHERE order_id=$1",
        [order.id],
      )
    ).rowCount
  )
    return;
  const lines = (
    await c.query(
      `SELECT i.name,i.quantity,i.product_id FROM items i WHERE i.order_id=$1 AND EXISTS(SELECT 1 FROM inventory_rules r WHERE r.product_id=i.product_id AND r.active) OR i.order_id=$1 AND EXISTS(SELECT 1 FROM inventory_lots l WHERE l.remaining_kg>0 AND l.yields @> jsonb_build_array(jsonb_build_object('product_id',i.product_id::text)))`,
      [order.id],
    )
  ).rows;
  if (!lines.length) return;
  const stock = Number(
    (
      await c.query(
        "SELECT quantity FROM inventory_stock WHERE unit='kg' FOR UPDATE",
      )
    ).rows[0].quantity,
  );
  const lots = (
    await c.query(
      "SELECT * FROM inventory_lots WHERE remaining_kg>0 ORDER BY received_on,created_at,id FOR UPDATE",
    )
  ).rows.map((l) => ({ ...l, remaining: Number(l.remaining_kg) }));
  const details: any[] = [];
  let total = 0;
  for (const line of lines) {
    let remaining = Number(line.quantity);
    for (const lot of lots) {
      if (lot.remaining <= 0) continue;
      const rule = lot.yields.find((r) => r.product_id === line.product_id);
      if (!rule)
        fail(
          409,
          `Falta rendimiento para ${line.name} con piña ${{ en_punto: "en punto", verde: "verde", madura: "madura" }[lot.maturity]}; edita los rendimientos de ese ingreso.`,
        );
      const ratio = Number(rule.raw_kg) / Number(rule.output_quantity),
        needed = Math.ceil(remaining * ratio * 1000 - 1e-8) / 1000,
        take = Math.min(lot.remaining, needed);
      remaining = Math.max(0, remaining - take / ratio);
      lot.remaining = Math.round((lot.remaining - take) * 1000) / 1000;
      total += take;
      details.push({
        productId: line.product_id,
        name: line.name,
        lotId: lot.id,
        maturity: lot.maturity,
        rawKg: take,
        ratio,
      });
      if (remaining < 1e-9) break;
    }
    if (remaining > 1e-9)
      fail(
        409,
        `Piña entera insuficiente para ${line.name}. Registra la compra o revisa el rendimiento.`,
      );
  }
  total = Math.round(total * 1000) / 1000;
  if (total > stock) fail(409, "Existencias insuficientes");
  for (const lot of lots)
    await c.query("UPDATE inventory_lots SET remaining_kg=$2 WHERE id=$1", [
      lot.id,
      lot.remaining,
    ]);
  const balance = Math.round((stock - total) * 1000) / 1000;
  await c.query("UPDATE inventory_stock SET quantity=$1 WHERE unit='kg'", [
    balance,
  ]);
  await c.query(
    "INSERT INTO inventory_order_effects(order_id,raw_kg,details) VALUES($1,$2,$3)",
    [order.id, total, JSON.stringify(details)],
  );
  await c.query(
    "INSERT INTO inventory_movements(id,kind,unit,quantity,occurred_on,notes,actor_id,balance_after,order_id) VALUES($1,'order','kg',$2,(now() AT TIME ZONE 'America/Bogota')::date,'Consumo estimado al aceptar pedido, según ingreso y madurez',$3,$4,$5)",
    [randomUUID(), -total, actor, balance, order.id],
  );
}
export async function refundOrderInventory(c: any, order: any, actor: string) {
  if (order.status !== "confirmed") return;
  const effect = (
    await c.query(
      "SELECT * FROM inventory_order_effects WHERE order_id=$1 FOR UPDATE",
      [order.id],
    )
  ).rows[0];
  if (!effect || effect.refunded) return;
  await c.query(
    "SELECT quantity FROM inventory_stock WHERE unit='kg' FOR UPDATE",
  );
  for (const line of effect.details)
    await c.query(
      "UPDATE inventory_lots SET remaining_kg=remaining_kg+$2 WHERE id=$1",
      [line.lotId, line.rawKg],
    );
  const balance = Number(
    (
      await c.query(
        "UPDATE inventory_stock SET quantity=quantity+$1 WHERE unit='kg' RETURNING quantity",
        [effect.raw_kg],
      )
    ).rows[0].quantity,
  );
  await c.query(
    "UPDATE inventory_order_effects SET refunded=true WHERE order_id=$1",
    [order.id],
  );
  await c.query(
    "INSERT INTO inventory_movements(id,kind,unit,quantity,occurred_on,notes,actor_id,balance_after,order_id) VALUES($1,'reversal','kg',$2,(now() AT TIME ZONE 'America/Bogota')::date,'Reposición por cancelación antes de preparar',$3,$4,$5)",
    [randomUUID(), effect.raw_kg, actor, balance, order.id],
  );
}

export async function consumeOrderInventory(c: any, order: any, actor: string) {
  await c.query("SAVEPOINT inventory_apply");
  try {
    await applyOrderInventory(c, order, actor);
    await c.query("DELETE FROM inventory_pending WHERE order_id=$1", [
      order.id,
    ]);
    await c.query("RELEASE SAVEPOINT inventory_apply");
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT inventory_apply");
    await c.query("RELEASE SAVEPOINT inventory_apply");
    if (e.status !== 409) throw e;
    await c.query(
      "INSERT INTO inventory_pending(order_id,reason,actor_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET reason=excluded.reason",
      [order.id, e.message, actor],
    );
  }
}
