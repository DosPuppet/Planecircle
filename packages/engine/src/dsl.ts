/**
 * A small DSL to write card behavior. It only produces data.
 *
 *   spell([target.any()], [fx.damage(3, ref.target())])
 */
import { countersFx } from "./dsl/fx-counters";
import { damageFx } from "./dsl/fx-damage";
import { flowFx } from "./dsl/fx-flow";
import { manaFx } from "./dsl/fx-mana";
import { payFx } from "./dsl/fx-pay";
import { permanentsFx } from "./dsl/fx-permanents";
import { playersFx } from "./dsl/fx-players";
import { spellsFx } from "./dsl/fx-spells";
import { zonesFx } from "./dsl/fx-zones";
import { ref, target } from "./dsl/refs";
import type { Effects } from "./dsl/shared";
import { triggered, when } from "./dsl/when";
import { parseManaCost } from "./mana";
import { msg } from "./text";
import type {
  AbilityDef,
  ActivatedAbilityDef,
  AdditionalCost,
  AggregateProperty,
  AltCostPay,
  Amount,
  BlockRule,
  CardDef,
  CastOption,
  CastPermissionAbilityDef,
  CastVia,
  Color,
  Condition,
  CostReductionAbilityDef,
  Effect,
  EventReplacementAbilityDef,
  FilterCompare,
  GraveyardReplacementAbilityDef,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaType,
  ModeDef,
  ObjectFilter,
  PayCost,
  PlayerStaticAbilityDef,
  PowerRule,
  PreventionAbilityDef,
  ProtectionRule,
  Ref,
  ReplacementAbilityDef,
  SpellDef,
  StaticAbilityDef,
  Step,
  TargetSpec,
  TriggeredAbilityDef,
  TriggerSpec,
  TurnLogQuery,
} from "./types";

export { ref, target } from "./dsl/refs";
export type { Effects } from "./dsl/shared";
export {
  SACRIFICE_TOKEN_AT_END_STEP,
  TO_CREATURE,
  TO_OPPONENT,
  TO_PLAYER,
  TO_PLAYER_OR_PLANESWALKER,
  triggered,
  when,
} from "./dsl/when";

/** Behavior of a card, merged with its characteristics (from Scryfall). */
export interface CardScript {
  abilities?: AbilityDef[];
  spell?: SpellDef;
  /** Kicker cost, e.g. "{4}". */
  kicker?: string;
  /** Kicker without mana (with `kicker: "{0}"`): a permanent sacrificed or returned, chosen automatically. */
  kickerCost?: {
    sacrifice?: ObjectFilter;
    bounce?: ObjectFilter;
    blight?: number;
    tapPower?: number;
    collectEvidence?: number;
    /** "Exile N cards from your graveyard or pay [mana]" (Soaring Stoneglider), with `kickerOrPay`. */
    exileGraveyard?: number;
  };
  /** Flashback cost, e.g. "{4}{R}{R}". */
  flashback?: string;
  /** "Flashback—[cost], discard a card" or "Flashback—tap three creatures": costs on top of the flashback. */
  flashbackCost?: AdditionalCost;
  faceUpCounters?: CardDef["faceUpCounters"];
  /** "This spell can't be countered." */
  cantBeCountered?: boolean;
  /** "This spell can't be copied." */
  cantBeCopied?: boolean;
  /** "This spell costs [mana] more for each target beyond the first", e.g. "{W}{U}". */
  costPerExtraTarget?: string;
  /** "This [disguise] cost is reduced by {1} for each…" (Fugitive Codebreaker). */
  disguiseReduction?: Amount;
  /** Aura: "Enchant [filter]". */
  /** `player`: "Enchant player" (Grievous Wound). */
  /** `graveyard`: "enchant creature card in a graveyard" (Animate Dead). */
  enchant?: { filter: ObjectFilter; label: string; player?: boolean; graveyard?: boolean };
  /** May begin the game on the battlefield (Leyline). */
  leyline?: CardDef["leyline"];
  /** Alternative cost: "you may pay {B} rather than… if [condition]". */
  altCost?: { mana: string; condition: Condition; label: string; pay?: AltCostPay };
  /** P/T defined by an ability (starred P/T on the card). */
  cdaPT?: Amount;
  /**
   * "As it enters" (614.1c, 614.12): choices (`fx.chooseForSelf`, `fx.chooseCopy`, `fx.devour`) and other effects done
   * while the permanent enters; counters put on `ref.self` are the ones it enters with.
   */
  asEnters?: Effect[];
  shuffleIntoLibrary?: boolean;
  /** Activated abilities of sources with the chosen name: {N} more (Skyseer's Chariot) or forbidden except mana (`"forbid"`). */
  chosenNameAbilities?: number | "forbid";
  equipDiscountWhenTargeted?: number;
  /** "[This card] has flash as long as …" */
  flashIf?: Condition;
  /** "… if you controlled [X] as you cast this spell": evaluated on casting (`cond.metWhenCast`). */
  whenCast?: Condition;
  exileOnResolve?: boolean;
  /** "You may cast this card from your graveyard [if…]" */
  castFromGraveyard?: Omit<Extract<CastOption, { kind: "graveyard" }>, "kind">;
  /** Only the power is variable (Enigma Drake). */
  cdaPower?: Amount;
  /** Only the toughness is variable (Tarmogoyf, with `cdaPower`). */
  cdaToughness?: Amount;
  /** "… as though it had flash if you pay {2} more" */
  flashExtraCost?: string;
  opponentDiscardToBattlefield?: boolean;
  /** Aura: "You control enchanted permanent". */
  controlsEnchanted?: boolean;
  additionalCost?: AdditionalCost;
  costReduction?: { generic: Amount; colored?: ManaCost["colored"]; condition?: Condition };
  keywords?: Keyword[];
  /** "You can't cast this spell unless…" */
  castCondition?: Condition;
  /** Reality Fracture: effect of the prepared spell (the cost and the type come from Scryfall). */
  prepareSpell?: SpellDef;
  /** Station (702.184): non-keyword abilities of each "N+" threshold (the keywords are read from the text). */
  stationAbilities?: Record<number, AbilityDef[]>;
  /** Class (716): abilities added at levels 2, 3… (the level costs are read from the text). */
  classLevels?: AbilityDef[][];
  /** Case (719): "To solve — [condition]" and "Solved — …" abilities. */
  caseToSolve?: Condition;
  caseSolved?: AbilityDef[];
  /** "As an additional cost, forage or pay [mana]" (Feed the Cycle). */
  forageOrPay?: string;
}

/** Turn log (`turnlog.ts`): number of matching events (or sum of the damage). */
function turnEvents(query: TurnLogQuery): Amount {
  return { kind: "turnEvents", query };
}

/** Descend (LCI): a permanent card (not a token) put into your graveyard this turn. */
const DESCENT: TurnLogQuery = {
  event: "zone",
  to: "graveyard",
  byOwner: true,
  who: "you",
  token: false,
  types: ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"],
};

/** At least N matching events this turn. */
function turnAtLeast(query: TurnLogQuery, n = 1): Condition {
  return { kind: "amountAtLeast", amount: turnEvents(query), n };
}

/** At least one of the designated players meets the condition (from their point of view). */
function someone(of: Ref, where: Condition): Condition {
  return { kind: "amountAtLeast", amount: { kind: "refCount", ref: { kind: "playersWhere", of, where } }, n: 1 };
}

