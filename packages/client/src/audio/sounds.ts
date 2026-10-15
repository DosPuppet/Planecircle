/**
 * Table of the sound effects: stable key → recorded samples (randomly drawn variants, public/sounds/) for the physical
 * sounds (cards, shuffle, lands, tokens: Kenney CC0 samples, see public/sounds/LICENSE-kenney.txt), or a synthesized
 * cue (synth.ts, loaded on demand) for the musical and magical ones. Changing a sound = changing one line here (or its
 * cue in synth.ts). Every key has a label for the listening panel (`SoundTest`).
 */
import { msg } from "@mtgx/engine";
import type { SynthId } from "./synth";

export type SoundDef =
  | {
      files: string[];
      /** Relative volume (0 to 1), before the master volume. */
      volume: number;
      /** No pitch variation (jingles). */
      steady?: boolean;
    }
  | { synth: SynthId; volume: number };

const range = (prefix: string, ids: (string | number)[]) => ids.map((i) => `${prefix}${i}.ogg`);
const synth = (id: SynthId, volume = 1): SoundDef => ({ synth: id, volume });

export const SOUNDS = {
  shuffle: { files: ["card-shuffle.ogg"], volume: 0.6 },
  draw: { files: range("card-slide-", [1, 2, 3, 5]), volume: 0.55 },
  land: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.7 },
  // Casting: the card slides onto the stack, and a cue of the color of its mana.
  cast: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.55 },
  castW: synth("castW"),
  castU: synth("castU", 1.4),
  castB: synth("castB"),
  castR: synth("castR", 1.3),
  castG: synth("castG"),
  castC: synth("castC", 1.6),
  castM: synth("castM"),
  resolve: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.55 },
  ability: synth("ability"),
  counter: synth("counter", 1.4),
  attack: synth("attack"),
  block: synth("block"),
  hit: synth("hit"),
  hitHeavy: synth("hitHeavy"),
  heal: synth("heal"),
  dies: synth("dies"),
  token: { files: range("chip-lay-", [1, 2, 3]), volume: 0.7 },
  attach: { files: ["metalClick.ogg"], volume: 0.5 },
  // Commander (PLAN-E): a commander rejoins the command zone.
  command: synth("command"),
  poison: synth("poison"),
  turn: synth("turn"),
  tap: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.25 },
  click: synth("click"),
  error: synth("error"),
  win: synth("win"),
  lose: synth("lose"),
} satisfies Record<string, SoundDef>;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_FILES: string[] = [
  ...new Set(Object.values(SOUNDS as Record<string, SoundDef>).flatMap((s) => ("files" in s ? s.files : []))),
];

/** Labels of the listening panel, in the order of the game. */
export const SOUND_LABELS: Record<SoundKey, string> = {
  shuffle: msg("Shuffle"),
  draw: msg("ctx:sound|Draw"),
  land: msg("Land"),
  cast: msg("Cast"),
  castW: msg("White spell"),
  castU: msg("Blue spell"),
  castB: msg("Black spell"),
  castR: msg("Red spell"),
  castG: msg("Green spell"),
  castC: msg("Colorless spell"),
  castM: msg("Multicolored spell"),
  resolve: msg("Permanent arrives"),
  ability: msg("Ability"),
  counter: msg("Countered"),
  attack: msg("Attack"),
  block: msg("Block"),
  hit: msg("Hit"),
  hitHeavy: msg("Heavy hit"),
  heal: msg("Life gain"),
  dies: msg("Dies"),
  token: msg("Token"),
  attach: msg("Attach"),
  command: msg("Back to the command zone"),
  poison: msg("Poison"),
  turn: msg("Your turn"),
  tap: msg("Tap"),
  click: msg("Click"),
  error: msg("Error"),
  win: msg("Victory"),
  lose: msg("Defeat"),
};
