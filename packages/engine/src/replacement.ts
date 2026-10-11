/**
 * Replacement and prevention effects (614–615).
 *
 * - Carried by a card: "enters tapped", "enters with N counters" (applied during the zone change, before triggered
 *   abilities see the object enter).
 * - Created by a resolution, until end of turn: "if it would die, exile it instead", prevention of combat damage.
 * - "Instead of the graveyard" (614.1a): `replaceGraveyard`, which applies the order of 616.1 (self-replacement first,
 *   then a single replacement chosen for the affected player).
 * Limit: for the other events (damage, draw, life), several replacements apply in code order.
 */

import { gainLife } from "./actions";
import { cardRule } from "./cardDef";
import { boardAmount, type EffectContext, evalAmount, type OpResult, runEffectWith, staticContext } from "./effects";
import { copiableExceptions, copiedDefId, mergeMods, textBoxOf } from "./layers";
import { manaValue } from "./mana";
import { willHaveRiot } from "./stack";
import { changeCounters, chars, FACE_DOWN_ID, moveObject, newId, nextTimestamp, P1P1, setPrepared } from "./state";
import { controlledAbilitiesWithSource, playerStatic } from "./statics";
import { matchesCard, matchesObjectFilter, protectedFrom, sourceView, withChosen } from "./targets";
import { msg } from "./text";
import { checkCondition, pushInline } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type {
  Amount,
  CastInfo,
  ChoiceRequest,
  ChoiceValue,
  Color,
  Condition,
  Effect,
  GameObject,
  GameState,
  LayerMods,
  ManaType,
  ObjectId,
  PlayerId,
  Resolution,
  StackItem,
  TokenSpec,
  Zone,
} from "./types";

/** Context of entering the battlefield (value of X, kicker of the entering spell). */
export interface EntersContext {
  x?: number;
  /** Starting loyalty instead of the printed one (copy of Ob Nixilis, the Adversary). */
  loyalty?: number;
  kicked?: boolean;
  /** Enters from the resolution of a spell: how it was cast (X, kicker, mana spent…), noted on the permanent. */
  cast?: CastInfo;
  /** Aura: the object it enters attached to. */
  attachTo?: string;
  /** "As it enters, choose…" choices (614.12), made by `asEntersChoices`. */
  chosen?: GameObject["chosen"];
  /** Shock land: the life was paid (otherwise it enters tapped). */
  shockPaid?: boolean;
  /** "As it enters, you may behold" (Theorist's Sanctum): something was beheld (`cond.beheld` as it enters). */
  beheld?: boolean;
  /** "Enters as a copy" (707.9): definition copied as it enters (layer 1). */
  copyOf?: string;
  /** 707.9b: copiable exceptions of the model (`copiableExceptions`) and of the copy (`chooseCopy.except`). */
  copyMods?: LayerMods;
  /** Copy "until end of turn" (Cursed Mirror); otherwise for as long as it remains on the battlefield. */
  copyDuration?: "endOfTurn";
  /** Cards linked to the permanent (702.82: exiled as it enters by Mimeoplasm). */
  linked?: ObjectId[];
  /** Deadpool, Trading Card: the creature whose text box it exchanges with its own as it enters (layer 3). */
  textSwap?: ObjectId;
  /** "Enters under the control of an opponent of your choice" (Xantcha, Sleeper Agent): its controller as it enters. */
  enterController?: PlayerId;
  /** "When you do, exile that card": the card copied from a graveyard (Superior Spider-Man, 603.12). */
  exileCopied?: ObjectId;
  /** Riot (702.136): the choice made while resolving the spell (otherwise the default choice, `defaultRiot`). */
  riot?: "counter" | "haste";
  /**
   * Entering modifications imposed by the effect that puts it onto the battlefield (614.1c, 614.12): they are in place
   * before the entering event, which triggers therefore see ("whenever a Zombie enters").
   */
  tapped?: boolean;
  /** 508.4: enters attacking this player or this planeswalker (without having been declared as an attacker). */
  attacking?: string;
  counters?: { kind: string; n: number }[];
  mods?: LayerMods;
  /** The `mods` are the exceptions of a copy (copy token "except…"): copiable (707.9b). */
  modsCopiable?: boolean;
  /** Haste until end of turn (Summon: Fenrir). */
  haste?: boolean;
  /** Impending (702.176a): N time counters; it isn't a creature as long as it has any. */
  impending?: number;
  /**
   * The "as it enters" effects were done before the move (even without choosing anything); otherwise they are done as
   * it enters, with the suggested answers (`asEntersChoices`, mode `default`).
   */
  asEnters?: boolean;
}

