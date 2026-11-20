import React, { useState } from "react";
import { api } from "./offline";
import { Button, Field } from "./ui";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
const labels = {
  business_days: "Jornadas",
  branches: "Sucursales",
  orders: "Pedidos",
  invoices: "Facturas",
  payments: "Pagos",
  order_schedules: "Frecuencias",
  delivery_runs: "Recorridos",
  prices: "Precios especiales",
  settlements: "Cuadres",
};
export function Maintenance({ onRefresh }: any) {
  const [preview, P] = useState<any>(null),
    [archives, A] = useState<any[]>([]),
    [phrase, F] = useState(""),
    [restore, R] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    [error, E] = useState("");
  async function load() {
    const [p, a] = await Promise.all([
      api("/maintenance/preview"),
      api("/maintenance/archives"),
    ]);
    P(p);
    A(a);
  }
  async function run(action: () => Promise<any>) {
    B(true);
    E("");
    M("");
    try {
      await action();
      await load();
      onRefresh?.();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <Stack spacing={2}>
      <p>
        Conserva usuarios, productos, presentaciones, imágenes y ajustes. Limpia
        jornadas, sucursales, pedidos, cartera, frecuencias, recorridos y
        precios especiales. Antes de limpiar se guarda un respaldo restaurable.
      </p>
      <Button disabled={busy} onClick={() => run(load)}>
        Revisar datos y respaldos
      </Button>
      {preview && (
        <>
          <p>
            Se conservan: {preview.preserved.users.count} usuarios,{" "}
            {preview.preserved.catalog_products.count} productos y{" "}
            {preview.preserved.products.count} variantes de presentación/unidad.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(labels).map(([key, label]) => (
              <span key={key}>
                {label}: <strong>{preview.counts[key]}</strong>
              </span>
            ))}
          </div>
          <Alert severity="info">
            El sistema abrirá una jornada vacía para hoy. Los respaldos
            permanecen disponibles para restaurar; descárgalos para conservar
            una copia externa.
          </Alert>
          <Field
            label="Escribe LIMPIAR DELIPIÑA"
            value={phrase}
            onChange={(e) => F(e.target.value)}
          />
          <Button
            disabled={busy || phrase !== "LIMPIAR DELIPIÑA"}
            onClick={() =>
              run(async () => {
                await api("/maintenance/cleanup", {
                  method: "POST",
                  body: { confirmation: phrase },
                });
                F("");
                M("Limpieza terminada. Usuarios y catálogo conservados.");
              })
            }
          >
            Guardar respaldo y limpiar operación
          </Button>
          {archives.length > 0 && (
            <>
              <h3>Respaldos de operación</h3>
              <Field
                label="Para restaurar escribe RESTAURAR DELIPIÑA"
                value={restore}
                onChange={(e) => R(e.target.value)}
              />
              {archives.map((a) => (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid #dce4d7",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <strong>
                    {new Date(a.created_at).toLocaleString("es-CO")}
                  </strong>
                  <p>
                    {a.summary.orders} pedidos · {a.summary.branches} sucursales
                    · {a.summary.business_days} jornadas
                  </p>
                  <Stack
                    direction="row"
                    spacing={2}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    <a
                      href={"/api/maintenance/archives/" + a.id + "/download"}
                      download
                    >
                      Descargar respaldo
                    </a>
                    <Button
                      disabled={busy || restore !== "RESTAURAR DELIPIÑA"}
                      onClick={() =>
                        run(async () => {
                          await api(
                            "/maintenance/archives/" + a.id + "/restore",
                            { method: "POST", body: { confirmation: restore } },
                          );
                          R("");
                          M(
                            "Operación restaurada. También se respaldó el estado anterior.",
                          );
                        })
                      }
                    >
                      Restaurar operación
                    </Button>
                  </Stack>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
