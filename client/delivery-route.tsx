import React, { useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { Button } from "./ui";
import { routeLinks } from "../shared/routes";
export function DeliveryRoute({ orders, user, origin }: any) {
  const [open, O] = useState(false),
    [ids, S] = useState<string[]>([]);
  const available = orders.filter(
    (o) => o.courier_id === user.id && ["ready", "enroute"].includes(o.status),
  );
  const stops = ids
    .map((id) => available.find((o) => o.id === id))
    .filter(Boolean);
  function move(i: number, delta: number) {
    const next = stops.map((o) => o.id),
      j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    S(next);
  }
  return (
    <section className="panel route-planner">
      <Button onClick={() => O(!open)}>
        {open ? "Cerrar recorrido" : "Armar recorrido de mis entregas"}
      </Button>
      {open && (
        <>
          <p>
            Selecciona pedidos asignados listos o en camino y ordena las
            paradas. Cada tramo abre hasta cuatro destinos en Google Maps. El
            orden es manual.
          </p>
          {!available.length && (
            <p>Todavía no tienes entregas listas asignadas.</p>
          )}
          {available.map((o) => (
            <FormControlLabel
              key={o.id}
              control={
                <Checkbox
                  checked={ids.includes(o.id)}
                  onChange={(_, v) =>
                    S(v ? [...ids, o.id] : ids.filter((id) => id !== o.id))
                  }
                />
              }
              label={`#${o.id.slice(0, 6)} · ${o.address} · ${o.city}`}
            />
          ))}
          {stops.length > 0 && (
            <>
              <h3>Orden del recorrido</h3>
              <ol>
                {stops.map((o, i) => (
                  <li key={o.id}>
                    {o.address} · {o.city}{" "}
                    <button
                      type="button"
                      className="neutral"
                      disabled={!i}
                      aria-label={`Subir parada ${i + 1}`}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>{" "}
                    <button
                      type="button"
                      className="neutral"
                      disabled={i === stops.length - 1}
                      aria-label={`Bajar parada ${i + 1}`}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
              {routeLinks(origin, stops).map((r, i) => (
                <a
                  key={i}
                  className="button"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir tramo {i + 1} · {r.count} paradas ↗
                </a>
              ))}
              <p>
                Las direcciones seleccionadas se comparten con Google al abrir
                el tramo. Revisa el destino antes de iniciar la navegación.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
