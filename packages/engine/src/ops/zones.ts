/** Engine effects: moves between zones (destroy, exile, sacrifice, search, mill, discard…). Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import { dealDamage, destroy, drawCards, removeFromCombat, sacrifice } from "../actions";
import { cardRef } from "../choices";
import type { EffectContext, OpHandlers, OpResult } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  cardRefOf,
  damageSource,
  evalAmount,
  evalMoveSpec,
  grantPlay,
  millCards,
  moveAndLog,
  moveDiscarded,
  moveWithSpec,
  putFaceDown,
  readVar,
  resolveRef,
  store,
  withX,
  zoneCards,
} from "../effects";
import { RulesError } from "../errors";
import { hasKeyword } from "../layers";
import { manaValue } from "../mana";
import { chooseReplacementOrder } from "../modifiers";
import { firstOfEachName, hasName, shareName } from "../names";
import { asEntersChoices, auraHosts, type EntersContext } from "../replacement";
import { bounceSpell, exileSpell, spellToZone } from "../stack";
import {
  apnapOrder,
  bent,
  bump,
  changeCounters,
  chars,
  createObject,
  emit,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  P1P1,
  random,
  registerDef,
  removeFromGame,
  rulesEvent,
  shuffle,
  tapObject,
  turnFaceUp,
  untapObject,
} from "../state";
import { payableLife, playerStatics, quantityMods, recipientMatches, tokenShielded } from "../statics";
import { holderOf, matchesCard, matchesObjectFilter, shareCreatureType } from "../targets";
import { msg } from "../text";
import { logTurnEvent } from "../turnlog";
import type { CardType, Effect, GameObject, GameState, MoveSpec, ObjectFilter, ObjectId, PlayerId, Resolution } from "../types";
import { PERMANENT_TYPES } from "../types";
import { chooseAttacked } from "./permanents";

/** Names of the permanent types (questions of `keep`). */
const TYPE_LABEL: Partial<Record<CardType, string>> = {
  Artifact: msg("artifact"),
  Creature: msg("creature"),
  Enchantment: msg("enchantment"),
  Land: msg("land"),
  Planeswalker: msg("planeswalker"),
  Battle: msg("battle"),
};

/** The player who will control the object put onto the battlefield: you, or its owner. */
const ownerOr =
  (s: GameState, spec: MoveSpec, you: PlayerId) =>
  (id: ObjectId): PlayerId =>
    spec.underYourControl ? you : (s.objects[id]?.owner ?? you);

/** Entering choices of an object put onto the battlefield by an effect (shock land, defender, "as this enters" effects). */
type Arrival = Partial<EntersContext>;

/**
 * Entering choices of the objects put onto the battlefield by an effect, asked of the player who will control them
 * before any move (the operation is replayed with the answer): shock lands ("as this enters, you may pay 2 life; if you
 * don't, it enters tapped"); "as this enters" effects (614.1c, 614.12: `asEntersChoices`, as for a resolving permanent
 * spell; none for a permanent put face down, 708.2); what a permanent put onto the battlefield attacking attacks (508.4).
 * `random`: after a random draw, which would not be replayed, no question (no life paid, the suggested answers).
 * Returns the question to ask, otherwise the choices of each object.
 */
function arrivalChoices(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  ids: readonly ObjectId[],
  spec: MoveSpec,
  controllerOf: (id: ObjectId) => PlayerId,
  key: (k: string) => string,
  random = false,
): Extract<OpResult, { ask: unknown }> | Map<ObjectId, Arrival> {
  const out = new Map<ObjectId, Arrival>();
  if (spec.to !== "battlefield") return out;
  const designated = typeof spec.attacking === "object" ? resolveRef(s, ctx, spec.attacking) : undefined;
  for (const id of ids) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    const who = controllerOf(id);
    const n = d?.shockLand;
    if (d && n && !random && !spec.tapped && !spec.as && payableLife(s, who) >= n) {
      const k = key(`shock-${id}`);
      const answer = r.vars[k];
      if (!answer) {
        return {
          ask: {
            player: who,
            key: k,
            request: {
              type: "yesNo",
              intent: "may",
              prompt: msg("{card}: pay {n} life so that it enters untapped?", { card: cardRef(d.id), n }),
              suggested: [payableLife(s, who) > 2 * n + 4 ? 1 : 0],
            },
          },
        };
      }
      if (answer[0] === 1) out.set(id, { shockPaid: true });
    }
    if (d && !spec.as) {
      // The entering face: the back face of a transforming card put onto the battlefield transformed (712.14).
      const face = spec.transformed && d.layout === "transform" ? (d.faceDefs?.[1] ?? d) : d;
      const entering = { id, defId: face.id, controller: who };
      const res = asEntersChoices(s, r.vars, entering, key(`enter-${id}:`), random ? "auto" : "ask");
      if ("ask" in res) return res;
      out.set(id, { ...out.get(id), ...res });
    }
    if (d && spec.attacking && !spec.as) {
      const prompt = msg("{card}: what should it attack?", { card: cardRef(d.id) });
      const c = chooseAttacked(s, r, ctx, key(`attack-${id}`), who, designated, prompt, { ask: !random });
      if ("ask" in c) return c;
      out.set(id, { ...out.get(id), attacking: c.defender });
    }
  }
  return out;
}

/** Can each card be given a card type it has, all different (matching, at most ten cards)? */
function assignTypes(s: GameState, ids: ObjectId[]): boolean {
  const types = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""]?.types ?? [];
  const used = new Map<string, ObjectId>();
  const place = (id: ObjectId, seen: Set<string>): boolean => {
    for (const t of types(id)) {
      if (seen.has(t)) continue;
      seen.add(t);
      const holder = used.get(t);
      if (!holder || place(holder, seen)) {
        used.set(t, id);
        return true;
      }
    }
    return false;
  };
  return ids.every((id) => place(id, new Set()));
}

/** "One card per type" suggestion: the cards in order, as long as they take a type still free. */
function greedyOnePerType(s: GameState, ids: ObjectId[]): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ids) if (assignTypes(s, [...out, id])) out.push(id);
  return out;
}

/**
 * "An opponent …" without targeting, in the middle of an effect (piles: the one who separates or chooses): the
 * controller chooses them with `chooseAmong` (no question with a single opponent; suggestion: the next opponent).
 */
function opponentChoice(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  key: (k: string) => string,
  separates?: boolean,
): Extract<OpResult, { ask: unknown }> | { player: PlayerId | undefined } {
  const store = key("opponent");
  const res = HANDLERS.chooseAmong?.(
    s,
    r,
    {
      op: "chooseAmong",
      what: { kind: "eachOpponent" },
      chooser: { kind: "you" },
      store,
      prompt: separates
        ? msg("{card}: choose the opponent who separates the cards into two piles", { card: cardRefOf(s, ctx.sourceId) })
        : msg("{card}: choose the opponent who chooses one of the piles", { card: cardRefOf(s, ctx.sourceId) }),
    },
    ctx,
    (x) => key(`opponent-${x}`),
  );
  if (res && "ask" in res) return res;
  return { player: r.vars[`$ids:${store}`]?.map(String)[0] };
}

