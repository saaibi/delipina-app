import React, { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { api } from "./offline";
import { Field, Button } from "./ui";
export function MembersEditor({ clientId, admin = false }: any) {
  const [rows, R] = useState([]),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const load = () =>
    api(
      "/client-members" +
        (admin ? "?clientId=" + encodeURIComponent(clientId) : ""),
    ).then(R);
  useEffect(() => {
    load().catch((e) => E(e.message));
  }, [clientId]);
  async function edit(m, body) {
    B(true);
    E("");
    try {
      await api("/client-members/" + m.id, { method: "PATCH", body });
      await load();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <p>
        Cada persona ingresa con su propia cuenta de Google. Sus pedidos
        pertenecen a este cliente; puedes desactivar su acceso y decidir si ve
        la cartera.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            b = Object.fromEntries(new FormData(form));
          B(true);
          E("");
          try {
            await api("/client-members", {
              method: "POST",
              body: {
                name: b.name,
                email: b.email,
                clientId,
                canViewPortfolio: b.portfolio === "on",
              },
            });
            form.reset();
            await load();
          } catch (e) {
            E(e.message);
          } finally {
            B(false);
          }
        }}
      >
        <div className="row">
          <Field name="name" label="Nombre" />
          <Field name="email" type="email" label="Correo Google" />
        </div>
        <FormControlLabel
          control={<Switch name="portfolio" />}
          label="Puede ver cartera"
        />
        <Button type="submit" disabled={busy}>
          Agregar usuario del cliente
        </Button>
      </form>
      {rows.map((m) => (
        <article className="panel member-row" key={m.id}>
          <strong>{m.name}</strong>
          <small>{m.email}</small>
          <FormControlLabel
            control={
              <Switch
                disabled={busy}
                checked={m.active}
                onChange={(_, active) => edit(m, { active })}
              />
            }
            label="Activo"
          />
          <FormControlLabel
            control={
              <Switch
                disabled={busy}
                checked={m.can_view_portfolio}
                onChange={(_, v) => edit(m, { canViewPortfolio: v })}
              />
            }
            label="Ver cartera"
          />
        </article>
      ))}
      {!rows.length && <p>Aún no hay usuarios adicionales asociados.</p>}
    </>
  );
}
