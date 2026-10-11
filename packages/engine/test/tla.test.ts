/**
 * Avatar: The Last Airbender (partial set: cards of the meta decks): each handled card is checked against its
 * Oracle text (plan R, lot R7). Airbending (Avatar's Wrath, Appa), earthbending (Ba Sing Se), Lessons
 * (Combustion Technique, Accumulate Wisdom), kicker, additional costs and counterspells.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { addControlEffect } from "../src/control";
import * as dsl from "../src/dsl";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, decider, syncControl } from "../src/state";
import { plainText } from "../src/text";
import { canBlock } from "../src/turn";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState, ManaType, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  cast,
  castable,
  castNowOf,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  picking,
  scenario,
  settle,
  steal,
  untilCastNow,
} from "./helpers";

type S = GameState;
const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
};
describe("Avatar: The Last Airbender", () => {
  describe("Avatar's Wrath", () => {
    const setup = () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Shivan Dragon"], hand: ["Avatar's Wrath"] },
        p2: { battlefield: ["Serra Angel", "Fire Elemental", ...lands("Mountain", 5)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Avatar's Wrath", { targets: { t: [angel] } }));
      return { s, angel };
    };

    it("the chosen creature stays; all the others are exiled by airbending, then the spell exiles itself", () => {
      const { s, angel } = setup();
      expect(s.battlefield).toContain(angel);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
      expect(idsOf(s, "p2", "battlefield", "Fire Elemental")).toHaveLength(0);
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Fire Elemental")).toHaveLength(1);
      expect(exiled(s, "Avatar's Wrath")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it("its owner can recast a card exiled by airbending for {2}", () => {
      let { s } = setup();
      const dragon = exiled(s, "Shivan Dragon")[0] as string;
      // Only two untapped Plains remain: the Dragon ({4}{R}{R}) is cast for {2}.
      expect(castable(s, "p1", dragon)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: dragon }));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(0);
    });

    it("until your next turn, opponents can cast spells only from their hand", () => {
      let { s } = setup();
      const fire = exiled(s, "Fire Elemental")[0] as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", fire)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", fire)).toBe(true);
    });
  });

  it("Appa: airbending of your other nonland permanents; a spell cast from exile creates a 1/1 Ally", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Serra Angel"], hand: ["Appa, Steadfast Guardian"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const plains = idsOf(s, "p1", "battlefield", "Plains");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Appa, Steadfast Guardian"), (req) => {
      if (req.type !== "pick" || !req.options.includes(angel)) return undefined;
      options = req.options.map(String);
      return [angel];
    });
    // Neither a land, nor an opponent's permanent, nor Appa herself.
    expect(options).toContain(angel);
    expect(options).not.toContain(bear);
    expect(options).not.toContain(plains[0]);
    expect(options).not.toContain(idOf(s, "p1", "battlefield", "Appa, Steadfast Guardian"));
    const card = exiled(s, "Serra Angel")[0] as string;
    expect(card).toBeDefined();
    s = settle(act(s, "p1", { type: "cast", card }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    const ally = idOf(s, "p1", "battlefield", "Ally");
    expect([chars(s, ally).power, chars(s, ally).toughness, chars(s, ally).colors]).toEqual([1, 1, ["W"]]);
  });

  describe("Earthbending and Heartless Act", () => {
    const setup = () => {
      let s = scenario({
        p1: { battlefield: ["Ba Sing Se", ...lands("Forest", 4), ...lands("Swamp", 2)], hand: ["Heartless Act"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const land = idsOf(s, "p1", "battlefield", "Forest")[3] as string;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ba Sing Se"), { t: [land] }));
      return { s, land };
    };

    it("earthbending 2 turns the land into a 0/0 creature with two +1/+1 counters", () => {
      const { s, land } = setup();
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      const c = chars(s, land);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect([c.power, c.toughness]).toEqual([2, 2]);
    });

    it("Heartless Act destroys only a creature with no counters", () => {
      const { s, land } = setup();
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Heartless Act", { mode: 0, targets: { t: [land] } })).toThrow();
      const t = settle(cast(s, "p1", "Heartless Act", { mode: 0, targets: { t: [bear] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Heartless Act removes the counters: the 0/0 land dies and returns tapped, as a plain land", () => {
      const { s: s0, land } = setup();
      const forests = idsOf(s0, "p1", "battlefield", "Forest");
      const s = settle(cast(s0, "p1", "Heartless Act", { mode: 1, targets: { u: [land] } }));
      const now = idsOf(s, "p1", "battlefield", "Forest");
      expect(now).toHaveLength(4);
      const back = now.find((id) => !forests.includes(id)) as string;
      expect(back).toBeDefined();
      expect(s.objects[back]?.tapped).toBe(true);
      expect(chars(s, back).types).toEqual(["Land"]);
    });
  });

  describe("Lessons", () => {
    it("Combustion Technique: 2 damage plus one per Lesson in the graveyard; the creature that dies is exiled", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Combustion Technique"], graveyard },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Combustion Technique", { targets: { t: [angel] } }));
        return { s, angel };
      };
      const none = run(["Opt"]);
      expect(none.s.objects[none.angel]?.damage).toBe(2);
      const two = run(["Shared Roots", "Firebending Lesson", "Opt"]);
      expect(idsOf(two.s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(two.s, "p2", "graveyard", "Serra Angel")).toHaveLength(0);
      expect(exiled(two.s, "Serra Angel")).toHaveLength(1);
    });

    it("Firebending Lesson: 2 damage, or 5 if kicked", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Firebending Lesson"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(cast(s, "p1", "Firebending Lesson", { kicked, targets: { t: [fire] } }));
        return { s, fire };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.fire]?.damage).toBe(2);
      const kicked = run(true);
      expect(idsOf(kicked.s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(
        kicked.s.battlefield.filter((id) => nameOf(kicked.s, id) === "Mountain" && kicked.s.objects[id]?.tapped),
      ).toHaveLength(5);
    });

    it("Accumulate Wisdom: one card out of three, or all three with three Lessons in the graveyard", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 2),
            hand: ["Accumulate Wisdom"],
            graveyard,
            library: ["Opt", "Bear Cub", "Plains", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Accumulate Wisdom"));
        return s;
      };
      const one = run(["Shared Roots", "Opt"]);
      expect(one.players.p1?.hand).toHaveLength(1);
      expect(one.players.p1?.library).toHaveLength(3);
      // The other two go to the bottom of the library: the Forest stays on top.
      expect(nameOf(one, one.players.p1?.library[0] ?? "")).toBe("Forest");
      const three = run(["Shared Roots", "Firebending Lesson", "Price of Freedom"]);
      expect(three.players.p1?.hand.map((id) => nameOf(three, id)).sort()).toEqual(["Bear Cub", "Opt", "Plains"]);
      expect(three.players.p1?.library).toHaveLength(1);
    });
  });

  describe("It'll Quench Ya!", () => {
    const setup = (mountains: number) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["It'll Quench Ya!"] },
        p2: { battlefield: lands("Mountain", mountains), hand: ["Burst Lightning"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
      const bolt = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      return cast(s, "p1", "It'll Quench Ya!", { targets: { t: [bolt] } });
    };

    it("counters the spell if its controller can't pay {2}", () => {
      const s = settle(setup(1));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
    });

    it("the spell resolves if its controller pays {2}", () => {
      let asked = false;
      const s = settle(setup(3), (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      expect(asked).toBe(true);
      expect(s.players.p1?.life).toBe(18);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(3);
    });
  });

  describe("Deadly Precision", () => {
    it("sacrificing a creature as an additional cost: destroys the targeted creature", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Deadly Precision"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Deadly Precision", { sacrifice: [bear], targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("without sacrificing anything, {4} more must be paid", () => {
      const setup = (swamps: number) =>
        scenario({
          p1: { battlefield: lands("Swamp", swamps), hand: ["Deadly Precision"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      const poor = setup(4);
      expect(() =>
        cast(poor, "p1", "Deadly Precision", { targets: { t: [idOf(poor, "p2", "battlefield", "Serra Angel")] } }),
      ).toThrow();
      let s = setup(5);
      s = settle(cast(s, "p1", "Deadly Precision", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
    });
  });

  it("Price of Freedom: destroys an opponent's land, its controller searches for a tapped basic land, you draw", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Price of Freedom"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Island"], library: ["Plains", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Price of Freedom");
    const island = idOf(s, "p2", "battlefield", "Island");
    expect(() =>
      act(s, "p1", { type: "cast", card, targets: { t: [idsOf(s, "p1", "battlefield", "Mountain")[0] as string] } }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [island] } }));
    expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
    const plains = idOf(s, "p2", "battlefield", "Plains");
    expect(s.objects[plains]?.tapped).toBe(true);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
  });

  it("Callous Inspector: menace; when it dies, 1 damage to its controller and a Clue", () => {
    let s = scenario({ p1: { battlefield: ["Callous Inspector", "Mountain"], hand: ["Burst Lightning"] } });
    const inspector = idOf(s, "p1", "battlefield", "Callous Inspector");
    expect(chars(s, inspector).keywords).toContain("menace");
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [inspector] } }));
    expect(idsOf(s, "p1", "graveyard", "Callous Inspector")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(20);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Momo: the first flying creature spell each turn costs {1} less; Momo gets +1/+1 when it enters", () => {
    let s = scenario({
      p1: { battlefield: ["Momo, Friendly Flier", ...lands("Plains", 8)], hand: ["Serra Angel", "Serra Angel"] },
    });
    const momo = idOf(s, "p1", "battlefield", "Momo, Friendly Flier");
    const [first, second] = idsOf(s, "p1", "hand", "Serra Angel") as [string, string];
    s = settle(act(s, "p1", { type: "cast", card: first }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // The first Angel ({3}{W}{W}) cost only four Plains.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(4);
    expect([chars(s, momo).power, chars(s, momo).toughness]).toEqual([2, 2]);
    // No more reduction for the second: four Plains are not enough.
    expect(castable(s, "p1", second)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect([chars(s, momo).power, chars(s, momo).toughness]).toEqual([1, 1]);
  });

  it("Momo: a creature spell without flying cast first doesn't use up the reduction (first non-Lemur with flying)", () => {
    let s = scenario({
      p1: { battlefield: ["Momo, Friendly Flier", ...lands("Plains", 6)], hand: ["Savannah Lions", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Savannah Lions"));
    // Five Plains left: the Angel ({3}{W}{W}) costs {1} less and leaves one untapped.
    s = settle(cast(s, "p1", "Serra Angel"));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && !s.objects[id]?.tapped)).toHaveLength(1);
  });

  it("Obsessive Pursuit: when it enters, lose 1 life and create a Clue; X counters on an attacker (permanents sacrificed)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Obsessive Pursuit"] } });
    s = settle(cast(s, "p1", "Obsessive Pursuit"));
    expect(s.players.p1?.life).toBe(19);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    s = settle(activate(s, "p1", clue));
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = settle(s, picking([bear]));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("lifelink");
  });
});

describe("Avatar: The Last Airbender, foundation: waterbending and firebending", () => {
  /** "Waterbend {3}: draw a card" (test enchantment). */
  const fountain = customCard({
    name: "Test Fountain",
    types: ["Enchantment"],
    typeLine: "Enchantment",
    abilities: [
      dsl.activated({
        mana: "{3}",
        waterbend: true,
        effects: [dsl.fx.draw(1)],
        label: "Waterbend {3}: draw a card",
      }),
    ],
  });
  const drawn = (s: S) => s.players.p1?.hand.length ?? 0;
  /** Plain {1}{U} sorcery. */
  const divination = customCard({
    name: "Test Divination",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 1, colored: { U: 1 }, x: 0 },
    manaCostText: "{1}{U}",
    colors: ["U"],
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });

  it("waterbending: each untapped artifact or creature pays {1}, after the lands", () => {
    let s = scenario({ p1: { battlefield: [fountain, "Island", "Bear Cub", "Bear Cub"], library: lands("Island", 3) } });
    const source = idOf(s, "p1", "battlefield", "Test Fountain");
    const hand = drawn(s);
    s = settle(activate(s, "p1", source));
    expect(drawn(s)).toBe(hand + 1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
  });

  it("waterbending: tapped creatures pay nothing; an ordinary spell can't use them", () => {
    const s = scenario({
      p1: { battlefield: [fountain, "Island", "Bear Cub", { name: "Bear Cub", tapped: true }], hand: [divination] },
    });
    const source = idOf(s, "p1", "battlefield", "Test Fountain");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === source)).toBe(false);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Divination"))).toBe(false);
  });

  it("waterbending {X}: X can go up with untapped artifacts and creatures", () => {
    const katara = customCard({
      name: "Test Tide",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [dsl.activated({ mana: "{X}", waterbend: true, effects: [dsl.fx.draw(1)], label: "Waterbending {X}" })],
    });
    const s = scenario({ p1: { battlefield: [katara, "Island", "Bear Cub", "Bear Cub"] } });
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === idOf(s, "p1", "battlefield", "Test Tide"));
    expect(a?.type === "activate" ? a.xMax : null).toBe(3);
  });

  it('firebending N read among other keywords ("Trample, firebending 4, haste")', () => {
    const ozai = card("Ozai, the Phoenix King");
    expect(ozai.abilities.some((ab) => ab.kind === "triggered" && plainText(ab.label ?? "") === "Firebending 4")).toBe(true);
    expect(
      card("Ran and Shaw").abilities.some((ab) => ab.kind === "triggered" && plainText(ab.label ?? "") === "Firebending 2"),
    ).toBe(true);
  });

  it("firebending: the mana stays during combat, then empties at end of combat", () => {
    const firebender = customCard({ name: "Test Firebender", power: 2, toughness: 2, abilities: [dsl.firebending(2)] });
    let s = scenario({ p1: { battlefield: [firebender] } });
    const id = idOf(s, "p1", "battlefield", "Test Firebender");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(0);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Chooses mode `n` of a modal triggered ability, then the wanted objects. */
  const modeThen =
    (n: number, want: string[] = []): Answer =>
    (req, p) =>
      req.intent === "triggerMode" ? [String(n)] : picking(want)(req, p);
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Declares p1's attackers (toward p2) and resolves the attack triggers. */
  const attackWith = (s: S, ids: string[], answer?: Answer): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  describe("Avatar: The Last Airbender, lot A — blanc", () => {
    it("Aang, the Last Airbender: airbending when it enters; a Lesson cast gives it lifelink", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Aang, the Last Airbender", "Yip Yip!"] },
        p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Aang, the Last Airbender"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      const card = exiled(s, "Serra Angel")[0] as string;
      expect(card).toBeDefined();
      const aang = idOf(s, "p1", "battlefield", "Aang, the Last Airbender");
      expect(chars(s, aang).keywords).toContain("flying");
      expect(chars(s, aang).keywords).not.toContain("lifelink");
      s = settle(cast(s, "p1", "Yip Yip!", { targets: { t: [aang] } }));
      expect(chars(s, aang).keywords).toContain("lifelink");
      // Its owner can recast the Angel for {2}.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, aang).keywords).not.toContain("lifelink");
      expect(castable(s, "p2", card)).toBe(true);
    });

    it("Aang's Iceberg: exiles a permanent until it leaves; waterbending {3} sacrifices it, scry 2", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Bear Cub", "Bear Cub"], hand: ["Aang's Iceberg"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Aang's Iceberg"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      const iceberg = idOf(s, "p1", "battlefield", "Aang's Iceberg");
      let scried = false;
      s = settle(activate(s, "p1", iceberg), (req) => {
        if (req.intent === "scryBottom" || req.intent === "scryOrder") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Aang's Iceberg")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      // The lands were tapped: the three creatures paid for the waterbending.
      expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    describe("Airbender's Reversal", () => {
      it("destroys an attacking creature, but not a creature that isn't attacking", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: lands("Plains", 2), hand: ["Airbender's Reversal"] },
          p2: { battlefield: ["Bear Cub", "Bear Cub"] },
        });
        const [bear, other] = idsOf(s, "p2", "battlefield", "Bear Cub") as [string, string];
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(() => cast(s, "p1", "Airbender's Reversal", { mode: 0, targets: { t: [other] } })).toThrow();
        s = settle(cast(s, "p1", "Airbender's Reversal", { mode: 0, targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("airbending of one of your creatures: exiled, recastable for {2}", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Serra Angel"], hand: ["Airbender's Reversal"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Airbender's Reversal", { mode: 1, targets: { u: [angel] } }));
        const card = exiled(s, "Serra Angel")[0] as string;
        expect(card).toBeDefined();
        expect(castable(s, "p1", card)).toBe(true);
      });
    });

    it("Airbending Lesson: airbending of a nonland permanent, then draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Airbending Lesson"], library: ["Opt"] },
        p2: { battlefield: ["Aang's Iceberg", "Island"] },
      });
      const island = idOf(s, "p2", "battlefield", "Island");
      expect(() => cast(s, "p1", "Airbending Lesson", { targets: { t: [island] } })).toThrow();
      s = settle(cast(s, "p1", "Airbending Lesson", { targets: { t: [idOf(s, "p2", "battlefield", "Aang's Iceberg")] } }));
      expect(exiled(s, "Aang's Iceberg")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Opt"]);
    });

    it("Appa, Loyal Sky Bison: when it enters, airbending of another of your nonland permanents", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Appa, Loyal Sky Bison"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Appa, Loyal Sky Bison"), modeThen(1, [bear]));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Appa, Loyal Sky Bison")).toHaveLength(1);
    });

    it("Appa, Loyal Sky Bison: when attacking, one of your creatures gains flying until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Appa, Loyal Sky Bison", "Bear Cub"] } });
      const appa = idOf(s, "p1", "battlefield", "Appa, Loyal Sky Bison");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackWith(s, [appa], modeThen(0, [bear]));
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Avatar Enthusiasts and Kyoshi Warriors: a +1/+1 counter for each other Ally that enters", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Avatar Enthusiasts"], hand: ["Kyoshi Warriors"] } });
      const fan = idOf(s, "p1", "battlefield", "Avatar Enthusiasts");
      s = settle(cast(s, "p1", "Kyoshi Warriors"));
      // The Warriors (Allies) and the Ally token they create.
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(s.objects[fan]?.counters["+1/+1"]).toBe(2);
    });

    it("Compassionate Healer: when it becomes tapped, gain 1 life and scry 1", () => {
      let s = scenario({ p1: { battlefield: ["Compassionate Healer"] } });
      const healer = idOf(s, "p1", "battlefield", "Compassionate Healer");
      s = attackWith(s, [healer]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Curious Farm Animals: {2}, sacrifice: destroys an enchantment; when it dies, gain 3 life", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Curious Farm Animals"] },
        p2: { battlefield: ["Aang's Iceberg"] },
      });
      const iceberg = idOf(s, "p2", "battlefield", "Aang's Iceberg");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals"), { t: [iceberg] }));
      expect(idsOf(s, "p2", "graveyard", "Aang's Iceberg")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Curious Farm Animals")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Earth Kingdom Jailer: exiles an opponent's permanent with mana value 3 or greater until it leaves", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Mountain", 2)], hand: ["Earth Kingdom Jailer", "Lightning Strike"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Earth Kingdom Jailer"), (req) => {
        if (req.type !== "pick" || !req.options.includes(angel)) return undefined;
        options = req.options.map(String);
        return [angel];
      });
      expect(options).not.toContain(bear);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      // The Jailer leaves the battlefield: the Angel returns.
      const jailer = idOf(s, "p1", "battlefield", "Earth Kingdom Jailer");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [jailer] } }));
      expect(idsOf(s, "p1", "graveyard", "Earth Kingdom Jailer")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Earth Kingdom Protectors: sacrifice: another Ally you control gains indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Earth Kingdom Protectors", "Kyoshi Warriors", "Bear Cub"] } });
      const protectors = idOf(s, "p1", "battlefield", "Earth Kingdom Protectors");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const warriors = idOf(s, "p1", "battlefield", "Kyoshi Warriors");
      expect(chars(s, protectors).keywords).toContain("vigilance");
      expect(() => activate(s, "p1", protectors, { t: [bear] })).toThrow();
      s = settle(activate(s, "p1", protectors, { t: [warriors] }));
      expect(idsOf(s, "p1", "graveyard", "Earth Kingdom Protectors")).toHaveLength(1);
      expect(chars(s, warriors).keywords).toContain("indestructible");
    });

    it("Enter the Avatar State: Avatar, flying, first strike, lifelink and hexproof until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Enter the Avatar State"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Enter the Avatar State", { targets: { t: [bear] } }));
      const c = chars(s, bear);
      expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Avatar"]));
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "lifelink", "hexproof"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).subtypes).not.toContain("Avatar");
    });

    it("Fancy Footwork: untaps one or two creatures, +2/+2 each", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), { name: "Bear Cub", tapped: true }, { name: "Bear Cub", tapped: true }],
          hand: ["Fancy Footwork"],
        },
      });
      const [bear, grizzly] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s = settle(cast(s, "p1", "Fancy Footwork", { targets: { t: [bear, grizzly] } }));
      for (const id of [bear, grizzly]) {
        expect(s.objects[id]?.tapped).toBe(false);
        expect(pt(s, id)).toEqual([4, 4]);
      }
    });

    it("Gather the White Lotus: a white 1/1 Ally for each Plains you control", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Gather the White Lotus"] } });
      s = settle(cast(s, "p1", "Gather the White Lotus"));
      const allies = idsOf(s, "p1", "battlefield", "Ally");
      expect(allies).toHaveLength(3);
      expect(chars(s, allies[0] as string).colors).toEqual(["W"]);
    });

    it("Glider Staff: airbending of a creature when it enters; the equipped creature gets +1/+1 and flying", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Glider Staff"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glider Staff"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Glider Staff"), { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Hakoda: cast Ally spells from the top of your library; sacrifice: +0/+5 and indestructible", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 4), "Hakoda, Selfless Commander", "Bear Cub"],
          library: ["Kyoshi Warriors", "Serra Angel"],
        },
      });
      const top = s.players.p1?.library[0] as string;
      expect(nameOf(s, top)).toBe("Kyoshi Warriors");
      expect(castable(s, "p1", top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(idsOf(s, "p1", "battlefield", "Kyoshi Warriors")).toHaveLength(1);
      // The Angel is not an Ally.
      expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hakoda, Selfless Commander")));
      expect(idsOf(s, "p1", "graveyard", "Hakoda, Selfless Commander")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([2, 7]);
      expect(chars(s, bear).keywords).toContain("indestructible");
    });

    it("Jeong Jeong's Deserters: a +1/+1 counter on a targeted creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Jeong Jeong's Deserters"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Jeong Jeong's Deserters"), picking([bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("The Legend of Yangchen: I exiles an opponent's permanent with MV 3+, II each draws three cards, III transforms", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 5),
          hand: ["The Legend of Yangchen // Avatar Yangchen"],
          library: lands("Plains", 10),
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"], library: lands("Island", 10) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "The Legend of Yangchen // Avatar Yangchen"), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      // Chapter II, on your next turn.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "priority");
      const before = { p1: s.players.p1?.hand.length ?? 0, p2: s.players.p2?.hand.length ?? 0 };
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length > 0);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.players.p1?.hand.length).toBe(before.p1 + 3);
      expect(s.players.p2?.hand.length).toBe(before.p2 + 3);
      // Chapter III: the Saga returns transformed as Avatar Yangchen.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > s.turn.number);
      s = settle(s);
      const yangchen = s.battlefield.find((id) => chars(s, id).name === "Avatar Yangchen") as string;
      expect(yangchen).toBeDefined();
      const c = chars(s, yangchen);
      expect(c.name).toBe("Avatar Yangchen");
      expect([c.power, c.toughness]).toEqual([4, 5]);
      expect(c.keywords).toContain("flying");
    });

    it("The Legend of Yangchen (I) in multiplayer: starting with you, each player chooses up to one opponent's permanent with MV 3+; exiled together (PLAN-H, H2)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Plains", 5), "Serra Angel"], hand: ["The Legend of Yangchen // Avatar Yangchen"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        p3: { battlefield: ["Shivan Dragon", "Pelakka Wurm"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Serra Angel");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p3", "battlefield", "Shivan Dragon");
      const wurm = idOf(s, "p3", "battlefield", "Pelakka Wurm");
      const asked: { player: PlayerId; options: string[] }[] = [];
      s = settle(cast(s, "p1", "The Legend of Yangchen // Avatar Yangchen"), (req, player) => {
        if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
        asked.push({ player: player as PlayerId, options: req.options.map(String).sort() });
        // The suggested answer is a permanent of a player other than the one choosing.
        expect(req.suggested).toHaveLength(1);
        expect(s.objects[String(req.suggested[0])]?.controller).not.toBe(player);
        // p1 chooses p2's Angel, p2 chooses p3's Dragon, p3 chooses nothing.
        if (player === "p1") return [angel];
        if (player === "p2") return [dragon];
        return [];
      });
      // Each chooses among the permanents of the controller's opponents (not among p1's), p1 first.
      expect(asked.map((a) => a.player)).toEqual(["p1", "p2", "p3"]);
      for (const a of asked) expect(a.options).toEqual([angel, dragon, wurm].sort());
      expect(s.objects[mine]?.zone).toBe("battlefield");
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Pelakka Wurm")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("The Legend of Yangchen (I) in a duel: the opponent is not suggested any of their own permanents", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["The Legend of Yangchen // Avatar Yangchen"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const suggested: Partial<Record<PlayerId, ChoiceValue[]>> = {};
      s = settle(cast(s, "p1", "The Legend of Yangchen // Avatar Yangchen"), (req, player) => {
        if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
        suggested[player as PlayerId] = req.suggested;
        return player === "p1" ? [angel] : undefined;
      });
      expect(suggested.p1).toHaveLength(1);
      expect(suggested.p2).toEqual([]);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Avatar Yangchen: your second spell each turn gives airbending of another nonland permanent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "The Legend of Yangchen // Avatar Yangchen"], hand: ["Yip Yip!", "Yip Yip!"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      // The card is put directly on its back face (as after chapter III).
      const saga = idOf(s, "p1", "battlefield", "The Legend of Yangchen // Avatar Yangchen");
      const o = s.objects[saga] as NonNullable<S["objects"][string]>;
      o.faceDefId = s.defs[o.defId]?.faceDefs?.[1]?.id;
      bump(s);
      expect(chars(s, saga).name).toBe("Avatar Yangchen");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const [first, second] = idsOf(s, "p1", "hand", "Yip Yip!") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: [saga] } }));
      expect(exiled(s, "Serra Angel")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: second, targets: { t: [saga] } }), picking([angel]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });

    it("Master Piandao: when attacking, an Ally, an Equipment or a Lesson among the top four", () => {
      let s = scenario({
        p1: { battlefield: ["Master Piandao"], library: ["Bear Cub", "Glider Staff", "Opt", "Plains", "Island"] },
      });
      const piandao = idOf(s, "p1", "battlefield", "Master Piandao");
      let options: string[] = [];
      s = attackWith(s, [piandao], (req) => {
        if (req.intent !== "lookAtTop" || req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(s, String(id)) ?? "");
        return req.options.filter((id) => nameOf(s, String(id)) === "Glider Staff");
      });
      expect(options).toEqual(["Glider Staff"]);
      expect(handNames(s)).toEqual(["Glider Staff"]);
      // The other three are on the bottom of the library: the Island stays on top.
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Island");
    });

    it("Momo, Playful Pet: when it leaves the battlefield, a Food (or another mode)", () => {
      let s = scenario({
        p1: { battlefield: ["Momo, Playful Pet", "Mountain", "Mountain", "Bear Cub"], hand: ["Lightning Strike"] },
      });
      const momo = idOf(s, "p1", "battlefield", "Momo, Playful Pet");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [momo] } }), modeThen(1, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: ["Momo, Playful Pet", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
      t = settle(
        cast(t, "p1", "Lightning Strike", { targets: { t: [idOf(t, "p1", "battlefield", "Momo, Playful Pet")] } }),
        modeThen(0),
      );
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Path to Redemption: the enchanted creature can't attack or block; {5}, sacrifice, during your turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Path to Redemption"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Path to Redemption", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const aura = idOf(s, "p1", "battlefield", "Path to Redemption");
      // Not during the opponent's turn.
      let opp = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      opp = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(opp, "p1", aura)).toBe(false);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      s = settle(activate(s, "p1", aura));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Path to Redemption")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Rabaroo Troop: landfall, flying until end of turn and 1 life; Plains cycling", () => {
      let s = scenario({ p1: { battlefield: ["Rabaroo Troop"], hand: ["Plains"] } });
      const troop = idOf(s, "p1", "battlefield", "Rabaroo Troop");
      expect(chars(s, troop).keywords).not.toContain("flying");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }));
      expect(chars(s, troop).keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(21);
      const cycler = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Rabaroo Troop"], library: ["Opt", "Plains"] } });
      const t = settle(activate(cycler, "p1", idOf(cycler, "p1", "hand", "Rabaroo Troop")));
      expect(handNames(t)).toEqual(["Plains"]);
    });

    it("Razor Rings: 4 damage to an attacking creature, you gain life equal to the excess", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Razor Rings"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Razor Rings", { targets: { t: [bear] } })).toThrow();
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Razor Rings", { targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Sandbenders' Storm: destroys a creature with power 4 or greater, or earthbending 3", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 5), hand: ["Sandbenders' Storm"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
      let s = setup();
      expect(() =>
        cast(s, "p1", "Sandbenders' Storm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      s = settle(cast(s, "p1", "Sandbenders' Storm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = setup();
      const land = idsOf(t, "p1", "battlefield", "Plains")[4] as string;
      t = settle(cast(t, "p1", "Sandbenders' Storm", { mode: 1, targets: { u: [land] } }));
      expect(chars(t, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(t, land)).toEqual([3, 3]);
    });

    it("South Pole Voyager: 1 life per Ally that enters; only on the second resolution each turn, draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["South Pole Voyager", "Kyoshi Warriors"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "South Pole Voyager"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p1?.hand).toHaveLength(1);
      // The Warriors then their Ally token: second resolution (draw), then third (no draw).
      s = settle(cast(s, "p1", "Kyoshi Warriors"));
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Southern Air Temple: X +1/+1 counters on each of your creatures (X: your Sanctuaries)", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Southern Air Temple"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Southern Air Temple"));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Suki: your other creatures get +1/+0; a permanent that leaves during your turn creates an Ally, once each turn", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Suki, Courageous Rescuer",
            "Bear Cub",
            "Curious Farm Animals",
            "Curious Farm Animals",
            ...lands("Plains", 4),
          ],
        },
      });
      const suki = idOf(s, "p1", "battlefield", "Suki, Courageous Rescuer");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, suki)).toEqual([2, 4]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals")));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Ally"))).toEqual([2, 1]);
      // Only once each turn: the second sacrifice doesn't create another Ally.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Curious Farm Animals")));
      expect(idsOf(s, "p1", "graveyard", "Curious Farm Animals")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Team Avatar: a creature that attacks alone gets +X/+X; {2}{W}, discard it: X damage", () => {
      let s = scenario({ p1: { battlefield: ["Team Avatar", "Bear Cub", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackWith(s, [bear]);
      expect(pt(s, bear)).toEqual([4, 4]);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Bear Cub"], hand: ["Team Avatar"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Team Avatar"), { t: [angel] }));
      expect(idsOf(t, "p1", "graveyard", "Team Avatar")).toHaveLength(1);
      expect(t.objects[angel]?.damage).toBe(2);
    });

    it("United Front: X 1/1 Allies, then a +1/+1 counter on each of your creatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["United Front"] } });
      s = settle(cast(s, "p1", "United Front", { x: 2 }));
      const allies = idsOf(s, "p1", "battlefield", "Ally");
      expect(allies).toHaveLength(2);
      for (const id of [...allies, idOf(s, "p1", "battlefield", "Bear Cub")]) expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
    });

    it("Vengeful Villagers: when attacking, taps an opponent's creature; when sacrificed, a stun counter", () => {
      let s = scenario({ p1: { battlefield: ["Vengeful Villagers", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      const villagers = idOf(s, "p1", "battlefield", "Vengeful Villagers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attackWith(s, [villagers], (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(angel)) return [angel];
        if (req.intent === "sacrifice") return [bear];
        return undefined;
      });
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[angel]?.counters.stun).toBe(1);
    });

    it("Water Tribe Captain: {5}: your creatures get +1/+1 until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Water Tribe Captain", "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Water Tribe Captain")));
      expect(pt(s, idOf(s, "p1", "battlefield", "Water Tribe Captain"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    });

    it("Water Tribe Rallier: waterbending {5}, a creature with power 3 or less among the top four", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Water Tribe Rallier", "Bear Cub", "Bear Cub"],
          library: ["Serra Angel", "Bear Cub", "Opt", "Plains", "Island"],
        },
      });
      let options: string[] = [];
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Water Tribe Rallier")), (req) => {
        if (req.intent !== "lookAtTop" || req.type !== "pick") return undefined;
        options = req.options.map((id) => nameOf(s, String(id)) ?? "");
        return undefined;
      });
      expect(options).toEqual(["Bear Cub"]);
      expect(handNames(s)).toEqual(["Bear Cub"]);
    });

    it("Yip Yip!: +2/+2; an Ally also gains flying", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Plains", "Kyoshi Warriors", "Bear Cub"], hand: ["Yip Yip!", "Yip Yip!"] },
      });
      const warriors = idOf(s, "p1", "battlefield", "Kyoshi Warriors");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const [a, b] = idsOf(s, "p1", "hand", "Yip Yip!") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: a, targets: { t: [warriors] } }));
      s = settle(act(s, "p1", { type: "cast", card: b, targets: { t: [bear] } }));
      expect(pt(s, warriors)).toEqual([5, 5]);
      expect(chars(s, warriors).keywords).toContain("flying");
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).not.toContain("flying");
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  const activations = (s: S, player: string, source: string) =>
    legalActions(s, player).filter((x) => x.type === "activate" && x.source === source);
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, which = 0) => {
    const a = activations(s, player, source)[which];
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const tappedCount = (s: S, name: string) =>
    s.battlefield.filter((id) => nameOf(s, id) === name && s.objects[id]?.tapped).length;
  const attack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  /** {0} sorcery: "draw two cards". */
  const drawTwo = customCard({
    name: "Test Double Draw",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([], [dsl.fx.draw(2)]),
  });
  /** {1}{U} sorcery: "draw a card". */
  const divination = customCard({
    name: "Test Divination",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 1, colored: { U: 1 }, x: 0 },
    manaCostText: "{1}{U}",
    colors: ["U"],
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });
  const LESSONS = ["Boomerang Basics", "Octopus Form", "Lost Days"];

  describe("Avatar: The Last Airbender, lot A — bleu", () => {
    describe("Boomerang Basics", () => {
      const run = (whose: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: whose === "p1" ? ["Island", "Bear Cub"] : ["Island"], hand: ["Boomerang Basics"] },
          p2: { battlefield: whose === "p2" ? ["Bear Cub"] : [] },
        });
        const bear = idOf(s, whose, "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Boomerang Basics", { targets: { t: [bear] } }));
        return s;
      };

      it("returns your permanent to your hand and makes you draw", () => {
        const s = run("p1");
        expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest"]);
      });

      it("returns an opponent's permanent with no draw", () => {
        const s = run("p2");
        expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Ember Island Production: nonlegendary 4/4 Hero copy of one of your creatures, or 2/2 Coward of an opponent's", () => {
      const base = () =>
        scenario({
          p1: { battlefield: [...lands("Island", 5), "Gran-Gran"], hand: ["Ember Island Production"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = base();
      const gran = idOf(s, "p1", "battlefield", "Gran-Gran");
      s = settle(cast(s, "p1", "Ember Island Production", { mode: 0, targets: { t: [gran] } }));
      const copies = idsOf(s, "p1", "battlefield", "Gran-Gran");
      expect(copies).toHaveLength(2);
      const token = copies.find((id) => id !== gran) as string;
      const c = chars(s, token);
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.supertypes).not.toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Human", "Peasant", "Ally", "Hero"]));

      let t = base();
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = settle(cast(t, "p1", "Ember Island Production", { mode: 1, targets: { u: [angel] } }));
      const copy = idOf(t, "p1", "battlefield", "Serra Angel");
      expect(pt(t, copy)).toEqual([2, 2]);
      expect(chars(t, copy).subtypes).toEqual(expect.arrayContaining(["Angel", "Coward"]));
      expect(chars(t, copy).keywords).toContain("flying");
    });

    it("First-Time Flyer: +1/+1 while a Lesson card is in your graveyard", () => {
      const without = scenario({ p1: { battlefield: ["First-Time Flyer"], graveyard: ["Opt"] } });
      expect(pt(without, idOf(without, "p1", "battlefield", "First-Time Flyer"))).toEqual([1, 2]);
      const withLesson = scenario({ p1: { battlefield: ["First-Time Flyer"], graveyard: ["Octopus Form"] } });
      expect(pt(withLesson, idOf(withLesson, "p1", "battlefield", "First-Time Flyer"))).toEqual([2, 3]);
    });

    it("Flexible Waterbender: waterbending {3}, base P/T 5/2 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Flexible Waterbender", "Island", "Bear Cub"] } });
      const w = idOf(s, "p1", "battlefield", "Flexible Waterbender");
      s = settle(activate(s, "p1", w));
      expect(pt(s, w)).toEqual([5, 2]);
      // Paid by the Island, the Bear and the creature itself (each pays {1}); vigilance stays.
      expect(s.battlefield.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(chars(s, w).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, w)).toEqual([2, 5]);
    });

    it("Geyser Leaper: waterbending {4}, draw a card then discard one", () => {
      let s = scenario({
        p1: { battlefield: ["Geyser Leaper", ...lands("Island", 4)], hand: ["Opt"], library: ["Bear Cub", "Forest"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Geyser Leaper")), picking([opt]));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Giant Koi: waterbending {3}, unblockable this turn; Island cycling {2}", () => {
      let s = scenario({ p1: { battlefield: ["Giant Koi", ...lands("Island", 3)] } });
      const koi = idOf(s, "p1", "battlefield", "Giant Koi");
      expect(chars(s, koi).keywords).not.toContain("unblockable");
      s = settle(activate(s, "p1", koi));
      expect(chars(s, koi).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, koi).keywords).not.toContain("unblockable");

      let h = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Giant Koi"], library: ["Forest", "Island"] } });
      const card = idOf(h, "p1", "hand", "Giant Koi");
      h = settle(activate(h, "p1", card));
      expect(idsOf(h, "p1", "graveyard", "Giant Koi")).toHaveLength(1);
      expect(h.players.p1?.hand.map((id) => nameOf(h, id))).toEqual(["Island"]);
    });

    describe("Gran-Gran", () => {
      it("when it becomes tapped, draw then discard", () => {
        let s = scenario({ p1: { battlefield: ["Gran-Gran"], hand: ["Opt"], library: ["Bear Cub", "Forest"] } });
        const gran = idOf(s, "p1", "battlefield", "Gran-Gran");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [gran]), picking([opt]));
        expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });

      it("noncreature spells cost {1} less with three or more Lessons in the graveyard", () => {
        const run = (graveyard: string[]) => {
          const s = scenario({ p1: { battlefield: ["Gran-Gran", "Island"], hand: [divination, "Bear Cub"], graveyard } });
          return castable(s, "p1", idOf(s, "p1", "hand", "Test Divination"));
        };
        expect(run(LESSONS.slice(0, 2))).toBe(false);
        expect(run(LESSONS)).toBe(true);
      });
    });

    it('Honest Work: taps, removes the counters; 1/1 Citizen with no abilities, "{T}: Add {C}", named Humble Merchant', () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Honest Work"] },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 2 } }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Honest Work", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      const c = chars(s, angel);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.name).toBe("Humble Merchant");
      expect(c.subtypes).toEqual(["Citizen"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.abilities.filter((a) => a.kind === "mana")).toHaveLength(1);
      expect(c.abilities.some((a) => a.kind === "mana" && a.produce.includes("C"))).toBe(true);
    });

    it("Invasion Submersible: returns a permanent; exhaust, waterbending {3}: artifact creature with three counters", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6)], hand: ["Invasion Submersible"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Invasion Submersible"), picking([bear]));
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      const sub = idOf(s, "p1", "battlefield", "Invasion Submersible");
      expect(chars(s, sub).types).not.toContain("Creature");
      s = settle(activate(s, "p1", sub));
      expect(s.objects[sub]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, sub).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      // The effect lasts: still a 3/3 creature next turn; exhaust can be activated only once.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, sub)).toEqual([3, 3]);
      expect(activations(s, "p1", sub)).toHaveLength(0);
    });

    describe("Katara, Bending Prodigy", () => {
      it("at the beginning of your end step, a +1/+1 counter only if it is tapped", () => {
        const run = (tapped: boolean) => {
          let s = scenario({ p1: { battlefield: [{ name: "Katara, Bending Prodigy", tapped }] } });
          const k = idOf(s, "p1", "battlefield", "Katara, Bending Prodigy");
          s = advanceUntil(s, (x) => x.turn.active === "p2");
          return s.objects[k]?.counters["+1/+1"] ?? 0;
        };
        expect(run(true)).toBe(1);
        expect(run(false)).toBe(0);
      });

      it("waterbending {6}: draw a card", () => {
        let s = scenario({ p1: { battlefield: ["Katara, Bending Prodigy", ...lands("Island", 3), "Bear Cub", "Bear Cub"] } });
        const k = idOf(s, "p1", "battlefield", "Katara, Bending Prodigy");
        s = settle(activate(s, "p1", k));
        expect(s.players.p1?.hand).toHaveLength(1);
        // The three Islands, the two Bears and Katara herself paid.
        expect(s.objects[k]?.tapped).toBe(true);
      });
    });

    it("Knowledge Seeker: a +1/+1 counter on the second card drawn each turn", () => {
      let s = scenario({ p1: { battlefield: ["Knowledge Seeker"], hand: [drawTwo, drawTwo] } });
      const seeker = idOf(s, "p1", "battlefield", "Knowledge Seeker");
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(s.objects[seeker]?.counters["+1/+1"]).toBe(1);
      // Only once each turn: the third and fourth cards don't count.
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(pt(s, seeker)).toEqual([3, 2]);
    });

    it("Knowledge Seeker: when it dies, create a Clue", () => {
      let s = scenario({ p1: { battlefield: ["Knowledge Seeker", "Mountain"], hand: ["Burst Lightning"] } });
      const seeker = idOf(s, "p1", "battlefield", "Knowledge Seeker");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [seeker] } }));
      expect(idsOf(s, "p1", "graveyard", "Knowledge Seeker")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    describe("The Legend of Kuruk // Avatar Kuruk", () => {
      const KURUK = "The Legend of Kuruk // Avatar Kuruk";

      it("chapter I: scry 2, then draw a card", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [KURUK], library: ["Bear Cub", "Opt", "Forest"] } });
        s = settle(cast(s, "p1", KURUK));
        const saga = idOf(s, "p1", "battlefield", KURUK);
        expect(s.objects[saga]?.counters.lore).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("chapter III: Avatar Kuruk 4/3; a Spirit with each spell; exhaust, waterbending {20}: an extra turn", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: KURUK, counters: { lore: 2 } }, ...lands("Island", 19)],
            hand: ["Opt"],
            library: lands("Island", 10),
          },
        });
        s = advanceUntil(
          s,
          (x) =>
            x.battlefield.some((id) => chars(x, id).name === "Avatar Kuruk") &&
            x.stack.length === 0 &&
            x.triggers.length === 0 &&
            x.pending?.kind === "priority" &&
            x.pending.player === "p1",
        );
        expect([s.turn.active, s.turn.step]).toEqual(["p1", "main1"]);
        const avatar = idOf(s, "p1", "battlefield", KURUK);
        expect(chars(s, avatar).name).toBe("Avatar Kuruk");
        expect(pt(s, avatar)).toEqual([4, 3]);
        s = settle(cast(s, "p1", "Opt"));
        const spirit = idOf(s, "p1", "battlefield", "Spirit");
        expect(pt(s, spirit)).toEqual([1, 1]);
        expect(chars(s, spirit).colors).toEqual([]);
        // The remaining 18 Islands, the Spirit and Avatar Kuruk pay the 20.
        expect(s.extraTurns ?? []).toHaveLength(0);
        s = settle(activate(s, "p1", avatar));
        expect(s.extraTurns).toEqual(["p1"]);
        expect(s.objects[avatar]?.tapped).toBe(true);
        expect(s.objects[spirit]?.tapped).toBe(true);
      });
    });

    describe("Lost Days", () => {
      const run = (bottom: boolean, stolen = false) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 5), hand: ["Lost Days"] },
          p2: { battlefield: ["Bear Cub"], library: ["Forest", "Forest", "Forest"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        // A p2 creature controlled by p1: its owner still chooses.
        if (stolen) steal(s, bear, "p1");
        let asked = "";
        s = settle(cast(s, "p1", "Lost Days", { targets: { t: [bear] } }), (req, player) => {
          if (req.intent !== "topOrBottom") return undefined;
          asked = player;
          return [bottom ? "bottom" : "top"];
        });
        return { s, asked };
      };

      it("the owner puts it second from the top; you create a Clue", () => {
        const { s, asked } = run(false);
        expect(asked).toBe("p2");
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Bear Cub", "Forest", "Forest"]);
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });

      it("or on the bottom of its library", () => {
        const { s } = run(true);
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest", "Bear Cub"]);
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });

      it("the choice goes to the owner, even when you control the creature", () => {
        const { s, asked } = run(true, true);
        expect(asked).toBe("p2");
        expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest", "Bear Cub"]);
      });
    });

    it("Master Pakku: when it becomes tapped, the targeted player mills as many cards as you have Lessons in your graveyard", () => {
      let s = scenario({
        p1: { battlefield: ["Master Pakku"], graveyard: [...LESSONS.slice(0, 2), "Opt"] },
        p2: { library: lands("Forest", 5) },
      });
      const pakku = idOf(s, "p1", "battlefield", "Master Pakku");
      s = settle(attack(s, [pakku]), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(s.players.p2?.library).toHaveLength(3);
    });

    it("The Mechanist: a Clue for each noncreature spell; {T}: an artifact token becomes a 3/1 flying Construct", () => {
      let s = scenario({
        p1: { battlefield: ["The Mechanist, Aerial Artisan", "Island", "Forest", "Forest"], hand: ["Opt", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      // A creature spell doesn't create a Clue.
      const clue = idOf(s, "p1", "battlefield", "Clue");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "The Mechanist, Aerial Artisan"), { t: [clue] }));
      const c = chars(s, clue);
      expect([c.power, c.toughness]).toEqual([3, 1]);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Clue", "Construct"]));
      expect(c.keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, clue).types).not.toContain("Creature");
    });

    it("North Pole Patrol: {T} untaps another of your permanents; waterbending {3}, {T}: taps an opponent's creature", () => {
      const s = scenario({
        p1: { battlefield: ["North Pole Patrol", { name: "Island", tapped: true }, ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const patrol = idOf(s, "p1", "battlefield", "North Pole Patrol");
      const tapped = s.battlefield.find((id) => s.objects[id]?.tapped) as string;
      expect(() => activate(s, "p1", patrol, { t: [patrol] })).toThrow();
      let u = settle(activate(s, "p1", patrol, { t: [tapped] }));
      expect(u.objects[tapped]?.tapped).toBe(false);
      expect(u.objects[patrol]?.tapped).toBe(true);

      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      u = settle(activate(s, "p1", patrol, { t: [bear] }, 1));
      expect(u.objects[bear]?.tapped).toBe(true);
      expect(tappedCount(u, "Island")).toBe(4);
    });

    it("Octopus Form: +1/+1 and hexproof until end of turn, and untaps the creature", () => {
      let s = scenario({ p1: { battlefield: ["Island", { name: "Bear Cub", tapped: true }], hand: ["Octopus Form"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Octopus Form", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("hexproof");
    });

    it("Otter-Penguin: on the second card drawn, +1/+2 and unblockable this turn", () => {
      let s = scenario({ p1: { battlefield: ["Otter-Penguin"], hand: [drawTwo] } });
      const otter = idOf(s, "p1", "battlefield", "Otter-Penguin");
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(pt(s, otter)).toEqual([3, 3]);
      expect(chars(s, otter).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, otter)).toEqual([2, 1]);
    });

    it("Rowdy Snowballers: taps an opponent's creature and puts a stun counter on it", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Rowdy Snowballers"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rowdy Snowballers"), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun).toBe(1);
      // The stun counter replaces its next untap.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun ?? 0).toBe(0);
    });

    describe("Serpent of the Pass", () => {
      it("costs {1} less for each noncreature nonland card in your graveyard", () => {
        const run = (islands: number) => {
          const s = scenario({
            p1: {
              battlefield: lands("Island", islands),
              hand: ["Serpent of the Pass"],
              graveyard: ["Opt", "Think Twice", "Cancel", "Forest", "Bear Cub"],
            },
          });
          return castable(s, "p1", idOf(s, "p1", "hand", "Serpent of the Pass"));
        };
        expect(run(3)).toBe(false);
        expect(run(4)).toBe(true);
      });

      it("can be cast as though it had flash with three or more Lessons in the graveyard", () => {
        const run = (graveyard: string[]) => {
          let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 7), hand: ["Serpent of the Pass"], graveyard } });
          s = act(s, "p2", { type: "pass" });
          return castable(s, "p1", idOf(s, "p1", "hand", "Serpent of the Pass"));
        };
        expect(run(LESSONS.slice(0, 2))).toBe(false);
        expect(run(LESSONS)).toBe(true);
      });
    });

    it("Sokka's Haiku: counters a spell, draw, mill three cards, untap a land", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 5), hand: ["Sokka's Haiku"], library: lands("Forest", 6) },
        p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
      const bolt = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      const island = idsOf(s, "p1", "battlefield", "Island")[0] as string;
      s = settle(cast(s, "p1", "Sokka's Haiku", { targets: { s: [bolt], l: [island] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Forest", "Forest", "Sokka's Haiku"]);
      expect(tappedCount(s, "Island")).toBe(4);
    });

    it("The Spirit Oasis: draw a card per Sanctuary when it enters", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["The Spirit Oasis"] } });
      s = settle(cast(s, "p1", "The Spirit Oasis"));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    describe("Teo, Spirited Glider", () => {
      const run = (discard: string) => {
        let s = scenario({
          p1: { battlefield: ["Teo, Spirited Glider", "Bear Cub"], hand: ["Opt"], library: ["Forest", "Island"] },
        });
        const teo = idOf(s, "p1", "battlefield", "Teo, Spirited Glider");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = attack(s, [teo]);
        s = settle(s, (req) => {
          if (req.type !== "pick") return undefined;
          // Discard: the Opt, or the other card (the drawn Forest).
          if (req.options.includes(opt)) return discard === "Opt" ? [opt] : req.options.filter((o) => o !== opt).slice(0, 1);
          return req.options.includes(bear) ? [bear] : undefined;
        });
        return { s, bear };
      };

      it("a flying creature attacks: draw, discard; a nonland card gives a +1/+1 counter", () => {
        const { s, bear } = run("Opt");
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      });

      it("discarding a land gives nothing", () => {
        const { s, bear } = run("Forest");
        expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Tiger-Seal: tapped at the beginning of your upkeep, untapped on the second card drawn", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Tiger-Seal"], hand: [drawTwo] } });
      const seal = idOf(s, "p1", "battlefield", "Tiger-Seal");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0);
      expect(s.objects[seal]?.tapped).toBe(true);
      // The draw step's card is the first; the spell draws two others.
      s = settle(cast(s, "p1", "Test Double Draw"));
      expect(s.objects[seal]?.tapped).toBe(false);
    });

    it("Ty Lee: taps a creature, which doesn't untap as long as Ty Lee remains", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: ["Ty Lee, Chi Blocker", "Into the Roil"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ty Lee, Chi Blocker"), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ty Lee, Chi Blocker")).keywords).toContain("prowess");
    });

    it('Ty Lee: "as long as you control Ty Lee": an opponent gains control of it, the creature untaps again (lot K7)', () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: ["Ty Lee, Chi Blocker"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ty Lee, Chi Blocker"), picking([bear]));
      const tyLee = idOf(s, "p1", "battlefield", "Ty Lee, Chi Blocker");
      addControlEffect(s, [tyLee], "p2", "permanent");
      syncControl(s);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    describe("Waterbender Ascension", () => {
      it("each combat damage to a player: a quest counter; at four or more, draw", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Waterbender Ascension", counters: { quest: 2 } }, "Bear Cub", "Bear Cub"],
          },
        });
        const asc = idOf(s, "p1", "battlefield", "Waterbender Ascension");
        s = attack(s, idsOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.step === "main2");
        expect(s.objects[asc]?.counters.quest).toBe(4);
        // The third counter doesn't make you draw; the fourth does.
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("waterbending {4}: a targeted creature is unblockable this turn", () => {
        let s = scenario({ p1: { battlefield: ["Waterbender Ascension", ...lands("Island", 4), "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Waterbender Ascension"), { t: [bear] }));
        expect(chars(s, bear).keywords).toContain("unblockable");
      });
    });

    it("Waterbending Scroll: {6}, {T}: draw; {1} less per Island", () => {
      const run = (lands0: string[]) => {
        const s = scenario({ p1: { battlefield: ["Waterbending Scroll", ...lands0] } });
        return activations(s, "p1", idOf(s, "p1", "battlefield", "Waterbending Scroll")).length > 0;
      };
      expect(run(lands("Mountain", 5))).toBe(false);
      expect(run([...lands("Island", 2), "Mountain"])).toBe(false);
      expect(run(lands("Island", 3))).toBe(true);
      let s = scenario({ p1: { battlefield: ["Waterbending Scroll", ...lands("Island", 3)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Waterbending Scroll")));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(tappedCount(s, "Island")).toBe(3);
    });

    it("Watery Grasp: the enchanted creature doesn't untap; waterbending {5}: it is shuffled into the library", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), hand: ["Watery Grasp"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }], library: lands("Forest", 3) },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Watery Grasp", { targets: { enchant: [bear] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Watery Grasp")));
      expect(s.objects[bear]).toBeUndefined();
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toContain("Bear Cub");
      expect(idsOf(s, "p1", "graveyard", "Watery Grasp")).toHaveLength(1);
    });

    it("Yue: waterbending {5}, {T}: cast a noncreature spell from your hand without paying its cost", () => {
      let s = scenario({
        p1: { battlefield: ["Yue, the Moon Spirit", ...lands("Island", 5)], hand: ["Think Twice", "Bear Cub", "Forest"] },
      });
      const think = idOf(s, "p1", "hand", "Think Twice");
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Yue, the Moon Spirit"));
      s = untilCastNow(s);
      expect(castNowOf(s)?.cards).toEqual([think]);
      s = act(s, "p1", { type: "cast", card: think });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      expect(idsOf(s, "p1", "graveyard", "Think Twice")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(3);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  /** Answers "no" to all the "you may" questions. */
  const refusing: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  /** Activates the ability of the source whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const abilities = s.defs[s.objects[source]?.defId ?? ""]?.abilities ?? [];
    const ability = abilities.findIndex((a) => "label" in a && !!a.label?.includes(label));
    expect(ability).toBeGreaterThanOrEqual(0);
    return act(s, player, { type: "activate", source, ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** {0} sorcery: "draw a card". */
  const DRAW_ONE = customCard({
    name: "Test Draw One",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([], [dsl.fx.draw(1)]),
  });
  const attack = (s: S, ids: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return cur;
  };

  describe("Avatar: The Last Airbender, lot A — noir", () => {
    it("Azula Always Lies: one or both modes (-1/-1 until end of turn, a +1/+1 counter)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Azula Always Lies"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Azula Always Lies", { mode: 2, targets: { a: [theirs], b: [mine] } }));
      expect(pt(s, theirs)).toEqual([1, 1]);
      expect(s.objects[mine]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, mine)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, theirs)).toEqual([2, 2]);
    });

    it("Azula, On the Hunt: when attacking, {R}{R} (firebending 2), you lose 1 life and create a Clue", () => {
      let s = scenario({ p1: { battlefield: ["Azula, On the Hunt"] } });
      const azula = idOf(s, "p1", "battlefield", "Azula, On the Hunt");
      s = settle(attack(s, [azula]));
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      expect(s.players.p1?.manaPool.R).toBe(2);
    });

    it("Beetle-Headed Merchants: when attacking, sacrificing another creature draws a card and gives a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Beetle-Headed Merchants", "Bear Cub"], library: ["Opt", "Forest"] } });
      const beetle = idOf(s, "p1", "battlefield", "Beetle-Headed Merchants");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const hand = s.players.p1?.hand.length ?? 0;
      const no = settle(attack(s, [beetle]), refusing);
      expect(no.players.p1?.hand.length).toBe(hand);
      expect(no.objects[beetle]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(attack(s, [beetle]), picking([bear]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      expect(s.objects[beetle]?.counters["+1/+1"]).toBe(1);
    });
    it("Boiling Rock Rioter: tapping another Ally exiles a card from a graveyard; when attacking, you may cast an Ally exiled this way", () => {
      let s = scenario({
        p1: {
          battlefield: ["Boiling Rock Rioter", "Merchant of Many Hats", ...lands("Swamp", 2)],
          graveyard: ["Merchant of Many Hats"],
        },
        p2: { graveyard: ["Bear Cub"] },
      });
      const rioter = idOf(s, "p1", "battlefield", "Boiling Rock Rioter");
      const ally = idOf(s, "p1", "battlefield", "Merchant of Many Hats");
      const card = idOf(s, "p1", "graveyard", "Merchant of Many Hats");
      s = settle(activate(s, "p1", rioter, "an Ally", { targets: { t: [card] } }));
      expect(s.objects[ally]?.tapped).toBe(true);
      expect(s.objects[rioter]?.tapped).toBe(false);
      const exiledCard = exiled(s, "Merchant of Many Hats")[0] as string;
      expect(exiledCard).toBeDefined();
      s = untilCastNow(attack(s, [rioter]));
      expect(castNowOf(s)?.cards).toEqual([exiledCard]);
      s = settle(act(s, "p1", { type: "cast", card: exiledCard }));
      expect(idsOf(s, "p1", "battlefield", "Merchant of Many Hats")).toHaveLength(2);
    });

    it("Boiling Rock Rioter: as the only Ally, it taps itself for the cost, even with summoning sickness (302.6)", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Boiling Rock Rioter", sick: true }] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const rioter = idOf(s, "p1", "battlefield", "Boiling Rock Rioter");
      s = settle(activate(s, "p1", rioter, "an Ally", { targets: { t: [idOf(s, "p2", "graveyard", "Bear Cub")] } }));
      expect(s.objects[rioter]?.tapped).toBe(true);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
    });

    it("Boiling Rock Rioter: an exiled card that isn't an Ally, or that you don't own, can't be cast", () => {
      let s = scenario({
        p1: { battlefield: ["Boiling Rock Rioter", "Merchant of Many Hats", ...lands("Swamp", 2)] },
        p2: { graveyard: ["Merchant of Many Hats"] },
      });
      const rioter = idOf(s, "p1", "battlefield", "Boiling Rock Rioter");
      const theirs = s.players.p2?.graveyard[0] as string;
      s = settle(activate(s, "p1", rioter, "an Ally", { targets: { t: [theirs] } }));
      expect(exiled(s, "Merchant of Many Hats")).toHaveLength(1);
      s = settle(attack(s, [rioter]));
      expect(castNowOf(s)).toBeUndefined();
      expect(idsOf(s, "p1", "battlefield", "Merchant of Many Hats")).toHaveLength(1);
    });

    it("Buzzard-Wasp Colony: when it enters, sacrificing an artifact or a creature draws a card", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Buzzard-Wasp Colony"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Buzzard-Wasp Colony"), picking([bear]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Buzzard-Wasp Colony: another of your creatures dies with counters: they go onto the colony", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Buzzard-Wasp Colony",
            { name: "Bear Cub", counters: { "+1/+1": 2 } },
            "Savannah Lions",
            ...lands("Swamp", 6),
          ],
          hand: ["Murder", "Murder"],
        },
      });
      const colony = idOf(s, "p1", "battlefield", "Buzzard-Wasp Colony");
      const [m1, m2] = idsOf(s, "p1", "hand", "Murder") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: m1, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(s.objects[colony]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, colony)).toEqual([4, 4]);
      // Without a counter: nothing.
      s = settle(act(s, "p1", { type: "cast", card: m2, targets: { t: [idOf(s, "p1", "battlefield", "Savannah Lions")] } }));
      expect(s.objects[colony]?.counters["+1/+1"]).toBe(2);
    });

    it("Canyon Crawler: when it enters, a Food; Swamp cycling {2}", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Canyon Crawler"] } });
      s = settle(cast(s, "p1", "Canyon Crawler"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Canyon Crawler"], library: ["Forest", "Swamp", "Forest"] },
      });
      const crawler = idOf(t, "p1", "hand", "Canyon Crawler");
      const cycling = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === crawler);
      expect(cycling).toBeDefined();
      t = settle(
        act(t, "p1", { type: "activate", source: crawler, ability: cycling?.type === "activate" ? cycling.ability : -1 }),
      );
      expect(handNames(t)).toEqual(["Swamp"]);
      expect(idsOf(t, "p1", "graveyard", "Canyon Crawler")).toHaveLength(1);
    });

    it("Cat-Gator: when it enters, deals damage equal to the number of Swamps you control (lifelink)", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), ...lands("Plains", 2)], hand: ["Cat-Gator"], life: 10 } });
      s = settle(cast(s, "p1", "Cat-Gator"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(15);
      expect(s.players.p1?.life).toBe(15);
    });

    it("Corrupt Court Official: when it enters, the targeted opponent discards a card", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Corrupt Court Official"] }, p2: { hand: ["Opt"] } });
      s = settle(cast(s, "p1", "Corrupt Court Official"));
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Dai Li Indoctrination: you choose a nonland permanent card from the revealed hand; or earthbending 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Dai Li Indoctrination"] },
        p2: { hand: ["Opt", "Forest", "Bear Cub"] },
      });
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: string[] = [];
      let chooser = "";
      s = settle(cast(s, "p1", "Dai Li Indoctrination", { mode: 0, targets: { p: ["p2"] } }), (req, player) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        chooser = player;
        return undefined;
      });
      expect(chooser).toBe("p1");
      expect(options).toEqual([bear]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(handNames(s, "p2").sort()).toEqual(["Forest", "Opt"]);

      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Dai Li Indoctrination"] } });
      const land = idsOf(t, "p1", "battlefield", "Swamp")[2] as string;
      t = settle(cast(t, "p1", "Dai Li Indoctrination", { mode: 1, targets: { t: [land] } }));
      expect(chars(t, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(t, land)).toEqual([2, 2]);
    });

    it("Epic Downfall: exiles a creature with mana value 3 or greater, not less", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Epic Downfall"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Epic Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
      const t = settle(cast(s, "p1", "Epic Downfall", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(exiled(t, "Serra Angel")).toHaveLength(1);
    });

    it("Fatal Fissure: when the chosen creature dies this turn, you earthbend 4", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Forest"], hand: ["Fatal Fissure", "Murder"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Fatal Fissure", { targets: { t: [angel] } }));
      expect(s.objects[forest]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Murder", { targets: { t: [angel] } }), picking([forest]));
      expect(s.objects[forest]?.counters["+1/+1"]).toBe(4);
      expect(pt(s, forest)).toEqual([4, 4]);
      expect(chars(s, forest).keywords).toContain("haste");
    });

    describe("The Fire Nation Drill", () => {
      it("when it enters, you may tap it: destroy a creature with power 4 or less", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["The Fire Nation Drill"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub", "Gigantosaurus"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
        let options: string[] = [];
        s = settle(cast(s, "p1", "The Fire Nation Drill"), (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [angel];
        });
        expect(options).toEqual(expect.arrayContaining([angel, idOf(s, "p2", "battlefield", "Bear Cub")]));
        expect(options).not.toContain(giant);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Fire Nation Drill")]?.tapped).toBe(true);
      });

      it("without tapping it, nothing is destroyed and it stays untapped", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["The Fire Nation Drill"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Fire Nation Drill"), refusing);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Fire Nation Drill")]?.tapped).toBe(false);
      });

      it("{1}: opponents' permanents lose indestructible until end of turn", () => {
        let s = scenario({
          p1: { battlefield: ["The Fire Nation Drill", ...lands("Swamp", 4)], hand: ["Murder"] },
          p2: { battlefield: ["Darksteel Colossus"] },
        });
        const colossus = idOf(s, "p2", "battlefield", "Darksteel Colossus");
        expect(chars(s, colossus).keywords).toContain("indestructible");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "The Fire Nation Drill"), "lose hexproof"));
        expect(chars(s, colossus).keywords).not.toContain("indestructible");
        s = settle(cast(s, "p1", "Murder", { targets: { t: [colossus] } }));
        expect(idsOf(s, "p2", "battlefield", "Darksteel Colossus")).toHaveLength(0);
      });
    });

    it("Fire Nation Engineer: raid — at your end step, a +1/+1 counter on another creature, only if you attacked", () => {
      const base = scenario({ p1: { battlefield: ["Fire Nation Engineer", "Bear Cub"] } });
      const bear = idOf(base, "p1", "battlefield", "Bear Cub");
      const engineer = idOf(base, "p1", "battlefield", "Fire Nation Engineer");
      const quiet = advanceUntil(base, (x) => x.turn.active === "p2");
      expect(quiet.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      let s = settle(attack(base, [bear]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[engineer]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Fire Navy Trebuchet: when you attack, a tapped and attacking 2/1 flying Ballistic Boulder, sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Fire Navy Trebuchet", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const boulder = idOf(s, "p1", "battlefield", "Ballistic Boulder");
      expect(pt(s, boulder)).toEqual([2, 1]);
      expect(chars(s, boulder).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, boulder).keywords).toContain("flying");
      expect(s.objects[boulder]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === boulder)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Ballistic Boulder")).toHaveLength(0);
    });

    it("Foggy Swamp Hunters: lifelink and menace from the second card drawn each turn", () => {
      let s = scenario({ p1: { battlefield: ["Foggy Swamp Hunters"], hand: [DRAW_ONE, DRAW_ONE] } });
      const hunters = idOf(s, "p1", "battlefield", "Foggy Swamp Hunters");
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, hunters).keywords).not.toContain("lifelink");
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, hunters).keywords).toEqual(expect.arrayContaining(["lifelink", "menace"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      // Next turn, only one card drawn (by the opponent, not by you): nothing more.
      expect(chars(s, hunters).keywords).not.toContain("lifelink");
    });
    it("Hog-Monkey: at the beginning of your combat, one of your creatures with a +1/+1 counter gains menace; exhaust {5}", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hog-Monkey", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions", ...lands("Swamp", 5)],
        },
      });
      const hog = idOf(s, "p1", "battlefield", "Hog-Monkey");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", hog, "Exhaust"));
      expect(s.objects[hog]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, hog)).toEqual([5, 4]);
      expect(canActivate(s, "p1", hog)).toBe(false);
      let options: string[] = [];
      s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.type === "pick");
      expect(s.turn.step).toBe("beginCombat");
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(options.sort()).toEqual([bear, hog].sort());
      expect(chars(s, bear).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).not.toContain("menace");
    });

    it("Joo Dee, One of Many: surveil 1, a copy token, then you sacrifice an artifact or a creature; as a sorcery", () => {
      let s = scenario({ p1: { battlefield: ["Joo Dee, One of Many", "Swamp", "Bear Cub"], library: ["Opt", "Forest"] } });
      const joo = idOf(s, "p1", "battlefield", "Joo Dee, One of Many");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", joo, "Surveil"), (req) =>
        req.intent === "surveilGraveyard" ? (req.type === "pick" ? req.options : undefined) : picking([bear])(req, "p1"),
      );
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Joo Dee, One of Many")).toHaveLength(2);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const t = scenario({
        active: "p2",
        p1: { battlefield: ["Joo Dee, One of Many", "Swamp"] },
      });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Joo Dee, One of Many"))).toBe(false);
    });

    it("June, Bounty Hunter: unblockable from two cards drawn; sacrificing another creature creates a Clue, during your turn", () => {
      let s = scenario({
        p1: { battlefield: ["June, Bounty Hunter", "Bear Cub", "Swamp"], hand: [DRAW_ONE, DRAW_ONE] },
      });
      const june = idOf(s, "p1", "battlefield", "June, Bounty Hunter");
      expect(chars(s, june).keywords).not.toContain("unblockable");
      s = settle(cast(s, "p1", "Test Draw One"));
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(chars(s, june).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", june, "Clue"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      const t = scenario({ active: "p2", p1: { battlefield: ["June, Bounty Hunter", "Bear Cub", "Swamp"] } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "June, Bounty Hunter"))).toBe(false);
    });

    it("Mai, Scornful Striker: a player who casts a noncreature spell loses 2 life (you included), not for a creature", () => {
      let s = scenario({
        p1: { battlefield: ["Mai, Scornful Striker", "Island", "Forest"], hand: ["Opt", "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(18);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.players.p1?.life).toBe(18);
      expect(s.players.p2?.life).toBe(20);
      let o = scenario({
        active: "p2",
        p1: { battlefield: ["Mai, Scornful Striker"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      o = settle(cast(o, "p2", "Opt"));
      expect(o.players.p2?.life).toBe(18);
      expect(o.players.p1?.life).toBe(20);
    });

    it("Merchant of Many Hats: {2}{B}: returns from your graveyard to your hand", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), graveyard: ["Merchant of Many Hats"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Merchant of Many Hats"), "graveyard"));
      expect(handNames(s)).toEqual(["Merchant of Many Hats"]);
    });

    it("Northern Air Temple: when it enters, drain X (your Sanctuaries); each other Sanctuary that enters drains 1", () => {
      const shrine = customCard({
        name: "Test Shrine",
        types: ["Enchantment"],
        typeLine: "Enchantment — Shrine",
        subtypes: ["Shrine"],
      });
      let s = scenario({ p1: { battlefield: [shrine, "Swamp"], hand: ["Northern Air Temple", shrine] } });
      s = settle(cast(s, "p1", "Northern Air Temple"));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);
      s = settle(cast(s, "p1", "Test Shrine"));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Ozai's Cruelty: 2 damage to the targeted player, who discards two cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Ozai's Cruelty"] },
        p2: { hand: ["Opt", "Forest", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Ozai's Cruelty", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    describe("Phoenix Fleet Airship", () => {
      it("at your end step, if you sacrificed a permanent this turn, a copy token", () => {
        const quiet = advanceUntil(scenario({ p1: { battlefield: ["Phoenix Fleet Airship"] } }), (x) => x.turn.active === "p2");
        expect(idsOf(quiet, "p1", "battlefield", "Phoenix Fleet Airship")).toHaveLength(1);
        let s = scenario({ p1: { battlefield: ["Phoenix Fleet Airship", "June, Bounty Hunter", "Bear Cub", "Swamp"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "June, Bounty Hunter"), "Clue"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        const ships = idsOf(s, "p1", "battlefield", "Phoenix Fleet Airship");
        expect(ships).toHaveLength(2);
        expect(ships.some((id) => s.objects[id]?.isToken)).toBe(true);
      });

      it("with eight or more Phoenix Fleet Airships, it's an artifact creature", () => {
        const seven = scenario({ p1: { battlefield: lands("Phoenix Fleet Airship", 7) } });
        expect(chars(seven, idOf(seven, "p1", "battlefield", "Phoenix Fleet Airship")).types).not.toContain("Creature");
        const eight = scenario({ p1: { battlefield: lands("Phoenix Fleet Airship", 8) } });
        const ship = idOf(eight, "p1", "battlefield", "Phoenix Fleet Airship");
        expect(chars(eight, ship).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(pt(eight, ship)).toEqual([4, 4]);
      });
    });

    it("Pirate Peddlers: whenever you sacrifice another permanent, a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Pirate Peddlers", "Joo Dee, One of Many", "Swamp"] } });
      const peddlers = idOf(s, "p1", "battlefield", "Pirate Peddlers");
      const joo = idOf(s, "p1", "battlefield", "Joo Dee, One of Many");
      s = settle(activate(s, "p1", joo, "Surveil"), picking([joo]));
      expect(s.objects[peddlers]?.counters["+1/+1"]).toBe(1);
    });

    it("Sold Out: exiles the creature; a Clue only if it was dealt damage this turn", () => {
      const run = (damage: number) => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Sold Out"] },
          p2: { battlefield: [{ name: "Serra Angel", damage }] },
        });
        s = settle(cast(s, "p1", "Sold Out", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        return s;
      };
      const hurt = run(1);
      expect(exiled(hurt, "Serra Angel")).toHaveLength(1);
      expect(idsOf(hurt, "p1", "battlefield", "Clue")).toHaveLength(1);
      const fresh = run(0);
      expect(exiled(fresh, "Serra Angel")).toHaveLength(1);
      expect(idsOf(fresh, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    it("Swampsnare Trap: costs {1} less if it targets a flying creature; the enchanted creature gets -5/-3", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Swampsnare Trap"] },
        p2: { battlefield: ["Serra Angel", "Gigantosaurus"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
      expect(() => cast(s, "p1", "Swampsnare Trap", { targets: { enchant: [giant] } })).toThrow();
      const t = settle(cast(s, "p1", "Swampsnare Trap", { targets: { enchant: [angel] } }));
      expect(idsOf(t, "p1", "battlefield", "Swampsnare Trap")).toHaveLength(1);
      expect(pt(t, angel)).toEqual([-1, 1]);
      const u = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Swampsnare Trap"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      const v = settle(cast(u, "p1", "Swampsnare Trap", { targets: { enchant: [giant] } }));
      expect(pt(v, giant)).toEqual([5, 7]);
    });

    it("Tundra Tank: when it enters, one of your creatures gains indestructible until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Tundra Tank"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Tundra Tank"));
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
    });

    it("Wolfbat: on your second card drawn, paying {B} returns it from the graveyard with a finality counter", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], graveyard: ["Wolfbat"], hand: [DRAW_ONE, DRAW_ONE] } });
      s = settle(cast(s, "p1", "Test Draw One"));
      expect(idsOf(s, "p1", "graveyard", "Wolfbat")).toHaveLength(1);
      s = settle(cast(s, "p1", "Test Draw One"));
      const bat = idOf(s, "p1", "battlefield", "Wolfbat");
      expect(s.objects[bat]?.counters.finality).toBe(1);
      // Finality counter: if it would die, it is exiled instead.
      let t = scenario({ p1: { battlefield: ["Swamp"], graveyard: ["Wolfbat"], hand: [DRAW_ONE, DRAW_ONE] } });
      t = settle(cast(t, "p1", "Test Draw One"));
      t = settle(cast(t, "p1", "Test Draw One"), refusing);
      expect(idsOf(t, "p1", "graveyard", "Wolfbat")).toHaveLength(1);
    });

    it("Zuko's Conviction: returns a creature card to hand, or to the battlefield tapped if kicked", () => {
      const run = (kicked: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Zuko's Conviction"], graveyard: ["Serra Angel"] } });
        const angel = idOf(s, "p1", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Zuko's Conviction", { kicked, targets: { t: [angel] } }));
        return s;
      };
      const plain = run(false);
      expect(handNames(plain)).toEqual(["Serra Angel"]);
      const kicked = run(true);
      const angel = idOf(kicked, "p1", "battlefield", "Serra Angel");
      expect(kicked.objects[angel]?.tapped).toBe(true);
      expect(kicked.players.p1?.hand).toHaveLength(0);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Advances to p1's declare attackers step, then attacks p2 with these creatures. */
  const attack = (s: S, ids: string[]) => {
    const t = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(t, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  /** Test Sanctuary (enchantment with cost {0}). */
  const shrine = (name: string) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment — Shrine", subtypes: ["Shrine"] });

  describe("Avatar: The Last Airbender, lot A — rouge", () => {
    it("Boar-q-pine: a +1/+1 counter for each noncreature spell you cast", () => {
      let s = scenario({ p1: { battlefield: ["Boar-q-pine", "Island", ...lands("Forest", 2)], hand: ["Opt", "Bear Cub"] } });
      const boar = idOf(s, "p1", "battlefield", "Boar-q-pine");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[boar]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[boar]?.counters["+1/+1"]).toBe(1);
    });

    describe("Bumi Bash", () => {
      it("deals damage equal to the number of lands you control", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Bumi Bash"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "Bumi Bash", { mode: 0, targets: { t: [dragon] } }));
        expect(s.objects[dragon]?.damage).toBe(4);
      });

      it("destroys a nonbasic land, but not a basic land that isn't a creature", () => {
        const s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Bumi Bash"] },
          p2: { battlefield: ["Ba Sing Se", "Forest"] },
        });
        const forest = idOf(s, "p2", "battlefield", "Forest");
        expect(() => cast(s, "p1", "Bumi Bash", { mode: 1, targets: { u: [forest] } })).toThrow();
        const t = settle(cast(s, "p1", "Bumi Bash", { mode: 1, targets: { u: [idOf(s, "p2", "battlefield", "Ba Sing Se")] } }));
        expect(idsOf(t, "p2", "graveyard", "Ba Sing Se")).toHaveLength(1);
      });
    });

    it("The Cave of Two Lovers: two Allies, then a Mountain in hand, then earthbending 3", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["The Cave of Two Lovers"],
          library: ["Opt", "Mountain", ...lands("Plains", 8)],
        },
      });
      s = settle(cast(s, "p1", "The Cave of Two Lovers"));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(handNames(s).filter((n) => n === "Mountain")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      const animated = s.battlefield.filter((id) => s.objects[id]?.counters["+1/+1"] === 3);
      expect(animated).toHaveLength(1);
      const land = animated[0] as string;
      expect(chars(s, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(s, land)).toEqual([3, 3]);
      expect(idsOf(s, "p1", "graveyard", "The Cave of Two Lovers")).toHaveLength(1);
    });

    describe("Combustion Man", () => {
      const run = (accept: boolean) => {
        let s = scenario({ p1: { battlefield: ["Combustion Man"] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = attack(s, [idOf(s, "p1", "battlefield", "Combustion Man")]);
        let asked = "";
        s = settle(s, (req, player) => {
          if (req.type === "pick" && req.options.includes(angel)) return [angel];
          if (req.type === "yesNo") {
            asked = player;
            return [accept ? 1 : 0];
          }
          return undefined;
        });
        return { s, angel, asked };
      };

      it("the controller of the permanent that refuses the damage sees it destroyed", () => {
        const { s, asked } = run(false);
        expect(asked).toBe("p2");
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(20);
      });

      it("if it accepts, it takes damage equal to Combustion Man's power and the permanent stays", () => {
        const { s, angel } = run(true);
        expect(s.battlefield).toContain(angel);
        expect(s.players.p2?.life).toBe(16);
      });
    });

    it("Crescent Island Temple: a Monk per Sanctuary when it enters, then one per other Sanctuary that enters", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), shrine("Test Shrine A")],
          hand: ["Crescent Island Temple", shrine("Test Shrine B")],
        },
      });
      s = settle(cast(s, "p1", "Crescent Island Temple"));
      const monks = idsOf(s, "p1", "battlefield", "Monk");
      expect(monks).toHaveLength(2);
      expect(chars(s, monks[0] as string).keywords).toContain("prowess");
      expect(chars(s, monks[0] as string).colors).toEqual(["R"]);
      s = settle(cast(s, "p1", "Test Shrine B"));
      expect(idsOf(s, "p1", "battlefield", "Monk")).toHaveLength(3);
    });

    it("Cunning Maneuver: +3/+1 until end of turn and a Clue", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Cunning Maneuver"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cunning Maneuver", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 3]);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Deserter's Disciple: another of your creatures with power 2 or less can't be blocked this turn", () => {
      let s = scenario({ p1: { battlefield: ["Deserter's Disciple", "Bear Cub", "Serra Angel"] } });
      const disciple = idOf(s, "p1", "battlefield", "Deserter's Disciple");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => activate(s, "p1", disciple, { t: [idOf(s, "p1", "battlefield", "Serra Angel")] })).toThrow();
      expect(() => activate(s, "p1", disciple, { t: [disciple] })).toThrow();
      s = settle(activate(s, "p1", disciple, { t: [bear] }));
      expect(chars(s, bear).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("unblockable");
    });

    it("Fire Nation Attacks: two 2/2 Soldiers with firebending 1; flashback {8}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 9), hand: ["Fire Nation Attacks"] } });
      s = settle(cast(s, "p1", "Fire Nation Attacks"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect(pt(s, soldiers[0] as string)).toEqual([2, 2]);
      expect(
        chars(s, soldiers[0] as string).abilities.some((a) => "label" in a && plainText(a.label ?? "") === "Firebending 1"),
      ).toBe(true);
      // Four Mountains remain: not enough for the flashback.
      const card = idOf(s, "p1", "graveyard", "Fire Nation Attacks");
      expect(castable(s, "p1", card)).toBe(false);
      let t = scenario({ p1: { battlefield: lands("Mountain", 9), graveyard: ["Fire Nation Attacks"] } });
      const fromGraveyard = idOf(t, "p1", "graveyard", "Fire Nation Attacks");
      expect(castable(t, "p1", fromGraveyard)).toBe(true);
      t = settle(act(t, "p1", { type: "cast", card: fromGraveyard }));
      expect(idsOf(t, "p1", "battlefield", "Soldier")).toHaveLength(2);
      expect(exiled(t, "Fire Nation Attacks")).toHaveLength(1);
    });

    describe("Fire Nation Cadets", () => {
      it("has firebending 2 only with a Lesson in your graveyard", () => {
        const without = scenario({ p1: { battlefield: ["Fire Nation Cadets"], graveyard: ["Opt"] } });
        const a = idOf(without, "p1", "battlefield", "Fire Nation Cadets");
        expect(chars(without, a).abilities.some((x) => "label" in x && plainText(x.label ?? "") === "Firebending 2")).toBe(false);
        let s = scenario({ p1: { battlefield: ["Fire Nation Cadets"], graveyard: ["Firebending Lesson"] } });
        const cadets = idOf(s, "p1", "battlefield", "Fire Nation Cadets");
        s = attack(s, [cadets]);
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(2);
      });

      it("{2}: +1/+0 until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Fire Nation Cadets", ...lands("Mountain", 2)] } });
        const cadets = idOf(s, "p1", "battlefield", "Fire Nation Cadets");
        s = settle(activate(s, "p1", cadets));
        expect(pt(s, cadets)).toEqual([2, 2]);
      });
    });

    it("Fire Nation Raider: a Clue only if you attacked this turn (raid)", () => {
      const calm = settle(
        cast(scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Fire Nation Raider"] } }), "p1", "Fire Nation Raider"),
      );
      expect(idsOf(calm, "p1", "battlefield", "Clue")).toHaveLength(0);
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Fire Nation Raider"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
      s = settle(cast(s, "p1", "Fire Nation Raider"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Fire Sages: {1}{R}{R} puts a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Fire Sages", ...lands("Mountain", 3)] } });
      const sages = idOf(s, "p1", "battlefield", "Fire Sages");
      s = settle(activate(s, "p1", sages));
      expect(s.objects[sages]?.counters["+1/+1"]).toBe(1);
    });

    it("Firebending Student: firebending X, X being its power", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Firebending Student", counters: { "+1/+1": 2 } }] } });
      const student = idOf(s, "p1", "battlefield", "Firebending Student");
      expect(chars(s, student).keywords).toContain("prowess");
      s = attack(s, [student]);
      s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    it("How to Start a Riot: menace to a creature, +2/+0 to the targeted player's creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["How to Start a Riot"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const [angel, theirs] = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")];
      s = settle(cast(s, "p1", "How to Start a Riot", { targets: { t: [mine], p: ["p2"] } }));
      expect(chars(s, mine).keywords).toContain("menace");
      expect(pt(s, mine)).toEqual([2, 2]);
      expect(pt(s, angel)).toEqual([6, 4]);
      expect(pt(s, theirs)).toEqual([4, 2]);
    });

    it("Jeong Jeong: exhaust {3}, a +1/+1 counter and the next Lesson spell this turn is copied", () => {
      let s = scenario({
        p1: { battlefield: ["Jeong Jeong, the Deserter", ...lands("Mountain", 4)], hand: ["Firebending Lesson"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const jeong = idOf(s, "p1", "battlefield", "Jeong Jeong, the Deserter");
      s = settle(activate(s, "p1", jeong));
      expect(s.objects[jeong]?.counters["+1/+1"]).toBe(1);
      expect(canActivate(s, "p1", jeong)).toBe(false);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Firebending Lesson", { targets: { t: [angel] } }));
      // 2 damage from the original, 2 from the copy: the 4/4 Angel dies.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Jet's Brainwashing", () => {
      it("without kicker: the creature can't block this turn, and a Clue", () => {
        let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Jet's Brainwashing"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Jet's Brainwashing", { targets: { t: [bear] } }));
        expect(chars(s, bear).keywords).toContain("cantBlock");
        expect(s.objects[bear]?.controller).toBe("p2");
        expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      });

      it("kicked: you gain control of it until end of turn, untapped and with haste", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Jet's Brainwashing"] },
          p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Jet's Brainwashing", { kicked: true, targets: { t: [bear] } }));
        expect(s.objects[bear]?.controller).toBe("p1");
        expect(s.objects[bear]?.tapped).toBe(false);
        expect(chars(s, bear).keywords).toContain("haste");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.objects[bear]?.controller).toBe("p2");
      });
    });

    it("Mai: exhaust {3}, a double strike counter (only once)", () => {
      let s = scenario({ p1: { battlefield: ["Mai, Jaded Edge", ...lands("Mountain", 6)] } });
      const mai = idOf(s, "p1", "battlefield", "Mai, Jaded Edge");
      s = settle(activate(s, "p1", mai));
      expect(s.objects[mai]?.counters.doubleStrike).toBe(1);
      expect(chars(s, mai).keywords).toContain("doubleStrike");
      expect(canActivate(s, "p1", mai)).toBe(false);
    });

    describe("Mongoose Lizard", () => {
      it("when it enters, 1 damage to any target", () => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Mongoose Lizard"] } });
        s = settle(cast(s, "p1", "Mongoose Lizard"), picking(["p2"]));
        expect(s.players.p2?.life).toBe(19);
        expect(chars(s, idOf(s, "p1", "battlefield", "Mongoose Lizard")).keywords).toContain("menace");
      });

      it("Mountain cycling {2}: a Mountain from the library to hand", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Mongoose Lizard"], library: ["Opt", "Mountain", "Forest"] },
        });
        const lizard = idOf(s, "p1", "hand", "Mongoose Lizard");
        s = settle(activate(s, "p1", lizard));
        expect(idsOf(s, "p1", "graveyard", "Mongoose Lizard")).toHaveLength(1);
        expect(handNames(s)).toEqual(["Mountain"]);
      });
    });

    describe("Ran and Shaw", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Ran and Shaw"], graveyard } });
        return settle(cast(s, "p1", "Ran and Shaw"));
      };

      it("cast with three Dragon or Lesson cards in the graveyard: a nonlegendary copy token", () => {
        const s = run(["Shivan Dragon", "Firebending Lesson", "Combustion Technique"]);
        const both = idsOf(s, "p1", "battlefield", "Ran and Shaw");
        expect(both).toHaveLength(2);
        const token = both.find((id) => s.objects[id]?.isToken) as string;
        expect(token).toBeDefined();
        expect(chars(s, token).supertypes).not.toContain("Legendary");
      });

      it("with only two, no copy; {3}{R}: your Dragons get +2/+0", () => {
        expect(idsOf(run(["Shivan Dragon", "Firebending Lesson", "Opt"]), "p1", "battlefield", "Ran and Shaw")).toHaveLength(1);
        let s = scenario({ p1: { battlefield: ["Ran and Shaw", "Shivan Dragon", "Bear Cub", ...lands("Mountain", 4)] } });
        const [r, dragon, bear] = [
          idOf(s, "p1", "battlefield", "Ran and Shaw"),
          idOf(s, "p1", "battlefield", "Shivan Dragon"),
          idOf(s, "p1", "battlefield", "Bear Cub"),
        ];
        s = settle(activate(s, "p1", r));
        expect(pt(s, r)).toEqual([6, 4]);
        expect(pt(s, dragon)).toEqual([7, 5]);
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    it("Rough Rhino Cavalry: exhaust {8}, two +1/+1 counters and trample until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Rough Rhino Cavalry", ...lands("Mountain", 8)] } });
      const rhino = idOf(s, "p1", "battlefield", "Rough Rhino Cavalry");
      s = settle(activate(s, "p1", rhino));
      expect(pt(s, rhino)).toEqual([7, 7]);
      expect(chars(s, rhino).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, rhino).keywords).not.toContain("trample");
      expect(pt(s, rhino)).toEqual([7, 7]);
    });

    describe("Solstice Revelations", () => {
      it("casts the nonland card for free if its MV is less than the number of your Mountains", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Solstice Revelations"], library: ["Plains", "Bear Cub"] },
        });
        s = untilCastNow(cast(s, "p1", "Solstice Revelations"));
        const req = castNowOf(s);
        const bear = req?.cards[0] as string;
        expect(nameOf(s, bear)).toBe("Bear Cub");
        s = settle(act(s, "p1", { type: "cast", card: bear, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        // The exiled land card stays in exile.
        expect(exiled(s, "Plains")).toHaveLength(1);
      });

      it("otherwise, the card goes to your hand", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Solstice Revelations"], library: ["Serra Angel", "Opt"] },
        });
        s = settle(cast(s, "p1", "Solstice Revelations"));
        expect(handNames(s)).toEqual(["Serra Angel"]);
      });
    });

    it("Tiger-Dillo: doesn't attack or block without another creature with power 4 or greater", () => {
      const alone = scenario({ p1: { battlefield: ["Tiger-Dillo", "Bear Cub"] } });
      const t = idOf(alone, "p1", "battlefield", "Tiger-Dillo");
      expect(chars(alone, t).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const backed = scenario({ p1: { battlefield: ["Tiger-Dillo", "Serra Angel"] } });
      const u = idOf(backed, "p1", "battlefield", "Tiger-Dillo");
      expect(chars(backed, u).keywords).not.toContain("cantAttack");
      expect(chars(backed, u).keywords).not.toContain("cantBlock");
    });

    it("Treetop Freedom Fighters: haste, and a 1/1 Ally when it enters", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Treetop Freedom Fighters"] } });
      s = settle(cast(s, "p1", "Treetop Freedom Fighters"));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Treetop Freedom Fighters")).keywords).toContain("haste");
    });

    it("Twin Blades: attaches when it enters; double strike until end of turn, +1/+1 while equipped", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Twin Blades"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twin Blades"), picking([bear]));
      const blades = idOf(s, "p1", "battlefield", "Twin Blades");
      expect(s.objects[blades]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Ty Lee: when attacking, pay {1} so a creature can't block this turn", () => {
      let s = scenario({ p1: { battlefield: ["Ty Lee, Artful Acrobat", "Mountain"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, [idOf(s, "p1", "battlefield", "Ty Lee, Artful Acrobat")]);
      s = settle(s, picking([angel]));
      expect(chars(s, angel).keywords).toContain("cantBlock");
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    });

    it("War Balloon: {1} puts a fire counter; at three, it's an artifact creature", () => {
      let s = scenario({ p1: { battlefield: ["War Balloon", ...lands("Mountain", 3)] } });
      const balloon = idOf(s, "p1", "battlefield", "War Balloon");
      expect(chars(s, balloon).types).not.toContain("Creature");
      s = settle(activate(s, "p1", balloon));
      s = settle(activate(s, "p1", balloon));
      expect(chars(s, balloon).types).not.toContain("Creature");
      s = settle(activate(s, "p1", balloon));
      expect(s.objects[balloon]?.counters.fire).toBe(3);
      expect(chars(s, balloon).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, balloon).keywords).toContain("flying");
    });

    it("Wartime Protestors: each other Ally that enters gets a +1/+1 counter and haste", () => {
      let s = scenario({
        p1: { battlefield: ["Wartime Protestors", ...lands("Mountain", 3)], hand: ["Treetop Freedom Fighters"] },
      });
      s = settle(cast(s, "p1", "Treetop Freedom Fighters"));
      const fighters = idOf(s, "p1", "battlefield", "Treetop Freedom Fighters");
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(s.objects[fighters]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[ally]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, ally).keywords).toContain("haste");
      expect(s.objects[idOf(s, "p1", "battlefield", "Wartime Protestors")]?.counters["+1/+1"]).toBeUndefined();
    });

    it("Yuyan Archers: you may discard a card when it enters; if you do, draw", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Yuyan Archers", "Opt"], library: ["Bear Cub"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Yuyan Archers"), picking([opt]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Bear Cub"]);
    });

    describe("Zhao, the Moon Slayer", () => {
      const vista = customCard({
        name: "Test Vista",
        types: ["Land"],
        typeLine: "Land",
        abilities: [dsl.manaAbility(["G", "U"])],
      });

      it("nonbasic lands enter tapped, even the opponents'", () => {
        let s = scenario({ active: "p2", p1: { battlefield: ["Zhao, the Moon Slayer"] }, p2: { hand: [vista, "Forest"] } });
        s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Test Vista") });
        expect(s.objects[idOf(s, "p2", "battlefield", "Test Vista")]?.tapped).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.number > 3 && x.turn.step === "main1");
        s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Forest") });
        expect(s.objects[idOf(s, "p2", "battlefield", "Forest")]?.tapped).toBe(false);
      });

      it("with a conqueror counter, nonbasic lands are Mountains with no other abilities", () => {
        let s = scenario({
          p1: { battlefield: ["Zhao, the Moon Slayer", ...lands("Mountain", 7)] },
          p2: { battlefield: [vista] },
        });
        const zhao = idOf(s, "p1", "battlefield", "Zhao, the Moon Slayer");
        const land = idOf(s, "p2", "battlefield", "Test Vista");
        expect(manaAbilitiesOf(s, land).flatMap((a) => a.produce)).toEqual(["G", "U"]);
        s = settle(activate(s, "p1", zhao));
        expect(s.objects[zhao]?.counters.conqueror).toBe(1);
        expect(chars(s, land).subtypes).toEqual(["Mountain"]);
        expect(manaAbilitiesOf(s, land).flatMap((a) => a.produce)).toEqual(["R"]);
        // Basic lands don't change.
        expect(manaAbilitiesOf(s, idsOf(s, "p1", "battlefield", "Mountain")[0] as string).flatMap((a) => a.produce)).toEqual([
          "R",
        ]);
      });
      it("with a counter, a land creature keeps its creature types (305.7) and loses its static ability", () => {
        const grove = customCard({
          name: "Test Dryad Grove",
          typeLine: "Land Creature — Forest Dryad",
          types: ["Land", "Creature"],
          subtypes: ["Forest", "Dryad"],
          power: 1,
          toughness: 1,
          abilities: [dsl.staticAbility({ types: ["Creature"], other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" })],
        });
        let s = scenario({
          p1: { battlefield: ["Zhao, the Moon Slayer", ...lands("Mountain", 7)] },
          p2: { battlefield: [grove] },
        });
        const zhao = idOf(s, "p1", "battlefield", "Zhao, the Moon Slayer");
        const base = chars(s, zhao).power;
        s = settle(activate(s, "p1", zhao));
        const land = idOf(s, "p2", "battlefield", "Test Dryad Grove");
        expect(chars(s, land).subtypes.sort()).toEqual(["Dryad", "Mountain"]);
        expect(chars(s, land).types).toContain("Creature");
        // The opponent's static ability ("other creatures get +1/+1") no longer applies.
        expect(chars(s, zhao).power).toBe(base - 1);
      });
    });

    it("Zuko, Exiled Prince: {3} exiles the top card, playable this turn only", () => {
      let s = scenario({
        p1: { battlefield: ["Zuko, Exiled Prince", ...lands("Mountain", 5)], library: ["Lightning Strike", "Opt"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Zuko, Exiled Prince")));
      const strike = exiled(s, "Lightning Strike")[0] as string;
      expect(strike).toBeDefined();
      expect(castable(s, "p1", strike)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(castable(s, "p1", strike)).toBe(false);
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Passes and answers choices (suggested answer by default) until an empty stack, with no pending trigger. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
  /** Taps a source for mana of this color (the mana ability that produces it). */
  const tapFor = (s: S, player: string, source: string, color: ManaType) => {
    const a = legalActions(s, player).find((x) => x.type === "tapForMana" && x.source === source && x.colors.includes(color));
    if (a?.type !== "tapForMana") throw new Error(`${nameOf(s, source)} doesn't produce ${color}`);
    return act(s, player, { type: "tapForMana", source, ability: a.ability, color });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attack = (s: S, ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const toBlockers = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  /** Two-color (white and blue) test Ally. */
  const wuAlly = customCard({
    name: "Test Ally",
    subtypes: ["Ally"],
    typeLine: "Creature — Human Ally",
    colors: ["W", "U"],
    power: 1,
    toughness: 1,
  });
  /** Test Sanctuary (enchantment). */
  const shrine = customCard({
    name: "Test Shrine",
    types: ["Enchantment"],
    subtypes: ["Shrine"],
    typeLine: "Enchantment — Shrine",
  });

  describe("Avatar: The Last Airbender, lot A — vert", () => {
    it("Allies at Last: {1} less per Ally; up to two of your creatures deal damage equal to their power", () => {
      let s = scenario({
        p1: { battlefield: ["Earth Kingdom General", "Earth Kingdom General", "Forest"], hand: ["Allies at Last"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const generals = idsOf(s, "p1", "battlefield", "Earth Kingdom General");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // {2}{G} minus two Allies: a single Forest is enough.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Allies at Last"))).toBe(true);
      s = settle(cast(s, "p1", "Allies at Last", { targets: { a: generals, t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(generals.every((id) => (s.objects[id]?.damage ?? 0) === 0)).toBe(true);
    });

    it("Badgermole: earthbending 2; your creatures with a +1/+1 counter have trample", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Badgermole"] } });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(cast(s, "p1", "Badgermole"), picking([land]));
      const mole = idOf(s, "p1", "battlefield", "Badgermole");
      expect(pt(s, land)).toEqual([2, 2]);
      expect(chars(s, land).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(chars(s, mole).keywords).not.toContain("trample");
    });

    it("Badgermole Cub: a creature tapped for mana adds an additional {G}, not a land", () => {
      let s = scenario({ p1: { battlefield: ["Badgermole Cub", "Llanowar Elves", "Forest"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "G");
      expect(s.players.p1?.manaPool.G).toBe(2);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Forest"), "G");
      expect(s.players.p1?.manaPool.G).toBe(3);
    });

    it("The Boulder: when attacking, earthbending X (creatures with power 4 or greater)", () => {
      let s = scenario({ p1: { battlefield: ["The Boulder, Ready to Rumble", "Serra Angel", "Bear Cub", "Forest"] } });
      const land = idOf(s, "p1", "battlefield", "Forest");
      s = attack(s, [idOf(s, "p1", "battlefield", "The Boulder, Ready to Rumble")]);
      s = settle(s, picking([land]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, land).types).toContain("Creature");
    });

    it("Cycle of Renewal: sacrifice a land, up to two tapped basic lands", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Cycle of Renewal"], library: ["Bear Cub", "Island", "Plains"] },
      });
      s = settle(cast(s, "p1", "Cycle of Renewal"));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      const found = [idOf(s, "p1", "battlefield", "Island"), idOf(s, "p1", "battlefield", "Plains")];
      expect(found.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    });

    it("The Earth King: a 4/4 Bear; attackers with power 4 or greater: as many tapped basic lands", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Serra Angel", "Fire Elemental", "Bear Cub"],
          hand: ["The Earth King"],
          library: ["Island", "Plains", "Swamp", "Opt"],
        },
      });
      s = settle(cast(s, "p1", "The Earth King"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear"))).toEqual([4, 4]);
      s = attack(s, [
        idOf(s, "p1", "battlefield", "Serra Angel"),
        idOf(s, "p1", "battlefield", "Fire Elemental"),
        idOf(s, "p1", "battlefield", "Bear Cub"),
      ]);
      s = settle(s);
      const basics = ["Island", "Plains", "Swamp"].flatMap((n) => idsOf(s, "p1", "battlefield", n));
      expect(basics).toHaveLength(2);
      expect(basics.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Earth Kingdom General: earthbending 2; you gain as much life, only once each turn", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Earth Kingdom General", "Origin of Metalbending"] } });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(cast(s, "p1", "Earth Kingdom General"), picking([land]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(s.players.p1?.life).toBe(22);
      // Another counter the same turn: no more life.
      const general = idOf(s, "p1", "battlefield", "Earth Kingdom General");
      s = settle(cast(s, "p1", "Origin of Metalbending", { mode: 1, targets: { u: [general] } }));
      expect(s.objects[general]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(22);
    });

    it('Earth Kingdom General: "do this only once each turn"; declining the life gain doesn\'t use up the limit', () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Earth Kingdom General", "Origin of Metalbending"] } });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      s = settle(cast(s, "p1", "Earth Kingdom General"), (req) => (req.type === "yesNo" ? [0] : picking([land])(req)));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(s.players.p1?.life).toBe(20);
      // Another counter the same turn: the ability triggers again, and this time the life is gained.
      const general = idOf(s, "p1", "battlefield", "Earth Kingdom General");
      let asked = 0;
      s = settle(cast(s, "p1", "Origin of Metalbending", { mode: 1, targets: { u: [general] } }), (req) => {
        if (req.type === "yesNo") asked += 1;
        return req.type === "yesNo" ? [1] : undefined;
      });
      expect(asked).toBe(1);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Earth Rumble: earthbending 2, then one of your creatures fights an opponent's creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Serra Angel"], hand: ["Earth Rumble"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const land = idsOf(s, "p1", "battlefield", "Forest")[0] as string;
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Earth Rumble", { targets: { t: [land] } }), picking([angel, fire]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      // The Angel (4/4) and the Elemental (5/4) deal damage to each other: both die.
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    it("Elemental Teachings: up to four lands with different names; the opponent puts two into the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Elemental Teachings"],
          library: ["Forest", "Forest", "Island", "Mountain", "Plains", "Opt"],
        },
      });
      const lib = s.players.p1?.library ?? [];
      const want = lib.filter((_, i) => i !== 1 && i !== 5);
      let asked = 0;
      s = settle(cast(s, "p1", "Elemental Teachings"), (req, player, cur) => {
        if (req.type !== "pick") return undefined;
        if (player === "p1") return want.filter((id) => req.options.includes(id));
        // The opponent chooses the Island, then the Mountain (the revealed cards changed zones).
        asked++;
        return req.options.filter((id) => ["Island", "Mountain"].includes(nameOf(cur, id) ?? "")).slice(0, 1);
      });
      expect(asked).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Mountain")).toHaveLength(1);
      const placed = [...idsOf(s, "p1", "battlefield", "Plains"), ...idsOf(s, "p1", "battlefield", "Forest")].filter(
        (id) => s.objects[id]?.tapped,
      );
      // The Forest and Plains found enter tapped (the five starting Forests paid for the spell).
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(6);
      expect(placed).toHaveLength(7);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
    });

    it("Flopsie: a +1/+1 counter on each of your creatures; power 4 or greater: only one blocker", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: ["Flopsie, Bumi's Buddy"] } });
      s = settle(cast(s, "p1", "Flopsie, Bumi's Buddy"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Flopsie, Bumi's Buddy"))).toEqual([5, 5]);

      let c = scenario({
        p1: { battlefield: ["Flopsie, Bumi's Buddy", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Serra Angel"] },
      });
      const angel = idOf(c, "p1", "battlefield", "Serra Angel");
      const bear = idOf(c, "p1", "battlefield", "Bear Cub");
      const [b1, b2] = idsOf(c, "p2", "battlefield", "Serra Angel") as [string, string];
      c = toBlockers(attack(c, [angel, bear]));
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: angel },
            { blocker: b2, attacker: angel },
          ],
        }),
      ).toThrow();
      // The creature with power 2 can be blocked by two creatures.
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: bear },
            { blocker: b2, attacker: bear },
          ],
        }),
      ).not.toThrow();
    });

    it("Foggy Swamp Vinebender: can't be blocked by power 2 or less; waterbending {5} during your turn only", () => {
      let s = scenario({
        p1: { battlefield: ["Foggy Swamp Vinebender", ...lands("Forest", 3), "Bear Cub", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const vine = idOf(s, "p1", "battlefield", "Foggy Swamp Vinebender");
      s = settle(activate(s, "p1", vine));
      expect(s.objects[vine]?.counters["+1/+1"]).toBe(1);
      // Three Forests and two tapped creatures (each pays {1}): {5}.
      expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
      const creatures = [vine, ...idsOf(s, "p1", "battlefield", "Bear Cub")];
      expect(creatures.filter((id) => s.objects[id]?.tapped)).toHaveLength(2);

      let c = scenario({
        p1: { battlefield: ["Foggy Swamp Vinebender"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Forest", 5)] },
      });
      const v = idOf(c, "p1", "battlefield", "Foggy Swamp Vinebender");
      c = toBlockers(attack(c, [v]));
      expect(() =>
        act(c, "p2", { type: "declareBlockers", blocks: [{ blocker: idOf(c, "p2", "battlefield", "Bear Cub"), attacker: v }] }),
      ).toThrow();
      expect(() =>
        act(c, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(c, "p2", "battlefield", "Serra Angel"), attacker: v }],
        }),
      ).not.toThrow();
      const theirs = scenario({ active: "p2", p1: { battlefield: ["Foggy Swamp Vinebender", ...lands("Forest", 5)] } });
      expect(canActivate(theirs, "p1", idOf(theirs, "p1", "battlefield", "Foggy Swamp Vinebender"))).toBe(false);
    });

    it("Great Divide Guide: your lands and your Allies produce one mana of any color", () => {
      let s = scenario({ p1: { battlefield: ["Great Divide Guide", "Forest", { name: wuAlly, sick: true }, "Llanowar Elves"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Forest"), "U");
      expect(s.players.p1?.manaPool.U).toBe(1);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Great Divide Guide"), "R");
      expect(s.players.p1?.manaPool.R).toBe(1);
      // The Elf is not an Ally: only {G}.
      expect(() => tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "B")).toThrow();
    });

    it("Haru: whenever another Ally enters under your control, earthbending 1", () => {
      let s = scenario({ p1: { battlefield: ["Haru, Hidden Talent", ...lands("Forest", 4)], hand: ["Earth Kingdom General"] } });
      const [l1, l2] = idsOf(s, "p1", "battlefield", "Forest") as [string, string];
      // Two triggers (Haru and the General's earthbending 2): a different land for each.
      const order = [l1, l2];
      s = settle(cast(s, "p1", "Earth Kingdom General"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? [order.shift() as string] : undefined,
      );
      const counters = [l1, l2].map((id) => s.objects[id]?.counters["+1/+1"] ?? 0).sort();
      expect(counters).toEqual([1, 2]);
    });

    it("Invasion Tactics: your creatures +2/+2; Allies deal damage to a player: draw a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Earth Kingdom General", "Bear Cub"], hand: ["Invasion Tactics"] },
      });
      s = settle(cast(s, "p1", "Invasion Tactics"));
      const general = idOf(s, "p1", "battlefield", "Earth Kingdom General");
      expect(pt(s, general)).toEqual([4, 4]);
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s, [general, idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(12);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Kyoshi Island Plaza: X basic lands (X: your Sanctuaries); another Sanctuary: one more land", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), shrine],
          hand: ["Kyoshi Island Plaza"],
          library: ["Island", "Plains", "Swamp", "Mountain"],
        },
      });
      s = settle(cast(s, "p1", "Kyoshi Island Plaza"));
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.battlefield.filter((id) => ["Island", "Plains", "Swamp", "Mountain"].includes(nameOf(s, id) ?? ""))).toHaveLength(
        2,
      );
    });

    it("Leaves from the Vine: I mills three cards and creates a Food; II a counter on two of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), "Bear Cub", "Llanowar Elves"],
          hand: ["Leaves from the Vine"],
          library: lands("Island", 8),
        },
      });
      s = settle(cast(s, "p1", "Leaves from the Vine"));
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
      s = settle(s);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
    });

    it("Leaves from the Vine: III draws only if there's a creature or Lesson card in the graveyard", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: [{ name: "Leaves from the Vine", counters: { lore: 2 } }], graveyard, library: lands("Island", 5) },
        });
        s = advanceUntil(
          s,
          (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0,
        );
        return settle(s).players.p1?.hand.length ?? 0;
      };
      // The turn's draw, plus a card with a Lesson.
      expect(run(["Opt"])).toBe(1);
      expect(run(["Shared Roots"])).toBe(2);
      expect(run(["Bear Cub"])).toBe(2);
    });

    describe("The Legend of Kyoshi // Avatar Kyoshi", () => {
      const KYOSHI = "The Legend of Kyoshi // Avatar Kyoshi";
      const nextMain = (s: S) =>
        settle(
          advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0),
        );

      it("I: draw as many as the greatest power among your creatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 6), "Serra Angel"], hand: [KYOSHI], library: lands("Island", 8) },
        });
        s = settle(cast(s, "p1", KYOSHI));
        expect(s.players.p1?.hand).toHaveLength(4);
      });

      it("II: earthbending X (cards in hand); the land also becomes an Island", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: KYOSHI, counters: { lore: 1 } }, "Forest"],
            hand: ["Opt", "Opt"],
            library: lands("Plains", 5),
          },
        });
        const forest = idOf(s, "p1", "battlefield", "Forest");
        s = nextMain(s);
        // Two cards, plus the turn's draw.
        expect(s.objects[forest]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, forest).subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
        expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      });

      it("III: Avatar Kyoshi 5/4; your lands have trample and hexproof; {T}: X mana of one color", () => {
        let s = scenario({
          p1: { battlefield: [{ name: KYOSHI, counters: { lore: 2 } }, "Forest", "Bear Cub"], library: lands("Plains", 5) },
        });
        s = nextMain(s);
        const avatar = idOf(s, "p1", "battlefield", KYOSHI);
        expect(chars(s, avatar).name).toBe("Avatar Kyoshi");
        expect(pt(s, avatar)).toEqual([5, 4]);
        const forest = idOf(s, "p1", "battlefield", "Forest");
        expect(chars(s, forest).keywords).toEqual(expect.arrayContaining(["trample", "hexproof"]));
        // Returned this turn: summoning sickness; next turn, {T}: five mana of one color (its power, 5).
        s = advanceUntil(
          s,
          (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 6 && x.pending?.kind === "priority",
        );
        s = settle(activate(s, "p1", avatar), (req) => (req.type === "pick" && req.options.includes("U") ? ["U"] : undefined));
        expect(s.players.p1?.manaPool.U).toBe(5);
      });
    });

    it("Origin of Metalbending: a +1/+1 counter and indestructible until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Bear Cub"], hand: ["Origin of Metalbending"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Origin of Metalbending", { mode: 1, targets: { u: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Ostrich-Horse: mills three cards; a milled land to hand, otherwise a +1/+1 counter", () => {
      const run = (library: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Ostrich-Horse"], library } });
        return settle(cast(s, "p1", "Ostrich-Horse"));
      };
      const land = run(["Opt", "Island", "Bear Cub", "Plains"]);
      expect(idsOf(land, "p1", "hand", "Island")).toHaveLength(1);
      expect(land.players.p1?.graveyard).toHaveLength(2);
      expect(land.objects[idOf(land, "p1", "battlefield", "Ostrich-Horse")]?.counters["+1/+1"] ?? 0).toBe(0);
      const none = run(["Opt", "Bear Cub", "Opt", "Plains"]);
      expect(none.players.p1?.graveyard).toHaveLength(3);
      expect(pt(none, idOf(none, "p1", "battlefield", "Ostrich-Horse"))).toEqual([4, 2]);
    });

    it("Pillar Launch: +2/+2 and reach until end of turn, then untap it", () => {
      let s = scenario({ p1: { battlefield: ["Forest", { name: "Bear Cub", tapped: true }], hand: ["Pillar Launch"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Pillar Launch", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("reach");
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Raucous Audience: {G}, or {G}{G} if you control a creature with power 4 or greater", () => {
      let s = scenario({ p1: { battlefield: ["Raucous Audience"] } });
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Raucous Audience"), "G");
      expect(s.players.p1?.manaPool.G).toBe(1);
      let big = scenario({ p1: { battlefield: ["Raucous Audience", "Serra Angel"] } });
      big = tapFor(big, "p1", idOf(big, "p1", "battlefield", "Raucous Audience"), "G");
      expect(big.players.p1?.manaPool.G).toBe(2);
    });

    it("Rebellious Captives: exhaust {6}: two counters on it, then earthbending 2, only once", () => {
      let s = scenario({ p1: { battlefield: ["Rebellious Captives", ...lands("Forest", 13)] } });
      const captives = idOf(s, "p1", "battlefield", "Rebellious Captives");
      const land = idsOf(s, "p1", "battlefield", "Forest")[12] as string;
      s = settle(activate(s, "p1", captives, { t: [land] }));
      expect(pt(s, captives)).toEqual([4, 4]);
      expect(s.objects[land]?.counters["+1/+1"]).toBe(2);
      expect(canActivate(s, "p1", captives)).toBe(false);
    });

    it("Rockalanche: earthbending X (your Forests); flashback {5}{G}", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 3), ...lands("Plains", 3)], hand: ["Rockalanche"] } });
      const plains = idOf(s, "p1", "battlefield", "Plains");
      s = settle(cast(s, "p1", "Rockalanche", { targets: { t: [plains] } }));
      expect(s.objects[plains]?.counters["+1/+1"]).toBe(3);
      const fb = scenario({ p1: { battlefield: lands("Forest", 6), graveyard: ["Rockalanche"] } });
      expect(castable(fb, "p1", idOf(fb, "p1", "graveyard", "Rockalanche"))).toBe(true);
    });

    it("Rocky Rebuke: your creature deals damage equal to its power to an opponent's creature", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Forest", "Serra Angel"], hand: ["Rocky Rebuke"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Rocky Rebuke", { targets: { a: [angel], b: [fire] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    it("Seismic Sense: look at X cards (X: your lands), a creature or a land to hand, the rest on the bottom", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Seismic Sense"], library: ["Opt", "Opt", "Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Seismic Sense"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Island");
    });

    it("Sparring Dummy: mill a card; a land returns to hand; 2 life if it's a Lesson", () => {
      let s = scenario({ p1: { battlefield: ["Sparring Dummy"], library: ["Shared Roots", "Island", "Opt"] } });
      const dummy = idOf(s, "p1", "battlefield", "Sparring Dummy");
      s = settle(activate(s, "p1", dummy));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p1", "graveyard", "Shared Roots")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sparring Dummy"], library: ["Island", "Opt"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Sparring Dummy")));
      expect(idsOf(t, "p1", "hand", "Island")).toHaveLength(1);
      expect(t.players.p1?.life).toBe(20);
    });

    it("True Ancestry: a permanent card from your graveyard to hand, and a Clue", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["True Ancestry"], graveyard: ["Bear Cub", "Opt"] } });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const opt = idOf(s, "p1", "graveyard", "Opt");
      expect(() => cast(s, "p1", "True Ancestry", { targets: { t: [opt] } })).toThrow();
      s = settle(cast(s, "p1", "True Ancestry", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Turtle-Duck: {3}: base power 4 and trample until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Turtle-Duck", ...lands("Forest", 3)] } });
      const duck = idOf(s, "p1", "battlefield", "Turtle-Duck");
      s = settle(activate(s, "p1", duck));
      expect(pt(s, duck)).toEqual([4, 4]);
      expect(chars(s, duck).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, duck)).toEqual([0, 4]);
    });

    it("Unlucky Cabbage Merchant: a Food; sacrificing a Food, a basic land and the merchant leaves", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Unlucky Cabbage Merchant"], library: ["Opt", "Island"] },
      });
      s = settle(cast(s, "p1", "Unlucky Cabbage Merchant"));
      const food = idOf(s, "p1", "battlefield", "Food");
      s = settle(activate(s, "p1", food));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Unlucky Cabbage Merchant")).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Unlucky Cabbage Merchant"]);
    });

    it("Walltop Sentries: when it dies, 2 life only if there's a Lesson in your graveyard", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Walltop Sentries", "Mountain", "Mountain"], hand: ["Lightning Strike"], graveyard },
        });
        return settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Walltop Sentries")] } }));
      };
      expect(run(["Opt"]).players.p1?.life).toBe(20);
      const lesson = run(["Shared Roots"]);
      expect(idsOf(lesson, "p1", "graveyard", "Walltop Sentries")).toHaveLength(1);
      expect(lesson.players.p1?.life).toBe(22);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plus = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Goes to p1's declare attackers step and declares these attackers against p2. */
  const attack = (s: S, ids: string[]): S => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  /** Test instant: "Destroy target creature." */
  const murder = customCard({
    name: "Test Murder",
    types: ["Instant"],
    typeLine: "Instant",
    spell: dsl.spell([dsl.target.creature()], [dsl.fx.destroy(dsl.ref.target())]),
  });

  /** Test artifact: "Sacrifice a creature: nothing." (another permanent sacrificed). */
  const altar = customCard({
    name: "Test Altar",
    types: ["Artifact"],
    typeLine: "Artifact",
    abilities: [
      dsl.activated({ sacrificeOther: { filter: { types: ["Creature"] } }, effects: [], label: "Sacrifice a creature" }),
    ],
  });

  describe("Avatar: The Last Airbender, lot A — multicolores", () => {
    it("Air Nomad Legacy: a Clue when it enters; your flying creatures get +1/+1", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Island", "Serra Angel", "Bear Cub"], hand: ["Air Nomad Legacy"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Air Nomad Legacy"));
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
    });

    it("Azula, Cunning Usurper: the opponent exiles a nontoken creature and a nonland card from their graveyard, castable during your turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Island", "Swamp"], hand: ["Azula, Cunning Usurper"] },
        p2: { battlefield: ["Bear Cub"], graveyard: ["Opt", "Forest"] },
      });
      s = settle(cast(s, "p1", "Azula, Cunning Usurper"));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      const bear = exiled(s, "Bear Cub")[0] as string;
      const opt = exiled(s, "Opt")[0] as string;
      expect(bear).toBeDefined();
      expect(opt).toBeDefined();
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      // One Swamp remains untapped: Opt ({U}) is cast with mana of any type.
      expect(castable(s, "p1", opt)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: opt }));
      expect(exiled(s, "Opt")).toHaveLength(0);
      // Not during the opponent's turn.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p1", bear)).toBe(false);
    });

    it("Azula, Cunning Usurper: the exiled cards are cast as though they had flash during your turn (PLAN-M M8b)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Island", "Swamp", "Swamp"], hand: ["Azula, Cunning Usurper"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Azula, Cunning Usurper"));
      const bear = exiled(s, "Bear Cub")[0] as string;
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.player === "p1");
      expect(castable(s, "p1", bear)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Beifong's Bounty Hunters: one of your nonland creatures dies, earthbending X (its power)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Beifong's Bounty Hunters", "Bear Cub", "Forest", "Mountain"],
          hand: ["Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }), picking([forest]));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(plus(s, forest)).toBe(2);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    });

    describe("Bitter Work", () => {
      it("attacking with a creature with power 4 or greater makes you draw; not with a small creature", () => {
        const run = (attacker: string) => {
          let s = scenario({ p1: { battlefield: ["Bitter Work", attacker] } });
          const hand = s.players.p1?.hand.length ?? 0;
          s = settle(attack(s, [idOf(s, "p1", "battlefield", attacker)]));
          return (s.players.p1?.hand.length ?? 0) - hand;
        };
        expect(run("Serra Angel")).toBe(1);
        expect(run("Bear Cub")).toBe(0);
      });

      it("exhaust — {4}: earthbending 4, only during your turn", () => {
        let s = scenario({ p1: { battlefield: ["Bitter Work", ...lands("Forest", 5)] } });
        const work = idOf(s, "p1", "battlefield", "Bitter Work");
        const land = idsOf(s, "p1", "battlefield", "Forest")[4] as string;
        s = settle(activate(s, "p1", work, { targets: { t: [land] } }));
        expect(plus(s, land)).toBe(4);
        expect(pt(s, land)).toEqual([4, 4]);
        // Une seule activation.
        expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === work)).toBe(false);
        const theirs = scenario({ active: "p2", p1: { battlefield: ["Bitter Work", ...lands("Forest", 5)] } });
        const w = idOf(theirs, "p1", "battlefield", "Bitter Work");
        expect(legalActions(theirs, "p1").some((a) => a.type === "activate" && a.source === w)).toBe(false);
      });
    });

    it("Bumi, Unleashed: combat damage to a player, your lands untap and an additional combat follows, without nonland creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bumi, Unleashed", "Bear Cub", { name: "Forest", tapped: true }, { name: "Mountain", tapped: true }],
        },
      });
      const bumi = idOf(s, "p1", "battlefield", "Bumi, Unleashed");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bumi]);
      s = advanceUntil(s, (x) => x.turn.step === "endCombat");
      expect(s.players.p2?.life).toBe(15);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Land")).every((id) => !s.objects[id]?.tapped)).toBe(true);
      // The additional combat: the Bear (nonland) can't attack in it.
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" || x.turn.step === "main2");
      expect(s.turn.step).toBe("beginCombat");
      expect(chars(s, bear).keywords).toContain("cantAttack");
    });

    it("Cat-Owl: when attacking, untaps a targeted artifact or creature", () => {
      let s = scenario({ p1: { battlefield: ["Cat-Owl", { name: "Bear Cub", tapped: true }] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Cat-Owl")]), picking([bear]));
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Cruel Administrator: raid, a +1/+1 counter; when attacking, a 2/2 Soldier with firebending 1", () => {
      const run = (attackFirst: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Cruel Administrator"] },
        });
        if (attackFirst) {
          s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
          s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
        }
        s = settle(cast(s, "p1", "Cruel Administrator"));
        return { s, id: idOf(s, "p1", "battlefield", "Cruel Administrator") };
      };
      expect(plus(run(false).s, run(false).id)).toBe(0);
      const raid = run(true);
      expect(plus(raid.s, raid.id)).toBe(1);
      let s = scenario({ p1: { battlefield: ["Cruel Administrator"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Cruel Administrator")]));
      const soldier = idOf(s, "p1", "battlefield", "Soldier");
      expect([...pt(s, soldier), chars(s, soldier).colors]).toEqual([2, 2, ["R"]]);
      expect(
        chars(s, soldier).abilities.some((a) => a.kind === "triggered" && plainText(a.label ?? "") === "Firebending 1"),
      ).toBe(true);
    });

    it("Dai Li Agents: two earthbending 1 when it enters; when attacking, drain equal to your creatures with a +1/+1 counter", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 4)], hand: ["Dai Li Agents"] },
      });
      const [a, b] = idsOf(s, "p1", "battlefield", "Forest").slice(2) as [string, string];
      let asked = 0;
      s = settle(cast(s, "p1", "Dai Li Agents"), (req) => {
        if (req.type !== "pick") return undefined;
        asked++;
        return [asked === 1 ? a : b].filter((x) => req.options.includes(x));
      });
      expect([plus(s, a), plus(s, b)]).toEqual([1, 1]);
      // On p1's next turn, the Agents attack: two creatures with a counter.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Dai Li Agents")]));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Dragonfly Swarm: power equal to the noncreature nonland cards in your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dragonfly Swarm", "Mountain"],
          hand: ["Firebending Lesson"],
          graveyard: ["Opt", "Bear Cub", "Forest"],
        },
      });
      const swarm = idOf(s, "p1", "battlefield", "Dragonfly Swarm");
      expect(pt(s, swarm)).toEqual([1, 3]);
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [swarm] } }));
      // The Lesson, once in the graveyard, counts too; its 2 damage doesn't kill it.
      expect(idsOf(s, "p1", "battlefield", "Dragonfly Swarm")).toHaveLength(1);
      expect(pt(s, swarm)).toEqual([2, 3]);
    });

    it("Dragonfly Swarm: dies with a Lesson in the graveyard, draw; without a Lesson, nothing", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Dragonfly Swarm", ...lands("Mountain", 2)], hand: ["Lightning Strike"], graveyard },
        });
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Dragonfly Swarm")] } }));
        expect(idsOf(s, "p1", "graveyard", "Dragonfly Swarm")).toHaveLength(1);
        return (s.players.p1?.hand.length ?? 0) - (hand - 1);
      };
      expect(run(["Shared Roots"])).toBe(1);
      expect(run(["Bear Cub"])).toBe(0);
    });

    it("Earth King's Lieutenant: a counter on each of your other Allies; each other Ally that enters gives it one", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Plains", ...lands("Plains", 2), "Pretending Poxbearers", "Bear Cub"],
          hand: ["Earth King's Lieutenant", "Pretending Poxbearers"],
        },
      });
      const ally = idOf(s, "p1", "battlefield", "Pretending Poxbearers");
      s = settle(cast(s, "p1", "Earth King's Lieutenant"));
      const lieutenant = idOf(s, "p1", "battlefield", "Earth King's Lieutenant");
      expect(plus(s, ally)).toBe(1);
      expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(plus(s, lieutenant)).toBe(0);
      s = settle(cast(s, "p1", "Pretending Poxbearers"));
      expect(plus(s, lieutenant)).toBe(1);
    });

    it("Earth Rumble Wrestlers: +1/+0 and trample when a land entered under your control this turn", () => {
      let s = scenario({ p1: { battlefield: ["Earth Rumble Wrestlers"], hand: ["Forest"] } });
      const w = idOf(s, "p1", "battlefield", "Earth Rumble Wrestlers");
      expect(pt(s, w)).toEqual([3, 4]);
      expect(chars(s, w).keywords).not.toContain("trample");
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(pt(s, w)).toEqual([4, 4]);
      expect(chars(s, w).keywords).toContain("trample");
      expect(chars(s, w).keywords).toContain("reach");
    });

    it("Fire Lord Azula: a spell cast while she attacks is copied", () => {
      let s = scenario({ p1: { battlefield: ["Fire Lord Azula", "Mountain"], hand: ["Lightning Strike"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Fire Lord Azula")]);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      // Firebending 2: {R}{R} during combat, plus the Mountain.
      expect(s.players.p1?.manaPool.R).toBe(2);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Fire Lord Azula: no copy outside of the attack", () => {
      let s = scenario({ p1: { battlefield: ["Fire Lord Azula", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it('Fire Lord Azula: "as long as she attacks" is checked only on trigger; removed from combat afterward, the copy is still made', () => {
      /** {0} test instant: "Gain control of target creature until end of turn." */
      const threaten = customCard({
        name: "Test Threaten",
        types: ["Instant"],
        typeLine: "Instant",
        spell: dsl.spell([dsl.target.creature()], [dsl.fx.gainControl(dsl.ref.target())]),
      });
      let s = scenario({
        p1: { battlefield: ["Fire Lord Azula", "Mountain"], hand: ["Lightning Strike"] },
        p2: { hand: [threaten] },
      });
      const azula = idOf(s, "p1", "battlefield", "Fire Lord Azula");
      s = attack(s, [azula]);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      // Azula's ability triggers (she attacks) and goes on the stack above the Lightning Bolt.
      expect(s.stack).toHaveLength(2);
      s = act(s, "p1", { type: "pass" });
      expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
      // In response, the opponent gains control of her: she is removed from combat (506.4).
      s = passBoth(cast(s, "p2", "Test Threaten", { targets: { t: [azula] } }));
      expect(s.objects[azula]?.controller).toBe("p2");
      expect(s.combat?.attackers.some((a) => a.id === azula)).toBe(false);
      expect(s.stack).toHaveLength(2);
      // The ability resolves anyway: the Lightning Bolt is copied.
      s = settle(s);
      expect(s.players.p2?.life).toBe(14);
    });

    describe("Fire Lord Zuko", () => {
      /** Test instant: "Exile target creature, then return it to the battlefield." */
      const flicker = customCard({
        name: "Test Flicker",
        types: ["Instant"],
        typeLine: "Instant",
        spell: dsl.spell(
          [dsl.target.creature()],
          [dsl.fx.exileCard(dsl.ref.target(), { name: "f" }), dsl.fx.toBattlefield(dsl.ref.stored("f"))],
        ),
      });
      /** Test instant: "Airbend target creature." */
      const gust = customCard({
        name: "Test Gust",
        types: ["Instant"],
        typeLine: "Instant",
        spell: dsl.spell([dsl.target.creature()], [dsl.fx.airbend(dsl.ref.target())]),
      });

      it("firebending X, X being its power", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Fire Lord Zuko", counters: { "+1/+1": 1 } }] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Fire Lord Zuko")]);
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(3);
      });

      it("a permanent you control enters from exile: a +1/+1 counter on each of your creatures", () => {
        let s = scenario({ p1: { battlefield: ["Fire Lord Zuko", "Bear Cub"], hand: [flicker] } });
        const zuko = idOf(s, "p1", "battlefield", "Fire Lord Zuko");
        s = settle(cast(s, "p1", "Test Flicker", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(plus(s, zuko)).toBe(1);
        expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      });

      it("a spell cast from exile triggers only once (the permanent enters from the stack)", () => {
        let s = scenario({ p1: { battlefield: ["Fire Lord Zuko", "Bear Cub", ...lands("Forest", 2)], hand: [gust] } });
        const zuko = idOf(s, "p1", "battlefield", "Fire Lord Zuko");
        s = settle(cast(s, "p1", "Test Gust", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(plus(s, zuko)).toBe(0);
        s = settle(act(s, "p1", { type: "cast", card: exiled(s, "Bear Cub")[0] as string }));
        expect(plus(s, zuko)).toBe(1);
        // The ability resolves before the spell: the Bear, which entered afterward (from the stack), gets nothing.
        expect(plus(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      });
    });

    it("Foggy Swamp Spirit Keeper: your second card drawn each turn creates a 1/1 Spirit", () => {
      let s = scenario({ p1: { battlefield: ["Foggy Swamp Spirit Keeper", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const [a, b] = idsOf(s, "p1", "hand", "Opt") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: a }));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: b }));
      const spirit = idOf(s, "p1", "battlefield", "Spirit");
      expect([...pt(s, spirit), chars(s, spirit).colors]).toEqual([1, 1, []]);
    });

    it("Guru Pathik: a Lesson among the top five; each Lesson spell puts a counter on another of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Mountain", "Bear Cub"],
          hand: ["Guru Pathik"],
          library: ["Opt", "Firebending Lesson", "Bear Cub", "Forest", "Island", "Plains"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      s = settle(cast(s, "p1", "Guru Pathik"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Firebending Lesson"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Plains");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guru = idOf(s, "p1", "battlefield", "Guru Pathik");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [fire] } }), picking([bear]));
      expect(plus(s, bear)).toBe(1);
      expect(plus(s, guru)).toBe(0);
    });

    it("Hei Bai: when it enters, sacrifice another creature for two counters; when it leaves, its counters go onto one of your creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Serra Angel"], hand: ["Hei Bai, Spirit of Balance", murder] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Hei Bai, Spirit of Balance"), picking([bear]));
      const hei = idOf(s, "p1", "battlefield", "Hei Bai, Spirit of Balance");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(plus(s, hei)).toBe(2);
      expect(pt(s, hei)).toEqual([5, 5]);
      s = settle(cast(s, "p1", "Test Murder", { targets: { t: [hei] } }), picking([angel]));
      expect(idsOf(s, "p1", "graveyard", "Hei Bai, Spirit of Balance")).toHaveLength(1);
      expect(plus(s, angel)).toBe(2);
    });

    it("Hei Bai: the sacrifice is optional", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Hei Bai, Spirit of Balance"] } });
      s = settle(cast(s, "p1", "Hei Bai, Spirit of Balance"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(plus(s, idOf(s, "p1", "battlefield", "Hei Bai, Spirit of Balance"))).toBe(0);
    });

    it("Iroh, Tea Master: at combat, give a permanent to an opponent and create an Ally with a counter for each permanent you own they control", () => {
      let s = scenario({ p1: { battlefield: ["Iroh, Tea Master", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0));
      s = settle(s, picking([bear]));
      expect(s.objects[bear]?.controller).toBe("p2");
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(plus(s, ally)).toBe(1);
      expect(pt(s, ally)).toEqual([2, 2]);
    });

    it("Iroh, Tea Master: only permanents you own that your opponents control count (not those an opponent took from another)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Iroh, Tea Master", "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Savannah Lions"] },
        p3: { battlefield: ["Serra Angel"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      steal(s, elves, "p3");
      steal(s, idOf(s, "p3", "battlefield", "Serra Angel"), "p2");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0));
      s = settle(s, picking([bear]));
      expect(s.objects[bear]?.controller).not.toBe("p1");
      // The Bear Cub given and the Llanowar Elves taken by p3: two counters; p3's Serra Angel under p2 doesn't count.
      expect(plus(s, idOf(s, "p1", "battlefield", "Ally"))).toBe(2);
    });

    it("Jet, Freedom Fighter: when it enters, damage equal to the number of your creatures to an opponent's creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Bear Cub", "Bear Cub"], hand: ["Jet, Freedom Fighter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Jet, Freedom Fighter"), picking([angel]));
      expect(s.objects[angel]?.damage).toBe(3);
    });

    it("Katara, the Fearless: your Allies' triggered abilities trigger one additional time", () => {
      let s = scenario({
        p1: {
          battlefield: ["Katara, the Fearless", "Pretending Poxbearers", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Pretending Poxbearers")] } }));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(2);
    });

    it("Katara, Water Tribe's Hope: waterbending {X}, your creatures have base P/T X/X until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Katara, Water Tribe's Hope", "Serra Angel", ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const katara = idOf(s, "p1", "battlefield", "Katara, Water Tribe's Hope");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // "X can't be 0": X goes from 1 to 5 (three Islands, Katara and the Angel tapped for the waterbending).
      const option = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === katara);
      expect(option?.type === "activate" ? [option.xMin, option.xMax] : null).toEqual([1, 5]);
      expect(() => activate(s, "p1", katara, { x: 0 })).toThrow(/X must be at least/);
      s = settle(activate(s, "p1", katara, { x: 3 }));
      expect(pt(s, katara)).toEqual([3, 3]);
      expect(pt(s, angel)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === katara)).toBe(false);
    });

    it("The Lion-Turtle: can't attack or block without three Lessons in the graveyard", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: ["The Lion-Turtle"], graveyard } });
        return chars(s, idOf(s, "p1", "battlefield", "The Lion-Turtle")).keywords;
      };
      expect(run(["Shared Roots", "Firebending Lesson"])).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      expect(run(["Shared Roots", "Firebending Lesson", "Combustion Technique"])).not.toContain("cantAttack");
    });

    it("Long Feng: another of your creatures or one of your lands put into the graveyard, a counter on one of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Long Feng, Grand Secretariat", "Bear Cub", "Serra Angel", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
        },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(
        cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
        picking([angel]),
      );
      expect(plus(s, angel)).toBe(1);
    });

    it("Messenger Hawk: a Clue; +2/+0 after two cards drawn this turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 6)], hand: ["Messenger Hawk", "Opt"] } });
      s = settle(cast(s, "p1", "Messenger Hawk"));
      const hawk = idOf(s, "p1", "battlefield", "Messenger Hawk");
      expect(pt(s, hawk)).toEqual([1, 2]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, hawk)).toEqual([1, 2]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Clue")));
      expect(pt(s, hawk)).toEqual([3, 2]);
    });

    it("Platypus-Bear: mills two cards; attacks despite defender with a Lesson in the graveyard", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2)], hand: ["Platypus-Bear"], library: ["Bear Cub", "Shared Roots", "Opt"] },
      });
      s = settle(cast(s, "p1", "Platypus-Bear"));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Shared Roots"]);
      const bear = idOf(s, "p1", "battlefield", "Platypus-Bear");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["defender", "attacksDespiteDefender"]));
      const none = scenario({ p1: { battlefield: ["Platypus-Bear"] } });
      expect(chars(none, idOf(none, "p1", "battlefield", "Platypus-Bear")).keywords).not.toContain("attacksDespiteDefender");
    });

    it("Professor Zei: {1}, {T}, sacrifice: an instant or sorcery from your graveyard returns to hand, during your turn", () => {
      let s = scenario({ p1: { battlefield: ["Professor Zei, Anthropologist", "Island"], graveyard: ["Opt", "Bear Cub"] } });
      const zei = idOf(s, "p1", "battlefield", "Professor Zei, Anthropologist");
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const a = legalActions(s, "p1").filter((x) => x.type === "activate" && x.source === zei);
      const ability = a.map((x) => (x.type === "activate" ? x.ability : -1)).find((i) => i > 0) as number;
      s = settle(act(s, "p1", { type: "activate", source: zei, ability, targets: { t: [opt] } }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Professor Zei, Anthropologist")).toHaveLength(1);
    });

    it("Sandbender Scavengers: a counter per other permanent sacrificed; when it dies, exile it to return a creature with MV at most its power", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sandbender Scavengers", "Bear Cub", altar, ...lands("Mountain", 4)],
          hand: ["Lightning Strike"],
          graveyard: ["Serra Angel", "Fire Elemental"],
        },
      });
      const scav = idOf(s, "p1", "battlefield", "Sandbender Scavengers");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Test Altar"), { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
      );
      expect(plus(s, scav)).toBe(1);
      expect(pt(s, scav)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [scav] } }), (req) => {
        if (req.type === "yesNo") return [1];
        return undefined;
      });
      expect(exiled(s, "Sandbender Scavengers")).toHaveLength(1);
      // Its last known power (2): the Bear (MV 2) returns, not the Angel (MV 5).
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    });

    it("Sokka, Bold Boomeranger: discard up to two cards, draw as many; an artifact or Lesson spell gives it a counter", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Mountain", "Mountain"],
          hand: ["Sokka, Bold Boomeranger", "Bear Cub", "Forest", "Firebending Lesson"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const keep = idOf(s, "p1", "hand", "Firebending Lesson");
      s = settle(cast(s, "p1", "Sokka, Bold Boomeranger"), (req) =>
        req.type === "pick" && req.intent === "discard" ? req.options.filter((o) => o !== keep) : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(3);
      const sokka = idOf(s, "p1", "battlefield", "Sokka, Bold Boomeranger");
      s = settle(act(s, "p1", { type: "cast", card: keep, targets: { t: [idOf(s, "p2", "battlefield", "Fire Elemental")] } }));
      expect(plus(s, sokka)).toBe(1);
    });

    it("Sokka, Lateral Strategist: draws when it attacks with another creature, not alone", () => {
      const run = (names: string[]) => {
        let s = scenario({ p1: { battlefield: ["Sokka, Lateral Strategist", "Bear Cub"] } });
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(
          attack(
            s,
            names.map((n) => idOf(s, "p1", "battlefield", n)),
          ),
        );
        return (s.players.p1?.hand.length ?? 0) - hand;
      };
      expect(run(["Sokka, Lateral Strategist", "Bear Cub"])).toBe(1);
      expect(run(["Sokka, Lateral Strategist"])).toBe(0);
    });

    it("Sokka, Tenacious Tactician: your other Allies have menace and prowess; a noncreature spell creates an Ally", () => {
      let s = scenario({
        p1: { battlefield: ["Sokka, Tenacious Tactician", "Pretending Poxbearers", "Bear Cub", "Island"], hand: ["Opt"] },
      });
      const pox = idOf(s, "p1", "battlefield", "Pretending Poxbearers");
      expect(chars(s, pox).keywords).toEqual(expect.arrayContaining(["menace", "prowess"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, pox)).toEqual([3, 2]);
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(chars(s, ally).keywords).toEqual(expect.arrayContaining(["menace", "prowess"]));
    });

    it("Suki, Kyoshi Warrior: power equal to your creatures; when attacking, a tapped and attacking Ally", () => {
      let s = scenario({ p1: { battlefield: ["Suki, Kyoshi Warrior", "Bear Cub"] } });
      const suki = idOf(s, "p1", "battlefield", "Suki, Kyoshi Warrior");
      expect(pt(s, suki)).toEqual([2, 4]);
      s = settle(attack(s, [suki]));
      const ally = idOf(s, "p1", "battlefield", "Ally");
      expect(s.objects[ally]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === ally)).toBe(true);
      expect(pt(s, suki)).toEqual([3, 4]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Sun Warriors: firebending X, X being the number of your creatures; {5}: an Ally", () => {
      let s = scenario({ p1: { battlefield: ["Sun Warriors", "Bear Cub", "Bear Cub", ...lands("Mountain", 5)] } });
      const sun = idOf(s, "p1", "battlefield", "Sun Warriors");
      s = settle(activate(s, "p1", sun));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      s = attack(s, [sun]);
      s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(4);
    });

    it("Tolls of War: a Clue; sacrificing a permanent during your turn creates an Ally, once each turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Tolls of War"] } });
      s = settle(cast(s, "p1", "Tolls of War"));
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(activate(s, "p1", clue));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Ally")).toHaveLength(1);
    });

    it("Toph, Hardheaded Teacher: each spell cast makes an earthbending 1, with one more counter for a Lesson", () => {
      let s = scenario({
        p1: { battlefield: ["Toph, Hardheaded Teacher", ...lands("Mountain", 2), "Island"], hand: ["Firebending Lesson", "Opt"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const [m1, m2] = idsOf(s, "p1", "battlefield", "Mountain") as [string, string];
      const island = idOf(s, "p1", "battlefield", "Island");
      s = settle(cast(s, "p1", "Opt"), picking([m1]));
      expect(plus(s, m1)).toBe(1);
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Firebending Lesson", { kicked: false, targets: { t: [fire] } }), picking([island]));
      expect(plus(s, island)).toBe(2);
      expect(m2).toBeDefined();
    });

    it("Toph, Hardheaded Teacher: when it enters, discard a card to return an instant or sorcery", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)],
          hand: ["Toph, Hardheaded Teacher", "Bear Cub"],
          graveyard: ["Opt"],
        },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      s = settle(cast(s, "p1", "Toph, Hardheaded Teacher"), (req) =>
        req.type === "pick" && req.options.includes(opt)
          ? [opt]
          : req.type === "pick" && req.intent === "discard"
            ? req.options
            : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Toph, the First Metalbender: your nontoken artifacts are also lands; earthbending 2 at your end step", () => {
      const artifact = customCard({
        name: "Test Relic",
        types: ["Artifact"],
        typeLine: "Artifact",
        abilities: [
          dsl.activated({
            effects: [dsl.fx.createTokens({ name: "Clue", colors: [], types: ["Artifact"], subtypes: ["Clue"] })],
            label: "A Clue",
          }),
        ],
      });
      let s = scenario({ p1: { battlefield: ["Toph, the First Metalbender", artifact] } });
      const relic = idOf(s, "p1", "battlefield", "Test Relic");
      expect(chars(s, relic).types).toEqual(expect.arrayContaining(["Artifact", "Land"]));
      s = settle(activate(s, "p1", relic));
      expect(chars(s, idOf(s, "p1", "battlefield", "Clue")).types).toEqual(["Artifact"]);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s, picking([relic]));
      expect(plus(s, relic)).toBe(2);
      expect(chars(s, relic).types).toEqual(expect.arrayContaining(["Artifact", "Land", "Creature"]));
    });

    it("Uncle Iroh: Lesson spells cost {1} less", () => {
      const s = scenario({ p1: { battlefield: ["Uncle Iroh", "Forest"], hand: ["Shared Roots", "Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shared Roots"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Zuko, Conflicted: at the beginning of your first main phase, a mode not yet chosen, and you lose 2 life", () => {
      let s = scenario({ step: "upkeep", p1: { battlefield: ["Zuko, Conflicted"] } });
      let zuko = idOf(s, "p1", "battlefield", "Zuko, Conflicted");
      let offered: string[] = [];
      const pickMode =
        (m: string): Answer =>
        (req) => {
          if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
          offered = req.options.map(String);
          return [m];
        };
      s = advanceUntil(s, (x) => x.turn.step === "main1" && x.pending?.kind === "choice");
      s = settle(s, pickMode("1"));
      expect(offered).toEqual(["0", "1", "2", "3"]);
      expect(plus(s, zuko)).toBe(1);
      expect(s.players.p1?.life).toBe(18);
      // On p1's next turn, the counter is no longer offered; it goes to the opponent.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "choice");
      s = settle(s, pickMode("3"));
      expect(offered).toEqual(["0", "2", "3"]);
      expect(s.players.p1?.life).toBe(16);
      zuko = idOf(s, "p2", "battlefield", "Zuko, Conflicted");
      expect(s.objects[zuko]?.owner).toBe("p1");
      expect(plus(s, zuko)).toBe(0);
    });
  });
});