export const HANDLERS: OpHandlers = {
  destroy(s, r, e, ctx) {
    const stored: string[] = [];
    let destroyed = 0;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (destroy(s, id, e.noRegenerate, ctx.controller)) destroyed++;
      // Come Back Wrong, Zero Point Ballad: the cards put into the graveyard this way.
      const card = o && (s.players[o.owner]?.graveyard ?? []).find((x) => s.objects[x]?.uid === o.uid);
      if (card) stored.push(card);
    }
    store(r, e.store, destroyed);
    if (e.store) r.vars[`$ids:${e.store}`] = stored;
    return;
  },
  chooseAmong(s, r, e, ctx, key) {
    // Objects, or players ("choose an opponent", without targeting: `fx.chooseOpponent`).
    const ids = resolveRef(s, ctx, e.what).filter((id) =>
      isPlayer(s, id) ? !s.players[id]?.lost : e.anyZone ? !!s.objects[id] : onBattlefield(s, id),
    );
    if (ids.length === 0) return;
    const players = ids.every((id) => isPlayer(s, id));
    const chooser = resolveRef(s, ctx, e.chooser).find((x) => isPlayer(s, x)) ?? ctx.controller;
    // "Any number" (Expose the Culprit): from zero to all.
    if (e.anyNumber) {
      const answer = r.vars[key("among")];
      if (!answer) {
        return {
          ask: {
            player: chooser,
            key: key("among"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? msg("Choose any number of these creatures"),
              options: ids,
              min: 0,
              // Intuition: "three cards" at most.
              max: Math.min(ids.length, e.max ?? ids.length),
              suggested: ids.slice(0, e.max ?? ids.length),
            },
          },
        };
      }
      const chosen = answer
        .map(String)
        .filter((id) => ids.includes(id))
        .slice(0, e.max ?? ids.length);
      r.vars[`$ids:${e.store}`] = chosen;
      r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => !chosen.includes(x));
      return;
    }
    // "Up to one": the question is asked even for a single object, and can be left unanswered.
    if (e.optional) {
      const answer = r.vars[key("among")];
      if (!answer) {
        // Suggestion: first an object of another player (Light of Judgment, The Legend of Yangchen); among their own only,
        // the first when the player chooses for their own effect (champion, Deepfathom Echo), nothing when they choose
        // for another player's effect (an opponent of The Legend of Yangchen does not exile one of their own).
        const others = ids.filter((id) => holderOf(s, id) !== chooser);
        const suggested = others.length > 0 ? others.slice(0, 1) : chooser === ctx.controller ? ids.slice(0, 1) : [];
        return {
          ask: {
            player: chooser,
            key: key("among"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? msg("Choose up to one of these creatures"),
              options: ids,
              min: 0,
              max: 1,
              suggested,
            },
          },
        };
      }
      const chosen = answer
        .map(String)
        .filter((id) => ids.includes(id))
        .slice(0, 1);
      r.vars[`$ids:${e.store}`] = chosen;
      r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => !chosen.includes(x));
      return;
    }
    let picked = ids.length === 1 ? ids[0] : r.vars[key("among")]?.map(String)[0];
    // "… at random" (Indoraptor): the draw is kept with the answers (the resumed resolution does not redo it); no draw
    // for a single option.
    if (picked === undefined && e.random) {
      picked = ids[Math.floor(random(s) * ids.length)] as string;
      r.vars[key("among")] = [picked];
    }
    if (picked === undefined) {
      // Suggestion: a player, the first designated (the next opponent in turn order; "that player or a planeswalker
      // they control": the player); otherwise the object with the greatest toughness.
      const suggested =
        ids.find((id) => isPlayer(s, id)) ??
        ([...ids].sort((a, b) => chars(s, b).toughness - chars(s, a).toughness)[0] as string);
      return {
        ask: {
          player: chooser,
          key: key("among"),
          request: {
            type: "pick",
            intent: players ? "other" : "pickCards",
            prompt: e.prompt ?? (players ? msg("Choose a player") : msg("Choose one of these creatures")),
            options: ids,
            min: 1,
            max: 1,
            suggested: [suggested],
          },
        },
      };
    }
    picked = String(picked);
    r.vars[`$ids:${e.store}`] = [picked];
    r.vars[`$ids:${e.store}Rest`] = ids.filter((x) => x !== picked);
    return;
  },
  tapChosen(s, r, e, ctx, key) {
    const filter = withX(s, e.filter, ctx);
    const options = s.battlefield.filter(
      (id) =>
        s.objects[id]?.controller === ctx.controller &&
        !s.objects[id]?.tapped &&
        matchesObjectFilter(s, ctx.controller, id, filter, ctx.sourceId),
    );
    let chosen: string[] = [];
    if (e.exactly !== undefined && options.length < e.exactly) {
      store(r, e.store, 0);
      return;
    }
    if (options.length) {
      const answer = r.vars[key("tapChosen")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("tapChosen"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt:
                e.exactly !== undefined
                  ? msg("You may tap {n} permanents", { n: e.exactly })
                  : msg("Permanents to tap (as many as you want)"),
              options,
              min: 0,
              max: e.exactly ?? options.length,
              suggested: e.exactly !== undefined ? options.slice(0, e.exactly) : options,
            },
          },
        };
      }
      chosen = answer.map(String).filter((id) => options.includes(id));
      if (e.exactly !== undefined && chosen.length !== 0 && chosen.length !== e.exactly)
        throw new RulesError(msg("Tap exactly {n} permanents, or none", { n: e.exactly }));
    }
    for (const id of chosen) {
      const o = s.objects[id];
      if (o) tapObject(s, o);
    }
    store(r, e.store, chosen.length);
    return;
  },
  millWhileShared(s, _r, e, ctx) {
    // Repeat as long as the two milled cards share a card type or a color (the library, which loses two cards on each
    // loop iteration, bounds it).
    const def = (id: ObjectId) => s.defs[s.objects[id]?.defId ?? ""];
    const traits = (id: ObjectId): string[] =>
      e.nonland && def(id)?.types.includes("Land") ? [] : e.share === "color" ? (def(id)?.colors ?? []) : (def(id)?.types ?? []);
    for (const p of e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller]) {
      for (;;) {
        const top = (s.players[p]?.library ?? []).slice(0, 2);
        if (top.length === 0) break;
        const [a, b] = top.map(traits);
        millCards(s, [[p, top]]);
        if (top.length < 2 || !a?.some((t) => b?.includes(t))) break;
        if (e.draw) drawCards(s, p, 1);
      }
    }
    return;
  },
  exileFromHandLinked(s, r, e, ctx, key) {
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (!p) return;
    const fullHand = s.players[p]?.hand ?? [];
    // Taster of Wares: "reveals X cards from their hand"; the player chooses which (the cheapest suggested).
    const n = e.reveal !== undefined ? Math.max(0, evalAmount(s, ctx, e.reveal)) : fullHand.length;
    let hand = fullHand;
    if (n < fullHand.length) {
      const shown = r.vars[key("reveal")];
      if (!shown) {
        if (n === 0) return;
        const cheap = [...fullHand].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        return {
          ask: {
            player: p,
            key: key("reveal"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: msg("Reveal {n} card(s) from your hand", { n }),
              options: fullHand,
              min: n,
              max: n,
              suggested: cheap.slice(0, n),
            },
          },
        };
      }
      hand = shown.map(String).filter((id) => fullHand.includes(id));
      if (hand.length !== n) throw new RulesError(msg("Reveal exactly {n} card(s)", { n }));
    }
    const options = hand.filter((id) => matchesCard(s, p, id, { ...e.filter, controller: undefined }));
    if (options.length === 0) return;
    const answer = r.vars[key("pick")];
    if (!answer) {
      const best = [...options].sort(
        (a, b) => manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost),
      );
      return {
        ask: {
          player: ctx.controller,
          key: key("pick"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: e.untilLeaves || e.optional ? msg("You may exile a card") : msg("Choose the card to exile"),
            options,
            min: e.untilLeaves || e.optional ? 0 : 1,
            max: 1,
            suggested: best.slice(0, 1),
          },
        },
      };
    }
    if (answer.length === 0) return;
    const id = String(answer[0]);
    if (!options.includes(id)) return;
    // Deep-Cavern Bat: "until this creature leaves the battlefield" (nothing if it is already gone).
    if (e.untilLeaves) {
      if (s.objects[ctx.sourceId]?.zone !== "battlefield") return;
      const moved = moveObject(s, id, "exile");
      if (moved) s.linkedExile.push({ sourceId: ctx.sourceId, cards: [moved], toHand: true });
      return;
    }
    const moved = moveObject(s, id, "exile");
    const src = s.objects[ctx.sourceId];
    if (moved && src) src.linked = [...(src.linked ?? []), moved];
    return;
  },
  keep(s, r, e, ctx, key) {
    // "Keep the chosen permanents": all the choices first, player by player in APNAP order (101.4), by each player or by
    // the controller of the effect; nothing moves before the choices are over. Then the fate falls at the same time on
    // all the other permanents of the filter of the designated players.
    const who = resolveRef(s, ctx, e.who);
    const players = apnapOrder(s).filter((p) => who.includes(p) && !s.players[p]?.lost);
    const among = e.among ?? e.filter;
    const max = e.max !== undefined ? evalAmount(s, ctx, e.max) : 0;
    const power = (id: ObjectId) => Math.max(0, chars(s, id).power);
    const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    const creatures = among.types?.length === 1 && among.types[0] === "Creature";
    // What happens to the permanents not kept (the French agreement follows the noun).
    const fate = creatures
      ? e.fate === "destroy"
        ? msg("ctx:creatures|destroyed")
        : msg("ctx:creatures|sacrificed")
      : e.fate === "destroy"
        ? msg("ctx:permanents|destroyed")
        : msg("ctx:permanents|sacrificed");
    const kept = new Set<ObjectId>();
    for (const p of players) {
      const chooser = e.chooser === "you" ? ctx.controller : p;
      // Suggestion: the best for oneself, the worst for another player.
      const forSelf = chooser === p;
      const owner = s.players[p]?.name ?? p;
      const candidates = s.battlefield.filter(
        (id) => s.objects[id]?.controller === p && matchesObjectFilter(s, ctx.controller, id, among, ctx.sourceId),
      );
      const ask = (k: string, prompt: string, options: ObjectId[], min: number, most: number, suggested: ObjectId[]) => ({
        ask: {
          player: chooser,
          key: key(k),
          request: {
            type: "pick" as const,
            intent:
              e.pick === "onePerType"
                ? ("keepPerType" as const)
                : e.pick === "totalPower"
                  ? ("keepWithinPower" as const)
                  : ("pickCards" as const),
            prompt,
            options,
            min,
            max: most,
            suggested,
          },
        },
      });
      // A single permanent among `options`: no question if there is only one.
      const pickOne = (k: string, options: ObjectId[], prompt: string, best: (a: ObjectId, b: ObjectId) => number) => {
        if (options.length <= 1) return options[0];
        const answer = r.vars[key(k)];
        if (!answer) {
          const sorted = [...options].sort(best);
          return ask(k, prompt, options, 1, 1, [(forSelf ? sorted[0] : sorted[sorted.length - 1]) as string]);
        }
        const id = String(answer[0]);
        if (answer.length !== 1 || !options.includes(id)) throw new RulesError(msg("Choose one of the permanents offered"));
        return id;
      };
      if (e.pick === "onePerType") {
        for (const t of PERMANENT_TYPES) {
          if (among.types && !among.types.includes(t)) continue;
          const ofType = candidates.filter((id) => chars(s, id).types.includes(t));
          const label = TYPE_LABEL[t] ?? t;
          const got = pickOne(
            `keep-${p}-${t}`,
            ofType,
            forSelf
              ? msg("Choose the {type} permanent you keep (the others will be {fate})", { type: label, fate })
              : msg("Choose {player}'s {type} permanent that will be kept", { type: label, player: owner }),
            (a, b) => mv(b) - mv(a),
          );
          if (typeof got === "object") return got;
          if (got) kept.add(got);
        }
      } else if (e.pick === "totalPower") {
        if (candidates.length === 0) continue;
        const answer = r.vars[key(`keep-${p}`)];
        if (!answer) {
          // Suggestion: the strongest that fit within the limit.
          const suggested: ObjectId[] = [];
          let total = 0;
          for (const id of forSelf ? [...candidates].sort((a, b) => power(b) - power(a)) : []) {
            if (total + power(id) > max) continue;
            suggested.push(id);
            total += power(id);
          }
          return ask(
            `keep-${p}`,
            creatures
              ? forSelf
                ? msg("Choose the creatures kept (total power {max} or less); the others will be {fate}", { max, fate })
                : msg("Choose {player}'s creatures kept (total power {max} or less); the others will be {fate}", {
                    player: owner,
                    max,
                    fate,
                  })
              : forSelf
                ? msg("Choose the permanents kept (total power {max} or less); the others will be {fate}", { max, fate })
                : msg("Choose {player}'s permanents kept (total power {max} or less); the others will be {fate}", {
                    player: owner,
                    max,
                    fate,
                  }),
            candidates,
            0,
            candidates.length,
            suggested,
          );
        }
        const chosen = answer.map(String);
        if (chosen.some((id) => !candidates.includes(id)) || new Set(chosen).size !== chosen.length)
          throw new RulesError(msg("Choose among the permanents offered"));
        if (chosen.reduce((n, id) => n + power(id), 0) > max)
          throw new RulesError(msg("Total power greater than {max}", { max }));
        for (const id of chosen) kept.add(id);
      } else if (e.pick === "sharesType") {
        // Creatures that share a type with `id` (itself included): keep the most at home, the fewest elsewhere.
        const keptWith = (id: ObjectId) => candidates.filter((x) => x === id || shareCreatureType(s, [id, x])).length;
        const got = pickOne(
          `keep-${p}`,
          candidates,
          forSelf
            ? creatures
              ? msg("Choose one of your creatures: your other creatures that share no type with it will be {fate}", { fate })
              : msg("Choose one of your permanents: your other permanents that share no type with it will be {fate}", {
                  fate,
                })
            : creatures
              ? msg("Choose one of {player}'s creatures: their other creatures that share no type with it will be {fate}", {
                  player: owner,
                  fate,
                })
              : msg("Choose one of {player}'s permanents: their other permanents that share no type with it will be {fate}", {
                  player: owner,
                  fate,
                }),
          (a, b) => keptWith(b) - keptWith(a),
        );
        if (typeof got === "object") return got;
        if (got) {
          kept.add(got);
          for (const id of candidates) if (shareCreatureType(s, [got, id])) kept.add(id);
        }
      } else {
        const got = pickOne(
          `keep-${p}`,
          candidates,
          forSelf
            ? creatures
              ? msg("Choose the creature you keep (the others will be {fate})", { fate })
              : msg("Choose the permanent you keep (the others will be {fate})", { fate })
            : creatures
              ? msg("Creature spared for {player}", { player: owner })
              : msg("Permanent spared for {player}", { player: owner }),
          (a, b) => power(b) - power(a),
        );
        if (typeof got === "object") return got;
        if (got) kept.add(got);
      }
    }
    const doomed = s.battlefield.filter((id) => {
      const c = s.objects[id]?.controller;
      return !!c && players.includes(c) && !kept.has(id) && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId);
    });
    for (const id of doomed) {
      if (!onBattlefield(s, id)) continue;
      if (e.fate === "destroy") destroy(s, id, false, ctx.controller);
      else sacrifice(s, id);
    }
    return;
  },
  craftReturn(s, _r, _e, ctx) {
    // "Return it to the battlefield transformed under its owner's control": the card exiled for the cost.
    const card = resolveRef(s, ctx, { kind: "selfCard" }).find((id) => s.objects[id]?.zone === "exile");
    if (!card) return;
    const back = moveWithSpec(s, s.objects[card]?.owner ?? ctx.controller, card, { to: "battlefield", transformed: true });
    const o = back ? s.objects[back] : undefined;
    // The materials are linked to the back face (Mastercraft Raptor, Sunbird Effigy, The Grim Captain…).
    const exiled = ctx.paid?.exiled ?? [];
    if (o && exiled.length) {
      o.linked = [...(o.linked ?? []), ...exiled];
      bump(s);
    }
    return;
  },
  exileUntilLeaves(s, _r, e, ctx) {
    // 610.3c: if the source has already left the battlefield, nothing is exiled.
    if (!onBattlefield(s, ctx.sourceId)) return;
    const cards: string[] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      // Aurelia's Vindicator: creature cards from graveyards too (they will return to the hand).
      if (!onBattlefield(s, id) && !(e.toHand && s.objects[id]?.zone === "graveyard")) continue;
      const n = moveWithSpec(s, ctx.controller, id, { to: "exile" });
      if (n) cards.push(n);
    }
    if (cards.length) s.linkedExile.push({ sourceId: ctx.sourceId, cards, ...(e.toHand ? { toHand: true } : {}) });
    return;
  },
  pickFromZone(s, r, e, ctx, key) {
    // Worlds Within Worlds: each player, in APNAP order, chooses from their own zone (for themselves).
    if (e.who) {
      for (const p of apnapOrder(s).filter((x) => resolveRef(s, ctx, e.who as NonNullable<typeof e.who>).includes(x))) {
        if (r.vars[key(`pz-${p}-done`)]) continue;
        const res = HANDLERS.pickFromZone?.(s, r, { ...e, who: undefined }, { ...ctx, controller: p }, (x) => key(`${p}-${x}`));
        if (res && "ask" in res) return res;
        r.vars[key(`pz-${p}-done`)] = [1];
      }
      return;
    }
    // "another card": the stored objects, recognized by their physical identity (they have changed zones).
    const stored = (e.excludeStored ? r.vars[`$ids:${e.excludeStored}`] : undefined)?.map(String) ?? [];
    const excludedUids = new Set(stored.map((id) => s.objects[id]?.uid ?? s.lki[id]?.uid).filter(Boolean));
    const maxMv = e.maxManaValue !== undefined ? evalAmount(s, ctx, e.maxManaValue) : undefined;
    // Sanar: the allowed colors (those of the matching permanents), at most one card per color.
    const allowed = e.onePerColorOf
      ? new Set(
          s.battlefield
            .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.onePerColorOf as ObjectFilter, ctx.sourceId))
            .flatMap((id) => chars(s, id).colors),
        )
      : null;
    const colorsOf = (id: string) => (s.defs[s.objects[id]?.defId ?? ""]?.colors ?? []).filter((c) => !allowed || allowed.has(c));
    const pool = (e.pool ? resolveRef(s, ctx, e.pool) : (s.players[ctx.controller]?.[e.zone] ?? [])).filter(
      (id) =>
        !!s.objects[id] &&
        !excludedUids.has(s.objects[id]?.uid) &&
        (!allowed || colorsOf(id).length > 0) &&
        matchesCard(
          s,
          ctx.controller,
          id,
          { ...e.filter, controller: undefined, maxManaValue: maxMv ?? e.filter.maxManaValue },
          ctx.sourceId,
        ),
    );
    // Eerie Ultimatum: "with different names" (at most one card per name).
    const nameOf = (id: string) => (s.objects[id] ? chars(s, id).name : id);
    const onePerName = e.distinct === "name" ? firstOfEachName(pool, nameOf) : pool;
    const count = Math.min(
      allowed ? Math.min(evalAmount(s, ctx, e.count), allowed.size) : evalAmount(s, ctx, e.count),
      onePerName.length,
    );
    if (count <= 0) return;
    const min = Math.min(e.min ?? count, count);
    let picked = onePerName.length === count && min === count ? onePerName : null;
    if (!picked && e.random) {
      const shuffled = [...pool];
      shuffle(s, shuffled);
      picked = shuffled.slice(0, count);
    }
    if (!picked) {
      const answer = r.vars[key("pickZone")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("pickZone"),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: e.prompt ?? msg("Choose {n} card(s)", { n: count }),
              options: pool,
              min,
              max: count,
              suggested: allowed ? onePerColor(pool, colorsOf).slice(0, count) : onePerName.slice(0, count),
            },
          },
        };
      }
      picked = answer.map(String);
    }
    if (allowed && !distinctColors(picked.map(colorsOf))) throw new RulesError(msg("At most one card per color"));
    if (e.distinct === "name" && firstOfEachName(picked, nameOf).length !== picked.length)
      throw new RulesError(msg("Cards with different names"));
    // A random draw is not replayed: no question after it.
    const arrival = arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, ctx.controller), key, !!e.random);
    if (!(arrival instanceof Map)) return arrival;
    const moved = picked
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    store(r, e.store, moved.length);
    return;
  },
  libraryTopOrBottom(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      // Swat Away: a targeted spell also goes into its owner's library.
      const spell = s.stack.find((x) => x.id === id && x.kind === "spell");
      const o = s.objects[spell ? spell.sourceId : id];
      // Endless Detour: also a card in a graveyard.
      if (!o || (!spell && o.zone !== "battlefield" && o.zone !== "graveyard")) continue;
      const answer = r.vars[key(`tb-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: o.owner,
            key: key(`tb-${id}`),
            request: {
              type: "pick",
              intent: "topOrBottom",
              prompt: e.fromTop
                ? msg("{card}: in position {n} from the top or on the bottom of your library?", {
                    card: cardRefOf(s, o.id),
                    n: e.fromTop,
                  })
                : msg("{card}: on top of or on the bottom of your library?", { card: cardRefOf(s, o.id) }),
              options: ["top", "bottom"],
              labels: {
                top: e.fromTop ? msg("Position {n} from the top", { n: e.fromTop }) : msg("On top"),
                bottom: msg("On the bottom"),
              },
              min: 1,
              max: 1,
              suggested: [o.controller === ctx.controller ? "top" : "bottom"],
            },
          },
        };
      }
      const owner = o.owner;
      if (spell) spellToZone(s, id, answer[0] === "top" ? "libraryTop" : "libraryBottom");
      else
        moveWithSpec(s, ctx.controller, id, {
          to: answer[0] === "top" ? "libraryTop" : "libraryBottom",
          ...(answer[0] === "top" && e.fromTop ? { fromTop: e.fromTop } : {}),
        });
      // Clash of Elements: "if they do, [the source] deals 2 damage to them".
      const src = e.topDamage && answer[0] === "top" ? damageSource(s, ctx) : null;
      if (src && e.topDamage) dealDamage(s, src, owner, e.topDamage, false);
    }
    return;
  },
  airbend(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const exiled = onBattlefield(s, id)
        ? moveAndLog(s, id, "exile")
        : s.stack.some((x) => x.id === id && x.kind === "spell")
          ? exileSpell(s, id)
          : undefined;
      const card = exiled ? s.objects[exiled] : undefined;
      // A token or a copy ceases to exist in exile: nothing to cast.
      if (!card || card.isToken) continue;
      grantPlay(s, card.owner, [card.id], "forever", { cost: { generic: 2, colored: {}, x: 0 }, source: ctx.sourceId });
    }
    bent(s, ctx.controller, "air");
    return;
  },
  bent(s, _r, e, ctx) {
    bent(s, ctx.controller, e.kind);
    return;
  },
  bounce(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      if (onBattlefield(s, id)) moveAndLog(s, id, "hand");
      else if (s.stack.some((x) => x.id === id && x.kind === "spell")) bounceSpell(s, id);
    }
    return;
  },
  exile(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      // The Master, Multiplied: a creature token its controller's triggered ability can't exile.
      if (onBattlefield(s, id) && !tokenShielded(s, id)) moveAndLog(s, id, "exile");
      // "Exile target spell" (Mindbreak Trap): it leaves the stack without resolving.
      else if (s.stack.some((x) => x.id === id && x.kind === "spell")) exileSpell(s, id);
    }
    return;
  },
  mill(s, r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    let matching = 0;
    const f = e.store?.filter;
    const batch: [PlayerId, ObjectId[]][] = [];
    for (const p of resolveRef(s, ctx, e.who)) {
      const library = s.players[p]?.library ?? [];
      const base = e.halfLibrary
        ? (e.halfLibrary === "up" ? Math.ceil : Math.floor)(library.length / 2)
        : e.graveyardSize
          ? (s.players[p]?.graveyard.length ?? 0)
          : n;
      // Mill replacements (R1, family I): The Water Crystal ("they mill that many cards plus four").
      const q = quantityMods(s, "mill", (a) => recipientMatches(s, a, p));
      const count = base > 0 && !q.prevented ? chooseReplacementOrder(base, q.mods, "min") : 0;
      const cards = library.slice(0, count);
      for (const id of cards) if (f && matchesCard(s, ctx.controller, id, { ...f, controller: undefined })) matching++;
      batch.push([p, cards]);
    }
    // The milled cards are stored (Dredger's Insight: "among the milled cards").
    const milled = millCards(s, batch);
    if (e.store) r.vars[`$ids:${e.store.name}`] = [...(r.vars[`$ids:${e.store.name}`] ?? []), ...milled];
    if (e.store) store(r, e.store.name, f ? matching : n);
    return;
  },
  scry(s, r, e, ctx, key) {
    // "Target player scries N": the scry is done by that player.
    const who = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    return who ? scryOrSurveil(s, r, e, who === ctx.controller ? ctx : { ...ctx, controller: who }, key) : undefined;
  },
  surveil: scryOrSurveil,
  discard(s, r, e, ctx, key) {
    const amount = evalAmount(s, ctx, e.amount);
    const f = e.filter;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (r.vars[key(`done-${p}`)]) continue;
      const hand = (s.players[p]?.hand ?? []).filter((id) => !f || matchesCard(s, p, id, { ...f, controller: undefined }));
      // Pox Plague: "half the cards in their hand, rounded down".
      const n = e.half ? Math.floor(hand.length / 2) : amount;
      if (e.half && n <= 0) {
        r.vars[key(`done-${p}`)] = [1];
        continue;
      }
      const chooser = e.chooser === "controller" ? ctx.controller : p;
      let chosen: string[];
      const unless = e.unlessFilter;
      const exempt = unless ? hand.filter((id) => matchesCard(s, p, id, { ...unless, controller: undefined })) : [];
      if (unless && exempt.length > 0) {
        // "Discard two cards unless you discard an artifact card": an artifact card, or two cards.
        const answer = r.vars[key(`discard-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`discard-${p}`),
              request: {
                type: "pick",
                intent: "discard",
                prompt: msg("Discard {n} cards, or a single matching card", { n }),
                options: [...hand],
                min: 1,
                max: Math.min(n, hand.length),
                suggested: [exempt[0] as string],
              },
            },
          };
        }
        chosen = answer.map(String);
        // A single card that does not match: another one must be discarded.
        if (chosen.length < n && !chosen.some((id) => exempt.includes(id))) {
          chosen = [...chosen, ...hand.filter((id) => !chosen.includes(id)).slice(0, n - chosen.length)];
        }
      } else if (hand.length <= n && !e.optional && !e.chooser) chosen = [...hand];
      else if (hand.length === 0) chosen = [];
      else if (e.random) {
        // "… at random"
        const pool = [...hand];
        shuffle(s, pool);
        chosen = pool.slice(0, n);
      } else {
        // Klaw, Sonic Subjugator: the player first reveals N cards of their choice; the choice is made among them.
        let pool = hand;
        if (e.reveal !== undefined) {
          const k = Math.min(Math.max(0, evalAmount(s, ctx, e.reveal)), hand.length);
          if (k < hand.length) {
            const shown = r.vars[key(`reveal-${p}`)];
            if (!shown) {
              return {
                ask: {
                  player: p,
                  key: key(`reveal-${p}`),
                  request: {
                    type: "pick",
                    intent: "reveal",
                    prompt: msg("Reveal {n} card(s) from your hand", { n: k }),
                    options: [...hand],
                    min: k,
                    max: k,
                    suggested: hand.slice(0, k),
                  },
                },
              };
            }
            pool = shown.map(String).filter((id) => hand.includes(id));
          }
          emit({ type: "reveal", player: p, defIds: pool.map((id) => s.objects[id]?.defId ?? "") });
        }
        const answer = r.vars[key(`discard-${p}`)];
        if (!answer) {
          const max = Math.min(n, pool.length);
          return {
            ask: {
              player: chooser,
              key: key(`discard-${p}`),
              request: {
                type: "pick",
                intent: "discard",
                prompt:
                  chooser === p
                    ? e.optional
                      ? msg("You may discard {n} card(s)", { n })
                      : msg("Discard {n} card(s)", { n })
                    : msg("Choose {n} card(s) that this player discards", { n: max }),
                options: [...pool],
                min: e.optional ? 0 : max,
                max,
                suggested: e.optional ? [] : pool.slice(0, max),
              },
            },
          };
        }
        chosen = answer.map(String);
      }
      r.vars[key(`done-${p}`)] = [1];
      const sf = e.storeFilter;
      const counted = sf ? chosen.filter((id) => matchesCard(s, p, id, { ...sf, controller: undefined })).length : chosen.length;
      store(r, e.store, readVar(ctx, e.store ?? "") + counted);
      if (chosen.length === 0) continue;
      if (e.exile) {
        // Intimidation Tactics: the chosen card is exiled (it is not a discard).
        for (const id of chosen) {
          const moved = moveObject(s, id, "exile");
          // Cruelclaw's Heist: "you may cast that card for as long as it remains exiled".
          if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
        }
        continue;
      }
      emit({ type: "discard", player: p, defIds: chosen.map((id) => s.objects[id]?.defId ?? "") });
      for (const id of chosen) {
        // Wilt-Leaf Liege: discarded by an opposing effect, it goes onto the battlefield.
        const toField = p !== ctx.controller && !!s.defs[s.objects[id]?.defId ?? ""]?.opponentDiscardToBattlefield;
        const moved = toField ? moveObject(s, id, "battlefield") : moveDiscarded(s, p, id, true);
        if (!toField) announceDiscard(s, p, moved);
        // The discarded cards, for `ref.stored` (Ninja's Blades: "the discarded card's mana value").
        if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
      }
      announceDiscardBatch(s, p, chosen.length);
    }
    return;
  },
  sacrifice(s, r, e, ctx, key) {
    const all = evalAmount(s, ctx, e.amount);
    // Values that depend on what is resolving ("that shares a card type with it": Braids, Arisen Nightmare).
    const filter = withX(s, e.filter, ctx);
    for (const p of resolveRef(s, ctx, e.who)) {
      if (r.vars[key(`done-${p}`)]) continue;
      let candidates = s.battlefield.filter(
        (id) =>
          s.objects[id]?.controller === p &&
          matchesObjectFilter(s, p, id, filter, ctx.sourceId) &&
          !hasKeyword(s, id, "cantBeSacrificed") &&
          !tokenShielded(s, id),
      );
      // Zodiark: "half the creatures they control, rounded down".
      const n = e.half ? Math.floor(candidates.length / 2) : all;
      if (n <= 0) {
        r.vars[key(`done-${p}`)] = [1];
        continue;
      }
      if (e.greatestPower && candidates.length) {
        const max = Math.max(...candidates.map((id) => chars(s, id).power));
        candidates = candidates.filter((id) => chars(s, id).power === max);
      }
      if (e.greatestManaValue && candidates.length) {
        const mv = (id: string) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
        const max = Math.max(...candidates.map(mv));
        candidates = candidates.filter((id) => mv(id) === max);
      }
      let chosen: string[];
      if (candidates.length <= n && !e.optional) chosen = candidates;
      else if (candidates.length === 0) chosen = [];
      else {
        const answer = r.vars[key(`sac-${p}`)];
        if (!answer) {
          const max = Math.min(n, candidates.length);
          return {
            ask: {
              player: p,
              key: key(`sac-${p}`),
              request: {
                type: "pick",
                intent: "sacrifice",
                prompt:
                  e.to === "hand"
                    ? msg("Return {n} permanent(s) to their owner's hand", { n })
                    : e.to === "exile"
                      ? msg("Exile {n} permanent(s)", { n })
                      : e.optional
                        ? msg("You may sacrifice {n} permanent(s)", { n })
                        : msg("Sacrifice {n} permanent(s)", { n }),
                options: candidates,
                min: e.optional ? 0 : max,
                max,
                suggested: e.optional ? [] : candidates.slice(0, max),
              },
            },
          };
        }
        chosen = answer.map(String);
      }
      r.vars[key(`done-${p}`)] = [1];
      store(r, e.store, readVar(ctx, e.store ?? "") + chosen.length);
      if (e.to) {
        // "… exiles it": the exiled cards are stored (to link them to the source); "… returns it to hand".
        const exiled = chosen
          .filter((id) => onBattlefield(s, id))
          .map((id) => moveWithSpec(s, ctx.controller, id, { to: e.to ?? "exile" }))
          .filter((x): x is string => !!x);
        if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...exiled];
        continue;
      }
      if (e.store) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), ...chosen];
      for (const id of chosen) if (onBattlefield(s, id)) sacrifice(s, id);
    }
    return;
  },
  look(s, _r, e, ctx) {
    let ids = resolveRef(s, ctx, e.what).filter((id) => !!s.objects[id]);
    if (e.random !== undefined) {
      const left = [...ids];
      ids = [];
      while (left.length && ids.length < e.random) ids.push(left.splice(Math.floor(random(s) * left.length), 1)[0] as string);
    }
    if (ids.length)
      emit({
        type: "reveal",
        player: ctx.controller,
        defIds: ids.map((id) => s.objects[id]?.defId ?? ""),
        ...(e.reveal ? {} : { look: true }),
      });
    return;
  },
  pair(s, _r, e, ctx) {
    // 702.95c: nothing if either is no longer an unpaired creature controlled by the ability's controller.
    const a = resolveRef(s, ctx, e.what)[0];
    const b = resolveRef(s, ctx, e.with)[0];
    const ok = (id: string | undefined) =>
      !!id &&
      s.objects[id]?.zone === "battlefield" &&
      s.objects[id]?.controller === ctx.controller &&
      isCreature(s, id) &&
      !s.objects[id]?.pairedWith;
    if (!a || !b || a === b || !ok(a) || !ok(b)) return;
    (s.objects[a] as GameObject).pairedWith = b;
    (s.objects[b] as GameObject).pairedWith = a;
    bump(s);
    return;
  },
  removeFromCombat(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) if (s.objects[id]?.zone === "battlefield") removeFromCombat(s, id);
    return;
  },
  tap(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (e.untap) untapObject(s, o);
      else tapObject(s, o);
    }
    return;
  },
  sacrificeIt(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) if (onBattlefield(s, id)) sacrifice(s, id);
    return;
  },
  moveTo(s, r, e, ctx, key) {
    const ids = resolveRef(s, ctx, e.what);
    const f = e.store?.filter;
    if (e.store)
      store(
        r,
        e.store.name,
        ids.filter((id) => !f || matchesCard(s, ctx.controller, id, { ...f, controller: undefined })).length,
      );
    // Entering choices of a permanent that is not cast, asked before any move (the resolution resumes the effect from the
    // start once the answer is given): what an Aura enchants (303.4f); then `arrivalChoices` ("as this enters" effects,
    // shock lands, defender).
    const choices: Record<string, Partial<EntersContext>> = {};
    // A card put onto the battlefield face down (manifest, cloak) is a 2/2 creature: no host to choose.
    if (e.spec.to === "battlefield" && !e.spec.as) {
      const host = e.attachTo ? resolveRef(s, ctx, e.attachTo).find((x) => onBattlefield(s, x)) : undefined;
      for (const id of ids) {
        const o = s.objects[id];
        const d = s.defs[o?.defId ?? ""];
        if (!o || !d) continue;
        const who = e.spec.underYourControl ? ctx.controller : o.owner;
        // "… attached to [a creature]": the Aura or Equipment enters attached, if it can be.
        if (
          host &&
          (d.enchant
            ? !d.enchant.player && auraHosts(s, who, id).includes(host)
            : d.subtypes.includes("Equipment") && isCreature(s, host))
        ) {
          choices[id] = { attachTo: host };
          continue;
        }
        if (d.enchant && !d.enchant.player) {
          const options = auraHosts(s, who, id);
          const k = key(`host-${id}`);
          if (options.length > 1 && !r.vars[k]) {
            return {
              ask: {
                player: who,
                key: k,
                request: {
                  type: "pick",
                  intent: "pickCards",
                  prompt: msg("{card}: choose what it enchants", { card: cardRef(d.id) }),
                  options,
                  min: 1,
                  max: 1,
                  suggested: options.slice(0, 1),
                },
              },
            };
          }
          const picked = (r.vars[k] ?? []).map(String).find((x) => options.includes(x)) ?? options[0];
          if (picked) choices[id] = { ...choices[id], attachTo: picked };
        }
      }
    }
    const arrival = arrivalChoices(s, r, ctx, ids, e.spec, ownerOr(s, e.spec, ctx.controller), key);
    if (!(arrival instanceof Map)) return arrival;
    for (const [id, a] of arrival) choices[id] = { ...choices[id], ...a };
    const moved: string[] = [];
    // "On the bottom of their library in a random order" (Dazzling Sphinx): the group is shuffled, then moved in order.
    const bottomRandom = e.spec.to === "libraryBottom" && !!e.spec.shuffle;
    const order = bottomRandom ? [...ids] : ids;
    if (bottomRandom) shuffle(s, order);
    const spec = bottomRandom ? { ...e.spec, shuffle: undefined } : e.spec;
    for (const id of order) {
      const n = moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, spec), choices[id]);
      if (n) moved.push(n);
      // A token that ceases to exist (off the battlefield): its old identifier, for its last known information
      // (Zoyowa's Justice: owner and mana value).
      else if (!s.objects[id] && s.lki[id]) moved.push(id);
    }
    if (e.store) r.vars[`$ids:${e.store.name}`] = moved;
    return;
  },
  exileNamesakes(s, r, e, ctx, key) {
    // The End: the targeted permanent, exiled, then the cards with the same name of its controller (who draws as many as
    // cards exiled from their hand). Surgical Extraction: the targeted graveyard card and its namesakes of its owner.
    if (e.of) {
      const target = resolveRef(s, ctx, e.of).find((id) => onBattlefield(s, id) || s.objects[id]?.zone === "graveyard");
      if (!target) return;
      const o = s.objects[target];
      if (!o) return;
      const who = onBattlefield(s, target) ? o.controller : o.owner;
      const name = chars(s, target).name;
      moveAndLog(s, target, "exile");
      const pl = s.players[who];
      if (!pl) return;
      const same = (id: ObjectId) => shareName(chars(s, id).name, name);
      const fromHand = pl.hand.filter(same);
      for (const id of [...pl.graveyard.filter(same), ...fromHand, ...pl.library.filter(same)]) moveObject(s, id, "exile");
      shuffle(s, pl.library);
      if (e.draw) drawCards(s, who, fromHand.length);
      return;
    }
    const options = opponentsOf(s, ctx.controller).flatMap((p) => s.players[p]?.graveyard ?? []);
    if (options.length === 0) return;
    const answer = r.vars[key("pick")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("pick"),
          request: {
            type: "pick",
            intent: "other",
            prompt: msg("Exile a card from an opponent's graveyard (and all those with the same name)"),
            options,
            min: 1,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const picked = String(answer[0]);
    const card = s.objects[picked];
    const owner = card?.owner;
    const name = card && chars(s, picked).name;
    const pl = owner ? s.players[owner] : undefined;
    if (!card || !pl || !name || !options.includes(picked)) return;
    moveObject(s, picked, "exile");
    const same = (id: ObjectId) => shareName(chars(s, id).name, name);
    const fromHand = pl.hand.filter(same);
    for (const id of [...pl.graveyard.filter(same), ...fromHand, ...pl.library.filter(same)]) moveObject(s, id, "exile");
    shuffle(s, pl.library);
    drawCards(s, owner as string, fromHand.length);
    return;
  },
  exileNamed(s, r, e, ctx) {
    const name = String(r.vars.$name?.[0] ?? "");
    if (!name) return;
    for (const p of resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x))) {
      const pl = s.players[p];
      if (!pl) continue;
      // "the cards with the chosen name": each name of a split card (709.4), the main name of an adventurer (715.4), that
      // of the front face of a double-faced card (712.8a).
      const named = [...pl.graveyard, ...pl.hand, ...pl.library].filter((x) => hasName(chars(s, x).name, name));
      for (const x of named.slice(0, e.max)) moveObject(s, x, "exile");
      shuffle(s, pl.library);
    }
    return;
  },
  moveAll(s, r, e, ctx, key) {
    const players = resolveRef(s, ctx, e.whose).filter((p) => isPlayer(s, p));
    // "with mana value X" (Fix What's Broken): the X of the spell or ability.
    const filter = withX(s, e.filter, ctx);
    const ids =
      e.from === "battlefield"
        ? s.battlefield.filter(
            (id) =>
              players.includes(s.objects[id]?.controller ?? "") &&
              matchesObjectFilter(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId),
          )
        : zoneCards(s, players, e.from).filter((id) =>
            matchesCard(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId),
          );
    const arrival = arrivalChoices(s, r, ctx, ids, e.spec, ownerOr(s, e.spec, ctx.controller), key);
    if (!(arrival instanceof Map)) return arrival;
    const moved = ids
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.spec), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    return;
  },
  shuffle(s, _r, e, ctx) {
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (pl) shuffle(s, pl.library);
    }
    return;
  },
  lookAtTop(s, r, e, ctx, key) {
    const whose = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    const player = whose ? s.players[whose] : undefined;
    if (!player || !whose) return;
    // The chooser: the controller, or the owner of the library ("each player looks at …").
    const chooser = e.chooser === "owner" ? whose : ctx.controller;
    const top = player.library.slice(0, evalAmount(s, ctx, e.n));
    if (top.length === 0) return;
    const maxMv = e.maxManaValue === undefined ? undefined : evalAmount(s, ctx, e.maxManaValue);
    const filter = maxMv === undefined ? e.filter : { ...e.filter, maxManaValue: maxMv };
    const options = top.filter((id) => !filter || matchesCard(s, ctx.controller, id, filter, ctx.sourceId));
    const count = evalAmount(s, ctx, e.count);
    // Suggestion that respects the total mana value limit (the first cards that fit).
    const withinTotal = (ids: string[]) => {
      if (e.onePerType) return greedyOnePerType(s, options).slice(0, count);
      if (e.maxTotalManaValue === undefined) return ids;
      let total = 0;
      return ids.filter((id) => {
        const mv = manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
        if (total + mv > (e.maxTotalManaValue ?? 0)) return false;
        total += mv;
        return true;
      });
    };
    let picked: string[] = [];
    if (e.random && options.length > 0 && count > 0) {
      const pool = [...options];
      shuffle(s, pool);
      picked = pool.slice(0, count);
    } else if (e.exact && !e.onePerType && e.maxTotalManaValue === undefined && count > 0 && options.length <= count) {
      // All the matching cards must be taken (Scroll Rack: "that many cards from the top"): no question.
      picked = options;
    } else if (options.length > 0 && count > 0) {
      const answer = r.vars[key("look")];
      if (!answer) {
        return {
          ask: {
            player: chooser,
            key: key("look"),
            request: {
              type: "pick",
              intent: "lookAtTop",
              prompt: e.exact
                ? msg("You look at the top {n} cards: choose {k} of them", { n: top.length, k: Math.min(count, options.length) })
                : msg("You look at the top {n} cards: choose up to {k} of them", { n: top.length, k: count }),
              options,
              min: e.exact ? Math.min(count, options.length) : 0,
              max: Math.min(count, options.length),
              suggested: withinTotal(options.slice(0, Math.min(count, options.length))),
            },
          },
        };
      }
      picked = answer.map(String);
      // Atraxa, Grand Unifier: "for each card type, a card of that type" (each card taken for a different type).
      if (e.onePerType && !assignTypes(s, picked)) throw new RulesError(msg("Only one card per card type"));
      // "with total mana value N or less": a choice that exceeds it is refused.
      if (e.maxTotalManaValue !== undefined) {
        const total = picked.reduce((n, id) => n + manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost), 0);
        if (total > e.maxTotalManaValue)
          throw new RulesError(msg("Total mana value greater than {n}", { n: e.maxTotalManaValue }));
      }
    }
    const rest = top.filter((id) => !picked.includes(id));
    // "Put them back in any order" / "on the bottom in any order": the player looking orders the rest before any move.
    let order = rest;
    if ((e.rest === "reorder" || e.rest === "bottomAnyOrder") && rest.length > 1) {
      const answer = r.vars[key("order")];
      if (!answer) {
        return {
          ask: {
            player: chooser,
            key: key("order"),
            request: {
              type: "order",
              intent: "scryOrder",
              prompt:
                e.rest === "reorder"
                  ? msg("Order of the cards put back on top (the first will be drawn first)")
                  : msg("Order of the cards put on the bottom (the last will be the bottom card)"),
              items: rest,
              suggested: rest,
            },
          },
        };
      }
      order = answer.map(String);
      if (order.length !== rest.length || !rest.every((id) => order.includes(id)))
        throw new RulesError(msg("The order must include each of the cards looked at"));
    }
    // "Put up to two of them back on top of your library in any order" (Rowan's Grim Search): the player orders them.
    if (e.to.to === "libraryTop" && picked.length > 1) {
      const answer = r.vars[key("takenOrder")];
      if (!answer) {
        return {
          ask: {
            player: chooser,
            key: key("takenOrder"),
            request: {
              type: "order",
              intent: "scryOrder",
              prompt: msg("Order of the cards put back on top (the first will be drawn first)"),
              items: picked,
              suggested: picked,
            },
          },
        };
      }
      const chosen = answer.map(String);
      if (chosen.length !== picked.length || !picked.every((id) => chosen.includes(id)))
        throw new RulesError(msg("The order must include each of the cards looked at"));
      // Each card moved on top covers the previous one: the last moved is drawn first.
      picked = [...chosen].reverse();
    }
    const arrival = arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, ctx.controller), key, !!e.random);
    if (!(arrival instanceof Map)) return arrival;
    // "You may reveal it and put it into your hand": the chosen cards are shown to all players.
    if (e.reveal && picked.length)
      emit({ type: "reveal", player: whose, defIds: picked.map((id) => s.objects[id]?.defId ?? "") });
    store(r, e.store, picked.length);
    const taken = picked
      .map((id) => moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id)))
      .filter((x): x is string => !!x);
    if (e.store) r.vars[`$ids:${e.store}`] = taken;
    if (e.rest === "graveyard") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "graveyard" });
    else if (e.rest === "hand") for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "hand" });
    else if (e.rest === "reorder") {
      const lib = player.library.filter((id) => !order.includes(id));
      player.library = [...order.filter((id) => player.library.includes(id)), ...lib];
    } else if (e.rest === "bottomAnyOrder") {
      const lib = player.library.filter((id) => !order.includes(id));
      player.library = [...lib, ...order.filter((id) => player.library.includes(id))];
    } else if (e.rest === "bottom") {
      // Random order ("in a random order").
      const lib = player.library.filter((id) => !rest.includes(id));
      const shuffled = [...rest];
      shuffle(s, shuffled);
      player.library = [...lib, ...shuffled];
    }
    return;
  },
  search(s, r, e, ctx, key) {
    // Each designated player searches THEIR library (Demolition Field); by default, the controller.
    for (const p of e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller]) {
      if (r.vars[key(`sdone-${p}`)]) continue;
      const player = s.players[p];
      if (!player) continue;
      // The number is read from the point of view of the searching player (Winds of Abandon: as many as their exiled creatures).
      const count = evalAmount(s, e.who ? { ...ctx, controller: p } : ctx, e.count);
      const exactMv = e.manaValue !== undefined ? evalAmount(s, ctx, e.manaValue) : undefined;
      // Grim Servant: "mana value less than or equal to your devotion to black".
      const maxMv = e.maxManaValue !== undefined ? evalAmount(s, ctx, e.maxManaValue) : undefined;
      // "mana value X or less": the X of the resolving spell (Nature's Rhythm).
      const base = withX(s, e.filter, ctx);
      // "Library and/or graveyard": the graveyard's cards first (they are public), then the library's.
      const pool = e.alsoGraveyard ? [...player.graveyard, ...player.library] : player.library;
      const options = pool.filter((id) =>
        matchesCard(
          s,
          p,
          id,
          {
            ...base,
            ...(exactMv === undefined ? {} : { manaValue: exactMv }),
            ...(maxMv === undefined ? {} : { maxManaValue: maxMv }),
          },
          ctx.sourceId,
        ),
      );
      // Opposition Agent: an opponent controls this search (the most recent), and the cards found are exiled with it.
      const agent = playerStatics(s, p, "searchControl")
        .filter(({ id }) => !!id && s.objects[id]?.controller !== p)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0]?.id;
      const searcher = (agent && s.objects[agent]?.controller) || p;
      let picked: string[] = [];
      if (options.length > 0 && count > 0) {
        const answer = r.vars[key(`search-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: searcher,
              key: key(`search-${p}`),
              request: {
                type: "pick",
                intent: "search",
                prompt: e.alsoGraveyard
                  ? msg("Search your library and/or graveyard: up to {n} card(s)", { n: count })
                  : msg("Search your library: up to {n} card(s)", { n: count }),
                options,
                min: 0,
                max: Math.min(count, options.length),
                suggested: options.slice(0, Math.min(count, options.length)),
              },
            },
          };
        }
        picked = answer.map(String);
        // "with different names": a single copy of each name.
        if (e.distinctNames) picked = firstOfEachName(picked, (id) => (s.objects[id] ? chars(s, id).name : id));
      }
      // 701.23: "… reveal it": the found cards are shown to all players.
      if (e.reveal && picked.length && !r.vars[key(`revealed-${p}`)]) {
        r.vars[key(`revealed-${p}`)] = [1];
        emit({ type: "reveal", player: p, defIds: picked.map((id) => s.objects[id]?.defId ?? "") });
      }
      const arrival = agent ? new Map() : arrivalChoices(s, r, ctx, picked, e.to, ownerOr(s, e.to, p), (x) => key(`${p}-${x}`));
      if (!(arrival instanceof Map)) return arrival;
      r.vars[key(`sdone-${p}`)] = [1];
      // "If you search your library this way, shuffle": a card taken from the graveyard means the library wasn't searched.
      const searchedLibrary = !e.alsoGraveyard || !picked.some((id) => player.graveyard.includes(id));
      if (searchedLibrary) {
        rulesEvent(s, { e: "search", player: p });
        logTurnEvent(s, { e: "search", player: p });
      }
      // 701.23: shuffle after searching; "on top" applies after the shuffle.
      const toTop = e.to.to === "libraryTop" && !agent;
      for (const id of picked) {
        if (agent) {
          const exiled = moveObject(s, id, "exile");
          const holder = s.objects[agent];
          if (exiled && holder) holder.linked = [...(holder.linked ?? []), exiled];
          continue;
        }
        if (toTop) continue;
        const moved = moveWithSpec(s, p, id, evalMoveSpec(s, ctx, e.to), arrival.get(id));
        if (e.store && moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
      }
      if (searchedLibrary) shuffle(s, player.library);
      if (toTop) for (const id of picked) player.library = [id, ...player.library.filter((x) => x !== id)];
    }
    return;
  },
  devour(s, r, e, ctx, key) {
    if (r.vars.$devoured) return;
    const fromGy = !!e.graveyardUpToX;
    const options = fromGy
      ? (s.players[ctx.controller]?.graveyard ?? []).filter((id) => matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId))
      : s.battlefield.filter(
          (id) =>
            s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
        );
    const max = fromGy ? Math.min(ctx.x, options.length) : options.length;
    const answer = options.length ? r.vars[key("devour")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("devour"),
          request: {
            type: "pick",
            intent: "sacrifice",
            prompt: fromGy
              ? msg("{card}: exile up to {n} card(s) from your graveyard", { card: cardRefOf(s, ctx.sourceId), n: max })
              : msg("{card}: devour (sacrifice as many permanents as you want)", { card: cardRefOf(s, ctx.sourceId) }),
            options,
            min: 0,
            max,
            suggested: fromGy ? options.slice(0, max) : [],
          },
        },
      };
    }
    const chosen = answer
      .map(String)
      .filter((id) => options.includes(id))
      .slice(0, max);
    if (fromGy) {
      r.vars["$ids:devoured"] = chosen.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
    } else for (const id of chosen) sacrifice(s, id);
    r.vars.$devoured = [chosen.length];
    return;
  },
  revealUntilN(s, r, e, ctx, key) {
    // Another player's library (Jhoira, Weatherlight Corsair: a targeted opponent).
    const owner = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    const player = owner ? s.players[owner] : undefined;
    if (!player || !owner) return;
    const found: string[] = [];
    const n = evalAmount(s, ctx, e.n);
    let i = 0;
    for (; i < player.library.length && found.length < n; i++) {
      const id = player.library[i] as string;
      if (matchesCard(s, ctx.controller, id, { ...e.filter, controller: undefined })) found.push(id);
    }
    const revealed = player.library.slice(0, i);
    const arrival = e.to
      ? arrivalChoices(s, r, ctx, found, e.to, ownerOr(s, e.to, ctx.controller), key)
      : new Map<ObjectId, Arrival>();
    if (!(arrival instanceof Map)) return arrival;
    emit({ type: "reveal", player: owner, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
    if (!e.to) {
      if (e.store) r.vars[`$ids:${e.store}`] = found;
      return;
    }
    const rest = revealed.filter((id) => !found.includes(id));
    const moved: string[] = [];
    for (const id of found) {
      const m = moveWithSpec(s, ctx.controller, id, evalMoveSpec(s, ctx, e.to), arrival.get(id));
      if (m) moved.push(m);
    }
    // The moved cards (Jhoira: "lose life equal to its mana value").
    if (e.store) r.vars[`$ids:${e.store}`] = moved;
    if (e.rest === "graveyard") {
      for (const id of rest) moveWithSpec(s, ctx.controller, id, { to: "graveyard" });
      return;
    }
    const lib = player.library.filter((id) => !rest.includes(id));
    shuffle(s, rest);
    player.library = [...lib, ...rest];
    return;
  },
  piles(s, r, e, ctx, key) {
    const player = s.players[ctx.controller];
    if (!player) return;
    const top = player.library.slice(0, e.n);
    if (top.length === 0) return;
    // Fact or Fiction: an opponent separates the revealed cards, the controller chooses their pile.
    if (e.opponentSeparates && !r.vars[key("revealed")]) {
      r.vars[key("revealed")] = [1];
      emit({ type: "reveal", player: ctx.controller, defIds: top.map((id) => s.objects[id]?.defId ?? "") });
    }
    // "An opponent separates" (after the reveal) or "an opponent chooses" (after the separation): the controller
    // chooses which one, without targeting (no question if there is only one).
    const asked = r.vars[key("down")] || e.opponentSeparates ? opponentChoice(s, r, ctx, key, e.opponentSeparates) : null;
    if (asked && "ask" in asked) return asked;
    const opp = asked?.player;
    const separator = e.opponentSeparates && opp ? opp : ctx.controller;
    const chooser = e.opponentSeparates ? ctx.controller : opp;
    const down = r.vars[key("down")];
    if (!down) {
      return {
        ask: {
          player: separator,
          key: key("down"),
          request: {
            type: "pick",
            intent: "piles",
            prompt: e.revealed
              ? msg("Separate the revealed cards into two piles: choose those of the first pile")
              : msg("Choose the cards of the face-down pile (the others form the face-up pile)"),
            options: top,
            min: 0,
            max: top.length,
            suggested: top.slice(0, Math.ceil(top.length / 2)),
          },
        },
      };
    }
    const faceDown = down.map(String);
    const faceUp = top.filter((id) => !faceDown.includes(id));
    let pick = r.vars[key("pile")]?.[0];
    if (pick === undefined && chooser) {
      const names = faceUp.map((id) => cardRefOf(s, id)).join(", ") || msg("no card");
      const downNames = faceDown.map((id) => cardRefOf(s, id)).join(", ") || msg("no card");
      if (e.revealed && !e.opponentSeparates)
        emit({ type: "reveal", player: ctx.controller, defIds: top.map((id) => s.objects[id]?.defId ?? "") });
      return {
        ask: {
          player: chooser,
          key: key("pile"),
          request: {
            type: "pick",
            intent: "piles",
            prompt: e.opponentSeparates
              ? msg("{card}: choose the pile to put into your hand (the other goes to the graveyard)", {
                  card: cardRefOf(s, ctx.sourceId),
                })
              : msg("{card}: choose the pile the opponent puts into their hand (the other goes to the graveyard)", {
                  card: cardRefOf(s, ctx.sourceId),
                }),
            options: ["down", "up"],
            labels: e.revealed
              ? { down: msg("First pile: {cards}", { cards: downNames }), up: msg("Second pile: {cards}", { cards: names }) }
              : {
                  down: msg("Face-down pile ({n} card(s))", { n: faceDown.length }),
                  up: msg("Face-up pile: {cards}", { cards: names }),
                },
            min: 1,
            max: 1,
            suggested: [faceDown.length >= faceUp.length !== !!e.opponentSeparates ? "up" : "down"],
          },
        },
      };
    }
    pick ??= "down";
    const toHand = pick === "down" ? faceDown : faceUp;
    for (const id of top) moveWithSpec(s, ctx.controller, id, { to: toHand.includes(id) ? "hand" : "graveyard" });
    store(r, e.storeGraveyard, top.length - toHand.length);
    return;
  },
  flickerChosen(s, r, e, ctx, key) {
    const options = s.battlefield.filter(
      (id) => s.objects[id]?.controller === ctx.controller && matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
    );
    const answer = options.length ? r.vars[key("flicker")] : [];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("flicker"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: msg("{card}: choose the permanents to exile then return", { card: cardRefOf(s, ctx.sourceId) }),
            options,
            min: 0,
            max: options.length,
            suggested: options,
          },
        },
      };
    }
    let ids = answer.map(String).filter((id) => options.includes(id));
    const times = Math.max(1, evalAmount(s, ctx, e.times));
    for (let t = 0; t < times; t++) {
      const exiled = ids.map((id) => moveObject(s, id, "exile")).filter((x): x is string => !!x);
      ids = exiled
        .map((id) => moveObject(s, id, "battlefield", { controller: s.objects[id]?.owner }))
        .filter((x): x is string => !!x);
    }
    return;
  },
  portent(s, r, _e, ctx) {
    const pl = s.players[ctx.controller];
    if (!pl) return;
    const revealed = pl.library.slice(0, Math.max(0, ctx.x));
    const typesOf = (id: string) => s.defs[s.objects[id]?.defId ?? ""]?.types ?? [];
    // One card per card type: the cards with the fewest types are assigned first.
    const order: CardType[] = ["Battle", "Planeswalker", "Enchantment", "Artifact", "Sorcery", "Instant", "Creature", "Land"];
    const picked: string[] = [];
    for (const t of order) {
      const c = revealed
        .filter((id) => !picked.includes(id) && typesOf(id).includes(t))
        .sort((a, b) => typesOf(a).length - typesOf(b).length)[0];
      if (c) picked.push(c);
    }
    emit({ type: "reveal", player: ctx.controller, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
    const exiled = picked.map((id) => moveWithSpec(s, ctx.controller, id, { to: "exile" })).filter((x): x is string => !!x);
    for (const id of revealed) if (!picked.includes(id) && s.objects[id]) moveAndLog(s, id, "graveyard");
    // Four or more cards: a spell among them may be cast for free (optionally, during the resolution); the rest then
    // goes to the hand.
    r.vars["$ids:free"] = exiled.length >= 4 ? exiled.filter((id) => !typesOf(id).includes("Land")) : [];
    r.vars["$ids:rest"] = exiled;
    return;
  },
  exileTop(s, r, e, ctx) {
    const exiled: string[] = [];
    for (const p of resolveRef(s, ctx, e.who)) {
      const lib = s.players[p]?.library ?? [];
      const n = e.allBut !== undefined ? lib.length - evalAmount(s, ctx, e.allBut) : evalAmount(s, ctx, e.n ?? 0);
      for (const id of lib.slice(0, Math.max(0, n))) {
        const n = moveWithSpec(s, ctx.controller, id, { to: "exile", ...(e.faceDown ? { faceDown: e.faceDown } : {}) });
        if (n) exiled.push(n);
      }
    }
    if (e.store) r.vars[`$ids:${e.store}`] = exiled;
    return;
  },
  untapUpTo(s, _r, e, ctx) {
    const ids = s.battlefield.filter(
      (id) =>
        s.objects[id]?.controller === ctx.controller &&
        s.objects[id]?.tapped &&
        matchesObjectFilter(s, ctx.controller, id, e.filter),
    );
    for (const id of ids.slice(0, e.n)) {
      const o = s.objects[id];
      if (o) untapObject(s, o);
    }
    return;
  },
  exileUntil(s, r, e, ctx) {
    if (e.untilTotalManaValue !== undefined) {
      const all: string[] = [];
      for (const p of resolveRef(s, ctx, e.who ?? { kind: "you" }).filter((x) => isPlayer(s, x))) {
        const lib = s.players[p]?.library ?? [];
        let total = 0;
        while (lib.length && total < e.untilTotalManaValue) {
          const top = lib[0] as string;
          total += manaValue(s.defs[s.objects[top]?.defId ?? ""]?.manaCost);
          const moved = moveWithSpec(s, ctx.controller, top, { to: "exile" });
          if (moved) all.push(moved);
        }
      }
      r.vars[`$ids:${e.store}`] = all;
      return;
    }
    // Exile from the top until a matching card; only that last one is stored. Black Widow, Super Spy: the designated
    // player's library.
    // Krang & Shredder: "each opponent exiles…": each of them, the cards found gathered.
    const players = e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller];
    const all: string[] = [];
    const exiled: string[] = [];
    for (const whose of players) {
      const lib = s.players[whose]?.library ?? [];
      let found: string | null = null;
      while (lib.length && !found) {
        const top = lib[0] as string;
        const match = matchesCard(s, ctx.controller, top, { ...e.filter, controller: undefined });
        const moved = moveWithSpec(s, ctx.controller, top, { to: "exile" });
        if (moved) exiled.push(moved);
        if (match) found = moved;
      }
      if (found) all.push(found);
    }
    r.vars[`$ids:${e.store}`] = all;
    if (e.storeAll) r.vars[`$ids:${e.storeAll}`] = exiled;
    return;
  },
  exileFromOwnHand(s, r, e, ctx, key) {
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p) || r.vars[key(`xh-${p}-done`)]) continue;
      const hand = s.players[p]?.hand ?? [];
      if (hand.length === 0) continue;
      const answer = r.vars[key(`xh-${p}`)];
      if (!answer) {
        return {
          ask: {
            player: p,
            key: key(`xh-${p}`),
            request: {
              type: "pick",
              intent: "pickCards",
              prompt: msg("Exile a card from your hand"),
              options: [...hand],
              min: 1,
              max: 1,
              suggested: hand.slice(0, 1),
            },
          },
        };
      }
      r.vars[key(`xh-${p}-done`)] = [1];
      const id = String(answer[0]);
      if (!hand.includes(id)) continue;
      const moved = moveWithSpec(s, p, id, { to: "exile" });
      if (moved) r.vars[`$ids:${e.store}`] = [...(r.vars[`$ids:${e.store}`] ?? []), moved];
    }
    return;
  },
  transform(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const d = o ? s.defs[o.defId] : undefined;
      // Marvel Super Heroes: modal double-faced cards transform too (Jennifer Walters).
      const back = d?.layout === "transform" || d?.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
      if (o?.zone !== "battlefield" || !back) continue;
      o.faceDefId = o.faceDefId === back.id ? undefined : back.id;
      bump(s);
      emit({ type: "transform", objectId: id, defId: o.faceDefId ?? o.defId });
      rulesEvent(s, { e: "transformed", objectId: id });
    }
    return;
  },
  meld(s, _r, e, ctx) {
    // 701.42a: you must own and control both permanents.
    const src = s.objects[ctx.sourceId];
    const result = src ? s.defs[src.defId]?.meldResultDef : undefined;
    const partner = s.battlefield.find(
      (id) =>
        id !== ctx.sourceId &&
        s.objects[id]?.owner === ctx.controller &&
        s.objects[id]?.controller === ctx.controller &&
        hasName(chars(s, id).name, e.with),
    );
    if (src?.zone !== "battlefield" || src.owner !== ctx.controller || !partner || !result) return;
    registerDef(s, result);
    const parts = [src, s.objects[partner]].map((o) => ({ defId: o?.defId ?? "", uid: o?.uid ?? "" }));
    const exiled = [ctx.sourceId, partner].map((id) => moveObject(s, id, "exile"));
    for (const id of exiled) if (id) removeFromGame(s, id);
    const melded = createObject(s, result.id, ctx.controller, "battlefield");
    melded.melded = parts;
    melded.timestamp = nextTimestamp(s);
    bump(s);
    emit({ type: "token", objectId: melded.id, defId: result.id, controller: ctx.controller });
    rulesEvent(s, { e: "zone", oldId: exiled[0] ?? null, newId: melded.id, from: "exile", to: "battlefield", lki: null });
    return;
  },
  explore(s, r, e, ctx, key) {
    // 701.44a: reveal the top card; a land goes to the hand; otherwise, a +1/+1 counter on the creature and its
    // controller may put the card into the graveyard.
    const times = e.times === undefined ? 1 : evalAmount(s, ctx, e.times);
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    for (const id of ids) {
      for (let n = 0; n < times; n++) {
        const k = `explore-${id}-${n}`;
        if (r.vars[key(`${k}-done`)]) continue;
        const o = s.objects[id];
        const p = o?.controller;
        // Twists and Turns: "instead, you scry 1, then that creature explores" (an `explore` replacement, `add`: the
        // number to scry).
        const scry = quantityMods(s, "explore", (a) => recipientMatches(s, a, id)).mods.reduce(
          (n, m) => n + ("add" in m ? (m.add ?? 0) : 0),
          0,
        );
        if (p && scry > 0 && !r.vars[key(`${k}-scried`)]) {
          const asked = scryOrSurveil(s, r, { op: "scry", amount: scry }, { ...ctx, controller: p }, (x) =>
            key(`${k}-scry-${x}`),
          );
          if (asked) return asked;
          r.vars[key(`${k}-scried`)] = [1];
        }
        const lib = p ? (s.players[p]?.library ?? []) : [];
        const top = lib[0];
        if (!o || !p || !top) {
          r.vars[key(`${k}-done`)] = [1];
          if (o) rulesEvent(s, { e: "explore", objectId: id, land: false });
          continue;
        }
        const land = !!s.defs[s.objects[top]?.defId ?? ""]?.types.includes("Land");
        if (!land) {
          const answer = r.vars[key(k)];
          if (!answer) {
            return {
              ask: {
                player: p,
                key: key(k),
                request: {
                  type: "yesNo",
                  intent: "may",
                  prompt: msg("Explore: put {card} into your graveyard?", { card: cardRefOf(s, top) }),
                  suggested: [0],
                },
              },
            };
          }
          r.vars[key(`${k}-done`)] = [1];
          emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
          changeCounters(s, o, P1P1, 1);
          if (answer[0] === 1) moveAndLog(s, top, "graveyard");
        } else {
          r.vars[key(`${k}-done`)] = [1];
          emit({ type: "reveal", player: p, defIds: [s.objects[top]?.defId ?? ""] });
          moveAndLog(s, top, "hand");
        }
        rulesEvent(s, { e: "explore", objectId: id, land });
      }
    }
    return;
  },
  connive(s, r, e, ctx, key) {
    // 701.50a: draw, discard; if a nonland card is discarded, a +1/+1 counter on the creature. 701.50e: "connives X",
    // draw X, discard X, a counter per nonland card discarded (X is read once, before the first draw).
    if (!r.vars[key("connive-n")]) r.vars[key("connive-n")] = [e.n === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.n))];
    const n = Number(r.vars[key("connive-n")]?.[0] ?? 1);
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const p = o?.controller;
      if (!o || !p || r.vars[key(`connive-${id}-done`)]) continue;
      // 701.50e: a creature that connives 0 still connives (abilities that trigger on it), without drawing or discarding.
      if (n === 0) {
        r.vars[key(`connive-${id}-done`)] = [1];
        continue;
      }
      if (!r.vars[key(`connive-${id}-drew`)]) {
        // Leader, Super-Genius: "if a creature you control would connive, draw a card first".
        const first = quantityMods(s, "connive", (a) => recipientMatches(s, a, id)).mods.reduce(
          (n, m) => n + ("add" in m ? (m.add ?? 0) : 0),
          0,
        );
        if (first > 0) drawCards(s, p, first);
        drawCards(s, p, n);
        r.vars[key(`connive-${id}-drew`)] = [1];
      }
      const hand = s.players[p]?.hand ?? [];
      if (hand.length === 0) {
        r.vars[key(`connive-${id}-done`)] = [1];
        continue;
      }
      const answer = r.vars[key(`connive-${id}`)];
      if (!answer) {
        const cheapest = [...hand].sort(
          (a, b) =>
            manaValue(s.defs[s.objects[a]?.defId ?? ""]?.manaCost) - manaValue(s.defs[s.objects[b]?.defId ?? ""]?.manaCost),
        );
        const count = Math.min(n, hand.length);
        return {
          ask: {
            player: p,
            key: key(`connive-${id}`),
            request: {
              type: "pick",
              intent: "discard",
              prompt:
                count === 1
                  ? msg("Connive: choose the card to discard")
                  : msg("Connive: choose the {n} cards to discard", { n: count }),
              options: [...hand],
              min: count,
              max: count,
              suggested: cheapest.slice(0, count),
            },
          },
        };
      }
      r.vars[key(`connive-${id}-done`)] = [1];
      const cards = [...new Set(answer.map(String))].filter((c) => hand.includes(c)).slice(0, n);
      if (cards.length === 0) continue;
      const nonland = cards.filter((c) => !s.defs[s.objects[c]?.defId ?? ""]?.types.includes("Land")).length;
      emit({ type: "discard", player: p, defIds: cards.map((c) => s.objects[c]?.defId ?? "") });
      for (const c of cards) announceDiscard(s, p, moveDiscarded(s, p, c, true));
      announceDiscardBatch(s, p, cards.length);
      if (nonland > 0 && onBattlefield(s, id)) changeCounters(s, o, P1P1, nonland);
    }
    return;
  },
  manifestDread(s, r, e, ctx, key) {
    const players = e.who ? resolveRef(s, ctx, e.who) : [ctx.controller];
    const times = e.times === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.times));
    const made = (r.vars[key("dreadMade")] ?? []).map(String);
    let step = Number(r.vars[key("dreadStep")]?.[0] ?? 0);
    for (; step < players.length * times; step++) {
      const player = players[Math.floor(step / times)] as string;
      const library = s.players[player]?.library ?? [];
      const top = library.slice(0, 2);
      if (top.length === 0) continue;
      let chosen = top[0] as string;
      if (top.length === 2) {
        const answer = r.vars[key(`dread${step}`)];
        if (!answer) {
          const creature = top.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Creature"));
          r.vars[key("dreadStep")] = [step];
          r.vars[key("dreadMade")] = made;
          return {
            ask: {
              player,
              key: key(`dread${step}`),
              request: {
                type: "pick",
                intent: "pickCards",
                prompt: msg("Manifest dread: the card to manifest (the other goes to the graveyard)"),
                options: top,
                min: 1,
                max: 1,
                suggested: [creature ?? (top[0] as string)],
              },
            },
          };
        }
        chosen = String(answer[0]);
      }
      const rest = top.filter((id) => id !== chosen);
      const id = putFaceDown(s, player, chosen, false);
      if (id) made.push(id);
      const graveyard = rest.map((c) => moveAndLog(s, c, "graveyard")).filter((c): c is string => !!c);
      rulesEvent(s, { e: "manifestDread", player, graveyard });
    }
    r.vars[key("dreadStep")] = [step];
    if (e.store) r.vars[`$ids:${e.store}`] = made;
    return;
  },
  revealFaceDown(s, r, e, ctx, key) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !o.faceDown) continue;
      const card = s.defs[o.faceDown.card];
      if (!r.vars[key(`revealed-${id}`)]) {
        emit({ type: "reveal", player: o.controller, defIds: [o.faceDown.card] });
        r.vars[key(`revealed-${id}`)] = [1];
      }
      if (!card?.types.includes("Creature")) continue;
      const answer = r.vars[key(`up-${id}`)];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key(`up-${id}`),
            request: {
              type: "yesNo",
              intent: "may",
              prompt: msg("Turn {card} face up?", { card: cardRef(card.id) }),
              suggested: [1],
            },
          },
        };
      }
      if (answer[0] === 1) turnFaceUp(s, id);
    }
    return;
  },
  turnFaceUp(s, r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const card = s.objects[id]?.faceDown ? s.defs[s.objects[id]?.faceDown?.card ?? ""] : undefined;
      // An instant or sorcery card can't be turned face up: Etrata exiles it (`store`), to cast it later without
      // paying.
      if (e.orExileCast && card && (card.types.includes("Instant") || card.types.includes("Sorcery"))) {
        const exiled = moveObject(s, id, "exile");
        if (exiled && e.store) r.vars[`$ids:${e.store}`] = [exiled];
        continue;
      }
      turnFaceUp(s, id);
    }
    return;
  },
};

/** "Scry" and "surveil" (same handling, depending on `e.op`). */
function scryOrSurveil(
  s: GameState,
  r: Resolution,
  e: Extract<Effect, { op: "scry" | "surveil" }>,
  ctx: EffectContext,
  key: (suffix: string) => string,
): OpResult {
  const library = s.players[ctx.controller]?.library ?? [];
  const top = library.slice(0, evalAmount(s, ctx, e.amount));
  if (top.length === 0) return;
  const scry = e.op === "scry";
  const picked = r.vars[key("pick")];
  if (!picked) {
    return {
      ask: {
        player: ctx.controller,
        key: key("pick"),
        request: {
          type: "pick",
          intent: scry ? "scryBottom" : "surveilGraveyard",
          prompt: scry
            ? msg("Scry {n}: choose the cards to put on the bottom of your library", { n: top.length })
            : msg("Surveil {n}: choose the cards to put into your graveyard", { n: top.length }),
          options: top,
          min: 0,
          max: top.length,
          suggested: [],
        },
      },
    };
  }
  const keep = top.filter((id) => !picked.includes(id));
  let order = keep;
  if (keep.length > 1) {
    const answer = r.vars[key("order")];
    if (!answer) {
      return {
        ask: {
          player: ctx.controller,
          key: key("order"),
          request: {
            type: "order",
            intent: "scryOrder",
            prompt: msg("Order of the cards put back on top (the first will be drawn first)"),
            items: keep,
            suggested: keep,
          },
        },
      };
    }
    order = answer.map(String);
  }
  const player = s.players[ctx.controller];
  if (!player) return;
  const rest = player.library.slice(top.length);
  // "Whenever you scry or surveil" (Reality Fracture).
  logTurnEvent(s, { e: "scry", player: ctx.controller });
  rulesEvent(s, { e: "scry", player: ctx.controller });
  if (scry) {
    player.library = [...order, ...rest, ...picked.map(String)];
    emit({ type: "scry", player: ctx.controller, top: order.length, bottom: picked.length });
  } else {
    player.library = [...order, ...rest];
    if (e.op === "surveil") store(r, e.store, order.length);
    // Enlightened Confidant, Chandra: some of the cards put into the graveyard this way then go to the hand.
    const toHand = e.op === "surveil" ? e.toHand : undefined;
    const maxMv = toHand?.maxManaValue !== undefined ? evalAmount(s, ctx, toHand.maxManaValue) : Number.POSITIVE_INFINITY;
    for (const id of picked.map(String)) {
      const back =
        !!toHand &&
        manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= maxMv &&
        (!toHand.filter || matchesCard(s, ctx.controller, id, { ...toHand.filter, controller: undefined }));
      const uid = s.objects[id]?.uid;
      player.library.push(id); // temporary: moveAndLog removes it from the library
      moveAndLog(s, id, "graveyard");
      const now = back ? player.graveyard.find((g) => s.objects[g]?.uid === uid) : undefined;
      if (now) moveAndLog(s, now, "hand");
    }
  }
  return;
}

/** Can each card be given a distinct color among its own? (small sets: exhaustive search) */
function distinctColors(options: string[][], used = new Set<string>()): boolean {
  const [first, ...rest] = options;
  if (!first) return true;
  return first.some((c) => {
    if (used.has(c)) return false;
    used.add(c);
    const ok = distinctColors(rest, used);
    used.delete(c);
    return ok;
  });
}

/** "One card per color" suggestion: each card takes a color not yet taken (in order). */
function onePerColor(pool: string[], colorsOf: (id: string) => string[]): string[] {
  const used = new Set<string>();
  return pool.filter((id) => {
    const c = colorsOf(id).find((x) => !used.has(x));
    if (c) used.add(c);
    return !!c;
  });
}
