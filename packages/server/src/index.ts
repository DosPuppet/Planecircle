/**
 * Online game server: WebSocket on /ws (protocol in protocol.ts) and, if a directory is given, the static files of the
 * client (Vite build) to play on the local network at http://<ip>:<port>.
 * Also relays the Scryfall images on /scry/ for the players whose network blocks cards.scryfall.io.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";
import { msg, RULES_VERSION } from "@mtgx/engine";
import { WebSocket, WebSocketServer } from "ws";
import { AiPool } from "./aiPool";
import { type ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "./protocol";
import { ClientError, DEFAULT_CONFIG, ipKey, type Peer, type Room, type RoomConfig, RoomManager } from "./rooms";
import { cleanSettings, isDecision } from "./validate";

export type { ClientMessage, Clock, RoomInfo, Seat, ServerMessage } from "./protocol";
export { DEFAULT_CONFIG, type RoomConfig } from "./rooms";

export interface ServerOptions {
  port?: number;
  /** Listening address: 0.0.0.0 (local network) or 127.0.0.1 (behind nginx). */
  host?: string;
  /** Simultaneous WebSocket connections per IP address. */
  maxPerIp?: number;
  /** Interval of the WebSocket pings (ms): detects dead connections, avoids idle cut-offs. */
  pingMs?: number;
  /** Message rate per connection: `perSecond` sustained, `burst` in a burst. */
  rate?: { perSecond: number; burst: number };
  /** Origins allowed for the WebSocket besides the same host (MTGX_ORIGINS, comma-separated). */
  allowedOrigins?: string[];
  /** Directory of the built client (packages/client/dist), served as static files. */
  staticDir?: string;
  /**
   * Custom art (`tools/custom-art.ts`), served on /art/: directory prepared outside Git (MTGX_ART_DIR, data/art by
   * default). Absent: no custom art.
   */
  artDir?: string;
  /** Fetch of a Scryfall image for the /scry/ relay (replaceable in the tests). */
  fetchImage?: (url: string) => Promise<Response>;
  config?: Partial<RoomConfig>;
  /**
   * AI workers (AI seats of the rooms, PLAN-E E14): 0 for none; by default, at most two (the VPS is shared). They start
   * only when first needed.
   */
  aiWorkers?: number;
}

export interface RunningServer {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MAX_MESSAGE = 64 * 1024;
/** Messages refused in a row (rate exceeded) before the connection is closed. */
const MAX_DROPPED = 200;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Address of the client. Behind nginx (connection from the machine itself), the one nginx saw: `X-Real-IP`, otherwise
 * the last address of `X-Forwarded-For` (nginx appends it at the end; the first ones are supplied by the client and
 * prove nothing).
 */
export function clientIp(req: IncomingMessage): string {
  const direct = req.socket.remoteAddress ?? "";
  if (!LOOPBACK.has(direct)) return direct;
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",").at(-1)?.trim() || direct;
  return direct;
}

/**
 * Origin of a WebSocket connection: a browser always sends it; a page of another site must not be able to play in the
 * player's place. Accepted: no Origin header (client outside a browser), same host as the request (site served by this
 * server, nginx, Vite proxy in dev), or an origin of the `allowedOrigins` list (MTGX_ORIGINS).
 */
export function originAllowed(req: IncomingMessage, allowed: readonly string[] = []): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Content policy of the application: scripts, worker and data of the site only; inline styles (React) and Google Fonts
 * fonts; images of the site, as `data:` (textures) and from Scryfall; no page can frame it.
 * HSTS is set by nginx (the server itself only speaks HTTP, locally).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://cards.scryfall.io",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Security headers of the served files (the application and its resources). */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function serveStatic(root: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (!root || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(root ? 405 : 404).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.writeHead(400).end(); // badly encoded path ("/%"): not a file
    return;
  }
  let file = normalize(join(root, path));
  // Never outside the served directory.
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // single-page application
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  // Build files named by their hash (/assets/…): immutable, cached for a year. index.html: never cached (it points to
  // the files of the current version).
  const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  const encoding = COMPRESSIBLE.test(type) ? acceptedEncoding(req) : null;
  if (!encoding) {
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": cache });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
    return;
  }
  // Text (JS, CSS, JSON…): compressed once per file and per version, then served from memory
  // (the main bundle goes from 7 MB to 1.5 MB with gzip, less with brotli).
  const body = compressed(file, encoding);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Encoding": encoding,
    Vary: "Accept-Encoding",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg)/;

