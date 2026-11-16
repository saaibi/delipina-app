import { pool, tx } from "./db.js";
import fs from "node:fs/promises";
await pool.query("CREATE TABLE IF NOT EXISTS migrations(id text PRIMARY KEY)");
for (const file of (await fs.readdir("migrations")).sort()) {
  if (
    !(await pool.query("SELECT 1 FROM migrations WHERE id=$1", [file])).rowCount
  )
    await tx(async (c) => {
      await c.query(await fs.readFile(`migrations/${file}`, "utf8"));
      await c.query("INSERT INTO migrations VALUES($1)", [file]);
    });
}
await pool.end();
