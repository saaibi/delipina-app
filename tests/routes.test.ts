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
