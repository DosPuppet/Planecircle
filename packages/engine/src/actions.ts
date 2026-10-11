/**
 * Elementary game actions, shared by effects, combat and state-based actions.
 */

import { millCards } from "./effects";
import { bumpFor } from "./layers";
import { capReached, MAX_BATTLEFIELD, MAX_TOKENS_PER_EVENT } from "./limits";
import { type AmountMod, chooseReplacementOrder } from "./modifiers";
import { applyEntersReplacements, type EntersContext, preventsDamageTo } from "./replacement";
import {
  bump,
  changeCounters,
  chars,
  commanderOf,
  createObject,
  emit,
  hasKeyword,
  hasType,
  isCreature,
  isPlayer,
  moveObject,
  nextTimestamp,
  obj,
  opponentsOf,
  rulesEvent,
  snapshot,
  tapObject,
} from "./state";
import {
  type ActiveReplacement,
  consumeReplacement,
  damageUnpreventable,
  eventReplacements,
  playerProtectedFrom,
  playerSide,
  playerStatic,
  playerStatics,
  preventions,
  quantityMods,
  recipientMatches,
  replacementAdd,
  replacementAtLeast,
  tokenShielded,
} from "./statics";
import { matchesObjectFilter, matchesView, protectedFrom, sourceView, withChosen } from "./targets";
import { msg } from "./text";
import { pushInline, queueLifelink, rulesTrigger } from "./triggers";
import { countTurnEvents, logTurnEvent, zoneEntry } from "./turnlog";
import type {
  CardDef,
  CardType,
  Color,
  GameEvent,
  GameObject,
  GameState,
  Keyword,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TokenSpec,
  Zone,
} from "./types";

export interface DamageSource {
  /** Source object, if identifiable (for "deals damage" triggers). */
  id?: ObjectId;
  /** Resolving spell that deals the damage (Imodane: "a spell that targets only a single creature"). */
  stackId?: string;
  defId: string;
  controller: PlayerId;
  keywords: Keyword[];
}

/**
 * "The first card a player draws in each of their draw steps" (Orcish Bowmasters, Notion Thief): during their own draw
 * step, no card drawn yet in it (504.1: usually the step's draw, but not if it was replaced or skipped).
 */
function firstOfDrawStep(s: GameState, p: PlayerId): boolean {
  return (
    s.turn.step === "draw" &&
    s.turn.active === p &&
    !s.turnLog.some((x) => x.e === "draw" && x.player === p && "drawStep" in x && x.drawStep)
  );
}

/** `thief`: the draw of Notion Thief itself, which it does not replace in turn. */
export function drawCard(s: GameState, p: PlayerId, thief = false): void {
  const player = s.players[p];
  if (!player) return;
  const first = firstOfDrawStep(s, p);
  // Notion Thief: "if an opponent would draw a card except the first one they draw in each of their draw steps,
  // instead that player skips that draw and you draw a card" (the thief's draw is not replaced in turn).
  if (!first && !thief) {
    const thief = opponentsOf(s, p).find((q) => !s.players[q]?.lost && playerStatic(s, q, "stealsOpponentDraws"));
    if (thief) {
      drawCard(s, thief, true);
      return;
    }
  }
  const top = player.library[0];
  if (!top) {
    // Laboratory Maniac: "you win the game instead" (replacement, applied by the state-based actions).
    if (player.drewFromEmptyLibrary !== "win") player.drewFromEmptyLibrary = playerStatic(s, p, "winOnEmptyDraw") ? "win" : true;
    emit({ type: "draw", player: p });
    return;
  }
  const id = moveObject(s, top, "hand");
  emit({ type: "draw", player: p, objectId: id ?? undefined, defId: s.objects[id ?? ""]?.defId });
  // Turn log (Duelist of the Mind: power equal to the cards drawn this turn).
  const inDrawStep = s.turn.step === "draw" && s.turn.active === p;
  logTurnEvent(s, { e: "draw", player: p, ...(inDrawStep ? { drawStep: true } : {}) });
  const nth = countTurnEvents(s, { event: "draw" }, p, p);
  // The first card drawn in the player's draw step (whatever drew it; PLAN-L L4).
  rulesEvent(s, { e: "draw", player: p, nth, objectId: id ?? undefined, ...(first ? { turnDraw: true } : {}) });
}

/**
 * Draws N cards: a single draw event for the replacements (616.1), in the order most favorable to the player (the
 * most cards, unless they don't have that many in their library): Vnwxt, Verbose Host ("draw two cards instead", for
 * each card), Quantum Riddler ("that many plus one" with one or fewer cards in hand).
 */
export function drawCards(s: GameState, p: PlayerId, n: number): void {
  const player = s.players[p];
  if (!player || n <= 0) return;
  // Draw replacements (R1, family I); Mornsong Aria: "players can't draw cards".
  const q = quantityMods(s, "draw", (a) => recipientMatches(s, a, p));
  if (q.prevented) return;
  const mods = q.mods;
  const most = chooseReplacementOrder(n, mods, "max");
  const total = most <= player.library.length ? most : chooseReplacementOrder(n, mods, "min");
  // One draw from an empty library is enough (704.5b): no need to go further.
  const draws = Math.min(total, player.library.length + 1);
  for (let i = 0; i < draws; i++) drawCard(s, p);
}

