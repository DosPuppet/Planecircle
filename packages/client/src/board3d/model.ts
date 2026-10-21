/**
 * What the 3D board draws (PLAN-W W3): every card of every battlefield, with its pose on the table. The meshes and their
 * DOM proxies both come from these nodes, so they never disagree. Pure.
 */
import { type GameView, HIDDEN_CARD_ID, type ObjectView } from "@mtgx/engine";
import { type BattlefieldFit, battlefieldModel, fitBattlefield, PERM_RATIO } from "../board/layout";
import { type Placed, placeBattlefield } from "./placement";
import type { CardPose } from "./project";
import { PX, type Table, toWorld } from "./seats";

/** Height between two cards stacked in a zone (world units): enough to never flicker, too small to see. */
export const STACK_STEP = 0.004;

export interface CardNode {
  uid: string;
  id: string;
  obj: ObjectView;
  /** Controller of the battlefield it lies on. */
  player: string;
  mine: boolean;
  pose: CardPose;
  /** Size of the card in table pixels (its DOM proxy). */
  px: { w: number; h: number };
  /** Painting order in its zone. */
  layer: number;
  kind: Placed["kind"] | "library" | "graveyard" | "exile";
  pile?: string[];
  /** A pile of the seat: how many cards it holds (its thickness). */
  count?: number;
  /** Its glow (`glows.ts`: "target", "playable"…), for the rim of its mesh (W6). */
  glow?: string | null;
}

/**
 * The cards of every seat's battlefield. `uiKey`: interface state of a token (tokens in different states are not
 * piled, as on the DOM board); `attacking`: the permanents that move forward.
 */
export function tableNodes(
  view: Pick<GameView, "battlefield" | "exile" | "exiledWith">,
  table: Table,
  uiKey: (o: ObjectView) => string,
  attacking: (o: ObjectView) => boolean,
): { nodes: CardNode[]; fits: Map<string, BattlefieldFit> } {
  const nodes: CardNode[] = [];
  const fits = new Map<string, BattlefieldFit>();
  for (const seat of table.seats) {
    const m = battlefieldModel(view, seat.player, uiKey);
    const fit = fitBattlefield(seat.zone.w, seat.zone.h, m.front, m.back, m.walkers, m.depth);
    fits.set(seat.player, fit);
    for (const p of placeBattlefield(m, fit, seat.zone, seat.mine, attacking)) {
      const at = toWorld(table, seat.zone.x + p.x, seat.zone.y + p.y);
      nodes.push({
        uid: p.uid,
        id: p.id,
        obj: p.obj,
        player: seat.player,
        mine: seat.mine,
        pose: { x: at.x, z: at.z, y: STACK_STEP * (p.layer + 1), w: p.w / PX, h: p.h / PX, rot: p.rot },
        px: { w: p.w, h: p.h },
        layer: p.layer,
        kind: p.kind,
        pile: p.pile,
      });
    }
  }
  return { nodes, fits };
}

/** Thickness of one card in a pile (world units), and the most cards a pile shows. */
export const PILE_STEP = 0.004;
export const PILE_MAX = 60;

/**
 * The piles of every seat, in its column on the left: library (backs), graveyard and exile (their last card face up).
 * Your library is nearest to you; an opponent's, nearest to them. A pile keyed by its top card's uid: a card put into a
 * graveyard flies there from where it was.
 */
export function pileNodes(view: Pick<GameView, "players" | "exile" | "exiledWith">, table: Table): CardNode[] {
  const nodes: CardNode[] = [];
  // Cards a permanent exiled lie under it, not on the exile pile.
  const held = new Set(Object.values(view.exiledWith ?? {}).flat());
  for (const seat of table.seats) {
    const player = view.players[seat.player];
    if (!player) continue;
    const r = seat.piles;
    const gap = r.w * 0.1;
    const h = Math.min(r.w * 0.78 * PERM_RATIO, (r.h - 4 * gap) / 3);
    const w = h / PERM_RATIO;
    const exiled = view.exile.filter((o) => o.owner === seat.player && !held.has(o.id));
    const piles: [CardNode["kind"], ObjectView | undefined, number][] = [
      ["library", undefined, player.libraryCount],
      ["graveyard", player.graveyard[player.graveyard.length - 1], player.graveyard.length],
      ["exile", exiled[exiled.length - 1], exiled.length],
    ];
    piles.forEach(([kind, top, count], i) => {
      if (!count) return;
      // From the seat's own edge towards the middle of the table: yours from the bottom, an opponent's from the top.
      const fromEdge = gap + i * (h + gap) + h / 2;
      const y = seat.mine ? r.y + r.h - fromEdge : r.y + fromEdge;
      const at = toWorld(table, r.x + r.w / 2, y);
      const obj = top ?? ({ id: `${kind}:${seat.player}`, uid: `${kind}:${seat.player}`, defId: HIDDEN_CARD_ID } as ObjectView);
      nodes.push({
        uid: kind === "library" ? `library:${seat.player}` : obj.uid,
        id: obj.id,
        obj,
        player: seat.player,
        mine: seat.mine,
        pose: { x: at.x, z: at.z, y: PILE_STEP * Math.min(count, PILE_MAX), w: w / PX, h: h / PX, rot: 0 },
        px: { w, h },
        layer: 0,
        kind,
        count,
      });
    });
  }
  return nodes;
}
