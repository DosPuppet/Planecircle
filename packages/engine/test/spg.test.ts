/** Special Guests (SPG): card rules tests (PLAN-G). */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, drawCards, gainLife, sourceFromObject } from "../src/actions";
import { activated, fx, ref, spell, staticAbility, target, triggered, when } from "../src/dsl";
import { announceDiscard } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { counterItem, spellCost } from "../src/stack";
import { chars, moveObject } from "../src/state";
import { plainText } from "../src/text";
import { attackTaxFor, canBlock } from "../src/turn";
import type { GameState } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  settleLogged,
  steal,
  stepTrail,
  throughCombat,
} from "./helpers";

/** Attaches the Equipment to the creature (staging). */
function attachTo(s: ReturnType<typeof scenario>, equipment: string, creature: string): void {
  (s.objects[equipment] as { attachedTo?: string }).attachedTo = creature;
  s.version += 1;
}

const ARTIFACT = customCard({ name: "Test Trinket", types: ["Artifact"], typeLine: "Artifact" });

describe("Special Guests", () => {
  describe("Affinity for artifacts (702.41): Frogmite, Thoughtcast", () => {
    it("{1} less for each artifact you control", () => {
      const s = scenario({ p1: { battlefield: [ARTIFACT, ARTIFACT, ARTIFACT], hand: ["Frogmite", "Thoughtcast"] } });
      const frog = s.defs[s.objects[idOf(s, "p1", "hand", "Frogmite")]?.defId ?? ""];
      const thought = s.defs[s.objects[idOf(s, "p1", "hand", "Thoughtcast")]?.defId ?? ""];
      expect(frog && spellCost(s, "p1", frog, {}).generic).toBe(1);
      expect(thought && spellCost(s, "p1", thought, {})).toMatchObject({ generic: 1, colored: { U: 1 } });
    });

    it("Frogmite free with four artifacts", () => {
      let s = scenario({ p1: { battlefield: [ARTIFACT, ARTIFACT, ARTIFACT, ARTIFACT], hand: ["Frogmite"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Frogmite") }));
      expect(idsOf(s, "p1", "battlefield", "Frogmite")).toHaveLength(1);
    });
  });

  describe("Metalcraft: Galvanic Blast", () => {
    it("2 damage, or 4 with three artifacts on resolution", () => {
      const run = (artifacts: number) => {
        let s = scenario({ p1: { battlefield: ["Mountain", ...Array(artifacts).fill(ARTIFACT)], hand: ["Galvanic Blast"] } });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Galvanic Blast"), targets: { t: ["p2"] } }));
        return s.players.p2?.life;
      };
      expect(run(2)).toBe(18);
      expect(run(3)).toBe(16);
    });
  });

  describe("Imprint: Chrome Mox", () => {
    it("exiles a nonartifact nonland card from hand; produces one mana of its colors", () => {
      let s = scenario({ p1: { hand: ["Chrome Mox", "Shock"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Chrome Mox") }), picking(s.players.p1?.hand ?? []));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      const mox = idOf(s, "p1", "battlefield", "Chrome Mox");
      const def = s.defs[s.objects[mox]?.defId ?? ""];
      expect(def?.abilities.find((a) => a.kind === "mana")).toMatchObject({ produceColorsOf: { kind: "linked" } });
    });
  });

  describe("Shroud (702.18): Helix Pinnacle", () => {
    it("can't be the target of any spell, even its controller's; 100 tower counters: win at upkeep", () => {
      let s = scenario({ p1: { battlefield: ["Helix Pinnacle", ...lands("Forest", 3)] } });
      const helix = idOf(s, "p1", "battlefield", "Helix Pinnacle");
      expect(chars(s, helix).keywords).toContain("shroud");
      (s.objects[helix] as { counters: Record<string, number> }).counters.tower = 99;
      s.version += 1;
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === helix);
      s = settle(act(s, "p1", { type: "activate", source: helix, ability: ab?.type === "activate" ? ab.ability : 0, x: 1 }));
      expect(s.objects[helix]?.counters.tower).toBe(100);
      s = advanceUntil(s, (x) => !!x.over || (x.turn.active === "p1" && x.turn.step === "draw"));
      expect(s.winner).toBe("p1");
    });
  });

  describe("Champion (702.72): Mistbind Clique, Wanderwine Prophets", () => {
    it("with no other Faerie: the creature is sacrificed", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Mistbind Clique"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mistbind Clique") }));
      expect(idsOf(s, "p1", "graveyard", "Mistbind Clique")).toHaveLength(1);
    });

    it("a Faerie exiled until it leaves; the targeted player's lands are tapped", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Mocking Sprite"], hand: ["Mistbind Clique"] },
        p2: { battlefield: lands("Forest", 3) },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mistbind Clique") }), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Mistbind Clique")).toHaveLength(1);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Mocking Sprite"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.tapped)).toHaveLength(3);
      // Mistbind Clique leaves the battlefield: the Faerie returns.
      const clique = idOf(s, "p1", "battlefield", "Mistbind Clique");
      (s.objects[clique] as { damage: number }).damage = 10;
      s.version += 1;
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Mocking Sprite")).toHaveLength(1);
    });

    it("Wanderwine Prophets: combat damage, sacrificing a Merfolk gives an extra turn", () => {
      let s = scenario({ p1: { battlefield: ["Wanderwine Prophets", "Brineborn Cutthroat"] } });
      const merfolk = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Wanderwine Prophets")]), (req) =>
        req.type === "pick" ? [merfolk] : req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Brineborn Cutthroat")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.step === "upkeep" && x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });
  });

  describe("G4a: Special Guests from LCI, MKM and OTJ", () => {
    it("Lord of Atlantis: other Merfolk get +1/+1 and islandwalk", () => {
      const s = scenario({
        p1: { battlefield: ["Lord of Atlantis", "Brineborn Cutthroat"] },
        p2: { battlefield: ["Island", "Bear Cub"] },
      });
      const cut = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      expect(chars(s, cut).power).toBe(3);
      let t = attack(s, [cut]);
      t = advanceUntil(t, (x) => x.pending?.kind === "declareBlockers");
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Bear Cub"), cut)).toBe(false);
      const noIsland = scenario({
        p1: { battlefield: ["Lord of Atlantis", "Brineborn Cutthroat"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      let u = attack(noIsland, [cut]);
      u = advanceUntil(u, (x) => x.pending?.kind === "declareBlockers");
      expect(canBlock(u, idOf(u, "p2", "battlefield", "Bear Cub"), cut)).toBe(true);
    });

    it("Bridge from Below: from the graveyard, a Zombie for each nontoken creature that dies; exiled if an opposing creature dies", () => {
      let s = scenario({
        p1: { graveyard: ["Bridge from Below"], battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      s = settle(s);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bridge from Below"]);
    });

    it("Bridge from Below: the graveyard the creature goes to is its owner's, not its controller's", () => {
      let s = scenario({
        p1: { graveyard: ["Bridge from Below"], battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      steal(s, bear, "p2");
      steal(s, elves, "p1");
      // Your Bear Cub, controlled by p2, goes to your graveyard: a Zombie, and the Bridge stays.
      destroy(s, bear);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(exiled(s, "Bridge from Below")).toHaveLength(0);
      // p2's Llanowar Elves, which you control, go to p2's graveyard: the Bridge is exiled.
      destroy(s, elves);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(exiled(s, "Bridge from Below")).toHaveLength(1);
    });

    it("Mephidross Vampire: your creatures get a counter when damaging a creature, not a player or planeswalker", () => {
      const pinger = customCard({
        name: "Test Pinger",
        types: ["Creature"],
        typeLine: "Creature",
        power: 1,
        toughness: 1,
        abilities: [activated({ tap: true, targets: [target.any()], effects: [fx.damage(1, ref.target())] })],
      });
      const walker = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 3 });
      let s = scenario({
        p1: { battlefield: ["Mephidross Vampire", pinger] },
        p2: { battlefield: ["Bear Cub", walker] },
      });
      const pyro = idOf(s, "p1", "battlefield", "Test Pinger");
      const ping = (t: string) => {
        s = settle(act(s, "p1", { type: "activate", source: pyro, ability: 0, targets: { t: [t] } }));
        (s.objects[pyro] as { tapped: boolean }).tapped = false;
      };
      ping(idOf(s, "p2", "battlefield", "Test Walker"));
      ping("p2");
      expect(s.objects[pyro]?.counters["+1/+1"] ?? 0).toBe(0);
      ping(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect(s.objects[pyro]?.counters["+1/+1"]).toBe(1);
    });

    it("Rampaging Ferocidon: no player gains life; another creature enters, 1 damage to its controller", () => {
      let s = scenario({ p1: { battlefield: ["Rampaging Ferocidon", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      gainLife(s, "p1", 3);
      gainLife(s, "p2", 3);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.players.p1?.life).toBe(19);
    });

    it("Kalamax: the first instant of the turn is copied if it's tapped; each copy gives it a counter", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Kalamax, the Stormsire", tapped: true }, ...lands("Mountain", 2)],
          hand: ["Shock", "Shock"],
        },
      });
      const kal = idOf(s, "p1", "battlefield", "Kalamax, the Stormsire");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(s.objects[kal]?.counters["+1/+1"]).toBe(1);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Mana Crypt: {C}{C}; at upkeep, a coin flip and 3 damage on a loss", () => {
      const s = scenario({ p1: { battlefield: ["Mana Crypt"] } });
      const crypt = idOf(s, "p1", "battlefield", "Mana Crypt");
      expect(manaAbilitiesOf(s, crypt)[0]).toMatchObject({ produce: ["C"], amount: 2 });
      let t = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mana Crypt"] } });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect([17, 20]).toContain(t.players.p1?.life);
    });

    it("Star Compass: enters tapped; the colors of your basic lands", () => {
      const s = scenario({ p1: { battlefield: ["Star Compass", "Forest", "Island", "Mana Confluence"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Star Compass"))[0]?.produce).toEqual(["U", "G"]);
    });

    it("Ghostly Prison: attacking its controller costs {2} per creature", () => {
      const s = scenario({ active: "p2", p1: { battlefield: ["Ghostly Prison"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(attackTaxFor(s, "p1")).toBe(2);
    });

    it("Show and Tell: each player may put a permanent card from their hand onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Show and Tell", "Bear Cub"] },
        p2: { hand: ["Llanowar Elves"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Show and Tell") }), (req) =>
        req.type === "pick" && req.options.length ? [req.options[0] as string] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Tragic Slip: -1/-1, or -13/-13 if a creature died this turn (morbid)", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Tragic Slip"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 5 } }] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tragic Slip"), targets: { t: [cub] } }));
      expect(chars(s, cub).power).toBe(6);
      let t = scenario({
        p1: { battlefield: ["Swamp", "Llanowar Elves"], hand: ["Tragic Slip"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 5 } }] },
      });
      destroy(t, idOf(t, "p1", "battlefield", "Llanowar Elves"));
      t = settle(
        act(t, "p1", {
          type: "cast",
          card: idOf(t, "p1", "hand", "Tragic Slip"),
          targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Victimize: sacrifice a creature, two creature cards return tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), "Llanowar Elves"],
          hand: ["Victimize"],
          graveyard: ["Bear Cub", "Brineborn Cutthroat"],
        },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Brineborn Cutthroat")];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Victimize"), targets: { t: targets } }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      const back = [...idsOf(s, "p1", "battlefield", "Bear Cub"), ...idsOf(s, "p1", "battlefield", "Brineborn Cutthroat")];
      expect(back.map((id) => s.objects[id]?.tapped)).toEqual([true, true]);
    });

    it("Crashing Footfalls: suspend 4 from hand (special action), then two 4/4 Rhinos", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Crashing Footfalls"] } });
      const card = idOf(s, "p1", "hand", "Crashing Footfalls");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
      expect(ab?.type === "activate" && plainText(ab.label ?? "")).toBe("Suspend 4 — {G}");
      s = act(s, "p1", { type: "activate", source: card, ability: ab?.type === "activate" ? ab.ability : 0 });
      const exiled = s.exile.find((id) => nameOf(s, id) === "Crashing Footfalls") as string;
      expect([s.objects[exiled]?.counters.time, s.stack.length]).toEqual([4, 0]);
    });

    it("Tireless Tracker: landfall, a Clue; sacrifice a Clue, a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Tireless Tracker", ...lands("Plains", 2)], hand: ["Forest"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(act(s, "p1", { type: "activate", source: clue, ability: 0 }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Tireless Tracker")]?.counters["+1/+1"]).toBe(1);
    });

    it("Drown in the Loch: destroys a creature with mana value at most equal to its controller's graveyard", () => {
      const run = (gy: number) => {
        let s = scenario({
          p1: { battlefield: ["Island", "Swamp"], hand: ["Drown in the Loch"] },
          p2: { battlefield: ["Bear Cub"], graveyard: Array(gy).fill("Forest") },
        });
        s = settle(
          act(s, "p1", {
            type: "cast",
            card: idOf(s, "p1", "hand", "Drown in the Loch"),
            mode: 1,
            targets: { c: [idOf(s, "p2", "battlefield", "Bear Cub")] },
          }),
        );
        return idsOf(s, "p2", "battlefield", "Bear Cub").length;
      };
      expect(run(1)).toBe(1);
      expect(run(2)).toBe(0);
    });

    it("Field of the Dead: a Zombie when a land enters, with seven lands with different names", () => {
      let s = scenario({
        p1: { battlefield: ["Field of the Dead", "Forest", "Island", "Swamp", "Mountain", "Plains"], hand: ["Desert"] },
      });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Desert") }));
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
    });

    it("Desertion: a countered creature spell enters under your control", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 5), hand: ["Desertion"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Desertion"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      const cub = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect([s.objects[cub]?.controller, s.objects[cub]?.owner]).toEqual(["p1", "p2"]);
    });

    it("Port Razer: can't attack a player it already attacked this turn", () => {
      let s = scenario({ p1: { battlefield: ["Port Razer"] } });
      const razer = idOf(s, "p1", "battlefield", "Port Razer");
      s = attack(s, [razer]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: razer, defender: "p2" }] })).toThrow(
        /already attacked/,
      );
    });

    it("Scapeshift: sacrifice lands, that many land cards enter tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Scapeshift"], library: ["Desert", "Island", "Plains"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scapeshift") }), (req) =>
        req.type === "pick" && req.intent !== "search" ? req.options.slice(0, 2) : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
      expect(s.battlefield.filter((id) => ["Desert", "Island", "Plains"].includes(nameOf(s, id) ?? ""))).toHaveLength(2);
    });

    it("Desert: only at the end of combat step", () => {
      const s = scenario({ p1: { battlefield: ["Desert"] }, p2: { battlefield: ["Bear Cub"] } });
      const desert = idOf(s, "p1", "battlefield", "Desert");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === desert)).toBe(false);
    });

    it("Polyraptor: whenever it's dealt damage, a token copy", () => {
      const s = scenario({ p1: { battlefield: ["Polyraptor"] } });
      dealDamage(
        s,
        sourceFromObject(s, idOf(s, "p1", "battlefield", "Polyraptor")),
        idOf(s, "p1", "battlefield", "Polyraptor"),
        1,
        false,
      );
      const t = settle(s);
      expect(idsOf(t, "p1", "battlefield", "Polyraptor")).toHaveLength(2);
    });
  });

  describe("G4b: Special Guests from BLB, DSK, FDN and DFT", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

    it("Swords to Plowshares: exiled, its controller gains life equal to its power", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Swords to Plowshares"] }, p2: { battlefield: ["Bear Cub"] } });
      s = settle(castIt(s, "Swords to Plowshares", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect([s.exile.map((id) => nameOf(s, id)), s.players.p2?.life]).toEqual([["Bear Cub"], 22]);
    });

    it("Relentless Rats: +1/+1 for each other Relentless Rats", () => {
      const s = scenario({ p1: { battlefield: ["Relentless Rats", "Relentless Rats", "Relentless Rats"] } });
      expect(chars(s, idsOf(s, "p1", "battlefield", "Relentless Rats")[0] as string).power).toBe(4);
    });

    it("Kindred Charge: a copy with haste of each of your creatures of the chosen type", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 6), "Bear Cub", "Llanowar Elves"], hand: ["Kindred Charge"] },
      });
      s = settle(castIt(s, "Kindred Charge"), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(cubs).toHaveLength(2);
      expect(cubs.some((id) => s.objects[id]?.isToken && chars(s, id).keywords.includes("haste"))).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Sword of Fire and Ice: +2/+2, protection; combat damage to a player: 2 damage and a card", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Sword of Fire and Ice"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      attachTo(s, idOf(s, "p1", "battlefield", "Sword of Fire and Ice"), cub);
      expect(chars(s, cub).power).toBe(4);
      const hand = s.players.p1?.hand.length ?? 0;
      s = throughCombat(attack(s, [cub]), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.life).toBe(14);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Hallowed Haunting: an enchantment spell gives a Spirit Cleric, P/T equal to the number of Spirits", () => {
      let s = scenario({ p1: { battlefield: ["Hallowed Haunting", ...lands("Plains", 4)], hand: ["Ghostly Prison"] } });
      s = settle(castIt(s, "Ghostly Prison"));
      const spirit = idOf(s, "p1", "battlefield", "Spirit Cleric");
      expect([chars(s, spirit).power, chars(s, spirit).toughness]).toEqual([1, 1]);
    });

    it("Damnation: destroys all creatures, with no regeneration", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Damnation"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[cub] as { regenShields?: number }).regenShields = 1;
      s = settle(castIt(s, "Damnation"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });

    it("Sacrifice: {B} equal to the sacrificed creature's mana value", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Fiend Artisan"], hand: ["Sacrifice"] } });
      s = settle(castIt(s, "Sacrifice", { sacrifice: [idOf(s, "p1", "battlefield", "Fiend Artisan")] }));
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Unholy Heat: 2 damage, 6 with delirium", () => {
      const run = (gy: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Mountain"], hand: ["Unholy Heat"], graveyard: gy },
          p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 3 } }] },
        });
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(castIt(s, "Unholy Heat", { targets: { t: [cub] } }));
        return idsOf(s, "p2", "battlefield", "Bear Cub").length;
      };
      expect(run([])).toBe(1);
      expect(run(["Forest", "Bear Cub", "Shock", "Ghostly Prison"])).toBe(0);
    });

    it("Collected Company: up to two creatures with mana value 3 or less among the top six", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Collected Company"],
          library: ["Bear Cub", "Forest", "Llanowar Elves", "Polyraptor", "Forest", "Bear Cub", "Forest"],
        },
      });
      s = settle(castIt(s, "Collected Company"));
      expect(s.battlefield.filter((id) => ["Bear Cub", "Llanowar Elves"].includes(nameOf(s, id) ?? ""))).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(0);
    });

    it("Condemn: the attacker to the bottom of the library, its controller gains life equal to its toughness", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Plains"], hand: ["Condemn"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: cub, defender: "p1" }] });
      s = act(s, "p2", { type: "pass" });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Condemn"), targets: { t: [cub] } }));
      const lib = s.players.p2?.library ?? [];
      expect(nameOf(s, lib[lib.length - 1] as string)).toBe("Bear Cub");
      expect(s.players.p2?.life).toBe(22);
    });

    it("Embercleave: {1} less per attacker; enters attached to one of your creatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Embercleave"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Embercleave"), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      const ember = idOf(s, "p1", "battlefield", "Embercleave");
      expect(s.objects[ember]?.attachedTo).toBe(cub);
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
    });

    it("Goblin Bushwhacker: kicked, your creatures get +1/+0 and haste", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Goblin Bushwhacker"] } });
      s = settle(castIt(s, "Goblin Bushwhacker", { kicked: true }));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect([chars(s, cub).power, chars(s, cub).keywords.includes("haste")]).toEqual([3, true]);
    });

    it("Paradise Druid: hexproof while untapped", () => {
      const s = scenario({ p1: { battlefield: ["Paradise Druid", { name: "Paradise Druid", tapped: true }] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Paradise Druid");
      expect([chars(s, a as string).keywords.includes("hexproof"), chars(s, b as string).keywords.includes("hexproof")]).toEqual([
        true,
        false,
      ]);
    });

    it("Cavalier of Dawn: destroys a nonland permanent; its controller creates a 3/3 Golem", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Cavalier of Dawn"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      const prison = idOf(s, "p2", "battlefield", "Ghostly Prison");
      s = settle(castIt(s, "Cavalier of Dawn"), (req) =>
        req.type === "pick" && req.options.includes(prison) ? [prison] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Ghostly Prison")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Golem")).toHaveLength(1);
    });

    it("Bone Miser: discarding a creature, a land or something else", () => {
      let s = scenario({ p1: { battlefield: ["Bone Miser"], hand: ["Bear Cub", "Forest", "Shock"] } });
      s = settle(s);
      for (const n of ["Bear Cub", "Forest", "Shock"])
        announceDiscard(s, "p1", moveObject(s, idOf(s, "p1", "hand", n), "graveyard"));
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
      expect(s.players.p1?.manaPool.B).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Chandra's Ignition: your creature damages each other creature and each opponent", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"],
          hand: ["Chandra's Ignition"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Chandra's Ignition", { targets: { t: [mine] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Pathbreaker Ibex: when attacking, your creatures get trample and +X/+X", () => {
      let s = scenario({ p1: { battlefield: ["Pathbreaker Ibex", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Pathbreaker Ibex")]));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect([chars(s, cub).power, chars(s, cub).keywords.includes("trample")]).toEqual([5, true]);
    });
  });

  describe("G4c: Special Guests from TDM, EOE and ECL", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const activate = (s: ReturnType<typeof scenario>, source: string, extra: object = {}) => {
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
      return act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : 0, ...extra });
    };

    it("Arid Mesa: 1 life and sacrifice, a Mountain or a Plains onto the battlefield", () => {
      let s = scenario({ p1: { battlefield: ["Arid Mesa"], library: ["Forest", "Plains", "Island"] } });
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Arid Mesa")));
      expect([idsOf(s, "p1", "battlefield", "Plains").length, s.players.p1?.life]).toEqual([1, 19]);
    });

    it("Ruinous Ultimatum: destroys the opposing nonland permanents", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 3), ...lands("Swamp", 2), "Bear Cub"],
          hand: ["Ruinous Ultimatum"],
        },
        p2: { battlefield: ["Bear Cub", "Ghostly Prison", "Forest"] },
      });
      s = settle(castIt(s, "Ruinous Ultimatum"));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2").map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Warping Wail: exiles a creature with power or toughness 1 or less", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Ancient Tomb"], hand: ["Warping Wail"] },
        p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Warping Wail"));
      const legal = opt?.type === "cast" ? opt.modes.find((m) => m.index === 0)?.targets[0]?.legal : [];
      expect(legal).toEqual([idOf(s, "p2", "battlefield", "Llanowar Elves")]);
      s = settle(castIt(s, "Warping Wail", { mode: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Eldrazi Scion")).toHaveLength(1);
    });

    it("Deafening Silence: only one noncreature spell per turn and per player", () => {
      let s = scenario({
        p1: { battlefield: ["Deafening Silence", ...lands("Mountain", 4)], hand: ["Shock", "Shock", "Goblin Sharpshooter"] },
      });
      s = settle(castIt(s, "Shock", { targets: { t: ["p2"] } }));
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Goblin Sharpshooter"))).toBe(true);
    });

    it("Nexus of Fate: an extra turn, then shuffled into the library", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Nexus of Fate"] } });
      s = settle(castIt(s, "Nexus of Fate"));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library.some((id) => nameOf(s, id) === "Nexus of Fate")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "upkeep" && x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });

    it("Paradox Haze: at the enchanted player's first upkeep, one more real upkeep step after this one", () => {
      const clock = customCard({
        name: "Upkeep Clock",
        types: ["Artifact"],
        typeLine: "Artifact",
        abilities: [triggered(when.step("upkeep"), [fx.gainLife(1)], { label: "1 PV" })],
      });
      let s = scenario({
        p1: { battlefield: [clock, ...lands("Island", 3)], hand: ["Paradox Haze"], library: ["Forest", "Island", "Swamp"] },
      });
      const haze = idOf(s, "p1", "hand", "Paradox Haze");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === haze);
      const spec = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
      s = settle(act(s, "p1", { type: "cast", card: haze, targets: { [spec]: ["p1"] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Paradox Haze")]?.attachedTo).toBe("p1");
      const { s: after, steps } = stepTrail(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.turn.step === "main1");
      // Two upkeep steps, a single draw; the second adds no other (first upkeep of the turn).
      expect(steps.slice(-4)).toEqual(["upkeep", "upkeep", "draw", "main1"]);
      expect(after.players.p1?.hand).toHaveLength(1);
      expect(after.players.p1?.life).toBe(22);
    });

    it("Magus of the Moon: nonbasic lands are Mountains, without their other abilities", () => {
      const s = scenario({ p1: { battlefield: ["Magus of the Moon", "Forest"] }, p2: { battlefield: ["Ancient Tomb"] } });
      const tomb = idOf(s, "p2", "battlefield", "Ancient Tomb");
      expect(chars(s, tomb).subtypes).toEqual(["Mountain"]);
      expect(manaAbilitiesOf(s, tomb).map((a) => [a.produce, a.amount])).toEqual([[["R"], 1]]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).subtypes).toEqual(["Forest"]);
    });

    it("Magus of the Moon: only land types are replaced (305.7), and the land loses its static abilities", () => {
      const grove = customCard({
        name: "Test Dryad Grove",
        typeLine: "Land Creature — Forest Dryad",
        types: ["Land", "Creature"],
        subtypes: ["Forest", "Dryad"],
        power: 1,
        toughness: 1,
        abilities: [staticAbility({ types: ["Creature"], other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" })],
      });
      const s = scenario({ p1: { battlefield: ["Magus of the Moon", grove, "Scene of the Crime"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Test Dryad Grove")).subtypes.sort()).toEqual(["Dryad", "Mountain"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Scene of the Crime")).subtypes.sort()).toEqual(["Clue", "Mountain"]);
      // The land's static ability no longer applies: Magus of the Moon stays 2/2.
      expect(chars(s, idOf(s, "p1", "battlefield", "Magus of the Moon")).power).toBe(2);
    });

    it("Burgeoning: an opponent plays a land, you may put a land from your hand", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Burgeoning"], hand: ["Forest"] }, p2: { hand: ["Island"] } });
      s = settle(act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Island") }), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Green Sun's Zenith: a green creature with mana value X or less, then shuffled into the library", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Green Sun's Zenith"], library: ["Bear Cub", "Regal Force", "Forest"] },
      });
      s = settle(castIt(s, "Green Sun's Zenith", { x: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.library.some((id) => nameOf(s, id) === "Green Sun's Zenith")).toBe(true);
    });

    it("Green Sun's Zenith: countered or discarded, it goes to the graveyard (PLAN-M M7)", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Green Sun's Zenith", "Green Sun's Zenith"] } });
      const second = s.players.p1?.hand[1];
      s = castIt(s, "Green Sun's Zenith", { x: 2 });
      expect(counterItem(s, s.stack[0]?.id as string, "test")).toBe(true);
      moveObject(s, second as string, "graveyard");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Green Sun's Zenith", "Green Sun's Zenith"]);
    });

    it("Bitterblossom: at upkeep, 1 life and a Faerie Rogue", () => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Bitterblossom"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect([s.players.p1?.life, idsOf(s, "p1", "battlefield", "Faerie Rogue").length]).toEqual([19, 1]);
    });

    it("Goblin Sharpshooter: doesn't untap, but untaps when a creature dies", () => {
      let s = scenario({ p1: { battlefield: ["Goblin Sharpshooter"] }, p2: { battlefield: ["Llanowar Elves"] } });
      const gob = idOf(s, "p1", "battlefield", "Goblin Sharpshooter");
      s = settle(activate(s, gob, { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
      expect(s.objects[gob]?.tapped).toBe(false);
    });

    it("Devoted Druid: a -1/-1 counter untaps it", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Devoted Druid", tapped: true }] } });
      const druid = idOf(s, "p1", "battlefield", "Devoted Druid");
      s = settle(activate(s, druid));
      expect([s.objects[druid]?.tapped, s.objects[druid]?.counters["-1/-1"]]).toEqual([false, 1]);
    });

    it("Risen Reef: a land from the top enters tapped; otherwise the card goes to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Island"], hand: ["Risen Reef"], library: ["Forest", "Bear Cub"] },
      });
      s = settle(castIt(s, "Risen Reef"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      expect(
        s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped && s.objects[id]?.controlledSince > 0),
      ).toHaveLength(1);
    });

    it("Darkness: no combat damage this turn", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp"], hand: ["Darkness"] } });
      s = settle(castIt(s, "Darkness"));
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(20);
    });
  });

  describe("G4d: Special Guests from SOS and FRA", () => {
    const castIt = (s: ReturnType<typeof scenario>, name: string, extra: object = {}) =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
    const castOpt = (s: ReturnType<typeof scenario>, name: string) =>
      legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));

    it("Door of Destinies: a counter per spell of the chosen type; your creatures of that type get +1/+1 per counter", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Bear Cub"], hand: ["Door of Destinies", "Bear Cub"] } });
      s = settle(castIt(s, "Door of Destinies"), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      s = settle(castIt(s, "Bear Cub"));
      const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(cubs.map((id) => chars(s, id).power)).toEqual([3, 3]);
    });

    it("Archmage Emeritus: draw when casting or copying an instant or sorcery", () => {
      let s = scenario({
        p1: { battlefield: ["Archmage Emeritus", ...lands("Mountain", 4)], hand: ["Shock", "Dualcaster Mage"] },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      s = settle(castIt(s, "Dualcaster Mage"), (req) =>
        req.type === "pick" && req.options.length ? req.options.slice(0, 1) : undefined,
      );
      // Two cards played, two drawn (cast and copy).
      expect(s.players.p1?.hand.length).toBe(hand);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Library of Alexandria: draw only with exactly seven cards in hand", () => {
      const s = scenario({ p1: { battlefield: ["Library of Alexandria"], hand: Array(7).fill("Forest") } });
      const lib = idOf(s, "p1", "battlefield", "Library of Alexandria");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lib)).toBe(true);
      const t = scenario({ p1: { battlefield: ["Library of Alexandria"], hand: Array(6).fill("Forest") } });
      expect(
        legalActions(t, "p1").some(
          (a) => a.type === "activate" && a.source === idOf(t, "p1", "battlefield", "Library of Alexandria"),
        ),
      ).toBe(false);
    });

    it("Adrix and Nev: your tokens are created twice", () => {
      let s = scenario({ p1: { battlefield: ["Adrix and Nev, Twincasters", ...lands("Mountain", 2)], hand: ["Dragon Fodder"] } });
      s = settle(castIt(s, "Dragon Fodder"));
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
    });

    it("Austere Command: six pairs of modes", () => {
      const s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Austere Command"] } });
      const all = castOpt(s, "Austere Command");
      expect(all?.type === "cast" && all.modes.length).toBe(6);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 4), ...lands("Island", 2)], hand: ["Austere Command"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Ghostly Prison"] },
      });
      const opt = castOpt(t, "Austere Command");
      const pair =
        opt?.type === "cast"
          ? opt.modes.find((m) => m.label?.includes("MV 3 or less") && m.label.includes("enchantments"))
          : undefined;
      t = settle(castIt(t, "Austere Command", { mode: pair?.index }));
      expect(t.battlefield.filter((id) => t.objects[id]?.controller === "p2").map((id) => nameOf(t, id))).toEqual([
        "Shivan Dragon",
      ]);
    });

    it("Mind Twist: the targeted player discards X cards at random", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Mind Twist"] },
        p2: { hand: ["Forest", "Forest", "Shock", "Opt"] },
      });
      s = settle(castIt(s, "Mind Twist", { x: 3, targets: { t: ["p2"] } }));
      expect([s.players.p2?.hand.length, s.players.p2?.graveyard.length]).toEqual([1, 3]);
    });

    it("Splinter Twin: the enchanted creature creates a copy of itself with haste", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Splinter Twin"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        castIt(s, "Splinter Twin", {
          targets: { [Object.keys(castOpt(s, "Splinter Twin")?.type === "cast" ? {} : {})[0] ?? "enchant"]: [cub] },
        }),
        (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined),
      );
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cub);
      expect(ab).toBeDefined();
      s = settle(act(s, "p1", { type: "activate", source: cub, ability: ab?.type === "activate" ? ab.ability : 0 }));
      const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => s.objects[id]?.isToken);
      expect(copies).toHaveLength(1);
      expect(chars(s, copies[0] as string).keywords).toContain("haste");
    });

    it("Root Maze: artifacts and lands of each player enter tapped", () => {
      let s = scenario({ p1: { battlefield: ["Root Maze"], hand: ["Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(s.objects[s.battlefield.find((id) => nameOf(s, id) === "Forest") as string]?.tapped).toBe(true);
    });

    it("Dolmen Gate: no combat damage to your attacking creatures", () => {
      let s = scenario({ p1: { battlefield: ["Dolmen Gate", "Bear Cub"] }, p2: { battlefield: ["Shivan Dragon"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Shivan Dragon"), attacker: cub }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });
  describe("G4e: player rules", () => {
    it("Thousand-Year Elixir: your creatures activate as though they had haste; {1}, {T}: untap", () => {
      let s = scenario({
        p1: { battlefield: ["Thousand-Year Elixir", "Forest", { name: "Llanowar Elves", sick: true }] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = act(s, "p1", { type: "tapForMana", source: elves, ability: 0 });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Forest"), ability: 0 });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Thousand-Year Elixir"),
          ability: 1,
          targets: { t: [elves] },
        }),
      );
      expect(s.objects[elves]?.tapped).toBe(false);
    });

    it("Grim Haruspex: morph (face down for {3}, no ward); another nontoken creature dies, draw", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3)], hand: ["Grim Haruspex"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grim Haruspex"), faceDown: true }));
      const down = s.battlefield.find((id) => s.objects[id]?.faceDown);
      expect(down).toBeDefined();
      expect(chars(s, down as string).keywords).not.toContain("ward");
      const t = scenario({ p1: { battlefield: ["Grim Haruspex", "Bear Cub"], library: lands("Swamp", 3) } });
      destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
      const u = settle(t);
      expect(u.players.p1?.hand).toHaveLength(1);
    });
  });
  describe("G4e: combat", () => {
    it("Mirri: when attacking, each opponent blocks with only one creature; tapped, only one creature attacks you", () => {
      let s = scenario({
        p1: { battlefield: ["Mirri, Weatherlight Duelist", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", "Shivan Dragon"] },
      });
      const mirri = idOf(s, "p1", "battlefield", "Mirri, Weatherlight Duelist");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [mirri, cub]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: elves, attacker: cub },
            { blocker: dragon, attacker: mirri },
          ],
        }),
      ).toThrow();
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: dragon, attacker: cub }] });
      expect(s.combat?.blockers).toHaveLength(1);

      let t = scenario({
        active: "p2",
        p1: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      const two = [idOf(t, "p2", "battlefield", "Bear Cub"), idOf(t, "p2", "battlefield", "Llanowar Elves")];
      expect(() => act(t, "p2", { type: "declareAttackers", attackers: two.map((id) => ({ id, defender: "p1" })) })).toThrow();
    });
  });
  describe("G4e: casting otherwise", () => {
    it("Consign to Memory: replicate {1} (copied X times); counters a colorless spell", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Consign to Memory"] },
        p2: { hand: ["Mana Crypt"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Mana Crypt") });
      s = act(s, "p2", { type: "pass" });
      const crypt = s.stack[0]?.id as string;
      const consign = idOf(s, "p1", "hand", "Consign to Memory");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === consign);
      expect(opt?.type === "cast" && opt.xMax).toBe(1);
      s = act(s, "p1", { type: "cast", card: consign, x: 1, targets: { t: [crypt] } });
      // The replicate ability copies the spell once.
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      expect(
        s.stack.filter((x) => x.sourceDefId === s.objects[consign]?.defId || nameOf(s, x.sourceId) === "Consign to Memory"),
      ).toHaveLength(2);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Mana Crypt")).toHaveLength(1);
    });

    it("Underworld Breach: escape (the cost and three other graveyard cards); sacrificed at the end step", () => {
      let s = scenario({
        p1: { battlefield: ["Underworld Breach", "Mountain"], graveyard: ["Shock", "Forest", "Plains", "Island"] },
      });
      const shock = idOf(s, "p1", "graveyard", "Shock");
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "graveyard", "Underworld Breach")).toHaveLength(1);
    });

    it("Phantasmal Image: copy of a creature, Illusion; targeted, it is sacrificed", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Phantasmal Image"] },
        p2: { battlefield: ["Shivan Dragon", "Mountain"], hand: ["Shock"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Phantasmal Image") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      const image = idOf(s, "p1", "battlefield", "Phantasmal Image");
      expect(chars(s, image).name).toBe("Shivan Dragon");
      expect(chars(s, image).subtypes).toContain("Illusion");
      expect(chars(s, image).power).toBe(5);
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [image] } }));
      expect(s.objects[image]).toBeUndefined();
      expect(idsOf(s, "p1", "graveyard", "Phantasmal Image")).toHaveLength(1);
    });

    it("Flesh Duplicate: copy with vanishing 3", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flesh Duplicate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flesh Duplicate") }));
      const dup = idOf(s, "p1", "battlefield", "Flesh Duplicate");
      expect(chars(s, dup).name).toBe("Bear Cub");
      expect(s.objects[dup]?.counters.time).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.objects[dup]?.counters.time).toBe(2);
    });

    it("Flesh Duplicate (PLAN-H H9): the three time counters are there as soon as it enters, with no ability on the stack", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flesh Duplicate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Flesh Duplicate") });
      for (let i = 0; i < 20 && idsOf(s, "p1", "battlefield", "Flesh Duplicate").length === 0; i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      }
      const dup = idOf(s, "p1", "battlefield", "Flesh Duplicate");
      expect(s.objects[dup]?.counters.time).toBe(3);
      expect(s.stack).toHaveLength(0);
      expect(s.triggers).toHaveLength(0);
    });
  });
  describe("G4e: library and drawing", () => {
    it("Necrodominance: end step, pay X life and draw X; maximum hand size five; graveyard exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Necrodominance"], hand: ["Shock"], library: lands("Swamp", 10) },
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.type === "number");
      s = act(s, "p1", { type: "choose", values: [7] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(13);
      expect(s.players.p1?.hand).toHaveLength(8);
      s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
      expect(s.players.p1?.hand).toHaveLength(5);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.length).toBeGreaterThanOrEqual(3);
    });

    it("maximum hand size set by several effects: the most recent wins (613.11)", () => {
      // Until next turn; Necrodominance: no life paid at the end step.
      const toNextTurn = (s: GameState) => {
        let cur = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "choice", 200);
        if (cur.pending?.kind === "choice") cur = act(cur, "p1", { type: "choose", values: [0] });
        return advanceUntil(cur, (x) => x.turn.active === "p2", 200);
      };
      // Library of Leng, then Necrodominance (more recent): five.
      let s = toNextTurn(scenario({ p1: { battlefield: ["Library of Leng", "Necrodominance"], hand: lands("Swamp", 9) } }));
      expect(s.players.p1?.hand).toHaveLength(5);
      // Necrodominance, then Library of Leng (more recent): no maximum hand size.
      s = toNextTurn(scenario({ p1: { battlefield: ["Necrodominance", "Library of Leng"], hand: lands("Swamp", 9) } }));
      expect(s.players.p1?.hand).toHaveLength(9);
      // Necrodominance, then The Ten Rings (more recent): ten, not the smallest.
      s = toNextTurn(scenario({ p1: { battlefield: ["Necrodominance", "The Ten Rings"], hand: lands("Swamp", 12) } }));
      expect(s.players.p1?.hand).toHaveLength(10);
    });

    it("Sphinx's Tutelage: you draw, the opponent mills two cards, and repeats if two nonland cards share a color", () => {
      let s = scenario({
        p1: { battlefield: ["Sphinx's Tutelage"], library: lands("Island", 3) },
        p2: { library: ["Shock", "Lightning Strike", "Bear Cub", "Forest", "Island"] },
      });
      drawCards(s, "p1", 1);
      s = settle(s);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id))).toEqual(["Shock", "Lightning Strike", "Bear Cub", "Forest"]);
    });

    it("Library of Leng: discarded by an effect, the card goes on top of the library; no maximum hand size", () => {
      const discarder = customCard({
        name: "Test discard",
        types: ["Sorcery"],
        typeLine: "Sorcery",
        spell: spell([], [fx.discard(1)]),
      });
      let s = scenario({ p1: { battlefield: ["Library of Leng"], hand: [discarder, "Shock"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test discard") }));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shock");
    });

    it("Notion Thief: the opponent draws an extra card, you draw it instead; not their draw step draw", () => {
      let s = scenario({
        active: "p2",
        step: "upkeep",
        p1: { battlefield: ["Notion Thief"], library: lands("Island", 3) },
        p2: { library: lands("Forest", 3) },
      });
      s = advanceUntil(s, (x) => x.turn.step === "main1");
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      drawCards(s, "p2", 2);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });
  describe("G4e: last cards", () => {
    it("Maddening Hex: the enchanted player casts a noncreature spell, a d6 and that much damage", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Maddening Hex"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const card = idOf(s, "p1", "hand", "Maddening Hex");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      const spec = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.id as string) : "";
      s = settle(act(s, "p1", { type: "cast", card, targets: { [spec]: ["p2"] } }));
      const hex = idOf(s, "p1", "battlefield", "Maddening Hex");
      expect(s.objects[hex]?.attachedTo).toBe("p2");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      const life = s.players.p2?.life ?? 20;
      expect(life).toBeLessThanOrEqual(19);
      expect(life).toBeGreaterThanOrEqual(14);
      // In a duel, no other opponent: the Aura stays on the player.
      expect(s.objects[hex]?.attachedTo).toBe("p2");
    });

    it("Painter's Servant: permanents are also of the chosen color", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Painter's Servant"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Painter's Servant") }), (req) =>
        req.type === "pick" && req.options.includes("U") ? ["U"] : undefined,
      );
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      const color = s.objects[idOf(s, "p1", "battlefield", "Painter's Servant")]?.chosen?.color as string;
      expect(chars(s, cub).colors).toEqual(expect.arrayContaining(["G", color]));
    });

    it("Sylvan Library: at the draw step, two extra cards; for each of the two, 4 life or it goes back on top", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Sylvan Library"], library: ["Shock", "Bear Cub", "Forest", "Island"] },
      });
      let n = 0;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "choice");
      s = settle(s, (req) => (req.type === "yesNo" ? [++n === 1 ? 1 : n === 2 ? 1 : 0] : undefined));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(16);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
  describe("G4e: last cards (2)", () => {
    it("Codie, Vociferous Codex: no permanent spells; {4}, {T}: WUBRG; the next spell exiles until a cheaper instant or sorcery, castable free until end of turn, the rest on the bottom (PLAN-M M9a)", () => {
      const start = () =>
        scenario({
          p1: {
            battlefield: ["Codie, Vociferous Codex", ...lands("Mountain", 4)],
            hand: ["Bear Cub", "Lightning Strike"],
            library: ["Bear Cub", "Lightning Bolt", "Shock", "Forest"],
          },
        });
      let s = start();
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      // Mana ability (605.1a): resolved at once, without the stack.
      s = act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Codie, Vociferous Codex"), ability: 1 });
      expect(Object.values(s.players.p1?.manaPool ?? {}).reduce((a, b) => a + b, 0)).toBe(5);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
      // Lightning Strike has mana value 2: Bear Cub (a creature) is exiled, then Lightning Bolt (mana value 1), the first
      // cheaper instant; Bear Cub goes to the bottom.
      const bolt = exiled(s, "Lightning Bolt")[0] as string;
      expect(bolt).toBeDefined();
      expect(castNowOf(s)).toBeUndefined();
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Shock", "Forest", "Bear Cub"]);
      // Castable for free later in the turn (not only right away).
      expect(castable(s, "p1", bolt)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
      // Not cast this turn: the permission ends with the turn.
      let t = start();
      t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Codie, Vociferous Codex"), ability: 1 });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
      const unused = exiled(t, "Lightning Bolt")[0] as string;
      const turn = t.turn.number;
      t = advanceUntil(t, (x) => x.turn.number > turn && x.turn.active === "p1");
      expect(castable(t, "p1", unused)).toBe(false);
    });

    it("Expropriate: each player votes; time gives an extra turn, money a permanent of the voter", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Expropriate"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(cub)) return [cub];
        return player === "p1" ? ["0"] : ["1"];
      });
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.extraTurns).toEqual(["p1"]);
      expect(exiled(s, "Expropriate")).toHaveLength(1);
    });

    it("Expropriate: your vote for money takes back a permanent you own, controlled by an opponent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 9), "Bear Cub"], hand: ["Expropriate"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      steal(s, cub, "p2");
      let offered: string[] = [];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(cub)) {
          offered = req.options.map(String);
          return [cub];
        }
        return player === "p1" ? ["1"] : ["0"];
      });
      // The permanents you own, whoever controls them; not p2's Llanowar Elves.
      expect(offered).not.toContain(elves);
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.extraTurns).toEqual(["p1"]);
    });

    it("Eerie Ultimatum: any number of permanent cards with different names from your graveyard", () => {
      const start = () =>
        scenario({
          p1: {
            battlefield: [...lands("Plains", 2), ...lands("Swamp", 3), ...lands("Forest", 2)],
            hand: ["Eerie Ultimatum"],
            graveyard: ["Bear Cub", "Bear Cub", "Llanowar Elves", "Shock"],
          },
        });
      let s = start();
      const cubs = s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Bear Cub") ?? [];
      // Two Bear Cubs: declined.
      expect(() =>
        settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Eerie Ultimatum") }), (req) =>
          req.type === "pick" ? cubs : undefined,
        ),
      ).toThrow(RulesError);
      // The default choice: one Bear Cub and the Llanowar Elves.
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Eerie Ultimatum") }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Robe of Stars: +0/+3; {1}{W}: the equipped creature phases out until your next untap step", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Robe of Stars", "Plains", "Mountain"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const robe = idOf(s, "p1", "battlefield", "Robe of Stars");
      (s.objects[robe] as { attachedTo?: string }).attachedTo = cub;
      s.version += 1;
      expect(chars(s, cub).toughness).toBe(5);
      s = settle(act(s, "p1", { type: "activate", source: robe, ability: 1 }));
      expect(s.battlefield).not.toContain(cub);
      expect(s.battlefield).not.toContain(robe);
      expect(s.objects[cub]?.zone).toBe("phasedOut");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.battlefield).toContain(cub);
      expect(s.objects[robe]?.attachedTo).toBe(cub);
      expect(chars(s, cub).toughness).toBe(5);
    });
  });
});

