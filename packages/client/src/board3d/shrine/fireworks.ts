/**
 * Fireworks over the bay (PLAN-X X6, hanabi): a show every `SHOW_EVERY` seconds, rockets rising from the water and
 * bursting into chrysanthemums (kiku) of one color or golden willows (shidare) that trail down. They burst above the
 * far corners, where the camera sees them whole, and over the far bay, seen in the water's reflection (the highest
 * quality); each burst flashes its color over the scene through the sky's light. Every spark's place is a function of
 * the time alone (no state: any frame rate, and `?shrineTime=` shows a given moment). Instanced: one draw call.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  type HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Vector3,
} from "three";
import { noise, type ShrinePlan } from "./plan";

/** A show every this many seconds, the first soon after the board opens. */
export const SHOW_EVERY = 150;
const FIRST = 14;
/** Each burst: its time in the show, its place (left, right, far), its kind. */
const BURSTS: [number, "left" | "right" | "far", "kiku" | "shidare"][] = [
  [0, "left", "kiku"],
  [1.4, "right", "kiku"],
  [2.6, "far", "shidare"],
  [3.9, "left", "shidare"],
  [5.2, "right", "kiku"],
  [6.1, "far", "kiku"],
  [7.5, "left", "kiku"],
  [8.2, "right", "shidare"],
  [10.5, "far", "kiku"],
  [11.2, "left", "kiku"],
  [11.6, "right", "kiku"],
  [13.4, "far", "shidare"],
];
const COLORS = ["#ff5a4a", "#7ee081", "#6fb6ff", "#f6a6ff", "#ffffff", "#ff9f43"];
const GOLD = "#ffcf6a";
const RISE = 1.1;
const SPARKS = 64;
/** Linear drag (per second; a spark launched at speed v goes at most v / DRAG) and gravity on the sparks. */
export const DRAG = 1.6;
const GRAVITY = 0.55;

function sparkTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.6)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** Where a spark launched at `v` from `p0` is after `t` seconds, slowed by the air and falling. */
function flight(p0: Vector3, v: Vector3, t: number, gravity: number, out: Vector3): Vector3 {
  const k = DRAG;
  const e = (1 - Math.exp(-k * t)) / k;
  return out.set(p0.x + v.x * e, p0.y + v.y * e - (gravity / k) * (t - e), p0.z + v.z * e);
}

/**
 * The show's bursts for a plan (pure: the tests check they stay off the battlefields): when, where, what kind, their
 * color and their sparks' launch velocities (`sparks` of them, over a sphere, the same every show).
 */
export function showBursts(plan: ShrinePlan, sparks: number) {
  const cx = (plan.stage.x0 + plan.stage.x1) / 2;
  const hw = (plan.stage.x1 - plan.stage.x0) / 2;
  return BURSTS.map(([at, where, kind], i) => {
    const u = noise(i, 3);
    const w = noise(i, 5);
    const side = where === "left" ? -1 : 1;
    const center =
      where === "far"
        ? new Vector3(cx + (u - 0.5) * hw * 1.2, plan.level + 3 + w, plan.stage.z0 - 2.4 - w)
        : // Low and close beside the far corners: the camera sees nothing much higher (its view's top edge).
          new Vector3(cx + side * (hw + 1.1 + u * 0.5), plan.level + 1.7 + w * 0.5, plan.stage.z0 + 1.6 + noise(i, 7) * 1.4);
    const color = new Color(kind === "shidare" ? GOLD : (COLORS[i % COLORS.length] as string));
    // The sparks' directions: spread over a sphere, the same every show.
    const dirs = Array.from({ length: sparks }, (_, k) => {
      const y = 1 - (2 * (k + 0.5)) / sparks;
      const r = Math.sqrt(1 - y * y);
      const a = k * 2.399963 + i;
      return new Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(
        (kind === "shidare" ? 1.0 : 1.3) * (0.9 + 0.2 * noise(k, i)),
      );
    });
    return { at, center, kind, color, dirs, life: kind === "shidare" ? 3.4 : 2.5 };
  });
}

