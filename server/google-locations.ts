import { pool } from "./db.js";
import { coordinates } from "./coordinates.js";
export function locationMetadata(body: any, point: any) {
  const google =
    point && (body.locationSource === "google" || body.source === "google");
  return {
    source: point ? (google ? "google" : "manual") : null,
    placeId:
      google &&
      typeof body.placeId === "string" &&
      /^[A-Za-z0-9_-]{1,255}$/.test(body.placeId)
        ? body.placeId
        : null,
    expires: google
      ? new Date(
          Math.min(
            Date.now() + 29 * 86400000,
            Number.isFinite(Date.parse(body.expiresAt))
              ? Date.parse(body.expiresAt)
              : Infinity,
          ),
        ).toISOString()
      : null,
  };
}
let pending: Promise<void> | undefined,
  last = 0;
export async function maintainGoogleLocations(force = false) {
  if (pending) return pending;
  if (!force && Date.now() - last < 60000) return;
  pending = (async () => {
    await pool.query(
      "UPDATE delivery_runs r SET snapshot=jsonb_set(snapshot,'{stops}',(SELECT COALESCE(jsonb_agg(s-'lat'-'lng'),'[]'::jsonb) FROM jsonb_array_elements(snapshot->'stops') s)) WHERE jsonb_typeof(snapshot->'stops')='array' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=ANY(r.order_ids) AND o.delivery_location_expires_at<=now())",
    );
    await pool.query(
      "UPDATE orders SET delivery_lat=NULL,delivery_lng=NULL,delivery_location_expires_at=NULL WHERE delivery_location_expires_at<=now()",
    );
    await pool.query(
      "UPDATE branches SET lat=NULL,lng=NULL WHERE location_source='google' AND location_expires_at<=now()",
    );
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0]?.data;
    if (
      cfg?.originLocation?.expiresAt &&
      +new Date(cfg.originLocation.expiresAt) <= Date.now()
    )
      await pool.query(
        "UPDATE settings SET data=jsonb_set(data,'{originLocation}',(data->'originLocation') || '{\"lat\":null,\"lng\":null}'::jsonb) WHERE id=1",
      );
    await pool.query("DELETE FROM route_matrix_cache WHERE expires_at<=now()");
    await pool.query(
      "DELETE FROM route_geometry_cache WHERE expires_at<=now()",
    );
    last = Date.now();
    void renewLocations().catch(() => {});
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

let renewing = false;
const retryAfter = new Map<string, number>();
async function renewLocations() {
  if (
    renewing ||
    !process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.DISABLE_AUTOMATIC_JOBS === "true"
  )
    return;
  renewing = true;
  try {
    const branches = (
      await pool.query(
        "SELECT id,location_place_id place_id FROM branches WHERE location_source='google' AND location_expires_at<=now() AND location_place_id IS NOT NULL AND deleted_at IS NULL ORDER BY location_expires_at LIMIT 4",
      )
    ).rows;
    const cfg = (await pool.query("SELECT data FROM settings WHERE id=1"))
      .rows[0]?.data;
    const origin = cfg?.originLocation;
    const jobs = [
      ...branches.map((b) => ({ ...b, origin: false })),
      ...(origin?.placeId &&
      origin?.expiresAt &&
      +new Date(origin.expiresAt) <= Date.now()
        ? [{ id: "origin", place_id: origin.placeId, origin: true }]
        : []),
    ];
    for (const row of jobs) {
      if ((retryAfter.get(row.place_id) || 0) > Date.now()) continue;
      try {
        const response = await fetch(
          "https://places.googleapis.com/v1/places/" +
            encodeURIComponent(row.place_id),
          {
            headers: {
              "X-Goog-Api-Key": process.env.GOOGLE_MAPS_SERVER_KEY!,
              "X-Goog-FieldMask": "location",
            },
            signal: AbortSignal.timeout(7000),
          },
        );
        if (!response.ok) throw Error("Ubicación pendiente");
        const data: any = await response.json();
        const point = coordinates(
          data.location?.latitude,
          data.location?.longitude,
        );
        if (!point) throw Error("Sin ubicación");
        if (row.origin)
          await pool.query(
            "UPDATE settings SET data=jsonb_set(data,'{originLocation}',$1::jsonb) WHERE id=1 AND data->'originLocation'->>'placeId'=$2",
            [
              JSON.stringify({
                ...point,
                source: "google",
                placeId: row.place_id,
                expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
              }),
              row.place_id,
            ],
          );
        else
          await pool.query(
            "UPDATE branches SET lat=$1,lng=$2,location_expires_at=now()+interval '29 days' WHERE id=$3 AND location_place_id=$4",
            [point.lat, point.lng, row.id, row.place_id],
          );
        retryAfter.delete(row.place_id);
      } catch {
        retryAfter.set(row.place_id, Date.now() + 86400000);
      }
    }
  } finally {
    renewing = false;
  }
}
