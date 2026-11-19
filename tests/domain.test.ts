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
test("Cierre automático conserva historia, saldos y pedidos futuros", async () => {
  const current = (await call("admin", "get", "/business-day")).body;
  const day = (
    await pool.query("SELECT to_char(current_date-1,'YYYY-MM-DD') AS day")
  ).rows[0].day;
  const oldBalance = (
    await pool.query("SELECT sum(balance) AS n FROM invoices")
  ).rows[0].n;
  await pool.query(
    "INSERT INTO business_days(day,cutoff_at) VALUES($1,now()-interval '1 hour') ON CONFLICT(day) DO UPDATE SET cutoff_at=excluded.cutoff_at,closed_at=NULL",
    [day],
  );
  const closed = await call("admin", "get", "/business-days");
  assert.equal(closed.status, 200);
  const row = closed.body.find((r) => r.day === day);
  assert.equal(row.automatic, true);
  assert.ok(row.closed_at);
  const repeat = await call("admin", "get", "/business-days");
  assert.deepEqual(repeat.body.find((r) => r.day === day).summary, row.summary);
  assert.equal(
    (await pool.query("SELECT sum(balance) AS n FROM invoices")).rows[0].n,
    oldBalance,
  );
  assert.equal(
    (await call("client", "post", "/orders", body, randomUUID())).status,
    200,
  );
  assert.equal(
    (await call("client", "post", "/business-day/close", { day: current.day }))
      .status,
    403,
  );
});
test("Avisos actualizan el mismo pedido y respetan lectura por revisión y propietario", async () => {
  const created = await call("client", "post", "/orders", body, randomUUID());
  assert.equal(created.status, 200);
  const notices = await call("admin", "get", "/notifications");
  const n = notices.body.find((n) => n.order_id === created.body.id);
  assert.ok(n);
  assert.equal(
    (
      await call("admin", "post", "/notifications/" + n.id + "/read", {
        revision: n.revision,
      })
    ).body.read,
    true,
  );
  assert.equal(
    (await call("client", "post", "/notifications/" + n.id + "/read", {}))
      .status,
    404,
  );
  assert.equal(
    (
      await call("admin", "post", "/orders/" + created.body.id + "/action", {
        action: "confirm",
      })
    ).status,
    200,
  );
  const updates = (await call("admin", "get", "/notifications")).body.filter(
    (n) => n.order_id === created.body.id,
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, n.id);
  assert.equal(updates[0].status, "confirmed");
  assert.equal(updates[0].read, false);
  assert.equal(
    (
      await call("admin", "post", "/notifications/" + n.id + "/read", {
        revision: n.revision,
      })
    ).body.read,
    false,
  );
  const counts = (await call("admin", "get", "/notifications/counts")).body;
  assert.ok(counts.find((n) => n.module === "orders").count > 0);
  assert.equal(
    (await call("client", "get", "/orders/" + created.body.id)).status,
    200,
  );
  assert.equal((await call("client", "get", "/analytics")).status, 403);
  assert.equal((await call("admin", "get", "/analytics")).status, 200);
});
test("Abono general distribuye a facturas antiguas y conserva idempotencia", async () => {
  const balance = Number(
    (
      await pool.query(
        "SELECT sum(balance) AS n FROM invoices WHERE client_id=$1",
        [users.client.id],
      )
    ).rows[0].n,
  );
  assert.ok(balance > 0);
  const key = randomUUID(),
    payload = { clientId: users.client.id, method: "cash", amount: 1 };
  const paid = await call("admin", "post", "/payments", payload, key);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.appliedOrders, 1);
  const replay = await call("admin", "post", "/payments", payload, key);
  assert.equal(replay.body.id, paid.body.id);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT sum(balance) AS n FROM invoices WHERE client_id=$1",
          [users.client.id],
        )
      ).rows[0].n,
    ),
    balance - 1,
  );
  const over = await call(
    "admin",
    "post",
    "/payments",
    { ...payload, amount: balance + 1 },
    randomUUID(),
  );
  assert.equal(over.status, 409);
});
test("Horario semanal y anticipación se validan en el servidor", async () => {
  const previous = (await call("admin", "get", "/settings")).body;
  const week = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [
      i + 1,
      { enabled: true, open: "06:00", close: "18:00" },
    ]),
  );
  const weekday = Number(
    (
      await pool.query(
        "SELECT EXTRACT(ISODOW FROM $1::timestamptz AT TIME ZONE 'America/Bogota') AS n",
        [body.start],
      )
    ).rows[0].n,
  );
  try {
    week[weekday] = { enabled: false, open: "06:00", close: "18:00" };
    assert.equal(
      (
        await call("admin", "put", "/settings", {
          ...previous,
          weeklySchedule: week,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("client", "post", "/orders", body, randomUUID())).status,
      400,
    );
    week[weekday].enabled = true;
    assert.equal(
      (
        await call("admin", "put", "/settings", {
          ...previous,
          leadHours: 200,
          weeklySchedule: week,
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("client", "post", "/orders", body, randomUUID())).status,
      400,
    );
  } finally {
    await call("admin", "put", "/settings", previous);
  }
});
test("Fotos de productos genéricos se guardan con permisos y tipo de imagen", async () => {
  const product = await call("admin", "post", "/products", {
    name: "Panela",
    presentation: "500 g",
    unit: "pack",
    price: 300000,
  });
  assert.equal(product.status, 200);
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSXkAAAAASUVORK5CYII=";
  assert.equal(
    (
      await call("client", "post", "/products/" + product.body.id + "/photo", {
        data,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("admin", "post", "/products/" + product.body.id + "/photo", {
        data: "text",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("admin", "post", "/products/" + product.body.id + "/photo", {
        data,
      })
    ).status,
    200,
  );
  const image = await call(
    "client",
    "get",
    "/products/" + product.body.id + "/photo",
  );
  assert.equal(image.status, 200);
  assert.match(image.headers["content-type"], /image\/png/);
  const listed = (await call("client", "get", "/products")).body.find(
    (p) => p.id === product.body.id,
  );
  assert.equal(listed.has_image, true);
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
