/**
 * A player's view: everything public + their own hand + the options of their decision.
 * Hidden information (opponent's hand, libraries) never leaves the engine.
 */

import { copiedDefId, FACE_DOWN_WARD, textBoxOf } from "./layers";
import { legalActions } from "./legal";
import { costToText, manaValue, totalCost } from "./mana";
import { customArtSet, keyedPrinting } from "./printing";
import { abilitiesOf, castTerms, landPermitted, modesOf, spellCost } from "./stack";
import { chars, commanderOf, decider, HIDDEN_CARD_ID, isSummoningSick, obj } from "./state";
import { mayLookAt, untapStepRule } from "./statics";
import { msg } from "./text";
import { pendingTriggerSource } from "./triggers";
import { allowedDefenders, attackableDefenders, attackCandidates, blockCandidates, forcedAttacks } from "./turn";
import type {
  ActionOption,
  CardDef,
  CardType,
  CastNowRequest,
  ChoicePurpose,
  ChoiceRequest,
  Color,
  GameEvent,
  GameObject,
  GameState,
  Keyword,
  ManaType,
  ObjectId,
  PlayerId,
  Step,
  Zone,
} from "./types";

export interface CardFace {
  defId: string;
  name: string;
  typeLine: string;
  manaCost: string;
  text: string;
  image?: string;
  fr?: CardDef["fr"];
  basePower?: number;
  baseToughness?: number;
  implemented: boolean;
  isToken: boolean;
  /** Token: its colors (matching image, `tokenImage` of the cards package). */
  colors?: Color[];
  /** Attached spell of a "prepare" card (shown in the preview). */
  prepareFace?: CardDef["prepareFace"];
  /** Multi-faced card: its layout and its other faces (back face, adventure, other half). */
  layout?: CardDef["layout"];
  otherFaces?: CardDef["prepareFace"][];
  /**
   * Custom printing (`CUSTOM_PRINTING`): the interface shows the card's custom art (by its name), if there is one;
   * also on the tokens of a player whose deck uses it. A string: the art set to look in first ("custom:mario").
   */
  customArt?: true | string;
}

export interface ObjectView extends CardFace {
  id: ObjectId;
  uid: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  types: CardType[];
  subtypes: string[];
  colors: Color[];
  tapped: boolean;
  damage: number;
  counters: Record<string, number>;
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  /** Blocking rules ("can't be blocked by Humans"…): their labels. */
  blockRules?: string[];
  /**
   * Goad (701.38) and requirements of the same kind (Maximum Carnage): the goading player and the label. It attacks
   * each combat if able, and a player other than them if able. These rules are not in `blockRules`.
   */
  goaded?: { by: PlayerId; label: string }[];
  /** Protections and hexproofs "from [filter]": their labels. */
  protections?: string[];
  /** "Uses its toughness to" rules: their labels. */
  powerRules?: string[];
  /**
   * Its controller's untap step (502.3): "doesn't untap" or "may not untap" (Hedge Whisperer), from the `untap`
   * replacements limited to that step (`untapStepRule`); shown as a restriction.
   */
  untapRule?: string;
  /** Tapped for its mana, still undoable by its controller (`undoMana` decision). Only in their own view. */
  undoMana?: boolean;
  sick: boolean;
  attacking: boolean;
  blocking: ObjectId | null;
  /** Aura or Equipment: the permanent it is attached to. */
  attachedTo: ObjectId | null;
  /** Choice made as it entered (creature type, color, mode of a Siege). */
  chosen: {
    creatureType?: string;
    color?: Color;
    mode?: string;
    number?: number;
  } | null;
  /** Reality Fracture: prepared permanent (its spell can be cast from exile). */
  prepared?: boolean;
  /** Murders at Karlov Manor: suspected creature (menace, can't block). */
  suspected?: boolean;
  /** Monstrous (701.37b): a designation, shown as a badge. */
  monstrous?: boolean;
  /** Class: level reached (beyond 1); Case: solved. */
  classLevel?: number;
  solved?: boolean;
  /** The viewer's face-down permanent (or spell): the real card, which only they know (708.5). */
  faceDownCard?: CardFace;
  /** Cost of its ward (printed or granted), for display: "{2}", "3 life"… */
  ward?: string;
  /**
   * Activated abilities of a permanent (mana abilities excluded), activatable or not: the interface shows those that
   * are not right now (unpayable cost, no target, timing) instead of hiding them. `index`: the one of `activate`.
   */
  activated?: { index: number; label: string; cost: string }[];
  /**
   * Playable card of the viewer's hand (or outside their hand) whose mana cost to pay differs from the printed cost:
   * reductions and taxes, flashback, imposed alternative cost… `delta`: mana value difference (negative: cheaper).
   */
  castCost?: { text: string; delta: number };
  /** Layer 3 (612): the text box it has instead of its own (Deadpool, Trading Card), shown with the card. */
  textBox?: CardFace;
}

