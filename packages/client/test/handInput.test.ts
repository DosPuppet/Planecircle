/** Input on the hand (PLAN-W W1): first tap by finger lifts, drop above the hand plays. */
import { describe, expect, it } from "vitest";
import { DROP_MARGIN, dropPlays, handTap } from "../src/board/handInput";

describe("hand input", () => {
  it("by finger the first tap lifts, the second plays; a mouse or a choice of cards plays at once", () => {
    expect(handTap({ mouse: false, touch: true, selecting: false, lifted: false })).toBe("lift");
    expect(handTap({ mouse: false, touch: true, selecting: false, lifted: true })).toBe("play");
    expect(handTap({ mouse: true, touch: true, selecting: false, lifted: false })).toBe("play");
    expect(handTap({ mouse: false, touch: true, selecting: true, lifted: false })).toBe("play");
    expect(handTap({ mouse: false, touch: false, selecting: false, lifted: false })).toBe("play");
  });

  it("a card dropped above the hand plays, one dropped on it goes back", () => {
    expect(dropPlays(500 - DROP_MARGIN, 500)).toBe(true);
    expect(dropPlays(100, 500)).toBe(true);
    expect(dropPlays(500 - DROP_MARGIN + 1, 500)).toBe(false);
  });
});
