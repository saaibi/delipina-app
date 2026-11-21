import { mapsUrl, routeOrigin } from "../shared/routes";
import React, { useState, useEffect, useRef } from "react";
import { GoogleMapCanvas } from "./google-map-canvas";
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
            <GoogleMapCanvas
              points={[
                ...(data.origin
                  ? [
                      {
                        ...data.origin,
                        label: "S",
                        title: "Salida del reparto",
                      },
                    ]
                  : []),
                ...data.stops.map((s, i) => ({
                  ...s,
                  label: String(i + 1),
                  title: s.client_name,
                })),
              ]}
              geometry={data.geometry}
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
                      href={mapsUrl(
                        [s],
                        routeOrigin({ originLocation: data.origin }),
                      )}
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
              cada parada se abre en la aplicación de mapas.
            </small>
          </>
        )
      )}
    </Modal>
  );
}