export function gainLife(s: GameState, p: PlayerId, amount: number): void {
  const player = s.players[p];
  if (!player || amount <= 0) return;
  // 119.7, 101.2: "can't gain life" (Screaming Nemesis, Giant Cindermaw; Grievous Wound: the enchanted player)
  // overrides any replacement of the gain, which therefore does not apply.
  if (playerStatic(s, p, "cantGainLife")) return;
  // Replacements (616.1), in the order most favorable to the player gaining the life:
  // Angel of Vitality ("that much plus 1"), The Wind Crystal ("twice that much"); Giant Cindermaw, Mornsong Aria:
  // "players can't gain life".
  const q = quantityMods(s, "lifeGain", (a) => recipientMatches(s, a, p));
  if (q.prevented) return;
  amount = chooseReplacementOrder(amount, q.mods, "max");
  player.life += amount;
  bumpFor(s, "life"); // characteristics may depend on life totals (Elenda)
  emit({ type: "life", player: p, delta: amount, life: player.life });
  logTurnEvent(s, { e: "lifeGain", player: p, amount });
  rulesEvent(s, { e: "lifeGain", player: p, amount, first: countTurnEvents(s, { event: "lifeGain" }, p, p) === 1 });
}

/** Forage (701.61): can the player exile three cards from their graveyard or sacrifice a Food? */
/** `exclude`: a graveyard card that will no longer be there (the spell cast from the graveyard). */
export function canForage(s: GameState, p: PlayerId, exclude?: ObjectId): boolean {
  const gy = (s.players[p]?.graveyard ?? []).filter((id) => id !== exclude);
  return gy.length >= 3 || foodToSacrifice(s, p) !== undefined;
}

/** The Foods the player can sacrifice, the default choice first: a token preferably, then what is not a creature. */
function foodsToSacrifice(s: GameState, p: PlayerId): ObjectId[] {
  const foods = s.battlefield.filter((id) => s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Food"));
  // Ygra makes creatures Foods.
  return foods.sort((a, b) => rank(a) - rank(b));
  function rank(id: ObjectId): number {
    return (s.objects[id]?.isToken ? 0 : 2) + (isCreature(s, id) ? 4 : 0);
  }
}

function foodToSacrifice(s: GameState, p: PlayerId): ObjectId | undefined {
  return foodsToSacrifice(s, p)[0];
}

/**
 * Forage (701.61) as a choice (PLAN-M M6): the graveyard cards (three of them) and the Foods (one of them); the default
 * choice is three cards from the graveyard (lands first) if there are at least three, otherwise a Food. `suggested`
 * null: impossible.
 */
export function forageOptions(
  s: GameState,
  p: PlayerId,
  exclude?: ObjectId,
): { graveyard: ObjectId[]; foods: ObjectId[]; suggested: ObjectId[] | null } {
  const graveyard = (s.players[p]?.graveyard ?? []).filter((id) => id !== exclude);
  const foods = foodsToSacrifice(s, p);
  const isLand = (id: ObjectId) => !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");
  const suggested =
    graveyard.length >= 3
      ? [...graveyard].sort((a, b) => Number(isLand(b)) - Number(isLand(a))).slice(0, 3)
      : foods.length
        ? [foods[0] as ObjectId]
        : null;
  return { graveyard, foods, suggested };
}

/**
 * Forage (701.61): the chosen objects (three graveyard cards or a Food, checked by the caller), otherwise the automatic
 * choice (`forageOptions`). Returns false if impossible.
 */
export function forage(s: GameState, p: PlayerId, chosen?: ObjectId[]): boolean {
  const player = s.players[p];
  if (!player) return false;
  const paid = chosen ?? forageOptions(s, p).suggested;
  if (!paid) return false;
  if (paid.every((id) => s.objects[id]?.zone === "graveyard")) {
    for (const id of paid) {
      const o = obj(s, id);
      emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "graveyard", to: "exile" });
      moveObject(s, id, "exile");
    }
  } else for (const id of paid) sacrifice(s, id);
  rulesEvent(s, { e: "forage", player: p });
  return true;
}

/**
 * Paying life (119.4): the "enough life" checks remain the caller's. Ashiok, Wicked Manipulator: if the library has
 * at least that many cards, that many cards from the top are exiled instead (mandatory replacement, never split
 * between life and cards).
 */
export function payLife(s: GameState, p: PlayerId, amount: number): void {
  const library = s.players[p]?.library ?? [];
  if (amount <= 0) return;
  const exileInstead = eventReplacements(s, "payLife").some((a) => a.r.instead?.exileFromLibrary && recipientMatches(s, a, p));
  if (exileInstead && library.length >= amount) {
    for (const id of library.slice(0, amount)) {
      const o = obj(s, id);
      emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: "library", to: "exile" });
      moveObject(s, id, "exile");
    }
    return;
  }
  loseLife(s, p, amount);
}

