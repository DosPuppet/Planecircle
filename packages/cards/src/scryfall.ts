/**
 * Conversion of the Scryfall data (data/*.json) into engine card definitions.
 */
import {
  type AdditionalCost,
  type CardDef,
  type CardRules,
  type CardScript,
  type CardType,
  type CastOption,
  type Color,
  CREATURE_TYPES,
  cardRef,
  dsl,
  type Effect,
  type Keyword,
  type KickerDef,
  type ManaCost,
  msg,
  type ObjectFilter,
  parseManaCost,
  type SpellDef,
} from "@mtgx/engine";
import { FISH, FOOD, TREASURE } from "./fdn/common";

export interface RawCard {
  name: string;
  number: string;
  rarity: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors: string[];
  keywords: string[];
  producedMana?: string[];
  image: string;
  artCrop: string;
  legalities?: CardDef["legalities"];
  /** "prepare" layout: the spell attached to the creature. */
  prepare?: {
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText: string;
    fr?: { name?: string; typeLine?: string; text?: string };
  };
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  /** Meld: the two parts and the melded card. */
  meld?: { parts: string[]; result?: string };
  /** Scryfall layout when it is not "normal" (saga, class, case, adventure, transform…). */
  layout?: string;
  /** Multi-faced cards (adventure, split, double-faced, meld): every face. */
  faces?: RawFace[];
  /** Pseudo-set imported by name (PLAN-E): Scryfall set of the chosen printing (`CardDef.origin`). */
  origin?: string;
  /** Pseudo-set imported by name: color identity according to Scryfall, compared with the computed identity (test). */
  colorIdentity?: string[];
}

export interface RawFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  image?: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
}

const KEYWORD_NAMES: Record<string, Keyword> = {
  flying: "flying",
  reach: "reach",
  "first strike": "firstStrike",
  "double strike": "doubleStrike",
  deathtouch: "deathtouch",
  lifelink: "lifelink",
  trample: "trample",
  vigilance: "vigilance",
  haste: "haste",
  menace: "menace",
  defender: "defender",
  prowess: "prowess",
  ward: "ward",
  flash: "flash",
  hexproof: "hexproof",
  shroud: "shroud",
  infect: "infect",
  toxic: "toxic",
  indestructible: "indestructible",
  convoke: "convoke",
  improvise: "improvise",
  delve: "delve",
  "split second": "splitSecond",
  rebound: "rebound",
  riot: "riot",
  changeling: "changeling",
  wither: "wither",
  "start your engines!": "startYourEngines",
  decayed: "decayed",
  ascend: "ascend",
};

const CARD_TYPES = new Set<CardType>([
  "Land",
  "Creature",
  "Artifact",
  "Enchantment",
  "Instant",
  "Sorcery",
  "Planeswalker",
  "Battle",
]);
const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World"]);

export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripReminder(text: string): string {
  return text.replace(/\([^)]*\)/g, "").trim();
}

/** Ward: "Ward {2}", "Ward—Pay 7 life." or "Ward—{3}, Pay 3 life." */
const WARD =
  /\bward(?: ((?:\{[^}]+\})+)|—(?:((?:\{[^}]+\})+), )?pay (\d+) life\.?|—discard a card( at random)?\.?|—sacrifice (an?|two|three|four) (nonland permanents?|permanents?|creatures?)\.?|—collect evidence (\d+)\.?|—waterbend ((?:\{[^}]+\})+)\.?)/i;

/** "Equip {3}{W}" (702.6): activated ability at sorcery speed, targets a creature you control. */
/** "Equip {2}" or, with an ability name, "Gae Bolg — Equip {4}". */
export function parseEquip(text: string): string | undefined {
  return /^(?:[^\n—]+ — )?Equip (?:worthy )?((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1];
}

/**
 * Equip variants read from the text: "Equip worthy {1}" (Marvel Super Heroes: red and/or white legendary non-Villain
 * creature); "costs {1} less to activate for each color of the creature it targets" (Dragonfire Blade).
 */
function equipVariant(text: string): EquipVariant {
  return {
    worthy: /^Equip worthy /m.test(text) || undefined,
    // "Equip commander {2}" (Commander): one more equip ability, which targets only a commander.
    commander: /^Equip commander ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1],
    // "Equip legendary creature {1}" (Brotherhood Regalia, Excalibur): which targets only a legendary creature.
    legendary: /^Equip legendary creature ((?:\{[^}]+\})+)/m.exec(stripReminder(text))?.[1],
    byColors: /costs \{1\} less to activate for each color of the creature it targets/.test(text) || undefined,
  };
}

/** Equip variants: "worthy", cost reduced per color, and restricted abilities (commander, legendary creature). */
type EquipVariant = { worthy?: boolean; byColors?: boolean; commander?: string; legendary?: string };

/** "Worthy": legendary creature you control, non-Villain, red and/or white. */
const WORTHY: ObjectFilter = {
  types: ["Creature"],
  controller: "you",
  legendary: true,
  noneOfSubtypes: ["Villain"],
  colors: ["R", "W"],
};

/** Hero: 1/1 colorless creature (Job select). */
const HERO_TOKEN = { name: "Hero", colors: [], types: ["Creature" as const], subtypes: ["Hero"], power: 1, toughness: 1 };

/** Job select: "when this Equipment enters, create a 1/1 Hero token, then attach this Equipment to it". */
function jobSelectAbility(keywords: string[]): CardDef["abilities"] {
  if (!keywords.some((k) => k.toLowerCase() === "job select")) return [];
  return [
    {
      kind: "triggered",
      trigger: { on: "enters", who: "self" },
      targets: [],
      effects: [
        { op: "createTokens", token: HERO_TOKEN, count: 1, store: "hero" },
        { op: "attach", what: { kind: "self" }, to: { kind: "stored", name: "hero" } },
      ],
      label: msg("Job select: equipped 1/1 Hero"),
    },
  ];
}

