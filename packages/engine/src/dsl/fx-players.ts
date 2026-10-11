import type { Amount, Effect, ObjectFilter, PlayerStaticAbilityDef, Ref } from "../types";
import { ref } from "./refs";
import type { Effects } from "./shared";

/** `fx` builders (dsl.ts) of players: life, draw, effects on players, extra turns and phases, winning and losing (`ops/players.ts`). */
export const playersFx = {
  /** "They can't gain life for the rest of the game" (Screaming Nemesis). */
  cantGainLife: (who: Ref): Effect => ({ op: "playerEffect", ability: { cantGainLife: true }, who, duration: "forever" }),
  /** `store`: the number of cards actually drawn ("if you draw one or more cards this way"). */
  draw: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "draw", who, amount: n, ...(store ? { store } : {}) }),
  gainLife: (n: Amount, who: Ref = ref.you): Effect => ({ op: "gainLife", who, amount: n }),
  loseLife: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "loseLife", who, amount: n, store }),
  /** "Each player loses half their life, rounded down." */
  loseHalfLife: (who: Ref): Effect => ({ op: "loseLife", who, amount: 0, half: true }),
  /** Player effect until end of turn, for its controller (`damageUnpreventable`: "damage can't be prevented this turn"). */
  thisTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({ op: "playerEffect", ability, who }),
  /** Player effect until the end of this combat (Mirri, Weatherlight Duelist: "can't block with more than one creature this combat"). */
  thisCombat: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "thisCombat",
  }),
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
  /**
   * Player effect for as long as the source remains on the battlefield (Old Fat Spider Can't See Me: "prevent all damage
   * that would be dealt by up to one target creature for as long as this Saga remains on the battlefield").
   */
  whileSource: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "whileSource",
  }),
  /** Player effect during the next combat phase of this turn (Bumi, Unleashed: "during that combat phase"). */
  nextCombat: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "nextCombat",
  }),
  /** Player effect during the next turn only (Kang the Conqueror: "take an extra turn after this one. During that turn, …"). */
  duringNextTurn: (ability: Omit<PlayerStaticAbilityDef, "kind">, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    duration: "nextTurn",
  }),
  /** N one-shot effects on these players (Ral Zarek: "skips their next X turns"). */
  playerEffectTimes: (ability: Omit<PlayerStaticAbilityDef, "kind">, times: Amount, who?: Ref): Effect => ({
    op: "playerEffect",
    ability,
    who,
    times,
  }),
  endTurn: { op: "endTurn" } as Effect,
  noLegendRuleThisTurn: { op: "playerEffect", ability: { noLegendRule: true } } as Effect,
  exchangeLife: (a: Ref, b: Ref, store?: string): Effect => ({ op: "setLife", who: a, exchange: b, store }),
  setLife: (amount: Amount, who: Ref = ref.you): Effect => ({ op: "setLife", who, amount }),
  /** "You control [the player] during their next turn" (722). */
  /** "You become the monarch" (724). */
  becomeMonarch: (who?: Ref): Effect => ({ op: "becomeMonarch", ...(who ? { who } : {}) }),
  /**
   * Each designated player chooses a number from 0 to `max` (`secret`: "secretly", Wheel of Misfortune; alone: Expel
   * the Interlopers); read by `amount.numberChosen` and `ref.choosers`.
   */
  chooseNumbers: (
    who: Ref,
    store: string,
    max = 20,
    opts: { prompt?: string; suggested?: Amount; secret?: boolean } = {},
  ): Effect => ({ op: "eachChooses", who, store, among: { max }, ...opts }),
  /**
   * Each designated player chooses one of the options (`labels`) or another player (`players`), in turn order starting
   * with you; `secret`: revealed together once all have chosen (Prisoner's Dilemma).
   */
  eachChooses: (
    who: Ref,
    store: string,
    among: { labels: string[] } | { players: Ref },
    opts: { prompt?: string; suggested?: Amount; secret?: boolean } = {},
  ): Effect => ({ op: "eachChooses", who, store, among, ...opts }),
  /**
   * "Starting with you, each player votes for …" (701.38): one vote each, in turn order, plus the additional votes of
   * `extraVotes` (Tivit); `secret`: "secretly votes", revealed together (secret council). Read the votes with
   * `amount.votes` (then `fx.repeat` for "for each … vote, …").
   */
  vote: (
    store: string,
    among: { labels: string[] } | { players: Ref },
    opts: { prompt?: string; secret?: boolean; who?: Ref } = {},
  ): Effect => ({
    op: "eachChooses",
    who: opts.who ?? ref.eachPlayer,
    store,
    among,
    vote: true,
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
    ...(opts.secret ? { secret: true } : {}),
  }),
  /** `thenExtraTurn`: "after that turn, that player takes an extra turn" (Emrakul, the Promised End). */
  controlNextTurn: (who: Ref, combatOnly?: boolean, thenExtraTurn?: boolean): Effect => ({
    op: "controlNextTurn",
    who,
    ...(combatOnly ? { combatOnly } : {}),
    ...(thenExtraTurn ? { thenExtraTurn } : {}),
  }),
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
  copyNextExhaust: { op: "playerEffect", ability: { copyNextExhaust: true }, once: true } as Effect,
  /** Spikeshell Harrier: "if that opponent's speed is greater than each other player's speed, reduce it by 1". */
  reduceSpeed: (who: Ref): Effect => ({ op: "speed", who, by: -1 }),
  poison: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n }),
  /** "[The player] gets N rad counters" (Fallout). */
  rad: (who: Ref, n: Amount): Effect => ({ op: "poison", who, n, counter: "rad" }),
  /** "When you next cast a spell this turn, …": the spell is `ref.target("s")` (Codie). */
  whenNextSpellThisTurn: (effects: Effects): Effect => ({
    op: "playerEffect",
    ability: { nextSpell: { trigger: effects.flat() } },
    once: true,
  }),
  /** "After this phase, there is an additional combat phase." */
  extraCombat: { op: "extra", kind: "combat" } as Effect,
  /** "After this main phase, there are N additional combat phases" (with no main phase between them). */
  extraCombatsAfterMain: (n: number): Effect => ({ op: "extra", kind: "combat", amount: n, after: "main" }),
  /** "An additional combat phase after this main phase, followed by an additional main phase." */
  extraCombatAfterMain: { op: "extra", kind: "combatAfterMain" } as Effect,
  extraTurn: { op: "extra", kind: "turn" } as Effect,
  /** "There is an additional beginning phase after this phase" (untap, upkeep, draw: Sphinx of the Second Sun). */
  extraBeginningPhase: { op: "extra", kind: "beginning" } as Effect,
  /** "The next [filter] creature spell you cast this turn": counters, haste, free (`free`). */
  nextCreatureSpell: (
    opts: { counters?: number; haste?: boolean; free?: boolean },
    filter: ObjectFilter = { types: ["Creature"] },
  ): Effect => ({
    op: "playerEffect",
    ability: { nextSpell: { filter, ...opts } },
    once: true,
  }),
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
  extraEndStep: { op: "extra", kind: "endStep" } as Effect,
  copyNextSpell: {
    op: "playerEffect",
    ability: { nextSpell: { filter: { types: ["Instant", "Sorcery"] }, copy: true } },
    once: true,
  } as Effect,
  winGame: { op: "winGame" } as Effect,
  loseGame: { op: "loseGame" } as Effect,
  /** "That player loses the game" (Summon: Primal Odin). */
  playerLoses: (who: Ref): Effect => ({ op: "loseGame", who }),
  mayWheel: { op: "mayWheel" } as Effect,
  instantJaceLoyalty: { op: "playerEffect", ability: { jaceLoyaltyInstant: true } } as Effect,
  extraLandThisTurn: { op: "playerEffect", ability: { extraLands: 1 } } as Effect,
  nextSpellUncounterable: { op: "playerEffect", ability: { nextSpell: { uncounterable: true } }, once: true } as Effect,
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
  /** "Draw N cards, then discard N cards." */
  loot: (n = 1): Effect[] => [
    { op: "draw", who: ref.you, amount: n },
    { op: "discard", who: ref.you, amount: n },
  ],
  drain: (n: Amount, who: Ref = ref.eachOpponent): Effect[] => [
    { op: "loseLife", who, amount: n },
    { op: "gainLife", who: ref.you, amount: n },
  ],
};
