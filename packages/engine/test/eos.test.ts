/** Stellar Sights (EOS) : card rules tests (PLAN-G). */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { activated, fx } from "../src/dsl";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { chars } from "../src/state";
import { answerLeylines } from "../src/turn";
import { act, advanceUntil, attack, castable, customCard, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;

describe("Stellar Sights", () => {
  describe("Exaltation (702.83): Cathedral of War", () => {
    it("a creature that attacks alone gets +1/+1; not if two creatures attack", () => {
      const base = () => scenario({ p1: { battlefield: ["Cathedral of War", "Bear Cub", "Bear Cub"] } });
      let s = base();
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [a as string]));
      expect(chars(s, a as string).power).toBe(3);
      s = base();
      s = settle(attack(s, [a as string, b as string]));
      expect(chars(s, a as string).power).toBe(2);
    });

    it("enters tapped", () => {
      let s = scenario({ p1: { hand: ["Cathedral of War"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Cathedral of War") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Cathedral of War")]?.tapped).toBe(true);
    });
  });

  describe("Modulaire (702.43): Power Depot", () => {
    it("enters tapped with a +1/+1 counter", () => {
      let s = scenario({ p1: { hand: ["Power Depot"], battlefield: lands("Forest", 1) } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Power Depot") });
      const depot = idOf(s, "p1", "battlefield", "Power Depot");
      expect(s.objects[depot]?.tapped).toBe(true);
      expect(s.objects[depot]?.counters["+1/+1"]).toBe(1);
    });

    it("put into the graveyard from the battlefield (it is not a creature), its counter can go on an artifact creature", () => {
      const construct = customCard({
        name: "Test Construct",
        types: ["Artifact", "Creature"],
        typeLine: "Artifact Creature — Construct",
        power: 1,
        toughness: 1,
      });
      let s = scenario({ p1: { battlefield: [{ name: "Power Depot", counters: { "+1/+1": 1 } }, construct] } });
      const depot = idOf(s, "p1", "battlefield", "Power Depot");
      const c = idOf(s, "p1", "battlefield", "Test Construct");
      destroy(s, depot);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(c) ? [c] : undefined));
      expect(idsOf(s, "p1", "graveyard", "Power Depot")).toHaveLength(1);
      expect(s.objects[c]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, c).power).toBe(2);
    });
  });

  describe("Eldrazi Temple", () => {
    const eldrazi = (name: string, manaCostText: string, generic: number, colored: Record<string, number>) =>
      customCard({
        name,
        manaCost: { generic, colored, x: 0 },
        manaCostText,
        colors: Object.keys(colored) as never,
        subtypes: ["Eldrazi"],
        typeLine: "Creature — Eldrazi",
        power: 3,
        toughness: 3,
        abilities: [activated({ mana: "{2}", effects: [fx.gainLife(1)], label: "Gagnez 1 PV" })],
      });
    const COLORLESS = eldrazi("Test Colorless Eldrazi", "{3}", 3, {});
    const GREEN = eldrazi("Test Green Eldrazi", "{2}{G}", 2, { G: 1 });

    it("{C}{C} for a colorless Eldrazi spell; not for a colored Eldrazi", () => {
      const s = scenario({ p1: { battlefield: ["Eldrazi Temple", "Forest"], hand: [COLORLESS, GREEN] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Colorless Eldrazi"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Test Green Eldrazi"))).toBe(false);
    });

    it("{C}{C} for a colorless Eldrazi's ability; not for a colored Eldrazi's", () => {
      const s = scenario({ p1: { battlefield: ["Eldrazi Temple", COLORLESS, GREEN] } });
      const can = (name: string) =>
        legalActions(s, "p1").some((a) => a.type === "activate" && a.source === idOf(s, "p1", "battlefield", name));
      expect(can("Test Colorless Eldrazi")).toBe(true);
      expect(can("Test Green Eldrazi")).toBe(false);
    });
  });

  describe("G3a: terrains", () => {
    const tapMana = (s: S, name: string, ability = 0, color?: string) =>
      act(s, "p1", {
        type: "tapForMana",
        source: idOf(s, "p1", "battlefield", name),
        ability,
        ...(color ? { color } : {}),
      } as never);

    it("Ancient Tomb: {C}{C}, and 2 damage to you", () => {
      let s = scenario({ p1: { battlefield: ["Ancient Tomb"] } });
      s = tapMana(s, "Ancient Tomb");
      expect(s.players.p1?.manaPool.C).toBe(2);
      expect(s.players.p1?.life).toBe(18);
    });

    it("Grove of the Burnwillows: {R} or {G}, and each opponent gains 1 life; {C} with no drawback", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Grove of the Burnwillows"] } });
      s = tapMana(s, "Grove of the Burnwillows", 1, "G");
      expect(s.players.p1?.manaPool.G).toBe(1);
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([21, 21]);
    });

    it("Mana Confluence: one mana of any color for 1 life", () => {
      let s = scenario({ p1: { battlefield: ["Mana Confluence"] } });
      s = tapMana(s, "Mana Confluence", 0, "B");
      expect([s.players.p1?.manaPool.B, s.players.p1?.life]).toEqual([1, 19]);
    });

    it("Celestial Colonnade: enters tapped; becomes a 4/4 flying creature with vigilance, still a land", () => {
      let s = scenario({ p1: { battlefield: ["Celestial Colonnade", ...lands("Plains", 3), ...lands("Island", 2)] } });
      const col = idOf(s, "p1", "battlefield", "Celestial Colonnade");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === col);
      s = settle(act(s, "p1", { type: "activate", source: col, ability: ab?.type === "activate" ? ab.ability : 0 }));
      const c = chars(s, col);
      expect([c.power, c.toughness, c.types.includes("Land"), c.types.includes("Creature")]).toEqual([4, 4, true, true]);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(c.colors.sort()).toEqual(["U", "W"]);
    });

    it("Mutavault: a 2/2 of every creature type", () => {
      let s = scenario({ p1: { battlefield: ["Mutavault", "Plains"] } });
      const m = idOf(s, "p1", "battlefield", "Mutavault");
      s = settle(act(s, "p1", { type: "activate", source: m, ability: 1 }));
      expect([chars(s, m).power, chars(s, m).keywords.includes("changeling")]).toEqual([2, true]);
    });

    it("Wandering Fumarole: {0} swaps power and toughness", () => {
      let s = scenario({ p1: { battlefield: ["Wandering Fumarole", ...lands("Island", 2), ...lands("Mountain", 2)] } });
      const f = idOf(s, "p1", "battlefield", "Wandering Fumarole");
      const animate = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === f);
      s = settle(act(s, "p1", { type: "activate", source: f, ability: animate?.type === "activate" ? animate.ability : 0 }));
      expect([chars(s, f).power, chars(s, f).toughness]).toEqual([1, 4]);
      const swap = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === f && a.label?.startsWith("Switch"));
      s = settle(act(s, "p1", { type: "activate", source: f, ability: swap?.type === "activate" ? swap.ability : 0 }));
      expect([chars(s, f).power, chars(s, f).toughness]).toEqual([4, 1]);
    });

    it("Strip Mine and Dust Bowl: destroy a land (nonbasic for Dust Bowl, sacrificing a land)", () => {
      let s = scenario({ p1: { battlefield: ["Strip Mine"] }, p2: { battlefield: ["Forest"] } });
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Strip Mine"),
          ability: 1,
          targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Strip Mine")).toHaveLength(1);
      const t = scenario({
        p1: { battlefield: ["Dust Bowl", ...lands("Plains", 3), "Plains"] },
        p2: { battlefield: ["Forest", "Mana Confluence"] },
      });
      const bowl = idOf(t, "p1", "battlefield", "Dust Bowl");
      const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === bowl);
      // Nonbasic lands only (Dust Bowl itself is one): not the Forest.
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toContain(idOf(t, "p2", "battlefield", "Mana Confluence"));
      expect(legal).not.toContain(idOf(t, "p2", "battlefield", "Forest"));
    });

    it("Lotus Field: when it enters, sacrifice two lands; three mana of one color", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Lotus Field"] } });
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Lotus Field") }));
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
      const lotus = idOf(s, "p1", "battlefield", "Lotus Field");
      (s.objects[lotus] as { tapped: boolean }).tapped = false;
      s = tapMana(s, "Lotus Field", 0, "U");
      expect(s.players.p1?.manaPool.U).toBe(3);
    });

    it("Contested War Zone: the creature that deals combat damage to you gives this land to its controller", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Contested War Zone"] }, p2: { battlefield: ["Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.objects[s.battlefield.find((id) => nameOf(s, id) === "Contested War Zone") as string]?.controller).toBe("p2");
    });

    it("Mystifying Maze: the opposing attacker is exiled, then returns tapped at the end step", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Mystifying Maze", ...lands("Plains", 4)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
      });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Mystifying Maze"),
          ability: 1,
          targets: { t: [bear] },
        }),
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p1");
      const back = idsOf(s, "p2", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.tapped).toBe(true);
    });

    it("Endless Sands: exiles your creatures, then returns them by sacrificing itself", () => {
      let s = scenario({ p1: { battlefield: ["Endless Sands", "Bear Cub", ...lands("Plains", 6)] } });
      const sands = idOf(s, "p1", "battlefield", "Endless Sands");
      s = settle(
        act(s, "p1", { type: "activate", source: sands, ability: 1, targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      );
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      (s.objects[sands] as { tapped: boolean }).tapped = false;
      s = settle(act(s, "p1", { type: "activate", source: sands, ability: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Endless Sands")).toHaveLength(1);
    });

    it("Thespian's Stage: becomes a copy of the targeted land and keeps its ability", () => {
      let s = scenario({
        p1: { battlefield: ["Thespian's Stage", ...lands("Plains", 2)] },
        p2: { battlefield: ["Ancient Tomb"] },
      });
      const stage = idOf(s, "p1", "battlefield", "Thespian's Stage");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: stage,
          ability: 1,
          targets: { t: [idOf(s, "p2", "battlefield", "Ancient Tomb")] },
        }),
      );
      expect(nameOf(s, stage)).toBe("Thespian's Stage");
      expect(chars(s, stage).name).toBe("Ancient Tomb");
      expect(chars(s, stage).abilities.some((a) => a.kind === "activated" && a.label === "Becomes a copy of target land")).toBe(
        true,
      );
    });
  });

  describe("G3b: lands that need engine support", () => {
    const RAT = customCard({ name: "Test Rat", subtypes: ["Rat"], typeLine: "Creature — Rat", power: 1, toughness: 1 });
    const LEGEND = customCard({
      name: "Test Legend",
      supertypes: ["Legendary"],
      colors: ["R"],
      typeLine: "Legendary Creature",
      power: 2,
      toughness: 2,
    });

    it("Inkmoth Nexus: infect, poison counters on players and -1/-1 counters on creatures (702.90)", () => {
      let s = scenario({ p1: { battlefield: ["Inkmoth Nexus", "Plains"] } });
      const nexus = idOf(s, "p1", "battlefield", "Inkmoth Nexus");
      s = settle(act(s, "p1", { type: "activate", source: nexus, ability: 1 }));
      expect(chars(s, nexus).keywords).toEqual(expect.arrayContaining(["flying", "infect"]));
      // Automatic payment may have tapped the Nexus itself for {1}.
      (s.objects[nexus] as { tapped: boolean }).tapped = false;
      s = attack(s, [nexus]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect([s.players.p2?.life, s.players.p2?.counters?.poison]).toEqual([20, 1]);
    });

    it("Swarmyard: regeneration replaces the next destruction this turn (tapped, damage removed)", () => {
      let s = scenario({ p1: { battlefield: ["Swarmyard", RAT] } });
      const rat = idOf(s, "p1", "battlefield", "Test Rat");
      s = settle(
        act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Swarmyard"), ability: 1, targets: { t: [rat] } }),
      );
      expect(s.objects[rat]?.regenShields).toBe(1);
      expect(destroy(s, rat)).toBe(false);
      expect([s.objects[rat]?.zone, s.objects[rat]?.tapped, s.objects[rat]?.regenShields]).toEqual([
        "battlefield",
        true,
        undefined,
      ]);
      // No more shield: the next destruction happens.
      expect(destroy(s, rat)).toBe(true);
    });

    it("Swarmyard: only an Insect, a Rat, a Spider or a Squirrel", () => {
      const s = scenario({ p1: { battlefield: ["Swarmyard", RAT, "Bear Cub"] } });
      const yard = idOf(s, "p1", "battlefield", "Swarmyard");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === yard);
      expect(ab?.type === "activate" && ab.targets[0]?.legal).toEqual([idOf(s, "p1", "battlefield", "Test Rat")]);
    });

    it("Meteor Crater and Plaza of Heroes: the colors of your permanents (legendary for Plaza)", () => {
      const s = scenario({ p1: { battlefield: ["Meteor Crater", "Plaza of Heroes", LEGEND, "Bear Cub"] } });
      const crater = manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Meteor Crater"))[0];
      expect(crater?.produce).toEqual(["R", "G"]);
      const plaza = manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Plaza of Heroes"));
      expect(plaza[2]?.produce).toEqual(["R"]);
    });

    it("Reflecting Pool: the types your other lands could produce", () => {
      const s = scenario({ p1: { battlefield: ["Reflecting Pool", "Forest", "Ancient Tomb"] } });
      expect(manaAbilitiesOf(s, idOf(s, "p1", "battlefield", "Reflecting Pool"))[0]?.produce).toEqual(["G", "C"]);
      const alone = scenario({ p1: { battlefield: ["Reflecting Pool"] } });
      expect(manaAbilitiesOf(alone, idOf(alone, "p1", "battlefield", "Reflecting Pool"))[0]?.produce).toEqual([]);
    });

    it("Reflecting Pool: Command Tower's colors count; another Reflecting Pool doesn't (106.7; PLAN-M M7)", () => {
      const s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Reflecting Pool", "Reflecting Pool", "Command Tower"] },
      });
      for (const pool of idsOf(s, "p1", "battlefield", "Reflecting Pool"))
        expect(manaAbilitiesOf(s, pool)[0]?.produce).toEqual(["W", "B", "R"]);
    });

    it("Blast Zone: destroys nonland permanents with mana value equal to its charge counters", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Blast Zone", counters: { charge: 2 } }, ...lands("Plains", 3)] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
      const zone = idOf(s, "p1", "battlefield", "Blast Zone");
      const ab = legalActions(s, "p1")
        .filter((a) => a.type === "activate" && a.source === zone)
        .at(-1);
      s = settle(act(s, "p1", { type: "activate", source: zone, ability: ab?.type === "activate" ? ab.ability : 0 }));
      // Bear Cub costs {1}{G}: destroyed; Llanowar Elves ({G}) and the Forest remain.
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Nesting Grounds: moves a counter from one of your permanents onto another", () => {
      let s = scenario({
        p1: { battlefield: ["Nesting Grounds", "Plains", { name: "Bear Cub", counters: { "+1/+1": 2 } }] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Nesting Grounds"),
          ability: 1,
          targets: { a: [cub], b: [elves] },
        }),
      );
      expect([s.objects[cub]?.counters["+1/+1"], s.objects[elves]?.counters["+1/+1"]]).toEqual([1, 1]);
    });

    it("Gemstone Caverns: in the opening hand without starting, on the battlefield with a luck counter", () => {
      let s = scenario({ p2: { hand: ["Gemstone Caverns", "Bear Cub", "Forest"] } });
      answerLeylines(s, "p2", [idOf(s, "p2", "hand", "Gemstone Caverns")]);
      const gem = idOf(s, "p2", "battlefield", "Gemstone Caverns");
      expect(s.objects[gem]?.counters.luck).toBe(1);
      // "If you do, exile a card from your hand": asked at the next check (PLAN-M M11c); suggestion: the cheapest
      // nonland card. One mana of any color.
      expect(s.exile).toEqual([]);
      s = act(s, "p1", { type: "pass" });
      const asked = s.pending?.kind === "choice" ? s.pending : undefined;
      expect(asked?.player).toBe("p2");
      expect(asked?.request.type === "pick" && asked.request.options.map((id) => nameOf(s, id))).toEqual(["Bear Cub", "Forest"]);
      expect(asked?.request.suggested.map((id) => nameOf(s, String(id)))).toEqual(["Bear Cub"]);
      s = act(s, "p2", { type: "choose", values: idsOf(s, "p2", "hand", "Forest") });
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(s.pending?.kind).toBe("priority");
      const abs = manaAbilitiesOf(s, gem);
      expect(abs.map((a) => a.produce.length)).toEqual([1, 5]);
      // The first player cannot.
      const t = scenario({ p1: { hand: ["Gemstone Caverns"] } });
      answerLeylines(t, "p1", [idOf(t, "p1", "hand", "Gemstone Caverns")]);
      expect(idsOf(t, "p1", "hand", "Gemstone Caverns")).toHaveLength(1);
    });
  });
  describe("L11: utility lands", () => {
    const float = (s: S, ...names: string[]) => {
      let cur = s;
      for (const n of names) {
        const id = cur.battlefield.find((x) => nameOf(cur, x) === n && !cur.objects[x]?.tapped) as string;
        cur = act(cur, "p1", { type: "tapForMana", source: id, ability: 0 });
      }
      return cur;
    };
    const libraryCard = (s: S, name: string) => s.players.p1?.library.find((id) => nameOf(s, id) === name) as string;

    it("Deserted Temple: {C}; {1}, {T}: untap target land", () => {
      let s = scenario({ p1: { battlefield: ["Deserted Temple", "Plains", { name: "Forest", tapped: true }] } });
      const temple = idOf(s, "p1", "battlefield", "Deserted Temple");
      expect(manaAbilitiesOf(s, temple)[0]?.produce).toEqual(["C"]);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(act(float(s, "Plains"), "p1", { type: "activate", source: temple, ability: 1, targets: { t: [forest] } }));
      expect([s.objects[forest]?.tapped, s.objects[temple]?.tapped]).toEqual([false, true]);
    });

    it("Inventors' Fair: 1 life at your upkeep with three artifacts; tutor activated only with three artifacts", () => {
      const upkeep = (artifacts: number) => {
        const s = scenario({
          active: "p2",
          step: "end",
          p1: { battlefield: ["Inventors' Fair", ...Array(artifacts).fill("Sol Ring")] },
        });
        return advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw").players.p1?.life;
      };
      expect([upkeep(3), upkeep(2)]).toEqual([21, 20]);
      const base = (artifacts: number) =>
        scenario({
          p1: {
            battlefield: ["Inventors' Fair", ...lands("Plains", 4), ...Array(artifacts).fill("Sol Ring")],
            library: ["Forest", "Mana Crypt", "Forest"],
          },
        });
      const two = base(2);
      const fair2 = idOf(two, "p1", "battlefield", "Inventors' Fair");
      expect(legalActions(two, "p1").some((a) => a.type === "activate" && a.source === fair2 && a.ability === 2)).toBe(false);
      let s = base(3);
      const crypt = libraryCard(s, "Mana Crypt");
      s = float(s, "Plains", "Plains", "Plains", "Plains");
      s = settle(
        act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Inventors' Fair"), ability: 2 }),
        (req) => (req.type === "pick" && req.options.includes(crypt) ? [crypt] : undefined),
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Mana Crypt"]);
      expect(idsOf(s, "p1", "graveyard", "Inventors' Fair")).toHaveLength(1);
    });

    it("Mirrorpool: enters tapped; copies your instant, or creates a token copy of your creature (sacrificed)", () => {
      let s = scenario({ p1: { hand: ["Mirrorpool"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mirrorpool") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Mirrorpool")]?.tapped).toBe(true);
      s = scenario({ p1: { battlefield: ["Mirrorpool", "Ancient Tomb", ...lands("Mountain", 2)], hand: ["Shock"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      const shock = s.stack[0]?.id as string;
      s = float(s, "Ancient Tomb", "Mountain");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: idOf(s, "p1", "battlefield", "Mirrorpool"),
          ability: 2,
          targets: { t: [shock] },
        }),
      );
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "graveyard", "Mirrorpool")).toHaveLength(1);
      s = scenario({ p1: { battlefield: ["Mirrorpool", "Ancient Tomb", ...lands("Mountain", 3), "Bear Cub"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = float(s, "Ancient Tomb", "Mountain", "Mountain", "Mountain");
      s = settle(
        act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Mirrorpool"), ability: 3, targets: { t: [cub] } }),
      );
      const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(cubs).toHaveLength(2);
      expect(cubs.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Mirrorpool")).toHaveLength(1);
    });

    it("Petrified Field: {T}, sacrifice it: a land card from your graveyard returns to your hand", () => {
      let s = scenario({ p1: { battlefield: ["Petrified Field"], graveyard: ["Forest", "Bear Cub"] } });
      const field = idOf(s, "p1", "battlefield", "Petrified Field");
      expect(manaAbilitiesOf(s, field)[0]?.produce).toEqual(["C"]);
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === field);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Forest")]);
      s = settle(
        act(s, "p1", { type: "activate", source: field, ability: 1, targets: { t: [idOf(s, "p1", "graveyard", "Forest")] } }),
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest"]);
      expect(idsOf(s, "p1", "graveyard", "Petrified Field")).toHaveLength(1);
    });

    it("Blinkmoth Nexus: a 1/1 flying Blinkmoth artifact creature until end of turn, still a land; {1}, {T}: a Blinkmoth gets +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Blinkmoth Nexus", "Blinkmoth Nexus", ...lands("Plains", 2)] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Blinkmoth Nexus") as [string, string];
      expect(manaAbilitiesOf(s, a)[0]?.produce).toEqual(["C"]);
      s = settle(act(float(s, "Plains"), "p1", { type: "activate", source: a, ability: 1 }));
      const c = chars(s, a);
      expect([c.power, c.toughness, [...c.types].sort(), c.subtypes, c.keywords]).toEqual([
        1,
        1,
        ["Artifact", "Creature", "Land"],
        ["Blinkmoth"],
        ["flying"],
      ]);
      // The other Nexus is not a creature: not a legal target of the pump.
      const pump = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === b && x.ability === 2);
      expect(pump?.type === "activate" && pump.targets[0]?.legal).toEqual([a]);
      s = settle(act(float(s, "Plains"), "p1", { type: "activate", source: b, ability: 2, targets: { t: [a] } }));
      expect([chars(s, a).power, chars(s, a).toughness]).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, a).types, chars(s, a).subtypes, chars(s, a).keywords]).toEqual([["Land"], [], []]);
    });

    it("Bonders' Enclave: {3}, {T}: draw, only if you control a creature with power 4 or greater", () => {
      const run = (creature: string) => scenario({ p1: { battlefield: ["Bonders' Enclave", ...lands("Plains", 3), creature] } });
      const small = run("Bear Cub");
      const e1 = idOf(small, "p1", "battlefield", "Bonders' Enclave");
      expect(legalActions(small, "p1").some((a) => a.type === "activate" && a.source === e1 && a.ability === 1)).toBe(false);
      let s = run("Shivan Dragon");
      s = float(s, "Plains", "Plains", "Plains");
      s = settle(act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "Bonders' Enclave"), ability: 1 }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Cascading Cataracts: indestructible; {5}, {T}: five mana in any combination of colors", () => {
      let s = scenario({ p1: { battlefield: ["Cascading Cataracts", ...lands("Plains", 5)] } });
      const cat = idOf(s, "p1", "battlefield", "Cascading Cataracts");
      expect(destroy(s, cat)).toBe(false);
      s = float(s, "Plains", "Plains", "Plains", "Plains", "Plains");
      s = act(s, "p1", { type: "activate", source: cat, ability: 1 });
      // A mana ability: no stack, the colors are chosen at once.
      expect(s.stack).toHaveLength(0);
      s = act(s, "p1", { type: "choose", values: [2, 1, 0, 1, 1] });
      expect(s.players.p1?.manaPool).toMatchObject({ W: 2, U: 1, B: 0, R: 1, G: 1, C: 0 });
    });

    it("Crystal Quarry: {C}; {5}, {T}: add {W}{U}{B}{R}{G}", () => {
      let s = scenario({ p1: { battlefield: ["Crystal Quarry", ...lands("Plains", 5)] } });
      const q = idOf(s, "p1", "battlefield", "Crystal Quarry");
      expect(manaAbilitiesOf(s, q)[0]?.produce).toEqual(["C"]);
      s = float(s, "Plains", "Plains", "Plains", "Plains", "Plains");
      s = act(s, "p1", { type: "activate", source: q, ability: 1 });
      expect(s.players.p1?.manaPool).toMatchObject({ W: 1, U: 1, B: 1, R: 1, G: 1 });
    });

    it("High Market: {T}, sacrifice a creature: you gain 1 life", () => {
      let s = scenario({ p1: { battlefield: ["High Market", "Bear Cub"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "activate", source: idOf(s, "p1", "battlefield", "High Market"), ability: 1, sacrifice: [cub] }),
      );
      expect([s.players.p1?.life, idsOf(s, "p1", "graveyard", "Bear Cub").length]).toEqual([21, 1]);
    });

    it("Scavenger Grounds: {2}, {T}, sacrifice a Desert (itself included): exile all graveyards", () => {
      let s = scenario({
        p1: { battlefield: ["Scavenger Grounds", ...lands("Plains", 2)], graveyard: ["Bear Cub"] },
        p2: { graveyard: ["Forest", "Shock"] },
      });
      const grounds = idOf(s, "p1", "battlefield", "Scavenger Grounds");
      s = float(s, "Plains", "Plains");
      s = settle(act(s, "p1", { type: "activate", source: grounds, ability: 1, sacrifice: [grounds] }));
      expect([s.players.p1?.graveyard.length, s.players.p2?.graveyard.length]).toEqual([0, 0]);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest", "Scavenger Grounds", "Shock"]);
    });

    it("Terrain Generator: {2}, {T}: you may put a basic land card from your hand onto the battlefield tapped", () => {
      let s = scenario({
        p1: { battlefield: ["Terrain Generator", ...lands("Plains", 2)], hand: ["Forest", "Mana Confluence"] },
      });
      const gen = idOf(s, "p1", "battlefield", "Terrain Generator");
      const forest = idOf(s, "p1", "hand", "Forest");
      s = float(s, "Plains", "Plains");
      let offered: string[] = [];
      s = settle(act(s, "p1", { type: "activate", source: gen, ability: 1 }), (req) => {
        if (req.type !== "pick") return undefined;
        offered = req.options;
        return [forest];
      });
      // The nonbasic land is not offered.
      expect(offered).toEqual([forest]);
      const put = idsOf(s, "p1", "battlefield", "Forest");
      expect(put).toHaveLength(1);
      expect(s.objects[put[0] as string]?.tapped).toBe(true);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Mana Confluence"]);
    });
  });

  describe("L11: creature lands", () => {
    const CASES: [string, string[], [number, number], string[], string][] = [
      ["Creeping Tar Pit", ["Island", "Swamp", "Swamp"], [3, 2], ["B", "U"], "unblockable"],
      ["Hissing Quagmire", ["Swamp", "Forest", "Forest"], [2, 2], ["B", "G"], "deathtouch"],
      ["Lavaclaw Reaches", ["Swamp", "Mountain", "Mountain"], [2, 2], ["B", "R"], ""],
      ["Lumbering Falls", ["Forest", "Island", "Island", "Island"], [3, 3], ["G", "U"], "hexproof"],
      ["Needle Spires", ["Mountain", "Plains", "Plains", "Plains"], [2, 1], ["R", "W"], "doubleStrike"],
      ["Raging Ravine", ["Mountain", "Forest", "Forest", "Forest"], [3, 3], ["G", "R"], ""],
      ["Shambling Vent", ["Plains", "Swamp", "Swamp"], [2, 3], ["B", "W"], "lifelink"],
      ["Stirring Wildwood", ["Forest", "Plains", "Plains"], [3, 4], ["G", "W"], "reach"],
    ];
    const animate = (name: string, basics: string[], extra: string[] = [], theirs: string[] = []) => {
      let s = scenario({ p1: { battlefield: [name, ...basics, ...extra] }, p2: { battlefield: theirs } });
      const land = idOf(s, "p1", "battlefield", name);
      for (const b of basics) {
        const id = s.battlefield.find((x) => nameOf(s, x) === b && !s.objects[x]?.tapped) as string;
        s = act(s, "p1", { type: "tapForMana", source: id, ability: 0 });
      }
      return { s: settle(act(s, "p1", { type: "activate", source: land, ability: 2 })), land };
    };

    it("enter tapped; tap for one of their two colors", () => {
      for (const [name, , , colors] of CASES) {
        let s = scenario({ p1: { hand: [name] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
        const land = idOf(s, "p1", "battlefield", name);
        expect(s.objects[land]?.tapped, name).toBe(true);
        expect([...(manaAbilitiesOf(s, land)[0]?.produce ?? [])].sort(), name).toEqual(colors);
      }
    });

    it("become an Elemental creature of their colors with their P/T and keyword until end of turn, still a land", () => {
      for (const [name, basics, [power, toughness], colors, keyword] of CASES) {
        let { s, land } = animate(name, basics);
        const c = chars(s, land);
        expect([c.power, c.toughness, [...c.types].sort(), c.subtypes, [...c.colors].sort()], name).toEqual([
          power,
          toughness,
          ["Creature", "Land"],
          ["Elemental"],
          colors,
        ]);
        if (keyword) expect(c.keywords, name).toContain(keyword);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, land).types, name).toEqual(["Land"]);
        expect(chars(s, land).colors, name).toEqual([]);
      }
    });

    it("Creeping Tar Pit can't be blocked", () => {
      let { s, land } = animate("Creeping Tar Pit", ["Island", "Swamp", "Swamp"], [], ["Bear Cub"]);
      s = attack(s, [land]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: land }] })).toThrow();
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(17);
    });

    it("Lavaclaw Reaches: the creature has {X}: +X/+0 until end of turn", () => {
      let { s, land } = animate("Lavaclaw Reaches", ["Swamp", "Mountain", "Mountain"], lands("Mountain", 2));
      const pump = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === land && a.label === "+X/+0");
      s = settle(act(s, "p1", { type: "activate", source: land, ability: pump?.type === "activate" ? pump.ability : -1, x: 2 }));
      expect([chars(s, land).power, chars(s, land).toughness]).toEqual([4, 2]);
    });

    it("Raging Ravine: whenever it attacks, a +1/+1 counter on it", () => {
      let { s, land } = animate("Raging Ravine", ["Mountain", "Forest", "Forest", "Forest"]);
      s = settle(attack(s, [land]));
      expect(s.objects[land]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, land).power).toBe(4);
    });
  });
});
