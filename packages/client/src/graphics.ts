/**
 * Can this device draw the 3D board (PLAN-W)? The player chooses 3D in the Graphics setting; it is refused without
 * WebGL2, or when the browser only has a software renderer (no GPU, or one it refuses to use): the board would crawl.
 * In dev mode, `?board3d=force` accepts a software renderer (headless interface tests, SwiftShader).
 */

import { useSyncExternalStore } from "react";

/** The answer of the probe: why 3D is refused, and the renderer as the browser names it. */
export type Support3d = { ok: true; renderer: string } | { ok: false; reason: "webgl2" | "software"; renderer?: string };

/** Software rasterizers, as WebGL names them (ANGLE SwiftShader, Mesa llvmpipe/softpipe/lavapipe, Windows WARP). */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render/i.test(renderer);
}

/** Dev mode: `?board3d=force` draws the 3D board even on a software renderer. */
export function forced3d(): boolean {
  return !!import.meta.env?.DEV && new URLSearchParams(globalThis.location?.search).get("board3d") === "force";
}

/**
 * A phone in portrait (the width under which the DOM board lays a duel out in portrait, styles.css): the 3D board is not
 * drawn there, the DOM board's portrait layout plays instead.
 */
export const PORTRAIT_PHONE = "(max-width: 600px) and (orientation: portrait)";

/** Does the screen match `query` now, following its changes (a device turned)? */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (changed) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", changed);
      return () => m?.removeEventListener("change", changed);
    },
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}

/** A canvas, or what the probe needs of it (tests). */
type ProbeCanvas = { getContext(kind: "webgl2", options?: WebGLContextAttributes): WebGL2RenderingContext | null };

function context(canvas: ProbeCanvas, options?: WebGLContextAttributes): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", options);
  } catch {
    return null;
  }
}

/**
 * The probe: a WebGL2 context that the browser grants without a "major performance caveat", then the renderer's name
 * (unmasked when the browser gives it). The context is released at once. A canvas takes one set of attributes for good:
 * the second attempt, without the caveat flag, needs a new one.
 */
export function detect3d(newCanvas: () => ProbeCanvas, force = false): Support3d {
  const gl = context(newCanvas(), { failIfMajorPerformanceCaveat: !force });
  if (!gl) return context(newCanvas()) ? { ok: false, reason: "software" } : { ok: false, reason: "webgl2" };
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  if (!force && isSoftwareRenderer(renderer)) return { ok: false, reason: "software", renderer };
  return { ok: true, renderer };
}

/**
 * Can the 3D board be tried here? With a graphics card, yes; on a software renderer too, if the player chooses it
 * (slow: it starts at low quality); without WebGL2, nothing can draw it.
 */
export function canTry3d(s: Support3d): boolean {
  return s.ok || s.reason === "software";
}

let probed: Support3d | undefined;

/** The probe of this page, done once (a WebGL context is not free). */
export function probe3d(): Support3d {
  probed ??= detect3d(() => document.createElement("canvas"), forced3d());
  return probed;
}
