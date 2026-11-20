import React, { useState } from "react";
import Alert from "@mui/material/Alert";
import { Button, Field, Select } from "./ui";
import { api } from "./offline";
export function DemoData({ users, onRefresh }: any) {
  const [email, E] = useState("saaibiflorez@unac.edu.co"),
    [courier, C] = useState(""),
    [busy, B] = useState(false),
    [message, M] = useState(""),
    [error, X] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        X("");
        try {
          const r = await api("/demo-data", {
            method: "POST",
            body: { email, courierId: courier || undefined },
          });
          M(
            `${r.existing ? "Ya existe este lote:" : "Lote creado:"} ${r.branch_ids.length} sucursales y ${r.order_ids.length} pedidos demo. Referencia: ${r.id}`,
          );
          await onRefresh();
        } catch (e) {
          X(e.message);
        } finally {
          B(false);
        }
      }}
    >
      <p>
        Direcciones ficticias de prueba: dos en cada municipio del área
        metropolitana y una en Bogotá. No generan facturas ni cobros y se
        excluyen del análisis. Conservamos los identificadores del lote para
        retirarlo después.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <Field
        label="Correo del cliente de prueba"
        value={email}
        onChange={(e) => E(e.target.value)}
        type="email"
      />
      <Select
        label="Mensajero para la prueba"
        value={courier}
        onChange={(e) => C(e.target.value)}
      >
        <option value="">Sin asignar · disponibles para tomar</option>
        {users
          .filter((u) => u.role === "courier" && u.active)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </Select>
      <Button type="submit" disabled={busy}>
        {busy ? "Creando…" : "Crear sucursales y pedidos demo"}
      </Button>
    </form>
  );
}