/** `damage`: the loss comes from damage (Angel's Grace: "damage that would reduce your life total to less than 1"). */
/** A player loses life, replacements included; returns the life actually lost ("the life lost this way"). */
export function loseLife(s: GameState, p: PlayerId, amount: number, damage = false): number {
  const player = s.players[p];
  if (!player || amount <= 0) return 0;
  // Life loss replacements (Bloodletter of Aclazotz: during your turn, an opponent loses twice that much).
  const mods: AmountMod[] = [];
  for (const a of eventReplacements(s, "lifeLoss")) {
    if (!recipientMatches(s, a, p)) continue;
    // "Your life total can't change" (Teferi's Protection): no loss (the damage itself is still dealt).
    if (a.r.modify.prevent) return 0;
    const add = replacementAdd(s, a);
    if (add) mods.push({ add });
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
  }
  amount = chooseReplacementOrder(amount, mods, "min");
  if (damage) {
    const floors = playerStatics(s, p, "damageLifeFloor").map(({ ab }) => ab.damageLifeFloor ?? 0);
    if (floors.length) amount = Math.min(amount, Math.max(0, player.life - Math.max(...floors)));
    if (amount <= 0) return 0;
  }
  player.life -= amount;
  bumpFor(s, "life");
  emit({ type: "life", player: p, delta: -amount, life: player.life });
  logTurnEvent(s, { e: "lifeLoss", player: p, amount });
  rulesEvent(s, { e: "lifeLoss", player: p, amount });
  // 702.179: "whenever one or more opponents lose life during your turn, if your speed is less than 4, increase your
  // speed by 1; this ability triggers only once each turn" (ability on the stack).
  const active = s.turn.active;
  if (p !== active && s.players[active]?.speed !== undefined && !s.turn.onceFired.includes(SPEED_KEY)) {
    if (rulesTrigger(s, active, "speed")) s.turn.onceFired.push(SPEED_KEY);
  }
  return amount;
}

/** Speed trigger this turn (702.179: once per turn), in `s.turn.onceFired`. */
const SPEED_KEY = "rules:speed";

/** Sets a player's speed (702.179). */
export function setSpeed(s: GameState, p: PlayerId, speed: number): void {
  const player = s.players[p];
  if (!player || player.speed === speed) return;
  player.speed = speed;
  bump(s);
  emit({ type: "speed", player: p, speed });
}

/**
 * Recipient of a replacement (damage or life loss), seen from its controller: them, them or their permanents, an
 * opponent, an opponent or their permanents, and the filter of the damaged permanent.
 */
/** Does the replacement apply to this damage (combat, source, recipient)? */
function damageReplacementApplies(
  s: GameState,
  a: ActiveReplacement,
  source: DamageSource,
  target: string,
  combat: boolean,
): boolean {
  const r = a.r;
  if (r.combat !== undefined && r.combat !== combat) return false;
  // Shield: the chosen source (a spell with no object is recognized by its card and its controller).
  if (r.sourceIs && source.id !== r.sourceIs && !(!source.id && source.defId === r.sourceDefIs)) return false;
  if (r.source) {
    const id = source.id;
    const ok =
      id && s.objects[id]?.zone === "battlefield"
        ? matchesObjectFilter(s, a.controller, id, r.source, a.sourceId)
        : (() => {
            // "Entered this turn" (Neriv): a source gone from the battlefield, from its last known information.
            if (r.source?.enteredThisTurn && (!id || s.lki[id]?.controlledSince !== s.turn.number)) return false;
            const v = sourceView(s, id, source.defId, source.controller);
            const chooser = a.sourceId ? (s.objects[a.sourceId] ?? s.lki[a.sourceId]) : undefined;
            return !!v && matchesView(v, withChosen(r.source as ObjectFilter, chooser), a.controller, a.sourceId);
          })();
    if (!ok) return false;
  }
  return recipientMatches(s, a, target);
}

/**
 * Prevention by a replacement (615): a "the next time" shield is removed; The Mindskinner makes opponents mill, New
 * Way Forward has a reflexive ability ("when damage is prevented this way"), Anti-Venom gets that many +1/+1 counters.
 */
function preventByReplacement(
  s: GameState,
  a: ActiveReplacement,
  source: DamageSource,
  amount: number,
  target: ObjectId | PlayerId,
): void {
  consumeReplacement(s, a);
  const after = a.r.onPrevent;
  // The Mindskinner: "each opponent mills that many cards" — a real mill (701.13): mill replacements, a single grouped
  // event, the turn log.
  if (after?.opponentsMill) {
    const batch: [PlayerId, ObjectId[]][] = opponentsOf(s, a.controller).map((p) => {
      const q = quantityMods(s, "mill", (r) => recipientMatches(s, r, p));
      const count = amount > 0 && !q.prevented ? chooseReplacementOrder(amount, q.mods, "min") : 0;
      return [p, (s.players[p]?.library ?? []).slice(0, count)];
    });
    millCards(s, batch);
  }
  if (after?.counters && a.sourceId && s.objects[a.sourceId]?.zone === "battlefield")
    changeCounters(s, obj(s, a.sourceId), after.counters, amount);
  if (after?.countersOnDamaged && s.objects[target]?.zone === "battlefield")
    changeCounters(s, obj(s, target), after.countersOnDamaged, amount);
  if (after?.reflexive) {
    const origin = a.r.origin ?? (a.sourceId ? { id: a.sourceId, defId: obj(s, a.sourceId).defId } : undefined);
    if (origin)
      pushInline(
        s,
        a.controller,
        origin.id,
        origin.defId,
        { targets: [], effects: after.reflexive, label: msg("Damage prevented") },
        { objectId: source.id, player: source.controller, amount },
      );
  }
}

/** Is the damage source red (Ojer Axonil)? */
/** Characteristics of the damage source (on the battlefield, otherwise last known information or card). */
function sourceChars(
  s: GameState,
  source: DamageSource,
): { colors: Color[]; types: CardType[]; subtypes: string[]; supertypes: string[] } {
  if (source.id && s.objects[source.id]?.zone === "battlefield") {
    const c = chars(s, source.id);
    return { colors: c.colors, types: c.types, subtypes: c.subtypes, supertypes: c.supertypes };
  }
  const lki = source.id ? s.lki[source.id] : undefined;
  const d = s.defs[source.defId];
  return {
    colors: lki?.colors ?? d?.colors ?? [],
    types: lki?.types ?? d?.types ?? [],
    subtypes: lki?.subtypes ?? d?.subtypes ?? [],
    supertypes: lki?.supertypes ?? d?.supertypes ?? [],
  };
}

