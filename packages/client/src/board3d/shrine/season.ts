/**
 * The shrine's seasons (PLAN-X X3), from the real date: what each one changes. Spring: sakura in bloom, falling
 * petals, fresh greens. Summer: deep greens (and fireflies, X4). Autumn: momiji in crimson, the sakura turned, falling
 * leaves, straw-colored grass. Winter: bare branches, snow on roofs, branches and banks, falling snow.
 */
import type { Material, WebGLProgramParametersWithUniforms } from "three";
import type { Season } from "../diorama";

export interface SeasonLook {
  /** Each tree's crown (null: bare), as base colors varied per leaf. */
  sakura: { tile: Tile; colors: string[] } | null;
  momiji: { tile: Tile; colors: string[] } | null;
  pine: { colors: string[] };
  bamboo: string[];
  grass: string[];
  /** Tint of the shrubs and ferns. */
  shrubs: string;
  /** What falls from the sky, and how much (a share of the quality's count). */
  falling: { kind: "petal" | "leaf" | "snow"; colors: string[]; share: number } | null;
  /** Snow on what faces the sky (0: none). */
  snow: number;
}

/** The leaf atlas's tiles (`trees.ts`). */
export type Tile = "blossom" | "maple" | "leaves" | "needles";

export const SEASONS: Record<Season, SeasonLook> = {
  spring: {
    sakura: { tile: "blossom", colors: ["#ffd3e0", "#ffc2d4", "#ffe4ec", "#f7b0c6"] },
    momiji: { tile: "maple", colors: ["#9ccf62", "#b4dc78", "#86bd52"] },
    pine: { colors: ["#3c5f34", "#466b3a", "#33542e"] },
    bamboo: ["#7fae55", "#93bf63"],
    grass: ["#6f9e46", "#83b255", "#5d8c3c"],
    shrubs: "#ffffff",
    falling: { kind: "petal", colors: ["#ffd3e0", "#ffc2d4", "#fbe2ea"], share: 1 },
    snow: 0,
  },
  summer: {
    sakura: { tile: "leaves", colors: ["#3f7a34", "#4b8a3b", "#356a2d"] },
    momiji: { tile: "maple", colors: ["#4f8e3a", "#5f9e44", "#467f33"] },
    pine: { colors: ["#2f5530", "#3a6236", "#2a4a2a"] },
    bamboo: ["#5e9a44", "#6fae4d"],
    grass: ["#4d8a36", "#5c9a40", "#437a30"],
    shrubs: "#ffffff",
    falling: null,
    snow: 0,
  },
  autumn: {
    sakura: { tile: "leaves", colors: ["#d08a3a", "#c06a30", "#e0a64a", "#b5562c"] },
    momiji: { tile: "maple", colors: ["#c8261c", "#d8401e", "#b01c1c", "#e05a24"] },
    pine: { colors: ["#34532f", "#3e5e36", "#2e4a2a"] },
    bamboo: ["#8fa24e", "#a0ae5a"],
    grass: ["#a89356", "#b8a062", "#8f7c48"],
    shrubs: "#e2a86a",
    falling: { kind: "leaf", colors: ["#c8261c", "#d8401e", "#e0a64a", "#c06a30"], share: 0.8 },
    snow: 0,
  },
  winter: {
    sakura: null,
    momiji: null,
    pine: { colors: ["#2c4630", "#344f36", "#dfe6ee"] },
    bamboo: ["#7a9a5a", "#8aa868"],
    grass: ["#8c8a78", "#a3a290", "#c9ccd0"],
    shrubs: "#b9c2cc",
    falling: { kind: "snow", colors: ["#ffffff", "#eef4ff"], share: 1.2 },
    snow: 1,
  },
};

/**
 * Snow on a material: white where its surface faces the sky (`amount` 0: none). Patched once into the shader; the
 * stage's deck and the mats never get it (swept for the game).
 */
export function snowCover(material: Material, amount: number): void {
  if (amount <= 0) return;
  const previous = material.onBeforeCompile;
  // Programs are cached by this key (by default the patch's source): keep the earlier patch's in it.
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uSnow = { value: amount };
    shader.fragmentShader = `uniform float uSnow;\n${shader.fragmentShader.replace(
      "#include <lights_physical_fragment>",
      /* glsl */ `{
        vec3 sUp = inverseTransformDirection(normal, viewMatrix);
        float sCover = smoothstep(0.45, 0.8, sUp.y) * uSnow;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.97), sCover);
        roughnessFactor = mix(roughnessFactor, 0.85, sCover);
        metalnessFactor = mix(metalnessFactor, 0.0, sCover);
      }
      #include <lights_physical_fragment>`,
    )}`;
  };
  material.customProgramCacheKey = () => `${key}|snow${amount}`;
  material.needsUpdate = true;
}
