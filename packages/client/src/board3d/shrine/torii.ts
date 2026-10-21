/**
 * The torii (PLAN-X X2), after Itsukushima's (ryōbu torii): two main pillars standing in the water down to the seabed,
 * each braced by two lower legs (sodebashira) with black caps, the tie beam (nuki) through them, the vermilion shimaki
 * and the black lintel (kasagi) curving up at its ends, the central strut (gakuzuka) and its plaque. Built along x,
 * `height` above the water; its root on the seabed.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { curvedBeam, merged, placed } from "./kit";

export interface ToriiParts {
  group: Group;
  dispose(): void;
}

export function createTorii(o: { span: number; height: number; depth: number; red: MeshStandardMaterial }): ToriiParts {
  const { span, height, depth } = o;
  const half = span / 2;
  const top = depth + height * 0.84;
  const nukiY = depth + height * 0.6;
  const red: ReturnType<typeof placed>[] = [];
  const black: ReturnType<typeof placed>[] = [];
  for (const side of [-1, 1]) {
    const x = side * half;
    red.push(placed(new CylinderGeometry(0.085, 0.105, top, 16), [x, top / 2, 0]));
    // The legs, before and behind the pillar, tied to it twice.
    for (const zSide of [-1, 1]) {
      const legH = depth + height * 0.4;
      red.push(placed(new CylinderGeometry(0.05, 0.06, legH, 10), [x, legH / 2, zSide * 0.42]));
      black.push(placed(new BoxGeometry(0.15, 0.035, 0.15), [x, legH + 0.018, zSide * 0.42]));
      black.push(placed(new BoxGeometry(0.11, 0.05, 0.11), [x, legH - 0.02, zSide * 0.42]));
    }
    for (const y of [depth + height * 0.12, depth + height * 0.33])
      red.push(placed(new BoxGeometry(0.06, 0.055, 0.98), [x, y, 0]));
    // A black band at the pillar's foot, over the water.
    black.push(placed(new CylinderGeometry(0.11, 0.112, 0.14, 16), [x, depth + 0.05, 0]));
  }
  red.push(placed(new BoxGeometry(span + 0.55, 0.1, 0.085), [0, nukiY, 0]));
  red.push(placed(curvedBeam(span + 0.75, 0.085, 0.13, 0.05), [0, top + 0.04, 0]));
  black.push(placed(curvedBeam(span + 1.05, 0.11, 0.21, 0.13), [0, top + 0.135, 0]));
  red.push(placed(new BoxGeometry(0.075, top - nukiY, 0.07), [0, (top + nukiY) / 2, 0]));
  // The plaque: dark, framed in gold.
  const plaqueY = (top + nukiY) / 2 + 0.02;
  const gold = [placed(new BoxGeometry(0.2, 0.28, 0.03), [0, plaqueY, 0.045])];
  const dark = [placed(new BoxGeometry(0.16, 0.24, 0.02), [0, plaqueY, 0.058])];

  const blackMat = new MeshStandardMaterial({ color: "#131210", roughness: 0.55, metalness: 0 });
  const goldMat = new MeshStandardMaterial({ color: "#b08a3e", roughness: 0.3, metalness: 0.9 });
  const darkMat = new MeshStandardMaterial({ color: "#1b2236", roughness: 0.6 });
  const group = new Group();
  const meshes = [
    new Mesh(merged(red), o.red),
    new Mesh(merged(black), blackMat),
    new Mesh(merged(gold), goldMat),
    new Mesh(merged(dark), darkMat),
  ];
  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(...meshes);
  return {
    group,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      blackMat.dispose();
      goldMat.dispose();
      darkMat.dispose();
    },
  };
}
