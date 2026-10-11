/**
 * Wilds of Eldraine (partial set: cards from the meta decks): each handled card is checked against its Oracle text
 * (plan R, lot R7). Adventures (Bramble Familiar, Mosswood Dreadknight, Scalding Viper, Hearth Elemental),
 * Bargain (Torch the Tower), Song of Totentanz, The End, Restless Cottage, Candy Trail, Sleight of Hand and
 * Disdainful Stroke.
 */

import { describe, expect, it } from "vitest";
import { CELEBRATION, CURSED_ROLE, createRole, MONSTER_ROLE, WICKED_ROLE, YOUNG_HERO_ROLE } from "../../cards/src/woe/common";
import { dealDamage, destroy, payLife } from "../src/actions";
import * as dsl from "../src/dsl";
import { runEffect } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { chars, moveObject } from "../src/state";
import { legalTargets as legalTargetsOf } from "../src/targets";
import { checkCondition } from "../src/triggers";
import { canBlock, stateBasedActions } from "../src/turn";
import { countTurnEvents } from "../src/turnlog";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  passUntil,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

type S = GameState;
/** The card gone on an adventure (715.4): new object in exile. */
const onAdventure = (s: S, name: string) => {
  const id = exiled(s, name)[0] as string;
  expect(s.objects[id]?.onAdventure).toBe(true);
  return id;
};
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
};

describe("Wilds of Eldraine", () => {
  describe("Adventure: Bramble Familiar // Fetch Quest", () => {
    const BRAMBLE = "Bramble Familiar // Fetch Quest";

    it("Fetch Quest: mill seven cards, a milled creature card enters; then the creature is cast from exile", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 9),
          hand: [BRAMBLE],
          library: ["Opt", "Bear Cub", "Opt", "Opt", "Opt", "Opt", "Opt", "Serra Angel"],
        },
      });
      const card = idOf(s, "p1", "hand", BRAMBLE);
      s = act(s, "p1", { type: "cast", card, face: 1 });
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        // The eighth card (not milled) is not offered.
        expect(req.options.some((id) => nameOf(s, id) === "Serra Angel")).toBe(false);
        return bear ? [bear] : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(6);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
      // On an adventure: only the creature can be cast from exile.
      const adv = onAdventure(s, BRAMBLE);
      const opts = castOptions(s, "p1", adv);
      expect(opts).toHaveLength(1);
      expect(opts[0]?.type === "cast" && opts[0].face).toBeUndefined();
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(idsOf(s, "p1", "battlefield", BRAMBLE)).toHaveLength(1);
    });

    it("Bramble Familiar: {T} adds {G}; {1}{G}, {T}, discard a card: it returns to its owner's hand", () => {
      let s = scenario({ p1: { battlefield: [BRAMBLE, ...lands("Forest", 2)], hand: ["Opt"] } });
      const familiar = idOf(s, "p1", "battlefield", BRAMBLE);
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === familiar && a.colors.includes("G"))).toBe(
        true,
      );
      s = settle(activate(s, "p1", familiar, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "hand", BRAMBLE)).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });
  });

  describe("Adventure: Mosswood Dreadknight // Dread Whispers", () => {
    const KNIGHT = "Mosswood Dreadknight // Dread Whispers";

    it("when it dies, it can be cast from the graveyard as an adventure: draw a card, lose 1 life, then exile", () => {
      let s = scenario({
        p1: {
          battlefield: [KNIGHT, ...lands("Mountain", 2), ...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", KNIGHT)] }));
      const card = idOf(s, "p1", "graveyard", KNIGHT);
      // Only the Adventure can be cast from the graveyard: the creature cannot.
      expect(castOptions(s, "p1", card).map((o) => o.type === "cast" && o.face)).toEqual([1]);
      expect(() => act(s, "p1", { type: "cast", card })).toThrow(/only be cast from here as an Adventure/);
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.players.p1?.life).toBe(19);
      s = settle(act(s, "p1", { type: "cast", card: onAdventure(s, KNIGHT) }));
      expect(idsOf(s, "p1", "battlefield", KNIGHT)).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", KNIGHT)).keywords).toContain("trample");
    });

    it("the permission lasts until the end of your next turn", () => {
      let s = scenario({
        p1: { battlefield: [KNIGHT, ...lands("Mountain", 2), ...lands("Swamp", 2)], hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", KNIGHT)] }));
      const card = idOf(s, "p1", "graveyard", KNIGHT);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(castOptions(s, "p1", card)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(castOptions(s, "p1", card)).toHaveLength(0);
    });
  });

  describe("Adventure: Scalding Viper // Steam Clean", () => {
    const VIPER = "Scalding Viper // Steam Clean";

    it("an opponent who casts a spell with MV 3 or less takes 1 damage; MV 4 or more, or your own spells: nothing", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [VIPER] },
        p2: { battlefield: [...lands("Island", 1), ...lands("Mountain", 6)], hand: ["Opt", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p2", "Opt"));
      expect(s.players.p2?.life).toBe(19);
      s = settle(cast(s, "p2", "Shivan Dragon"));
      expect(s.players.p2?.life).toBe(19);
      let t = scenario({ p1: { battlefield: [VIPER, "Island"], hand: ["Opt"] } });
      t = settle(cast(t, "p1", "Opt"));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
    });

    it("Steam Clean: returns a targeted nonland permanent to its owner's hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: [VIPER] },
        p2: { battlefield: ["Serra Angel", "Plains"] },
      });
      const card = idOf(s, "p1", "hand", VIPER);
      expect(() =>
        act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Plains")] } }),
      ).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      onAdventure(s, VIPER);
    });
  });

  describe("Adventure: Hearth Elemental // Stoke Genius", () => {
    it("Stoke Genius: discard your hand, draw two cards; the Elemental then costs {1} less per instant in the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 7),
          hand: ["Hearth Elemental // Stoke Genius", "Opt", "Forest"],
          library: lands("Island", 3),
        },
      });
      const card = idOf(s, "p1", "hand", "Hearth Elemental // Stoke Genius");
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Opt"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island"]);
      // {5}{R} minus {1} (Opt): the five remaining Mountains are enough.
      s = settle(act(s, "p1", { type: "cast", card: onAdventure(s, "Hearth Elemental // Stoke Genius") }));
      expect(idsOf(s, "p1", "battlefield", "Hearth Elemental // Stoke Genius")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(7);
    });
  });

  describe("Bargain: Torch the Tower", () => {
    it("only an artifact, an enchantment or a token can be sacrificed; bargained: 3 damage, scry 1, the killed creature is exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Candy Trail", "Bear Cub"], hand: ["Torch the Tower"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Brazen Scourge"] },
      });
      const card = idOf(s, "p1", "hand", "Torch the Tower");
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      const scourge = idOf(s, "p2", "battlefield", "Brazen Scourge");
      const opt = castOptions(s, "p1", card)[0];
      expect(opt?.type === "cast" && opt.kickerPermanents).toEqual([candy]);
      let scried = false;
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [scourge] }, kicked: true, sacrifice: [candy] }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Brazen Scourge")).toHaveLength(0);
      expect(exiled(s, "Brazen Scourge")).toHaveLength(1);
    });
  });

  describe("Song of Totentanz", () => {
    it("X black 1/1 Rats that can't block; your creatures gain haste until end of turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), { name: "Bear Cub", sick: true }], hand: ["Song of Totentanz"] },
      });
      s = settle(cast(s, "p1", "Song of Totentanz", undefined, { x: 2 }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(2);
      for (const r of rats) {
        const c = chars(s, r);
        expect([c.power, c.toughness, c.colors]).toEqual([1, 1, ["B"]]);
        expect(c.keywords).toContain("haste");
      }
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [bear, ...rats].map((id) => ({ id, defender: "p2" })) });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      expect(s.players.p2?.life).toBe(16);
      expect(chars(s, bear).keywords).not.toContain("haste");
    });

    it("a Rat can't block", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Song of Totentanz"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Song of Totentanz", undefined, { x: 1 }));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() => act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: rat, attacker: bear }] })).toThrow();
    });
  });

  describe("The End", () => {
    it("costs {2} less if you have 5 life or less", () => {
      const setup = (life: number) =>
        scenario({ p1: { life, battlefield: lands("Swamp", 2), hand: ["The End"] }, p2: { battlefield: ["Bear Cub"] } });
      const target = (s: S) => ({ t: [idOf(s, "p2", "battlefield", "Bear Cub")] });
      const high = setup(6);
      expect(() => cast(high, "p1", "The End", target(high))).toThrow();
      const low = settle(cast(setup(5), "p1", "The End", target(setup(5))));
      expect(exiled(low, "Bear Cub")).toHaveLength(1);
    });

    it("exiles the target and cards with the same name from its graveyard, hand and library; it draws a card per card in its hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["The End"] },
        p2: {
          battlefield: ["Bear Cub"],
          hand: ["Bear Cub", "Opt"],
          library: ["Bear Cub", "Island", "Island"],
          graveyard: ["Bear Cub", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "The End", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, req.max) : undefined,
      );
      expect(exiled(s, "Bear Cub")).toHaveLength(4);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Island", "Opt"]);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(s.players.p2?.library).toHaveLength(1);
    });
  });

  describe("Restless Cottage", () => {
    it("enters tapped; {T}: add {B} or {G}", () => {
      let s = scenario({ p1: { hand: ["Restless Cottage"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Restless Cottage") });
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      expect(s.objects[cottage]?.tapped).toBe(true);
      const t = scenario({ p1: { battlefield: ["Restless Cottage"] } });
      const colors = legalActions(t, "p1").flatMap((a) =>
        a.type === "tapForMana" && a.source === idOf(t, "p1", "battlefield", "Restless Cottage") ? a.colors : [],
      );
      expect(colors.sort()).toEqual(["B", "G"]);
    });

    it("{2}{B}{G}: 4/4 black and green Horror (always a land); when attacking: a Food and a card from a graveyard exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Cottage", ...lands("Swamp", 2), ...lands("Forest", 2)] },
        p2: { graveyard: ["Opt", "Bear Cub"] },
      });
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      s = settle(activate(s, "p1", cottage));
      const c = chars(s, cottage);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toContain("Horror");
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect([...c.colors].sort()).toEqual(["B", "G"]);
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cottage, defender: "p2" }] });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cottage).types).not.toContain("Creature");
    });
  });

  describe("Candy Trail", () => {
    it("Artifact - Food Clue; on entering, scry 2; {2}, {T}, sacrifice: 3 life and a card", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Candy Trail"], library: ["Opt", "Forest", "Island"] } });
      let seen: string[] = [];
      s = settle(cast(s, "p1", "Candy Trail"), (req) => {
        if (req.intent === "scryBottom" && req.type === "pick") seen = req.options.map((id) => nameOf(s, id) ?? "");
        return undefined;
      });
      expect(seen.sort()).toEqual(["Forest", "Opt"]);
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      expect(chars(s, candy).subtypes).toEqual(expect.arrayContaining(["Food", "Clue"]));
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", candy));
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });
  });

  describe("Sleight of Hand", () => {
    it("look at the top two cards: one into hand, the other on the bottom of the library", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Sleight of Hand"], library: ["Opt", "Bear Cub", "Forest"] } });
      s = settle(cast(s, "p1", "Sleight of Hand"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Forest", "Opt"]);
    });
  });

  describe("Disdainful Stroke", () => {
    it("counters a spell with MV 4 or more; a spell with MV 3 or less is not a legal target", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Shivan Dragon", "Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Disdainful Stroke"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      expect(() => cast(s, "p2", "Disdainful Stroke", { t: [strike] })).toThrow();
      s = settle(s);
      s = cast(s, "p1", "Shivan Dragon");
      const dragon = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Disdainful Stroke", { t: [dragon] }));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });
  });
});

describe("Wilds of Eldraine: foundation (Roles, Celebration)", () => {
  /** State-based actions, then we pass until the stack and the triggers are empty. */
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const resolutionOf = (s: S, controller: string, sourceId: string, targets: Record<string, string[]> = {}) =>
    ({
      item: { id: "x", controller, sourceId, sourceDefId: s.objects[sourceId]?.defId, targets },
      controller,
      targets,
      vars: {},
      pc: 0,
    }) as never as Parameters<typeof runEffect>[1];
  /** Runs "create a Role attached to [the target]" in a single resolution (the target exists: the "if" is true). */
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = resolutionOf(s, controller, to, { t: [to] });
    for (const e of createRole(token).flat()) if (e.op !== "if") runEffect(s, r, e);
  };
  const roles = (s: S, host: string) => s.battlefield.filter((id) => s.objects[id]?.attachedTo === host);

  it("Monster Role: +1/+1 and trample; a new Role from the same player replaces the old one (704.5y)", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, MONSTER_ROLE, bear);
    s = settleAll(s);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toContain("trample");
    giveRole(s, CURSED_ROLE, bear);
    s = settleAll(s);
    expect(roles(s, bear)).toHaveLength(1);
    expect(chars(s, bear).power).toBe(1);
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("two players can each attach a Role to the same creature", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, MONSTER_ROLE, bear, "p1");
    giveRole(s, CURSED_ROLE, bear, "p2");
    s = settleAll(s);
    expect(roles(s, bear)).toHaveLength(2);
  });

  it("Wicked Role: put into the graveyard, each opponent loses 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, WICKED_ROLE, bear);
    s = settleAll(s);
    expect(chars(s, bear).power).toBe(3);
    destroy(s, bear);
    s = settleAll(s);
    expect(s.players.p2?.life).toBe(19);
  });

  it("Young Hero Role: when attacking with toughness 3 or less, a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, YOUNG_HERO_ROLE, bear);
    s = settleAll(s);
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = settleAll(act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Celebration: two nonland permanents entered under your control this turn (tokens included)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const r = resolutionOf(s, "p1", idOf(s, "p1", "battlefield", "Bear Cub"));
    const food = { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"] } as TokenSpec;
    runEffect(s, r, dsl.fx.createTokens({ name: "Forest", colors: [], types: ["Land"], subtypes: ["Forest"] }));
    runEffect(s, r, dsl.fx.createTokens(food));
    expect(checkCondition(s, CELEBRATION, "p1")).toBe(false);
    runEffect(s, r, dsl.fx.createTokens(food));
    expect(checkCondition(s, CELEBRATION, "p1")).toBe(true);
    expect(checkCondition(s, CELEBRATION, "p2")).toBe(false);
  });
});

