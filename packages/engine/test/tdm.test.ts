/**
 * Tarkir: Dragonstorm (partial set: cards of the meta decks): each handled card is checked against its Oracle text
 * (plan R, lot R7). Harmonize (Channeled Dragonfire, Winternight Stories), mobilize (Stadium Headliner),
 * behold (Dispelling Exhale, Sarkhan), renew (Qarsi Revenant), omen (Twinmaw Stormbrood), Inevitable Defeat,
 * Tersa Lightshatter, Sage of the Skies and Mistrise Village.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { addPlayerEffect } from "../src/statics";
import type { ChoiceRequest, ChoiceValue, GameState, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  castTargets as cast,
  castNowOf,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  passUntil,
  picking,
  scenario,
  settle,
  settleNoBlocks,
  untilCastNow,
} from "./helpers";

type S = GameState;
const activation = (s: S, player: string, source: string) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return a?.type === "activate" ? a.ability : undefined;
};

describe("Tarkir: Dragonstorm", () => {
  describe("Harmonize: Channeled Dragonfire", () => {
    it("from hand for {R}: 2 damage to any target, then the card goes to the graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Channeled Dragonfire"] } });
      s = settle(cast(s, "p1", "Channeled Dragonfire", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Channeled Dragonfire")).toHaveLength(1);
    });

    it("from the graveyard for {5}{R}{R}: a tapped creature with power 5 reduces it to {R}{R}, then the spell is exiled", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Shivan Dragon"], graveyard: ["Channeled Dragonfire"] },
      });
      const card = idOf(s, "p1", "graveyard", "Channeled Dragonfire");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      // Without a tapped creature, two lands don't pay for {5}{R}{R}.
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: ["p2"] }, tap: [] })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] }, tap: [dragon] }));
      expect(s.objects[dragon]?.tapped).toBe(true);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(exiled(s, "Channeled Dragonfire")).toHaveLength(1);
    });
  });

  describe("Winternight Stories", () => {
    it("draw three cards, then discard a single creature card instead of two cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Winternight Stories"], library: ["Bear Cub", "Forest", "Forest"] },
      });
      s = settle(cast(s, "p1", "Winternight Stories"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Winternight Stories"]);
    });

    it("without a creature card, two cards are discarded", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Winternight Stories"], library: lands("Forest", 3) } });
      s = settle(cast(s, "p1", "Winternight Stories"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
    });
  });

  describe("Stadium Headliner", () => {
    it("Mobilize 1: a tapped and attacking red 1/1 Warrior, sacrificed at the beginning of the end step", () => {
      let s = scenario({ p1: { battlefield: ["Stadium Headliner"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const headliner = idOf(s, "p1", "battlefield", "Stadium Headliner");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: headliner, defender: "p2" }] });
      s = settle(s);
      const warriors = idsOf(s, "p1", "battlefield", "Warrior");
      expect(warriors).toHaveLength(1);
      const w = warriors[0] as string;
      expect(s.objects[w]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === w)).toBe(true);
      expect(chars(s, w).colors).toEqual(["R"]);
      expect([chars(s, w).power, chars(s, w).toughness]).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Stadium Headliner")).toHaveLength(1);
    });

    it("{1}{R}, sacrifice: damage equal to the number of creatures controlled on resolution (itself not included)", () => {
      let s = scenario({
        p1: { battlefield: ["Stadium Headliner", "Bear Cub", "Bear Cub", ...lands("Mountain", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const headliner = idOf(s, "p1", "battlefield", "Stadium Headliner");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", {
        type: "activate",
        source: headliner,
        ability: activation(s, "p1", headliner) ?? -1,
        targets: { t: [angel] },
      });
      expect(idsOf(s, "p1", "graveyard", "Stadium Headliner")).toHaveLength(1);
      s = settle(s);
      expect(s.objects[angel]?.damage).toBe(2);
    });
  });

  describe("Behold: Dispelling Exhale", () => {
    const setup = (p2Hand: string[]) =>
      scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Dispelling Exhale", ...p2Hand] },
      });
    const run = (p2Hand: string[]) => {
      let s = setup(p2Hand);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "Dispelling Exhale", { t: [strike] });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      return { s, asked };
    };

    it("without a Dragon: counters the spell unless its controller pays {2}", () => {
      const { s, asked } = run([]);
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(17);
    });

    it("by beholding a Dragon (card revealed from hand): {4} must be paid", () => {
      const { s } = run(["Shivan Dragon"]);
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      // The revealed Dragon stays in hand.
      expect(idsOf(s, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    });
  });

  describe("Sarkhan, Dragon Ascendant", () => {
    it("on entering, beholding a Dragon creates a Treasure; without a Dragon, nothing", () => {
      const run = (hand: string[]) => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Sarkhan, Dragon Ascendant", ...hand] } });
        s = settle(cast(s, "p1", "Sarkhan, Dragon Ascendant"));
        return idsOf(s, "p1", "battlefield", "Treasure").length;
      };
      expect(run(["Shivan Dragon"])).toBe(1);
      expect(run(["Bear Cub"])).toBe(0);
    });

    it("a Dragon enters under your control: a +1/+1 counter, and Sarkhan is a flying Dragon until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Sarkhan, Dragon Ascendant", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      const sarkhan = idOf(s, "p1", "battlefield", "Sarkhan, Dragon Ascendant");
      expect(chars(s, sarkhan).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(s.objects[sarkhan]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, sarkhan).subtypes).toEqual(expect.arrayContaining(["Human", "Druid", "Dragon"]));
      expect(chars(s, sarkhan).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, sarkhan).subtypes).not.toContain("Dragon");
      expect(chars(s, sarkhan).keywords).not.toContain("flying");
      expect(s.objects[sarkhan]?.counters["+1/+1"]).toBe(1);
    });

    it("an opposing Dragon entering triggers nothing", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Sarkhan, Dragon Ascendant"] },
        p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
      });
      s = settle(cast(s, "p2", "Shivan Dragon"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Sarkhan, Dragon Ascendant")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Renew: Qarsi Revenant", () => {
    it("vol, contact mortel et lien de vie", () => {
      const s = scenario({ p1: { battlefield: ["Qarsi Revenant"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Qarsi Revenant")).keywords).toEqual(
        expect.arrayContaining(["flying", "deathtouch", "lifelink"]),
      );
    });

    it("{2}{B}, exiled from the graveyard: flying, deathtouch and lifelink counters on a targeted creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], graveyard: ["Qarsi Revenant"] } });
      const card = idOf(s, "p1", "graveyard", "Qarsi Revenant");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "activate", source: card, ability: activation(s, "p1", card) ?? -1, targets: { t: [bear] } }),
      );
      expect(exiled(s, "Qarsi Revenant")).toHaveLength(1);
      const c = s.objects[bear]?.counters ?? {};
      expect([c.flying, c.deathtouch, c.lifelink]).toEqual([1, 1, 1]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch", "lifelink"]));
    });

    it("sorcery speed only: neither during the opponent's turn, nor with a spell on the stack", () => {
      const s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], graveyard: ["Qarsi Revenant"] },
      });
      const t = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(activation(t, "p1", idOf(t, "p1", "graveyard", "Qarsi Revenant"))).toBeUndefined();
    });
  });

  describe("Inevitable Defeat", () => {
    it("exiles a nonland permanent; its controller loses 3 life and you gain 3; it can't be countered", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", "Swamp"], hand: ["Inevitable Defeat"] },
        p2: { battlefield: ["Serra Angel", ...lands("Island", 2)], hand: ["Disdainful Stroke"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = cast(s, "p1", "Inevitable Defeat", { t: [angel] });
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // The spell is a legal target; the counterspell does nothing.
      s = cast(s, "p2", "Disdainful Stroke", { t: [spell] });
      s = settle(s);
      expect(s.objects[angel]).toBeUndefined();
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("a land is not a legal target", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", "Swamp"], hand: ["Inevitable Defeat"] },
        p2: { battlefield: ["Island"] },
      });
      expect(() => cast(s, "p1", "Inevitable Defeat", { t: [idOf(s, "p2", "battlefield", "Island")] })).toThrow();
    });
  });

  describe("Tersa Lightshatter", () => {
    it("on entering: discard up to two cards, then draw that many", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Tersa Lightshatter", "Opt", "Forest"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "Tersa Lightshatter"), (req) => (req.type === "pick" ? req.options.slice(0, 2) : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island"]);
    });

    it("when attacking with seven cards in the graveyard: a random card is exiled and playable this turn", () => {
      const run = (graveyard: number) => {
        let s = scenario({ p1: { battlefield: ["Tersa Lightshatter"], graveyard: lands("Mountain", graveyard) } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const tersa = idOf(s, "p1", "battlefield", "Tersa Lightshatter");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: tersa, defender: "p2" }] }));
        return s;
      };
      let s = run(7);
      const ex = exiled(s, "Mountain");
      expect(ex).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(6);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === ex[0])).toBe(true);
      s = act(s, "p1", { type: "playLand", card: ex[0] as string });
      expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(1);
      const t = run(6);
      expect(exiled(t, "Mountain")).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(6);
    });
  });

  describe("Sage of the Skies", () => {
    it("cast after another spell this turn: it is copied (the copy becomes a token)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Island"], hand: ["Opt", "Sage of the Skies"], library: lands("Forest", 3) },
      });
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Sage of the Skies"));
      const sages = idsOf(s, "p1", "battlefield", "Sage of the Skies");
      expect(sages).toHaveLength(2);
      expect(sages.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      for (const id of sages) expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    });

    it("first spell of the turn: no copy", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Sage of the Skies"] } });
      s = settle(cast(s, "p1", "Sage of the Skies"));
      expect(idsOf(s, "p1", "battlefield", "Sage of the Skies")).toHaveLength(1);
    });
  });

  describe("Omen: Twinmaw Stormbrood // Charring Bite", () => {
    it("Charring Bite: 5 damage to a creature without flying, then the card is shuffled into the library", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Twinmaw Stormbrood // Charring Bite"], library: lands("Plains", 3) },
        p2: { battlefield: ["Serra Angel", "Fire Elemental"] },
      });
      const card = idOf(s, "p1", "hand", "Twinmaw Stormbrood // Charring Bite");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      // A creature with flying is not a legal target.
      expect(() => act(s, "p1", { type: "cast", card, face: 1, targets: { t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [fire] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Twinmaw Stormbrood // Charring Bite");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Twinmaw Stormbrood: 5/4 flying Dragon; on entering, you gain 5 life", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Twinmaw Stormbrood // Charring Bite"] } });
      s = settle(cast(s, "p1", "Twinmaw Stormbrood // Charring Bite"));
      const dragon = idOf(s, "p1", "battlefield", "Twinmaw Stormbrood // Charring Bite");
      const c = chars(s, dragon);
      expect([c.power, c.toughness]).toEqual([5, 4]);
      expect(c.subtypes).toContain("Dragon");
      expect(c.keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Mistrise Village", () => {
    it("enters tapped, unless you control a Mountain or a Forest", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Mistrise Village"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mistrise Village") }));
        return s.objects[idOf(s, "p1", "battlefield", "Mistrise Village")]?.tapped;
      };
      expect(play(["Island"])).toBe(true);
      expect(play(["Forest"])).toBe(false);
      expect(play(["Mountain"])).toBe(false);
    });

    it("{U}, {T}: the next spell cast this turn can't be countered", () => {
      let s = scenario({
        p1: { battlefield: ["Mistrise Village", "Island", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] },
        p2: { battlefield: lands("Island", 2), hand: ["Disdainful Stroke"] },
      });
      const village = idOf(s, "p1", "battlefield", "Mistrise Village");
      const ability = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === village);
      s = settle(
        act(s, "p1", { type: "activate", source: village, ability: ability?.type === "activate" ? ability.ability : -1 }),
      );
      expect(s.objects[village]?.tapped).toBe(true);
      s = cast(s, "p1", "Shivan Dragon");
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // The spell is a legal target; the counterspell does nothing.
      s = cast(s, "p2", "Disdainful Stroke", { t: [spell] });
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Disdainful Stroke")).toHaveLength(1);
    });
  });
});

describe("Tarkir: Dragonstorm, lot A", () => {
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, targets });

  describe("Devotees", () => {
    it("Mardu Devotee: {1} gives {R}, {W} or {B} of your choice, only once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Mardu Devotee", "Forest", "Forest"] } });
      const devotee = idOf(s, "p1", "battlefield", "Mardu Devotee");
      let options: string[] = [];
      s = settle(activate(s, "p1", devotee), (req) => {
        if (req.intent !== "manaColor" || req.type !== "pick") return undefined;
        options = req.options;
        return ["B"];
      });
      expect(options).toEqual(["R", "W", "B"]);
      expect(s.players.p1?.manaPool.B).toBe(1);
      expect(activation(s, "p1", devotee)).toBeUndefined();
    });
  });

  describe("Dragonstorms", () => {
    it("Teeming Dragonstorm: two 2/2 Soldiers; a Dragon entering under your control returns it to hand", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Teeming Dragonstorm"] } });
      s = settle(cast(s, "p1", "Teeming Dragonstorm"));
      const soldiers = idsOf(s, "p1", "battlefield", "Soldier");
      expect(soldiers).toHaveLength(2);
      expect([chars(s, soldiers[0] as string).power, chars(s, soldiers[0] as string).toughness]).toEqual([2, 2]);
      let t = scenario({ p1: { battlefield: ["Teeming Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
      t = settle(cast(t, "p1", "Shivan Dragon"));
      expect(idsOf(t, "p1", "hand", "Teeming Dragonstorm")).toHaveLength(1);
    });

    it("Breaching Dragonstorm: exiles up to one nonland card and casts it for free (a Dragon returns it)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 5),
          hand: ["Breaching Dragonstorm"],
          library: ["Forest", "Shivan Dragon", "Island"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Breaching Dragonstorm"));
      const dragon = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, dragon)).toBe("Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: dragon, free: true }));
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Breaching Dragonstorm")).toHaveLength(1);
    });

    it("Breaching Dragonstorm: if you decline to cast it, the card goes to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Breaching Dragonstorm"], library: ["Shivan Dragon", "Island"] },
      });
      s = untilCastNow(cast(s, "p1", "Breaching Dragonstorm"));
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Breaching Dragonstorm")).toHaveLength(1);
    });
  });

  describe("Costs", () => {
    it("Caustic Exhale: {1} more without a Dragon to behold", () => {
      const base = (hand: string[]) =>
        scenario({ p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", ...hand] }, p2: { battlefield: ["Bear Cub"] } });
      const s = base([]);
      expect(() => cast(s, "p1", "Caustic Exhale", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      let t = base(["Shivan Dragon"]);
      t = settle(cast(t, "p1", "Caustic Exhale", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Dragon's Prey: {2} more if it targets a Dragon", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Dragon's Prey"] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Dragon's Prey", { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] })).toThrow();
      const t = settle(cast(s, "p1", "Dragon's Prey", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Spectral Denial: {1} less per creature with power 4 or greater; counters unless its controller pays X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island", "Serra Angel"], hand: ["Spectral Denial"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      // X = 1: {1}{U} minus {1} (Serra Angel), paid with a single Island.
      s = cast(s, "p2", "Spectral Denial", { t: [strike] }, { x: 1 });
      s = settle(s);
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Sunpearl Kirin", () => {
    it("returns another of your nonland permanents; if it was a token, draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Mountain", 2)],
          hand: ["Dragon Fodder", "Sunpearl Kirin"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Dragon Fodder"));
      const goblin = idsOf(s, "p1", "battlefield", "Goblin")[0] as string;
      s = settle(cast(s, "p1", "Sunpearl Kirin"), (req) =>
        req.type === "pick" && req.options.includes(goblin) ? [goblin] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    });
  });

  describe("Furious Forebear", () => {
    it("from your graveyard: one of your creatures dies, {1}{W} returns it to hand", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Lightning Strike"],
          graveyard: ["Furious Forebear"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Furious Forebear")).toHaveLength(1);
    });

    it("its own death doesn't trigger it (it wasn't in the graveyard yet)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Furious Forebear"], hand: ["Lightning Strike"] },
      });
      let asked = false;
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Furious Forebear")] }), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      expect(idsOf(s, "p1", "graveyard", "Furious Forebear")).toHaveLength(1);
    });
  });

  describe("Karakyk Guardian", () => {
    it("hexproof as long as it hasn't dealt damage", () => {
      let s = scenario({ p1: { battlefield: ["Karakyk Guardian"] } });
      const g = idOf(s, "p1", "battlefield", "Karakyk Guardian");
      expect(chars(s, g).keywords).toContain("hexproof");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: g, defender: "p2" }] }));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(14);
      expect(chars(s, g).keywords).not.toContain("hexproof");
    });
  });

  describe("Stormscale Scion", () => {
    it("Flood: one copy per spell cast before it this turn; your other Dragons get +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 6), "Island", "Shivan Dragon"],
          hand: ["Opt", "Stormscale Scion"],
          library: lands("Forest", 3),
        },
      });
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Stormscale Scion"));
      const scions = idsOf(s, "p1", "battlefield", "Stormscale Scion");
      expect(scions).toHaveLength(2);
      expect(scions.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      // Each Scion gives +1/+1 to the other and to the Shivan Dragon.
      expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).power).toBe(7);
      expect(chars(s, scions[0] as string).power).toBe(5);
    });
  });

  describe("Venerated Stormsinger", () => {
    it("itself or another of your creatures dies: each opponent loses 1 life, you gain 1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Venerated Stormsinger", "Bear Cub"],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const strikes = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(
        act(s, "p1", { type: "cast", card: strikes[0] as string, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes[1] as string,
          targets: { t: [idOf(s, "p1", "battlefield", "Venerated Stormsinger")] },
        }),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });
  });

  describe("Death Begets Life", () => {
    it("destroys creatures and enchantments; draw a card per permanent destroyed, tokens included", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Forest", "Island", ...lands("Mountain", 2), "Teeming Dragonstorm"],
          hand: ["Dragon Fodder", "Death Begets Life"],
          library: lands("Plains", 8),
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Dragon Fodder"));
      // Teeming Dragonstorm, two Goblins and Serra Angel.
      s = settle(cast(s, "p1", "Death Begets Life"));
      expect(idsOf(s, "p1", "hand", "Plains")).toHaveLength(4);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });
  });

  describe("Host of the Hereafter", () => {
    it("enters with two counters; when one of your creatures with counters dies, its counters go onto one of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), ...lands("Forest", 2), "Bear Cub"],
          hand: ["Host of the Hereafter", "Bake into a Pie"],
        },
      });
      s = settle(cast(s, "p1", "Host of the Hereafter"));
      const host = idOf(s, "p1", "battlefield", "Host of the Hereafter");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[host]?.counters["+1/+1"]).toBe(2);
      s = settle(cast(s, "p1", "Bake into a Pie", { t: [host] }), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Host of the Hereafter")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Effortless Master", () => {
    it("enters with two +1/+1 counters if you cast two or more spells this turn (itself included)", () => {
      const run = (first: boolean) => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 3), ...lands("Mountain", 2)],
            hand: ["Opt", "Effortless Master"],
            library: lands("Forest", 3),
          },
        });
        if (first) s = settle(cast(s, "p1", "Opt"));
        s = settle(cast(s, "p1", "Effortless Master"));
        return s.objects[idOf(s, "p1", "battlefield", "Effortless Master")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(2);
      expect(run(false)).toBe(0);
    });
  });

  describe("Sibsig Appraiser", () => {
    it("look at two cards: exactly one to hand, the other to the graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Sibsig Appraiser"], library: ["Opt", "Forest", "Island"] },
      });
      s = cast(s, "p1", "Sibsig Appraiser");
      let min = -1;
      s = settle(s, (req) => {
        if (req.intent === "lookAtTop" && req.type === "pick") min = req.min;
        return undefined;
      });
      expect(min).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
    });
  });

  describe("Monuments", () => {
    it("Abzan Monument: searches for a basic Plains, Swamp or Forest; sacrificed, an X/X Spirit (greatest toughness)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 4), "Swamp", "Forest", "Serra Angel"],
          hand: ["Abzan Monument"],
          library: ["Island", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Abzan Monument"));
      expect(idsOf(s, "p1", "hand", "Swamp")).toHaveLength(1);
      const monument = idOf(s, "p1", "battlefield", "Abzan Monument");
      s = settle(activate(s, "p1", monument));
      const spirit = idsOf(s, "p1", "battlefield", "Spirit")[0] as string;
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([4, 4]);
      expect(chars(s, spirit).colors).toEqual(["W"]);
    });
  });

  describe("Embermouth Sentinel", () => {
    it("without a Dragon, the basic land found is put on top of the library after shuffling; with a Dragon, onto the battlefield tapped", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({
          p1: {
            battlefield: ["Island", "Island", ...battlefield],
            hand: ["Embermouth Sentinel"],
            library: [...lands("Island", 6), "Mountain"],
          },
        });
        s = settle(cast(s, "p1", "Embermouth Sentinel"), (req, _p) =>
          req.type === "yesNo"
            ? [1]
            : req.intent === "search" && req.type === "pick"
              ? [req.options.find((o) => nameOf(s, o) === "Mountain") as string]
              : undefined,
        );
        return s;
      };
      const s = run([]);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
      const t = run(["Shivan Dragon"]);
      const m = idsOf(t, "p1", "battlefield", "Mountain");
      expect(m).toHaveLength(1);
      expect(t.objects[m[0] as string]?.tapped).toBe(true);
    });
  });

  describe("Nature's Rhythm", () => {
    it("X = 2: a creature card with mana value 2 or less put onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Nature's Rhythm"], library: ["Serra Angel", "Bear Cub", "Forest"] },
      });
      let options: string[] = [];
      s = settle(cast(s, "p1", "Nature's Rhythm", {}, { x: 2 }), (req) => {
        if (req.intent === "search" && req.type === "pick") options = req.options.map((o) => nameOf(s, o) as string);
        return undefined;
      });
      expect(options).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Severance Priest", () => {
    it("exiles a nonland card from the opponent's hand; when it leaves, the opponent creates an X/X Spirit (X: its mana value)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), "Forest", ...lands("Mountain", 2)],
          hand: ["Severance Priest", "Lightning Strike"],
        },
        p2: { hand: ["Serra Angel", "Forest"] },
      });
      s = settle(cast(s, "p1", "Severance Priest", { t: ["p2"] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Severance Priest")] }));
      const spirit = idsOf(s, "p2", "battlefield", "Spirit")[0] as string;
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([5, 5]);
    });
  });

  describe("Flamehold Grappler", () => {
    it("the next spell cast this turn is copied", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", ...lands("Mountain", 2), ...lands("Plains", 2)],
          hand: ["Flamehold Grappler", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Flamehold Grappler"));
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(14);
    });
  });

  describe("Ainok Wayfarer", () => {
    it("mill three cards: a land to hand; with no land taken, a +1/+1 counter", () => {
      const run = (library: string[], take: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Ainok Wayfarer"], library } });
        s = settle(cast(s, "p1", "Ainok Wayfarer"), (req) =>
          req.type === "pick" && req.intent === "pickCards" && !take ? [] : undefined,
        );
        return s;
      };
      const s = run(["Opt", "Forest", "Bear Cub"], true);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ainok Wayfarer")]?.counters["+1/+1"] ?? 0).toBe(0);
      const t = run(["Opt", "Opt", "Bear Cub"], true);
      expect(t.objects[idOf(t, "p1", "battlefield", "Ainok Wayfarer")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Dragonologist", () => {
    it("your untapped Dragons have hexproof", () => {
      const s = scenario({ p1: { battlefield: ["Dragonologist", "Shivan Dragon", { name: "Shivan Dragon", tapped: true }] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(chars(s, a as string).keywords).toContain("hexproof");
      expect(chars(s, b as string).keywords).not.toContain("hexproof");
    });
  });
});

describe("Tarkir: Dragonstorm, lot B", () => {
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, targets });
  const endureAnswer =
    (choice: "counters" | "token"): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes("counters") ? [choice] : undefined;

  describe("Endurance (701.64)", () => {
    it("Fortress Kin-Guard: a +1/+1 counter on it, or a 1/1 white Spirit token, your choice", () => {
      const run = (choice: "counters" | "token") => {
        let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Fortress Kin-Guard"] } });
        s = settle(cast(s, "p1", "Fortress Kin-Guard"), endureAnswer(choice));
        return s;
      };
      const s = run("counters");
      expect(s.objects[idOf(s, "p1", "battlefield", "Fortress Kin-Guard")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(0);
      const t = run("token");
      const spirit = idsOf(t, "p1", "battlefield", "Spirit")[0] as string;
      expect([chars(t, spirit).power, chars(t, spirit).toughness]).toEqual([1, 1]);
      expect(chars(t, spirit).colors).toEqual(["W"]);
      expect(t.objects[idOf(t, "p1", "battlefield", "Fortress Kin-Guard")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("a permanent no longer on the battlefield creates the token (Anafenza dead at the same time)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), ...lands("Swamp", 4), "Anafenza, Unyielding Lineage", "Bear Cub"],
          hand: ["Bake into a Pie"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Bear Cub dies: Anafenza endures 2; the counters are chosen.
      s = settle(cast(s, "p1", "Bake into a Pie", { t: [bear] }), endureAnswer("counters"));
      const anafenza = idOf(s, "p1", "battlefield", "Anafenza, Unyielding Lineage");
      expect(s.objects[anafenza]?.counters["+1/+1"]).toBe(2);
    });

    it("Warden of the Grove: another nontoken creature enters, it endures X (counters on Warden)", () => {
      let s = scenario({ p1: { battlefield: ["Warden of the Grove", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const warden = idOf(s, "p1", "battlefield", "Warden of the Grove");
      (s.objects[warden] as { counters: Record<string, number> }).counters["+1/+1"] = 2;
      s = settle(cast(s, "p1", "Bear Cub"), endureAnswer("counters"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
    });

    it("Sinkhole Surveyor: when attacking, you lose 1 life and it endures 1", () => {
      let s = scenario({ p1: { battlefield: ["Sinkhole Surveyor"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const sv = idOf(s, "p1", "battlefield", "Sinkhole Surveyor");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: sv, defender: "p2" }] }), endureAnswer("token"));
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
    });
  });

  describe("Rafale (Flurry)", () => {
    it("Devoted Duelist: only on the second spell of the turn", () => {
      let s = scenario({
        p1: { battlefield: ["Devoted Duelist", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"], library: lands("Forest", 5) },
      });
      const opts = idsOf(s, "p1", "hand", "Opt");
      s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
      expect(s.players.p2?.life).toBe(20);
      s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
      expect(s.players.p2?.life).toBe(19);
      s = settle(act(s, "p1", { type: "cast", card: opts[2] as string }));
      expect(s.players.p2?.life).toBe(19);
    });
  });

  describe("Renew", () => {
    it("Sage of the Fang: a +1/+1 counter, then double the +1/+1 counters on the creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], graveyard: ["Sage of the Fang"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 2;
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Sage of the Fang"), { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(6);
      expect(exiled(s, "Sage of the Fang")).toHaveLength(1);
    });
  });

  describe("Omens", () => {
    it("Exude Toxin: each non-Dragon creature gets -X/-X; the card returns to the library", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Scavenger Regent // Exude Toxin"], library: lands("Plains", 2) },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const card = idOf(s, "p1", "hand", "Scavenger Regent // Exude Toxin");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, x: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Scavenger Regent // Exude Toxin");
    });

    it("Bloomvine Regent: it or another of your Dragons enters, you gain 3 life", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), ...lands("Mountain", 6)],
          hand: ["Bloomvine Regent // Claim Territory", "Shivan Dragon"],
        },
      });
      s = settle(cast(s, "p1", "Bloomvine Regent // Claim Territory"));
      expect(s.players.p1?.life).toBe(23);
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(s.players.p1?.life).toBe(26);
    });
  });

  describe("Sieges", () => {
    const enterSiege = (
      name: string,
      mode: string,
      battlefield: string[],
      extra: Partial<Parameters<typeof scenario>[0]> = {},
    ) => {
      let s = scenario({ ...extra, p1: { battlefield, hand: [name], ...(extra.p1 ?? {}) } });
      let options: string[] = [];
      s = settle(cast(s, "p1", name), (req) => {
        if (req.intent !== "chooseOnEnter" || req.type !== "pick") return undefined;
        options = req.options;
        return [mode];
      });
      return { s, options };
    };

    it("Barrensteppe Siege: choice between Abzan and Mardu; Abzan puts a +1/+1 counter on your creatures at your end step", () => {
      const { s, options } = enterSiege("Barrensteppe Siege", "Abzan", [...lands("Plains", 2), ...lands("Swamp", 2), "Bear Cub"]);
      expect(options).toEqual(["Abzan", "Mardu"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Barrensteppe Siege")]?.chosen?.mode).toBe("Abzan");
      const t = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    });

    it("Barrensteppe Siege, Mardu: one of your creatures died this turn, each opponent sacrifices a creature", () => {
      let { s } = enterSiege(
        "Barrensteppe Siege",
        "Mardu",
        [...lands("Plains", 2), ...lands("Swamp", 2), ...lands("Mountain", 2), "Bear Cub"],
        {
          p2: { battlefield: ["Serra Angel"] },
        },
      );
      const t0 = advanceUntil(s, (x) => x.turn.active === "p2");
      // No death this turn: nothing.
      expect(idsOf(t0, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Bear Cub", "Barrensteppe Siege"], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const siege = idOf(s, "p1", "battlefield", "Barrensteppe Siege");
      (s.objects[siege] as { chosen?: { mode?: string } }).chosen = { mode: "Mardu" };
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Glacierwood Siege, Sultai: you may play lands from your graveyard", () => {
      const { s } = enterSiege("Glacierwood Siege", "Sultai", [...lands("Forest", 2), "Island"], {
        p1: { graveyard: ["Swamp"] },
      });
      const swamp = idOf(s, "p1", "graveyard", "Swamp");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === swamp)).toBe(true);
    });

    it("Windcrag Siege, Mardu: an attacking creature triggers twice (mobilize)", () => {
      let s = scenario({ p1: { battlefield: ["Windcrag Siege", "Shock Brigade"] } });
      const siege = idOf(s, "p1", "battlefield", "Windcrag Siege");
      (s.objects[siege] as { chosen?: { mode?: string } }).chosen = { mode: "Mardu" };
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const brigade = idOf(s, "p1", "battlefield", "Shock Brigade");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: brigade, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    });
  });

  describe("Whirlwing Stormbrood", () => {
    it("your sorceries and Dragon spells are cast as though they had flash", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Whirlwing Stormbrood // Dynamic Soar", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] },
      });
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Shivan Dragon")).toBe(true);
    });
  });
});

describe("Tarkir: Dragonstorm, lot C", () => {
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: activation(s, player, source) ?? -1, ...extra });
  const loyaltyAbility = (s: S, source: string, n: number) => {
    const acts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === source);
    return acts[n]?.type === "activate" ? acts[n].ability : -1;
  };

  describe("Ugin, Eye of the Storms", () => {
    it("when cast, exiles up to one colored permanent; a colorless spell cast afterwards exiles another", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Ugin, Eye of the Storms", "Mox Jasper"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub", "Mox Jasper"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Ugin, Eye of the Storms"), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      // The colorless artifact is not a target.
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Mox Jasper"), (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mox Jasper")).toHaveLength(1);
    });
  });

  describe("Elspeth, Storm Slayer", () => {
    it("+1: two Soldiers (doubled tokens); 0: a +1/+1 counter and flying until your next turn", () => {
      let s = scenario({ p1: { battlefield: ["Elspeth, Storm Slayer", "Bear Cub"] } });
      const elspeth = idOf(s, "p1", "battlefield", "Elspeth, Storm Slayer");
      s = settle(act(s, "p1", { type: "activate", source: elspeth, ability: loyaltyAbility(s, elspeth, 0) }));
      expect(idsOf(s, "p1", "battlefield", "Soldier")).toHaveLength(2);
      let t = scenario({ p1: { battlefield: ["Elspeth, Storm Slayer", "Bear Cub"] } });
      const e2 = idOf(t, "p1", "battlefield", "Elspeth, Storm Slayer");
      t = settle(act(t, "p1", { type: "activate", source: e2, ability: loyaltyAbility(t, e2, 1) }));
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(t.objects[bear]?.counters["+1/+1"]).toBe(1);
      t = advanceUntil(t, (x) => x.turn.active === "p2");
      expect(chars(t, bear).keywords).toContain("flying");
      t = advanceUntil(t, (x) => x.turn.active === "p1");
      expect(chars(t, bear).keywords).not.toContain("flying");
    });
  });

  describe("Taigam, Master Opportunist (suspension)", () => {
    it("the second spell is copied, then exiled with four time counters; at the last, it's cast for free", () => {
      let s = scenario({
        p1: {
          battlefield: ["Taigam, Master Opportunist", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const strikes = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card: strikes[0] as string, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      s = settle(act(s, "p1", { type: "cast", card: strikes[1] as string, targets: { t: ["p2"] } }));
      // The copy resolves; the original is exiled, suspended.
      expect(s.players.p2?.life).toBe(14);
      const susp = exiled(s, "Lightning Strike");
      expect(susp).toHaveLength(1);
      expect(s.objects[susp[0] as string]?.counters.time).toBe(4);
      // Three upkeeps: one counter fewer at each.
      for (let k = 3; k >= 1; k--) {
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(s.objects[exiled(s, "Lightning Strike")[0] as string]?.counters.time).toBe(k);
      }
      // Fourth upkeep: the last counter is removed, the card can be cast for free.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = untilCastNow(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep"));
      const card = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, card)).toBe("Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(11);
    });
  });

  describe("Hundred-Battle Veteran", () => {
    it("+2/+4 with three kinds of counters among your creatures; cast from the graveyard with a finality counter", () => {
      const s = scenario({ p1: { battlefield: ["Hundred-Battle Veteran", "Bear Cub"] } });
      const vet = idOf(s, "p1", "battlefield", "Hundred-Battle Veteran");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, vet).power).toBe(4);
      const c = (s.objects[bear] as { counters: Record<string, number> }).counters;
      c["+1/+1"] = 1;
      c.flying = 1;
      c.stun = 1;
      s.version += 1;
      expect([chars(s, vet).power, chars(s, vet).toughness]).toEqual([6, 6]);
      let t = scenario({ p1: { battlefield: lands("Swamp", 4), graveyard: ["Hundred-Battle Veteran"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "Hundred-Battle Veteran") }));
      expect(t.objects[idOf(t, "p1", "battlefield", "Hundred-Battle Veteran")]?.counters.finality).toBe(1);
    });
  });

  describe("Krumar Initiate", () => {
    it("{X}{B}, {T}, payez X PV : endurance X", () => {
      let s = scenario({ p1: { battlefield: ["Krumar Initiate", ...lands("Swamp", 3)] } });
      const k = idOf(s, "p1", "battlefield", "Krumar Initiate");
      s = settle(activate(s, "p1", k, { x: 2 }), (req) =>
        req.type === "pick" && req.options.includes("counters") ? ["counters"] : undefined,
      );
      expect(s.players.p1?.life).toBe(18);
      expect(s.objects[k]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Rot-Curse Rakshasa (decayed)", () => {
    it("renew: a decayed counter on exactly X creatures; they can't block anymore", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), graveyard: ["Rot-Curse Rakshasa"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "graveyard", "Rot-Curse Rakshasa");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // X = 2 with a single target: refused.
      expect(() => activate(s, "p1", card, { x: 2, targets: { t: [bear] } })).toThrow();
      s = settle(activate(s, "p1", card, { x: 2, targets: { t: [bear, angel] } }));
      expect(s.objects[bear]?.counters.decayed).toBe(1);
      expect(chars(s, angel).keywords).toContain("decayed");
    });

    it("decayed: the creature attacks, then is sacrificed at end of combat", () => {
      let s = scenario({ p1: { battlefield: ["Rot-Curse Rakshasa"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const r = idOf(s, "p1", "battlefield", "Rot-Curse Rakshasa");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: r, defender: "p2" }] }));
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(15);
      expect(idsOf(s, "p1", "graveyard", "Rot-Curse Rakshasa")).toHaveLength(1);
    });
  });

  describe("The Sibsig Ceremony", () => {
    it("your creature spells cost {2} less; a cast creature that enters is destroyed and replaced by a Zombie Druid", () => {
      let s = scenario({ p1: { battlefield: ["The Sibsig Ceremony", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] } });
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Zombie Druid")).toHaveLength(1);
    });
  });

  describe("Sidisi, Regent of the Mire", () => {
    it("sacrifice a creature with MV X: a creature card with MV X + 1 returns from the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sidisi, Regent of the Mire", "Bear Cub"],
          graveyard: ["Serra Angel", "Dragonologist", "Fortress Kin-Guard"],
        },
      });
      const sidisi = idOf(s, "p1", "battlefield", "Sidisi, Regent of the Mire");
      // Only possible target (MV 3): chosen automatically.
      s = settle(activate(s, "p1", sidisi));
      expect(idsOf(s, "p1", "battlefield", "Dragonologist")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Dracogenesis", () => {
    it("your Dragon spells are cast without paying their mana cost", () => {
      const s = scenario({ p1: { battlefield: ["Dracogenesis"], hand: ["Shivan Dragon", "Serra Angel"] } });
      const t = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shivan Dragon"), free: true }));
      expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(() => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Serra Angel"), free: true })).toThrow();
    });
  });

  describe("Formation Breaker", () => {
    it("creatures with power less than its own can't block it", () => {
      let s = scenario({ p1: { battlefield: ["Formation Breaker"] }, p2: { battlefield: ["Llanowar Elves", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const fb = idOf(s, "p1", "battlefield", "Formation Breaker");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: fb, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Llanowar Elves"), attacker: fb }],
        }),
      ).toThrow();
      const t = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: fb }],
      });
      expect(t.combat?.blockers).toHaveLength(1);
    });
  });

  describe("All-Out Assault", () => {
    it("cast in main phase 1: an additional combat and main phase, then the normal combat", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Plains", ...lands("Swamp", 2), "Bear Cub"], hand: ["All-Out Assault"] },
      });
      s = settle(cast(s, "p1", "All-Out Assault"));
      const steps: string[] = [];
      for (let i = 0; i < 400 && s.turn.active === "p1"; i++) {
        if (steps[steps.length - 1] !== s.turn.step) steps.push(s.turn.step);
        const p = s.pending;
        if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
        else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else break;
      }
      expect(steps.filter((x) => x === "beginCombat")).toHaveLength(2);
      expect(steps.indexOf("main1")).toBeLessThan(steps.indexOf("beginCombat"));
      expect(steps.filter((x) => x === "main1").length + steps.filter((x) => x === "main2").length).toBe(3);
    });
  });

  describe("Call the Spirit Dragons", () => {
    it("a +1/+1 counter on a Dragon of each color; five different Dragons: you win", () => {
      let s = scenario({
        active: "p2",
        p1: {
          battlefield: [
            "Call the Spirit Dragons",
            "Riling Dawnbreaker // Signaling Roar",
            "Dirgur Island Dragon // Skimming Strike",
            "Scavenger Regent // Exude Toxin",
            "Shivan Dragon",
            "Sagu Wildling // Roost Seek",
          ],
        },
      });
      s = advanceUntil(s, (x) => x.over || (x.turn.active === "p1" && x.turn.step === "main1"));
      expect(s.over).toBe(true);
      expect(s.winner).toBe("p1");
    });
  });

  describe("Felothar, Dawn of the Abzan", () => {
    it("on entering, you may sacrifice a nonland permanent: a +1/+1 counter on each of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 1), ...lands("Swamp", 1), "Forest", "Bear Cub", "Dragonstorm Globe"],
          hand: ["Felothar, Dawn of the Abzan"],
        },
      });
      const globe = idOf(s, "p1", "battlefield", "Dragonstorm Globe");
      s = settle(cast(s, "p1", "Felothar, Dawn of the Abzan"), (req) =>
        req.type === "pick" && req.options.includes(globe) ? [globe] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Dragonstorm Globe")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Kotis, the Fangkeeper", () => {
    it("deals damage to a player: exile X cards from their library, cast those with MV X or less for free", () => {
      let s = scenario({ p1: { battlefield: ["Kotis, the Fangkeeper"] }, p2: { library: ["Serra Angel", "Opt", "Forest"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const k = idOf(s, "p1", "battlefield", "Kotis, the Fangkeeper");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: k, defender: "p2" }] });
      s = untilCastNow(s);
      const req = castNowOf(s);
      expect(req?.cards.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Narset, Jeskai Waymaster", () => {
    it("at your end step, discard your hand to draw a card per spell cast this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Narset, Jeskai Waymaster", ...lands("Island", 2)],
          hand: ["Opt", "Opt", "Forest"],
          library: lands("Plains", 6),
        },
      });
      for (const id of idsOf(s, "p1", "hand", "Opt")) s = settle(act(s, "p1", { type: "cast", card: id }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 200);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand.filter((id) => nameOf(s, id) === "Plains")).toHaveLength(2);
    });
  });

  describe("Roar of Endless Song", () => {
    it("chapter III: the power and toughness of each of your creatures are doubled", () => {
      let s = scenario({ p1: { battlefield: ["Roar of Endless Song", "Bear Cub", "Serra Angel"] } });
      const roar = idOf(s, "p1", "battlefield", "Roar of Endless Song");
      (s.objects[roar] as { counters: Record<string, number> }).counters.lore = 2;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([8, 8]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(4);
    });
  });

  describe("Shiko, Paragon of the Way", () => {
    it("exiles a nonland card with MV 3 or less from your graveyard and casts a copy without paying", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), "Mountain", "Plains"],
          hand: ["Shiko, Paragon of the Way"],
          graveyard: ["Lightning Strike"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Shiko, Paragon of the Way"));
      const copy = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });
  });

  describe("Songcrafter Mage", () => {
    it("an instant in your graveyard gains harmonize: castable for its mana cost, reduced by a tapped creature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Island", "Mountain", "Mountain", "Bear Cub"],
          hand: ["Songcrafter Mage"],
          graveyard: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Songcrafter Mage"));
      // {1}{R}: the last Mountain pays {R}, the tapped Bear Cub pays the {1}.
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] }, tap: [bear] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Stalwart Successor", () => {
    it("the first counters of the turn on one of your creatures add one more; not the following ones", () => {
      let s = scenario({
        p1: {
          battlefield: ["Stalwart Successor", "Bear Cub", ...lands("Plains", 4)],
          hand: ["Lightfoot Technique", "Lightfoot Technique"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lt = idsOf(s, "p1", "hand", "Lightfoot Technique");
      s = settle(act(s, "p1", { type: "cast", card: lt[0] as string, targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      s = settle(act(s, "p1", { type: "cast", card: lt[1] as string, targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
    });
  });

  describe("Teval, Arbiter of Virtue", () => {
    it("your spells have delve; each spell cast makes you lose as much life as its mana value", () => {
      let s = scenario({
        p1: { battlefield: ["Teval, Arbiter of Virtue", "Mountain"], hand: ["Lightning Strike"], graveyard: ["Opt", "Forest"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(18);
      // A card from the graveyard paid the {1}.
      expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) !== "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Ureni, the Song Unending", () => {
    it("protection from white and black; X damage (X: your lands) divided among opposing creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 6), "Island", "Mountain"], hand: ["Ureni, the Song Unending"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ureni, the Song Unending"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) return [angel, bear];
        if (req.type === "divide") return req.among.map((id) => (id === angel ? 6 : 2));
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const u = idOf(s, "p1", "battlefield", "Ureni, the Song Unending");
      expect(chars(s, u).protections.map((p) => p.label)).toContain("Protection from white and from black");
    });
  });

  describe("Zurgo, Thunder's Decree", () => {
    it("during your end step, your Warrior tokens can't be sacrificed (those from mobilize remain)", () => {
      let s = scenario({ p1: { battlefield: ["Zurgo, Thunder's Decree"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const z = idOf(s, "p1", "battlefield", "Zurgo, Thunder's Decree");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: z, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
    });
  });
});

describe("Tarkir: Dragonstorm, lot D (remplacements de blessures, R1)", () => {
  describe("Neriv, Heart of the Storm", () => {
    it("one of your creatures that entered this turn deals double damage; the others don't", () => {
      const s = scenario({ p1: { battlefield: ["Neriv, Heart of the Storm", "Bear Cub", { name: "Serra Angel", sick: true }] } });
      dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Serra Angel")), "p2", 4, false);
      expect(s.players.p2?.life).toBe(12);
      dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 2, false);
      expect(s.players.p2?.life).toBe(10);
    });

    it("a creature gone from the battlefield is judged by its last known information (PLAN-M M7)", () => {
      const s = scenario({
        p1: { battlefield: ["Neriv, Heart of the Storm", "Bear Cub", { name: "Serra Angel", sick: true }] },
      });
      // Both creatures die, then deal their damage (a "when it dies" or "sacrifice it: it deals" source).
      const angel = sourceFromObject(s, idOf(s, "p1", "battlefield", "Serra Angel"));
      const bear = sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p1", "battlefield", "Serra Angel"));
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      dealDamage(s, angel, "p2", 2, false);
      expect(s.players.p2?.life).toBe(16);
      dealDamage(s, bear, "p2", 2, false);
      expect(s.players.p2?.life).toBe(14);
    });
  });

  describe("New Way Forward (bouclier, 615.7)", () => {
    const setup = () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Mountain", "Plains", ...lands("Island", 2)],
          hand: ["New Way Forward"],
          library: lands("Forest", 8),
        },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "New Way Forward"), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      return { s, dragon };
    };

    it("the next time the chosen source would damage you this turn, it's prevented: it damages its controller and you draw that many", () => {
      let { s, dragon } = setup();
      const hand = s.players.p1?.hand.length ?? 0;
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(20);
      s = settle(s);
      expect(s.players.p2?.life).toBe(15);
      expect(s.players.p1?.hand.length).toBe(hand + 5);
      // The shield only works once.
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(15);
    });

    it("another source is not affected, and the shield disappears at end of turn", () => {
      let { s, dragon } = setup();
      dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Serra Angel")), "p1", 4, true);
      expect(s.players.p1?.life).toBe(16);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      dealDamage(s, sourceFromObject(s, dragon), "p1", 5, true);
      expect(s.players.p1?.life).toBe(11);
    });
  });
});

describe('Tarkir: Dragonstorm: "one to three" targets of a triggered ability', () => {
  it("Armament Dragon: alone on the battlefield, it gets all three counters (one target is enough)", () => {
    let s = scenario({
      p1: {
        battlefield: [...Array(2).fill("Plains"), ...Array(2).fill("Swamp"), ...Array(2).fill("Forest")],
        hand: ["Armament Dragon"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Armament Dragon") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const dragon = idOf(s, "p1", "battlefield", "Armament Dragon");
    expect(s.objects[dragon]?.counters["+1/+1"]).toBe(3);
  });
});

describe("Tarkir: Dragonstorm: meta cards (PLAN-C, lot C13)", () => {
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability });
  };
  const castOk = (s: S, name: string) =>
    legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  describe("Maelstrom of the Spirit Dragon", () => {
    it("{T}: {C}; mana of any color only pays for a Dragon (or omen) spell", () => {
      let s = scenario({
        p1: {
          battlefield: ["Maelstrom of the Spirit Dragon", "Plains", "Plains"],
          hand: ["Firespitter Whelp", "Goblin Oriflamme"],
        },
      });
      // Goblin Oriflamme {1}{R}: the {R} can only come from the Maelstrom, reserved for Dragons.
      expect(castOk(s, "Goblin Oriflamme")).toBe(false);
      expect(() => cast(s, "p1", "Goblin Oriflamme")).toThrow();
      // Firespitter Whelp {2}{R}, a Dragon: the Maelstrom provides the {R}.
      expect(castOk(s, "Firespitter Whelp")).toBe(true);
      s = settle(cast(s, "p1", "Firespitter Whelp"));
      expect(idsOf(s, "p1", "battlefield", "Firespitter Whelp")).toHaveLength(1);
    });

    it("colored mana also pays for an omen spell (Charring Bite)", () => {
      let s = scenario({
        p1: { battlefield: ["Maelstrom of the Spirit Dragon", "Plains"], hand: ["Twinmaw Stormbrood // Charring Bite"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twinmaw Stormbrood // Charring Bite", { t: [bear] }, { face: 1 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("{T}: {C} pays the generic part of any spell", () => {
      let s = scenario({ p1: { battlefield: ["Maelstrom of the Spirit Dragon", "Mountain"], hand: ["Goblin Oriflamme"] } });
      s = settle(cast(s, "p1", "Goblin Oriflamme"));
      expect(idsOf(s, "p1", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
    });

    it("{4}, {T}, sacrifice: searches for a Dragon card (and only one), puts it in hand, then shuffles", () => {
      let s = scenario({
        p1: {
          battlefield: ["Maelstrom of the Spirit Dragon", ...lands("Mountain", 4)],
          library: ["Forest", "Shivan Dragon", "Bear Cub", "Island"],
        },
      });
      const maelstrom = idOf(s, "p1", "battlefield", "Maelstrom of the Spirit Dragon");
      let offered: (string | undefined)[] = [];
      s = settle(activate(s, "p1", maelstrom, "Dragon"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        return req.options.filter((id) => nameOf(cur, id) === "Shivan Dragon").slice(0, 1);
      });
      expect(offered).toEqual(["Shivan Dragon"]);
      expect(idsOf(s, "p1", "graveyard", "Maelstrom of the Spirit Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(3);
    });
  });

  describe("Frontline Rush", () => {
    it("first mode: two red 1/1 Goblin tokens", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Frontline Rush"] } });
      s = settle(cast(s, "p1", "Frontline Rush", undefined, { mode: 0 }));
      const goblins = s.battlefield.filter((id) => chars(s, id).name === "Goblin");
      expect(goblins).toHaveLength(2);
      for (const g of goblins) {
        expect(s.objects[g]?.controller).toBe("p1");
        expect(chars(s, g).colors).toEqual(["R"]);
        expect(chars(s, g).subtypes).toContain("Goblin");
        expect([chars(s, g).power, chars(s, g).toughness]).toEqual([1, 1]);
      }
      expect(idsOf(s, "p1", "graveyard", "Frontline Rush")).toHaveLength(1);
    });

    it("second mode: +X/+X to a targeted creature, X = the number of creatures you control (not the opponent's)", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Bear Cub", "Llanowar Elves", "Serra Angel"], hand: ["Frontline Rush"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Frontline Rush", { t: [bear] }, { mode: 1 }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
      // Until end of turn.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([2, 2]);
    });

    it("second mode: can target an opposing creature; X still counts your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Llanowar Elves"], hand: ["Frontline Rush"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Frontline Rush", { t: [bear] }, { mode: 1 }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
    });
  });

  describe("United Battlefront", () => {
    it("among the top seven, up to two nonland noncreature permanents with MV 3 or less enter; the rest go to the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["United Battlefront"],
          library: [
            "Goblin Oriflamme",
            "Hedron Archive",
            "Shivan Dragon",
            "Forest",
            "Opt",
            "Phyrexian Arena",
            "Bear Trap",
            "Feldon's Cane",
          ],
        },
      });
      let offered: (string | undefined)[] = [];
      let max = 0;
      s = settle(cast(s, "p1", "United Battlefront"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(cur, id));
        max = req.max;
        return req.options.filter((id) => ["Goblin Oriflamme", "Phyrexian Arena"].includes(nameOf(cur, id) ?? ""));
      });
      // Neither creature, nor land, nor instant, nor MV 4, nor the eighth card.
      expect(offered.sort()).toEqual(["Bear Trap", "Goblin Oriflamme", "Phyrexian Arena"]);
      expect(max).toBe(2);
      expect(idsOf(s, "p1", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Phyrexian Arena")).toHaveLength(1);
      // The other five are under the eighth, now on top.
      const lib = s.players.p1?.library ?? [];
      expect(lib).toHaveLength(6);
      expect(nameOf(s, lib[0] as string)).toBe("Feldon's Cane");
      expect(namesIn(s, lib.slice(1)).sort()).toEqual(["Bear Trap", "Forest", "Hedron Archive", "Opt", "Shivan Dragon"]);
    });
  });

  describe("Dalkovan Encampment", () => {
    it("enters tapped unless you control a Swamp or a Mountain; {T}: {W}", () => {
      const play = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["Dalkovan Encampment"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dalkovan Encampment") });
        return s.objects[idOf(s, "p1", "battlefield", "Dalkovan Encampment")]?.tapped;
      };
      expect(play(["Plains"])).toBe(true);
      expect(play(["Mountain"])).toBe(false);
      expect(play(["Swamp"])).toBe(false);
      // The {W} pays for a white spell.
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment"], hand: ["Healer's Hawk"] } });
      s = settle(cast(s, "p1", "Healer's Hawk"));
      expect(idsOf(s, "p1", "battlefield", "Healer's Hawk")).toHaveLength(1);
    });

    it("{2}{W}, {T}: when you attack this turn, two tapped and attacking red 1/1 Warriors, sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      const camp = idOf(s, "p1", "battlefield", "Dalkovan Encampment");
      s = settle(activate(s, "p1", camp, "Warriors"));
      expect(s.objects[camp]?.tapped).toBe(true);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      const warriors = s.battlefield.filter((id) => chars(s, id).name === "Warrior");
      expect(warriors).toHaveLength(2);
      for (const w of warriors) {
        expect(s.objects[w]?.tapped).toBe(true);
        expect(s.combat?.attackers.some((a) => a.id === w && a.defender === "p2")).toBe(true);
        expect(chars(s, w).colors).toEqual(["R"]);
        expect([chars(s, w).power, chars(s, w).toughness]).toEqual([1, 1]);
      }
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("without an attack this turn, no Warrior; the effect doesn't last until the next turn", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Dalkovan Encampment"), "Warriors"));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(0);
    });

    it("603.7: delayed ability, independent of the land; destroyed after activation, the attack still creates the Warriors", () => {
      let s = scenario({ p1: { battlefield: ["Dalkovan Encampment", ...lands("Plains", 3), "Bear Cub"] } });
      const camp = idOf(s, "p1", "battlefield", "Dalkovan Encampment");
      s = settle(activate(s, "p1", camp, "Warriors"));
      s = structuredClone(s);
      destroy(s, camp);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Dalkovan Encampment")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = settle(s);
      expect(s.battlefield.filter((id) => chars(s, id).name === "Warrior")).toHaveLength(2);
    });
  });
});

describe('"Discard your hand" as a cost (lot K3)', () => {
  it("Reverberating Summons: the hand is discarded on activation (before any response), even if empty; then draw two cards", () => {
    const run = (hand: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Reverberating Summons", ...lands("Mountain", 2)], hand, library: lands("Island", 5) },
      });
      const summons = idOf(s, "p1", "battlefield", "Reverberating Summons");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === summons);
      expect(opt).toBeDefined();
      s = act(s, "p1", { type: "activate", source: summons, ability: opt?.type === "activate" ? opt.ability : -1 });
      // The ability is on the stack: the hand is already in the graveyard.
      expect(s.stack).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(hand));
      s = settle(s);
      return s;
    };
    expect(run(["Bear Cub", "Shock"]).players.p1?.hand).toHaveLength(2);
    expect(run([]).players.p1?.hand).toHaveLength(2);
  });
});

describe("Severance Priest (lot K6)", () => {
  it('"you may choose a nonland card": the player may choose none', () => {
    const run = (take: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Severance Priest"] },
        p2: { hand: ["Shivan Dragon", "Forest"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Severance Priest") });
      let min: number | undefined;
      for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "pickCards") {
          min = p.request.min;
          s = act(s, p.player, { type: "choose", values: take ? p.request.suggested : [] });
        } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else break;
      }
      return { s, min };
    };
    const no = run(false);
    expect(no.min).toBe(0);
    expect(namesIn(no.s, no.s.players.p2?.hand)).toContain("Shivan Dragon");
    const yes = run(true);
    expect(namesIn(yes.s, yes.s.players.p2?.hand)).not.toContain("Shivan Dragon");
  });
});

// ---------------------------------------------------------------------------
// Lot K8 (docs/audits/2026-10-03-cards.md): mythic, rare and uncommon cards without rules tests.
// ---------------------------------------------------------------------------

/** Activates the ability of `source` whose label contains `label`. */
const activateNamed = (s: S, source: string, label: string, extra: object = {}, player: PlayerId = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
  if (a?.type !== "activate") throw new Error(`ability "${label}" not found`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const hasActivation = (s: S, source: string, label: string, player: PlayerId = "p1") =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
/** Answers yes/no questions, picks a trigger's mode, the toughness choice and the wanted objects. */
const answering =
  (opts: { yes?: boolean; pick?: string[]; mode?: number; endure?: "counters" | "token" }) =>
  (req: ChoiceRequest): ChoiceValue[] | undefined => {
    if (req.type === "yesNo" && opts.yes !== undefined) return [opts.yes ? 1 : 0];
    if (req.type === "pick" && req.intent === "triggerMode" && opts.mode !== undefined) return [String(opts.mode)];
    if (req.type === "pick" && opts.endure && req.options.includes("counters")) return [opts.endure];
    return opts.pick ? picking(opts.pick)(req) : undefined;
  };
const tokensOf = (s: S, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.isToken && nameOf(s, id) === name);
const lifeOf = (s: S, p: PlayerId) => s.players[p]?.life;
const handSize = (s: S, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
/** Until p1's next precombat main phase (without resolving what triggers there). */
const nextMain = (s: S) =>
  advanceUntil(
    advanceUntil(s, (x) => x.turn.active === "p2"),
    (x) => x.turn.active === "p1" && x.turn.step === "main1",
  );
/** Until p1's next upkeep. */
const nextUpkeep = (s: S) =>
  advanceUntil(
    advanceUntil(s, (x) => x.turn.active === "p2"),
    (x) => x.turn.active === "p1" && x.turn.step === "upkeep",
  );
const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
/** Does the land played enter tapped? */
const landEntersTapped = (name: string, battlefield: string[]) => {
  const s = settle(playLand(scenario({ p1: { battlefield, hand: [name] } }), name));
  return s.objects[idOf(s, "p1", "battlefield", name)]?.tapped;
};

describe("Tarkir: Dragonstorm, lot K8: mythics", () => {
  it("Betor, Kin to All: total toughness 10: draw; 20: untap your creatures; 40: each opponent loses half their life", () => {
    const run = (battlefield: (string | { name: string; tapped?: boolean; counters?: Record<string, number> })[]) => {
      let s = scenario({ p1: { battlefield }, p2: { life: 15 } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      return s;
    };
    // Betor alone (toughness 7): nothing.
    let s = run(["Betor, Kin to All"]);
    expect(handSize(s, "p1")).toBe(0);
    // 7 + 4 = 11: a card, but no untapping.
    s = run(["Betor, Kin to All", { name: "Serra Angel", tapped: true }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    expect(lifeOf(s, "p2")).toBe(15);
    // 7 + 9 + 4 = 20: a card and your creatures untap.
    s = run([{ name: "Betor, Kin to All", tapped: true }, "Ambling Stormshell", { name: "Serra Angel", tapped: true }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Betor, Kin to All")]?.tapped).toBe(false);
    expect(lifeOf(s, "p2")).toBe(15);
    // 7 + 33 = 40: the opponent loses half their life, rounded up (15 -> 7).
    s = run([{ name: "Betor, Kin to All", counters: { "+1/+1": 33 } }]);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p2")).toBe(7);
  });

  it("Betor, Kin to All: in multiplayer, each opponent loses half of their own life, rounded up", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [{ name: "Betor, Kin to All", counters: { "+1/+1": 33 } }] },
      p2: { life: 15 },
      p3: { life: 8 },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p2")).toBe(7);
    expect(lifeOf(s, "p3")).toBe(4);
    expect(lifeOf(s, "p1")).toBe(20);
  });

  it("Craterhoof Behemoth: haste; your creatures gain trample and +X/+X (X: your creatures) until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 8), "Bear Cub"], hand: ["Craterhoof Behemoth"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Craterhoof Behemoth"));
    const hoof = idOf(s, "p1", "battlefield", "Craterhoof Behemoth");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, hoof).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, hoof)).toEqual([7, 7]);
    expect(chars(s, bear).keywords).toContain("trample");
    // Opposing creatures are not affected.
    expect(pt(s, angel)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Dragonback Assault: 3 damage to each creature and each planeswalker; landfall: a 4/4 red flying Dragon", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest", "Island", "Mountain", ...lands("Forest", 3), "Bear Cub"],
        hand: ["Dragonback Assault", "Forest"],
      },
      p2: { battlefield: ["Serra Angel", "Elspeth, Storm Slayer"] },
    });
    const elspeth = idOf(s, "p2", "battlefield", "Elspeth, Storm Slayer");
    const loyalty = s.objects[elspeth]?.counters.loyalty ?? 0;
    s = settle(cast(s, "p1", "Dragonback Assault"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(s.objects[elspeth]?.counters.loyalty).toBe(loyalty - 3);
    expect(tokensOf(s, "p1", "Dragon")).toHaveLength(0);
    s = settle(playLand(s, "Forest"));
    const dragons = tokensOf(s, "p1", "Dragon");
    expect(dragons).toHaveLength(1);
    const d = dragons[0] as string;
    expect(pt(s, d)).toEqual([4, 4]);
    expect(chars(s, d).colors).toEqual(["R"]);
    expect(chars(s, d).keywords).toContain("flying");
  });

  it("Perennation: a permanent card from your graveyard returns with a hexproof counter and an indestructible one", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Serra Angel"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    // A card in the opponent's graveyard is not a legal target.
    expect(() => cast(s, "p1", "Perennation", { t: [s.players.p2?.graveyard[0] as string] })).toThrow();
    s = settle(cast(s, "p1", "Perennation", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters.hexproof).toBe(1);
    expect(s.objects[angel]?.counters.indestructible).toBe(1);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
  });

  it("Smile at Death: at your upkeep, up to two creature cards with power 2 or less return, with a +1/+1 counter", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Smile at Death"], graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    let options: (string | undefined)[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options);
      return undefined;
    });
    // Serra Angel (power 4) is not a legal target.
    expect(options.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });
});

