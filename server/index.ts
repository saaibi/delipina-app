import { ensureRecurrences } from "./recurrence.js";
import { broadcast } from "./domain.js";
import { ensureBusinessClock } from "./business-day.js";
import { bootstrapAdmin } from "./bootstrap.js";
import { createApp } from "./app.js";
import { createRealtime } from "./realtime.js";

import path from "node:path";
import express from "express";
if (process.env.BOOTSTRAP_ADMIN_EMAIL) await bootstrapAdmin();
const app = await createApp();
const io = createRealtime(app.getHttpServer());
const server = app.getHttpAdapter().getInstance();
if (process.env.NODE_ENV === "production") {
  server.use(express.static("dist"));
  server.use((req, res, next) =>
    req.path.startsWith("/api") || req.path.startsWith("/socket.io")
      ? next()
      : res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: "client",
    server: { middlewareMode: true },
    appType: "spa",
  });
  server.use((req, res, next) =>
    req.path.startsWith("/api") || req.path.startsWith("/socket.io")
      ? next()
      : vite.middlewares(req, res, next),
  );
}
await app.listen(Number(process.env.PORT || 3000), "0.0.0.0");
console.log(`Delipiña NestJS http://localhost:${process.env.PORT || 3000}`);

const businessClock = setInterval(() => {
  ensureBusinessClock()
    .then((changed) => {
      if (changed) void broadcast();
      void ensureRecurrences();
    })
    .catch(() =>
      console.error("No se pudo completar el cierre automático de jornada"),
    );
}, 30000);
businessClock.unref();
