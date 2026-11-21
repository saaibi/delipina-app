const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "delipina-v1";
const PRECACHE_ASSETS: string[] = [];
sw.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "/",
          "/logo.png",
          "/icon-192.png",
          "/icon-512.png",
          "/icon-180.png",
          "/presentaciones-delipina.png",
          ...PRECACHE_ASSETS,
        ]),
      ),
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
  const query = new URLSearchParams({
    notice: d.id || "",
    revision: String(d.revision || 1),
    module: d.module || "orders",
  });
  if (d.targetId)
    query.set(d.module === "credits" ? "credit" : "order", d.targetId);
  e.waitUntil(
    sw.registration.showNotification(d.title || "Delipiña", {
      body: d.body || "Toca para consultar el detalle.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag:
        d.module === "orders" && d.targetId
          ? "order:" + d.targetId
          : d.id || "delipina-update",
      data: {
        ...d,
        url: "/?" + query,
        id: d.id,
        revision: d.revision,
        targetId: d.targetId,
        canRespond: d.canRespond,
        status: d.status,
      },
      ...(d.canRespond === "true"
        ? {
            actions: [
              { action: "confirm", title: "Aceptar" },
              { action: "reject", title: "Rechazar" },
            ],
          }
        : {}),
    }),
  );
});
sw.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const d = e.notification.data || {};
      if (["confirm", "reject"].includes(e.action)) {
        try {
          if (d.canRespond !== "true" || d.status !== "pending" || !d.targetId)
            throw Error("Acción no disponible");
          const response = await fetch(
            "/api/orders/" + encodeURIComponent(d.targetId) + "/action",
            {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: e.action,
                notificationId: d.id,
                revision: Number(d.revision),
              }),
            },
          );
          if (!response.ok) throw Error("No se completó la respuesta");
          const result = await response.json(),
            notice = result.notification;
          if (notice) {
            const url = new URL(d.url || "/", sw.location.origin);
            url.searchParams.set("revision", String(notice.revision));
            await sw.registration.showNotification("Pedido", {
              body: [d.clientName, notice.statusLabel, d.deliveryWindow]
                .filter(Boolean)
                .join(" · "),
              icon: "/icon-192.png",
              tag: "order:" + d.targetId,
              data: {
                ...d,
                ...notice,
                url: url.pathname + url.search,
                canRespond: "false",
              },
            });
          }

          const windows = await sw.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          windows.forEach((w) => w.postMessage({ type: "refresh" }));
        } catch {
          await sw.registration.showNotification(
            "No se completó la respuesta",
            {
              body: "Abre el pedido para revisar su estado antes de volver a intentar.",
              icon: "/icon-192.png",
              data: d,
            },
          );
        }
        return;
      }

      if (d.id)
        await fetch(
          "/api/notifications/" + encodeURIComponent(d.id) + "/read",
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: d.revision }),
          },
        ).catch(() => {});
      const url = new URL(d.url || "/", sw.location.origin).href;
      const windows = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (w) => new URL(w.url).origin === sw.location.origin,
      ) as WindowClient | undefined;
      if (existing) {
        await existing.navigate(url);
        await existing.focus();
      } else await sw.clients.openWindow(url);
    })(),
  );
});

sw.addEventListener("notificationclose", (e) => {
  const d = e.notification.data || {};
  if (!d.id) return;
  e.waitUntil(
    fetch("/api/notifications/" + encodeURIComponent(d.id) + "/dismiss", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: Number(d.revision) }),
    }).catch(() => {}),
  );
});