export function parseWard(text: string): CardDef["ward"] {
  // "Ward—Discard a card or pay {2}." (Titania); "Ward—Get five poison counters." (The Serpent Society).
  const orPay = /\bward—discard a card or pay ((?:\{[^}]+\})+)/i.exec(stripReminder(text));
  if (orPay) return { discard: true, or: { mana: parseManaCost(orPay[1] as string) } };
  const poison = /\bward—get (one|two|three|four|five|\d+) poison counters?/i.exec(stripReminder(text));
  if (poison) {
    const n = ({ one: 1, two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[(poison[1] as string).toLowerCase()];
    return { poison: n ?? Number(poison[1]) };
  }
  const m = WARD.exec(stripReminder(text));
  if (!m) return undefined;
  if (m[1]) return { mana: parseManaCost(m[1]) };
  // "Ward—Sacrifice three permanents." (Emrakul, the Exigent Doom)
  // "Ward—Sacrifice three nonland permanents." (Valgavoth, Terror Eater)
  // "Ward—Sacrifice a creature." (Vein Ripper)
  if (m[5]) {
    const n = ({ a: 1, an: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[m[5].toLowerCase()];
    const kind = (m[6] ?? "").toLowerCase();
    const filter: ObjectFilter | undefined = kind.startsWith("nonland")
      ? { notTypes: ["Land"] }
      : kind.startsWith("creature")
        ? { types: ["Creature"] }
        : undefined;
    return { sacrifice: n, ...(filter ? { sacrificeFilter: filter } : {}) };
  }
  // "Ward—Collect evidence 4." (Axebane Ferox)
  if (m[7]) return { collectEvidence: Number(m[7]) };
  // "Ward—Waterbend {4}." (The Unagi of Kyoshi Island)
  if (m[8]) return { mana: parseManaCost(m[8]), waterbend: true };
  // "Ward—Discard a card [at random]." (Gideon the Oathless, Alpharael, Stonechosen)
  if (!m[3]) return m[4] ? { discard: true, discardRandom: true } : { discard: true };
  return { mana: m[2] ? parseManaCost(m[2]) : undefined, life: Number(m[3]) };
}

/** Plot (702.170): "Plot {1}{W}". */
export function parsePlot(text: string): ManaCost | undefined {
  const m = /^Plot ((?:\{[^}]+\})+)/m.exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Plot special action: from hand, at sorcery speed, the card is exiled and becomes plotted. */
function plotAbility(text: string): CardDef["abilities"] {
  const cost = parsePlot(text);
  if (!cost) return [];
  return [
    {
      kind: "activated",
      cost: { mana: cost },
      targets: [],
      effects: [{ op: "exileToCast", kind: "plot", what: { kind: "self" } }],
      fromHand: true,
      sorcerySpeed: true,
      specialAction: true,
      label: msg("Plot"),
    },
  ];
}

/** Foretell (702.143): "Foretell {2}{R}". */
export function parseForetell(text: string): ManaCost | undefined {
  const m = /^Foretell ((?:\{[^}]+\})+)/m.exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Foretell special action: during your turn, pay {2} and exile the card from your hand. */
function foretellAbility(text: string): CardDef["abilities"] {
  if (!parseForetell(text)) return [];
  return [
    {
      kind: "activated",
      cost: { mana: parseManaCost("{2}") },
      targets: [],
      effects: [{ op: "exileToCast", kind: "foretell", what: { kind: "self" } }],
      fromHand: true,
      specialAction: true,
      activationCondition: dsl.cond.yourTurn,
      label: msg("Foretell"),
    },
  ];
}

/** Cumulative upkeep (702.24): "Cumulative upkeep {1}", "Cumulative upkeep—Pay 1 life." */
function cumulativeUpkeep(text: string): CardDef["abilities"] {
  const m = /^Cumulative upkeep(?: ((?:\{[^}]+\})+)|—Pay (\d+) life\.?)[ \t]*$/m.exec(stripReminder(text));
  if (!m) return [];
  const cost = m[1] ? { mana: parseManaCost(m[1]) } : { life: Number(m[2]) };
  const label = m[1]
    ? msg("Cumulative upkeep {cost}", { cost: m[1] })
    : msg("Cumulative upkeep—pay {n} life", { n: Number(m[2]) });
  return [dsl.cumulativeUpkeepAbility(cost, label)];
}

/** Devour (702.82): "Devour 2", "Devour land 3", "Devour artifact 1". */
export function parseDevour(text: string): Effect | undefined {
  const m = /^Devour(?: (land|artifact))? (\d+)/m.exec(stripReminder(text));
  if (!m) return undefined;
  const type = m[1] === "land" ? "Land" : m[1] === "artifact" ? "Artifact" : "Creature";
  return dsl.fx.devour({ types: [type] }, Number(m[2]));
}

/** "As it enters" (614.1c, 614.12): the script's effects, and the devour read from the text (unless it is scripted). */
function asEntersOf(script: Effect[] | undefined, text: string): Effect[] | undefined {
  const devour = script?.some((e) => e.op === "devour") ? undefined : parseDevour(text);
  const out = [...(devour ? [devour] : []), ...(script ?? [])];
  return out.length ? out : undefined;
}

/** Warp (702.185): "Warp {1}{W}" or "Warp—{B}, Pay 2 life."; "…from your graveyard using its warp ability". */
export function parseWarp(text: string): Extract<CastOption, { kind: "warp" }> | undefined {
  const t = stripReminder(text);
  const m = /^Warp(?: |—)((?:\{[^}]+\})+)(?:, [Pp]ay (\d+) life)?/m.exec(t);
  if (!m) return undefined;
  return {
    kind: "warp",
    cost: parseManaCost(m[1] as string),
    life: m[2] ? Number(m[2]) : undefined,
    fromGraveyard: /You may cast this card from your graveyard using its warp ability/.test(t) || undefined,
  };
}

/** Disguise (702.168): "Disguise {1}{W}". */
/** Impending N—[cost] (702.176): number of time counters and alternative cost. */
export function parseImpending(text: string): { n: number; cost: string } | undefined {
  const m = /Impending (\d+)—((?:\{[^}]+\})+)/.exec(text);
  return m ? { n: Number(m[1]), cost: m[2] as string } : undefined;
}

function impendingAltCost(text: string): AlternativeCost | undefined {
  const imp = parseImpending(text);
  return imp
    ? {
        kind: "alternative",
        mana: parseManaCost(imp.cost),
        condition: { kind: "all", of: [] },
        label: msg("Impending {n} — {cost}", { n: imp.n, cost: imp.cost }),
        via: "impending",
        impending: imp.n,
      }
    : undefined;
}

/** "At the beginning of your end step, if it has a time counter on it, remove one" (impending). */
function impendingAbilities(text: string): CardDef["abilities"] {
  if (!parseImpending(text)) return [];
  return [
    {
      kind: "triggered",
      trigger: { on: "step", step: "end", whose: "you" },
      condition: { kind: "counterAtLeast", counter: "time", n: 1 },
      targets: [],
      effects: [{ op: "removeCounters", what: { kind: "self" }, n: 1, kind: "time" }],
      label: msg("Impending: remove a time counter"),
    },
  ];
}

/** Cost of a keyword at the start of a line ("Madness {B}{R}"). */
export function parseKeywordCost(text: string, keyword: string): ManaCost | undefined {
  const m = new RegExp(`^${keyword} ((?:\\{[^}]+\\})+)`, "m").exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Madness spelled out: "Madness—Pay six {C}" (Emrakul, the World Anew). */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function parseMadnessPay(text: string): ManaCost | undefined {
  const m = /^Madness—Pay (\w+) (\{[^}]+\})/m.exec(stripReminder(text));
  const n = m ? NUMBER_WORDS.indexOf(m[1] as string) : -1;
  return m && n > 0 ? parseManaCost((m[2] as string).repeat(n)) : undefined;
}

/** Disguise (702.168) or morph (702.37, Grim Haruspex): the cost to turn the card face up. */
export function parseDisguise(text: string): ManaCost | undefined {
  const m = /^(?:Disguise|Morph) ((?:\{[^}]+\})+)/m.exec(stripReminder(text));
  return m ? parseManaCost(m[1] as string) : undefined;
}

/** Saddle (702.171): "Saddle N". */
export function parseSaddle(text: string): number | undefined {
  const m = /^Saddle (\d+)/m.exec(stripReminder(text));
  return m ? Number(m[1]) : undefined;
}

/** Crew N (Vehicles). */
/** "Crew 1. Activate only once each turn." (Luxurious Locomotive) */
export function crewOncePerTurn(text: string): boolean {
  return /^Crew \d+\. Activate only once each turn\./m.test(stripReminder(text));
}

export function parseCrew(text: string): number | undefined {
  const m = /^Crew (\d+)/m.exec(stripReminder(text));
  return m ? Number(m[1]) : undefined;
}

/** Does the text contain only keywords handled by the engine ("vanilla" or "french vanilla" creature)? */
/** Cycling (702.29): "Cycling {2}", "Basic landcycling {2}", "Islandcycling {2}", "Wizardcycling {1}"… */
const CYCLING = /^(Basic land|[A-Z][a-z]+)?cycling ((?:\{[^}]+\})+)/im;

/**
 * Labels of typecycling, by type (the type stays in English in both languages); another type falls back to a
 * template.
 */
const TYPECYCLING: Record<string, string> = {
  "Basic land": msg("Basic landcycling"),
  Land: msg("Landcycling"),
  Forest: msg("Forestcycling"),
  Halfling: msg("Halflingcycling"),
  Island: msg("Islandcycling"),
  Mountain: msg("Mountaincycling"),
  Plains: msg("Plainscycling"),
  Swamp: msg("Swampcycling"),
};

/**
 * Cycling ability read from the text: "[cost], discard this card: draw a card" or, for typecycling, "search for a
 * card [of the type], reveal it, put it into your hand".
 */
export function parseCycling(text: string): CardDef["abilities"][number] | undefined {
  const m = CYCLING.exec(stripReminder(text));
  if (!m) return undefined;
  const kind = m[1];
  const filter: ObjectFilter | undefined =
    kind === "Basic land"
      ? { types: ["Land"], basic: true }
      : kind === "Land"
        ? { types: ["Land"] }
        : kind
          ? { subtype: kind }
          : undefined;
  return {
    kind: "activated",
    cost: { mana: parseManaCost(m[2] as string), self: "discard" },
    targets: [],
    effects: filter
      ? [{ op: "search", filter, count: 1, to: { to: "hand" } }]
      : [{ op: "draw", who: { kind: "you" }, amount: 1 }],
    fromHand: true,
    cycling: true,
    label: kind ? (TYPECYCLING[kind] ?? msg("{type}cycling", { type: kind })) : msg("Cycling"),
  };
}

/**
 * Transmute (702.53): "[cost], discard this card: search your library for a card with the same mana value as this
 * card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery."
 */
const TRANSMUTE = /^Transmute ((?:\{[^}]+\})+)/m;
export function parseTransmute(text: string, manaValue: number): CardDef["abilities"][number] | undefined {
  const m = TRANSMUTE.exec(stripReminder(text));
  if (!m) return undefined;
  return {
    kind: "activated",
    cost: { mana: parseManaCost(m[1] as string), self: "discard" },
    targets: [],
    effects: [{ op: "search", filter: {}, count: 1, to: { to: "hand" }, manaValue }],
    fromHand: true,
    sorcerySpeed: true,
    label: msg("Transmute"),
  };
}

