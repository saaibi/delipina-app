import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Alert from "@mui/material/Alert";
import { Field, Select, Button, Modal } from "./ui";
import { ProductChoices } from "./products";
import { api } from "./offline";
export const emptyRecurrence = {
  enabled: false,
  frequency: "days",
  intervalDays: 1,
  weekdays: [1],
  endDay: "",
};
export function RecurrenceEditor({
  value: v,
  onChange: C,
  always = false,
  baseDay,
}: any) {
  const set = (b) => C({ ...v, ...b });
  return (
    <fieldset className="recurrence-editor">
      <legend>Pedidos automáticos</legend>
      {!always && (
        <FormControlLabel
          control={
            <Switch
              checked={v.enabled}
              onChange={(_, enabled) => set({ enabled })}
            />
          }
          label="Repetir este pedido"
        />
      )}
      {(always || v.enabled) && (
        <>
          <Select
            label="Frecuencia"
            value={v.frequency}
            onChange={(e) => set({ frequency: e.target.value })}
          >
            <option value="days">Cada cierto número de días</option>
            <option value="weekly">Días de la semana</option>
          </Select>
          {v.frequency === "days" ? (
            <Field
              type="number"
              label="Repetir cada (días)"
              min="1"
              max="365"
              value={v.intervalDays}
              onChange={(e) => set({ intervalDays: Number(e.target.value) })}
            />
          ) : (
            <div>
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                (day, i) => (
                  <FormControlLabel
                    key={day}
                    control={
                      <Switch
                        checked={v.weekdays.includes(i + 1)}
                        onChange={(_, v2) =>
                          set({
                            weekdays: v2
                              ? [...v.weekdays, i + 1]
                              : v.weekdays.filter((d) => d !== i + 1),
                          })
                        }
                      />
                    }
                    label={day}
                  />
                ),
              )}
            </div>
          )}
          <Field
            type="date"
            label="Repetir hasta (opcional)"
            min={dayjs(
              baseDay ||
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "America/Bogota",
                }),
            )
              .add(1, "day")
              .format("YYYY-MM-DD")}
            required={false}
            value={v.endDay || ""}
            onChange={(e) => set({ endDay: e.target.value })}
          />
          <p>
            Diaria: cada 1 día. Puedes elegir 2, 3, 4, 5, 6 o más días. Cada
            repetición crea un pedido nuevo para revisión, con los precios y
            disponibilidad vigentes.
          </p>
        </>
      )}
    </fieldset>
  );
}
export function SchedulesView({ products, money }: any) {
  const [rows, R] = useState([]),
    [edit, M] = useState<any>(null),
    [cfg, C] = useState(emptyRecurrence),
    [quant, Q] = useState<any>({}),
    [error, E] = useState("");
  const load = () => api("/schedules").then(R);
  useEffect(() => {
    load().catch((e) => E(e.message));
    const f = () => load().catch(() => {});
    window.addEventListener("delipina:refresh", f);
    return () => window.removeEventListener("delipina:refresh", f);
  }, []);
  return (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      {!rows.length && (
        <div className="empty">
          No hay frecuencias. Activa «Repetir este pedido» al crear uno.
        </div>
      )}
      <div className="frequency-grid">
        {rows.map((r) => (
          <article className="panel" key={r.id}>
            <strong>{r.client_name}</strong>
            <p>
              {r.frequency === "days"
                ? `Cada ${r.interval_days} día(s)`
                : "Semanal · " +
                  r.weekdays
                    .map(
                      (d) =>
                        ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][
                          d - 1
                        ],
                    )
                    .join(", ")}{" "}
              · próxima {String(r.next_day).slice(0, 10)} ·{" "}
              {r.active ? "Activa" : "Pausada"}
            </p>
            {r.last_error && <Alert severity="info">{r.last_error}</Alert>}
            <div className="actions">
              <Button
                onClick={() => {
                  M(r);
                  C({
                    enabled: true,
                    frequency: r.frequency,
                    intervalDays: r.interval_days,
                    weekdays: r.weekdays,
                    endDay: r.end_day ? String(r.end_day).slice(0, 10) : "",
                  });
                  Q(
                    Object.fromEntries(
                      r.body.items.map((i) => [i.productId, i.quantity]),
                    ),
                  );
                }}
              >
                Editar frecuencia
              </Button>
              <Button
                className="neutral"
                onClick={async () => {
                  try {
                    await api("/schedules/" + r.id, {
                      method: "PATCH",
                      body: { active: !r.active },
                    });
                    await load();
                  } catch (e) {
                    E(e.message);
                  }
                }}
              >
                {r.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {edit && (
        <Modal title="Editar frecuencia" wide onClose={() => M(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const b = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api("/schedules/" + edit.id, {
                  method: "PATCH",
                  body: {
                    ...cfg,
                    nextDay: b.nextDay,
                    startTime: b.startTime,
                    endTime: b.endTime,
                    items: Object.entries(quant)
                      .filter(([, v]) => Number(v) > 0)
                      .map(([productId, quantity]) => ({
                        productId,
                        quantity: Number(quantity),
                      })),
                  },
                });
                M(null);
                await load();
              } catch (e) {
                E(e.message);
              }
            }}
          >
            <RecurrenceEditor
              value={cfg}
              onChange={C}
              always
              baseDay={String(edit.next_day).slice(0, 10)}
            />
            <Field
              type="date"
              name="nextDay"
              label="Próxima entrega"
              defaultValue={String(edit.next_day).slice(0, 10)}
            />
            <div className="row">
              <Field
                name="startTime"
                type="time"
                label="Desde"
                defaultValue={edit.body.startTime}
              />
              <Field
                name="endTime"
                type="time"
                label="Hasta"
                defaultValue={edit.body.endTime}
              />
            </div>
            <ProductChoices
              products={products}
              quantities={quant}
              onQuantity={(id, value) => Q({ ...quant, [id]: value })}
              money={money}
            />
            <Button type="submit">Guardar frecuencia</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
