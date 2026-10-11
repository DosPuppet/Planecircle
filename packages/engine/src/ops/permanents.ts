/** Engine effects: permanent modifications, control, copies and tokens. Each key is an `op` of `Effect` (see `runEffect`, effects.ts). */

import {
  createPlusTokens,
  createTokenCopy,
  createTokens,
  phaseOut,
  tokenCopyCount,
  tokenCopyReplacement,
  tokenCount,
} from "../actions";
import { cardRef } from "../choices";
import { addControlEffect } from "../control";
import type { EffectContext, OpHandlers, OpResult } from "../effects";
import {
  addEffect,
  addPump,
  attach,
  attackingDefender,
  cardRefOf,
  evalAmount,
  exiledUid,
  nextTurnOf,
  resolveRef,
  store,
} from "../effects";
import { blockRulePlaceholder, copiableExceptions, copiedDefId, mergeMods, resolveBlockRules } from "../layers";
import { manaValue } from "../mana";
import { CREATURE_TYPES, gameNames, isCreatureType, nameList, printedName, tokenCreatureTypes } from "../names";
import { asEntersChoices, chosenValue, ENTERS_PREFIX, type EntersChoices, withEntersChoices } from "../replacement";
import {
  bump,
  chars,
  createObject,
  endDetachedEffects,
  hasKeyword,
  isPlayer,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  random,
  rulesEvent,
  snapshot,
} from "../state";
import { matchesCard, matchesObjectFilter } from "../targets";
import { msg } from "../text";
import { createDelayed, onceKey } from "../triggers";
import { attackableDefenders } from "../turn";
import { logTurnEvent } from "../turnlog";
import type {
  AbilityDef,
  ChoiceRequest,
  Color,
  Effect,
  GameObject,
  GameState,
  LkiSnapshot,
  NameKind,
  ObjectId,
  PlayerId,
  Resolution,
  TokenSpec,
} from "../types";
import { BASIC_LAND_TYPES } from "../types";

/**
 * Public names to feature for "choose a (land) card name": opposing permanents, then yours, then graveyards
 * (opponents' first), exile (face up) and command zone; never a hidden card (hand, library, face down).
 * `graveyardsFirst`: opposing graveyards first (Ancient Vendetta). Lands: nonbasic ones first.
 */
export function featuredNames(
  s: GameState,
  controller: PlayerId,
  of: "card" | "land",
  opts: { graveyardsFirst?: boolean } = {},
  valid = gameNames(s, of),
): string[] {
  const opps = opponentsOf(s, controller);
  const out = new Set<string>();
  const add = (names: { name: string; basic: boolean }[]) => {
    for (const n of [...names.filter((x) => !x.basic), ...names.filter((x) => x.basic)]) if (valid.has(n.name)) out.add(n.name);
  };
  const isLand = (types: string[]) => of === "card" || types.includes("Land");
  const permanents = (mine: boolean) =>
    s.battlefield
      .filter((id) => !s.objects[id]?.faceDown && (s.objects[id]?.controller === controller) === mine)
      .map((id) => chars(s, id))
      .filter((c) => isLand(c.types))
      .flatMap((c) => nameList(c.name).map((name) => ({ name, basic: of === "land" && c.supertypes.includes("Basic") })));
  const cards = (ids: readonly string[]) =>
    ids
      .map((id) => s.objects[id])
      .filter((o) => o && !o.faceDown && (!o.exiledFaceDown || o.exiledFaceDown.includes(controller)))
      .map((o) => s.defs[o?.defId ?? ""])
      .filter((d) => d && isLand(d.types))
      .flatMap((d) =>
        nameList(d && printedName(d)).map((name) => ({ name, basic: of === "land" && !!d?.supertypes.includes("Basic") })),
      );
  const graveyards = (ps: PlayerId[]) => cards(ps.flatMap((p) => s.players[p]?.graveyard ?? []));
  if (opts.graveyardsFirst) add(graveyards(opps));
  add(permanents(false));
  add(permanents(true));
  add(graveyards([...opps, controller]));
  add(cards(s.exile));
  add(cards(s.playerOrder.flatMap((p) => s.players[p]?.command ?? [])));
  return [...out].slice(0, 40);
}

