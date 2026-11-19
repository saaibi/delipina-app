import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
export interface NoticeInput {
  key: string;
  module: "orders" | "credits" | "analytics";
  targetId: string;
  title: string;
  status?: string;
  orderId?: string;
}
export async function notifyRecipients(
  c: PoolClient,
  userIds: string[],
  notice: NoticeInput,
) {
  for (const id of new Set(userIds)) {
    await c.query(
      `INSERT INTO notifications(id,user_id,title,order_id,event_key,module,target_id,status) SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM users WHERE id=$2 AND active ON CONFLICT(user_id,event_key) DO UPDATE SET title=excluded.title,status=excluded.status,target_id=excluded.target_id,updated_at=clock_timestamp(),revision=notifications.revision+1,read=false WHERE notifications.title IS DISTINCT FROM excluded.title OR notifications.status IS DISTINCT FROM excluded.status OR notifications.target_id IS DISTINCT FROM excluded.target_id`,
      [
        randomUUID(),
        id,
        notice.title,
        notice.orderId || null,
        notice.key,
        notice.module,
        notice.targetId,
        notice.status || null,
      ],
    );
  }
}
export async function notifyEvent(
  c: PoolClient,
  roles: string[],
  owners: string[],
  notice: NoticeInput,
) {
  const ids = (
    await c.query(
      "SELECT id FROM users WHERE active AND (role=ANY($1::text[]) OR id=ANY($2::uuid[]))",
      [roles, owners],
    )
  ).rows.map((r) => r.id);
  await notifyRecipients(c, ids, notice);
}
export async function notifyOrder(
  c: PoolClient,
  order: any,
  title: string,
  roles: string[],
) {
  const current = (
    await c.query("SELECT * FROM orders WHERE id=$1", [order.id])
  ).rows[0];
  if (!current) return;
  const previous = (
    await c.query(
      "SELECT u.id,u.role FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.order_id=$1 AND u.active",
      [order.id],
    )
  ).rows;
  const eligible = previous
    .filter(
      (u) =>
        u.role !== "courier" ||
        current.courier_id === u.id ||
        (!current.courier_id &&
          !["delivered", "cancelled", "rejected"].includes(current.status)),
    )
    .map((u) => u.id);
  const target = (
    await c.query(
      "SELECT id FROM users WHERE active AND (role=ANY($1::text[]) OR id=$2) AND (role<>'courier' OR id=$3 OR $3::uuid IS NULL)",
      [
        roles.filter((r) => r !== "client"),
        current.client_id,
        current.courier_id,
      ],
    )
  ).rows.map((u) => u.id);
  await notifyRecipients(c, [...eligible, ...target], {
    key: "order:" + order.id,
    module: "orders",
    targetId: order.id,
    orderId: order.id,
    title,
    status: current.status,
  });
}
export function noticeVisibility() {
  return `n.user_id=$1 AND (n.order_id IS NULL OR o.id IS NOT NULL AND ($2 IN ('admin','preparation') OR $2='client' AND o.client_id=$1 OR $2='courier' AND (o.courier_id=$1 OR o.courier_id IS NULL AND o.status NOT IN ('rejected','cancelled','delivered'))))`;
}
