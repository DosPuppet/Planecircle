/**
 * Engine effects: the "pay" family (PLAN-S, PLAN-M M4), one `pay` op. The handler dispatches by shape to the bodies of
 * the former ops (`unlessPay`, `payCostOf`, `exileForManaValue`, `collectEvidence`, `payX`, `forage`, `behold`,
 * `mayPay`, `may`), kept as they were: same question keys, options, intents, prompts and payment order (replays identical).
 */
import { canForage, forage, payLife, sacrifice } from "../actions";
import { cardRef } from "../choices";
import type { EffectContext, OpHandlers, OpResult } from "../effects";
import { announceDiscard, announceDiscardBatch, cardRefOf, evalAmount, moveDiscarded, resolveRef, store } from "../effects";
import { bump } from "../layers";
import { availableMana, canPay, costToText, manaValue, payCostText, payMana } from "../mana";
import { beholdOptions, collectEvidence, evidenceCards, pickEvidence, timesCost } from "../stack";
import { bent, emit, isPlayer, moveObject, shuffle } from "../state";
import { payableLife } from "../statics";
import { matchesObjectFilter } from "../targets";
import { msg } from "../text";
import type { Amount, Effect, GameState, ManaCost, ObjectFilter, ObjectId, Ref, Resolution } from "../types";

type PayEffect = Extract<Effect, { op: "pay" }>;
type Key = (suffix: string) => string;
const NO_MANA: ManaCost = { generic: 0, colored: {}, x: 0 };

/** The X of the effect when it is an amount (not chosen during the resolution). */
const fixedX = (e: PayEffect): Amount | undefined => (e.x !== undefined && !isChosenX(e.x) ? e.x : undefined);
const isChosenX = (x: NonNullable<PayEffect["x"]>): x is { chosen: true; max?: Amount } => typeof x === "object" && "chosen" in x;
const lifeOf = (life: Amount | undefined) =>
  life === undefined ? {} : typeof life === "number" ? { life } : { lifeAmount: life };

export const HANDLERS: OpHandlers = {
  pay(s, r, e, ctx, key) {
    const c = e.cost;
    if (e.unless) {
      const sac = c.sacrifice;
      return unlessPay(s, r, ctx, key, {
        who: e.who ?? { kind: "you" },
        mana: c.mana,
        genericAmount: fixedX(e),
        ...lifeOf(c.payLife),
        discard: c.discard ? true : undefined,
        discardRandom: c.discardRandom,
        sacrifice: sac ? Number(sac.count) : undefined,
        sacrificeFilter: sac && Object.keys(sac.filter).length ? sac.filter : undefined,
        collectEvidence: typeof c.collectEvidence === "number" ? c.collectEvidence : undefined,
        waterbend: c.tapToPay === "waterbend" ? true : undefined,
        poison: c.poison,
        orMana: e.or?.mana,
        paidStore: e.store,
        times: e.times,
        skip: e.skip,
      });
    }
    if (e.manaOf) return payCostOf(s, r, ctx, key, { what: e.manaOf, store: e.store ?? "", prompt: e.prompt ?? "" });
    if (e.totalManaValue !== undefined)
      return exileForManaValue(s, r, ctx, { filter: c.exile ?? {}, atLeast: e.totalManaValue, store: e.store ?? "" });
    if (c.collectEvidence !== undefined)
      return payEvidence(s, r, ctx, key, {
        n: c.collectEvidence === "X" ? fixedX(e) : c.collectEvidence,
        skip: e.skip,
        store: e.store,
        exclude: e.exclude,
      });
    if (e.x !== undefined && isChosenX(e.x))
      return payX(s, r, ctx, key, {
        prompt: e.prompt ?? "",
        store: e.store ?? "",
        life: c.payLife !== undefined ? true : undefined,
        who: e.who,
        max: e.x.max,
      });
    if (c.forage) return payForage(s, r, ctx, key, e.skip);
    if (c.behold) return payBehold(s, r, ctx, key, { filter: c.behold, skip: e.skip });
    if (c.mana !== undefined || c.payLife !== undefined)
      return mayPay(s, r, ctx, key, {
        cost: c.mana ?? NO_MANA,
        prompt: e.prompt ?? "",
        skip: e.skip,
        who: e.who,
        ...lifeOf(c.payLife),
      });
    return may(s, r, ctx, key, { prompt: e.prompt ?? "", skip: e.skip, who: e.who, store: e.store });
  },
};

