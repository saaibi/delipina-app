import { noticeTitle, statusLabels } from "./status-labels.js";
export function notificationPayload(row: any): Record<string, string> {
  const stamp = (value: any) =>
    value && Number.isFinite(+new Date(value))
      ? new Date(value).toLocaleString("es-CO", {
          timeZone: "America/Bogota",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const start = stamp(row.window_start),
    end = stamp(row.window_end);
  const deliveryWindow = start && end ? `${start} – ${end}` : "";
  const clientName = row.client_name || "";
  return {
    id: row.notification_id || row.id,
    title: noticeTitle(row.title),
    revision: String(row.revision),
    module: row.module || "orders",
    targetId: row.target_id || "",
    status: row.status || "",
    statusLabel: statusLabels[row.status] || "",
    clientName,
    deliveryWindow,
    body:
      [clientName, deliveryWindow].filter(Boolean).join(" · ") ||
      "Toca para consultar el detalle.",
    canRespond: String(
      !!row.can_respond &&
        row.status === "pending" &&
        row.current_status === "pending" &&
        !!row.order_id,
    ),
  };
}
