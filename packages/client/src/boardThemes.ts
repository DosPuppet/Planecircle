/**
 * Board textures (playmats), chosen by the player and kept in `localStorage`. The rendering is entirely in CSS
 * (`styles.css`, `.board[data-board=…]`): gradients and SVG noise, no image to download. The ids are stored values and
 * CSS selectors (French before PLAN-I: `LEGACY_IDS`); the labels are translated at display (`textIn`).
 */
import { msg } from "@mtgx/engine";

export type BoardTheme = "night" | "felt" | "wood" | "slate" | "leather" | "arcane" | "ocean";
/** The player's choice: a texture, or a random texture for each game. */
export type BoardThemeChoice = BoardTheme | "random";

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: "night", label: msg("Night") },
  { id: "felt", label: msg("Felt") },
  { id: "wood", label: msg("Wood") },
  { id: "slate", label: msg("Slate") },
  { id: "leather", label: msg("Leather") },
  { id: "arcane", label: msg("Arcane") },
  { id: "ocean", label: msg("Ocean") },
];

const KEY = "planecircle.board";

/** Ids before PLAN-I (French), in settings saved by earlier versions. */
const LEGACY_IDS: Record<string, BoardThemeChoice> = {
  nuit: "night",
  feutre: "felt",
  bois: "wood",
  ardoise: "slate",
  cuir: "leather",
  hasard: "random",
};

export function loadBoardTheme(): BoardThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    const v = (stored && LEGACY_IDS[stored]) || stored;
    return v === "random" || BOARD_THEMES.some((t) => t.id === v) ? (v as BoardThemeChoice) : "night";
  } catch {
    return "night";
  }
}

export function saveBoardTheme(choice: BoardThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // storage unavailable: setting not kept
  }
}

/**
 * Graphics (PLAN-V): "full", the animated table and the tilted battlefield; "light", a still table and a flat
 * battlefield, for less powerful devices; "3d" (PLAN-W), the 3D board, only by choice and where the device can draw it
 * (`graphics.ts`), "full" otherwise. Kept in `localStorage`.
 */
export type Effects = "3d" | "full" | "light";

/** What the DOM board shows for a setting: "3d" falls back to "full" (3D refused, failed, or not drawn here). */
export function domEffects(effects: Effects): "full" | "light" {
  return effects === "light" ? "light" : "full";
}

const EFFECTS_KEY = "planecircle.effects";

/** Default graphics: light on a touch screen under 1,100 px (phone, small tablet), full otherwise. */
export function defaultEffects(): Effects {
  try {
    return window.matchMedia("(pointer: coarse) and (max-width: 1100px)").matches ? "light" : "full";
  } catch {
    return "full";
  }
}

export function loadEffects(): Effects {
  try {
    const v = localStorage.getItem(EFFECTS_KEY);
    return v === "3d" || v === "full" || v === "light" ? v : defaultEffects();
  } catch {
    return defaultEffects();
  }
}

export function saveEffects(effects: Effects): void {
  try {
    localStorage.setItem(EFFECTS_KEY, effects);
  } catch {
    // storage unavailable: setting not kept
  }
}

/** The texture displayed: the chosen one, or, for "random", a texture drawn from `roll` (a number in [0, 1)). */
export function resolveBoardTheme(choice: BoardThemeChoice, roll: number): BoardTheme {
  if (choice !== "random") return choice;
  const i = Math.min(BOARD_THEMES.length - 1, Math.floor(roll * BOARD_THEMES.length));
  return (BOARD_THEMES[i] as { id: BoardTheme }).id;
}
