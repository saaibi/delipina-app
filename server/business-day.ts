import type { PoolClient } from "pg";
import { pool, fail } from "./db.js";
export async function businessDate() {
  return (
    await pool.query(
      "SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day",
    )
  ).rows[0].day as string;
}
export async function assertBusinessDateOpen(c: PoolClient, day?: string) {
  if (!day)
    day = (
      await c.query(
        "SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS day",
      )
    ).rows[0].day;
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "delipina:day:" + day,
  ]);
  await c.query(
    "INSERT INTO business_days(day) VALUES($1) ON CONFLICT DO NOTHING",
    [day],
  );
  const r = (
    await c.query("SELECT closed_at FROM business_days WHERE day=$1", [day])
  ).rows[0];
  if (r.closed_at)
    fail(
      409,
      "La jornada está cerrada. Elige una fecha de entrega abierta o espera la siguiente jornada.",
    );
  return day;
}
export async function daySummary(c: PoolClient, day: string) {
  const orders = (
    await c.query(
      "SELECT count(*)::int AS orders,count(*) FILTER(WHERE status NOT IN ('delivered','cancelled','rejected'))::int AS unresolved,count(*) FILTER(WHERE status='delivered')::int AS delivered,COALESCE(sum(total) FILTER(WHERE status='delivered'),0) AS delivered_total,COALESCE(sum(total) FILTER(WHERE status NOT IN ('pending','rejected','cancelled')),0) AS accepted_total FROM orders WHERE (window_start AT TIME ZONE 'America/Bogota')::date=$1",
      [day],
    )
  ).rows[0];
  const payments = (
    await c.query(
      "SELECT COALESCE(sum(amount) FILTER(WHERE method='cash'),0) AS cash,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND verified),0) AS verified_transfers,COALESCE(sum(amount) FILTER(WHERE NOT verified),0) AS pending_transfers,count(*) FILTER(WHERE NOT verified)::int AS unverified_count FROM payments WHERE (created_at AT TIME ZONE 'America/Bogota')::date=$1",
      [day],
    )
  ).rows[0];
  const balance = (
    await c.query(
      "SELECT COALESCE(sum(balance),0) AS outstanding FROM invoices",
    )
  ).rows[0];
  return { day, ...orders, ...payments, ...balance };
}
