export async function attachment(file: File) {
  if (!file || !file.type.startsWith("image/"))
    throw Error("Selecciona una foto");
  const bmp = await createImageBitmap(file),
    ratio = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)),
    c = document.createElement("canvas");
  c.width = Math.round(bmp.width * ratio);
  c.height = Math.round(bmp.height * ratio);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const data = c.toDataURL("image/webp", 0.85).split(",")[1];
  if (data.length > 2000000) throw Error("Foto demasiado grande");
  return data;
}