/** "You may": if the player declines, the next `skip` effects are skipped. */
function may(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { prompt: string; skip: number; who?: Ref; store?: string },
): OpResult {
  // "[That player] may…": the question is asked to the designated player (an opponent, Terrapact Intimidator).
  const asked = e.who ? (resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) ?? ctx.controller) : ctx.controller;
  const answer = r.vars[key("may")];
  if (!answer) {
    return {
      ask: {
        player: asked,
        key: key("may"),
        request: {
          type: "yesNo",
          intent: "may",
          prompt: msg("{card}: {prompt}", { card: cardRefOf(s, ctx.sourceId), prompt: e.prompt }),
          suggested: [1],
        },
      },
    };
  }
  if (e.store) store(r, e.store, answer[0] === 1 ? 1 : 0);
  return answer[0] === 1 ? undefined : { skip: e.skip };
}

/** "You may pay [mana and/or life]. If you do, …": the next `skip` effects are skipped otherwise. */
function mayPay(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { cost: ManaCost; prompt: string; skip: number; life?: number; lifeAmount?: Amount; who?: Ref },
): OpResult {
  // "[That player] may pay …" (Gix, Yawgmoth Praetor: the creature's controller); no payer left: nothing is paid.
  const payer = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x) && !s.players[x]?.lost) : ctx.controller;
  if (!payer || !canPay(s, payer, e.cost)) return { skip: e.skip };
  // Life that can't be paid (119.4: not more than one has; 119.8: a loss prevented): no question.
  const life = e.lifeAmount !== undefined ? Math.max(0, evalAmount(s, ctx, e.lifeAmount)) : e.life;
  if (life && payableLife(s, payer) < life) return { skip: e.skip };
  const answer = r.vars[key("pay")];
  if (!answer) {
    return {
      ask: {
        player: payer,
        key: key("pay"),
        request: {
          type: "yesNo",
          intent: "may",
          prompt: msg("{card}: {prompt}", { card: cardRefOf(s, ctx.sourceId), prompt: e.prompt }),
          suggested: [1],
        },
      },
    };
  }
  if (answer[0] !== 1 || !canPay(s, payer, e.cost)) return { skip: e.skip };
  if (life && payableLife(s, payer) < life) return { skip: e.skip };
  payMana(s, payer, e.cost);
  if (life) payLife(s, payer, life);
  return;
}

/** "You may forage. If you do, …" (701.61). */
function payForage(s: GameState, r: Resolution, ctx: EffectContext, key: Key, skip: number): OpResult {
  if (!canForage(s, ctx.controller)) return { skip };
  const answer = r.vars[key("forage")];
  if (!answer) {
    return {
      ask: {
        player: ctx.controller,
        key: key("forage"),
        request: {
          type: "yesNo",
          intent: "may",
          prompt: msg("{card}: forage (exile three cards from your graveyard or sacrifice a Food)?", {
            card: cardRefOf(s, ctx.sourceId),
          }),
          suggested: [1],
        },
      },
    };
  }
  if (answer[0] !== 1 || !forage(s, ctx.controller)) return { skip };
  return;
}

/**
 * "You may collect evidence N. If you do, …" (701.59); without `n`: collect evidence X, X chosen and stored in `store`;
 * `exclude`: cards that don't count (Lamplight Phoenix, exiled at the same time).
 */
