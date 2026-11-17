import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { session, setIO } from "./domain.js";
export function createRealtime(server: HttpServer) {
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
  return io;
}
