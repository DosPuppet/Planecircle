/** Engine effects: stack and casting permissions (counterspells, copies, casting from another zone). Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import { payLife, sacrifice } from "../actions";
import type { OpHandlers, OpResult } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  cardRefOf,
  evalAmount,
  grantPlay,
  moveDiscarded,
  moveWithSpec,
  nextTurnOf,
  resolveRef,
  store,
  withX,
} from "../effects";
import { bump } from "../layers";
import { availableMana, canPay, costToText, manaValue, payMana } from "../mana";
import {
  castTerms,
  collectEvidence,
  copyStackItem,
  counterItem,
  dropNowPermissions,
  evidenceCards,
  exileSpell,
  plotCard,
  spellView,
  stackItemSpecs,
  suspendCard,
  timesCost,
} from "../stack";
import { applyRetarget, retargetRequest } from "../stackChoices";
import {
  alivePlayers,
  apnapOrder,
  bent,
  chars,
  createObject,
  emit,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  removeFromGame,
  rulesEvent,
  setPrepared,
  shuffle,
} from "../state";
import { payableLife } from "../statics";
import { legalTargets, matchesCard, matchesObjectFilter, matchesView } from "../targets";
import { msg } from "../text";
import type { ChoiceValue, GameState, ManaCost, ObjectId, PlayerId, Resolution, StackItem } from "../types";

export const HANDLERS: OpHandlers = {
  discover(s, r, e, ctx, key) {
    // The discovering player is fixed on the first pass: on resumption, the card that designated them may have changed
    // zones (Zoyowa's Justice: "the creature's controller", the creature having been put into the library).
    const p =
      (r.vars[key("who")]?.[0] as string | undefined) ??
      (e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller);
    if (!p) return;
    r.vars[key("who")] = [p];
    // The resolution can resume after the question: the exiling happens only once.
    if (!r.vars[key("done")]) {
      const n = evalAmount(s, ctx, e.n);
      // The filter is resolved first: Possibility Storm reads the card types of the spell while it is on the stack.
      const filter = e.filter ? withX(s, e.filter, ctx) : undefined;
      const lib = s.players[p]?.library ?? [];
      const rest: ObjectId[] = [];
      // Possibility Storm: the spell is exiled before the search, then goes to the bottom with the other exiled cards.
      // A spell that already left the stack (countered, exiled by another Possibility Storm): nothing is done.
      if (e.exileFirst) {
        const spells = resolveRef(s, ctx, e.exileFirst).filter((id) => s.stack.some((x) => x.id === id && x.kind === "spell"));
        if (spells.length === 0) return;
        for (const id of spells) {
          const moved = exileSpell(s, id);
          if (moved) rest.push(moved);
        }
      }
      let hit: ObjectId | undefined;
      while (lib.length && !hit) {
        const d = s.defs[s.objects[lib[0] as string]?.defId ?? ""];
        const id = moveObject(s, lib[0] as string, "exile");
        if (!id) break;
        if (
          d &&
          !d.types.includes("Land") &&
          (e.cascade ? manaValue(d.manaCost) < n : manaValue(d.manaCost) <= n) &&
          (!filter || matchesCard(s, p, id, { ...filter, controller: undefined }))
        )
          hit = id;
        else rest.push(id);
      }
      emit({ type: "reveal", player: p, defIds: [...rest, ...(hit ? [hit] : [])].map((id) => s.objects[id]?.defId ?? "") });
      shuffle(s, rest);
      const bottom = rest.map((id) => moveObject(s, id, "library", { position: "bottom" })).filter((id): id is string => !!id);
      r.vars[key("done")] = [1];
      r.vars[key("bottom")] = bottom;
      r.vars[key("hit")] = hit ? [hit] : [];
      if (!e.cascade) rulesEvent(s, { e: "discover", player: p, n });
    }
    const hit = r.vars[key("hit")]?.[0] as ObjectId | undefined;
    const storeHit = (id: ObjectId) => {
      if (!e.store) return;
      r.vars[`$ids:${e.store}`] = [id];
      store(r, e.store, 1);
    };
    const answer = r.vars[key("cast")];
    // Card cast: the spell on the stack (Hit the Mother Lode reads its mana value).
    if (answer?.length) {
      dropNowPermissions(s);
      storeHit(String(answer[0]));
      return;
    }
    if (!hit || s.objects[hit]?.zone !== "exile") {
      dropNowPermissions(s);
      return;
    }
    // 701.57a: "you may cast it without paying its mana cost; if you don't, put that card into your hand", during the
    // resolution (608.2g).
    if (!answer) {
      grantPlay(s, p, [hit], "thisTurn", { free: true, anyTime: true, source: ctx.sourceId, now: true });
      if (castTerms(s, p, hit)) {
        return {
          castNow: {
            player: p,
            key: key("cast"),
            cards: [hit],
            prompt: e.cascade
              ? msg("Cascade: cast {card} for free? (otherwise, on the bottom of your library)", { card: cardRefOf(s, hit) })
              : msg("Discover: cast {card} for free? (otherwise, into your hand)", { card: cardRefOf(s, hit) }),
          },
        };
      }
    }
    dropNowPermissions(s);
    // Cascade (702.85a): the card not cast goes to the bottom with the other exiled cards, in a random order.
    if (e.cascade) {
      const last = moveObject(s, hit, "library", { position: "bottom" });
      const lib = s.players[p]?.library;
      const group = [...(r.vars[key("bottom")] ?? []).map(String), ...(last ? [last] : [])].filter((id) => lib?.includes(id));
      if (lib && group.length > 1) {
        shuffle(s, group);
        const others = lib.filter((id) => !group.includes(id));
        lib.splice(0, lib.length, ...others, ...group);
      }
      return;
    }
    const inHand = moveObject(s, hit, "hand");
    storeHit(inHand ?? hit);
    return;
  },
  suspend(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) suspendCard(s, id, e.time);
    return;
  },
  castNow(s, r, e, ctx, key) {
    // Kotis: "spells with mana value X or less from among them".
    const max = e.maxManaValue === undefined ? undefined : evalAmount(s, ctx, e.maxManaValue);
    const cards = resolveRef(s, ctx, e.what).filter(
      (id) => max === undefined || manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= max,
    );
    const step = castNowLoop(s, r, key, ctx.controller, ctx.sourceId, cards, e);
    if (step.ask) return step.ask;
    if (e.storeCast) {
      r.vars[`$ids:${e.storeCast}`] = step.cast;
      store(r, e.storeCast, step.cast.length);
    }
    if (e.storeRest) {
      r.vars[`$ids:${e.storeRest}`] = step.rest;
      store(r, e.storeRest, step.rest.length);
    }
    return;
  },
  counterAbilitySilence(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "ability");
      if (!item) continue;
      const host = item.sourceId;
      counterItem(s, id, ctx.sourceDefId);
      const o = s.objects[host];
      if (o?.zone !== "battlefield" || s.objects[ctx.sourceId]?.zone !== "battlefield") continue;
      if (!chars(s, host).types.some((t) => t === "Artifact" || t === "Creature" || t === "Planeswalker")) continue;
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: [host],
        duration: "permanent",
        whileSource: ctx.sourceId,
        loseAllAbilities: true,
      });
      bump(s);
    }
    return;
  },
  counter(s, r, e, ctx) {
    let n = 0;
    const moved: string[] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id);
      const d = item ? s.defs[item.sourceDefId] : undefined;
      // "If a permanent spell is countered this way, exile it instead" (Thranduil's Decree): `exile` as a filter.
      const exile =
        typeof e.exile === "object"
          ? item?.kind === "spell" && !item.copy && !!d && matchesView(spellView(d, item.controller), e.exile, ctx.controller)
          : !!e.exile;
      const uid = item ? s.objects[item.sourceId]?.uid : undefined;
      if (!counterItem(s, id, ctx.sourceDefId, exile)) continue;
      n++;
      // The countered card, wherever it went (exile, graveyard): Thranduil's Decree, Desertion.
      const card =
        e.storeMoved && uid
          ? Object.values(s.objects).find((o) => o.uid === uid && (o.zone === "exile" || o.zone === "graveyard"))?.id
          : undefined;
      if (card) moved.push(card);
    }
    store(r, e.store, n);
    if (e.storeMoved) r.vars[`$ids:${e.storeMoved}`] = moved;
    return;
  },
  unlessPay(s, r, e, ctx, key) {
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
      const parts = [
        mana && e.waterbend ? msg("waterbend {cost}", { cost: manaText }) : manaText,
        life ? msg("{n} life", { n: life }) : "",
        e.discard ? (e.orMana ? msg("discard a card or pay {cost}", { cost: costToText(e.orMana) }) : msg("discard a card")) : "",
        e.poison ? msg("get {n} poison counters", { n: e.poison }) : "",
        e.sacrifice
          ? e.sacrificeFilter?.types?.includes("Creature")
            ? msg("sacrifice {n} creature(s)", { n: e.sacrifice })
            : e.sacrificeFilter?.notTypes?.includes("Land")
              ? msg("sacrifice {n} nonland permanents", { n: e.sacrifice })
              : msg("sacrifice {n} permanents", { n: e.sacrifice })
          : "",
        e.collectEvidence ? msg("collect evidence {n}", { n: e.collectEvidence }) : "",
      ].filter(Boolean);
      const what = parts.length ? parts.reduce((a, b) => msg("{a} and {b}", { a, b })) : "";
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
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
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
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
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
  },
  impulse(s, r, e, ctx, key) {
    const player = s.players[ctx.controller];
    if (!player) return;
    let exiled = r.vars[key("impulse")]?.map(String);
    if (!exiled) {
      exiled = [];
      for (const id of player.library.slice(0, e.n)) {
        const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
        if (n) exiled.push(n);
      }
      r.vars[key("impulse")] = exiled;
    }
    if (exiled.length === 0) return;
    const chosen = exiled.length === 1 ? exiled : r.vars[key("impulsePick")]?.map(String);
    if (!chosen) {
      return {
        ask: {
          player: ctx.controller,
          key: key("impulsePick"),
          request: {
            type: "pick",
            intent: "impulse",
            prompt: msg("Choose the exiled card you may play this turn"),
            options: exiled,
            min: 1,
            max: 1,
            suggested: [exiled[0] as string],
          },
        },
      };
    }
    grantPlay(s, ctx.controller, chosen, e.until ?? "thisTurn", {});
    return;
  },
  prepare(s, _r, e, ctx) {
    const f = e.filter;
    const ids = f
      ? s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, f, ctx.sourceId))
      : e.what
        ? resolveRef(s, ctx, e.what)
        : [];
    for (const id of ids) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") setPrepared(s, o, e.value);
    }
    return;
  },
  payCostOf(s, r, e, ctx, key) {
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
  },
  plot(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) plotCard(s, id);
    return;
  },
  copySpell(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.count);
    const copier = (e.for && resolveRef(s, ctx, e.for).find((p) => isPlayer(s, p) && !s.players[p]?.lost)) || ctx.controller;
    for (const id of resolveRef(s, ctx, e.what)) {
      // "Copy this spell" while it resolves (Chain of Vapor): `ref.self` is its card, the spell on the stack is its item.
      const item = s.stack.find((x) => x.id === id) ?? s.stack.find((x) => x.kind === "spell" && x.sourceId === id);
      if (!item) continue;
      // Spell, activated or triggered ability (Return the Favor, Ertha Jo): new targets may be chosen before priority.
      for (let i = 0; i < n; i++) {
        const id = copyStackItem(s, item, copier);
        const copy = id ? s.stack.find((x) => x.id === id) : undefined;
        if (copy && (e.haste || e.atEnd || e.nonlegendary || e.loyalty !== undefined))
          copy.arrival = {
            ...copy.arrival,
            ...(e.haste ? { haste: true } : {}),
            ...(e.atEnd ? { atEnd: e.atEnd } : {}),
            ...(e.nonlegendary ? { nonlegendary: true } : {}),
            ...(e.loyalty !== undefined ? { loyalty: Math.max(0, evalAmount(s, ctx, e.loyalty)) } : {}),
          };
      }
    }
    return;
  },
  payX(s, r, e, ctx, key) {
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
  },
  changeTarget(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id);
      if (!item) continue;
      const entries = Object.entries(item.targets).filter(([, ids]) => ids.length > 0);
      const [specId, current] = entries[0] ?? [];
      if (!specId || !current) continue;
      if (entries.length > 1 || current.length > 1) {
        // Several targets ("you may choose new targets", Commandeer, Speedball): for each word "target", as many targets
        // as originally, the original ones suggested (as for a copy, 707.10c).
        for (const [sid] of entries) {
          const k = key(`ct-${id}-${sid}`);
          const request = retargetRequest(s, item, sid, cardRefOf(s, item.sourceId));
          if (!request) continue;
          const answer = r.vars[k];
          if (!answer) return { ask: { player: ctx.controller, key: k, request } };
          applyRetarget(s, item, sid, request, answer);
        }
        continue;
      }
      const spec = stackItemSpecs(s, item).find((x) => x.id === specId);
      if (!spec) continue;
      const options = legalTargets(s, item.controller, spec, item.sourceId).filter((x) => x !== current[0] && x !== item.id);
      if (options.length === 0) continue;
      const answer = r.vars[key(`ct-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key(`ct-${id}`),
            request: {
              type: "pick",
              intent: "changeTarget",
              prompt: msg("Choose the new target"),
              options,
              min: 0,
              max: 1,
              suggested: [options[0] as string],
            },
          },
        };
      }
      if (answer[0] !== undefined) item.targets = { ...item.targets, [specId]: [String(answer[0])] };
    }
    return;
  },
  spellArrivalCounters(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && n > 0) item.arrival = { ...item.arrival, counters: [...(item.arrival?.counters ?? []), { kind: "+1/+1", n }] };
    }
    return;
  },
  tripleTriad(s, _r, _e, ctx) {
    const exiled: ObjectId[] = [];
    for (const p of apnapOrder(s)) {
      const top = s.players[p]?.library[0];
      if (!top) continue;
      const id = moveObject(s, top, "exile");
      if (id) exiled.push(id);
    }
    emit({ type: "reveal", player: ctx.controller, defIds: exiled.map((id) => s.objects[id]?.defId ?? "") });
    const mine = exiled.find((id) => s.objects[id]?.owner === ctx.controller);
    if (!mine) return;
    const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const playable = [mine, ...exiled.filter((id) => id !== mine && mv(id) < mv(mine))];
    grantPlay(s, ctx.controller, playable, "thisTurn", { free: true });
    return;
  },
  countResolution(s, r, e, ctx) {
    const k = `${ctx.sourceId}:${ctx.sourceDefId}`;
    s.turn.resolutionCounts = { ...(s.turn.resolutionCounts ?? {}), [k]: (s.turn.resolutionCounts?.[k] ?? 0) + 1 };
    store(r, e.store, s.turn.resolutionCounts[k] ?? 0);
    return;
  },
  spellFate(s, r, e, ctx) {
    // Without `what`: the resolving spell.
    const items = e.what
      ? resolveRef(s, ctx, e.what)
          .map((id) => s.stack.find((x) => x.id === id && x.kind === "spell"))
          .filter((x): x is StackItem => !!x)
      : [r.item];
    for (const item of items) {
      if (e.fate === "plot") item.plotOnResolve = true;
      else if (e.fate === "rebound") item.rebound = true;
      else if (e.fate === "battlefieldTransformed") item.toBattlefieldTransformed = true;
      else if (e.fate === "bottom") item.bottomInstead = true;
      else if (e.what) item.exileWithCounter = e.counter ?? "";
      else item.flashback = true;
    }
    return;
  },
  grantPlay(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter(
      (id) => s.objects[id]?.zone === "exile" || s.objects[id]?.zone === "graveyard" || s.objects[id]?.zone === "hand",
    );
    if (e.replacePrevious && ids.length) s.playPermissions = (s.playPermissions ?? []).filter((p) => p.source !== ctx.sourceId);
    if (e.for === "owner") {
      for (const id of ids) {
        const owner = s.objects[id]?.owner ?? ctx.controller;
        // "until your next turn": the turn before the next turn of the effect's controller.
        const until =
          e.duration === "forever"
            ? "forever"
            : e.duration === "untilOwnersNextTurn"
              ? "yourNextTurn"
              : e.duration === "untilYourNextTurn"
                ? nextTurnOf(s, ctx.controller) - 1
                : "thisTurn";
        grantPlay(s, owner, [id], until, {
          free: e.free,
          anyTime: e.anyTime,
          extraCost: e.extraCost,
          tapped: e.tapped,
        });
      }
      return;
    }
    const until =
      e.duration === "forever"
        ? "forever"
        : e.duration === "untilYourNextTurn"
          ? "yourNextTurn"
          : e.duration === "untilYourNextEndStep"
            ? "yourNextEndStep"
            : "thisTurn";
    const opts = {
      free: e.free,
      anyTime: e.anyTime,
      ...(e.flashback ? { flashback: true, harmonize: e.flashback === "harmonize" || undefined } : {}),
      anyMana: e.anyMana,
      condition: e.condition,
      source: ctx.sourceId,
      after: e.after,
      payLifeManaValue: e.payLifeManaValue,
      group: e.oneOf ? newId(s, "g") : undefined,
      adventureOnly: e.adventureOnly,
    };
    // Ian Malcolm: each player other than the card's owner.
    if (e.for === "nonOwners") {
      for (const id of ids)
        for (const p of alivePlayers(s).filter((q) => q !== s.objects[id]?.owner)) grantPlay(s, p, [id], until, opts);
    } else grantPlay(s, ctx.controller, ids, until, opts);
    return;
  },
  castCopiesFree(s, r, e, ctx, key) {
    // Uldaros Theorix: the exiled cards are copied; the player chooses which ones to cast (limited total mana value),
    // then casts them during the resolution.
    const cards = [...new Set(e.what.flatMap((w) => resolveRef(s, ctx, w)))].filter((id) => !!s.objects[id]);
    const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    // Without an effective limit (all the cards fit), no question: all are copied.
    const maxCount = e.maxCount ?? Number.POSITIVE_INFINITY;
    if (!r.vars[key("copies")] && cards.reduce((n, id) => n + mv(id), 0) <= e.maxTotalManaValue && cards.length <= maxCount)
      r.vars[key("copies")] = cards;
    const answer = r.vars[key("copies")];
    if (!answer) {
      const suggested: string[] = [];
      let total = 0;
      for (const id of [...cards].sort((a, b) => mv(b) - mv(a))) {
        if (total + mv(id) > e.maxTotalManaValue || suggested.length >= maxCount) continue;
        suggested.push(id);
        total += mv(id);
      }
      return {
        ask: {
          player: ctx.controller,
          key: key("copies"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: msg("Copies to cast for free (total mana value {n} or less)", { n: e.maxTotalManaValue }),
            options: cards,
            min: 0,
            max: Math.min(cards.length, maxCount),
            suggested,
          },
        },
      };
    }
    // The copies are created only once (the resolution resumes after each spell cast).
    if (!r.vars[key("made")]) {
      let total = 0;
      const made: string[] = [];
      for (const id of answer.map(String)) {
        const o = s.objects[id];
        if (!o || !cards.includes(id) || total + mv(id) > e.maxTotalManaValue || made.length >= maxCount) continue;
        total += mv(id);
        const copy = createObject(s, o.defId, ctx.controller, "exile");
        copy.cardCopy = true;
        made.push(copy.id);
      }
      r.vars[key("made")] = made;
    }
    // 608.2g: the copies are cast during the resolution; those not cast cease to exist (707.12).
    const copies = (r.vars[key("made")] ?? []).map(String);
    const step = castNowLoop(s, r, key, ctx.controller, ctx.sourceId, copies, { free: !e.paid, many: true });
    if (step.ask) return step.ask;
    for (const id of step.rest) removeFromGame(s, id);
    store(r, e.storeCast, step.cast.length);
    return;
  },
};

/**
 * 608.2g: "you may cast [these cards]" during a resolution. Sets a priority restricted to these cards (keys `cast0`,
 * `cast1`…: the card cast, or empty for a refusal) until a refusal, or after one spell if `many` is false. Returns the
 * question to ask, or, once done, the spells cast and the cards left in their zone.
 */