/** Creatures that died this turn (battlefield → graveyard), under any controller. */
const DIED: TurnLogQuery = { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"] };

type Aggregate = Extract<Amount, { kind: "aggregate" }>;
/** Aggregate (`Amount` `aggregate`): sum, greatest value or distinct values of a property. */
function agg(fn: Aggregate["fn"], property: AggregateProperty, rest: Omit<Aggregate, "kind" | "fn" | "property"> = {}): Amount {
  return { kind: "aggregate", fn, property, ...rest };
}
/** What was spent to cast the source, or the designated object. */
const spent = (what: Extract<Amount, { kind: "spent" }>["what"], of?: Ref): Amount => ({
  kind: "spent",
  what,
  ...(of ? { of } : {}),
});
const EVENT_OBJECT: Ref = { kind: "eventObject" };

export const amount = {
  x: { kind: "x" } as Amount,
  kicked: (yes: number, no: number): Amount => ({ kind: "kicked", yes, no }),
  powerOf: (r: Ref): Amount => ({ kind: "powerOf", ref: r }),
  eventAmount: { kind: "eventAmount" } as Amount,
  count: (filter: ObjectFilter): Amount => ({ kind: "count", filter }),
  totalPower: (filter: ObjectFilter): Amount => agg("sum", "power", { filter }),
  totalToughness: (filter: ObjectFilter): Amount => agg("sum", "toughness", { filter }),
  /** Distinct kinds of counters among the matching permanents. */
  counterKindsAmong: (filter: ObjectFilter): Amount => agg("distinct", "counterKind", { filter }),
  /** Number of cards matching the filter in a zone ("creature cards in your graveyard"). */
  countIn: (zone: "graveyard" | "hand", filter: ObjectFilter = {}, whose: "you" | "opponents" | "all" = "you"): Amount => ({
    kind: "count",
    filter,
    zone,
    whose,
  }),
  lifeGainedThisTurn: turnEvents({ event: "lifeGain", who: "you", sum: true }),
  /** Counters of a kind on the object; `"any"`: all counters. */
  countersOn: (r: Ref, counter = "+1/+1"): Amount => ({ kind: "countersOn", ref: r, counter }),
  /** Distinct mana values among your nonland permanents. */
  differentManaValues: agg("distinct", "manaValue", { filter: { controller: "you", notTypes: ["Land"] } }),
  /** Vivid (ECL): number of colors among the permanents you control (or matching the filter). */
  colorsAmong: (filter: ObjectFilter = { permanent: true, controller: "you" }): Amount => agg("distinct", "color", { filter }),
  /** "The number of colors among permanents you control and spells you've cast this turn" (First Family). */
  colorsAmongWithSpellsCast: agg("distinct", "color", { filter: { permanent: true, controller: "you" }, withSpellsCast: true }),
  lifeTotal: { kind: "lifeTotal" } as Amount,
  startingLife: { kind: "lifeTotal", starting: true } as Amount,
  /** Counters on the source from its last known information ("when it dies" ability). */
  /** Counters of a kind on the source, or from its last known information ("if it had a counter…"). */
  lkiCounters: (counter: string): Amount => ({ kind: "countersOn", ref: { kind: "self" }, counter }),
  /** "The amount of damage dealt to it this turn" (Tangled Colony): the turn log, damage dealt to the source. */
  lkiDamage: { kind: "turnEvents", query: { event: "damage", self: "target", sum: true } } as Amount,
  /** Converge: colors of mana spent to cast this spell. */
  colorsSpent: spent("colors"),
  plus: (...of: Amount[]): Amount => ({ kind: "sum", of }),
  neg: (of: Amount): Amount => ({ kind: "neg", of }),
  /** Integer division: "for each N". */
  per: (of: Amount, by: number): Amount => ({ kind: "div", of, by }),
  pow: (base: number, of: Amount): Amount => ({ kind: "pow", base, of }),
  /** X of the spell of the event. */
  eventX: spent("x", EVENT_OBJECT),
  manaSpentOf: (r: Ref): Amount => spent("mana", r),
  eventColorsSpent: spent("colors", EVENT_OBJECT),
  manaValueOf: (r: Ref): Amount => ({ kind: "manaValueOf", ref: r }),
  /** "for each graveyard with N or more cards in it" */
  graveyardsWithAtLeast: (n: number): Amount => ({ kind: "graveyardsWithAtLeast", n }),
  toughnessOf: (r: Ref): Amount => ({ kind: "toughnessOf", ref: r }),
  colorsOf: (r: Ref): Amount => agg("distinct", "color", { of: r }),
  maxPower: (filter: ObjectFilter, zone?: "graveyard"): Amount => agg("max", "power", { filter, ...(zone ? { zone } : {}) }),
  distinctNames: (filter: ObjectFilter): Amount => agg("distinct", "name", { filter }),
  cardsIn: (zone: "hand" | "graveyard" | "library"): Amount => ({ kind: "cardsIn", zone }),
  lifeLostThisTurn: turnEvents({ event: "lifeLoss", who: "you", sum: true }),
  /** Domain: number of basic land types among your lands. */
  basicLandTypes: agg("distinct", "basicLandType", { filter: { types: ["Land"], controller: "you" } }),
  distinctSubtypes: (filter: ObjectFilter): Amount => agg("distinct", "subtype", { filter }),
  v: (name: string): Amount => ({ kind: "var", name }),
  /** Card types among the cards in all graveyards (Tarmogoyf). */
  cardTypesInGraveyards: agg("distinct", "cardType", { zone: "graveyard", whose: "all" }),
  /** "different names among unlocked doors of Rooms you control": a Room's name is that of its unlocked doors (709.5c). */
  unlockedDoorNames: agg("distinct", "name", { filter: { subtype: "Room", controller: "you" } }),
  /** X of the spell that put the source onto the battlefield. */
  sourceX: spent("x"),
  max: (...of: Amount[]): Amount => ({ kind: "max", of }),
  /** Unused mana in your mana pool (Omnath, Locus of the Void). */
  manaInPool: { kind: "manaInPool" } as Amount,
  /** Your poison counters. */
  poison: { kind: "poison" } as Amount,
  /** Your rad counters (Fallout). */
  rad: { kind: "poison", counter: "rad" } as Amount,
  /** The highest number chosen (`fx.chooseNumbers`). */
  numberChosen: (store: string): Amount => ({ kind: "numberChosen", store }),
  /** The greatest value of the amount, seen from each of the designated players ("… an opponent controls"). */
  maxOverPlayers: (players: Ref, of: Amount): Amount => ({ kind: "maxOverPlayers", players, amount: of }),
  /** The total of an amount among the designated players (seen from each). */
  sumOverPlayers: (players: Ref, of: Amount): Amount => ({ kind: "maxOverPlayers", players, amount: of, sum: true }),
  opponentsLostLife: turnEvents({ event: "lifeLoss", who: "opponent", distinct: "player" }),
  sacrificedThisTurn: turnEvents({ event: "sacrifice", who: "you" }),
  /** Unlocked doors among the Rooms you control. */
  unlockedDoors: { kind: "unlockedDoors" } as Amount,
  /** Card types among the cards in your graveyard (delirium). */
  cardTypesInGraveyard: agg("distinct", "cardType", { zone: "graveyard" }),
  /** Permanent types among the cards in your graveyard (Matzalantli). */
  permanentTypesInGraveyard: agg("distinct", "permanentType", { zone: "graveyard" }),
  milledThisTurn: (who: Ref): Amount => ({
    kind: "turnEvents",
    query: { event: "zone", from: "library", to: "graveyard", byOwner: true },
    of: who,
  }),
  cardsDiscardedThisTurn: turnEvents({ event: "discard", who: "you", sum: true }),
  maxToughness: (filter: ObjectFilter): Amount => agg("max", "toughness", { filter }),
  maxManaValueInGraveyard: agg("max", "manaValue", { zone: "graveyard" }),
  distinctColors: (filter: ObjectFilter): Amount => agg("distinct", "color", { filter }),
  countersAmong: (filter: ObjectFilter, counter: string): Amount => agg("sum", "counters", { filter, counter }),
  /** Mana symbols of this color in the cost of the designated object (Namor: the spell of the event). */
  manaSymbolsOf: (r: Ref, color: ManaType): Amount => ({ kind: "manaSymbols", color, of: r }),
  /** Greatest number of permanents of the filter that share a creature type (White Lotus Tile). */
  maxSharingCreatureType: (filter: ObjectFilter): Amount => agg("mostShared", "subtype", { filter }),
  /** Half the life total of the designated player, rounded up (Alpharael). */
  halfLife: (who: Ref): Amount => ({ kind: "div", of: { kind: "lifeTotal", who }, by: 2, up: true }),
  landsEnteredThisTurn: turnEvents({ event: "zone", to: "battlefield", types: ["Land"], who: "you" }),
  manaSpent: spent("mana"),
  /** Your speed. */
  speed: { kind: "speed" } as Amount,
  spellsCastThisTurn: turnEvents({ event: "cast", who: "you" }),
  cardsDrawnThisTurn: turnEvents({ event: "draw", who: "you" }),
  creaturesDiedThisTurn: turnEvents(DIED),
  /** Creatures you attacked with this turn. */
  attackersThisTurn: turnEvents({ event: "attack", who: "you" }),
  /** Opponents you attacked this turn (Fast Forward). */
  opponentsAttackedThisTurn: turnEvents({ event: "attack", who: "you", distinct: "defender" }),
  totalManaValue: (filter: ObjectFilter, zone?: "exile"): Amount =>
    agg("sum", "manaValue", { filter, ...(zone ? { zone } : {}) }),
  eventManaSpent: spent("mana", EVENT_OBJECT),
  cardTypesOf: (r: Ref): Amount => agg("distinct", "cardType", { of: r }),
  devotion: (color: Color): Amount => ({ kind: "manaSymbols", color }),
  noncreatureCastBy: (who: Ref): Amount => ({ kind: "turnEvents", query: { event: "cast", notTypes: ["Creature"] }, of: who }),
  refCount: (r: Ref): Amount => ({ kind: "refCount", ref: r }),
  distinctPowers: (filter: ObjectFilter): Amount => agg("distinct", "power", { filter }),
  cardTypesAmong: (filter: ObjectFilter): Amount => agg("distinct", "cardType", { filter }),
  maxManaValue: (filter: ObjectFilter): Amount => agg("max", "manaValue", { filter }),
  /** Cards you own in exile matching the filter. */
  countExiled: (filter: ObjectFilter = {}): Amount => ({ kind: "count", filter, zone: "exile", whose: "you" }),
  inExile: (r: Ref): Amount => ({ kind: "inExile", ref: r }),
  yourCreaturesDiedThisTurn: turnEvents({ event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"], who: "you" }),
  /** Vren: creatures exiled from the battlefield under your opponents' control this turn. */
  opponentCreaturesExiledThisTurn: turnEvents({
    event: "zone",
    from: "battlefield",
    to: "exile",
    types: ["Creature"],
    who: "opponent",
  }),
  opponentsWithHandAtMost: (n: number): Amount => ({
    kind: "refCount",
    ref: { kind: "playersWhere", of: { kind: "eachOpponent" }, where: { kind: "handAtMost", ref: { kind: "you" }, n } },
  }),
  /** "each opponent who has more cards in hand than you" (inside `playersWhere`, "you" is the opponent examined). */
  opponentsWithMoreInHand: {
    kind: "refCount",
    ref: {
      kind: "playersWhere",
      of: { kind: "eachOpponent" },
      where: {
        kind: "amountGreater",
        a: { kind: "cardsIn", zone: "hand" },
        b: {
          kind: "refCount",
          ref: { kind: "zone", zone: "hand", who: { kind: "controllerOf", ref: { kind: "self" } }, filter: {} },
        },
      },
    },
  } as Amount,
  greatestManaValueOf: (r: Ref): Amount => agg("max", "manaValue", { of: r }),
  totalPowerOf: (r: Ref): Amount => agg("sum", "power", { of: r }),
  colorPairsAmong: (filter: ObjectFilter): Amount => agg("distinct", "colorPair", { filter }),
  lkiPower: { kind: "lkiPower" } as Amount,
  instantSorceryCast: turnEvents({ event: "cast", who: "you", types: ["Instant", "Sorcery"] }),
  cardsLeftGraveyardThisTurn: turnEvents({ event: "zone", from: "graveyard", who: "you" }),
  /** Turn log (`turnlog.ts`): matching events, seen from the controller of the ability. */
  turnEvents,
  /** Number of times you descended this turn (permanent cards put into your graveyard). */
  descendedThisTurn: turnEvents(DESCENT),
  /** "for each mana from a Cave spent to cast it" */
  caveManaSpent: spent("cave"),
  /** Mana from artifact sources spent to cast this spell (Coin of Mastery). */
  artifactManaSpent: spent("artifact"),
  /** Total power of the cards exiled to craft the source. */
  linkedTotalPower: agg("sum", "power", { of: { kind: "linked" } }),
  /** Colors among the cards exiled to craft the source. */
  linkedColors: agg("distinct", "color", { of: { kind: "linked" } }),
  /**
   * Power of the source without a floor (107.1b), for the comparisons of the filters: on the battlefield, otherwise from
   * its last known information ("with power greater than this creature's").
   */
  sourcePower: { kind: "raw", what: "power" } as Amount,
  /** Power of the first designated object still on the battlefield, without a floor (Fell the Mighty: the targeted creature). */
  rawPowerOf: (r: Ref): Amount => ({ kind: "raw", what: "power", of: r }),
  /** Mana spent to cast the source, from its last known information if needed (Astelli Reclaimer). */
  sourceManaSpent: { kind: "raw", what: "manaSpent" } as Amount,
  /** Commander: number of colors in the color identity of your commanders (903.4; 0 without a commander). */
  commanderColors: agg("distinct", "colorIdentity", { of: { kind: "commanders", who: { kind: "you" } } }),
  /** "For each time you've cast your commander (a commander) from the command zone this game". */
  commanderCasts: { kind: "commanderCasts" } as Amount,
};

/**
 * Comparisons of the filters (`ObjectFilter.compare`, PLAN-H H10): `{ types: ["Creature"], compare: [cmp.manaValue("<=",
 * amount.x)] }` ("with mana value X or less"). The amount is evaluated by `resolveCompare` (`effects.ts`).
 */
export const cmp = {
  power: (op: FilterCompare["cmp"], to: NonNullable<FilterCompare["to"]>): FilterCompare => ({ what: "power", cmp: op, to }),
  toughness: (op: FilterCompare["cmp"], to: NonNullable<FilterCompare["to"]>): FilterCompare => ({
    what: "toughness",
    cmp: op,
    to,
  }),
  manaValue: (op: FilterCompare["cmp"], to: NonNullable<FilterCompare["to"]>): FilterCompare => ({
    what: "manaValue",
    cmp: op,
    to,
  }),
  /** Odd or even mana value (0 is even). */
  parity: (p: "odd" | "even"): FilterCompare => ({ what: "manaValue", cmp: p }),
};

/**
 * Effect builders: one family per `ops/` domain (dsl/fx-*.ts), assembled into one object.
 */
export const fx = {
  ...damageFx,
  ...playersFx,
  ...countersFx,
  ...zonesFx,
  ...spellsFx,
  ...permanentsFx,
  ...manaFx,
  ...flowFx,
  ...payFx,
};

export function spell(targets: TargetSpec[], effects: Effects): SpellDef {
  return { modes: [{ targets, effects: effects.flat() }] };
}

export function modal(...modes: ModeDef[]): SpellDef {
  return { modes };
}

/**
 * "Choose one. If [the additional cost] was paid, choose both instead" (teamwork, blight): each mode alone requires that
 * it was not, the "both" mode (targets and effects of both, in order) that it was. Target ids must differ from one mode
 * to the other.
 */
export function bothIfKicked(a: ModeDef, b: ModeDef, bothLabel: string): SpellDef {
  const kicked: Condition = { kind: "kicked" };
  const unkicked: Condition = { kind: "not", cond: kicked };
  return {
    modes: [
      { ...a, condition: unkicked },
      { ...b, condition: unkicked },
      { label: bothLabel, targets: [...a.targets, ...b.targets], effects: [...a.effects, ...b.effects], condition: kicked },
    ],
  };
}

/** Label of a combination of modes: "A + B + C", each label translated on its own. */
function joinLabels(labels: readonly string[]): string {
  return labels.reduce((a, b) => msg("{a} + {b}", { a, b }));
}

/**
 * "Choose one or more —" (700.2): all the combinations of modes, in printed order, for a spell
 * (`modal(...oneOrMore(…))`) or a triggered ability (`triggeredModal`). Target ids must differ from one mode to the
 * other.
 */
export function oneOrMore(...modes: { label: string; targets?: TargetSpec[]; effects: Effects }[]): ModeDef[] {
  const out: ModeDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const chosen = modes.filter((_, i) => mask & (1 << i));
    out.push({
      label: joinLabels(chosen.map((m) => m.label)),
      targets: chosen.flatMap((m) => m.targets ?? []),
      effects: chosen.flatMap((m) => m.effects.flat()),
    });
  }
  return out;
}

/**
 * Spree (702.172): "choose one or more modes, + [cost] each". All the combinations are generated (target ids must differ
 * from one mode to the other).
 */
export function spree(...modes: { cost: string; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  const out: ModeDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const chosen = modes.filter((_, i) => mask & (1 << i));
    const costs = chosen.map((m) => parseManaCost(m.cost));
    const extra: ManaCost = { generic: 0, colored: {}, x: 0 };
    for (const c of costs) {
      extra.generic += c.generic;
      for (const [k, n] of Object.entries(c.colored))
        extra.colored[k as ManaType] = (extra.colored[k as ManaType] ?? 0) + (n ?? 0);
    }
    out.push({
      label: joinLabels(chosen.map((m) => m.label)),
      targets: chosen.flatMap((m) => m.targets ?? []),
      effects: chosen.flatMap((m) => m.effects.flat()),
      extraCost: extra,
    });
  }
  return { modes: out };
}

/**
 * Escalate (702.120): "choose one or more modes; pay [cost] for each mode beyond the first". All the combinations are
 * generated (target ids differ from one mode to the other).
 */
/**
 * The escalate cost may also be paid otherwise than with mana: `{ tap: filter }`, "tap an untapped [creature] you
 * control" (Collective Effort), as many times as there are modes beyond the first (`ModeDef.additionalCost`).
 */
export function escalate(
  cost: string | { tap: ObjectFilter },
  ...modes: { label: string; targets?: TargetSpec[]; effects: Effects }[]
): SpellDef {
  const each = typeof cost === "string" ? parseManaCost(cost) : undefined;
  const out: ModeDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const chosen = modes.filter((_, i) => mask & (1 << i));
    const n = chosen.length - 1;
    const colored: ManaCost["colored"] = {};
    for (const [k, v] of Object.entries(each?.colored ?? {})) colored[k as ManaType] = (v ?? 0) * n;
    out.push({
      label: joinLabels(chosen.map((m) => m.label)),
      targets: chosen.flatMap((m) => m.targets ?? []),
      effects: chosen.flatMap((m) => m.effects.flat()),
      ...(n > 0 && each ? { extraCost: { generic: each.generic * n, colored, x: 0 } } : {}),
      ...(n > 0 && typeof cost !== "string" ? { additionalCost: { tap: { filter: cost.tap, count: n } } } : {}),
    });
  }
  return { modes: out };
}

/**
 * Overload (702.96) and cleave (702.148): a second mode, cast for its own cost, where the text changes ("each" instead
 * of "target", without the words in square brackets).
 */
export function altCostMode(
  keyword: "Overload" | "Cleave",
  cost: string,
  normal: { targets: TargetSpec[]; effects: Effects },
  other: { targets?: TargetSpec[]; effects: Effects },
): SpellDef {
  return {
    modes: [
      { label: msg("Normal cost"), targets: normal.targets, effects: normal.effects.flat() },
      {
        label: keyword === "Overload" ? msg("Overload — {cost}", { cost }) : msg("Cleave — {cost}", { cost }),
        targets: other.targets ?? [],
        effects: other.effects.flat(),
        cost: parseManaCost(cost),
      },
    ],
  };
}

/** Tiered (Final Fantasy): "choose an additional cost" — a single mode, each with its cost. */
export function tiered(...modes: { cost: string; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  return {
    modes: modes.map((m) => ({
      label: m.label,
      targets: m.targets ?? [],
      effects: m.effects.flat(),
      extraCost: parseManaCost(m.cost),
    })),
  };
}

/** Replaces the target ids (`ref.target`, `cond.targetMatches`, `otherThan`…) in a data structure. */
function renameTargets<T>(value: T, map: Record<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === "string" && map[x] && ((k === "id" && ("filter" in o || o.kind === "target")) || k === "spec")) {
        out[k] = map[x];
      } else if (k === "otherThan" && Array.isArray(x)) {
        out[k] = x.map((id) => (typeof id === "string" && map[id]) || id);
      } else out[k] = walk(x);
    }
    return out;
  };
  return walk(value) as T;
}

