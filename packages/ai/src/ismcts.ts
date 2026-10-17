/**
 * ISMCTS (Information Set Monte Carlo Tree Search) for the priority decisions of the expert level, in a duel.
 *
 * The AI sees neither the opponent's hand, nor their decklist, nor the order of the libraries. At each iteration, a
 * **determinization** is drawn: the opponent's hidden cards are drawn from what was seen of them (`determinize`). One of the root options is then played (chosen by
 * UCB1, with a bias toward the options the one-move evaluation prefers), then a fast simulation (policy.ts)
 * until the start of the AI's next turn, and the resulting position is evaluated.
 *
 * The tree is limited to the root (the AI's options at this decision): with a few tens to a few hundred
 * iterations, deeper nodes would be visited too rarely to be reliable.
 */
import {
  cloneState,
  commanderOf,
  type Decision,
  fallbackDecision,
  forgetSecrets,
  type GameState,
  mayLookAt,
  opponentsOf,
  type PlayerId,
} from "@mtgx/engine";
import { evaluate, onlyRulesErrors, step } from "./evaluate";
import { priorityOptions } from "./heuristic";
import { fastPolicy } from "./policy";
import type { Profile } from "./profile";

export interface IsmctsConfig {
  rand: () => number;
  /** Fixed number of iterations (tests, tournament: reproducible). */
  iterations?: number;
  /** Otherwise, time budget (interface): we stop at the deadline. */
  ms?: number;
  /** Below it (slow machine), the search is not reliable enough: we keep the heuristic decision. */
  minIterations?: number;
  maxIterations?: number;
  /** Number of options examined at the root (passing included). */
  width?: number;
  /** Maximum number of decisions per simulation. */
  horizon?: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}

/** Assumed share of lands in an opponent's hidden cards (60-card deck with 24 lands). */
const LAND_SHARE = 0.4;
const BASICS: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

/**
 * Cards seen from an opponent: what they own on the battlefield, in their graveyard, in exile (face up)
 * and their spells on the stack. Their basic lands, those of the colors seen.
 */
function seenCards(s: GameState, p: PlayerId, me: PlayerId): { spells: string[]; lands: string[] } {
  // A card exiled face down that `me` cannot look at is not seen (406.3).
  const hidden = (id: string) => !!s.objects[id]?.exiledFaceDown && !s.objects[id]?.exiledFaceDown?.includes(me);
  const visible = [
    ...s.battlefield,
    ...(s.players[p]?.graveyard ?? []),
    ...s.exile.filter((id) => !hidden(id)),
    ...s.stack.filter((i) => i.kind === "spell" && !i.copy).map((i) => i.sourceId),
  ]
    .map((id) => s.objects[id])
    // A commander (singleton, always known) is no help to guess the hidden cards.
    .filter((o) => !!o && o.owner === p && !o.faceDown && !o.isToken && !o.cardCopy && !commanderOf(s, o));
  const defs = visible.map((o) => o?.defId as string);
  const spells = defs.filter((id) => !s.defs[id]?.types.includes("Land"));
  const colors = new Set(defs.flatMap((id) => s.defs[id]?.colors ?? []));
  const basicIds = (names: string[]) =>
    Object.values(s.defs)
      .filter((d) => names.includes(d.name) && d.supertypes.includes("Basic") && !d.isToken)
      .map((d) => d.id);
  let lands = basicIds([...colors].map((c) => BASICS[c] as string));
  if (lands.length === 0) lands = defs.filter((id) => s.defs[id]?.types.includes("Land"));
  if (lands.length === 0) lands = basicIds(Object.values(BASICS));
  return { spells, lands };
}

/**
 * A determinization of the state seen by `me` (P3 of the audit): the hidden cards of each opponent (hand and
 * library) are replaced by a draw based on their seen cards only (and basic lands of their colors),
 * in the proportion of an ordinary deck. The AI therefore takes advantage of neither their hand nor their decklist. Its
 * own library is shuffled. The engine's randomness is removed.
 */
