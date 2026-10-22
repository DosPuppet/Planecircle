/**
 * Dioramas of the 3D board (PLAN-X): an arena built in code around the table (the shrine), animated at the rate its
 * quality allows. The scene builds it once the arena's assets have loaded (behind the loading screen), lays it out
 * around the table's rim, and steps it each frame. Pure parts here (the season); the dioramas in their own lazy chunks.
 */
import type {
  DirectionalLight,
  HemisphereLight,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from "three";
import type { Bounds } from "./arena";
import type { Arena } from "./assets";
import type { Room } from "./camera";
import type { Quality } from "./quality";

export type Season = "spring" | "summer" | "autumn" | "winter";

/** The room each diorama keeps around the table (a narrower table), so its scenery shows at the sides and beyond. */
export const DIORAMA_ROOM: Record<string, Room> = { shrine: { side: 0.06, top: 0.05 }, neon: { side: 0.06, top: 0.05 } };

/** Each diorama's code, by the name its arena's manifest gives (a lazy chunk each). */
export const DIORAMAS: Record<string, () => Promise<DioramaFactory>> = {
  shrine: () => import("./shrine/shrine").then((m) => m.createShrine),
  neon: () => import("./neon/neon").then((m) => m.createNeon),
};

/** The season in Japan on a date: spring from March, summer from June, autumn from September, winter from December. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

/** The season now: the real date's; in development, the one asked for (`?season=winter`), to see each. */
export function seasonNow(): Season {
  const asked = import.meta.env.DEV ? new URLSearchParams(location.search).get("season") : null;
  return asked === "spring" || asked === "summer" || asked === "autumn" || asked === "winter" ? asked : seasonOf(new Date());
}

/** What a diorama receives: the scene and its lights to set, the arena's assets, the quality, the season. */
export interface DioramaContext {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  /** The light from above (the moon, at night) and the sky's fill. */
  key: DirectionalLight;
  hemi: HemisphereLight;
  /**
   * The scene's fire light (the tavern's fireplace): off unless the diorama lights it (`fireLit`), then placed and
   * driven by it; a point light, its shadows all around. Kept in place: its shadow maps are drawn again only when
   * something moves.
   */
  fire: PointLight;
  /** The battlefields' material (the diorama dresses them). */
  mats: MeshStandardMaterial;
  arena: Arena;
  quality: Quality;
  season: Season;
}

export interface Diorama {
  readonly group: Object3D;
  /** It lights the scene's fire (which then casts the shadows; with the moon's at the highest quality). */
  readonly fireLit: boolean;
  /** Frames a second it animates at, at a quality (0: still). */
  fps(q: Quality): number;
  /** Lays it out around the table's rim (world units), again when the screen changes shape. */
  layout(rim: Bounds): void;
  /** One step of its animations: `dt` seconds since the last, `time` seconds since it was built. */
  update(dt: number, time: number): void;
  setQuality(q: Quality): void;
  dispose(): void;
}

export type DioramaFactory = (ctx: DioramaContext) => Diorama;
