/**
 * The shrine's buildings (PLAN-X X2): a three-story pagoda on the islet, the hall on the left beach (a Shinto honden:
 * crossed chigi and katsuogi logs on its ridge, a straw rope across its front), the arched bridge (taiko-bashi) from
 * the stage to the islet. Built from the kit, a mesh per material; small, as a diorama's are, and placed where the
 * camera sees them whole (the far corners).
 */
import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { ArenaMaterial } from "../assets";
import { tiledMaterial } from "./ground";
import { merged, placed, roof } from "./kit";

export interface Materials {
  red: MeshStandardMaterial;
  plaster: MeshStandardMaterial;
  tiles: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  dark: MeshStandardMaterial;
  bronze: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  straw: MeshStandardMaterial;
  paper: MeshStandardMaterial;
  dispose(): void;
}

export function buildingMaterials(arena: Record<string, ArenaMaterial>, red: MeshStandardMaterial): Materials {
  const tiles = tiledMaterial(arena.roof, 0.6, "#8c939c");
  const wood = tiledMaterial(arena.cedar, 1.2, "#9a8470");
  const stone = tiledMaterial(arena.stone, 1, "#a7a296");
  const own = [
    tiles,
    wood,
    stone,
    new MeshStandardMaterial({ color: "#e8e1d1", roughness: 0.92 }),
    new MeshStandardMaterial({ color: "#23180f", roughness: 0.7 }),
    new MeshStandardMaterial({ color: "#7a6232", roughness: 0.35, metalness: 0.85 }),
    new MeshStandardMaterial({ color: "#c9b27a", roughness: 0.95 }),
    new MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.8, side: DoubleSide }),
  ];
  const [, , , plaster, dark, bronze, straw, paper] = own as MeshStandardMaterial[];
  return {
    red,
    plaster: plaster as MeshStandardMaterial,
    tiles,
    wood,
    dark: dark as MeshStandardMaterial,
    bronze: bronze as MeshStandardMaterial,
    stone,
    straw: straw as MeshStandardMaterial,
    paper: paper as MeshStandardMaterial,
    dispose() {
      for (const m of own) m.dispose();
    },
  };
}

