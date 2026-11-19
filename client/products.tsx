import React, { useState, useEffect } from "react";
import { cachedProductImage } from "./offline";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Add from "@mui/icons-material/Add";
import Remove from "@mui/icons-material/Remove";
import IconButton from "@mui/material/IconButton";
import { Field } from "./ui";
export const productImages = [
  ["entera", "Entera"],
  ["trozos", "En trozos"],
  ["picada", "Picada"],
  ["rayada", "Rayada"],
];
const crops = {
  entera: { x: 2, y: 505, w: 163, h: 178 },
  trozos: { x: 165, y: 497, w: 142, h: 184 },
  picada: { x: 304, y: 506, w: 140, h: 178 },
  rayada: { x: 444, y: 491, w: 146, h: 194 },
};
export function productImageKey(p: any) {
  return (
    p.image_key ||
    {
      entera: "entera",
      "en trozos": "trozos",
      trozos: "trozos",
      picada: "picada",
      rayada: "rayada",
      rallada: "rayada",
    }[p.name.toLowerCase()]
  );
}
export function ProductPhoto({ product, small = false }: any) {
  const [custom, C] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    C(null);
    if (product.has_image)
      cachedProductImage(product.id, product.image_updated_at || "1")
        .then((data) => {
          if (active) C(data);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [product.id, product.has_image, product.image_updated_at]);
  const crop = crops[productImageKey(product)];
  if (custom)
    return (
      <img
        className={
          small ? "product-photo small custom" : "product-photo custom"
        }
        src={custom}
        alt={"Presentación " + product.name}
      />
    );
  return (
    <div
      role="img"
      aria-label={"Presentación " + product.name}
      className={small ? "product-photo small" : "product-photo"}
      style={
        crop
          ? {
              backgroundImage: "url('/presentaciones-delipina.png')",
              backgroundSize: `${(590 / crop.w) * 100}% auto`,
              aspectRatio: `${crop.w}/${crop.h}`,
              backgroundPosition: `${(crop.x / (590 - crop.w)) * 100}% ${(crop.y / (1280 - crop.h)) * 100}%`,
            }
          : {
              backgroundImage: "url('/logo.png')",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundColor: "#143e2b",
            }
      }
    />
  );
}
export function ProductChoices({
  products,
  quantities,
  onQuantity,
  money,
}: any) {
  return (
    <div className="product-choices">
      {products
        .filter((p) => p.active)
        .map((p) => {
          const quantity = Number(quantities[p.id] || 0),
            selected = quantity > 0;
          return (
            <article
              className={"product-choice " + (selected ? "selected" : "")}
              key={p.id}
            >
              <button
                type="button"
                className="product-choice-target"
                aria-pressed={selected}
                aria-label={"Seleccionar " + p.name + " · " + p.presentation}
                onClick={() => onQuantity(p.id, selected ? "" : 1)}
              >
                <div className="product-photo-frame">
                  <ProductPhoto product={p} />
                </div>
                <div className="product-choice-copy">
                  <strong>{p.name}</strong>
                  <span>{p.presentation}</span>
                  <b>
                    {money(p.price)} / {p.unit === "kg" ? "kg" : "empaque"}
                  </b>
                </div>
                {selected && <CheckCircle className="product-choice-check" />}
              </button>
              <div className="quantity-controls">
                <IconButton
                  aria-label={"Quitar cantidad de " + p.name}
                  disabled={!selected}
                  onClick={() => onQuantity(p.id, Math.max(0, quantity - 1))}
                >
                  <Remove />
                </IconButton>
                <Field
                  required={false}
                  label={p.unit === "kg" ? "kg" : "uds."}
                  type="number"
                  min="0"
                  step={p.unit === "kg" ? ".001" : "1"}
                  value={quantities[p.id] || ""}
                  onChange={(e) => onQuantity(p.id, e.target.value)}
                  size="small"
                  sx={{ my: 0.5 }}
                />
                <IconButton
                  aria-label={"Agregar cantidad de " + p.name}
                  onClick={() => onQuantity(p.id, quantity + 1)}
                >
                  <Add />
                </IconButton>
              </div>
            </article>
          );
        })}
    </div>
  );
}
