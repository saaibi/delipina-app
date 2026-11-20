import { createHash } from "node:crypto";
import { pool } from "./db.js";
let queue = Promise.resolve(),
  last = 0;
/** Free public OSRM/FOSSGIS, one process/instance; serialized <=1 request/sec, cached for a day. */
export async function roadMatrix(
  points: any[],
  base = process.env.OSRM_BASE_URL ||
    "https://routing.openstreetmap.de/routed-car",
  useCache = true,
) {
  const coordinates = points
    .map((p) => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`)
    .join(";");
  const key = createHash("sha256")
    .update(base + coordinates)
    .digest("hex");
  const task = queue.then(async () => {
    if (useCache) {
      const cached = (
        await pool.query(
          "SELECT durations FROM route_matrix_cache WHERE key=$1 AND expires_at>now()",
          [key],
        )
      ).rows[0];
      if (cached) return cached.durations;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 1100 - (Date.now() - last))),
    );
    last = Date.now();
    const response = await fetch(
      `${base}/table/v1/driving/${coordinates}?annotations=duration&radiuses=${points.map(() => 200).join(";")}`,
      {
        headers: {
          "User-Agent": "Delipina/1.0 (https://delipina-app-z9br.onrender.com)",
        },
        signal: AbortSignal.timeout(7000),
      },
    );
    if (!response.ok) throw Error("Servicio de rutas no disponible");
    const data: any = await response.json();
    if (
      data.code !== "Ok" ||
      !Array.isArray(data.durations) ||
      data.durations.length !== points.length ||
      data.durations.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== points.length ||
          row.some((v) => v !== null && (!Number.isFinite(v) || v < 0)),
      )
    )
      throw Error("Matriz de rutas inválida");
    if (useCache)
      await pool.query("DELETE FROM route_matrix_cache WHERE expires_at<now()");
    if (useCache)
      await pool.query(
        "INSERT INTO route_matrix_cache(key,durations,expires_at) VALUES($1,$2,now()+interval '1 day') ON CONFLICT(key) DO UPDATE SET durations=excluded.durations,expires_at=excluded.expires_at",
        [key, JSON.stringify(data.durations)],
      );
    return data.durations;
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