/** 303.4f: what an Aura entering without being cast can enchant (permanents; not player Auras). */
export function auraHosts(s: GameState, controller: PlayerId, cardId: ObjectId): ObjectId[] {
  const enchant = s.defs[s.objects[cardId]?.defId ?? ""]?.enchant;
  // Animate Dead entering without being cast: nothing chosen in a graveyard, it stays in its zone (approximation).
  if (!enchant || enchant.player || enchant.graveyard) return [];
  return s.battlefield.filter(
    (id) =>
      id !== cardId &&
      !protectedFrom(s, id, sourceView(s, cardId)) &&
      matchesObjectFilter(s, controller, id, enchant.filter, cardId),
  );
}

/** Riot without a choice made while resolving the spell: haste if the creature can still attack this turn, otherwise
 * the counter. */
export function defaultRiot(s: GameState, o: GameObject): "counter" | "haste" {
  const early = ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.turn.step);
  return s.turn.active === o.controller && early && !chars(s, o.id).keywords.includes("haste") ? "haste" : "counter";
}

/** What the "as it enters" effects bring to the entering (614.1c, 614.12), read by `applyEntersReplacements`. */
export type EntersChoices = Pick<
  EntersContext,
  | "asEnters"
  | "chosen"
  | "riot"
  | "copyOf"
  | "copyMods"
  | "copyDuration"
  | "counters"
  | "tapped"
  | "linked"
  | "exileCopied"
  | "beheld"
  | "textSwap"
  | "enterController"
>;

/**
 * How the "as it enters" loop answers its questions:
 * - `ask`: they are asked (the resolution is suspended, then the effect resumes with the answer);
 * - `auto`: the suggested answer (after a random draw, which would not be replayed);
 * - `default`: the suggested answer, and only the choices (entering outside a resolution: return from a linked exile,
 *   copy token, ninjutsu; the permanent is already entering, the other effects are not done);
 * - `probe`: the first question only, without doing anything (land offered by `legalActions`);
 * - `{ first }`: the answer given with the decision to play a land, then the suggested answers.
 */
export type EntersMode = "ask" | "auto" | "default" | "probe" | { first: ChoiceValue[] };

/** The entering object: its id (on the stack, in its zone or already on the battlefield), its face, its controller. */
export interface Entering {
  id: ObjectId;
  defId: string;
  controller: PlayerId;
  /** X and kicker of the resolving spell (X is 0 for a card that isn't cast, 107.3). */
  x?: number;
  kicked?: boolean;
}

type EntersAsk = Extract<OpResult, { ask: unknown }>;

/** Prefix of the "as it enters" choices of a resolving permanent spell (`asEnters` operation, `finishResolution`). */
export const ENTERS_PREFIX = "enter:";

/** "As it enters" effects that only choose: the only ones done outside a resolution, and probed for a land. */
/** `chooseOption`: "you may have it enter tapped. If you do, …" (Mariposa Military Base), a choice among labels. */
const CHOICE_OPS: ReadonlySet<Effect["op"]> = new Set(["chooseOnEnter", "chooseCopy", "exchangeTextBox", "chooseOption"]);
/** An "as it enters" effect that only chooses: a choice op, or "you may behold" (Theorist's Sanctum). */
const isChoiceEffect = (e: Effect): boolean => CHOICE_OPS.has(e.op) || (e.op === "pay" && !!e.cost.behold);
/** Results of these choices, removed before each effect (a second choice of the same kind is properly asked). */
const RESULT_KEYS = ["$chosen", "$copyOf", "$copyCard", "$devoured", "$ids:devoured", "$beheld", "$textSwap"];

/** Riot (702.136a): a +1/+1 counter or haste; suggestion: haste if it can still attack this turn. */
function riotRequest(s: GameState, controller: PlayerId): ChoiceRequest {
  const early = ["untap", "upkeep", "draw", "main1", "beginCombat"].includes(s.turn.step);
  return {
    type: "pick",
    intent: "other",
    prompt: msg("Riot: a +1/+1 counter or haste?"),
    options: ["counter", "haste"],
    labels: { counter: msg("A +1/+1 counter"), haste: msg("Gain haste") },
    min: 1,
    max: 1,
    suggested: [s.turn.active === controller && early ? "haste" : "counter"],
  };
}