function castNowLoop(
  s: GameState,
  r: Resolution,
  key: (suffix: string) => string,
  player: PlayerId,
  source: ObjectId,
  cards: ObjectId[],
  opts: { free?: boolean; many?: boolean; after?: "exile" | "bottom"; anyMana?: boolean; cost?: ManaCost },
): { ask?: OpResult; cast: ObjectId[]; rest: ObjectId[] } {
  const cast: ObjectId[] = [];
  let declined = false;
  let i = 0;
  for (; r.vars[key(`cast${i}`)]; i++) {
    const answer = r.vars[key(`cast${i}`)] as ChoiceValue[];
    if (!answer.length) {
      declined = true;
      break;
    }
    cast.push(String(answer[0]));
  }
  // A card cast has changed identifier (400.7): only the cards still in their zone remain.
  const rest = cards.filter((id) => !!s.objects[id] && s.objects[id]?.zone !== "stack");
  dropNowPermissions(s);
  if (!declined && (opts.many || cast.length === 0)) {
    const open = rest.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land"));
    grantPlay(s, player, open, "thisTurn", {
      free: opts.free,
      anyTime: true,
      anyMana: opts.anyMana,
      after: opts.after,
      source,
      now: true,
      ...(opts.cost ? { cost: opts.cost } : {}),
    });
    // Only the cards that can really be cast (targets, additional costs) are offered.
    const castable = open.filter((id) => castTerms(s, player, id));
    if (castable.length) {
      const names = castable.map((id) => cardRefOf(s, id)).join(", ");
      return {
        ask: {
          castNow: {
            player,
            key: key(`cast${i}`),
            cards: castable,
            // Short: the game banner shows it on one line.
            prompt:
              castable.length > 1
                ? opts.free
                  ? msg("{card}: cast a spell for free?", { card: cardRefOf(s, source) })
                  : msg("{card}: cast a spell?", { card: cardRefOf(s, source) })
                : opts.free
                  ? msg("{card}: cast {spell} for free?", { card: cardRefOf(s, source), spell: names })
                  : msg("{card}: cast {spell}?", { card: cardRefOf(s, source), spell: names }),
          },
        },
        cast,
        rest,
      };
    }
    dropNowPermissions(s);
  }
  return { cast, rest };
}
