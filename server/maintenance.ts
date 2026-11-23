import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";
import { tx, fail, databaseSchema, schemaIdentifier } from "./db.js";
// Parent-first order is also the restore order; all names are fixed, never input.
export const operationalTables = [
  "business_days",
  "demo_batches",
  "branches",
  "prices",
  "orders",
  "items",
  "invoices",
  "payments",
  "allocations",
  "invoice_photos",
  "payment_proofs",
  "audit",
  "notifications",
  "push_deliveries",
  "native_push_deliveries",
  "idempotency",
  "locations",
  "settlements",
  "order_schedules",
  "schedule_runs",
  "delivery_runs",
  "route_matrix_cache",
  "route_geometry_cache",
  "geocode_cache",
  "inventory_suppliers",
  "inventory_stock",
  "inventory_rules",
  "inventory_movements",
  "inventory_lots",
  "inventory_order_effects",
  "inventory_pending",
];
const table = (name: string) => `${schemaIdentifier(databaseSchema)}."${name}"`;
async function snapshot(c: any) {
  const data: Record<string, any[]> = {};
  for (const name of operationalTables)
    data[name] = (
      await c.query(`SELECT to_jsonb(t) AS row FROM ${table(name)} t`)
    ).rows.map((r) => r.row);
  const credits = (
    await c.query(`SELECT id,credit_used FROM ${table("users")} ORDER BY id`)
  ).rows;
  return { version: 1, schema: databaseSchema, data, credits };
}
function summary(s: any) {
  return Object.fromEntries(
    operationalTables.map((n) => [n, s.data[n].length]),
  );
}
async function preserved(c: any) {
  const result = {};
  for (const name of [
    "users",
    "catalog_products",
    "products",
    "product_photos",
    "settings",
  ]) {
    const rows = (
      await c.query(`SELECT to_jsonb(t) AS row FROM ${table(name)} t`)
    ).rows
      .map((r) => {
        const row = r.row;
        if (name === "users") delete row.credit_used;
        return JSON.stringify(row);
      })
      .sort();
    result[name] = {
      count: rows.length,
      hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  return result;
}
async function lock(c: any) {
  await c.query("SET LOCAL lock_timeout='10s'");
  await c.query(
    "SELECT pg_advisory_xact_lock(hashtext('delipina:auto-close'))",
  );
  await c.query(
    `LOCK TABLE ${[...operationalTables, "users", "catalog_products", "products", "product_photos", "settings"].map(table).join(",")} IN EXCLUSIVE MODE`,
  );
}
async function archive(c: any, actor: string, s: any) {
  const id = randomUUID();
  await c.query(
    `INSERT INTO ${table("maintenance_archives")}(id,actor_id,summary,payload) VALUES($1,$2,$3,$4)`,
    [id, actor, summary(s), gzipSync(JSON.stringify(s))],
  );
  return id;
}
async function clear(c: any) {
  await c.query(`TRUNCATE ${operationalTables.map(table).join(",")}`);
  await c.query(`UPDATE ${table("users")} SET credit_used=0`);
}
export async function maintenancePreview() {
  return tx(async (c) => {
    const counts = {};
    for (const name of operationalTables)
      counts[name] = Number(
        (await c.query(`SELECT count(*) AS n FROM ${table(name)}`)).rows[0].n,
      );
    return { counts, preserved: await preserved(c) };
  });
}
export async function cleanupOperations(actor: string, confirmation: string) {
  if (confirmation !== "LIMPIAR DELIPIÑA")
    fail(400, "Escribe LIMPIAR DELIPIÑA para continuar");
  return tx(async (c) => {
    await lock(c);
    const before = await preserved(c),
      s = await snapshot(c),
      id = await archive(c, actor, s);
    await clear(c);
    if (JSON.stringify(before) !== JSON.stringify(await preserved(c)))
      throw Error("No se conservaron los datos protegidos");
    return { id, counts: summary(s), preserved: before };
  });
}
export async function restoreOperations(
  actor: string,
  id: string,
  confirmation: string,
) {
  if (confirmation !== "RESTAURAR DELIPIÑA")
    fail(400, "Escribe RESTAURAR DELIPIÑA para continuar");
  return tx(async (c) => {
    await lock(c);
    const row = (
      await c.query(
        `SELECT payload FROM ${table("maintenance_archives")} WHERE id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) fail(404, "Respaldo no encontrado");
    const s = JSON.parse(gunzipSync(row.payload).toString("utf8"));
    if (s.version !== 1 || s.schema !== databaseSchema)
      fail(409, "Formato de respaldo incompatible");
    const safetyId = await archive(c, actor, await snapshot(c));
    await clear(c);
    for (const name of operationalTables) {
      if (s.data[name]?.length)
        await c.query(
          `INSERT INTO ${table(name)} SELECT * FROM jsonb_populate_recordset(NULL::${table(name)},$1::jsonb)`,
          [JSON.stringify(s.data[name])],
        );
    }
    for (const user of s.credits)
      await c.query(`UPDATE ${table("users")} SET credit_used=$2 WHERE id=$1`, [
        user.id,
        user.credit_used,
      ]);
    return { ok: true, safetyId };
  });
}
