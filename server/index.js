import { createServer } from "node:http";
import { Server } from "socket.io";
import { app, session, setIO, errors } from "./app.js";
import path from "node:path";
import express from "express";
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.APP_ORIGIN, credentials: true },
});
setIO(io);
io.use(async (socket, next) => {
  try {
    const cookies = Object.fromEntries(
      (socket.handshake.headers.cookie || "")
        .split(";")
        .map((v) => v.trim().split("=")),
    );
    const user = await session(cookies.session);
    if (!user) return next(Error("Unauthorized"));
    socket.data.user = user;
    next();
  } catch {
    next(Error("Unauthorized"));
  }
});
io.on("connection", (socket) => socket.emit("refresh"));
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (req, res, next) =>
    req.path.startsWith("/api/")
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
  app.use((req, res, next) =>
    req.path.startsWith("/api/") ? next() : vite.middlewares(req, res, next),
  );
}
errors();
server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(`Delipiña http://localhost:${process.env.PORT || 3000}`),
);
