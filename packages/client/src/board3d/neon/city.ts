/**
 * The neon city's buildings (PLAN-Y): the towers around ours (one merged mesh: windows tiled in world units, each
 * building its own offset, dark roofs, neon lines along some roofs' edges), our tower and its roof (concrete, a
 * parapet on three sides with its neon tube, none raised on the near side), the helipad deck under the battlefields
 * (wet metal plates, hazard stripes at its edge, neon strips), the roof's clutter (air conditioners, vents, a water
 * tank, antenna masts, along the far ledge). Static, but for what the other modules animate.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import type { ArenaMaterial } from "../assets";
import { tiledMaterial } from "../shrine/ground";
import { merged, placed } from "../shrine/kit";
import type { Building, NeonPlan } from "./plan";
import { FACADES, type Facade, facade, hazard, NEON } from "./textures";

/** World units of facade one tile covers, by style (its floors and bays at a believable size beside the cards). */
const TILE: Record<Facade, number> = { glass: 3.2, concrete: 3.4, flats: 3, works: 2.6 };

/** A building's facade style, from its seed (ours: glass). */
export function styleOf(b: Building): Facade {
  return FACADES[b.seed % FACADES.length] as Facade;
}

/** A building's box from the street to its roof, its sides' UVs in world units (offset by its seed), its top dark. */
function buildingBox(b: Building, street: number, tile: number): BufferGeometry {
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const h = b.top - street;
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv");
  const shift = (b.seed % 7) * 0.13;
  // Faces in order: +x, -x, +y, -y, +z, -z; four vertices each.
  const size: [number, number][] = [
    [d, h],
    [d, h],
    [0, 0],
    [0, 0],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const [a, b2] = size[f] as [number, number];
      // The top and bottom: a dark corner of the tile (between windows).
      if (!a) uv.setXY(i, 0.005, 0.005);
      else uv.setXY(i, shift + (uv.getX(i) * a) / tile, (uv.getY(i) * b2) / tile);
    }
  return placed(g, [(b.x0 + b.x1) / 2, street + h / 2, (b.z0 + b.z1) / 2]);
}

export interface City {
  group: Group;
  /** The deck under the battlefields (the wet reflection is laid on it). */
  deck: Mesh;
  /** Where things glow, for the rain's and the steam's light: the beacons' places (antennas' tips). */
  beacons: Vector3[];
  /** Vents (steam rises from them). */
  vents: Vector3[];
  dispose(): void;
}

