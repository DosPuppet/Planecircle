/**
 * The bay's water (PLAN-X X1): a grid displaced by Gerstner waves (calmer where the water is shallow), a slow tide that
 * floods and uncovers the beach (the foam line follows it), fine ripples drawn per pixel that break the moon's
 * reflection into a path of glints, dark and opaque where it is deep, clear over the sand (the koi show through).
 * Built on the standard material (lights, fog, shadows and the sky's reflections come with it); at the highest quality,
 * a planar reflection of the diorama (torii, lanterns, banks), never of the cards (their layer is not drawn in it).
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  HalfFloatType,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Plane,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms,
  WebGLRenderTarget,
} from "three";

/** The layer of what the planar reflection draws (the diorama, its sky, the lights). */
export const REFLECT = 5;
const UP = new Vector3(0, 1, 0);

/** Each wave: direction (degrees), wavelength, amplitude, phase speed (world units, seconds). */
const WAVES: [number, number, number, number][] = [
  [200, 6.5, 0.045, 0.55],
  [245, 3.7, 0.03, 0.42],
  [160, 2.3, 0.018, 0.33],
  [290, 1.4, 0.01, 0.26],
];

const vertexHead = /* glsl */ `
uniform float uTime;
uniform float uTide;
uniform vec4 uWave[4];
uniform float uSpeed[4];
attribute float aDepth;
varying float vDepth;
varying vec3 vWaterPos;

vec3 gerstner(vec3 p, out vec3 n) {
  vec3 o = p;
  vec3 tx = vec3(1.0, 0.0, 0.0);
  vec3 tz = vec3(0.0, 0.0, 1.0);
  // Calm in the shallows, the waves die on the beach.
  float calm = smoothstep(0.0, 0.9, aDepth + uTide);
  for (int i = 0; i < 4; i++) {
    vec2 d = uWave[i].xy;
    float k = uWave[i].z;
    float a = uWave[i].w * calm;
    float f = k * (dot(d, p.xz) - uSpeed[i] * uTime);
    float c = cos(f);
    float s = sin(f);
    o.x += d.x * a * c;
    o.z += d.y * a * c;
    o.y += a * s;
    tx += vec3(-d.x * d.x * a * k * s, d.x * a * k * c, -d.x * d.y * a * k * s);
    tz += vec3(-d.x * d.y * a * k * s, d.y * a * k * c, -d.y * d.y * a * k * s);
  }
  o.y += uTide;
  n = normalize(cross(tz, tx));
  return o;
}
`;

const fragmentHead = /* glsl */ `
uniform float uTime;
uniform float uTide;
uniform float uRipple;
uniform float uOpacity;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying float vDepth;
varying vec3 vWaterPos;
#ifdef WATER_PLANAR
uniform sampler2D uReflect;
uniform mat4 uReflectMatrix;
uniform float uReflectStrength;
#endif

float wHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Small ripples: two layers of noise drifting across each other.
float wRipple(vec2 p) {
  return wNoise(p * 2.3 + uTime * vec2(0.21, 0.09)) * 0.6 + wNoise(p * 5.9 - uTime * vec2(0.12, 0.27)) * 0.4;
}
vec2 wSlope(vec2 p) {
  float e = 0.04;
  return vec2(wRipple(p + vec2(e, 0.0)) - wRipple(p - vec2(e, 0.0)), wRipple(p + vec2(0.0, e)) - wRipple(p - vec2(0.0, e))) / (2.0 * e);
}
`;

export interface WaterOptions {
  /** Center and size of the grid (world units). */
  center: { x: number; z: number };
  size: number;
  segments: number;
  /** The water's level at rest. */
  level: number;
  /** The seabed's height (world units) at a point: the water's depth is the level less it. */
  seabed: (x: number, z: number) => number;
  sky: Texture;
}

export interface Water {
  mesh: Mesh;
  /** The tide's current rise over the level at rest (world units). */
  readonly tide: number;
  update(time: number): void;
  /** The planar reflection (highest quality) on or off. */
  setPlanar(on: boolean, scale?: number): void;
  dispose(): void;
}

/** The tide: a slow breath of the bay (a few centimeters at the table's scale), two minutes from high to high. */
export function tideAt(time: number): number {
  return 0.09 * Math.sin((time * 2 * Math.PI) / 120);
}

