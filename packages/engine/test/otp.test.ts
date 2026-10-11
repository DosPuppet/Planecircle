/** Breaking News (OTP): card rules tests (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, gainLife, loseLife } from "../src/actions";
import { castOption as defOption } from "../src/cardDef";
import { fx, ref, spell, target } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars, decider } from "../src/state";
import { legalTargets } from "../src/targets";
import { plainText } from "../src/text";
import { logTurnEvent } from "../src/turnlog";
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
  passUntil,
  pickNamed,
  scenario,
  settle,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = ReturnType<typeof scenario>;
const castOption = (s: S, card: string, player = "p1") =>
  legalActions(s, player).find((a) => a.type === "cast" && a.card === card);

describe("Breaking News", () => {
  describe("Escalate (702.120): Collective Defiance", () => {
    it("one mode at normal cost; each extra mode costs {1}", () => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const opt = castOption(s, idOf(s, "p1", "hand", "Collective Defiance"));
      // Four Mountains: one mode ({1}{R}{R}) or two ({1}{R}{R} + {1}); not all three.
      expect(opt?.type === "cast" && opt.modes.map((m) => m.label?.split(" + ").length)).toEqual([1, 1, 2, 1, 2, 2]);
    });

    it("two modes: 4 damage to the creature and 3 to the opponent", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Collective Defiance"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Collective Defiance");
      const opt = castOption(s, card);
      const both =
        opt?.type === "cast"
          ? opt.modes.find((m) => plainText(m.label ?? "").includes("4 damage") && plainText(m.label ?? "").includes("3 damage"))
          : undefined;
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card, mode: both?.index, targets: { c: [bear], o: ["p2"] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(17);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(4);
    });

    it("the targeted player discards their hand, then draws that many cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Collective Defiance"] },
        p2: { hand: ["Bear Cub", "Bear Cub", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Collective Defiance"), mode: 0, targets: { p: ["p2"] } }),
      );
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Forest", "Forest"]);
      expect(s.players.p2?.graveyard).toHaveLength(3);
    });
  });

  describe("Cleave (702.148): Fierce Retribution", () => {
    it("for {1}{W}, only an attacking creature; cleaved for {5}{W}, any creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const opt = castOption(s, card);
      // No creature attacks: only the cleaved mode has a target.
      expect(opt?.type === "cast" && opt.modes.map((m) => plainText(m.label ?? ""))).toEqual(["Cleave — {5}{W}"]);
      expect(() => act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(6);
    });

    it("for {1}{W}, destroys the attacking creature", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Fierce Retribution"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = attackWith(s, bear);
      const card = idOf(s, "p1", "hand", "Fierce Retribution");
      s = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Skewer the Critics", () => {
    it("spectacle {R} after an opponent loses life; 3 damage to any target", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 1), hand: ["Skewer the Critics"] } });
      const card = idOf(s, "p1", "hand", "Skewer the Critics");
      expect(castOption(s, card)).toBeUndefined();
      loseLife(s, "p2", 2);
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("G6: Breaking News", () => {
    const castIt = (s: S, name: string, extra: object = {}, player = "p1") =>
      act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
    const spellOn = (s: S) => s.stack[s.stack.length - 1]?.id as string;
    /** p2 casts a spell, then p1 gets priority. */
    const opponentCasts = (s: S, name: string, extra: object = {}) => act(castIt(s, name, extra, "p2"), "p2", { type: "pass" });
    const enchantTarget = (s: S, name: string) => {
      const opt = castOption(s, idOf(s, "p1", "hand", name));
      return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
    };

    it("Journey to Nowhere: the exiled creature returns when the enchantment leaves", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Journey to Nowhere"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Journey to Nowhere"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Journey to Nowhere"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Leyline Binding: {1} less per basic land type among your lands", () => {
      const s = scenario({ p1: { battlefield: ["Plains", "Island", "Forest", "Swamp"], hand: ["Leyline Binding"] } });
      expect(castOption(s, idOf(s, "p1", "hand", "Leyline Binding"))).toBeDefined();
    });

    it("Pariah: damage that would be dealt to you is dealt to the enchanted creature instead", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Pariah"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Pariah", { targets: { [enchantTarget(s, "Pariah")]: [cub] } }));
      dealDamage(s, { defId: "test", controller: "p2", keywords: [] } as never, "p1", 2, false);
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[cub]?.damage).toBe(2);
    });

    it("Path to Exile: the creature is exiled; its controller may search for a basic land, tapped", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Path to Exile"] },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Bear Cub"] },
      });
      s = settle(castIt(s, "Path to Exile", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Archive Trap: free if an opponent searched their library this turn", () => {
      const s = scenario({ p1: { hand: ["Archive Trap"] }, p2: { library: lands("Forest", 20) } });
      expect(castOption(s, idOf(s, "p1", "hand", "Archive Trap"))).toBeUndefined();
      logTurnEvent(s, { e: "search", player: "p2" });
      s.version += 1;
      let t = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Archive Trap"), alternative: true, targets: { t: ["p2"] } }),
      );
      expect(t.players.p2?.graveyard).toHaveLength(13);
      t = s;
    });

    it("Mana Drain: counters; {C} equal to the spell's mana value at your next main phase", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Mana Drain"], library: lands("Island", 5) },
        p2: { battlefield: lands("Forest", 7), hand: ["Regal Force"] },
      });
      s = opponentCasts(s, "Regal Force");
      s = settle(castIt(s, "Mana Drain", { targets: { t: [spellOn(s)] } }));
      expect(idsOf(s, "p2", "graveyard", "Regal Force")).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.pending?.kind === "priority",
      );
      expect(s.players.p1?.manaPool.C).toBe(7);
    });

    it("Thoughtseize: you choose a nonland card from their hand; you lose 2 life", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Thoughtseize"] },
        p2: { hand: ["Forest", "Shivan Dragon", "Shock"] },
      });
      s = settle(castIt(s, "Thoughtseize", { targets: { t: ["p2"] } }), (req) => pickNamed(s, req, "Shivan Dragon"));
      expect([idsOf(s, "p2", "graveyard", "Shivan Dragon").length, s.players.p1?.life]).toEqual([1, 18]);
    });

    it("Crackle with Power: 5X damage to each of up to X targets", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Crackle with Power"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Crackle with Power", { x: 2, targets: { t: ["p2", idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect([s.players.p2?.life, idsOf(s, "p2", "graveyard", "Bear Cub").length]).toEqual([10, 1]);
    });

    it("Fling: damage equal to the sacrificed creature's power", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Shivan Dragon"], hand: ["Fling"] } });
      s = settle(castIt(s, "Fling", { targets: { t: ["p2"] }, sacrifice: [idOf(s, "p1", "battlefield", "Shivan Dragon")] }));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Skullcrack: nobody gains life this turn; 3 damage", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Skullcrack"] } });
      s = settle(castIt(s, "Skullcrack", { targets: { t: ["p2"] } }));
      gainLife(s, "p2", 5);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Primal Command: two modes of your choice", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Primal Command"], library: ["Bear Cub", "Forest"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      const opt = castOption(s, idOf(s, "p1", "hand", "Primal Command"));
      expect(opt?.type === "cast" && opt.modes.length).toBe(6);
      const pair =
        opt?.type === "cast"
          ? opt.modes.find(
              (m) => plainText(m.label ?? "").startsWith("Target player gains") && plainText(m.label ?? "").includes("Search"),
            )
          : undefined;
      s = settle(castIt(s, "Primal Command", { mode: pair?.index, targets: { g: ["p1"] } }));
      expect([s.players.p1?.life, idsOf(s, "p1", "hand", "Bear Cub").length]).toEqual([27, 1]);
    });

    it("Back for More: the creature returns, then fights an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Swamp"], hand: ["Back for More"], graveyard: ["Shivan Dragon"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Back for More", { targets: { t: [idOf(s, "p1", "graveyard", "Shivan Dragon")] } }), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Crime // Punishment: Punishment destroys artifacts, creatures and enchantments with mana value X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Swamp"], hand: ["Crime // Punishment"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Ghostly Prison"] },
      });
      const card = idOf(s, "p1", "hand", "Crime // Punishment");
      const punish = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Punishment");
      s = settle(act(s, "p1", { type: "cast", card, face: punish?.type === "cast" ? punish.face : 1, x: 2 }));
      expect(
        s.battlefield
          .filter((id) => s.objects[id]?.controller === "p2")
          .map((id) => nameOf(s, id))
          .sort(),
      ).toEqual(["Ghostly Prison", "Llanowar Elves"]);
    });

    it("Decimate: an artifact, a creature, an enchantment and a land", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Decimate"] },
        p2: { battlefield: ["Mana Crypt", "Bear Cub", "Ghostly Prison", "Plains"] },
      });
      const t = (n: string) => [idOf(s, "p2", "battlefield", n)];
      s = settle(
        castIt(s, "Decimate", { targets: { a: t("Mana Crypt"), c: t("Bear Cub"), e: t("Ghostly Prison"), l: t("Plains") } }),
      );
      expect(s.players.p2?.graveyard).toHaveLength(4);
    });

    it("Detention Sphere: exiles the targeted permanent and its namesakes, until it leaves", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Island"], hand: ["Detention Sphere"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves"] },
      });
      const cub = idsOf(s, "p2", "battlefield", "Bear Cub")[0] as string;
      s = settle(castIt(s, "Detention Sphere"), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub", "Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Detention Sphere"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(2);
    });

    it("Ionize: counters and 2 damage to the spell's controller", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Island", 2), "Mountain"], hand: ["Ionize"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = opponentCasts(s, "Bear Cub");
      s = settle(castIt(s, "Ionize", { targets: { t: [spellOn(s)] } }));
      expect([s.players.p2?.life, idsOf(s, "p2", "graveyard", "Bear Cub").length]).toEqual([18, 1]);
    });

    it("Oko: +1, the targeted artifact or creature becomes a green 3/3 Elk with no abilities", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Oko, Thief of Crowns", counters: { loyalty: 4 } }] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const oko = idOf(s, "p1", "battlefield", "Oko, Thief of Crowns");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const ab = legalActions(s, "p1").find(
        (a) => a.type === "activate" && a.source === oko && plainText(a.label ?? "").startsWith("+1"),
      );
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: oko,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: [dragon] },
        }),
      );
      const c = chars(s, dragon);
      expect([c.power, c.toughness, c.subtypes, c.colors, c.keywords.includes("flying")]).toEqual([3, 3, ["Elk"], ["G"], false]);
    });

    it("Villainous Wealth: the opponent exiles X cards; you cast for free those with mana value X or less", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Island", "Swamp"], hand: ["Villainous Wealth"] },
        p2: { library: ["Bear Cub", "Shivan Dragon", "Forest"] },
      });
      s = untilCastNow(castIt(s, "Villainous Wealth", { x: 2, targets: { t: ["p2"] } }));
      expect(castNowOf(s)?.cards.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(false);
      const cub = castNowOf(s)?.cards.find((id) => nameOf(s, id) === "Bear Cub") as string;
      s = settle(act(s, "p1", { type: "cast", card: cub, free: true }));
      expect(s.battlefield.some((id) => nameOf(s, id) === "Bear Cub" && s.objects[id]?.controller === "p1")).toBe(true);
    });

    it("Voidslime: counters a triggered ability", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Soul Warden", ...lands("Island", 2), "Forest"], hand: ["Voidslime"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = castIt(s, "Bear Cub", {}, "p2");
      s = passUntil(s, (x) => x.stack.some((i) => i.kind === "ability") && x.pending?.player === "p1");
      const trig = s.stack.find((i) => i.kind === "ability")?.id as string;
      s = settle(castIt(s, "Voidslime", { targets: { t: [trig] } }));
      expect(s.players.p1?.life).toBe(20);
    });

    it("Mindslaver: you control the targeted player's next turn", () => {
      let s = scenario({ p1: { battlefield: ["Mindslaver", ...lands("Plains", 4)] } });
      const slaver = idOf(s, "p1", "battlefield", "Mindslaver");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === slaver);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: slaver,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: ["p2"] },
        }),
      );
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(decider(s)).toBe("p1");
    });
  });
  describe("G4e: player rules", () => {
    it("Surgical Extraction: a card in a graveyard (not a basic land) and its namesakes, exiled", () => {
      let s = scenario({
        p1: { hand: ["Surgical Extraction"] },
        p2: { graveyard: ["Shock", "Forest"], hand: ["Shock"], library: ["Shock", "Mountain"] },
      });
      const forest = idOf(s, "p2", "graveyard", "Forest");
      expect(legalTargets(s, "p1", target.cardInGraveyard("t", { basic: false }, "any"))).not.toContain(forest);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Surgical Extraction"),
          targets: { t: [idOf(s, "p2", "graveyard", "Shock")] },
        }),
      );
      expect(s.players.p1?.life).toBe(18);
      expect(exiled(s, "Shock")).toHaveLength(3);
      expect(s.players.p2?.hand).toHaveLength(0);
    });
  });
  describe("G4e: combat", () => {
    it("Fell the Mighty: destroys creatures with power greater than the target's", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Llanowar Elves"], hand: ["Fell the Mighty"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fell the Mighty"), targets: { t: [elves] } }));
      expect(s.objects[elves]?.zone).toBe("battlefield");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Ride Down: destroys the blocker; the creatures it was blocking gain trample", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain", "Plains"], hand: ["Ride Down"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = attack(s, [cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: cub }] });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ride Down"), targets: { t: [elves] } }));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(chars(s, cub).keywords).toContain("trample");
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Outlaws' Merriment: at your upkeep, one of the three Human tokens, at random", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Outlaws' Merriment"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const humans = s.battlefield.filter((id) =>
        ["Human Warrior", "Human Cleric", "Human Rogue"].includes(nameOf(s, id) as string),
      );
      expect(humans).toHaveLength(1);
      expect(chars(s, humans[0] as string).keywords).toContain("haste");
    });
  });
  describe("G4e: casting otherwise", () => {
    it("Terminal Agony: madness, discarded it goes to exile and is cast for its madness cost", () => {
      const discarder = customCard({
        name: "Test discard",
        types: ["Sorcery"],
        typeLine: "Sorcery",
        spell: spell([], [fx.discard(1)]),
      });
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain"], hand: [discarder, "Terminal Agony"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = untilCastNow(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test discard") }));
      const agony = castNowOf(s)?.cards[0] as string;
      expect(s.objects[agony]?.zone).toBe("exile");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: agony, targets: { t: [cub] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Terminal Agony")).toHaveLength(1);
    });

    it("Commandeer: by exiling two blue cards, gain control of a noncreature spell and change its target", () => {
      const blue = (name: string) => customCard({ name, types: ["Instant"], typeLine: "Instant", colors: ["U"] });
      let s = scenario({
        active: "p2",
        p1: { hand: ["Commandeer", blue("Bleu A"), blue("Bleu B")] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commandeer"), alternative: true, targets: { t: [shock] } }),
        (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined),
      );
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });
  describe("G4e: library and drawing", () => {
    it("Grindstone: the player mills two cards, and repeats while they share a color", () => {
      let s = scenario({
        p1: { battlefield: ["Grindstone", ...lands("Mountain", 3)] },
        p2: { library: ["Shock", "Lightning Strike", "Bear Cub", "Shivan Dragon", "Forest"] },
      });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Grindstone"),
          ability: 0,
          targets: { t: ["p2"] },
        }),
      );
      expect(s.players.p2?.graveyard).toHaveLength(4);
      expect(s.players.p2?.library.map((id) => nameOf(s, id))).toEqual(["Forest"]);
    });
  });
  describe("G4e: exile and copies", () => {
    it("Fractured Identity: exiles the permanent; each other player creates a copy of it", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Fractured Identity"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fractured Identity"), targets: { t: [dragon] } }));
      expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
      const copy = s.battlefield.find((id) => s.objects[id]?.isToken && chars(s, id).name === "Shivan Dragon");
      expect(copy && s.objects[copy]?.controller).toBe("p1");
    });

    it("Unlicensed Hearse: exiles up to two cards from a graveyard; P/T equal to the cards exiled with it", () => {
      let s = scenario({ p1: { battlefield: ["Unlicensed Hearse"] }, p2: { graveyard: ["Shock", "Bear Cub"] } });
      const hearse = idOf(s, "p1", "battlefield", "Unlicensed Hearse");
      expect(chars(s, hearse).power).toBe(0);
      const gy = s.players.p2?.graveyard ?? [];
      s = settle(act(s, "p1", { type: "activate", source: hearse, ability: 0, targets: { t: [...gy] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(chars(s, hearse).power).toBe(2);
      expect(chars(s, hearse).toughness).toBe(2);
    });

    it("Unlicensed Hearse: both cards come from the same graveyard", () => {
      const s = scenario({
        p1: { battlefield: ["Unlicensed Hearse"], graveyard: ["Opt"] },
        p2: { graveyard: ["Shock"] },
      });
      const hearse = idOf(s, "p1", "battlefield", "Unlicensed Hearse");
      const both = [...(s.players.p1?.graveyard ?? []), ...(s.players.p2?.graveyard ?? [])];
      expect(() => act(s, "p1", { type: "activate", source: hearse, ability: 0, targets: { t: both } })).toThrow();
    });

    it("Indomitable Creativity: destroys X artifacts or creatures; their controller reveals up to one artifact or creature and puts it onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Indomitable Creativity"] },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Shivan Dragon", "Island"] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indomitable Creativity"), x: 1, targets: { t: [cub] } }),
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Forest")).toHaveLength(1);
    });

    it("Indomitable Creativity: it's the controller of the destroyed permanent who reveals, not its owner", () => {
      // Your Bear Cub controlled by p2.
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Bear Cub"],
          hand: ["Indomitable Creativity"],
          library: ["Forest", "Serra Angel"],
        },
        p2: { library: ["Island", "Shivan Dragon"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      steal(s, cub, "p2");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indomitable Creativity"), x: 1, targets: { t: [cub] } }),
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

/** p2 attacks p1 with the creature, then p1 gets priority at declare attackers. */
function attackWith(s: S, id: string): S {
  let cur = s;
  for (let i = 0; i < 50 && cur.pending?.kind !== "declareAttackers"; i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  cur = act(cur, "p2", { type: "declareAttackers", attackers: [{ id, defender: "p1" }] });
  for (let i = 0; i < 10 && !(cur.pending?.kind === "priority" && cur.pending.player === "p1"); i++) {
    const p = cur.pending;
    if (p?.kind !== "priority") break;
    cur = act(cur, p.player, { type: "pass" });
  }
  return cur;
}

describe("Reprints, PLAN-A A4a", () => {
  it('Commandeer: "you may choose new targets" for a spell with several targets', () => {
    const blue = (name: string) => customCard({ name, types: ["Instant"], typeLine: "Instant", colors: ["U"] });
    const twinBolt = customCard({
      name: "Test Twin Bolt",
      types: ["Instant"],
      typeLine: "Instant",
      spell: spell([target.creature("a"), target.creature("b")], [fx.damage(1, ref.target("a")), fx.damage(1, ref.target("b"))]),
    });
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Llanowar Elves", "Bear Cub"], hand: ["Commandeer", blue("Bleu A"), blue("Bleu B")] },
      p2: { battlefield: ["Shivan Dragon", "Serra Angel"], hand: [twinBolt] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Test Twin Bolt"), targets: { a: [elves], b: [bear] } });
    s = act(s, "p2", { type: "pass" });
    const bolt = s.stack[0]?.id as string;
    const asked: string[][] = [];
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commandeer"), alternative: true, targets: { t: [bolt] } }),
      (req) => {
        if (req.type !== "pick" || req.intent !== "changeTarget") return undefined;
        asked.push(req.options);
        return asked.length === 1 ? [dragon] : [angel];
      },
    );
    // One question per word "target", the original target offered along with the others.
    expect(asked).toHaveLength(2);
    expect(asked[0]).toEqual(expect.arrayContaining([elves, dragon, angel]));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[dragon]?.damage).toBe(1);
    expect(s.objects[angel]?.damage).toBe(1);
  });
});

describe("Breaking News (PLAN-L, L11)", () => {
  const castIt = (s: S, name: string, extra: object = {}, player = "p1") =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const top = (s: S) => s.stack[s.stack.length - 1]?.id as string;
  const on = (s: S, p: string, name: string) => idOf(s, p, "battlefield", name);
  /** p2 (active) casts its spell then passes: p1 gets priority with it on the stack. */
  const p2Casts = (s: S, name: string, extra: object = {}) => act(castIt(s, name, extra, "p2"), "p2", { type: "pass" });
  const mayYes = (req: { intent?: string; type: string }) => (req.intent === "may" || req.type === "yesNo" ? [1] : undefined);

  it("Anguished Unmaking: exiles a nonland permanent; you lose 3 life", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Swamp"], hand: ["Anguished Unmaking"] },
      p2: { battlefield: ["Shivan Dragon", "Forest"] },
    });
    expect(() => castIt(s, "Anguished Unmaking", { targets: { t: [on(s, "p2", "Forest")] } })).toThrow();
    s = settle(castIt(s, "Anguished Unmaking", { targets: { t: [on(s, "p2", "Shivan Dragon")] } }));
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(17);
  });

  it("Contagion Engine: enters, a -1/-1 counter on each creature of the target player; {4}, {T}: proliferate twice", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: ["Contagion Engine"] },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
    });
    s = settle(castIt(s, "Contagion Engine"), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[on(s, "p2", "Serra Angel")]?.counters["-1/-1"]).toBe(1);
    expect(s.objects[on(s, "p1", "Bear Cub")]?.counters["-1/-1"] ?? 0).toBe(0);

    let t = scenario({
      p1: { battlefield: ["Contagion Engine", ...lands("Forest", 4)] },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "-1/-1": 1 } }] },
    });
    const engine = on(t, "p1", "Contagion Engine");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === engine);
    t = settle(act(t, "p1", { type: "activate", source: engine, ability: ab?.type === "activate" ? ab.ability : 0 }), (req) =>
      req.type === "pick" && req.intent === "proliferate" ? req.options : undefined,
    );
    expect(t.objects[on(t, "p2", "Serra Angel")]?.counters["-1/-1"]).toBe(3);
    expect(t.objects[engine]?.tapped).toBe(true);
  });

  it("Overwhelming Forces: destroys all creatures of the target opponent; draw a card for each", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 8), "Bear Cub"], hand: ["Overwhelming Forces"], library: lands("Island", 5) },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel", "Forest"] },
    });
    s = settle(castIt(s, "Overwhelming Forces", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Abrupt Decay and Void Rend: can't be countered; nonland permanent (mana value 3 or less for Abrupt Decay)", () => {
    const setup = (spell: string, mana: string[]) =>
      scenario({
        p1: { battlefield: mana, hand: [spell] },
        p2: { battlefield: ["Ghostly Prison", "Shivan Dragon", ...lands("Island", 3)], hand: ["Archmage's Charm"] },
      });
    let s = setup("Abrupt Decay", ["Swamp", "Forest"]);
    expect(() => castIt(s, "Abrupt Decay", { targets: { t: [on(s, "p2", "Shivan Dragon")] } })).toThrow();
    s = act(castIt(s, "Abrupt Decay", { targets: { t: [on(s, "p2", "Ghostly Prison")] } }), "p1", { type: "pass" });
    s = settle(castIt(s, "Archmage's Charm", { mode: 0, targets: { s: [s.stack[0]?.id as string] } }, "p2"));
    expect(idsOf(s, "p2", "graveyard", "Ghostly Prison")).toHaveLength(1);

    let t = setup("Void Rend", ["Plains", "Island", "Swamp"]);
    t = act(castIt(t, "Void Rend", { targets: { t: [on(t, "p2", "Shivan Dragon")] } }), "p1", { type: "pass" });
    t = settle(castIt(t, "Archmage's Charm", { mode: 0, targets: { s: [t.stack[0]?.id as string] } }, "p2"));
    expect(idsOf(t, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Archmage's Charm: counter a spell; a player draws two; control of a nonland permanent with mana value 1 or less", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Archmage's Charm"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = p2Casts(s, "Shock", { targets: { t: ["p1"] } });
    s = settle(castIt(s, "Archmage's Charm", { mode: 0, targets: { s: [top(s)] } }));
    expect([s.players.p1?.life, idsOf(s, "p2", "graveyard", "Shock").length]).toEqual([20, 1]);

    let t = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Archmage's Charm"], library: lands("Island", 3) } });
    t = settle(castIt(t, "Archmage's Charm", { mode: 1, targets: { p: ["p1"] } }));
    expect(t.players.p1?.hand).toHaveLength(2);

    let u = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Archmage's Charm"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    expect(() => castIt(u, "Archmage's Charm", { mode: 2, targets: { n: [on(u, "p2", "Bear Cub")] } })).toThrow();
    const elves = on(u, "p2", "Llanowar Elves");
    u = settle(castIt(u, "Archmage's Charm", { mode: 2, targets: { n: [elves] } }));
    expect(u.objects[elves]?.controller).toBe("p1");
  });

  it("Bedevil: destroys an artifact, a creature or a planeswalker (not a land)", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp", "Mountain"], hand: ["Bedevil"] },
      p2: { battlefield: ["Mana Crypt", "Forest"] },
    });
    expect(() => castIt(s, "Bedevil", { targets: { t: [on(s, "p2", "Forest")] } })).toThrow();
    s = settle(castIt(s, "Bedevil", { targets: { t: [on(s, "p2", "Mana Crypt")] } }));
    expect(idsOf(s, "p2", "graveyard", "Mana Crypt")).toHaveLength(1);
  });

  it("Cruel Ultimatum: the opponent sacrifices a creature of their choice, discards three, loses 5; you return a creature card, draw three, gain 5", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Swamp", 3), ...lands("Mountain", 2)],
        hand: ["Cruel Ultimatum"],
        graveyard: ["Shivan Dragon"],
        library: lands("Island", 5),
      },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"], hand: ["Shock", "Shock", "Forest", "Opt"] },
    });
    const elves = on(s, "p2", "Llanowar Elves");
    const sacrificer: string[] = [];
    s = settle(castIt(s, "Cruel Ultimatum", { targets: { t: ["p2"] } }), (req, p) => {
      if (req.type === "pick" && req.options.includes(elves)) {
        sacrificer.push(p);
        return [elves];
      }
      return undefined;
    });
    expect(sacrificer).toEqual(["p2"]);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.life).toBe(15);
    expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(s.players.p1?.life).toBe(25);
  });

  it("Electrodominance: X damage to any target; you may cast a spell with mana value X or less from your hand for free", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Electrodominance", "Bear Cub", "Shivan Dragon"] },
    });
    s = untilCastNow(castIt(s, "Electrodominance", { x: 2, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    const offered = castNowOf(s)?.cards ?? [];
    expect(offered.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(false);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub"), free: true }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
  });

  it("Pest Infestation: destroys up to X artifacts and/or enchantments; twice X Pests that give 1 life when they die", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Pest Infestation"] },
      p2: { battlefield: ["Mana Crypt", "Ghostly Prison"] },
    });
    s = settle(
      castIt(s, "Pest Infestation", { x: 2, targets: { t: [on(s, "p2", "Mana Crypt"), on(s, "p2", "Ghostly Prison")] } }),
    );
    expect(s.players.p2?.graveyard).toHaveLength(2);
    const pests = idsOf(s, "p1", "battlefield", "Pest");
    expect(pests).toHaveLength(4);
    expect([chars(s, pests[0] as string).power, chars(s, pests[0] as string).colors]).toEqual([1, ["B", "G"]]);
    destroy(s, pests[0] as string);
    s = settle(s);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Clear Shot: your creature gets +1/+1, then deals damage equal to its power to a creature you don't control", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 3)], hand: ["Clear Shot"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const elves = on(s, "p1", "Llanowar Elves");
    s = settle(castIt(s, "Clear Shot", { targets: { a: [elves], b: [on(s, "p2", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect([chars(s, elves).power, s.objects[elves]?.damage]).toEqual([2, 0]);
  });

  it("Savage Smash: your creature gets +2/+2, then fights a creature you don't control", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Mountain", "Forest", "Forest"], hand: ["Savage Smash"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const elves = on(s, "p1", "Llanowar Elves");
    s = settle(castIt(s, "Savage Smash", { targets: { a: [elves], b: [on(s, "p2", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect([chars(s, elves).power, s.objects[elves]?.damage]).toEqual([3, 2]);
  });

  it("Decisive Denial: your creature fights an opposing one; or counter a noncreature spell unless {3} is paid", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Forest", "Island"], hand: ["Decisive Denial"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const cub = on(s, "p1", "Bear Cub");
    s = settle(castIt(s, "Decisive Denial", { mode: 0, targets: { a: [cub], b: [on(s, "p2", "Llanowar Elves")] } }));
    expect([idsOf(s, "p2", "graveyard", "Llanowar Elves").length, s.objects[cub]?.damage]).toEqual([1, 1]);

    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Forest", "Island"], hand: ["Decisive Denial"] },
      p2: { battlefield: ["Mountain", ...lands("Forest", 2)], hand: ["Shock", "Bear Cub"] },
    });
    t = p2Casts(t, "Shock", { targets: { t: ["p1"] } });
    t = settle(castIt(t, "Decisive Denial", { mode: 1, targets: { s: [top(t)] } }));
    // Two Forests: p2 can't pay {3}.
    expect([t.players.p1?.life, idsOf(t, "p2", "graveyard", "Shock").length]).toEqual([20, 1]);
    t = p2Casts(t, "Bear Cub");
    expect(() => castIt(t, "Decisive Denial", { mode: 1, targets: { s: [top(t)] } })).toThrow();
  });

  it("Essence Capture: counters a creature spell; a +1/+1 counter on up to one of your creatures", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Llanowar Elves", "Island", "Island"], hand: ["Essence Capture"] },
      p2: { battlefield: [...lands("Forest", 2), "Mountain"], hand: ["Bear Cub", "Shock"] },
    });
    const elves = on(s, "p1", "Llanowar Elves");
    s = p2Casts(s, "Bear Cub");
    s = settle(castIt(s, "Essence Capture", { targets: { s: [top(s)], c: [elves] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
    const t = p2Casts(
      scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Essence Capture"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      }),
      "Shock",
      { targets: { t: ["p1"] } },
    );
    expect(() => castIt(t, "Essence Capture", { targets: { s: [top(t)] } })).toThrow();
  });

  it("Heartless Pillage: the opponent discards two cards; raid: a Treasure", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3)], hand: ["Heartless Pillage"] },
      p2: { hand: ["Shock", "Forest", "Opt"] },
    });
    s = settle(castIt(s, "Heartless Pillage", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);

    let t = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Heartless Pillage"] },
      p2: { hand: ["Shock", "Forest", "Opt"] },
    });
    t = throughCombat(attack(t, [on(t, "p1", "Bear Cub")]));
    t = settle(castIt(t, "Heartless Pillage", { targets: { t: ["p2"] } }));
    expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Hindering Light: counters a spell that targets a permanent you control; draw a card", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub", "Plains", "Island"], hand: ["Hindering Light"], library: lands("Island", 2) },
      p2: { battlefield: ["Mountain", "Mountain", "Bear Cub"], hand: ["Shock", "Shock"] },
    });
    const ownCub = on(s, "p2", "Bear Cub");
    s = p2Casts(s, "Shock", { targets: { t: [ownCub] } });
    // A spell that targets only the opponent's creature: not a legal target.
    expect(() => castIt(s, "Hindering Light", { targets: { t: [top(s)] } })).toThrow();
    s = settle(s);
    s = p2Casts(s, "Shock", { targets: { t: [on(s, "p1", "Bear Cub")] } });
    s = settle(castIt(s, "Hindering Light", { targets: { t: [top(s)] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Humiliate: you choose a nonland card from the opponent's hand to discard; a +1/+1 counter on your creature", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp", "Bear Cub"], hand: ["Humiliate"] },
      p2: { hand: ["Forest", "Shivan Dragon", "Shock"] },
    });
    const chooser: string[] = [];
    s = settle(castIt(s, "Humiliate", { targets: { t: ["p2"] } }), (req, p, cur) => {
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Shock")) {
        chooser.push(p);
        expect(req.options.some((id) => nameOf(cur, id) === "Forest")).toBe(false);
        return pickNamed(cur, req, "Shock");
      }
      return undefined;
    });
    expect(chooser).toEqual(["p1"]);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    expect(s.objects[on(s, "p1", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });

  it("Hypothesizzle: draw two; discarding a nonland card, 4 damage to a creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 4), "Mountain"], hand: ["Hypothesizzle"], library: ["Shock", "Forest", "Island"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = on(s, "p2", "Serra Angel");
    s = settle(castIt(s, "Hypothesizzle"), (req, _p, cur) => {
      if (req.type !== "pick") return mayYes(req);
      if (req.options.includes(angel)) return [angel];
      return pickNamed(cur, req, "Shock");
    });
    expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Imp's Mischief: changes the target of a spell with a single target; you lose life equal to its mana value", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Imp's Mischief"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = p2Casts(s, "Shock", { targets: { t: ["p1"] } });
    s = settle(castIt(s, "Imp's Mischief", { targets: { t: [top(s)] } }), (req) =>
      req.type === "pick" && req.intent === "changeTarget" && req.options.includes("p2") ? ["p2"] : undefined,
    );
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 18]);
  });

  it("Repulse: returns a creature to its owner's hand; draw a card", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Repulse"], library: lands("Island", 2) },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = settle(castIt(s, "Repulse", { targets: { t: [on(s, "p2", "Shivan Dragon")] } }));
    expect(idsOf(s, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Thornado: destroys a creature with flying; cycling {1}{G}", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Thornado"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    expect(() => castIt(s, "Thornado", { targets: { t: [on(s, "p2", "Bear Cub")] } })).toThrow();
    s = settle(castIt(s, "Thornado", { targets: { t: [on(s, "p2", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Thornado"], library: ["Island"] } });
    const card = idOf(t, "p1", "hand", "Thornado");
    const cyc = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === card);
    t = settle(act(t, "p1", { type: "activate", source: card, ability: cyc?.type === "activate" ? cyc.ability : 0 }));
    expect(idsOf(t, "p1", "graveyard", "Thornado")).toHaveLength(1);
    expect(idsOf(t, "p1", "hand", "Island")).toHaveLength(1);
  });

  it("Tyrant's Scorn: destroy a creature with mana value 3 or less, or return a creature to its owner's hand", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Swamp"], hand: ["Tyrant's Scorn"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    expect(() => castIt(s, "Tyrant's Scorn", { mode: 0, targets: { d: [on(s, "p2", "Shivan Dragon")] } })).toThrow();
    s = settle(castIt(s, "Tyrant's Scorn", { mode: 0, targets: { d: [on(s, "p2", "Bear Cub")] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: ["Island", "Swamp"], hand: ["Tyrant's Scorn"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    t = settle(castIt(t, "Tyrant's Scorn", { mode: 1, targets: { b: [on(t, "p2", "Shivan Dragon")] } }));
    expect(idsOf(t, "p2", "hand", "Shivan Dragon")).toHaveLength(1);
  });

  it("Vanishing Verse: exiles a monocolored permanent (not a multicolored or colorless one)", () => {
    const gold = customCard({ name: "Test Gold Bear", colors: ["W", "B"], power: 2, toughness: 2 });
    let s = scenario({
      p1: { battlefield: ["Plains", "Swamp"], hand: ["Vanishing Verse"] },
      p2: { battlefield: ["Bear Cub", gold, "Mana Crypt"] },
    });
    for (const n of ["Test Gold Bear", "Mana Crypt"])
      expect(() => castIt(s, "Vanishing Verse", { targets: { t: [on(s, "p2", n)] } })).toThrow();
    s = settle(castIt(s, "Vanishing Verse", { targets: { t: [on(s, "p2", "Bear Cub")] } }));
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
  });
});

describe("Breaking News: gaps found by L11 (PLAN-L)", () => {
  it("Mindbreak Trap: the target spells are exiled, they don't resolve", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Mindbreak Trap"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"] },
      active: "p2",
    });
    const [a, b] = idsOf(s, "p2", "hand", "Shock") as [string, string];
    s = act(s, "p2", { type: "cast", card: a, targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "cast", card: b, targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    const spells = s.stack.map((x) => x.id);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mindbreak Trap"), targets: { t: spells } }));
    expect(s.players.p1?.life).toBe(20);
    expect(exiled(s, "Shock")).toHaveLength(2);
  });

  it("Endless Detour: a card in a graveyard goes on top of or on the bottom of its owner's library", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Plains", "Island"], hand: ["Endless Detour"] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "graveyard", "Shivan Dragon");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Endless Detour"), targets: { t: [dragon] } }), (req) =>
      req.intent === "topOrBottom" ? ["top"] : undefined,
    );
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(0);
    expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Shivan Dragon");
  });

  it("Siphon Insight: flashback {1}{U}{B}, read from the Oracle text", () => {
    const s = scenario({ p1: { battlefield: ["Island", "Island", "Swamp"], graveyard: ["Siphon Insight"] } });
    const card = idOf(s, "p1", "graveyard", "Siphon Insight");
    expect(defOption(s.defs[s.objects[card]?.defId ?? ""], "flashback")?.cost).toMatchObject({
      generic: 1,
      colored: { U: 1, B: 1 },
    });
    expect(castOption(s, card)).toBeDefined();
    const t = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
    expect(exiled(t, "Siphon Insight")).toHaveLength(1);
  });
});

describe("Outlaws: approximations lifted (PLAN-M M9a)", () => {
  const castIt = (s: S, name: string, extra: object = {}, player = "p1") =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra } as never);
  const top = (s: S) => s.stack[s.stack.length - 1]?.id as string;
  /** p2 (active) casts its spell, then p2 and p3 pass: p1 gets priority with it on the stack. */
  const p2Casts = (s: S, name: string, extra: object = {}) =>
    act(act(castIt(s, name, extra, "p2"), "p2", { type: "pass" }), "p3", { type: "pass" });
  it("Hindering Light: also counters a spell that targets you (not one that targets only another player)", () => {
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Plains", "Island"], hand: ["Hindering Light"], library: lands("Island", 2) },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Shock", "Shock"] },
    });
    s = p2Casts(s, "Shock", { targets: { t: ["p3"] } });
    expect(() => castIt(s, "Hindering Light", { targets: { t: [top(s)] } })).toThrow();
    s = settle(s);
    s = p2Casts(s, "Shock", { targets: { t: ["p1"] } });
    s = settle(castIt(s, "Hindering Light", { targets: { t: [top(s)] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.hand).toHaveLength(1);
  });
});
