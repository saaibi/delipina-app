import React, { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import { api } from "./offline";
import { routeLinks } from "../shared/routes";
export function DeliveryRoute({ orders, origin, originLocation, day }: any) {
  const [data, S] = useState<any>(null),
    [error, E] = useState("");
  const key =
    orders
      .map((o) => o.id + o.status + o.courier_id + o.lat + o.lng)
      .sort()
      .join("|") + JSON.stringify({ origin, originLocation, day });
  useEffect(() => {
    let live = true;
    S(null);
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
  }, [key]);
  return (
    <section className="panel route-planner">
      <h2>Recorridos automáticos</h2>
      <p>
        Hasta 5 pedidos por recorrido, agrupados por zona. El orden sugerido se
        actualiza con las entregas asignadas de esta jornada.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <p>Calculando recorridos…</p>}
      {data?.missingOrigin && (
        <Alert severity="warning">
          Falta ubicar el punto de salida en Ajustes para optimizar los
          recorridos.
        </Alert>
      )}
      {data?.groups.length === 0 && (
        <p>No tienes pedidos asignados listos o en camino en esta jornada.</p>
      )}
      {data?.groups.map((g, i) => (
        <article key={g.id} className="panel">
          <h3>
            Recorrido {i + 1} · {g.stops.length}{" "}
            {g.stops.length === 1 ? "pedido" : "pedidos"}
          </h3>
          <p>
            {g.mode === "road"
              ? "Orden con menor tiempo estimado por vías para estas paradas. Sin tráfico en tiempo real."
              : g.mode === "distance"
                ? "Orden por cercanía aproximada: el servicio de vías no está disponible."
                : g.mode === "unreachable"
                  ? "No se encontró conexión vial entre todas las paradas. Revisa sus ubicaciones."
                  : "Pendiente de optimizar: completa la ubicación de las sucursales."}
          </p>
          {g.demo && (
            <p className="demo-warning">
              DEMO · puntos ficticios para probar los recorridos.
            </p>
          )}
          <ol>
            {g.stops.map((o) => (
              <li key={o.id}>
                #{o.id.slice(0, 6)} · {o.address} · {o.city}
                {o.lat == null ? " · Ubicación pendiente" : ""}
              </li>
            ))}
          </ol>
          {routeLinks(
            data.originLocation
              ? `${data.originLocation.lat},${data.originLocation.lng}`
              : data.origin,
            g.stops,
          ).map((r, j) => (
            <a
              className="button"
              href={r.url}
              target="_blank"
              rel="noreferrer"
              key={j}
            >
              {g.stops.length > 4 ? `Abrir tramo ${j + 1}` : "Abrir recorrido"}{" "}
              · {r.count} {r.count === 1 ? "parada" : "paradas"} ↗
            </a>
          ))}
          {g.stops.length > 4 && (
            <p>
              Es un solo recorrido de cinco pedidos; se abre en dos tramos para
              admitir los límites del navegador móvil.
            </p>
          )}
        </article>
      ))}
      <small>
        Rutas:{" "}
        <a href="https://project-osrm.org" target="_blank" rel="noreferrer">
          OSRM
        </a>{" "}
        /{" "}
        <a
          href="https://routing.openstreetmap.de/about.html"
          target="_blank"
          rel="noreferrer"
        >
          FOSSGIS
        </a>{" "}
        · Datos ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        ·{" "}
        <a
          href="https://www.openstreetmap.org/fixthemap"
          target="_blank"
          rel="noreferrer"
        >
          Corregir mapa
        </a>
        . Se comparten coordenadas con el servicio de rutas; Google recibe las
        paradas al abrir la navegación.
      </small>
    </section>
  );
}
