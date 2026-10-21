/**
 * What falls on the shrine (PLAN-X X3): sakura petals in spring, momiji leaves in autumn, snow in winter, drifting with
 * the wind, swaying and turning as they fall, gone at the ground or the water and falling again from above. Few over
 * the battlefields (most start outside them): the cards stay readable. Instanced: one draw call; none in Low (a still
 * diorama).
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { ShrinePlan } from "./plan";
import type { SeasonLook } from "./season";

/** Share of the falling things allowed to start over the battlefields. */
export const OVER_TABLE = 0.12;

function sprite(kind: "petal" | "leaf" | "snow"): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#ffffff";
  g.beginPath();
  if (kind === "snow") {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.6, "rgba(255,255,255,0.8)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.arc(32, 32, 30, 0, Math.PI * 2);
  } else if (kind === "petal") {
    // A sakura petal: an oval notched at its tip.
    g.moveTo(32, 60);
    g.bezierCurveTo(4, 44, 10, 8, 26, 6);
    g.lineTo(32, 14);
    g.lineTo(38, 6);
    g.bezierCurveTo(54, 8, 60, 44, 32, 60);
  } else {
    for (let p = 0; p <= 14; p++) {
      const a = (p / 14) * Math.PI * 2 - Math.PI / 2;
      const r = p % 2 ? 11 : 28;
      g.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r);
    }
  }
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface Fall {
  mesh: InstancedMesh;
  update(time: number): void;
  dispose(): void;
}

export function createFall(plan: ShrinePlan, look: NonNullable<SeasonLook["falling"]>, count: number): Fall {
  const texture = sprite(look.kind);
  const material = new MeshStandardMaterial({
    map: texture,
    side: DoubleSide,
    roughness: 0.8,
    ...(look.kind === "snow" ? { transparent: true, depthWrite: false } : { alphaTest: 0.4 }),
  });
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  const { stage, rim } = plan;
  const area = { x0: stage.x0 - 5, x1: stage.x1 + 5, z0: stage.z0 - 4, z1: stage.z1 + 1.5 };
  const size = look.kind === "snow" ? 0.05 : look.kind === "petal" ? 0.07 : 0.11;
  const fall = look.kind === "snow" ? 0.16 : look.kind === "petal" ? 0.22 : 0.3;
  let seed = 17;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const p = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, speed: 0, phase: 0, spin: new Vector3(), born: 0 }));
  const spawn = (i: number, time: number, high: boolean) => {
    const q = p[i] as (typeof p)[number];
    for (let k = 0; k < 8; k++) {
      q.x = area.x0 + rand() * (area.x1 - area.x0);
      q.z = area.z0 + rand() * (area.z1 - area.z0);
      const over = q.x > rim.x0 && q.x < rim.x1 && q.z > rim.z0 && q.z < rim.z1;
      if (!over || rand() < OVER_TABLE) break;
    }
    q.y = high ? 3 + rand() * 1.5 : plan.deck + rand() * 4;
    q.speed = fall * (0.7 + rand() * 0.6);
    q.phase = rand() * 100;
    q.spin.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    q.born = time;
    mesh.setColorAt(i, new Color(look.colors[Math.floor(rand() * look.colors.length)]));
  };
  for (let i = 0; i < count; i++) spawn(i, 0, false);
  const m = new Matrix4();
  const rot = new Quaternion();
  const at = new Vector3();
  const scale = new Vector3();
  let last = 0;
  return {
    mesh,
    update(time: number) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      for (let i = 0; i < count; i++) {
        const q = p[i] as (typeof p)[number];
        q.y -= q.speed * dt;
        // The wind across the bay, a sway of its own.
        q.x += (0.12 + 0.05 * Math.sin(time * 0.3)) * dt;
        const sway = 0.12 * Math.sin(time * 1.4 + q.phase);
        const floor = Math.max(plan.level + 0.02, plan.height(q.x, q.z));
        if (q.y < floor || q.x > area.x1) spawn(i, time, true);
        at.set(q.x + sway, q.y, q.z + 0.06 * Math.cos(time * 1.1 + q.phase));
        rot.setFromAxisAngle(q.spin, time * (look.kind === "snow" ? 0.5 : 2.2) + q.phase);
        scale.setScalar(size * (look.kind === "snow" ? 1 : 0.8 + 0.4 * Math.abs(Math.sin(q.phase))));
        mesh.setMatrixAt(i, m.compose(at, rot, scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      material.dispose();
      geometry.dispose();
      mesh.dispose();
    },
  };
}