/** Outlast (702.107): "[cost], {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery." */
const OUTLAST = /^Outlast ((?:\{[^}]+\})+)/m;
export function parseOutlast(text: string): CardDef["abilities"][number] | undefined {
  const m = OUTLAST.exec(stripReminder(text));
  if (!m) return undefined;
  return {
    kind: "activated",
    cost: { mana: parseManaCost(m[1] as string), tap: true },
    targets: [],
    effects: [{ op: "addCounters", what: { kind: "self" }, amount: 1 }],
    sorcerySpeed: true,
    label: msg("Outlast"),
  };
}

export function onlyKeywords(text: string): boolean {
  const t = stripReminder(text);
  if (!t) return true;
  return t
    .split("\n")
    .filter((line) => !CYCLING.test(line.trim()))
    .map((line) => line.replace(new RegExp(WARD.source, "gi"), "ward").trim())
    .every((line) => line.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
}

function parseInt0(v: string | undefined): number | undefined | null {
  if (v === undefined) return undefined;
  return /^-?\d+$/.test(v) ? Number(v) : null;
}

/** Mobilize (702.181): red 1/1 Warrior tokens, tapped and attacking, sacrificed at the next end step. */
const MOBILIZE_WARRIOR = {
  name: "Warrior",
  colors: ["R" as const],
  types: ["Creature" as const],
  subtypes: ["Warrior"],
  power: 1,
  toughness: 1,
};

/** Bargain (702.166): "sacrifice an artifact, enchantment, or token" as the spell is cast. */
const BARGAIN_FILTER: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { token: true }] };

/** Offspring (702.175): "Offspring {2}" — a kicker, and "when it enters, create a 1/1 token copy of it". */
export function parseOffspring(text: string): string | undefined {
  return /^Offspring ((?:\{[^}]+\})+)/m.exec(text)?.[1];
}

const GIFTS: Record<string, NonNullable<KickerDef["gift"]>> = {
  card: "card",
  Food: "food",
  "tapped Fish": "fish",
  Treasure: "treasure",
};

/** Gift (702.174): "Gift a card", "Gift a Food", "Gift a tapped Fish", "Gift a Treasure". */
export function parseGift(text: string): KickerDef["gift"] {
  const m = /^Gift an? (card|Food|tapped Fish|Treasure)\b/m.exec(text);
  return m ? GIFTS[m[1] as string] : undefined;
}

const GIFT_TOKENS = { food: FOOD, fish: FISH, treasure: TREASURE } as const;

/** The effect of the promised gift (702.174b: the opponent gets it before the spell's other effects). */
function giftEffects(kind: NonNullable<KickerDef["gift"]>): Effect[] {
  const token = kind === "card" ? undefined : GIFT_TOKENS[kind];
  return [
    { op: "if", cond: { kind: "kicked" }, skip: 1 },
    { op: "gift", kind, token },
  ];
}

/** Triggered abilities carried by a keyword (702.108 prowess, 702.21 ward). */
function intrinsicAbilities(
  keywords: Set<Keyword>,
  ward: CardDef["ward"],
  equip?: string,
  crew?: number,
  equipReduced?: boolean,
  saddle?: number,
  crewOnce?: boolean,
  equipKind: EquipVariant = {},
  prowessCount = 1,
): CardDef["abilities"] {
  const out: CardDef["abilities"] = [];
  // 702.108b: each instance of prowess triggers separately (Thor Odinson: "prowess, prowess").
  for (let i = 0; keywords.has("prowess") && i < prowessCount; i++) {
    out.push({
      kind: "triggered",
      trigger: { on: "castSpell", by: "you", filter: { notTypes: ["Creature"] } },
      targets: [],
      effects: [{ op: "pump", what: { kind: "self" }, power: 1, toughness: 1 }],
      label: msg("Prowess"),
    });
  }
  if (saddle !== undefined) out.push(dsl.saddleAbility(saddle));
  if (crew !== undefined) out.push(dsl.crewAbility(crew, crewOnce));
  if (equip) {
    out.push({
      kind: "activated",
      cost: { mana: parseManaCost(equip) },
      targets: [
        equipKind.worthy
          ? { id: "t", label: msg("worthy creature you control"), filter: { objects: WORTHY } }
          : { id: "t", label: msg("creature you control"), filter: { objects: { types: ["Creature"], controller: "you" } } },
      ],
      effects: [{ op: "attach", what: { kind: "self" }, to: { kind: "target", id: "t" } }],
      sorcerySpeed: true,
      ...(equipReduced || equipKind.byColors
        ? {
            reduction: {
              generic: equipReduced
                ? ({ kind: "countersOn", ref: { kind: "target", id: "t" }, counter: "+1/+1" } as const)
                : ({ kind: "aggregate", fn: "distinct", property: "color", of: { kind: "target", id: "t" } } as const),
            },
          }
        : {}),
      equip: true,
      label: equipKind.worthy ? msg("Equip worthy {cost}", { cost: equip }) : msg("Equip {cost}", { cost: equip }),
    });
  }
  // Restricted equip abilities: "Equip commander", "Equip legendary creature".
  const restricted: [string | undefined, ObjectFilter, string, (cost: string) => string][] = [
    [equipKind.commander, { commander: true }, msg("commander you control"), (cost) => msg("Equip commander {cost}", { cost })],
    [
      equipKind.legendary,
      { legendary: true },
      msg("legendary creature you control"),
      (cost) => msg("Equip legendary creature {cost}", { cost }),
    ],
  ];
  for (const [cost, extra, targetLabel, label] of restricted) {
    if (!cost) continue;
    out.push({
      kind: "activated",
      cost: { mana: parseManaCost(cost) },
      targets: [{ id: "t", label: targetLabel, filter: { objects: { types: ["Creature"], controller: "you", ...extra } } }],
      effects: [{ op: "attach", what: { kind: "self" }, to: { kind: "target", id: "t" } }],
      sorcerySpeed: true,
      equip: true,
      label: label(cost),
    });
  }
  if (ward) out.push(dsl.wardAbility(ward));
  return out;
}

/** Definition of the prepared spell of a "prepare" card (copied into exile when the creature becomes prepared). */
function prepareSpellDef(raw: RawCard, spell: NonNullable<CardScript["prepareSpell"]>, set: string): CardDef {
  const p = raw.prepare as NonNullable<RawCard["prepare"]>;
  const types =
    p.typeLine
      .split(" — ")[0]
      ?.split(" ")
      .filter((w): w is CardType => CARD_TYPES.has(w as CardType)) ?? [];
  const manaCost = p.manaCost ? parseManaCost(p.manaCost) : null;
  const colors = (["W", "U", "B", "R", "G"] as Color[]).filter((c) => p.manaCost.includes(c));
  return {
    id: `${slug(raw.name)}--${slug(p.name)}`,
    name: p.name,
    typeLine: p.typeLine,
    manaCost,
    manaCostText: p.manaCost,
    colors,
    supertypes: [],
    types,
    subtypes: [],
    keywords: [],
    abilities: [],
    spell,
    text: p.oracleText,
    fr: p.fr ? { name: p.fr.name, typeLine: p.fr.typeLine, text: p.fr.text } : undefined,
    image: raw.image,
    artCrop: raw.artCrop,
    implemented: true,
    set,
    number: raw.number,
    rarity: raw.rarity,
    legalities: raw.legalities,
  };
}

/** Multi-faced layouts the engine can play (completed lot by lot: adventures, double-faced cards…). */
export const HANDLED_LAYOUTS = new Set<string>(["adventure", "transform", "modal_dfc", "meld", "split"]);

/**
 * Definition of a card. For a multi-faced card, each face has its own definition (script looked up by the face name in
 * `scripts`), and the card carries the characteristics outside the game: the front face, or the union of the two
 * halves of a split card.
 */
