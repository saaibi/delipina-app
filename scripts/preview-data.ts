import { pool } from "../server/db.js";
import { createDemoData } from "../server/demo-data.js";
import { randomUUID } from "node:crypto";
if (process.env.NODE_ENV === "production")
  throw Error("Solo vista previa local");
await pool.query(
  "INSERT INTO users(id,email,name,role) VALUES($1,'saaibiflorez@unac.edu.co','Cliente demo de rutas','client') ON CONFLICT(email) DO NOTHING",
  [randomUUID()],
);
const admin = (
    await pool.query("SELECT * FROM users WHERE email='admin@demo.test'")
  ).rows[0],
  courier = (
    await pool.query("SELECT id FROM users WHERE email='courier@demo.test'")
  ).rows[0];
await createDemoData(admin, "saaibiflorez@unac.edu.co", courier.id);
await pool.end();
