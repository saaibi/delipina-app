import React, { useEffect, useState } from "react";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Alert from "@mui/material/Alert";
import { Button, Field, Select } from "./ui";
import { ProductPhoto } from "./products";
import { api } from "./offline";
const unitNames = {
  kg: "kg",
  lb: "libra",
  arroba: "arroba (25 lb)",
  pack: "empaque",
};
export function ClientPriceCatalog({
  users,
  initialClientId,
  onSaved,
  money,
}: any) {
  const clients = users.filter(
      (u) => u.role === "client" && u.active && !u.deleted_at,
    ),
    [client, C] = useState(initialClientId || clients[0]?.id || ""),
    [rows, R] = useState<any[]>([]),
    [values, V] = useState<Record<string, string>>({}),
    [dirty, D] = useState<Record<string, boolean>>({}),
    [q, Q] = useState(""),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [success, S] = useState("");
  useEffect(() => {
    let active = true;
    R([]);
    V({});
    D({});
    E("");
    S("");
    if (client)
      api("/products?clientId=" + encodeURIComponent(client))
        .then((data) => {
          if (!active) return;
          R(data);
          V(
            Object.fromEntries(
              data.map((p) => [
                p.id,
                p.special_price === null || p.special_price === undefined
                  ? ""
                  : String(Number(p.special_price) / 100),
              ]),
            ),
          );
        })
        .catch((e) => {
          if (active) E(e.message);
        });
    return () => {
      active = false;
    };
  }, [client]);
  function change(id, value) {
    V((prev) => ({ ...prev, [id]: value }));
    D((prev) => ({ ...prev, [id]: true }));
    S("");
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        S("");
        try {
          await api("/prices", {
            method: "PUT",
            body: {
              clientId: client,
              prices: Object.keys(dirty).map((productId) => ({
                productId,
                price:
                  values[productId] === ""
                    ? null
                    : Math.round(Number(values[productId]) * 100),
              })),
            },
          });
          R((prev) =>
            prev.map((p) =>
              dirty[p.id]
                ? {
                    ...p,
                    special_price:
                      values[p.id] === ""
                        ? null
                        : Math.round(Number(values[p.id]) * 100),
                  }
                : p,
            ),
          );
          D({});
          S("Precios guardados para todas las sucursales de este cliente.");
          await onSaved();
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Select
        label="Cliente"
        value={client}
        disabled={busy || Object.keys(dirty).length > 0}
        onChange={(e) => C(e.target.value)}
      >
        {clients.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <p>
        Configura el precio de cada presentación del catálogo. Deja el campo
        vacío para usar el precio general. Los pedidos registrados conservan su
        precio.
      </p>
      <Field
        required={false}
        label="Buscar producto o presentación"
        value={q}
        onChange={(e) => Q(e.target.value)}
      />
      <TableContainer>
        <Table size="small" aria-label="Catálogo de precios por cliente">
          <TableHead>
            <TableRow>
              {[
                "Producto y presentación",
                "Precio general",
                "Precio del cliente (COP)",
                "Acción",
              ].map((c) => (
                <TableCell key={c}>{c}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows
              .filter(
                (p) =>
                  p.active &&
                  (p.name + " " + p.presentation)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
              )
              .map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="price-product">
                      <ProductPhoto product={p} small />
                      <div>
                        <strong>{p.name}</strong>
                        <div>
                          {p.presentation} · {unitNames[p.unit]}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {money(p.base_price)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <Field
                      label={"Precio " + p.name + " / " + unitNames[p.unit]}
                      required={false}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(Number(p.base_price) / 100)}
                      value={values[p.id] ?? ""}
                      disabled={busy}
                      onChange={(e) => change(p.id, e.target.value)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      className="neutral"
                      disabled={busy || !values[p.id]}
                      onClick={() => change(p.id, "")}
                    >
                      Usar general
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!clients.length && (
        <p>Crea un cliente en Ajustes para configurar sus precios.</p>
      )}
      <div className="actions">
        <Button
          type="submit"
          disabled={busy || !client || !Object.keys(dirty).length}
        >
          {busy ? "Guardando…" : "Guardar precios especiales"}
        </Button>
        {Object.keys(dirty).length > 0 && (
          <Button
            className="neutral"
            disabled={busy}
            onClick={() => {
              V(
                Object.fromEntries(
                  rows.map((p) => [
                    p.id,
                    p.special_price == null
                      ? ""
                      : String(Number(p.special_price) / 100),
                  ]),
                ),
              );
              D({});
            }}
          >
            Descartar cambios
          </Button>
        )}
      </div>
    </form>
  );
}
