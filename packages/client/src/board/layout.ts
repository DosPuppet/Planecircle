/**
 * Battlefield layout (inspired by MTGA), without React:
 * - front row: creatures;
 * - back row: lands in piles on the left, then noncreature artifacts and enchantments;
 * - planeswalker zone on the far right, over the height of both rows (planeswalkers and battles);
 * - identical tokens grouped into "×N" piles from TOKEN_GROUP_MIN on;
 * - a row wraps onto 2 lines (or more in narrow zones) when that allows larger cards,
 *   then the cards shrink.
 */
import type { GameView, ObjectView } from "@mtgx/engine";

/** Full card (hand, stack, dialogs): height / width (styles.css --card-ratio). */
export const CARD_RATIO = 1.395;
/** Art card of the battlefield (PLAN-V, as on MTGA): height / width (styles.css --perm-ratio). */
export const PERM_RATIO = 1.2;
/** A tapped permanent leans by this angle (as on MTGA) instead of turning a quarter. */
export const TAP_DEG = 17;
const TAP = (TAP_DEG * Math.PI) / 180;
/** Width taken by a tapped art card, in card widths (its bounding box: w·cos + h·sin ≈ 1.31). */
export const TAP_W = Math.cos(TAP) + PERM_RATIO * Math.sin(TAP);
/** Size of the back row (lands, artifacts, enchantments) relative to the creatures. */
export const LAND_SCALE = 0.72;
/** Overlap of identical stacked lands (see .perm-group.pile). */
const LAND_OVERLAP = 0.74;
/** Offset of each card visible behind a token pile (see .token-stack). */
export const TOKEN_OFFSET = 0.08;
/** Cards shown behind the top card of a token pile. */
export const TOKEN_SHADOWS = 2;
/** Number of identical tokens from which they are grouped ("more than 3"). */
export const TOKEN_GROUP_MIN = 4;
/** Share of a card's height showing above its host, per attached Aura or Equipment. */
export const ATTACH_PEEK = 0.2;
/** Absolute floor: below it, the zone scrolls (overflow-y) rather than shrinking further. */
export const MIN_W = 28;
const MAX_W = 160;
/** Spacings in pixels (must match styles.css). */
export const GAP = 10;
export const SEPARATOR = 28;
const PAD_X = 28;
const LINE_GAP = 6;
/** Most lines per row: 2 are enough in a duel, more help in the narrow zones of multiplayer. */
const MAX_FRONT_LINES = 4;
const MAX_BACK_LINES = 3;
/** Fixed height: vertical margins, attackers moving forward, gap between rows. */
const FIXED_H = 40;

export interface Rows {
  creatures: ObjectView[];
  /** Noncreature planeswalkers and battles (attackable): a zone of their own, on the far right. */
  walkers: ObjectView[];
  lands: ObjectView[];
  /** Artifacts, enchantments and other noncreature, nonland permanents. */
  support: ObjectView[];
}

/** Sorts the permanents into rows by their current types (layers included). */
export function battlefieldRows(perms: ObjectView[]): Rows {
  const rows: Rows = { creatures: [], walkers: [], lands: [], support: [] };
  for (const o of perms) {
    if (o.types.includes("Creature")) rows.creatures.push(o);
    else if (o.types.includes("Planeswalker") || o.types.includes("Battle")) rows.walkers.push(o);
    else if (o.types.includes("Land")) rows.lands.push(o);
    else rows.support.push(o);
  }
  return rows;
}

/** A slot of the row: a single card, a pile of lands or a pile of tokens. */
export interface Slot {
  kind: "single" | "pile" | "tokens";
  objs: ObjectView[];
  /** Block of the back row (separated by a wider space). */
  block?: "lands" | "support";
}

function grouped(objs: ObjectView[], keyOf: (o: ObjectView) => string | null): ObjectView[][] {
  const groups: ObjectView[][] = [];
  const byKey = new Map<string, ObjectView[]>();
  for (const o of objs) {
    const key = keyOf(o);
    let g = key === null ? undefined : byKey.get(key);
    if (!g) {
      g = [];
      if (key !== null) byKey.set(key, g);
      groups.push(g);
    }
    g.push(o);
  }
  return groups;
}

/** Identical lands grouped into piles (same definition, same tapped state); those in `solo` stay alone. */
export function landGroups(lands: ObjectView[], solo?: ReadonlySet<string>): ObjectView[][] {
  return grouped(lands, (o) => (solo?.has(o.id) ? null : `${o.defId}|${o.tapped}`));
}

