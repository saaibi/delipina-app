import React, { useState } from "react";
import Alert from "@mui/material/Alert";
import { Field, Button, Select } from "./ui";
import { api } from "./offline";
export function BranchLocations({ branches, onSaved }: any) {
  const [id, S] = useState(""),
    [error, E] = useState(""),
    [message, M] = useState("");
  const branch = branches.find((b) => b.id === id);
  return (
    <section>
      <h3>Ubicaciones para recorridos</h3>
      <p>
        Guarda el punto de entrega de cada sucursal para calcular el orden por
        vías. En Google Maps puedes mantener pulsado el punto y copiar sus
        coordenadas.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <Select
        label="Sucursal a ubicar"
        value={id}
        onChange={(e) => {
          S(e.target.value);
          M("");
          E("");
        }}
      >
        <option value="">Selecciona una sucursal</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.address} · {b.city}
            {b.lat == null ? " · Sin ubicación" : ""}
          </option>
        ))}
      </Select>
      {branch && (
        <form
          key={branch.id + ":" + branch.lat + ":" + branch.lng}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api("/branches/" + id + "/location", {
                method: "PATCH",
                body: { lat: f.get("lat"), lng: f.get("lng") },
              });
              await onSaved();
              E("");
              M("Ubicación guardada");
            } catch (e) {
              E(e.message);
            }
          }}
        >
          <Field
            name="lat"
            label="Latitud"
            type="number"
            step="any"
            min="-90"
            max="90"
            defaultValue={branch.lat ?? ""}
          />
          <Field
            name="lng"
            label="Longitud"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={branch.lng ?? ""}
          />
          <Button type="submit">Guardar ubicación</Button>
        </form>
      )}
    </section>
  );
}