/**
 * "Paw" modes (Bloomburrow Seasons, 700.2h): "choose up to five {P} worth of modes; you may choose the same mode more
 * than once". All the combinations are generated; the targets of each copy of a mode are renamed.
 */
export function pawprint(...modes: { pips: number; label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  const out: ModeDef[] = [];
  const counts: number[] = modes.map(() => 0);
  const visit = (i: number, left: number) => {
    if (i === modes.length) {
      if (counts.every((n) => n === 0)) return;
      const labels: string[] = [];
      const targets: TargetSpec[] = [];
      const effects: Effect[] = [];
      modes.forEach((m, k) => {
        for (let n = 0; n < (counts[k] ?? 0); n++) {
          const map = Object.fromEntries((m.targets ?? []).map((t) => [t.id, `${t.id}${k}_${n}`]));
          labels.push(m.label);
          targets.push(...renameTargets(m.targets ?? [], map));
          effects.push(...renameTargets(m.effects.flat(), map));
        }
      });
      out.push({ label: joinLabels(labels), targets, effects });
      return;
    }
    const pips = modes[i]?.pips ?? 1;
    for (let n = 0; n * pips <= left; n++) {
      counts[i] = n;
      visit(i + 1, left - n * pips);
    }
    counts[i] = 0;
  };
  visit(0, 5);
  return { modes: out };
}

export function mode(label: string, targets: TargetSpec[], effects: Effects): ModeDef {
  return { label, targets, effects: effects.flat() };
}

export function manaAbility(
  produce: ManaType | ManaType[],
  amountProduced = 1,
  opts: {
    sacrifice?: boolean;
    per?: ObjectFilter;
    restriction?: ManaAbilityDef["restriction"];
    produceChosen?: boolean;
    rider?: ManaAbilityDef["rider"];
    distinctPowers?: boolean;
    /** "Tap an untapped permanent (a creature: `"creature"`; a filter: Relic of Legends) you control". */
    tapAnother?: boolean | "creature" | "artifact" | ObjectFilter;
    condition?: Condition;
    /** As much mana as the power of the source. */
    selfPower?: boolean;
    /** Without {T} (Vivi Ornitier: "{0}: …"). */
    noTap?: boolean;
    oncePerTurn?: boolean;
    /** "Pay N life" on top of {T} (Haunted Screen). */
    payLife?: number;
    /** Collect evidence N as a cost (Cryptex). */
    collectEvidence?: number;
    /** Counter put on the source at each activation (Twitching Doll). */
    addCounter?: string;
    /** Counter removed from the source at each activation (Temple of Cyclical Time). */
    removeCounter?: string;
    /** Colors of the cards linked to the source (Pit of Offerings). */
    linkedColors?: boolean;
    /** As much mana as cards in your graveyard matching the filter (The Core). */
    perGraveyard?: ObjectFilter;
    /** "… in any combination of colors": each mana has its own type. */
    combination?: boolean;
    /** Drawback: damage to you, life for each opponent (Ancient Tomb, Grove of the Burnwillows). */
    drawback?: ManaAbilityDef["drawback"];
    /** Colors of the permanents you control matching the filter (Meteor Crater). */
    colorsOf?: ObjectFilter;
    /** With `colorsOf`: the cards in your graveyard rather than your permanents (The Grey Havens). */
    colorsZone?: "graveyard";
    /**
     * What matching lands could produce, among `produce`: yours (Reflecting Pool: {}; Star Compass: basic), or an
     * opponent's (`{ controller: "opponent" }`: Exotic Orchard).
     */
    likeLands?: ObjectFilter;
    /** Commander: a color of your commander's color identity (Command Tower, Arcane Signet). */
    commanderIdentity?: boolean;
    /** Player effect until end of turn set as it resolves (Yuna: "when you next cast a creature spell this turn"). */
    playerEffect?: ManaAbilityDef["playerEffect"];
  } = {},
): ManaAbilityDef {
  return {
    kind: "mana",
    cost: {
      tap: !opts.noTap,
      self: opts.sacrifice ? "sacrifice" : undefined,
      payLife: opts.payLife,
      collectEvidence: opts.collectEvidence,
    },
    addCounter: opts.addCounter,
    removeCounter: opts.removeCounter,
    ...(opts.drawback ? { drawback: opts.drawback } : {}),
    ...(opts.playerEffect ? { playerEffect: opts.playerEffect } : {}),
    ...(opts.linkedColors ? { produceColorsOf: { kind: "linked" } as Ref } : {}),
    ...(opts.colorsOf
      ? {
          produceColorsOf: {
            kind: "zone",
            zone: opts.colorsZone ?? "battlefield",
            who: { kind: "you" },
            filter: opts.colorsOf,
          } as Ref,
        }
      : {}),
    ...(opts.likeLands ? { produceLikeLands: opts.likeLands } : {}),
    ...(opts.commanderIdentity ? { produceIdentity: true } : {}),
    oncePerTurn: opts.oncePerTurn,
    produce: Array.isArray(produce) ? produce : [produce],
    ...(opts.combination ? { combination: true } : {}),
    amount: amountProduced,
    ...(manaAmountOf(opts) ? { amountOf: manaAmountOf(opts) } : {}),
    restriction: opts.restriction,
    produceChosen: opts.produceChosen,
    rider: opts.rider,
    tapAnother: opts.tapAnother,
    condition: opts.condition,
  };
}

/** Variable amount of a mana ability (`ManaAbilityDef.amountOf`) from the options of `manaAbility`. */
function manaAmountOf(opts: {
  per?: ObjectFilter;
  perGraveyard?: ObjectFilter;
  distinctPowers?: boolean;
  selfPower?: boolean;
}): Amount | undefined {
  if (opts.per) return { kind: "count", filter: opts.per };
  if (opts.perGraveyard) return { kind: "count", zone: "graveyard", filter: opts.perGraveyard };
  if (opts.distinctPowers)
    return { kind: "aggregate", fn: "distinct", property: "power", filter: { types: ["Creature"], controller: "you" } };
  if (opts.selfPower) return { kind: "powerOf", ref: { kind: "self" } };
  return undefined;
}

/** "[Filter] spells you cast cost {N} less." */
export function costReducer(
  filter: ObjectFilter,
  generic: number,
  label?: string,
  opts: { condition?: Condition; genericAmount?: Amount; opponents?: boolean; colored?: ManaType } = {},
): CostReductionAbilityDef {
  return { kind: "costReduction", filter, generic, label, ...opts };
}

export function activated(opts: {
  mana?: string;
  tap?: boolean;
  /** Sacrifice the source. */
  sacrifice?: boolean;
  /** Sacrifice other permanents ("Sacrifice another creature"). */
  sacrificeOther?: { filter: ObjectFilter; count?: number; includeSelf?: boolean; differentNames?: boolean };
  removeCounters?: { kind: string; n: number };
  tapOthers?: { filter: ObjectFilter; count: number; includeSelf?: boolean };
  /** Granted ability: tap, exile or sacrifice the permanent that grants it ("Tap Fishing Pole"). */
  grantor?: "tap" | "exile" | "sacrifice";
  /** Exert the source ("Exert"). */
  exert?: boolean;
  payLife?: Amount;
  /** "Pay X life" (X of the ability). */
  payLifeX?: boolean;
  targets?: TargetSpec[];
  effects: Effects;
  sorcerySpeed?: boolean;
  once?: boolean;
  oncePerTurn?: boolean;
  activationCondition?: Condition;
  fromGraveyard?: boolean;
  /** Activated from the hand (cycling, "discard this card: …"). */
  fromHand?: boolean;
  /** Also from the command zone (commander ninjutsu). */
  fromCommand?: boolean;
  /** Who else may activate it (602.2): its controller's opponents only, or any player (Oft-Nabbed Goat, Xantcha). */
  activators?: "opponents" | "any";
  exileSelf?: boolean;
  discardSelf?: boolean;
  bounceSelf?: boolean;
  addCounters?: { kind: string; n: number };
  exileFromGraveyard?: { filter: ObjectFilter; count?: number };
  /** "This ability costs {N} less [if …]". */
  reduction?: { generic: Amount; condition?: Condition };
  /** "Remove a [+1/+1] counter from a creature you control". */
  removeCounterFrom?: { filter: ObjectFilter; kind: string; n?: number };
  /** Blight N as a cost (ECL). */
  blight?: number;
  /** Collect evidence N as a cost (MKM); `linkEvidence`: the cards are linked to the source. */
  collectEvidence?: number;
  linkEvidence?: boolean;
  /** Waterbend (Avatar): the mana cost is a "waterbend" cost (untapped artifacts and creatures: {1} each). */
  waterbend?: boolean;
  /** Convoke for the ability (Heirloom Epic: "you may tap an untapped creature you control rather than pay that mana"). */
  convoke?: boolean;
  /** "X can't be 0": smallest allowed value of X. */
  /** "Remove any number of [kind] counters from this creature" (X = the number removed). */
  removeCountersX?: string;
  /** Exile cards of this color from the graveyard totaling N symbols (Baron Helmut Zemo's boast). */
  exileGraveyardSymbols?: { color: ManaType; n: number };
  minX?: number;
  /** "Tap X untapped [artifacts] you control". */
  tapX?: ObjectFilter;
  /** "Exile X [artifact] cards from your graveyard". */
  exileFromGraveyardX?: ObjectFilter;
  /** "Sacrifice one or more [artifacts]" (X ≥ 1). */
  sacrificeX?: ObjectFilter;
  /** "Discard X cards". */
  discardX?: boolean;
  /** "Discard N cards" (`discardFilter`: only matching cards). */
  discard?: number;
  /** "Discard your hand". */
  discardHand?: boolean;
  discardFilter?: ObjectFilter;
  /** Ninjutsu: "return an unblocked attacker you control to hand". */
  returnUnblockedAttacker?: boolean;
  /** "Return [a permanent] you control to its owner's hand" (Urban Retreat). */
  bounce?: ObjectFilter;
  /** "Exile [a permanent] you control" (The Soul Stone). */
  exile?: ObjectFilter;
  /** "Forage" (701.61). */
  forage?: boolean;
  /** Craft (702.167): see `craft()`. */
  craft?: NonNullable<ActivatedAbilityDef["cost"]["craft"]>;
  /** Power-up: only once, cost reduced by the mana cost of the source if it entered this turn. */
  powerUp?: boolean;
  label?: string;
}): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: {
      mana: opts.mana ? parseManaCost(opts.mana) : undefined,
      tap: opts.tap,
      self: opts.sacrifice
        ? "sacrifice"
        : opts.exileSelf
          ? "exile"
          : opts.discardSelf
            ? "discard"
            : opts.bounceSelf
              ? "bounce"
              : opts.exert
                ? "exert"
                : undefined,
      // "X" costs (X chosen on activation): `xCosts` (stack.ts).
      sacrifice: opts.sacrificeX
        ? { filter: opts.sacrificeX, count: "X" }
        : opts.sacrificeOther
          ? {
              filter: opts.sacrificeOther.filter,
              count: opts.sacrificeOther.count ?? 1,
              ...(opts.sacrificeOther.includeSelf ? { includeSelf: true } : {}),
              ...(opts.sacrificeOther.differentNames ? { distinct: "name" as const } : {}),
            }
          : undefined,
      removeCounters: opts.removeCountersX ? { kind: opts.removeCountersX, n: "X" } : opts.removeCounters,
      tapOthers: opts.tapX ? { filter: opts.tapX, count: "X" } : opts.tapOthers,
      ...(opts.grantor ? { grantor: opts.grantor } : {}),
      payLife: opts.payLifeX ? { kind: "x" } : opts.payLife,
      addCounters: opts.addCounters,
      exileFromGraveyard: opts.exileFromGraveyardX
        ? { filter: opts.exileFromGraveyardX, count: "X" }
        : opts.exileFromGraveyard
          ? { filter: opts.exileFromGraveyard.filter, count: opts.exileFromGraveyard.count ?? 1 }
          : undefined,
      removeCounterFrom: opts.removeCounterFrom,
      blight: opts.blight,
      collectEvidence: opts.collectEvidence,
      linkEvidence: opts.linkEvidence,
      tapToPay: opts.waterbend ? "waterbend" : opts.convoke ? "convoke" : undefined,
      minX: opts.minX,
      exileGraveyardSymbols: opts.exileGraveyardSymbols,
      discard: opts.discardX ? "X" : opts.discard,
      ...(opts.discardHand ? { discardHand: true } : {}),
      discardFilter: opts.discardFilter,
      returnUnblockedAttacker: opts.returnUnblockedAttacker,
      bounce: opts.bounce,
      exile: opts.exile,
      forage: opts.forage,
      craft: opts.craft,
    },
    reduction: opts.reduction,
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: opts.sorcerySpeed,
    once: opts.once || opts.powerUp,
    powerUp: opts.powerUp,
    oncePerTurn: opts.oncePerTurn,
    activationCondition: opts.activationCondition,
    fromGraveyard: opts.fromGraveyard,
    fromHand: opts.fromHand,
    ...(opts.fromCommand ? { fromCommand: true } : {}),
    ...(opts.activators ? { activators: opts.activators } : {}),
    label: opts.label,
  };
}

