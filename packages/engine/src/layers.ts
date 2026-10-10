/**
 * Layer system (613): computed characteristics of objects.
 *
 * All characteristics of the battlefield are computed in one pass, layer by layer, the effects of each layer being
 * applied in timestamp order:
 *   4 types · 5 colors · 6 abilities · 7b set P/T · 7c modifications and counters · 7d switch.
 * Effects come from two sources: continuous effects from resolutions (s.effects, locked set of objects) and static
 * abilities of permanents (set re-evaluated at each computation).
 *
 * The result is cached per state and per `s.version`, which the engine increments at each change that can affect
 * characteristics (see `bump`). The fuzz checks that the cache never diverges.
 * Layer 1: copy of a definition (`copyOf`), for a duration, with its copiable exceptions (707.9b). Layer 2 (control)
 * is computed separately (`control.ts`). Dependencies (613.8): by fixed point (`computeBattlefield`); limit: a static
 * granted by another static isn't handled.
 */
import { capReached, MAX_LAYER_PASSES } from "./limits";
import { manaValue } from "./mana";
import { hasName, isCreatureType, printedName, shareName } from "./names";
import { grantedSpellKeywords } from "./stack";
import { commandZoneAbilities, counterPT, obj } from "./state";
import { playerStatics } from "./statics";
import { ALL_CREATURE_TYPES, hasChosen, matchesObjectFilter, matchesView, withChosen } from "./targets";
import { msg } from "./text";
import { checkCondition } from "./triggers";
import { countersPutThisTurn, countTurnEvents, objectDidThisTurn, onTurnLogged } from "./turnlog";
import type {
  AbilityDef,
  Amount,
  BlockRule,
  CardDef,
  CardType,
  Color,
  GameObject,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PlayerId,
  PowerRule,
  ProtectionRule,
  Ref,
} from "./types";
import { BASIC_LAND_TYPES, LAND_TYPES, PERMANENT_TYPES } from "./types";

export interface Characteristics {
  name: string;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  toughness: number;
  /** Base power: after layer 7b (set P/T), before counters and modifications. */
  basePower?: number;
  keywords: Keyword[];
  /** Effective non-keyword abilities (empty if the object lost all its abilities). */
  abilities: AbilityDef[];
  /**
   * Abilities granted by the static ability of another permanent ("equipped creature has '…'"): the permanent that
   * grants each, by rank in `abilities` (Fishing Pole, Trusty Boomerang: `ref.grantor`, cost `grantor`).
   */
  grantors?: Record<number, ObjectId>;
  /** Blocking rules ("can't be blocked by…"), as abilities. */
  blockRules: BlockRule[];
  /** Protections and hexproofs "from [filter]". */
  protections: ProtectionRule[];
  /** "Uses its toughness for" (combat damage, crew, station). */
  powerRules: PowerRule[];
  controller: PlayerId;
}

/** 122.1b: counters that grant a keyword (the counter name is that of the engine keyword). */
export const KEYWORD_COUNTERS: Record<string, Keyword> = {
  flying: "flying",
  firstStrike: "firstStrike",
  doubleStrike: "doubleStrike",
  deathtouch: "deathtouch",
  hexproof: "hexproof",
  indestructible: "indestructible",
  lifelink: "lifelink",
  menace: "menace",
  reach: "reach",
  trample: "trample",
  vigilance: "vigilance",
  haste: "haste",
  decayed: "decayed",
};

/** A blocking rule that designates "you", the player or the object of the event (to be fixed, `resolveBlockRules`). */
export function blockRulePlaceholder(r: BlockRule): boolean {
  return (
    r.cantAttackPlayer === "you" ||
    r.cantAttackPlayer === "owner" ||
    r.goadedBy === "you" ||
    r.mustAttackPlayer === "eventPlayer" ||
    r.mustBlockAttacker === "eventObject" ||
    typeof r.cantBeBlockedByPlayer === "object" ||
    r.cantBeBlockedByWeakerThan === "source"
  );
}

/**
 * Fixes the players and objects designated in a script: "you" becomes the controller of the source (static) or of the
 * effect (resolution), the player and the object of the event those of the trigger event. Without an event, the
 * matching requirement disappears.
 */
export function resolveBlockRules(
  rules: BlockRule[],
  you: PlayerId,
  event?: { player?: PlayerId; objectId?: ObjectId },
  player?: (r: Ref) => PlayerId | undefined,
  sourceId?: ObjectId,
  owner?: PlayerId,
): BlockRule[] {
  return rules.map((r) => {
    if (!blockRulePlaceholder(r)) return r;
    const out: BlockRule = { ...r };
    if (r.cantBeBlockedByWeakerThan === "source") out.cantBeBlockedByWeakerThan = sourceId;
    if (typeof r.cantBeBlockedByPlayer === "object") out.cantBeBlockedByPlayer = player?.(r.cantBeBlockedByPlayer);
    if (r.cantAttackPlayer === "you") out.cantAttackPlayer = you;
    if (r.cantAttackPlayer === "owner") out.cantAttackPlayer = owner;
    if (r.goadedBy === "you") out.goadedBy = you;
    if (r.mustAttackPlayer === "eventPlayer") out.mustAttackPlayer = event?.player;
    if (r.mustBlockAttacker === "eventObject") out.mustBlockAttacker = event?.objectId;
    return out;
  });
}

/** Invalidates the characteristics cache. */
export function bump(s: GameState): void {
  s.version += 1;
}

/** 604.3 / 613.4a: P/T defined by an ability ("equal to the number of cards in opponents' graveyards"). */
/** Filter evaluated on the printed characteristics (types, subtypes, "one of"): no recursion into the layers. */
/** Total (printed) power of the linked cards. */
export function linkedTotalPower(s: GameState, linked: ObjectId[] | undefined): number {
  return (linked ?? []).reduce((n, id) => n + Math.max(0, s.defs[s.objects[id]?.defId ?? ""]?.power ?? 0), 0);
}

/** (Printed) colors among the linked cards. */
export function linkedColors(s: GameState, linked: ObjectId[] | undefined): Color[] {
  return [...new Set((linked ?? []).flatMap((id) => s.defs[s.objects[id]?.defId ?? ""]?.colors ?? []))];
}

function printedMatch(d: Pick<CardDef, "types" | "subtypes"> | undefined, f: ObjectFilter): boolean {
  if (!d) return false;
  if (f.types?.length && !f.types.some((t) => d.types.includes(t))) return false;
  if (f.notTypes?.some((t) => d.types.includes(t))) return false;
  if (f.subtype && !d.subtypes.includes(f.subtype)) return false;
  if (f.notSubtype && d.subtypes.includes(f.notSubtype)) return false;
  // Super-Adaptoid: "the number of legendary creatures you control".
  if (f.legendary && !(d as { supertypes?: string[] }).supertypes?.includes("Legendary")) return false;
  if (f.anySubtype && !f.anySubtype.some((t) => d.subtypes.includes(t))) return false;
  if (f.anyOf && !f.anyOf.some((g) => printedMatch(d, g))) return false;
  if (f.permanent && !d.types.some((t) => PERMANENT_TYPES.includes(t))) return false;
  return true;
}

/** A P/T value defined by an ability that reads the permanents (and therefore depends on the layers, 613.8). */
function readsBattlefield(a: Amount): boolean {
  if (typeof a === "number") return false;
  if (a.kind === "sum") return a.of.some(readsBattlefield);
  if (a.kind === "aggregate") return !a.of && !a.zone;
  return a.kind === "count" && (!a.zone || a.zone === "battlefield");
}

/** Types and subtypes of a permanent during the computation: those of the previous pass (613.8), otherwise printed. */
function typesOf(s: GameState, id: ObjectId): { types: CardType[]; subtypes: string[] } | undefined {
  return provisional?.get(id) ?? s.defs[obj(s, id).defId];
}

/**
 * Amounts `cdaValue` can compute during the layer computation (P/T defined by an ability, "for each" bonuses), by key
 * (`cdaKey`: the kind, or for an aggregate its function, its property and its objects). Any other amount would be 0:
 * `cards/test/cda.test.ts` checks that no card uses one (PLAN-C, lot C10).
 */
export const CDA_AMOUNT_KINDS: ReadonlySet<string> = new Set([
  "sum",
  // Omnath, Locus of the Void: its controller's unspent mana.
  "manaInPool",
  // Dark Matter Manipulator: "for every seven cards"; Samut, the Driving Force: your speed.
  "div",
  "speed",
  "graveyardsWithAtLeast",
  "turnEvents",
  "count",
  // Fabricate: cards exiled to craft this permanent (Mastercraft Raptor, Sunbird Effigy).
  "aggregate:sum:power:linked",
  "aggregate:distinct:color:linked",
  // Tarmogoyf: card types among cards in all graveyards.
  "aggregate:distinct:cardType:graveyard:all",
  // Domain; Vivid (Squawkroaster); Toph, the Blind Bandit; Emissary Escort.
  "aggregate:distinct:basicLandType",
  "aggregate:distinct:color",
  "aggregate:sum:counters",
  "aggregate:max:manaValue",
  // Dragon Man, Reformed Robot: the greatest mana value among your permanents and graveyard cards.
  "max",
  "aggregate:max:manaValue:graveyard:you",
  // Unlicensed Hearse: number of cards exiled with it (linked cards still in exile).
  "refCount:linked",
]);