describe("Special Guests: approximations lifted (PLAN-H, H2c)", () => {
  it("Sylvan Library: the cards put back on top are chosen among those drawn this turn", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Sylvan Library"], hand: ["Opt"], library: ["Shock", "Bear Cub", "Forest", "Island"] },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    const offered: string[][] = [];
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw" && x.pending?.kind === "choice");
    let n = 0;
    s = settle(s, (req) => {
      if (req.type === "yesNo") return [++n === 1 ? 1 : 0];
      if (req.type === "pick") offered.push(req.options.map(String));
      return undefined;
    });
    expect(offered).toHaveLength(2);
    expect(offered.every((o) => !o.includes(opt) && o.length > 0)).toBe(true);
    expect(s.players.p1?.hand).toContain(opt);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Expropriate: in multiplayer, each player votes in turn order; money takes a permanent of each voter", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Island", 9), hand: ["Expropriate"] },
      p2: { battlefield: ["Bear Cub"] },
      p3: { battlefield: ["Llanowar Elves"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p3", "battlefield", "Llanowar Elves");
    const voters: string[] = [];
    const offered: string[][] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes("0")) {
        voters.push(player);
        return player === "p1" ? ["0"] : ["1"];
      }
      offered.push(req.options.map(String));
      return undefined;
    });
    expect(voters).toEqual(["p1", "p2", "p3"]);
    // Each vote for money: a permanent of the voter (alone, it is taken without a question).
    expect(offered).toEqual([]);
    expect(s.objects[cub]?.controller).toBe("p1");
    expect(s.objects[elves]?.controller).toBe("p1");
    expect(s.extraTurns).toEqual(["p1"]);
  });
});

