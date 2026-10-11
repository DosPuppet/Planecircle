/**
 * Target legality (rule 115).
 */
import { castOption } from "./cardDef";
import { resolveCompare } from "./effects";
import { RulesError } from "./errors";
import { chars, hasKeyword, snapshot } from "./layers";
import { firstOfEachName, isCreatureType, shareName } from "./names";
import { commanderIdentity, obj } from "./state";
import { playerProtectedFrom, playerStatic, playerStatics } from "./statics";
import { msg } from "./text";
import { attackedThisTurn, countersPutThisTurn, dealtDamageThisTurn, enteredThisTurn } from "./turnlog";
import type {
  CardType,
  Color,
  ExiledFilter,
  FilterCompare,
  GameState,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TargetSpec,
} from "./types";
import { COLORS, isAnyManaAbility, PERMANENT_TYPES } from "./types";

/**
 * View of a source (spell, source of an ability or of damage): the object, its last known information, otherwise the
 * printed card.
 */
export function sourceView(s: GameState, id?: ObjectId, defId?: string, controller?: PlayerId): LkiSnapshot | undefined {
  if (id && s.objects[id]) return snapshot(s, id);
  if (id && s.lki[id]) return s.lki[id];
  const d = defId ? s.defs[defId] : undefined;
  if (!d || !controller) return undefined;
  return {
    id: id ?? "",
    defId: d.id,
    owner: controller,
    controller,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: d.keywords,
    isToken: !!d.isToken,
    name: d.name,
  } as LkiSnapshot;
}

/**
 * Protection and hexproof "from [filter]" (702.16, 702.11d; R4.2): is the object `id` protected from this source?
 * Hexproof counts only for targeting by an opponent (`targetedByOpponent`).
 * Without a view of the source, only protection from everything (empty filter) applies.
 */
export function protectedFrom(s: GameState, id: ObjectId, source: LkiSnapshot | undefined, targetedByOpponent = false): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  for (const r of chars(s, id).protections) {
    if (r.hexproofOnly && !targetedByOpponent) continue;
    // "hexproof from the chosen color" (Mondo Gecko): the choice of the protected permanent.
    let from = resolveFilter(s, r.from, id);
    // Commander's Plate: each color outside the color identity of its controller's commanders (903.4).
    if (r.outsideIdentity) {
      const identity = commanderIdentity(s, o.controller);
      const colors = COLORS.filter((c) => !identity.includes(c));
      if (colors.length === 0) continue;
      from = { ...from, colors };
    }
    if (source ? matchesView(source, from, o.controller, id) : Object.keys(from).length === 0) return true;
  }
  return false;
}

/** Does the filter apply to these characteristics (live object or last known information)? */
/** Counters (of a given kind, or of any kind) put by this player, from the "player|kind" entries. */
export function countersPutBy(entries: string[] | undefined, player: PlayerId, kind: boolean | string): boolean {
  return !!entries?.some((x) => (kind === true ? x.startsWith(`${player}|`) : x === `${player}|${kind}`));
}

/** `ObjectFilter.attacking`: attacking, attacking you, attacking an opponent or one of the designated players. */
function attackingMatches(v: LkiSnapshot, a: NonNullable<ObjectFilter["attacking"]>, perspective: PlayerId): boolean {
  if (typeof a === "boolean") return !!v.attacking === a;
  if (a === "you") return v.attackedPlayer === perspective;
  if (a === "opponent") return !!v.attackedPlayer && v.attackedPlayer !== perspective;
  // An unresolved reference (outside `withX`): any attacking creature.
  return Array.isArray(a) ? !!v.attackedPlayer && a.includes(v.attackedPlayer) : !!v.attacking;
}