describe("Wilds of Eldraine, lot A — blanc", () => {
  /**
   * Wilds of Eldraine, lot A - white cards: each test checks a card against its Oracle text (plan R, lot R7):
   * Roles, Celebration, Bargain, Adventures, Sagas and "until" exiles.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Roles (and other Auras) attached to a permanent. */
  const attachedTo = (s: S, host: string) =>
    s.battlefield.filter((id) => s.objects[id]?.attachedTo === host).map((id) => nameOf(s, id));

  /** Answers trigger targets with `want` (if it is among the options). */
  const targetWith =
    (...want: string[]): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerTarget" ? want.filter((w) => req.options.includes(w)) : undefined;
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Up to the active player's declare attackers. */
  const toAttack = (s: S) => passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
  const attack = (s: S, player: string, ids: string[], defender = "p2") =>
    act(s, player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });

  describe("Roles", () => {
    it("Betroth the Beast: a Royal Role (+1/+1, ward {1}) on your creature; the Knight is then cast from exile", () => {
      const KNIGHT = "Besotted Knight // Betroth the Beast";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: [KNIGHT] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", KNIGHT, { face: 1, targets: { t: [bear] } }));
      expect(attachedTo(s, bear)).toEqual(["Royal Role"]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
      const adv = exiled(s, KNIGHT)[0] as string;
      expect(s.objects[adv]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(pt(s, idOf(s, "p1", "battlefield", KNIGHT))).toEqual([3, 3]);
    });

    it("Charmed Clothier: a Royal Role on another creature you control", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Charmed Clothier"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Charmed Clothier"));
      const clothier = idOf(s, "p1", "battlefield", "Charmed Clothier");
      expect(attachedTo(s, bear)).toEqual(["Royal Role"]);
      expect(attachedTo(s, clothier)).toEqual([]);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Cursed Courtier: enters with a Cursed Role, a 1/1 with lifelink", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Cursed Courtier"] } });
      s = settle(cast(s, "p1", "Cursed Courtier"));
      const courtier = idOf(s, "p1", "battlefield", "Cursed Courtier");
      expect(attachedTo(s, courtier)).toEqual(["Cursed Role"]);
      expect(pt(s, courtier)).toEqual([1, 1]);
      expect(chars(s, courtier).keywords).toContain("lifelink");
    });

    it("Unassuming Sage: paying {2}, a Wizard Role on it (3/3); without paying, nothing", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Unassuming Sage"] } });
        s = settle(cast(s, "p1", "Unassuming Sage"), (req) => (req.intent === "may" ? [pay ? 1 : 0] : undefined));
        return s;
      };
      const paid = run(true);
      const sage = idOf(paid, "p1", "battlefield", "Unassuming Sage");
      expect(attachedTo(paid, sage)).toEqual(["Sorcerer Role"]);
      expect(pt(paid, sage)).toEqual([3, 3]);
      const unpaid = run(false);
      expect(attachedTo(unpaid, idOf(unpaid, "p1", "battlefield", "Unassuming Sage"))).toEqual([]);
    });

    it("Spellbook Vendor: at the beginning of your combat, {1} for a Wizard Role on the targeted creature", () => {
      let s = scenario({ p1: { battlefield: ["Spellbook Vendor", "Bear Cub", "Plains"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
      s = settle(s, (req) =>
        req.intent === "may" ? [1] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(attachedTo(s, bear)).toEqual(["Sorcerer Role"]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    });

    it("Protective Parents: when it dies, a Young Hero Role on one of your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Protective Parents", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        active: "p2",
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p2", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Protective Parents")] } });
      s = settle(s, targetWith(bear));
      expect(idsOf(s, "p1", "graveyard", "Protective Parents")).toHaveLength(1);
      expect(attachedTo(s, bear)).toEqual(["Young Hero Role"]);
    });

    it("Return Triumphant: a creature card with MV 3 or less returns with a Young Hero Role", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Return Triumphant"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => cast(s, "p1", "Return Triumphant", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Return Triumphant", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(attachedTo(s, bear)).toEqual(["Young Hero Role"]);
    });
  });

  describe("Celebration", () => {
    it("Armory Mice, Gallant Pie-Wielder, Tuinvale Guide: bonus as soon as two nonland permanents have entered this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Armory Mice", "Gallant Pie-Wielder", "Tuinvale Guide", ...lands("Plains", 2)],
          hand: ["Hopeful Vigil"],
        },
      });
      const mice = idOf(s, "p1", "battlefield", "Armory Mice");
      const pie = idOf(s, "p1", "battlefield", "Gallant Pie-Wielder");
      const guide = idOf(s, "p1", "battlefield", "Tuinvale Guide");
      expect(pt(s, mice)).toEqual([3, 1]);
      expect(chars(s, pie).keywords).not.toContain("doubleStrike");
      expect(chars(s, guide).keywords).not.toContain("lifelink");
      // The enchantment and its Knight token: two nonland permanents.
      s = settle(cast(s, "p1", "Hopeful Vigil"));
      expect(pt(s, mice)).toEqual([3, 3]);
      expect(chars(s, pie).keywords).toContain("doubleStrike");
      expect(pt(s, guide)).toEqual([3, 3]);
      expect(chars(s, guide).keywords).toContain("lifelink");
    });

    it("Pests of Honor and Lady of Laughter: a counter at the beginning of combat, a card at the end step", () => {
      const run = (celebrate: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Pests of Honor", "Lady of Laughter", ...lands("Plains", 2)], hand: ["Hopeful Vigil"] },
        });
        if (celebrate) s = settle(cast(s, "p1", "Hopeful Vigil"));
        const hand = s.players.p1?.hand.length ?? 0;
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return [
          s.objects[idOf(s, "p1", "battlefield", "Pests of Honor")]?.counters["+1/+1"] ?? 0,
          (s.players.p1?.hand.length ?? 0) - hand,
        ];
      };
      expect(run(true)).toEqual([1, 1]);
      expect(run(false)).toEqual([0, 0]);
    });
  });

  describe("Marchandage", () => {
    it("Archon's Glory: +2/+2; bargained, also flying and lifelink", () => {
      const run = (bargain: boolean) => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Candy Trail"], hand: ["Archon's Glory"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "Archon's Glory", { targets: { t: [bear] }, ...extra }));
        return { s, bear };
      };
      const plain = run(false);
      expect(pt(plain.s, plain.bear)).toEqual([4, 4]);
      expect(chars(plain.s, plain.bear).keywords).not.toContain("flying");
      const bargained = run(true);
      expect(pt(bargained.s, bargained.bear)).toEqual([4, 4]);
      expect(chars(bargained.s, bargained.bear).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(idsOf(bargained.s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Kellan's Lightblades: 3 damage to an attacking creature; bargained, it is destroyed", () => {
      const run = (bargain: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Plains", "Plains", "Candy Trail"], hand: ["Kellan's Lightblades"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        // A creature that is not attacking is not a legal target.
        expect(() => cast(s, "p1", "Kellan's Lightblades", { targets: { t: [bear] } })).toThrow();
        s = attack(toAttack(s), "p2", [angel], "p1");
        s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "Kellan's Lightblades", { targets: { t: [angel] }, ...extra }));
        return { s, angel };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.angel]?.damage).toBe(3);
      expect(idsOf(plain.s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      const bargained = run(true);
      expect(idsOf(bargained.s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Aventures", () => {
    it("Squeak By: +1/+1; can't be blocked by a creature with power 3 or greater", () => {
      const MOUSE = "Cheeky House-Mouse // Squeak By";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Plains"], hand: [MOUSE] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", MOUSE, { face: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = settle(attack(toAttack(s), "p1", [bear]));
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: bear }] })).toThrow();
      const small = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: small, attacker: bear }] });
      expect(s.combat?.blockers.map((b) => b.id)).toEqual([small]);
    });

    it("Heartflame Slash: 3 damage; Heartflame Duelist gives lifelink to your instants and sorceries", () => {
      const DUELIST = "Heartflame Duelist // Heartflame Slash";
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: [DUELIST] } });
      s = settle(cast(s, "p1", DUELIST, { face: 1, targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 17]);
      let t = scenario({ p1: { battlefield: [DUELIST, ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([23, 17]);
    });

    it("Pollen-Shield Hare: your creature tokens +1/+1; Hare Raising: vigilance and +X/+X (X = your creatures)", () => {
      const HARE = "Pollen-Shield Hare // Hare Raising";
      let s = scenario({
        p1: { battlefield: [HARE, "Bear Cub", ...lands("Plains", 3)], hand: ["Virtue of Loyalty // Ardenvale Fealty"] },
      });
      s = settle(cast(s, "p1", "Virtue of Loyalty // Ardenvale Fealty", { face: 1 }));
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      let t = scenario({ p1: { battlefield: ["Bear Cub", "Serra Angel", "Forest"], hand: [HARE] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(cast(t, "p1", HARE, { face: 1, targets: { t: [bear] } }));
      expect(pt(t, bear)).toEqual([4, 4]);
      expect(chars(t, bear).keywords).toContain("vigilance");
    });

    it("Shrouded Shepherd: +2/+2 on entering; Cleave Shadows: -1/-1 to opposing creatures", () => {
      const SHEPHERD = "Shrouded Shepherd // Cleave Shadows";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", ...lands("Plains", 3)], hand: [SHEPHERD] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", SHEPHERD, { face: 1 }));
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = settle(
        act(s, "p1", { type: "cast", card: exiled(s, SHEPHERD)[0] as string }),
        targetWith(idOf(s, "p1", "battlefield", "Bear Cub")),
      );
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 4]);
    });

    it("Mend the Wilds: a permanent card from your graveyard on top of your library; Woodland Acolyte draws", () => {
      const ACOLYTE = "Woodland Acolyte // Mend the Wilds";
      let s = scenario({
        p1: { battlefield: ["Forest", ...lands("Plains", 3)], hand: [ACOLYTE], graveyard: ["Serra Angel", "Opt"] },
      });
      expect(() => cast(s, "p1", ACOLYTE, { face: 1, targets: { t: [idOf(s, "p1", "graveyard", "Opt")] } })).toThrow();
      s = settle(cast(s, "p1", ACOLYTE, { face: 1, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, ACOLYTE)[0] as string }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
    });

    it("Virtue of Loyalty: at your end step, a +1/+1 counter on each of your creatures, which untap", () => {
      let s = scenario({ p1: { battlefield: ["Virtue of Loyalty // Ardenvale Fealty", { name: "Bear Cub", tapped: true }] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.tapped).toBe(false);
    });
  });

  describe("Retirer et neutraliser", () => {
    it("Break the Spell: you draw only if the destroyed enchantment was yours or a token", () => {
      const run = (owner: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: owner === "p1" ? ["Plains", "Hopeful Vigil"] : ["Plains"], hand: ["Break the Spell"] },
          p2: { battlefield: owner === "p2" ? ["Hopeful Vigil"] : [] },
        });
        const vigil = idOf(s, owner, "battlefield", "Hopeful Vigil");
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Break the Spell", { targets: { t: [vigil] } }));
        expect(idsOf(s, owner, "graveyard", "Hopeful Vigil")).toHaveLength(1);
        return (s.players.p1?.hand.length ?? 0) - hand;
      };
      // The card leaves the hand (-1), then a draw (+1) only for your enchantment.
      expect(run("p1")).toBe(0);
      expect(run("p2")).toBe(-1);
    });

    it("Break the Spell: a destroyed opposing enchantment token (Role) makes you draw", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Break the Spell"] },
        p2: { battlefield: lands("Plains", 3), hand: ["Cursed Courtier"] },
        active: "p2",
      });
      s = settle(cast(s, "p2", "Cursed Courtier"));
      s = act(s, "p2", { type: "pass" });
      const role = idOf(s, "p2", "battlefield", "Cursed Role");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Break the Spell", { targets: { t: [role] } }));
      expect(s.players.p1?.hand.length).toBe(hand);
      expect(pt(s, idOf(s, "p2", "battlefield", "Cursed Courtier"))).toEqual([3, 3]);
    });

    it("Cooped Up: the enchanted creature can't attack or block; {2}{W} exiles it", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cooped Up"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Cooped Up", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Cooped Up")));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Cooped Up")).toHaveLength(1);
    });

    it("Glass Casket: exiles an opposing creature with MV 3 or less until the artifact leaves", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Glass Casket"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Forest", 1)], hand: [] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glass Casket"));
      // Serra Angel (MV 5) is not a target: only the Cub is exiled.
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[bear]).toBeUndefined();
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      // The artifact destroyed: the creature comes back.
      destroy(s, idOf(s, "p1", "battlefield", "Glass Casket"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Food Coma: exiles an opposing creature and creates a Food; the enchantment destroyed, it comes back", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Food Coma"] },
        p2: { battlefield: ["Serra Angel", "Plains"], hand: ["Break the Spell"] },
      });
      s = settle(cast(s, "p1", "Food Coma"));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Break the Spell", { targets: { t: [idOf(s, "p1", "battlefield", "Food Coma")] } }));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Werefox Bodyguard: exiles another non-Fox creature until it leaves; {1}{W}, sacrifice: 2 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Werefox Bodyguard"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Werefox Bodyguard"));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Werefox Bodyguard")));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Moment of Valor: untap a creature (+1/+0, indestructible) or destroy a creature with power 4 or greater", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Plains", 6)],
          hand: ["Moment of Valor", "Moment of Valor"],
        },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Moment of Valor", { mode: 0, targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(() => cast(s, "p1", "Moment of Valor", { mode: 1, targets: { t: [elves] } })).toThrow();
      s = settle(cast(s, "p1", "Moment of Valor", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Expel the Interlopers: destroys each creature with power greater than or equal to the chosen number", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Expel the Interlopers"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      // The number is chosen as the spell resolves (PLAN-M M8a), from 0 to 10; suggestion: 3 (one more than the Bear
      // Cub's power).
      const cast0 = cast(s, "p1", "Expel the Interlopers");
      let asked: unknown[] = [];
      s = settle(cast0, (req) => {
        if (req.type !== "number") return undefined;
        asked = [req.min, req.max, req.suggested];
        return [2];
      });
      expect(asked).toEqual([0, 10, [3]]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      // The suggestion keeps your creatures.
      const t = settle(
        cast(
          scenario({
            p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Expel the Interlopers"] },
            p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
          }),
          "p1",
          "Expel the Interlopers",
        ),
      );
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Eerie Interference: prevents damage to you and your creatures, not that of a spell", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 3)], hand: ["Eerie Interference"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } }));
      s = attack(
        toAttack(s),
        "p2",
        [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")],
        "p1",
      );
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Eerie Interference"));
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p1", {
        type: "declareBlockers",
        blocks: [{ blocker: elves, attacker: idOf(s, "p2", "battlefield", "Bear Cub") }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p1?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[elves]?.damage).toBe(0);
    });
  });

  describe("Enchantments and triggers", () => {
    it("Hopeful Vigil: a 2/2 vigilant Knight; {2}{W}: sacrificed, scry 2", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Hopeful Vigil"] } });
      s = settle(cast(s, "p1", "Hopeful Vigil"));
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([2, 2]);
      expect(chars(s, knight).keywords).toContain("vigilance");
      let scried = 0;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeful Vigil")), (req) => {
        if (req.intent === "scryBottom" && req.type === "pick") scried = req.options.length;
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Hopeful Vigil")).toHaveLength(1);
      expect(scried).toBe(2);
    });

    it("Knight of Doves and Savior of the Sleeping: an enchantment of yours put into the graveyard gives a Bird and a counter", () => {
      let s = scenario({
        p1: { battlefield: ["Knight of Doves", "Savior of the Sleeping", "Hopeful Vigil", ...lands("Plains", 3)] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeful Vigil")));
      const bird = idOf(s, "p1", "battlefield", "Bird");
      expect(pt(s, bird)).toEqual([1, 1]);
      expect(chars(s, bird).keywords).toContain("flying");
      expect(chars(s, bird).colors).toEqual(["W"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Savior of the Sleeping")]?.counters["+1/+1"]).toBe(1);
    });

    it("Rimefur Reindeer and Slumbering Keepguard: an enchantment enters, an opposing creature taps and scry 1", () => {
      let s = scenario({
        p1: { battlefield: ["Rimefur Reindeer", "Slumbering Keepguard", ...lands("Plains", 5)], hand: ["Hopeful Vigil"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Hopeful Vigil"), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(scried).toBe(true);
      // {2}{W}: +1/+1 per enchantment you control (only one: Hopeful Vigil).
      const keep = idOf(s, "p1", "battlefield", "Slumbering Keepguard");
      s = settle(activate(s, "p1", keep));
      expect(pt(s, keep)).toEqual([2, 2]);
    });

    it("Stockpiling Celebrant: returns another of your nonland permanents, then scry 2", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Stockpiling Celebrant"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = 0;
      s = settle(cast(s, "p1", "Stockpiling Celebrant"), (req) => {
        if (req.intent === "triggerTarget" && req.type === "pick") return [bear];
        if (req.intent === "scryBottom" && req.type === "pick") scried = req.options.length;
        return undefined;
      });
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(scried).toBe(2);
    });

    it("Discerning Financier: a Treasure at upkeep if an opponent has more lands; {2}{W} gives it and draws", () => {
      let s = scenario({
        p1: { battlefield: ["Discerning Financier", ...lands("Plains", 3)] },
        p2: { battlefield: lands("Forest", 5) },
      });
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0);
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Discerning Financier"), { targets: { t: [treasure] } }));
      expect(s.objects[treasure]?.controller).toBe("p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      // As many lands on each side: no Treasure.
      let t = scenario({ p1: { battlefield: ["Discerning Financier", "Plains"] }, p2: { battlefield: ["Forest"] } });
      t = advanceUntil(t, (x) => x.turn.number === 5 && x.turn.step === "main1");
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Dutiful Griffin: {2}{W}, sacrifice two enchantments: it returns from the graveyard to your hand", () => {
      let s = scenario({
        p1: { battlefield: ["Hopeful Vigil", "Hopeful Vigil", ...lands("Plains", 3)], graveyard: ["Dutiful Griffin"] },
      });
      const griffin = idOf(s, "p1", "graveyard", "Dutiful Griffin");
      s = settle(activate(s, "p1", griffin, { sacrifice: idsOf(s, "p1", "battlefield", "Hopeful Vigil") }));
      expect(idsOf(s, "p1", "hand", "Dutiful Griffin")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Hopeful Vigil")).toHaveLength(2);
    });

    it("Frostbridge Guard: {2}{W}, {T}: tap the targeted creature", () => {
      let s = scenario({
        p1: { battlefield: ["Frostbridge Guard", ...lands("Plains", 3)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Frostbridge Guard"), { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Plunge into Winter: tap up to one creature, scry 1, draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Plunge into Winter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Plunge into Winter", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Creatures", () => {
    it("Regal Bunnicorn: P/T equal to the number of your nonland permanents", () => {
      const s = scenario({ p1: { battlefield: ["Regal Bunnicorn", "Bear Cub", "Candy Trail", "Plains"] } });
      expect(pt(s, idOf(s, "p1", "battlefield", "Regal Bunnicorn"))).toEqual([3, 3]);
    });

    it("Moonshaker Cavalry: your creatures gain flying and +X/+X, X being the number of your creatures", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 8)], hand: ["Moonshaker Cavalry"] } });
      s = settle(cast(s, "p1", "Moonshaker Cavalry"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(pt(s, idOf(s, "p1", "battlefield", "Moonshaker Cavalry"))).toEqual([8, 8]);
    });
  });

  describe("Sagas", () => {
    it("The Princess Takes Flight: I exiles a creature, II +2/+2 and flying, III the card comes back", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["The Princess Takes Flight"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "The Princess Takes Flight"), targetWith(angel));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(
        s,
        (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(
        s,
        (x) => x.turn.number === 7 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
      );
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "The Princess Takes Flight")).toHaveLength(1);
    });

    it("Three Blind Mice: I a Mouse, II and III a copy of one of your tokens, IV +1/+1 and vigilance", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Three Blind Mice"] } });
      s = settle(cast(s, "p1", "Three Blind Mice"));
      const mouse = idOf(s, "p1", "battlefield", "Mouse");
      expect(pt(s, mouse)).toEqual([1, 1]);
      expect(chars(s, mouse).colors).toEqual(["W"]);
      const done = (n: number) => (x: S) =>
        x.turn.number === n && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0;
      s = advanceUntil(s, done(7));
      expect(idsOf(s, "p1", "battlefield", "Mouse")).toHaveLength(3);
      s = advanceUntil(s, done(9));
      for (const id of idsOf(s, "p1", "battlefield", "Mouse")) {
        expect(pt(s, id)).toEqual([2, 2]);
        expect(chars(s, id).keywords).toContain("vigilance");
      }
      expect(idsOf(s, "p1", "graveyard", "Three Blind Mice")).toHaveLength(1);
    });
  });
});

describe("Wilds of Eldraine, lot A — bleu", () => {
  /**
   * Wilds of Eldraine, lot A - blue cards: each card with non-trivial behavior is checked against its Oracle text
   * (R7), playing through decisions.
   */
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passes and answers choices (default suggested answer) until the stack is empty, with no pending trigger. */
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
  /** Answer "choose this object" when it is offered. */
  const pickIf =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const wanted = ids.filter((id) => req.options.includes(id));
      return wanted.length ? wanted : undefined;
    };
  /** Casts the Adventure (face 1) of a card from hand. */
  const castAdventure = (s: S, player: string, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    cast(s, player, name, targets, { face: 1, ...extra });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const attackWith = (s: S, player: string, ...ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const defender = player === "p1" ? "p2" : "p1";
    return act(cur, player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });
  };

  it("Aquatic Alchemist: +2/+0 for the first instant or sorcery of the turn only; Bubble Up puts an instant on top of the library", () => {
    const ALCHEMIST = "Aquatic Alchemist // Bubble Up";
    let s = scenario({ p1: { battlefield: [ALCHEMIST, ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const alch = idOf(s, "p1", "battlefield", ALCHEMIST);
    s = cast(s, "p1", "Opt");
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(1);
    s = settle(s);
    expect(pt(s, alch)).toEqual([3, 3]);
    // The turn's second instant triggers nothing (no ability on the stack).
    s = cast(s, "p1", "Opt");
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
    s = settle(s);
    expect(pt(s, alch)).toEqual([3, 3]);

    let t = scenario({ p1: { battlefield: lands("Island", 3), hand: [ALCHEMIST], graveyard: ["Opt", "Bear Cub"] } });
    const opt = idOf(t, "p1", "graveyard", "Opt");
    expect(() => castAdventure(t, "p1", ALCHEMIST, { t: [idOf(t, "p1", "graveyard", "Bear Cub")] })).toThrow();
    t = settle(castAdventure(t, "p1", ALCHEMIST, { t: [opt] }));
    expect(nameOf(t, t.players.p1?.library[0] as string)).toBe("Opt");
    expect(exiled(t, ALCHEMIST)).toHaveLength(1);
  });

  it("Entry Denied: returns an opposing creature with MV 3 or less; not one with MV 4, nor yours", () => {
    const GATE = "Beluna's Gatekeeper // Entry Denied";
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: [GATE] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    expect(() => castAdventure(s, "p1", GATE, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
    expect(() => castAdventure(s, "p1", GATE, { t: [idOf(s, "p1", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(castAdventure(s, "p1", GATE, { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(handNames(s, "p2")).toEqual(["Bear Cub"]);
  });

  it("Bitter Chill: taps the creature, which no longer untaps; put into the graveyard, pay {1}: scry 1 then draw", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Bitter Chill"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Bitter Chill", { enchant: [bear] }));
    expect(s.objects[bear]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    // Back to p1's turn: the Aura is destroyed, {1} paid.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
    const chill = idOf(s, "p1", "battlefield", "Bitter Chill");
    const hand = s.players.p1?.hand.length ?? 0;
    destroy(s, chill);
    let scried = false;
    s = settle(s, (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Chancellor of Tales: an Adventure spell can be copied; another spell, or the cast creature, cannot", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({
      p1: {
        battlefield: ["Chancellor of Tales", ...lands("Mountain", 3), ...lands("Island", 3)],
        hand: [FAMILIAR, FAMILIAR, "Lightning Strike"],
      },
    });
    s = settle(castAdventure(s, "p1", FAMILIAR, { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(18);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(15);
    const before = s.stack.length;
    s = cast(s, "p1", FAMILIAR);
    expect(s.stack).toHaveLength(before + 1);
  });

  it("Storyteller Pixie: draw when you cast an Adventure spell, not the creature", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({
      p1: { battlefield: ["Storyteller Pixie", ...lands("Mountain", 2), ...lands("Island", 2)], hand: [FAMILIAR, FAMILIAR] },
    });
    s = settle(castAdventure(s, "p1", FAMILIAR, { t: ["p2"] }));
    expect(handNames(s, "p1").filter((n) => n === "Forest")).toHaveLength(1);
    s = settle(cast(s, "p1", FAMILIAR));
    expect(handNames(s, "p1").filter((n) => n === "Forest")).toHaveLength(1);
  });

  it("Diminisher Witch: bargained, a Cursed Role on an opposing creature (1/1); otherwise nothing", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Candy Trail"], hand: ["Diminisher Witch"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(
      cast(s, "p1", "Diminisher Witch", undefined, { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] }),
    );
    expect(pt(s, angel)).toEqual([1, 1]);
    expect(idsOf(s, "p1", "battlefield", "Cursed Role")).toHaveLength(1);

    let t = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Diminisher Witch"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Diminisher Witch"));
    expect(pt(t, idOf(t, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
  });

  it("Farsight Ritual: look at four cards (eight if bargained), two to hand, the rest on the bottom", () => {
    const library = ["Opt", "Bear Cub", "Island", "Island", "Serra Angel", "Island", "Island", "Lightning Strike", "Forest"];
    const run = (bargain: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Candy Trail"], hand: ["Farsight Ritual"], library },
      });
      let seen = 0;
      const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
      s = settle(cast(s, "p1", "Farsight Ritual", undefined, extra), (req) => {
        if (req.type !== "pick") return undefined;
        seen = req.options.length;
        expect([req.min, req.max]).toEqual([2, 2]);
        return undefined;
      });
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe(bargain ? "Forest" : "Serra Angel");
      return seen;
    };
    expect(run(false)).toBe(4);
    expect(run(true)).toBe(8);
  });

  it("Freeze in Place: taps the opposing creature with three stun counters, then scry 2", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Freeze in Place"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    let scried = false;
    s = settle(cast(s, "p1", "Freeze in Place", { t: [bear] }), (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(3);
    // At its untap step, a counter is removed instead of untapping it.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(2);
  });

  it("Gadwick's First Duel: I a Cursed Role; II scry 2; III copy your next instant or sorcery with MV 3 or less", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Mountain", 4)],
        hand: ["Gadwick's First Duel", "Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Gadwick's First Duel"), pickIf(angel));
    expect(pt(s, angel)).toEqual([1, 1]);
    s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Gadwick's First Duel")).toHaveLength(0);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(14);
    // Une seule fois.
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.players.p2?.life).toBe(11);
  });

  it("Galvanic Giant: a spell with MV 5 or more taps an opposing creature with a stun counter; Storm Reading draws four, discards two", () => {
    const GIANT = "Galvanic Giant // Storm Reading";
    let s = scenario({
      p1: { battlefield: [GIANT, ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.objects[bear]?.tapped).toBe(false);
    s = settle(cast(s, "p1", "Shivan Dragon"), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);

    let t = scenario({ p1: { battlefield: lands("Island", 7), hand: [GIANT] } });
    t = settle(castAdventure(t, "p1", GIANT));
    expect(t.players.p1?.hand).toHaveLength(2);
    expect(t.players.p1?.graveyard).toHaveLength(2);
  });

  it("Horned Loch-Whale: enters tapped outside your turn; Lagoon Breach puts an opposing attacker on top or bottom", () => {
    const WHALE = "Horned Loch-Whale // Lagoon Breach";
    let s = scenario({ active: "p2", p1: { battlefield: lands("Island", 6), hand: [WHALE] } });
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", WHALE));
    expect(s.objects[idOf(s, "p1", "battlefield", WHALE)]?.tapped).toBe(true);
    let mine = scenario({ p1: { battlefield: lands("Island", 6), hand: [WHALE] } });
    mine = settle(cast(mine, "p1", WHALE));
    expect(mine.objects[idOf(mine, "p1", "battlefield", WHALE)]?.tapped).toBe(false);

    let t = scenario({ active: "p2", p1: { battlefield: lands("Island", 2), hand: [WHALE] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(t, "p2", "battlefield", "Bear Cub");
    t = attackWith(t, "p2", bear);
    t = passUntil(t, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    let asked = "";
    t = settle(castAdventure(t, "p1", WHALE, { t: [bear] }), (req, player) => {
      if (req.intent === "topOrBottom") asked = player;
      return req.intent === "topOrBottom" ? ["top"] : undefined;
    });
    expect(asked).toBe("p2");
    expect(nameOf(t, t.players.p2?.library[0] as string)).toBe("Bear Cub");
  });

  it("Icewrought Sentry: when attacking, pay {1}{U} to tap an opposing creature; it then gets +2/+1", () => {
    let s = scenario({ p1: { battlefield: ["Icewrought Sentry", ...lands("Island", 2)] }, p2: { battlefield: ["Bear Cub"] } });
    const sentry = idOf(s, "p1", "battlefield", "Icewrought Sentry");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(attackWith(s, "p1", sentry), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(pt(s, sentry)).toEqual([4, 4]);
    expect(s.objects[sentry]?.tapped).toBe(false);
  });

  it("Into the Fae Court: draw three cards; a 1/1 flying Faerie that can block only creatures with flying", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Into the Fae Court"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Into the Fae Court"));
    expect(s.players.p1?.hand).toHaveLength(3);
    const faerie = idOf(s, "p1", "battlefield", "Faerie");
    expect(pt(s, faerie)).toEqual([1, 1]);
    expect(chars(s, faerie).colors).toEqual(["U"]);
    expect(chars(s, faerie).keywords).toContain("flying");

    // It cannot block a creature without flying.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }] });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const blocks = [{ blocker: faerie, attacker: idOf(s, "p2", "battlefield", "Bear Cub") }];
    expect(() => act(s, "p1", { type: "declareBlockers", blocks })).toThrow();
  });

  it("Living Lectern: {1}, sacrifice it, at sorcery speed: draw, a Wizard Role on another creature", () => {
    let s = scenario({ p1: { battlefield: ["Living Lectern", "Bear Cub", "Island"] } });
    const lectern = idOf(s, "p1", "battlefield", "Living Lectern");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", lectern, { t: [bear] }));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Living Lectern")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    let t = scenario({ active: "p2", p1: { battlefield: ["Living Lectern", "Island"] } });
    t = passUntil(t, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(legalActions(t, "p1").some((a) => a.type === "activate")).toBe(false);
  });

  it("Merfolk Coralsmith: {1}: +1/-1; when it dies, scry 2", () => {
    let s = scenario({ p1: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 3)] } });
    const smith = idOf(s, "p1", "battlefield", "Merfolk Coralsmith");
    s = settle(activate(s, "p1", smith));
    expect(pt(s, smith)).toEqual([3, 2]);
    s = settle(activate(s, "p1", smith));
    let scried = false;
    s = settle(activate(s, "p1", smith), (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(idsOf(s, "p1", "graveyard", "Merfolk Coralsmith")).toHaveLength(1);
    expect(scried).toBe(true);
  });

  it("Misleading Motes: the owner puts the targeted creature on top or bottom of their library", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Misleading Motes"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Misleading Motes", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    const lib = s.players.p2?.library ?? [];
    expect(nameOf(s, lib[lib.length - 1] as string)).toBe("Serra Angel");
  });

  it("Desperate Parry: the targeted creature gets -4/-0 until end of turn", () => {
    const ATT = "Obyra's Attendants // Desperate Parry";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [ATT] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(castAdventure(s, "p1", ATT, { t: [angel] }));
    expect(pt(s, angel)).toEqual([0, 4]);
  });

  it("Free the Fae: mill four cards, then a milled instant, sorcery or Faerie card to hand", () => {
    const PRANK = "Picklock Prankster // Free the Fae";
    let s = scenario({
      p1: {
        battlefield: lands("Island", 2),
        hand: [PRANK],
        library: ["Bear Cub", "Talion's Messenger", "Forest", "Opt", "Lightning Strike"],
      },
    });
    let options: string[] = [];
    s = settle(castAdventure(s, "p1", PRANK), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      const m = req.options.find((id) => nameOf(cur, id) === "Talion's Messenger");
      return m ? [m] : undefined;
    });
    expect(options.sort()).toEqual(["Opt", "Talion's Messenger"]);
    expect(handNames(s, "p1")).toEqual(["Talion's Messenger"]);
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Sleep-Cursed Faerie: enters tapped with three stun counters; {1}{U}: untap it (a counter removed instead)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Sleep-Cursed Faerie"] } });
    s = settle(cast(s, "p1", "Sleep-Cursed Faerie"));
    const f = idOf(s, "p1", "battlefield", "Sleep-Cursed Faerie");
    expect(s.objects[f]?.tapped).toBe(true);
    expect(s.objects[f]?.counters.stun).toBe(3);
    s = settle(activate(s, "p1", f));
    expect(s.objects[f]?.tapped).toBe(true);
    expect(s.objects[f]?.counters.stun).toBe(2);
  });

  it("Snaremaster Sprite: on entering, pay {2}: tap an opposing creature with a stun counter", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Snaremaster Sprite"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Snaremaster Sprite"), pickIf(bear));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(3);
  });

  it("Spell Stutter: counters unless its controller pays {2} plus {1} per Faerie you control", () => {
    const run = (spare: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + spare), hand: ["Lightning Strike"] },
        p2: { battlefield: [...lands("Island", 2), "Talion's Messenger"], hand: ["Spell Stutter"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Spell Stutter", { t: [strike] }));
      return s.players.p2?.life;
    };
    // {2} + {1} (one Faerie): two free lands are not enough, three are.
    expect(run(2)).toBe(20);
    expect(run(3)).toBe(17);
  });

  it("Splashy Spellcaster: each instant or sorcery puts a Wizard Role on up to one other creature", () => {
    let s = scenario({ p1: { battlefield: ["Splashy Spellcaster", "Bear Cub", "Island"], hand: ["Opt"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Opt"), pickIf(bear));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Splashy Spellcaster"))).toEqual([2, 4]);
  });

  it("Stormkeld Prowler: two +1/+1 counters per spell with MV 5 or more", () => {
    let s = scenario({
      p1: { battlefield: ["Stormkeld Prowler", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Lightning Strike"] },
    });
    const prowler = idOf(s, "p1", "battlefield", "Stormkeld Prowler");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(s.objects[prowler]?.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(s.objects[prowler]?.counters["+1/+1"]).toBe(2);
  });

  it("Succumb to the Cold: one or two opposing tapped creatures, a stun counter on each", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Succumb to the Cold"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const ids = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
    s = settle(cast(s, "p1", "Succumb to the Cold", { t: ids }));
    for (const id of ids) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Talion's Messenger: when attacking with a Faerie, draw then discard; a +1/+1 counter on a Faerie", () => {
    let s = scenario({ p1: { battlefield: ["Talion's Messenger"], hand: ["Opt"] } });
    const messenger = idOf(s, "p1", "battlefield", "Talion's Messenger");
    s = settle(attackWith(s, "p1", messenger), pickIf(idOf(s, "p1", "hand", "Opt"), messenger));
    expect(handNames(s, "p1")).toEqual(["Forest"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[messenger]?.counters["+1/+1"]).toBe(1);
    // Without a Faerie attacking: nothing.
    let t = scenario({ p1: { battlefield: ["Talion's Messenger", "Bear Cub"] } });
    t = settle(attackWith(t, "p1", idOf(t, "p1", "battlefield", "Bear Cub")));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Tenacious Tomeseeker: bargained, an instant or sorcery from your graveyard returns to hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Candy Trail"], hand: ["Tenacious Tomeseeker"], graveyard: ["Opt"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    s = settle(
      cast(s, "p1", "Tenacious Tomeseeker", undefined, {
        kicked: true,
        sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
      }),
      pickIf(opt),
    );
    expect(handNames(s, "p1")).toEqual(["Opt"]);
  });

  it("Croaking Curse: taps the targeted creature and attaches a Cursed Role to it", () => {
    const TRANS = "Vantress Transmuter // Croaking Curse";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [TRANS] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(castAdventure(s, "p1", TRANS, { t: [angel] }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(pt(s, angel)).toEqual([1, 1]);
  });

  it("Virtue of Knowledge: enter triggers of your permanents trigger one more time; Vantress Visions copies an ability", () => {
    const VIRTUE = "Virtue of Knowledge // Vantress Visions";
    let s = scenario({ p1: { battlefield: [VIRTUE, ...lands("Island", 6)], hand: ["Archive Dragon"] } });
    let scries = 0;
    s = settle(cast(s, "p1", "Archive Dragon"), (req) => {
      if (req.intent === "scryBottom") scries += 1;
      return undefined;
    });
    expect(scries).toBe(2);

    let t = scenario({ p1: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 3)], hand: [VIRTUE] } });
    const smith = idOf(t, "p1", "battlefield", "Merfolk Coralsmith");
    t = activate(t, "p1", smith);
    const ability = t.stack[0]?.id as string;
    t = settle(castAdventure(t, "p1", VIRTUE, { t: [ability] }));
    expect(pt(t, smith)).toEqual([4, 1]);

    // "you control": an opponent's ability can't be targeted.
    let u = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: [VIRTUE] },
      p2: { battlefield: ["Merfolk Coralsmith", ...lands("Island", 1)] },
    });
    u = activate(u, "p2", idOf(u, "p2", "battlefield", "Merfolk Coralsmith"));
    const theirs = u.stack[0]?.id as string;
    u = act(u, "p2", { type: "pass" });
    expect(u.pending?.kind === "priority" && u.pending.player).toBe("p1");
    expect(() => castAdventure(u, "p1", VIRTUE, { t: [theirs] })).toThrow();
  });

  it("Water Wings: base P/T 4/4, flying and hexproof until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["Water Wings"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Water Wings", { t: [bear] }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Frolicking Familiar: +1/+1 per instant or sorcery; Blow Off Steam deals 1 damage", () => {
    const FAMILIAR = "Frolicking Familiar // Blow Off Steam";
    let s = scenario({ p1: { battlefield: [FAMILIAR, ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
    const fam = idOf(s, "p1", "battlefield", FAMILIAR);
    s = settle(cast(s, "p1", "Opt"));
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, fam)).toEqual([4, 4]);
  });

  it("Rip the Seams: destroys a tapped creature only", () => {
    const CLIQUE = "Threadbind Clique // Rip the Seams";
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: [CLIQUE] },
      p2: { battlefield: ["Bear Cub", { name: "Serra Angel", tapped: true }] },
    });
    expect(() => castAdventure(s, "p1", CLIQUE, { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(castAdventure(s, "p1", CLIQUE, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Swift Spiral: exiles a nontoken creature, which returns under its owner's control at the next end step", () => {
    const TWINS = "Twining Twins // Swift Spiral";
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: [TWINS] }, p2: { battlefield: ["Serra Angel"] } });
    s = settle(castAdventure(s, "p1", TWINS, { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Faerie Slumber Party: all creatures in hand; two Faeries per opponent who controlled one", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Faerie Slumber Party"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Faerie Slumber Party"));
    expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
    expect(handNames(s, "p2").sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Faerie")).toHaveLength(2);

    let t = scenario({ p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Faerie Slumber Party"] } });
    t = settle(cast(t, "p1", "Faerie Slumber Party"));
    expect(idsOf(t, "p1", "battlefield", "Faerie")).toHaveLength(0);
  });

  it("Rowdy Research: costs {1} less per creature that attacked this turn", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Island", 5)], hand: ["Rowdy Research"] } });
    const card = idOf(s, "p1", "hand", "Rowdy Research");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card)).toBe(false);
    s = attackWith(s, "p1", ...idsOf(s, "p1", "battlefield", "Bear Cub"));
    s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(cast(s, "p1", "Rowdy Research"));
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Rowdy Research, Witchstalker Frenzy: a creature that attacks in two combats counts only once", () => {
    // Serra Angel (vigilance) attacks in the combat and the additional combat: only one creature attacked.
    const twoCombats = (battlefield: string[], hand: string[]) => {
      let s = scenario({ p1: { battlefield: ["Serra Angel", ...battlefield], hand } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s.turn.addedPhases = ["beginCombat"];
      s = throughCombat(attackWith(s, "p1", angel));
      expect(s.pending?.kind).toBe("declareAttackers");
      s = throughCombat(attackWith(s, "p1", angel));
      expect(s.players.p2?.life).toBe(12);
      expect(countTurnEvents(s, { event: "attack" }, "p1")).toBe(2);
      expect(countTurnEvents(s, { event: "attack", distinct: "object" }, "p1")).toBe(1);
      return s;
    };
    // {6}{U} minus {1}: six mana, five Islands are not enough, six are.
    let s = twoCombats(lands("Island", 5), ["Rowdy Research"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Rowdy Research"))).toBe(false);
    s = twoCombats(lands("Island", 6), ["Rowdy Research"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Rowdy Research"))).toBe(true);
    // {3}{R} minus {1}: three mana.
    s = twoCombats(lands("Mountain", 2), ["Witchstalker Frenzy"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Witchstalker Frenzy"))).toBe(false);
    s = twoCombats(lands("Mountain", 3), ["Witchstalker Frenzy"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Witchstalker Frenzy"))).toBe(true);
  });
});

describe("Wilds of Eldraine, lot A — noir", () => {
  /**
   * Wilds of Eldraine, lot A - black cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id)).sort();
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** After a direct modification (destruction): state-based actions, then triggers resolved. */
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** Answers choices until a "cast now" priority (608.2g). */
  const toCastNow = (s: S, answer: Answer): S => {
    let cur = s;
    for (let i = 0; i < 100 && !castNowOf(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Answer: picks, among a choice's options, those that are in `want`. */
  const pickIds =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length ? picked : undefined;
    };
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };

  describe("Enchantments put into the graveyard: Hopeless Nightmare, Ashiok's Reaper, Wicked Visitor, Warehouse Tabby", () => {
    it("Hopeless Nightmare: on entering, each opponent discards a card and loses 2 life", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Hopeless Nightmare"] }, p2: { hand: ["Opt"] } });
      s = settle(cast(s, "p1", "Hopeless Nightmare"));
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(18);
    });

    it("{2}{B}: sacrificed, scry 2; the Reaper draws, the Visitor makes you lose 1 life, the Tabby creates a Rat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hopeless Nightmare", "Ashiok's Reaper", "Wicked Visitor", "Warehouse Tabby", ...lands("Swamp", 3)],
          library: ["Opt", "Island", "Forest", "Plains"],
        },
      });
      let scried = false;
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hopeless Nightmare")), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Hopeless Nightmare")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.life).toBe(19);
      const rat = idOf(s, "p1", "battlefield", "Rat");
      expect([...pt(s, rat), chars(s, rat).colors]).toEqual([1, 1, ["B"]]);
    });

    it("an opposing enchantment put into the graveyard triggers nothing", () => {
      let s = scenario({
        p1: { battlefield: ["Ashiok's Reaper", "Wicked Visitor"] },
        p2: { battlefield: ["Hopeless Nightmare", ...lands("Swamp", 3)] },
        active: "p2",
      });
      s = settle(activate(s, "p2", idOf(s, "p2", "battlefield", "Hopeless Nightmare")));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.life).toBe(20);
    });

    it("Warehouse Tabby: {1}{B} gives it deathtouch until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Warehouse Tabby", ...lands("Swamp", 2)] } });
      const tabby = idOf(s, "p1", "battlefield", "Warehouse Tabby");
      s = settle(activate(s, "p1", tabby));
      expect(chars(s, tabby).keywords).toContain("deathtouch");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, tabby).keywords).not.toContain("deathtouch");
    });
  });

  describe("Marchandage", () => {
    it("Back for Seconds: two creature cards return to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Back for Seconds"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const ids = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")];
      s = settle(cast(s, "p1", "Back for Seconds", { t: ids }));
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub", "Serra Angel"]);
    });

    it("bargained Back for Seconds: one of them with MV 4 or less enters the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Candy Trail"],
          hand: ["Back for Seconds"],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      let offered: string[] = [];
      s = settle(
        cast(
          s,
          "p1",
          "Back for Seconds",
          { t: [bear, angel] },
          { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] },
        ),
        (req) => {
          if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
          offered = req.options.map(String);
          return [bear];
        },
      );
      // The Angel (MV 5) is not offered.
      expect(offered).toEqual([bear]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(names(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("bargained Beseech the Mirror: the searched card (MV 4 or less) is cast without paying its cost", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4), "Candy Trail"],
          hand: ["Beseech the Mirror"],
          library: ["Island", "Bear Cub", "Island"],
        },
      });
      s = cast(s, "p1", "Beseech the Mirror", undefined, {
        kicked: true,
        sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
      });
      s = toCastNow(s, (req) => {
        if (req.intent !== "search" || req.type !== "pick") return undefined;
        return req.options.filter((id) => nameOf(s, String(id)) === "Bear Cub").slice(0, 1);
      });
      const bear = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bear)).toBe("Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: bear, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("unbargained Beseech the Mirror: the searched card goes to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Beseech the Mirror"], library: ["Island", "Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Beseech the Mirror"), (req) => {
        if (req.intent !== "search" || req.type !== "pick") return undefined;
        return req.options.filter((id) => nameOf(s, String(id)) === "Bear Cub").slice(0, 1);
      });
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Candy Grapple: -3/-3, or -5/-5 if bargained", () => {
      const run = (bargain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), "Candy Trail"], hand: ["Candy Grapple"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Candy Grapple"), targets: { t: [angel] }, ...extra });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
        return s.objects[angel]?.zone === "battlefield" ? pt(s, angel) : "mort";
      };
      expect(run(false)).toEqual([1, 1]);
      expect(run(true)).toBe("mort");
    });

    it("bargained High Fae Negotiator: each opponent loses 3 life and you gain 3 life; otherwise nothing", () => {
      const run = (bargain: boolean) => {
        let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Candy Trail"], hand: ["High Fae Negotiator"] } });
        const extra = bargain ? { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] } : {};
        s = settle(cast(s, "p1", "High Fae Negotiator", undefined, extra));
        expect(idsOf(s, "p1", "battlefield", "High Fae Negotiator")).toHaveLength(1);
        return [s.players.p1?.life, s.players.p2?.life];
      };
      expect(run(true)).toEqual([23, 17]);
      expect(run(false)).toEqual([20, 20]);
    });

    it("bargained Rowan's Grim Search: two cards kept on top, two in the graveyard, then draw two and lose 2 life", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Candy Trail"],
          hand: ["Rowan's Grim Search"],
          library: ["Opt", "Bear Cub", "Serra Angel", "Shivan Dragon", "Plains"],
        },
      });
      s = settle(
        cast(s, "p1", "Rowan's Grim Search", undefined, {
          kicked: true,
          sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")],
        }),
        (req) => {
          if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
          return req.options.filter((id) => ["Bear Cub", "Shivan Dragon"].includes(nameOf(s, String(id)) ?? ""));
        },
      );
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Candy Trail", "Opt", "Rowan's Grim Search", "Serra Angel"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
      expect(s.players.p1?.life).toBe(18);
    });
  });

  describe("Roles", () => {
    it("Price of Beauty: a Wicked Role (+1/+1) on your creature; the Witch is then cast from exile", () => {
      const WITCH = "Conceited Witch // Price of Beauty";
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: [WITCH] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", WITCH), face: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      const adv = exiled(s, WITCH)[0] as string;
      expect(s.objects[adv]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: adv }));
      expect(chars(s, idOf(s, "p1", "battlefield", WITCH)).keywords).toContain("menace");
    });

    it("Eriette's Whisper: the opponent discards two cards; a Wicked Role on up to one of your creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Eriette's Whisper"] },
        p2: { hand: ["Opt", "Island", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Eriette's Whisper", { p: ["p2"], c: [bear] }));
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(pt(s, bear)).toEqual([3, 3]);
      let t = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Eriette's Whisper"] }, p2: { hand: ["Opt"] } });
      t = settle(cast(t, "p1", "Eriette's Whisper", { p: ["p2"] }));
      expect(t.players.p2?.graveyard).toHaveLength(1);
    });

    it("Spiteful Hexmage: a Cursed Role (1/1) on a creature you control", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Serra Angel"], hand: ["Spiteful Hexmage"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spiteful Hexmage"), pickIds([angel]));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Shatter the Oath: destroys a creature or an enchantment; Wicked Role on your creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Shatter the Oath"] },
        p2: { battlefield: ["Hopeless Nightmare"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Shatter the Oath", { t: [idOf(s, "p2", "battlefield", "Hopeless Nightmare")], c: [bear] }));
      expect(idsOf(s, "p2", "graveyard", "Hopeless Nightmare")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Not Dead After All: the creature that dies comes back tapped with a Wicked Role", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Not Dead After All"] } });
      s = settle(cast(s, "p1", "Not Dead After All", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settleAll(s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(idsOf(s, "p1", "battlefield", "Wicked Role")).toHaveLength(1);
    });

    it("The Witch's Vanity: I destroys an opposing creature with MV 2 or less, II a Food, III a Wicked Role", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Serra Angel"], hand: ["The Witch's Vanity"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "The Witch's Vanity"));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settleAll(s);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settleAll(s);
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([5, 5]);
      expect(idsOf(s, "p1", "graveyard", "The Witch's Vanity")).toHaveLength(1);
    });
  });

  describe("Faeries", () => {
    it("Barrow Naughty: lifelink only with another Faerie; {2}{B}: +1/+0", () => {
      let s = scenario({ p1: { battlefield: ["Barrow Naughty", ...lands("Swamp", 3)] } });
      const naughty = idOf(s, "p1", "battlefield", "Barrow Naughty");
      expect(chars(s, naughty).keywords).not.toContain("lifelink");
      s = settle(activate(s, "p1", naughty));
      expect(pt(s, naughty)).toEqual([2, 3]);
      const t = scenario({ p1: { battlefield: ["Barrow Naughty", "Faerie Dreamthief"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Barrow Naughty")).keywords).toContain("lifelink");
    });

    it("Dream Spoilers: a spell cast during an opponent's turn gives -1/-1 to an opposing creature; not during your turn", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Dream Spoilers", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Opt"), pickIds([bear]));
      expect(pt(s, bear)).toEqual([1, 1]);
      let t = scenario({ p1: { battlefield: ["Dream Spoilers", "Island"], hand: ["Opt"] }, p2: { battlefield: ["Bear Cub"] } });
      t = settle(cast(t, "p1", "Opt"));
      expect(pt(t, idOf(t, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Ego Drain: you choose a nonland card they discard; without a Faerie, you exile a card from your hand", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Ego Drain", "Opt"] },
        p2: { hand: ["Forest", "Bear Cub", "Serra Angel"] },
      });
      let options: string[] = [];
      s = settle(cast(s, "p1", "Ego Drain", { t: ["p2"] }), (req, player) => {
        if (req.type !== "pick" || player !== "p1" || req.intent === undefined) return undefined;
        if (req.options.every((id) => s.players.p2?.hand.includes(String(id)))) {
          options = names(s, req.options.map(String)) as string[];
          return req.options.filter((id) => nameOf(s, String(id)) === "Serra Angel");
        }
        return undefined;
      });
      expect(options).toEqual(["Bear Cub", "Serra Angel"]);
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
      expect(exiled(s, "Opt")).toHaveLength(1);
      // With a Faerie: nothing is exiled.
      let t = scenario({
        p1: { battlefield: ["Swamp", "Faerie Dreamthief"], hand: ["Ego Drain", "Opt"] },
        p2: { hand: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Ego Drain", { t: ["p2"] }));
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Faerie Dreamthief: surveil 1 on entering; {2}{B}, exiled from the graveyard: draw, lose 1 life", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Faerie Dreamthief"], library: ["Opt", "Forest"] } });
      s = settle(cast(s, "p1", "Faerie Dreamthief"), (req) => (req.type === "pick" ? req.options : undefined));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      destroy(s, idOf(s, "p1", "battlefield", "Faerie Dreamthief"));
      s = settleAll(s);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Faerie Dreamthief")));
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.players.p1?.life).toBe(19);
      expect(exiled(s, "Faerie Dreamthief")).toHaveLength(1);
    });

    it("Faerie Fencing: -X/-X, and -3/-3 more if you control a Faerie", () => {
      const run = (faerie: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), ...(faerie ? ["Faerie Dreamthief"] : [])], hand: ["Faerie Fencing"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "Faerie Fencing", { t: [dragon] }, { x: 1 }));
        return pt(s, dragon);
      };
      expect(run(false)).toEqual([4, 4]);
      expect(run(true)).toEqual([1, 1]);
    });

    it("Stingblade Assassin: destroys an opposing creature damaged this turn; an undamaged creature is not a target", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Stingblade Assassin"] },
        p2: { battlefield: ["Serra Angel", { name: "Shivan Dragon", damage: 1 }] },
      });
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Stingblade Assassin"), (req) => {
        if (req.type === "pick") offered = names(s, req.options.map(String)) as string[];
        return undefined;
      });
      expect(offered).not.toContain("Serra Angel");
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Spellscorn Coven: each opponent discards; Take It Back returns a spell to its owner's hand", () => {
      const COVEN = "Spellscorn Coven // Take It Back";
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: [...lands("Swamp", 4), "Island"], hand: [COVEN, "Opt"] },
      });
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", COVEN), face: 1, targets: { t: [strike] } }));
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(20);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(act(s, "p2", { type: "cast", card: exiled(s, COVEN)[0] as string }));
      expect(s.players.p1?.hand).toHaveLength(hand - 1);
    });
  });

  describe("Rats", () => {
    it("Lord Skitter, Sewer King: a Rat at the beginning of your combat; another Rat enters: a card from an opposing graveyard exiled", () => {
      let s = scenario({ p1: { battlefield: ["Lord Skitter, Sewer King"] }, p2: { graveyard: ["Opt"] } });
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      s = settle(s, pickIds([opt]));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Rat Out: up to one creature gets -1/-1; you create a Rat that can't block", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Rat Out"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rat Out", { t: [bear] }));
      expect(pt(s, bear)).toEqual([1, 1]);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Voracious Vermin: a Rat on entering; another creature of yours dies: a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Voracious Vermin"] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Voracious Vermin"));
      const vermin = idOf(s, "p1", "battlefield", "Voracious Vermin");
      destroy(s, idOf(s, "p1", "battlefield", "Rat"));
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = settleAll(s);
      expect(s.objects[vermin]?.counters["+1/+1"]).toBe(1);
    });

    it("Lord Skitter's Butcher: sacrifice another creature, scry 2, then draw a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Lord Skitter's Butcher"], library: ["Opt", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lord Skitter's Butcher"), (req) => {
        if (req.intent === "triggerMode") return ["1"];
        if (req.type === "pick" && req.intent === "sacrifice") return [bear];
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Lord Skitter's Butcher: your creatures gain menace until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Lord Skitter's Butcher"] } });
      s = settle(cast(s, "p1", "Lord Skitter's Butcher"), (req) => (req.intent === "triggerMode" ? ["2"] : undefined));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Lord Skitter's Butcher")).keywords).toContain("menace");
    });
  });

  describe("Nourriture", () => {
    it("Sweettooth Witch and Experimental Confectioner: sacrificing a Food makes you lose 2 life and creates a Rat", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Experimental Confectioner"], hand: ["Sweettooth Witch"] },
      });
      s = settle(cast(s, "p1", "Sweettooth Witch"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Sweettooth Witch"), { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Feed the Cauldron: destroys a creature with MV 3 or less; a Food only during your turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Feed the Cauldron"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Feed the Cauldron", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] })).toThrow();
      s = settle(cast(s, "p1", "Feed the Cauldron", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        p1: { battlefield: lands("Swamp", 3), hand: ["Feed the Cauldron"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = act(t, "p2", { type: "pass" });
      t = settle(cast(t, "p1", "Feed the Cauldron", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
    });

    it("Gumdrop Poisoner: -X/-X, X being the life gained this turn (Tempt with Treats: a Food)", () => {
      const POISONER = "Gumdrop Poisoner // Tempt with Treats";
      let s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: [POISONER] }, p2: { battlefield: ["Serra Angel"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", POISONER), face: 1 }));
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Food")));
      expect(s.players.p1?.life).toBe(23);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, POISONER)[0] as string }), pickIds([angel]));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Old Flitterfang: a Food at the end step if a creature died; {2}{B}, sacrifice: +2/+2", () => {
      let s = scenario({ p1: { battlefield: ["Old Flitterfang", "Bear Cub", ...lands("Swamp", 3)] } });
      const fang = idOf(s, "p1", "battlefield", "Old Flitterfang");
      s = settle(activate(s, "p1", fang, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(pt(s, fang)).toEqual([5, 6]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      // No creature died this turn: nothing.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Devouring Sugarmaw: at your upkeep, without a sacrifice it taps; Have for Dinner: a Human and a Food", () => {
      const MAW = "Devouring Sugarmaw // Have for Dinner";
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Plains"], hand: [MAW] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", MAW), face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, MAW)[0] as string }));
      const maw = idOf(s, "p1", "battlefield", MAW);
      // First upkeep: the Food is sacrificed; second: nothing to sacrifice to keep the creature untapped.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.pending?.kind === "choice");
      const food = idOf(s, "p1", "battlefield", "Food");
      s = settle(s, pickIds([food]));
      expect(s.objects[maw]?.tapped).toBe(false);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1");
      // The Human token can still be sacrificed: we decline.
      expect(s.objects[maw]?.tapped).toBe(true);
    });

    it("Malevolent Witchkite: sacrifice artifacts, enchantments and/or tokens, then draw that many", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Candy Trail", "Hopeless Nightmare", "Bear Cub"],
          hand: ["Malevolent Witchkite"],
        },
      });
      const sac = [idOf(s, "p1", "battlefield", "Candy Trail"), idOf(s, "p1", "battlefield", "Hopeless Nightmare")];
      let options: string[] = [];
      s = settle(cast(s, "p1", "Malevolent Witchkite"), (req) => {
        if (req.type !== "pick" || req.intent !== "sacrifice") return undefined;
        options = req.options.map(String);
        return sac;
      });
      expect(options.sort()).toEqual([...sac].sort());
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("Graveyard", () => {
    it("Lich-Knights' Conquest: as many creature cards return as permanents sacrificed", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 5), "Candy Trail", "Hopeless Nightmare"],
          hand: ["Lich-Knights' Conquest"],
          graveyard: ["Bear Cub", "Serra Angel", "Shivan Dragon"],
        },
      });
      const sac = [idOf(s, "p1", "battlefield", "Candy Trail"), idOf(s, "p1", "battlefield", "Hopeless Nightmare")];
      const back = [idOf(s, "p1", "graveyard", "Serra Angel"), idOf(s, "p1", "graveyard", "Shivan Dragon")];
      s = settle(cast(s, "p1", "Lich-Knights' Conquest"), pickIds([...sac, ...back]));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Fell Horseman: when it dies, it goes to the bottom of the library; Deathly Ride returns a creature card", () => {
      const HORSEMAN = "Fell Horseman // Deathly Ride";
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: [HORSEMAN], graveyard: ["Bear Cub"], library: ["Opt"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", HORSEMAN),
          face: 1,
          targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] },
        }),
      );
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, HORSEMAN)[0] as string }));
      destroy(s, idOf(s, "p1", "battlefield", HORSEMAN));
      s = settleAll(s);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Opt", HORSEMAN]);
    });

    it("Specter of Mortality: exile two creature cards: each other creature gets -2/-2", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 5), "Bear Cub"],
          hand: ["Specter of Mortality"],
          graveyard: ["Opt", "Serra Angel", "Shivan Dragon"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Specter of Mortality"), (req) => {
        if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
        offered = names(s, req.options.map(String)) as string[];
        return req.options;
      });
      expect(offered).toEqual(["Serra Angel", "Shivan Dragon"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Specter of Mortality"))).toEqual([3, 3]);
    });

    it("Virtue of Persistence: at your upkeep, a creature card from a graveyard enters under your control", () => {
      let s = scenario({ p1: { battlefield: ["Virtue of Persistence // Locthwain Scorn"] }, p2: { graveyard: ["Serra Angel"] } });
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.owner).toBe("p2");
    });

    it("Locthwain Scorn: -3/-3 and you gain 2 life", () => {
      const VIRTUE = "Virtue of Persistence // Locthwain Scorn";
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [VIRTUE] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", VIRTUE), face: 1, targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
      expect(s.players.p1?.life).toBe(22);
    });

    it("Cruel Somnophage: P/T equal to the creature cards in all graveyards; Can't Wake Up: mills four", () => {
      const SOMNO = "Cruel Somnophage // Can't Wake Up";
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Island"], hand: [SOMNO], graveyard: ["Bear Cub", "Opt"] },
        p2: { library: ["Serra Angel", "Shivan Dragon", "Island", "Opt", "Forest"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", SOMNO), face: 1, targets: { t: ["p2"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(4);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, SOMNO)[0] as string }));
      expect(pt(s, idOf(s, "p1", "battlefield", SOMNO))).toEqual([3, 3]);
    });
  });

  describe("Autres", () => {
    it("Rankle's Prank: all three modes together (discard, life loss, sacrifice)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Rankle's Prank", "Opt", "Island"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon", "Bear Cub"], hand: ["Opt", "Forest", "Island"] },
      });
      const card = idOf(s, "p1", "hand", "Rankle's Prank");
      // The seventh mode: all three together.
      s = settle(act(s, "p1", { type: "cast", card, mode: 6 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([16, 16]);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
    });

    it("Taken by Nightmares: exiles a creature; scry 2 if you control an enchantment", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Hopeless Nightmare"], hand: ["Taken by Nightmares"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      let scried = false;
      s = settle(cast(s, "p1", "Taken by Nightmares", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(scried).toBe(true);
    });

    it("Sugar Rush: +3/+0 and draw a card", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Sugar Rush"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Sugar Rush", { t: [bear] }));
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Callous Sell-Sword: a counter per creature that died under your control this turn; Burn Together", () => {
      const SWORD = "Callous Sell-Sword // Burn Together";
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2), "Serra Angel", "Bear Cub"], hand: [SWORD] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const card = idOf(s, "p1", "hand", SWORD);
      // "another target": the creature itself is not a legal target.
      expect(() => act(s, "p1", { type: "cast", card, face: 1, targets: { c: [angel], t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { c: [angel], t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settleAll(s);
      s = settle(act(s, "p1", { type: "cast", card: exiled(s, SWORD)[0] as string }));
      const sword = idOf(s, "p1", "battlefield", SWORD);
      expect(s.objects[sword]?.counters["+1/+1"]).toBe(2);
    });
  });
});

