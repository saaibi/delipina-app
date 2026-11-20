import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = new PGlite("../work/preview-db");
await db.waitReady;
const socket = new PGLiteSocketServer({ db, port: 55438, host: "127.0.0.1" });
await socket.start();
const env = {
  ...process.env,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55438/postgres",
  DATABASE_SCHEMA: "delipina",
  PGLITE_LOCAL: "true",
  NODE_ENV: "development",
  DEV_AUTH: "true",
  LOCAL_PREVIEW_STATIC: "true",
  PORT: "3006",
  APP_ORIGIN: "http://localhost:3006",
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