describe("lot A, colorless cards and lands", () => {
  type S = GameState;
  const BASIC_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

  /** Index of the ability of the object bearing this label. */
  const abilityIndex = (s: S, id: string, label: string) => {
    const i = chars(s, id).abilities.findIndex((ab) => "label" in ab && ab.label === label);
    if (i < 0) throw new Error(`Ability "${label}" not found`);
    return i;
  };
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const canActivate = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some(
      (a) => a.type === "activate" && a.source === source && a.ability === abilityIndex(s, source, label),
    );
  /** Chooses blue when asked for a mana color. */
  const blueMana: Answer = (req) => (req.type === "pick" && req.options.includes("U") ? ["U"] : undefined);
  const handSize = (s: S, p = "p1") => s.players[p]?.hand.length ?? 0;
  const graveyardNames = (s: S, p: string) => (s.players[p]?.graveyard ?? []).map((id) => nameOf(s, id));
  const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });

  /** Test Sanctuary ("Enchantment — Shrine"). */
  const shrine = customCard({
    name: "Test Shrine",
    types: ["Enchantment"],
    typeLine: "Enchantment — Shrine",
    subtypes: ["Shrine"],
  });
  /** "Destroy target artifact" for {0}. */
  const shatter = customCard({
    name: "Test Shatter",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: dsl.spell([dsl.target.permanent("t", ["Artifact"], {}, "artefact")], [dsl.fx.destroy(dsl.ref.target())]),
  });
  /** {W} creature, Ally or not. */
  const whiteCreature = (name: string, subtypes: string[]) =>
    customCard({
      name,
      typeLine: `Creature — ${subtypes.join(" ")}`,
      subtypes,
      manaCost: { generic: 0, colored: { W: 1 }, x: 0 },
      manaCostText: "{W}",
      colors: ["W"],
      power: 1,
      toughness: 1,
    });
  /** {U} sorcery, Lesson or not. */
  const blueSorcery = (name: string, subtypes: string[]) =>
    customCard({
      name,
      types: ["Sorcery"],
      typeLine: subtypes.length ? `Sorcery — ${subtypes.join(" ")}` : "Sorcery",
      subtypes,
      manaCost: { generic: 0, colored: { U: 1 }, x: 0 },
      manaCostText: "{U}",
      colors: ["U"],
      spell: dsl.spell([], [dsl.fx.gainLife(1)]),
    });

  describe("Avatar: The Last Airbender, lot A — colorless cards and lands", () => {
    describe("Aang's Journey", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Aang's Journey"], library: ["Opt", shrine, "Island", "Opt"] },
        });
        s = settle(cast(s, "p1", "Aang's Journey", { kicked }));
        return s;
      };

      it("without kicker: a basic land in hand, and 2 life", () => {
        const s = run(false);
        expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Test Shrine")).toHaveLength(0);
        expect(s.players.p1?.life).toBe(22);
      });

      it("kicked: a basic land and a Sanctuary card", () => {
        const s = run(true);
        expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Test Shrine")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(22);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(4);
      });
    });

    it("Energybending: your lands have all basic land types until end of turn; draw a card", () => {
      let s = scenario({
        p1: { battlefield: ["Cryptic Caves", ...lands("Island", 2)], hand: ["Energybending"] },
        p2: { battlefield: ["Forest"] },
      });
      const caves = idOf(s, "p1", "battlefield", "Cryptic Caves");
      const hand = handSize(s);
      s = settle(cast(s, "p1", "Energybending"));
      expect(handSize(s)).toBe(hand);
      expect(chars(s, caves).subtypes).toEqual(expect.arrayContaining(BASIC_TYPES));
      // 305.6: a land of each basic land type has the corresponding mana ability.
      expect(manaAbilitiesOf(s, caves).flatMap((ab) => ab.produce)).toEqual(
        expect.arrayContaining(["W", "U", "B", "R", "G", "C"]),
      );
      // Opponents' lands are not affected.
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).subtypes).toEqual(["Forest"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, caves).subtypes).toEqual([]);
    });

    it("Zuko's Exile: exiles an artifact, a creature or an enchantment; its controller creates a Clue", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Zuko's Exile"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Zuko's Exile", { targets: { t: [bear] } }));
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(idsOf(s, "p2", "battlefield", "Clue")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);
    });

    describe("Barrels of Blasting Jelly", () => {
      it("{1}: one mana of any color, only once each turn", () => {
        let s = scenario({ p1: { battlefield: ["Barrels of Blasting Jelly", ...lands("Mountain", 2)] } });
        const barrels = idOf(s, "p1", "battlefield", "Barrels of Blasting Jelly");
        const label = "One mana of any color";
        expect(canActivate(s, "p1", barrels, label)).toBe(true);
        s = settle(activate(s, "p1", barrels, label), (req) =>
          req.type === "pick" && req.options.includes("U") ? ["U"] : undefined,
        );
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(canActivate(s, "p1", barrels, label)).toBe(false);
      });

      it("{5}, {T}, sacrifice it: 5 damage to a creature", () => {
        let s = scenario({
          p1: { battlefield: ["Barrels of Blasting Jelly", ...lands("Mountain", 5)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const barrels = idOf(s, "p1", "battlefield", "Barrels of Blasting Jelly");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(activate(s, "p1", barrels, "5 damage to a creature", { targets: { t: [angel] } }));
        expect(graveyardNames(s, "p2")).toContain("Serra Angel");
        expect(graveyardNames(s, "p1")).toContain("Barrels of Blasting Jelly");
      });
    });

    it("Bender's Waterskin: untaps during the opponent's turn and produces one mana of any color", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Bender's Waterskin", tapped: true }] } });
      const skin = idOf(s, "p1", "battlefield", "Bender's Waterskin");
      expect(manaAbilitiesOf(s, skin).flatMap((ab) => ab.produce)).toEqual(["W", "U", "B", "R", "G"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[skin]?.tapped).toBe(false);
    });

    it("Fire Nation Warship: a Clue when it dies, even if it was never equipped (not a creature)", () => {
      let s = scenario({ p1: { battlefield: ["Fire Nation Warship"] }, p2: { hand: [shatter] }, active: "p2" });
      const ship = idOf(s, "p1", "battlefield", "Fire Nation Warship");
      expect(chars(s, ship).keywords).toContain("reach");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Shatter"), targets: { t: [ship] } }));
      expect(graveyardNames(s, "p1")).toContain("Fire Nation Warship");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });

    it("Kyoshi Battle Fan: creates a 1/1 Ally and attaches to it (+1/+0)", () => {
      const s = settle(
        cast(scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Kyoshi Battle Fan"] } }), "p1", "Kyoshi Battle Fan"),
      );
      const ally = idOf(s, "p1", "battlefield", "Ally");
      const fan = idOf(s, "p1", "battlefield", "Kyoshi Battle Fan");
      expect(s.objects[fan]?.attachedTo).toBe(ally);
      expect([chars(s, ally).power, chars(s, ally).toughness, chars(s, ally).colors]).toEqual([2, 1, ["W"]]);
    });

    it("Meteor Sword: destroys a permanent when it enters; the equipped creature gets +3/+3", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 10), "Bear Cub"], hand: ["Meteor Sword"] },
        p2: { battlefield: ["Forest"] },
      });
      const forest = idOf(s, "p2", "battlefield", "Forest");
      s = settle(cast(s, "p1", "Meteor Sword"), picking([forest]));
      expect(graveyardNames(s, "p2")).toEqual(["Forest"]);
      const sword = idOf(s, "p1", "battlefield", "Meteor Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
      expect(equip).toBeDefined();
      const targetId = equip?.type === "activate" ? (equip.targets?.[0]?.id ?? "t") : "t";
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: sword,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { [targetId]: [bear] },
        }),
      );
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
    });

    it("Trusty Boomerang: the equipped creature taps to tap a creature, then the Boomerang returns to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub", "Trusty Boomerang"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const boomerang = idOf(s, "p1", "battlefield", "Trusty Boomerang");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const label = "Tap a creature, then return Trusty Boomerang to hand";
      // Not equipped: the Cub doesn't have the ability.
      expect(chars(s, bear).abilities.some((ab) => "label" in ab && ab.label === label)).toBe(false);
      const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === boomerang);
      const targetId = equip?.type === "activate" ? (equip.targets?.[0]?.id ?? "t") : "t";
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: boomerang,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { [targetId]: [bear] },
        }),
      );
      expect(s.objects[boomerang]?.attachedTo).toBe(bear);
      // "Equipped creature has "{1}, {T}: …"": the ability is the Cub's, which taps.
      expect(chars(s, boomerang).abilities.some((ab) => "label" in ab && ab.label === label)).toBe(false);
      s = settle(activate(s, "p1", bear, label, { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "hand", "Trusty Boomerang")).toHaveLength(1);
    });

    it("The Walls of Ba Sing Se: your other permanents are indestructible, not the opponents'", () => {
      const s = scenario({
        p1: { battlefield: ["The Walls of Ba Sing Se", "Bear Cub", "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const walls = idOf(s, "p1", "battlefield", "The Walls of Ba Sing Se");
      expect(chars(s, walls).keywords).toContain("defender");
      expect(chars(s, walls).keywords).not.toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p1", "battlefield", "Island")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("indestructible");
    });

    describe("Terrains", () => {
      it("Agna Qel'a: tapped without a basic land, untapped with one; {2}{U}, {T}: draw, then discard", () => {
        let s = scenario({ p1: { hand: ["Agna Qel'a"] } });
        s = playLand(s, "Agna Qel'a");
        expect(s.objects[idOf(s, "p1", "battlefield", "Agna Qel'a")]?.tapped).toBe(true);
        s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Agna Qel'a", "Opt"] } });
        s = playLand(s, "Agna Qel'a");
        const agna = idOf(s, "p1", "battlefield", "Agna Qel'a");
        expect(s.objects[agna]?.tapped).toBe(false);
        const hand = handSize(s);
        s = settle(activate(s, "p1", agna, "Draw, then discard a card"));
        expect(handSize(s)).toBe(hand);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.objects[agna]?.tapped).toBe(true);
      });

      it("two-color lands: enter tapped; {4}, {T}, sacrifice them: draw a card", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Airship Engine Room"] } });
        s = playLand(s, "Airship Engine Room");
        const room = idOf(s, "p1", "battlefield", "Airship Engine Room");
        expect(s.objects[room]?.tapped).toBe(true);
        expect(manaAbilitiesOf(s, room).flatMap((ab) => ab.produce)).toEqual(["U", "R"]);
        expect(canActivate(s, "p1", room, "Draw a card")).toBe(false);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        const hand = handSize(s);
        s = settle(activate(s, "p1", room, "Draw a card"));
        expect(handSize(s)).toBe(hand + 1);
        expect(graveyardNames(s, "p1")).toContain("Airship Engine Room");
      });

      it("Fire Nation Palace: a creature gains firebending 4 until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Fire Nation Palace", "Mountain", "Mountain", "Bear Cub"] } });
        const palace = idOf(s, "p1", "battlefield", "Fire Nation Palace");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", palace, "Firebending 4 until end of turn", { targets: { t: [bear] } }));
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p1");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
        expect(s.players.p1?.manaPool.R).toBe(4);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, bear).abilities.some((ab) => "label" in ab && plainText(ab.label ?? "") === "Firebending 4")).toBe(false);
      });

      it("Jasmine Dragon Tea Shop: its colored mana can be spent only on Allies; {5}, {T}: a 1/1 Ally", () => {
        const ally = whiteCreature("Test Ally", ["Human", "Ally"]);
        const other = whiteCreature("Test Squire", ["Human"]);
        let s = scenario({ p1: { battlefield: ["Jasmine Dragon Tea Shop"], hand: [ally, other] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ally"))).toBe(true);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Squire"))).toBe(false);
        s = scenario({ p1: { battlefield: ["Jasmine Dragon Tea Shop", ...lands("Island", 5)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Jasmine Dragon Tea Shop"), "A 1/1 Ally"));
        const token = idOf(s, "p1", "battlefield", "Ally");
        expect([chars(s, token).power, chars(s, token).toughness, chars(s, token).colors]).toEqual([1, 1, ["W"]]);
      });

      it("White Lotus Hideout: its colored mana can be spent only on Lessons and Sanctuaries; {1}, {T}: any color", () => {
        const lesson = blueSorcery("Test Lesson", ["Lesson"]);
        const plain = blueSorcery("Test Ponder", []);
        let s = scenario({ p1: { battlefield: ["White Lotus Hideout"], hand: [lesson, plain] } });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Lesson"))).toBe(true);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(false);
        // {1}, {T}: the Forest pays {1}; that blue mana is used for any spell.
        s = scenario({ p1: { battlefield: ["White Lotus Hideout", "Forest"], hand: [plain] } });
        const hideout = idOf(s, "p1", "battlefield", "White Lotus Hideout");
        s = settle(activate(s, "p1", hideout, "One mana of any color"), blueMana);
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(true);
      });

      it("Rumble Arena: scry 1 when it enters; {1}, {T}: one mana of any color", () => {
        let s = scenario({
          p1: { battlefield: ["Forest"], hand: ["Rumble Arena", blueSorcery("Test Ponder", [])], library: lands("Forest", 3) },
        });
        s = playLand(s, "Rumble Arena");
        expect(s.triggers.length + s.stack.length).toBeGreaterThan(0);
        let scried = false;
        s = settle(s, (req) => {
          scried = true;
          return req.suggested;
        });
        expect(scried).toBe(true);
        const arena = idOf(s, "p1", "battlefield", "Rumble Arena");
        expect(chars(s, arena).keywords).toContain("vigilance");
        expect(manaAbilitiesOf(s, arena).flatMap((ab) => ab.produce)).toEqual(["C"]);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(false);
        // The Forest pays {1}, the Arena gives {U}.
        s = settle(activate(s, "p1", arena, "One mana of any color"), blueMana);
        expect(s.players.p1?.manaPool.U).toBe(1);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Ponder"))).toBe(true);
      });

      it("Secret Tunnel: unblockable; two of your creatures that share a type become unblockable this turn", () => {
        let s = scenario({
          p1: { battlefield: ["Secret Tunnel", ...lands("Forest", 4), "Bear Cub", "Bear Cub", "Serra Angel"] },
        });
        const tunnel = idOf(s, "p1", "battlefield", "Secret Tunnel");
        expect(chars(s, tunnel).keywords).toContain("unblockable");
        const [b1, b2] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        const label = "Two creatures can't be blocked this turn";
        // A Bear and an Angel share no type: targets refused.
        expect(() => activate(s, "p1", tunnel, label, { targets: { t: [b1, angel] } })).toThrow();
        s = settle(activate(s, "p1", tunnel, label, { targets: { t: [b1, b2] } }));
        expect(chars(s, b1).keywords).toContain("unblockable");
        expect(chars(s, b2).keywords).toContain("unblockable");
        expect(chars(s, angel).keywords).not.toContain("unblockable");
      });
    });
  });
});