/** What tells two tokens apart on screen and for decisions (state, P/T, counters, abilities). */
export function tokenKey(o: ObjectView): string {
  const counters = Object.entries(o.counters)
    .filter(([, n]) => n)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    o.defId,
    o.name,
    o.controller,
    o.tapped,
    o.sick,
    o.attacking,
    o.blocking,
    o.power,
    o.toughness,
    o.damage,
    counters,
    [...o.keywords].sort(),
    o.types,
    o.chosen,
  ]);
}

/**
 * Identical tokens grouped when there are at least TOKEN_GROUP_MIN of them; the other permanents
 * (and the tokens in `solo`, which carry attachments) stay alone. The original order is kept.
 * `extraKey` adds the interface's own state (glow, chosen attacker…): two tokens in different
 * states are never grouped.
 */
export function tokenSlots(
  objs: ObjectView[],
  solo?: ReadonlySet<string>,
  extraKey: (o: ObjectView) => string = () => "",
): Slot[] {
  const groups = grouped(objs, (o) => (o.isToken && !solo?.has(o.id) ? `${tokenKey(o)}|${extraKey(o)}` : null));
  const out: Slot[] = [];
  for (const g of groups) {
    if (g.length >= TOKEN_GROUP_MIN) out.push({ kind: "tokens", objs: g });
    else for (const o of g) out.push({ kind: "single", objs: [o] });
  }
  return out;
}

/** Order of the back row, right of the lands (as on MTGA): artifacts, then enchantments, then the rest. */
function supportRank(o: ObjectView): number {
  if (o.types.includes("Artifact")) return 0;
  if (o.types.includes("Enchantment")) return 1;
  return 2;
}

/**
 * Slots of the front row (creatures), of the back row (lands, then artifacts and enchantments) and
 * of the planeswalker zone (far right, planeswalkers and battles).
 */
export function battlefieldSlots(
  rows: Rows,
  solo?: ReadonlySet<string>,
  extraKey?: (o: ObjectView) => string,
): { front: Slot[]; back: Slot[]; walkers: Slot[] } {
  const front = tokenSlots(rows.creatures, solo, extraKey);
  const support = rows.support
    .map((o, i) => ({ o, i }))
    .sort((a, b) => supportRank(a.o) - supportRank(b.o) || a.i - b.i)
    .map((x) => x.o);
  const back = [
    ...landGroups(rows.lands, solo).map((g): Slot => ({ kind: g.length > 1 ? "pile" : "single", objs: g, block: "lands" })),
    ...tokenSlots(support, solo, extraKey).map((s): Slot => ({ ...s, block: "support" })),
  ];
  const walkers = rows.walkers.map((o): Slot => ({ kind: "single", objs: [o] }));
  return { front, back, walkers };
}

/** A player's battlefield as it is drawn (by the DOM board and the 3D board alike). */
export interface BattlefieldModel {
  /** Auras and Equipment, by host permanent (whoever controls them). */
  attachments: Map<string, ObjectView[]>;
  /** Cards exiled by a permanent, by the permanent they are drawn under. */
  exiled: Map<string, ObjectView[]>;
  front: Slot[];
  back: Slot[];
  walkers: Slot[];
  /** Most cards stacked under one permanent (attachments and exiled cards). */
  depth: number;
  /** Changes when the slots, their tapped cards or the depth change: the sizes must be computed again. */
  signature: string;
}

/**
 * The battlefield of `player`: its slots, with the Auras and Equipment under their host and the cards a permanent
 * exiled under it. `uiKey`: the interface state of a token (glow, blocked, attacked player); tokens in different states
 * are not grouped.
 */
