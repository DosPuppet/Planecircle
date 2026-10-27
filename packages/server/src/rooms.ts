/**
 * Rooms of two to four players (duel, multiplayer, Commander): one game (GameHost), a timer per decision, disconnections
 * with a return delay (a player who does not come back concedes: with more players, the game goes on without them),
 * rematch, BO3 in a duel. Each player chooses their deck in the room, before the first match and between two matches.
 * The server is authoritative on everything.
 */
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AI_LEVELS, type AiLevel } from "@mtgx/ai";
import {
  buildGameDeck,
  CARDS,
  card,
  DECKS,
  type DeckEntries,
  type DeckList,
  FORMAT_LABELS,
  isFormat,
  nameCatalog,
  sideboardSwapError,
  validateDeck,
} from "@mtgx/cards";
import { hasPrinting } from "@mtgx/cards/printings";
import {
  type AsyncAgent,
  createRecordedGame,
  type Decision,
  decider,
  type Format,
  fallbackDecision,
  type GameEvent,
  GameHost,
  type GameRecord,
  type GameState,
  type GameView,
  isGameRecord,
  meaningfulActions,
  msg,
  outcomeHash,
  type PlayerId,
  RULES_VERSION,
  registerNameCatalog,
  replayChecked,
  visibleFaces,
} from "@mtgx/engine";
import type { AiPool } from "./aiPool";
import type { Clock, ErrorCode, MatchInfo, RoomInfo, Seat, ServerMessage } from "./protocol";

/** Connection of a player (WebSocket in production, fake client in the tests). */
export interface Peer {
  send(msg: ServerMessage): void;
}

export interface RoomConfig {
  /** Time per decision (ms). */
  decisionMs: number;
  /** Rope shown during the end of the time (ms). */
  ropeMs: number;
  /** Timeouts before a loss. */
  maxTimeouts: number;
  /** Delay to come back after a disconnection (ms). */
  graceMs: number;
  /** Removal of an empty room, or of a finished and abandoned one (ms). */
  cleanupMs: number;
  /** Closing of a room left without an opponent (ms). */
  waitingMs: number;
  /** Maximum number of open rooms on the server. */
  maxRooms: number;
  /** Most open rooms per creator IP address (an abandoned room stays open for a few minutes). */
  maxRoomsPerIp: number;
  /**
   * Save directory of the games (one file per room: header, then one decision per line). On start-up, the games in
   * progress are resumed from it: a server restart no longer cuts them. Absent: games in memory only.
   */
  dataDir?: string;
  /**
   * JavaScript heap (MB) beyond which no room is created any more: the server refuses before pm2 restarts it
   * (`max_memory_restart`). A room with a game in progress takes 0.2 to 0.3 MB of heap (`tools/load-test.ts`).
   */
  maxHeapMb?: number;
  /** AI seats (PLAN-E, E14): the worker pool where the AIs think (absent: no AI seat). */
  aiPool?: AiPool;
  /** Most open rooms with AI seats on the server (the VPS CPU is shared). */
  maxAiRooms?: number;
  /**
   * Process memory (RSS, MB, AI workers included) beyond which no room with AI is created: `heapUsed` does not see the
   * workers.
   */
  maxRssMb?: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  decisionMs: 60_000,
  ropeMs: 20_000,
  maxTimeouts: 3,
  graceMs: 60_000,
  cleanupMs: 5 * 60_000,
  waitingMs: 30 * 60_000,
  maxRooms: 200,
  maxRoomsPerIp: 4,
  maxHeapMb: 384,
  // Measured (load-test --ai 3): about 20 MB of RSS per room with AI, besides the workers; below the
  // `max_memory_restart` of pm2 (768 MB).
  maxAiRooms: 12,
  maxRssMb: 640,
};

/** Digest of a secret (reconnection token, address): only the digest is written to disk. */
export const digest = (x: string): string => createHash("sha256").update(x).digest("hex");

/**
 * Key of an address for the caps: the IPv4 address, or the /64 prefix of an IPv6 address (a subscriber often gets a
 * whole /64, and changing address must not get around the caps).
 */
export function ipKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1] as string;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("%")[0]?.split("::") ?? [];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Files set aside (`.bad`, `.rules<N>`) and interrupted tokens are kept at most this long. */
const KEEP_ASIDE_MS = 7 * 24 * 3_600_000;
/** File of the tokens interrupted by a rules update (digests, date). */
const INTERRUPTED_FILE = "interrupted.json";

/** Error meant for the client (player-facing message, written with `msg`: the client translates it). */
export class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Game saved by another version of the engine rules, which no longer replays identically. */
export class RulesChangedError extends Error {
  constructor(readonly rules: number) {
    super(`game recorded with rules version ${rules} (engine: ${RULES_VERSION})`);
  }
}

/** First line of a room's file: the seats (reconnection tokens included) and the record of the game. */
interface SavedRoom {
  code: string;
  seats: {
    seat: Seat;
    name: string;
    deck: DeckEntries;
    side?: DeckEntries;
    /** Commander: the player's commander. */
    commander?: DeckEntries;
    /** Seat held by the server AI: its level. */
    ai?: AiLevel;
    original?: { main: DeckEntries; sideboard: DeckEntries };
    /** Digest of the reconnection token (`digest`); old saves: the token itself. */
    tokenHash?: string;
    token?: string;
  }[];
  /** Digest of the creator's address key (cap per address, also counted after a resume). */
  creator?: string;
  record: GameRecord;
  /** Match at the start of this game (wins of the previous games). */
  match?: MatchInfo;
}

