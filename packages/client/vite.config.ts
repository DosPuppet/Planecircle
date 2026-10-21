import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Custom card art (tools/custom-art.ts): /art/ served from `MTGX_ART_DIR` or data/art/ at the repository root, as the
 * game server does in production (outside Git, outside the build).
 */
function customArt(): Plugin {
  const dir = process.env.MTGX_ART_DIR || fileURLToPath(new URL("../../data/art", import.meta.url));
  return {
    name: "mtgx-custom-art",
    configureServer(server) {
      server.middlewares.use("/art", (req, res, next) => {
        const m = req.url?.match(/^\/([a-z0-9-]+\.(webp|json))$/);
        const file = m?.[1] ? join(dir, m[1]) : "";
        if (!m || !existsSync(file)) {
          if (m) res.statusCode = 404;
          return m ? res.end() : next();
        }
        res.setHeader("Content-Type", m[2] === "json" ? "application/json" : "image/webp");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(file));
      });
    },
  };
}

/**
 * Arena of the 3D board (PLAN-W, tools/arena-assets.ts): /arena/ served from `MTGX_ARENA_DIR` or data/arena/ at the
 * repository root, as the game server does in production; without it, an empty manifest (the plain table).
 */
function arena(): Plugin {
  const dir = process.env.MTGX_ARENA_DIR || fileURLToPath(new URL("../../data/arena", import.meta.url));
  const TYPES: Record<string, string> = {
    glb: "model/gltf-binary",
    ktx2: "image/ktx2",
    hdr: "image/vnd.radiance",
    json: "application/json",
    js: "text/javascript",
    wasm: "application/wasm",
  };
  return {
    name: "mtgx-arena",
    configureServer(server) {
      server.middlewares.use("/arena", (req, res, next) => {
        const m = req.url?.match(/^\/((?:[a-z]+\/)?[a-z0-9_-]+(?:\.[a-z_]+)?(?:\.[a-f0-9]{8})?\.(glb|ktx2|hdr|json|js|wasm))$/);
        if (!m?.[1] || !m[2]) return next();
        const file = join(dir, m[1]);
        res.setHeader("Content-Type", TYPES[m[2]] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        if (existsSync(file)) return res.end(readFileSync(file));
        if (/(^|\/)manifest\.json$/.test(m[1])) return res.end('{"version":0}\n');
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), customArt(), arena()],
  worker: { format: "es" },
  build: {
    // Card data (6 MB, 1 MB compressed) is a file of its own: a code update does not force a new download of it, and it
    // loads in parallel with the application.
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Cards of the Commander decks (EDH pseudo-set, PLAN-E): a file of their own, outside the budget of the sets;
            // to load on demand once they exceed 1 MB.
            { name: "commander", test: /packages[\\/]cards[\\/]data[\\/]edh\.json/ },
            // French catalogs (PLAN-I), loaded at start-up: French is the default language.
            { name: "locales", test: /packages[\\/]\w+[\\/]locales[\\/]/ },
            // The printings table (deck builder) stays a file of its own, loaded on demand.
            { name: "cards", test: /packages[\\/]cards[\\/]data[\\/](?!printings|edh\.json)/ },
            // QR code reader (jsQR, 250 KB): only when the camera scanner has no native detector (Safari).
            { name: "qrscan", test: /node_modules[\\/]jsqr[\\/]/ },
            // 3D board (PLAN-W): three.js, a file of its own (it changes less often than the board), loaded with the board's
            // lazy chunk (Board3D, from its dynamic import). No group for the board's code: a group takes the
            // dependencies of its modules with it (the whole application). A name without a hyphen: the service worker
            // tells the versions of a chunk apart by the part before the first one.
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  // three.js and its addons prebundled at start-up: discovered later, they would reload the page in the middle of a test.
  // three and the addons the lazy chunks import (a dependency found during a test reloads the page).
  optimizeDeps: { include: ["three", "three/examples/jsm/utils/BufferGeometryUtils.js"] },
  server: {
    port: 5173,
    proxy: {
      // Online play: the /ws WebSocket goes to the game server (npm run server).
      "/ws": { target: "ws://localhost:8787", ws: true },
      // Relay of Scryfall images (done by the server in production, see server/src/index.ts).
      "/scry": {
        target: "https://cards.scryfall.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scry/, ""),
      },
    },
  },
});
