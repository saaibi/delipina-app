import React, { useEffect, useState, useRef } from "react";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
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
};
const blank = () => ({
  key: crypto.randomUUID(),
  label: "",
  image: null,
  photo: null,
  units: Object.fromEntries(
    Object.keys(units).map((u) => [
      u,
      { enabled: u === "kg", price: "", id: null },
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
                  unit,
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
      {error && <Alert severity="error">{error}</Alert>}
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
          <div className="presentation-units">
            {Object.entries(units).map(([unit, label]) => (
              <div key={unit}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={p.units[unit].enabled}
                      onChange={(_, enabled) =>
                        change(p.key, {
                          units: {
                            ...p.units,
                            [unit]: { ...p.units[unit], enabled },
                          },
                        })
                      }
                    />
                  }
                  label={label}
                />
                {p.units[unit].enabled && (
                  <Field
                    label={"Precio " + label + " (COP)"}
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.units[unit].price}
                    onChange={(e) =>
                      change(p.key, {
                        units: {
                          ...p.units,
                          [unit]: { ...p.units[unit], price: e.target.value },
                        },
                      })
                    }
                  />
                )}
              </div>
            ))}
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
      {error && <Alert severity="error">{error}</Alert>}
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