export function toCardDef(
  raw: RawCard,
  script: CardScript | undefined,
  set: string,
  scripts: Record<string, CardScript> = {},
): CardDef {
  if (!raw.faces?.length) {
    const d = singleDef(raw, script, set);
    // Meld: each card is imported on its own; playable when the engine handles the layout.
    if (raw.layout === "meld" && !HANDLED_LAYOUTS.has("meld")) d.implemented = false;
    if (raw.meld) {
      d.layout = "meld";
      d.meld = { parts: raw.meld.parts, result: raw.meld.result };
      d.meldResult = raw.name === raw.meld.result;
    }
    return d;
  }
  const faceDefs = raw.faces.map((f, i) => ({
    ...singleDef(faceRaw(raw, f), scripts[f.name], set),
    id: `${slug(raw.name)}__${i}`,
  }));
  const front = faceDefs[0] as CardDef;
  // 712.8e: the mana value of the back face of a transforming card is that of its front face.
  const back = faceDefs[1];
  if (raw.layout === "transform" && back && !back.manaCost) back.manaCost = front.manaCost;
  // Outside the game, the card has the characteristics and behavior of its front face (front face script).
  const base = singleDef(
    { ...faceRaw(raw, raw.faces[0] as RawFace), name: raw.name, image: raw.image, fr: raw.fr },
    script ?? scripts[raw.faces[0]?.name ?? ""],
    set,
  );
  const layout = raw.layout as CardDef["layout"];
  const card: CardDef = {
    ...base,
    id: slug(raw.name),
    name: raw.name,
    layout,
    faceDefs,
    // The card's text is that of the front face; the other faces are shown separately (preview).
    text: layout === "split" ? "" : front.text,
    legalities: raw.legalities,
    implemented: !!layout && HANDLED_LAYOUTS.has(layout) && faceDefs.every((f) => f.implemented),
  };
  if (layout === "split") {
    // 709.4: outside the stack, a split card has the combined characteristics of its two halves.
    const halves = faceDefs.slice(0, 2);
    const costs = halves.map((h) => h.manaCost).filter((c): c is NonNullable<typeof c> => !!c);
    card.manaCost = costs.length ? costs.reduce((a, b) => addManaCosts(a, b)) : front.manaCost;
    card.manaCostText = halves.map((h) => h.manaCostText).join(" // ");
    card.colors = [...new Set(halves.flatMap((h) => h.colors))];
    card.types = [...new Set(halves.flatMap((h) => h.types))];
    card.typeLine = halves.map((h) => h.typeLine).join(" // ");
    card.subtypes = [...new Set(halves.flatMap((h) => h.subtypes))];
    card.keywords = [];
    // Room (709.5): the card has only the "unlock" special actions; each door keeps its abilities, and "when you
    // unlock this door" refers to its own door.
    const room = halves.every((h) => h.subtypes.includes("Room"));
    halves.forEach((h, door) => {
      h.abilities = h.abilities.map((ab) =>
        ab.kind === "triggered" && ab.trigger.on === "unlockDoor" ? { ...ab, trigger: { on: "unlockDoor", door } } : ab,
      );
    });
    // Fuse (702.102): a third face, both halves cast together from the hand (total cost, targets and effects of the
    // left half then the right one; the "target" words of the two halves have different names).
    const [left, right] = halves;
    const fuse = /^Fuse\b/m.test(raw.faces[0]?.oracleText ?? "");
    if (fuse && left?.spell && right?.spell) {
      const mode = (h: CardDef) => h.spell?.modes[0] ?? { targets: [], effects: [] };
      card.faceDefs = [
        ...faceDefs,
        {
          ...left,
          id: `${slug(raw.name)}__fuse`,
          name: raw.name,
          manaCost: card.manaCost,
          manaCostText: card.manaCostText,
          colors: card.colors,
          typeLine: card.typeLine,
          text: [left.text, right.text].join("\n"),
          fr:
            left.fr && right.fr
              ? {
                  ...left.fr,
                  name: raw.fr?.name ?? `${left.fr.name} // ${right.fr.name}`,
                  text: [left.fr.text, right.fr.text].join("\n"),
                }
              : undefined,
          spell: {
            modes: [
              {
                targets: [...mode(left).targets, ...mode(right).targets],
                effects: [...mode(left).effects, ...mode(right).effects],
              },
            ],
          },
        } as CardDef,
      ];
    }
    card.abilities = room
      ? halves.map((h, door) => ({
          kind: "activated" as const,
          cost: { mana: h.manaCost ?? undefined },
          targets: [],
          effects: [{ op: "unlockDoor" as const, what: { kind: "self" as const }, door }],
          sorcerySpeed: true,
          specialAction: true,
          activationCondition: { kind: "doorLocked" as const, door },
          label: msg("Unlock {door}", { door: cardRef(h.id) }),
        }))
      : [];
  }
  return card;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

/**
 * Saga (714): last chapter read from the text. Class (716): level costs read from the text ("{W}: Level 2"), level
 * abilities taken from the script, and generated "Level N" abilities (sorcery speed, from level N−1).
 * Case (719): generated trigger "at the beginning of your end step, if [condition], it becomes solved".
 */
function sagaClassCase(
  raw: RawCard,
  script: CardScript | undefined,
): Partial<CardDef> & { extraAbilities?: CardDef["abilities"] } {
  const text = stripReminder(raw.oracleText);
  // Saga on the back face of a transforming card (FIN Summons): the face does not have the "saga" layout.
  if (raw.layout === "saga" || (!raw.faces?.length && /\bSaga\b/.test(raw.typeLine))) {
    const chapters = [...text.matchAll(/^([IVX]+(?:, [IVX]+)*) —/gm)].flatMap((m) =>
      (m[1] ?? "").split(", ").map((r) => ROMAN[r] ?? 0),
    );
    const saga = { chapters: Math.max(0, ...chapters) };
    return raw.layout === "saga" ? { layout: "saga", saga } : { saga };
  }
  if (raw.layout === "class") {
    const costs = [...text.matchAll(/^((?:\{[^}]+\})+): Level (\d+)/gm)].map((m) => ({
      cost: parseManaCost(m[1] ?? ""),
      level: Number(m[2]),
    }));
    const levels = costs.map((c, i) => ({ cost: c.cost, abilities: script?.classLevels?.[i] ?? [] }));
    const levelUps: CardDef["abilities"] = costs.map((c) => ({
      kind: "activated",
      cost: { mana: c.cost },
      targets: [],
      effects: [{ op: "setClassLevel", level: c.level }],
      sorcerySpeed: true,
      activationCondition: { kind: "classLevel", level: c.level - 1 },
      label: msg("Level {n}", { n: c.level }),
    }));
    return { layout: "class", classLevels: levels, extraAbilities: levelUps };
  }
  if (/^Station \(/m.test(raw.oracleText)) return parseStation(raw, script);
  if (raw.layout === "case") {
    const solve: CardDef["abilities"][number] = {
      kind: "triggered",
      trigger: { on: "step", step: "end", whose: "you" },
      targets: [],
      effects: [{ op: "solveCase" }],
      condition: {
        kind: "all",
        of: [{ kind: "not", cond: { kind: "solved" } }, script?.caseToSolve ?? { kind: "not", cond: { kind: "yourTurn" } }],
      },
      label: msg("To solve"),
    };
    return {
      layout: "case",
      caseSolved: script?.caseSolved ?? [],
      extraAbilities: [solve],
    };
  }
  return {};
}

/**
 * Station (702.184): "Station (…)" then thresholds "N+ | …" (the following lines belong to the last threshold). The
 * keywords of a threshold are read; its other abilities come from the script (`stationAbilities[N]`), otherwise the
 * card stays unhandled. The "Station" ability (tap another creature, at sorcery speed) is generated.
 */
function parseStation(
  raw: RawCard,
  script: CardScript | undefined,
): Partial<CardDef> & { extraAbilities?: CardDef["abilities"]; stationIncomplete?: boolean } {
  const creatureAt = /It's an artifact creature at (\d+)\+/.exec(raw.oracleText);
  const lines = stripReminder(raw.oracleText).split("\n");
  const start = lines.findIndex((l) => /^Station\b/.test(l.trim()));
  const thresholds: { n: number; parts: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^(\d+)\+ \| (.*)$/.exec(line.trim());
    if (m) thresholds.push({ n: Number(m[1]), parts: [m[2] as string] });
    else if (thresholds.length && line.trim()) thresholds[thresholds.length - 1]?.parts.push(line.trim());
  }
  let incomplete = false;
  const station = {
    creatureAt: creatureAt ? Number(creatureAt[1]) : undefined,
    thresholds: thresholds.map((t) => {
      const keywordParts = t.parts.filter((p) => p.split(/,\s*/).every((k) => k.trim().toLowerCase() in KEYWORD_NAMES));
      const others = t.parts.length - keywordParts.length;
      const abilities = script?.stationAbilities?.[t.n] ?? [];
      if (others > 0 && !script?.stationAbilities?.[t.n]) incomplete = true;
      return {
        n: t.n,
        keywords: keywordParts.flatMap((p) => p.split(/,\s*/).map((k) => KEYWORD_NAMES[k.trim().toLowerCase()] as Keyword)),
        abilities,
      };
    }),
  };
  const stationAbility: CardDef["abilities"][number] = {
    kind: "activated",
    cost: { tapOthers: { filter: { types: ["Creature"] }, count: 1 } },
    targets: [],
    effects: [{ op: "station" }],
    sorcerySpeed: true,
    label: msg("Station"),
  };
  return { station, extraAbilities: [stationAbility], stationIncomplete: incomplete };
}

/** Sum of two mana costs (mana value of a split card). */
function addManaCosts(
  a: NonNullable<CardDef["manaCost"]>,
  b: NonNullable<CardDef["manaCost"]>,
): NonNullable<CardDef["manaCost"]> {
  const colored = { ...a.colored };
  for (const [m, n] of Object.entries(b.colored))
    colored[m as keyof typeof colored] = (colored[m as keyof typeof colored] ?? 0) + (n ?? 0);
  return {
    generic: a.generic + b.generic,
    colored,
    x: a.x + b.x,
    hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])],
    twoHybrid: [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])],
  };
}

