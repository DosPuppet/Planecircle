import { parseManaCost } from "../mana";
import type { Amount, Effect, ObjectFilter, Ref } from "../types";
import type { Effects } from "./shared";

/**
 * `fx` builders (dsl.ts) of the "pay" family (`ops/pay.ts`, PLAN-M M4): "you may", "you may pay", "unless … pays",
 * forage, collect evidence, behold, pay X. They all build a `pay` effect.
 */
export const payFx = {
  /** "You may …": returns a list to spread into the effects. */
  may: (prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: {}, prompt, skip: flat.length }, ...flat];
  },
  /** "[That player] may …": the question is asked to another player (a targeted opponent…). */
  mayFor: (who: Ref, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: {}, prompt, skip: flat.length, who }, ...flat];
  },
  /** Like `mayFor`, storing the answer (1 = yes) for an "If [they] don't, …". */
  mayForStore: (who: Ref, prompt: string, storeAs: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: {}, prompt, skip: flat.length, who, store: storeAs }, ...flat];
  },
  /** "You may behold [filter]. If you do, …" (during resolution; the card from the hand is revealed). */
  mayBehold: (filter: ObjectFilter, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { behold: filter }, skip: flat.length }, ...flat];
  },
  /** "You may pay {X}. If you do, …" */
  mayPay: (cost: string, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { mana: parseManaCost(cost) }, prompt, skip: flat.length }, ...flat];
  },
  /** "You may pay N life. If you do, …" */
  mayPayLife: (life: Amount, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { payLife: life }, prompt, skip: flat.length }, ...flat];
  },
  /** "You may forage. If you do, …" (701.61: exile three cards from your graveyard or sacrifice a Food). */
  mayForage: (_prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { forage: true }, skip: flat.length }, ...flat];
  },
  /** "You may collect evidence N. If you do (when you do), …" (701.59). */
  mayCollectEvidence: (n: Amount, opts: { exclude?: Ref }, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    const cost = typeof n === "number" ? { collectEvidence: n } : { collectEvidence: "X" as const };
    return [{ op: "pay", cost, ...(typeof n === "number" ? {} : { x: n }), skip: flat.length, ...opts }, ...flat];
  },
  /** "You may collect evidence X. When you do, … X …": X is stored in `store`. */
  mayCollectEvidenceX: (store: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { collectEvidence: "X" }, x: { chosen: true }, skip: flat.length, store }, ...flat];
  },
  /** "You may pay [mana] and N life. If you do, …" */
  mayPayWithLife: (mana: string, life: number, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    return [{ op: "pay", cost: { mana: parseManaCost(mana), payLife: life }, prompt, skip: flat.length }, ...flat];
  },
  /**
   * "Counter it unless its controller pays X": the payment cancels the following effects. `genericAmount`: {1} more per
   * point; `discard`: "discard a card"; `sacrifice`: "sacrifice N [filter]" (Indoraptor); `paidStore`: 1 if paid.
   */
  unlessPays: (
    who: Ref,
    cost: {
      mana?: string;
      /** Or this mana cost, of their choice (Lim-Dûl's Hex: "{B} or {3}"). */
      orMana?: string;
      life?: Amount;
      paidStore?: string;
      genericAmount?: Amount;
      waterbend?: boolean;
      times?: Amount;
      discard?: boolean;
      sacrifice?: { count: number; filter?: ObjectFilter };
    },
    ...effects: Effects
  ): Effect[] => {
    const flat = effects.flat();
    return [
      {
        op: "pay",
        unless: true,
        who,
        cost: {
          ...(cost.mana ? { mana: parseManaCost(cost.mana) } : {}),
          ...(cost.life !== undefined ? { payLife: cost.life } : {}),
          ...(cost.discard ? { discard: 1 } : {}),
          ...(cost.sacrifice ? { sacrifice: { filter: cost.sacrifice.filter ?? {}, count: cost.sacrifice.count } } : {}),
          ...(cost.waterbend ? { tapToPay: "waterbend" as const } : {}),
        },
        ...(cost.orMana ? { or: { mana: parseManaCost(cost.orMana) } } : {}),
        ...(cost.genericAmount !== undefined ? { x: cost.genericAmount } : {}),
        ...(cost.paidStore ? { store: cost.paidStore } : {}),
        ...(cost.times ? { times: cost.times } : {}),
        skip: flat.length,
      },
      ...flat,
    ];
  },
  /** "You may pay [this card]'s mana cost" (automatic payment); `store`: 1 if paid. */
  payCostOf: (what: Ref, store: string, prompt: string): Effect => ({
    op: "pay",
    cost: {},
    manaOf: what,
    store,
    prompt,
    skip: 0,
  }),
  /** "Pay {X}" (`max`: "pay {1} up to N times"): X stored under `store`. */
  payX: (prompt: string, store: string, max?: Amount): Effect => ({
    op: "pay",
    cost: { mana: parseManaCost("{X}") },
    x: { chosen: true, ...(max !== undefined ? { max } : {}) },
    prompt,
    store,
    skip: 0,
  }),
  /** "Pay any amount of life": X stored under `store`. */
  payLifeX: (prompt: string, store: string, who?: Ref): Effect => ({
    op: "pay",
    cost: { payLife: { kind: "x" } },
    x: { chosen: true },
    prompt,
    store,
    ...(who ? { who } : {}),
    skip: 0,
  }),
};
