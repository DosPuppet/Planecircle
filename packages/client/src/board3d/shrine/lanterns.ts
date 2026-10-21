/**
 * The shrine's lanterns (PLAN-X X2): paper lanterns (chōchin) hanging from the railings' posts, their candles
 * flickering, swaying a little, each with a glow and a pool of warm light on the deck; stone lanterns (kasuga-dōrō) on
 * the beaches, their windows lit; floating lanterns (tōrō nagashi) drifting on the bay beyond the far side, bobbing on
 * the waves, their light on the water. Two real lights only (the warm side of the stage); every other glow is an
 * emissive surface, a sprite and a light decal (the bloom does the rest). Instanced: a few draw calls in all.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { ArenaMaterial } from "../assets";
import { tiledMaterial } from "./ground";
import { merged, placed } from "./kit";
import { noise, type ShrinePlan } from "./plan";
import { snowCover } from "./season";
import { RAIL_H, railPosts } from "./stage";

const WARM = new Color("#ffb062");
const UP = new Vector3(0, 1, 0);
/** The real lights' strength (they fall off with the square of the distance). */
const LIGHT = 1.6;

/** A soft round glow (sprites and light decals). */
function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.45)");
  r.addColorStop(0.6, "rgba(255,255,255,0.1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** An emissive material whose glow follows each instance's color (the flicker). */
function glowing(color: string, emissive: Color, intensity: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.85 });
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  return m;
}

export interface Lanterns {
  group: Group;
  update(time: number, waterY: number): void;
  setAnimated(on: boolean): void;
  dispose(): void;
}

interface Hanging {
  /** The lantern's center at rest, and the post it hangs from. */
  x: number;
  y: number;
  z: number;
  post: [number, number];
  phase: number;
}