function acceptedEncoding(req: IncomingMessage): "br" | "gzip" | null {
  const accept = String(req.headers["accept-encoding"] ?? "");
  return /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
}

/** Compressed files in memory, by path, encoding and modification date (a new build replaces them). */
const compressedCache = new Map<string, { mtime: number; body: Buffer }>();

function compressed(file: string, encoding: "br" | "gzip"): Buffer {
  const key = `${encoding}:${file}`;
  const mtime = statSync(file).mtimeMs;
  const hit = compressedCache.get(key);
  if (hit && hit.mtime === mtime) return hit.body;
  const raw = readFileSync(file);
  const body =
    encoding === "br"
      ? brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } })
      : gzipSync(raw, { level: 9 });
  compressedCache.set(key, { mtime, body });
  return body;
}

/**
 * Relay of the Scryfall images: /scry/<path> → https://cards.scryfall.io/<path>. Strict allow-list (only card images,
 * never another host): it is not an open proxy.
 */
export const SCRY_PREFIX = "/scry/";
const SCRY_HOST = "https://cards.scryfall.io";
const SCRY_PATH = /^\/(normal|large|small|art_crop|png|border_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.(jpg|png)$/;
/** The URL of an image changes when Scryfall replaces it (?timestamp): long cache. */
const SCRY_CACHE = "public, max-age=2592000, immutable";
const SCRY_TIMEOUT_MS = 10_000;

const fetchScryfall = (url: string): Promise<Response> =>
  fetch(url, { headers: { "User-Agent": "Planecircle/1.0", Accept: "image/*" }, signal: AbortSignal.timeout(SCRY_TIMEOUT_MS) });

async function relayImage(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImage: (url: string) => Promise<Response>,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname.slice(SCRY_PREFIX.length - 1);
  if (!SCRY_PATH.test(path)) {
    res.writeHead(404).end();
    return;
  }
  let upstream: Response;
  try {
    // Without the query string: a variant (?x=1, ?x=2…) must not make a new request to Scryfall each time.
    upstream = await fetchImage(`${SCRY_HOST}${path}`);
  } catch {
    res.writeHead(502).end();
    return;
  }
  if (!upstream.ok || !upstream.body) {
    res.writeHead(upstream.status === 404 ? 404 : 502).end();
    return;
  }
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
    "Cache-Control": SCRY_CACHE,
  };
  for (const h of ["content-length", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    await upstream.body.cancel();
    return;
  }
  Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream)
    .on("error", () => res.destroy())
    .pipe(res);
}

/**
 * Custom art: /art/<file>.webp and /art/manifest.json, from the directory prepared by `tools/custom-art.ts`. Strict
 * file names (no subdirectory, no other extension). The images carry a hash of their source in their name: long cache;
 * the manifest is never cached.
 */
export const ART_PREFIX = "/art/";
const ART_PATH = /^\/art\/([a-z0-9-]+\.(webp|json))$/;