export function matchesView(v: LkiSnapshot, f: ObjectFilter, perspective: PlayerId, sourceId?: ObjectId): boolean {
  // `types: []` ("target permanent"): no type constraint.
  if (f.types?.length && !f.types.some((t) => v.types.includes(t))) return false;
  if (f.notTypes?.some((t) => v.types.includes(t))) return false;
  if (f.subtype && !hasSubtype(v, f.subtype)) return false;
  if (f.commander && !v.commander) return false;
  if (f.controller === "you" && v.controller !== perspective) return false;
  if (f.controller === "opponent" && v.controller === perspective) return false;
  if (f.owner && (v.owner === perspective) !== (f.owner === "you")) return false;
  if (f.keyword && !v.keywords.includes(f.keyword)) return false;
  if (f.other && v.id === sourceId) return false;
  if (f.self && v.id !== sourceId) return false;
  // Kid Loki: "each creature you put +1/+1 counters on this turn".
  if (f.countersPutByYouThisTurn && !countersPutBy(v.countersPutThisTurn, perspective, f.countersPutByYouThisTurn)) return false;
  // A spell (view from `spellView`); for an object, `matchesObjectFilter` reads its definition.
  if (f.adventure !== undefined && !v.id && !!v.adventure !== f.adventure) return false;
  if (f.hasX !== undefined && !!v.hasX !== f.hasX) return false;
  if (f.suspected !== undefined && !!v.suspected !== f.suspected) return false;
  if (f.minPower !== undefined && v.power < f.minPower) return false;
  if (f.attacking !== undefined && !attackingMatches(v, f.attacking, perspective)) return false;
  if (f.maxManaValue !== undefined && (v.manaValue ?? 0) > f.maxManaValue) return false;
  if (f.manaValue !== undefined && (v.manaValue ?? 0) !== f.manaValue) return false;
  // "card with the chosen name", "with the same name as" (`nameOf`): a name in common; a split card has both its names
  // (709.4), an adventurer its main name (715.4), a double-faced card that of its face-up face (712.8a).
  if (f.name && !shareName(v.name, f.name)) return false;
  if (f.tapped !== undefined && !!v.tapped !== f.tapped) return false;
  if (f.equipped !== undefined && !!v.equipped !== f.equipped) return false;
  if (f.modified !== undefined) {
    const counters = Object.values(v.counters ?? {}).some((n) => n > 0);
    if ((counters || !!v.equipped || (v.enchantedBy ?? []).includes(v.controller)) !== f.modified) return false;
  }
  if (f.attached === "toSource" && (!sourceId || v.attachedTo !== sourceId)) return false;
  if (f.paired === "source") {
    if (!sourceId || !(v.id === sourceId ? !!v.pairedWith : v.pairedWith === sourceId)) return false;
  } else if (f.paired !== undefined && !!v.pairedWith !== f.paired) return false;
  if (f.enchanted !== undefined) {
    const by = v.enchantedBy ?? [];
    if (f.enchanted === "byYou" ? !by.includes(perspective) : by.length > 0 !== f.enchanted) return false;
  }
  if (f.attached === "wasToSource" && !(sourceId && v.lastAttachedTo === sourceId && !v.attachedTo)) return false;
  if (f.crew === "bySource" && !(sourceId && v.crewedByThisTurn?.includes(sourceId))) return false;
  if (f.colors && !f.colors.some((c) => v.colors.includes(c))) return false;
  // "with a counter": `any` accepts any kind of counter.
  if (f.withCounter === "any" && !Object.values(v.counters ?? {}).some((n) => n > 0)) return false;
  if (f.withCounter && f.withCounter !== "any" && !((v.counters?.[f.withCounter] ?? 0) > 0)) return false;
  if (f.cast !== undefined && !!v.cast !== f.cast) return false;
  if (f.anySubtype && !f.anySubtype.some((t) => hasSubtype(v, t))) return false;
  if (f.notSubtype && hasSubtype(v, f.notSubtype)) return false;
  if (f.token !== undefined && v.isToken !== f.token) return false;
  if (f.minToughness !== undefined && v.toughness < f.minToughness) return false;
  if (f.damagedBySource && !(sourceId && v.damagedBy?.includes(sourceId))) return false;
  if (f.minManaValue !== undefined && (v.manaValue ?? 0) < f.minManaValue) return false;
  if (f.maxPower !== undefined && v.power > f.maxPower) return false;
  if (f.basic !== undefined && v.supertypes.includes("Basic") !== f.basic) return false;
  if (f.permanent && !v.types.some((t) => PERMANENT_TYPES.includes(t))) return false;
  if (f.anyOf && !f.anyOf.some((g) => matchesView(v, g, perspective, sourceId))) return false;
  if (f.legendary !== undefined && v.supertypes.includes("Legendary") !== f.legendary) return false;
  if (f.maxToughness !== undefined && v.toughness > f.maxToughness) return false;
  if (f.compare && !compareMatches(v, f.compare)) return false;
  // "with a mana ability" (Moonsilver Key): a mana ability, activated or not (605.1a).
  if (f.withActivatedAbility === "mana" && !(v.abilities ?? []).some(isAnyManaAbility)) return false;
  if (f.withActivatedAbility === true && !(v.abilities ?? []).some((a) => a.kind === "activated")) return false;
  if (f.noneOfSubtypes && (v.subtypes.includes(ALL_CREATURE_TYPES) || f.noneOfSubtypes.some((t) => v.subtypes.includes(t))))
    return false;
  if (f.preparedSpell !== undefined && !!v.preparedSpell !== f.preparedSpell) return false;
  if (f.prepared !== undefined && !!v.prepared !== f.prepared) return false;
  if (f.warped !== undefined && !!v.warped !== f.warped) return false;
  if (f.blocking !== undefined && !!v.blocking !== f.blocking) return false;
  if (f.blocked !== undefined && v.blocked !== f.blocked) return false;
  if (f.multicolored !== undefined && v.colors.length >= 2 !== f.multicolored) return false;
  if (f.colorCount !== undefined && v.colors.length !== f.colorCount) return false;
  if (f.not && matchesView(v, f.not, perspective, sourceId)) return false;
  if (f.manaSpentBelowValue && !((v.manaSpent ?? 0) < (v.manaValue ?? 0))) return false;
  if (f.damaged !== undefined && !!v.damaged !== f.damaged) return false;
  if (f.faceDown !== undefined && !!v.faceDown !== f.faceDown) return false;
  return true;
}