export function battlefieldModel(
  view: Pick<GameView, "battlefield" | "exile" | "exiledWith">,
  player: string,
  uiKey: (o: ObjectView) => string,
): BattlefieldModel {
  const onField = new Set(view.battlefield.map((o) => o.id));
  const isAttached = (o: ObjectView) => !!o.attachedTo && onField.has(o.attachedTo);
  const attachments = new Map<string, ObjectView[]>();
  for (const o of view.battlefield) {
    if (isAttached(o)) attachments.set(o.attachedTo as string, [...(attachments.get(o.attachedTo as string) ?? []), o]);
  }
  const exileById = new Map(view.exile.map((o) => [o.id, o]));
  const exiled = new Map<string, ObjectView[]>();
  const byId = new Map(view.battlefield.map((o) => [o.id, o]));
  for (const [source, ids] of Object.entries(view.exiledWith ?? {})) {
    const objs = ids.map((id) => exileById.get(id)).filter((o): o is ObjectView => !!o);
    // An Aura or Equipment (Sheltered by Ghosts) is drawn with its host: its exiled cards go under the host.
    const src = byId.get(source);
    const holder = src && isAttached(src) ? (src.attachedTo as string) : source;
    if (objs.length) exiled.set(holder, [...(exiled.get(holder) ?? []), ...objs]);
  }
  const perms = view.battlefield.filter((o) => o.controller === player && !isAttached(o));
  const { front, back, walkers } = battlefieldSlots(
    battlefieldRows(perms),
    new Set([...attachments.keys(), ...exiled.keys()]),
    uiKey,
  );
  const depth = Math.max(0, ...perms.map((o) => (attachments.get(o.id)?.length ?? 0) + (exiled.get(o.id)?.length ?? 0)));
  const key = (slots: Slot[]) =>
    slots.map((sl) => `${sl.kind}:${sl.objs.map((o) => `${o.id}${o.tapped ? "t" : ""}`).join("+")}`).join(",");
  return { attachments, exiled, front, back, walkers, depth, signature: `${key(front)}|${key(back)}|${key(walkers)}|${depth}` };
}

/** Width of a slot, in card widths (a tapped card takes up the width of its leaning box). */
export function slotUnits(s: Slot): number {
  const first = s.objs[0];
  const slot = first?.tapped ? TAP_W : 1;
  if (s.kind === "pile") return slot + (s.objs.length - 1) * (slot - LAND_OVERLAP);
  if (s.kind === "tokens") return slot + TOKEN_OFFSET * Math.min(TOKEN_SHADOWS, s.objs.length - 1);
  return slot;
}

/**
 * Largest card width for a line to fit in `avail` pixels, next to a reserved column
 * of `reserve` card widths at scale 1 (planeswalker zone).
 */
function lineFit(line: Slot[], avail: number, scale: number, reserve = 0): number {
  if (!line.length) return reserve ? avail / reserve : MAX_W;
  const units = line.reduce((a, s) => a + slotUnits(s), 0);
  const blocks = new Set(line.map((s) => s.block)).size;
  const fixed = GAP * (line.length - 1) + (blocks > 1 ? SEPARATOR - GAP : 0);
  return (avail - fixed) / (units * scale + reserve);
}

/**
 * Splits a row into `n` consecutive lines (order kept), minimizing the width of the most loaded
 * line (linear partition, dynamic programming: the rows are short).
 */
export function splitLines(slots: Slot[], n: number): Slot[][] {
  const k = Math.min(n, slots.length);
  if (k <= 1) return [slots];
  const units = slots.map(slotUnits);
  const prefix = [0];
  for (const u of units) prefix.push((prefix[prefix.length - 1] as number) + u);
  const sum = (i: number, j: number) => (prefix[j] as number) - (prefix[i] as number);
  // cost[l][j]: best maximum load for the first j slots in l lines; cut: start of the last line.
  const len = slots.length;
  const cost = Array.from({ length: k + 1 }, () => Array<number>(len + 1).fill(Number.POSITIVE_INFINITY));
  const cut = Array.from({ length: k + 1 }, () => Array<number>(len + 1).fill(0));
  for (let j = 1; j <= len; j++) (cost[1] as number[])[j] = sum(0, j);
  for (let l = 2; l <= k; l++) {
    for (let j = l; j <= len; j++) {
      for (let i = l - 1; i < j; i++) {
        const c = Math.max((cost[l - 1] as number[])[i] as number, sum(i, j));
        if (c < ((cost[l] as number[])[j] as number)) {
          (cost[l] as number[])[j] = c;
          (cut[l] as number[])[j] = i;
        }
      }
    }
  }
  const lines: Slot[][] = [];
  let j = len;
  for (let l = k; l >= 1; l--) {
    const i = l === 1 ? 0 : ((cut[l] as number[])[j] as number);
    lines.unshift(slots.slice(i, j));
    j = i;
  }
  return lines;
}

export interface BattlefieldFit {
  cardW: number;
  frontLines: number;
  backLines: number;
  /** Vertical step between two planeswalkers (px): a whole card, or less if they overlap. */
  walkerStep: number;
}

/** Smallest visible share of an overlapped planeswalker (name and loyalty). */
export const WALKER_MIN_PEEK = 0.22;
const WALKER_GAP = 6;