/** Key of an amount for `CDA_AMOUNT_KINDS`. */
export function cdaKey(a: Exclude<Amount, number>): string {
  if (a.kind === "refCount") return `refCount:${a.ref.kind}`;
  if (a.kind !== "aggregate") return a.kind;
  const objects = a.of ? [a.of.kind] : a.zone ? [a.zone, a.whose ?? "you"] : [];
  return ["aggregate", a.fn, a.property, ...objects].join(":");
}

/** Aggregates computable during the layer computation: printed characteristics, or of the previous pass (613.8). */
function cdaAggregate(s: GameState, o: GameObject, a: Extract<Amount, { kind: "aggregate" }>): number {
  const filter = a.filter ?? {};
  // Permanents of the filter, seen from the controller of `o` (types of the previous pass, otherwise printed).
  const permanents = () =>
    s.battlefield.filter((id) => {
      const x = obj(s, id);
      if (filter.other && id === o.id) return false;
      if (filter.controller === "you" && x.controller !== o.controller) return false;
      return printedMatch(typesOf(s, id), filter);
    });
  switch (cdaKey(a)) {
    case "aggregate:sum:power:linked":
      return linkedTotalPower(s, o.linked);
    case "aggregate:distinct:color:linked":
      return linkedColors(s, o.linked).length;
    case "aggregate:distinct:cardType:graveyard:all": {
      const types = new Set<string>();
      for (const p of s.playerOrder)
        for (const id of s.players[p]?.graveyard ?? []) for (const t of s.defs[obj(s, id).defId]?.types ?? []) types.add(t);
      return types.size;
    }
    case "aggregate:distinct:basicLandType": {
      // Domain: subtypes of the controller's lands (previous pass, otherwise printed).
      const subtypes = new Set(permanents().flatMap((id) => typesOf(s, id)?.subtypes ?? []));
      return BASIC_LAND_TYPES.filter((t) => subtypes.has(t)).length;
    }
    case "aggregate:distinct:color": {
      // Printed colors (the modified colors of the other permanents aren't known yet).
      const colors = new Set<string>();
      for (const id of permanents()) {
        const x = obj(s, id);
        for (const c of s.defs[x.faceDefId ?? x.defId]?.colors ?? []) colors.add(c);
      }
      return colors.size;
    }
    case "aggregate:sum:counters":
      return permanents().reduce((n, id) => n + Math.max(0, obj(s, id).counters[a.counter ?? ""] ?? 0), 0);
    case "aggregate:max:manaValue":
      return Math.max(0, ...permanents().map((id) => manaValue(s.defs[obj(s, id).defId]?.manaCost)));
    case "aggregate:max:manaValue:graveyard:you":
      return Math.max(
        0,
        ...(s.players[o.controller]?.graveyard ?? [])
          .map((id) => s.defs[obj(s, id).defId])
          .filter((d) => printedMatch(d, filter))
          .map((d) => manaValue(d?.manaCost)),
      );
  }
  return 0;
}

function cdaValue(s: GameState, o: GameObject, a: Amount): number {
  if (typeof a === "number") return a;
  if (a.kind === "sum") return a.of.reduce<number>((n, x) => n + cdaValue(s, o, x), 0);
  if (a.kind === "max") return Math.max(0, ...a.of.map((x) => cdaValue(s, o, x)));
  if (a.kind === "div") return (a.up ? Math.ceil : Math.floor)(cdaValue(s, o, a.of) / a.by);
  if (a.kind === "speed") return s.players[o.controller]?.speed ?? 0;
  // Master's Councillors: graveyards with N or more cards.
  if (a.kind === "graveyardsWithAtLeast")
    return s.playerOrder.filter((p) => !s.players[p]?.lost && (s.players[p]?.graveyard.length ?? 0) >= a.n).length;
  // Turn log (Duelist of the Mind: cards drawn this turn), seen from the controller.
  if (a.kind === "turnEvents" && !a.of) return countTurnEvents(s, a.query, o.controller);
  if (a.kind === "aggregate") return cdaAggregate(s, o, a);
  if (a.kind === "manaInPool") {
    const pl = s.players[o.controller];
    return pl ? Object.values(pl.manaPool).reduce((n, v) => n + v, 0) + (pl.restrictedMana?.length ?? 0) : 0;
  }
  if (a.kind === "refCount" && a.ref.kind === "linked")
    return (o.linked ?? []).filter((id) => s.objects[id]?.zone === "exile").length;
  // Unsupported kind (`CDA_AMOUNT_KINDS`): no card uses one (cards/test/cda.test.ts).
  if (a.kind !== "count") return 0;
  if (a.zone === "exile") {
    // Cosmogoyf: cards you own in exile.
    return s.exile.filter((id) => obj(s, id).owner === o.controller).length;
  }
  if (!a.zone || a.zone === "battlefield") {
    // "equal to the number of creatures you control" (types of the previous pass, otherwise printed).
    return s.battlefield.filter((id) => {
      const x = obj(s, id);
      if (a.filter.controller === "you" && x.controller !== o.controller) return false;
      return printedMatch(typesOf(s, id), a.filter);
    }).length;
  }
  const zone = a.zone;
  const players =
    a.whose === "all"
      ? s.playerOrder
      : a.whose === "opponents"
        ? s.playerOrder.filter((p) => p !== o.controller)
        : [o.controller];
  return players
    .filter((p) => !s.players[p]?.lost)
    .flatMap((p) => s.players[p]?.[zone] ?? [])
    .filter((id) => printedMatch(s.defs[obj(s, id).defId], a.filter)).length;
}

/**
 * Effective definition of an object: the one it copies (layer 1, most recent effect), otherwise its active face
 * (adventure cast, back face), otherwise its own.
 */
export function copiedDefId(s: GameState, id: ObjectId): string {
  let best: { t: number; def: string } | null = null;
  for (const e of s.effects) {
    if (e.copyOf && e.affected.includes(id) && (!best || e.timestamp > best.t)) best = { t: e.timestamp, def: e.copyOf };
  }
  // Copy carried by a static of an attached permanent (Assimilation Aegis: "equipped creature becomes a copy of the
  // exiled card"); timestamp of the static: that of the attachment (613.7e).
  for (const x of s.battlefield) {
    const src = s.objects[x];
    if (src?.attachedTo !== id) continue;
    const def = staticCopyOf(s, x);
    if (def && (!best || src.timestamp > best.t)) best = { t: src.timestamp, def };
  }
  const o = obj(s, id);
  return best?.def ?? o.faceDefId ?? o.defId;
}

/**
 * `copiedDefId` of the copied permanents, in one scan (same timestamp rules: the first most recent wins, effects before
 * attachment statics); a permanent absent from the table isn't a copy.
 */
export function copiedDefMap(s: GameState): Map<ObjectId, string> {
  const best = new Map<ObjectId, { t: number; def: string }>();
  for (const e of s.effects) {
    if (!e.copyOf) continue;
    for (const id of e.affected) {
      const b = best.get(id);
      if (!b || e.timestamp > b.t) best.set(id, { t: e.timestamp, def: e.copyOf });
    }
  }
  for (const x of s.battlefield) {
    const src = s.objects[x];
    if (!src?.attachedTo) continue;
    const def = staticCopyOf(s, x);
    if (!def) continue;
    const b = best.get(src.attachedTo);
    if (!b || src.timestamp > b.t) best.set(src.attachedTo, { t: src.timestamp, def });
  }
  return new Map([...best].map(([id, b]) => [id, b.def]));
}

/** Copies are in play (copy effect, or copy static of an attached permanent): otherwise `copiedDefId` is the face. */
export function copyingIn(s: GameState): boolean {
  return s.effects.some((e) => e.copyOf) || s.battlefield.some((x) => !!s.objects[x]?.attachedTo && !!staticCopyOf(s, x));
}

/** Fields of `LayerMods` that are lists (accumulated when modifications are merged). */
const LIST_MODS = [
  "addAbilities",
  "addTypes",
  "addSubtypes",
  "addSupertypes",
  "removeSupertypes",
  "addKeywords",
  "removeKeywords",
  "forbidKeywords",
  "addColors",
  "addBlockRules",
  "addProtections",
  "addPowerRules",
] as const satisfies (keyof LayerMods)[];

