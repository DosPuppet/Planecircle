/**
 * What the 3D board draws (PLAN-W W3): every card of every battlefield, with its pose on the table. The meshes and their
 * DOM proxies both come from these nodes, so they never disagree. Pure.
 */
import type { GameView, ObjectView } from "@mtgx/engine";
import { type BattlefieldFit, battlefieldModel, fitBattlefield } from "../board/layout";
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
  kind: Placed["kind"];
  pile?: string[];
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
