import type { Amount, Effect, ObjectFilter, Ref } from "../types";
import { ref } from "./refs";
import { allMatching } from "./shared";

/** `fx` builders (dsl.ts) of counters (`ops/counters.ts`). */
export const countersFx = {
  lkiCountersTo: (to: Ref): Effect => ({ op: "lkiCountersTo", to }),
  /** "Move a counter from [this permanent] onto [that other one]" (kind of your choice). */
  moveCounter: (from: Ref, to: Ref): Effect => ({ op: "moveCounter", from, to }),
  addCounters: (what: Ref, n: Amount): Effect => ({ op: "addCounters", what, amount: n }),
  /** "[This permanent] endures N" (701.64): N +1/+1 counters on it, or an N/N white Spirit token. */
  endure: (what: Ref, n: Amount): Effect => ({ op: "endure", what, amount: n }),
  /** Blight N (ECL): `who` puts N −1/−1 counters on a creature they control; `store`: 1 if done. */
  blight: (n: Amount, who: Ref = ref.you, store?: string): Effect => ({ op: "blight", who, amount: n, store }),
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
  doubleCounters: (what: Ref): Effect => ({ op: "doubleCounters", what }),
  /** Room: "unlock a locked door" / "lock or unlock a door" of one of the designated Rooms. */
  door: (what: Ref, mode: "unlock" | "toggle" = "unlock"): Effect => ({ op: "door", what, mode }),
  /** Sovereign Okinec Ahau: +1/+1 counters equal to the difference between power and base power. */
  countersAboveBase: (filter: ObjectFilter): Effect => ({ op: "countersAboveBase", filter }),
  countersDivided: (total: Amount, to: Ref, opts: { counter?: string; anyNumber?: boolean } = {}): Effect => ({
    op: "countersDivided",
    total,
    to,
    ...opts,
  }),
  /**
   * "Move any number of [kind] counters from `from` onto `to`" (one or several objects): a division for each kind
   * (`"any"`: every kind it has), the share left on `from` staying there.
   */
  moveCountersDivided: (from: Ref, to: Ref, counter = "+1/+1"): Effect => ({
    op: "countersDivided",
    total: 0,
    to,
    counter,
    anyNumber: true,
    from,
  }),
  proliferate: (times: Amount = 1, what?: Ref): Effect => ({ op: "proliferate", times, ...(what ? { what } : {}) }),
  removeCounters: (what: Ref, n: Amount, kind?: string, store?: string): Effect => ({
    op: "removeCounters",
    what,
    n,
    kind,
    store,
  }),
  counters: (what: Ref, kind: string, n: Amount = 1): Effect => ({ op: "addCounters", what, amount: n, kind }),
  addCountersAll: (filter: ObjectFilter, n: Amount = 1, kind?: string): Effect => ({
    op: "addCounters",
    what: allMatching(filter),
    amount: n,
    kind,
  }),
  doubleAllCounters: (what: Ref): Effect => ({ op: "doubleCounters", what, all: true }),
};
