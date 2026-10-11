/**
 * Murders at Karlov Manor (partial set: cards from the meta decks): each implemented card is checked against its
 * Oracle text (plan R, lot R7).
 */

import type { RawCard } from "@mtgx/cards";
import { toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { CLUE, SPIRIT_WB, SUSPECTED } from "../../cards/src/mkm/common";
import { createTokens, destroy } from "../src/actions";
import { castOption } from "../src/cardDef";
import * as dsl from "../src/dsl";
import { addEffect, evalAmount, putFaceDown } from "../src/effects";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars, FACE_DOWN_ID, moveObject } from "../src/state";
import { isLegalTarget, matchesObjectFilter } from "../src/targets";
import { msg } from "../src/text";
import { canBlock, requiredBlocks } from "../src/turn";
import type { ChoiceRequest, ChoiceValue, Decision, GameState } from "../src/types";
import { projectView } from "../src/view";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  passBoth,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  steal,
  untilCastNow,
} from "./helpers";

type S = GameState;
describe("Murders at Karlov Manor", () => {
  describe("surveil lands (Thundering Falls, Meticulous Archive, Underground Mortuary)", () => {
    it("enter tapped, then surveil 1: the top card may go to the graveyard", () => {
      let s = scenario({ p1: { hand: ["Thundering Falls"], library: ["Opt", "Forest", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Thundering Falls") });
      const falls = idOf(s, "p1", "battlefield", "Thundering Falls");
      expect(s.objects[falls]?.tapped).toBe(true);
      let asked: ChoiceRequest | undefined;
      s = settle(s, (req) => {
        if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
        asked = req;
        return req.options;
      });
      expect(asked).toBeDefined();
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("the card can be kept on top", () => {
      let s = scenario({ p1: { hand: ["Meticulous Archive"], library: ["Opt", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Meticulous Archive") });
      s = settle(s, (req) => (req.intent === "surveilGraveyard" ? [] : undefined));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Opt");
    });

    it("their basic land types give their two mana colors", () => {
      const s = scenario({ p1: { battlefield: ["Thundering Falls", "Meticulous Archive", "Underground Mortuary"] } });
      const colors = (name: string) => {
        const id = idOf(s, "p1", "battlefield", name);
        expect(chars(s, id).subtypes).toHaveLength(2);
        return legalActions(s, "p1")
          .flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []))
          .sort();
      };
      expect(colors("Thundering Falls")).toEqual(["R", "U"]);
      expect(colors("Meticulous Archive")).toEqual(["U", "W"]);
      expect(colors("Underground Mortuary")).toEqual(["B", "G"]);
    });
  });

  describe("Vengeful Tracker", () => {
    it("an opponent who sacrifices an artifact takes 2 damage", () => {
      let s = scenario({
        p1: { battlefield: ["Vengeful Tracker"] },
        p2: { battlefield: ["Esoteric Duplicator", ...lands("Island", 2)] },
      });
      s = act(s, "p1", { type: "pass" });
      const dup = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p2").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p2", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, (req) => (req.intent === "may" || req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(20);
    });

    it("sacrificing your own artifact triggers nothing", () => {
      let s = scenario({ p1: { battlefield: ["Vengeful Tracker", "Esoteric Duplicator", ...lands("Island", 2)] } });
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(20);
    });
  });

  describe("No More Lies", () => {
    const setup = (mountains: number) =>
      scenario({
        p1: { battlefield: lands("Mountain", mountains), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Plains", "Island"], hand: ["No More Lies"] },
      });

    it("if the controller can't pay {3}, the spell is countered and exiled", () => {
      let s = setup(2);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "No More Lies", { t: [strike] });
      s = settle(s);
      expect(s.players.p2?.life).toBe(20);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    });

    it("if they pay {3}, the spell resolves", () => {
      let s = setup(5);
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "No More Lies", { t: [strike] });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(17);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(5);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Deadly Cover-Up", () => {
    it("without collecting evidence: all creatures are destroyed, no graveyard is touched", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Deadly Cover-Up"] },
        p2: { battlefield: ["Fire Elemental"], graveyard: ["Opt"] },
      });
      s = settle(cast(s, "p1", "Deadly Cover-Up"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    it("collect evidence 6 requires a total mana value of at least 6 in your graveyard", () => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Deadly Cover-Up"], graveyard: ["Bear Cub", "Opt"] },
      });
      expect(() => cast(s, "p1", "Deadly Cover-Up", undefined, { kicked: true })).toThrow();
    });
  });

  describe("Case of the Uneaten Feast", () => {
    it("each creature that enters under your control gains you 1 life, not the opponent's", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(21);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Case of the Uneaten Feast"] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
      });
      t = settle(cast(t, "p2", "Bear Cub"));
      expect(t.players.p1?.life).toBe(20);
    });

    it("solved at the beginning of your end step if you gained at least 5 life this turn", () => {
      const run = (hand: string) => {
        let s = scenario({ p1: { battlefield: ["Case of the Uneaten Feast", ...lands("Forest", 7)], hand: [hand] } });
        s = settle(cast(s, "p1", hand));
        const caseId = idOf(s, "p1", "battlefield", "Case of the Uneaten Feast");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return (s.objects[caseId] as { solved?: boolean }).solved ?? false;
      };
      // Pelakka Wurm: 7 life, plus 1 for the Case.
      expect(run("Pelakka Wurm")).toBe(true);
      expect(run("Bear Cub")).toBe(false);
    });
  });

  describe("Warleader's Call", () => {
    it("your creatures get +1/+1, not the opponents'", () => {
      const s = scenario({ p1: { battlefield: ["Warleader's Call", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const mine = chars(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const theirs = chars(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      expect([mine.power, mine.toughness]).toEqual([3, 3]);
      expect([theirs.power, theirs.toughness]).toEqual([2, 2]);
    });

    it("a creature that enters under your control deals 1 damage to each opponent", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Warleader's Call", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
    });
  });

  describe("Steamcore Scholar", () => {
    it("flying and vigilance", () => {
      const s = scenario({ p1: { battlefield: ["Steamcore Scholar"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Steamcore Scholar")).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance"]),
      );
    });

    it("draw two cards, then discard two, or just one instant", () => {
      const run = (library: string[], pickInstant: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Steamcore Scholar"], library } });
        s = settle(cast(s, "p1", "Steamcore Scholar"), (req) => {
          if (req.type !== "pick" || !pickInstant) return undefined;
          const opt = req.options.find((id) => nameOf(s, id) === "Opt");
          return opt ? [opt] : undefined;
        });
        if (s.pending?.kind === "discard") {
          const hand = s.players.p1?.hand ?? [];
          const opt = hand.find((id) => nameOf(s, id) === "Opt");
          s = settle(act(s, "p1", { type: "discard", cards: pickInstant && opt ? [opt] : hand.slice(0, 2) }));
        }
        return s;
      };
      const kept = run(["Opt", "Forest", "Forest"], true);
      expect(kept.players.p1?.hand.map((id) => nameOf(kept, id))).toEqual(["Forest"]);
      expect(kept.players.p1?.graveyard.map((id) => nameOf(kept, id))).toEqual(["Opt"]);
      const both = run(["Forest", "Forest", "Forest"], false);
      expect(both.players.p1?.hand).toHaveLength(0);
      expect(both.players.p1?.graveyard).toHaveLength(2);
    });
  });
});

describe("Murders at Karlov Manor, core: suspect (701.60)", () => {
  /** Test creature: "when it enters, suspect up to one target creature"; {1}: "it's no longer suspected". */
  const SUSPECTER = customCard({
    name: "Test Investigator",
    power: 1,
    toughness: 1,
    abilities: [
      dsl.triggered(dsl.when.entersSelf, [dsl.fx.suspect(dsl.ref.target())], {
        targets: [dsl.target.upTo(1, dsl.target.creature())],
        label: "Suspect a creature",
      }),
      dsl.activated({
        mana: "{1}",
        targets: [dsl.target.creature()],
        effects: [dsl.fx.suspect(dsl.ref.target(), false)],
        label: "Plus suspecte",
      }),
    ],
  });

  it("a suspected creature has menace and can't block; the view shows it; no longer suspected, it can block", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Island"], hand: [SUSPECTER] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", SUSPECTER.name), (req) =>
      req.type === "pick" && req.options.includes(theirs) ? [theirs] : undefined,
    );
    expect(s.objects[theirs]?.suspected).toBeTruthy();
    expect(chars(s, theirs).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
    expect(projectView(s, "p1").battlefield.find((o) => o.id === theirs)?.suspected).toBe(true);
    // It can't block our attacking Bear.
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: [{ id: mine, defender: "p2" }] });
    expect(canBlock(c, theirs, mine)).toBe(false);
    // "It's no longer suspected": it blocks again, without menace.
    const source = idOf(s, "p1", "battlefield", SUSPECTER.name);
    const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === source);
    s = settle(
      act(s, "p1", { type: "activate", source, ability: ab?.type === "activate" ? ab.ability : -1, targets: { t: [theirs] } }),
    );
    expect(s.objects[theirs]?.suspected).toBeUndefined();
    expect(chars(s, theirs).keywords).not.toContain("menace");
    c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: [{ id: mine, defender: "p2" }] });
    expect(canBlock(c, theirs, mine)).toBe(true);
  });

  it('701.60c: menace and "can\'t block" are a layer 6 effect timestamped at the suspicion (PLAN-M M7)', () => {
    const suspectBear = (before?: (s: GameState, bear: string) => void) => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: [SUSPECTER] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      before?.(s, bear);
      s = settle(cast(s, "p1", SUSPECTER.name), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      return { s, bear };
    };
    // Suspected, then "loses all abilities": menace and "can't block" are lost; it stays suspected.
    const { s, bear } = suspectBear();
    addEffect(s, [bear], { loseAllAbilities: true }, "permanent");
    expect(s.objects[bear]?.suspected).toBeTruthy();
    expect(chars(s, bear).keywords).not.toContain("menace");
    expect(chars(s, bear).keywords).not.toContain("cantBlock");
    // "Loses all abilities", then suspected: the more recent suspicion gives them back.
    const later = suspectBear((t, id) => addEffect(t, [id], { loseAllAbilities: true }, "permanent"));
    expect(chars(later.s, later.bear).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
  });

  it('the "suspected creature" filter; the designation is lost on leaving the battlefield', () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const o = s.objects[bear];
    if (o) o.suspected = 1;
    expect(matchesObjectFilter(s, "p1", bear, SUSPECTED)).toBe(true);
    expect(matchesObjectFilter(s, "p1", elves, SUSPECTED)).toBe(false);
    const back = moveObject(s, bear, "hand") as string;
    const again = moveObject(s, back, "battlefield") as string;
    expect(s.objects[again]?.suspected).toBeUndefined();
  });
});

describe("Murders at Karlov Manor, lot A — white", () => {
  /**
   * Murders at Karlov Manor, lot A — white cards: each card with non-trivial behavior is checked against its Oracle
   * text (plan R, lot R7).
   */
  type S = GameState;
  /** Answers target choices by designating these objects. */
  const picking =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  /** Activates the ability of the source whose label contains `label` (the first otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`No ability "${label ?? ""}" for ${nameOf(s, source)}`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  const pt = (s: S, id: string) => {
    const c = chars(s, id);
    return [c.power, c.toughness];
  };
  const count = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name).length;
  const faceDownIds = (s: S) => s.battlefield.filter((x) => s.objects[x]?.defId === FACE_DOWN_ID);
  /** Casts the card face down for {3}, then turns it face up (special action). */
  const castDisguisedThenTurnUp = (s: S, name: string): { s: S; id: string } => {
    let cur = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), faceDown: true }));
    const id = faceDownIds(cur)[0] as string;
    cur = activate(cur, "p1", id, "Turn face up");
    expect(nameOf(cur, id)).toBe(name);
    return { s: cur, id };
  };
  /** Test Detective with disguise ("when a Detective is turned face up"). */
  const DISGUISED_DETECTIVE = toCardDef(
    {
      name: "Disguised Detective",
      number: "1",
      rarity: "common",
      manaCost: "{3}{W}",
      cmc: 4,
      typeLine: "Creature — Human Detective",
      oracleText: "Disguise {W}",
      power: "3",
      toughness: "3",
      colors: ["W"],
      keywords: ["Disguise"],
      image: "",
      artCrop: "",
      legalities: { standard: "legal" },
    } satisfies RawCard,
    {},
    "TST",
  );
  /** Advances to p1's declare attackers and attacks p2 with these creatures. */
  const attackWith = (s: S, ids: string[]) => {
    const c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  describe("Absolving Lammasu", () => {
    it("when it enters, no creature is suspected anymore; when it dies, 3 life and an opposing creature suspected", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 5), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Absolving Lammasu", "Lightning Strike"],
        },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      for (const id of [mine, theirs]) (s.objects[id] as { suspected?: number }).suspected = 1;
      s = settle(cast(s, "p1", "Absolving Lammasu"));
      expect(s.objects[mine]?.suspected).toBeFalsy();
      expect(s.objects[theirs]?.suspected).toBeFalsy();
      const lammasu = idOf(s, "p1", "battlefield", "Absolving Lammasu");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [lammasu] }), picking(elves));
      expect(idsOf(s, "p1", "graveyard", "Absolving Lammasu")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[elves]?.suspected).toBeTruthy();
      expect(s.objects[theirs]?.suspected).toBeFalsy();
    });
  });

  describe("Assemble the Players", () => {
    it("once per turn, a creature with power 2 or less can be cast from the top of the library", () => {
      let s = scenario({
        p1: { battlefield: ["Assemble the Players", ...lands("Forest", 4)], library: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(count(s, "p1", "Bear Cub")).toBe(1);
      // The Elves are now on top, but the permission was used this turn.
      const next = s.players.p1?.library[0] as string;
      expect(nameOf(s, next)).toBe("Llanowar Elves");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === next)).toBe(false);
    });

    it("not a creature with power 3 or more", () => {
      const s = scenario({
        p1: { battlefield: ["Assemble the Players", ...lands("Mountain", 5)], library: ["Fire Elemental", "Forest"] },
      });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(false);
    });
  });

  describe("Auspicious Arrival", () => {
    it("+2/+2 until end of turn and a Clue", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Auspicious Arrival"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Auspicious Arrival", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(count(s, "p1", "Clue")).toBe(1);
    });
  });

  describe("Call a Surprise Witness", () => {
    it("returns a creature with mana value 3 or less with a flying counter; it's also a Spirit", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Call a Surprise Witness"], graveyard: ["Bear Cub", "Fire Elemental"] },
      });
      const fire = idOf(s, "p1", "graveyard", "Fire Elemental");
      expect(() => cast(s, "p1", "Call a Surprise Witness", { t: [fire] })).toThrow();
      s = settle(cast(s, "p1", "Call a Surprise Witness", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spirit"]));
    });
  });

  describe("Case of the Pilfered Proof", () => {
    it("a Detective that enters under your control gets a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Pilfered Proof", "Plains"], hand: ["Novice Inspector"] } });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Novice Inspector")]?.counters["+1/+1"]).toBe(1);
    });

    it("a Detective turned face up gets a +1/+1 counter (face down, it didn't get one)", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Pilfered Proof", ...lands("Plains", 4)], hand: [DISGUISED_DETECTIVE] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED_DETECTIVE.name), faceDown: true }));
      const id = faceDownIds(s)[0] as string;
      expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, id)).toEqual([4, 4]);
    });

    it("solved with three Detectives; your tokens are then created with an extra Clue", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Case of the Pilfered Proof",
            "Novice Inspector",
            "Novice Inspector",
            "Novice Inspector",
            ...lands("Plains", 2),
          ],
          hand: ["Auspicious Arrival"],
        },
      });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Pilfered Proof");
      const solved = (x: S) => (x.objects[caseId] as { solved?: boolean }).solved ?? false;
      s = advanceUntil(s, (x) => solved(x) && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
      expect(solved(s)).toBe(true);
      expect(s.turn.step).toBe("end");
      // Investigate: the Clue, plus a Clue.
      s = settle(cast(s, "p1", "Auspicious Arrival", { t: [idOf(s, "p1", "battlefield", "Novice Inspector")] }));
      expect(count(s, "p1", "Clue")).toBe(2);
    });

    it("not solved with two Detectives", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Pilfered Proof", "Novice Inspector", "Novice Inspector"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Pilfered Proof");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
    });
  });

  describe("Delney, Streetwise Lookout", () => {
    it("your creatures with power 2 or less can't be blocked by creatures with power 3 or more", () => {
      let s = scenario({
        p1: { battlefield: ["Delney, Streetwise Lookout", "Bear Cub", "Fire Elemental"] },
        p2: { battlefield: ["Fire Elemental", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const myFire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const theirFire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = attackWith(s, [bear, myFire]);
      expect(canBlock(s, theirFire, bear)).toBe(false);
      expect(canBlock(s, elves, bear)).toBe(true);
      expect(canBlock(s, theirFire, myFire)).toBe(true);
    });

    it("the triggered abilities of your creatures with power 2 or less trigger one more time", () => {
      let s = scenario({
        p1: {
          battlefield: ["Delney, Streetwise Lookout", ...lands("Plains", 6)],
          hand: ["Novice Inspector", "Haazda Vigilante"],
        },
      });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Clue")).toBe(2);
      // Haazda Vigilante (power 4): a single trigger, so a single counter.
      const inspector = idOf(s, "p1", "battlefield", "Novice Inspector");
      s = settle(cast(s, "p1", "Haazda Vigilante"), picking(inspector));
      expect(s.objects[inspector]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Doorkeeper Thrull", () => {
    it("a creature entering triggers nothing, on either side", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Novice Inspector"] },
        p2: { battlefield: ["Doorkeeper Thrull"] },
      });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Novice Inspector")).toBe(1);
      expect(count(s, "p1", "Clue")).toBe(0);
    });
  });

  describe("Due Diligence", () => {
    it("the enchanted creature gets +2/+2 and vigilance; another of your creatures too until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub", "Llanowar Elves"], hand: ["Due Diligence"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      let asked: string[] = [];
      s = settle(cast(s, "p1", "Due Diligence", { enchant: [bear] }), (req) => {
        if (req.type !== "pick") return undefined;
        asked = req.options.map(String);
        return [elves];
      });
      expect(asked).not.toContain(bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("vigilance");
      expect(pt(s, elves)).toEqual([3, 3]);
      expect(chars(s, elves).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, elves)).toEqual([1, 1]);
      expect(pt(s, bear)).toEqual([4, 4]);
    });
  });

  describe("Essence of Antiquity", () => {
    it("turned face up: your creatures gain hexproof and untap", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 6), { name: "Bear Cub", tapped: true }],
          hand: ["Essence of Antiquity"],
        },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Essence of Antiquity");
      s = settle(turned.s);
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(chars(s, bear).keywords).toContain("hexproof");
      expect(chars(s, turned.id).keywords).toContain("hexproof");
      expect(s.objects[theirs]?.tapped).toBe(true);
      expect(chars(s, theirs).keywords).not.toContain("hexproof");
      expect(pt(s, turned.id)).toEqual([1, 10]);
    });
  });

  describe("Forum Familiar", () => {
    it("turned face up: another of your permanents returns to hand, and it gets a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Forum Familiar"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Forum Familiar");
      s = settle(turned.s, picking(bear));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.objects[turned.id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, turned.id)).toEqual([2, 2]);
    });
  });

  describe("Griffnaut Tracker", () => {
    it("exiles up to two cards from a single graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Griffnaut Tracker"], graveyard: ["Opt"] },
        p2: { graveyard: ["Bear Cub", "Lightning Strike"] },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const [a, b] = s.players.p2?.graveyard ?? [];
      s = settle(cast(s, "p1", "Griffnaut Tracker"), (req) => {
        if (req.type !== "pick" || !req.options.includes(a as string)) return undefined;
        // Two different graveyards: refused by the engine; so two cards from the same one are designated.
        expect(req.options).toContain(opt);
        return [a as string, b as string];
      });
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(s.exile).toHaveLength(2);
    });

    it("refuses cards from two different graveyards", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Griffnaut Tracker"], graveyard: ["Opt"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const bear = s.players.p2?.graveyard[0] as string;
      s = cast(s, "p1", "Griffnaut Tracker");
      const ask = (x: S): S | undefined => {
        for (let i = 0; i < 20; i++) {
          const p = x.pending;
          if (p?.kind === "choice" && p.request.type === "pick" && p.request.options.includes(bear)) return x;
          if (p?.kind !== "priority") return undefined;
          x = act(x, p.player, { type: "pass" });
        }
        return undefined;
      };
      const at = ask(s);
      expect(at).toBeDefined();
      const p = at?.pending;
      if (p?.kind !== "choice") return;
      expect(() => act(at as S, p.player, { type: "choose", values: [opt, bear] })).toThrow();
    });
  });

  describe("Haazda Vigilante", () => {
    it("when it enters and attacks, a +1/+1 counter on one of your creatures with power 2 or less", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Fire Elemental"], hand: ["Haazda Vigilante"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Haazda Vigilante"), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(options).not.toContain(fire);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      // When attacking (scenario where it's already in play): a counter again.
      let t = scenario({ p1: { battlefield: ["Haazda Vigilante", "Llanowar Elves"] } });
      const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
      t = settle(attackWith(t, [idOf(t, "p1", "battlefield", "Haazda Vigilante")]), picking(elves));
      expect(t.objects[elves]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Inside Source", () => {
    it("creates a 2/2 Detective; {3}, {T}: a Detective gets +2/+0 and vigilance, at sorcery speed", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Inside Source"] } });
      s = settle(cast(s, "p1", "Inside Source"));
      const detective = idOf(s, "p1", "battlefield", "Detective");
      expect(chars(s, detective).subtypes).toEqual(["Detective"]);
      expect(chars(s, detective).colors).toEqual(["W", "U"]);
      // The Informant just arrived (summoning sick): it's tried on the next turn.
      let t = scenario({ p1: { battlefield: [...lands("Plains", 3), "Inside Source", "Novice Inspector"] } });
      const source = idOf(t, "p1", "battlefield", "Inside Source");
      const inspector = idOf(t, "p1", "battlefield", "Novice Inspector");
      t = settle(activate(t, "p1", source, undefined, { t: [inspector] }));
      expect(pt(t, inspector)).toEqual([3, 2]);
      expect(chars(t, inspector).keywords).toContain("vigilance");
    });
  });

  describe("Krovod Haunch", () => {
    it("equipped: +2/+0; {2}, {T}, sacrifice it: 3 life", () => {
      let s = scenario({ p1: { battlefield: ["Krovod Haunch", "Bear Cub", ...lands("Plains", 4)] } });
      const haunch = idOf(s, "p1", "battlefield", "Krovod Haunch");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", haunch, "Equip", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(activate(s, "p1", haunch, "3 life"), (req) => (req.type === "yesNo" ? [0] : undefined));
      expect(s.players.p1?.life).toBe(23);
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("put into the graveyard from the battlefield: pay {1}{W} for two 1/1 white Dogs", () => {
      let s = scenario({ p1: { battlefield: ["Krovod Haunch", ...lands("Plains", 4)], hand: ["Disenchant"] } });
      s = settle(cast(s, "p1", "Disenchant", { t: [idOf(s, "p1", "battlefield", "Krovod Haunch")] }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const dogs = idsOf(s, "p1", "battlefield", "Dog");
      expect(dogs).toHaveLength(2);
      expect(pt(s, dogs[0] as string)).toEqual([1, 1]);
      expect(chars(s, dogs[0] as string).colors).toEqual(["W"]);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(4);
    });
  });

  describe("Makeshift Binding", () => {
    it("exiles an opposing creature while it stays on the battlefield, and 2 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Makeshift Binding"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Makeshift Binding"), picking(bear));
      expect(count(s, "p2", "Bear Cub")).toBe(0);
      expect(s.players.p1?.life).toBe(22);
      destroy(s, idOf(s, "p1", "battlefield", "Makeshift Binding"));
      s = settle(s);
      expect(count(s, "p2", "Bear Cub")).toBe(1);
    });
  });

  describe("Marketwatch Phantom", () => {
    it("gains flying when another of your creatures with power 2 or less enters", () => {
      let s = scenario({
        p1: {
          battlefield: ["Marketwatch Phantom", ...lands("Forest", 4), ...lands("Mountain", 5)],
          hand: ["Fire Elemental", "Bear Cub"],
        },
      });
      const phantom = idOf(s, "p1", "battlefield", "Marketwatch Phantom");
      s = settle(cast(s, "p1", "Fire Elemental"));
      expect(chars(s, phantom).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(chars(s, phantom).keywords).toContain("flying");
    });
  });

  describe("Museum Nightwatch", () => {
    it("when it dies, creates a 2/2 Detective", () => {
      let s = scenario({ p1: { battlefield: ["Museum Nightwatch", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Museum Nightwatch")] }));
      expect(count(s, "p1", "Detective")).toBe(1);
    });
  });

  describe("Neighborhood Guardian", () => {
    it("another of your creatures with power 2 or less enters: a target creature gets +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Neighborhood Guardian", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const guardian = idOf(s, "p1", "battlefield", "Neighborhood Guardian");
      s = settle(cast(s, "p1", "Bear Cub"), picking(guardian));
      expect(pt(s, guardian)).toEqual([3, 3]);
    });
  });

  describe("Not on My Watch", () => {
    it("exiles an attacking creature", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 2), hand: ["Not on My Watch"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(() => cast(s, "p1", "Not on My Watch", { t: [elves] })).toThrow();
      s = settle(cast(s, "p1", "Not on My Watch", { t: [bear] }));
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    });
  });

  describe("Novice Inspector and On the Job", () => {
    it("Novice Inspector investigates when it enters", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Novice Inspector"] } });
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(count(s, "p1", "Clue")).toBe(1);
    });

    it("On the Job: your creatures get +2/+1, then investigate", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["On the Job"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "On the Job"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(count(s, "p1", "Clue")).toBe(1);
    });
  });

  describe("Perimeter Enforcer", () => {
    it("another Detective enters under your control: +1/+1 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Perimeter Enforcer", "Plains", ...lands("Forest", 2)], hand: ["Novice Inspector", "Bear Cub"] },
      });
      const enforcer = idOf(s, "p1", "battlefield", "Perimeter Enforcer");
      expect(chars(s, enforcer).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      s = settle(cast(s, "p1", "Novice Inspector"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
    });

    it("a Detective you control is turned face up: +1/+1 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Perimeter Enforcer", ...lands("Plains", 4)], hand: [DISGUISED_DETECTIVE] } });
      const enforcer = idOf(s, "p1", "battlefield", "Perimeter Enforcer");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED_DETECTIVE.name), faceDown: true }));
      // Face down, it's not a Detective: nothing.
      expect(pt(s, enforcer)).toEqual([1, 1]);
      s = settle(activate(s, "p1", faceDownIds(s)[0] as string, "Turn face up"));
      expect(pt(s, enforcer)).toEqual([2, 2]);
    });
  });

  describe("Sanctuary Wall", () => {
    it("taps a creature; stun counters on it and on the Wall if you wish", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { battlefield: ["Sanctuary Wall", ...lands("Plains", 3)] }, p2: { battlefield: ["Bear Cub"] } });
        const wall = idOf(s, "p1", "battlefield", "Sanctuary Wall");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", wall, undefined, { t: [bear] }), (req) =>
          req.type === "yesNo" ? [yes ? 1 : 0] : undefined,
        );
        return { s, wall, bear };
      };
      const a = run(true);
      expect(a.s.objects[a.bear]?.tapped).toBe(true);
      expect(a.s.objects[a.bear]?.counters.stun).toBe(1);
      expect(a.s.objects[a.wall]?.counters.stun).toBe(1);
      const b = run(false);
      expect(b.s.objects[b.bear]?.tapped).toBe(true);
      expect(b.s.objects[b.bear]?.counters.stun ?? 0).toBe(0);
      expect(b.s.objects[b.wall]?.counters.stun ?? 0).toBe(0);
    });
  });

  describe("Seasoned Consultant", () => {
    it("+2/+0 when you attack with three or more creatures", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Seasoned Consultant", "Bear Cub", "Llanowar Elves"] } });
        const consultant = idOf(s, "p1", "battlefield", "Seasoned Consultant");
        const all = s.battlefield.filter((id) => chars(s, id).types.includes("Creature"));
        s = settle(attackWith(s, all.slice(0, n)));
        return pt(s, consultant);
      };
      expect(run(3)).toEqual([3, 3]);
      expect(run(2)).toEqual([1, 3]);
    });
  });

  describe("Unyielding Gatekeeper", () => {
    it("turned face up: an opposing permanent is exiled and its controller creates a Detective", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Unyielding Gatekeeper"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Unyielding Gatekeeper");
      s = settle(turned.s, picking(bear));
      expect(count(s, "p2", "Bear Cub")).toBe(0);
      expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(count(s, "p2", "Detective")).toBe(1);
      expect(count(s, "p1", "Detective")).toBe(0);
    });

    it("turned face up: one of your permanents returns tapped, with no Detective", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Unyielding Gatekeeper"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const turned = castDisguisedThenTurnUp(s, "Unyielding Gatekeeper");
      s = settle(turned.s, picking(bear));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).not.toBe(bear);
      expect(s.objects[back]?.tapped).toBe(true);
      expect(count(s, "p1", "Detective")).toBe(0);
      expect(count(s, "p2", "Detective")).toBe(0);
    });
  });

  describe("Wrench", () => {
    it('equipped: +1/+1, vigilance and "{3}, {T}: tap a creature"; {2}, sacrifice it: draw', () => {
      let s = scenario({
        p1: { battlefield: ["Wrench", "Bear Cub", ...lands("Plains", 7)], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const wrench = idOf(s, "p1", "battlefield", "Wrench");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(chars(s, wrench).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", wrench, "Equip", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("vigilance");
      s = settle(activate(s, "p1", bear, "Tap a creature", { t: [elves] }));
      expect(s.objects[elves]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      s = settle(activate(s, "p1", wrench, "Draw a card"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "graveyard", "Wrench")).toHaveLength(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — blue", () => {
  /**
   * Murders at Karlov Manor, lot A: blue cards, checked against their Oracle text (plan R, lot R7).
   */
  type S = GameState;
  /**
   * Passes and answers choices (suggested answer by default) until an empty stack, with no pending trigger; a
   * requested discard discards the last cards in hand (the last drawn).
   */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "discard")
        cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(-p.count) });
      else break;
    }
    return cur;
  };
  /** Activated ability of the source whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`Ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };

  const clues = (s: S, player: string) => idsOf(s, player, "battlefield", "Clue").length;
  const faceDownOf = (s: S) => s.battlefield.find((id) => s.objects[id]?.defId === FACE_DOWN_ID) as string;
  /** Casts the card face down for {3}, then turns it face up for its disguise cost. */
  const castDisguisedThenFlip = (s: S, name: string, answer: Answer = () => undefined): S => {
    let cur = settle(cast(s, "p1", name, undefined, { faceDown: true }));
    const id = faceDownOf(cur);
    cur = activate(cur, "p1", id, "Turn face up");
    return settle(cur, answer);
  };
  /** Advances to p1's declare attackers, then attacks p2 with these creatures. */
  const attackWith = (s: S, ...ids: string[]): S => {
    const c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p1");
    return act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const pickIf =
    (wanted: string[]): Answer =>
    (req) =>
      req.type === "pick" && wanted.every((id) => req.options.includes(id)) ? wanted : undefined;

  /** The Case is solved, the stack is empty and p1 has priority. */
  const solved = (s: S, id: string) =>
    !!(s.objects[id] as { solved?: boolean } | undefined)?.solved &&
    s.stack.length === 0 &&
    s.pending?.kind === "priority" &&
    s.pending.player === "p1";

  const DETECTIVE_CARD = customCard({ name: "Test Detective", subtypes: ["Detective"], power: 2, toughness: 2 });

  describe("Agency Outfitter", () => {
    it("puts the Magnifying Glass from the graveyard and the Thinking Cap from the library onto the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 6),
          hand: ["Agency Outfitter"],
          graveyard: ["Magnifying Glass"],
          library: ["Forest", "Thinking Cap", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Agency Outfitter"));
      expect(idsOf(s, "p1", "battlefield", "Magnifying Glass")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Thinking Cap")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });

  describe("Behind the Mask", () => {
    it("the target becomes a base 4/3 artifact creature until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Island"], hand: ["Behind the Mask"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Behind the Mask", { t: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 3 });
      expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear)).toMatchObject({ power: 2, toughness: 2 });
      expect(chars(s, bear).types).not.toContain("Artifact");
    });

    it("with evidence collected (6), a base 1/1 instead", () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Behind the Mask"], graveyard: ["Pelakka Wurm"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Behind the Mask", { t: [bear] }, { kicked: true }));
      expect(chars(s, bear)).toMatchObject({ power: 1, toughness: 1 });
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Behind the Mask"]);
    });
  });

  describe("Benthic Criminologists", () => {
    const run = (yes: boolean) => {
      const s = scenario({ p1: { battlefield: [...lands("Island", 5), "Candlestick"], hand: ["Benthic Criminologists"] } });
      return settle(cast(s, "p1", "Benthic Criminologists"), (req) =>
        req.intent === "sacrifice" && req.type === "pick" ? (yes ? req.options : []) : undefined,
      );
    };

    it("when it enters, you may sacrifice an artifact to draw a card", () => {
      const s = run(true);
      expect(idsOf(s, "p1", "graveyard", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("without a sacrifice, no draw", () => {
      const s = run(false);
      expect(idsOf(s, "p1", "battlefield", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Bubble Smuggler", () => {
    it("turned face up for {5}{U}: four +1/+1 counters, 6/5", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 9), hand: ["Bubble Smuggler"] } });
      s = castDisguisedThenFlip(s, "Bubble Smuggler");
      const id = idOf(s, "p1", "battlefield", "Bubble Smuggler");
      expect(s.objects[id]?.counters["+1/+1"]).toBe(4);
      expect(chars(s, id)).toMatchObject({ power: 6, toughness: 5 });
    });
  });

  describe("Burden of Proof", () => {
    it("on a Detective you control: +2/+2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), DETECTIVE_CARD], hand: ["Burden of Proof"] } });
      const det = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      s = settle(cast(s, "p1", "Burden of Proof", { enchant: [det] }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Burden of Proof")]?.attachedTo).toBe(det);
      expect(chars(s, det)).toMatchObject({ power: 4, toughness: 4 });
    });

    it("otherwise: base 1/1, and it can't block Detectives", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), DETECTIVE_CARD, "Bear Cub"], hand: ["Burden of Proof"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Burden of Proof", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 1, toughness: 1 });
      const det = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      // Only the enchanted creature is affected.
      expect(chars(s, det)).toMatchObject({ power: 2, toughness: 2 });
      expect(chars(s, mine)).toMatchObject({ power: 2, toughness: 2 });
      const c = attackWith(s, det, mine);
      expect(canBlock(c, bear, det)).toBe(false);
      expect(canBlock(c, bear, mine)).toBe(true);
    });
  });

  describe("Candlestick", () => {
    it("the equipped creature gets +1/+1 and surveils 2 when attacking", () => {
      let s = scenario({
        p1: { battlefield: ["Candlestick", "Bear Cub", ...lands("Island", 2)], library: ["Opt", "Opt", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Equip", { targets: { t: [bear] } }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
      let asked = 0;
      s = settle(attackWith(s, bear), (req) => {
        if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
        asked = req.options.length;
        return req.options;
      });
      expect(asked).toBe(2);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt", "Opt"]);
    });

    it("{2}, sacrifice it: draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Candlestick", ...lands("Island", 2)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Draw a card"));
      expect(idsOf(s, "p1", "graveyard", "Candlestick")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Case of the Filched Falcon", () => {
    it("investigates when it enters; solved with three artifacts; the artifact becomes a 4/4 flying Bird", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Candlestick"], hand: ["Case of the Filched Falcon"] } });
      s = settle(cast(s, "p1", "Case of the Filched Falcon"));
      expect(clues(s, "p1")).toBe(1);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Filched Falcon");
      // Only two artifacts: not solved.
      const two = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((two.objects[caseId] as { solved?: boolean }).solved).toBeFalsy();
      // A third artifact (a second Clue): solved at the beginning of the end step.
      let t = scenario({
        p1: { battlefield: [...lands("Island", 4), "Candlestick", "Magnifying Glass"], hand: ["Case of the Filched Falcon"] },
      });
      t = settle(cast(t, "p1", "Case of the Filched Falcon"));
      const id = idOf(t, "p1", "battlefield", "Case of the Filched Falcon");
      t = advanceUntil(t, (x) => solved(x, id));
      expect(t.turn.step).toBe("end");
      const clue = idOf(t, "p1", "battlefield", "Clue");
      t = settle(activate(t, "p1", id, "Bird", { targets: { t: [clue] } }));
      expect(idsOf(t, "p1", "graveyard", "Case of the Filched Falcon")).toHaveLength(1);
      expect(chars(t, clue)).toMatchObject({ power: 4, toughness: 4 });
      expect(chars(t, clue).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(t, clue).subtypes).toEqual(expect.arrayContaining(["Clue", "Bird"]));
      expect(chars(t, clue).keywords).toContain("flying");
    });
  });

  describe("Case of the Ransacked Lab", () => {
    it("your instants and sorceries cost {1} less", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Ransacked Lab", "Mountain"], hand: ["Lightning Strike"] } });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("solved after four instants this turn; then each instant draws a card", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Ransacked Lab", ...lands("Island", 5)], hand: Array(5).fill("Opt") },
      });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Ransacked Lab");
      for (let i = 0; i < 4; i++) s = settle(cast(s, "p1", "Opt"));
      s = advanceUntil(s, (x) => solved(x, caseId));
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Opt"));
      // Opt leaves the hand, then two cards drawn (Opt and the Case).
      expect(s.players.p1?.hand.length).toBe(before + 1);
    });
  });

  describe("Cold Case Cracker", () => {
    it("when it dies, its controller investigates", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Cold Case Cracker"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Cold Case Cracker")] }));
      expect(idsOf(s, "p2", "graveyard", "Cold Case Cracker")).toHaveLength(1);
      expect(clues(s, "p2")).toBe(1);
    });
  });

  describe("Coveted Falcon", () => {
    it("turned face up: an opponent gains control of the targeted permanents, you draw that many; when attacking, it takes them back", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Coveted Falcon"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = castDisguisedThenFlip(s, "Coveted Falcon", pickIf([bear]));
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.players.p1?.hand).toHaveLength(1);
      const falcon = idOf(s, "p1", "battlefield", "Coveted Falcon");
      const n = s.turn.number;
      s = advanceUntil(s, (x) => x.turn.number > n && x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: falcon, defender: "p2" }] });
      s = settle(s, pickIf([bear]));
      expect(s.objects[bear]?.controller).toBe("p1");
    });

    it("when attacking: the target is a permanent you own but don't control, not another opponent's", () => {
      const s = scenario({
        players: 3,
        p1: { battlefield: ["Coveted Falcon", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
        p3: { battlefield: ["Serra Angel"] },
      });
      const falcon = idOf(s, "p1", "battlefield", "Coveted Falcon");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p3", "battlefield", "Serra Angel");
      steal(s, bear, "p3");
      steal(s, angel, "p2");
      const ab = s.defs[s.objects[falcon]?.defId ?? ""]?.abilities.find(
        (a) => a.kind === "triggered" && a.trigger.on === "attacks",
      );
      const spec = ab?.kind === "triggered" ? ab.targets?.[0] : undefined;
      if (!spec) throw new Error("attack ability not found");
      expect(isLegalTarget(s, "p1", spec, bear, falcon)).toBe(true);
      // p3's Serra Angel controlled by p2: neither yours, nor controlled by its owner.
      expect(isLegalTarget(s, "p1", spec, angel, falcon)).toBe(false);
    });
  });

  describe("Crimestopper Sprite", () => {
    it("taps a creature when it enters; a stun counter if evidence was collected", () => {
      const run = (kicked: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Crimestopper Sprite"], graveyard: ["Pelakka Wurm"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Crimestopper Sprite", undefined, { kicked }), pickIf([bear]));
        return { s, bear };
      };
      const plain = run(false);
      expect(plain.s.objects[plain.bear]?.tapped).toBe(true);
      expect(plain.s.objects[plain.bear]?.counters.stun ?? 0).toBe(0);
      const kicked = run(true);
      expect(kicked.s.objects[kicked.bear]?.tapped).toBe(true);
      expect(kicked.s.objects[kicked.bear]?.counters.stun).toBe(1);
      expect(kicked.s.exile.some((id) => nameOf(kicked.s, id) === "Pelakka Wurm")).toBe(true);
    });
  });

  describe("Curious Inquiry", () => {
    it("+1/+1; combat damage to a player makes you investigate", () => {
      let s = scenario({ p1: { battlefield: ["Island", "Bear Cub"], hand: ["Curious Inquiry"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Curious Inquiry", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
      s = advanceUntil(attackWith(s, bear), (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(17);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Deduce", () => {
    it("draw a card and investigate", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Deduce"] } });
      s = settle(cast(s, "p1", "Deduce"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Dramatic Accusation", () => {
    it("taps the enchanted creature, which no longer untaps; {U}{U}: shuffled into its owner's library", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Dramatic Accusation"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dramatic Accusation", { enchant: [bear] }));
      expect(s.objects[bear]?.tapped).toBe(true);
      s = advanceUntil(
        s,
        (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority" && x.pending.player === "p1",
      );
      expect(s.objects[bear]?.tapped).toBe(true);
      const aura = idOf(s, "p1", "battlefield", "Dramatic Accusation");
      const library = s.players.p2?.library.length ?? 0;
      s = settle(activate(s, "p1", aura, "Shuffle"));
      expect(s.battlefield).not.toContain(bear);
      expect(s.players.p2?.library).toHaveLength(library + 1);
      expect(s.players.p2?.library.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Dramatic Accusation")).toHaveLength(1);
    });
  });

  describe("Eliminate the Impossible", () => {
    it("investigate; opposing creatures get -2/-0 and are no longer suspected", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Eliminate the Impossible"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const o = s.objects[theirs];
      if (o) o.suspected = 1;
      s = settle(cast(s, "p1", "Eliminate the Impossible"));
      expect(clues(s, "p1")).toBe(1);
      expect(chars(s, theirs).power).toBe(0);
      expect(chars(s, idOf(s, "p2", "battlefield", "Fire Elemental")).power).toBe(3);
      expect(chars(s, mine).power).toBe(2);
      expect(s.objects[theirs]?.suspected).toBeFalsy();
      expect(chars(s, theirs).keywords).not.toContain("menace");
    });
  });

  describe("Exit Specialist", () => {
    it("can't be blocked by creatures with power 3 or more", () => {
      const s = scenario({ p1: { battlefield: ["Exit Specialist"] }, p2: { battlefield: ["Fire Elemental", "Bear Cub"] } });
      const spec = idOf(s, "p1", "battlefield", "Exit Specialist");
      const c = attackWith(s, spec);
      expect(canBlock(c, idOf(s, "p2", "battlefield", "Fire Elemental"), spec)).toBe(false);
      expect(canBlock(c, idOf(s, "p2", "battlefield", "Bear Cub"), spec)).toBe(true);
    });

    it("turned face up: returns another creature to its owner's hand", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Exit Specialist"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = castDisguisedThenFlip(s, "Exit Specialist", pickIf([bear]));
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Exit Specialist")).toHaveLength(1);
    });
  });

  describe("Fae Flight", () => {
    it("+1/+0 and flying; hexproof until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Fae Flight"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Fae Flight", { enchant: [bear] }));
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 2 });
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "hexproof"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).toContain("flying");
      expect(chars(s, bear).keywords).not.toContain("hexproof");
    });
  });

  describe("Forensic Gadgeteer", () => {
    it("an artifact spell makes you investigate; your artifacts' abilities cost {1} less", () => {
      let s = scenario({ p1: { battlefield: ["Forensic Gadgeteer", ...lands("Island", 2)], hand: ["Candlestick"] } });
      s = settle(cast(s, "p1", "Candlestick"));
      expect(clues(s, "p1")).toBe(1);
      // The Clue costs {1} instead of {2}: a single Island is enough.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Clue"), "Draw a card"));
      expect(clues(s, "p1")).toBe(0);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
    });
  });

  describe("Furtive Courier", () => {
    it("unblockable if you sacrificed an artifact this turn; when attacking, draw then discard", () => {
      let s = scenario({ p1: { battlefield: ["Furtive Courier", "Candlestick", ...lands("Island", 2)], hand: ["Forest"] } });
      const courier = idOf(s, "p1", "battlefield", "Furtive Courier");
      expect(chars(s, courier).keywords).not.toContain("unblockable");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Candlestick"), "Draw a card"));
      expect(chars(s, courier).keywords).toContain("unblockable");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(attackWith(s, courier));
      expect(s.players.p1?.hand).toHaveLength(hand);
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });
  });

  describe("Hotshot Investigators", () => {
    it("returns one of your creatures: investigate; an opposing creature: no Clue", () => {
      const run = (owner: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 6), ...(owner === "p1" ? ["Bear Cub"] : [])], hand: ["Hotshot Investigators"] },
          p2: { battlefield: owner === "p2" ? ["Bear Cub"] : [] },
        });
        const bear = idOf(s, owner, "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Hotshot Investigators"), pickIf([bear]));
        expect(idsOf(s, owner, "hand", "Bear Cub")).toHaveLength(1);
        return clues(s, "p1");
      };
      expect(run("p1")).toBe(1);
      expect(run("p2")).toBe(0);
    });
  });

  describe("Jaded Analyst", () => {
    it("on your second card drawn this turn, loses defender and gains vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Jaded Analyst", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const analyst = idOf(s, "p1", "battlefield", "Jaded Analyst");
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, analyst).keywords).toContain("defender");
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, analyst).keywords).not.toContain("defender");
      expect(chars(s, analyst).keywords).toContain("vigilance");
    });
  });

  describe("Living Conundrum", () => {
    it("empty library: 10/10 with flying and vigilance, and the draw is skipped", () => {
      let s = scenario({ p1: { battlefield: ["Living Conundrum", "Island"], hand: ["Opt"], library: [] } });
      const id = idOf(s, "p1", "battlefield", "Living Conundrum");
      expect(chars(s, id)).toMatchObject({ power: 10, toughness: 10 });
      expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["hexproof", "flying", "vigilance"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.drewFromEmptyLibrary).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.lost).toBeFalsy();
    });

    it("with cards in the library: 2/5 without flying", () => {
      const s = scenario({ p1: { battlefield: ["Living Conundrum"], library: ["Forest"] } });
      const id = idOf(s, "p1", "battlefield", "Living Conundrum");
      expect(chars(s, id)).toMatchObject({ power: 2, toughness: 5 });
      expect(chars(s, id).keywords).not.toContain("flying");
    });
  });

  describe("Lost in the Maze", () => {
    it("taps X creatures, stuns the opponents' ones; your tapped creatures have hexproof", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Bear Cub"], hand: ["Lost in the Maze"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Lost in the Maze", undefined, { x: 2 }), pickIf([mine, theirs]));
      expect(s.objects[mine]?.tapped).toBe(true);
      expect(s.objects[theirs]?.tapped).toBe(true);
      expect(s.objects[elemental]?.tapped).toBe(false);
      expect(s.objects[mine]?.counters.stun ?? 0).toBe(0);
      expect(s.objects[theirs]?.counters.stun).toBe(1);
      expect(chars(s, mine).keywords).toContain("hexproof");
      expect(chars(s, theirs).keywords).not.toContain("hexproof");
    });
  });

  describe("Mistway Spy", () => {
    it("turned face up: this turn, your creatures that deal combat damage to a player make you investigate", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub", "Llanowar Elves"], hand: ["Mistway Spy"] } });
      s = castDisguisedThenFlip(s, "Mistway Spy");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = advanceUntil(attackWith(s, bear, elves), (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(17);
      expect(clues(s, "p1")).toBe(2);
    });
  });

  describe("Out Cold", () => {
    it("can't be countered; taps and stuns up to two creatures, then investigate", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Out Cold"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental", "Plains", "Island"], hand: ["No More Lies"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = cast(s, "p1", "Out Cold", { t: [bear, elemental] });
      const outCold = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "No More Lies", { t: [outCold] }));
      expect(s.objects[bear]?.counters.stun).toBe(1);
      expect(s.objects[elemental]?.counters.stun).toBe(1);
      expect(s.objects[bear]?.tapped && s.objects[elemental]?.tapped).toBe(true);
      expect(clues(s, "p1")).toBe(1);
    });
  });

  describe("Proft's Eidetic Memory", () => {
    it("draws when it enters; in combat, X +1/+1 counters where X is the number of cards drawn minus one", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Proft's Eidetic Memory", "Opt"] },
      });
      s = settle(cast(s, "p1", "Proft's Eidetic Memory"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Opt"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      // Two cards drawn this turn: one counter.
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("a single card drawn: no counter; no maximum hand size", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Proft's Eidetic Memory"] } });
      s = settle(cast(s, "p1", "Proft's Eidetic Memory"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      const t = scenario({ p1: { battlefield: ["Proft's Eidetic Memory"], hand: Array(9).fill("Forest") } });
      const end = advanceUntil(t, (x) => x.turn.active === "p2");
      expect(end.players.p1?.hand).toHaveLength(9);
    });
  });

  describe("Projektor Inspector", () => {
    it("itself or another Detective enters: you may draw, then discard", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Projektor Inspector", DETECTIVE_CARD], library: lands("Island", 5) },
      });
      const det = idOf(s, "p1", "hand", DETECTIVE_CARD.name);
      let asked = 0;
      const yes: Answer = (req) => {
        // Discard: never the Detective still in hand.
        if (req.type === "pick" && req.options.includes(det)) return req.options.filter((id) => id !== det).slice(0, 1);
        if (req.type !== "yesNo") return undefined;
        asked++;
        return [1];
      };
      s = settle(cast(s, "p1", "Projektor Inspector"), yes);
      expect(asked).toBe(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      s = settle(cast(s, "p1", DETECTIVE_CARD.name), yes);
      expect(asked).toBe(2);
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });

    it("a Detective turned face up also triggers", () => {
      let s = scenario({ p1: { battlefield: ["Projektor Inspector", ...lands("Island", 5)], hand: ["Exit Specialist"] } });
      let asked = 0;
      s = castDisguisedThenFlip(s, "Exit Specialist", (req) => {
        if (req.type !== "yesNo") return undefined;
        asked++;
        return [0];
      });
      expect(asked).toBe(1);
    });
  });

  describe("Reasonable Doubt", () => {
    it("counters a spell unless its controller pays {2}; suspects up to one creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 2), hand: ["Reasonable Doubt"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p1", "Lightning Strike", { t: ["p2"] });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Reasonable Doubt", { s: [strike], c: [bear] }));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(s.objects[bear]?.suspected).toBeTruthy();
    });
  });

  describe("Reenact the Crime", () => {
    it("exiles a card put into a graveyard this turn and casts its copy without paying", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Island", 4)], hand: ["Lightning Strike", "Reenact the Crime"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = untilCastNow(cast(s, "p1", "Reenact the Crime", { t: [strike] }));
      const copy = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: copy, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(14);
      expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    });

    it("a card already in the graveyard before this turn isn't a legal target", () => {
      const s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Reenact the Crime"], graveyard: ["Lightning Strike"] },
      });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const o = s.objects[strike];
      if (o) o.controlledSince = s.turn.number - 1;
      expect(() => cast(s, "p1", "Reenact the Crime", { t: [strike] })).toThrow();
    });
  });

  describe("Sudden Setback", () => {
    it("the permanent's owner puts it on top or on the bottom of their library", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Sudden Setback"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      let chooser = "";
      s = settle(cast(s, "p1", "Sudden Setback", { t: [bear] }), (req, player) => {
        if (req.intent !== "topOrBottom") return undefined;
        chooser = player;
        return ["top"];
      });
      expect(chooser).toBe("p2");
      expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Bear Cub");
    });
  });

  describe("Unauthorized Exit", () => {
    it("returns a nonland permanent to its owner's hand, then surveil 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Unauthorized Exit"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Unauthorized Exit", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — black", () => {
  /**
   * Murders at Karlov Manor, lot A: black cards, checked against their Oracle text (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id));

  /** Activated ability of the source whose label contains `label`. */
  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  /** Chooses the wanted target in the first request that offers it. */
  const pickIt =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;

  /**
   * Combat of the active player: advances to declare attackers, attacks the opponent with `attackers`, applies
   * the given blocks, then goes to the second main phase.
   */
  const fight = (
    s: S,
    attackers: string[],
    blocks: { blocker: string; attacker: string }[] = [],
    answer: Answer = () => undefined,
  ): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks });
      else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };

  describe("Agency Coroner", () => {
    const run = (suspected: boolean) => {
      const s0 = scenario({
        p1: { battlefield: ["Agency Coroner", "Bear Cub", ...lands("Swamp", 3)], library: lands("Swamp", 5) },
      });
      const bear = idOf(s0, "p1", "battlefield", "Bear Cub");
      const o = s0.objects[bear];
      if (o && suspected) o.suspected = 1;
      const coroner = idOf(s0, "p1", "battlefield", "Agency Coroner");
      const s = settle(activate(s0, "p1", coroner, "Draw a card", { sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      return s.players.p1?.hand.length;
    };
    it("sacrificing another creature: draw a card", () => expect(run(false)).toBe(1));
    it("if the sacrificed creature was suspected, draw two cards instead", () => expect(run(true)).toBe(2));
  });

  describe("Alley Assailant", () => {
    it("cast face up, enters tapped", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Alley Assailant"] } });
      s = settle(cast(s, "p1", "Alley Assailant"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Alley Assailant")]?.tapped).toBe(true);
    });

    it("disguised then turned face up: the opponent loses 3 life and you gain 3", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 9), hand: ["Alley Assailant"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Alley Assailant"), faceDown: true }));
      const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
      expect(chars(s, id).power).toBe(2);
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect(chars(s, id).name).toBe("Alley Assailant");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });
  });

  describe("Barbed Servitor", () => {
    it("enters suspected, indestructible; its damage makes an opponent lose that much life", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Barbed Servitor"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Barbed Servitor"));
      const servitor = idOf(s, "p1", "battlefield", "Barbed Servitor");
      expect(s.objects[servitor]?.suspected).toBeTruthy();
      expect(chars(s, servitor).keywords).toEqual(expect.arrayContaining(["indestructible", "menace", "cantBlock"]));
      s = act(s, "p1", { type: "pass" });
      s = settle(cast(s, "p2", "Lightning Strike", { t: [servitor] }));
      expect(s.battlefield).toContain(servitor);
      expect(s.players.p2?.life).toBe(17);
    });

    it("combat damage to a player: you draw a card and lose 1 life", () => {
      const s0 = scenario({ p1: { battlefield: ["Barbed Servitor"], library: lands("Swamp", 3) } });
      const s = fight(s0, [idOf(s0, "p1", "battlefield", "Barbed Servitor")]);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  it("Basilica Stalker: combat damage to a player, you gain 1 life and surveil 1", () => {
    const s0 = scenario({ p1: { battlefield: ["Basilica Stalker"], library: ["Opt", "Swamp"] } });
    const s = fight(s0, [idOf(s0, "p1", "battlefield", "Basilica Stalker")], [], (req) =>
      req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
    );
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.life).toBe(21);
    expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  describe("Case of the Gorgon's Kiss", () => {
    it("when it enters, destroys up to one creature that was dealt damage this turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Lightning Strike", "Case of the Gorgon's Kiss"],
        },
        p2: { battlefield: ["Fire Elemental", "Serra Angel"] },
      });
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [fire] }));
      expect(s.battlefield).toContain(fire);
      let options: string[] = [];
      s = settle(cast(s, "p1", "Case of the Gorgon's Kiss"), (req) => {
        if (req.type !== "pick" || !req.options.includes(fire)) return undefined;
        options = req.options.map(String);
        return [fire];
      });
      expect(options).not.toContain(angel);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    const solveWith = (bears: number) => {
      let s = scenario({
        p1: { battlefield: ["Case of the Gorgon's Kiss", ...lands("Swamp", 5)], hand: ["Deadly Cover-Up"] },
        p2: { battlefield: lands("Bear Cub", bears) },
      });
      s = settle(cast(s, "p1", "Deadly Cover-Up"));
      const id = idOf(s, "p1", "battlefield", "Case of the Gorgon's Kiss");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      return { s, id };
    };

    it("solved if three creature cards were put into the graveyard: 4/4 Gorgon, deathtouch, lifelink", () => {
      const { s, id } = solveWith(3);
      expect(s.objects[id]?.solved).toBe(true);
      const c = chars(s, id);
      expect(c.types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
      expect(c.subtypes).toContain("Gorgon");
      expect([c.power, c.toughness]).toEqual([4, 4]);
      expect(c.keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    });

    it("two creature cards aren't enough", () => {
      const { s, id } = solveWith(2);
      expect(s.objects[id]?.solved).toBeFalsy();
      expect(chars(s, id).types).not.toContain("Creature");
    });
  });

  describe("Case of the Stashed Skeleton", () => {
    it("creates a suspected 2/1 Skeleton; not solved as long as you control a suspected Skeleton", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Case of the Stashed Skeleton"] } });
      s = settle(cast(s, "p1", "Case of the Stashed Skeleton"));
      const skeleton = s.battlefield.find((id) => nameOf(s, id) === "Skeleton") as string;
      expect(s.objects[skeleton]?.suspected).toBeTruthy();
      expect([chars(s, skeleton).power, chars(s, skeleton).toughness]).toEqual([2, 1]);
      const id = idOf(s, "p1", "battlefield", "Case of the Stashed Skeleton");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.objects[id]?.solved).toBeFalsy();
    });

    it("solved with no suspected Skeleton: {1}{B}, sacrifice it, search for a card (at sorcery speed)", () => {
      let s = scenario({
        p1: { battlefield: ["Case of the Stashed Skeleton", ...lands("Swamp", 2)], library: ["Swamp", "Murder", "Swamp"] },
      });
      const id = idOf(s, "p1", "battlefield", "Case of the Stashed Skeleton");
      expect(activation(s, "p1", id, "Cherchez")).toBeUndefined();
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(s.objects[id]?.solved).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const murder = s.players.p1?.library.find((x) => nameOf(s, x) === "Murder") as string;
      s = settle(activate(s, "p1", id, "Search"), pickIt(murder));
      expect(names(s, s.players.p1?.hand)).toContain("Murder");
      expect(idsOf(s, "p1", "graveyard", "Case of the Stashed Skeleton")).toHaveLength(1);
    });
  });

  describe("Cerebral Confiscation", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Cerebral Confiscation"] },
        p2: { hand: ["Forest", "Opt", "Bear Cub"] },
      });

    it("first mode: the targeted opponent discards two cards", () => {
      let s = setup();
      s = settle(cast(s, "p1", "Cerebral Confiscation", { t: ["p2"] }, { mode: 0 }));
      if (s.pending?.kind === "discard") {
        const hand = s.players.p2?.hand ?? [];
        s = settle(act(s, "p2", { type: "discard", cards: hand.slice(0, 2) }));
      }
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("second mode: you choose a nonland card from their hand, which they discard", () => {
      const s0 = setup();
      let s = s0;
      const bear = idOf(s, "p2", "hand", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Cerebral Confiscation", { t: ["p2"] }, { mode: 1 }), (req, player) => {
        if (req.type !== "pick" || player !== "p1") return undefined;
        options = req.options.map(String);
        return [bear];
      });
      expect(names(s0, options).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Bear Cub"]);
      expect(s.players.p2?.hand).toHaveLength(2);
    });
  });

  it("Clandestine Meddler: suspects another creature; a suspected creature attacks, surveil 1", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Clandestine Meddler"], library: ["Opt", "Swamp"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Clandestine Meddler"), pickIt(bear));
    expect(s.objects[bear]?.suspected).toBeTruthy();
    expect(s.objects[idOf(s, "p1", "battlefield", "Clandestine Meddler")]?.suspected).toBeUndefined();
    let surveilled = false;
    s = fight(s, [bear], [], (req) => {
      if (req.intent !== "surveilGraveyard" || req.type !== "pick") return undefined;
      surveilled = true;
      return req.options;
    });
    expect(surveilled).toBe(true);
    expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  describe("Extract a Confession", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Extract a Confession"], graveyard: ["Fire Elemental", "Opt"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });

    it("without evidence: each opponent sacrifices the creature of their choice", () => {
      let s = setup();
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Extract a Confession"), (req, player) =>
        player === "p2" && req.type === "pick" && req.options.includes(elves) ? [elves] : undefined,
      );
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Llanowar Elves"]);
      expect(s.players.p1?.graveyard).toHaveLength(3);
    });

    it("evidence collected (6): they sacrifice their creature with the greatest power", () => {
      let s = setup();
      s = settle(cast(s, "p1", "Extract a Confession", undefined, { kicked: true }));
      expect(names(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Extract a Confession"]);
    });
  });

  it("Festerleech: +2/+2 only once per turn; combat damage, mill two cards", () => {
    let s = scenario({ p1: { battlefield: ["Festerleech", ...lands("Swamp", 4)], library: lands("Swamp", 4) } });
    const leech = idOf(s, "p1", "battlefield", "Festerleech");
    s = settle(activate(s, "p1", leech, "+2/+2"));
    expect([chars(s, leech).power, chars(s, leech).toughness]).toEqual([3, 3]);
    expect(activation(s, "p1", leech, "+2/+2")).toBeUndefined();
    s = fight(s, [leech]);
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Homicide Investigator: one of your nontoken creatures dies, investigate, only once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Homicide Investigator", "Bear Cub", "Llanowar Elves", ...lands("Swamp", 6)],
        hand: ["Murder", "Murder"],
      },
    });
    const clues = (x: S) => x.battlefield.filter((id) => nameOf(x, id) === "Clue").length;
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(clues(s)).toBe(1);
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
    expect(clues(s)).toBe(1);
  });

  it("Hunted Bonebrute: the targeted opponent creates two 1/1 white Dogs; when it dies, each opponent loses 3 life", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Hunted Bonebrute", "Murder"] } });
    s = settle(cast(s, "p1", "Hunted Bonebrute"));
    const dogs = s.battlefield.filter((id) => nameOf(s, id) === "Dog");
    expect(dogs).toHaveLength(2);
    expect(dogs.every((id) => s.objects[id]?.controller === "p2" && chars(s, id).colors.join() === "W")).toBe(true);
    s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p1", "battlefield", "Hunted Bonebrute")] }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Illicit Masquerade: imposter counters; such a creature dies, exiled, and another returns from the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Swamp", 7)],
        hand: ["Illicit Masquerade", "Murder"],
        graveyard: ["Serra Angel"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Illicit Masquerade"));
    expect(s.objects[bear]?.counters.impostor).toBe(1);
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    // "another creature card": the dead creature's card isn't offered.
    const offered: string[] = [];
    s = settle(cast(s, "p1", "Murder", { t: [bear] }), (req, p, cur) => {
      if (req.type === "pick" && req.options.includes(angel))
        offered.push(...req.options.map((id) => nameOf(cur, String(id)) ?? ""));
      return pickIt(angel)(req, p, cur);
    });
    expect(offered).toEqual(["Serra Angel"]);
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // The returned Serra Angel has no imposter counter.
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters.impostor).toBeUndefined();
  });

  it("It Doesn't Add Up: the creature card returns to the battlefield, suspected", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["It Doesn't Add Up"], graveyard: ["Serra Angel"] } });
    s = settle(cast(s, "p1", "It Doesn't Add Up", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.suspected).toBeTruthy();
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
  });

  it("Lead Pipe: +2/+0; the equipped creature dies, each opponent loses 1 life; {2}, sacrifice: draw", () => {
    let s = scenario({
      p1: { battlefield: ["Lead Pipe", "Bear Cub", ...lands("Swamp", 7)], hand: ["Murder"], library: lands("Swamp", 3) },
    });
    const pipe = idOf(s, "p1", "battlefield", "Lead Pipe");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, pipe).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
    s = settle(activate(s, "p1", pipe, "Equip", { targets: { t: [bear] } }));
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 2]);
    s = settle(cast(s, "p1", "Murder", { t: [bear] }));
    expect(s.players.p2?.life).toBe(19);
    s = settle(activate(s, "p1", pipe, "Draw a card"));
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Lead Pipe")).toHaveLength(1);
  });

  it("Leering Onlooker: from the graveyard, exiled, two tapped 1/1 flying Bats", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), graveyard: ["Leering Onlooker"] } });
    const card = idOf(s, "p1", "graveyard", "Leering Onlooker");
    s = settle(activate(s, "p1", card, "Bats"));
    const bats = s.battlefield.filter((id) => nameOf(s, id) === "Bat");
    expect(bats).toHaveLength(2);
    expect(bats.every((id) => s.objects[id]?.tapped && chars(s, id).keywords.includes("flying"))).toBe(true);
    expect([chars(s, bats[0] as string).power, chars(s, bats[0] as string).toughness]).toEqual([1, 1]);
    expect(s.exile.some((id) => nameOf(s, id) === "Leering Onlooker")).toBe(true);
  });

  it("Long Goodbye: only a creature or planeswalker with mana value 3 or less", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Long Goodbye"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Long Goodbye", { t: [angel] })).toThrow();
    s = settle(cast(s, "p1", "Long Goodbye", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.defs[s.objects[idOf(s, "p1", "graveyard", "Long Goodbye")]?.defId ?? ""]?.rules?.cantBeCountered).toBe(true);
  });

  it("Macabre Reconstruction: {2} less if a creature card went to your graveyard this turn", () => {
    const plain = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Macabre Reconstruction"], graveyard: ["Serra Angel"] },
    });
    expect(() => cast(plain, "p1", "Macabre Reconstruction", { t: [idOf(plain, "p1", "graveyard", "Serra Angel")] })).toThrow();
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Mountain", 2), ...lands("Swamp", 2)],
        hand: ["Macabre Reconstruction", "Lightning Strike"],
        graveyard: ["Serra Angel"],
      },
    });
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    // Only two Swamps remain: {1}{B}.
    s = settle(cast(s, "p1", "Macabre Reconstruction", { t: [angel, bear] }));
    expect(names(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  describe("Massacre Girl, Known Killer", () => {
    it("your creatures have infect; an opposing creature dies with toughness less than 1: draw", () => {
      const s0 = scenario({
        p1: { battlefield: ["Massacre Girl, Known Killer", "Bear Cub"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s0, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s0, "p2", "battlefield", "Bear Cub");
      expect(chars(s0, mine).keywords).toContain("wither");
      expect(chars(s0, theirs).keywords).not.toContain("wither");
      const s = fight(s0, [mine], [{ blocker: theirs, attacker: mine }]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("an opposing creature destroyed with its toughness intact draws nothing", () => {
      let s = scenario({
        p1: { battlefield: ["Massacre Girl, Known Killer", ...lands("Swamp", 3)], hand: ["Murder"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Murder", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("Outrageous Robbery: the opponent exiles X cards; you may play them with mana of any type", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Outrageous Robbery"] },
      p2: { library: ["Opt", "Forest", "Island"] },
    });
    s = settle(cast(s, "p1", "Outrageous Robbery", { t: ["p2"] }, { x: 2 }));
    expect(names(s, s.exile).sort()).toEqual(["Forest", "Opt"]);
    const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    const actions = legalActions(s, "p1");
    expect(actions.some((a) => a.type === "cast" && a.card === opt)).toBe(true);
    expect(actions.some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Persuasive Interrogators: investigate; you sacrifice a Clue, the opponent gets two poison counters", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Persuasive Interrogators"] } });
    s = settle(cast(s, "p1", "Persuasive Interrogators"));
    const clue = s.battlefield.find((id) => nameOf(s, id) === "Clue") as string;
    expect(clue).toBeDefined();
    s = settle(activate(s, "p1", clue, ""));
    expect(s.players.p2?.counters?.poison).toBe(2);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Presumed Dead: +2/+0; when it dies this turn, it returns under its owner's control, suspected", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Presumed Dead", "Murder"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Presumed Dead", { t: [bear] }));
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 2]);
    s = settle(cast(s, "p1", "Murder", { t: [bear] }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(bear);
    expect(s.objects[back]?.suspected).toBeTruthy();
    expect(chars(s, back).power).toBe(2);
  });

  it("Repeat Offender: the first activation suspects it, the next gives it a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Repeat Offender", ...lands("Swamp", 6)] } });
    const id = idOf(s, "p1", "battlefield", "Repeat Offender");
    s = settle(activate(s, "p1", id, "counter"));
    expect(s.objects[id]?.suspected).toBeTruthy();
    expect(s.objects[id]?.counters["+1/+1"]).toBeUndefined();
    s = settle(activate(s, "p1", id, "counter"));
    expect(s.objects[id]?.suspected).toBeTruthy();
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Rot Farm Mortipede and Soul Enervation: a creature card leaves your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Rot Farm Mortipede", "Soul Enervation", ...lands("Swamp", 5)],
        hand: ["It Doesn't Add Up"],
        graveyard: ["Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "It Doesn't Add Up", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
    const pede = idOf(s, "p1", "battlefield", "Rot Farm Mortipede");
    expect(chars(s, pede).power).toBe(4);
    expect(chars(s, pede).keywords).toEqual(expect.arrayContaining(["menace", "lifelink"]));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
  });

  it("Soul Enervation: flash, the target creature gets -4/-4", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Angel"] },
      p2: { battlefield: lands("Swamp", 4), hand: ["Soul Enervation"] },
    });
    s = act(s, "p1", { type: "pass" });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p2", "Soul Enervation"), pickIt(angel));
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Slice from the Shadows: the target creature gets -X/-X", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Slice from the Shadows"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Slice from the Shadows", { t: [angel] }, { x: 3 });
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "pass" });
    expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
  });

  it("Slimy Dualleech: at the beginning of your combat, +1/+0 and deathtouch to a creature with power 2 or less", () => {
    let s = scenario({ p1: { battlefield: ["Slimy Dualleech", "Bear Cub", "Serra Angel"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    let options: string[] = [];
    s = act(s, "p1", { type: "pass" });
    s = settle(s, (req) => {
      if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
      options = req.options.map(String);
      return [bear];
    });
    expect(options).not.toContain(angel);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toContain("deathtouch");
  });

  it("Snarling Gorehound: another of your creatures with power 2 or less enters, surveil 1", () => {
    const run = (creature: string, mana: string[]) => {
      let s = scenario({ p1: { battlefield: ["Snarling Gorehound", ...mana], hand: [creature], library: ["Opt", "Swamp"] } });
      s = settle(cast(s, "p1", creature), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      return s.players.p1?.graveyard.length;
    };
    expect(run("Bear Cub", lands("Forest", 2))).toBe(1);
    expect(run("Serra Angel", lands("Plains", 5))).toBe(0);
  });

  it("Toxin Analysis: deathtouch and lifelink until end of turn, then investigate", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp"], hand: ["Toxin Analysis"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Toxin Analysis", { t: [bear] }));
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Clue")).toHaveLength(1);
  });

  describe("Undercity Eliminator", () => {
    it("you sacrifice an artifact or a creature: exile an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Undercity Eliminator"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Undercity Eliminator"), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) return [bear];
        if (req.type === "pick" && req.options.includes(angel)) return [angel];
        return undefined;
      });
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
    });

    it("without a sacrifice, nothing is exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Undercity Eliminator"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Undercity Eliminator"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  it("Unscrupulous Agent: the targeted opponent exiles a card from their hand", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Unscrupulous Agent"] }, p2: { hand: ["Opt", "Forest"] } });
    const opt = idOf(s, "p2", "hand", "Opt");
    s = settle(cast(s, "p1", "Unscrupulous Agent"), (req, player) =>
      player === "p2" && req.type === "pick" ? [opt] : undefined,
    );
    expect(names(s, s.players.p2?.hand)).toEqual(["Forest"]);
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
  });

  it("Nightdrinker Moroii: when it enters, you lose 3 life", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Nightdrinker Moroii"] } });
    s = settle(cast(s, "p1", "Nightdrinker Moroii"));
    expect(s.players.p1?.life).toBe(17);
  });
});