/**
 * Craft (702.167): "Craft with [materials] [cost]" — "[cost], exile this permanent, exile [materials] from among other
 * permanents you control and/or cards in your graveyard: return this card transformed under its owner's control.
 * Activate only as a sorcery." The materials are linked to the back face (`ref.linked`).
 */
export function craft(
  mana: string,
  materials: NonNullable<ActivatedAbilityDef["cost"]["craft"]>,
  label = msg("Craft"),
): ActivatedAbilityDef {
  return {
    ...activated({ mana, exileSelf: true, craft: materials, sorcerySpeed: true, effects: [{ op: "craftReturn" }] }),
    label: msg("{label} {mana}", { label, mana }),
  };
}

/** Loyalty ability (606): "+1: …", "−3: …"; as a sorcery, one per turn and per planeswalker. */
/** Exhaust (702.177): "Exhaust — [cost]: [effect]" (a single activation). */
export function exhaust(opts: Parameters<typeof activated>[0]): ActivatedAbilityDef {
  return {
    ...activated({ ...opts, once: true }),
    exhaust: true,
    label: opts.label ? msg("Exhaust — {label}", { label: opts.label }) : msg("Exhaust —"),
  };
}

export function loyalty(n: number, opts: { targets?: TargetSpec[]; effects: Effects; label: string }): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { loyalty: n },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: true,
    label: msg("{cost}: {label}", { cost: n > 0 ? `+${n}` : n === 0 ? "0" : `−${-n}`, label: opts.label }),
  };
}