/** Raw data of a face, in the format of a single card. */
/**
 * Printed keyword: at the start of a line, or in a keyword list ("Flying, vigilance", "Ward {2}"), and not quoted in a
 * sentence ("Dion and other Knights have flying", "a Spider token with reach", "Goddric is a 4/4 Dragon with
 * flying"). Scryfall also lists these quoted words, and those of every face of the card.
 */
function printedKeyword(text: string, keyword: string): boolean {
  const k = keyword.toLowerCase();
  // A list item that is only a keyword (with its cost, its number or its reminder): the list goes on.
  const bare = /^[a-z][a-z' -]*?( \{[^}]*\}(\{[^}]*\})*| \d+| x)?( \(.*\))?$/;
  return text
    .toLowerCase()
    .split("\n")
    .some((line) => {
      for (const part of line.split(/,\s*/)) {
        const p = part.trim();
        if (p.startsWith(k) && (p.length === k.length || /^[\s,;:(—{]/.test(p.slice(k.length)))) return true;
        if (!bare.test(p)) return false;
      }
      return false;
    });
}

function faceRaw(raw: RawCard, f: RawFace): RawCard {
  const text = f.oracleText.toLowerCase();
  return {
    ...raw,
    name: f.name,
    manaCost: f.manaCost,
    typeLine: f.typeLine,
    oracleText: f.oracleText,
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    // Colors: those of the face (double-faced card), otherwise those of its cost (adventure, half of a split card).
    colors: f.colors ?? (["W", "U", "B", "R", "G"] as const).filter((c) => f.manaCost.includes(c)),
    keywords: raw.keywords.filter((k) => text.includes(k.toLowerCase())),
    image: f.image ?? raw.image,
    fr: f.fr,
    faces: undefined,
    layout: undefined,
  };
}

/** Creature types of several words (205.3m: "Time Lord"), kept together when the type line is split. */
const MULTI_WORD_TYPES = new Set(CREATURE_TYPES.filter((t) => t.includes(" ")));

function splitSubtypes(right: string): string[] {
  const words = right.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const two = `${words[i]} ${words[i + 1]}`;
    if (i + 1 < words.length && MULTI_WORD_TYPES.has(two)) {
      out.push(two);
      i++;
    } else out.push(words[i] as string);
  }
  return out;
}

/**
 * Additional costs of the spell (PLAN-M M5): the script's, X paid other than with mana and waterbending read from the
 * text, the surcharge per extra target and "forage or pay" of the script.
 */
function additionalCostOf(
  script: CardScript | undefined,
  xCost: AdditionalCost["xCost"],
  waterbend: number | undefined,
): AdditionalCost | undefined {
  const add: AdditionalCost = {
    ...script?.additionalCost,
    ...(xCost ? { xCost } : {}),
    ...(waterbend !== undefined ? { waterbend } : {}),
    ...(script?.costPerExtraTarget ? { costPerExtraTarget: parseManaCost(script.costPerExtraTarget) } : {}),
    ...(script?.forageOrPay ? { forageOrPay: parseManaCost(script.forageOrPay) } : {}),
  };
  return script?.additionalCost || Object.keys(add).length ? add : undefined;
}

/** The card's rules (PLAN-M M5): only those it has; none, no object. */
function cardRulesOf(rules: CardRules): CardRules | undefined {
  const out = Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== undefined)) as CardRules;
  return Object.keys(out).length ? out : undefined;
}

/** The alternative cost of a card (`CastOption` of kind `alternative`). */
type AlternativeCost = Extract<CastOption, { kind: "alternative" }>;

/**
 * The other ways to cast the card (PLAN-M M5), read from the text or written by the script: flashback (or harmonize,
 * the same casting for the harmonize cost), from the graveyard (retrace: by discarding a land card in addition),
 * mayhem, madness, warp, plot, foretell, flash for a surcharge, the alternative cost, face down (disguise, morph).
 */