/** Turn log: damage (Temple of Power, Sidequest: Play Blitzball…). */
function logDamage(
  s: GameState,
  source: DamageSource,
  target: string,
  player: PlayerId,
  toPlayer: boolean,
  amount: number,
  combat: boolean,
): void {
  if (amount <= 0) return;
  const src = sourceChars(s, source);
  const victim = toPlayer ? undefined : chars(s, target);
  logTurnEvent(s, {
    e: "damage",
    player,
    toPlayer,
    amount,
    combat,
    sourceController: source.controller,
    sourceColors: src.colors,
    sourceTypes: src.types,
    sourceSubtypes: src.subtypes,
    sourceSupertypes: src.supertypes,
    sourceKey:
      (source.id ? (s.objects[source.id]?.uid ?? s.lki[source.id]?.uid ?? source.id) : undefined) ??
      source.stackId ??
      source.defId,
    types: victim?.types,
    subtypes: victim?.subtypes,
    ...(toPlayer ? {} : { id: target }),
    ...(source.id ? { sourceId: source.id } : {}),
  });
}

function _redSource(s: GameState, source: DamageSource): boolean {
  if (source.id && s.objects[source.id]?.zone === "battlefield") return chars(s, source.id).colors.includes("R");
  const lki = source.id ? s.lki[source.id] : undefined;
  return (lki?.colors ?? s.defs[source.defId]?.colors ?? []).includes("R");
}

