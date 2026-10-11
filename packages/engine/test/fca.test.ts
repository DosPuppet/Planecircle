/** Through the Ages (FCA): rules tests for the cards (PLAN-G). */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy, drawCards, loseLife } from "../src/actions";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars, moveObject } from "../src/state";
import { plainText } from "../src/text";
import { stateBasedActions } from "../src/turn";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);

describe("Through the Ages", () => {
  describe("Dash (702.109): Ragavan, Nimble Pilferer", () => {
    it("cast for its dash: haste, then returns to hand at the beginning of the next end step", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Ragavan, Nimble Pilferer"] } });
      const card = idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer");
      const opt = castOption(s, card);
      expect(opt?.type === "cast" && plainText(opt.altLabel ?? "")).toBe("Dash — {1}{R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).toContain("haste");
      expect(s.objects[rag]?.cast?.via).toBe("dash");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "hand", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("cast normally: neither haste nor return", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Ragavan, Nimble Pilferer"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ragavan, Nimble Pilferer") }));
      const rag = idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer");
      expect(chars(s, rag).keywords).not.toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")).toHaveLength(1);
    });

    it("combat damage to a player: a Treasure, and the top card of their library exiled, castable this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Ragavan, Nimble Pilferer", ...lands("Forest", 2)] },
        p2: { library: ["Llanowar Elves", "Forest"] },
      });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")]));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const elves = s.exile.find((id) => nameOf(s, id) === "Llanowar Elves") as string;
      expect(elves).toBeDefined();
      expect(castOption(s, elves)).toBeDefined();
    });
  });

  it('Ragavan: "you may cast that card": a land card or a land back face can\'t be played (PLAN-M M8b)', () => {
    const SINK = "Sink into Stupor // Soporific Springs";
    const steal = (top: string) => {
      let s = scenario({
        p1: { battlefield: ["Ragavan, Nimble Pilferer", ...lands("Island", 3)] },
        p2: { battlefield: ["Bear Cub"], library: [top, "Forest"] },
      });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")]));
      return advanceUntil(s, (x) => x.turn.step === "main2");
    };
    const s = steal(SINK);
    const sink = s.exile.find((id) => nameOf(s, id) === SINK) as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === sink)).toBe(false);
    expect(castOption(s, sink)).toBeDefined();
    const t = steal("Forest");
    const forest = t.exile.find((id) => nameOf(t, id) === "Forest") as string;
    expect(forest).toBeDefined();
    expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
  });

  describe("Spectacle (702.137): Light Up the Stage", () => {
    it("the spectacle cost is only offered if an opponent lost life this turn", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Light Up the Stage"], library: lands("Island", 5) } });
      const card = idOf(s, "p1", "hand", "Light Up the Stage");
      let opt = castOption(s, card);
      expect(opt?.type === "cast" && opt.altAvailable).toBeFalsy();
      loseLife(s, "p2", 1);
      opt = castOption(s, card);
      expect(opt?.type === "cast" && plainText(opt.altLabel ?? "")).toBe("Spectacle — {R}");
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      // {R} paid: two Mountains still untapped; the two exiled cards are playable.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(2);
      const exiled = s.exile.filter((id) => nameOf(s, id) === "Island");
      expect(exiled).toHaveLength(2);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && exiled.includes(a.card))).toBe(true);
    });
  });

  describe("Mizzix's Mastery", () => {
    it("overloaded: each instant or sorcery in your graveyard exiled, copied and cast for free", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 8),
          hand: ["Mizzix's Mastery"],
          graveyard: ["Shock", "Shock", "Bear Cub"],
        },
      });
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mizzix's Mastery"), mode: 1 }));
      // Two copies to cast for free; the creature stays in the graveyard.
      for (let i = 0; i < 2; i++) {
        const copy = castNowOf(s)?.cards[0] as string;
        expect(nameOf(s, copy)).toBe("Shock");
        s = untilCastNow(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
        if (i === 0) expect(castNowOf(s)?.cards).toHaveLength(1);
      }
      s = settle(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Mizzix's Mastery", "Shock", "Shock"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("G7: Through the Ages", () => {
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: S, source: string, extra: object = {}, pick?: (a: { label?: string }) => boolean) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source && (!pick || pick(a)));
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Adeline: power equal to the number of your creatures; you attack, a 1/1 Human attacking", () => {
      let s = scenario({ p1: { battlefield: ["Adeline, Resplendent Cathar", "Bear Cub"] } });
      const adeline = idOf(s, "p1", "battlefield", "Adeline, Resplendent Cathar");
      expect(chars(s, adeline).power).toBe(2);
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const human = idOf(s, "p1", "battlefield", "Human");
      expect(s.combat?.attackers.some((a) => a.id === human)).toBe(true);
    });

    it("Ranger-Captain of Eos: sacrificed, your opponents can't cast noncreature spells this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Ranger-Captain of Eos"] },
        p2: { battlefield: ["Mountain", "Forest"], hand: ["Shock", "Llanowar Elves"] },
      });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Ranger-Captain of Eos")));
      expect(castOption(s, idOf(s, "p2", "hand", "Shock"))).toBeUndefined();
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === idOf(s, "p2", "hand", "Shock"))).toBe(false);
    });

    it("Urza: tapping an artifact gives {U}", () => {
      let s = scenario({ p1: { battlefield: ["Urza, Lord High Artificer", "Mana Crypt"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Urza, Lord High Artificer"), ability: 0 });
      expect([s.players.p1?.manaPool.U, s.objects[idOf(s, "p1", "battlefield", "Mana Crypt")]?.tapped]).toEqual([1, true]);
    });

    it("Venser: returns a spell to hand", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Venser, Shaper Savant"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const spellId = s.stack[0]?.id as string;
      s = settle(castIt(s, "Venser, Shaper Savant"), (req) =>
        req.type === "pick" && req.options.includes(spellId) ? [spellId] : undefined,
      );
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Fatal Push: mana value 2 or less, or 4 with revolt", () => {
      const run = (revolt: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Swamp", "Ghostly Prison"], hand: ["Fatal Push"] },
          p2: { battlefield: ["Kalamax, the Stormsire"] },
        });
        if (revolt) destroy(s, idOf(s, "p1", "battlefield", "Ghostly Prison"));
        s = settle(castIt(s, "Fatal Push", { targets: { t: [idOf(s, "p2", "battlefield", "Kalamax, the Stormsire")] } }));
        return idsOf(s, "p2", "battlefield", "Kalamax, the Stormsire").length;
      };
      expect(run(false)).toBe(1);
      expect(run(true)).toBe(0);
    });

    it("Syr Konrad: a creature dies, a creature card leaves your graveyard: 1 damage to each opponent", () => {
      let s = scenario({ p1: { battlefield: ["Syr Konrad, the Grim", "Bear Cub"], graveyard: ["Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      moveObject(s, idOf(s, "p1", "graveyard", "Llanowar Elves"), "exile");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Purphoros: is a creature only with five devotion to red; one of your creatures enters, 2 damage", () => {
      let s = scenario({ p1: { battlefield: ["Purphoros, God of the Forge", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const purph = idOf(s, "p1", "battlefield", "Purphoros, God of the Forge");
      expect(chars(s, purph).types.includes("Creature")).toBe(false);
      s = settle(castIt(s, "Bear Cub"));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Azusa: two more lands each turn", () => {
      let s = scenario({ p1: { battlefield: ["Azusa, Lost but Seeking"], hand: ["Forest", "Forest", "Forest", "Forest"] } });
      for (let i = 0; i < 3; i++) s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(false);
    });

    it("Traxos: untaps when you cast a historic spell", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Traxos, Scourge of Kroog", tapped: true }], hand: ["Mana Crypt"] } });
      s = settle(castIt(s, "Mana Crypt"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Traxos, Scourge of Kroog")]?.tapped).toBe(false);
    });

    it("Kenrith: {2}{W}, the targeted player gains 5 life", () => {
      let s = scenario({ p1: { battlefield: ["Kenrith, the Returned King", ...lands("Plains", 3)] } });
      s = settle(
        activate(
          s,
          idOf(s, "p1", "battlefield", "Kenrith, the Returned King"),
          { targets: { t: ["p1"] } },
          (a) => !!a.label?.includes("5 life"),
        ),
      );
      expect(s.players.p1?.life).toBe(25);
    });

    it("Brainstorm: draw three cards, then put two back on top of the library", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Brainstorm", "Shock"], library: lands("Forest", 5) } });
      s = settle(castIt(s, "Brainstorm"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Cryptic Command: counter and draw", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Cryptic Command"], library: lands("Island", 3) },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const opt = castOption(s, idOf(s, "p1", "hand", "Cryptic Command"));
      const pair =
        opt?.type === "cast"
          ? opt.modes.find((m) => plainText(m.label ?? "").startsWith("Counter") && plainText(m.label ?? "").includes("Draw"))
          : undefined;
      s = settle(castIt(s, "Cryptic Command", { mode: pair?.index, targets: { s: [s.stack[0]?.id as string] } }));
      expect([idsOf(s, "p2", "graveyard", "Bear Cub").length, s.players.p1?.hand.length]).toEqual([1, 1]);
    });

    it("Deadly Dispute: sacrifice an artifact or a creature; two cards and a Treasure", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Deadly Dispute"], library: lands("Swamp", 3) },
      });
      s = settle(castIt(s, "Deadly Dispute", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect([s.players.p1?.hand.length, idsOf(s, "p1", "battlefield", "Treasure").length]).toEqual([2, 1]);
    });

    it("Isshin: an attack trigger triggers one more time", () => {
      let s = scenario({ p1: { battlefield: ["Isshin, Two Heavens as One", "Captain Lannery Storm"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Captain Lannery Storm")]));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    it("Kinnan: a nonland permanent tapped for mana produces one more", () => {
      let s = scenario({ p1: { battlefield: ["Kinnan, Bonder Prodigy", "Llanowar Elves"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Llanowar Elves"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Chromatic Lantern: your lands produce any color", () => {
      const s = scenario({ p1: { battlefield: ["Chromatic Lantern", "Forest"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Forest")).some((a) => a.produce.length === 5)).toBe(true);
    });

    it("Strixhaven Stadium: ten point counters, the opponent loses the game", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Strixhaven Stadium", counters: { point: 9 } }, "Bear Cub"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.over).toBe(true);
      expect(s.winner).toBe("p1");
    });
  });

  describe("G4e: player rules", () => {
    it("Laboratory Maniac: drawing from an empty library wins the game instead", () => {
      const s = scenario({ p1: { battlefield: ["Laboratory Maniac"], library: [] } });
      drawCards(s, "p1", 1);
      stateBasedActions(s);
      expect(s.winner).toBe("p1");
      const t = scenario({ p1: { library: [] } });
      drawCards(t, "p1", 1);
      stateBasedActions(t);
      expect(t.winner).toBe("p2");
    });

    it("Nyxbloom Ancient: a permanent tapped for mana produces three times as much", () => {
      let s = scenario({ p1: { battlefield: ["Nyxbloom Ancient", "Forest", "Llanowar Elves"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(3);
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Llanowar Elves"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(6);
    });

    it("Ancient Copper Dragon: combat damage to a player, a d20 and that many Treasures", () => {
      let s = scenario({ p1: { battlefield: ["Ancient Copper Dragon"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Ancient Copper Dragon")]));
      expect(s.players.p2?.life).toBe(14);
      const treasures = idsOf(s, "p1", "battlefield", "Treasure").length;
      expect(treasures).toBeGreaterThanOrEqual(1);
      expect(treasures).toBeLessThanOrEqual(20);
    });
  });
  describe("G4e: casting otherwise", () => {
    it("Teferi, Mage of Zhalfir: your creatures have flash; opponents can only cast at sorcery speed", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Teferi, Mage of Zhalfir", ...lands("Forest", 2)], hand: ["Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const shock = idOf(s, "p2", "hand", "Shock");
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === shock)).toBe(true);
      s = act(s, "p2", { type: "pass" });
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = act(s, "p1", { type: "pass" });
      expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
      expect(legalActions(s, "p2").some((a) => a.type === "cast" && a.card === shock)).toBe(false);
    });
  });
  describe("G4e: library and drawing", () => {
    it("Atraxa, Grand Unifier: ten cards revealed, one of each card type into your hand", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 7)],
          hand: [customCard({ name: "Test Atraxa", types: ["Creature"], abilities: card("Atraxa, Grand Unifier").abilities })],
          library: ["Bear Cub", "Shivan Dragon", "Forest", "Shock", "Island", "Mana Crypt", "Llanowar Elves", "Lightning Strike"],
        },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test Atraxa") }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest", "Mana Crypt", "Shock"]);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Carpet of Flowers: at the beginning of your main phase, X mana of one color (opponent's Islands)", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Carpet of Flowers"] }, p2: { battlefield: lands("Island", 3) } });
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      const pool = s.players.p1?.manaPool;
      expect(Object.values(pool ?? {}).reduce((a, b) => a + b, 0)).toBe(3);
    });

    it("Carpet of Flowers: in each of your main phases, as long as you haven't added mana with it this turn", () => {
      const total = (x: ReturnType<typeof scenario>) => Object.values(x.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0);
      const atMain2 = (x: ReturnType<typeof scenario>) =>
        x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority";
      const start = () =>
        scenario({ active: "p2", p1: { battlefield: ["Carpet of Flowers"] }, p2: { battlefield: lands("Island", 3) } });
      // Declined in the first main phase: the ability triggers again in the second main phase.
      let s = advanceUntil(start(), (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
      expect(s.turn.step).toBe("main1");
      s = act(s, "p1", { type: "choose", values: [0] });
      s = advanceUntil(s, atMain2);
      expect(total(s)).toBe(3);
      // Accepted in the first main phase: nothing left in the second main phase.
      let t = advanceUntil(start(), (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
      t = advanceUntil(t, (x) => (x.turn.step === "main2" && x.pending?.kind !== "priority") || atMain2(x));
      expect(t.pending?.kind).toBe("priority");
      expect(total(t)).toBe(0);
    });
  });
  describe("G4e: exile and copies", () => {
    it("Winota: a non-Human creature attacks, a Human from the top six cards enters tapped, attacking and indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Winota, Joiner of Forces", "Bear Cub"], library: ["Shock", "Soul Warden", "Forest"] },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = settle(s);
      const warden = idOf(s, "p1", "battlefield", "Soul Warden");
      expect(s.combat?.attackers.some((a) => a.id === warden)).toBe(true);
      expect(chars(s, warden).keywords).toContain("indestructible");
    });

    it("Jodah, the Unifier: your legendary creatures get +X/+X; a legendary spell from hand triggers a legendary cascade", () => {
      const legend = customCard({
        name: "Test Legend",
        supertypes: ["Legendary"],
        types: ["Creature"],
        manaCost: { generic: 1, colored: {}, x: 0 },
        manaCostText: "{1}",
        power: 1,
        toughness: 1,
      });
      let s = scenario({
        p1: {
          battlefield: ["Jodah, the Unifier", ...lands("Forest", 2), "Plains"],
          hand: ["Mirri, Weatherlight Duelist"],
          library: ["Shock", legend, "Forest"],
        },
      });
      const jodah = idOf(s, "p1", "battlefield", "Jodah, the Unifier");
      expect(chars(s, jodah).power).toBe(6);
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mirri, Weatherlight Duelist") }));
      const hit = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, hit)).toBe("Test Legend");
      s = settle(act(s, "p1", { type: "cast", card: hit, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Test Legend")).toHaveLength(1);
      expect(chars(s, jodah).power).toBe(8);
    });

    it("Bolas's Citadel: spells from the top of the library for life equal to their MV; lands too", () => {
      let s = scenario({ p1: { battlefield: ["Bolas's Citadel"], library: ["Shock", "Forest", "Island"] } });
      const shock = s.players.p1?.library[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p2?.life).toBe(18);
      const forest = s.players.p1?.library[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
    });
  });
  describe("G4e: last cards", () => {
    it("Gix, Yawgmoth Praetor: combat damage to an opponent, 1 life to draw; discard X, play X opposing cards", () => {
      let s = scenario({
        p1: {
          battlefield: ["Gix, Yawgmoth Praetor", "Bear Cub", ...lands("Swamp", 7)],
          hand: ["Forest", "Island"],
          library: lands("Plains", 3),
        },
        p2: { library: ["Shock", "Bear Cub", "Forest"] },
      });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(3);
      const gix = idOf(s, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      s = settle(act(s, "p1", { type: "activate", source: gix, ability: 1, x: 2, targets: { t: ["p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      const shock = exiled(s, "Shock")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
    });

    it("Gix, Yawgmoth Praetor: the player chooses the cards discarded for X (PLAN-M M6)", () => {
      let s = scenario({
        p1: { battlefield: ["Gix, Yawgmoth Praetor", ...lands("Swamp", 7)], hand: ["Forest", "Island", "Opt"] },
        p2: { library: ["Shock", "Bear Cub", "Forest"] },
      });
      const gix = idOf(s, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      const offer = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === gix && a.ability === 1);
      const pick = offer?.type === "activate" ? offer.picks?.find((p) => p.slot === "discardX") : undefined;
      expect(pick?.countIsX).toBe(true);
      expect(pick?.options).toHaveLength(3);
      const opt = idOf(s, "p1", "hand", "Opt");
      const island = idOf(s, "p1", "hand", "Island");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: gix,
          ability: 1,
          x: 2,
          targets: { t: ["p2"] },
          picks: { discardX: [opt, island] },
        }),
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt"]);
      // A number of cards other than X: refused.
      const t = scenario({
        p1: { battlefield: ["Gix, Yawgmoth Praetor", ...lands("Swamp", 7)], hand: ["Forest", "Island"] },
        p2: { library: ["Shock", "Bear Cub"] },
      });
      const gix2 = idOf(t, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      expect(() =>
        act(t, "p1", {
          type: "activate",
          source: gix2,
          ability: 1,
          x: 2,
          targets: { t: ["p2"] },
          picks: { discardX: [idOf(t, "p1", "hand", "Forest")] },
        }),
      ).toThrow();
    });
  });
});

describe("Through the Ages: approximations lifted (PLAN-H, H2c)", () => {
  it('Ragavan, Nimble Pilferer: an exiled land can\'t be played ("you may cast this card")', () => {
    let s = scenario({
      p1: { battlefield: ["Ragavan, Nimble Pilferer", ...lands("Forest", 2)] },
      p2: { library: ["Forest", "Llanowar Elves"] },
    });
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Ragavan, Nimble Pilferer")]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(forest).toBeDefined();
    expect(s.turn.landsPlayed).toBe(0);
    expect(legalActions(s, "p1").some((a) => "card" in a && a.card === forest)).toBe(false);
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it("Adeline with three players: one Human per opponent, attacking that player or a planeswalker they control", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Adeline, Resplendent Cathar", "Bear Cub"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }] });
    const asked: string[][] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick" || req.intent !== "other") return undefined;
      asked.push([...req.options].sort());
      return [walker];
    });
    // A question for p3's Human only (p2's has only one possible defender).
    expect(asked).toEqual([["p3", walker].sort()]);
    const humans = idsOf(s, "p1", "battlefield", "Human");
    expect(humans.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender).sort()).toEqual(["p2", walker].sort());
  });

  describe('Mangara, the Diplomat: "if two or more of those creatures attack you, you and/or your planeswalkers"', () => {
    const run = (defenders: ("p1" | "p3" | "walker")[]) => {
      let s = scenario({
        players: 3,
        active: "p2",
        p1: { battlefield: ["Mangara, the Diplomat", "Ajani Resolute"], library: lands("Plains", 5) },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const walker = idOf(s, "p1", "battlefield", "Ajani Resolute");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const hand = s.players.p1?.hand.length ?? 0;
      const ids = ["Bear Cub", "Llanowar Elves"].map((n) => idOf(s, "p2", "battlefield", n));
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: defenders.map((d, i) => ({ id: ids[i] as string, defender: d === "walker" ? walker : d })),
      });
      s = settle(s);
      return (s.players.p1?.hand.length ?? 0) - hand;
    };
    it("two creatures attack you and your planeswalker: draw", () => {
      expect(run(["p1", "p1"])).toBe(1);
      expect(run(["p1", "walker"])).toBe(1);
    });
    it("only one attacks you, the other another player: nothing", () => expect(run(["p1", "p3"])).toBe(0));
  });
});

describe("tokens created attacking for another player (PLAN-H, lot H5)", () => {
  it("Najeela, the Blade-Blossom: the token's controller chooses what it attacks, among their own opponents (508.4)", () => {
    const run = (players: 2 | 3) => {
      let s = scenario({
        players,
        p1: { battlefield: ["Highborn Vampire"] },
        p2: { battlefield: ["Najeela, the Blade-Blossom"] },
      });
      const vampire = idOf(s, "p1", "battlefield", "Highborn Vampire");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: vampire, defender: "p2" }] });
      const asked: [string, string[]][] = [];
      s = settle(s, (req, player) => {
        if (req.intent === "may") return [1];
        if (req.type === "pick") asked.push([player as string, req.options.map(String)]);
        return players === 3 && req.type === "pick" ? ["p3"] : undefined;
      });
      const token = idOf(s, "p1", "battlefield", "Warrior");
      return { asked, defender: s.combat?.attackers.find((a) => a.id === token)?.defender };
    };
    expect(run(2)).toEqual({ asked: [], defender: "p2" });
    expect(run(3)).toEqual({ asked: [["p1", ["p2", "p3"]]], defender: "p3" });
  });
});