/** Surveil: all the cards looked at go to the graveyard. */
const surveilAll = (req: ChoiceRequest): ChoiceValue[] | undefined =>
  req.type === "pick" && req.intent.startsWith("surveil") ? req.options : undefined;

describe("Tarkir: Dragonstorm, lot K8: rares (1)", () => {
  it("Ambling Stormshell: when attacking, three stun counters and draw three cards", () => {
    let s = scenario({ p1: { battlefield: ["Ambling Stormshell"] } });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    s = settleNoBlocks(attack(s, [shell]));
    expect(handSize(s, "p1")).toBe(3);
    expect(s.objects[shell]?.counters.stun).toBe(3);
    // Stunned: it doesn't untap on the next turn (a counter is removed instead).
    s = nextMain(s);
    expect(s.objects[shell]?.tapped).toBe(true);
    expect(s.objects[shell]?.counters.stun).toBe(2);
  });

  it("Ambling Stormshell: a Turtle spell untaps it; another spell doesn't", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ambling Stormshell", tapped: true }, ...lands("Island", 6)],
        hand: ["Opt", "Ambling Stormshell"],
      },
    });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[shell]?.tapped).toBe(true);
    s = settle(cast(s, "p1", "Ambling Stormshell"));
    expect(s.objects[shell]?.tapped).toBe(false);
  });

  it("Avenger of the Fallen: deathtouch; mobilize X, X being the number of creature cards in your graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Avenger of the Fallen"], graveyard: ["Bear Cub", "Serra Angel", "Forest"] } });
    const avenger = idOf(s, "p1", "battlefield", "Avenger of the Fallen");
    expect(chars(s, avenger).keywords).toContain("deathtouch");
    s = settleNoBlocks(attack(s, [avenger]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) {
      expect(s.objects[w]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === w)).toBe(true);
    }
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
    expect(lifeOf(s, "p2")).toBe(16);
  });

  it("Awaken the Honored Dead: I - destroy a nonland permanent; II - mill three cards", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island"], hand: ["Awaken the Honored Dead"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Awaken the Honored Dead"), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return picking([angel])(req);
    });
    // The opposing land is not a target.
    expect(options).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    s = settle(nextMain(s));
    // Turn's draw (1) then three cards milled.
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(3);
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Awaken the Honored Dead: III - by discarding a card, a creature or land card from your graveyard returns to hand", () => {
    const run = (discard: boolean) => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Awaken the Honored Dead", counters: { lore: 2 } }],
          hand: ["Opt"],
          graveyard: ["Bear Cub", "Shock"],
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(nextMain(s), (req, _p, cur) => {
        if (req.type === "yesNo") return [discard ? 1 : 0];
        if (req.type !== "pick") return undefined;
        if (req.options.includes(opt)) return discard ? [opt] : [];
        // The instant card (Shock) is not offered.
        expect(namesIn(cur, req.options)).not.toContain("Shock");
        return req.options.filter((id) => nameOf(cur, id) === "Bear Cub");
      });
      return s;
    };
    const yes = run(true);
    expect(idsOf(yes, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(yes, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(yes, "p1", "graveyard", "Awaken the Honored Dead")).toHaveLength(1);
    const no = run(false);
    expect(idsOf(no, "p1", "hand", "Bear Cub")).toHaveLength(0);
    expect(idsOf(no, "p1", "hand", "Opt")).toHaveLength(1);
  });

  it("Cori Mountain Monastery: enters tapped unless you control a Plains or an Island; {T}: {R}", () => {
    expect(landEntersTapped("Cori Mountain Monastery", ["Forest"])).toBe(true);
    expect(landEntersTapped("Cori Mountain Monastery", ["Plains"])).toBe(false);
    expect(landEntersTapped("Cori Mountain Monastery", ["Island"])).toBe(false);
  });

  it("Cori Mountain Monastery: {3}{R}, {T}: exiles the top card, playable until the end of your next turn", () => {
    let s = scenario({
      p1: { battlefield: ["Cori Mountain Monastery", ...lands("Mountain", 4)], library: ["Plains", ...lands("Forest", 6)] },
    });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Cori Mountain Monastery"), "Exile"));
    const plains = exiled(s, "Plains")[0] as string;
    expect(plains).toBeDefined();
    const playable = (x: S) => legalActions(x, "p1").some((a) => a.type === "playLand" && a.card === plains);
    expect(playable(s)).toBe(true);
    s = nextMain(s);
    expect(playable(s)).toBe(true);
    s = nextMain(s);
    expect(playable(s)).toBe(false);
  });

  it("Cori-Steel Cutter: flurry - a 1/1 Monk with prowess, to which the Equipment can be attached (+1/+1, trample, haste)", () => {
    const run = (attach: boolean) => {
      let s = scenario({ p1: { battlefield: ["Cori-Steel Cutter", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const opts = idsOf(s, "p1", "hand", "Opt");
      s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
      expect(tokensOf(s, "p1", "Monk")).toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }), answering({ yes: attach }));
      return s;
    };
    const s = run(true);
    const monk = tokensOf(s, "p1", "Monk")[0] as string;
    expect(s.objects[idOf(s, "p1", "battlefield", "Cori-Steel Cutter")]?.attachedTo).toBe(monk);
    expect(pt(s, monk)).toEqual([2, 2]);
    expect(chars(s, monk).keywords).toEqual(expect.arrayContaining(["prowess", "trample", "haste"]));
    expect(chars(s, monk).colors).toEqual(["W"]);
    const t = run(false);
    const monk2 = tokensOf(t, "p1", "Monk")[0] as string;
    expect(t.objects[idOf(t, "p1", "battlefield", "Cori-Steel Cutter")]?.attachedTo).toBeUndefined();
    expect(pt(t, monk2)).toEqual([1, 1]);
  });

  it("Eshki Dragonclaw: at the beginning of combat, after a creature spell and a noncreature spell this turn: draw, two +1/+1 counters", () => {
    const run = (spells: string[]) => {
      let s = scenario({ p1: { battlefield: ["Eshki Dragonclaw", ...lands("Forest", 2), "Island"], hand: ["Bear Cub", "Opt"] } });
      for (const name of spells) s = settle(cast(s, "p1", name));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      return s;
    };
    const s = run(["Bear Cub", "Opt"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Eshki Dragonclaw")]?.counters["+1/+1"]).toBe(2);
    expect(handSize(s, "p1")).toBe(2);
    const t = run(["Bear Cub"]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Eshki Dragonclaw")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(handSize(t, "p1")).toBe(1);
    const k = chars(t, idOf(t, "p1", "battlefield", "Eshki Dragonclaw")).keywords;
    expect(k).toEqual(expect.arrayContaining(["vigilance", "trample"]));
  });

  it("Fangkeeper's Familiar: flash; on entering, counters a creature spell", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Swamp", "Forest", "Island", "Island"], hand: ["Fangkeeper's Familiar"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = cast(s, "p2", "Bear Cub");
    s = act(s, "p2", { type: "pass" });
    s = settle(cast(s, "p1", "Fangkeeper's Familiar"), answering({ mode: 2 }));
    expect(idsOf(s, "p1", "battlefield", "Fangkeeper's Familiar")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Fangkeeper's Familiar: or gain 3 life and surveil 3; or destroy an enchantment", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Swamp", "Forest", "Island", "Island"], hand: ["Fangkeeper's Familiar"] },
        p2: { battlefield: ["Goblin Oriflamme"] },
      });
    let s = settle(cast(setup(), "p1", "Fangkeeper's Familiar"), (req) => answering({ mode: 0 })(req) ?? surveilAll(req));
    expect(lifeOf(s, "p1")).toBe(23);
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Goblin Oriflamme")).toHaveLength(1);
    s = settle(cast(setup(), "p1", "Fangkeeper's Familiar"), answering({ mode: 1 }));
    expect(idsOf(s, "p2", "graveyard", "Goblin Oriflamme")).toHaveLength(1);
    expect(lifeOf(s, "p1")).toBe(20);
  });

  it("Frostcliff Siege, Temur: your creatures get +1/+0, trample and haste (not the opponent's)", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Mountain", "Mountain", "Bear Cub"], hand: ["Frostcliff Siege"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    let options: string[] = [];
    s = settle(cast(s, "p1", "Frostcliff Siege"), (req) => {
      if (req.intent !== "chooseOnEnter" || req.type !== "pick") return undefined;
      options = req.options;
      return ["Temur"];
    });
    expect(options).toEqual(["Jeskai", "Temur"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Frostcliff Siege, Jeskai: one or more of your creatures damage a player: draw a single card", () => {
    let s = scenario({ p1: { battlefield: ["Frostcliff Siege", "Bear Cub", "Llanowar Elves"] } });
    (s.objects[idOf(s, "p1", "battlefield", "Frostcliff Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Jeskai" };
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(17);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Great Arashin City: enters tapped unless you control a Forest or a Plains; {1}{B}, {T}, exile a creature card: a 1/1 Spirit", () => {
    expect(landEntersTapped("Great Arashin City", ["Island"])).toBe(true);
    expect(landEntersTapped("Great Arashin City", ["Forest"])).toBe(false);
    expect(landEntersTapped("Great Arashin City", ["Plains"])).toBe(false);
    const setup = (graveyard: string[]) => scenario({ p1: { battlefield: ["Great Arashin City", "Swamp", "Swamp"], graveyard } });
    const none = setup(["Forest", "Shock"]);
    expect(hasActivation(none, idOf(none, "p1", "battlefield", "Great Arashin City"), "Spirit")).toBe(false);
    let s = setup(["Bear Cub"]);
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Great Arashin City"), "Spirit"));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    const spirit = tokensOf(s, "p1", "Spirit")[0] as string;
    expect(pt(s, spirit)).toEqual([1, 1]);
    expect(chars(s, spirit).colors).toEqual(["W"]);
  });

  it("Herd Heirloom: its mana of any color only pays for casting a creature spell", () => {
    const s = scenario({ p1: { battlefield: ["Herd Heirloom", "Forest"], hand: ["Bear Cub", "Shock"] } });
    const castOk = (name: string) =>
      legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
    expect(castOk("Shock")).toBe(false);
    expect(castOk("Bear Cub")).toBe(true);
    const t = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it('Herd Heirloom: {T}: one of your creatures with power 4 or greater gains trample and "deals damage to a player: draw"', () => {
    let s = scenario({ p1: { battlefield: ["Herd Heirloom", "Serra Angel", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const heirloom = idOf(s, "p1", "battlefield", "Herd Heirloom");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(() => activateNamed(s, heirloom, "Trample", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } })).toThrow();
    expect(() => activateNamed(s, heirloom, "Trample", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
    s = settle(activateNamed(s, heirloom, "Trample", { targets: { t: [angel] } }));
    expect(chars(s, angel).keywords).toContain("trample");
    s = settleNoBlocks(attack(s, [angel]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(16);
    expect(handSize(s, "p1")).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, angel).keywords).not.toContain("trample");
  });

  it("Hollowmurk Siege, Sultai: a counter put on one of your creatures: draw a card, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Hollowmurk Siege", "Bear Cub", ...lands("Plains", 3)],
        hand: ["Fleeting Flight", "Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    (s.objects[idOf(s, "p1", "battlefield", "Hollowmurk Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Sultai" };
    const flights = idsOf(s, "p1", "hand", "Fleeting Flight");
    // On an opposing creature: nothing.
    s = settle(
      act(s, "p1", { type: "cast", card: flights[0] as string, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
    );
    expect(handSize(s, "p1")).toBe(2);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: flights[1] as string, targets: { t: [bear] } }));
    expect(handSize(s, "p1")).toBe(2);
    s = settle(act(s, "p1", { type: "cast", card: flights[2] as string, targets: { t: [bear] } }));
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Hollowmurk Siege, Abzan: when you attack, a +1/+1 counter and menace on an attacking creature", () => {
    let s = scenario({ p1: { battlefield: ["Hollowmurk Siege", "Bear Cub", "Llanowar Elves"] } });
    (s.objects[idOf(s, "p1", "battlefield", "Hollowmurk Siege")] as { chosen?: { mode?: string } }).chosen = { mode: "Abzan" };
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    let options: string[] = [];
    s = settleNoBlocks(attack(s, [bear]), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return undefined;
    });
    // A single attacking creature: it is the target (Llanowar Elves doesn't attack).
    expect(options).toEqual([]);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).keywords).toContain("menace");
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("menace");
  });

  it("Kishla Village: enters tapped unless you control an Island or a Swamp; {3}{G}, {T}: surveil 2", () => {
    expect(landEntersTapped("Kishla Village", ["Plains"])).toBe(true);
    expect(landEntersTapped("Kishla Village", ["Island"])).toBe(false);
    expect(landEntersTapped("Kishla Village", ["Swamp"])).toBe(false);
    let s = scenario({ p1: { battlefield: ["Kishla Village", ...lands("Forest", 4)], library: ["Opt", "Shock", "Island"] } });
    let seen: (string | undefined)[] = [];
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Kishla Village"), "Surveil"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent.startsWith("surveil")) seen = namesIn(cur, req.options);
      return surveilAll(req);
    });
    expect(seen).toEqual(["Opt", "Shock"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Shock"]);
  });
});

describe("Tarkir: Dragonstorm, lot K8: rares (2)", () => {
  it("Lasyd Prowler: on entering, you may mill as many cards as you control lands", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Island"], hand: ["Lasyd Prowler"] } });
      s = settle(cast(s, "p1", "Lasyd Prowler"), answering({ yes }));
      return s;
    };
    expect(run(true).players.p1?.graveyard).toHaveLength(5);
    expect(run(false).players.p1?.graveyard).toHaveLength(0);
  });

  it("Lasyd Prowler: renew - X +1/+1 counters, X being the number of land cards in your graveyard", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], graveyard: ["Lasyd Prowler", "Forest", "Island", "Shock"] },
      p2: { graveyard: ["Plains", "Plains"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Lasyd Prowler"), "Renew", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(exiled(s, "Lasyd Prowler")).toHaveLength(1);
  });

  it("Lotuslight Dancers: lifelink; on entering, a black, a green and a blue card from the library go to the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Island", ...lands("Forest", 2)],
        hand: ["Lotuslight Dancers"],
        library: ["Shock", "Bake into a Pie", "Forest", "Bear Cub", "Opt", "Island"],
      },
    });
    s = settle(cast(s, "p1", "Lotuslight Dancers"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Lotuslight Dancers")).keywords).toContain("lifelink");
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bake into a Pie", "Bear Cub", "Opt"]);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Forest", "Island", "Shock"]);
  });

  it("Marang River Regent: flying; on entering, returns up to two other nonland permanents to their owners' hands", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Marang River Regent // Coil and Catch"] },
      p2: { battlefield: ["Serra Angel", "Goblin Oriflamme", "Forest"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const orif = idOf(s, "p2", "battlefield", "Goblin Oriflamme");
    let options: string[] = [];
    let max = 0;
    s = settle(cast(s, "p1", "Marang River Regent // Coil and Catch"), (req) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      options = req.options;
      max = req.max;
      return [angel, orif];
    });
    const regent = idOf(s, "p1", "battlefield", "Marang River Regent // Coil and Catch");
    expect(chars(s, regent).keywords).toContain("flying");
    expect(max).toBe(2);
    expect(options).not.toContain(regent);
    expect(options).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Goblin Oriflamme", "Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Coil and Catch: draw three cards, then discard one; the card is shuffled into the library", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Marang River Regent // Coil and Catch"], library: lands("Plains", 5) },
    });
    const card = idOf(s, "p1", "hand", "Marang River Regent // Coil and Catch");
    s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
    expect(handSize(s, "p1")).toBe(2);
    expect(idsOf(s, "p1", "graveyard", "Plains")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toContain("Marang River Regent // Coil and Catch");
    expect(s.players.p1?.library).toHaveLength(3);
  });

  it("Mardu Siegebreaker: exiles another of your creatures as long as it stays; when attacking, a tapped and attacking copy token, sacrificed at the end step", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Plains", "Swamp", "Swamp", "Bear Cub"], hand: ["Mardu Siegebreaker"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    let options: string[] = [];
    s = settle(cast(s, "p1", "Mardu Siegebreaker"), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = req.options;
      return picking([bear])(req);
    });
    // The opposing creature is not a target.
    expect(options).toEqual([bear]);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    const breaker = idOf(s, "p1", "battlefield", "Mardu Siegebreaker");
    expect(chars(s, breaker).keywords).toEqual(expect.arrayContaining(["deathtouch", "haste"]));
    s = settleNoBlocks(attack(s, [breaker]));
    const copies = tokensOf(s, "p1", "Bear Cub");
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.tapped).toBe(true);
    expect(s.combat?.attackers.find((a) => a.id === copies[0])?.defender).toBe("p2");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p2")).toBe(14);
    expect(tokensOf(s, "p1", "Bear Cub")).toHaveLength(0);
    // When it leaves the battlefield, the exiled card returns.
    destroy(s, breaker);
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Naga Fleshcrafter: may enter as a copy of any creature, even an opposing one", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Naga Fleshcrafter"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Naga Fleshcrafter"), picking([angel]));
    const mine = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    expect(mine).toHaveLength(1);
    expect(chars(s, mine[0] as string).name).toBe("Serra Angel");
    expect(pt(s, mine[0] as string)).toEqual([4, 4]);
  });

  it("Naga Fleshcrafter: renew - +1/+1 counter on one of your nonlegendary creatures; your other creatures become copies of it until end of turn", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 3), "Bear Cub", "Llanowar Elves", "Eshki Dragonclaw"],
        graveyard: ["Naga Fleshcrafter"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const naga = idOf(s, "p1", "graveyard", "Naga Fleshcrafter");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const eshki = idOf(s, "p1", "battlefield", "Eshki Dragonclaw");
    expect(() => activateNamed(s, naga, "Renew", { targets: { t: [eshki] } })).toThrow();
    expect(() => activateNamed(s, naga, "Renew", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } })).toThrow();
    s = settle(activateNamed(s, naga, "Renew", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, elves).name).toBe("Bear Cub");
    expect(chars(s, eshki).name).toBe("Bear Cub");
    expect(pt(s, eshki)).toEqual([2, 2]);
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).name).toBe("Serra Angel");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, elves).name).toBe("Llanowar Elves");
    expect(chars(s, eshki).name).toBe("Eshki Dragonclaw");
  });

  it("Rediscover the Way: I - look at three cards, one to hand, the others on the bottom of the library", () => {
    let s = scenario({
      p1: {
        battlefield: ["Island", "Mountain", "Plains"],
        hand: ["Rediscover the Way"],
        library: ["Opt", "Shock", "Plains", ...lands("Island", 5)],
      },
    });
    let min = -1;
    s = settle(cast(s, "p1", "Rediscover the Way"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      min = req.min;
      return req.options.filter((id) => nameOf(cur, id) === "Shock");
    });
    expect(min).toBe(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shock"]);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib).toHaveLength(7);
    expect(lib[0]).toBe("Island");
    expect(lib.slice(5).sort()).toEqual(["Opt", "Plains"]);
  });

  it("Rediscover the Way: III - this turn, each noncreature spell gives double strike to one of your creatures", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Rediscover the Way", counters: { lore: 2 } }, "Bear Cub", "Mountain", "Forest"],
        hand: ["Shock", "Llanowar Elves"],
      },
    });
    s = settle(nextMain(s));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Llanowar Elves"));
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
    s = settle(cast(s, "p1", "Shock", { t: ["p2"] }), picking([bear]));
    expect(chars(s, bear).keywords).toContain("doubleStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("doubleStrike");
  });

  it("Revival of the Ancestors: I - three 1/1 Spirits; II - three +1/+1 counters divided; III - trample and lifelink", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Forest", "Forest"], hand: ["Revival of the Ancestors"] } });
    s = settle(cast(s, "p1", "Revival of the Ancestors"));
    const spirits = tokensOf(s, "p1", "Spirit");
    expect(spirits).toHaveLength(3);
    expect(pt(s, spirits[0] as string)).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: [{ name: "Revival of the Ancestors", counters: { lore: 1 } }, "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
    let options: string[] = [];
    t = settle(nextMain(t), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget") {
        options = req.options;
        return [bear, elves];
      }
      return undefined;
    });
    expect(options).not.toContain(idOf(t, "p2", "battlefield", "Serra Angel"));
    const b = t.objects[bear]?.counters["+1/+1"] ?? 0;
    const e = t.objects[elves]?.counters["+1/+1"] ?? 0;
    expect(b + e).toBe(3);
    expect(Math.min(b, e)).toBeGreaterThanOrEqual(1);
    t = settle(nextMain(t));
    expect(chars(t, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
    expect(idsOf(t, "p1", "graveyard", "Revival of the Ancestors")).toHaveLength(1);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, bear).keywords).not.toContain("lifelink");
  });

  it("Stillness in Motion: at your upkeep, mill three cards", () => {
    let s = scenario({ p1: { battlefield: ["Stillness in Motion"] } });
    s = advanceUntil(nextUpkeep(s), (x) => x.turn.step === "draw");
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(idsOf(s, "p1", "battlefield", "Stillness in Motion")).toHaveLength(1);
  });

  it("Stillness in Motion: empty library after milling: exile it and put five cards from the graveyard on top of the library", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Stillness in Motion"], library: lands("Forest", 3), graveyard: lands("Plains", 3) },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    s = settle(s);
    expect(exiled(s, "Stillness in Motion")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(5);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });

  it("Stillness in Motion: fewer than five cards in the graveyard: they all return to the library", () => {
    let s = scenario({ active: "p2", p1: { battlefield: ["Stillness in Motion"], library: ["Forest", "Island"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    s = settle(s);
    expect(exiled(s, "Stillness in Motion")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Forest", "Island"]);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Temur Battlecrier: during your turn, your spells cost {1} less per creature with power 4 or greater you control", () => {
    const castOk = (s: S, player: PlayerId, name: string) =>
      legalActions(s, player).some((a) => a.type === "cast" && a.card === idOf(s, player, "hand", name));
    // Battlecrier (4/3) and Serra Angel: Shivan Dragon {4}{R}{R} costs {2}{R}{R}; Bear Cub (2/2) doesn't count.
    let s = scenario({
      p1: { battlefield: ["Temur Battlecrier", "Serra Angel", "Bear Cub", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] },
    });
    expect(castOk(s, "p1", "Shivan Dragon")).toBe(true);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    const few = scenario({
      p1: { battlefield: ["Temur Battlecrier", "Bear Cub", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] },
    });
    expect(castOk(few, "p1", "Shivan Dragon")).toBe(false);
    // During the opponent's turn: no reduction.
    let opp = scenario({
      active: "p2",
      p1: { battlefield: ["Temur Battlecrier", "Mountain"], hand: ["Lightning Strike"] },
    });
    opp = passUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(opp, "p1", "Lightning Strike")).toBe(false);
    const mine = scenario({ p1: { battlefield: ["Temur Battlecrier", "Mountain"], hand: ["Lightning Strike"] } });
    expect(castOk(mine, "p1", "Lightning Strike")).toBe(true);
  });

  it("Thunder of Unity: I - draw two cards, lose 2 life; II - this turn, your creatures that enter drain 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Plains", "Swamp"], hand: ["Thunder of Unity"] } });
    s = settle(cast(s, "p1", "Thunder of Unity"));
    expect(handSize(s, "p1")).toBe(2);
    expect(lifeOf(s, "p1")).toBe(18);
    let t = scenario({
      p1: {
        battlefield: [{ name: "Thunder of Unity", counters: { lore: 1 } }, ...lands("Forest", 4)],
        hand: ["Bear Cub", "Llanowar Elves"],
      },
    });
    t = settle(nextMain(t));
    t = settle(cast(t, "p1", "Bear Cub"));
    expect([lifeOf(t, "p1"), lifeOf(t, "p2")]).toEqual([21, 19]);
    t = settle(cast(t, "p1", "Llanowar Elves"));
    expect([lifeOf(t, "p1"), lifeOf(t, "p2")]).toEqual([22, 18]);
  });

  it("Yathan Roadwatcher: when cast, mill four cards, then a creature card with MV 3 or less returns to the battlefield", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Swamp", "Forest", "Forest"],
        hand: ["Yathan Roadwatcher"],
        library: ["Serra Angel", "Bear Cub", "Forest", "Forest", "Island"],
      },
    });
    // Serra Angel (MV 5) is not a legal target: Bear Cub is the only one.
    s = settle(cast(s, "p1", "Yathan Roadwatcher"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(1);
  });

  it("Yathan Roadwatcher: put onto the battlefield without being cast, nothing is milled", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Yathan Roadwatcher"] },
    });
    s = settle(cast(s, "p1", "Perennation", { t: [idOf(s, "p1", "graveyard", "Yathan Roadwatcher")] }));
    expect(idsOf(s, "p1", "battlefield", "Yathan Roadwatcher")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(10);
    expect(s.players.p1?.graveyard).toHaveLength(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8: uncommons with several abilities (1)", () => {
  it("Aegis Sculptor: at your upkeep, you may exile two cards from your graveyard; if you do, a +1/+1 counter", () => {
    const run = (graveyard: string[], yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Aegis Sculptor"], graveyard } });
      s = settle(nextUpkeep(s), answering({ yes }));
      return s;
    };
    const s = run(lands("Plains", 3), true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"]).toBe(1);
    expect(exiled(s, "Plains")).toHaveLength(2);
    const no = run(lands("Plains", 3), false);
    expect(no.objects[idOf(no, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(no.players.p1?.graveyard).toHaveLength(3);
    // A single card: impossible to exile two.
    const one = run(["Plains"], true);
    expect(one.objects[idOf(one, "p1", "battlefield", "Aegis Sculptor")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(one.players.p1?.graveyard).toHaveLength(1);
  });

  it("Aegis Sculptor: flying; ward {2} (an opposing spell that targets it is countered for lack of payment)", () => {
    let s = scenario({ p1: { battlefield: ["Aegis Sculptor"] }, p2: { battlefield: ["Mountain"], hand: ["Shock"] } });
    const sculptor = idOf(s, "p1", "battlefield", "Aegis Sculptor");
    expect(chars(s, sculptor).keywords).toContain("flying");
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { t: [sculptor] }));
    expect(s.objects[sculptor]?.damage).toBe(0);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Alchemist's Assistant: lifelink; renew - a lifelink counter on a creature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp", "Bear Cub", "Alchemist's Assistant"], graveyard: ["Alchemist's Assistant"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Alchemist's Assistant")).keywords).toContain("lifelink");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renew", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters.lifelink).toBe(1);
    expect(chars(s, bear).keywords).toContain("lifelink");
    expect(exiled(s, "Alchemist's Assistant")).toHaveLength(1);
  });

  it("Bone-Cairn Butcher: mobilize 2; your attacking tokens have deathtouch (not the Demon)", () => {
    let s = scenario({ p1: { battlefield: ["Bone-Cairn Butcher"] } });
    const butcher = idOf(s, "p1", "battlefield", "Bone-Cairn Butcher");
    s = settleNoBlocks(attack(s, [butcher]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("deathtouch");
    expect(chars(s, butcher).keywords).not.toContain("deathtouch");
  });

  it("Constrictor Sage: on entering, taps an opposing creature and puts a stun counter on it", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Constrictor Sage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Constrictor Sage"));
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
  });

  it("Constrictor Sage: renew - tap an opposing creature, stun counter (not one of yours)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], graveyard: ["Constrictor Sage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const sage = idOf(s, "p1", "graveyard", "Constrictor Sage");
    expect(() => activateNamed(s, sage, "Renew", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } })).toThrow();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, sage, "Renew", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(1);
  });

  it("Corroding Dragonstorm: each opponent loses 2 life, you gain 2, surveil 2; a Dragon returns it to hand", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Corroding Dragonstorm"], library: ["Opt", "Shock", "Forest"] },
    });
    s = settle(cast(s, "p1", "Corroding Dragonstorm"), surveilAll);
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Shock"]);
    let t = scenario({ p1: { battlefield: ["Corroding Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
    t = settle(cast(t, "p1", "Shivan Dragon"));
    expect(idsOf(t, "p1", "hand", "Corroding Dragonstorm")).toHaveLength(1);
  });

  it("Encroaching Dragonstorm: up to two basic land cards, put onto the battlefield tapped; a Dragon returns it to hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Encroaching Dragonstorm"], library: ["Island", "Shock", "Mountain", "Opt"] },
    });
    s = settle(cast(s, "p1", "Encroaching Dragonstorm"));
    const fetched = ["Island", "Mountain"].map((n) => idOf(s, "p1", "battlefield", n));
    for (const id of fetched) expect(s.objects[id]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Opt", "Shock"]);
    let t = scenario({ p1: { battlefield: ["Encroaching Dragonstorm", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
    t = settle(cast(t, "p1", "Shivan Dragon"));
    expect(idsOf(t, "p1", "hand", "Encroaching Dragonstorm")).toHaveLength(1);
  });

  it("Roiling Dragonstorm: draw two cards, then discard one; an opposing Dragon doesn't return it", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island"], hand: ["Roiling Dragonstorm"] } });
    s = settle(cast(s, "p1", "Roiling Dragonstorm"));
    expect(handSize(s, "p1")).toBe(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Roiling Dragonstorm"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
    });
    t = settle(cast(t, "p2", "Shivan Dragon"));
    expect(idsOf(t, "p1", "battlefield", "Roiling Dragonstorm")).toHaveLength(1);
  });

  it("Dragonbroods' Relic: {T}, tap one of your untapped creatures: one mana of any color", () => {
    const castOk = (s: S) => legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
    expect(castOk(scenario({ p1: { battlefield: ["Dragonbroods' Relic"], hand: ["Shock"] } }))).toBe(false);
    expect(
      castOk(scenario({ p1: { battlefield: ["Dragonbroods' Relic", { name: "Bear Cub", tapped: true }], hand: ["Shock"] } })),
    ).toBe(false);
    let s = scenario({ p1: { battlefield: ["Dragonbroods' Relic", "Bear Cub"], hand: ["Shock"] } });
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Shock", { t: ["p2"] }));
    expect(lifeOf(s, "p2")).toBe(18);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Dragonbroods' Relic: {3}{W}{U}{B}{R}{G}, sacrifice (sorcery speed): 4/4 Reliquary Dragon of all colors, 3 damage on entering", () => {
    let s = scenario({
      p1: { battlefield: ["Dragonbroods' Relic", "Plains", "Island", "Swamp", "Mountain", "Forest", ...lands("Forest", 3)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Dragonbroods' Relic"), "Reliquary"), picking([angel]));
    expect(idsOf(s, "p1", "graveyard", "Dragonbroods' Relic")).toHaveLength(1);
    const dragon = tokensOf(s, "p1", "Reliquary Dragon")[0] as string;
    expect(pt(s, dragon)).toEqual([4, 4]);
    expect(chars(s, dragon).colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(chars(s, dragon).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Equilibrium Adept: on entering, exiles the top card, playable until the end of your next turn; flurry: double strike", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Equilibrium Adept"], library: ["Plains", ...lands("Forest", 5)] },
    });
    s = settle(cast(s, "p1", "Equilibrium Adept"));
    const plains = exiled(s, "Plains")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === plains)).toBe(true);
    let t = scenario({ p1: { battlefield: ["Equilibrium Adept", "Island", "Island"], hand: ["Opt", "Opt"] } });
    const adept = idOf(t, "p1", "battlefield", "Equilibrium Adept");
    const opts = idsOf(t, "p1", "hand", "Opt");
    t = settle(act(t, "p1", { type: "cast", card: opts[0] as string }));
    expect(chars(t, adept).keywords).not.toContain("doubleStrike");
    t = settle(act(t, "p1", { type: "cast", card: opts[1] as string }));
    expect(chars(t, adept).keywords).toContain("doubleStrike");
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, adept).keywords).not.toContain("doubleStrike");
  });

  it("Essence Anchor: at your upkeep, surveil 1", () => {
    let s = scenario({ p1: { battlefield: ["Essence Anchor"], library: ["Opt", ...lands("Forest", 5)] } });
    s = settle(nextUpkeep(s), surveilAll);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Essence Anchor: {T}: a black 2/2 Zombie Druid, only during your turn and if a card left your graveyard this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Essence Anchor", "Swamp", "Swamp", "Bear Cub"], graveyard: ["Alchemist's Assistant"] },
    });
    const anchor = idOf(s, "p1", "battlefield", "Essence Anchor");
    expect(hasActivation(s, anchor, "Zombie")).toBe(false);
    s = settle(
      activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renew", {
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      }),
    );
    expect(hasActivation(s, anchor, "Zombie")).toBe(true);
    s = settle(activateNamed(s, anchor, "Zombie"));
    const zombie = tokensOf(s, "p1", "Zombie Druid")[0] as string;
    expect(pt(s, zombie)).toEqual([2, 2]);
    expect(chars(s, zombie).colors).toEqual(["B"]);
    // On the next turn, with no card leaving the graveyard: no more activation.
    s = nextMain(s);
    expect(hasActivation(s, anchor, "Zombie")).toBe(false);
  });

  it("Fleeting Effigy: haste; {2}{R}: +2/+0; at the beginning of your end step, it returns to its owner's hand", () => {
    let s = scenario({ p1: { battlefield: ["Fleeting Effigy", ...lands("Mountain", 3)] } });
    const effigy = idOf(s, "p1", "battlefield", "Fleeting Effigy");
    expect(chars(s, effigy).keywords).toContain("haste");
    s = settle(activateNamed(s, effigy, "+2/+0"));
    expect(pt(s, effigy)).toEqual([4, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "hand", "Fleeting Effigy")).toHaveLength(1);
  });

  it("Fresh Start: flash; the enchanted creature gets -5/-0 and loses all abilities", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Island", "Island"], hand: ["Fresh Start"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Fresh Start", { enchant: [angel] }));
    expect(chars(s, angel).power).toBe(-1);
    expect(chars(s, angel).toughness).toBe(4);
    expect(chars(s, angel).keywords).not.toContain("flying");
    expect(chars(s, angel).keywords).not.toContain("vigilance");
  });

  it("Glacial Dragonhunt: draw, then you may discard; a nonland card discarded: 3 damage to a creature", () => {
    const run = (discard: string | null) => {
      let s = scenario({
        p1: { battlefield: ["Island", "Mountain"], hand: ["Glacial Dragonhunt", "Opt", "Plains"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Glacial Dragonhunt"), (req, _p, cur) => {
        if (req.type === "yesNo") return [discard ? 1 : 0];
        if (req.type === "pick" && req.intent !== "triggerTarget" && req.options.some((id) => nameOf(cur, id) === "Opt"))
          return discard ? req.options.filter((id) => nameOf(cur, id) === discard).slice(0, 1) : [];
        return undefined;
      });
      return s;
    };
    const s = run("Opt");
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    expect(handSize(s, "p1")).toBe(2);
    const land = run("Plains");
    expect(land.objects[idOf(land, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(idsOf(land, "p1", "graveyard", "Plains")).toHaveLength(1);
    const none = run(null);
    expect(none.objects[idOf(none, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    expect(handSize(none, "p1")).toBe(3);
  });

  it("Kheru Goldkeeper: flying; cards leave your graveyard during your turn: a Treasure", () => {
    let s = scenario({
      p1: { battlefield: ["Kheru Goldkeeper", "Swamp", "Swamp", "Bear Cub"], graveyard: ["Alchemist's Assistant"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Kheru Goldkeeper")).keywords).toContain("flying");
    s = settle(
      activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renew", {
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      }),
    );
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(1);
  });

  it("Kheru Goldkeeper: renew - two +1/+1 counters and a flying counter on a creature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island", ...lands("Swamp", 2), "Bear Cub"], graveyard: ["Kheru Goldkeeper"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Kheru Goldkeeper"), "Renew", { targets: { t: [bear] } }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters.flying).toBe(1);
    expect(chars(s, bear).keywords).toContain("flying");
  });

  it("Mammoth Bellow: a green 5/5 Elephant; harmonize from the graveyard, then exiled", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Island", "Mountain", "Forest", "Forest"], hand: ["Mammoth Bellow"] } });
    s = settle(cast(s, "p1", "Mammoth Bellow"));
    const elephant = tokensOf(s, "p1", "Elephant")[0] as string;
    expect(pt(s, elephant)).toEqual([5, 5]);
    expect(chars(s, elephant).colors).toEqual(["G"]);
    let t = scenario({
      p1: { battlefield: ["Forest", "Island", "Mountain", "Plains", "Serra Angel"], graveyard: ["Mammoth Bellow"] },
    });
    const card = idOf(t, "p1", "graveyard", "Mammoth Bellow");
    const angel = idOf(t, "p1", "battlefield", "Serra Angel");
    // {5}{G}{U}{R} minus 4 (tapped Serra Angel): four lands are enough.
    t = settle(act(t, "p1", { type: "cast", card, tap: [angel] }));
    expect(tokensOf(t, "p1", "Elephant")).toHaveLength(1);
    expect(exiled(t, "Mammoth Bellow")).toHaveLength(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8: uncommons with several abilities (2)", () => {
  /** Casts the Monument: returns the state and the names of the cards offered by the search. */
  const monumentSearch = (name: string, library: string[]) => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: [name], library } });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", name), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    return { s, offered };
  };

  it("Jeskai Monument: searches for a basic Island, Mountain or Plains; {1}{U}{R}{W}, {T}, sacrifice (sorcery speed): two 1/1 flying Birds", () => {
    const { s: found, offered } = monumentSearch("Jeskai Monument", ["Forest", "Swamp", "Mountain", "Opt"]);
    expect(offered).toEqual(["Mountain"]);
    expect(idsOf(found, "p1", "hand", "Mountain")).toHaveLength(1);
    let s = scenario({
      p1: { battlefield: ["Jeskai Monument", "Island", "Mountain", "Plains", "Plains", "Island"], hand: ["Opt"] },
    });
    const monument = idOf(s, "p1", "battlefield", "Jeskai Monument");
    // Sorcery speed only.
    const busy = cast(s, "p1", "Opt");
    expect(hasActivation(busy, monument, "Birds")).toBe(false);
    s = settle(activateNamed(s, monument, "Birds"));
    const birds = tokensOf(s, "p1", "Bird");
    expect(birds).toHaveLength(2);
    expect(pt(s, birds[0] as string)).toEqual([1, 1]);
    expect(chars(s, birds[0] as string).keywords).toContain("flying");
    expect(chars(s, birds[0] as string).colors).toEqual(["W"]);
    expect(idsOf(s, "p1", "graveyard", "Jeskai Monument")).toHaveLength(1);
  });

  it("Mardu Monument: searches for a Mountain, Plains or Swamp; three 1/1 Warriors with menace and haste this turn", () => {
    const { offered } = monumentSearch("Mardu Monument", ["Forest", "Island", "Swamp"]);
    expect(offered).toEqual(["Swamp"]);
    let s = scenario({ p1: { battlefield: ["Mardu Monument", "Mountain", "Plains", "Swamp", "Swamp", "Swamp"] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Mardu Monument"), "Warriors"));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(3);
    for (const w of warriors) {
      expect(chars(s, w).colors).toEqual(["R"]);
      expect(chars(s, w).keywords).toEqual(expect.arrayContaining(["menace", "haste"]));
    }
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, warriors[0] as string).keywords).not.toContain("menace");
  });

  it("Sultai Monument: searches for a Swamp, Forest or Island; two black 2/2 Zombie Druids", () => {
    const { offered } = monumentSearch("Sultai Monument", ["Plains", "Mountain", "Island"]);
    expect(offered).toEqual(["Island"]);
    let s = scenario({ p1: { battlefield: ["Sultai Monument", "Swamp", "Forest", "Island", "Swamp", "Swamp"] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Sultai Monument"), "Zombie Druids"));
    const zombies = tokensOf(s, "p1", "Zombie Druid");
    expect(zombies).toHaveLength(2);
    expect(pt(s, zombies[0] as string)).toEqual([2, 2]);
    expect(chars(s, zombies[0] as string).colors).toEqual(["B"]);
  });

  it("Temur Monument: searches for a Forest, Island or Mountain; a green 5/5 Elephant", () => {
    const { offered } = monumentSearch("Temur Monument", ["Plains", "Swamp", "Forest"]);
    expect(offered).toEqual(["Forest"]);
    let s = scenario({ p1: { battlefield: ["Temur Monument", "Forest", "Island", "Mountain", ...lands("Forest", 3)] } });
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Temur Monument"), "Elephant"));
    const elephant = tokensOf(s, "p1", "Elephant")[0] as string;
    expect(pt(s, elephant)).toEqual([5, 5]);
    expect(chars(s, elephant).colors).toEqual(["G"]);
  });

  it("Purging Stormbrood: flying; on entering, removes all counters from up to one creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Purging Stormbrood // Absorb Essence"] },
      p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 2, flying: 1 } }] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    // All counters go: no question about their kind.
    const asked: string[] = [];
    s = settle(cast(s, "p1", "Purging Stormbrood // Absorb Essence"), (req, p) => {
      if (req.type === "pick" && req.prompt.includes("which counter to remove")) asked.push(req.prompt);
      return picking([bear])(req, p);
    });
    expect(asked).toEqual([]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Purging Stormbrood // Absorb Essence")).keywords).toContain("flying");
    expect(Object.values(s.objects[bear]?.counters ?? {}).filter((n) => n > 0)).toHaveLength(0);
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Purging Stormbrood: ward - pay 2 life, otherwise the opposing spell that targets it is countered", () => {
    const run = (pay: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Purging Stormbrood // Absorb Essence"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const brood = idOf(s, "p1", "battlefield", "Purging Stormbrood // Absorb Essence");
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Shock", { t: [brood] }), (req) => (req.intent === "unlessPay" ? [pay ? 1 : 0] : undefined));
      return { s, brood };
    };
    const paid = run(true);
    expect(lifeOf(paid.s, "p2")).toBe(18);
    expect(paid.s.objects[paid.brood]?.damage).toBe(2);
    const refused = run(false);
    expect(lifeOf(refused.s, "p2")).toBe(20);
    expect(refused.s.objects[refused.brood]?.damage).toBe(0);
  });

  it("Absorb Essence: +2/+2, lifelink and hexproof until end of turn; the card returns to the library", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Bear Cub"], hand: ["Purging Stormbrood // Absorb Essence"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Purging Stormbrood // Absorb Essence"),
        face: 1,
        targets: { t: [bear] },
      }),
    );
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["lifelink", "hexproof"]));
    expect(namesIn(s, s.players.p1?.library)).toContain("Purging Stormbrood // Absorb Essence");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Rainveil Rejuvenator: on entering, you may mill three cards; {T}: as much {G} as its power", () => {
    const run = (yes: boolean) =>
      settle(
        cast(scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Rainveil Rejuvenator"] } }), "p1", "Rainveil Rejuvenator"),
        answering({ yes }),
      );
    expect(run(true).players.p1?.graveyard).toHaveLength(3);
    expect(run(false).players.p1?.graveyard).toHaveLength(0);
    // Power 2: enough to cast Bear Cub ({1}{G}).
    let s = scenario({ p1: { battlefield: ["Rainveil Rejuvenator"], hand: ["Bear Cub"] } });
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Rainveil Rejuvenator")]?.tapped).toBe(true);
    const big = scenario({
      p1: { battlefield: [{ name: "Rainveil Rejuvenator", counters: { "+1/+1": 3 } }], hand: ["Gnarlid Colony"] },
    });
    // Power 5: {1}{G} plus the kicker {2}{G}.
    const k = settle(cast(big, "p1", "Gnarlid Colony", undefined, { kicked: true }));
    expect(idsOf(k, "p1", "battlefield", "Gnarlid Colony")).toHaveLength(1);
  });

  it("Rally the Monastery: costs {2} less if you cast another spell this turn", () => {
    const castOk = (s: S) => legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Rally the Monastery");
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Island"], hand: ["Opt", "Rally the Monastery"] } });
    expect(castOk(s)).toBe(false);
    s = settle(cast(s, "p1", "Opt"));
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Rally the Monastery", undefined, { mode: 0 }));
    const monks = tokensOf(s, "p1", "Monk");
    expect(monks).toHaveLength(2);
    expect(chars(s, monks[0] as string).keywords).toContain("prowess");
  });

  it("Rally the Monastery: up to two of your creatures +2/+2, or destroy a creature with power 4 or greater", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Llanowar Elves"], hand: ["Rally the Monastery"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
    let s = setup();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(() => cast(s, "p1", "Rally the Monastery", { p: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 1 })).toThrow();
    s = settle(cast(s, "p1", "Rally the Monastery", { p: [bear, elves] }, { mode: 1 }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, elves)).toEqual([3, 3]);
    let t = setup();
    expect(() => cast(t, "p1", "Rally the Monastery", { d: [idOf(t, "p2", "battlefield", "Bear Cub")] }, { mode: 2 })).toThrow();
    t = settle(cast(t, "p1", "Rally the Monastery", { d: [idOf(t, "p2", "battlefield", "Serra Angel")] }, { mode: 2 }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Runescale Stormbrood: a noncreature or Dragon spell you cast gives it +2/+0 until end of turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Runescale Stormbrood // Chilling Screech", "Island", ...lands("Mountain", 6), ...lands("Forest", 2)],
        hand: ["Opt", "Bear Cub", "Shivan Dragon"],
      },
    });
    const brood = idOf(s, "p1", "battlefield", "Runescale Stormbrood // Chilling Screech");
    expect(chars(s, brood).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, brood)).toEqual([4, 4]);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(pt(s, brood)).toEqual([4, 4]);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(pt(s, brood)).toEqual([6, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, brood)).toEqual([2, 4]);
  });

  it("Chilling Screech: counters a spell with mana value 2 or less", () => {
    const setup = (spell: string, landsP2: string[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Island", "Island"], hand: ["Runescale Stormbrood // Chilling Screech"] },
        p2: { battlefield: landsP2, hand: [spell] },
      });
      s = cast(s, "p2", spell, spell === "Lightning Strike" ? { t: ["p1"] } : undefined);
      s = act(s, "p2", { type: "pass" });
      return s;
    };
    let s = setup("Lightning Strike", lands("Mountain", 2));
    const card = idOf(s, "p1", "hand", "Runescale Stormbrood // Chilling Screech");
    s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [s.stack[0]?.id as string] } }));
    expect(lifeOf(s, "p1")).toBe(20);
    expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    const big = setup("Shivan Dragon", lands("Mountain", 6));
    const card2 = idOf(big, "p1", "hand", "Runescale Stormbrood // Chilling Screech");
    expect(() => act(big, "p1", { type: "cast", card: card2, face: 1, targets: { t: [big.stack[0]?.id as string] } })).toThrow();
  });

  it("Disruptive Stormbrood: flying; on entering, destroys up to one artifact or enchantment", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Disruptive Stormbrood // Petty Revenge"] },
      p2: { battlefield: ["Goblin Oriflamme", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Disruptive Stormbrood // Petty Revenge"));
    expect(idsOf(s, "p2", "graveyard", "Goblin Oriflamme")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Disruptive Stormbrood // Petty Revenge")).keywords).toContain("flying");
  });

  it("Petty Revenge: destroys a creature with power 3 or less; the card returns to the library", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Disruptive Stormbrood // Petty Revenge"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Disruptive Stormbrood // Petty Revenge");
    expect(() =>
      act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toContain("Disruptive Stormbrood // Petty Revenge");
  });

  it("Starry-Eyed Skyrider: when attacking, another of your creatures gains flying; your attacking tokens have flying", () => {
    let s = scenario({ p1: { battlefield: ["Starry-Eyed Skyrider", "Dalkovan Packbeasts", "Bear Cub"] } });
    const sky = idOf(s, "p1", "battlefield", "Starry-Eyed Skyrider");
    const beasts = idOf(s, "p1", "battlefield", "Dalkovan Packbeasts");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, sky).keywords).toContain("flying");
    let options: string[] = [];
    s = settleNoBlocks(attack(s, [sky, beasts]), (req) => {
      if (req.type === "pick" && req.intent === "triggerTarget" && req.options.includes(bear)) {
        options = req.options;
        return [bear];
      }
      return undefined;
    });
    expect(options).not.toContain(sky);
    expect(chars(s, bear).keywords).toContain("flying");
    expect(chars(s, beasts).keywords).not.toContain("flying");
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(3);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("flying");
  });

  it("Static Snare: flash, {1} less per attacking creature; exiles an opposing artifact or creature as long as it stays", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Static Snare"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const castOk = (x: S) => legalActions(x, "p1").some((a) => a.type === "cast" && nameOf(x, a.card) === "Static Snare");
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(s)).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p2", {
      type: "declareAttackers",
      attackers: [
        { id: angel, defender: "p1" },
        { id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" },
      ],
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castOk(s)).toBe(true);
    s = settle(cast(s, "p1", "Static Snare"), picking([angel]));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    const snare = idOf(s, "p1", "battlefield", "Static Snare");
    destroy(s, snare);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Stormbeacon Blade: +3/+0; when the equipped creature attacks, draw if you control three or more attackers", () => {
    const run = (attackers: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Stormbeacon Blade", "Bear Cub", "Llanowar Elves", "Serra Angel", "Plains", "Plains"] },
      });
      const blade = idOf(s, "p1", "battlefield", "Stormbeacon Blade");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activateNamed(s, blade, "Equip", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 2]);
      s = settleNoBlocks(
        attack(
          s,
          attackers.map((n) => idOf(s, "p1", "battlefield", n)),
        ),
      );
      return handSize(s, "p1");
    };
    expect(run(["Bear Cub", "Llanowar Elves", "Serra Angel"])).toBe(1);
    expect(run(["Bear Cub", "Llanowar Elves"])).toBe(0);
    // The equipped creature doesn't attack: nothing.
    expect(run(["Llanowar Elves", "Serra Angel"])).toBe(0);
  });

  it("Sunset Strikemaster: {T}: {R}; {2}{R}, {T}, sacrifice: 6 damage to a creature with flying", () => {
    let s = scenario({
      p1: { battlefield: ["Sunset Strikemaster", ...lands("Mountain", 3)] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const sm = idOf(s, "p1", "battlefield", "Sunset Strikemaster");
    expect(() => activateNamed(s, sm, "6 damage", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
    s = settle(activateNamed(s, sm, "6 damage", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Sunset Strikemaster")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Sunset Strikemaster"], hand: ["Shock"] } });
    t = settle(cast(t, "p1", "Shock", { t: ["p2"] }));
    expect(lifeOf(t, "p2")).toBe(18);
  });

  it("Synchronized Charge: two +1/+1 counters divided between one or two of your creatures; your creatures with counters gain vigilance and trample", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest", "Forest", "Bear Cub", "Llanowar Elves", { name: "Ambling Stormshell", counters: { "+1/+1": 1 } }],
        hand: ["Synchronized Charge"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    expect(() => cast(s, "p1", "Synchronized Charge", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
    s = settle(cast(s, "p1", "Synchronized Charge", { t: [bear] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(chars(s, shell).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(chars(s, elves).keywords).not.toContain("trample");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Unrooted Ancestor: flash; {1}, sacrifice another creature: indestructible until end of turn, and it taps", () => {
    const alone = scenario({ p1: { battlefield: ["Unrooted Ancestor", "Swamp"] } });
    expect(hasActivation(alone, idOf(alone, "p1", "battlefield", "Unrooted Ancestor"), "Sacrifice")).toBe(false);
    let s = scenario({ p1: { battlefield: ["Unrooted Ancestor", "Swamp", "Bear Cub"] } });
    const ancestor = idOf(s, "p1", "battlefield", "Unrooted Ancestor");
    s = settle(activateNamed(s, ancestor, "Sacrifice", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[ancestor]?.tapped).toBe(true);
    expect(chars(s, ancestor).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, ancestor).keywords).not.toContain("indestructible");
  });
});

describe("Tarkir: Dragonstorm, lot K8: uncommons with several abilities (3)", () => {
  it("Ureni's Rebuff: returns a creature to its owner's hand; harmonize {5}{U} from the graveyard", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Island"], hand: ["Ureni's Rebuff"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Ureni's Rebuff", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Ureni's Rebuff")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: [...lands("Island", 4), "Bear Cub"], graveyard: ["Ureni's Rebuff"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    // {5}{U} minus 2 (tapped Bear Cub): four Islands.
    t = settle(
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "graveyard", "Ureni's Rebuff"),
        targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
        tap: [idOf(t, "p1", "battlefield", "Bear Cub")],
      }),
    );
    expect(idsOf(t, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(exiled(t, "Ureni's Rebuff")).toHaveLength(1);
  });

  it("Veteran Ice Climber: vigilance, unblockable; when attacking, up to one targeted player mills as many cards as its power", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Veteran Ice Climber", counters: { "+1/+1": 2 } }] } });
    const climber = idOf(s, "p1", "battlefield", "Veteran Ice Climber");
    expect(chars(s, climber).keywords).toEqual(expect.arrayContaining(["vigilance", "unblockable"]));
    s = settleNoBlocks(attack(s, [climber]), picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(3);
    expect(s.objects[climber]?.tapped).toBe(false);
  });

  it("War Effort: your creatures get +1/+0; when you attack, a tapped and attacking 1/1 Warrior, sacrificed at the end step", () => {
    let s = scenario({ p1: { battlefield: ["War Effort", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = settleNoBlocks(attack(s, [bear]));
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(1);
    expect(s.objects[warriors[0] as string]?.tapped).toBe(true);
    expect(pt(s, warriors[0] as string)).toEqual([2, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(lifeOf(s, "p2")).toBe(15);
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
  });

  it("Wayspeaker Bodyguard: on entering, a nonland permanent card with MV 2 or less from your graveyard returns to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Wayspeaker Bodyguard"],
        graveyard: ["Serra Angel", "Forest", "Shock", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Wayspeaker Bodyguard"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Serra Angel", "Shock"]);
  });

  it("Wayspeaker Bodyguard: flurry - tap an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Wayspeaker Bodyguard", "Island", "Island", "Bear Cub"], hand: ["Opt", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(s.objects[angel]?.tapped).toBe(false);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
  });

  it("Zurgo's Vanguard: its power is equal to the number of creatures you control; mobilize 1", () => {
    let s = scenario({ p1: { battlefield: ["Zurgo's Vanguard", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const vanguard = idOf(s, "p1", "battlefield", "Zurgo's Vanguard");
    expect(pt(s, vanguard)).toEqual([2, 3]);
    s = settleNoBlocks(attack(s, [vanguard]));
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(1);
    expect(pt(s, vanguard)).toEqual([3, 3]);
  });

  it("Riverwheel Sweep: taps a creature, three stun counters; exiles two cards, one playable until the end of your next turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Island", "Mountain", "Plains"],
        hand: ["Riverwheel Sweep"],
        library: ["Plains", "Island", ...lands("Forest", 4)],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Riverwheel Sweep", { t: [angel] }), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "impulse") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => nameOf(cur, id) === "Island");
    });
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(3);
    expect(offered.sort()).toEqual(["Island", "Plains"]);
    const playable = (x: S, name: string) =>
      legalActions(x, "p1").some((a) => a.type === "playLand" && a.card === exiled(x, name)[0]);
    expect(playable(s, "Island")).toBe(true);
    expect(playable(s, "Plains")).toBe(false);
    s = nextMain(s);
    expect(playable(s, "Island")).toBe(true);
  });

  it("Duty Beyond Death: sacrifice a creature as a cost; your creatures gain indestructible and a +1/+1 counter", () => {
    const none = scenario({ p1: { battlefield: ["Plains", "Plains"], hand: ["Duty Beyond Death"] } });
    expect(legalActions(none, "p1").some((a) => a.type === "cast" && nameOf(none, a.card) === "Duty Beyond Death")).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Bear Cub", "Llanowar Elves"], hand: ["Duty Beyond Death"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Duty Beyond Death", undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, elves).keywords).toContain("indestructible");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, elves).keywords).not.toContain("indestructible");
  });

  it("Desperate Measures: +1/-1; when it dies under your control this turn, draw two cards", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Llanowar Elves"], hand: ["Desperate Measures"] } });
    s = settle(cast(s, "p1", "Desperate Measures", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(2);
    // An opposing creature that dies: not under your control.
    let t = scenario({ p1: { battlefield: ["Swamp"], hand: ["Desperate Measures"] }, p2: { battlefield: ["Llanowar Elves"] } });
    t = settle(cast(t, "p1", "Desperate Measures", { t: [idOf(t, "p2", "battlefield", "Llanowar Elves")] }));
    expect(idsOf(t, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(handSize(t, "p1")).toBe(0);
    // It survives, then dies later in the turn: draw two cards.
    let u = scenario({ p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Desperate Measures", "Shock"] } });
    const bear = idOf(u, "p1", "battlefield", "Bear Cub");
    u = settle(cast(u, "p1", "Desperate Measures", { t: [bear] }));
    expect(pt(u, bear)).toEqual([3, 1]);
    expect(handSize(u, "p1")).toBe(1);
    u = settle(cast(u, "p1", "Shock", { t: [bear] }));
    expect(handSize(u, "p1")).toBe(2);
  });

  it("Salt Road Skirmish: destroys a creature; two 1/1 Warriors with haste, sacrificed at the end step", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Salt Road Skirmish"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Salt Road Skirmish", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    const warriors = tokensOf(s, "p1", "Warrior");
    expect(warriors).toHaveLength(2);
    for (const w of warriors) expect(chars(s, w).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(0);
  });

  it("Sonic Shrieker: flying; 2 damage to any target and you gain 2 life; a damaged player discards a card", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Mountain", "Plains", "Swamp", ...lands("Swamp", 3)], hand: ["Sonic Shrieker"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Island"] },
      });
    const s = settle(cast(setup(), "p1", "Sonic Shrieker"), picking(["p2"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Sonic Shrieker")).keywords).toContain("flying");
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
    expect(handSize(s, "p2")).toBe(1);
    let t = setup();
    t = settle(cast(t, "p1", "Sonic Shrieker"), picking([idOf(t, "p2", "battlefield", "Bear Cub")]));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(lifeOf(t, "p1")).toBe(22);
    expect(handSize(t, "p2")).toBe(2);
    // Damage prevented: the player is not dealt damage "this way", no discard (PLAN-L L4).
    const u = setup();
    addPlayerEffect(u, "p2", { replacement: { event: "damage", to: "you", modify: { prevent: true } } }, u.turn.number, true);
    const v = settle(cast(u, "p1", "Sonic Shrieker"), picking(["p2"]));
    expect([lifeOf(v, "p1"), lifeOf(v, "p2")]).toEqual([22, 20]);
    expect(handSize(v, "p2")).toBe(2);
  });

  it("Shocking Sharpshooter: reach; another of your creatures enters: 1 damage to a targeted opponent", () => {
    let s = scenario({ p1: { battlefield: ["Shocking Sharpshooter", "Forest", "Forest"], hand: ["Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Shocking Sharpshooter")).keywords).toContain("reach");
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(lifeOf(s, "p2")).toBe(19);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Shocking Sharpshooter"] },
      p2: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(lifeOf(t, "p2")).toBe(20);
    expect(lifeOf(t, "p1")).toBe(20);
  });

  it("Wingblade Disciple: flying; flurry - a 1/1 white flying Bird", () => {
    let s = scenario({ p1: { battlefield: ["Wingblade Disciple", "Island", "Island", "Island"], hand: ["Opt", "Opt", "Opt"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Wingblade Disciple")).keywords).toContain("flying");
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(tokensOf(s, "p1", "Bird")).toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    s = settle(act(s, "p1", { type: "cast", card: opts[2] as string }));
    const birds = tokensOf(s, "p1", "Bird");
    expect(birds).toHaveLength(1);
    expect(chars(s, birds[0] as string).keywords).toContain("flying");
    expect(chars(s, birds[0] as string).colors).toEqual(["W"]);
  });

  it("Overwhelming Surge: one or both - 3 damage to a creature; destroy a noncreature artifact", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Overwhelming Surge"] },
        p2: { battlefield: ["Serra Angel", "Hedron Archive"] },
      });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const archive = idOf(s, "p2", "battlefield", "Hedron Archive");
    s = settle(cast(s, "p1", "Overwhelming Surge", { t: [angel], a: [archive] }, { mode: 2 }));
    expect(s.objects[angel]?.damage).toBe(3);
    expect(idsOf(s, "p2", "graveyard", "Hedron Archive")).toHaveLength(1);
    let t = setup();
    t = settle(cast(t, "p1", "Overwhelming Surge", { a: [idOf(t, "p2", "battlefield", "Hedron Archive")] }, { mode: 1 }));
    expect(idsOf(t, "p2", "graveyard", "Hedron Archive")).toHaveLength(1);
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
    const u = setup();
    // A creature is not a noncreature artifact.
    expect(() =>
      cast(u, "p1", "Overwhelming Surge", { a: [idOf(u, "p2", "battlefield", "Serra Angel")] }, { mode: 1 }),
    ).toThrow();
  });

  it("Jeskai Brushmaster: double strike and prowess", () => {
    let s = scenario({ p1: { battlefield: ["Jeskai Brushmaster", "Island"], hand: ["Opt"] } });
    const bm = idOf(s, "p1", "battlefield", "Jeskai Brushmaster");
    expect(chars(s, bm).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, bm)).toEqual([3, 5]);
  });

  it("Jeskai Shrinekeeper: flying, haste; deals combat damage to a player: you gain 1 life and draw a card", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Jeskai Shrinekeeper", sick: true }] } });
    const keeper = idOf(s, "p1", "battlefield", "Jeskai Shrinekeeper");
    expect(chars(s, keeper).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = settleNoBlocks(attack(s, [keeper]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(17);
    expect(lifeOf(s, "p1")).toBe(21);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Dragon Sniper: reach, vigilance, deathtouch", () => {
    const s = scenario({ p1: { battlefield: ["Dragon Sniper"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragon Sniper")).keywords).toEqual(
      expect.arrayContaining(["reach", "vigilance", "deathtouch"]),
    );
  });

  it("Kishla Skimmer: flying; a card leaves your graveyard during your turn: draw, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kishla Skimmer", ...lands("Swamp", 4), "Bear Cub"],
        graveyard: ["Alchemist's Assistant", "Alchemist's Assistant"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Kishla Skimmer")).keywords).toContain("flying");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const renewOne = (x: S) =>
      settle(activateNamed(x, idOf(x, "p1", "graveyard", "Alchemist's Assistant"), "Renew", { targets: { t: [bear] } }));
    s = renewOne(s);
    expect(handSize(s, "p1")).toBe(1);
    s = renewOne(s);
    expect(handSize(s, "p1")).toBe(1);
  });
});

describe("Tarkir: Dragonstorm, lot K8: uncommons (4)", () => {
  /** Can the named card be cast from p1's hand? */
  const castOk = (s: S, name: string) =>
    legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

  it("Attuned Hunter: trample; one or more cards leave your graveyard during your turn: a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Attuned Hunter", "Swamp", "Swamp"], graveyard: ["Alchemist's Assistant"] } });
    const hunter = idOf(s, "p1", "battlefield", "Attuned Hunter");
    expect(chars(s, hunter).keywords).toContain("trample");
    s = settle(activateNamed(s, idOf(s, "p1", "graveyard", "Alchemist's Assistant"), "Renew", { targets: { t: [hunter] } }));
    expect(s.objects[hunter]?.counters["+1/+1"]).toBe(1);
  });

  it("Bewildering Blizzard: draw three cards; opposing creatures get -3/-0 until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Bewildering Blizzard"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Bewildering Blizzard"));
    expect(handSize(s, "p1")).toBe(3);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(pt(s, angel)).toEqual([1, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Cori Mountain Stalwart: flurry - 2 damage to each opponent and you gain 2 life", () => {
    let s = scenario({ p1: { battlefield: ["Cori Mountain Stalwart", "Island", "Island"], hand: ["Opt", "Opt"] } });
    const opts = idsOf(s, "p1", "hand", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opts[0] as string }));
    expect(lifeOf(s, "p2")).toBe(20);
    s = settle(act(s, "p1", { type: "cast", card: opts[1] as string }));
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
  });

  it("Dalkovan Packbeasts: 0/4, vigilance; mobilize 3", () => {
    let s = scenario({ p1: { battlefield: ["Dalkovan Packbeasts"] } });
    const beasts = idOf(s, "p1", "battlefield", "Dalkovan Packbeasts");
    expect(pt(s, beasts)).toEqual([0, 4]);
    expect(chars(s, beasts).keywords).toContain("vigilance");
    s = settleNoBlocks(attack(s, [beasts]));
    expect(tokensOf(s, "p1", "Warrior")).toHaveLength(3);
    expect(s.objects[beasts]?.tapped).toBe(false);
  });

  it("Defibrillating Current: 4 damage to a creature or planeswalker, and you gain 2 life", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Plains", "Swamp"], hand: ["Defibrillating Current"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() => cast(s, "p1", "Defibrillating Current", { t: ["p2"] })).toThrow();
    s = settle(cast(s, "p1", "Defibrillating Current", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(lifeOf(s, "p1")).toBe(22);
  });

  it("Descendant of Storms: when attacking, you may pay {1}{W}; if you do, it endures 1", () => {
    const run = (pay: boolean) => {
      let s = scenario({ p1: { battlefield: ["Descendant of Storms", "Plains", "Plains"] } });
      const d = idOf(s, "p1", "battlefield", "Descendant of Storms");
      s = settleNoBlocks(attack(s, [d]), answering({ yes: pay, endure: "counters" }));
      return { s, d };
    };
    const yes = run(true);
    expect(yes.s.objects[yes.d]?.counters["+1/+1"]).toBe(1);
    const no = run(false);
    expect(no.s.objects[no.d]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(tokensOf(no.s, "p1", "Spirit")).toHaveLength(0);
  });

  it("Dragonclaw Strike: doubles the power and toughness of one of your creatures, then it fights up to one opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Island", "Mountain", "Ambling Stormshell"], hand: ["Dragonclaw Strike"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const shell = idOf(s, "p1", "battlefield", "Ambling Stormshell");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Dragonclaw Strike", { a: [angel] })).toThrow();
    s = settle(cast(s, "p1", "Dragonclaw Strike", { a: [shell], b: [angel] }));
    expect(pt(s, shell)).toEqual([10, 18]);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[shell]?.damage).toBe(4);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, shell)).toEqual([5, 9]);
    // Without an opposing creature: the creature is only doubled.
    let t = scenario({ p1: { battlefield: ["Forest", "Island", "Mountain", "Bear Cub"], hand: ["Dragonclaw Strike"] } });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Dragonclaw Strike", { a: [bear] }));
    expect(pt(t, bear)).toEqual([4, 4]);
  });

  it("Dragonstorm Forecaster: {2}, {T}: searches for a card named Dragonstorm Globe or Boulderborn Dragon", () => {
    let s = scenario({
      p1: {
        battlefield: ["Dragonstorm Forecaster", "Island", "Island"],
        library: ["Shivan Dragon", "Boulderborn Dragon", "Dragonstorm Globe"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(activateNamed(s, idOf(s, "p1", "battlefield", "Dragonstorm Forecaster"), "Search"), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => nameOf(cur, id) === "Dragonstorm Globe");
    });
    expect(offered.sort()).toEqual(["Boulderborn Dragon", "Dragonstorm Globe"]);
    expect(idsOf(s, "p1", "hand", "Dragonstorm Globe")).toHaveLength(1);
  });

  it("Gurmag Rakshasa: menace; on entering, an opposing creature gets -2/-2 and one of yours +2/+2 until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 6), "Bear Cub"], hand: ["Gurmag Rakshasa"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Gurmag Rakshasa"), picking([bear]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Gurmag Rakshasa")).keywords).toContain("menace");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Hardened Tactician: {1}, sacrifice a token: draw a card", () => {
    let s = scenario({
      p1: { battlefield: ["Hardened Tactician", "Mountain", "Mountain", "Plains", "Bear Cub"], hand: ["Dragon Fodder"] },
    });
    const tactician = idOf(s, "p1", "battlefield", "Hardened Tactician");
    // A nontoken creature doesn't pay the cost.
    expect(hasActivation(s, tactician, "Sacrifice")).toBe(false);
    s = settle(cast(s, "p1", "Dragon Fodder"));
    const goblin = tokensOf(s, "p1", "Goblin")[0] as string;
    s = settle(activateNamed(s, tactician, "Sacrifice", { sacrifice: [goblin] }));
    expect(tokensOf(s, "p1", "Goblin")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
  });

  it("Inspirited Vanguard: on entering or when attacking, it endures 2", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Inspirited Vanguard"] } });
    s = settle(cast(s, "p1", "Inspirited Vanguard"), answering({ endure: "counters" }));
    const v = idOf(s, "p1", "battlefield", "Inspirited Vanguard");
    expect(s.objects[v]?.counters["+1/+1"]).toBe(2);
    let t = scenario({ p1: { battlefield: ["Inspirited Vanguard"] } });
    t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Inspirited Vanguard")]), answering({ endure: "token" }));
    const spirit = tokensOf(t, "p1", "Spirit")[0] as string;
    expect(pt(t, spirit)).toEqual([2, 2]);
  });

  it("Iridescent Tiger: on entering, if you cast it, add {W}{U}{B}{R}{G}", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Iridescent Tiger"] } });
    s = settle(cast(s, "p1", "Iridescent Tiger"));
    const pool = s.players.p1?.manaPool;
    expect([pool?.W, pool?.U, pool?.B, pool?.R, pool?.G]).toEqual([1, 1, 1, 1, 1]);
    let t = scenario({
      p1: { battlefield: ["Plains", "Swamp", ...lands("Forest", 4)], hand: ["Perennation"], graveyard: ["Iridescent Tiger"] },
    });
    t = settle(cast(t, "p1", "Perennation", { t: [idOf(t, "p1", "graveyard", "Iridescent Tiger")] }));
    expect(idsOf(t, "p1", "battlefield", "Iridescent Tiger")).toHaveLength(1);
    expect(t.players.p1?.manaPool.W ?? 0).toBe(0);
  });

  it("Kin-Tree Severance: exiles a permanent with mana value 3 or greater", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Kin-Tree Severance"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Kin-Tree Severance", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(cast(s, "p1", "Kin-Tree Severance", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
  });

  it("Kishla Trawlers: you may exile a creature card from your graveyard; if you do, an instant or sorcery returns to hand", () => {
    const run = (graveyard: string[], yes: boolean) =>
      settle(
        cast(
          scenario({ p1: { battlefield: lands("Island", 3), hand: ["Kishla Trawlers"], graveyard } }),
          "p1",
          "Kishla Trawlers",
        ),
        answering({ yes }),
      );
    const s = run(["Bear Cub", "Shock"], true);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Shock")).toHaveLength(1);
    const no = run(["Bear Cub", "Shock"], false);
    expect(idsOf(no, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(no, "p1", "hand", "Shock")).toHaveLength(0);
    const noCreature = run(["Forest", "Shock"], true);
    expect(idsOf(noCreature, "p1", "hand", "Shock")).toHaveLength(0);
  });

  it("Knockout Maneuver: a +1/+1 counter on one of your creatures, then it deals damage equal to its power to an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Knockout Maneuver"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Knockout Maneuver", { a: [bear], b: [angel] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[angel]?.damage).toBe(3);
    // One-sided damage.
    expect(s.objects[bear]?.damage).toBe(0);
  });

  it("Lie in Wait: a creature card from your graveyard returns to hand; damage equal to its power to a creature", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Forest", "Island"], hand: ["Lie in Wait"], graveyard: ["Serra Angel"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(
      cast(s, "p1", "Lie in Wait", {
        c: [idOf(s, "p1", "graveyard", "Serra Angel")],
        d: [idOf(s, "p2", "battlefield", "Serra Angel")],
      }),
    );
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Loxodon Battle Priest: at the beginning of combat on your turn, a +1/+1 counter on another of your creatures", () => {
    let s = scenario({ p1: { battlefield: ["Loxodon Battle Priest", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Loxodon Battle Priest")]?.counters["+1/+1"] ?? 0).toBe(0);
    // During the opponent's turn: nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Marshal of the Lost: deathtouch; when you attack, a creature gets +X/+X (X: the attacking creatures)", () => {
    let s = scenario({ p1: { battlefield: ["Marshal of the Lost", "Bear Cub"] } });
    const marshal = idOf(s, "p1", "battlefield", "Marshal of the Lost");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, marshal).keywords).toContain("deathtouch");
    s = settleNoBlocks(attack(s, [marshal, bear]), picking([bear]));
    expect(pt(s, bear)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Triome lands: enter tapped; {T}: one of their three colors", () => {
    const colorSpells: Record<string, string> = { W: "Fleeting Flight", U: "Opt", B: "Duress", R: "Shock", G: "Llanowar Elves" };
    const cases: [string, string[]][] = [
      ["Frontier Bivouac", ["G", "U", "R"]],
      ["Mystic Monastery", ["U", "R", "W"]],
      ["Nomad Outpost", ["R", "W", "B"]],
      ["Opulent Palace", ["B", "G", "U"]],
      ["Sandsteppe Citadel", ["W", "B", "G"]],
    ];
    for (const [land, colors] of cases) {
      expect(landEntersTapped(land, [])).toBe(true);
      const s = scenario({ p1: { battlefield: [land, "Bear Cub"], hand: Object.values(colorSpells) } });
      for (const [c, spell] of Object.entries(colorSpells))
        expect([land, c, castOk(s, spell)]).toEqual([land, c, colors.includes(c)]);
    }
  });

  it("Rakshasa's Bargain: look at four cards, two to hand, the rest to the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Island"],
        hand: ["Rakshasa's Bargain"],
        library: ["Opt", "Shock", "Bear Cub", "Plains", "Island"],
      },
    });
    let min = -1;
    s = settle(cast(s, "p1", "Rakshasa's Bargain"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      min = req.min;
      return req.options.filter((id) => ["Shock", "Bear Cub"].includes(nameOf(cur, id) ?? ""));
    });
    expect(min).toBe(2);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Shock"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Plains", "Rakshasa's Bargain"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
  });

  it("Rite of Renewal: up to two permanent cards return to hand; a player shuffles up to four cards from their graveyard; exiled", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Rite of Renewal"], graveyard: ["Bear Cub", "Serra Angel", "Shock"] },
      p2: { graveyard: lands("Plains", 3), library: lands("Island", 5) },
    });
    const shock = idOf(s, "p1", "graveyard", "Shock");
    const plains = s.players.p2?.graveyard.slice(0, 2) as string[];
    // An instant card is not a permanent card.
    expect(() => cast(s, "p1", "Rite of Renewal", { p: [shock], pl: ["p2"], c: plains })).toThrow();
    s = settle(
      cast(s, "p1", "Rite of Renewal", {
        p: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")],
        pl: ["p2"],
        c: plains,
      }),
    );
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    expect(s.players.p2?.library).toHaveLength(7);
    expect(exiled(s, "Rite of Renewal")).toHaveLength(1);
  });

  it("Rite of Renewal: the shuffled cards come from the targeted player's graveyard (PLAN-A A4a)", () => {
    const s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Rite of Renewal"], graveyard: ["Bear Cub"] },
      p2: { graveyard: lands("Plains", 2) },
    });
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const plains = s.players.p2?.graveyard.slice(0, 1) as string[];
    // "Target player shuffles up to four target cards from their graveyard": not those from another graveyard.
    expect(() => cast(s, "p1", "Rite of Renewal", { p: [], pl: ["p1"], c: plains })).toThrow(RulesError);
    // The offered option links the cards to the targeted player (interface, AI).
    const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Rite of Renewal"));
    const spec = option?.type === "cast" ? option.modes[0]?.targets.find((t) => t.id === "c") : undefined;
    expect(spec?.ofTarget?.id).toBe("pl");
    expect(spec?.ofTarget?.holders[bear]).toBe("p1");
    const t = settle(cast(s, "p1", "Rite of Renewal", { p: [], pl: ["p1"], c: [bear] }));
    expect(namesIn(t, t.players.p1?.library)).toContain("Bear Cub");
    expect(t.players.p2?.graveyard).toHaveLength(2);
  });

  it("Skirmish Rhino: trample; on entering, each opponent loses 2 life and you gain 2", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Forest"], hand: ["Skirmish Rhino"] } });
    s = settle(cast(s, "p1", "Skirmish Rhino"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Skirmish Rhino")).keywords).toContain("trample");
    expect([lifeOf(s, "p1"), lifeOf(s, "p2")]).toEqual([22, 18]);
  });

  it("Traveling Botanist: tapped, look at the top card; a land may go to hand, otherwise the card may go to the graveyard", () => {
    const run = (top: string, yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Traveling Botanist"], library: [top, ...lands("Island", 4)] } });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Traveling Botanist")]), (req) => {
        if (req.type === "yesNo") return [yes ? 1 : 0];
        if (req.type === "pick") return yes ? req.options.slice(0, 1) : [];
        return undefined;
      });
      return s;
    };
    const land = run("Forest", true);
    expect(idsOf(land, "p1", "hand", "Forest")).toHaveLength(1);
    const keep = run("Forest", false);
    expect(nameOf(keep, keep.players.p1?.library[0] as string)).toBe("Forest");
    const mill = run("Opt", true);
    expect(idsOf(mill, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(mill, "p1", "hand", "Opt")).toHaveLength(0);
    const stay = run("Opt", false);
    expect(nameOf(stay, stay.players.p1?.library[0] as string)).toBe("Opt");
  });

  it("Unsparing Boltcaster: on entering, 5 damage to an opposing creature that was dealt damage this turn", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Shock", "Unsparing Boltcaster"] },
      p2: { battlefield: ["Serra Angel", "Ambling Stormshell"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Shock", { t: [angel] }));
    s = settle(cast(s, "p1", "Unsparing Boltcaster"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Ambling Stormshell")]?.damage).toBe(0);
    // Without a damaged creature: no target.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Unsparing Boltcaster"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Unsparing Boltcaster"));
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Wail of War: the creatures of a targeted opponent get -1/-1, or up to two creature cards return to hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Wail of War"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Wail of War", { p: ["p2"] }, { mode: 0 }));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Wail of War"], graveyard: ["Bear Cub", "Serra Angel", "Forest"] },
    });
    t = settle(
      cast(
        t,
        "p1",
        "Wail of War",
        { g: [idOf(t, "p1", "graveyard", "Bear Cub"), idOf(t, "p1", "graveyard", "Serra Angel")] },
        { mode: 1 },
      ),
    );
    expect(namesIn(t, t.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  it("Yathan Tombguard: menace; one of your creatures with a counter deals combat damage to a player: draw a card, lose 1 life", () => {
    let s = scenario({
      p1: { battlefield: ["Yathan Tombguard", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Yathan Tombguard")).keywords).toContain("menace");
    s = settleNoBlocks(
      attack(s, [
        idOf(s, "p1", "battlefield", "Bear Cub"),
        idOf(s, "p1", "battlefield", "Llanowar Elves"),
        idOf(s, "p1", "battlefield", "Yathan Tombguard"),
      ]),
    );
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(lifeOf(s, "p2")).toBe(14);
    expect(handSize(s, "p1")).toBe(1);
    expect(lifeOf(s, "p1")).toBe(19);
  });
});

describe('Tarkir: Dragonstorm, lot K8: "your graveyard"', () => {
  it("a card leaving the opponent's graveyard doesn't count (Essence Anchor, Kheru Goldkeeper, Attuned Hunter, Kishla Skimmer)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Essence Anchor", "Kheru Goldkeeper", "Attuned Hunter", "Kishla Skimmer", "Forest", "Forest"],
        hand: ["Heritage Reclamation"],
      },
      p2: { graveyard: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Heritage Reclamation", { g: [idOf(s, "p2", "graveyard", "Bear Cub")] }, { mode: 2 }));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    // The only card drawn is Heritage Reclamation's.
    expect(handSize(s, "p1")).toBe(1);
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Attuned Hunter")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(hasActivation(s, idOf(s, "p1", "battlefield", "Essence Anchor"), "Zombie")).toBe(false);
  });

  it("during the opponent's turn, a card leaving your graveyard triggers nothing (Kheru Goldkeeper, Attuned Hunter, Kishla Skimmer)", () => {
    let s = scenario({
      active: "p2",
      p1: {
        battlefield: ["Kheru Goldkeeper", "Attuned Hunter", "Kishla Skimmer", "Forest", "Forest"],
        hand: ["Heritage Reclamation"],
        graveyard: ["Bear Cub"],
      },
    });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", "Heritage Reclamation", { g: [idOf(s, "p1", "graveyard", "Bear Cub")] }, { mode: 2 }));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    expect(handSize(s, "p1")).toBe(1);
    expect(tokensOf(s, "p1", "Treasure")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Attuned Hunter")]?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Contempler (PLAN-D, D2)", () => {
  const castWith = (s: GameState, name: string, extra: Record<string, unknown>) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
  const beholdPick = (s: GameState, name: string) => {
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
    return opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "behold") : undefined;
  };

  it("Caustic Exhale: behold a Dragon from hand (revealed) or pay {1}; without a Dragon, {1} more", () => {
    // A Dragon in hand: offered, revealed; the spell costs {B}.
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", "Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const pick = beholdPick(s, "Caustic Exhale");
    expect(pick?.optional).toBe(true);
    expect(pick?.options).toEqual([idOf(s, "p1", "hand", "Shivan Dragon")]);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(castWith(s, "Caustic Exhale", { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // Declining to behold: {1} more, impossible with a single Swamp.
    const t = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale", "Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(() =>
      castWith(t, "Caustic Exhale", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }, picks: { behold: [] } }),
    ).toThrow(RulesError);
    // Without a Dragon: not offered, {1}{B}.
    const u = scenario({ p1: { battlefield: ["Swamp"], hand: ["Caustic Exhale"] }, p2: { battlefield: ["Bear Cub"] } });
    expect(legalActions(u, "p1").some((a) => a.type === "cast" && a.card === idOf(u, "p1", "hand", "Caustic Exhale"))).toBe(
      false,
    );
  });

  it('Dispelling Exhale: beholding is done on cast; the Dragon gone afterwards, the spell remains "beheld" ({4})', () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [...lands("Island", 2), "Shivan Dragon"], hand: ["Dispelling Exhale"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shock"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
    const shock = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dispelling Exhale"), targets: { t: [shock] } });
    expect(s.stack.at(-1)?.cast?.beheld).toBe(true);
    // The Dragon leaves the battlefield before resolution: the spell was still cast by beholding.
    destroy(s, idOf(s, "p1", "battlefield", "Shivan Dragon"));
    let asked = "";
    for (let i = 0; i < 20 && s.stack.length > 0; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        asked = p.request.prompt;
        s = act(s, p.player, { type: "choose", values: p.request.type === "yesNo" ? [0] : p.request.suggested });
      } else break;
    }
    expect(asked).toContain("{4}");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Molten Exhale: as though it had flash only by beholding a Dragon", () => {
    const setup = () =>
      scenario({
        active: "p2",
        p1: { battlefield: lands("Mountain", 2), hand: ["Molten Exhale", "Shivan Dragon"] },
        p2: { battlefield: ["Bear Cub"] },
      });
    let s = act(setup(), "p2", { type: "pass" });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => castWith(s, "Molten Exhale", { targets: { t: [bear] }, picks: { behold: [] } })).toThrow(RulesError);
    s = settle(castWith(s, "Molten Exhale", { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Sarkhan, Dragon Ascendant: on entering, you may behold a Dragon; if you do, a Treasure", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Sarkhan, Dragon Ascendant", "Shivan Dragon"] } });
      s = castWith(s, "Sarkhan, Dragon Ascendant", {});
      let asked = false;
      for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice" && p.request.type === "pick") {
          asked = true;
          s = act(s, p.player, { type: "choose", values: yes ? p.request.suggested : [] });
        } else break;
      }
      return { asked, treasures: idsOf(s, "p1", "battlefield", "Treasure").length };
    };
    expect(run(true)).toEqual({ asked: true, treasures: 1 });
    expect(run(false)).toEqual({ asked: true, treasures: 0 });
  });
});

describe("Tarkir: Dragonstorm: approximations lifted (lot A1)", () => {
  it("Claim Territory: a single search for up to two basic Forests; one, of your choice, enters tapped, the other goes to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["Bloomvine Regent // Claim Territory"],
        library: ["Forest", "Forest", "Island", "Forest"],
      },
    });
    const card = idOf(s, "p1", "hand", "Bloomvine Regent // Claim Territory");
    const paid = idsOf(s, "p1", "battlefield", "Forest");
    const searches: number[] = [];
    s = settle(act(s, "p1", { type: "cast", card, face: 1 }), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      if (req.intent === "search") {
        searches.push(req.max);
        expect(namesIn(cur, req.options)).toEqual(["Forest", "Forest", "Forest"]);
        return req.options.slice(0, 2);
      }
      // Both Forests found: the player chooses which one enters the battlefield.
      expect(req.options).toHaveLength(2);
      return [req.options[1] as string];
    });
    expect(searches).toEqual([2]);
    const found = idsOf(s, "p1", "battlefield", "Forest").filter((id) => !paid.includes(id));
    expect(found).toHaveLength(1);
    expect(s.objects[found[0] as string]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(namesIn(s, s.players.p1?.library)).toContain("Bloomvine Regent // Claim Territory");
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it("Mardu Siegebreaker with three players: a copy token for each opponent, which attacks that player", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Mountain", "Plains", "Swamp", "Swamp", "Bear Cub"], hand: ["Mardu Siegebreaker"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Mardu Siegebreaker"), picking([bear]));
    const breaker = idOf(s, "p1", "battlefield", "Mardu Siegebreaker");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: breaker, defender: "p2" }] });
    // "… attacking that opponent": never a planeswalker, so no question.
    let asked = 0;
    s = settle(s, (req) => {
      if (req.intent === "other") asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    const copies = tokensOf(s, "p1", "Bear Cub");
    expect(copies.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender).sort()).toEqual(["p2", "p3"]);
    expect(copies.every((id) => s.objects[id]?.tapped)).toBe(true);
  });
});

describe("tokens created attacking: one defender each (508.4; PLAN-L L5)", () => {
  it("mobilize 2 with two opponents: the tokens are divided among the defenders", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Voice of Victory"] } });
    const voice = idOf(s, "p1", "battlefield", "Voice of Victory");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voice, defender: "p2" }] });
    let asked: ChoiceRequest | undefined;
    s = settle(s, (req) => {
      if (req.type !== "divide") return undefined;
      asked = req;
      return req.among.map((d) => (d === "p2" || d === "p3" ? 1 : 0));
    });
    expect(asked?.type === "divide" && [...asked.among].sort()).toEqual(["p2", "p3"]);
    const warriors = idsOf(s, "p1", "battlefield", "Warrior");
    expect(warriors).toHaveLength(2);
    expect(warriors.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender).sort()).toEqual(["p2", "p3"]);
  });

  it("a single opponent: no question", () => {
    let s = scenario({ p1: { battlefield: ["Voice of Victory"] } });
    const voice = idOf(s, "p1", "battlefield", "Voice of Victory");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voice, defender: "p2" }] });
    let asked = 0;
    s = settle(s, (req) => {
      if (req.type === "divide") asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Warrior")).toHaveLength(2);
  });
});