describe("Murders at Karlov Manor, lot A — red", () => {
  /**
   * Murders at Karlov Manor, lot A: red cards, checked against their Oracle text (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] = []) => ids.map((id) => nameOf(s, id));

  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  const pickIt =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);

  /** Declares the active player's attackers against p2, then resolves the attack triggers. */
  const attack = (s: S, attackers: string[], answer: Answer = () => undefined): S => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };

  /** Noncreature artifact with no abilities. */
  const TRINKET = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
  /** Test instant: 2 damage to any target. */
  const ZAP = customCard({
    name: "Test Shock",
    typeLine: "Instant",
    types: ["Instant"],
    spell: dsl.spell([dsl.target.any()], [dsl.fx.damage(2, dsl.ref.target())]),
  });
  /** p1's face-down permanent. */
  const faceDownOf = (s: S) => s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;

  describe("Anzrag's Rampage", () => {
    it("destroys the opposing artifacts, exiles X cards (X = artifacts put into the graveyard this turn), a creature returns with haste then to hand", () => {
      let s = scenario({
        p1: {
          battlefield: [TRINKET, ...lands("Mountain", 5)],
          hand: ["Anzrag's Rampage"],
          library: ["Forest", "Bear Cub", "Forest", "Forest"],
        },
        p2: { battlefield: [TRINKET, "Esoteric Duplicator"] },
      });
      s = settle(cast(s, "p1", "Anzrag's Rampage"), (req) => {
        if (req.type !== "pick") return undefined;
        const bear = req.options.find((id) => nameOf(s, String(id)) === "Bear Cub");
        return bear ? [bear] : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", TRINKET.name)).toHaveLength(1);
      expect(names(s, s.players.p2?.graveyard).sort()).toEqual([TRINKET.name, "Esoteric Duplicator"].sort());
      // Two artifacts put into the graveyard: two cards exiled; the Bear on the battlefield, the Forest in exile.
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toContain("haste");
      expect(names(s, s.exile)).toEqual(["Forest"]);
      expect(s.players.p1?.library).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Bolrac-Clan Basher", () => {
    it("double strike, trample and disguise read from the text", () => {
      const s = scenario({ p1: { battlefield: ["Bolrac-Clan Basher"] } });
      const id = idOf(s, "p1", "battlefield", "Bolrac-Clan Basher");
      expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
      expect(castOption(s.defs[s.objects[id]?.defId ?? ""], "faceDown")).toBeDefined();
    });
  });

  describe("Case of the Crimson Pulse", () => {
    it("when it enters: discard a card, then draw two; solved with no card in hand; solved: at upkeep, discard your hand and draw two cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Case of the Crimson Pulse", "Opt"], library: lands("Island", 10) },
      });
      s = settle(cast(s, "p1", "Case of the Crimson Pulse"));
      if (s.pending?.kind === "discard") s = settle(act(s, "p1", { type: "discard", cards: idsOf(s, "p1", "hand", "Opt") }));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(names(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Crimson Pulse");
      // Two cards in hand at the end step: not solved.
      let t = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((t.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
      // With no card in hand: solved, then at the next upkeep, hand discarded and two cards drawn.
      const o = s.players.p1;
      if (o) {
        for (const id of o.hand) {
          const card = s.objects[id];
          if (card) card.zone = "graveyard";
        }
        o.graveyard.push(...o.hand);
        o.hand = [];
      }
      t = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((t.objects[caseId] as { solved?: boolean }).solved).toBe(true);
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.stack.length > 0);
      // At upkeep, before the draw step: empty hand, nothing to discard, then two cards drawn.
      expect(t.players.p1?.hand).toHaveLength(0);
      const before = t.players.p1?.graveyard.length ?? 0;
      t = settle(t);
      expect(t.players.p1?.hand).toHaveLength(2);
      expect(t.players.p1?.graveyard.length).toBe(before);
    });
  });

  describe("Caught Red-Handed", () => {
    it("can't be countered; gains control, untaps, haste, and suspects the creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Caught Red-Handed"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(s.defs[s.objects[idOf(s, "p1", "hand", "Caught Red-Handed")]?.defId ?? ""]?.rules?.cantBeCountered).toBe(true);
      s = settle(cast(s, "p1", "Caught Red-Handed", { t: [bear] }));
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(s.objects[bear]?.suspected).toBeTruthy();
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["haste", "menace", "cantBlock"]));
      // Until end of turn only.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[bear]?.controller).toBe("p2");
    });
  });

  describe("The Chase Is On", () => {
    it("+3/+0 and first strike until end of turn, and investigate", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["The Chase Is On"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "The Chase Is On", { t: [bear] }));
      expect(chars(s, bear).power).toBe(5);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    });
  });

  describe("Concealed Weapon", () => {
    it("cast face down, turned up for {2}{R}: it attaches to a target creature you control, +3/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Concealed Weapon"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Concealed Weapon"), faceDown: true }));
      const id = faceDownOf(s);
      expect([chars(s, id).power, chars(s, id).toughness]).toEqual([2, 2]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", id, "Turn face up"), pickIt(bear));
      expect(chars(s, id).types).not.toContain("Creature");
      expect(s.objects[id]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(5);
      // Equip {1}{R}: read from the text.
      const labels = chars(s, id).abilities.map((a) => (a.kind === "activated" ? a.label : undefined));
      expect(labels).toContain(msg("Equip {cost}", { cost: "{1}{R}" }));
    });
  });

  describe("Connecting the Dots", () => {
    it("each attacker exiles the top card; {1}{R}, discard your hand, sacrifice: the exiled cards go to hand", () => {
      let s = scenario({
        p1: {
          battlefield: ["Connecting the Dots", "Bear Cub", "Llanowar Elves", ...lands("Mountain", 2)],
          hand: ["Opt"],
          library: ["Island", "Swamp", "Forest", "Forest"],
        },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")]);
      expect(names(s, s.exile).sort()).toEqual(["Island", "Swamp"]);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      const dots = idOf(s, "p1", "battlefield", "Connecting the Dots");
      s = settle(activate(s, "p1", dots, "Discard your hand"));
      if (s.pending?.kind === "discard") s = settle(act(s, "p1", { type: "discard", cards: [...(s.players.p1?.hand ?? [])] }));
      expect(names(s, s.players.p1?.hand).sort()).toEqual(["Island", "Swamp"]);
      expect(names(s, s.players.p1?.graveyard).sort()).toEqual(["Connecting the Dots", "Opt"]);
      expect(s.exile).toHaveLength(0);
    });
  });

  describe("Convenient Target", () => {
    it("when it enters, suspects the enchanted creature, which gets +1/+1; {2}{R}: returns from the graveyard to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Convenient Target"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Convenient Target", { enchant: [bear] }));
      expect(s.objects[bear]?.suspected).toBeTruthy();
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
      // In the graveyard: the ability returns it to hand.
      const aura = idOf(s, "p1", "battlefield", "Convenient Target");
      s.battlefield = s.battlefield.filter((x) => x !== aura);
      const o = s.objects[aura];
      if (o) {
        o.zone = "graveyard";
        o.attachedTo = undefined;
      }
      s.players.p1?.graveyard.push(aura);
      s = settle(activate(s, "p1", aura, "Return this card from your graveyard"));
      expect(idsOf(s, "p1", "hand", "Convenient Target")).toHaveLength(1);
    });
  });

  describe("Cornered Crook", () => {
    it("when it enters, you may sacrifice an artifact: 3 damage to any target", () => {
      const setup = () => scenario({ p1: { battlefield: [TRINKET, ...lands("Mountain", 5)], hand: ["Cornered Crook"] } });
      let s = setup();
      const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
      s = settle(cast(s, "p1", "Cornered Crook"), (req) => {
        if (req.type === "pick" && req.options.includes(trinket)) return [trinket];
        if (req.type === "pick" && req.options.includes("p2")) return ["p2"];
        return undefined;
      });
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "graveyard", TRINKET.name)).toHaveLength(1);
      // Without a sacrifice, no damage.
      let t = setup();
      t = settle(cast(t, "p1", "Cornered Crook"), (req) => (req.type === "pick" && req.min === 0 ? [] : undefined));
      expect(t.players.p2?.life).toBe(20);
      expect(idsOf(t, "p1", "battlefield", TRINKET.name)).toHaveLength(1);
    });
  });

  describe("Crime Novelist", () => {
    it("whenever you sacrifice an artifact: a +1/+1 counter and {R}", () => {
      let s = scenario({
        p1: { battlefield: ["Crime Novelist", "Esoteric Duplicator", ...lands("Island", 2)], library: lands("Swamp", 3) },
      });
      const novelist = idOf(s, "p1", "battlefield", "Crime Novelist");
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 });
      s = settle(s, no);
      expect(s.objects[novelist]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });
  });

  describe("Expedited Inheritance", () => {
    it("a damaged creature: its controller may exile that many cards from the top, playable until the end of their next turn", () => {
      let s = scenario({
        p1: { battlefield: ["Expedited Inheritance", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Fire Elemental"], library: ["Bear Cub", "Forest", "Opt", "Island"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      let asked = "";
      s = settle(cast(s, "p1", "Lightning Strike", { t: [elemental] }), (req, player) => {
        if (req.type !== "yesNo") return undefined;
        asked = player;
        return [1];
      });
      expect(asked).toBe("p2");
      expect(names(s, s.exile).sort()).toEqual(["Bear Cub", "Forest", "Opt"]);
      const perms = (s.playPermissions ?? []).filter((p) => s.exile.includes(p.card));
      expect(perms).toHaveLength(3);
      expect(perms.every((p) => p.player === "p2" && p.until > s.turn.number)).toBe(true);
    });

    it("the player may decline", () => {
      let s = scenario({
        p1: { battlefield: ["Expedited Inheritance", ...lands("Mountain", 2), "Bear Cub"], hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [bear] }), no);
      expect(s.exile).toHaveLength(0);
    });

    it("a stolen creature killed by the damage: its last controller, not its owner, may exile", () => {
      let s = scenario({
        p1: {
          battlefield: ["Expedited Inheritance", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          library: ["Opt", "Island", "Forest"],
        },
        p2: { battlefield: ["Bear Cub"], library: ["Forest", "Forest", "Forest"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      steal(s, bear, "p1");
      let asked = "";
      s = settle(cast(s, "p1", "Lightning Strike", { t: [bear] }), (req, player) => {
        if (req.type !== "yesNo") return undefined;
        asked = player;
        return [1];
      });
      expect(asked).toBe("p1");
      expect(names(s, s.exile).sort()).toEqual(["Forest", "Island", "Opt"]);
      expect(s.players.p2?.library).toHaveLength(3);
    });
  });

  describe("Felonious Rage", () => {
    it("+2/+0 and haste; when that creature dies this turn, create a 2/2 Detective", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Bear Cub", "Llanowar Elves"],
          hand: ["Felonious Rage", "Lightning Strike", ZAP],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Felonious Rage", { t: [bear] }));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("haste");
      // Another creature that dies triggers nothing.
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(0);
      // The Bear dies: the Detective enters.
      s = settle(cast(s, "p1", ZAP.name, { t: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const det = idOf(s, "p1", "battlefield", "Detective");
      expect([chars(s, det).power, chars(s, det).toughness, chars(s, det).colors]).toEqual([2, 2, ["W", "U"]]);
    });
  });

  describe("Frantic Scapegoat", () => {
    it("when it enters, it suspects itself; when another creature enters, it may pass the suspect designation to it", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", ...lands("Forest", 2)], hand: ["Frantic Scapegoat", "Bear Cub"] } });
      s = settle(cast(s, "p1", "Frantic Scapegoat"));
      const goat = idOf(s, "p1", "battlefield", "Frantic Scapegoat");
      expect(s.objects[goat]?.suspected).toBeTruthy();
      expect(chars(s, goat).keywords).toEqual(expect.arrayContaining(["haste", "menace", "cantBlock"]));
      s = settle(cast(s, "p1", "Bear Cub"), yes);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.suspected).toBeTruthy();
      expect(s.objects[goat]?.suspected).toBeFalsy();
    });

    it("if it isn't suspected, nothing happens; you may also decline", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Frantic Scapegoat"], hand: ["Bear Cub", "Llanowar Elves"] },
      });
      const goat = idOf(s, "p1", "battlefield", "Frantic Scapegoat");
      let asked = false;
      s = settle(cast(s, "p1", "Bear Cub"), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      const o = s.objects[goat];
      if (o) o.suspected = 1;
      s = settle(cast(s, "p1", "Llanowar Elves"), no);
      expect(s.objects[goat]?.suspected).toBeTruthy();
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.suspected).toBeFalsy();
    });
  });

  describe("Galvanize", () => {
    it("3 damage, or 5 if you drew at least two cards this turn", () => {
      const run = (drawn: number) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Galvanize"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        for (let i = 0; i < drawn; i++) s.turnLog.push({ e: "draw", player: "p1" });
        const el = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(cast(s, "p1", "Galvanize", { t: [el] }));
        return s.objects[el]?.zone === "battlefield" ? s.objects[el]?.damage : "mort";
      };
      expect(run(1)).toBe(3);
      expect(run(2)).toBe("mort");
    });
  });

  describe("Gearbane Orangutan", () => {
    it("mode 1: destroys up to one target artifact", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Gearbane Orangutan"] },
        p2: { battlefield: [TRINKET] },
      });
      const trinket = idOf(s, "p2", "battlefield", TRINKET.name);
      s = settle(cast(s, "p1", "Gearbane Orangutan"), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.type === "pick" && req.options.includes(trinket) ? [trinket] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", TRINKET.name)).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Gearbane Orangutan")).keywords).toContain("reach");
    });

    it("mode 2: sacrifice an artifact; if you do, two +1/+1 counters", () => {
      const run = (withArtifact: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 3), ...(withArtifact ? [TRINKET] : [])], hand: ["Gearbane Orangutan"] },
        });
        s = settle(cast(s, "p1", "Gearbane Orangutan"), (req) => (req.intent === "triggerMode" ? ["1"] : undefined));
        return s.objects[idOf(s, "p1", "battlefield", "Gearbane Orangutan")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(true)).toBe(2);
      expect(run(false)).toBe(0);
    });
  });

  describe("Harried Dronesmith", () => {
    it("at the beginning of combat: a 1/1 flying Thopter with haste, sacrificed at the beginning of your end step", () => {
      let s = scenario({ p1: { battlefield: ["Harried Dronesmith"] } });
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
      s = settle(s);
      const thopter = idOf(s, "p1", "battlefield", "Thopter");
      expect(chars(s, thopter)).toMatchObject({ power: 1, toughness: 1, colors: [] });
      expect(chars(s, thopter).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, thopter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(0);
    });
  });

  describe("Innocent Bystander", () => {
    it("when it's dealt 3 or more damage, investigate; not for 2", () => {
      const run = (spell: string | typeof ZAP) => {
        const name = typeof spell === "string" ? spell : spell.name;
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Innocent Bystander"], hand: [spell] } });
        s = settle(cast(s, "p1", name, { t: [idOf(s, "p1", "battlefield", "Innocent Bystander")] }));
        expect(idsOf(s, "p1", "graveyard", "Innocent Bystander")).toHaveLength(1);
        return idsOf(s, "p1", "battlefield", "Clue").length;
      };
      expect(run("Lightning Strike")).toBe(1);
      expect(run(ZAP)).toBe(0);
    });
  });

  describe("Knife", () => {
    it("during your turn, the equipped creature gets +1/+0 and first strike; {2}, sacrifice: draw", () => {
      let s = scenario({ p1: { battlefield: ["Knife", "Bear Cub", ...lands("Mountain", 4)], library: lands("Island", 3) } });
      const knife = idOf(s, "p1", "battlefield", "Knife");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, knife).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", knife, "Equip", { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(3);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      const theirs = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(theirs, bear).power).toBe(2);
      expect(chars(theirs, bear).keywords).not.toContain("firstStrike");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", knife, "Draw a card"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(idsOf(s, "p1", "graveyard", "Knife")).toHaveLength(1);
    });
  });

  describe("Krenko, Baron of Tin Street", () => {
    it("{T}, sacrifice an artifact: a +1/+1 counter on each Goblin you control; the artifact in the graveyard: pay {R} for a Goblin with haste", () => {
      let s = scenario({
        p1: { battlefield: ["Krenko, Baron of Tin Street", TRINKET, "Mountain", "Bear Cub"] },
        p2: { battlefield: ["Krenko, Baron of Tin Street"] },
      });
      const krenko = idOf(s, "p1", "battlefield", "Krenko, Baron of Tin Street");
      const theirs = idOf(s, "p2", "battlefield", "Krenko, Baron of Tin Street");
      s = settle(activate(s, "p1", krenko, "counter"), (req, player) =>
        req.type === "yesNo" ? [player === "p1" ? 1 : 0] : undefined,
      );
      expect(s.objects[krenko]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[theirs]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      // Both Krenkos trigger; only p1 pays {R}.
      const goblins = idsOf(s, "p1", "battlefield", "Goblin");
      expect(goblins).toHaveLength(1);
      expect(chars(s, goblins[0] as string).keywords).toContain("haste");
      expect(idsOf(s, "p2", "battlefield", "Goblin")).toHaveLength(0);
    });
  });

  describe("Krenko's Buzzcrusher", () => {
    it("destroys up to one nonbasic land per player; its controller may search for a basic land, entering tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Krenko's Buzzcrusher"] },
        p2: { battlefield: ["Thundering Falls"], library: ["Island", "Opt"] },
      });
      const falls = idOf(s, "p2", "battlefield", "Thundering Falls");
      s = settle(cast(s, "p1", "Krenko's Buzzcrusher"), (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(falls)) return [falls];
        const island = req.options.find((id) => nameOf(s, String(id)) === "Island");
        return island ? [island] : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Thundering Falls")).toHaveLength(1);
      const island = idOf(s, "p2", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Krenko's Buzzcrusher")).keywords).toEqual(
        expect.arrayContaining(["flying", "trample"]),
      );
    });

    it("a stolen land destroyed: its controller searches, not its owner", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Krenko's Buzzcrusher"], library: ["Mountain", "Opt"] },
        p2: { battlefield: ["Thundering Falls"], library: ["Island", "Opt"] },
      });
      const falls = idOf(s, "p2", "battlefield", "Thundering Falls");
      steal(s, falls, "p1");
      s = settle(cast(s, "p1", "Krenko's Buzzcrusher"), (req) => {
        if (req.type !== "pick") return undefined;
        // The stolen land is now one of yours: "Yes", destroy one of your nonbasic lands.
        if (req.intent === "other") return ["1"];
        if (req.options.includes(falls)) return [falls];
        return req.options.filter((id) => nameOf(s, String(id)) === "Mountain").slice(0, 1);
      });
      expect(idsOf(s, "p2", "graveyard", "Thundering Falls")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(5);
      expect(idsOf(s, "p2", "battlefield", "Island")).toHaveLength(0);
    });
  });

  describe("Offender at Large", () => {
    it("when it enters face up: up to one target creature gets +2/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Offender at Large"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Offender at Large"), pickIt(bear));
      expect(chars(s, bear).power).toBe(4);
    });

    it("face down: nothing on entering; turned face up: +2/+0", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 8), "Bear Cub"], hand: ["Offender at Large"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Offender at Large"), faceDown: true }), pickIt(bear));
      expect(chars(s, bear).power).toBe(2);
      const id = faceDownOf(s);
      s = settle(activate(s, "p1", id, "Turn face up"), pickIt(bear));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, id).power).toBe(5);
    });
  });

  describe("Person of Interest", () => {
    it("when it enters, it suspects itself and creates a 2/2 Detective", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Person of Interest"] } });
      s = settle(cast(s, "p1", "Person of Interest"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Person of Interest")]?.suspected).toBeTruthy();
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(1);
    });
  });

  describe("Pyrotechnic Performer", () => {
    it("turned face up, it deals damage equal to its power to each opponent; likewise for another of your creatures", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Mountain", 9), "Pyrotechnic Performer"], hand: ["Pyrotechnic Performer"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyrotechnic Performer"), faceDown: true }));
      const id = faceDownOf(s);
      // Two Performers: the one turned up and the one already face up each trigger.
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 14, 14]);
    });

    it("another creature turned face up deals its damage", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 8), "Pyrotechnic Performer"], hand: ["Offender at Large"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Offender at Large"), faceDown: true }));
      s = settle(activate(s, "p1", faceDownOf(s), "Turn face up"));
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("Reckless Detective", () => {
    it("when attacking, sacrifice an artifact or discard a card: draw a card and +2/+0", () => {
      let s = scenario({ p1: { battlefield: ["Reckless Detective", TRINKET], library: lands("Island", 3) } });
      const det = idOf(s, "p1", "battlefield", "Reckless Detective");
      const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
      s = attack(s, [det], pickIt(trinket));
      expect(idsOf(s, "p1", "graveyard", TRINKET.name)).toHaveLength(1);
      expect(chars(s, det).power).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("without an artifact, by discarding a card; with nothing, no effect", () => {
      let s = scenario({ p1: { battlefield: ["Reckless Detective"], hand: ["Opt"], library: lands("Island", 3) } });
      const det = idOf(s, "p1", "battlefield", "Reckless Detective");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = attack(s, [det], pickIt(opt));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(chars(s, det).power).toBe(2);
      expect(names(s, s.players.p1?.hand)).toEqual(["Island"]);
      let t = scenario({ p1: { battlefield: ["Reckless Detective"], library: lands("Island", 3) } });
      const d2 = idOf(t, "p1", "battlefield", "Reckless Detective");
      t = attack(t, [d2]);
      expect(chars(t, d2).power).toBe(0);
      expect(t.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Red Herring", () => {
    it("haste, attacks each combat if able; {2}, sacrifice: draw", () => {
      let s = scenario({ p1: { battlefield: ["Red Herring", ...lands("Mountain", 2)], library: lands("Island", 3) } });
      const fish = idOf(s, "p1", "battlefield", "Red Herring");
      expect(chars(s, fish).keywords).toEqual(expect.arrayContaining(["haste", "mustAttack"]));
      expect(chars(s, fish).subtypes).toEqual(expect.arrayContaining(["Clue", "Fish"]));
      s = settle(activate(s, "p1", fish, "Draw a card"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Red Herring")).toHaveLength(1);
    });
  });

  describe("Rubblebelt Braggart", () => {
    it("when attacking, if it isn't suspected, you may suspect it", () => {
      let s = scenario({ p1: { battlefield: ["Rubblebelt Braggart"] } });
      const id = idOf(s, "p1", "battlefield", "Rubblebelt Braggart");
      const t = attack(s, [id], no);
      expect(t.objects[id]?.suspected).toBeFalsy();
      s = attack(s, [id], yes);
      expect(s.objects[id]?.suspected).toBeTruthy();
      expect(chars(s, id).keywords).toContain("menace");
    });
  });

  describe("Suspicious Detonation", () => {
    it("4 damage to a creature; costs {3} less if you sacrificed an artifact this turn; can't be countered", () => {
      let s = scenario({
        p1: {
          battlefield: ["Esoteric Duplicator", ...lands("Mountain", 4)],
          hand: ["Suspicious Detonation"],
          library: lands("Island", 3),
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const el = idOf(s, "p2", "battlefield", "Fire Elemental");
      const card = idOf(s, "p1", "hand", "Suspicious Detonation");
      expect(s.defs[s.objects[card]?.defId ?? ""]?.rules?.cantBeCountered).toBe(true);
      // Four lands: not enough for {4}{R}.
      expect(() => cast(s, "p1", "Suspicious Detonation", { t: [el] })).toThrow();
      const dup = idOf(s, "p1", "battlefield", "Esoteric Duplicator");
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === dup);
      s = settle(act(s, "p1", { type: "activate", source: dup, ability: a?.type === "activate" ? a.ability : -1 }), no);
      // Two remaining lands are enough for {1}{R}.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped)).toHaveLength(2);
      s = settle(cast(s, "p1", "Suspicious Detonation", { t: [el] }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Torch the Witness", () => {
    it("deals twice X damage; if there is excess damage, investigate", () => {
      const run = (x: number, target: string) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Torch the Witness"] },
          p2: { battlefield: [target] },
        });
        const t = idOf(s, "p2", "battlefield", target);
        s = settle(cast(s, "p1", "Torch the Witness", { t: [t] }, { x }));
        return { dead: idsOf(s, "p2", "graveyard", target).length, clues: idsOf(s, "p1", "battlefield", "Clue").length };
      };
      // Bear Cub 2/2: X = 1 → 2 damage, none excess; X = 2 → 4 damage, 2 excess.
      expect(run(1, "Bear Cub")).toEqual({ dead: 1, clues: 0 });
      expect(run(2, "Bear Cub")).toEqual({ dead: 1, clues: 1 });
      // Fire Elemental 5/4: X = 2 → 4 damage, lethal with no excess.
      expect(run(2, "Fire Elemental")).toEqual({ dead: 1, clues: 0 });
    });
  });
});

describe("Murders at Karlov Manor, lot A — green", () => {
  /**
   * Murders at Karlov Manor, lot A — green cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: readonly string[] = []) => ids.map((id) => nameOf(s, id)).sort();
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const onBattlefield = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name);

  /** Activates the ability of `source` whose label contains `label` (the first if absent). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`Ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, targets });
  };
  /** Chooses, in a "pick" request, the options whose name is given. */
  const pickNamed =
    (s: () => S, ...wanted: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const ids = req.options.filter((id) => wanted.includes(nameOf(s(), String(id)) ?? ""));
      return ids.length > 0 ? ids.slice(0, req.max) : undefined;
    };
  /** Casts the card face down for {3}, then turns it face up for its disguise cost. */
  const castDisguisedThenTurnUp = (s: S, name: string): { s: S; id: string } => {
    let cur = passBoth(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), faceDown: true }));
    const id = cur.battlefield.find((x) => cur.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(cur, id)).toMatchObject({ name: "", power: 2, toughness: 2 });
    cur = activate(cur, "p1", id, "Turn face up");
    expect(nameOf(cur, id)).toBe(name);
    return { s: cur, id };
  };

  describe("Aftermath Analyst", () => {
    it("when it enters, mill three cards; {3}{G}, sacrifice: the land cards in the graveyard return tapped", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 6),
          hand: ["Aftermath Analyst"],
          library: ["Island", "Opt", "Mountain", "Forest"],
          graveyard: ["Plains", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Aftermath Analyst"));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Bear Cub", "Island", "Mountain", "Opt", "Plains"]);
      const analyst = idOf(s, "p1", "battlefield", "Aftermath Analyst");
      s = settle(activate(s, "p1", analyst));
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Aftermath Analyst", "Bear Cub", "Opt"]);
      for (const land of ["Island", "Mountain", "Plains"]) {
        const id = idOf(s, "p1", "battlefield", land);
        expect(s.objects[id]?.tapped).toBe(true);
      }
    });
  });

  describe("Analyze the Pollen", () => {
    it("without evidence: only a basic land card", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Analyze the Pollen"], library: ["Bear Cub", "Forest"] } });
      s = settle(cast(s, "p1", "Analyze the Pollen"));
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
    });

    it("evidence 8 collected: a creature or land card, your choice", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest"],
          hand: ["Analyze the Pollen"],
          library: ["Forest", "Bear Cub"],
          graveyard: ["Pelakka Wurm", "Bear Cub"],
        },
      });
      s = settle(
        cast(s, "p1", "Analyze the Pollen", undefined, { kicked: true }),
        pickNamed(() => s, "Bear Cub"),
      );
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      // The evidence is exiled.
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Analyze the Pollen"]);
    });
  });

  describe("Archdruid's Charm", () => {
    it("mode 1: a land card found enters tapped; a creature card goes to hand", () => {
      const run = (wanted: string) => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Archdruid's Charm"], library: ["Island", "Bear Cub"] },
        });
        s = settle(
          cast(s, "p1", "Archdruid's Charm", undefined, { mode: 0 }),
          pickNamed(() => s, wanted),
        );
        return s;
      };
      const land = run("Island");
      const island = idOf(land, "p1", "battlefield", "Island");
      expect(land.objects[island]?.tapped).toBe(true);
      expect(land.players.p1?.hand).toHaveLength(0);
      const creature = run("Bear Cub");
      expect(names(creature, creature.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(onBattlefield(creature, "p1", "Bear Cub")).toHaveLength(0);
    });

    it("mode 2: a +1/+1 counter on your creature, which deals damage equal to its power", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Archdruid's Charm"] },
        p2: { battlefield: ["Pelakka Wurm"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Archdruid's Charm", { a: [bear], b: [wurm] }, { mode: 1 }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.objects[wurm]?.damage).toBe(3);
    });

    it("mode 3: exile an artifact or an enchantment", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Archdruid's Charm"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const dup = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      s = settle(cast(s, "p1", "Archdruid's Charm", { t: [dup] }, { mode: 2 }));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Esoteric Duplicator"]);
    });
  });

  describe("Audience with Trostani", () => {
    it("creates a 0/1 Plant, then draws a card for each different name among your creature tokens", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Audience with Trostani", "Audience with Trostani"] } });
      s = settle(cast(s, "p1", "Audience with Trostani"));
      const plants = onBattlefield(s, "p1", "Plant");
      expect(plants).toHaveLength(1);
      expect(pt(s, plants[0] as string)).toEqual([0, 1]);
      expect(s.players.p1?.hand).toHaveLength(2);
      // Two Plants: a single name, a single card.
      s = settle(cast(s, "p1", "Audience with Trostani"));
      expect(onBattlefield(s, "p1", "Plant")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("Bite Down on Crime", () => {
    it("costs {2} less if evidence was collected; +2/+0, then damage equal to its power", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Bite Down on Crime"], graveyard: ["Pelakka Wurm"] },
          p2: { battlefield: ["Pelakka Wurm"] },
        });
      let s = setup();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      expect(() => cast(s, "p1", "Bite Down on Crime", { a: [bear], b: [wurm] })).toThrow();
      s = settle(cast(s, "p1", "Bite Down on Crime", { a: [bear], b: [wurm] }, { kicked: true }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(s.objects[wurm]?.damage).toBe(4);
    });
  });

  describe("Case of the Locked Hothouse", () => {
    it("an additional land per turn", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Locked Hothouse"], hand: ["Forest", "Forest", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(() => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") })).toThrow();
    });

    it("solved with seven lands: lands and creature spells from the top of the library", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Case of the Locked Hothouse", ...lands("Forest", n)] } });
        const id = idOf(s, "p1", "battlefield", "Case of the Locked Hothouse");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return (s.objects[id] as { solved?: boolean }).solved ?? false;
      };
      expect(run(6)).toBe(false);
      expect(run(7)).toBe(true);
      let s = scenario({
        p1: { battlefield: ["Case of the Locked Hothouse", ...lands("Forest", 2)], library: ["Bear Cub", "Island"] },
      });
      const hothouse = s.objects[idOf(s, "p1", "battlefield", "Case of the Locked Hothouse")] as { solved?: boolean };
      hothouse.solved = true;
      bump(s);
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === top)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: top }));
      expect(onBattlefield(s, "p1", "Bear Cub")).toHaveLength(1);
      const island = s.players.p1?.library[0] as string;
      s = act(s, "p1", { type: "playLand", card: island });
      expect(onBattlefield(s, "p1", "Island")).toHaveLength(1);
    });
  });

  describe("Case of the Trampled Garden", () => {
    it("when it enters, two +1/+1 counters distributed; solved (total power 8), an attacker gets a counter and trample", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Pelakka Wurm"], hand: ["Case of the Trampled Garden"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Case of the Trampled Garden"), (req) =>
        req.type === "pick" && req.options.includes(wurm) ? [wurm] : undefined,
      );
      expect(s.objects[wurm]?.counters["+1/+1"]).toBe(2);
      const caseId = idOf(s, "p1", "battlefield", "Case of the Trampled Garden");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved).toBe(true);
      // On p1's next turn: attack with the Wurm.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wurm, defender: "p2" }] });
      s = settle(s);
      expect(s.objects[wurm]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, wurm).keywords).toContain("trample");
    });

    it("not solved if the total power of your creatures is less than 8", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Trampled Garden", "Bear Cub"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Trampled Garden");
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect((s.objects[caseId] as { solved?: boolean }).solved ?? false).toBe(false);
    });
  });

  describe("Chalk Outline", () => {
    it("a creature card leaves your graveyard: a 2/2 Detective and a Clue", () => {
      let s = scenario({
        p1: { battlefield: ["Chalk Outline", "Bear Cub", "Forest"], graveyard: ["Rubblebelt Maverick", "Opt"] },
      });
      const maverick = idOf(s, "p1", "graveyard", "Rubblebelt Maverick");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", maverick, undefined, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(onBattlefield(s, "p1", "Detective")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Flourishing Bloom-Kin", () => {
    it("+1/+1 per Forest; turned face up: one Forest enters tapped, the other goes to hand", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 6), "Island", "Island"],
          hand: ["Flourishing Bloom-Kin"],
          library: ["Forest", "Island", "Forest", "Bear Cub"],
        },
      });
      const r = castDisguisedThenTurnUp(s, "Flourishing Bloom-Kin");
      s = settle(r.s);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(7);
      const fresh = idsOf(s, "p1", "battlefield", "Forest").filter(
        (id) => s.objects[id]?.tapped && s.objects[id]?.controlledSince,
      );
      expect(fresh.length).toBeGreaterThan(0);
      expect(names(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(pt(s, r.id)).toEqual([7, 7]);
    });
  });

  describe("Get a Leg Up", () => {
    it("+1/+1 per creature you control, and reach", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub", "Bear Cub", "Llanowar Elves"], hand: ["Get a Leg Up"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Get a Leg Up", { t: [bear] }));
      expect(pt(s, bear)).toEqual([5, 5]);
      expect(chars(s, bear).keywords).toContain("reach");
    });
  });

  describe("Glint Weaver", () => {
    it("three +1/+1 counters distributed, then life equal to the greatest toughness among your creatures", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 7), "Bear Cub"], hand: ["Glint Weaver"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Glint Weaver"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, idOf(s, "p1", "battlefield", "Glint Weaver")).keywords).toContain("reach");
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Greenbelt Radical", () => {
    it("turned face up: a +1/+1 counter on each of your creatures, which gain trample", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 10), "Bear Cub"], hand: ["Greenbelt Radical"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const r = castDisguisedThenTurnUp(s, "Greenbelt Radical");
      s = settle(r.s);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(pt(s, r.id)).toEqual([5, 5]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, theirs)).toEqual([2, 2]);
    });
  });

  describe("Hard-Hitting Question", () => {
    it("your creature deals damage equal to its power to an opposing creature or planeswalker", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Pelakka Wurm"], hand: ["Hard-Hitting Question"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Hard-Hitting Question", { a: [wurm], b: [bear] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[wurm]?.damage).toBe(0);
    });
  });

  describe("Hide in Plain Sight", () => {
    it("looks at five cards, cloaks two of them (2/2 face down, ward {2}), the rest underneath", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Hide in Plain Sight"],
          library: ["Bear Cub", "Opt", "Pelakka Wurm", "Island", "Forest", "Mountain"],
        },
      });
      s = settle(
        cast(s, "p1", "Hide in Plain Sight"),
        pickNamed(() => s, "Bear Cub", "Pelakka Wurm"),
      );
      const down = s.battlefield.filter((id) => s.objects[id]?.defId === FACE_DOWN_ID);
      expect(down).toHaveLength(2);
      for (const id of down) {
        expect(chars(s, id)).toMatchObject({ power: 2, toughness: 2 });
        expect(chars(s, id).keywords).toContain("ward");
      }
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
      expect(names(s, s.players.p1?.library.slice(1))).toEqual(["Forest", "Island", "Opt"]);
    });
  });

  describe("Loxodon Eavesdropper", () => {
    it("when it enters, investigate; your second card drawn each turn gives it +1/+1 and vigilance", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 8), "Rope"], hand: ["Loxodon Eavesdropper"] } });
      s = settle(cast(s, "p1", "Loxodon Eavesdropper"));
      const elephant = idOf(s, "p1", "battlefield", "Loxodon Eavesdropper");
      const clue = idOf(s, "p1", "battlefield", "Clue");
      s = settle(activate(s, "p1", clue));
      expect(pt(s, elephant)).toEqual([3, 3]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Rope"), "Draw a card"));
      expect(pt(s, elephant)).toEqual([4, 4]);
      expect(chars(s, elephant).keywords).toContain("vigilance");
    });
  });

  describe("Nervous Gardener", () => {
    it("turned face up: searches for a land card with a basic land type", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Nervous Gardener"], library: ["Opt", "Thundering Falls"] },
      });
      const r = castDisguisedThenTurnUp(s, "Nervous Gardener");
      s = settle(r.s);
      expect(names(s, s.players.p1?.hand)).toEqual(["Thundering Falls"]);
    });
  });

  describe("Pick Your Poison", () => {
    it("each opponent sacrifices a creature with flying", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Forest"], hand: ["Pick Your Poison"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Pick Your Poison", undefined, { mode: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(onBattlefield(s, "p2", "Bear Cub")).toHaveLength(1);
      expect(onBattlefield(s, "p3", "Bear Cub")).toHaveLength(1);
    });

    it("each opponent sacrifices an artifact", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Rope"], hand: ["Pick Your Poison"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      s = settle(cast(s, "p1", "Pick Your Poison", undefined, { mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Rope")).toHaveLength(1);
    });
  });

  describe("Pompous Gadabout", () => {
    it("hexproof during your turn only", () => {
      const mine = scenario({ p1: { battlefield: ["Pompous Gadabout"] } });
      expect(chars(mine, idOf(mine, "p1", "battlefield", "Pompous Gadabout")).keywords).toContain("hexproof");
      const theirs = scenario({ active: "p2", p1: { battlefield: ["Pompous Gadabout"] } });
      expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Pompous Gadabout")).keywords).not.toContain("hexproof");
    });

    it("can't be blocked by a face-down creature (nameless)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Pompous Gadabout"] },
        p2: { battlefield: lands("Forest", 3), hand: ["Nervous Gardener"] },
      });
      s = passBoth(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Nervous Gardener"), faceDown: true }));
      const faceDown = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      const gadabout = idOf(s, "p1", "battlefield", "Pompous Gadabout");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: gadabout, defender: "p2" }] });
      expect(canBlock(s, faceDown, gadabout)).toBe(false);
    });
  });

  describe("The Pride of Hull Clade", () => {
    it("costs {X} less, X being the total toughness of your creatures", () => {
      const s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Pelakka Wurm"], hand: ["The Pride of Hull Clade"] } });
      // {10}{G} - 7 = {3}{G}: four lands short by one.
      expect(() => cast(s, "p1", "The Pride of Hull Clade")).toThrow();
      const t = scenario({ p1: { battlefield: [...lands("Forest", 4), "Pelakka Wurm"], hand: ["The Pride of Hull Clade"] } });
      const after = settle(cast(t, "p1", "The Pride of Hull Clade"));
      const pride = idOf(after, "p1", "battlefield", "The Pride of Hull Clade");
      expect(chars(after, pride).keywords).toContain("defender");
    });

    it("{2}{U}{U}: +1/+0, attacks despite defender, and draws as many as its toughness when damaging a player", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "The Pride of Hull Clade"], library: lands("Forest", 20) },
      });
      const pride = idOf(s, "p1", "battlefield", "The Pride of Hull Clade");
      s = settle(activate(s, "p1", pride, undefined, { t: [pride] }));
      expect(pt(s, pride)).toEqual([3, 15]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: pride, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "end" || (x.players.p2?.life ?? 20) < 20);
      s = settle(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.hand).toHaveLength(15);
    });
  });

  describe("Rope", () => {
    it("the equipped creature gets +1/+2, reach and can be blocked by only one creature; {2}, sacrifice: draw", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 5), "Rope", "Bear Cub"] } });
      const rope = idOf(s, "p1", "battlefield", "Rope");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, rope).subtypes).toEqual(expect.arrayContaining(["Clue", "Equipment"]));
      s = settle(activate(s, "p1", rope, "Equip", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 4]);
      expect(chars(s, bear).keywords).toContain("reach");
      expect(chars(s, bear).blockRules.some((r) => r.maxBlockers === 1)).toBe(true);
      s = settle(activate(s, "p1", rope, "Draw a card"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Rope")).toHaveLength(1);
    });
  });

  describe("Rubblebelt Maverick", () => {
    it("when it enters, surveil 2", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Rubblebelt Maverick"], library: ["Opt", "Island", "Forest"] } });
      s = settle(cast(s, "p1", "Rubblebelt Maverick"), (req) =>
        req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
      );
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Island", "Opt"]);
    });

    it("{G}, exile it from your graveyard: a +1/+1 counter, at sorcery speed only", () => {
      let s = scenario({ p1: { battlefield: ["Forest", "Bear Cub"], graveyard: ["Rubblebelt Maverick"] } });
      const maverick = idOf(s, "p1", "graveyard", "Rubblebelt Maverick");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", maverick, undefined, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Rubblebelt Maverick"]);
      const opp = scenario({ active: "p2", p1: { battlefield: ["Forest", "Bear Cub"], graveyard: ["Rubblebelt Maverick"] } });
      const card = idOf(opp, "p1", "graveyard", "Rubblebelt Maverick");
      const p1Turn = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(legalActions(p1Turn, "p1").some((a) => a.type === "activate" && a.source === card)).toBe(false);
    });
  });

  describe("Sharp-Eyed Rookie", () => {
    it("a creature with greater power or toughness enters: a +1/+1 counter and a Clue; otherwise nothing", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 9), "Sharp-Eyed Rookie"], hand: ["Llanowar Elves", "Pelakka Wurm"] },
      });
      const rookie = idOf(s, "p1", "battlefield", "Sharp-Eyed Rookie");
      expect(chars(s, rookie).keywords).toContain("vigilance");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[rookie]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(0);
      s = settle(cast(s, "p1", "Pelakka Wurm"));
      expect(s.objects[rookie]?.counters["+1/+1"]).toBe(1);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Slime Against Humanity", () => {
    it("a 0/0 Ooze with trample and 2 + X counters (Oozes and namesakes in the graveyard and in exile)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 3),
          hand: ["Slime Against Humanity"],
          graveyard: ["Slime Against Humanity", "Slime Against Humanity", "Bear Cub"],
        },
        p2: { graveyard: ["Slime Against Humanity"] },
      });
      s = settle(cast(s, "p1", "Slime Against Humanity"));
      const ooze = idOf(s, "p1", "battlefield", "Ooze");
      expect(s.objects[ooze]?.counters["+1/+1"]).toBe(4);
      expect(pt(s, ooze)).toEqual([4, 4]);
      expect(chars(s, ooze).keywords).toContain("trample");
    });
  });

  describe("They Went This Way", () => {
    it("a basic land card enters tapped, then investigate", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["They Went This Way"], library: ["Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "They Went This Way"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(onBattlefield(s, "p1", "Clue")).toHaveLength(1);
    });
  });

  describe("Undergrowth Recon", () => {
    it("at the beginning of your upkeep, a land card from your graveyard returns tapped", () => {
      let s = scenario({ p1: { battlefield: ["Undergrowth Recon"], graveyard: ["Island", "Bear Cub"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    });
  });

  describe("Vengeful Creeper", () => {
    it("turned face up: destroys an opposing artifact or enchantment", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 9), "Rope"], hand: ["Vengeful Creeper"] },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const r = castDisguisedThenTurnUp(s, "Vengeful Creeper");
      s = settle(r.s);
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(onBattlefield(s, "p1", "Rope")).toHaveLength(1);
      expect(pt(s, r.id)).toEqual([5, 5]);
    });
  });

  describe("Vitu-Ghazi Inspector", () => {
    it("evidence 6 collected: a +1/+1 counter on a target creature and 2 life; otherwise nothing", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub"],
          hand: ["Vitu-Ghazi Inspector", "Vitu-Ghazi Inspector"],
          graveyard: ["Pelakka Wurm"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Vitu-Ghazi Inspector"));
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Vitu-Ghazi Inspector", undefined, { kicked: true }), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });
  });
});