/** "−X" loyalty ability: X is chosen on activation (read with `amount.x`). */
export function loyaltyX(opts: { targets?: TargetSpec[]; effects: Effects; label: string }): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { loyalty: "X" },
    targets: opts.targets ?? [],
    effects: opts.effects.flat(),
    sorcerySpeed: true,
    label: msg("−X: {label}", { label: opts.label }),
  };
}

/** Common conditions (raid, morbid…). */
export const cond = {
  raid: turnAtLeast({ event: "attack", who: "you" }),
  attackedWith: (subtype: string): Condition => turnAtLeast({ event: "attack", who: "you", subtype }),
  morbid: turnAtLeast(DIED),
  kicked: { kind: "kicked" } as Condition,
  controls: (filter: ObjectFilter, atLeast = 1): Condition => ({ kind: "controls", filter, atLeast }),
  /** Ferocious: you control a creature with power 4 or greater. */
  ferocious: { kind: "controls", filter: { types: ["Creature"], minPower: 4 } } as Condition,
  /** Threshold: at least 7 cards in your graveyard. */
  threshold: { kind: "amountAtLeast", amount: { kind: "cardsIn", zone: "graveyard" }, n: 7 } as Condition,
  yourTurn: { kind: "yourTurn" } as Condition,
  opponentsTurn: { kind: "opponentsTurn" } as Condition,
  /** "During extra turns" (500.7). */
  extraTurn: { kind: "extraTurn" } as Condition,
  opponentLostLife: turnAtLeast({ event: "lifeLoss", who: "opponent" }),
  /**
   * Your life total exceeds your starting life total by at least `by` (life − starting life ≥ `by`). Life is counted from
   * 0: below 0 life, the condition stays false as soon as `by` ≥ 1.
   */
  lifeAboveStart: (by: number): Condition => ({
    kind: "amountAtLeast",
    amount: { kind: "sum", of: [{ kind: "lifeTotal" }, { kind: "neg", of: { kind: "lifeTotal", starting: true } }] },
    n: by,
  }),
  counterAtLeast: (counter: string, n: number): Condition => ({ kind: "counterAtLeast", counter, n }),
  lifeAtLeast: (n: number): Condition => ({ kind: "amountAtLeast", amount: { kind: "lifeTotal" }, n }),
  v: (name: string, atLeast = 1): Condition => ({ kind: "var", name, atLeast }),
  not: (c: Condition): Condition => ({ kind: "not", cond: c }),
  all: (...of: Condition[]): Condition => ({ kind: "all", of }),
  /** "has exactly N life": at least N and not N + 1 (N ≥ 1). */
  refLife: (r: Ref, equals: number): Condition => ({
    kind: "all",
    of: [
      { kind: "amountAtLeast", amount: { kind: "lifeTotal", who: r }, n: equals },
      { kind: "not", cond: { kind: "amountAtLeast", amount: { kind: "lifeTotal", who: r }, n: equals + 1 } },
    ],
  }),
  battlefieldCount: (filter: ObjectFilter, atLeast: number): Condition => ({ kind: "battlefieldCount", filter, atLeast }),
  sourceMatches: (filter: ObjectFilter): Condition => ({ kind: "sourceMatches", filter }),
  targetMatches: (spec: string, filter: ObjectFilter): Condition => ({ kind: "targetMatches", spec, filter }),
  refMatches: (r: Ref, filter: ObjectFilter): Condition => ({ kind: "refMatches", ref: r, filter }),
  eventObjectMatches: (filter: ObjectFilter): Condition => ({ kind: "eventObjectMatches", filter }),
  lifeGainedAtLeast: (n: number): Condition => turnAtLeast({ event: "lifeGain", who: "you", sum: true }, n),
  amountAtLeast: (a: Amount, n: number): Condition => ({ kind: "amountAtLeast", amount: a, n }),
  /** "a > b", evaluated at resolution (Evil's Thrall: a Villain with greater mana value). */
  amountGreater: (a: Amount, b: Amount): Condition => ({ kind: "amountGreater", a, b }),
  xAtLeast: (n: number): Condition => ({ kind: "xAtLeast", n }),
  /** "as long as you have N or more unspent mana" (the mana pool changes: `bump` at each change). */
  manaPoolAtLeast: (n: number): Condition => ({ kind: "amountAtLeast", amount: { kind: "manaInPool" }, n }),
  castFromHand: { kind: "cast", from: "hand" } as Condition,
  /** The source was cast (the spell, or the permanent that entered from a cast spell). */
  wasCast: { kind: "cast" } as Condition,
  /** "if you scried or surveilled this turn" */
  scried: turnAtLeast({ event: "scry", who: "you" }),
  firstEndStep: { kind: "step", step: "end", first: true } as Condition,
  firstCombat: { kind: "firstCombat" } as Condition,
  /** An opponent was dealt combat damage by a legendary creature this turn. */
  opponentDamagedByLegendary: turnAtLeast({
    event: "damage",
    who: "opponent",
    toPlayer: true,
    combat: true,
    source: { types: ["Creature"], supertype: "Legendary" },
  }),
  /** A player was dealt N or more combat damage this turn. */
  playerCombatDamageAtLeast: (n: number): Condition =>
    turnAtLeast({ event: "damage", toPlayer: true, combat: true, sum: true, perPlayer: true }, n),
  noLegendaryCreatureCastThisTurn: {
    kind: "not",
    cond: turnAtLeast({ event: "cast", who: "you", types: ["Creature"], supertype: "Legendary" }),
  } as Condition,
  controlsGreatestPower: { kind: "controlsGreatestPower" } as Condition,
  creaturesDied: (n: number, underOpponent?: boolean): Condition =>
    turnAtLeast(underOpponent ? { ...DIED, who: "opponent" } : DIED, n),
  opponentDealtNoncombatDamage: turnAtLeast({ event: "damage", combat: false, toPlayer: true, who: "opponent" }),
  drewAtLeast: (n: number): Condition => turnAtLeast({ event: "draw", who: "you" }, n),
  /** At least (or exactly) N [noncreature] spells cast this turn. */
  castThisTurn: (n: number, noncreature = false, exactly = false): Condition => {
    const q: TurnLogQuery = { event: "cast", who: "you", ...(noncreature ? { notTypes: ["Creature"] } : {}) };
    return exactly ? { kind: "all", of: [turnAtLeast(q, n), { kind: "not", cond: turnAtLeast(q, n + 1) }] } : turnAtLeast(q, n);
  },
  /** "if you behold a Jace": you control a Jace or you have a Jace card in hand. */
  /** Behold (701.63): "you may behold an Elf" (choose an Elf you control or reveal an Elf card from your hand). */
  behold: (filter: ObjectFilter): Condition => ({ kind: "behold", filter }),
  beholdJace: { kind: "behold", filter: { subtype: "Jace" } } as Condition,
  /** The spell was cast while beholding (`behold` additional cost). */
  beheld: { kind: "beheld" } as Condition,
  /** The `whenCast` condition of the card was met when it was cast. */
  metWhenCast: { kind: "metWhenCast" } as Condition,
  /** "If {U}{U} was spent to cast it": `cond.spent("U", 2)`. */
  spent: (color: ManaType, n: number): Condition => ({ kind: "spentColor", color, n }),
  evoked: { kind: "cast", via: "evoke" } as Condition,
  /** "… with the greatest power among creatures that player controls" (the object of the event, gone). */
  eventObjectGreatestPower: { kind: "eventObjectGreatestPower" } as Condition,
  /** Its power is greater than that of each other creature, of all players (Selvala). */
  eventObjectStrictlyGreatestPower: { kind: "eventObjectGreatestPower", strictAmongAll: true } as Condition,
  /** "If it was cast using web-slinging", "if the chaos cost was paid". */
  castVia: (via: CastVia): Condition => ({ kind: "cast", via }),
  /** ∞ ability: the source was harnessed. */
  harnessed: { kind: "harnessed" } as Condition,
  /** Storied: "as long as you have an enduring story". */
  enduringStory: { kind: "designation", which: "enduringStory" } as Condition,
  /** Ascend (702.131): "if you have the city's blessing". */
  citysBlessing: { kind: "designation", which: "citysBlessing" } as Condition,
  /** You are the monarch. */
  monarch: { kind: "monarch" } as Condition,
  /** "If this spell's sneak cost was paid". */
  sneaked: { kind: "cast", via: "sneak" } as Condition,
  sneakWindow: { kind: "sneakWindow" } as Condition,
  activatedLoyalty: turnAtLeast({ event: "activate", who: "you", loyalty: true }),
  /** The source is prepared. */
  prepared: { kind: "prepared" } as Condition,
  /** Void (Edge of Eternities): a nonland permanent left the battlefield or a spell was warped this turn. */
  void: {
    kind: "any",
    of: [turnAtLeast({ event: "zone", from: "battlefield", notTypes: ["Land"] }), turnAtLeast({ event: "cast", warped: true })],
  } as Condition,
  /** Mount: saddled this turn. */
  saddled: { kind: "saddled" } as Condition,
  /** A single creature attacks, and it attacks a player. */
  attackingAlone: { kind: "attackingAlone" } as Condition,
  /** A player (still in the game) controls no creatures (Sothera, the Supervoid). */
  playerWithoutCreatures: someone(
    { kind: "eachPlayer" },
    { kind: "not", cond: { kind: "controls", filter: { types: ["Creature"] } } },
  ),
  /** A player has at most half their starting life total (Game Over). */
  someoneAtHalfStartingLife: someone(
    { kind: "eachPlayer" },
    {
      kind: "amountAtLeast",
      amount: {
        kind: "sum",
        of: [
          { kind: "lifeTotal", starting: true },
          { kind: "neg", of: { kind: "lifeTotal" } },
          { kind: "neg", of: { kind: "lifeTotal" } },
        ],
      },
      n: 0,
    },
  ),
  /** An opponent has N or less life (Bloodghast). */
  opponentLifeAtMost: (n: number): Condition =>
    someone({ kind: "eachOpponent" }, { kind: "not", cond: { kind: "amountAtLeast", amount: { kind: "lifeTotal" }, n: n + 1 } }),
  /** "Max speed": you have the maximum speed (4). */
  maxSpeed: { kind: "maxSpeed" } as Condition,
  /** "N or more cards in exile" (all owners, face-down cards included). */
  exileAtLeast: (n: number): Condition => ({
    kind: "amountAtLeast",
    amount: { kind: "count", zone: "exile", whose: "all", filter: {} },
    n,
  }),
  /** "if [the amount] is odd": a - 2 × floor(a / 2) ≥ 1. */
  odd: (a: Amount): Condition => ({
    kind: "amountAtLeast",
    amount: {
      kind: "sum",
      of: [a, { kind: "neg", of: { kind: "div", of: a, by: 2 } }, { kind: "neg", of: { kind: "div", of: a, by: 2 } }],
    },
    n: 1,
  }),
  /** "if you committed a crime this turn" */
  crime: turnAtLeast({ event: "crime", who: "you" }),
  /** "if you cast a spell from your hand this turn" */
  handSpellThisTurn: turnAtLeast({ event: "cast", who: "you", fromZone: "hand" }),
  turnsTakenAtLeast: (n: number): Condition => ({ kind: "turnsTakenAtLeast", n }),
  opponentDealtNoncombatDamageLastTurn: { kind: "opponentDealtNoncombatDamageLastTurn" } as Condition,
  spellCastFromHand: { kind: "cast", from: "hand" } as Condition,
  /** This spell was cast from a graveyard. */
  spellCastFromGraveyard: { kind: "cast", from: "graveyard" } as Condition,
  sourceDealtCombatDamage: { kind: "sourceDealtDamage", combat: true } as Condition,
  /** The source has already dealt damage, combat or not. */
  sourceDealtDamage: { kind: "sourceDealtDamage" } as Condition,
  prime: (a: Amount): Condition => ({ kind: "prime", amount: a }),
  step: (step: Step): Condition => ({ kind: "step", step }),
  /** A creature matching the filter (subtype) died this turn (Undead Sprinter: non-Zombie). */
  creatureDiedMatching: (filter: ObjectFilter): Condition =>
    turnAtLeast({ ...DIED, subtype: filter.subtype, notSubtype: filter.notSubtype }),
  castFromGraveyard: { kind: "cast", from: "graveyard" } as Condition,
  /** A permanent entered face down under your control, or you turned one face up, this turn. */
  faceDownOrUp: {
    kind: "any",
    of: [
      turnAtLeast({ event: "zone", to: "battlefield", faceDown: true, who: "you" }),
      turnAtLeast({ event: "turnFaceUp", who: "you" }),
    ],
  } as Condition,
  sacrificedThisTurn: turnAtLeast({ event: "sacrifice", who: "you" }),
  /** "If the gift was promised" (702.174: like a kicker). */
  gift: { kind: "kicked" } as Condition,
  any: (...of: Condition[]): Condition => ({ kind: "any", of }),
  opponentHasMore: (what: "lands" | "life" | "creatures" | "hand"): Condition => ({ kind: "opponentHasMore", what }),
  /** "if you lost life this turn" */
  lostLife: turnAtLeast({ event: "lifeLoss", who: "you" }),
  /** The designated player lost life this turn (evaluated during resolution). */
  refLostLife: (r: Ref): Condition => ({
    kind: "amountAtLeast",
    amount: { kind: "turnEvents", query: { event: "lifeLoss" }, of: r },
    n: 1,
  }),
  handAtMost: (r: Ref, n: number): Condition => ({ kind: "handAtMost", ref: r, n }),
  /** A target was chosen for this "target" word ("up to one …"). */
  targetChosen: (spec: string): Condition => ({
    kind: "amountAtLeast",
    amount: { kind: "refCount", ref: { kind: "target", id: spec } },
    n: 1,
  }),
  sacrificedFood: turnAtLeast({ event: "sacrifice", who: "you", subtype: "Food" }),
  /** You can forage (three cards in your graveyard or a Food). */
  canForage: {
    kind: "any",
    of: [
      { kind: "amountAtLeast", amount: { kind: "cardsIn", zone: "graveyard" }, n: 3 },
      { kind: "controls", filter: { subtype: "Food" }, atLeast: 1 },
    ],
  } as Condition,
  /** Delirium: at least four card types among the cards in your graveyard. */
  delirium: { kind: "amountAtLeast", amount: amount.cardTypesInGraveyard, n: 4 } as Condition,
  /** Sieges: the source chose this mode as it entered ("• Abzan — …"). */
  chosenMode: (mode: string): Condition => ({ kind: "chosenMode", mode }),
  /** "if you descended this turn" (a permanent card was put into your graveyard). */
  descended: turnAtLeast(DESCENT),
};

