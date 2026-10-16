/**
 * Standard meta cards (plan P4, phase 1), lot M1: Harmonize (Winternight Stories), Bargain chosen by the player
 * (Torch the Tower), delve (Elven Passage), earthbend (Ba Sing Se, Earthbender Ascension), "damage can't be
 * prevented", "one or two targets", Surrak, Sunderflock, Hydro-Man, Sandman…
 */

import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { powerFor, powerRuleAbility } from "../src/dsl";
import { legalActions } from "../src/legal";
import { addReplacement } from "../src/replacement";
import { chars } from "../src/state";
import { playerStatic } from "../src/statics";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, advanceUntil, customCard, idOf, idsOf, passAccepting, passUntil, scenario } from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const activate = (s: S, source: string, targets?: Record<string, string[]>) => {
  const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
  return settle(act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets }));
};
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Meta, lot M1", () => {
  describe("Harmonie (Winternight Stories)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Island", "Fire Elemental"], graveyard: ["Winternight Stories"], library: lands("Forest", 5) },
      });

    it("cast from the graveyard by tapping a creature: its power reduces the cost, then the card is exiled", () => {
      let s = setup();
      const card = idOf(s, "p1", "graveyard", "Winternight Stories");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.additional?.tap?.options).toEqual([fire]);
      expect(opt?.type === "cast" && opt.additional?.tap?.suggested).toEqual([fire]);
      s = settle(act(s, "p1", { type: "cast", card, tap: [fire] }));
      expect(s.objects[fire]?.tapped).toBe(true);
      // Draw three cards, then discard two (no creature card).
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Winternight Stories")).toBe(true);
    });

    it("with no tapped creature, the harmonize cost {4}{U} is paid in full", () => {
      const s = setup();
      const card = idOf(s, "p1", "graveyard", "Winternight Stories");
      expect(() => act(s, "p1", { type: "cast", card, tap: [] })).toThrow(/Not enough mana/);
      // Without `tap`, the default choice (the suggested creature) applies.
      const after = settle(act(s, "p1", { type: "cast", card }));
      expect(after.objects[idOf(s, "p1", "battlefield", "Fire Elemental")]?.tapped).toBe(true);
    });

    it("a tapped creature cannot reduce the cost of a spell cast from hand", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Fire Elemental"], hand: ["Winternight Stories"] },
      });
      const card = idOf(s, "p1", "hand", "Winternight Stories");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      expect(() => act(s, "p1", { type: "cast", card, tap: [fire] })).toThrow(/No creature to tap/);
    });
  });

  describe("Marchandage (Torch the Tower)", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Mountain", "Fishing Pole", "Adventuring Gear"],
          hand: ["Torch the Tower"],
          library: lands("Forest", 3),
        },
        p2: { battlefield: ["Fire Elemental", "Bear Cub"] },
      });

    it("the player chooses the sacrificed permanent; 3 damage and scry 1", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const gear = idOf(s, "p1", "battlefield", "Adventuring Gear");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.kickerAffordable).toBe(true);
      expect(opt?.type === "cast" && opt.kickerPermanents).toHaveLength(2);
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [fire] }, kicked: true, sacrifice: [gear] }));
      expect(idsOf(s, "p1", "graveyard", "Adventuring Gear")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Fishing Pole")).toHaveLength(1);
      expect(s.objects[fire]?.damage).toBe(3);
    });

    it("without bargaining: 2 damage; a creature it kills is exiled", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [fire] } }));
      expect(s.objects[fire]?.damage).toBe(2);
      let t = setup();
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Torch the Tower"), targets: { t: [bear] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
      expect(t.exile.some((id) => t.objects[id]?.owner === "p2")).toBe(true);
    });

    it('damage prevented: the creature is not "dealt damage by Torch the Tower", it dies normally later (PLAN-L L4)', () => {
      let s = setup();
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      addReplacement(s, "preventDamage", [bear], "r-test");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Torch the Tower"), targets: { t: [bear] } }));
      expect(s.objects[bear]?.damage ?? 0).toBe(0);
      destroy(s, bear);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("a permanent that cannot pay for the bargain is refused", () => {
      const s = setup();
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [fire] }, kicked: true, sacrifice: [mountain] })).toThrow(
        /Invalid permanent/,
      );
    });
  });

  it("Elven Passage: the searched-for land is untapped if an Elf is delved (hand or battlefield)", () => {
    const run = (hand: string[]) => {
      let s = scenario({ p1: { battlefield: ["Elven Passage"], hand, library: ["Forest", "Island"] } });
      s = activate(s, idOf(s, "p1", "battlefield", "Elven Passage"));
      const forest = idOf(s, "p1", "battlefield", "Forest");
      return { tapped: s.objects[forest]?.tapped, life: s.players.p1?.life };
    };
    expect(run(["Llanowar Elves"])).toEqual({ tapped: false, life: 19 });
    expect(run(["Bear Cub"])).toEqual({ tapped: true, life: 19 });
  });

  describe("Earthbend", () => {
    it("Ba Sing Se: the land becomes a 2/2 creature with haste, and returns tapped when it dies", () => {
      let s = scenario({
        p1: { battlefield: ["Ba Sing Se", ...lands("Forest", 3), "Mountain"], hand: ["Burst Lightning"] },
      });
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      const target = forests[2] as string;
      s = activate(s, idOf(s, "p1", "battlefield", "Ba Sing Se"), { t: [target] });
      const c = chars(s, target);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect([c.power, c.toughness]).toEqual([2, 2]);
      expect(c.keywords).toContain("haste");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [target] } }));
      const back = idsOf(s, "p1", "battlefield", "Forest");
      expect(back).toHaveLength(3);
      const returned = back.find((id) => !forests.includes(id)) as string;
      expect(s.objects[returned]?.tapped).toBe(true);
      expect(chars(s, returned).types).toEqual(["Land"]);
    });

    it("Ba Sing Se enters tapped unless you control a basic land", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Ba Sing Se"] } });
        const card = idOf(s, "p1", "hand", "Ba Sing Se");
        s = act(s, "p1", { type: "playLand", card });
        return s.objects[idOf(s, "p1", "battlefield", "Ba Sing Se")]?.tapped;
      };
      expect(play([])).toBe(true);
      expect(play(["Forest"])).toBe(false);
    });

    it("Earthbender Ascension: at the fourth quest counter, +1/+1 and trample", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Bear Cub"],
          hand: ["Earthbender Ascension", "Forest"],
          library: lands("Forest", 5),
        },
      });
      const first = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Earthbender Ascension") }));
      // Enters: earthbend 2, then a basic land enters (landfall: first counter).
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      const asc = idOf(s, "p1", "battlefield", "Earthbender Ascension");
      expect(s.objects[asc]?.counters.quest).toBe(1);
      expect(chars(s, first).types).toContain("Creature");
      (s.objects[asc] as { counters: Record<string, number> }).counters.quest = 3;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(s.objects[asc]?.counters.quest).toBe(4);
      const pumped = [bear, first].filter((id) => chars(s, id).keywords.includes("trample"));
      expect(pumped).toHaveLength(1);
    });
  });

  it("Impractical Joke: damage can't be prevented this turn, 3 damage to the target", () => {
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Impractical Joke"] }, p2: { battlefield: ["Fire Elemental"] } });
    const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Impractical Joke"), targets: { t: [fire] } }));
    expect(s.objects[fire]?.damage).toBe(3);
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(false);
  });

  it("Prismari Charm: 'one or two targets' (at least one)", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Prismari Charm"] }, p2: { battlefield: ["Bear Cub"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Prismari Charm");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [] } })).toThrow(/Missing target/);
    const one = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: ["p2"] } }));
    expect(one.players.p2?.life).toBe(19);
    const two = settle(act(setup(), "p1", { type: "cast", card, mode: 1, targets: { t: ["p2", bear] } }));
    expect(two.players.p2?.life).toBe(19);
    expect(two.objects[bear]?.damage).toBe(1);
  });

  it("Surrak: draw when an opponent targets a creature spell you control", () => {
    let s = scenario({
      p1: { battlefield: ["Surrak, Elusive Hunter", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      p2: { battlefield: ["Island"], hand: ["Spell Snare"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Spell Snare"), targets: { t: [spell] } });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Sunderflock: costs less with an Elemental; returns the non-Elemental creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Fire Elemental", ...lands("Island", 3), "Llanowar Elves"], hand: ["Sunderflock"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sunderflock") }));
    expect(idsOf(s, "p1", "battlefield", "Sunderflock")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Hearth Elemental: {X} less per instant, sorcery or Adventure card in the graveyard", () => {
    const s = scenario({
      p1: {
        battlefield: lands("Mountain", 2),
        hand: ["Hearth Elemental // Stoke Genius"],
        graveyard: ["Opt", "Burst Lightning", "Hearth Elemental // Stoke Genius", "Bear Cub"],
      },
    });
    const card = idOf(s, "p1", "hand", "Hearth Elemental // Stoke Genius");
    // {5}{R} - 3 = {2}{R}: not payable with two Mountains; with one more, yes.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card && a.face === undefined)).toBe(false);
    const t = scenario({
      p1: {
        battlefield: lands("Mountain", 3),
        hand: ["Hearth Elemental // Stoke Genius"],
        graveyard: ["Opt", "Burst Lightning", "Hearth Elemental // Stoke Genius", "Bear Cub"],
      },
    });
    const card2 = idOf(t, "p1", "hand", "Hearth Elemental // Stoke Genius");
    expect(legalActions(t, "p1").some((a) => a.type === "cast" && a.card === card2 && a.face === undefined)).toBe(true);
  });

  it("Hydro-Man: at your end step, becomes a land ('{T}: Add {U}') until your next turn", () => {
    let s = scenario({ p1: { battlefield: ["Hydro-Man, Fluid Felon"] } });
    const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const land = chars(s, hydro);
    expect(land.types).toEqual(["Land"]);
    expect(land.abilities.some((a) => a.kind === "mana")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, hydro).types).toEqual(["Creature"]);
  });

  it("Sandman: P/T = lands controlled; returns from the graveyard with a land card", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 5),
        graveyard: ["Sandman, Shifting Scoundrel", "Island"],
      },
    });
    const sandman = idOf(s, "p1", "graveyard", "Sandman, Shifting Scoundrel");
    const island = idOf(s, "p1", "graveyard", "Island");
    s = activate(s, sandman, { t: [island] });
    const back = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
    expect(s.objects[back]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    expect(chars(s, back).power).toBe(6);
    expect(chars(s, back).blockRules.map((r) => r.cantBeBlockedBy)).toContainEqual({ maxPower: 2 });
  });

  it("Leatherhead enters with a hexproof counter", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Leatherhead, Swamp Stalker"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Leatherhead, Swamp Stalker") }));
    const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
    expect(s.objects[lh]?.counters.hexproof).toBe(1);
    expect(chars(s, lh).keywords).toEqual(expect.arrayContaining(["hexproof", "trample"]));
  });

  it("Great Hall of the Biblioplex: {5} makes it a 2/4 Wizard creature that grows with instants", () => {
    let s = scenario({
      p1: { battlefield: ["Great Hall of the Biblioplex", ...lands("Island", 6)], hand: ["Opt"], library: lands("Island", 3) },
    });
    const hall = idOf(s, "p1", "battlefield", "Great Hall of the Biblioplex");
    const opts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === hall);
    const animate = opts.find((a) => a.type === "activate" && a.label?.includes("Wizard"));
    s = settle(act(s, "p1", { type: "activate", source: hall, ability: animate?.type === "activate" ? animate.ability : -1 }));
    expect([chars(s, hall).power, chars(s, hall).toughness]).toEqual([2, 4]);
    expect(chars(s, hall).subtypes).toContain("Wizard");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }));
    expect(chars(s, hall).power).toBe(3);
  });

  it("Sapling Nursery: affinity for Forests, a 3/4 Treefolk for each land", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Sapling Nursery", "Forest"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sapling Nursery") }));
    expect(idsOf(s, "p1", "battlefield", "Sapling Nursery")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const tree = idOf(s, "p1", "battlefield", "Treefolk");
    expect([chars(s, tree).power, chars(s, tree).toughness]).toEqual([3, 4]);
    expect(chars(s, tree).keywords).toContain("reach");
  });
});