describe("Wilds of Eldraine, lot A — rouge", () => {
  /**
   * Wilds of Eldraine, lot A - red cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7) playing through decisions. Celebration is obtained by casting Redcap Thief (a creature and a
   * Treasure token: two nonland permanents).
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Answers choices with the wanted values when they are offered (otherwise the suggestion). */
  const want =
    (...values: ChoiceValue[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return values.includes("no") ? [0] : [1];
      if (req.type !== "pick") return undefined;
      const picked = values.filter((v) => req.options.includes(String(v))).slice(0, req.max);
      return picked.length > 0 ? picked : undefined;
    };

  /** Passes and answers choices until `until` (or a state with no decision). */
  const drive = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const stable = (x: S) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
  /** Passes once, then until an empty stack with no pending trigger. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    return drive(cur, stable, answer);
  };
  /** Up to the active player's beginning of combat, triggers resolved. */
  const toCombat = (s: S, answer: Answer = () => undefined) =>
    drive(s, (x) => x.turn.step === "beginCombat" && stable(x), answer);
  /** Up to declare attackers, then attacks player 2 with those creatures. */
  const attack = (s: S, ids: string[], answer: Answer = () => undefined) => {
    const cur = drive(s, (x) => x.pending?.kind === "declareAttackers", answer);
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: string) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Celebration: Redcap Thief enters with a Treasure token (three Mountains needed). */
  const celebrate = (s: S) => settle(cast(s, "p1", "Redcap Thief"));
  const castOptions = (s: S, card: string) => legalActions(s, "p1").filter((a) => a.type === "cast" && a.card === card);

  describe("Celebration", () => {
    it("Belligerent of the Ball: at the beginning of combat, with Celebration, one of your creatures gets +1/+0 and menace", () => {
      let s = scenario({
        p1: { battlefield: ["Belligerent of the Ball", "Bear Cub", ...lands("Mountain", 3)], hand: ["Redcap Thief"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = celebrate(s);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      s = toCombat(s, want(bear));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("menace");
    });

    it("Belligerent of the Ball: without Celebration, nothing triggers", () => {
      let s = scenario({ p1: { battlefield: ["Belligerent of the Ball", "Bear Cub"] } });
      s = toCombat(s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Belligerent of the Ball")).keywords).not.toContain("menace");
    });

    it("Grand Ball Guest: +1/+1 and trample as long as Celebration is met", () => {
      let s = scenario({ p1: { battlefield: ["Grand Ball Guest", ...lands("Mountain", 3)], hand: ["Redcap Thief"] } });
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      expect(pt(s, guest)).toEqual([2, 2]);
      s = celebrate(s);
      expect(pt(s, guest)).toEqual([3, 3]);
      expect(chars(s, guest).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, guest)).toEqual([2, 2]);
    });

    it("Bespoke Battlegarb: the equipped creature gets +2/+0; Celebration: it attaches to one of your creatures at the beginning of combat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bespoke Battlegarb", "Bear Cub", "Grand Ball Guest", ...lands("Mountain", 5)],
          hand: ["Redcap Thief"],
        },
      });
      const garb = idOf(s, "p1", "battlefield", "Bespoke Battlegarb");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      s = settle(activate(s, "p1", garb, { targets: { t: [bear] } }));
      expect(s.objects[garb]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 2]);
      s = celebrate(s);
      s = toCombat(s, want(guest));
      expect(s.objects[garb]?.attachedTo).toBe(guest);
      expect(pt(s, bear)).toEqual([2, 2]);
      // Grand Ball Guest: 2/2, +1/+1 (Celebration), +2/+0 (equipped).
      expect(pt(s, guest)).toEqual([5, 3]);
    });

    it("Goddric: without Celebration, 3/3 Human without flying; with it, 4/4 flying Dragon whose {R} gives +1/+0 to Dragons", () => {
      let s = scenario({ p1: { battlefield: ["Goddric, Cloaked Reveler", ...lands("Mountain", 4)], hand: ["Redcap Thief"] } });
      const god = idOf(s, "p1", "battlefield", "Goddric, Cloaked Reveler");
      expect(pt(s, god)).toEqual([3, 3]);
      expect(chars(s, god).keywords).not.toContain("flying");
      expect(chars(s, god).keywords).toContain("haste");
      expect(chars(s, god).subtypes).toEqual(expect.arrayContaining(["Human", "Noble"]));
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === god)).toBe(false);
      s = celebrate(s);
      expect(pt(s, god)).toEqual([4, 4]);
      expect(chars(s, god).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, god).subtypes).toEqual(["Dragon"]);
      s = settle(activate(s, "p1", god));
      expect(pt(s, god)).toEqual([5, 4]);
    });

    it("Raging Battle Mouse: the second spell of the turn costs {1} less; Celebration: +1/+1 to one of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raging Battle Mouse", "Bear Cub", ...lands("Mountain", 5)],
          hand: ["Redcap Thief", "Harried Spearguard"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // First spell: {2}{R} paid in full.
      s = celebrate(s);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(3);
      // Second spell: Harried Spearguard ({R}) still costs {R} (the reduction only touches generic).
      s = settle(cast(s, "p1", "Harried Spearguard"));
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
      s = toCombat(s, want(bear));
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Raging Battle Mouse: the second spell costs {1} less (Redcap Thief for {1}{R})", () => {
      let s = scenario({
        p1: { battlefield: ["Raging Battle Mouse", ...lands("Mountain", 3)], hand: ["Harried Spearguard", "Redcap Thief"] },
      });
      s = settle(cast(s, "p1", "Harried Spearguard"));
      // Two Mountains remain: Redcap Thief ({2}{R}) is castable only thanks to the reduction.
      s = settle(cast(s, "p1", "Redcap Thief"));
      expect(idsOf(s, "p1", "battlefield", "Redcap Thief")).toHaveLength(1);
    });
  });

  describe("Roles", () => {
    it('Charming Scoundrel: on entering, "Wicked Role" mode on one of your creatures (+1/+1)', () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Charming Scoundrel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Charming Scoundrel"), want("2", bear));
      expect(idsOf(s, "p1", "battlefield", "Wicked Role")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Charming Scoundrel")).keywords).toContain("haste");
    });

    it('Charming Scoundrel: "discard a card, then draw a card" mode and Treasure mode', () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Charming Scoundrel", "Opt"], library: ["Island", "Forest"] },
      });
      s = settle(cast(s, "p1", "Charming Scoundrel"), want("0"));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Charming Scoundrel"] } });
      t = settle(cast(t, "p1", "Charming Scoundrel"), want("1"));
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Cut In: 4 damage to a creature and a Young Hero Role on up to one of your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Cut In"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cut In", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")], r: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
      // The Role: when attacking with toughness 3 or less, a +1/+1 counter.
      s = settle(attack(s, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Embereth Veteran: {1}, sacrifice it: a Young Hero Role on another targeted creature (not itself)", () => {
      let s = scenario({ p1: { battlefield: ["Embereth Veteran", "Bear Cub", "Mountain"] } });
      const vet = idOf(s, "p1", "battlefield", "Embereth Veteran");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => activate(s, "p1", vet, { targets: { t: [vet] } })).toThrow();
      s = settle(activate(s, "p1", vet, { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Embereth Veteran")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
    });

    it("Merry Bards: paying {1}, a Young Hero Role on a targeted creature you control; without paying, nothing", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Merry Bards"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Merry Bards"), want(bear));
      expect(s.objects[idOf(s, "p1", "battlefield", "Young Hero Role")]?.attachedTo).toBe(bear);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Merry Bards"] } });
      t = settle(cast(t, "p1", "Merry Bards"), want("no"));
      expect(idsOf(t, "p1", "battlefield", "Young Hero Role")).toHaveLength(0);
    });

    it("Monstrous Rage: +2/+0 until end of turn and a Monster Role (+1/+1, trample) that stays", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Monstrous Rage"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Monstrous Rage", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Twisted Fealty: you gain control of the creature until end of turn, untapped and with haste; Wicked Role", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Twisted Fealty"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true, sick: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Twisted Fealty", { targets: { t: [angel], r: [bear] } }));
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      expect(pt(s, bear)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Witch's Mark: discard a card to draw two; a Wicked Role on one of your creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 2)],
          hand: ["Witch's Mark", "Opt"],
          library: ["Island", "Forest", "Plains"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Witch's Mark", { targets: { t: [bear] } }), want(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Island"]);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    it("Become Brutes: one or two creatures gain haste, each with a Monster Role", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", sick: true }, { name: "Grand Ball Guest", sick: true }, ...lands("Mountain", 2)],
          hand: ["Become Brutes"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const guest = idOf(s, "p1", "battlefield", "Grand Ball Guest");
      expect(() => cast(s, "p1", "Become Brutes", { targets: { a: [bear], b: [bear] } })).toThrow();
      s = settle(cast(s, "p1", "Become Brutes", { targets: { a: [bear], b: [guest] } }));
      expect(idsOf(s, "p1", "battlefield", "Monster Role")).toHaveLength(2);
      for (const id of [bear, guest]) expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(pt(s, bear)).toEqual([3, 3]);
      // The two Roles are two nonland permanents that entered: Celebration for Grand Ball Guest (+1/+1 more).
      expect(pt(s, guest)).toEqual([4, 4]);
    });
  });

  describe("Blessures", () => {
    it("Flick a Coin: 1 damage to any target, a Treasure and a card drawn", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flick a Coin"], library: ["Island"] } });
      s = settle(cast(s, "p1", "Flick a Coin", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(19);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("Frantic Firebolt: 2 plus the instants, sorceries and cards with an Adventure in your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Frantic Firebolt"],
          graveyard: ["Opt", "Grabby Giant // That's Mine", "Bear Cub", "Forest"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Frantic Firebolt", { targets: { t: [angel] } }));
      // Opt and the Adventure: 2 + 2 = 4 damage, the Angel (4/4) dies.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Frantic Firebolt"], graveyard: ["Opt", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = settle(cast(t, "p1", "Frantic Firebolt", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
      expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
    });

    it("Stonesplitter Bolt: X damage; bargained, twice X", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Candy Trail", ...lands("Mountain", 3)], hand: ["Stonesplitter Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Stonesplitter Bolt", { targets: { t: [angel] }, x: 2 }));
      expect(s.objects[angel]?.damage).toBe(2);
      let t = setup();
      const candy = idOf(t, "p1", "battlefield", "Candy Trail");
      t = settle(
        cast(t, "p1", "Stonesplitter Bolt", {
          targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
          x: 2,
          kicked: true,
          sacrifice: [candy],
        }),
      );
      expect(idsOf(t, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Witchstalker Frenzy: costs {1} less for each creature that attacked this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Grand Ball Guest", ...lands("Mountain", 2)], hand: ["Witchstalker Frenzy"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const card = idOf(s, "p1", "hand", "Witchstalker Frenzy");
      expect(castOptions(s, card)).toHaveLength(0);
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Grand Ball Guest")]);
      s = drive(s, (x) => x.pending?.kind === "priority");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it('Food Fight: your artifacts have "{2}, sacrifice: 1 plus the number of Food Fight damage to any target"', () => {
      let s = scenario({ p1: { battlefield: ["Food Fight", "Food Fight", "Candy Trail", ...lands("Mountain", 2)] } });
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      const ff = idOf(s, "p1", "battlefield", "Food Fight");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ff)).toBe(false);
      s = settle(activate(s, "p1", candy, { targets: { t: ["p2"] } }, "Food Fight"));
      expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Unruly Catapult: {T}: 1 damage to each opponent; untaps when you cast an instant or sorcery", () => {
      let s = scenario({ p1: { battlefield: ["Unruly Catapult", "Island"], hand: ["Opt"] } });
      const cat = idOf(s, "p1", "battlefield", "Unruly Catapult");
      s = settle(activate(s, "p1", cat));
      expect(s.players.p2?.life).toBe(19);
      expect(s.objects[cat]?.tapped).toBe(true);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[cat]?.tapped).toBe(false);
      s = settle(activate(s, "p1", cat));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Realm-Scorcher Hellkite: bargained, four mana of colors of your choice; {1}{R}: 1 damage to any target", () => {
      let s = scenario({ p1: { battlefield: ["Candy Trail", ...lands("Mountain", 6)], hand: ["Realm-Scorcher Hellkite"] } });
      const candy = idOf(s, "p1", "battlefield", "Candy Trail");
      // One division (PLAN-L L3): {U}, {G}{G}, {B}.
      const want: Record<string, number> = { U: 1, G: 2, B: 1 };
      let asked = 0;
      s = settle(cast(s, "p1", "Realm-Scorcher Hellkite", { kicked: true, sacrifice: [candy] }), (req) => {
        if (req.type !== "divide" || req.intent !== "manaColor") return undefined;
        asked++;
        return req.among.map((c) => want[c] ?? 0);
      });
      expect(asked).toBe(1);
      const pool = s.players.p1?.manaPool;
      expect([pool?.U, pool?.G, pool?.B]).toEqual([1, 2, 1]);
      const hk = idOf(s, "p1", "battlefield", "Realm-Scorcher Hellkite");
      let t = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Realm-Scorcher Hellkite"] } });
      t = settle(cast(t, "p1", "Realm-Scorcher Hellkite"));
      expect(Object.values(t.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
      expect(chars(s, hk).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      let u = scenario({ p1: { battlefield: ["Realm-Scorcher Hellkite", ...lands("Mountain", 2)] } });
      u = settle(activate(u, "p1", idOf(u, "p1", "battlefield", "Realm-Scorcher Hellkite"), { targets: { t: ["p2"] } }));
      expect(u.players.p2?.life).toBe(19);
    });
  });

  describe("Rats", () => {
    it("Gnawing Crescendo: +2/+0; this turn, a nontoken creature you control that dies gives a Rat", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 7)],
          hand: ["Gnawing Crescendo", "Lightning Strike", "Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Gnawing Crescendo"));
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(1);
      expect(chars(s, rats[0] as string).keywords).toContain("cantBlock");
      // The Rat (a token) that dies gives nothing.
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [rats[0] as string] } }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(0);
    });

    it("Harried Spearguard and Edgewall Pack: a 1/1 black Rat that can't block (on dying / on entering)", () => {
      let s = scenario({
        p1: { battlefield: ["Harried Spearguard", ...lands("Mountain", 6)], hand: ["Lightning Strike", "Edgewall Pack"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Harried Spearguard")] } }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(2);
      expect(pt(s, rats[1] as string)).toEqual([1, 1]);
      expect(chars(s, rats[1] as string).colors).toEqual(["B"]);
    });

    it("Tattered Ratter: a Rat you control that becomes blocked gets +2/+0", () => {
      let s = scenario({
        p1: { battlefield: ["Tattered Ratter", ...lands("Mountain", 4)], hand: ["Edgewall Pack"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = attack(s, [rat]);
      s = drive(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: rat }],
      });
      s = drive(s, (x) => x.turn.step === "declareBlockers" && stable(x));
      expect(pt(s, rat)).toEqual([3, 1]);
    });

    it("Ogre Chitterlord: on entering and attacking, two Rats; then with five or more Rats, your Rats get +2/+0", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 10), hand: ["Edgewall Pack", "Ogre Chitterlord"] } });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      s = settle(cast(s, "p1", "Ogre Chitterlord"));
      let rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(3);
      for (const r of rats) expect(pt(s, r)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Ogre Chitterlord")]));
      rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(5);
      for (const r of rats) expect(pt(s, r)).toEqual([3, 1]);
    });

    it("Charging Hooligan: when attacking, +1/+0 per attacking creature; trample if a Rat attacks", () => {
      let s = scenario({
        p1: { battlefield: ["Charging Hooligan", "Bear Cub", "Edgewall Pack", ...lands("Mountain", 4)], hand: ["Edgewall Pack"] },
      });
      s = settle(cast(s, "p1", "Edgewall Pack"));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      const hool = idOf(s, "p1", "battlefield", "Charging Hooligan");
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(attack(s, [hool, idOf(s, "p1", "battlefield", "Bear Cub"), rat]));
      expect(pt(s, hool)).toEqual([6, 3]);
      expect(chars(s, hool).keywords).toContain("trample");
      let t = scenario({ p1: { battlefield: ["Charging Hooligan", "Bear Cub"] } });
      const h2 = idOf(t, "p1", "battlefield", "Charging Hooligan");
      t = settle(attack(t, [h2, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(pt(t, h2)).toEqual([5, 3]);
      expect(chars(t, h2).keywords).not.toContain("trample");
    });
  });

  describe("Combat et autres", () => {
    it("Boundary Lands Ranger: at the beginning of combat, with a creature with power 4 or greater, discard a card to draw one", () => {
      let s = scenario({
        p1: { battlefield: ["Boundary Lands Ranger", "Bellowing Bruiser // Beat a Path"], hand: ["Opt"], library: ["Island"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = toCombat(s, want(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: ["Boundary Lands Ranger", "Bear Cub"], hand: ["Opt"], library: ["Island"] } });
      t = toCombat(t, want(idOf(t, "p1", "hand", "Opt")));
      expect(t.players.p1?.hand.map((id) => nameOf(t, id))).toEqual(["Opt"]);
    });

    it("Kindled Heroism: +1/+0 and the initiative until end of turn, then scry 1", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Kindled Heroism"], library: ["Island", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = settle(cast(s, "p1", "Kindled Heroism", { targets: { t: [bear] } }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
    });

    it("Ratcatcher Trainee: the initiative during your turn only; Pest Problem: two Rats", () => {
      let s = scenario({ p1: { battlefield: ["Ratcatcher Trainee // Pest Problem"] } });
      const trainee = idOf(s, "p1", "battlefield", "Ratcatcher Trainee // Pest Problem");
      expect(chars(s, trainee).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "priority");
      expect(chars(s, trainee).keywords).not.toContain("firstStrike");
      let t = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Ratcatcher Trainee // Pest Problem"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ratcatcher Trainee // Pest Problem"), face: 1 }));
      expect(idsOf(t, "p1", "battlefield", "Rat")).toHaveLength(2);
      expect(exiled(t, "Ratcatcher Trainee // Pest Problem")).toHaveLength(1);
    });

    it("Beat a Path: up to two targeted creatures can't block this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Bellowing Bruiser // Beat a Path"] },
        p2: { battlefield: ["Serra Angel", "Grand Ball Guest"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const guest = idOf(s, "p2", "battlefield", "Grand Ball Guest");
      const card = idOf(s, "p1", "hand", "Bellowing Bruiser // Beat a Path");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [angel, guest] } }));
      expect(chars(s, angel).keywords).toContain("cantBlock");
      expect(chars(s, guest).keywords).toContain("cantBlock");
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = drive(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: angel, attacker: idOf(s, "p1", "battlefield", "Bear Cub") }],
        }),
      ).toThrow();
    });

    it("Grabby Giant: {2}{R}, sacrifice an artifact or a land: draw; That's Mine: a Treasure", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Grabby Giant // That's Mine"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grabby Giant // That's Mine"), face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Grabby Giant // That's Mine", "Candy Trail", ...lands("Mountain", 3)], library: ["Island"] },
      });
      const giant = idOf(t, "p1", "battlefield", "Grabby Giant // That's Mine");
      t = settle(activate(t, "p1", giant, { sacrifice: [idOf(t, "p1", "battlefield", "Candy Trail")] }));
      expect(t.players.p1?.hand.map((id) => nameOf(t, id))).toEqual(["Island"]);
      expect(idsOf(t, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Korvold and the Noble Thief: I and II, a Treasure; III, the top three cards of an opponent exiled, playable this turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Korvold and the Noble Thief"] },
        p2: { library: ["Plains", "Plains", "Bear Cub", "Forest", "Opt", "Island"] },
      });
      s = settle(cast(s, "p1", "Korvold and the Noble Thief"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      // The lore counter arrives at the beginning of the main phase: the chapter is resolved.
      s = drive(
        advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1"),
        stable,
      );
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
      s = drive(
        advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1"),
        stable,
      );
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const forest = exiled(s, "Forest")[0] as string;
      const bear = exiled(s, "Bear Cub")[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Korvold and the Noble Thief")).toHaveLength(0);
    });

    it("Rotisserie Elemental: combat damage to a player, a skewer counter; sacrificed, exile X cards playable this turn", () => {
      let s = scenario({ p1: { battlefield: ["Rotisserie Elemental"], library: ["Bear Cub", "Forest", "Island"] } });
      const el = idOf(s, "p1", "battlefield", "Rotisserie Elemental");
      const keep: Answer = (req) => (req.intent === "sacrifice" && req.type === "pick" ? [] : undefined);
      const sacrifice: Answer = (req) => (req.intent === "sacrifice" && req.type === "pick" ? [el] : undefined);
      s = attack(s, [el]);
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority", keep);
      expect(s.players.p2?.life).toBe(19);
      expect(s.objects[el]?.counters.skewer).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Rotisserie Elemental")).toHaveLength(1);
      // Second attack: two counters, it is sacrificed.
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = attack(s, [el]);
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority", sacrifice);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Rotisserie Elemental")).toHaveLength(1);
      // Two skewer counters: the top two cards are exiled.
      expect(s.exile).toHaveLength(2);
      const playable = s.exile.filter((id) =>
        legalActions(s, "p1").some((a) => (a.type === "playLand" || a.type === "cast") && a.card === id),
      );
      expect(playable.length).toBeGreaterThan(0);
    });

    it("Virtue of Courage: a source you control deals noncombat damage to an opponent: exile that many cards, playable this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Virtue of Courage // Embereth Blaze", ...lands("Mountain", 2)],
          hand: ["Virtue of Courage // Embereth Blaze"],
          library: ["Bear Cub", "Forest", "Island"],
        },
      });
      const card = idOf(s, "p1", "hand", "Virtue of Courage // Embereth Blaze");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      // Two damage: two cards exiled.
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const forest = exiled(s, "Forest")[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    });

    it("Virtue of Courage: combat damage does not trigger it", () => {
      let s = scenario({
        p1: { battlefield: ["Virtue of Courage // Embereth Blaze", "Bear Cub"], library: ["Forest", "Island"] },
      });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      s = drive(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
      expect(s.players.p2?.life).toBe(18);
      expect(s.exile).toHaveLength(0);
    });

    it("Decadent Dragon: a Treasure when attacking; Expensive Taste: two cards from an opponent exiled, playable as long as they stay exiled", () => {
      let s = scenario({ p1: { battlefield: ["Decadent Dragon // Expensive Taste"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Decadent Dragon // Expensive Taste")]));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)], hand: ["Decadent Dragon // Expensive Taste"] },
        p2: { library: ["Bear Cub", "Forest", "Island"] },
      });
      const card = idOf(t, "p1", "hand", "Decadent Dragon // Expensive Taste");
      t = settle(act(t, "p1", { type: "cast", card, face: 1, targets: { t: ["p2"] } }));
      const bear = exiled(t, "Bear Cub")[0] as string;
      expect(bear).toBeTruthy();
      t = advanceUntil(t, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      t = settle(act(t, "p1", { type: "cast", card: bear }));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Imodane's Recruiter: on entering, your creatures get +1/+0 and haste; Train Troops: two 2/2 Knights with vigilance", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Imodane's Recruiter // Train Troops"] },
      });
      s = settle(cast(s, "p1", "Imodane's Recruiter // Train Troops"));
      const rec = idOf(s, "p1", "battlefield", "Imodane's Recruiter // Train Troops");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, rec)).toEqual([3, 2]);
      expect(chars(s, rec).keywords).toContain("haste");
      let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Imodane's Recruiter // Train Troops"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Imodane's Recruiter // Train Troops"), face: 1 }));
      const knights = idsOf(t, "p1", "battlefield", "Knight");
      expect(knights).toHaveLength(2);
      expect(chars(t, knights[0] as string).keywords).toContain("vigilance");
    });

    it("Picnic Ruiner: double strike when attacking if you control a creature with power 4 or greater; Stolen Goodies: three counters divided", () => {
      let s = scenario({ p1: { battlefield: ["Picnic Ruiner // Stolen Goodies", "Bellowing Bruiser // Beat a Path"] } });
      const ruiner = idOf(s, "p1", "battlefield", "Picnic Ruiner // Stolen Goodies");
      s = settle(attack(s, [ruiner]));
      expect(chars(s, ruiner).keywords).toContain("doubleStrike");
      let t = scenario({ p1: { battlefield: ["Picnic Ruiner // Stolen Goodies", "Bear Cub"] } });
      const r2 = idOf(t, "p1", "battlefield", "Picnic Ruiner // Stolen Goodies");
      t = settle(attack(t, [r2]));
      expect(chars(t, r2).keywords).not.toContain("doubleStrike");
      let u = scenario({
        p1: { battlefield: ["Bear Cub", "Grand Ball Guest", ...lands("Forest", 4)], hand: ["Picnic Ruiner // Stolen Goodies"] },
      });
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      const guest = idOf(u, "p1", "battlefield", "Grand Ball Guest");
      const card = idOf(u, "p1", "hand", "Picnic Ruiner // Stolen Goodies");
      u = settle(act(u, "p1", { type: "cast", card, face: 1, targets: { t: [bear, guest] } }));
      expect((u.objects[bear]?.counters["+1/+1"] ?? 0) + (u.objects[guest]?.counters["+1/+1"] ?? 0)).toBe(3);
      expect(u.objects[bear]?.counters["+1/+1"]).toBeGreaterThan(0);
      expect(u.objects[guest]?.counters["+1/+1"]).toBeGreaterThan(0);
    });

    it("Twice the Rage: double strike; Ride the Rails: +2/+1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 4)],
          hand: ["Two-Headed Hunter // Twice the Rage", "Minecart Daredevil // Ride the Rails"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Two-Headed Hunter // Twice the Rage"),
          face: 1,
          targets: { t: [bear] },
        }),
      );
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Minecart Daredevil // Ride the Rails"),
          face: 1,
          targets: { t: [bear] },
        }),
      );
      expect(pt(s, bear)).toEqual([4, 3]);
    });
  });
});

