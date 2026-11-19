import React, { useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs from "dayjs";
import { Button, Field } from "./ui";
import { NotificationSettings } from "./push";
import { ManagementTable } from "./management";
import { api } from "./offline";
const days = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
function Section({ title, children }: any) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        border: "1px solid #e0e6da",
        mb: 2,
        borderRadius: "10px!important",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}
export function ScheduleEditor({ settings, onSaved }: any) {
  const [week, W] = useState(() =>
      Object.fromEntries(
        days.map((_, i) => [
          i + 1,
          settings.weeklySchedule?.[i + 1] || {
            enabled: true,
            open: "06:00",
            close: "18:00",
          },
        ]),
      ),
    ),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const change = (day, field, value) =>
    W((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        const b = Object.fromEntries(new FormData(e.currentTarget));
        try {
          await api("/settings", {
            method: "PUT",
            body: {
              origin: b.origin,
              leadHours: Number(b.leadHours),
              weeklySchedule: week,
            },
          });
          await onSaved();
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Field
        label="Origen del reparto"
        name="origin"
        defaultValue={settings.origin}
      />
      <Field
        label="Anticipación general (horas)"
        name="leadHours"
        type="number"
        min="0"
        step="0.25"
        defaultValue={settings.leadHours}
      />
      {days.map((name, i) => {
        const d = week[i + 1];
        return (
          <div className="schedule-row" key={name}>
            <FormControlLabel
              sx={{ minWidth: 128, m: 0 }}
              control={
                <Switch
                  checked={d.enabled}
                  onChange={(_, v) => change(i + 1, "enabled", v)}
                />
              }
              label={name}
            />
            {(["open", "close"] as const).map((field) => (
              <TimePicker
                key={field}
                label={field === "open" ? "Apertura" : "Cierre"}
                disabled={!d.enabled}
                value={dayjs.tz("2026-01-05T" + d[field], "America/Bogota")}
                timezone="America/Bogota"
                onChange={(v) => {
                  if (v?.isValid()) change(i + 1, field, v.format("HH:mm"));
                }}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            ))}
          </div>
        );
      })}
      <p>
        El cierre es automático a la hora de cada día. La cartera y los pedidos
        futuros se conservan; las jornadas ya cerradas mantienen su resumen.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : "Guardar horario"}
      </Button>
    </form>
  );
}
export function SettingsView({
  user,
  push,
  settings,
  users,
  products,
  branches,
  onAction,
  onEditUser,
  onRemoveUser,
  onRestoreUser,
  onEditProduct,
  onToggleProduct,
  onRefresh,
}: any) {
  const admin = user.role === "admin";
  return (
    <div className="settings-sections">
      <Section title="Notificaciones">
        <NotificationSettings controller={push} />
      </Section>
      {admin && (
        <>
          <Section title="Usuarios y acceso">
            <Button onClick={() => onAction("user")}>Crear usuario</Button>
            <ManagementTable
              kind="users"
              rows={users}
              onEdit={onEditUser}
              onRemove={onRemoveUser}
              onRestore={onRestoreUser}
            />
          </Section>
          <Section title="Productos y presentaciones">
            <Button onClick={() => onAction("catalog")}>Crear producto</Button>
            <ManagementTable
              kind="catalog"
              rows={products}
              onEdit={onEditProduct}
              onRemove={onToggleProduct}
              onRestore={onToggleProduct}
            />
          </Section>
          <Section title="Horario, cierre y anticipación">
            {settings && (
              <ScheduleEditor settings={settings} onSaved={onRefresh} />
            )}
          </Section>
        </>
      )}
      {user.role === "client" && (
        <Section title="Sucursales y direcciones">
          <Button onClick={() => onAction("branch")}>Crear sucursal</Button>
          {branches.map((b) => (
            <p key={b.id}>
              {b.address} · {b.city}
            </p>
          ))}
        </Section>
      )}
    </div>
  );
}
