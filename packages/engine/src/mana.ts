/**
 * Mana: reading costs, available sources and the automatic payment solver.
 */
import { dealDamage, gainLife, payLife, sacrifice, sourceFromObject } from "./actions";
import { evalAmount, resolveRef, staticContext } from "./effects";
import { RulesError } from "./errors";
import { bumpFor } from "./layers";
import { type AmountMod, chooseReplacementOrder } from "./modifiers";
import { collectEvidence, evidenceCards } from "./stack";
import {
  bump,
  changeCounters,
  chars,
  commanderIdentity,
  defOf,
  emit,
  isCreature,
  moveObject,
  obj,
  opponentsOf,
  sickForActivation,
  snapshot,
  tapObject,
} from "./state";
import { type ActiveReplacement, eventReplacements, lifeCost, payableLife, playerSide, replacementAdd } from "./statics";
import { matchesObjectFilter, matchesView, withChosen } from "./targets";
import { msg } from "./text";
import { checkCondition } from "./triggers";
import type {
  AbilityKind,
  Color,
  GameObject,
  GameState,
  LkiSnapshot,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ObjectFilter,
  ObjectId,
  PlayerId,
  SacrificeToPay,
  TaggedMana,
} from "./types";
import { MANA_TYPES } from "./types";

const SYMBOLS = new Set<string>(["W", "U", "B", "R", "G", "C"]);

/** "{2}{G}{G/W}" → { generic: 2, colored: { G: 1 }, hybrid: [["G","W"]], x: 0 }. Throws on unsupported symbols. */
export function parseManaCost(text: string): ManaCost {
  const cost: ManaCost = { generic: 0, colored: {}, x: 0 };
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1] as string;
    if (/^\d+$/.test(sym)) cost.generic += Number(sym);
    else if (sym === "X") cost.x += 1;
    else if (SYMBOLS.has(sym)) {
      const t = sym as ManaType;
      cost.colored[t] = (cost.colored[t] ?? 0) + 1;
    } else if (/^[WUBRG]\/P$/.test(sym)) {
      cost.phyrexian = [...(cost.phyrexian ?? []), sym[0] as ManaType];
    } else if (/^2\/[WUBRG]$/.test(sym)) {
      cost.twoHybrid = [...(cost.twoHybrid ?? []), sym[2] as ManaType];
    } else if (/^[WUBRG]\/[WUBRG]$/.test(sym)) {
      cost.hybrid = [...(cost.hybrid ?? []), sym.split("/") as [ManaType, ManaType]];
    } else throw new Error(`Unsupported mana symbol: {${sym}}`);
  }
  return cost;
}

export function manaValue(cost: ManaCost | null | undefined): number {
  if (!cost) return 0;
  return (
    cost.generic +
    Object.values(cost.colored).reduce((a, b) => a + (b ?? 0), 0) +
    (cost.hybrid?.length ?? 0) +
    (cost.phyrexian?.length ?? 0) +
    2 * (cost.twoHybrid?.length ?? 0)
  );
}

export function costToText(cost: ManaCost | null): string {
  if (!cost) return "";
  let t = "{X}".repeat(cost.x);
  if (cost.generic > 0 || (manaValue(cost) === 0 && cost.x === 0)) t += `{${cost.generic}}`;
  for (const [a, b] of cost.hybrid ?? []) t += `{${a}/${b}}`;
  for (const m of cost.twoHybrid ?? []) t += `{2/${m}}`;
  for (const m of cost.phyrexian ?? []) t += `{${m}/P}`;
  for (const m of MANA_TYPES) t += `{${m}}`.repeat(cost.colored[m] ?? 0);
  return t;
}

/**
 * Text of a cost paid by a `pay` effect, its parts joined by "and": the "unless" question (`ops/pay.ts`) and the ward
 * badge (`view.ts`). `mana`, `life` and `discard` come already written (evaluated life, "or" costs, waterbend; short
 * life, "life equal to its power"); the other parts are written here.
 */
export function payCostText(parts: {
  mana?: string;
  life?: string;
  discard?: string;
  poison?: number;
  sacrifice?: { count: number; filter?: ObjectFilter };
  collectEvidence?: number | "X";
}): string {
  const sac = parts.sacrifice;
  const texts = [
    parts.mana ?? "",
    parts.life ?? "",
    parts.discard ?? "",
    parts.poison ? msg("get {n} poison counters", { n: parts.poison }) : "",
    sac?.count
      ? sac.filter?.types?.includes("Creature")
        ? msg("sacrifice {n} creature(s)", { n: sac.count })
        : sac.filter?.notTypes?.includes("Land")
          ? msg("sacrifice {n} nonland permanents", { n: sac.count })
          : msg("sacrifice {n} permanents", { n: sac.count })
      : "",
    parts.collectEvidence ? msg("collect evidence {n}", { n: parts.collectEvidence }) : "",
  ].filter(Boolean);
  return texts.length ? texts.reduce((a, b) => msg("{a} and {b}", { a, b })) : "";
}

