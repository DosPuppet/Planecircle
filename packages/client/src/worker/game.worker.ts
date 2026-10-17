/**
 * Game against the AI, entirely in the browser: the engine, the autopilot and the AI
 * run here, off the interface thread.
 */
import { aiAgent } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import {
  type CardDef,
  createObject,
  createRecordedGame,
  createTokens,
  GameHost,
  type GameRecord,
  type GameState,
  msg,
  RULES_VERSION,
  registerDef,
  registerNameCatalog,
  replayChecked,
  visibleFaces,
} from "@mtgx/engine";
import type { FromWorker, Sandbox, ToWorker } from "../protocol";
import { AI_BUDGET, buildScenario, OPPONENT } from "../scenario";

const HUMAN = "p1";
let host: GameHost | null = null;
/** Decisions of the record already sent to the interface (save of the game). */
let sent = 0;

/** Sends the interface the decisions recorded since the last send (`header`: at the start of the game). */
function postProgress(header?: GameRecord): void {
  const rec = host?.record;
  if (!rec || (!header && rec.decisions.length <= sent)) return;
  post({
    type: "saved",
    ...(header ? { header: { ...structuredClone(header), decisions: [], checkpoints: [] } } : {}),
    decisions: rec.decisions.slice(sent),
    checkpoints: structuredClone(rec.checkpoints ?? []),
  });
  sent = rec.decisions.length;
}

/** Opposing AIs of a game (seats p2, p3…), with their seed derived from the game's. */
function aiAgents(seed: number, opponents: number, level: Parameters<typeof aiAgent>[0] | undefined) {
  return Object.fromEntries(
    Array.from({ length: opponents }, (_, i) => [
      `p${i + 2}`,
      aiAgent(level ?? "medium", { seed: seed + i + 1, budget: AI_BUDGET, players: opponents + 1, fair: true }),
    ]),
  );
}
/** Definitions received with the "start" message (by name). */
let defs: Record<string, CardDef> = {};

function card(name: string): CardDef {
  const d = defs[name];
  if (!d) throw new Error(`Unknown card: ${name}`);
  return d;
}

function buildDeck(entries: DeckEntries): CardDef[] {
  return entries.flatMap(([n, name]) => Array.from({ length: n }, () => card(name)));
}

/** Chosen printing of each card of `buildDeck` (same order); see `deckPrintings` of @mtgx/cards. */
function deckPrintings(entries: DeckEntries): (string | null)[] | undefined {
  if (!entries.some((e) => e[2])) return undefined;
  return entries.flatMap(([n, , key]) => Array.from({ length: n }, () => key ?? null));
}

/** Why a saved game cannot be resumed (player-facing: shown in the resume notice). */
const DIVERGED = msg("the game no longer replays identically");
const DIVERGED_UPDATED = msg("the game no longer replays identically (the engine has been updated since)");

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tutorial: the opponent waits during an explanation. */
let paused = false;
const resumers: (() => void)[] = [];
const gate = () => (paused ? new Promise<void>((r) => resumers.push(r)) : null);