/** Vertical step of the planeswalker zone for `n` cards of width `cardW` in `height` pixels. */
export function walkerStep(n: number, cardW: number, height: number): number {
  const h = cardW * PERM_RATIO;
  const avail = height - FIXED_H / 2;
  if (n <= 1 || n * h + (n - 1) * WALKER_GAP <= avail) return h + WALKER_GAP;
  return Math.max(h * WALKER_MIN_PEEK, (avail - h) / (n - 1));
}

/**
 * Card size and number of lines per row for a zone of `width` × `height` pixels:
 * the combination that gives the largest cards, within 2 px in favor of fewer lines.
 */
export function fitBattlefield(
  width: number,
  height: number,
  front: Slot[],
  back: Slot[],
  /** Planeswalkers and battles: a column on the right, one card wide. */
  walkers: Slot[],
  /** Largest number of Auras and Equipment attached to a single card. */
  attachDepth = 0,
): BattlefieldFit {
  const reserve = walkers.length ? 1 : 0;
  const avail = width - PAD_X - (walkers.length ? SEPARATOR : 0);
  let best: { raw: number; frontLines: number; backLines: number } | undefined;
  // Fewer lines first: one more line must gain more than 2 px.
  const combos: [number, number][] = [];
  for (let f = 1; f <= MAX_FRONT_LINES; f++) for (let b = 1; b <= MAX_BACK_LINES; b++) combos.push([f, b]);
  combos.sort((x, y) => x[0] + x[1] - (y[0] + y[1]));
  for (const [f, b] of combos) {
    if ((f > 1 && front.length < f) || (b > 1 && back.length < b)) continue;
    const peek = 1 + ATTACH_PEEK * attachDepth;
    const byHeight = (height - FIXED_H - LINE_GAP * (f - 1 + b - 1)) / (PERM_RATIO * peek * (f + b * LAND_SCALE));
    const byFront = Math.min(...splitLines(front, f).map((l) => lineFit(l, avail, 1, reserve)));
    const byBack = Math.min(...splitLines(back, b).map((l) => lineFit(l, avail, LAND_SCALE, reserve)));
    // Compared before the MIN_W floor: below that threshold, the option that overflows least is kept.
    const raw = Math.min(MAX_W, byHeight, byFront, byBack);
    if (!best || raw > best.raw + 2) best = { raw, frontLines: f, backLines: b };
  }
  const cardW = best ? Math.floor(Math.max(MIN_W, best.raw)) : MAX_W;
  return {
    cardW,
    frontLines: best?.frontLines ?? 1,
    backLines: best?.backLines ?? 1,
    walkerStep: walkerStep(walkers.length, cardW, height),
  };
}

/** Natural step between two cards of the hand (share of a card's width), when there is room enough. */
export const HAND_STEP = 0.68;
/** Smallest step: the left corner of each card (name, cost) stays visible. */
export const HAND_MIN_STEP = 0.14;

/**
 * Horizontal step (px) between two cards of the hand so that `n` cards of width `cardW` fit in `width`:
 * they overlap more instead of overflowing the screen (only the HAND_MIN_STEP floor can overflow).
 */
export function fitHand(width: number, cardW: number, n: number): number {
  if (n <= 1) return cardW * HAND_STEP;
  // Margin for the fan: the tilted cards at both ends stick out by about a third of a card.
  const avail = width - cardW * 1.35;
  return Math.max(cardW * HAND_MIN_STEP, Math.min(cardW * HAND_STEP, avail / (n - 1)));
}

/** Spread of the hand's fan (degrees): flatter in a narrow hand (phone in portrait), where tilted cards would leave the screen. */
export function fanSpread(width: number, cardW: number): number {
  return cardW ? Math.min(24, (3 * width) / cardW) : 24;
}

/** The `i`th of `n` cards of the hand: its angle (degrees) and how far it sits lower (px), towards the ends of the fan. */
export function handFan(i: number, n: number, spread: number): { angle: number; lift: number } {
  const mid = (n - 1) / 2;
  return { angle: n > 1 ? (i - mid) * Math.min(4, spread / n) : 0, lift: Math.abs(i - mid) * Math.min(6, 30 / n) };
}

/** Board element that stands for an object (a single card, or the token pile that contains it). */
export function findObjectEl(id: string): Element | null {
  const esc = CSS.escape(id);
  return document.querySelector(`[data-oid="${esc}"]`) ?? document.querySelector(`[data-oids~="${esc}"]`);
}
