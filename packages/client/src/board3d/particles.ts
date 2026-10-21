/**
 * Particles of the 3D board (PLAN-W W7): one pool of glowing sprites (additive, bright enough for the bloom), emitted in
 * bursts, rings, swirls and rising motes, moved on the processor once a frame while some are alive. An idle board has
 * none and draws nothing. Each particle is an instance of one quad facing the camera, not a GL point: point sprites
 * take slow paths on some renderers (SwiftShader: about one frame a second with two hundred of them) and their size is
 * capped differently on each GPU.
 */
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Vector3,
} from "three";

/** At most this many particles alive at once (the oldest are reused). */
const MAX = 2400;

export interface Emit {
  at: Vector3;
  count: number;
  colors: Color[];
  /** Speed range (world units per second). */
  speed: [number, number];
  /** Share of the speed straight up (0: all around, 1: a fountain). */
  up: number;
  /** Lifetime range (s). */
  life: [number, number];
  /** Size range (world units). */
  size: [number, number];
  /** Downward acceleration (world units/s²; negative rises). */
  gravity: number;
  /** Start on a ring of this radius around `at`, moving outward (a shock wave), or turning (a swirl). */
  ring?: number;
  swirl?: boolean;
}

// A quad of the particle's size, centered on it, facing the camera (in view space).
const VERTEX = /* glsl */ `
  attribute vec3 offset;
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vUv = position.xy + 0.5;
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float glow = pow(max(0.0, 1.0 - d), 1.6);
    gl_FragColor = vec4(vTint * 2.2 * glow * vAlpha, 1.0);
  }
`;

export class Particles {
  readonly mesh: Mesh;
  private geometry = new InstancedBufferGeometry();
  private material: ShaderMaterial;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private tint = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private gravity = new Float32Array(MAX);
  private spin = new Uint8Array(MAX);
  private center = new Float32Array(MAX * 3);
  private next = 0;
  private alive = 0;

  constructor() {
    const quad = new PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute("position", quad.getAttribute("position"));
    this.geometry.setAttribute("offset", new InstancedBufferAttribute(this.pos, 3));
    this.geometry.setAttribute("tint", new InstancedBufferAttribute(this.tint, 3));
    this.geometry.setAttribute("size", new InstancedBufferAttribute(this.size, 1));
    this.geometry.setAttribute("alpha", new InstancedBufferAttribute(this.alpha, 1));
    this.geometry.instanceCount = MAX;
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  get active(): boolean {
    return this.alive > 0;
  }

  /** Particles alive (dev checks). */
  get count(): number {
    return this.alive;
  }

  emit(e: Emit): void {
    const rand = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
    for (let n = 0; n < e.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      if (!this.life[i]) this.alive++;
      const a = Math.random() * Math.PI * 2;
      const speed = rand(e.speed);
      const flat = Math.sqrt(1 - e.up * e.up);
      let x = e.at.x;
      let z = e.at.z;
      let vx = Math.cos(a) * speed * flat;
      let vz = Math.sin(a) * speed * flat;
      if (e.ring !== undefined) {
        x += Math.cos(a) * e.ring;
        z += Math.sin(a) * e.ring;
        if (e.swirl) {
          // Turning around the center, a little outward.
          vx = -Math.sin(a) * speed + Math.cos(a) * speed * 0.15;
          vz = Math.cos(a) * speed + Math.sin(a) * speed * 0.15;
        }
      }
      this.pos.set([x, e.at.y, z], i * 3);
      this.center.set([e.at.x, e.at.y, e.at.z], i * 3);
      this.vel.set([vx, speed * e.up + Math.random() * speed * 0.3, vz], i * 3);
      const c = e.colors[n % e.colors.length] as Color;
      this.tint.set([c.r, c.g, c.b], i * 3);
      this.baseSize[i] = rand(e.size);
      this.size[i] = this.baseSize[i] as number;
      this.alpha[i] = 1;
      this.age[i] = 0;
      this.life[i] = rand(e.life);
      this.gravity[i] = e.gravity;
      this.spin[i] = e.swirl ? 1 : 0;
    }
  }

  /** Moves the particles by `dt` seconds; true while some are alive. */
  step(dt: number): boolean {
    if (!this.alive) return false;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const life = this.life[i] as number;
      if (!life) continue;
      const age = (this.age[i] as number) + dt;
      this.age[i] = age;
      if (age >= life) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const k = i * 3;
      if (this.spin[i]) {
        // A swirl keeps turning around its center.
        const dx = (this.pos[k] as number) - (this.center[k] as number);
        const dz = (this.pos[k + 2] as number) - (this.center[k + 2] as number);
        const r = Math.hypot(dx, dz) || 1;
        const speed = Math.hypot(this.vel[k] as number, this.vel[k + 2] as number);
        this.vel[k] = (-dz / r) * speed + (dx / r) * speed * 0.15;
        this.vel[k + 2] = (dx / r) * speed + (dz / r) * speed * 0.15;
      }
      this.vel[k + 1] = (this.vel[k + 1] as number) - (this.gravity[i] as number) * dt;
      this.pos[k] = (this.pos[k] as number) + (this.vel[k] as number) * dt;
      this.pos[k + 1] = Math.max(0.005, (this.pos[k + 1] as number) + (this.vel[k + 1] as number) * dt);
      this.pos[k + 2] = (this.pos[k + 2] as number) + (this.vel[k + 2] as number) * dt;
      // Fading in, then out, shrinking a little at the end.
      const t = age / life;
      this.alpha[i] = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.size[i] = (this.baseSize[i] as number) * (1 - 0.4 * t);
    }
    this.alive = alive;
    for (const name of ["offset", "tint", "size", "alpha"])
      (this.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate = true;
    return alive > 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Colors of the effects: mana colors, and those of damage, life, embers, dust. */
export const FX_COLORS: Record<string, Color> = {
  W: new Color("#fff1c2"),
  U: new Color("#4aa8ff"),
  B: new Color("#a35bd6"),
  R: new Color("#ff6a2b"),
  G: new Color("#5fdc6a"),
  C: new Color("#d6d6e0"),
  damage: new Color("#ff7a30"),
  heal: new Color("#7dffa0"),
  embers: new Color("#ff8a3a"),
  dust: new Color("#c9a77a"),
  clash: new Color("#ffd36b"),
  counters: new Color("#b8ff7a"),
};