/** Crew N (702.122): "tap any number of creatures with total power N or more: this Vehicle becomes an artifact creature". */
export function crewAbility(n: number, oncePerTurn = false): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { crew: n },
    targets: [],
    effects: [{ op: "modify", what: { kind: "self" }, mods: { addTypes: ["Artifact", "Creature"] }, duration: "endOfTurn" }],
    oncePerTurn: oncePerTurn || undefined,
    label: msg("Crew {n}", { n }),
  };
}

/**
 * Equip (702.6) written in a script (token, cost other than mana, restricted creature): "[cost]: attach this Equipment
 * to target creature you control. Activate only as a sorcery." The `equip` flag makes it an equip ability for the
 * engine (Kíli, Freya's mana, turn log); `filter` restricts the creature ("Equip Pirate"). "Equip {N}" printed on a card
 * is read from the text (`scryfall.ts`).
 */
export function equipAbility(
  opts: Omit<Parameters<typeof activated>[0], "targets" | "effects" | "sorcerySpeed"> & {
    filter?: ObjectFilter;
    targetLabel?: string;
    label: string;
  },
): ActivatedAbilityDef {
  const { filter, targetLabel, ...rest } = opts;
  const t = target.creature("t", { controller: "you", ...filter });
  return {
    ...activated({
      ...rest,
      sorcerySpeed: true,
      targets: [targetLabel ? { ...t, label: targetLabel } : t],
      effects: [fx.attach(ref.target())],
    }),
    equip: true,
  };
}

