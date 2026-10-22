/**
 * The neon city's signs and screens (PLAN-Y), always moving:
 * - blade signs, vertical words in katakana or kanji (Latin without a katakana font) sticking out of the neighbouring
 *   towers, facing the viewer, and neon brands along their roofs' edges; they hum, and now and then one drops out;
 * - screens on the facades across the canyons, beyond the far edge, on the two towers and on frames at the roof's
 *   sides: a shader shows one ad at a time and glitches to the next (slices torn sideways, colors split), scanlines
 *   rolling; the screens nearest the table throw real light (the ad's color, out through each glitch) on the deck and
 *   the cards, its highlights in the puddles;
 * - a hologram turning above a lower building (rings and a word);
 * - red beacons blinking on the antennas and on the tallest roofs.
 * Their colors also feed the sky's light (`hue`): the city's light shifts as the ads change.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type PointLight,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { noise } from "../shrine/plan";
import type { Building, NeonPlan } from "./plan";
import { adSlides, hasCjk, NEON, neonWord } from "./textures";

/** The words of the blade signs (invented shops; katakana and kanji). */
const WORDS = ["ラーメン", "電脳", "夜市", "サイバー", "ネオン", "居酒屋", "カラオケ", "未来", "ホテル", "薬", "質屋", "義体"];
/** Without a katakana font: the same shops in Latin letters. */
const LATIN = ["RAMEN", "CYBER", "NIGHT", "BAR", "NEON", "HOTEL", "KARAOKE", "PHARMA", "PAWN", "IMPLANTS", "NOODLE", "ARCADE"];
/** Neon brands along the roofs' edges (invented). */
const BRANDS = ["NEXA", "OMNI", "SYNTH", "KAIJU", "DREAM", "MANA", "ZERO-G", "HYPER"];
/** A screen's light's strength (it falls off fast: it lights what is near). */
export const SCREEN_LIGHT = 5.5;
/** Seconds each ad stays on a screen. */
export const AD_SECONDS = 6;
const SLIDES = 4;

const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const screenFragment = /* glsl */ `
uniform sampler2D uAds;
uniform float uTime;
uniform float uSeed;
uniform float uSlides;
uniform float uSeconds;
uniform vec3 uTint;
varying vec2 vUv;
float sHash(float x) { return fract(sin(x * 91.7 + uSeed) * 43758.5453); }
void main() {
  float t = uTime + uSeed * 3.7;
  float slide = floor(t / uSeconds);
  float into = fract(t / uSeconds) * uSeconds;
  // A glitch around each change: torn slices, colors split, then the next ad.
  float glitch = smoothstep(0.45, 0.0, into) + smoothstep(uSeconds - 0.25, uSeconds, into);
  float band = floor(vUv.y * 18.0);
  float tear = (sHash(band + floor(t * 24.0)) - 0.5) * 0.25 * glitch;
  float shown = mod(slide + (into > uSeconds - 0.12 ? 1.0 : 0.0), uSlides);
  vec2 uv = vec2(fract(vUv.x + tear), (shown + vUv.y) / uSlides);
  float split = 0.012 * glitch;
  vec3 col = vec3(
    texture2D(uAds, uv + vec2(split, 0.0)).r,
    texture2D(uAds, uv).g,
    texture2D(uAds, uv - vec2(split, 0.0)).b
  );
  // Scanlines rolling up, a faint flicker, the screen's own tint at the edges.
  float scan = 0.82 + 0.18 * sin((vUv.y + t * 0.07) * 320.0);
  float flicker = 0.93 + 0.07 * sin(t * 37.0) * sin(t * 13.0);
  float edge = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
  col = col * scan * flicker * 3.2 + uTint * (1.0 - edge) * 1.4;
  gl_FragColor = vec4(col, 1.0);
}`;

