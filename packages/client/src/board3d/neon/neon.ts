/**
 * The neon city (PLAN-Y): the battlefields on a rooftop helipad over a megacity at night, always moving. Built in code,
 * dressed with the arena's CC0 materials (`tools/arena-assets.json`, arena "neon"); a lazy chunk of its own.
 *
 * The plan (`plan.ts`) lays out the roof and the city around the rim; `city.ts` builds the towers, the roof and the
 * deck; `signs.ts` the neon signs, screens, hologram and beacons; `traffic.ts` the streets' lights, flying cars,
 * drones, searchlights and the maglev; `weather.ts` the rain, the splashes and the steam. The deck is wet: puddles
 * reflect the city (a planar reflection at the highest quality). Its light: a cold glow from above, the sky's light
 * shifting with the ads' colors, and a big magenta sign humming on the left (the scene's fire light, its shadows).
 */
import {
  Color,
  FogExp2,
  Group,
  type Light,
  type MeshStandardMaterial,
  PointLight,
  type Scene,
  Vector2,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { Bounds } from "../arena";
import type { Diorama, DioramaContext } from "../diorama";
import { type PlanarReflection, planarReflection, REFLECT } from "../planar";
import type { Quality } from "../quality";
import { noise } from "../shrine/plan";
import { reflected } from "../shrine/water";
import { type City, createCity } from "./city";
import { type NeonPlan, neonPlan } from "./plan";
import { createSigns, type Signs } from "./signs";
import { hexMat } from "./textures";
import { createTraffic, type Traffic } from "./traffic";
import { createWeather, type Weather } from "./weather";

const DETAIL: Record<Quality, { amount: number }> = {
  high: { amount: 1 },
  medium: { amount: 0.6 },
  low: { amount: 0.4 },
};

/** The big sign's light: its strength and its fall-off. */
const SIGN = 7;
const SIGN_DECAY = 1.6;
/** Screens throwing real light (the nearest the table). */
const SCREEN_LIGHTS = 4;

/**
 * The deck's wet patches: puddles where a noise is high, darker and glossy; the rain's ripples in them (rings born at
 * random, spreading and fading, drawn per pixel into the surface's normal); at the highest quality they mirror the
 * city, the mirror broken by the ripples.
 */
function wetDeck(material: MeshStandardMaterial, planar: PlanarReflection, time: { value: number }) {
  const uniforms = { uReflect: { value: planar.texture }, uReflectMatrix: { value: planar.matrix }, uTime: time };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vWetPos;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    )}`;
    shader.fragmentShader = `varying vec3 vWetPos;
