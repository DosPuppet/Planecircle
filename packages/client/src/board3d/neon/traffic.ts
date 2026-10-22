/**
 * The neon city's traffic (PLAN-Y), its moving lights:
 * - the streets far below: streams of headlights one way, taillights the other, along the avenues;
 * - flying cars on lanes beside the roof and beyond its far edge, each its lights and a trail; on the near side they
 *   fly under the deck (anything raised there would rise into your battlefield);
 * - drones hovering by the roof's sides, their lights blinking;
 * - searchlights rising from the streets through the canyons, sweeping;
 * - a maglev train crossing on its guideway beside the roof every `TRAIN_EVERY` seconds, its windows lit.
 * Every position a function of the time (no state). Instanced and additive: a few draw calls.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { merged, placed } from "../shrine/kit";
import { noise } from "../shrine/plan";
import type { NeonPlan } from "./plan";
import { NEON } from "./textures";

export const TRAIN_EVERY = 25;
const TRAIN_CARS = 5;

function glowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** A beam: bright at its source, fading along it. */
function beamTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createLinearGradient(0, 128, 0, 0);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 16, 128);
  return new CanvasTexture(c);
}

/** A flying car's lane: a straight line it goes along (wrapping), at a height. */
interface Lane {
  from: Vector3;
  to: Vector3;
  speed: number;
  cars: number;
  color: string;
}

export interface Traffic {
  group: Group;
  update(time: number): void;
  dispose(): void;
}