interface SeatState {
  seat: Seat;
  name: string;
  /**
   * Deck and sideboard of the current game (can change between the games of a BO3); empty until the player has chosen
   * it (`chooseDeck`).
   */
  deck: DeckEntries;
  side: DeckEntries;
  /** Commander: the commander (empty outside Commander). */
  commander: DeckEntries;
  /** Seat held by the server AI (its level): no connection, no timer. */
  ai?: AiLevel;
  /** Deck and sideboard at the start of the match: a sideboard swap must keep the same cards. */
  original: { main: DeckEntries; sideboard: DeckEntries };
  /**
   * Ready for the next game: deck chosen (before a match, or after one: the rematch), sideboard confirmed (between two
   * games of a BO3).
   */
  ready: boolean;
  /** Reconnection token: known in memory, empty after a resume until the player has come back. */
  token: string;
  tokenHash: string;
  peer: Peer | null;
  timeouts: number;
  /** Return deadline after a disconnection (Date.now()), or null if connected. */
  graceDeadline: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Levels of the AI seats, in their names: `msg("AI {n} ({level})")`, which each client shows in its language (a name
 * without marker, a nickname, is shown as it is).
 */
const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  beginner: msg("ctx:aiSeat|beginner"),
  medium: msg("ctx:aiSeat|medium"),
  expert: msg("ctx:aiSeat|expert"),
};

/** Precons the AI can play in a format: the Commander ones in Commander, the others otherwise. */
function aiDecks(format: Format): DeckList[] {
  return DECKS.filter((d) => (format === "commander") === (d.format === "commander") && validateDeck(d, CARDS, format).playable);
}

/** Codes without ambiguous characters (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_DECK_LINES = 120;

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters removed on purpose
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  if (!name) throw new ClientError("name", msg("Choose a nickname."));
  return name;
}

/** Received sideboard (optional): same shape as a deck; the whole deck (deck and sideboard) must be legal in the format. */
export function checkSide(main: DeckEntries, raw: unknown, format: Format = "standard"): DeckEntries {
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return [];
  const side = checkEntries(raw);
  const v = validateDeck({ main, sideboard: side }, CARDS, format);
  if (!v.legal)
    throw new ClientError(
      "deck",
      v.errors[0]
        ? msg("Sideboard refused: {error}.", { error: v.errors[0] })
        : msg("Sideboard refused: illegal in {format}.", { format: FORMAT_LABELS[format] }),
    );
  return side;
}

/** Received deck lines: [count, name, printing?], shape checked. */
function checkEntries(raw: unknown): DeckEntries {
  if (!Array.isArray(raw) || raw.length > MAX_DECK_LINES) throw new ClientError("deck", msg("Invalid deck."));
  const out: DeckEntries = [];
  for (const line of raw) {
    if (!Array.isArray(line) || (line.length !== 2 && line.length !== 3)) throw new ClientError("deck", msg("Invalid deck."));
    const [n, name, key] = line as [unknown, unknown, unknown];
    // At most 100 copies on one line (Commander: 99 basic lands are possible).
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 100 || typeof name !== "string") {
      throw new ClientError("deck", msg("Invalid deck."));
    }
    if (key !== undefined && key !== null && (typeof key !== "string" || key.length > 64)) {
      throw new ClientError("deck", msg("Invalid deck."));
    }
    // A printing the card does not have (printings table older or newer than the client's): the card keeps its
    // artwork. The engine does not check the keys of the table: it is done here.
    const c = CARDS[name];
    const printed = typeof key === "string" && c && hasPrinting(c, key);
    out.push(printed ? [n as number, name, key] : [n as number, name]);
  }
  return out;
}

/** Received commander: one or two deck lines (its legality is checked with the deck). */
function checkCommander(raw: unknown): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 2) throw new ClientError("deck", msg("Choose a commander."));
  return checkEntries(raw);
}

/**
 * A deck chosen by a player (on creation, on arrival or in the room): deck, sideboard (none in Commander) and commander
 * (Commander only), legal in the room's format.
 */
function checkDeckChoice(
  format: Format,
  deck: unknown,
  sideboard: unknown,
  commanderRaw: unknown,
): { deck: DeckEntries; side: DeckEntries; commander: DeckEntries } {
  const commander = format === "commander" ? checkCommander(commanderRaw) : [];
  const d = checkDeck(deck, format, format === "commander" ? commander : undefined);
  return { deck: d, side: format === "commander" ? [] : checkSide(d, sideboard, format), commander };
}

/** No deck yet: the player chooses it in the room. */
const NO_DECK = { deck: [], side: [], commander: [] };

/**
 * Checks the shape and the legality of a received deck: legal in the room's format and fully playable. Commander: with
 * its commander (`commander`).
 */
export function checkDeck(raw: unknown, format: Format = "standard", commander?: DeckEntries): DeckEntries {
  if (!Array.isArray(raw) || raw.length === 0) throw new ClientError("deck", msg("Invalid deck."));
  const deck = checkEntries(raw);
  const v = validateDeck({ main: deck, ...(commander ? { commander } : {}) }, CARDS, format);
  if (!v.legal)
    throw new ClientError(
      "deck",
      v.errors[0]
        ? msg("Deck refused: {error}.", { error: v.errors[0] })
        : msg("Deck refused: illegal in {format}.", { format: FORMAT_LABELS[format] }),
    );
  if (!v.playable) throw new ClientError("deck", msg("Deck refused: it contains cards that are not playable yet."));
  return deck;
}