/** Saddle N (702.171): "tap any number of creatures with total power N or more: this Mount becomes saddled. Sorcery." */
export function saddleAbility(n: number): ActivatedAbilityDef {
  return {
    kind: "activated",
    cost: { crew: n },
    targets: [],
    effects: [{ op: "saddle" }],
    sorcerySpeed: true,
    label: msg("Saddle {n}", { n }),
  };
}

/**
 * Cumulative upkeep (702.24): "at the beginning of your upkeep, put an age counter on this permanent, then sacrifice it
 * unless you pay its upkeep cost for each age counter on it"; read from the text (`scryfall.ts`), cost in mana and/or
 * life.
 */
export function cumulativeUpkeepAbility(cost: { mana?: ManaCost; life?: number }, label: string): TriggeredAbilityDef {
  const age: Amount = { kind: "countersOn", ref: { kind: "self" }, counter: "age" };
  return {
    kind: "triggered",
    trigger: { on: "step", step: "upkeep", whose: "you" },
    targets: [],
    effects: [
      { op: "addCounters", what: { kind: "self" }, amount: 1, kind: "age" },
      {
        op: "pay",
        unless: true,
        who: { kind: "you" },
        cost: { ...(cost.mana ? { mana: cost.mana } : {}), ...(cost.life !== undefined ? { payLife: cost.life } : {}) },
        times: age,
        skip: 1,
      },
      { op: "sacrificeIt", what: { kind: "self" } },
    ],
    label,
  };
}

/**
 * Ward (702.21): "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter it
 * unless that player pays [cost]." (granted: Hardlight Containment).
 */
export function wardAbility(ward: NonNullable<CardDef["ward"]>): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger: { on: "becomesTarget", who: "self", by: "opponent" },
    targets: [],
    effects: [
      {
        op: "pay",
        unless: true,
        who: { kind: "eventPlayer" },
        cost: wardCost(ward),
        ...(ward.or ? { or: ward.or } : {}),
        skip: 1,
      },
      { op: "counter", what: { kind: "eventObject" } },
    ],
    ward: true,
    label: msg("Ward"),
  };
}

/** The cost of a ward (`CardDef.ward`) as the cost of its `pay` effect. */
function wardCost(ward: NonNullable<CardDef["ward"]>): PayCost {
  const life: Amount | undefined = ward.lifePower ? { kind: "powerOf", ref: { kind: "self" } } : ward.life;
  return {
    ...(ward.mana ? { mana: ward.mana } : {}),
    ...(life !== undefined ? { payLife: life } : {}),
    ...(ward.discard ? { discard: 1 } : {}),
    ...(ward.discardRandom ? { discardRandom: true } : {}),
    ...(ward.sacrifice ? { sacrifice: { filter: ward.sacrificeFilter ?? {}, count: ward.sacrifice } } : {}),
    ...(ward.collectEvidence ? { collectEvidence: ward.collectEvidence } : {}),
    ...(ward.waterbend ? { tapToPay: "waterbend" as const } : {}),
    ...(ward.poison ? { poison: ward.poison } : {}),
  };
}

/** "You may cast spells as though they had flash." */
export function flashForAll(label?: string): CastPermissionAbilityDef {
  return { kind: "castPermission", flash: true, label };
}

/** Cast permissions: without paying (Omniscience), loot (Tinybones), graveyard (Muldrotha)… */
export function castPermission(opts: Omit<CastPermissionAbilityDef, "kind">): CastPermissionAbilityDef {
  return { kind: "castPermission", ...opts };
}

/** "If [an object] would be put into a graveyard, exile it instead" (614.1a; order: `replaceGraveyard`). */
export function graveyardReplacement(opts: Omit<GraveyardReplacementAbilityDef, "kind"> = {}): GraveyardReplacementAbilityDef {
  return { kind: "graveyardReplacement", ...opts };
}

/**
 * Replacement of a printed numeric event (R1, 614, 615): "if a source you control would deal damage, it deals that much
 * damage plus 1 / double that damage instead", "prevent …", life loss.
 */
export function eventReplacement(opts: Omit<EventReplacementAbilityDef, "kind">): EventReplacementAbilityDef {
  return { kind: "eventReplacement", ...opts };
}

/**
 * "Doesn't untap during its controller's untap step" (502.3): an `untap` replacement limited to that step
 * (`untapStep`), for the source (`self`), the permanent it's attached to (`attached`) or the permanents of a filter;
 * `may`: "you may choose not to untap it" (Hedge Whisperer: a question at the untap step).
 * Granted by an effect: `addAbilities: [doesntUntap("self")]`.
 */
export function doesntUntap(
  affects: "self" | "attached" | ObjectFilter,
  opts: { may?: boolean; condition?: Condition; label?: string } = {},
): EventReplacementAbilityDef {
  const toFilter: ObjectFilter = affects === "self" ? { self: true } : affects === "attached" ? { attached: "host" } : affects;
  return {
    kind: "eventReplacement",
    event: "untap",
    toFilter,
    untapStep: opts.may ? "may" : true,
    modify: { prevent: true },
    ...(opts.condition ? { condition: opts.condition } : {}),
    label: opts.label ?? (opts.may ? msg("You may choose not to untap it") : msg("Doesn't untap")),
  };
}

/** Static ability that applies to its controller (hexproof, "can't lose"…). */
export function playerStatic(opts: Omit<PlayerStaticAbilityDef, "kind">): PlayerStaticAbilityDef {
  return { kind: "playerStatic", ...opts };
}

export function prevention(
  filter: ObjectFilter,
  opts: { noncombatOnly?: boolean; combatOnly?: boolean; source?: ObjectFilter; label?: string } = {},
): PreventionAbilityDef {
  return { kind: "prevention", filter, ...opts };
}

/** Mana cost written as on the card ("{3}{B}"). */
export function cost(text: string): ManaCost {
  return parseManaCost(text);
}

/**
 * Blocking rules (family R4.1): "can't be blocked by [filter]", "can block only [filter]", number of blockers. Printed:
 * `blockAbility(block.…)`; granted: `addBlockRules` of an effect or a static ability.
 */