describe("lot B1: waterbending as a spell cost", () => {
  const yesTo =
    (intent: string, value = 1): Answer =>
    (req) =>
      req.type === "yesNo" && req.intent === intent ? [value] : undefined;

  it("Benevolent River Spirit: waterbending {5} in addition to {U}{U}, payable by tapping its creatures", () => {
    const run = (bears: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...Array(bears).fill("Bear Cub")],
          hand: ["Benevolent River Spirit"],
          library: lands("Island", 3),
        },
      });
    const short = run(4);
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Benevolent River Spirit"))).toBe(false);
    let s = run(5);
    s = settle(cast(s, "p1", "Benevolent River Spirit"));
    expect(idsOf(s, "p1", "battlefield", "Benevolent River Spirit")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Crashing Wave: waterbending {X}, taps X targeted creatures, then three stun counters distributed", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub", "Bear Cub"], hand: ["Crashing Wave"] },
      p2: { battlefield: ["Serra Angel", "Fire Elemental"] },
    });
    const foes = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Fire Elemental")];
    s = settle(cast(s, "p1", "Crashing Wave", { x: 2, targets: { t: foes } }));
    expect(foes.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(foes.reduce((n, id) => n + (s.objects[id]?.counters.stun ?? 0), 0)).toBe(3);
  });

  it("Spirit Water Revival: without waterbending, draw two cards; with waterbending {6}, graveyard shuffled, seven cards, no maximum hand size", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...Array(6).fill("Bear Cub")],
          hand: ["Spirit Water Revival"],
          graveyard: ["Opt", "Opt"],
          library: lands("Island", 10),
        },
      });
    let s = settle(cast(setup(), "p1", "Spirit Water Revival"));
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(exiled(s, "Spirit Water Revival")).toHaveLength(1);
    s = settle(cast(setup(), "p1", "Spirit Water Revival", { kicked: true }));
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(5);
    expect(s.players.p1?.command.some((id) => nameOf(s, id) === "Spirit Water Revival")).toBe(true);
  });

  it("Secret of Bloodbending: you control the opponent only during their next combat phase", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Secret of Bloodbending"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Secret of Bloodbending", { targets: { t: ["p2"] } }));
    expect(s.turnControl).toMatchObject({ player: "p2", by: "p1", combatOnly: true });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(decider(s)).toBe("p2");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    expect(decider(s)).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(decider(s)).toBe("p2");
    expect(s.turnControl).toBeUndefined();
  });

  it("The Unagi of Kyoshi Island: ward is paid by waterbending {4} (the opponent's artifacts and creatures tapped)", () => {
    let s = scenario({
      p1: { battlefield: ["The Unagi of Kyoshi Island"], library: lands("Island", 4) },
      p2: { battlefield: ["Mountain", "Mountain", ...Array(4).fill("Bear Cub")], hand: ["Lightning Strike"] },
      active: "p2",
    });
    const unagi = idOf(s, "p1", "battlefield", "The Unagi of Kyoshi Island");
    s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [unagi] } }), yesTo("unlessPay"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub").filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    expect(s.objects[unagi]?.damage).toBe(3);
  });

  it("Waterbending Lesson: draw three cards, then discard one unless you waterbend {2}", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 4), "Bear Cub", "Bear Cub"],
          hand: ["Waterbending Lesson"],
          library: lands("Island", 5),
        },
      });
    let s = settle(cast(setup(), "p1", "Waterbending Lesson"), yesTo("unlessPay"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = settle(cast(setup(), "p1", "Waterbending Lesson"), yesTo("unlessPay", 0));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Foggy Swamp Visions: exile X creature cards from graveyards, a copy token of each, sacrificed at your next end step", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Foggy Swamp Visions"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "graveyard", "Serra Angel");
    s = settle(cast(s, "p1", "Foggy Swamp Visions", { x: 1, targets: { t: [angel] } }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Ruinous Waterbending: all creatures -2/-2; waterbending {4} paid: 1 life per creature that dies this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...Array(4).fill("Bear Cub")], hand: ["Ruinous Waterbending"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Ruinous Waterbending", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(2);
    expect(s.players.p1?.life).toBe(25);
  });

  it("Hama, the Bloodbender: the opponent mills three cards; the exiled noncreature card is cast during your turn by waterbending {X}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub", "Bear Cub"], hand: ["Hama, the Bloodbender"] },
      p2: { library: ["Lightning Strike", "Bear Cub", "Mountain", "Island"] },
    });
    s = settle(cast(s, "p1", "Hama, the Bloodbender", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.library).toHaveLength(1);
    const strike = exiled(s, "Lightning Strike")[0] as string;
    expect(strike).toBeDefined();
    // Lightning Strike (mana value 2): waterbending {2}, paid by tapping the two Bears.
    expect(castable(s, "p1", strike)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });
});