describe("Special Guests: votes (PLAN-M M10b)", () => {
  it("Expropriate: the votes are cast and announced first; then each money vote takes a permanent of the voter", () => {
    const s0 = scenario({
      p1: { battlefield: [...lands("Island", 9), "Bear Cub"], hand: ["Expropriate"] },
      p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
    });
    const lions = idOf(s0, "p2", "battlefield", "Savannah Lions");
    const cub = idOf(s0, "p1", "battlefield", "Bear Cub");
    const { s, events, asked } = settleLogged(
      act(s0, "p1", { type: "cast", card: idOf(s0, "p1", "hand", "Expropriate") }),
      (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes("0")) return ["1"];
        return [req.options.includes(lions) ? lions : cub];
      },
    );
    // Both votes before the choice of the permanents (p1's money vote: a permanent p1 owns; p2's: one p2 owns).
    expect(asked.map((a) => a.player)).toEqual(["p1", "p2", "p1", "p1"]);
    expect(
      events.filter((e) => e.type === "chose").map((e) => (e.type === "chose" ? [e.player, e.values[0], e.vote] : [])),
    ).toEqual([
      ["p1", "Money (the caster takes a permanent of the voter)", true],
      ["p2", "Money (the caster takes a permanent of the voter)", true],
    ]);
    expect(s.objects[lions]?.controller).toBe("p1");
    expect(s.extraTurns ?? []).toEqual([]);
  });
});

