import React, { useState, useEffect, useRef } from "react";
import { api } from "./offline";
export function GPS({ active, onError }) {
  const [sharing, S] = useState(false),
    watch = useRef(null),
    last = useRef(0);
  const stop = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    S(false);
    api("/location", { method: "DELETE" }).catch(() => {});
  };
  useEffect(() => {
    if (!active && watch.current !== null) stop();
    return () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    };
  }, [active]);
  return (
    <button
      className="neutral"
      disabled={!active && !sharing}
      onClick={() => {
        if (sharing) return stop();
        if (!navigator.geolocation) return onError("GPS no disponible");
        watch.current = navigator.geolocation.watchPosition(
          (pos) => {
            if (Date.now() - last.current < 15000) return;
            last.current = Date.now();
            api("/location", {
              method: "POST",
              body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            }).catch((e) => onError(e.message));
          },
          (e) => {
            onError("No se pudo obtener la ubicación: " + e.message);
            stop();
          },
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
        );
        S(true);
      }}
    >
      {sharing
        ? "Dejar de compartir ubicación"
        : "Compartir ubicación en reparto"}
    </button>
  );
}
export function Tracking({ orderId }) {
  const [data, S] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api("/orders/" + orderId + "/tracking")
        .then((d) => live && S(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [orderId]);
  return (
    <section>
      <h3>Seguimiento de tu entrega</h3>
      {!data ? (
        <p>Consultando ubicación…</p>
      ) : !data.active ? (
        <p>El seguimiento terminó o el recorrido aún no comienza.</p>
      ) : (
        <>
          <p>
            {data.signalLost
              ? "Señal perdida o ubicación no disponible"
              : "Ubicación aproximada disponible"}
          </p>
          {data.location && (
            <>
              <p>
                Última actualización:{" "}
                {new Date(data.location.updated_at).toLocaleTimeString("es-CO")}
              </p>
              <a
                className="button"
                rel="noreferrer"
                target="_blank"
                href={`https://www.google.com/maps/search/?api=1&query=${data.location.lat},${data.location.lng}`}
              >
                Ver zona aproximada ↗
              </a>
            </>
          )}
          <p>
            ETA pendiente de conectar Google Routes. Tu rango de entrega
            permanece visible en el pedido.
          </p>
        </>
      )}
    </section>
  );
}
