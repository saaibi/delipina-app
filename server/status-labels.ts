export const statusLabels: Record<string, string> = {
  pending: "Pendiente de confirmar",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo para despacho",
  enroute: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
  rejected: "Rechazado",
  closed: "Cerrada",
  submitted: "Enviado",
  verified: "Verificado",
  requested: "Solicitado",
  assigned: "Asignado",
  route_requested: "Recorrido solicitado",
  route_approved: "Recorrido aprobado",
};
export function noticeTitle(title: string) {
  return title.replace(
    /\b(pending|confirmed|preparing|ready|enroute|delivered|cancelled|rejected|closed|submitted|verified|requested|assigned)\b/g,
    (s) => statusLabels[s] || s,
  );
}
