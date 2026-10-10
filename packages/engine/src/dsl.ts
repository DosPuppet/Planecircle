/**
 * A small DSL to write card behavior. It only produces data.
 *
 *   spell([target.any()], [fx.damage(3, ref.target())])
 */
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
  CardType,
  CastPermissionAbilityDef,
  CastVia,
  Color,
  Condition,
  CopyFate,
  CostReductionAbilityDef,
  Effect,
  EventReplacement,
  EventReplacementAbilityDef,
  FilterCompare,
  GraveyardReplacementAbilityDef,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ModeDef,
  MoveSpec,
  ObjectFilter,
  PlayerStaticAbilityDef,
  PowerRule,
  PreventionAbilityDef,
  ProtectionRule,
  Ref,
  ReplacementAbilityDef,
  SpellDef,
  StaticAbilityDef,
  Step,
  TargetFilter,
  TargetSpec,
  TokenSpec,
  TriggeredAbilityDef,
  TriggerSpec,
  TurnLogQuery,
  Zone,
} from "./types";

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
  castFromGraveyard?: CardDef["castFromGraveyard"];
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

export const target = {
  any: (id = "t"): TargetSpec => ({
    id,
    label: msg("any target"),
    filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"] } },
  }),
  creature: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label:
      extra.controller === "you"
        ? msg("creature you control")
        : extra.controller === "opponent"
          ? msg("creature an opponent controls")
          : msg("creature"),
    filter: { objects: { types: ["Creature"], ...extra } },
  }),
  permanent: (id: string, types: CardType[], extra: ObjectFilter = {}, label?: string): TargetSpec => ({
    id,
    label,
    filter: { objects: { types, ...extra } },
  }),
  player: (id = "t", which: "any" | "opponent" = "any"): TargetSpec => ({
    id,
    label: which === "opponent" ? msg("opponent") : msg("player"),
    filter: { players: which },
  }),
  optional: (t: TargetSpec): TargetSpec => ({ ...t, optional: true }),
  /** "up to N [targets]" */
  upTo: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n, optional: true }),
  /** "N [targets]" (exactly N, all different). */
  exactly: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n }),
  /** "one or two targets": between `min` and `max` targets. */
  between: (min: number, max: number, t: TargetSpec): TargetSpec => ({ ...t, count: max, minCount: min }),
  /**
   * "… that player controls", "from that player's graveyard": the targets are held by the designated player (the player
   * of the event, the defending player, or the one chosen for another "target" word: `ref.target("p")`).
   */
  of: (who: Ref, t: TargetSpec, label?: string): TargetSpec => ({ ...t, of: who, ...(label ? { label } : {}) }),
  /** "target [filter] card from your graveyard / from a graveyard" */
  cardInGraveyard: (
    id = "t",
    filter: ObjectFilter = {},
    whose: "you" | "opponent" | "any" = "you",
    label = whose === "you" ? msg("card in your graveyard") : msg("card in a graveyard"),
  ): TargetSpec => ({ id, label, filter: { cards: { filter, whose } } }),
  /** "target nonland permanent" (and other combinations of types) */
  nonland: (id = "t", extra: ObjectFilter = {}, label = msg("nonland permanent")): TargetSpec => ({
    id,
    label,
    filter: { objects: { ...extra, notTypes: ["Land", ...(extra.notTypes ?? [])] } },
  }),
  /** "target spell or ability with a single target" (Bolt Bend) */
  stackItemSingleTarget: (id = "t"): TargetSpec => ({
    id,
    label: msg("spell or ability with a single target"),
    filter: { stackItems: { singleTarget: true } },
  }),
  /** "target spell" (on the stack) */
  spell: (id = "t", filter: ObjectFilter = {}, label = msg("spell")): TargetSpec => ({ id, label, filter: { spells: filter } }),
  creatureOrPlaneswalker: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label: msg("creature or planeswalker"),
    filter: { objects: { types: ["Creature", "Planeswalker"], ...extra } },
  }),
};

export const ref = {
  target: (id = "t"): Ref => ({ kind: "target", id }),
  /** The object of the triggering event ("this creature", "this spell"…). */
  eventObject: { kind: "eventObject" } as Ref,
  /** "One or more …" (`batched` trigger): the objects of all the events of the batch ("those creatures"). */
  eventObjects: { kind: "eventObjects" } as Ref,
  eventPlayer: { kind: "eventPlayer" } as Ref,
  /** "One or more …" (`batched` trigger): the players of all the events of the batch ("each of those opponents"). */
  eventPlayers: { kind: "eventPlayers" } as Ref,
  /** The permanent that grants the ability ("Return Trusty Boomerang", in the ability granted to the equipped creature). */
  grantor: { kind: "grantor" } as Ref,
  self: { kind: "self" } as Ref,
  you: { kind: "you" } as Ref,
  eachOpponent: { kind: "eachOpponent" } as Ref,
  eachPlayer: { kind: "eachPlayer" } as Ref,
  /** The permanent the source is attached to ("the equipped / enchanted creature"). */
  attached: { kind: "attached" } as Ref,
  /** The permanents attached to the designated object (filter with `ref.filtered`). */
  attachmentsOf: (r: Ref): Ref => ({ kind: "attachmentsOf", ref: r }),
  /** The permanents the designated objects are attached to (an Aura's host). */
  hostOf: (r: Ref): Ref => ({ kind: "hostOf", ref: r }),
  /** "Its controller" (last known controller of an object that left the battlefield this turn). */
  controllerOf: (r: Ref): Ref => ({ kind: "controllerOf", ref: r }),
  /** "Its owner". */
  ownerOf: (r: Ref): Ref => ({ kind: "ownerOf", ref: r }),
  /** "this card", wherever it is (Angelic Destiny). */
  selfCard: { kind: "selfCard" } as Ref,
  linked: { kind: "linked" } as Ref,
  /** The player chosen as the source entered ("the chosen player"). */
  chosenPlayer: { kind: "chosenPlayer" } as Ref,
  /** What was paid in objects for the cost (sacrificed permanents, discarded cards…). */
  cost: (paid: Extract<Ref, { kind: "cost" }>["paid"]): Ref => ({ kind: "cost", paid }),
  costSacrificed: { kind: "cost", paid: "sacrificed" } as Ref,
  costDiscarded: { kind: "cost", paid: "discarded" } as Ref,
  /** The designated objects that match the filter (Ghost Vacuum: "each creature card exiled with…"). */
  filtered: (r: Ref, filter: ObjectFilter): Ref => ({ kind: "filtered", ref: r, filter }),
  /** Union of references, without duplicates. */
  union: (...of: Ref[]): Ref => ({ kind: "union", of }),
  /** "The creatures blocked by [it] / blocking [it]" during this combat. */
  combatPartners: (r: Ref): Ref => ({ kind: "combatPartners", ref: r }),
  /** The players who chose the highest number, the lowest, or not the lowest (`fx.chooseNumbers`). */
  numberChoosers: (store: string, which: "highest" | "lowest" | "notLowest"): Ref => ({ kind: "numberChoosers", store, which }),
  /** The n-th (from 0) of the designated objects or players. */
  nth: (of: Ref, n: number): Ref => ({ kind: "nth", of, n }),
  /** Commander: the commanders of the designated players (you by default), wherever they are. */
  commanders: (who: Ref = { kind: "you" }): Ref => ({ kind: "commanders", who }),
  /** The objects of `r` except those of `exclude` ("all other creatures"). */
  except: (r: Ref, exclude: Ref): Ref => ({ kind: "except", ref: r, exclude }),
  /** Cards exiled by the source "until it leaves the battlefield". */
  exiledWith: { kind: "exiledWith" } as Ref,
  /** The cards exiled to pay the cost ("copy the exiled cards"). */
  costExiled: { kind: "cost", paid: "exiled" } as Ref,
  /** The cards in your graveyard with the same name as the designated card, itself included (Rat King, Verminister). */
  sameNameInGraveyard: (r: Ref): Ref => ({ kind: "sameName", ref: r, zone: "graveyard" }),
  /** The permanents with the same name as the designated objects, themselves included. */
  sameNameOnBattlefield: (r: Ref): Ref => ({ kind: "sameName", ref: r, zone: "battlefield" }),
  /** The creature returned to hand for Web-slinging (Scarlet Spider, Ben Reilly). */
  costBounced: { kind: "cost", paid: "bounced" } as Ref,
  /** The targets of the spell or ability of the event ("those creatures"). */
  targetsOfEventObject: { kind: "targetsOfEventObject" } as Ref,
  /** The abilities on the stack whose source is the object of the event, most recent first. */
  abilitiesFromEventObject: { kind: "abilitiesFromEventObject" } as Ref,
  /** The designated players for whom the condition is true, from their point of view. */
  playersWhere: (of: Ref, where: Condition): Ref => ({ kind: "playersWhere", of, where }),
  playersWithoutMaxSpeed: {
    kind: "playersWhere",
    of: { kind: "eachPlayer" },
    where: { kind: "not", cond: { kind: "maxSpeed" } },
  } as Ref,
  libraryTop: (who: Ref): Ref => ({ kind: "libraryTop", who }),
  /** The top N cards of the designated player's library (Memories Returning). */
  libraryTopCards: (who: Ref, count: number): Ref => ({ kind: "libraryTop", who, count }),
  /** The bottom card of the designated player's library. */
  libraryBottom: (who: Ref): Ref => ({ kind: "libraryTop", who, bottom: true }),
  /** The objects in a zone of the designated players (see the `zone` reference). */
  zone: (zone: Extract<Ref, { kind: "zone" }>["zone"], who: Ref, filter?: ObjectFilter): Ref => ({
    kind: "zone",
    zone,
    who,
    ...(filter ? { filter } : {}),
  }),
  stackItemsOf: (who: Ref): Ref => ({ kind: "zone", zone: "stack", who }),
  exiledCardsOf: (who: Ref): Ref => ({ kind: "zone", zone: "exile", who }),
  allGraveyards: { kind: "zone", zone: "graveyard", who: { kind: "eachPlayer" } } as Ref,
  graveyardOf: (who: Ref): Ref => ({ kind: "zone", zone: "graveyard", who }),
  crewedBy: { kind: "crewedBy" } as Ref,
  stored: (name: string): Ref => ({ kind: "stored", name }),
  /** "each [creature] [the designated player] controls" */
  permanentsOf: (player: Ref, filter: ObjectFilter): Ref => ({ kind: "zone", zone: "battlefield", who: player, filter }),
  playersWithMost: (filter: ObjectFilter): Ref => ({ kind: "playersWithMost", filter }),
  /** The defending player of the attacking source creature (or the controller of the attacked planeswalker). */
  defendingPlayer: { kind: "defendingPlayer" } as Ref,
  /** "That player or a planeswalker they control": the designated players and their planeswalkers. */
  withPlaneswalkers: (of: Ref): Ref => ({ kind: "withPlaneswalkers", of }),
  handOf: (player: Ref, filter: ObjectFilter = {}, maxManaValue?: Amount): Ref => ({
    kind: "zone",
    zone: "hand",
    who: player,
    filter,
    ...(maxManaValue !== undefined ? { maxManaValue } : {}),
  }),
};

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

/**
 * Goad (701.38): attack rule fixed at resolution on the controller of the effect (`fx.goad`). Its label distinguishes it
 * from a rule of the same form that is not goad (`attackRequirements`).
 */
const GOADED: BlockRule = {
  goadedBy: "you",
  label: msg("Goaded: attacks each combat if able, and a player other than the one who goaded it if able"),
};