describe("Special Guests: approximations lifted (PLAN-M M9a)", () => {
  it("Expropriate: an opponent's vote for money, a permanent they own whoever controls it", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Island", 9), hand: ["Expropriate"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    steal(s, cub, "p3");
    let offered: string[] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Expropriate") }), (req, player) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(cub)) {
        offered = req.options.map(String);
        return [cub];
      }
      return player === "p2" ? ["1"] : ["0"];
    });
    // p2's Bear Cub, controlled by p3, can be taken; p3's own permanents can't.
    expect(offered.sort()).toEqual([cub, elves].sort());
    expect(s.objects[cub]?.controller).toBe("p1");
  });

  it('Mirri, Weatherlight Duelist: "this combat" — an additional combat of the turn is not restricted', () => {
    let s = scenario({
      p1: { battlefield: ["Mirri, Weatherlight Duelist", "Bear Cub", ...lands("Mountain", 4)], hand: ["Seize the Day"] },
      p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
    });
    const mirri = idOf(s, "p1", "battlefield", "Mirri, Weatherlight Duelist");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Seize the Day"), targets: { t: [mirri] } }));
    // First combat: Mirri attacks, p2 can't block with two creatures.
    s = attack(s, [mirri]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const double = (attacker: string) => ({
      type: "declareBlockers" as const,
      blocks: [
        { blocker: elves, attacker },
        { blocker: lions, attacker },
      ],
    });
    expect(() => act(s, "p2", double(mirri))).toThrow();
    s = act(s, "p2", { type: "declareBlockers", blocks: [] });
    // The additional combat: Mirri doesn't attack, the restriction is over.
    s = attack(s, [cub]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", double(cub));
    expect(s.combat?.blockers).toHaveLength(2);
  });

  it("Sylvan Library: only cards drawn this turn, not a card put into your hand another way", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Sylvan Library"], graveyard: ["Opt"], library: ["Shock", "Bear Cub", "Forest", "Island"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    // Returned to hand this turn (not drawn).
    const opt = moveObject(s, idOf(s, "p1", "graveyard", "Opt"), "hand") as string;
    const offered: string[][] = [];
    s = advanceUntil(s, (x) => x.turn.step === "draw" && x.pending?.kind === "choice");
    let n = 0;
    s = settle(s, (req) => {
      if (req.type === "yesNo") return [++n === 1 ? 1 : 0];
      if (req.type === "pick") offered.push(req.options.map(String));
      return undefined;
    });
    expect(offered).toHaveLength(2);
    expect(offered[0]).toHaveLength(3);
    expect(offered.every((o) => !o.includes(opt))).toBe(true);
    expect(s.players.p1?.hand).toContain(opt);
  });

  it("Notion Thief: the thief's draw is a draw (an opposing thief replaces it in turn, but not twice)", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Notion Thief"], library: lands("Island", 3) },
      p2: { battlefield: ["Notion Thief"], library: lands("Swamp", 3) },
      p3: { library: lands("Forest", 3) },
    });
    // p3 draws (not their draw step): one thief draws instead; the other thief, an opponent of the first, replaces that
    // draw in turn; the first thief doesn't apply again (614.5): p1 or p2 ends up with the card.
    drawCards(s, "p3", 1);
    expect(s.players.p3?.hand).toHaveLength(0);
    expect((s.players.p1?.hand.length ?? 0) + (s.players.p2?.hand.length ?? 0)).toBe(1);
    // p1 draws: p2's thief draws instead, then p1's thief replaces p2's draw: p1 draws after all.
    const before = s.players.p1?.hand.length ?? 0;
    drawCards(s, "p1", 1);
    expect(s.players.p1?.hand.length).toBe(before + 1);
    expect(s.players.p1?.library).toHaveLength(3 - before - 1);
  });
});

