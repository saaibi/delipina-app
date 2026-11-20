import { FeedbackSnackbar } from "./feedback";
import React, { useEffect, useState, useRef } from "react";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import { Select } from "./ui";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { Button, Field } from "./ui";
import { api } from "./offline";
import { ProductPhoto } from "./products";
const units = {
  kg: "Kilo",
  lb: "Libra",
  arroba: "Arroba (25 libras)",
  pack: "Empaque",
  unidad: "Unidad",
  caja: "Caja",
};
const blank = () => ({
  key: crypto.randomUUID(),
  label: "",
  image: null,
  photo: null,
  units: Object.fromEntries(
    Object.keys(units).map((u) => [
      u,
      {
        enabled: u === "kg",
        price: "",
        id: null,
        fractional: ["kg", "lb", "arroba"].includes(u),
      },
    ]),
  ),
});
async function compress(file: File) {
  if (!file.type.startsWith("image/")) throw Error("Selecciona una imagen");
  const bmp = await createImageBitmap(file),
    ratio = Math.min(1, 1000 / Math.max(bmp.width, bmp.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * ratio);
  canvas.height = Math.round(bmp.height * ratio);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL("image/webp", 0.85);
  if (url.length > 2000000) throw Error("Imagen demasiado grande");
  return url;
}
export function groupVariants(rows: any[]) {
  return Object.values(
    rows.reduce((g, p) => {
      (g[p.presentation] ??= {
        ...blank(),
        label: p.presentation,
        photo: p,
        units: Object.fromEntries(
          Object.keys(units).map((u) => [
            u,
            { enabled: false, price: "", id: null },
          ]),
        ),
      }).units[p.unit] = {
        enabled: p.active,
        price: String(Number(p.price) / 100),
        id: p.id,
        fractional:
          p.allows_fraction ?? ["kg", "lb", "arroba"].includes(p.unit),
      };
      return g;
    }, {}),
  ) as any[];
}
export function ProductEditor({ product, onSaved }: any) {
  const id = useRef(product?.catalog_product_id || product?.id),
    [name, N] = useState(product?.name || ""),
    [active, A] = useState(true),
    [presentations, P] = useState<any[]>([blank()]),
    [busy, B] = useState(!!product),
    [error, E] = useState("");
  useEffect(() => {
    if (!product) return;
    api("/product-groups/" + id.current)
      .then((g) => {
        N(g.name);
        A(g.active);
        P(groupVariants(g.variants));
      })
      .catch((e) => E(e.message))
      .finally(() => B(false));
  }, [product?.id]);
  const change = (key, b) =>
    P((rows) => rows.map((p) => (p.key === key ? { ...p, ...b } : p)));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        E("");
        try {
          const body = {
            name,
            active,
            presentations: presentations.map((p) => ({
              label: p.label,
              image: p.image?.split(",")[1],
              units: Object.entries(p.units)
                .filter(([, v]: any) => v.enabled)
                .map(([unit, v]: any) => ({
                  id: v.id || undefined,
                  unit:
                    p.names?.[unit]?.trim() &&
                    p.names[unit].trim().toLowerCase() !==
                      (units[unit] || unit).toLowerCase()
                      ? p.names[unit].trim()
                      : unit,
                  fractional:
                    v.fractional ?? ["kg", "lb", "arroba"].includes(unit),
                  price: Math.round(Number(v.price) * 100),
                  active: true,
                })),
            })),
          };
          const r = await api(
            "/product-groups" + (id.current ? "/" + id.current : ""),
            { method: id.current ? "PUT" : "POST", body },
          );
          id.current = r.id;
          await onSaved();
        } catch (e) {
          E(e.message);
        } finally {
          B(false);
        }
      }}
    >
      <FeedbackSnackbar
        message={error}
        severity="error"
        onClose={() => E("")}
      />
      <Field
        label="Producto"
        value={name}
        onChange={(e) => N(e.target.value)}
      />
      <FormControlLabel
        control={<Switch checked={active} onChange={(_, v) => A(v)} />}
        label="Producto disponible"
      />
      {presentations.map((p, index) => (
        <section className="presentation-editor panel" key={p.key}>
          <h3>Presentación {index + 1}</h3>
          <Field
            label="Nombre de la presentación"
            placeholder="Ej. Entera, trozos, bloque, granulada…"
            value={p.label}
            onChange={(e) => change(p.key, { label: e.target.value })}
          />
          <Field
            type="file"
            label="Imagen de esta presentación"
            required={false}
            accept="image/*"
            onChange={async (e) => {
              try {
                if (e.target.files?.[0])
                  change(p.key, { image: await compress(e.target.files[0]) });
              } catch (e) {
                E(e.message);
              }
            }}
          />
          {p.image ? (
            <img
              className="upload-preview"
              src={p.image}
              alt={p.label || "Nueva presentación"}
            />
          ) : (
            p.photo && <ProductPhoto product={p.photo} small />
          )}
          <div className="unit-price-list">
            <div className="unit-price-heading">
              <strong>Unidad de venta</strong>
              <strong>Precio (COP)</strong>
              <span />
            </div>
            {Object.entries(p.units)
              .filter(([, v]: any) => v.enabled)
              .map(([unit, v]: any) => (
                <div className="unit-price-row" key={unit}>
                  <div>
                    <Field
                      label="Unidad"
                      value={p.names?.[unit] ?? (units[unit] || unit)}
                      maxLength={40}
                      onChange={(e) =>
                        change(p.key, {
                          names: { ...p.names, [unit]: e.target.value },
                        })
                      }
                    />
                    <FormControlLabel
                      className="fraction-option"
                      control={
                        <Checkbox
                          size="small"
                          checked={
                            v.fractional ??
                            ["kg", "lb", "arroba"].includes(unit)
                          }
                          onChange={(_, fractional) =>
                            change(p.key, {
                              units: {
                                ...p.units,
                                [unit]: { ...v, fractional },
                              },
                            })
                          }
                        />
                      }
                      label="Admite decimales"
                    />
                  </div>
                  <Field
                    label="Precio COP"
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.price}
                    onChange={(e) =>
                      change(p.key, {
                        units: {
                          ...p.units,
                          [unit]: { ...v, price: e.target.value },
                        },
                      })
                    }
                  />
                  <IconButton
                    aria-label={"Quitar unidad " + (units[unit] || unit)}
                    onClick={() =>
                      change(p.key, {
                        units: { ...p.units, [unit]: { ...v, enabled: false } },
                      })
                    }
                  >
                    <DeleteOutline />
                  </IconButton>
                </div>
              ))}
          </div>
          {!Object.values(p.units).some((v: any) => v.enabled) && (
            <Alert severity="info">
              Agrega al menos una unidad para esta presentación.
            </Alert>
          )}
          <div className="unit-add-row">
            <Select
              label="Agregar unidad"
              value={p.addChoice || "__custom__"}
              onChange={(e) => change(p.key, { addChoice: e.target.value })}
            >
              <option value="__custom__">Nueva unidad…</option>
              {Object.entries(units)
                .filter(([k]) => !p.units[k]?.enabled)
                .map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
            </Select>
            {(!p.addChoice || p.addChoice === "__custom__") && (
              <Field
                label="Nombre de la nueva unidad"
                required={false}
                maxLength={40}
                value={p.newUnit || ""}
                onChange={(e) => change(p.key, { newUnit: e.target.value })}
                placeholder="Ej. Caja de 24"
              />
            )}
            <Button
              className="neutral"
              onClick={() => {
                const name =
                  p.addChoice && p.addChoice !== "__custom__"
                    ? p.addChoice
                    : (p.newUnit || "").trim();
                if (
                  !name ||
                  name.length > 40 ||
                  Object.entries(p.units).some(
                    ([k, v]: any) =>
                      v.enabled &&
                      (k.toLowerCase() === name.toLowerCase() ||
                        (units[k] || "").toLowerCase() === name.toLowerCase()),
                  )
                )
                  return E("Escribe o selecciona una unidad nueva");
                change(p.key, {
                  newUnit: "",
                  units: {
                    ...p.units,
                    [name]: {
                      ...p.units[name],
                      enabled: true,
                      price: p.units[name]?.price || "",
                      id: p.units[name]?.id || null,
                      fractional:
                        p.units[name]?.fractional ??
                        ["kg", "lb", "arroba"].includes(name),
                    },
                  },
                });
                E("");
              }}
            >
              Agregar
            </Button>
          </div>
          <Button
            className="neutral"
            disabled={presentations.length === 1 || busy}
            onClick={() => P((rows) => rows.filter((x) => x.key !== p.key))}
          >
            Quitar presentación
          </Button>
        </section>
      ))}
      <div className="actions">
        <Button
          className="neutral"
          disabled={busy}
          onClick={() => P((rows) => [...rows, blank()])}
        >
          Agregar presentación
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar producto y presentaciones"}
        </Button>
      </div>
      <p>
        Las presentaciones retiradas dejan de ofrecerse; los pedidos históricos
        conservan su detalle.
      </p>
    </form>
  );
}
export function ProductCatalog({ products, onEdit, onRefresh }: any) {
  const [q, Q] = useState(""),
    [error, E] = useState("");
  const groups = Object.values(
    products.reduce((g, p) => {
      const id = p.catalog_product_id || p.id;
      (g[id] ??= {
        id,
        name: p.product_name || p.name,
        active: p.group_active ?? p.active,
        variants: [],
      }).variants.push(p);
      return g;
    }, {}),
  ) as any[];
  return (
    <>
      <FeedbackSnackbar
        message={error}
        severity="error"
        onClose={() => E("")}
      />
      <Field
        required={false}
        label="Buscar producto"
        value={q}
        onChange={(e) => Q(e.target.value)}
      />
      <div className="catalog-product-list">
        {groups
          .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
          .map((g) => (
            <article className="panel" key={g.id}>
              <div>
                <strong>{g.name}</strong>
                <p>
                  {new Set(g.variants.map((p) => p.presentation)).size}{" "}
                  presentaciones · {g.active ? "Disponible" : "Inactivo"}
                </p>
                <small>
                  {[...new Set(g.variants.map((p) => p.presentation))].join(
                    " · ",
                  )}
                </small>
              </div>
              <div className="actions">
                <Button onClick={() => onEdit(g)}>Editar producto</Button>
                <Button
                  className="neutral"
                  onClick={async () => {
                    try {
                      await api("/product-groups/" + g.id, {
                        method: "PATCH",
                        body: { active: !g.active },
                      });
                      await onRefresh();
                    } catch (e) {
                      E(e.message);
                    }
                  }}
                >
                  {g.active ? "Desactivar" : "Activar"}
                </Button>
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
