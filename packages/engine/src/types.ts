/**
 * Core types of the engine. Everything in GameState is JSON-serializable:
 * no classes, no functions, no Map/Set.
 */

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type Color = "W" | "U" | "B" | "R" | "G";
export type ManaType = Color | "C";
export const COLORS: readonly Color[] = ["W", "U", "B", "R", "G"];
export const MANA_TYPES: readonly ManaType[] = ["W", "U", "B", "R", "G", "C"];

export interface ManaCost {
  generic: number;
  /** Colored symbols (or {C}): number of each type required. */
  colored: Partial<Record<ManaType, number>>;
  /** Number of {X} in the cost. */
  x: number;
  /** Hybrid symbols: each is paid with either of the two types. */
  hybrid?: [ManaType, ManaType][];
  /** Monocolored hybrids {2/W}: one mana of that color or two generic mana. */
  twoHybrid?: ManaType[];
  /** Phyrexian mana {G/P} (107.4f): one mana of that color or 2 life. */
  phyrexian?: ManaType[];
}

export type CardType = "Land" | "Creature" | "Artifact" | "Enchantment" | "Instant" | "Sorcery" | "Planeswalker" | "Battle";

/** Permanent types (110.4). */
export const PERMANENT_TYPES: readonly CardType[] = ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"];
/** Basic land types (305.6). */
export const BASIC_LAND_TYPES: readonly string[] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
/** Land types (205.3i): new land types replace only these (205.1a, 305.7). */
export const LAND_TYPES: ReadonlySet<string> = new Set([
  "Cave",
  "Cloud",
  "Desert",
  "Forest",
  "Gate",
  "Island",
  "Lair",
  "Locus",
  "Mine",
  "Mountain",
  "Plains",
  "Planet",
  "Power-Plant",
  "Sphere",
  "Swamp",
  "Tower",
  "Town",
  "Urza's",
]);

export type Keyword =
  | "flying"
  | "reach"
  | "firstStrike"
  | "doubleStrike"
  | "deathtouch"
  | "lifelink"
  | "trample"
  | "vigilance"
  | "haste"
  | "menace"
  | "defender"
  | "flash"
  | "hexproof"
  /** Shroud (702.18): can't be the target of spells or abilities. */
  | "shroud"
  | "indestructible"
  | "prowess"
  /** Ward (702.21): the triggered ability is generated from the cost read in the text. */
  | "ward"
  /** Changeling (702.73): has every creature type, in every zone. */
  | "changeling"
  /** Wither (702.80): its damage to creatures is dealt in the form of −1/−1 counters. */
  | "wither"
  /** Infect (702.90): −1/−1 counters to creatures, poison counters to players. */
  | "infect"
  /** Toxic N (702.164): a player it deals combat damage to also gets N poison counters (N: `CardDef.toxic`). */
  | "toxic"
  /** "Must be blocked if able" (509.1c). */
  | "mustBeBlocked"
  /** Wolverine: "if damage would be dealt to it, it is, but its other damage is healed". */
  | "damageHealsFirst"
  /** Restrictions (not printed keywords, but handled as layer 6 abilities). */
  | "cantBlock"
  | "cantAttack"
  | "unblockable"
  | "mustAttack"
  /** Stuck in Summoner's Sanctum: "its activated abilities can't be activated". */
  | "noActivatedAbilities"
  /** Ancient Adamantoise: "damage isn't removed from this creature during cleanup steps". */
  | "keepsDamage"
  /** Convoke (702.51): creatures can help pay for the spell. */
  | "convoke"
  /** Improvise (702.126): untapped artifacts can each pay {1} of the spell's cost. */
  | "improvise"
  /** Delve (702.66): each card exiled from your graveyard pays {1} of the spell's cost. */
  | "delve"
  /** Split second (702.61): while this spell is on the stack, no spells or abilities (other than mana abilities). */
  | "splitSecond"
  /** Rebound (702.88): cast from hand, exiled as it resolves; may be cast again for free at your next upkeep. */
  | "rebound"
  /** Riot (702.136): it enters with a +1/+1 counter or haste, as its controller chooses. */
  | "riot"
  /** Ghalta the Immovable: can attack as though it didn't have defender. */
  | "attacksDespiteDefender"
  /** "Start your engines!" (702.179): if you have no speed, it starts at 1. */
  | "startYourEngines"
  /** Decayed (702.147): can't block, and when it attacks, it is sacrificed at end of combat. */
  | "decayed"
  /** Ascend (702.131): with ten or more permanents, its controller gets the city's blessing for the rest of the game. */
  | "ascend"
  /** "Can't be sacrificed" (Zurgo, Thunder's Decree: its Warrior tokens during your end step). */
  | "cantBeSacrificed"
  /** "Can't become suspected" (Airtight Alibi, 701.60). */
  | "cantBeSuspected"
  /**
   * "Can't be turned face up" (Unable to Scream: the enchanted face-down creature; Karlov Watchdog: your opponents'
   * face-down permanents during your turn): neither by the special action nor by an effect.
   */
  | "cantBeTurnedFaceUp";

/** Restrictions: displayed differently from keywords. */
export const RESTRICTIONS: readonly Keyword[] = [
  "cantBlock",
  "cantAttack",
  "unblockable",
  "mustAttack",
  "noActivatedAbilities",
  "keepsDamage",
  "damageHealsFirst",
  "cantBeSacrificed",
  "cantBeSuspected",
  "cantBeTurnedFaceUp",
];

export const KEYWORDS: readonly Keyword[] = [
  "flying",
  "reach",
  "firstStrike",
  "doubleStrike",
  "deathtouch",
  "lifelink",
  "trample",
  "vigilance",
  "haste",
  "menace",
  "defender",
  "flash",
  "hexproof",
  "shroud",
  "indestructible",
  "decayed",
];

import type { AbilityDef, ActivatedAbilityDef } from "./model/cards";
import type { Effect } from "./model/effects";

const MANA_OPS = new Set<Effect["op"]>(["addMana", "addManaChoice", "addManaColorsAmong", "addManaUntilEndOfTurn"]);

/** Does an effect (or a nested effect: "if…", "you may…") add mana? */
function addsMana(effects: readonly Effect[]): boolean {
  return effects.some(
    (e) =>
      MANA_OPS.has(e.op) ||
      Object.values(e).some((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && addsMana(v as Effect[])),
  );
}

/**
 * 605.1a: an activated ability without a target, that isn't a loyalty ability and that could add mana, is a mana
 * ability (Ramos, Capital City, Loot, the Pathfinder…).
 */
export function isManaAbility(ab: ActivatedAbilityDef): boolean {
  return ab.targets.length === 0 && ab.cost.loyalty === undefined && addsMana(ab.effects);
}

/** A mana ability (605.1a): a `mana` ability, or an activated ability that is one (`isManaAbility`). */
export function isAnyManaAbility(ab: AbilityDef): boolean {
  return ab.kind === "mana" || (ab.kind === "activated" && isManaAbility(ab));
}

export * from "./model/cards";
export * from "./model/decisions";
export * from "./model/effects";
export * from "./model/rules";
export * from "./model/state";
