/**
 * The shrine's stage (PLAN-X X1), after Itsukushima's: a deck of hinoki planks over the water, its edge beams of cedar,
 * vermilion lacquered railings with bronze finials at the corners, vermilion pillars down to the seabed. The railings
 * stand on the left, right and far sides only: seen from the camera, anything raised on the near side would rise into
 * your battlefield. Static: drawn once into the shadows.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from "three";
import type { ArenaMaterial } from "../assets";
import { tiledMaterial } from "./ground";
import type { ShrinePlan } from "./plan";
import { snowCover } from "./season";

/** Shrine vermilion (shu-iro), a lacquer over wood. */
export function lacquer(cedar: ArenaMaterial | undefined): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: "#b8331c", roughness: 0.42, metalness: 0 });
  if (cedar?.normalMap) {
    // The wood's grain shows faintly under the lacquer.
    m.normalMap = cedar.normalMap;
    m.normalScale = new Vector2(0.25, 0.25);
  }
  return m;
}

export interface Stage {
  group: Group;
  dispose(): void;
}

const POST = 0.075;
export const RAIL_H = 0.36;
const INSET = 0.12;
/** Half the opening in the right railing where the bridge to the islet starts. */
export const BRIDGE_HALF = 0.32;

/**
 * The railings' runs (from, to; x, z): the left side, the far side, the right side cut by the bridge's opening; none on
 * the near side.
 */
export function railRuns(plan: ShrinePlan): [number, number, number, number][] {
  const { x0, x1, z0, z1 } = plan.stage;
  return [
    [x0 + INSET, z1 - 0.5, x0 + INSET, z0 + INSET],
    [x0 + INSET, z0 + INSET, x1 - INSET, z0 + INSET],
    [x1 - INSET, z0 + INSET, x1 - INSET, plan.bridge - BRIDGE_HALF],
    [x1 - INSET, plan.bridge + BRIDGE_HALF, x1 - INSET, z1 - 0.5],
  ];
}

/** The railings' posts, about a unit apart, each run's ends included (once each). */
export function railPosts(plan: ShrinePlan): [number, number][] {
  const posts: [number, number][] = [];
  for (const [ax, az, bx, bz] of railRuns(plan)) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.05));
    for (let i = 0; i <= n; i++) {
      const p: [number, number] = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
      if (!posts.some(([x, z]) => Math.hypot(x - p[0], z - p[1]) < 0.01)) posts.push(p);
    }
  }
  return posts;
}

/** `snow`: on the railings and the edges in winter, never on the deck (swept for the game). */
export function createStage(plan: ShrinePlan, materials: Record<string, ArenaMaterial>, snow = 0): Stage {
  const group = new Group();
  const { x0, x1, z0, z1 } = plan.stage;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T) => {
    owned.push(o);
    return o;
  };

  // The deck: planks running across the screen, the boards' edges in cedar.
  // Darker and warmer than the bare wood under the moon: the cards stand out on it.
  const planks = own(tiledMaterial(materials.stage, materials.stage?.tile ?? 6, "#9b8166"));
  for (const t of [planks.map, planks.normalMap, planks.aoMap]) if (t) t.rotation = Math.PI / 2;
  const top = new Mesh(own(new PlaneGeometry(w, d)), planks);
  top.rotateX(-Math.PI / 2);
  top.position.set(cx, plan.deck, cz);
  const uv = top.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  top.receiveShadow = true;
  const cedar = own(tiledMaterial(materials.cedar, 2, "#8a7a6a"));
  snowCover(cedar, snow);
  const body = new Mesh(own(new BoxGeometry(w + 0.06, 0.18, d + 0.06)), cedar);
  body.position.set(cx, plan.deck - 0.095, cz);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(top, body);

  // Pillars under the deck's edges, down to the seabed.
  const red = own(lacquer(materials.cedar));
  snowCover(red, snow);
  const depth = plan.deck - 0.18 - plan.height(cx, cz) + 0.2;
  const pillar = own(new CylinderGeometry(0.075, 0.085, depth, 10));
  const spots: [number, number][] = [];
  const along = (ax: number, az: number, bx: number, bz: number, step: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 0; i < n; i++) spots.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]);
  };
  along(x0 + INSET, z1 - INSET, x0 + INSET, z0 + INSET, 1.5);
  along(x0 + INSET, z0 + INSET, x1 - INSET, z0 + INSET, 1.5);
  along(x1 - INSET, z0 + INSET, x1 - INSET, z1 - INSET, 1.5);
  along(x1 - INSET, z1 - INSET, x0 + INSET, z1 - INSET, 1.5);
  const pillars = new InstancedMesh(pillar, red, spots.length);
  const m = new Matrix4();
  spots.forEach(([x, z], i) => {
    pillars.setMatrixAt(i, m.makeTranslation(x, plan.deck - 0.18 - depth / 2, z));
  });
  pillars.castShadow = true;
  pillars.receiveShadow = true;
  group.add(pillars);

  // The railings: posts, a top rail and a middle one, on three sides.
  const rails: Mesh[] = [];
  const railTop = own(new BoxGeometry(1, 0.045, 0.1));
  const railMid = own(new BoxGeometry(1, 0.035, 0.055));
  for (const [ax, az, bx, bz] of railRuns(plan)) {
    const len = Math.hypot(bx - ax, bz - az);
    const turn = Math.atan2(-(bz - az), bx - ax);
    for (const [geometry, y] of [
      [railTop, RAIL_H],
      [railMid, RAIL_H * 0.5],
    ] as const) {
      const rail = new Mesh(geometry, red);
      rail.scale.x = len + 0.12;
      rail.rotation.y = turn;
      rail.position.set((ax + bx) / 2, plan.deck + y, (az + bz) / 2);
      rail.castShadow = true;
      rails.push(rail);
    }
  }
  const post = own(new BoxGeometry(POST, RAIL_H, POST));
  const unique = railPosts(plan);
  const postMesh = new InstancedMesh(post, red, unique.length);
  unique.forEach(([x, z], i) => {
    postMesh.setMatrixAt(i, m.makeTranslation(x, plan.deck + RAIL_H / 2, z));
  });
  postMesh.castShadow = true;
  postMesh.receiveShadow = true;
  group.add(postMesh, ...rails);

  // Bronze finials (giboshi) on the corner posts and at the railings' ends.
  const profile = [
    [0, 0],
    [0.05, 0],
    [0.05, 0.02],
    [0.035, 0.035],
    [0.06, 0.07],
    [0.055, 0.1],
    [0.03, 0.13],
    [0.008, 0.16],
    [0, 0.17],
  ].map(([x, y]) => new Vector2(x, y));
  const finial = own(new LatheGeometry(profile, 14));
  const bronze = own(new MeshStandardMaterial({ color: "#7a6232", roughness: 0.35, metalness: 0.85 }));
  const ends = railRuns(plan).flatMap(([ax, az, bx, bz]): [number, number][] => [
    [ax, az],
    [bx, bz],
  ]);
  for (const [x, z] of ends) {
    const f = new Mesh(finial, bronze);
    f.position.set(x, plan.deck + RAIL_H + 0.02, z);
    f.castShadow = true;
    group.add(f);
  }
  return {
    group,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}
