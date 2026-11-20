import { groupOrders } from "../shared/order-groups";
import { StatusChip } from "./order-badges";
import { mapsUrl, localDelivery, routeOrigin } from "../shared/routes";
import IconButton from "@mui/material/IconButton";
import MapOutlined from "@mui/icons-material/MapOutlined";
import Chip from "@mui/material/Chip";
import React, { useEffect, useState, useRef } from "react";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { Button, Modal } from "./ui";
import { api } from "./offline";
export function DeliveryRoute({
  orders,
  origin,
  originLocation,
  day,
  scope = "mine",
  onRefresh,
  refreshToken,
}: any) {
  const [data, S] = useState<any>(null),
    [error, E] = useState(""),
    [edit, M] = useState<any>(null),
    [ids, I] = useState<string[]>([]),
    [busy, B] = useState(false),
    [success, OK] = useState("");
  const key =
    orders
      .map((o) => o.id + o.status + o.courier_id + o.lat + o.lng)
      .sort()
      .join("|") + JSON.stringify({ origin, originLocation, day });
  const load = () => api("/delivery-routes").then(S);
  useEffect(() => {
    let live = true;
    api("/delivery-routes")
      .then((d) => {
        if (live) {
          S(d);
          E("");
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
    };
  }, [key, refreshToken]);
  const run = async (fn) => {
    B(true);
    E("");
    try {
      await fn();
      await load();
      await onRefresh?.();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  };
  const groups = scope === "available" ? data?.available : data?.groups;
  return (
    <section className="panel route-planner">
      <h2>
        {scope === "available" ? "Recorridos disponibles" : "Mis recorridos"}
      </h2>
      <p>
        {scope === "available"
          ? "Solicita un grupo de hasta cinco pedidos. Administración debe aprobar su asignación."
          : "Los pedidos que aún no salen se reagrupan automáticamente. Al iniciar, todos pasan a En camino y el recorrido queda fijo."}
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!data && !error && <p>Calculando recorridos…</p>}
      {data?.missingOrigin && (
        <Alert severity="warning">Falta ubicar el origen en Ajustes.</Alert>
      )}
      {groups?.length === 0 && <p>No hay recorridos en esta sección.</p>}
      {groups?.map((g, i) => (
        <article key={g.id} className="panel route-card">
          <h3>
            Recorrido {i + 1} · {g.stops.length} pedidos{" "}
            {g.status === "enroute" ? "· En camino" : ""}
          </h3>
          <p>
            {g.mode === "carrier"
              ? "Envío por transportadora · no aplica mapa local."
              : g.mode === "rescheduled"
                ? "Entrega reprogramada · conserva mensajero asignado."
                : g.mode === "road"
                  ? "Orden optimizado por vías, sin tráfico en tiempo real."
                  : g.mode === "distance"
                    ? "Orden aproximado por cercanía: servicio vial no disponible."
                    : g.mode === "unreachable"
                      ? "Revisa las ubicaciones: no hay conexión vial."
                      : "Ubicaciones pendientes de completar."}
          </p>
          {g.demo && (
            <small className="demo-warning">DEMO · puntos ficticios</small>
          )}
          <ol className="route-stop-list">
            {groupOrders(g.stops).map(({ summary: o, members }, n) => (
              <li key={o.id} className="route-stop-row">
                <span className="route-stop-number">{n + 1}</span>
                <div className="route-stop-copy">
                  <strong>
                    {o.client_name || "Cliente"}
                    {members.length > 1 ? ` · ${members.length} pedidos` : ""}
                  </strong>
                  <span>{o.address}</span>
                  <small>{o.city}</small>
                </div>
                <div className="group-statuses">
                  {[...new Set(members.map((m) => m.status))].map((status) => (
                    <StatusChip key={status} status={status} />
                  ))}
                </div>
                {localDelivery(o.city) && (
                  <IconButton
                    component="a"
                    href={mapsUrl([o], routeOrigin({ origin, originLocation }))}
                    target="_blank"
                    rel="noreferrer"
                    title="Ver mapa"
                    aria-label={`Ver mapa de ${o.client_name || "cliente"}, ${o.address}`}
                  >
                    <MapOutlined />
                  </IconButton>
                )}
              </li>
            ))}
          </ol>
          <div className="actions">
            {g.mode !== "carrier" && (
              <Button
                className="neutral"
                startIcon={<MapOutlined />}
                component="a"
                href={mapsUrl(
                  g.stops,
                  originLocation?.lat != null && originLocation?.lng != null
                    ? `${originLocation.lat},${originLocation.lng}`
                    : origin,
                )}
                target="_blank"
                rel="noreferrer"
                title="Ver mapa"
                aria-label={`Ver mapa del recorrido ${i + 1}`}
              >
                Ver mapa
              </Button>
            )}
            {scope === "available"
              ? g.mode !== "carrier" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("/delivery-route-requests", {
                          method: "POST",
                          body: { orderIds: g.stops.map((o) => o.id) },
                        });
                        OK("Solicitud enviada a administración");
                      })
                    }
                  >
                    Solicitar recorrido
                  </Button>
                )
              : g.status !== "enroute" && (
                  <>
                    <Button
                      disabled={
                        busy || g.stops.some((o) => o.status !== "ready")
                      }
                      onClick={() =>
                        run(() =>
                          api("/delivery-routes/" + g.id + "/start", {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Iniciar recorrido
                    </Button>
                    <Button
                      className="neutral"
                      disabled={busy}
                      onClick={() => {
                        M(g);
                        I(g.stops.map((o) => o.id));
                      }}
                    >
                      Agregar o quitar pedidos
                    </Button>
                  </>
                )}
          </div>
        </article>
      ))}

      {edit && (
        <Modal title="Pedidos del recorrido" onClose={() => M(null)}>
          {error && <Alert severity="error">{error}</Alert>}
          <div className="route-selection-heading">
            <span>Selecciona hasta cinco pedidos tuyos.</span>
            <Chip
              label={ids.length + " / 5"}
              color={ids.length === 5 ? "primary" : "default"}
              size="small"
            />
          </div>
          <div className="route-selection-list">
            {data.editableOrders
              .filter(
                (o) =>
                  ids.includes(o.id) ||
                  (edit.mode === "carrier"
                    ? o.city ===
                      edit.stops.find(
                        (s) =>
                          ![
                            "bucaramanga",
                            "piedecuesta",
                            "girón",
                            "giron",
                            "floridablanca",
                          ].includes((s.city || "").toLowerCase()),
                      )?.city
                    : [
                        "bucaramanga",
                        "piedecuesta",
                        "girón",
                        "giron",
                        "floridablanca",
                      ].includes((o.city || "").toLowerCase())),
              )
              .map((o) => (
                <label
                  className={
                    "route-selection-row " +
                    (ids.includes(o.id) ? "selected" : "")
                  }
                  key={o.id}
                >
                  <Switch
                    checked={ids.includes(o.id)}
                    disabled={!ids.includes(o.id) && ids.length === 5}
                    onChange={(_, v) =>
                      I(v ? [...ids, o.id] : ids.filter((id) => id !== o.id))
                    }
                  />
                  <span className="route-selection-copy">
                    <strong>{o.client_name || "Pedido"} </strong>
                    <span>{o.address}</span>
                    <small>{o.city}</small>
                  </span>
                  <Chip
                    size="small"
                    label={o.status === "ready" ? "Listo" : "En preparación"}
                    variant="outlined"
                  />
                </label>
              ))}
          </div>
          <p className="route-selection-help">
            Los que retires podrán reagruparse en otro recorrido.
          </p>
          <Button
            disabled={!ids.length || busy}
            onClick={() =>
              run(async () => {
                await api("/delivery-routes/" + edit.id, {
                  method: "PATCH",
                  body: { orderIds: ids },
                });
                M(null);
              })
            }
          >
            Guardar recorrido
          </Button>
        </Modal>
      )}
    </section>
  );
}
export function RouteRequests({ onRefresh, day }: any) {
  const [rows, R] = useState([]),
    [error, E] = useState("");
  const requestVersion = useRef(0);
  const load = async () => {
    const revision = ++requestVersion.current;
    const data = await api(
      "/delivery-route-requests" + (day ? "?day=" + day : ""),
    );
    if (revision === requestVersion.current) R(data);
  };
  useEffect(() => {
    load().catch((e) => E(e.message));
    const f = () => load().catch(() => {});
    window.addEventListener("delipina:refresh", f);
    return () => {
      requestVersion.current++;
      window.removeEventListener("delipina:refresh", f);
    };
  }, [day]);
  if (!rows.length && !error) return null;
  return (
    <section className="panel">
      <h2>Solicitudes de recorridos</h2>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="route-request-grid">
        {rows.map((r) => (
          <article key={r.id} className="panel route-request-card">
            <strong>
              {r.courier_name} · {r.order_ids.length} pedidos
            </strong>
            <ul className="route-request-stops">
              {groupOrders(r.stops || []).map(({ summary: o, members }) => (
                <li key={o.id}>
                  <div className="route-request-copy">
                    <strong>
                      {o.client_name || "Cliente"}
                      {members.length > 1 ? ` · ${members.length} pedidos` : ""}
                    </strong>
                    <small>
                      {o.address} · {o.city}
                    </small>
                  </div>
                  <div className="group-statuses">
                    {[...new Set(members.map((m) => m.status))].map(
                      (status) => (
                        <StatusChip key={status} status={status} />
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="actions">
              {[true, false].map((approve) => (
                <Button
                  key={String(approve)}
                  className={approve ? "" : "neutral"}
                  onClick={async () => {
                    try {
                      await api("/delivery-routes/" + r.id + "/decision", {
                        method: "POST",
                        body: { approve },
                      });
                      await load();
                      await onRefresh?.();
                    } catch (e) {
                      E(e.message);
                    }
                  }}
                >
                  {approve ? "Aprobar y asignar" : "Rechazar"}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
