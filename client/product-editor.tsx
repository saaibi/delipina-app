import React, { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { Button, Field, Select } from "./ui";
import { api } from "./offline";
import { productImages, ProductPhoto } from "./products";
async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) throw Error("Selecciona una imagen");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/webp", 0.85);
  if (data.length > 2000000)
    throw Error("La imagen todavía es demasiado grande");
  return data;
}
export function ProductEditor({ product, onSaved }: any) {
  const [image, I] = useState<string | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const id = useRef(product?.id);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        E("");
        B(true);
        const b = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const payload = {
            ...b,
            price: Math.round(Number(b.price) * 100),
            active: b.active === "on",
          };
          const saved = await api(
            id.current ? "/products/" + id.current : "/products",
            { method: id.current ? "PATCH" : "POST", body: payload },
          );
          id.current = saved.id;
          if (image)
            await api("/products/" + id.current + "/photo", {
              method: "POST",
              body: { data: image.split(",")[1] },
            });
          await onSaved();
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Field name="name" label="Producto" defaultValue={product?.name || ""} />
      <Field
        name="presentation"
        label="Presentación"
        placeholder="Ej. panela 500 g, azúcar 1 kg o salsa 250 ml"
        defaultValue={product?.presentation || ""}
      />
      <Select
        name="unit"
        label="Unidad de venta"
        defaultValue={product?.unit || "pack"}
      >
        <option value="pack">Unidades / empaques (enteros)</option>
        <option value="kg">Kilogramos</option>
        <option value="lb">Libras</option>
        <option value="arroba">Arrobas (25 libras)</option>
      </Select>
      <Field
        name="price"
        label="Precio de esta unidad / presentación (COP)"
        type="number"
        min="0"
        defaultValue={product ? Number(product.price) / 100 : ""}
      />
      <Field
        type="file"
        required={false}
        label="Imagen del producto"
        accept="image/*"
        onChange={async (e) => {
          try {
            if (e.target.files?.[0]) I(await compressImage(e.target.files[0]));
          } catch (err) {
            E(err.message);
          }
        }}
      />
      {image ? (
        <img
          className="upload-preview"
          src={image}
          alt="Vista previa de la imagen"
        />
      ) : product?.has_image ? (
        <ProductPhoto product={product} small />
      ) : null}
      <Select
        name="image_key"
        label="O usar una presentación de referencia"
        defaultValue={product?.image_key || ""}
      >
        <option value="">Imagen propia o logo general</option>
        {productImages.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <FormControlLabel
        control={
          <Switch name="active" defaultChecked={product?.active !== false} />
        }
        label="Disponible para pedidos"
      />
      <p>
        Cada presentación y unidad tiene su propio precio; crea una entrada por
        combinación (libra, kilo o arroba). Los pedidos registrados conservan su
        precio y presentación.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Guardando…" : product ? "Guardar producto" : "Crear producto"}
      </Button>
    </form>
  );
}
