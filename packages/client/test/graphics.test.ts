/** 3D board (PLAN-W): the probe refuses a browser without WebGL2 or with a software renderer only. */
import { describe, expect, it } from "vitest";
import { detect3d, isSoftwareRenderer } from "../src/graphics";

const UNMASKED = 0x9246;
const RENDERER = 0x1f01;

/** A canvas whose WebGL2 context names its renderer; `caveat`: granted only without failIfMajorPerformanceCaveat. */
function canvases(opts: { webgl2?: boolean; caveat?: boolean; renderer?: string; unmasked?: boolean }) {
  const lost: string[] = [];
  const gl = {
    RENDERER,
    getExtension(name: string) {
      if (name === "WEBGL_debug_renderer_info") return opts.unmasked === false ? null : { UNMASKED_RENDERER_WEBGL: UNMASKED };
      if (name === "WEBGL_lose_context") return { loseContext: () => lost.push("lost") };
      return null;
    },
    getParameter: (p: number) => (p === UNMASKED ? opts.renderer : p === RENDERER ? "WebKit WebGL" : null),
  } as unknown as WebGL2RenderingContext;
  const newCanvas = () => ({
    getContext: (_kind: "webgl2", o?: WebGLContextAttributes) =>
      opts.webgl2 === false || (opts.caveat && o?.failIfMajorPerformanceCaveat) ? null : gl,
  });
  return { newCanvas, lost };
}

describe("3D board probe", () => {
  it("names the software rasterizers, not the GPUs", () => {
    for (const r of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "softpipe",
      "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
    ])
      expect(isSoftwareRenderer(r), r).toBe(true);
    for (const r of [
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      "D3D12 (AMD Radeon RX 6600)", // WSLg
      "Apple M2",
      "Mali-G78",
      "WebKit WebGL",
    ])
      expect(isSoftwareRenderer(r), r).toBe(false);
  });

  it("accepts a GPU, and releases its context", () => {
    const { newCanvas, lost } = canvases({ renderer: "Apple M2" });
    expect(detect3d(newCanvas)).toEqual({ ok: true, renderer: "Apple M2" });
    expect(lost).toEqual(["lost"]);
  });

  it("refuses without WebGL2, or when only a software renderer is there", () => {
    expect(detect3d(canvases({ webgl2: false }).newCanvas)).toEqual({ ok: false, reason: "webgl2" });
    // The browser refuses the context with the caveat flag: software rendering.
    expect(detect3d(canvases({ caveat: true, renderer: "Apple M2" }).newCanvas)).toEqual({ ok: false, reason: "software" });
    // Granted, but named as a software rasterizer.
    expect(detect3d(canvases({ renderer: "llvmpipe (LLVM 15.0.7, 256 bits)" }).newCanvas)).toEqual({
      ok: false,
      reason: "software",
      renderer: "llvmpipe (LLVM 15.0.7, 256 bits)",
    });
  });

  it("without the unmasked name, reads the plain renderer", () => {
    expect(detect3d(canvases({ unmasked: false }).newCanvas)).toEqual({ ok: true, renderer: "WebKit WebGL" });
  });

  it("forced (dev, interface tests): a software renderer is accepted, a missing WebGL2 still refused", () => {
    const swiftshader = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)";
    expect(detect3d(canvases({ caveat: true, renderer: swiftshader }).newCanvas, true)).toEqual({
      ok: true,
      renderer: swiftshader,
    });
    expect(detect3d(canvases({ webgl2: false }).newCanvas, true)).toEqual({ ok: false, reason: "webgl2" });
  });
});