/**
 * `ObjectFilter.compare`: each resolved comparison (a number), relative to the object itself (`power`, `basePower`) or
 * of parity; an amount not yet resolved (filter read directly, outside `resolveFilter` and `withX`) is ignored.
 */
function compareMatches(v: LkiSnapshot, cs: FilterCompare[]): boolean {
  for (const c of cs) {
    const x = c.what === "power" ? v.power : c.what === "toughness" ? v.toughness : (v.manaValue ?? 0);
    if (c.cmp === "odd" || c.cmp === "even") {
      if ((x % 2 === 0) !== (c.cmp === "even")) return false;
      continue;
    }
    const to = c.to === "power" ? v.power : c.to === "basePower" ? (v.basePower ?? v.power) : c.to;
    if (typeof to !== "number") continue;
    const ok = c.cmp === "<" ? x < to : c.cmp === "<=" ? x <= to : c.cmp === "=" ? x === to : c.cmp === ">=" ? x >= to : x > to;
    if (!ok) return false;
  }
  return true;
}

/**
 * Subtype marker: "has all creature types" (Soulstone Sanctuary); in `ObjectFilter.anySubtype`, "any creature type"
 * (sharing a creature type with a changeling).
 */
export const ALL_CREATURE_TYPES = "*";

/** Changeling (702.73a, in all zones) or "all creature types" (layer 4): each creature type of 205.3m. */
export function hasAllCreatureTypes(v: Pick<LkiSnapshot, "keywords" | "subtypes">): boolean {
  return v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES);
}

/** Its creature types (205.3m, `CREATURE_TYPES`), or `["*"]` when it has them all. */
export function creatureTypesOf(v: Pick<LkiSnapshot, "keywords" | "subtypes">): string[] {
  return hasAllCreatureTypes(v) ? [ALL_CREATURE_TYPES] : v.subtypes.filter(isCreatureType);
}

function hasSubtype(v: LkiSnapshot, t: string): boolean {
  // "Any creature type" (shares a creature type with a changeling).
  if (t === ALL_CREATURE_TYPES) return hasAllCreatureTypes(v) || v.subtypes.some(isCreatureType);
  if (v.subtypes.includes(t)) return true;
  // Only the creature types of the official list (not Food, Book, Equipment…).
  return hasAllCreatureTypes(v) && isCreatureType(t);
}