describe("PLAN-M M11a: Library of Leng asks which discarded cards go on top", () => {
  const DISCARD_TWO = customCard({
    name: "Test discard two",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: spell([], [fx.discard(2)]),
  });
  const setup = () =>
    scenario({
      p1: { battlefield: ["Library of Leng"], hand: [DISCARD_TWO, "Shock", "Lightning Strike", "Opt"], library: ["Forest"] },
    });

  it("each card discarded by an effect: on top or into the graveyard, as the player chooses (not all on top)", () => {
    let s = setup();
    const shock = idOf(s, "p1", "hand", "Shock");
    const strike = idOf(s, "p1", "hand", "Lightning Strike");
    let asked: string[] | undefined;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test discard two") }), (req) => {
      if (req.intent === "discard") return [shock, strike];
      if (req.intent !== "libraryTop" || req.type !== "pick") return undefined;
      asked = req.options;
      // Suggested: both on top (the former automatic choice).
      expect(req.suggested).toEqual([shock, strike]);
      return [strike];
    });
    expect(asked).toEqual([shock, strike]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Lightning Strike");
    expect(nameOf(s, s.players.p1?.library[1] as string)).toBe("Forest");
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(expect.arrayContaining(["Shock"]));
  });

  it("several on top: in the order of the answer, the last one on top", () => {
    let s = setup();
    const shock = idOf(s, "p1", "hand", "Shock");
    const strike = idOf(s, "p1", "hand", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test discard two") }), (req) =>
      req.intent === "discard" ? [shock, strike] : req.intent === "libraryTop" ? [strike, shock] : undefined,
    );
    expect(s.players.p1?.library.slice(0, 3).map((id) => nameOf(s, id))).toEqual(["Shock", "Lightning Strike", "Forest"]);
  });
});
