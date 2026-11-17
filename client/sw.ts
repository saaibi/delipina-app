const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "delipina-v1";
const PRECACHE_ASSETS: string[] = [];
sw.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/", "/logo.png","/presentaciones-delipina.png", ...PRECACHE_ASSETS])),
  ),
);
sw.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("delipina-") && key !== CACHE)
          await caches.delete(key);
      await sw.clients.claim();
    })(),
  ),
);
sw.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).pathname.startsWith("/api") ||
    new URL(e.request.url).origin !== sw.location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
  );
});
sw.addEventListener("push", (e) => {
  const d = e.data?.json() || {};
  e.waitUntil(
    sw.registration.showNotification(d.title || "Delipiña", {
      body: "Abre la aplicación para consultar el pedido.",
      icon: "/logo.png",
      tag: d.id || "delipina-update",
      data: { url: "/" },
    }),
  );
});
sw.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(sw.clients.openWindow("/"));
});