function payEvidence(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { n?: Amount; skip: number; store?: string; exclude?: Ref },
): OpResult {
  const excluded = new Set(e.exclude ? resolveRef(s, ctx, e.exclude) : []);
  const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const pool = (s.players[ctx.controller]?.graveyard ?? []).filter((id) => !excluded.has(id)).sort((a, b) => mv(b) - mv(a));
  const total = pool.reduce((n, id) => n + mv(id), 0);
  let n: number;
  if (e.n === undefined) {
    // Collect evidence X: X is chosen (0: nothing).
    const answer = r.vars[key("x")];
    if (!answer) {
      if (total <= 0) return { skip: e.skip };
      return {
        ask: {
          player: ctx.controller,
          key: key("x"),
          request: {
            type: "number",
            intent: "payX",
            prompt: msg("{card}: collect evidence X (0: no)?", { card: cardRefOf(s, ctx.sourceId) }),
            min: 0,
            max: total,
            suggested: [total],
          },
        },
      };
    }
    n = Math.min(total, Math.max(0, Number(answer[0])));
    if (n <= 0) return { skip: e.skip };
  } else {
    n = evalAmount(s, ctx, e.n);
    if (total < n) return { skip: e.skip };
    const answer = r.vars[key("may")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("may"),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: msg("{card}: collect evidence {n} (exile cards with total mana value {n} or greater from your graveyard)?", {
              card: cardRefOf(s, ctx.sourceId),
              n,
            }),
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1) return { skip: e.skip };
  }
  // The exiled cards are chosen by the player (by default: the cheapest set that suffices); if their total does not
  // reach N, the engine's choice completes it.
  const suggested = pickEvidence(s, pool, n) ?? [];
  let chosen = suggested;
  if (suggested.length < pool.length) {
    const answer = r.vars[key("evidence")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("evidence"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: msg("{card}: collect evidence {n} — cards in your graveyard to exile (total mana value {n} or greater)", {
              card: cardRefOf(s, ctx.sourceId),
              n,
            }),
            options: pool,
            min: 1,
            max: pool.length,
            suggested,
          },
        },
      };
    }
    const picked = [...new Set(answer.map(String).filter((id) => pool.includes(id)))];
    const total = picked.reduce((t, id) => t + mv(id), 0);
    chosen =
      total >= n
        ? picked
        : [
            ...picked,
            ...(pickEvidence(
              s,
              pool.filter((id) => !picked.includes(id)),
              n - total,
            ) ?? []),
          ];
  }
  collectEvidence(s, ctx.controller, chosen);
  store(r, e.store, n);
  return;
}

/** "You may behold [filter]. If you do, …" during the resolution: otherwise, the `skip` effects are skipped. */
function payBehold(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { filter: ObjectFilter; skip: number },
): OpResult {
  const options = beholdOptions(s, ctx.controller, ctx.sourceId, e.filter);
  // Noted for "as it enters" (Theorist's Sanctum: "if you don't, it enters tapped").
  r.vars.$beheld = [0];
  if (options.length === 0) return { skip: e.skip };
  const answer = r.vars[key("behold")];
  if (!answer) {
    return {
      ask: {
        player: ctx.controller,
        key: key("behold"),
        request: {
          type: "pick",
          intent: "pickCards",
          prompt: msg("{card}: you may behold (a permanent, or a revealed card from your hand)", {
            card: cardRefOf(s, ctx.sourceId),
          }),
          options,
          // Named: a card from the hand is not on the board (land played, PLAN-L L5).
          labels: Object.fromEntries(options.map((id) => [id, cardRef(s.objects[id]?.defId ?? "")])),
          min: 0,
          max: 1,
          suggested: options.slice(0, 1),
        },
      },
    };
  }
  const chosen = answer.map(String).find((id) => options.includes(id));
  if (!chosen) return { skip: e.skip };
  r.vars.$beheld = [1];
  if (s.objects[chosen]?.zone === "hand")
    emit({ type: "reveal", player: ctx.controller, defIds: [s.objects[chosen]?.defId ?? ""] });
  return;
}

