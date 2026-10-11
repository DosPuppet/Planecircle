/** Triggers of the card DSL (dsl.ts): `when.*`, the dealt-damage filters and `triggered`. */

import { msg } from "../text";
import type { Condition, ObjectFilter, Step, TargetFilter, TargetSpec, TriggeredAbilityDef, TriggerSpec, Zone } from "../types";
import type { Effects } from "./shared";

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
  /**
   * "[Spells] you cast have storm" (702.40a): whenever you cast a matching spell; `amount.eventAmount` is the number
   * of spells cast before it this turn (Ral's emblem, Prismari).
   */
  castSpellStorm: (filter: ObjectFilter): TriggerSpec => ({ on: "castSpell", by: "you", filter, storm: true }),
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
  /** "Whenever a [kind] counter is put on …": once for each counter (Fathom Mage). */
  eachCounterPut: (who: "self" | ObjectFilter, kind?: string): TriggerSpec => ({ on: "countersPut", who, kind, each: true }),
  /** "Whenever you put one or more counters (of that kind) on …". */
  youPutCounters: (who: ObjectFilter, kind?: string): TriggerSpec => ({ on: "countersPut", who, kind, by: "you" }),
  /** `to`: what is dealt the damage (`TO_OPPONENT`, `TO_CREATURE`…). */
  dealsDamage: (
    who: "self" | ObjectFilter,
    opts: { noncombatOnly?: boolean; to?: TargetFilter; anySourceYouControl?: boolean; eventObject?: "damaged" } = {},
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
  /** "At the beginning of each of your postcombat main phases" (505.1a: every main phase but the first). */
  postcombatMain: { on: "step", step: "main", whose: "you", nth: "postcombat" } as TriggerSpec,
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

/** A triggered ability: trigger, effects and options. */
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
    /** "This ability triggers only once." */
    once?: boolean;
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
    ...(opts.once ? { once: true } : {}),
    fromGraveyard: opts.fromGraveyard,
    ...(opts.fromCommand ? { fromCommand: true } : {}),
    batched: opts.batched,
  };
}

/**
 * "At the beginning of the end step, sacrifice this token": an ability of the token itself, not a delayed ability
 * (Kindle the Inner Flame, Electroduplicate, Chandra, Flameshaper: `copyToken` with `addAbilities`; Choreographed
 * Sparks: the copy of a creature spell, `copySpell.atEnd`). A copy of the token has it too; "loses all abilities"
 * removes it.
 */
export const SACRIFICE_TOKEN_AT_END_STEP: TriggeredAbilityDef = triggered(
  { on: "step", step: "end", whose: "any" },
  [{ op: "sacrificeIt", what: { kind: "self" } }],
  { label: msg("At the beginning of the end step, sacrifice this token") },
);
