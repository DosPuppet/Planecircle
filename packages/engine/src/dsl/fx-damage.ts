import type { Amount, Effect, EventReplacement, ObjectFilter, Ref } from "../types";

/** `fx` builders (dsl.ts) of damage, fight and damage prevention (`ops/damage.ts`). */
export const damageFx = {
  /** `storeDealt`: the damage really dealt to the targets is stored ("if a player is dealt damage this way"). */
  damage: (n: Amount, to: Ref, source?: Ref, opts: { storeDealt?: string } = {}): Effect => ({
    op: "damage",
    amount: n,
    to,
    source,
    ...(opts.storeDealt ? { storeDealt: opts.storeDealt } : {}),
  }),
  fight: (a: Ref, b: Ref, storeExcess?: string): Effect => ({ op: "fight", a, b, ...(storeExcess ? { storeExcess } : {}) }),
  damageStoringExcess: (n: Amount, to: Ref, store: string): Effect => ({ op: "damage", amount: n, to, storeExcess: store }),
  exileIfDies: (what: Ref): Effect => ({ op: "objectReplacement", kind: "exileIfDies", what }),
  preventCombatDamage: (what: Ref): Effect => ({ op: "objectReplacement", kind: "preventCombatDamage", what }),
  /** "Prevent all damage that would be dealt to [these permanents] this turn": objects fixed at resolution. */
  preventDamageThisTurn: (what: Ref): Effect => ({ op: "objectReplacement", kind: "preventDamage", what }),
  eachOfDealsDamage: (from: Ref, to: Ref): Effect => ({ op: "eachDealsDamage", filter: {}, to, from }),
  /** Shield (615.7): "the next time [a source of your choice] would… this turn, …" (New Way Forward). */
  shield: (replacement: EventReplacement, chooseSource = false): Effect => ({ op: "shield", replacement, chooseSource }),
  /** `amount`: each deals that much damage (otherwise its power). */
  eachDealsDamage: (filter: ObjectFilter, to: Ref, amount?: Amount): Effect => ({
    op: "eachDealsDamage",
    filter,
    to,
    ...(amount !== undefined ? { amount } : {}),
  }),
  /** Damage divided among the designated targets. */
  damageDivided: (total: Amount, to: Ref): Effect => ({ op: "damageDivided", total, to }),
  damageAll: (n: Amount, filter?: ObjectFilter, players?: Ref, source?: Ref): Effect => ({
    op: "damageAll",
    amount: n,
    filter,
    players,
    source,
  }),
};
