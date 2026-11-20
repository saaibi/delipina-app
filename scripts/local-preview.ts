import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = new PGlite(
  process.env.PREVIEW_DB_DIR || "../work/preview-routes-db",
);
const previewPort = process.env.PREVIEW_PORT || "3007",
  databasePort = Number(process.env.PREVIEW_DB_PORT || 55439);
await db.waitReady;
const socket = new PGLiteSocketServer({
  db,
  port: databasePort,
  host: "127.0.0.1",
});
await socket.start();
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`,
  DATABASE_SCHEMA: "delipina",
  PGLITE_LOCAL: "true",
  NODE_ENV: "development",
  DEV_AUTH: "true",
  LOCAL_PREVIEW_STATIC: "true",
  PORT: previewPort,
  APP_ORIGIN: `http://localhost:${previewPort}`,
};
async function run(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (n) =>
      n ? reject(Error("Proceso finalizó " + n)) : resolve(),
    );
  });
}
try {
  await run(["--env-file=.env", "--import", "tsx", "server/migrate.ts"]);
  await run(["--env-file=.env", "--import", "tsx", "server/seed.ts"]);
  await run(["--env-file=.env", "--import", "tsx", "scripts/preview-data.ts"]);
  await run(["--env-file=.env", "dist-server/index.js"]);
} finally {
  await socket.stop();
  await db.close();
}
