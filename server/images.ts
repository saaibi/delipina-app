import { fail } from "./db.js";
export function imagePayload(value: any) {
  if (typeof value !== "string") fail(400, "Selecciona una imagen");
  const data = Buffer.from(value, "base64");
  const png = data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    jpg = data[0] === 255 && data[1] === 216 && data[2] === 255,
    webp =
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP";
  if (data.length > 1500000 || (!png && !jpg && !webp))
    fail(400, "Usa PNG, JPG o WebP de hasta 1,5 MB");
  return { data, mime: png ? "image/png" : jpg ? "image/jpeg" : "image/webp" };
}