/** The "as it enters" choice noted on the permanent, according to its kind and the answer. */
export function chosenValue(kind: string, value: string): GameObject["chosen"] {
  if (kind === "cardName" || kind === "landName") return { cardName: value };
  if (kind === "parity") return { parity: value === "odd" ? "odd" : "even" };
  if (kind === "mode") return { mode: value };
  if (kind === "number") return { number: Number(value) };
  if (kind === "landType") return { landType: value };
  if (kind === "player") return { player: value };
  if (kind === "manaType") return { manaType: value as ManaType };
  return kind === "color" ? { color: value as Color } : { creatureType: value };
}

/** What a finished "as it enters" effect brings to the entering, according to the values it stored (`diff`). */
function collectEntering(
  s: GameState,
  out: EntersChoices,
  e: Effect,
  diff: Record<string, ChoiceValue[]>,
  ctx: EffectContext,
): void {
  if (e.op === "chooseOnEnter") {
    const [kind, value] = (diff.$chosen ?? []).map(String);
    if (kind && value)
      out.chosen = { ...out.chosen, ...chosenValue(kind, value), ...(e.secret ? { secret: ctx.controller } : {}) };
    if (kind === "player" && value && e.control) out.enterController = value;
  } else if (e.op === "chooseCopy") {
    const [defId, model] = (diff.$copyOf ?? []).map(String);
    if (!defId) return;
    out.copyOf = defId;
    // 707.9b: the exceptions of the model, then those of the copy, are copiable.
    out.copyMods = mergeMods(copiableExceptions(s, model), e.except);
    if (e.duration) out.copyDuration = e.duration;
    if (e.counters) {
      const n = Math.max(0, evalAmount(s, ctx, e.counters.n));
      if (n > 0) out.counters = [...(out.counters ?? []), { kind: e.counters.kind, n }];
    }
    if (e.tapped) out.tapped = true;
    const card = diff.$copyCard?.[0];
    if (e.exile && card !== undefined) out.exileCopied = String(card);
  } else if (e.op === "exchangeTextBox") {
    const other = diff.$textSwap?.[0];
    if (other !== undefined) out.textSwap = String(other);
  } else if (e.op === "pay" && e.cost.behold) {
    // "As this land enters, you may behold a Jace" (Theorist's Sanctum): read by `cond.beheld` as it enters.
    out.beheld = Number(diff.$beheld?.[0] ?? 0) > 0;
  } else if (e.op === "devour") {
    const n = Number(diff.$devoured?.[0] ?? 0);
    if (n > 0) out.counters = [...(out.counters ?? []), { kind: P1P1, n: e.n * n }];
    const exiled = diff["$ids:devoured"] ?? [];
    if (exiled.length) out.linked = [...(out.linked ?? []), ...exiled.map(String)];
  }
}

/**
 * 614.1c, 614.12 (PLAN-H H9): the single loop of the "as it enters" effects of a permanent, whatever the path of
 * entering: resolving permanent spell (`asEnters` operation, `specsAndEffects`), copy of a permanent spell (707.10: the
 * token), land played (`playLand`, the answer comes with the decision), effect that puts it onto the battlefield
 * (`arrivalChoices`, `ops/zones.ts`), any other entering (`applyEntersReplacements`, mode `default`).
 *
 * In order: riot (702.136, printed or granted), then the effects of `CardDef.asEnters`; if it enters as a copy, the
 * riot and the "as it enters" effects of the model (707.9: the copy makes the choices of the copied permanent; not a
 * second copy). Counters put on `ref.self` are those it enters with. A face-down permanent has no "as it enters"
 * effect (708.2).
 *
 * Each finished effect is noted in `vars` (under `prefix`) with what it stored: the replayed loop (answer to a
 * question, end of the resolution) doesn't redo it. Returns the question to ask, otherwise what the entering brings.
 */
