/**
 * Input on the cards of the hand (PLAN-W W1), shared by the DOM board and the 3D board: what a tap does, and where a
 * dragged card must be dropped to be played.
 */

/**
 * A tap on a card of the hand. By finger, the first tap lifts the card (and shows it in the preview), the second plays
 * it; with a mouse, or when choosing cards of the hand (discard), a tap plays (or picks) at once.
 */
export function handTap(o: { mouse: boolean; touch: boolean; selecting: boolean; lifted: boolean }): "lift" | "play" {
  return !o.mouse && o.touch && !o.selecting && !o.lifted ? "lift" : "play";
}

/** How far above the top of the hand a card must be dropped to be played (px). */
export const DROP_MARGIN = 20;

/**
 * A card dropped at `y` (viewport): played when it is above the hand, anywhere (as by a click: its targets are always
 * asked, a card brushing a creature on a quick drop must not target it).
 */
export function dropPlays(y: number, handTop: number): boolean {
  return y <= handTop - DROP_MARGIN;
}
