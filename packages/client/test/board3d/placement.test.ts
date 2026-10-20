/** 3D board (PLAN-W W2): cards placed in their zone as the DOM board's CSS places them. */
import type { ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  ATTACH_PEEK,
  battlefieldModel,
  fitBattlefield,
  GAP,
  LAND_SCALE,
  PERM_RATIO,
  TAP_DEG,
  TAP_W,
  TOKEN_OFFSET,
} from "../../src/board/layout";
import { ADVANCE, PAD_X, type Placed, placeBattlefield } from "../../src/board3d/placement";

let next = 0;
function obj(over: Partial<ObjectView> & { types: ObjectView["types"] }): ObjectView {
  const id = `o${next++}`;
  return {
    id,
    uid: `u${id}`,
    defId: over.name ?? "x",
    name: "x",
    typeLine: "",
    manaCost: "",
    text: "",
    implemented: true,
    isToken: false,
    owner: "p1",
    controller: "p1",
    zone: "battlefield",
    subtypes: [],
    colors: [],
    tapped: false,
    damage: 0,
    counters: {},
    keywords: [],
    sick: false,
    attacking: false,
    blocking: null,
    attachedTo: null,
    chosen: null,
    ...over,
  } as ObjectView;
}
const creature = (over: Partial<ObjectView> = {}) => obj({ types: ["Creature"], power: 2, toughness: 2, ...over });
const land = (over: Partial<ObjectView> = {}) => obj({ types: ["Land"], name: "Forest", ...over });
const ZONE = { w: 1400, h: 330 };

function place(battlefield: ObjectView[], mine = true, attacking: (o: ObjectView) => boolean = () => false) {
  const m = battlefieldModel({ battlefield, exile: [], exiledWith: {} }, "p1", () => "");
  const fit = fitBattlefield(ZONE.w, ZONE.h, m.front, m.back, m.walkers, m.depth);
  const placed = placeBattlefield(m, fit, ZONE, mine, attacking);
  const at = (o: ObjectView) => placed.find((p) => p.id === o.id) as Placed;
  return { fit, placed, at };
}

describe("3D board placement", () => {
  it("a lone creature is centered in the rows, at the card size of the fit", () => {
    const c = creature();
    const { fit, at } = place([c]);
    expect(at(c).x).toBeCloseTo(ZONE.w / 2, 9);
    expect(at(c).w).toBe(fit.cardW);
    expect(at(c).h).toBeCloseTo(fit.cardW * PERM_RATIO, 9);
    expect(at(c).rot).toBe(0);
  });

  it("a tapped card leans by TAP_DEG in a slot TAP_W wide", () => {
    const a = creature();
    const b = creature({ tapped: true });
    const { fit, at } = place([a, b]);
    expect(at(b).rot).toBe(TAP_DEG);
    expect(at(b).x - at(a).x).toBeCloseTo(fit.cardW / 2 + GAP + (fit.cardW * TAP_W) / 2, 9);
  });

  it("identical lands pile up, each overlapping the previous by 74 % of a land", () => {
    const lands = [land(), land(), land()];
    const { fit, at } = place(lands);
    const landW = fit.cardW * LAND_SCALE;
    expect(at(lands[1] as ObjectView).x - at(lands[0] as ObjectView).x).toBeCloseTo(landW * (1 - 0.74), 9);
    expect(at(lands[2] as ObjectView).w).toBeCloseTo(landW, 9);
  });

  it("a token pile: two shadows offset behind the top card, which carries the whole pile", () => {
    const goblins = Array.from({ length: 5 }, () => creature({ isToken: true, name: "Goblin", defId: "goblin" }));
    const { fit, placed } = place(goblins);
    const shadows = placed.filter((p) => p.kind === "shadow");
    const top = placed.find((p) => p.pile) as Placed;
    expect(shadows).toHaveLength(2);
    expect(top.pile).toEqual(goblins.map((g) => g.id));
    expect(top.x - (shadows[0] as Placed).x).toBeCloseTo(fit.cardW * TOKEN_OFFSET * 2, 9);
    expect(Math.max(...shadows.map((s) => s.layer))).toBeLessThan(top.layer);
    // The furthest shadow rises the most.
    expect((shadows[0] as Placed).y).toBeLessThan((shadows[1] as Placed).y);
  });

  it("an Aura peeks above its host, behind it", () => {
    const host = creature();
    const aura = obj({ types: ["Enchantment"], attachedTo: host.id });
    const { fit, at } = place([host, aura]);
    const h = fit.cardW * PERM_RATIO;
    expect(at(host).y - at(aura).y).toBeCloseTo(h * ATTACH_PEEK, 9);
    expect(at(aura).x).toBeCloseTo(at(host).x, 9);
    expect(at(aura).layer).toBeLessThan(at(host).layer);
    expect(at(aura).kind).toBe("attachment");
  });

  it("creatures towards the middle of the table: above the lands for you, below them for an opponent", () => {
    const c = creature();
    const l = land();
    const mine = place([c, l], true);
    expect(mine.at(c).y).toBeLessThan(mine.at(l).y);
    const theirs = place([c, l], false);
    expect(theirs.at(c).y).toBeGreaterThan(theirs.at(l).y);
  });

  it("an attacker moves forward, towards the opponent", () => {
    const c = creature();
    const still = place([c]).at(c).y;
    expect(place([c], true, () => true).at(c).y).toBeCloseTo(still - ADVANCE, 9);
    expect(place([c], false, () => true).at(c).y).toBeCloseTo(place([c], false).at(c).y + ADVANCE, 9);
  });

  it("planeswalkers in a column on the right; a crowded board stays inside its zone", () => {
    const walker = obj({ types: ["Planeswalker"], counters: { loyalty: 3 } });
    const crowd = [
      ...Array.from({ length: 9 }, () => creature()),
      ...Array.from({ length: 3 }, () => creature({ tapped: true })),
      ...Array.from({ length: 7 }, (_, i) => land({ defId: `l${i % 3}`, tapped: i < 2 })),
      obj({ types: ["Artifact"] }),
      walker,
    ];
    const { fit, placed, at } = place(crowd);
    expect(at(walker).x).toBeCloseTo(ZONE.w - PAD_X - fit.cardW / 2, 9);
    for (const p of placed) {
      const half = (p.rot ? p.w * TAP_W : p.w) / 2;
      expect(p.x - half).toBeGreaterThanOrEqual(PAD_X - 1e-6);
      expect(p.x + half).toBeLessThanOrEqual(ZONE.w - PAD_X + 1e-6);
      expect(p.y - p.h / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y + p.h / 2).toBeLessThanOrEqual(ZONE.h + 1e-6);
    }
    // Every permanent is placed once.
    expect(new Set(placed.filter((p) => p.kind === "permanent").map((p) => p.id)).size).toBe(crowd.length);
  });
});