export function determinize(s: GameState, me: PlayerId, rand: () => number, keep: ReadonlySet<string> = new Set()): GameState {
  const d = cloneState(s);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)] as T;
  for (const p of opponentsOf(d, me)) {
    const pl = d.players[p];
    if (!pl) continue;
    const { spells, lands } = seenCards(s, p, me);
    // Their face-down permanents (disguise, cloak, manifest): the hidden card is drawn too.
    for (const id of d.battlefield) {
      const o = d.objects[id];
      if (o?.faceDown && o.controller === p && spells.length && !keep.has(id)) o.faceDown = { ...o.faceDown, card: pick(spells) };
    }
    // Their cards exiled face down that `me` cannot look at (omen, Hideaway…).
    for (const id of d.exile) {
      const o = d.objects[id];
      if (o?.owner === p && o.exiledFaceDown && !o.exiledFaceDown.includes(me) && spells.length && !keep.has(id))
        o.defId = pick(spells);
    }
    // Their sideboard too (North Wind Avatar): hidden like the hand.
    for (const id of [...pl.hand, ...pl.library, ...pl.sideboard]) {
      const o = d.objects[id];
      // A commander is public (Commander): it stays what it is, even in a hand. So does a card shown to `me` now.
      if (!o || commanderOf(d, o) || keep.has(id)) continue;
      const land = spells.length === 0 || rand() < LAND_SHARE;
      const def = land && lands.length ? pick(lands) : spells.length ? pick(spells) : undefined;
      if (def) {
        o.defId = def;
        o.faceDefId = undefined;
      }
    }
    shuffleInPlace(pl.library, rand);
  }
  const mine = d.players[me];
  if (mine) {
    // A top card `me` may look at (Vizier of the Menagerie) stays on top.
    const top = mine.library[0] !== undefined && keep.has(mine.library[0]) ? mine.library.slice(0, 1) : [];
    const canonical = mine.library.slice(top.length).sort((a, b) => {
      const da = d.objects[a]?.defId ?? "";
      const db = d.objects[b]?.defId ?? "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    shuffleInPlace(canonical, rand);
    mine.library = [...top, ...canonical];
  }
  // Secret choices (701.38c): the other players' answers not yet revealed, and the secret choice of their permanents.
  forgetSecrets(d, me);
  // The engine's randomness (coin flips…) must not be known in advance either.
  d.rng = Math.floor(rand() * 2 ** 31);
  d.version += 1;
  return d;
}

/**
 * The state as the AI of seat `me` may know it (PLAN-E E14, PLAN-L L1): a determinization (`determinize`) that keeps
 * the cards shown to `me` by its pending question (a look at an opponent's hand, revealed cards to choose from) and
 * the ones it may look at any time (`mayLookAt`). The
 * object ids are kept, so a decision taken on it is valid on the real state. Earlier reveals are not tracked: they are
 * redrawn like the rest.
 */
export function forAgent(s: GameState, me: PlayerId, rand: () => number): GameState {
  // What `me` may look at any time: the top of its library (Vizier of the Menagerie), opposing face-down creatures
  // (Found Footage).
  const keep = new Set<string>(
    [s.players[me]?.library[0], ...s.battlefield].filter((id): id is string => !!id && mayLookAt(s, me, id)),
  );
  const p = s.pending;
  if (p?.kind === "choice" && p.player === me) {
    const walk = (x: unknown): void => {
      if (typeof x === "string") {
        if (s.objects[x]) keep.add(x);
      } else if (Array.isArray(x)) for (const y of x) walk(y);
      else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y);
    };
    walk(p.request);
  }
  return determinize(s, me, rand, keep);
}

const policy = fastPolicy();

/**
 * Fast simulation until the start of `me`'s next turn (or the end of the game, or `horizon` decisions).
 * A decision refused by the engine is replaced by the default decision; if that also fails, we stop.
 */
