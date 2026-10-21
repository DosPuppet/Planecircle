/**
 * The shrine's yokai (PLAN-X X4). The user's rule: walking ones may go on the stage but never on the mats; flying ones
 * may cross the whole battlefield, but rarely and briefly, so the cards stay readable.
 * - Hitodama: pale blue spirit flames with fading tails, wandering over the water (by the torii, the far bay, the
 *   islet); once every `CROSS_EVERY` seconds one of them rises over the battlefield and comes back, in `CROSS_FOR`.
 * - Kitsune-bi: a procession of fox fires along the far left beach, fading in, passing, fading out.
 * - Chōchin-obake: the one-eyed lantern ghost, its tongue out, hopping along the walkway's middle (never the mats),
 *   stopping to look around.
 * - Kodama: small white tree spirits by the trees, rattling their heads now and then.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from "three";
import { loop } from "./paths";
import { noise, type ShrinePlan, WALK } from "./plan";

/** A hitodama crosses the battlefield once every this many seconds, for this long. */
export const CROSS_EVERY = 80;
export const CROSS_FOR = 9;

/** A flame: a round glowing body, tapering to a tip above. */
function flameTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 92, 2, 32, 92, 30);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.75)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.beginPath();
  g.moveTo(32, 6);
  g.bezierCurveTo(46, 50, 64, 70, 60, 96);
  g.bezierCurveTo(56, 124, 8, 124, 4, 96);
  g.bezierCurveTo(0, 70, 18, 50, 32, 6);
  g.fill();
  return new CanvasTexture(c);
}

function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.5)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Where the hopping lantern is at a time: hops along the walkway, a pause to look around after every eight. */
export function obakeAt(t: number, length: number): { s: number; hop: number; pause: boolean } {
  const HOP = 0.5;
  const STEP = 0.22;
  const HOPS = 8;
  const PAUSE = 2.5;
  const cycle = HOPS * HOP + PAUSE;
  const n = Math.floor(t / cycle);
  const within = t - n * cycle;
  const base = n * HOPS * STEP;
  if (within >= HOPS * HOP) return { s: (base + HOPS * STEP) % length, hop: 0, pause: true };
  const k = Math.floor(within / HOP);
  const f = (within - k * HOP) / HOP;
  return { s: (base + k * STEP + smooth(f) * STEP) % length, hop: Math.sin(Math.PI * f), pause: false };
}

export interface Yokai {
  group: Group;
  update(time: number, waterY: number): void;
  dispose(): void;
}