export function createWater(o: WaterOptions): Water {
  const n = o.segments;
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  const normals = new Float32Array((n + 1) * (n + 1) * 3);
  const depth = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const x = o.center.x + (i / n - 0.5) * o.size;
      const z = o.center.z + (j / n - 0.5) * o.size;
      positions.set([x, o.level, z], k * 3);
      normals.set([0, 1, 0], k * 3);
      depth[k] = o.level - o.seabed(x, z);
    }
  const index = new Uint32Array(n * n * 6);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      index.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], (j * n + i) * 6);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("aDepth", new BufferAttribute(depth, 1));
  geometry.setIndex(new BufferAttribute(index, 1));

  const material = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.06,
    metalness: 0,
    envMap: o.sky,
    envMapIntensity: 1,
    transparent: true,
    depthWrite: true,
  });
  const uniforms = {
    uTime: { value: 0 },
    uTide: { value: 0 },
    uRipple: { value: 0.12 },
    uOpacity: { value: 0.9 },
    uDeep: { value: new Color("#06141f") },
    uShallow: { value: new Color("#1d4a52") },
    uFoam: { value: new Color("#b8c8d8") },
    uWave: {
      value: WAVES.map(([deg, length, amplitude]) => {
        const r = (deg * Math.PI) / 180;
        return new Vector4(Math.cos(r), Math.sin(r), (2 * Math.PI) / length, amplitude);
      }),
    },
    uSpeed: { value: WAVES.map((w) => w[3]) },
    uReflect: { value: null as Texture | null },
    uReflectMatrix: { value: new Matrix4() },
    uReflectStrength: { value: 0.65 },
  };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      vertexHead +
      shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          "vec3 gNormal;\nvec3 gPos = gerstner(position, gNormal);\nvec3 objectNormal = gNormal;",
        )
        .replace(
          "#include <begin_vertex>",
          "vec3 transformed = gPos;\nvDepth = aDepth;\nvWaterPos = (modelMatrix * vec4(gPos, 1.0)).xyz;",
        );
    shader.fragmentShader =
      fragmentHead +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          /* glsl */ `#include <color_fragment>
        float wDepth = vDepth + uTide;
        float wShallow = 1.0 - smoothstep(0.0, 1.3, wDepth);
        diffuseColor.rgb = mix(uDeep, uShallow, wShallow);
        diffuseColor.a = mix(uOpacity, 0.3, wShallow * wShallow);
        // The foam line at the water's edge, broken, drifting.
        float wEdge = 1.0 - smoothstep(0.0, 0.14, wDepth);
        float wFoam = wEdge * smoothstep(0.42, 0.8, wNoise(vWaterPos.xz * 7.0 + uTime * 0.35) + wEdge * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, wFoam * 0.55);
        diffuseColor.a = max(diffuseColor.a, wFoam * 0.75);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          /* glsl */ `#include <normal_fragment_maps>
        vec2 wGrad = wSlope(vWaterPos.xz) * uRipple * smoothstep(0.0, 0.5, vDepth + uTide);
        normal = normalize(normal + (viewMatrix * vec4(-wGrad.x, 0.0, -wGrad.y, 0.0)).xyz);`,
        )
        .replace(
          "#include <opaque_fragment>",
          /* glsl */ `#ifdef WATER_PLANAR
        // The ripples break the mirror (the moon's disc into glints).
        vec4 wProj = uReflectMatrix * vec4(vWaterPos.x - wGrad.x * 0.3, vWaterPos.y, vWaterPos.z - wGrad.y * 0.3, 1.0);
        vec3 wMirror = texture2DProj(uReflect, wProj).rgb;
        float wFacing = max(dot(normalize(vViewPosition), normal), 0.0);
        float wFresnel = 0.02 + 0.98 * pow(1.0 - wFacing, 5.0);
        outgoingLight += wMirror * wFresnel * uReflectStrength;
        #endif
        #include <opaque_fragment>`,
        );
  };
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  // The first of the transparent things (fog, particles, glows are drawn over it).
  mesh.renderOrder = -1;

  // The planar reflection: the camera mirrored in the water's plane, an oblique near plane at the surface.
  let target: WebGLRenderTarget | null = null;
  let scale = 0.5;
  const mirror = new PerspectiveCamera();
  mirror.layers.set(REFLECT);
  const bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const plane = new Plane();
  const clip = new Vector4();
  const q = new Vector4();
  const eye = new Vector3();
  const look = new Vector3();
  const up = new Vector3();
  const rotation = new Matrix4();
  const buffer = new Vector2();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (!target || !(camera as PerspectiveCamera).isPerspectiveCamera) return;
    const cam = camera as PerspectiveCamera;
    renderer.getDrawingBufferSize(buffer);
    const w = Math.max(1, Math.round(buffer.x * scale));
    const h = Math.max(1, Math.round(buffer.y * scale));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    const y = o.level + tide;
    // Mirror the eye and the point it looks at in the plane y = level.
    eye.setFromMatrixPosition(cam.matrixWorld);
    rotation.extractRotation(cam.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    mirror.position.set(eye.x, 2 * y - eye.y, eye.z);
    up.set(0, 1, 0).applyMatrix4(rotation);
    mirror.up.set(up.x, -up.y, up.z);
    mirror.lookAt(look.x, 2 * y - look.y, look.z);
    mirror.far = cam.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(cam.projectionMatrix);
    uniforms.uReflectMatrix.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    // Oblique near plane (Lengyel): nothing under the water is reflected.
    plane.set(UP, -y).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = mirror.projectionMatrix.elements;
    q.set(
      (Math.sign(clip.x) + (p[8] as number)) / (p[0] as number),
      (Math.sign(clip.y) + (p[9] as number)) / (p[5] as number),
      -1,
      (1 + (p[10] as number)) / (p[14] as number),
    );
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1 - 0.003;
    p[14] = clip.w;
    mesh.visible = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    mesh.visible = true;
  };

  let tide = 0;
  return {
    mesh,
    get tide() {
      return tide;
    },
    update(time: number) {
      tide = tideAt(time);
      uniforms.uTime.value = time;
      uniforms.uTide.value = tide;
    },
    setPlanar(on: boolean, s = 0.5) {
      scale = s;
      if (on === !!target) return;
      if (on) {
        target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
        uniforms.uReflect.value = target.texture;
        material.defines = { WATER_PLANAR: "" };
        material.envMapIntensity = 0.7;
      } else {
        target?.dispose();
        target = null;
        uniforms.uReflect.value = null;
        material.defines = {};
        material.envMapIntensity = 1;
      }
      material.needsUpdate = true;
    },
    dispose() {
      target?.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Puts a diorama object (and its children) in the planar reflection. */
export function reflected(o: Object3D): void {
  o.traverse((c) => c.layers.enable(REFLECT));
}