export interface Fireworks {
  mesh: InstancedMesh;
  /** The flash now (0 to 1) and its color: the sky's light follows it. */
  update(time: number, waterY: number): { flash: number; color: Color };
  dispose(): void;
}

export function createFireworks(o: { plan: ShrinePlan; camera: PerspectiveCamera; amount: number }): Fireworks {
  const { plan, camera } = o;
  const texture = sparkTexture();
  const material = new MeshBasicMaterial({ map: texture, blending: AdditiveBlending, depthWrite: false, transparent: true });
  const geometry = new PlaneGeometry(1, 1);
  const sparks = Math.max(16, Math.round(SPARKS * o.amount));
  // Up to three bursts at once, each spark with its trail of two; the rockets.
  const max = sparks * 3 * 3 + 24;
  const mesh = new InstancedMesh(geometry, material, max);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const bursts = showBursts(plan, sparks);
  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  const launch = new Vector3();
  const c = new Color();
  const white = new Color("#ffffff");
  const flashColor = new Color();
  return {
    mesh,
    update(time: number, waterY: number) {
      let n = 0;
      let flash = 0;
      const show = time - FIRST >= 0 ? (time - FIRST) % SHOW_EVERY : -1;
      for (const b of bursts) {
        const age = show - b.at;
        if (show < 0 || age < 0 || age > RISE + b.life) continue;
        if (age < RISE) {
          // The rocket rising from the water, a short sparkling trail behind it.
          launch.set(b.center.x, waterY, b.center.z);
          for (let k = 0; k < 4 && n < max; k++) {
            const f = Math.max(0, age - k * 0.05) / RISE;
            p.lerpVectors(launch, b.center, 1 - (1 - f) ** 2);
            mesh.setMatrixAt(n, m.compose(p, camera.quaternion, s.setScalar(0.07 - k * 0.012)));
            mesh.setColorAt(n++, c.set(GOLD).multiplyScalar(1 - k * 0.22));
          }
          continue;
        }
        const t = age - RISE;
        const fade = Math.max(0, 1 - t / b.life);
        // The sky's flash: the brightest burst's color.
        const f = Math.exp(-t * 5);
        if (f > flash) {
          flash = f;
          flashColor.copy(b.color);
        }
        // Each spark and two fading points behind it (its trail).
        for (const d of b.dirs) {
          for (let k = 0; k < 3 && n < max; k++) {
            const tk = Math.max(0, t - k * (b.kind === "shidare" ? 0.12 : 0.06));
            flight(b.center, d, tk, b.kind === "shidare" ? GRAVITY * 1.6 : GRAVITY, p);
            const twinkle = b.kind === "kiku" && t > b.life * 0.6 ? 0.5 + 0.5 * Math.sin(time * 40 + n) : 1;
            // White hot at first, then the burst's color.
            const hot = Math.exp(-t * 6);
            mesh.setMatrixAt(n, m.compose(p, camera.quaternion, s.setScalar((0.1 - k * 0.025) * (0.6 + 0.4 * fade))));
            mesh.setColorAt(
              n++,
              c
                .copy(b.color)
                .lerp(white, hot)
                .multiplyScalar(fade * twinkle * (1 - k * 0.3)),
            );
          }
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return { flash, color: flashColor };
    },
    dispose() {
      texture.dispose();
      material.dispose();
      geometry.dispose();
      mesh.dispose();
    },
  };
}

/** Lights the scene's sky with a burst's flash (over its own light at rest). */
export function flashSky(hemi: HemisphereLight, rest: { color: Color; intensity: number }, flash: number, color: Color): void {
  hemi.intensity = rest.intensity + 0.45 * flash;
  hemi.color.copy(rest.color).lerp(color, Math.min(1, flash));
}
