import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, errors } from "../server/app.js";
import { pool } from "../server/db.js";
errors();
const origin = "http://localhost:3000";
const users = {};
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
after(() => pool.end());
