import { readFileSync } from "node:fs";
import type { ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import {
  battlefieldModel,
  battlefieldRows,
  battlefieldSlots,
  fanSpread,
  fitBattlefield,
  fitHand,
  HAND_MIN_STEP,
  HAND_STEP,
  handFan,
  MIN_W,
  PERM_RATIO,
  type Slot,
  slotUnits,
  splitLines,
  TAP_DEG,
  TAP_W,
  TOKEN_GROUP_MIN,
  tokenSlots,
  WALKER_MIN_PEEK,
  walkerStep,
} from "../src/board/layout";

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
  };
}
const creature = (over: Partial<ObjectView> = {}) => obj({ types: ["Creature"], power: 2, toughness: 2, ...over });
const token = (name: string, over: Partial<ObjectView> = {}) =>
  creature({ name, defId: `token:${name}`, isToken: true, ...over });
const n = (k: number, f: () => ObjectView) => Array.from({ length: k }, f);

describe("battlefield rows", () => {
  it("creatures in front, planeswalkers at the end; lands then artifacts and enchantments behind", () => {
    const bear = creature({ name: "Bear" });
    const animatedLand = obj({ name: "Sanctuary", types: ["Land", "Creature"] });
    const vehicle = obj({ name: "Caravan", types: ["Artifact"] });
    const aura = obj({ name: "Pacifism", types: ["Enchantment"] });
    const walker = obj({ name: "Ajani", types: ["Planeswalker"] });
    const forest = obj({ name: "Forest", types: ["Land"] });
    const rows = battlefieldRows([vehicle, bear, forest, walker, animatedLand, aura]);
    expect(rows.creatures).toEqual([bear, animatedLand]);
    expect(rows.walkers).toEqual([walker]);
    expect(rows.lands).toEqual([forest]);
    expect(rows.support).toEqual([vehicle, aura]);
    const { front, back, walkers } = battlefieldSlots(rows);
    expect(front.map((s) => s.objs[0]?.name)).toEqual(["Bear", "Sanctuary"]);
    expect(walkers.map((s) => s.objs[0]?.name)).toEqual(["Ajani"]);
    expect(back.map((s) => [s.objs[0]?.name, s.block])).toEqual([
      ["Forest", "lands"],
      ["Caravan", "support"],
      ["Pacifism", "support"],
    ]);
  });
});

describe("grouping tokens", () => {
  it(`groups from ${TOKEN_GROUP_MIN} identical tokens, not below`, () => {
    expect(tokenSlots(n(TOKEN_GROUP_MIN - 1, () => token("Rabbit"))).map((s) => s.kind)).toEqual(["single", "single", "single"]);
    const slots = tokenSlots(n(TOKEN_GROUP_MIN + 2, () => token("Rabbit")));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ kind: "tokens" });
    expect(slots[0]?.objs).toHaveLength(TOKEN_GROUP_MIN + 2);
  });

  it("does not group cards that are not tokens", () => {
    expect(tokenSlots(n(6, () => creature({ name: "Bear", defId: "bear" })))).toHaveLength(6);
  });

  it("separates tokens whose state differs (tapped, counters, damage, summoning sickness, interface state)", () => {
    const base = n(4, () => token("Rabbit"));
    const odd = [
      token("Rabbit", { tapped: true }),
      token("Rabbit", { counters: { "+1/+1": 1 }, power: 3, toughness: 3 }),
      token("Rabbit", { damage: 1 }),
      token("Rabbit", { sick: true }),
    ];
    const slots = tokenSlots([...base, ...odd]);
    expect(slots.map((s) => [s.kind, s.objs.length])).toEqual([["tokens", 4], ...odd.map(() => ["single", 1])]);
    // An attacker chosen in the interface leaves the stack.
    const chosen = base[0]?.id;
    const split = tokenSlots(base, undefined, (o) => (o.id === chosen ? "attacking" : ""));
    expect(split.map((s) => s.kind)).toEqual(["single", "single", "single", "single"]);
  });

  it("a token carrying an Aura or an Equipment stays alone", () => {
    const tokens = n(5, () => token("Soldier"));
    const slots = tokenSlots(tokens, new Set([tokens[2]?.id as string]));
    expect(slots.map((s) => s.objs.length)).toEqual([4, 1]);
  });
});

