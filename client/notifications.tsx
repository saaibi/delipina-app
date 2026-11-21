import React, { useRef, useState } from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import AccessTime from "@mui/icons-material/AccessTime";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import { StatusChip } from "./order-badges";
function Notice({ n, onSelect, onAction, canRespond, date, labels }: any) {
  const [busy, B] = useState(false),
    [dx, X] = useState(0);
  const start = useRef<any>(null),
    swiped = useRef(false);
  const actionable =
    canRespond &&
    n.order_id &&
    n.status === "pending" &&
    n.current_status === "pending";
  const respond = async (action: string) => {
    if (!actionable || busy) return;
    B(true);
    try {
      await onAction(n, action);
    } finally {
      B(false);
      X(0);
    }
  };
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
        bgcolor:
          dx < -35
            ? "success.light"
            : dx > 35
              ? "error.light"
              : "background.paper",
        touchAction: "pan-y",
      }}
      onPointerDown={(e) => {
        if (
          actionable &&
          !busy &&
          !(e.target as HTMLElement).closest("button,a,input")
        )
          start.current = { x: e.clientX, y: e.clientY };
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
        if (Math.abs(x) >= 85 && Math.abs(x) > Math.abs(y) * 1.5) {
          swiped.current = true;
          void respond(x < 0 ? "confirm" : "reject");
          setTimeout(() => (swiped.current = false), 300);
        }
      }}
    >
      {Math.abs(dx) > 35 && (
        <Typography
          sx={{
            position: "absolute",
            top: 20,
            left: 12,
            right: 12,
            textAlign: dx < 0 ? "right" : "left",
            fontWeight: 700,
            color: "white",
          }}
        >
          {dx < 0 ? "Aceptar" : "Rechazar"}
        </Typography>
      )}
      <Box
        sx={{
          transform: `translateX(${dx}px)`,
          bgcolor: n.read ? "background.paper" : "#f4f7ed",
          borderLeft: n.read ? "3px solid transparent" : "3px solid #d6b33e",
        }}
      >
        <ListItemButton
          disabled={busy}
          onClick={() => {
            if (!swiped.current) onSelect(n);
          }}
          alignItems="flex-start"
          sx={{ display: "block", p: 2 }}
        >
          <Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 1 }}>
            <NotificationsOutlined color="primary" />
            <Typography sx={{ fontWeight: 700 }}>{n.title}</Typography>
          </Stack>
          {n.client_name && (
            <Typography sx={{ fontWeight: 700, mb: 1 }}>
              {n.client_name}
            </Typography>
          )}
          {n.window_start && n.window_end && (
            <Stack
              direction="row"
              sx={{ alignItems: "center", gap: 0.7, mb: 1 }}
            >
              <AccessTime fontSize="small" />
              <Typography variant="body2">
                {date(n.window_start)} — {date(n.window_end)}
              </Typography>
            </Stack>
          )}
          {n.status &&
            (labels[n.status] ? (
              <StatusChip status={n.status} />
            ) : (
              <Chip
                size="small"
                label={
                  n.status === "route_requested"
                    ? "Recorrido solicitado"
                    : n.status === "route_approved"
                      ? "Recorrido aprobado"
                      : n.title
                }
              />
            ))}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1, display: "block" }}
          >
            {date(n.updated_at || n.created_at)} · {n.read ? "Leído" : "Nuevo"}
          </Typography>
        </ListItemButton>
        {actionable && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Stack direction="row" sx={{ gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                disabled={busy}
                onClick={() => void respond("confirm")}
              >
                Aceptar
              </Button>
              <Button
                variant="outlined"
                color="error"
                disabled={busy}
                onClick={() => void respond("reject")}
              >
                Rechazar
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Desliza a la izquierda para aceptar o a la derecha para rechazar.
            </Typography>
          </Box>
        )}
      </Box>
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