export function dealDamage(s: GameState, source: DamageSource, target: string, amount: number, combat: boolean): void {
  if (amount <= 0) return;
  // Redirections (`redirectTo`): to the replacement's source first (Ancient Adamantoise: "damage that would be dealt
  // to you and other permanents you control is dealt to it instead"), then to the permanent the source is attached to
  // (With Great Power…: "damage that would be dealt to you is dealt to enchanted creature instead").
  for (const to of ["source", "attached"] as const) {
    for (const a of eventReplacements(s, "damage")) {
      if (a.r.redirectTo !== to || !a.sourceId || !damageReplacementApplies(s, a, source, target, combat)) continue;
      const into = to === "source" ? a.sourceId : s.objects[a.sourceId]?.attachedTo;
      if (into && s.objects[into]?.zone === "battlefield" && into !== target) {
        target = into;
        break;
      }
    }
  }
  // Sunspine Lynx: "damage can't be prevented"; Frenzied Baloth: combat damage.
  const unpreventable = damageUnpreventable(s, combat);
  if (!unpreventable && preventsDamageTo(s, target, combat)) return;
  // Player protection (702.16): damage from opposing sources (Absolute Virtue) or from any source (Teferi's
  // Protection) is prevented.
  if (!unpreventable && isPlayer(s, target) && playerProtectedFrom(s, target, source.controller, source.id)) return;
  const targetObj = s.objects[target];
  const victim = isPlayer(s, target) ? target : targetObj?.controller;
  // Damage replacements and preventions (R1, 616.1): the damaged player chooses the order, the least damage for them.
  // Another player's prevention therefore comes before the modifications (The Mindskinner mills the least), their own
  // after (New Way Forward sends back the most).
  const reps = eventReplacements(s, "damage").filter(
    (a) => !a.r.redirectTo && damageReplacementApplies(s, a, source, target, combat),
  );
  const foreignPrevention = unpreventable ? undefined : reps.find((a) => a.r.modify.prevent && a.controller !== victim);
  if (foreignPrevention) {
    preventByReplacement(s, foreignPrevention, source, amount, target);
    return;
  }
  // 702.16e: protection — damage from a source matching its quality is prevented.
  if (
    targetObj?.zone === "battlefield" &&
    !unpreventable &&
    protectedFrom(s, target, sourceView(s, source.id, source.defId, source.controller))
  )
    return;
  // Static preventions: damage received (Crystal Barricade, Fog Bank) or dealt by the source (Fog Bank).
  for (const p of unpreventable ? [] : preventions(s)) {
    if (p.ab.noncombatOnly && combat) continue;
    if (p.ab.combatOnly && !combat) continue;
    // Fog Bank: the damage dealt by matching sources (`source`: itself).
    if (p.ab.source) {
      const v = sourceView(s, source.id, source.defId, source.controller);
      if (v && matchesView(v, p.ab.source, p.controller, p.sourceId)) return;
      continue;
    }
    if (targetObj?.zone === "battlefield" && matchesObjectFilter(s, p.controller, target, p.ab.filter, p.sourceId)) return;
  }
  // Replacements that modify the amount (614, 616.1): each applies once, in the order chosen by the damaged player (or
  // the controller of the damaged permanent), here the least damage for them (`chooseReplacementOrder`).
  const mods: AmountMod[] = [];
  for (const a of reps) {
    // Hawkeye, Young Avenger: "that much plus its power"; Fated Firepower: "plus the number of fire counters".
    const add = replacementAdd(s, a);
    if (add) mods.push({ add });
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
    // Ojer Axonil: "at least as much damage as [this creature]'s power".
    const atLeast = replacementAtLeast(s, a);
    if (atLeast !== undefined) mods.push({ atLeast });
  }
  const _toOpponent = !!victim && victim !== source.controller;
  amount = chooseReplacementOrder(amount, mods, "min");
  const ownPrevention = unpreventable ? undefined : reps.find((a) => a.r.modify.prevent && a.controller === victim);
  if (ownPrevention) {
    preventByReplacement(s, ownPrevention, source, amount, target);
    return;
  }
  if (amount <= 0) return;
  // 122.1c: a permanent with a shield counter that would be dealt damage loses that counter instead (a replacement,
  // not a prevention: "can't be prevented" does not stop it).
  if (targetObj?.zone === "battlefield" && (targetObj.counters.shield ?? 0) > 0) {
    changeCounters(s, targetObj, "shield", -1);
    return;
  }
  // Ruric Thar, Magecrusher: "as long as it hasn't dealt combat damage yet"; Karakyk Guardian: "as long as it hasn't
  // dealt damage yet" (combat or not).
  const dealer = source.id ? s.objects[source.id] : undefined;
  if (dealer && ((combat && !dealer.dealtCombatDamage) || !dealer.dealtDamage)) {
    if (combat) dealer.dealtCombatDamage = true;
    dealer.dealtDamage = true;
    bumpFor(s, "dealt");
  }
  let excess = 0;
  if (isPlayer(s, target)) {
    const src = source.id ? s.objects[source.id] : undefined;
    emit({ type: "damage", sourceDefId: source.defId, target, amount, combat });
    logDamage(s, source, target, target, true, amount, combat);
    // 903.10a: combat damage from a commander, accumulated over the game (704.6c: 21, the player loses).
    const commander = combat ? commanderOf(s, src) : undefined;
    if (commander) commander.damage[target] = (commander.damage[target] ?? 0) + amount;
    // Toxic N (702.164): combat damage to a player also gives them N poison counters.
    const toxic = combat && src && source.keywords.includes("toxic") ? (s.defs[src.defId]?.toxic ?? 1) : 0;
    const poisoned = s.players[target];
    if (toxic && poisoned) {
      poisoned.counters ??= {};
      const counters = poisoned.counters;
      counters.poison = (counters.poison ?? 0) + toxic;
      bump(s); // corrupted: statics depend on it (Skrelv's Hive)
      emit({ type: "poison", player: target, amount: toxic, total: counters.poison });
    }
    // Infect (702.90b): poison counters instead of life loss.
    // Phyrexian Unlife: at 0 or less life, as if the source had infect.
    const pl = s.players[target];
    if (pl && (source.keywords.includes("infect") || (pl.life <= 0 && playerStatic(s, target, "infectDamageAtZeroLife")))) {
      pl.counters ??= {};
      const counters = pl.counters;
      counters.poison = (counters.poison ?? 0) + amount;
      bump(s); // corrupted: statics depend on it
      emit({ type: "poison", player: target, amount, total: counters.poison });
    } else loseLife(s, target, amount, true);
  } else {
    const o = s.objects[target];
    // 506.4: an attacked planeswalker that has left the battlefield is not dealt damage.
    if (o?.zone !== "battlefield") return;
    const creature = isCreature(s, target);
    const walker = hasType(s, target, "Planeswalker");
    if (!creature && !walker) return;
    // Wolverine: the previous damage is healed before the new damage is marked.
    if (creature && chars(s, target).keywords.includes("damageHealsFirst")) {
      o.damage = 0;
      o.deathtouched = false;
    }
    // 120.4a: excess damage, beyond lethal damage (deathtouch: 1 is enough) or loyalty.
    const deathtouch = source.keywords.includes("deathtouch");
    const lethal = creature
      ? Math.max(0, deathtouch ? (o.damage > 0 || o.deathtouched ? 0 : 1) : chars(s, target).toughness - o.damage)
      : (o.counters.loyalty ?? 0);
    excess = Math.max(0, amount - lethal);
    // 120.3c: damage dealt to a planeswalker removes that many loyalty counters from it.
    if (walker) changeCounters(s, o, "loyalty", -Math.min(amount, o.counters.loyalty ?? 0));
    if (creature) {
      // Wither (702.80), infect (702.90b): −1/−1 counters instead of marked damage (it is still damage).
      // 120.3d: the source's controller puts them.
      if (source.keywords.includes("wither") || source.keywords.includes("infect"))
        changeCounters(s, o, "-1/-1", amount, { by: source.controller });
      else o.damage += amount;
      if (source.keywords.includes("deathtouch")) o.deathtouched = true;
      // Tracking of "dealt damage by this creature this turn" (Predator Ooze).
      if (source.id && !o.damagedBy?.includes(source.id)) o.damagedBy = [...(o.damagedBy ?? []), source.id];
    }
    emit({ type: "damage", sourceDefId: source.defId, target, targetDefId: o.defId, amount, combat });
    logDamage(s, source, target, o.controller, false, amount, combat);
  }
  // Lifelink: one gain per source and per batch of simultaneous damage (see `queueLifelink`).
  if (source.keywords.includes("lifelink") && amount > 0) {
    const key = source.id ?? `${source.defId}|${source.controller}`;
    if (!queueLifelink(key, source.controller, amount)) gainLife(s, source.controller, amount);
  }
  rulesEvent(s, {
    e: "damage",
    sourceId: source.id ?? null,
    stackId: source.stackId,
    sourceController: source.controller,
    target,
    amount,
    combat,
    excess: excess || undefined,
  });
}

