/**
 * The bay's life (PLAN-X X4): koi circling the stage under the surface (kohaku, ogon, shōwa, tanchō; their tails waving,
 * drawn through the water with its tint), fireflies over the banks in summer, moths around the lanterns but in winter.
 * Instanced; the flying things keep to the banks, the water and the walkway's edges, never lingering over the cards.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { Season } from "../diorama";
import { merged, placed } from "./kit";
import { loop } from "./paths";
import { noise, type ShrinePlan } from "./plan";

/**
 * How far from the stage's edge the koi swim (world units): beyond its pillars, short of the torii's legs and between
 * the bridge's pillars.
 */
export const KOI_RING: [number, number] = [0.55, 0.75];

/** The koi's varieties: their body's patches on a white, gold or black skin. */
const VARIETIES: { name: string; skin: string; patches: [string, number][]; metal: number }[] = [
  { name: "kohaku", skin: "#f3efe6", patches: [["#d2401f", 5]], metal: 0 },
  { name: "ogon", skin: "#e8b23c", patches: [], metal: 0.55 },
  {
    name: "showa",
    skin: "#1b1a1c",
    patches: [
      ["#d2401f", 4],
      ["#f3efe6", 3],
    ],
    metal: 0,
  },
  { name: "tancho", skin: "#f4f1ea", patches: [], metal: 0 },
];

function koiSkin(v: (typeof VARIETIES)[number], seed: number): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = v.skin;
  g.fillRect(0, 0, 128, 256);
  // Patches along the body (the canvas's top is the head: textures are flipped), wrapped around it (u).
  for (const [color, n] of v.patches)
    for (let i = 0; i < n; i++) {
      g.fillStyle = color;
      g.beginPath();
      const y = 20 + noise(i * 3.7, seed) * 200;
      g.ellipse(
        32 + noise(i, seed * 2) * 64,
        y,
        22 + noise(i, seed) * 30,
        16 + noise(seed, i) * 26,
        noise(i, i) * 3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  // The tanchō's red crown on the head.
  if (v.name === "tancho") {
    g.fillStyle = "#d8361c";
    g.beginPath();
    g.ellipse(32, 30, 24, 14, 0, 0, Math.PI * 2);
    g.fill();
  }
  // The fins' strip, at the very top (v near 1): pale.
  g.fillStyle = v.name === "ogon" ? "#f0c869" : "#ece4d8";
  g.fillRect(0, 0, 128, 7);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A koi along +x (head forward), 0.36 long: a lathe body flattened, its fins spread flat (seen from above). */
function koiGeometry(): BufferGeometry {
  const profile: Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // From the tail (t = 0) to the snout (t = 1): thin, then full behind the head, rounded at the snout.
    const r = 0.052 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8 * (0.35 + 0.65 * t) + 0.004;
    profile.push(new Vector2(r, -0.18 + 0.36 * t));
  }
  const body = new LatheGeometry(profile, 12);
  body.rotateZ(-Math.PI / 2);
  body.scale(1, 0.7, 1);
  // UVs: v along the body from the tail (0) to the snout (0.95), below the fins' strip.
  const uv = body.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.95);
  const fin = (points: [number, number][]) => {
    const g = new BufferGeometry();
    const pos: number[] = [];
    for (let i = 1; i < points.length - 1; i++)
      for (const p of [points[0], points[i], points[i + 1]] as [number, number][]) pos.push(p[0], 0, p[1]);
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute(
      "normal",
      new Float32BufferAttribute(
        pos.map((_, k) => (k % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    g.setAttribute("uv", new Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0.5, 0.985]).flat(), 2));
    return g;
  };
  return merged([
    body,
    // The tail, a fan; the pectoral fins behind the head.
    fin([
      [-0.16, 0],
      [-0.27, -0.065],
      [-0.25, 0],
      [-0.27, 0.065],
    ]),
    placed(
      fin([
        [0.05, 0.03],
        [-0.01, 0.085],
        [0.02, 0.03],
      ]),
      [0, -0.005, 0],
    ),
    placed(
      fin([
        [0.05, -0.03],
        [0.02, -0.03],
        [-0.01, -0.085],
      ]),
      [0, -0.005, 0],
    ),
  ]);
}

/** A soft round glow. */
function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.2, "rgba(255,255,255,0.7)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export interface Life {
  group: Group;
  update(time: number, waterY: number): void;
  dispose(): void;
}