/** "… unless [player] pays X": if they pay, the next `skip` effects are skipped. */
function unlessPay(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: {
    who: Ref;
    mana?: ManaCost;
    genericAmount?: Amount;
    life?: number;
    lifeAmount?: Amount;
    discard?: boolean;
    discardRandom?: boolean;
    sacrifice?: number;
    sacrificeFilter?: ObjectFilter;
    collectEvidence?: number;
    waterbend?: boolean;
    poison?: number;
    orMana?: ManaCost;
    paidStore?: string;
    times?: Amount;
    skip: number;
  },
): OpResult {
  const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
  if (!p) return;
  // "unless its controller pays {X}" (Syncopate): X is the spell's.
  const extra = e.genericAmount ? evalAmount(s, ctx, e.genericAmount) : 0;
  const base = e.mana ?? (e.genericAmount ? { generic: 0, colored: {}, x: 0 } : undefined);
  // Cumulative upkeep (702.24a): the cost paid once per age counter.
  const times = e.times ? Math.max(0, evalAmount(s, ctx, e.times)) : 1;
  const mana = base ? timesCost({ ...base, x: 0, generic: base.generic + (base.x ?? 0) * ctx.x + extra }, times) : undefined;
  // Raubahn: "Ward—Pay life equal to its power".
  const lifeOnce = e.lifeAmount ? evalAmount(s, ctx, e.lifeAmount) : e.life;
  const life = lifeOnce === undefined ? undefined : lifeOnce * times;
  // Ward with a compound cost (Ovika: {3} and 3 life): both parts must be payable.
  const hand = s.players[p]?.hand ?? [];
  const sacrificeable = () =>
    s.battlefield.filter(
      (id) => s.objects[id]?.controller === p && (!e.sacrificeFilter || matchesObjectFilter(s, p, id, e.sacrificeFilter)),
    );
  // Ward "collect evidence N": the cards in the graveyard of the player who pays it.
  // Ward "waterbend {4}", Waterbending Lesson: untapped artifacts and creatures pay {1} each.
  const purpose = e.waterbend ? { waterbend: Number.POSITIVE_INFINITY } : undefined;
  const evidence = e.collectEvidence ? evidenceCards(s, p, "", e.collectEvidence) : undefined;
  // "unless that player pays {B} or {3}" (Lim-Dûl's Hex): a choice of two mana costs (no discard).
  const orManaOnly = !e.discard && !!e.orMana && !!mana;
  const canMana = !mana || canPay(s, p, mana, undefined, purpose);
  const canOr = orManaOnly && canPay(s, p, e.orMana as ManaCost);
  const canDo =
    (canMana || canOr) &&
    (!life || payableLife(s, p) >= life) &&
    (!e.discard || hand.length > 0 || (!!e.orMana && canPay(s, p, e.orMana))) &&
    sacrificeable().length >= (e.sacrifice ?? 0) &&
    evidence !== null;
  if (!canDo) return;
  const answer = r.vars[key("unless")];
  if (!answer) {
    const manaText = mana
      ? orManaOnly
        ? msg("{cost} or {other}", { cost: costToText(mana), other: costToText(e.orMana as ManaCost) })
        : costToText(mana)
      : "";
    const what = payCostText({
      mana: mana && e.waterbend ? msg("waterbend {cost}", { cost: manaText }) : manaText,
      life: life ? msg("{n} life", { n: life }) : "",
      discard: e.discard
        ? e.orMana
          ? msg("discard a card or pay {cost}", { cost: costToText(e.orMana) })
          : msg("discard a card")
        : "",
      poison: e.poison,
      sacrifice: e.sacrifice ? { count: e.sacrifice, filter: e.sacrificeFilter } : undefined,
      collectEvidence: e.collectEvidence,
    });
    return {
      ask: {
        player: p,
        key: key("unless"),
        request: {
          type: "yesNo",
          intent: "unlessPay",
          prompt: msg("{card}: pay {cost} to avoid it?", { card: cardRefOf(s, ctx.sourceId), cost: what }),
          suggested: [1],
        },
      },
    };
  }
  if (answer[0] !== 1) return;
  // Titania: "discard a card or pay {2}": the player chooses, if both are possible.
  let viaMana = false;
  if (e.discard && e.orMana) {
    const canMana = canPay(s, p, e.orMana);
    if (hand.length === 0) viaMana = true;
    else if (canMana) {
      const how = r.vars[key("unlessHow")];
      if (!how) {
        return {
          ask: {
            player: p,
            key: key("unlessHow"),
            request: {
              type: "pick",
              intent: "unlessPay",
              prompt: msg("How to pay?"),
              options: ["discard", "mana"],
              labels: { discard: msg("ctx:choice|Discard a card"), mana: msg("Pay {cost}", { cost: costToText(e.orMana) }) },
              min: 1,
              max: 1,
              suggested: ["mana"],
            },
          },
        };
      }
      viaMana = how[0] === "mana";
    }
  }
  if (viaMana && e.orMana) {
    if (!canPay(s, p, e.orMana)) return;
    payMana(s, p, e.orMana);
  }
  // Ward "discard a card" (Gideon the Oathless): the player chooses the card.
  if (e.discard && !viaMana) {
    // Ward "discard a card at random" (Alpharael, Stonechosen).
    if (e.discardRandom && !r.vars[key("unlessCard")]) {
      const pool = [...hand];
      shuffle(s, pool);
      r.vars[key("unlessCard")] = pool.slice(0, 1);
    }
    const card = r.vars[key("unlessCard")];
    if (!card) {
      const cheapest = [...hand].sort(
        (a, b) => manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
      );
      return {
        ask: {
          player: p,
          key: key("unlessCard"),
          request: {
            type: "pick",
            intent: "discard",
            prompt: msg("Choose the card to discard"),
            options: [...hand],
            min: 1,
            max: 1,
            suggested: cheapest.slice(0, 1),
          },
        },
      };
    }
    const id = String(card[0]);
    if (!hand.includes(id)) return;
    emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
    announceDiscard(s, p, moveDiscarded(s, p, id, true));
    announceDiscardBatch(s, p, 1);
  }
  // Ward "sacrifice three permanents" (Emrakul, the Exigent Doom).
  if (e.sacrifice) {
    const perms = sacrificeable();
    const chosen = r.vars[key("unlessSac")];
    if (!chosen) {
      const cheapest = [...perms].sort(
        (a, b) => manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
      );
      return {
        ask: {
          player: p,
          key: key("unlessSac"),
          request: {
            type: "pick",
            intent: "sacrifice",
            prompt: msg("Sacrifice {n} permanents", { n: e.sacrifice }),
            options: perms,
            min: e.sacrifice,
            max: e.sacrifice,
            suggested: cheapest.slice(0, e.sacrifice),
          },
        },
      };
    }
    const ids = chosen.map(String).filter((id) => perms.includes(id));
    if (ids.length < e.sacrifice) return;
    for (const id of ids) sacrifice(s, id);
  }
  if (evidence) collectEvidence(s, p, evidence);
  // Two costs to choose from: the player chooses if they can pay both.
  let payWith = mana;
  if (orManaOnly && e.orMana) {
    if (!canMana) payWith = e.orMana;
    else if (canOr) {
      const how = r.vars[key("unlessHow")];
      if (!how) {
        return {
          ask: {
            player: p,
            key: key("unlessHow"),
            request: {
              type: "pick",
              intent: "unlessPay",
              prompt: msg("How to pay?"),
              options: ["mana", "orMana"],
              labels: {
                mana: msg("Pay {cost}", { cost: costToText(mana as ManaCost) }),
                orMana: msg("Pay {cost}", { cost: costToText(e.orMana) }),
              } as Record<string, string>,
              min: 1,
              max: 1,
              suggested: ["mana"],
            },
          },
        };
      }
      if (how[0] === "orMana") payWith = e.orMana;
    }
  }
  if (payWith) {
    if (!canPay(s, p, payWith, undefined, purpose)) return;
    payMana(s, p, payWith, undefined, purpose);
    if (e.waterbend) bent(s, p, "water");
  }
  if (life) payLife(s, p, life);
  // The Serpent Society: "Ward—Get five poison counters".
  const pl = s.players[p];
  if (e.poison && pl) {
    pl.counters ??= {};
    const counters = pl.counters;
    counters.poison = (counters.poison ?? 0) + e.poison;
    bump(s); // corrupted: statics depend on it
    emit({ type: "poison", player: p, amount: e.poison, total: counters.poison });
  }
  // "If they do, …" (Divert Disaster).
  store(r, e.paidStore, 1);
  return { skip: e.skip };
}

