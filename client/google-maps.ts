import { useEffect, useState, type RefObject } from "react";
import { api } from "./offline";
let loading: Promise<any> | undefined;
export function loadGoogleMaps(): Promise<any> {
  if ((window as any).google?.maps?.importLibrary)
    return Promise.resolve((window as any).google.maps);
  if (loading) return loading;
  loading = (async () => {
    const localKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_BROWSER_KEY;
    const localReview = window.location.pathname.endsWith("/maps-preview.html");
    const key =
      localKey || (localReview ? null : (await api("/maps/config")).browserKey);
    if (!key)
      throw Error(
        "Google Maps está pendiente de configuración. Puedes conservar la dirección y abrirla en Ver mapa.",
      );
    return await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        script.remove();
        reject(Error("Google Maps no respondió. Intenta nuevamente."));
      }, 20000);
      (window as any).delipinaMapsReady = () => {
        clearTimeout(timer);
        resolve((window as any).google.maps);
        delete (window as any).delipinaMapsReady;
      };
      script.src =
        "https://maps.googleapis.com/maps/api/js?" +
        new URLSearchParams({
          key,
          loading: "async",
          v: "weekly",
          libraries: "maps,places,marker",
          language: "es",
          region: "CO",
          callback: "delipinaMapsReady",
        });
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(Error("No fue posible cargar Google Maps."));
      };
      document.head.appendChild(script);
    });
  })().catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
export function mapsSearchUrl(address: string, city = "") {
  return (
    "https://www.google.com/maps/search/?" +
    new URLSearchParams({
      api: "1",
      query: [address, city, "Colombia"].filter(Boolean).join(", "),
    })
  );
}

export function useMapVisible(host: RefObject<HTMLElement | null>) {
  const [visible, S] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    if (!("IntersectionObserver" in window)) {
      S(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        S(true);
        observer.disconnect();
      }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return visible;
}
