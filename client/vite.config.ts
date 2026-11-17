import { defineConfig } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    {
      name: "precache-production-assets",
      async writeBundle(options, bundle) {
        const assets = Object.keys(bundle)
          .filter((name) => /\.(js|css)$/.test(name))
          .map((name) => "/" + name);
        const file = path.resolve(options.dir, "sw.js");
        let worker = await fs.readFile(file, "utf8");
        worker = worker
          .replace(
            "const PRECACHE_ASSETS = [];",
            "const PRECACHE_ASSETS = " + JSON.stringify(assets) + ";",
          )
          .replace(
            "delipina-v1",
            "delipina-" +
              createHash("sha256")
                .update(JSON.stringify(assets))
                .digest("hex")
                .slice(0, 12),
          );
        await fs.writeFile(file, worker);
      },
    },
  ],
  build: {
    rolldownOptions: {
      onwarn(warning, handler) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        handler(warning);
      },
    },
  },
});
