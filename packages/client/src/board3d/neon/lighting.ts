/**
 * The neon city's real lights (PLAN-Y Y3), the user's wish: every light seen is a light that lights, with its shadows.
 * - Searchlights on the streets far below, sweeping up the facades of the canyons; spotlights on the facades across
 *   them, sweeping the towers and the roof's edge. Each a real spotlight, a lamp (housing, lens, glow) and a beam
 *   drawn as a volume (`beamMaterial`: the light's density along each view ray, a soft core, dust drifting in it).
 * - The red beacons on the antennas and the tallest roofs: real lights, blinking.
 * - The flying cars' thrusters: a real light behind each, the lane's color, flickering like a thrust.
 * - The drones' downlights: spotlights sweeping the roof under them.
 * The rig is created once with the diorama (a light added later would compile every material again). Shadows: each
 * shadow-casting light takes a texture unit in every lit material, so they are dealt by priority within what the GPU
 * offers (`shadowBudget`: 16 units on most Windows browsers, 32 here under WSL), the cheap spotlights first.
 */
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  CircleGeometry,
  type Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  type Light,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PointLight,
  Quaternion,
  ShaderMaterial,
  SpotLight,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import type { Quality } from "../quality";
import type { NeonPlan } from "./plan";

/** Texture units the lit materials use besides the shadow maps (maps, normals, ARM, emissive, environment, reflection). */
const MATERIAL_UNITS = 9;
/** Shadow-casting lights at most, whatever the GPU offers (each one draws a shadow map every frame). */
const MAX_SHADOWS: Record<Quality, number> = { high: 10, medium: 2, low: 0 };

/** How many of the rig's lights may cast shadows: texture units left once the materials, the moon and the sign have theirs. */
export function shadowBudget(maxTextures: number, q: Quality): number {
  return Math.max(0, Math.min(MAX_SHADOWS[q], maxTextures - MATERIAL_UNITS - 2));
}

/** A beam drawn as a volume: for each pixel, the light's density along the view ray through the cone. */
export function beamMaterial(color: Color, intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uApex: { value: new Vector3() },
      uAxis: { value: new Vector3(0, 1, 0) },
      uLength: { value: 10 },
      uTan: { value: 0.3 },
      uColor: { value: color.clone() },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uApex;
      uniform vec3 uAxis;
      uniform float uLength;
      uniform float uTan;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      varying vec3 vWorld;
      float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float bNoise(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vWorld - ro);
        // The closest approach between the view ray and the beam's axis.
        vec3 w0 = ro - uApex;
        float b = dot(rd, uAxis);
        float d = dot(rd, w0);
        float e = dot(uAxis, w0);
        float den = max(1.0 - b * b, 1e-4);
        float along = clamp((e - b * d) / den, 0.0, uLength);
        float onRay = max((b * e - d) / den, 0.0);
        float dist = length((ro + rd * onRay) - (uApex + uAxis * along));
        float radius = max(0.03, along * uTan);
        // A soft core, thicker where the beam is seen end-on (more volume crossed), fading along its length.
        float r2 = dist / radius;
        float core = exp(-r2 * r2 * 2.2);
        float depth = 1.0 / (0.35 + sqrt(den));
        // (pow of a negative is NaN, and one NaN pixel spreads over the whole screen through the bloom.)
        float fade = smoothstep(0.0, 0.06 * uLength, along) * pow(max(1.0 - along / uLength, 0.0), 1.7);
        float dust = 0.65 + 0.35 * bNoise(uApex + uAxis * along * 1.3 + vec3(0.0, -uTime * 0.6, uTime * 0.2));
        gl_FragColor = vec4(uColor * core * depth * fade * dust * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: BackSide,
  });
}

/** A spotlight with its lamp and its beam. */
interface Searchlight {
  light: SpotLight;
  beam: Mesh<ConeGeometry, ShaderMaterial>;
  lamp: Group;
  /** Where it aims at rest, and how it sweeps. */
  aim: Vector3;
  sweep: Vector3;
  phase: number;
  length: number;
}

export interface Rig {
  /** Every light of the rig (they are added once, with the diorama). */
  lights: Light[];
  screens: PointLight[];
  train: PointLight;
  facade: SpotLight[];
  ground: SpotLight[];
  beacons: PointLight[];
  thrusters: PointLight[];
  drones: SpotLight[];
  /** Deals the shadows by priority within the budget at this quality. */
  shadows(q: Quality, maxTextures: number): number;
}

const spot = (color: string, intensity: number, angle: number) => {
  const s = new SpotLight(color, intensity, 0, angle, 0.7, 1.3);
  s.castShadow = false;
  return s;
};
const point = (color: string, decay = 1.6) => {
  const p = new PointLight(color, 0, 0, decay);
  p.castShadow = false;
  return p;
};

