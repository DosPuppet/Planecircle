/**
 * Runes of the 3D board (PLAN-W W7): a circle of glowing runes on the table when a spell is cast, a sigil under a
 * permanent entering the battlefield, a smaller circle under the source of an ability. Each appears, turns (the ring one
 * way, the sigil the other) and fades, with a light of its color that the table and the cards around it reflect. The
 * glyphs are drawn as strokes on a canvas (no runic font needed); the lights come from a fixed pool, so lighting one
 * never recompiles the materials.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  type Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  type Vector3,
} from "three";

/** Lights shared by the runes shown at once (a third rune shines without its own light): each light costs on every pixel. */
const LIGHTS = 2;
const SIZE = 512;

/** A deterministic random (the textures are the same from one game to the next). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A glyph: two to four strokes in a small box, like a rune (vertical stave, branches, crossings). */
function glyph(g: CanvasRenderingContext2D, x: number, y: number, h: number, rand: () => number) {
  const w = h * 0.55;
  g.beginPath();
  // The stave.
  g.moveTo(x, y - h / 2);
  g.lineTo(x, y + h / 2);
  const strokes = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < strokes; i++) {
    const from = y - h / 2 + rand() * h * 0.6;
    const side = rand() < 0.5 ? -1 : 1;
    g.moveTo(x, from);
    g.lineTo(x + side * w * (0.5 + rand() * 0.5), from + h * (0.15 + rand() * 0.35) * (rand() < 0.5 ? -1 : 1));
  }
  g.stroke();
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.strokeStyle = "#fff";
  g.fillStyle = "#fff";
  g.lineCap = "round";
  g.shadowColor = "#fff";
  g.shadowBlur = 10;
  return [c, g];
}

/** The outer ring: two circles, runes between them, small marks outside. */
function ringTexture(seed: number): CanvasTexture {
  const [c, g] = canvas();
  const rand = seeded(seed);
  const mid = SIZE / 2;
  g.lineWidth = 4;
  for (const r of [0.47, 0.36]) {
    g.beginPath();
    g.arc(mid, mid, SIZE * r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3.5;
  const runes = 22;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    g.save();
    g.translate(mid + Math.cos(a) * SIZE * 0.415, mid + Math.sin(a) * SIZE * 0.415);
    g.rotate(a + Math.PI / 2);
    glyph(g, 0, 0, SIZE * 0.07, rand);
    g.restore();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    g.beginPath();
    g.moveTo(mid + Math.cos(a) * SIZE * 0.47, mid + Math.sin(a) * SIZE * 0.47);
    g.lineTo(mid + Math.cos(a) * SIZE * (i % 4 ? 0.485 : 0.495), mid + Math.sin(a) * SIZE * (i % 4 ? 0.485 : 0.495));
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The inner sigil: a star polygon in a circle, a smaller circle at its heart. */
function sigilTexture(points: number, skip: number): CanvasTexture {
  const [c, g] = canvas();
  const mid = SIZE / 2;
  const r = SIZE * 0.42;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(mid, mid, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = ((i * skip) / points) * Math.PI * 2 - Math.PI / 2;
    const x = mid + Math.cos(a) * r;
    const y = mid + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.beginPath();
  g.arc(mid, mid, r * 0.28, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(mid + Math.cos(a) * r, mid + Math.sin(a) * r, 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Rune {
  ring: Mesh;
  sigil: Mesh;
  light: PointLight | null;
  age: number;
  life: number;
  radius: number;
  strength: number;
  spin: number;
}

export class Runes {
  readonly group = new Group();
  private rings: CanvasTexture[];
  private sigils: CanvasTexture[];
  private plane = new PlaneGeometry(1, 1);
  private lights: PointLight[] = [];
  private runes: Rune[] = [];

  constructor() {
    this.rings = [ringTexture(7), ringTexture(23), ringTexture(91)];
    this.sigils = [sigilTexture(5, 2), sigilTexture(7, 3), sigilTexture(6, 1), sigilTexture(8, 3)];
    this.plane.rotateX(-Math.PI / 2);
    for (let i = 0; i < LIGHTS; i++) {
      const light = new PointLight("#ffffff", 0, 0, 2);
      this.lights.push(light);
      this.group.add(light);
    }
  }

  get active(): boolean {
    return this.runes.length > 0;
  }

  /**
   * A circle of runes on the table at `at` (its center), `radius` world units, in `color`, for `life` seconds;
   * `strength`: 1 for a spell or a summoning, less for an ability.
   */
  cast(at: Vector3, color: Color, radius: number, life: number, strength = 1): void {
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)] as T;
    const material = (map: CanvasTexture) => {
      const m = new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 });
      m.toneMapped = false;
      // Brighter than the table: the bloom makes the runes shine.
      m.color.copy(color).multiplyScalar(1.25);
      return m;
    };
    const ring = new Mesh(this.plane, material(pick(this.rings)));
    const sigil = new Mesh(this.plane, material(pick(this.sigils)));
    // Just above the mats, under the cards (which hide what lies under them).
    for (const [m, y] of [
      [ring, 0.0012],
      [sigil, 0.0016],
    ] as const) {
      m.position.set(at.x, y, at.z);
      m.renderOrder = 5;
      this.group.add(m);
    }
    const light = this.lights.find((l) => !this.runes.some((r) => r.light === l)) ?? null;
    if (light) {
      light.color.copy(color);
      light.position.set(at.x, 0.7 * radius + 0.3, at.z);
    }
    this.runes.push({ ring, sigil, light, age: 0, life, radius, strength, spin: Math.random() < 0.5 ? -1 : 1 });
  }

  /** Moves the runes by `dt` seconds: they appear, turn, fade; true while one remains. */
  step(dt: number): boolean {
    for (const r of this.runes) {
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      // Quick to appear, slow to fade; the circle opens a little as it appears.
      const fade = t < 0.18 ? t / 0.18 : 1 - ((t - 0.18) / 0.82) ** 1.6;
      const open = 0.72 + 0.28 * Math.min(1, t / 0.25) ** 0.5;
      r.ring.scale.setScalar(2 * r.radius * open);
      r.sigil.scale.setScalar(1.3 * r.radius * open);
      r.ring.rotation.y = r.spin * r.age * 0.6;
      r.sigil.rotation.y = -r.spin * r.age * 1.1;
      (r.ring.material as MeshBasicMaterial).opacity = fade * r.strength;
      (r.sigil.material as MeshBasicMaterial).opacity = fade * r.strength * 0.9;
      // Its light lights the cards and the table around it (physical: stronger for a larger circle).
      if (r.light) r.light.intensity = fade * r.strength * 6 * (r.radius + 0.4) ** 2;
    }
    for (const r of this.runes.filter((x) => x.age >= x.life)) {
      this.group.remove(r.ring, r.sigil);
      (r.ring.material as MeshBasicMaterial).dispose();
      (r.sigil.material as MeshBasicMaterial).dispose();
      if (r.light) r.light.intensity = 0;
    }
    this.runes = this.runes.filter((r) => r.age < r.life);
    return this.runes.length > 0;
  }

  dispose(): void {
    for (const r of this.runes) {
      (r.ring.material as MeshBasicMaterial).dispose();
      (r.sigil.material as MeshBasicMaterial).dispose();
    }
    for (const t of [...this.rings, ...this.sigils]) t.dispose();
    this.plane.dispose();
  }
}