/**
 * The permanents of the filter, as a reference (`zone`): yours, your opponents' or all players' according to its
 * `controller` ("each creature you control", "all creatures").
 */
function allMatching(filter: ObjectFilter): Ref {
  const who: Ref =
    filter.controller === "you"
      ? { kind: "you" }
      : filter.controller === "opponent"
        ? { kind: "eachOpponent" }
        : { kind: "eachPlayer" };
  return { kind: "zone", zone: "battlefield", who, filter };
}

/** The filter restricted to creatures ("creatures you control get…"). */
function creaturesOnly(filter: ObjectFilter): ObjectFilter {
  if (!filter.types) return { ...filter, types: ["Creature"] };
  if (filter.types.every((t) => t === "Creature")) return filter;
  return { types: ["Creature"], ...(filter.controller ? { controller: filter.controller } : {}), anyOf: [filter] };
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

export const fx = {
  /** `storeDealt`: the damage really dealt to the targets is stored ("if a player is dealt damage this way"). */
  damage: (n: Amount, to: Ref, source?: Ref, opts: { storeDealt?: string } = {}): Effect => ({
    op: "damage",
    amount: n,
    to,
    source,
    ...(opts.storeDealt ? { storeDealt: opts.storeDealt } : {}),
  }),
  fight: (a: Ref, b: Ref, storeExcess?: string): Effect => ({ op: "fight", a, b, ...(storeExcess ? { storeExcess } : {}) }),
  pump: (what: Ref, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what,
    power,
    toughness,
    keywords,
  }),
  /** "Double the power and toughness of [those creatures] until end of turn" (each according to its own). */
  doublePT: (what: Ref, keywords?: Keyword[]): Effect => ({ op: "pump", what, power: 0, toughness: 0, keywords, double: true }),
  /** The matching creatures get +X/+Y (and keywords) until end of turn. */
  pumpAll: (filter: ObjectFilter, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what: allMatching(creaturesOnly(filter)),
    power,
    toughness,
    keywords,
  }),
  destroy: (what: Ref, store?: string): Effect => ({ op: "destroy", what, store }),
  tapChosen: (filter: ObjectFilter, store: string, opts: { exactly?: number; sharesColorWith?: Ref } = {}): Effect => ({
    op: "tapChosen",
    filter: opts.sharesColorWith ? { ...filter, shares: { what: "color", with: opts.sharesColorWith } } : filter,
    store,
    ...(opts.exactly !== undefined ? { exactly: opts.exactly } : {}),
  }),
  lkiCountersTo: (to: Ref): Effect => ({ op: "lkiCountersTo", to }),
  /** "Move a counter from [this permanent] onto [that other one]" (kind of your choice). */
  moveCounter: (from: Ref, to: Ref): Effect => ({ op: "moveCounter", from, to }),
  /** "They can't gain life for the rest of the game" (Screaming Nemesis). */
  cantGainLife: (who: Ref): Effect => ({ op: "playerEffect", ability: { cantGainLife: true }, who, duration: "forever" }),
  millWhileShared: { op: "millWhileShared", draw: true } as Effect,
  /** "[The player] mills two cards; if two [nonland] cards that share a color were milled, repeat." */
  millWhileSharingColor: (who: Ref, nonland = false): Effect => ({
    op: "millWhileShared",
    who,
    share: "color",
    ...(nonland ? { nonland } : {}),
  }),
  /**
   * Goad (701.38): until your next turn (or forever: Dack Fayden), those creatures attack each combat if able, and a
   * player other than you if able. "You" is fixed at resolution (`goadedBy`).
   * `extra`: other modifications for the same duration (Taunt from the Rampart: "can't block").
   */
  goad: (what: Ref, duration: "permanent" | "untilYourNextTurn" = "untilYourNextTurn", extra: LayerMods = {}): Effect => ({
    op: "modify",
    what,
    mods: { ...extra, addBlockRules: [...(extra.addBlockRules ?? []), GOADED] },
    duration,
  }),
  /** `basePT`: base P/T set to this amount, evaluated at resolution (Fractalize: "X+1/X+1"). */
  modify: (
    what: Ref,
    mods: LayerMods,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "endOfYourNextTurn" = "endOfTurn",
    basePT?: Amount,
  ): Effect => ({
    op: "modify",
    what,
    mods,
    duration,
    ...(basePT !== undefined ? { basePT } : {}),
  }),
  /** Modification that lasts "for as long as it has a [kind] counter" (Ultima: "for as long as this land has a blight counter"). */
  modifyWhileCounter: (what: Ref, mods: LayerMods, kind: string): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: { counter: kind },
  }),
  /** Modification that lasts "for as long as this creature remains tapped" (Hedge Whisperer). */
  modifyWhileTapped: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "sourceTapped",
  }),
  draw: (n: Amount, who: Ref = ref.you): Effect => ({ op: "draw", who, amount: n }),
  gainLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "gainLife", who, amount: n }),
  /** Creates tokens (for you, or for another player: "its controller creates…"). */
  createTokens: (token: TokenSpec, count: Amount = 1, forWho?: Ref, store?: string, attachTo?: Ref): Effect => ({
    op: "createTokens",
    attachTo,
    token,
    count,
    for: forWho,
    store,
  }),
  /** Tapped tokens (and attacking if `attacking`). */
  /** X/X token: power and toughness equal to the amount. */
  createXXToken: (token: TokenSpec, pt: Amount, count: Amount = 1): Effect => ({ op: "createTokens", token, count, pt }),
  createTappedTokens: (
    token: TokenSpec,
    count: Amount = 1,
    opts: { attacking?: boolean | Ref; store?: string } = {},
  ): Effect => ({
    op: "createTokens",
    token,
    count,
    tapped: true,
    ...opts,
  }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  /** "Exile [this spell] with N time counters; it gains suspend" (702.62). */
  suspend: (what: Ref, time: number): Effect => ({ op: "suspend", what, time }),
  /** "[This permanent] endures N" (701.64): N +1/+1 counters on it, or an N/N white Spirit token. */
  endure: (what: Ref, n: Amount): Effect => ({ op: "endure", what, amount: n }),
  /** Blight N (ECL): `who` puts N −1/−1 counters on a creature they control; `store`: 1 if done. */
  blight: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "blight", who, amount: n, store }),
  /** "Harness [this Infinity Stone]" (Harness). */
  harness: { op: "harness" } as Effect,
  /** "Monstrosity N" (701.37): if this permanent isn't monstrous, N +1/+1 counters on it and it becomes monstrous. */
  monstrosity: (n: Amount): Effect => ({ op: "monstrosity", amount: n }),
  /** "[That player] amasses [Goblins] X" (701.47). */
  amass: (who: Ref, subtype: string, n: Amount): Effect => ({
    op: "counterOnOrCreate",
    who,
    find: { subtype: "Army", controller: "you" },
    token: {
      name: `${subtype} Army`,
      colors: ["B"],
      types: ["Creature"],
      subtypes: [subtype, "Army"],
      power: 0,
      toughness: 0,
    },
    kind: "+1/+1",
    amount: n,
    addSubtypes: [subtype],
  }),
  /**
   * Earthbend N (701.65, Avatar): the land becomes a 0/0 creature with haste that's still a land, with N +1/+1
   * counters, and "when it dies or is exiled, return it to the battlefield tapped".
   */
  earthbend: (what: Ref, n: Amount): Effect[] => [
    {
      op: "modify",
      what,
      mods: {
        addTypes: ["Creature"],
        setPower: 0,
        setToughness: 0,
        addKeywords: ["haste"],
        addAbilities: [
          triggered(when.diesOrExiled("self"), [fx.toBattlefield(ref.selfCard, { tapped: true })], {
            label: msg("Returns to the battlefield tapped"),
          }),
        ],
      },
      duration: "permanent",
    },
    { op: "addCounters", what, amount: n },
    { op: "bent", kind: "earth" },
  ],
  loseLife: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "loseLife", who, amount: n, store }),
  /** "Each player loses half their life, rounded down." */
  loseHalfLife: (who: Ref): Effect => ({ op: "loseLife", who, amount: 0, half: true }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  /** Airbend: exiles; its owner may cast it for {2} as long as it remains exiled. */
  airbend: (what: Ref): Effect => ({ op: "airbend", what }),
  /**
   * "Keep the chosen permanents": for each player of `who` (APNAP order), permanents they control are chosen (`pick`), by
   * them (`chooser: "each"`, the default) or by you (`"you"`); then their other permanents of the filter are sacrificed
   * (`fate`, the default) or destroyed, all at the same time. `among`: those that can be chosen (the filter by default);
   * `max`: the total power of `"totalPower"`.
   */
  keep: (
    who: Ref,
    pick: "one" | "onePerType" | "totalPower" | "sharesType",
    filter: ObjectFilter,
    opts: { chooser?: "each" | "you"; fate?: "sacrifice" | "destroy"; among?: ObjectFilter; max?: Amount } = {},
  ): Effect => ({
    op: "keep",
    who,
    chooser: opts.chooser ?? "each",
    pick,
    filter,
    fate: opts.fate ?? "sacrifice",
    ...(opts.among ? { among: opts.among } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
  }),
  /** Player effect until end of turn, for its controller (`damageUnpreventable`: "damage can't be prevented this turn"). */
  thisTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({ op: "playerEffect", ability, who }),
  /** Player effect until the beginning of your next turn (Avatar's Wrath). */
  /** Player effect until the next turn of the affected player (Teferi's Reproach). */
  untilTheirNextTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "untilTheirNextTurn",
  }),
  /** Player effect until the end of the next turn of the affected player ("during that player's next turn": Azor). */
  throughTheirNextTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "throughTheirNextTurn",
  }),
  untilYourNextTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "untilYourNextTurn",
  }),
  /** N one-shot effects on these players (Ral Zarek: "skips their next X turns"). */
  playerEffectTimes: (ability: Omit<PlayerStaticAbilityDef, "kind">, times: Amount, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    times,
  }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  /** "Regenerate [this permanent]" (701.19). */
  regenerate: (what: Ref): Effect => ({ op: "regenerate", what }),
  /** "[This permanent] phases out" (702.26). */
  phaseOut: (what: Ref): Effect => ({ op: "phaseOut", what }),
  mill: (n: Amount, who: Ref = ref.you, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "mill",
    who,
    amount: n,
    store,
  }),
  /** Each designated player mills half their library, rounded down. */
  /** "Half their library", rounded down (or up: `roundUp`). */
  millHalf: (who: Ref, roundUp = false): Effect => ({ op: "mill", who, amount: 0, halfLibrary: roundUp ? "up" : true }),
  /** Each designated player mills as many cards as there are in their graveyard. */
  millGraveyardSize: (who: Ref): Effect => ({ op: "mill", who, amount: 0, graveyardSize: true }),
  scry: (n: Amount, who?: Ref): Effect => ({ op: "scry", amount: n, ...(who ? { who } : {}) }),
  surveil: (n: Amount, toHand?: { filter?: ObjectFilter; maxManaValue?: Amount }, store?: string): Effect => ({
    op: "surveil",
    amount: n,
    toHand,
    store,
  }),
  discard: (
    n: Amount,
    who: Ref = ref.you,
    opts: {
      filter?: ObjectFilter;
      chooser?: "controller";
      optional?: boolean;
      store?: string;
      random?: boolean;
      storeFilter?: ObjectFilter;
      unlessFilter?: ObjectFilter;
      exile?: boolean;
      half?: boolean;
      /** The player first reveals that many cards of their choice; the choice is made among them (Klaw). */
      reveal?: Amount;
    } = {},
  ): Effect => ({ op: "discard", who, amount: n, ...opts }),
  sacrifice: (
    who: Ref,
    filter: ObjectFilter,
    n: Amount = 1,
    opts: {
      optional?: boolean;
      store?: string;
      greatestManaValue?: boolean;
      greatestPower?: boolean;
      to?: "exile" | "hand";
      half?: boolean;
    } = {},
  ): Effect => ({
    op: "sacrifice",
    who,
    filter,
    amount: n,
    ...opts,
  }),
  damageStoringExcess: (n: Amount, to: Ref, store: string): Effect => ({ op: "damage", amount: n, to, storeExcess: store }),
  exileIfDies: (what: Ref): Effect => ({ op: "objectReplacement", kind: "exileIfDies", what }),
  preventCombatDamage: (what: Ref): Effect => ({ op: "objectReplacement", kind: "preventCombatDamage", what }),
  /** "Prevent all damage that would be dealt to [these permanents] this turn": objects fixed at resolution. */
  preventDamageThisTurn: (what: Ref): Effect => ({ op: "objectReplacement", kind: "preventDamage", what }),
  doubleCounters: (what: Ref): Effect => ({ op: "doubleCounters", what }),
  /** "You may …": returns a list to spread into the effects. */
  may: (prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length }, ...flat];
  },
  /** "[That player] may …": the question is asked to another player (a targeted opponent…). */
  mayFor: (who: Ref, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length, who }, ...flat];
  },
  /** Like `mayFor`, storing the answer (1 = yes) for an "If [they] don't, …". */
  mayForStore: (who: Ref, prompt: string, storeAs: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "may", prompt, skip: flat.length, who, store: storeAs }, ...flat];
  },
  /**
   * "Your choice of" (608.2d): the player chooses a branch during resolution ("gains your choice of double strike or
   * lifelink"); `store`: the name of the variable that holds the chosen rank.
   */
  yourChoice: (prompt: string, store: string, branches: { label: string; effects: Effects }[], who?: Ref): Effect[] => [
    { op: "chooseOption", prompt, labels: branches.map((b) => b.label), store, ...(who ? { who } : {}) },
    ...branches.flatMap((b, i) => {
      const flat = b.effects.flat();
      const c: Condition = {
        kind: "all",
        of: [
          { kind: "var", name: store, atLeast: i + 1 },
          { kind: "not", cond: { kind: "var", name: store, atLeast: i + 2 } },
        ],
      };
      return [{ op: "if", cond: c, skip: flat.length } as Effect, ...flat];
    }),
  ],
  /** "You may behold [filter]. If you do, …" (during resolution; the card from the hand is revealed). */
  mayBehold: (filter: ObjectFilter, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "behold", filter, skip: flat.length }, ...flat];
  },
  /** "If [condition], …": the effects apply only if the condition is true at resolution. */
  /**
   * "For each [designated] player, …": the effects are repeated for each, in the order of `of` (turn order), with `p`
   * designating them (and `n`, their rank, for distinct stored names); unrolled for six players at most (an absent seat
   * does nothing).
   */
  forEachPlayer: (of: Ref, build: (p: Ref, n: number) => Effects): Effect[] =>
    Array.from({ length: 6 }, (_, n) => build({ kind: "nth", of, n }, n).flat()).flat(),
  when: (c: Condition, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "if", cond: c, skip: flat.length }, ...flat];
  },
  /**
   * "If [condition], …. Otherwise, …": the condition is read once, before the first branch (which may change it:
   * Shelinda's counter); after the first branch, a jump over the second.
   */
  ifElse: (c: Condition, then: Effects, otherwise: Effects): Effect[] => {
    const yes = then.flat();
    const no = otherwise.flat();
    const never: Condition = { kind: "amountAtLeast", amount: 0, n: 1 };
    return [{ op: "if", cond: c, skip: yes.length + 1 }, ...yes, { op: "if", cond: never, skip: no.length }, ...no];
  },
  /** "You may pay {X}. If you do, …" */
  mayPay: (cost: string, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: parseManaCost(cost), prompt, skip: flat.length }, ...flat];
  },
  /** Counters the designated spell or ability. */
  counter: (what: Ref, store?: string, storeMoved?: string): Effect => ({
    op: "counter",
    what,
    store,
    ...(storeMoved ? { storeMoved } : {}),
  }),
  /** "Counter it; exile it instead of putting it into the graveyard" (Syncopate). */
  counterExile: (what: Ref): Effect => ({ op: "counter", what, exile: true }),
  /** "Counter it unless its controller pays X": the payment cancels the following effects. */
  unlessPays: (
    who: Ref,
    cost: {
      mana?: string;
      /** Or this mana cost, of their choice (Lim-Dûl's Hex: "{B} or {3}"). */
      orMana?: string;
      life?: number;
      paidStore?: string;
      genericAmount?: Amount;
      waterbend?: boolean;
      times?: Amount;
    },
    ...effects: Effects
  ): Effect[] => {
    const flat = effects.flat();
    return [
      {
        op: "unlessPay",
        who,
        mana: cost.mana ? parseManaCost(cost.mana) : undefined,
        ...(cost.orMana ? { orMana: parseManaCost(cost.orMana) } : {}),
        genericAmount: cost.genericAmount,
        life: cost.life,
        paidStore: cost.paidStore,
        waterbend: cost.waterbend,
        ...(cost.times ? { times: cost.times } : {}),
        skip: flat.length,
      },
      ...flat,
    ];
  },
  /** These cards in your graveyard can be cast this turn (ordinary permission, Zul Ashur). */
  allowCastFromGraveyard: (what: Ref): Effect => ({ op: "grantPlay", what }),
  addMana: (...mana: ManaType[]): Effect => ({ op: "addMana", mana }),
  /** "Add [mana]. If this mana is spent to cast [a matching spell], [effect]" (Arena of Glory). */
  addManaWithRider: (rider: NonNullable<ManaAbilityDef["rider"]>, ...mana: ManaType[]): Effect => ({
    op: "addMana",
    mana,
    rider,
  }),
  /** "Add N mana of any one color"; `colors`: "{R}, {W}, or {B}". */
  addManaChoice: (n: Amount = 1, colors?: ManaType[], restriction?: ManaRestriction, keep?: boolean): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    ...(keep ? { keep } : {}),
  }),
  /** "Add N mana in any combination of colors"; `colors`: "{R} and/or {G} for each …". */
  addManaCombination: (n: Amount, colors?: ManaType[], restriction?: ManaRestriction, keep?: boolean): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    combination: true,
    ...(keep ? { keep } : {}),
  }),
  revealUntilN: (filter: ObjectFilter, n: Amount, to?: MoveSpec, store?: string, who?: Ref): Effect => ({
    op: "revealUntilN",
    filter,
    n,
    to,
    store,
    ...(who ? { who } : {}),
  }),
  /** "Exile the top N cards. Choose one of them. You may play it this turn (or until the end of your next turn)." */
  impulse: (n: number, until: "thisTurn" | "yourNextTurn" | "yourNextEndStep" = "thisTurn"): Effect => ({
    op: "impulse",
    n,
    until,
  }),
  piles: (n: number, opts: { revealed?: boolean; storeGraveyard?: string; opponentSeparates?: boolean } = {}): Effect => ({
    op: "piles",
    n,
    ...opts,
  }),
  grantFlashback: (what: Ref): Effect => ({ op: "grantPlay", what, flashback: true }),
  /** "[This card] gains harmonize until end of turn; its harmonize cost is its mana cost" (702.180). */
  grantHarmonize: (what: Ref): Effect => ({ op: "grantPlay", what, flashback: "harmonize" }),
  endTurn: { op: "endTurn" } as Effect,
  /** `whileAttached`: "for as long as [this attachment] is attached to it" (Eriette: the Aura of the event). */
  gainControl: (what: Ref, opts: { untilEndOfYourNextTurn?: boolean; whileAttached?: Ref } = {}): Effect => ({
    op: "gainControl",
    what,
    ...(opts.untilEndOfYourNextTurn ? { duration: "endOfYourNextTurn" } : {}),
    ...(opts.whileAttached ? { duration: "whileAttached", attachment: opts.whileAttached } : {}),
  }),
  /**
   * `haste`, `sacrificeAtEndStep`: the copy of a creature spell (a token) has haste, is sacrificed at the beginning of
   * the next end step.
   */
  copySpell: (
    what: Ref,
    count: Amount,
    {
      sacrificeAtEndStep,
      ...opts
    }: { haste?: boolean; sacrificeAtEndStep?: boolean; nonlegendary?: boolean; loyalty?: Amount; for?: Ref } = {},
  ): Effect => ({
    op: "copySpell",
    what,
    count,
    ...opts,
    ...(sacrificeAtEndStep ? { atEnd: "sacrifice" as const } : {}),
  }),
  /** "Exile the top N cards"; `faceDown`: face down, and who can look at them (406.3). */
  exileTop: (who: Ref, n: Amount, store: string, faceDown?: MoveSpec["faceDown"]): Effect => ({
    op: "exileTop",
    who,
    n,
    store,
    ...(faceDown ? { faceDown } : {}),
  }),
  grantPlay: (
    what: Ref,
    opts: {
      free?: boolean;
      anyTime?: boolean;
      anyMana?: boolean;
      forever?: boolean;
      untilYourNextTurn?: boolean;
      /** "Until your next end step" (Shadow Urchin). */
      untilYourNextEndStep?: boolean;
      untilOwnersNextTurn?: boolean;
      condition?: Condition;
      /** The owner of the card (`owner`) or each player other than them (`nonOwners`, Ian Malcolm). */
      for?: "owner" | "nonOwners";
      extraCost?: number;
      /** A land played this way enters tapped (with `for: "owner"`). */
      tapped?: boolean;
      /** Exiled (`exile`) or put on the bottom of the library (`bottom`) instead of going to the graveyard. */
      after?: "exile" | "bottom";
      oneOf?: boolean;
      replacePrevious?: boolean;
      payLifeManaValue?: boolean;
      adventureOnly?: boolean;
    } = {},
  ): Effect => {
    const { forever, untilYourNextTurn, untilYourNextEndStep, untilOwnersNextTurn, ...rest } = opts;
    const duration = forever
      ? "forever"
      : untilOwnersNextTurn
        ? "untilOwnersNextTurn"
        : untilYourNextTurn
          ? "untilYourNextTurn"
          : untilYourNextEndStep
            ? "untilYourNextEndStep"
            : undefined;
    return { op: "grantPlay", what, ...rest, ...(duration ? { duration } : {}) };
  },
  /**
   * "You may cast [these cards]" during resolution (608.2g): `free` without paying their mana cost, `many` as many as
   * you like, `after` exiled (`exile`) or put on the bottom of the library (`bottom`, Kylox's Voltstrider) instead of
   * going to the graveyard; `storeCast` / `storeRest` for what follows.
   */
  castNow: (
    what: Ref,
    opts: {
      free?: boolean;
      many?: boolean;
      after?: "exile" | "bottom";
      anyMana?: boolean;
      storeCast?: string;
      storeRest?: string;
      maxManaValue?: Amount;
      /** Cost replacing the mana cost, e.g. "{2}" (miracle). */
      cost?: string;
    } = {},
  ): Effect => {
    const { cost, ...rest } = opts;
    return { op: "castNow", what, ...rest, ...(cost ? { cost: parseManaCost(cost) } : {}) };
  },
  castCopiesFree: (
    what: Ref[],
    maxTotalManaValue: number,
    opts: { paid?: boolean; storeCast?: string; maxCount?: number } = {},
  ): Effect => ({
    op: "castCopiesFree",
    what,
    maxTotalManaValue,
    ...opts,
  }),
  noLegendRuleThisTurn: { op: "playerEffect", ability: { noLegendRule: true } } as Effect,
  exchangeLife: (a: Ref, b: Ref, store?: string): Effect => ({ op: "setLife", who: a, exchange: b, store }),
  /** "Do this only once each turn" (with `oncePerTurn: "ifDone"`). */
  doneOncePerTurn: { op: "doneOncePerTurn" } as Effect,
  exileUntil: (filter: ObjectFilter, store: string): Effect => ({ op: "exileUntil", filter, store }),
  /** Each designated player exiles the top of their library until a total mana value of N or more. */
  exileUntilTotalManaValue: (who: Ref, n: number, store: string): Effect => ({
    op: "exileUntil",
    filter: {},
    store,
    who,
    untilTotalManaValue: n,
  }),
  setLife: (amount: Amount, who: Ref = ref.you): Effect => ({ op: "setLife", who, amount }),
  /** "You control [the player] during their next turn" (722). */
  /** "You become the monarch" (724). */
  becomeMonarch: (who?: Ref): Effect => ({ op: "becomeMonarch", ...(who ? { who } : {}) }),
  /** Each designated player secretly chooses a number from 0 to `max` (Wheel of Misfortune). */
  chooseNumbers: (who: Ref, store: string, max = 20): Effect => ({ op: "chooseNumbers", who, store, max }),
  /** `thenExtraTurn`: "after that turn, that player takes an extra turn" (Emrakul, the Promised End). */
  controlNextTurn: (who: Ref, combatOnly?: boolean, thenExtraTurn?: boolean): Effect => ({
    op: "controlNextTurn",
    who,
    ...(combatOnly ? { combatOnly } : {}),
    ...(thenExtraTurn ? { thenExtraTurn } : {}),
  }),
  /** The card or spell is exiled and becomes plotted. */
  plot: (what: Ref): Effect => ({ op: "plot", what }),
  addManaColorsAmong: (filter: ObjectFilter): Effect => ({ op: "addManaColorsAmong", filter }),
  mayShuffleHandGraveyardDraw: (n = 7): Effect => ({ op: "mayShuffleHandGraveyardDraw", n }),
  coinFlip: (store: string): Effect => ({ op: "coinFlip", store }),
  /** "Flip a coin for each [object]": those whose coin comes up tails are stored (`ref.stored(store)`). */
  coinFlipEach: (each: Ref, store: string): Effect => ({ op: "coinFlip", store, each }),
  /** "Roll an N-sided die" (706): the result is stored (Ancient Copper Dragon: a d20). */
  rollDie: (sides: number, store: string): Effect => ({ op: "coinFlip", store, sides }),
  /** "… additional upkeep steps after this phase" (Obeka); `afterStep`: "after this step" (Paradox Haze). */
  extraUpkeeps: (amount: Amount, afterStep = false): Effect => ({
    op: "extra",
    kind: "upkeep",
    amount,
    ...(afterStep ? { after: "step" as const } : {}),
  }),
  plotOnResolve: (what: Ref): Effect => ({ op: "spellFate", fate: "plot", what }),
  flickerChosen: (filter: ObjectFilter, times: Amount): Effect => ({ op: "flickerChosen", filter, times }),
  exchangeControl: (a: Ref, b: Ref): Effect => ({ op: "exchangeControl", a, b }),
  /**
   * Gains control as long as you control the source; `restrict`: it can't attack or block (Possession Engine);
   * `remains`: as long as the source remains on the battlefield, whoever controls it (Cytoplast Manipulator).
   */
  gainControlWhileSource: (what: Ref, restrict = false, remains = false): Effect[] => [
    { op: "gainControl", what, duration: remains ? "whileSource" : "whileYouControlSource" },
    ...(restrict
      ? [
          {
            op: "modify",
            what,
            mods: { addKeywords: ["cantAttack", "cantBlock"] },
            duration: "permanent",
            while: "source",
          } as Effect,
        ]
      : []),
  ],
  /** "The base P/T of … becomes N"; `powerOnly`: only the base power (PuPu UFO). */
  setBasePTAll: (filter: ObjectFilter, amount: Amount, powerOnly?: boolean): Effect => ({
    op: "setBasePTAll",
    filter,
    amount,
    powerOnly,
  }),
  copyNextExhaust: { op: "playerEffect", ability: { copyNextExhaust: true }, once: true } as Effect,
  chooseCardName: { op: "chooseCardName" } as Effect,
  exileNamed: (who: Ref, max: number): Effect => ({ op: "exileNamed", who, max }),
  /** Deadly Cover-Up: a card from an opponent's graveyard, and all cards with the same name (graveyard, hand, library). */
  exileNamesakes: { op: "exileNamesakes" } as Effect,
  /** The End: exiles the designated permanent and cards with the same name (graveyard, hand, library of its controller). */
  exileWithNamesakes: (of: Ref): Effect => ({ op: "exileNamesakes", of, draw: true }),
  /** Surgical Extraction: the designated graveyard card and cards with the same name (graveyard, hand, library of its owner). */
  exileCardAndNamesakes: (of: Ref): Effect => ({ op: "exileNamesakes", of }),
  /**
   * "Choose [a creature type, a color, a name, a mode…]" for the source: as it enters (in `asEnters`, 614.12) or by a
   * triggered ability ("when this land enters, choose a land card name").
   * `options`: the only allowed choices (Thriving Grove: a color other than green; Sieges: Abzan or Mardu).
   */
  chooseForSelf: (
    kind: Extract<Effect, { op: "chooseOnEnter" }>["kind"],
    opts: { options?: string[]; optionsFrom?: Ref; secret?: boolean; who?: Ref; control?: boolean } = {},
  ): Effect => ({ op: "chooseOnEnter", kind, ...opts }),
  /**
   * "You may have [this permanent] enter as a copy of [filter]" (707.9, in `asEnters`): see the `chooseCopy` effect
   * ("you may": `optional`, the case of every card so far).
   */
  /** "As [this] enters, you may exchange its text box and another creature's" (in `asEnters`, Deadpool). */
  exchangeTextBox: { op: "exchangeTextBox" } as Effect,
  chooseCopy: (filter: ObjectFilter, opts: Omit<Extract<Effect, { op: "chooseCopy" }>, "op" | "filter"> = {}): Effect => ({
    op: "chooseCopy",
    filter,
    optional: true,
    ...opts,
  }),
  /** Devour N (702.82, in `asEnters`); read from the text ("Devour 2"). */
  devour: (filter: ObjectFilter, n: number, opts: { graveyardUpToX?: boolean } = {}): Effect => ({
    op: "devour",
    filter,
    n,
    ...opts,
  }),
  payCostOf: (what: Ref, store: string, prompt: string): Effect => ({ op: "payCostOf", what, store, prompt }),
  reduceSpeed: (who: Ref): Effect => ({ op: "reduceSpeed", who }),
  /** "[This Mount] becomes saddled until end of turn". */
  saddle: (what: Ref = ref.self): Effect => ({ op: "saddle", what }),
  /** "[This Vehicle] becomes an artifact creature until end of turn". */
  animateVehicle: (what: Ref = ref.self): Effect => ({
    op: "modify",
    what,
    mods: { addTypes: ["Artifact", "Creature"] },
    duration: "endOfTurn",
  }),
  exileFromOwnHand: (who: Ref, store: string): Effect => ({ op: "exileFromOwnHand", who, store }),
  /**
   * Manifest (701.40, under your control unless `ownerControl`: Yarus) or cloak (701.58, `ward`: 2/2 with ward {2})
   * the designated cards; `store`: the face-down creatures (Cryptic Coat: "then attach this Equipment to it").
   */
  putFaceDown: (what: Ref, ward = false, opts: { store?: string; ownerControl?: boolean } = {}): Effect => ({
    op: "moveTo",
    what,
    spec: {
      to: "battlefield",
      as: ward ? "cloak" : "manifest",
      ...(ward || opts.ownerControl ? {} : { underYourControl: true }),
    },
    ...(opts.store ? { store: { name: opts.store } } : {}),
  }),
  /** Cloak (701.58): face down, 2/2 with ward {2}; `store`: the creatures created this way. */
  cloak: (what: Ref, store?: string): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "battlefield", as: "cloak" },
    ...(store ? { store: { name: store } } : {}),
  }),
  manifestDread: { op: "manifestDread" } as Effect,
  revealFaceDown: (what: Ref): Effect => ({ op: "revealFaceDown", what }),
  eachOfDealsDamage: (from: Ref, to: Ref): Effect => ({ op: "eachDealsDamage", filter: {}, to, from }),
  /** Room: "unlock a locked door" / "lock or unlock a door" of one of the designated Rooms. */
  door: (what: Ref, mode: "unlock" | "toggle" = "unlock"): Effect => ({ op: "door", what, mode }),
  /** "[That player] manifests dread [N times]"; `store`: the face-down creatures ("then attach this Equipment to it"). */
  manifestDreadBy: (opts: { who?: Ref; times?: Amount; store?: string }): Effect => ({ op: "manifestDread", ...opts }),
  /** "[creature] explores" (701.44), `times` times. */
  explore: (what: Ref = ref.self, times?: Amount): Effect => ({ op: "explore", what, times }),
  /** "… for as long as [this source] remains on the battlefield" (Kitesail Larcenist). */
  modifyWhileSource: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "source",
  }),
  /** "… for as long as you control [this source]" (Ty Lee, Spider-Woman). */
  modifyWhileYouControl: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "youControlSource",
  }),
  /** "… for as long as it remains tapped": for each affected object, until it untaps (Braided Net). */
  modifyWhileAffectedTapped: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "tapped",
  }),
  /** Tishana's Tidebinder: counters the ability; its permanent loses its abilities as long as the source remains. */
  counterAbilitySilence: (what: Ref): Effect => ({ op: "counterAbilitySilence", what }),
  /** "[This spell] gains rebound" (Ojer Pakpatiq). */
  grantRebound: (what: Ref): Effect => ({ op: "spellFate", fate: "rebound", what }),
  exileOnResolveWith: (what: Ref, counter: string): Effect => ({ op: "spellFate", fate: "exile", what, counter }),
  /** Sovereign Okinec Ahau: +1/+1 counters equal to the difference between power and base power. */
  countersAboveBase: (filter: ObjectFilter): Effect => ({ op: "countersAboveBase", filter }),
  /** Discover N (701.57); `who`: "that player discovers N"; `store`: the discovered card. */
  discover: (n: Amount, opts: { who?: Ref; store?: string } = {}): Effect => ({ op: "discover", n, ...opts }),
  /** "Suspect [the creature]" (701.60); `value: false`: "it's no longer suspected". */
  suspect: (what: Ref, value = true): Effect => ({ op: "suspect", what, value }),
  /** Cascade (702.85): `n` is the mana value of the spell with cascade. */
  cascade: (n: Amount, filter?: ObjectFilter): Effect => ({ op: "discover", n, cascade: true, ...(filter ? { filter } : {}) }),
  /** "[creature] connives" (701.50). */
  connive: (what: Ref = ref.self, n?: Amount): Effect => ({ op: "connive", what, ...(n !== undefined ? { n } : {}) }),
  /** `orExileStore`: otherwise (instant or sorcery), the card is exiled and stored (Etrata). */
  turnFaceUp: (what: Ref, orExileStore?: string): Effect => ({
    op: "turnFaceUp",
    what,
    ...(orExileStore ? { orExileCast: true, store: orExileStore } : {}),
  }),
  /** "Transform [this permanent]" (front ↔ back). */
  transform: (what: Ref = ref.self): Effect => ({ op: "transform", what }),
  /** "Exile them, then meld them": the source and a permanent named `with`, into their melded card. */
  meld: (withName: string): Effect => ({ op: "meld", with: withName }),
  becomeCopy: (
    what: Ref,
    of: Ref,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" = "endOfTurn",
    /** `except`: copy exceptions (707.9b: name, types, P/T…), Absorbing Man, Taskmaster. */
    opts: { addKeywords?: Keyword[]; keepAbilities?: number[]; ifManaValue?: Amount; except?: LayerMods } = {},
  ): Effect => ({
    op: "becomeCopy",
    what,
    of,
    duration,
    ...opts,
  }),
  /** Continuous effect that ends when the designated card leaves exile ("until that card is cast from exile"). */
  modifyWhileExiled: (what: Ref, mods: LayerMods, card: Ref): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: { exiled: card },
  }),
  giveControl: (what: Ref, to: Ref): Effect => ({ op: "gainControl", what, to, duration: "permanent" }),
  /** Each designated object returns to its owner's control. */
  returnControlToOwners: (what: Ref): Effect => ({ op: "gainControl", what, to: "owner", duration: "permanent" }),
  untapUpTo: (filter: ObjectFilter, n: number): Effect => ({ op: "untapUpTo", filter, n }),
  exileOnResolve: { op: "spellFate", fate: "exile" } as Effect,
  /** "Put [this spell] on the bottom of its owner's library" (Ultimate Nullification). */
  bottomOnResolve: { op: "spellFate", fate: "bottom" } as Effect,
  poison: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n }),
  /** "[The player] gets N rad counters" (Fallout). */
  rad: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n, counter: "rad" }),
  /** Destroys the object and all other permanents with the same name (Maelstrom Pulse). */
  destroySameName: (what: Ref): Effect => ({ op: "destroy", what: { kind: "sameName", ref: what, zone: "battlefield" } }),
  countersDivided: (total: Amount, to: Ref, opts: { counter?: string; anyNumber?: boolean } = {}): Effect => ({
    op: "countersDivided",
    total,
    to,
    ...opts,
  }),
  /** "Pay {X}" (`max`: "pay {1} up to N times"): X stored under `store`. */
  payX: (prompt: string, store: string, max?: Amount): Effect => ({
    op: "payX",
    prompt,
    store,
    ...(max !== undefined ? { max } : {}),
  }),
  /** "Pay any amount of life": X stored under `store`. */
  payLifeX: (prompt: string, store: string, who?: Ref): Effect => ({
    op: "payX",
    prompt,
    store,
    life: true,
    ...(who ? { who } : {}),
  }),
  /** "When you next cast a spell this turn, …": the spell is `ref.target("s")` (Codie). */
  whenNextSpellThisTurn: (effects: Effects): Effect => ({
    op: "playerEffect",
    ability: { nextSpell: { trigger: effects.flat() } },
    once: true,
  }),
  changeTarget: (what: Ref): Effect => ({ op: "changeTarget", what }),
  /** "After this phase, there is an additional combat phase." */
  extraCombat: { op: "extra", kind: "combat" } as Effect,
  /** "After this main phase, there are N additional combat phases" (with no main phase between them). */
  extraCombatsAfterMain: (n: number): Effect => ({ op: "extra", kind: "combat", amount: n, after: "main" }),
  /** "An additional combat phase after this main phase, followed by an additional main phase." */
  extraCombatAfterMain: { op: "extra", kind: "combatAfterMain" } as Effect,
  extraTurn: { op: "extra", kind: "turn" } as Effect,
  /** "There is an additional beginning phase after this phase" (untap, upkeep, draw: Sphinx of the Second Sun). */
  extraBeginningPhase: { op: "extra", kind: "beginning" } as Effect,
  tripleTriad: { op: "tripleTriad" } as Effect,
  unattach: (what: Ref, ifAttachedTo?: Ref): Effect => ({ op: "unattach", what, ifAttachedTo }),
  resolveToBattlefieldTransformed: { op: "spellFate", fate: "battlefieldTransformed" } as Effect,
  /** "The next [filter] creature spell you cast this turn": counters, haste, free (`free`). */
  nextCreatureSpell: (
    opts: { counters?: number; haste?: boolean; free?: boolean },
    filter: ObjectFilter = { types: ["Creature"] },
  ): Effect => ({
    op: "playerEffect",
    ability: { nextSpell: { filter, ...opts } },
    once: true,
  }),
  spellArrivalCounters: (what: Ref, amount: Amount): Effect => ({ op: "spellArrivalCounters", what, amount }),
  /** "Until your next turn, damage dealt to that player or their permanents is doubled" (Lightning). */
  doubleDamageTo: (who: Ref): Effect => ({
    op: "playerEffect",
    ability: { replacement: { event: "damage", to: "yourSide", modify: { times: 2 } } },
    who,
    duration: "untilYourNextTurn",
  }),
  /** "Prevent all damage that would be dealt to creatures you control this turn" (Summon: Alexander). */
  preventDamageToYourCreatures: {
    op: "playerEffect",
    ability: { replacement: { event: "damage", to: "yourSide", toFilter: { types: ["Creature"] }, modify: { prevent: true } } },
  } as Effect,
  /** Shield (615.7): "the next time [a source of your choice] would… this turn, …" (New Way Forward). */
  shield: (replacement: EventReplacement, chooseSource = false): Effect => ({ op: "shield", replacement, chooseSource }),
  extraEndStep: { op: "extra", kind: "endStep" } as Effect,
  /** `amount`: each deals that much damage (otherwise its power). */
  eachDealsDamage: (filter: ObjectFilter, to: Ref, amount?: Amount): Effect => ({
    op: "eachDealsDamage",
    filter,
    to,
    ...(amount !== undefined ? { amount } : {}),
  }),
  addManaUntilEndOfTurn: (...mana: ManaType[]): Effect => ({ op: "addManaUntilEndOfTurn", mana }),
  /** Mana that stays until end of combat, `times` times (firebending). */
  addManaUntilEndOfCombat: (mana: ManaType[], times?: Amount): Effect => ({
    op: "addManaUntilEndOfTurn",
    mana,
    untilEndOfCombat: true,
    ...(times !== undefined ? { times } : {}),
  }),
  copyNextSpell: {
    op: "playerEffect",
    ability: { nextSpell: { filter: { types: ["Instant", "Sorcery"] }, copy: true } },
    once: true,
  } as Effect,
  winGame: { op: "winGame" } as Effect,
  loseGame: { op: "loseGame" } as Effect,
  /** "That player loses the game" (Summon: Primal Odin). */
  playerLoses: (who: Ref): Effect => ({ op: "loseGame", who }),
  countResolution: (store: string): Effect => ({ op: "countResolution", store }),
  /**
   * Steel Hellkite: "destroy each nonland permanent with mana value X whose controller was dealt combat damage by this
   * creature this turn" (the turn log, damage dealt by the source).
   */
  hellkite: {
    op: "destroy",
    what: {
      kind: "zone",
      zone: "battlefield",
      who: {
        kind: "playersWhere",
        of: { kind: "eachPlayer" },
        where: {
          kind: "amountAtLeast",
          amount: { kind: "turnEvents", query: { event: "damage", who: "you", combat: true, toPlayer: true, self: "source" } },
          n: 1,
        },
      },
      filter: { notTypes: ["Land"], compare: [{ what: "manaValue", cmp: "=", to: { kind: "x" } }] },
    },
  } as Effect,
  link: (what: Ref, to?: Ref): Effect => ({ op: "link", what, to }),
  /** "That player chooses one of them": `ref.stored(store)` the chosen one, `ref.stored(store + "Rest")` the others. */
  chooseAmong: (
    what: Ref,
    chooser: Ref,
    store: string,
    opts: {
      anyNumber?: boolean;
      max?: number;
      anyZone?: boolean;
      prompt?: string;
      optional?: boolean;
      random?: boolean;
    } = {},
  ): Effect => ({
    op: "chooseAmong",
    what,
    chooser,
    store,
    ...opts,
  }),
  /**
   * "Choose an opponent" ("another player"), without targeting: the controller chooses, or chance (`random`);
   * `ref.stored(store)` designates them afterwards. No question with a single opponent; suggestion: the next opponent in
   * turn order.
   */
  chooseOpponent: (store: string, opts: { random?: boolean; prompt?: string } = {}): Effect => ({
    op: "chooseAmong",
    what: { kind: "eachOpponent" },
    chooser: { kind: "you" },
    store,
    prompt: opts.prompt ?? msg("Choose an opponent"),
    ...(opts.random ? { random: true } : {}),
  }),
  /** "You may pay N life. If you do, …" */
  mayPayLife: (life: Amount, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    const paid = typeof life === "number" ? { life } : { lifeAmount: life };
    return [{ op: "mayPay", cost: { generic: 0, colored: {}, x: 0 }, ...paid, prompt, skip: flat.length }, ...flat];
  },
  /** Damage divided among the designated targets. */
  damageDivided: (total: Amount, to: Ref): Effect => ({ op: "damageDivided", total, to }),
  /** "You get an emblem with …" */
  emblem: (
    name: string,
    text: string,
    abilities: AbilityDef[],
    untilYourNextTurn?: boolean,
    thisTurn?: boolean,
    store?: string,
    untilEndOfYourNextTurn?: boolean,
  ): Effect => ({
    op: "emblem",
    name,
    text,
    abilities,
    store,
    ...(untilYourNextTurn
      ? { duration: "untilYourNextTurn" }
      : thisTurn
        ? { duration: "endOfTurn" }
        : untilEndOfYourNextTurn
          ? { duration: "endOfYourNextTurn" }
          : {}),
  }),
  addManaTimes: (times: Amount, ...mana: ManaType[]): Effect => ({ op: "addMana", mana, times }),
  mayWheel: { op: "mayWheel" } as Effect,
  exileFromHandLinked: (who: Ref, filter: ObjectFilter, untilLeaves?: boolean, reveal?: Amount, optional?: boolean): Effect => ({
    op: "exileFromHandLinked",
    who,
    filter,
    untilLeaves,
    reveal,
    ...(optional ? { optional } : {}),
  }),
  /** Exiles face down (nobody looks at them) the whole library except the bottom `keep` cards. */
  exileLibraryButBottom: (who: Ref, keep = 1): Effect => ({ op: "exileTop", who, allBut: keep, faceDown: "nobody" }),
  /** Attaches an Aura or an Equipment (the source by default) to the designated permanent. */
  attach: (to: Ref, what: Ref = ref.self, store?: string): Effect => ({ op: "attach", what, to, store }),
  /** Attaches to one of the designated objects or players, chosen at random (Maddening Hex). */
  attachRandom: (to: Ref, what: Ref = ref.self): Effect => ({ op: "attach", what, to, random: true }),
  /** "… becomes prepared" / "… becomes unprepared" (Reality Fracture). */
  prepare: (what: Ref, value = true): Effect => ({ op: "prepare", what, value }),
  prepareAll: (filter: ObjectFilter, value = true): Effect => ({ op: "prepare", filter, value }),
  instantJaceLoyalty: { op: "playerEffect", ability: { jaceLoyaltyInstant: true } } as Effect,
  proliferate: (times: Amount = 1, what?: Ref): Effect => ({ op: "proliferate", times, ...(what ? { what } : {}) }),
  removeCounters: (what: Ref, n: Amount, kind?: string, store?: string): Effect => ({
    op: "removeCounters",
    what,
    n,
    kind,
    store,
  }),
  extraLandThisTurn: { op: "playerEffect", ability: { extraLands: 1 } } as Effect,
  nextSpellUncounterable: { op: "playerEffect", ability: { nextSpell: { uncounterable: true } }, once: true } as Effect,
  tap: (what: Ref): Effect => ({ op: "tap", what }),
  /** "Look at [these cards]" (only the controller sees them); `random`: that many at random ("a card at random"). */
  look: (what: Ref, random?: number): Effect => ({ op: "look", what, ...(random !== undefined ? { random } : {}) }),
  /** "Reveal [these cards]": shown to all players. */
  reveal: (what: Ref): Effect => ({ op: "look", what, reveal: true }),
  /** Soulbond (702.95): pairs the two creatures. */
  pair: (what: Ref, withRef: Ref): Effect => ({ op: "pair", what, with: withRef }),
  /** "Remove [the creature] from combat" (506.4). */
  removeFromCombat: (what: Ref): Effect => ({ op: "removeFromCombat", what }),
  untap: (what: Ref): Effect => ({ op: "tap", what, untap: true }),
  counters: (what: Ref, kind: string, n: Amount = 1): Effect => ({ op: "addCounters", what, amount: n, kind }),
  damageAll: (n: Amount, filter?: ObjectFilter, players?: Ref, source?: Ref): Effect => ({
    op: "damageAll",
    amount: n,
    filter,
    players,
    source,
  }),
  destroyAll: (filter: ObjectFilter, store?: string, noRegenerate?: boolean): Effect => ({
    op: "destroy",
    what: allMatching(filter),
    store,
    ...(noRegenerate ? { noRegenerate } : {}),
  }),
  addCountersAll: (filter: ObjectFilter, n: Amount = 1, kind?: string): Effect => ({
    op: "addCounters",
    what: allMatching(filter),
    amount: n,
    kind,
  }),
  modifyAll: (filter: ObjectFilter, mods: LayerMods, duration: "endOfTurn" | "untilYourNextTurn" = "endOfTurn"): Effect => ({
    op: "modify",
    what: allMatching(filter),
    mods,
    duration,
  }),
  sacrificeIt: (what: Ref): Effect => ({ op: "sacrificeIt", what }),
  moveTo: (what: Ref, spec: MoveSpec, store?: { name: string; filter?: ObjectFilter }, attachTo?: Ref): Effect => ({
    op: "moveTo",
    what,
    spec,
    store,
    ...(attachTo ? { attachTo } : {}),
  }),
  /** Returns to hand (from any zone). */
  toHand: (what: Ref): Effect => ({ op: "moveTo", what, spec: { to: "hand" } }),
  /** Puts onto the battlefield (from the graveyard, exile…). */
  toBattlefield: (what: Ref, spec: Omit<MoveSpec, "to"> = {}): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "battlefield", ...spec },
  }),
  exileCard: (what: Ref, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "exile" },
    store,
  }),
  moveAll: (
    from: "battlefield" | "graveyard" | "hand",
    whose: Ref,
    filter: ObjectFilter,
    spec: MoveSpec,
    store?: string,
  ): Effect => ({
    store,
    op: "moveAll",
    from,
    whose,
    filter,
    spec,
  }),
  shuffle: (who: Ref = ref.you): Effect => ({ op: "shuffle", who }),
  lookAtTop: (
    n: Amount,
    opts: {
      filter?: ObjectFilter;
      count?: Amount;
      to?: MoveSpec;
      /** `reorder`: the rest is put back on top in the order of your choice; `top`: it stays there, in the same order. */
      rest?: "bottom" | "graveyard" | "top" | "reorder" | "hand";
      maxManaValue?: Amount;
      maxTotalManaValue?: number;
      store?: string;
      /** Exactly `count` cards ("put one of them into your hand"), not "up to". */
      exact?: boolean;
      /** Another player's library (Black Cat: a targeted opponent). */
      who?: Ref;
      /** The cards taken are picked at random (Getaway Barrel). */
      random?: boolean;
      /** One card per card type at most (Atraxa, Grand Unifier). */
      onePerType?: boolean;
      /** The owner of the library chooses ("each player looks at …", with `who`). */
      chooser?: "owner";
    } = {},
  ): Effect => ({
    op: "lookAtTop",
    n,
    ...(opts.who ? { who: opts.who } : {}),
    ...(opts.chooser ? { chooser: opts.chooser } : {}),
    ...(opts.random ? { random: true } : {}),
    ...(opts.onePerType ? { onePerType: true } : {}),
    filter: opts.filter,
    count: opts.count ?? 1,
    to: opts.to ?? { to: "hand" },
    rest: opts.rest ?? "bottom",
    maxTotalManaValue: opts.maxTotalManaValue,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    exact: opts.exact,
  }),
  /** `toHand`: the cards return to their owner's hand, and graveyard cards can be exiled. */
  exileUntilLeaves: (what: Ref, toHand?: boolean): Effect => ({ op: "exileUntilLeaves", what, ...(toHand ? { toHand } : {}) }),
  /** Choose (without targeting) cards from your graveyard or your hand. */
  pickFromZone: (
    zone: "graveyard" | "hand",
    filter: ObjectFilter,
    to: MoveSpec,
    opts: {
      count?: Amount;
      min?: number;
      prompt?: string;
      excludeStored?: string;
      maxManaValue?: Amount;
      store?: string;
      pool?: Ref;
      random?: boolean;
      onePerColorOf?: ObjectFilter;
      differentNames?: boolean;
      who?: Ref;
    } = {},
  ): Effect => ({
    op: "pickFromZone",
    ...(opts.who ? { who: opts.who } : {}),
    zone,
    filter,
    to,
    count: opts.count ?? 1,
    min: opts.min,
    prompt: opts.prompt,
    excludeStored: opts.excludeStored,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    pool: opts.pool,
    random: opts.random,
    onePerColorOf: opts.onePerColorOf,
    ...(opts.differentNames ? { distinct: "name" as const } : {}),
  }),
  topOrBottom: (what: Ref, topDamage?: number, fromTop?: number): Effect => ({
    op: "libraryTopOrBottom",
    what,
    topDamage,
    ...(fromTop ? { fromTop } : {}),
  }),
  /** "… loses N life unless they discard a card / sacrifice a permanent" */
  punisher: (
    who: Ref,
    loseLife: number,
    opts: { discard?: boolean; sacrifice?: ObjectFilter; damage?: Amount; times?: Amount } = {},
  ): Effect => ({
    op: "punisher",
    who,
    loseLife,
    ...opts,
  }),
  /** Reveals until a matching card, puts it into `to`, the rest on the bottom in a random order. */
  revealUntil: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }): Effect => ({ op: "revealUntilN", filter, n: 1, to }),
  doubleAllCounters: (what: Ref): Effect => ({ op: "doubleCounters", what, all: true }),
  search: (
    filter: ObjectFilter,
    to: MoveSpec = { to: "hand" },
    count: Amount = 1,
    who?: Ref,
    store?: string,
    manaValue?: Amount,
    /** "Search your library and/or graveyard": one choice among both zones. */
    alsoGraveyard?: boolean,
  ): Effect => ({
    op: "search",
    filter,
    count,
    to,
    who,
    store,
    manaValue,
    ...(alsoGraveyard ? { alsoGraveyard } : {}),
  }),
  copyToken: (
    of: Ref,
    opts: {
      count?: Amount;
      /** The players who each create the tokens (Fractured Identity). */
      for?: Ref;
      addKeywords?: Keyword[];
      addSubtypes?: string[];
      sacrificeAtEndStep?: boolean;
      exileAtEndStep?: boolean;
      addAbilities?: AbilityDef[];
      legendary?: boolean;
      nonlegendary?: boolean;
      store?: string;
      tapped?: boolean;
      attacking?: boolean | Ref;
      attackEach?: Ref;
      /** With `attackEach`: "you may", for each player (myriad). */
      optional?: boolean;
      atEndOfCombat?: "exile" | "sacrifice";
      addTypes?: CardType[];
      pt?: number | { power: Amount; toughness: Amount };
      setColors?: Color[];
      addColors?: Color[];
      setSubtypes?: string[];
      equipDiscount?: number;
      sacrificeAtNextUpkeep?: boolean;
    } = {},
  ): Effect => {
    const { sacrificeAtEndStep, exileAtEndStep, atEndOfCombat, sacrificeAtNextUpkeep, ...rest } = opts;
    const atEnd: CopyFate | undefined = atEndOfCombat
      ? { fate: atEndOfCombat, at: "endOfCombat" }
      : sacrificeAtNextUpkeep
        ? { fate: "sacrifice", at: "nextUpkeep" }
        : exileAtEndStep
          ? "exile"
          : sacrificeAtEndStep
            ? "sacrifice"
            : undefined;
    return { op: "copyToken", of, ...rest, ...(atEnd ? { atEnd } : {}) };
  },
  /** Delayed ability "at the beginning of the next end step". `bind` fixes references now. */
  delayed: (effects: Effects, bind?: Record<string, Ref>, vars?: Record<string, Amount>): Effect => ({
    op: "delayed",
    at: "nextEndStep",
    effects: effects.flat(),
    bind,
    vars,
  }),
  /** Delayed ability at another time: end step of your next turn, end of combat. */
  delayedAt: (
    at: "yourNextEndStep" | "yourEndStep" | "endOfCombat" | "nextUpkeep" | "yourNextUpkeep" | "yourNextMain",
    effects: Effects,
    bind?: Record<string, Ref>,
    vars?: Record<string, Amount>,
  ): Effect => ({
    op: "delayed",
    at,
    effects: effects.flat(),
    bind,
    ...(vars ? { vars } : {}),
  }),
  /**
   * Delayed ability "when [the designated object] … this turn" (603.7c): `trigger` on an event that concerns one of the
   * objects of `watch` (fixed now), each time until end of turn; `ref.eventObject` is that object there. A watched
   * player: the events that concern them ("whenever a creature you control deals combat damage to that player this
   * turn").
   */
  whenThisTurn: (
    trigger: TriggerSpec,
    watch: Ref,
    effects: Effects,
    opts: { targets?: TargetSpec[]; bind?: Record<string, Ref>; label?: string; until?: "theirNextTurn" } = {},
  ): Effect => ({
    op: "delayed",
    at: "thisTurn",
    on: trigger,
    watch,
    effects: effects.flat(),
    ...(opts.bind ? { bind: opts.bind } : {}),
    ...(opts.targets ? { targets: opts.targets } : {}),
    ...(opts.label ? { label: opts.label } : {}),
    ...(opts.until ? { until: opts.until } : {}),
  }),
  /**
   * Delayed ability "when [the designated object] …" without a duration (603.7c): like `whenThisTurn`, but it triggers
   * only once, the next time the event happens, whatever the turn (Ugin, the Ineffable).
   */
  whenNext: (
    trigger: TriggerSpec,
    watch: Ref,
    effects: Effects,
    opts: { targets?: TargetSpec[]; bind?: Record<string, Ref>; label?: string } = {},
  ): Effect => ({
    op: "delayed",
    at: "next",
    on: trigger,
    watch,
    effects: effects.flat(),
    ...(opts.bind ? { bind: opts.bind } : {}),
    ...(opts.targets ? { targets: opts.targets } : {}),
    ...(opts.label ? { label: opts.label } : {}),
  }),
  reflexive: (
    targets: TargetSpec[],
    effects: Effects,
    bind?: Record<string, Ref>,
    keepVars?: string[],
    vars?: Record<string, Amount>,
  ): Effect => ({
    op: "reflexive",
    targets,
    effects: effects.flat(),
    bind,
    ...(keepVars ? { keepVars } : {}),
    ...(vars ? { vars } : {}),
  }),
  /** "When you do, choose one —": modal reflexive ability, the mode chosen when it is put on the stack (Hylda). */
  reflexiveModal: (modes: ModeDef[]): Effect => ({ op: "reflexive", targets: [], effects: [], modes }),
  /** "Draw N cards, then discard N cards." */
  loot: (n = 1): Effect[] => [
    { op: "draw", who: ref.you, amount: n },
    { op: "discard", who: ref.you, amount: n },
  ],
  /** "You may forage. If you do, …" (701.61: exile three cards from your graveyard or sacrifice a Food). */
  mayForage: (_prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "forage", skip: flat.length }, ...flat];
  },
  /** "You may collect evidence N. If you do (when you do), …" (701.59). */
  mayCollectEvidence: (n: Amount, opts: { exclude?: Ref }, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "collectEvidence", n, skip: flat.length, ...opts }, ...flat];
  },
  /** "You may collect evidence X. When you do, … X …": X is stored in `store`. */
  mayCollectEvidenceX: (store: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "collectEvidence", skip: flat.length, store }, ...flat];
  },
  /** "You may pay [mana] and N life. If you do, …" */
  mayPayWithLife: (mana: string, life: number, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "mayPay", cost: parseManaCost(mana), life, prompt, skip: flat.length }, ...flat];
  },
  /** Untaps the matching permanents you control. */
  untapAll: (filter: ObjectFilter): Effect => ({
    op: "tap",
    what: { kind: "zone", zone: "battlefield", who: { kind: "you" }, filter },
    untap: true,
  }),
  portent: { op: "portent" } as Effect,
  drain: (n: Amount, who: Ref = ref.eachOpponent): Effect[] => [
    { op: "loseLife", who, amount: n },
    { op: "gainLife", who: ref.you, amount: n },
  ],
};