/** Does the filter read a choice made by its source ("of the chosen type / color / name")? */
export function hasChosen(f: ObjectFilter): boolean {
  return !!(f.chosen || (f.not && hasChosen(f.not)));
}

/** Replaces "of the chosen type / color" with the choice made by the source as it entered. */
export function withChosen(
  f: ObjectFilter,
  source:
    | {
        chosen?: {
          creatureType?: string;
          color?: Color;
          cardName?: string;
          parity?: "odd" | "even";
          number?: number;
          mode?: string;
        };
      }
    | undefined,
): ObjectFilter {
  if (!hasChosen(f)) return f;
  // "Not of the chosen name / type" (Sphinx Ambassador): the choice is also read inside `not`.
  const not = f.not && hasChosen(f.not) ? withChosen(f.not, source) : f.not;
  const out: ObjectFilter = { ...f, not, chosen: undefined };
  if (f.chosen === "number") {
    // Without a choice, nothing matches (no value is negative).
    const n = source?.chosen?.number ?? -1;
    out.anyOf = [
      { manaValue: n },
      { types: ["Creature"], minPower: n, maxPower: n },
      { types: ["Creature"], minToughness: n, maxToughness: n },
    ];
  }
  if (f.chosen === "parity") out.compare = [...(f.compare ?? []), { what: "manaValue", cmp: source?.chosen?.parity ?? "even" }];
  if (f.chosen === "cardName") out.name = source?.chosen?.cardName ?? "—";
  // Without a choice (entered without resolving), nothing matches.
  if (f.chosen === "subtype") out.subtype = source?.chosen?.creatureType ?? "—";
  if (f.chosen === "color") out.colors = source?.chosen?.color ? [source.chosen.color] : [];
  // Without a choice, no type matches.
  if (f.chosen === "cardType") out.types = [(source?.chosen?.mode ?? "—") as CardType];
  return out;
}

/**
 * Replaces the dynamic values of the filter with their current value, outside a resolution: the choices of the source,
 * then the comparisons (`resolveCompare`, from the point of view of the source alone).
 */
export function resolveFilter(s: GameState, f: ObjectFilter, sourceId?: ObjectId): ObjectFilter {
  // "Of the chosen type / color": the choice of the source (in play, resolving spell, otherwise last information).
  if (hasChosen(f)) f = withChosen(f, sourceId ? (s.objects[sourceId] ?? s.lki[sourceId]) : undefined);
  if (sharesSourceColor(f)) f = withSourceColors(s, f, sourceId);
  return resolveCompare(s, f, sourceId);
}

/** Does the filter (or one of its `not` / `anyOf`) ask for "shares a color with [the source]"? */
function sharesSourceColor(f: ObjectFilter): boolean {
  return (
    (f.shares?.what === "color" && f.shares.with.kind === "self") ||
    (!!f.not && sharesSourceColor(f.not)) ||
    !!f.anyOf?.some(sharesSourceColor)
  );
}

/**
 * "That shares a color with [the source]" outside a resolution (intimidate, 702.13: "except by artifact creatures
 * and/or creatures that share a color with it"): the source's colors now; colorless, nothing matches.
 */
function withSourceColors(s: GameState, f: ObjectFilter, sourceId?: ObjectId): ObjectFilter {
  let out = f;
  if (f.shares?.what === "color" && f.shares.with.kind === "self") {
    const { shares: _, ...rest } = f;
    const colors = sourceId && s.objects[sourceId] ? chars(s, sourceId).colors : (s.lki[sourceId ?? ""]?.colors ?? []);
    out = colors.length ? { ...rest, colors: [...colors] } : { ...rest, not: {} };
  }
  if (out.not) out = { ...out, not: withSourceColors(s, out.not, sourceId) };
  if (out.anyOf) out = { ...out, anyOf: out.anyOf.map((x) => withSourceColors(s, x, sourceId)) };
  return out;
}