export function sourceFromObject(s: GameState, id: ObjectId): DamageSource {
  const o = obj(s, id);
  return { id, defId: o.defId, controller: o.controller, keywords: chars(s, id).keywords };
}

/** Destroys a permanent (unless indestructible). Returns true if it left the battlefield. */
/** `by`: the controller of the destroying spell or ability ("a spell or ability an opponent controls destroys", Karmic Justice). */
export function destroy(s: GameState, id: ObjectId, noRegenerate = false, by?: PlayerId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  if (hasKeyword(s, id, "indestructible")) return false;
  // 122.1c: a permanent with a shield counter that would be destroyed loses that counter instead.
  if ((o.counters.shield ?? 0) > 0) {
    changeCounters(s, o, "shield", -1);
    return false;
  }
  // Regeneration (701.19c): the destruction is replaced; the permanent is tapped, removed from combat and its damage
  // is removed.
  if (o.regenShields && !noRegenerate) {
    o.regenShields -= 1;
    if (!o.regenShields) delete o.regenShields;
    if (!o.tapped) tapObject(s, o);
    removeFromCombat(s, id);
    o.damage = 0;
    o.deathtouched = false;
    bump(s);
    return false;
  }
  emit({ type: "destroy", objectId: id, defId: o.defId });
  if (by) rulesEvent(s, { e: "destroyed", lki: snapshot(s, id), by });
  putIntoGraveyard(s, id);
  return true;
}

/** Puts a permanent into its owner's graveyard (death, sacrifice, toughness 0…). */
export function putIntoGraveyard(s: GameState, id: ObjectId): ObjectId | null {
  const o = obj(s, id);
  // Emitted before the move (order of events), then completed with the actual destination:
  // a replacement can exile the creature (Scorching Dragonfire) or shuffle it into the library.
  const event: Extract<GameEvent, { type: "dies" }> = { type: "dies", objectId: id, defId: o.defId, to: "graveyard" };
  emit(event);
  const landed: { to?: Zone } = {};
  const moved = moveObject(s, id, "graveyard", { landed });
  if (landed.to) event.to = landed.to;
  removeFromCombat(s, id);
  return moved;
}

/** Sacrifice (701.21): the controller puts the permanent into the graveyard; "whenever you sacrifice…" triggers. */
export function sacrifice(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return;
  // Zurgo, Thunder's Decree: "this token can't be sacrificed".
  // The Master, Multiplied: nor a creature token its controller's triggered ability would make them sacrifice.
  if (hasKeyword(s, id, "cantBeSacrificed") || tokenShielded(s, id)) return;
  rulesEvent(s, { e: "sacrifice", objectId: id, player: o.controller });
  const c = chars(s, id);
  logTurnEvent(s, {
    e: "sacrifice",
    player: o.controller,
    types: c.types,
    subtypes: c.subtypes,
    supertypes: c.supertypes,
    token: o.isToken || undefined,
  });
  const moved = putIntoGraveyard(s, id);
  // "Whenever an opponent sacrifices… put that card onto the battlefield" (It That Betrays): the triggers created
  // before the move follow the card into its new zone.
  if (moved) for (const t of s.triggers) if (t.event.objectId === id && !t.event.newObjectId) t.event.newObjectId = moved;
}

/**
 * Phasing (702.26): the permanent and what is attached to it (indirectly, 702.26g) phase out; they are treated as
 * though they did not exist, without changing zones (neither leaving nor entering), until their controller's untap
 * step (`phaseIn`).
 */
export function phaseOut(s: GameState, id: ObjectId): void {
  const all = [id];
  for (let i = 0; i < all.length; i++)
    for (const x of s.battlefield) if (s.objects[x]?.attachedTo === all[i] && !all.includes(x)) all.push(x);
  for (const x of all) {
    const o = s.objects[x];
    const pl = o ? s.players[o.owner] : undefined;
    if (o?.zone !== "battlefield" || !pl) continue;
    removeFromCombat(s, x);
    s.battlefield = s.battlefield.filter((y) => y !== x);
    o.zone = "phasedOut";
    pl.phasedOut = [...(pl.phasedOut ?? []), x];
    emit({ type: "moved", owner: o.owner, objectId: x, defId: o.defId, from: "battlefield", to: "phasedOut" });
  }
  bump(s);
}

/** 502.1: at the start of the untap step, that player's phased-out permanents phase in. */
export function phaseIn(s: GameState, player: PlayerId): void {
  let changed = false;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    for (const x of [...(pl?.phasedOut ?? [])]) {
      const o = s.objects[x];
      if (!o || !pl || o.controller !== player) continue;
      pl.phasedOut = pl.phasedOut.filter((y) => y !== x);
      o.zone = "battlefield";
      s.battlefield.push(x);
      emit({ type: "moved", owner: o.owner, objectId: x, defId: o.defId, from: "phasedOut", to: "battlefield" });
      changed = true;
    }
  }
  if (changed) bump(s);
}

export function removeFromCombat(s: GameState, id: ObjectId): void {
  if (!s.combat) return;
  bump(s);
  s.combat.attackers = s.combat.attackers.filter((a) => a.id !== id);
  s.combat.blockers = s.combat.blockers.filter((b) => b.id !== id);
  for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => b !== id);
}

export function tokenDefId(t: TokenSpec): string {
  const kw = (t.keywords ?? []).join("-");
  return `token:${t.name.toLowerCase().replace(/\W+/g, "-")}-${t.power ?? "x"}-${t.toughness ?? "x"}-${t.colors.join("")}${kw ? `-${kw}` : ""}${t.toxic ? `-toxic${t.toxic}` : ""}`;
}