describe("Meta, lot M2", () => {
  it("Requiting Hex: wither 1 (chosen creature) as an optional cost, then 2 life", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Bear Cub", "Fire Elemental"], hand: ["Requiting Hex"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Requiting Hex"),
        targets: { t: [elves] },
        kicked: true,
        sacrifice: [fire],
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[fire]?.counters["-1/-1"]).toBe(1);
    expect(s.players.p1?.life).toBe(22);
  });

  it("We Say Thee Nay!: Teamwork 2 (tapped creatures): {4} must be paid", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island", "Bear Cub"], hand: ["We Say Thee Nay!"] },
      p2: { battlefield: [...lands("Mountain", 7)], hand: ["Fire Elemental"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Fire Elemental") });
    // p2 has two Mountains left after the Elemental: enough for {2}, not for {4}.
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    const opt = castOption(s, idOf(s, "p1", "hand", "We Say Thee Nay!"));
    expect(opt?.type === "cast" && opt.kickerTap?.minPower).toBe(2);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "We Say Thee Nay!"),
      targets: { t: [spell] },
      kicked: true,
      tap: [bear],
    });
    expect(s.objects[bear]?.tapped).toBe(true);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
  });

  it("We Say Thee Nay!: teamwork counts the power of the tapped creatures, not a pilot's crew bonus (PLAN-M M8b)", () => {
    const PILOT = customCard({
      name: "Test Pilot",
      typeLine: "Creature — Pilot",
      subtypes: ["Pilot"],
      power: 1,
      toughness: 1,
      abilities: [powerRuleAbility(powerFor.pilot)],
    });
    let s = scenario({
      p1: { battlefield: ["Island", "Island", PILOT], hand: ["We Say Thee Nay!"] },
      p2: { battlefield: [...lands("Mountain", 7)], hand: ["Fire Elemental"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Fire Elemental") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    // Power 1 (it would crew as 3): teamwork 2 isn't offered, and refused.
    const opt = castOption(s, idOf(s, "p1", "hand", "We Say Thee Nay!"));
    const pilot = idOf(s, "p1", "battlefield", "Test Pilot");
    expect(opt?.type === "cast" && opt.kickerTap?.powers[pilot]).toBe(1);
    expect(opt?.type === "cast" && opt.kickerTap?.suggested).toEqual([]);
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "We Say Thee Nay!"),
        targets: { t: [spell] },
        kicked: true,
        tap: [pilot],
      }),
    ).toThrow();
  });

  it("Azog: destroys a creature, its controller amasses Goblins X (its power)", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
      p2: { battlefield: ["Fire Elemental"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Azog, Moria's Ruin") }));
    const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
    expect(s.objects[army]?.controller).toBe("p2");
    expect(chars(s, army).subtypes).toContain("Goblin");
    expect(chars(s, army).power).toBe(5);
  });

  it("Wan Shi Tong: X counters, X/2 cards; an opponent who searches gives it a counter and a card", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Wan Shi Tong, Librarian"], library: lands("Island", 5) },
      p2: { battlefield: ["Evolving Wilds"], library: ["Forest", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Wan Shi Tong, Librarian"), x: 4 }));
    const wan = idOf(s, "p1", "battlefield", "Wan Shi Tong, Librarian");
    expect(s.objects[wan]?.counters["+1/+1"]).toBe(4);
    expect(s.players.p1?.hand).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const wilds = idOf(s, "p2", "battlefield", "Evolving Wilds");
    const a = legalActions(s, "p2").find((x) => x.type === "activate" && x.source === wilds);
    s = passAccepting(
      act(s, "p2", { type: "activate", source: wilds, ability: a?.type === "activate" ? a.ability : -1 }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    expect(s.objects[wan]?.counters["+1/+1"]).toBe(5);
  });

  it("Wolverine: new damage heals the previous damage", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Wolverine, Fierce Fighter", damage: 4 }, "Mountain"], hand: ["Burst Lightning"] },
    });
    const w = idOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: [w] } }));
    expect(idsOf(s, "p1", "battlefield", "Wolverine, Fierce Fighter")).toHaveLength(1);
    expect(s.objects[w]?.damage).toBe(2);
  });

  it("Day of Black Sun: creatures with mana value X or less lose their abilities and are destroyed", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Day of Black Sun"] },
      p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Day of Black Sun"), x: 2 }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(1);
  });

  it("Mutagen Man: X Mutagens, whose ability costs {1} less; The Ooze: one Mutagen per counter", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "The Ooze", "Bear Cub"], hand: ["Mutagen Man, Living Ooze"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mutagen Man, Living Ooze"), x: 2 }));
    const mutagens = idsOf(s, "p1", "battlefield", "Mutagen");
    expect(mutagens).toHaveLength(2);
    // All the Forests are tapped: the {1} ability no longer costs anything.
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === mutagens[0]);
    expect(a).toBeDefined();
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: mutagens[0] as string,
        ability: a?.type === "activate" ? a.ability : -1,
        targets: { t: [bear] },
      }),
    );
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Hidden Lair: {U} or {B} only if it entered this turn or with a basic land", () => {
    const colors = (battlefield: string[]) => {
      const s = scenario({ p1: { battlefield } });
      const lair = idOf(s, "p1", "battlefield", "Hidden Lair");
      return legalActions(s, "p1")
        .filter((a) => a.type === "tapForMana" && a.source === lair)
        .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    };
    expect(colors(["Hidden Lair"])).toEqual(["C"]);
    expect(colors(["Hidden Lair", "Island"])).toEqual(expect.arrayContaining(["C", "U", "B"]));
  });

  it("Strategic Betrayal: the opponent exiles a creature and its graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Strategic Betrayal"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Opt", "Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Strategic Betrayal"), targets: { t: ["p2"] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(3);
  });

  it("The Wondrous Wasp: the tapped creature loses its abilities as long as the Wasp stays", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["The Wondrous Wasp"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Wondrous Wasp") }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(chars(s, angel).keywords).not.toContain("flying");
  });
});

