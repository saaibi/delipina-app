import { GoogleAuth } from "google-auth-library";
import { notificationPayload } from "./notification-payload.js";
import { pool } from "./db.js";
let google: GoogleAuth | undefined;
export function fcmConfigured() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}
export async function sendNativeMessage(
  token: string,
  data: Record<string, string>,
) {
  if (!google)
    google = new GoogleAuth({
      credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!),
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
  const client = await google.getClient();
  await client.request({
    url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.project_id)}/messages:send`,
    method: "POST",
    timeout: 10000,
    data: {
      message: {
        token,
        data,
        android: { priority: "high", ttl: "86400s" },
      },
    },
  });
}
export async function dispatchNativePush() {
  if (!fcmConfigured()) return;
  const rows = (
    await pool.query(
      `SELECT d.id device_id,d.token,n.id,n.title,n.revision,n.module,n.target_id,n.status,n.order_id,o.window_start,o.window_end,o.status current_status,(SELECT name FROM users WHERE id=o.client_id) client_name,(u.role='admin' OR u.role='custom' AND u.permissions ? 'orders') can_respond FROM native_push_devices d JOIN users u ON u.id=d.user_id JOIN notifications n ON n.user_id=u.id LEFT JOIN orders o ON o.id=n.order_id WHERE d.enabled AND u.active AND (u.client_account_id IS NULL OR EXISTS(SELECT 1 FROM users owner WHERE owner.id=u.client_account_id AND owner.active)) AND NOT n.read AND n.available_at<=now() AND GREATEST(n.updated_at,n.available_at)>now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM native_push_deliveries p WHERE p.notification_id=n.id AND p.device_id=d.id AND p.revision=n.revision)`,
    )
  ).rows;
  for (const r of rows) {
    const claimed = await pool.query(
      "INSERT INTO native_push_deliveries VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *",
      [r.id, r.device_id, r.revision],
    );
    if (!claimed.rowCount) continue;
    try {
      await sendNativeMessage(r.token, notificationPayload(r));
    } catch (e) {
      await pool.query(
        "DELETE FROM native_push_deliveries WHERE notification_id=$1 AND device_id=$2 AND revision=$3",
        [r.id, r.device_id, r.revision],
      );
      const details = JSON.stringify(e.response?.data?.error?.details || []);
      if (details.includes("UNREGISTERED"))
        await pool.query("DELETE FROM native_push_devices WHERE id=$1", [
          r.device_id,
        ]);
    }
  }
}