function castOptionsOf(
  raw: RawCard,
  script: CardScript | undefined,
  flashback: string | undefined,
  harmonize: boolean,
  mayhem: string | undefined,
  alternative: AlternativeCost | undefined,
): CastOption[] | undefined {
  const text = raw.oracleText;
  const flashbackCost = script?.flashback ?? flashback;
  const graveyard =
    script?.castFromGraveyard ?? (/^Retrace\b/m.test(text) ? { discard: 1, discardFilter: { types: ["Land"] } } : undefined);
  const madness = parseKeywordCost(text, "Madness") ?? parseMadnessPay(text);
  const plot = parsePlot(text);
  const foretell = parseForetell(text);
  const disguise = parseDisguise(text);
  const options: (CastOption | undefined)[] = [
    flashbackCost
      ? {
          kind: "flashback",
          cost: parseManaCost(flashbackCost),
          ...(script?.flashbackCost ? { extra: script.flashbackCost } : {}),
          ...(harmonize ? { harmonize: true } : {}),
        }
      : undefined,
    graveyard ? { kind: "graveyard", ...graveyard } : undefined,
    mayhem ? { kind: "mayhem", cost: parseManaCost(mayhem) } : undefined,
    madness ? { kind: "madness", cost: madness } : undefined,
    parseWarp(text),
    plot ? { kind: "plot", cost: plot } : undefined,
    foretell ? { kind: "foretell", cost: foretell } : undefined,
    script?.flashExtraCost ? { kind: "flash", cost: parseManaCost(script.flashExtraCost) } : undefined,
    alternative,
    disguise
      ? {
          kind: "faceDown",
          cost: disguise,
          ...(/^Morph \{/m.test(stripReminder(text)) ? { morph: true as const } : {}),
          ...(script?.disguiseReduction ? { reducedBy: script.disguiseReduction } : {}),
        }
      : undefined,
  ];
  const out = options.filter((o): o is CastOption => !!o);
  return out.length ? out : undefined;
}

function singleDef(raw: RawCard, script: CardScript | undefined, set: string): CardDef {
  const [left = "", right = ""] = raw.typeLine.split(" — ");
  const words = left.split(" ").filter(Boolean);
  const supertypes = words.filter((w) => SUPERTYPES.has(w));
  const types = words.filter((w): w is CardType => CARD_TYPES.has(w as CardType));
  const subtypes = splitSubtypes(right);

  let implemented = !!script || onlyKeywords(raw.oracleText);
  // "Prepare" cards: playable only if the script describes their spell.
  if (raw.prepare && !script?.prepareSpell) implemented = false;
  let manaCost = null;
  try {
    manaCost = raw.manaCost ? parseManaCost(raw.manaCost) : null;
  } catch {
    implemented = false;
  }
  const power = parseInt0(raw.power);
  const toughness = parseInt0(raw.toughness);
  // Variable P/T (*): only if the script defines them (characteristic-defining ability).
  if (
    (power === null || toughness === null) &&
    script?.cdaPT === undefined &&
    script?.cdaPower === undefined &&
    script?.cdaToughness === undefined
  )
    implemented = false;

  const keywords = new Set<Keyword>();
  // "Hexproof from X" is not full hexproof (Scryfall also lists "Hexproof").
  const partialHexproof = raw.keywords.includes("Hexproof from");
  for (const k of raw.keywords) {
    const kw = KEYWORD_NAMES[k.toLowerCase()];
    if (kw && !(kw === "hexproof" && partialHexproof) && printedKeyword(raw.oracleText, k)) keywords.add(kw);
  }
  for (const k of script?.keywords ?? []) keywords.add(k);
  // "Enchanted permanent has ward {1}" (Hardlight Containment): granted ward, not the card's own.
  const ward = raw.keywords.some((k) => k.toLowerCase() === "ward") ? parseWard(raw.oracleText) : undefined;
  if (ward) keywords.add("ward");

  const {
    extraAbilities = [],
    stationIncomplete,
    ...levelFields
  } = sagaClassCase(raw, script) as ReturnType<typeof sagaClassCase> & { stationIncomplete?: boolean };
  // Bloomburrow: Offspring and Gift are optional costs, like a kicker.
  const offspring = parseOffspring(raw.oracleText);
  const gift = parseGift(raw.oracleText);
  // Wilds of Eldraine: Bargain (702.166), a kicker "sacrifice an artifact, enchantment, or token".
  const bargain = raw.keywords.includes("Bargain");
  // Lorwyn Eclipsed: "as an additional cost, you may blight N"; Marvel Super Heroes: Teamwork N.
  // Murders at Karlov Manor: "as an additional cost, you may collect evidence N".
  const evidence = Number(
    /As an additional cost to cast this spell, you may collect evidence (\d+)/.exec(raw.oracleText)?.[1] ?? 0,
  );
  // Evoke (702.74) and Mobilize (702.181, Tarkir: Dragonstorm).
  const evoke = /^Evoke ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  const mobilize = Number(/^Mobilize (\d+)/m.exec(raw.oracleText)?.[1] ?? 0);
  // Firebending N (Avatar): "whenever this creature attacks, add N {R}" (until end of combat), alone on its line or
  // among other keywords ("Flying, firebending 2", "Trample, firebending 4, haste").
  const firebending = Number(/^(?:[A-Z][a-z]+(?: [a-z]+)?, )*[Ff]irebending (\d+)(?:,| \(|$)/m.exec(raw.oracleText)?.[1] ?? 0);
  // The Hobbit: Storied; Teenage Mutant Ninja Turtles: Sneak; Spider-Man: Mayhem; Strixhaven: Paradigm.
  const storied = /^Storied\b/m.test(raw.oracleText);
  const sneak = /^Sneak ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Dash (702.109), blitz (702.152) and spectacle (702.137): alternative costs.
  const dash = /^Dash ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Blitz: haste, "when this creature dies, draw a card" and the sacrifice at the next end step come from the cast
  // (`via: "blitz"`, `stack.ts`), as for granted blitz.
  const blitz = /^Blitz ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Emerge (702.119): by sacrificing a creature, cost reduced by its mana value; "Emerge from artifact" (702.119a,
  // Crabomination): by sacrificing an artifact.
  const emergeMatch = /^Emerge (?:from (artifact) )?((?:\{[^}]+\})+)/m.exec(raw.oracleText);
  const emerge = emergeMatch?.[2];
  const emergeFrom: CardType = emergeMatch?.[1] ? "Artifact" : "Creature";
  const spectacle = /^Spectacle ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Exalted (702.83), affinity for artifacts (702.41), modular (702.43), graft (702.58), extort (702.101).
  const exalted = /^Exalted\b/m.test(raw.oracleText);
  const myriad = /^Myriad\b/m.test(raw.oracleText);
  // "As this land enters, you may pay N life"; a legendary land names itself ("As The Black Gate enters").
  const selfName = raw.name.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const shockLand = Number(
    new RegExp(
      `(?:As (?:this land|${selfName}) enters, |Then )you may pay (\\d+) life\\. If you don't, it enters tapped\\.`,
    ).exec(raw.oracleText)?.[1] ?? 0,
  );
  // Annihilator N (702.86); unearth (702.84).
  const annihilator = Number(/^Annihilator (\d+)/m.exec(raw.oracleText)?.[1] ?? 0);
  const unearth = /^Unearth ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  const affinityArtifacts = /^Affinity for artifacts\b/m.test(raw.oracleText);
  const modular = Number(/^Modular (\d+)/m.exec(raw.oracleText)?.[1] ?? 0);
  const graft = Number(/^Graft (\d+)/m.exec(raw.oracleText)?.[1] ?? 0);
  const extort = /^Extort\b/m.test(raw.oracleText);
  // Storm (702.40): a copy for each spell cast before it this turn (counted on cast, all players).
  const storm = /^Storm\b/m.test(raw.oracleText);
  // Replicate (702.56): the replicate cost is paid X times (kicker of kind "replicate"); the spell is copied X times.
  const replicate = /^Replicate ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Squad (702.157): the squad cost is paid X times (kicker of kind "squad"); as many copies when it enters.
  const squad = /^Squad ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Multikicker (702.33c): paid X times, like replicate; the script reads X (`amount.x`).
  const multikicker = /^Multikicker ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Suspend (702.62): special action from the hand, the card exiled with N time counters.
  const suspend = /^Suspend (\d+)—((?:\{[^}]+\})+)/m.exec(raw.oracleText);
  // A land has mayhem without a cost (Oscorp Industries: "you may play this card from your graveyard").
  const mayhem =
    /^Mayhem ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1] ?? (/^Mayhem \(You may play/m.test(raw.oracleText) ? "{0}" : undefined);
  const paradigm = /^Paradigm\b/m.test(raw.oracleText);
  // Spider-Man: Web-slinging; Strixhaven: "as an additional cost, pay X life".
  const webSlinging = /^Web-slinging ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  const payLifeX = /As an additional cost to cast this spell, pay X life\./.test(raw.oracleText);
  // Lorwyn Eclipsed: "you may blight N" (kicker), "blight N or pay {M}" (kicker or mana), "blight X".
  const blightCost = /As an additional cost to cast this spell, (you may )?blight (\d+)(?: or pay ((?:\{[^}]+\})+))?/.exec(
    raw.oracleText,
  );
  const blight = blightCost && (blightCost[1] || blightCost[3]) ? Number(blightCost[2]) : 0;
  const blightOrPay = blight ? blightCost?.[3] : undefined;
  const blightX = /As an additional cost to cast this spell, blight X\./.test(raw.oracleText);
  // Strixhaven: "exile N cards from your graveyard or pay {M}" (kicker or mana).
  const exileOrPay =
    /As an additional cost to cast this spell, exile (one|two|three|four|five) cards? from your graveyard or pay ((?:\{[^}]+\})+)\./.exec(
      raw.oracleText,
    );
  const exileGraveyard = exileOrPay ? ["one", "two", "three", "four", "five"].indexOf(exileOrPay[1] as string) + 1 : 0;
  const teamwork = Number(/^Teamwork (\d+)/m.exec(raw.oracleText)?.[1] ?? 0);
  // "pay N life or pay {M}" (Redirect Lightning): the kicker pays the life, otherwise the mana is added.
  const lifeOrPay = /As an additional cost to cast this spell, pay (\d+) life or pay ((?:\{[^}]+\})+)\./.exec(raw.oracleText);
  // Avatar: waterbending as an additional cost, "waterbend {N}", "waterbend {X}" or "you may waterbend {N}" (kicker).
  const waterbendCost = /As an additional cost to cast this spell, (you may )?waterbend \{(\d+|X)\}/.exec(raw.oracleText);
  const waterbendKicker = waterbendCost?.[1] ? `{${waterbendCost[2]}}` : undefined;
  const waterbendX = !!waterbendCost && !waterbendCost[1] && waterbendCost[2] === "X";
  const waterbendN = waterbendCost && !waterbendCost[1] && !waterbendX ? Number(waterbendCost[2]) : undefined;
  const harmonize = /^Harmonize ((?:\{[^}]+\})+)/m.exec(raw.oracleText)?.[1];
  // Flashback with a mana cost only (702.34a): "Flashback {1}{U}{B}"; the other costs (life, sacrifice…) are scripted.
  const flashbackMana = /^Flashback ((?:\{[^}]+\})+)(?= \(|$)/m.exec(raw.oracleText)?.[1];
  const isSpell = types.includes("Instant") || types.includes("Sorcery");
  const bloomburrowAbilities: CardDef["abilities"] = [];
  if (evoke) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.sacrificeIt(dsl.ref.self)], {
        condition: dsl.cond.evoked,
        label: msg("Evoked: sacrifice it"),
      }),
    );
  }
  if (firebending) {
    bloomburrowAbilities.push(dsl.firebending(firebending));
  }
  // Annihilator N (702.86a): whenever it attacks, the defending player sacrifices N permanents.
  if (annihilator) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.attacksSelf, [dsl.fx.sacrifice(dsl.ref.defendingPlayer, { permanent: true }, annihilator)], {
        label: msg("Annihilator {n}: defending player sacrifices {n} permanent(s)", { n: annihilator }),
      }),
    );
  }
  // Unearth (702.84a): from the graveyard, at sorcery speed; it returns with haste, is exiled at the beginning of the
  // next end step, and would be exiled instead if it would leave the battlefield.
  if (unearth) {
    bloomburrowAbilities.push(
      dsl.activated({
        mana: unearth,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [
          dsl.fx.moveTo(dsl.ref.self, { to: "battlefield", addKeywords: ["haste"], exileIfLeaves: true }, { name: "unearth" }),
          dsl.fx.delayed([dsl.fx.exile(dsl.ref.target("unearth"))], { unearth: dsl.ref.stored("unearth") }),
        ],
        label: msg("Unearth {cost}", { cost: unearth }),
      }),
    );
  }
  // Myriad (702.116): whenever it attacks, for each opponent other than the defending player, you may create a tapped
  // copy attacking that player or a planeswalker they control, exiled at end of combat.
  if (myriad) bloomburrowAbilities.push(dsl.myriadAbility());
  // Soulbond (702.95): the two pairing abilities.
  if (/^Soulbond\b/m.test(raw.oracleText)) bloomburrowAbilities.push(...dsl.soulbondAbilities());
  if (exalted) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.attacksAlone({ types: ["Creature"], controller: "you" }), [dsl.fx.pump(dsl.ref.eventObject, 1, 1)], {
        label: msg("Exalted: the creature attacking alone gets +1/+1"),
      }),
    );
  }
  // Modular N: enters with N +1/+1 counters; when put into a graveyard from the battlefield (702.43a: "this
  // permanent", a creature or not, like Power Depot), its +1/+1 counters can go onto an artifact creature.
  if (modular) {
    bloomburrowAbilities.push(
      dsl.entersWith({ counters: modular, label: msg("Modular {n}", { n: modular }) }),
      dsl.triggered(dsl.when.putIntoGraveyardSelf, [dsl.fx.addCounters(dsl.ref.target(), dsl.amount.countersOn(dsl.ref.self))], {
        targets: [
          dsl.target.optional({
            id: "t",
            label: msg("artifact creature"),
            filter: { objects: { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] } },
          }),
        ],
        label: msg("Modular: its +1/+1 counters onto an artifact creature"),
      }),
    );
  }
  // Graft N: enters with N +1/+1 counters; when another creature enters, a counter can be moved onto it.
  if (graft) {
    bloomburrowAbilities.push(
      dsl.entersWith({ counters: graft, label: msg("Graft {n}", { n: graft }) }),
      dsl.triggered(
        dsl.when.enters({ types: ["Creature"], other: true }),
        dsl.fx.may(
          msg("move a +1/+1 counter onto the entering creature"),
          dsl.fx.removeCounters(dsl.ref.self, 1, "+1/+1", "g"),
          dsl.fx.addCounters(dsl.ref.eventObject, dsl.amount.v("g")),
        ),
        { condition: dsl.cond.amountAtLeast(dsl.amount.countersOn(dsl.ref.self), 1), label: msg("Graft") },
      ),
    );
  }
  // Extort: with each spell cast, pay {W/B}: each opponent loses 1 life and you gain that much life.
  if (extort) {
    bloomburrowAbilities.push(
      dsl.triggered(
        dsl.when.castSpell("you"),
        dsl.fx.mayPay(
          "{W/B}",
          msg("pay {W/B} (extort)"),
          dsl.fx.loseLife(1, dsl.ref.eachOpponent, "e"),
          dsl.fx.gainLife(dsl.amount.v("e")),
        ),
        { label: msg("Extort") },
      ),
    );
  }
  if (suspend) {
    const n = Number(suspend[1]);
    bloomburrowAbilities.push({
      ...dsl.activated({
        fromHand: true,
        mana: suspend[2],
        sorcerySpeed: !types.includes("Instant") && !raw.keywords.includes("Flash"),
        effects: [dsl.fx.suspend(dsl.ref.self, n)],
        label: msg("Suspend {n} — {cost}", { n, cost: suspend[2] as string }),
      }),
      specialAction: true,
    });
  }
  if (replicate) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.castSelf, [dsl.fx.copySpell(dsl.ref.self, dsl.amount.sourceX)], {
        label: msg("Replicate: copy it for each time its replicate cost was paid"),
      }),
    );
  }
  if (squad) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.copyToken(dsl.ref.self, { count: dsl.amount.sourceX })], {
        condition: dsl.cond.amountAtLeast(dsl.amount.sourceX, 1),
        label: msg("Squad: a copy for each time its squad cost was paid"),
      }),
    );
  }
  if (storm) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.castSelf, [dsl.fx.copySpell(dsl.ref.self, dsl.amount.eventAmount)], { label: msg("Storm") }),
    );
  }
  // Dash: the creature has haste and returns to its owner's hand at the beginning of the next end step.
  if (dash) {
    const dashed = dsl.cond.castVia("dash");
    bloomburrowAbilities.push(
      dsl.staticAbility("self", { addKeywords: ["haste"] }, { condition: dashed, label: msg("Dash: haste") }),
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.delayed([dsl.fx.toHand(dsl.ref.target("d"))], { d: dsl.ref.self })], {
        condition: dashed,
        label: msg("Dash: returns to hand at the next end step"),
      }),
    );
  }
  if (mobilize) {
    bloomburrowAbilities.push(
      dsl.triggered(
        dsl.when.attacksSelf,
        [
          dsl.fx.createTappedTokens(MOBILIZE_WARRIOR, mobilize, { attacking: true, store: "mob" }),
          dsl.fx.delayed([dsl.fx.sacrificeIt(dsl.ref.target("m"))], { m: dsl.ref.stored("mob") }),
        ],
        { label: msg("Mobilize {n}", { n: mobilize }) },
      ),
    );
  }
  if (offspring) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.copyToken(dsl.ref.self, { pt: 1 })], {
        condition: dsl.cond.kicked,
        label: msg("Offspring: 1/1 token copy"),
      }),
    );
  }
  if (gift && !isSpell) {
    bloomburrowAbilities.push(
      dsl.triggered(dsl.when.entersSelf, giftEffects(gift).slice(1), { condition: dsl.cond.kicked, label: msg("Gift promised") }),
    );
  }
  const spell: SpellDef | undefined =
    gift && isSpell && script?.spell
      ? { modes: script.spell.modes.map((m) => ({ ...m, effects: [...giftEffects(gift), ...m.effects] })) }
      : script?.spell;
  // Station: a threshold whose abilities (other than keywords) are not scripted makes the card unhandled.
  if (stationIncomplete) implemented = false;
  const kickerMana = script?.kicker
    ? parseManaCost(script.kicker)
    : replicate || squad || multikicker
      ? parseManaCost(replicate ?? squad ?? multikicker ?? "")
      : offspring
        ? parseManaCost(offspring)
        : waterbendKicker
          ? parseManaCost(waterbendKicker)
          : gift || bargain || lifeOrPay || blight || teamwork || evidence || exileGraveyard
            ? parseManaCost("{0}")
            : undefined;
  const kickerKind: KickerDef["kind"] = replicate
    ? "replicate"
    : squad
      ? "squad"
      : multikicker
        ? "multikicker"
        : offspring
          ? "offspring"
          : waterbendKicker
            ? "waterbend"
            : lifeOrPay
              ? "life"
              : gift
                ? "gift"
                : bargain
                  ? "bargain"
                  : blight
                    ? "blight"
                    : teamwork
                      ? "teamwork"
                      : evidence
                        ? "evidence"
                        : exileGraveyard
                          ? "exileGraveyard"
                          : undefined;
  const kickerPay: KickerDef["pay"] =
    script?.kickerCost ??
    (bargain
      ? { sacrifice: BARGAIN_FILTER }
      : blight
        ? { blight }
        : teamwork
          ? { tapPower: teamwork }
          : evidence
            ? { collectEvidence: evidence }
            : exileGraveyard
              ? { exileGraveyard }
              : lifeOrPay
                ? { life: Number(lifeOrPay[1]) }
                : undefined);
  const kickerOrPay = blightOrPay
    ? parseManaCost(blightOrPay)
    : exileOrPay
      ? parseManaCost(exileOrPay[2] as string)
      : lifeOrPay
        ? parseManaCost(lifeOrPay[2] as string)
        : undefined;
  const kickerDef: KickerDef | undefined = kickerMana
    ? { mana: kickerMana, kind: kickerKind, pay: kickerPay, orPay: kickerOrPay, gift }
    : undefined;
  const alternative: AlternativeCost | undefined = script?.altCost
    ? {
        kind: "alternative",
        mana: parseManaCost(script.altCost.mana),
        condition: script.altCost.condition,
        label: script.altCost.label,
        ...(script.altCost.pay ? { pay: script.altCost.pay } : {}),
      }
    : script?.forageOrPay && manaCost
      ? {
          kind: "alternative",
          mana: manaCost,
          condition: dsl.cond.canForage,
          label: msg("Forage — {cost}", { cost: raw.manaCost }),
          forage: true,
        }
      : evoke
        ? {
            kind: "alternative",
            mana: parseManaCost(evoke),
            condition: dsl.cond.all(),
            label: msg("Evoke — {cost}", { cost: evoke }),
            via: "evoke",
          }
        : sneak
          ? {
              kind: "alternative",
              mana: parseManaCost(sneak),
              condition: dsl.cond.sneakWindow,
              label: msg("Sneak — {cost}", { cost: sneak }),
              via: "sneak",
            }
          : dash
            ? {
                kind: "alternative",
                mana: parseManaCost(dash),
                condition: dsl.cond.all(),
                label: msg("Dash — {cost}", { cost: dash }),
                via: "dash",
              }
            : blitz
              ? {
                  kind: "alternative",
                  mana: parseManaCost(blitz),
                  condition: dsl.cond.all(),
                  label: msg("Blitz — {cost}", { cost: blitz }),
                  via: "blitz",
                }
              : emerge
                ? {
                    kind: "alternative",
                    mana: parseManaCost(emerge),
                    condition: dsl.cond.controls({ types: [emergeFrom] }),
                    label:
                      emergeFrom === "Artifact"
                        ? msg("Emerge from artifact — {cost}", { cost: emerge })
                        : msg("Emerge — {cost}", { cost: emerge }),
                    pay: { sacrificeReduce: { types: [emergeFrom] } },
                  }
                : spectacle
                  ? {
                      kind: "alternative",
                      mana: parseManaCost(spectacle),
                      condition: dsl.cond.opponentLostLife,
                      label: msg("Spectacle — {cost}", { cost: spectacle }),
                    }
                  : webSlinging
                    ? {
                        kind: "alternative",
                        mana: parseManaCost(webSlinging),
                        condition: dsl.cond.controls({ types: ["Creature"], tapped: true }),
                        label: msg("Web-slinging — {cost}", { cost: webSlinging }),
                        via: "webSlinging",
                      }
                    : impendingAltCost(raw.oracleText);
  const def: CardDef = {
    id: slug(raw.name),
    name: raw.name,
    typeLine: raw.typeLine,
    manaCost,
    manaCostText: raw.manaCost,
    colors: raw.colors.filter((c): c is Color => "WUBRG".includes(c)),
    supertypes,
    types,
    subtypes,
    power: power ?? undefined,
    toughness: toughness ?? undefined,
    keywords: [...keywords],
    abilities: [
      ...(script?.abilities ?? []),
      ...intrinsicAbilities(
        keywords,
        ward,
        parseEquip(raw.oracleText),
        parseCrew(raw.oracleText),
        /costs \{1\} less to activate for each \+1\/\+1 counter on the creature it targets/.test(raw.oracleText),
        parseSaddle(raw.oracleText),
        crewOncePerTurn(raw.oracleText),
        equipVariant(raw.oracleText),
        Math.max(1, [...stripReminder(raw.oracleText).matchAll(/(?:^|, )prowess(?=,|$)/gim)].length),
      ),
      ...plotAbility(raw.oracleText),
      ...foretellAbility(raw.oracleText),
      ...cumulativeUpkeep(raw.oracleText),
      ...impendingAbilities(raw.oracleText),
      ...jobSelectAbility(raw.keywords),
      ...(parseCycling(raw.oracleText) ? [parseCycling(raw.oracleText) as CardDef["abilities"][number]] : []),
      ...(parseTransmute(raw.oracleText, raw.cmc ?? 0)
        ? [parseTransmute(raw.oracleText, raw.cmc ?? 0) as CardDef["abilities"][number]]
        : []),
      ...(parseOutlast(raw.oracleText) ? [parseOutlast(raw.oracleText) as CardDef["abilities"][number]] : []),
      ...extraAbilities,
      ...bloomburrowAbilities,
    ],
    ...levelFields,
    enchant: script?.enchant,
    loyalty: raw.loyalty ? Number(raw.loyalty) : undefined,
    leyline: script?.leyline,
    cda:
      script?.cdaPT !== undefined || script?.cdaPower !== undefined || script?.cdaToughness !== undefined
        ? { pt: script?.cdaPT, power: script?.cdaPower, toughness: script?.cdaToughness }
        : undefined,
    ward,
    spell,
    kicker: kickerDef,
    rules: cardRulesOf({
      cantBeCountered: script?.cantBeCountered,
      cantBeCopied: /This spell can't be copied\./.test(raw.oracleText) || undefined,
      exileOnResolve: script?.exileOnResolve,
      shuffleIntoLibrary: script?.shuffleIntoLibrary,
      paradigm: paradigm || undefined,
      storied: storied || undefined,
      controlsEnchanted: script?.controlsEnchanted,
      opponentDiscardToBattlefield: script?.opponentDiscardToBattlefield,
      equipDiscountWhenTargeted: script?.equipDiscountWhenTargeted,
      chosenNameAbilities: script?.chosenNameAbilities,
      castCondition: script?.castCondition,
      flashIf: script?.flashIf,
      whenCast: script?.whenCast,
    }),
    castOptions: castOptionsOf(raw, script, harmonize ?? flashbackMana, !!harmonize, mayhem, alternative),
    faceUpCounters: script?.faceUpCounters,
    asEnters: asEntersOf(script?.asEnters, raw.oracleText),
    shockLand: shockLand || undefined,
    additionalCost: additionalCostOf(
      script,
      payLifeX ? "life" : blightX ? "blight" : waterbendX ? "waterbend" : undefined,
      waterbendN,
    ),
    costReduction:
      script?.costReduction ??
      (affinityArtifacts ? { generic: dsl.amount.count({ types: ["Artifact"], controller: "you" }) } : undefined),
    text: raw.oracleText,
    fr: raw.fr,
    image: raw.image,
    artCrop: raw.artCrop,
    prepareSpell: raw.prepare && script?.prepareSpell ? prepareSpellDef(raw, script.prepareSpell, set) : undefined,
    prepareFace: raw.prepare
      ? {
          name: raw.prepare.name,
          manaCost: raw.prepare.manaCost,
          typeLine: raw.prepare.typeLine,
          text: raw.prepare.oracleText,
          fr: raw.prepare.fr,
        }
      : undefined,
    implemented,
    set,
    number: raw.number,
    rarity: raw.rarity,
    legalities: raw.legalities,
  };
  const reveal = new Set<string>([
    ...(SEARCH_REVEAL.test(raw.oracleText) ? ["search"] : []),
    ...(LOOK_REVEAL.test(raw.oracleText) ? ["lookAtTop"] : []),
  ]);
  const revealed = reveal.size ? withReveal(def, reveal) : def;
  return BOTTOM_ANY_ORDER.test(raw.oracleText) ? withBottomAnyOrder(revealed) : revealed;
}

