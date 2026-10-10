/**
 * "Staged" game (tutorial): hands, libraries in order, permanents and life totals known in advance.
 * No shuffle nor random opening hand; the game starts at the beginning of the given turn
 * (untap, upkeep, draw if it is not the first turn of the duel), or with the mulligan if asked.
 */
import { blankState, type StepResult } from "./game";
import { bump } from "./layers";
import { collectEvents, createObject, emit, opponentsOf, registerDef } from "./state";
import { advance, startTurnOf } from "./turn";
import type { CardDef, PlayerId } from "./types";

export interface ScenarioPermanent {
  def: CardDef;
  tapped?: boolean;
  /** Entered this turn: summoning sickness. */
  sick?: boolean;
}

export interface ScenarioPlayer {
  id: PlayerId;
  name: string;
  life?: number;
  /** Library in order: the first card is the top. */
  library: CardDef[];
  hand: CardDef[];
  battlefield?: ScenarioPermanent[];
  graveyard?: CardDef[];
}

export interface ScenarioOptions {
  seed: number;
  players: ScenarioPlayer[];
  /** Player whose turn it is. */
  active: PlayerId;
  /** Turn number (1 by default). */
  turn?: number;
  /** Start with the mulligan decision (turn 1). */
  mulligan?: boolean;
}

export function createScenario(opts: ScenarioOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    const turn = opts.mulligan ? 1 : Math.max(1, opts.turn ?? 1);
    const others = opponentsOf(s, opts.active);
    // In a duel, the player who started plays the odd turns (and does not draw on the first).
    s.turn.startingPlayer = turn % 2 === 1 || s.playerOrder.length > 2 ? opts.active : (others[0] ?? opts.active);
    s.turn.active = opts.active;
    for (const p of opts.players) {
      const add = (d: CardDef, zone: "library" | "hand" | "graveyard") => {
        registerDef(s, d);
        return createObject(s, d.id, p.id, zone);
      };
      for (const d of p.library) add(d, "library");
      for (const d of p.hand) add(d, "hand");
      for (const d of p.graveyard ?? []) add(d, "graveyard");
      for (const perm of p.battlefield ?? []) {
        registerDef(s, perm.def);
        const o = createObject(s, perm.def.id, p.id, "battlefield");
        o.controlledSince = perm.sick ? turn : 0;
        o.tapped = !!perm.tapped;
        if (perm.def.loyalty) o.counters.loyalty = perm.def.loyalty;
      }
      const player = s.players[p.id];
      if (player && !opts.mulligan) {
        // Turns already played: the permanents present do not have summoning sickness.
        player.lastTurnStarted = p.id === opts.active ? Math.max(0, turn - 2) : Math.max(1, turn - 1);
        player.turnsTaken = p.id === opts.active ? Math.floor((turn - 1) / 2) : Math.ceil((turn - 1) / 2);
      }
    }
    bump(s);
    emit({ type: "gameStart", startingPlayer: s.turn.startingPlayer });
    if (opts.mulligan) {
      s.setup.mulliganQueue = [opts.active, ...others];
      s.flow = "mulligan";
    } else {
      s.turn.number = turn;
      s.turn.step = "untap";
      startTurnOf(s, opts.active);
      emit({ type: "turnStart", turn, player: opts.active });
      s.flow = "stepStart";
    }
    advance(s);
    return s;
  });
  return { state, events };
}