/** Creature types of a player's cards (battlefield, hand, library), from most to least common. */
function ownCreatureTypes(s: GameState, controller: PlayerId): string[] {
  const tally = new Map<string, number>();
  const pl = s.players[controller];
  for (const id of [
    ...s.battlefield.filter((x) => s.objects[x]?.controller === controller),
    ...(pl?.hand ?? []),
    ...(pl?.library ?? []),
  ]) {
    const d = s.defs[s.objects[id]?.defId ?? ""];
    for (const k of d?.types.includes("Creature") ? d.subtypes : []) tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/**
 * "Name" question (`ChoiceRequest` of type `name`): a card name, a land card name, or a creature type (the official
 * list, 205.3m), without listing the cards of the game. Suggestion: a public name (creature types: the most common
 * among your cards), otherwise one of your cards.
 */
export function nameRequest(
  s: GameState,
  controller: PlayerId,
  of: NameKind,
  prompt: string,
  opts: { graveyardsFirst?: boolean } = {},
): ChoiceRequest {
  // Names of the game, or the official list of creature types (not "Food" of an artifact creature), never the
  // catalog: the question does not depend on the host.
  let featured: string[];
  let fallback: string | undefined;
  if (of === "creatureType") {
    const own = ownCreatureTypes(s, controller);
    // Your creature tokens (An Unexpected Party: Dwarves), then the creatures in play.
    const tokens = (s.players[controller]?.library ?? [])
      .concat(s.players[controller]?.hand ?? [], s.battlefield)
      .flatMap((id) => tokenCreatureTypes(s.defs[s.objects[id]?.defId ?? ""]?.abilities));
    const onBattlefield = s.battlefield
      .filter((id) => !s.objects[id]?.faceDown)
      .flatMap((id) => (chars(s, id).types.includes("Creature") ? chars(s, id).subtypes : []));
    featured = [...new Set([...own, ...tokens, ...onBattlefield])].filter(isCreatureType).slice(0, 16);
    fallback = CREATURE_TYPES[0];
  } else {
    const valid = gameNames(s, of);
    featured = featuredNames(s, controller, of, opts, valid);
    // Without a public name: one of your cards (known to you alone; the question is shown only to you).
    fallback = (s.players[controller]?.hand ?? [])
      .concat(s.players[controller]?.library ?? [])
      .flatMap((id) => (s.objects[id] ? nameList(chars(s, id).name) : []))
      .find((n) => valid.has(n));
  }
  const suggested = featured[0] ?? fallback ?? "";
  return { type: "name", intent: "chooseOnEnter", prompt, of, featured, suggested: [suggested] };
}

/** Card type labels (an entering mode that is a card type). */
const CARD_TYPE_LABEL: Record<string, string> = {
  Artifact: msg("Artifact"),
  Battle: msg("Battle"),
  Creature: msg("Creature"),
  Enchantment: msg("Enchantment"),
  Instant: msg("Instant"),
  Kindred: msg("Kindred"),
  Land: msg("Land"),
  Planeswalker: msg("Planeswalker"),
  Sorcery: msg("Sorcery"),
};

/**
 * 614.12: the "as this enters, choose…" question of a permanent (creature type, color, name, number, mode…), with its
 * suggestion: during the resolution of a permanent spell, when playing a land, or when an effect puts it into play.
 * `preset`: the options imposed by the effect.
 */
/**
 * Moonlit Meditation, Mirrormind Crown: "you may instead create that many tokens that are copies of [the host]",
 * asked of the replacement's controller for each creator of tokens, before any creation (every path that creates
 * tokens during a resolution: tokens, gift, amass, endure). Returns the question, or the creators who declined.
 */
export function askCopiesInstead(
  s: GameState,
  r: Resolution,
  key: (suffix: string) => string,
  creators: readonly PlayerId[],
  token: TokenSpec,
  n: number,
): Extract<OpResult, { ask: unknown }> | Set<string> {
  const declined = new Set<string>();
  for (const p of creators) {
    const rep = n > 0 ? tokenCopyReplacement(s, p, token) : undefined;
    if (!rep?.may) continue;
    const answer = r.vars[key(`copies:${p}`)];
    if (!answer) {
      return {
        ask: {
          player: rep.controller,
          key: key(`copies:${p}`),
          request: {
            type: "yesNo",
            intent: "may",
            prompt:
              n > 1
                ? msg("{card}: create copies of {host} instead?", {
                    card: cardRefOf(s, rep.sourceId),
                    host: cardRefOf(s, rep.host),
                  })
                : msg("{card}: create a copy of {host} instead?", {
                    card: cardRefOf(s, rep.sourceId),
                    host: cardRefOf(s, rep.host),
                  }),
            suggested: [1],
          },
        },
      };
    }
    if (answer[0] !== 1) declined.add(p);
  }
  return declined;
}

/** Records the source's choice (`chooseOnEnter`). */
function chooseOnEnterDone(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  kind: Extract<Effect, { op: "chooseOnEnter" }>["kind"],
  value: string,
  secret?: boolean,
): undefined {
  r.vars.$chosen = [kind, value];
  // Triggered ability of a permanent already in play (Petrified Hamlet: "when this land enters, choose…") or a
  // resolving spell (Harmonized Crescendo: "choose a creature type; draw a card for each…").
  const src = s.objects[ctx.sourceId];
  if (src?.zone === "battlefield" || src?.zone === "stack") {
    src.chosen = { ...src.chosen, ...(secret ? { secret: true } : {}), ...chosenValue(kind, value) };
    bump(s);
  }
  return undefined;
}

export function enterChoiceRequest(
  s: GameState,
  controller: PlayerId,
  sourceDefId: string,
  kind: Extract<Effect, { op: "chooseOnEnter" }>["kind"],
  preset?: string[],
): ChoiceRequest {
  const ctx = { controller, sourceDefId };
  // "Choose a player" (Saskia the Unyielding): the players still in the game, or those offered ("choose an opponent",
  // Shinryu); suggestion, the next opponent.
  if (kind === "player") {
    const players = preset ?? s.playerOrder.filter((p) => !s.players[p]?.lost);
    return {
      type: "pick",
      intent: "chooseOnEnter",
      prompt: preset ? msg("Choose an opponent") : msg("Choose a player"),
      options: players,
      min: 1,
      max: 1,
      suggested: opponentsOf(s, controller)
        .filter((p) => players.includes(p))
        .slice(0, 1),
    };
  }
  {
    let options: string[];
    if (preset) options = preset;
    else if (kind === "landType") options = [...BASIC_LAND_TYPES];
    else if (kind === "color") options = ["W", "U", "B", "R", "G"];
    else if (kind === "parity") options = ["odd", "even"];
    // Talion, the Kindly Lord: a number from 1 to 10.
    else if (kind === "number") options = Array.from({ length: 10 }, (_, i) => String(i + 1));
    else if (kind === "mode") options = [];
    // Card name (Skyseer's Chariot), land card name (Petrified Hamlet), creature type: the whole list, without listing
    // the cards of the game (the opposing decklist); public names featured.
    else
      return nameRequest(
        s,
        controller,
        kind === "cardName" ? "card" : kind === "landName" ? "land" : "creatureType",
        kind === "cardName"
          ? msg("Choose a card name")
          : kind === "landName"
            ? msg("Choose a land card name")
            : msg("Choose a creature type"),
      );
    // Suggestion: the most common type or color among the controller's cards.
    const tally = new Map<string, number>();
    const pl = s.players[ctx.controller];
    for (const id of [
      ...s.battlefield.filter((x) => s.objects[x]?.controller === ctx.controller),
      ...(pl?.hand ?? []),
      ...(pl?.library ?? []),
    ]) {
      const d = s.defs[s.objects[id]?.defId ?? ""];
      const keys = kind === "color" ? (d?.colors ?? []) : d?.types.includes("Creature") ? d.subtypes : [];
      for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    // Basic land type: the most common among the player's lands (like `defaultChoice`).
    const landCount = (t: string) =>
      s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller && chars(s, id).subtypes.includes(t)).length;
    const best =
      kind === "landType"
        ? [...options].sort((a, b) => landCount(b) - landCount(a))[0]
        : kind === "number"
          ? suggestedNumber(s, ctx.controller)
          : kind === "cardName" || kind === "landName" || kind === "parity" || kind === "mode"
            ? options[0]
            : ([...tally.entries()].sort((a, b) => b[1] - a[1]).find(([k]) => options.includes(k))?.[0] ?? options[0]);
    const COLOR: Record<string, string> = {
      W: msg("White"),
      U: msg("Blue"),
      B: msg("Black"),
      R: msg("Red"),
      G: msg("Green"),
    };
    // A mode that is a card type (Arachne, Serra's Emissary): its translated name.
    const typeModes = kind === "mode" && options.length > 0 && options.every((o) => CARD_TYPE_LABEL[o]);
    return {
      type: "pick",
      intent: "chooseOnEnter",
      prompt:
        kind === "color"
          ? msg("Choose a color")
          : kind === "cardName"
            ? msg("Choose a card name (those of opposing permanents come first)")
            : kind === "landName"
              ? msg("Choose a land card name (those of your opponents come first)")
              : kind === "parity"
                ? msg("Choose: odd or even mana value")
                : kind === "mode"
                  ? typeModes
                    ? msg("Choose a card type")
                    : msg("Choose: {options}", {
                        options: options.length ? options.reduce((a, b) => msg("{a} or {b}", { a, b })) : "",
                      })
                  : kind === "number"
                    ? msg("Choose a number between 1 and 10")
                    : kind === "landType"
                      ? msg("Choose a basic land type")
                      : msg("Choose a creature type"),
      options,
      labels:
        kind === "color"
          ? COLOR
          : kind === "parity"
            ? { odd: msg("Odd"), even: msg("Even") }
            : kind === "landType"
              ? {
                  Plains: msg("Plains"),
                  Island: msg("Island"),
                  Swamp: msg("Swamp"),
                  Mountain: msg("Mountain"),
                  Forest: msg("Forest"),
                }
              : Object.fromEntries(options.map((o) => [o, (typeModes && CARD_TYPE_LABEL[o]) || o])),
      min: 1,
      max: 1,
      suggested: [best as string],
    };
  }
}

/**
 * 508.4: what a permanent put onto the battlefield attacking attacks (without having been declared: no restriction
 * and no attack tax). Its controller chooses among the designated defenders ("that player", "that player or a
 * planeswalker they control"), otherwise among their opponents and their planeswalkers; a designated defender that can
 * no longer be attacked (player gone, planeswalker gone) is discarded, and without a defender it does not attack
 * (508.4a). No question for a single option; the suggestion is what the source attacks, otherwise what a creature of
 * that player attacks. `optional`: "you may" (myriad): choosing nothing is allowed, and the question is asked even for
 * a single option. `ask`: false: only the suggestion, without a question (to suggest an answer elsewhere).
 * Returns the question, otherwise the chosen defender (`undefined`: it does not attack, or nothing was chosen).
 */
export function chooseAttacked(
  s: GameState,
  r: Resolution,
  ctx: EffectContext,
  k: string,
  player: PlayerId,
  designated: readonly string[] | undefined,
  prompt: string,
  opts: { optional?: boolean; ask?: boolean } = {},
): Extract<OpResult, { ask: unknown }> | { defender: string | undefined } {
  if (!s.combat) return { defender: undefined };
  const all = attackableDefenders(s, player, false);
  const options = designated ? all.filter((d) => designated.includes(d)) : all;
  if (options.length === 0) return { defender: undefined };
  const source = s.combat.attackers.find((a) => a.id === ctx.sourceId)?.defender;
  const suggested = [source, attackingDefender(s, player)].find((d) => d && options.includes(d)) ?? (options[0] as string);
  const answer = r.vars[k];
  if (!answer && opts.ask !== false && (options.length > 1 || opts.optional)) {
    return {
      ask: {
        player,
        key: k,
        request: {
          type: "pick",
          intent: "other",
          prompt,
          options,
          min: opts.optional ? 0 : 1,
          max: 1,
          suggested: [suggested],
        },
      },
    };
  }
  if (!answer) return { defender: suggested };
  const picked = answer.map(String).find((d) => options.includes(d));
  return { defender: picked ?? (opts.optional ? undefined : suggested) };
}

export const HANDLERS: OpHandlers = {
  phaseOut(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) phaseOut(s, id);
    return;
  },
  regenerate(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone === "battlefield") o.regenShields = (o.regenShields ?? 0) + 1;
    }
    return;
  },
  pump(s, _r, e, ctx) {
    const ids = resolveRef(s, ctx, e.what).filter((id) => onBattlefield(s, id));
    if (e.double) {
      // The values are read before applying the bonuses (all doubled at the same time); a negative power doubles too
      // (701.10e: -X/-0).
      const pt = ids.map((id) => [id, chars(s, id).power, chars(s, id).toughness] as const);
      for (const [id, p, t] of pt) addPump(s, [id], p, t, e.keywords);
      return;
    }
    addPump(s, ids, evalAmount(s, ctx, e.power), evalAmount(s, ctx, e.toughness), e.keywords);
    return;
  },
  suspect(s, _r, e, ctx) {
    // 701.60: only a permanent on the battlefield.
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !!o.suspected === e.value) continue;
      // Airtight Alibi: "can't become suspected".
      if (e.value && hasKeyword(s, id, "cantBeSuspected")) continue;
      o.suspected = e.value ? nextTimestamp(s) : undefined;
      bump(s);
    }
    return;
  },
  modify(s, r, e, ctx) {
    // A spell on the stack that gains a keyword (Spinerock Tyrant: "those spells gain wither"): its damage is dealt with
    // the keywords of its source snapshot.
    for (const id of resolveRef(s, ctx, e.what)) {
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && e.mods.addKeywords?.length) {
        const kw = [...new Set([...item.sourceSnapshot.keywords, ...e.mods.addKeywords])];
        item.sourceSnapshot = { ...item.sourceSnapshot, keywords: kw };
      }
    }
    const w = e.while;
    const counter = typeof w === "object" && "counter" in w ? w.counter : undefined;
    const ids = resolveRef(s, ctx, e.what).filter(
      (id) => onBattlefield(s, id) && (!counter || (s.objects[id]?.counters[counter] ?? 0) > 0),
    );
    if (ids.length === 0) return;
    // 611.2b: a "for as long as [the source] remains…" effect does nothing if it is already gone.
    if (w === "source" && !onBattlefield(s, ctx.sourceId)) return;
    // "Becomes the chosen color and gains hexproof from that color" (Mondo Gecko): the color chosen by this effect is
    // frozen in the effect (another activation chooses another one).
    const chosen = r.vars.$chosen?.[0] === "color" ? (String(r.vars.$chosen[1]) as Color) : undefined;
    let mods = e.mods;
    if (chosen && (mods.setColorsChosen || mods.addProtections?.some((p) => p.from.chosen === "color")))
      mods = {
        ...mods,
        setColorsChosen: undefined,
        setColors: mods.setColorsChosen ? [chosen] : mods.setColors,
        addProtections: mods.addProtections?.map((p) =>
          p.from.chosen === "color" ? { ...p, from: { ...p.from, chosen: undefined, colors: [chosen] } } : p,
        ),
      };
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration,
      ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
      ...(e.duration === "endOfYourNextTurn" ? { until: ctx.controller, sinceTurn: s.turn.number } : {}),
      ...(typeof w === "object" && "exiled" in w ? { untilExiledUid: exiledUid(s, ctx, w.exiled) } : {}),
      ...(w === "source" || w === "youControlSource" ? { whileSource: ctx.sourceId } : {}),
      ...(w === "youControlSource" ? { whileControlledBy: ctx.controller } : {}),
      ...(w === "sourceTapped" ? { whileSourceTapped: ctx.sourceId } : {}),
      ...(w === "tapped" ? { whileAffectedTapped: true } : {}),
      ...(counter ? { whileAffectedHasCounter: counter } : {}),
      ...mods,
      // Players and objects frozen on resolution: "goad" (the controller of the effect), "can't attack you" (Promise
      // of Loyalty), "attacks that player" (Silver Surfer), "blocks that Wolf if able" (Tolsimir).
      ...(e.mods.addBlockRules?.some(blockRulePlaceholder)
        ? {
            addBlockRules: resolveBlockRules(e.mods.addBlockRules, ctx.controller, ctx.event, (x) =>
              resolveRef(s, ctx, x).find((p) => isPlayer(s, p)),
            ),
          }
        : {}),
      ...(e.basePT !== undefined ? { setPower: evalAmount(s, ctx, e.basePT), setToughness: evalAmount(s, ctx, e.basePT) } : {}),
    });
    // After the push: evaluating the amounts above (Karn, Silver Golem: the mana value) reads the characteristics, which
    // must not stay cached without this effect.
    bump(s);
    return;
  },
  harness(s, _r, _e, ctx) {
    const o = s.objects[ctx.sourceId];
    if (o?.zone !== "battlefield" || o.harnessed) return;
    o.harnessed = true;
    bump(s);
    return;
  },
  exchangeTextBox(s, r, _e, ctx, key) {
    // Deadpool, Trading Card: "another creature" (any player's), chosen as it enters; "you may": none.
    const options = s.battlefield.filter((id) => id !== ctx.sourceId && chars(s, id).types.includes("Creature"));
    const answer = r.vars[key("swap")];
    if (!answer) {
      if (options.length === 0) return;
      // Suggestion: an opponent's creature with the greatest mana value (it takes the drawbacks, this one its text).
      const mv = (id: ObjectId) => manaValue(s.defs[copiedDefId(s, id)]?.manaCost);
      const theirs = options.filter((id) => chars(s, id).controller !== ctx.controller).sort((a, b) => mv(b) - mv(a));
      return {
        ask: {
          player: ctx.controller,
          key: key("swap"),
          request: {
            type: "pick",
            intent: "pickCards",
            // The entering card is named: the question may come during another resolution (Conjurer's Closet).
            prompt: msg("{card}: exchange its text box with another creature's?", { card: cardRef(ctx.sourceDefId) }),
            options,
            min: 0,
            max: 1,
            suggested: theirs.slice(0, 1),
          },
        },
      };
    }
    const chosen = answer.map(String).filter((id) => options.includes(id));
    r.vars.$textSwap = chosen.slice(0, 1);
    return;
  },
  attach(s, r, e, ctx) {
    // Several Equipment onto the same creature (Beatrix, Loyal General).
    const all = resolveRef(s, ctx, e.to);
    const to = e.random ? all[Math.floor(random(s) * all.length)] : all[0];
    let n = 0;
    if (to) for (const what of resolveRef(s, ctx, e.what)) if (attach(s, what, to)) n++;
    store(r, e.store, n);
    return;
  },
  emblem(s, r, e, ctx) {
    const defId = `emblem:${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    s.defs[defId] ??= {
      id: defId,
      name: e.name,
      typeLine: msg("Emblem"),
      manaCost: null,
      manaCostText: "",
      colors: [],
      supertypes: [],
      types: [],
      subtypes: [],
      keywords: [],
      abilities: e.abilities,
      text: e.text,
      implemented: true,
      isToken: true,
    };
    const emblem = createObject(s, defId, ctx.controller, "command", { isToken: true });
    if (e.duration === "untilYourNextTurn") emblem.expires = { turnOf: ctx.controller };
    if (e.duration === "endOfTurn") emblem.expires = { endOfTurn: s.turn.number };
    if (e.duration === "endOfYourNextTurn") emblem.expires = { endOfTurn: nextTurnOf(s, ctx.controller) };
    // Oko, Shadowmoor Scion: "choose a creature type; you get an emblem with 'creatures of the chosen type…'": the
    // emblem keeps the choice made by the effect.
    const chosen = r.vars.$chosen;
    if (chosen?.[0] === "creatureType") emblem.chosen = { creatureType: String(chosen[1]) };
    else if (chosen?.[0] === "color") emblem.chosen = { color: String(chosen[1]) as Color };
    // The Clone Saga: "choose a card name; whenever a creature with the chosen name… this turn".
    else if (chosen?.[0] === "cardName") emblem.chosen = { cardName: String(chosen[1]) };
    if (e.store) r.vars[`$ids:${e.store}`] = [emblem.id];
    bump(s);
    return;
  },
  createTokens(s, r, e, ctx, key) {
    const n = evalAmount(s, ctx, e.count);
    const created: string[] = [];
    const pt = e.pt !== undefined ? evalAmount(s, ctx, e.pt) : undefined;
    const token = pt === undefined ? e.token : { ...e.token, power: pt, toughness: pt };
    const creators = e.attachTo || !e.for ? [ctx.controller] : resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x));
    // 508.4: "tapped and attacking" tokens attack without having been declared; their controller chooses what each
    // attacks among their opponents and planeswalkers (Najeela: the Warrior's controller): several tokens and several
    // choices, a division; otherwise a single choice.
    const attacking = new Map<string, string | undefined>();
    const attackingEach = new Map<string, string[]>();
    if (e.attacking) {
      // "… tapped and attacking that player": nothing to create without a designated player (`fx.forEachPlayer`).
      const designated = typeof e.attacking === "object" ? resolveRef(s, ctx, e.attacking) : undefined;
      if (designated?.length === 0) return;
      const prompt = n > 1 ? msg("What should the tokens attack?") : msg("What should the token attack?");
      for (const p of creators) {
        const all = s.combat ? attackableDefenders(s, p, false) : [];
        const options = designated ? all.filter((d) => designated.includes(d)) : all;
        const count = tokenCount(s, p, token, n);
        if (options.length > 1 && count > 1) {
          const k = key(`defenders:${p}`);
          const answer = r.vars[k];
          if (!answer) {
            const one = chooseAttacked(s, r, ctx, key("unused"), p, designated, prompt, { ask: false });
            const suggested = "defender" in one ? one.defender : undefined;
            return {
              ask: {
                player: p,
                key: k,
                request: {
                  type: "divide",
                  intent: "other",
                  prompt,
                  among: options,
                  total: count,
                  minEach: 0,
                  suggested: options.map((d) => (d === suggested ? count : 0)),
                },
              },
            };
          }
          attackingEach.set(
            p,
            options.flatMap((d, i) => Array<string>(Math.max(0, Number(answer[i] ?? 0))).fill(d)),
          );
          continue;
        }
        const k = key(p === ctx.controller ? "defender" : `defender:${p}`);
        const c = chooseAttacked(s, r, ctx, k, p, designated, prompt);
        if ("ask" in c) return c;
        attacking.set(p, c.defender);
      }
    }
    const enters = (p: string) => ({ tapped: !!(e.tapped || e.attacking), attacking: attacking.get(p) });
    // Moonlit Meditation, Mirrormind Crown: "you may instead create copies" — asked before any creation.
    const declined = askCopiesInstead(s, r, key, creators, token, n);
    if (!(declined instanceof Set)) return declined;
    if (e.attachTo) {
      for (const host of resolveRef(s, ctx, e.attachTo).filter((x) => onBattlefield(s, x))) {
        const made = createTokens(s, ctx.controller, token, n, true, enters(ctx.controller), declined.has(ctx.controller));
        for (const id of made) attach(s, id, host);
        created.push(...made);
      }
      if (e.store) r.vars[`$ids:${e.store}`] = created;
      return;
    }
    for (const p of creators)
      created.push(...createTokens(s, p, token, n, true, enters(p), declined.has(p), [], attackingEach.get(p)));
    if (e.store) r.vars[`$ids:${e.store}`] = created;
    return;
  },
  chooseCardName(s, r, _e, ctx, key) {
    if (r.vars.$name) return;
    const answer = r.vars[key("name")];
    if (!answer) {
      // No hidden information: public names featured (opposing graveyards first), any name of the catalog.
      const request = nameRequest(s, ctx.controller, "card", msg("Choose a card name"), { graveyardsFirst: true });
      return { ask: { player: ctx.controller, key: key("name"), request } };
    }
    r.vars.$name = [String(answer[0])];
    return;
  },
  copyToken(s, r, e, ctx, key) {
    const made: string[] = [];
    // Myriad, Shredder: one copy per designated player (an opponent other than the defending player), which attacks that
    // player or one of their designated planeswalkers; each defender is chosen before any copy (508.4).
    let attackEach: (string | undefined)[] | undefined;
    if (e.attackEach) {
      attackEach = [];
      const designated = resolveRef(s, ctx, e.attackEach);
      for (const p of designated.filter((x) => isPlayer(s, x) && x !== ctx.controller)) {
        const among = designated.filter((x) => x === p || (!isPlayer(s, x) && s.objects[x]?.controller === p));
        const prompt = e.optional
          ? msg("You may create a copy that attacks one of them (no choice: no copy)")
          : msg("What should the copy attack?");
        const c = chooseAttacked(s, r, ctx, key(`defender:${p}`), ctx.controller, among, prompt, { optional: e.optional });
        if ("ask" in c) return c;
        if (e.optional && !c.defender) continue;
        attackEach.push(c.defender);
      }
    }
    // Fractured Identity: "each player other than its controller creates a token that's a copy".
    const creators = e.for ? resolveRef(s, ctx, e.for).filter((x) => isPlayer(s, x)) : [ctx.controller];
    // "Tapped and attacking": a single choice for all the copies of one controller, made by that player.
    const attacking = new Map<string, string | undefined>();
    if (e.attacking && typeof e.attacking === "object" && !attackEach) {
      // Echoing Assault: "attacking that player" (if it can still be attacked, 508.4a).
      const defender = resolveRef(s, ctx, e.attacking).find((x) => isPlayer(s, x) && !s.players[x]?.lost);
      for (const p of creators) attacking.set(p, defender && defender !== p ? defender : undefined);
    } else if (e.attacking && !attackEach) {
      for (const p of creators) {
        const k = key(p === ctx.controller ? "defender" : `defender:${p}`);
        const c = chooseAttacked(s, r, ctx, k, p, undefined, msg("What should the copy attack?"));
        if ("ask" in c) return c;
        attacking.set(p, c.defender);
      }
    }
    // Saw in Half: P/T evaluated now (half the destroyed creature's, rounded up).
    const pt =
      e.pt === undefined || typeof e.pt === "number"
        ? e.pt === undefined
          ? undefined
          : { power: e.pt, toughness: e.pt }
        : { power: evalAmount(s, ctx, e.pt.power), toughness: evalAmount(s, ctx, e.pt.toughness) };
    // Doubling Season also applies to token copies.
    const base = attackEach ? attackEach.length : e.count === undefined ? 1 : evalAmount(s, ctx, e.count);
    // The copies to make: for each creator and each model, its definition and its number.
    const plan: {
      who: string;
      id: string;
      model: GameObject | undefined;
      defId: string;
      n: number;
      /** The copy as created (types added), for the replacements of token creation. */
      view?: LkiSnapshot;
    }[] = [];
    for (const who of creators)
      for (const id of resolveRef(s, ctx, e.of)) {
        const model = s.objects[id] ?? undefined;
        // The copy of a copy copies what the model copies (707.3), and the active face of a transformed card.
        const defId = model?.zone === "battlefield" ? copiedDefId(s, id) : (model?.defId ?? s.lki[id]?.defId);
        if (!defId) continue;
        const view = model?.zone === "battlefield" ? snapshot(s, id) : s.lki[id];
        const types = [...new Set([...(view?.types ?? s.defs[defId]?.types ?? []), ...(e.addTypes ?? [])])];
        const copy = view ? { ...view, types, isToken: true } : undefined;
        plan.push({ who, id, model, defId, n: copy ? tokenCopyCount(s, who, copy, base) : base, view: copy });
      }
    // 614.12: the "as it enters" choices of each copy (a creature type, a color, riot…), asked of its controller before
    // any copy is created (PLAN-L L5).
    const entry = new Map<string, EntersChoices>();
    for (const { who, id, defId, n } of plan)
      for (let i = 0; i < n; i++) {
        const res = asEntersChoices(s, r.vars, { id: "", defId, controller: who }, key(`enter-${who}-${id}-${i}:`), "ask");
        if ("ask" in res) return res;
        entry.set(`${who}|${id}|${i}`, res);
      }
    for (const { who, id, model, defId, n } of plan) {
      for (let i = 0; i < n; i++) {
        // Tapped, types, abilities and P/T in place before the entering event (no "becomes tapped").
        // 707.9b: the exceptions of the model, then those of this effect ("except it's a 1/1"), are copiable.
        const choices = entry.get(`${who}|${id}|${i}`) ?? { asEnters: true };
        const token = createTokenCopy(
          s,
          who,
          defId,
          withEntersChoices(
            {
              tapped: !!e.tapped,
              mods: mergeMods(model?.zone === "battlefield" ? copiableExceptions(s, id) : undefined, {
                addTypes: e.addTypes?.length ? e.addTypes : undefined,
                addKeywords: e.addKeywords?.length ? e.addKeywords : undefined,
                addSubtypes: e.addSubtypes?.length ? e.addSubtypes : undefined,
                addSupertypes: e.legendary ? ["Legendary"] : undefined,
                removeSupertypes: e.nonlegendary ? ["Legendary"] : undefined,
                addAbilities: e.addAbilities?.length ? e.addAbilities : undefined,
                addColors: e.addColors?.length ? e.addColors : undefined,
                // Ardyn, the Usurper: "except it's a black Demon".
                setColors: e.setColors,
                setSubtypes: e.setSubtypes,
                ...(pt ? { setPower: pt.power, setToughness: pt.toughness } : {}),
              }),
              modsCopiable: true,
            },
            choices,
          ),
        );
        made.push(token);
        // Firion: cheaper equip abilities (added; the cheapest will be used).
        if (e.equipDiscount) {
          const equips = (s.defs[defId]?.abilities ?? []).flatMap((ab) =>
            ab.kind === "activated" && ab.equip && ab.cost.mana
              ? [
                  {
                    ...ab,
                    cost: {
                      ...ab.cost,
                      mana: { ...ab.cost.mana, generic: Math.max(0, ab.cost.mana.generic - (e.equipDiscount ?? 0)) },
                    },
                    label: msg("{label} (reduced)", { label: ab.label ?? "" }),
                  },
                ]
              : [],
          );
          if (equips.length) addEffect(s, [token], { addAbilities: equips }, "permanent");
        }
        if ((e.attacking || attackEach) && s.combat) {
          // Calamity: "tapped and attacking"; myriad: the defender chosen for the player of its copy (the extra copies from a
          // doubler are spread among them and keep that choice).
          const tok = s.objects[token];
          if (tok) tok.tapped = true;
          const defender = attackEach ? attackEach[Math.floor((i * attackEach.length) / n)] : attacking.get(who);
          if (defender) s.combat.attackers.push({ id: token, defender, blockers: [], blocked: false });
          bump(s);
        }
        if (e.atEnd) {
          // Sacrificed or exiled at the beginning of the next end step, at end of combat or at the next upkeep.
          const { fate, at } = typeof e.atEnd === "string" ? { fate: e.atEnd, at: undefined } : e.atEnd;
          const it = { kind: "target", id: "copy" } as const;
          // Firion (next upkeep): the delayed ability has the token itself as its source, without a label.
          const upkeep = at === "nextUpkeep";
          createDelayed(
            s,
            ctx.controller,
            upkeep ? token : ctx.sourceId,
            upkeep ? (s.objects[token]?.defId ?? defId) : ctx.sourceDefId,
            {
              targets: [],
              effects: [fate === "exile" ? { op: "exile", what: it } : { op: "sacrificeIt", what: it }],
              bound: { copy: [token] },
              ...(upkeep ? {} : { label: fate === "exile" ? msg("exile the copy") : msg("sacrifice the copy") }),
            },
            at,
          );
        }
      }
    }
    // Quina ("those tokens plus a Frog"), Worldwalker Helm: once per player who created copies.
    for (const who of creators) {
      const views = plan.flatMap((x) => (x.who === who && x.n > 0 && x.view ? [x.view] : []));
      if (views.length) made.push(...createPlusTokens(s, who, views));
    }
    if (e.store) r.vars[`$ids:${e.store}`] = made;
    return;
  },
  chooseCopy(s, r, e, ctx, key) {
    if (r.vars.$copyOf) return;
    // Superior Spider-Man, Echoing Deeps: a card in a graveyard (not itself, if it is coming back from there); otherwise
    // a permanent (its controller's, or anyone's).
    const options = e.fromGraveyards
      ? s.playerOrder.flatMap((p) =>
          (s.players[p]?.graveyard ?? []).filter(
            (id) => id !== ctx.sourceId && matchesCard(s, ctx.controller, id, e.filter, ctx.sourceId),
          ),
        )
      : s.battlefield.filter(
          (id) =>
            (e.anyController || s.objects[id]?.controller === ctx.controller) &&
            id !== ctx.sourceId &&
            matchesObjectFilter(s, ctx.controller, id, e.filter, ctx.sourceId),
        );
    const answer = options.length ? r.vars[key("copy")] : [];
    if (!answer) {
      const name = cardRef(s.objects[ctx.sourceId]?.defId ?? ctx.sourceDefId);
      const untilEnd = e.duration === "endOfTurn";
      return {
        ask: {
          player: ctx.controller,
          key: key("copy"),
          request: {
            type: "pick",
            intent: "pickCards",
            prompt: e.optional
              ? e.fromGraveyards
                ? untilEnd
                  ? msg("{card}: you may have it enter as a copy of a card in a graveyard until end of turn", { card: name })
                  : msg("{card}: you may have it enter as a copy of a card in a graveyard", { card: name })
                : untilEnd
                  ? msg("{card}: you may have it enter as a copy of a permanent until end of turn", { card: name })
                  : msg("{card}: you may have it enter as a copy of a permanent", { card: name })
              : untilEnd
                ? msg("{card}: choose what it copies as it enters until end of turn", { card: name })
                : msg("{card}: choose what it copies as it enters", { card: name }),
            options,
            min: e.optional ? 0 : 1,
            max: 1,
            suggested: options.slice(0, 1),
          },
        },
      };
    }
    const picked = answer.map(String).find((id) => options.includes(id)) ?? (e.optional ? undefined : options[0]);
    // The model (on the battlefield) follows the definition: its copy exceptions are carried over (707.9b).
    r.vars.$copyOf = picked ? (e.fromGraveyards ? [s.objects[picked]?.defId ?? ""] : [copiedDefId(s, picked), picked]) : [];
    // "When you do, exile that card" (Superior Spider-Man).
    if (picked && e.exile) r.vars.$copyCard = [picked];
    return;
  },
  chooseOnEnter(s, r, e, ctx, key) {
    if (r.vars.$chosen) return;
    const answer = r.vars[key("chosen")];
    const kind = e.kind;
    if (!answer) {
      let preset: string[] | undefined;
      if (e.options) preset = [...e.options];
      else if (e.optionsFrom && kind === "player") {
        // "Choose an opponent" (Shinryu): among the designated players still in the game; no question for a single one.
        preset = resolveRef(s, ctx, e.optionsFrom).filter((p) => isPlayer(s, p) && !s.players[p]?.lost);
        if (preset.length === 0) return;
      } else if (e.optionsFrom) {
        // Koh, the Face Stealer: the name of one of the designated cards (if there are none, nothing is chosen).
        const names = resolveRef(s, ctx, e.optionsFrom).flatMap((id) => (s.objects[id] ? nameList(chars(s, id).name) : []));
        preset = [...new Set(names)];
        if (preset.length === 0) return;
      }
      // Sphinx Ambassador: "that player chooses a card name" (the choice still belongs to the source).
      const chooser = (e.who && resolveRef(s, ctx, e.who).find((p) => isPlayer(s, p) && !s.players[p]?.lost)) || ctx.controller;
      if (kind === "player" && preset?.length === 1) return chooseOnEnterDone(s, r, ctx, kind, preset[0] as string, e.secret);
      return {
        ask: {
          player: chooser,
          key: key("chosen"),
          request: enterChoiceRequest(s, chooser, ctx.sourceDefId, kind, preset),
        },
      };
    }
    return chooseOnEnterDone(s, r, ctx, kind, String(answer[0]), e.secret);
  },
  exchangeControl(s, _r, e, ctx) {
    const a = resolveRef(s, ctx, e.a)[0];
    const b = resolveRef(s, ctx, e.b)[0];
    const oa = a ? s.objects[a] : undefined;
    const ob = b ? s.objects[b] : undefined;
    // 701.10: the exchange happens only if both permanents are still there.
    if (oa?.zone !== "battlefield" || ob?.zone !== "battlefield" || oa.controller === ob.controller) return;
    const [ca, cb] = [oa.controller, ob.controller];
    addControlEffect(s, [oa.id], cb, "permanent");
    addControlEffect(s, [ob.id], ca, "permanent");
    return;
  },
  setBasePTAll(s, _r, e, ctx) {
    const n = evalAmount(s, ctx, e.amount);
    const ids = s.battlefield.filter((x) => matchesObjectFilter(s, ctx.controller, x, e.filter, ctx.sourceId));
    addEffect(s, ids, e.powerOnly ? { setPower: n } : { setPower: n, setToughness: n }, "endOfTurn");
    return;
  },
  gainControl(s, _r, e, ctx) {
    const toOwner = e.to === "owner";
    const to0 = e.to === "owner" ? undefined : e.to ? resolveRef(s, ctx, e.to).find((x) => isPlayer(s, x)) : ctx.controller;
    if (!to0 && !toOwner) return;
    // 611.2b: "for as long as you control [the source]" / "[it] remains on the battlefield" does nothing if it is
    // already gone.
    if ((e.duration === "whileYouControlSource" || e.duration === "whileSource") && !onBattlefield(s, ctx.sourceId)) return;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      const to = toOwner ? (o?.owner ?? "") : (to0 ?? "");
      if (!to) continue;
      // Commandeer: "gain control of target spell" (a permanent it becomes enters under your control).
      const item = s.stack.find((x) => x.id === id && x.kind === "spell");
      if (item && o && item.controller !== to) {
        item.controller = to;
        o.controller = to;
        bump(s);
        continue;
      }
      if (o?.zone !== "battlefield" || o.controller === to) continue;
      // Theft "until end of turn" (Involuntary Employment): the effect ends at cleanup (layer 2); Evil's Thrall: at the
      // cleanup of your next turn.
      if (e.duration === "endOfYourNextTurn")
        addControlEffect(s, [id], to, "endOfYourNextTurn", { until: ctx.controller, sinceTurn: s.turn.number });
      else if (e.duration === "whileAttached") {
        // "For as long as that Aura is attached to it": nothing if it no longer is (611.2b).
        const attachment = e.attachment ? resolveRef(s, ctx, e.attachment)[0] : undefined;
        if (!attachment || s.objects[attachment]?.attachedTo !== id) continue;
        addControlEffect(s, [id], to, "permanent", { whileAttached: attachment });
        bump(s);
      } else if (e.duration === "whileYouControlSource" || e.duration === "whileSource") {
        addControlEffect(s, [id], to, "permanent", {
          whileSource: ctx.sourceId,
          ...(e.duration === "whileYouControlSource" ? { whileControlledBy: ctx.controller } : {}),
        });
        bump(s);
      } else addControlEffect(s, [id], to, e.duration === "permanent" ? "permanent" : "endOfTurn");
    }
    return;
  },
  unattach(s, _r, e, ctx) {
    const hosts = e.ifAttachedTo ? resolveRef(s, ctx, e.ifAttachedTo) : undefined;
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield" || !o.attachedTo) continue;
      if (hosts && !hosts.includes(o.attachedTo)) continue;
      o.attachedTo = undefined;
      bump(s);
      endDetachedEffects(s);
    }
    return;
  },
  link(s, _r, e, ctx) {
    const o = s.objects[(e.to ? resolveRef(s, ctx, e.to)[0] : ctx.sourceId) ?? ""];
    if (o) o.linked = [...(o.linked ?? []), ...resolveRef(s, ctx, e.what)];
    // Territory Forge: the source's abilities depend on the linked cards.
    bump(s);
    return;
  },
  becomeCopy(s, _r, e, ctx) {
    const model = resolveRef(s, ctx, e.of).find((id) => !!s.objects[id]);
    // "For as long as [the attachment] remains attached to it": nothing for an object it no longer is (611.2b).
    const attachment = e.duration === "whileAttached" && e.attachment ? resolveRef(s, ctx, e.attachment)[0] : undefined;
    const ids = resolveRef(s, ctx, e.what).filter(
      (id) =>
        onBattlefield(s, id) &&
        (e.duration !== "whileAttached" ||
          (!!attachment && onBattlefield(s, attachment) && s.objects[attachment]?.attachedTo === id)),
    );
    if (!model || ids.length === 0) return;
    const onField = onBattlefield(s, model);
    const defId = onField ? copiedDefId(s, model) : (s.objects[model]?.defId as string);
    if (e.ifManaValue !== undefined && manaValue(s.defs[defId]?.manaCost) !== evalAmount(s, ctx, e.ifManaValue)) return;
    const own = s.defs[ctx.sourceDefId]?.abilities ?? [];
    const kept = (e.keepAbilities ?? []).map((i) => own[i]).filter((a): a is AbilityDef => !!a);
    bump(s);
    s.effects.push({
      id: newId(s, "e"),
      timestamp: nextTimestamp(s),
      affected: ids,
      duration: e.duration === "whileAttached" ? "permanent" : e.duration,
      ...(e.duration === "untilYourNextTurn" ? { until: ctx.controller } : {}),
      ...(attachment ? { whileAttached: attachment } : {}),
      copyOf: defId,
      ...(onField ? copiableExceptions(s, model) : {}),
      ...(e.addKeywords?.length || kept.length || e.except
        ? mergeMods(onField ? copiableExceptions(s, model) : undefined, {
            ...(e.except ?? {}),
            addKeywords: [...(e.except?.addKeywords ?? []), ...(e.addKeywords ?? [])].length
              ? [...(e.except?.addKeywords ?? []), ...(e.addKeywords ?? [])]
              : undefined,
            addAbilities: kept.length ? kept : undefined,
          })
        : {}),
      copiable: true,
    });
    return;
  },
  saddle(s, _r, e, ctx) {
    for (const id of e.what ? resolveRef(s, ctx, e.what) : [ctx.sourceId]) {
      const o = s.objects[id];
      if (o?.zone !== "battlefield") continue;
      logTurnEvent(s, { e: "saddled", player: o.controller, id: o.id });
      bump(s);
      rulesEvent(s, { e: "saddled", objectId: o.id });
    }
    return;
  },
  asEnters(s, r, _e, ctx) {
    // 614.1c, 614.12: the "as this enters" effects of the resolving permanent spell, noted in the resolution; the end of
    // the resolution reads them again (`finishResolution`).
    const res = asEntersChoices(
      s,
      r.vars,
      { id: ctx.sourceId, defId: ctx.sourceDefId, controller: ctx.controller, x: ctx.x, kicked: ctx.kicked },
      ENTERS_PREFIX,
      "ask",
    );
    return "ask" in res ? res : undefined;
  },
  doneOncePerTurn(s, r) {
    const key = onceKey(r.item.sourceDefId, r.item.sourceId, r.item.abilityIndex);
    if (!s.turn.onceFired.includes(key)) s.turn.onceFired.push(key);
    return;
  },
};

/**
 * Talion, the Kindly Lord: the most frequent mana value among the opposing cards seen (battlefield, graveyards,
 * exile), lands excepted; 2 without information.
 */
function suggestedNumber(s: GameState, controller: string): string {
  const tally = new Map<number, number>();
  for (const o of Object.values(s.objects)) {
    if (o.owner === controller || !["battlefield", "graveyard", "exile"].includes(o.zone)) continue;
    // A face-down card (exiled face down, face-down permanent) is hidden information.
    if (o.faceDown || o.exiledFaceDown) continue;
    const d = s.defs[o.defId];
    if (!d || d.types.includes("Land") || d.isToken) continue;
    const mv = manaValue(d.manaCost);
    if (mv >= 1 && mv <= 10) tally.set(mv, (tally.get(mv) ?? 0) + 1);
  }
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return String(best?.[0] ?? 2);
}
