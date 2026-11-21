import { PhotoInput } from "./photo-input";
import { Chart } from "./analytics";
import { customer } from "./access";
import { StatusChip } from "./order-badges";
import Chip from "@mui/material/Chip";
import { AttachmentLink } from "./attachment-link";
import TablePagination from "@mui/material/TablePagination";
import { attachment } from "./photos";
import React, { useEffect, useRef, useState } from "react";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Alert from "@mui/material/Alert";
import { Button, Field, Select } from "./ui";
import { api, cached } from "./offline";
export function CreditsView({
  accounts,
  user,
  payments,
  onReview,
  onPay,
  onVerify,
  onPayments,
  onChanged,
  money,
}: any) {
  const [q, Q] = useState("");
  const staff = ["admin", "courier"].includes(user.role);
  if (customer(user))
    return (
      <PersonalPortfolio
        account={accounts[0]}
        user={user}
        money={money}
        onPay={onPay}
      />
    );
  return (
    <>
      <div className="summary-cards">
        <article>
          <small>Saldo pendiente</small>
          <strong>
            {money(accounts.reduce((s, a) => s + Number(a.balance), 0))}
          </strong>
        </article>
        <article>
          <small>Abonos en revisión</small>
          <strong>
            {money(accounts.reduce((s, a) => s + Number(a.pending), 0))}
          </strong>
        </article>
      </div>
      <div className="panel">
        <Field
          required={false}
          label="Buscar cliente"
          value={q}
          onChange={(e) => Q(e.target.value)}
        />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {[
                  "Cliente",
                  "Saldo",
                  "Por verificar",
                  ...(user.role !== "courier" ? ["Cupo disponible"] : []),
                  "Acciones",
                ].map((t) => (
                  <TableCell key={t}>{t}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {accounts
                .filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
                .map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <strong>{a.name}</strong>
                    </TableCell>
                    <TableCell>{money(a.balance)}</TableCell>
                    <TableCell>{money(a.pending)}</TableCell>
                    {user.role !== "courier" && (
                      <TableCell>
                        {Number(a.credit_limit) > 0
                          ? money(
                              Number(a.credit_limit) - Number(a.credit_used),
                            )
                          : "Sin cupo autorizado"}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="actions">
                        <Button className="neutral" onClick={() => onReview(a)}>
                          Ver pedidos
                        </Button>
                        <Button
                          className="neutral"
                          onClick={() => onPayments(a)}
                        >
                          Ver abonos
                        </Button>
                        {staff && Number(a.available_to_pay) > 0 && (
                          <Button onClick={() => onPay(a)}>
                            Registrar abono
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!accounts.length && <p>No hay saldos registrados.</p>}
      </div>
      {user.role === "courier" && (
        <section className="panel">
          <h2>Mis abonos registrados</h2>
          <PaymentHistory money={money} />
        </section>
      )}
      {user.role === "admin" && (
        <section className="panel">
          <h2>Abonos pendientes de revisión</h2>
          <PaymentHistory
            money={money}
            pendingOnly
            onVerify={onVerify}
            onChanged={onChanged}
          />
        </section>
      )}
    </>
  );
}
export function CreditDetails({
  client,
  money,
  onPay,
  canPay,
  personal = false,
}: any) {
  const [revision, RV] = useState(0);
  useEffect(() => {
    const handler = () => RV((n) => n + 1);
    window.addEventListener("delipina:refresh", handler);
    return () => window.removeEventListener("delipina:refresh", handler);
  }, []);
  const [orders, O] = useState([]),
    [total, T] = useState(0),
    [page, PAGE] = useState(0),
    [size, SIZE] = useState(10),
    [error, E] = useState("");
  useEffect(() => {
    PAGE(0);
  }, [client.id]);
  useEffect(() => {
    let live = true;
    E("");
    cached(`/credit-accounts/${client.id}/orders?page=${page}&pageSize=${size}`)
      .then((data) => {
        if (live) {
          O(data.rows);
          T(data.total);
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
    };
  }, [client.id, page, size, revision]);
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      {!personal && (
        <div className="credit-detail-summary">
          <strong>{client.name}</strong>
          <p>
            Saldo del cliente: {money(client.balance)} · En verificación:{" "}
            {money(client.pending)}
          </p>
          {canPay && Number(client.available_to_pay) > 0 && (
            <Button onClick={() => onPay(client)}>
              Registrar abono general
            </Button>
          )}
        </div>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {[
                "Pedido",
                "Fecha de entrega",
                "Detalle",
                "Estado",
                "Valor",
                "Saldo",
              ].map((t) => (
                <TableCell key={t}>{t}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  #{o.id.slice(0, 6)}
                  {o.number && <small> · {o.number}</small>}
                </TableCell>
                <TableCell>
                  {new Date(o.window_start).toLocaleDateString("es-CO", {
                    timeZone: "America/Bogota",
                  })}
                </TableCell>
                <TableCell>
                  {o.items?.map((i) => (
                    <div key={i.name}>
                      {Number(i.quantity)} · {i.name}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <StatusChip status={o.status} />
                </TableCell>
                <TableCell>{money(o.total)}</TableCell>
                <TableCell>{money(o.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!orders.length && <p>No hay pedidos registrados.</p>}
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={size}
        rowsPerPageOptions={[10, 25, 50]}
        onPageChange={(_, n) => PAGE(n)}
        onRowsPerPageChange={(e) => {
          SIZE(Number(e.target.value));
          PAGE(0);
        }}
        labelRowsPerPage="Pedidos por página"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
        getItemAriaLabel={(type) =>
          type === "next" ? "Página siguiente" : "Página anterior"
        }
      />
    </>
  );
}
export function GeneralPaymentForm({
  client,
  business,
  onSaved,
  money,
  user,
}: any) {
  const key = useRef(crypto.randomUUID()),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [proof, PROOF] = useState<File | null>(null);
  const personal = customer(user);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        const b = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const r = await api("/payments", {
            method: "POST",
            headers: { "Idempotency-Key": key.current },
            body: {
              clientId: client.id,
              receiptPhoto: proof ? await attachment(proof) : undefined,
              method: b.method,
              amount: Math.round(Number(b.amount) * 100),
            },
          });
          await onSaved(r);
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <h3>{client.name}</h3>
      <p>
        Saldo: {money(client.balance)} · Disponible para abonar:{" "}
        {money(client.available_to_pay)}
      </p>
      <Field
        name="amount"
        label={personal ? "Valor del abono COP" : "Total recibido COP"}
        type="number"
        min="0.01"
        max={Number(client.available_to_pay) / 100}
        step="0.01"
      />
      <Select
        name="method"
        label="Medio de pago"
        defaultValue={personal ? "nequi" : "cash"}
      >
        {!personal && <option value="cash">Efectivo</option>}
        <option value="nequi">Nequi · requiere verificación</option>
        <option value="bancolombia">Bancolombia · requiere verificación</option>
      </Select>
      <PhotoInput
        label="Foto de la factura o comprobante"
        onFile={PROOF}
        required={personal || user?.role === "courier"}
        disabled={busy}
      />
      <p>
        {personal
          ? "Tu abono se enviará a revisión. Solo al aceptarlo se reducirá tu saldo y se liberará cupo. "
          : ""}
        El abono se aplica al saldo general del negocio, empezando por los
        pedidos con saldo más antiguos. Jornada de registro:{" "}
        {business?.nextOperatingDay || business?.day}.
      </p>
      <Button type="submit" disabled={busy}>
        {busy
          ? "Enviando…"
          : personal
            ? "Enviar abono para revisión"
            : "Registrar abono"}
      </Button>
    </form>
  );
}

export function PersonalPortfolio({ account, user, money, onPay }: any) {
  const [summary, S] = useState<any>(null),
    [error, E] = useState("");
  useEffect(() => {
    if (!account) return;
    let live = true;
    const load = () =>
      cached(`/credit-accounts/${account.id}/summary`)
        .then((x) => {
          if (live) {
            S(x);
            E("");
          }
        })
        .catch((e) => {
          if (live) E(e.message);
        });
    load();
    window.addEventListener("delipina:refresh", load);
    return () => {
      live = false;
      window.removeEventListener("delipina:refresh", load);
    };
  }, [account?.id]);
  if (!account) return <p>Cargando mi cartera…</p>;
  const available = Math.max(
    0,
    Number(account.credit_limit) - Number(account.credit_used),
  );
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="summary-cards">
        <article>
          <small>Mi saldo pendiente</small>
          <strong>{money(account.balance)}</strong>
        </article>
        <article>
          <small>Mis abonos en revisión</small>
          <strong>{money(account.pending)}</strong>
        </article>
        <article>
          <small>Mis compras entregadas</small>
          <strong>{money(summary?.spent || 0)}</strong>
        </article>
        <article>
          <small>Mis pedidos realizados</small>
          <strong>{summary?.orders ?? "…"}</strong>
        </article>
        <article>
          <small>Mi cupo disponible</small>
          <strong>
            {Number(account.credit_limit) > 0
              ? money(available)
              : "Sin cupo autorizado"}
          </strong>
          <small>
            {Number(account.credit_limit) > 0
              ? `Cupo total: ${money(account.credit_limit)}`
              : "Puedes solicitar autorización a administración."}
          </small>
        </article>
      </div>
      <section className="panel">
        <div className="actions">
          <Button
            disabled={Number(account.available_to_pay) <= 0}
            onClick={() => onPay(account)}
          >
            Enviar abono
          </Button>
        </div>
        <p>
          Envía el soporte de tu pago para revisión. Los abonos pendientes
          todavía no reducen tu deuda.
        </p>
      </section>
      {summary && (
        <div className="personal-portfolio-charts">
          <Chart
            title="Mis pedidos por mes"
            type="ColumnChart"
            rows={[
              ["Mes", "Pedidos"],
              ...summary.monthly.map((m) => [m.month, m.orders]),
            ]}
            options={{ legend: { position: "none" } }}
          />
          <Chart
            title="Mis compras por mes"
            type="ColumnChart"
            description="Valor de pedidos entregados (COP). Últimos 12 meses con actividad."
            rows={[
              ["Mes", "COP"],
              ...summary.monthly.map((m) => [m.month, Number(m.spent) / 100]),
            ]}
            options={{ legend: { position: "none" } }}
          />
        </div>
      )}
      <section className="panel">
        <h2>Mis pedidos</h2>
        <CreditDetails client={account} money={money} personal />
      </section>
      <section className="panel">
        <h2>Mis abonos</h2>
        <PaymentHistory client={account} money={money} />
      </section>
    </>
  );
}
export function PaymentHistory({
  client,
  money,
  pendingOnly = false,
  onVerify,
  onChanged,
}: any) {
  const [rows, R] = useState([]),
    [total, T] = useState(0),
    [page, P] = useState(0),
    [revision, V] = useState(0),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [reject, REJ] = useState<any>(null),
    [reason, WHY] = useState("");
  useEffect(() => {
    const load = () => V((n) => n + 1);
    window.addEventListener("delipina:refresh", load);
    return () => window.removeEventListener("delipina:refresh", load);
  }, []);
  useEffect(() => {
    let live = true;
    cached(
      `/payments?page=${page}&pageSize=10${client ? `&clientId=${client.id}` : ""}${pendingOnly ? "&pending=true" : ""}`,
    )
      .then((data) => {
        if (live) {
          R(data.rows);
          T(data.total);
          if (page > Math.max(0, Math.ceil(data.total / 10) - 1))
            P(Math.max(0, Math.ceil(data.total / 10) - 1));
          E("");
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
    };
  }, [client?.id, page, pendingOnly, revision]);
  const review = async (p: any, rejected = false) => {
    B(true);
    E("");
    try {
      if (rejected)
        await api(`/payments/${p.id}/reject`, {
          method: "POST",
          body: { reason },
        });
      else await onVerify(p);
      if (rejected) await onChanged?.();
      REJ(null);
      WHY("");
      V((n) => n + 1);
      window.dispatchEvent(new Event("delipina:refresh"));
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  };
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {[
                ...(!client ? ["Cliente"] : []),
                "Fecha",
                "Valor",
                "Medio",
                "Estado",
                "Soporte",
                ...(onVerify ? ["Acciones"] : []),
              ].map((t) => (
                <TableCell key={t}>{t}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                {!client && <TableCell>{p.client_name}</TableCell>}
                <TableCell>
                  {new Date(p.created_at).toLocaleString("es-CO", {
                    timeZone: "America/Bogota",
                  })}
                </TableCell>
                <TableCell>{money(p.amount)}</TableCell>
                <TableCell>
                  {{
                    cash: "Efectivo",
                    nequi: "Nequi",
                    bancolombia: "Bancolombia",
                  }[p.method] || p.method}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={
                      p.rejected_at
                        ? "Rechazado"
                        : p.verified
                          ? "Aplicado"
                          : "En revisión"
                    }
                    color={
                      p.rejected_at
                        ? "error"
                        : p.verified
                          ? "success"
                          : "warning"
                    }
                  />
                  {p.rejection_reason && <p>{p.rejection_reason}</p>}
                </TableCell>
                <TableCell>
                  {p.has_proof ? (
                    <AttachmentLink
                      href={`/api/payments/${p.id}/proof`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver comprobante
                    </AttachmentLink>
                  ) : (
                    "Sin soporte"
                  )}
                </TableCell>
                {onVerify && (
                  <TableCell>
                    {!p.verified && !p.rejected_at && (
                      <div className="actions">
                        <Button disabled={busy} onClick={() => review(p)}>
                          Aceptar
                        </Button>
                        <Button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            REJ(p);
                            WHY("");
                          }}
                        >
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!rows.length && (
        <p>
          {pendingOnly
            ? "No hay abonos pendientes de revisión."
            : "No hay abonos registrados."}
        </p>
      )}
      {reject && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            review(reject, true);
          }}
        >
          <p>
            Rechazar abono de {money(reject.amount)} · {reject.client_name}
          </p>
          <Field
            label="Motivo del rechazo"
            value={reason}
            onChange={(e) => WHY(e.target.value)}
            maxLength={500}
          />
          <div className="actions">
            <Button type="submit" className="danger" disabled={busy}>
              Confirmar rechazo
            </Button>
            <Button className="neutral" onClick={() => REJ(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={10}
        rowsPerPageOptions={[10]}
        onPageChange={(_, n) => P(n)}
        labelRowsPerPage="Abonos por página"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} de ${count}`
        }
        getItemAriaLabel={(t) =>
          t === "next" ? "Página siguiente" : "Página anterior"
        }
      />
    </>
  );
}
