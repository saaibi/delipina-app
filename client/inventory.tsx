import React, { useEffect, useRef, useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import { Button, Field, Select, Modal } from "./ui";
import { api, cached } from "./offline";
import { FeedbackSnackbar } from "./feedback";
const maturities = { verde: "Verde", en_punto: "En punto", madura: "Madura" },
  kinds = {
    purchase: "Compra",
    consumption: "Salida manual",
    waste: "Merma",
    adjustment: "Ajuste por conteo",
    order: "Pedido aceptado",
    reversal: "Reposición por cancelación",
    lot: "Rendimientos de compra",
  };
const qty = (n: any) =>
  Number(n).toLocaleString("es-CO", { maximumFractionDigits: 3 });
function Maturity({ value, onChange }: any) {
  return (
    <div>
      <p>Madurez de la compra</p>
      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_, v) => v && onChange(v)}
        aria-label="Madurez de la piña"
        size="small"
      >
        {Object.entries(maturities).map(([key, name]) => (
          <ToggleButton
            key={key}
            value={key}
            sx={{
              "&.Mui-selected": {
                bgcolor: {
                  verde: "#dff2e2",
                  en_punto: "#fff2cb",
                  madura: "#ffead8",
                }[key],
                color: "#193c2c",
                fontWeight: 700,
              },
            }}
          >
            {name}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
export function InventoryView({ money }: any) {
  const [data, D] = useState<any>(null),
    [error, E] = useState(""),
    [message, MSG] = useState(""),
    [tab, TAB] = useState("stock"),
    [modal, M] = useState<any>(null),
    [revision, V] = useState(0),
    [page, P] = useState(0),
    [supplier, SUP] = useState(""),
    [kind, K] = useState(""),
    [history, H] = useState({ rows: [], total: 0 });
  const load = async () => {
    try {
      D(await cached("/inventory"));
      E("");
      V((n) => n + 1);
    } catch (e) {
      E(e.message);
    }
  };
  useEffect(() => {
    load();
    window.addEventListener("delipina:refresh", load);
    return () => window.removeEventListener("delipina:refresh", load);
  }, []);
  useEffect(() => {
    let live = true;
    cached(
      `/inventory/movements?page=${page}&pageSize=10&supplierId=${supplier}&kind=${kind}`,
    )
      .then((r) => {
        if (live) H(r);
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
    };
  }, [page, supplier, kind, revision]);
  const done = async () => {
    M(null);
    MSG("Inventario actualizado");
    await load();
  };
  if (!data) return <p>{error || "Cargando inventario…"}</p>;
  return (
    <>
      <FeedbackSnackbar
        message={error || message}
        severity={error ? "error" : "success"}
        onClose={() => {
          E("");
          MSG("");
        }}
      />
      <div className="summary-cards">
        <article>
          <small>Piña entera disponible</small>
          <strong>{qty(data.stock[0]?.quantity || 0)} kg</strong>
        </article>
        {Object.entries(maturities).map(([id, name]) => (
          <article key={id}>
            <small>{name}</small>
            <strong>
              {qty(
                data.lots
                  .filter((l) => l.maturity === id)
                  .reduce((s, l) => s + Number(l.remaining_kg), 0),
              )}{" "}
              kg
            </strong>
          </article>
        ))}
        <article>
          <small>Compras registradas · acumulado</small>
          <strong>{money(data.purchases.cost)}</strong>
        </article>
      </div>
      <div className="actions inventory-actions">
        <Button onClick={() => M({ kind: "purchase" })}>
          Registrar compra
        </Button>
        <Button className="neutral" onClick={() => M({ kind: "consumption" })}>
          Registrar salida o merma
        </Button>
        <Button className="neutral" onClick={() => M({ kind: "adjustment" })}>
          Ajustar conteo
        </Button>
      </div>
      {!data.rules.some((r) => r.active) && (
        <Alert severity="info">
          Configura los rendimientos de las presentaciones de piña para llevar
          el descuento interno de los pedidos. No configures panela o azúcar:
          este inventario controla únicamente piña entera.
        </Alert>
      )}
      {data.pending.length > 0 && (
        <section className="panel">
          <h2>Pedidos por conciliar</h2>
          <p>
            Los pedidos conservan su estado. Revisa los ingresos y rendimientos
            antes de conciliar el descuento pendiente.
          </p>
          {data.pending.map((p) => (
            <div className="invoice" key={p.order_id}>
              <div>
                <strong>{p.client_name}</strong>
                <p>{p.reason}</p>
              </div>
              <Button
                onClick={async () => {
                  try {
                    await api("/inventory/reconcile", {
                      method: "POST",
                      body: { orderId: p.order_id },
                    });
                    await load();
                  } catch (e) {
                    E(e.message);
                  }
                }}
              >
                Conciliar inventario
              </Button>
            </div>
          ))}
        </section>
      )}
      <Tabs value={tab} onChange={(_, v) => TAB(v)}>
        <Tab value="stock" label="Compras disponibles" />
        <Tab value="history" label="Movimientos" />
        <Tab value="rules" label="Rendimientos" />
      </Tabs>
      {tab === "stock" && (
        <section className="panel">
          <p>
            Las salidas usan primero las compras más antiguas. Cada compra
            conserva los rendimientos registrados al recibirla.
          </p>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Fecha",
                    "Proveedor",
                    "Madurez",
                    "Disponibles",
                    "Rendimientos",
                  ].map((t) => (
                    <TableCell key={t}>{t}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.lots.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{String(l.received_on).slice(0, 10)}</TableCell>
                    <TableCell>
                      {l.supplier || "Ajuste de inventario"}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={maturities[l.maturity]} />
                    </TableCell>
                    <TableCell>{qty(l.remaining_kg)} kg</TableCell>
                    <TableCell>
                      <Button
                        className="neutral"
                        onClick={() => M({ kind: "lot", lot: l })}
                      >
                        Editar ({l.yields.length})
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!data.lots.length && (
            <p>No hay compras con existencias disponibles.</p>
          )}
        </section>
      )}
      {tab === "rules" && (
        <section className="panel">
          <h2>Rendimientos sugeridos para nuevas compras</h2>
          <p>
            Indica kilos de piña entera y la cantidad que obtienes en la unidad
            de venta elegida. Se copian al registrar una compra y se pueden
            ajustar allí. Cambiar estas sugerencias no cambia compras ni pedidos
            anteriores.
          </p>
          <Button onClick={() => M({ kind: "rule" })}>
            Configurar rendimiento
          </Button>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Presentación",
                    "Madurez",
                    "Piña entera",
                    "Cantidad obtenida",
                    "Acción",
                  ].map((t) => (
                    <TableCell key={t}>{t}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rules.map((r) => (
                  <TableRow key={r.product_id + r.maturity}>
                    <TableCell>
                      {r.product_name || r.name} · {r.name} ({r.unit})
                    </TableCell>
                    <TableCell>{maturities[r.maturity]}</TableCell>
                    <TableCell>{qty(r.raw_kg)} kg</TableCell>
                    <TableCell>
                      {qty(r.output_quantity)} {r.unit}
                    </TableCell>
                    <TableCell>
                      <Button
                        className="neutral"
                        onClick={() => M({ kind: "rule", rule: r })}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </section>
      )}
      {tab === "history" && (
        <section className="panel">
          <div className="inventory-filters">
            <Select
              label="Proveedor"
              required={false}
              value={supplier}
              onChange={(e) => {
                SUP(e.target.value);
                P(0);
              }}
            >
              <option value="">Todos</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label="Movimiento"
              required={false}
              value={kind}
              onChange={(e) => {
                K(e.target.value);
                P(0);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(kinds).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    "Fecha",
                    "Tipo",
                    "Proveedor",
                    "Cantidad kg",
                    "Compra COP",
                    "Saldo kg",
                    "Observaciones",
                    "Registrado por",
                  ].map((t) => (
                    <TableCell key={t}>{t}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {history.rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{String(m.occurred_on).slice(0, 10)}</TableCell>
                    <TableCell>{kinds[m.kind]}</TableCell>
                    <TableCell>{m.supplier || "—"}</TableCell>
                    <TableCell>{qty(m.quantity)}</TableCell>
                    <TableCell>
                      {m.total_cost === null ? "—" : money(m.total_cost)}
                    </TableCell>
                    <TableCell>{qty(m.balance_after)}</TableCell>
                    <TableCell>{m.notes}</TableCell>
                    <TableCell>{m.actor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={history.total}
            page={page}
            rowsPerPage={10}
            rowsPerPageOptions={[10]}
            onPageChange={(_, n) => P(n)}
            labelRowsPerPage="Movimientos por página"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}–${to} de ${count}`
            }
            getItemAriaLabel={(t) =>
              t === "next" ? "Página siguiente" : "Página anterior"
            }
          />
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal.kind === "rule" ? "Configurar rendimiento" : kinds[modal.kind]
          }
          onClose={() => M(null)}
        >
          {modal.kind === "rule" ? (
            <RuleForm data={data} initial={modal.rule} onSaved={done} />
          ) : (
            <MovementForm
              data={data}
              initialKind={modal.kind}
              initialLot={modal.lot}
              onSaved={done}
            />
          )}
        </Modal>
      )}
    </>
  );
}
function RuleForm({ data, initial, onSaved }: any) {
  const [product, P] = useState(initial?.product_id || ""),
    [maturity, M] = useState(initial?.maturity || "en_punto"),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const selected = data.products.find((p) => p.id === product);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        B(true);
        E("");
        try {
          await api("/inventory/rules", {
            method: "PUT",
            body: {
              productId: product,
              maturity,
              rawUnit: "kg",
              rawQuantity: Number(f.get("raw")),
              outputQuantity: Number(f.get("output")),
              active: true,
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
      <Select
        label="Presentación de piña"
        value={product}
        onChange={(e) => P(e.target.value)}
      >
        <option value="">Seleccionar</option>
        {data.products
          .filter((p) =>
            ["kg", "libra", "lb", "arroba"].includes(p.unit.toLowerCase()),
          )
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.product_name || p.name} · {p.name} ({p.unit})
            </option>
          ))}
      </Select>
      <Maturity value={maturity} onChange={M} />
      <Field
        label="Piña entera necesaria (kg)"
        type="number"
        min="0.001"
        step="0.001"
        name="raw"
        defaultValue={initial?.raw_kg}
      />
      <Field
        label={`Cantidad obtenida (${selected?.unit || "unidad de venta"})`}
        name="output"
        type="number"
        min="0.001"
        step="0.001"
        defaultValue={initial?.output_quantity}
      />
      <Button type="submit" disabled={busy}>
        Guardar rendimiento
      </Button>
    </form>
  );
}
function MovementForm({ data, initialKind, initialLot, onSaved }: any) {
  const [kind, K] = useState(initialKind),
    [maturity, M] = useState(initialLot?.maturity || "en_punto"),
    [supplier, S] = useState(""),
    [yields, Y] = useState<any[]>([]),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    key = useRef(crypto.randomUUID());
  useEffect(
    () =>
      Y(
        initialLot && maturity === initialLot.maturity
          ? initialLot.yields.map((r) => ({
              productId: r.product_id,
              rawQuantity: Number(r.raw_kg),
              outputQuantity: Number(r.output_quantity),
            }))
          : data.rules
              .filter((r) => r.maturity === maturity && r.active)
              .map((r) => ({
                productId: r.product_id,
                rawQuantity: Number(r.raw_kg),
                outputQuantity: Number(r.output_quantity),
              })),
      ),
    [maturity],
  );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bogota",
  });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        B(true);
        E("");
        try {
          if (kind === "lot") {
            await api(`/inventory/lots/${initialLot.id}`, {
              method: "PUT",
              body: { maturity, yields },
            });
            await onSaved();
            return;
          }
          await api("/inventory/movements", {
            method: "POST",
            headers: { "Idempotency-Key": key.current },
            body: {
              kind,
              unit: "kg",
              quantity: Number(f.get("quantity")),
              totalCost:
                kind === "purchase"
                  ? Math.round(Number(f.get("cost")) * 100)
                  : undefined,
              supplierId: supplier || undefined,
              supplierName: f.get("supplierName") || undefined,
              maturity,
              date: f.get("date"),
              notes: f.get("notes"),
              yields:
                kind === "purchase" || kind === "adjustment"
                  ? yields
                  : undefined,
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
      {initialKind === "consumption" && (
        <Select
          label="Tipo de salida"
          value={kind}
          onChange={(e) => K(e.target.value)}
        >
          <option value="consumption">Salida manual</option>
          <option value="waste">Merma o pérdida</option>
        </Select>
      )}
      {kind !== "lot" && (
        <Field
          label={
            kind === "adjustment"
              ? "Kilos reales contados"
              : "Cantidad de piña entera (kg)"
          }
          name="quantity"
          type="number"
          min={kind === "adjustment" ? "0" : "0.001"}
          step="0.001"
        />
      )}
      {kind === "purchase" && (
        <>
          <Select
            label="Proveedor"
            required={false}
            value={supplier}
            onChange={(e) => S(e.target.value)}
          >
            <option value="">Nuevo proveedor</option>
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {!supplier && (
            <Field name="supplierName" label="Nombre del proveedor" />
          )}
          <Field
            name="cost"
            label="Valor total de la compra (COP)"
            type="number"
            min="0.01"
            step="0.01"
          />
        </>
      )}
      {["purchase", "adjustment", "lot"].includes(kind) && (
        <>
          <Maturity value={maturity} onChange={M} />
          <h3>Rendimientos de este ingreso</h3>
          <p>
            Se guardan con la compra. Si no los tienes, podrás recibir la piña;
            el descuento de los pedidos quedará pendiente de conciliación hasta
            configurar el rendimiento.
          </p>
          {yields.map((r, n) => {
            const p = data.products.find((p) => p.id === r.productId);
            return (
              <div key={r.productId} className="inventory-yield-row">
                <strong>
                  {p?.product_name || p?.name} · {p?.name} ({p?.unit})
                </strong>
                <Field
                  label="Piña entera (kg)"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={r.rawQuantity}
                  onChange={(e) =>
                    Y(
                      yields.map((v, i) =>
                        i === n ? { ...v, rawQuantity: e.target.value } : v,
                      ),
                    )
                  }
                />
                <Field
                  label={`Cantidad obtenida (${p?.unit})`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={r.outputQuantity}
                  onChange={(e) =>
                    Y(
                      yields.map((v, i) =>
                        i === n ? { ...v, outputQuantity: e.target.value } : v,
                      ),
                    )
                  }
                />
                <Button
                  className="danger"
                  onClick={() => Y(yields.filter((_, i) => i !== n))}
                >
                  Quitar
                </Button>
              </div>
            );
          })}
          <Select
            label="Agregar presentación al ingreso"
            value=""
            required={false}
            onChange={(e) => {
              if (e.target.value)
                Y([
                  ...yields,
                  {
                    productId: e.target.value,
                    rawQuantity: "",
                    outputQuantity: "",
                  },
                ]);
            }}
          >
            <option value="">Seleccionar presentación de piña</option>
            {data.products
              .filter(
                (p) =>
                  !yields.some((r) => r.productId === p.id) &&
                  ["kg", "libra", "lb", "arroba"].includes(
                    p.unit.toLowerCase(),
                  ),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name || p.name} · {p.name} ({p.unit})
                </option>
              ))}
          </Select>
        </>
      )}
      {kind !== "lot" && (
        <>
          <Field
            label="Fecha"
            name="date"
            type="date"
            max={today}
            defaultValue={today}
          />
          <Field
            label="Observaciones o motivo"
            name="notes"
            required={kind !== "purchase"}
            multiline
            rows={2}
          />
        </>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Registrando…" : "Guardar movimiento"}
      </Button>
    </form>
  );
}
