import{notifyOrder}from"./notification-store.js";
import { ensureBusinessClock } from "./business-day.js";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import * as webpush from "web-push";
import { pool, tx, fail } from "./db.js";
process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;
export const production = process.env.NODE_ENV === "production";
if (production && process.env.DEV_AUTH === "true")
  throw Error("DEV_AUTH prohibido en producción");
export let io;
export function setIO(value) {
  io = value;
}
export const safeUser = (u) => ({
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
export const auth = (req, roles = undefined) => {
  if (!req.user) fail(401, "Inicia sesión");
  if (roles && !roles.includes(req.user.role))
    fail(403, "Acceso no autorizado");
  return req.user;
};
export async function login(res, u) {
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
export const cents = (n) => {
  if (!Number.isSafeInteger(n) || n < 0)
    fail(400, "Importe inválido (centavos)");
  return n;
};
export const text = (v, max = 500) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(400, "Texto inválido");
  return v.trim();
};
export const notify=notifyOrder;
export async function broadcast() {
  // Never send order data through a role room; clients refetch authorized state.
  io?.emit("refresh");
  await dispatchPush();
}
export let pushing = false;
export async function dispatchPush() {
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
        "SELECT s.*,n.title,n.id AS notification_id,n.revision,n.module,n.target_id,n.status FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN notifications n ON n.user_id=s.user_id WHERE u.active AND NOT n.read AND n.updated_at>now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.notification_id=n.id AND d.endpoint=s.endpoint AND d.revision=n.revision)",
      )
    ).rows;
    await Promise.allSettled(
      rows.map(async (s) => {
        const claim = await pool.query(
          "INSERT INTO push_deliveries(notification_id,endpoint,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
          [s.notification_id, s.endpoint,s.revision],
        );
        if (!claim.rowCount) return;
        try {
          await webpush.sendNotification(
            s.payload,
            JSON.stringify({title:s.title,id:s.notification_id,revision:s.revision,module:s.module,targetId:s.target_id,status:s.status}),
          );
        } catch (e) {
          await pool.query(
            "DELETE FROM push_deliveries WHERE notification_id=$1 AND endpoint=$2 AND revision=$3",
            [s.notification_id, s.endpoint,s.revision],
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
export const orderVisible = (u, o) =>
  u.role === "admin" ||
  u.role === "preparation" ||
  (u.role === "client" && o.client_id === u.id) ||
  (u.role === "courier" &&
    (o.courier_id === u.id ||
      (!o.courier_id &&
        !["rejected", "cancelled", "delivered"].includes(o.status))));
export async function createInvoice(c, o) {
  await c.query(
    "INSERT INTO invoices(id,order_id,client_id,total,balance) VALUES($1,$2,$3,$4,$4) ON CONFLICT(order_id) DO NOTHING",
    [randomUUID(), o.id, o.client_id, o.total],
  );
}
export async function applyAllocation(c, inv, amount) {
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
export function configureApp(app: any) {
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(async (req, res, next) => {
    try {
      req.user = await session(req.cookies.session);
      if (
        req.user &&
        req.path.startsWith("/api/") &&
        !req.path.startsWith("/api/health")
      ) {
        const changed = await ensureBusinessClock();
        if(changed){io?.emit("refresh");void dispatchPush()}
      }
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
}
