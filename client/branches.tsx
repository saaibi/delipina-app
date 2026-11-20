import React, { useState } from "react";
import Alert from "@mui/material/Alert";
import { Field, Button, Select } from "./ui";
import { LocationPicker } from "./location-picker";
import { api } from "./offline";
export function BranchEditor({
  branch,
  clientId,
  users = [],
  onSaved,
  onCancel,
}: any) {
  const [address, A] = useState(branch?.address || ""),
    [city, C] = useState(branch?.city || "Bucaramanga"),
    [point, P] = useState(
      branch?.lat != null
        ? { lat: Number(branch.lat), lng: Number(branch.lng) }
        : null,
    ),
    [owner, O] = useState(clientId || ""),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        try {
          await api("/branches" + (branch ? "/" + branch.id : ""), {
            method: branch ? "PATCH" : "POST",
            body: {
              clientId: owner || undefined,
              address,
              city,
              lat: point?.lat,
              lng: point?.lng,
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
      {!clientId && !branch && users.length > 0 && (
        <Select
          label="Cliente"
          value={owner}
          onChange={(e) => O(e.target.value)}
          required
        >
          <option value="">Selecciona un cliente</option>
          {users
            .filter((u) => u.role === "client")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </Select>
      )}
      <Field
        label="Dirección"
        value={address}
        onChange={(e) => {
          A(e.target.value);
          P(null);
        }}
      />
      <Field
        label="Ciudad / municipio"
        value={city}
        onChange={(e) => {
          C(e.target.value);
          P(null);
        }}
      />
      <LocationPicker
        address={address}
        city={city}
        point={point}
        onChange={P}
      />
      <div className="actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar sucursal"}
        </Button>
        {onCancel && (
          <Button className="neutral" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
export function BranchManager({ clientId, branches, onSaved }: any) {
  const [edit, M] = useState<any>(null);
  return (
    <section>
      {edit ? (
        <BranchEditor
          key={edit.id || "new"}
          branch={edit.id ? edit : null}
          clientId={clientId}
          onSaved={async () => {
            await onSaved();
            M(null);
          }}
          onCancel={() => M(null)}
        />
      ) : (
        <>
          <Button onClick={() => M({})}>Crear sucursal</Button>
          {branches
            .filter((b) => !clientId || b.client_id === clientId)
            .map((b) => (
              <article className="panel" key={b.id}>
                <strong>{b.address}</strong>
                <p>
                  {b.city}
                  {b.lat == null ? " · Ubicación pendiente" : ""}
                </p>
                <Button className="neutral" onClick={() => M(b)}>
                  Editar sucursal
                </Button>
              </article>
            ))}
        </>
      )}
    </section>
  );
}