/** The rig: its counts fixed (the same lights at every quality: no shader compiled during play). */
export function createRig(): Rig {
  const screens = Array.from({ length: 4 }, () => point("#ffffff", 1.8));
  const train = point("#ffd9a0", 1.4);
  const facade = ["#22e4ff", "#ff2bd6", "#ffb020"].map((c) => spot(c, 90, 0.38));
  const ground = ["#5fd8ff", "#ff5fd8", "#ffcf5f", "#9f7bff"].map((c) => spot(c, 320, 0.2));
  const beacons = Array.from({ length: 6 }, () => point("#ff2a2a", 1.8));
  const thrusters = Array.from({ length: 10 }, () => point("#22e4ff", 1.7));
  const drones = Array.from({ length: 3 }, () => spot("#e8f4ff", 30, 0.32));
  const lights: Light[] = [...screens, train, ...facade, ...ground, ...beacons, ...thrusters, ...drones];
  return {
    lights,
    screens,
    train,
    facade,
    ground,
    beacons,
    thrusters,
    drones,
    shadows(q: Quality, maxTextures: number) {
      // The spotlights first (one map each), then the lights moving over the table, then the rest (six maps each).
      const order: [Light, number][] = [
        [train, 512],
        ...facade.map((s): [Light, number] => [s, 1024]),
        ...drones.map((s): [Light, number] => [s, 512]),
        ...ground.map((s): [Light, number] => [s, 1024]),
        [beacons[0] as Light, 256],
        [beacons[1] as Light, 256],
        [screens[0] as Light, 512],
        [screens[1] as Light, 512],
        ...thrusters.slice(0, 4).map((t): [Light, number] => [t, 256]),
      ];
      const budget = shadowBudget(maxTextures, q);
      order.forEach(([light, size], k) => {
        const l = light as PointLight | SpotLight;
        l.castShadow = k < budget;
        l.shadow.mapSize.set(size, size);
        l.shadow.bias = -0.002;
        l.shadow.normalBias = 0.03;
        l.shadow.camera.near = 0.2;
        l.shadow.camera.far = 40;
      });
      return Math.min(budget, order.length);
    },
  };
}

