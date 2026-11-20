import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMore from "@mui/icons-material/ExpandMore";
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
          data = data.filter((p) => p.active);
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
      {(
        Object.values(
          rows.reduce((groups, p) => {
            const id = p.catalog_product_id || p.id;
            (groups[id] ??= {
              id,
              name: p.product_name || p.name,
              rows: [],
            }).rows.push(p);
            return groups;
          }, {}),
        ) as any[]
      )
        .filter((g) =>
          (g.name + " " + g.rows.map((p) => p.presentation).join(" "))
            .toLowerCase()
            .includes(q.toLowerCase()),
        )
        .map((g) => (
          <Accordion key={g.id} defaultExpanded disableGutters>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <strong>{g.name}</strong>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer>
                <Table size="small" aria-label={"Precios de " + g.name}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Presentación</TableCell>
                      {Object.entries(
                        Object.fromEntries(
                          g.rows.map((p) => [
                            p.unit,
                            unitNames[p.unit] || p.unit,
                          ]),
                        ),
                      ).map(([unit, label]) => (
                        <TableCell key={unit}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...new Set(g.rows.map((p) => p.presentation))].map(
                      (label: string) => {
                        const variants = g.rows.filter(
                            (p) => p.presentation === label,
                          ),
                          photo = variants[0];
                        return (
                          <TableRow key={label}>
                            <TableCell>
                              <div className="price-product">
                                <ProductPhoto product={photo} small />
                                <strong>{label}</strong>
                              </div>
                            </TableCell>
                            {Object.entries(
                              Object.fromEntries(
                                g.rows.map((p) => [
                                  p.unit,
                                  unitNames[p.unit] || p.unit,
                                ]),
                              ),
                            ).map(([unit, unitLabel]) => {
                              const p = variants.find((p) => p.unit === unit);
                              return (
                                <TableCell key={unit} sx={{ minWidth: 165 }}>
                                  {p ? (
                                    <>
                                      <Field
                                        label={label + " / " + unitLabel}
                                        type="number"
                                        required={false}
                                        min="0"
                                        step="0.01"
                                        value={values[p.id] ?? ""}
                                        placeholder={String(
                                          Number(p.base_price) / 100,
                                        )}
                                        disabled={busy}
                                        onChange={(e) =>
                                          change(p.id, e.target.value)
                                        }
                                        size="small"
                                      />
                                      <small>
                                        General: {money(p.base_price)}
                                      </small>
                                      {values[p.id] !== "" && (
                                        <Button
                                          className="neutral"
                                          disabled={busy}
                                          onClick={() => change(p.id, "")}
                                        >
                                          Usar general
                                        </Button>
                                      )}
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      },
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}

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
