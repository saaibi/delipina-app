import { notificationPayload } from "./notification-payload.js";
import { maintainGoogleLocations } from "./google-locations.js";
import { dispatchNativePush } from "./native-push.js";
import { ensureRecurrences } from "./recurrence.js";
import { customerId, isCustomer, hasModule, canPortfolio } from "./access.js";
import { notifyOrder } from "./notification-store.js";
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
  permissions: u.permissions || [],
  clientId: customerId(u),
  canViewPortfolio: canPortfolio(u),
});
export async function session(token) {
  return (
    await pool.query(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN users owner ON owner.id=u.client_account_id WHERE s.token=$1 AND s.expires_at>now() AND u.active AND (u.role<>'client_member' OR owner.active AND owner.role='client')",
      [token],
    )
  ).rows[0];
}
export const auth = (req, roles = undefined) => {
  if (!req.user) fail(401, "Inicia sesión");
  const customerGrant =
    req.user.role === "client_member" && roles?.includes("client");
  const path = req.path || req.url || "";
  const customGrant =
    req.user.role === "custom" &&
    (path.includes("analytics")
      ? hasModule(req.user, "analytics")
      : path.includes("business-day")
        ? hasModule(req.user, "days")
        : path.includes("credit-accounts") || path.includes("invoices")
          ? req.method === "GET" && hasModule(req.user, "portfolio")
          : path.includes("orders") ||
              path.includes("branches") ||
              path.includes("users") ||
              path.includes("products")
            ? (req.method === "GET" &&
                (hasModule(req.user, "orders") ||
                  hasModule(req.user, "plant"))) ||
              (path.endsWith("orders") &&
                req.method === "POST" &&
                hasModule(req.user, "orders"))
            : false);
  if (
    isCustomer(req.user) &&
    !canPortfolio(req.user) &&
    /credit-accounts|invoices/.test(path)
  )
    fail(403, "No tienes permiso para ver cartera");
  if (roles && !roles.includes(req.user.role) && !customerGrant && !customGrant)
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
export const notify = notifyOrder;
export async function broadcast() {
  // Never send order data through a role room; clients refetch authorized state.
  io?.emit("refresh");
  await dispatchPush();
}
export let pushing = false;
export async function dispatchPush() {
  if (pushing) return;
  pushing = true;
  try {
    await dispatchNativePush();
    if (!process.env.VAPID_PRIVATE_KEY) return;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const rows = (
      await pool.query(
        "SELECT s.*,n.title,n.id AS notification_id,n.revision,n.module,n.target_id,n.status,n.order_id,o.window_start,o.window_end,o.status current_status,(SELECT name FROM users WHERE id=o.client_id) client_name,(u.role='admin' OR u.role='custom' AND u.permissions ? 'orders') can_respond FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN notifications n ON n.user_id=s.user_id LEFT JOIN orders o ON o.id=n.order_id WHERE u.active AND (u.client_account_id IS NULL OR EXISTS(SELECT 1 FROM users owner WHERE owner.id=u.client_account_id AND owner.active)) AND NOT n.read AND n.available_at<=now() AND GREATEST(n.updated_at,n.available_at)>now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM push_deliveries d WHERE d.notification_id=n.id AND d.endpoint=s.endpoint AND d.revision=n.revision)",
      )
    ).rows;
    await Promise.allSettled(
      rows.map(async (s) => {
        const claim = await pool.query(
          "INSERT INTO push_deliveries(notification_id,endpoint,revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
          [s.notification_id, s.endpoint, s.revision],
        );
        if (!claim.rowCount) return;
        try {
          await webpush.sendNotification(
            s.payload,
            JSON.stringify(notificationPayload(s)),
          );
        } catch (e) {
          await pool.query(
            "DELETE FROM push_deliveries WHERE notification_id=$1 AND endpoint=$2 AND revision=$3",
            [s.notification_id, s.endpoint, s.revision],
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
  ["preparation", "plant_admin"].includes(u.role) ||
  hasModule(u, "orders") ||
  hasModule(u, "plant") ||
  (isCustomer(u) && o.client_id === customerId(u)) ||
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
  app.use(
    helmet({
      contentSecurityPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    }),
  );
  app.use(express.json({ limit: "12mb" }));
  app.use(cookieParser());
  app.use(async (req, res, next) => {
    try {
      req.user = await session(req.cookies.session);
      if (
        req.user &&
        req.path.startsWith("/api/") &&
        !req.path.startsWith("/api/health")
      ) {
        await maintainGoogleLocations();
        const changed = await ensureBusinessClock();
        if (process.env.DISABLE_AUTOMATIC_JOBS !== "true")
          void ensureRecurrences().catch(() => {});
        if (changed) {
          io?.emit("refresh");
          void dispatchPush();
        }
      }
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.get("origin") !== process.env.APP_ORIGIN &&
        !(
          req.method === "POST" &&
          req.path === "/api/native-push/pair" &&
          !req.get("origin")
        )
      )
        fail(403, "Origen no permitido");
      if (req.user && !["GET", "HEAD", "OPTIONS"].includes(req.method))
        res.once("finish", () => {
          if (res.statusCode < 400)
            void pool
              .query(
                "INSERT INTO audit(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'api',$3,$4)",
                [req.user.id, req.method, req.path, { status: res.statusCode }],
              )
              .catch(() => {});
        });
      next();
    } catch (e) {
      next(e);
    }
  });
}
