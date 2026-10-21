/** Arena of the 3D board (/arena/, tools/arena-assets.ts, PLAN-W): only files of the built folder, cache headers. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/index";

let srv: RunningServer;
let none: RunningServer;
let dir = "";
let base = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mtgx-arena-"));
  const arena = join(dir, "arena");
  mkdirSync(join(arena, "basis"), { recursive: true });
  writeFileSync(join(arena, "manifest.json"), JSON.stringify({ version: 1, models: { jug_01: "jug_01.0123abcd.glb" } }));
  writeFileSync(join(arena, "jug_01.0123abcd.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
  writeFileSync(join(arena, "tabletop.diff.89abcdef.ktx2"), new Uint8Array(12));
  writeFileSync(join(arena, "basis", "basis_transcoder.wasm"), new Uint8Array([0, 0x61, 0x73, 0x6d]));
  writeFileSync(join(dir, "secret.json"), "{}");
  srv = await startServer({ port: 0, host: "127.0.0.1", arenaDir: arena });
  none = await startServer({ port: 0, host: "127.0.0.1", arenaDir: join(dir, "absent") });
  base = `http://127.0.0.1:${srv.port}`;
});
afterAll(async () => {
  await srv.close();
  await none.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("arena of the 3D board", () => {
  it("serves the manifest (never cached), the hashed files (a year) and the transcoder, with their types", async () => {
    const m = await fetch(`${base}/arena/manifest.json`);
    expect([m.status, m.headers.get("content-type"), m.headers.get("cache-control")]).toEqual([
      200,
      "application/json",
      "no-cache",
    ]);
    expect((await m.json()).models.jug_01).toBe("jug_01.0123abcd.glb");
    const glb = await fetch(`${base}/arena/jug_01.0123abcd.glb`);
    expect([glb.status, glb.headers.get("content-type")]).toEqual([200, "model/gltf-binary"]);
    expect(glb.headers.get("cache-control")).toContain("immutable");
    const ktx = await fetch(`${base}/arena/tabletop.diff.89abcdef.ktx2`);
    expect([ktx.status, ktx.headers.get("content-type")]).toEqual([200, "image/ktx2"]);
    const wasm = await fetch(`${base}/arena/basis/basis_transcoder.wasm`);
    expect([wasm.status, wasm.headers.get("content-type"), wasm.headers.get("cache-control")]).toEqual([
      200,
      "application/wasm",
      "no-cache",
    ]);
  });

  it("refuses anything that is not a file of the folder", async () => {
    for (const path of [
      "/arena/absent.0123abcd.glb",
      "/arena/../secret.json",
      "/arena/%2e%2e/secret.json",
      "/arena/basis/../../secret.json",
      "/arena/other/x.glb",
      "/arena/x.png",
      "/arena/",
    ])
      expect((await fetch(`${base}${path}`)).status, path).toBe(404);
    expect((await fetch(`${base}/arena/manifest.json`, { method: "POST" })).status).toBe(405);
  });

  it("without a built folder: an empty manifest, no error (the 3D board draws its plain table)", async () => {
    const m = await fetch(`http://127.0.0.1:${none.port}/arena/manifest.json`);
    expect(m.status).toBe(200);
    expect(await m.json()).toEqual({ version: 0 });
    expect((await fetch(`http://127.0.0.1:${none.port}/arena/jug_01.0123abcd.glb`)).status).toBe(404);
  });
});
