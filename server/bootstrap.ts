import { pool, tx } from "./db.js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@"))
    throw Error("Configura BOOTSTRAP_ADMIN_EMAIL en el gestor de secretos.");
  return tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('bootstrap-admin'))");
    if ((await c.query("SELECT id FROM users WHERE role='admin'")).rowCount)
      return { created: false };
    if (
      (await c.query("SELECT id FROM users WHERE email=$1", [email])).rowCount
    )
      throw Error(
        "El correo inicial ya tiene cuenta. Requiere revisión explícita; no se elevan clientes automáticamente.",
      );
    await c.query(
      "INSERT INTO users(id,email,name,role) VALUES($1,$2,'Administración','admin')",
      [randomUUID(), email],
    );
    return { created: true };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await bootstrapAdmin();
  await pool.end();
  console.log(
    "Configuración de administrador inicial completada. Google verificará la identidad al entrar.",
  );
}
