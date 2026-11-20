import React from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Chip from "@mui/material/Chip";
const otherStates = {
  verified: "Verificado",
  closed: "Cerrada",
  submitted: "Enviado",
  requested: "Solicitado",
  assigned: "Asignado",
  route_requested: "Recorrido solicitado",
  route_approved: "Recorrido aprobado",
};
export function NotificationList({ rows, onSelect, labels, date }: any) {
  return (
    <List className="notification-list">
      {rows.map((n) => (
        <ListItemButton
          key={n.id}
          onClick={() => onSelect(n)}
          alignItems="flex-start"
          sx={{
            display: "block",
            borderLeft: n.read ? "3px solid transparent" : "3px solid #d6b33e",
            background: n.read ? "transparent" : "#f4f7ed",
            my: 1,
            borderRadius: 1.5,
          }}
        >
          <strong>{n.title}</strong>
          {n.status && (labels[n.status] || otherStates[n.status]) && (
            <div>
              <Chip
                size="small"
                variant="outlined"
                label={labels[n.status] || otherStates[n.status]}
                sx={{ mt: 1, fontSize: 11 }}
              />
            </div>
          )}
          <p>
            {date(n.updated_at || n.created_at)} · {n.read ? "Leído" : "Nuevo"}
          </p>
        </ListItemButton>
      ))}
      {!rows.length && <p>No tienes avisos por ahora.</p>}
    </List>
  );
}