/** Total cost to pay: X replaced by its value, additional costs added, generic reduction applied. */
export function totalCost(base: ManaCost | null | undefined, x: number, extra?: ManaCost, reduction = 0): ManaCost {
  const cost: ManaCost = {
    generic: (base?.generic ?? 0) + x * (base?.x ?? 0),
    colored: { ...(base?.colored ?? {}) },
    hybrid: [...(base?.hybrid ?? [])],
    twoHybrid: [...(base?.twoHybrid ?? []), ...(extra?.twoHybrid ?? [])],
    ...(base?.phyrexian?.length || extra?.phyrexian?.length
      ? { phyrexian: [...(base?.phyrexian ?? []), ...(extra?.phyrexian ?? [])] }
      : {}),
    x: 0,
  };
  if (extra) {
    cost.generic += extra.generic;
    for (const m of MANA_TYPES) {
      const n = extra.colored[m] ?? 0;
      if (n) cost.colored[m] = (cost.colored[m] ?? 0) + n;
    }
    cost.hybrid = [...(cost.hybrid ?? []), ...(extra.hybrid ?? [])];
  }
  // 601.2f: reductions only reduce the generic part.
  cost.generic = Math.max(0, cost.generic - reduction);
  return cost;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface ManaSource {
  id: ObjectId;
  ability: number;
  colors: ManaType[];
  amount: number;
  isCreature: boolean;
  /** The source sacrifices itself (Treasure): used as a last resort. */
  sacrifice: boolean;
  /** Creature tapped for convoke. */
  convoke?: boolean;
  /** Card from your graveyard exiled for delve (702.66). */
  delve?: boolean;
  /** Artifact or creature tapped for waterbending: pays only generic mana. */
  waterbend?: boolean;
  /** Artifact tapped for improvise (702.126): pays only generic mana. */
  improvise?: boolean;
  /** Permanent sacrificed as an additional cost, which reduces the cost by {N} (Rottenmouth Viper, Dargo): pays only generic mana. */
  sacrificeToPay?: boolean;
  /** "… in any combination": each mana produced takes one of the types of `colors`. */
  combination?: boolean;
  /**
   * Exclusive sources: two abilities that tap or sacrifice the same permanent (a Forest that also has "{T}: Add one mana
   * of any color") have the same key, and only one can be used.
   */
  key: string;
}

/** "Like lands" sources being computed (guard against recursion between two such sources). */
const likeLandsComputing = new Set<ObjectId>();

/** Mana abilities of an object, including those intrinsic to basic land types (305.6). */
export function manaAbilitiesOf(s: GameState, id: ObjectId): ManaAbilityDef[] {
  // On the battlefield, types and abilities come from the layers (Imprisoned in the Moon…).
  const o = obj(s, id);
  const c = o.zone === "battlefield" ? chars(s, id) : { subtypes: defOf(s, id).subtypes, abilities: defOf(s, id).abilities };
  const list: ManaAbilityDef[] = [];
  const basic: Record<string, ManaType> = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
  for (const sub of c.subtypes) {
    const m = basic[sub];
    if (m) list.push({ kind: "mana", cost: { tap: true }, produce: [m], amount: 1 });
  }
  for (const a of c.abilities) {
    if (a.kind !== "mana") continue;
    // "Add one mana of the chosen color" (Heraldic Banner).
    // The colors of the designated objects: the matching permanents you control (Meteor Crater), the matching cards in
    // your graveyard (The Grey Havens), the cards exiled with the source (Pit of Offerings).
    if (a.produceColorsOf) {
      const colors = new Set<ManaType>();
      for (const x of resolveRef(s, staticContext(s, o.controller, id), a.produceColorsOf))
        for (const c of s.objects[x]?.zone === "battlefield" ? chars(s, x).colors : defOf(s, x).colors) colors.add(c);
      list.push({ ...a, produce: MANA_TYPES.filter((m) => colors.has(m)) });
    }
    // Reflecting Pool: the types your other lands could produce (without sources of the same kind, 106.7);
    // Exotic Orchard, Fellwar Stone: the colors an opponent's lands could produce (filter).
    else if (a.produceLikeLands) {
      const types = new Set<ManaType>();
      const anyController = a.produceLikeLands.controller !== undefined;
      // Two sources of this kind (two Exotic Orchards of two players) do not consult each other (106.7).
      likeLandsComputing.add(id);
      try {
        for (const pid of s.battlefield) {
          if (pid === id || likeLandsComputing.has(pid) || !chars(s, pid).types.includes("Land")) continue;
          if (!anyController && obj(s, pid).controller !== o.controller) continue;
          if (!matchesObjectFilter(s, o.controller, pid, a.produceLikeLands, id)) continue;
          for (const m of manaAbilitiesOf(s, pid))
            if (!m.produceLikeLands && !m.produceIdentity) for (const t of m.produce) types.add(t);
        }
      } finally {
        likeLandsComputing.delete(id);
      }
      list.push({ ...a, produce: MANA_TYPES.filter((m) => types.has(m) && a.produce.includes(m)) });
    }
    // Command Tower, Arcane Signet: your commander's color identity (903.4; nothing without a commander).
    else if (a.produceIdentity) {
      const identity = commanderIdentity(s, o.controller);
      list.push({ ...a, produce: MANA_TYPES.filter((m) => identity.includes(m as Color)) });
    } else list.push(a.produceChosen ? { ...a, produce: o.chosen?.color ? [o.chosen.color] : a.produce } : a);
  }
  return list;
}

/** Can a mana ability without a mana cost be activated now? */
function canActivateMana(s: GameState, id: ObjectId, ab: ManaAbilityDef): boolean {
  const o = obj(s, id);
  if (ab.cost.mana) return false;
  if (chars(s, id).keywords.includes("noActivatedAbilities")) return false;
  if (ab.cost.tap && (o.tapped || sickForActivation(s, id))) return false;
  if (ab.tapAnother && !otherToTap(s, id, ab)) return false;
  if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) return false;
  if (ab.oncePerTurn && s.turn.onceFired.includes(`mana:${id}`)) return false;
  if (ab.cost.payLife && payableLife(s, o.controller) < lifeCost(s, o.controller, id, ab.cost.payLife)) return false;
  if (ab.cost.collectEvidence && !evidenceCards(s, o.controller, id, ab.cost.collectEvidence)) return false;
  return true;
}

/** Can `x` be tapped for the cost "tap an untapped [permanent] you control" of an ability of `id`? */
function fitsTapAnother(s: GameState, id: ObjectId, x: ObjectId, kind: ManaAbilityDef["tapAnother"]): boolean {
  if (kind === "creature") return isCreature(s, x);
  if (kind === "artifact") return chars(s, x).types.includes("Artifact");
  if (typeof kind === "object") return matchesObjectFilter(s, obj(s, id).controller, x, kind, id);
  return true;
}

/**
 * Gene Pollinator: the additional permanent to tap, chosen automatically. First a permanent without a mana ability
 * (so as not to deprive the solver of a source), otherwise any of them; `strict`: only the first case.
 */
function otherToTap(
  s: GameState,
  id: ObjectId,
  ab: ManaAbilityDef,
  strict = false,
  exclude?: ReadonlySet<ObjectId>,
): ObjectId | undefined {
  const me = obj(s, id).controller;
  // "Tap an untapped creature (artifact, legendary creature) you control": Springleaf Drum, Urza, Lord High Artificer,
  // Relic of Legends.
  const mine = s.battlefield.filter(
    (x) =>
      x !== id && !exclude?.has(x) && !obj(s, x).tapped && obj(s, x).controller === me && fitsTapAnother(s, id, x, ab.tapAnother),
  );
  return mine.find((x) => manaAbilitiesOf(s, x).length === 0) ?? (strict ? undefined : mine[0]);
}