describe("Meta, lot M3", () => {
  it("Deceit evoked with {U}{U}: returns a permanent, then it is sacrificed", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Deceit"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Deceit");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card, alternative: true });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    // Target choice of the ability ({U}{U} spent): the Cub.
    for (let i = 0; i < 10 && s.pending?.kind === "choice"; i++) {
      const p = s.pending;
      const r = p.request;
      const values = r.type === "pick" && r.options.includes(bear) ? [bear] : r.suggested;
      s = act(s, p.player, { type: "choose", values });
    }
    s = settle(s);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Deceit")).toHaveLength(1);
  });

  it("Deceit evoked: the player chooses the hybrid mana's color ({U}{U}: return only; {B}{B}: discard only)", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Deceit"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Shivan Dragon"] },
      });
    const run = (s: GameState, hybridAs: "U" | "B" | "G") => {
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let t = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deceit"), alternative: true, hybridAs });
      t = passAccepting(t, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      for (let i = 0; i < 10 && t.pending?.kind === "choice"; i++) {
        const r = t.pending.request;
        t = act(t, t.pending.player, {
          type: "choose",
          values: r.type === "pick" && r.options.includes(bear) ? [bear] : r.suggested,
        });
      }
      return settle(t);
    };
    const s0 = setup();
    const opt = castOption(s0, idOf(s0, "p1", "hand", "Deceit"));
    expect(opt?.type === "cast" && opt.hybridColors).toEqual(["U", "B"]);
    const u = run(setup(), "U");
    expect(idsOf(u, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(u, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    const b = run(setup(), "B");
    expect(idsOf(b, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(b, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    // A color the hybrid does not allow is refused.
    expect(() => run(setup(), "G")).toThrow(/hybrid mana/);
  });

  it("Captain Marvel: power-up costs {2} the turn she enters, only once", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Captain Marvel, Earth's Protector"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Captain Marvel, Earth's Protector") }));
    const cm = idOf(s, "p1", "battlefield", "Captain Marvel, Earth's Protector");
    s = activate(s, cm);
    expect(s.objects[cm]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[cm]?.counters.indestructible).toBe(1);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === cm)).toBe(false);
  });

  it("Voice of Victory: Mobilize 2; your opponents can't cast spells during your turn", () => {
    let s = scenario({
      p1: { battlefield: ["Voice of Victory"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const voice = idOf(s, "p1", "battlefield", "Voice of Victory");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voice, defender: "p2" }] });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(0);
  });

  it("Petrified Hamlet: the chosen name blocks non-mana abilities and gives '{T}: Add {C}'", () => {
    let s = scenario({ p1: { hand: ["Petrified Hamlet"] }, p2: { battlefield: ["Rogue's Passage", ...lands("Forest", 4)] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Petrified Hamlet") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: ["Rogue's Passage"] }));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const passage = idOf(s, "p2", "battlefield", "Rogue's Passage");
    expect(legalActions(s, "p2").some((a) => a.type === "activate" && a.source === passage)).toBe(false);
    expect(chars(s, passage).abilities.filter((a) => a.kind === "mana").length).toBe(2);
  });

  it("Superior Spider-Man: copy of a creature card in a graveyard, 4/4 and with its name; the card is exiled", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Superior Spider-Man"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const angel = s.players.p2?.graveyard[0] as string;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Superior Spider-Man") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: [angel] }));
    const spidey = s.battlefield.find(
      (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
    ) as string;
    const c = chars(s, spidey);
    expect(c.name).toBe("Superior Spider-Man");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Angel", "Spider", "Hero"]));
    expect(s.players.p2?.graveyard).toHaveLength(0);
  });

  it("Deadly Cover-Up: collect evidence 6, destroys all creatures, exiles a card and its namesakes, draws for the hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Deadly Cover-Up"], graveyard: ["Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Opt"], hand: ["Opt", "Forest"], library: ["Opt", "Island", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deadly Cover-Up"), kicked: true }));
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const names = (ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names(s.players.p2?.hand ?? [])).not.toContain("Opt");
    // A card from hand exiled: a card drawn.
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(names(s.players.p2?.library ?? [])).not.toContain("Opt");
  });

  it("Erode: the controller of the destroyed creature searches for a basic land", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Erode"] },
      p2: { battlefield: ["Bear Cub"], library: ["Forest", "Opt"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Erode"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
  });
});

