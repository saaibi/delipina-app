import { pool, tx } from "./db.js";
import { randomUUID } from "node:crypto";
if (process.env.NODE_ENV === "production") throw Error("Semillas solo locales");
await tx(async (c) => {
  for (const [role, name] of [
    ["admin", "Administración demo"],
    ["courier", "Mensajero demo"],
    ["client", "Cliente demo"],
    ["preparation", "Planta demo"],
    ["plant_admin", "Administrador de planta demo"],
    ["custom", "Personalizado demo"],
  ]) {
    const id = randomUUID();
    await c.query(
      "INSERT INTO users(id,email,name,role,credit_limit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING",
      [id, `${role}@demo.test`, name, role, role === "client" ? 10000000 : 0],
    );
  }
  await c.query("UPDATE users SET permissions='[\"orders\",\"plant\"]' WHERE email='custom@demo.test'");
  const u = (await c.query("SELECT id FROM users WHERE role='client' LIMIT 1"))
    .rows[0];
  if (!(await c.query("SELECT 1 FROM branches")).rowCount)
    await c.query("INSERT INTO branches(id,client_id,address,city) VALUES($1,$2,$3,$4)", [
      randomUUID(),
      u.id,
      "Calle 10 # 20-30 (ejemplo)",
      "Bucaramanga",
    ]);
  if (!(await c.query("SELECT 1 FROM products")).rowCount)
    for (const name of ["Entera", "En trozos", "Picada", "Rayada"])
      await c.query(
        "INSERT INTO products VALUES($1,$2,'Por kilogramo','kg',500000,true)",
        [randomUUID(), name],
      );
});
await pool.end();
