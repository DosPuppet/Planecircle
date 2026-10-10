/** Engine effects: counters, levels, stations, doors. Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import { createTokens } from "../actions";
import { cardRef } from "../choices";
import { counterLabel } from "../counterLabels";
import type { OpHandlers } from "../effects";
import { addEffect, evalAmount, resolveRef, store } from "../effects";
import { RulesError } from "../errors";
import { effectivePower } from "../layers";
import { blightTarget } from "../stack";
import {
  bump,
  changeCounters,
  chars,
  counterCount,
  emit,
  isCreature,
  isRoom,
  onBattlefield,
  P1P1,
  rulesEvent,
  unlockDoor,
} from "../state";
import { matchesObjectFilter } from "../targets";
import { msg } from "../text";
import type { GameObject, ObjectId, TokenSpec } from "../types";
import { askCopiesInstead } from "./permanents";

/** Endure token (701.64): white N/N Spirit. */
const ENDURE_SPIRIT: TokenSpec = {
  name: "Spirit",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 0,
  toughness: 0,
};

/** Order suggested by default: loyalty, +1/+1, then the other kinds. */
const DEFAULT_ORDER = (kinds: string[]): string[] => [
  ...["loyalty", "+1/+1"].filter((k) => kinds.includes(k)),
  ...kinds.filter((k) => k !== "loyalty" && k !== "+1/+1"),
];

