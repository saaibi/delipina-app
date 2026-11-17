import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = new PGlite();
await db.waitReady;
const server = new PGLiteSocketServer({ db, port: 55433, host: "127.0.0.1" });
await server.start();
const env = {
  ...process.env,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55433/postgres",
  PGLITE_LOCAL: "true",
  NODE_ENV: "development",
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let code = 0;
try {
  for (const [command, args] of [
    [
      process.execPath,
      ["--env-file=.env", "--import", "tsx", "server/migrate.ts"],
    ],
    [
      process.execPath,
      ["--env-file=.env", "--import", "tsx", "server/seed.ts"],
    ],
    [npm, ["test"]],
  ] as [string, string[]][]) {
    const result = await new Promise<number>((resolve, reject) => {
      const child = spawn(command, args, { stdio: "inherit", env });
      child.once("error", reject);
      child.once("close", (n) => resolve(n || 0));
    });
    if (result) {
      code = result;
      break;
    }
  }
} finally {
  await server.stop();
  await db.close();
}
process.exit(code);