export interface StackItemView extends CardFace {
  id: string;
  uid: string;
  kind: "spell" | "ability";
  controller: PlayerId;
  sourceId: ObjectId;
  targets: string[];
  x: number;
  kicked: boolean;
  mode: number;
  /** Copy of a spell (Thousand-Year Storm). */
  copy: boolean;
  /** The effect played, when the card has several: chosen mode of a modal spell, or ability (activated, triggered). */
  effect?: string;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  life: number;
  libraryCount: number;
  handCount: number;
  graveyard: ObjectView[];
  manaPool: Record<ManaType, number>;
  /** Restricted mana of the pool ("spend this mana only to…"), by type; absent when there is none. */
  restrictedMana?: ManaType[];
  lost: boolean;
  /**
   * Their deck uses the custom printing: the back of their hidden cards is the custom back, if there is one (a string:
   * that of their art set first).
   */
  customArt?: true | string;
  /** Emblems (command zone). */
  /** Emblems (114); `id`: the object, source of an emblem's activated abilities (Karn, Living Legacy). */
  emblems: { id: ObjectId; name: string; text: string }[];
  /**
   * Commander (PLAN-E): this player's commanders (public information), their zone, their object when it is in a
   * public zone, and the tax of their next cast from the command zone (903.8).
   */
  commanders?: { defId: string; zone: Zone; id?: ObjectId; tax: number }[];
  /** Commander: combat damage received from each commander (903.10a; 21 from the same commander, the player loses). */
  commanderDamage?: { defId: string; owner: PlayerId; amount: number }[];
  /** Speed (702.179), absent until it has started. */
  speed?: number;
  /** The city's blessing (702.131, ascend), absent until the player has it. */
  citysBlessing?: true;
  /** Monarch (724), absent if the player is not. */
  monarch?: true;
  /** Poison counters (104.3d: 10 or more, the player loses), absent when they have none. */
  poison?: number;
  /** Rad counters (Fallout), absent when they have none. */
  rad?: number;
}

