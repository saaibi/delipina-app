import pg from "pg";
export const databaseSchema = process.env.DATABASE_SCHEMA || "delipina";
export function schemaIdentifier(value: string) {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(value) ||
    ["public", "pg_catalog", "information_schema"].includes(value)
  )
    throw Error(
      "Schema inválido: se requiere un namespace exclusivo para Delipiña.",
    );
  return '"' + value + '"';
}
schemaIdentifier(databaseSchema);
const connections = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${databaseSchema},pg_catalog`,
  max:
    process.env.PGLITE_LOCAL === "true"
      ? 1
      : Number(process.env.PG_POOL_MAX || 3),
});
export const pool = {
  async connect() {
    const client = await connections.connect();
    try {
      await client.query(
        `SET search_path TO ${schemaIdentifier(databaseSchema)}, pg_catalog`,
      );
      return client;
    } catch (e) {
      client.release();
      throw e;
    }
  },
  async query(sql: string, values?: any[]) {
    const client = await this.connect();
    try {
      return await client.query(sql, values);
    } finally {
      client.release();
    }
  },
  async end() {
    await connections.end();
  },
};
export async function tx<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