/**
 * "Whenever [this permanent] is tapped for mana, add an additional mana" (R1, family I): the mana replacements that
 * apply to this tapped source, seen from the player who taps it (Lavaleaper, Shimmerwilds Growth…).
 */
function manaReplacements(s: GameState, id: ObjectId, ab: ManaAbilityDef, gone?: ReadonlySet<ObjectId>): ActiveReplacement[] {
  const o = s.objects[id];
  if (!o || !ab.cost.tap) return [];
  return eventReplacements(s, "mana").filter(
    (a) =>
      !(a.sourceId && gone?.has(a.sourceId)) &&
      playerSide(s, a, o.controller) &&
      (!a.r.source || matchesObjectFilter(s, a.controller, id, a.r.source, a.sourceId)),
  );
}

/**
 * Replacements adding mana of the same type, whatever the type produced (known to the solver): "an additional mana"
 * (Molten Tide, Lavaleaper, Roxanne), "three times as much" (Nyxbloom Ancient), in the most favorable order (616.1).
 */
const sameTypeMods = (s: GameState, reps: ActiveReplacement[]): AmountMod[] =>
  reps
    .filter((a) => !a.r.manaProduced && (a.r.extraMana ?? "same") === "same")
    .flatMap((a) => {
      const add = replacementAdd(s, a);
      return [...(add ? [{ add }] : []), ...(a.r.modify.times ? [{ times: a.r.modify.times }] : [])];
    });

/** Amount produced ("{G} for each Elf you control"), replacements included. */
function manaAmount(s: GameState, id: ObjectId, ab: ManaAbilityDef, gone?: ReadonlySet<ObjectId>): number {
  // Source already sacrificed to pay the cost (Treasure): printed amount.
  const o = s.objects[id];
  if (!o) return ab.amount;
  const mods = sameTypeMods(s, manaReplacements(s, id, ab, gone));
  const base = baseManaAmount(s, id, o.controller, ab);
  return mods.length ? chooseReplacementOrder(base, mods, "max") : base;
}

function baseManaAmount(s: GameState, id: ObjectId, controller: PlayerId, ab: ManaAbilityDef): number {
  // "{G} for each Elf you control", "as much mana as charge counters", "X mana, where X is the number of permanent
  // cards in your graveyard", "equal to its power", "one mana for each different power among your creatures".
  return ab.amountOf ? Math.max(0, evalAmount(s, staticContext(s, controller, id), ab.amountOf)) : ab.amount;
}

/** What the mana is for (restricted mana: "spend this mana only to cast an Angel spell"). */
export interface ManaPurpose {
  spell?: LkiSnapshot;
  /** Activated ability: its source. */
  abilitySource?: ObjectId;
  /** Activated ability: its kinds (equip, unlocking a door, turning face up…). */
  abilityKinds?: readonly AbilityKind[];
  /** Convoke (702.51): untapped creatures can pay {1} or one mana of their color. */
  convoke?: boolean;
  /** Delve (702.66, Teval): each card exiled from your graveyard pays {1}. */
  delve?: boolean;
  /** Spell cast from the hand. */
  fromHand?: boolean;
  /**
   * Waterbend N: at most N of the generic part can be paid by tapping untapped artifacts and creatures ({1} each).
   */
  waterbend?: number;
  /** Improvise (702.126): each untapped artifact can pay {1} of the generic part. */
  improvise?: boolean;
  /**
   * "As an additional cost, you may sacrifice any number of [filter]; this spell costs {N} less for each" (Rottenmouth
   * Viper, Dargo): each matching permanent sacrificed pays `each` ({1} by default) of the generic part.
   */
  sacrificeToPay?: SacrificeToPay;
  /**
   * Permanents sacrificed to pay the cost: their mana abilities can be used first (601.2g, 602.2b), except those that
   * sacrifice them themselves (Treasure).
   */
  sacrificedForCost?: ReadonlySet<ObjectId>;
  /**
   * Cards the payment must not consume (evidence, delve): the graveyard card that exiles itself to pay the cost of its
   * own ability (Sage of the Fang's renew, paid with Cryptex).
   */
  keep?: readonly ObjectId[];
  /** Sources offered for manual tapping (`legalActions`): restricted sources too. */
  manual?: boolean;
  /**
   * Objects chosen by the player for convoke, improvise, waterbending or delve: only those are used for that payment
   * mode, first, and all of them must be used.
   */
  only?: Partial<Record<"convoke" | "improvise" | "waterbend" | "delve" | "sacrificeToPay", ObjectId[]>>;
  /**
   * Permanents that will have left the battlefield before the mana is paid (`legalActions`: exiled, returned or
   * sacrificed by an additional or alternative cost, paid before the mana in `castSpell`): their mana replacements no
   * longer count (Lavaleaper exiled by beholding for Champion of the Path). Their own mana: `exclude`.
   */
  gone?: ReadonlySet<ObjectId>;
  /**
   * Phyrexian mana (107.4f): the number of Phyrexian symbols paid with 2 life each, chosen by the player
   * (`CastChoices.phyrexianLife`); absent: mana first, life for the symbols the mana does not cover.
   */
  phyrexianLife?: number;
}

/**
 * Cards the payment does not consume: those of `keep`, the source of the ability being paid (which may exile itself)
 * and the objects reserved by the rest of the cost (`exclude`: craft materials that Cryptex must not exile as evidence).
 */
function kept(purpose?: ManaPurpose, exclude?: ReadonlySet<ObjectId>): ObjectId[] {
  return [...(purpose?.keep ?? []), ...(purpose?.abilitySource ? [purpose.abilitySource] : []), ...(exclude ?? [])];
}

/** Pseudo mana ability of a creature tapped for convoke. */
export const CONVOKE = -1;
/** Pseudo mana ability of a graveyard card exiled for delve. */
export const DELVE = -2;
/** Pseudo ability: an artifact or creature tapped for waterbending ({1}). */
export const WATERBEND = -4;
/** Pseudo ability: a permanent sacrificed as an additional cost pays {1} (Rottenmouth Viper). */
export const SACRIFICE_PAY = -5;
/** Pseudo ability: a restricted mana in the pool (`restrictedMana`, Ashling, Rimebound); `id`: `pool:<index>`. */
export const RESTRICTED_POOL = -3;