describe("Wilds of Eldraine, lot A — vert", () => {
  /**
   * Wilds of Eldraine, lot A - green cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7) playing through decisions.
   */
  type S = GameState;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  /** State-based actions, then resolution of the stack and triggers. */
  const settleAll = (s: S, answer?: Answer) => {
    while (stateBasedActions(s)) {}
    return settle(s, answer);
  };
  /** "pick" choice: the options bearing these names (in order), otherwise the suggestion; "yes" to questions. */
  const pickNames =
    (s: () => S, ...names: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const out: string[] = [];
      for (const n of names) {
        const id = req.options.find((o) => nameOf(s(), o) === n && !out.includes(o));
        if (id && out.length < req.max) out.push(id);
      }
      return out.length > 0 ? out : undefined;
    };
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attack = (s: S, ids: string[]) =>
    act(
      advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
      "p1",
      {
        type: "declareAttackers",
        attackers: ids.map((id) => ({ id, defender: "p2" })),
      },
    );

  it("Agatha's Champion: bargained, it fights an opposing creature; otherwise, no fight", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 5), "Candy Trail"], hand: ["Agatha's Champion"] },
        p2: { battlefield: ["Bear Cub"] },
      });
    let s = setup();
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    s = settle(cast(s, "p1", "Agatha's Champion", undefined, { kicked: true, sacrifice: [candy] }));
    const champion = idOf(s, "p1", "battlefield", "Agatha's Champion");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[champion]?.damage).toBe(2);
    expect(chars(s, champion).keywords).toContain("trample");
    let t = setup();
    t = settle(cast(t, "p1", "Agatha's Champion"));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Candy Trail")).toHaveLength(1);
  });

  it("Plant Beans: an additional land this turn; Beanstalk Wurm is then cast from exile", () => {
    const CARD = "Beanstalk Wurm // Plant Beans";
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: [CARD, "Forest", "Island"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    const adv = exiled(s, CARD)[0] as string;
    expect(castOptions(s, "p1", adv)).toHaveLength(1);
  });

  it("Bestial Bloodline: the enchanted creature gets +2/+2; {4}{G} returns it from the graveyard to hand", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Bestial Bloodline"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [bear] }));
    expect(pt(s, bear)).toEqual([4, 4]);
    let t = scenario({ p1: { battlefield: lands("Forest", 5), graveyard: ["Bestial Bloodline"] } });
    t = settle(activate(t, "p1", idOf(t, "p1", "graveyard", "Bestial Bloodline")));
    expect(handNames(t)).toEqual(["Bestial Bloodline"]);
  });

  describe("Blossoming Tortoise", () => {
    it("on entering: mill three cards, then a land card from your graveyard returns tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Blossoming Tortoise"], library: ["Opt", "Island", "Bear Cub", "Plains"] },
      });
      s = settle(cast(s, "p1", "Blossoming Tortoise"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("the activated abilities of your lands cost {1} less; your land creatures get +1/+1", () => {
      const setup = (tortoise: boolean) =>
        scenario({ p1: { battlefield: [...(tortoise ? ["Blossoming Tortoise"] : []), "Restless Cottage", "Swamp", "Forest"] } });
      const without = setup(false);
      const cottage0 = idOf(without, "p1", "battlefield", "Restless Cottage");
      expect(legalActions(without, "p1").some((a) => a.type === "activate" && a.source === cottage0)).toBe(false);
      let s = setup(true);
      const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
      s = settle(activate(s, "p1", cottage));
      expect(pt(s, cottage)).toEqual([5, 5]);
      // A land that is not a creature is not affected; neither is the Turtle.
      expect(pt(s, idOf(s, "p1", "battlefield", "Blossoming Tortoise"))).toEqual([3, 3]);
    });
  });

  it("Brave the Wilds: bargained, the targeted land becomes a 3/3 Elemental creature with haste; a basic land in hand", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Candy Trail"], hand: ["Brave the Wilds"], library: ["Opt", "Plains"] },
    });
    const [, land] = idsOf(s, "p1", "battlefield", "Forest") as [string, string];
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    // The target exists only when bargained (PLAN-M M8a): the bargained mode requires the bargain, the other excludes
    // it.
    const offer = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Brave the Wilds"));
    const modes = offer?.type === "cast" ? offer.modes : [];
    expect(modes.map((m) => [m.targets.length, !!m.requiresKicker, !!m.forbidsKicker])).toEqual([
      [0, false, true],
      [1, true, false],
    ]);
    expect(() => cast(s, "p1", "Brave the Wilds", { t: [land] }, { mode: 1 })).toThrow(RulesError);
    s = settle(
      cast(s, "p1", "Brave the Wilds", { t: [land] }, { mode: 1, kicked: true, sacrifice: [candy] }),
      pickNames(() => s, "Plains"),
    );
    const c = chars(s, land);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toContain("haste");
    expect(handNames(s)).toEqual(["Plains"]);
    // Without bargain: only the search.
    let t = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Brave the Wilds"], library: ["Opt", "Plains"] } });
    const other = idsOf(t, "p1", "battlefield", "Forest")[1] as string;
    t = settle(
      cast(t, "p1", "Brave the Wilds"),
      pickNames(() => t, "Plains"),
    );
    expect(chars(t, other).types).not.toContain("Creature");
    expect(handNames(t)).toEqual(["Plains"]);
  });

  it("Commune with Nature: a creature card among the top five to hand, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forest"],
        hand: ["Commune with Nature"],
        library: ["Opt", "Bear Cub", "Forest", "Serra Angel", "Island", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "Commune with Nature"), (req) => {
      if (req.type !== "pick") return undefined;
      expect(req.options.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      return req.options.filter((id) => nameOf(s, id) === "Serra Angel");
    });
    expect(handNames(s)).toEqual(["Serra Angel"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Plains");
    expect(s.players.p1?.library).toHaveLength(5);
  });

  it("Curse of the Werefox: a Monster Role on your creature, then it fights an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Curse of the Werefox"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Curse of the Werefox", { t: [mine] }));
    expect(pt(s, mine)).toEqual([3, 3]);
    expect(chars(s, mine).keywords).toContain("trample");
    expect(idsOf(s, "p1", "battlefield", "Monster Role")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[mine]?.damage).toBe(2);
  });

  it("Elvish Archivist: one or more artifacts - two counters, once per turn; an enchantment - a card", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Elvish Archivist"],
        hand: ["Candy Trail", "Candy Trail", "Bestial Bloodline"],
      },
    });
    const elf = idOf(s, "p1", "battlefield", "Elvish Archivist");
    s = settle(cast(s, "p1", "Candy Trail"));
    s = settle(cast(s, "p1", "Candy Trail"));
    expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [elf] }));
    expect(s.players.p1?.hand).toHaveLength(hand);
  });

  it("Feral Encounter: a creature exiled from the top five, castable this turn; at the beginning of combat, your creature damages an opposing creature", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Shivan Dragon"],
        hand: ["Feral Encounter"],
        library: ["Opt", "Bear Cub", "Forest", "Island", "Plains", "Swamp"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = settle(
      cast(s, "p1", "Feral Encounter"),
      pickNames(() => s, "Bear Cub"),
    );
    const cub = exiled(s, "Bear Cub")[0] as string;
    expect(cub).toBeDefined();
    expect(
      s.players.p1?.library
        .slice(-4)
        .map((id) => nameOf(s, id))
        .sort(),
    ).toEqual(["Forest", "Island", "Opt", "Plains"]);
    expect(castOptions(s, "p1", cub)).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: cub }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(dragon)) return [dragon];
      return req.options.includes(angel) ? [angel] : undefined;
    });
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Only once: the ability does not come back at another turn's combat.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "beginCombat");
    expect(s.stack).toHaveLength(0);
  });

  it("Guard Change: a Monster Role (+1/+1 and trample) on your creature; Ferocious Werefox is then cast", () => {
    const CARD = "Ferocious Werefox // Guard Change";
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: [CARD] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1, targets: { t: [bear] } }));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).keywords).toContain("trample");
    s = settle(act(s, "p1", { type: "cast", card: exiled(s, CARD)[0] as string }));
    expect(chars(s, idOf(s, "p1", "battlefield", CARD)).keywords).toContain("trample");
  });

  it("Gruff Triplets: two token copies (that create none); when one dies, the others get as many counters as its power", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Gruff Triplets"] } });
    s = settle(cast(s, "p1", "Gruff Triplets"));
    const triplets = idsOf(s, "p1", "battlefield", "Gruff Triplets");
    expect(triplets).toHaveLength(3);
    expect(triplets.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
    const [card, ...tokens] = [...triplets].sort((a, b) => Number(!!s.objects[a]?.isToken) - Number(!!s.objects[b]?.isToken));
    destroy(s, card as string);
    s = settleAll(s);
    for (const t of tokens) expect(pt(s, t)).toEqual([6, 6]);
  });

  it("Hollow Scavenger: {1}, sacrifice a Food: +2/+2, once per turn; Bakery Raid creates a Food", () => {
    let s = scenario({
      p1: { battlefield: ["Hollow Scavenger // Bakery Raid", "Candy Trail", "Candy Trail", ...lands("Forest", 2)] },
    });
    const wolf = idOf(s, "p1", "battlefield", "Hollow Scavenger // Bakery Raid");
    const [food] = idsOf(s, "p1", "battlefield", "Candy Trail") as [string];
    s = settle(activate(s, "p1", wolf, undefined, { sacrifice: [food] }));
    expect(pt(s, wolf)).toEqual([5, 4]);
    expect(idsOf(s, "p1", "battlefield", "Candy Trail")).toHaveLength(1);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === wolf)).toBe(false);
    let t = scenario({ p1: { battlefield: ["Forest"], hand: ["Hollow Scavenger // Bakery Raid"] } });
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Howling Galefang: haste as long as you own a card with an Adventure in exile", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Howling Galefang", sick: true }, "Forest"], hand: ["Hollow Scavenger // Bakery Raid"] },
    });
    const galefang = idOf(s, "p1", "battlefield", "Howling Galefang");
    expect(chars(s, galefang).keywords).not.toContain("haste");
    expect(chars(s, galefang).keywords).toContain("vigilance");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(chars(s, galefang).keywords).toContain("haste");
  });

  it("The Huntsman's Redemption: I - a 3/3 Beast; II - sacrifice a creature to search for a creature or a basic land", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["The Huntsman's Redemption"],
        library: ["Forest", "Island", "Bear Cub", "Opt", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "The Huntsman's Redemption"));
    const beast = idOf(s, "p1", "battlefield", "Beast");
    expect([pt(s, beast), chars(s, beast).colors]).toEqual([[3, 3], ["G"]]);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(
      s,
      pickNames(() => s, "Beast", "Bear Cub"),
    );
    expect(idsOf(s, "p1", "battlefield", "Beast")).toHaveLength(0);
    expect(handNames(s)).toContain("Bear Cub");
  });

  it("Leaping Ambush: +1/+3 and reach until end of turn, and the creature untaps", () => {
    let s = scenario({ p1: { battlefield: ["Forest", { name: "Bear Cub", tapped: true }], hand: ["Leaping Ambush"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Leaping Ambush", { t: [bear] }));
    expect(pt(s, bear)).toEqual([3, 5]);
    expect(chars(s, bear).keywords).toContain("reach");
    expect(s.objects[bear]?.tapped).toBe(false);
  });

  describe("Night of the Sweets' Revenge", () => {
    it('on entering, a Food; your Foods have "{T}: add {G}"', () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Night of the Sweets' Revenge"] } });
      s = settle(cast(s, "p1", "Night of the Sweets' Revenge"));
      const food = idOf(s, "p1", "battlefield", "Food");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === food && a.colors.includes("G"))).toBe(
        true,
      );
    });

    it("{5}{G}{G}, sacrifice it: your creatures get +X/+X, X being the number of your Foods", () => {
      let s = scenario({
        p1: { battlefield: ["Night of the Sweets' Revenge", "Candy Trail", "Candy Trail", "Bear Cub", ...lands("Forest", 7)] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Night of the Sweets' Revenge")));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(idsOf(s, "p1", "graveyard", "Night of the Sweets' Revenge")).toHaveLength(1);
    });
  });

  it("Redtooth Genealogist: a Royal Role (+1/+1 and ward {1}) attached to another of your creatures", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Redtooth Genealogist"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Redtooth Genealogist"));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    expect(pt(s, idOf(s, "p1", "battlefield", "Redtooth Genealogist"))).toEqual([2, 3]);
  });

  it("Redtooth Vanguard: an enchantment enters under your control - pay {2}: it returns from the graveyard to your hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Bestial Bloodline"], graveyard: ["Redtooth Vanguard"] },
    });
    s = settle(
      cast(s, "p1", "Bestial Bloodline", { enchant: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
      pickNames(() => s),
    );
    expect(handNames(s)).toEqual(["Redtooth Vanguard"]);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(4);
  });

  it("Return from the Wilds: two modes of your choice (a 1/1 white Human and a Food)", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Return from the Wilds"] } });
    const modes = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Return from the Wilds");
    expect(modes?.type === "cast" && modes.modes?.length).toBe(3);
    s = settle(cast(s, "p1", "Return from the Wilds", undefined, { mode: 2 }));
    const human = idOf(s, "p1", "battlefield", "Human");
    expect([pt(s, human), chars(s, human).colors]).toEqual([[1, 1], ["W"]]);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Rootrider Faun: {T} adds {G}; {1}, {T} adds one mana of any color", () => {
    let s = scenario({ p1: { battlefield: ["Rootrider Faun", "Forest"] } });
    const faun = idOf(s, "p1", "battlefield", "Rootrider Faun");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === faun && a.colors.includes("G"))).toBe(true);
    s = activate(s, "p1", faun);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["B"] });
    expect(s.players.p1?.manaPool.B).toBe(1);
    expect(s.objects[faun]?.tapped).toBe(true);
  });

  it("Royal Treatment: hexproof until end of turn and a Royal Role", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Royal Treatment"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Royal Treatment", { t: [bear] }));
    expect(chars(s, bear).keywords).toContain("hexproof");
    expect(pt(s, bear)).toEqual([3, 3]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    expect(pt(s, bear)).toEqual([3, 3]);
  });

  it("Skybeast Tracker, Up the Beanstalk, Tempest Hart: a spell with MV 5 or more gives a Food, a card and a counter", () => {
    let s = scenario({
      p1: {
        battlefield: ["Skybeast Tracker", "Tempest Hart // Scan the Clouds", "Up the Beanstalk", ...lands("Mountain", 8)],
        hand: ["Lightning Strike", "Shivan Dragon"],
      },
    });
    const hart = idOf(s, "p1", "battlefield", "Tempest Hart // Scan the Clouds");
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.objects[hart]?.counters["+1/+1"]).toBe(1);
  });

  it("Up the Beanstalk: on entering, draw a card", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Up the Beanstalk"] } });
    s = settle(cast(s, "p1", "Up the Beanstalk"));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Spider Food: destroys an artifact, an enchantment or a creature with flying, and creates a Food", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Spider Food"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Spider Food", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    s = settle(cast(s, "p1", "Spider Food", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Stormkeld Vanguard: can't be blocked by a creature with power 2 or less; Bear Down destroys an artifact", () => {
    const CARD = "Stormkeld Vanguard // Bear Down";
    let s = scenario({ p1: { battlefield: [CARD] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
    const giant = idOf(s, "p1", "battlefield", CARD);
    s = attack(s, [giant]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: giant }] })).toThrow();
    act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: giant }],
    });
    let t = scenario({ p1: { battlefield: lands("Forest", 2), hand: [CARD] }, p2: { battlefield: ["Candy Trail"] } });
    const candy = idOf(t, "p2", "battlefield", "Candy Trail");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", CARD), face: 1, targets: { t: [candy] } }));
    expect(idsOf(t, "p2", "graveyard", "Candy Trail")).toHaveLength(1);
  });

  it("Tanglespan Lookout: an Aura enters under your control - draw a card", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Tanglespan Lookout"], hand: ["Bestial Bloodline"] } });
    s = settle(cast(s, "p1", "Bestial Bloodline", { enchant: [idOf(s, "p1", "battlefield", "Tanglespan Lookout")] }));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Territorial Witchstalker: with a creature with power 4 or greater, +1/+0 and it can attack despite defender", () => {
    const setup = (big: boolean) =>
      scenario({ p1: { battlefield: ["Territorial Witchstalker", ...(big ? ["Serra Angel"] : ["Bear Cub"])] } });
    let s = advanceUntil(setup(true), (x) => x.pending?.kind === "declareAttackers");
    const wolf = idOf(s, "p1", "battlefield", "Territorial Witchstalker");
    expect(pt(s, wolf)).toEqual([3, 3]);
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wolf, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p2?.life).toBe(17);
    const t = advanceUntil(setup(false), (x) => x.pending?.kind === "declareAttackers");
    const wolf2 = idOf(t, "p1", "battlefield", "Territorial Witchstalker");
    expect(pt(t, wolf2)).toEqual([2, 3]);
    expect(() => act(t, "p1", { type: "declareAttackers", attackers: [{ id: wolf2, defender: "p2" }] })).toThrow();
  });

  it("Thunderous Debut: among the top twenty cards, up to two creatures - onto the battlefield if bargained, otherwise to hand", () => {
    const library = [
      ...lands("Island", 5),
      "Bear Cub",
      ...lands("Island", 10),
      "Serra Angel",
      ...lands("Island", 3),
      "Shivan Dragon",
    ];
    const setup = () =>
      scenario({ p1: { battlefield: [...lands("Forest", 8), "Candy Trail"], hand: ["Thunderous Debut"], library } });
    const answer =
      (s: () => S): Answer =>
      (req) => {
        if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
        expect(req.options.map((id) => nameOf(s(), id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
        return req.options;
      };
    let s = setup();
    const candy = idOf(s, "p1", "battlefield", "Candy Trail");
    s = settle(
      cast(s, "p1", "Thunderous Debut", undefined, { kicked: true, sacrifice: [candy] }),
      answer(() => s),
    );
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(19);
    let t = setup();
    t = settle(
      cast(t, "p1", "Thunderous Debut"),
      answer(() => t),
    );
    expect(handNames(t).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  it("Tough Cookie: a Food on entering; {2}{G}: a noncreature artifact becomes a 4/4 artifact creature", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Tough Cookie"] } });
    s = settle(cast(s, "p1", "Tough Cookie"));
    const food = idOf(s, "p1", "battlefield", "Food");
    const cookie = idOf(s, "p1", "battlefield", "Tough Cookie");
    expect(() => activate(s, "p1", cookie, { t: [cookie] })).toThrow();
    s = settle(activate(s, "p1", cookie, { t: [food] }));
    const c = chars(s, food);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Food");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, food).types).not.toContain("Creature");
  });

  it("Troublemaker Ouphe: bargained, exiles an artifact or enchantment an opponent controls", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Forest", 2), "Candy Trail"], hand: ["Troublemaker Ouphe"] },
        p2: { battlefield: ["Candy Trail"] },
      });
    let s = setup();
    s = settle(
      cast(s, "p1", "Troublemaker Ouphe", undefined, { kicked: true, sacrifice: [idOf(s, "p1", "battlefield", "Candy Trail")] }),
    );
    expect(exiled(s, "Candy Trail")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Candy Trail")).toHaveLength(0);
    let t = setup();
    t = settle(cast(t, "p1", "Troublemaker Ouphe"));
    expect(idsOf(t, "p2", "battlefield", "Candy Trail")).toHaveLength(1);
  });

  it("Verdant Outrider: {1}{G} - can't be blocked by a creature with power 2 or less this turn", () => {
    let s = scenario({ p1: { battlefield: ["Verdant Outrider", ...lands("Forest", 2)] }, p2: { battlefield: ["Bear Cub"] } });
    const knight = idOf(s, "p1", "battlefield", "Verdant Outrider");
    s = settle(activate(s, "p1", knight));
    s = attack(s, [knight]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: knight }] })).toThrow();
  });

  it("Virtue of Strength: a basic land tapped for mana produces three times as much; Garenbrig Growth returns a creature card", () => {
    let s = scenario({ p1: { battlefield: ["Virtue of Strength // Garenbrig Growth", "Forest", "Restless Cottage"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === forest);
    s = act(s, "p1", { type: "tapForMana", source: forest, ability: a?.type === "tapForMana" ? a.ability : 0, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(3);
    const cottage = idOf(s, "p1", "battlefield", "Restless Cottage");
    const b = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === cottage);
    s = act(s, "p1", { type: "tapForMana", source: cottage, ability: b?.type === "tapForMana" ? b.ability : 0, color: "B" });
    expect(s.players.p1?.manaPool.B).toBe(1);
    let t = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Virtue of Strength // Garenbrig Growth"], graveyard: ["Bear Cub", "Opt"] },
    });
    const card = idOf(t, "p1", "hand", "Virtue of Strength // Garenbrig Growth");
    const opt = idOf(t, "p1", "graveyard", "Opt");
    expect(() => act(t, "p1", { type: "cast", card, face: 1, targets: { t: [opt] } })).toThrow();
    t = settle(act(t, "p1", { type: "cast", card, face: 1, targets: { t: [idOf(t, "p1", "graveyard", "Bear Cub")] } }));
    expect(handNames(t)).toEqual(["Bear Cub"]);
    expect(exiled(t, "Virtue of Strength // Garenbrig Growth")).toHaveLength(1);
  });

  it("Welcome to Sweettooth: I - a Human; II - a Food; III - 1 + (your Foods) +1/+1 counters", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Welcome to Sweettooth"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Welcome to Sweettooth"));
    expect(idsOf(s, "p1", "battlefield", "Human")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(idsOf(s, "p1", "graveyard", "Welcome to Sweettooth")).toHaveLength(1);
  });

  describe("Questing Druid // Seek the Beast", () => {
    const CARD = "Questing Druid // Seek the Beast";

    it("a white, blue, black or red spell you cast: a +1/+1 counter; a green spell, nothing", () => {
      let s = scenario({
        p1: { battlefield: [CARD, ...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Lightning Strike", "Titanic Growth"] },
      });
      const druid = idOf(s, "p1", "battlefield", CARD);
      s = settle(cast(s, "p1", "Titanic Growth", { t: [druid] }));
      expect(s.objects[druid]?.counters["+1/+1"]).toBeUndefined();
      expect(pt(s, druid)).toEqual([5, 5]);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.objects[druid]?.counters["+1/+1"]).toBe(1);
    });

    it("Seek the Beast: exiles the top two cards, playable until your next end step", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: [CARD], library: ["Forest", "Bear Cub", "Island"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
      const forest = exiled(s, "Forest")[0] as string;
      const cub = exiled(s, "Bear Cub")[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(castOptions(s, "p1", cub)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(s.exile).toContain(cub);
      expect(castOptions(s, "p1", cub)).toHaveLength(0);
    });

    it("Seek the Beast cast during your turn: no longer playable from your end step (lot K7)", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: [CARD], library: ["Shock", "Opt", "Island"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
      const shock = exiled(s, "Shock")[0] as string;
      expect(castOptions(s, "p1", shock)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(s.turn.number).toBe(3);
      expect(castOptions(s, "p1", shock)).toHaveLength(0);
    });
  });

  it("Scan the Clouds: draw two cards, then discard two", () => {
    const CARD = "Tempest Hart // Scan the Clouds";
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: [CARD, "Opt"], library: ["Bear Cub", "Forest", "Plains"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Intrepid Trufflesnout: when attacking alone, a Food; with another creature, nothing", () => {
    const CARD = "Intrepid Trufflesnout // Go Hog Wild";
    let s = scenario({ p1: { battlefield: [CARD, "Bear Cub"] } });
    const boar = idOf(s, "p1", "battlefield", CARD);
    s = settle(attack(s, [boar]));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: [CARD, "Bear Cub"] } });
    t = settle(attack(t, [idOf(t, "p1", "battlefield", CARD), idOf(t, "p1", "battlefield", "Bear Cub")]));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(0);
  });

  it("Provisions Merchant: when attacking, sacrifice a Food - attacking creatures get +1/+1 and trample", () => {
    let s = scenario({ p1: { battlefield: ["Provisions Merchant", "Bear Cub", "Candy Trail"] } });
    const merchant = idOf(s, "p1", "battlefield", "Provisions Merchant");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(
      attack(s, [merchant, bear]),
      pickNames(() => s, "Candy Trail"),
    );
    expect(idsOf(s, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(chars(s, bear).keywords).toContain("trample");
    expect(pt(s, merchant)).toEqual([4, 4]);
  });

  it("Wildwood Mentor: a token enters - a +1/+1 counter; when attacking, another attacker gets +X/+X (its power)", () => {
    let s = scenario({
      p1: { battlefield: ["Wildwood Mentor", "Bear Cub", "Forest"], hand: ["Hollow Scavenger // Bakery Raid"] },
    });
    const mentor = idOf(s, "p1", "battlefield", "Wildwood Mentor");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hollow Scavenger // Bakery Raid"), face: 1 }));
    expect(pt(s, mentor)).toEqual([2, 2]);
    s = settle(attack(s, [mentor, bear]));
    expect(pt(s, bear)).toEqual([4, 4]);
  });
});

describe("Wilds of Eldraine, lot A — multicolores, incolores et terrains", () => {
  /**
   * Wilds of Eldraine, lot A: multicolor, colorless cards and lands, checked against their Oracle text (R7).
   */
  type S = GameState;
  /** Activation options of the source (one per activatable ability). */
  const activations = (s: S, player: string, source: string) =>
    legalActions(s, player).flatMap((a) => (a.type === "activate" && a.source === source ? [a] : []));
  /** Activates the source's ability whose label contains `label` (the first otherwise). */
  const activate = (
    s: S,
    player: string,
    source: string,
    opts: { label?: string; targets?: Record<string, string[]>; extra?: object } = {},
  ) => {
    const a = activations(s, player, source).find((x) => !opts.label || x.label?.includes(opts.label));
    if (!a) throw new Error(`no activatable ability "${opts.label ?? ""}"`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets: opts.targets, ...opts.extra });
  };
  /** Goes to p1's declare attackers, declares those attackers (against p2) and resolves the triggers. */
  const attack = (s: S, ids: string[], answer?: Answer) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const FAERIE: CardDef = customCard({ name: "Test Faerie", subtypes: ["Faerie"], power: 1, toughness: 1 });
  const LEGEND: CardDef = customCard({ name: "Test Legend", supertypes: ["Legendary"], power: 2, toughness: 2 });
  const ENCHANTMENT: CardDef = customCard({ name: "Test Enchantment", types: ["Enchantment"], typeLine: "Enchantment" });
  const WALKER: CardDef = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 3 });
  const HASTY: CardDef = customCard({ name: "Test Hasty", keywords: ["haste"], power: 1, toughness: 1 });

  describe("Multicolores", () => {
    it("Ash, Party Crasher: when attacking, a +1/+1 counter only with Celebration", () => {
      let s = scenario({
        p1: { battlefield: ["Ash, Party Crasher", ...lands("Mountain", 2)], hand: ["Gingerbrute", "Gingerbrute"] },
      });
      const ash = idOf(s, "p1", "battlefield", "Ash, Party Crasher");
      expect(counters(attack(s, [ash]), ash)).toBe(0);
      s = settle(cast(s, "p1", "Gingerbrute"));
      s = settle(cast(s, "p1", "Gingerbrute"));
      expect(counters(attack(s, [ash]), ash)).toBe(1);
    });

    it("The Goose Mother: X +1/+1 counters and half of X Foods rounded up", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 3), ...lands("Island", 2)], hand: ["The Goose Mother"] } });
      s = settle(cast(s, "p1", "The Goose Mother", undefined, { x: 3 }));
      const goose = idOf(s, "p1", "battlefield", "The Goose Mother");
      expect(counters(s, goose)).toBe(3);
      expect(pt(s, goose)).toEqual([5, 5]);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(2);
    });

    it("The Goose Mother: when attacking, you may sacrifice a Food to draw a card", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({ p1: { battlefield: ["The Goose Mother", "Candy Trail"] } });
        const candy = idOf(s, "p1", "battlefield", "Candy Trail");
        const hand = s.players.p1?.hand.length ?? 0;
        s = attack(s, [idOf(s, "p1", "battlefield", "The Goose Mother")], (req) =>
          req.type === "pick" && req.options.includes(candy) ? (sacrifice ? [candy] : []) : undefined,
        );
        return { drawn: (s.players.p1?.hand.length ?? 0) - hand, sacrificed: idsOf(s, "p1", "graveyard", "Candy Trail").length };
      };
      expect(run(true)).toEqual({ drawn: 1, sacrificed: 1 });
      expect(run(false)).toEqual({ drawn: 0, sacrificed: 0 });
    });

    it("Greta: a Food on entering; {G} + Food: +1/+1 counter; {1}{B} + Food: draw and lose 1 life", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), ...lands("Swamp", 3), "Bear Cub"],
          hand: ["Greta, Sweettooth Scourge"],
          library: lands("Island", 5),
        },
      });
      s = settle(cast(s, "p1", "Greta, Sweettooth Scourge"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      const greta = idOf(s, "p1", "battlefield", "Greta, Sweettooth Scourge");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", greta, { label: "counter", targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      // No more Food: the ability can no longer be activated.
      expect(activations(s, "p1", greta)).toHaveLength(0);
      const t = scenario({ p1: { battlefield: ["Greta, Sweettooth Scourge", "Candy Trail", ...lands("Swamp", 2)] } });
      const hand = t.players.p1?.hand.length ?? 0;
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Greta, Sweettooth Scourge"), { label: "Draw" }));
      expect(u.players.p1?.hand).toHaveLength(hand + 1);
      expect(u.players.p1?.life).toBe(19);
      expect(idsOf(u, "p1", "graveyard", "Candy Trail")).toHaveLength(1);
    });

    it("Neva: on entering, a creature or enchantment card returns to hand; an enchantment put into the graveyard: counter and scry 1", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), ENCHANTMENT],
          hand: ["Neva, Stalked by Nightmares"],
          graveyard: ["Bear Cub", "Opt"],
        },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const bearCard = idOf(s, "p1", "graveyard", "Bear Cub");
      let offered: string[] = [];
      s = settle(cast(s, "p1", "Neva, Stalked by Nightmares"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bearCard)) return undefined;
        offered = req.options.map(String);
        return [bearCard];
      });
      // An instant is not a legal target.
      expect(offered).not.toContain(opt);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      const neva = idOf(s, "p1", "battlefield", "Neva, Stalked by Nightmares");
      expect(chars(s, neva).keywords).toContain("menace");
      let scried = false;
      destroy(s, idOf(s, "p1", "battlefield", "Test Enchantment"));
      s = settle(act(s, "p1", { type: "pass" }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(counters(s, neva)).toBe(1);
      expect(scried).toBe(true);
    });

    it("Obyra: another Faerie that enters under your control makes each opponent lose 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Forest", "Forest"], hand: ["Obyra, Dreaming Duelist", FAERIE, "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Obyra, Dreaming Duelist"));
      expect(s.players.p2?.life).toBe(20);
      s = settle(cast(s, "p1", "Test Faerie"));
      expect(s.players.p2?.life).toBe(19);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p2?.life).toBe(19);
    });

    it("Totentanz: itself or another nontoken creature that dies creates a Rat; a token that dies, no", () => {
      let s = scenario({ p1: { battlefield: ["Totentanz, Swarm Piper", "Bear Cub"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(act(s, "p1", { type: "pass" }));
      const rats = idsOf(s, "p1", "battlefield", "Rat");
      expect(rats).toHaveLength(1);
      destroy(s, rats[0] as string);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(0);
      destroy(s, idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper"));
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
    });

    it("Totentanz: {1}{B}: an attacking Rat you control gains deathtouch", () => {
      let s = scenario({ p1: { battlefield: ["Totentanz, Swarm Piper", "Bear Cub", ...lands("Swamp", 2)] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(act(s, "p1", { type: "pass" }));
      const rat = idOf(s, "p1", "battlefield", "Rat");
      // Outside combat, no attacking Rat: the ability has no legal target.
      expect(activations(s, "p1", idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper"))).toHaveLength(0);
      (s.objects[rat] as { controlledSince: number }).controlledSince = 0;
      s.version += 1;
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: rat, defender: "p2" }] });
      const totentanz = idOf(s, "p1", "battlefield", "Totentanz, Swarm Piper");
      s = settle(activate(s, "p1", totentanz, { targets: { t: [rat] } }));
      expect(chars(s, rat).keywords).toContain("deathtouch");
    });

    it("Troyan: {G}{U} only for a spell with MV 5 or more; {U}, {T}: draw, then discard", () => {
      let s = scenario({ p1: { battlefield: ["Troyan, Gutsy Explorer"], hand: ["Bear Cub"] } });
      const troyan = idOf(s, "p1", "battlefield", "Troyan, Gutsy Explorer");
      // A mana ability (605.1a): resolved at once, no question for a single color.
      s = activate(s, "p1", troyan, { label: "Add" });
      const restricted = s.players.p1?.restrictedMana?.map((m) => m.type).sort();
      expect(restricted).toEqual(["G", "U"]);
      // Bear Cub ({1}{G}, MV 2) can't be paid with this mana.
      expect(() => cast(s, "p1", "Bear Cub")).toThrow();
      const t = scenario({ p1: { battlefield: ["Troyan, Gutsy Explorer", ...lands("Mountain", 4)], hand: ["Shivan Dragon"] } });
      let u = activate(t, "p1", idOf(t, "p1", "battlefield", "Troyan, Gutsy Explorer"), { label: "Add" });
      // Shivan Dragon ({4}{R}{R}): 4 Mountains + restricted {G}{U} = 6 mana.
      u = settle(cast(u, "p1", "Shivan Dragon"));
      expect(idsOf(u, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      const v = scenario({
        p1: { battlefield: ["Troyan, Gutsy Explorer", "Island"], hand: ["Opt"], library: lands("Forest", 3) },
      });
      const w = settle(activate(v, "p1", idOf(v, "p1", "battlefield", "Troyan, Gutsy Explorer"), { label: "Draw" }));
      expect(w.players.p1?.hand).toHaveLength(1);
      expect(w.players.p1?.graveyard).toHaveLength(1);
    });

    it("Will: {T}: your white and/or blue spells cost {X} less this turn, X being the life gained this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Will, Scion of Peace", "Gingerbrute", ...lands("Plains", 4), "Forest"],
          hand: ["Serra Angel", "Bear Cub"],
        },
      });
      const will = idOf(s, "p1", "battlefield", "Will, Scion of Peace");
      expect(chars(s, will).keywords).toContain("vigilance");
      // Gingerbrute: {2}, {T}, sacrifice: 3 life (paid with two Plains).
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gingerbrute"), { label: "3 life" }));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(false);
      s = settle(activate(s, "p1", will));
      // Serra Angel ({3}{W}{W}) costs only {W}{W}; Bear Cub (green) is not reduced: {1}{G} with the lone Forest.
      s = settle(cast(s, "p1", "Serra Angel"));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(() => cast(s, "p1", "Bear Cub")).toThrow();
    });
  });

  describe("Incolores", () => {
    it("Collector's Vault: {2}, {T}: draw, discard, then a Treasure", () => {
      let s = scenario({ p1: { battlefield: ["Collector's Vault", ...lands("Island", 2)], library: lands("Forest", 3) } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Collector's Vault")));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Eriette's Tempting Apple: control of a creature until end of turn, untapped, with haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Eriette's Tempting Apple"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Eriette's Tempting Apple"), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Eriette's Tempting Apple: {2}, {T}, sacrifice: 3 life, or a targeted opponent loses 3 life", () => {
      const t = scenario({ p1: { battlefield: ["Eriette's Tempting Apple", ...lands("Swamp", 2)] } });
      const apple = idOf(t, "p1", "battlefield", "Eriette's Tempting Apple");
      expect(chars(t, apple).subtypes).toContain("Food");
      const u = settle(activate(t, "p1", apple, { label: "gain" }));
      expect([u.players.p1?.life, u.players.p2?.life]).toEqual([23, 20]);
      const v = settle(activate(t, "p1", apple, { label: "loses 3", targets: { t: ["p2"] } }));
      expect([v.players.p1?.life, v.players.p2?.life]).toEqual([20, 17]);
      expect(idsOf(v, "p1", "graveyard", "Eriette's Tempting Apple")).toHaveLength(1);
    });

    it("Gingerbrute: {1}: can be blocked only by creatures with haste", () => {
      let s = scenario({ p1: { battlefield: ["Gingerbrute", "Mountain"] }, p2: { battlefield: ["Bear Cub", HASTY] } });
      const ginger = idOf(s, "p1", "battlefield", "Gingerbrute");
      expect(chars(s, ginger).keywords).toContain("haste");
      s = settle(activate(s, "p1", ginger, { label: "haste" }));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: ginger, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const hasty = idOf(s, "p2", "battlefield", "Test Hasty");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: ginger }] })).toThrow();
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: hasty, attacker: ginger }] });
      expect(s.combat?.attackers[0]?.blocked).toBe(true);
    });

    it("Hylda's Crown of Winter: {1}, {T}: tap a creature, {1} less during your turn; {3}, sacrifice: a card per tapped opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Hylda's Crown of Winter"] },
        p2: { battlefield: ["Bear Cub", { name: "Serra Angel", tapped: true }] },
      });
      const crown = idOf(s, "p1", "battlefield", "Hylda's Crown of Winter");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // During your turn, the ability costs only {T}.
      s = settle(activate(s, "p1", crown, { label: "Tap a creature", targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(true);
      const opp = scenario({ active: "p2", p1: { battlefield: ["Hylda's Crown of Winter"] }, p2: { battlefield: ["Bear Cub"] } });
      const passed = act(opp, "p2", { type: "pass" });
      expect(activations(passed, "p1", idOf(passed, "p1", "battlefield", "Hylda's Crown of Winter"))).toHaveLength(0);
      const t = scenario({
        p1: { battlefield: ["Hylda's Crown of Winter", ...lands("Island", 3)], library: lands("Forest", 4) },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, { name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Hylda's Crown of Winter"), { label: "Draw" }));
      expect(u.players.p1?.hand).toHaveLength(2);
    });

    it("The Irencrag: {T}: {C}; a legendary creature enters: it can become Everflame (Equip {3}, +3/+3) and loses its other abilities", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Irencrag", "Bear Cub", ...lands("Plains", 3)],
          hand: [LEGEND, { ...LEGEND, id: "test-legend-2", name: "Test Legend Two" }],
        },
      });
      const crag = idOf(s, "p1", "battlefield", "The Irencrag");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(true);
      // A nonlegendary creature triggers nothing; a legendary one does.
      s = settle(cast(s, "p1", "Test Legend"), (req) => (req.intent === "may" ? [1] : undefined));
      const c = chars(s, crag);
      expect(c.name).toBe("Everflame, Heroes' Legacy");
      expect(c.subtypes).toContain("Equipment");
      expect(c.supertypes).toContain("Legendary");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(false);
      // "Loses all other abilities" (PLAN-M M8a): only equip and the static are left, the mana ability and the
      // trigger are gone (a second legendary creature triggers nothing).
      expect(c.abilities.map((a) => a.kind).sort()).toEqual(["activated", "static"]);
      const before = s.players.p1?.hand.length;
      s = settle(cast(s, "p1", "Test Legend Two"), (req) => {
        throw new Error(`unexpected question ${req.intent}`);
      });
      expect(s.players.p1?.hand.length).toBe((before ?? 0) - 1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", crag, { label: "Equip", targets: { t: [bear] } }));
      expect(s.objects[crag]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([5, 5]);
    });

    it("The Irencrag: you may decline; it stays an artifact that produces {C}", () => {
      let s = scenario({ p1: { battlefield: ["The Irencrag", ...lands("Plains", 2)], hand: [LEGEND] } });
      const crag = idOf(s, "p1", "battlefield", "The Irencrag");
      s = settle(cast(s, "p1", "Test Legend"), (req) => (req.intent === "may" ? [0] : undefined));
      expect(chars(s, crag).name).toBe("The Irencrag");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === crag)).toBe(true);
    });

    it("Prophetic Prism: draw on entering; {1}, {T}: one mana of any color", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Prophetic Prism"], library: lands("Island", 3) } });
      s = settle(cast(s, "p1", "Prophetic Prism"));
      expect(s.players.p1?.hand).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prophetic Prism")), (req) =>
        req.intent === "manaColor" ? ["B"] : undefined,
      );
      expect(s.players.p1?.manaPool.B).toBe(1);
    });

    it("Scarecrow Guide: {1}: one mana of any color, once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Scarecrow Guide", ...lands("Forest", 2)] } });
      const guide = idOf(s, "p1", "battlefield", "Scarecrow Guide");
      expect(chars(s, guide).keywords).toContain("reach");
      s = settle(activate(s, "p1", guide), (req) => (req.intent === "manaColor" ? ["R"] : undefined));
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(activations(s, "p1", guide)).toHaveLength(0);
    });

    it("Syr Ginger: trample, hexproof and haste only if an opponent controls a planeswalker", () => {
      const s = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender"] } });
      const ginger = idOf(s, "p1", "battlefield", "Syr Ginger, the Meal Ender");
      expect(chars(s, ginger).keywords).not.toContain("hexproof");
      const t = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender", WALKER] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Syr Ginger, the Meal Ender")).keywords).not.toContain("hexproof");
      const u = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender"] }, p2: { battlefield: [WALKER] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Syr Ginger, the Meal Ender")).keywords).toEqual(
        expect.arrayContaining(["trample", "hexproof", "haste"]),
      );
    });

    it("Syr Ginger: another artifact put into the graveyard: counter and scry 1; {2}, {T}, sacrifice: life equal to its power", () => {
      let s = scenario({ p1: { battlefield: ["Syr Ginger, the Meal Ender", "Candy Trail", ...lands("Plains", 2)] } });
      const ginger = idOf(s, "p1", "battlefield", "Syr Ginger, the Meal Ender");
      let scried = false;
      destroy(s, idOf(s, "p1", "battlefield", "Candy Trail"));
      s = settle(act(s, "p1", { type: "pass" }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(counters(s, ginger)).toBe(1);
      expect(scried).toBe(true);
      expect(pt(s, ginger)).toEqual([4, 2]);
      s = settle(activate(s, "p1", ginger));
      expect(s.players.p1?.life).toBe(24);
      expect(idsOf(s, "p1", "graveyard", "Syr Ginger, the Meal Ender")).toHaveLength(1);
    });

    it("Three Bowls of Porridge: each mode only once (2 damage, tap, sacrifice and 3 life)", () => {
      let s = scenario({
        p1: { battlefield: ["Three Bowls of Porridge", ...lands("Plains", 6)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const bowls = idOf(s, "p1", "battlefield", "Three Bowls of Porridge");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", bowls, { label: "2 damage", targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      (s.objects[bowls] as { tapped: boolean }).tapped = false;
      expect(activations(s, "p1", bowls).map((a) => a.label)).not.toContain("2 damage to a creature");
      s = settle(activate(s, "p1", bowls, { label: "Tap a creature", targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      (s.objects[bowls] as { tapped: boolean }).tapped = false;
      expect(activations(s, "p1", bowls).map((a) => a.label)).toEqual(["Sacrifice it and gain 3 life"]);
      s = settle(activate(s, "p1", bowls, { label: "Sacrifice" }));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Three Bowls of Porridge")).toHaveLength(1);
    });
  });

  describe("Terrains", () => {
    it("Crystal Grotto: scry 1 on entering; {T}: {C}; {1}, {T}: one mana of any color", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Crystal Grotto"] } });
      let scried = false;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Crystal Grotto") }), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      const grotto = idOf(s, "p1", "battlefield", "Crystal Grotto");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === grotto && a.colors.includes("C"))).toBe(
        true,
      );
      s = settle(activate(s, "p1", grotto), (req) => (req.intent === "manaColor" ? ["W"] : undefined));
      expect(s.players.p1?.manaPool.W).toBe(1);
    });

    it("Edgewall Inn: enters tapped, produces the chosen color; {3}, {T}, sacrifice: a card with an Adventure returns to hand", () => {
      let s = scenario({ p1: { hand: ["Edgewall Inn"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Edgewall Inn") });
      const inn = idOf(s, "p1", "battlefield", "Edgewall Inn");
      expect(s.objects[inn]?.tapped).toBe(true);
      // A played land takes the default choice (general approximation "auto choice"): only that color is produced.
      const chosen = s.objects[inn]?.chosen?.color;
      expect(chosen).toBeDefined();
      (s.objects[inn] as { tapped: boolean }).tapped = false;
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === inn ? a.colors : []));
      expect(colors).toEqual([chosen]);
      const t = scenario({
        p1: { battlefield: ["Edgewall Inn", ...lands("Forest", 3)], graveyard: ["Bramble Familiar // Fetch Quest", "Bear Cub"] },
      });
      const inn2 = idOf(t, "p1", "battlefield", "Edgewall Inn");
      const bear = idOf(t, "p1", "graveyard", "Bear Cub");
      expect(() => activate(t, "p1", inn2, { label: "Adventure", targets: { t: [bear] } })).toThrow();
      const card = idOf(t, "p1", "graveyard", "Bramble Familiar // Fetch Quest");
      const u = settle(activate(t, "p1", inn2, { label: "Adventure", targets: { t: [card] } }));
      expect(idsOf(u, "p1", "hand", "Bramble Familiar // Fetch Quest")).toHaveLength(1);
      expect(idsOf(u, "p1", "graveyard", "Edgewall Inn")).toHaveLength(1);
    });

    it("Restless Vinestalk: 5/5 Plant with trample; when attacking, another creature has base P/T 3/3", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Vinestalk", ...lands("Forest", 4), "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const vine = idOf(s, "p1", "battlefield", "Restless Vinestalk");
      expect(
        legalActions(s, "p1")
          .flatMap((a) => (a.type === "tapForMana" && a.source === vine ? a.colors : []))
          .sort(),
      ).toEqual(["G", "U"]);
      s = settle(activate(s, "p1", vine));
      const c = chars(s, vine);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toContain("Plant");
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([5, 5, ["G", "U"]]);
      expect(c.keywords).toContain("trample");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: vine, defender: "p2" }] });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
      if (s.pending?.kind === "choice") throw new Error("choix inattendu");
      expect(pt(s, angel)).toEqual([3, 3]);
    });

    it("Restless Fortress: 1/4 Nightmare; when attacking, the defending player loses 2 life and you gain 2", () => {
      let s = scenario({ p1: { battlefield: ["Restless Fortress", ...lands("Plains", 2), ...lands("Swamp", 2)] } });
      const fortress = idOf(s, "p1", "battlefield", "Restless Fortress");
      s = settle(activate(s, "p1", fortress));
      expect(pt(s, fortress)).toEqual([1, 4]);
      expect(chars(s, fortress).subtypes).toContain("Nightmare");
      s = attack(s, [fortress]);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Restless Spire: 2/1 Elemental with the initiative during your turn; when attacking, scry 1", () => {
      let s = scenario({ p1: { battlefield: ["Restless Spire", "Island", "Mountain"] } });
      const spire = idOf(s, "p1", "battlefield", "Restless Spire");
      s = settle(activate(s, "p1", spire));
      expect(pt(s, spire)).toEqual([2, 1]);
      expect(chars(s, spire).keywords).toContain("firstStrike");
      let scried = false;
      s = attack(s, [spire], (req) => {
        if (req.intent === "scryBottom") scried = true;
        return undefined;
      });
      expect(scried).toBe(true);
      // During the opponent's turn, the initiative does not apply.
      const t = scenario({ active: "p2", p1: { battlefield: ["Restless Spire", "Island", "Mountain"] } });
      let u = act(t, "p2", { type: "pass" });
      u = settle(activate(u, "p1", idOf(u, "p1", "battlefield", "Restless Spire")));
      expect(chars(u, idOf(u, "p1", "battlefield", "Restless Spire")).keywords).not.toContain("firstStrike");
    });

    it("Restless Bivouac: 2/2 Ox; when attacking, a +1/+1 counter on a creature you control", () => {
      let s = scenario({ p1: { battlefield: ["Restless Bivouac", "Bear Cub", "Plains", ...lands("Mountain", 2)] } });
      const bivouac = idOf(s, "p1", "battlefield", "Restless Bivouac");
      s = settle(activate(s, "p1", bivouac));
      expect(pt(s, bivouac)).toEqual([2, 2]);
      expect(chars(s, bivouac).subtypes).toContain("Ox");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bivouac], (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(counters(s, bear)).toBe(1);
    });
  });
});