export function createLanterns(
  plan: ShrinePlan,
  materials: Record<string, ArenaMaterial>,
  lights: [PointLight, PointLight],
  snow = 0,
): Lanterns {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o);
    return o;
  };
  const glow = own(glowTexture());
  const m = new Matrix4();
  const q = new Quaternion();
  const v = new Vector3();
  const one = new Vector3(1, 1, 1);
  const cx = (plan.stage.x0 + plan.stage.x1) / 2;
  const cz = (plan.stage.z0 + plan.stage.z1) / 2;

  // Paper lanterns on every other post of the railings, hanging on the walkway's side of the post.
  const hanging: Hanging[] = railPosts(plan)
    .filter((_, i) => i % 2 === 0)
    .map(([x, z], i) => {
      const inward = new Vector2(cx - x, cz - z).normalize().multiplyScalar(0.16);
      return { x: x + inward.x, y: plan.deck + RAIL_H - 0.15, z: z + inward.y, post: [x, z], phase: i * 1.7 };
    });
  const ribs: Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = 0.088 * Math.sin(Math.PI * (0.1 + 0.8 * t)) * (i % 2 ? 0.965 : 1);
    ribs.push(new Vector2(r, -0.115 + 0.23 * t));
  }
  const paperGeometry = own(new LatheGeometry(ribs, 18));
  const paper = own(glowing("#f1dfbd", WARM, 2.2));
  const paperMesh = new InstancedMesh(paperGeometry, paper, hanging.length);
  const capGeometry = own(
    merged([
      placed(new CylinderGeometry(0.054, 0.062, 0.03, 12), [0, 0.125, 0]),
      placed(new CylinderGeometry(0.062, 0.054, 0.03, 12), [0, -0.125, 0]),
      placed(new CylinderGeometry(0.004, 0.004, 0.1, 4), [0, 0.19, 0]),
    ]),
  );
  const capMat = own(new MeshStandardMaterial({ color: "#151311", roughness: 0.5 }));
  const capMesh = new InstancedMesh(capGeometry, capMat, hanging.length);
  // The bracket from the post's top to the hook.
  const bracket = own(new BoxGeometry(1, 0.025, 0.025));
  const bracketMesh = new InstancedMesh(bracket, capMat, hanging.length);
  hanging.forEach((h, i) => {
    const [px, pz] = h.post;
    q.setFromAxisAngle(UP, Math.atan2(-(h.z - pz), h.x - px));
    const length = Math.hypot(h.x - px, h.z - pz) + 0.03;
    bracketMesh.setMatrixAt(
      i,
      m.compose(v.set((px + h.x) / 2, plan.deck + RAIL_H + 0.03, (pz + h.z) / 2), q, new Vector3(length, 1, 1)),
    );
  });
  for (const mesh of [paperMesh, capMesh]) mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  paperMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(hanging.length * 3).fill(1), 3);
  paperMesh.instanceColor.setUsage(DynamicDrawUsage);
  group.add(paperMesh, capMesh, bracketMesh);

  // Each hanging lantern's glow, and its pool of light on the deck.
  const sprites = hanging.map(() => {
    const s = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: WARM,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
      }),
    );
    s.scale.setScalar(0.7);
    s.renderOrder = 3;
    own(s.material);
    group.add(s);
    return s;
  });
  const pool = own(new PlaneGeometry(1.5, 1.5));
  pool.rotateX(-Math.PI / 2);
  const poolMat = own(
    new MeshBasicMaterial({
      map: glow,
      color: WARM,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.32,
    }),
  );
  const pools = new InstancedMesh(pool, poolMat, hanging.length);
  hanging.forEach((h, i) => {
    pools.setMatrixAt(i, m.makeTranslation(h.x, plan.deck + 0.004, h.z));
  });
  pools.instanceColor = new InstancedBufferAttribute(new Float32Array(hanging.length * 3).fill(1), 3);
  pools.instanceColor.setUsage(DynamicDrawUsage);
  pools.renderOrder = 1;
  group.add(pools);

  // Stone lanterns on both beaches, from the near side to beyond the far one.
  const stone = own(tiledMaterial(materials.stone, 0.8, "#9a968c"));
  snowCover(stone, snow);
  const lanternGeometry = own(
    merged([
      placed(new CylinderGeometry(0.15, 0.17, 0.07, 6), [0, 0.035, 0]),
      placed(new CylinderGeometry(0.11, 0.14, 0.05, 6), [0, 0.095, 0]),
      placed(new CylinderGeometry(0.045, 0.055, 0.28, 12), [0, 0.26, 0]),
      placed(new CylinderGeometry(0.15, 0.085, 0.07, 6), [0, 0.435, 0]),
      placed(new CylinderGeometry(0.095, 0.095, 0.03, 6), [0, 0.485, 0]),
      placed(new CylinderGeometry(0.095, 0.095, 0.03, 6), [0, 0.6, 0]),
      placed(new CylinderGeometry(0.03, 0.08, 0.08, 6), [0, 0.54, 0]),
      placed(new CylinderGeometry(0.035, 0.22, 0.1, 6), [0, 0.665, 0]),
      placed(new CylinderGeometry(0.03, 0.035, 0.035, 8), [0, 0.73, 0]),
      placed(new CylinderGeometry(0.0, 0.035, 0.05, 8), [0, 0.77, 0]),
    ]),
  );
  const windowGeometry = own(new CylinderGeometry(0.085, 0.085, 0.085, 6, 1, true));
  const windowMat = own(glowing("#f6d9a4", WARM, 2.6));
  const stones: [number, number][] = [];
  for (const side of [-1, 1] as const)
    for (const z of [plan.stage.z1 - 1.5, cz + 0.3, plan.stage.z0 + 1.2, plan.stage.z0 - 1.2]) {
      const x = plan.shore(side, z) + side * 0.55;
      stones.push([x, z]);
    }
  const stoneMesh = new InstancedMesh(lanternGeometry, stone, stones.length);
  const windows = new InstancedMesh(windowGeometry, windowMat, stones.length);
  windows.instanceColor = new InstancedBufferAttribute(new Float32Array(stones.length * 3).fill(1), 3);
  windows.instanceColor.setUsage(DynamicDrawUsage);
  const stoneGlows: Sprite[] = [];
  stones.forEach(([x, z], i) => {
    const y = plan.height(x, z) - 0.02;
    q.setFromAxisAngle(UP, noise(x, z) * Math.PI);
    stoneMesh.setMatrixAt(i, m.compose(v.set(x, y, z), q, one));
    windows.setMatrixAt(i, m.compose(v.set(x, y + 0.54, z), q, one));
    const s = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: WARM,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.5,
      }),
    );
    s.position.set(x, y + 0.54, z);
    s.scale.setScalar(0.65);
    s.renderOrder = 3;
    own(s.material);
    stoneGlows.push(s);
  });
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  group.add(stoneMesh, windows, ...stoneGlows);

  // Floating lanterns on the bay beyond the far side.
  const floats = Array.from({ length: 12 }, (_, i) => ({
    x0: plan.stage.x0 - 4 + ((plan.stage.x1 - plan.stage.x0 + 8) * (i + noise(i, 3) * 0.6)) / 12,
    z: plan.stage.z0 - 0.75 - 1.6 * noise(i * 1.3, 7),
    speed: 0.05 + 0.04 * noise(i, 11),
    phase: i * 2.1,
  }));
  const floatBase = own(new BoxGeometry(0.15, 0.025, 0.15));
  const floatPaper = own(new BoxGeometry(0.12, 0.11, 0.12));
  floatPaper.translate(0, 0.07, 0);
  const wood = own(new MeshStandardMaterial({ color: "#3b2a1c", roughness: 0.8 }));
  const floatPaperMat = own(glowing("#f6dcae", WARM, 2.0));
  const floatBases = new InstancedMesh(floatBase, wood, floats.length);
  const floatPapers = new InstancedMesh(floatPaper, floatPaperMat, floats.length);
  floatPapers.instanceColor = new InstancedBufferAttribute(new Float32Array(floats.length * 3).fill(1), 3);
  for (const mesh of [floatBases, floatPapers]) mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const floatGlows = floats.map(() => {
    const s = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: WARM,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.5,
      }),
    );
    s.scale.setScalar(0.55);
    s.renderOrder = 3;
    own(s.material);
    return s;
  });
  // Their light on the water: a decal stretched towards the viewer, as a reflection is.
  const sheen = own(new PlaneGeometry(0.45, 1.1));
  sheen.rotateX(-Math.PI / 2);
  const sheenMat = own(
    new MeshBasicMaterial({
      map: glow,
      color: WARM,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.28,
    }),
  );
  const sheens = new InstancedMesh(sheen, sheenMat, floats.length);
  sheens.instanceMatrix.setUsage(DynamicDrawUsage);
  sheens.renderOrder = 1;
  group.add(floatBases, floatPapers, sheens, ...floatGlows);

  // The two real lights: warm, over the middle of each side's walkway.
  lights[0].position.set(plan.stage.x0 + 0.4, plan.deck + 0.55, cz);
  lights[1].position.set(plan.stage.x1 - 0.4, plan.deck + 0.55, cz);

  let animated = true;
  const flame = (t: number, phase: number) =>
    0.82 + 0.1 * Math.sin(t * 7.3 + phase) + 0.08 * Math.sin(t * 13.1 + phase * 2.3) * Math.sin(t * 2.9 + phase);
  const color = new Color();
  const offset = new Vector3();
  const axis = new Vector3();
  const tiltAxis = new Vector3(1, 0, 0.4).normalize();
  const update = (time: number, waterY: number) => {
    const t = animated ? time : 0;
    hanging.forEach((h, i) => {
      // A slow sway from the hook, a little more in the gusts.
      const sway = 0.06 * Math.sin(t * 1.1 + h.phase) * (0.6 + 0.4 * Math.sin(t * 0.23 + h.phase));
      q.setFromAxisAngle(axis.set(Math.cos(h.phase), 0, Math.sin(h.phase)), sway);
      const hook = plan.deck + RAIL_H + 0.03;
      offset.set(0, h.y - hook, 0).applyQuaternion(q);
      m.compose(v.set(h.x + offset.x, hook + offset.y, h.z + offset.z), q, one);
      paperMesh.setMatrixAt(i, m);
      capMesh.setMatrixAt(i, m);
      const f = flame(t, h.phase);
      paperMesh.setColorAt(i, color.setScalar(f));
      pools.setColorAt(i, color.setScalar(f));
      const s = sprites[i] as Sprite;
      s.position.set(h.x + offset.x, hook + offset.y, h.z + offset.z);
      s.material.opacity = 0.5 * f;
    });
    paperMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    if (paperMesh.instanceColor) paperMesh.instanceColor.needsUpdate = true;
    if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
    stones.forEach((_, i) => {
      windows.setColorAt(i, color.setScalar(flame(t, i * 3.1)));
    });
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    const span = plan.stage.x1 - plan.stage.x0 + 8;
    floats.forEach((f, i) => {
      const x = plan.stage.x0 - 4 + ((((f.x0 - plan.stage.x0 + 4 + f.speed * t) % span) + span) % span);
      const bob = 0.015 * Math.sin(t * 1.3 + f.phase);
      const tilt = 0.08 * Math.sin(t * 0.9 + f.phase);
      q.setFromAxisAngle(tiltAxis, tilt);
      m.compose(v.set(x, waterY + bob, f.z), q, one);
      floatBases.setMatrixAt(i, m);
      floatPapers.setMatrixAt(i, m);
      floatPapers.setColorAt(i, color.setScalar(flame(t, f.phase)));
      sheens.setMatrixAt(i, m.makeTranslation(x, waterY + 0.01, f.z + 0.45));
      (floatGlows[i] as Sprite).position.set(x, waterY + bob + 0.08, f.z);
    });
    floatBases.instanceMatrix.needsUpdate = true;
    floatPapers.instanceMatrix.needsUpdate = true;
    if (floatPapers.instanceColor) floatPapers.instanceColor.needsUpdate = true;
    sheens.instanceMatrix.needsUpdate = true;
    lights[0].intensity = LIGHT * flame(t, 0.4);
    lights[1].intensity = LIGHT * flame(t, 2.2);
  };
  update(0, plan.level);
  return {
    group,
    update,
    setAnimated(on: boolean) {
      animated = on;
    },
    dispose() {
      for (const o of owned) o.dispose();
      for (const mesh of [paperMesh, capMesh, bracketMesh, pools, stoneMesh, windows, floatBases, floatPapers, sheens])
        mesh.dispose();
    },
  };
}

/**
 * One of the two real lights: warm, a short reach, no shadows. Created with the diorama, not with its layout (a light
 * added or removed would compile every material again).
 */
export function lanternLight(): PointLight {
  return new PointLight(WARM, LIGHT, 7, 2);
}
