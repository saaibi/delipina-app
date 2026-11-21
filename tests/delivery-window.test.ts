import { test } from "node:test";
import assert from "node:assert/strict";
import {
  suggestedDelivery,
  deliveryClosing,
} from "../shared/delivery-window.js";
import { comparePlantOrders, orderUrgency } from "../shared/plant-priority.js";
const week = Object.fromEntries(
  Array.from({ length: 7 }, (_, i) => [
    i + 1,
    { enabled: true, open: "06:00", close: "18:00", leadHours: 2 },
  ]),
);
test("Desde suma anticipación y Hasta resta anticipación al cierre; ajustes nuevos se aplican inmediatamente", () => {
  const now = new Date("2026-11-20T08:15:30-05:00");
  assert.deepEqual(suggestedDelivery({ weeklySchedule: week }, null, now), {
    start: "2026-11-20T15:16:00.000Z",
    end: "2026-11-20T21:00:00.000Z",
  });
  const changed = {
    ...week,
    5: { enabled: true, open: "06:00", close: "20:00", leadHours: 3 },
  };
  const next = suggestedDelivery({ weeklySchedule: changed }, null, now);
  assert.equal(next.start, "2026-11-20T16:16:00.000Z");
  assert.equal(next.end, "2026-11-20T22:00:00.000Z");
  assert.equal(
    deliveryClosing({ weeklySchedule: changed }, "2026-11-20T15:00:00Z"),
    next.end,
  );
});
test("Sin margen suficiente o día cerrado salta al próximo día habilitado con su propio horario", () => {
  const settings = {
    weeklySchedule: {
      ...week,
      6: { enabled: false, open: "06:00", close: "18:00", leadHours: 2 },
      7: { enabled: true, open: "07:00", close: "15:00", leadHours: 1 },
    },
  };
  const next = suggestedDelivery(
    settings,
    null,
    new Date("2026-11-20T15:00:00-05:00"),
  );
  assert.equal(next.start, "2026-11-22T13:00:00.000Z");
  assert.equal(next.end, "2026-11-22T19:00:00.000Z");
  assert.equal(
    suggestedDelivery(
      settings,
      { day: "2026-11-20", closedAt: "x" },
      new Date("2026-11-20T07:00:00-05:00"),
    ).start,
    next.start,
  );
});
test("Planta prioriza trabajo aceptado urgente y después respeta llegada", () => {
  const now = Date.parse("2026-11-20T15:00:00Z");
  const make = (id, status, minutes, arrival) => ({
    id,
    status,
    window_end: new Date(now + minutes * 60000).toISOString(),
    created_at: new Date(now + arrival * 60000).toISOString(),
  });
  const list = [
    make("pending", "pending", -20, -100),
    make("second", "confirmed", 120, -20),
    make("first", "confirmed", 180, -40),
    make("soon", "confirmed", 30, -10),
    make("late", "preparing", -5, -1),
    make("ready", "ready", -10, -90),
  ];
  assert.deepEqual(
    list.sort((a, b) => comparePlantOrders(a, b, now)).map((o) => o.id),
    ["late", "soon", "first", "second", "ready", "pending"],
  );
  assert.equal(orderUrgency(make("x", "confirmed", 10, 0), now), "soon");
  assert.equal(orderUrgency(make("x", "delivered", -5, 0), now), null);
});
import { parseMapPoint } from "../shared/map-point.js";
test("Coordenadas pegadas requieren latitud y longitud válidas y no interpretan enlaces como un punto", () => {
  assert.deepEqual(parseMapPoint("7.075, -73.168"), {
    lat: 7.075,
    lng: -73.168,
  });
  for (const bad of [
    "100, -73",
    "7",
    "7,",
    "https://maps.google.com/?q=7,-73",
    "7,-181",
  ])
    assert.equal(parseMapPoint(bad), null);
});

test("Antes de abrir y en días futuros suma la anticipación a la apertura del día", () => {
  const settings = { weeklySchedule: week };
  assert.equal(
    suggestedDelivery(settings, null, new Date("2026-11-20T04:00:00-05:00"))
      .start,
    "2026-11-20T13:00:00.000Z",
  );
  assert.equal(
    suggestedDelivery(settings, null, new Date("2026-11-20T17:00:00-05:00"))
      .start,
    "2026-11-21T13:00:00.000Z",
  );
});