describe("Wilds of Eldraine, lot B1: enchanted creatures", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** Directly attaches a player's Role (Aura token) to a creature. */
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = {
      item: { id: "x", controller, sourceId: to, sourceDefId: s.objects[to]?.defId, targets: { t: [to] } },
      controller,
      targets: { t: [to] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    for (const e of createRole(token).flat()) if (e.op !== "if") runEffect(s, r, e);
  };

  it("Archon of the Wild Rose: your other creatures enchanted by your Auras are 4/4 with flying", () => {
    const s = scenario({ p1: { battlefield: ["Archon of the Wild Rose", "Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    giveRole(s, MONSTER_ROLE, bear, "p1");
    giveRole(s, MONSTER_ROLE, elves, "p2");
    // Base 4/4, plus the Monster Role: 5/5 flying.
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
    expect(chars(s, bear).keywords).toContain("flying");
    // The opponent's Aura does not count.
    expect(chars(s, elves).power).toBe(2);
  });

  it("A Tale for the Ages and Syr Armont: your creatures enchanted, by any Aura, get the bonus", () => {
    const s = scenario({ p1: { battlefield: ["A Tale for the Ages", "Syr Armont, the Redeemer", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    giveRole(s, MONSTER_ROLE, bear, "p2");
    expect(chars(s, bear).power).toBe(2 + 1 + 2 + 1);
  });

  it("Lord Skitter's Blessing: with an enchanted creature, one more card and 1 life on your draw", () => {
    let s = scenario({ p1: { battlefield: ["Lord Skitter's Blessing", "Bear Cub"], library: lands("Swamp", 5) }, step: "end" });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, WICKED_ROLE, bear);
    const hand = s.players.p1?.hand.length ?? 0;
    s = passAccepting(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(2);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Graceful Takedown: each targeted creature deals damage equal to its power to the opposing target", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Bear Cub", "Llanowar Elves"], hand: ["Graceful Takedown"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    giveRole(s, MONSTER_ROLE, bear);
    s = settleAll(s);
    const card = idOf(s, "p1", "hand", "Graceful Takedown");
    s = settleAll(act(s, "p1", { type: "cast", card, targets: { e: [bear], o: [elves], t: [wurm] } }));
    expect(s.objects[wurm]?.damage).toBe(3 + 1);
  });

  it("Eriette of the Charmed Apple: a creature enchanted by your Aura can't attack you; drain X", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Eriette of the Charmed Apple"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    giveRole(s, CURSED_ROLE, bear, "p2");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] })).toThrow();
    // At p2's end step: an Aura (the Role) -> p1 loses 1, p2 gains 1.
    s = act(s, "p1", { type: "declareAttackers", attackers: [] });
    s = advanceUntil(s, (x) => x.turn.number === 5);
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(21);
  });
});

describe('Wilds of Eldraine, lot B2: "you tap an opposing creature"', () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  /** An effect of `controller` that taps the creature (as a spell or an ability would). */
  const tapBy = (s: S, controller: string, id: string) => {
    const r = {
      item: { id: "x", controller, sourceId: id, sourceDefId: s.objects[id]?.defId, targets: { t: [id] } },
      controller,
      targets: { t: [id] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    s.resolving = r as never;
    runEffect(s, r, dsl.fx.tap(dsl.ref.target()));
    s.resolving = null;
  };

  it("Solitary Sanctuary: on entering, taps and stuns; a +1/+1 counter when you tap an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Solitary Sanctuary"] },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Solitary Sanctuary") });
    s = settleAll(s);
    expect(s.objects[wurm]?.tapped).toBe(true);
    expect(s.objects[wurm]?.counters.stun).toBe(1);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    // The opponent who taps their own creature triggers nothing.
    tapBy(s, "p2", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Sharae of Numbing Depths: draw a card the first time each turn only", () => {
    let s = scenario({
      p1: { battlefield: ["Sharae of Numbing Depths"], library: lands("Island", 3) },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
    s = settleAll(s);
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(1);
  });

  it("Icewrought Sentry: +2/+1 when you tap an opposing creature, not when the opponent taps it", () => {
    let s = scenario({ p1: { battlefield: ["Icewrought Sentry"] }, p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] } });
    const sentry = idOf(s, "p1", "battlefield", "Icewrought Sentry");
    tapBy(s, "p2", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
    s = settleAll(s);
    expect(chars(s, sentry).power).toBe(2);
    tapBy(s, "p1", idOf(s, "p2", "battlefield", "Shivan Dragon"));
    s = settleAll(s);
    expect(chars(s, sentry).power).toBe(4);
  });

  it("Hylda of the Icy Crown: you may pay {1}; when you do, choose a mode (PLAN-D, D6)", () => {
    const start = () => {
      const s = scenario({ p1: { battlefield: ["Hylda of the Icy Crown", "Plains"] }, p2: { battlefield: ["Pelakka Wurm"] } });
      tapBy(s, "p1", idOf(s, "p2", "battlefield", "Pelakka Wurm"));
      return s;
    };
    // {1} first, then the mode, chosen when the reflexive ability is put on the stack.
    const asked: string[] = [];
    let s = settle(start(), (req) => {
      asked.push(req.intent);
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerMode") {
        expect(req.options).toEqual(["0", "1", "2"]);
        return ["1"];
      }
      return undefined;
    });
    expect(asked).toEqual(["may", "triggerMode"]);
    const hylda = idOf(s, "p1", "battlefield", "Hylda of the Icy Crown");
    expect(s.objects[hylda]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    // Without paying: no mode is asked for.
    const asked2: string[] = [];
    s = settle(start(), (req) => {
      asked2.push(req.intent);
      return req.type === "yesNo" ? [0] : undefined;
    });
    expect(asked2).toEqual(["may"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hylda of the Icy Crown")]?.counters["+1/+1"]).toBeUndefined();
    // Default mode: the 4/4 Elemental.
    s = settle(start());
    expect(s.battlefield.filter((id) => chars(s, id).name === "Elemental")).toHaveLength(1);
  });

  it("A granted modal triggered ability keeps its modes (PLAN-D, D6)", () => {
    const banner = customCard({
      name: "Modal Banner",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [
        dsl.staticAbility(
          { types: ["Creature"], controller: "you" },
          {
            addAbilities: [
              dsl.triggeredModal(dsl.when.attacksSelf, [
                dsl.mode("Gain 2 life", [], [dsl.fx.gainLife(2)]),
                dsl.mode("Draw a card", [], [dsl.fx.draw(1)]),
              ]),
            ],
          },
        ),
      ],
    });
    let s = scenario({ p1: { battlefield: [banner, "Bear Cub"], library: lands("Island", 3) } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }] });
    const asked: string[] = [];
    s = settle(s, (req) => {
      asked.push(req.intent);
      return req.intent === "triggerMode" ? ["1"] : undefined;
    });
    expect(asked[0]).toBe("triggerMode");
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("Wilds of Eldraine, lot B3: a Role for each creature", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const roleOn = (s: S, host: string) =>
    s.battlefield.filter((id) => s.objects[id]?.attachedTo === host).map((id) => chars(s, id).name);

  it("Asinine Antics: a Cursed Role on each opposing creature; castable with flash for {2} more", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Asinine Antics"] },
      p2: { battlefield: ["Pelakka Wurm", "Shivan Dragon"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "pass" });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Asinine Antics") }));
    for (const name of ["Pelakka Wurm", "Shivan Dragon"]) {
      const id = idOf(s, "p2", "battlefield", name);
      expect(roleOn(s, id)).toEqual(["Cursed Role"]);
      expect(chars(s, id).power).toBe(1);
    }
    expect(s.players.p1?.manaPool.U ?? 0).toBe(0);
  });

  it("Twisted Sewer-Witch: a Rat, then a Wicked Role attached to each Rat", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 5)], hand: ["Twisted Sewer-Witch"] } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Twisted Sewer-Witch") }));
    const rats = s.battlefield.filter((id) => chars(s, id).name === "Rat");
    expect(rats).toHaveLength(1);
    expect(roleOn(s, rats[0] as string)).toEqual(["Wicked Role"]);
    expect(chars(s, rats[0] as string).power).toBe(2);
  });
});

describe('Wilds of Eldraine, lot B4: "costs less if bargained"', () => {
  it("Hamlet Glutton: {2} less when bargaining (a token sacrificed), full price otherwise", () => {
    const s = scenario({ p1: { battlefield: [...lands("Forest", 5)], hand: ["Hamlet Glutton"] } });
    const card = idOf(s, "p1", "hand", "Hamlet Glutton");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    // Five lands and nothing to bargain with: {5}{G}{G} is out of reach.
    expect(opt).toBeUndefined();
    const food = { name: "Food", colors: [], types: ["Artifact"], subtypes: ["Food"] } as TokenSpec;
    const t = scenario({ p1: { battlefield: [...lands("Forest", 5)], hand: ["Hamlet Glutton"] } });
    const r = {
      item: { id: "x", controller: "p1", sourceId: "none", sourceDefId: "none", targets: {} },
      controller: "p1",
      targets: {},
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    runEffect(t, r, dsl.fx.createTokens(food));
    const glutton = idOf(t, "p1", "hand", "Hamlet Glutton");
    const kick = legalActions(t, "p1").find((a) => a.type === "cast" && a.card === glutton);
    expect(kick?.type === "cast" && kick.kickerAffordable).toBe(true);
    const after = passAccepting(
      act(t, "p1", { type: "cast", card: glutton, kicked: true }),
      (x) => x.stack.length === 0 && x.triggers.length === 0,
    );
    expect(idsOf(after, "p1", "battlefield", "Hamlet Glutton")).toHaveLength(1);
    expect(after.players.p1?.life).toBe(23);
  });
});

describe("Wilds of Eldraine, lot C1: stealth, X counters divided, attached Auras, life lost", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const giveRole = (s: S, token: TokenSpec, to: string, controller = "p1") => {
    const r = {
      item: { id: "x", controller, sourceId: to, sourceDefId: s.objects[to]?.defId, targets: { t: [to] } },
      controller,
      targets: { t: [to] },
      vars: {},
      pc: 0,
    } as never as Parameters<typeof runEffect>[1];
    for (const e of createRole(token, dsl.ref.target()).flat()) runEffect(s, r, e);
  };

  it("Ingenious Prodigy: X counters; stealth; at upkeep, a counter removed for a card", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Ingenious Prodigy"], library: lands("Island", 3) } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ingenious Prodigy"), x: 2 }));
    const prodigy = idOf(s, "p1", "battlefield", "Ingenious Prodigy");
    expect(s.objects[prodigy]?.counters["+1/+1"]).toBe(2);
    // 2/3: blocked by a 2/2, not by a 5/5.
    const t = scenario({ p1: { battlefield: ["Ingenious Prodigy"] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const p = idOf(t, "p1", "battlefield", "Ingenious Prodigy");
    const pr = t.objects[p];
    if (pr) pr.counters["+1/+1"] = 2;
    let u = passAccepting(t, (x) => x.pending?.kind === "declareAttackers");
    u = act(u, "p1", { type: "declareAttackers", attackers: [{ id: p, defender: "p2" }] });
    expect(canBlock(u, idOf(u, "p2", "battlefield", "Shivan Dragon"), p)).toBe(false);
    expect(canBlock(u, idOf(u, "p2", "battlefield", "Bear Cub"), p)).toBe(true);
    // Next upkeep: a counter is removed and a card drawn.
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(s.objects[prodigy]?.counters["+1/+1"]).toBe(1);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(2);
  });

  it("Grove's Bounty: X +1/+1 counters divided among your creatures", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"], hand: ["Elusive Otter // Grove's Bounty"] },
    });
    const card = idOf(s, "p1", "hand", "Elusive Otter // Grove's Bounty");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Grove's Bounty");
    const face = opt?.type === "cast" ? opt.face : undefined;
    s = act(s, "p1", { type: "cast", card, face, x: 3, targets: { t: [bear, elves] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [2, 1] });
    s = settleAll(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
  });

  it("Kellan, the Fae-Blooded: your other creatures +1/+0 per Aura and Equipment attached to Kellan", () => {
    const s = scenario({ p1: { battlefield: ["Kellan, the Fae-Blooded // Birthright Boon", "Bear Cub"] } });
    const kellan = idOf(s, "p1", "battlefield", "Kellan, the Fae-Blooded // Birthright Boon");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    giveRole(s, MONSTER_ROLE, kellan);
    expect(chars(s, bear).power).toBe(3);
    giveRole(s, MONSTER_ROLE, bear);
    // The Role on the Bear is not attached to Kellan.
    expect(chars(s, bear).power).toBe(3 + 1);
  });

  it("Faunsbane Troll: sacrifice an Aura attached to it so that it fights; the killed creature is exiled", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Swamp"], hand: ["Faunsbane Troll"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Faunsbane Troll") }));
    const troll = idOf(s, "p1", "battlefield", "Faunsbane Troll");
    expect(chars(s, troll).power).toBe(5);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settleAll(act(s, "p1", { type: "activate", source: troll, ability: 1, targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub")).toBe(true);
    expect(chars(s, troll).power).toBe(4);
  });

  it("Rowan, Scion of War: your black and/or red spells cost {X} less, X being the life lost this turn", () => {
    let s = scenario({ p1: { battlefield: ["Rowan, Scion of War"], hand: ["Lightning Strike"] } });
    const rowan = idOf(s, "p1", "battlefield", "Rowan, Scion of War");
    s.turnLog.push({ e: "lifeLoss", player: "p1", amount: 1 });
    s = settleAll(act(s, "p1", { type: "activate", source: rowan, ability: 0 }));
    const strike = idOf(s, "p1", "hand", "Lightning Strike");
    // {1}{R} minus {1}: {R}, unpayable without a land but displayed cost of mana value 1.
    expect(projectView(s, "p1").hand.find((c) => c.id === strike)?.castCost).toEqual({ text: "{R}", delta: -1 });
    // PLAN-M M8a: X is fixed as the ability resolves (life lost afterwards doesn't count), and the reduction is the
    // player's for the turn (it stays after Rowan leaves).
    s.turnLog.push({ e: "lifeLoss", player: "p1", amount: 1 });
    destroy(s, rowan);
    expect(projectView(s, "p1").hand.find((c) => c.id === strike)?.castCost).toEqual({ text: "{R}", delta: -1 });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(projectView(s, "p1").hand.find((c) => c.id === strike)?.castCost).toBeUndefined();
  });
});