/** Merges modifications in order: lists accumulate, other values are replaced. */
export function mergeMods(...all: (LayerMods | undefined)[]): LayerMods | undefined {
  const out: Record<string, unknown> = {};
  for (const m of all) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (v === undefined) continue;
      if ((LIST_MODS as readonly string[]).includes(k))
        out[k] = [...new Set([...((out[k] as unknown[]) ?? []), ...(v as unknown[])])];
      else out[k] = v;
    }
  }
  return Object.keys(out).length ? (out as LayerMods) : undefined;
}

/**
 * 707.9b: copiable exceptions of a permanent (those of the copy effects that affect it, in timestamp order), which a
 * copy of this permanent takes over. Without the copied definition itself (`copiedDefId`).
 */
export function copiableExceptions(s: GameState, id: ObjectId | undefined): LayerMods | undefined {
  if (!id || s.objects[id]?.zone !== "battlefield") return undefined;
  const effects = s.effects.filter((e) => e.copiable && e.affected.includes(id)).sort((a, b) => a.timestamp - b.timestamp);
  if (effects.length === 0) return undefined;
  return mergeMods(
    ...effects.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !EFFECT_FIELDS.has(k))) as LayerMods),
  );
}

/** Fields of a continuous effect that aren't layer modifications (nor the copy itself). */
const EFFECT_FIELDS = new Set([
  "id",
  "timestamp",
  "affected",
  "duration",
  "until",
  "untilExiledUid",
  "whileSource",
  "copiable",
  "controller",
  "whileControlledBy",
  "whileAttached",
  "whileAffectedTapped",
  "whileAffectedHasCounter",
  "copyOf",
]);

/**
 * Mana value seen by filters: that of what the permanent copies (707.2); otherwise that of the card (the back face of a
 * transforming card has the mana value of the front face, 712.8e).
 */
function viewManaValue(s: GameState, id: ObjectId, o: GameObject): number {
  if (o.zone === "battlefield") {
    const copied = copiedDefId(s, id);
    if (copied !== (o.faceDefId ?? o.defId)) return manaValue(s.defs[copied]?.manaCost);
  }
  return manaValue(s.defs[o.defId]?.manaCost);
}

/** Like `viewManaValue`, according to the copy table of the scan context. */
function scanManaValue(s: GameState, copied: Map<ObjectId, string> | null, o: GameObject): number {
  const c = copied && o.zone === "battlefield" ? copied.get(o.id) : undefined;
  return manaValue(s.defs[c !== undefined && c !== (o.faceDefId ?? o.defId) ? c : o.defId]?.manaCost);
}

/** Definition copied by the permanent `source` is attached to, according to a `copyLinkedExile` static of `source`. */
function staticCopyOf(s: GameState, source: ObjectId): string | undefined {
  const d = s.defs[s.objects[source]?.defId ?? ""];
  if (!d?.abilities.some((ab) => ab.kind === "static" && ab.affects === "attached" && ab.mods.copyLinkedExile)) return undefined;
  const card = s.linkedExile.find((l) => l.sourceId === source)?.cards.find((c) => s.objects[c]?.zone === "exile");
  return card ? s.objects[card]?.defId : undefined;
}