export function asEntersChoices(
  s: GameState,
  vars: Record<string, ChoiceValue[]>,
  entering: Entering,
  prefix: string,
  mode: EntersMode,
): EntersAsk | EntersChoices {
  const out: EntersChoices = { asEnters: true };
  const own = s.defs[entering.defId];
  if (!own || entering.defId === FACE_DOWN_ID) return out;
  // Nothing to do: most enterings (only riot and `asEnters` ask questions).
  if (!own.asEnters?.length && (mode === "default" || mode === "probe" || !willHaveRiot(s, entering.controller, own))) return out;
  const scratch: Record<string, ChoiceValue[]> = {};
  const item: StackItem = {
    id: `${prefix}enters`,
    kind: "ability",
    controller: entering.controller,
    sourceId: entering.id,
    sourceDefId: entering.defId,
    abilityIndex: -1,
    mode: 0,
    targets: {},
    x: entering.x ?? 0,
    kicked: !!entering.kicked,
    sourceSnapshot: { keywords: [], power: 0, controller: entering.controller },
  };
  const sub: Resolution = {
    item,
    effects: [],
    pc: 0,
    controller: entering.controller,
    targets: {},
    vars: scratch,
    awaiting: null,
  };
  let given = 0;
  // The answer to a question according to the mode; `null`: ask it.
  const answer = (request: ChoiceRequest): ChoiceValue[] | null => {
    if (mode === "ask" || mode === "probe") return null;
    if (typeof mode === "object" && given++ === 0) return mode.first;
    return request.suggested;
  };
  const phases = [own];
  for (let phase = 0; phase < phases.length; phase++) {
    const d = phases[phase] as NonNullable<typeof own>;
    const ctx: EffectContext = {
      controller: entering.controller,
      sourceId: entering.id,
      sourceDefId: d.id,
      sourceSnapshot: item.sourceSnapshot,
      targets: {},
      x: entering.x ?? 0,
      kicked: !!entering.kicked,
      vars: scratch,
    };
    // 702.136: riot, printed or granted (Spider-Punk); outside a resolution, the default choice (`defaultRiot`).
    if (out.riot === undefined && mode !== "default" && mode !== "probe" && willHaveRiot(s, entering.controller, d)) {
      const key = `${prefix}riot`;
      let v = vars[key];
      if (!v) {
        const request = riotRequest(s, entering.controller);
        const a = answer(request);
        if (a === null) return { ask: { player: entering.controller, request, key } };
        v = a;
        vars[key] = a;
      }
      out.riot = String(v[0]) === "haste" ? "haste" : "counter";
    }
    // The model of a copy: its effects, except another copy.
    const effects = (d.asEnters ?? []).filter((e) => phase === 0 || e.op !== "chooseCopy");
    let skip = 0;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i] as Effect;
      if (skip > 0) {
        skip -= 1;
        continue;
      }
      // Outside a resolution (`default`) and to probe a land (`probe`): the choices only.
      if ((mode === "default" || mode === "probe") && !isChoiceEffect(e)) continue;
      // "It enters with N counters": counters put on itself (614.1c).
      if (e.op === "addCounters" && e.what.kind === "self") {
        const n = Math.max(0, evalAmount(s, ctx, e.amount));
        if (n > 0) out.counters = [...(out.counters ?? []), { kind: e.kind ?? P1P1, n }];
        continue;
      }
      // "It enters tapped": tapping itself (614.1c; Mariposa Military Base).
      if (e.op === "tap" && e.what.kind === "self") {
        out.tapped = true;
        continue;
      }
      const slot = `${prefix}${phase}.${i}`;
      const done = vars[`${slot}!`];
      let diff: Record<string, ChoiceValue[]>;
      if (done) {
        diff = JSON.parse(String(done[0])) as Record<string, ChoiceValue[]>;
        skip = Number(done[1] ?? 0);
      } else {
        for (const k of RESULT_KEYS) delete scratch[k];
        const before = { ...scratch };
        let res: OpResult;
        for (let guard = 0; ; guard++) {
          for (const k of Object.keys(vars)) if (k.startsWith(`${slot}:`)) scratch[k] = vars[k] as ChoiceValue[];
          res = runEffectWith(s, sub, e, ctx, (k) => `${slot}:${k}`);
          if (!res || !("ask" in res) || guard >= 20) break;
          const a = answer(res.ask.request);
          if (a === null) return res;
          vars[res.ask.key] = a;
        }
        skip = res && "skip" in res ? res.skip : 0;
        diff = {};
        for (const [k, v] of Object.entries(scratch)) if (k.startsWith("$") && before[k] !== v) diff[k] = v;
        if (mode !== "probe") vars[`${slot}!`] = [JSON.stringify(diff), skip];
      }
      Object.assign(scratch, diff);
      collectEntering(s, out, e, diff, ctx);
    }
    const model = phase === 0 && out.copyOf ? s.defs[out.copyOf] : undefined;
    if (model) phases.push(model);
  }
  return out;
}

/**
 * Merges the entering context and what the "as it enters" effects bring: what the context already sets wins (an
 * imposed copy), the counters add up, "tapped" comes from either.
 */