/** The ad a screen shows at a time, and whether it is glitching to the next (the screen shader's clock). */
function showing(seed: number, t: number): { shown: number; glitch: boolean } {
  const tt = t + seed * 3.7;
  const slide = Math.floor(tt / AD_SECONDS);
  const into = (tt / AD_SECONDS - slide) * AD_SECONDS;
  return {
    shown: (((slide + (into > AD_SECONDS - 0.12 ? 1 : 0)) % SLIDES) + SLIDES) % SLIDES,
    glitch: into < 0.45 || into > AD_SECONDS - 0.25,
  };
}

/** A screen's glow: bright at its middle, fading out past its edges. */
function haloTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.7)");
  r.addColorStop(0.5, "rgba(255,255,255,0.25)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export interface Signs {
  group: Group;
  update(time: number): void;
  /** The light the screens throw now (the sky's light follows it). */
  readonly hue: Color;
  dispose(): void;
}

export function createSigns(o: {
  plan: NeonPlan;
  camera: PerspectiveCamera;
  beacons: Vector3[];
  /** Real lights for the screens nearest the table (created once with the diorama). */
  lights: PointLight[];
}): Signs {
  const { plan } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const { roof, deck } = plan;

  // The buildings beside our tower: across the canyons on its sides, and beyond its far edge.
  const near = plan.buildings.filter(
    (b) =>
      !plan.towers.includes(b) &&
      b.z1 > roof.z0 - 6 &&
      b.z0 < roof.z1 + 2 &&
      (Math.abs(b.x1 - roof.x0) < 6 || Math.abs(b.x0 - roof.x1) < 6 || (b.z1 < roof.z0 && b.z1 > roof.z0 - 4)),
  );
  const facing = (b: Building) => ({ left: Math.abs(b.x1 - roof.x0) < 6, right: Math.abs(b.x0 - roof.x1) < 6 });

  // Blade signs on their faces towards our tower, near their tops, facing the viewer.
  const blades: { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; phase: number }[] = [];
  const blade = (mesh: Mesh<PlaneGeometry, MeshBasicMaterial>, phase: number) => {
    mesh.renderOrder = 4;
    group.add(mesh);
    blades.push({ mesh, phase });
  };
  const glow = (map: ReturnType<typeof neonWord>) =>
    own(
      new MeshBasicMaterial({
        map: own(map),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
  const words = hasCjk() ? WORDS : LATIN;
  near.forEach((b, i) => {
    const word = words[(b.seed + i) % words.length] as string;
    const color = NEON[(b.seed + i * 2) % NEON.length] as string;
    const h = (hasCjk() ? 0.38 : 0.27) * [...word].length;
    const mesh = new Mesh(own(new PlaneGeometry(0.42, h)), glow(neonWord(word, color, true)));
    const { left, right } = facing(b);
    const x = left ? b.x1 + 0.3 : right ? b.x0 - 0.3 : b.x0 + (b.x1 - b.x0) * (0.25 + 0.5 * noise(i, 3));
    const z = left || right ? b.z0 + (b.z1 - b.z0) * (0.2 + 0.6 * noise(i, 5)) : b.z1 + 0.3;
    mesh.position.set(x, b.top - 0.3 - h / 2 - 1.5 * noise(i, 7), z);
    blade(mesh, noise(i, 11) * 100);
  });
  // Neon brands along their roofs' edges, facing the viewer.
  near.slice(0, 10).forEach((b, i) => {
    const text = BRANDS[(b.seed + i) % BRANDS.length] as string;
    const width = Math.min(1.8, (b.x1 - b.x0) * 0.8);
    const mesh = new Mesh(
      own(new PlaneGeometry(width, width * (72 / (40 * text.length + 40)))),
      glow(neonWord(text, NEON[(b.seed + 3) % NEON.length] as string, false)),
    );
    mesh.position.set((b.x0 + b.x1) / 2, b.top + 0.25, b.z1 - 0.1);
    blade(mesh, noise(i, 31) * 100);
  });

  // Screens.
  const time = { value: 0 };
  const screens: { seed: number; colors: Color[]; at: Vector3; normal: Vector3; halo: MeshBasicMaterial }[] = [];
  const haloTex = own(haloTexture());
  const screen = (w: number, h: number, at: Vector3, turn: number, seed: number) => {
    const ad = adSlides(seed, SLIDES);
    own(ad.texture);
    const material = own(
      new ShaderMaterial({
        vertexShader: screenVertex,
        fragmentShader: screenFragment,
        uniforms: {
          uAds: { value: ad.texture },
          uTime: time,
          uSeed: { value: seed },
          uSlides: { value: SLIDES },
          uSeconds: { value: AD_SECONDS },
          uTint: { value: new Color(NEON[seed % NEON.length] as string) },
        },
        side: DoubleSide,
      }),
    );
    const m = new Mesh(own(new PlaneGeometry(w, h)), material);
    m.position.copy(at);
    m.rotation.y = turn;
    m.renderOrder = 1;
    group.add(m);
    // Its glow around it, the color of the ad showing.
    const halo = new Mesh(
      own(new PlaneGeometry(w * 1.7, h * 2)),
      own(
        new MeshBasicMaterial({
          map: haloTex,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side: DoubleSide,
        }),
      ),
    );
    halo.position.copy(at);
    halo.rotation.y = turn;
    halo.translateZ(-0.01);
    halo.renderOrder = 2;
    group.add(halo);
    screens.push({
      seed,
      colors: ad.colors,
      at: at.clone(),
      normal: new Vector3(Math.sin(turn), 0, Math.cos(turn)),
      halo: halo.material,
    });
  };
  // Frames on the roof's side ledges, near the far corners, turned to the viewer (their light falls on the table).
  const frameZ = plan.stage.z0 + 0.9;
  screen(0.95, 0.6, new Vector3(roof.x0 + 0.25, deck + 0.75, frameZ), 0.5, 13);
  screen(0.95, 0.6, new Vector3(roof.x1 - 0.25, deck + 0.75, frameZ), -0.5, 17);
  // Across the canyons, big screens on the facades facing us, at the deck's height and below.
  let seed = 20;
  for (const b of near) {
    const { left, right } = facing(b);
    const w = Math.min(2.2, (left || right ? b.z1 - b.z0 : b.x1 - b.x0) * 0.7);
    const h = w * 0.62;
    const y = Math.min(b.top - h / 2 - 0.2, deck - 0.2 - h / 2 - 1.2 * noise(seed, 3));
    if (left) screen(w, h, new Vector3(b.x1 + 0.02, y, (b.z0 + b.z1) / 2), Math.PI / 2, seed++);
    else if (right) screen(w, h, new Vector3(b.x0 - 0.02, y, (b.z0 + b.z1) / 2), -Math.PI / 2, seed++);
    else screen(w, h, new Vector3((b.x0 + b.x1) / 2, y, b.z1 + 0.02), 0, seed++);
  }
  const [left, right] = plan.towers;
  screen(1.8, 1.15, new Vector3(left.x1 + 0.03, deck - 0.3, (left.z0 + left.z1) / 2), Math.PI / 2, 2);
  screen(2.0, 1.25, new Vector3((left.x0 + left.x1) / 2, deck + 1.2, left.z1 + 0.03), 0, 5);
  screen(1.8, 1.15, new Vector3(right.x0 - 0.03, deck - 0.3, (right.z0 + right.z1) / 2), -Math.PI / 2, 7);
  screen(2.0, 1.25, new Vector3((right.x0 + right.x1) / 2, deck + 1.2, right.z1 + 0.03), 0, 11);
  // The lights the screens throw: one real light before each of the first screens (the nearest the table).
  const lit = screens.slice(0, o.lights.length);
  lit.forEach((sc, k) => {
    (o.lights[k] as PointLight).position.copy(sc.at).addScaledVector(sc.normal, 0.5);
  });

  // A hologram turning above a lower building beside the roof: rings and a word.
  const holo = new Group();
  const holoMat = own(
    new MeshBasicMaterial({
      color: new Color("#22e4ff").multiplyScalar(1.6),
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  const rings = [0.55, 0.42, 0.3].map((r, i) => {
    const m = new Mesh(own(new TorusGeometry(r, 0.012, 6, 48)), holoMat);
    m.rotation.x = i * 0.7;
    holo.add(m);
    return m;
  });
  const word = new Mesh(own(new PlaneGeometry(0.9, 0.3)), glow(neonWord("NEXA", "#22e4ff", false)));
  holo.add(word);
  const below = plan.buildings
    .filter((b) => b.x0 > roof.x1 && b.x0 < roof.x1 + 7 && b.z0 > roof.z0 && b.z1 < roof.z1)
    .sort((a, b) => b.top - a.top)[0];
  holo.position.set(
    below ? (below.x0 + below.x1) / 2 : roof.x1 + 3,
    (below?.top ?? deck - 2) + 1.1,
    below ? (below.z0 + below.z1) / 2 : 0,
  );
  group.add(holo);

  // Beacons: the antennas', and the tallest roofs'.
  const beaconTex = own(neonWord("●", "#ff2a2a", false));
  const tall = plan.buildings
    .filter((b) => b.top > deck - 3)
    .map((b) => new Vector3((b.x0 + b.x1) / 2, b.top + 0.1, (b.z0 + b.z1) / 2));
  const beacons = [...o.beacons, ...tall].map((p, i) => {
    const s = new Sprite(
      own(
        new SpriteMaterial({
          map: beaconTex,
          color: "#ff3030",
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      ),
    );
    s.position.copy(p);
    s.scale.setScalar(0.35);
    s.renderOrder = 5;
    group.add(s);
    return { s, phase: i * 0.37 };
  });

  const hue = new Color();
  const add = new Color();
  return {
    group,
    hue,
    update(t: number) {
      time.value = t;
      for (const b of blades) {
        // Humming, and now and then a dropout of a fraction of a second.
        const out = noise(Math.floor((t + b.phase) * 3), b.phase) < 0.04 ? 0.08 : 1;
        const hum = 0.88 + 0.12 * Math.sin(t * 50 + b.phase) * Math.sin(t * 7 + b.phase);
        b.mesh.material.color.setScalar(out * hum);
      }
      holo.rotation.y = t * 0.6;
      rings.forEach((r, i) => {
        r.rotation.z = t * (0.4 + i * 0.3);
      });
      word.lookAt(o.camera.position);
      holoMat.opacity = 0.45 + 0.15 * Math.sin(t * 9);
      for (const { s, phase } of beacons) s.material.opacity = (t * 0.8 + phase) % 1 < 0.15 ? 1 : 0.08;
      // Every screen's glow: the ad's color, dimmed through the glitch.
      for (const sc of screens) {
        const { shown, glitch } = showing(sc.seed, t);
        sc.halo.color.copy(sc.colors[shown] as Color).multiplyScalar(glitch ? 0.3 + 0.5 * Math.abs(Math.sin(t * 60)) : 0.85);
      }
      // The screens' lights, on the shader's clock: the ad's color, out through the glitch between two ads.
      hue.setRGB(0, 0, 0);
      lit.forEach((sc, k) => {
        const { shown, glitch } = showing(sc.seed, t);
        const light = o.lights[k] as PointLight;
        light.color.copy(sc.colors[shown] as Color);
        light.intensity = SCREEN_LIGHT * (glitch ? 0.25 + 0.75 * Math.abs(Math.sin(t * 60)) : 0.9 + 0.1 * Math.sin(t * 37));
        hue.add(add.copy(light.color).multiplyScalar(1 / Math.max(1, lit.length)));
      });
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
