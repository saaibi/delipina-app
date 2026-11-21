import { statusLabels, noticeTitle } from "./status-labels.js";
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
      `INSERT INTO notifications(id,user_id,title,order_id,event_key,module,target_id,status) SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM users WHERE id=$2 AND active ON CONFLICT(user_id,event_key) DO UPDATE SET title=excluded.title,status=excluded.status,target_id=excluded.target_id,updated_at=clock_timestamp(),revision=notifications.revision+1,read=false,dismissed=false,available_at=clock_timestamp() WHERE notifications.title IS DISTINCT FROM excluded.title OR notifications.status IS DISTINCT FROM excluded.status OR notifications.target_id IS DISTINCT FROM excluded.target_id`,
      [
        randomUUID(),
        id,
        noticeTitle(notice.title),
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
      "SELECT id FROM users WHERE active AND (role=ANY($1::text[]) OR id=ANY($2::uuid[]) OR role='client_member' AND client_account_id=ANY($2::uuid[]) AND ($3<>'credits' OR can_view_portfolio))",
      [roles, owners, notice.module],
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
      "SELECT id FROM users WHERE active AND (role=ANY($1::text[]) OR id=$2 OR role='client_member' AND client_account_id=$2 OR role='custom' AND permissions ?| array['orders','plant']) AND (role<>'courier' OR id=$3 OR $3::uuid IS NULL)",
      [
        [
          ...roles.filter((r) => r !== "client"),
          ...(roles.includes("preparation") ? ["plant_admin"] : []),
        ],
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
    title:
      current.status === "pending"
        ? title === "Pedido por frecuencia"
          ? title
          : "Nuevo pedido"
        : `Pedido: ${statusLabels[current.status] || current.status}`,
    status: current.status,
  });
}
export function noticeVisibility() {
  return `n.user_id=$1 AND NOT n.dismissed AND n.available_at<=now() AND (n.module<>'credits' OR NOT EXISTS(SELECT 1 FROM users a WHERE a.id=$1 AND a.role='client_member' AND NOT a.can_view_portfolio)) AND (n.order_id IS NULL OR o.id IS NOT NULL AND (($2 IN ('admin','preparation','plant_admin') OR $2='custom' AND EXISTS(SELECT 1 FROM users a WHERE a.id=$1 AND a.permissions ?| array['orders','plant'])) OR $2 IN ('client','client_member') AND o.client_id=COALESCE((SELECT a.client_account_id FROM users a WHERE a.id=$1),$1) OR $2='courier' AND (o.courier_id=$1 OR o.courier_id IS NULL AND o.status NOT IN ('rejected','cancelled','delivered'))))`;
}