function serveArt(dir: string | undefined, req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const m = new URL(req.url ?? "/", "http://x").pathname.match(ART_PATH);
  const file = dir && m?.[1] ? join(dir, m[1]) : undefined;
  if (!file || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const json = m?.[2] === "json";
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": json ? "application/json" : "image/webp",
    "Cache-Control": json ? "no-cache" : "public, max-age=31536000, immutable",
    "Content-Length": statSync(file).size,
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

/** Server version: the commit, set at build time (`tools/build-server.ts`); "dev" under tsx. */
const BUILD = process.env.MTGX_BUILD ?? "dev";

/**
 * Server health. A direct local request (no proxy header: pm2, `deploy/update.sh`, monitoring) gets the details as JSON
 * (versions, memory, rooms); a request from elsewhere (through nginx) only gets "ok".
 */
function healthz(req: IncomingMessage, res: ServerResponse, rooms: RoomManager, aiPool?: AiPool): void {
  const local = LOOPBACK.has(req.socket.remoteAddress ?? "") && !req.headers["x-real-ip"] && !req.headers["x-forwarded-for"];
  if (!local) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("ok\n");
    return;
  }
  const m = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1_048_576);
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(
    `${JSON.stringify({
      ok: true,
      build: BUILD,
      protocol: PROTOCOL_VERSION,
      rules: RULES_VERSION,
      rooms: rooms.size,
      memory: { rssMb: mb(m.rss), heapUsedMb: mb(m.heapUsed), heapTotalMb: mb(m.heapTotal) },
      // AI seats: workers, queue and thinking durations (median, 95th percentile, ms).
      ...(aiPool ? { ai: aiPool.stats() } : {}),
      uptimeS: Math.round(process.uptime()),
    })}\n`,
  );
}

