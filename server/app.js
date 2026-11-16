import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import * as webpush from "web-push";
import { pool, tx, fail } from "./db.js";
process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;
export const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
const production = process.env.NODE_ENV === "production";
if (production && process.env.DEV_AUTH === "true")
  throw Error("DEV_AUTH prohibido en producción");
export let io;
export function setIO(value) {
  io = value;
}
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  email: u.email,
});
export async function session(token) {
  return (
    await pool.query(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now() AND u.active",
      [token],
    )
  ).rows[0];
}
app.use(async (req, res, next) => {
  try {
    req.user = await session(req.cookies.session);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== process.env.APP_ORIGIN
    )
      fail(403, "Origen no permitido");
    next();
  } catch (e) {
    next(e);
  }
});
const route = (method, path, fn) =>
  app[method](path, async (req, res, next) => {
    try {
      res.json(await fn(req, res));
    } catch (e) {
      next(e);
    }
  });
const auth = (req, roles) => {
  if (!req.user) fail(401, "Inicia sesión");
  if (roles && !roles.includes(req.user.role))
    fail(403, "Acceso no autorizado");
  return req.user;
};
async function login(res, u) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",
    [token, u.id],
  );
  res.cookie("session", token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 604800000,
  });
  return safeUser(u);
}
route("get", "/api/config", async () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  devAuth: !production && process.env.DEV_AUTH === "true",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
}));
route("post", "/api/auth/dev", async (req, res) => {
  if (production || process.env.DEV_AUTH !== "true") fail(404, "No disponible");
  const u = (
    await pool.query("SELECT * FROM users WHERE email=$1 AND active", [
      req.body.email,
    ])
  ).rows[0];
  if (!u) fail(401, "Usuario demo inexistente");
  return login(res, u);
});
route("post", "/api/auth/google", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) fail(503, "Google aún no configurado");
  const ticket = await new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
  ).verifyIdToken({
    idToken: req.body.credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload();
  if (!p.email_verified || !p.sub) fail(401, "Correo no verificado");
  const email = p.email.toLowerCase();
  const u = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    let u = (
      await c.query(
        "SELECT * FROM users WHERE google_sub=$1 OR email=$2 FOR UPDATE",
        [p.sub, email],
      )
    ).rows[0];
    if (u) {
      if (!u.active || (u.google_sub && u.google_sub !== p.sub))
        fail(403, "Cuenta no disponible");
      if (!u.google_sub) {
        if (!email.endsWith("@gmail.com") && !p.hd)
          fail(
            403,
            "Vinculación de correo externo requiere revisión administrativa",
          );
        await c.query("UPDATE users SET google_sub=$1 WHERE id=$2", [
          p.sub,
          u.id,
        ]);
      }
    } else {
      u = (
        await c.query(
          "INSERT INTO users(id,email,name,role,google_sub) VALUES($1,$2,$3,'client',$4) RETURNING *",
          [randomUUID(), email, p.name || email, p.sub],
        )
      ).rows[0];
    }
    return u;
  });
  return login(res, u);
});
route("post", "/api/logout", async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE token=$1", [
    req.cookies.session,
  ]);
  res.clearCookie("session");
  return { ok: true };
});
route("get", "/api/me", async (req) => safeUser(auth(req)));
const cents = (n) => {
  if (!Number.isSafeInteger(n) || n < 0)
    fail(400, "Importe inválido (centavos)");
  return n;
};
const text = (v, max = 500) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(400, "Texto inválido");
  return v.trim();
};
route("get", "/api/products", async (req) => {
  const u = auth(req);
  return (
    await pool.query(
      "SELECT p.*,COALESCE(s.price,p.price) AS price FROM products p LEFT JOIN prices s ON s.product_id=p.id AND s.client_id=$1 WHERE p.active OR $2",
      [u.id, u.role === "admin"],
    )
  ).rows;
});
route("post", "/api/products", async (req) => {
  auth(req, ["admin"]);
  const b = req.body;
  if (!["kg", "pack"].includes(b.unit)) fail(400, "Unidad inválida");
  return (
    await pool.query(
      "INSERT INTO products VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        b.id || randomUUID(),
        text(b.name, 100),
        text(b.presentation, 100),
        b.unit,
        cents(b.price),
        b.active !== false,
      ],
    )
  ).rows[0];
});
route("patch", "/api/products/:id", async (req) => {
  auth(req, ["admin"]);
  const b = req.body;
  return (
    await pool.query(
      "UPDATE products SET name=$2,presentation=$3,price=$4,active=$5 WHERE id=$1 RETURNING *",
      [
        req.params.id,
        text(b.name, 100),
        text(b.presentation, 100),
        cents(b.price),
        !!b.active,
      ],
    )
  ).rows[0];
});
route("get", "/api/users", async (req) => {
  auth(req, ["admin"]);
  return (
    await pool.query(
      "SELECT id,email,name,role,credit_limit,credit_used,active FROM users ORDER BY name",
    )
  ).rows;
});
route("post", "/api/users", async (req) => {
  auth(req, ["admin"]);
  const b = req.body;
  if (!["admin", "courier", "client", "preparation"].includes(b.role))
    fail(400, "Rol inválido");
  return (
    await pool.query(
      "INSERT INTO users(id,email,name,role,credit_limit) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role",
      [
        randomUUID(),
        text(b.email, 200).toLowerCase(),
        text(b.name, 100),
        b.role,
        cents(b.creditLimit || 0),
      ],
    )
  ).rows[0];
});
route("put", "/api/prices", async (req) => {
  auth(req, ["admin"]);
  const b = req.body;
  await pool.query(
    "INSERT INTO prices VALUES($1,$2,$3) ON CONFLICT(client_id,product_id) DO UPDATE SET price=excluded.price",
    [b.clientId, b.productId, cents(b.price)],
  );
  return { ok: true };
});
route("patch", "/api/users/:id", async (req) => {
  const admin = auth(req, ["admin"]);
  const b = req.body;
  return tx(async (c) => {
    const u = (
      await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!u) fail(404, "Usuario inexistente");
    if (u.id === admin.id && b.active === false)
      fail(409, "No puedes deshabilitar tu propia cuenta");
    const limit = cents(b.creditLimit);
    if (limit < Number(u.credit_used))
      fail(409, "El cupo no puede ser inferior al saldo reservado");
    await c.query("UPDATE users SET credit_limit=$2,active=$3 WHERE id=$1", [
      u.id,
      limit,
      b.active !== false,
    ]);
    if (b.active === false)
      await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
    return { ok: true };
  });
});
route("get", "/api/branches", async (req) => {
  const u = auth(req, ["admin", "client"]);
  return (
    await pool.query("SELECT * FROM branches WHERE client_id=$1 OR $2", [
      u.id,
      u.role === "admin",
    ])
  ).rows;
});
route("post", "/api/branches", async (req) => {
  const u = auth(req, ["admin", "client"]);
  const b = req.body;
  return (
    await pool.query("INSERT INTO branches VALUES($1,$2,$3,$4) RETURNING *", [
      randomUUID(),
      u.role === "client" ? u.id : b.clientId,
      text(b.address),
      b.city,
    ])
  ).rows[0];
});
route("get", "/api/settings", async (req) => {
  auth(req);
  return (await pool.query("SELECT data FROM settings WHERE id=1")).rows[0]
    .data;
});
route("put", "/api/settings", async (req) => {
  auth(req, ["admin"]);
  const b = req.body;
  if (
    !Number.isInteger(b.open) ||
    !Number.isInteger(b.close) ||
    b.open < 0 ||
    b.close > 24 ||
    b.open >= b.close ||
    !Number.isFinite(b.leadHours) ||
    b.leadHours < 0
  )
    fail(400, "Horario inválido");
  await pool.query("UPDATE settings SET data=$1 WHERE id=1", [
    {
      origin: text(b.origin),
      open: b.open,
      close: b.close,
      leadHours: b.leadHours,
    },
  ]);
  return { ok: true };
});
async function notify(c, order, title, roles) {
  await c.query(
    "INSERT INTO notifications(id,user_id,title,order_id) SELECT gen_random_uuid(),id,$2,$3 FROM users WHERE active AND (role=ANY($1::text[]) OR (id=$4 AND $5))",
    [
      roles.filter((r) => r !== "client"),
      title,
      order.id,
      order.client_id,
      roles.includes("client"),
    ],
  );
}
async function broadcast() {
  // Never send order data through a role room; clients refetch authorized state.
  io?.emit("refresh");
  await dispatchPush();
}
let pushing = false;
async function dispatchPush() {
  if (pushing || !process.env.VAPID_PRIVATE_KEY) return;
  pushing = true;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const rows = (
      await pool.query(
        "SELECT s.*,n.title,n.id AS notification_id FROM subscriptions s JOIN notifications n ON n.user_id=s.user_id WHERE n.created_at>now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.notification_id=n.id AND d.endpoint=s.endpoint)",
      )
    ).rows;
    await Promise.allSettled(
      rows.map(async (s) => {
        const claim = await pool.query(
          "INSERT INTO push_deliveries(notification_id,endpoint) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *",
          [s.notification_id, s.endpoint],
        );
        if (!claim.rowCount) return;
        try {
          await webpush.sendNotification(
            s.payload,
            JSON.stringify({ title: s.title, id: s.notification_id }),
          );
        } catch (e) {
          await pool.query(
            "DELETE FROM push_deliveries WHERE notification_id=$1 AND endpoint=$2",
            [s.notification_id, s.endpoint],
          );
          if ([404, 410].includes(e.statusCode))
            await pool.query("DELETE FROM subscriptions WHERE endpoint=$1", [
              s.endpoint,
            ]);
        }
      }),
    );
  } finally {
    pushing = false;
  }
}
const orderVisible = (u, o) =>
  u.role === "admin" ||
  u.role === "preparation" ||
  (u.role === "client" && o.client_id === u.id) ||
  (u.role === "courier" &&
    (o.courier_id === u.id ||
      (!o.courier_id &&
        !["rejected", "cancelled", "delivered"].includes(o.status))));
