import React, { useRef, useState } from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import AccessTime from "@mui/icons-material/AccessTime";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import { StatusChip } from "./order-badges";
const otherStates = {
  verified: "Verificado",
  closed: "Cerrada",
  submitted: "Enviado",
  requested: "Solicitado",
  assigned: "Asignado",
  route_requested: "Recorrido solicitado",
  route_approved: "Recorrido aprobado",
};
function Notice({
  n,
  onSelect,
  onAction,
  onDismiss,
  canRespond,
  date,
  labels,
}: any) {
  const [busy, B] = useState(false),
    [dx, X] = useState(0);
  const start = useRef<any>(null),
    swiped = useRef(false),
    inFlight = useRef(false);
  const actionable =
    canRespond &&
    n.order_id &&
    n.status === "pending" &&
    n.current_status === "pending";
  const respond = async (direction: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    B(true);
    swiped.current = true;
    try {
      if (actionable) await onAction(n, direction < 0 ? "confirm" : "reject");
      else await onDismiss(n);
    } finally {
      inFlight.current = false;
      B(false);
      X(0);
      setTimeout(() => (swiped.current = false), 300);
    }
  };
  const title = n.order_id
    ? n.current_status === "pending"
      ? "Nuevo pedido"
      : "Pedido"
    : n.title;
  return (
    <Box
      component="li"
      sx={{
        position: "relative",
        overflow: "hidden",
        my: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: actionable && dx > 0 ? "error.main" : "success.main",
        touchAction: "pan-y",
      }}
      onPointerDown={(e) => {
        if (!busy && !(e.target as HTMLElement).closest("button,a,input")) {
          start.current = { x: e.clientX, y: e.clientY };
        }
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const x = e.clientX - start.current.x,
          y = e.clientY - start.current.y;
        if (Math.abs(y) > 30 && Math.abs(y) > Math.abs(x)) {
          start.current = null;
          X(0);
          return;
        }
        if (Math.abs(x) > 10 && Math.abs(x) > Math.abs(y) * 1.5)
          e.currentTarget.setPointerCapture(e.pointerId);
        X(Math.max(-110, Math.min(110, x)));
      }}
      onPointerCancel={() => {
        start.current = null;
        X(0);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const x = e.clientX - start.current.x,
          y = e.clientY - start.current.y;
        start.current = null;
        X(0);
        if (Math.abs(x) >= 85 && Math.abs(x) > Math.abs(y) * 1.5)
          void respond(x);
      }}
    >
      {Math.abs(dx) > 25 && (
        <Typography
          sx={{
            position: "absolute",
            top: "50%",
            left: 12,
            right: 12,
            transform: "translateY(-50%)",
            textAlign: dx < 0 ? "right" : "left",
            fontWeight: 700,
            color: "white",
          }}
        >
          {actionable ? (dx < 0 ? "Aceptar" : "Rechazar") : "Leído"}
        </Typography>
      )}
      <ListItemButton
        disabled={busy}
        onClick={() => {
          if (!swiped.current) onSelect(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            void respond(e.key === "ArrowLeft" ? -100 : 100);
          }
        }}
        aria-label={
          title +
          ". " +
          (n.client_name || "") +
          ". " +
          (actionable
            ? "Desliza izquierda para aceptar o derecha para rechazar"
            : "Desliza para marcar como leído y ocultar")
        }
        sx={{
          display: "block",
          p: 2,
          transform: `translateX(${dx}px)`,
          bgcolor: n.read ? "background.paper" : "#f4f7ed",
          borderLeft: n.read ? "3px solid transparent" : "3px solid #d6b33e",
          "&:hover": { bgcolor: n.read ? "background.paper" : "#f4f7ed" },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
            mb: 1,
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: "center", gap: 1, minWidth: 0 }}
          >
            <NotificationsOutlined color="primary" />
            <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          </Stack>
          {n.status && (
            <Box sx={{ flexShrink: 0, maxWidth: "55%", textAlign: "right" }}>
              {labels[n.status] ? (
                <StatusChip status={n.status} />
              ) : (
                <Chip
                  size="small"
                  label={otherStates[n.status] || "Actualización"}
                />
              )}
            </Box>
          )}
        </Stack>
        {n.client_name && (
          <Typography sx={{ fontWeight: 700, mb: 1 }}>
            {n.client_name}
          </Typography>
        )}
        {n.window_start && n.window_end && (
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.7, mb: 1 }}>
            <AccessTime fontSize="small" />
            <Typography variant="body2">
              {date(n.window_start)} — {date(n.window_end)}
            </Typography>
          </Stack>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: "block" }}
        >
          {date(n.updated_at || n.created_at)} · {n.read ? "Leído" : "Nuevo"}
        </Typography>
      </ListItemButton>
    </Box>
  );
}
export function NotificationList({ rows, ...props }: any) {
  return (
    <List className="notification-list">
      {rows.map((n) => (
        <Notice key={n.id} n={n} {...props} />
      ))}
      {!rows.length && <p>No tienes avisos por ahora.</p>}
    </List>
  );
}
