import { MembersEditor } from "./members";
import { ServerTable } from "./server-table";
import { has } from "./access";
import { ProductCatalog } from "./product-editor";
import React, { useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
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
            leadHours: settings.leadHours ?? 2,
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
            <Field
              label="Anticipación (horas)"
              type="number"
              min="0"
              step="0.25"
              value={d.leadHours ?? settings.leadHours ?? 2}
              onChange={(e) =>
                change(
                  i + 1,
                  "leadHours",
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              size="small"
              disabled={!d.enabled}
            />
          </div>
        );
      })}
      <p>
        El horario determina la recepción de pedidos. La jornada contable se
        cierra automáticamente cuando terminan las entregas y administración
        confirma todos los cuadres.
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
  accounts = [],
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
  const [userTab, UT] = useState("staff");
  return (
    <div className="settings-sections">
      <Section title="Notificaciones">
        <NotificationSettings controller={push} />
      </Section>
      {admin && (
        <>
          <Section title="Usuarios y acceso">
            <Tabs
              value={userTab}
              onChange={(_, v) => UT(v)}
              aria-label="Tipo de usuarios"
            >
              <Tab value="staff" label="Usuarios internos" />
              <Tab value="clients" label="Clientes" />
            </Tabs>
            <p>
              {userTab === "staff"
                ? "Administrador, planta, mensajero y usuarios personalizados."
                : "Clientes y acceso a sus pedidos."}
            </p>
            <Button
              onClick={() => onAction({ kind: "createUser", group: userTab })}
            >
              {userTab === "staff" ? "Crear usuario interno" : "Crear cliente"}
            </Button>
            <ManagementTable
              kind={userTab === "clients" ? "clients" : "users"}
              key={userTab}
              rows={users
                .map((u) => ({
                  ...u,
                  balance: accounts.find((a) => a.id === u.id)?.balance || 0,
                }))
                .filter((u) =>
                  userTab === "clients"
                    ? u.role === "client"
                    : !["client", "client_member"].includes(u.role),
                )}
              onMembers={(u) => onAction({ kind: "members", clientId: u.id })}
              onPrices={(u) => onAction({ kind: "price", clientId: u.id })}
              onEdit={onEditUser}
              onRemove={onRemoveUser}
              onRestore={onRestoreUser}
            />
          </Section>
          <Section title="Productos y presentaciones">
            <div className="actions">
              <Button onClick={() => onAction("catalog")}>
                Crear producto
              </Button>
              <Button
                className="neutral"
                onClick={() => onAction({ kind: "price" })}
              >
                Precios especiales por cliente
              </Button>
            </div>
            <ProductCatalog
              products={products}
              onEdit={onEditProduct}
              onRefresh={onRefresh}
            />
          </Section>
          <Section title="Horario, cierre y anticipación">
            {settings && (
              <ScheduleEditor settings={settings} onSaved={onRefresh} />
            )}
          </Section>
        </>
      )}
      {has(user, "audit") && (
        <Section title="Trazabilidad">
          <ServerTable kind="audit" />
        </Section>
      )}
      {has(user, "days") && (
        <Section title="Jornadas y cierre contable">
          <ServerTable kind="days" />
        </Section>
      )}
      {admin && (
        <Section title="Pagos en línea">
          <p>
            PSE, Nequi y Bancolombia: cuenta de comercio pendiente. Los pagos
            actuales son registros de cobro; las transferencias requieren
            verificación administrativa. La aprobación automática estará
            disponible cuando se configure una pasarela.
          </p>
          <a href="https://wompi.co" target="_blank" rel="noreferrer">
            Consultar Wompi
          </a>
        </Section>
      )}
      {user.role === "client" && (
        <Section title="Usuarios de mi cliente">
          <MembersEditor />
        </Section>
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