describe("lines and card size", () => {
  const singles = (k: number): Slot[] => n(k, () => creature()).map((o) => ({ kind: "single", objs: [o] }));

  it("splitLines cuts into two balanced lines, in order", () => {
    const slots = singles(7);
    const [a, b] = splitLines(slots, 2);
    expect([a?.length, b?.length].sort()).toEqual([3, 4]);
    expect([...(a ?? []), ...(b ?? [])]).toEqual(slots);
    expect(splitLines(slots, 1)).toEqual([slots]);
    const three = splitLines(singles(9), 3);
    expect(three.map((l) => l.length)).toEqual([3, 3, 3]);
  });

  it("a single line as long as the cards fit large", () => {
    const fit = fitBattlefield(1600, 360, singles(5), singles(5), []);
    expect(fit).toMatchObject({ frontLines: 1, backLines: 1 });
    expect(fit.cardW).toBeGreaterThan(100);
  });

  it("goes to 2 lines when that gives larger cards, then shrinks", () => {
    const one = fitBattlefield(1600, 360, singles(40), singles(2), []);
    expect(one.frontLines).toBe(2);
    const oneLineW = (1600 - 28 - 10 * 39) / 40;
    expect(one.cardW).toBeGreaterThan(oneLineW);
    const more = fitBattlefield(1600, 360, singles(60), singles(2), []);
    expect(more.frontLines).toBeGreaterThanOrEqual(2);
    expect(more.cardW).toBeLessThan(one.cardW);
    expect(more.cardW).toBeGreaterThanOrEqual(MIN_W);
  });

  it("in a narrow area (multiplayer), goes beyond 2 lines rather than overflow", () => {
    const fit = fitBattlefield(420, 330, singles(30), singles(4), []);
    expect(fit.frontLines).toBeGreaterThan(2);
    const perLine = Math.ceil(30 / fit.frontLines);
    expect(perLine * fit.cardW + 10 * (perLine - 1)).toBeLessThanOrEqual(420 - 28);
  });

  it("a tapped art card leans by 17° and takes the width of its leaning box (PLAN-V)", () => {
    const rad = (TAP_DEG * Math.PI) / 180;
    expect(TAP_W).toBeCloseTo(Math.cos(rad) + PERM_RATIO * Math.sin(rad));
    expect(TAP_W).toBeGreaterThan(1.3);
    expect(TAP_W).toBeLessThan(1.32);
    const tapped = (k: number): Slot => ({
      kind: k > 1 ? "pile" : "single",
      objs: n(k, () => obj({ types: ["Land"], tapped: true })),
    });
    expect(slotUnits(tapped(1))).toBeCloseTo(TAP_W);
    // A pile of three tapped lands: each card behind shows the same share as untapped (LAND_OVERLAP).
    expect(slotUnits(tapped(3))).toBeCloseTo(TAP_W + 2 * (TAP_W - 0.74));
  });

  it("the card shapes match styles.css", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    expect(css).toContain(`--perm-ratio: ${PERM_RATIO};`);
    expect(css).toContain("--card-ratio: 1.395;");
  });

  it("a stack of tokens takes barely more than one card", () => {
    const [stack] = tokenSlots(n(12, () => token("Goblin")));
    expect(slotUnits(stack as Slot)).toBeLessThan(1.2);
  });
});

describe("planeswalker area (as in MTGA)", () => {
  const walker = (over: Partial<ObjectView> = {}) => obj({ name: "Ajani", types: ["Planeswalker"], ...over });
  const singles = (k: number): Slot[] => n(k, () => creature()).map((o) => ({ kind: "single", objs: [o] }));

  it("planeswalkers and battles are never among the creatures, even over several lines", () => {
    const perms = [...n(15, () => creature()), walker(), ...n(15, () => creature()), obj({ name: "Siege", types: ["Battle"] })];
    const { front, walkers } = battlefieldSlots(battlefieldRows(perms));
    expect(walkers.map((s) => s.objs[0]?.name)).toEqual(["Ajani", "Siege"]);
    for (const line of splitLines(front, 3)) expect(line.every((s) => s.objs[0]?.types.includes("Creature"))).toBe(true);
  });

  it("a planeswalker that became a creature joins the creatures", () => {
    const { front, walkers } = battlefieldSlots(battlefieldRows([walker({ types: ["Planeswalker", "Creature"] })]));
    expect(front).toHaveLength(1);
    expect(walkers).toHaveLength(0);
  });

  it("the planeswalker column reduces the room for rows, and does not exist without them", () => {
    const without = fitBattlefield(150, 2000, singles(1), singles(1), []);
    const withWalker = fitBattlefield(150, 2000, singles(1), singles(1), [{ kind: "single", objs: [walker()] }]);
    expect(withWalker.cardW).toBeLessThan(without.cardW);
    expect(without.walkerStep).toBeGreaterThan(0);
  });

  it("several planeswalkers stack, then overlap without hiding their name", () => {
    const h = 100 * PERM_RATIO;
    expect(walkerStep(2, 100, 400)).toBeGreaterThanOrEqual(h);
    const step = walkerStep(5, 100, 400);
    expect(step).toBeLessThan(h);
    expect(step).toBeGreaterThanOrEqual(h * WALKER_MIN_PEEK);
    expect(walkerStep(40, 100, 400)).toBeCloseTo(h * WALKER_MIN_PEEK);
  });

  it("back row: lands, then artifacts, then enchantments", () => {
    const perms = [
      obj({ name: "Omniscience", types: ["Enchantment"] }),
      obj({ name: "Forest", types: ["Land"] }),
      obj({ name: "Fishing Pole", types: ["Artifact"] }),
      obj({ name: "Banner", types: ["Artifact"] }),
    ];
    const { back } = battlefieldSlots(battlefieldRows(perms));
    expect(back.map((s) => s.objs[0]?.name)).toEqual(["Forest", "Fishing Pole", "Banner", "Omniscience"]);
  });
});