export function createCity(plan: NeonPlan, materials: Record<string, ArenaMaterial>): City {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const { stage, roof, street, deck } = plan;

  // The towers around, and ours: one mesh per facade style; glass reflects, concrete does not.
  const ours: Building = { ...roof, top: deck - 0.16, seed: 0 };
  for (const style of FACADES) {
    const list = [...plan.buildings, ours].filter((b) => styleOf(b) === style);
    if (!list.length) continue;
    const tex = facade(style);
    owned.push(tex.map, tex.emissive);
    const material = own(
      new MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: new Color("#ffffff"),
        emissiveIntensity: 1.25,
        roughness: style === "glass" ? 0.18 : style === "flats" ? 0.6 : 0.75,
        metalness: style === "glass" ? 0.6 : 0.1,
        envMapIntensity: style === "glass" ? 1.4 : 0.6,
      }),
    );
    const mesh = new Mesh(own(merged(list.map((b) => buildingBox(b, street, TILE[style])))), material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Neon lines along some roofs' edges (one mesh per color).
  const lines = new Map<string, BufferGeometry[]>();
  for (const b of plan.buildings) {
    if (b.seed % 3 === 0) continue;
    const color = NEON[b.seed % NEON.length] as string;
    const list = lines.get(color) ?? [];
    const y = b.top + 0.02;
    const t = 0.05;
    list.push(
      placed(new BoxGeometry(b.x1 - b.x0, t, t), [(b.x0 + b.x1) / 2, y, b.z1]),
      placed(new BoxGeometry(b.x1 - b.x0, t, t), [(b.x0 + b.x1) / 2, y, b.z0]),
      placed(new BoxGeometry(t, t, b.z1 - b.z0), [b.x0, y, (b.z0 + b.z1) / 2]),
      placed(new BoxGeometry(t, t, b.z1 - b.z0), [b.x1, y, (b.z0 + b.z1) / 2]),
    );
    // A band of light around some, a floor below the roof.
    if (b.seed % 4 === 1)
      list.push(
        placed(new BoxGeometry(b.x1 - b.x0 + 0.04, 0.06, b.z1 - b.z0 + 0.04), [
          (b.x0 + b.x1) / 2,
          b.top - 1.1,
          (b.z0 + b.z1) / 2,
        ]),
      );
    lines.set(color, list);
  }
  for (const [color, list] of lines) {
    const m = new Mesh(own(merged(list)), own(new MeshBasicMaterial({ color: new Color(color).multiplyScalar(2.2) })));
    group.add(m);
  }

  // Our roof: concrete beyond the deck; a parapet with its neon tube on the left, far and right sides.
  const concrete = own(tiledMaterial(materials.concrete, materials.concrete?.tile ?? 3, "#8a8e99"));
  const ledge = new Mesh(own(new BoxGeometry(roof.x1 - roof.x0, 0.14, roof.z1 - roof.z0)), concrete);
  ledge.position.set((roof.x0 + roof.x1) / 2, deck - 0.09, (roof.z0 + roof.z1) / 2);
  ledge.receiveShadow = true;
  group.add(ledge);
  const wall: BufferGeometry[] = [];
  const tube: BufferGeometry[] = [];
  const H = 0.3;
  for (const [x, z, w, d] of [
    [roof.x0 + 0.08, (roof.z0 + roof.z1) / 2, 0.16, roof.z1 - roof.z0],
    [roof.x1 - 0.08, (roof.z0 + roof.z1) / 2, 0.16, roof.z1 - roof.z0],
    [(roof.x0 + roof.x1) / 2, roof.z0 + 0.08, roof.x1 - roof.x0, 0.16],
  ] as const) {
    wall.push(placed(new BoxGeometry(w, H, d), [x, deck + H / 2, z]));
    tube.push(placed(new BoxGeometry(Math.max(0.04, w - 0.1), 0.04, Math.max(0.04, d - 0.1)), [x, deck + H + 0.02, z]));
  }
  // On the near side, the tube lies flat on the roof's edge.
  tube.push(placed(new BoxGeometry(roof.x1 - roof.x0, 0.03, 0.04), [(roof.x0 + roof.x1) / 2, deck + 0.015, roof.z1 - 0.05]));
  const parapet = new Mesh(own(merged(wall)), concrete);
  parapet.castShadow = true;
  parapet.receiveShadow = true;
  const tubes = new Mesh(own(merged(tube)), own(new MeshBasicMaterial({ color: new Color("#22e4ff").multiplyScalar(2.4) })));
  group.add(parapet, tubes);

  // The helipad deck: metal plates, wet (low roughness), hazard stripes at its edge, a magenta strip around it.
  const plates = own(tiledMaterial(materials.deck, materials.deck?.tile ?? 2, "#7e8494"));
  plates.roughness = 1;
  const w = stage.x1 - stage.x0;
  const d = stage.z1 - stage.z0;
  const deckMesh = new Mesh(own(new PlaneGeometry(w, d)), plates);
  deckMesh.rotation.x = -Math.PI / 2;
  deckMesh.position.set((stage.x0 + stage.x1) / 2, deck, (stage.z0 + stage.z1) / 2);
  const uv = deckMesh.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  const stripes = hazard();
  owned.push(stripes);
  const band = (x: number, z: number, length: number, along: "x" | "z") => {
    const map = own(stripes.clone());
    map.repeat.set(length / 0.5, 1);
    const m = new Mesh(own(new PlaneGeometry(length, 0.12)), own(new MeshBasicMaterial({ map, color: "#b9b9b9" })));
    m.rotation.x = -Math.PI / 2;
    if (along === "z") m.rotation.z = Math.PI / 2;
    m.position.set(x, deck + 0.003, z);
    return m;
  };
  const cx = (stage.x0 + stage.x1) / 2;
  const cz = (stage.z0 + stage.z1) / 2;
  group.add(
    band(cx, stage.z0 + 0.06, w, "x"),
    band(cx, stage.z1 - 0.06, w, "x"),
    band(stage.x0 + 0.06, cz, d, "z"),
    band(stage.x1 - 0.06, cz, d, "z"),
  );
  const strip: BufferGeometry[] = [
    placed(new BoxGeometry(w, 0.02, 0.03), [cx, deck + 0.01, stage.z0 - 0.04]),
    placed(new BoxGeometry(w, 0.02, 0.03), [cx, deck + 0.01, stage.z1 + 0.04]),
    placed(new BoxGeometry(0.03, 0.02, d), [stage.x0 - 0.04, deck + 0.01, cz]),
    placed(new BoxGeometry(0.03, 0.02, d), [stage.x1 + 0.04, deck + 0.01, cz]),
  ];
  group.add(new Mesh(own(merged(strip)), own(new MeshBasicMaterial({ color: new Color("#ff2bd6").multiplyScalar(2.2) }))));

  // The roof's clutter, on the far ledge (the sides stay clear: the camera looks past them into the city).
  const metal = own(tiledMaterial(materials.corrugated, materials.corrugated?.tile ?? 2, "#9aa0aa"));
  const grate = own(tiledMaterial(materials.grate, materials.grate?.tile ?? 1.5, "#a0a0a0"));
  const dark = own(new MeshStandardMaterial({ color: "#20232b", roughness: 0.5, metalness: 0.6 }));
  const boxes: BufferGeometry[] = [];
  const tops: BufferGeometry[] = [];
  const poles: BufferGeometry[] = [];
  const vents: Vector3[] = [];
  const beacons: Vector3[] = [];
  const farZ = (roof.z0 + stage.z0) / 2;
  // Air conditioners and vents in a row along the far ledge, their fans' grates on top; the vents steam.
  let k = 0;
  for (let x = stage.x0 + 1.6; x < stage.x1 - 1.2; x += 1.45, k++)
    if (k % 3 === 2) {
      poles.push(placed(new CylinderGeometry(0.09, 0.11, 0.5, 12), [x, deck + 0.25, farZ]));
      poles.push(placed(new CylinderGeometry(0.14, 0.14, 0.06, 12), [x, deck + 0.52, farZ]));
      vents.push(new Vector3(x, deck + 0.56, farZ));
    } else {
      boxes.push(placed(new BoxGeometry(0.9, 0.42, 0.75), [x, deck + 0.21, farZ]));
      tops.push(placed(new CylinderGeometry(0.28, 0.28, 0.02, 16), [x, deck + 0.43, farZ]));
    }
  // A water tank on the far left corner; antenna masts on the far corners, their beacons blinking.
  poles.push(placed(new CylinderGeometry(0.42, 0.42, 0.9, 20), [roof.x0 + 0.6, deck + 0.45, roof.z0 + 0.6]));
  for (const [x, z] of [
    [stage.x0 + 0.2, roof.z0 + 0.3],
    [roof.x1 - 0.3, roof.z0 + 0.3],
  ] as const) {
    poles.push(placed(new CylinderGeometry(0.025, 0.05, 2.2, 6), [x, deck + 1.1, z]));
    for (const y of [0.7, 1.4]) poles.push(placed(new CylinderGeometry(0.22, 0.22, 0.015, 3), [x, deck + y, z]));
    beacons.push(new Vector3(x, deck + 2.22, z));
  }
  const acs = new Mesh(own(merged(boxes)), metal);
  const fans = new Mesh(own(merged(tops)), grate);
  const pipes = new Mesh(own(merged(poles)), dark);
  for (const m of [acs, fans, pipes]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(acs, fans, pipes);
  return {
    group,
    deck: deckMesh,
    beacons,
    vents,
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