function parse(data: WebSocket.RawData): ClientMessage | null {
  try {
    const message = JSON.parse(String(data)) as ClientMessage;
    return message && typeof message === "object" && typeof message.type === "string" ? message : null;
  } catch {
    return null;
  }
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const aiPool = opts.aiWorkers === 0 ? undefined : new AiPool(opts.aiWorkers);
  const rooms = new RoomManager({ ...DEFAULT_CONFIG, ...(aiPool ? { aiPool } : {}), ...opts.config });
  const root = opts.staticDir && existsSync(opts.staticDir) ? resolve(opts.staticDir) : undefined;
  const artDir = opts.artDir && existsSync(opts.artDir) ? resolve(opts.artDir) : undefined;
  const http = createHttpServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      // A request must never stop the server (and all the games in progress).
      console.error("HTTP request failed:", e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/healthz") {
      healthz(req, res, rooms, aiPool);
      return;
    }
    if (req.url?.startsWith(SCRY_PREFIX)) {
      void relayImage(req, res, opts.fetchImage ?? fetchScryfall);
      return;
    }
    if (req.url?.startsWith(ART_PREFIX)) {
      serveArt(artDir, req, res);
      return;
    }
    serveStatic(root, req, res);
  };
  const wss = new WebSocketServer({
    server: http,
    path: "/ws",
    maxPayload: MAX_MESSAGE,
    verifyClient: ({ req }: { req: IncomingMessage }) => originAllowed(req, opts.allowedOrigins),
  });
  const perIp = new Map<string, number>();
  const maxPerIp = opts.maxPerIp ?? 8;
  const rate = opts.rate ?? { perSecond: 20, burst: 40 };
  const alive = new WeakSet<WebSocket>();
  const pinger = setInterval(() => {
    for (const c of wss.clients) {
      if (!alive.has(c)) {
        c.terminate(); // no answer to the previous ping: dead connection
        continue;
      }
      alive.delete(c);
      c.ping();
    }
  }, opts.pingMs ?? 25_000);
  pinger.unref();

  wss.on("connection", (ws, req) => {
    const ip = clientIp(req);
    // Connections counted per IPv4 address, or per /64 prefix in IPv6.
    const key = ipKey(ip);
    const count = (perIp.get(key) ?? 0) + 1;
    if (count > maxPerIp) {
      ws.close(1013, "Too many connections from this address");
      return;
    }
    perIp.set(key, count);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    // Token bucket: each decision costs a copy of the state; a client must not monopolize the server.
    let tokens = rate.burst;
    let refilled = Date.now();
    let dropped = 0;
    const allow = () => {
      const now = Date.now();
      tokens = Math.min(rate.burst, tokens + ((now - refilled) / 1000) * rate.perSecond);
      refilled = now;
      if (tokens >= 1) {
        tokens -= 1;
        dropped = 0;
        return true;
      }
      dropped++;
      return false;
    };
    const peer: Peer = {
      send(message: ServerMessage) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
      },
    };
    let current: { room: Room; seat: ReturnType<RoomManager["create"]>["seat"] } | null = null;
    const fail = (e: unknown) => {
      if (e instanceof ClientError) peer.send({ type: "error", code: e.code, message: e.message });
      else {
        console.error("Server error:", e);
        peer.send({ type: "error", code: "state", message: msg("Internal server error.") });
      }
    };

    ws.on("message", (data) => {
      if (!allow()) {
        if (dropped === 1) peer.send({ type: "error", code: "busy", message: msg("Too many messages: slow down.") });
        if (dropped >= MAX_DROPPED) ws.close(1008, "Too many messages");
        return;
      }
      const message = parse(data);
      if (!message) return;
      try {
        switch (message.type) {
          case "create":
          case "join":
          case "rejoin": {
            if (current) throw new ClientError("state", msg("You are already in a room."));
            if (message.version?.protocol !== PROTOCOL_VERSION || message.version?.rules !== RULES_VERSION)
              throw new ClientError("version", msg("A new version of Planecircle is available: reload the page."));
            if (message.type === "create")
              current = rooms.create(message.name, message.deck, peer, {
                sideboard: message.sideboard,
                bestOf: message.bestOf,
                format: message.format,
                players: message.players,
                commander: message.commander,
                ai: message.ai,
                ip,
              });
            else if (message.type === "join")
              current = rooms.join(message.code, message.name, message.deck, peer, message.sideboard, message.commander);
            else {
              const found = rooms.byToken(message.token);
              if (!found)
                throw new ClientError(
                  "token",
                  rooms.wasInterrupted(message.token)
                    ? msg("Game interrupted by an engine update.")
                    : msg("This game no longer exists."),
                );
              if (found.seat.peer) throw new ClientError("state", msg("This game is already open elsewhere."));
              current = found;
              found.room.reconnect(found.seat, peer);
            }
            return;
          }
          case "leave": {
            if (!current) return;
            const { room, seat } = current;
            current = null;
            room.leave(seat).catch(fail);
            return;
          }
          case "decision":
            if (!current) throw new ClientError("state", msg("No game in progress."));
            if (!isDecision(message.decision)) throw new ClientError("rules", msg("Invalid decision."));
            current.room.decide(current.seat, message.decision).catch(fail);
            return;
          case "settings":
            if (!current) return;
            current.room.settings(current.seat, cleanSettings(message.settings)).catch(fail);
            return;
          case "rematch":
            if (!current) throw new ClientError("state", msg("No game in progress."));
            current.room.rematch(current.seat).catch(fail);
            return;
          case "sideboard":
            if (!current) throw new ClientError("state", msg("No game in progress."));
            current.room.sideboard(current.seat, message.main, message.sideboard).catch(fail);
            return;
          case "export": {
            if (!current) throw new ClientError("state", msg("No game in progress."));
            // The record reveals the decks and the seed: only once the game is over.
            const record = current.room.exportRecord();
            if (!record) throw new ClientError("state", msg("The game is not over: the export will be possible at the end."));
            peer.send({ type: "record", record });
            return;
          }
        }
      } catch (e) {
        fail(e);
      }
    });

    ws.on("close", () => {
      const left = (perIp.get(key) ?? 1) - 1;
      if (left > 0) perIp.set(key, left);
      else perIp.delete(key);
      if (current && current.seat.peer === peer) current.room.disconnect(current.seat);
      current = null;
    });
  });

  return new Promise((ok) => {
    http.listen(opts.port ?? 8787, opts.host ?? "0.0.0.0", () => {
      ok({
        port: (http.address() as AddressInfo).port,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(pinger);
            rooms.closeAll();
            void aiPool?.close();
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
