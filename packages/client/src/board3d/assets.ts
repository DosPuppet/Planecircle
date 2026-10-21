/**
 * Loading of the arena (PLAN-W W5): the manifest built by `tools/arena-assets.ts`, the HDRI (prefiltered for the
 * reflections), the table's materials (KTX2) and the props (GLB, meshopt-compressed, KTX2 textures). Nothing is built
 * (manifest version 0) or something fails: null, and the 3D board keeps its plain table.
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

const BASE = `${import.meta.env.BASE_URL}arena/`;

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

export async function loadArena(renderer: WebGLRenderer): Promise<Arena | null> {
  const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" }).catch(() => null);
  const manifest = res?.ok ? ((await res.json()) as ArenaManifest) : null;
  if (!manifest?.version || !manifest.hdri) return null;
  const ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).detectSupport(renderer);
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const pmrem = new PMREMGenerator(renderer);
  const owned: { dispose(): void }[] = [ktx2, pmrem];
  try {
    const hdr = await new HDRLoader().loadAsync(`${BASE}${manifest.hdri}`);
    const environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    owned.push(environment);
    const texture = async (file: string | undefined, color: boolean) => {
      if (!file) return undefined;
      const t = await ktx2.loadAsync(`${BASE}${file}`);
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      if (color) t.colorSpace = SRGBColorSpace;
      owned.push(t);
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
          owned.push(mesh.geometry);
          for (const mat of ([] as Material[]).concat(mesh.material)) {
            owned.push(mat);
            for (const v of Object.values(mat)) if ((v as Texture | null)?.isTexture) owned.push(v as Texture);
          }
        });
        models.set(id, scene);
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
  } catch (e) {
    console.warn("3D board: arena not loaded", e);
    for (const o of owned) o.dispose();
    return null;
  }
}
