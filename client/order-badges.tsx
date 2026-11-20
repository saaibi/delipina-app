import React from "react";
import Chip from "@mui/material/Chip";
import { orderUrgency } from "../shared/plant-priority";
const states: any = {
  pending: ["Por confirmar", "#fff2cb", "#7f5900"],
  confirmed: ["Confirmado", "#eee2ff", "#6736a2"],
  preparing: ["En preparación", "#ffead8", "#954900"],
  ready: ["Listo para despacho", "#dff2e2", "#26613a"],
  enroute: ["En camino", "#deebff", "#285b9d"],
  delivered: ["Entregado", "#dcf2ef", "#166b62"],
  cancelled: ["Cancelado", "#e9e9ed", "#565766"],
  rejected: ["Rechazado", "#fbe2e4", "#9e2e3c"],
};
const style = {
  height: "auto",
  minHeight: 24,
  borderRadius: "7px",
  fontSize: 10,
  fontWeight: 700,
  "& .MuiChip-label": { px: 1, py: 0.5, whiteSpace: "normal", lineHeight: 1.3 },
};
export function StatusChip({ status }: any) {
  const [label, bg, color] = states[status] || [status, "#eee", "#555"];
  return (
    <Chip
      className="order-status-chip"
      size="small"
      label={label}
      sx={{ ...style, bgcolor: bg, color }}
    />
  );
}
export function TimingChip({ order }: any) {
  const urgency = orderUrgency(order);
  if (!urgency) return null;
  const [label, bg, color] = {
    late: ["Atrasado", "#fbe0e0", "#a02626"],
    soon: ["Próximo a salir", "#fff0c4", "#8b5c00"],
    onTime: ["A tiempo", "#e7f3df", "#3b6726"],
  }[urgency];
  return (
    <Chip size="small" label={label} sx={{ ...style, bgcolor: bg, color }} />
  );
}
export function AssignmentChip({ order }: any) {
  const available = !order.courier_id,
    enroute = order.status === "enroute";
  return (
    <Chip
      size="small"
      label={
        available ? "Disponible" : enroute ? "En reparto" : "Asignado a ti"
      }
      sx={{
        ...style,
        bgcolor: available ? "#fff0c4" : enroute ? "#deebff" : "#e7f3df",
        color: available ? "#8b5c00" : enroute ? "#285b9d" : "#3b6726",
      }}
    />
  );
}
