// Credential headers stay allowlisted by the Android bridge. Preserve this
// canonical spelling for APKs that predate case-insensitive header lookup.
export function nativeRequestHeaders(input?: HeadersInit) {
  const headers = new Headers(input);
  const result = Object.fromEntries(headers.entries());
  const key = headers.get("Idempotency-Key");
  if (key !== null) result["Idempotency-Key"] = key;
  return result;
}
