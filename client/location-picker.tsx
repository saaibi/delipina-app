import React, { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import Alert from "@mui/material/Alert";
import { Button } from "./ui";
import { numberedAddress } from "../server/address-query";
import { api } from "./offline";
export function LocationPicker({ address, city, point, onChange }: any) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    marker = useRef<any>(null),
    callback = useRef(onChange),
    version = useRef(0),
    [results, R] = useState([]),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  callback.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { scrollWheelZoom: false }).setView(
      [point?.lat ?? 7.13488, point?.lng ?? -73.12438],
      point ? 16 : 12,
    );
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on("click", (e) => {
      version.current++;
      B(false);
      R([]);
      E("");
      callback.current({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    });
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    if (!point) {
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      return;
    }
    if (marker.current) marker.current.remove();
    marker.current = L.circleMarker([point.lat, point.lng], {
      radius: 9,
      color: "#143e2b",
      fillColor: "#e8bc36",
      fillOpacity: 1,
    }).addTo(map.current);
    map.current.setView([point.lat, point.lng], 16);
  }, [point?.lat, point?.lng]);
  async function search(requestVersion: number) {
    B(true);
    E("");
    R([]);
    try {
      const found = await api(
        "/geocode?q=" +
          encodeURIComponent(address + ", " + city + ", Colombia") +
          "&city=" +
          encodeURIComponent(city),
      );
      if (requestVersion !== version.current) return;
      R(
        found.filter(
          (r, i, rows) => rows.findIndex((x) => x.label === r.label) === i,
        ),
      );
      if (!found.length)
        E(
          "No se encontró esa dirección. Marca el punto directamente en el mapa.",
        );
      else if (numberedAddress(address) && !found.some((r) => r.numberMatch))
        E(
          "No encontramos esa numeración exacta. Estas opciones son aproximadas: confirma el punto de entrega en el mapa.",
        );
    } catch (e) {
      if (requestVersion === version.current) E(e.message);
    } finally {
      if (requestVersion === version.current) B(false);
    }
  }
  useEffect(() => {
    const id = ++version.current;
    R([]);
    E("");
    B(false);
    if (!city.trim() || !numberedAddress(address) || point) return;
    const timer = setTimeout(() => {
      if (id === version.current) search(id);
    }, 1200);
    return () => clearTimeout(timer);
  }, [address, city]);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  return (
    <section className="address-picker">
      {error && <Alert severity="info">{error}</Alert>}
      <Button
        className="neutral"
        disabled={busy || !address || !city}
        onClick={() => {
          const id = ++version.current;
          search(id);
        }}
      >
        {busy ? "Buscando…" : "Buscar dirección en el mapa"}
      </Button>
      <small className="address-search-hint">
        Escribe la dirección completa, por ejemplo Calle 45 #18-32. Buscaremos
        al terminar la numeración; también puedes buscar manualmente.
      </small>
      <div className="address-results">
        {results.map((r: any, i) => (
          <Button
            key={i}
            className="neutral"
            onClick={() => {
              version.current++;
              B(false);
              E("");
              onChange({ lat: r.lat, lng: r.lng });
              R([]);
            }}
          >
            {r.label} ·{" "}
            {r.precision === "number"
              ? "Numeración coincidente"
              : "Ubicación aproximada"}
          </Button>
        ))}
      </div>
      <div
        ref={host}
        className="branch-map"
        role="region"
        aria-label="Mapa para seleccionar el punto de entrega"
      />
      <small>
        {point
          ? `Ubicación seleccionada: ${point.lat}, ${point.lng}`
          : "Haz clic o toca el punto de entrega en el mapa."}{" "}
        Búsqueda Photon · datos OpenStreetMap. Al buscar se comparte la
        dirección con el proveedor.
      </small>
    </section>
  );
}