function base(s: GameState, o: GameObject, defId = o.defId): Characteristics {
  const d = s.defs[defId];
  if (!d) throw new Error(`Unknown definition: ${o.defId}`);
  if (o.zone === "battlefield" && d.layout === "split" && d.faceDefs) return roomBase(o, d);
  if (o.faceDown) return faceDownBase(o, s.defs[o.faceDown.card]);
  const cda = d.cdaPT === undefined ? undefined : cdaValue(s, o, d.cdaPT);
  const cdaPower = d.cdaPower === undefined ? undefined : cdaValue(s, o, d.cdaPower);
  const cdaToughness = d.cdaToughness === undefined ? undefined : cdaValue(s, o, d.cdaToughness);
  const station = stationTraits(o, d);
  // Impending (702.176a): it isn't a creature as long as it has a time counter (nor its creature types).
  const impending = o.cast?.via === "impending" && o.zone === "battlefield" && (o.counters.time ?? 0) > 0;
  return {
    name: printedName(d),
    types: impending
      ? d.types.filter((t) => t !== "Creature")
      : station.creature && !d.types.includes("Creature")
        ? [...d.types, "Creature"]
        : [...d.types],
    subtypes: impending ? [] : [...d.subtypes],
    supertypes: [...d.supertypes],
    colors: [...d.colors],
    power: cdaPower ?? cda ?? d.power ?? 0,
    toughness: cdaToughness ?? cda ?? d.toughness ?? 0,
    keywords: [...new Set([...d.keywords, ...station.keywords])],
    abilities: levelAbilities(o, d),
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

/**
 * Layer 3 (612): the definition whose text box the object has instead of its own, if an effect gave it one (Deadpool,
 * Trading Card: the most recent exchange); otherwise `undefined`.
 */
export function textBoxOf(s: GameState, id: ObjectId): string | undefined {
  let best: { textOf?: string; timestamp: number } | undefined;
  for (const e of s.effects) if (e.textOf && e.affected.includes(id) && (!best || e.timestamp >= best.timestamp)) best = e;
  return best?.textOf;
}

/**
 * Layer 3 (612): the text box of another definition: its abilities, keywords and characteristic-defining abilities
 * (604.3: a P/T defined by an ability follows the text; without one, the printed P/T stays).
 */
function applyTextBox(s: GameState, c: Characteristics, o: GameObject, ownDefId: string, textDefId: string): void {
  const d = s.defs[textDefId];
  const own = s.defs[ownDefId];
  if (!d || !own) return;
  c.abilities = [...d.abilities];
  c.keywords = [...d.keywords];
  const hasCda = (x: CardDef) => x.cdaPT !== undefined || x.cdaPower !== undefined || x.cdaToughness !== undefined;
  if (!hasCda(d) && !hasCda(own)) return;
  const cda = d.cdaPT === undefined ? undefined : cdaValue(s, o, d.cdaPT);
  c.power = (d.cdaPower === undefined ? undefined : cdaValue(s, o, d.cdaPower)) ?? cda ?? own.power ?? 0;
  c.toughness = (d.cdaToughness === undefined ? undefined : cdaValue(s, o, d.cdaToughness)) ?? cda ?? own.toughness ?? 0;
}

/** Printed abilities of a permanent: levels reached by a Class (716), "Solved" abilities of a Case (719). */
export function levelAbilities(o: GameObject, d: CardDef): AbilityDef[] {
  if (o.zone !== "battlefield" || (!d.classLevels && !d.caseSolved && !d.station)) return d.abilities;
  const levels = (d.classLevels ?? []).slice(0, Math.max(0, (o.classLevel ?? 1) - 1)).flatMap((l) => l.abilities);
  // Station (702.184): abilities of the thresholds reached by the charge counters.
  const charge = o.counters.charge ?? 0;
  const station = (d.station?.thresholds ?? []).filter((t) => charge >= t.n).flatMap((t) => t.abilities);
  return [...d.abilities, ...levels, ...station, ...(o.solved ? (d.caseSolved ?? []) : [])];
}

/** Station: a Spacecraft becomes an artifact creature at its threshold; keywords of the thresholds reached. */
function stationTraits(o: GameObject, d: CardDef): { creature: boolean; keywords: Keyword[] } {
  const charge = o.counters.charge ?? 0;
  const st = d.station;
  if (!st || o.zone !== "battlefield") return { creature: false, keywords: [] };
  return {
    creature: st.creatureAt !== undefined && charge >= st.creatureAt,
    keywords: st.thresholds.filter((t) => charge >= t.n).flatMap((t) => t.keywords),
  };
}

/** Ward {2} of permanents face down by disguise or cloak (702.168b, 701.58a). */
export const FACE_DOWN_WARD: AbilityDef = {
  kind: "triggered",
  ward: true,
  trigger: { on: "becomesTarget", who: "self", by: "opponent" },
  targets: [],
  effects: [
    { op: "unlessPay", who: { kind: "eventPlayer" }, mana: { generic: 2, colored: {}, x: 0 }, skip: 1 },
    { op: "counter", what: { kind: "eventObject" } },
  ],
  label: msg("Ward {2}"),
};

/**
 * Face down (708.2): 2/2 creature without a name, color or subtype; ward {2} if applicable, and the special action
 * "turn face up" for each possible cost (disguise, mana cost of a creature card).
 */
function faceDownBase(o: GameObject, card?: CardDef): Characteristics {
  const fd = o.faceDown as NonNullable<GameObject["faceDown"]>;
  // Fugitive Codebreaker: "this [disguise] cost is reduced by {1} for each…" (the first cost, if there is one).
  const disguiseReduction = card?.disguise && card.disguiseReduction ? { generic: card.disguiseReduction } : undefined;
  return {
    name: "",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    power: 2,
    toughness: 2,
    keywords: fd.ward ? ["ward"] : [],
    abilities: [
      ...(fd.ward ? [FACE_DOWN_WARD] : []),
      ...fd.upCosts.map(
        (cost, i): AbilityDef => ({
          kind: "activated",
          cost: { mana: cost },
          targets: [],
          effects: [{ op: "turnFaceUp", what: { kind: "self" } }],
          specialAction: true,
          ...(i === 0 && disguiseReduction ? { reduction: disguiseReduction } : {}),
          label: msg("Turn face up"),
        }),
      ),
    ],
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

/**
 * Room on the battlefield (709.5c): name, colors and abilities of its unlocked doors; the card's "unlock" abilities
 * remain (special actions).
 */
function roomBase(o: GameObject, d: CardDef): Characteristics {
  const open = (d.faceDefs ?? []).filter((_, i) => o.unlocked?.includes(i));
  return {
    name: open.map((f) => f.name).join(" // "),
    types: [...d.types],
    subtypes: [...new Set([...d.subtypes, ...open.flatMap((f) => f.subtypes)])],
    supertypes: [...d.supertypes],
    colors: [...new Set(open.flatMap((f) => f.colors))],
    power: 0,
    toughness: 0,
    keywords: [...new Set(open.flatMap((f) => f.keywords))],
    abilities: [...d.abilities, ...open.flatMap((f) => f.abilities)],
    blockRules: [],
    protections: [],
    powerRules: [],
    controller: o.controller,
  };
}

interface Applied {
  timestamp: number;
  mods: LayerMods;
  /** Affected objects: fixed (resolution) or determined when the layer applies (static). */
  affected: ObjectId[] | { sourceId: ObjectId; controller: PlayerId; filter: "self" | "attached" | ObjectFilter };
}

/**
 * What the cached computation depends on (PLAN-C, lot C15): the tapped state of permanents (`tapped` filter, "as long as
 * it's tapped" condition) and the mana pool (`amount.manaInPool`). Tapping, untapping or paying mana invalidates the cache
 * only if a static ability, an effect or a P/T defined by an ability in force reads them (`bumpFor`).
 */
interface CacheDeps {
  tapped: boolean;
  mana: boolean;
  /** The turn log (`amount.turnEvents`, "attacked / dealt damage this turn" filters). */
  turnLog: boolean;
  /** The players' life (`perLife`, `lifeTotal`, `mostLife`, `opponentHasMore` of life). */
  life: boolean;
  /** "As long as it hasn't dealt (combat) damage yet" (`sourceDealtDamage`). */
  dealt: boolean;
  /** Declared blocks (`blocked` and `blocking` filters: attacker blocked or not, blocker). */
  blocks: boolean;
}
const noDeps = (): CacheDeps => ({ tapped: false, mana: false, turnLog: false, life: false, dealt: false, blocks: false });
const cache = new WeakMap<GameState, { key: string; map: Map<ObjectId, Characteristics>; deps: CacheDeps }>();
const depsMemo = new WeakMap<object, CacheDeps>();

/**
 * State copy (`cloneState`): the copy takes over the cache of the original (PLAN-S, P1). It stays validated by its key
 * (version, turn, step): a modification of the copy that advances the version invalidates it as before. Cached
 * characteristics are never modified by those who read them.
 */
export function carryLayerCache(from: GameState, to: GameState): void {
  const hit = cache.get(from);
  if (hit) cache.set(to, hit);
}

function scanDeps(x: unknown, out: CacheDeps): void {
  if (Array.isArray(x)) {
    for (const v of x) scanDeps(v, out);
    return;
  }
  if (!x || typeof x !== "object") {
    // The mana pool: "as long as you have N mana" condition or "unspent mana" amount (Omnath).
    if (x === "manaInPool") out.mana = true;
    if (x === "turnEvents") out.turnLog = true;
    // To be safe, any "life" value (`opponentHasMore` of life, granted "gain life" trigger).
    if (x === "life" || x === "lifeTotal" || x === "mostLife") out.life = true;
    if (x === "sourceDealtDamage") out.dealt = true;
    return;
  }
  for (const [k, v] of Object.entries(x)) {
    // A key without a value reads nothing (`perAmount: undefined`, always written by `staticAbility`).
    if (v === undefined) continue;
    if (k === "tapped" || k === "whileSourceTapped") out.tapped = true;
    if (k === "attackedThisTurn" || k === "dealtDamageThisTurn" || k === "countersPutByYouThisTurn") out.turnLog = true;
    if (k === "perLife") out.life = true;
    if (k === "blocked" || k === "blocking") out.blocks = true;
    scanDeps(v, out);
  }
}

/** Dependencies of an immutable definition (ability, card definition), memoized. */
function depsOf(x: object, pick?: (x: object) => unknown): CacheDeps {
  const hit = depsMemo.get(x);
  if (hit) return hit;
  const out = noDeps();
  scanDeps(pick ? pick(x) : x, out);
  depsMemo.set(x, out);
  return out;
}

const cdaOf = (d: object) => {
  const c = d as CardDef;
  return [c.cdaPT, c.cdaPower, c.cdaToughness];
};

function cacheDeps(s: GameState, map: Map<ObjectId, Characteristics>): CacheDeps {
  const out = noDeps();
  const merge = (d: CacheDeps) => {
    out.tapped ||= d.tapped;
    out.mana ||= d.mana;
    out.turnLog ||= d.turnLog;
    out.life ||= d.life;
    out.dealt ||= d.dealt;
    out.blocks ||= d.blocks;
  };
  for (const e of s.effects) scanDeps(e, out);
  const copied = copyingIn(s) ? copiedDefMap(s) : null;
  for (const [id, c] of map) {
    for (const ab of c.abilities) if (ab.kind === "static") merge(depsOf(ab));
    const o = s.objects[id];
    for (const defId of o ? [o.defId, o.faceDefId, copied?.get(id) ?? o.faceDefId ?? o.defId] : []) {
      const d = defId ? s.defs[defId] : undefined;
      if (d) merge(depsOf(d, cdaOf));
    }
  }
  for (const p of s.playerOrder)
    for (const id of s.players[p]?.command ?? [])
      for (const ab of commandZoneAbilities(s, id)) if (ab.kind === "static") merge(depsOf(ab));
  return out;
}

const cacheKey = (s: GameState) => `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;

/**
 * Invalidates the layer cache only if it depends on this aspect of the state (tapping, mana pool); an already stale
 * cache is stale anyway.
 */
export function bumpFor(s: GameState, dep: keyof CacheDeps): void {
  const hit = cache.get(s);
  if (hit && hit.key === cacheKey(s) && !hit.deps[dep]) return;
  bump(s);
}
onTurnLogged((s) => bumpFor(s, "turnLog"));
let computing = false;
/** Characteristics of the previous pass (613.8), read during the computation instead of the printed characteristics. */
let provisional: Map<ObjectId, Characteristics> | null = null;
/** Reads of a permanent's characteristics during the computation: a condition that makes none doesn't depend on the layers. */
let reads = 0;
/** Views of the permanents during a collection of statics (the characteristics read don't change during it). */
let viewCache: Map<ObjectId, LkiSnapshot> | null = null;
/**
 * Scan context of a frozen state (collection of statics, layers, sources of triggers): equipped and enchanted
 * permanents, copied definitions (`copied`, absent without a copy: the mana value is then that of the card).
 */
let scan: { equipped: Set<ObjectId>; enchanted: Map<ObjectId, PlayerId[]>; copied: Map<ObjectId, string> | null } | null = null;

function scanOf(s: GameState): NonNullable<typeof scan> {
  return {
    equipped: new Set(
      s.battlefield.flatMap((x) => {
        const e = s.objects[x];
        return e?.attachedTo && s.defs[e.defId]?.subtypes.includes("Equipment") ? [e.attachedTo] : [];
      }),
    ),
    enchanted: enchantedMap(s),
    copied: copyingIn(s) ? copiedDefMap(s) : null,
  };
}

/**
 * Runs `fn` with the scan context of `s` computed once: the views built during `fn` (`snapshot`) don't redo these
 * scans of the battlefield. `s` must not change during `fn`.
 */
export function withScan<T>(s: GameState, fn: () => T): T {
  const prev = scan;
  scan = scanOf(s);
  try {
    return fn();
  } finally {
    scan = prev;
  }
}

/** Controllers of the Auras attached to each permanent (printed subtypes: an Aura doesn't lose that subtype). */
function enchantedMap(s: GameState): Map<ObjectId, PlayerId[]> {
  const out = new Map<ObjectId, PlayerId[]>();
  for (const x of s.battlefield) {
    const a = s.objects[x];
    if (!a?.attachedTo || !s.defs[a.defId]?.subtypes.includes("Aura")) continue;
    out.set(a.attachedTo, [...(out.get(a.attachedTo) ?? []), a.controller]);
  }
  return out;
}

/** Blockers have been declared (509.1h): from the end of their declaration to the end of combat. */
export function blockersDeclared(s: GameState): boolean {
  const c = s.combat;
  if (!c || c.blockQueue.length > 0 || c.pendingBlocks) return false;
  if (s.turn.step === "declareBlockers") return s.pending?.kind !== "declareBlockers";
  return s.turn.step === "firstStrikeDamage" || s.turn.step === "combatDamage" || s.turn.step === "endCombat";
}

/** Attacker blocked (`true`), unblocked once blockers are declared (`false`), otherwise `undefined` (`blocked` filter). */
function blockedState(s: GameState, id: ObjectId): boolean | undefined {
  const a = s.combat?.attackers.find((x) => x.id === id);
  if (!a) return undefined;
  return a.blocked ? true : blockersDeclared(s) ? false : undefined;
}

/** `defender`: what the object is attacking (player or planeswalker), if it is attacking. */
function view(s: GameState, id: ObjectId, c: Characteristics, o: GameObject, defender: string | undefined): LkiSnapshot {
  return {
    id,
    defId: o.defId,
    owner: o.owner,
    controller: c.controller,
    types: c.types,
    subtypes: c.subtypes,
    supertypes: c.supertypes,
    colors: c.colors,
    power: c.power,
    toughness: c.toughness,
    basePower: c.basePower,
    keywords: c.keywords,
    isToken: o.isToken,
    countersPutThisTurn: countersPutThisTurn(s, id),
    attacking: defender !== undefined,
    attackedPlayer: defender !== undefined && s.players[defender] ? defender : undefined,
    name: c.name,
    manaValue: scan ? scanManaValue(s, scan.copied, o) : viewManaValue(s, id, o),
    suspected: o.suspected || undefined,
    // "a spell with {X} in its mana cost" (Matterbending Mage).
    hasX: (!o.faceDown && (s.defs[o.faceDefId ?? o.defId]?.manaCost?.x ?? 0) > 0) || undefined,
    tapped: o.tapped,
    damage: o.zone === "battlefield" ? o.damage : undefined,
    uid: o.uid,
    commander: (!!s.commander && !o.isToken && !!s.commander.cards[o.uid]) || undefined,
    linked: o.linked,
    damagedBy: o.damagedBy,
    attachedTo: o.attachedTo,
    pairedWith: o.pairedWith,
    blocking: !!s.combat?.blockers.some((b) => b.id === id),
    blocked: defender !== undefined ? blockedState(s, id) : undefined,
    // "Was dealt damage this turn": damage still marked, or dealt this turn (removed by regeneration, or dealt as
    // counters by wither or infect).
    damaged: o.damage > 0 || objectDidThisTurn(s, id, "damage") || undefined,
    counters: o.counters,
    preparedSpell: !!o.preparedFor || undefined,
    prepared: !!o.preparedCopy || undefined,
    warped: o.cast?.via === "warp" || undefined,
    faceDown: !!o.faceDown || undefined,
    // Spell on the stack: the mana spent is carried by the stack item (Unravel).
    manaSpent: o.cast?.manaSpent ?? (o.zone === "stack" ? s.stack.find((x) => x.id === id)?.cast?.manaSpent : undefined),
    lastAttachedTo: o.lastAttachedTo,
    cast: !!o.cast || undefined,
    crewedByThisTurn: o.crewedBy?.turn === s.turn.number ? o.crewedBy.ids : undefined,
    equipped: scan
      ? (o.zone === "battlefield" && scan.equipped.has(id)) || undefined
      : (o.zone === "battlefield" &&
          s.battlefield.some(
            (x) => s.objects[x]?.attachedTo === id && s.defs[s.objects[x]?.defId ?? ""]?.subtypes.includes("Equipment"),
          )) ||
        undefined,
    enchantedBy: o.zone === "battlefield" ? (scan ? scan.enchanted : enchantedMap(s)).get(id) : undefined,
  };
}

/** View of an object during the layer computation: characteristics of the previous pass, otherwise printed. */
function snapshotBase(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  if (o.zone !== "battlefield") return view(s, id, base(s, o), o, undefined);
  reads++;
  const hit = viewCache?.get(id);
  if (hit) return hit;
  const v = view(s, id, provisional?.get(id) ?? base(s, o), o, undefined);
  viewCache?.set(id, v);
  return v;
}

/**
 * Computes, without a cache, the characteristics of all objects on the battlefield.
 *
 * 613.8 by fixed point: a first pass evaluates the statics (conditions, "for each", P/T defined by an ability, copied
 * abilities) on the printed characteristics. If one of them depends on the battlefield, they are re-evaluated on the
 * provisional result (`provisional`) and this repeats as long as their signature changes.
 */
export function computeBattlefield(s: GameState): Map<ObjectId, Characteristics> {
  const copied = copyingIn(s) ? copiedDefMap(s) : null;
  const defOfId = (id: ObjectId) => copied?.get(id) ?? obj(s, id).faceDefId ?? obj(s, id).defId;
  const prev = provisional;
  try {
    provisional = null;
    let collected = collectStatics(s, defOfId);
    let out = applyLayers(s, collected.applied, defOfId);
    for (let pass = 1; collected.dependent; pass++) {
      provisional = out;
      const next = collectStatics(s, defOfId, collected);
      if (next.signature === collected.signature) break;
      // At most `MAX_LAYER_PASSES` applications of the layers (613.8): beyond that, a circular dependency.
      if (pass >= MAX_LAYER_PASSES) {
        capReached("layers");
        break;
      }
      collected = next;
      out = applyLayers(s, next.applied, defOfId);
    }
    return out;
  } finally {
    provisional = prev;
  }
}

/** Static ability of an object, with the timestamp of its source. */
interface StaticSlot {
  id: ObjectId;
  ab: Extract<AbilityDef, { kind: "static" }>;
  ts: number;
}

interface Collected {
  /** Effects to apply, in timestamp order. */
  applied: Applied[];
  /** What doesn't depend on the layers: reused as is in the following passes. */
  fixed: Applied[];
  /** Statics that read permanents, re-evaluated at each pass (613.8). */
  dependentSlots: StaticSlot[];
  /** Summary of what depends on the layers; `dependent`: there is some. */
  signature: string;
  dependent: boolean;
}

/**
 * Effects to apply: resolution effects and static abilities. With `previous` (following pass), only the dependent
 * statics and the P/T defined by an ability that read permanents are re-evaluated.
 */
function collectStatics(s: GameState, defOfId: (id: ObjectId) => string, previous?: Collected): Collected {
  const sig: (string | number)[] = [];
  let dependent = false;
  // P/T defined by an ability that count permanents (types, basic land types).
  for (const id of s.battlefield) {
    const d = s.defs[defOfId(id)];
    if (!d || (d.cdaPT === undefined && d.cdaPower === undefined && d.cdaToughness === undefined)) continue;
    const o = obj(s, id);
    for (const a of [d.cdaPT, d.cdaPower, d.cdaToughness]) {
      if (a === undefined || !readsBattlefield(a)) continue;
      dependent = true;
      sig.push(`${id}:${cdaValue(s, o, a)}`);
    }
  }
  const prev = computing;
  const prevViews = viewCache;
  const prevScan = scan;
  computing = true;
  viewCache = new Map();
  scan = scanOf(s);
  try {
    if (previous) {
      const applied = [...previous.fixed];
      for (const slot of previous.dependentSlots) {
        const r = evalStatic(s, slot, sig);
        if (r.entry) applied.push(r.entry);
      }
      applied.sort((a, b) => a.timestamp - b.timestamp);
      return { ...previous, applied, signature: sig.join(","), dependent: true };
    }
    const fixed: Applied[] = s.effects.map((e) => ({ timestamp: e.timestamp, mods: e, affected: e.affected }));
    // 122.1b, 613.7: an ability counter is a layer 6 effect timestamped when it was put on (PLAN-L L5).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      for (const [kind, n] of Object.entries(o.counters)) {
        const k = KEYWORD_COUNTERS[kind];
        if (k && n > 0)
          fixed.push({ timestamp: o.counterTimestamps?.[kind] ?? o.timestamp, mods: { addKeywords: [k] }, affected: [id] });
      }
    }
    const applied = [...fixed];
    const dependentSlots: StaticSlot[] = [];
    for (const slot of staticSlots(s, defOfId)) {
      const r = evalStatic(s, slot, sig);
      if (r.dependent) {
        dependent = true;
        dependentSlots.push(slot);
      } else if (r.entry) fixed.push(r.entry);
      if (r.entry) applied.push(r.entry);
    }
    applied.sort((a, b) => a.timestamp - b.timestamp);
    return { applied, fixed, dependentSlots, signature: sig.join(","), dependent };
  } finally {
    computing = prev;
    viewCache = prevViews;
    scan = prevScan;
  }
}

/** Static abilities in force: permanents, then emblems (command zone). */
function staticSlots(s: GameState, defOfId: (id: ObjectId) => string): StaticSlot[] {
  // A source that loses all its abilities (Witness Protection, "loses all abilities" effect) no longer applies its
  // own; approximation of 613.8 at one level.
  const lost = new Set<ObjectId>();
  for (const e of s.effects) if (e.loseAllAbilities) for (const id of e.affected) lost.add(id);
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (!o.attachedTo) continue;
    for (const ab of s.defs[defOfId(id)]?.abilities ?? []) {
      if (ab.kind === "static" && ab.affects === "attached" && ab.mods.loseAllAbilities) lost.add(o.attachedTo);
    }
  }
  // Static that removes the abilities of the permanents of a filter ("nonbasic lands are Mountains", 305.7): the
  // affected permanents according to their base characteristics, without the source itself (same approximation).
  for (const id of s.battlefield) {
    if (lost.has(id)) continue;
    const o = obj(s, id);
    for (const ab of s.defs[defOfId(id)]?.abilities ?? []) {
      if (ab.kind !== "static" || typeof ab.affects === "string" || !ab.mods.loseAllAbilities) continue;
      if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) continue;
      const f = withChosen(ab.affects, o);
      for (const x of s.battlefield) if (x !== id && matchesView(snapshotBase(s, x), f, o.controller, id)) lost.add(x);
    }
  }
  const slots: StaticSlot[] = [];
  const emblems = s.playerOrder.flatMap((p) => s.players[p]?.command ?? []);
  // 113.6: the statics that work from a graveyard (Anger), and only those of these cards.
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.graveyard ?? []) {
      const o = obj(s, id);
      for (const ab of s.defs[o.defId]?.abilities ?? [])
        if (ab.kind === "static" && ab.fromGraveyard) slots.push({ id, ab, ts: o.timestamp });
    }
  }
  for (const id of [...s.battlefield, ...emblems]) {
    if (lost.has(id)) continue;
    const o = obj(s, id);
    const own = o.zone === "battlefield" ? defOfId(id) : o.defId;
    const ownDef = s.defs[own];
    // Room: abilities of its unlocked doors. Face down: no static ability. Command zone: those of an emblem only
    // (113.6).
    // Layer 3 (612): a text box taken from another definition (Deadpool, Trading Card) brings its static abilities.
    const text = o.zone === "battlefield" && !o.faceDown ? textBoxOf(s, id) : undefined;
    const printed = o.faceDown
      ? []
      : text
        ? (s.defs[text]?.abilities ?? [])
        : o.zone === "command"
          ? commandZoneAbilities(s, id)
          : o.zone === "battlefield" && ownDef?.layout === "split" && ownDef.faceDefs
            ? roomBase(o, ownDef).abilities
            : ownDef
              ? levelAbilities(o, ownDef)
              : [];
    // Statics granted by a resolution effect (Roar of the Fifth People, chapter II: "gains 'Creatures you control
    // have…'"). A static granted by another static isn't handled (613.8).
    // 613.7a: most recent timestamp between the object and the effect that grants the ability.
    const grantedAt = new Map<AbilityDef, number>();
    for (const e of s.effects) {
      if (!e.affected.includes(id)) continue;
      for (const ab of e.addAbilities ?? []) if (ab.kind === "static") grantedAt.set(ab, Math.max(o.timestamp, e.timestamp));
    }
    for (const ab of grantedAt.size ? [...printed, ...grantedAt.keys()] : printed) {
      if (ab.kind === "static" && !ab.fromGraveyard) slots.push({ id, ab, ts: grantedAt.get(ab) ?? o.timestamp });
    }
  }
  return slots;
}

/**
 * Evaluates a static: the effect it applies (or none if its condition isn't met), and whether it depends on the layers
 * (condition or count that reads permanents). Adds to `sig` what depends on them.
 */
function evalStatic(s: GameState, slot: StaticSlot, sig: (string | number)[]): { entry: Applied | null; dependent: boolean } {
  const { id, ab } = slot;
  const o = obj(s, id);
  let dependent = false;
  if (ab.condition) {
    const before = reads;
    const ok = checkCondition(s, ab.condition, o.controller, id);
    // Only a condition that reads permanents depends on the layers ("as long as you control a Dragon").
    if (reads !== before) dependent = true;
    sig.push(ok ? 1 : 0);
    if (!ok) return { entry: null, dependent };
  }
  let mods = ab.mods;
  const gain = mods.gainAbilitiesOf;
  if (gain?.zone === "linked") {
    // Territory Forge: the activated (and mana) abilities of the linked cards; Koh: also triggered, of the chosen card.
    const chosenName = gain.filter?.chosen === "cardName";
    const extra = (o.linked ?? [])
      .filter((c) => s.objects[c]?.zone === "exile")
      .map((c) => s.defs[s.objects[c]?.defId ?? ""])
      .filter((d) => !chosenName || (!!d && hasName(printedName(d), o.chosen?.cardName)))
      .slice(0, chosenName ? 1 : undefined)
      .flatMap((d) => d?.abilities ?? [])
      .filter((a) => a.kind === "activated" || a.kind === "mana" || (gain.triggered && a.kind === "triggered"));
    sig.push(`gl${o.chosen?.cardName ?? ""}`);
    mods = { ...mods, gainAbilitiesOf: undefined, addAbilities: [...(mods.addAbilities ?? []), ...extra] };
  }
  if (gain?.zone === "graveyard") {
    // Thranduil, the Elvenking: the printed activated abilities of the Elf cards in your graveyard.
    const f = gain.filter ?? {};
    const extra = (s.players[o.controller]?.graveyard ?? [])
      .filter((x) => matchesView(snapshot(s, x), { ...f, controller: undefined }, o.controller, id))
      .flatMap((x) => s.defs[s.objects[x]?.defId ?? ""]?.abilities ?? [])
      .filter((a) => (a.kind === "activated" && !a.specialAction && !a.fromHand && !a.fromGraveyard) || a.kind === "mana");
    mods = { ...mods, gainAbilitiesOf: undefined, addAbilities: [...(mods.addAbilities ?? []), ...extra] };
    dependent = true;
    sig.push(`ag${extra.length}`);
  }
  if (gain?.zone === "battlefield") {
    // Marvin, Murderous Mimic: the printed activated abilities of the matching creatures that don't have its name.
    const f = gain.filter ?? {};
    const own = s.defs[o.defId];
    const name = own && printedName(own);
    const extra = s.battlefield
      .filter((x) => x !== id && matchesView(snapshotBase(s, x), f, o.controller, id))
      .filter((x) => {
        const d = s.defs[s.objects[x]?.defId ?? ""];
        return !d || !shareName(printedName(d), name);
      })
      .flatMap((x) => s.defs[s.objects[x]?.defId ?? ""]?.abilities ?? [])
      .filter((a) => (a.kind === "activated" && !a.specialAction && !a.fromHand && !a.fromGraveyard) || a.kind === "mana");
    mods = { ...mods, gainAbilitiesOf: undefined, addAbilities: [...(mods.addAbilities ?? []), ...extra] };
    dependent = true;
    sig.push(`a${extra.length}`);
  }
  if (mods.addBlockRules?.some(blockRulePlaceholder)) {
    mods = { ...mods, addBlockRules: resolveBlockRules(mods.addBlockRules, o.controller, undefined, undefined, id, o.owner) };
    sig.push(`ca${o.controller}`);
  }
  if (mods.setColorsChosen) {
    const color = o.chosen?.color;
    mods =
      mods.setColorsChosen === "add"
        ? { ...mods, setColorsChosen: undefined, addColors: color ? [...(mods.addColors ?? []), color] : mods.addColors }
        : { ...mods, setColorsChosen: undefined, setColors: color ? [color] : undefined };
  }
  if (mods.copyLinkedExile) {
    const card = s.linkedExile.find((l) => l.sourceId === id)?.cards.find((c) => s.objects[c]?.zone === "exile");
    const defId = card ? s.objects[card]?.defId : undefined;
    mods = defId ? { ...mods, copyOf: defId, copyLinkedExile: undefined } : { ...mods, copyLinkedExile: undefined };
  }
  if (ab.perLife || ab.perHand) {
    const pl = s.players[o.controller];
    const n = ab.perHand ? (pl?.hand.length ?? 0) : Math.max(0, pl?.life ?? 0);
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
    // Aettir and Priwen: "base power and toughness X/X, where X is your life total".
    if (mods.setPower !== undefined) mods = { ...mods, setPower: mods.setPower * n };
    if (mods.setToughness !== undefined) mods = { ...mods, setToughness: mods.setToughness * n };
  } else if (ab.perAmount !== undefined) {
    // Earthen Ally: "+1/+0 for each color among Allies you control" (computed like a CDA P/T); Kinbinding: the turn
    // log; Samut: your speed; Dark Matter Manipulator: "for every seven cards in your graveyard".
    const n = cdaValue(s, o, ab.perAmount);
    if (readsBattlefield(ab.perAmount)) {
      dependent = true;
      sig.push(`a${n}`);
    }
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
    if (mods.setPower !== undefined) mods = { ...mods, setPower: mods.setPower * n };
    if (mods.setToughness !== undefined) mods = { ...mods, setToughness: mods.setToughness * n };
  } else if (ab.per || ab.perCounter || ab.perGraveyard) {
    // "+1/+1 for each Forest" / "for each fellowship counter" / "for each creature card in your graveyard".
    const f = ab.per ? withChosen(ab.per, o) : null;
    const g = ab.perGraveyard;
    const raw = g
      ? (s.players[o.controller]?.graveyard ?? []).filter((x) => matchesView(snapshotBase(s, x), g, o.controller, id)).length
      : f
        ? s.battlefield.filter((x) => matchesView(snapshotBase(s, x), f, o.controller, id)).length
        : ab.perCounter === "any"
          ? Object.values(o.counters).reduce((n, k) => n + Math.max(0, k), 0)
          : (o.counters[ab.perCounter as string] ?? 0);
    const n = raw;
    if (f) {
      dependent = true;
      sig.push(`n${n}`);
    }
    mods = { ...mods, power: (mods.power ?? 0) * n, toughness: (mods.toughness ?? 0) * n };
    // Porcelain Gallery: "base power and toughness each equal to the number of creatures you control".
    if (mods.setPower !== undefined) mods = { ...mods, setPower: mods.setPower * n };
    if (mods.setToughness !== undefined) mods = { ...mods, setToughness: mods.setToughness * n };
  }
  const affects = typeof ab.affects === "string" ? ab.affects : withChosen(ab.affects, o);
  if (mods.addChosen === "subtype" && o.chosen?.creatureType) {
    mods = { ...mods, addSubtypes: [...(mods.addSubtypes ?? []), o.chosen.creatureType] };
  }
  if (mods.addChosen === "landType" && o.chosen?.landType) {
    mods = { ...mods, addSubtypes: [...(mods.addSubtypes ?? []), o.chosen.landType] };
  }
  // "Creatures you control have protection from the chosen card type" (Serra's Emissary): the choice is that of the
  // source of the static, not that of the protected permanent (which `protectedFrom` would read otherwise).
  if (mods.addProtections?.some((p) => hasChosen(p.from))) {
    mods = {
      ...mods,
      addProtections: mods.addProtections.map((p) => (hasChosen(p.from) ? { ...p, from: withChosen(p.from, o) } : p)),
    };
    // Only a static re-evaluated at each pass carries its part of the signature (the others are frozen after the first).
    if (dependent) {
      const c = o.chosen;
      sig.push(
        `pc${c?.mode ?? ""}|${c?.color ?? ""}|${c?.creatureType ?? ""}|${c?.cardName ?? ""}|${c?.parity ?? ""}|${c?.number ?? ""}`,
      );
    }
  }
  return {
    entry: { timestamp: slot.ts, mods, affected: { sourceId: id, controller: o.controller, filter: affects } },
    dependent,
  };
}

/**
 * Subtypes replaced without a type change (layer 4). New land types replace only the land types (205.1a, 305.7:
 * "nonbasic lands are Mountains" leaves a land creature its creature types, a Saga land its enchantment type);
 * otherwise, all subtypes.
 */
function replacedSubtypes(old: string[], set: string[]): string[] {
  if (set.length > 0 && set.every((t) => LAND_TYPES.has(t)))
    return [...old.filter((t) => !LAND_TYPES.has(t) && !set.includes(t)), ...set];
  // 205.1b: "is a [creature type]": the new creature types replace the old ones, the other subtypes stay (Vehicle,
  // Equipment, land types). An empty set removes all subtypes (Ultima: "loses all land types").
  if (set.length > 0 && set.every(isCreatureType))
    return [...old.filter((t) => !isCreatureType(t) && t !== ALL_CREATURE_TYPES && !set.includes(t)), ...set];
  return [...set];
}

/** Applies layers 1 and 4 to 7 to the objects of the battlefield (views built with the scan context). */
function applyLayers(s: GameState, applied: Applied[], defOfId: (id: ObjectId) => string): Map<ObjectId, Characteristics> {
  return withScan(s, () => applyLayersScanned(s, applied, defOfId));
}

function applyLayersScanned(s: GameState, applied: Applied[], defOfId: (id: ObjectId) => string): Map<ObjectId, Characteristics> {
  const out = new Map<ObjectId, Characteristics>();
  const attacking = new Map(s.combat?.attackers.map((a) => [a.id, a.defender]) ?? []);
  // Layer 1: copy (copiable values of the copied definition).
  for (const id of s.battlefield) out.set(id, base(s, obj(s, id), defOfId(id)));

  const targets = (a: Applied): ObjectId[] => {
    if (Array.isArray(a.affected)) return a.affected.filter((id) => out.has(id));
    const { sourceId, controller, filter } = a.affected;
    if (filter === "self") return out.has(sourceId) ? [sourceId] : [];
    if (filter === "attached") {
      const host = obj(s, sourceId).attachedTo;
      return host && out.has(host) ? [host] : [];
    }
    const ids: ObjectId[] = [];
    for (const [id, c] of out) {
      if (matchesView(view(s, id, c, obj(s, id), attacking.get(id)), filter, controller, sourceId)) ids.push(id);
    }
    return ids;
  };
  // The sets of the static abilities are determined when their layer applies (613.6):
  // they are frozen at the first layer where the effect acts.
  const fixed = new Map<Applied, ObjectId[]>();
  const affectedBy = (a: Applied) => {
    let ids = fixed.get(a);
    if (!ids) {
      ids = targets(a);
      fixed.set(a, ids);
    }
    return ids;
  };
  const layer = (has: (m: LayerMods) => boolean, apply: (c: Characteristics, m: LayerMods, a: Applied) => void) => {
    for (const a of applied) if (has(a.mods)) for (const id of affectedBy(a)) apply(out.get(id) as Characteristics, a.mods, a);
  };

  // Layer 3: text-changing effects (612): an exchanged text box (Deadpool, Trading Card).
  for (const a of applied) {
    const text = a.mods.textOf;
    if (text) for (const id of affectedBy(a)) applyTextBox(s, out.get(id) as Characteristics, obj(s, id), defOfId(id), text);
  }

  // Layer 4: types (and name, for Witness Protection).
  layer(
    (m) =>
      !!(
        m.addTypes ||
        m.addSubtypes ||
        m.setTypes ||
        m.setSubtypes ||
        m.setName ||
        m.allCreatureTypes ||
        m.addSupertypes ||
        m.removeSupertypes
      ),
    (c, m) => {
      if (m.setTypes) {
        c.types = [...m.setTypes];
        c.subtypes = [...(m.setSubtypes ?? [])];
      } else if (m.setSubtypes) c.subtypes = replacedSubtypes(c.subtypes, m.setSubtypes);
      if (m.setName) c.name = m.setName;
      for (const t of m.addSupertypes ?? []) if (!c.supertypes.includes(t)) c.supertypes.push(t);
      if (m.removeSupertypes?.length) c.supertypes = c.supertypes.filter((t) => !m.removeSupertypes?.includes(t));
      if (m.allCreatureTypes && !c.subtypes.includes(ALL_CREATURE_TYPES)) c.subtypes.push(ALL_CREATURE_TYPES);
      for (const t of m.addTypes ?? []) if (!c.types.includes(t)) c.types.push(t);
      for (const t of m.addSubtypes ?? []) if (!c.subtypes.includes(t)) c.subtypes.push(t);
    },
  );
  // Layer 5: colors, replaced or added ("in addition to its other colors").
  layer(
    (m) => !!(m.setColors || m.addColors),
    (c, m) => {
      if (m.setColors) c.colors = [...m.setColors];
      for (const k of m.addColors ?? []) if (!c.colors.includes(k)) c.colors.push(k);
    },
  );
  // Layer 6: abilities. Forbidden keywords (`forbidKeywords`), removed at the end of the layer.
  const forbidden = new Map<Characteristics, Keyword[]>();
  layer(
    (m) =>
      !!(
        m.addKeywords?.length ||
        m.removeKeywords?.length ||
        m.forbidKeywords?.length ||
        m.loseAllAbilities ||
        m.addAbilities?.length ||
        m.addBlockRules?.length ||
        m.addProtections?.length ||
        m.addPowerRules?.length
      ),
    (c, m, a) => {
      if (m.loseAllAbilities) {
        c.keywords = [];
        c.abilities = [];
        c.grantors = undefined;
        // 701.38: goad isn't an ability; a goaded creature that loses its abilities stays goaded.
        c.blockRules = c.blockRules.filter((r) => r.goadedBy);
        c.protections = [];
        c.powerRules = [];
      }
      if (m.addPowerRules?.length) c.powerRules = [...c.powerRules, ...m.addPowerRules];
      if (m.addBlockRules?.length) c.blockRules = [...c.blockRules, ...m.addBlockRules];
      if (m.addProtections?.length) c.protections = [...c.protections, ...m.addProtections];
      for (const k of m.removeKeywords ?? []) c.keywords = c.keywords.filter((x) => x !== k);
      for (const k of m.addKeywords ?? []) if (!c.keywords.includes(k)) c.keywords.push(k);
      if (m.forbidKeywords?.length) forbidden.set(c, [...(forbidden.get(c) ?? []), ...m.forbidKeywords]);
      if (m.addAbilities?.length) {
        // Ability granted by the static of a permanent: it is kept for `ref.grantor` ("return Trusty Boomerang"). A
        // resolution effect (Dreadmaw's Ire) has no object that grants it.
        if (!Array.isArray(a.affected)) {
          const from = a.affected.sourceId;
          const at = c.abilities.length;
          c.grantors = { ...c.grantors, ...Object.fromEntries(m.addAbilities.map((_, i) => [at + i, from])) };
        }
        c.abilities = [...c.abilities, ...m.addAbilities];
      }
    },
  );
  for (const [id, c] of out) {
    // 701.60c: a suspected permanent has menace and "can't block" for as long as it's suspected.
    if (obj(s, id).suspected) for (const k of ["menace", "cantBlock"] as const) if (!c.keywords.includes(k)) c.keywords.push(k);
    // 702.108: a granted prowess (Bria) or one carried by a token (Otter) has its triggered ability.
    if (c.keywords.includes("prowess") && !c.abilities.some((ab) => ab.kind === "triggered" && ab.label === PROWESS_LABEL)) {
      c.abilities = [...c.abilities, PROWESS];
    }
    // 702.147: decayed (printed, granted or by a counter) has its triggered ability.
    if (c.keywords.includes("decayed") && !c.abilities.includes(DECAYED)) c.abilities = [...c.abilities, DECAYED];
    // "Can't have or gain [keyword]": after all the rest of layer 6 (Archetype of Courage).
    const no = forbidden.get(c);
    if (no) c.keywords = c.keywords.filter((k) => !no.includes(k));
  }
  // Layer 7b: set P/T.
  layer(
    (m) => m.setPower !== undefined || m.setToughness !== undefined,
    (c, m) => {
      if (m.setPower !== undefined) c.power = m.setPower;
      if (m.setToughness !== undefined) c.toughness = m.setToughness;
    },
  );
  // Layer 7c: counters, then modifications (everything is additive: the order doesn't matter). 122.1: each hone counter
  // on an Equipment gives +1/+0 to the equipped creature (Dwalin, Sting).
  const hone = new Map<string, number>();
  for (const x of s.battlefield) {
    const e = s.objects[x];
    const n = e?.counters.hone ?? 0;
    if (n > 0 && e?.attachedTo) hone.set(e.attachedTo, (hone.get(e.attachedTo) ?? 0) + n);
  }
  for (const [id, c] of out) {
    const o = obj(s, id);
    c.basePower = c.power;
    const pt = counterPT(o);
    c.power += pt.power + (hone.get(id) ?? 0);
    c.toughness += pt.toughness;
  }
  layer(
    (m) => !!(m.power || m.toughness),
    (c, m) => {
      // Diligent Zookeeper: multiplied by the number of creature types of the affected object (changeling: all).
      // Mirror Box: multiplied by the number of other creatures of the same controller with the same name.
      const per = m.perAffected;
      const k =
        per?.what === "sameName"
          ? [...out.values()].filter(
              (x) => x !== c && x.controller === c.controller && x.types.includes("Creature") && shareName(x.name, c.name),
            ).length
          : per?.what === "ownCreatureTypes"
            ? Math.min(per.max, c.keywords.includes("changeling") ? per.max : c.subtypes.length)
            : 1;
      c.power += (m.power ?? 0) * k;
      c.toughness += (m.toughness ?? 0) * k;
    },
  );
  // Layer 7d: switch.
  layer(
    (m) => !!m.switchPT,
    (c) => {
      [c.power, c.toughness] = [c.toughness, c.power];
    },
  );
  return out;
}

const PROWESS_LABEL = msg("Prowess");

/** Prowess (702.108): "whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn". */
const PROWESS: AbilityDef = {
  kind: "triggered",
  trigger: { on: "castSpell", by: "you", filter: { notTypes: ["Creature"] } },
  targets: [],
  effects: [{ op: "pump", what: { kind: "self" }, power: 1, toughness: 1 }],
  label: PROWESS_LABEL,
};

/** Decayed (702.147b): "when this creature attacks, sacrifice it at end of combat". */
const DECAYED: AbilityDef = {
  kind: "triggered",
  trigger: { on: "attacks", who: "self" },
  targets: [],
  effects: [
    {
      op: "delayed",
      at: "endOfCombat",
      effects: [{ op: "sacrificeIt", what: { kind: "target", id: "d" } }],
      bind: { d: { kind: "self" } },
    },
  ],
  label: msg("Decayed"),
};

function battlefieldChars(s: GameState): Map<ObjectId, Characteristics> {
  const key = cacheKey(s);
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.map;
  const map = computeBattlefield(s);
  cache.set(s, { key, map, deps: cacheDeps(s, map) });
  return map;
}

export function chars(s: GameState, id: ObjectId): Characteristics {
  const o = obj(s, id);
  // During the computation (conditions of static abilities), the previous pass is read, otherwise the base
  // characteristics. A spell on the stack: its keywords include those granted to it by its controller's statics
  // ("instant and sorcery spells you control have lifelink", Heartflame Duelist; PLAN-C, lot C11).
  if (o.zone === "stack" && !computing) {
    const c = base(s, o, o.faceDefId ?? o.defId);
    const d = s.defs[o.faceDefId ?? o.defId];
    const granted = d ? grantedSpellKeywords(s, o.controller, d) : [];
    return granted.length ? { ...c, keywords: [...c.keywords, ...granted] } : c;
  }
  if (o.zone !== "battlefield" || computing) {
    if (computing && o.zone === "battlefield") reads++;
    return provisional?.get(id) ?? base(s, o, o.faceDefId ?? o.defId);
  }
  return battlefieldChars(s).get(id) ?? base(s, o);
}

/**
 * Power that counts for a use (family R4.3): combat damage, crew and saddle, station. Absolute value, then toughness,
 * then bonus.
 */
export function effectivePower(
  c: Pick<Characteristics, "power" | "toughness"> & { powerRules?: PowerRule[] },
  use: PowerRule["uses"][number],
): number {
  const rules = (c.powerRules ?? []).filter((r) => r.uses.includes(use));
  let power = c.power;
  if (power < 0 && rules.some((r) => r.absolute)) power = -power;
  if (rules.some((r) => r.toughness === "always")) power = c.toughness;
  else if (rules.some((r) => r.toughness === "ifGreater") && c.toughness > power) power = c.toughness;
  return power + rules.reduce((n, r) => n + (r.bonus ?? 0), 0);
}

export function hasType(s: GameState, id: ObjectId, t: CardType): boolean {
  return chars(s, id).types.includes(t);
}

export function hasKeyword(s: GameState, id: ObjectId, k: Keyword): boolean {
  return chars(s, id).keywords.includes(k);
}

export function isCreature(s: GameState, id: ObjectId): boolean {
  return hasType(s, id, "Creature");
}

/**
 * Summoning sickness (302.6): a creature can attack or use {T} only if its controller has controlled it
 * continuously since the beginning of their most recent turn.
 */
/**
 * Summoning sickness for activating an ability with {T}: Shang-Chi, Master of Kung Fu ("as though they had haste")
 * lifts it, but not for attacking.
 */
export function sickForActivation(s: GameState, id: ObjectId): boolean {
  if (!isSummoningSick(s, id)) return false;
  const controller = obj(s, id).controller;
  return !playerStatics(s, controller, "activateAsThoughHaste").some(
    ({ id: src, ab }) => !!ab.activateAsThoughHaste && matchesObjectFilter(s, controller, id, ab.activateAsThoughHaste, src),
  );
}

export function isSummoningSick(s: GameState, id: ObjectId): boolean {
  const o = obj(s, id);
  if (!isCreature(s, id) || hasKeyword(s, id, "haste")) return false;
  const recent = s.players[o.controller]?.lastTurnStarted ?? 0;
  return !(recent >= 1 && o.controlledSince < recent);
}

export function creaturesControlledBy(s: GameState, p: PlayerId): ObjectId[] {
  return s.battlefield.filter((id) => obj(s, id).controller === p && isCreature(s, id));
}

/** Snapshot of the current characteristics of an object (last known information). */
export function snapshot(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  const c = chars(s, id);
  return {
    ...view(s, id, c, o, s.combat?.attackers.find((a) => a.id === id)?.defender),
    abilities: c.abilities,
    counters: { ...o.counters },
    // Choice made as it entered (type, color…): read by "of the chosen type" even after it leaves (last information).
    ...(o.chosen ? { chosen: { ...o.chosen } } : {}),
  };
}