describe("Wilds of Eldraine, lot C2: damage from a targeted spell, blocks, damage taken", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };

  it("Imodane: a single-target spell that damages its creature damages each opponent as much; not a spell that targets a player", () => {
    let s = scenario({
      p1: {
        battlefield: ["Imodane, the Pyrohammer", "Mountain", "Mountain", "Mountain", "Mountain"],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settleAll(act(s, "p1", { type: "cast", card: a as string, targets: { t: [wurm] } }));
    expect(s.players.p2?.life).toBe(17);
    s = settleAll(act(s, "p1", { type: "cast", card: b as string, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Skewer Slinger: 1 damage to the creature it blocks, and to the one that blocks it", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Skewer Slinger"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const slinger = idOf(s, "p2", "battlefield", "Skewer Slinger");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: slinger, attacker: bear }] });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step !== "declareBlockers");
    // 1 damage from the trigger, then 1 from combat: the Bear (2/2) dies.
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Tangled Colony: when it dies, a Rat per damage taken this turn", () => {
    let s = scenario({ p1: { battlefield: ["Tangled Colony"] } });
    const colony = idOf(s, "p1", "battlefield", "Tangled Colony");
    dealDamage(s, { defId: "test", controller: "p2", keywords: [] }, colony, 5, false);
    s = settleAll(s);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Rat")).toHaveLength(5);
  });
});