/** Filter applied to a card in any zone (graveyard, library, hand…). */
export function matchesCard(s: GameState, controller: PlayerId, id: ObjectId, f: ObjectFilter, sourceId?: ObjectId): boolean {
  const o = s.objects[id];
  if (!o) return false;
  f = resolveFilter(s, f, sourceId);
  // "another card": the dead source has become a new card in the graveyard, recognized by its physical identity
  // (Morcant's Loyalist: "return another target Elf card").
  if (f.other && sourceId && o.uid && o.uid === (s.objects[sourceId]?.uid ?? s.lki[sourceId]?.uid)) return false;
  // "put into a graveyard this turn": the object was created in its zone during this turn.
  if (f.enteredThisTurn && o.controlledSince !== s.turn.number) return false;
  // "put into a graveyard from the battlefield this turn" (Supper for Spiders).
  if (f.fromBattlefieldThisTurn && (o.arrivedFrom !== "battlefield" || o.controlledSince !== s.turn.number)) return false;
  // "milled this turn": put into the graveyard from the library during this turn (Raul, Tato Farmer).
  if (f.milledThisTurn && (o.zone !== "graveyard" || o.arrivedFrom !== "library" || o.controlledSince !== s.turn.number))
    return false;
  if (f.sameNameAs && !sameNameOnBattlefield(s, controller, id, f.sameNameAs, sourceId)) return false;
  // "creature card with no abilities": no rules text.
  if (f.noAbilities && (s.defs[o.defId]?.text ?? "").trim()) return false;
  if (f.adventure !== undefined && (s.defs[o.defId]?.layout === "adventure") !== f.adventure) return false;
  // Sub-filters: evaluated like the filter itself (fields specific to the object, chosen values), not only on the view.
  if (f.anyOf && !f.anyOf.some((g) => matchesCard(s, controller, id, g, sourceId))) return false;
  if (f.not && matchesCard(s, controller, id, f.not, sourceId)) return false;
  return (
    matchesView(snapshot(s, id), { ...f, controller: undefined, anyOf: undefined, not: undefined }, controller, sourceId) &&
    (f.controller === undefined || (f.controller === "you" ? o.owner === controller : o.owner !== controller))
  );
}

/** Another permanent matching `like` has the same name as the object (`ObjectFilter.sameNameAs`). */
function sameNameOnBattlefield(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  like: ObjectFilter,
  sourceId?: ObjectId,
): boolean {
  const name = chars(s, id).name;
  return s.battlefield.some(
    (x) => x !== id && shareName(chars(s, x).name, name) && matchesObjectFilter(s, controller, x, like, sourceId),
  );
}

export function matchesObjectFilter(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  f: ObjectFilter,
  sourceId?: ObjectId,
): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield") return false;
  if (f.attackedThisTurn && !attackedThisTurn(s, id)) return false;
  if (f.attached === "toHost") {
    const host = sourceId ? s.objects[sourceId]?.attachedTo : undefined;
    if (!host || o.attachedTo !== host) return false;
  }
  // "entered this turn" (the arrival, not a change of control: Renet, Temporal Apprentice); "under your control" is
  // the `controller` filter (Cloudspire Coordinator).
  if (f.enteredThisTurn && !enteredThisTurn(s, id)) return false;
  // Treacherous Greed: "a creature that dealt damage this turn".
  if (f.dealtDamageThisTurn && !dealtDamageThisTurn(s, id)) return false;
  if (f.disguise !== undefined && !!castOption(s.defs[o.defId], "faceDown") !== f.disguise) return false;
  // Fractal Tender: "if you put a counter on this creature this turn".
  if (f.countersPutByYouThisTurn && !countersPutBy(countersPutThisTurn(s, id), controller, f.countersPutByYouThisTurn))
    return false;
  if (f.crew === "source") {
    const c = sourceId ? s.objects[sourceId]?.crewedBy : undefined;
    if (!c || c.turn !== s.turn.number || !c.ids.includes(id)) return false;
  }
  // "other than the enchanted creature" (Sporogenic Infection, Saw); "the equipped creature / the enchanted land".
  if (f.attached === "notHost" && sourceId && s.objects[sourceId]?.attachedTo === id) return false;
  if (f.attached === "host" && (!sourceId || s.objects[sourceId]?.attachedTo !== id)) return false;
  if (f.sameNameAs && !sameNameOnBattlefield(s, controller, id, f.sameNameAs, sourceId)) return false;
  // Sub-filters: evaluated like the filter itself (fields specific to the object, chosen values), not only on the view.
  if (f.anyOf && !f.anyOf.some((g) => matchesObjectFilter(s, controller, id, g, sourceId))) return false;
  if (f.not && matchesObjectFilter(s, controller, id, f.not, sourceId)) return false;
  return matchesView(
    snapshot(s, id),
    resolveFilter(s, { ...f, anyOf: undefined, not: undefined }, sourceId),
    controller,
    sourceId,
  );
}

