// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

// Resolve mdb-reader to its browser build. Its exports map has "node" first
// and "default" (browser) second — Vite/Rollup picks "node" by default and
// pulls in readable-stream/md5.js which crashes in the browser.
const mdbReaderBrowser = fileURLToPath(
  new URL("./node_modules/mdb-reader/lib/browser/index.js", import.meta.url),
);

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [{ find: /^mdb-reader$/, replacement: mdbReaderBrowser }],
    },
    optimizeDeps: {
      // mdb-reader ships separate node/browser builds; force esbuild's prebundle
      // to use the browser entry so we don't pull in readable-stream/md5.js.
      esbuildOptions: { conditions: ["browser", "module", "default"] },
    },
  },
});