/** "You may pay [this card]'s mana cost" (automatic payment); `store`: 1 if paid. */
function payCostOf(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { what: Ref; store: string; prompt: string },
): OpResult {
  const id = resolveRef(s, ctx, e.what)[0];
  const cost = s.defs[s.objects[id ?? ""]?.defId ?? ""]?.manaCost;
  store(r, e.store, 0);
  if (!id || !cost || !canPay(s, ctx.controller, cost)) return;
  const answer = r.vars[key("paycost")];
  if (!answer) {
    return {
      ask: {
        player: ctx.controller,
        key: key("paycost"),
        request: {
          type: "yesNo",
          intent: "may",
          prompt: msg("{card}: {prompt}", { card: cardRefOf(s, ctx.sourceId), prompt: e.prompt }),
          suggested: [1],
        },
      },
    };
  }
  if (answer[0] !== 1 || !canPay(s, ctx.controller, cost)) return;
  payMana(s, ctx.controller, cost);
  store(r, e.store, 1);
  return;
}

/**
 * Choose X, then pay {X} (or X life: `life`, Necrodominance); stored under `store` (Wildborn Preserver). `who`: that
 * player pays (Plague of Vermin), the controller by default. `max`: "pay {1} up to three times" (Hawkeye).
 */
function payX(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: Key,
  e: { prompt: string; store: string; life?: boolean; who?: Ref; max?: Amount },
): OpResult {
  if (r.vars[`$${e.store}`]) return;
  // "Pay any amount of life" (Necrodominance): at most their life total (119.4). Plague of Vermin: another player
  // pays.
  const payer = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x) && !s.players[x]?.lost) : ctx.controller;
  if (!payer) {
    store(r, e.store, 0);
    return;
  }
  const life = payableLife(s, payer);
  const max = Math.min(
    e.life ? Math.max(0, life) : availableMana(s, payer),
    e.max !== undefined ? evalAmount(s, ctx, e.max) : Number.POSITIVE_INFINITY,
  );
  const answer = r.vars[key("payx")];
  if (!answer) {
    return {
      ask: {
        player: payer,
        key: key("payx"),
        request: {
          type: "number",
          intent: "payX",
          prompt: msg("{card}: {prompt}", { card: cardRefOf(s, ctx.sourceId), prompt: e.prompt }),
          min: 0,
          max,
          suggested: [e.life ? Math.min(max, Math.max(0, life - 10)) : max],
        },
      },
    };
  }
  const x = Math.min(Number(answer[0]), max);
  if (e.life) {
    if (x > 0) payLife(s, payer, x);
    store(r, e.store, Math.max(0, x));
    return;
  }
  if (x > 0 && canPay(s, payer, { generic: x, colored: {}, x: 0 })) {
    payMana(s, payer, { generic: x, colored: {}, x: 0 });
    store(r, e.store, x);
  } else store(r, e.store, 0);
  return;
}

/**
 * Fabrication Foundry: exile [artifacts] you control with total mana value N or greater (the cheapest first);
 * `store` is 1 if done.
 */
function exileForManaValue(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  e: { filter: ObjectFilter; atLeast: Amount; store: string },
): OpResult {
  const need = evalAmount(s, ctx, e.atLeast);
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const options = s.battlefield
    .filter(
      (id) => s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
    )
    .sort((a, b) => mv(a) - mv(b));
  const chosen: ObjectId[] = [];
  let total = 0;
  for (const id of options) {
    if (total >= need && chosen.length > 0) break;
    chosen.push(id);
    total += mv(id);
  }
  if (chosen.length === 0 || total < need) {
    store(r, e.store, 0);
    return;
  }
  for (const id of chosen) moveObject(s, id, "exile");
  store(r, e.store, 1);
  return;
}
