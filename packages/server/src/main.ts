/**
 * Server start-up: `npm run server`.
 * Variables: PORT (8787), HOST (0.0.0.0; 127.0.0.1 behind nginx), MTGX_DECISION_MS, MTGX_GRACE_MS (durations of the
 * timer and of the return delay), MTGX_MAX_ROOMS (most open rooms, 200), MTGX_DATA_DIR (save of the games in progress,
 * `data/rooms` by default; "off" to keep the games in memory only), MTGX_ORIGINS (origins allowed for the WebSocket
 * besides the same host, comma-separated), MTGX_MAX_ROOMS_PER_IP (4), MTGX_MAX_HEAP_MB (heap beyond which no room is
 * created, 384), MTGX_AI_WORKERS (workers of the AI seats, at most 2 by default; 0: no online AI), MTGX_MAX_AI_ROOMS
 * (most open rooms with AI, 12), MTGX_MAX_RSS_MB (process memory beyond which no room with AI is created, 640),
 * MTGX_ART_DIR (custom art served on /art/, prepared by `npm run custom-art`; `data/art` by default).
 * MTGX_ARENA_DIR (arena of the 3D board served on /arena/, built by `tools/arena-assets.ts`; `data/arena` by default).
 */
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index";

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "dist");

const host = process.env.HOST || "0.0.0.0";
const server = await startServer({
  port: num(process.env.PORT) ?? 8787,
  host,
  staticDir,
  artDir: process.env.MTGX_ART_DIR || join(process.cwd(), "data", "art"),
  arenaDir: process.env.MTGX_ARENA_DIR || join(process.cwd(), "data", "arena"),
  ...(num(process.env.MTGX_AI_WORKERS) !== undefined ? { aiWorkers: num(process.env.MTGX_AI_WORKERS) } : {}),
  allowedOrigins: (process.env.MTGX_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  config: {
    ...(num(process.env.MTGX_MAX_ROOMS_PER_IP) ? { maxRoomsPerIp: num(process.env.MTGX_MAX_ROOMS_PER_IP) } : {}),
    ...(num(process.env.MTGX_DECISION_MS) ? { decisionMs: num(process.env.MTGX_DECISION_MS) } : {}),
    ...(num(process.env.MTGX_GRACE_MS) ? { graceMs: num(process.env.MTGX_GRACE_MS) } : {}),
    ...(num(process.env.MTGX_MAX_ROOMS) ? { maxRooms: num(process.env.MTGX_MAX_ROOMS) } : {}),
    ...(num(process.env.MTGX_MAX_HEAP_MB) ? { maxHeapMb: num(process.env.MTGX_MAX_HEAP_MB) } : {}),
    ...(num(process.env.MTGX_MAX_AI_ROOMS) ? { maxAiRooms: num(process.env.MTGX_MAX_AI_ROOMS) } : {}),
    ...(num(process.env.MTGX_MAX_RSS_MB) ? { maxRssMb: num(process.env.MTGX_MAX_RSS_MB) } : {}),
    // Saved games: resumed after a restart (pm2 restart, update).
    ...(process.env.MTGX_DATA_DIR === "off"
      ? {}
      : { dataDir: process.env.MTGX_DATA_DIR || join(process.cwd(), "data", "rooms") }),
  },
});

// Local network addresses, only if the server listens on all interfaces.
const lan = (host === "0.0.0.0" ? Object.values(networkInterfaces()) : [])
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a?.address}:${server.port}`);
console.log(`Planecircle — server online on port ${server.port}`);
console.log(
  `  local: http://${host === "0.0.0.0" ? "localhost" : host}:${server.port}${lan.length ? `\n  network: ${lan.join(", ")}` : ""}`,
);
console.log(`  (client served from packages/client/dist: run "npm run build" after a change)`);

const stop = () => server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