function restrictionAllows(
  s: GameState,
  sourceId: ObjectId,
  ab: ManaAbilityDef,
  player: PlayerId,
  purpose?: ManaPurpose,
): boolean {
  // Tapped manually, a restricted source fills the tagged pool (`activateManaAbility`).
  if (purpose?.manual) return true;
  return allows(s, ab.restriction, s.objects[sourceId], sourceId, player, purpose);
}

/** Can the restricted mana be used for this payment? (`source`: what produced it, for "of the chosen type"). */
function allows(
  s: GameState,
  r: ManaRestriction | undefined,
  o: { chosen?: GameObject["chosen"] } | undefined,
  sourceId: ObjectId,
  player: PlayerId,
  purpose?: ManaPurpose,
): boolean {
  if (!r) return true;
  if (!purpose) return false;
  if (r.notSpellFromHand) return !!purpose.abilitySource || (!!purpose.spell && !purpose.fromHand);
  if (r.spellNotFromHand) return !!purpose.spell && !purpose.fromHand;
  if (r.spell && purpose.spell && matchesView(purpose.spell, withChosen(r.spell, o), player, sourceId)) return true;
  if (r.ability && purpose.abilityKinds?.some((k) => r.ability?.includes(k))) return true;
  const src = purpose.abilitySource;
  if (r.abilityOfSource && src && s.objects[src]) {
    return matchesView(snapshot(s, src), withChosen(r.abilityOfSource, o), player, sourceId);
  }
  if (r.abilityOfCreature && src && s.objects[src] && isCreature(s, src)) {
    return matchesView(snapshot(s, src), withChosen(r.abilityOfCreature, o), player, sourceId);
  }
  return false;
}

export function manaSources(
  s: GameState,
  player: PlayerId,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): ManaSource[] {
  const out: ManaSource[] = [];
  for (const id of s.battlefield) {
    const o = obj(s, id);
    if (o.controller !== player || exclude.has(id)) continue;
    // A creature chosen by the player for convoke is tapped for convoke, not for its mana.
    if (purpose?.convoke && purpose.only?.convoke?.includes(id)) continue;
    manaAbilitiesOf(s, id).forEach((ab, i) => {
      if (!canActivateMana(s, id, ab)) return;
      // Restricted mana: usable by the solver only for an allowed payment.
      if (!restrictionAllows(s, id, ab, player, purpose)) return;
      // An excluded permanent (tapped or sacrificed for another cost of the same payment) does not serve as "permanent to tap".
      if (ab.tapAnother && !otherToTap(s, id, ab, true, exclude)) return;
      if (ab.cost.self === "sacrifice" && purpose?.sacrificedForCost?.has(id)) return;
      if (ab.cost.collectEvidence && !evidenceCards(s, o.controller, id, ab.cost.collectEvidence, kept(purpose, exclude))) return;
      // No possible color (Pit of Offerings without a colored exiled card): the ability produces nothing (106.7).
      if (ab.produce.length === 0) return;
      // No mana produced (Vivi Ornitier with power 0): the source pays nothing.
      const amount = manaAmount(s, id, ab, purpose?.gone);
      if (amount <= 0) return;
      out.push({
        id,
        ability: i,
        colors: ab.produce,
        amount,
        ...(ab.combination && ab.produce.length > 1 ? { combination: true } : {}),
        isCreature: defOf(s, id).types.includes("Creature"),
        sacrifice: ab.cost.self === "sacrifice",
        key: ab.cost.tap || ab.cost.self === "sacrifice" ? id : `${id}#${i}`,
      });
    });
  }
  // Convoke (702.51a): each untapped creature pays {1} or one mana of its color (used last); a creature with a mana
  // ability shares its key with that ability (one or the other), and one chosen for convoke is only tapped for it.
  if (purpose?.convoke) {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped || !isCreature(s, id)) continue;
      if (purpose.only?.convoke && !purpose.only.convoke.includes(id)) continue;
      const colors = chars(s, id).colors;
      out.push({
        id,
        ability: CONVOKE,
        colors: [...colors, "C"],
        amount: 1,
        isCreature: true,
        sacrifice: false,
        convoke: true,
        key: id,
      });
    }
  }
  // Waterbending: each untapped artifact or creature pays {1} (same key as its mana abilities: only one is used).
  if (purpose?.waterbend) {
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped) continue;
      const types = chars(s, id).types;
      if (!types.includes("Artifact") && !types.includes("Creature")) continue;
      if (purpose.only?.waterbend && !purpose.only.waterbend.includes(id)) continue;
      out.push({ id, ability: WATERBEND, colors: [], amount: 1, isCreature: false, sacrifice: false, waterbend: true, key: id });
    }
  }
  // Improvise: each untapped artifact pays {1} (no cap; same key as its mana abilities).
  if (purpose?.improvise) {
    const taken = new Set(out.filter((x) => x.waterbend).map((x) => x.id));
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || o.tapped || taken.has(id)) continue;
      if (!chars(s, id).types.includes("Artifact")) continue;
      if (purpose.only?.improvise && !purpose.only.improvise.includes(id)) continue;
      out.push({ id, ability: WATERBEND, colors: [], amount: 1, isCreature: false, sacrifice: false, improvise: true, key: id });
    }
  }
  // Sacrifice as an additional cost: each matching permanent pays {1} (as a last resort: sacrifice as little as
  // possible; same key as its mana abilities).
  if (purpose?.sacrificeToPay) {
    const taken = new Set(out.filter((x) => x.ability < 0).map((x) => x.id));
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (o.controller !== player || exclude.has(id) || taken.has(id)) continue;
      if (!matchesObjectFilter(s, player, id, purpose.sacrificeToPay.filter)) continue;
      if (purpose.only?.sacrificeToPay && !purpose.only.sacrificeToPay.includes(id)) continue;
      out.push({
        id,
        ability: SACRIFICE_PAY,
        colors: [],
        amount: purpose.sacrificeToPay.each ?? 1,
        isCreature: false,
        sacrifice: true,
        sacrificeToPay: true,
        key: id,
      });
    }
  }
  // Restricted mana in the pool: only for an allowed payment (used first, it is already there).
  (s.players[player]?.restrictedMana ?? []).forEach((m, i) => {
    if (!allows(s, m.restriction, m.chosen ? { chosen: m.chosen } : undefined, m.source ?? `pool:${i}`, player, purpose)) return;
    out.push({
      id: `pool:${i}`,
      ability: RESTRICTED_POOL,
      colors: [m.type],
      amount: 1,
      isCreature: false,
      sacrifice: false,
      key: `pool:${i}`,
    });
  });
  // Delve: each graveyard card pays {1} (used very last, automatic choice).
  if (purpose?.delve) {
    const keep = kept(purpose);
    for (const id of s.players[player]?.graveyard ?? []) {
      if (exclude.has(id) || keep.includes(id)) continue;
      if (purpose.only?.delve && !purpose.only.delve.includes(id)) continue;
      out.push({ id, ability: DELVE, colors: ["C"], amount: 1, isCreature: false, sacrifice: false, delve: true, key: id });
    }
  }
  // Preference: lands, then creatures, then sacrificed sources, then convoke and waterbending, then delve; the least
  // flexible first.
  // Objects chosen by the player (convoke, improvise, waterbending, delve): first, they must be used.
  const chosen = (x: ManaSource) =>
    (x.convoke && purpose?.only?.convoke) ||
    (x.waterbend && purpose?.only?.waterbend) ||
    (x.improvise && purpose?.only?.improvise) ||
    (x.delve && purpose?.only?.delve) ||
    (x.sacrificeToPay && purpose?.only?.sacrificeToPay);
  const rank = (x: ManaSource) =>
    chosen(x)
      ? -2
      : x.ability === RESTRICTED_POOL
        ? -1
        : x.sacrificeToPay
          ? 5
          : x.delve
            ? 4
            : x.convoke || x.waterbend || x.improvise
              ? 3
              : x.sacrifice
                ? 2
                : x.isCreature
                  ? 1
                  : 0;
  return out.sort((a, b) => rank(a) - rank(b) || a.colors.length - b.colors.length);
}