/** Monarch (724): the designated player becomes it (only one monarch at a time). */
export function setMonarch(s: GameState, player: PlayerId): void {
  if (s.monarch === player || !s.players[player] || s.players[player]?.lost) return;
  s.monarch = player;
  emit({ type: "monarch", player });
  bump(s);
}

/** `enters`: entering modifications imposed by the effect (tapped, attacking, counters), before the entering event. */
/**
 * Token caps (`limits.ts`): token doublers that multiply (copies of Exalted Sunborn) quickly give an astronomical
 * number, even infinite in JavaScript (see docs/approximations.md).
 */
function tokenRoom(s: GameState, n: number): number {
  const room = Math.max(0, Math.min(n, MAX_TOKENS_PER_EVENT, MAX_BATTLEFIELD - s.battlefield.length));
  if (room < n) capReached("tokens");
  return room;
}

/** Token replacements (R1, family H), seen from the player creating them and from the token created. */
function tokenReplacements(s: GameState, controller: PlayerId, v: LkiSnapshot) {
  return eventReplacements(s, "tokens").filter(
    (a) =>
      playerSide(s, a, controller) &&
      (!a.r.toFilter || matchesView(v, a.r.toFilter, a.controller, a.sourceId)) &&
      (!a.r.instead?.firstEachTurn || !s.turn.onceFired.includes(`tokens:${a.sourceId}`)),
  );
}

/** Draconic Visitor: other tokens instead (artifact tokens become 5/5 flying Dragons). */
function swappedToken(s: GameState, controller: PlayerId, t: TokenSpec): TokenSpec {
  return tokenReplacements(s, controller, tokenView(t, controller)).find((a) => !!a.r.instead?.token)?.r.instead?.token ?? t;
}

/**
 * Moonlit Meditation, Mirrormind Crown: the replacement that creates, instead, copies of the permanent its source is
 * attached to (the first time each turn). `may`: "you may" — the question is asked before the creation by the effect
 * that creates the tokens (`copyDeclined` of `createTokens`).
 */
export function tokenCopyReplacement(
  s: GameState,
  controller: PlayerId,
  t: TokenSpec,
): { sourceId: ObjectId; controller: PlayerId; host: ObjectId; may: boolean; firstEachTurn: boolean } | undefined {
  const t2 = swappedToken(s, controller, t);
  for (const a of tokenReplacements(s, controller, tokenView(t2, controller))) {
    const host = a.sourceId ? s.objects[s.objects[a.sourceId]?.attachedTo ?? ""] : undefined;
    if (a.sourceId && a.r.instead?.copyOfAttached && host?.zone === "battlefield")
      return {
        sourceId: a.sourceId,
        controller: a.controller,
        host: host.id,
        may: !!a.r.instead.may,
        firstEachTurn: !!a.r.instead.firstEachTurn,
      };
  }
  return undefined;
}

/** Number of tokens that "create N [token]" makes for this player (doublers, 616.1; the cap on tokens). */
export function tokenCount(s: GameState, controller: PlayerId, t: TokenSpec, count: number): number {
  const t2 = swappedToken(s, controller, t);
  return tokenRoom(
    s,
    chooseReplacementOrder(count, tokenModifiers(s, tokenReplacements(s, controller, tokenView(t2, controller))), "max"),
  );
}