uniform sampler2D uReflect;
uniform mat4 uReflectMatrix;
uniform float uTime;
float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Rain ripples: in each cell a drop lands at its own moment, its ring spreading and fading; the slope of the rings.
vec2 wRipples(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 slope = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      float h = wHash(cell + o);
      vec2 c = o + vec2(wHash(cell + o + 7.1), wHash(cell + o + 3.3));
      float life = fract(t * 1.1 + h * 7.0);
      vec2 d = f - c;
      float r = length(d);
      float ring = r - life * 0.85;
      float wave = sin(ring * 42.0) * exp(-ring * ring * 90.0) * (1.0 - life) * (1.0 - life);
      slope += (r > 0.001 ? d / r : vec2(0.0)) * wave;
    }
  return slope;
}
${shader.fragmentShader
  .replace(
    "#include <color_fragment>",
    `#include <color_fragment>
  float wet = smoothstep(0.46, 0.6, wNoise(vWetPos.xz * 0.55) * 0.7 + wNoise(vWetPos.xz * 1.7) * 0.3);
  diffuseColor.rgb *= 1.0 - 0.45 * wet;
  vec2 wRip = (wRipples(vWetPos.xz * 3.2, uTime) + 0.6 * wRipples(vWetPos.xz * 5.1 + 11.0, uTime * 1.3)) * wet;`,
  )
  .replace(
    "#include <roughnessmap_fragment>",
    `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.04, wet);`,
  )
  .replace(
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>
  normal = normalize(mix(normal, normalize(normal + (viewMatrix * vec4(-wRip.x, 0.0, -wRip.y, 0.0)).xyz * 0.35), wet));`,
  )
  .replace(
    "#include <opaque_fragment>",
    `#ifdef WET_PLANAR
  vec3 wMirror = texture2DProj(uReflect, uReflectMatrix * vec4(vWetPos.x - wRip.x * 0.05, vWetPos.y, vWetPos.z - wRip.y * 0.05, 1.0)).rgb;
  float wFacing = max(dot(normalize(vViewPosition), normal), 0.0);
  outgoingLight += wMirror * wet * (0.25 + 0.75 * pow(1.0 - wFacing, 3.0));
  #endif
  #include <opaque_fragment>`,
  )}`;
  };
  material.customProgramCacheKey = () => "neon-wet-deck";
  return {
    set(on: boolean) {
      uniforms.uReflect.value = planar.texture;
      material.defines = on ? { WET_PLANAR: "" } : {};
      material.needsUpdate = true;
    },
  };
}

function lightsReflected(scene: Scene) {
  scene.traverse((o) => {
    if ((o as Light).isLight) o.layers.enable(REFLECT);
  });
}

export function createNeon(ctx: DioramaContext): Diorama {
  const group = new Group();
  const night = new Color("#0a0716");
  ctx.scene.background = night;
  ctx.scene.fog = new FogExp2(new Color("#1a0f2e"), 0.028);
  // The city's glow from above, cold; the sky's light, magenta over violet.
  ctx.key.color.set("#8ea6ff");
  ctx.key.intensity = 0.7;
  ctx.key.position.set(6, 20, -10);
  ctx.hemi.color.set("#6a2a8a");
  ctx.hemi.groundColor.set("#120a26");
  ctx.hemi.intensity = 0.7;
  const skyBase = ctx.hemi.color.clone();
  ctx.fire.color.set("#ff2bd6");
  ctx.fire.decay = SIGN_DECAY;
  ctx.fire.distance = 0;
  // The screens' lights, for good (a light added later compiles every material again): the signs place and color them.
  const screenLights = Array.from({ length: SCREEN_LIGHTS }, () => {
    const l = new PointLight("#ffffff", 0, 0, 1.8);
    l.castShadow = false;
    return l;
  });
  group.add(...screenLights);
  ctx.scene.add(group);
  lightsReflected(ctx.scene);
  ctx.scene.remove(group);
  const rainTime = { value: 0 };
  // The mats: dark, a faint grid.
  const grid = hexMat();
  grid.repeat.set(1 / 1.2, 1 / 1.2);
  ctx.mats.map = grid;
  ctx.mats.normalMap = null;
  ctx.mats.aoMap = null;
  ctx.mats.roughnessMap = null;
  ctx.mats.metalnessMap = null;
  ctx.mats.color.set("#c8cce0");
  ctx.mats.roughness = 0.55;
  ctx.mats.metalness = 0.2;
  ctx.mats.emissive = new Color("#0b1630");
  ctx.mats.normalScale = new Vector2(1, 1);
  ctx.mats.needsUpdate = true;

  let quality = ctx.quality;
  let rim: Bounds | null = null;
  let parts: {
    plan: NeonPlan;
    city: City;
    signs: Signs;
    traffic: Traffic;
    weather: Weather;
    planar: PlanarReflection;
    wet: ReturnType<typeof wetDeck>;
  } | null = null;

  const clear = () => {
    if (!parts) return;
    group.remove(parts.city.group, parts.signs.group, parts.traffic.group, parts.weather.group);
    parts.city.dispose();
    parts.signs.dispose();
    parts.traffic.dispose();
    parts.weather.dispose();
    parts.planar.dispose();
    parts = null;
  };

  let clock = 0;
  const build = () => {
    if (!rim) return;
    clear();
    const plan = neonPlan(rim);
    const amount = DETAIL[quality].amount;
    const city = createCity(plan, ctx.arena.materials);
    const planar = planarReflection(city.deck, () => plan.deck);
    const wet = wetDeck(city.deck.material as MeshStandardMaterial, planar, rainTime);
    planar.set(quality === "high", 0.5);
    wet.set(quality === "high");
    const signs = createSigns({ plan, camera: ctx.camera, beacons: city.beacons, lights: screenLights });
    const traffic = createTraffic({ plan, camera: ctx.camera, amount });
    const weather = createWeather({ plan, camera: ctx.camera, vents: city.vents, amount });
    // The big sign's light: on the roof's left, near the far corner, over the parapet.
    ctx.fire.position.set(plan.roof.x0 + 0.2, plan.deck + 1.4, plan.stage.z0 + 0.9);
    for (const o of [city.group, signs.group, traffic.group]) reflected(o);
    group.add(city.group, signs.group, traffic.group, weather.group);
    parts = { plan, city, signs, traffic, weather, planar, wet };
    step(clock);
  };

  // Development: `?shrineTime=` pins the diorama's clock (a screenshot of a given moment).
  const pinned = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("shrineTime") ?? Number.NaN) : Number.NaN;
  const step = (now: number) => {
    if (!parts) return;
    const t = Number.isNaN(pinned) ? now : pinned;
    rainTime.value = t;
    parts.signs.update(t);
    parts.traffic.update(t);
    parts.weather.update(t, parts.signs.hue);
    // The big sign hums, and now and then stutters off.
    const out = noise(Math.floor(t * 4), 7) < 0.06 ? 0.15 : 1;
    ctx.fire.intensity = SIGN * out * (0.9 + 0.1 * Math.sin(t * 60) * Math.sin(t * 7));
    // The sky's light follows the ads' colors.
    ctx.hemi.color.copy(skyBase).lerp(parts.signs.hue, 0.35);
  };

  return {
    group,
    fireLit: true,
    fps: (q: Quality) => (q === "high" ? 60 : q === "medium" ? 30 : 0),
    layout(r: Bounds) {
      rim = r;
      build();
    },
    update(_dt: number, time: number) {
      clock = time;
      step(time);
    },
    setQuality(q: Quality) {
      if (q === quality) return;
      quality = q;
      build();
    },
    dispose() {
      clear();
      grid.dispose();
      ctx.scene.fog = null;
    },
  };
}