export function createYokai(o: { plan: ShrinePlan; camera: PerspectiveCamera }): Yokai {
  const { plan, camera } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const cx = (plan.stage.x0 + plan.stage.x1) / 2;
  const cz = (plan.stage.z0 + plan.stage.z1) / 2;

  // Hitodama: a head and a tail of fading sprites along its last positions.
  const flame = own(flameTexture());
  const glow = own(glowTexture());
  const homes = [
    { x: plan.torii.x + 0.15, z: plan.torii.z, r: 0.9 },
    { x: plan.stage.x0 + 2.2, z: plan.stage.z0 - 1.2, r: 1.2 },
    { x: plan.stage.x1 - 2.6, z: plan.stage.z0 - 1.3, r: 1.2 },
    { x: plan.stage.x1 + 0.85, z: plan.islet.z + 2.4, r: 0.8 },
  ];
  const TAIL = 7;
  const flames = homes.map((home, i) => {
    const sprites = Array.from({ length: TAIL + 1 }, (_, k) => {
      const s = new Sprite(
        own(
          new SpriteMaterial({
            map: k === 0 ? flame : glow,
            color: k === 0 ? "#d8ecff" : "#6fb3ff",
            blending: AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: k === 0 ? 0.95 : 0.5 * (1 - k / (TAIL + 1)),
          }),
        ),
      );
      s.renderOrder = 5;
      group.add(s);
      return s;
    });
    return { home, sprites, trail: [] as Vector3[], phase: i * 2.3, last: -1 };
  });
  const homeAt = (h: (typeof homes)[number], t: number, phase: number, waterY: number) =>
    new Vector3(
      h.x + h.r * Math.cos(t * 0.21 + phase) + 0.25 * Math.sin(t * 0.53 + phase),
      waterY + 0.55 + 0.18 * Math.sin(t * 0.7 + phase),
      h.z + h.r * 0.7 * Math.sin(t * 0.17 + phase * 1.3),
    );

  // Kitsune-bi: seven fox fires along the far left beach.
  const procession = Array.from({ length: 7 }, () => {
    const s = new Sprite(
      own(new SpriteMaterial({ map: glow, color: "#ff7426", blending: AdditiveBlending, depthWrite: false, transparent: true })),
    );
    s.scale.setScalar(0.32);
    s.renderOrder = 5;
    group.add(s);
    return s;
  });
  // Along the waterline of the left beach, from beyond the torii towards the far side (where the camera sees it).
  const beach = (u: number) => {
    const z = plan.stage.z0 + 3.6 - 4.4 * u;
    const x = plan.shore(-1, z) - 0.2 - 0.25 * Math.sin(Math.PI * u);
    return new Vector3(x, Math.max(plan.level, plan.height(x, z)) + 0.3, z);
  };

  // Chōchin-obake: a paper lantern, one eye, a mouth, its tongue out; hopping on the walkway's middle.
  const paper = own(new MeshStandardMaterial({ color: "#f2c27e", emissive: "#ff8a2c", emissiveIntensity: 1.5, roughness: 0.85 }));
  const black = own(new MeshStandardMaterial({ color: "#141210", roughness: 0.6 }));
  const white = own(new MeshStandardMaterial({ color: "#f6f2ea", roughness: 0.4 }));
  const red = own(new MeshStandardMaterial({ color: "#c81e2a", roughness: 0.5 }));
  const ribs: Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    ribs.push(new Vector2(0.12 * Math.sin(Math.PI * (0.1 + 0.8 * t)) * (i % 2 ? 0.96 : 1), -0.15 + 0.3 * t));
  }
  const obake = new Group();
  const body = new Mesh(own(new LatheGeometry(ribs, 18)), paper);
  const caps = [0.165, -0.165].map((y) => {
    const m = new Mesh(own(new CylinderGeometry(0.075, 0.08, 0.035, 14)), black);
    m.position.y = y;
    return m;
  });
  const eye = new Mesh(own(new SphereGeometry(0.045, 14, 10)), white);
  eye.position.set(0.1, 0.045, 0);
  const pupil = new Mesh(own(new SphereGeometry(0.02, 10, 8)), black);
  pupil.position.set(0.14, 0.045, 0);
  const mouth = new Mesh(own(new BoxGeometry(0.03, 0.025, 0.12)), black);
  mouth.position.set(0.105, -0.05, 0);
  const tongue = new Mesh(own(new BoxGeometry(0.11, 0.012, 0.045)), red);
  tongue.position.set(0.15, -0.085, 0.015);
  tongue.rotation.z = -0.7;
  obake.add(body, ...caps, eye, pupil, mouth, tongue);
  for (const m of [body, ...caps, eye, pupil, mouth, tongue]) m.castShadow = true;
  // Its light on the deck.
  const pool = new Mesh(
    own(new PlaneGeometry(0.9, 0.9)),
    own(
      new MeshBasicMaterial({
        map: glow,
        color: "#ffad5c",
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.4,
      }),
    ),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 1;
  group.add(obake, pool);
  const walkway = walkwayLoop(plan);

  // Kodama where the camera sees them: on the islet by the bridge's end, on each beach by its leaning trees.
  const ground = (x: number, z: number) => new Vector3(x, Math.max(plan.level, plan.height(x, z)), z);
  const leftZ = plan.stage.z0 + 1.7;
  const rightZ = plan.stage.z0 + 2.5;
  const spots = [
    ground(plan.islet.x - 0.6, plan.islet.z + 0.38),
    ground(plan.shore(-1, leftZ) - 0.15, leftZ),
    ground(plan.shore(1, rightZ) + 0.2, rightZ),
  ];
  const ghost = own(new MeshStandardMaterial({ color: "#eef3ea", emissive: "#a8c8b0", emissiveIntensity: 0.25, roughness: 0.6 }));
  const holes = own(new MeshBasicMaterial({ color: "#0b0c0e" }));
  const kodama = spots.map((spot, i) => {
    const k = new Group();
    const torso = new Mesh(own(new CapsuleGeometry(0.022, 0.045, 4, 10)), ghost);
    torso.position.y = 0.045;
    const head = new Group();
    head.position.y = 0.115;
    const skull = new Mesh(own(new SphereGeometry(0.04, 14, 10)), ghost);
    skull.scale.set(1, 1.15, 1);
    head.add(skull);
    for (const [x, y, r] of [
      [-0.014, 0.012, 0.008],
      [0.014, 0.012, 0.008],
      [0, -0.016, 0.007],
    ] as const) {
      const hole = new Mesh(own(new SphereGeometry(r, 8, 6)), holes);
      hole.position.set(x, y, 0.036);
      head.add(hole);
    }
    k.add(torso, head);
    k.scale.setScalar(1.7);
    k.position.copy(spot);
    group.add(k);
    return { k, head, y: k.position.y, phase: i * 3.1 + noise(i, 1) * 5 };
  });

  const v = new Vector3();
  const update = (t: number, waterY: number) => {
    // Hitodama: at home, but one crossing the battlefield now and then.
    const crossing = Math.floor(t / CROSS_EVERY) % flames.length;
    const u = (t % CROSS_EVERY) / CROSS_FOR;
    flames.forEach((f, i) => {
      const at = homeAt(f.home, t, f.phase, waterY);
      if (i === crossing && u < 1) {
        const w = Math.sin(Math.PI * u);
        const over = new Vector3(cx - (f.home.x - cx) * 0.45, plan.deck + 1.35, cz - (f.home.z - cz) * 0.25);
        at.lerp(over, smooth(w));
      }
      if (t - f.last > 0.05 || f.trail.length === 0) {
        f.trail.unshift(at.clone());
        f.trail.length = Math.min(f.trail.length, TAIL);
        f.last = t;
      }
      const flicker = 0.9 + 0.1 * Math.sin(t * 13 + f.phase);
      (f.sprites[0] as Sprite).position.copy(at);
      (f.sprites[0] as Sprite).scale.set(0.28 * flicker, 0.5 * flicker, 1);
      for (let k = 1; k <= TAIL; k++) {
        const s = f.sprites[k] as Sprite;
        const p = f.trail[Math.min(k, f.trail.length - 1)] ?? at;
        s.position.copy(p);
        s.scale.setScalar(0.24 * (1 - k / (TAIL + 2)));
      }
    });
    // Kitsune-bi: a procession every 50 s, 24 s long.
    const pc = t % 50;
    procession.forEach((s, j) => {
      const uj = (pc / 24) * 1.2 - j * 0.045;
      const shown = uj > 0 && uj < 1;
      s.visible = shown;
      if (!shown) return;
      s.position.copy(beach(uj));
      s.position.y += 0.04 * Math.sin(t * 3 + j);
      const fade = Math.min(1, uj * 8, (1 - uj) * 8);
      s.material.opacity = 0.85 * fade * (0.8 + 0.2 * Math.sin(t * 9 + j * 1.7));
    });
    // The lantern ghost.
    const step = obakeAt(t + 3, walkway.length);
    const p = walkway.at(step.s);
    const look = step.pause ? 0.6 * Math.sin(t * 1.6) : 0;
    obake.position.set(p.x, plan.deck + 0.25 + 0.15 * step.hop, p.z);
    // Its face towards the viewer (seen from above, it would show only its top), turned a little towards its way.
    v.copy(camera.position).sub(obake.position);
    const facing = Math.atan2(-v.z, v.x);
    obake.rotation.y = facing + 0.35 * Math.sin(p.heading - facing) + look;
    const size = 1.35;
    obake.scale.set(size * (1 + 0.08 * step.hop), size * (1 - 0.1 * step.hop), size * (1 + 0.08 * step.hop));
    pool.position.set(p.x, plan.deck + 0.006, p.z);
    paper.emissiveIntensity = 1.4 + 0.2 * Math.sin(t * 11);
    // Kodama: facing the camera, rattling their heads in short bursts.
    for (const kd of kodama) {
      v.copy(camera.position).sub(kd.k.position);
      kd.k.rotation.y = Math.atan2(v.x, v.z);
      const burst = (t + kd.phase) % 7;
      kd.head.rotation.z = burst < 1.2 ? 0.45 * Math.sin(burst * 38) * (1 - burst / 1.2) : 0;
      kd.k.position.y = kd.y + 0.006 * Math.sin(t * 2 + kd.phase);
    }
  };
  return {
    group,
    update,
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}

/**
 * The loop the lantern ghost hops along: the walkway's middle, half a walkway outside the rim (the mats lie inside it)
 * and half inside the stage's edge.
 */
export function walkwayLoop(plan: ShrinePlan): ReturnType<typeof loop> {
  return loop(plan.rim, WALK / 2, 0.3);
}
