import { createHash } from "node:crypto";
import { pool } from "./db.js";
const waypoint = (p: any) => ({
  location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } },
});
function key() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || process.env.GOOGLE_ROUTES_ENABLED !== "true")
    throw Error("Google Routes pendiente de configurar y revisar sus cuotas");
  return key;
}
async function googleRequest(url: string, body: any, fields: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": fields,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw Error("No fue posible consultar la ruta de Google");
  return r.json();
}
export async function roadMatrix(points: any[]) {
  if (points.length < 2 || points.length > 6) throw Error("Recorrido inválido");
  const hash = createHash("sha256")
    .update("google-v1" + JSON.stringify(points.map((p) => [p.lat, p.lng])))
    .digest("hex");
  const old = (
    await pool.query(
      "SELECT durations FROM route_matrix_cache WHERE key=$1 AND expires_at>now()",
      [hash],
    )
  ).rows[0];
  if (old) return old.durations;
  const data: any = await googleRequest(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      origins: points.map((p) => ({ waypoint: waypoint(p) })),
      destinations: points.map((p) => ({ waypoint: waypoint(p) })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    },
    "originIndex,destinationIndex,duration,condition,status",
  );
  const matrix = parseRouteMatrix(data, points.length);
  await pool.query(
    "INSERT INTO route_matrix_cache(key,durations,expires_at) VALUES($1,$2,now()+interval '1 day') ON CONFLICT(key) DO UPDATE SET durations=excluded.durations,expires_at=excluded.expires_at",
    [hash, JSON.stringify(matrix)],
  );
  return matrix;
}
export async function roadGeometry(points: any[]) {
  if (points.length < 2 || points.length > 6) throw Error("Recorrido inválido");
  const hash = createHash("sha256")
    .update("google-v1" + JSON.stringify(points.map((p) => [p.lat, p.lng])))
    .digest("hex");
  const old = (
    await pool.query(
      "SELECT geometry FROM route_geometry_cache WHERE key=$1 AND expires_at>now()",
      [hash],
    )
  ).rows[0];
  if (old) return old.geometry;
  const data: any = await googleRequest(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      origin: waypoint(points[0]),
      destination: waypoint(points.at(-1)),
      intermediates: points.slice(1, -1).map(waypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      polylineEncoding: "GEO_JSON_LINESTRING",
    },
    "routes.polyline.geoJsonLinestring",
  );
  const geometry = data.routes?.[0]?.polyline?.geoJsonLinestring;
  if (
    geometry?.type !== "LineString" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2 ||
    geometry.coordinates.some(
      (p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite),
    )
  )
    throw Error("Trazado inválido");
  await pool.query(
    "INSERT INTO route_geometry_cache(key,geometry,expires_at) VALUES($1,$2,now()+interval '1 day') ON CONFLICT(key) DO UPDATE SET geometry=excluded.geometry,expires_at=excluded.expires_at",
    [hash, geometry],
  );
  return geometry;
}

export function parseRouteMatrix(data: any, size: number) {
  if (!Array.isArray(data)) throw Error("Matriz inválida");
  const seen = new Set<string>();
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  for (const cell of data) {
    const a = cell.originIndex ?? 0,
      b = cell.destinationIndex ?? 0;
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a >= size ||
      b >= size
    )
      throw Error("Matriz inválida");
    if (seen.has(a + ":" + b)) throw Error("Matriz duplicada");
    seen.add(a + ":" + b);
    if (
      cell.condition === "ROUTE_EXISTS" &&
      (!cell.status?.code || cell.status.code === 0)
    ) {
      const seconds = Number(String(cell.duration || "0s").replace(/s$/, ""));
      if (!Number.isFinite(seconds) || seconds < 0)
        throw Error("Matriz inválida");
      matrix[a][b] = seconds;
    }
  }
  if (seen.size !== size * size) throw Error("Matriz incompleta");

  return matrix;
}
