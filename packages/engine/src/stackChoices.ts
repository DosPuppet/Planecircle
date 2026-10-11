/**
 * Choices made for an item already put on the stack, before anyone receives priority (`announceNext`, called by
 * `advance`):
 * - new targets of a copy of a spell or ability (707.10c). All the supported cards that copy say "you may choose new
 *   targets"; the original targets are suggested. Changed or not, each target becomes a target of the copy (ward,
 *   valiant; not heroic: a copy is not cast);
 * - division of damage or counters among the targets (601.2d, 602.2b, 603.3d), kept in `StackItem.division`: on
 *   resolution, the share of a target that has become illegal is lost (608.2b);
 * - opponent who will receive the promised gift (702.174a: "as you cast this spell, you may choose an opponent"), kept
 *   in `CastInfo.giftTo` (on the permanent too, for the gift given as it enters). With a single opponent, nothing is
 *   asked. A copy keeps the original's opponent (707.10), carried over to it if chosen after it was made.
 *
 * A copy made during a cast (Pyromancer's Goggles) or during a resolution (Thousand-Year Storm) goes through the same
 * path: its targets are chosen as soon as priority would be given.
 */
import { ask } from "./choices";
import { type EffectContext, evalAmount } from "./effects";
import { RulesError } from "./errors";
import { giftChoiceNeeded, specsAndEffects, stackItemSpecs } from "./stack";
import { opponentsOf, rulesEvent } from "./state";
import { legalTargets } from "./targets";
import { msg } from "./text";
import type { ChoiceRequest, ChoiceValue, Effect, GameState, PendingStackChoice, StackItem } from "./types";

type Divided = Extract<Effect, { op: "damageDivided" | "countersDivided" }>;

/** "Divide … among the targets" effect of an item (at the top level of its effects) and its "target" word. */
export function dividedEffect(s: GameState, item: StackItem): { effect: Divided; spec: string } | undefined {
  for (const e of specsAndEffects(s, item).effects) {
    // Counters moved from an object (`from`): divided as it resolves, its share included.
    if ((e.op === "damageDivided" || (e.op === "countersDivided" && !e.from)) && e.to.kind === "target")
      return { effect: e, spec: e.to.id };
  }
  return undefined;
}

/**
 * The division of an item put on the stack (cast spell, activated or triggered ability) is to be announced if it has at
 * least two targets (a single one receives everything). Idempotent: called for each item by `announceNext`.
 */
function queueDivision(s: GameState, item: StackItem): void {
  if (item.division || item.pendingChoices?.some((c) => c.step === "divide")) return;
  const d = dividedEffect(s, item);
  if (!d || (item.targets[d.spec]?.length ?? 0) < 2) return;
  item.pendingChoices = [...(item.pendingChoices ?? []), { step: "divide" }];
}

/** The opponent of the promised gift is to be chosen if there are at least two (cast spell; a copy gets its own: 707.10). */
function queueGift(s: GameState, item: StackItem): void {
  if (item.copy || !giftChoiceNeeded(s, item) || item.pendingChoices?.some((c) => c.step === "gift")) return;
  if (opponentsOf(s, item.controller).length < 2) return;
  item.pendingChoices = [{ step: "gift" }, ...(item.pendingChoices ?? [])];
}

/**
 * Asks the next pending question of a stack item, or settles automatically those that have no choice.
 * Returns true if a question was asked.
 */
export function announceNext(s: GameState): boolean {
  for (const item of s.stack) {
    queueGift(s, item);
    queueDivision(s, item);
    while (item.pendingChoices?.length) {
      const c = item.pendingChoices[0] as PendingStackChoice;
      const request = requestFor(s, item, c);
      if (request) {
        ask(s, item.controller, request, { kind: "stackChoice", stackId: item.id });
        return true;
      }
      item.pendingChoices.shift();
    }
    if (item.pendingChoices) item.pendingChoices = undefined;
  }
  return false;
}

