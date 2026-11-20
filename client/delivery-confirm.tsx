import React, { useState, useRef } from "react";
import Alert from "@mui/material/Alert";
import { Field, Select, Button } from "./ui";
import { api } from "./offline";
import { attachment } from "./photos";
export function DeliveryConfirm({ order, onDone }: any) {
  const [amount, A] = useState("0"),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [paid, P] = useState(false),
    key = useRef("delivery-payment:" + order.id);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        const f = new FormData(e.currentTarget);
        try {
          if (Number(amount) > 0 && !paid) {
            const photo = await attachment(f.get("proof") as File);
            await api("/payments", {
              method: "POST",
              headers: { "Idempotency-Key": key.current },
              body: {
                clientId: order.client_id,
                method: f.get("method"),
                amount: Math.round(Number(amount) * 100),
                receiptPhoto: photo,
              },
            });
            P(true);
          }
          await api("/orders/" + order.id + "/action", {
            method: "POST",
            body: { action: "deliver" },
          });
          await onDone();
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      {paid && (
        <Alert severity="success">
          El abono ya quedó registrado. Puedes reintentar confirmar la entrega
          sin duplicarlo.
        </Alert>
      )}
      <Field
        label="Dinero recibido COP (0 si no recibió)"
        type="number"
        min="0"
        step="0.01"
        value={amount}
        disabled={paid}
        onChange={(e) => A(e.target.value)}
      />
      {Number(amount) > 0 && !paid && (
        <>
          <Select label="Medio de pago" name="method">
            <option value="cash">Efectivo</option>
            <option value="nequi">Nequi · verificar</option>
            <option value="bancolombia">Bancolombia · verificar</option>
          </Select>
          <Field
            name="proof"
            label="Foto de la factura o comprobante"
            type="file"
            accept="image/*"
            capture="environment"
          />
          <p>
            El abono se registra sobre la cartera del cliente; las
            transferencias requieren verificación.
          </p>
        </>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Registrando…" : "Confirmar entrega"}
      </Button>
    </form>
  );
}
