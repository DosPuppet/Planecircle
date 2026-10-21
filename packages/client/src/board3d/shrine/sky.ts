/**
 * The shrine's night sky (PLAN-X X1): a dome drawn by a shader (deep blue to black, a glow on the horizon, stars, the
 * moon and its halo, a faint band of high mist). The camera looks down at the table and never sees it: the water does,
 * so the dome is baked once into an environment map for the water's reflections (its moon a bright spot that the waves
 * break into a path of glints), and drawn again in the planar reflection at the highest quality.
 */
import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from "three";

/**
 * The moon's direction from the table: over the far left, high enough that its path of glints lies on the water the
 * camera sees beside the stage (the view's reflection there rises at about 45 degrees).
 */
export const MOON_DIR = new Vector3(-0.5, 0.7, -0.52).normalize();

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uMoon;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform float uStars;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Below the horizon: the dark sea far away (what a reflection sees there).
  vec3 col = h < 0.0 ? mix(uHorizon * 0.55, uZenith * 0.4, clamp(-h * 3.0, 0.0, 1.0))
    : mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  // The glow of the horizon, warmer under the moon.
  float m = max(dot(d, uMoon), 0.0);
  col += uGlow * exp(-abs(h) * 9.0) * (0.35 + 0.65 * pow(m, 4.0));
  // High mist: a faint, uneven band.
  float mist = noise(d * 3.0 + vec3(0.0, 0.0, 7.0)) * noise(d * 9.0);
  col += vec3(0.05, 0.065, 0.09) * smoothstep(0.08, 0.6, h) * mist * 0.6;
  // Stars: one cell in many lit, twinkling not (the dome is baked once).
  if (h > 0.02) {
    vec3 cell = floor(d * 160.0);
    float s = hash(cell);
    float lit = smoothstep(0.998, 1.0, s) * smoothstep(0.02, 0.25, h);
    vec3 c = (cell + 0.5) / 160.0;
    float r = length(d - normalize(c));
    col += vec3(0.8, 0.85, 1.0) * lit * uStars * exp(-r * r * 9e4) * (1.0 - 0.8 * mist);
  }
  // The moon: a bright disc, its halo, a wider glow.
  float a = acos(clamp(dot(d, uMoon), -1.0, 1.0));
  col += vec3(1.0, 0.96, 0.86) * 14.0 * smoothstep(0.034, 0.028, a);
  col += vec3(0.55, 0.62, 0.8) * (0.9 * exp(-a * 22.0) + 0.18 * exp(-a * 5.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export interface Sky {
  /** The dome, for the planar reflection (on its reflected layer). */
  dome: Mesh;
  /** The dome baked for reflections (prefiltered): the water's environment. */
  environment: Texture;
  dispose(): void;
}

export function createSky(renderer: WebGLRenderer, o: { zenith: string; horizon: string; glow: string; stars: number }): Sky {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMoon: { value: MOON_DIR.clone() },
      uZenith: { value: new Color(o.zenith) },
      uHorizon: { value: new Color(o.horizon) },
      uGlow: { value: new Color(o.glow) },
      uStars: { value: o.stars },
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new Mesh(new SphereGeometry(400, 48, 24), material);
  dome.frustumCulled = false;
  const bake = new Scene();
  const baked = new Mesh(dome.geometry, material);
  baked.scale.setScalar(0.2);
  bake.add(baked);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(bake, 0, 0.1, 200);
  pmrem.dispose();
  return {
    dome,
    environment: target.texture,
    dispose: () => {
      target.dispose();
      dome.geometry.dispose();
      material.dispose();
    },
  };
}
