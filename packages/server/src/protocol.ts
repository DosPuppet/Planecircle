/**
 * Online play protocol (WebSocket, JSON). Shared types: the client imports them with `import type`.
 * The server is authoritative: it validates the decks and every decision (engine RulesError).
 */
import type { AiLevel } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import type { AutopilotSettings, CardFace, Decision, Format, GameEvent, GameRecord, GameView } from "@mtgx/engine";

/**
 * Protocol version: sent by the client, with `RULES_VERSION`, when it creates, joins or resumes a room. A client of
 * another version (tab left open, stale service worker) is refused and asked to reload the page. Bump it on every
 * incompatible change of the messages.
 * - 2: a deck line can cite a printing, `[count, name, printing]` (PLAN-G, G1).
 * - 3: rooms of 2 to 4 players and Commander (PLAN-E, E13): seats p1 to p4, `players` and `commander` on create,
 *   `commander` on join, optional wins per seat; AI seats (`ai` on create, `players[].ai`).
 * - 4: "name" question (`ChoiceRequest` of type `name`: card name, land card name, creature type), which no longer
 *   lists the cards of the game; the interface searches the whole catalog.
 * - 5: custom art by art set: a `customArt` of the view (face, token, player) may be the set's name ("custom:<set>"
 *   printings).
 * - 6: the deck is chosen in the room: optional on create and join, `deck` (then ready) and `unready` before a match and
 *   between two matches; `players[].ready` replaces `players[].rematch`.
 */
export const PROTOCOL_VERSION = 6;

/** Client versions (protocol and engine rules). */
export interface ClientVersion {
  protocol: number;
  rules: number;
}

/** Seats of a room (two to four players): the player ids in the engine. */
export type Seat = "p1" | "p2" | "p3" | "p4";

/** Timer of the current decision (relative durations: no dependency on the client's clock). */
export interface Clock {
  /** Player who must decide. */
  player: Seat;
  /** Time left when the message is received (ms). */
  remainingMs: number;
  /** Total duration of a decision (ms). */
  totalMs: number;
  /** Duration during which the rope is shown (ms, end of the time). */
  ropeMs: number;
  /** Timeouts already suffered per player (loss at `maxTimeouts`). */
  timeouts: Partial<Record<Seat, number>>;
  maxTimeouts: number;
}

/** Match: one game (BO1) or best of three (BO3). */
export interface MatchInfo {
  bestOf: 1 | 3;
  /** Deck format of the room, chosen when it is created (absent: Standard). */
  format?: Format;
  /** Number of players of the room (absent: 2, a duel). BO3 exists only in a duel. */
  seats?: 2 | 3 | 4;
  /** Games won per seat. */
  wins: Partial<Record<Seat, number>>;
  /** Number of the current game (or of the last one played). */
  game: number;
  /** Winner of the match (null until it is decided). */
  winner: Seat | null;
}

export interface RoomInfo {
  code: string;
  seat: Seat;
  /** Reconnection token of the recipient (kept for `rejoin`). */
  token: string;
  /**
   * `waiting`: the room fills up and the players choose their deck; `sideboard`: between two games of a BO3, each
   * player adjusts their deck with their sideboard; `over`: the match is over, the players choose their deck for the
   * next one (or the same: rematch).
   */
  status: "waiting" | "playing" | "sideboard" | "over";
  /**
   * `ready`: ready for the next game (deck chosen before a match or for the rematch; sideboard confirmed between two
   * games of a BO3); an AI seat always is. `ai`: seat held by the server AI (its level).
   */
  players: { seat: Seat; name: string; connected: boolean; ready: boolean; ai?: AiLevel }[];
  match: MatchInfo;
  /**
   * Current deck and sideboard of the recipient (between games: starting point of the swap); their commander. Empty
   * until they have chosen it.
   */
  deck: { main: DeckEntries; sideboard: DeckEntries; commander?: DeckEntries };
}

export type ClientMessage =
  | {
      type: "create";
      name: string;
      /** The creator's deck, ready at once (optional: otherwise chosen in the room, `deck`). */
      deck?: DeckEntries;
      sideboard?: DeckEntries;
      bestOf?: 1 | 3;
      format?: Format;
      /** Number of players (2 by default). */
      players?: 2 | 3 | 4;
      /** Commander: the creator's commander. */
      commander?: DeckEntries;
      /** Seats held by the server AI (at most `players` − 1) and its level; decks chosen by the server. */
      ai?: { count: number; level: AiLevel };
      version?: ClientVersion;
    }
  | {
      type: "join";
      code: string;
      name: string;
      /** The deck of the joining player, ready at once (optional: otherwise chosen in the room, `deck`). */
      deck?: DeckEntries;
      sideboard?: DeckEntries;
      /** Commander: the commander of the joining player. */
      commander?: DeckEntries;
      version?: ClientVersion;
    }
  | { type: "rejoin"; token: string; version?: ClientVersion }
  | { type: "leave" }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  /** After a match: ready for the next one with the same deck. */
  | { type: "rematch" }
  /**
   * Before a match (the room fills up) or after one: the deck for the next match (legal in the room's format; Commander:
   * with its commander), then ready. It can be changed as long as the match hasn't started.
   */
  | { type: "deck"; deck: DeckEntries; sideboard?: DeckEntries; commander?: DeckEntries }
  /** No longer ready, to choose another deck (before the match starts). */
  | { type: "unready" }
  /** Between two games (BO3): deck and sideboard for the next game (same cards in total), then ready. */
  | { type: "sideboard"; main: DeckEntries; sideboard: DeckEntries }
  /** Record of the finished game (replay, bug report); refused during the game (decks, seed). */
  | { type: "export" };

/**
 * `busy`: server full; `closed`: room closed by the server (waited too long); `version`: client of another version than
 * the server (reload the page).
 */
export type ErrorCode = "deck" | "name" | "room" | "full" | "busy" | "closed" | "token" | "rules" | "state" | "version";

export type ServerMessage =
  | { type: "room"; room: RoomInfo }
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace>; clock: Clock | null }
  | { type: "opponent"; connected: boolean; remainingMs: number | null }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "record"; record: GameRecord };
