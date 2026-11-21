import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRouteMatrix } from "../dist-server/google-roads.js";
test("Matriz Google preserva asimetría y caminos no disponibles; descarta respuestas incompletas o corruptas", () => {
  const data = [
    { condition: "ROUTE_EXISTS", duration: "0s" },
    {
      originIndex: 0,
      destinationIndex: 1,
      condition: "ROUTE_EXISTS",
      duration: "41.2s",
    },
    { originIndex: 1, destinationIndex: 0, condition: "ROUTE_NOT_FOUND" },
    {
      originIndex: 1,
      destinationIndex: 1,
      condition: "ROUTE_EXISTS",
      duration: "0s",
    },
  ];
  assert.deepEqual(parseRouteMatrix(data, 2), [
    [0, 41.2],
    [null, 0],
  ]);
  assert.throws(() => parseRouteMatrix(data.slice(1), 2));
  assert.throws(() => parseRouteMatrix([...data, data[0]], 2));
  assert.throws(() =>
    parseRouteMatrix(
      data.map((x, i) => (i === 1 ? { ...x, duration: "-1s" } : x)),
      2,
    ),
  );
  assert.deepEqual(
    parseRouteMatrix(
      data.map((x, i) => (i === 1 ? { ...x, status: { code: 7 } } : x)),
      2,
    ),
    [
      [0, null],
      [null, 0],
    ],
  );
});