describe('lot B2: "whenever you bend" (Avatar Aang)', () => {
  const AANG = "Avatar Aang // Aang, Master of Elements";
  /** One ability per element: waterbending {1}, earthbending 1 and airbending (on a targeted permanent). */
  const benders = customCard({
    name: "Test Benders",
    types: ["Enchantment"],
    typeLine: "Enchantment",
    abilities: [
      dsl.activated({ mana: "{1}", waterbend: true, effects: [], label: "water" }),
      dsl.activated({
        targets: [dsl.target.permanent("t", ["Land"], { controller: "you" }, "land")],
        effects: [...dsl.fx.earthbend(dsl.ref.target(), 1)],
        label: "earth",
      }),
      dsl.activated({ targets: [dsl.target.nonland("t")], effects: [dsl.fx.airbend(dsl.ref.target())], label: "air" }),
    ],
  });
  /** Face up: the back face has its own definition (`faceDefId`). */
  const back = (s: S, id: string) => s.defs[s.objects[id]?.faceDefId ?? ""]?.name === "Aang, Master of Elements";
  const use = (s: S, label: string, targets?: Record<string, string[]>) => {
    const src = idOf(s, "p1", "battlefield", "Test Benders");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === src && x.label === label);
    return settle(act(s, "p1", { type: "activate", source: src, ability: a?.type === "activate" ? a.ability : -1, targets }));
  };

  it("each bending (water, earth, air, then fire when attacking) draws; all four this turn transform Aang", () => {
    let s = scenario({
      p1: { battlefield: [AANG, benders, "Island", "Forest", "Bear Cub"], library: lands("Island", 8) },
      p2: { battlefield: ["Bear Cub"] },
    });
    const aang = idOf(s, "p1", "battlefield", AANG);
    const hand = () => s.players.p1?.hand.length ?? 0;
    const h0 = hand();
    s = use(s, "water");
    s = use(s, "earth", { t: [idOf(s, "p1", "battlefield", "Forest")] });
    s = use(s, "air", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] });
    expect(hand()).toBe(h0 + 3);
    expect(back(s, aang)).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: aang, defender: "p2" }] });
    s = settle(s);
    expect(hand()).toBe(h0 + 4);
    expect(back(s, aang)).toBe(true);
  });

  it("Aang, Master of Elements: your spells cost {W}{U}{B}{R}{G} less (the rest reduces the generic)", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({ p1: { battlefield: ["Mountain"], hand: [AANG, "Shivan Dragon"] } });
    moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true });
    // Shivan Dragon {4}{R}{R}: {R} removed by the {R}, {4} by {W}{U}{B}{G}: {R} remains.
    const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
    expect(castable(s, "p1", dragon)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: dragon }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Aang, Master of Elements: at upkeep, transformed, 4 life, four cards, four counters, 4 damage to each opponent", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({ p1: { hand: [AANG], library: lands("Island", 8) }, active: "p2", step: "untap" });
    const aang = moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true }) as string;
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.pending?.kind === "choice");
    s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(back(s, aang)).toBe(false);
    expect(s.players.p1?.life).toBe(24);
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(s.objects[aang]?.counters["+1/+1"]).toBe(4);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("lot C1: characteristics and amounts", () => {
  it("Toph, the Blind Bandit: earthbending 2 when it enters; its power equals the +1/+1 counters on your lands", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), { name: "Plains", counters: { "+1/+1": 1 } }],
        hand: ["Toph, the Blind Bandit"],
      },
    });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = settle(cast(s, "p1", "Toph, the Blind Bandit"), picking([forest]));
    const toph = idOf(s, "p1", "battlefield", "Toph, the Blind Bandit");
    expect(s.objects[forest]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, toph).power).toBe(3);
  });

  it("Earthen Ally: +1/+0 for each color among the Allies you control", () => {
    const s = scenario({ p1: { battlefield: ["Earthen Ally", "Kyoshi Warriors", "Llanowar Elves", "Shivan Dragon"] } });
    // Allies: Earthen Ally (green) and Kyoshi Warriors (white); neither the Elf nor the Dragon counts.
    expect(chars(s, idOf(s, "p1", "battlefield", "Earthen Ally")).power).toBe(2);
  });

  it("Diligent Zookeeper: your non-Human creatures get +1/+1 per creature type (a changeling is Human)", () => {
    const s = scenario({ p1: { battlefield: ["Diligent Zookeeper", "Bear Cub", "Llanowar Elves", "Changeling Wayfinder"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(3);
    // A changeling has all creature types, Human included: it is not affected.
    expect(chars(s, idOf(s, "p1", "battlefield", "Changeling Wayfinder")).power).toBe(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Diligent Zookeeper")).power).toBe(4);
  });

  it("Avatar Destiny: +1/+1 per creature card in the graveyard; when it dies, mill its power, the Aura returns, a milled creature enters", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Bear Cub"],
        hand: ["Avatar Destiny"],
        graveyard: ["Serra Angel", "Llanowar Elves"],
        library: ["Shivan Dragon", "Island", "Island", "Island", "Island", "Island"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Avatar Destiny", { targets: { enchant: [bear] } }));
    expect(chars(s, bear).power).toBe(4);
    expect(chars(s, bear).subtypes).toContain("Avatar");
    destroy(s, bear);
    s = settle(s);
    // Power 4 when it died: four cards milled, including Shivan Dragon, which enters under your control.
    expect(s.players.p1?.library).toHaveLength(2);
    expect(idsOf(s, "p1", "hand", "Avatar Destiny")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("White Lotus Tile: enters tapped; {T}: X mana of one color, X the most creatures sharing a type", () => {
    let s = scenario({
      p1: { hand: ["White Lotus Tile"], battlefield: [...lands("Plains", 4), "Kyoshi Warriors", "Kyoshi Warriors", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "White Lotus Tile"));
    const tile = idOf(s, "p1", "battlefield", "White Lotus Tile");
    expect(s.objects[tile]?.tapped).toBe(true);
    s.objects[tile]!.tapped = false;
    s = settle(activate(s, "p1", tile), (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
    // Two Kyoshi Warriors (Human Warrior Allies) share a type: two green mana.
    expect(s.players.p1?.manaPool.G).toBe(2);
  });

  it("Bumi, King of Three Trials: up to X modes, X being the number of Lessons in your graveyard", () => {
    const modes = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Bumi, King of Three Trials"], graveyard } });
      const after = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bumi, King of Three Trials") });
      const resolved = passAccepting(after, (x) => x.pending?.kind === "choice" || x.stack.length + x.triggers.length === 0);
      const p = resolved.pending;
      return p?.kind === "choice" && p.request.type === "pick" ? p.request.options.length : 0;
    };
    // Without a Lesson: the only mode is "None" (no question).
    expect(modes([])).toBe(0);
    // One Lesson: each mode alone, or none.
    expect(modes(["Shared Roots"])).toBe(4);
    // Three Lessons: all combinations.
    expect(modes(["Shared Roots", "Firebending Lesson", "Combustion Technique"])).toBe(8);
  });
});

describe("lot C2: casting and mana", () => {
  it("Redirect Lightning: pay 5 life (or {2}) and change the target of a single-target spell", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Redirect Lightning"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      active: "p2",
    });
    s = cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    const strike = s.stack[0]?.id as string;
    // A single Mountain: {2} is impossible, 5 life must be paid (the "kicker").
    expect(() => cast(s, "p1", "Redirect Lightning", { targets: { t: [strike] } })).toThrow();
    s = settle(cast(s, "p1", "Redirect Lightning", { kicked: true, targets: { t: [strike] } }), picking(["p2"]));
    expect(s.players.p1?.life).toBe(15);
    expect(s.players.p2?.life).toBe(17);
  });

  it("Sozin's Comet: foretell {2} during your turn, then cast on a later turn for {2}{R}; your creatures have firebending 5", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Sozin's Comet"] } });
    const comet = idOf(s, "p1", "hand", "Sozin's Comet");
    const foretell = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === comet && a.label === "Foretell");
    expect(foretell).toBeDefined();
    s = settle(act(s, "p1", { type: "activate", source: comet, ability: foretell?.type === "activate" ? foretell.ability : -1 }));
    const exiledComet = exiled(s, "Sozin's Comet")[0] as string;
    expect(exiledComet).toBeDefined();
    expect(castable(s, "p1", exiledComet)).toBe(false);
    const turn = s.turn.number;
    s = advanceUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.number > turn && x.turn.step === "main1" && x.pending?.kind === "priority",
    );
    s = settle(act(s, "p1", { type: "cast", card: exiledComet }));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    expect(s.players.p1?.manaPool.R).toBe(5);
  });

  it("The Last Agni Kai: fight; excess damage gives as much {R}, and the red mana doesn't empty this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["The Last Agni Kai"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "The Last Agni Kai", { targets: { a: [angel], b: [bear] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.manaPool.R).toBe(0);
  });

  it("Lo and Li, Twin Tutors: search for a Lesson; your Lesson spells have lifelink", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 5).concat(lands("Mountain", 1)),
        hand: ["Lo and Li, Twin Tutors"],
        library: ["Island", "Firebending Lesson", "Island"],
        life: 10,
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Lo and Li, Twin Tutors"), picking([]));
    const lesson = idOf(s, "p1", "hand", "Firebending Lesson");
    s = settle(act(s, "p1", { type: "cast", card: lesson, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p1?.life).toBe(12);
  });

  it("Iroh, Grand Lotus: during your turn, your instants and sorceries have flashback (Lessons for {1})", () => {
    let s = scenario({
      p1: { battlefield: ["Iroh, Grand Lotus", ...lands("Mountain", 3)], graveyard: ["Lightning Strike", "Firebending Lesson"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    // One Mountain remains: Firebending Lesson for {1} (its Lesson flashback).
    const lesson = idOf(s, "p1", "graveyard", "Firebending Lesson");
    s = settle(act(s, "p1", { type: "cast", card: lesson, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Firebending Lesson")).toHaveLength(1);
  });

  it("Iroh, Grand Lotus: no flashback during the opponent's turn", () => {
    const s = scenario({
      p1: { battlefield: ["Iroh, Grand Lotus", ...lands("Mountain", 3)], graveyard: ["Lightning Strike"] },
      active: "p2",
    });
    expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Lightning Strike"))).toBe(false);
  });

  it("Ozai, the Phoenix King: unspent mana becomes red; six or more: flying and indestructible", () => {
    let s = scenario({ p1: { battlefield: ["Ozai, the Phoenix King", ...lands("Island", 6)] } });
    const ozai = idOf(s, "p1", "battlefield", "Ozai, the Phoenix King");
    for (const id of idsOf(s, "p1", "battlefield", "Island")) {
      const m = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === id);
      s = act(s, "p1", { type: "tapForMana", source: id, ability: m?.type === "tapForMana" ? m.ability : 0, color: "U" });
    }
    expect(chars(s, ozai).keywords).toEqual(expect.arrayContaining(["flying", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.step !== "main1");
    expect(s.players.p1?.manaPool.R).toBe(6);
    expect(s.players.p1?.manaPool.U).toBe(0);
  });

  it("Planetarium of Wan Shi Tong: after a scry, cast the top card for free (once each turn)", () => {
    let s = scenario({
      p1: { battlefield: ["Planetarium of Wan Shi Tong", "Island"], library: ["Lightning Strike", "Opt", "Island"] },
    });
    const planetarium = idOf(s, "p1", "battlefield", "Planetarium of Wan Shi Tong");
    s = act(s, "p1", { type: "activate", source: planetarium, ability: 0 });
    for (let i = 0; i < 40 && !castNowOf(s); i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "pick" ? [] : p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
    }
    const now = castNowOf(s);
    expect(now?.cards).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it('Planetarium of Wan Shi Tong: "do this only once each turn" counts only the card cast by the Planetarium', () => {
    // A spell cast from the library by another effect doesn't use up the limit.
    const TOP = customCard({
      name: "Sort du dessus",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: dsl.spell([], [dsl.fx.castNow(dsl.ref.libraryTop(dsl.ref.you), { free: true })]),
    });
    let s = scenario({
      p1: {
        battlefield: ["Planetarium of Wan Shi Tong", "Island"],
        hand: [TOP, "Opt"],
        library: ["Opt", "Island", "Lightning Strike", "Island", "Island"],
      },
    });
    s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sort du dessus") }));
    s = act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string });
    // Opt (cast from the library): scry 1, the Island stays on top and is drawn; the Planetarium triggers.
    for (let i = 0; i < 40 && !castNowOf(s); i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "pick" ? [] : p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
    }
    const now = castNowOf(s);
    expect(namesIn(s, now?.cards)).toEqual(["Lightning Strike"]);
    s = settle(act(s, "p1", { type: "cast", card: now?.cards[0] as string, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    // The card was cast by the Planetarium: another scry this turn no longer triggers anything.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
    s = settle(s);
    expect(castNowOf(s)).toBeUndefined();
    expect(s.stack).toHaveLength(0);
  });
});

describe("lot C3: unique cards", () => {
  it("Destined Confrontation: each player keeps creatures with total power 4 or less and sacrifices the rest", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Serra Angel", "Bear Cub", "Llanowar Elves"], hand: ["Destined Confrontation"] },
      p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
    });
    const keep = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    const tooMuch = [idOf(s, "p1", "battlefield", "Serra Angel"), ...keep];
    const cast1 = cast(s, "p1", "Destined Confrontation");
    expect(() => settle(cast1, (req, p) => (req.type === "pick" && p === "p1" ? tooMuch : undefined))).toThrow(/Total power/);
    s = settle(cast1, (req, p) => (req.type === "pick" && p === "p1" ? keep : undefined));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    // The opponent's suggestion: the Dragon (power 5) doesn't fit in the limit.
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Destined Confrontation with three players: each player chooses in turn (APNAP), then all sacrifice at the same time", () => {
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Serra Angel"] },
      p2: { battlefield: [...lands("Plains", 4), "Bear Cub", "Llanowar Elves"], hand: ["Destined Confrontation"] },
      p3: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = cast(s, "p2", "Destined Confrontation");
    const field = s.battlefield.length;
    const asked: string[] = [];
    s = settle(s, (req, p, cur) => {
      if (req.type !== "pick" || !cur) return undefined;
      // Each player chooses among their own creatures; nothing is sacrificed before the choices are over.
      expect(cur.battlefield.length).toBe(field);
      asked.push(`${p}:${cur.objects[String(req.options[0])]?.controller}`);
      // p1 keeps their Angel (power 4); p3 keeps nothing.
      return p === "p3" ? [] : undefined;
    });
    expect(asked).toEqual(["p2:p2", "p3:p3", "p1:p1"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p3", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p3", "graveyard", "Savannah Lions")).toHaveLength(1);
  });

  it("Fated Firepower: X fire counters; your sources deal that much additional damage to opponents and their permanents", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Fated Firepower", "Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Fated Firepower", { x: 2 }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Fated Firepower")]?.counters.fire).toBe(2);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(15);
  });

  it("Firebender Ascension: the ability of a creature that attacks adds a quest counter; at four, it is copied", () => {
    const firebender = customCard({ name: "Test Firebender", power: 2, toughness: 2, abilities: [dsl.firebending(1)] });
    let s = scenario({ p1: { battlefield: [{ name: "Firebender Ascension", counters: { quest: 3 } }, firebender] } });
    const asc = idOf(s, "p1", "battlefield", "Firebender Ascension");
    const attacker = idOf(s, "p1", "battlefield", "Test Firebender");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: attacker, defender: "p2" }] });
    // The Ascension resolves first (above the firebending): the ability is copied.
    s = settle(s, (req) => {
      if (req.type === "order") {
        const first = (id: string) => (/quest/.test(req.labels?.[id] ?? "") ? 0 : 1);
        return [...req.items].sort((a, b) => first(a) - first(b));
      }
      return req.type === "yesNo" ? [1] : undefined;
    });
    expect(s.objects[asc]?.counters.quest).toBe(4);
    expect(s.players.p1?.manaPool.R).toBe(2);
  });

  it("Koh, the Face Stealer: exiles a creature; pay 1 life, choose it: Koh has its activated abilities", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Koh, the Face Stealer"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Koh, the Face Stealer"), picking([elves]));
    expect(exiled(s, "Llanowar Elves")).toHaveLength(1);
    const koh = idOf(s, "p1", "battlefield", "Koh, the Face Stealer");
    expect(manaAbilitiesOf(s, koh)).toHaveLength(0);
    s = settle(activate(s, "p1", koh));
    expect(s.players.p1?.life).toBe(19);
    expect(s.objects[koh]?.chosen?.cardName).toBe("Llanowar Elves");
    expect(manaAbilitiesOf(s, koh)).toHaveLength(1);
  });

  it("The Rise of Sozin: I destroys all creatures; II exiles up to four cards with the chosen name from the opponent", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["The Rise of Sozin // Fire Lord Sozin"] },
      p2: {
        battlefield: ["Bear Cub"],
        hand: ["Lightning Strike"],
        library: ["Lightning Strike", "Island"],
        graveyard: ["Lightning Strike"],
      },
    });
    s = settle(cast(s, "p1", "The Rise of Sozin // Fire Lord Sozin"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("Lightning Strike") ? ["Lightning Strike"] : undefined));
    expect(exiled(s, "Lightning Strike")).toHaveLength(3);
  });

  it("Fire Lord Sozin: combat damage to a player, pay X: creatures from their graveyard, with total mana value X or less", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["The Rise of Sozin // Fire Lord Sozin"] },
      p2: { graveyard: ["Bear Cub", "Serra Angel"] },
    });
    const sozin = moveWithSpec(s, "p1", idOf(s, "p1", "hand", "The Rise of Sozin // Fire Lord Sozin"), {
      to: "battlefield",
      transformed: true,
    }) as string;
    s.objects[sozin]!.controlledSince = 0;
    const bear = idOf(s, "p2", "graveyard", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sozin, defender: "p2" }] });
    // Until the second main phase: X = 2, the Bear (mana value 2) returns; the Angel (5) doesn't.
    for (let i = 0; i < 60 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice") {
        const req = p.request;
        const v = req.type === "number" ? [2] : req.type === "pick" && req.options.includes(bear) ? [bear] : req.suggested;
        s = act(s, p.player, { type: "choose", values: v });
      } else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p) s = act(s, p.player, { type: "pass" });
    }
    expect(s.players.p2?.life).toBe(15);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.graveyard.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
  });

  it("Fire Lord Sozin: in multiplayer, the cards come from the damaged player's graveyard (PLAN-A A4a)", async () => {
    const { moveWithSpec } = await import("../src/effects");
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Swamp", 3), hand: ["The Rise of Sozin // Fire Lord Sozin"] },
      p2: { graveyard: ["Bear Cub"] },
      p3: { graveyard: ["Bear Cub", "Llanowar Elves"] },
    });
    const sozin = moveWithSpec(s, "p1", idOf(s, "p1", "hand", "The Rise of Sozin // Fire Lord Sozin"), {
      to: "battlefield",
      transformed: true,
    }) as string;
    s.objects[sozin]!.controlledSince = 0;
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sozin, defender: "p3" }] });
    let offered: string[] = [];
    for (let i = 0; i < 80 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice") {
        const req = p.request;
        if (req.type === "pick" && req.intent === "triggerTarget") offered = req.options.map((id) => s.objects[id]?.owner ?? "");
        const v =
          req.type === "number" ? [3] : req.type === "pick" && req.intent === "triggerTarget" ? req.options : req.suggested;
        s = act(s, p.player, { type: "choose", values: v });
      } else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p) s = act(s, p.player, { type: "pass" });
    }
    // Only the cards from p3's graveyard (the damaged player) are offered.
    expect(offered).toEqual(["p3", "p3"]);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    expect(s.players.p3?.graveyard).toHaveLength(0);
  });
});

