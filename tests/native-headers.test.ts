import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeRequestHeaders } from "../shared/native-headers.js";
test("La clave de sincronización llega a Android con Headers, tuplas y nombres en cualquier capitalización", () => {
  for (const input of [
    { "Idempotency-Key": "order-key" },
    { "idempotency-key": "order-key" },
    new Headers({ "IDEMPOTENCY-KEY": "order-key" }),
    [["idempotency-key", "order-key"]] as [string, string][],
  ]) {
    assert.equal(nativeRequestHeaders(input)["Idempotency-Key"], "order-key");
  }
  assert.equal(nativeRequestHeaders()["Idempotency-Key"], undefined);
});