export type PendingView =
  | { kind: "mulligan"; player: PlayerId; mulligans: number; bottom: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  /** `castNow`: cast a card during a resolution (608.2g), only for the deciding player. */
  | { kind: "priority"; player: PlayerId; actions?: ActionOption[]; castNow?: CastNowRequest }
  /** `defenders`: attackable opponents and opposing planeswalkers. */
  /**
   * `forced`: the required attacks (508.1d), preselected by the interface; `allowed`: what a creature that can't attack
   * all the `defenders` can attack ("can't attack you").
   */
  | {
      kind: "declareAttackers";
      player: PlayerId;
      candidates?: ObjectId[];
      defenders?: string[];
      forced?: { id: ObjectId; defender: string }[];
      allowed?: Record<ObjectId, string[]>;
    }
  | { kind: "declareBlockers"; player: PlayerId; candidates?: { blocker: ObjectId; attackers: ObjectId[] }[] }
  | { kind: "discard"; player: PlayerId; count: number }
  | {
      kind: "choice";
      player: PlayerId;
      /** Present only for the choosing player. */
      request?: ChoiceRequest;
      purpose?: ChoicePurpose;
      /** Objects mentioned by the request (hidden ones included, e.g. top of library for a scry). */
      objects?: ObjectView[];
      /** Trigger whose targets or mode are being chosen: its card and its ability (not yet on the stack). */
      source?: { face: CardFace; effect?: string };
    };

export interface GameView {
  viewer: PlayerId;
  /** All the other players (eliminated ones included), in turn order starting from the next one. */
  opponents: PlayerId[];
  turn: { number: number; active: PlayerId; step: Step; landsPlayed: number };
  /** 722: player whose controller makes the current decision (their hand then replaces `hand`). */
  controlling?: PlayerId;
  players: Record<PlayerId, PlayerView>;
  hand: ObjectView[];
  battlefield: ObjectView[];
  stack: StackItemView[];
  exile: ObjectView[];
  /**
   * Cards exiled "by" a permanent still on the battlefield (Sheltered by Ghosts, Deep-Cavern Bat, linked cards,
   * materials of a craft): permanent id → exiled cards. Public information.
   */
  exiledWith: Record<ObjectId, ObjectId[]>;
  /**
   * Cards outside the hand that the viewer can play (shown at the end of their hand, `zone` says where they come from):
   * playable exiled cards (Chandra, prepared spells), from the graveyard (flashback, Icetill Explorer, abilities
   * activatable from the graveyard), top of the library (Vizier of the Menagerie).
   */
  playableElsewhere: ObjectView[];
  combat: { attackers: { id: ObjectId; defender: string; blockers: ObjectId[] }[] } | null;
  pending: PendingView | null;
  /** Number of the viewer's creatures that could attack this turn (for the interface). */
  potentialAttackers: number;
  over: boolean;
  winner: PlayerId | null;
}

/** Cards in exile tied to the permanent that exiled them (linked "until…" exile and linked cards). */
function exiledWith(s: GameState): Record<ObjectId, ObjectId[]> {
  const out: Record<ObjectId, ObjectId[]> = {};
  const add = (source: ObjectId, cards: ObjectId[]) => {
    if (s.objects[source]?.zone !== "battlefield") return;
    const exiled = cards.filter((id) => s.objects[id]?.zone === "exile" && !out[source]?.includes(id));
    if (exiled.length) out[source] = [...(out[source] ?? []), ...exiled];
  };
  for (const l of s.linkedExile) add(l.sourceId, l.cards);
  for (const id of s.battlefield) add(id, s.objects[id]?.linked ?? []);
  return out;
}

/** An ability label and its chosen mode, as one text ("label — mode"); either one alone, else the fallback. */
function withMode(label: string | undefined, mode: string | undefined, fallback: string): string {
  if (label && mode) return msg("{ability} — {mode}", { ability: label, mode });
  return label || mode || fallback;
}

/** Label of the effect played: mode of a modal spell (spree, tiered…), or ability of a permanent. */
function playedEffect(s: GameState, item: GameState["stack"][number]): string | undefined {
  const d = s.defs[item.sourceDefId];
  if (!d) return undefined;
  if (item.kind === "spell") {
    const modes = modesOf(d);
    return modes.length > 1 ? modes[item.mode]?.label : undefined;
  }
  if (item.inline) {
    const mode = item.inline.modes?.[item.mode]?.label;
    return withMode(item.inline.label, mode, msg("Ability"));
  }
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered" && ab.modes) {
    const mode = ab.modes[item.mode]?.label;
    return withMode(ab.label, mode, msg("Triggered ability"));
  }
  if (ab?.kind === "triggered") return ab.label ?? msg("Triggered ability");
  if (ab?.kind === "activated") return ab.label ?? msg("Activated ability");
  return msg("Ability");
}

/**
 * What the interface offers to declare attackers: the creatures, the defenders, the required attacks (508.1d,
 * preselected) and, for a creature that can't attack all the defenders, those it can attack.
 */
function attackChoices(
  s: GameState,
  who: PlayerId,
): {
  candidates: ObjectId[];
  defenders: string[];
  forced?: { id: ObjectId; defender: string }[];
  allowed?: Record<ObjectId, string[]>;
} {
  const candidates = attackCandidates(s, who);
  const defenders = attackableDefenders(s, who);
  const forced = forcedAttacks(s, who);
  const allowed: Record<ObjectId, string[]> = {};
  for (const id of candidates) {
    const mine = allowedDefenders(s, id);
    if (mine.length < defenders.length) allowed[id] = mine;
  }
  return {
    candidates,
    defenders,
    ...(forced.length ? { forced } : {}),
    ...(Object.keys(allowed).length ? { allowed } : {}),
  };
}

export function cardFace(d: CardDef): CardFace {
  return {
    defId: d.id,
    name: d.name,
    typeLine: d.typeLine,
    manaCost: d.manaCostText || costToText(d.manaCost),
    text: d.text,
    image: d.image,
    fr: d.fr,
    basePower: d.power,
    baseToughness: d.toughness,
    implemented: d.implemented,
    isToken: !!d.isToken,
    ...(d.isToken ? { colors: d.colors } : {}),
    ...(d.prepareFace ? { prepareFace: d.prepareFace } : {}),
    ...(d.layout ? { layout: d.layout, otherFaces: otherFaces(d) } : {}),
  };
}

/**
 * The faces other than the displayed one (for the preview): the back face, the adventure, or the two halves of a split
 * card. A face has its own image only when it is printed separately (back face of a double-faced card).
 */
