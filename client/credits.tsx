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
  money,
}: any) {
  const [q, Q] = useState("");
  const staff = ["admin", "courier"].includes(user.role);
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
          <small>Transferencias en verificación</small>
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
      {user.role === "admin" && payments.some((p) => !p.verified) && (
        <div className="panel">
          <h2>Transferencias por verificar</h2>
          {payments
            .filter((p) => !p.verified)
            .map((p) => (
              <article className="invoice" key={p.id}>
                <div>
                  {money(p.amount)} · {p.method}
                  <p>
                    Recibida por {p.receiver} ·{" "}
                    {new Date(p.created_at).toLocaleString("es-CO")}
                  </p>
                </div>
                <Button onClick={() => onVerify(p)}>
                  Verificar y aplicar abono
                </Button>
              </article>
            ))}
        </div>
      )}
    </>
  );
}
export function CreditDetails({ client, money, onPay, canPay }: any) {
  const [orders, O] = useState([]),
    [error, E] = useState("");
  useEffect(() => {
    cached("/credit-accounts/" + client.id + "/orders")
      .then(O)
      .catch((e) => E(e.message));
  }, [client.id]);
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="credit-detail-summary">
        <strong>{client.name}</strong>
        <p>
          Saldo del cliente: {money(client.balance)} · En verificación:{" "}
          {money(client.pending)}
        </p>
        {canPay && Number(client.available_to_pay) > 0 && (
          <Button onClick={() => onPay(client)}>Registrar abono general</Button>
        )}
      </div>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {["Pedido", "Fecha de entrega", "Detalle", "Valor", "Saldo"].map(
                (t) => (
                  <TableCell key={t}>{t}</TableCell>
                ),
              )}
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
                <TableCell>{money(o.total)}</TableCell>
                <TableCell>{money(o.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
export function GeneralPaymentForm({ client, business, onSaved, money }: any) {
  const key = useRef(crypto.randomUUID()),
    [busy, B] = useState(false),
    [error, E] = useState("");
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
        label="Total recibido COP"
        type="number"
        min="0.01"
        max={Number(client.available_to_pay) / 100}
        step="0.01"
      />
      <Select name="method" label="Medio de pago" defaultValue="cash">
        <option value="cash">Efectivo</option>
        <option value="nequi">Nequi · requiere verificación</option>
        <option value="bancolombia">Bancolombia · requiere verificación</option>
      </Select>
      <p>
        El abono se aplica al saldo general del cliente, empezando por los
        pedidos con saldo más antiguos. Jornada de registro:{" "}
        {business?.nextOperatingDay || business?.day}.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Registrando…" : "Registrar abono"}
      </Button>
    </form>
  );
}
