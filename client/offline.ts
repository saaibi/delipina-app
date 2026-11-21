import { nativeRequestHeaders } from "../shared/native-headers";
import { nativeAndroid, NativeBridge } from "./native";
import { storage } from "./storage";
const db = storage();
let uid;
export function setOfflineUser(id) {
  uid = id;
}
export async function saveIdentity(user) {
  await (await db).put("cache", user, "identity");
}
export async function savedIdentity() {
  return (await db).get("cache", "identity");
}
export async function clearOffline() {
  const d = await db;
  await d.clear("cache");
  await d.clear("queue");
  uid = null;
}
export async function api(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
) {
  if (nativeAndroid) {
    const result = await NativeBridge.request({
      path,
      method: options.method || "GET",
      body: options.body,
      headers: nativeRequestHeaders(options.headers),
    });
    if (result.status >= 400)
      throw Object.assign(
        Error(result.data?.error || "No fue posible completar la solicitud"),
        { status: result.status },
      );
    return result.data;
  }
  const r = await fetch("/api" + path, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const d = await r.json();
  if (!r.ok)
    throw Object.assign(Error(d.error || "Error"), { status: r.status });
  return d;
}
export async function cached(path) {
  const key = uid + path;
  try {
    const data = await api(path);
    await (await db).put("cache", data, key);
    return data;
  } catch (e) {
    if (!navigator.onLine) {
      const data = await (await db).get("cache", key);
      if (data) return data;
    }
    throw e;
  }
}
export async function submitOrder(body) {
  const key = crypto.randomUUID();
  await (await db).put("queue", { key, uid, body });
  if (navigator.onLine) {
    try {
      const r = await api("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body,
      });
      await (await db).delete("queue", key);
      return r;
    } catch (e) {
      if (navigator.onLine)
        throw Error(
          e.message + " · El borrador permanece en la cola para revisar.",
        );
    }
  }
  return { queued: true };
}
export async function discard(key) {
  await (await db).delete("queue", key);
}
export async function sync() {
  const d = await db;
  const results = [];
  for (const item of await d.getAll("queue")) {
    if (item.uid !== uid) continue;
    try {
      await api("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": item.key },
        body: item.body,
      });
      await d.delete("queue", item.key);
    } catch (e) {
      results.push(e.message);
    }
  }
  return results;
}
export async function queued() {
  return (await (await db).getAll("queue")).filter((i) => i.uid === uid);
}

export async function cachedProductImage(id: string, version: string) {
  const key = uid + "/product-image/" + id + "/" + version;
  try {
    if (nativeAndroid) {
      const r = await NativeBridge.request({
        path: "/products/" + id + "/photo",
        method: "GET",
      });
      if (r.status !== 200 || !r.mime?.startsWith("image/"))
        throw Error("Imagen no disponible");
      const data = "data:" + r.mime + ";base64," + r.base64;
      await (await db).put("cache", data, key);
      return data;
    }
    const r = await fetch("/api/products/" + id + "/photo");
    if (!r.ok) throw Error("Imagen no disponible");
    const blob = await r.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await (await db).put("cache", data, key);
    return data;
  } catch (e) {
    const stored = await (await db).get("cache", key);
    if (stored) return stored;
    throw e;
  }
}
