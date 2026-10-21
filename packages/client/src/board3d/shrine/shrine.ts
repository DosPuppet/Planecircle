/**
 * The shrine (PLAN-X): a hinoki stage over a tidal bay at night, the battlefields on it; built in code, dressed with the
 * arena's CC0 materials and models (`tools/arena-assets.json`, arena "shrine"). Loaded in a chunk of its own when this
 * arena is chosen.
 *
 * The plan (`plan.ts`) lays out the stage, the banks, the seabed and the landmarks around the rim. X1, the ground: the
 * terrain, the water (waves, tide, reflections), the stage, the mist and the moonlight. X2, the architecture: the torii
 * in the water and the hall behind it (the far left corner), the pagoda on its islet and the bridge to it (the far
 * right), the lanterns, tatami on the battlefields. X3, the season (`season.ts`, from the real date): the trees, the
 * bamboo, the grass, the shrubs (`trees.ts`), what falls (`fall.ts`), the snow in winter. Built again when the table changes shape; animated by `update`
 * (water, tide, mist, lanterns) at the quality's rate.
 */
import { Color, FogExp2, Group, type Light, type Object3D, type Scene, Vector3 } from "three";
import type { Bounds } from "../arena";
import type { Diorama, DioramaContext } from "../diorama";
import type { Quality } from "../quality";
import { bridge, buildingMaterials, hall, pagoda } from "./buildings";
import { createFall, type Fall } from "./fall";
import { createGround, type Ground } from "./ground";
import { createLanterns, type Lanterns, lanternLight } from "./lanterns";
import { createMist, type Mist } from "./mist";
import { type ShrinePlan, shrinePlan } from "./plan";
import { SEASONS, snowCover } from "./season";
import { createSky, MOON_DIR } from "./sky";
import { createStage, lacquer, type Stage } from "./stage";
import { dressMats, tatami } from "./tatami";
import { createTorii } from "./torii";
import { createVegetation, type Vegetation } from "./trees";
import { createWater, REFLECT, reflected, type Water } from "./water";

/** Grid cells per world unit of the terrain, and of the water's grid, at each quality. */
const DETAIL: Record<Quality, { ground: number; water: number; sheets: number; plants: number; falling: number }> = {
  high: { ground: 4, water: 360, sheets: 3, plants: 1, falling: 280 },
  medium: { ground: 3, water: 240, sheets: 2, plants: 0.7, falling: 150 },
  low: { ground: 2, water: 140, sheets: 1, plants: 0.45, falling: 0 },
};

/** The lights of the scene are drawn in the planar reflection too (the same lights: no shader compiled for it). */
function lightsReflected(scene: Scene) {
  scene.traverse((o) => {
    if ((o as Light).isLight) o.layers.enable(REFLECT);
  });
}

interface Parts {
  plan: ShrinePlan;
  ground: Ground;
  water: Water;
  stage: Stage;
  mist: Mist;
  lanterns: Lanterns;
  vegetation: Vegetation;
  fall: Fall | null;
  /** The buildings (their geometry is theirs, their materials shared). */
  buildings: Object3D[];
  disposeTorii(): void;
}