export const HANDLERS: OpHandlers = {
  countersAboveBase(s, _r, e, ctx) {
    // The differences are measured first, then the counters are put.
    const gaps = s.battlefield
      .filter((id) => matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId))
      .map((id) => {
        const c = chars(s, id);
        return [id, c.power - (c.basePower ?? c.power)] as const;
      });
    for (const [id, n] of gaps) {
      const o = s.objects[id];
      if (o && n > 0) changeCounters(s, o, "+1/+1", n);
    }
    return;
  },
  doubleCounters(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      if (!e.all) changeCounters(s, o, P1P1, counterCount(o, P1P1));
      else for (const [kind, n] of Object.entries({ ...o.counters })) if (n > 0) changeCounters(s, o, kind, n);
    }
    return;
  },
  counterOnOrCreate(s, r, e, ctx, key) {
    // Reinforce Jace (a Jace token), amass (an Army): the player's first matching permanent, otherwise a token created
    // first; then the counters, and the extra subtypes (701.47a).
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    const players = resolveRef(s, ctx, e.who).filter((x) => !!s.players[x]);
    const found = (p: string) =>
      s.battlefield.find((x) => s.objects[x]?.controller === p && matchesObjectFilter(s, p, x, e.find));
    // Moonlit Meditation: its "you may", for the players who will create the token, before anything changes.
    const declined = askCopiesInstead(
      s,
      r,
      key,
      players.filter((p) => !found(p)),
      e.token,
      1,
    );
    if (!(declined instanceof Set)) return declined;
    for (const p of players) {
      let id = found(p);
      if (!id) {
        id = createTokens(s, p, e.token, 1, true, {}, declined.has(p))[0];
        // A copy that isn't an Army (or a Jace) gets nothing: the counters go on "an Army you control" (701.47a).
        if (id && !matchesObjectFilter(s, p, id, e.find)) continue;
      }
      const o = id ? s.objects[id] : undefined;
      if (!o) continue;
      if (n > 0) changeCounters(s, o, e.kind, n);
      const missing = (e.addSubtypes ?? []).filter((t) => !chars(s, o.id).subtypes.includes(t));
      if (missing.length) addEffect(s, [o.id], { addSubtypes: missing }, "permanent");
    }
    return;
  },
  proliferate(s, r, e, ctx, key) {
    // 701.34a: choose permanents and/or players that have counters; each gets one additional counter of each kind it
    // already has. Suggestion (autopilot, AI): your permanents without a harmful counter, and your opponents' harmful
    // counters (-1/-1, stun, poison).
    const times = evalAmount(s, ctx, e.times);
    const bad = new Set(["-1/-1", "stun"]);
    for (let t = 0; t < times; t++) {
      if (r.vars[key(`done${t}`)]) continue;
      const withCounters = s.battlefield.filter((id) => Object.values(s.objects[id]?.counters ?? {}).some((n) => n > 0));
      // Players with poison or rad counters (Fallout).
      const poisoned = s.playerOrder.filter(
        (p) => !s.players[p]?.lost && ((s.players[p]?.counters?.poison ?? 0) > 0 || (s.players[p]?.counters?.rad ?? 0) > 0),
      );
      const options = [...withCounters, ...poisoned];
      if (options.length === 0) return;
      // Powerful Broker: "give target permanent or player an additional counter of each kind" (no choice).
      if (e.what && !r.vars[key(`pick${t}`)])
        r.vars[key(`pick${t}`)] = resolveRef(s, ctx, e.what).filter((x) => options.includes(x));
      const answer = r.vars[key(`pick${t}`)];
      if (!answer) {
        const good = (id: string) => {
          const o = s.objects[id];
          if (!o) return false;
          const kinds = Object.entries(o.counters)
            .filter(([, n]) => n > 0)
            .map(([k]) => k);
          return o.controller === ctx.controller ? kinds.every((k) => !bad.has(k)) : kinds.every((k) => bad.has(k));
        };
        const suggested = [...withCounters.filter(good), ...poisoned.filter((p) => p !== ctx.controller)];
        return {
          ask: {
            player: ctx.controller,
            key: key(`pick${t}`),
            request: {
              type: "pick",
              intent: "proliferate",
              prompt: msg("Proliferate: choose the permanents and players that get an additional counter"),
              options,
              min: 0,
              max: options.length,
              suggested,
              autoOk: true,
            },
          },
        };
      }
      for (const v of answer.map(String)) {
        const o = s.objects[v];
        if (o?.zone === "battlefield") {
          for (const [kind, n] of Object.entries(o.counters)) if (n > 0) changeCounters(s, o, kind, 1);
        } else {
          const pl = s.players[v];
          const counters = pl?.counters;
          if (counters && (counters.poison ?? 0) > 0) {
            counters.poison = (counters.poison ?? 0) + 1;
            bump(s); // corrupted: statics depend on it
          }
          if (counters && (counters.rad ?? 0) > 0) {
            counters.rad = (counters.rad ?? 0) + 1;
            bump(s); // statics depend on it (Nightkin Ambusher)
            emit({ type: "rad", player: v, amount: 1, total: counters.rad });
          }
        }
      }
      r.vars[key(`done${t}`)] = [1];
    }
    return;
  },
  removeCounters(s, r, e, ctx, key) {
    // "Remove N counters" with no kind imposed: the player chooses the kind of each (one question per counter, as long
    // as several kinds remain), before any removal; the operation is replayed with the answers.
    const plans: [GameObject, string[]][] = [];
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      // A suspended card loses its time counters in exile (702.62).
      if (o?.zone !== "battlefield" && !(o?.zone === "exile" && o.suspended)) continue;
      const n = Math.max(0, evalAmount(s, ctx, e.n));
      const left: Record<string, number> = e.kind
        ? { [e.kind]: o.counters[e.kind] ?? 0 }
        : (Object.fromEntries(Object.entries(o.counters).filter(([, c]) => (c ?? 0) > 0)) as Record<string, number>);
      const plan: string[] = [];
      for (let i = 0; i < n; i++) {
        const kinds = DEFAULT_ORDER(Object.keys(left).filter((k) => (left[k] ?? 0) > 0));
        if (kinds.length === 0) break;
        let kind = kinds[0] as string;
        // All the remaining counters go ("remove all counters"): no choice to make.
        const remaining = Object.values(left).reduce((a, c) => a + Math.max(0, c ?? 0), 0);
        if (kinds.length > 1 && n - i < remaining) {
          const k = key(`rc-${id}-${i}`);
          const answer = r.vars[k];
          if (!answer) {
            return {
              ask: {
                player: ctx.controller,
                key: k,
                request: {
                  type: "pick",
                  intent: "other",
                  prompt:
                    n > 1
                      ? msg("{card}: which counter to remove ({i} of {n})?", { card: cardRef(o.defId), i: i + 1, n })
                      : msg("{card}: which counter to remove?", { card: cardRef(o.defId) }),
                  options: kinds,
                  labels: Object.fromEntries(
                    kinds.map((x) => [x, msg("{counter} ({n})", { counter: counterLabel(x), n: left[x] ?? 0 })]),
                  ),
                  min: 1,
                  max: 1,
                  suggested: [kind],
                },
              },
            };
          }
          const picked = String(answer[0]);
          if (!kinds.includes(picked)) throw new RulesError(msg("Invalid counter kind"));
          kind = picked;
        }
        plan.push(kind);
        left[kind] = (left[kind] ?? 0) - 1;
      }
      plans.push([o, plan]);
    }
    let removed = 0;
    for (const [o, plan] of plans) {
      const counts: Record<string, number> = {};
      for (const kind of plan) counts[kind] = (counts[kind] ?? 0) + 1;
      for (const [kind, take] of Object.entries(counts)) {
        changeCounters(s, o, kind, -take);
        removed += take;
      }
    }
    // Garnet: "a +1/+1 counter for each lore counter removed this way".
    store(r, e.store, removed);
    return;
  },
  endure(s, r, e, ctx, key) {
    // 701.64: "[this permanent] endures N": N +1/+1 counters on it, or a white N/N Spirit token. If it is no longer on
    // the battlefield, the token is created; enduring 0 does nothing.
    const n = evalAmount(s, ctx, e.amount);
    if (n <= 0) return;
    const id = resolveRef(s, ctx, e.what).find((x) => s.objects[x]?.zone === "battlefield");
    const o = id ? s.objects[id] : undefined;
    let choice = o ? undefined : "token";
    if (o) {
      const answer = r.vars[key("endure")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("endure"),
            request: {
              type: "pick",
              intent: "other",
              prompt:
                n > 1
                  ? msg("Endure {n}: {n} +1/+1 counters on {card}, or a {n}/{n} Spirit?", { n, card: cardRef(o.defId) })
                  : msg("Endure {n}: {n} +1/+1 counter on {card}, or a {n}/{n} Spirit?", { n, card: cardRef(o.defId) }),
              options: ["counters", "token"],
              labels: {
                counters: n > 1 ? msg("{n} +1/+1 counters", { n }) : msg("{n} +1/+1 counter", { n }),
                token: msg("A {n}/{n} Spirit token", { n }),
              },
              min: 1,
              max: 1,
              suggested: ["counters"],
            },
          },
        };
      }
      choice = String(answer[0]);
    }
    if (choice === "counters" && o) changeCounters(s, o, P1P1, n);
    else {
      const spirit = { ...ENDURE_SPIRIT, power: n, toughness: n };
      // Moonlit Meditation: its "you may" (PLAN-L L5).
      const declined = askCopiesInstead(s, r, key, [ctx.controller], spirit, 1);
      if (!(declined instanceof Set)) return declined;
      createTokens(s, ctx.controller, spirit, 1, true, {}, declined.has(ctx.controller));
    }
    return;
  },
  addCounters(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") changeCounters(s, o, e.kind ?? P1P1, n);
    }
    return;
  },
  blight(s, r, e, ctx, key) {
    // Blight N (ECL): each designated player chooses a creature they control and puts N −1/−1 counters on it. All the
    // choices are made before the counters (a pending question resumes the effect from the start). `store`: 1 if it
    // was done, and the blighted creatures (`ref.stored`, "the blighted creature").
    const n = Math.max(0, evalAmount(s, ctx, e.amount));
    const picks: ObjectId[] = [];
    for (const p of resolveRef(s, ctx, e.who).filter((x) => !!s.players[x] && !s.players[x]?.lost)) {
      const options = s.battlefield.filter((id) => s.objects[id]?.controller === p && isCreature(s, id));
      if (options.length === 0 || n === 0) continue;
      if (options.length === 1) {
        picks.push(options[0] as ObjectId);
        continue;
      }
      const answer = r.vars[key(`blight-${p}`)];
      if (!answer) {
        return {
          ask: {
            player: p,
            key: key(`blight-${p}`),
            request: {
              type: "pick",
              intent: "other",
              prompt: msg("Blight {n}: choose a creature you control ({n} −1/−1 counter(s))", { n }),
              options,
              min: 1,
              max: 1,
              suggested: [blightTarget(s, p, n) ?? (options[0] as string)],
            },
          },
        };
      }
      picks.push(String(answer[0]));
    }
    const done: ObjectId[] = [];
    for (const id of picks) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      // Each player blights a creature they control: they put the counters.
      changeCounters(s, o, "-1/-1", n, { by: o.controller });
      done.push(id);
    }
    store(r, e.store, done.length ? 1 : 0);
    if (e.store) r.vars[`$ids:${e.store}`] = done;
    return;
  },
  countersDivided(s, r, e, ctx, key) {
    // Division announced as the spell is put on the stack (601.2d): the share of a target that became illegal is lost (608.2b).
    const total = evalAmount(s, ctx, e.total);
    const division = e.to.kind === "target" ? r.item.division?.[e.to.id] : undefined;
    if (division && e.to.kind === "target") {
      const legal = new Set(resolveRef(s, ctx, e.to));
      (r.item.targets[e.to.id] ?? []).forEach((id, i) => {
        const o = s.objects[id];
        if (o && legal.has(id) && onBattlefield(s, id)) changeCounters(s, o, e.counter ?? P1P1, division[i] ?? 0);
      });
      return;
    }
    const among = resolveRef(s, ctx, e.to).filter((id) => onBattlefield(s, id));
    if (among.length === 0) return;
    let split: number[];
    if (among.length === 1 && !e.anyNumber) split = [total];
    else {
      const answer = r.vars[key("cdivide")];
      if (!answer) {
        const each = Math.floor(total / among.length);
        return {
          ask: {
            player: ctx.controller,
            key: key("cdivide"),
            request: {
              type: "divide",
              intent: "divideCounters",
              prompt: e.anyNumber
                ? msg("Divide {n} {counter} counters among these creatures", { n: total, counter: e.counter ?? P1P1 })
                : msg("Divide {n} {counter} counters among the targets", { n: total, counter: e.counter ?? P1P1 }),
              among,
              total: total,
              // 601.2d: at least one counter per target; with fewer counters than targets (reduced X), no minimum.
              minEach: !e.anyNumber && total >= among.length ? 1 : 0,
              suggested: among.map((_, i) => each + (i < total - each * among.length ? 1 : 0)),
            },
          },
        };
      }
      split = answer.map(Number);
    }
    among.forEach((id, i) => {
      const o = s.objects[id];
      if (o) changeCounters(s, o, e.counter ?? P1P1, split[i] ?? 0);
    });
    return;
  },
  station(s, _r, _e, ctx) {
    // 702.184a: charge counters equal to the power of the tapped creature (Tapestry Warden: its toughness if that is
    // greater).
    const o = s.objects[ctx.sourceId];
    const tapped = ctx.paid?.tapped?.[0];
    if (o?.zone !== "battlefield" || !tapped) return;
    const c = s.objects[tapped] ? chars(s, tapped) : s.lki[tapped];
    if (!c) return;
    const n = Math.max(0, effectivePower(c as { power: number; toughness: number }, "station"));
    if (n > 0) changeCounters(s, o, "charge", n);
    return;
  },
  setClassLevel(s, _r, e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || (o.classLevel ?? 1) >= e.level) return;
    o.classLevel = e.level;
    bump(s);
    rulesEvent(s, { e: "classLevel", objectId: o.id, level: e.level });
    return;
  },
  solveCase(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.solved) return;
    o.solved = true;
    bump(s);
    rulesEvent(s, { e: "caseSolved", player: o.controller, objectId: o.id });
    return;
  },
  monstrosity(s, _r, e, ctx) {
    // 701.37a: "if this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous"; it becomes
    // monstrous even if the counters are not all put (N is 0, or a replacement changes them).
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.monstrous) return;
    const n = evalAmount(s, ctx, e.amount);
    if (n > 0) changeCounters(s, o, P1P1, n);
    o.monstrous = true;
    bump(s);
    rulesEvent(s, { e: "monstrous", objectId: o.id });
    return;
  },
  moveCounter(s, r, e, ctx, key) {
    const from = resolveRef(s, ctx, e.from)
      .map((id) => s.objects[id])
      .find((o) => o?.zone === "battlefield");
    const to = resolveRef(s, ctx, e.to)
      .map((id) => s.objects[id])
      .find((o) => o?.zone === "battlefield");
    if (!from || !to || from === to) return;
    const kinds = Object.keys(from.counters).filter((k) => (from.counters[k] ?? 0) > 0);
    if (kinds.length === 0) return;
    let kind = kinds[0] as string;
    if (kinds.length > 1) {
      const answer = r.vars[key("kind")];
      if (!answer)
        return {
          ask: {
            player: ctx.controller,
            key: key("kind"),
            request: {
              type: "pick",
              intent: "other",
              prompt: msg("Kind of counter to move"),
              options: kinds,
              labels: Object.fromEntries(kinds.map((k) => [k, counterLabel(k)])),
              min: 1,
              max: 1,
              suggested: [kinds.includes("+1/+1") ? "+1/+1" : (kinds[0] as string)],
            },
          },
        };
      const chosen = String(answer[0]);
      if (!kinds.includes(chosen)) throw new RulesError(msg("Invalid counter kind"));
      kind = chosen;
    }
    changeCounters(s, from, kind, -1);
    changeCounters(s, to, kind, 1);
    return;
  },
  lkiCountersTo(s, _r, e, ctx) {
    const from = ctx.event?.objectId;
    const counters = from ? s.lki[from]?.counters : undefined;
    if (!counters) return;
    for (const id of resolveRef(s, ctx, e.to)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      for (const [kind, n] of Object.entries(counters)) if (n > 0) changeCounters(s, o, kind, n);
    }
    return;
  },
  door(s, r, e, ctx, key) {
    if (r.vars[key("doorDone")]) return;
    const options: string[] = [];
    const labels: Record<string, string> = {};
    // Doors that can be unlocked (suggested first).
    const locked = new Set<string>();
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const faces = s.defs[o?.defId ?? ""]?.faceDefs ?? [];
      if (o?.zone !== "battlefield" || !isRoom(s.defs[o.defId])) continue;
      faces.forEach((f, door) => {
        const open = !!o.unlocked?.includes(door);
        if (e.mode === "unlock" && open) return;
        const opt = `${id}#${door}`;
        options.push(opt);
        labels[opt] = open ? msg("Lock {door}", { door: f.name }) : msg("Unlock {door}", { door: f.name });
        if (!open) locked.add(opt);
      });
    }
    if (options.length === 0) return;
    let chosen = options[0] as string;
    if (options.length > 1) {
      const answer = r.vars[key("door")];
      if (!answer) {
        return {
          ask: {
            player: ctx.controller,
            key: key("door"),
            request: {
              type: "pick",
              intent: "other",
              prompt: e.mode === "unlock" ? msg("Door to unlock") : msg("Door to lock or unlock"),
              options,
              labels,
              min: 1,
              max: 1,
              suggested: [options.find((o) => locked.has(o)) ?? chosen],
            },
          },
        };
      }
      chosen = String(answer[0]);
    }
    r.vars[key("doorDone")] = [1];
    const [id = "", door = "0"] = chosen.split("#");
    const o = s.objects[id];
    if (!o) return;
    if (o.unlocked?.includes(Number(door))) {
      // 709.5g: locking a door triggers nothing; it can be unlocked again.
      o.unlocked = o.unlocked.filter((d) => d !== Number(door));
      bump(s);
    } else unlockDoor(s, id, Number(door));
    return;
  },
  unlockDoor(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) unlockDoor(s, id, e.door);
    return;
  },
};
