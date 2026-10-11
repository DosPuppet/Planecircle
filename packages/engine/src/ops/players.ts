/** Engine effects: players (life, drawing, extra turns and steps, winning). Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import { createTokens, dealDamage, drawCards, gainLife, loseLife, sacrifice, setMonarch, setSpeed } from "../actions";
import { secretAnswerKey } from "../choices";
import type { OpHandlers } from "../effects";
import {
  announceDiscard,
  announceDiscardBatch,
  cardRefOf,
  damageSource,
  discardOrder,
  discardToTopChoice,
  evalAmount,
  millCards,
  moveDiscarded,
  nextTurnOf,
  resolveCompare,
  resolveRef,
  store,
} from "../effects";
import { RulesError } from "../errors";
import {
  apnapOrder,
  bump,
  emit,
  isAlive,
  isPlayer,
  moveObject,
  onBattlefield,
  opponentsOf,
  random,
  rulesEvent,
  shuffle,
} from "../state";
import { addPlayerEffect, cantLose, playerStatic, playerStaticTotal } from "../statics";
import { matchesObjectFilter } from "../targets";
import { msg } from "../text";
import { eliminate, endTheTurn } from "../turn";
import type { ChoiceRequest, ChoiceValue, Step } from "../types";
import { askCopiesInstead } from "./permanents";

export const HANDLERS: OpHandlers = {
  playerEffect(s, _r, e0, ctx) {
    // Loki Laufeyson: "with mana value less than or equal to Loki's power" is frozen on resolution (`resolveCompare`),
    // without going below 0.
    const f = e0.ability.nextSpell?.filter;
    const frozen = f && e0.ability.nextSpell ? resolveCompare(s, f, ctx.sourceId, ctx) : f;
    const e =
      frozen && frozen !== f && e0.ability.nextSpell
        ? {
            ...e0,
            ability: {
              ...e0.ability,
              nextSpell: {
                ...e0.ability.nextSpell,
                filter: {
                  ...frozen,
                  compare: frozen.compare?.map((c) => (typeof c.to === "number" ? { ...c, to: Math.max(0, c.to) } : c)),
                },
              },
            },
          }
        : e0;
    // "Can't attack you" (Sandswirl Wanderglyph), "your Jaces" (Jace, Multiverse Architect): "you" is the controller of
    // the effect, who is not affected themselves.
    const base =
      e.ability.cantAttack?.of === "you"
        ? { ...e.ability, cantAttack: { ...e.ability.cantAttack, of: ctx.controller } }
        : e.ability;
    // Taii Wakeen: "this turn, noncombat damage from your sources is increased by X": the amount is frozen now.
    const add = base.replacement?.modify.add;
    const withAdd0 =
      base.replacement && add !== undefined && typeof add !== "number"
        ? { ...base, replacement: { ...base.replacement, modify: { ...base.replacement.modify, add: evalAmount(s, ctx, add) } } }
        : base;
    // Jeska, Thrice Reborn: "if that creature would deal …": the designated object is frozen now (none: no effect).
    const sourceRef = withAdd0.replacement?.sourceRef;
    const sourceIs = sourceRef ? resolveRef(s, ctx, sourceRef).find((id) => !!s.objects[id]) : undefined;
    if (sourceRef && !sourceIs) return;
    const pinned = (() => {
      if (!withAdd0.replacement || !sourceIs) return undefined;
      const { sourceRef: _, ...rest } = withAdd0.replacement;
      return { ...rest, sourceIs, sourceDefIs: s.objects[sourceIs]?.defId };
    })();
    const withAdd = pinned ? { ...withAdd0, replacement: pinned } : withAdd0;
    // Will, Scion of Peace: "spells you cast this turn cost {X} less, where X is …": X is frozen now.
    const reduce = withAdd.spellCost?.reduce;
    const ability =
      withAdd.spellCost && reduce !== undefined && typeof reduce !== "number"
        ? { ...withAdd, spellCost: { ...withAdd.spellCost, reduce: Math.max(0, evalAmount(s, ctx, reduce)) } }
        : withAdd;
    const who = (e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller]).filter(
      (p) => p !== ability.cantAttack?.of,
    );
    // "For as long as [the source] remains on the battlefield": nothing if it has already left (611.2b).
    const whileSource = e.duration === "whileSource";
    if (whileSource && s.objects[ctx.sourceId]?.zone !== "battlefield") return;
    const until =
      e.duration === "untilYourNextTurn"
        ? nextTurnOf(s, ctx.controller) - 1
        : e.duration === "throughYourNextTurn"
          ? nextTurnOf(s, ctx.controller)
          : e.duration === "nextTurn"
            ? s.turn.number + 1
            : e.duration === "forever" || whileSource || (e.times !== undefined && !e.once)
              ? null
              : s.turn.number;
    const times = e.times !== undefined ? evalAmount(s, ctx, e.times) : 1;
    for (const p of who)
      for (let i = 0; i < times; i++)
        addPlayerEffect(
          s,
          p,
          ability,
          e.duration === "untilTheirNextTurn"
            ? nextTurnOf(s, p) - 1
            : e.duration === "throughTheirNextTurn"
              ? nextTurnOf(s, p)
              : until,
          e.times !== undefined || !!e.once,
          e.duration === "nextTurn" ? s.turn.number + 1 : undefined,
          e.duration === "thisCombat",
          whileSource ? ctx.sourceId : undefined,
          e.duration === "nextCombat" ? (s.turn.combats ?? 0) + 1 : undefined,
        );
    return;
  },
  gift(s, r, e, ctx, key) {
    // 702.174: the opponent chosen while casting the spell gets the gift (`CastInfo.giftTo`, on the spell, or on the
    // "gift promised" ability, copied from the permanent when it was put on the stack); with a single opponent, nothing
    // was asked: it is that one. Left the game: nothing.
    const cast = r.item.cast ?? s.objects[ctx.sourceId]?.cast;
    const to = cast?.giftTo ?? opponentsOf(s, ctx.controller)[0];
    if (!to || !isAlive(s, to)) return;
    if (e.kind === "card") drawCards(s, to, 1);
    else if (e.token) {
      // Moonlit Meditation of the gift's recipient: its "you may" (PLAN-L L5).
      const declined = askCopiesInstead(s, r, key, [to], e.token, 1);
      if (!(declined instanceof Set)) return declined;
      const created = createTokens(s, to, e.token, 1, true, {}, declined.has(to));
      for (const id of created) {
        const o = s.objects[id];
        if (o && e.kind === "fish") o.tapped = true;
      }
    }
    emit({ type: "gift", player: ctx.controller, to, kind: e.kind });
    rulesEvent(s, { e: "gift", player: ctx.controller });
    return;
  },
  mayWheel(s, r, _e, ctx, key) {
    // "Each player may discard their hand and draw seven cards": choices in APNAP order, then everything happens together.
    const order = apnapOrder(s);
    for (const p of order) {
      if (r.vars[key(`wheel-${p}`)]) continue;
      const hand = s.players[p]?.hand.length ?? 0;
      return {
        ask: {
          player: p,
          key: key(`wheel-${p}`),
          request: {
            type: "yesNo",
            intent: "may",
            prompt: msg("{card}: discard your hand ({n} card(s)) and draw seven cards?", {
              card: cardRefOf(s, ctx.sourceId),
              n: hand,
            }),
            suggested: [hand < 4 ? 1 : 0],
          },
        },
      };
    }
    const yes = order.filter((p) => r.vars[key(`wheel-${p}`)]?.[0] === 1);
    // Library of Leng: the cards that go on top of the library instead, asked before the discards.
    const tops = new Map<string, string[]>();
    for (const p of yes) {
      const top = discardToTopChoice(s, r, key(`top-${p}`), p, [...(s.players[p]?.hand ?? [])]);
      if (!Array.isArray(top)) return top;
      tops.set(p, top);
    }
    for (const p of yes) {
      const hand = [...(s.players[p]?.hand ?? [])];
      if (hand.length === 0) continue;
      const top = tops.get(p) ?? [];
      emit({ type: "discard", player: p, defIds: hand.map((id) => s.objects[id]?.defId ?? "") });
      for (const id of discardOrder(hand, top)) announceDiscard(s, p, moveDiscarded(s, p, id, top.includes(id)));
      announceDiscardBatch(s, p, hand.length);
    }
    for (const p of yes) drawCards(s, p, 7);
    return;
  },
  punisher(s, r, e, ctx, key) {
    // Rottenmouth Viper: "for each blight counter" (the life to lose is asked again each time).
    const times = e.times === undefined ? 1 : Math.max(0, evalAmount(s, ctx, e.times));
    for (let i = 0; i < times; i++)
      for (const p of resolveRef(s, ctx, e.who)) {
        if (!isPlayer(s, p) || r.vars[key(`pdone-${i}-${p}`)]) continue;
        const hand = s.players[p]?.hand ?? [];
        const f = e.sacrifice;
        const perms = f ? s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f)) : [];
        const options = ["life", ...(e.discard && hand.length ? ["discard"] : []), ...(perms.length ? ["sacrifice"] : [])];
        let choice = options.length === 1 ? "life" : r.vars[key(`punish-${i}-${p}`)]?.[0];
        if (choice === undefined) {
          return {
            ask: {
              player: p,
              key: key(`punish-${i}-${p}`),
              request: {
                type: "pick",
                intent: "punisher",
                prompt: msg("{card}: choose", { card: cardRefOf(s, ctx.sourceId) }),
                options,
                labels: {
                  life:
                    e.damage !== undefined
                      ? msg("Take {n} damage", { n: evalAmount(s, ctx, e.damage) })
                      : msg("Lose {n} life", { n: e.loseLife }),
                  discard: msg("ctx:choice|Discard a card"),
                  sacrifice: msg("ctx:choice|Sacrifice a permanent"),
                },
                min: 1,
                max: 1,
                suggested: [options[options.length - 1] as string],
              },
            },
          };
        }
        choice = String(choice);
        if (choice === "life") {
          if (e.damage !== undefined) {
            const src = damageSource(s, ctx);
            if (src) dealDamage(s, src, p, Math.max(0, evalAmount(s, ctx, e.damage)), false);
          } else loseLife(s, p, e.loseLife);
          r.vars[key(`pdone-${i}-${p}`)] = [1];
          continue;
        }
        const pool = choice === "discard" ? hand : perms;
        const picked = pool.length === 1 ? [pool[0] as string] : r.vars[key(`punishPick-${i}-${p}`)]?.map(String);
        if (!picked) {
          return {
            ask: {
              player: p,
              key: key(`punishPick-${i}-${p}`),
              request: {
                type: "pick",
                intent: choice === "discard" ? "discard" : "sacrifice",
                prompt: choice === "discard" ? msg("Discard a card") : msg("Sacrifice a permanent"),
                options: [...pool],
                min: 1,
                max: 1,
                suggested: [pool[0] as string],
              },
            },
          };
        }
        // Library of Leng: the discarded card may go on top of the library instead.
        const top = choice === "discard" ? discardToTopChoice(s, r, key(`punishTop-${i}-${p}`), p, picked) : [];
        if (!Array.isArray(top)) return top;
        r.vars[key(`pdone-${i}-${p}`)] = [1];
        for (const id of picked) {
          if (choice === "discard") {
            emit({ type: "discard", player: p, defIds: [s.objects[id]?.defId ?? ""] });
            announceDiscard(s, p, moveDiscarded(s, p, id, top.includes(id)));
          } else if (onBattlefield(s, id)) sacrifice(s, id);
        }
        if (choice === "discard") announceDiscardBatch(s, p, picked.length);
      }
    return;
  },
  draw(s, r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    let drawn = 0;
    let players = 0;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p)) continue;
      const k = drawCards(s, p, n);
      drawn += k;
      if (k > 0) players += 1;
    }
    // "If you draw one or more cards this way": the cards actually drawn; `<store>Players`: the players who drew at
    // least one ("for each opponent who drew a card this way", Cut a Deal).
    store(r, e.store, drawn);
    if (e.store) store(r, `${e.store}Players`, players);
    return;
  },
  gainLife(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const p of resolveRef(s, ctx, e.who)) if (isPlayer(s, p)) gainLife(s, p, n);
    return;
  },
  loseLife(s, r, e, ctx) {
    const amount = evalAmount(s, ctx, e.amount);
    let lost = 0;
    for (const p of resolveRef(s, ctx, e.who)) {
      if (!isPlayer(s, p)) continue;
      const n = e.half ? Math.floor(Math.max(0, s.players[p]?.life ?? 0) / 2) : amount;
      // "The life lost this way": what was actually lost (prevented by Teferi's Protection, doubled by Bloodletter).
      lost += loseLife(s, p, n);
    }
    store(r, e.store, lost);
    return;
  },
  speed(s, _r, e, ctx) {
    const players = e.who ? resolveRef(s, ctx, e.who).filter((x) => isPlayer(s, x)) : [ctx.controller];
    for (const p of players) {
      const speed = s.players[p]?.speed ?? 0;
      if (e.by > 0) {
        // 702.179: at most 4.
        if (speed < 4) setSpeed(s, p, Math.min(4, speed + e.by));
        continue;
      }
      // Spikeshell Harrier: only if their speed is greater than each other player's, never below 1.
      const others = s.playerOrder.filter((q) => q !== p && !s.players[q]?.lost).map((q) => s.players[q]?.speed ?? 0);
      if (speed > 1 && others.every((o) => speed > o)) setSpeed(s, p, Math.max(1, speed + e.by));
    }
    return;
  },
  radiation(s, _r, _e, ctx) {
    const p = ctx.controller;
    const pl = s.players[p];
    const n = pl?.counters?.rad ?? 0;
    if (!pl || pl.lost || n <= 0) return;
    const milled = millCards(s, [[p, pl.library.slice(0, n)]]);
    const nonland = milled.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land")).length;
    if (nonland <= 0) return;
    // Strong, the Brutish Thespian: life gained instead of lost.
    if (playerStatic(s, p, "radiationGains")) gainLife(s, p, nonland);
    else loseLife(s, p, nonland);
    pl.counters ??= {};
    const counters = pl.counters;
    counters.rad = Math.max(0, (counters.rad ?? 0) - nonland);
    emit({ type: "rad", player: p, amount: -nonland, total: counters.rad });
    bump(s); // statics depend on it (Nightkin Ambusher)
    return;
  },
  becomeMonarch(s, _r, e, ctx) {
    const p = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x)) : ctx.controller;
    if (p) setMonarch(s, p);
    return;
  },
  eachChooses(s, r, e, ctx, key) {
    const designated = new Set(resolveRef(s, ctx, e.who));
    // In turn order, starting with the controller (701.38a); a player who has left the game doesn't choose.
    const order = [ctx.controller, ...opponentsOf(s, ctx.controller)].filter(
      (p) => designated.has(p) && isPlayer(s, p) && isAlive(s, p),
    );
    const among = e.among;
    const card = cardRefOf(s, ctx.sourceId);
    const result = (p: string) => `$ch:${e.store}:${p}`;
    const rawKey = (p: string, i: number) => key(e.secret ? secretAnswerKey(p, i) : `ch|${p}|${i}`);
    /** The options of `p` (ids of the answers), none for a number. */
    const optionsOf = (p: string): string[] =>
      "labels" in among
        ? among.labels.map((_, i) => String(i))
        : "players" in among
          ? resolveRef(s, ctx, among.players).filter((x) => x !== p && isPlayer(s, x) && isAlive(s, x))
          : [];
    const suggestedOf = (p: string, options: string[]): ChoiceValue => {
      if ("max" in among) {
        const n = e.suggested === undefined ? 0 : evalAmount(s, { ...ctx, controller: p }, e.suggested);
        return Math.min(among.max, Math.max(0, n));
      }
      const i = e.suggested === undefined ? 0 : evalAmount(s, { ...ctx, controller: p }, e.suggested) - 1;
      return options[Math.min(options.length - 1, Math.max(0, i))] as string;
    };
    /** The answers of `p` (several with additional votes), or a question still to ask. */
    const answersOf = (
      p: string,
    ): { values: ChoiceValue[] } | { ask: { player: string; key: string; request: ChoiceRequest } } => {
      const options = optionsOf(p);
      if (!("max" in among) && options.length === 0) return { values: [] };
      const extra = e.vote ? playerStaticTotal(s, p, "extraVotes") : 0;
      const values: ChoiceValue[] = [];
      for (let i = 0; i <= extra; i++) {
        // "Never asked with a single option": a mandatory vote for the only other player.
        if (i === 0 && options.length === 1) {
          values.push(options[0] as string);
          continue;
        }
        const answer = r.vars[rawKey(p, i)];
        if (!answer) {
          const prompt =
            i > 0
              ? msg("{card}: you may vote an additional time", { card })
              : e.prompt
                ? msg("{card}: {prompt}", { card, prompt: e.prompt })
                : e.secret
                  ? msg("{card}: secretly choose a number", { card })
                  : msg("{card}: choose a number", { card });
          const suggested = suggestedOf(p, options);
          const request: ChoiceRequest =
            "max" in among
              ? { type: "number", intent: "other", prompt, min: 0, max: among.max, suggested: [suggested] }
              : {
                  type: "pick",
                  intent: "other",
                  prompt,
                  options,
                  ...("labels" in among ? { labels: Object.fromEntries(among.labels.map((l, j) => [String(j), l])) } : {}),
                  min: i > 0 ? 0 : 1,
                  max: 1,
                  suggested: [suggested],
                };
          return { ask: { player: p, key: rawKey(p, i), request } };
        }
        // An additional vote declined: no more of them.
        if (answer.length === 0) break;
        if ("max" in among) values.push(Math.min(among.max, Math.max(0, Number(answer[0] ?? 0))));
        else {
          const v = String(answer[0]);
          if (!options.includes(v)) throw new RulesError(msg("Unknown option"));
          values.push(v);
        }
      }
      return { values };
    };
    /** Stores and announces `p`'s answers (option labels by their rank, from 1). */
    const record = (p: string, values: ChoiceValue[], revealed: boolean) => {
      r.vars[result(p)] = "labels" in among ? values.map((v) => Number(v) + 1) : values;
      if (values.length)
        emit({
          type: "chose",
          player: p,
          defId: ctx.sourceDefId,
          values: values.map((v) => ("labels" in among ? (among.labels[Number(v)] ?? "") : String(v))),
          ...(e.vote ? { vote: true } : {}),
          ...(revealed ? { revealed: true } : {}),
        });
    };
    const secret: [string, ChoiceValue[]][] = [];
    for (const p of order) {
      if (r.vars[result(p)]) continue;
      const a = answersOf(p);
      if ("ask" in a) return a;
      // A public choice is announced as it is made (each player knows the votes cast before theirs); a secret one
      // waits for the others.
      if (e.secret) secret.push([p, a.values]);
      else record(p, a.values, false);
    }
    // All the secret answers are revealed together.
    for (const [p, values] of secret) record(p, values, true);
    for (const k of Object.keys(r.vars)) if (k.startsWith(key("secret|"))) delete r.vars[k];
    return;
  },
  controlNextTurn(s, _r, e, ctx) {
    const p = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
    if (p)
      s.turnControl = {
        player: p,
        by: ctx.controller,
        ...(e.combatOnly ? { combatOnly: true } : {}),
        ...(e.thenExtraTurn ? { thenExtraTurn: true } : {}),
      };
    return;
  },
  endTurn(s, r) {
    endTheTurn(s, r);
    return;
  },
  mayShuffleHandGraveyardDraw(s, r, e, ctx, key) {
    for (const p of apnapOrder(s)) {
      if (r.vars[key(`shuf-${p}`)] === undefined) {
        const answer = r.vars[key(`shufq-${p}`)];
        if (!answer) {
          return {
            ask: {
              player: p,
              key: key(`shufq-${p}`),
              request: {
                type: "yesNo",
                intent: "may",
                prompt: msg("{card}: shuffle your hand and graveyard into your library and draw {n} cards?", {
                  card: cardRefOf(s, ctx.sourceId),
                  n: e.n,
                }),
                suggested: [(s.players[p]?.hand.length ?? 0) < 4 ? 1 : 0],
              },
            },
          };
        }
        r.vars[key(`shuf-${p}`)] = [answer[0] === 1 ? 1 : 0];
      }
    }
    for (const p of apnapOrder(s)) {
      if (r.vars[key(`shuf-${p}`)]?.[0] !== 1) continue;
      const pl = s.players[p];
      if (!pl) continue;
      for (const id of [...pl.hand, ...pl.graveyard]) moveObject(s, id, "library");
      shuffle(s, pl.library);
      drawCards(s, p, e.n);
    }
    return;
  },
  coinFlip(s, r, e, ctx) {
    // Rakdos, the Showstopper: a coin for each object (heads or tails, nobody wins or loses the flip, 705.2).
    if (e.each) {
      const tails = resolveRef(s, ctx, e.each).filter(() => {
        const heads = random(s) < 0.5;
        emit({ type: "coinFlip", player: ctx.controller, won: heads });
        return !heads;
      });
      r.vars[`$ids:${e.store}`] = tails;
      store(r, e.store, tails.length);
      return;
    }
    if (e.sides) {
      const result = 1 + Math.floor(random(s) * e.sides);
      emit({ type: "dieRoll", player: ctx.controller, sides: e.sides, result });
      store(r, e.store, result);
      return;
    }
    const stats = s.players[ctx.controller]?.turnStats;
    // Edgar, King of Figaro: the first time each turn, the coin comes up heads and the flip is won.
    const rigged = !stats?.coinFlips && playerStatic(s, ctx.controller, "winFirstCoinFlips");
    if (stats) stats.coinFlips = (stats.coinFlips ?? 0) + 1;
    const won = rigged || random(s) < 0.5;
    emit({ type: "coinFlip", player: ctx.controller, won });
    store(r, e.store, won ? 1 : 0);
    return;
  },
  poison(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.n);
    for (const p of resolveRef(s, ctx, e.who)) {
      const pl = s.players[p];
      if (!pl || n <= 0) continue;
      pl.counters ??= {};
      const counters = pl.counters;
      if (e.counter === "rad") {
        counters.rad = (counters.rad ?? 0) + n;
        emit({ type: "rad", player: p, amount: n, total: counters.rad });
        bump(s);
        continue;
      }
      counters.poison = (counters.poison ?? 0) + n;
      emit({ type: "poison", player: p, amount: n, total: counters.poison });
      bump(s); // corrupted: statics depend on it
    }
    return;
  },
  winGame(s, _r, _e, ctx) {
    // Herald of Eternal Dawn (`cantLose`): "you can't lose the game and your opponents can't win the game".
    const opponents = opponentsOf(s, ctx.controller);
    if (opponents.some((p) => cantLose(s, p))) return;
    eliminate(s, opponents);
    return;
  },
  loseGame(s, _r, e, ctx) {
    const who = e.who ? resolveRef(s, ctx, e.who).filter((p) => isPlayer(s, p)) : [ctx.controller];
    eliminate(
      s,
      who.filter((p) => !cantLose(s, p)),
    );
    return;
  },
  extra(s, _r, e, ctx) {
    const n = e.amount !== undefined ? evalAmount(s, ctx, e.amount) : 1;
    const t = s.turn;
    const inMain = t.step === "main1" || t.step === "main2";
    // 500.8: the most recently added phase happens first (at the head of the queue); likewise for steps (500.10).
    const addPhases = (...steps: Step[]) => {
      t.addedPhases = [...steps, ...(t.addedPhases ?? [])];
    };
    const addStep = (step: Step) => {
      t.addedSteps = [step, ...(t.addedSteps ?? [])];
    };
    for (let i = 0; i < n; i++) {
      switch (e.kind) {
        case "upkeep":
          // Obeka: an additional beginning phase after this phase, with no untap or draw; Paradox Haze: after this step.
          if (e.after === "step") addStep("upkeep");
          else addPhases("upkeep");
          break;
        case "beginning":
          // Sphinx of the Second Sun: an additional beginning phase after this phase (untap, upkeep, draw).
          addPhases("untap");
          break;
        case "combat":
          // "After this main phase" (Full Throttle): nothing outside a main phase.
          if (e.after !== "main" || inMain) addPhases("beginCombat");
          break;
        case "combatAfterMain":
          // Relentless Assault: only if it resolves during a main phase.
          if (inMain) addPhases("beginCombat", "main2");
          break;
        case "endStep":
          addStep("end");
          break;
        case "turn":
          s.extraTurns = [...(s.extraTurns ?? []), ctx.controller];
          break;
      }
    }
    return;
  },
  setLife(s, r, e, ctx) {
    const before = s.players[ctx.controller]?.life ?? 0;
    // 701.12b, 118.5: each player gains or loses the difference (triggers and replacements included).
    const change = (p: string, life: number) => {
      const pl = s.players[p];
      if (!pl) return;
      if (life < pl.life) loseLife(s, p, pl.life - life);
      else if (life > pl.life) gainLife(s, p, life - pl.life);
    };
    if (e.exchange) {
      // Exchange (Mister Negative): both totals are read before the change.
      const a = resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x));
      const b = resolveRef(s, ctx, e.exchange).find((x) => isPlayer(s, x));
      if (!a || !b || a === b) return;
      const la = s.players[a]?.life ?? 0;
      const lb = s.players[b]?.life ?? 0;
      change(a, lb);
      change(b, la);
    } else {
      const n = evalAmount(s, ctx, e.amount ?? 0);
      for (const p of resolveRef(s, ctx, e.who)) change(p, n);
    }
    store(r, e.store, Math.max(0, before - (s.players[ctx.controller]?.life ?? 0)));
    return;
  },
};
