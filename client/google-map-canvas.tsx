import React, { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import { loadGoogleMaps, useMapVisible } from "./google-maps";
export function GoogleMapCanvas({
  points,
  geometry,
  className = "complete-route-map",
  label = "Mapa Google del recorrido",
}: any) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    library = useRef<any>(null),
    [ready, R] = useState(false),
    [error, E] = useState("");
  const visible = useMapVisible(host);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadGoogleMaps()
      .then(async (g) => {
        const { Map } = await g.importLibrary("maps"),
          marker = await g.importLibrary("marker");
        if (!live || !host.current) return;
        library.current = { g, ...marker };
        map.current = new Map(host.current, {
          center: { lat: 7.119, lng: -73.123 },
          zoom: 12,
          mapId: "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: false,
        });
        R(true);
      })
      .catch((e) => live && E(e.message));
    return () => {
      live = false;
      map.current = null;
    };
  }, [visible]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const { g, AdvancedMarkerElement, PinElement } = library.current,
      m = map.current,
      bounds = new g.LatLngBounds(),
      known = points.filter((p) => p.lat != null && p.lng != null);
    const markers: any[] = [];
    known.forEach((p, i) => {
      const position = { lat: Number(p.lat), lng: Number(p.lng) };
      bounds.extend(position);
      const pin = new PinElement({
        glyphText: p.label || String(i + 1),
        background: "#e8bc36",
        borderColor: "#143e2b",
        glyphColor: "#143e2b",
      });
      markers.push(
        new AdvancedMarkerElement({
          map: m,
          position,
          title: p.title || p.label || "Entrega",
          content: pin,
        }),
      );
    });
    const line =
      geometry?.type === "LineString"
        ? new g.Polyline({
            map: m,
            path: geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
            strokeColor: "#218147",
            strokeWeight: 5,
          })
        : null;
    if (known.length === 1) {
      m.setCenter({ lat: Number(known[0].lat), lng: Number(known[0].lng) });
      m.setZoom(16);
    } else if (known.length) m.fitBounds(bounds, 32);
    return () => {
      markers.forEach((m) => (m.map = null));
      line?.setMap(null);
    };
  }, [ready, JSON.stringify(points), JSON.stringify(geometry)]);
  return (
    <>
      {error && <Alert severity="info">{error}</Alert>}
      <div ref={host} className={className} role="region" aria-label={label} />
    </>
  );
}