describe("Murders at Karlov Manor, lot A — multicolor", () => {
  /**
   * Murders at Karlov Manor, lot A — multicolor cards: each card is checked against its Oracle text (plan R, lot R7).
   */
  type S = GameState;
  const names = (s: S, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
  const exiled = (s: S, name: string) => s.exile.some((id) => nameOf(s, id) === name);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const cast = (s: S, player: string, name: string, extra: Partial<Extract<Decision, { type: "cast" }>> = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Activates the ability of the source whose label contains `label` (the first otherwise). */
  const activate = (s: S, player: string, source: string, label = "", extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string, label = "") =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
  /** Chooses this option in a "pick" choice that offers it. */
  const pick =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.some((id) => req.options.includes(id))
        ? ids.filter((id) => req.options.includes(id))
        : undefined;
  /** Attacks with these creatures (p1 against p2), then resolves the triggers. */
  const attack = (s: S, ids: string[], answer?: Answer) => {
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return c.stack.length > 0 || c.triggers.length > 0 || c.pending?.kind === "choice" ? settle(c, answer) : c;
  };
  /** Casts the card face down for {3} and resolves it; returns the state and the id of the face-down permanent. */
  const castFaceDown = (s: S, name: string): [S, string] => {
    const t = settle(cast(s, "p1", name, { faceDown: true }));
    return [t, t.battlefield.find((x) => t.objects[x]?.defId === FACE_DOWN_ID) as string];
  };
  const clues = (s: S, player = "p1") => idsOf(s, player, "battlefield", "Clue");

  describe("Agrus Kos, Spirit of Justice", () => {
    it("when it enters, suspects the target creature; when attacking, exiles the already suspected creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), ...lands("Mountain", 2)], hand: ["Agrus Kos, Spirit of Justice"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Agrus Kos, Spirit of Justice"), pick(bear));
      expect(s.objects[bear]?.suspected).toBeTruthy();
      expect(s.battlefield).toContain(bear);

      let t = scenario({ p1: { battlefield: ["Agrus Kos, Spirit of Justice"] }, p2: { battlefield: ["Bear Cub"] } });
      const theirs = idOf(t, "p2", "battlefield", "Bear Cub");
      const o = t.objects[theirs];
      if (o) o.suspected = 1;
      t = attack(t, [idOf(t, "p1", "battlefield", "Agrus Kos, Spirit of Justice")], pick(theirs));
      expect(exiled(t, "Bear Cub")).toBe(true);
    });
  });

  describe("Alquist Proft, Master Sleuth", () => {
    it("when it enters, investigates", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Island", "Island"], hand: ["Alquist Proft, Master Sleuth"] } });
      s = settle(cast(s, "p1", "Alquist Proft, Master Sleuth"));
      expect(clues(s)).toHaveLength(1);
    });

    it("{X}{W}{U}{U}, {T}, sacrifice a Clue: draw X cards and gain X life", () => {
      let s = scenario({
        p1: { battlefield: ["Alquist Proft, Master Sleuth", "Plains", ...lands("Island", 4)], library: lands("Forest", 5) },
      });
      createTokens(s, "p1", CLUE, 1);
      const alquist = idOf(s, "p1", "battlefield", "Alquist Proft, Master Sleuth");
      s = settle(activate(s, "p1", alquist, "X cards", { x: 2 }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(22);
      expect(clues(s)).toHaveLength(0);
      expect(s.objects[alquist]?.tapped).toBe(true);
    });
  });

  describe("Anzrag, the Quake-Mole", () => {
    it("blocked: your creatures untap and an additional combat phase follows", () => {
      const s = scenario({
        p1: { battlefield: ["Anzrag, the Quake-Mole", "Bear Cub"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const anzrag = idOf(s, "p1", "battlefield", "Anzrag, the Quake-Mole");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      c = act(c, "p1", { type: "declareAttackers", attackers: [anzrag, bear].map((id) => ({ id, defender: "p2" })) });
      c = advanceUntil(c, (x) => x.pending?.kind === "declareBlockers");
      const blocker = idOf(c, "p2", "battlefield", "Fire Elemental");
      c = act(c, "p2", { type: "declareBlockers", blocks: [{ blocker, attacker: anzrag }] });
      c = settle(c);
      expect(c.objects[anzrag]?.tapped).toBe(false);
      expect(c.objects[bear]?.tapped).toBe(false);
      expect(c.turn.addedPhases).toEqual(["beginCombat"]);
    });

    it("{3}{R}{R}{G}{G}: must be blocked this turn", () => {
      let s = scenario({ p1: { battlefield: ["Anzrag, the Quake-Mole", ...lands("Mountain", 3), ...lands("Forest", 4)] } });
      const anzrag = idOf(s, "p1", "battlefield", "Anzrag, the Quake-Mole");
      s = settle(activate(s, "p1", anzrag));
      expect(chars(s, anzrag).keywords).toContain("mustBeBlocked");
    });
  });

  describe("Assassin's Trophy", () => {
    it("destroys the opposing permanent; its controller searches for a basic land and puts it onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Assassin's Trophy"] },
        p2: { battlefield: ["Fire Elemental"], library: ["Plains", "Opt"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Assassin's Trophy", { targets: { t: [elemental] } }));
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Plains")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Plains")]?.tapped).toBe(false);
    });

    it("can't target a permanent you control", () => {
      const s = scenario({ p1: { battlefield: ["Swamp", "Forest", "Bear Cub"], hand: ["Assassin's Trophy"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Assassin's Trophy", { targets: { t: [bear] } })).toThrow();
    });
  });

  describe("Blood Spatter Analysis", () => {
    it("when it enters, 3 damage to an opposing creature; each death: mills a card and a blood counter", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain"], hand: ["Blood Spatter Analysis"], library: ["Opt", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Blood Spatter Analysis"), pick(bear));
      const analysis = idOf(s, "p1", "battlefield", "Blood Spatter Analysis");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[analysis]?.counters.bloodstain).toBe(1);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("at the fifth counter, it is sacrificed and a creature card from your graveyard returns to hand", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Blood Spatter Analysis", counters: { bloodstain: 4 } }, ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          graveyard: ["Pelakka Wurm"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p1", "graveyard", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }), pick(wurm));
      expect(idsOf(s, "p1", "graveyard", "Blood Spatter Analysis")).toHaveLength(1);
      expect(names(s, s.players.p1?.hand)).toContain("Pelakka Wurm");
    });
  });

  describe("Break Out", () => {
    it("a creature with mana value 2 or less may enter with haste; the rest goes underneath", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Forest"],
          hand: ["Break Out"],
          library: ["Forest", "Bear Cub", "Opt", "Island", "Swamp", "Plains", "Mountain"],
        },
      });
      const bear = s.players.p1?.library[1] as string;
      s = settle(cast(s, "p1", "Break Out"), (req) => (req.type === "pick" ? [bear] : req.type === "yesNo" ? [1] : undefined));
      const onField = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, onField).keywords).toContain("haste");
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Mountain");
      expect(s.players.p1?.library).toHaveLength(6);
    });

    it("a more expensive creature goes to hand", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Forest"], hand: ["Break Out"], library: ["Fire Elemental", "Opt", "Forest"] },
      });
      const elemental = s.players.p1?.library[0] as string;
      s = settle(cast(s, "p1", "Break Out"), pick(elemental));
      expect(names(s, s.players.p1?.hand)).toEqual(["Fire Elemental"]);
      expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(0);
    });
  });

  describe("Coerced to Kill", () => {
    it("you control the enchanted creature, a base 1/1 with deathtouch, plus an Assassin", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), ...lands("Swamp", 2)], hand: ["Coerced to Kill"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Coerced to Kill", { targets: { enchant: [elemental] } }));
      const aura = idOf(s, "p1", "battlefield", "Coerced to Kill");
      expect(s.objects[aura]?.attachedTo).toBe(elemental);
      expect(s.objects[elemental]?.controller).toBe("p1");
      const c = chars(s, elemental);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.keywords).toContain("deathtouch");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Elemental", "Assassin"]));
    });
  });

  describe("Crowd-Control Warden", () => {
    it("enters with a +1/+1 counter per other creature you control", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 3), ...lands("Plains", 2)],
          hand: ["Crowd-Control Warden"],
        },
        p2: { battlefield: ["Fire Elemental"] },
      });
      s = settle(cast(s, "p1", "Crowd-Control Warden"));
      const warden = idOf(s, "p1", "battlefield", "Crowd-Control Warden");
      expect(s.objects[warden]?.counters["+1/+1"]).toBe(2);
      expect(pt(s, warden)).toEqual([6, 6]);
    });

    it("face down: a 2/2 with no counters; turned face up, it gets its counters", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4), ...lands("Plains", 4)], hand: ["Crowd-Control Warden"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Crowd-Control Warden");
      expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, id)).toEqual([5, 5]);
    });
  });

  describe("Curious Cadaver", () => {
    it("when you sacrifice a Clue, it returns from your graveyard to your hand", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), graveyard: ["Curious Cadaver"] } });
      const [clue] = createTokens(s, "p1", CLUE, 1);
      s = settle(activate(s, "p1", clue as string));
      expect(names(s, s.players.p1?.hand)).toContain("Curious Cadaver");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Curious Cadaver");
    });
  });

  describe("Deadly Complication", () => {
    it("both modes: destroys a creature, +1/+1 counter on your suspected creature that is no longer suspected", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", "Mountain", "Mountain"], hand: ["Deadly Complication"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const o = s.objects[bear];
      if (o) o.suspected = 1;
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Deadly Complication", { mode: 2, targets: { d: [elemental], s: [bear] } }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.suspected).toBeUndefined();
    });

    it("the second mode only targets a suspected creature you control", () => {
      const s = scenario({
        p1: { battlefield: ["Bear Cub", "Swamp", "Mountain", "Mountain"], hand: ["Deadly Complication"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Deadly Complication", { mode: 1, targets: { s: [bear] } })).toThrow();
    });
  });

  describe("Detective's Satchel", () => {
    it("investigates twice; {T}: a Thopter, only if you sacrificed an artifact this turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), ...lands("Mountain", 2)], hand: ["Detective's Satchel"] } });
      s = settle(cast(s, "p1", "Detective's Satchel"));
      expect(clues(s)).toHaveLength(2);
      const satchel = idOf(s, "p1", "battlefield", "Detective's Satchel");
      expect(canActivate(s, "p1", satchel, "Thopter")).toBe(false);
      s = settle(activate(s, "p1", clues(s)[0] as string));
      expect(canActivate(s, "p1", satchel, "Thopter")).toBe(true);
      s = settle(activate(s, "p1", satchel, "Thopter"));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
    });
  });

  describe("Dog Walker", () => {
    it("turned face up: creates two tapped 1/1 white Dogs", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Dog Walker"] } });
      let id = "";
      [s, id] = castFaceDown(s, "Dog Walker");
      s = settle(activate(s, "p1", id, "Turn face up"));
      const dogs = idsOf(s, "p1", "battlefield", "Dog");
      expect(dogs).toHaveLength(2);
      expect(dogs.every((d) => s.objects[d]?.tapped)).toBe(true);
      expect(chars(s, dogs[0] as string).colors).toEqual(["W"]);
    });
  });

  describe("Doppelgang", () => {
    it("for each of the X targets, X token copies", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4), ...lands("Island", 4)], hand: ["Doppelgang"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Doppelgang", { x: 2, targets: { t: [bear, elves] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });
  });

  describe("Drag the Canal", () => {
    it("a 2/2 Detective; if a creature died this turn, 2 life, surveil 2 and a Clue", () => {
      let s = scenario({ p1: { battlefield: ["Island", "Swamp"], hand: ["Drag the Canal"] } });
      s = settle(cast(s, "p1", "Drag the Canal"));
      expect(idsOf(s, "p1", "battlefield", "Detective")).toHaveLength(1);
      expect(clues(s)).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);

      let t = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Island", "Swamp"], hand: ["Drag the Canal", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      t = settle(cast(t, "p1", "Drag the Canal"));
      expect(idsOf(t, "p1", "battlefield", "Detective")).toHaveLength(1);
      expect(clues(t)).toHaveLength(1);
      expect(t.players.p1?.life).toBe(22);
    });
  });

  describe("Ezrim, Agency Chief", () => {
    it("investigates twice; {1}, sacrifice an artifact: lifelink until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 3)], hand: ["Ezrim, Agency Chief"] } });
      s = settle(cast(s, "p1", "Ezrim, Agency Chief"));
      expect(clues(s)).toHaveLength(2);
      const ezrim = idOf(s, "p1", "battlefield", "Ezrim, Agency Chief");
      // Vigilance? no; lifelink? yes.
      s = settle(activate(s, "p1", ezrim, "lifelink", { sacrifice: [clues(s)[0] as string] }), (req) =>
        req.intent === "may" ? [req.prompt.includes("lifelink") ? 1 : 0] : undefined,
      );
      expect(clues(s)).toHaveLength(1);
      expect(chars(s, ezrim).keywords).toContain("lifelink");
      expect(chars(s, ezrim).keywords).not.toContain("hexproof");
      expect(chars(s, ezrim).keywords).not.toContain("vigilance");
    });

    it('"your choice": a single ability, the keyword is chosen during resolution (608.2d)', () => {
      let s = scenario({ p1: { battlefield: ["Ezrim, Agency Chief", "Island"] } });
      createTokens(s, "p1", CLUE, 1);
      const ezrim = idOf(s, "p1", "battlefield", "Ezrim, Agency Chief");
      const boosts = legalActions(s, "p1").filter((x) => x.type === "activate" && x.source === ezrim);
      expect(boosts).toHaveLength(1);
      s = activate(s, "p1", ezrim, "your choice", { sacrifice: clues(s) });
      // No question on activation: the ability is on the stack, with no choice made.
      expect(s.stack).toHaveLength(1);
      expect(s.pending?.kind).toBe("priority");
      const prompts: string[] = [];
      s = settle(s, (req) => {
        if (req.intent !== "may") return undefined;
        prompts.push(req.prompt);
        return [0];
      });
      // Neither vigilance nor lifelink: hexproof.
      expect(prompts).toHaveLength(2);
      expect(chars(s, ezrim).keywords).toContain("hexproof");
      expect(chars(s, ezrim).keywords).not.toContain("vigilance");
      expect(chars(s, ezrim).keywords).not.toContain("lifelink");
      s = advanceUntil(s, (x) => x.turn.number === 2 && x.pending?.kind === "priority");
      expect(chars(s, ezrim).keywords).not.toContain("hexproof");
    });
  });

  describe("Faerie Snoop", () => {
    it("turned face up: one of the top two cards to hand, the other to the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Swamp", 3)],
          hand: ["Faerie Snoop"],
          library: ["Opt", "Bear Cub", "Forest"],
        },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Faerie Snoop");
      const bear = s.players.p1?.library[1] as string;
      s = settle(activate(s, "p1", id, "Turn face up"), pick(bear));
      expect(names(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });
  });

  describe("Gadget Technician", () => {
    it("a Thopter when it enters, and another when it's turned face up", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Mountain", 2)], hand: ["Gadget Technician"] } });
      s = settle(cast(s, "p1", "Gadget Technician"));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: [...lands("Island", 3), ...lands("Mountain", 2)], hand: ["Gadget Technician"] } });
      let id = "";
      [t, id] = castFaceDown(t, "Gadget Technician");
      expect(idsOf(t, "p1", "battlefield", "Thopter")).toHaveLength(0);
      t = settle(activate(t, "p1", id, "Turn face up"));
      const thopters = idsOf(t, "p1", "battlefield", "Thopter");
      expect(thopters).toHaveLength(1);
      expect(chars(t, thopters[0] as string).keywords).toContain("flying");
    });
  });

  describe("Gleaming Geardrake", () => {
    it("investigates when it enters; each sacrificed artifact gives it a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Mountain"], hand: ["Gleaming Geardrake"] } });
      s = settle(cast(s, "p1", "Gleaming Geardrake"));
      const drake = idOf(s, "p1", "battlefield", "Gleaming Geardrake");
      s = settle(activate(s, "p1", clues(s)[0] as string));
      expect(s.objects[drake]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("Granite Witness", () => {
    it("turned face up: taps or untaps the target creature, your choice", () => {
      for (const tappedBefore of [false, true]) {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Granite Witness"] },
          p2: { battlefield: [{ name: "Fire Elemental", tapped: tappedBefore }] },
        });
        let id = "";
        [s, id] = castFaceDown(s, "Granite Witness");
        const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
        s = settle(activate(s, "p1", id, "Turn face up"), (req) =>
          req.type === "pick" && req.options.includes(elemental) ? [elemental] : undefined,
        );
        expect(s.objects[elemental]?.tapped).toBe(!tappedBefore);
      }
    });

    it("the target is chosen on trigger, tap or untap during resolution (608.2d); you may do nothing", () => {
      const setup = () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2)], hand: ["Granite Witness"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        let id = "";
        [s, id] = castFaceDown(s, "Granite Witness");
        return { s, id, elemental: idOf(s, "p2", "battlefield", "Fire Elemental") };
      };
      let { s, id, elemental } = setup();
      let asked: ChoiceRequest[] = [];
      s = activate(s, "p1", id, "Turn face up");
      // Put on the stack: only the target is asked (no mode).
      for (let i = 0; i < 20 && !s.stack.some((it) => it.kind === "ability"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") {
          const req = p.request;
          asked.push(req);
          s = act(s, p.player, {
            type: "choose",
            values: req.type === "pick" && req.options.includes(elemental) ? [elemental] : req.suggested,
          });
        } else break;
      }
      expect(asked.map((r) => r.intent)).not.toContain("triggerMode");
      expect(s.stack.find((it) => it.kind === "ability")?.targets.t).toEqual([elemental]);
      // The creature is tapped in response: the action offered on resolution is to untap it.
      const fire = s.objects[elemental];
      if (fire) fire.tapped = true;
      bump(s);
      asked = [];
      s = settle(s, (req) => {
        asked.push(req);
        return undefined;
      });
      expect(asked.map((r) => r.prompt).filter((p) => p.includes("Untap"))).toHaveLength(1);
      expect(asked.map((r) => r.prompt).filter((p) => p.includes("Tap"))).toHaveLength(0);
      expect(s.objects[elemental]?.tapped).toBe(false);

      // "You may": declining does nothing.
      ({ s, id, elemental } = setup());
      s = settle(activate(s, "p1", id, "Turn face up"), (req) =>
        req.intent === "may" ? [0] : req.type === "pick" && req.options.includes(elemental) ? [elemental] : undefined,
      );
      expect(s.objects[elemental]?.tapped).toBe(false);
    });
  });

  describe("Insidious Roots", () => {
    it("your creature tokens produce mana of any color", () => {
      const s = scenario({ p1: { battlefield: ["Insidious Roots", "Bear Cub"] } });
      const [dog] = createTokens(
        s,
        "p1",
        { name: "Dog", colors: ["W"], types: ["Creature"], subtypes: ["Dog"], power: 1, toughness: 1 },
        1,
      );
      // No summoning sickness: the token has been under your control since the start of the turn.
      const token = s.objects[dog as string];
      if (token) token.controlledSince = 0;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === dog ? a.colors : []));
      expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === bear)).toBe(false);
    });

    it("creature cards leave your graveyard: a 0/1 Plant, then a +1/+1 counter on each Plant", () => {
      let s = scenario({
        p1: {
          battlefield: ["Insidious Roots", ...lands("Plains", 4), ...lands("Mountain", 2)],
          hand: ["Push // Pull"],
          graveyard: ["Bear Cub", "Llanowar Elves"],
        },
      });
      const gy = s.players.p1?.graveyard ?? [];
      s = settle(cast(s, "p1", "Push // Pull", { face: 1, targets: { t: [...gy] } }));
      const plants = idsOf(s, "p1", "battlefield", "Plant");
      expect(plants).toHaveLength(1);
      expect(pt(s, plants[0] as string)).toEqual([1, 2]);
    });
  });

  describe("Kellan, Inquisitive Prodigy // Tail the Suspect", () => {
    it("Kellan attacks: destroys an artifact; if it was yours, draw a card", () => {
      let s = scenario({
        p1: { battlefield: ["Kellan, Inquisitive Prodigy // Tail the Suspect"], library: lands("Forest", 3) },
        p2: { battlefield: ["Esoteric Duplicator"] },
      });
      const kellan = idOf(s, "p1", "battlefield", "Kellan, Inquisitive Prodigy // Tail the Suspect");
      const [mine] = createTokens(s, "p1", CLUE, 1);
      const theirs = idOf(s, "p2", "battlefield", "Esoteric Duplicator");
      const t = attack(s, [kellan], pick(theirs));
      expect(idsOf(t, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(0);
      s = attack(s, [kellan], pick(mine as string));
      expect(clues(s)).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Tail the Suspect: investigates, and an additional land this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Forest", "Island"], hand: ["Kellan, Inquisitive Prodigy // Tail the Suspect", "Forest", "Island"] },
      });
      s = settle(cast(s, "p1", "Kellan, Inquisitive Prodigy // Tail the Suspect", { face: 1 }));
      expect(clues(s)).toHaveLength(1);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("Kraul Whipcracker", () => {
    it("when it enters, destroys an opposing token (not a card)", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Kraul Whipcracker"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const [clue] = createTokens(s, "p2", CLUE, 1);
      s = settle(cast(s, "p1", "Kraul Whipcracker"), pick(clue as string));
      expect(clues(s, "p2")).toHaveLength(0);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Leyline of the Guildpact", () => {
    it("your nonland permanents are every color; your lands have every basic type", () => {
      const s = scenario({
        p1: { battlefield: ["Leyline of the Guildpact", "Bear Cub", "Forest"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(s.defs[s.objects[idOf(s, "p1", "battlefield", "Leyline of the Guildpact")]?.defId ?? ""]?.leyline).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).colors).toHaveLength(5);
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).colors).toEqual(["G"]);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(chars(s, forest).colors).toHaveLength(0);
      const produced = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === forest ? a.colors : []));
      expect(produced.sort()).toEqual(["B", "G", "R", "U", "W"]);
    });
  });

  describe("Lightning Helix", () => {
    it("3 damage to any target and 3 life", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Lightning Helix"] } });
      s = settle(cast(s, "p1", "Lightning Helix", { targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });
  });

  describe("Meddling Youths", () => {
    it("investigates when you attack with three or more creatures, not with two", () => {
      const s = scenario({ p1: { battlefield: ["Meddling Youths", "Bear Cub", "Llanowar Elves"] } });
      const all = idsOf(s, "p1", "battlefield", "Meddling Youths").concat(
        idsOf(s, "p1", "battlefield", "Bear Cub"),
        idsOf(s, "p1", "battlefield", "Llanowar Elves"),
      );
      expect(clues(attack(s, all))).toHaveLength(1);
      expect(clues(attack(s, all.slice(0, 2)))).toHaveLength(0);
    });
  });

  describe("Private Eye", () => {
    it("the other Detectives get +1/+1; second card drawn: the targeted Detective can't be blocked", () => {
      let s = scenario({
        p1: { battlefield: ["Private Eye", "Undercover Crocodelf", "Bear Cub", ...lands("Island", 3)], hand: ["Opt"] },
      });
      const croc = idOf(s, "p1", "battlefield", "Undercover Crocodelf");
      const eye = idOf(s, "p1", "battlefield", "Private Eye");
      expect(pt(s, croc)).toEqual([6, 6]);
      expect(pt(s, eye)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      // The player drew their first card of the turn (scenario: none); Opt draws the first, the second triggers.
      s = settle(cast(s, "p1", "Opt"));
      expect(chars(s, croc).keywords).not.toContain("unblockable");
      const [clue] = createTokens(s, "p1", CLUE, 1);
      s = settle(activate(s, "p1", clue as string), pick(croc));
      expect(chars(s, croc).keywords).toContain("unblockable");
    });
  });

  describe("Rakdos, Patron of Chaos", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Rakdos, Patron of Chaos"], library: lands("Swamp", 5) },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Forest"] },
      });
    /** Up to Rakdos's ability on the stack at the end step, then the opponent responds. */
    const toEnd = (s: S, sacrifice: boolean) => {
      const c = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      return settle(c, (req) => (req.type === "yesNo" ? [sacrifice ? 1 : 0] : undefined));
    };

    it("if the targeted opponent doesn't sacrifice two nonland permanents, you draw two cards", () => {
      const s = toEnd(setup(), false);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("if they sacrifice them, you don't draw", () => {
      const s = toEnd(setup(), true);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });
  });

  describe("Relive the Past", () => {
    it("an artifact and a non-Aura enchantment return as 5/5 Elementals in addition to their types", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), ...lands("Plains", 2)],
          hand: ["Relive the Past"],
          graveyard: ["Esoteric Duplicator", "Leyline of the Guildpact", "Forest"],
        },
      });
      const a = idOf(s, "p1", "graveyard", "Esoteric Duplicator");
      const e = idOf(s, "p1", "graveyard", "Leyline of the Guildpact");
      const l = idOf(s, "p1", "graveyard", "Forest");
      const uids = [a, l, e].map((x) => s.objects[x]?.uid);
      s = settle(cast(s, "p1", "Relive the Past", { targets: { a: [a], l: [l], e: [e] } }));
      for (const id of uids.map((u) => s.battlefield.find((b) => s.objects[b]?.uid === u) ?? "")) {
        const c = chars(s, id);
        expect(c.types).toContain("Creature");
        expect(c.subtypes).toContain("Elemental");
        expect([c.power, c.toughness]).toEqual([5, 5]);
      }
      expect(chars(s, idOf(s, "p1", "battlefield", "Esoteric Duplicator")).types).toContain("Artifact");
    });
  });

  describe("Repulsive Mutation", () => {
    it("X +1/+1 counters, then counters the spell unless its controller pays the greatest power among your creatures", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Bear Cub", "Forest", "Island", "Forest"], hand: ["Repulsive Mutation"] },
        p2: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      const strike = s.stack[0]?.id as string;
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p1", "Repulsive Mutation", { x: 1, targets: { c: [bear], s: [strike] } });
      let asked = false;
      s = settle(s, (req) => {
        if (req.intent !== "unlessPay") return undefined;
        asked = true;
        return [1];
      });
      // Power 3: the two remaining Mountains aren't enough.
      expect(asked).toBe(false);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Rune-Brand Juggler", () => {
    it("suspects one of your creatures; {3}{B}{R}, sacrifice a suspected creature: -5/-5", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4), ...lands("Mountain", 3)], hand: ["Rune-Brand Juggler"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Rune-Brand Juggler"), pick(bear));
      expect(s.objects[bear]?.suspected).toBeTruthy();
      const juggler = idOf(s, "p1", "battlefield", "Rune-Brand Juggler");
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(activate(s, "p1", juggler, "-5/-5", { targets: { t: [elemental] }, sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });

    it("suspected itself, the Juggler can sacrifice itself to pay its cost", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 3)], hand: ["Rune-Brand Juggler"] },
        p2: { battlefield: ["Fire Elemental"] },
      });
      s = settle(cast(s, "p1", "Rune-Brand Juggler"));
      const juggler = idOf(s, "p1", "battlefield", "Rune-Brand Juggler");
      expect(s.objects[juggler]?.suspected).toBeTruthy();
      const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(activate(s, "p1", juggler, "-5/-5", { targets: { t: [elemental] }, sacrifice: [juggler] }));
      expect(idsOf(s, "p1", "graveyard", "Rune-Brand Juggler")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
    });
  });

  describe("Sanguine Savior, Shady Informant", () => {
    it("Sanguine Savior turned face up: another of your creatures gains lifelink", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 3), ...lands("Swamp", 2)], hand: ["Sanguine Savior"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Sanguine Savior");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", id, "Turn face up"), pick(bear));
      expect(chars(s, bear).keywords).toContain("lifelink");
    });

    it("Shady Informant dies: 2 damage to any target", () => {
      let s = scenario({
        p1: { battlefield: ["Shady Informant", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      s = settle(
        cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Shady Informant")] } }),
        (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined),
      );
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Soul Search", () => {
    it("exiles the chosen nonland card from the opponent's hand; mana value 1 or less: a Spirit", () => {
      const run = (card: string) => {
        let s = scenario({
          p1: { battlefield: ["Plains", "Swamp"], hand: ["Soul Search"] },
          p2: { hand: [card, "Forest"] },
        });
        s = settle(cast(s, "p1", "Soul Search", { targets: { t: ["p2"] } }));
        return s;
      };
      const cheap = run("Opt");
      expect(exiled(cheap, "Opt")).toBe(true);
      expect(names(cheap, cheap.players.p2?.hand)).toEqual(["Forest"]);
      expect(idsOf(cheap, "p1", "battlefield", "Spirit")).toHaveLength(1);
      const big = run("Fire Elemental");
      expect(exiled(big, "Fire Elemental")).toBe(true);
      expect(idsOf(big, "p1", "battlefield", "Spirit")).toHaveLength(0);
    });
  });

  describe("Sumala Sentry", () => {
    it("a face-down permanent you control is turned up: a +1/+1 counter on it and on Sumala Sentry", () => {
      let s = scenario({
        p1: { battlefield: ["Sumala Sentry", ...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Dog Walker"] },
      });
      let id = "";
      [s, id] = castFaceDown(s, "Dog Walker");
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Sumala Sentry")]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Teysa, Opulent Oligarch", () => {
    it("at your end step, investigate for each opponent who lost life; a Clue in the graveyard: a Spirit, once per turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Teysa, Opulent Oligarch", ...lands("Mountain", 6)],
          hand: ["Lightning Strike"],
        },
      });
      const [c1, c2] = createTokens(s, "p1", CLUE, 2);
      s = settle(activate(s, "p1", c1 as string));
      s = settle(activate(s, "p1", c2 as string));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
      expect(clues(s)).toHaveLength(1);
    });
  });

  describe("Trostani, Three Whispers", () => {
    it("three abilities: deathtouch, vigilance, double strike to the target creature", () => {
      let s = scenario({
        p1: { battlefield: ["Trostani, Three Whispers", "Bear Cub", ...lands("Forest", 3), ...lands("Plains", 3)] },
      });
      const trostani = idOf(s, "p1", "battlefield", "Trostani, Three Whispers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", trostani, "deathtouch", { targets: { t: [bear] } }));
      s = settle(activate(s, "p1", trostani, "vigilance", { targets: { t: [bear] } }));
      s = settle(activate(s, "p1", trostani, "double strike", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "vigilance", "doubleStrike"]));
    });
  });

  describe("Undercover Crocodelf", () => {
    it("combat damage to a player: investigate", () => {
      let s = scenario({ p1: { battlefield: ["Undercover Crocodelf"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Undercover Crocodelf")]);
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" || x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(15);
      expect(clues(s)).toHaveLength(1);
    });
  });

  describe("Wispdrinker Vampire", () => {
    it("another creature with power 2 or less enters under your control: each opponent loses 1 life, you gain 1", () => {
      let s = scenario({
        p1: { battlefield: ["Wispdrinker Vampire", ...lands("Forest", 7)], hand: ["Bear Cub", "Pelakka Wurm"] },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      const t = settle(
        cast(
          scenario({ p1: { battlefield: ["Wispdrinker Vampire", ...lands("Forest", 7)], hand: ["Pelakka Wurm"] } }),
          "p1",
          "Pelakka Wurm",
        ),
      );
      expect(t.players.p2?.life).toBe(20);
    });

    it("{5}{W}{B}: your creatures with power 2 or less gain deathtouch and lifelink", () => {
      let s = scenario({
        p1: { battlefield: ["Wispdrinker Vampire", "Bear Cub", "Fire Elemental", ...lands("Plains", 4), ...lands("Swamp", 3)] },
      });
      const vampire = idOf(s, "p1", "battlefield", "Wispdrinker Vampire");
      s = settle(activate(s, "p1", vampire));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toEqual(
        expect.arrayContaining(["deathtouch", "lifelink"]),
      );
      expect(chars(s, idOf(s, "p1", "battlefield", "Fire Elemental")).keywords).not.toContain("lifelink");
    });
  });

  describe("Worldsoul's Rage", () => {
    it("X damage, then up to X land cards from your hand and your graveyard, tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)],
          hand: ["Worldsoul's Rage", "Island", "Plains"],
          graveyard: ["Swamp", "Forest"],
        },
      });
      const island = idOf(s, "p1", "hand", "Island");
      const swamp = idOf(s, "p1", "graveyard", "Swamp");
      s = settle(cast(s, "p1", "Worldsoul's Rage", { x: 2, targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.options.includes(island)
          ? [island]
          : req.type === "pick" && req.options.includes(swamp)
            ? [swamp]
            : undefined,
      );
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Swamp")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Swamp")]?.tapped).toBe(true);
      expect(names(s, s.players.p1?.hand)).toEqual(["Plains"]);
      expect(names(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Forest", "Worldsoul's Rage"]));
    });
  });

  describe("split cards", () => {
    it("Cease: exiles up to two cards from a single graveyard; the targeted player gains 2 life and draws", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Cease // Desist"] },
        p2: { graveyard: ["Opt", "Bear Cub"] },
      });
      const gy = s.players.p2?.graveyard ?? [];
      s = settle(cast(s, "p1", "Cease // Desist", { face: 0, targets: { c: [...gy], p: ["p1"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(exiled(s, "Opt") && exiled(s, "Bear Cub")).toBe(true);
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Desist: destroys all artifacts and enchantments", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), ...lands("Plains", 2), "Insidious Roots"], hand: ["Cease // Desist"] },
        p2: { battlefield: ["Esoteric Duplicator", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Cease // Desist", { face: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Insidious Roots")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Esoteric Duplicator")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Fuss: a +1/+1 counter on each attacking creature you control", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Mountain", 3)], hand: ["Fuss // Bother"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = attack(s, [bear]);
      s = settle(cast(s, "p1", "Fuss // Bother", { face: 0 }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Bother: three 1/1 flying Thopters, then surveil 2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 3)], hand: ["Fuss // Bother"] } });
      s = settle(cast(s, "p1", "Fuss // Bother", { face: 1 }));
      expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(3);
    });

    it("Push destroys a tapped creature only; Pull: up to two creatures from a graveyard, sacrificed at the end of turn", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Plains", 2)], hand: ["Push // Pull"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Fire Elemental"] },
      });
      expect(() =>
        cast(s, "p1", "Push // Pull", { face: 0, targets: { t: [idOf(s, "p2", "battlefield", "Fire Elemental")] } }),
      ).toThrow();
      const pushed = settle(
        cast(s, "p1", "Push // Pull", { face: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      );
      expect(idsOf(pushed, "p2", "graveyard", "Bear Cub")).toHaveLength(1);

      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2)], hand: ["Push // Pull"] },
        p2: { graveyard: ["Fire Elemental", "Bear Cub"] },
      });
      const gy = t.players.p2?.graveyard ?? [];
      t = settle(cast(t, "p1", "Push // Pull", { face: 1, targets: { t: [...gy] } }));
      const elemental = idOf(t, "p1", "battlefield", "Fire Elemental");
      expect(chars(t, elemental).keywords).toContain("haste");
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      t = advanceUntil(t, (x) => x.turn.active !== "p1");
      expect(idsOf(t, "p2", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Pull: the targets must come from a single graveyard", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2)], hand: ["Push // Pull"], graveyard: ["Bear Cub"] },
        p2: { graveyard: ["Fire Elemental"] },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p2", "graveyard", "Fire Elemental")];
      expect(() => cast(s, "p1", "Push // Pull", { face: 1, targets: { t: targets } })).toThrow();
    });
  });
});