describe("Wilds of Eldraine, lot C3: nonlegendary copies, copy of a card from the graveyard", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  };
  const legend = customCard({ name: "Test Hero", supertypes: ["Legendary"], power: 3, toughness: 3 });

  it("The Apprentice's Folly: nonlegendary copy, Reflection with haste; no target with the name of one of your tokens", () => {
    let s = scenario({
      p1: { battlefield: [legend, "Island", "Island", "Mountain", "Mountain"], hand: ["The Apprentice's Folly"] },
    });
    const hero = idOf(s, "p1", "battlefield", legend.name);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Apprentice's Folly") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const copies = s.battlefield.filter((id) => s.objects[id]?.isToken && chars(s, id).name === legend.name);
    expect(copies).toHaveLength(1);
    const copy = copies[0] as string;
    expect(chars(s, copy).supertypes).not.toContain("Legendary");
    expect(chars(s, copy).subtypes).toContain("Reflection");
    expect(chars(s, copy).keywords).toContain("haste");
    // A token with the same name: the hero is no longer a legal target for chapter II.
    const spec = {
      id: "t",
      filter: {
        objects: {
          types: ["Creature"],
          controller: "you",
          token: false,
          not: { sameNameAs: { token: true, controller: "you" } },
        },
      },
    } as const;
    expect(legalTargetsOf(s, "p1", spec as never)).not.toContain(hero);
  });

  it("Yenna, Redtooth Regent: nonlegendary copy of an enchantment; it is not an Aura: Yenna stays tapped", () => {
    let s = scenario({
      p1: { battlefield: ["Yenna, Redtooth Regent", "Forest", "Forest", "Bear Cub", "A Tale for the Ages"] },
    });
    const yenna = idOf(s, "p1", "battlefield", "Yenna, Redtooth Regent");
    const tale = idOf(s, "p1", "battlefield", "A Tale for the Ages");
    s = settleAll(act(s, "p1", { type: "activate", source: yenna, ability: 0, targets: { t: [tale] } }));
    expect(s.battlefield.filter((id) => chars(s, id).name === "A Tale for the Ages")).toHaveLength(2);
    expect(s.objects[yenna]?.tapped).toBe(true);
  });

  it("Likeness Looter: becomes a copy of the card with MV X, with flying and its ability; nothing if the MV differs", () => {
    let s = scenario({
      p1: { battlefield: ["Likeness Looter", ...lands("Island", 2)], graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    const looter = idOf(s, "p1", "battlefield", "Likeness Looter");
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
    // The Dragon (MV 6) isn't a legal target for X = 2 ("with mana value X").
    expect(() => act(s, "p1", { type: "activate", source: looter, ability: 1, x: 2, targets: { t: [dragon] } })).toThrow();
    expect(chars(s, looter).name).toBe("Likeness Looter");
    s = scenario({ p1: { battlefield: ["Likeness Looter", ...lands("Island", 2)], graveyard: ["Bear Cub"] } });
    const l2 = idOf(s, "p1", "battlefield", "Likeness Looter");
    s = settleAll(
      act(s, "p1", { type: "activate", source: l2, ability: 1, x: 2, targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }),
    );
    expect(chars(s, l2).name).toBe("Bear Cub");
    expect(chars(s, l2).keywords).toContain("flying");
    expect(chars(s, l2).abilities.some((a) => a.kind === "activated" && a.label?.startsWith("Becomes a copy"))).toBe(true);
    void bear;
  });
});

describe("Wilds of Eldraine, lot C4: top of the library, ability costs, Adventures, exile", () => {
  const settleAll = (s: S) => {
    while (stateBasedActions(s)) {}
    return settle(s);
  };
  const tapped = (s: S, player: string) =>
    s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.tapped);
  const drawer = (name: string, mana: string) =>
    customCard({
      name,
      power: 1,
      toughness: 1,
      abilities: [dsl.activated({ mana, effects: [dsl.fx.draw(1)], label: "Draw a card" })],
    });

  it("Johann: an instant or sorcery from the top of the library, once per turn; not a creature", () => {
    let s = scenario({
      p1: { battlefield: ["Johann, Apprentice Sorcerer", ...lands("Island", 4)], library: ["Opt", "Opt", "Opt", "Bear Cub"] },
    });
    const top = s.players.p1?.library[0] as string;
    expect(castOptions(s, "p1", top)).toHaveLength(1);
    s = settleAll(act(s, "p1", { type: "cast", card: top }));
    // Opt (scry 1, then draw): the new top card is no longer castable this turn.
    const next = s.players.p1?.library[0] as string;
    expect(nameOf(s, next)).toBe("Opt");
    expect(castOptions(s, "p1", next)).toHaveLength(0);
    const t = scenario({ p1: { battlefield: ["Johann, Apprentice Sorcerer", ...lands("Forest", 2)], library: ["Bear Cub"] } });
    expect(castOptions(t, "p1", t.players.p1?.library[0] as string)).toHaveLength(0);
  });

  it("Agatha of the Vile Cauldron: abilities of your creatures cost {X} less (X = its power), never below one mana", () => {
    const three = drawer("Sage of Three", "{3}");
    const one = drawer("Sage of One", "{1}");
    let s = scenario({
      p1: { battlefield: ["Agatha of the Vile Cauldron", three, one, ...lands("Island", 2)], library: lands("Island", 3) },
    });
    const sage = idOf(s, "p1", "battlefield", three.name);
    const small = idOf(s, "p1", "battlefield", one.name);
    s = settleAll(activate(s, "p1", sage));
    // {3} - 1 = {2}: the two Islands.
    expect(tapped(s, "p1")).toHaveLength(2);
    s = scenario({ p1: { battlefield: ["Agatha of the Vile Cauldron", one], library: lands("Island", 3) } });
    // {1} does not go down to {0}.
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === idOf(s, "p1", "battlefield", one.name))).toBe(
      false,
    );
    void small;
  });

  it("Agatha of the Vile Cauldron: {4}{R}{G} (reduced by its own power): your other creatures +1/+1, trample, haste", () => {
    let s = scenario({
      p1: { battlefield: ["Agatha of the Vile Cauldron", "Bear Cub", ...lands("Mountain", 2), ...lands("Forest", 3)] },
    });
    const agatha = idOf(s, "p1", "battlefield", "Agatha of the Vile Cauldron");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settleAll(activate(s, "p1", agatha));
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(chars(s, agatha).power).toBe(1);
  });

  it("Agatha's Soul Cauldron: exiled creature card, +1/+1 counter; its abilities for your creatures with counters, mana of any color", () => {
    const mage = drawer("Mage d'essai", "{U}");
    let s = scenario({
      p1: { battlefield: ["Agatha's Soul Cauldron", "Bear Cub", "Forest"], library: lands("Forest", 3) },
      p2: { graveyard: [mage, "Opt"] },
    });
    const cauldron = idOf(s, "p1", "battlefield", "Agatha's Soul Cauldron");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).abilities.some((a) => a.kind === "activated")).toBe(false);
    s = settleAll(activate(s, "p1", cauldron, { t: [idOf(s, "p2", "graveyard", mage.name)] }));
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bear).abilities.some((a) => a.kind === "activated" && a.label === "Draw a card")).toBe(true);
    // {U} paid with a Forest.
    const hand = s.players.p1?.hand.length ?? 0;
    s = settleAll(activate(s, "p1", bear));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Agatha's Soul Cauldron: a noncreature exiled card gives neither counter nor ability", () => {
    let s = scenario({ p1: { battlefield: ["Agatha's Soul Cauldron", "Bear Cub"] }, p2: { graveyard: ["Opt"] } });
    const cauldron = idOf(s, "p1", "battlefield", "Agatha's Soul Cauldron");
    s = settleAll(activate(s, "p1", cauldron, { t: [idOf(s, "p2", "graveyard", "Opt")] }));
    expect(exiled(s, "Opt")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[cauldron]?.linked ?? []).toHaveLength(0);
  });

  it("Beluna Grandsquall: permanent spells with an Adventure cost {1} less; not the Adventure, nor another spell", () => {
    const s = scenario({
      p1: { battlefield: ["Beluna Grandsquall // Seek Thrills"], hand: ["Bramble Familiar // Fetch Quest", "Bear Cub"] },
    });
    const v = projectView(s, "p1");
    const familiar = idOf(s, "p1", "hand", "Bramble Familiar // Fetch Quest");
    expect(v.hand.find((c) => c.id === familiar)?.castCost).toEqual({ text: "{G}", delta: -1 });
    expect(v.hand.find((c) => c.id === idOf(s, "p1", "hand", "Bear Cub"))?.castCost).toBeUndefined();
  });

  it("Seek Thrills: mill seven cards, milled cards with an Adventure go to your hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), "Island", "Mountain"],
        hand: ["Beluna Grandsquall // Seek Thrills"],
        library: [
          "Opt",
          "Bramble Familiar // Fetch Quest",
          "Opt",
          "Opt",
          "Bear Cub",
          "Opt",
          "Opt",
          "Bramble Familiar // Fetch Quest",
        ],
      },
    });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Beluna Grandsquall // Seek Thrills"), face: 1 }));
    expect(idsOf(s, "p1", "hand", "Bramble Familiar // Fetch Quest")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(5);
    expect(s.players.p1?.library).toHaveLength(1);
  });

  it("Extraordinary Journey: up to X creatures exiled, playable by their owner; a creature entering from exile draws", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Extraordinary Journey"], library: lands("Island", 3) },
      p2: { battlefield: ["Bear Cub", ...lands("Forest", 2)] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Extraordinary Journey"), x: 1 });
    s = settleAll(s);
    const card = exiled(s, "Bear Cub")[0] as string;
    expect(card).toBeDefined();
    void bear;
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castOptions(s, "p2", card)).toHaveLength(1);
    s = settleAll(act(s, "p2", { type: "cast", card }));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });
});