function playout(start: GameState, me: PlayerId, horizon: number): GameState {
  let d = start;
  const startTurn = d.turn.number;
  for (let i = 0; i < horizon && !d.over && d.pending; i++) {
    if (d.turn.number > startTurn && d.turn.active === me) break;
    const p = d.pending;
    try {
      d = step(d, p.player, policy(d, p.player), true);
    } catch (e) {
      onlyRulesErrors(e);
      try {
        d = step(d, p.player, fallbackDecision(d, p), true);
      } catch (e2) {
        onlyRulesErrors(e2);
        break;
      }
    }
  }
  return d;
}

const keyOf = (d: Decision) => JSON.stringify(d);

export interface Candidate {
  decision: Decision;
  /** One-move evaluation: initial bias of the search. */
  prior: number;
}

/**
 * Chooses among `cands` by ISMCTS, or `null` if too few iterations fit in the allotted time
 * (the heuristic decision is then better than a sloppy search).
 */
export function ismctsChoose(s: GameState, me: PlayerId, cands: Candidate[], cfg: IsmctsConfig): Decision | null {
  if (cands.length < 2) return cands[0]?.decision ?? null;
  const root = evaluate(s, me);
  const bestPrior = Math.max(...cands.map((c) => c.prior));
  // Initial bias: the options the one-move evaluation prefers are explored first and break the ties.
  const bias = cands.map((c) => 0.3 * sigmoid((c.prior - bestPrior) / 3));
  const n = cands.map(() => 0);
  const w = cands.map(() => 0);
  const horizon = cfg.horizon ?? 200;
  const t0 = Date.now();
  const maxIt = cfg.iterations ?? cfg.maxIterations ?? 600;
  let total = 0;
  for (let it = 0; it < maxIt * 2 && total < maxIt; it++) {
    if (cfg.iterations === undefined && Date.now() - t0 > (cfg.ms ?? 700)) break;
    // UCB1: first each option once (in the order of the one-move evaluation), then a trade-off
    // between the best averages and the little-explored options.
    let i = n.indexOf(0);
    if (i < 0) {
      let best = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < cands.length; k++) {
        const nk = n[k] as number;
        const ucb = (w[k] as number) / nk + 0.7 * Math.sqrt(Math.log(total) / nk) + (bias[k] as number) / (nk + 1);
        if (ucb > best) {
          best = ucb;
          i = k;
        }
      }
    }
    let d = determinize(s, me, cfg.rand);
    try {
      d = step(d, me, (cands[i] as Candidate).decision, true);
    } catch (e) {
      onlyRulesErrors(e);
      // Option impossible in this determinization: it does not count.
      n[i] = (n[i] as number) + 1;
      total++;
      continue;
    }
    d = playout(d, me, horizon);
    const reward = d.over ? (d.winner === me ? 1 : 0) : sigmoid((evaluate(d, me) - root) / 6);
    n[i] = (n[i] as number) + 1;
    w[i] = (w[i] as number) + reward;
    total++;
  }
  if (cfg.iterations === undefined && total < (cfg.minIterations ?? 24)) return null;
  // Most visited option (the safest); on a tie, the best average.
  let pick = 0;
  for (let k = 1; k < cands.length; k++) {
    const better =
      (n[k] as number) > (n[pick] as number) ||
      ((n[k] as number) === (n[pick] as number) && (w[k] as number) > (w[pick] as number));
    if (better) pick = k;
  }
  return (cands[pick] as Candidate).decision;
}

/**
 * Priority decision by ISMCTS, or `null`: no choice to make (a single sensible option), or too few
 * iterations in the allotted time.
 */
export function ismctsPriority(s: GameState, me: PlayerId, pr: Profile, cfg: IsmctsConfig): Decision | null {
  const found = priorityOptions(s, me, pr);
  if (!found) return null;
  if (found.forced) return found.forced;
  const width = cfg.width ?? 6;
  const pass: Decision = { type: "pass" };
  const seen = new Set<string>([keyOf(pass)]);
  const cands: Candidate[] = [{ decision: pass, prior: found.baseline }];
  for (const o of [...found.options].sort((a, b) => b.score - a.score)) {
    if (cands.length >= width) break;
    const k = keyOf(o.decision);
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push({ decision: o.decision, prior: o.score });
  }
  if (cands.length < 2) return null;
  return ismctsChoose(s, me, cands, cfg);
}
