import React, { useEffect, useState } from "react";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import { Button } from "./ui";
import { api } from "./offline";
import { enabledModules, featureLabels } from "../shared/modules";
export function ModuleSettings({ settings, onSaved }: any) {
  const [flags, F] = useState(() => enabledModules(settings)),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [saved, S] = useState(false);
  useEffect(() => F(enabledModules(settings)), [settings]);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        S(false);
        try {
          await api("/settings/modules", {
            method: "PUT",
            body: { enabledModules: flags },
          });
          await onSaved();
          S(true);
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      <h3>Módulos de Delipiña</h3>
      <p>
        Se aplica a todos los usuarios. Los permisos por rol siguen vigentes.
        Desactivar un módulo conserva su historial. Ajustes y el acceso a la
        cuenta permanecen disponibles.
      </p>
      {Object.entries(featureLabels).map(([key, name]) => (
        <FormControlLabel
          key={key}
          control={
            <Switch
              checked={flags[key]}
              disabled={busy}
              onChange={(_, v) => {
                F({ ...flags, [key]: v });
                S(false);
              }}
            />
          }
          label={String(name)}
        />
      ))}
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Módulos actualizados</Alert>}
      <div className="actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar módulos"}
        </Button>
      </div>
    </form>
  );
}