export class Room {
  readonly seats: SeatState[] = [];
  status: RoomInfo["status"] = "waiting";
  /** Match: BO1 or BO3, wins, current game. */
  match: MatchInfo = { bestOf: 1, wins: { p1: 0, p2: 0 }, game: 0, winner: null };
  /** Number of players of the room (2 to 4). */
  get size(): number {
    return this.match.seats ?? 2;
  }
  /** Player who starts the next game (the loser of the previous one); null: random draw. */
  private nextStarter: Seat | null = null;
  private host: GameHost | null = null;
  /**
   * Updates produced by the last action, sent with the updated timer: waiting to be sent, per player and in order
   * (one per resolution).
   */
  private outbox = new Map<Seat, { view: GameView; events: GameEvent[] }[]>();
  private clock: { player: Seat; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  /** Action queue: only one at a time changes the game. */
  private queue: Promise<void> = Promise.resolve();

  private waitingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    private readonly onClose: (room: Room) => void,
  ) {
    // Nobody joins, or the players never get ready: the room is closed and its players told.
    this.waitingTimer = setTimeout(() => {
      if (this.status !== "waiting") return;
      const message =
        this.seats.length < this.size
          ? msg("Room closed: no opponent joined it in time.")
          : msg("Room closed: the players didn't choose their deck in time.");
      for (const s of this.seats) s.peer?.send({ type: "error", code: "closed", message });
      this.close();
    }, config.waitingMs);
    this.waitingTimer.unref?.();
  }

  /** Digest of the creator's address key (cap per address). */
  creator: string | undefined;

  seatOf(token: string): SeatState | undefined {
    const h = digest(token);
    const seat = this.seats.find((s) => s.tokenHash === h);
    // After a resume, the token is known only by its digest: the one presented is the right one.
    if (seat) seat.token = token;
    return seat;
  }

  addPlayer(
    name: string,
    deck: DeckEntries,
    peer: Peer | null,
    side: DeckEntries = [],
    commander: DeckEntries = [],
    ai?: AiLevel,
  ): SeatState {
    if (this.seats.length >= this.size) throw new ClientError("full", msg("This room is full."));
    // First free seat (a player who left before the start frees theirs).
    const taken = new Set(this.seats.map((s) => s.seat));
    const free = (["p1", "p2", "p3", "p4"] as Seat[]).find((x) => !taken.has(x)) as Seat;
    const seat: SeatState = {
      seat: free,
      name,
      deck,
      side,
      commander,
      ...(ai ? { ai } : {}),
      original: { main: deck, sideboard: side },
      // A deck sent with the arrival: ready at once.
      ready: deck.length > 0,
      token: "",
      tokenHash: "",
      peer,
      timeouts: 0,
      graceDeadline: null,
      graceTimer: null,
    };
    seat.token = randomUUID();
    seat.tokenHash = digest(seat.token);
    this.seats.push(seat);
    this.seats.sort((a, b) => (a.seat < b.seat ? -1 : 1));
    this.cancelCleanup();
    this.broadcastRoom();
    this.enqueue(() => this.startWhenReady());
    return seat;
  }

