/**
 * The Lost Caverns of Ixalan: Map tokens, Descend (4 and 8, fathomless descent, "descended this turn"),
 * Discover, Cavern mana, "Restless" lands, transform (Treasure Map), exile instead of dying.
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokenCopy, destroy, drawCards, gainLife } from "../src/actions";
import { amount, fx, ref, spell, target, triggered, when } from "../src/dsl";
import { addPump, moveWithSpec } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { bump, chars, untapObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { plainText } from "../src/text";
import { countTurnEvents } from "../src/turnlog";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  attackPlayer,
  canActivate,
  castable,
  castNowOf,
  combatTargetsOffered,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  pickNamed,
  settle as resolve,
  scenario,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const cast = (s: S, name: string, targets?: Record<string, string[]>) =>
  settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), targets }));
const activate = (s: S, source: string, index = 0) => {
  const opts = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === source);
  const a = opts[index];
  return settle(act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1 }));
};
/** Five permanent cards (and two nonpermanents) for Descend. */
const GRAVEYARD_5 = ["Forest", "Llanowar Elves", "Helpful Hunter", "Opt", "Island", "Stab", "Nutrient Block"];

describe("The Lost Caverns of Ixalan", () => {
  it("Get Lost: the creature is destroyed, its controller creates two Maps", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Get Lost"] }, p2: { battlefield: ["Shivan Dragon"] } });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "Get Lost", { t: [dragon] });
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Map")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Map")).toHaveLength(0);
  });

  it("Descend 4: Join the Dead gives -10/-10 with four permanent cards in the graveyard", () => {
    const run = (graveyard: string[]) => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Join the Dead"], graveyard },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      // A 9/9 dragon: it survives -5/-5, not -10/-10.
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      (s.objects[dragon] as { counters: Record<string, number> }).counters["+1/+1"] = 4;
      return cast(s, "Join the Dead", { t: [dragon] });
    };
    expect(idsOf(run(["Opt", "Stab", "Forest"]), "p2", "graveyard", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(run(GRAVEYARD_5), "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Fathomless descent: Song of Stupefaction gives -X/-0 (permanent cards in your graveyard)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Song of Stupefaction"], graveyard: GRAVEYARD_5, library: lands("Opt", 5) },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "Song of Stupefaction", { enchant: [dragon] });
    // The optional mill adds two instants (nonpermanents): X stays 5.
    expect(chars(s, dragon).power).toBe(0);
  });

  it("Terror Tide: all creatures get -X/-X", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Terror Tide"], graveyard: GRAVEYARD_5 },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = cast(s, "Terror Tide");
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Malicious Eclipse: opposing creatures that die are exiled", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Malicious Eclipse"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = cast(s, "Malicious Eclipse");
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(0);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(1);
  });

  it("Restless Reef: becomes a 4/4 creature with deathtouch until end of turn", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2), "Restless Reef"] } });
    const reef = idOf(s, "p1", "battlefield", "Restless Reef");
    s = activate(s, reef);
    const c = chars(s, reef);
    expect(c.types).toContain("Creature");
    expect(c.types).toContain("Land");
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toContain("deathtouch");
  });

  it("Treasure Map: at the third landmark counter, it transforms and creates three Treasures", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Treasure Map // Treasure Cove"], library: lands("Plains", 3) },
    });
    const map = idOf(s, "p1", "battlefield", "Treasure Map // Treasure Cove");
    (s.objects[map] as { counters: Record<string, number> }).counters.landmark = 2;
    s = activate(s, map);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(3);
    const cove = s.battlefield.find((id) => chars(s, id).name === "Treasure Cove");
    expect(cove).toBeDefined();
    expect(s.objects[cove as string]?.counters.landmark ?? 0).toBe(0);
  });

  describe("Discover", () => {
    const LIBRARY = ["Forest", "Island", "Shivan Dragon", "Llanowar Elves", "Plains", "Swamp"];
    /** Casts Walk with the Ancestors (discover 4) and answers the "cast or put in hand" question. */
    const discover = (castIt: boolean, extra: string[] = []) => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), ...extra], hand: ["Walk with the Ancestors"], library: LIBRARY },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Walk with the Ancestors"), targets: { t: [] } });
      for (let i = 0; i < 50 && s.stack.length + (s.pending?.kind === "choice" ? 1 : 0) > 0; i++) {
        const p = s.pending;
        if (p?.kind === "priority" && p.castNow) {
          const card = p.castNow.cards[0] as string;
          s = act(s, p.player, castIt ? { type: "cast", card } : { type: "pass" });
        } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
        else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      }
      return s;
    };
    const names = (s: S, ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

    it("exiles up to one nonland card with mana value 4 or less, the rest goes to the bottom", () => {
      const s = discover(false);
      expect(names(s, s.players.p1?.hand ?? [])).toContain("Llanowar Elves");
      const lib = names(s, s.players.p1?.library ?? []);
      expect(lib.slice(0, 2)).toEqual(["Plains", "Swamp"]);
      expect([...lib.slice(2)].sort()).toEqual(["Forest", "Island", "Shivan Dragon"]);
    });

    it("the discovered card is cast during resolution, without paying its mana cost (608.2g)", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Walk with the Ancestors"], library: LIBRARY },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Walk with the Ancestors"), targets: { t: [] } });
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      const p = s.pending;
      if (p?.kind !== "priority" || !p.castNow) throw new Error("lancer maintenant attendu");
      const elves = p.castNow.cards[0] as string;
      expect(names(s, [elves])).toEqual(["Llanowar Elves"]);
      // Only the discovered card may be cast; nothing else (land, abilities).
      expect(
        legalActions(s, "p1")
          .map((a) => a.type)
          .sort(),
      ).toEqual(["cast", "pass"]);
      s = act(s, "p1", { type: "cast", card: elves });
      // Walk with the Ancestors has finished resolving; the Elves are on the stack, with no mana spent.
      expect(s.stack.map((x) => s.defs[x.sourceDefId]?.name)).toEqual(["Llanowar Elves"]);
      expect(s.players.p1?.graveyard.map((id) => names(s, [id])[0])).toContain("Walk with the Ancestors");
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      // No permission remains.
      expect(s.playPermissions ?? []).toHaveLength(0);
    });

    it("Curator of Sun's Creation: discover again, once per turn", () => {
      const s = discover(false, ["Curator of Sun's Creation"]);
      // First discover: Llanowar Elves; the second (same value): Shivan Dragon is too expensive, nothing else.
      expect(names(s, s.players.p1?.hand ?? [])).toContain("Llanowar Elves");
      expect(s.players.p1?.library.length).toBe(5);
    });

    it("Hit the Mother Lode: tapped Treasures for the difference from 10", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Hit the Mother Lode"], library: LIBRARY } });
      s = cast(s, "Hit the Mother Lode");
      const treasures = idsOf(s, "p1", "battlefield", "Treasure");
      // Shivan Dragon (mana value 6) is discovered: 4 Treasures.
      expect(treasures).toHaveLength(4);
      expect(treasures.every((id) => s.objects[id]?.tapped)).toBe(true);
    });
  });

  it("Descend: a permanent card put into the graveyard triggers Deep Goblin Skulltaker", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 2), "Deep Goblin Skulltaker"],
        hand: ["Deathcap Marionette"],
        library: ["Forest", "Opt", "Plains", "Swamp"],
      },
    });
    s = cast(s, "Deathcap Marionette");
    // Turn log: a permanent card put into your graveyard (Descend).
    const descent = amount.descendedThisTurn;
    expect(typeof descent === "object" && descent.kind === "turnEvents" && countTurnEvents(s, descent.query, "p1")).toBe(1);
    const goblin = idOf(s, "p1", "battlefield", "Deep Goblin Skulltaker");
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number > 3);
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(1);
  });

  it("Bat Colony: one Bat per Cavern mana spent", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Promising Vein", "Volatile Fault"], hand: ["Bat Colony"] } });
    s = cast(s, "Bat Colony");
    expect(idsOf(s, "p1", "battlefield", "Bat")).toHaveLength(2);
  });

  describe("Fabrication", () => {
    const craftOption = (s: S, source: string) =>
      legalActions(s, "p1").find(
        (a) =>
          a.type === "activate" &&
          a.source === source &&
          s.defs[s.objects[source]?.defId ?? ""]?.abilities[a.ability]?.kind === "activated",
      );
    const doCraft = (s: S, source: string) => {
      const a = craftOption(s, source);
      if (a?.type !== "activate") throw new Error("fabrication indisponible");
      return settle(act(s, "p1", { type: "activate", source, ability: a.ability }));
    };
    const byName = (s: S, name: string) => s.battlefield.find((id) => chars(s, id).name === name);

    it("Clay-Fired Bricks: exiles an artifact from the graveyard and returns as Cosmium Kiln", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"], graveyard: ["Nutrient Block"] },
      });
      const bricks = idOf(s, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln");
      s = doCraft(s, bricks);
      const kiln = byName(s, "Cosmium Kiln") as string;
      expect(kiln).toBeDefined();
      expect(idsOf(s, "p1", "graveyard", "Nutrient Block")).toHaveLength(0);
      expect(s.objects[kiln]?.linked?.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Nutrient Block"]);
      const gnomes = idsOf(s, "p1", "battlefield", "Gnome");
      expect(gnomes).toHaveLength(2);
      expect(chars(s, gnomes[0] as string).power).toBe(2);
    });

    it("Cryptex paying for the craft does not take a material chosen as evidence", () => {
      const visage = "Visage of Dread // Dread Osseosaur";
      const setup = (graveyard: string[]) =>
        scenario({ p1: { battlefield: [...lands("Swamp", 5), "Cryptex", visage, "Bear Cub"], graveyard } });
      // The Dragon is a material (graveyard first) and the only possible evidence: the craft is not payable.
      const t = setup(["Shivan Dragon"]);
      const source = idOf(t, "p1", "battlefield", visage);
      expect(craftOption(t, source)).toBeUndefined();
      expect(() => act(t, "p1", { type: "activate", source, ability: 1 })).toThrow(RulesError);
      // With another piece of evidence, Cryptex exiles it and both materials are linked to the back face.
      let s = setup(["Shivan Dragon", "Day of Judgment"]);
      s = doCraft(s, idOf(s, "p1", "battlefield", visage));
      expect(byName(s, "Dread Osseosaur")).toBeDefined();
      const exiled = s.exile.map((id) => nameOf(s, id));
      expect(exiled).toEqual(expect.arrayContaining(["Shivan Dragon", "Bear Cub", "Day of Judgment"]));
    });

    it("without material, or outside the sorcery, the craft is not offered", () => {
      const s = scenario({ p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"] } });
      expect(craftOption(s, idOf(s, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln"))).toBeUndefined();
      const t = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Clay-Fired Bricks // Cosmium Kiln"], graveyard: ["Nutrient Block"] },
        step: "upkeep",
      });
      expect(craftOption(t, idOf(t, "p1", "battlefield", "Clay-Fired Bricks // Cosmium Kiln"))).toBeUndefined();
    });

    it("Market Gnome exiled for a craft: +1 life and a card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), "Oteclan Landmark // Oteclan Levitator", "Market Gnome"],
          library: lands("Plains", 3),
        },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      s = doCraft(s, idOf(s, "p1", "battlefield", "Oteclan Landmark // Oteclan Levitator"));
      expect(byName(s, "Oteclan Levitator")).toBeDefined();
      expect(s.players.p1?.life).toBe(21);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Mastercraft Raptor: power equal to the total power of the exiled Dinosaurs", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Saheeli's Lattice // Mastercraft Raptor"],
          graveyard: ["Earthshaker Dreadmaw", "Cavern Stomper", "Llanowar Elves"],
        },
      });
      s = doCraft(s, idOf(s, "p1", "battlefield", "Saheeli's Lattice // Mastercraft Raptor"));
      const raptor = byName(s, "Mastercraft Raptor") as string;
      expect(chars(s, raptor).power).toBe(13);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    });

    it("Mastercraft Raptor: the player chooses its materials (a single Dinosaur)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Saheeli's Lattice // Mastercraft Raptor"],
          graveyard: ["Earthshaker Dreadmaw", "Cavern Stomper", "Llanowar Elves"],
        },
      });
      const lattice = idOf(s, "p1", "battlefield", "Saheeli's Lattice // Mastercraft Raptor");
      const a = craftOption(s, lattice);
      if (a?.type !== "activate") throw new Error("fabrication indisponible");
      const spec = a.additional?.materials;
      // "One or more Dinosaurs": 1 to 2 materials; by default, the whole matching graveyard.
      expect([spec?.min, spec?.max, spec?.suggested.length]).toEqual([1, 2, 2]);
      const stomper = idOf(s, "p1", "graveyard", "Cavern Stomper");
      const stomperPower = s.defs[s.objects[stomper]?.defId ?? ""]?.power;
      const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      expect(() => act(s, "p1", { type: "activate", source: lattice, ability: a.ability, materials: [elves] })).toThrow(
        /Invalid craft materials/,
      );
      s = settle(act(s, "p1", { type: "activate", source: lattice, ability: a.ability, materials: [stomper] }));
      const raptor = byName(s, "Mastercraft Raptor") as string;
      // Raptor's power: that of the single exiled Dinosaur.
      expect(chars(s, raptor).power).toBe(stomperPower);
      expect(idsOf(s, "p1", "graveyard", "Earthshaker Dreadmaw")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Cavern Stomper")).toHaveLength(0);
    });
  });

  describe("Excess damage (120.4a): Magmatic Galleon", () => {
    const shoot = (victim: string) => {
      let s = scenario({
        p1: { battlefield: ["Magmatic Galleon", ...lands("Mountain", 1)], hand: ["Burst Lightning"] },
        p2: { battlefield: [victim] },
      });
      s = cast(s, "Burst Lightning", { t: [idOf(s, "p2", "battlefield", victim)] });
      return s;
    };
    it("2 damage to a 1/1 creature: 1 in excess, a Treasure", () => {
      const s = shoot("Llanowar Elves");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });
    it("2 damage to a 2/2 creature: no excess, no Treasure", () => {
      const s = shoot("Bear Cub");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });
  });

  describe("Legendaries and unique cards", () => {
    it("Ojer Taq: three times as many creature tokens", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), "Ojer Taq, Deepest Foundation // Temple of Civilization"],
          hand: ["Dragon Fodder"],
        },
      });
      s = cast(s, "Dragon Fodder");
      expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(6);
    });

    it("Ojer Axonil: a red source deals at least its power to an opponent", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 1), "Ojer Axonil, Deepest Might // Temple of Power"],
          hand: ["Burst Lightning"],
        },
      });
      s = cast(s, "Burst Lightning", { t: ["p2"] });
      expect(s.players.p2?.life).toBe(16);
      // Turn log: 4 noncombat damage from a red source (condition of Temple of Power).
      expect(
        countTurnEvents(s, { event: "damage", combat: false, source: { controller: "you", colors: ["R"] }, sum: true }, "p1"),
      ).toBe(4);
    });

    it("Bloodletter of Aclazotz: during your turn, the opponent loses double", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 1), "Bloodletter of Aclazotz"], hand: ["Burst Lightning"] } });
      s = cast(s, "Burst Lightning", { t: ["p2"] });
      expect(s.players.p2?.life).toBe(16);
    });

    it("Bitter Triumph: discard a card or pay 3 life", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Bitter Triumph", "Opt"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
      let s = setup();
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bitter Triumph"), targets: { t: [dragon] }, discard: [] }),
      );
      expect(s.players.p1?.life).toBe(17);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      let t = setup();
      const opt = idOf(t, "p1", "hand", "Opt");
      t = settle(
        act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bitter Triumph"), targets: { t: [dragon] }, discard: [opt] }),
      );
      expect(t.players.p1?.life).toBe(20);
      expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Souls of the Lost: a permanent sacrificed in place of a discard; P/T from the permanent cards", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Llanowar Elves"], hand: ["Souls of the Lost"], graveyard: ["Forest", "Opt"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Souls of the Lost"), discard: [elves] }));
      const souls = idOf(s, "p1", "battlefield", "Souls of the Lost");
      // Forest and Llanowar Elves (sacrificed): two permanent cards.
      expect([chars(s, souls).power, chars(s, souls).toughness]).toEqual([2, 3]);
    });

    it("Ojer Pakpatiq: an instant cast from hand gains rebound (cast again during your next upkeep)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 1), "Ojer Pakpatiq, Deepest Epoch // Temple of Cyclical Time"],
          hand: ["Opt"],
          library: lands("Island", 5),
        },
      });
      s = cast(s, "Opt");
      const opt = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt");
      expect(opt).toBeDefined();
      expect(s.delayed.some((d) => d.at === "yourNextUpkeep")).toBe(true);
      // Not castable before the next upkeep.
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === opt)).toBe(false);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && !!x.pending.castNow);
      expect(s.turn.step).toBe("upkeep");
      expect(s.turn.active).toBe("p1");
      const p = s.pending;
      expect(p?.kind === "priority" && p.castNow?.cards).toEqual([opt]);
      s = act(s, "p1", { type: "cast", card: opt as string });
      // Cast again from exile (not from hand): it goes to the graveyard on resolving.
      s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
      expect(s.players.p1?.graveyard.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt")).toBe(true);
    });

    it("Kutzil: opponents can't cast spells during your turn", () => {
      const s = scenario({
        p1: { battlefield: ["Kutzil, Malamet Exemplar"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      });
      expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    });

    it("Cavern of Souls: a creature spell of the chosen type can't be countered", () => {
      let s = scenario({ p1: { battlefield: ["Cavern of Souls"], hand: ["Llanowar Elves"] } });
      const cavern = idOf(s, "p1", "battlefield", "Cavern of Souls");
      (s.objects[cavern] as { chosen?: { creatureType?: string } }).chosen = { creatureType: "Elf" };
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
      expect(s.stack[s.stack.length - 1]?.uncounterable).toBe(true);
    });

    it("Kitesail Larcenist: the opposing creature becomes a Treasure as long as the Larcenist stays", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Kitesail Larcenist"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kitesail Larcenist") });
      for (let i = 0; i < 20 && !(s.pending?.kind === "choice" && s.pending.request.intent === "triggerTarget"); i++) {
        if (s.pending?.kind === "priority") s = act(s, s.pending.player, { type: "pass" });
        else break;
      }
      if (s.pending?.kind === "choice") s = act(s, s.pending.player, { type: "choose", values: [dragon] });
      s = settle(s);
      expect(chars(s, dragon).types).toEqual(["Artifact"]);
      expect(chars(s, dragon).subtypes).toEqual(["Treasure"]);
      const larcenist = idOf(s, "p1", "battlefield", "Kitesail Larcenist");
      (s.objects[larcenist] as { damage: number }).damage = 10;
      s = settle(act(s, "p1", { type: "pass" }));
      expect(chars(s, dragon).types).toContain("Creature");
    });

    it("Deep-Cavern Bat: the exiled card returns to hand when the Bat leaves", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Deep-Cavern Bat", "Stab"] },
        p2: { hand: ["Shivan Dragon"] },
      });
      s = cast(s, "Deep-Cavern Bat", { t: ["p2"] });
      expect(s.players.p2?.hand).toHaveLength(0);
      const bat = idOf(s, "p1", "battlefield", "Deep-Cavern Bat");
      s = cast(s, "Stab", { t: [bat] });
      expect(s.players.p2?.hand).toHaveLength(1);
    });

    it("Unstable Glyphbridge: a creature with power 2 or less spared per player", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Llanowar Elves"], hand: ["Unstable Glyphbridge // Sandswirl Wanderglyph"] },
        p2: { battlefield: ["Llanowar Elves", "Shivan Dragon"] },
      });
      s = cast(s, "Unstable Glyphbridge // Sandswirl Wanderglyph");
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Unstable Glyphbridge with three players: you choose for each player among their creatures with power 2 or less", () => {
      // « for each player, choose a creature with power 2 or less that player controls. Then destroy all creatures except
      // creatures chosen this way. »
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Plains", 5), "Llanowar Elves"], hand: ["Unstable Glyphbridge // Sandswirl Wanderglyph"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Shivan Dragon"] },
        p3: { battlefield: ["Serra Angel"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unstable Glyphbridge // Sandswirl Wanderglyph") });
      const asked: (string | undefined)[][] = [];
      s = resolve(s, (req, p, cur) => {
        if (req.type !== "pick" || !cur) return undefined;
        asked.push([p ?? "", ...namesIn(cur, req.options.map(String)).sort()]);
        return pickNamed(cur, req, "Savannah Lions");
      });
      // A single question: p2's (p1 has only one possible creature, p3 none).
      expect(asked).toEqual([["p1", "Bear Cub", "Savannah Lions"]]);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Savannah Lions")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p3", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("The Mycotyrant: P/T equal to the number of Fungi and Saprolings", () => {
      const s = scenario({ p1: { battlefield: ["The Mycotyrant", "Deathcap Marionette", "Llanowar Elves"] } });
      const myco = idOf(s, "p1", "battlefield", "The Mycotyrant");
      expect(chars(s, myco).power).toBe(2);
    });
  });
  describe("Aclazotz, Deepest Betrayal (fix for TDM lot A)", () => {
    it("an opponent discards a land card: a Bat; a nonland card: nothing", () => {
      const run = (hand: string[]) => {
        let s = scenario({ p1: { battlefield: ["Aclazotz, Deepest Betrayal // Temple of the Dead"] }, p2: { hand } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const a = idOf(s, "p1", "battlefield", "Aclazotz, Deepest Betrayal // Temple of the Dead");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: a, defender: "p2" }] }));
        return idsOf(s, "p1", "battlefield", "Bat").length;
      };
      expect(run(["Forest"])).toBe(1);
      expect(run(["Opt"])).toBe(0);
    });
  });
});

