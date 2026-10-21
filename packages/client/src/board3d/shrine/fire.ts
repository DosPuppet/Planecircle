/**
 * The kagaribi (PLAN-X X6): a shrine's fire basket, on a stone in the water off the stage's far left corner, its light
 * raking across the table as the tavern's fireplace does (the scene's fire light: a point light, its shadows all
 * around, fixed in place so its shadow maps stay; only its strength and color waver). An iron tripod, a cage of bars,
 * burning logs; flames licking up, embers rising on the wind, a glow on the water. None of it casts a shadow: the light
 * sits inside it.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type PointLight,
  Quaternion,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import type { ArenaMaterial } from "../assets";
import { tiledMaterial } from "./ground";
import { merged, placed } from "./kit";
import { noise, type ShrinePlan } from "./plan";

/** The fire's light: its strength at rest and how it falls off (gentler than physical, so it reaches across the table). */
const LIGHT = 9;
const DECAY = 1.5;

/** A tongue of flame: a bright core tapering to a tip. */
function flameTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 96, 2, 32, 90, 34);
  r.addColorStop(0, "rgba(255,255,230,1)");
  r.addColorStop(0.35, "rgba(255,190,90,0.9)");
  r.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = r;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(44, 46, 62, 66, 58, 98);
  g.bezierCurveTo(54, 126, 10, 126, 6, 98);
  g.bezierCurveTo(2, 66, 20, 46, 32, 4);
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
  r.addColorStop(0.3, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export interface Kagaribi {
  group: Group;
  update(time: number, waterY: number): void;
  dispose(): void;
}

/**
 * Where the fire basket stands: in the water off the stage's far left corner (where the camera sees the most around
 * the table), between the torii and the corner, beyond the koi's ring; its light rakes across the table from there.
 */
export function kagaribiSpot(plan: ShrinePlan): { x: number; z: number } {
  return { x: plan.stage.x0 - 1.3, z: plan.torii.z - 2.15 };
}

export function createKagaribi(o: {
  plan: ShrinePlan;
  materials: Record<string, ArenaMaterial>;
  camera: PerspectiveCamera;
  fire: PointLight;
  /** Flames and embers at this quality (a share of the most). */
  amount: number;
}): Kagaribi {
  const { plan, camera, fire } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const { x, z } = kagaribiSpot(plan);
  const seabed = plan.height(x, z);
  // A stone standing out of the water, the tripod on it.
  const top = plan.level + 0.16;
  const stone = own(tiledMaterial(o.materials.stone, 0.8, "#8f8a80"));
  const rock = new Mesh(own(new CylinderGeometry(0.2, 0.26, top - seabed, 9)), stone);
  rock.position.set(x, (top + seabed) / 2, z);
  rock.receiveShadow = true;
  const iron = own(new MeshStandardMaterial({ color: "#1b1a19", roughness: 0.55, metalness: 0.7 }));
  const legs = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2;
    const foot = new Vector3(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
    const head = new Vector3(Math.cos(a) * 0.07, 0.78, Math.sin(a) * 0.07);
    const leg = new CylinderGeometry(0.012, 0.014, foot.distanceTo(head), 6);
    const mid = foot.clone().add(head).multiplyScalar(0.5);
    leg.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), head.clone().sub(foot).normalize()));
    return placed(leg, [mid.x, mid.y, mid.z]);
  });
  const basketY = 0.8;
  const bars = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const bar = new CylinderGeometry(0.007, 0.007, 0.2, 4);
    // Leaning out: the basket opens upwards.
    bar.rotateZ(-0.32);
    bar.rotateY(-a);
    return placed(bar, [Math.cos(a) * 0.13, basketY + 0.1, Math.sin(a) * 0.13]);
  });
  const rings = [
    placed(new TorusGeometry(0.1, 0.01, 4, 16), [0, basketY, 0], [Math.PI / 2, 0, 0]),
    placed(new TorusGeometry(0.165, 0.01, 4, 18), [0, basketY + 0.2, 0], [Math.PI / 2, 0, 0]),
    placed(new TorusGeometry(0.12, 0.009, 4, 16), [0, 0.42, 0], [Math.PI / 2, 0, 0]),
  ];
  const tripod = new Mesh(own(merged([...legs, ...bars, ...rings])), iron);
  tripod.position.set(x, top, z);
  // The logs, glowing.
  const embers = own(new MeshStandardMaterial({ color: "#3a1c0c", emissive: "#ff6a1e", emissiveIntensity: 1.6, roughness: 0.9 }));
  const logs = new Mesh(
    own(
      merged(
        [0, 1, 2, 3].map((i) =>
          placed(
            new CylinderGeometry(0.025, 0.03, 0.24, 6),
            [0, basketY + 0.06 + i * 0.025, 0],
            [Math.PI / 2, (i * Math.PI) / 4, 0.25],
          ),
        ),
      ),
    ),
    embers,
  );
  logs.position.set(x, top, z);
  group.add(rock, tripod, logs);

  // The flames: tongues born at the logs, licking up and shrinking, turned to the viewer.
  const flameTex = own(flameTexture());
  const glow = own(glowTexture());
  const tongues = Math.max(6, Math.round(14 * o.amount));
  const flameMat = own(
    new MeshBasicMaterial({ map: flameTex, blending: AdditiveBlending, depthWrite: false, transparent: true }),
  );
  const flameMesh = new InstancedMesh(own(new PlaneGeometry(1, 2)), flameMat, tongues);
  flameMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  flameMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(tongues * 3), 3);
  flameMesh.frustumCulled = false;
  flameMesh.renderOrder = 6;
  own(flameMesh);
  // Embers rising on the wind.
  const sparks = Math.round(40 * o.amount);
  const sparkMat = own(
    new MeshBasicMaterial({ map: glow, color: "#ffb15a", blending: AdditiveBlending, depthWrite: false, transparent: true }),
  );
  const sparkMesh = new InstancedMesh(own(new PlaneGeometry(1, 1)), sparkMat, Math.max(1, sparks));
  sparkMesh.count = sparks;
  sparkMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  sparkMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, sparks) * 3), 3);
  sparkMesh.frustumCulled = false;
  sparkMesh.renderOrder = 6;
  own(sparkMesh);
  // Its glow around it, and on the water.
  const halo = new Sprite(
    own(new SpriteMaterial({ map: glow, color: "#ff9a40", blending: AdditiveBlending, depthWrite: false, transparent: true })),
  );
  halo.renderOrder = 5;
  const sheen = new Mesh(
    own(new PlaneGeometry(2.6, 2.6)),
    own(new MeshBasicMaterial({ map: glow, color: "#ff8a30", blending: AdditiveBlending, depthWrite: false, transparent: true })),
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.renderOrder = 1;
  group.add(flameMesh, sparkMesh, halo, sheen);

  const basket = new Vector3(x, top + basketY + 0.08, z);
  // The light: just above the logs (the bars below it would shade everything), fixed there.
  fire.position.set(x, top + basketY + 0.3, z);
  fire.decay = DECAY;
  fire.distance = 0;

  const m = new Matrix4();
  const at = new Vector3();
  const size = new Vector3();
  const color = new Color();
  const white = new Color("#fff6d8");
  const deep = new Color("#ff5a14");
  return {
    group,
    update(t: number, waterY: number) {
      // The fire's breath: slow swells, quick flickers.
      const n =
        0.4 * Math.sin(t * 2.3) + 0.3 * Math.sin(t * 5.7 + 1.3) + 0.2 * Math.sin(t * 11.3 + 0.4) + 0.1 * Math.sin(t * 17.9);
      fire.intensity = LIGHT * (0.8 + 0.2 * n);
      fire.color.setRGB(1, 0.5 + 0.08 * n, 0.2 + 0.06 * n);
      embers.emissiveIntensity = 1.4 + 0.4 * n;
      for (let i = 0; i < tongues; i++) {
        const life = 0.55 + 0.35 * noise(i, 3);
        const age = ((t + noise(i, 7) * 5) % life) / life;
        const a = noise(i, 11) * Math.PI * 2;
        const r = 0.07 * noise(i, 13);
        at.set(basket.x + Math.cos(a) * r + 0.03 * Math.sin(t * 9 + i), basket.y + age * 0.32, basket.z + Math.sin(a) * r);
        const s = (0.3 + 0.15 * noise(i, 17)) * (1 - age) ** 0.7 * (0.9 + 0.1 * n);
        flameMesh.setMatrixAt(i, m.compose(at, camera.quaternion, size.set(s * 0.6, s * 0.6, 1)));
        flameMesh.setColorAt(
          i,
          color
            .copy(white)
            .lerp(deep, age)
            .multiplyScalar(1 - age * 0.6),
        );
      }
      flameMesh.instanceMatrix.needsUpdate = true;
      if (flameMesh.instanceColor) flameMesh.instanceColor.needsUpdate = true;
      for (let i = 0; i < sparks; i++) {
        const life = 1.6 + 1.4 * noise(i, 23);
        const age = ((t + noise(i, 29) * 9) % life) / life;
        const rise = age * (1.1 + 0.6 * noise(i, 31));
        at.set(
          basket.x + 0.25 * rise * Math.sin(t * 0.8 + i) + 0.35 * rise,
          basket.y + 0.1 + rise,
          basket.z + 0.2 * rise * Math.cos(t * 1.1 + i * 2),
        );
        const s = 0.035 * (1 - age);
        sparkMesh.setMatrixAt(i, m.compose(at, camera.quaternion, size.set(s, s, 1)));
        sparkMesh.setColorAt(i, color.setScalar((1 - age) * (0.6 + 0.4 * Math.sin(t * 20 + i * 3) ** 2)));
      }
      if (sparks) {
        sparkMesh.instanceMatrix.needsUpdate = true;
        if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
      }
      halo.position.copy(basket).add(at.set(0, 0.12, 0));
      halo.scale.setScalar(1.3 + 0.12 * n);
      halo.material.opacity = 0.55 + 0.1 * n;
      sheen.position.set(x + 0.5, waterY + 0.012, z + 0.3);
      sheen.material.opacity = 0.32 + 0.06 * n;
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
