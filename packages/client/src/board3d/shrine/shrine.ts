/**
 * The shrine (PLAN-X): a hinoki stage over a tidal bay at night, the battlefields on it; built in code, dressed with the
 * arena's CC0 materials and models (`tools/arena-assets.json`, arena "shrine"). Loaded in a chunk of its own when this
 * arena is chosen.
 *
 * X1, the ground: the plan (`plan.ts`) lays out the stage, the banks and the seabed around the rim; the terrain, the
 * water (waves, tide, reflections), the stage, the mist and the moonlight follow it. Built again when the table changes
 * shape; animated by `update` (water, tide, mist) at the quality's rate.
 */
import { Color, FogExp2, Group, type Light, type Scene } from "three";
import type { Bounds } from "../arena";
import type { Diorama, DioramaContext } from "../diorama";
import type { Quality } from "../quality";
import { createGround, type Ground } from "./ground";
import { createMist, type Mist } from "./mist";
import { type ShrinePlan, shrinePlan } from "./plan";
import { createSky, MOON_DIR } from "./sky";
import { createStage, type Stage } from "./stage";
import { createWater, REFLECT, reflected, type Water } from "./water";

/** Grid cells per world unit of the terrain, and of the water's grid, at each quality. */
const DETAIL: Record<Quality, { ground: number; water: number; sheets: number }> = {
  high: { ground: 4, water: 360, sheets: 3 },
  medium: { ground: 3, water: 240, sheets: 2 },
  low: { ground: 2, water: 140, sheets: 1 },
};

/** The lights of the scene are drawn in the planar reflection too (the same lights: no shader compiled for it). */
function lightsReflected(scene: Scene) {
  scene.traverse((o) => {
    if ((o as Light).isLight) o.layers.enable(REFLECT);
  });
}

export function createShrine(ctx: DioramaContext): Diorama {
  const group = new Group();
  const night = new Color("#0a1322");
  ctx.scene.background = night;
  ctx.scene.fog = new FogExp2(night, 0.016);
  // Moonlight: cold, from high over the far side (the shadows fall towards you); the sky's fill, deep blue.
  ctx.key.color.set("#b4c6ea");
  ctx.key.intensity = 1.35;
  ctx.key.position.copy(MOON_DIR).multiplyScalar(30);
  ctx.hemi.color.set("#36507e");
  ctx.hemi.groundColor.set("#06090f");
  ctx.hemi.intensity = 0.55;
  lightsReflected(ctx.scene);

  const sky = createSky(ctx.renderer, { zenith: "#03060d", horizon: "#0f2038", glow: "#24395c", stars: 0.5 });
  sky.dome.layers.set(REFLECT);
  sky.dome.renderOrder = -10;
  group.add(sky.dome);

  let quality = ctx.quality;
  let rim: Bounds | null = null;
  let parts: { plan: ShrinePlan; ground: Ground; water: Water; stage: Stage; mist: Mist } | null = null;

  const build = () => {
    if (!rim) return;
    if (parts) {
      group.remove(parts.ground.group, parts.water.mesh, parts.stage.group, parts.mist.group);
      parts.ground.dispose();
      parts.water.dispose();
      parts.stage.dispose();
      parts.mist.dispose();
    }
    const plan = shrinePlan(rim);
    const detail = DETAIL[quality];
    const ground = createGround(plan, ctx.arena.materials, ctx.arena.models, detail.ground);
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
    const stage = createStage(plan, ctx.arena.materials);
    const mist = createMist(plan, "#a4b6d2");
    mist.setSheets(detail.sheets);
    reflected(ground.group);
    reflected(stage.group);
    group.add(ground.group, water.mesh, stage.group, mist.group);
    parts = { plan, ground, water, stage, mist };
    step(0);
  };

  let clock = 0;
  const step = (time: number) => {
    if (!parts) return;
    parts.water.update(time);
    parts.ground.setWater(parts.plan.level + parts.water.tide);
    parts.mist.update(time);
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
      step(clock);
    },
    dispose() {
      if (parts) {
        parts.ground.dispose();
        parts.water.dispose();
        parts.stage.dispose();
        parts.mist.dispose();
      }
      sky.dispose();
      ctx.scene.fog = null;
    },
  };
}
