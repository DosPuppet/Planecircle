/**
 * Hidden information audit (online play), shared by `hidden-info.test.ts` and `hidden-info-commander-*.test.ts` (split so
 * that the long audits run in parallel): at each decision of AI vs AI games, nothing that a player receives (view,
 * filtered events, faces) may cite a card that exists only in an opponent's hand or library and that was never made
 * public nor revealed to this player.
 */
import { implementedCards } from "@mtgx/cards";
import {
  type CardDef,
  type Color,
  createGame,
  fallbackDecision,
  filterEvents,
  type GameState,
  projectView,
  RulesError,
  submit,
  visibleFaces,
} from "@mtgx/engine";
import { randomCommanderDeck } from "../../../tools/random-deck";
import { mulberry32, randomAgent } from "../src";

export const ALL = implementedCards();
const BASICS: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

export function randomDeck(seed: number): CardDef[] {
  const rand = mulberry32(seed);
  const colors = (["W", "U", "B", "R", "G"] as Color[]).sort(() => rand() - 0.5).slice(0, 2);
  const spells = ALL.filter((c) => !c.types.includes("Land") && c.colors.length > 0 && c.colors.every((x) => colors.includes(x)));
  const deck: CardDef[] = [];
  for (let i = 0; i < 36; i++) deck.push(spells[Math.floor(rand() * spells.length)] as CardDef);
  for (let i = 0; i < 24; i++) deck.push(ALL.find((c) => c.name === BASICS[colors[i % 2] as Color]) as CardDef);
  return deck;
}

/** Definition ids cited anywhere in a JSON value. */
export function defIdsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) defIdsIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/defId$/i.test(k) && typeof v === "string") out.add(v);
      else if (k === "defIds" && Array.isArray(v)) for (const d of v) out.add(String(d));
      else defIdsIn(v, out);
    }
  }
  return out;
}

export const PUBLIC_ZONES = new Set(["battlefield", "graveyard", "exile", "stack", "command"]);

/** `commander`: Commander game with `n` players, random Commander decks (PLAN-E). */
export function auditGame(seed: number, opts: { players?: number; commander?: boolean } = {}): string[] {
  const players = Array.from({ length: opts.players ?? 2 }, (_, i) => `p${i + 1}`);
  const cmd = opts.commander ? players.map((_, i) => randomCommanderDeck(seed * 31 + i)) : null;
  let { state } = createGame({
    seed,
    ...(cmd ? { variant: "commander" as const } : {}),
    players: players.map((id, i) => ({
      id,
      name: id,
      deck: cmd?.[i]?.deck ?? randomDeck(seed * 31 + i),
      commanders: cmd?.[i]?.commanders,
    })),
  });
  const agents = Object.fromEntries(players.map((p, i) => [p, randomAgent(seed * 7 + i)]));
  const publicSeen = new Set<string>();
  // Each player knows their own decklist; then whatever their own decisions reveal to them.
  const known: Record<string, Set<string>> = Object.fromEntries(
    players.map((p) => [
      p,
      new Set(
        Object.values(state.objects)
          .filter((o) => o.owner === p)
          .map((o) => o.defId),
      ),
    ]),
  );
  const leaks: string[] = [];
  const check = (s: GameState, events: Parameters<typeof filterEvents>[0]) => {
    for (const o of Object.values(s.objects)) if (PUBLIC_ZONES.has(o.zone)) publicSeen.add(o.defId);
    for (const item of s.stack) publicSeen.add(item.sourceDefId);
    // A card passed through a public zone during the decision (watched in the graveyard then taken back to hand) was seen.
    for (const ev of events) if (ev.type === "moved" && ev.defId && PUBLIC_ZONES.has(ev.to)) publicSeen.add(ev.defId);
    // Cards revealed to everyone (explore...), and discarded cards (public, even if a replacement sends them elsewhere
    // than the graveyard: Nexus of Fate, Green Sun's Zenith).
    for (const ev of events) if (ev.type === "reveal" || ev.type === "discard") for (const d of ev.defIds) publicSeen.add(d);
    for (const v of players) {
      const view = projectView(s, v);
      if (view.pending?.kind === "choice") for (const o of view.pending.objects ?? []) known[v]?.add(o.defId);
      // 722 (Mindslaver): the player who controls another's turn sees everything that player can see, including their hand.
      if (s.turnControl?.by === v && s.turn.active === s.turnControl.player)
        for (const id of s.players[s.turnControl.player]?.hand ?? []) known[v]?.add(s.objects[id]?.defId ?? "");
      const secret = new Set<string>();
      for (const o of Object.values(s.objects)) {
        if (o.owner === v || (o.zone !== "hand" && o.zone !== "library")) continue;
        if (!publicSeen.has(o.defId) && !known[v]?.has(o.defId)) secret.add(o.defId);
      }
      const evs = filterEvents(events, v);
      const seen = defIdsIn([view, evs, Object.keys(visibleFaces(s, view, evs)).map((defId) => ({ defId }))]);
      for (const d of seen) {
        if (secret.has(d)) leaks.push(`seed ${seed}, tour ${s.turn.number} : ${v} voit ${d}`);
      }
    }
  };
  check(state, []);
  for (let i = 0; i < 2500 * (players.length - 1) && state.pending && !state.over && leaks.length === 0; i++) {
    const p = state.pending;
    let r: ReturnType<typeof submit>;
    try {
      r = submit(state, p.player, (agents[p.player] as ReturnType<typeof randomAgent>)(state, p.player));
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      r = submit(state, p.player, fallbackDecision(state, p));
    }
    state = r.state;
    check(state, r.events);
  }
  return leaks;
}

/** Commander with 3 and 4 players (PLAN-E): seeds `from` to `to`, odd seeds with 4 players. */
export function auditCommander(from: number, to: number): string[] {
  const leaks: string[] = [];
  for (let seed = from; seed <= to; seed++) leaks.push(...auditGame(seed, { players: 3 + (seed % 2), commander: true }));
  return leaks;
}
