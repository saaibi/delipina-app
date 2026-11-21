import { GoogleMapCanvas } from "./google-map-canvas";
import React, { useState, useEffect, useRef } from "react";
import { api } from "./offline";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import LocationOnOutlined from "@mui/icons-material/LocationOnOutlined";
export function GPS({ active, onError }) {
  const [state, S] = useState("idle"),
    [retry, R] = useState(0);
  const report = useRef(onError);
  report.current = onError;
  useEffect(() => {
    if (!active) {
      S("idle");
      return;
    }
    let cancelled = false,
      nativeWatch: string | null = null,
      browserWatch: number | null = null,
      last = 0,
      failed = false;
    const clearWatch = () => {
      if (nativeWatch !== null) {
        void Geolocation.clearWatch({ id: nativeWatch }).catch(() => {});
        nativeWatch = null;
      }
      if (browserWatch !== null) {
        navigator.geolocation.clearWatch(browserWatch);
        browserWatch = null;
      }
    };
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      clearWatch();
      S("blocked");
      report.current(
        "No se pudo compartir la ubicación. Revisa el permiso de ubicación y el GPS del celular.",
      );
      void api("/location", { method: "DELETE" }).catch(() => {});
    };
    const position = (pos: any, error?: any) => {
      if (cancelled || failed) return;
      if (error || !pos) {
        fail();
        return;
      }
      S("sharing");
      if (Date.now() - last < 15000) return;
      last = Date.now();
      void api("/location", {
        method: "POST",
        body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      }).catch((e) => {
        if (!cancelled) report.current(e.message);
      });
    };
    S("starting");
    const start = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          let permission = await Geolocation.checkPermissions();
          if (
            permission.coarseLocation !== "granted" &&
            permission.location !== "granted"
          )
            permission = await Geolocation.requestPermissions({
              permissions: ["coarseLocation"],
            });
          if (cancelled) return;
          if (
            permission.coarseLocation !== "granted" &&
            permission.location !== "granted"
          ) {
            fail();
            return;
          }
          const id = await Geolocation.watchPosition(
            { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
            position,
          );
          nativeWatch = id;
          if (cancelled || failed) clearWatch();
        } else {
          if (!navigator.geolocation) {
            fail();
            return;
          }
          browserWatch = navigator.geolocation.watchPosition(position, fail, {
            enableHighAccuracy: false,
            maximumAge: 30000,
            timeout: 20000,
          });
        }
      } catch {
        fail();
      }
    };
    void start();
    return () => {
      cancelled = true;
      clearWatch();
      void api("/location", { method: "DELETE" }).catch(() => {});
    };
  }, [active, retry]);
  if (!active) return null;
  if (state === "blocked")
    return (
      <Alert
        severity="warning"
        action={<button onClick={() => R((n) => n + 1)}>Reintentar</button>}
      >
        Activa la ubicación para el seguimiento del reparto.
      </Alert>
    );
  return (
    <Chip
      size="small"
      icon={<LocationOnOutlined />}
      color={state === "sharing" ? "success" : "default"}
      label={
        state === "sharing"
          ? "Ubicación compartida en reparto"
          : "Obteniendo ubicación…"
      }
    />
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
              <GoogleMapCanvas
                points={[
                  {
                    ...data.location,
                    label: "M",
                    title: "Ubicación del mensajero",
                  },
                ]}
                className="tracking-map"
                label="Ubicación del mensajero en Google Maps"
              />
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
            El mapa se actualiza aproximadamente cada 30 segundos mientras el
            mensajero comparte GPS. En segundo plano el teléfono puede
            suspenderlo. Tu rango de entrega permanece visible en el pedido.
          </p>
        </>
      )}
    </section>
  );
}