export function createLife(o: {
  plan: ShrinePlan;
  season: Season;
  camera: PerspectiveCamera;
  /** Where the lanterns glow (the moths circle them). */
  lights: Vector3[];
  /** Counts at this quality (a share of the most). */
  amount: number;
  /** The water's deep color (the koi are tinted by it). */
  deep: Color;
}): Life {
  const { plan, camera } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  const s = new Vector3();
  const UP = new Vector3(0, 1, 0);
  const X = new Vector3(1, 0, 0);
  const tilt = new Quaternion();
  const turn = new Quaternion();
  const side = new Vector3();
  const at = new Vector3();
  const c = new Color();

  // Koi: each on a loop around the stage, at its own distance (between the stage's pillars and the torii's legs), speed
  // and direction, wandering a little off it.
  const geometry = koiGeometry();
  owned.push(geometry);
  const time = { value: 0 };
  const perVariety = Math.max(1, Math.round(3 * o.amount));
  const koi: { mesh: InstancedMesh; fish: { offset: number; speed: number; start: number; depth: number; phase: number }[] }[] =
    VARIETIES.map((variety, vi) => {
      const map = koiSkin(variety, vi + 1);
      const material = new MeshStandardMaterial({
        map,
        roughness: 0.35,
        metalness: variety.metal,
        transparent: true,
        opacity: 0.82,
        side: DoubleSide,
        // At night they are pale shapes under the water: a little light of their own.
        emissive: new Color(variety.skin).multiplyScalar(0.12),
      });
      material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        shader.uniforms.uTime = time;
        shader.uniforms.uDeep = { value: o.deep };
        shader.vertexShader = `uniform float uTime;\nattribute float aPhase;\n${shader.vertexShader.replace(
          "#include <begin_vertex>",
          // The tail sweeps from side to side, more towards its end.
          "#include <begin_vertex>\nfloat kBack = clamp((0.06 - transformed.x) / 0.33, 0.0, 1.0);\ntransformed.z += sin(uTime * 6.0 + aPhase - transformed.x * 16.0) * 0.035 * kBack * kBack;",
        )}`;
        shader.fragmentShader = `uniform vec3 uDeep;\n${shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          "outgoingLight = mix(outgoingLight, uDeep, 0.32);\n#include <opaque_fragment>",
        )}`;
      };
      const phases = new Float32Array(perVariety);
      // Each variety its own copy of the body, for its fish's phases.
      const body = geometry.clone();
      body.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
      const mesh = new InstancedMesh(body, material, perVariety);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      const fish = Array.from({ length: perVariety }, (_, i) => {
        const k = vi * 7 + i * 3;
        phases[i] = noise(k, 2) * 20;
        return {
          offset: KOI_RING[0] + noise(k, 5) * (KOI_RING[1] - KOI_RING[0]),
          speed: (0.12 + noise(k, 9) * 0.12) * (noise(k, 13) < 0.5 ? 1 : -1),
          start: noise(k, 17) * 100,
          depth: 0.1 + noise(k, 19) * 0.1,
          phase: phases[i] as number,
        };
      });
      // After the water (it draws without depth): seen through it.
      mesh.renderOrder = 0;
      mesh.frustumCulled = false;
      owned.push(map, material, body, mesh);
      group.add(mesh);
      return { mesh, fish };
    });
  const loops = new Map<number, ReturnType<typeof loop>>();
  const loopAt = (offset: number) => {
    const key = Math.round(offset * 100);
    let l = loops.get(key);
    if (!l) {
      l = loop(plan.stage, offset, 0.9);
      loops.set(key, l);
    }
    return l;
  };

  // Fireflies (summer): over the banks and the water near them, blinking slowly; a few along the walkway's edges.
  const glow = glowTexture();
  owned.push(glow);
  const fireflyCount = o.season === "summer" ? Math.round(70 * o.amount) : 0;
  const quad = new PlaneGeometry(1, 1);
  owned.push(quad);
  const fireflyMat = new MeshBasicMaterial({
    map: glow,
    color: "#d4ff70",
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  owned.push(fireflyMat);
  const fireflies = new InstancedMesh(quad, fireflyMat, Math.max(1, fireflyCount));
  fireflies.count = fireflyCount;
  fireflies.instanceMatrix.setUsage(DynamicDrawUsage);
  fireflies.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, fireflyCount) * 3), 3);
  fireflies.renderOrder = 4;
  fireflies.frustumCulled = false;
  const flies = Array.from({ length: fireflyCount }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const z = plan.stage.z0 - 1.5 + noise(i, 3) * (plan.stage.z1 - plan.stage.z0 + 1.5);
    const walkway = i % 9 === 0;
    const x = walkway
      ? side < 0
        ? plan.stage.x0 + 0.2
        : plan.stage.x1 - 0.2
      : plan.shore(side as -1 | 1, z) + side * (noise(i, 7) * 1.4 - 0.9);
    return { x, z, y: Math.max(plan.level, plan.height(x, z)) + 0.15, phase: noise(i, 11) * 50 };
  });
  owned.push(fireflies);
  group.add(fireflies);

  // Moths around the lanterns (not in winter): fluttering in small loops.
  const mothCount = o.season === "winter" ? 0 : Math.min(o.lights.length, Math.round(12 * o.amount));
  const mothMat = new MeshBasicMaterial({ color: "#d9cfbd", side: DoubleSide, transparent: true, opacity: 0.85 });
  owned.push(mothMat);
  const wing = new PlaneGeometry(0.035, 0.022);
  wing.rotateX(-Math.PI / 2);
  owned.push(wing);
  const moths = new InstancedMesh(wing, mothMat, Math.max(1, mothCount * 2));
  moths.count = mothCount * 2;
  moths.instanceMatrix.setUsage(DynamicDrawUsage);
  moths.frustumCulled = false;
  owned.push(moths);
  group.add(moths);
  const mothAt = Array.from({ length: mothCount }, (_, i) => ({
    light: o.lights[Math.floor((i * o.lights.length) / Math.max(1, mothCount))] as Vector3,
    phase: noise(i, 23) * 40,
    radius: 0.1 + noise(i, 29) * 0.08,
  }));

  return {
    group,
    update(t: number, waterY: number) {
      time.value = t;
      for (const { mesh, fish } of koi) {
        fish.forEach((f, i) => {
          const path = loopAt(f.offset);
          const p = path.at(f.start + f.speed * t);
          // Wandering off the loop, the heading following the drift.
          const wobble = 0.12 * Math.sin(t * 0.37 + f.phase);
          const heading = p.heading + (f.speed < 0 ? Math.PI : 0) + 0.25 * Math.cos(t * 0.37 + f.phase);
          v.set(p.x + Math.sin(p.heading) * wobble, waterY - f.depth, p.z + Math.cos(p.heading) * wobble);
          q.setFromAxisAngle(UP, heading);
          mesh.setMatrixAt(i, m.compose(v, q, s.set(1, 1, 1)));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      flies.forEach((f, i) => {
        const blink = Math.max(0, Math.sin(t * 0.9 + f.phase)) ** 6;
        v.set(
          f.x + 0.4 * Math.sin(t * 0.21 + f.phase),
          f.y + 0.25 + 0.2 * Math.sin(t * 0.43 + f.phase * 2),
          f.z + 0.4 * Math.cos(t * 0.17 + f.phase),
        );
        fireflies.setMatrixAt(i, m.compose(v, camera.quaternion, s.setScalar(0.1 + 0.12 * blink)));
        fireflies.setColorAt(i, c.setScalar(0.15 + 0.85 * blink));
      });
      if (fireflyCount) {
        fireflies.instanceMatrix.needsUpdate = true;
        if (fireflies.instanceColor) fireflies.instanceColor.needsUpdate = true;
      }
      mothAt.forEach((mo, i) => {
        const a = t * 2.6 + mo.phase;
        v.set(
          mo.light.x + Math.cos(a) * mo.radius + 0.03 * Math.sin(t * 17 + mo.phase),
          mo.light.y + 0.05 * Math.sin(t * 3.1 + mo.phase),
          mo.light.z + Math.sin(a) * mo.radius,
        );
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 28 + mo.phase));
        turn.setFromAxisAngle(UP, -a);
        for (const wingSide of [-1, 1]) {
          tilt.setFromAxisAngle(X, wingSide * flap * 1.1);
          at.copy(v).add(side.set(0, 0, wingSide * 0.011).applyQuaternion(turn));
          q.copy(turn).multiply(tilt);
          moths.setMatrixAt(i * 2 + (wingSide + 1) / 2, m.compose(at, q, s.set(1, 1, 1)));
        }
      });
      if (mothCount) moths.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