function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.5)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export interface Lighting {
  group: Group;
  update(t: number, vehicles: { pos: Vector3; dir: Vector3; color: Color }[], drones: Vector3[]): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

/** Places the rig in a plan, builds the lamps and the beams, and drives the lights. */
export function createLighting(o: { plan: NeonPlan; camera: PerspectiveCamera; rig: Rig; beacons: Vector3[] }): Lighting {
  const { plan, rig } = o;
  const { roof, deck, street } = plan;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const glow = own(glowTexture());
  const housingGeo = own(new CylinderGeometry(0.11, 0.17, 0.26, 16, 1, true));
  housingGeo.rotateX(Math.PI / 2);
  const lensGeo = own(new CircleGeometry(0.11, 20));
  const housingMat = own(new MeshStandardMaterial({ color: "#1d2028", roughness: 0.35, metalness: 0.85, side: 2 }));
  const beamGeo = own(new ConeGeometry(1, 1, 32, 1, true));
  // The cone with its apex at the origin, opening along +z (lookAt aims +z).
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(-Math.PI / 2);

  const searchlight = (
    light: SpotLight,
    at: Vector3,
    aim: Vector3,
    sweep: Vector3,
    length: number,
    intensity: number,
    phase: number,
  ): Searchlight => {
    light.position.copy(at);
    light.target.position.copy(aim);
    group.add(light.target);
    const color = light.color.clone();
    const material = own(beamMaterial(color, intensity));
    const beam = new Mesh(beamGeo, material);
    beam.renderOrder = 3;
    beam.frustumCulled = false;
    // The lamp: its housing, its lens lit, a glow at the lens.
    const lamp = new Group();
    const housing = new Mesh(housingGeo, housingMat);
    const lens = new Mesh(lensGeo, own(new MeshBasicMaterial({ color: color.clone().multiplyScalar(4) })));
    lens.position.z = 0.13;
    const halo = new Sprite(
      own(new SpriteMaterial({ map: glow, color, blending: AdditiveBlending, depthWrite: false, transparent: true })),
    );
    halo.position.z = 0.16;
    halo.scale.setScalar(0.9);
    lamp.add(housing, lens, halo);
    lamp.position.copy(at);
    group.add(beam, lamp);
    return { light, beam, lamp, aim: aim.clone(), sweep, phase, length };
  };
  const cx = (roof.x0 + roof.x1) / 2;
  const searchlights: Searchlight[] = [
    // At our tower's foot, far below, in the canyons beside it and beyond: rising almost straight up along the facades
    // (where the camera sees them: a beam leaning outwards would leave the screen), sweeping them.
    searchlight(
      rig.ground[0] as SpotLight,
      new Vector3(roof.x0 - 1.3, street + 0.3, roof.z0 + 3),
      new Vector3(roof.x0 - 0.7, deck + 4, roof.z0 + 2),
      new Vector3(1.2, 0, 2.5),
      34,
      2.2,
      0,
    ),
    searchlight(
      rig.ground[1] as SpotLight,
      new Vector3(roof.x1 + 1.3, street + 0.3, roof.z0 + 2),
      new Vector3(roof.x1 + 0.7, deck + 4, roof.z0 + 3.5),
      new Vector3(1.2, 0, 2.5),
      34,
      2.2,
      1.7,
    ),
    searchlight(
      rig.ground[2] as SpotLight,
      new Vector3(cx - 3, street + 0.3, roof.z0 - 1.4),
      new Vector3(cx - 2, deck + 4, roof.z0 - 0.6),
      new Vector3(3, 0, 0.8),
      36,
      2.2,
      3.1,
    ),
    searchlight(
      rig.ground[3] as SpotLight,
      new Vector3(roof.x0 - 1.3, street + 0.3, roof.z1 - 3),
      new Vector3(roof.x0 - 0.7, deck + 4, roof.z1 - 4),
      new Vector3(1.2, 0, 2.5),
      32,
      2.2,
      4.6,
    ),
    // On the facades across the canyons: over the towers and the roof's edge.
    searchlight(
      rig.facade[0] as SpotLight,
      new Vector3(roof.x0 - 4.2, deck - 2.2, roof.z0 + 3.5),
      new Vector3(roof.x0, deck + 1.5, roof.z0 + 1),
      new Vector3(3.5, 2, 4),
      12,
      0.35,
      0.5,
    ),
    searchlight(
      rig.facade[1] as SpotLight,
      new Vector3(roof.x1 + 4.2, deck - 1.6, roof.z0 + 1.5),
      new Vector3(roof.x1, deck + 1.2, roof.z0 + 4),
      new Vector3(3.5, 2, 4),
      12,
      0.35,
      2.6,
    ),
    searchlight(
      rig.facade[2] as SpotLight,
      new Vector3(cx + 3, deck - 3, roof.z0 - 4.2),
      new Vector3(cx, deck + 2, roof.z0),
      new Vector3(3.5, 2, 4),
      12,
      0.35,
      4.2,
    ),
  ];
  // The drones' downlights: short faint beams.
  const droneBeams = rig.drones.map((light) => {
    group.add(light.target);
    const beam = new Mesh(beamGeo, own(beamMaterial(light.color, 0.25)));
    beam.renderOrder = 3;
    beam.frustumCulled = false;
    group.add(beam);
    return { light, beam };
  });
  // The beacons' lights at their lamps (the signs draw the lamps' glow).
  rig.beacons.forEach((b, k) => {
    const at = o.beacons[k];
    if (at) b.position.copy(at);
  });

  const q = new Quaternion();
  const look = new Vector3();
  const aimBeam = (
    beam: Mesh<ConeGeometry, ShaderMaterial>,
    from: Vector3,
    to: Vector3,
    length: number,
    angle: number,
    t: number,
  ) => {
    look.subVectors(to, from).normalize();
    q.setFromUnitVectors(new Vector3(0, 0, 1), look);
    beam.position.copy(from);
    beam.quaternion.copy(q);
    const radius = Math.tan(angle) * length;
    beam.scale.set(radius, radius, length);
    const u = beam.material.uniforms;
    (u.uApex as { value: Vector3 }).value.copy(from);
    (u.uAxis as { value: Vector3 }).value.copy(look);
    (u.uLength as { value: number }).value = length;
    (u.uTan as { value: number }).value = Math.tan(angle) * 0.75;
    (u.uTime as { value: number }).value = t;
  };
  return {
    group,
    update(t, vehicles, drones) {
      for (const sl of searchlights) {
        sl.light.target.position.set(
          sl.aim.x + sl.sweep.x * Math.sin(t * 0.21 + sl.phase),
          sl.aim.y + sl.sweep.y * Math.sin(t * 0.29 + sl.phase * 2),
          sl.aim.z + sl.sweep.z * Math.cos(t * 0.16 + sl.phase),
        );
        sl.light.target.updateMatrixWorld();
        aimBeam(sl.beam, sl.light.position, sl.light.target.position, sl.length, sl.light.angle, t);
        sl.lamp.lookAt(sl.light.target.position);
      }
      // Thrusters behind the cars, flickering like a thrust; spare lights off.
      rig.thrusters.forEach((light, k) => {
        const v = vehicles[k];
        if (!v) {
          light.intensity = 0;
          return;
        }
        light.position.copy(v.pos).addScaledVector(v.dir, -0.32).add(UP.clone().multiplyScalar(-0.04));
        light.color.copy(v.color);
        light.intensity = 2.4 * (0.8 + 0.2 * Math.sin(t * 47 + k * 3.1) * Math.sin(t * 13 + k));
      });
      // The drones' downlights sweeping the roof under them.
      droneBeams.forEach(({ light, beam }, k) => {
        const at = drones[k];
        if (!at) {
          light.intensity = 0;
          return;
        }
        light.position.copy(at).add(new Vector3(0, -0.05, 0));
        light.target.position.set(at.x + 0.8 * Math.sin(t * 0.7 + k), deck, at.z + 0.8 * Math.cos(t * 0.5 + k));
        light.target.updateMatrixWorld();
        light.intensity = 30;
        aimBeam(beam, light.position, light.target.position, Math.max(0.5, at.y - deck + 0.2), light.angle, t);
      });
      // The beacons blink, red, slow.
      rig.beacons.forEach((b, k) => {
        b.intensity = (t * 0.8 + k * 0.37) % 1 < 0.15 ? 6 : 0.15;
      });
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
