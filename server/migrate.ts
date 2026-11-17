import { pool, tx, databaseSchema, schemaIdentifier } from "./db.js";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
async function externalFingerprint(c: PoolClient, target: string) {
  const r = await c.query(
    `SELECT n.nspname,c.relname,c.relkind,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,d.adbin::text AS default_expr FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname<>$1 AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S') ORDER BY 1,2,4`,
    [target],
  );
  return createHash("sha256").update(JSON.stringify(r.rows)).digest("hex");
}
export async function migrate(target = databaseSchema) {
  const name = schemaIdentifier(target);
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      target + ":migrations",
    ]);
    const before = await externalFingerprint(c, target);
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
    await c.query(`SET LOCAL search_path TO ${name}, pg_catalog`);
    const actual = (await c.query("SELECT current_schema() AS name")).rows[0]
      .name;
    if (actual !== target)
      throw Error("Se detuvo la migración: schema inesperado.");
    await c.query("CREATE TABLE IF NOT EXISTS migrations(id text PRIMARY KEY)");
    for (const file of (await fs.readdir("migrations")).sort()) {
      if (
        !(await c.query("SELECT 1 FROM migrations WHERE id=$1", [file]))
          .rowCount
      ) {
        const sql = await fs.readFile("migrations/" + file, "utf8");
        if (
          /\b(public\s*\.|set\s+(?:local\s+)?search_path|drop\s+schema)/i.test(
            sql,
          )
        )
          throw Error("Migración fuera del schema autorizado.");
        await c.query(sql);
        await c.query("INSERT INTO migrations VALUES($1)", [file]);
      }
    }
    const after = await externalFingerprint(c, target);
    if (before !== after)
      throw Error(
        "La estructura fuera de Delipiña cambió durante la migración; rollback.",
      );
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_audits(id bigserial PRIMARY KEY,checked_at timestamptz DEFAULT now(),external_hash text NOT NULL,unchanged boolean NOT NULL)",
    );
    await c.query(
      "INSERT INTO schema_audits(external_hash,unchanged) VALUES($1,true)",
      [before],
    );
    return { schema: target, externalStructureUnchanged: true };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await migrate();
  await pool.end();
  console.log(
    "Schema isolation verified:",
    result.schema,
    "external structure unchanged:",
    result.externalStructureUnchanged,
  );
}