export function withEntersChoices(ctx: EntersContext, choices: EntersChoices): EntersContext {
  const counters = [...(ctx.counters ?? []), ...(choices.counters ?? [])];
  const out: EntersContext = { ...choices, asEnters: true };
  for (const [k, v] of Object.entries(ctx)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  out.counters = counters.length ? counters : undefined;
  out.tapped = ctx.tapped || choices.tapped || undefined;
  return out;
}

/**
 * Amount evaluated as it enters, from the point of view of `o` (the source of the replacement).
 * `entering`: the entering object, excluded from counts ("for each other Angel you already control").
 */
function amountAtEntry(s: GameState, a: Amount, o: GameObject, ctx: EntersContext, entering?: GameObject): number {
  if (typeof a === "number") return a;
  if (a.kind === "x") return ctx.x ?? 0;
  if (a.kind === "kicked") return ctx.kicked ? a.yes : a.no;
  if (a.kind === "spent" && !a.of && a.what === "mana") return ctx.cast?.manaSpent ?? 0;
  // Coin of Mastery: "for each mana from an artifact source spent to cast it" (the entering creature).
  if (a.kind === "spent" && !a.of && a.what === "artifact") return ctx.cast?.spentFrom?.artifact ?? 0;
  // Scarlet Spider, Ben Reilly: "where X is the mana value of the returned creature" (Web-slinging).
  if (a.kind === "manaValueOf" && a.ref.kind === "cost" && a.ref.paid === "bounced")
    return manaValue(s.defs[s.objects[ctx.cast?.costBounced?.[0] ?? ""]?.defId ?? ""]?.manaCost);
  // Converge: "a counter for each color of mana spent to cast it".
  if (a.kind === "spent" && !a.of && a.what === "colors")
    return (["W", "U", "B", "R", "G"] as const).filter((c) => (ctx.cast?.spentColors?.[c] ?? 0) > 0).length;
  // Arithmetic (Slumbering Trudge: "3 minus X").
  if (a.kind === "sum") return a.of.reduce<number>((n, x) => n + amountAtEntry(s, x, o, ctx, entering), 0);
  if (a.kind === "neg") return -amountAtEntry(s, a.of, o, ctx, entering);
  if (a.kind === "max") return Math.max(...a.of.map((x) => amountAtEntry(s, x, o, ctx, entering)));
  // Bioengineered Future: lands that entered this turn under the control of the source.
  if (a.kind === "turnEvents") return countTurnEvents(s, a.query, o.controller);
  // Power on the battlefield ("the greatest power among other creatures you control", Prime Speaker Zegana; total
  // power), without the entering object.
  if (a.kind === "aggregate" && a.property === "power" && (a.fn === "max" || a.fn === "sum") && !a.zone && !a.of) {
    const f = withChosen(a.filter ?? {}, o);
    const powers = s.battlefield
      .filter((id) => id !== (entering ?? o).id && matchesObjectFilter(s, o.controller, id, f, o.id))
      .map((id) => chars(s, id).power);
    return a.fn === "max" ? Math.max(0, ...powers) : powers.reduce((n, x) => n + Math.max(0, x), 0);
  }
  if (a.kind === "count") {
    const f = withChosen(a.filter, o);
    const n = boardAmount(s, { ...a, filter: f }, o.controller, o.id);
    return entering && matchesObjectFilter(s, o.controller, entering.id, f, o.id) ? n - 1 : n;
  }
  // The other amounts depend only on the game state (Gev, Scaled Scorch: "a counter for each opponent who lost life
  // this turn"), seen from the source.
  return evalAmount(s, staticContext(s, o.controller, o.id), a);
}

/** Condition of an "enters with" ability: the kicker and X of the cast spell are known as it enters. */
function conditionAtEntry(s: GameState, c: Condition, o: GameObject, ctx: EntersContext): boolean {
  if (c.kind === "kicked") return !!ctx.kicked;
  if (c.kind === "beheld" && ctx.beheld !== undefined) return ctx.beheld;
  if (c.kind === "xAtLeast") return (ctx.x ?? 0) >= c.n;
  if (c.kind === "not") return !conditionAtEntry(s, c.cond, o, ctx);
  if (c.kind === "all") return c.of.every((x) => conditionAtEntry(s, x, o, ctx));
  if (c.kind === "any") return c.of.some((x) => conditionAtEntry(s, x, o, ctx));
  return checkCondition(s, c, o.controller, o.id);
}

/** An "exile it instead" replacement that applies to an object about to go to the graveyard. */
interface GraveyardCandidate {
  /** Controller of the replacement (source, creator of the effect); absent for a rule (finality counter). */
  controller?: PlayerId;
  sourceId?: ObjectId;
  link?: "object" | "uid";
  gainLife?: number;
  createToken?: TokenSpec;
  timestamp: number;
}

/** Destination after the "instead of the graveyard" replacements (614.1a, 616.1). */
export interface GraveyardOutcome {
  to: Zone;
  /** Progenitus: shuffle the library after the move. */
  shuffle?: boolean;
  /** Source to link the new object to (Valgavoth). */
  linkTo?: ObjectId;
}

function graveyardCandidates(s: GameState, o: GameObject): GraveyardCandidate[] {
  const out: GraveyardCandidate[] = [];
  const fromBattlefield = o.zone === "battlefield";
  // Effects created by a resolution: "if it would die this turn, exile it instead" (Lava Coil).
  if (fromBattlefield) {
    for (const r of s.replacements) if (r.kind === "exileIfDies" && r.objects.includes(o.id)) out.push({ timestamp: 0 });
    // 122.1h: finality counter.
    if ((o.counters.finality ?? 0) > 0) out.push({ timestamp: 0 });
  }
  // Abilities of the permanents and emblems of each player.
  const graveyardOwner = o.owner;
  for (const p of s.playerOrder) {
    for (const { id, ab } of controlledAbilitiesWithSource(s, p)) {
      if (ab.kind !== "graveyardReplacement") continue;
      if (ab.fromBattlefield && !fromBattlefield) continue;
      if (ab.graveyardOf === "you" && graveyardOwner !== p) continue;
      if (ab.graveyardOf === "opponent" && graveyardOwner === p) continue;
      if (ab.notControlledByYou && o.controller === p) continue;
      if (ab.condition && !checkCondition(s, ab.condition, p, id)) continue;
      if (ab.filter) {
        const ok = fromBattlefield ? matchesObjectFilter(s, p, o.id, ab.filter, id) : matchesCard(s, p, o.id, ab.filter, id);
        if (!ok) continue;
      }
      out.push({
        controller: p,
        sourceId: id,
        link: ab.link,
        gainLife: ab.gainLife,
        createToken: ab.createToken,
        timestamp: s.objects[id]?.timestamp ?? 0,
      });
    }
  }
  return out;
}

/**
 * 614.1a / 616.1: the object `o` would go to the graveyard. Its own replacement applies first (616.1a: Progenitus is
 * shuffled into the library); otherwise, among the "exile it instead", the affected player (the controller of the
 * object, or its owner outside the battlefield) chooses one (616.1e). Approximation (automatic choice): they first
 * discard those that benefit an opponent (life gained, linked card), then take the oldest. Once the object is exiled,
 * the others no longer apply (616.1f).
 */
export function replaceGraveyard(s: GameState, o: GameObject): GraveyardOutcome {
  if (!o.isToken && cardRule(s.defs[o.defId], "shuffleIntoLibrary")) return { to: "library", shuffle: true };
  const candidates = graveyardCandidates(s, o);
  if (candidates.length === 0) return { to: "graveyard" };
  const chooser = o.zone === "battlefield" ? o.controller : o.owner;
  const helpsOpponent = (c: GraveyardCandidate) =>
    c.controller && c.controller !== chooser && (!!c.gainLife || !!c.link) ? 1 : 0;
  const chosen = [...candidates].sort((a, b) => helpsOpponent(a) - helpsOpponent(b) || a.timestamp - b.timestamp)[0];
  if (!chosen) return { to: "graveyard" };
  if (chosen.link === "uid" && chosen.sourceId) {
    const src = s.objects[chosen.sourceId];
    if (src) src.linkedUids = [...(src.linkedUids ?? []), o.uid];
  }
  if (chosen.gainLife && chosen.controller) gainLife(s, chosen.controller, chosen.gainLife);
  // Head of the Hunt: "when you do, create a 2/2 Wolf": a reflexive ability (603.12), which can be responded
  // to.
  if (chosen.createToken && chosen.controller && chosen.sourceId)
    pushInline(s, chosen.controller, chosen.sourceId, s.objects[chosen.sourceId]?.defId ?? "", {
      targets: [],
      effects: [{ op: "createTokens", token: chosen.createToken, count: 1 }],
      label: msg("A {name} token", { name: chosen.createToken.name }),
    });
  return { to: "exile", linkTo: chosen.link === "object" ? chosen.sourceId : undefined };
}

/** 614.1c–d: effects that modify how a permanent enters the battlefield. */
export function applyEntersReplacements(s: GameState, o: GameObject, ctx: EntersContext): void {
  if (ctx.kicked) o.kicked = true;
  // How it was cast, known as it enters ("if no mana was spent to cast it", kicker, X).
  if (ctx.cast) o.cast = { ...ctx.cast };
  const own = s.defs[o.defId];
  // 303.4f: an Aura entering without being cast enchants an object chosen by its controller (automatically here: the
  // first possible one; the move operations ask for it during a resolution).
  const attachTo = ctx.attachTo ?? (own?.enchant && !own.enchant.player ? auraHosts(s, o.controller, o.id)[0] : undefined);
  if (attachTo) o.attachedTo = attachTo;
  // 614.1c, 614.12: the "as it enters" effects that were not done before the move (entering outside a resolution:
  // return from a linked exile, copy token, ninjutsu): the choices only, with the suggested answer. A face-down
  // permanent has none (708.2).
  if (!ctx.asEnters && !ctx.copyOf) {
    const res = asEntersChoices(s, {}, { id: o.id, defId: copiedDefId(s, o.id), controller: o.controller }, "", "default");
    if (!("ask" in res)) ctx = withEntersChoices(ctx, res);
  }
  // Xantcha, Sleeper Agent: "enters under the control of an opponent of your choice" (110.2: its base controller).
  if (ctx.enterController && s.players[ctx.enterController]) {
    o.controller = ctx.enterController;
    o.baseController = ctx.enterController;
  }
  // 707.9: "enters as a copy of …" (Waxen Shapethief), before the other replacements (which read the copy: riot,
  // loyalty). The exceptions of the model, then its own (Visage Bandit: "… in addition to its other types"; Superior
  // Spider-Man: name and P/T), are copiable (707.9b): a copy of this permanent takes them over. Cursed Mirror: until end
  // of turn.
  if (ctx.copyOf) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: ctx.copyDuration ?? "permanent",
      copyOf: ctx.copyOf,
      ...ctx.copyMods,
      copiable: true,
    });
    s.version += 1; // layer cache
    // Superior Spider-Man: "when you do, exile that card": a reflexive ability (603.12).
    const card = ctx.exileCopied;
    if (card && s.objects[card]?.zone === "graveyard")
      pushInline(s, o.controller, o.id, o.defId, {
        targets: [],
        effects: [{ op: "moveTo", what: { kind: "target", id: "c" }, spec: { to: "exile" } }],
        bound: { c: [card] },
        label: msg("Exile the copied card"),
      });
  }
  // Deadpool, Trading Card: "as it enters, you may exchange his text box and another creature's" (612, layer 3). Each
  // takes the other's text box as it is now (a text box already exchanged, otherwise its copiable one), for as long as it
  // stays on the battlefield; not copiable (707.2).
  const other = ctx.textSwap;
  if (other && other !== o.id && s.objects[other]?.zone === "battlefield") {
    const mine = textBoxOf(s, o.id) ?? copiedDefId(s, o.id);
    const theirs = textBoxOf(s, other) ?? copiedDefId(s, other);
    const timestamp = nextTimestamp(s);
    s.effects.push({ id: newId(s, "e"), timestamp, affected: [o.id], duration: "permanent", textOf: theirs });
    s.effects.push({ id: newId(s, "e"), timestamp, affected: [other], duration: "permanent", textOf: mine });
    s.version += 1; // layer cache
  }
  // 702.82: the cards exiled as it enters (Mimeoplasm) are linked to the permanent.
  if (ctx.linked?.length) o.linked = [...(o.linked ?? []), ...ctx.linked];
  // Modifications imposed by the effect that puts it onto the battlefield, before the other replacements (which can
  // depend on the added types) and before the entering event.
  if (ctx.tapped) o.tapped = true;
  if (ctx.mods && Object.values(ctx.mods).some((v) => v !== undefined)) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "permanent",
      ...ctx.mods,
      ...(ctx.modsCopiable ? { copiable: true } : {}),
    });
    s.version += 1;
  }
  if (ctx.haste) {
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: [o.id],
      duration: "endOfTurn",
      addKeywords: ["haste"],
    });
    s.version += 1;
  }
  // 702.136: riot, printed or granted (Spider-Punk: "other Spiders you control have riot").
  if (chars(s, o.id).keywords.includes("riot")) {
    if ((ctx.riot ?? defaultRiot(s, o)) === "haste") {
      s.effects.push({
        id: newId(s, "e"),
        timestamp: nextTimestamp(s),
        affected: [o.id],
        duration: "permanent",
        addKeywords: ["haste"],
      });
      s.version += 1;
    } else changeCounters(s, o, P1P1, 1, { by: o.controller });
  }
  if (ctx.attacking && s.combat) s.combat.attackers.push({ id: o.id, defender: ctx.attacking, blockers: [], blocked: false });
  // What follows reads the effective definition: the one the permanent copies (707.9: a Clone of a planeswalker enters
  // with the loyalty of that planeswalker), otherwise its active face (714.3a: a Saga on the back face).
  const eff = s.defs[copiedDefId(s, o.id)];
  // 614.12: "as it enters, choose…" (made by `asEntersChoices`).
  if (ctx.chosen) o.chosen = ctx.chosen;
  // Shock land: tapped, unless the life was paid while playing it (put onto the battlefield by an effect: tapped).
  if (eff?.shockLand && !ctx.shockPaid) o.tapped = true;
  // 714.3a: a Saga enters with a lore counter.
  if (eff?.saga) changeCounters(s, o, "lore", 1, { by: o.controller });
  // 306.5b: a planeswalker enters with its printed loyalty.
  const loyalty = ctx.loyalty ?? eff?.loyalty;
  if (loyalty) changeCounters(s, o, "loyalty", loyalty, { by: o.controller });
  // X of the spell that made it enter, known as it enters (squad: "if it was paid", checked on triggering).
  if (ctx.x) o.x = ctx.x;
  // Counters imposed by the effect ("with a +1/+1 counter", Impending): put as it enters (122.6).
  for (const c of ctx.counters ?? []) changeCounters(s, o, c.kind, c.n, { by: o.controller });
  if (ctx.impending) changeCounters(s, o, "time", ctx.impending, { by: o.controller });
  // Replacements carried by other permanents ("creatures your opponents control enter tapped").
  for (const id of s.battlefield) {
    const src = s.objects[id];
    if (!src || id === o.id) continue;
    // Computed abilities: unlocked door of a Room, back face, copy.
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "replacement" || !ab.affects) continue;
      if (!matchesObjectFilter(s, src.controller, o.id, ab.affects, id)) continue;
      // "As long as an opponent lost life this turn, …" (Vampire Socialite): seen from the source's controller.
      if (ab.condition && !checkCondition(s, ab.condition, src.controller, id)) continue;
      if (ab.entersTapped) o.tapped = true;
      if (ab.entersWithCounters !== undefined) {
        const n = amountAtEntry(s, ab.entersWithCounters, src, ctx, o);
        // Blue, Loyal Raptor: that many counters of each kind present on the source.
        if (ab.counterKind === "*")
          for (const [k, c] of Object.entries(src.counters)) c > 0 && changeCounters(s, o, k, n, { by: o.controller });
        else changeCounters(s, o, ab.counterKind ?? P1P1, n, { by: o.controller });
      }
    }
  }
  for (const ab of eff?.abilities ?? []) {
    if (ab.kind !== "replacement" || ab.affects) continue;
    if (ab.condition && !conditionAtEntry(s, ab.condition, o, ctx)) continue;
    if (ab.entersTapped) o.tapped = true;
    if (ab.entersPrepared) setPrepared(s, o, true);
    if (ab.entersWithCounters !== undefined)
      changeCounters(s, o, ab.counterKind ?? P1P1, amountAtEntry(s, ab.entersWithCounters, o, ctx), { by: o.controller });
  }
  // The Wandering Minstrel: "lands you control enter untapped".
  if (o.tapped && eff?.types.includes("Land") && playerStatic(s, o.controller, "landsEnterUntapped")) o.tapped = false;
  // "Enters tapped": statics depend on it ("other tapped creatures you control have hexproof").
  s.version += 1;
}

