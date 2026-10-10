/** Engine effects: flow control (if, choices, reflexive, delayed; "you may" is a `pay` effect, `ops/pay.ts`). Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */
import type { OpHandlers } from "../effects";
import { cardRefOf, concreteSpec, evalAmount, evalCondition, nextTurnOf, resolveRef, store } from "../effects";
import { RulesError } from "../errors";
import { isPlayer } from "../state";
import { msg } from "../text";
import { createDelayed, pushInline } from "../triggers";
import type { ChoiceValue } from "../types";

export const HANDLERS: OpHandlers = {
  if(s, _r, e, ctx) {
    return evalCondition(s, ctx, e.cond) ? undefined : { skip: e.skip };
  },
  delayed(s, _r, e, ctx) {
    const bound: Record<string, string[]> = {};
    for (const [k, ref] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, ref);
    // Values frozen now ("with one fewer counter"), read later with amount.v(name).
    const vars: Record<string, ChoiceValue[]> = {};
    for (const [k, a] of Object.entries(e.vars ?? {})) vars[`$${k}`] = [evalAmount(s, ctx, a)];
    const ability = { targets: e.targets ?? [], effects: e.effects, bound, vars, ...(e.label ? { label: e.label } : {}) };
    // "When [this object] … this turn": the watched objects are designated now.
    const watch = e.watch ? resolveRef(s, ctx, e.watch) : undefined;
    if (watch?.length === 0) return;
    // "Until the end of that player's next turn" (the first watched player).
    const until = e.until === "theirNextTurn" && watch?.[0] && s.players[watch[0]] ? nextTurnOf(s, watch[0]) : undefined;
    const event = e.on
      ? { on: e.on, ...(watch ? { watch } : {}), ...(until !== undefined ? { untilTurn: until } : {}) }
      : undefined;
    createDelayed(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, ability, e.at, event);
    return;
  },
  reflexive(s, r, e, ctx) {
    // Values evaluated now: "up to X targets" (Miasma Demon), "with mana value equal to the number of coin counters"
    // (Wishing Well), "with total mana value X or less" (Fire Lord Sozin).
    const targets2 = e.targets.map((t) => concreteSpec(s, ctx, t));
    // No possible target (X = 0): nothing happens.
    if (targets2.some((t) => t.count === 0)) return;
    const bound: Record<string, string[]> = {};
    for (const [k, r] of Object.entries(e.bind ?? {})) bound[k] = resolveRef(s, ctx, r);
    const kept = e.keepVars ? Object.fromEntries(e.keepVars.map((k) => [`$${k}`, r.vars[`$${k}`] ?? []])) : undefined;
    // Values frozen now, read later with amount.v(name) (as for a delayed ability).
    const frozen = e.vars
      ? Object.fromEntries(Object.entries(e.vars).map(([k, a]) => [`$${k}`, [evalAmount(s, ctx, a)]]))
      : undefined;
    const vars = kept || frozen ? { ...kept, ...frozen } : undefined;
    pushInline(s, ctx.controller, ctx.sourceId, ctx.sourceDefId, {
      targets: targets2,
      effects: e.effects,
      bound,
      ...(vars ? { vars } : {}),
      ...(e.modes ? { modes: e.modes } : {}),
    });
    return;
  },
  chooseOption(s, r, e, ctx, key) {
    const answer = r.vars[key("option")];
    const options = e.labels.map((_, i) => String(i));
    // Expropriate: another player chooses (vote); with no designated player left in the game, nothing is chosen.
    const chooser = e.who ? resolveRef(s, ctx, e.who).find((x) => isPlayer(s, x) && !s.players[x]?.lost) : ctx.controller;
    if (!chooser) return;
    if (!answer) {
      return {
        ask: {
          player: chooser,
          key: key("option"),
          request: {
            type: "pick",
            intent: "other",
            prompt: msg("{card}: {prompt}", { card: cardRefOf(s, ctx.sourceId), prompt: e.prompt }),
            options,
            labels: Object.fromEntries(e.labels.map((l, i) => [String(i), l])),
            min: 1,
            max: 1,
            suggested: ["0"],
          },
        },
      };
    }
    const i = options.indexOf(String(answer[0]));
    if (i < 0) throw new RulesError(msg("Unknown option"));
    store(r, e.store, i + 1);
    return;
  },
};