/** Does the source match the filter of a player's hexproof "from [filter]"? */
function hexproofFromSource(s: GameState, f: ObjectFilter, player: PlayerId, sourceId?: ObjectId): boolean {
  const v = sourceId ? sourceView(s, sourceId) : undefined;
  return !!v && matchesView(v, f, player);
}

/** Card exiled face up matching the filter ("exiled card" target, warped card considered). */
export function matchesExiled(s: GameState, controller: PlayerId, id: ObjectId, ex: ExiledFilter, sourceId?: ObjectId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "exile" || o.faceDown || o.cardCopy || o.preparedFor) return false;
  // "With warp" (Blade of the Swarm), "with flashback" (Sorceress's Schemes): the card has that cost.
  if (ex.withCost && !castOption(s.defs[o.defId], ex.withCost)) return false;
  if (ex.warped && o.exiledVia?.kind !== "warp") return false;
  if (ex.own !== undefined && (o.owner === controller) !== ex.own) return false;
  if (
    ex.linked &&
    !(sourceId && ((s.objects[sourceId]?.linked ?? []).includes(id) || s.objects[sourceId]?.linkedUids?.includes(o.uid)))
  )
    return false;
  return !ex.filter || matchesCard(s, controller, id, { ...ex.filter, controller: undefined }, sourceId);
}

/**
 * Player who holds a target: a player themselves; the controller of a permanent, a spell or an ability; the owner of
 * a card elsewhere (graveyard, exile).
 */
export function holderOf(s: GameState, id: string): PlayerId {
  if (s.players[id]) return id;
  const o = s.objects[id];
  if (o) return o.zone === "battlefield" || o.zone === "stack" ? o.controller : o.owner;
  return s.stack.find((x) => x.id === id)?.controller ?? id;
}

