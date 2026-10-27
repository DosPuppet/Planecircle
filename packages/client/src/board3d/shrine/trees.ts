/**
 * The shrine's vegetation (PLAN-X X3), built in code: trees grown by branching (the wood merged into one geometry, the
 * crown in instanced leaf cards cut from an atlas drawn on a canvas), grass tufts on the banks, the Poly Haven shrubs
 * and ferns; all colored by the season (`season.ts`). A sakura and a pine on the left beach by the torii and the hall,
 * a momiji on the right beach, a small pine leaning from the islet: where the camera sees them whole.
 */
import {
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { ArenaMaterial } from "../assets";
import { ownMaterials, placed as placedModel, tiledMaterial } from "./ground";
import { merged } from "./kit";
import type { ShrinePlan } from "./plan";
import { type SeasonLook, snowCover, type Tile } from "./season";

/** The atlas: three columns, two rows of 256 px. */
const TILES: Record<Tile | "grass" | "blade", [number, number]> = {
  blossom: [0, 0],
  maple: [1, 0],
  leaves: [2, 0],
  needles: [0, 1],
  grass: [1, 1],
  blade: [2, 1],
};
const CELL = 256;

/** A pseudo-random sequence from a seed (the same trees every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A momiji leaf with its center at (x, y): seven pointed lobes fanned from the stem, the middle one `s` long toward
 * `turn`, the basal pair small and pointing back; toothed edges, a stem, veins in `vein`. Filled with the current style. */
export function mapleLeaf(g: CanvasRenderingContext2D, x: number, y: number, s: number, turn: number, vein: string): void {
  const lobes: [number, number][] = [
    [-1.95, 0.45],
    [-1.25, 0.76],
    [-0.62, 0.94],
    [0, 1],
    [0.62, 0.94],
    [1.25, 0.76],
    [1.95, 0.45],
  ];
  const sinus = [0.2, 0.28, 0.3, 0.3, 0.28, 0.2];
  // A point `d` along the lobe at angle `a` from the middle one, `l` across it (toward greater angles).
  const on = (a: number, d: number, l: number): [number, number] => {
    const t = turn + a;
    return [x + (Math.cos(t) * d - Math.sin(t) * l) * s, y + (Math.sin(t) * d + Math.cos(t) * l) * s];
  };
  // One edge of a lobe, from its sinus to its tip, toothed.
  const edge = (a: number, len: number, from: [number, number], side: number): [number, number][] => {
    const c1 = on(a, 0.4 * len, side * 0.17 * len);
    const c2 = on(a, 0.75 * len, side * 0.07 * len);
    const tip = on(a, len, 0);
    const out: [number, number][] = [];
    const n = 16;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      let px = w[0] * from[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * tip[0];
      let py = w[0] * from[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * tip[1];
      // Teeth leaning toward the tip, none at the sinus or the tip.
      if (k % 2 && t > 0.2 && t < 0.85) {
        const across = side * 0.03 * len * s;
        const along = 0.025 * len * s;
        px += Math.cos(turn + a) * along - Math.sin(turn + a) * across;
        py += Math.sin(turn + a) * along + Math.cos(turn + a) * across;
      }
      out.push([px, py]);
    }
    return out;
  };
  const stem = turn + Math.PI;
  const outline: [number, number][] = [[x + Math.cos(stem - 0.3) * 0.08 * s, y + Math.sin(stem - 0.3) * 0.08 * s]];
  lobes.forEach(([a, len], i) => {
    const before = outline[outline.length - 1] as [number, number];
    const next = lobes[i + 1];
    const after: [number, number] = next
      ? on((a + next[0]) / 2, sinus[i] as number, 0)
      : [x + Math.cos(stem + 0.3) * 0.08 * s, y + Math.sin(stem + 0.3) * 0.08 * s];
    outline.push(...edge(a, len, before, -1).slice(1), ...edge(a, len, after, 1).reverse().slice(1));
  });
  g.beginPath();
  for (const [px, py] of outline) g.lineTo(px, py);
  g.fill();
  g.lineCap = "round";
  g.strokeStyle = g.fillStyle;
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(...on(Math.PI, 0.3, 0.06), ...on(Math.PI, 0.6, 0.12));
  g.stroke();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(1, s * 0.025);
  for (const [a, len] of lobes) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(...on(a, len * 0.85, 0));
    g.stroke();
  }
}

/** The leaves, light gray on transparent: each card's instance color gives its hue. */
function atlas(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = CELL * 3;
  c.height = CELL * 2;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = rng(7);
  const at = (tile: keyof typeof TILES, draw: () => void) => {
    const [i, j] = TILES[tile];
    g.save();
    g.translate(i * CELL, j * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    draw();
    g.restore();
  };
  // Sakura: clusters of five-petaled flowers, their centers darker.
  at("blossom", () => {
    for (let k = 0; k < 11; k++) {
      const x = 40 + r() * 176;
      const y = 40 + r() * 176;
      const s = 18 + r() * 14;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + r();
        g.fillStyle = `rgb(${245 - p * 4}, ${245 - p * 4}, ${245 - p * 4})`;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, s * 0.34, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgb(170, 150, 150)";
      g.beginPath();
      g.arc(x, y, s * 0.22, 0, Math.PI * 2);
      g.fill();
    }
  });
  // Momiji: seven-lobed leaves, their veins.
  at("maple", () => {
    for (let k = 0; k < 6; k++) {
      const x = 50 + r() * 156;
      const y = 50 + r() * 156;
      const s = 30 + r() * 16;
      const turn = r() * Math.PI * 2;
      g.fillStyle = `rgb(${225 + r() * 25}, ${225 + r() * 25}, ${225 + r() * 25})`;
      mapleLeaf(g, x, y, s, turn, "rgba(120, 110, 100, 0.6)");
    }
  });
  // Leaves: a cluster of pointed ovals on twigs.
  at("leaves", () => {
    for (let k = 0; k < 26; k++) {
      const x = 30 + r() * 196;
      const y = 30 + r() * 196;
      const a = r() * Math.PI * 2;
      g.fillStyle = `rgb(${200 + r() * 50}, ${200 + r() * 50}, ${200 + r() * 50})`;
      g.beginPath();
      g.ellipse(x, y, 22, 9, a, 0, Math.PI * 2);
      g.fill();
    }
  });
  // Pine needles: tufts radiating from their twigs.
  at("needles", () => {
    g.lineCap = "round";
    for (let k = 0; k < 14; k++) {
      const x = 30 + r() * 196;
      const y = 30 + r() * 196;
      for (let p = 0; p < 22; p++) {
        const a = r() * Math.PI * 2;
        const l = 18 + r() * 22;
        g.strokeStyle = `rgb(${190 + r() * 60}, ${190 + r() * 60}, ${190 + r() * 60})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    }
  });
  // Grass: blades from the bottom edge, bending.
  at("grass", () => {
    for (let k = 0; k < 40; k++) {
      const x = 20 + r() * 216;
      const h = 120 + r() * 130;
      const bend = (r() - 0.5) * 60;
      g.strokeStyle = `rgb(${190 + r() * 60}, ${190 + r() * 60}, ${190 + r() * 60})`;
      g.lineWidth = 3 + r() * 3;
      g.beginPath();
      g.moveTo(x, CELL);
      g.quadraticCurveTo(x + bend * 0.3, CELL - h * 0.6, x + bend, CELL - h);
      g.stroke();
    }
  });
  // A bamboo leaf: long, narrow, pointed.
  at("blade", () => {
    g.fillStyle = "rgb(235, 235, 235)";
    g.beginPath();
    g.moveTo(128, 8);
    g.quadraticCurveTo(160, 128, 128, 248);
    g.quadraticCurveTo(96, 128, 128, 8);
    g.fill();
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A card showing one tile of the atlas, centered on its middle (`base`: its bottom edge at the origin). */
function card(tile: keyof typeof TILES, base = false): BufferGeometry {
  const g = new PlaneGeometry(1, 1);
  if (base) g.translate(0, 0.5, 0);
  const [i, j] = TILES[tile];
  const uv = g.getAttribute("uv");
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 3, 1 - (j + 1 - uv.getY(k)) / 2);
  return g;
}

interface Kind {
  trunk: number;
  radius: number;
  depth: number;
  children: number;
  spread: number;
  shrink: number;
  /** Horizontal branches (pines), drooping ones (sakura). */
  level?: number;
  droop?: number;
  /** Leaf cards around each tip, their size, the crown's radius and flattening. */
  cards: number;
  card: number;
  crown: number;
  flat?: number;
}

const KINDS: Record<"sakura" | "momiji" | "pine", Kind> = {
  sakura: {
    trunk: 0.55,
    radius: 0.075,
    depth: 4,
    children: 3,
    spread: 0.62,
    shrink: 0.72,
    droop: 0.18,
    cards: 26,
    card: 0.24,
    crown: 0.26,
  },
  momiji: { trunk: 0.5, radius: 0.06, depth: 4, children: 3, spread: 0.55, shrink: 0.74, cards: 24, card: 0.2, crown: 0.24 },
  pine: {
    trunk: 0.85,
    radius: 0.08,
    depth: 3,
    children: 2,
    spread: 0.9,
    shrink: 0.7,
    level: 0.75,
    cards: 34,
    card: 0.2,
    crown: 0.34,
    flat: 0.32,
  },
};

interface Tip {
  at: Vector3;
  size: number;
}

const UP = new Vector3(0, 1, 0);

/** A tree's wood (merged) and its branches' tips, grown from the origin; `lean` tilts its trunk towards (x, z). */
function grow(kind: Kind, seed: number, scale: number, lean: [number, number, number]): { wood: BufferGeometry; tips: Tip[] } {
  const r = rng(seed);
  const parts: BufferGeometry[] = [];
  const tips: Tip[] = [];
  const queue: { from: Vector3; dir: Vector3; length: number; radius: number; depth: number }[] = [
    {
      from: new Vector3(),
      dir: new Vector3(lean[0] * lean[2], 1, lean[1] * lean[2]).normalize(),
      length: kind.trunk * scale,
      radius: kind.radius * scale,
      depth: 0,
    },
  ];
  const q = new Quaternion();
  while (queue.length) {
    const b = queue.pop() as (typeof queue)[number];
    const to = b.from.clone().addScaledVector(b.dir, b.length);
    const segment = new CylinderGeometry(b.radius * 0.68, b.radius, b.length, 7, 1, true);
    segment.translate(0, b.length / 2, 0);
    segment.applyQuaternion(q.setFromUnitVectors(UP, b.dir));
    segment.translate(b.from.x, b.from.y, b.from.z);
    parts.push(segment);
    if (b.depth >= kind.depth) {
      tips.push({ at: to, size: kind.crown * scale * (0.8 + r() * 0.4) });
      continue;
    }
    // Small trees end where their children would be twigs: a tip at each fork too, for a fuller crown.
    if (b.depth >= kind.depth - 1) tips.push({ at: to, size: kind.crown * scale * 0.7 });
    const n = kind.children - (r() < 0.3 ? 1 : 0);
    const turn0 = r() * Math.PI * 2;
    for (let i = 0; i < Math.max(2, n); i++) {
      const side = new Vector3(Math.cos(turn0 + (i * 2 * Math.PI) / n), 0, Math.sin(turn0 + (i * 2 * Math.PI) / n));
      const dir = b.dir
        .clone()
        .multiplyScalar(Math.cos(kind.spread))
        .addScaledVector(side, Math.sin(kind.spread) * (0.8 + r() * 0.4));
      if (kind.level) dir.y *= 1 - kind.level * Math.min(1, (b.depth + 1) / 2);
      if (kind.droop) dir.y -= kind.droop * b.depth;
      dir.normalize();
      queue.push({
        from: b.from.clone().lerp(to, b.depth === 0 ? 1 : 0.75 + r() * 0.25),
        dir,
        length: b.length * kind.shrink * (0.85 + r() * 0.3),
        radius: b.radius * 0.62,
        depth: b.depth + 1,
      });
    }
  }
  return { wood: merged(parts), tips };
}

export interface Vegetation {
  group: Group;
  dispose(): void;
}

/** Leaf cards, gathered per tile: one instanced mesh each at the end. */
class Leaves {
  private cards = new Map<keyof typeof TILES, { m: Matrix4; c: Color }[]>();
  add(tile: keyof typeof TILES, m: Matrix4, c: Color) {
    const list = this.cards.get(tile) ?? [];
    list.push({ m, c });
    this.cards.set(tile, list);
  }
  meshes(material: Material, owned: { dispose(): void }[], base: Set<keyof typeof TILES>): InstancedMesh[] {
    return [...this.cards].map(([tile, list]) => {
      const geometry = card(tile, base.has(tile));
      owned.push(geometry);
      const mesh = new InstancedMesh(geometry, material, list.length);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach(({ m, c }, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      owned.push(mesh);
      return mesh;
    });
  }
}

export function createVegetation(
  plan: ShrinePlan,
  materials: Record<string, ArenaMaterial>,
  models: Map<string, Object3D>,
  look: SeasonLook,
  amount: number,
): Vegetation {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const texture = atlas();
  owned.push(texture);
  const leafMat = new MeshStandardMaterial({
    map: texture,
    alphaTest: 0.45,
    side: DoubleSide,
    roughness: 0.8,
    metalness: 0,
    // The blossoms catch the lanterns' light at night: a faint glow of their own.
    emissive: new Color(look.sakura?.tile === "blossom" ? "#3a2026" : "#000000"),
  });
  const wood = tiledMaterial(materials.bark, 0.6, "#5a4a40");
  snowCover(wood, look.snow);
  snowCover(leafMat, look.snow * 0.6);
  owned.push(leafMat, wood);
  const leaves = new Leaves();
  const woods: BufferGeometry[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Vector3();

  const tree = (
    kindName: keyof typeof KINDS,
    x: number,
    z: number,
    scale: number,
    seed: number,
    lean: [number, number, number],
  ) => {
    const kind = KINDS[kindName];
    const crown = kindName === "pine" ? { tile: "needles" as Tile, colors: look.pine.colors } : look[kindName];
    const { wood: geometry, tips } = grow(kind, seed, scale, lean);
    const y = plan.height(x, z) - 0.03;
    geometry.translate(x, y, z);
    woods.push(geometry);
    if (!crown) return;
    const r = rng(seed * 31);
    for (const tip of tips)
      for (let i = 0; i < kind.cards; i++) {
        // Within the crown's ellipsoid around the tip, flatter for the pines' cloud pads.
        e.set(r() * 2 - 1, (r() * 2 - 1) * (kind.flat ?? 0.8), r() * 2 - 1);
        if (e.lengthSq() > 1) e.normalize();
        const at = tip.at
          .clone()
          .addScaledVector(e, tip.size)
          .add(new Vector3(x, y + (kind.flat ? 0.04 : 0), z));
        q.setFromAxisAngle(new Vector3(r() - 0.5, kind.flat ? 2 : r() - 0.3, r() - 0.5).normalize(), r() * Math.PI * 2);
        const s = kind.card * scale * (0.75 + r() * 0.5);
        m.compose(at, q, new Vector3(s, s, s));
        const c = new Color(crown.colors[Math.floor(r() * crown.colors.length)]);
        leaves.add(crown.tile, m.clone(), c.multiplyScalar(0.85 + r() * 0.3));
      }
  };
  const { stage, hall, islet } = plan;
  // Leaning out over the water from the beaches (as garden trees do), their crowns where the camera sees them.
  const left = (z: number) => plan.shore(-1, z) - 0.25;
  const right = (z: number) => plan.shore(1, z) + 0.25;
  tree("pine", left(stage.z0 + 4.7), stage.z0 + 4.7, 1.0, 11, [1, 0.15, 0.85]);
  tree("momiji", hall.x + 0.7, hall.z - 0.95, 0.95, 37, [1, 0.3, 0.35]);
  tree("momiji", right(stage.z0 + 3.1), stage.z0 + 3.1, 1.0, 43, [-1, 0.2, 0.75]);
  tree("sakura", islet.x + 0.32, islet.z + 0.5, 0.8, 23, [-0.4, 0.6, 0.3]);
  tree("sakura", left(stage.z0 + 0.9), stage.z0 + 0.9, 0.95, 29, [1, -0.2, 0.6]);
  // Bamboo behind the hall: tall culms with their nodes, narrow leaves near the top.
  const r = rng(53);
  for (let i = 0; i < 14; i++) {
    const x = hall.x - 1.1 + (r() - 0.5) * 0.9;
    const z = hall.z + 0.9 + (r() - 0.5) * 0.9;
    const h = 2.0 + r() * 0.7;
    const y = plan.height(x, z) - 0.03;
    const culm = new CylinderGeometry(0.022, 0.026, h, 6, 1, true);
    culm.translate(x, y + h / 2, z);
    woods.push(culm);
    for (let n = 1; n < 7; n++) {
      const ring = new CylinderGeometry(0.03, 0.03, 0.012, 6);
      ring.translate(x, y + (h * n) / 7, z);
      woods.push(ring);
    }
    for (let k = 0; k < 16; k++) {
      const at = new Vector3(x + (r() - 0.5) * 0.5, y + h * (0.55 + r() * 0.45), z + (r() - 0.5) * 0.5);
      q.setFromAxisAngle(new Vector3(r() - 0.5, 0.3, r() - 0.5).normalize(), r() * Math.PI * 2);
      m.compose(at, q, new Vector3(0.07, 0.24, 0.07));
      leaves.add("blade", m.clone(), new Color(look.bamboo[k % look.bamboo.length]));
    }
  }

  // Grass tufts on the banks, from the sand's edge inland, where the camera sees them.
  const grassCount = Math.round(900 * amount * (look.snow ? 0.4 : 1));
  const g = rng(71);
  for (let i = 0, tries = 0; i < grassCount && tries < grassCount * 6; tries++) {
    const side = g() < 0.5 ? -1 : 1;
    const z = stage.z0 - 2 + g() * (stage.z1 - stage.z0 + 2.5);
    const shore = plan.shore(side as -1 | 1, z);
    const x = shore + side * (0.5 + g() * 3);
    const y = plan.height(x, z);
    if (y < plan.level + 0.25) continue;
    i++;
    for (const turn of [0, Math.PI / 2]) {
      q.setFromAxisAngle(UP, turn + g());
      const s = 0.12 + g() * 0.12;
      m.compose(new Vector3(x, y - 0.01, z), q, new Vector3(s * 1.4, s, s));
      leaves.add("grass", m.clone(), new Color(look.grass[Math.floor(g() * look.grass.length)]).multiplyScalar(0.8 + g() * 0.3));
    }
  }

  const woodMesh = new Mesh(merged(woods), wood);
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  owned.push(woodMesh.geometry);
  group.add(woodMesh, ...leaves.meshes(leafMat, owned, new Set(["grass"])));

  // Shrubs and ferns on the banks above the sand, tinted by the season (snowy in winter).
  const tint = new Color(look.shrubs);
  const plants = ["shrub_02", "shrub_03", "shrub_04", "fern_02", "tree_stump_01"].filter((id) => models.has(id));
  const copies = new Map<Material, Material>();
  if (plants.length) {
    const p = rng(97);
    let n = 0;
    for (const side of [-1, 1] as const)
      for (let z = stage.z0 - 1.5; z < stage.z1; z += 0.9 + p() * 0.9) {
        const id = plants[n++ % plants.length] as string;
        const x = plan.shore(side, z) + side * (0.7 + p() * 1.6);
        const y = plan.height(x, z);
        if (y < plan.level + 0.2) continue;
        const plant = placedModel(models.get(id) as Object3D, id === "tree_stump_01" ? 0.35 : 0.35 + p() * 0.35, p() * 6.28);
        plant.position.set(x, y - 0.02, z);
        ownMaterials(plant, copies, (mat) => {
          mat.color.multiply(tint);
          snowCover(mat, look.snow);
        });
        group.add(plant);
      }
  }
  return {
    group,
    dispose() {
      for (const o of owned) o.dispose();
      for (const c of copies.values()) c.dispose();
    },
  };
}

/** A tree grown upright (its wood and its tips), as the vegetation grows them. */
export function growTree(kind: keyof typeof KINDS, seed: number): { wood: BufferGeometry; tips: Tip[] } {
  return grow(KINDS[kind], seed, 1, [0, 0, 0]);
}
