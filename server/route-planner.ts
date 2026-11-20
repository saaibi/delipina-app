export type Stop = {
  id: string;
  lat?: number;
  lng?: number;
  city: string;
  [key: string]: any;
};
export const located = (p: any) =>
  !!p &&
  p.lat !== null &&
  p.lng !== null &&
  Number.isFinite(Number(p.lat)) &&
  Number.isFinite(Number(p.lng)) &&
  Math.abs(Number(p.lat)) <= 90 &&
  Math.abs(Number(p.lng)) <= 180;
export function distance(a: any, b: any) {
  const r = Math.PI / 180,
    x = (Number(b.lat) - Number(a.lat)) * r,
    y = (Number(b.lng) - Number(a.lng)) * r;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(x / 2) ** 2 +
            Math.cos(Number(a.lat) * r) *
              Math.cos(Number(b.lat) * r) *
              Math.sin(y / 2) ** 2,
        ),
      ),
    )
  );
}
export function distanceMatrix(origin: any, stops: Stop[]) {
  const p = [origin, ...stops];
  return p.map((a) => p.map((b) => distance(a, b)));
}
/** Exhaustive open path, fixed origin. Up to 5 stops => at most 120 alternatives. */
export function bestOrder(stops: Stop[], costs: (number | null)[][]) {
  let best: number[] = [],
    score = Infinity;
  function visit(path: number[], left: number[], sum: number) {
    if (sum >= score) return;
    if (!left.length) {
      score = sum;
      best = path;
      return;
    }
    const from = path.length ? path[path.length - 1] + 1 : 0;
    for (const i of left) {
      const cost = costs[from]?.[i + 1];
      if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0)
        visit(
          [...path, i],
          left.filter((j) => j !== i),
          sum + cost,
        );
    }
  }
  visit(
    [],
    stops.map((_, i) => i),
    0,
  );
  return Number.isFinite(score)
    ? { stops: best.map((i) => stops[i]), cost: score }
    : null;
}
const metro = (city: string) =>
  ["bucaramanga", "floridablanca", "giron", "piedecuesta"].includes(
    city
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase(),
  );
export function groupStops(stops: Stop[], origin: any) {
  const buckets = new Map<string, Stop[]>();
  for (const s of [...stops].sort((a, b) => a.id.localeCompare(b.id))) {
    const zone = located(s)
      ? metro(s.city)
        ? "metro"
        : s.city.toLowerCase()
      : "missing:" + s.city.toLowerCase();
    buckets.set(zone, [...(buckets.get(zone) || []), s]);
  }
  const groups: Stop[][] = [];
  for (const list of buckets.values()) {
    let left = [...list];
    while (left.length) {
      const seed =
        located(left[0]) && located(origin)
          ? left.reduce((a, b) =>
              distance(origin, a) > distance(origin, b) ? a : b,
            )
          : left[0];
      const ordered = located(seed)
        ? [...left].sort(
            (a, b) =>
              distance(seed, a) - distance(seed, b) || a.id.localeCompare(b.id),
          )
        : left;
      const batch = ordered.slice(0, 5);
      groups.push(batch);
      const used = new Set(batch.map((s) => s.id));
      left = left.filter((s) => !used.has(s.id));
    }
  }
  return groups;
}