export function isLegalTarget(s: GameState, controller: PlayerId, spec: TargetSpec, id: string, sourceId?: ObjectId): boolean {
  // "… that player controls", "from that player's graveyard" (`concreteSpec`).
  if (spec.ofPlayers && !spec.ofPlayers.includes(holderOf(s, id))) return false;
  const player = s.players[id];
  if (player) {
    if (player.lost || !spec.filter.players) return false;
    // "You have hexproof" (Crystal Barricade).
    if (
      id !== controller &&
      playerStatics(s, id, "hexproof").some(
        ({ ab }) => ab.hexproof === true || (typeof ab.hexproof === "object" && hexproofFromSource(s, ab.hexproof, id, sourceId)),
      )
    )
      return false;
    // Player protection (702.16): from their opponents, or from everything (even their own spells).
    if (playerProtectedFrom(s, id, controller, sourceId)) return false;
    if (spec.filter.players === "you") return id === controller;
    if (spec.filter.players === "opponent") return id !== controller;
    return true;
  }
  // Spell or ability on the stack ("target spell or ability with a single target").
  const stackItem = s.stack.find((x) => x.id === id);
  // "target activated or triggered ability": spells fall under the `spells` filter (Louisoix's Sacrifice).
  const only = spec.filter.stackItems?.only;
  const onlyTriggered = only === "triggered";
  if (
    stackItem &&
    spec.filter.stackItems &&
    !((only === "abilities" || onlyTriggered) && stackItem.kind === "spell") &&
    !(only === "spells" && stackItem.kind !== "spell") &&
    !(
      onlyTriggered &&
      stackItem.abilityIndex >= 0 &&
      s.defs[stackItem.sourceDefId]?.abilities[stackItem.abilityIndex]?.kind !== "triggered" &&
      !stackItem.inline
    )
  ) {
    const si = spec.filter.stackItems;
    if (si.controller === "you" && stackItem.controller !== controller) return false;
    if (si.source) {
      const src =
        s.objects[stackItem.sourceId]?.zone === "battlefield" ? snapshot(s, stackItem.sourceId) : s.lki[stackItem.sourceId];
      if (!src || !matchesView(src, si.source, controller, sourceId)) return false;
    }
    const n = Object.values(stackItem.targets).flat().length;
    return !spec.filter.stackItems.singleTarget || n === 1;
  }
  const o = s.objects[id];
  if (o && o.zone === "stack") {
    // Spell on the stack (the object's id is that of the stack item).
    const f = spec.filter.spells;
    const item = s.stack.find((x) => x.id === id && x.kind === "spell");
    if (!f || !item || !matchesView(snapshot(s, id), f, controller, sourceId)) return false;
    const tg = spec.filter.spellsTargeting;
    return !tg || Object.values(item.targets).some((ids) => ids.some((t) => matchesObjectFilter(s, controller, t, tg, sourceId)));
  }
  if (o && o.zone === "exile") {
    const ex = spec.filter.exiled;
    return !!ex && matchesExiled(s, controller, id, ex, sourceId);
  }
  if (o && o.zone === "graveyard") {
    const cards = spec.filter.cards;
    // Ground Seal: "cards in graveyards can't be the targets of spells or abilities".
    if (!cards || playerStatic(s, controller, "cantTargetGraveyardCards")) return false;
    if (cards.whose === "you" && o.owner !== controller) return false;
    if (cards.whose === "opponent" && o.owner === controller) return false;
    return matchesCard(s, controller, id, { ...cards.filter, controller: undefined }, sourceId);
  }
  if (!spec.filter.objects || !matchesObjectFilter(s, controller, id, spec.filter.objects, sourceId)) return false;
  // Hexproof: can't be the target of spells or abilities its opponents control.
  // Nowhere to Run: opposing creatures can be targeted as though they didn't have hexproof.
  if (
    obj(s, id).controller !== controller &&
    hasKeyword(s, id, "hexproof") &&
    !(chars(s, id).types.includes("Creature") && playerStatic(s, controller, "ignoreOpponentsHexproofWard"))
  )
    return false;
  // Shroud (702.18): can't be the target of any spell or ability, even its controller's.
  if (hasKeyword(s, id, "shroud")) return false;
  // Protection from [filter] (702.16b), hexproof from [filter] if the source is an opponent's.
  if (protectedFrom(s, id, sourceId ? sourceView(s, sourceId) : undefined, obj(s, id).controller !== controller)) return false;
  return true;
}

export function legalTargets(s: GameState, controller: PlayerId, spec: TargetSpec, sourceId?: ObjectId): string[] {
  const out: string[] = [];
  const ok = (id: string) => isLegalTarget(s, controller, spec, id, sourceId);
  if (spec.filter.players) for (const p of s.playerOrder) if (ok(p)) out.push(p);
  if (spec.filter.objects) for (const id of s.battlefield) if (ok(id)) out.push(id);
  if (spec.filter.cards) for (const p of s.playerOrder) for (const id of s.players[p]?.graveyard ?? []) if (ok(id)) out.push(id);
  if (spec.filter.exiled) for (const id of s.exile) if (ok(id)) out.push(id);
  if (spec.filter.spells)
    for (const item of s.stack) if (item.kind === "spell" && item.id !== sourceId && ok(item.id)) out.push(item.id);
  if (spec.filter.stackItems)
    for (const item of s.stack) if (item.id !== sourceId && !out.includes(item.id) && ok(item.id)) out.push(item.id);
  return out;
}