/** List of effects, where `fx.may(...)` may appear as is (it is flattened). */
export type Effects = (Effect | Effect[])[];

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
export function escalate(cost: string, ...modes: { label: string; targets?: TargetSpec[]; effects: Effects }[]): SpellDef {
  const each = parseManaCost(cost);
  const out: ModeDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const chosen = modes.filter((_, i) => mask & (1 << i));
    const n = chosen.length - 1;
    const colored: ManaCost["colored"] = {};
    for (const [k, v] of Object.entries(each.colored)) colored[k as ManaType] = (v ?? 0) * n;
    out.push({
      label: joinLabels(chosen.map((m) => m.label)),
      targets: chosen.flatMap((m) => m.targets ?? []),
      effects: chosen.flatMap((m) => m.effects.flat()),
      ...(n > 0 ? { extraCost: { generic: each.generic * n, colored, x: 0 } } : {}),
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
      waterbend: opts.waterbend,
      ...(opts.convoke ? { convoke: true } : {}),
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

/** What is dealt damage by a `dealsDamage` / `dealsCombatDamage` trigger (`to`). */
export const TO_PLAYER: TargetFilter = { players: "any" };
export const TO_OPPONENT: TargetFilter = { players: "opponent" };
export const TO_PLAYER_OR_PLANESWALKER: TargetFilter = { players: "any", objects: { types: ["Planeswalker"] } };
export const TO_CREATURE: TargetFilter = { objects: { types: ["Creature"] } };

/** Common triggers. */
export const when = {
  /** "When this creature enters the battlefield" */
  entersSelf: { on: "enters", who: "self" } as TriggerSpec,
  /** "When it transforms into [this face]" (to put on the face concerned). */
  transformsSelf: { on: "action", action: "transformed", self: true } as TriggerSpec,
  /** "When this creature becomes monstrous" (701.37b). */
  becomesMonstrous: { on: "action", action: "monstrous", self: true } as TriggerSpec,
  /** "Whenever a(n) [filter] enters the battlefield" */
  enters: (filter: ObjectFilter): TriggerSpec => ({ on: "enters", who: filter }),
  diesSelf: { on: "dies", who: "self" } as TriggerSpec,
  dies: (filter: ObjectFilter): TriggerSpec => ({ on: "dies", who: filter }),
  /** "Whenever a spell or ability an opponent controls destroys [filter]" (Karmic Justice). */
  destroyedByOpponent: (filter: ObjectFilter): TriggerSpec => ({ on: "destroyed", who: filter, byOpponent: true }),
  leavesSelf: { on: "leaves", who: "self" } as TriggerSpec,
  /** "When the linked (chosen) object leaves the battlefield" */
  linkedLeaves: { on: "leaves", who: "linked" } as TriggerSpec,
  /** "Whenever a [creature you control …] leaves the battlefield" (filter seen from the controller of the source). */
  leaves: (who: ObjectFilter): TriggerSpec => ({ on: "leaves", who }),
  /** "Whenever an opponent searches their library" */
  search: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "action", action: "search", whose }),
  opponentLoses: { on: "action", action: "playerLost", whose: "opponent" } as TriggerSpec,
  attacksSelf: { on: "attacks", who: "self" } as TriggerSpec,
  /** "Whenever [this creature] attacks a player" (not a planeswalker). */
  attacksAPlayer: { on: "attacks", who: "self", defending: "player" } as TriggerSpec,
  attacks: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter }),
  /** "Whenever an opponent gains control of a permanent that was yours" */
  opponentGainsControl: { on: "controlChange" } as TriggerSpec,
  /** "Whenever a [filter] creature attacks alone" */
  attacksAlone: (filter: ObjectFilter): TriggerSpec => ({ on: "attacks", who: filter, alone: true }),
  /**
   * "Whenever a [creature] attacks you" (you, not your planeswalkers); `orYourPlaneswalkers`: "… attacks you or a
   * planeswalker you control" (Jace, Reality Sculptor).
   */
  attacksYou: (filter: ObjectFilter, orYourPlaneswalkers = false): TriggerSpec => ({
    on: "attacks",
    who: filter,
    defending: orYourPlaneswalkers ? "youOrYourPlaneswalkers" : "you",
  }),
  /** "Whenever this creature deals combat damage to a player" */
  combatDamageToPlayer: { on: "dealsCombatDamage", who: "self", to: TO_PLAYER } as TriggerSpec,
  castSpell: (
    by: "you" | "opponent" | "any" = "you",
    filter?: ObjectFilter,
    targeting?: Pick<TargetFilter, "objects" | "players"> & { orFilter?: boolean },
  ): TriggerSpec => ({ on: "castSpell", by, filter, targeting }),
  /** "Whenever you cast your Nth spell each turn" */
  castNthSpell: (nth: number): TriggerSpec => ({ on: "castSpell", by: "you", nth }),
  /** "Whenever a player casts a spell, if it's not their turn" */
  castSpellOffTurn: (by: "you" | "opponent" | "any" = "any"): TriggerSpec => ({ on: "castSpell", by, notTheirTurn: true }),
  /** "Whenever a player casts a spell they don't own" */
  castSpellNotOwned: { on: "castSpell", by: "any", notOwned: true } as TriggerSpec,
  /** "Whenever you cast a noncreature spell, if at least N mana was spent to cast it" */
  castNoncreatureWithMana: (n: number): TriggerSpec => ({
    on: "castSpell",
    by: "you",
    filter: { notTypes: ["Creature"] },
    minManaSpent: n,
  }),
  /** "Whenever you commit a crime" */
  crime: { on: "action", action: "crime" } as TriggerSpec,
  /** "When this card becomes plotted" */
  plottedSelf: { on: "action", action: "plotted", self: true } as TriggerSpec,
  /** "Whenever you activate an ability that targets a creature or player" */
  /** "Whenever you activate an ability that targets a creature or player" (Ertha Jo). */
  activateTargeting: {
    on: "activateAbility",
    targeting: { objects: { types: ["Creature"] }, players: "any" },
  } as TriggerSpec,
  /** A card changes zones (see TriggerSpec `zoneChange`). */
  zoneChange: (
    from: Zone[],
    opts: { to?: Zone[]; filter?: ObjectFilter; whose?: "you" | "opponent" | "any"; linked?: boolean } = {},
  ): TriggerSpec => ({
    on: "zoneChange",
    from,
    ...opts,
  }),
  /** "Whenever this creature is dealt damage" */
  isDealtDamage: { on: "isDealtDamage", who: "self" } as TriggerSpec,
  /** "Whenever a [creature you control] is dealt damage" */
  dealtDamage: (who: ObjectFilter): TriggerSpec => ({ on: "isDealtDamage", who }),
  /**
   * "Whenever you are / an opponent is dealt [combat / noncombat] damage", from any source;
   * `combat`: `true` (combat), `false` (noncombat).
   */
  playerDealtDamage: (who: "you" | "opponent", combat?: boolean): TriggerSpec => ({
    on: "isDealtDamage",
    who,
    ...(combat !== undefined ? { combat } : {}),
  }),
  /** "Whenever one or more [creatures] are dealt excess damage" (120.4a). */
  excessDamage: (who: ObjectFilter, noncombatOnly = false): TriggerSpec => ({
    on: "isDealtDamage",
    who,
    excess: true,
    ...(noncombatOnly ? { combat: false } : {}),
  }),
  /** "Whenever the enchanted (or equipped) creature is dealt damage" */
  attachedIsDealtDamage: { on: "isDealtDamage", who: "attached" } as TriggerSpec,
  /** "Whenever one or more [creatures] deal combat damage to a player" */
  combatDamageBatch: (who: ObjectFilter, toYou?: boolean): TriggerSpec => ({
    on: "combatDamageBatch",
    who,
    ...(toYou ? { to: { players: "you" } } : {}),
  }),
  /** "When this permanent is put into a graveyard from the battlefield" */
  putIntoGraveyardSelf: { on: "leaves", who: "self", to: "graveyard" } as TriggerSpec,
  blocks: (who: "self" | ObjectFilter, attacker?: ObjectFilter): TriggerSpec => ({ on: "blocks", who, attacker }),
  /** "Whenever [creature] dies or is exiled" */
  diesOrExiled: (who: "self" | ObjectFilter, minPower?: number): TriggerSpec => ({ on: "diesOrExiled", who, minPower }),
  /** "Whenever you play a land" */
  playLand: { on: "playLand" } as TriggerSpec,
  /** "Whenever you discard one or more cards" (`amount.eventAmount`: their number). */
  discardBatch: (whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "discardBatch", whose }),
  yourUpkeep: { on: "step", step: "upkeep", whose: "you" } as TriggerSpec,
  yourEndStep: { on: "step", step: "end", whose: "you" } as TriggerSpec,
  eachEndStep: { on: "step", step: "end", whose: "any" } as TriggerSpec,
  yourCombat: { on: "step", step: "beginCombat", whose: "you" } as TriggerSpec,
  landfall: { on: "landfall" } as TriggerSpec,
  gainLife: { on: "life", change: "gain" } as TriggerSpec,
  /** "Whenever you gain life for the first time each turn" */
  gainLifeFirst: { on: "life", change: "gain", first: true } as TriggerSpec,
  /** "Whenever you draw a card" / "your Nth card each turn" */
  draw: (nth?: number, whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "draw", whose, nth }),
  /** "Whenever an opponent draws a card except the first one they draw in each of their draw steps" */
  drawExceptTurnDraw: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({
    on: "draw",
    whose,
    exceptTurnDraw: true,
  }),
  loseLife: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "life", change: "loss", whose }),
  /** "Whenever you attack [with N or more creatures]" */
  /** `filter`: "… with one or more [Rats]". */
  attackWith: (min = 1, filter?: ObjectFilter, anyPlayer?: boolean): TriggerSpec => ({
    on: "attackWith",
    min,
    filter,
    ...(anyPlayer ? { anyPlayer } : {}),
  }),
  /**
   * "Whenever an opponent attacks you with N or more creatures" (you, not your planeswalkers);
   * `orYourPlaneswalkers`: "… if N or more attack you and/or your planeswalkers" (Tomik, Mangara).
   */
  opponentAttacksYouWith: (min = 1, orYourPlaneswalkers = false): TriggerSpec => ({
    on: "attackWith",
    min,
    defending: orYourPlaneswalkers ? "youOrYourPlaneswalkers" : "you",
  }),
  countersPut: (who: "self" | ObjectFilter, kind?: string, firstThisTurn?: boolean): TriggerSpec => ({
    on: "countersPut",
    who,
    kind,
    firstThisTurn,
  }),
  /** "Whenever you put one or more counters (of that kind) on …". */
  youPutCounters: (who: ObjectFilter, kind?: string): TriggerSpec => ({ on: "countersPut", who, kind, by: "you" }),
  /** `to`: what is dealt the damage (`TO_OPPONENT`, `TO_CREATURE`…). */
  dealsDamage: (
    who: "self" | ObjectFilter,
    opts: { noncombatOnly?: boolean; to?: TargetFilter; anySourceYouControl?: boolean } = {},
  ): TriggerSpec => ({
    on: "dealsDamage",
    who,
    ...opts,
  }),
  /** `to`: `true` for "to a player", or what is dealt the damage (`TO_PLAYER_OR_PLANESWALKER`…). */
  combatDamage: (who: "self" | ObjectFilter, to: boolean | TargetFilter = false): TriggerSpec => ({
    on: "dealsCombatDamage",
    who,
    ...(to ? { to: to === true ? TO_PLAYER : to } : {}),
  }),
  /** "Whenever a [creature] deals combat damage to one of your opponents" */
  combatDamageToOpponent: (who: "self" | ObjectFilter): TriggerSpec => ({ on: "dealsCombatDamage", who, to: TO_OPPONENT }),
  step: (step: Step, whose: "you" | "opponent" | "any" = "you"): TriggerSpec => ({ on: "step", step, whose }),
  /** "Whenever equipped creature deals combat damage to a player" */
  attachedDealsCombatDamageToPlayer: { on: "dealsCombatDamage", who: { attached: "host" }, to: TO_PLAYER } as TriggerSpec,
  /** "Whenever equipped creature becomes untapped" */
  attachedUntaps: { on: "taps", who: { attached: "host" }, untap: true } as TriggerSpec,
  discard: (whose: "you" | "opponent" | "any" = "opponent"): TriggerSpec => ({ on: "discard", whose }),
  tapsSelf: { on: "taps", who: "self" } as TriggerSpec,
  /** "Whenever you cast a spell that targets this creature" */
  targetedBySpellYouCast: { on: "becomesTarget", who: "self", by: "yourSpell" } as TriggerSpec,
  /** "Whenever you scry or surveil" */
  scryOrSurveil: { on: "action", action: "scry" } as TriggerSpec,
  /** "When you discard this card" (with `fromGraveyard`). */
  discardSelf: { on: "discard", whose: "any", self: true } as TriggerSpec,
  /** "When you cycle this card" (with `fromGraveyard`; `amount.eventAmount`: the X of the cost). */
  cycleSelf: { on: "action", action: "cycled", self: true } as TriggerSpec,
  /** "Whenever you activate an exhaust ability" */
  exhaustActivated: { on: "action", action: "exhaust" } as TriggerSpec,
  /** "When you cast this spell" */
  castSelf: { on: "castSelf" } as TriggerSpec,
  /** "Whenever you copy a [matching] spell" */
  copySpell: (filter?: ObjectFilter): TriggerSpec => ({ on: "copySpell", filter }),
  /** "When this creature is turned face up" */
  turnedFaceUp: { on: "turnedFaceUp" } as TriggerSpec,
  /** "Whenever a [filter] permanent is turned face up" */
  permanentTurnedFaceUp: (who: ObjectFilter): TriggerSpec => ({ on: "turnedFaceUp", who }),
  /** "Whenever a [creature] becomes blocked" */
  becomesBlocked: (who: ObjectFilter): TriggerSpec => ({ on: "becomesBlocked", who }),
  /** "Whenever enchanted player is dealt damage" */
  /** "Whenever enchanted player is dealt damage" (player Aura). */
  attachedPlayerDamaged: { on: "isDealtDamage", who: "attached" } as TriggerSpec,
  /** "Whenever you manifest dread" (the object of the event: the card put into the graveyard). */
  manifestDread: { on: "action", action: "manifestDread" } as TriggerSpec,
  /** "Whenever you discover" (`amount.eventAmount`: the value N). */
  discover: { on: "action", action: "discover" } as TriggerSpec,
  /** "Whenever a [creature] explores [a land / nonland card]" */
  explores: (who: "self" | ObjectFilter, land?: boolean): TriggerSpec => ({ on: "explores", who, land }),
  /** "Whenever you sacrifice [a permanent]" */
  /** `anyPlayer`: sacrificed by any player; `byOpponent`: by an opponent (Vengeful Tracker). */
  sacrifice: (who: ObjectFilter, anyPlayer?: boolean, byOpponent?: boolean): TriggerSpec => ({
    on: "sacrifice",
    who,
    anyPlayer: anyPlayer || byOpponent,
    byOpponent,
  }),
  /** "Whenever this Mount becomes saddled" */
  saddled: { on: "action", action: "saddled", self: true } as TriggerSpec,
  /** "Whenever this creature saddles a Mount or crews a Vehicle [during your main phase]" */
  crews: (mainPhase = false): TriggerSpec => ({ on: "crews", mainPhase }),
  /** "When this Class reaches level N" */
  classLevel: (level: number): TriggerSpec => ({ on: "classLevel", level }),
  /** "When you unlock this door" (Room; the door is fixed at import). */
  unlockThisDoor: { on: "unlockDoor" } as TriggerSpec,
  /** Eerie: "whenever an enchantment you control enters and whenever you fully unlock a Room". */
  eerie: { on: "eerie" } as TriggerSpec,
  /** "At the beginning of your second main phase" (Survival, with the condition "if this creature is tapped"). */
  secondMain: { on: "step", step: "main", whose: "you", nth: 2 } as TriggerSpec,
  /** "At the beginning of each of your main phases" (Carpet of Flowers). */
  eachMain: { on: "step", step: "main", whose: "you" } as TriggerSpec,
  /** "Whenever you activate a loyalty ability [removing at least N counters]" */
  /** Valiant: "whenever this creature becomes the target of a spell or ability you control". */
  valiant: { on: "becomesTarget", who: "self", by: "you" } as TriggerSpec,
  /** "Whenever a [creature you control] becomes the target of a spell or ability an opponent controls" */
  /** `spells`: "… or a [creature] spell you control" (Surrak, Elusive Hunter). */
  targetedByOpponent: (who: ObjectFilter, spells?: boolean): TriggerSpec => ({
    on: "becomesTarget",
    who,
    by: "opponent",
    spells,
  }),
  /** Expend N: "whenever you expend N" (your Nth total mana spent on spells during a turn). */
  expend: (n: number): TriggerSpec => ({ on: "action", action: "expend", n }),
  forage: { on: "action", action: "forage" } as TriggerSpec,
  collectEvidence: { on: "action", action: "collectEvidence" } as TriggerSpec,
  /** "Whenever you waterbend, earthbend, firebend, or airbend" (Avatar). */
  bend: { on: "action", action: "bend" } as TriggerSpec,
  /** "Whenever a creature you control attacks and causes one of its triggered abilities to trigger." */
  attackAbilityTriggered: { on: "action", action: "attackTriggered" } as TriggerSpec,
  caseSolved: { on: "action", action: "caseSolved" } as TriggerSpec,
  /** "Whenever you give a gift" */
  giveGift: { on: "action", action: "gift" } as TriggerSpec,
  /** "Whenever you gain or lose life" */
  lifeChange: { on: "life" } as TriggerSpec,
  /** "Whenever a [creature] leaves the battlefield without dying" */
  leavesWithoutDying: (who: ObjectFilter): TriggerSpec => ({ on: "leaves", who, withoutDying: true }),
  loyaltyActivated: (minRemoved?: number, byOpponent?: boolean): TriggerSpec => ({
    on: "loyaltyActivated",
    minRemoved,
    byOpponent,
  }),
};

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
  beholdSharingType: (r: Ref, count: number): Condition => ({ kind: "beholdSharingType", ref: r, count }),
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
      { op: "unlessPay", who: { kind: "you" }, mana: cost.mana, life: cost.life, times: age, skip: 1 },
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
        op: "unlessPay",
        who: { kind: "eventPlayer" },
        mana: ward.mana,
        life: ward.life,
        lifeAmount: ward.lifePower ? { kind: "powerOf", ref: { kind: "self" } } : undefined,
        discard: ward.discard,
        discardRandom: ward.discardRandom,
        sacrifice: ward.sacrifice,
        sacrificeFilter: ward.sacrificeFilter,
        collectEvidence: ward.collectEvidence,
        waterbend: ward.waterbend,
        poison: ward.poison,
        orMana: ward.orMana,
        skip: 1,
      },
      { op: "counter", what: { kind: "eventObject" } },
    ],
    ward: true,
    label: msg("Ward"),
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

export function triggered(
  trigger: TriggerSpec,
  effects: Effects,
  opts: {
    targets?: TargetSpec[];
    condition?: Condition;
    /** Condition checked only on triggering ("when you cast this spell while controlling a creature"). */
    triggerCondition?: Condition;
    label?: string;
    oncePerTurn?: boolean | "ifDone" | "firstEvent";
    /** Triggers from the graveyard (Flamewake Phoenix). */
    fromGraveyard?: boolean;
    /** Also works from the command zone (eminence, Commander). */
    fromCommand?: boolean;
    /** "one or more …": a single trigger per batch of events. */
    batched?: boolean;
  } = {},
): TriggeredAbilityDef {
  return {
    kind: "triggered",
    trigger,
    effects: effects.flat(),
    targets: opts.targets ?? [],
    condition: opts.condition,
    ...(opts.triggerCondition ? { triggerCondition: opts.triggerCondition } : {}),
    label: opts.label,
    oncePerTurn: opts.oncePerTurn,
    fromGraveyard: opts.fromGraveyard,
    ...(opts.fromCommand ? { fromCommand: true } : {}),
    batched: opts.batched,
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