/** Puts the sandbox's permanents onto the battlefield, without summoning sickness. */
function applySandbox(s: GameState, sandbox: Sandbox): void {
  for (const [player, side] of Object.entries(sandbox)) {
    if (!s.players[player]) continue;
    for (const name of side.cards ?? []) {
      const def = card(name);
      registerDef(s, def);
      const o = createObject(s, def.id, player, "battlefield");
      o.controlledSince = 0;
      if (def.loyalty) o.counters.loyalty = def.loyalty;
    }
    for (const [zone, names] of [
      ["hand", side.hand],
      ["graveyard", side.graveyard],
    ] as const) {
      for (const name of names ?? []) {
        const def = card(name);
        registerDef(s, def);
        createObject(s, def.id, player, zone);
      }
    }
    for (const [n, name] of side.tokens ?? []) {
      const spec = TOKEN_SPECS[name];
      if (!spec) continue;
      for (const id of createTokens(s, player, spec, n)) {
        const o = s.objects[id];
        if (o) o.controlledSince = 0;
      }
    }
  }
  // Counters put by hand (several kinds on one permanent).
  for (const [player, side] of Object.entries(sandbox)) {
    for (const [name, kind, n] of side.counters ?? []) {
      const o = Object.values(s.objects).find(
        (x) => x.zone === "battlefield" && x.controller === player && s.defs[x.defId]?.name === name,
      );
      if (o) o.counters[kind] = (o.counters[kind] ?? 0) + n;
    }
  }
  // Attachments next: the host can belong to another player (Aura on an opponent's creature).
  for (const [player, side] of Object.entries(sandbox)) {
    for (const [name, hostName, hostPlayer] of side.attach ?? []) {
      const def = card(name);
      const host = Object.values(s.objects).find(
        (o) =>
          o.zone === "battlefield" &&
          o.controller === (hostPlayer ?? player) &&
          s.defs[o.defId]?.name === hostName &&
          !o.attachedTo,
      );
      if (!host || !s.players[player]) continue;
      registerDef(s, def);
      const o = createObject(s, def.id, player, "battlefield");
      o.controlledSince = 0;
      o.attachedTo = host.id;
      // The Aetherspark: a planeswalker Equipment enters with its loyalty.
      if (def.loyalty) o.counters.loyalty = def.loyalty;
    }
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  // An engine error must not stay silent (promise rejection in the worker): the interface displays it.
  handle(e.data).catch((err: unknown) => {
    console.error(err);
    post({ type: "error", message: msg("Engine error: {error}", { error: err instanceof Error ? err.message : String(err) }) });
  });
};

async function handle(msg: ToWorker): Promise<void> {
  switch (msg.type) {
    case "names":
      registerNameCatalog(msg.catalog);
      return;
    case "start": {
      defs = msg.defs;
      paused = false;
      if (msg.scenario) {
        const { state, events, opponent } = buildScenario(msg.scenario, card, msg.seed, msg.playerName, msg.aiNames?.[0]);
        host = new GameHost(
          state,
          {
            agents: { [OPPONENT]: opponent },
            // A beginner must be able to follow each of the opponent's actions.
            aiDelay: msg.fast && import.meta.env.DEV ? 0 : 1400,
            sleep,
            gate,
            frames: true,
            onUpdate: (_p, view, evts) =>
              post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} }),
          },
          events,
        );
        await host.run();
        return;
      }
      // Commander: the first cards of each deck are its commanders.
      const commandersOf = (seat: number) => {
        const n = msg.commanders?.[seat] ?? 0;
        return n ? Array.from({ length: n }, (_, k) => k) : undefined;
      };
      // The sideboard, outside the game (North Wind Avatar).
      const sideOf = (side: DeckEntries | undefined) =>
        side?.length ? { sideboard: buildDeck(side), sideboardPrintings: deckPrintings(side) } : {};
      const { state, events, record } = createRecordedGame({
        seed: msg.seed,
        startingPlayer: msg.startingPlayer,
        ...(msg.variant ? { variant: msg.variant } : {}),
        players: [
          {
            id: HUMAN,
            name: msg.playerName,
            deck: buildDeck(msg.playerDeck),
            printings: deckPrintings(msg.playerDeck),
            commanders: commandersOf(0),
            ...sideOf(msg.playerSide),
          },
          ...msg.aiDecks.map((deck, i) => ({
            id: `p${i + 2}`,
            name: msg.aiNames?.[i] ?? (msg.aiDecks.length > 1 ? `AI ${i + 1}` : "AI"),
            deck: buildDeck(deck),
            printings: deckPrintings(deck),
            commanders: commandersOf(i + 1),
            ...sideOf(msg.aiSides?.[i]),
          })),
        ],
      });
      // Sandbox: the starting state is changed by hand, the game cannot be replayed (no record).
      const sandboxed = !!msg.sandbox && import.meta.env.DEV;
      if (sandboxed && msg.sandbox) applySandbox(state, msg.sandbox);
      sent = 0;
      host = new GameHost(
        state,
        {
          agents: aiAgents(msg.seed, msg.aiDecks.length, msg.aiLevel),
          aiDelay: msg.fast && import.meta.env.DEV ? 0 : 900,
          sleep,
          record: sandboxed ? undefined : record,
          // Local save: one fingerprint per decision, checked on resume (0.01 ms each).
          checkpointEvery: 1,
          // Same faces as online: only the cards known to the player (not the opponent's decklist).
          frames: true,
          onUpdate: (_p, view, evts) => {
            post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} });
            postProgress();
          },
        },
        events,
      );
      if (!sandboxed) postProgress(record);
      await host.run();
      return;
    }
    case "resume": {
      defs = msg.defs;
      paused = false;
      const record = structuredClone(msg.record);
      let replayed: ReturnType<typeof replayChecked>;
      try {
        replayed = replayChecked(record, card);
      } catch (e) {
        post({ type: "resumeFailed", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      if (replayed.divergence) {
        post({ type: "resumeFailed", message: (record.rules ?? 0) !== RULES_VERSION ? DIVERGED_UPDATED : DIVERGED });
        return;
      }
      sent = record.decisions.length;
      host = new GameHost(
        replayed.state,
        {
          agents: aiAgents(record.seed, record.players.length - 1, msg.aiLevel),
          aiDelay: msg.fast && import.meta.env.DEV ? 0 : 900,
          sleep,
          record,
          checkpointEvery: 1,
          frames: true,
          onUpdate: (_p, view, evts) => {
            post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} });
            postProgress();
          },
        },
        [],
      );
      await host.run();
      return;
    }
    case "decision": {
      if (!host) return;
      const error = await host.submitHuman(HUMAN, msg.decision);
      if (error) post({ type: "error", message: error });
      return;
    }
    case "export": {
      post({ type: "record", record: host?.record ? structuredClone(host.record) : null });
      return;
    }
    case "pause": {
      paused = msg.paused;
      if (!paused) for (const r of resumers.splice(0)) r();
      return;
    }
    case "settings": {
      if (!host) return;
      host.setSettings(HUMAN, msg.settings);
      await host.run();
      return;
    }
  }
}
