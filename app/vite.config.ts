import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Dev-only: serve the repo sample data at /sample-data.json so the app can load
// it in dev mode. In a production build the loader is behind import.meta.env.DEV
// and dead-code-eliminated, so nothing here ships in the bundle.
function sampleDataDevServer(): Plugin {
  const sample = resolve(rootDir, "..", "artifact", "sample-data.json");
  return {
    name: "c360-sample-data-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/sample-data.json", (_req, res) => {
        try {
          res.setHeader("Content-Type", "application/json");
          res.end(readFileSync(sample, "utf8"));
        } catch (e) {
          res.statusCode = 404;
          res.end(String(e));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sampleDataDevServer(), viteSingleFile()],
  build: {
    target: "es2022",
    cssCodeSplit: false,
    sourcemap: false,
    // Everything is inlined — no module preloading, so drop the polyfill helper
    // (it carries an inert fetch() that would otherwise trip the A19 no-network scan).
    modulePreload: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Single chunk, everything inlined — no dynamic-import splitting (A18).
      output: { inlineDynamicImports: true },
    },
  },
});
