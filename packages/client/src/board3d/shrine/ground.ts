/**
 * The shrine's ground (PLAN-X X1): one terrain from the seabed to the banks (the plan's heights), its sand blending into
 * forest ground up the banks, the sand darker and glossy where the tide has just left it; mossy rocks along the
 * waterline (Poly Haven models). Static: drawn once into the shadows.
 */
import {
  Box3,
  BufferAttribute,
  Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  ShaderChunk,
  type Texture,
  Mesh as ThreeMesh,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { ArenaMaterial } from "../assets";
import { noise, type ShrinePlan } from "./plan";

/** A copy of a tiled map: the arena's textures are shared, each use sets its own repeat. */
function tiled(t: Texture | undefined, repeat: number): Texture | null {
  if (!t) return null;
  const c = t.clone();
  c.wrapS = RepeatWrapping;
  c.wrapT = RepeatWrapping;
  c.repeat.set(repeat, repeat);
  c.channel = 0;
  return c;
}

/** A material from one of the arena's (UVs in world units, one tile every `tile`). */
export function tiledMaterial(m: ArenaMaterial | undefined, tile: number, color = "#ffffff"): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  if (!m) return mat;
  mat.map = tiled(m.map, 1 / tile);
  mat.normalMap = tiled(m.normalMap, 1 / tile);
  const arm = tiled(m.arm, 1 / tile);
  mat.aoMap = arm;
  mat.roughnessMap = arm;
  mat.metalnessMap = arm;
  mat.metalness = 1;
  return mat;
}

/**
 * The terrain's material: `base` (sand) where the vertex attribute `aSplat` is 0, `over` (forest ground, tiled every
 * `overTile`) where it is 1; the sand wet under `uWater` + a little (the tide's last line).
 */
function splatMaterial(base: ArenaMaterial | undefined, over: ArenaMaterial | undefined, baseTile: number, overTile: number) {
  const mat = tiledMaterial(base, baseTile);
  const uniforms = {
    uOverMap: { value: over?.map ?? null },
    uOverNormal: { value: over?.normalMap ?? null },
    uOverArm: { value: over?.arm ?? null },
    uOverScale: { value: baseTile / overTile },
    uWater: { value: 0 },
  };
  if (!base || !over) return { mat, uniforms };
  for (const t of [over.map, over.normalMap, over.arm]) {
    if (!t) continue;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  const mixed = (sampler: string, uv: string, over: string) =>
    `mix(texture2D( ${sampler}, ${uv} ), texture2D( ${over}, ${uv} * uOverScale ), vSplat)`;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float aSplat;\nvarying float vSplat;\nvarying float vGroundY;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSplat = aSplat;\nvGroundY = (modelMatrix * vec4(position, 1.0)).y;",
    )}`;
    shader.fragmentShader = `uniform sampler2D uOverMap;\nuniform sampler2D uOverNormal;\nuniform sampler2D uOverArm;\nuniform float uOverScale;\nuniform float uWater;\nvarying float vSplat;\nvarying float vGroundY;\n${shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", mixed("map", "vMapUv", "uOverMap")),
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `${ShaderChunk.roughnessmap_fragment.replace(
          "texture2D( roughnessMap, vRoughnessMapUv )",
          mixed("roughnessMap", "vRoughnessMapUv", "uOverArm"),
        )}
        // Wet sand: darker and glossy just above the water, the tide's last line.
        float gWet = (1.0 - smoothstep(uWater, uWater + 0.16, vGroundY)) * (1.0 - vSplat);
        roughnessFactor = mix(roughnessFactor, 0.18, gWet);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        ShaderChunk.metalnessmap_fragment.replace(
          "texture2D( metalnessMap, vMetalnessMapUv )",
          mixed("metalnessMap", "vMetalnessMapUv", "uOverArm"),
        ),
      )
      .replace(
        "#include <aomap_fragment>",
        ShaderChunk.aomap_fragment.replace("texture2D( aoMap, vAoMapUv )", mixed("aoMap", "vAoMapUv", "uOverArm")),
      )
      .replace(
        "#include <normal_fragment_maps>",
        ShaderChunk.normal_fragment_maps.replace(
          "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
          `vec3 mapN = ${mixed("normalMap", "vNormalMapUv", "uOverNormal")}.xyz * 2.0 - 1.0;`,
        ),
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.45 * (1.0 - smoothstep(uWater, uWater + 0.16, vGroundY)) * (1.0 - vSplat);",
      )}`;
  };
  return { mat, uniforms };
}