function otherFaces(d: CardDef): NonNullable<CardFace["otherFaces"]> {
  const faces = d.faceDefs ?? [];
  // Split card: its two halves (not the fused face, 702.102).
  return (d.layout === "split" ? faces.slice(0, 2) : faces.slice(1)).map((f) => ({
    name: f.name,
    manaCost: f.manaCostText,
    typeLine: f.typeLine,
    text: f.text,
    image: f.image !== d.image ? f.image : undefined,
    fr: f.fr
      ? { name: f.fr.name, typeLine: f.fr.typeLine, text: f.fr.text, image: f.fr.image !== d.fr?.image ? f.fr.image : undefined }
      : undefined,
  }));
}

/**
 * The art of the printing chosen by the deck (PLAN-G: a reprint), for the printed face of the card itself; a copy or
 * another side keep their own.
 */
function printedFace(s: GameState, uid: string, defId: string, d: CardDef): CardFace {
  const face = cardFace(d);
  const key = s.printings?.[uid];
  const set = customArtSet(key);
  if (set !== undefined) return d.id === defId ? { ...face, customArt: set || true } : face;
  const p = key && d.id === defId ? (d.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
  if (!p?.image) return face;
  return { ...face, image: p.image, ...(face.fr ? { fr: { ...face.fr, image: p.frImage ?? p.image } } : {}) };
}

const NO_OWNERS: ReadonlyMap<PlayerId, true | string> = new Map();
/**
 * Players whose deck uses the custom printing, with their art set (the most frequent among their cards; `true`: the
 * plain custom printing), per printing table (fixed when the game is created).
 */
const customOwnersCache = new WeakMap<object, ReadonlyMap<PlayerId, true | string>>();
function customArtOwners(s: GameState): ReadonlyMap<PlayerId, true | string> {
  const printings = s.printings;
  if (!printings) return NO_OWNERS;
  let owners = customOwnersCache.get(printings);
  if (!owners) {
    const tally = new Map<PlayerId, Map<string, number>>();
    for (const o of Object.values(s.objects)) {
      const set = customArtSet(printings[o.uid]);
      if (set === undefined) continue;
      const t = tally.get(o.owner) ?? new Map<string, number>();
      t.set(set, (t.get(set) ?? 0) + 1);
      tally.set(o.owner, t);
    }
    const found = new Map<PlayerId, true | string>();
    for (const [p, t] of tally) {
      const best = [...t].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "";
      found.set(p, best || true);
    }
    owners = found;
    customOwnersCache.set(printings, owners);
  }
  return owners;
}

/** `ObjectView.untapRule` of a permanent. */
function untapRuleView(s: GameState, id: ObjectId | undefined): { untapRule?: string } {
  const rule = id ? untapStepRule(s, id) : undefined;
  if (!rule) return {};
  return { untapRule: rule === true ? msg("Doesn't untap during the untap step") : msg("May not untap") };
}

export function objectView(s: GameState, id: ObjectId): ObjectView {
  const o = obj(s, id);
  // A copy (layer 1) is shown with the face of what it copies.
  const d = s.defs[o.zone === "battlefield" ? copiedDefId(s, id) : (o.faceDefId ?? o.defId)] as CardDef;
  const c = chars(s, id);
  const isCreature = c.types.includes("Creature");
  const attacking = !!s.combat?.attackers.some((a) => a.id === id);
  const blocking = s.combat?.blockers.find((b) => b.id === id)?.attacker ?? null;
  return {
    ...printedFace(s, o.uid, o.defId, d),
    // Token of a player whose deck uses custom art: its own, if there is one.
    ...(o.isToken && customArtOwners(s).has(o.owner) ? { customArt: customArtOwners(s).get(o.owner) } : {}),
    id,
    uid: o.uid,
    owner: o.owner,
    controller: o.controller,
    zone: o.zone,
    types: c.types,
    subtypes: c.subtypes,
    colors: c.colors,
    tapped: o.tapped,
    damage: o.damage,
    counters: { ...o.counters },
    power: isCreature ? c.power : undefined,
    toughness: isCreature ? c.toughness : undefined,
    keywords: c.keywords,
    ...(c.blockRules.some((r) => !r.goadedBy) ? { blockRules: c.blockRules.filter((r) => !r.goadedBy).map((r) => r.label) } : {}),
    ...(c.blockRules.some((r) => r.goadedBy && r.goadedBy !== "you")
      ? {
          goaded: c.blockRules
            .filter((r) => r.goadedBy && r.goadedBy !== "you")
            .map((r) => ({ by: r.goadedBy as PlayerId, label: r.label })),
        }
      : {}),
    ...(c.protections.length ? { protections: c.protections.map((r) => r.label) } : {}),
    ...(c.powerRules.length ? { powerRules: c.powerRules.map((r) => r.label) } : {}),
    ...untapRuleView(s, o.zone === "battlefield" ? id : undefined),
    sick: o.zone === "battlefield" && isSummoningSick(s, id),
    attacking,
    blocking,
    attachedTo: o.attachedTo ?? null,
    chosen: o.chosen ?? null,
    name: c.name,
    ...(o.preparedCopy && s.objects[o.preparedCopy] ? { prepared: true } : {}),
    ...(o.suspected && o.zone === "battlefield" ? { suspected: true } : {}),
    ...(o.monstrous && o.zone === "battlefield" ? { monstrous: true } : {}),
    ...(o.classLevel && o.classLevel > 1 ? { classLevel: o.classLevel } : {}),
    ...(o.solved ? { solved: true } : {}),
    ...(c.keywords.includes("ward") ? { ward: wardCost(c.abilities) } : {}),
    ...textBoxView(s, id),
    ...activatedView(o.zone === "battlefield" ? c.abilities : []),
  };
}

/** An exchanged text box (Deadpool, Trading Card): the face whose text it has. */
function textBoxView(s: GameState, id: ObjectId): Pick<ObjectView, "textBox"> {
  const text = s.objects[id]?.zone === "battlefield" ? textBoxOf(s, id) : undefined;
  const d = text ? s.defs[text] : undefined;
  return d ? { textBox: cardFace(d) } : {};
}

/** Abilities activated from the battlefield, with a label and their cost (mana and {T}). */
function activatedView(abilities: CardDef["abilities"]): Pick<ObjectView, "activated"> {
  const out: NonNullable<ObjectView["activated"]> = [];
  abilities.forEach((ab, index) => {
    if (ab.kind !== "activated" || ab.fromGraveyard || ab.fromHand) return;
    const cost = [ab.cost.mana ? costToText(ab.cost.mana) : "", ab.cost.tap ? "{T}" : ""].filter(Boolean).join(", ");
    out.push({ index, label: ab.label ?? msg("Activated ability"), cost });
  });
  return out.length ? { activated: out } : {};
}

/** Joins texts into one: `{a} and {b}` (several parts nest, left to right). */
function joinAnd(parts: string[]): string {
  return parts.reduce((a, b) => msg("{a} and {b}", { a, b }));
}

/**
 * Cost of the ward (702.21) read in its triggered ability: "unless … pays …". The ward {2} of a face-down permanent is
 * not shown.
 */
function wardCost(abilities: CardDef["abilities"]): string | undefined {
  const costs = abilities.flatMap((ab) => {
    if (ab.kind !== "triggered" || ab.trigger.on !== "becomesTarget" || !ab.ward || ab === FACE_DOWN_WARD) return [];
    const pay = ab.effects[0];
    if (pay?.op !== "unlessPay") return [];
    const parts = [
      pay.mana ? costToText(pay.mana) : "",
      pay.life ? msg("ctx:short|{n} life", { n: pay.life }) : "",
      pay.lifeAmount ? msg("life equal to its power") : "",
      pay.discard ? (pay.discardRandom ? msg("a card at random") : msg("discard a card")) : "",
      pay.sacrifice
        ? pay.sacrificeFilter?.types?.includes("Creature")
          ? msg("sacrifice {n} creature(s)", { n: pay.sacrifice })
          : pay.sacrificeFilter?.notTypes?.includes("Land")
            ? msg("sacrifice {n} nonland permanents", { n: pay.sacrifice })
            : msg("sacrifice {n} permanents", { n: pay.sacrifice })
        : "",
      pay.collectEvidence ? msg("collect evidence {n}", { n: pay.collectEvidence }) : "",
    ].filter(Boolean);
    return parts.length ? [joinAnd(parts)] : [];
  });
  return costs.length ? costs.reduce((a, b) => msg("{a}, {b}", { a, b })) : undefined;
}

/** 708.5: the controller of a face-down permanent can look at it; the other players can't. */
function withFaceDownCard(s: GameState, v: ObjectView, viewer: PlayerId): ObjectView {
  const o = s.objects[v.id];
  // Found Footage: "you may look at face-down creatures your opponents control any time".
  const sees = o?.controller === viewer || (!!o && mayLookAt(s, viewer, o.id));
  const card = o?.faceDown && sees ? s.defs[o.faceDown.card] : undefined;
  return card ? { ...v, faceDownCard: cardFace(card) } : v;
}

/** A card exiled face down that the viewer can't look at: its back only (406.3). */
function hiddenTo(s: GameState, id: ObjectId, viewer: PlayerId): boolean {
  const seen = s.objects[id]?.exiledFaceDown;
  return !!seen && !seen.includes(viewer);
}

function exiledView(s: GameState, id: ObjectId, viewer: PlayerId): ObjectView {
  const v = objectView(s, id);
  if (!hiddenTo(s, id, viewer)) return v;
  // Nothing but the object itself: no name, no types, no abilities; its counters stay visible.
  return {
    defId: HIDDEN_CARD_ID,
    name: "",
    typeLine: msg("Face-down card"),
    manaCost: "",
    text: "",
    implemented: true,
    isToken: false,
    id: v.id,
    uid: v.uid,
    owner: v.owner,
    controller: v.controller,
    zone: v.zone,
    types: [],
    subtypes: [],
    colors: [],
    tapped: false,
    damage: 0,
    counters: v.counters,
    keywords: [],
    sick: false,
    attacking: false,
    blocking: null,
    attachedTo: null,
    chosen: null,
  };
}

/** Public zones where a commander's object is shown (only its zone elsewhere: hand, library). */
const PUBLIC_ZONES: readonly Zone[] = ["command", "battlefield", "stack", "graveyard", "exile"];

/** Commander (PLAN-E): a player's commanders and the commander damage they have received. */
function commanderViews(s: GameState, p: PlayerId): Pick<PlayerView, "commanders" | "commanderDamage"> {
  // An eliminated player has left the game with their cards (800.4a): nothing left to show.
  if (s.players[p]?.lost) return {};
  const cards = s.commander?.cards ?? {};
  const where = new Map<string, GameObject>();
  for (const o of Object.values(s.objects)) if (cards[o.uid] && commanderOf(s, o)) where.set(o.uid, o);
  const commanders: NonNullable<PlayerView["commanders"]> = [];
  const commanderDamage: NonNullable<PlayerView["commanderDamage"]> = [];
  for (const [uid, rec] of Object.entries(cards)) {
    if (rec.owner === p) {
      const o = where.get(uid);
      const shown = o && PUBLIC_ZONES.includes(o.zone) && !o.faceDown;
      commanders.push({ defId: rec.defId, zone: o?.zone ?? "exile", ...(shown ? { id: o.id } : {}), tax: 2 * rec.casts });
    }
    const amount = rec.damage[p] ?? 0;
    if (amount > 0) commanderDamage.push({ defId: rec.defId, owner: rec.owner, amount });
  }
  return { commanders, ...(commanderDamage.length ? { commanderDamage } : {}) };
}

export function projectView(s: GameState, viewer: PlayerId): GameView {
  const players: Record<PlayerId, PlayerView> = {};
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    players[p] = {
      id: p,
      name: pl.name,
      life: pl.life,
      libraryCount: pl.library.length,
      handCount: pl.hand.length,
      speed: pl.speed,
      ...(pl.designations?.includes("citysBlessing") ? { citysBlessing: true as const } : {}),
      ...(s.monarch === p ? { monarch: true as const } : {}),
      ...(pl.counters?.poison ? { poison: pl.counters.poison } : {}),
      ...(pl.counters?.rad ? { rad: pl.counters.rad } : {}),
      graveyard: pl.graveyard.map((id) => objectView(s, id)),
      manaPool: { ...pl.manaPool },
      ...(pl.restrictedMana?.length ? { restrictedMana: pl.restrictedMana.map((m) => m.type) } : {}),
      lost: pl.lost,
      ...(customArtOwners(s).has(p) ? { customArt: customArtOwners(s).get(p) } : {}),
      emblems: pl.command
        .filter((id) => obj(s, id).isToken)
        .map((id) => {
          const d = s.defs[obj(s, id).defId];
          return { id, name: d?.name ?? msg("Emblem"), text: d?.text ?? "" };
        }),
      ...(s.commander ? commanderViews(s, p) : {}),
    };
  }

  const stack: StackItemView[] = s.stack.map((item) => {
    const d = s.defs[item.sourceDefId] as CardDef;
    // The spell, or the source of the ability (on the battlefield, otherwise its last known information): the art of
    // its printing (reprint, custom art); a token of a player whose deck uses custom art, its own.
    const src = s.objects[item.sourceId] ?? (item.kind === "ability" ? s.lki[item.sourceId] : undefined);
    const owner = src && "owner" in src ? src.owner : undefined;
    const tokenArt = item.kind === "ability" && src?.isToken && owner ? customArtOwners(s).get(owner) : undefined;
    return {
      ...(src?.uid ? printedFace(s, src.uid, src.defId, d) : cardFace(d)),
      ...(tokenArt ? { customArt: tokenArt } : {}),
      id: item.id,
      uid: s.objects[item.sourceId]?.uid ?? item.id,
      kind: item.kind,
      controller: item.controller,
      sourceId: item.sourceId,
      targets: Object.values(item.targets).flat(),
      x: item.x,
      kicked: item.kicked,
      mode: item.mode,
      copy: item.copy ?? false,
      ...(playedEffect(s, item) ? { effect: playedEffect(s, item) } : {}),
    };
  });

  let pending: PendingView | null = null;
  // 722: the player who controls the turn sees the decision as their own (options of the controlled player).
  const actor = decider(s);
  const p = s.pending ? { ...s.pending, player: actor ?? s.pending.player } : null;
  const who = s.pending?.player ?? viewer;
  if (p) {
    const mine = p.player === viewer;
    switch (p.kind) {
      case "priority":
        pending = mine ? { ...p, actions: legalActions(s, who) } : { kind: "priority", player: p.player };
        break;
      case "declareAttackers":
        pending = mine ? { ...p, ...attackChoices(s, who) } : { ...p };
        break;
      case "declareBlockers":
        pending = mine ? { ...p, candidates: blockCandidates(s, who) } : { ...p };
        break;
      case "choice": {
        if (!mine) {
          pending = { kind: "choice", player: p.player };
          break;
        }
        const r = p.request;
        const ids = r.type === "pick" ? r.options : r.type === "order" ? r.items : r.type === "divide" ? r.among : [];
        pending = { ...p, objects: ids.filter((id) => s.objects[id]).map((id) => objectView(s, id)) };
        const trig =
          p.purpose.kind === "triggerTarget" || p.purpose.kind === "triggerMode"
            ? pendingTriggerSource(s, p.purpose.trigger)
            : null;
        const def = trig ? s.defs[trig.defId] : undefined;
        if (trig && def) pending.source = { face: cardFace(def), ...(trig.label ? { effect: trig.label } : {}) };
        // New targets of a copy, division: the stack item concerned.
        const purpose = p.purpose;
        const onStack = purpose.kind === "stackChoice" ? stack.find((x) => x.id === purpose.stackId) : undefined;
        if (onStack) pending.source = { face: onStack, ...(onStack.effect ? { effect: onStack.effect } : {}) };
        break;
      }
      default:
        pending = { ...p };
    }
  }

  // During a controlled turn, the controller sees and plays the controlled player's hand when deciding for them.
  const handOwner = actor === viewer && who !== viewer ? who : viewer;
  return {
    viewer,
    opponents: (() => {
      const i = s.playerOrder.indexOf(viewer);
      return [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
    })(),
    turn: { number: s.turn.number, active: s.turn.active, step: s.turn.step, landsPlayed: s.turn.landsPlayed },
    players,
    hand: (s.players[handOwner]?.hand ?? []).map((id) => withCastCost(s, handOwner, objectView(s, id))),
    controlling: actor === viewer && who !== viewer ? who : undefined,
    battlefield: s.battlefield.map((id) => {
      const o0 = withFaceDownCard(s, objectView(s, id), viewer);
      // A Killer Among Us: a secret choice is shown only to its controller.
      const o = s.objects[id]?.chosen?.secret && s.objects[id]?.controller !== viewer ? { ...o0, chosen: null } : o0;
      return s.manaUndo?.some((u) => u.player === viewer && u.source === id) ? { ...o, undoMana: true } : o;
    }),
    stack,
    exile: s.exile.map((id) => exiledView(s, id, viewer)),
    exiledWith: exiledWith(s),
    playableElsewhere: [
      // Their commander in the command zone (903.8), always shown: the badge gives its tax.
      ...(s.players[viewer]?.command ?? []).filter((id) => commanderOf(s, s.objects[id])),
      ...s.exile.filter((id) => castTerms(s, viewer, id) || landPermitted(s, viewer, id)),
      // Graveyards (their own, and the others' with a permission: Tinybones).
      ...s.playerOrder.flatMap((p) =>
        (s.players[p]?.graveyard ?? []).filter(
          (id) =>
            castTerms(s, viewer, id) ||
            landPermitted(s, viewer, id) ||
            (s.objects[id]?.owner === viewer && abilitiesOf(s, id).some((ab) => ab.kind === "activated" && ab.fromGraveyard)),
        ),
      ),
      // "You may look at the top card of your library any time": Vizier of the Menagerie, and any permission to play
      // from the top of the library (family C).
      ...(s.players[viewer]?.library.slice(0, 1) ?? []).filter((id) => mayLookAt(s, viewer, id)),
    ].map((id) => withCastCost(s, viewer, objectView(s, id))),
    combat: s.combat
      ? { attackers: s.combat.attackers.map((a) => ({ id: a.id, defender: a.defender, blockers: [...a.blockers] })) }
      : null,
    pending,
    potentialAttackers: s.turn.active === viewer ? attackCandidates(s, viewer).length : 0,
    over: s.over,
    winner: s.winner,
  };
}

const HIDDEN_ZONES: ReadonlySet<Zone> = new Set(["hand", "library"]);

/**
 * Removes from the events the information hidden from the viewer: cards drawn by another player,
 * another player's cards moved from one hidden zone to another (search into the hand, put back
 * into the library…).
 */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  // Cards looked at by another player (Gitaxian Probe): the event isn't sent at all.
  return events
    .filter((e) => !(e.type === "reveal" && e.look && e.player !== viewer))
    .map((e) => {
      if (e.type === "draw" && e.player !== viewer) return { type: "draw", player: e.player };
      if (e.type === "moved" && e.owner !== viewer && HIDDEN_ZONES.has(e.from) && HIDDEN_ZONES.has(e.to)) {
        return { type: "moved", owner: e.owner, from: e.from, to: e.to };
      }
      // Exiled face down (406.3): only the players who can look at it see it go by.
      if (e.type === "moved" && e.faceDown && !e.faceDown.includes(viewer)) {
        return { type: "moved", owner: e.owner, objectId: e.objectId, from: e.from, to: e.to };
      }
      // Foretell: the exiled card is known only to its owner.
      if (e.type === "foretold" && e.player !== viewer) return { type: "foretold", player: e.player, defId: HIDDEN_CARD_ID };
      return e;
    });
}