describe("hand (it tightens instead of overflowing)", () => {
  it("keeps the natural spacing when there is room", () => {
    expect(fitHand(2000, 100, 7)).toBe(100 * HAND_STEP);
  });
  it("fits in the available width", () => {
    for (const [w, n] of [
      [600, 10],
      [900, 17],
      [400, 8],
    ] as const) {
      const step = fitHand(w, 100, n);
      expect(100 + (n - 1) * step).toBeLessThanOrEqual(w);
    }
  });
  it("does not go below the minimal spacing", () => {
    expect(fitHand(200, 100, 30)).toBe(100 * HAND_MIN_STEP);
  });
});

describe("battlefield model (shared by the DOM and 3D boards, PLAN-W)", () => {
  it("Auras and Equipment go under their host, whoever controls them; exiled cards under their exiler's host", () => {
    const host = creature();
    const aura = obj({ types: ["Enchantment"], attachedTo: host.id, controller: "p2" });
    const shelter = obj({ types: ["Enchantment"], attachedTo: host.id });
    const exiledCard = obj({ types: ["Creature"], zone: "exile", controller: "p2" });
    const land = obj({ types: ["Land"] });
    const theirs = creature({ controller: "p2" });
    const view = {
      battlefield: [host, aura, shelter, land, theirs],
      exile: [exiledCard],
      exiledWith: { [shelter.id]: [exiledCard.id] },
    };
    const m = battlefieldModel(view, "p1", () => "");
    expect(m.attachments.get(host.id)).toEqual([aura, shelter]);
    expect(m.exiled.get(host.id)).toEqual([exiledCard]);
    expect(m.front.map((sl) => sl.objs)).toEqual([[host]]);
    expect(m.back.map((sl) => sl.objs)).toEqual([[land]]);
    expect(m.depth).toBe(3);
    // The opponent's battlefield: their creature, not the Aura they control on my creature.
    const theirsModel = battlefieldModel(view, "p2", () => "");
    expect(theirsModel.front.map((sl) => sl.objs)).toEqual([[theirs]]);
    expect(theirsModel.back).toEqual([]);
  });

  it("the signature changes when a card taps, not when a glow does; tokens in different interface states stay apart", () => {
    const tokens = n(5, () => token("Goblin"));
    const view = { battlefield: tokens, exile: [], exiledWith: {} };
    const plain = battlefieldModel(view, "p1", () => "");
    expect(plain.front.map((sl) => sl.kind)).toEqual(["tokens"]);
    const lit = battlefieldModel(view, "p1", (o) => (o.id === tokens[0]?.id ? "target" : ""));
    expect(lit.front.map((sl) => sl.objs.length)).toEqual([1, 4]);
    const tapped = battlefieldModel(
      { battlefield: tokens.map((o) => ({ ...o, tapped: o === tokens[0] })), exile: [], exiledWith: {} },
      "p1",
      () => "",
    );
    expect(tapped.signature).not.toBe(plain.signature);
    expect(battlefieldModel(view, "p1", () => "glow").signature).toBe(plain.signature);
  });
});

describe("hand fan", () => {
  it("symmetric angles and lifts, flatter in a narrow hand", () => {
    expect(handFan(0, 1, 24)).toEqual({ angle: 0, lift: 0 });
    const fan = [0, 1, 2, 3, 4].map((i) => handFan(i, 5, 24));
    expect(fan.map((f) => f.angle)).toEqual([-8, -4, 0, 4, 8]);
    expect(fan[0]?.lift).toBe(fan[4]?.lift);
    expect(fan[2]?.lift).toBe(0);
    expect(fanSpread(1200, 100)).toBe(24);
    expect(fanSpread(300, 100)).toBe(9);
    expect(fanSpread(300, 0)).toBe(24);
  });
});
