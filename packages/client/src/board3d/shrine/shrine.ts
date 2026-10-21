/**
 * The shrine (PLAN-X): a hinoki stage over a tidal bay at night, the battlefields on it; built in code, dressed with the
 * arena's CC0 materials (`tools/arena-assets.json`, arena "shrine"). Loaded in a chunk of its own when this arena is
 * chosen. X0: the stage and the bay; the rest comes lot by lot.
 */
import {
  BoxGeometry,
  Color,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  type Texture,
} from "three";
import type { Bounds } from "../arena";
import type { ArenaMaterial } from "../assets";
import type { Diorama, DioramaContext } from "../diorama";
import type { Quality } from "../quality";

/** A material from the arena's maps, tiled every `tile` world units over `size` (UVs from 0 to 1). */
export function arenaMaterial(m: ArenaMaterial | undefined, repeat: [number, number], base = "#ffffff"): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: base, roughness: 1, metalness: 0 });
  if (!m) return mat;
  const tiled = (t: Texture | undefined) => {
    if (!t) return null;
    const c = t.clone();
    c.wrapS = RepeatWrapping;
    c.wrapT = RepeatWrapping;
    c.repeat.set(...repeat);
    c.channel = 0;
    return c;
  };
  mat.map = tiled(m.map);
  mat.normalMap = tiled(m.normalMap);
  const arm = tiled(m.arm);
  mat.aoMap = arm;
  mat.roughnessMap = arm;
  mat.metalnessMap = arm;
  return mat;
}

export function createShrine(ctx: DioramaContext): Diorama {
  const group = new Group();
  const night = new Color("#0b1424");
  ctx.scene.background = night;
  ctx.scene.fog = new FogExp2(night, 0.012);
  // Moonlight: cold, from the far side; the sky's fill, deep blue.
  ctx.key.color.set("#9fb6e0");
  ctx.key.intensity = 0.9;
  ctx.key.position.set(-8, 16, -14);
  ctx.hemi.color.set("#3a5580");
  ctx.hemi.groundColor.set("#05080f");
  ctx.hemi.intensity = 0.5;

  const stageMat = arenaMaterial(ctx.arena.materials.stage, [1, 1]);
  const water = new Mesh(
    new PlaneGeometry(200, 200),
    new MeshStandardMaterial({ color: "#0a2236", roughness: 0.15, metalness: 0.2 }),
  );
  water.rotateX(-Math.PI / 2);
  water.position.y = -0.6;
  const stage = new Mesh(new BoxGeometry(1, 0.5, 1), stageMat);
  stage.receiveShadow = true;
  group.add(water, stage);

  return {
    group,
    fps: (q: Quality) => (q === "high" ? 60 : q === "medium" ? 30 : 0),
    layout(rim: Bounds) {
      // The stage: the battlefields' rim and a walkway around them.
      const w = rim.x1 - rim.x0 + 3;
      const d = rim.z1 - rim.z0 + 3;
      stage.scale.set(w, 1, d);
      stage.position.set((rim.x0 + rim.x1) / 2, -0.27, (rim.z0 + rim.z1) / 2);
      const map = stageMat.map;
      if (map) map.repeat.set(w / 6, d / 6);
    },
    update() {},
    setQuality() {},
    dispose() {
      group.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      stageMat.dispose();
      ctx.scene.fog = null;
    },
  };
}