export interface Ground {
  group: Group;
  /** The water's current level (the wet sand follows it). */
  setWater(y: number): void;
  dispose(): void;
}

/** Size of the terrain around the table (world units) and its cells per unit at each quality. */
const EXTENT = { x: 70, z: 64 };

export function createGround(
  plan: ShrinePlan,
  materials: Record<string, ArenaMaterial>,
  models: Map<string, Object3D>,
  detail: number,
): Ground {
  const group = new Group();
  const cx = (plan.stage.x0 + plan.stage.x1) / 2;
  const cz = (plan.stage.z0 + plan.stage.z1) / 2 - 8;
  const geometry = new PlaneGeometry(EXTENT.x, EXTENT.z, Math.round(EXTENT.x * detail), Math.round(EXTENT.z * detail));
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const uv = geometry.getAttribute("uv") as BufferAttribute;
  const splat = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const z = pos.getZ(i) + cz;
    const y = plan.height(x, z);
    pos.setXYZ(i, x, y, z);
    uv.setXY(i, x, -z);
    // Sand up the beach, then the forest's ground, the border uneven.
    splat[i] = Math.min(1, Math.max(0, (y + 0.25 * (noise(x * 0.8, z * 0.8) - 0.5) - (plan.level + 0.3)) / 0.45));
  }
  geometry.setAttribute("aSplat", new BufferAttribute(splat, 1));
  geometry.computeVertexNormals();
  const { mat, uniforms } = splatMaterial(materials.sand, materials.ground, 3, 4);
  const terrain = new ThreeMesh(geometry, mat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // Mossy rocks along the waterline, on both banks, larger towards the far side; a few in the water.
  const owned: { dispose(): void }[] = [geometry, mat];
  const rocks = ["rock_moss_set_01", "rock_moss_set_02", "rock_07", "rock_09"].filter((id) => models.has(id));
  if (rocks.length) {
    const spots: [number, number, number][] = [];
    for (const side of [-1, 1] as const)
      for (let z = plan.stage.z1 + 2; z > plan.stage.z0 - 10; z -= 1.7 + noise(z, side * 3) * 1.3) {
        const x = plan.shore(side, z) + side * (noise(z * 2, side) - 0.3) * 0.9;
        spots.push([x, z, 0.9 + noise(z, side * 5) * 1.1 + Math.max(0, plan.stage.z0 - z) * 0.08]);
      }
    spots.forEach(([x, z, size], i) => {
      const model = models.get(rocks[i % rocks.length] as string) as Object3D;
      const rock = placed(model, size, (i * 2.399) % (2 * Math.PI));
      rock.position.set(x, plan.height(x, z) - size * 0.18, z);
      group.add(rock);
    });
  }
  return {
    group,
    setWater(y: number) {
      uniforms.uWater.value = y;
    },
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

/** A copy of a model, its largest side `size` world units, standing on y = 0, turned; casting and taking shadows. */
export function placed(model: Object3D, size: number, turn: number): Object3D {
  const copy = model.clone();
  const box = new Box3().setFromObject(copy);
  const dims = box.getSize(new Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
  const holder = new Group();
  copy.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  holder.add(copy);
  holder.scale.setScalar(scale);
  holder.rotation.y = turn;
  copy.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const m of ([] as Material[]).concat(mesh.material)) (m as MeshStandardMaterial).envMapIntensity = 0.6;
  });
  return holder;
}