/** 610.3: the source of an "until" exile leaves the battlefield: the cards return. */
export function releaseLinkedExile(s: GameState, sourceId: ObjectId): void {
  const links = s.linkedExile.filter((l) => l.sourceId === sourceId);
  if (links.length === 0) return;
  s.linkedExile = s.linkedExile.filter((l) => l.sourceId !== sourceId);
  for (const l of links) {
    for (const id of l.cards) {
      const o = s.objects[id];
      if (o?.zone === "exile") moveObject(s, id, l.toHand ? "hand" : "battlefield", { controller: o.owner });
    }
  }
}

/**
 * 615: is this damage prevented by a prevention effect created on objects fixed at resolution (all damage, or only
 * combat damage)? An effect, not an ability: losing its abilities doesn't remove it.
 */
export function preventsDamageTo(s: GameState, target: string, combat: boolean): boolean {
  return s.replacements.some(
    (r) => (r.kind === "preventDamage" || (combat && r.kind === "preventCombatDamage")) && r.objects.includes(target),
  );
}

export function addReplacement(
  s: GameState,
  kind: "exileIfDies" | "preventCombatDamage" | "preventDamage",
  objects: ObjectId[],
  id: string,
): void {
  if (objects.length) s.replacements.push({ id, kind, objects });
}
