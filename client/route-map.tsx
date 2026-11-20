import React, { useState, useEffect, useRef } from "react";
import * as L from "leaflet";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Navigation from "@mui/icons-material/Navigation";
import { api } from "./offline";
import { Modal } from "./ui";
export function RouteMap({ route, onClose }: any) {
  const [data, S] = useState<any>(null),
    [error, E] = useState(""),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    api("/delivery-route-map", {
      method: "POST",
      body: {
        routeId: route.status ? route.id : undefined,
        orderIds: route.stops.map((o) => o.id),
      },
    })
      .then((d) => live && S(d))
      .catch((e) => live && E(e.message));
    return () => {
      live = false;
    };
  }, [route.id]);
  useEffect(() => {
    if (!data || !host.current || data.carrier) return;
    const points = data.stops.filter((s) => s.lat != null && s.lng != null);
    const m = L.map(host.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(m);
    const bounds: any[] = [];
    if (data.origin) {
      L.circleMarker([data.origin.lat, data.origin.lng], {
        radius: 8,
        color: "#61735a",
      })
        .bindTooltip("Salida")
        .addTo(m);
      bounds.push([data.origin.lat, data.origin.lng]);
    }
    points.forEach((s, i) => {
      const p: any = [s.lat, s.lng];
      bounds.push(p);
      L.circleMarker(p, {
        radius: 10,
        color: s.status === "delivered" ? "#85917c" : "#143e2b",
        fillColor: "#e8bc36",
        fillOpacity: 1,
      })
        .bindTooltip(String(i + 1), {
          permanent: true,
          direction: "center",
          className: "route-number",
        })
        .addTo(m);
    });
    if (data.geometry)
      L.geoJSON(data.geometry, {
        style: { color: "#218147", weight: 5, opacity: 0.8 },
      }).addTo(m);
    if (bounds.length)
      m.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 16 });
    else m.setView([7.13, -73.12], 12);
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      m.remove();
    };
  }, [data]);
  return (
    <Modal
      title={`Recorrido completo · ${route.stops.length} paradas`}
      wide
      onClose={onClose}
    >
      {error && <Alert severity="error">{error}</Alert>}
      {!data && !error && <p>Cargando mapa del recorrido…</p>}
      {data?.carrier ? (
        <p>Envío por transportadora. No aplica mapa de reparto local.</p>
      ) : (
        data && (
          <>
            {data.missing && (
              <Alert severity="info">
                Falta ubicar alguna sucursal. Se muestran las paradas conocidas
                y la lista completa.
              </Alert>
            )}
            {data.warning && <Alert severity="info">{data.warning}</Alert>}
            <div
              className="complete-route-map"
              ref={host}
              role="region"
              aria-label="Mapa con todas las paradas del recorrido"
            />
            <ol className="route-map-stops">
              {data.stops.map((s, i) => (
                <li key={s.id}>
                  <div>
                    <strong>
                      {i + 1}. {s.client_name || "Entrega"}
                    </strong>
                    <span>
                      {s.address} · {s.city}
                    </span>
                  </div>
                  {s.status !== "delivered" && (
                    <IconButton
                      component="a"
                      href={
                        "https://www.google.com/maps/dir/?" +
                        new URLSearchParams({
                          api: "1",
                          destination:
                            s.lat != null
                              ? `${s.lat},${s.lng}`
                              : `${s.address}, ${s.city}, Colombia`,
                          travelmode: "driving",
                          dir_action: "navigate",
                        })
                      }
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Navegar a la parada ${i + 1}`}
                    >
                      <Navigation />
                    </IconButton>
                  )}
                </li>
              ))}
            </ol>
            <small>
              La línea corresponde al trazado vial disponible; la navegación de
              cada parada se abre en Google Maps. OSRM/FOSSGIS · ©
              OpenStreetMap.
            </small>
          </>
        )
      )}
    </Modal>
  );
}
