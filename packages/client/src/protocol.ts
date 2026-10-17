/** Messages exchanged between the interface and the Web Worker that runs the game. */
import type { AiLevel, ScriptAction } from "@mtgx/ai";
import type { DeckEntries } from "@mtgx/cards";
import type {
  AutopilotSettings,
  CardDef,
  CardFace,
  Decision,
  GameEvent,
  GameRecord,
  GameVariant,
  GameView,
  NameCatalog,
} from "@mtgx/engine";

/**
 * Sandbox (dev mode, interface tests): permanents and tokens put onto the battlefield at the start of the game,
 * by player ("p1" = you, "p2"… = AI).
 */
export type Sandbox = Record<
  string,
  {
    cards?: string[];
    /** Cards added to this player's hand. */
    hand?: string[];
    /** Cards added to this player's graveyard (flashback, harmonize). */
    graveyard?: string[];
    tokens?: [number, string][];
    /** Aura or Equipment of this player, attached to a creature (name) of `hostPlayer` (this player by default). */
    attach?: [card: string, host: string, hostPlayer?: string][];
    /** Counters put on a permanent (name) of this player, after it is put onto the battlefield. */
    counters?: [card: string, kind: string, n: number][];
  }
>;

/** One side of a staged game (tutorial), by card names. */
export interface ScenarioSide {
  name?: string;
  life?: number;
  /** Library in order: the first card is the top. */
  library: string[];
  hand: string[];
  battlefield?: (string | { card: string; tapped?: boolean; sick?: boolean })[];
  graveyard?: string[];
}

/** Staged game (tutorial): known starting state and scripted opponent (or an AI of the given level). */
export interface ScenarioSpec {
  you: ScenarioSide;
  opponent: ScenarioSide;
  active: "you" | "opponent";
  turn?: number;
  mulligan?: boolean;
  opponentPlays: ScriptAction[] | AiLevel;
}

export type ToWorker =
  | {
      type: "start";
      seed: number;
      /** Names of the human player and of the AI players (p2, p3…), in the interface language. */
      playerName: string;
      aiNames?: string[];
      playerDeck: DeckEntries;
      /** Forced first player (next game of a BO3: the loser of the previous one); absent: random draw. */
      startingPlayer?: string;
      aiDecks: DeckEntries[];
      /** Sideboards of the player and of each AI, outside the game (North Wind Avatar); absent: none. */
      playerSide?: DeckEntries;
      aiSides?: DeckEntries[];
      /** Definitions of the cards used (by name): the worker does not bundle the whole card database. */
      defs: Record<string, CardDef>;
      sandbox?: Sandbox;
      /** Fast mode of the interface tests (dev): the AI plays without pauses. */
      fast?: boolean;
      /** Tutorial: staged game instead of shuffled decks (the decks are then empty). */
      scenario?: ScenarioSpec;
      /** Level of the opposing AIs (medium by default). */
      aiLevel?: AiLevel;
      /**
       * Commander (PLAN-E): Commander game; `commanders` gives, for the player then each AI, the number of cards at the
       * top of the deck that are its commanders.
       */
      variant?: GameVariant;
      commanders?: number[];
    }
  /**
   * Resume of a saved game (page reopened): the record is replayed, then the game goes on against AIs of the given
   * level.
   */
  | {
      type: "resume";
      record: GameRecord;
      defs: Record<string, CardDef>;
      aiLevel?: AiLevel;
      fast?: boolean;
    }
  /**
   * Catalog of the nameable names ("choose a card name"), sent once when the worker is created: the worker's engine
   * accepts these names (`registerNameCatalog`) without bundling the card database.
   */
  | { type: "names"; catalog: NameCatalog }
  /** Tutorial: the opponent waits (explanation on screen). */
  | { type: "pause"; paused: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  /** Game record (export for a replay or to report a bug). */
  | { type: "export" };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  /** Error for the player (engine text, `msg`: translated at display). */
  | { type: "error"; message: string }
  /** Record requested; null if the game is not recorded (tutorial, sandbox). */
  | { type: "record"; record: GameRecord | null }
  /**
   * Save of the game (resume when the page is reopened): the record's header at the start, then the new decisions and
   * the checkpoints.
   */
  | { type: "saved"; header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }
  /** Resume impossible (the game no longer replays identically, for example after an engine update). */
  | { type: "resumeFailed"; message: string };