route("get", "/api/orders", async (req) => {
  const u = auth(req);
  const rows = (
    await pool.query(
      `SELECT o.*,b.address,b.city,u.name AS client_name,(SELECT json_agg(i) FROM items i WHERE i.order_id=o.id) AS items FROM orders o JOIN branches b ON b.id=o.branch_id JOIN users u ON u.id=o.client_id ORDER BY o.created_at`,
    )
  ).rows.filter((o) => orderVisible(u, o));
  return rows.map((o) => {
    if (u.role === "preparation") {
      const { id, status, window_start, window_end, notes, created_at } = o;
      return {
        id,
        status,
        window_start,
        window_end,
        notes,
        created_at,
        items: o.items.map(({ name, quantity }) => ({ name, quantity })),
      };
    }
    if (u.role === "client") {
      delete o.courier_id;
      delete o.delivered_by;
    }
    return o;
  });
});
route("post", "/api/orders", async (req) => {
  const u = auth(req, ["admin", "client"]);
  const b = req.body;
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 100) fail(400, "Falta clave de sincronización");
  const hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
  const result = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [u.id + key]);
    const previous = (
      await c.query("SELECT * FROM idempotency WHERE user_id=$1 AND key=$2", [
        u.id,
        key,
      ])
    ).rows[0];
    if (previous) {
      if (previous.request_hash !== hash)
        fail(409, "Clave reutilizada con datos distintos");
      return previous.response;
    }
    const clientId = u.role === "client" ? u.id : b.clientId;
    const client = (
      await c.query(
        "SELECT * FROM users WHERE id=$1 AND role='client' AND active FOR UPDATE",
        [clientId],
      )
    ).rows[0];
    if (!client) fail(400, "Cliente inválido");
    const branch = (
      await c.query("SELECT * FROM branches WHERE id=$1 AND client_id=$2", [
        b.branchId,
        clientId,
      ])
    ).rows[0];
    if (!branch) fail(400, "Sucursal inválida");
    const cfg = (await c.query("SELECT data FROM settings WHERE id=1")).rows[0]
      .data;
    const start = new Date(b.start),
      end = new Date(b.end);
    const hour = (d) =>
      Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(d),
      ) +
      d.getUTCMinutes() / 60;
    const day = (d) =>
      d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      +start < Date.now() + cfg.leadHours * 3600000 ||
      end <= start ||
      day(start) !== day(end) ||
      hour(start) < cfg.open ||
      hour(end) > cfg.close
    )
      fail(400, "Rango fuera del horario o anticipación");
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100)
      fail(400, "Agrega productos");
    let total = 0;
    const items = [];
    for (const item of b.items) {
      const p = (
        await c.query(
          "SELECT p.*,COALESCE(s.price,p.price) AS actual_price FROM products p LEFT JOIN prices s ON s.product_id=p.id AND s.client_id=$2 WHERE p.id=$1 AND p.active",
          [item.productId, clientId],
        )
      ).rows[0];
      const q = Number(item.quantity);
      if (
        !p ||
        !Number.isFinite(q) ||
        q <= 0 ||
        q > 10000 ||
        Math.abs(q * 1000 - Math.round(q * 1000)) > 0.000001 ||
        (p.unit === "pack" && !Number.isInteger(q))
      )
        fail(400, "Cantidad o producto inválido");
      const price = Number(p.actual_price);
      total += Math.round(price * q);
      items.push({ p, q, price });
    }
    if (!Number.isSafeInteger(total)) fail(400, "Total inválido");
    if (b.credit && Number(client.credit_limit) === 0)
      fail(409, "Crédito no autorizado");
    const status = u.role === "admin" ? "confirmed" : "pending";
    if (status === "confirmed" && b.credit) {
      if (Number(client.credit_used) + total > Number(client.credit_limit))
        fail(409, "Cupo insuficiente");
      await c.query("UPDATE users SET credit_used=credit_used+$2 WHERE id=$1", [
        clientId,
        total,
      ]);
    }
    const o = (
      await c.query(
        "INSERT INTO orders(id,client_id,branch_id,status,window_start,window_end,total,credit,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          randomUUID(),
          clientId,
          branch.id,
          status,
          start,
          end,
          total,
          !!b.credit,
          typeof b.notes === "string" ? b.notes.slice(0, 1000) : "",
        ],
      )
    ).rows[0];
    for (const { p, q, price } of items)
      await c.query("INSERT INTO items VALUES($1,$2,$3,$4,$5)", [
        o.id,
        p.id,
        `${p.name} · ${p.presentation}`,
        q,
        price,
      ]);
    if (status === "confirmed") await createInvoice(c, o);
    await c.query(
      "INSERT INTO audit(order_id,actor_id,action) VALUES($1,$2,$3)",
      [o.id, u.id, "created"],
    );
    await notify(c, o, "Nuevo pedido", ["admin", "courier", "preparation"]);
    await c.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
      u.id,
      key,
      hash,
      o,
    ]);
    return o;
  });
  await broadcast();
  return result;
});
async function createInvoice(c, o) {
  await c.query(
    "INSERT INTO invoices(id,order_id,client_id,total,balance) VALUES($1,$2,$3,$4,$4) ON CONFLICT(order_id) DO NOTHING",
    [randomUUID(), o.id, o.client_id, o.total],
  );
}
route("post", "/api/orders/:id/action", async (req) => {
  const u = auth(req),
    b = req.body;
  const result = await tx(async (c) => {
    const o = (
      await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!o || !orderVisible(u, o)) fail(404, "Pedido no disponible");
    const admin = u.role === "admin";
    let status = o.status;
    if (b.action === "take") {
      if (
        u.role !== "courier" ||
        o.courier_id ||
        !["confirmed", "preparing", "ready"].includes(status)
      )
        fail(409, "Pedido no disponible para tomar");
      await c.query("UPDATE orders SET courier_id=$2 WHERE id=$1", [
        o.id,
        u.id,
      ]);
      await notify(c, o, "Mensajero tomó un pedido", ["admin"]);
    } else if (b.action === "assign") {
      if (!admin) fail(403, "Solo administración");
      if (!["confirmed", "preparing", "ready", "enroute"].includes(status))
        fail(409, "Estado no asignable");
      const courier = (
        await c.query(
          "SELECT id FROM users WHERE id=$1 AND role='courier' AND active",
          [b.courierId],
        )
      ).rows[0];
      if (!courier) fail(400, "Mensajero inválido");
      await c.query("UPDATE orders SET courier_id=$2 WHERE id=$1", [
        o.id,
        b.courierId,
      ]);
    } else if (b.action === "request_cancel") {
      if (
        u.role !== "client" ||
        ["delivered", "cancelled", "rejected"].includes(status)
      )
        fail(409, "No se puede solicitar");
      await c.query("UPDATE orders SET cancel_requested=true WHERE id=$1", [
        o.id,
      ]);
      await notify(c, o, "Solicitud de cancelación", ["admin"]);
    } else if (b.action === "deny_cancel") {
      if (!admin || !o.cancel_requested) fail(403, "No disponible");
      await c.query("UPDATE orders SET cancel_requested=false WHERE id=$1", [
        o.id,
      ]);
    } else if (b.action === "failed") {
      if (u.role !== "courier" || o.courier_id !== u.id || status !== "enroute")
        fail(403, "No disponible");
      await c.query("UPDATE orders SET reason=$2 WHERE id=$1", [
        o.id,
        text(b.reason),
      ]);
      await notify(c, o, "Entrega fallida: requiere revisión", ["admin"]);
    } else {
      const transitions = {
        confirm: ["pending", "confirmed"],
        reject: ["pending", "rejected"],
        prepare: ["confirmed", "preparing"],
        ready: ["preparing", "ready"],
        depart: ["ready", "enroute"],
        deliver: ["enroute", "delivered"],
      };
      if (b.action === "cancel") {
        if (!admin || ["delivered", "cancelled", "rejected"].includes(status))
          fail(403, "Cancelación no permitida");
        status = "cancelled";
      } else {
        const t = transitions[b.action];
        if (!t || t[0] !== status) fail(409, "Transición no válida");
        if (["confirm", "reject"].includes(b.action) && !admin)
          fail(403, "Solo administración");
        if (
          ["prepare", "ready"].includes(b.action) &&
          !admin &&
          u.role !== "preparation"
        )
          fail(403, "Solo preparación");
        if (
          ["depart", "deliver"].includes(b.action) &&
          !admin &&
          !(u.role === "courier" && o.courier_id === u.id)
        )
          fail(403, "Solo mensajero asignado");
        if (["depart", "deliver"].includes(b.action) && !o.courier_id)
          fail(409, "Asigna un mensajero");
        status = t[1];
      }
      if (status === "confirmed") {
        if (o.credit) {
          const client = (
            await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [
              o.client_id,
            ])
          ).rows[0];
          if (
            Number(client.credit_used) + Number(o.total) >
            Number(client.credit_limit)
          )
            fail(409, "Cupo insuficiente");
          await c.query(
            "UPDATE users SET credit_used=credit_used+$2 WHERE id=$1",
            [o.client_id, o.total],
          );
        }
        await createInvoice(c, o);
      }
      if (status === "cancelled" && o.status !== "pending") {
        const inv = (
          await c.query("SELECT * FROM invoices WHERE order_id=$1 FOR UPDATE", [
            o.id,
          ])
        ).rows[0];
        if (inv && Number(inv.balance) !== Number(inv.total))
          fail(
            409,
            "Pedido con abonos: requiere conciliación antes de cancelar",
          );
        if (o.credit)
          await c.query(
            "UPDATE users SET credit_used=credit_used-$2 WHERE id=$1",
            [o.client_id, o.total],
          );
        await c.query("DELETE FROM invoices WHERE order_id=$1", [o.id]);
      }
      await c.query(
        "UPDATE orders SET status=$2,reason=$3,delivered_by=CASE WHEN $2='delivered' THEN courier_id ELSE delivered_by END,delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END WHERE id=$1",
        [o.id, status, b.reason || null],
      );
      await notify(
        c,
        o,
        `Pedido: ${status}`,
        ["preparing", "enroute", "delivered"].includes(status)
          ? ["client"]
          : ["courier", "preparation"],
      );
    }
    await c.query(
      "INSERT INTO audit(order_id,actor_id,action) VALUES($1,$2,$3)",
      [o.id, u.id, b.action],
    );
    return { ok: true };
  });
  await broadcast();
  return result;
});
route("get", "/api/invoices", async (req) => {
  const u = auth(req, ["admin", "courier", "client"]);
  return (
    await pool.query(
      "SELECT i.*,u.name AS client_name FROM invoices i JOIN users u ON u.id=i.client_id WHERE i.client_id=$1 OR $2",
      [u.id, u.role !== "client"],
    )
  ).rows;
});
route("patch", "/api/invoices/:id", async (req) => {
  auth(req, ["admin"]);
  await pool.query("UPDATE invoices SET number=$2,photo_url=$3 WHERE id=$1", [
    req.params.id,
    text(req.body.number, 100),
    req.body.photoUrl || null,
  ]);
  return { ok: true };
});
route("post", "/api/payments", async (req) => {
  const u = auth(req, ["admin", "courier"]),
    b = req.body;
  const key = req.get("Idempotency-Key");
  if (!key) fail(400, "Falta clave");
  const hash = createHash("sha256").update(JSON.stringify(b)).digest("hex");
  const r = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [u.id + key]);
    const prev = (
      await c.query("SELECT * FROM idempotency WHERE user_id=$1 AND key=$2", [
        u.id,
        key,
      ])
    ).rows[0];
    if (prev) {
      if (prev.request_hash !== hash) fail(409, "Clave reutilizada");
      return prev.response;
    }
    if (
      !["cash", "nequi", "bancolombia"].includes(b.method) ||
      !Array.isArray(b.allocations) ||
      !b.allocations.length ||
      new Set(b.allocations.map((a) => a.invoiceId)).size !==
        b.allocations.length
    )
      fail(400, "Distribución inválida");
    cents(b.amount);
    if (
      b.amount <= 0 ||
      b.allocations.reduce((s, a) => s + cents(a.amount), 0) !== b.amount
    )
      fail(400, "El abono debe coincidir con lo recibido");
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [b.clientId]);
    const id = randomUUID();
    await c.query("INSERT INTO payments VALUES($1,$2,$3,$4,$5,$6,now())", [
      id,
      b.clientId,
      u.id,
      b.method,
      b.amount,
      b.method === "cash",
    ]);
    for (const a of [...b.allocations].sort((a, b) =>
      a.invoiceId.localeCompare(b.invoiceId),
    )) {
      const inv = (
        await c.query(
          "SELECT * FROM invoices WHERE id=$1 AND client_id=$2 FOR UPDATE",
          [a.invoiceId, b.clientId],
        )
      ).rows[0];
      const pending = Number(
        (
          await c.query(
            "SELECT COALESCE(sum(a.amount),0) AS n FROM allocations a JOIN payments p ON p.id=a.payment_id WHERE a.invoice_id=$1 AND NOT p.verified",
            [a.invoiceId],
          )
        ).rows[0].n,
      );
      if (!inv || a.amount <= 0 || a.amount > Number(inv.balance) - pending)
        fail(409, "Abono supera saldo disponible");
      await c.query("INSERT INTO allocations VALUES($1,$2,$3)", [
        id,
        a.invoiceId,
        a.amount,
      ]);
      if (b.method === "cash") await applyAllocation(c, inv, a.amount);
    }
    const r = { id };
    await c.query("INSERT INTO idempotency VALUES($1,$2,$3,$4)", [
      u.id,
      key,
      hash,
      r,
    ]);
    return r;
  });
  await broadcast();
  return r;
});
async function applyAllocation(c, inv, amount) {
  await c.query("UPDATE invoices SET balance=balance-$2 WHERE id=$1", [
    inv.id,
    amount,
  ]);
  const o = (
    await c.query("SELECT credit FROM orders WHERE id=$1", [inv.order_id])
  ).rows[0];
  if (o.credit)
    await c.query("UPDATE users SET credit_used=credit_used-$2 WHERE id=$1", [
      inv.client_id,
      amount,
    ]);
}
route("post", "/api/invoices/:id/photo", async (req) => {
  auth(req, ["admin"]);
  const data = Buffer.from(req.body.data || "", "base64");
  const png = data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (data.length > 1500000 || (!png && !jpg))
    fail(400, "Usa PNG o JPG de hasta 1,5 MB");
  await pool.query(
    "INSERT INTO invoice_photos VALUES($1,$2,$3) ON CONFLICT(invoice_id) DO UPDATE SET mime=excluded.mime,data=excluded.data",
    [req.params.id, png ? "image/png" : "image/jpeg", data],
  );
  return { ok: true };
});
app.get("/api/invoices/:id/photo", async (req, res, next) => {
  try {
    const u = auth(req, ["admin", "courier", "client"]);
    const p = (
      await pool.query(
        "SELECT p.* FROM invoice_photos p JOIN invoices i ON i.id=p.invoice_id WHERE p.invoice_id=$1 AND (i.client_id=$2 OR $3)",
        [req.params.id, u.id, u.role !== "client"],
      )
    ).rows[0];
    if (!p) fail(404, "Sin fotografía");
    res.set("Cache-Control", "private, no-store").type(p.mime).send(p.data);
  } catch (e) {
    next(e);
  }
});
route("get", "/api/payments", async (req) => {
  const u = auth(req, ["admin", "courier"]);
  return (
    await pool.query(
      "SELECT p.*,u.name AS receiver FROM payments p JOIN users u ON u.id=p.receiver_id WHERE receiver_id=$1 OR $2 ORDER BY created_at DESC",
      [u.id, u.role === "admin"],
    )
  ).rows;
});
route("post", "/api/payments/:id/verify", async (req) => {
  auth(req, ["admin"]);
  await tx(async (c) => {
    const p = (
      await c.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!p) fail(404, "No existe");
    if (p.verified) return;
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [p.client_id]);
    const allocations = (
      await c.query(
        "SELECT * FROM allocations WHERE payment_id=$1 ORDER BY invoice_id",
        [p.id],
      )
    ).rows;
    for (const a of allocations) {
      const inv = (
        await c.query("SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [
          a.invoice_id,
        ])
      ).rows[0];
      if (Number(a.amount) > Number(inv.balance))
        fail(409, "Saldo insuficiente");
      await applyAllocation(c, inv, a.amount);
    }
    await c.query("UPDATE payments SET verified=true WHERE id=$1", [p.id]);
  });
  await broadcast();
  return { ok: true };
});
route("get", "/api/notifications", async (req) => {
  const u = auth(req);
  return (
    await pool.query(
      "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [u.id],
    )
  ).rows;
});
route("post", "/api/notifications/read", async (req) => {
  const u = auth(req);
  await pool.query("UPDATE notifications SET read=true WHERE user_id=$1", [
    u.id,
  ]);
  return { ok: true };
});
route("post", "/api/push", async (req) => {
  const u = auth(req),
    b = req.body;
  if (!b.endpoint?.startsWith("https://") || !b.keys?.auth || !b.keys?.p256dh)
    fail(400, "Suscripción inválida");
  const url = new URL(b.endpoint);
  if (
    ![
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ].includes(url.hostname)
  )
    fail(400, "Proveedor push no admitido");
  await pool.query(
    "INSERT INTO subscriptions VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,payload=excluded.payload",
    [u.id, b.endpoint, b],
  );
  return { ok: true };
});
route("post", "/api/location", async (req) => {
  const u = auth(req, ["courier"]);
  const { lat, lng } = req.body;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    fail(400, "Coordenadas inválidas");
  if (
    !(
      await pool.query(
        "SELECT 1 FROM orders WHERE courier_id=$1 AND status='enroute'",
        [u.id],
      )
    ).rowCount
  )
    fail(409, "No hay entregas en recorrido");
  await pool.query(
    "INSERT INTO locations VALUES($1,$2,$3,now()) ON CONFLICT(courier_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,updated_at=now()",
    [u.id, Math.round(lat * 100) / 100, Math.round(lng * 100) / 100],
  );
  await broadcast();
  return { ok: true };
});
route("delete", "/api/location", async (req) => {
  const u = auth(req, ["courier"]);
  await pool.query("DELETE FROM locations WHERE courier_id=$1", [u.id]);
  return { ok: true };
});
route("get", "/api/orders/:id/tracking", async (req) => {
  const u = auth(req);
  const o = (
    await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id])
  ).rows[0];
  if (
    !o ||
    (u.role !== "admin" &&
      !(u.role === "client" && o.client_id === u.id) &&
      !(u.role === "courier" && o.courier_id === u.id))
  )
    fail(404, "Pedido no disponible");
  if (o.status !== "enroute") return { active: false };
  const loc = (
    await pool.query(
      "SELECT lat,lng,updated_at FROM locations WHERE courier_id=$1",
      [o.courier_id],
    )
  ).rows[0];
  return {
    active: true,
    location: loc || null,
    signalLost: !loc || Date.now() - new Date(loc.updated_at) > 120000,
    eta: null,
  };
});
route("get", "/api/settlements", async (req) => {
  const u = auth(req, ["admin", "courier"]);
  return (
    await pool.query(
      "SELECT s.*,u.name AS courier_name FROM settlements s JOIN users u ON u.id=s.courier_id WHERE courier_id=$1 OR $2 ORDER BY day DESC",
      [u.id, u.role === "admin"],
    )
  ).rows;
});
route("post", "/api/settlements", async (req) => {
  const u = auth(req, ["admin"]);
  const b = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.day)) fail(400, "Fecha inválida");
  const received = cents(b.receivedCash);
  return tx(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [b.courierId]);
    const sums = (
      await c.query(
        "SELECT COALESCE(sum(amount) FILTER(WHERE method='cash'),0) AS cash,COALESCE(sum(amount) FILTER(WHERE method<>'cash' AND verified),0) AS transfers FROM payments WHERE receiver_id=$1 AND (created_at AT TIME ZONE 'America/Bogota')::date=$2",
        [b.courierId, b.day],
      )
    ).rows[0];
    return (
      await c.query(
        "INSERT INTO settlements VALUES($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *",
        [
          randomUUID(),
          b.courierId,
          b.day,
          sums.cash,
          received,
          sums.transfers,
          u.id,
        ],
      )
    ).rows[0];
  });
});
route("get", "/api/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true };
});
export function errors() {
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Ruta inexistente" }),
  );
  app.use((e, req, res, next) => {
    if (e.code === "23505")
      return res.status(409).json({ error: "Registro duplicado" });
    res
      .status(e.status || 400)
      .json({ error: e.status ? e.message : "Solicitud inválida" });
  });
}