/** "… the rest on the bottom of your library in any order": the player orders them (`lookAtTop` `bottomAnyOrder`). */
const BOTTOM_ANY_ORDER = /bottom of (?:your|their|his or her|its owner.s) library in any order/i;

/** The card's looks put the rest on the bottom in an order chosen by the player: copies, like `withReveal`. */
function withBottomAnyOrder<T>(x: T): T {
  if (Array.isArray(x)) return x.map(withBottomAnyOrder) as T;
  if (!x || typeof x !== "object") return x;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) out[k] = withBottomAnyOrder(v);
  if (out.op === "lookAtTop" && out.rest === "bottom") out.rest = "bottomAnyOrder";
  return out as T;
}

/** "Search your library for …, reveal it" (701.23; typecycling's reminder text too). */
const SEARCH_REVEAL = /\bsearch(?:es)?\b[^.]*?\breveals? (?:it|them|those cards|that card|the card|those|both)\b/i;
/** "Look at the top N cards …. You may reveal a creature card from among them and put it into your hand." */
const LOOK_REVEAL = /\blooks? at the top\b[\s\S]*?\breveals? (?:a|an|up to|it|that card|two|any number|one|those)\b/i;

/** The card's searches or looks reveal the cards taken (`reveal`): copies, script objects may be shared between cards. */
function withReveal<T>(x: T, ops: ReadonlySet<string>): T {
  if (Array.isArray(x)) return x.map((v) => withReveal(v, ops)) as T;
  if (!x || typeof x !== "object") return x;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) out[k] = withReveal(v, ops);
  if (typeof out.op === "string" && ops.has(out.op)) out.reveal = true;
  return out as T;
}