describe("The Lost Caverns of Ixalan: cards from the meta decks (PLAN-C, lot C13)", () => {
  /** Answers "yes" to the questions and chooses the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Activates the ability of `source` whose label contains `label`. */
  const activateLabel = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const castCard = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  it("Spyglass Siren: flying; when it enters, a Map, which makes a creature explore", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Spyglass Siren"], library: ["Opt", "Forest"] } });
    s = resolve(castCard(s, "p1", "Spyglass Siren"));
    const siren = idOf(s, "p1", "battlefield", "Spyglass Siren");
    expect(chars(s, siren).keywords).toContain("flying");
    const map = idOf(s, "p1", "battlefield", "Map");
    s = resolve(activateLabel(s, "p1", map, "explore", { targets: { t: [siren] } }));
    expect(idsOf(s, "p1", "battlefield", "Map")).toHaveLength(0);
    // Revealed nonland card: a +1/+1 counter.
    expect(s.objects[siren]?.counters["+1/+1"]).toBe(1);
  });

  it("Greedy Freebooter: when it dies, scry 1 and a Treasure", () => {
    let s = scenario({ p1: { battlefield: ["Greedy Freebooter"], library: ["Opt", "Forest"] } });
    let scried = false;
    destroy(s, idOf(s, "p1", "battlefield", "Greedy Freebooter"));
    s = resolve(s, (req) => {
      if (req.intent === "scryBottom") scried = true;
      return undefined;
    });
    expect(scried).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  describe("Amalia Benavides Aguirre", () => {
    it("when you gain life, it explores (a revealed land goes to hand); ward - pay 3 life", () => {
      let s = scenario({
        p1: { battlefield: ["Amalia Benavides Aguirre", "Vampire Neonate", ...lands("Swamp", 2)], library: ["Forest", "Opt"] },
      });
      const amalia = idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre");
      expect(chars(s, amalia).keywords).toContain("ward");
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.objects[amalia]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("power exactly 20 after exploring: all other creatures are destroyed", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Amalia Benavides Aguirre", counters: { "+1/+1": 17 } }, "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Opt", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const amalia = idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre");
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(chars(s, amalia).power).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Vampire Neonate")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Amalia Benavides Aguirre")).toHaveLength(1);
    });

    it("power other than 20: nothing is destroyed", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Amalia Benavides Aguirre", counters: { "+1/+1": 18 } }, "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Opt", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(chars(s, idOf(s, "p1", "battlefield", "Amalia Benavides Aguirre")).power).toBe(21);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });

  it("Corpses of the Lost: 3/2 Skeleton Pirate with haste; descend: 1 life to return it to hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Corpses of the Lost"] },
    });
    s = resolve(castCard(s, "p1", "Corpses of the Lost"));
    const skeleton = idOf(s, "p1", "battlefield", "Skeleton Pirate");
    expect(pt(s, skeleton)).toEqual([3, 2]);
    expect(chars(s, skeleton).keywords).toContain("haste");
    // A permanent card goes to the graveyard: you have descended this turn.
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.number > 3, 600);
    expect(idsOf(s, "p1", "hand", "Corpses of the Lost")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Corpses of the Lost: without descend, it stays in play", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Corpses of the Lost"] } });
    s = resolve(castCard(s, "p1", "Corpses of the Lost"));
    s = advanceUntil(s, (x) => x.turn.number > 3, 600);
    expect(idsOf(s, "p1", "battlefield", "Corpses of the Lost")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Restless Anchorage: enters tapped; becomes a 2/3 flying Bird; when attacking, a Map", () => {
    let s = scenario({ p1: { hand: ["Restless Anchorage"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Restless Anchorage") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Restless Anchorage")]?.tapped).toBe(true);

    let t = scenario({ p1: { battlefield: ["Restless Anchorage", "Plains", "Island", "Island"] } });
    const anchorage = idOf(t, "p1", "battlefield", "Restless Anchorage");
    t = resolve(activateLabel(t, "p1", anchorage, "creature"));
    expect(pt(t, anchorage)).toEqual([2, 3]);
    expect(chars(t, anchorage).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(t, anchorage).keywords).toContain("flying");
    t = resolve(attack(t, [anchorage]));
    expect(idsOf(t, "p1", "battlefield", "Map")).toHaveLength(1);
  });

  it("Tishana's Tidebinder: counters an activated ability; the creature loses its abilities as long as it stays", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Tishana's Tidebinder"] },
      p2: { battlefield: ["Vampire Neonate", ...lands("Swamp", 4)] },
      active: "p2",
    });
    const neonate = idOf(s, "p2", "battlefield", "Vampire Neonate");
    s = activateLabel(s, "p2", neonate, "");
    const ability = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = resolve(castCard(s, "p1", "Tishana's Tidebinder"), choosing([ability]));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(20);
    expect(chars(s, neonate).abilities.filter((a) => a.kind === "activated")).toHaveLength(0);
    destroy(s, idOf(s, "p1", "battlefield", "Tishana's Tidebinder"));
    s = resolve(s);
    expect(chars(s, neonate).abilities.some((a) => a.kind === "activated")).toBe(true);
  });

  it("Braided Net: three net counters; taps a nonland permanent whose activated abilities are blocked", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Braided Net // Braided Quipu"] },
      p2: { battlefield: ["Keen-Eyed Curator", ...lands("Forest", 2)], graveyard: ["Opt"] },
    });
    s = resolve(castCard(s, "p1", "Braided Net // Braided Quipu"));
    const net = idOf(s, "p1", "battlefield", "Braided Net // Braided Quipu");
    expect(s.objects[net]?.counters.net).toBe(3);
    const curator = idOf(s, "p2", "battlefield", "Keen-Eyed Curator");
    s = act(s, "p1", { type: "pass" });
    expect(canActivate(s, "p2", curator)).toBe(true);
    s = act(s, "p2", { type: "pass" });
    s = resolve(activateLabel(s, "p1", net, "Tap", { targets: { t: [curator] } }));
    expect(s.objects[net]?.counters.net).toBe(2);
    expect(s.objects[curator]?.tapped).toBe(true);
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(canActivate(s, "p2", curator)).toBe(false);
    // "as long as it stays tapped": untapped, it regains its activated abilities (lot K7).
    untapObject(s, s.objects[curator] as never);
    expect(canActivate(s, "p2", curator)).toBe(true);
  });

  it("Dusk Rose Reliquary: sacrifice as an additional cost; exiles an opposing artifact or creature until it leaves", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Dusk Rose Reliquary"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(castCard(s, "p1", "Dusk Rose Reliquary", { sacrifice: [cub] }), choosing([angel]));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    const reliquary = idOf(s, "p1", "battlefield", "Dusk Rose Reliquary");
    expect(chars(s, reliquary).keywords).toContain("ward");
    destroy(s, reliquary);
    s = resolve(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Inti: when attacking, discard for a +1/+1 counter and trample; the discard exiles the top card, playable", () => {
    let s = scenario({
      p1: { battlefield: ["Inti, Seneschal of the Sun", "Bear Cub"], hand: ["Opt"], library: lands("Mountain", 5) },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = resolve(attack(s, [cub]), choosing([opt, cub]));
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, cub).keywords).toContain("trample");
    expect(namesIn(s, s.exile)).toEqual(["Mountain"]);
    const mountain = s.exile[0] as string;
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
  });

  describe("Glimpse the Core", () => {
    it("mode 1: a tapped basic Forest from the library", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Glimpse the Core"], library: ["Plains", "Forest"] } });
      s = resolve(castCard(s, "p1", "Glimpse the Core", { mode: 0 }));
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(3);
      expect(forests.filter((id) => s.objects[id]?.tapped)).toHaveLength(3); // two paid for, one entered tapped
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("mode 2: a Cavern card from the graveyard returns tapped", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Glimpse the Core"], graveyard: ["Hidden Nursery"] } });
      const cave = idOf(s, "p1", "graveyard", "Hidden Nursery");
      s = resolve(castCard(s, "p1", "Glimpse the Core", { mode: 1, targets: { t: [cave] } }));
      const back = idOf(s, "p1", "battlefield", "Hidden Nursery");
      expect(s.objects[back]?.tapped).toBe(true);
    });
  });

  it("Spring-Loaded Sawblades: 5 damage to an opposing tapped creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Spring-Loaded Sawblades // Bladewheel Chariot"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
    });
    // Only legal target: the tapped Angel (the Bear Cub is untapped).
    s = resolve(castCard(s, "p1", "Spring-Loaded Sawblades // Bladewheel Chariot"));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe('"Tap N untapped artifacts and/or creatures", the source included (302.6, lot K2)', () => {
  it("Adaptive Gemguard: it and an artifact, even with summoning sickness; alone, no", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Adaptive Gemguard", sick: true }, "Nutrient Block"] } });
    const gem = idOf(s, "p1", "battlefield", "Adaptive Gemguard");
    s = activate(s, gem);
    expect(s.objects[gem]?.tapped).toBe(true);
    expect(s.objects[gem]?.counters["+1/+1"]).toBe(1);
    const alone = scenario({ p1: { battlefield: ["Adaptive Gemguard"] } });
    expect(legalActions(alone, "p1").some((a) => a.type === "activate")).toBe(false);
  });

  it("Sunshot Militia, Warden of the Inner Sky, Goldfury Strider: the source counts among the tapped permanents", () => {
    let s = scenario({ p1: { battlefield: ["Sunshot Militia", "Bear Cub"] } });
    s = activate(s, idOf(s, "p1", "battlefield", "Sunshot Militia"));
    expect(s.players.p2?.life).toBe(19);
    let w = scenario({ p1: { battlefield: ["Warden of the Inner Sky", "Bear Cub", "Nutrient Block"] } });
    const warden = idOf(w, "p1", "battlefield", "Warden of the Inner Sky");
    w = activate(w, warden);
    expect(w.objects[warden]?.counters["+1/+1"]).toBe(1);
    const g = scenario({ p1: { battlefield: ["Goldfury Strider", "Bear Cub"] } });
    expect(legalActions(g, "p1").some((a) => a.type === "activate")).toBe(true);
  });

  it("Warden of the Inner Sky: flying and vigilance with three or more counters, of any kind", () => {
    const w = scenario({
      p1: { battlefield: [{ name: "Warden of the Inner Sky", counters: { "+1/+1": 1, shield: 1, stun: 1 } }, "Bear Cub"] },
    });
    const warden = idOf(w, "p1", "battlefield", "Warden of the Inner Sky");
    expect(chars(w, warden).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    const two = scenario({ p1: { battlefield: [{ name: "Warden of the Inner Sky", counters: { "+1/+1": 1, shield: 1 } }] } });
    expect(chars(two, idOf(two, "p1", "battlefield", "Warden of the Inner Sky")).keywords).not.toContain("flying");
  });
});

