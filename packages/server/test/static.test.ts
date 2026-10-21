/** Client files served by the server: compression (brotli, gzip) and cache headers. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/index";

let srv: RunningServer | null = null;
let dir = "";
afterEach(async () => {
  await srv?.close();
  srv = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function get(port: number, path: string, encoding?: string): Promise<{ headers: Record<string, unknown>; body: Buffer }> {
  return new Promise((ok, ko) => {
    const req = request({ port, path, headers: encoding ? { "Accept-Encoding": encoding } : {} }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => ok({ headers: res.headers as Record<string, unknown>, body: Buffer.concat(chunks) }));
    });
    req.on("error", ko);
    req.end();
  });
}

describe("client files", () => {
  it("content security policy (CSP): own-site scripts only (WebAssembly, never eval), Scryfall images, no framing", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Planecircle</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });
    const csp = String((await get(srv.port, "/")).headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob: https://cards.scryfall.io");
    // The 3D board's models: their embedded textures are loaded from blob URLs (fetch, or <img> on older browsers).
    expect(csp).toContain("connect-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    // The 3D board's decoders compile WebAssembly; JavaScript eval stays forbidden.
    expect(csp).not.toMatch(/'unsafe-eval'/);
  });

  it("compressed (brotli, else gzip), cached for one year under /assets/, never for index.html", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    mkdirSync(join(dir, "assets"));
    const js = `export const data = ${JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ carte: `Carte ${i}` })))};`;
    writeFileSync(join(dir, "assets", "index-abc.js"), js);
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Planecircle</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });

    const br = await get(srv.port, "/assets/index-abc.js", "gzip, deflate, br");
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers["cache-control"]).toMatch(/immutable/);
    expect(brotliDecompressSync(br.body).toString()).toBe(js);
    expect(br.body.length).toBeLessThan(js.length / 4);

    const gz = await get(srv.port, "/assets/index-abc.js", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gz.body).toString()).toBe(js);

    // Security headers on the served files.
    expect(br.headers["x-content-type-options"]).toBe("nosniff");
    expect(br.headers["x-frame-options"]).toBe("DENY");

    const plain = await get(srv.port, "/assets/index-abc.js");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.toString()).toBe(js);

    const html = await get(srv.port, "/", "br");
    expect(html.headers["cache-control"]).toBe("no-cache");
  });

  it("a badly encoded URL answers 400 without stopping the server", async () => {
    dir = mkdtempSync(join(tmpdir(), "mtgx-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Planecircle</title>");
    srv = await startServer({ port: 0, host: "127.0.0.1", staticDir: dir });
    expect((await fetch(`http://127.0.0.1:${srv.port}/%`)).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${srv.port}/healthz`)).status).toBe(200);
  });
});
