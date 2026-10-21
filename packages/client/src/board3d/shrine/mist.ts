/**
 * The mist over the bay (PLAN-X X1): sheets of moonlit fog at a few heights over the water, drifting at different
 * speeds, never over the stage (the cards stay clear), thinner where the banks rise through them (a height map of the
 * terrain, baked once, keeps their edges soft), fading in the distance into the night's fog. Three sheets at the
 * highest quality, two in Medium, one still in Low.
 */
import {
  Color,
  DataTexture,
  DataUtils,
  DoubleSide,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector4,
} from "three";
import type { ShrinePlan } from "./plan";

const vertexShader = /* glsl */ `
varying vec3 vPos;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPos = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform vec2 uDrift;
uniform vec4 uStage;
uniform vec4 uExtent;
uniform sampler2D uHeight;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vPos;
#include <fog_pars_fragment>

float mHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float mNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * mNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vPos.xz;
  // Two drifts across each other: the sheet changes shape as it moves.
  float n = fbm(p * 0.11 + uDrift * uTime + uSeed) * 0.65 + fbm(p * 0.23 - uDrift.yx * uTime * 1.7 - uSeed) * 0.35;
  float a = smoothstep(0.3, 0.72, n);
  // Never over the stage: clear within it, thickening over a few units beyond.
  vec2 out2 = max(vec2(uStage.x - p.x, uStage.y - p.y), vec2(p.x - uStage.z, p.y - uStage.w));
  a *= smoothstep(0.4, 3.2, max(out2.x, out2.y));
  // Thinner where the ground comes up to the sheet.
  vec2 uv = (p - uExtent.xy) / (uExtent.zw - uExtent.xy);
  float ground = texture2D(uHeight, uv).r;
  a *= smoothstep(0.0, 0.5, vPos.y - ground);
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <fog_fragment>
}`;

export interface Mist {
  group: Group;
  update(time: number): void;
  setSheets(n: number): void;
  dispose(): void;
}

/** The terrain's heights over `extent` (x0, z0, x1, z1), `size` samples a side, for the mist's soft edges. */
export function heightMap(plan: ShrinePlan, extent: Vector4, size: number): DataTexture {
  // Half floats: filtered linearly on every WebGL2 device (32-bit floats need an extension).
  const data = new Uint16Array(size * size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = extent.x + ((i + 0.5) / size) * (extent.z - extent.x);
      const z = extent.y + ((j + 0.5) / size) * (extent.w - extent.y);
      data[j * size + i] = DataUtils.toHalfFloat(plan.height(x, z));
    }
  const t = new DataTexture(data, size, size, RedFormat, HalfFloatType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Each sheet: height over the water, drift (world units a second), opacity. */
const SHEETS: [number, [number, number], number][] = [
  [0.22, [0.035, 0.012], 0.38],
  [0.55, [-0.02, 0.028], 0.28],
  [0.95, [0.05, -0.018], 0.2],
];

export function createMist(plan: ShrinePlan, color: string): Mist {
  const group = new Group();
  const cx = (plan.stage.x0 + plan.stage.x1) / 2;
  const cz = (plan.stage.z0 + plan.stage.z1) / 2;
  const extent = new Vector4(cx - 45, cz - 50, cx + 45, cz + 30);
  const heights = heightMap(plan, extent, 128);
  const geometry = new PlaneGeometry(extent.z - extent.x, extent.w - extent.y);
  geometry.rotateX(-Math.PI / 2);
  const materials = SHEETS.map(
    ([lift, [dx, dz], opacity], i) =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: i * 13.7 },
          uDrift: { value: [dx, dz] },
          uStage: { value: new Vector4(plan.stage.x0, plan.stage.z0, plan.stage.x1, plan.stage.z1) },
          uExtent: { value: extent },
          uHeight: { value: heights },
          uColor: { value: new Color(color) },
          uOpacity: { value: opacity },
          fogColor: { value: new Color() },
          fogDensity: { value: 0 },
          fogNear: { value: 1 },
          fogFar: { value: 1000 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: true,
        userData: { lift },
      }),
  );
  const meshes = materials.map((material) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set((extent.x + extent.z) / 2, plan.level + (material.userData.lift as number), (extent.y + extent.w) / 2);
    // Over the water and its glints, under the lanterns' glows.
    mesh.renderOrder = 2;
    return mesh;
  });
  group.add(...meshes);
  return {
    group,
    update(time: number) {
      for (const m of materials) (m.uniforms.uTime as { value: number }).value = time;
    },
    setSheets(n: number) {
      meshes.forEach((m, i) => {
        m.visible = i < n;
      });
    },
    dispose() {
      geometry.dispose();
      heights.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