/**
 * `forPayment`: the automatic payment of a cost, whose restriction the solver has checked (mana added to the pool).
 * `color`: the type produced; a list for an "in any combination" source (the type of each mana, the first for the
 * remaining ones).
 */
export function activateManaAbility(
  s: GameState,
  player: PlayerId,
  id: ObjectId,
  ability: number,
  color?: ManaType | ManaType[],
  forPayment = false,
  keep: readonly ObjectId[] = [],
): void {
  const o = s.objects[id];
  if (!o || o.controller !== player) throw new RulesError(msg("You don't control this source"));
  const ab = manaAbilitiesOf(s, id)[ability];
  if (!ab || !canActivateMana(s, id, ab)) throw new RulesError(msg("Mana ability unavailable"));
  const types = Array.isArray(color) ? color : color ? [color] : [];
  if (types.length > 1 && !ab.combination) throw new RulesError(msg("This source produces a single type of mana"));
  // "In any combination" (by hand: PLAN-L L3): one type for each mana produced.
  if (types.length > 1 && types.length !== manaAmount(s, id, ab))
    throw new RulesError(msg("Choose a type for each mana produced"));
  const c = types[0] ?? ab.produce[0];
  if (!c || types.concat(c).some((m) => !ab.produce.includes(m))) throw new RulesError(msg("Invalid mana color"));
  // Type of each mana produced: those asked for, then the first for the rest.
  const unitTypes = (n: number): ManaType[] => Array.from({ length: Math.max(0, n) }, (_, k) => types[k] ?? c);
  // Undoable only if {T} is the only cost, with no other effect or trigger (Arena style).
  const simple =
    !!ab.cost.tap &&
    !ab.oncePerTurn &&
    !ab.tapAnother &&
    ab.cost.self !== "sacrifice" &&
    !ab.cost.payLife &&
    !ab.addCounter &&
    !ab.removeCounter &&
    !ab.restriction &&
    !ab.rider &&
    !ab.drawback;
  const triggersBefore = s.triggers.length;
  const poolBefore = s.players[player]?.manaPool[c] ?? 0;
  // Source sacrificed for its cost (Treasure): the amount and the mana replacements are read from its last known
  // information, before the sacrifice (Roxanne, Starfall Savant and a Treasure: two mana), as the solver counted them.
  const before = ab.cost.self === "sacrifice" ? { amount: manaAmount(s, id, ab), reps: manaReplacements(s, id, ab) } : null;
  const amountNow = () => before?.amount ?? manaAmount(s, id, ab);
  if (ab.cost.tap) tapObject(s, o, "mana");
  if (ab.oncePerTurn) s.turn.onceFired.push(`mana:${id}`);
  if (ab.tapAnother) tapObject(s, obj(s, otherToTap(s, id, ab) as ObjectId));
  if (ab.cost.self === "sacrifice") sacrifice(s, id);
  // Haunted Screen: "{T}, Pay 1 life"; Twitching Doll: "put a nest counter on this creature".
  if (ab.cost.payLife) payLife(s, player, lifeCost(s, player, id, ab.cost.payLife));
  // Cryptex: "{T}, Collect evidence 3: Add one mana…".
  if (ab.cost.collectEvidence) collectEvidence(s, player, evidenceCards(s, player, id, ab.cost.collectEvidence, keep) ?? []);
  if (ab.addCounter && s.objects[id]?.zone === "battlefield") changeCounters(s, o, ab.addCounter, 1, { by: player });
  if (ab.removeCounter && (o.counters[ab.removeCounter] ?? 0) > 0) changeCounters(s, o, ab.removeCounter, -1);
  const pool = s.players[player]?.manaPool;
  const pl = s.players[player];
  // Restricted mana ("spend this mana only to…", Woodland Weavemaster) or mana carrying an effect (Cavern of Souls:
  // "can't be countered") tapped manually: it goes into the pool tagged with its source and its choice, so that the
  // restriction and the effect apply when it is spent.
  if (!forPayment && (ab.restriction || ab.rider) && pl) {
    const tag: Omit<TaggedMana, "type"> = {
      ...(ab.restriction ? { restriction: ab.restriction } : {}),
      source: id,
      ...(o.chosen ? { chosen: o.chosen } : {}),
      ...(ab.rider ? { rider: ab.rider } : {}),
    };
    pl.restrictedMana = [...(pl.restrictedMana ?? []), ...unitTypes(amountNow()).map((type) => ({ ...tag, type }))];
  } else if (pool) for (const m of unitTypes(amountNow())) pool[m] += 1;
  // Additional mana of another type (Shimmerwilds Growth: the chosen color) or only for this type (Ultima: {C}).
  let otherBonus = false;
  for (const a of before?.reps ?? manaReplacements(s, id, ab)) {
    const same = (a.r.extraMana ?? "same") === "same";
    if ((same && !a.r.manaProduced) || (a.r.manaProduced && a.r.manaProduced !== c) || !pool) continue;
    const type: ManaType | undefined =
      a.r.extraMana === "chosen"
        ? s.objects[a.sourceId ?? ""]?.chosen?.color
        : a.r.extraMana === "any"
          ? c === "C"
            ? undefined
            : c
          : same
            ? c
            : (a.r.extraMana as ManaType);
    if (!type) continue;
    pool[type] += replacementAdd(s, a);
    if (type !== c) otherBonus = true;
  }
  const amount = (pool?.[c] ?? 0) - poolBefore;
  // Drawback (605.3b): damage dealt by the source to its controller, life gained by each opponent.
  if (ab.drawback?.damageYou && s.objects[id]) dealDamage(s, sourceFromObject(s, id), player, ab.drawback.damageYou, false);
  if (ab.drawback?.opponentsGainLife) for (const p of opponentsOf(s, player)) gainLife(s, p, ab.drawback.opponentsGainLife);
  if (simple && !otherBonus && types.length <= 1 && s.triggers.length === triggersBefore && amount > 0)
    s.manaUndo = [...(s.manaUndo ?? []), { player, source: id, color: c, amount }];
  // The pool changed: a static ability may depend on it (Ozai, the Phoenix King).
  bumpFor(s, "mana");
}

