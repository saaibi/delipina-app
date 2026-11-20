/** Maps URLs: at most three intermediate waypoints for mobile browser support. */
export function routeLinks(
  origin: string,
  stops: { address: string; city: string; lat?: number; lng?: number }[],
) {
  const address = (o: any) =>
    o.lat != null &&
    o.lng != null &&
    Number.isFinite(Number(o.lat)) &&
    Number.isFinite(Number(o.lng))
      ? `${o.lat},${o.lng}`
      : `${o.address.replace(/^\[DEMO\]\s*/, "")}, ${o.city}, Colombia`;
  const result: { url: string; count: number }[] = [];
  for (let i = 0; i < stops.length; i += 4) {
    const chunk = stops.slice(i, i + 4),
      params = new URLSearchParams({
        api: "1",
        origin: i ? address(stops[i - 1]) : origin,
        destination: address(chunk[chunk.length - 1]),
        travelmode: "driving",
      });
    if (chunk.length > 1)
      params.set("waypoints", chunk.slice(0, -1).map(address).join("|"));
    result.push({
      url: "https://www.google.com/maps/dir/?" + params,
      count: chunk.length,
    });
  }
  return result;
}

export function localDelivery(city: string) {
  return ["bucaramanga", "piedecuesta", "giron", "floridablanca"].includes(
    (city || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase(),
  );
}
export function mapsUrl(stops: any[], origin?: string) {
  if (!stops.length) return "";
  const place = (o: any) =>
    o.lat != null &&
    o.lng != null &&
    Number.isFinite(Number(o.lat)) &&
    Number.isFinite(Number(o.lng))
      ? `${o.lat},${o.lng}`
      : `${(o.address || "").replace(/^\[DEMO\]\s*/, "")}, ${o.city}, Colombia`;
  const p = new URLSearchParams({
    api: "1",
    destination: place(stops.at(-1)),
    travelmode: "driving",
  });
  if (origin) p.set("origin", origin);
  if (stops.length > 1)
    p.set("waypoints", stops.slice(0, -1).map(place).join("|"));
  return "https://www.google.com/maps/dir/?" + p;
}