describe("Lost Caverns of Ixalan, lot K8: mythic, rare and uncommon cards", () => {
  /** Answers "yes" to the questions and chooses the wanted objects or players when offered. */
  const choosing =
    (want: string[] = [], yes = true): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  const activateLabel = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const castCard = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const libraryNames = (s: S, p = "p1") => namesIn(s, s.players[p]?.library);
  /** Puts the back face of a transformable card onto the battlefield (active face: the back). */
  const flip = (s: S, id: string) => {
    const o = s.objects[id] as { defId: string; faceDefId?: string };
    o.faceDefId = s.defs[o.defId]?.faceDefs?.[1]?.id;
    bump(s);
  };
  /** Advances to p1's first main phase (next turn), empty stack. */
  const toMyMain = (s: S) =>
    advanceUntil(
      s,
      (x) =>
        x.turn.active === "p1" &&
        x.turn.step === "main1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0 &&
        x.pending?.kind === "priority",
    );
  const tokens = (s: S, p: string, name: string) => idsOf(s, p, "battlefield", name).filter((id) => s.objects[id]?.isToken);
  /** Resolves the pending triggers after a direct action (`destroy`...), without passing if nothing is waiting. */
  const flush = (s: S) => (s.triggers.length > 0 || s.stack.length > 0 ? resolve(s) : s);

  describe("mythiques", () => {
    it("Bonehoard Dracosaur: at upkeep, exiles two cards playable this turn; land → 3/1 Dinosaur, nonland → Treasure", () => {
      const run = (library: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Bonehoard Dracosaur", "Island"], library },
          active: "p2",
          step: "end",
          turn: 2,
        });
        return toMyMain(s);
      };
      const s = run(["Forest", "Opt", "Island", "Island"]);
      expect(exiled(s, "Forest")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(tokens(s, "p1", "Dinosaur")).toHaveLength(1);
      expect(pt(s, tokens(s, "p1", "Dinosaur")[0] as string)).toEqual([3, 1]);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const acts = legalActions(s, "p1");
      expect(acts.some((a) => a.type === "playLand" && a.card === exiled(s, "Forest")[0])).toBe(true);
      expect(acts.some((a) => a.type === "cast" && a.card === exiled(s, "Opt")[0])).toBe(true);
      // Two lands: a Dinosaur, no Treasure.
      const lands2 = run(["Forest", "Swamp", "Island"]);
      expect(tokens(lands2, "p1", "Dinosaur")).toHaveLength(1);
      expect(tokens(lands2, "p1", "Treasure")).toHaveLength(0);
    });

    it("Ghalta, Stampede Tyrant: puts the chosen creature cards from hand onto the battlefield, and only those", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 8), hand: ["Ghalta, Stampede Tyrant", "Bear Cub", "Llanowar Elves", "Opt"] },
      });
      const bear = idOf(s, "p1", "hand", "Bear Cub");
      let options: (string | undefined)[] = [];
      s = resolve(castCard(s, "p1", "Ghalta, Stampede Tyrant"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = namesIn(cur, req.options);
        return [bear];
      });
      expect(options.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Llanowar Elves", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ghalta, Stampede Tyrant")).keywords).toContain("trample");
    });

    it("Gishath, Sun's Avatar: reveals as many cards as the damage; the Dinosaurs go onto the battlefield, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Gishath, Sun's Avatar", sick: true }],
          library: ["Hulking Raptor", "Opt", "Colossadactyl", "Forest", "Bear Cub", "Forest", "Island", "Swamp"],
        },
      });
      const gishath = idOf(s, "p1", "battlefield", "Gishath, Sun's Avatar");
      expect(chars(s, gishath).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "haste"]));
      s = attack(s, [gishath]);
      expect(s.objects[gishath]?.tapped).toBe(false);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(13);
      expect(idsOf(s, "p1", "battlefield", "Hulking Raptor")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Colossadactyl")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      const lib = libraryNames(s);
      expect(lib[0]).toBe("Swamp");
      expect([...lib.slice(1)].sort()).toEqual(["Bear Cub", "Forest", "Forest", "Island", "Opt"]);
    });

    it("Huatli, Poet of Unity: a basic land to hand; exiled and returned transformed, chapter I creates two 3/3 Dinosaurs", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Huatli, Poet of Unity // Roar of the Fifth People"],
          library: ["Opt", "Mountain", "Opt"],
        },
      });
      s = resolve(castCard(s, "p1", "Huatli, Poet of Unity // Roar of the Fifth People"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);

      let t = scenario({ p1: { battlefield: ["Huatli, Poet of Unity // Roar of the Fifth People", ...lands("Mountain", 5)] } });
      t = resolve(
        activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Huatli, Poet of Unity // Roar of the Fifth People"), "transformed"),
      );
      const saga = t.battlefield.find((id) => chars(t, id).name === "Roar of the Fifth People") as string;
      expect(saga).toBeDefined();
      expect(t.objects[saga]?.counters.lore).toBe(1);
      expect(tokens(t, "p1", "Dinosaur").map((id) => pt(t, id))).toEqual([
        [3, 3],
        [3, 3],
      ]);
    });

    it("Roar of the Fifth People: chapter II, your creatures produce {R}, {G} or {W}; chapter IV, double strike and trample for Dinosaurs only", () => {
      const run = (lore: number) => {
        const s = scenario({
          p1: {
            battlefield: [
              { name: "Huatli, Poet of Unity // Roar of the Fifth People", counters: { lore } },
              "Bear Cub",
              "Hulking Raptor",
            ],
            library: lands("Forest", 5),
          },
          active: "p2",
          step: "end",
          turn: 2,
        });
        flip(s, idOf(s, "p1", "battlefield", "Huatli, Poet of Unity // Roar of the Fifth People"));
        return toMyMain(s);
      };
      const two = run(1);
      const bear = idOf(two, "p1", "battlefield", "Bear Cub");
      expect(legalActions(two, "p1").some((a) => a.type === "tapForMana" && a.source === bear)).toBe(true);
      const four = run(3);
      const raptor = idOf(four, "p1", "battlefield", "Hulking Raptor");
      expect(chars(four, raptor).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
      expect(chars(four, idOf(four, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");
    });

    it("Ojer Kaslem: a revealed creature and land go onto the battlefield; when it dies, it returns tapped as Temple of Cultivation", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ojer Kaslem, Deepest Growth // Temple of Cultivation"],
          library: ["Bear Cub", "Opt", "Forest", "Hulking Raptor", "Island", "Opt", "Swamp"],
        },
      });
      const ojer = idOf(s, "p1", "battlefield", "Ojer Kaslem, Deepest Growth // Temple of Cultivation");
      const lib = s.players.p1?.library ?? [];
      const bear = lib[0] as string;
      const forest = lib[2] as string;
      s = throughCombat(attack(s, [ojer]), choosing([bear, forest]));
      expect(s.players.p2?.life).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(libraryNames(s)[0]).toBe("Swamp");
      expect(libraryNames(s)).toHaveLength(5);

      destroy(s, ojer);
      s = resolve(s);
      const temple = s.battlefield.find((id) => chars(s, id).name === "Temple of Cultivation") as string;
      expect(temple).toBeDefined();
      expect(s.objects[temple]?.tapped).toBe(true);
    });

    it("Temple of Cultivation: transforms only if you control ten or more permanents", () => {
      const run = (forests: number) => {
        const s = scenario({
          p1: { battlefield: ["Ojer Kaslem, Deepest Growth // Temple of Cultivation", ...lands("Forest", forests)] },
        });
        const temple = idOf(s, "p1", "battlefield", "Ojer Kaslem, Deepest Growth // Temple of Cultivation");
        flip(s, temple);
        return legalActions(s, "p1").some((a) => a.type === "activate" && a.source === temple);
      };
      expect(run(9)).toBe(true);
      expect(run(8)).toBe(false);
    });

    it("Ojer Kaslem: a creature card and/or a land card in one choice (PLAN-M M8a), never two creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ojer Kaslem, Deepest Growth // Temple of Cultivation"],
          library: ["Gingerbrute", "Hulking Raptor", "Forest", "Island", "Opt", "Opt", "Swamp"],
        },
      });
      const ojer = idOf(s, "p1", "battlefield", "Ojer Kaslem, Deepest Growth // Temple of Cultivation");
      const lib = s.players.p1?.library ?? [];
      const [brute, raptor, forest] = [lib[0], lib[1], lib[2]] as [string, string, string];
      s = advanceUntil(attack(s, [ojer]), (x) => x.pending?.kind === "choice" && x.pending.request.intent === "lookAtTop");
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      expect(req?.type === "pick" && [req.options.length, req.max]).toEqual([4, 2]);
      // An artifact creature and a creature: two creature cards, refused.
      expect(() => act(s, "p1", { type: "choose", values: [brute, raptor] })).toThrow(RulesError);
      // The two cards enter together.
      s = throughCombat(act(s, "p1", { type: "choose", values: [raptor, forest] }));
      expect(idsOf(s, "p1", "battlefield", "Hulking Raptor")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Gingerbrute")).toHaveLength(0);
      expect(libraryNames(s)[0]).toBe("Swamp");
      expect(libraryNames(s)).toHaveLength(5);
    });

    it("Temple of the Dead: activates only if a player (you, or any opponent) has one card or fewer in hand", () => {
      const run = (hands: [number, number, number]) => {
        const s = scenario({
          players: 3,
          p1: {
            battlefield: ["Aclazotz, Deepest Betrayal // Temple of the Dead", ...lands("Swamp", 3)],
            hand: lands("Island", hands[0]),
          },
          p2: { hand: lands("Island", hands[1]) },
          p3: { hand: lands("Island", hands[2]) },
        });
        const temple = idOf(s, "p1", "battlefield", "Aclazotz, Deepest Betrayal // Temple of the Dead");
        flip(s, temple);
        return legalActions(s, "p1").some((a) => a.type === "activate" && a.source === temple);
      };
      expect(run([3, 3, 3])).toBe(false);
      expect(run([1, 3, 3])).toBe(true);
      expect(run([3, 1, 3])).toBe(true);
      expect(run([3, 3, 0])).toBe(true);
    });

    it("Kitesail Larcenist: for each player, up to one artifact or creature they control (four players)", () => {
      const setup = () =>
        scenario({
          players: 4,
          p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Kitesail Larcenist"] },
          p2: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
          p3: { battlefield: ["Serra Angel"] },
          p4: { battlefield: ["Bear Cub"] },
        });
      let s = setup();
      const chosen = [
        idOf(s, "p1", "battlefield", "Bear Cub"),
        idOf(s, "p2", "battlefield", "Shivan Dragon"),
        idOf(s, "p3", "battlefield", "Serra Angel"),
        idOf(s, "p4", "battlefield", "Bear Cub"),
      ];
      s = resolve(castCard(s, "p1", "Kitesail Larcenist"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? chosen : undefined,
      );
      for (const id of chosen) expect(chars(s, id).subtypes).toEqual(["Treasure"]);
      expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).types).toContain("Creature");
      // Two permanents of the same player: refused.
      const t = setup();
      const two = [idOf(t, "p2", "battlefield", "Shivan Dragon"), idOf(t, "p2", "battlefield", "Llanowar Elves")];
      expect(() =>
        resolve(castCard(t, "p1", "Kitesail Larcenist"), (req) =>
          req.type === "pick" && req.intent === "triggerTarget" ? two : undefined,
        ),
      ).toThrow(RulesError);
    });

    it("Sandswirl Wanderglyph: only an opponent who casts a spell during their own turn (multiplayer)", () => {
      const setup = () => {
        const s = scenario({
          players: 3,
          active: "p2",
          p1: { battlefield: ["Unstable Glyphbridge // Sandswirl Wanderglyph"] },
          p2: { battlefield: ["Island"], hand: ["Opt"] },
          p3: { battlefield: ["Island"], hand: ["Opt"] },
        });
        flip(s, idOf(s, "p1", "battlefield", "Unstable Glyphbridge // Sandswirl Wanderglyph"));
        return s;
      };
      // p3 casts a spell during p2's turn: nothing triggers.
      let s = setup();
      s = act(s, "p2", { type: "pass" });
      s = act(s, "p3", { type: "cast", card: idOf(s, "p3", "hand", "Opt") });
      expect(s.stack.length + s.triggers.length).toBe(1);
      // p2 casts a spell during their turn: it can no longer attack p1 this turn.
      s = setup();
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Opt") });
      expect(s.stack.length + s.triggers.length).toBe(2);
      s = resolve(s);
      expect(playerStatic(s, "p2", "cantAttack")).toBeTruthy();
    });

    it("Brass's Tunnel-Grinder: discard as many cards as you want (from zero to your whole hand)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Brass's Tunnel-Grinder // Tecutlan, the Searing Rift", "Opt", "Forest", "Shock"],
          library: lands("Island", 5),
        },
      });
      let bounds: number[] = [];
      s = resolve(castCard(s, "p1", "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift"), (req, _p, cur) => {
        if (req.type !== "pick" || req.intent !== "discard") return undefined;
        bounds = [req.min, req.max];
        return [idOf(cur, "p1", "hand", "Shock")];
      });
      expect(bounds).toEqual([0, 3]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shock"]);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Island", "Island", "Opt"]);
    });

    it("Quintorius Kand: +1 creates a 3/2 Spirit; -3 discover 4, and the spell cast from exile deals 2 damage and you gain 2 life", () => {
      let s = scenario({ p1: { battlefield: ["Quintorius Kand"], library: ["Forest", "Llanowar Elves", "Island"] } });
      const q = idOf(s, "p1", "battlefield", "Quintorius Kand");
      let t = resolve(activateLabel(s, "p1", q, "Spirit"));
      const spirit = tokens(t, "p1", "Spirit")[0] as string;
      expect(pt(t, spirit)).toEqual([3, 2]);
      expect(chars(t, spirit).colors.sort()).toEqual(["R", "W"]);
      expect(t.objects[q]?.counters.loyalty).toBe(5);

      s = untilCastNow(activateLabel(s, "p1", q, "Discover"));
      const elves = castNowOf(s)?.cards[0] as string;
      s = resolve(act(s, "p1", { type: "cast", card: elves }));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(22);

      // A spell cast from hand triggers nothing.
      t = scenario({ p1: { battlefield: ["Quintorius Kand", "Forest"], hand: ["Llanowar Elves"] } });
      t = resolve(castCard(t, "p1", "Llanowar Elves"));
      expect(t.players.p2?.life).toBe(20);
    });

    it("Quintorius Kand -6: exiles cards from your graveyard, {R} per card, and they are playable this turn", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Quintorius Kand", counters: { loyalty: 6 } }], graveyard: ["Forest", "Triumphant Chomp"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const q = idOf(s, "p1", "battlefield", "Quintorius Kand");
      const cards = [...(s.players.p1?.graveyard ?? [])];
      s = resolve(activateLabel(s, "p1", q, "Exile", { targets: { t: cards } }));
      expect(s.players.p1?.manaPool.R).toBe(2);
      const forest = exiled(s, "Forest")[0];
      const chomp = exiled(s, "Triumphant Chomp")[0];
      const acts = legalActions(s, "p1");
      expect(acts.some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      expect(acts.some((a) => a.type === "cast" && a.card === chomp)).toBe(true);
    });

    it("Resplendent Angel: +2/+2 and lifelink; 5 life gained this turn → a 4/4 flying, vigilant Angel at the end step, 4 life → nothing", () => {
      let s = scenario({ p1: { battlefield: ["Resplendent Angel", ...lands("Plains", 6)] } });
      const angel = idOf(s, "p1", "battlefield", "Resplendent Angel");
      s = resolve(activateLabel(s, "p1", angel, "lifelink"));
      expect(pt(s, angel)).toEqual([5, 5]);
      s = throughCombat(attack(s, [angel]));
      expect(s.players.p1?.life).toBe(25);
      s = advanceUntil(s, (x) => x.turn.number > 3);
      const token = tokens(s, "p1", "Angel")[0] as string;
      expect(pt(s, token)).toEqual([4, 4]);
      expect(chars(s, token).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));

      let t = scenario({ p1: { battlefield: ["Resplendent Angel"] } });
      gainLife(t, "p1", 4);
      t = advanceUntil(t, (x) => x.turn.number > 3);
      expect(tokens(t, "p1", "Angel")).toHaveLength(0);
    });

    it("Saheeli, the Sun's Brilliance: token copy of another creature, artifact in addition, with haste, sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Saheeli, the Sun's Brilliance", "Bear Cub", "Island", "Mountain"] } });
      const saheeli = idOf(s, "p1", "battlefield", "Saheeli, the Sun's Brilliance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // "another": Saheeli can't target herself.
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === saheeli);
      expect(opt?.type === "activate" && opt.targets?.[0]?.legal).not.toContain(saheeli);
      s = resolve(activateLabel(s, "p1", saheeli, "Token copy", { targets: { t: [bear] } }));
      const copy = idsOf(s, "p1", "battlefield", "Bear Cub").find((id) => id !== bear) as string;
      expect(chars(s, copy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, copy).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
    });

    it("Sovereign Okinec Ahau: when attacking, each creature whose power exceeds its base power gets the difference in +1/+1 counters", () => {
      let s = scenario({
        p1: { battlefield: ["Sovereign Okinec Ahau", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Llanowar Elves"] },
      });
      const sov = idOf(s, "p1", "battlefield", "Sovereign Okinec Ahau");
      expect(chars(s, sov).keywords).toContain("ward");
      s = resolve(attack(s, [sov]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(4);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[sov]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("The Ancient One: can't attack or block without eight permanent cards in the graveyard; looting, then a player mills the mana value of the discarded card", () => {
      const yard8 = ["Forest", "Forest", "Bear Cub", "Island", "Swamp", "Plains", "Mountain", "Llanowar Elves"];
      const blocked = scenario({ p1: { battlefield: ["The Ancient One"], graveyard: yard8.slice(1) } });
      const one = idOf(blocked, "p1", "battlefield", "The Ancient One");
      expect(chars(blocked, one).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const free = scenario({ p1: { battlefield: ["The Ancient One"], graveyard: yard8 } });
      expect(chars(free, idOf(free, "p1", "battlefield", "The Ancient One")).keywords).not.toContain("cantAttack");

      let s = scenario({
        p1: { battlefield: ["The Ancient One", "Island", "Island", "Swamp", "Swamp"], hand: ["Shivan Dragon"], library: ["Opt"] },
        p2: { library: lands("Forest", 8) },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "The Ancient One"), "Loot"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes("p2")) return ["p2"];
        return pickNamed(cur, req, "Shivan Dragon");
      });
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      // Shivan Dragon: mana value 6.
      expect(s.players.p2?.graveyard).toHaveLength(6);
    });

    it("The Enigma Jewel: enters tapped; its mana can only be spent to activate abilities", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["The Enigma Jewel // Locus of Enlightenment"] } });
      s = resolve(castCard(s, "p1", "The Enigma Jewel // Locus of Enlightenment"));
      expect(s.objects[idOf(s, "p1", "battlefield", "The Enigma Jewel // Locus of Enlightenment")]?.tapped).toBe(true);

      const t = scenario({
        p1: {
          battlefield: ["The Enigma Jewel // Locus of Enlightenment", "Hoverstone Pilgrim"],
          hand: ["Digsite Conservator"],
          graveyard: ["Opt"],
        },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Digsite Conservator"))).toBe(false);
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Hoverstone Pilgrim"))).toBe(true);
    });

    it("The Millennium Calendar: a time counter per untapped permanent; {2}, {T} doubles them; at 1,000, sacrifice and each opponent loses 1,000 life", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Millennium Calendar", { name: "Forest", tapped: true }, { name: "Forest", tapped: true }, "Island"],
        },
        active: "p2",
        step: "end",
        turn: 2,
      });
      s = toMyMain(s);
      const cal = idOf(s, "p1", "battlefield", "The Millennium Calendar");
      expect(s.objects[cal]?.counters.time).toBe(2);
      s = resolve(activateLabel(s, "p1", cal, "Double"));
      expect(s.objects[cal]?.counters.time).toBe(4);
      expect(s.players.p2?.life).toBe(20);

      let t = scenario({
        p1: { battlefield: [{ name: "The Millennium Calendar", counters: { time: 500 } }, "Forest", "Forest"] },
      });
      t = resolve(activateLabel(t, "p1", idOf(t, "p1", "battlefield", "The Millennium Calendar"), "Double"));
      expect(idsOf(t, "p1", "battlefield", "The Millennium Calendar")).toHaveLength(0);
      expect(t.players.p2?.life).toBe(-980);
    });

    it("The Skullspore Nexus: costs X less (the greatest power); a nontoken creature that dies gives a Fungus Dinosaur of its power; {2}, {T} doubles power", () => {
      const big = scenario({ p1: { battlefield: ["Hulking Raptor", ...lands("Forest", 3)], hand: ["The Skullspore Nexus"] } });
      expect(castable(big, "p1", idOf(big, "p1", "hand", "The Skullspore Nexus"))).toBe(true);
      const small = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["The Skullspore Nexus"] } });
      expect(castable(small, "p1", idOf(small, "p1", "hand", "The Skullspore Nexus"))).toBe(false);

      let s = scenario({ p1: { battlefield: ["The Skullspore Nexus", "Hulking Raptor", "Bear Cub", "Forest", "Forest"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Hulking Raptor"));
      s = resolve(s);
      const fungus = tokens(s, "p1", "Fungus Dinosaur")[0] as string;
      expect(pt(s, fungus)).toEqual([5, 5]);
      // A token that dies triggers nothing.
      destroy(s, fungus);
      s = flush(s);
      expect(tokens(s, "p1", "Fungus Dinosaur")).toHaveLength(0);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "The Skullspore Nexus"), "Double", { targets: { t: [bear] } }),
      );
      expect(pt(s, bear)).toEqual([4, 2]);
    });

    it("The Skullspore Nexus: several nontoken creatures dying together give a single token, of their total power (last known information)", () => {
      let s = scenario({ p1: { battlefield: ["The Skullspore Nexus", "Hulking Raptor", "Bear Cub", "Llanowar Elves"] } });
      const raptor = idOf(s, "p1", "battlefield", "Hulking Raptor");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Power at the time of dying: Bear Cub has +2/+0.
      addPump(s, [bear], 2, 0);
      // Two destructions in the same batch of events.
      destroy(s, raptor);
      destroy(s, bear);
      expect(s.triggers).toHaveLength(1);
      s = resolve(s);
      const fungus = tokens(s, "p1", "Fungus Dinosaur");
      expect(fungus).toHaveLength(1);
      expect(pt(s, fungus[0] as string)).toEqual([9, 9]);
    });

    it("Vito, Fanatic of Aclazotz: first sacrifice +2 life, second -2 life to each opponent, third a 4/3 flying Vampire Demon (Bartolomé del Presidio)", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Vito, Fanatic of Aclazotz",
            "Bartolomé del Presidio",
            "Treasure Map // Treasure Cove",
            "Bear Cub",
            "Llanowar Elves",
          ],
        },
      });
      const bart = idOf(s, "p1", "battlefield", "Bartolomé del Presidio");
      const sac = (cur: S, victim: string) => resolve(activateLabel(cur, "p1", bart, "counter", { sacrifice: [victim] }));
      s = sac(s, idOf(s, "p1", "battlefield", "Treasure Map // Treasure Cove"));
      expect(s.objects[bart]?.counters["+1/+1"]).toBe(1);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 20]);
      s = sac(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      s = sac(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      const demon = tokens(s, "p1", "Vampire Demon")[0] as string;
      expect(pt(s, demon)).toEqual([4, 3]);
      expect(chars(s, demon).keywords).toContain("flying");
      expect(s.objects[bart]?.counters["+1/+1"]).toBe(3);
    });
  });

  describe("rares", () => {
    it("Abuelo, Ancestral Echo: flying and ward {2}; exiles another of your creatures, which returns at the beginning of the next end step", () => {
      let s = scenario({ p1: { battlefield: ["Abuelo, Ancestral Echo", "Bear Cub", "Plains", "Island", "Island"] } });
      const abuelo = idOf(s, "p1", "battlefield", "Abuelo, Ancestral Echo");
      expect(chars(s, abuelo).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === abuelo);
      expect(opt?.type === "activate" && opt.targets?.[0]?.legal).not.toContain(abuelo);
      s = resolve(activateLabel(s, "p1", abuelo, "Exile", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && exiled(x, "Bear Cub").length === 0,
      );
      expect(s.turn.number).toBe(3);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Abuelo's Awakening: an artifact returns with X +1/+1 counters as a 1/1 flying Spirit creature; no Aura", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block", "Dead Weight"] },
      });
      const card = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Abuelo's Awakening");
      const legal = card?.type === "cast" ? card.modes?.[0]?.targets[0]?.legal : [];
      expect(namesIn(s, legal)).toEqual(["Nutrient Block"]);
      s = resolve(
        castCard(s, "p1", "Abuelo's Awakening", { x: 2, targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] } }),
      );
      const block = idOf(s, "p1", "battlefield", "Nutrient Block");
      const c = chars(s, block);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toContain("Spirit");
      expect(c.keywords).toContain("flying");
      expect(pt(s, block)).toEqual([3, 3]);
    });

    it('Abuelo\'s Awakening (PLAN-H H9): the card enters already a creature ("whenever a creature enters" sees it)', () => {
      const WATCH = customCard({
        name: "Test Watcher",
        types: ["Enchantment"],
        typeLine: "Enchantment",
        abilities: [
          triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.gainLife(1)], { label: "You gain 1 life" }),
        ],
      });
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), WATCH], hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block"] },
      });
      s = resolve(
        castCard(s, "p1", "Abuelo's Awakening", { x: 0, targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] } }),
      );
      expect(s.players.p1?.life).toBe(21);
      expect(pt(s, idOf(s, "p1", "battlefield", "Nutrient Block"))).toEqual([1, 1]);
    });

    it('Abuelo\'s Awakening: it enters already 1/1 ("a creature with power 1 or greater enters" sees it; PLAN-L L5)', () => {
      const WATCH = customCard({
        name: "Test Power Watcher",
        types: ["Enchantment"],
        typeLine: "Enchantment",
        abilities: [
          triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 1 }), [fx.gainLife(1)], {
            label: "You gain 1 life",
          }),
        ],
      });
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), WATCH], hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block"] },
      });
      s = resolve(
        castCard(s, "p1", "Abuelo's Awakening", { x: 0, targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] } }),
      );
      expect(s.players.p1?.life).toBe(21);
    });

    it("Akal Pakal: at each end step, if an artifact entered under your control this turn, one card in hand and the other in the graveyard", () => {
      const run = (withArtifact: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Akal Pakal, First Among Equals", "Island"],
            hand: ["Nutrient Block"],
            library: ["Opt", "Bear Cub", "Forest"],
          },
        });
        if (withArtifact) s = resolve(castCard(s, "p1", "Nutrient Block"));
        return advanceUntil(s, (x) => x.turn.number > 3);
      };
      const yes = run(true);
      expect(yes.players.p1?.hand).toHaveLength(1);
      expect(yes.players.p1?.graveyard).toHaveLength(1);
      expect(yes.players.p1?.library).toHaveLength(1);
      const no = run(false);
      expect(namesIn(no, no.players.p1?.hand)).toEqual(["Nutrient Block"]);
      expect(no.players.p1?.library).toHaveLength(3);
    });

    it("Anim Pakal: you attack with a non-Gnome → a +1/+1 counter, then as many tapped, attacking 1/1 Gnomes as counters", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Anim Pakal, Thousandth Moon", counters: { "+1/+1": 1 } }, "Bear Cub"] } });
      const anim = idOf(s, "p1", "battlefield", "Anim Pakal, Thousandth Moon");
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.objects[anim]?.counters["+1/+1"]).toBe(2);
      const gnomes = tokens(s, "p1", "Gnome");
      expect(gnomes).toHaveLength(2);
      expect(gnomes.every((id) => s.objects[id]?.tapped && s.combat?.attackers.some((a) => a.id === id))).toBe(true);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Bedrock Tortoise: your creatures have hexproof during your turn only; toughness > power → combat damage equal to toughness", () => {
      let s = scenario({ p1: { battlefield: ["Bedrock Tortoise", "Hermitic Nautilus"] } });
      const nautilus = idOf(s, "p1", "battlefield", "Hermitic Nautilus");
      expect(chars(s, nautilus).keywords).toContain("hexproof");
      s = throughCombat(attack(s, [nautilus]));
      expect(s.players.p2?.life).toBe(16);
      const theirs = scenario({ p1: { battlefield: ["Bedrock Tortoise", "Hermitic Nautilus"] }, active: "p2" });
      expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Hermitic Nautilus")).keywords).not.toContain("hexproof");
    });

    it("Brass's Tunnel-Grinder: discard cards, draw that many plus one; descend at the end step → bore counter, at the third it transforms", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Brass's Tunnel-Grinder // Tecutlan, the Searing Rift", "Opt", "Forest"],
          library: lands("Island", 5),
        },
      });
      const hand = (s.players.p1?.hand ?? []).filter(
        (id) => nameOf(s, id) !== "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift",
      );
      s = resolve(castCard(s, "p1", "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift"), choosing(hand));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island", "Island"]);

      const run = (descended: boolean) => {
        let t = scenario({
          p1: {
            battlefield: [{ name: "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift", counters: { bore: 2 } }, "Bear Cub"],
          },
        });
        if (descended) destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
        t = advanceUntil(t, (x) => x.turn.number > 3);
        return t;
      };
      const yes = run(true);
      const grinder = yes.battlefield.find((id) => chars(yes, id).name === "Tecutlan, the Searing Rift");
      expect(grinder).toBeDefined();
      expect(yes.objects[grinder as string]?.counters.bore ?? 0).toBe(0);
      const no = run(false);
      expect(
        no.objects[idOf(no, "p1", "battlefield", "Brass's Tunnel-Grinder // Tecutlan, the Searing Rift")]?.counters.bore,
      ).toBe(2);
    });

    it("Tecutlan, the Searing Rift: a permanent spell paid for with its mana → discover X (its mana value)", () => {
      const run = (land: string) => {
        let s = scenario({
          p1: {
            battlefield: [land],
            hand: ["Dire Flail // Dire Blunderbuss"],
            library: ["Forest", "Llanowar Elves", "Bear Cub"],
          },
        });
        if (land !== "Mountain") flip(s, idOf(s, "p1", "battlefield", land));
        s = castCard(s, "p1", "Dire Flail // Dire Blunderbuss");
        return passAccepting(s, (x) => !!castNowOf(x) || (x.stack.length === 0 && x.pending?.kind === "priority"));
      };
      const s = run("Brass's Tunnel-Grinder // Tecutlan, the Searing Rift");
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Llanowar Elves"]);
      const m = run("Mountain");
      expect(castNowOf(m)).toBeUndefined();
      expect(m.players.p1?.library).toHaveLength(3);
    });

    it("Breeches, Eager Pillager: each attacking Pirate makes you choose a mode not yet chosen this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Breeches, Eager Pillager", "Enterprising Scallywag"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Breeches, Eager Pillager")).keywords).toContain("firstStrike");
      const offered: string[][] = [];
      s = attack(s, [
        idOf(s, "p1", "battlefield", "Breeches, Eager Pillager"),
        idOf(s, "p1", "battlefield", "Enterprising Scallywag"),
      ]);
      s = resolve(s, (req) => {
        if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
        offered.push(req.options);
        return [req.options.includes("0") ? "0" : "2"];
      });
      expect(offered).toEqual([
        ["0", "1", "2"],
        ["1", "2"],
      ]);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Bringer of the Last Gift: cast, each player sacrifices their other creatures, then the creature cards already in the graveyard return", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 8), "Bear Cub"],
          hand: ["Bringer of the Last Gift"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: ["Serra Angel"], graveyard: ["Shivan Dragon"] },
      });
      s = resolve(castCard(s, "p1", "Bringer of the Last Gift"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bringer of the Last Gift")).toHaveLength(1);
      // Put onto the battlefield without being cast: nothing.
      let t = scenario({ p1: { battlefield: ["Bear Cub"], hand: ["Bringer of the Last Gift"] } });
      moveWithSpec(t, "p1", idOf(t, "p1", "hand", "Bringer of the Last Gift"), { to: "battlefield" });
      t = flush(t);
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Cosmium Confluence: three modes of your choice (the same one several times) — tapped Cavern, 0/0 Cavern with three counters and haste, enchantment destroyed", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), "Cavernous Maw"],
          hand: ["Cosmium Confluence"],
          library: ["Hidden Nursery", "Opt"],
        },
        p2: { battlefield: ["Deeproot Pilgrimage"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Cosmium Confluence");
      const modes = opt?.type === "cast" ? (opt.modes ?? []) : [];
      const all3 = modes.find(
        (m) => plainText(m.label ?? "").split(" + ").length === 3 && new Set(plainText(m.label ?? "").split(" + ")).size === 3,
      );
      const maw = idOf(s, "p1", "battlefield", "Cavernous Maw");
      const weight = idOf(s, "p2", "battlefield", "Deeproot Pilgrimage");
      // The Cavern receiving the counters is chosen on resolution, after the search (mode order).
      let offered: (string | undefined)[] = [];
      s = resolve(
        castCard(s, "p1", "Cosmium Confluence", {
          mode: all3?.index,
          targets: Object.fromEntries((all3?.targets ?? []).map((t) => [t.id, [weight]])),
        }),
        (req, _p, cur) => {
          if (req.type !== "pick" || !req.options.includes(maw)) return undefined;
          offered = namesIn(cur, req.options);
          return [maw];
        },
      );
      expect(offered.sort()).toEqual(["Cavernous Maw", "Hidden Nursery"]);
      const nursery = idOf(s, "p1", "battlefield", "Hidden Nursery");
      expect(s.objects[nursery]?.tapped).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Deeproot Pilgrimage")).toHaveLength(1);
      const c = chars(s, maw);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
      expect(c.keywords).toContain("haste");
      expect(pt(s, maw)).toEqual([3, 3]);
      // The same mode three times, on the same Cavern: nine counters.
      const thrice = modes.find(
        (m) =>
          plainText(m.label ?? "") ===
          "0/0 Cave with three counters + 0/0 Cave with three counters + 0/0 Cave with three counters",
      );
      let t = scenario({ p1: { battlefield: [...lands("Forest", 5), "Cavernous Maw"], hand: ["Cosmium Confluence"] } });
      t = resolve(castCard(t, "p1", "Cosmium Confluence", { mode: thrice?.index }));
      expect(pt(t, idOf(t, "p1", "battlefield", "Cavernous Maw"))).toEqual([9, 9]);
    });

    it("Deepfathom Echo: at the beginning of combat, it explores, then may become a copy of another of your creatures until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Deepfathom Echo", "Shivan Dragon"], library: ["Opt", "Forest"] } });
      const echo = idOf(s, "p1", "battlefield", "Deepfathom Echo");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      s = resolve(s, choosing([dragon]));
      expect(s.objects[echo]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, echo).name).toBe("Shivan Dragon");
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(chars(s, echo).name).toBe("Deepfathom Echo");
    });

    it("Deepfathom Echo: the creature to copy is chosen on resolution, after exploring, without targeting", () => {
      let s = scenario({ p1: { battlefield: ["Deepfathom Echo", "Shivan Dragon", "Bear Cub"], library: ["Opt", "Forest"] } });
      const echo = idOf(s, "p1", "battlefield", "Deepfathom Echo");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      expect(s.stack.at(-1)?.targets.t).toBeUndefined();
      // The Dragon leaves before resolution: the ability still resolves, and the copy is of Bear Cub.
      destroy(s, dragon);
      s = resolve(s, choosing([cub]));
      expect(s.objects[echo]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, echo).name).toBe("Bear Cub");
    });

    it("Deeproot Pilgrimage: nontoken Merfolk you control tap → a single 1/1 Merfolk with hexproof", () => {
      let s = scenario({ p1: { battlefield: ["Deeproot Pilgrimage", "Cenote Scout", "Merfolk Cave-Diver", "Bear Cub"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Cenote Scout"), idOf(s, "p1", "battlefield", "Merfolk Cave-Diver")]));
      const merfolk = tokens(s, "p1", "Merfolk");
      expect(merfolk).toHaveLength(1);
      expect(pt(s, merfolk[0] as string)).toEqual([1, 1]);
      expect(chars(s, merfolk[0] as string).keywords).toContain("hexproof");
      let t = scenario({ p1: { battlefield: ["Deeproot Pilgrimage", "Bear Cub"] } });
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(tokens(t, "p1", "Merfolk")).toHaveLength(0);
    });

    it("Dire Flail: +2/+0, Equip {1}; Dire Blunderbuss: +3/+0, when attacking, sacrifice another artifact to deal its power to a creature", () => {
      let s = scenario({ p1: { battlefield: ["Dire Flail // Dire Blunderbuss", "Bear Cub", "Mountain"] } });
      const flail = idOf(s, "p1", "battlefield", "Dire Flail // Dire Blunderbuss");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", flail, "Equip", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);

      let t = scenario({
        p1: { battlefield: ["Dire Flail // Dire Blunderbuss", "Bear Cub", "Nutrient Block", "Mountain"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const gun = idOf(t, "p1", "battlefield", "Dire Flail // Dire Blunderbuss");
      flip(t, gun);
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", gun, "Equip", { targets: { t: [cub] } }));
      expect(pt(t, cub)).toEqual([5, 2]);
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = resolve(attack(t, [cub]), choosing([idOf(t, "p1", "battlefield", "Nutrient Block"), angel]));
      expect(idsOf(t, "p1", "graveyard", "Nutrient Block")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Echoing Deeps: may enter tapped as a copy of a land card in a graveyard, a Cavern in addition", () => {
      let s = scenario({ p1: { hand: ["Echoing Deeps"] }, p2: { graveyard: ["Restless Vents"] } });
      const vents = idOf(s, "p2", "graveyard", "Restless Vents");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Echoing Deeps") }), choosing([vents]));
      const deeps = s.battlefield.find((id) => s.objects[id]?.controller === "p1") as string;
      expect(chars(s, deeps).name).toBe("Restless Vents");
      expect(chars(s, deeps).subtypes).toContain("Cave");
      expect(s.objects[deeps]?.tapped).toBe(true);
    });

    it('Echoing Deeps (PLAN-H H9): the copied card is chosen when playing the land; "none": it enters untapped, without a copy', () => {
      const base = () =>
        scenario({ p1: { hand: ["Echoing Deeps"], graveyard: ["Forest"] }, p2: { graveyard: ["Restless Vents", "Opt"] } });
      let s = base();
      const deeps = idOf(s, "p1", "hand", "Echoing Deeps");
      const forest = idOf(s, "p1", "graveyard", "Forest");
      const vents = idOf(s, "p2", "graveyard", "Restless Vents");
      // The question (a land card in a graveyard, or none) comes with the option to play the land.
      const option = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === deeps);
      const choose = option?.type === "playLand" ? option.choose : undefined;
      expect(choose?.type === "pick" && [choose.options, choose.min, choose.max]).toEqual([[forest, vents], 0, 1]);
      s = act(s, "p1", { type: "playLand", card: deeps, chosen: forest });
      let land = idOf(s, "p1", "battlefield", "Echoing Deeps");
      expect(chars(s, land).name).toBe("Forest");
      expect(chars(s, land).subtypes).toEqual(expect.arrayContaining(["Forest", "Cave"]));
      expect(s.objects[land]?.tapped).toBe(true);
      // The copied card stays in the graveyard.
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      s = act(base(), "p1", { type: "playLand", card: deeps, chosen: "" });
      land = idOf(s, "p1", "battlefield", "Echoing Deeps");
      expect([chars(s, land).name, s.objects[land]?.tapped]).toEqual(["Echoing Deeps", false]);
      // A card that is not an option: refused.
      expect(() => act(base(), "p1", { type: "playLand", card: deeps, chosen: idOf(base(), "p2", "graveyard", "Opt") })).toThrow(
        RulesError,
      );
      // No land card in the graveyards: no question.
      const none = scenario({ p1: { hand: ["Echoing Deeps"] } });
      const plain = legalActions(none, "p1").find((a) => a.type === "playLand");
      expect(plain?.type === "playLand" && plain.choose).toBeUndefined();
    });

    it("Echoing Deeps put onto the battlefield by an effect: the copied card is asked for during resolution", () => {
      const RETURN_LAND = customCard({
        name: "Test Land Return",
        types: ["Sorcery"],
        typeLine: "Sorcery",
        spell: spell(
          [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card")],
          [fx.moveTo(ref.target(), { to: "battlefield" })],
        ),
      });
      let s = scenario({ p1: { hand: [RETURN_LAND], graveyard: ["Echoing Deeps"] }, p2: { graveyard: ["Restless Vents"] } });
      const vents = idOf(s, "p2", "graveyard", "Restless Vents");
      const deeps = idOf(s, "p1", "graveyard", "Echoing Deeps");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", RETURN_LAND.name), targets: { t: [deeps] } });
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      expect(req?.type === "pick" && [req.intent, req.options, req.min]).toEqual(["pickCards", [vents], 0]);
      s = resolve(act(s, "p1", { type: "choose", values: [vents] }));
      const land = idOf(s, "p1", "battlefield", "Echoing Deeps");
      expect(chars(s, land).name).toBe("Restless Vents");
      expect(s.objects[land]?.tapped).toBe(true);
    });

    it("Fabrication Foundry: exile other artifacts of total mana value X to return an artifact with mana value X or less from your graveyard (sorcery)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Fabrication Foundry", "Digsite Conservator", ...lands("Plains", 3)],
          graveyard: ["Dire Flail // Dire Blunderbuss"],
        },
      });
      const foundry = idOf(s, "p1", "battlefield", "Fabrication Foundry");
      const flail = idOf(s, "p1", "graveyard", "Dire Flail // Dire Blunderbuss");
      s = resolve(activateLabel(s, "p1", foundry, "Exile", { targets: { t: [flail] } }));
      expect(exiled(s, "Digsite Conservator")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Dire Flail // Dire Blunderbuss")).toHaveLength(1);
      const theirs = scenario({
        p1: {
          battlefield: ["Fabrication Foundry", "Digsite Conservator", ...lands("Plains", 3)],
          graveyard: ["Dire Flail // Dire Blunderbuss"],
        },
        active: "p2",
      });
      expect(canActivate(theirs, "p1", idOf(theirs, "p1", "battlefield", "Fabrication Foundry"))).toBe(false);
    });

    it("Growing Rites of Itlimoc: a creature among the top four cards to hand; four creatures at your end step → Itlimoc, a {G} per creature", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"],
          library: ["Opt", "Bear Cub", "Forest", "Island", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(libraryNames(s)[0]).toBe("Swamp");

      const run = (creatures: number) => {
        const t = scenario({
          p1: { battlefield: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun", ...Array(creatures).fill("Bear Cub")] },
        });
        return advanceUntil(t, (x) => x.turn.number > 3);
      };
      const four = run(4);
      const itlimoc = idOf(four, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun");
      expect(chars(four, itlimoc).name).toBe("Itlimoc, Cradle of the Sun");
      const three = run(3);
      expect(
        chars(three, idOf(three, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun")).name,
      ).not.toBe("Itlimoc, Cradle of the Sun");
      // Itlimoc: {T}: a {G} per creature you control.
      let m = scenario({
        p1: { battlefield: ["Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun", "Bear Cub", "Bear Cub", "Bear Cub"] },
      });
      const land = idOf(m, "p1", "battlefield", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun");
      flip(m, land);
      const abilities = legalActions(m, "p1").filter((a) => a.type === "tapForMana" && a.source === land);
      expect(abilities).toHaveLength(2);
      const last = abilities[1];
      m = act(m, "p1", { type: "tapForMana", source: land, ability: last?.type === "tapForMana" ? last.ability : -1 });
      expect(m.players.p1?.manaPool.G).toBe(3);
    });

    it("Hulking Raptor: ward {2}; at the beginning of your first main phase, add {G}{G}", () => {
      let s = scenario({ p1: { battlefield: ["Hulking Raptor"] }, active: "p2", step: "end", turn: 2 });
      expect(chars(s, idOf(s, "p1", "battlefield", "Hulking Raptor")).keywords).toContain("ward");
      s = toMyMain(s);
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Intrepid Paleontologist: {2} exiles a card from a graveyard; a Dinosaur you own exiled this way is cast and enters with a finality counter", () => {
      let s = scenario({
        p1: { battlefield: ["Intrepid Paleontologist", ...lands("Forest", 10)], graveyard: ["Hulking Raptor", "Bear Cub"] },
        p2: { graveyard: ["Colossadactyl"] },
      });
      const paleo = idOf(s, "p1", "battlefield", "Intrepid Paleontologist");
      for (const [p, name] of [
        ["p1", "Hulking Raptor"],
        ["p1", "Bear Cub"],
        ["p2", "Colossadactyl"],
      ] as const)
        s = resolve(activateLabel(s, "p1", paleo, "Exile", { targets: { t: [idOf(s, p, "graveyard", name)] } }));
      const raptor = exiled(s, "Hulking Raptor")[0] as string;
      expect(castable(s, "p1", raptor)).toBe(true);
      // Not a Dinosaur; or an opponent's card (\"you own\"): no.
      expect(castable(s, "p1", exiled(s, "Bear Cub")[0] as string)).toBe(false);
      expect(castable(s, "p1", exiled(s, "Colossadactyl")[0] as string)).toBe(false);
      s = resolve(act(s, "p1", { type: "cast", card: raptor }));
      const onField = idOf(s, "p1", "battlefield", "Hulking Raptor");
      expect(s.objects[onField]?.counters.finality).toBe(1);
    });

    it("Jadelight Spelunker: explores X times", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Jadelight Spelunker"], library: ["Forest", "Opt", "Island"] },
      });
      s = resolve(castCard(s, "p1", "Jadelight Spelunker", { x: 2 }));
      const jade = idOf(s, "p1", "battlefield", "Jadelight Spelunker");
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.objects[jade]?.counters["+1/+1"]).toBe(1);
    });

    it("Kellan, Daring Traveler: when attacking, a revealed creature card with mana value 3 or less goes to hand; Journey On: a Map, plus one if an opponent controls an artifact", () => {
      let s = scenario({ p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Bear Cub", "Forest"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      let big = scenario({
        p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Shivan Dragon", "Forest"] },
      });
      big = resolve(attack(big, [idOf(big, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]));
      expect(big.players.p1?.hand).toHaveLength(0);

      const journey = (artifact: boolean) => {
        const t = scenario({
          p1: { battlefield: ["Forest"], hand: ["Kellan, Daring Traveler // Journey On"] },
          p2: { battlefield: artifact ? ["Nutrient Block"] : [] },
        });
        return resolve(castCard(t, "p1", "Kellan, Daring Traveler // Journey On", { face: 1 }));
      };
      expect(tokens(journey(false), "p1", "Map")).toHaveLength(1);
      expect(tokens(journey(true), "p1", "Map")).toHaveLength(2);
    });

    it("Kellan, Daring Traveler: a revealed card that is not a creature with mana value 3 or less may go to the graveyard, otherwise it stays", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Shivan Dragon", "Forest"] },
        });
        return resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]), choosing([], yes));
      };
      const binned = run(true);
      expect(namesIn(binned, binned.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
      expect(namesIn(binned, binned.players.p1?.library)).toEqual(["Forest"]);
      const kept = run(false);
      expect(namesIn(kept, kept.players.p1?.library)).toEqual(["Shivan Dragon", "Forest"]);
      // A creature with mana value 3 or less necessarily goes to hand (no refusal possible, so no question).
      let mins: number[] = [];
      let s = scenario({ p1: { battlefield: ["Kellan, Daring Traveler // Journey On"], library: ["Bear Cub", "Forest"] } });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Kellan, Daring Traveler // Journey On")]), (req) => {
        if (req.type === "pick" && req.intent === "lookAtTop") mins = [...mins, req.min ?? 0];
        return undefined;
      });
      expect(mins).toEqual([]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual([]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    });

    it("Journey On: a Map, plus one per opponent who controls an artifact", () => {
      let t = scenario({
        players: 3,
        p1: { battlefield: ["Forest"], hand: ["Kellan, Daring Traveler // Journey On"] },
        p2: { battlefield: ["Nutrient Block"] },
        p3: { battlefield: ["Nutrient Block"] },
      });
      t = resolve(castCard(t, "p1", "Kellan, Daring Traveler // Journey On", { face: 1 }));
      expect(tokens(t, "p1", "Map")).toHaveLength(3);
    });

    it("In the Presence of Ages: a creature card and/or a land card to hand, not two creatures; the rest to the graveyard", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: lands("Forest", 3),
            hand: ["In the Presence of Ages"],
            library: ["Bear Cub", "Llanowar Elves", "Forest", "Opt"],
          },
        });
      let s = setup();
      const cub = s.players.p1?.library[0] as string;
      const elves = s.players.p1?.library[1] as string;
      const forest = s.players.p1?.library[2] as string;
      s = castCard(s, "p1", "In the Presence of Ages");
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      expect(() => act(s, "p1", { type: "choose", values: [cub, elves] })).toThrow(RulesError);
      s = resolve(act(s, "p1", { type: "choose", values: [cub, forest] }));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["In the Presence of Ages", "Llanowar Elves", "Opt"]);
    });

    it("Kutzil's Flanker: a counter per creature that left this turn; or +2 life and scry 2; or exile from a player's graveyard", () => {
      const run = (modeIndex: string, extra: (s: S) => S = (s) => s) => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Llanowar Elves"], hand: ["Kutzil's Flanker"] },
          p2: { graveyard: ["Forest", "Opt"] },
        });
        s = extra(s);
        return resolve(castCard(s, "p1", "Kutzil's Flanker"), (req) =>
          req.type === "pick" && req.intent === "triggerMode"
            ? [modeIndex]
            : req.type === "pick" && req.options.includes("p2")
              ? ["p2"]
              : undefined,
        );
      };
      const counters = run("0", (s) => {
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        return s;
      });
      expect(counters.objects[idOf(counters, "p1", "battlefield", "Kutzil's Flanker")]?.counters["+1/+1"]).toBe(2);
      const life = run("1");
      expect(life.players.p1?.life).toBe(22);
      const yard = run("2");
      expect(yard.players.p2?.graveyard).toHaveLength(0);
      expect(exiled(yard, "Opt")).toHaveLength(1);
    });

    it("Malcolm, Alluring Scoundrel: combat damage → chorus counter, loot; at the fourth counter, the discarded card is cast for free", () => {
      const run = (chorus: number) => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Malcolm, Alluring Scoundrel", counters: { chorus } }],
            hand: ["Nutrient Block"],
            library: ["Forest"],
          },
        });
        const malcolm = idOf(s, "p1", "battlefield", "Malcolm, Alluring Scoundrel");
        s = attack(s, [malcolm]);
        s = passAccepting(s, (x) => !!castNowOf(x) || x.turn.step === "main2");
        return { s, malcolm };
      };
      const four = run(3);
      expect(four.s.objects[four.malcolm]?.counters.chorus).toBe(4);
      expect(namesIn(four.s, castNowOf(four.s)?.cards)).toEqual(["Nutrient Block"]);
      const one = run(0);
      expect(one.s.objects[one.malcolm]?.counters.chorus).toBe(1);
      expect(castNowOf(one.s)).toBeUndefined();
      expect(one.s.players.p1?.graveyard).toHaveLength(1);
      expect(one.s.players.p1?.hand).toHaveLength(1);
    });

    it("Matzalantli, the Great Door: loot; transforms only with four permanent types in the graveyard; The Core: X mana of one color", () => {
      const can = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: [{ name: "Matzalantli, the Great Door // The Core" }, ...lands("Island", 4)], graveyard },
        });
        const door = idOf(s, "p1", "battlefield", "Matzalantli, the Great Door // The Core");
        return legalActions(s, "p1").some((a) => a.type === "activate" && a.source === door && a.label?.includes("Transform"));
      };
      expect(can(["Forest", "Bear Cub", "Nutrient Block", "Dead Weight"])).toBe(true);
      expect(can(["Forest", "Bear Cub", "Nutrient Block", "Opt"])).toBe(false);
      let s = scenario({
        p1: { battlefield: ["Matzalantli, the Great Door // The Core"], graveyard: ["Forest", "Bear Cub", "Opt"] },
      });
      const core = idOf(s, "p1", "battlefield", "Matzalantli, the Great Door // The Core");
      flip(s, core);
      const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === core);
      s = act(s, "p1", { type: "tapForMana", source: core, ability: a?.type === "tapForMana" ? a.ability : -1, color: "B" });
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Molten Collapse: one mode; both if you descended this turn", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Molten Collapse"] },
          p2: { battlefield: ["Serra Angel", "Dire Flail // Dire Blunderbuss"] },
        });
      const modesOf = (s: S) => {
        const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Molten Collapse");
        return o?.type === "cast" ? (o.modes ?? []).map((m) => m.index) : [];
      };
      expect(modesOf(setup())).toEqual([0, 1]);
      let s = setup();
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(modesOf(s)).toEqual([0, 1, 2]);
      s = resolve(
        castCard(s, "p1", "Molten Collapse", {
          mode: 2,
          targets: {
            a: [idOf(s, "p2", "battlefield", "Serra Angel")],
            b: [idOf(s, "p2", "battlefield", "Dire Flail // Dire Blunderbuss")],
          },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Dire Flail // Dire Blunderbuss")).toHaveLength(1);
    });

    it("Palani's Hatcher: two 0/1 Dinosaur Eggs (haste: other Dinosaurs); at the beginning of combat, a sacrificed Egg gives a 3/3 Dinosaur", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), ...lands("Forest", 2)], hand: ["Palani's Hatcher"] } });
      s = resolve(castCard(s, "p1", "Palani's Hatcher"));
      const eggs = tokens(s, "p1", "Dinosaur Egg");
      expect(eggs.map((id) => pt(s, id))).toEqual([
        [0, 1],
        [0, 1],
      ]);
      expect(chars(s, eggs[0] as string).keywords).toContain("haste");
      expect(chars(s, idOf(s, "p1", "battlefield", "Palani's Hatcher")).keywords).not.toContain("haste");
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      expect(tokens(s, "p1", "Dinosaur Egg")).toHaveLength(1);
      const dino = tokens(s, "p1", "Dinosaur")[0] as string;
      expect(pt(s, dino)).toEqual([3, 3]);
      expect(chars(s, dino).keywords).toContain("haste");
      // Without an Egg, nothing.
      let t = scenario({ p1: { battlefield: ["Palani's Hatcher"] } });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      expect(tokens(t, "p1", "Dinosaur")).toHaveLength(0);
    });

    it("Poetic Ingenuity: as many Treasures as attacking Dinosaurs; an artifact spell → a 3/1 Dinosaur, once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Poetic Ingenuity", "Hulking Raptor", "Colossadactyl", "Bear Cub"] } });
      s = resolve(
        attack(s, [
          idOf(s, "p1", "battlefield", "Hulking Raptor"),
          idOf(s, "p1", "battlefield", "Colossadactyl"),
          idOf(s, "p1", "battlefield", "Bear Cub"),
        ]),
      );
      expect(tokens(s, "p1", "Treasure")).toHaveLength(2);
      let t = scenario({
        p1: { battlefield: ["Poetic Ingenuity", "Plains", "Plains"], hand: ["Nutrient Block", "Nutrient Block"] },
      });
      t = resolve(castCard(t, "p1", "Nutrient Block"));
      t = resolve(castCard(t, "p1", "Nutrient Block"));
      const dinos = tokens(t, "p1", "Dinosaur");
      expect(dinos).toHaveLength(1);
      expect(pt(t, dinos[0] as string)).toEqual([3, 1]);
    });

    it("Preacher of the Schism: attacking the player with the most life → 1/1 Vampire with lifelink; attacking while having the most life → draw and lose 1 life", () => {
      const run = (mine: number, theirs: number) => {
        let s = scenario({
          p1: { battlefield: ["Preacher of the Schism"], life: mine, library: lands("Swamp", 3) },
          p2: { life: theirs },
        });
        s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Preacher of the Schism")]));
        return { vampires: tokens(s, "p1", "Vampire").length, hand: s.players.p1?.hand.length, life: s.players.p1?.life };
      };
      expect(run(20, 20)).toEqual({ vampires: 1, hand: 1, life: 19 });
      expect(run(10, 20)).toEqual({ vampires: 1, hand: 0, life: 10 });
      expect(run(20, 10)).toEqual({ vampires: 0, hand: 1, life: 19 });
      const s = scenario({ p1: { battlefield: ["Preacher of the Schism"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Preacher of the Schism")).keywords).toContain("deathtouch");
    });

    it("Pugnacious Hammerskull: attacks without another Dinosaur → stun counter; with another Dinosaur, no", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Pugnacious Hammerskull", other] } });
        const h = idOf(s, "p1", "battlefield", "Pugnacious Hammerskull");
        s = resolve(attack(s, [h]));
        return s.objects[h]?.counters.stun ?? 0;
      };
      expect(run("Bear Cub")).toBe(1);
      expect(run("Colossadactyl")).toBe(0);
    });

    it("Queen's Bay Paladin: when it enters, a Vampire from your graveyard returns with a finality counter; you lose its mana value", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Queen's Bay Paladin"], graveyard: ["Bartolomé del Presidio", "Bear Cub"] },
      });
      const card = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Queen's Bay Paladin");
      expect(card).toBeDefined();
      s = resolve(castCard(s, "p1", "Queen's Bay Paladin"), choosing([idOf(s, "p1", "graveyard", "Bartolomé del Presidio")]));
      const bart = idOf(s, "p1", "battlefield", "Bartolomé del Presidio");
      expect(s.objects[bart]?.counters.finality).toBe(1);
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Restless Prairie: green and white 3/3 Llama; when attacking, your other creatures get +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Restless Prairie", "Bear Cub", "Forest", "Forest", "Plains", "Plains"] } });
      const prairie = idOf(s, "p1", "battlefield", "Restless Prairie");
      s = resolve(activateLabel(s, "p1", prairie, "creature"));
      expect(pt(s, prairie)).toEqual([3, 3]);
      expect(chars(s, prairie).subtypes).toContain("Llama");
      expect([...chars(s, prairie).colors].sort()).toEqual(["G", "W"]);
      s = resolve(attack(s, [prairie]));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, prairie)).toEqual([3, 3]);
    });

    it("Restless Ridgeline: 3/4 Dinosaur; when attacking, another targeted attacking creature gets +2/+0 and untaps", () => {
      let s = scenario({ p1: { battlefield: ["Restless Ridgeline", "Bear Cub", "Forest", "Forest", "Mountain", "Mountain"] } });
      const ridge = idOf(s, "p1", "battlefield", "Restless Ridgeline");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", ridge, "creature"));
      expect(pt(s, ridge)).toEqual([3, 4]);
      expect(chars(s, ridge).subtypes).toContain("Dinosaur");
      s = resolve(attack(s, [ridge, bear]), choosing([bear]));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Restless Vents: 2/3 Insect with menace; when attacking, discard a card to draw one", () => {
      let s = scenario({
        p1: { battlefield: ["Restless Vents", "Swamp", "Mountain", "Mountain"], hand: ["Opt"], library: ["Forest"] },
      });
      const vents = idOf(s, "p1", "battlefield", "Restless Vents");
      s = resolve(activateLabel(s, "p1", vents, "creature"));
      expect(pt(s, vents)).toEqual([2, 3]);
      expect(chars(s, vents).keywords).toContain("menace");
      s = resolve(attack(s, [vents]), choosing([idOf(s, "p1", "hand", "Opt")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Roaming Throne: ward {2}, of the chosen creature type; triggers of your other creatures of that type trigger one more time", () => {
      let s = scenario({ p1: { battlefield: ["Roaming Throne", "Sentinel of the Nameless City", "Sanguine Evangelist"] } });
      const throne = idOf(s, "p1", "battlefield", "Roaming Throne");
      (s.objects[throne] as { chosen?: { creatureType?: string } }).chosen = { creatureType: "Merfolk" };
      bump(s);
      expect(chars(s, throne).subtypes).toContain("Merfolk");
      expect(chars(s, throne).keywords).toContain("ward");
      s = resolve(
        attack(s, [
          idOf(s, "p1", "battlefield", "Sentinel of the Nameless City"),
          idOf(s, "p1", "battlefield", "Sanguine Evangelist"),
        ]),
      );
      // Sentinel (Merfolk): two Maps; Evangelist (Vampire): only once +1/+0 (battle cry).
      expect(tokens(s, "p1", "Map")).toHaveLength(2);
      expect(pt(s, idOf(s, "p1", "battlefield", "Sentinel of the Nameless City"))).toEqual([4, 4]);
    });

    it("Sanguine Evangelist: battle cry; a 1/1 flying Bat when entering and when dying", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Sanguine Evangelist"] } });
      s = resolve(castCard(s, "p1", "Sanguine Evangelist"));
      const bats = tokens(s, "p1", "Bat");
      expect(bats).toHaveLength(1);
      expect(chars(s, bats[0] as string).keywords).toContain("flying");
      let t = scenario({ p1: { battlefield: ["Sanguine Evangelist", "Bear Cub"] } });
      const evangelist = idOf(t, "p1", "battlefield", "Sanguine Evangelist");
      t = resolve(attack(t, [evangelist, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([3, 2]);
      expect(pt(t, evangelist)).toEqual([2, 1]);
      destroy(t, evangelist);
      t = flush(t);
      expect(tokens(t, "p1", "Bat")).toHaveLength(1);
    });

    it("Sentinel of the Nameless City: vigilance; a Map when entering and when attacking", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Sentinel of the Nameless City"] } });
      s = resolve(castCard(s, "p1", "Sentinel of the Nameless City"));
      expect(tokens(s, "p1", "Map")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sentinel of the Nameless City"] } });
      const sentinel = idOf(t, "p1", "battlefield", "Sentinel of the Nameless City");
      t = resolve(attack(t, [sentinel]));
      expect(tokens(t, "p1", "Map")).toHaveLength(1);
      expect(t.objects[sentinel]?.tapped).toBe(false);
    });

    it("Squirming Emergence: a nonland permanent card with mana value ≤ the permanent cards in the graveyard returns to the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", "Swamp", "Forest"],
          hand: ["Squirming Emergence"],
          graveyard: ["Forest", "Swamp", "Bear Cub"],
        },
      });
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Squirming Emergence");
      const legal = o?.type === "cast" ? (o.modes?.[0]?.targets[0]?.legal ?? []) : [];
      expect(namesIn(s, legal)).toEqual(["Bear Cub"]);
      s = resolve(castCard(s, "p1", "Squirming Emergence", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Stalactite Stalker: descend → +1/+1 counter at your end step; {2}{B}, sacrifice: -X/-X, X being its power", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Stalactite Stalker", "Bear Cub"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Stalactite Stalker")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
      let s = scenario({
        p1: { battlefield: [{ name: "Stalactite Stalker", counters: { "+1/+1": 2 } }, "Swamp", "Swamp", "Swamp"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(chars(s, idOf(s, "p1", "battlefield", "Stalactite Stalker")).keywords).toContain("menace");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Stalactite Stalker"), "−X/−X", { targets: { t: [angel] } }),
      );
      expect(idsOf(s, "p1", "graveyard", "Stalactite Stalker")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Starving Revenant: surveil 2, then a card and 3 life lost per card left on top; descend 8: each draw drains 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Starving Revenant"], library: ["Opt", "Forest", "Island"] },
      });
      const opt = s.players.p1?.library[0] as string;
      s = resolve(castCard(s, "p1", "Starving Revenant"), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(s.players.p1?.life).toBe(17);

      const drain = (graveyard: string[]) => {
        let t = scenario({ p1: { battlefield: ["Starving Revenant"], graveyard } });
        drawCards(t, "p1", 1);
        t = flush(t);
        return [t.players.p1?.life, t.players.p2?.life];
      };
      expect(drain(lands("Forest", 8))).toEqual([21, 19]);
      expect(drain(lands("Forest", 7))).toEqual([20, 20]);
    });

    it("Subterranean Schooner: the creature that crewed it explores when it attacks", () => {
      let s = scenario({ p1: { battlefield: ["Subterranean Schooner", "Bear Cub"], library: ["Opt", "Forest"] } });
      const boat = idOf(s, "p1", "battlefield", "Subterranean Schooner");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", boat, "Crew", { tap: [bear] }));
      s = resolve(attack(s, [boat]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Subterranean Schooner: the creature that crewed it is targeted; gone before resolution, nothing explores", () => {
      let s = scenario({
        p1: { battlefield: ["Subterranean Schooner", "Bear Cub", "Llanowar Elves"], library: ["Opt", "Forest"] },
      });
      const boat = idOf(s, "p1", "battlefield", "Subterranean Schooner");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activateLabel(s, "p1", boat, "Crew", { tap: [bear] }));
      s = passAccepting(attack(s, [boat]), (x) => x.stack.length > 0);
      expect(s.stack.at(-1)?.targets.t).toEqual([bear]);
      destroy(s, bear);
      s = resolve(s);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt", "Forest"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBeUndefined();
    });

    it("Sunken Citadel: enters tapped, color chosen; one mana of that color, or two for land abilities only", () => {
      let s = scenario({ p1: { hand: ["Sunken Citadel"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Sunken Citadel"), chosen: "G" });
      const citadel = idOf(s, "p1", "battlefield", "Sunken Citadel");
      expect(s.objects[citadel]?.tapped).toBe(true);
      (s.objects[citadel] as { tapped: boolean }).tapped = false;
      const a = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === citadel);
      s = act(s, "p1", { type: "tapForMana", source: citadel, ability: a?.type === "tapForMana" ? a.ability : -1 });
      expect(s.players.p1?.manaPool.G).toBe(1);
      // Red: both mana pay for Restless Ridgeline's animation ({2}{R}{G}), not Calamitous Cave-In ({3}{R}).
      const t = scenario({
        p1: {
          battlefield: ["Sunken Citadel", "Forest", "Plains", { name: "Restless Ridgeline", tapped: true }],
          hand: ["Calamitous Cave-In"],
        },
      });
      const c = idOf(t, "p1", "battlefield", "Sunken Citadel");
      (t.objects[c] as { chosen?: { color?: string } }).chosen = { color: "R" };
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Restless Ridgeline"))).toBe(true);
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Calamitous Cave-In"))).toBe(false);
    });

    it("Tarrian's Journal: {T}, sacrifice another artifact or a creature: draw (sorcery); {2}, {T}, discard your hand: transform", () => {
      let s = scenario({ p1: { battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Bear Cub"], library: ["Opt"] } });
      const journal = idOf(s, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      s = resolve(activateLabel(s, "p1", journal, "Draw", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = scenario({
        p1: { battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Swamp", "Swamp"], hand: ["Opt", "Forest"] },
      });
      const j = idOf(t, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      t = resolve(activateLabel(t, "p1", j, "transform"));
      expect(t.players.p1?.hand).toHaveLength(0);
      expect(t.players.p1?.graveyard).toHaveLength(2);
      expect(chars(t, j).name).toBe("The Tomb of Aclazotz");
    });

    it("The Tomb of Aclazotz: {T}: a creature spell from your graveyard this turn, which enters with a finality counter, a Vampire in addition", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tarrian's Journal // The Tomb of Aclazotz", "Forest", "Forest"],
          graveyard: ["Bear Cub", "Llanowar Elves"],
        },
      });
      const tomb = idOf(s, "p1", "battlefield", "Tarrian's Journal // The Tomb of Aclazotz");
      flip(s, tomb);
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      expect(castable(s, "p1", bear)).toBe(false);
      s = resolve(activateLabel(s, "p1", tomb, "graveyard"));
      expect(castable(s, "p1", bear)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: bear }));
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[cub]?.counters.finality).toBe(1);
      expect(chars(s, cub).subtypes).toContain("Vampire");
    });

    it("Tarrian's Soulcleaver: vigilance; another artifact or creature put into the graveyard from the battlefield → +1/+1 counter on the equipped creature", () => {
      let s = scenario({
        p1: { battlefield: ["Tarrian's Soulcleaver", "Bear Cub", "Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Nutrient Block"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Tarrian's Soulcleaver"), "Equip", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toContain("vigilance");
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = flush(s);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("The Belligerent: crew 3; when attacking, a Treasure, and you play the top card of your library this turn", () => {
      let s = scenario({ p1: { battlefield: ["The Belligerent", "Serra Angel"], library: ["Forest", "Island"] } });
      const ship = idOf(s, "p1", "battlefield", "The Belligerent");
      s = resolve(activateLabel(s, "p1", ship, "Crew", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
      s = throughCombat(attack(s, [ship]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
    });

    it("The Everflowing Well: mill two cards, draw two; descend 8 at upkeep → The Myriad Pools", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["The Everflowing Well // The Myriad Pools"],
          library: ["Forest", "Bear Cub", "Opt", "Island"],
        },
      });
      s = resolve(castCard(s, "p1", "The Everflowing Well // The Myriad Pools"));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Opt"]);
      const run = (n: number) => {
        let t = scenario({
          p1: { battlefield: ["The Everflowing Well // The Myriad Pools"], graveyard: lands("Forest", n) },
          active: "p2",
          step: "end",
          turn: 2,
        });
        t = toMyMain(t);
        return chars(t, idOf(t, "p1", "battlefield", "The Everflowing Well // The Myriad Pools")).name;
      };
      expect(run(8)).toBe("The Myriad Pools");
      expect(run(7)).not.toBe("The Myriad Pools");
    });

    it("The Myriad Pools: a permanent spell paid for with its mana → another of your permanents becomes a copy of the spell until end of turn", () => {
      const run = (poolsTapped: boolean) => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "The Everflowing Well // The Myriad Pools", tapped: poolsTapped },
              "Island",
              "Island",
              "Nutrient Block",
            ],
            hand: ["Hermitic Nautilus"],
          },
        });
        flip(s, idOf(s, "p1", "battlefield", "The Everflowing Well // The Myriad Pools"));
        const block = idOf(s, "p1", "battlefield", "Nutrient Block");
        s = resolve(castCard(s, "p1", "Hermitic Nautilus"), choosing([block]));
        return { s, block };
      };
      const used = run(false);
      // Automatic payment: Pools and an Island.
      expect(chars(used.s, used.block).name).toBe("Hermitic Nautilus");
      const after = advanceUntil(used.s, (x) => x.turn.number > 3);
      expect(chars(after, used.block).name).toBe("Nutrient Block");
      const other = run(true);
      expect(chars(other.s, other.block).name).toBe("Nutrient Block");
    });

    it("Thousand Moons Smithy: Gnome Soldier (P/T: your artifacts and creatures); at your first main phase, tap five artifacts and/or creatures to transform it", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Thousand Moons Smithy // Barracks of the Thousand"] } });
      s = resolve(castCard(s, "p1", "Thousand Moons Smithy // Barracks of the Thousand"));
      const gnome = tokens(s, "p1", "Gnome Soldier")[0] as string;
      expect(pt(s, gnome)).toEqual([2, 2]);
      let t = scenario({
        p1: { battlefield: ["Thousand Moons Smithy // Barracks of the Thousand", ...Array(5).fill("Bear Cub")] },
        active: "p2",
        step: "end",
        turn: 2,
      });
      t = toMyMain(t);
      const smithy = idOf(t, "p1", "battlefield", "Thousand Moons Smithy // Barracks of the Thousand");
      expect(chars(t, smithy).name).toBe("Barracks of the Thousand");
      // Exactly five tapped permanents among the six possible (the Smithy itself is one).
      const six = [smithy, ...idsOf(t, "p1", "battlefield", "Bear Cub")];
      expect(six.filter((id) => t.objects[id]?.tapped)).toHaveLength(5);
      // Tapping only four permanents is refused: it takes five, or none.
      let u = scenario({
        p1: { battlefield: ["Thousand Moons Smithy // Barracks of the Thousand", ...Array(5).fill("Bear Cub")] },
        active: "p2",
        step: "end",
        turn: 2,
      });
      u = advanceUntil(u, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "pickCards");
      const req = u.pending?.kind === "choice" ? u.pending.request : undefined;
      expect(req?.type === "pick" && req.max).toBe(5);
      const cubs = idsOf(u, "p1", "battlefield", "Bear Cub");
      expect(() => act(u, "p1", { type: "choose", values: cubs.slice(0, 4) })).toThrow(RulesError);
    });

    it("Barracks of the Thousand: an artifact or creature spell paid for with its mana → a Gnome Soldier", () => {
      let s = scenario({ p1: { battlefield: ["Thousand Moons Smithy // Barracks of the Thousand"], hand: ["Ruin-Lurker Bat"] } });
      flip(s, idOf(s, "p1", "battlefield", "Thousand Moons Smithy // Barracks of the Thousand"));
      s = resolve(castCard(s, "p1", "Ruin-Lurker Bat"));
      expect(tokens(s, "p1", "Gnome Soldier")).toHaveLength(1);
    });

    it("Threefold Thunderhulk: enters with three +1/+1 counters; when entering and attacking, as many Gnomes as its power; {2}, sacrifice another artifact: counter", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 7), hand: ["Threefold Thunderhulk"] } });
      s = resolve(castCard(s, "p1", "Threefold Thunderhulk"));
      const hulk = idOf(s, "p1", "battlefield", "Threefold Thunderhulk");
      expect(pt(s, hulk)).toEqual([3, 3]);
      expect(tokens(s, "p1", "Gnome")).toHaveLength(3);
      let t = scenario({
        p1: { battlefield: [{ name: "Threefold Thunderhulk", counters: { "+1/+1": 3 } }, "Nutrient Block", "Plains", "Plains"] },
      });
      const h = idOf(t, "p1", "battlefield", "Threefold Thunderhulk");
      t = resolve(activateLabel(t, "p1", h, "counter", { sacrifice: [idOf(t, "p1", "battlefield", "Nutrient Block")] }));
      expect(pt(t, h)).toEqual([4, 4]);
      t = resolve(attack(t, [h]));
      expect(tokens(t, "p1", "Gnome")).toHaveLength(4);
    });

    it("Throne of the Grim Captain: {T}: mill two cards; The Grim Captain: menace, trample, lifelink, hexproof; when attacking, each opponent sacrifices a nonland permanent", () => {
      let s = scenario({
        p1: { battlefield: ["Throne of the Grim Captain // The Grim Captain"], library: ["Forest", "Opt", "Island"] },
      });
      s = act(s, "p1", {
        type: "activate",
        source: idOf(s, "p1", "battlefield", "Throne of the Grim Captain // The Grim Captain"),
        ability: 0,
      });
      s = resolve(s);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      let t = scenario({
        p1: { battlefield: ["Throne of the Grim Captain // The Grim Captain"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const cap = idOf(t, "p1", "battlefield", "Throne of the Grim Captain // The Grim Captain");
      flip(t, cap);
      expect(chars(t, cap).keywords).toEqual(expect.arrayContaining(["menace", "trample", "lifelink", "hexproof"]));
      t = resolve(attack(t, [cap]));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Trumpeting Carnosaur: discover 5 when entering; {2}{R}, discard it: 3 damage to a creature or planeswalker", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 6),
          hand: ["Trumpeting Carnosaur"],
          library: ["Forest", "Shivan Dragon", "Bear Cub"],
        },
      });
      s = untilCastNow(castCard(s, "p1", "Trumpeting Carnosaur"));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Trumpeting Carnosaur"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = resolve(activateLabel(t, "p1", idOf(t, "p1", "hand", "Trumpeting Carnosaur"), "3 damage", { targets: { t: [angel] } }));
      expect(idsOf(t, "p1", "graveyard", "Trumpeting Carnosaur")).toHaveLength(1);
      expect(t.objects[angel]?.damage).toBe(3);
    });

    it("Wail of the Forgotten: one mode; one or more with eight permanent cards in the graveyard (return, discard, a card among three)", () => {
      const setup = (graveyard: string[]) =>
        scenario({
          p1: {
            battlefield: ["Island", "Swamp"],
            hand: ["Wail of the Forgotten"],
            graveyard,
            library: ["Opt", "Forest", "Bear Cub"],
          },
          p2: { battlefield: ["Serra Angel"], hand: ["Shivan Dragon"] },
        });
      const modes = (s: S) => {
        const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Wail of the Forgotten");
        return o?.type === "cast" ? (o.modes ?? []) : [];
      };
      expect(modes(setup([]))).toHaveLength(3);
      let s = setup(lands("Swamp", 8));
      const all = modes(s).find((m) => m.label?.split(" + ").length === 3);
      expect(modes(s)).toHaveLength(7);
      s = resolve(
        castCard(s, "p1", "Wail of the Forgotten", {
          mode: all?.index,
          targets: { a: [idOf(s, "p2", "battlefield", "Serra Angel")], b: ["p2"] },
        }),
      );
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(8 + 3);
    });
  });

  describe("peu communes", () => {
    it("Abyssal Gorestalker: each player sacrifices two creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 6), "Bear Cub", "Llanowar Elves", "Colossadactyl"], hand: ["Abyssal Gorestalker"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      s = resolve(castCard(s, "p1", "Abyssal Gorestalker"), choosing([]));
      expect(
        s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature")),
      ).toHaveLength(2);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("Akawalli, the Seething Tower: descend 4, +2/+2 and trample; descend 8, another +2/+2 and a single blocker", () => {
      const at = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Akawalli, the Seething Tower"], graveyard: lands("Forest", n) } });
        const id = idOf(s, "p1", "battlefield", "Akawalli, the Seething Tower");
        return { pt: pt(s, id), kw: chars(s, id).keywords };
      };
      expect(at(3).pt).toEqual([3, 3]);
      expect(at(3).kw).not.toContain("trample");
      expect(at(4).pt).toEqual([5, 5]);
      expect(at(4).kw).toContain("trample");
      expect(at(8).pt).toEqual([7, 7]);
      // Descend 8: no more than one blocker.
      let s = scenario({
        p1: { battlefield: ["Akawalli, the Seething Tower"], graveyard: lands("Forest", 8) },
        p2: { battlefield: ["Bear Cub", "Bear Cub"] },
      });
      const aka = idOf(s, "p1", "battlefield", "Akawalli, the Seething Tower");
      s = passAccepting(attack(s, [aka]), (x) => x.pending?.kind === "declareBlockers");
      const bears = idsOf(s, "p2", "battlefield", "Bear Cub");
      expect(() =>
        act(s, "p2", { type: "declareBlockers", blocks: bears.map((b) => ({ blocker: b, attacker: aka })) }),
      ).toThrow();
      expect(() =>
        act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bears[0] as string, attacker: aka }] }),
      ).not.toThrow();
    });

    it("Belligerent Yearling: trample; another Dinosaur enters → its base power may become that Dinosaur's until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Belligerent Yearling", ...lands("Forest", 4)], hand: ["Hulking Raptor"] } });
      const y = idOf(s, "p1", "battlefield", "Belligerent Yearling");
      expect(chars(s, y).keywords).toContain("trample");
      s = resolve(castCard(s, "p1", "Hulking Raptor"));
      expect(pt(s, y)).toEqual([5, 2]);
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(pt(s, y)).toEqual([3, 2]);
    });

    it("Bloodthorn Flail: +2/+1; Equip by paying {3} or by discarding a card", () => {
      let s = scenario({ p1: { battlefield: ["Bloodthorn Flail", "Bear Cub"], hand: ["Opt"] } });
      const flail = idOf(s, "p1", "battlefield", "Bloodthorn Flail");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Without mana: only the discard Equip is possible.
      expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === flail)).toHaveLength(1);
      s = resolve(activateLabel(s, "p1", flail, "discard", { targets: { t: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it('Pirate Hat: "Equip a Pirate {1}" is an equip ability (payable with Freya Crescent\'s mana)', () => {
      // Freya: "Spend this mana only to cast an Equipment spell or activate an equip ability."
      let s = scenario({ p1: { battlefield: ["Pirate Hat", "Swab Goblin", "Bear Cub", "Freya Crescent"] } });
      const hat = idOf(s, "p1", "battlefield", "Pirate Hat");
      const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
      const options = legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === hat);
      // Equip {2} takes one more mana; only the Pirate can be equipped for {1}.
      expect(options.map((a) => (a.type === "activate" ? a.label : ""))).toEqual(["Equip Pirate {1}"]);
      s = resolve(activateLabel(s, "p1", hat, "Pirate", { targets: { t: [goblin] } }));
      expect(s.objects[hat]?.attachedTo).toBe(goblin);
      expect(s.objects[idOf(s, "p1", "battlefield", "Freya Crescent")]?.tapped).toBe(true);
    });

    it("Calamitous Cave-In: X damage to each creature and planeswalker, X = your Caverns plus the Cavern cards in your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), "Cavernous Maw"],
          hand: ["Calamitous Cave-In"],
          graveyard: ["Hidden Volcano", "Forest"],
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = cast(s, "Calamitous Cave-In");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    it("Canonized in Blood: descend → a +1/+1 counter on one of your creatures at your end step; {5}{B}{B}, sacrifice: 4/3 flying Vampire Demon", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Canonized in Blood", "Bear Cub", "Llanowar Elves"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
      let s = scenario({ p1: { battlefield: ["Canonized in Blood", ...lands("Swamp", 7)] } });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Canonized in Blood"), "Vampire"));
      expect(idsOf(s, "p1", "graveyard", "Canonized in Blood")).toHaveLength(1);
      expect(pt(s, tokens(s, "p1", "Vampire Demon")[0] as string)).toEqual([4, 3]);
    });

    it("Caparocti Sunborn: when attacking, tap two untapped artifacts and/or creatures to discover 3", () => {
      const run = (yes: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Caparocti Sunborn", "Bear Cub", "Nutrient Block"],
            library: ["Forest", "Llanowar Elves", "Island"],
          },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Caparocti Sunborn")]);
        return passAccepting(
          s,
          (x) =>
            !!castNowOf(x) ||
            (x.pending?.kind === "choice" && x.pending.request.type === "yesNo" && !yes) ||
            x.turn.step === "main2",
        );
      };
      const s = run(true);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Llanowar Elves"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Nutrient Block")]?.tapped).toBe(true);
      let no = run(false);
      no = resolve(no, choosing([], false));
      expect(no.players.p1?.library).toHaveLength(3);
      expect(no.objects[idOf(no, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });

    it("Captain Storm, Cosmium Raider: an artifact enters under your control → a +1/+1 counter on a targeted Pirate you control", () => {
      let s = scenario({
        p1: { battlefield: ["Captain Storm, Cosmium Raider", "Bear Cub", "Plains"], hand: ["Nutrient Block"] },
      });
      const storm = idOf(s, "p1", "battlefield", "Captain Storm, Cosmium Raider");
      s = resolve(castCard(s, "p1", "Nutrient Block"));
      expect(s.objects[storm]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Careening Mine Cart: crew 1; a Treasure when attacking", () => {
      let s = scenario({ p1: { battlefield: ["Careening Mine Cart", "Llanowar Elves"] } });
      const cart = idOf(s, "p1", "battlefield", "Careening Mine Cart");
      s = resolve(activateLabel(s, "p1", cart, "Crew", { tap: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      s = resolve(attack(s, [cart]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Cavernous Maw: {2}: 3/3 creature only with three other Caverns (in play or in the graveyard)", () => {
      const can = (battlefield: string[], graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: ["Cavernous Maw", "Forest", "Forest", ...battlefield], graveyard } });
        return canActivate(s, "p1", idOf(s, "p1", "battlefield", "Cavernous Maw"));
      };
      expect(can(["Hidden Volcano"], ["Hidden Nursery", "Hidden Courtyard"])).toBe(true);
      expect(can(["Hidden Volcano"], ["Hidden Nursery"])).toBe(false);
      let s = scenario({
        p1: {
          battlefield: ["Cavernous Maw", "Forest", "Forest"],
          graveyard: ["Hidden Nursery", "Hidden Courtyard", "Hidden Volcano"],
        },
      });
      const maw = idOf(s, "p1", "battlefield", "Cavernous Maw");
      s = resolve(activateLabel(s, "p1", maw, "3/3"));
      expect(pt(s, maw)).toEqual([3, 3]);
      expect(chars(s, maw).subtypes).toEqual(expect.arrayContaining(["Cave", "Elemental"]));
    });

    it("Cenote Scout and Kinjalli's Dawnrunner: they explore when entering (Dawnrunner: double strike)", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Cenote Scout"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Cenote Scout"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Cenote Scout")]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Kinjalli's Dawnrunner"], library: ["Forest"] } });
      t = resolve(castCard(t, "p1", "Kinjalli's Dawnrunner"));
      const dawn = idOf(t, "p1", "battlefield", "Kinjalli's Dawnrunner");
      expect(chars(t, dawn).keywords).toContain("doubleStrike");
      expect(namesIn(t, t.players.p1?.hand)).toEqual(["Forest"]);
    });

    it("Chupacabra Echo: a targeted opposing creature gets -X/-X, X = permanent cards in your graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Chupacabra Echo"], graveyard: ["Forest", "Bear Cub", "Opt", "Island"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Chupacabra Echo"));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    it("Coati Scavenger: descend 4 → a permanent card from your graveyard returns to hand; otherwise nothing", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Coati Scavenger"], graveyard } });
        return resolve(castCard(s, "p1", "Coati Scavenger"));
      };
      const yes = run(["Forest", "Island", "Swamp", "Bear Cub", "Opt"]);
      expect(yes.players.p1?.hand).toHaveLength(1);
      expect(namesIn(yes, yes.players.p1?.hand)[0]).not.toBe("Opt");
      const no = run(["Forest", "Island", "Bear Cub", "Opt"]);
      expect(no.players.p1?.hand).toHaveLength(0);
    });

    it("Colossadactyl: reach and trample", () => {
      const s = scenario({ p1: { battlefield: ["Colossadactyl"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Colossadactyl")).keywords).toEqual(
        expect.arrayContaining(["reach", "trample"]),
      );
    });

    it("Confounding Riddle: a card among the top four, the rest to the graveyard; or counter a spell unless its controller pays {4}", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Confounding Riddle"],
          library: ["Opt", "Forest", "Island", "Swamp", "Plains"],
        },
      });
      s = resolve(castCard(s, "p1", "Confounding Riddle", { mode: 0 }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(4);
      expect(libraryNames(s)).toEqual(["Plains"]);

      const counter = (p2Lands: number) => {
        let t = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confounding Riddle"] },
          p2: { battlefield: lands("Forest", p2Lands), hand: ["Bear Cub"] },
          active: "p2",
        });
        t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
        t = act(t, "p2", { type: "pass" });
        const spell = t.stack[0]?.id as string;
        t = resolve(castCard(t, "p1", "Confounding Riddle", { mode: 1, targets: { t: [spell] } }));
        return t;
      };
      expect(idsOf(counter(2), "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(counter(6), "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Contested Game Ball: {2}, {T}: draw and a point counter; at the fifth, sacrifice and a Treasure", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Contested Game Ball", counters: { point: 4 } }, "Plains", "Plains"],
          library: ["Opt", "Forest"],
        },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Contested Game Ball"), "Draw"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Contested Game Ball")).toHaveLength(0);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Contested Game Ball: you are dealt combat damage → the attacking player gains control of it and untaps it", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub"] },
        p2: { battlefield: [{ name: "Contested Game Ball", tapped: true }] },
      });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      const ball = s.battlefield.find((id) => nameOf(s, id) === "Contested Game Ball") as string;
      expect(s.objects[ball]?.controller).toBe("p1");
      expect(s.objects[ball]?.tapped).toBe(false);
    });

    it("Contested Game Ball: only when its controller is dealt combat damage (not another player)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub"] },
        p3: { battlefield: [{ name: "Contested Game Ball", tapped: true }] },
      });
      // Bear Cub attacks p2: p3, who controls the ball, is not hurt.
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(18);
      const ball = s.battlefield.find((id) => nameOf(s, id) === "Contested Game Ball") as string;
      expect(s.objects[ball]?.controller).toBe("p3");
      expect(s.objects[ball]?.tapped).toBe(true);
    });

    it("Council of Echoes: flying; descend 4 → returns up to one other nonland permanent to its owner's hand", () => {
      const run = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: lands("Island", 6), hand: ["Council of Echoes"], graveyard },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(castCard(s, "p1", "Council of Echoes"), choosing([idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      const yes = run(lands("Forest", 4));
      expect(namesIn(yes, yes.players.p2?.hand)).toEqual(["Serra Angel"]);
      expect(chars(yes, idOf(yes, "p1", "battlefield", "Council of Echoes")).keywords).toContain("flying");
      const no = run(lands("Forest", 3));
      expect(idsOf(no, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Dauntless Dismantler: opposing artifacts enter tapped; {X}{X}{W}, sacrifice: destroys each artifact with mana value X", () => {
      let s = scenario({
        p1: { battlefield: ["Dauntless Dismantler"] },
        p2: { battlefield: ["Plains"], hand: ["Nutrient Block"] },
        active: "p2",
      });
      s = resolve(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Nutrient Block") }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Nutrient Block")]?.tapped).toBe(true);
      let t = scenario({
        p1: { battlefield: ["Dauntless Dismantler", ...lands("Plains", 5), "Digsite Conservator"] },
        p2: { battlefield: ["Treasure Map // Treasure Cove", "Hoverstone Pilgrim"] },
      });
      // X = 2: Treasure Map and Digsite Conservator (mana value 2, yours too); Hoverstone Pilgrim (mana value 5) stays.
      t = resolve(activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Dauntless Dismantler"), "Destroy", { x: 2 }));
      expect(idsOf(t, "p2", "graveyard", "Treasure Map // Treasure Cove")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Hoverstone Pilgrim")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Digsite Conservator")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Dauntless Dismantler")).toHaveLength(1);
    });

    it("Defossilize: a creature returns from the graveyard, then explores twice", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 5),
          hand: ["Defossilize"],
          graveyard: ["Bear Cub"],
          library: ["Opt", "Forest", "Island"],
        },
      });
      s = resolve(castCard(s, "p1", "Defossilize", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Opt revealed: a counter (left on top or not); then a land or Opt again.
      expect((s.objects[bear]?.counters["+1/+1"] ?? 0) + (s.players.p1?.hand.length ?? 0)).toBe(2);
    });

    it("Diamond Pick-Axe: indestructible; +1/+1 and a Treasure when the equipped creature attacks", () => {
      let s = scenario({ p1: { battlefield: ["Diamond Pick-Axe", "Bear Cub", "Mountain", "Mountain"] } });
      const axe = idOf(s, "p1", "battlefield", "Diamond Pick-Axe");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, axe).keywords).toContain("indestructible");
      s = resolve(activateLabel(s, "p1", axe, "Equip", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 3]);
      s = resolve(attack(s, [bear]));
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Digsite Conservator: sacrifice, sorcery: exiles up to four cards from a single graveyard; when it dies, {4} to discover 4", () => {
      let s = scenario({
        p1: { battlefield: ["Digsite Conservator", ...lands("Forest", 4)], library: ["Island", "Bear Cub"] },
        p2: { graveyard: ["Opt", "Forest"] },
      });
      const dig = idOf(s, "p1", "battlefield", "Digsite Conservator");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === dig);
      expect(opt?.type === "activate" && opt.targets?.[0]?.count).toBe(4);
      s = act(s, "p1", {
        type: "activate",
        source: dig,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: [...(s.players.p2?.graveyard ?? [])] },
      });
      // The sacrifice is a cost: the discover (on dying) resolves before the exile.
      s = untilCastNow(s);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      s = resolve(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Dowsing Device: an artifact enters → one of your creatures gets +1/+0 and haste, then transform with four artifacts; Geode Grotto: +X/+0 and haste", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dowsing Device // Geode Grotto", "Bear Cub", "Nutrient Block", "Plains", "Plains"],
          hand: ["Nutrient Block", "Nutrient Block"],
        },
      });
      const device = idOf(s, "p1", "battlefield", "Dowsing Device // Geode Grotto");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(castCard(s, "p1", "Nutrient Block"), choosing([bear]));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("haste");
      expect(chars(s, device).name).not.toBe("Geode Grotto");
      s = resolve(castCard(s, "p1", "Nutrient Block"), choosing([bear]));
      expect(chars(s, device).name).toBe("Geode Grotto");

      let t = scenario({
        p1: { battlefield: ["Dowsing Device // Geode Grotto", "Bear Cub", "Nutrient Block", ...lands("Mountain", 3)] },
      });
      const grotto = idOf(t, "p1", "battlefield", "Dowsing Device // Geode Grotto");
      flip(t, grotto);
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", grotto, "+X/+0", { targets: { t: [cub] } }));
      expect(pt(t, cub)).toEqual([3, 2]);
      expect(chars(t, cub).keywords).toContain("haste");
    });

    it("Dreadmaw's Ire: a targeted attacking creature gets +2/+2 and trample; a creature that isn't attacking isn't a legal target", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Mountain"], hand: ["Dreadmaw's Ire"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bear]);
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Dreadmaw's Ire");
      expect(o?.type === "cast" && o.modes?.[0]?.targets[0]?.legal).toEqual([bear]);
      s = resolve(castCard(s, "p1", "Dreadmaw's Ire", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
    });

    it("Enterprising Scallywag: descend → a Treasure at your end step", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Enterprising Scallywag", "Bear Cub"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3);
        return tokens(s, "p1", "Treasure").length;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
    });

    it("Explorer's Cache: enters with two counters; one of your creatures with a +1/+1 counter dies → a counter; {T}: moves a counter (sorcery)", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: ["Explorer's Cache"] } });
      s = resolve(castCard(s, "p1", "Explorer's Cache"));
      const cache = idOf(s, "p1", "battlefield", "Explorer's Cache");
      expect(s.objects[cache]?.counters["+1/+1"]).toBe(2);
      let t = scenario({
        p1: {
          battlefield: [
            { name: "Explorer's Cache", counters: { "+1/+1": 2 } },
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            "Llanowar Elves",
          ],
        },
      });
      const c = idOf(t, "p1", "battlefield", "Explorer's Cache");
      destroy(t, idOf(t, "p1", "battlefield", "Llanowar Elves"));
      t = flush(t);
      expect(t.objects[c]?.counters["+1/+1"]).toBe(2);
      destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
      t = flush(t);
      expect(t.objects[c]?.counters["+1/+1"]).toBe(3);
      let m = scenario({ p1: { battlefield: [{ name: "Explorer's Cache", counters: { "+1/+1": 2 } }, "Bear Cub"] } });
      const bear = idOf(m, "p1", "battlefield", "Bear Cub");
      m = resolve(activateLabel(m, "p1", idOf(m, "p1", "battlefield", "Explorer's Cache"), "Move", { targets: { t: [bear] } }));
      expect(m.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(m.objects[idOf(m, "p1", "battlefield", "Explorer's Cache")]?.counters["+1/+1"]).toBe(1);
    });

    it('Forgotten Monument: your other Caverns have "{T}, pay 1 life: add one mana of any color"', () => {
      let s = scenario({ p1: { battlefield: ["Forgotten Monument", "Hidden Volcano"] } });
      const volcano = idOf(s, "p1", "battlefield", "Hidden Volcano");
      const monument = idOf(s, "p1", "battlefield", "Forgotten Monument");
      const volcanoMana = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === volcano);
      expect(volcanoMana).toHaveLength(2);
      expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === monument)).toHaveLength(1);
      const any = volcanoMana[1];
      s = act(s, "p1", {
        type: "tapForMana",
        source: volcano,
        ability: any?.type === "tapForMana" ? any.ability : -1,
        color: "U",
      });
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Gargantuan Leech: lifelink; costs {1} less per Cavern controlled and per Cavern card in the graveyard", () => {
      const can = (graveyard: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Hidden Necropolis", "Hidden Volcano"], hand: ["Gargantuan Leech"], graveyard },
        });
        return castable(s, "p1", idOf(s, "p1", "hand", "Gargantuan Leech"));
      };
      expect(can(["Hidden Nursery", "Hidden Courtyard", "Hidden Cataract", "Cavernous Maw"])).toBe(true);
      expect(can(["Hidden Nursery", "Hidden Courtyard", "Hidden Cataract", "Forest"])).toBe(false);
      const s = scenario({ p1: { battlefield: ["Gargantuan Leech"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Gargantuan Leech")).keywords).toContain("lifelink");
    });

    it("Geological Appraiser: discover 3 only if it was cast", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Geological Appraiser"], library: ["Forest", "Bear Cub"] },
      });
      s = untilCastNow(castCard(s, "p1", "Geological Appraiser"));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
      let t = scenario({ p1: { hand: ["Geological Appraiser"], library: ["Forest", "Bear Cub"] } });
      moveWithSpec(t, "p1", idOf(t, "p1", "hand", "Geological Appraiser"), { to: "battlefield" });
      t = flush(t);
      expect(t.players.p1?.library).toHaveLength(2);
    });

    it("Glowcap Lantern: the equipped creature explores when it attacks; its controller looks at the top card", () => {
      let s = scenario({ p1: { battlefield: ["Glowcap Lantern", "Bear Cub", "Forest", "Forest"], library: ["Opt", "Island"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Unattached, the Lantern gives nothing (PLAN-D, D8); attached, the equipped creature has "you may look".
      expect(playerStatic(s, "p1", "lookAt")).toBe(false);
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Glowcap Lantern"), "Equip", { targets: { t: [bear] } }));
      expect(playerStatic(s, "p1", "lookAt")).toBe(true);
      s = resolve(attack(s, [bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Grasping Shadows: a creature that attacks alone gains deathtouch and lifelink, dread counter; at the third, Shadows' Lair", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Grasping Shadows // Shadows' Lair", counters: { dread: 2 } }, "Bear Cub", "Llanowar Elves"],
        },
      });
      const shadows = idOf(s, "p1", "battlefield", "Grasping Shadows // Shadows' Lair");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(attack(s, [bear]));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      expect(chars(s, shadows).name).toBe("Shadows' Lair");
      let two = scenario({ p1: { battlefield: ["Grasping Shadows // Shadows' Lair", "Bear Cub", "Llanowar Elves"] } });
      two = resolve(attack(two, [idOf(two, "p1", "battlefield", "Bear Cub"), idOf(two, "p1", "battlefield", "Llanowar Elves")]));
      expect(two.objects[idOf(two, "p1", "battlefield", "Grasping Shadows // Shadows' Lair")]?.counters.dread ?? 0).toBe(0);
    });

    it("Shadows' Lair: {B}, {T}, remove a dread counter: draw a card and lose 1 life", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Grasping Shadows // Shadows' Lair", counters: { dread: 1 } }, "Swamp"], library: ["Opt"] },
      });
      const lair = idOf(s, "p1", "battlefield", "Grasping Shadows // Shadows' Lair");
      flip(s, lair);
      s = resolve(activateLabel(s, "p1", lair, "Draw"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
      expect(canActivate(s, "p1", lair)).toBe(false);
    });

    it("Guardian of the Great Door: additional cost, tap four untapped artifacts, creatures and/or lands; flying", () => {
      const can = (forests: number) => {
        const s = scenario({
          p1: { battlefield: [...lands("Forest", forests), ...lands("Plains", 2)], hand: ["Guardian of the Great Door"] },
        });
        return castable(s, "p1", idOf(s, "p1", "hand", "Guardian of the Great Door"));
      };
      expect(can(4)).toBe(true);
      expect(can(3)).toBe(false);
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Forest", 4)], hand: ["Guardian of the Great Door"] },
      });
      s = resolve(
        castCard(s, "p1", "Guardian of the Great Door", { picks: { costTap: idsOf(s, "p1", "battlefield", "Forest") } }),
      );
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(6);
      expect(chars(s, idOf(s, "p1", "battlefield", "Guardian of the Great Door")).keywords).toContain("flying");
      // Without an explicit choice (PLAN-D, D7): the tapped permanents by default leave enough to pay {W}{W}, whatever
      // the order of the lands.
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Forest", 4)], hand: ["Guardian of the Great Door"] },
      });
      const guardian = idOf(t, "p1", "hand", "Guardian of the Great Door");
      expect(castable(t, "p1", guardian)).toBe(true);
      t = resolve(castCard(t, "p1", "Guardian of the Great Door"));
      expect(idsOf(t, "p1", "battlefield", "Guardian of the Great Door")).toHaveLength(1);
    });

    it("Helping Hand: a creature card with mana value 3 or less returns tapped", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Helping Hand"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Helping Hand");
      expect(namesIn(s, o?.type === "cast" ? o.modes?.[0]?.targets[0]?.legal : [])).toEqual(["Bear Cub"]);
      s = resolve(castCard(s, "p1", "Helping Hand", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Hermitic Nautilus: vigilance; {1}{U}: +3/-3", () => {
      let s = scenario({ p1: { battlefield: ["Hermitic Nautilus", "Island", "Island"] } });
      const n = idOf(s, "p1", "battlefield", "Hermitic Nautilus");
      expect(chars(s, n).keywords).toContain("vigilance");
      s = resolve(activateLabel(s, "p1", n, "+3"));
      expect(pt(s, n)).toEqual([4, 1]);
    });

    it("Hoverstone Pilgrim: flying, ward {2}; {2}: a card from a graveyard under its owner's library", () => {
      let s = scenario({
        p1: { battlefield: ["Hoverstone Pilgrim", "Plains", "Plains"] },
        p2: { graveyard: ["Shivan Dragon"], library: ["Forest"] },
      });
      const pilgrim = idOf(s, "p1", "battlefield", "Hoverstone Pilgrim");
      expect(chars(s, pilgrim).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      s = resolve(activateLabel(s, "p1", pilgrim, "bottom", { targets: { t: [idOf(s, "p2", "graveyard", "Shivan Dragon")] } }));
      expect(libraryNames(s, "p2")).toEqual(["Forest", "Shivan Dragon"]);
    });

    it("Hurl into History: counters an artifact or creature spell, then discover X (its mana value)", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Hurl into History"], library: ["Forest", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shivan Dragon") });
      s = act(s, "p2", { type: "pass" });
      const dragon = s.stack[0]?.id as string;
      s = untilCastNow(castCard(s, "p1", "Hurl into History", { targets: { t: [dragon] } }));
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Serra Angel"]);
      // The spell is already countered when the discover happens.
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      s = resolve(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Itzquinth, Firstborn of Gishath: haste; when entering, {2}: one of your Dinosaurs deals damage equal to its power to another creature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Hulking Raptor", "Mountain", "Forest", "Forest", "Forest"],
          hand: ["Itzquinth, Firstborn of Gishath"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const raptor = idOf(s, "p1", "battlefield", "Hulking Raptor");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Itzquinth, Firstborn of Gishath"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        if (req.type !== "pick") return undefined;
        if (req.options.includes(angel) && !req.options.includes(raptor)) return [angel];
        if (
          req.options.includes(raptor) &&
          cur.pending?.kind === "choice" &&
          cur.pending.purpose.kind === "triggerTarget" &&
          cur.pending.purpose.spec === "a"
        )
          return [raptor];
        return req.options.includes(angel) ? [angel] : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Itzquinth, Firstborn of Gishath")).keywords).toContain("haste");
    });

    it("Ixalli's Lorekeeper: its mana only goes to Dinosaur spells (and Dinosaur abilities)", () => {
      const s = scenario({ p1: { battlefield: ["Ixalli's Lorekeeper", "Forest"], hand: ["Belligerent Yearling", "Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Belligerent Yearling"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Jade Seedstones: three +1/+1 counters distributed among one to three of your creatures; Jadeheart Attendant: life equal to the mana value of the exiled card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"],
          hand: ["Jade Seedstones // Jadeheart Attendant"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = resolve(castCard(s, "p1", "Jade Seedstones // Jadeheart Attendant"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear, elves] : req.type === "divide" ? undefined : undefined,
      );
      const total = (s.objects[bear]?.counters["+1/+1"] ?? 0) + (s.objects[elves]?.counters["+1/+1"] ?? 0);
      expect(total).toBe(3);
      expect(s.objects[bear]?.counters["+1/+1"]).toBeGreaterThan(0);
      expect(s.objects[elves]?.counters["+1/+1"]).toBeGreaterThan(0);

      let t = scenario({
        p1: { battlefield: [...lands("Forest", 7), "Jade Seedstones // Jadeheart Attendant"], graveyard: ["Shivan Dragon"] },
      });
      const stones = idOf(t, "p1", "battlefield", "Jade Seedstones // Jadeheart Attendant");
      t = resolve(activateLabel(t, "p1", stones, "Craft", { materials: [idOf(t, "p1", "graveyard", "Shivan Dragon")] }));
      const attendant = t.battlefield.find((id) => chars(t, id).name === "Jadeheart Attendant") as string;
      expect(pt(t, attendant)).toEqual([7, 7]);
      expect(t.players.p1?.life).toBe(26);
    });

    it("Lodestone Needle: flash; taps an artifact or creature and puts two stun counters on it; Guidestone Compass: {1}, {T}: one of your creatures explores", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Island"], hand: ["Lodestone Needle // Guidestone Compass"] },
        p2: { battlefield: ["Serra Angel"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(castCard(s, "p1", "Lodestone Needle // Guidestone Compass"), choosing([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(2);

      let t = scenario({
        p1: { battlefield: ["Lodestone Needle // Guidestone Compass", "Bear Cub", "Island"], library: ["Opt"] },
      });
      const compass = idOf(t, "p1", "battlefield", "Lodestone Needle // Guidestone Compass");
      flip(t, compass);
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activateLabel(t, "p1", compass, "explore", { targets: { t: [bear] } }));
      expect(t.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Malamet Battle Glyph: +1/+1 counter on your creature that entered this turn, then fight", () => {
      const run = (sick: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Forest", { name: "Bear Cub", sick }], hand: ["Malamet Battle Glyph"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = resolve(castCard(s, "p1", "Malamet Battle Glyph", { targets: { a: [bear], b: [angel] } }));
        return s.objects[angel]?.damage;
      };
      expect(run(true)).toBe(3);
      // Creature that entered earlier: no counter, the Bear deals 2.
      expect(run(false)).toBe(2);
    });

    it("Malamet War Scribe: when entering, your creatures get +2/+1 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Malamet War Scribe"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = resolve(castCard(s, "p1", "Malamet War Scribe"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Malamet War Scribe"))).toEqual([6, 4]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    });

    it("Master's Guide-Mural: a white and blue 4/4 Golem when entering; Master's Manufactory: {T}: a Golem if an artifact entered this turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 2)],
          hand: ["Master's Guide-Mural // Master's Manufactory"],
        },
      });
      s = resolve(castCard(s, "p1", "Master's Guide-Mural // Master's Manufactory"));
      const golem = tokens(s, "p1", "Golem")[0] as string;
      expect(pt(s, golem)).toEqual([4, 4]);
      expect(chars(s, golem).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      const t = scenario({
        p1: { battlefield: ["Master's Guide-Mural // Master's Manufactory", "Plains"], hand: ["Nutrient Block"] },
      });
      const factory = idOf(t, "p1", "battlefield", "Master's Guide-Mural // Master's Manufactory");
      flip(t, factory);
      expect(canActivate(t, "p1", factory)).toBe(false);
      const u = resolve(castCard(t, "p1", "Nutrient Block"));
      expect(canActivate(u, "p1", factory)).toBe(true);
    });

    it("Merfolk Cave-Diver: one of your creatures explores → +1/+0 and can't be blocked this turn", () => {
      let s = scenario({ p1: { battlefield: ["Merfolk Cave-Diver", "Forest"], hand: ["Cenote Scout"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Cenote Scout"));
      const diver = idOf(s, "p1", "battlefield", "Merfolk Cave-Diver");
      expect(pt(s, diver)).toEqual([3, 4]);
      expect(chars(s, diver).keywords).toContain("unblockable");
    });

    it("Might of the Ancestors: at the beginning of combat on your turn, one of your creatures gets +2/+0 and vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Might of the Ancestors", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("vigilance");
    });

    it("Nicanzil, Current Conductor: exploring a land → a land from hand tapped; a nonland → a counter on Nicanzil", () => {
      const run = (top: string) => {
        let s = scenario({
          p1: { battlefield: ["Nicanzil, Current Conductor", "Forest"], hand: ["Cenote Scout", "Island"], library: [top] },
        });
        s = resolve(castCard(s, "p1", "Cenote Scout"), choosing([idOf(s, "p1", "hand", "Island")]));
        return s;
      };
      const land = run("Swamp");
      expect(land.objects[idOf(land, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(land.objects[idOf(land, "p1", "battlefield", "Nicanzil, Current Conductor")]?.counters["+1/+1"] ?? 0).toBe(0);
      const spell = run("Opt");
      expect(spell.objects[idOf(spell, "p1", "battlefield", "Nicanzil, Current Conductor")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(spell, "p1", "battlefield", "Island")).toHaveLength(0);
    });

    it("Rampaging Ceratops: can be blocked only by three or more creatures", () => {
      const block = (n: number) => {
        let s = scenario({
          p1: { battlefield: ["Rampaging Ceratops"] },
          p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub"] },
        });
        const cera = idOf(s, "p1", "battlefield", "Rampaging Ceratops");
        s = attack(s, [cera]);
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        const blockers = idsOf(s, "p2", "battlefield", "Bear Cub").slice(0, n);
        return () => act(s, "p2", { type: "declareBlockers", blocks: blockers.map((b) => ({ blocker: b, attacker: cera })) });
      };
      expect(block(2)).toThrow();
      expect(block(3)).not.toThrow();
    });

    it("Ruin-Lurker Bat: flying, lifelink; descend → scry 1 at your end step", () => {
      const run = (descended: boolean) => {
        let s = scenario({ p1: { battlefield: ["Ruin-Lurker Bat", "Bear Cub"], library: ["Opt", "Forest"] } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        let scried = false;
        s = advanceUntil(s, (x) => {
          if (x.pending?.kind === "choice" && x.pending.request.intent === "scryBottom") scried = true;
          return x.turn.number > 3;
        });
        return scried;
      };
      expect(run(true)).toBe(true);
      expect(run(false)).toBe(false);
      const s = scenario({ p1: { battlefield: ["Ruin-Lurker Bat"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Ruin-Lurker Bat")).keywords).toEqual(
        expect.arrayContaining(["flying", "lifelink"]),
      );
    });

    it("Scampering Surveyor: a basic land or a Cavern card from the library, tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Scampering Surveyor"], library: ["Opt", "Hidden Volcano"] },
      });
      s = resolve(castCard(s, "p1", "Scampering Surveyor"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Hidden Volcano")]?.tapped).toBe(true);
    });

    it("Scytheclaw Raptor: a player who casts a spell outside their turn takes 4 damage", () => {
      let s = scenario({
        p1: { battlefield: ["Scytheclaw Raptor", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
      });
      s = resolve(castCard(s, "p1", "Opt"));
      expect(s.players.p1?.life).toBe(20);
      s = act(s, "p1", { type: "pass" });
      s = resolve(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Opt") }));
      expect(s.players.p2?.life).toBe(16);
    });

    it("Sinuous Benthisaur: looks at X cards (Caverns controlled and in the graveyard), two to hand, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), "Hidden Cataract"],
          hand: ["Sinuous Benthisaur"],
          graveyard: ["Hidden Volcano", "Hidden Nursery"],
          library: ["Opt", "Forest", "Bear Cub", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Sinuous Benthisaur"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(libraryNames(s)[0]).toBe("Swamp");
      expect(libraryNames(s)).toHaveLength(2);
    });

    it("Soulcoil Viper: {B}, {T}, sacrifice (sorcery): a creature card from your graveyard returns with a finality counter", () => {
      let s = scenario({ p1: { battlefield: ["Soulcoil Viper", "Swamp"], graveyard: ["Shivan Dragon"] } });
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Soulcoil Viper"), "finality", {
          targets: { t: [idOf(s, "p1", "graveyard", "Shivan Dragon")] },
        }),
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Shivan Dragon")]?.counters.finality).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "Soulcoil Viper")).toHaveLength(1);
    });

    it("Spelunking: draw, then a land from hand onto the battlefield (Cavern: +4 life); your lands enter untapped", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Spelunking", "Hidden Volcano"], library: ["Opt"] } });
      s = resolve(castCard(s, "p1", "Spelunking"), choosing([idOf(s, "p1", "hand", "Hidden Volcano")]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Hidden Volcano")]?.tapped).toBe(false);
      expect(s.players.p1?.life).toBe(24);
      let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Spelunking", "Forest"], library: ["Opt"] } });
      t = resolve(castCard(t, "p1", "Spelunking"), choosing([idOf(t, "p1", "hand", "Forest")]));
      expect(t.players.p1?.life).toBe(20);
    });

    it("Staunch Crewmate: an artifact or Pirate card among the top four to hand, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Island"],
          hand: ["Staunch Crewmate"],
          library: ["Opt", "Enterprising Scallywag", "Bear Cub", "Forest", "Swamp"],
        },
      });
      s = resolve(castCard(s, "p1", "Staunch Crewmate"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Enterprising Scallywag"]);
      expect(libraryNames(s)[0]).toBe("Swamp");
    });

    it("Stinging Cave Crawler: deathtouch; descend 4, when attacking, draw and lose 1 life", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Stinging Cave Crawler"], graveyard: lands("Forest", n), library: ["Opt"] } });
        s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Stinging Cave Crawler")]));
        return [s.players.p1?.hand.length, s.players.p1?.life];
      };
      expect(run(4)).toEqual([1, 19]);
      expect(run(3)).toEqual([0, 20]);
    });

    it("Sunbird Standard: craft with one or more cards; Sunbird Effigy: P/T and mana depending on the colors of the exiled cards", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 5), "Sunbird Standard // Sunbird Effigy"],
          graveyard: ["Bear Cub", "Opt", "Forest"],
        },
      });
      const std = idOf(s, "p1", "battlefield", "Sunbird Standard // Sunbird Effigy");
      s = resolve(
        activateLabel(s, "p1", std, "Craft", {
          materials: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Opt")],
        }),
      );
      const effigy = s.battlefield.find((id) => chars(s, id).name === "Sunbird Effigy") as string;
      expect(pt(s, effigy)).toEqual([2, 2]);
      expect(chars(s, effigy).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "haste"]));
      s = resolve(activateLabel(s, "p1", effigy, "mana"));
      expect([s.players.p1?.manaPool.G, s.players.p1?.manaPool.U]).toEqual([1, 1]);
    });

    it('Swashbuckler\'s Whip: the equipped creature has reach and "{2}, {T}: tap an artifact or creature"', () => {
      let s = scenario({
        p1: { battlefield: ["Swashbuckler's Whip", "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Swashbuckler's Whip"), "Equip", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toContain("reach");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activateLabel(s, "p1", bear, "Tap", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Synapse Necromage: when it dies, two 1/1 Fungi that can't block", () => {
      let s = scenario({ p1: { battlefield: ["Synapse Necromage"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Synapse Necromage"));
      s = flush(s);
      const fungi = tokens(s, "p1", "Fungus");
      expect(fungi).toHaveLength(2);
      expect(chars(s, fungi[0] as string).keywords).toContain("cantBlock");
    });

    it("Tendril of the Mycotyrant: seven counters on a noncreature land, which becomes a 0/0 Fungus with haste", () => {
      let s = scenario({ p1: { battlefield: ["Tendril of the Mycotyrant", ...lands("Forest", 8)] } });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = resolve(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Tendril of the Mycotyrant"), "Fungus", {
          targets: { t: [forest] },
        }),
      );
      expect(pt(s, forest)).toEqual([7, 7]);
      expect(chars(s, forest).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(chars(s, forest).keywords).toContain("haste");
    });

    it("Triumphant Chomp: damage equal to 2 or to the greatest power among your Dinosaurs", () => {
      const run = (mine: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Mountain", ...mine], hand: ["Triumphant Chomp"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = resolve(castCard(s, "p1", "Triumphant Chomp", { targets: { t: [angel] } }));
        return idsOf(s, "p2", "battlefield", "Serra Angel").length ? s.objects[angel]?.damage : "morte";
      };
      expect(run([])).toBe(2);
      expect(run(["Bear Cub"])).toBe(2);
      expect(run(["Hulking Raptor"])).toBe("morte");
    });

    it("Twists and Turns: when entering, one of your creatures explores, preceded by scry 1; a land enters with seven lands → Mycoid Maze", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Twists and Turns // Mycoid Maze"], library: ["Opt", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = resolve(castCard(s, "p1", "Twists and Turns // Mycoid Maze"), (req) => {
        if (req.intent === "scryBottom") scried = true;
        return req.type === "pick" && req.options.includes(bear) ? [bear] : undefined;
      });
      expect(scried).toBe(true);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      let t = scenario({ p1: { battlefield: ["Twists and Turns // Mycoid Maze", ...lands("Forest", 6)], hand: ["Forest"] } });
      t = resolve(act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Forest") }));
      expect(chars(t, idOf(t, "p1", "battlefield", "Twists and Turns // Mycoid Maze")).name).toBe("Mycoid Maze");
    });

    it("Mycoid Maze: {3}{G}, {T}: a creature card among the top four to hand", () => {
      let s = scenario({
        p1: {
          battlefield: ["Twists and Turns // Mycoid Maze", ...lands("Forest", 4)],
          library: ["Opt", "Forest", "Bear Cub", "Island", "Swamp"],
        },
      });
      const maze = idOf(s, "p1", "battlefield", "Twists and Turns // Mycoid Maze");
      flip(s, maze);
      s = resolve(activateLabel(s, "p1", maze, "Creature card"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(libraryNames(s)[0]).toBe("Swamp");
    });

    it("Uchbenbak, the Great Mistake: vigilance, menace; descend 8, returns from the graveyard with a finality counter (sorcery)", () => {
      const can = (n: number) => {
        const s = scenario({
          p1: {
            battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
            graveyard: ["Uchbenbak, the Great Mistake", ...lands("Forest", n)],
          },
        });
        return canActivate(s, "p1", idOf(s, "p1", "graveyard", "Uchbenbak, the Great Mistake"));
      };
      expect(can(7)).toBe(true);
      expect(can(6)).toBe(false);
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
          graveyard: ["Uchbenbak, the Great Mistake", ...lands("Forest", 7)],
        },
      });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "graveyard", "Uchbenbak, the Great Mistake"), "returns"));
      const u = idOf(s, "p1", "battlefield", "Uchbenbak, the Great Mistake");
      expect(s.objects[u]?.counters.finality).toBe(1);
      expect(chars(s, u).keywords).toEqual(expect.arrayContaining(["vigilance", "menace"]));
    });

    it("Vanguard of the Rose: {1}, sacrifice another creature or an artifact: indestructible until end of turn, and tap it", () => {
      let s = scenario({ p1: { battlefield: ["Vanguard of the Rose", "Bear Cub", "Plains"] } });
      const v = idOf(s, "p1", "battlefield", "Vanguard of the Rose");
      s = resolve(activateLabel(s, "p1", v, "Indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(chars(s, v).keywords).toContain("indestructible");
      expect(s.objects[v]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Visage of Dread: the targeted opponent reveals their hand, you choose an artifact or creature card they discard; Dread Osseosaur: menace, mill 2 when entering or attacking", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Swamp"], hand: ["Visage of Dread // Dread Osseosaur"] },
        p2: { hand: ["Shivan Dragon", "Bear Cub", "Opt"] },
      });
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: (string | undefined)[] = [];
      let chooser = "";
      s = resolve(castCard(s, "p1", "Visage of Dread // Dread Osseosaur"), (req, player, cur) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        options = namesIn(cur, req.options);
        chooser = player;
        return [bear];
      });
      expect(chooser).toBe("p1");
      expect(options.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);

      let t = scenario({ p1: { battlefield: ["Visage of Dread // Dread Osseosaur"], library: ["Opt", "Forest", "Island"] } });
      const osseo = idOf(t, "p1", "battlefield", "Visage of Dread // Dread Osseosaur");
      flip(t, osseo);
      expect(chars(t, osseo).keywords).toContain("menace");
      t = resolve(attack(t, [osseo]), choosing([], true));
      expect(t.players.p1?.graveyard).toHaveLength(2);
    });

    it("Waterlogged Hulk: {T}: mill a card; Watertight Gondola: vigilance, can't be blocked with descend 8", () => {
      let s = scenario({ p1: { battlefield: ["Waterlogged Hulk // Watertight Gondola"], library: ["Opt", "Forest"] } });
      s = resolve(activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Waterlogged Hulk // Watertight Gondola"), "Mill"));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      const at = (n: number) => {
        const t = scenario({ p1: { battlefield: ["Waterlogged Hulk // Watertight Gondola"], graveyard: lands("Forest", n) } });
        const g = idOf(t, "p1", "battlefield", "Waterlogged Hulk // Watertight Gondola");
        flip(t, g);
        return chars(t, g).keywords;
      };
      expect(at(8)).toEqual(expect.arrayContaining(["unblockable", "vigilance"]));
      expect(at(7)).not.toContain("unblockable");
    });

    it("Zoetic Glyph: the enchanted artifact is a 5/4 Golem; put into the graveyard from the battlefield → discover 3", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Nutrient Block"], hand: ["Zoetic Glyph"], library: ["Forest", "Bear Cub"] },
      });
      const block = idOf(s, "p1", "battlefield", "Nutrient Block");
      s = resolve(castCard(s, "p1", "Zoetic Glyph", { targets: { enchant: [block] } }));
      expect(pt(s, block)).toEqual([5, 4]);
      expect(chars(s, block).subtypes).toContain("Golem");
      destroy(s, idOf(s, "p1", "battlefield", "Zoetic Glyph"));
      s = untilCastNow(s);
      expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Bear Cub"]);
    });

    it("Zoyowa Lava-Tongue: deathtouch; descend → each opponent discards or sacrifices, otherwise 3 damage", () => {
      const run = (hand: string[], descended = true) => {
        let s = scenario({ p1: { battlefield: ["Zoyowa Lava-Tongue", "Bear Cub"] }, p2: { hand } });
        if (descended) destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = advanceUntil(s, (x) => x.turn.number > 3 || x.turn.step === "cleanup");
        return s;
      };
      expect(run([]).players.p2?.life).toBe(17);
      // The opponent discards (suggested answer): no damage.
      const paid = run(["Opt"]);
      expect([paid.players.p2?.life, namesIn(paid, paid.players.p2?.graveyard)]).toEqual([20, ["Opt"]]);
      expect(run([], false).players.p2?.life).toBe(20);
    });

    it("Zoyowa's Justice: the owner shuffles the artifact or creature with mana value 1 or more into their library, then discovers X", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain"], hand: ["Zoyowa's Justice"] },
        p2: { battlefield: ["Serra Angel"], library: ["Forest", "Bear Cub", "Island"] },
      });
      s = resolve(castCard(s, "p1", "Zoyowa's Justice", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      // The discover (mana value 5) finds Bear Cub or the shuffled Angel; declined, the card goes to hand.
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(3);
    });

    it("Zoyowa's Justice: a targeted token still makes them discover X (last known information)", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain"], hand: ["Zoyowa's Justice"] },
        p2: { battlefield: ["Serra Angel"], library: ["Forest", "Bear Cub", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const token = createTokenCopy(s, "p2", s.objects[angel]?.defId as string);
      bump(s);
      s = resolve(castCard(s, "p1", "Zoyowa's Justice", { targets: { t: [token] } }));
      expect(s.objects[token]).toBeUndefined();
      // The token ceases to exist; its owner discovers 5: Bear Cub, declined, goes to hand.
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(2);
    });

    it("Zoyowa's Justice: a stolen creature returns to its owner, who discovers", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain"], hand: ["Zoyowa's Justice"], library: ["Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel"], library: ["Forest", "Bear Cub", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      steal(s, angel, "p1");
      s = resolve(castCard(s, "p1", "Zoyowa's Justice", { targets: { t: [angel] } }));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(3);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

describe("Sunfire Torch (lot K8)", () => {
  it("the equipped creature attacks: by sacrificing the Torch, it deals 2 damage to any target", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Sunfire Torch"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const torch = idOf(s, "p1", "battlefield", "Sunfire Torch");
    (s.objects[torch] as { attachedTo?: string }).attachedTo = bear;
    s.version += 1;
    s = attack(s, [bear]);
    for (let i = 0; i < 30 && !(s.turn.step === "main2"); i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values:
            p.request.type === "yesNo"
              ? [1]
              : p.request.type === "pick" && p.request.options.includes("p2")
                ? ["p2"]
                : p.request.suggested,
        });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    expect(idsOf(s, "p1", "graveyard", "Sunfire Torch")).toHaveLength(1);
    // 2 damage from the reflexive ability, then 2 from combat (the Torch gone, the Bear no longer has +1/+0).
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("Damage to each creature and each planeswalker (lot K8)", () => {
  it("Calamitous Cave-In: X damage (Caverns) to each creature and to each planeswalker", () => {
    const walker = customCard({
      name: "Test Walker",
      typeLine: "Legendary Planeswalker — Test",
      types: ["Planeswalker"],
      supertypes: ["Legendary"],
      loyalty: 5,
    });
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Captivating Cave", "Cavernous Maw"], hand: ["Calamitous Cave-In"] },
      p2: { battlefield: ["Serra Angel", walker] },
    });
    const wId = idOf(s, "p2", "battlefield", walker.name);
    s = cast(s, "Calamitous Cave-In");
    // Two Caverns: 2 damage; the planeswalker loses 2 loyalty counters.
    expect(s.objects[wId]?.counters.loyalty).toBe(3);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
  });
});

describe("Iceberg Titan (lot D1)", () => {
  it("when attacking: you may tap or untap the targeted artifact or creature (chosen on resolution)", () => {
    const run = (yes: boolean) => {
      // The back face of Inverted Iceberg, put onto the battlefield as is.
      const titan = card("Inverted Iceberg // Iceberg Titan").faceDefs?.[1];
      if (!titan) throw new Error("verso introuvable");
      let s = scenario({ p1: { battlefield: [titan] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, [idOf(s, "p1", "battlefield", titan.name)]);
      let modes = 0;
      for (let i = 0; i < 20 && s.turn.step === "declareAttackers"; i++) {
        const p = s.pending;
        if (p?.kind === "choice") {
          if (p.request.type === "pick" && p.request.intent === "triggerMode") modes++;
          const values =
            p.request.type === "yesNo"
              ? [yes ? 1 : 0]
              : p.request.type === "pick" && p.request.options.includes(angel)
                ? [angel]
                : p.request.suggested;
          s = act(s, p.player, { type: "choose", values });
        } else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else break;
      }
      return { tapped: s.objects[angel]?.tapped, modes };
    };
    expect(run(true)).toEqual({ tapped: true, modes: 0 });
    expect(run(false).tapped).toBe(false);
  });
});

describe('PLAN-A A3: "with X additional +1/+1 counters" put on entering (614.1c)', () => {
  /** Witness: "whenever a permanent enters with a +1/+1 counter, you gain 1 life". */
  const WATCHER = customCard({
    name: "Counter Witness",
    typeLine: "Enchantment",
    types: ["Enchantment"],
    abilities: [triggered(when.enters({ withCounter: "+1/+1" }), [fx.gainLife(1)], { label: "Enters with a counter: 1 life" })],
  });

  it('Abuelo\'s Awakening: the permanent enters with its X counters (triggers "enters with a counter")', () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), WATCHER], hand: ["Abuelo's Awakening"], graveyard: ["Nutrient Block"] },
    });
    s = resolve(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Abuelo's Awakening"),
        x: 2,
        targets: { t: [idOf(s, "p1", "graveyard", "Nutrient Block")] },
      }),
    );
    const block = idOf(s, "p1", "battlefield", "Nutrient Block");
    expect(s.objects[block]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p1?.life).toBe(21);
  });
});

