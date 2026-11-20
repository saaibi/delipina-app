import React, { useState, useEffect } from "react";
import Alert from "@mui/material/Alert";
import { api } from "./offline";
import { Button, Field } from "./ui";
export function SettlementsView({ user, money }: any) {
  const [rows, R] = useState([]),
    [error, E] = useState(""),
    [success, S] = useState("");
  const load = () => api("/settlement-days").then(R);
  useEffect(() => {
    load().catch((e) => E(e.message));
    const f = () => load().catch(() => {});
    window.addEventListener("delipina:refresh", f);
    return () => window.removeEventListener("delipina:refresh", f);
  }, []);
  return (
    <section className="panel">
      <h2>Cuadre diario de mensajeros</h2>
      <p>
        El mensajero envía sus cuentas y administración las confirma. La jornada
        contable espera todos los cuadres, las entregas resueltas y las
        transferencias verificadas.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!rows.length && <p>No hay cuadres pendientes para jornadas abiertas.</p>}
      {rows.map((r) => (
        <article className="panel" key={r.day + r.courier_id}>
          <strong>
            {r.day} · {r.courier_name}
          </strong>
          <p>
            Efectivo registrado: {money(r.current_cash)} ·{" "}
            {r.status === "confirmed"
              ? "Confirmado"
              : r.status === "submitted"
                ? "Enviado a revisión"
                : "Pendiente de enviar"}
          </p>
          {r.received_cash != null && (
            <p>
              Efectivo entregado: {money(r.received_cash)} · Diferencia:{" "}
              {money(Number(r.received_cash) - Number(r.expected_cash))}
            </p>
          )}
          {user.role === "courier" && r.status !== "confirmed" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const b = Object.fromEntries(new FormData(e.currentTarget));
                E("");
                try {
                  await api("/settlements", {
                    method: "POST",
                    body: {
                      day: r.day,
                      receivedCash: Math.round(Number(b.received) * 100),
                    },
                  });
                  S("Cuadre enviado para confirmación.");
                  await load();
                } catch (e) {
                  E(e.message);
                }
              }}
            >
              <Field
                name="received"
                type="number"
                label="Efectivo que entregas (COP)"
                min="0"
                defaultValue={Number(r.received_cash ?? r.current_cash) / 100}
              />
              <Button type="submit">Enviar cuadre</Button>
            </form>
          )}
          {user.role === "admin" && r.status === "submitted" && (
            <Button
              onClick={async () => {
                E("");
                try {
                  await api("/settlements", {
                    method: "POST",
                    body: {
                      day: r.day,
                      courierId: r.courier_id,
                      confirm: true,
                    },
                  });
                  S("Cuadre confirmado. Se revisó el cierre de la jornada.");
                  await load();
                } catch (e) {
                  E(e.message);
                }
              }}
            >
              Confirmar cuentas recibidas
            </Button>
          )}
        </article>
      ))}
    </section>
  );
}
