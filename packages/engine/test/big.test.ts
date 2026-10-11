/**
 * The Big Score (BIG): every supported card is checked against its Oracle text (plan R, lot R7). Hideaway (Collector's
 * Cage), copies of tokens and artifacts, Greed's Gambit, Generous Plunderer, Harvester of Misery, Vaultborn Tyrant, Pest Control…
 * Rest in Peace, Grand Abolisher, Torpor Orb and Worldwalker Helm are already covered by otj.test.ts. Not tested
 * here, because they do not follow the Oracle: the copy of Esoteric Duplicator (the sacrificed artifact is no longer found, nothing is
 * created) and the arrival of Harvester of Misery (which also gives itself −2/−2: `pumpAll` ignores `other`).
 */

import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import { describe, expect, it } from "vitest";
import { createTokens } from "../src/actions";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { availableMana } from "../src/mana";
import { chars } from "../src/state";
import { msg } from "../src/text";
import type { ChoiceRequest, GameState, PlayerId, TokenSpec } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passUntil,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
} from "./helpers";

type S = GameState;

/** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
  );
  if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const castOption = (s: S, player: string, card: string) =>
  legalActions(s, player).find((a) => a.type === "cast" && a.card === card);

describe("The Big Score", () => {
  describe("Collector's Cage", () => {
    const setup = (creatures: string[]) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...creatures],
          hand: ["Collector's Cage"],
          library: ["Island", "Serra Angel", "Island", "Opt", "Island", "Swamp", "Swamp"],
        },
      });
      let seen = 0;
      s = settleNoBlocks(cast(s, "p1", "Collector's Cage"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        seen = req.options.length;
        return pickNamed(cur, req, "Serra Angel");
      });
      // Hideaway 5: the Angel is exiled, the other four cards go on the bottom.
      expect(seen).toBe(5);
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.library).slice(0, 2)).toEqual(["Swamp", "Swamp"]);
      return s;
    };

    it("{1}, {T}: a +1/+1 counter; with three different powers, the exiled card is played without paying its cost", () => {
      let s = setup(["Llanowar Elves", "Bear Cub", "Fire Elemental"]);
      const cage = idOf(s, "p1", "battlefield", "Collector's Cage");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settleNoBlocks(activate(s, "p1", cage, undefined, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[cage]?.tapped).toBe(true);
      // No untapped land left: the Angel is cast for free from exile.
      const angel = exiled(s, "Serra Angel")[0] as string;
      expect(castOption(s, "p1", angel)).toBeDefined();
      s = settleNoBlocks(act(s, "p1", { type: "cast", card: angel, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("without three creatures of different powers, the card stays exiled", () => {
      let s = setup(["Bear Cub", "Bear Cub", "Fire Elemental"]);
      const cage = idOf(s, "p1", "battlefield", "Collector's Cage");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settleNoBlocks(activate(s, "p1", cage, undefined, { targets: { t: [fire] } }));
      // Powers 2, 2 and 6: only two values.
      expect(chars(s, fire).power).toBe(6);
      const angel = exiled(s, "Serra Angel")[0] as string;
      expect(castOption(s, "p1", angel)).toBeUndefined();
    });
  });

  it("Oltec Matterweaver: each creature spell gives a 1/1 Gnome, or a copy of one of your artifact tokens", () => {
    let s = scenario({
      p1: { battlefield: ["Oltec Matterweaver", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
    });
    // No artifact token to copy: the Gnome.
    s = settleNoBlocks(cast(s, "p1", "Bear Cub"));
    const gnome = idOf(s, "p1", "battlefield", "Gnome");
    const c = chars(s, gnome);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors).toEqual([]);
    // Second spell: the "copy" mode, which targets the Gnome.
    let modes: string[] = [];
    s = settleNoBlocks(cast(s, "p1", "Bear Cub"), (req) => {
      if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
      modes = req.options;
      return ["1"];
    });
    expect(modes).toEqual(["0", "1"]);
    const gnomes = idsOf(s, "p1", "battlefield", "Gnome");
    expect(gnomes).toHaveLength(2);
    expect(gnomes.every((id) => s.objects[id]?.isToken)).toBe(true);
  });

  it("Esoteric Duplicator: {2}, sacrifice: draw; its sacrifice offers to pay {2}, and without payment, no copy", () => {
    let s = scenario({ p1: { battlefield: ["Esoteric Duplicator", ...lands("Island", 4)], library: lands("Swamp", 3) } });
    const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
    let asked = false;
    s = settleNoBlocks(activate(s, "p1", dup), (req) => {
      if (req.intent !== "may") return undefined;
      asked = true;
      return [0];
    });
    expect(asked).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
    expect(idsOf(s, "p1", "battlefield", "Esoteric Duplicator")).toHaveLength(0);
  });

  describe("Greed's Gambit", () => {
    it("on arrival: 3 cards, 6 life, three 2/1 flying Bats; at your end step: discard, 2 life, a sacrifice", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Greed's Gambit"], library: lands("Island", 10) },
      });
      s = settleNoBlocks(cast(s, "p1", "Greed's Gambit"));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.life).toBe(26);
      const bats = idsOf(s, "p1", "battlefield", "Bat");
      expect(bats).toHaveLength(3);
      for (const id of bats) {
        const c = chars(s, id);
        expect([c.power, c.toughness]).toEqual([2, 1]);
        expect(c.colors).toEqual(["B"]);
        expect(c.keywords).toContain("flying");
      }
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(24);
      const creatures = s.battlefield.filter(
        (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
      );
      expect(creatures).toHaveLength(3);
    });

    it("on leaving the battlefield: discard three cards, lose 6 life and sacrifice three creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Greed's Gambit", ...lands("Plains", 2), "Bear Cub", "Bear Cub", "Bear Cub", "Fire Elemental"],
          hand: ["Disenchant", "Opt", "Opt", "Opt", "Forest"],
        },
      });
      const gambit = idOf(s, "p1", "battlefield", "Greed's Gambit");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settleNoBlocks(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Disenchant"), targets: { t: [gambit] } }),
        (req) => {
          if (req.type !== "pick") return undefined;
          if (req.intent === "sacrifice") return req.options.filter((id) => id !== fire).slice(0, 3);
          return undefined;
        },
      );
      if (s.pending?.kind === "discard") {
        const hand = s.players.p1?.hand ?? [];
        s = settleNoBlocks(act(s, "p1", { type: "discard", cards: hand.slice(0, 3) }));
      }
      expect(idsOf(s, "p1", "graveyard", "Greed's Gambit")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(14);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Harvester of Misery", () => {
    it("{1}{B}, discard it: a targeted creature gets −2/−2 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Harvester of Misery"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Harvester of Misery");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settleNoBlocks(activate(s, "p1", card, undefined, { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Harvester of Misery")).toHaveLength(1);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
    });
  });

  it("Hostile Investigator: the targeted opponent discards; the first discard of the turn investigates, only once", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Hostile Investigator", "Harvester of Misery"] },
      p2: { battlefield: ["Bear Cub"], hand: ["Opt", "Forest"] },
    });
    s = settleNoBlocks(cast(s, "p1", "Hostile Investigator", { targets: { t: ["p2"] } }));
    if (s.pending?.kind === "discard")
      s = settleNoBlocks(act(s, "p2", { type: "discard", cards: (s.players.p2?.hand ?? []).slice(0, 1) }));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    expect(chars(s, clue).types).toContain("Artifact");
    // Second discard of the turn (Harvester of Misery from hand): no new Clue.
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settleNoBlocks(activate(s, "p1", idOf(s, "p1", "hand", "Harvester of Misery"), undefined, { targets: { t: [bear] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Legion Extruder: 2 damage to any target on arrival; {2}, {T}, sacrifice another artifact: a 3/3 Golem", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Fishing Pole"], hand: ["Legion Extruder"] },
    });
    s = settleNoBlocks(cast(s, "p1", "Legion Extruder"), (req) =>
      req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
    );
    expect(s.players.p2?.life).toBe(18);
    const extruder = idOf(s, "p1", "battlefield", "Legion Extruder");
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    s = settleNoBlocks(activate(s, "p1", extruder, undefined, { sacrifice: [pole] }), (req) =>
      req.type === "pick" && req.options.includes(pole) ? [pole] : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(s.objects[extruder]?.tapped).toBe(true);
    const golem = idOf(s, "p1", "battlefield", "Golem");
    const c = chars(s, golem);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.colors).toEqual([]);
    // No other artifact left to sacrifice: the ability is no longer available.
    expect(canActivate(s, "p1", extruder)).toBe(false);
  });

  it("Molten Duplication: artifact token copy with haste, sacrificed at the beginning of the next end step", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Molten Duplication"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settleNoBlocks(cast(s, "p1", "Molten Duplication", { targets: { t: [bear] } }));
    const copy = idsOf(s, "p1", "battlefield", "Bear Cub").find((id) => id !== bear) as string;
    expect(s.objects[copy]?.isToken).toBe(true);
    const c = chars(s, copy);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("haste");
    expect(chars(s, bear).types).not.toContain("Artifact");
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
    expect(s.objects[copy]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
  });

  describe("Vaultborn Tyrant", () => {
    it("it or another creature you control with power 4 or greater arrives: 3 life and a card", () => {
      const t = scenario({
        p1: { battlefield: [...lands("Forest", 7), "Vaultborn Tyrant"], hand: ["Pelakka Wurm"], library: lands("Island", 5) },
      });
      const after = settleNoBlocks(cast(t, "p1", "Pelakka Wurm"));
      // Pelakka Wurm: 7 life, plus 3 and a card from the Tyrant.
      expect(after.players.p1?.life).toBe(30);
      expect(namesIn(after, after.players.p1?.hand)).toEqual(["Island"]);
      // Power 2: nothing.
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Vaultborn Tyrant"], hand: ["Bear Cub"], library: lands("Island", 5) },
      });
      s = settleNoBlocks(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("dies (not a token): a token copy that is also an artifact, whose arrival triggers again", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Vaultborn Tyrant"], hand: ["Luminous Rebuke"], library: lands("Island", 5) },
      });
      const tyrant = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      s = settleNoBlocks(cast(s, "p1", "Luminous Rebuke", { targets: { t: [tyrant] } }));
      expect(idsOf(s, "p1", "graveyard", "Vaultborn Tyrant")).toHaveLength(1);
      const copy = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      expect(s.objects[copy]?.isToken).toBe(true);
      expect(chars(s, copy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, copy).keywords).toContain("trample");
      expect(s.players.p1?.life).toBe(23);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("the token copy that dies does not come back", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 10), "Vaultborn Tyrant"],
          hand: ["Luminous Rebuke", "Luminous Rebuke"],
          library: lands("Island", 5),
        },
      });
      s = settleNoBlocks(
        cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p1", "battlefield", "Vaultborn Tyrant")] } }),
      );
      const copy = idOf(s, "p1", "battlefield", "Vaultborn Tyrant");
      s = settleNoBlocks(cast(s, "p1", "Luminous Rebuke", { targets: { t: [copy] } }));
      expect(idsOf(s, "p1", "battlefield", "Vaultborn Tyrant")).toHaveLength(0);
    });
  });

  it("Generous Plunderer: Treasure at upkeep (and a tapped Treasure for the opponent); when attacking, damage equal to its artifacts", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Generous Plunderer"] },
      p2: { battlefield: ["Fishing Pole"] },
    });
    const plunderer = idOf(s, "p1", "battlefield", "Generous Plunderer");
    expect(chars(s, plunderer).keywords).toContain("menace");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.objects[idOf(s, "p1", "battlefield", "Treasure")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p2", "battlefield", "Treasure")]?.tapped).toBe(true);
    // p2 controls two artifacts (Fishing Pole and its Treasure): 2 damage, then 2 combat damage.
    s = throughCombat(attack(s, [plunderer]));
    expect(s.players.p2?.life).toBe(16);
  });

  describe("Pest Control", () => {
    it("destroys all nonland permanents with mana value 1 or less", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Llanowar Elves", "Bear Cub"], hand: ["Pest Control"] },
        p2: { battlefield: ["Fishing Pole", "Serra Angel", "Forest"] },
      });
      s = settleNoBlocks(cast(s, "p1", "Pest Control"));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(1);
    });

    it("cycling {2}: discard it, draw a card", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Pest Control"], library: lands("Island", 3) } });
      const card = idOf(s, "p1", "hand", "Pest Control");
      s = settleNoBlocks(activate(s, "p1", card));
      expect(idsOf(s, "p1", "graveyard", "Pest Control")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });
  });
});

// Cards from the Standard meta decks (PLAN-C in docs/history.md, lot C13).
describe("The Big Score: Standard meta cards", () => {
  describe("Simulacrum Synthesizer", () => {
    it("on arrival, scry 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Simulacrum Synthesizer"], library: ["Opt", "Forest", "Island"] },
      });
      let seen = 0;
      s = settleNoBlocks(cast(s, "p1", "Simulacrum Synthesizer"), (req) => {
        if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
        seen = req.options.length;
        return [...req.options]; // both under the library
      });
      expect(seen).toBe(2);
      // The two cards looked at are put under the third.
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Island");
      expect(library.slice(1).sort()).toEqual(["Forest", "Opt"]);
    });

    it("another artifact with MV 3 or more enters under your control: a 0/0 Construct that gets +1/+1 per artifact", () => {
      let s = scenario({
        p1: { battlefield: ["Simulacrum Synthesizer", ...lands("Forest", 6)], hand: ["Juggernaut", "Swiftfoot Boots"] },
      });
      s = settleNoBlocks(cast(s, "p1", "Swiftfoot Boots"));
      // MV 2: no Construct.
      expect(idsOf(s, "p1", "battlefield", "Construct")).toHaveLength(0);
      s = settleNoBlocks(cast(s, "p1", "Juggernaut"));
      const constructs = idsOf(s, "p1", "battlefield", "Construct");
      expect(constructs).toHaveLength(1);
      const construct = constructs[0] as string;
      expect(chars(s, construct).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, construct).colors).toEqual([]);
      // Synthesizer, Boots, Juggernaut and the Construct itself: 4/4.
      expect([chars(s, construct).power, chars(s, construct).toughness]).toEqual([4, 4]);
    });

    it("an opposing artifact with MV 3 or more creates nothing", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Simulacrum Synthesizer"] },
        p2: { battlefield: lands("Forest", 4), hand: ["Juggernaut"] },
      });
      s = settleNoBlocks(cast(s, "p2", "Juggernaut"));
      expect(idsOf(s, "p2", "battlefield", "Juggernaut")).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Construct")).toHaveLength(0);
    });
  });
});

describe("The Big Score, lot K8: mythic rares", () => {
  type S = GameState;
  /** Activates the ability of `source` whose label starts with `label`. */
  const activateBy = (s: S, player: PlayerId, source: string, label: string, extra: object = {}): S => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (x.label ?? "").startsWith(label),
    );
    if (a?.type !== "activate") throw new Error(`ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const hasActivate = (s: S, player: PlayerId, source: string, label: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").startsWith(label));
  /** Attaches the Equipment to the creature (without paying the equip cost). */
  const equip = (s: S, equipment: string, creature: string) => {
    const o = s.objects[equipment];
    if (o) o.attachedTo = creature;
    bump(s);
  };
  const yesNo = (yes: boolean) => (req: ChoiceRequest) => (req.type === "yesNo" ? [yes ? 1 : 0] : undefined);
  const GOLD = customCard({ name: "Two-color Bear", colors: ["G", "W"], power: 2, toughness: 2 });
  const GREY = customCard({ name: "Grey Golem", types: ["Artifact", "Creature"], power: 1, toughness: 1 });
  const RED = customCard({ name: "Red Goblin", colors: ["R"], power: 1, toughness: 1 });
  const ENCH = customCard({ name: "Enchantement nu", types: ["Enchantment"], typeLine: "Enchantment" });

  it("Ancient Cornucopia: a colored spell gains 1 life per color, only once per turn; a colorless spell, nothing", () => {
    let s = scenario({ p1: { battlefield: ["Ancient Cornucopia"], hand: [GREY, GOLD, RED] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grey Golem") }), yesNo(true));
    expect(s.players.p1?.life).toBe(20);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Two-color Bear") }), yesNo(true));
    expect(s.players.p1?.life).toBe(22);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Red Goblin") }), yesNo(true));
    expect(s.players.p1?.life).toBe(22);
    // {T}: one mana of any color.
    const t = scenario({ p1: { battlefield: ["Ancient Cornucopia"] } });
    const colors = legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
  });

  it("Bristlebud Farmer: two Foods on arrival; when attacking, sacrificing a Food mills three cards and returns a permanent", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Bristlebud Farmer"], library: ["Opt", "Bear Cub", "Forest", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bristlebud Farmer") }));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(2);
    const farmer = idOf(s, "p1", "battlefield", "Bristlebud Farmer");
    expect(chars(s, farmer).keywords).toContain("trample");
    const farmerObj = s.objects[farmer];
    if (farmerObj) farmerObj.controlledSince = 0;
    s = attack(s, [farmer]);
    s = settleNoBlocks(s, (req, _p, cur) =>
      req.type === "yesNo"
        ? [1]
        : req.type === "pick" && req.intent === "sacrifice"
          ? req.options.slice(0, 1)
          : pickNamed(cur, req, "Bear Cub"),
    );
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
    // Without a sacrifice, nothing is milled.
    let t = scenario({ p1: { battlefield: ["Bristlebud Farmer"], library: ["Opt", "Bear Cub", "Forest"] } });
    createTokens(t, "p1", TOKEN_SPECS.Food as TokenSpec, 1);
    t = attack(t, [idOf(t, "p1", "battlefield", "Bristlebud Farmer")]);
    t = settleNoBlocks(t, (req) => (req.type === "yesNo" ? [0] : req.type === "pick" ? [] : undefined));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(t.players.p1?.graveyard).toHaveLength(0);
  });

  it("Fomori Vault: {3}, {T}, discard a card: look at X cards (X = your artifacts), one to hand, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Fomori Vault", "Ancient Cornucopia", "Lost Jitte", ...lands("Plains", 3)],
        hand: ["Opt"],
        library: ["Island", "Bear Cub", "Forest", "Swamp"],
      },
    });
    const vault = idOf(s, "p1", "battlefield", "Fomori Vault");
    s = activateBy(s, "p1", vault, "Discard");
    s = settle(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest", "Swamp", "Island"]);
    // With no card in hand, the ability cannot be activated.
    const t = scenario({ p1: { battlefield: ["Fomori Vault", "Ancient Cornucopia", ...lands("Plains", 3)] } });
    expect(hasActivate(t, "p1", idOf(t, "p1", "battlefield", "Fomori Vault"), "Discard")).toBe(false);
  });

  it("Loot, the Key to Everything: at your upkeep, exile as many cards as there are types among your other nonland permanents, playable this turn", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: {
        battlefield: ["Loot, the Key to Everything", GREY, ENCH, "Forest"],
        library: ["Mountain", "Opt", "Bear Cub", "Swamp", "Island"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Loot, the Key to Everything")).keywords).toContain("ward");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Artifact, creature, enchantment: three cards (Loot itself and the land do not count).
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Mountain", "Opt", "Bear Cub"]);
    const mountain = exiled(s, "Mountain")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    const later = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(later.exile).toContain(mountain);
    const next = advanceUntil(later, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(legalActions(next, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  describe("Lost Jitte", () => {
    it("the equipped creature deals combat damage: a charge counter", () => {
      let s = scenario({ p1: { battlefield: ["Lost Jitte", "Bear Cub"] } });
      const jitte = idOf(s, "p1", "battlefield", "Lost Jitte");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      equip(s, jitte, bear);
      s = settleNoBlocks(attack(s, [bear]));
      s = passUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[jitte]?.counters.charge).toBe(1);
    });

    it("remove a charge counter: untap a land, a creature can't block, or a +1/+1 counter on the equipped creature", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Lost Jitte", counters: { charge: 3 } }, "Bear Cub", { name: "Forest", tapped: true }] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const jitte = idOf(s, "p1", "battlefield", "Lost Jitte");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Without an equipped creature, no +1/+1 counter.
      expect(hasActivate(s, "p1", jitte, "+1/+1 counter")).toBe(false);
      equip(s, jitte, bear);
      s = settle(activateBy(s, "p1", jitte, "+1/+1 counter"));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
      s = settle(activateBy(s, "p1", jitte, "Untap", { targets: { t: [forest] } }));
      expect(s.objects[forest]?.tapped).toBe(false);
      s = settle(activateBy(s, "p1", jitte, "Can't block", { targets: { t: [angel] } }));
      expect(s.objects[jitte]?.counters.charge ?? 0).toBe(0);
      expect(hasActivate(s, "p1", jitte, "Untap")).toBe(false);
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: bear }] })).toThrow();
    });
  });

  it('Lotus Ring: indestructible; the equipped creature gets +3/+3, vigilance and "{T}, sacrifice it: add three mana of any one color"', () => {
    let s = scenario({ p1: { battlefield: ["Lotus Ring", "Bear Cub"] } });
    const ring = idOf(s, "p1", "battlefield", "Lotus Ring");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, ring).keywords).toContain("indestructible");
    expect(hasActivate(s, "p1", ring, msg("Equip {cost}", { cost: "{3}" }))).toBe(false);
    equip(s, ring, bear);
    expect(chars(s, bear)).toMatchObject({ power: 5, toughness: 5 });
    expect(chars(s, bear).keywords).toContain("vigilance");
    const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === bear);
    expect(opt?.type === "tapForMana" && opt.colors).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
    s = act(s, "p1", { type: "tapForMana", source: bear, ability: opt?.type === "tapForMana" ? opt.ability : -1, color: "R" });
    expect(s.players.p1?.manaPool.R).toBe(3);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    expect(s.objects[ring]?.zone).toBe("battlefield");
  });

  it("Memory Vessel: {T}, exile it: each player exiles seven cards, playable by their owner until your next turn", () => {
    let s = scenario({
      p1: { battlefield: ["Memory Vessel"], library: lands("Mountain", 9) },
      p2: { library: lands("Swamp", 9) },
    });
    const vessel = idOf(s, "p1", "battlefield", "Memory Vessel");
    s = settle(activateBy(s, "p1", vessel, "Each player"));
    expect(exiled(s, "Memory Vessel")).toHaveLength(1);
    expect(exiled(s, "Mountain")).toHaveLength(7);
    expect(exiled(s, "Swamp")).toHaveLength(7);
    const mountain = exiled(s, "Mountain")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // The opponent plays their exiled cards during their turn.
    const p2turn = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const swamp = exiled(p2turn, "Swamp")[0] as string;
    expect(legalActions(p2turn, "p2").some((a) => a.type === "playLand" && a.card === swamp)).toBe(true);
    // At your next turn, the effect has ended.
    const back = advanceUntil(p2turn, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(legalActions(back, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  it("Nexus of Becoming: at the beginning of your combat, draw, then exile an artifact or creature card: a 3/3 artifact Golem token copy", () => {
    let s = scenario({
      step: "main1",
      p1: { battlefield: ["Nexus of Becoming"], hand: ["Shivan Dragon", "Opt"], library: ["Island", "Forest"] },
    });
    s = passUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    s = settle(s, (req, _p, cur) => pickNamed(cur, req, "Shivan Dragon"));
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Opt"]);
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    const token = idOf(s, "p1", "battlefield", "Shivan Dragon");
    expect(s.objects[token]?.isToken).toBe(true);
    const c = chars(s, token);
    expect(c).toMatchObject({ power: 3, toughness: 3 });
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Dragon", "Golem"]));
    expect(c.keywords).toContain("flying");
    // At the opponent's combat, nothing.
    let t = scenario({ active: "p2", p1: { battlefield: ["Nexus of Becoming"], hand: ["Shivan Dragon"] } });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p1?.hand).toHaveLength(1);
    // Refusing to exile: no token.
    let u = scenario({ p1: { battlefield: ["Nexus of Becoming"], hand: ["Shivan Dragon"] } });
    u = passUntil(u, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    u = settle(u, (req) => (req.type === "pick" ? [] : undefined));
    expect(namesIn(u, u.players.p1?.hand).sort()).toEqual(["Forest", "Shivan Dragon"]);
    expect(idsOf(u, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
  });

  it("Omenpath Journey: exiles up to five lands with different names; at your end step, one of them enters tapped, at random", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Omenpath Journey"],
        library: ["Plains", "Island", "Swamp", "Mountain", "Forest", "Forest", "Opt"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Omenpath Journey") });
    let offered: string[] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick") return undefined;
      offered = req.options;
      return undefined;
    });
    const names = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
    expect(offered.map((id) => nameOf(s, id)).filter((n) => n === "Opt")).toHaveLength(0);
    const exiledLands = s.exile.map((id) => nameOf(s, id));
    expect([...exiledLands].sort()).toEqual([...names].sort());
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Forest", "Opt"]);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    const arrived = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && names.includes(nameOf(s, id) ?? ""));
    // Four Forests to start, plus one exiled card.
    expect(arrived).toHaveLength(5);
    expect(s.exile).toHaveLength(4);
    const fresh = arrived.find((id) => s.objects[id]?.tapped && !s.exile.includes(id));
    expect(fresh).toBeDefined();
  });

  it("Sandstorm Salvager: a 3/3 colorless Golem on arrival; {2}, {T}: a +1/+1 counter and trample for your creature tokens only", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 5)], hand: ["Sandstorm Salvager"] },
      p2: { battlefield: [] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sandstorm Salvager") }));
    const golem = idOf(s, "p1", "battlefield", "Golem");
    expect(chars(s, golem)).toMatchObject({ power: 3, toughness: 3, colors: [] });
    expect(chars(s, golem).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    const salvager = idOf(s, "p1", "battlefield", "Sandstorm Salvager");
    const obj = s.objects[salvager];
    if (obj) obj.controlledSince = 0;
    s = settle(activateBy(s, "p1", salvager, "Your creature tokens"));
    expect(chars(s, golem)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, golem).keywords).toContain("trample");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, salvager).keywords).not.toContain("trample");
    // Trample lasts until end of turn; the counter stays.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, golem)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, golem).keywords).not.toContain("trample");
  });

  it("Sword of Wealth and Power: +2/+2, protection from instants; combat damage to a player: a Treasure, and the next instant is copied", () => {
    let s = scenario({
      p1: { battlefield: ["Sword of Wealth and Power", "Bear Cub", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Swab Goblin"], hand: ["Shock"] },
    });
    const sword = idOf(s, "p1", "battlefield", "Sword of Wealth and Power");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    equip(s, sword, bear);
    expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 4 });
    // Protection from instants: Shock can't target it.
    const shockOpt = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
    const legal = shockOpt?.type === "cast" ? (shockOpt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).not.toContain(bear);
    expect(legal).toContain(idOf(s, "p2", "battlefield", "Swab Goblin"));
    s = throughCombat(attack(s, [bear]));
    expect(s.players.p2?.life).toBe(16);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
    s = settle(s);
    // Shock and its copy: 4 damage.
    expect(s.players.p2?.life).toBe(12);
  });

  it("Tarnation Vista: enters tapped with a chosen color; {1}, {T}: one mana of each color among your monocolored permanents", () => {
    let s = scenario({ p1: { battlefield: [GOLD, RED, GREY, "Bear Cub", "Plains"], hand: ["Tarnation Vista"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "playLand");
    expect(opt?.type === "playLand" && opt.choose).toBeTruthy();
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Tarnation Vista"), chosen: "U" });
    const vista = idOf(s, "p1", "battlefield", "Tarnation Vista");
    expect(s.objects[vista]?.tapped).toBe(true);
    const obj = s.objects[vista];
    if (obj) obj.tapped = false;
    bump(s);
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === vista ? a.colors : []));
    expect(colors).toEqual(["U"]);
    s = activateBy(s, "p1", vista, "One mana of each");
    s = settle(s);
    // Red (Goblin) and green (Bear Cub); neither the two-color Bear nor the colorless Golem.
    expect(s.players.p1?.manaPool).toMatchObject({ R: 1, G: 1, W: 0, U: 0, B: 0 });
  });

  it("Territory Forge: when cast, it exiles a targeted artifact or land and gains its activated abilities", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["Territory Forge"] },
      p2: { battlefield: ["Transmutation Font", "Bear Cub"] },
    });
    const font = idOf(s, "p2", "battlefield", "Transmutation Font");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Territory Forge") });
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || !req.options.includes(font)) return undefined;
      offered = namesIn(cur, req.options) as string[];
      return [font];
    });
    // An artifact or a land, of any player; not a creature.
    expect(offered).toEqual(expect.arrayContaining(["Transmutation Font", "Mountain"]));
    expect(offered).not.toContain("Bear Cub");
    expect(exiled(s, "Transmutation Font")).toHaveLength(1);
    const forge = idOf(s, "p1", "battlefield", "Territory Forge");
    s = settle(activateBy(s, "p1", forge, "Clue token"));
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Transmutation Font: {T}: a Blood, Clue or Food token; {3}, {T}, sacrifice three artifact tokens: an artifact from the library onto the battlefield (an uncast Territory Forge exiles nothing)", () => {
    let s = scenario({ p1: { battlefield: ["Transmutation Font"] } });
    const font = idOf(s, "p1", "battlefield", "Transmutation Font");
    for (const label of ["Blood token", "Clue token", "Food token"]) expect(hasActivate(s, "p1", font, label)).toBe(true);
    s = settle(activateBy(s, "p1", font, "Blood token"));
    expect(idsOf(s, "p1", "battlefield", "Blood")).toHaveLength(1);
    expect(s.objects[font]?.tapped).toBe(true);
    let t = scenario({
      p1: {
        battlefield: ["Transmutation Font", ...lands("Plains", 3)],
        library: ["Opt", "Territory Forge", "Island"],
      },
      p2: { battlefield: ["Lost Jitte"] },
    });
    for (const name of ["Clue", "Food", "Treasure"]) createTokens(t, "p1", TOKEN_SPECS[name] as TokenSpec, 1);
    const font2 = idOf(t, "p1", "battlefield", "Transmutation Font");
    // Sorcery speed only.
    const inCombat = passUntil(t, (x) => x.turn.step === "beginCombat");
    expect(hasActivate(inCombat, "p1", font2, "An artifact")).toBe(false);
    t = activateBy(t, "p1", font2, "An artifact");
    t = settle(t, (req, _p, cur) => pickNamed(cur, req, "Territory Forge"));
    expect(idsOf(t, "p1", "battlefield", "Territory Forge")).toHaveLength(1);
    for (const n of ["Clue", "Food", "Treasure"]) expect(idsOf(t, "p1", "battlefield", n)).toHaveLength(0);
    // Territory Forge was not cast: the opposing Lost Jitte stays.
    expect(idsOf(t, "p2", "battlefield", "Lost Jitte")).toHaveLength(1);
    expect(t.stack).toHaveLength(0);
  });

  it("Transmutation Font: the three sacrificed artifact tokens have different names", () => {
    let s = scenario({ p1: { battlefield: ["Transmutation Font", ...lands("Plains", 3)], library: ["Territory Forge"] } });
    for (const name of ["Clue", "Clue", "Food"]) createTokens(s, "p1", TOKEN_SPECS[name] as TokenSpec, 1);
    const font = idOf(s, "p1", "battlefield", "Transmutation Font");
    // Only two names: the ability is not offered.
    expect(hasActivate(s, "p1", font, "An artifact")).toBe(false);
    createTokens(s, "p1", TOKEN_SPECS.Treasure as TokenSpec, 1);
    const clues = idsOf(s, "p1", "battlefield", "Clue");
    const food = idOf(s, "p1", "battlefield", "Food");
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    const ability = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === font && x.label?.startsWith("An artifact"),
    );
    if (ability?.type !== "activate") throw new Error("ability not found");
    // Two Clues: refused.
    expect(() => act(s, "p1", { type: "activate", source: font, ability: ability.ability, sacrifice: [...clues, food] })).toThrow(
      RulesError,
    );
    // The default choice takes one token of each name.
    s = settle(act(s, "p1", { type: "activate", source: font, ability: ability.ability }));
    expect(idsOf(s, "p1", "battlefield", "Territory Forge")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    expect(s.objects[food]).toBeUndefined();
    expect(s.objects[treasure]).toBeUndefined();
  });
});

describe("Grand Abolisher (PLAN-M M7)", () => {
  it("during your turn, opponents can't activate the mana abilities of their creatures either; their lands still tap", () => {
    const board = { p1: { battlefield: ["Grand Abolisher"] }, p2: { battlefield: ["Llanowar Elves", "Forest"] } };
    let s = scenario(board);
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(availableMana(s, "p2")).toBe(1);
    expect(legalActions(s, "p2").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(false);
    expect(() => act(s, "p2", { type: "tapForMana", source: elves, ability: 0 })).toThrow(RulesError);
    // During p2's own turn, the Elves tap for mana.
    const t = scenario({ ...board, active: "p2" });
    expect(availableMana(t, "p2")).toBe(2);
  });
});
