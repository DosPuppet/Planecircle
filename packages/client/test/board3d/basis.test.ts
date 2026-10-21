/**
 * 3D board: the basis transcoder runs under the server's CSP (no `'unsafe-eval'`). three.js's builds its invokers with
 * `new Function`, which the CSP blocks in the KTX2 loader's workers (the arena stopped loading at a third);
 * `tools/basis-transcoder.ts` rewrites them as closures.
 */
import { readFileSync } from "node:fs";
import { encodeToKTX2 } from "ktx2-encoder";
import { describe, expect, it } from "vitest";
import { checkTranscoder, patchTranscoder } from "../../../../tools/basis-transcoder";

const dir = new URL("../../../../node_modules/three/examples/jsm/libs/basis/", import.meta.url);
const js = readFileSync(new URL("basis_transcoder.js", dir), "utf8");
const wasm = readFileSync(new URL("basis_transcoder.wasm", dir));

/** A 16×16 gradient, as the arena tool encodes its color maps (ETC1S) and its normal maps (UASTC). */
const encode = (uastc: boolean) => {
  const data = new Uint8Array(16 * 16 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 256));
  return encodeToKTX2(new Uint8Array(0), {
    isUASTC: uastc,
    imageDecoder: async () => ({ data, width: 16, height: 16 }),
    generateMipmap: true,
    enableDebug: false,
  });
};

describe("basis transcoder under the CSP", () => {
  it("three.js's transcoder needs code built from strings, the patched one does not", async () => {
    const ktx2 = await encode(false);
    await expect(checkTranscoder(js, wasm, ktx2)).rejects.toThrow(/Code generation from strings/);
    const patched = patchTranscoder(js);
    expect(patched).not.toMatch(/new Function|newFunc\(Function/);
    expect(await checkTranscoder(patched, wasm, ktx2)).toEqual({ w: 16, h: 16 });
    expect(await checkTranscoder(patched, wasm, await encode(true))).toEqual({ w: 16, h: 16 });
  }, 60_000);
});