/** Undoes the tapping of a source for its mana (see `GameState.manaUndo`): it untaps, the mana disappears. */
export function undoMana(s: GameState, player: PlayerId, source: ObjectId): void {
  const entry = s.manaUndo?.find((x) => x.player === player && x.source === source);
  const o = s.objects[source];
  const pool = s.players[player]?.manaPool;
  if (!entry || !o?.tapped || !pool || pool[entry.color] < entry.amount)
    throw new RulesError(msg("This mana can no longer be undone"));
  pool[entry.color] -= entry.amount;
  o.tapped = false;
  s.manaUndo = s.manaUndo?.filter((x) => x !== entry);
  bump(s);
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

export interface PaymentPlan {
  /**
   * Mana abilities to activate. `colors`: the type of each mana of an "in any combination" source. `paid`: the generic
   * mana a sacrifice that reduces the cost pays (Dargo: {2} each, only {1} if that is all that is left).
   */
  taps: { id: ObjectId; ability: number; color: ManaType; colors?: ManaType[]; paid?: number }[];
  /** Mana spent from the pool, by type, once the abilities are activated. */
  spend: Record<ManaType, number>;
}

const zero = (): Record<ManaType, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

/**
 * Finds how to pay `cost` with the pool then the available sources.
 * Returns the payment plan, or null if it is impossible.
 */
export function solvePayment(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): PaymentPlan | null {
  // "{T}, Tap an untapped creature you control: Add one mana" (Springleaf Drum): sources of this kind share the
  // permanents to tap. A plan that uses more of them than there are available permanents is redone without one of them.
  let without = new Set(exclude);
  for (let tries = 0; tries < 8; tries++) {
    const plan = solvePaymentOnce(s, player, cost, without, purpose);
    if (!plan) return null;
    // Sources that cost life (Mana Confluence, Horizon of Progress): the total cannot exceed what the player can pay
    // (119.4: at 1 life, only one); otherwise the plan is redone without one of them.
    const lifeOf = (t: { id: ObjectId; ability: number }) =>
      t.ability >= 0 ? lifeCost(s, player, t.id, manaAbilitiesOf(s, t.id)[t.ability]?.cost.payLife) : 0;
    const lifeTaps = plan.taps.filter((t) => lifeOf(t) > 0);
    if (lifeTaps.length > 1 && lifeTaps.reduce((n, t) => n + lifeOf(t), 0) > payableLife(s, player)) {
      without = new Set([...without, (lifeTaps.at(-1) as { id: ObjectId }).id]);
      continue;
    }
    const sharing = plan.taps.filter((t) => t.ability >= 0 && manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother);
    if (sharing.length <= 1) return plan;
    const inPlan = new Set(plan.taps.map((t) => t.id));
    const creature = sharing.some((t) => manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother === "creature");
    // Relic of Legends: the permanents to tap match the filter of each source that has one.
    const filtered = sharing.filter((t) => typeof manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother === "object");
    const others = s.battlefield.filter(
      (x) =>
        !inPlan.has(x) &&
        !without.has(x) &&
        !obj(s, x).tapped &&
        obj(s, x).controller === player &&
        (!creature || isCreature(s, x)) &&
        filtered.every((t) => fitsTapAnother(s, t.id, x, manaAbilitiesOf(s, t.id)[t.ability]?.tapAnother)) &&
        manaAbilitiesOf(s, x).length === 0,
    );
    if (sharing.length <= others.length) return plan;
    without = new Set([...without, (sharing.at(-1) as { id: ObjectId }).id]);
  }
  return null;
}

function solvePaymentOnce(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): PaymentPlan | null {
  // Monocolored hybrids {2/W}: first try paying everything in color, then with more and more generic.
  const two = cost.twoHybrid ?? [];
  if (two.length > 0) {
    const masks = [...Array(1 << two.length).keys()].sort((a, b) => bitCount(a) - bitCount(b));
    for (const mask of masks) {
      const c: ManaCost = { ...cost, colored: { ...cost.colored }, twoHybrid: [] };
      two.forEach((m, i) => {
        if (mask & (1 << i)) c.generic += 2;
        else c.colored[m] = (c.colored[m] ?? 0) + 1;
      });
      const plan = solvePayment(s, player, c, exclude, purpose);
      if (plan) return plan;
    }
    return null;
  }
  const pool = { ...(s.players[player]?.manaPool ?? zero()) } as Record<ManaType, number>;
  // One source with several abilities (Tablet of Discovery: {R}, or {R}{R} for an instant or sorcery): the one that
  // produces the most first, its surplus pays the generic part.
  const listed = manaSources(s, player, exclude, purpose);
  const byKey = new Map<string, ManaSource[]>();
  for (const src of listed) byKey.set(src.key, [...(byKey.get(src.key) ?? []), src]);
  const sources = [...byKey.values()].flatMap((group) => [...group].sort((a, b) => b.amount - a.amount));
  // Symbols to pay: each accepts a set of types (one for a colored symbol, two for a hybrid).
  const pips: ManaType[][] = [];
  for (const m of MANA_TYPES) for (let i = 0; i < (cost.colored[m] ?? 0); i++) pips.push([m]);
  for (const pair of cost.hybrid ?? []) pips.push([...pair]);
  const supply = (colors: ManaType[]) =>
    colors.reduce((n, m) => n + pool[m], 0) + sources.filter((x) => x.colors.some((c) => colors.includes(c))).length;
  pips.sort((a, b) => supply(a) - supply(b));

  const used = new Set<string>();
  const taps: PaymentPlan["taps"] = [];
  const extra = zero();
  const spend = zero();
  // Surplus of "in any combination" sources: each remaining mana takes one of the types of the source.
  const wild: { colors: ManaType[]; n: number; tap: PaymentPlan["taps"][number] }[] = [];

  const assign = (i: number): boolean => {
    if (i === pips.length) return true;
    const allowed = pips[i] as ManaType[];
    // 1. The pool (free), then the surplus of sources that produce several mana.
    for (const bucket of [pool, extra]) {
      for (const m of allowed) {
        if (bucket[m] <= 0) continue;
        bucket[m] -= 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        bucket[m] += 1;
        spend[m] -= 1;
      }
    }
    for (const w of wild) {
      if (w.n <= 0) continue;
      for (const m of allowed) {
        if (!w.colors.includes(m)) continue;
        w.n -= 1;
        w.tap.colors?.push(m);
        spend[m] += 1;
        if (assign(i + 1)) return true;
        spend[m] -= 1;
        w.tap.colors?.pop();
        w.n += 1;
      }
    }
    // 2. An unused source.
    for (let k = 0; k < sources.length; k++) {
      const src = sources[k] as ManaSource;
      if (used.has(src.key)) continue;
      for (const m of allowed) {
        if (!src.colors.includes(m)) continue;
        used.add(src.key);
        const tap = { id: src.id, ability: src.ability, color: m, ...(src.combination ? { colors: [m] } : {}) };
        taps.push(tap);
        if (src.combination) wild.push({ colors: src.colors, n: src.amount - 1, tap });
        else extra[m] += src.amount - 1;
        spend[m] += 1;
        if (assign(i + 1)) return true;
        spend[m] -= 1;
        if (src.combination) wild.pop();
        else extra[m] -= src.amount - 1;
        taps.pop();
        used.delete(src.key);
      }
    }
    return false;
  };
  if (!assign(0)) return null;

  // Generic: pool (colorless first), surplus, then remaining sources in order of preference.
  let generic = cost.generic;
  for (const bucket of [pool, extra]) {
    for (const m of ["C", ...MANA_TYPES.filter((x) => x !== "C")] as ManaType[]) {
      const n = Math.min(generic, bucket[m]);
      bucket[m] -= n;
      spend[m] += n;
      generic -= n;
    }
  }
  for (const w of wild) {
    const m = w.colors[0] as ManaType;
    const n = Math.min(generic, w.n);
    for (let k = 0; k < n; k++) w.tap.colors?.push(m);
    w.n -= n;
    spend[m] += n;
    generic -= n;
  }
  // Waterbending: at most `purpose.waterbend` artifacts and creatures tapped.
  let waterbent = 0;
  for (let k = 0; k < sources.length && generic > 0; k++) {
    const src = sources[k] as ManaSource;
    if (used.has(src.key)) continue;
    if (src.waterbend && waterbent >= (purpose?.waterbend ?? 0)) continue;
    if (src.waterbend) waterbent += 1;
    const m = (src.colors[0] ?? "C") as ManaType;
    used.add(src.key);
    const n = Math.min(generic, src.amount);
    taps.push({ id: src.id, ability: src.ability, color: m, ...(src.sacrificeToPay && src.amount > 1 ? { paid: n } : {}) });
    spend[m] += n;
    generic -= n;
  }
  return generic > 0 ? null : { taps, spend };
}

function bitCount(n: number): number {
  let c = 0;
  for (let x = n; x; x >>= 1) c += x & 1;
  return c;
}

/** Maximum amount of mana available (pool + sources). */
export function availableMana(
  s: GameState,
  player: PlayerId,
  exclude: ReadonlySet<ObjectId> = new Set(),
  purpose?: ManaPurpose,
): number {
  const pool = s.players[player]?.manaPool;
  const inPool = pool ? MANA_TYPES.reduce((n, m) => n + pool[m], 0) : 0;
  // Exclusive sources (same permanent tapped): only the most productive counts.
  const best = new Map<string, number>();
  for (const src of manaSources(s, player, exclude, purpose)) best.set(src.key, Math.max(best.get(src.key) ?? 0, src.amount));
  return inPool + [...best.values()].reduce((n, a) => n + a, 0);
}

export function canPay(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): boolean {
  if (cost.phyrexian?.length) return phyrexianSplit(s, player, cost, exclude, purpose) !== null;
  return solvePayment(s, player, cost, exclude, purpose) !== null;
}

/**
 * Phyrexian mana (107.4f): each {G/P} is paid with {G} or 2 life. Automatic choice: mana first, life for the symbols
 * the available mana does not cover; `purpose.phyrexianLife`: exactly that many symbols paid with life (the engine
 * picks which ones, when their colors differ). Returns the mana cost and the life to pay.
 */
function phyrexianSplit(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): { cost: ManaCost; life: number } | null {
  const phy = cost.phyrexian ?? [];
  const life = payableLife(s, player);
  const chosen = purpose?.phyrexianLife;
  if (chosen !== undefined && (chosen < 0 || chosen > phy.length || !Number.isInteger(chosen))) return null;
  for (let k = chosen ?? 0; k <= (chosen ?? phy.length); k++) {
    if (k > 0 && life < 2 * k) break;
    // The symbols paid with mana: every subset of size n - k, distinct by colors.
    const tried = new Set<string>();
    for (let mask = 0; mask < 1 << phy.length; mask++) {
      if (bitCount(mask) !== phy.length - k) continue;
      const withMana = phy.filter((_, i) => mask & (1 << i));
      const key = [...withMana].sort().join("");
      if (tried.has(key)) continue;
      tried.add(key);
      const colored = { ...cost.colored };
      for (const m of withMana) colored[m] = (colored[m] ?? 0) + 1;
      const mana: ManaCost = { ...cost, colored, phyrexian: undefined };
      if (solvePayment(s, player, mana, exclude, purpose)) return { cost: mana, life: 2 * k };
    }
  }
  return null;
}

/** The numbers of Phyrexian symbols that can be paid with life for this cost (`legalActions`), when there is a choice. */
export function phyrexianLifeOptions(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
): number[] | undefined {
  const n = cost.phyrexian?.length ?? 0;
  if (n === 0) return undefined;
  const out: number[] = [];
  for (let k = 0; k <= n; k++) if (phyrexianSplit(s, player, cost, exclude, { ...purpose, phyrexianLife: k })) out.push(k);
  return out.length > 1 ? out : undefined;
}

/** Activates the needed sources then removes the cost from the pool. Throws if impossible. */
export function payMana(
  s: GameState,
  player: PlayerId,
  cost: ManaCost,
  exclude?: ReadonlySet<ObjectId>,
  purpose?: ManaPurpose,
  /** Receives the activations of the automatic payment: source, ability and amount produced. */
  sources?: { id: ObjectId; ab?: ManaAbilityDef; amount: number; chosen?: GameObject["chosen"] }[],
  /** Receives the mana spent, by type ("if {U}{U} was spent to cast it"). */
  spent?: Partial<Record<ManaType, number>>,
): ManaAbilityDef[] {
  if (cost.phyrexian?.length) {
    const split = phyrexianSplit(s, player, cost, exclude, purpose);
    if (!split) throw new RulesError(msg("Not enough mana"));
    if (split.life) payLife(s, player, split.life);
    cost = split.cost;
  }
  const plan = solvePayment(s, player, cost, exclude, purpose);
  if (!plan) throw new RulesError(msg("Not enough mana"));
  // The objects chosen by the player for convoke (or improvise, waterbending, delve) are all used.
  const tapped = new Set(plan.taps.map((t) => t.id));
  for (const ids of Object.values(purpose?.only ?? {}))
    if (ids?.some((id) => !tapped.has(id))) throw new RulesError(msg("Too many objects chosen to pay this cost"));
  if (spent) for (const m of MANA_TYPES) if (plan.spend[m]) spent[m] = plan.spend[m];
  if (sources) {
    for (const t of plan.taps) {
      if (t.ability === RESTRICTED_POOL) {
        // Tagged mana: its source and its effect (Cavern of Souls), with the choice frozen when produced.
        const m = s.players[player]?.restrictedMana?.[Number(t.id.slice("pool:".length))];
        sources.push({
          id: m?.source ?? t.id,
          ab: m?.rider ? ({ rider: m.rider } as ManaAbilityDef) : undefined,
          amount: 1,
          chosen: m?.chosen,
        });
        continue;
      }
      const ab = t.ability < 0 ? undefined : manaAbilitiesOf(s, t.id)[t.ability];
      sources.push({ id: t.id, ab, amount: ab ? manaAmount(s, t.id, ab) : 1 });
    }
  }
  // Mana abilities used (effects tied to the mana spent: Carnelian Orb…).
  const used = plan.taps
    .filter((t) => t.ability >= 0)
    .map((t) => manaAbilitiesOf(s, t.id)[t.ability])
    .filter((a): a is ManaAbilityDef => !!a);
  const pool = s.players[player]?.manaPool;
  if (!pool) throw new Error("Unknown player");
  const usedRestricted = new Set<number>();
  for (const t of plan.taps) {
    if (t.ability === RESTRICTED_POOL) {
      // Restricted mana from the pool: it joins the pool to be spent at once.
      usedRestricted.add(Number(t.id.slice("pool:".length)));
      pool[t.color] += 1;
    } else if (t.ability === WATERBEND) {
      // The tapped artifact or creature pays {1}.
      tapObject(s, obj(s, t.id));
      pool.C += 1;
    } else if (t.ability === CONVOKE) {
      // The tapped creature pays one mana of its color (or {1}).
      tapObject(s, obj(s, t.id));
      pool[t.color] += 1;
    } else if (t.ability === SACRIFICE_PAY) {
      // The permanent sacrificed as an additional cost pays {1} (Rottenmouth Viper), or {2} (Dargo): a reduction, which
      // never leaves mana in the pool.
      sacrifice(s, t.id);
      pool.C += t.paid ?? 1;
    } else if (t.ability === DELVE) {
      // The card exiled from your graveyard pays {1} (702.66a).
      const o = obj(s, t.id);
      emit({ type: "moved", owner: o.owner, objectId: t.id, defId: o.defId, from: "graveyard", to: "exile" });
      moveObject(s, t.id, "exile");
      pool.C += 1;
    } else activateManaAbility(s, player, t.id, t.ability, t.colors ?? t.color, true, kept(purpose, exclude));
  }
  const pl = s.players[player];
  if (pl?.restrictedMana && usedRestricted.size) {
    pl.restrictedMana = pl.restrictedMana.filter((_, i) => !usedRestricted.has(i));
    if (pl.restrictedMana.length === 0) pl.restrictedMana = undefined;
  }
  for (const m of MANA_TYPES) {
    // The solver promised this mana: a shortfall here is a bug, not an illegal decision.
    if (pool[m] < plan.spend[m]) throw new Error(`Inconsistent payment: ${m} missing`);
    pool[m] -= plan.spend[m];
  }
  // The pool changed: a static ability may depend on it (Ozai, the Phoenix King).
  bumpFor(s, "mana");
  return used;
}