describe("Wilds of Eldraine, lot C5: paying life, chosen number, cards with an Adventure in exile", () => {
  const settleAll = (s: S, answer?: Answer) => {
    while (stateBasedActions(s)) {}
    return settle(s, answer);
  };
  const toExile = (s: S, id: string) => moveObject(s, id, "exile");

  it("Ashiok: paying life exiles that many cards from the top of your library; life paid if it is too short; not for the opponent", () => {
    const s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: lands("Swamp", 3) } });
    payLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.library).toHaveLength(1);
    expect(exiled(s, "Swamp")).toHaveLength(2);
    // A single card for 2 life: the life is paid (no shared payment).
    payLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p1?.library).toHaveLength(1);
    payLife(s, "p2", 3);
    expect(s.players.p2?.life).toBe(17);
  });

  it("Ashiok: a life cost of an ability is paid by exiling cards", () => {
    const pricey = customCard({
      name: "Test Priest",
      power: 1,
      toughness: 1,
      abilities: [dsl.activated({ payLife: 3, effects: [dsl.fx.gainLife(1)], label: "Gain 1 life" })],
    });
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator", pricey], library: lands("Swamp", 5) } });
    s = settleAll(activate(s, "p1", idOf(s, "p1", "battlefield", pricey.name)));
    expect(s.players.p1?.life).toBe(21);
    expect(exiled(s, "Swamp")).toHaveLength(3);
  });

  it("Ashiok +1: two cards looked at, one exiled, the other to hand", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: ["Opt", "Bear Cub", "Swamp"] } });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 1 }));
    const names = [...exiled(s, "Opt"), ...exiled(s, "Bear Cub")].map((id) => nameOf(s, id));
    expect(names).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", names[0] === "Opt" ? "Bear Cub" : "Opt")).toHaveLength(1);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Swamp"]);
    expect(s.objects[ashiok]?.counters.loyalty).toBe(6);
  });

  it("Ashiok -2: two Nightmares, which grow at the beginning of your combat if a card was exiled this turn", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator"], library: lands("Swamp", 5) } });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 2 }));
    const nightmares = () => s.battlefield.filter((id) => chars(s, id).name === "Nightmare");
    expect(nightmares()).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0);
    expect(nightmares().map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
    // Next turn: a card exiled (life paid), then combat.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    payLife(s, "p1", 1);
    s = advanceUntil(
      s,
      (x) => x.turn.number === 5 && x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0,
    );
    expect(nightmares().map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([1, 1]);
  });

  it("Ashiok -7: the targeted player exiles X cards, X being the total mana value of the cards you own in exile", () => {
    let s = scenario({
      p1: { battlefield: ["Ashiok, Wicked Manipulator"], graveyard: ["Shivan Dragon", "Opt"] },
      p2: { graveyard: ["Serra Angel"], library: lands("Island", 10) },
    });
    const ashiok = idOf(s, "p1", "battlefield", "Ashiok, Wicked Manipulator");
    toExile(s, idOf(s, "p1", "graveyard", "Shivan Dragon"));
    toExile(s, idOf(s, "p1", "graveyard", "Opt"));
    // The opponent's card in exile does not count.
    toExile(s, idOf(s, "p2", "graveyard", "Serra Angel"));
    const a = s.objects[ashiok];
    if (a) a.counters.loyalty = 7;
    s = settleAll(act(s, "p1", { type: "activate", source: ashiok, ability: 3, targets: { t: ["p2"] } }));
    // Shivan Dragon (6) + Opt (1) = 7.
    expect(exiled(s, "Island")).toHaveLength(7);
    expect(s.players.p2?.library).toHaveLength(3);
  });

  it("Talion: the proposed number does not count opposing cards exiled face down (hidden information)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Talion, the Kindly Lord"] },
      p2: { graveyard: ["Bear Cub", "Serra Angel", "Serra Angel"] },
    });
    // The two Angels (MV 5) are exiled face down: only Bear Cub (MV 2), public, counts.
    for (const id of idsOf(s, "p2", "graveyard", "Serra Angel")) {
      moveObject(s, id, "exile");
      const o = s.objects[s.exile.at(-1) as string];
      if (o) o.exiledFaceDown = [];
    }
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Talion, the Kindly Lord") });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    expect(p?.kind === "choice" ? p.request.suggested : null).toEqual(["2"]);
  });

  it("Talion: a number chosen on entering; an opposing spell of that mana value, power or toughness: it loses 2 life, you draw", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Talion, the Kindly Lord"] } });
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Talion, the Kindly Lord") }), (req) =>
      req.type === "pick" && req.options.includes("3") ? ["3"] : undefined,
    );
    expect(s.objects[idOf(s, "p1", "battlefield", "Talion, the Kindly Lord")]?.chosen?.number).toBe(3);

    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Talion, the Kindly Lord"], library: lands("Island", 5) },
      p2: { battlefield: [...lands("Mountain", 2), "Island"], hand: ["Lightning Strike", "Opt"] },
    });
    const talion = idOf(t, "p1", "battlefield", "Talion, the Kindly Lord");
    const tal = t.objects[talion];
    if (tal) tal.chosen = { number: 2 };
    const hand = t.players.p1?.hand.length ?? 0;
    // Lightning Strike: mana value 2.
    t = settleAll(act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } }));
    expect(t.players.p2?.life).toBe(18);
    expect(t.players.p1?.hand).toHaveLength(hand + 1);
    // Opt: mana value 1, nothing.
    t = settleAll(act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Opt") }));
    expect(t.players.p2?.life).toBe(18);
  });

  it("Sentinel of Lost Lore: takes back your exiled Adventure card, puts an opponent's under its library, exiles a graveyard", () => {
    const BRAMBLE = "Bramble Familiar // Fetch Quest";
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Sentinel of Lost Lore"], graveyard: [BRAMBLE] },
      p2: { graveyard: [BRAMBLE, "Opt"], library: lands("Island", 3) },
    });
    const mine = idOf(s, "p1", "graveyard", BRAMBLE);
    const theirs = idOf(s, "p2", "graveyard", BRAMBLE);
    toExile(s, mine);
    toExile(s, theirs);
    const [myExiled, theirExiled] = s.exile;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sentinel of Lost Lore") });
    // "Choose one or more": the three modes, then their targets.
    s = settleAll(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.intent === "triggerMode")
        return req.options.filter((o) => (req.labels?.[String(o)] ?? "").split(" + ").length === 3);
      if (req.options.includes(myExiled as string) && !req.options.includes(theirExiled as string)) return [myExiled as string];
      if (req.options.includes(theirExiled as string) && !req.options.includes(myExiled as string))
        return [theirExiled as string];
      if (req.options.includes("p2")) return ["p2"];
      return undefined;
    });
    expect(idsOf(s, "p1", "hand", BRAMBLE)).toHaveLength(1);
    expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe(BRAMBLE);
    expect(exiled(s, "Opt")).toHaveLength(1);
  });

  it('Sentinel of Lost Lore: "one or more" modes; a mode with no possible target is not offered (PLAN-H, H2)', () => {
    const BRAMBLE = "Bramble Familiar // Fetch Quest";
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Sentinel of Lost Lore"], graveyard: [BRAMBLE] },
      p2: { graveyard: ["Opt"] },
    });
    toExile(s, idOf(s, "p1", "graveyard", BRAMBLE));
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sentinel of Lost Lore") });
    let labels: string[] = [];
    // Only the "exile a graveyard" mode is chosen: the Adventure card stays in exile.
    s = settleAll(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.intent === "triggerMode") {
        labels = req.options.map((o) => req.labels?.[String(o)] ?? "");
        return req.options.filter(
          (o) => !(req.labels?.[String(o)] ?? "").includes("+") && /graveyard/.test(req.labels?.[String(o)] ?? ""),
        );
      }
      if (req.options.includes("p2")) return ["p2"];
      return undefined;
    });
    // No opposing Adventure card in exile: three combinations (your card, the graveyard, both).
    expect(labels).toHaveLength(3);
    expect(labels.some((l) => /don't own/.test(l))).toBe(false);
    expect(exiled(s, "Opt")).toHaveLength(1);
    expect(exiled(s, BRAMBLE)).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", BRAMBLE)).toHaveLength(0);
  });
});

describe("Faerie Fencing (PLAN-D, D5)", () => {
  it("the extra -3/-3 depends on the Faerie controlled when casting the spell, even if it leaves before resolution", () => {
    const faerie = customCard({
      name: "Test Faerie",
      typeLine: "Creature — Faerie",
      subtypes: ["Faerie"],
      power: 1,
      toughness: 1,
    });
    const run = (withFaerie: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...(withFaerie ? [faerie] : [])], hand: ["Faerie Fencing"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Faerie Fencing"), x: 1, targets: { t: [angel] } });
      // The Faerie leaves the battlefield before resolution.
      if (withFaerie) destroy(s, idOf(s, "p1", "battlefield", faerie.name));
      s = settle(s);
      return idsOf(s, "p2", "graveyard", "Serra Angel").length;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });
});

describe("Wilds of Eldraine, PLAN-D D9: last cards", () => {
  it("Gingerbread Hunter: Puny Snack gives -2/-2 until end of turn then goes on an adventure; the 5/5 Giant cast from exile creates a Food", () => {
    const HUNTER = "Gingerbread Hunter // Puny Snack";
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 5)], hand: [HUNTER] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Puny Snack: instant ({2}{B}), a targeted creature gets -2/-2.
    s = settle(cast(s, "p1", HUNTER, { t: [angel] }, { face: 1 }));
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    const adv = onAdventure(s, HUNTER);
    // Until end of turn only.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([4, 4]);
    // -2/-2 kills a 2/2 creature.
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [HUNTER] }, p2: { battlefield: ["Bear Cub"] } });
    t = settle(cast(t, "p1", HUNTER, { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }, { face: 1 }));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // Back to p1's turn: the creature is cast from exile ({4}{G}), 5/5, and creates a Food on entering.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
    s = settle(act(s, "p1", { type: "cast", card: adv }));
    const hunter = idOf(s, "p1", "battlefield", HUNTER);
    expect([chars(s, hunter).power, chars(s, hunter).toughness]).toEqual([5, 5]);
    expect(chars(s, hunter).subtypes).toContain("Giant");
    const food = idOf(s, "p1", "battlefield", "Food");
    expect(chars(s, food).types).toContain("Artifact");
    // Food: {2}, {T}, sacrifice it: 3 life.
    s = settle(activate(s, "p1", food));
    expect(s.players.p1?.life).toBe(23);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
  });
});

describe("Wilds of Eldraine: a player chosen without being targeted (PLAN-H H4)", () => {
  it("Discerning Financier: the chosen player gains control of the targeted Treasure, you draw", () => {
    const treasure = customCard({
      name: "Test Treasure",
      typeLine: "Artifact — Treasure",
      types: ["Artifact"],
      subtypes: ["Treasure"],
    });
    let s = scenario({ players: 3, p1: { battlefield: ["Discerning Financier", treasure, ...lands("Plains", 3)] } });
    const t = idOf(s, "p1", "battlefield", "Test Treasure");
    const hand = s.players.p1?.hand.length ?? 0;
    const offered: string[][] = [];
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Discerning Financier"), { t: [t] }), (req, p) => {
      if (req.type !== "pick" || !req.options.includes("p3")) return undefined;
      offered.push([p, ...req.options]);
      return ["p3"];
    });
    // "Choose another player": you choose among the other players, not automatically the next one.
    expect(offered).toEqual([["p1", "p2", "p3"]]);
    expect(s.objects[t]?.controller).toBe("p3");
    expect(s.players.p1?.hand.length).toBe(hand + 1);
  });

  it("Discerning Financier in a duel: no question, the opponent receives the Treasure", () => {
    const treasure = customCard({
      name: "Test Treasure",
      typeLine: "Artifact — Treasure",
      types: ["Artifact"],
      subtypes: ["Treasure"],
    });
    let s = scenario({ p1: { battlefield: ["Discerning Financier", treasure, ...lands("Plains", 3)] } });
    const t = idOf(s, "p1", "battlefield", "Test Treasure");
    let asked = 0;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Discerning Financier"), { t: [t] }), (req) => {
      if (req.type === "pick" && req.options.includes("p2")) asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    expect(s.objects[t]?.controller).toBe("p2");
  });
});

describe("PLAN-M M11a: Yenna's copy of an Aura asks what it enchants", () => {
  it("Yenna, Redtooth Regent: the copy of an Aura enchants the creature chosen (303.4f), then Yenna untaps and scries 2", () => {
    let s = scenario({
      p1: { battlefield: ["Yenna, Redtooth Regent", ...lands("Forest", 5), "Bear Cub", "Bear Cub"], hand: ["Bestial Bloodline"] },
    });
    const yenna = idOf(s, "p1", "battlefield", "Yenna, Redtooth Regent");
    const [cub1, cub2] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bestial Bloodline"), targets: { enchant: [cub1] } }));
    const bloodline = idOf(s, "p1", "battlefield", "Bestial Bloodline");
    expect(s.objects[bloodline]?.attachedTo).toBe(cub1);
    let hosts: ChoiceValue[] | undefined;
    s = settle(act(s, "p1", { type: "activate", source: yenna, ability: 0, targets: { t: [bloodline] } }), (req) => {
      if (req.type !== "pick" || !req.prompt.includes("enchants")) return undefined;
      hosts = req.options;
      return [cub2];
    });
    // Any creature it can enchant (Yenna and both Bears); the suggestion was the first one.
    expect(hosts).toEqual(expect.arrayContaining([yenna, cub1, cub2]));
    const copy = s.battlefield.find((id) => id !== bloodline && chars(s, id).name === "Bestial Bloodline") as string;
    expect(s.objects[copy]?.attachedTo).toBe(cub2);
    expect(chars(s, cub2).power).toBe(4);
    expect(chars(s, cub1).power).toBe(4);
    expect(s.objects[yenna]?.tapped).toBe(false);
  });
});