export function createShrine(ctx: DioramaContext): Diorama {
  const group = new Group();
  const night = new Color("#0a1322");
  ctx.scene.background = night;
  ctx.scene.fog = new FogExp2(night, 0.016);
  // Moonlight: cold, from high over the far left (the shadows fall towards you); the sky's fill, deep blue.
  ctx.key.color.set("#b4c6ea");
  ctx.key.intensity = 1.2;
  ctx.key.position.copy(MOON_DIR).multiplyScalar(30);
  ctx.hemi.color.set("#36507e");
  ctx.hemi.groundColor.set("#06090f");
  ctx.hemi.intensity = 0.5;
  // The two lantern lights, for good (a light added later compiles every material again).
  const lights: [ReturnType<typeof lanternLight>, ReturnType<typeof lanternLight>] = [lanternLight(), lanternLight()];
  group.add(...lights);
  ctx.scene.add(group);
  lightsReflected(ctx.scene);
  ctx.scene.remove(group);

  const sky = createSky(ctx.renderer, { zenith: "#03060d", horizon: "#0f2038", glow: "#24395c", stars: 0.22 });
  sky.dome.layers.set(REFLECT);
  sky.dome.renderOrder = -10;
  group.add(sky.dome);
  const look = SEASONS[ctx.season];
  const red = lacquer(ctx.arena.materials.cedar);
  const materials = buildingMaterials(ctx.arena.materials, red);
  for (const m of [red, materials.tiles, materials.stone, materials.wood, materials.dark]) snowCover(m, look.snow);
  const mats = tatami();
  dressMats(ctx.mats, mats);

  let quality = ctx.quality;
  let rim: Bounds | null = null;
  let parts: Parts | null = null;

  const clear = () => {
    if (!parts) return;
    group.remove(
      parts.ground.group,
      parts.water.mesh,
      parts.stage.group,
      parts.mist.group,
      parts.lanterns.group,
      parts.vegetation.group,
      ...(parts.fall ? [parts.fall.mesh] : []),
      ...parts.buildings,
    );
    parts.ground.dispose();
    parts.water.dispose();
    parts.stage.dispose();
    parts.mist.dispose();
    parts.lanterns.dispose();
    parts.vegetation.dispose();
    parts.fall?.dispose();
    parts.disposeTorii();
    for (const b of parts.buildings)
      b.traverse((o) => {
        (o as { geometry?: { dispose(): void } }).geometry?.dispose();
      });
    parts = null;
  };

  const build = () => {
    if (!rim) return;
    clear();
    const plan = shrinePlan(rim);
    const detail = DETAIL[quality];
    const ground = createGround(plan, ctx.arena.materials, ctx.arena.models, detail.ground, look.snow);
    const cx = (plan.stage.x0 + plan.stage.x1) / 2;
    const cz = (plan.stage.z0 + plan.stage.z1) / 2;
    const water = createWater({
      center: { x: cx, z: cz - 10 },
      size: 90,
      segments: detail.water,
      level: plan.level,
      seabed: plan.height,
      sky: sky.environment,
    });
    water.setPlanar(quality === "high");
    const stage = createStage(plan, ctx.arena.materials, look.snow);
    const mist = createMist(plan, "#a4b6d2");
    mist.setSheets(detail.sheets);
    const lanterns = createLanterns(plan, ctx.arena.materials, lights, look.snow);
    const vegetation = createVegetation(plan, ctx.arena.materials, ctx.arena.models, look, detail.plants);
    const falling = look.falling && detail.falling ? Math.round(detail.falling * look.falling.share) : 0;
    const fall = look.falling && falling ? createFall(plan, look.falling, falling) : null;
    lanterns.setAnimated(quality !== "low");

    // The torii in the water, its beams along the stage's side.
    const seabed = plan.height(plan.torii.x, plan.torii.z);
    const torii = createTorii({ span: 2.6, height: 2.2, depth: plan.level - seabed, red, snow: look.snow });
    torii.group.position.set(plan.torii.x, seabed, plan.torii.z);
    torii.group.rotation.y = Math.PI / 2;
    // The hall on the beach behind it, facing it.
    const hallGroup = hall(materials);
    hallGroup.position.set(plan.hall.x, plan.height(plan.hall.x, plan.hall.z) - 0.04, plan.hall.z);
    hallGroup.rotation.y = Math.PI / 2;
    // The pagoda on its islet, the bridge to it.
    const islet = plan.islet;
    const isletTop = plan.height(islet.x, islet.z);
    const pagodaGroup = pagoda(materials);
    pagodaGroup.position.set(islet.x + 0.1, isletTop - 0.03, islet.z - 0.05);
    pagodaGroup.rotation.y = -Math.PI / 2;
    const bridgeGroup = bridge(
      materials,
      new Vector3(plan.stage.x1 - 0.12, plan.deck, plan.bridge),
      new Vector3(islet.x - islet.r * 0.45, isletTop + 0.02, plan.bridge),
      plan.height(plan.stage.x1 + 0.6, plan.bridge),
    );
    const buildings = [torii.group, hallGroup, pagodaGroup, bridgeGroup];
    for (const o of [ground.group, stage.group, lanterns.group, vegetation.group, ...buildings]) reflected(o);
    group.add(ground.group, water.mesh, stage.group, mist.group, lanterns.group, vegetation.group, ...buildings);
    if (fall) group.add(fall.mesh);
    parts = { plan, ground, water, stage, mist, lanterns, vegetation, fall, buildings, disposeTorii: torii.dispose };
    step(clock);
  };

  let clock = 0;
  const step = (time: number) => {
    if (!parts) return;
    parts.water.update(time);
    const waterY = parts.plan.level + parts.water.tide;
    parts.ground.setWater(waterY);
    parts.mist.update(time);
    parts.lanterns.update(time, waterY);
    parts.fall?.update(time);
  };

  return {
    group,
    fps: (q: Quality) => (q === "high" ? 60 : q === "medium" ? 30 : 0),
    layout(r: Bounds) {
      rim = r;
      build();
    },
    update(_dt: number, time: number) {
      clock = time;
      step(time);
    },
    setQuality(q: Quality) {
      if (q === quality) return;
      quality = q;
      build();
    },
    dispose() {
      clear();
      sky.dispose();
      materials.dispose();
      red.dispose();
      mats.map.dispose();
      mats.normalMap.dispose();
      ctx.scene.fog = null;
    },
  };
}