export function createTokens(
  s: GameState,
  controller: PlayerId,
  t: TokenSpec,
  count: number,
  extras = true,
  enters: EntersContext = {},
  /** The controller of Moonlit Meditation declined the copies ("you may"). */
  copyDeclined = false,
  /** Sources of the "one of each" replacements already applied to these tokens (Academy Manufactor, 616.1). */
  applied: ObjectId[] = [],
  /** What each token attacks (508.4, `tokenCount` of them); more or fewer tokens: spread proportionally. */
  attackingEach?: (string | undefined)[],
): ObjectId[] {
  const tokenReps = (v: LkiSnapshot) => tokenReplacements(s, controller, v);
  t = swappedToken(s, controller, t);
  // Academy Manufactor: "instead create one of each" (a Clue, a Food and a Treasure), as many times; another
  // Manufactor then applies to each of them.
  const oneOfEach =
    count > 0
      ? tokenReps(tokenView(t, controller)).find(
          (a) => !!a.r.instead?.oneOfEach?.length && !!a.sourceId && !applied.includes(a.sourceId),
        )
      : undefined;
  if (oneOfEach?.sourceId && oneOfEach.r.instead?.oneOfEach) {
    const done = [...applied, oneOfEach.sourceId];
    return oneOfEach.r.instead.oneOfEach.flatMap((each) =>
      createTokens(s, controller, each, count, extras, enters, copyDeclined, done),
    );
  }
  // Moonlit Meditation, Mirrormind Crown: the first time each turn, copies of the permanent the source is attached to,
  // instead. If declined, the first time has still passed.
  const copies = count > 0 ? tokenCopyReplacement(s, controller, t) : undefined;
  if (copies) {
    if (copies.firstEachTurn) s.turn.onceFired.push(`tokens:${copies.sourceId}`);
    const model = copyDeclined ? undefined : s.objects[copies.host];
    if (model) {
      const out: ObjectId[] = [];
      const view = snapshot(s, model.id);
      const n = tokenRoom(s, chooseReplacementOrder(count, tokenModifiers(s, tokenReps(view)), "max"));
      for (let i = 0; i < n; i++) out.push(createTokenCopy(s, controller, model.defId));
      if (extras && n > 0) out.push(...createPlusTokens(s, controller, [view]));
      return out;
    }
  }
  const created: ObjectId[] = [];
  const defId = tokenDefId(t);
  if (!s.defs[defId]) {
    const def: CardDef = {
      id: defId,
      name: t.name,
      typeLine: `Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`,
      manaCost: null,
      manaCostText: "",
      colors: t.colors,
      supertypes: t.legendary ? ["Legendary"] : [],
      types: t.types,
      subtypes: t.subtypes,
      power: t.power,
      toughness: t.toughness,
      cda: t.cdaPT === undefined ? undefined : { pt: t.cdaPT },
      enchant: t.enchant,
      keywords: t.toxic ? [...new Set([...(t.keywords ?? []), "toxic" as const])] : (t.keywords ?? []),
      ...(t.toxic ? { toxic: t.toxic } : {}),
      abilities: t.abilities ?? [],
      text: t.text ?? "",
      implemented: true,
      isToken: true,
    };
    s.defs[defId] = def;
  }
  // Doubling Season: "creates twice that many of those tokens"; Ojer Taq: three times that many creature tokens.
  const n = tokenCount(s, controller, t, count);
  for (let i = 0; i < n; i++) {
    const o = createObject(s, defId, controller, "battlefield", { isToken: true });
    o.timestamp = nextTimestamp(s);
    const each = attackingEach?.length
      ? { ...enters, attacking: attackingEach[Math.floor((i * attackingEach.length) / n)] }
      : enters;
    // Entering replacements of other permanents ("each creature you control enters with…"); a token described as
    // tapped (`TokenSpec.tapped`) enters tapped.
    applyEntersReplacements(s, o, t.tapped ? { ...each, tapped: true } : each);
    emit({ type: "token", objectId: o.id, defId, controller });
    rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
    if (o.attachedTo && s.objects[o.attachedTo]) rulesEvent(s, { e: "attached", objectId: o.id, to: o.attachedTo });
    logTokenArrival(s, o);
    created.push(o.id);
  }
  if (extras && count > 0) created.push(...createPlusTokens(s, controller, [tokenView(t, controller)]));
  return created;
}

/**
 * Quina ("those tokens plus a Frog"), Worldwalker Helm ("plus a Map"): the tokens added to one creation of tokens
 * (`views`: the tokens created, token copies included), once per replacement that applies to one of them. The added
 * tokens do not trigger a new replacement.
 */
export function createPlusTokens(s: GameState, controller: PlayerId, views: LkiSnapshot[]): ObjectId[] {
  const created: ObjectId[] = [];
  for (const a of eventReplacements(s, "tokens")) {
    if (!a.r.plus || !playerSide(s, a, controller)) continue;
    const toFilter = a.r.toFilter;
    if (toFilter && !views.some((v) => matchesView(v, toFilter, a.controller, a.sourceId))) continue;
    created.push(...createTokens(s, controller, a.r.plus, 1, false));
  }
  return created;
}

/** Token copy of a card: same copiable values (its definition), but it is a token (707.2). */
export function createTokenCopy(s: GameState, controller: PlayerId, defId: string, enters: EntersContext = {}): ObjectId {
  const o = createObject(s, defId, controller, "battlefield", { isToken: true });
  o.timestamp = nextTimestamp(s);
  applyEntersReplacements(s, o, enters);
  emit({ type: "token", objectId: o.id, defId, controller });
  rulesEvent(s, { e: "zone", oldId: null, newId: o.id, from: null, to: "battlefield", lki: null });
  logTokenArrival(s, o);
  return o.id;
}

/** Turn log: a created token enters the battlefield ("a creature entered under your control"). */
function logTokenArrival(s: GameState, o: GameObject): void {
  const c = chars(s, o.id);
  logTurnEvent(s, zoneEntry(null, "battlefield", o.owner, o.controller, { types: c.types, subtypes: c.subtypes, token: true }));
}

/** The token as it would be created (filters of token replacements). */
function tokenView(t: TokenSpec, controller: PlayerId): LkiSnapshot {
  return {
    id: "",
    defId: tokenDefId(t),
    owner: controller,
    controller,
    name: t.name,
    types: t.types,
    subtypes: t.subtypes,
    supertypes: t.legendary ? ["Legendary"] : [],
    colors: t.colors,
    power: t.power ?? 0,
    toughness: t.toughness ?? 0,
    keywords: t.keywords ?? [],
    isToken: true,
  };
}

/** Modifications of the number of tokens: "twice that many" (Doubling Season), "three times that many" (Ojer Taq), "that many plus N". */
function tokenModifiers(s: GameState, reps: ActiveReplacement[]): AmountMod[] {
  const mods: AmountMod[] = [];
  for (const a of reps) {
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
    const add = replacementAdd(s, a);
    if (add) mods.push({ add });
  }
  return mods;
}

/**
 * Number of token copies created for `count` (Doubling Season, Ojer Taq…): the multipliers of the token
 * replacements that apply to this model.
 */
export function tokenCopyCount(s: GameState, controller: PlayerId, model: LkiSnapshot, count: number): number {
  const reps = eventReplacements(s, "tokens").filter(
    (a) => playerSide(s, a, controller) && (!a.r.toFilter || matchesView(model, a.r.toFilter, a.controller, a.sourceId)),
  );
  return tokenRoom(s, chooseReplacementOrder(count, tokenModifiers(s, reps), "max"));
}