/** Checks a complete choice of targets for a list of specs. */
export function validateTargets(
  s: GameState,
  controller: PlayerId,
  specs: TargetSpec[],
  chosen: Record<string, string[]> = {},
  opts: { kicked?: boolean; sourceId?: ObjectId; x?: number } = {},
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const spec of specs) {
    const ids = chosen[spec.id] ?? [];
    // "X target creatures": exactly X targets ("up to X": at most X, checked below).
    if (spec.countX === true && ids.length !== Math.max(0, opts.x ?? 0))
      throw new RulesError(msg("{n} target(s) required", { n: opts.x ?? 0 }));
    const max = spec.countX ? Math.max(0, opts.x ?? 0) : (opts.kicked && spec.kickedCount) || spec.count || 1;
    const hostSpec = spec.attachedToTarget;
    if (hostSpec && ids.some((id) => !(chosen[hostSpec] ?? []).includes(s.objects[id]?.attachedTo ?? ""))) {
      throw new RulesError(msg("The target must be attached to the other target"));
    }
    for (const other of spec.otherThan ?? []) {
      if (ids.some((id) => (chosen[other] ?? []).includes(id))) throw new RulesError(msg("These targets must be different"));
    }
    if (ids.length > max)
      throw new RulesError(max === 1 ? msg('Only one target per word "target"') : msg("{n} targets at most", { n: max }));
    if (new Set(ids).size !== ids.length) throw new RulesError(msg("Same target chosen twice"));
    // "X targets" with X = 0: no target (601.2c).
    // "between zero and N targets" (`minCount: 0`): no target allowed, as for "up to N".
    if (ids.length === 0 && !spec.optional && spec.minCount !== 0 && !(spec.countX && max === 0))
      throw new RulesError(msg("Missing target: {target}", { target: spec.label ?? spec.id }));
    const min = spec.minCount ?? max;
    if (!spec.optional && !spec.kickedCount && ids.length < min)
      throw new RulesError(min === max ? msg("{n} targets required", { n: max }) : msg("At least {n} target(s)", { n: min }));
    // Gift promised or kicker: another filter ("instead, target nonland permanent").
    const legalSpec = opts.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
    for (const id of ids)
      if (!isLegalTarget(s, controller, legalSpec, id, opts.sourceId)) throw new RulesError(msg("Illegal target: {id}", { id }));
    const holders = ids.map((id) => s.objects[id]?.[s.objects[id]?.zone === "battlefield" ? "controller" : "owner"] ?? id);
    // "Target player … target cards from their graveyard": the targets are held by a target of another word.
    const of = spec.of;
    if (of?.kind === "target") {
      const allowed = (chosen[of.id] ?? []).map((x) => holderOf(s, x));
      if (ids.some((id) => !allowed.includes(holderOf(s, id))))
        throw new RulesError(msg("The targets must belong to the player chosen for the other target"));
    }
    if (spec.samePlayer && new Set(holders).size > 1) throw new RulesError(msg("The targets must belong to the same player"));
    if (spec.differentPlayers && new Set(holders).size !== holders.length)
      throw new RulesError(msg("The targets must be controlled by different players"));
    if (spec.distinct === "name" && firstOfEachName(ids, (id) => snapshot(s, id).name).length !== ids.length)
      throw new RulesError(msg("The targets must have different names"));
    if (spec.distinct === "manaValue" && new Set(ids.map((id) => snapshot(s, id).manaValue)).size !== ids.length)
      throw new RulesError(msg("The targets must have different mana values"));
    if (spec.shareCreatureType && ids.length > 1 && !shareCreatureType(s, ids))
      throw new RulesError(msg("The targets must share a creature type"));
    if (spec.maxTotalManaValue !== undefined) {
      const total = ids.reduce((n, id) => n + (snapshot(s, id).manaValue ?? 0), 0);
      if (total > spec.maxTotalManaValue)
        throw new RulesError(msg("Total mana value greater than {n}", { n: spec.maxTotalManaValue }));
    }
    result[spec.id] = ids;
  }
  return result;
}

/** Do the objects share a creature type? A changeling (or "all types") has them all. */
export function shareCreatureType(s: GameState, ids: ObjectId[]): boolean {
  const views = ids.map((id) => snapshot(s, id));
  const [first, ...rest] = views.filter((v) => !hasAllCreatureTypes(v));
  // Only changelings: they share all types. Otherwise, a type of the first one that the others have too.
  if (!first) return true;
  return first.subtypes.some((t) => isCreatureType(t) && rest.every((v) => v.subtypes.includes(t)));
}
