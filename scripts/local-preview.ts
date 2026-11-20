import { createServer } from "node:http";
// All authentication and data stay on the published HTTPS origin.
const origin = "https://delipina-app-z9br.onrender.com";
const server = createServer((_req, res) => {
  res.writeHead(302, { Location: origin + "/", "Cache-Control": "no-store" });
  res.end("Abriendo Delipiña publicada…");
});
server.listen(3007, "127.0.0.1", () =>
  console.log("Delipiña: http://localhost:3007 → " + origin),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