describe("Meta, lot M4", () => {
  it("Multiversal Passage: one option per basic land type; it gets that type and mana", () => {
    let s = scenario({ p1: { hand: ["Multiversal Passage"] } });
    const card = idOf(s, "p1", "hand", "Multiversal Passage");
    const opts = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card);
    expect(opts).toHaveLength(10);
    s = act(s, "p1", { type: "playLand", card, payLife: true, landType: "Island" });
    const p = idOf(s, "p1", "battlefield", "Multiversal Passage");
    expect(s.objects[p]?.tapped).toBe(false);
    expect(chars(s, p).subtypes).toContain("Island");
    expect(s.players.p1?.life).toBe(18);
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === p && a.colors.includes("U"))).toBe(true);
  });

  it("Together as One: X = colors of mana spent", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Island", "Swamp", ...lands("Mountain", 3)],
        hand: ["Together as One"],
        library: lands("Forest", 5),
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Together as One"), targets: { p: ["p1"], d: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
    expect(s.players.p1?.life).toBe(24);
    expect(s.players.p1?.hand).toHaveLength(4);
  });

  it("Clarion Conqueror: even creatures' mana abilities are blocked", () => {
    const s = scenario({ p1: { battlefield: ["Llanowar Elves"] }, p2: { battlefield: ["Clarion Conqueror"] } });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(false);
  });

  it("Thor: a noncreature spell deals damage equal to its mana value", () => {
    let s = scenario({
      p1: { battlefield: ["Thor, God of Thunder", ...lands("Mountain", 3)], hand: ["Fiery Annihilation"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fiery Annihilation"), targets: { t: [bear] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["p2"] });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
  });

  it("The Mind Stone: exploited, it blinks a permanent at your end step", () => {
    let s = scenario({ p1: { battlefield: ["The Mind Stone", ...lands("Plains", 6), { name: "Bear Cub", sick: false }] } });
    const stone = idOf(s, "p1", "battlefield", "The Mind Stone");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === stone);
    s = settle(act(s, "p1", { type: "activate", source: stone, ability: opt?.type === "activate" ? opt.ability : -1 }));
    expect(s.objects[stone]?.harnessed).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[bear]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Jeskai Revelation: returns a spell to hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), ...lands("Mountain", 2), ...lands("Plains", 2)],
        hand: ["Jeskai Revelation"],
        library: lands("Island", 4),
      },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Jeskai Revelation"), targets: { b: [spell], d: ["p2"] } }),
    );
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Monk")).toHaveLength(2);
    expect(s.players.p2?.life).toBe(16);
  });

  it("The Legend of Roku: three chapters, then Avatar Roku (firebending 4)", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["The Legend of Roku // Avatar Roku"], library: lands("Mountain", 10) },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Legend of Roku // Avatar Roku") }));
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p1")).toHaveLength(3);
    for (let i = 0; i < 3; i++)
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > (i === 0 ? 3 : 3 + 2 * i));
    const roku = s.battlefield.find((id) => chars(s, id).name === "Avatar Roku");
    expect(roku).toBeDefined();
  });

  it("Magmatic Hellkite: destroys a nonbasic land; its controller gets a tapped basic land with a stun counter", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Magmatic Hellkite"] },
      p2: { battlefield: ["Hidden Lair"], library: ["Island", "Opt"] },
    });
    const lair = idOf(s, "p2", "battlefield", "Hidden Lair");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Magmatic Hellkite") }));
    expect(s.objects[lair]).toBeUndefined();
    const island = idOf(s, "p2", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    expect(s.objects[island]?.counters.stun).toBe(1);
  });
});

