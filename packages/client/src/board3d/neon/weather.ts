/**
 * The neon city's weather (PLAN-Y): rain falling through the neon, pushed by a gusting wind (thin streaks, few over the battlefields: the
 * cards stay readable), splashes on the deck's walkway and the roof, steam rising from the vents, lit by the city.
 * Every drop's place a function of the time (no state). Instanced and additive.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";

/** Uniform in [0, 1) (a smooth noise would bunch the drops in the middle: over the table). */
function hash(i: number, j: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

import type { NeonPlan } from "./plan";

/** Share of the drops allowed to fall over the battlefields. */
export const RAIN_OVER_TABLE = 0.05;

function softTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.8)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/**
 * The wind (world units a second, along x and z) at a place and a time: a steady breeze across the city, slow swells,
 * and gusts that sweep over the roofs (their strength varies from place to place).
 */
export function wind(x: number, z: number, t: number): [number, number] {
  const swell = Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.07 + 1.3) * 0.4;
  const gust = Math.max(0, Math.sin(t * 0.9 - x * 0.35 + z * 0.12) * Math.sin(t * 0.37 + z * 0.21)) ** 2;
  return [0.6 + 0.5 * swell + 1.6 * gust, 0.25 * Math.sin(t * 0.5 + x * 0.2) + 0.6 * gust * Math.sin(t * 1.7)];
}

export interface Weather {
  group: Group;
  update(time: number, tint: Color): void;
  dispose(): void;
}

export function createWeather(o: { plan: NeonPlan; camera: PerspectiveCamera; vents: Vector3[]; amount: number }): Weather {
  const { plan, camera } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const { roof, rim, deck } = plan;
  const area = { x0: roof.x0 - 4, x1: roof.x1 + 4, z0: roof.z0 - 4, z1: roof.z1 + 1 };
  // Each drop's column: mostly outside the battlefields.
  const drops = Math.round(700 * o.amount);
  const columns = Array.from({ length: drops }, (_, i) => {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 6; k++) {
      x = area.x0 + hash(i * 1.7, k * 3.1) * (area.x1 - area.x0);
      z = area.z0 + hash(i * 2.3, k * 5.7) * (area.z1 - area.z0);
      // Over the table, and on its near side too: drops falling there cross the battlefields on screen.
      const over = x > rim.x0 - 0.5 && x < rim.x1 + 0.5 && z > rim.z0 - 1;
      if (!over || hash(i, k + 40) < RAIN_OVER_TABLE) break;
    }
    // Over the roof the rain ends on it; beyond, it falls on into the canyon.
    const onRoof = x > roof.x0 && x < roof.x1 && z > roof.z0 && z < roof.z1;
    return { x, z, floor: onRoof ? deck : deck - 6, phase: hash(i, 77), speed: 7 + 3 * hash(i, 91) };
  });
  const rain = new InstancedMesh(
    own(new PlaneGeometry(0.012, 0.32)),
    own(
      new MeshBasicMaterial({
        color: "#9fb4d6",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    ),
    Math.max(1, drops),
  );
  rain.count = drops;
  rain.instanceMatrix.setUsage(DynamicDrawUsage);
  rain.frustumCulled = false;
  rain.renderOrder = 4;
  own(rain);
  // Splashes: rings on the walkway and the roof (never on the mats).
  const soft = own(softTexture());
  const splashes = Math.round(60 * o.amount);
  const splashAt = Array.from({ length: splashes }, (_, i) => {
    const side = i % 4;
    const u = hash(i, 3);
    const v = hash(i, 7);
    const x =
      side === 0
        ? roof.x0 + u * (rim.x0 - roof.x0)
        : side === 1
          ? rim.x1 + u * (roof.x1 - rim.x1)
          : roof.x0 + u * (roof.x1 - roof.x0);
    const z =
      side === 2
        ? roof.z0 + v * (rim.z0 - roof.z0)
        : side === 3
          ? rim.z1 + v * (roof.z1 - rim.z1)
          : roof.z0 + v * (roof.z1 - roof.z0);
    return new Vector3(x, deck + 0.006, z);
  });
  const splashMesh = new InstancedMesh(
    own(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    own(new MeshBasicMaterial({ map: soft, color: "#b8c8e8", transparent: true, depthWrite: false, blending: AdditiveBlending })),
    Math.max(1, splashes),
  );
  splashMesh.count = splashes;
  splashMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  splashMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, splashes) * 3), 3);
  splashMesh.frustumCulled = false;
  own(splashMesh);
  // Steam from the vents: puffs rising, growing, fading.
  const PUFFS = 6;
  const steam = new InstancedMesh(
    own(new PlaneGeometry(1, 1)),
    own(new MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false })),
    Math.max(1, o.vents.length * PUFFS),
  );
  steam.instanceMatrix.setUsage(DynamicDrawUsage);
  steam.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, o.vents.length * PUFFS) * 3), 3);
  steam.frustumCulled = false;
  steam.renderOrder = 4;
  own(steam);
  group.add(rain, splashMesh, steam);

  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  const q = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const zAxis = new Vector3(0, 0, 1);
  const tilt = new Quaternion();
  const c = new Color();
  const grey = new Color("#7f8796");
  return {
    group,
    update(t: number, tint: Color) {
      // The streaks turned to the viewer around the vertical (a billboard that stays upright), each pushed by the wind
      // as it falls and slanted by its own velocity.
      const turn = Math.atan2(camera.position.x, camera.position.z);
      columns.forEach((col, i) => {
        const span = 6 - (col.floor - deck);
        const fall = ((((t * col.speed) / span + col.phase) % 1) + 1) % 1;
        const y = deck + 6 - fall * span;
        const age = (fall * span) / col.speed;
        const [wx, wz] = wind(col.x, col.z, t);
        p.set(col.x + wx * age, y, col.z + wz * age);
        tilt.setFromAxisAngle(zAxis, Math.atan2(wx, col.speed) * 1.4);
        q.setFromAxisAngle(yAxis, turn).multiply(tilt);
        rain.setMatrixAt(i, m.compose(p, q, s.set(1, 1, 1)));
      });
      rain.instanceMatrix.needsUpdate = true;
      splashAt.forEach((at, i) => {
        const age = (t * 1.6 + hash(i, 13)) % 1;
        splashMesh.setMatrixAt(i, m.compose(at, q.identity(), s.setScalar(0.05 + 0.18 * age)));
        splashMesh.setColorAt(i, c.setScalar(0.5 * (1 - age)));
      });
      splashMesh.instanceMatrix.needsUpdate = true;
      if (splashMesh.instanceColor) splashMesh.instanceColor.needsUpdate = true;
      o.vents.forEach((v, i) => {
        for (let k = 0; k < PUFFS; k++) {
          const age = (((t * 0.35 + k / PUFFS + i * 0.13) % 1) + 1) % 1;
          p.set(v.x + 0.25 * age * Math.sin(t * 0.7 + k), v.y + age * 1.4, v.z + 0.15 * age);
          steam.setMatrixAt(i * PUFFS + k, m.compose(p, camera.quaternion, s.setScalar(0.3 + 0.9 * age)));
          steam.setColorAt(
            i * PUFFS + k,
            c
              .copy(grey)
              .lerp(tint, 0.35)
              .multiplyScalar(0.42 * (1 - age) * Math.min(1, age * 6)),
          );
        }
      });
      steam.instanceMatrix.needsUpdate = true;
      if (steam.instanceColor) steam.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