describe("The Lost Caverns of Ixalan, PLAN-A A4a", () => {
  it("Dreadmaw's Ire: in multiplayer, the destroyed artifact is the one of the damaged player", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Dreadmaw's Ire"] },
      p2: { battlefield: ["Deconstruction Hammer"] },
      p3: { battlefield: ["Fishing Pole", "Trusty Boomerang"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attackPlayer(s, [bear], "p3");
    s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dreadmaw's Ire"), targets: { t: [bear] } }));
    const run = combatTargetsOffered(s);
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Fishing Pole", "Trusty Boomerang"]]);
    expect(run.s.players.p3?.life).toBe(16);
    expect(idsOf(run.s, "p2", "battlefield", "Deconstruction Hammer")).toHaveLength(1);
    expect(run.s.players.p3?.graveyard).toHaveLength(1);
  });

  it('Deconstruction Hammer: the equipped creature has "{3}, {T}, sacrifice Deconstruction Hammer: destroy ..."', () => {
    let s = scenario({
      p1: { battlefield: ["Deconstruction Hammer", "Bear Cub", ...lands("Plains", 3)] },
      p2: { battlefield: ["Fishing Pole"] },
    });
    const hammer = idOf(s, "p1", "battlefield", "Deconstruction Hammer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
    s.objects[hammer]!.attachedTo = bear;
    bump(s);
    const index = chars(s, bear).abilities.findIndex((a) => a.kind === "activated" && a.label?.startsWith("Sacrifice"));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(chars(s, hammer).abilities.some((a) => a.kind === "activated" && a.label?.startsWith("Sacrifice"))).toBe(false);
    s = settle(act(s, "p1", { type: "activate", source: bear, ability: index, targets: { t: [pole] } }));
    expect(idsOf(s, "p1", "graveyard", "Deconstruction Hammer")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(s.objects[bear]?.tapped).toBe(true);
    // A creature that entered this turn can't use {T}.
    const sick = scenario({
      p1: { battlefield: ["Deconstruction Hammer", { name: "Bear Cub", sick: true }, ...lands("Plains", 3)] },
    });
    const cub = idOf(sick, "p1", "battlefield", "Bear Cub");
    sick.objects[idOf(sick, "p1", "battlefield", "Deconstruction Hammer")]!.attachedTo = cub;
    bump(sick);
    expect(canActivate(sick, "p1", cub)).toBe(false);
  });
});
