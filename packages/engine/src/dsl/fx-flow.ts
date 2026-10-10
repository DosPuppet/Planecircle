import { parseManaCost } from "../mana";
import type { Amount, Condition, Effect, ModeDef, ObjectFilter, Ref, TargetSpec, TriggerSpec } from "../types";
import type { Effects } from "./shared";

/** `fx` builders (dsl.ts) of flow: optional effects, choices, conditions, delayed and reflexive abilities (`ops/flow.ts`). */
export const flowFx = {
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
  /** "You may pay N life. If you do, …" */
  mayPayLife: (life: Amount, prompt: string, ...effects: Effects): Effect[] => {
    const flat = effects.flat();
    const paid = typeof life === "number" ? { life } : { lifeAmount: life };
    return [{ op: "mayPay", cost: { generic: 0, colored: {}, x: 0 }, ...paid, prompt, skip: flat.length }, ...flat];
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
};
