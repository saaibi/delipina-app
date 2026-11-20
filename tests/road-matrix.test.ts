import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { roadMatrix } from "../dist-server/road-matrix.js";
test("Cliente OSRM real sobre HTTP: serialización, error HTTP y matriz inválida", async () => {
  let count = 0;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!);
    count++;
    res.setHeader("Content-Type", "application/json");
    if (count === 1)
      res.end(
        JSON.stringify({
          code: "Ok",
          durations: [
            [0, 40],
            [30, 0],
          ],
        }),
      );
    else if (count === 2) {
      res.statusCode = 503;
      res.end("{}");
    } else
      res.end(
        JSON.stringify({
          code: "Ok",
          durations: [
            [0, -1],
            [30, 0],
          ],
        }),
      );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const points = [
      { lat: 7.13488, lng: -73.12438 },
      { lat: 7.1, lng: -73.1 },
    ];
    assert.deepEqual(await roadMatrix(points, base, false), [
      [0, 40],
      [30, 0],
    ]);
    assert.ok(requests[0].startsWith("/table/v1/driving/-73.124380,7.134880;"));
    assert.ok(requests[0].includes("annotations=duration"));
    await assert.rejects(roadMatrix(points, base, false));
    await assert.rejects(roadMatrix(points, base, false));
    assert.equal(count, 3);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
