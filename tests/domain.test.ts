import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../dist-server/app.js";
const nest = await createApp();
await nest.init();
const app = nest.getHttpServer();
import { pool } from "../dist-server/db.js";

const origin = "http://localhost:3000";
const users: Record<string, any> = {};
async function login(role) {
  const r = await request(app)
    .post("/api/auth/dev")
    .set("Origin", origin)
    .send({ email: role + "@demo.test" });
  assert.equal(r.status, 200);
  users[role] = { ...r.body, cookie: r.headers["set-cookie"][0].split(";")[0] };
}
const call = (role, method, path, body, key) => {
  let r = request(app)
    [method]("/api" + path)
    .set("Origin", origin)
    .set("Cookie", users[role].cookie);
  if (key) r = r.set("Idempotency-Key", key);
  return r.send(body);
};
let body, order;
test("Flujo, permisos, crédito, abonos, sincronización y toma concurrente", async () => {
  for (const r of ["admin", "client", "courier", "preparation"]) await login(r);
  const branches = await call("client", "get", "/branches");
  const products = await call("client", "get", "/products");
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(15, 0, 0, 0);
  body = {
    branchId: branches.body[0].id,
    start: start.toISOString(),
    end: new Date(+start + 3600000).toISOString(),
    credit: true,
    items: [{ productId: products.body[0].id, quantity: 1 }],
  };
  assert.equal(
    (await call("client", "post", "/products", { name: "x" })).status,
    403,
  );
  assert.equal((await request(app).get("/api/orders")).status, 401);
  const key = randomUUID(),
    created = await call("client", "post", "/orders", body, key);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  order = created.body;
  assert.equal(order.status, "pending");
  const replay = await call("client", "post", "/orders", body, key);
  assert.equal(replay.body.id, order.id);
  assert.equal(
    (
      await call(
        "client",
        "post",
        "/orders",
        { ...body, notes: "changed" },
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call("preparation", "post", `/orders/${order.id}/action`, {
        action: "confirm",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("courier", "post", `/orders/${order.id}/action`, {
        action: "take",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("admin", "post", `/orders/${order.id}/action`, {
        action: "confirm",
      })
    ).status,
    200,
  );
  const takes = await Promise.all([
    call("courier", "post", `/orders/${order.id}/action`, { action: "take" }),
    call("courier", "post", `/orders/${order.id}/action`, { action: "take" }),
  ]);
  assert.deepEqual(takes.map((r) => r.status).sort(), [200, 409]);
  const prepOrders = (await call("preparation", "get", "/orders")).body;
  const po = prepOrders.find((o) => o.id === order.id);
  assert.ok(!("total" in po));
  assert.ok(!("courier_id" in po));
  assert.ok(!("price" in po.items[0]));
  for (const [role, action] of [
    ["preparation", "prepare"],
    ["preparation", "ready"],
    ["courier", "depart"],
    ["courier", "deliver"],
  ])
    assert.equal(
      (await call(role, "post", `/orders/${order.id}/action`, { action }))
        .status,
      200,
    );
  assert.equal(
    (
      await call("courier", "post", `/orders/${order.id}/action`, {
        action: "deliver",
      })
    ).status,
    409,
  );
  const inv = (await call("client", "get", "/invoices")).body.find(
    (i) => i.order_id === order.id,
  );
  const amount = Math.floor(Number(inv.balance) / 2);
  const payBody = {
    clientId: users.client.id,
    method: "nequi",
    amount,
    allocations: [{ invoiceId: inv.id, amount }],
  };
  const pk = randomUUID();
  const pay = await call("courier", "post", "/payments", payBody, pk);
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assert.equal(
    (await call("courier", "post", "/payments", payBody, pk)).body.id,
    pay.body.id,
  );
  assert.equal(
    (await call("client", "get", "/invoices")).body.find((i) => i.id === inv.id)
      .balance,
    inv.balance,
  );
  assert.equal(
    (await call("courier", "post", `/payments/${pay.body.id}/verify`)).status,
    403,
  );
  assert.equal(
    (await call("admin", "post", `/payments/${pay.body.id}/verify`)).status,
    200,
  );
  assert.equal(
    Number(
      (await call("client", "get", "/invoices")).body.find(
        (i) => i.id === inv.id,
      ).balance,
    ),
    Number(inv.balance) - amount,
  );
  const remaining = Number(inv.balance) - amount;
  const cash = {
    ...payBody,
    method: "cash",
    amount: remaining,
    allocations: [{ invoiceId: inv.id, amount: remaining }],
  };
  const results = await Promise.all([
    call("courier", "post", "/payments", cash, randomUUID()),
    call("courier", "post", "/payments", cash, randomUUID()),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  // Separate client cannot see another client's notifications or orders.
  const otherId = randomUUID();
  await pool.query(
    "INSERT INTO users(id,email,name,role) VALUES($1,$2,'Otro cliente','client')",
    [otherId, otherId + "@demo.test"],
  );
  const token = randomUUID();
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",
    [token, otherId],
  );
  const other = await request(app)
    .get("/api/orders")
    .set("Cookie", "session=" + token);
  assert.equal(other.body.length, 0);
  const notices = await request(app)
    .get("/api/notifications")
    .set("Cookie", "session=" + token);
  assert.equal(notices.body.length, 0);
  // Credit row lock serializes simultaneous confirmations.
  const price = Number(products.body[0].price);
  const before = (
    await pool.query("SELECT credit_used FROM users WHERE id=$1", [
      users.client.id,
    ])
  ).rows[0];
  await pool.query("UPDATE users SET credit_limit=credit_used+$2 WHERE id=$1", [
    users.client.id,
    price,
  ]);
  const pending = await Promise.all([
    call("client", "post", "/orders", body, randomUUID()),
    call("client", "post", "/orders", body, randomUUID()),
  ]);
  const confirmations = await Promise.all(
    pending.map((r) =>
      call("admin", "post", `/orders/${r.body.id}/action`, {
        action: "confirm",
      }),
    ),
  );
  assert.deepEqual(confirmations.map((r) => r.status).sort(), [200, 409]);
  await pool.query("UPDATE users SET credit_limit=10000000 WHERE id=$1", [
    users.client.id,
  ]);
});
test("Migraciones aisladas conservan estructura y datos de otros schemas", async () => {
  const { migrate } = await import("../dist-server/migrate.js");
  const probe = "delipina_probe_" + randomUUID().replaceAll("-", "");
  const other = "playita_probe_" + randomUUID().replaceAll("-", "");
  await pool.query(`CREATE SCHEMA "${other}"`);
  await pool.query(
    `CREATE TABLE "${other}".users(id integer PRIMARY KEY,label text)`,
  );
  await pool.query(`INSERT INTO "${other}".users VALUES(1,'conservar')`);
  const original = (await pool.query("SELECT count(*)::int AS n FROM users"))
    .rows[0].n;
  try {
    const result = await migrate(probe);
    assert.equal(result.externalStructureUnchanged, true);
    assert.deepEqual(
      (await pool.query(`SELECT * FROM "${other}".users`)).rows,
      [{ id: 1, label: "conservar" }],
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n,
      original,
    );
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${probe}" CASCADE`);
    await pool.query(`DROP SCHEMA IF EXISTS "${other}" CASCADE`);
  }
});
test("Administración edita, elimina y restaura usuarios; cliente no puede modificar accesos", async () => {
  const email = randomUUID() + "@demo.test";
  const created = await call("admin", "post", "/users", {
    name: "Usuario para prueba",
    email,
    role: "client",
    creditLimit: 0,
  });
  assert.equal(created.status, 200);
  const id = created.body.id;
  assert.equal(
    (await call("client", "patch", "/users/" + id, { name: "No permitido" }))
      .status,
    403,
  );
  assert.equal(
    (
      await call("admin", "patch", "/users/" + id, {
        name: "Nombre actualizado",
        email,
        role: "courier",
        active: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("admin", "delete", "/users/" + users.admin.id)).status,
    409,
  );
  assert.equal((await call("admin", "delete", "/users/" + id)).status, 200);
  const archived = (await call("admin", "get", "/users")).body.find(
    (u) => u.id === id,
  );
  assert.equal(archived.active, false);
  assert.ok(archived.deleted_at);
  assert.equal(
    (
      await call("admin", "patch", "/users/" + id, {
        active: true,
        restore: true,
      })
    ).status,
    200,
  );
});
test("Catálogo editable conserva referencia visual y permisos", async () => {
  const r = await call("admin", "post", "/products", {
    name: "Presentación de prueba",
    presentation: "Bolsa de prueba",
    unit: "kg",
    price: 120000,
    image_key: "trozos",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call("client", "patch", "/products/" + r.body.id, {
        ...r.body,
        price: 1000,
      })
    ).status,
    403,
  );
  const updated = await call("admin", "patch", "/products/" + r.body.id, {
    ...r.body,
    name: "Presentación actualizada",
    price: 140000,
    active: false,
    image_key: "picada",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.image_key, "picada");
  assert.equal(updated.body.active, false);
});
test("Cierre diario conserva historia y permite pedidos para una jornada futura", async () => {
  const day = (await call("admin", "get", "/business-day")).body.day;
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(
    (await call("client", "post", "/business-day/close", { day })).status,
    403,
  );
  const oldBalance = (
    await pool.query("SELECT COALESCE(sum(balance),0) AS n FROM invoices")
  ).rows[0].n;
  try {
    const closed = await call("admin", "post", "/business-day/close", { day });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.equal(
      (await call("admin", "get", "/business-day")).body.reason,
      "daily_close",
    );
    const future = await call("client", "post", "/orders", body, randomUUID());
    assert.equal(future.status, 200);
    const rejectedPayment = await call(
      "courier",
      "post",
      "/payments",
      { clientId: users.client.id, method: "cash", amount: 1, allocations: [] },
      randomUUID(),
    );
    assert.equal(rejectedPayment.status, 409);
    assert.equal(
      (await pool.query("SELECT COALESCE(sum(balance),0) AS n FROM invoices"))
        .rows[0].n,
      oldBalance,
    );
  } finally {
    await pool.query(
      "UPDATE business_days SET closed_at=NULL,closed_by=NULL,summary=NULL WHERE day=$1",
      [day],
    );
  }
});
test("Socket exige sesión y solo transmite invalidaciones sin datos privados", async () => {
  const { createRealtime } = await import("../dist-server/realtime.js");
  const { io: connect } = await import("socket.io-client");
  const io = createRealtime(app);
  await nest.listen(0, "127.0.0.1");
  const address = app.address();
  const url = "http://127.0.0.1:" + address.port;
  const unauth = connect(url, { autoConnect: false, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(Error("Socket sin respuesta")), 3000);
    unauth.on("connect_error", (e) => {
      clearTimeout(t);
      assert.equal(e.message, "Unauthorized");
      unauth.disconnect();
      resolve();
    });
    unauth.connect();
  });
  const client = connect(url, {
    autoConnect: false,
    reconnection: false,
    extraHeaders: { Cookie: users.client.cookie },
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(Error("Socket no recuperó estado")),
      3000,
    );
    client.on("refresh", (payload) => {
      clearTimeout(t);
      assert.equal(payload, undefined);
      resolve();
    });
    client.on("connect_error", reject);
    client.connect();
  });
  client.disconnect();
  await io.close();
});
after(async () => {
  await nest.close();
  await pool.end();
});
