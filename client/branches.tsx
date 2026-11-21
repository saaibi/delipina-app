import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import React, { useState } from "react";
import Alert from "@mui/material/Alert";
import { Field, Button, Select, Modal } from "./ui";
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
    [city, C] = useState(branch?.city || ""),
    [point, P] = useState(
      branch?.lat != null
        ? {
            lat: Number(branch.lat),
            lng: Number(branch.lng),
            source: branch.location_source,
            placeId: branch.location_place_id,
            expiresAt: branch.location_expires_at,
          }
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
              locationSource: point?.source,
              placeId: point?.placeId,
              expiresAt: point?.expiresAt,
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
      <Autocomplete
        freeSolo
        options={[
          "Bucaramanga",
          "Floridablanca",
          "Girón",
          "Piedecuesta",
          "Bogotá",
          "Medellín",
          "Cúcuta",
        ]}
        inputValue={city}
        onInputChange={(_, value) => {
          C(value);
          P(null);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Ciudad / municipio"
            required
            margin="normal"
            helperText="Primero selecciona o escribe el municipio de entrega"
            slotProps={{ ...params.slotProps, inputLabel: { shrink: true } }}
          />
        )}
      />
      <Field
        label="Dirección"
        value={address}
        disabled={!city.trim()}
        placeholder="Ej. Calle 45 #18-32"
        onChange={(e) => {
          A(e.target.value);
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
  const [edit, M] = useState<any>(null),
    [removing, D] = useState<any>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [archived, H] = useState<any[] | null>(null);
  async function changeBranch(id, restore = false) {
    B(true);
    E("");
    try {
      await api("/branches/" + id + (restore ? "/restore" : ""), {
        method: restore ? "POST" : "DELETE",
      });
      D(null);
      await onSaved();
      if (archived)
        H(
          (await api("/branches?includeDeleted=true")).filter(
            (b) => b.deleted_at && (!clientId || b.client_id === clientId),
          ),
        );
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <section className="branch-manager">
      {error && <Alert severity="error">{error}</Alert>}
      {removing && (
        <Modal title="Eliminar sucursal" onClose={() => !busy && D(null)}>
          <p>
            ¿Eliminar {removing.address}, {removing.city}?
          </p>
          <p>
            Los pedidos existentes se conservan. Sus frecuencias se
            desactivarán. Puedes restaurar la sucursal desde «Sucursales
            eliminadas».
          </p>
          <div className="actions">
            <Button disabled={busy} onClick={() => changeBranch(removing.id)}>
              Eliminar sucursal
            </Button>
            <Button className="neutral" disabled={busy} onClick={() => D(null)}>
              Cancelar
            </Button>
          </div>
        </Modal>
      )}
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
          <div className="actions branch-toolbar">
            <Button onClick={() => M({})}>Crear sucursal</Button>
            <Button
              className="neutral"
              onClick={async () => {
                E("");
                try {
                  H(
                    archived
                      ? null
                      : (await api("/branches?includeDeleted=true")).filter(
                          (b) =>
                            b.deleted_at &&
                            (!clientId || b.client_id === clientId),
                        ),
                  );
                } catch (e) {
                  E(e.message);
                }
              }}
            >
              {archived ? "Ocultar eliminadas" : "Sucursales eliminadas"}
            </Button>
          </div>
          {archived && (
            <section>
              <h3>Sucursales eliminadas</h3>
              {!archived.length && <p>No hay sucursales eliminadas.</p>}
              {archived.map((b) => (
                <article className="panel branch-card" key={b.id}>
                  <strong>
                    {b.address} · {b.city}
                  </strong>
                  <div className="actions branch-card-actions">
                    <Button
                      className="neutral"
                      disabled={busy}
                      onClick={() => changeBranch(b.id, true)}
                    >
                      Restaurar sucursal
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {branches
            .filter((b) => !clientId || b.client_id === clientId)
            .map((b) => (
              <article className="panel branch-card" key={b.id}>
                <strong>{b.address}</strong>
                <p>
                  {b.city}
                  {b.lat == null ? " · Ubicación pendiente" : ""}
                </p>
                <div className="actions branch-card-actions">
                  <Button className="neutral" onClick={() => M(b)}>
                    Editar sucursal
                  </Button>
                  <Button className="neutral" onClick={() => D(b)}>
                    Eliminar sucursal
                  </Button>
                </div>
              </article>
            ))}
        </>
      )}
    </section>
  );
}