describe("Avatar: The Last Airbender: meta cards (PLAN-C, lot C13)", () => {
  /** Activates the ability of `source` whose label contains `label`. */
  const activateLabel = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability });
  };
  const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const spirit = customCard({ name: "Test Spirit", typeLine: "Creature — Spirit", subtypes: ["Spirit"], power: 1, toughness: 1 });

  describe("Abandon Attachments", () => {
    it("you may discard a card; if you do, draw two cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Abandon Attachments", "Forest"], library: ["Opt", "Plains", "Swamp"] },
      });
      s = settle(cast(s, "p1", "Abandon Attachments"), (req, _p, cur) =>
        req.type === "pick" && req.intent === "discard" ? req.options.filter((id) => nameOf(cur, id) === "Forest") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Opt", "Plains"]);
      expect(idsOf(s, "p1", "graveyard", "Abandon Attachments")).toHaveLength(1);
    });

    it("without discarding, no draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Abandon Attachments", "Forest"], library: ["Opt", "Plains"] },
      });
      s = settle(cast(s, "p1", "Abandon Attachments"), (req) =>
        req.type === "pick" && req.intent === "discard" ? [] : req.type === "yesNo" ? [0] : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("empty hand: nothing to discard, so no draw", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Abandon Attachments"], library: ["Opt", "Plains"] } });
      s = settle(cast(s, "p1", "Abandon Attachments"));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });

  describe("Abandoned Air Temple", () => {
    it("enters tapped unless you control a basic land; {T}: {W}", () => {
      const run = (battlefield: string[]) => {
        const s = playLand(scenario({ p1: { battlefield, hand: ["Abandoned Air Temple"] } }), "Abandoned Air Temple");
        return s.objects[idOf(s, "p1", "battlefield", "Abandoned Air Temple")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Realm of Koh"])).toBe(true);
      expect(run(["Island"])).toBe(false);
      let s = scenario({ p1: { battlefield: ["Abandoned Air Temple"], hand: ["Healer's Hawk"] } });
      s = settle(cast(s, "p1", "Healer's Hawk"));
      expect(idsOf(s, "p1", "battlefield", "Healer's Hawk")).toHaveLength(1);
    });

    it("{3}{W}, {T}: a +1/+1 counter on each creature you control (not the opponent's)", () => {
      let s = scenario({
        p1: { battlefield: ["Abandoned Air Temple", ...lands("Plains", 4), "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Abandoned Air Temple"), "counter"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p1", "battlefield", "Abandoned Air Temple")]?.tapped).toBe(true);
    });
  });

  describe("Realm of Koh", () => {
    /** Creates p1's Spirit on turn 3, then goes to the declare attackers step of p1's turn 5. */
    const spiritAttacks = (p2: (string | CardDef)[]) => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: p2 } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Spirit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: token, defender: "p2" }] });
      return { s, token };
    };

    it("enters tapped unless you control a basic land; {T}: {B}", () => {
      const run = (battlefield: string[]) => {
        const s = playLand(scenario({ p1: { battlefield, hand: ["Realm of Koh"] } }), "Realm of Koh");
        return s.objects[idOf(s, "p1", "battlefield", "Realm of Koh")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Swamp"])).toBe(false);
      let s = scenario({ p1: { battlefield: ["Realm of Koh"], hand: ["Vampiric Rites"] } });
      s = settle(cast(s, "p1", "Vampiric Rites"));
      expect(idsOf(s, "p1", "battlefield", "Vampiric Rites")).toHaveLength(1);
    });

    it("{3}{B}, {T}: a colorless 1/1 Spirit token", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Spirit"));
      const tokens = s.battlefield.filter((id) => chars(s, id).name === "Spirit");
      expect(tokens).toHaveLength(1);
      const token = tokens[0] as string;
      expect(s.objects[token]?.isToken).toBe(true);
      expect(chars(s, token).colors).toEqual([]);
      expect(chars(s, token).subtypes).toContain("Spirit");
      expect(pt(s, token)).toEqual([1, 1]);
    });

    it("the token can't be blocked by a non-Spirit creature, but a Spirit can block it", () => {
      const { s, token } = spiritAttacks(["Bear Cub", spirit]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), token)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Test Spirit"), token)).toBe(true);
    });

    it("the token can't block a non-Spirit creature", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Spirit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      expect(canBlock(s, token, bear)).toBe(false);
    });

    it("the token can block a Spirit creature", () => {
      let s = scenario({ p1: { battlefield: ["Realm of Koh", ...lands("Swamp", 4)] }, p2: { battlefield: [spirit] } });
      s = settle(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Realm of Koh"), "Spirit"));
      const token = s.battlefield.find((id) => chars(s, id).name === "Spirit") as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const other = idOf(s, "p2", "battlefield", "Test Spirit");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: other, defender: "p1" }] });
      expect(canBlock(s, token, other)).toBe(true);
    });
  });

  describe("Aang, at the Crossroads // Aang, Destined Savior", () => {
    const AANG = "Aang, at the Crossroads // Aang, Destined Savior";
    const back = (s: S, id: string) => s.defs[s.objects[id]?.faceDefId ?? ""]?.name === "Aang, Destined Savior";

    it("flying; when it enters, among the top five, a creature with MV 4 or less may enter; the rest go to the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Plains", "Island"],
          hand: [AANG],
          library: ["Shivan Dragon", "Bear Cub", "Serra Angel", "Forest", "Llanowar Elves", "Opt"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", AANG), (req, _p, cur) => {
        if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        return req.options.filter((id) => nameOf(cur, id) === "Bear Cub");
      });
      expect(chars(s, idOf(s, "p1", "battlefield", AANG)).keywords).toContain("flying");
      expect(offered.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      const lib = s.players.p1?.library ?? [];
      expect(nameOf(s, lib[0] as string)).toBe("Opt");
      expect(namesIn(s, lib.slice(1)).sort()).toEqual(["Forest", "Llanowar Elves", "Serra Angel", "Shivan Dragon"]);
    });

    it('"you may": no creature is forced to enter', () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Plains", "Island"], hand: [AANG], library: ["Bear Cub", "Forest"] },
      });
      s = settle(cast(s, "p1", AANG), (req) => (req.type === "pick" && req.intent === "lookAtTop" ? [] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("when another of your creatures leaves the battlefield, Aang transforms at the beginning of the next upkeep", () => {
      let s = scenario({ p1: { battlefield: [AANG, "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const aang = idOf(s, "p1", "battlefield", AANG);
      // An opponent's creature that dies doesn't count.
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      s = settle(s);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(back(s, aang)).toBe(false);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      // Not right away: at the beginning of the next upkeep (p1's).
      expect(back(s, aang)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(back(s, aang)).toBe(true);
      expect(chars(s, aang).name).toBe("Aang, Destined Savior");
      expect(chars(s, aang).keywords).toContain("flying");
    });

    it("Aang, Destined Savior: at the beginning of combat, earthbending 2; your land creatures have vigilance", async () => {
      const { moveWithSpec } = await import("../src/effects");
      let s = scenario({ p1: { battlefield: ["Forest"], hand: [AANG] }, p2: { battlefield: ["Forest"] } });
      moveWithSpec(s, "p1", idOf(s, "p1", "hand", AANG), { to: "battlefield", transformed: true });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers", 600);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(s, forest)).toEqual([2, 2]);
      expect(chars(s, forest).keywords).toEqual(expect.arrayContaining(["haste", "vigilance"]));
      // A noncreature or opponent's land doesn't have vigilance.
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("vigilance");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: forest, defender: "p2" }] });
      expect(s.objects[forest]?.tapped).toBe(false);
    });
  });

  describe("Earthbender Ascension", () => {
    /** {0} test instant: "Remove a quest counter from target enchantment." */
    const unquest = customCard({
      name: "Test Unquest",
      types: ["Instant"],
      typeLine: "Instant",
      spell: dsl.spell([dsl.target.permanent("t", ["Enchantment"])], [dsl.fx.removeCounters(dsl.ref.target(), 1, "quest")]),
    });
    /** Plays a Forest with the Ascension at `quest` counters, until the priority after the landfall resolves. */
    const landfall = (quest: number) => {
      let s = scenario({
        p1: { battlefield: [{ name: "Earthbender Ascension", counters: { quest } }, "Bear Cub"], hand: ["Forest", unquest] },
      });
      const asc = idOf(s, "p1", "battlefield", "Earthbender Ascension");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(s.stack).toHaveLength(1);
      // The landfall resolves: a quest counter.
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.stack.every((i) => i.kind === "ability" && !!i.inline));
      return { s, asc, bear };
    };

    it("at the fourth counter, the reflexive ability goes on the stack separately, then +1/+1 and trample", () => {
      const r = landfall(3);
      expect(r.s.objects[r.asc]?.counters.quest).toBe(4);
      expect(r.s.stack).toHaveLength(1);
      expect(r.s.stack[0]?.targets.t).toEqual([r.bear]);
      const s = settle(r.s);
      expect(s.objects[r.bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, r.bear).keywords).toContain("trample");
    });

    it("the condition is rechecked on resolution of the reflexive ability (603.4): a counter removed in response, nothing", () => {
      const r = landfall(3);
      expect(r.s.stack).toHaveLength(1);
      const s = settle(cast(r.s, "p1", "Test Unquest", { targets: { t: [r.asc] } }));
      expect(s.objects[r.asc]?.counters.quest).toBe(3);
      expect(s.objects[r.bear]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, r.bear).keywords).not.toContain("trample");
    });

    it("at the third counter, the reflexive ability doesn't trigger", () => {
      const r = landfall(2);
      expect(r.s.objects[r.asc]?.counters.quest).toBe(3);
      expect(r.s.stack).toHaveLength(0);
    });
  });

  describe("Airbender Ascension", () => {
    it("when it enters, airbending of up to one targeted creature: exiled, its owner can recast it for {2}", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Airbender Ascension"] },
        p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Airbender Ascension"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      const card = exiled(s, "Serra Angel")[0] as string;
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(castable(s, "p2", card)).toBe(true);
    });

    it("each creature that enters under your control adds a quest counter (not the opponent's)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Airbender Ascension"], hand: ["Llanowar Elves", "Llanowar Elves"] },
      });
      const asc = idOf(s, "p1", "battlefield", "Airbender Ascension");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[asc]?.counters.quest).toBe(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[asc]?.counters.quest).toBe(2);
    });

    it("at your end step, with four or more quest counters: exiles one of your creatures then returns it", () => {
      let s = scenario({
        p1: {
          battlefield: [
            { name: "Airbender Ascension", counters: { quest: 4 } },
            { name: "Bear Cub", damage: 1 },
          ],
        },
      });
      const asc = idOf(s, "p1", "battlefield", "Airbender Ascension");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 200);
      s = settle(s, picking([bear]));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).not.toBe(bear);
      expect(s.objects[back]?.damage).toBe(0);
      expect(s.objects[back]?.controller).toBe("p1");
      // The returned creature enters under your control: one more counter.
      expect(s.objects[asc]?.counters.quest).toBe(5);
    });

    it("with three quest counters, nothing happens at the end step", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Airbender Ascension", counters: { quest: 3 } }, "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idOf(s, "p1", "battlefield", "Bear Cub")).toBe(bear);
    });
  });

  describe("Raven Eagle", () => {
    it("flying; when it enters, exiles a card from a graveyard: a creature card gives a Clue", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub", "Opt"] } });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = settle(cast(s, "p1", "Raven Eagle"), picking([bear]));
      const eagle = idOf(s, "p1", "battlefield", "Raven Eagle");
      expect(chars(s, eagle).keywords).toContain("flying");
      expect(pt(s, eagle)).toEqual([2, 3]);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue" && s.objects[id]?.controller === "p1")).toHaveLength(1);
    });

    it('an exiled noncreature card doesn\'t give a Clue; "up to one": the target is optional', () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"], graveyard: ["Opt"] } });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      s = settle(cast(s, "p1", "Raven Eagle"), picking([opt]));
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue")).toHaveLength(0);
      s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Raven Eagle"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("when attacking, also exiles a card from a graveyard (Clue for a creature)", () => {
      let s = scenario({ p1: { battlefield: ["Raven Eagle"] }, p2: { graveyard: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = attack(s, [idOf(s, "p1", "battlefield", "Raven Eagle")]);
      s = settle(s, picking([bear]));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Clue")).toHaveLength(1);
    });

    it("when you draw your second card each turn, each opponent loses 1 life and you gain 1 (once)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Raven Eagle", ...lands("Island", 4)], hand: ["Quick Study", "Opt"], library: lands("Island", 6) },
      });
      s = settle(cast(s, "p1", "Quick Study"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p3?.life).toBe(19);
      // The third card triggers nothing.
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p2?.life).toBe(19);
    });
  });

  describe("Iroh's Demonstration", () => {
    it("first mode: 1 damage to each creature of your opponents (not yours)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Llanowar Elves"], hand: ["Iroh's Demonstration"] },
        p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Iroh's Demonstration")).toHaveLength(1);
    });

    it("second mode: 4 damage to a targeted creature (including one of yours)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["Iroh's Demonstration"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 1, targets: { t: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Serra Angel"], hand: ["Iroh's Demonstration"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Iroh's Demonstration", { mode: 1, targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });
});

