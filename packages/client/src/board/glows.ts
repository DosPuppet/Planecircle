/**
 * Glows of the cards (PLAN-W W1): what each card on the battlefield, in the hand and on the stack is lit for. Pure, so
 * the DOM board and the 3D board light the same cards; the callers read the store and pass what these rules need.
 */
import type { ActionOption, GameView, ObjectView } from "@mtgx/engine";
import type { PickRequest } from "../prompts/boardChoice";

export type Glow =
  | "playable"
  | "target"
  | "selectable"
  | "selected"
  /** Picked among the highlighted options (target, choice on the board): green check mark. */
  | "picked"
  | "attacking"
  | "blocking"
  | "activatable"
  | null;

/** The targeting of a spell or ability being cast (`Casting` in the store). */
export interface TargetingState {
  stage: string;
  sourceId: string;
  picked?: string[];
  spec?: { legal: string[] } | null;
}

/** What the glows of the battlefield depend on. */
export interface GlowState {
  view: GameView;
  /** The viewer's options at priority (`myActions`). */
  acts: ActionOption[];
  /** A choice made on the board (`boardPick`). */
  pick: PickRequest | null;
  casting: TargetingState | null;
  attackers: string[];
  blocks: Record<string, string>;
  selectedBlocker: string | null;
  aiming: string | null;
  selection: string[];
  /** The resolution being shown: its targets are lit. */
  resolving: { item: { targets: string[] } } | null;
}

/** The glow of a permanent. */
export function permanentGlow(s: GlowState): (o: ObjectView) => Glow {
  const p = s.view.pending;
  const mine = p?.player === s.view.viewer;
  return (o) => {
    // Resolution shown: its targets are highlighted.
    if (s.resolving) return s.resolving.item.targets.includes(o.id) ? "target" : null;
    if (s.casting?.stage === "target") {
      if (s.casting.picked?.includes(o.id)) return "picked";
      return s.casting.spec?.legal.includes(o.id) ? "target" : null;
    }
    // Choice on the board: options highlighted, selection in gold, the rest dimmed.
    if (s.pick) {
      if (s.selection.includes(o.id)) return "picked";
      return s.pick.options.includes(o.id) ? "target" : null;
    }
    // Attackable planeswalker: highlighted when an attacker is being aimed.
    if (mine && p?.kind === "declareAttackers" && p.defenders?.includes(o.id)) {
      return s.aiming && (p.allowed?.[s.aiming] ?? p.defenders).includes(o.id) ? "target" : null;
    }
    if (mine && p?.kind === "declareAttackers") {
      if (s.aiming === o.id) return "selected";
      if (s.attackers.includes(o.id)) return "attacking";
      return p.candidates?.includes(o.id) ? "selectable" : null;
    }
    if (mine && p?.kind === "declareBlockers") {
      if (s.selectedBlocker === o.id) return "selected";
      if (s.blocks[o.id]) return "blocking";
      const cand = p.candidates?.find((c) => c.blocker === s.selectedBlocker);
      if (cand?.attackers.includes(o.id)) return "target";
      return p.candidates?.some((c) => c.blocker === o.id) ? "selectable" : null;
    }
    if (o.attacking) return "attacking";
    if (o.blocking) return "blocking";
    if (s.acts.some((a) => a.type === "activate" && a.source === o.id)) return "activatable";
    return null;
  };
}

/** Cards of the hand (or playable from elsewhere) the viewer can play or activate now. */
export function playableCards(acts: ActionOption[]): Set<string> {
  return new Set(
    acts.flatMap((a) => (a.type === "cast" || a.type === "playLand" ? [a.card] : a.type === "activate" ? [a.source] : [])),
  );
}

/** The glow of a card in the hand: chosen (discard, being cast), else playable. */
export function handGlow(id: string, selection: string[], casting: TargetingState | null, playable: Set<string>): Glow {
  if (selection.includes(id) || casting?.sourceId === id) return "selected";
  return playable.has(id) ? "playable" : null;
}

/** The glow of a stack item: a legal target (or picked) while targeting, else the top of the stack. */
export function stackGlow(id: string, top: boolean, casting: TargetingState | null): Glow {
  const targeting = casting?.stage === "target" ? casting.spec : null;
  if (targeting) return casting?.picked?.includes(id) ? "selected" : targeting.legal.includes(id) ? "target" : null;
  return top ? "selected" : null;
}
