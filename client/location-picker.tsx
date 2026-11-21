import React, { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import { Button } from "./ui";
import { loadGoogleMaps, mapsSearchUrl, useMapVisible } from "./google-maps";
export function LocationPicker({ address, city, point, onChange }: any) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    marker = useRef<any>(null),
    callback = useRef(onChange),
    version = useRef(0),
    session = useRef<any>(null);
  const [results, R] = useState<any[]>([]),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const visible = useMapVisible(host);
  callback.current = onChange;
  useEffect(() => {
    if (!visible) return;
    let live = true;
    const id = ++version.current;
    loadGoogleMaps()
      .then(async (g) => {
        const { Map } = await g.importLibrary("maps");
        if (!live || !host.current) return;
        const m = new Map(host.current, {
          center: { lat: point?.lat ?? 7.119, lng: point?.lng ?? -73.123 },
          zoom: point ? 17 : 12,
          mapId: "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        map.current = m;
        m.addListener("click", (e) => {
          if (!e.latLng) return;
          ++version.current;
          R([]);
          B(false);
          E("");
          callback.current({
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
            source: "google",
          });
        });
        if (point) {
          const { AdvancedMarkerElement } = await g.importLibrary("marker");
          if (live)
            marker.current = new AdvancedMarkerElement({
              map: m,
              position: point,
            });
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
      ++version.current;
      if (marker.current) marker.current.map = null;
      map.current = null;
    };
  }, [visible]);
  useEffect(() => {
    let live = true;
    if (marker.current) {
      marker.current.map = null;
      marker.current = null;
    }
    if (point)
      loadGoogleMaps()
        .then(async (g) => {
          const { AdvancedMarkerElement } = await g.importLibrary("marker");
          if (!live || !map.current) return;
          marker.current = new AdvancedMarkerElement({
            map: map.current,
            position: { lat: Number(point.lat), lng: Number(point.lng) },
          });
          map.current.setCenter({
            lat: Number(point.lat),
            lng: Number(point.lng),
          });
          map.current.setZoom(17);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [point?.lat, point?.lng]);
  useEffect(() => {
    ++version.current;
    R([]);
    B(false);
    session.current = null;
  }, [address, city]);
  async function search() {
    const id = ++version.current;
    B(true);
    E("");
    R([]);
    try {
      const g = await loadGoogleMaps(),
        lib = await g.importLibrary("places");
      session.current = new lib.AutocompleteSessionToken();
      const { suggestions } =
        await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: [address, city, "Colombia"].filter(Boolean).join(", "),
          includedRegionCodes: ["co"],
          language: "es",
          region: "co",
          sessionToken: session.current,
        });
      if (id !== version.current) return;
      R(suggestions.filter((s) => s.placePrediction));
      if (!suggestions.length)
        E(
          "Google no encontró coincidencias. Revisa la ciudad y la numeración o marca el punto en el mapa.",
        );
    } catch (e) {
      if (id === version.current) E(e.message);
    } finally {
      if (id === version.current) B(false);
    }
  }
  async function select(s: any) {
    const id = ++version.current;
    B(true);
    E("");
    try {
      const place = s.placePrediction.toPlace();
      await place.fetchFields({ fields: ["id", "location"] });
      if (id !== version.current) return;
      if (!place.location)
        throw Error("Este resultado no tiene un punto disponible.");
      onChange({
        lat: place.location.lat(),
        lng: place.location.lng(),
        placeId: place.id,
        source: "google",
      });
      R([]);
      session.current = null;
    } catch (e) {
      if (id === version.current) E(e.message);
    } finally {
      if (id === version.current) B(false);
    }
  }
  return (
    <section className="address-picker">
      {error && <Alert severity="info">{error}</Alert>}
      <div className="actions">
        <Button
          className="neutral"
          disabled={busy || !address?.trim() || !city?.trim()}
          onClick={search}
        >
          {busy ? "Buscando…" : "Buscar con Google"}
        </Button>
        {address && (
          <Button
            className="neutral"
            component="a"
            href={mapsSearchUrl(address, city)}
            target="_blank"
            rel="noreferrer"
          >
            Ver mapa
          </Button>
        )}
      </div>
      <small>
        Escribe ciudad y dirección completa; luego busca y confirma el resultado
        o toca el punto de entrega.
      </small>
      <div className="address-results">
        {results.map((s, i) => (
          <Button
            key={i}
            className="neutral"
            disabled={busy}
            onClick={() => select(s)}
          >
            {s.placePrediction.text.toString()}
          </Button>
        ))}
      </div>
      {results.length > 0 && <small>Google Maps</small>}
      <div
        ref={host}
        className="branch-map"
        role="region"
        aria-label="Mapa Google para seleccionar el punto de entrega"
      />
      <small>
        {point
          ? "Punto de entrega seleccionado."
          : "Selecciona el punto en Google Maps."}{" "}
        Al buscar se comparte la dirección con Google.
      </small>
    </section>
  );
}
