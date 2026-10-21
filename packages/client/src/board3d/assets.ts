/**
 * Loading of the arena (PLAN-W W5): the manifest built by `tools/arena-assets.ts`, the HDRI (prefiltered for the
 * reflections), the table's materials (KTX2) and the props (GLB, meshopt-compressed, KTX2 textures). Nothing is built
 * (manifest version 0): null, and the 3D board keeps its plain table; something fails, or no file finishes for
 * `STALL_MS` (a decoder that fails in its worker never answers): it throws, and the board keeps its plain table too.
 */
import {
  type Material,
  type Mesh,
  type Object3D,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { ArenaManifest } from "./arena";

/** The arenas' folder; the basis transcoder is shared by them. */
const ROOT = `${import.meta.env.BASE_URL}arena/`;
/** The arena is given up when no file has finished (downloaded and decoded) for this long. */
export const STALL_MS = 20_000;

/** The maps of one of the table's materials, tiled every `tile` world units. */
export interface ArenaMaterial {
  tile: number;
  map?: Texture;
  normalMap?: Texture;
  /** Ambient occlusion, roughness, metalness (R, G, B). */
  arm?: Texture;
}

export interface Arena {
  manifest: ArenaManifest;
  environment: Texture;
  materials: Record<string, ArenaMaterial>;
  models: Map<string, Object3D>;
  dispose(): void;
}

/**
 * `progress`: the share of the arena's files loaded, in [0, 1] (the loading screen's bar); the total is known from the
 * manifest, so the bar never goes back.
 */
export async function loadArena(
  renderer: WebGLRenderer,
  id: string,
  progress: (share: number) => void = () => {},
): Promise<Arena | null> {
  const BASE = `${ROOT}${id}/`;
  const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" }).catch(() => null);
  const manifest = res?.ok ? ((await res.json()) as ArenaManifest) : null;
  if (!manifest?.version || !manifest.hdri) return null;
  const maps = Object.values(manifest.materials ?? {}).reduce((n, m) => n + [m.diff, m.nor_gl, m.arm].filter(Boolean).length, 0);
  // The HDRI, the maps, the models: the bar counts them finished (decoded, not only downloaded), and the watchdog
  // restarts with each.
  const expected = 1 + maps + Object.keys(manifest.models ?? {}).length;
  let finished = 0;
  let gaveUp = false;
  let timer = 0;
  let stalled: (e: Error) => void = () => {};
  const watchdog = new Promise<never>((_, reject) => {
    stalled = reject;
  });
  const arm = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => stalled(new Error(`no file finished for ${STALL_MS / 1000} s`)), STALL_MS);
  };
  const done = () => {
    progress(Math.min(1, ++finished / expected));
    arm();
  };
  const ktx2 = new KTX2Loader().setTranscoderPath(`${ROOT}basis/`).detectSupport(renderer);
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const pmrem = new PMREMGenerator(renderer);
  const owned: { dispose(): void }[] = [ktx2, pmrem];
  // What arrives after the arena was given up is freed at once.
  const own = (o: { dispose(): void }) => (gaveUp ? o.dispose() : owned.push(o));
  const load = async (): Promise<Arena> => {
    const hdr = await new HDRLoader().loadAsync(`${BASE}${manifest.hdri}`);
    const environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    own(environment);
    done();
    const texture = async (file: string | undefined, color: boolean) => {
      if (!file) return undefined;
      const t = await ktx2.loadAsync(`${BASE}${file}`);
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      if (color) t.colorSpace = SRGBColorSpace;
      own(t);
      done();
      return t;
    };
    const materials: Record<string, ArenaMaterial> = {};
    for (const [slot, m] of Object.entries(manifest.materials ?? {})) {
      const [map, normalMap, arm] = await Promise.all([texture(m.diff, true), texture(m.nor_gl, false), texture(m.arm, false)]);
      materials[slot] = { tile: m.tile, map, normalMap, arm };
    }
    const models = new Map<string, Object3D>();
    await Promise.all(
      Object.entries(manifest.models ?? {}).map(async ([id, file]) => {
        const scene = (await gltf.loadAsync(`${BASE}${file}`)).scene;
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          own(mesh.geometry);
          for (const mat of ([] as Material[]).concat(mesh.material)) {
            own(mat);
            for (const v of Object.values(mat)) if ((v as Texture | null)?.isTexture) own(v as Texture);
          }
        });
        models.set(id, scene);
        done();
      }),
    );
    return {
      manifest,
      environment,
      materials,
      models,
      dispose: () => {
        for (const o of owned) o.dispose();
      },
    };
  };
  try {
    arm();
    return await Promise.race([load(), watchdog]);
  } catch (e) {
    gaveUp = true;
    for (const o of owned) o.dispose();
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}