/** Answer to the question asked by `announceNext` for the item `stackId`. */
export function answerStackChoice(s: GameState, stackId: string, request: ChoiceRequest, values: ChoiceValue[]): void {
  const item = s.stack.find((x) => x.id === stackId);
  const c = item?.pendingChoices?.[0];
  if (!item || !c) throw new RulesError(msg("No choice pending for this stack item"));
  if (c.step === "target" && request.type === "pick") applyRetarget(s, item, c.spec, request, values);
  else if (c.step === "gift" && request.type === "pick") {
    const to = String(values[0] ?? "");
    if (!request.options.includes(to) || !item.cast) throw new RulesError(msg("This opponent can't receive the gift"));
    item.cast = { ...item.cast, giftTo: to };
    // Copies made during this cast (Pyromancer's Goggles, Teach by Example), higher on the stack: same opponent
    // (707.10). Only the spell being announced can have some whose gift is waiting.
    for (const x of s.stack) {
      if (!x.copy || x.sourceDefId !== item.sourceDefId || !x.cast || !x.pendingChoices?.some((p) => p.step === "gift")) continue;
      x.cast = { ...x.cast, giftTo: to };
      x.pendingChoices = x.pendingChoices.filter((p) => p.step !== "gift");
      if (!x.pendingChoices.length) x.pendingChoices = undefined;
    }
  } else if (c.step === "divide" && request.type === "divide") {
    const d = dividedEffect(s, item);
    if (!d) throw new RulesError(msg("Nothing to divide"));
    item.division = { ...item.division, [d.spec]: values.map(Number) };
  } else throw new RulesError(msg("Unexpected answer"));
  item.pendingChoices = item.pendingChoices?.slice(1);
}

/**
 * New targets chosen for a "target" word of a stack item (answer to `retargetRequest`). A kept target stays in its
 * place (the division follows the order of the targets); the new ones take the freed places. Replaying the same answer
 * changes nothing.
 */
export function applyRetarget(
  s: GameState,
  item: StackItem,
  specId: string,
  request: ChoiceRequest,
  values: ChoiceValue[],
): void {
  const orig = item.targets[specId] ?? [];
  const chosen = values.map(String);
  const fresh = chosen.filter((id) => !orig.includes(id));
  // The new targets replace first the existing targets not kept, then those that no longer exist (707.10c: they may
  // be changed too; left as they are, the copy won't find them).
  const next = orig.map((id) => (exists(s, id) && !chosen.includes(id) ? (fresh.shift() ?? id) : id));
  for (let i = 0; i < next.length && fresh.length; i++) if (!exists(s, next[i] as string)) next[i] = fresh.shift() as string;
  const g = request.type === "pick" ? request.group : undefined;
  if (g) {
    const holders = next.map((id) => g.holders[id] ?? id);
    if (g.kind === "same" && new Set(holders).size > 1) throw new RulesError(msg("The targets must belong to the same player"));
    if (g.kind === "different" && new Set(holders).size !== holders.length)
      throw new RulesError(msg("The targets must be controlled by different players"));
  }
  item.targets = { ...item.targets, [specId]: next };
}

/** Question to ask for this choice, or null if it is settled automatically. */
function requestFor(s: GameState, item: StackItem, c: PendingStackChoice): ChoiceRequest | null {
  const name = s.defs[item.sourceDefId]?.name ?? "";
  if (c.step === "announce") {
    // Changed or not, the targets become those of the copy. A copy is not cast: no crime (700.13).
    const all = Object.values(item.targets).flat();
    if (all.length) rulesEvent(s, { e: "targeted", stackId: item.id, controller: item.controller, targets: all });
    return null;
  }
  if (c.step === "target") return retargetRequest(s, item, c.spec, msg("{card} (copy)", { card: name }));
  if (c.step === "gift") {
    // Copy: the opponent comes from the original (`answerStackChoice`); without an answer, nothing is asked.
    if (item.copy) return null;
    const options = opponentsOf(s, item.controller);
    if (options.length < 2 || !item.cast) return null;
    return {
      type: "pick",
      intent: "other",
      prompt: msg("{card}: choose the opponent you give the gift to", { card: name }),
      options,
      min: 1,
      max: 1,
      // The next opponent in turn order (the choice made automatically until now).
      suggested: options.slice(0, 1),
    };
  }
  const d = dividedEffect(s, item);
  const among = d ? (item.targets[d.spec] ?? []) : [];
  if (!d || among.length < 2) return null;
  const total = evalAmount(s, contextOfItem(item), d.effect.total);
  if (total <= 0) return null;
  const each = Math.floor(total / among.length);
  const damage = d.effect.op === "damageDivided";
  return {
    type: "divide",
    intent: damage ? "divideDamage" : "divideCounters",
    prompt: damage
      ? msg("{card}: divide {n} damage among the targets", { card: name, n: total })
      : msg("{card}: divide {n} +1/+1 counters among the targets", { card: name, n: total }),
    among,
    total,
    minEach: total >= among.length ? 1 : 0,
    suggested: among.map((_, i) => each + (i < total - each * among.length ? 1 : 0)),
  };
}

