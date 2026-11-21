import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../dist-server/app.js";
process.env.DISABLE_AUTOMATIC_JOBS="true";
process.env.ROUTING_DISABLE_NETWORK="true";
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
const testProof="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSXkAAAAASUVORK5CYII=";
const call = (role, method, path, body, key) => {
  if(role.startsWith("courier") && method==="post" && path==="/payments" && body && body.receiptPhoto===undefined)body={...body,receiptPhoto:testProof};
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
  const start = new Date(new Date().toLocaleDateString("en-CA", {timeZone:"America/Bogota"})+"T12:00:00Z");
  start.setUTCDate(start.getUTCDate() + 2);
  start.setUTCHours(15, 0, 0, 0);
  body = {
    branchId: branches.body[0].id,
    start: start.toISOString(),
    end: new Date(+start + 3600000).toISOString(),
    credit: true,
    items: [
      {
        productId: products.body.find(
          (p) => p.name === "Entera" && p.unit === "kg",
        ).id,
        quantity: 1,
      },
    ],
  };
  assert.equal(
    (await call("client", "post", "/products", { name: "x" })).status,
    403,
  );
  assert.equal((await request(app).get("/api/orders")).status, 401);
  assert.equal(
    (await request(app).get("/api/config")).headers[
      "cross-origin-opener-policy"
    ],
    "same-origin-allow-popups",
  );
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
    403,
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
  assert.deepEqual(takes.map((r) => r.status).sort(), [403, 403]);
  assert.equal((await call("admin","post",`/orders/${order.id}/action`,{action:"assign",courierId:users.courier.id})).status,200);
  const prepOrders = (await call("preparation", "get", "/orders")).body;
  const po = prepOrders.find((o) => o.id === order.id);
  assert.ok(!("total" in po));
  assert.ok(!("courier_id" in po));
  assert.ok(!("price" in po.items[0]));
  for (const [role, action] of [
    ["preparation", "prepare"],
    ["preparation", "ready"],
    ["admin", "depart"],
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
  const price = Number(
    products.body.find((p) => p.id === body.items[0].productId).price,
  );
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
    await pool.query("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date-1,'YYYY-MM-DD') AS day")
  ).rows[0].day;
  const oldBalance = (
    await pool.query("SELECT sum(balance) AS n FROM invoices")
  ).rows[0].n;
  await pool.query(
    "INSERT INTO business_days(day,cutoff_at) VALUES($1,now()-interval '1 hour') ON CONFLICT(day) DO UPDATE SET cutoff_at=excluded.cutoff_at,closed_at=NULL",
    [day],
  );
  await pool.query("INSERT INTO orders(id,client_id,branch_id,window_start,window_end,total,status,operation_day) VALUES($1,$2,$3,($4::date+time '06:00') AT TIME ZONE 'America/Bogota',($4::date+time '07:00') AT TIME ZONE 'America/Bogota',0,'cancelled',$4)",[randomUUID(),users.client.id,body.branchId,day]);
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
test("Avisos actualizan un único registro por pedido y respetan la revisión y el propietario", async () => {
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
  const confirmed=updates[0];assert.equal(confirmed.id,n.id);assert.equal(confirmed.status,"confirmed");assert.equal(confirmed.read,false);assert.ok(confirmed.revision>n.revision);
  assert.equal((await call("admin","post","/notifications/"+n.id+"/read",{revision:n.revision})).body.read,false);
  assert.ok(confirmed.client_name);assert.ok(confirmed.window_start);assert.ok(confirmed.window_end);
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
      { enabled: true, open: "06:00", close: "18:00", leadHours: 2 },
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
    const disabledDay = await call(
      "client",
      "post",
      "/orders",
      body,
      randomUUID(),
    );
    assert.equal(disabledDay.status, 200);
    assert.ok(+new Date(disabledDay.body.window_start) > +new Date(body.start));
    week[weekday].enabled = true;
    week[weekday].leadHours = 200;
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
    const leadShift = await call(
      "client",
      "post",
      "/orders",
      body,
      randomUUID(),
    );
    assert.equal(leadShift.status, 200);
    assert.ok(+new Date(leadShift.body.window_start) > +new Date(body.start));
    const other = new Date(body.start);
    other.setUTCDate(other.getUTCDate() + 1);
    const allowed = await call(
      "client",
      "post",
      "/orders",
      {
        ...body,
        start: other.toISOString(),
        end: new Date(+other + 3600000).toISOString(),
      },
      randomUUID(),
    );
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
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
test("Administrador de planta crea pedidos para revisión y no administra accesos ni cartera", async () => {
  await login("plant_admin");
  const people = await call("plant_admin", "get", "/users");
  assert.equal(people.status, 200);
  assert.ok(people.body.length);
  assert.ok(
    people.body.every(
      (u) => u.role === "client" && !("email" in u) && !("credit_limit" in u),
    ),
  );
  assert.equal((await call("plant_admin", "get", "/branches")).status, 200);
  assert.equal((await call("plant_admin", "get", "/invoices")).status, 403);
  assert.equal(
    (
      await call("plant_admin", "post", "/users", {
        name: "No",
        email: "no@test.test",
        role: "admin",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("preparation", "post", "/orders", body, randomUUID())).status,
    403,
  );
  const created = await call(
    "plant_admin",
    "post",
    "/orders",
    { ...body, clientId: users.client.id, credit: false },
    randomUUID(),
  );
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.status, "pending");
  assert.equal(
    (
      await call(
        "plant_admin",
        "post",
        "/orders/" + created.body.id + "/action",
        { action: "confirm" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("admin", "post", "/orders/" + created.body.id + "/action", {
        action: "confirm",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "plant_admin",
        "post",
        "/orders/" + created.body.id + "/action",
        { action: "prepare" },
      )
    ).status,
    200,
  );
});
test("Libra, kilo y arroba conservan precio independiente y unidad en el pedido", async () => {
  const items = [];
  let total = 0;
  for (const [unit, price, quantity] of [
    ["lb", 250000, 2],
    ["kg", 500000, 1.25],
    ["arroba", 6000000, 0.5],
  ] as const) {
    const p = await call("admin", "post", "/products", {
      name: "Unidad de prueba",
      presentation: "Venta por " + unit,
      unit,
      price,
    });
    assert.equal(p.status, 200);
    items.push({ productId: p.body.id, quantity });
    total += Math.round(price * quantity);
  }
  const created = await call(
    "client",
    "post",
    "/orders",
    { ...body, credit: false, items },
    randomUUID(),
  );
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(Number(created.body.total), total);
  const saved = await call("client", "get", "/orders/" + created.body.id);
  assert.ok(saved.body.items.some((i) => i.name.includes("libra")));
  assert.ok(saved.body.items.some((i) => i.name.includes("arroba")));
  const cfg = (await call("admin", "get", "/settings")).body;
  assert.equal(Object.keys(cfg.weeklySchedule).length, 7);
  assert.ok(
    Object.values(cfg.weeklySchedule).every((d: any) =>
      Number.isFinite(d.leadHours),
    ),
  );
});
test("Precios por cliente se guardan desde el catálogo en una transacción y pueden volver al general", async () => {
  const catalog = (
    await call("admin", "get", "/products?clientId=" + users.client.id)
  ).body;
  const selected = catalog
    .filter((p) => p.active && p.name === "Entera")
    .slice(0, 2);
  assert.equal(selected.length, 2);
  const changes = selected.map((p, i) => ({
    productId: p.id,
    price: 123400 + i * 100,
  }));
  assert.equal(
    (
      await call("plant_admin", "put", "/prices", {
        clientId: users.client.id,
        prices: changes,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("admin", "put", "/prices", {
        clientId: users.client.id,
        prices: changes,
      })
    ).status,
    200,
  );
  let priced = (await call("client", "get", "/products")).body;
  for (const change of changes) {
    const p = priced.find((p) => p.id === change.productId);
    assert.equal(Number(p.price), change.price);
    assert.equal(Number(p.special_price), change.price);
    assert.ok(p.base_price);
  }
  const invalid = await call("admin", "put", "/prices", {
    clientId: users.client.id,
    prices: [
      { productId: selected[0].id, price: 999999 },
      { productId: randomUUID(), price: 1 },
    ],
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    Number(
      (await call("client", "get", "/products")).body.find(
        (p) => p.id === selected[0].id,
      ).price,
    ),
    changes[0].price,
  );
  const input = {
    ...body,
    credit: false,
    items: [{ productId: selected[0].id, quantity: 1 }],
  };
  const created = await call("client", "post", "/orders", input, randomUUID());
  assert.equal(created.status, 200);
  assert.equal(
    (
      await call("admin", "put", "/prices", {
        clientId: users.client.id,
        prices: changes.map((p) => ({ ...p, price: null })),
      })
    ).status,
    200,
  );
  priced = (await call("client", "get", "/products")).body;
  assert.equal(priced.find((p) => p.id === selected[0].id).special_price, null);
  assert.equal(
    Number(
      (await call("client", "get", "/orders/" + created.body.id)).body.items[0]
        .price,
    ),
    changes[0].price,
  );
});
test("Módulos personalizados se aplican también en servidor y se revocan en sesiones",async()=>{
 const user=await call('admin','post','/users',{name:'Custom',email:'custom@demo.test',role:'custom',permissions:['orders','plant']});assert.equal(user.status,409); // Semilla de revisión
 await login('custom');assert.equal((await call('custom','get','/users')).status,200);assert.equal((await call('custom','get','/analytics')).status,403);assert.equal((await call('custom','get','/credit-accounts')).status,403);
 const created=await call('custom','post','/orders',{...body,clientId:users.client.id,credit:false},randomUUID());assert.equal(created.status,200);assert.equal(created.body.status,'pending');
 assert.equal((await call('admin','patch','/users/'+users.custom.id,{permissions:['analytics']})).status,200);assert.equal((await call('custom','get','/orders')).status,401);await login('custom');assert.equal((await call('custom','get','/orders')).status,403);assert.equal((await call('custom','get','/analytics')).status,200);
 await call('admin','patch','/users/'+users.custom.id,{permissions:['orders','plant']});await login('custom');
});
test("Gestores de cliente: asociación, cartera opcional y desactivación sin acceso cruzado",async()=>{
 const owner=await call('admin','post','/users',{name:'Cliente titular',email:'owner@demo.test',role:'client'});assert.equal(owner.status,200);await login('owner');const branch=await call('owner','post','/branches',{address:'Sucursal de prueba',city:'Bogotá'});assert.equal(branch.status,200);
 const member=await call('owner','post','/client-members',{name:'Gestor',email:'delegate@demo.test',canViewPortfolio:false,role:'admin'});assert.equal(member.status,200);await login('delegate');assert.equal(users.delegate.role,'client_member');assert.equal(users.delegate.clientId,users.owner.id);
 assert.equal((await call('delegate','get','/branches')).body[0].id,branch.body.id);assert.equal((await call('delegate','get','/invoices')).status,403);assert.equal((await call('delegate','post','/client-members',{name:'No',email:'not@demo.test'})).status,403);
 const cash=await call('delegate','post','/orders',{...body,branchId:branch.body.id,clientId:users.client.id,credit:false,paymentMethod:'cash'},randomUUID());assert.equal(cash.status,400);
 const order=await call('delegate','post','/orders',{...body,branchId:branch.body.id,clientId:users.client.id,credit:false,paymentMethod:'online'},randomUUID());assert.equal(order.status,200,JSON.stringify(order.body));assert.equal(order.body.client_id,users.owner.id);
 assert.equal((await call('client','get','/orders/'+order.body.id)).status,404);
 assert.equal((await call('owner','patch','/client-members/'+member.body.id,{canViewPortfolio:true})).status,200);assert.equal((await call('delegate','get','/credit-accounts')).status,401);await login('delegate');assert.equal((await call('delegate','get','/credit-accounts')).status,200);
 assert.equal((await call('client','patch','/client-members/'+member.body.id,{active:false})).status,404);assert.equal((await call('owner','patch','/client-members/'+member.body.id,{active:false})).status,200);assert.equal((await call('delegate','get','/orders')).status,401);
});
test("Producto con n presentaciones conserva variantes históricas al editar y desactivar",async()=>{
 const group=await call('admin','post','/product-groups',{name:'Salsa de prueba',presentations:[{label:'Frasco',units:[{unit:'pack',price:100000}]},{label:'Bolsa',units:[{unit:'kg',price:200000},{unit:'lb',price:110000}]}]});assert.equal(group.status,200,JSON.stringify(group.body));
 const got=await call('admin','get','/product-groups/'+group.body.id);assert.equal(got.body.variants.length,3);const variant=got.body.variants.find(v=>v.presentation==='Frasco');const created=await call('client','post','/orders',{...body,credit:false,items:[{productId:variant.id,quantity:1}]},randomUUID());assert.equal(created.status,200);
 const saved=await call('admin','put','/product-groups/'+group.body.id,{name:'Salsa nueva',presentations:[{label:'Bolsa',units:got.body.variants.filter(v=>v.presentation==='Bolsa').map(v=>({id:v.id,unit:v.unit,price:Number(v.price)}))}]});assert.equal(saved.status,200);assert.equal((await call('client','post','/orders',{...body,credit:false,items:[{productId:variant.id,quantity:1}]},randomUUID())).status,400);assert.equal(Number((await call('client','get','/orders/'+created.body.id)).body.items[0].price),100000);
 assert.equal((await call('admin','get','/audit?page=0&pageSize=2')).body.rows.length,2);assert.equal((await call('client','get','/audit?page=0')).status,403);assert.ok((await call('admin','get','/business-days?page=0&pageSize=2')).body.total>=0);
});
test("Frecuencias generan una sola repetición y pausar evita nuevas órdenes",async()=>{
 const created=await call('client','post','/orders',{...body,credit:false,recurrence:{enabled:true,frequency:'days',intervalDays:2,weekdays:[]}},randomUUID());assert.equal(created.status,200,JSON.stringify(created.body));const schedule=(await call('client','get','/schedules')).body.find(s=>s.source_order_id===created.body.id);assert.ok(schedule);
 const day=new Date(body.start).toISOString().slice(0,10);await pool.query('UPDATE order_schedules SET next_day=$2 WHERE id=$1',[schedule.id,day]);const{ensureRecurrences}=await import('../dist-server/recurrence.js');await Promise.all([ensureRecurrences(),ensureRecurrences()]);await ensureRecurrences();
 const runs=(await pool.query("SELECT * FROM schedule_runs WHERE schedule_id=$1 AND status='created'",[schedule.id])).rows;assert.equal(runs.length,1);assert.ok(runs[0].order_id);assert.equal((await call('owner','patch','/schedules/'+schedule.id,{active:false})).status,404);assert.equal((await call('client','patch','/schedules/'+schedule.id,{active:false})).status,200);const count=(await pool.query('SELECT count(*)::int n FROM orders')).rows[0].n;await ensureRecurrences();assert.equal((await pool.query('SELECT count(*)::int n FROM orders')).rows[0].n,count);
});
test("Jornada contable espera envío y confirmación de todos los cuadres",async()=>{
 const day=(await pool.query("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date-1,'YYYY-MM-DD') AS day")).rows[0].day;
 await pool.query("INSERT INTO business_days(day,cutoff_at,intake_closed_at) VALUES($1,now()-interval '1 day',now()-interval '1 day') ON CONFLICT(day) DO UPDATE SET closed_at=NULL,intake_closed_at=excluded.intake_closed_at",[day]);
 const id=randomUUID();await pool.query("INSERT INTO orders(id,client_id,branch_id,status,courier_id,delivered_by,window_start,window_end,total,credit,operation_day,delivered_at,sale_day) VALUES($1,$2,$3,'delivered',$4,$4,$5::date+time '10:00',$5::date+time '11:00',100,false,$5,now(),$5)",[id,users.client.id,body.branchId,users.courier.id,day]);
 await call('admin','get','/business-days');assert.equal((await pool.query('SELECT closed_at FROM business_days WHERE day=$1',[day])).rows[0].closed_at,null);
 const submitted=await call('courier','post','/settlements',{day,receivedCash:0});assert.equal(submitted.status,200,JSON.stringify(submitted.body));assert.equal((await pool.query('SELECT closed_at FROM business_days WHERE day=$1',[day])).rows[0].closed_at,null);
 const confirmed=await call('admin','post','/settlements',{day,courierId:users.courier.id,confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));assert.ok((await pool.query('SELECT closed_at FROM business_days WHERE day=$1',[day])).rows[0].closed_at);
});
test("Cartera y cobros de mensajero se limitan a sus pedidos; fuera de zona no hay efectivo",async()=>{
 const courier=await call('admin','post','/users',{name:'Otro mensajero',email:'courier2@demo.test',role:'courier'});assert.equal(courier.status,200);await login('courier2');
 const branch=(await call('owner','get','/branches')).body[0];const created=await call('owner','post','/orders',{...body,branchId:branch.id,credit:false,paymentMethod:'online'},randomUUID());assert.equal(created.status,200);await call('admin','post','/orders/'+created.body.id+'/action',{action:'confirm'});await call('admin','post','/orders/'+created.body.id+'/action',{action:'assign',courierId:users.courier2.id});
 const hidden=(await call('courier','get','/credit-accounts')).body;assert.ok(!hidden.some(r=>r.id===users.owner.id));assert.equal((await call('courier','get','/credit-accounts/'+users.owner.id+'/orders')).body.length,0);
 const own=(await call('courier2','get','/credit-accounts')).body;assert.ok(own.some(r=>r.id===users.owner.id));const inv=(await call('courier2','get','/invoices')).body.find(i=>i.order_id===created.body.id);assert.ok(inv);
 const cash=await call('courier2','post','/payments',{clientId:users.owner.id,method:'cash',amount:1,allocations:[{invoiceId:inv.id,amount:1}]},randomUUID());assert.equal(cash.status,400);
 assert.equal((await call('courier2','get','/settlement-days')).status,200);
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
test('Lote demo es exclusivo de admin, no duplica ni crea facturas y no cuenta como venta',async()=>{
 const denied=await call('client','post','/demo-data',{email:'owner@demo.test'});assert.equal(denied.status,403);
 const beforeDemo=(await call('admin','get','/analytics?from=2000-01-01&to=2100-01-01')).body.totals;
 const made=await call('admin','post','/demo-data',{email:'owner@demo.test',courierId:users.courier.id});assert.equal(made.status,200,JSON.stringify(made.body));assert.equal(made.body.branch_ids.length,9);assert.equal(made.body.order_ids.length,9);assert.deepEqual((await call('admin','get','/analytics?from=2000-01-01&to=2100-01-01')).body.totals,beforeDemo);
 const repeat=await call('admin','post','/demo-data',{email:'owner@demo.test'});assert.equal(repeat.body.id,made.body.id);
 assert.equal((await pool.query('SELECT count(*)::int n FROM invoices WHERE order_id=ANY($1::uuid[])',[made.body.order_ids])).rows[0].n,0);
 const outside=(await pool.query("SELECT o.payment_method,b.city FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.demo_batch_id=$1 AND b.city='Bogotá'",[made.body.id])).rows[0];assert.equal(outside.payment_method,'online');
 assert.equal((await call('client','get','/orders/'+made.body.order_ids[0])).status,404);
});

test("Recorridos automáticos limitados al mensajero y jornada, con grupos de máximo cinco",async()=>{
 const batch=(await pool.query("SELECT * FROM demo_batches WHERE client_id=$1",[users.owner.id])).rows[0];
 await pool.query("UPDATE orders SET operation_day=(now() AT TIME ZONE 'America/Bogota')::date WHERE demo_batch_id=$1",[batch.id]);
 const routes=await call('courier','get','/delivery-routes');assert.equal(routes.status,200,JSON.stringify(routes.body));assert.equal(routes.body.groups.flatMap(g=>g.stops).length,9);assert.ok(routes.body.groups.every(g=>g.stops.length<=5));assert.ok(routes.body.groups.every(g=>g.stops.every(s=>s.city!=='Bogotá')||g.stops.every(s=>s.city==='Bogotá')));assert.ok(routes.body.groups.every(g=>['distance','carrier'].includes(g.mode)));
 const futureDay='2099-01-15';
 const futureOrder=batch.order_ids[0];
 await pool.query("UPDATE orders SET operation_day=$2 WHERE id=$1",[futureOrder,futureDay]);
 const futureRoutes=await call('courier','get','/delivery-routes?day='+futureDay);
 assert.equal(futureRoutes.status,200);assert.equal(futureRoutes.body.day,futureDay);assert.deepEqual(futureRoutes.body.groups.flatMap(g=>g.stops.map(s=>s.id)),[futureOrder]);
 assert.ok((await call('courier','get','/orders')).body.some(o=>o.id===futureOrder));
 assert.ok((await call('courier','get','/delivery-routes')).body.groups.every(g=>g.stops.every(s=>s.id!==futureOrder)));
 assert.equal((await call('courier','get','/delivery-routes?day=2026-02-30')).status,400);
 await pool.query("UPDATE orders SET operation_day=(now() AT TIME ZONE 'America/Bogota')::date WHERE id=$1",[futureOrder]);
 assert.equal((await call('client','get','/delivery-routes')).status,403);assert.equal((await call('courier2','get','/delivery-routes')).body.groups.length,0);
 const id=batch.branch_ids[0];assert.equal((await call('client','patch','/branches/'+id+'/location',{lat:7,lng:-73})).status,404);assert.equal((await call('owner','patch','/branches/'+id+'/location',{lat:91,lng:-73})).status,400);assert.equal((await call('owner','patch','/branches/'+id+'/location',{lat:7.01,lng:-73.04})).status,200);
});
test('Recorrido: inicio atómico, bloqueo de edición en camino y reagrupación de los pendientes',async()=>{
 const planned=await call('courier','get','/delivery-routes');const run=planned.body.groups.find(g=>g.mode!=='carrier'&&g.stops.length>1);assert.ok(run);const ids=run.stops.map(o=>o.id);assert.equal((await call('courier2','post','/delivery-routes/'+run.id+'/start',{})).status,404);
 await pool.query("UPDATE orders SET status='preparing' WHERE id=$1",[ids[0]]);assert.equal((await call('courier','post','/delivery-routes/'+run.id+'/start',{})).status,409);assert.equal((await pool.query("SELECT count(*)::int n FROM orders WHERE id=ANY($1::uuid[]) AND status='enroute'",[ids])).rows[0].n,0);
 await pool.query("UPDATE orders SET status='ready' WHERE id=$1",[ids[0]]);assert.equal((await call('courier','post','/delivery-routes/'+run.id+'/start',{})).status,200);assert.equal((await call('courier','post','/delivery-routes/'+run.id+'/start',{})).status,200);assert.equal((await pool.query("SELECT count(*)::int n FROM orders WHERE id=ANY($1::uuid[]) AND status='enroute'",[ids])).rows[0].n,ids.length);
 assert.equal((await call('courier','patch','/delivery-routes/'+run.id,{orderIds:[ids[0]]})).status,409);const after=(await call('courier','get','/delivery-routes')).body;assert.deepEqual(after.groups.find(g=>g.id===run.id).stops.map(o=>o.id),ids);assert.ok(after.groups.filter(g=>g.id!==run.id).every(g=>g.stops.every(o=>!ids.includes(o.id))));
 const draft=after.groups.find(g=>g.status==='draft'&&g.mode!=='carrier');assert.ok(draft);assert.equal((await call('courier','patch','/delivery-routes/'+draft.id,{orderIds:[draft.stops[0].id]})).status,200);const edited=(await call('courier','get','/delivery-routes')).body.groups.find(g=>g.id===draft.id);assert.equal(edited.stops.length,1);assert.equal(edited.manual,true);assert.equal((await call('courier','post','/delivery-routes/'+draft.id+'/start',{})).status,200);assert.deepEqual((await call('courier','get','/delivery-routes')).body.groups.find(g=>g.id===draft.id).stops.map(o=>o.id),[draft.stops[0].id]);
});
test('Disponibles requieren solicitud y aprobación; dos mensajeros no pueden obtener el mismo pedido',async()=>{
 const batch=(await pool.query('SELECT * FROM demo_batches WHERE client_id=$1',[users.owner.id])).rows[0];const row=(await pool.query("SELECT o.id FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=ANY($1::uuid[]) AND o.status='ready' AND b.city<>'Bogotá' LIMIT 1",[batch.order_ids])).rows[0];assert.ok(row);await pool.query('UPDATE orders SET courier_id=NULL WHERE id=$1',[row.id]);
 const first=await call('courier','post','/delivery-route-requests',{orderIds:[row.id]});assert.equal(first.status,200,JSON.stringify(first.body));const second=await call('courier2','post','/delivery-route-requests',{orderIds:[row.id]});assert.equal(second.status,200);assert.equal((await pool.query('SELECT courier_id FROM orders WHERE id=$1',[row.id])).rows[0].courier_id,null);
 assert.equal((await call('courier','post','/delivery-routes/'+first.body.id+'/decision',{approve:true})).status,403);const approvals=await Promise.all([call('admin','post','/delivery-routes/'+first.body.id+'/decision',{approve:true}),call('admin','post','/delivery-routes/'+second.body.id+'/decision',{approve:true})]);assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
});
test('Comprobante obligatorio al cobrar, privado y persistido con el abono',async()=>{
 const before=(await pool.query('SELECT count(*)::int n FROM payments')).rows[0].n;const denied=await request(app).post('/api/payments').set('Origin',origin).set('Cookie',users.courier.cookie).set('Idempotency-Key',randomUUID()).send({clientId:users.client.id,method:'cash',amount:100});assert.equal(denied.status,400);assert.equal((await pool.query('SELECT count(*)::int n FROM payments')).rows[0].n,before);
 const proof=(await pool.query('SELECT payment_id FROM payment_proofs LIMIT 1')).rows[0];assert.ok(proof);assert.equal((await call('admin','get','/payments/'+proof.payment_id+'/proof')).status,200);assert.equal((await call('owner','get','/payments/'+proof.payment_id+'/proof')).status,404);
});
test('Unidades libres por presentación y cantidades enteras para caja; historial intacto',async()=>{
 const group=await call('admin','post','/product-groups',{name:'Panela por unidad',presentations:[{label:'Bloque',units:[{unit:'Unidad',price:200000},{unit:'Caja x 24',price:4500000}]}]});assert.equal(group.status,200,JSON.stringify(group.body));const variants=(await call('admin','get','/product-groups/'+group.body.id)).body.variants;assert.equal(variants.length,2);const box=variants.find(v=>v.unit==='Caja x 24');assert.equal((await call('client','post','/orders',{...body,credit:false,items:[{productId:box.id,quantity:.5}]},randomUUID())).status,400);assert.equal((await call('client','post','/orders',{...body,credit:false,items:[{productId:box.id,quantity:1}]},randomUUID())).status,200);
});
test('Editar sucursal conserva la dirección de pedidos existentes y respeta propietario',async()=>{
 const before=(await call('client','get','/orders/'+order.id)).body;assert.equal((await call('owner','patch','/branches/'+body.branchId,{address:'No autorizada',city:'Bogotá',lat:4.6,lng:-74.1})).status,404);
 assert.equal((await call('client','patch','/branches/'+body.branchId,{address:'Nueva sucursal editada',city:'Bogotá',lat:4.6,lng:-74.1})).status,200);assert.equal((await call('client','get','/branches')).body.find(b=>b.id===body.branchId).address,'Nueva sucursal editada');assert.equal((await call('client','get','/orders/'+order.id)).body.address,before.address);const plant=(await call('preparation','get','/orders')).body;assert.ok(plant.every(o=>typeof o.client_name==='string'&&!('courier_id' in o)&&!('total' in o)));
});
test('Fin de frecuencia posterior al día base y estados de avisos en español',async()=>{
 const same=String(body.start).slice(0,10);const denied=await call('client','post','/orders',{...body,credit:false,recurrence:{enabled:true,frequency:'days',intervalDays:1,weekdays:[],endDay:same}},randomUUID());assert.equal(denied.status,400);const notices=(await call('client','get','/notifications')).body;assert.ok(notices.every(n=>!/^Pedido: (pending|confirmed|preparing|ready|enroute|delivered)$/.test(n.title)));
});
test('Unidades: renombrar, quitar y permitir decimales conserva el pedido histórico',async()=>{
 const g=await call('admin','post','/product-groups',{name:'Unidades editables',presentations:[{label:'Líquida',units:[{unit:'Litro',fractional:true,price:10000},{unit:'Botella',fractional:false,price:15000}]}]});assert.equal(g.status,200);const variants=(await call('admin','get','/product-groups/'+g.body.id)).body.variants,liter=variants.find(v=>v.unit==='Litro'),bottle=variants.find(v=>v.unit==='Botella');assert.equal(liter.allows_fraction,true);const created=await call('client','post','/orders',{...body,credit:false,paymentMethod:'online',items:[{productId:liter.id,quantity:1.5}]},randomUUID());assert.equal(created.status,200,JSON.stringify(created.body));
 const updated=await call('admin','put','/product-groups/'+g.body.id,{name:'Unidades editables',presentations:[{label:'Líquida',units:[{id:liter.id,unit:'Litro de 1000 ml',fractional:true,price:12000}]}]});assert.equal(updated.status,200);assert.equal((await call('client','post','/orders',{...body,credit:false,paymentMethod:'online',items:[{productId:bottle.id,quantity:1}]},randomUUID())).status,400);const old=(await call('client','get','/orders/'+created.body.id)).body.items[0];assert.ok(old.name.endsWith('(Litro)'));assert.equal(Number(old.price),10000);assert.equal(Number(old.quantity),1.5);const duplicate=await call('admin','post','/product-groups',{name:'Duplicadas',presentations:[{label:'Bloque',units:[{unit:'Caja',price:100},{unit:'caja',price:100}]}]});assert.equal(duplicate.status,400);
});
test('Eliminar y restaurar sucursales conserva pedidos, pausa frecuencias y restringe propietario', async()=>{
 const made=await call('client','post','/branches',{address:'Sucursal a eliminar',city:'Bucaramanga'});assert.equal(made.status,200);const id=made.body.id;
 const placed=await call('client','post','/orders',{...body,branchId:id,credit:false,recurrence:{enabled:true,frequency:'days',intervalDays:2,weekdays:[]}},randomUUID());assert.equal(placed.status,200,JSON.stringify(placed.body));
 const schedule=(await pool.query("SELECT id FROM order_schedules WHERE source_order_id=$1",[placed.body.id])).rows[0];assert.ok(schedule);
 assert.equal((await call('owner','delete','/branches/'+id)).status,404);
 assert.equal((await call('client','delete','/branches/'+id)).status,200);
 assert.ok(!(await call('client','get','/branches')).body.some(b=>b.id===id));
 assert.ok((await call('client','get','/branches?includeDeleted=true')).body.some(b=>b.id===id&&b.deleted_at));
 assert.equal((await call('client','get','/orders/'+placed.body.id)).body.address,'Sucursal a eliminar');
 assert.equal((await pool.query('SELECT active FROM order_schedules WHERE id=$1',[schedule.id])).rows[0].active,false);
 assert.equal((await call('client','patch','/schedules/'+schedule.id,{active:true})).status,409);
 assert.equal((await call('client','post','/orders',{...body,branchId:id,credit:false},randomUUID())).status,400);
 assert.equal((await call('owner','post','/branches/'+id+'/restore',{})).status,404);
 assert.equal((await call('admin','post','/branches/'+id+'/restore',{})).status,200);
 assert.ok((await call('client','get','/branches')).body.some(b=>b.id===id));
 assert.equal((await pool.query('SELECT active FROM order_schedules WHERE id=$1',[schedule.id])).rows[0].active,false);
});
test('Rol personalizado con Pedidos acepta y rechaza; sin módulo no puede hacerlo', async()=>{
 const make=async()=>{const r=await call('client','post','/orders',{...body,credit:false,paymentMethod:'online'},randomUUID());assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const accepted=await make();assert.equal((await call('courier','post','/orders/'+accepted.id+'/action',{action:'confirm'})).status,403);
 assert.equal((await call('custom','post','/orders/'+accepted.id+'/action',{action:'confirm'})).status,200);
 const rejected=await make();assert.equal((await call('custom','post','/orders/'+rejected.id+'/action',{action:'reject',reason:'No hay disponibilidad'})).status,200);
 const denied=await make();await call('admin','patch','/users/'+users.custom.id,{permissions:['plant']});await login('custom');
 assert.equal((await call('custom','post','/orders/'+denied.id+'/action',{action:'confirm'})).status,403);
 assert.equal((await call('custom','post','/orders/'+denied.id+'/action',{action:'reject',reason:'Sin permiso'})).status,403);
 assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[denied.id])).rows[0].status,'pending');
 await call('admin','patch','/users/'+users.custom.id,{permissions:['orders','plant']});await login('custom');
});
test('Cliente y administración deben sumar las horas de anticipación al inicio',async()=>{
 const previous=(await call('admin','get','/settings')).body, oldNow=Date.now;
 const day=new Date();day.setUTCDate(day.getUTCDate()+20);const key=day.toISOString().slice(0,10);
 try {
  const week=Object.fromEntries(Array.from({length:7},(_,i)=>[i+1,{enabled:true,open:'06:00',close:'18:00',leadHours:2}]));
  assert.equal((await call('admin','put','/settings',{...previous,weeklySchedule:week})).status,200);
  Date.now=()=>+new Date(key+'T08:00:00-05:00');
  const early={...body,clientId:users.client.id,start:key+'T09:00:00-05:00',end:key+'T16:00:00-05:00',credit:false,paymentMethod:'online'};
  for(const role of ['client','admin']) { assert.equal((await call(role,'post','/orders',early,randomUUID())).status,400);assert.equal((await call(role,'post','/orders',{...early,start:key+'T10:05:00-05:00'},randomUUID())).status,200); }
 } finally {Date.now=oldNow;await call('admin','put','/settings',previous);}
});
test('Pedidos y saldo: paginación del servidor conserva alcance y no repite filas',async()=>{
 const all=(await call('admin','get','/credit-accounts/'+users.client.id+'/orders')).body;assert.ok(all.length>2);
 const first=await call('admin','get','/credit-accounts/'+users.client.id+'/orders?page=0&pageSize=2');const second=await call('admin','get','/credit-accounts/'+users.client.id+'/orders?page=1&pageSize=2');assert.equal(first.status,200);assert.equal(first.body.total,all.length);assert.equal(first.body.rows.length,2);assert.ok(!first.body.rows.some(a=>second.body.rows.some(b=>a.id===b.id)));
 assert.equal((await call('owner','get','/credit-accounts/'+users.client.id+'/orders?page=0')).status,404);
 assert.equal((await call('admin','get','/credit-accounts/'+users.client.id+'/orders?page=-1')).status,400);
 const courier=(await call('courier','get','/credit-accounts/'+users.client.id+'/orders?page=0&pageSize=100')).body;assert.equal(courier.total,(await call('courier','get','/credit-accounts/'+users.client.id+'/orders')).body.length);
});
test('Entrega fallida permite administración y mensajero asignado, pero protege estado y propiedad',async()=>{
 const o=(await pool.query("SELECT id,courier_id FROM orders WHERE status='enroute' AND courier_id=$1 LIMIT 1",[users.courier.id])).rows[0];assert.ok(o);
 assert.equal((await call('admin','post','/orders/'+o.id+'/action',{action:'failed',reason:'No abrieron la puerta'})).status,200);
 assert.equal((await call('courier','post','/orders/'+o.id+'/action',{action:'failed',reason:'Cliente no responde'})).status,409);
 assert.equal((await call('courier2','post','/orders/'+o.id+'/action',{action:'failed',reason:'No autorizado'})).status,404);
 const saved=(await pool.query('SELECT reason,status FROM orders WHERE id=$1',[o.id])).rows[0];assert.equal(saved.reason,'No abrieron la puerta');assert.equal(saved.status,'rejected');
 const ready=(await pool.query("SELECT id FROM orders WHERE status='ready' LIMIT 1")).rows[0];assert.equal((await call('admin','post','/orders/'+ready.id+'/action',{action:'failed',reason:'Aún no sale'})).status,409);
});
test('Asignación parcial retira pedidos de solicitudes y aprobar conserva únicamente disponibles',async()=>{
 const branch=(await call('owner','get','/branches')).body[0], list=[];
 for(let i=0;i<2;i++){const r=await call('owner','post','/orders',{...body,branchId:branch.id,credit:false,paymentMethod:'online'},randomUUID());assert.equal(r.status,200);list.push(r.body.id);await call('admin','post','/orders/'+r.body.id+'/action',{action:'confirm'});}
 const day=(await call('admin','get','/business-day')).body.day;await pool.query("UPDATE orders SET operation_day=$2 WHERE id=ANY($1::uuid[])",[list,day]);
 const requested=await call('courier','post','/delivery-route-requests',{orderIds:list});assert.equal(requested.status,200,JSON.stringify(requested.body));
 assert.equal((await call('admin','post','/orders/'+list[0]+'/action',{action:'assign',courierId:users.courier2.id})).status,200);
 const remaining=(await call('admin','get','/delivery-route-requests')).body.find(r=>r.id===requested.body.id);assert.deepEqual(remaining.order_ids,[list[1]]);assert.equal(remaining.stops.length,1);
 assert.equal((await call('admin','post','/delivery-routes/'+requested.body.id+'/decision',{approve:true})).status,200);
 assert.equal((await pool.query('SELECT courier_id FROM orders WHERE id=$1',[list[0]])).rows[0].courier_id,users.courier2.id);
 assert.equal((await pool.query('SELECT courier_id FROM orders WHERE id=$1',[list[1]])).rows[0].courier_id,users.courier.id);
 assert.ok(!(await call('admin','get','/delivery-route-requests')).body.some(r=>r.id===requested.body.id));
});
test('Entrega fallida pasa a rechazado; reprogramar recupera En camino, mensajero, factura y crédito',async()=>{
 await pool.query('UPDATE users SET credit_limit=credit_used+100000000 WHERE id=$1',[users.client.id]);
 const r=await call('client','post','/orders',{...body,credit:true},randomUUID());assert.equal(r.status,200,JSON.stringify(r.body));const id=r.body.id;
 for(const action of ['confirm','prepare','ready'])assert.equal((await call('admin','post','/orders/'+id+'/action',{action})).status,200);
 await call('admin','post','/orders/'+id+'/action',{action:'assign',courierId:users.courier.id});await call('admin','post','/orders/'+id+'/action',{action:'depart'});
 const invoice=(await pool.query('SELECT * FROM invoices WHERE order_id=$1',[id])).rows[0],credit=(await pool.query('SELECT credit_used FROM users WHERE id=$1',[users.client.id])).rows[0].credit_used;
 assert.equal((await call('courier','post','/orders/'+id+'/action',{action:'failed',reason:'Local cerrado'})).status,200);
 const failed=(await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];assert.equal(failed.status,'rejected');assert.ok(failed.delivery_failed_at);assert.equal(failed.courier_id,users.courier.id);
 const start=new Date(body.start);start.setUTCDate(start.getUTCDate()+1);const end=new Date(+start+3600000);
 const scheduled=await call('admin','post','/orders/'+id+'/action',{action:'reschedule',start:start.toISOString(),end:end.toISOString()});assert.equal(scheduled.status,200,JSON.stringify(scheduled.body));
 const resumed=(await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];assert.equal(resumed.status,'enroute');assert.equal(resumed.courier_id,users.courier.id);assert.equal(resumed.delivery_failed_at,null);
 assert.equal((await pool.query('SELECT id FROM invoices WHERE order_id=$1',[id])).rows[0].id,invoice.id);assert.equal((await pool.query('SELECT credit_used FROM users WHERE id=$1',[users.client.id])).rows[0].credit_used,credit);
 assert.ok((await pool.query("SELECT 1 FROM delivery_runs WHERE courier_id=$1 AND status='enroute' AND $2=ANY(order_ids)",[users.courier.id,id])).rowCount);
 const notes=(await pool.query("SELECT details FROM audit WHERE order_id=$1 AND action='failed'",[id])).rows;assert.ok(notes.some(a=>a.details.reason==='Local cerrado'));
});
test('Limpieza administrativa reversible conserva catálogo, usuarios y archivos binarios',async()=>{
 const {cleanupOperations,restoreOperations,maintenancePreview,operationalTables}=await import('../dist-server/maintenance.js');
 assert.equal((await call('client','get','/maintenance/preview')).status,403);
 assert.equal((await call('courier','post','/maintenance/cleanup',{confirmation:'LIMPIAR DELIPIÑA'})).status,403);
 assert.equal((await call('admin','post','/maintenance/cleanup',{confirmation:'incorrecto'})).status,400);
 const invoice=(await pool.query('SELECT id FROM invoices LIMIT 1')).rows[0];
 const bytes=Buffer.from([0,1,127,128,255]);
 await pool.query("INSERT INTO invoice_photos(invoice_id,mime,data) VALUES($1,'image/png',$2) ON CONFLICT(invoice_id) DO UPDATE SET data=$2",[invoice.id,bytes]);
 const before=await maintenancePreview();
 const credits=(await pool.query('SELECT id,credit_used FROM users ORDER BY id')).rows;
 const cleared=await cleanupOperations(users.admin.id,'LIMPIAR DELIPIÑA');
 for(const name of operationalTables)assert.equal(Number((await pool.query('SELECT count(*) FROM '+name)).rows[0].count),0,name);
 assert.equal((await pool.query('SELECT count(*) FROM users WHERE credit_used<>0')).rows[0].count,'0');
 assert.deepEqual((await maintenancePreview()).preserved,before.preserved);
 assert.equal((await call('client','get','/maintenance/archives/'+cleared.id+'/download')).status,403);
 await pool.query("INSERT INTO business_days(day,cutoff_at) VALUES((now() AT TIME ZONE 'America/Bogota')::date,now())");
 const current=await call('admin','get','/business-day');assert.equal(current.status,200);assert.ok(current.body.day);assert.ok(current.body.cutoffAt);
 await call('admin','get','/business-days');await call('admin','get','/business-day');
 assert.equal((await pool.query('SELECT count(*) FROM business_days')).rows[0].count,'0','Consultar apertura o días futuros no crea jornadas sin pedidos');
 const restored=await restoreOperations(users.admin.id,cleared.id,'RESTAURAR DELIPIÑA');
 const after=await maintenancePreview();assert.deepEqual(after.counts,before.counts);assert.deepEqual(after.preserved,before.preserved);
 assert.deepEqual((await pool.query('SELECT id,credit_used FROM users ORDER BY id')).rows,credits);
 assert.deepEqual((await pool.query('SELECT data FROM invoice_photos WHERE invoice_id=$1',[invoice.id])).rows[0].data,bytes);
 assert.ok((await pool.query('SELECT 1 FROM maintenance_archives WHERE id=ANY($1::uuid[])',[[cleared.id,restored.safetyId]])).rowCount===2);
});
test('FCM vincula un dispositivo con código de un solo uso, permiso y aislamiento de usuario',async()=>{
 const previous=process.env.FIREBASE_SERVICE_ACCOUNT;process.env.FIREBASE_SERVICE_ACCOUNT='{}';
 try{
 const deviceKey='a'.repeat(64),token='test-device-token-'.repeat(8);
 const pair=await request(app).post('/api/native-push/pair').send({deviceKey,token});assert.equal(pair.status,200,JSON.stringify(pair.body));assert.equal(pair.body.code.length,64);
 assert.equal((await request(app).post('/api/native-push/claim').set('Origin',origin).send({code:pair.body.code})).status,401);
 const claimed=await call('client','post','/native-push/claim',{code:pair.body.code});assert.equal(claimed.status,200);
 assert.equal((await call('admin','post','/native-push/claim',{code:pair.body.code})).status,409);
 assert.equal((await call('admin','get','/native-push/device?id='+claimed.body.id)).body.id,null);
 assert.equal((await call('admin','put','/native-push/device',{id:claimed.body.id,enabled:false})).status,404);
 const own=(await call('client','get','/native-push/device?id='+claimed.body.id)).body;assert.equal(own.enabled,true);assert.equal(own.token,undefined);
 assert.equal((await call('client','put','/native-push/device',{id:claimed.body.id,enabled:false})).status,200);
 assert.equal((await call('client','get','/native-push/device?id='+claimed.body.id)).body.enabled,false);
 const expired=await request(app).post('/api/native-push/pair').send({deviceKey,token});await pool.query("UPDATE native_push_devices SET expires_at=now()-interval '1 minute' WHERE id=$1",[claimed.body.id]);assert.equal((await call('client','post','/native-push/claim',{code:expired.body.code})).status,409);
 await pool.query('DELETE FROM native_push_devices WHERE id=$1',[claimed.body.id]);
 }finally{if(previous===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT;else process.env.FIREBASE_SERVICE_ACCOUNT=previous;}
});

test('FCM nativo exige sesión y mueve el dispositivo al usuario que inicia sesión',async()=>{
 const previous=process.env.FIREBASE_SERVICE_ACCOUNT;process.env.FIREBASE_SERVICE_ACCOUNT='{}';
 let id:string|undefined;
 try {
 const deviceKey='b'.repeat(64),token='native-device-token-'.repeat(8);
 assert.equal((await request(app).post('/api/native-push/register').set('Origin',origin).send({deviceKey,token})).status,401);
 assert.equal((await call('client','post','/native-push/register',{deviceKey,token:'short'})).status,400);
 const created=await call('client','post','/native-push/register',{deviceKey,token});assert.equal(created.status,200);id=created.body.id;
 const rotated=await call('client','post','/native-push/register',{deviceKey,token:token+'rotated'});assert.equal(rotated.body.id,id);
 assert.equal((await call('admin','put','/native-push/device',{id,enabled:false})).status,404);
 const moved=await call('admin','post','/native-push/register',{deviceKey,token});assert.equal(moved.body.id,id);
 assert.equal((await call('client','get','/native-push/device?id='+id)).body.id,null);
 assert.equal((await call('admin','get','/native-push/device?id='+id)).body.enabled,true);
 assert.equal((await call('admin','put','/native-push/device',{id,enabled:false})).status,200);
 }finally{if(id)await pool.query('DELETE FROM native_push_devices WHERE id=$1',[id]);if(previous===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT;else process.env.FIREBASE_SERVICE_ACCOUNT=previous;}
});

test('Google Maps conserva metadatos de origen y sucursal; las coordenadas vencidas se retiran', async()=>{
 const {maintainGoogleLocations}=await import('../dist-server/google-locations.js');
 const created=await call('admin','post','/branches',{clientId:users.client.id,address:'Sucursal de prueba Google',city:'Girón',lat:7.07,lng:-73.16,locationSource:'google',placeId:'google-test-place'});
 assert.equal(created.status,200,JSON.stringify(created.body));const branch=created.body;
 try{
 assert.equal(branch.location_source,'google');assert.equal(branch.location_place_id,'google-test-place');
 assert.ok(+new Date(branch.location_expires_at)>Date.now());assert.ok(+new Date(branch.location_expires_at)<Date.now()+30*86400000);
 const edited=await call('admin','patch','/branches/'+branch.id,{address:branch.address,city:branch.city,lat:branch.lat,lng:branch.lng,locationSource:'google',placeId:branch.location_place_id,expiresAt:branch.location_expires_at});assert.equal(edited.status,200);assert.equal(+new Date(edited.body.location_expires_at),+new Date(branch.location_expires_at));
 await pool.query("UPDATE branches SET location_expires_at=now()-interval '1 hour' WHERE id=$1",[branch.id]);
 await maintainGoogleLocations(true);
 const stale=(await pool.query('SELECT * FROM branches WHERE id=$1',[branch.id])).rows[0];assert.equal(stale.lat,null);assert.equal(stale.lng,null);assert.equal(stale.location_place_id,'google-test-place');
 assert.equal((await request(app).get('/api/maps/config')).status,401);
 const config=await call('admin','get','/maps/config');assert.equal(config.status,200);assert.equal(config.body.serverKey,undefined);
 }finally{await pool.query('DELETE FROM branches WHERE id=$1',[branch.id]);}
});

test('Acciones rápidas de avisos verifican permiso, propietario y revisión; lectura es atómica',async()=>{
 const make=async()=>{const r=await call('client','post','/orders',{...body,credit:false,paymentMethod:'online'},randomUUID());assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const order=await make();
 const notice=async(role,id)=>(await call(role,'get','/notifications')).body.find(n=>n.order_id===id&&n.status==='pending');
 const n=await notice('admin',order.id), custom=await notice('custom',order.id), own=await notice('client',order.id);
 const decision=(n,action='confirm')=>({action,notificationId:n.id,revision:n.revision});
 assert.equal((await call('client','post','/orders/'+order.id+'/action',decision(own))).status,403);
 assert.equal((await call('courier','post','/orders/'+order.id+'/action',decision(n))).status,403);
 assert.equal((await call('admin','post','/orders/'+order.id+'/action',decision(custom))).status,404);
 assert.equal((await call('admin','post','/orders/'+order.id+'/action',{...decision(n),revision:n.revision+1})).status,409);
 assert.equal((await notice('admin',order.id)).read,false);
 assert.equal((await call('custom','post','/orders/'+order.id+'/action',decision(custom))).status,200);
 const customRows=(await call('custom','get','/notifications')).body.filter(n=>n.order_id===order.id);assert.equal(customRows.length,1);assert.equal(customRows[0].id,custom.id);assert.equal(customRows[0].title,"Pedido: Confirmado");assert.ok(customRows.every(n=>n.read));
 assert.equal((await call('admin','get','/notifications')).body.find(r=>r.id===n.id).read,false);
 assert.equal((await call('admin','post','/orders/'+order.id+'/action',decision(n,'reject'))).status,409);
 assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[order.id])).rows[0].status,'confirmed');
 const reject=await make(), rejection=await notice('admin',reject.id);
 assert.equal((await call('admin','post','/orders/'+reject.id+'/action',decision(rejection,'reject'))).status,200);
 assert.ok((await call('admin','get','/notifications')).body.filter(n=>n.order_id===reject.id).every(n=>n.read));
 assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[reject.id])).rows[0].status,'rejected');
});

test('Descartar persiste lectura, respeta revisión y permite reaparecer solo ante un cambio nuevo',async()=>{
 const created=await call('client','post','/orders',{...body,credit:false,paymentMethod:'online'},randomUUID());assert.equal(created.status,200);
 const get=async(role)=>(await call(role,'get','/notifications')).body.find(n=>n.order_id===created.body.id);
 const n=await get('admin'), client=await get('client');
 assert.equal((await call('client','post','/notifications/'+n.id+'/dismiss',{revision:n.revision})).status,404);
 assert.equal((await call('admin','post','/notifications/'+n.id+'/dismiss',{revision:n.revision+1})).status,409);
 assert.equal((await get('admin')).read,false);
 assert.equal((await call('client','post','/notifications/'+client.id+'/dismiss',{revision:client.revision})).status,200);
 assert.equal(await get('client'),undefined);
 const before=(await call('admin','get','/notifications/counts')).body.find(r=>r.module==='orders')?.count||0;
 const dismissed=await call('admin','post','/notifications/'+n.id+'/dismiss',{revision:n.revision});assert.equal(dismissed.status,200);assert.equal(dismissed.body.read,true);assert.equal(dismissed.body.dismissed,true);
 assert.equal(await get('admin'),undefined);
 assert.equal((await call('admin','get','/notifications/counts')).body.find(r=>r.module==='orders')?.count||0,before-1);
 assert.equal((await call('admin','post','/notifications/'+n.id+'/dismiss',{revision:n.revision})).status,200);
 assert.equal((await call('admin','post','/orders/'+created.body.id+'/action',{action:'confirm'})).status,200);
 const updated=await get('admin');assert.equal(updated.id,n.id);assert.equal(updated.dismissed,false);assert.equal(updated.read,false);assert.equal(updated.status,'confirmed');assert.equal(updated.title,'Pedido: Confirmado');
 assert.equal((await call('admin','post','/notifications/'+n.id+'/dismiss',{revision:n.revision})).status,409);assert.ok(await get('admin'));
});

test('La reparación conserva IDs históricos pero muestra solo el estado actual por pedido',async()=>{
 const {readFile}=await import('node:fs/promises');const c=await pool.connect();
 try{
 await c.query('BEGIN');
 await c.query('CREATE TEMP TABLE orders(id uuid PRIMARY KEY,status text) ON COMMIT DROP');
 await c.query('CREATE TEMP TABLE notifications(id uuid PRIMARY KEY,user_id uuid,order_id uuid,status text,title text,read boolean,event_key text,revision int,updated_at timestamptz,UNIQUE(user_id,event_key)) ON COMMIT DROP');
 const user=randomUUID(),order=randomUUID(),ready=randomUUID(),pending=randomUUID();
 await c.query("INSERT INTO orders VALUES($1,'ready')",[order]);
 await c.query("INSERT INTO notifications VALUES($1,$3,$4,'ready','Pedido: Listo para despacho',false,'order:ready',2,now()-interval '1 hour'),($2,$3,$4,'pending','Nuevo pedido',false,'order:pending',1,now())",[ready,pending,user,order]);
 await c.query(await readFile('migrations/024.sql','utf8'));
 const rows=(await c.query('SELECT * FROM notifications')).rows;assert.equal(rows.length,2);
 const visible=rows.filter(n=>!n.dismissed);assert.equal(visible.length,1);assert.equal(visible[0].id,ready);assert.equal(visible[0].status,'ready');assert.equal(visible[0].event_key,'order:'+order);
 assert.equal(rows.find(n=>n.id===pending).dismissed,true);assert.equal(rows.find(n=>n.id===pending).read,true);
 }finally{await c.query('ROLLBACK');c.release();}
});
