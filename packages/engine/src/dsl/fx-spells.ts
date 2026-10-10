import { parseManaCost } from "../mana";
import type { Amount, Condition, Effect, ObjectFilter, Ref } from "../types";

/** `fx` builders (dsl.ts) of the stack and casting: countering, copying, casting permissions, resolution riders (`ops/spells.ts`). */
export const spellsFx = {
  /** "Exile [this spell] with N time counters; it gains suspend" (702.62). */
  suspend: (what: Ref, time: number): Effect => ({ op: "suspend", what, time }),
  /** Counters the designated spell or ability. */
  counter: (what: Ref, store?: string, storeMoved?: string): Effect => ({
    op: "counter",
    what,
    store,
    ...(storeMoved ? { storeMoved } : {}),
  }),
  /** "Counter it; exile it instead of putting it into the graveyard" (Syncopate). */
  counterExile: (what: Ref): Effect => ({ op: "counter", what, exile: true }),
  /** These cards in your graveyard can be cast this turn (ordinary permission, Zul Ashur). */
  allowCastFromGraveyard: (what: Ref): Effect => ({ op: "grantPlay", what }),
  /** "Exile the top N cards. Choose one of them. You may play it this turn (or until the end of your next turn)." */
  impulse: (n: number, until: "thisTurn" | "yourNextTurn" | "yourNextEndStep" = "thisTurn"): Effect => ({
    op: "impulse",
    n,
    until,
  }),
  grantFlashback: (what: Ref): Effect => ({ op: "grantPlay", what, flashback: true }),
  /** "[This card] gains harmonize until end of turn; its harmonize cost is its mana cost" (702.180). */
  grantHarmonize: (what: Ref): Effect => ({ op: "grantPlay", what, flashback: "harmonize" }),
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
  /** The card or spell is exiled and becomes plotted. */
  plot: (what: Ref): Effect => ({ op: "exileToCast", what, kind: "plot" }),
  plotOnResolve: (what: Ref): Effect => ({ op: "spellFate", fate: "plot", what }),
  /** Tishana's Tidebinder: counters the ability; its permanent loses its abilities as long as the source remains. */
  counterAbilitySilence: (what: Ref): Effect => ({ op: "counterAbilitySilence", what }),
  /** "[This spell] gains rebound" (Ojer Pakpatiq). */
  grantRebound: (what: Ref): Effect => ({ op: "spellFate", fate: "rebound", what }),
  exileOnResolveWith: (what: Ref, counter: string): Effect => ({ op: "spellFate", fate: "exile", what, counter }),
  /** Discover N (701.57); `who`: "that player discovers N"; `store`: the discovered card. */
  discover: (n: Amount, opts: { who?: Ref; store?: string } = {}): Effect => ({ op: "discover", n, ...opts }),
  /** Cascade (702.85): `n` is the mana value of the spell with cascade. */
  cascade: (n: Amount, filter?: ObjectFilter): Effect => ({ op: "discover", n, cascade: true, ...(filter ? { filter } : {}) }),
  exileOnResolve: { op: "spellFate", fate: "exile" } as Effect,
  /** "Put [this spell] on the bottom of its owner's library" (Ultimate Nullification). */
  bottomOnResolve: { op: "spellFate", fate: "bottom" } as Effect,
  changeTarget: (what: Ref): Effect => ({ op: "changeTarget", what }),
  tripleTriad: { op: "tripleTriad" } as Effect,
  resolveToBattlefieldTransformed: { op: "spellFate", fate: "battlefieldTransformed" } as Effect,
  spellArrivalCounters: (what: Ref, amount: Amount): Effect => ({ op: "spellArrivalCounters", what, amount }),
  countResolution: (store: string): Effect => ({ op: "countResolution", store }),
  /** "… becomes prepared" / "… becomes unprepared" (Reality Fracture). */
  prepare: (what: Ref, value = true): Effect => ({ op: "prepare", what, value }),
  prepareAll: (filter: ObjectFilter, value = true): Effect => ({ op: "prepare", filter, value }),
};