describe("Murders at Karlov Manor, lot A — colorless and lands", () => {
  /**
   * Murders at Karlov Manor, lot A: colorless cards and lands, checked against their Oracle text (plan R, lot R7).
   */
  type S = GameState;
  /** Activates the ability of the source whose label contains `label` (index and offered option). */
  const activation = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ReturnType<typeof legalActions>[number], { type: "activate" }> =>
        a.type === "activate" && a.source === source && (a.label ?? "").includes(label),
    );
  const activate = (s: S, player: string, source: string, label: string, extra: Partial<Decision> = {}) => {
    const a = activation(s, player, source, label);
    if (!a) throw new Error(`Ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra } as Decision);
  };
  /** Colors offered by a source's mana abilities. */
  const manaColors = (s: S, player: string, source: string) =>
    [...new Set(legalActions(s, player).flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : [])))].sort();

  const DETECTIVE_CARD = customCard({ name: "Test Detective", subtypes: ["Detective"], power: 2, toughness: 2 });
  const PRISM = customCard({ name: "Test Prism", colors: ["W", "U", "B", "R", "G"], power: 1, toughness: 1 });

  describe("surveil lands", () => {
    it("Commercial District enters tapped, then surveil 1", () => {
      let s = scenario({ p1: { hand: ["Commercial District"], library: ["Opt", "Forest"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Commercial District") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Commercial District")]?.tapped).toBe(true);
      s = settle(s, (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });

    it("their basic land types give their two colors", () => {
      const names = [
        "Commercial District",
        "Elegant Parlor",
        "Hedge Maze",
        "Lush Portico",
        "Raucous Theater",
        "Shadowy Backstreet",
        "Undercity Sewers",
      ];
      const s = scenario({ p1: { battlefield: names } });
      const got = names.map((n) => manaColors(s, "p1", idOf(s, "p1", "battlefield", n)).join(""));
      expect(got).toEqual(["GR", "RW", "GU", "GW", "BR", "BW", "BU"]);
    });
  });

  describe("Public Thoroughfare", () => {
    const play = (battlefield: string[], answer: Answer = () => undefined) => {
      let s = scenario({ p1: { battlefield, hand: ["Public Thoroughfare"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Public Thoroughfare") });
      return settle(s, answer);
    };

    it("enters tapped; by tapping an untapped land, you keep it", () => {
      const s = play(["Forest"]);
      const pt = idOf(s, "p1", "battlefield", "Public Thoroughfare");
      expect(s.objects[pt]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
    });

    it("sacrificed if you tap nothing, or for lack of an artifact or untapped land (a creature isn't enough)", () => {
      const refused = play(["Forest"], (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(refused, "p1", "battlefield", "Public Thoroughfare")).toHaveLength(0);
      expect(idsOf(refused, "p1", "graveyard", "Public Thoroughfare")).toHaveLength(1);
      const none = play(["Bear Cub"]);
      expect(idsOf(none, "p1", "graveyard", "Public Thoroughfare")).toHaveLength(1);
      expect(none.objects[idOf(none, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    });

    it("an untapped artifact works too; the land produces one mana of any color", () => {
      const s = play(["Magnifying Glass"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Magnifying Glass")]?.tapped).toBe(true);
      const t = scenario({ p1: { battlefield: ["Public Thoroughfare"] } });
      expect(manaColors(t, "p1", idOf(t, "p1", "battlefield", "Public Thoroughfare"))).toEqual(["B", "G", "R", "U", "W"]);
    });
  });

  describe("Scene of the Crime", () => {
    it("artifact land Clue that enters tapped", () => {
      let s = scenario({ p1: { hand: ["Scene of the Crime"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Scene of the Crime") });
      const id = idOf(s, "p1", "battlefield", "Scene of the Crime");
      expect(s.objects[id]?.tapped).toBe(true);
      expect(chars(s, id).types).toEqual(expect.arrayContaining(["Artifact", "Land"]));
      expect(chars(s, id).subtypes).toEqual(["Clue"]);
    });

    it("{C} only; any color by tapping an untapped creature", () => {
      const alone = scenario({ p1: { battlefield: ["Scene of the Crime"] } });
      expect(manaColors(alone, "p1", idOf(alone, "p1", "battlefield", "Scene of the Crime"))).toEqual(["C"]);
      let s = scenario({ p1: { battlefield: ["Scene of the Crime", "Bear Cub"] } });
      const scene = idOf(s, "p1", "battlefield", "Scene of the Crime");
      expect(manaColors(s, "p1", scene)).toEqual(["B", "C", "G", "R", "U", "W"]);
      const option = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === scene && a.colors.includes("R"));
      s = act(s, "p1", {
        type: "tapForMana",
        source: scene,
        ability: option?.type === "tapForMana" ? option.ability : -1,
        color: "R",
      });
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("{2}, sacrifice it: draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Scene of the Crime", ...lands("Forest", 2)], library: ["Opt"] } });
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Scene of the Crime"), "Draw a card");
      s = settle(s);
      expect(idsOf(s, "p1", "graveyard", "Scene of the Crime")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });
  });

  describe("Magnifying Glass", () => {
    it("{T}: {C}; {4}, {T}: investigate", () => {
      let s = scenario({ p1: { battlefield: ["Magnifying Glass", ...lands("Forest", 4)] } });
      const glass = idOf(s, "p1", "battlefield", "Magnifying Glass");
      expect(manaColors(s, "p1", glass)).toEqual(["C"]);
      s = settle(activate(s, "p1", glass, "Investigate"));
      expect(s.objects[glass]?.tapped).toBe(true);
      const clues = s.battlefield.filter((id) => chars(s, id).subtypes.includes("Clue"));
      expect(clues).toHaveLength(1);
      expect(chars(s, clues[0] as string).types).toEqual(["Artifact"]);
    });
  });

  describe("Sanitation Automaton", () => {
    it("when it enters, surveil 1", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Sanitation Automaton"], library: ["Opt"] } });
      s = cast(s, "p1", "Sanitation Automaton");
      s = settle(s, (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined));
      expect(idsOf(s, "p1", "battlefield", "Sanitation Automaton")).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });
  });

  describe("Thinking Cap", () => {
    it("Detective equip {1} only targets a Detective; the equipped creature gets +1/+2", () => {
      let s = scenario({ p1: { battlefield: ["Thinking Cap", DETECTIVE_CARD, "Bear Cub", "Plains"] } });
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      const detective = idOf(s, "p1", "battlefield", DETECTIVE_CARD.name);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const option = activation(s, "p1", cap, "Detective");
      expect(option?.targets[0]?.id).toBeDefined();
      expect(() => activate(s, "p1", cap, "Detective", { targets: { t: [cub] } })).toThrow(RulesError);
      s = settle(activate(s, "p1", cap, "Detective", { targets: { t: [detective] } }));
      expect(s.objects[cap]?.attachedTo).toBe(detective);
      expect([chars(s, detective).power, chars(s, detective).toughness]).toEqual([3, 4]);
    });

    it("Equip {3} on any creature you control", () => {
      let s = scenario({ p1: { battlefield: ["Thinking Cap", "Bear Cub", ...lands("Plains", 3)] } });
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", cap, msg("Equip {cost}", { cost: "{3}" }), { targets: { t: [cub] } }));
      expect(s.objects[cap]?.attachedTo).toBe(cub);
      expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([3, 4]);
    });
  });

  describe("Magnetic Snuffler", () => {
    it("when it enters, returns an Equipment from your graveyard attached to it", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: ["Magnetic Snuffler"], graveyard: ["Thinking Cap"] },
      });
      s = settle(cast(s, "p1", "Magnetic Snuffler"));
      const snuffler = idOf(s, "p1", "battlefield", "Magnetic Snuffler");
      const cap = idOf(s, "p1", "battlefield", "Thinking Cap");
      expect(s.objects[cap]?.attachedTo).toBe(snuffler);
      expect([chars(s, snuffler).power, chars(s, snuffler).toughness]).toEqual([5, 6]);
    });

    it("whenever you sacrifice an artifact, a +1/+1 counter; not when an opponent does", () => {
      let s = scenario({
        p1: { battlefield: ["Magnetic Snuffler", "Scene of the Crime", ...lands("Forest", 2)] },
        p2: { battlefield: ["Magnetic Snuffler"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Scene of the Crime"), "Draw a card"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Magnetic Snuffler")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Magnetic Snuffler")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Gravestone Strider", () => {
    it("{1}: one mana of any color, once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Gravestone Strider", ...lands("Forest", 2)] } });
      const strider = idOf(s, "p1", "battlefield", "Gravestone Strider");
      s = activate(s, "p1", strider, "once per turn");
      s = settle(s, (req) => (req.intent === "manaColor" ? ["U"] : undefined));
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(activation(s, "p1", strider, "once per turn")).toBeUndefined();
    });

    it("{2}, exile it from your graveyard: exile a target card from a graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), graveyard: ["Gravestone Strider"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const strider = idOf(s, "p1", "graveyard", "Gravestone Strider");
      const cub = idOf(s, "p2", "graveyard", "Bear Cub");
      s = settle(activate(s, "p1", strider, "Exile", { targets: { t: [cub] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Gravestone Strider"]);
    });
  });

  describe("Lumbering Laundry", () => {
    it("{2}: until end of turn, you see the opposing face-down creatures", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Lumbering Laundry", ...lands("Forest", 2)] },
        p2: { battlefield: lands("Forest", 3), hand: ["Lumbering Laundry"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lumbering Laundry"), faceDown: true });
      s = settle(s);
      const hidden = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
      expect(hidden).toBeDefined();
      const seen = (x: S) => projectView(x, "p1").battlefield.find((o) => o.id === hidden)?.faceDownCard;
      expect(seen(s)).toBeUndefined();
      // p2 keeps priority after the resolution: it passes, p1 activates.
      if (s.pending?.kind === "priority" && s.pending.player === "p2") s = act(s, "p2", { type: "pass" });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Lumbering Laundry"), "face-down"));
      expect(seen(s)?.name).toBe("Lumbering Laundry");
      s = advanceUntil(s, (x) => x.turn.active === "p1");
      expect(seen(s)).toBeUndefined();
    });
  });

  describe("Case of the Shattered Pact", () => {
    it("when it enters, searches for a basic land card and puts it into hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Case of the Shattered Pact"], library: ["Opt", "Plains"] },
      });
      s = settle(cast(s, "p1", "Case of the Shattered Pact"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Plains"]);
    });

    it("solved at your end step if there are five colors among your permanents", () => {
      const run = (battlefield: (string | typeof PRISM)[]) => {
        let s = scenario({ p1: { battlefield: ["Case of the Shattered Pact", ...battlefield] } });
        const id = idOf(s, "p1", "battlefield", "Case of the Shattered Pact");
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active !== "p1");
        return s.objects[id]?.solved ?? false;
      };
      expect(run([PRISM])).toBe(true);
      expect(run(["Bear Cub"])).toBe(false);
    });

    it("solved: at the beginning of combat, a target creature gains flying, double strike and vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Case of the Shattered Pact", "Bear Cub"] } });
      const caseId = idOf(s, "p1", "battlefield", "Case of the Shattered Pact");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const solved = s.objects[caseId];
      if (solved) solved.solved = true;
      s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" || x.turn.active !== "p1");
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "vigilance"]));
    });
  });
});

describe("Murders at Karlov Manor, lot B1: collect evidence (701.59)", () => {
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateFirst = (s: S, source: string, label: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
    return a?.type === "activate" ? act(s, "p1", { type: "activate", source, ability: a.ability, targets }) : undefined;
  };

  it("Surveillance Monitor: when it enters, you may collect evidence 4; whenever you do, a Thopter", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Surveillance Monitor"], graveyard: ["Shivan Dragon", "Opt"] },
    });
    s = settle(cast(s, "p1", "Surveillance Monitor"), yes);
    // Shivan Dragon (MV 6) is enough: Opt stays in the graveyard.
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
  });

  it("Forensic Researcher: {T}, collect evidence 3 as a cost; impossible without enough evidence", () => {
    let s = scenario({
      p1: { battlefield: ["Forensic Researcher"], graveyard: ["Opt", "Bear Cub"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const researcher = idOf(s, "p1", "battlefield", "Forensic Researcher");
    // Opt (1) + Bear Cub (2) = 3.
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activateFirst(s, researcher, "tap a creature", { t: [bear] }) as S);
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    const t = scenario({ p1: { battlefield: ["Forensic Researcher"], graveyard: ["Opt"] }, p2: { battlefield: ["Bear Cub"] } });
    const r2 = idOf(t, "p1", "battlefield", "Forensic Researcher");
    expect(activateFirst(t, r2, "tap a creature", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] })).toBeUndefined();
  });

  it("Incinerator of the Guilty: combat damage to a player, collect evidence X: X damage to its creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Incinerator of the Guilty"], graveyard: ["Bear Cub", "Opt"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    const dragon = idOf(s, "p1", "battlefield", "Incinerator of the Guilty");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: dragon, defender: "p2" }] });
    // Until end of combat: X = 2.
    for (let i = 0; i < 60 && s.turn.step !== "endCombat" && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: p.request.type === "number" ? [2] : p.request.suggested });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else break;
    }
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    // X = 2: Bear Cub (MV 2) exiled, Opt stays.
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Lamplight Phoenix: when it dies, exile it and collect evidence 4 (without it): it returns tapped", () => {
    let s = scenario({
      p1: {
        battlefield: ["Lamplight Phoenix", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        graveyard: ["Shivan Dragon"],
      },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Lamplight Phoenix")] }), yes);
    const phoenix = idOf(s, "p1", "battlefield", "Lamplight Phoenix");
    expect(s.objects[phoenix]?.tapped).toBe(true);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    // Without enough evidence (the Phoenix doesn't count): it stays in the graveyard.
    let t = scenario({ p1: { battlefield: ["Lamplight Phoenix", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    t = settle(cast(t, "p1", "Lightning Strike", { t: [idOf(t, "p1", "battlefield", "Lamplight Phoenix")] }), yes);
    expect(idsOf(t, "p1", "graveyard", "Lamplight Phoenix")).toHaveLength(1);
  });

  it("Axebane Ferox: ward — collect evidence 4 (paid by the opponent who targets it)", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Axebane Ferox"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], graveyard },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", "Lightning Strike"),
        targets: { t: [idOf(s, "p1", "battlefield", "Axebane Ferox")] },
      });
      return settle(s, yes);
    };
    // Without evidence: the spell is countered.
    expect(idsOf(run([]), "p1", "battlefield", "Axebane Ferox")).toHaveLength(1);
    // With Shivan Dragon: the opponent pays, 3 damage (4/4: it survives).
    const s = run(["Shivan Dragon"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Axebane Ferox")]?.damage).toBe(3);
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
  });

  it("Vein Ripper: ward — sacrifice a creature; each creature that dies drains 2", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Vein Ripper"] },
      p2: { battlefield: [...lands("Mountain", 2), "Llanowar Elves"], hand: ["Lightning Strike"] },
    });
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Vein Ripper")] },
    });
    s = settle(s, yes);
    // The Elves are sacrificed to pay for ward, and their death drains 2 for Vein Ripper's benefit.
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Cryptex: {T}, collect evidence 3: one mana and an unlock counter; at five, sacrifice it to surveil and draw", () => {
    let s = scenario({ p1: { battlefield: ["Cryptex"], graveyard: ["Shivan Dragon"], library: lands("Island", 8) } });
    const cryptex = idOf(s, "p1", "battlefield", "Cryptex");
    const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === cryptex);
    expect(mana).toBeDefined();
    s = act(s, "p1", {
      type: "tapForMana",
      source: cryptex,
      ability: mana?.type === "tapForMana" ? mana.ability : 0,
      color: "R",
    });
    expect(s.objects[cryptex]?.counters.unlock).toBe(1);
    expect(s.players.p1?.manaPool.R).toBe(1);
    expect(s.exile).toHaveLength(1);
    const c = s.objects[cryptex];
    if (c) c.counters.unlock = 5;
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activateFirst(s, cryptex, "Sacrifice it") as S);
    expect(s.players.p1?.hand).toHaveLength(hand + 3);
  });

  it("Tenth District Hero: 4/4 Detective with vigilance, then Mileva, the Stalwart (5/5, your other creatures indestructible)", () => {
    let s = scenario({
      p1: { battlefield: ["Tenth District Hero", "Bear Cub", ...lands("Plains", 5)], graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Tenth District Hero");
    s = settle(activateFirst(s, hero, "evidence 2") as S);
    expect(chars(s, hero).subtypes).toEqual(expect.arrayContaining(["Human", "Detective"]));
    expect([chars(s, hero).power, chars(s, hero).toughness]).toEqual([4, 4]);
    s = settle(activateFirst(s, hero, "evidence 4") as S);
    expect(chars(s, hero).name).toBe("Mileva, the Stalwart");
    expect(chars(s, hero).supertypes).toContain("Legendary");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
  });
});

describe("Murders at Karlov Manor, lot B2: disguise", () => {
  const faceDown = (s: S, player: string, name: string) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), faceDown: true });
  const faceUpAction = (s: S, player: string, id: string) =>
    legalActions(s, player).find((a) => a.type === "activate" && a.source === id && a.label === "Turn face up");
  const downId = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && s.objects[id]?.faceDown) as string;

  it("Aurelia's Vindicator: disguise {X}{3}{W}; turned up, exiles up to X other creatures (return to hand when it leaves)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 8), hand: ["Aurelia's Vindicator"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Llanowar Elves"] },
    });
    s = settle(faceDown(s, "p1", "Aurelia's Vindicator"));
    const angel = downId(s, "p1");
    const a = faceUpAction(s, "p1", angel);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "graveyard", "Llanowar Elves");
    s = act(s, "p1", { type: "activate", source: angel, ability: a?.type === "activate" ? a.ability : -1, x: 1 });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    // X = 1: a single target; the Elves stay in the graveyard.
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toEqual([elves]);
    destroy(s, idOf(s, "p1", "battlefield", "Aurelia's Vindicator"));
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Fugitive Codebreaker: disguise cost reduced by {1} per instant or sorcery in the graveyard; turned up, discard your hand and draw three cards", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 7),
        hand: ["Fugitive Codebreaker", "Opt", "Opt"],
        graveyard: ["Lightning Strike", "Opt"],
        library: lands("Island", 5),
      },
    });
    s = settle(faceDown(s, "p1", "Fugitive Codebreaker"));
    const goblin = downId(s, "p1");
    const a = faceUpAction(s, "p1", goblin);
    s = settle(act(s, "p1", { type: "activate", source: goblin, ability: a?.type === "activate" ? a.ability : -1 }));
    // {3} to cast it face down, then {5}{R} - 2 = {3}{R}: seven tapped Mountains.
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(7);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(3);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island", "Island", "Island"]);
  });

  it("Goblin Maskmaker: when attacking, your face-down spells cost {1} less this turn", () => {
    let s = scenario({ p1: { battlefield: ["Goblin Maskmaker", ...lands("Mountain", 2)], hand: ["Fugitive Codebreaker"] } });
    const card = idOf(s, "p1", "hand", "Fugitive Codebreaker");
    const faceDownOption = (x: S) => legalActions(x, "p1").some((a) => a.type === "cast" && a.card === card && a.faceDown);
    expect(faceDownOption(s)).toBe(false);
    const maskmaker = idOf(s, "p1", "battlefield", "Goblin Maskmaker");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: maskmaker, defender: "p2" }] });
    s = settle(s);
    expect(faceDownOption(s)).toBe(false); // sorcery: not during combat
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    expect(faceDownOption(s)).toBe(true);
  });

  it("Karlov Watchdog: during your turn, opposing permanents can't be turned face up", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Karlov Watchdog"] },
      p2: { battlefield: lands("Mountain", 9), hand: ["Fugitive Codebreaker"] },
    });
    s = settle(faceDown(s, "p2", "Fugitive Codebreaker"));
    const goblin = downId(s, "p2");
    // During the opponent's turn (p2), it can turn it up.
    expect(faceUpAction(s, "p2", goblin)).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.player === "p1");
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(faceUpAction(s, "p2", goblin)).toBeUndefined();
  });

  it("Branch of Vitu-Ghazi: a land cast face down; turned up, two mana of one color kept until end of turn", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Branch of Vitu-Ghazi"] } });
    s = settle(faceDown(s, "p1", "Branch of Vitu-Ghazi"));
    const branch = downId(s, "p1");
    expect(chars(s, branch).power).toBe(2);
    const a = faceUpAction(s, "p1", branch);
    s = act(s, "p1", { type: "activate", source: branch, ability: a?.type === "activate" ? a.ability : -1 });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
    expect(chars(s, branch).types).toContain("Land");
    expect(s.players.p1?.manaPool.G).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat");
    expect(s.players.p1?.manaPool.G).toBe(2);
  });

  it("Tunnel Tipster: at your end step, if a face-down creature entered under your control this turn, a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Tunnel Tipster", ...lands("Mountain", 3)], hand: ["Fugitive Codebreaker"] } });
    const mole = idOf(s, "p1", "battlefield", "Tunnel Tipster");
    s = settle(faceDown(s, "p1", "Fugitive Codebreaker"));
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[mole]?.counters["+1/+1"]).toBe(1);
    // p1's next turn without a face-down creature: no extra counter.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[mole]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Murders at Karlov Manor, lot B3: cloak (701.58)", () => {
  /** Puts a card from the player's hand face down (cloak). */
  const cloakFromHand = (s: S, player: string, name: string) =>
    putFaceDown(s, player, idOf(s, player, "hand", name), true) as string;
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Cryptic Coat: the top card cloaked, equipped (+1/+0, can't be blocked); {1}{U}: to hand", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Cryptic Coat"], library: ["Bear Cub", "Island"] } });
    s = settle(cast(s, "p1", "Cryptic Coat"));
    const cloaked = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(cloaked).toBeDefined();
    expect(chars(s, cloaked).power).toBe(3);
    expect(chars(s, cloaked).keywords).toEqual(expect.arrayContaining(["unblockable", "ward"]));
    const coat = idOf(s, "p1", "battlefield", "Cryptic Coat");
    expect(s.objects[coat]?.attachedTo).toBe(cloaked);
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === coat);
    s = settle(act(s, "p1", { type: "activate", source: coat, ability: a?.type === "activate" ? a.ability : -1 }));
    expect(idsOf(s, "p1", "hand", "Cryptic Coat")).toHaveLength(1);
  });

  it("Expose the Culprit: turns a creature face up; exiles your disguise creatures and cloaks them", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Fugitive Codebreaker"], hand: ["Expose the Culprit", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Expose the Culprit");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Exile your face-up creatures")) : undefined;
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index }));
    expect(idsOf(s, "p1", "battlefield", "Fugitive Codebreaker")).toHaveLength(0);
    const down = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(s.defs[s.objects[down]?.faceDown?.card ?? ""]?.name).toBe("Fugitive Codebreaker");
    // Mode 1: turn a face-down creature face up (a cloaked Bear).
    let t = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Expose the Culprit", "Bear Cub"] } });
    const bear = cloakFromHand(t, "p1", "Bear Cub");
    const card2 = idOf(t, "p1", "hand", "Expose the Culprit");
    const opt2 = legalActions(t, "p1").find((x) => x.type === "cast" && x.card === card2);
    const mode2 = opt2?.type === "cast" ? opt2.modes.find((m) => m.label === "Turn a face-down creature face up") : undefined;
    t = settle(act(t, "p1", { type: "cast", card: card2, mode: mode2?.index, targets: { a: [bear] } }));
    expect(t.objects[bear]?.faceDown).toBeUndefined();
    expect(chars(t, bear).name).toBe("Bear Cub");
  });

  it("Yarus: a face-down creature that dies returns face down under its owner's control, then is turned face up", () => {
    let s = scenario({
      p1: { battlefield: ["Yarus, Roar of the Old Gods", ...lands("Mountain", 2)], hand: ["Bear Cub", "Lightning Strike"] },
    });
    const down = cloakFromHand(s, "p1", "Bear Cub");
    s = settle(cast(s, "p1", "Lightning Strike", { t: [down] }));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.faceDown).toBeUndefined();
    expect(chars(s, bear).name).toBe("Bear Cub");
  });

  it('Etrata: your face-down creatures have "{2}{U}{B}: turn it face up; if you can\'t, exile it and cast it for free"', () => {
    let s = scenario({
      p1: {
        battlefield: ["Etrata, Deadly Fugitive", ...lands("Island", 2), ...lands("Swamp", 2)],
        hand: ["Opt"],
        library: lands("Island", 3),
      },
    });
    const down = cloakFromHand(s, "p1", "Opt");
    const a = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === down && (x.label ?? "").startsWith("Turn it face up"),
    );
    expect(a).toBeDefined();
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: down, ability: a?.type === "activate" ? a.ability : -1 });
    for (let i = 0; i < 40 && (s.stack.length || s.triggers.length || s.pending?.kind === "choice"); i++) {
      const p = s.pending;
      if (p?.kind === "priority" && p.castNow) s = act(s, p.player, { type: "cast", card: p.castNow.cards[0] as string });
      else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
    }
    // Opt (instant) can't be turned face up: exiled, cast for free (scry 1, draw a card).
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Vannifar: at the beginning of your combat, cloak a card from your hand", () => {
    let s = scenario({ p1: { battlefield: ["Vannifar, Evolved Enigma"], hand: ["Shivan Dragon"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    const p = s.pending;
    if (p?.kind === "choice")
      s = act(s, "p1", { type: "choose", values: [p.request.type === "pick" ? (p.request.options[0] as string) : 0] });
    s = settle(s);
    const down = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(s.defs[s.objects[down]?.faceDown?.card ?? ""]?.name).toBe("Shivan Dragon");
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Lazav: when attacking, exiles a card from a graveyard and investigates; a sacrificed Clue: it may become a copy of a creature exiled with it", () => {
    let s = scenario({
      p1: { battlefield: ["Lazav, Wearer of Faces", ...lands("Island", 2)] },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const lazav = idOf(s, "p1", "battlefield", "Lazav, Wearer of Faces");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: lazav, defender: "p2" }] });
    s = settle(s);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === clue);
    s = settle(act(s, "p1", { type: "activate", source: clue, ability: a?.type === "activate" ? a.ability : -1 }), yes);
    expect(chars(s, lazav).name).toBe("Shivan Dragon");
  });
});

describe("Murders at Karlov Manor, lot B4: suspect and Cases", () => {
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  it("Airtight Alibi: untaps the creature, hexproof, no longer suspected; +2/+2 and can't become suspected", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3), ...lands("Mountain", 3)],
        hand: ["Airtight Alibi", "Convenient Target"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const b = s.objects[bear];
    if (b) b.suspected = 1;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Airtight Alibi"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.tapped).toBe(false);
    expect(s.objects[bear]?.suspected).toBeUndefined();
    expect(chars(s, bear).keywords).toContain("hexproof");
    expect(chars(s, bear).power).toBe(4);
    // Convenient Target: "suspect the enchanted creature" does nothing.
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Convenient Target"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.suspected).toBeUndefined();
  });

  it("Case File Auditor: when it enters, an enchantment among six cards; mana of any color for Case spells", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 5),
        hand: ["Case File Auditor"],
        library: ["Opt", "Case of the Gateway Express", "Bear Cub", "Opt", "Opt", "Opt", "Island"],
      },
    });
    // {2}{W} paid with Islands: impossible, it isn't a Case.
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Case File Auditor"))).toHaveLength(0);
    s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), "Plains"],
        hand: ["Case File Auditor"],
        library: ["Opt", "Case of the Gateway Express", "Bear Cub", "Opt", "Opt", "Opt", "Island"],
      },
    });
    s = settle(cast(s, "p1", "Case File Auditor"));
    const casePick = idOf(s, "p1", "hand", "Case of the Gateway Express");
    expect(casePick).toBeDefined();
    // {1}{W} with two Islands: the Case can be cast.
    expect(castOptions(s, "p1", casePick)).not.toHaveLength(0);
  });

  it("Case of the Gateway Express: each of your creatures deals 1 damage; solved after three attackers, your creatures +1/+0", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves", ...lands("Plains", 2)],
        hand: ["Case of the Gateway Express"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Case of the Gateway Express", { t: [angel] }));
    expect(s.objects[angel]?.damage).toBe(3);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    s = act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    const theCase = idOf(s, "p1", "battlefield", "Case of the Gateway Express");
    expect(s.objects[theCase]?.solved).toBe(true);
    expect(chars(s, attackers[0] as string).power).toBe(3);
  });

  it("Case of the Burning Masks: 3 damage when it enters; solved if three of your sources dealt damage this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 7)], hand: ["Case of the Burning Masks", "Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Case of the Burning Masks", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] } }));
    s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: ["p2"] } }));
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Case of the Burning Masks")]?.solved).toBe(true);
  });
});

describe("Murders at Karlov Manor, lot C1: blocking requirements (509.1c)", () => {
  const toBlockers = (s: S, attackers: string[]) => {
    let c = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    c = act(c, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(c, (x) => x.pending?.kind === "declareBlockers");
  };

  it("Culvert Ambusher: the target creature blocks this turn if able", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 5)], hand: ["Culvert Ambusher"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Culvert Ambusher", undefined), (req) =>
      req.type === "pick" && req.options.includes(elves) ? [elves] : undefined,
    );
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const b = toBlockers(s, [bear]);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [] })).toThrow(RulesError);
    expect(requiredBlocks(b, "p2")).toEqual([{ blocker: elves, attacker: bear }]);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: bear }] })).not.toThrow();
  });

  it("Hustle: the target creature attacks or blocks this turn if able", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Island"], hand: ["Hustle // Bustle"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const card = idOf(s, "p1", "hand", "Hustle // Bustle");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceName === "Hustle");
    s = settle(act(s, "p1", { type: "cast", card, face: opt?.type === "cast" ? opt.face : undefined, targets: { t: [bear] } }));
    expect(chars(s, bear).keywords).toContain("mustAttack");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(RulesError);
  });

  it("Tolsimir: Voja Fenstalker when it enters; a Wolf that attacks with Tolsimir must be blocked by the target creature if able", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3).concat(lands("Forest", 2)), hand: ["Tolsimir, Midnight's Light"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Tolsimir, Midnight's Light"));
    const voja = idOf(s, "p1", "battlefield", "Voja Fenstalker");
    expect(chars(s, voja).supertypes).toContain("Legendary");
    const tolsimir = idOf(s, "p1", "battlefield", "Tolsimir, Midnight's Light");
    // Summoning sickness: p1's next turn.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const b = toBlockers(s, [tolsimir, voja]);
    // Blocking Tolsimir rather than the Wolf doesn't satisfy the requirement.
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: tolsimir }] })).toThrow(RulesError);
    expect(() => act(b, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: voja }] })).not.toThrow();
  });
});

describe("Murders at Karlov Manor, lot C2: amounts and costs", () => {
  const clues = (s: S, p: string) => idsOf(s, p, "battlefield", "Clue").length;

  it("No Witnesses: each player who controls the most creatures investigates, then all creatures are destroyed", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["No Witnesses"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "No Witnesses"));
    expect(clues(s, "p2")).toBe(1);
    expect(clues(s, "p1")).toBe(0);
    expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
  });

  it("Wojek Investigator: at your upkeep, a Clue for each opponent who has more cards in hand than you", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: { battlefield: ["Wojek Investigator"], hand: [] },
      p2: { hand: ["Opt", "Opt", "Opt"] },
    });
    s = advanceUntil(s, (x) => x.turn.number === 3 && x.turn.step === "draw");
    expect(clues(s, "p1")).toBe(1);
  });

  it("Ill-Timed Explosion: draw two cards, discard two: X damage to each creature (X: greatest MV discarded)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Mountain", 2), "Serra Angel"],
        hand: ["Ill-Timed Explosion"],
        library: ["Shivan Dragon", "Opt"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Ill-Timed Explosion"), (req) =>
      req.type === "pick" && req.intent === "discard" ? req.options.slice(0, 2) : undefined,
    );
    // Shivan Dragon (MV 6) discarded: 6 damage, the Angel (4/4) and the Bear die.
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it('Ill-Timed Explosion: "when you do" is a reflexive ability; two cards or none', () => {
    const base = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 2)],
          hand: ["Ill-Timed Explosion", "Opt"],
          library: ["Shivan Dragon", "Forest"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
    // The discard happens during the spell's resolution; the damage, by a reflexive ability put on the
    // stack afterwards (it can be responded to), with no target.
    let s = base();
    let discardAsked: ChoiceRequest | undefined;
    s = cast(s, "p1", "Ill-Timed Explosion");
    for (let i = 0; i < 20 && !(s.stack.length === 1 && s.stack[0]?.kind === "ability"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        const req = p.request;
        if (req.type === "pick" && req.intent === "discard") {
          discardAsked = req;
          const dragon = req.options.find((id) => nameOf(s, String(id)) === "Shivan Dragon");
          const forest = req.options.find((id) => nameOf(s, String(id)) === "Forest");
          s = act(s, p.player, { type: "choose", values: [dragon ?? "", forest ?? ""] });
        } else s = act(s, p.player, { type: "choose", values: req.suggested });
      } else break;
    }
    // Exactly two cards, with no possibility of discarding just one.
    expect(discardAsked?.type === "pick" && [discardAsked.min, discardAsked.max]).toEqual([2, 2]);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]?.kind).toBe("ability");
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    // Shivan Dragon leaves the graveyard before resolution (PLAN-D, D8): X remains that of the discarded cards.
    moveObject(s, idOf(s, "p1", "graveyard", "Shivan Dragon"), "exile");
    s = settle(s);
    // Shivan Dragon (MV 6) among the discarded cards: 6 damage to each creature.
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);

    // Decline: nothing is discarded, no damage.
    s = settle(cast(base(), "p1", "Ill-Timed Explosion"), (req) => (req.intent === "may" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Officious Interrogation: {W}{U} more per target beyond the first; a Clue for each creature of the targeted players", () => {
    const base = {
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Island", 2)], hand: ["Officious Interrogation"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    };
    let s = scenario(base);
    s = settle(cast(s, "p1", "Officious Interrogation", { p: ["p1", "p2"] }));
    expect(clues(s, "p1")).toBe(3);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    // Two targets with only {W}{U}: impossible.
    const t = scenario({ ...base, p1: { ...base.p1, battlefield: ["Bear Cub", "Plains", "Island"] } });
    expect(() => cast(t, "p1", "Officious Interrogation", { p: ["p1", "p2"] })).toThrow(RulesError);
  });

  it("Demand Answers: as an additional cost, sacrifice an artifact or discard a card; draw two cards", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Demand Answers"], library: lands("Mountain", 3) },
    });
    // With no card in hand nor artifact: impossible (the Bear isn't an artifact).
    expect(() => cast(s, "p1", "Demand Answers")).toThrow(RulesError);
    s = scenario({
      p1: { battlefield: [...lands("Mountain", 2)], hand: ["Demand Answers", "Opt"], library: lands("Mountain", 3) },
    });
    s = settle(cast(s, "p1", "Demand Answers", undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Treacherous Greed: sacrifice a creature that dealt damage this turn; draw three cards, drain 3", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2), "Swamp"],
        hand: ["Treacherous Greed"],
        library: lands("Plains", 4),
      },
    });
    const card = idOf(s, "p1", "hand", "Treacherous Greed");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card)).toBe(false);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.player === "p1");
    s = settle(act(s, "p1", { type: "cast", card, sacrifice: [bear] }));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Urgent Necropsy: collect evidence X (total MV of the targets); destroys up to one artifact, creature, enchantment, planeswalker", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Urgent Necropsy"], graveyard: ["Shivan Dragon"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Urgent Necropsy", { a: [], c: [angel], e: [], w: [] }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    // MV 5 without enough evidence: impossible.
    const t = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Urgent Necropsy"], graveyard: ["Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() =>
      cast(t, "p1", "Urgent Necropsy", { a: [], c: [idOf(t, "p2", "battlefield", "Serra Angel")], e: [], w: [] }),
    ).toThrow(RulesError);
  });

  it("Urgent Necropsy: the player chooses the evidence, total mana value at least the targets' (PLAN-M M6)", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)],
          hand: ["Urgent Necropsy"],
          graveyard: ["Shivan Dragon", "Serra Angel", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = start();
    const offer = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Urgent Necropsy");
    const pick = offer?.type === "cast" ? offer.picks?.find((p) => p.slot === "evidence") : undefined;
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(pick?.minTotal?.fromTargets?.[angel]).toBe(5);
    // The engine would exile the Serra Angel (5, enough on its own); the player exiles the Shivan Dragon.
    const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
    s = settle(cast(s, "p1", "Urgent Necropsy", { a: [], c: [angel], e: [], w: [] }, { picks: { evidence: [dragon] } }));
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    // Not enough (Opt, 1): refused.
    const t = start();
    expect(() =>
      cast(
        t,
        "p1",
        "Urgent Necropsy",
        { a: [], c: [idOf(t, "p2", "battlefield", "Serra Angel")], e: [], w: [] },
        { picks: { evidence: [idOf(t, "p1", "graveyard", "Opt")] } },
      ),
    ).toThrow(RulesError);
  });

  it("Niv-Mizzet, Guildpact: X = different color pairs among your exactly two-colored permanents", () => {
    const t = scenario({ p1: { battlefield: ["Tin Street Gossip", "Agrus Kos, Spirit of Justice", "Bear Cub"] } });
    const ctx = {
      controller: "p1",
      sourceId: "",
      sourceDefId: "",
      sourceSnapshot: { keywords: [], power: 0 },
      targets: {},
      x: 0,
      kicked: false,
    };
    // R/G (Tin Street Gossip) and R/W (Agrus Kos): two pairs.
    expect(evalAmount(t, ctx as never, dsl.amount.colorPairsAmong({ permanent: true, controller: "you" }))).toBe(2);
  });

  it("Aurelia, the Law Above: a player (even an opponent) attacks with three or more creatures: you draw", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: { battlefield: ["Aurelia, the Law Above"], library: lands("Plains", 3) },
      p2: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p2");
    s = act(s, "p2", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p1" })) });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Tin Street Gossip: {R}{G} only for casting face-down spells", () => {
    let s = scenario({ p1: { battlefield: ["Tin Street Gossip", "Mountain"], hand: ["Fugitive Codebreaker", "Bear Cub"] } });
    const gossip = idOf(s, "p1", "battlefield", "Tin Street Gossip");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === gossip);
    // A mana ability (605.1a): resolved at once, no question for a single color.
    s = act(s, "p1", { type: "activate", source: gossip, ability: a?.type === "activate" ? a.ability : -1 });
    // Bear Cub ({1}{G}): no (restricted mana); Fugitive Codebreaker face down ({3}): yes.
    expect(legalActions(s, "p1").some((x) => x.type === "cast" && x.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    expect(
      legalActions(s, "p1").some(
        (x) => x.type === "cast" && x.card === idOf(s, "p1", "hand", "Fugitive Codebreaker") && x.faceDown,
      ),
    ).toBe(true);
  });
});

describe("Murders at Karlov Manor, lot C3: unique cards", () => {
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const activateLabel = (s: S, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
    return act(s, "p1", { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Plays the resolution by casting each card offered by a "cast now". */
  const castAll = (s: S, targets?: Record<string, string[]>) => {
    let cur = s;
    for (let i = 0; i < 60 && (cur.stack.length || cur.triggers.length || cur.pending?.kind === "choice"); i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && p.castNow)
        cur = act(cur, p.player, { type: "cast", card: p.castNow.cards[0] as string, ...(targets ? { targets } : {}) });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else break;
    }
    return cur;
  };

  it("Conspiracy Unraveler: collect evidence 10 rather than pay the mana cost of your spells", () => {
    let s = scenario({
      p1: { battlefield: ["Conspiracy Unraveler"], hand: ["Bear Cub"], graveyard: ["Shivan Dragon", "Serra Angel"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub"), alternative: true }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Intrude on the Mind: two revealed piles; a 0/0 Thopter with a counter per card put into the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 5),
        hand: ["Intrude on the Mind"],
        library: ["Opt", "Opt", "Bear Cub", "Island", "Shivan Dragon"],
      },
    });
    s = settle(cast(s, "p1", "Intrude on the Mind"), (req) =>
      req.type === "pick" && req.intent === "piles" && req.options.length === 5 ? req.options.slice(0, 2) : undefined,
    );
    const thopter = idOf(s, "p1", "battlefield", "Thopter");
    const toGraveyard = s.players.p1?.graveyard.filter((id) => nameOf(s, id) !== "Intrude on the Mind").length ?? 0;
    expect(toGraveyard).toBeGreaterThan(0);
    expect(s.objects[thopter]?.counters["+1/+1"]).toBe(toGraveyard);
  });

  it("Intrude on the Mind (three players): you choose the opponent who chooses the pile", () => {
    let s = scenario({
      players: 3,
      p1: {
        battlefield: lands("Island", 5),
        hand: ["Intrude on the Mind"],
        library: ["Opt", "Opt", "Bear Cub", "Island", "Shivan Dragon"],
      },
    });
    const offered: string[][] = [];
    let chooser: string | undefined;
    s = settle(cast(s, "p1", "Intrude on the Mind"), (req, p) => {
      if (req.type === "pick" && req.options.includes("p3")) {
        offered.push([p, ...req.options]);
        return ["p3"];
      }
      if (req.type === "pick" && req.intent === "piles" && req.options.length === 5) return req.options.slice(0, 2);
      if (req.type === "pick" && req.intent === "piles") {
        chooser = p;
        return ["down"];
      }
      return undefined;
    });
    expect(offered).toEqual([["p1", "p2", "p3"]]);
    expect(chooser).toBe("p3");
    // The first pile (two cards) to hand, the other three to the graveyard: a Thopter with three counters.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Thopter")]?.counters["+1/+1"]).toBe(3);
  });

  it("Hedge Whisperer: a land becomes a 5/5 Boar while it stays tapped; it may stay tapped", () => {
    let s = scenario({ p1: { battlefield: ["Hedge Whisperer", ...lands("Forest", 5)], graveyard: ["Shivan Dragon"] } });
    const whisperer = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    const land = idOf(s, "p1", "battlefield", "Forest");
    s = settle(activateLabel(s, whisperer, "Boar", { targets: { t: [land] } }));
    expect(chars(s, land).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(chars(s, land).power).toBe(5);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(s.objects[whisperer]?.tapped).toBe(true);
    expect(chars(s, land).power).toBe(5);
  });

  it("A Killer Among Us: three tokens, a type chosen in secret; sacrificed, an attacking token of the chosen type grows", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["A Killer Among Us"] } });
    s = settle(cast(s, "p1", "A Killer Among Us"), (req) =>
      req.type === "pick" && req.options.includes("Goblin") ? ["Goblin"] : undefined,
    );
    const killer = idOf(s, "p1", "battlefield", "A Killer Among Us");
    expect(s.objects[killer]?.chosen?.creatureType).toBe("Goblin");
    // Secret choice: the opponent doesn't see it.
    expect(projectView(s, "p2").battlefield.find((o) => o.id === killer)?.chosen).toBeNull();
    expect(projectView(s, "p1").battlefield.find((o) => o.id === killer)?.chosen?.creatureType).toBe("Goblin");
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.pending?.kind === "declareAttackers");
    const goblin = idOf(s, "p1", "battlefield", "Goblin");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: goblin, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "declareAttackers" && x.pending?.kind === "priority" && x.pending.player === "p1");
    s = settle(activateLabel(s, killer, "Sacrifice it", { targets: { t: [goblin] } }));
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, goblin).keywords).toContain("deathtouch");
  });

  it("Kylox's Voltstrider: collect evidence 6 (tied to it); when attacking, cast an instant among them, then on the bottom of the library", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kylox's Voltstrider", ...lands("Mountain", 2)],
        graveyard: ["Lightning Strike", "Lightning Strike", "Lightning Strike"],
      },
    });
    const vehicle = idOf(s, "p1", "battlefield", "Kylox's Voltstrider");
    s = settle(activateLabel(s, vehicle, "Collect evidence 6"));
    expect(chars(s, vehicle).types).toContain("Creature");
    expect(s.objects[vehicle]?.linked).toHaveLength(3);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: vehicle, defender: "p2" }] });
    s = castAll(s, { t: ["p2"] });
    expect(s.players.p2?.life).toBe(17);
    expect(nameOf(s, s.players.p1?.library.at(-1) as string)).toBe("Lightning Strike");
  });

  it("Judith: a cast instant gains deathtouch and lifelink (mode chosen)", () => {
    let s = scenario({
      p1: { battlefield: ["Judith, Carnage Connoisseur", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [req.options[0] as string] : undefined,
    );
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Kaya, Spirits' Justice: one of your creatures exiled: a token you control becomes a copy of it, with flying", () => {
    let s = scenario({ p1: { battlefield: ["Kaya, Spirits' Justice", "Bear Cub"] } });
    createTokens(s, "p1", SPIRIT_WB, 1);
    const kaya = idOf(s, "p1", "battlefield", "Kaya, Spirits' Justice");
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activateLabel(s, kaya, "Exile a creature of yours", { targets: { a: [bear], b: [] } }), yes);
    expect(chars(s, spirit).name).toBe("Bear Cub");
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Kaya, Spirits' Justice: a creature and a creature card from the graveyard exiled together: a single trigger, you choose the card among them", () => {
    let s = scenario({ p1: { battlefield: ["Kaya, Spirits' Justice", "Bear Cub"], graveyard: ["Shivan Dragon", "Opt"] } });
    createTokens(s, "p1", SPIRIT_WB, 1);
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    // A single batch: the creature from the battlefield, a creature card and an instant from the graveyard.
    moveObject(s, idOf(s, "p1", "battlefield", "Bear Cub"), "exile");
    moveObject(s, idOf(s, "p1", "graveyard", "Shivan Dragon"), "exile");
    moveObject(s, idOf(s, "p1", "graveyard", "Opt"), "exile");
    expect(s.triggers).toHaveLength(1);
    let options: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || !cur) return undefined;
      options = (req.options as string[]).map((id) => nameOf(cur, id) ?? "").sort();
      return pickNamed(cur, req, "Shivan Dragon");
    });
    expect(options).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(chars(s, spirit).name).toBe("Shivan Dragon");
    expect(chars(s, spirit).keywords).toContain("flying");
    // "You may": with no choice, the token stays itself.
    let t = scenario({ p1: { battlefield: ["Kaya, Spirits' Justice"], graveyard: ["Shivan Dragon"] } });
    createTokens(t, "p1", SPIRIT_WB, 1);
    moveObject(t, idOf(t, "p1", "graveyard", "Shivan Dragon"), "exile");
    t = settle(t, (req) => (req.type === "pick" ? [] : undefined));
    expect(chars(t, idOf(t, "p1", "battlefield", "Spirit")).name).toBe("Spirit");
    // An opponent's creature exiled triggers nothing.
    const u = scenario({ p1: { battlefield: ["Kaya, Spirits' Justice"] }, p2: { battlefield: ["Bear Cub"] } });
    moveObject(u, idOf(u, "p2", "battlefield", "Bear Cub"), "exile");
    expect(u.triggers).toHaveLength(0);
  });

  it("Kylox, Visionary Inventor: sacrifice other creatures, exile X cards (their total power), cast the instants among them for free", () => {
    let s = scenario({
      p1: { battlefield: ["Kylox, Visionary Inventor", "Bear Cub"], library: ["Lightning Strike", "Island", "Opt"] },
    });
    const kylox = idOf(s, "p1", "battlefield", "Kylox, Visionary Inventor");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: kylox, defender: "p2" }] });
    s = castAll(s, { t: ["p2"] });
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    // Power 2: Lightning Strike and Island exiled; Strike cast for free.
    expect(s.players.p2?.life).toBe(17);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Opt");
  });

  it("Flotsam // Jetsam: mill three cards and investigate; each opponent mills three cards, cast a spell from them for free (exiled afterwards)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Island", "Island", "Island"] },
    });
    s = settle(cast(s, "p1", "Flotsam // Jetsam", undefined, { face: 0 }));
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(4);
    let t = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Island", "Island", "Island"] },
    });
    const hand = (t.players.p1?.hand.length ?? 0) - 1;
    t = castAll(cast(t, "p1", "Flotsam // Jetsam", undefined, { face: 1 }));
    // The opponent's Opt cast for free (you draw), then exiled.
    expect(t.exile.some((id) => nameOf(t, id) === "Opt")).toBe(true);
    expect(t.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Jetsam with several opponents: a spell cast for free from each opponent's graveyard (PLAN-H, H2)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Island", "Island", "Island"] },
      p3: { library: ["Opt", "Island", "Island", "Island"] },
    });
    const hand = (s.players.p1?.hand.length ?? 0) - 1;
    s = castAll(cast(s, "p1", "Flotsam // Jetsam", undefined, { face: 1 }));
    // Both Opts (one per graveyard) are cast, then exiled; you draw two cards.
    expect(s.exile.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(2);
    expect(s.players.p1?.hand).toHaveLength(hand + 2);
  });

  it("Jetsam: a single spell per opposing graveyard, even if it holds several (PLAN-H, H2)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Flotsam // Jetsam"], library: lands("Island", 6) },
      p2: { library: ["Opt", "Opt", "Opt", "Island"] },
    });
    const hand = (s.players.p1?.hand.length ?? 0) - 1;
    s = castAll(cast(s, "p1", "Flotsam // Jetsam", undefined, { face: 1 }));
    expect(s.exile.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(2);
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
  });

  it("Kaya, Spirits' Justice (-2) with several players: up to one target creature of each other player (PLAN-H, H2)", () => {
    const setup = () =>
      scenario({
        players: 3,
        p1: { battlefield: [{ name: "Kaya, Spirits' Justice", counters: { loyalty: 5 } }, "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
        p3: { battlefield: ["Shivan Dragon"] },
      });
    const minus = (s: S) => {
      const kaya = idOf(s, "p1", "battlefield", "Kaya, Spirits' Justice");
      const a = legalActions(s, "p1").find(
        (x) => x.type === "activate" && x.source === kaya && /each opponent/.test(x.label ?? ""),
      );
      return { kaya, ability: a?.type === "activate" ? a.ability : -1 };
    };
    let s = setup();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const dragon = idOf(s, "p3", "battlefield", "Shivan Dragon");
    const { kaya, ability } = minus(s);
    // Two creatures of the same opponent: refused.
    expect(() => act(s, "p1", { type: "activate", source: kaya, ability, targets: { a: [bear], b: [angel, elves] } })).toThrow(
      RulesError,
    );
    s = settle(act(s, "p1", { type: "activate", source: kaya, ability, targets: { a: [bear], b: [angel, dragon] } }));
    expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel", "Shivan Dragon"]);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Krenko's Buzzcrusher with several players: one nonbasic land per player, chosen without targeting it (PLAN-H, H2)", () => {
    let s = scenario({
      players: 3,
      p1: {
        battlefield: [...lands("Mountain", 4), "Thundering Falls"],
        hand: ["Krenko's Buzzcrusher"],
        library: lands("Mountain", 3),
      },
      p2: { battlefield: ["Thundering Falls", "Thundering Falls"], library: ["Island", "Opt"] },
      p3: { battlefield: ["Thundering Falls"], library: ["Island", "Opt"] },
    });
    const mine = idOf(s, "p1", "battlefield", "Thundering Falls");
    const both = idsOf(s, "p2", "battlefield", "Thundering Falls");
    const theirs = both[0] as string;
    const third = idOf(s, "p3", "battlefield", "Thundering Falls");
    const prompts: string[][] = [];
    const mineAsked: ChoiceValue[][] = [];
    s = settle(cast(s, "p1", "Krenko's Buzzcrusher"), (req) => {
      if (req.type !== "pick") return undefined;
      // Your own lands: a yes / no question, "No" suggested; you keep your land.
      if (req.intent === "other") {
        mineAsked.push(req.suggested);
        return ["0"];
      }
      if (req.intent === "pickCards") {
        prompts.push(req.options.map(String));
        expect(req.options).not.toContain(mine);
        // A land of each opponent, suggested automatically.
        expect(req.suggested).toEqual(req.options.slice(0, 1));
        return req.options.filter((id) => id === theirs || id === third);
      }
      return req.options.filter((id) => nameOf(s, String(id)) === "Island").slice(0, 1);
    });
    expect(mineAsked).toEqual([["0"]]);
    // One question per opponent who controls a nonbasic land; the choices aren't targets (nothing on the stack).
    expect(prompts).toEqual([both, [third]]);
    expect(idsOf(s, "p1", "battlefield", "Thundering Falls")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Thundering Falls")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Thundering Falls")).toHaveLength(1);
    expect(idsOf(s, "p3", "graveyard", "Thundering Falls")).toHaveLength(1);
    // Each controller of a destroyed land searches for a basic land, which enters tapped.
    expect(s.objects[idOf(s, "p2", "battlefield", "Island")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p3", "battlefield", "Island")]?.tapped).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(4);
  });

  it("Buried in the Garden: exiles an opposing permanent until it leaves; the enchanted land produces one more mana", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3).concat(lands("Plains", 1)), hand: ["Buried in the Garden"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Buried in the Garden"), targets: { enchant: [forest] } }),
      (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined),
    );
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    // One spell later: the enchanted land (untapped next turn) produces two mana.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    const forestNow = s.battlefield.find(
      (id) => nameOf(s, id) === "Forest" && s.battlefield.some((a) => s.objects[a]?.attachedTo === id),
    ) as string;
    const m = legalActions(s, "p1").find((x) => x.type === "tapForMana" && x.source === forestNow);
    s = act(s, "p1", { type: "tapForMana", source: forestNow, ability: m?.type === "tapForMana" ? m.ability : 0, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(2);
    destroy(s, idOf(s, "p1", "battlefield", "Buried in the Garden"));
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Murders at Karlov Manor: legal promotions in Standard (PLAN-C, lot C19)", () => {
  it("Melek, Reforged Researcher: P/T equal to twice the instants and sorceries in the graveyard; the first of the turn costs {3} less", () => {
    let s = scenario({
      p1: {
        battlefield: ["Melek, Reforged Researcher", "Island"],
        graveyard: ["Opt", "Lightning Strike", "Bear Cub"],
        hand: ["Quick Study", "Quick Study"],
        library: ["Opt", "Opt", "Opt", "Opt"],
      },
    });
    const melek = idOf(s, "p1", "battlefield", "Melek, Reforged Researcher");
    expect([chars(s, melek).power, chars(s, melek).toughness]).toEqual([4, 4]);
    // Quick Study ({2}{U}): {3} less (generic only), it costs {U}.
    const [first, second] = idsOf(s, "p1", "hand", "Quick Study") as [string, string];
    expect(castable(s, "p1", first)).toBe(true);
    s = settle(cast(s, "p1", "Quick Study"));
    expect([chars(s, melek).power, chars(s, melek).toughness]).toEqual([6, 6]);
    // The second of the turn pays its full cost: impossible without another land.
    expect(castable(s, "p1", second)).toBe(false);
  });

  it("Tomik, Wielder of Law: affinity for planeswalkers; an opponent who attacks you with two creatures loses 3 life and you draw", () => {
    let s = scenario({
      p1: { battlefield: ["Chandra, Flameshaper", "Plains", "Swamp"], hand: ["Tomik, Wielder of Law"], library: ["Opt"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Tomik, Wielder of Law"))).toBe(true);
    s = settle(cast(s, "p1", "Tomik, Wielder of Law"));
    const tomik = idOf(s, "p1", "battlefield", "Tomik, Wielder of Law");
    expect(chars(s, tomik).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));

    const attack = (attackers: string[]) => {
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Tomik, Wielder of Law"], library: ["Opt", "Opt"] },
        p2: { battlefield: attackers },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p2");
      t = act(t, "p2", {
        type: "declareAttackers",
        attackers: idsOf(t, "p2", "battlefield", attackers[0] as string).map((id) => ({ id, defender: "p1" })),
      });
      return settle(t);
    };
    const two = attack(["Bear Cub", "Bear Cub"]);
    expect(two.players.p2?.life).toBe(17);
    expect(two.players.p1?.hand).toHaveLength(1);
    const one = attack(["Bear Cub"]);
    expect(one.players.p2?.life).toBe(20);
    expect(one.players.p1?.hand).toHaveLength(0);
  });

  it("Voja, Jaws of the Conclave: when attacking, as many +1/+1 counters as Elves on each of your creatures, a card per Wolf", () => {
    let s = scenario({
      p1: { battlefield: ["Voja, Jaws of the Conclave", "Llanowar Elves", "Llanowar Elves"], library: ["Opt", "Opt", "Opt"] },
    });
    const voja = idOf(s, "p1", "battlefield", "Voja, Jaws of the Conclave");
    expect(chars(s, voja).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "ward"]));
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: voja, defender: "p2" }] });
    s = settle(s);
    expect(s.objects[voja]?.counters["+1/+1"]).toBe(2);
    for (const elf of idsOf(s, "p1", "battlefield", "Llanowar Elves")) expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
    // Voja is the only Wolf: one card.
    expect(s.players.p1?.hand).toHaveLength(1);
  });
});

describe("Murders at Karlov Manor, PLAN-D D9: last cards", () => {
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  const activateLabel = (s: S, source: string, label: string) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && (x.label ?? "").includes(label));
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, "p1", { type: "activate", source, ability: a.ability });
  };
  const attackWith = (s: S, ...ids: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };

  it("Izoni, Center of the Web: menace; when it enters or attacks, evidence 4: two 2/1 Spiders; four tokens sacrificed: surveil 2, two cards, 2 life", () => {
    const IZONI = "Izoni, Center of the Web";
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)],
        hand: [IZONI],
        graveyard: ["Shivan Dragon", "Pelakka Wurm"],
        library: ["Forest", "Opt", "Opt", "Island", "Island"],
      },
    });
    s = settle(cast(s, "p1", IZONI), yes);
    const izoni = idOf(s, "p1", "battlefield", IZONI);
    expect([chars(s, izoni).power, chars(s, izoni).toughness]).toEqual([5, 4]);
    expect(chars(s, izoni).keywords).toContain("menace");
    // When it enters: evidence 4 collected, two Spiders. With the suggestion (the cheapest that suffices), a single one of the two
    // cards is exiled.
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.exile).toHaveLength(1);
    const spiders = idsOf(s, "p1", "battlefield", "Spider");
    expect(spiders).toHaveLength(2);
    for (const id of spiders) {
      const c = chars(s, id);
      expect([c.power, c.toughness]).toEqual([2, 1]);
      expect([...c.colors].sort()).toEqual(["B", "G"]);
      expect(c.subtypes).toContain("Spider");
      expect(c.keywords).toEqual(expect.arrayContaining(["reach", "menace"]));
      expect(s.objects[id]?.isToken).toBe(true);
    }
    // Only three tokens (Izoni isn't one): the last ability can't be activated.
    expect(legalActions(s, "p1").some((x) => x.type === "activate" && x.source === izoni)).toBe(false);
    // On the next turn (Forest drawn), when attacking: evidence 4 again (the remaining card), two more Spiders.
    s = settleNoBlocks(attackWith(s, izoni), yes);
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(4);
    expect(s.players.p2?.life).toBe(15);
    // Sacrifice four tokens: surveil 2 (the two Opts in the graveyard), then draw two cards, and 2 life.
    s = settle(activateLabel(s, izoni, "Sacrifice four tokens"), (req) =>
      req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(0);
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).filter((n) => n === "Opt")).toHaveLength(2);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Forest", "Island", "Island"]);
    expect(s.players.p1?.life).toBe(22);

    // "You may": declined, or without enough evidence, no Spiders.
    const run = (graveyard: string[], answer: Answer) => {
      let t = scenario({ p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)], hand: [IZONI], graveyard } });
      t = settle(cast(t, "p1", IZONI), answer);
      return [idsOf(t, "p1", "battlefield", "Spider").length, t.players.p1?.graveyard.length];
    };
    expect(run(["Shivan Dragon"], no)).toEqual([0, 1]);
    expect(run(["Opt", "Bear Cub"], yes)).toEqual([0, 2]);
  });

  it("Evidence Examiner: at the beginning of combat on your turn, you may collect evidence 4; whenever you collect, investigate", () => {
    let s = scenario({
      p1: {
        battlefield: ["Evidence Examiner", ...lands("Island", 4)],
        graveyard: ["Shivan Dragon", "Opt"],
        library: lands("Island", 5),
      },
    });
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    s = settle(s, yes);
    // Shivan Dragon (MV 6) exiled (Opt alone isn't enough; the suggestion keeps Opt); a Clue.
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    const clue = idOf(s, "p1", "battlefield", "Clue");
    expect(chars(s, clue).types).toContain("Artifact");
    // Clue: {2}, sacrifice it: draw a card.
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activateLabel(s, clue, "Draw a card"));
    expect(s.players.p1?.hand).toHaveLength(hand + 1);
    expect(idsOf(s, "p1", "battlefield", "Clue")).toHaveLength(0);

    // The exiled cards are chosen by the player (PLAN-D, D9): Shivan Dragon rather than Serra Angel, suggested; a
    // choice that isn't enough (Opt alone) is completed by the suggestion.
    const pickExile = (names: string[]) => (req: ChoiceRequest, _p: string, cur: GameState) =>
      req.type === "pick" && req.intent === "pickCards"
        ? req.options.filter((id) => names.includes(nameOf(cur, String(id)) ?? ""))
        : req.type === "yesNo"
          ? [1]
          : undefined;
    const examiner = () =>
      advanceUntil(
        scenario({ p1: { battlefield: ["Evidence Examiner"], graveyard: ["Shivan Dragon", "Serra Angel", "Opt"] } }),
        (x) => x.turn.step === "beginCombat" && x.stack.length > 0,
      );
    let c = settle(examiner(), pickExile(["Shivan Dragon"]));
    expect(c.exile.map((id) => nameOf(c, id))).toEqual(["Shivan Dragon"]);
    c = settle(examiner(), pickExile(["Opt"]));
    expect(c.exile.map((id) => nameOf(c, id)).sort()).toEqual(["Opt", "Serra Angel"]);

    // Declined: nothing is exiled, no Clue.
    let r = scenario({ p1: { battlefield: ["Evidence Examiner"], graveyard: ["Shivan Dragon"] } });
    r = advanceUntil(r, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    r = settle(r, no);
    expect(r.players.p1?.graveyard).toHaveLength(1);
    expect(idsOf(r, "p1", "battlefield", "Clue")).toHaveLength(0);

    // At the opponent's combat: no trigger.
    let t = scenario({ active: "p2", p1: { battlefield: ["Evidence Examiner"], graveyard: ["Shivan Dragon"] } });
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main2");
    expect(t.players.p1?.graveyard).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Clue")).toHaveLength(0);

    // Evidence collected by another effect (Surveillance Monitor): investigate too.
    let u = scenario({
      p1: {
        battlefield: ["Evidence Examiner", ...lands("Island", 4)],
        hand: ["Surveillance Monitor"],
        graveyard: ["Shivan Dragon"],
      },
    });
    u = settle(cast(u, "p1", "Surveillance Monitor"), yes);
    expect(idsOf(u, "p1", "battlefield", "Thopter")).toHaveLength(1);
    expect(idsOf(u, "p1", "battlefield", "Clue")).toHaveLength(1);
  });

  it("Sample Collector: when attacking, you may collect evidence 3; if you do, a +1/+1 counter on a target creature you control", () => {
    const run = (graveyard: string[], answer: Answer) => {
      let s = scenario({
        p1: { battlefield: ["Sample Collector", "Bear Cub"], graveyard },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const collector = idOf(s, "p1", "battlefield", "Sample Collector");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      let options: string[] = [];
      s = settleNoBlocks(attackWith(s, collector), (req, player, cur) => {
        if (req.type === "pick" && req.options.includes(bear)) {
          options = req.options.map(String);
          return [bear];
        }
        return answer(req, player, cur);
      });
      return { s, bear, elves, collector, options };
    };
    // Opt (1) + Bear Cub (2) = 3: evidence collected, counter on the Bear Cub.
    const a = run(["Opt", "Bear Cub"], yes);
    expect(a.s.players.p1?.graveyard).toHaveLength(0);
    expect(a.s.objects[a.bear]?.counters["+1/+1"]).toBe(1);
    // Only a creature you control.
    expect(a.options).toEqual(expect.arrayContaining([a.bear, a.collector]));
    expect(a.options).not.toContain(a.elves);
    // Declined, or total MV 2 only: neither exile nor counter.
    const b = run(["Opt", "Bear Cub"], no);
    expect(b.s.players.p1?.graveyard).toHaveLength(2);
    expect(b.s.objects[b.bear]?.counters["+1/+1"] ?? 0).toBe(0);
    const c = run(["Opt", "Opt"], yes);
    expect(c.s.players.p1?.graveyard).toHaveLength(2);
    expect(c.s.objects[c.bear]?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe('Hedge Whisperer: "you may choose not to untap this creature during your untap step" (PLAN-H, H8b)', () => {
  /** Goes to the untap step question of p1's next turn (or to its main phase, with no question). */
  const toUntapQuestion = (s: GameState): GameState =>
    advanceUntil(
      s,
      (x) =>
        (x.pending?.kind === "choice" && x.pending.purpose.kind === "untap") ||
        (x.turn.active === "p1" && x.turn.number > s.turn.number && x.turn.step === "main1"),
    );

  it("a real choice (502.3): keep it tapped or untap it; with no effect depending on it, the suggested answer untaps it", () => {
    const s = scenario({
      active: "p2",
      p1: {
        battlefield: [
          { name: "Hedge Whisperer", tapped: true },
          { name: "Forest", tapped: true },
        ],
      },
    });
    const hw = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    const forest = idOf(s, "p1", "battlefield", "Forest");
    const q = toUntapQuestion(s);
    expect(q.pending?.kind === "choice" && q.pending.player).toBe("p1");
    const req = q.pending?.kind === "choice" ? q.pending.request : undefined;
    // Only Hedge Whisperer is offered; the Forest untaps automatically.
    expect(req?.type === "pick" && [req.options, req.min, req.max, req.suggested]).toEqual([[hw], 0, 1, []]);
    const kept = act(q, "p1", { type: "choose", values: [hw] });
    expect([kept.objects[hw]?.tapped, kept.objects[forest]?.tapped]).toEqual([true, false]);
    const untapped = act(q, "p1", { type: "choose", values: [] });
    expect([untapped.objects[hw]?.tapped, untapped.objects[forest]?.tapped]).toEqual([false, false]);
  });

  it("no question if it's untapped; as long as the 5/5 land depends on it, the suggested answer keeps it tapped", () => {
    const quiet = toUntapQuestion(scenario({ active: "p2", p1: { battlefield: ["Hedge Whisperer"] } }));
    expect(quiet.pending?.kind).toBe("priority");
    expect(quiet.turn.step).toBe("main1");

    let s = scenario({ p1: { battlefield: ["Hedge Whisperer", ...lands("Forest", 5)], graveyard: ["Shivan Dragon"] } });
    const hw = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    const land = idsOf(s, "p1", "battlefield", "Forest")[4] as string;
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === hw);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: hw,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: [land] },
      }),
    );
    expect(chars(s, land).types).toContain("Creature");
    const q = toUntapQuestion(s);
    const req = q.pending?.kind === "choice" ? q.pending.request : undefined;
    expect(req?.suggested).toEqual([hw]);
    const kept = act(q, "p1", { type: "choose", values: [hw] });
    expect([kept.objects[hw]?.tapped, chars(kept, land).types.includes("Creature")]).toEqual([true, true]);
    const untapped = act(q, "p1", { type: "choose", values: [] });
    expect([untapped.objects[hw]?.tapped, chars(untapped, land).types.includes("Creature")]).toEqual([false, false]);
  });

  it("the choice only applies to the untap step: an effect untaps it", () => {
    const UNTAP = customCard({
      name: "Test Untap",
      typeLine: "Instant",
      types: ["Instant"],
      spell: dsl.spell([dsl.target.creature()], [dsl.fx.untap(dsl.ref.target())]),
    });
    let s = scenario({ p1: { battlefield: [{ name: "Hedge Whisperer", tapped: true }], hand: [UNTAP] } });
    const hw = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    s = settle(cast(s, "p1", "Test Untap", { t: [hw] }));
    expect(s.objects[hw]?.tapped).toBe(false);
  });
});

describe("view: the untap restriction is shown on the permanent (PLAN-H, H8b)", () => {
  it('Hedge Whisperer "may not untap"; a creature enchanted by Starlight Snare "doesn\'t untap"', () => {
    let s = scenario({
      p1: { battlefield: ["Hedge Whisperer", ...lands("Island", 3)], hand: ["Starlight Snare"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const hw = idOf(s, "p1", "battlefield", "Hedge Whisperer");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const ruleOf = (x: GameState, id: string) => projectView(x, "p1").battlefield.find((o) => o.id === id)?.untapRule;
    expect([ruleOf(s, hw), ruleOf(s, bear)]).toEqual(["May not untap", undefined]);
    s = settle(cast(s, "p1", "Starlight Snare", { enchant: [bear] }));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(ruleOf(s, bear)).toBe("Doesn't untap during the untap step");
  });
});
