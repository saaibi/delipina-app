import { test } from "node:test";
import assert from "node:assert/strict";
import { routeLinks } from "../shared/routes.js";
test("Recorrido móvil divide paradas sin perderlas y continúa desde el destino anterior", () => {
  const stops = Array.from({ length: 9 }, (_, i) => ({
    address: "[DEMO] Calle " + (i + 1) + " # 1-2",
    city: "Girón",
  }));
  const links = routeLinks("Plaza San Francisco, Bucaramanga", stops);
  assert.deepEqual(
    links.map((r) => r.count),
    [4, 4, 1],
  );
  const first = new URL(links[0].url),
    second = new URL(links[1].url);
  assert.equal(first.searchParams.get("api"), "1");
  assert.equal(first.searchParams.get("waypoints")!.split("|").length, 3);
  assert.equal(
    second.searchParams.get("origin"),
    first.searchParams.get("destination"),
  );
  assert.ok(!links.some((r) => r.url.includes("DEMO")));
  assert.equal(new URL(links[2].url).searchParams.has("waypoints"), false);
  assert.deepEqual(routeLinks("", []), []);
});

import {
  groupStops,
  bestOrder,
  located,
} from "../dist-server/route-planner.js";
test("Grupos geográficos no duplican ni pierden pedidos; fuera de zona va separado", () => {
  const stops = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    city: "Bucaramanga",
    lat: 7 + i * 0.001,
    lng: -73,
  }));
  stops.push({ id: "outside", city: "Bogotá", lat: 4.6, lng: -74 });
  stops.push({ id: "missing", city: "Bucaramanga", lat: null, lng: null });
  const groups = groupStops(stops, { lat: 7.13, lng: -73.12 });
  assert.ok(groups.every((g) => g.length <= 5));
  assert.equal(new Set(groups.flat().map((s) => s.id)).size, 14);
  assert.equal(groups.find((g) => g.some((s) => s.id === "outside")).length, 1);
  assert.equal(groups.find((g) => g.some((s) => s.id === "missing")).length, 1);
  assert.equal(located(undefined), false);
  assert.equal(located({ lat: null, lng: null }), false);
});
test("El menor tiempo por vías respeta matriz asimétrica y detecta destinos desconectados", () => {
  const stops = [
    { id: "a", city: "x" },
    { id: "b", city: "x" },
    { id: "c", city: "x" },
  ];
  const matrix = [
    [0, 1, 5, 9],
    [1, 0, 100, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
  ];
  const plan = bestOrder(stops, matrix);
  assert.deepEqual(
    plan.stops.map((s) => s.id),
    ["a", "c", "b"],
  );
  assert.equal(plan.cost, 3);
  assert.equal(
    bestOrder(stops, [
      [0, null, null, null],
      [null, 0, 1, 1],
      [null, 1, 0, 1],
      [null, 1, 1, 0],
    ]),
    null,
  );
});
import { mapsUrl, localDelivery } from "../shared/routes.js";
test("Ver mapa abre la ruta completa o un destino individual con coordenadas o dirección",()=>{
 const stops=Array.from({length:5},(_,i)=>({address:'[DEMO] Carrera '+(i+1)+' #6-68',city:'Bucaramanga',lat:7+i/100,lng:-73}));
 const route=new URL(mapsUrl(stops,'7.13,-73.12'));
 assert.equal(route.searchParams.get('waypoints')!.split('|').length,4);
 assert.equal(route.searchParams.get('destination'),'7.04,-73');
 const single=new URL(mapsUrl([{address:'[DEMO] Carrera 23 #6-68',city:'Bucaramanga'}]));
 assert.equal(single.searchParams.get('destination'),'Carrera 23 #6-68, Bucaramanga, Colombia');
 assert.equal(single.searchParams.has('waypoints'),false);assert.equal(single.searchParams.has('origin'),false);
 assert.equal(localDelivery('Girón'),true);assert.equal(localDelivery('Bogotá'),false);
});
