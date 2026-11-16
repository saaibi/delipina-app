import { pool } from "./db.js";
import { randomUUID } from "node:crypto";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !email.includes("@"))
  throw Error("Configura BOOTSTRAP_ADMIN_EMAIL en el gestor de secretos.");
if ((await pool.query("SELECT id FROM users WHERE role='admin'")).rowCount)
  throw Error("Ya existe administración: usa el módulo Usuarios.");
await pool.query(
  "INSERT INTO users(id,email,name,role) VALUES($1,$2,'Administración','admin')",
  [randomUUID(), email],
);
await pool.end();
console.log(
  "Administrador inicial precreado. Google verificará la identidad al entrar.",
);
