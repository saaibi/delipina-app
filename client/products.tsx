import React, { useState, useEffect } from "react";
import { cachedProductImage } from "./offline";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Add from "@mui/icons-material/Add";
import Remove from "@mui/icons-material/Remove";
import IconButton from "@mui/material/IconButton";
import { Field, Select } from "./ui";
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
              aspectRatio: "1/1",
            }
      }
    />
  );
}
const unitNames = {
  kg: "Kilo",
  lb: "Libra",
  arroba: "Arroba",
  pack: "Empaque",
};
function presentationLabel(p: any) {
  const label = p.presentation.trim();
  return /^(por (kilogramo|kilo|libra)( \(500 g\))?|arroba colombiana \(25 libras \/ 12,5 kg\))$/i.test(
    label,
  )
    ? ""
    : label;
}
export function ProductChoices({
  products,
  quantities,
  onQuantity,
  money,
}: any) {
  const [chosen, C] = useState<Record<string, string>>({});
  const groups = Object.values(
    products
      .filter((p) => p.active)
      .reduce((groups, p) => {
        const label = presentationLabel(p),
          key =
            (p.catalog_product_id ||
              (p.product_name || p.name).trim().toLowerCase()) +
            "|" +
            label.toLowerCase();
        (groups[key] ??= {
          key,
          name: p.product_name || p.name,
          label,
          variants: [],
        }).variants.push(p);
        return groups;
      }, {}),
  ) as any[];
  return (
    <div className="product-choices">
      {groups.map((group) => {
        const p =
          group.variants.find((p) => p.id === chosen[group.key]) ||
          group.variants.find((p) => p.unit === "kg") ||
          group.variants[0];
        const quantity = Number(quantities[p.id] || 0),
          selected = group.variants.some(
            (p) => Number(quantities[p.id] || 0) > 0,
          ),
          photo = p.has_image
            ? p
            : group.variants.find((p) => p.has_image) || p;
        return (
          <article
            className={"product-choice " + (selected ? "selected" : "")}
            key={group.key}
          >
            <button
              type="button"
              className="product-choice-target"
              aria-pressed={quantity > 0}
              aria-label={
                "Seleccionar " +
                group.name +
                (group.label ? " · " + group.label : "") +
                " por " +
                (unitNames[p.unit] || p.unit)
              }
              onClick={() => onQuantity(p.id, quantity > 0 ? "" : 1)}
            >
              <div className="product-photo-frame">
                <ProductPhoto product={photo} />
              </div>
              <div className="product-choice-copy">
                <strong>{group.name}</strong>
                {group.label && <span>{group.label}</span>}
                <b>
                  {money(p.price)} /{" "}
                  {(unitNames[p.unit] || p.unit).toLowerCase()}
                </b>
              </div>
              {selected && <CheckCircle className="product-choice-check" />}
            </button>
            <div className="measure-selector">
              <Select
                label="Medida"
                size="small"
                value={p.id}
                onChange={(e) =>
                  C((prev) => ({ ...prev, [group.key]: e.target.value }))
                }
              >
                {group.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {unitNames[v.unit] || v.unit}
                  </option>
                ))}
              </Select>
            </div>
            <div className="quantity-controls">
              <IconButton
                aria-label={
                  "Quitar cantidad de " +
                  group.name +
                  " por " +
                  (unitNames[p.unit] || p.unit)
                }
                disabled={!quantity}
                onClick={() => onQuantity(p.id, Math.max(0, quantity - 1))}
              >
                <Remove />
              </IconButton>
              <Field
                required={false}
                label={
                  { kg: "kg", lb: "lb", arroba: "@", pack: "uds." }[p.unit] ||
                  p.unit
                }
                type="number"
                min="0"
                step={
                  (p.allows_fraction ?? ["kg", "lb", "arroba"].includes(p.unit))
                    ? ".001"
                    : "1"
                }
                value={quantities[p.id] || ""}
                onChange={(e) => onQuantity(p.id, e.target.value)}
                size="small"
                sx={{ my: 0.5 }}
              />
              <IconButton
                aria-label={
                  "Agregar cantidad de " +
                  group.name +
                  " por " +
                  (unitNames[p.unit] || p.unit)
                }
                onClick={() => onQuantity(p.id, quantity + 1)}
              >
                <Add />
              </IconButton>
            </div>
            {selected && (
              <div className="chosen-measures">
                {group.variants
                  .filter((v) => Number(quantities[v.id] || 0) > 0)
                  .map((v) => (
                    <button
                      type="button"
                      key={v.id}
                      onClick={() =>
                        C((prev) => ({ ...prev, [group.key]: v.id }))
                      }
                      aria-label={
                        "Editar " +
                        quantities[v.id] +
                        " " +
                        (unitNames[v.unit] || v.unit) +
                        " de " +
                        group.name
                      }
                    >
                      {quantities[v.id]}{" "}
                      {(unitNames[v.unit] || v.unit).toLowerCase()}
                    </button>
                  ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