/**
 * New targets of a stack item for a "target" word (copy, 707.10c; "you may choose new targets", Commandeer): as many as
 * originally, the original ones suggested. Legal for the item's controller.
 */
export function retargetRequest(s: GameState, item: StackItem, specId: string, name: string): ChoiceRequest | null {
  const spec = stackItemSpecs(s, item).find((x) => x.id === specId);
  const orig = item.targets[specId] ?? [];
  if (!spec || orig.length === 0) return null;
  // "another target": what is targeted by the other word is not offered.
  const taken = new Set((spec.otherThan ?? []).flatMap((o) => item.targets[o] ?? []));
  const legalSpec = item.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
  const legal = legalTargets(s, item.controller, legalSpec, item.sourceId).filter((id) => id !== item.id && !taken.has(id));
  // An original target that no longer exists may be replaced (707.10c: Chain of Vapor's copies); kept by default (the
  // copy won't find it on resolution).
  const kept = orig.filter((id) => exists(s, id) && !taken.has(id));
  const count = orig.filter((id) => exists(s, id)).length;
  const missing = orig.length - count;
  const options = [...new Set([...kept, ...legal])];
  if (options.length <= kept.length || (count === 0 && missing === 0)) return null;
  const suggested = [...kept, ...legal.filter((id) => !kept.includes(id))].slice(0, count);
  if (suggested.length < count) return null;
  const group =
    spec.samePlayer || spec.differentPlayers
      ? {
          kind: spec.samePlayer ? ("same" as const) : ("different" as const),
          holders: Object.fromEntries(
            options.map((id) => {
              const o = s.objects[id];
              return [id, o ? (o.zone === "battlefield" ? o.controller : o.owner) : id];
            }),
          ),
        }
      : undefined;
  return {
    type: "pick",
    intent: "changeTarget",
    prompt: retargetPrompt(name, count || orig.length, spec.label),
    options,
    min: count,
    max: count + Math.min(missing, options.length - count),
    suggested,
    ...(group ? { group } : {}),
  };
}

/**
 * Prompt of `retargetRequest`: one target or `count` targets, with the label of the "target" word when there is one.
 */
function retargetPrompt(card: string, count: number, label: string | undefined): string {
  if (count > 1)
    return label
      ? msg("{card}: choose {count} targets — {label} (the original ones suggested)", { card, count, label })
      : msg("{card}: choose {count} targets (the original ones suggested)", { card, count });
  return label
    ? msg("{card}: choose the target — {label} (the original one suggested)", { card, label })
    : msg("{card}: choose the target (the original one suggested)", { card });
}

/** Player, object or stack item still present. */
function exists(s: GameState, id: string): boolean {
  return !!s.players[id] || !!s.objects[id] || s.stack.some((x) => x.id === id);
}

/** Effect context of a stack item, outside resolution (amount to divide). */
function contextOfItem(item: StackItem): EffectContext {
  return {
    controller: item.controller,
    sourceId: item.sourceId,
    sourceDefId: item.sourceDefId,
    sourceSnapshot: item.sourceSnapshot,
    targets: item.targets,
    x: item.x,
    kicked: item.kicked,
    event: item.event,
    vars: {},
    paid: item.paid,
  };
}