describe('"You put counters" (lot K2)', () => {
  it("Earth Kingdom General: \"you put counters on a creature\": even an opponent's, never an opponent's counters", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Earth Kingdom General"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual(["Earth Kingdom General"]);
  });
});

describe('"Up to one" handed to the player (lot K6)', () => {
  const prompts =
    (asked: string[]): Answer =>
    (req) => {
      asked.push(req.type);
      return req.type === "yesNo" ? [0] : undefined;
    };

  it("Hama, the Bloodbender: exiling the milled noncreature, nonland card is optional", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Hama, the Bloodbender"] },
        p2: { library: ["Lightning Strike", "Bear Cub", "Mountain", "Island"] },
      });
    const asked: string[] = [];
    let s = settle(cast(setup(), "p1", "Hama, the Bloodbender", { targets: { t: ["p2"] } }), prompts(asked));
    expect(asked).toEqual(["yesNo"]);
    expect(exiled(s, "Lightning Strike")).toHaveLength(0);
    expect(namesIn(s, s.players.p2?.graveyard)).toContain("Lightning Strike");
    // Without a milled noncreature, nonland card, no question.
    const none: string[] = [];
    s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Hama, the Bloodbender"] },
      p2: { library: ["Bear Cub", "Mountain", "Island", "Island"] },
    });
    s = settle(cast(s, "p1", "Hama, the Bloodbender", { targets: { t: ["p2"] } }), prompts(none));
    expect(none).toEqual([]);
    expect(s.exile).toHaveLength(0);
  });

  it("Avatar Destiny: the milled creature card that returns is optional, and chosen among those milled", () => {
    const setup = () => {
      const s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub"],
          hand: ["Avatar Destiny"],
          library: ["Shivan Dragon", "Serra Angel", "Island", "Island", "Island", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const out = settle(cast(s, "p1", "Avatar Destiny", { targets: { enchant: [bear] } }));
      destroy(out, bear);
      return out;
    };
    // Refusal: the Aura returns to hand, no milled creature enters.
    const asked: string[] = [];
    let s = settle(setup(), prompts(asked));
    expect(asked).toEqual(["yesNo"]);
    expect(idsOf(s, "p1", "hand", "Avatar Destiny")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    // Accepted: the player chooses Serra Angel among the two milled creature cards.
    s = settle(setup(), (req, _p, cur) =>
      req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Serra Angel") : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
  });
});

describe("Avatar: The Last Airbender, PLAN-D D9: last cards", () => {
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Test Lesson sorcery with cost {U}{R}. */
  const lesson = customCard({
    name: "Test Lesson",
    types: ["Sorcery"],
    subtypes: ["Lesson"],
    typeLine: "Sorcery — Lesson",
    manaCost: { generic: 0, colored: { U: 1, R: 1 }, x: 0 },
    manaCostText: "{U}{R}",
    colors: ["U", "R"],
  });
  /** Test sorcery with cost {U}{R}, no subtype. */
  const sorcery = customCard({
    name: "Test Sorcery",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 0, colored: { U: 1, R: 1 }, x: 0 },
    manaCostText: "{U}{R}",
    colors: ["U", "R"],
  });
  /** Test sorcery with cost {B}. */
  const blackOne = customCard({
    name: "Test Black One",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    manaCost: { generic: 0, colored: { B: 1 }, x: 0 },
    manaCostText: "{B}",
    colors: ["B"],
  });
  /** Test artifact: "Sacrifice a permanent: nothing." */
  const altar = customCard({
    name: "Test Altar",
    types: ["Artifact"],
    typeLine: "Artifact",
    abilities: [dsl.activated({ sacrificeOther: { filter: {} }, effects: [], label: "Sacrifice a permanent" })],
  });
  const sacrificeWith = (s: S, player: PlayerId, altarId: string, victim: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === altarId);
    return act(s, player, {
      type: "activate",
      source: altarId,
      ability: a?.type === "activate" ? a.ability : -1,
      sacrifice: [victim],
    });
  };

  it("Hermitic Herbalist: one mana of any color, or two mana of chosen colors only for a Lesson", () => {
    const s = scenario({ p1: { battlefield: ["Hermitic Herbalist"], hand: [lesson, sorcery, blackOne] } });
    // {T}: one mana of any color, for any spell.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Black One"))).toBe(true);
    // {T}: two mana, only for a Lesson spell.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Sorcery"))).toBe(false);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Lesson"))).toBe(true);
    const after = settle(cast(s, "p1", "Test Lesson"));
    expect(idsOf(after, "p1", "graveyard", "Test Lesson")).toHaveLength(1);
    expect(after.objects[idOf(after, "p1", "battlefield", "Hermitic Herbalist")]?.tapped).toBe(true);
  });

  it("Invasion Reinforcements: flash; when it enters, a 1/1 white Ally token", () => {
    let s = scenario({ active: "p2", p1: { battlefield: lands("Plains", 2), hand: ["Invasion Reinforcements"] } });
    s = act(s, "p2", { type: "pass" });
    // Flash: cast during the opponent's turn.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Invasion Reinforcements"))).toBe(true);
    s = settle(cast(s, "p1", "Invasion Reinforcements"));
    expect(pt(s, idOf(s, "p1", "battlefield", "Invasion Reinforcements"))).toEqual([1, 1]);
    const token = idOf(s, "p1", "battlefield", "Ally");
    expect(s.objects[token]?.isToken).toBe(true);
    expect(pt(s, token)).toEqual([1, 1]);
    expect(chars(s, token).colors).toEqual(["W"]);
    expect(chars(s, token).subtypes).toEqual(["Ally"]);
  });

  it("White Lotus Reinforcements: vigilance; your other Allies get +1/+1", () => {
    const s = scenario({
      p1: { battlefield: ["White Lotus Reinforcements", "Invasion Reinforcements", "Bear Cub"] },
      p2: { battlefield: ["Invasion Reinforcements"] },
    });
    const lotus = idOf(s, "p1", "battlefield", "White Lotus Reinforcements");
    expect(chars(s, lotus).keywords).toContain("vigilance");
    // Not itself.
    expect(pt(s, lotus)).toEqual([2, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Invasion Reinforcements"))).toEqual([2, 2]);
    // Neither a creature that isn't an Ally, nor an opponent's Ally.
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Invasion Reinforcements"))).toEqual([1, 1]);
  });

  describe("Zhao, Ruthless Admiral", () => {
    it("firebending 2: when attacking, {R}{R} that remain until end of combat", () => {
      let s = scenario({ p1: { battlefield: ["Zhao, Ruthless Admiral"] } });
      const zhao = idOf(s, "p1", "battlefield", "Zhao, Ruthless Admiral");
      s = attack(s, [zhao]);
      s = advanceUntil(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(2);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.manaPool.R ?? 0).toBe(0);
    });

    it("whenever you sacrifice another permanent, your creatures get +1/+0 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Zhao, Ruthless Admiral", "Serra Angel", "Bear Cub", "Plains", altar] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const zhao = idOf(s, "p1", "battlefield", "Zhao, Ruthless Admiral");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const altarId = idOf(s, "p1", "battlefield", "Test Altar");
      // A sacrificed land counts: "another permanent".
      s = settle(sacrificeWith(s, "p1", altarId, idOf(s, "p1", "battlefield", "Plains")));
      expect(pt(s, zhao)).toEqual([4, 4]);
      expect(pt(s, angel)).toEqual([5, 4]);
      s = settle(sacrificeWith(s, "p1", altarId, idOf(s, "p1", "battlefield", "Bear Cub")));
      expect(pt(s, zhao)).toEqual([5, 4]);
      expect(pt(s, angel)).toEqual([6, 4]);
      // The opponent's creatures gain nothing.
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      // Until end of turn.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, zhao)).toEqual([3, 4]);
    });

    it("a permanent sacrificed by the opponent doesn't trigger it", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Zhao, Ruthless Admiral"] },
        p2: { battlefield: ["Bear Cub", altar] },
      });
      s = settle(sacrificeWith(s, "p2", idOf(s, "p2", "battlefield", "Test Altar"), idOf(s, "p2", "battlefield", "Bear Cub")));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Zhao, Ruthless Admiral"))).toEqual([3, 4]);
    });

    it('Zhao sacrificed itself: "another permanent", no bonus for the others (PLAN-L L4)', () => {
      let s = scenario({ p1: { battlefield: ["Zhao, Ruthless Admiral", "Serra Angel", altar] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(
        sacrificeWith(
          s,
          "p1",
          idOf(s, "p1", "battlefield", "Test Altar"),
          idOf(s, "p1", "battlefield", "Zhao, Ruthless Admiral"),
        ),
      );
      expect(idsOf(s, "p1", "graveyard", "Zhao, Ruthless Admiral")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([4, 4]);
    });
  });
});

describe("Avatar: The Last Airbender: a chosen opponent (PLAN-H H4)", () => {
  it("Zuko, Conflicted: fourth mode, Zuko comes under the control of the chosen opponent; you lose 2 life", () => {
    let s = scenario({ players: 3, step: "upkeep", p1: { battlefield: ["Zuko, Conflicted"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    s = act(s, "p1", { type: "choose", values: ["3"] });
    const offered: string[][] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick" || !req.options.includes("p3")) return undefined;
      offered.push(req.options);
      return ["p3"];
    });
    expect(offered).toEqual([["p2", "p3"]]);
    expect(idsOf(s, "p3", "battlefield", "Zuko, Conflicted")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Zuko, Conflicted")).toHaveLength(0);
    expect(s.players.p1?.life).toBe(18);
    // PLAN-M M8b: he returns directly under p3's control (no control-changing effect afterwards).
    expect(s.effects.some((e) => e.controller)).toBe(false);
    expect(s.turnLog.some((e) => e.e === "zone" && e.to === "battlefield" && e.controller === "p3")).toBe(true);
  });
});