describe("Meta, lot M5", () => {
  it("Storied: three artifacts or legendaries give a lasting story; Thorin Oakenshield gives ward {1}", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Skateboard", "Fishing Pole"],
        hand: ["Thorin Oakenshield"],
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Thorin Oakenshield") }));
    expect(s.players.p1?.designations).toContain("enduringStory");
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    expect(chars(s, pole).abilities.some((a) => a.kind === "triggered" && a.trigger.on === "becomesTarget")).toBe(true);
  });

  it("Sneak: The Last Ronin's Technique, an unblocked attacker returns; three tapped and attacking Spirits", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["The Last Ronin's Technique"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1");
    const card = idOf(s, "p1", "hand", "The Last Ronin's Technique");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card, alternative: true });
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    s = passAccepting(s, (x) => x.stack.length === 0);
    const spirits = idsOf(s, "p1", "battlefield", "Ninja Turtle Spirit");
    expect(spirits).toHaveLength(3);
    expect(spirits.every((id) => s.combat?.attackers.some((a) => a.id === id))).toBe(true);
  });

  it("Chaos: Carnage discarded this turn is cast from the graveyard for {B}{R}", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Mountain", "Iron-Shield Elf"], hand: ["Carnage, Crimson Chaos"] } });
    const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
    s = activate(s, elf);
    if (s.pending?.kind === "choice")
      s = settle(act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "Carnage, Crimson Chaos")] }));
    const carnage = idOf(s, "p1", "graveyard", "Carnage, Crimson Chaos");
    expect(castOption(s, carnage)).toBeDefined();
  });

  it("Paradigm: Decorum Dissertation is exiled; an emblem casts a copy at your next main phase", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Decorum Dissertation"], library: lands("Swamp", 10) } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Decorum Dissertation"), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Decorum Dissertation")).toBe(true);
    // At the beginning of your next main phase, the emblem offers to cast a copy: it is cast.
    s = advanceUntil(s, (x) => (x.pending?.kind === "priority" && !!x.pending.castNow) || x.turn.number > 5);
    const now = s.pending?.kind === "priority" ? s.pending.castNow : undefined;
    expect(now).toBeDefined();
    s = act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Pyrrhic Strike: 'both' requires withering 2", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 3), "Fire Elemental"], hand: ["Pyrrhic Strike"] },
        p2: { battlefield: ["Fishing Pole", "Shivan Dragon"] },
      });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Pyrrhic Strike");
    const targets = { a: [idOf(s, "p2", "battlefield", "Fishing Pole")], c: [idOf(s, "p2", "battlefield", "Shivan Dragon")] };
    expect(() => act(s, "p1", { type: "cast", card, mode: 2, targets })).toThrow(/additional cost/);
    const t = settle(act(setup(), "p1", { type: "cast", card, mode: 2, targets, kicked: true }));
    expect(idsOf(t, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Fire Elemental")]?.counters["-1/-1"]).toBe(2);
  });

  it("Dragonfire Blade: Equip {4} costs {1} less per color; protection from monocolored", () => {
    let s = scenario({ p1: { battlefield: ["Dragonfire Blade", "Swiftblade Vindicator", "Plains", "Mountain"] } });
    const blade = idOf(s, "p1", "battlefield", "Dragonfire Blade");
    const vind = idOf(s, "p1", "battlefield", "Swiftblade Vindicator");
    s = activate(s, blade, { t: [vind] });
    expect(s.objects[blade]?.attachedTo).toBe(vind);
    expect(chars(s, vind).protections.map((p) => p.from)).toContainEqual({ colorCount: 1 });
  });

  it("Bilbo's Gambit with the gift: no more spells this turn", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Bilbo's Gambit", "Opt"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bilbo's Gambit"), targets: { t: [spell] }, kicked: true });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
  });

  it("Case of the Uneaten Feast resolved: creatures in the graveyard can be cast this turn", () => {
    let s = scenario({ p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 2)], graveyard: ["Bear Cub"] } });
    const caseId = idOf(s, "p1", "battlefield", "Case of the Uneaten Feast");
    (s.objects[caseId] as { solved?: boolean }).solved = true;
    s.version += 1;
    s = activate(s, caseId);
    expect(castOption(s, idOf(s, "p1", "graveyard", "Bear Cub"))).toBeDefined();
  });

  it("Belladonna Took: 1 life, then a card, then counters, over the turn's tokens", () => {
    let s = scenario({
      p1: {
        battlefield: ["Belladonna Took", ...lands("Mountain", 6)],
        hand: ["Dragon Fodder", "Dragon Fodder"],
        library: lands("Forest", 4),
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Fodder") }));
    expect(s.players.p1?.life).toBe(21);
    expect(s.players.p1?.hand).toHaveLength(2);
  });
});

describe("Meta, lot M6", () => {
  it("Airbend: Aang exiles a creature, which its owner can recast for {2}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Island"], hand: ["Aang, Swift Savior // Aang and La, Ocean's Fury"] },
      p2: { battlefield: ["Serra Angel", ...lands("Forest", 2)] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Aang, Swift Savior // Aang and La, Ocean's Fury") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    for (let i = 0; i < 5 && s.pending?.kind === "choice"; i++) {
      const r = s.pending.request;
      s = act(s, "p1", { type: "choose", values: r.type === "pick" && r.options.includes(angel) ? [angel] : r.suggested });
    }
    s = settle(s);
    const exiled = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel") as string;
    expect(exiled).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const opt = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === exiled);
    expect(opt).toBeDefined();
    s = settle(act(s, "p2", { type: "cast", card: exiled }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Springleaf Drum: taps a creature for mana of any color", () => {
    const s = scenario({ p1: { battlefield: ["Springleaf Drum", "Bear Cub"] } });
    const drum = idOf(s, "p1", "battlefield", "Springleaf Drum");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === drum)).toBe(true);
    const t = scenario({ p1: { battlefield: ["Springleaf Drum", "Fishing Pole"] } });
    const drum2 = idOf(t, "p1", "battlefield", "Springleaf Drum");
    expect(legalActions(t, "p1").some((a) => a.type === "tapForMana" && a.source === drum2)).toBe(false);
  });

  it("Head of the Hunt: an opposing creature that dies is exiled, and you create a Wolf", () => {
    let s = scenario({
      p1: { battlefield: ["Head of the Hunt", "Mountain"], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Burst Lightning"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Wolf")).toHaveLength(1);
  });

  it("The End: exiles the target and its namesakes; its controller draws for those in hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["The End"] },
      p2: {
        battlefield: ["Bear Cub"],
        hand: ["Bear Cub", "Opt"],
        graveyard: ["Bear Cub"],
        library: ["Bear Cub", "Island", "Island"],
      },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "The End"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      }),
    );
    const bears = s.exile.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub");
    expect(bears).toHaveLength(4);
    expect(s.players.p2?.hand).toHaveLength(2);
  });

  it("Vicious Rivalry: X is paid in life; destroys artifacts and creatures with mana value X or less", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Vicious Rivalry"] },
      p2: { battlefield: ["Bear Cub", "Fishing Pole", "Serra Angel"] },
    });
    const opt = castOption(s, idOf(s, "p1", "hand", "Vicious Rivalry"));
    expect(opt?.type === "cast" && opt.xMax).toBe(20);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vicious Rivalry"), x: 2 }));
    expect(s.players.p1?.life).toBe(18);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Michelangelo's Technique: two creatures with total mana value 6 or less", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Michelangelo's Technique"],
          library: ["Shivan Dragon", "Llanowar Elves", "Serra Angel", ...lands("Forest", 5)],
        },
      });
    let s = setup();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Michelangelo's Technique") });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const lib = s.players.p1?.library ?? [];
    const dragon = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon") as string;
    const angel = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel") as string;
    const elves = lib.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Llanowar Elves") as string;
    expect(() => act(s, "p1", { type: "choose", values: [dragon, angel] })).toThrow(/Total mana value/);
    s = settle(act(s, "p1", { type: "choose", values: [angel, elves] }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Gollum: each opposing spell of the chosen parity gives a mode not yet chosen", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Gollum, Riddle Master"], library: lands("Swamp", 5) },
      p2: { battlefield: lands("Forest", 4), hand: ["Bear Cub", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Gollum, Riddle Master") });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    if (s.pending?.kind === "choice") s = settle(act(s, "p1", { type: "choose", values: ["even"] }));
    const gollum = idOf(s, "p1", "battlefield", "Gollum, Riddle Master");
    expect(s.objects[gollum]?.chosen?.parity).toBe("even");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    for (let i = 0; i < 2; i++) {
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p2");
    }
    // Two different modes out of the three: never the same twice.
    const effects = [
      (s.objects[gollum]?.counters["+1/+1"] ?? 0) > 0,
      (s.players.p2?.life ?? 20) < 20,
      (s.players.p1?.hand.length ?? 0) > 0,
    ];
    expect(effects.filter(Boolean)).toHaveLength(2);
  });

  it("Ral Zarek −7: the opponent skips as many turns as coin flips won", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Ral Zarek, Guest Lecturer" }] } });
    const ral = idOf(s, "p1", "battlefield", "Ral Zarek, Guest Lecturer");
    (s.objects[ral] as { counters: Record<string, number> }).counters.loyalty = 7;
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ral && a.label?.includes("Five"));
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: ral,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: ["p2"] },
      }),
    );
    const skips = s.playerEffects.filter((e) => e.player === "p2" && e.ability.skips === "turn").length;
    // Every player sees how many turns the opponent will skip (its bar), as many as the coins that came up heads.
    expect(projectView(s, "p1").players.p2?.skipTurns ?? 0).toBe(skips);
    expect(projectView(s, "p2").players.p2?.skipTurns ?? 0).toBe(skips);
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.step === "main1");
    expect(s.turn.active).toBe(skips > 0 ? "p1" : "p2");
    // A skipped turn consumes one.
    if (skips > 0) expect(projectView(s, "p1").players.p2?.skipTurns ?? 0).toBeLessThan(skips);
  });

  it("Jennifer Walters transforms into The Sensational She-Hulk", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), ...lands("Plains", 4), "Jennifer Walters // The Sensational She-Hulk"] },
    });
    const jen = idOf(s, "p1", "battlefield", "Jennifer Walters // The Sensational She-Hulk");
    s = activate(s, jen);
    expect(chars(s, jen).name).toBe("The Sensational She-Hulk");
    expect(chars(s, jen).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
  });

  it("Spider-Sense: counters a triggered ability", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Spider-Sense"] },
      p2: { battlefield: [...lands("Swamp", 1)], hand: ["Dream Beavers"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Dream Beavers") });
    s = passUntil(
      s,
      (x) =>
        x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
    const trig = s.stack[0]?.id as string;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Spider-Sense"), targets: { t: [trig] } }));
    expect(s.players.p1?.life).toBe(20);
  });
});