export function createTraffic(o: { plan: NeonPlan; camera: PerspectiveCamera; amount: number }): Traffic {
  const { plan, camera } = o;
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    owned.push(x);
    return x;
  };
  const { roof, deck, street } = plan;
  const glow = own(glowTexture());
  const m = new Matrix4();
  const p = new Vector3();
  const s = new Vector3();
  const q = new Quaternion();
  const c = new Color();

  // Street lights: on each avenue near us, two lanes, lights in strings.
  const streams: { a: Vector3; b: Vector3; dir: 1 | -1; phase: number }[] = [];
  for (const x of plan.avenues.x.filter((x) => Math.abs(x - (roof.x0 + roof.x1) / 2) < 30))
    for (const dir of [1, -1] as const)
      streams.push({
        a: new Vector3(x + dir * 0.4, street + 0.2, roof.z0 - 40),
        b: new Vector3(x + dir * 0.4, street + 0.2, roof.z1 + 16),
        dir,
        phase: x * 3.1,
      });
  for (const z of plan.avenues.z.filter((z) => z > roof.z0 - 30 && z < roof.z1 + 12))
    for (const dir of [1, -1] as const)
      streams.push({
        a: new Vector3(roof.x0 - 40, street + 0.2, z + dir * 0.4),
        b: new Vector3(roof.x1 + 40, street + 0.2, z + dir * 0.4),
        dir,
        phase: z * 1.7,
      });
  const perStream = Math.max(6, Math.round(26 * o.amount));
  const streetCount = streams.length * perStream;
  const streetMesh = new InstancedMesh(
    own(new PlaneGeometry(1, 1)),
    own(new MeshBasicMaterial({ map: glow, blending: AdditiveBlending, depthWrite: false, transparent: true })),
    Math.max(1, streetCount),
  );
  streetMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  streetMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, streetCount) * 3), 3);
  streetMesh.frustumCulled = false;
  own(streetMesh);
  const head = new Color("#fff1d0").multiplyScalar(1.4);
  const tail = new Color("#ff2030").multiplyScalar(1.4);
  streams.forEach((st, i) => {
    for (let k = 0; k < perStream; k++) streetMesh.setColorAt(i * perStream + k, st.dir > 0 ? head : tail);
  });

  // Flying cars: lanes beside the roof (under the deck on the near side), and beyond its far edge.
  const lanes: Lane[] = [
    {
      from: new Vector3(roof.x0 - 1.4, deck - 0.6, roof.z1 + 8),
      to: new Vector3(roof.x0 - 1.4, deck - 0.6, roof.z0 - 18),
      speed: 3.2,
      cars: 3,
      color: NEON[1] as string,
    },
    {
      from: new Vector3(roof.x1 + 1.5, deck - 1.4, roof.z0 - 18),
      to: new Vector3(roof.x1 + 1.5, deck - 1.4, roof.z1 + 8),
      speed: 2.6,
      cars: 3,
      color: NEON[0] as string,
    },
    {
      from: new Vector3(roof.x0 - 3.2, deck + 0.9, roof.z0 - 16),
      to: new Vector3(roof.x0 - 3.2, deck + 0.9, roof.z1 - 1),
      speed: 2.2,
      cars: 2,
      color: NEON[3] as string,
    },
    {
      from: new Vector3(roof.x1 + 3.4, deck + 0.6, roof.z1 - 1),
      to: new Vector3(roof.x1 + 3.4, deck + 0.6, roof.z0 - 16),
      speed: 2.9,
      cars: 2,
      color: NEON[2] as string,
    },
    {
      from: new Vector3(roof.x0 - 20, deck - 2.5, roof.z0 - 2.2),
      to: new Vector3(roof.x1 + 20, deck - 2.5, roof.z0 - 2.2),
      speed: 4,
      cars: 3,
      color: NEON[5] as string,
    },
    {
      from: new Vector3(roof.x1 + 20, deck - 1.2, roof.z1 + 2.5),
      to: new Vector3(roof.x0 - 20, deck - 1.2, roof.z1 + 2.5),
      speed: 3.5,
      cars: 2,
      color: NEON[4] as string,
    },
  ];
  const cars = lanes.flatMap((lane, l) =>
    Array.from({ length: Math.max(1, Math.round(lane.cars * Math.max(0.5, o.amount))) }, (_, k) => ({
      lane,
      offset: k / lane.cars + noise(l, k) * 0.2,
    })),
  );
  const body = own(
    merged([placed(new BoxGeometry(0.42, 0.1, 0.2), [0, 0, 0]), placed(new BoxGeometry(0.22, 0.08, 0.16), [-0.02, 0.08, 0])]),
  );
  const carMesh = new InstancedMesh(
    body,
    own(new MeshStandardMaterial({ color: "#191b22", roughness: 0.3, metalness: 0.8 })),
    cars.length,
  );
  carMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  carMesh.frustumCulled = false;
  own(carMesh);
  // Each car: a headlight, a taillight, an underglow of its lane's color, and a trail.
  const lightMesh = new InstancedMesh(
    own(new PlaneGeometry(1, 1)),
    own(new MeshBasicMaterial({ map: glow, blending: AdditiveBlending, depthWrite: false, transparent: true })),
    cars.length * 3,
  );
  lightMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  lightMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cars.length * 9), 3);
  lightMesh.frustumCulled = false;
  own(lightMesh);
  const beam = own(beamTexture());
  const trailMesh = new InstancedMesh(
    own(new PlaneGeometry(1, 1)),
    own(new MeshBasicMaterial({ map: beam, blending: AdditiveBlending, depthWrite: false, transparent: true, side: 2 })),
    cars.length,
  );
  trailMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  trailMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cars.length * 3), 3);
  trailMesh.frustumCulled = false;
  own(trailMesh);
  cars.forEach((car, i) => {
    lightMesh.setColorAt(i * 3, c.set("#ffffff").multiplyScalar(1.6));
    lightMesh.setColorAt(i * 3 + 1, c.set("#ff2030").multiplyScalar(1.4));
    lightMesh.setColorAt(i * 3 + 2, c.set(car.lane.color).multiplyScalar(1.2));
    trailMesh.setColorAt(i, c.set(car.lane.color).multiplyScalar(0.7));
  });

  // Drones by the roof's sides, blinking.
  const drones = [
    { x: roof.x0 - 0.8, z: roof.z0 + 2.2, y: deck + 1.1, phase: 0 },
    { x: roof.x1 + 0.9, z: roof.z0 + 3.4, y: deck + 0.9, phase: 2.1 },
    { x: (roof.x0 + roof.x1) / 2 - 3, z: roof.z0 - 1.2, y: deck + 0.5, phase: 4.3 },
  ];
  const droneBody = own(
    merged([
      placed(new BoxGeometry(0.16, 0.04, 0.16), [0, 0, 0]),
      ...[-1, 1].flatMap((a) => [-1, 1].map((b) => placed(new BoxGeometry(0.1, 0.01, 0.02), [a * 0.1, 0.02, b * 0.1]))),
    ]),
  );
  const droneMesh = new InstancedMesh(
    droneBody,
    own(new MeshStandardMaterial({ color: "#2a2d36", roughness: 0.4, metalness: 0.7 })),
    drones.length,
  );
  droneMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  own(droneMesh);
  const ledMesh = new InstancedMesh(
    own(new PlaneGeometry(1, 1)),
    own(new MeshBasicMaterial({ map: glow, blending: AdditiveBlending, depthWrite: false, transparent: true })),
    drones.length * 2,
  );
  ledMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  ledMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(drones.length * 6), 3);
  ledMesh.frustumCulled = false;
  own(ledMesh);

  // Searchlights from the streets, rising through the canyons beside us.
  const coneGeo = own(new ConeGeometry(1.1, 22, 20, 1, true));
  coneGeo.translate(0, -11, 0);
  coneGeo.rotateX(Math.PI);
  const searchlights = [
    { at: new Vector3(roof.x0 - 1.5, street, roof.z0 + 3), color: "#9fd8ff", phase: 0 },
    { at: new Vector3(roof.x1 + 1.6, street, roof.z0 - 1), color: "#ffd2f6", phase: 1.9 },
    { at: new Vector3(roof.x0 - 6, street, roof.z0 - 4), color: "#bfffe6", phase: 3.3 },
  ].map((sl) => {
    const mat = own(
      new MeshBasicMaterial({
        map: beam,
        color: new Color(sl.color).multiplyScalar(0.22),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        side: 2,
      }),
    );
    const cone = new Mesh(coneGeo, mat);
    cone.position.copy(sl.at);
    cone.renderOrder = 3;
    group.add(cone);
    return { cone, phase: sl.phase };
  });

  // The maglev: a guideway beside the roof's left, the train sweeping along it.
  const railZ = { from: roof.z1 + 14, to: roof.z0 - 26 };
  const railX = roof.x0 - 2.3;
  const railY = deck - 3.2;
  const guide = new Mesh(
    own(new BoxGeometry(0.3, 0.16, railZ.from - railZ.to)),
    own(new MeshStandardMaterial({ color: "#3a3f4c", roughness: 0.6, metalness: 0.5 })),
  );
  guide.position.set(railX, railY - 0.15, (railZ.from + railZ.to) / 2);
  const stripe = new Mesh(
    own(new BoxGeometry(0.04, 0.02, railZ.from - railZ.to)),
    own(new MeshBasicMaterial({ color: new Color("#22e4ff").multiplyScalar(1.8) })),
  );
  stripe.position.set(railX + 0.16, railY - 0.1, (railZ.from + railZ.to) / 2);
  const carGeo = own(new BoxGeometry(0.5, 0.42, 1.9));
  const train = new InstancedMesh(
    carGeo,
    own(
      new MeshStandardMaterial({
        color: "#d9dde6",
        roughness: 0.35,
        metalness: 0.6,
        emissive: new Color("#ffe6b0"),
        emissiveIntensity: 0.35,
      }),
    ),
    TRAIN_CARS,
  );
  train.instanceMatrix.setUsage(DynamicDrawUsage);
  train.frustumCulled = false;
  own(train);
  const windowsBand = new InstancedMesh(
    own(new BoxGeometry(0.52, 0.12, 1.75)),
    own(new MeshBasicMaterial({ color: new Color("#ffe9b8").multiplyScalar(1.8) })),
    TRAIN_CARS,
  );
  windowsBand.instanceMatrix.setUsage(DynamicDrawUsage);
  windowsBand.frustumCulled = false;
  own(windowsBand);
  group.add(streetMesh, carMesh, lightMesh, trailMesh, droneMesh, ledMesh, guide, stripe, train, windowsBand);

  const dir = new Vector3();
  const look = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  return {
    group,
    update(t: number) {
      streams.forEach((st, i) => {
        const len = st.a.distanceTo(st.b);
        for (let k = 0; k < perStream; k++) {
          const u = (((k / perStream + (st.dir * t * 2.2) / len + noise(i, k) * 0.03 + st.phase) % 1) + 1) % 1;
          p.lerpVectors(st.a, st.b, u);
          streetMesh.setMatrixAt(i * perStream + k, m.compose(p, camera.quaternion, s.setScalar(0.32)));
        }
      });
      streetMesh.instanceMatrix.needsUpdate = true;
      cars.forEach((car, i) => {
        const { from, to, speed } = car.lane;
        const len = from.distanceTo(to);
        const u = (((car.offset + (t * speed) / len) % 1) + 1) % 1;
        p.lerpVectors(from, to, u);
        p.y += 0.05 * Math.sin(t * 1.7 + i);
        dir.subVectors(to, from).normalize();
        look.setFromAxisAngle(yAxis, Math.atan2(-dir.z, dir.x));
        carMesh.setMatrixAt(i, m.compose(p, look, s.set(1, 1, 1)));
        const front = p.clone().addScaledVector(dir, 0.24);
        const back = p.clone().addScaledVector(dir, -0.24);
        lightMesh.setMatrixAt(i * 3, m.compose(front, camera.quaternion, s.setScalar(0.3)));
        lightMesh.setMatrixAt(i * 3 + 1, m.compose(back, camera.quaternion, s.setScalar(0.24)));
        lightMesh.setMatrixAt(i * 3 + 2, m.compose(p.clone().setY(p.y - 0.08), camera.quaternion, s.setScalar(0.55)));
        // The trail: a ribbon behind it, flat, along its way.
        const tailAt = p.clone().addScaledVector(dir, -1.1);
        q.setFromAxisAngle(yAxis, Math.atan2(-dir.z, dir.x) + Math.PI / 2).multiply(
          new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
        );
        trailMesh.setMatrixAt(i, m.compose(tailAt, q, s.set(0.12, 1.8, 1)));
      });
      carMesh.instanceMatrix.needsUpdate = true;
      lightMesh.instanceMatrix.needsUpdate = true;
      trailMesh.instanceMatrix.needsUpdate = true;
      drones.forEach((d, i) => {
        p.set(
          d.x + 0.25 * Math.sin(t * 0.5 + d.phase),
          d.y + 0.08 * Math.sin(t * 1.9 + d.phase),
          d.z + 0.25 * Math.cos(t * 0.4 + d.phase),
        );
        q.setFromAxisAngle(yAxis, t * 0.3 + d.phase);
        droneMesh.setMatrixAt(i, m.compose(p, q, s.set(1, 1, 1)));
        const blink = (t * 1.3 + d.phase) % 1 < 0.12;
        ledMesh.setMatrixAt(i * 2, m.compose(p.clone().setY(p.y - 0.03), camera.quaternion, s.setScalar(0.18)));
        ledMesh.setColorAt(i * 2, c.set(blink ? "#ff3030" : "#300808"));
        ledMesh.setMatrixAt(
          i * 2 + 1,
          m.compose(p.clone().add(new Vector3(0.08, 0.02, 0)), camera.quaternion, s.setScalar(0.14)),
        );
        ledMesh.setColorAt(i * 2 + 1, c.set(NEON[1] as string));
      });
      droneMesh.instanceMatrix.needsUpdate = true;
      ledMesh.instanceMatrix.needsUpdate = true;
      if (ledMesh.instanceColor) ledMesh.instanceColor.needsUpdate = true;
      for (const sl of searchlights) {
        sl.cone.rotation.set(0.35 * Math.sin(t * 0.23 + sl.phase), 0, 0.35 * Math.cos(t * 0.17 + sl.phase));
      }
      // The train: a pass every TRAIN_EVERY seconds, at speed.
      const run = (t % TRAIN_EVERY) / 5;
      const head = railZ.from + (railZ.to - railZ.from) * run;
      for (let k = 0; k < TRAIN_CARS; k++) {
        p.set(railX, railY + 0.21, head + k * 2.0);
        if (run > 1.4) p.y = -1000;
        train.setMatrixAt(k, m.compose(p, q.identity(), s.set(1, 1, 1)));
        windowsBand.setMatrixAt(k, m.compose(p.clone().setY(p.y + 0.06), q, s.set(1, 1, 1)));
      }
      train.instanceMatrix.needsUpdate = true;
      windowsBand.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const x of owned) x.dispose();
    },
  };
}