const DEF_KEYS = new Set(["defId", "sourceDefId", "targetDefId", "attackerDefId", "blockerDefId", "toDefId"]);

/** Definition ids cited in a JSON value (view, events). */
function collectDefIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectDefIds(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (DEF_KEYS.has(k) && typeof v === "string") {
        out.add(v);
      } else if (k === "defIds" && Array.isArray(v)) {
        for (const d of v) if (typeof d === "string") out.add(d);
      } else {
        collectDefIds(v, out);
      }
    }
  } else if (typeof value === "string" && value.includes("⟦")) {
    // Cards cited in a text (`cardRef`: a prompt, an ability label): the reader needs their face to name them.
    for (const m of value.matchAll(/⟦([^⟧]+)⟧/g)) out.add(m[1] as string);
  }
}

/**
 * Faces of the cards the viewer is allowed to know: those cited by their view and their
 * filtered events (never the whole opposing decklist).
 */
export function visibleFaces(s: GameState, view: GameView, events: GameEvent[]): Record<string, CardFace> {
  const ids = new Set<string>();
  collectDefIds(view, ids);
  collectDefIds(events, ids);
  const out: Record<string, CardFace> = {};
  for (const id of ids) {
    const d = s.defs[id];
    if (d) out[id] = cardFace(d);
    else if (id === HIDDEN_CARD_ID)
      out[id] = {
        defId: id,
        name: "",
        typeLine: msg("Face-down card"),
        manaCost: "",
        text: "",
        implemented: true,
        isToken: false,
      };
  }
  return out;
}

/** Cost to pay to cast this card, if it differs from the printed cost (shown on the card in the hand). */
function withCastCost(s: GameState, player: PlayerId, v: ObjectView): ObjectView {
  const o = s.objects[v.id];
  const d = o ? s.defs[o.defId] : undefined;
  if (!o || !d?.manaCost || d.types.includes("Land")) return v;
  const terms = castTerms(s, player, v.id);
  if (!terms) return v;
  const flashback = terms.source === "flashback";
  let cost = spellCost(s, player, d, {
    flashback,
    mayhem: terms.mayhem,
    costOverride: terms.costOverride,
    fromZone: terms.source,
    free: terms.free,
    card: v.id,
  });
  if (terms.extraCost) cost = totalCost(cost, 0, { generic: terms.extraCost, colored: {}, x: 0 });
  // X is still to be chosen: it is shown as is.
  const shown = { ...cost, x: terms.free ? 0 : ((flashback ? d.flashback : d.manaCost)?.x ?? 0) };
  const text = costToText(shown);
  if (text === costToText(d.manaCost)) return v;
  return { ...v, castCost: { text, delta: manaValue(shown) - manaValue(d.manaCost) } };
}
