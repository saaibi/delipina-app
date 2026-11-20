import { fail } from "./db.js";
export function coordinates(lat: any, lng: any) {
  if (
    (lat === undefined || lat === null || lat === "") &&
    (lng === undefined || lng === null || lng === "")
  )
    return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  if (
    lat === null ||
    lng === null ||
    lat === "" ||
    lng === "" ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180
  )
    fail(400, "Indica latitud y longitud válidas");
  return point;
}