  /**
   * Before a match (the room fills up) or after one: the deck for the next match, legal in the room's format, then
   * ready. The player can change it as long as the match hasn't started.
   */
  chooseDeck(seat: SeatState, deck: unknown, sideboard: unknown, commander: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "waiting" && this.status !== "over")
        throw new ClientError("state", msg("The deck can only be changed before a match."));
      const chosen = checkDeckChoice(this.match.format ?? "standard", deck, sideboard, commander);
      seat.deck = chosen.deck;
      seat.side = chosen.side;
      seat.commander = chosen.commander;
      seat.original = { main: chosen.deck, sideboard: chosen.side };
      seat.ready = true;
      this.broadcastRoom();
      await this.startWhenReady();
    });
  }

  /** No longer ready, to choose another deck (before the match starts). */
  unready(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "waiting" && this.status !== "over")
        throw new ClientError("state", msg("The deck can only be changed before a match."));
      seat.ready = false;
      this.broadcastRoom();
    });
  }

  /**
   * The next match starts when the room is full and every player is ready: an AI always is, a human is connected and
   * has chosen their deck. After a match: score reset, decks as chosen (before the sideboard swaps of a BO3).
   */
  private async startWhenReady(): Promise<void> {
    if (this.status !== "waiting" && this.status !== "over") return;
    if (this.seats.length < this.size || !this.seats.every((s) => s.ai || (s.ready && s.peer && s.deck.length > 0))) return;
    if (this.status === "over") {
      this.match = { ...this.match, wins: {}, game: 0, winner: null };
      this.nextStarter = null;
      for (const s of this.seats) {
        s.deck = s.original.main;
        s.side = s.original.sideboard;
      }
    }
    await this.start();
  }

  // -------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------

  private async start(): Promise<void> {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
    for (const s of this.seats) {
      s.timeouts = 0;
      s.ready = false;
    }
    this.match = { ...this.match, game: this.match.game + 1 };
    // First game: random draw; then the loser of the previous game starts.
    const starter = this.nextStarter ?? this.seats[randomInt(0, this.seats.length)]?.seat;
    const commander = this.match.format === "commander";
    const { state, events, record } = createRecordedGame({
      seed: randomInt(0, 2 ** 31),
      startingPlayer: starter,
      ...(commander ? { variant: "commander" as const } : {}),
      players: this.seats.map((s) => {
        // Commander: the commander at the top of the deck, designated by its index.
        // The sideboard of this game (after the swaps of a BO3) is outside the game (North Wind Avatar).
        const built = buildGameDeck({ main: s.deck, sideboard: s.side, ...(commander ? { commander: s.commander } : {}) });
        return {
          id: s.seat,
          name: s.name,
          deck: built.deck,
          ...(built.printings ? { printings: built.printings } : {}),
          ...(built.commanders ? { commanders: built.commanders } : {}),
          ...(built.sideboard ? { sideboard: built.sideboard } : {}),
          ...(built.sideboardPrintings ? { sideboardPrintings: built.sideboardPrintings } : {}),
        };
      }),
    });
    this.status = "playing";
    this.saveHeader(record);
    const host = this.newHost(state, record, events);
    this.host = host;
    this.broadcastRoom();
    await this.advancing(host, () => host.run());
  }

  /**
   * Runs an action on the game, then timer and sends if the state changed, even if the action failed midway
   * (internal error): a game must never be left without a timer. A refused decision does not change the state and
   * so does not restart the timer.
   */
  async advancing(host: GameHost, fn: () => Promise<void>): Promise<void> {
    const before = host.state;
    try {
      await fn();
    } catch (e) {
      console.error(`Room ${this.code}: internal error`, e);
      throw e;
    } finally {
      if (host.state !== before || this.outbox.size) this.afterStep();
    }
  }

  /** Does the room have AI seats? */
  get hasAi(): boolean {
    return this.seats.some((s) => s.ai);
  }

  /**
   * AI of a seat: its decision is computed in the worker pool (the main thread serves the other rooms). A priority
   * where there is nothing to do but pass is settled here, without a worker.
   */
  private aiAgentFor(seat: Seat, level: AiLevel): AsyncAgent {
    return (state, player) => {
      const p = state.pending;
      if (p?.kind === "priority" && !p.castNow && meaningfulActions(state, player).length === 0) return { type: "pass" };
      const pool = this.config.aiPool;
      if (!pool || !p) return fallbackDecision(state, p ?? { kind: "priority", player });
      const n = this.host?.record?.decisions.length ?? 0;
      const seed = (Number(this.host?.record?.seed ?? 0) ^ (n * 2654435761) ^ seat.charCodeAt(1)) >>> 0;
      return pool.decide({
        room: this.code,
        seat,
        level,
        players: state.playerOrder.length,
        seed,
        // Expert level (ISMCTS, in a duel): one and a half seconds at most.
        ...(level === "expert" ? { budget: { ms: 1500 } } : {}),
        state,
      });
    };
  }

  private agents(): Partial<Record<Seat, AsyncAgent>> {
    const out: Partial<Record<Seat, AsyncAgent>> = {};
    for (const s of this.seats) if (s.ai) out[s.seat] = this.aiAgentFor(s.seat, s.ai);
    return out;
  }

  /** Host of a recorded game: each decision is appended to the room's file. */
  private newHost(state: GameHost["state"], record: GameRecord, events: GameEvent[]): GameHost {
    return new GameHost(
      state,
      {
        agents: this.agents(),
        // One update per resolution: the interface shows each effect one after the other.
        frames: true,
        onUpdate: (p, view, evts) => this.buffer(p as Seat, view, evts),
        record,
        onRecord: (p, d, after) => this.appendDecision(p, d, after),
      },
      events,
    );
  }

  // -------------------------------------------------------------------------
  // Save to disk
  // -------------------------------------------------------------------------

  private get file(): string | null {
    return this.config.dataDir ? join(this.config.dataDir, `${this.code}.jsonl`) : null;
  }

  private saveHeader(record: GameRecord): void {
    const file = this.file;
    if (!file || !this.config.dataDir) return;
    try {
      mkdirSync(this.config.dataDir, { recursive: true, mode: 0o700 });
      const saved: SavedRoom = {
        code: this.code,
        seats: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          deck: s.deck,
          side: s.side,
          ...(s.commander.length ? { commander: s.commander } : {}),
          ...(s.ai ? { ai: s.ai } : {}),
          original: s.original,
          tokenHash: s.tokenHash,
        })),
        ...(this.creator ? { creator: this.creator } : {}),
        record: { ...record, decisions: [], checkpoints: [] },
        match: this.match,
      };
      // Readable by the server account only: the save reveals the decks.
      writeFileSync(file, `${JSON.stringify(saved)}\n`, { mode: 0o600 });
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  /** One line per decision: [player, decision, digest of the resulting state] (checked on resume). */
  private appendDecision(player: PlayerId, d: Decision, after: GameState): void {
    const file = this.file;
    if (!file) return;
    try {
      appendFileSync(file, `${JSON.stringify([player, d, outcomeHash(after)])}\n`);
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  /**
   * Resume of a saved room (server restart): the game is replayed from its record, the players are considered
   * disconnected (ordinary return delay) and come back with their token.
   */
  static restore(
    saved: SavedRoom,
    decisions: [PlayerId, Decision][],
    checkpoints: [number, string][],
    config: RoomConfig,
    onClose: (room: Room) => void,
  ): Room {
    const record: GameRecord = { ...saved.record, decisions, checkpoints };
    const { state, divergence } = replayChecked(record, card);
    const rules = saved.record.rules ?? 0;
    if (rules !== RULES_VERSION) {
      // Another rules version: the game resumes only if each decision has its digest, and they match.
      if (divergence || checkpoints.length < decisions.length) throw new RulesChangedError(rules);
    } else if (divergence) {
      throw new Error(`replay differs from the game played (${divergence.message}): non-deterministic engine?`);
    }
    const room = new Room(saved.code, config, onClose);
    room.creator = saved.creator;
    for (const { token, tokenHash, ...s } of saved.seats) {
      room.seats.push({
        ...s,
        token: "",
        tokenHash: tokenHash ?? digest(token ?? ""),
        side: s.side ?? [],
        commander: s.commander ?? [],
        original: s.original ?? { main: s.deck, sideboard: s.side ?? [] },
        ready: false,
        peer: null,
        timeouts: 0,
        graceDeadline: null,
        graceTimer: null,
      });
    }
    if (saved.match) room.match = saved.match;
    room.host = room.newHost(state, record, []);
    // Game finished before the shutdown: its win is counted by `afterStep` (change from "playing" to "over").
    room.status = "playing";
    if (room.waitingTimer) clearTimeout(room.waitingTimer);
    room.waitingTimer = null;
    for (const seat of room.seats) if (!seat.ai) room.disconnect(seat);
    room.afterStep();
    // An AI had to decide at the time of the shutdown: it resumes.
    const pending = room.host.state.pending;
    if (
      pending &&
      !room.host.state.over &&
      room.seats.find((x) => x.seat === (decider(room.host?.state as GameState) ?? pending.player))?.ai
    )
      void room.enqueue(() => room.advancing(room.host as GameHost, () => (room.host as GameHost).run()));
    return room;
  }

  private buffer(p: Seat, view: GameView, events: GameEvent[]): void {
    this.outbox.set(p, [...(this.outbox.get(p) ?? []), { view, events }]);
  }

  /** After each action: timer, sending of the views, end of the game. */
  private afterStep(): void {
    const host = this.host;
    if (!host) return;
    const s = host.state;
    if (s.over) {
      this.stopClock();
      if (this.status === "playing") {
        this.finishGame(s.winner as Seat | null);
        this.broadcastRoom();
      }
      this.scheduleCleanupIfIdle();
    } else if (s.pending) {
      // Each new decision gets its full time (as on MTGA); a refused decision restarts nothing.
      // 722: during a controlled turn, the controller decides. An AI has no timer.
      const who = (decider(s) ?? s.pending.player) as Seat;
      if (this.seats.find((x) => x.seat === who)?.ai) this.stopClock();
      else this.armClock(who);
    }
    for (const [p, frames] of this.outbox)
      for (const u of frames)
        this.sendTo(p, { type: "update", ...u, faces: visibleFaces(s, u.view, u.events), clock: this.clockInfo() });
    this.outbox.clear();
  }

  /**
   * End of a game: win counted; in BO3, as long as nobody has two wins, the players adjust their deck with their
   * sideboard (status `sideboard`), and the loser will start the next game.
   */
  private finishGame(winner: Seat | null): void {
    const wins = { ...this.match.wins };
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    // With more players: a single game, the winner of the game wins the match.
    if (this.size > 2) {
      this.match = { ...this.match, wins, winner };
      this.nextStarter = null;
      this.status = "over";
      return;
    }
    const need = Math.ceil(this.match.bestOf / 2);
    const w1 = wins.p1 ?? 0;
    const w2 = wins.p2 ?? 0;
    // At most three games (a draw counts as a game played).
    const decided = w1 >= need || w2 >= need || this.match.game >= this.match.bestOf;
    const matchWinner = decided ? (w1 > w2 ? "p1" : w2 > w1 ? "p2" : null) : null;
    this.match = { ...this.match, wins, winner: matchWinner };
    this.nextStarter = winner ? (winner === "p1" ? "p2" : "p1") : null;
    this.status = decided ? "over" : "sideboard";
  }

  /** Between two games: deck and sideboard for the next one (same cards in total, legal deck), then ready. */
  sideboard(seat: SeatState, main: unknown, side: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "sideboard") throw new ClientError("state", msg("No sideboard to adjust now."));
      const next = { main: checkEntries(main), sideboard: checkEntries(side) };
      const error = sideboardSwapError(seat.original, next, CARDS, this.match.format);
      if (error) throw new ClientError("deck", error);
      seat.deck = next.main;
      seat.side = next.sideboard;
      seat.ready = true;
      this.broadcastRoom();
      if (this.seats.length === 2 && this.seats.every((s) => s.ready)) await this.start();
    });
  }

  private clockInfo(): Clock | null {
    if (!this.clock) return null;
    return {
      player: this.clock.player,
      remainingMs: Math.max(0, this.clock.deadline - Date.now()),
      totalMs: this.config.decisionMs,
      ropeMs: this.config.ropeMs,
      timeouts: Object.fromEntries(this.seats.map((s) => [s.seat, s.timeouts])) as Partial<Record<Seat, number>>,
      maxTimeouts: this.config.maxTimeouts,
    };
  }

  private armClock(player: Seat): void {
    this.stopClock();
    const timer = setTimeout(() => this.enqueue(() => this.expire(player)), this.config.decisionMs);
    timer.unref?.();
    this.clock = { player, deadline: Date.now() + this.config.decisionMs, timer };
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock.timer);
    this.clock = null;
  }

  /** Time is up: default decision; loss beyond the number of timeouts allowed. */
  private async expire(player: Seat): Promise<void> {
    const host = this.host;
    const seat = this.seats.find((s) => s.seat === player);
    const p = host?.state.pending;
    if (!host || !seat || host.state.over || !p || decider(host.state) !== player) return;
    seat.timeouts += 1;
    await this.advancing(host, async () => {
      // A default decision that fails (engine error) must not leave the game stuck.
      let played = false;
      if (seat.timeouts < this.config.maxTimeouts) {
        try {
          played = (await host.submitHuman(player, fallbackDecision(host.state, p))) === null;
        } catch (e) {
          console.error(`Room ${this.code}: default decision failed`, e);
        }
      }
      if (!played && !host.state.over && host.state.pending === p) await host.submitHuman(player, { type: "concede" });
    });
  }

  /** Record of the game, only if it is over (it reveals the decks and the seed). */
  exportRecord(): GameRecord | null {
    const host = this.host;
    return host?.state.over && host.record ? structuredClone(host.record) : null;
  }

  decide(seat: SeatState, d: Decision): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host || this.status !== "playing") throw new ClientError("state", msg("No game in progress."));
      await this.advancing(host, async () => {
        const error = await host.submitHuman(seat.seat, d);
        // Refused decision: the state did not change, the timer goes on.
        if (error) seat.peer?.send({ type: "error", code: "rules", message: error });
      });
    });
  }

  settings(seat: SeatState, settings: Parameters<GameHost["setSettings"]>[1]): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host) return;
      host.setSettings(seat.seat, settings);
      if (this.status !== "playing") return;
      await this.advancing(host, () => host.run());
    });
  }

  /** After a match: ready for the next one with the same deck (AI seats always accept it). */
  rematch(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "over") throw new ClientError("state", msg("The game is not over."));
      seat.ready = true;
      this.broadcastRoom();
      await this.startWhenReady();
    });
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  /** Reconnection: full view and updated timer. */
  reconnect(seat: SeatState, peer: Peer): void {
    seat.peer = peer;
    seat.graceDeadline = null;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    this.cancelCleanup();
    this.sendRoom(seat);
    if (this.host) {
      const view = this.host.view(seat.seat);
      peer.send({ type: "update", view, events: [], faces: visibleFaces(this.host.state, view, []), clock: this.clockInfo() });
    }
    this.sendOpponentStatus();
  }

  /**
   * Connection lost: the others are told; without a return in time, loss (or room removed). Before the first match, the
   * seat is freed: a player who has gone would keep the match from starting.
   */
  disconnect(seat: SeatState): void {
    seat.peer = null;
    if (this.status === "playing" || this.status === "waiting") {
      seat.graceDeadline = Date.now() + this.config.graceMs;
      seat.graceTimer = setTimeout(
        () => this.enqueue(async () => (this.status === "waiting" ? this.removeWaiting(seat) : this.abandon(seat))),
        this.config.graceMs,
      );
      seat.graceTimer.unref?.();
    }
    this.broadcastRoom();
    this.sendOpponentStatus();
    this.scheduleCleanupIfIdle();
  }

  /** Voluntary leave: concession if the game is in progress. */
  leave(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status === "waiting") {
        seat.peer = null;
        return this.removeWaiting(seat);
      }
      seat.peer = null;
      // Between two games of a BO3: leaving concedes the match.
      if (this.status === "sideboard") {
        const other = this.seats.find((s) => s !== seat)?.seat ?? null;
        this.match = { ...this.match, winner: other };
        this.status = "over";
      }
      await this.abandon(seat);
      this.broadcastRoom();
      this.scheduleCleanupIfIdle();
    });
  }

  /** Before the first match: the seat is freed (a player who left, or who has not come back in time). */
  private removeWaiting(seat: SeatState): void {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    const i = this.seats.indexOf(seat);
    // Come back in time (the grace delay): the seat stays.
    if (i < 0 || seat.peer) return;
    this.seats.splice(i, 1);
    // No human left (only AI seats remain): the room closes.
    if (!this.seats.some((s) => !s.ai)) this.close();
    else this.broadcastRoom();
  }

  private async abandon(seat: SeatState): Promise<void> {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    const host = this.host;
    if (!host || this.status !== "playing" || host.state.over) return;
    await this.advancing(host, async () => {
      await host.submitHuman(seat.seat, { type: "concede" });
    });
    // AI seats: with no human still connected, the game stops and the room closes (the server CPU is shared).
    if (this.hasAi && !this.seats.some((s) => !s.ai && s.peer)) this.close();
  }

  /** Duel: the opponent's connection state (with more players, `RoomInfo.players` gives it for each one). */
  private sendOpponentStatus(): void {
    if (this.size > 2) return;
    for (const s of this.seats) {
      const other = this.seats.find((o) => o !== s);
      if (!other) continue;
      s.peer?.send({
        type: "opponent",
        connected: !!other.peer,
        remainingMs: other.graceDeadline ? Math.max(0, other.graceDeadline - Date.now()) : null,
      });
    }
  }

  private scheduleCleanupIfIdle(): void {
    const idle = this.seats.every((s) => !s.peer) && this.status !== "playing";
    if (!idle || this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => this.close(), this.config.cleanupMs);
    this.cleanupTimer.unref?.();
  }

  private cancelCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** Final closing of the room: its save file is removed. */
  close(): void {
    this.shutdown();
    this.config.aiPool?.forget(this.code);
    const file = this.file;
    if (file) rmSync(file, { force: true });
    this.onClose(this);
  }

  /** Server shutdown: the timers stop, the save stays (the game will be resumed on restart). */
  shutdown(): void {
    this.stopClock();
    this.cancelCleanup();
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  private sendTo(p: Seat, msg: ServerMessage): void {
    this.seats.find((s) => s.seat === p)?.peer?.send(msg);
  }

  private sendRoom(seat: SeatState): void {
    seat.peer?.send({
      type: "room",
      room: {
        code: this.code,
        seat: seat.seat,
        token: seat.token,
        status: this.status,
        players: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          connected: !!s.peer || !!s.ai,
          ready: s.ready || !!s.ai,
          ...(s.ai ? { ai: s.ai } : {}),
        })),
        match: this.match,
        deck: { main: seat.deck, sideboard: seat.side, ...(seat.commander.length ? { commander: seat.commander } : {}) },
      },
    });
  }

  private broadcastRoom(): void {
    for (const s of this.seats) this.sendRoom(s);
  }

  /**
   * Runs the actions one by one: a decision, a timeout and a disconnection never overlap on the same game. Client
   * errors go up to the caller.
   */
  enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /**
   * Digests of the tokens of the players whose game was interrupted by a rules update, with their date: kept in
   * `interrupted.json` so that a player learns it even after a second restart.
   */
  private readonly interrupted = new Map<string, number>();

  constructor(private readonly config: RoomConfig = DEFAULT_CONFIG) {
    // "Choose a card name": any name of the catalog is accepted (the question does not list the opponent's decklist);
    // before the resume of the saved games, which replay their answers.
    registerNameCatalog(nameCatalog());
    if (config.dataDir) this.restore(config.dataDir);
  }

  /** Rooms opened by this address (digest of its key), resumed ones included. */
  private openedBy(creator: string): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.creator === creator) n++;
    return n;
  }

  private saveInterrupted(dir: string): void {
    try {
      writeFileSync(join(dir, INTERRUPTED_FILE), JSON.stringify(Object.fromEntries(this.interrupted)), { mode: 0o600 });
    } catch (e) {
      console.error("Interrupted tokens: save failed", e);
    }
  }

  /**
   * Resumes the saved games; an unreadable file is set aside (`.bad`) without blocking the start-up. Files set aside
   * and interrupted tokens older than seven days are removed. At most `maxRooms` rooms, the most recent ones: a server
   * restarted for lack of memory must not resume more than it can hold.
   */
  private restore(dir: string): void {
    if (!existsSync(dir)) return;
    const now = Date.now();
    try {
      const raw = JSON.parse(readFileSync(join(dir, INTERRUPTED_FILE), "utf8")) as Record<string, number>;
      for (const [h, at] of Object.entries(raw))
        if (typeof at === "number" && now - at < KEEP_ASIDE_MS) this.interrupted.set(h, at);
    } catch {
      // No file yet (or unreadable): no known interrupted token.
    }
    for (const name of readdirSync(dir).filter((f) => /\.jsonl\.(?:bad|rules\d+)$/.test(f))) {
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > KEEP_ASIDE_MS) rmSync(file, { force: true });
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of files.slice(this.config.maxRooms)) {
      console.warn(`Save ${name} not resumed (cap of ${this.config.maxRooms} rooms), set aside`);
      renameSync(join(dir, name), join(dir, `${name}.bad`));
    }
    for (const { name } of files.slice(0, this.config.maxRooms)) {
      const file = join(dir, name);
      let saved: SavedRoom | null = null;
      try {
        const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
        saved = JSON.parse(head ?? "null") as SavedRoom;
        const rows = lines.map((l) => JSON.parse(l) as [PlayerId, Decision, string?]);
        const decisions = rows.map(([p, d]): [PlayerId, Decision] => [p, d]);
        const checkpoints = rows.flatMap(([, , h], i): [number, string][] => (typeof h === "string" ? [[i + 1, h]] : []));
        if (!saved?.code || !Array.isArray(saved.seats) || !isGameRecord({ ...saved.record, decisions }))
          throw new Error("unknown format");
        const room = Room.restore(saved, decisions, checkpoints, this.config, (r) => this.rooms.delete(r.code));
        this.rooms.set(room.code, room);
        console.log(`Room ${room.code} resumed (${decisions.length} decisions)`);
      } catch (e) {
        if (e instanceof RulesChangedError && saved) {
          // Engine update: the game is interrupted; its players learn it when they come back.
          for (const s of saved.seats) this.interrupted.set(s.tokenHash ?? digest(s.token ?? ""), now);
          console.warn(`Room ${saved.code} interrupted by the rules update: ${e.message}`);
          renameSync(file, `${file}.rules${e.rules}`);
        } else {
          console.error(`Save ${name} unreadable, set aside:`, e);
          renameSync(file, `${file}.bad`);
        }
      }
    }
    this.saveInterrupted(dir);
  }

  /** Was the game of this token interrupted by an update of the engine rules? */
  wasInterrupted(token: unknown): boolean {
    return typeof token === "string" && this.interrupted.has(digest(token));
  }

  get size(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) return code;
    }
  }

  create(
    name: unknown,
    deck: unknown,
    peer: Peer,
    opts: {
      sideboard?: unknown;
      bestOf?: unknown;
      format?: unknown;
      players?: unknown;
      commander?: unknown;
      ai?: unknown;
      ip?: string;
    } = {},
  ): { room: Room; seat: SeatState } {
    const n = cleanName(name);
    const format: Format = isFormat(opts.format) || opts.format === "commander" ? (opts.format as Format) : "standard";
    const players = opts.players === 3 || opts.players === 4 ? opts.players : 2;
    // The deck is optional: otherwise the creator chooses it in the room.
    const chosen = deck === undefined || deck === null ? NO_DECK : checkDeckChoice(format, deck, opts.sideboard, opts.commander);
    if (this.rooms.size >= this.config.maxRooms) throw new ClientError("busy", msg("Server full, try again later."));
    // Memory: refuse a room rather than let pm2 restart the server (and cut all the games).
    const heapMb = process.memoryUsage().heapUsed / 1_048_576;
    if (this.config.maxHeapMb && heapMb > this.config.maxHeapMb)
      throw new ClientError("busy", msg("Server full, try again later."));
    // Creating then abandoning rooms in a loop must not take all the places of the server.
    const creator = opts.ip ? digest(ipKey(opts.ip)) : undefined;
    if (creator && this.openedBy(creator) >= this.config.maxRoomsPerIp)
      throw new ClientError("busy", msg("Too many rooms open from this address: close one before creating another."));
    const room = new Room(this.newCode(), this.config, (r) => this.rooms.delete(r.code));
    room.creator = creator;
    const ai = this.checkAi(opts.ai, players, format);
    // BO3 exists only in a duel, outside Commander.
    const bestOf = opts.bestOf === 3 && players === 2 && format !== "commander" ? 3 : 1;
    room.match = {
      ...room.match,
      bestOf: ai ? 1 : bestOf,
      ...(format !== "standard" ? { format } : {}),
      ...(players > 2 ? { seats: players, wins: {} } : {}),
    };
    this.rooms.set(room.code, room);
    const seat = room.addPlayer(n, chosen.deck, peer, chosen.side, chosen.commander);
    // AI seats: filled at once, with playable precons of the format drawn at random.
    if (ai) {
      const decks = aiDecks(format);
      for (let i = 0; i < ai.count; i++) {
        const deck = decks[randomInt(0, decks.length)] as DeckList;
        const label = AI_LEVEL_LABELS[ai.level];
        room.addPlayer(msg("AI {n} ({level})", { n: i + 1, level: label }), deck.main, null, [], deck.commander ?? [], ai.level);
      }
    }
    return { room, seat };
  }

  /**
   * AI seats asked for on creation: at most `players` − 1, known level (expert, with ISMCTS, only in a duel: otherwise
   * medium), an AI pool, room for a room with AI, and memory.
   */
  private checkAi(raw: unknown, players: number, format: Format): { count: number; level: AiLevel } | null {
    const r = raw as { count?: unknown; level?: unknown } | null | undefined;
    const count = Number(r?.count ?? 0);
    if (!r || !Number.isInteger(count) || count <= 0) return null;
    if (count > players - 1) throw new ClientError("state", msg("The room needs at least one human player."));
    if (!this.config.aiPool) throw new ClientError("busy", msg("The AI is not available on this server."));
    let level: AiLevel = (AI_LEVELS as readonly unknown[]).includes(r.level) ? (r.level as AiLevel) : "medium";
    if (level === "expert" && players > 2) level = "medium";
    let aiRooms = 0;
    for (const room of this.rooms.values()) if (room.hasAi) aiRooms++;
    const rssMb = process.memoryUsage().rss / 1_048_576;
    if (aiRooms >= (this.config.maxAiRooms ?? 12) || (this.config.maxRssMb && rssMb > this.config.maxRssMb))
      throw new ClientError("busy", msg("Too many games against the AI in progress on the server, try again later."));
    if (aiDecks(format).length === 0) throw new ClientError("deck", msg("No deck the AI can play in this format."));
    return { count, level };
  }

  join(
    code: unknown,
    name: unknown,
    deck: unknown,
    peer: Peer,
    sideboard?: unknown,
    commanderRaw?: unknown,
  ): { room: Room; seat: SeatState } {
    const room = this.rooms.get(
      String(code ?? "")
        .toUpperCase()
        .trim(),
    );
    if (!room) throw new ClientError("room", msg("Room not found: check the code."));
    if (room.status !== "waiting" || room.seats.length >= room.size) throw new ClientError("full", msg("This room is full."));
    // The deck (optional: otherwise chosen in the room) must be legal in the format chosen by the room's creator.
    const format = room.match.format ?? "standard";
    const chosen = deck === undefined || deck === null ? NO_DECK : checkDeckChoice(format, deck, sideboard, commanderRaw);
    return { room, seat: room.addPlayer(cleanName(name), chosen.deck, peer, chosen.side, chosen.commander) };
  }

  byToken(token: unknown): { room: Room; seat: SeatState } | null {
    if (typeof token !== "string") return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatOf(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** Server shutdown: the rooms stop without erasing their save. */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.shutdown();
    this.rooms.clear();
  }
}
