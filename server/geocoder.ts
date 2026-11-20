import { pool, fail } from "./db.js";
let queue = Promise.resolve(),
  last = 0;
export async function geocode(
  q: string,
  base = process.env.GEOCODER_URL || "https://photon.komoot.io/api/",
  cache = true,
) {
  const task = queue.then(async () => {
    if (cache) {
      const old = (
        await pool.query(
          "SELECT data FROM geocode_cache WHERE query=$1 AND expires_at>now()",
          [q],
        )
      ).rows[0];
      if (old) return old.data;
    }
    await new Promise((r) =>
      setTimeout(r, Math.max(0, 1100 - (Date.now() - last))),
    );
    last = Date.now();
    const url = new URL(base);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycode", "CO");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Delipina/1.0 (https://delipina-app-z9br.onrender.com)",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok)
      fail(
        503,
        "La búsqueda no está disponible; selecciona el punto en el mapa",
      );
    const data: any = await response.json();
    if (!Array.isArray(data.features))
      fail(503, "Respuesta de ubicación inválida");
    const results = data.features
      .filter(
        (f) =>
          f.geometry?.type === "Point" &&
          f.geometry.coordinates?.length === 2 &&
          f.geometry.coordinates.every(Number.isFinite) &&
          Math.abs(f.geometry.coordinates[0]) <= 180 &&
          Math.abs(f.geometry.coordinates[1]) <= 90,
      )
      .map((f) => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        label: [
          f.properties.name,
          f.properties.street,
          f.properties.housenumber,
          f.properties.city || f.properties.town,
          f.properties.state,
        ]
          .filter(Boolean)
          .join(", "),
      }))
      .slice(0, 5);
    if (cache) {
      await pool.query("DELETE FROM geocode_cache WHERE expires_at<now()");
      await pool.query(
        "INSERT INTO geocode_cache(query,data,expires_at) VALUES($1,$2,now()+interval '7 days') ON CONFLICT(query) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at",
        [q, JSON.stringify(results)],
      );
    }
    return results;
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