export const block = {
  notBy: (filter: ObjectFilter, label: string): BlockRule => ({ cantBeBlockedBy: filter, label }),
  /** Landwalk (702.14): "islandwalk", "forestwalk"… */
  landwalk: (landType: string, label: string): BlockRule => ({
    unblockableIfDefenderControls: { types: ["Land"], subtype: landType },
    label,
  }),
  /** "Can't attack a player it has already attacked this turn." */
  notSameDefenderTwice: {
    notDefendersAttackedThisTurn: true,
    label: msg("Doesn't attack the same player twice in a turn"),
  } as BlockRule,
  onlyBlocks: (filter: ObjectFilter, label: string): BlockRule => ({ canBlockOnly: filter, label }),
  atLeast: (n: number): BlockRule => ({ minBlockers: n, label: msg("Blocked by {n} or more creatures", { n }) }),
  atMost: (n: number): BlockRule => ({
    maxBlockers: n,
    label: n === 1 ? msg("Blocked by no more than one creature") : msg("Blocked by no more than {n} creatures", { n }),
  }),
  notAlone: { notAlone: true, label: msg("Can't attack or block alone") } as BlockRule,
  /** Fear (702.36): can't be blocked except by artifact creatures and/or black creatures. */
  fear: { cantBeBlockedBy: { not: { anyOf: [{ types: ["Artifact"] }, { colors: ["B"] }] } }, label: msg("Fear") } as BlockRule,
  /** Intimidate (702.13): only by artifact creatures and/or creatures that share a color with it. */
  intimidate: {
    cantBeBlockedBy: { not: { anyOf: [{ types: ["Artifact"] }, { shares: { what: "color", with: { kind: "self" } } }] } },
    label: msg("Intimidate"),
  } as BlockRule,
  /** "Can't be blocked by creatures that player controls": the designated player, fixed at resolution. */
  notByPlayer: (who: Ref, label: string): BlockRule => ({ cantBeBlockedByPlayer: who, label }),
  /** The most frequent ones. */
  notByPowerLE2: {
    cantBeBlockedBy: { maxPower: 2 },
    label: msg("Can't be blocked by creatures with power 2 or less"),
  } as BlockRule,
};

/** "Uses its toughness (or a modified power) to …" (family R4.3). */
export const powerFor = {
  /** Pilot: crews and saddles as though its power were 2 greater. */
  pilot: { uses: ["crew"], bonus: 2, label: msg("Crews and saddles as though its power were 2 greater") } as PowerRule,
  crewWithToughness: { uses: ["crew"], toughness: "always", label: msg("Crews and saddles using its toughness") } as PowerRule,
  combatToughness: {
    uses: ["combatDamage"],
    toughness: "ifGreater",
    label: msg("Deals combat damage equal to its toughness if it's greater"),
  } as PowerRule,
  combatAbsolute: {
    uses: ["combatDamage"],
    absolute: true,
    label: msg("Deals combat damage equal to the absolute value of its power"),
  } as PowerRule,
};

/** "Uses its toughness to" rule printed on the card: a static ability on itself. */
export function powerRuleAbility(rule: PowerRule): AbilityDef {
  return staticAbility("self", { addPowerRules: [rule] }, { label: rule.label });
}

/** Protections and hexproofs "from [filter]" (family R4.2). */
export const protection = {
  from: (filter: ObjectFilter, label: string): ProtectionRule => ({ from: filter, label }),
  hexproofFrom: (filter: ObjectFilter, label: string): ProtectionRule => ({ from: filter, hexproofOnly: true, label }),
  everything: { from: {}, label: msg("Protection from everything") } as ProtectionRule,
  /** "Protection from spells" (Emrakul, the World Anew): from any spell on the stack. */
  spells: (label: string): ProtectionRule => ({ from: {}, spells: true, label }),
};

/** Protection or hexproof printed on the card: a static ability on itself. */
export function protectionAbility(rule: ProtectionRule): AbilityDef {
  return staticAbility("self", { addProtections: [rule] }, { label: rule.label });
}

/**
 * Myriad (702.116): whenever it attacks, for each opponent other than the defending player, you may create a tapped
 * copy attacking that player or a planeswalker they control, exiled at end of combat. Read from the text
 * (`scryfall.ts`) or granted (Legion Loyalty).
 */
export function myriadAbility(): AbilityDef {
  return triggered(
    when.attacksSelf,
    [
      fx.copyToken(ref.self, {
        attackEach: ref.withPlaneswalkers(ref.except(ref.eachOpponent, ref.defendingPlayer)),
        optional: true,
        atEndOfCombat: "exile",
      }),
    ],
    { label: msg("Myriad: a copy attacks each of your other opponents") },
  );
}

/**
 * Soulbond (702.95a): "you may pair this creature with another unpaired creature when either enters". Two abilities: when
 * it enters, with another unpaired creature you control; when another unpaired creature you control enters, if it is
 * unpaired. Read from the text (`scryfall.ts`).
 */
export function soulbondAbilities(): AbilityDef[] {
  const unpairedOther: ObjectFilter = { types: ["Creature"], controller: "you", other: true, paired: false };
  return [
    triggered(
      when.entersSelf,
      [
        fx.chooseAmong(ref.permanentsOf(ref.you, unpairedOther), ref.you, "soulbond", {
          optional: true,
          prompt: msg("Soulbond: pair it with another unpaired creature you control?"),
        }),
        fx.pair(ref.self, ref.stored("soulbond")),
      ],
      { label: msg("Soulbond: pair it with another creature") },
    ),
    triggered(
      when.enters(unpairedOther),
      fx.may(msg("Soulbond: pair this creature with the one that entered?"), fx.pair(ref.self, ref.eventObject)),
      { condition: cond.sourceMatches({ paired: false }), label: msg("Soulbond: pair it with the creature that entered") },
    ),
  ];
}

/** Blocking rule printed on the card: a static ability on itself. */
export function blockAbility(rule: BlockRule): AbilityDef {
  return staticAbility("self", { addBlockRules: [rule] }, { label: rule.label });
}

/** Static ability: "Other Elves you control get +1/+1", "has flying as long as…". */
export function staticAbility(
  affects: "self" | "attached" | ObjectFilter,
  mods: LayerMods,
  opts: {
    condition?: Condition;
    label?: string;
    per?: ObjectFilter;
    perCounter?: string;
    perGraveyard?: ObjectFilter;
    perLife?: boolean;
    perHand?: boolean;
    perAmount?: Amount;
    /** "As long as this card is in your graveyard" (113.6): works from the graveyard only. */
    fromGraveyard?: boolean;
  } = {},
): StaticAbilityDef {
  return {
    kind: "static",
    ...(opts.fromGraveyard ? { fromGraveyard: true } : {}),
    affects,
    mods,
    condition: opts.condition,
    label: opts.label,
    per: opts.per,
    perCounter: opts.perCounter,
    perGraveyard: opts.perGraveyard,
    perLife: opts.perLife,
    perHand: opts.perHand,
    perAmount: opts.perAmount,
  };
}

/** "Enters tapped" / "enters with N +1/+1 counters" (possibly under a condition: raid, kicker). */
export function entersWith(opts: {
  tapped?: boolean;
  counters?: Amount;
  /** Kind of the counters (+1/+1 by default). */
  counterKind?: string;
  condition?: Condition;
  label?: string;
  /** Other permanents concerned ("creatures your opponents control enter tapped"). */
  affects?: ObjectFilter;
  /** "This creature enters prepared." */
  prepared?: boolean;
}): ReplacementAbilityDef {
  return {
    kind: "replacement",
    entersTapped: opts.tapped,
    entersPrepared: opts.prepared,
    entersWithCounters: opts.counters,
    counterKind: opts.counterKind,
    condition: opts.condition,
    affects: opts.affects,
    label: opts.label,
  };
}

/**
 * Firebending N (Avatar): "whenever this creature attacks, add N {R}; this mana lasts until end of combat". N can be an
 * amount ("firebending X, where X is Zuko's power").
 */
export function firebending(n: Amount): TriggeredAbilityDef {
  return triggered(when.attacksSelf, [fx.addManaUntilEndOfCombat(["R"], n), { op: "bent", kind: "fire" }], {
    label: typeof n === "number" ? msg("Firebending {n}", { n }) : msg("Firebending X"),
  });
}

/** Saga chapter(s) (714.2): "I, II — [effects]". */
export function chapter(
  chapters: number[],
  effects: Effects,
  opts: { targets?: TargetSpec[]; label?: string } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger: { on: "chapter", chapters },
    effects: effects.flat(),
    targets: opts.targets ?? [],
    label: opts.label ?? msg("Chapter {n}", { n: chapters.map(roman).join(", ") }),
  };
}

const roman = (n: number): string => ["", "I", "II", "III", "IV", "V", "VI"][n] ?? String(n);

/** Modal triggered ability ("choose one —"). */
export function triggeredModal(
  trigger: TriggerSpec,
  modes: ModeDef[],
  opts: { condition?: Condition; label?: string; uniqueModes?: boolean | "turn"; oncePerTurn?: boolean } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: [],
    targets: [],
    modes,
    condition: opts.condition,
    label: opts.label,
    uniqueModes: opts.uniqueModes,
    oncePerTurn: opts.oncePerTurn,
  };
}
