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
  MeshLambertMaterial,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms,
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

/** Paper lanterns the veil glows near, at most. */
const VEIL_LANTERNS = 32;

/**
 * A light veil of mist over the battlefield (the user's wish, X4): one or two thin sheets just above the cards, broken
 * and drifting. A lit material: the moon, the lantern lights, the runes and the spells' flashes show in it; and warm
 * near each paper lantern. Thin enough that the cards stay readable (a tenth of the light at most).
 */
export function createVeil(plan: ShrinePlan, lanterns: Vector3[], sheets: number): Mist {
  const group = new Group();
  const { x0, x1, z0, z1 } = plan.stage;
  const geometry = new PlaneGeometry(x1 - x0 + 1.5, z1 - z0 + 1.5);
  geometry.rotateX(-Math.PI / 2);
  const spots = lanterns.slice(0, VEIL_LANTERNS);
  const time = { value: 0 };
  const layers = [
    { lift: 0.16, strength: 0.13, seed: 3.1, drift: [0.03, 0.012] },
    { lift: 0.5, strength: 0.08, seed: 8.7, drift: [-0.022, 0.018] },
  ];
  const materials = layers.map((layer) => {
    const m = new MeshLambertMaterial({ color: "#c3cfe2", transparent: true, depthWrite: false });
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, {
        uTime: time,
        uSeed: { value: layer.seed },
        uDrift: { value: layer.drift },
        uStrength: { value: layer.strength },
        uStage: { value: new Vector4(x0, z0, x1, z1) },
        // The array at its full length (the unused ones far below, never counted).
        uLanterns: { value: Array.from({ length: VEIL_LANTERNS }, (_, i) => spots[i] ?? new Vector3(0, -100, 0)) },
        uLanternCount: { value: spots.length },
        uWarm: { value: new Color("#ffad5c") },
      });
      shader.vertexShader = `varying vec3 vVeilPos;\n${shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvVeilPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      )}`;
      shader.fragmentShader = `uniform float uTime;
uniform float uSeed;
uniform vec2 uDrift;
uniform float uStrength;
uniform vec4 uStage;
uniform vec3 uLanterns[${VEIL_LANTERNS}];
uniform int uLanternCount;
uniform vec3 uWarm;
varying vec3 vVeilPos;
float vHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vHash(i), vHash(i + vec2(1.0, 0.0)), u.x), mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vNoise(p);
    p = p * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}
${shader.fragmentShader
  .replace(
    "#include <color_fragment>",
    `#include <color_fragment>
  vec2 vp = vVeilPos.xz;
  float vn = vFbm(vp * 0.3 + uDrift * uTime + uSeed) * 0.7 + vFbm(vp * 0.7 - uDrift.yx * uTime * 1.6) * 0.3;
  // Broken: clear in places, a wisp in others; fading out past the stage's edges.
  vec2 vOut = max(vec2(uStage.x - vp.x, uStage.y - vp.y), vec2(vp.x - uStage.z, vp.y - uStage.w));
  diffuseColor.a = smoothstep(0.38, 0.78, vn) * uStrength * (1.0 - smoothstep(-0.2, 0.7, max(vOut.x, vOut.y)));`,
  )
  .replace(
    "#include <opaque_fragment>",
    `// Each paper lantern warms the wisps near it.
  vec3 vWarm = vec3(0.0);
  for (int i = 0; i < ${VEIL_LANTERNS}; i++) {
    if (i >= uLanternCount) break;
    vec3 d = vVeilPos - uLanterns[i];
    vWarm += uWarm / (1.0 + dot(d, d) * 9.0);
  }
  outgoingLight += vWarm * 1.6;
  #include <opaque_fragment>`,
  )}`;
    };
    return m;
  });
  const meshes = layers.map((layer, i) => {
    const mesh = new Mesh(geometry, materials[i]);
    mesh.position.set((x0 + x1) / 2, plan.deck + layer.lift, (z0 + z1) / 2);
    // Over the cards and the water's glints, under the lanterns' glows.
    mesh.renderOrder = 2;
    return mesh;
  });
  group.add(...meshes);
  const veil: Mist = {
    group,
    update(t: number) {
      time.value = t;
    },
    setSheets(n: number) {
      meshes.forEach((m, i) => {
        m.visible = i < n;
      });
    },
    dispose() {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
  };
  veil.setSheets(sheets);
  return veil;
}
