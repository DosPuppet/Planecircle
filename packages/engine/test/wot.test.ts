/** Enchanting Tales (WOT): rules tests for the cards (PLAN-G). */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, drawCards, gainLife } from "../src/actions";
import { fx, ref, spell, staticAbility, target } from "../src/dsl";
import { announceDiscard, moveDiscarded } from "../src/effects";
import { createGame } from "../src/game";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { changeCounters, chars } from "../src/state";
import { legalTargets } from "../src/targets";
import { stateBasedActions } from "../src/turn";
import {
  act,
  advanceUntil,
  attack,
  castable,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  namesIn,
  picking,
  pickNamed,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

describe("Enchanting Tales", () => {
  describe("Blind Obedience", () => {
    it("extort: whenever you cast a spell, paying {W/B} makes each opponent lose 1 life and you gain that much", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2), "Plains"], hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([22, 19, 19]);
    });

    it("your opponents' artifacts and creatures enter tapped; not yours", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Blind Obedience"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      let t = scenario({ p1: { battlefield: ["Blind Obedience", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bear Cub") }), () => [0]);
      expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });
  });

  describe("G5: Enchanting Tales", () => {
    type S = ReturnType<typeof scenario>;
    const castIt = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: S, source: string, extra: object = {}) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Intangible Virtue: your creature tokens get +1/+1 and vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Intangible Virtue", ...lands("Mountain", 2)], hand: ["Dragon Fodder"] } });
      s = settle(castIt(s, "Dragon Fodder"));
      const gob = idOf(s, "p1", "battlefield", "Goblin");
      expect([chars(s, gob).power, chars(s, gob).keywords.includes("vigilance")]).toEqual([2, true]);
    });

    it("Griffin Aerie: a Griffin at your end step if you gained 3 life this turn", () => {
      let s = scenario({ p1: { battlefield: ["Griffin Aerie"] } });
      gainLife(s, "p1", 3);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Griffin")).toHaveLength(1);
    });

    it("Land Tax: at upkeep, if an opponent has more lands, up to three basic lands into hand", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Land Tax", "Plains"], library: lands("Plains", 6) },
        p2: { battlefield: lands("Forest", 2) },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "hand", "Plains").length).toBeGreaterThanOrEqual(3);
      let t = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Land Tax", "Plains", "Plains"], library: lands("Plains", 6) },
        p2: { battlefield: lands("Forest", 2) },
      });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(idsOf(t, "p1", "hand", "Plains")).toHaveLength(1);
    });

    it("Smothering Tithe: an opponent draws; unless they pay {2}, a Treasure", () => {
      let s = scenario({ p1: { battlefield: ["Smothering Tithe"] }, p2: { library: lands("Forest", 3) } });
      drawCards(s, "p2", 1);
      s = settle(s, () => [0]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Copy Enchantment: enters as a copy of an enchantment", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Copy Enchantment"] },
        p2: { battlefield: ["Intangible Virtue"] },
      });
      s = settle(castIt(s, "Copy Enchantment"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      const copy = s.battlefield.find(
        (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Enchantment"),
      ) as string;
      expect(chars(s, copy).name).toBe("Intangible Virtue");
    });

    it("Forced Fruition and Oppression: an opponent casts a spell, they draw seven cards; they discard a card", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Forced Fruition", "Oppression"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"], library: lands("Forest", 10) },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p2?.hand).toHaveLength(6);
    });

    it("Hatching Plans: put into a graveyard from the battlefield, draw three cards", () => {
      let s = scenario({ p1: { battlefield: ["Hatching Plans"], library: lands("Island", 5) } });
      destroy(s, idOf(s, "p1", "battlefield", "Hatching Plans"));
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Grasp of Fate: for each opponent, up to one nonland permanent they control, exiled until it leaves", () => {
      const base = () =>
        scenario({
          players: 3,
          p1: { battlefield: lands("Plains", 3), hand: ["Grasp of Fate"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel"] },
          p3: { battlefield: ["Bear Cub", "Forest"] },
        });
      let s = base();
      const cub2 = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const cub3 = idOf(s, "p3", "battlefield", "Bear Cub");
      // Two permanents of the same opponent: refused.
      let t = castIt(base(), "Grasp of Fate");
      for (let i = 0; i < 10 && t.pending?.kind === "priority"; i++) t = act(t, t.pending.player, { type: "pass" });
      expect(t.pending?.kind).toBe("choice");
      const p = t.pending;
      if (p?.kind !== "choice") return;
      expect(p.request.type === "pick" && p.request.max).toBe(2);
      expect(() => act(t, "p1", { type: "choose", values: [cub2, angel] })).toThrow();
      // One per opponent: both are exiled, then return when Grasp of Fate leaves.
      s = settle(castIt(s, "Grasp of Fate"), (req) =>
        req.type === "pick" && req.options.includes(cub3) ? [angel, cub3] : undefined,
      );
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      destroy(s, idOf(s, "p1", "battlefield", "Grasp of Fate"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Fraying Sanity: the enchanted player mills as many cards as were put into their graveyard this turn", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Island", 3), hand: ["Fraying Sanity"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Fraying Sanity", { targets: { [enchantSpec(s, "Fraying Sanity")]: ["p2"] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Fraying Sanity")]?.attachedTo).toBe("p2");
      // Two cards in p2's graveyard, one in p3's (another opponent of the Aura's controller).
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      destroy(s, idOf(s, "p3", "battlefield", "Bear Cub"));
      s = settle(s);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.players.p2?.graveyard).toHaveLength(4);
      expect(s.players.p3?.graveyard).toHaveLength(1);
    });

    it("Leyline of Anticipation: your spells as though they had flash", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Leyline of Anticipation", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Spreading Seas: the enchanted land is an Island", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Spreading Seas"] },
        p2: { battlefield: ["Ancient Tomb"] },
      });
      const tomb = idOf(s, "p2", "battlefield", "Ancient Tomb");
      s = settle(castIt(s, "Spreading Seas", { targets: { [enchantSpec(s, "Spreading Seas")]: [tomb] } }));
      expect(chars(s, tomb).subtypes).toEqual(["Island"]);
      expect(manaAbilitiesOf(s, tomb).map((a) => a.produce)).toEqual([["U"]]);
    });

    it("Dark Tutelage: the top card to hand, life loss equal to its mana value", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Dark Tutelage"], library: ["Shivan Dragon", "Forest", "Forest"] },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.players.p1?.life).toBe(14);
    });

    it("Grave Pact: one of your creatures dies, each opponent sacrifices a creature", () => {
      let s = scenario({ p1: { battlefield: ["Grave Pact", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Sanguine Bond: you gain life, the targeted opponent loses as much", () => {
      let s = scenario({ p1: { battlefield: ["Sanguine Bond"] } });
      gainLife(s, "p1", 4);
      s = settle(s);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Blood Moon and Prismatic Omen: nonbasic lands are Mountains; your lands have all basic types", () => {
      const s = scenario({
        p1: { battlefield: ["Blood Moon", "Ancient Tomb"] },
        p2: { battlefield: ["Prismatic Omen", "Forest"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Ancient Tomb")).subtypes).toEqual(["Mountain"]);
      expect(manaAbilitiesOf(s, idOf(s, "p2", "battlefield", "Forest")).map((a) => a.produce[0])).toEqual([
        "G",
        "W",
        "U",
        "B",
        "R",
      ]);
    });

    it("Fiery Emancipation: your sources deal triple damage", () => {
      let s = scenario({ p1: { battlefield: ["Fiery Emancipation", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "Shock", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Goblin Bombardment: sacrifice a creature, 1 damage", () => {
      let s = scenario({ p1: { battlefield: ["Goblin Bombardment", "Bear Cub"] } });
      s = settle(
        activate(s, idOf(s, "p1", "battlefield", "Goblin Bombardment"), {
          targets: { t: ["p2"] },
          sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
        }),
      );
      expect(s.players.p2?.life).toBe(19);
    });

    it("Mana Flare: a land tapped for mana produces one more", () => {
      let s = scenario({ p1: { battlefield: ["Mana Flare", "Forest"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Repercussion: a creature is dealt damage, its controller is dealt as much", () => {
      let s = scenario({
        p1: { battlefield: ["Repercussion", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      s = settle(castIt(s, "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Sneak Attack: a creature from hand with haste, sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Sneak Attack", "Mountain"], hand: ["Shivan Dragon"] } });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Sneak Attack")), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(chars(s, dragon).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hardened Scales, Parallel Lives and Primal Vigor: counters and tokens", () => {
      let s = scenario({
        p1: { battlefield: ["Hardened Scales", "Parallel Lives", ...lands("Mountain", 2), "Bear Cub"], hand: ["Dragon Fodder"] },
      });
      s = settle(castIt(s, "Dragon Fodder"));
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      changeCounters(s, s.objects[cub] as never, "+1/+1", 1);
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    });

    it("Unnatural Growth: at the beginning of combat, the power and toughness of your creatures double", () => {
      let s = scenario({ p1: { battlefield: ["Unnatural Growth", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, cub).power).toBe(4);
    });

    it("Utopia Sprawl: the enchanted Forest produces one more mana of the chosen color", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Utopia Sprawl"] } });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(castIt(s, "Utopia Sprawl", { targets: { [enchantSpec(s, "Utopia Sprawl")]: [forest] } }), (req) =>
        req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
      );
      (s.objects[forest] as { tapped: boolean }).tapped = false;
      s = act(s, "p1", { type: "tapForMana", source: forest, ability: 0 });
      expect([s.players.p1?.manaPool.G, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    });
  });
  describe("G4e: player rules", () => {
    it("Phyrexian Unlife: no loss at 0 life; at 0 life or less, damage gives poison counters", () => {
      const s = scenario({ p1: { life: 2, battlefield: ["Phyrexian Unlife"] } });
      const src = { defId: "test", controller: "p2", keywords: [] };
      dealDamage(s, src, "p1", 3, false);
      stateBasedActions(s);
      expect(s.players.p1?.life).toBe(-1);
      expect(s.players.p1?.lost).toBe(false);
      dealDamage(s, src, "p1", 4, false);
      expect(s.players.p1?.life).toBe(-1);
      expect(s.players.p1?.counters?.poison).toBe(4);
    });

    it("Ground Seal: on entering, draw; cards in graveyards can't be targeted by anyone", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Ground Seal"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ground Seal") }));
      expect(s.players.p1?.hand).toHaveLength(1);
      const spec = target.cardInGraveyard("t", {}, "any");
      expect(legalTargets(s, "p1", spec)).toEqual([]);
      expect(legalTargets(s, "p2", spec)).toEqual([]);
    });
  });
  describe("G4e: combat", () => {
    const goblin = (name: string) => customCard({ name, types: ["Creature"], subtypes: ["Goblin"], power: 1, toughness: 1 });
    it("Shared Animosity: +1/+0 per other attacker that shares a creature type", () => {
      let s = scenario({
        p1: { battlefield: ["Shared Animosity", goblin("Gobelin A"), goblin("Gobelin B"), "Bear Cub"] },
      });
      const a = idOf(s, "p1", "battlefield", "Gobelin A");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [a, idOf(s, "p1", "battlefield", "Gobelin B"), cub]);
      s = settle(s);
      expect(chars(s, a).power).toBe(2);
      expect(chars(s, cub).power).toBe(2);
    });

    it("Shared Animosity: a changeling shares a type only with creatures that have one (PLAN-M M7)", () => {
      const typeless = customCard({ name: "Test Typeless", types: ["Creature"], power: 1, toughness: 1 });
      let s = scenario({
        p1: { battlefield: ["Shared Animosity", "Changeling Wayfinder", goblin("Gobelin A"), typeless] },
      });
      const changeling = idOf(s, "p1", "battlefield", "Changeling Wayfinder");
      const none = idOf(s, "p1", "battlefield", "Test Typeless");
      s = attack(s, [changeling, idOf(s, "p1", "battlefield", "Gobelin A"), none]);
      s = settle(s);
      // The Goblin only: the creature without a creature type shares none.
      expect(chars(s, changeling).power).toBe(2);
      expect(chars(s, none).power).toBe(1);
    });

    it("Karmic Justice: an opposing spell destroys one of your noncreature permanents; destroy one of its permanents", () => {
      const shatter = customCard({
        name: "Test Smash",
        types: ["Instant"],
        typeLine: "Instant",
        spell: spell([{ id: "t", label: "permanent", filter: { objects: {} } }], [fx.destroy(ref.target())]),
      });
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Karmic Justice", "Mana Crypt"] },
        p2: { battlefield: ["Bear Cub"], hand: [shatter] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", "Test Smash"),
        targets: { t: [idOf(s, "p1", "battlefield", "Mana Crypt")] },
      });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      expect(idsOf(s, "p1", "graveyard", "Mana Crypt")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });
  describe("G4e: casting otherwise", () => {
    it("As Foretold: once per turn, {0} for a spell with MV at most equal to the time counters", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "As Foretold", counters: { time: 2 } }],
          hand: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"],
        },
      });
      const opt = (name: string) =>
        legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
      expect(opt("Shivan Dragon")).toBeUndefined();
      const cub = opt("Bear Cub");
      expect(cub?.type === "cast" && cub.freeAvailable).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub"), free: true }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(opt("Llanowar Elves")).toBeUndefined();
    });

    it("As Foretold: a spell cast from a zone other than hand (Quilled Greatwurm from the graveyard)", () => {
      let s = scenario({
        p1: {
          battlefield: [
            { name: "As Foretold", counters: { time: 6 } },
            { name: "Bear Cub", counters: { "+1/+1": 6 } },
          ],
          graveyard: ["Quilled Greatwurm"],
        },
      });
      const wurm = idOf(s, "p1", "graveyard", "Quilled Greatwurm");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === wurm);
      expect(opt?.type === "cast" && opt.freeAvailable).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: wurm, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Quilled Greatwurm")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });
  describe("G4e: library and drawing", () => {
    const discardFrom = (s: ReturnType<typeof scenario>, p: string, id: string) =>
      announceDiscard(s, p, moveDiscarded(s, p, id, true));
    it("Necropotence: no draw step; a discarded card is exiled; 1 life: an exiled card returns at the end step", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Necropotence"], library: ["Shock", "Forest", "Island"] },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.players.p1?.hand).toHaveLength(0);
      const necro = idOf(s, "p1", "battlefield", "Necropotence");
      s = settle(act(s, "p1", { type: "activate", source: necro, ability: 2 }));
      expect(s.players.p1?.life).toBe(19);
      expect(exiled(s, "Shock")).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      );
      s = settle(s);
      expect(idsOf(s, "p1", "hand", "Shock")).toHaveLength(1);
      discardFrom(s, "p1", idOf(s, "p1", "hand", "Shock"));
      s = settle(s);
      expect(exiled(s, "Shock")).toHaveLength(1);
    });
  });

  it("Raid Bombardment: whenever a creature you control with power 2 or less attacks, 1 damage to the player it attacks", () => {
    let s = scenario({ p1: { battlefield: ["Raid Bombardment", "Bear Cub", "Serra Angel"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    // 1 (only Bear Cub triggers) + 2 + 4 combat.
    expect(s.players.p2?.life).toBe(13);
  });

  it("Raid Bombardment: a creature attacking a planeswalker damages it (not its controller)", () => {
    let s = scenario({
      p1: { battlefield: ["Raid Bombardment", "Bear Cub"] },
      p2: { battlefield: [{ name: "Ajani, Caller of the Pride", counters: { loyalty: 4 } }] },
    });
    const ajani = idOf(s, "p2", "battlefield", "Ajani, Caller of the Pride");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: ajani }],
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    // 1 damage from the trigger and 2 from combat, all to Ajani (4 -> 1); p2 loses nothing.
    expect(s.objects[ajani]?.counters.loyalty).toBe(1);
    expect(s.players.p2?.life).toBe(20);
  });
});

/** Id of an Aura's enchant target. */
function enchantSpec(s: ReturnType<typeof scenario>, name: string): string {
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
  return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
}

describe('PLAN-A A3: "nonbasic lands are Mountains" (305.7)', () => {
  /** Nonbasic land creature (Forest Dryad) with its own static ability: "other creatures get +1/+1". */
  const DRYAD = customCard({
    name: "Test Dryad Grove",
    typeLine: "Land Creature — Forest Dryad",
    types: ["Land", "Creature"],
    subtypes: ["Forest", "Dryad"],
    power: 1,
    toughness: 1,
    abilities: [staticAbility({ types: ["Creature"], other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" })],
  });

  it("Blood Moon: only land types are replaced (land creature, Clue artifact land)", () => {
    const s = scenario({ p1: { battlefield: ["Blood Moon", DRYAD, "Scene of the Crime"] } });
    const dryad = idOf(s, "p1", "battlefield", "Test Dryad Grove");
    expect(chars(s, dryad).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(s, dryad).subtypes.sort()).toEqual(["Dryad", "Mountain"]);
    expect(manaAbilitiesOf(s, dryad).flatMap((a) => a.produce)).toEqual(["R"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Scene of the Crime")).subtypes.sort()).toEqual(["Clue", "Mountain"]);
  });

  it("Blood Moon: the land also loses its static abilities", () => {
    const s = scenario({ p1: { battlefield: ["Blood Moon", DRYAD, "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
    // Without Blood Moon, the static ability applies.
    const t = scenario({ p1: { battlefield: [DRYAD, "Bear Cub"] } });
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(3);
  });
});

describe("WOT reprints, PLAN-A A4a", () => {
  it("Karmic Justice: with several players, the destroyed permanent is the destroying opponent's", () => {
    const shatter = customCard({
      name: "Test Shatter",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell([target.permanent("t", ["Artifact"], {}, "artefact")], [fx.destroy(ref.target())]),
    });
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Karmic Justice", "Fishing Pole"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"], hand: [shatter] },
      p3: { battlefield: ["Shivan Dragon"] },
    });
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Test Shatter"),
      targets: { t: [idOf(s, "p1", "battlefield", "Fishing Pole")] },
    });
    const offered: (string | undefined)[][] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") offered.push(namesIn(cur, req.options));
      if (req.intent === "may") return [1];
      return undefined;
    });
    expect(offered.map((x) => [...x].sort())).toEqual([["Bear Cub", "Serra Angel"]]);
    expect(idsOf(s, "p3", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(2);
  });
});

describe("Intruder Alarm (PLAN-H, H8b)", () => {
  it("creatures don't untap during their controller's untap step (lands do); a creature that enters untaps them all", () => {
    let s = scenario({
      active: "p2",
      p1: {
        battlefield: ["Intruder Alarm", { name: "Bear Cub", tapped: true }, { name: "Forest", tapped: true }],
        hand: ["Llanowar Elves"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect([s.objects[cub]?.tapped, s.objects[forest]?.tapped]).toEqual([true, false]);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") }));
    expect(s.objects[cub]?.tapped).toBe(false);
  });
});

describe("Enchanting Tales (PLAN-L, L11)", () => {
  type S = ReturnType<typeof scenario>;
  const castIt = (s: S, name: string, extra: object = {}, player = "p1") =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const on = (s: S, p: string, name: string) => idOf(s, p, "battlefield", name);
  const abilityOf = (s: S, source: string, n = 0) =>
    legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === source)[n];
  const activate = (s: S, source: string, n = 0, extra: object = {}) => {
    const ab = abilityOf(s, source, n);
    return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : n, ...extra });
  };
  const yes = (req: { intent?: string; type: string }) => (req.intent === "may" || req.type === "yesNo" ? [1] : undefined);
  const toMyMain = (s: S) => advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");

  it("Defense of the Heart: at your upkeep, if an opponent controls three creatures, sacrifice it and put up to two creatures from your library onto the battlefield", () => {
    const setup = (cubs: number) =>
      scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Defense of the Heart"], library: ["Forest", "Shivan Dragon", "Serra Angel", "Forest"] },
        p2: { battlefield: lands("Bear Cub", cubs) },
      });
    let s = setup(3);
    s = settle(
      advanceUntil(s, (x) => x.turn.active === "p1" && x.stack.length > 0),
      (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => chars(cur, id).types.includes("Creature")).slice(0, 2) : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Defense of the Heart")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    const t = toMyMain(setup(2));
    expect(idsOf(t, "p1", "battlefield", "Defense of the Heart")).toHaveLength(1);
  });

  it("Greater Auramancy: other enchantments you control and your enchanted creatures have shroud", () => {
    let s = scenario({
      p1: {
        battlefield: ["Greater Auramancy", "Ghostly Prison", "Bear Cub", "Llanowar Elves", "Mountain"],
        hand: ["Dragon Mantle"],
      },
      p2: { battlefield: ["Ghostly Prison"] },
    });
    const kw = (id: string) => chars(s, id).keywords.includes("shroud");
    const cub = on(s, "p1", "Bear Cub");
    expect([kw(on(s, "p1", "Ghostly Prison")), kw(on(s, "p1", "Greater Auramancy")), kw(on(s, "p2", "Ghostly Prison"))]).toEqual([
      true,
      false,
      false,
    ]);
    expect(kw(cub)).toBe(false);
    s = settle(castIt(s, "Dragon Mantle", { targets: { [enchantSpec(s, "Dragon Mantle")]: [cub] } }));
    expect([kw(cub), kw(on(s, "p1", "Llanowar Elves"))]).toEqual([true, false]);
  });

  it("Kindred Discovery: a creature of the chosen type you control enters or attacks, draw a card", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 5), ...lands("Forest", 3)],
        hand: ["Kindred Discovery", "Bear Cub", "Llanowar Elves"],
      },
    });
    s = settle(castIt(s, "Kindred Discovery"), (req, p, cur) => picking(["Bear"])(req, p, cur));
    s = settle(castIt(s, "Llanowar Elves"));
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(castIt(s, "Bear Cub"));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    const cub = on(s, "p1", "Bear Cub");
    (s.objects[cub] as { controlledSince: number }).controlledSince = 0;
    s = settle(attack(s, [cub]));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Rhystic Study: an opponent casts a spell, you may draw unless they pay {1}", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Rhystic Study"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = settle(castIt(s, "Shock", { targets: { t: ["p1"] } }, "p2"), yes);
    expect(s.players.p1?.hand).toHaveLength(1);
    // With {1} left, they pay (suggested answer): no draw.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Rhystic Study"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock"] },
    });
    t = settle(castIt(t, "Shock", { targets: { t: ["p1"] } }, "p2"), yes);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(idsOf(t, "p2", "battlefield", "Mountain").every((id) => t.objects[id]?.tapped)).toBe(true);
    // Your own spells don't trigger it.
    let u = scenario({ p1: { battlefield: ["Rhystic Study", "Mountain"], hand: ["Shock"] } });
    u = settle(castIt(u, "Shock", { targets: { t: ["p2"] } }), yes);
    expect(u.players.p1?.hand).toHaveLength(0);
  });

  it("Aggravated Assault: as a sorcery, untap your creatures; an additional combat and main phase after this one", () => {
    let s = scenario({ p1: { battlefield: ["Aggravated Assault", "Bear Cub", ...lands("Mountain", 5)] } });
    const cub = on(s, "p1", "Bear Cub");
    const assault = on(s, "p1", "Aggravated Assault");
    s = throughCombat(attack(s, [cub]));
    expect([s.players.p2?.life, s.objects[cub]?.tapped]).toEqual([18, true]);
    s = settle(activate(s, assault));
    expect(s.objects[cub]?.tapped).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cub, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0);
    expect(s.players.p2?.life).toBe(16);
    expect(s.turn.active).toBe("p1");
    // Not during combat (sorcery speed).
    let t = scenario({ p1: { battlefield: ["Aggravated Assault", "Bear Cub", ...lands("Mountain", 5)] } });
    t = attack(t, [on(t, "p1", "Bear Cub")]);
    expect(t.pending?.kind === "priority" && t.pending.player).toBe("p1");
    expect(abilityOf(t, on(t, "p1", "Aggravated Assault"))).toBeUndefined();
  });

  it("Dawn of Hope: you gain life, you may pay {2} to draw; {3}{W}: a 1/1 Soldier with lifelink", () => {
    let s = scenario({ p1: { battlefield: ["Dawn of Hope", ...lands("Plains", 4)], library: lands("Island", 3) } });
    gainLife(s, "p1", 2);
    s = settle(s, yes);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
    let t = scenario({ p1: { battlefield: ["Dawn of Hope", ...lands("Plains", 4)] } });
    t = settle(activate(t, on(t, "p1", "Dawn of Hope")));
    const soldier = idOf(t, "p1", "battlefield", "Soldier");
    expect([chars(t, soldier).power, chars(t, soldier).toughness, chars(t, soldier).keywords]).toEqual([1, 1, ["lifelink"]]);
  });

  it("Leyline of Abundance: a creature tapped for mana adds an additional {G} (not a land); {6}{G}{G}: a +1/+1 counter on each of your creatures", () => {
    let s = scenario({ p1: { battlefield: ["Leyline of Abundance", "Llanowar Elves", "Forest"] } });
    s = act(s, "p1", { type: "tapForMana", source: on(s, "p1", "Llanowar Elves"), ability: 0 });
    expect(s.players.p1?.manaPool.G).toBe(2);
    s = act(s, "p1", { type: "tapForMana", source: on(s, "p1", "Forest"), ability: 0 });
    expect(s.players.p1?.manaPool.G).toBe(3);
    let t = scenario({
      p1: { battlefield: ["Leyline of Abundance", "Bear Cub", ...lands("Forest", 8)] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    t = settle(activate(t, on(t, "p1", "Leyline of Abundance")));
    expect(t.objects[on(t, "p1", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(t.objects[on(t, "p2", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Leyline of Lightning: you cast a spell, you may pay {1} for 1 damage to a player or planeswalker", () => {
    let s = scenario({ p1: { battlefield: ["Leyline of Lightning", ...lands("Mountain", 2)], hand: ["Shock"] } });
    s = settle(castIt(s, "Shock", { targets: { t: ["p2"] } }), (req, p, cur) => yes(req) ?? picking(["p2"])(req, p, cur));
    expect(s.players.p2?.life).toBe(17);
    expect(idsOf(s, "p1", "battlefield", "Mountain").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Leyline of Sanctity: you have hexproof; from the opening hand, the game may begin with it on the battlefield", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Leyline of Sanctity"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    expect(() => castIt(s, "Shock", { targets: { t: ["p1"] } }, "p2")).toThrow();
    expect(() => castIt(s, "Shock", { targets: { t: ["p2"] } }, "p2")).not.toThrow();
    // Not against your own spells.
    const own = scenario({ p1: { battlefield: ["Leyline of Sanctity", "Mountain"], hand: ["Shock"] } });
    expect(() => castIt(own, "Shock", { targets: { t: ["p1"] } })).not.toThrow();
    const deck = (extra: string) => [extra, ...Array(59).fill("Forest")].map((n) => card(n));
    let g!: S;
    for (let seed = 1; seed < 200; seed++) {
      g = createGame({
        seed,
        startingPlayer: "p1",
        players: [
          { id: "p1", name: "A", deck: deck("Leyline of Sanctity") },
          { id: "p2", name: "B", deck: deck("Forest") },
        ],
      }).state;
      if (idsOf(g, "p1", "hand", "Leyline of Sanctity").length) break;
    }
    for (let i = 0; i < 4 && g.pending?.kind === "mulligan"; i++) g = act(g, g.pending.player, { type: "keep" });
    expect(g.pending?.kind === "choice" && g.pending.request.intent).toBe("leyline");
    g = act(g, "p1", { type: "choose", values: idsOf(g, "p1", "hand", "Leyline of Sanctity") });
    expect(idsOf(g, "p1", "battlefield", "Leyline of Sanctity")).toHaveLength(1);
  });

  it("Nature's Will: your creatures deal combat damage to a player, tap their lands and untap yours", () => {
    let s = scenario({
      p1: { battlefield: ["Nature's Will", "Bear Cub", { name: "Forest", tapped: true }, { name: "Forest", tapped: true }] },
      p2: { battlefield: lands("Island", 2) },
    });
    s = throughCombat(attack(s, [on(s, "p1", "Bear Cub")]));
    expect(s.players.p2?.life).toBe(18);
    expect(idsOf(s, "p2", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Forest").some((id) => s.objects[id]?.tapped)).toBe(false);
  });

  it("Oversold Cemetery: at your upkeep, with four creature cards in your graveyard, you may return one to hand", () => {
    const setup = (n: number) =>
      scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Oversold Cemetery"], graveyard: ["Shivan Dragon", ...lands("Bear Cub", n - 1), "Shock"] },
      });
    let s = setup(4);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.stack.length > 0);
    s = toMyMain(
      settle(s, (req, _p, cur) => yes(req) ?? (req.type === "pick" ? pickNamed(cur, req, "Shivan Dragon") : undefined)),
    );
    expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
    const t = toMyMain(setup(3));
    expect(idsOf(t, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Waste Not: an opponent discards a creature, a 2/2 Zombie; a land, {B}{B}; another card, draw", () => {
    let s = scenario({
      p1: { battlefield: ["Waste Not"], library: lands("Island", 3) },
      p2: { hand: ["Bear Cub", "Forest", "Shock"] },
    });
    const discard = (name: string) => {
      announceDiscard(s, "p2", moveDiscarded(s, "p2", idOf(s, "p2", "hand", name), true));
      s = settle(s);
    };
    discard("Bear Cub");
    const zombie = idOf(s, "p1", "battlefield", "Zombie");
    expect([chars(s, zombie).power, chars(s, zombie).toughness]).toEqual([2, 2]);
    discard("Forest");
    expect(s.players.p1?.manaPool.B).toBe(2);
    discard("Shock");
    expect(s.players.p1?.hand).toHaveLength(1);
    // Your own discards: nothing.
    let t = scenario({ p1: { battlefield: ["Waste Not"], hand: ["Bear Cub"] } });
    announceDiscard(t, "p1", moveDiscarded(t, "p1", idOf(t, "p1", "hand", "Bear Cub"), true));
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Zombie")).toHaveLength(0);
  });

  it("Compulsion: {1}{U}, discard a card: draw; {1}{U}, sacrifice it: draw", () => {
    let s = scenario({
      p1: { battlefield: ["Compulsion", ...lands("Island", 4)], hand: ["Shock"], library: lands("Forest", 3) },
    });
    const comp = on(s, "p1", "Compulsion");
    s = settle(activate(s, comp, 0, { discard: [idOf(s, "p1", "hand", "Shock")] }));
    expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    const sac = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === comp)[1];
    s = settle(act(s, "p1", { type: "activate", source: comp, ability: sac?.type === "activate" ? sac.ability : 1 }));
    expect(idsOf(s, "p1", "graveyard", "Compulsion")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it('Dragon Mantle: on entering, draw; the enchanted creature has "{R}: +1/+0"', () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Dragon Mantle"], library: lands("Island", 2) },
    });
    const cub = on(s, "p1", "Bear Cub");
    s = settle(castIt(s, "Dragon Mantle", { targets: { [enchantSpec(s, "Dragon Mantle")]: [cub] } }));
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(activate(s, cub));
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 2]);
  });

  it("Knightly Valor: on entering, a 2/2 Knight with vigilance; the enchanted creature gets +2/+2 and vigilance", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Knightly Valor"] } });
    const cub = on(s, "p1", "Bear Cub");
    s = settle(castIt(s, "Knightly Valor", { targets: { [enchantSpec(s, "Knightly Valor")]: [cub] } }));
    expect([chars(s, cub).power, chars(s, cub).toughness, chars(s, cub).keywords.includes("vigilance")]).toEqual([4, 4, true]);
    const knight = idOf(s, "p1", "battlefield", "Knight");
    expect([chars(s, knight).power, chars(s, knight).toughness, chars(s, knight).keywords]).toEqual([2, 2, ["vigilance"]]);
  });

  it("Season of Growth: a creature you control enters, scry 1; you cast a spell that targets a creature you control, draw", () => {
    let s = scenario({
      p1: {
        battlefield: ["Season of Growth", ...lands("Forest", 2), ...lands("Mountain", 2)],
        hand: ["Bear Cub", "Shock", "Shock"],
        library: ["Shivan Dragon", "Island", "Island"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const scried: (string | undefined)[][] = [];
    s = settle(castIt(s, "Bear Cub"), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "scryBottom") return undefined;
      scried.push(namesIn(cur, req.options));
      return req.options;
    });
    expect(scried).toEqual([["Shivan Dragon"]]);
    s = settle(castIt(s, "Shock", { targets: { t: [on(s, "p2", "Serra Angel")] } }));
    expect(s.players.p1?.hand).toHaveLength(1);
    s = settle(castIt(s, "Shock", { targets: { t: [on(s, "p1", "Bear Cub")] } }));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Stab Wound: the enchanted creature gets -2/-2; at the upkeep of its controller, they lose 2 life", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Stab Wound"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = on(s, "p2", "Serra Angel");
    s = settle(castIt(s, "Stab Wound", { targets: { [enchantSpec(s, "Stab Wound")]: [angel] } }));
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 18]);
    s = toMyMain(s);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 18]);
  });
});
