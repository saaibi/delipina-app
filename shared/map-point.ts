export function parseMapPoint(value: string) {
  const parts = value.trim().split(/\s*,\s*/);
  if (
    parts.length !== 2 ||
    parts.some((p) => !p || !/^[+-]?\d+(?:\.\d+)?$/.test(p))
  )
    return null;
  const [lat, lng] = parts.map(Number);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
