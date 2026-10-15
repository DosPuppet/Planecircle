/**
 * Animated table (PLAN-V, graphics "full"): a fragment shader behind the board, as on MTG Arena but light. It draws a
 * slow painted noise in the texture's palette, a pool of light at the center and the edges in shadow. Raw WebGL 1, with
 * no library (a few kilobytes), loaded on demand by `Backdrop.tsx`. It renders at half resolution, at most 24 frames per
 * second, and pauses while the tab is hidden. The palette is read from the texture's CSS variables (`--bd-0`, `--bd-1`,
 * `--bd-pool`, styles.css), so the CSS background stays the single source and the still fallback.
 */

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

const FRAGMENT = `precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_pool;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.;
  float a = .5;
  for (int k = 0; k < 4; k++) { v += a * noise(p); p = p * 2.03 + 17.; a *= .5; }
  return v;
}
void main() {
  vec2 p = (gl_FragCoord.xy - .5 * u_res) / u_res.y;
  float t = u_time * .02;
  float n = fbm(p * 2.2 + vec2(t, -.6 * t) + .8 * fbm(p * 1.3 - t));
  vec3 col = mix(u_base, u_mid, smoothstep(.2, .9, n));
  vec2 q = p * vec2(.9, 1.6);
  col += u_pool * .28 * exp(-2.4 * dot(q, q));
  col *= mix(.4, 1., smoothstep(1.2, .3, length(p * vec2(.8, 1.1))));
  col += (hash(gl_FragCoord.xy + fract(u_time)) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

/** Frames per second at most, and share of the screen resolution drawn (scaled up by the browser). */
const FPS = 24;
const SCALE = 0.5;

export interface BackdropHandle {
  /** Reads the palette of the texture shown by `board` (its CSS variables). */
  setPalette(board: Element): void;
  stop(): void;
}

/** "#1b2433" → [r, g, b] in [0, 1]; anything else: black. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m
    ? [Number.parseInt(m[1] ?? "0", 16) / 255, Number.parseInt(m[2] ?? "0", 16) / 255, Number.parseInt(m[3] ?? "0", 16) / 255]
    : [0, 0, 0];
}

/**
 * Starts the animated table in `canvas`; null when WebGL is missing or only in software (`force`: accepted anyway,
 * screenshots in dev mode). `onLost`: the GPU context was lost (the CSS background takes over).
 */
export function startBackdrop(
  canvas: HTMLCanvasElement,
  { force = false, onLost }: { force?: boolean; onLost?: () => void } = {},
): BackdropHandle | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: !force,
  });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  // biome-ignore lint/correctness/useHookAtTopLevel: a WebGL call, not a React hook
  gl.useProgram(prog);
  // One triangle that covers the whole screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const [uRes, uTime, uBase, uMid, uPool] = ["u_res", "u_time", "u_base", "u_mid", "u_pool"].map(u);

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1) * SCALE;
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes ?? null, w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let raf = 0;
  let last = 0;
  const start = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    gl.uniform1f(uTime ?? null, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.classList.add("on");
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  const lost = (e: Event) => {
    e.preventDefault();
    stop();
    onLost?.();
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener("visibilitychange", run);
    canvas.removeEventListener("webglcontextlost", lost);
  };
  document.addEventListener("visibilitychange", run);
  canvas.addEventListener("webglcontextlost", lost);
  run();

  return {
    setPalette(board) {
      const css = getComputedStyle(board);
      gl.uniform3fv(uBase ?? null, rgb(css.getPropertyValue("--bd-0")));
      gl.uniform3fv(uMid ?? null, rgb(css.getPropertyValue("--bd-1")));
      gl.uniform3fv(uPool ?? null, rgb(css.getPropertyValue("--bd-pool")));
    },
    stop,
  };
}
