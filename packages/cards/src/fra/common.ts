/**
 * Reality Fracture specifics: tokens (Cadet, Heartwood, Lotus…) and filters.
 * The DSL and the generic filters come from Foundations (fdn/common.ts).
 */
import { type Amount, dsl, type Effect, type TokenSpec } from "@mtgx/engine";
import { creature, manaAbility } from "../fdn/common";

export * from "../fdn/common";

/** "2/2 colorless Wizard Soldier creature token named Cadet" */
export const CADET = creature("Cadet", [], ["Wizard", "Soldier"], 2, 2);

/** "Heartwood token": red and green artifact with "{T}: Add {R} or {G}." */
export const HEARTWOOD: TokenSpec = {
  name: "Heartwood",
  colors: ["R", "G"],
  types: ["Artifact"],
  subtypes: [],
  abilities: [manaAbility(["R", "G"])],
  text: "{T}: Add {R} or {G}.",
};

/** "colorless artifact token named Lotus with '{T}, Sacrifice this token: Add three mana of any one color.'" */
export const LOTUS: TokenSpec = {
  name: "Lotus",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 3, { sacrifice: true })],
  text: "{T}, Sacrifice this token: Add three mana of any one color.",
};

/** "3/3 green Forest Tentacle land creature token" (with "{T}: Add {G}"). */
export const FOREST_TENTACLE: TokenSpec = {
  name: "Forest Tentacle",
  colors: ["G"],
  types: ["Land", "Creature"],
  subtypes: ["Forest", "Tentacle"],
  power: 3,
  toughness: 3,
  // "{T}: Add {G}" comes from the Forest type (305.6).
  text: "{T}: Add {G}.",
};

export const THOPTER: TokenSpec = {
  name: "Thopter",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Thopter"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};

/** Vraska, Soul of Stone: 1/1 Sculpture Treasure artifact creature with the Treasure's mana ability. */
export const SCULPTURE_TREASURE: TokenSpec = {
  name: "Sculpture Treasure",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Sculpture", "Treasure"],
  power: 1,
  toughness: 1,
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
  text: "{T}, Sacrifice this token: Add one mana of any color.",
};

export const BEAST_TRAMPLE = creature("Beast", ["G"], ["Beast"], 4, 4, { keywords: ["trample"] });
export const ANGEL_3 = creature("Angel", ["U"], ["Angel"], 3, 3, { keywords: ["flying"] });
export const MOWU = creature("Mowu", ["G"], ["Dog"], 3, 3, { legendary: true });
export const ILLUSION = creature("Illusion", ["U"], ["Illusion"], 1, 1);
export const LEVIATHAN = creature("Leviathan", ["U"], ["Leviathan"], 8, 8, { keywords: ["hexproof"] });
/** Ajani's Pridemate: 2/2 white Cat Soldier with "whenever you gain life, +1/+1 counter". */
export const AJANIS_PRIDEMATE = creature("Ajani's Pridemate", ["W"], ["Cat", "Soldier"], 2, 2, {
  abilities: [dsl.triggered(dsl.when.gainLife, [dsl.fx.addCounters(dsl.ref.self, 1)], { label: "put a +1/+1 counter" })],
  text: "Whenever you gain life, put a +1/+1 counter on this token.",
});

// ---------------------------------------------------------------------------
// Shared prepared spells (several creatures have the same spell)
// ---------------------------------------------------------------------------

const { spell: spellOf, fx: fxs, ref: refs, target: targets } = dsl;

/** Seed Suture: "Put a +1/+1 counter on target creature. You gain 1 life." */
export const SEED_SUTURE = spellOf([targets.creature("t")], [fxs.addCounters(refs.target(), 1), fxs.gainLife(1)]);
/** Peer Review: "Create a Cadet token. Surveil 1." */
export const PEER_REVIEW = spellOf([], [fxs.createTokens(CADET), fxs.surveil(1)]);
/** Omit Variables: "Mill three cards." */
export const OMIT_VARIABLES = spellOf([], [fxs.mill(3)]);
/** Vicious Verse: "1 damage to target opponent." */
export const VICIOUS_VERSE = spellOf([targets.player("t", "opponent")], [fxs.damage(1, refs.target())]);
/** Soul Tether: "Create a Heartwood token." */
export const SOUL_TETHER = spellOf([], [fxs.createTokens(HEARTWOOD)]);

// ---------------------------------------------------------------------------
// Empower Jace
// ---------------------------------------------------------------------------

/** "blue Jace planeswalker token with '[−1]: Surveil 1.' and '[−3]: Draw a card.'" */
export const JACE_TOKEN: TokenSpec = {
  name: "Jace",
  colors: ["U"],
  types: ["Planeswalker"],
  subtypes: ["Jace"],
  abilities: [
    dsl.loyalty(-1, { effects: [fxs.surveil(1)], label: "Surveil 1" }),
    dsl.loyalty(-3, { effects: [fxs.draw(1)], label: "Draw a card" }),
  ],
  text: "[−1]: Surveil 1.\n[−3]: Draw a card.",
};

const JACE_TOKEN_YOURS = { types: ["Planeswalker" as const], subtype: "Jace", token: true, controller: "you" as const };

/**
 * "Empower Jace N": N loyalty counters on a Jace token you control, created first if there is none.
 * With several Jace tokens, the player chooses which one on resolution (untargeted choice).
 */
export const empower = (n: Amount): Effect[] => [
  { op: "counterOnOrCreate", who: refs.you, find: JACE_TOKEN_YOURS, token: JACE_TOKEN, kind: "loyalty", amount: 0 },
  fxs.chooseAmong(refs.permanentsOf(refs.you, JACE_TOKEN_YOURS), refs.you, "empowered", {
    prompt: "Choose the Jace token that gets the counters",
  }),
  fxs.counters(refs.stored("empowered"), "loyalty", n),
];

/** "Planeswalkers you control have '[loyalty ability]'." */
export const walkersHave = (ability: ReturnType<typeof dsl.loyalty>, label: string) =>
  dsl.staticAbility({ types: ["Planeswalker"], controller: "you" }, { addAbilities: [ability] }, { label });