/** Meshes from parts sorted by material: one mesh each, casting and taking shadows. */
function assemble(parts: Map<Material, BufferGeometry[]>): Group {
  const group = new Group();
  for (const [material, geometries] of parts) {
    if (!geometries.length) continue;
    const mesh = new Mesh(merged(geometries), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function parts(): {
  map: Map<Material, BufferGeometry[]>;
  add(m: Material, g: BufferGeometry): void;
} {
  const map = new Map<Material, BufferGeometry[]>();
  return {
    map,
    add(m, g) {
      const list = map.get(m) ?? [];
      list.push(g);
      map.set(m, list);
    },
  };
}

/** The pagoda: a stone base, three stories narrowing upwards, each with its brackets and its roof, the bronze spire. */
export function pagoda(m: Materials): Group {
  const p = parts();
  p.add(m.stone, placed(new BoxGeometry(1.15, 0.14, 1.15), [0, 0.07, 0]));
  p.add(m.stone, placed(new BoxGeometry(0.4, 0.07, 0.25), [0, 0.035, 0.68]));
  let y = 0.14;
  for (const [i, b] of [0.34, 0.29, 0.24].entries()) {
    const h = i === 0 ? 0.32 : 0.26;
    p.add(m.plaster, placed(new BoxGeometry(2 * b, h, 2 * b), [0, y + h / 2, 0]));
    for (const [sx, sz] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const)
      p.add(m.red, placed(new BoxGeometry(0.05, h, 0.05), [sx * b, y + h / 2, sz * b]));
    for (const [sx, sz, turn] of [
      [0, 1, 0],
      [0, -1, 0],
      [1, 0, Math.PI / 2],
      [-1, 0, Math.PI / 2],
    ] as const) {
      // A door on each face, a red frame, a dark panel.
      p.add(
        m.red,
        placed(new BoxGeometry(0.2, h * 0.72, 0.012), [sx * (b + 0.004), y + h * 0.4, sz * (b + 0.004)], [0, turn, 0]),
      );
      p.add(
        m.dark,
        placed(new BoxGeometry(0.15, h * 0.62, 0.014), [sx * (b + 0.006), y + h * 0.38, sz * (b + 0.006)], [0, turn, 0]),
      );
    }
    p.add(m.red, placed(new BoxGeometry(2 * b + 0.05, 0.045, 2 * b + 0.05), [0, y + h, 0]));
    // The brackets (masugumi) under the eaves.
    p.add(m.dark, placed(new BoxGeometry(2 * b + 0.16, 0.05, 2 * b + 0.16), [0, y + h + 0.045, 0]));
    p.add(m.wood, placed(new BoxGeometry(2 * b + 0.26, 0.03, 2 * b + 0.26), [0, y + h + 0.085, 0]));
    p.add(
      m.tiles,
      placed(roof({ eaveX: b + 0.34, eaveZ: b + 0.34, ridge: 0, height: 0.24, thickness: 0.035, lift: 0.08 }), [
        0,
        y + h + 0.1,
        0,
      ]),
    );
    y += h + 0.2;
  }
  // The spire (sōrin): a base, nine rings, the water flame, the jewel.
  const top = y - 0.02;
  p.add(m.bronze, placed(new BoxGeometry(0.13, 0.06, 0.13), [0, top + 0.03, 0]));
  p.add(m.bronze, placed(new CylinderGeometry(0.014, 0.018, 0.62, 8), [0, top + 0.37, 0]));
  for (let i = 0; i < 9; i++)
    p.add(m.bronze, placed(new CylinderGeometry(0.05 - i * 0.002, 0.05 - i * 0.002, 0.012, 14), [0, top + 0.12 + i * 0.045, 0]));
  p.add(m.bronze, placed(new SphereGeometry(0.035, 12, 8), [0, top + 0.7, 0], [0, 0, 0], [1, 1.3, 1]));
  return assemble(p.map);
}

/** The hall (facing +z): a stone base, a veranda, white walls between red posts, its roof, the ridge's crossed boards. */
export function hall(m: Materials): Group {
  const p = parts();
  p.add(m.stone, placed(new BoxGeometry(1.35, 0.13, 1.0), [0, 0.065, 0]));
  p.add(m.wood, placed(new BoxGeometry(1.2, 0.03, 0.86), [0, 0.16, 0]));
  for (let i = 0; i < 3; i++)
    p.add(m.stone, placed(new BoxGeometry(0.4, 0.045, 0.1), [0, 0.022 + i * 0.045, 0.55 + (2 - i) * 0.08]));
  const h = 0.42;
  p.add(m.plaster, placed(new BoxGeometry(1.0, h, 0.62), [0, 0.175 + h / 2, -0.02]));
  // Lattice doors on the front, dark.
  for (const x of [-0.3, 0, 0.3]) p.add(m.dark, placed(new BoxGeometry(0.24, h * 0.75, 0.012), [x, 0.175 + h * 0.42, 0.296]));
  for (const x of [-0.5, -0.15, 0.15, 0.5])
    for (const z of [-0.33, 0.29]) p.add(m.red, placed(new BoxGeometry(0.05, h, 0.05), [x, 0.175 + h / 2, z]));
  p.add(m.red, placed(new BoxGeometry(1.06, 0.05, 0.7), [0, 0.175 + h, -0.02]));
  p.add(m.dark, placed(new BoxGeometry(1.14, 0.05, 0.78), [0, 0.175 + h + 0.05, -0.02]));
  const roofY = 0.175 + h + 0.075;
  p.add(
    m.tiles,
    placed(roof({ eaveX: 0.8, eaveZ: 0.58, ridge: 0.38, height: 0.4, thickness: 0.04, lift: 0.06 }), [0, roofY, -0.02]),
  );
  // The ridge: its beam, five katsuogi logs across it, the chigi crossed at each end.
  const ridgeY = roofY + 0.4;
  p.add(m.dark, placed(new BoxGeometry(0.86, 0.05, 0.07), [0, ridgeY + 0.01, -0.02]));
  for (let i = 0; i < 5; i++)
    p.add(
      m.wood,
      placed(new CylinderGeometry(0.025, 0.025, 0.16, 8), [-0.32 + i * 0.16, ridgeY + 0.055, -0.02], [Math.PI / 2, 0, 0]),
    );
  for (const x of [-0.42, 0.42])
    for (const lean of [-0.5, 0.5])
      p.add(m.wood, placed(new BoxGeometry(0.02, 0.3, 0.05), [x, ridgeY + 0.08, -0.02 + lean * 0.12], [lean, 0, 0]));
  // The straw rope (shimenawa) across the front, its paper streamers.
  const rope = new CatmullRomCurve3([new Vector3(-0.5, 0.52, 0.33), new Vector3(0, 0.46, 0.36), new Vector3(0.5, 0.52, 0.33)]);
  p.add(m.straw, new TubeGeometry(rope, 16, 0.022, 6, false));
  for (const x of [-0.25, 0, 0.25])
    p.add(m.paper, placed(new BoxGeometry(0.03, 0.09, 0.004), [x, 0.43 - Math.abs(x) * 0.12, 0.365]));
  return assemble(p.map);
}

/**
 * The arched bridge along +x from `from` (on the stage's deck) to `to` (on the islet): its planks rising in an arc,
 * red railings on both sides with bronze finials at their ends, two pairs of legs into the water.
 */
export function bridge(m: Materials, from: Vector3, to: Vector3, seabed: number): Group {
  const p = parts();
  const length = to.x - from.x;
  const arch = 0.18 + length * 0.07;
  const width = 0.5;
  const n = 14;
  const at = (t: number) => new Vector3(from.x + length * t, from.y + (to.y - from.y) * t + arch * Math.sin(Math.PI * t), from.z);
  for (let i = 0; i < n; i++) {
    const a = at(i / n);
    const b = at((i + 1) / n);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const tilt = Math.atan2(b.y - a.y, b.x - a.x);
    p.add(m.wood, placed(new BoxGeometry(a.distanceTo(b) + 0.004, 0.035, width), [mid.x, mid.y, mid.z], [0, 0, tilt]));
    for (const side of [-1, 1]) {
      p.add(
        m.red,
        placed(
          new BoxGeometry(a.distanceTo(b) + 0.01, 0.03, 0.04),
          [mid.x, mid.y + 0.27, mid.z + side * (width / 2 - 0.02)],
          [0, 0, tilt],
        ),
      );
      p.add(
        m.red,
        placed(
          new BoxGeometry(a.distanceTo(b) + 0.01, 0.02, 0.03),
          [mid.x, mid.y + 0.14, mid.z + side * (width / 2 - 0.02)],
          [0, 0, tilt],
        ),
      );
      if (i % 2 === 0 || i === n - 1) {
        const q = i === n - 1 ? b : a;
        p.add(m.red, placed(new BoxGeometry(0.04, 0.28, 0.04), [q.x, q.y + 0.14, q.z + side * (width / 2 - 0.02)]));
      }
    }
  }
  const finial = new LatheGeometry(
    [
      [0, 0],
      [0.035, 0],
      [0.035, 0.015],
      [0.045, 0.05],
      [0.02, 0.09],
      [0, 0.11],
    ].map(([x, y]) => new Vector2(x, y)),
    10,
  );
  for (const q of [at(0), at(1)])
    for (const side of [-1, 1]) p.add(m.bronze, placed(finial.clone(), [q.x, q.y + 0.28, q.z + side * (width / 2 - 0.02)]));
  finial.dispose();
  for (const t of [0.3, 0.7]) {
    const q = at(t);
    for (const side of [-1, 1]) {
      const h = q.y - seabed;
      p.add(m.red, placed(new CylinderGeometry(0.035, 0.04, h, 8), [q.x, seabed + h / 2, q.z + side * (width / 2 - 0.05)]));
    }
    p.add(m.red, placed(new BoxGeometry(0.05, 0.04, width), [q.x, q.y - 0.06, q.z]));
  }
  return assemble(p.map);
}
