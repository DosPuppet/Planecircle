/**
 * Teenage Mutant Ninja Turtles (partial set: cards from the meta decks): each handled card is checked against
 * its Oracle text (plan R, lot R7). Sneak, Mutagen tokens, three-level Class, Equipment...
 */

import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { createGame } from "../src/game";
import { legalActions } from "../src/legal";
import { createRecordedGame, isGameRecord, replayGame } from "../src/record";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState, ManaType, PlayerId } from "../src/types";
import { filterEvents, projectView, visibleFaces } from "../src/view";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  attackPlayer,
  canActivate,
  cast,
  castNowOf,
  combatTargetsOffered,
  counterFrom,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  pickNamed,
  scenario,
  settleNoBlocks as settle,
  settleLogged,
  steal,
  throughCombat,
  untilCastNow,
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
describe("Teenage Mutant Ninja Turtles", () => {
  describe("Escape Tunnel", () => {
    it("{T}, sacrifice: a basic land from the library enters tapped", () => {
      let s = scenario({ p1: { battlefield: ["Escape Tunnel"], library: ["Opt", "Island", "Opt"] } });
      const tunnel = idOf(s, "p1", "battlefield", "Escape Tunnel");
      s = settle(activate(s, "p1", tunnel, "basic land"), (req, _player, cur) => pickNamed(cur, req, "Island"));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Escape Tunnel")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("{T}, sacrifice: a creature with power 2 or less can't be blocked this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Escape Tunnel", "Bear Cub", "Fire Elemental"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const tunnel = idOf(s, "p1", "battlefield", "Escape Tunnel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      // Fire Elemental has power 5: illegal target.
      expect(() => activate(s, "p1", tunnel, "power 2", { targets: { t: [fire] } })).toThrow();
      s = settle(activate(s, "p1", tunnel, "power 2", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Escape Tunnel")).toHaveLength(1);
      expect(chars(s, bear).keywords).toContain("unblockable");
      // The Angel can't block: the declare blockers step waits for no decision from p2.
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(s.turn.step).toBe("end");
      expect(s.players.p2?.life).toBe(18);
      // Control: without the Tunnel, p2 can block the Bear Cub.
      let t = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
      t = advanceUntil(t, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(t.pending?.kind).toBe("declareBlockers");
    });
  });

  describe("Leatherhead, Swamp Stalker", () => {
    it("combat damage to a player: removing a counter destroys one of their artifacts or enchantments", () => {
      let s = scenario({
        p1: { battlefield: ["Leatherhead, Swamp Stalker", "Fishing Pole"] },
        p2: { battlefield: ["Warleader's Call", "Fishing Pole"] },
      });
      const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
      (s.objects[lh] as { counters: Record<string, number> }).counters.hexproof = 1;
      s.version += 1;
      const call = idOf(s, "p2", "battlefield", "Warleader's Call");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      let options: string[] = [];
      s = throughCombat(attack(s, [lh]), (req) => {
        if (req.intent === "may") return [1];
        if (req.type === "pick" && req.options.includes(call)) {
          options = req.options;
          return [call];
        }
        return undefined;
      });
      expect(s.players.p2?.life).toBe(15);
      // p2's artifacts and enchantments are offered, not p1's artifact.
      expect(options).toEqual(expect.arrayContaining([call, idOf(s, "p2", "battlefield", "Fishing Pole")]));
      expect(options).not.toContain(pole);
      expect(idsOf(s, "p2", "graveyard", "Warleader's Call")).toHaveLength(1);
      expect(s.objects[lh]?.counters.hexproof ?? 0).toBe(0);
      expect(chars(s, lh).keywords).not.toContain("hexproof");
      expect(chars(s, lh).keywords).toContain("trample");
    });

    it("with no counter to remove, nothing is destroyed", () => {
      let s = scenario({ p1: { battlefield: ["Leatherhead, Swamp Stalker"] }, p2: { battlefield: ["Warleader's Call"] } });
      const lh = idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker");
      let asked = false;
      s = throughCombat(attack(s, [lh]), (req) => {
        if (req.intent === "may") asked = true;
        return req.intent === "may" ? [1] : undefined;
      });
      expect(asked).toBe(true);
      expect(s.players.p2?.life).toBe(15);
      expect(idsOf(s, "p2", "battlefield", "Warleader's Call")).toHaveLength(1);
    });
  });

  it("Dream Beavers: flying; on entering, each opponent loses 1 life, you gain 1, then scry 1", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Swamp"], hand: ["Dream Beavers"], library: ["Opt", "Forest", "Island"] },
    });
    let scried = false;
    s = settle(cast(s, "p1", "Dream Beavers"), (req, _player, cur) => {
      if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
      scried = true;
      expect(namesIn(cur, req.options)).toEqual(["Opt"]);
      return req.options;
    });
    expect(scried).toBe(true);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([21, 19, 19]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest", "Island", "Opt"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Dream Beavers")).keywords).toContain("flying");
  });

  describe("Mutagen Man, Living Ooze", () => {
    it("creates X Mutagens; trample; your artifact tokens' abilities cost {1} less", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Mutagen Man, Living Ooze"] } });
      s = settle(cast(s, "p1", "Mutagen Man, Living Ooze", { x: 3 }));
      const man = idOf(s, "p1", "battlefield", "Mutagen Man, Living Ooze");
      const mutagens = idsOf(s, "p1", "battlefield", "Mutagen");
      expect(mutagens).toHaveLength(3);
      expect(chars(s, man).keywords).toContain("trample");
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && !s.objects[id]?.tapped)).toHaveLength(0);
      // No mana left: the Mutagen's {1} ability costs nothing.
      s = settle(activate(s, "p1", mutagens[0] as string, undefined, { targets: { t: [man] } }));
      expect(s.objects[man]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
    });

    it("the Mutagen can only be activated at sorcery speed; without Mutagen Man, it really costs {1}", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Mutagen Man, Living Ooze"] } });
      s = settle(cast(s, "p1", "Mutagen Man, Living Ooze", { x: 1 }));
      const mutagen = idOf(s, "p1", "battlefield", "Mutagen");
      expect(canActivate(s, "p1", mutagen)).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(s.turn.step).toBe("beginCombat");
      expect(canActivate(s, "p1", mutagen)).toBe(false);
      // A Mutagen created by The Ooze, without Mutagen Man: {1} to pay.
      const setup = (battlefield: string[]) => {
        const t = scenario({ p1: { battlefield: ["The Ooze", "Bear Cub", ...battlefield] }, p2: { graveyard: ["Opt"] } });
        const ooze = idOf(t, "p1", "battlefield", "The Ooze");
        const u = settle(activate(t, "p1", ooze, undefined, { targets: { t: [idOf(t, "p2", "graveyard", "Opt")] } }));
        return canActivate(u, "p1", idOf(u, "p1", "battlefield", "Mutagen"));
      };
      expect(setup([])).toBe(false);
      expect(setup(["Mountain"])).toBe(true);
    });
  });

  describe("The Ooze", () => {
    it("{T}: exiles a card from a graveyard and creates a Mutagen", () => {
      let s = scenario({ p1: { battlefield: ["The Ooze"] }, p2: { graveyard: ["Serra Angel"] } });
      const ooze = idOf(s, "p1", "battlefield", "The Ooze");
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = settle(activate(s, "p1", ooze, undefined, { targets: { t: [angel] } }));
      expect(s.objects[ooze]?.tapped).toBe(true);
      expect(s.players.p2?.graveyard).not.toContain(angel);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("one of your creatures with +1/+1 counters leaves: a Mutagen per counter (last known information)", () => {
      let s = scenario({ p1: { battlefield: ["The Ooze", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Llanowar Elves"] } });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
    });
  });

  it("Skateboard: taps a permanent on entering; the equipped creature has +1/+0 and haste; Equip {1}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), { name: "Bear Cub", sick: true }], hand: ["Skateboard"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Skateboard"), (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
    expect(s.objects[angel]?.tapped).toBe(true);
    const board = idOf(s, "p1", "battlefield", "Skateboard");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", board, undefined, { targets: { t: [bear] } }));
    expect(s.objects[board]?.attachedTo).toBe(bear);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(2);
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toContain("haste");
    // Entered this turn, it attacks thanks to haste.
    s = settle(attack(s, [bear]));
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p2?.life).toBe(17);
  });

  it("The Last Ronin's Technique cast normally: three 1/1 white Ninja Turtle Spirits, untapped and not in combat", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["The Last Ronin's Technique"] } });
    s = settle(cast(s, "p1", "The Last Ronin's Technique"));
    const spirits = idsOf(s, "p1", "battlefield", "Ninja Turtle Spirit");
    expect(spirits).toHaveLength(3);
    for (const id of spirits) {
      const c = chars(s, id);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.colors).toEqual(["W"]);
      expect(c.subtypes).toEqual(expect.arrayContaining(["Ninja", "Turtle", "Spirit"]));
      expect(s.objects[id]?.tapped).toBe(false);
    }
    expect(s.combat?.attackers ?? []).toHaveLength(0);
    expect(idsOf(s, "p1", "graveyard", "The Last Ronin's Technique")).toHaveLength(1);
  });

  describe("Cool but Rude", () => {
    it("level 1: when you attack, you may discard a card to draw one", () => {
      let s = scenario({ p1: { battlefield: ["Cool but Rude", "Bear Cub"], hand: ["Opt"], library: lands("Island", 3) } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      // Level 1 only: the discard deals no damage.
      expect(s.players.p2?.life).toBe(20);
    });

    it("level 1: you may decline to discard, and then you don't draw", () => {
      let s = scenario({ p1: { battlefield: ["Cool but Rude", "Bear Cub"], hand: ["Opt"], library: lands("Island", 3) } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) => (req.type === "pick" ? [] : undefined));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it("level 2 ({1}{R}): each discarded card deals 2 damage to each opponent", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Cool but Rude", "Bear Cub", ...lands("Mountain", 2)], hand: ["Opt"], library: lands("Island", 3) },
      });
      const cls = idOf(s, "p1", "battlefield", "Cool but Rude");
      s = settle(activate(s, "p1", cls));
      expect(s.objects[cls]?.classLevel).toBe(2);
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), (req) =>
        req.type === "pick" && req.options.includes(opt) ? [opt] : undefined,
      );
      // Still in the declare attackers step: the 2 damage comes from the discard.
      expect(s.turn.step).toBe("declareAttackers");
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 18, 18]);
    });

    it("level 3: search for a card, then discard a card at random (which triggers level 2)", () => {
      let s = scenario({
        p1: { battlefield: ["Cool but Rude", ...lands("Mountain", 4)], library: ["Island", "Opt", "Island"] },
      });
      const cls = idOf(s, "p1", "battlefield", "Cool but Rude");
      s = settle(activate(s, "p1", cls));
      let searched = false;
      s = settle(activate(s, "p1", cls), (req, _player, cur) => {
        const opt = pickNamed(cur, req, "Opt");
        if (req.intent === "search" && opt?.length) searched = true;
        return opt?.length ? opt : undefined;
      });
      expect(searched).toBe(true);
      expect(s.objects[cls]?.classLevel).toBe(3);
      // The hand held only the searched card: that's the one discarded.
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
    });
  });

  it("Casey Jones, Vigilante: draw three cards, then three discarded at random at your next upkeep", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Casey Jones, Vigilante"], library: lands("Island", 10) },
    });
    s = settle(cast(s, "p1", "Casey Jones, Vigilante"));
    expect(s.players.p1?.hand).toHaveLength(3);
    // Not during the opponent's upkeep.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // The three cards discarded at upkeep, then the turn's draw.
    expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(3);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Michelangelo's Technique: the cards not chosen among the eight go to the bottom of the library", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 5),
        hand: ["Michelangelo's Technique"],
        library: ["Bear Cub", "Opt", ...lands("Forest", 6), "Island", "Swamp"],
      },
    });
    let seen: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Michelangelo's Technique"), (req, _player, cur) => {
      if (req.type !== "pick") return undefined;
      seen = namesIn(cur, req.options);
      return pickNamed(cur, req, "Bear Cub");
    });
    // Only creature cards are offered.
    expect(seen).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    const library = namesIn(s, s.players.p1?.library);
    expect(library.slice(0, 2)).toEqual(["Island", "Swamp"]);
    expect(library).toHaveLength(9);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  /**
   * Plays (passes, choices, no attack or block, discarding the excess) until `until`, answering the choices
   * (default suggestion).
   */
  const drive = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = cur.players[p.player]?.hand ?? [];
        cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, Math.max(0, hand.length - 7)) });
      } else break;
    }
    return cur;
  };
  /** Resolves everything: empty stack, no trigger waiting (at least one pass). */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let first = true;
    return drive(
      s,
      (x) => {
        const done = !first && x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
        first = false;
        return done;
      },
      answer,
    );
  };
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Attacks, then goes to p1's priority in the declare blockers step (with no blocker). */
  const unblocked = (s: S, attackers: string[], answer: Answer = () => undefined) =>
    drive(
      attack(s, attackers),
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
      answer,
    );
  /** Selects among a choice's options the objects named `name` (at most `n`). */
  const pickNamed = (s: S, req: ChoiceRequest, name: string, n = 1) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, String(id)) === name).slice(0, n) : undefined;

  describe("Teenage Mutant Ninja Turtles, lot A — blanc", () => {
    it("Action News Crew: channel {6} from hand, a +1/+1 counter on each of your creatures, draw", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Bear Cub", "Llanowar Elves"], hand: ["Action News Crew"], library: ["Opt"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const crew = idOf(s, "p1", "hand", "Action News Crew");
      s = settle(activate(s, "p1", crew, "Channel"));
      expect(idsOf(s, "p1", "graveyard", "Action News Crew")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    });

    it("Agent Bishop: at the beginning of your combat, a +1/+1 counter on each of up to two targeted creatures", () => {
      let s = scenario({ p1: { battlefield: ["Agent Bishop, Man in Black", "Bear Cub", "Llanowar Elves", "Serra Angel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      let max = 0;
      s = drive(
        s,
        (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && counters(x, bear) > 0,
        (req) => {
          if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
          max = req.max ?? 0;
          return [bear, elves];
        },
      );
      expect(max).toBe(2);
      expect([counters(s, bear), counters(s, elves), counters(s, angel)]).toEqual([1, 1, 0]);
    });

    describe("April O'Neil, Kunoichi Trainee", () => {
      it("en arrivant, regard 2", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["April O'Neil, Kunoichi Trainee"], library: ["Opt", "Island", "Swamp"] },
        });
        let seen: (string | undefined)[] = [];
        s = settle(cast(s, "p1", "April O'Neil, Kunoichi Trainee"), (req, _player, cur) => {
          if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return pickNamed(cur, req, "Opt");
        });
        expect(seen).toEqual(["Opt", "Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
      });

      it("can't be blocked by creatures with power 3 or greater", () => {
        let s = scenario({
          p1: { battlefield: ["April O'Neil, Kunoichi Trainee"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const april = idOf(s, "p1", "battlefield", "April O'Neil, Kunoichi Trainee");
        s = advanceUntil(attack(s, [april]), (x) => x.pending?.kind === "declareBlockers");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: april }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: april }] });
        expect(s.combat?.attackers.find((a) => a.id === april)?.blocked).toBe(true);
      });
    });

    it("Dimensional Exile: enchants a basic land you control; exiles an opposing creature until it leaves", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Mountain"], hand: ["Dimensional Exile"] },
        p2: { battlefield: ["Serra Angel", "Plains"] },
      });
      const plains = idOf(s, "p1", "battlefield", "Plains");
      const foreign = idOf(s, "p2", "battlefield", "Plains");
      // An opposing basic land isn't a valid host.
      expect(() => cast(s, "p1", "Dimensional Exile", { targets: { enchant: [foreign] } })).toThrow();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Dimensional Exile", { targets: { enchant: [plains] } }), (req) =>
        req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      const aura = idOf(s, "p1", "battlefield", "Dimensional Exile");
      expect(s.objects[aura]?.attachedTo).toBe(plains);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      destroy(s, aura);
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("East Wind Avatar: Alliance, +1/+0 until end of turn for each other creature that enters", () => {
      let s = scenario({
        p1: { battlefield: ["East Wind Avatar", ...lands("Forest", 3)], hand: ["Llanowar Elves", "Bear Cub"] },
      });
      const avatar = idOf(s, "p1", "battlefield", "East Wind Avatar");
      expect(chars(s, avatar).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Llanowar Elves"));
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(pt(s, avatar)).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, avatar)).toEqual([2, 4]);
    });

    it("Featherbrained Filcher: when it leaves the battlefield (even returned to hand), a Food", () => {
      let s = scenario({ p1: { battlefield: ["Featherbrained Filcher", "Prehistoric Pet", "Plains", "Plains"] } });
      const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
      const filcher = idOf(s, "p1", "battlefield", "Featherbrained Filcher");
      s = settle(activate(s, "p1", pet, undefined, { targets: { t: [filcher] } }));
      expect(idsOf(s, "p1", "hand", "Featherbrained Filcher")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Grounded for Life: costs {3} less if it targets a tapped creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Grounded for Life"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      // Two lands: not enough for an untapped creature ({4}{W}).
      expect(() => cast(s, "p1", "Grounded for Life", { targets: { t: [dragon] } })).toThrow();
      s = settle(cast(s, "p1", "Grounded for Life", { targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hamato Guardian Stance: +1/+3 and flying until end of turn, then scry 1", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Hamato Guardian Stance"], library: ["Opt", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let scried = false;
      s = settle(cast(s, "p1", "Hamato Guardian Stance", { targets: { t: [bear] } }), (req, _player, cur) => {
        if (req.intent !== "scryBottom") return undefined;
        scried = true;
        return pickNamed(cur, req, "Opt");
      });
      expect(scried).toBe(true);
      expect(pt(s, bear)).toEqual([3, 5]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Opt"]);
    });

    it("High-Flying Ace: {3}{W}, a creature without flying gains flying; at sorcery speed only", () => {
      let s = scenario({ p1: { battlefield: ["High-Flying Ace", "Bear Cub", "Serra Angel", ...lands("Plains", 4)] } });
      const ace = idOf(s, "p1", "battlefield", "High-Flying Ace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(() => activate(s, "p1", ace, undefined, { targets: { t: [angel] } })).toThrow();
      const combat = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      expect(canActivate(combat, "p1", ace)).toBe(false);
      s = settle(activate(s, "p1", ace, undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    describe("Jennika, Bad Apple Big Sister", () => {
      it("on entering, a red 2/2 Mutant token", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Jennika, Bad Apple Big Sister"] } });
        s = settle(cast(s, "p1", "Jennika, Bad Apple Big Sister"));
        const [mutant] = idsOf(s, "p1", "battlefield", "Mutant");
        expect(mutant).toBeDefined();
        expect(pt(s, mutant as string)).toEqual([2, 2]);
        expect(chars(s, mutant as string).colors).toEqual(["R"]);
      });

      it("Plains cycling {2}: a Plains card from the library into hand", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 2),
            hand: ["Jennika, Bad Apple Big Sister"],
            library: ["Island", "Plains", "Opt"],
          },
        });
        const jennika = idOf(s, "p1", "hand", "Jennika, Bad Apple Big Sister");
        s = settle(activate(s, "p1", jennika), (req, _player, cur) => pickNamed(cur, req, "Plains"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
        expect(idsOf(s, "p1", "graveyard", "Jennika, Bad Apple Big Sister")).toHaveLength(1);
      });
    });

    describe("Koya, Death from Above", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["Koya, Death from Above"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      const cut = (s: S, pay: boolean) => {
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        let asked = false;
        let t = settle(cast(s, "p1", "Koya, Death from Above"), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        t = drive(
          t,
          (x) => x.turn.active === "p2",
          (req) => {
            if (req.type !== "yesNo" || !req.prompt.includes("{3}{B}")) return undefined;
            asked = true;
            return [pay ? 1 : 0];
          },
        );
        expect(asked).toBe(true);
        return t;
      };

      it("exiles another creature; without paying {3}{B} at the end step, it returns under its owner's control", () => {
        const s = cut(setup(), false);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("by paying {3}{B}, it stays in exile", () => {
        const s = cut(setup(), true);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      });
    });

    describe("Leader's Talent", () => {
      it("level 1: when you attack, a +1/+1 counter on an attacking creature", () => {
        let s = scenario({ p1: { battlefield: ["Leader's Talent", "Bear Cub", "Llanowar Elves", "Serra Angel"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        let options: string[] = [];
        s = settle(attack(s, [bear, elves]), (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options as string[];
          return [bear];
        });
        // Only attacking creatures are targets.
        expect(options).toEqual(expect.arrayContaining([bear, elves]));
        expect(options).not.toContain(angel);
        expect([counters(s, bear), counters(s, elves)]).toEqual([1, 0]);
      });

      it("level 2: one of your creatures that had a counter leaves the battlefield, gain 2 life", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Leader's Talent",
              ...lands("Plains", 3),
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Llanowar Elves",
            ],
          },
        });
        const talent = idOf(s, "p1", "battlefield", "Leader's Talent");
        s = settle(activate(s, "p1", talent));
        expect(s.objects[talent]?.classLevel).toBe(2);
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = settle(s);
        expect(s.players.p1?.life).toBe(20);
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        s = settle(s);
        expect(s.players.p1?.life).toBe(22);
      });

      it("level 3: whenever you cast a spell, a +1/+1 counter on each of your creatures", () => {
        let s = scenario({
          p1: { battlefield: ["Leader's Talent", ...lands("Plains", 7), "Bear Cub", "Island"], hand: ["Opt"] },
        });
        const talent = idOf(s, "p1", "battlefield", "Leader's Talent");
        s = settle(activate(s, "p1", talent));
        s = settle(activate(s, "p1", talent));
        expect(s.objects[talent]?.classLevel).toBe(3);
        s = settle(cast(s, "p1", "Opt"));
        expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      });
    });

    it("Leonardo, Big Brother: +1/+0 for each other creature you control", () => {
      const s = scenario({
        p1: { battlefield: ["Leonardo, Big Brother", "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Leonardo, Big Brother"))).toEqual([3, 3]);
    });

    it("Leonardo, Cutting Edge: lifelink; whenever you gain life, a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Leonardo, Cutting Edge"] } });
      const leo = idOf(s, "p1", "battlefield", "Leonardo, Cutting Edge");
      expect(chars(s, leo).keywords).toContain("lifelink");
      s = settle(attack(s, [leo]));
      s = drive(s, (x) => x.turn.step === "main2" && x.triggers.length === 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(21);
      expect(counters(s, leo)).toBe(1);
    });

    describe("Leonardo, Leader in Blue", () => {
      it("sneaked: it enters tapped and attacking, and your creatures get +2/+0", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Leonardo, Leader in Blue"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = unblocked(s, [bear, idOf(s, "p1", "battlefield", "Llanowar Elves")]);
        s = settle(cast(s, "p1", "Leonardo, Leader in Blue", { alternative: true }));
        // The weakest unblocked attacker (the Elves) is returned to hand.
        expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
        const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
        expect(s.objects[leo]?.tapped).toBe(true);
        expect(s.combat?.attackers.some((a) => a.id === leo)).toBe(true);
        expect(pt(s, bear)).toEqual([4, 2]);
        expect(pt(s, leo)).toEqual([4, 1]);
        s = drive(s, (x) => x.turn.step === "main2");
        expect(s.players.p2?.life).toBe(12);
      });

      it("sneaked at a planeswalker that is gone on resolution: it enters tapped, not attacking (508.4a; PLAN-L L4)", () => {
        const walker = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 5 });
        let s = scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Leonardo, Leader in Blue"] },
          p2: { battlefield: [walker] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const w = idOf(s, "p2", "battlefield", "Test Walker");
        s = drive(
          attackPlayer(s, [bear], w),
          (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
        );
        s = cast(s, "p1", "Leonardo, Leader in Blue", { alternative: true });
        destroy(s, w);
        s = settle(s);
        const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
        expect(s.objects[leo]?.tapped).toBe(true);
        expect(s.combat?.attackers.some((a) => a.id === leo)).toBe(false);
      });

      it("cast normally: no bonus; {1}{W}: first strike until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Leonardo, Leader in Blue"] } });
        s = settle(cast(s, "p1", "Leonardo, Leader in Blue"));
        const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        expect(s.objects[leo]?.tapped).toBe(false);
        s = settle(activate(s, "p1", leo));
        expect(chars(s, leo).keywords).toContain("firstStrike");
      });
    });

    describe("Leonardo, Sewer Samurai", () => {
      it("during your turn, creature spells with power or toughness 1 or less can be cast from the graveyard, with a finality counter", () => {
        let s = scenario({
          p1: {
            battlefield: ["Leonardo, Sewer Samurai", ...lands("Forest", 3)],
            graveyard: ["Llanowar Elves", "Bear Cub"],
          },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Leonardo, Sewer Samurai")).keywords).toContain("doubleStrike");
        const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        expect(canCast(s, "p1", bear)).toBe(false);
        expect(canCast(s, "p1", elves)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: elves }));
        const back = idOf(s, "p1", "battlefield", "Llanowar Elves");
        expect(s.objects[back]?.counters.finality).toBe(1);
        // With a finality counter, it is exiled instead of dying.
        destroy(s, back);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Llanowar Elves");
      });

      it("not during an opponent's turn", () => {
        const s = scenario({
          active: "p2",
          p1: { battlefield: ["Leonardo, Sewer Samurai", ...lands("Forest", 3)], graveyard: ["Llanowar Elves"] },
        });
        const p1 = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(canCast(p1, "p1", idOf(p1, "p1", "graveyard", "Llanowar Elves"))).toBe(false);
      });
    });

    it("Leonardo's Technique: one or two creature cards with MV 3 or less from your graveyard return", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Leonardo's Technique"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => cast(s, "p1", "Leonardo's Technique", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Leonardo's Technique", { targets: { t: [bear, elves] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Lita: Alliance, a mode that hasn't been chosen yet this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Lita, Little Orphan Amphibian", ...lands("Forest", 4)],
          hand: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves"],
          library: lands("Island", 5),
        },
      });
      const lita = idOf(s, "p1", "battlefield", "Lita, Little Orphan Amphibian");
      const offered: number[] = [];
      let scries = 0;
      const chooseFirst: Answer = (req) => {
        if (req.intent === "scryBottom") scries++;
        if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return [req.options[0] as ChoiceValue];
      };
      for (let i = 0; i < 4; i++) s = settle(cast(s, "p1", "Llanowar Elves"), chooseFirst);
      // Three modes offered, then two; the last one (scry 1) is taken automatically; the fourth trigger has no mode left.
      expect(offered).toEqual([3, 2]);
      expect(scries).toBe(1);
      expect(counters(s, lita)).toBe(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    it("Mighty Mutanimals: a Mutant on entering, which triggers Alliance (a +1/+1 counter on one of your creatures)", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Mighty Mutanimals"] } });
      let mutant = "";
      s = settle(cast(s, "p1", "Mighty Mutanimals"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        mutant = (pickNamed(cur, req, "Mutant")?.[0] as string) ?? "";
        return mutant ? [mutant] : undefined;
      });
      expect(mutant).not.toBe("");
      expect(pt(s, mutant)).toEqual([3, 3]);
    });

    describe("Prehistoric Pet", () => {
      it("can't be blocked by creatures with greater power", () => {
        let s = scenario({ p1: { battlefield: ["Prehistoric Pet"] }, p2: { battlefield: ["Bear Cub", "Llanowar Elves"] } });
        const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
        s = advanceUntil(attack(s, [pet]), (x) => x.pending?.kind === "declareBlockers");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: pet }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: pet }] });
        expect(s.combat?.attackers.find((a) => a.id === pet)?.blocked).toBe(true);
      });

      it("{1}{W}, {T}: returns another of your creatures to hand, during your turn only", () => {
        let s = scenario({ p1: { battlefield: ["Prehistoric Pet", "Bear Cub", ...lands("Plains", 2)] } });
        const pet = idOf(s, "p1", "battlefield", "Prehistoric Pet");
        expect(() => activate(s, "p1", pet, undefined, { targets: { t: [pet] } })).toThrow();
        s = settle(activate(s, "p1", pet, undefined, { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        const opp = scenario({ active: "p2", p1: { battlefield: ["Prehistoric Pet", "Bear Cub", ...lands("Plains", 2)] } });
        const p1 = advanceUntil(opp, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        expect(canActivate(p1, "p1", idOf(p1, "p1", "battlefield", "Prehistoric Pet"))).toBe(false);
      });
    });

    describe("Quintessential Katana", () => {
      it("a Ninja enters: you may attach the Equipment to it", () => {
        let s = scenario({
          p1: { battlefield: ["Quintessential Katana", ...lands("Plains", 2)], hand: ["April O'Neil, Kunoichi Trainee"] },
        });
        let asked = false;
        s = settle(cast(s, "p1", "April O'Neil, Kunoichi Trainee"), (req) => {
          if (req.intent !== "may") return undefined;
          asked = true;
          return [1];
        });
        expect(asked).toBe(true);
        const april = idOf(s, "p1", "battlefield", "April O'Neil, Kunoichi Trainee");
        expect(s.objects[idOf(s, "p1", "battlefield", "Quintessential Katana")]?.attachedTo).toBe(april);
        expect(pt(s, april)).toEqual([3, 3]);
      });

      it("the equipped creature that deals combat damage untaps, and you gain 2 life", () => {
        let s = scenario({ p1: { battlefield: ["Quintessential Katana", "Bear Cub", ...lands("Plains", 2)] } });
        const katana = idOf(s, "p1", "battlefield", "Quintessential Katana");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", katana, undefined, { targets: { t: [bear] } }));
        expect(s.objects[katana]?.attachedTo).toBe(bear);
        s = settle(attack(s, [bear]));
        expect(s.objects[bear]?.tapped).toBe(true);
        s = drive(s, (x) => x.turn.step === "main2" && x.triggers.length === 0 && x.stack.length === 0);
        expect(s.players.p2?.life).toBe(17);
        expect(s.players.p1?.life).toBe(22);
        expect(s.objects[bear]?.tapped).toBe(false);
      });
    });

    describe("Sally Pride, Lioness Leader", () => {
      it("creates X Mutants, X being the number of nontoken creatures you control", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Llanowar Elves"], hand: ["Sally Pride, Lioness Leader"] },
        });
        s = settle(cast(s, "p1", "Sally Pride, Lioness Leader"));
        // Sally Pride, Bear Cub and Llanowar Elves.
        expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(3);
      });

      it("when it attacks, a +1/+1 counter on each of your creatures", () => {
        let s = scenario({
          p1: { battlefield: ["Sally Pride, Lioness Leader", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const sally = idOf(s, "p1", "battlefield", "Sally Pride, Lioness Leader");
        s = settle(attack(s, [sally]));
        expect(counters(s, sally)).toBe(1);
        expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
        expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      });
    });

    it("Triceraton Commander: X Dinosaur Soldiers; when it attacks, your other Dinosaurs get +1/+1 and flying", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Triceraton Commander"] } });
      s = settle(cast(s, "p1", "Triceraton Commander", { x: 2 }));
      const commander = idOf(s, "p1", "battlefield", "Triceraton Commander");
      const dinos = idsOf(s, "p1", "battlefield", "Dinosaur Soldier");
      expect(dinos).toHaveLength(2);
      expect(chars(s, dinos[0] as string).colors).toEqual(["W"]);
      expect(pt(s, dinos[0] as string)).toEqual([2, 2]);
      // On p1's next turn, the Commander attacks.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(attack(s, [commander]));
      for (const d of dinos) {
        expect(pt(s, d)).toEqual([3, 3]);
        expect(chars(s, d).keywords).toContain("flying");
      }
      expect(pt(s, commander)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    describe("Turncoat Kunoichi", () => {
      it("cast normally: the opposing creature is exiled until it leaves", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Turncoat Kunoichi"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Turncoat Kunoichi"), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        destroy(s, idOf(s, "p1", "battlefield", "Turncoat Kunoichi"));
        s = settle(s);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("sneaked: the creature is exiled for good", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Turncoat Kunoichi"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = unblocked(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = settle(cast(s, "p1", "Turncoat Kunoichi", { alternative: true }), (req) =>
          req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
        );
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        destroy(s, idOf(s, "p1", "battlefield", "Turncoat Kunoichi"));
        s = settle(s);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      });
    });

    it("Turtles Forever: four legendary creatures with different names, an opponent chooses two for your hand", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Turtles Forever"],
          library: [
            "Leonardo, Big Brother",
            "Leonardo, Big Brother",
            "Leonardo, Cutting Edge",
            "Koya, Death from Above",
            "Sally Pride, Lioness Leader",
            "Bear Cub",
          ],
        },
      });
      let chooser = "";
      s = settle(cast(s, "p1", "Turtles Forever"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        if (req.intent === "search") {
          const names = new Set<string>();
          return req.options.filter((id) => {
            const n = nameOf(cur, String(id)) ?? "";
            if (names.has(n)) return false;
            names.add(n);
            return true;
          });
        }
        if (cur.pending?.kind === "choice") chooser = cur.pending.player;
        const koya = pickNamed(cur, req, "Koya, Death from Above") ?? [];
        return koya.length ? koya : pickNamed(cur, req, "Sally Pride, Lioness Leader");
      });
      expect(chooser).toBe("p2");
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.hand)).toContain("Koya, Death from Above");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Turtles Forever: the library and/or outside the game (the sideboard); the rest is shuffled into the library", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Turtles Forever"],
          library: ["Leonardo, Big Brother", "Koya, Death from Above", "Plains"],
          sideboard: ["Leonardo, Cutting Edge", "Sally Pride, Lioness Leader", "Bear Cub"],
        },
      });
      let offered: (string | undefined)[] = [];
      const run = settleLogged(cast(s, "p1", "Turtles Forever"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        if (req.intent === "search") {
          offered = namesIn(cur, req.options.map(String));
          return req.options;
        }
        const koya = pickNamed(cur, req, "Koya, Death from Above") ?? [];
        return koya.length ? koya : pickNamed(cur, req, "Sally Pride, Lioness Leader");
      });
      s = run.s;
      // The legendary creature cards of both zones, the sideboard's before the library's; not Bear Cub.
      expect(offered).toEqual([
        "Leonardo, Cutting Edge",
        "Sally Pride, Lioness Leader",
        "Leonardo, Big Brother",
        "Koya, Death from Above",
      ]);
      // The four cards are revealed to everyone.
      const reveal = run.events.find((e) => e.type === "reveal" && !e.look);
      expect(reveal?.type === "reveal" && reveal.defIds).toHaveLength(4);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Koya, Death from Above", "Sally Pride, Lioness Leader"]);
      // The other two, Leonardo, Cutting Edge from the sideboard too, are shuffled into the library.
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Leonardo, Big Brother", "Leonardo, Cutting Edge", "Plains"]);
      expect(namesIn(s, s.players.p1?.sideboard)).toEqual(["Bear Cub"]);
    });

    it("Uneasy Alliance: the enchanted creature can't attack or block; {5}, sacrifice: exiled, and a 1/1 Ninja for you", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 7)], hand: ["Uneasy Alliance"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Uneasy Alliance", { targets: { enchant: [angel] } }));
      expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
      const aura = idOf(s, "p1", "battlefield", "Uneasy Alliance");
      const combat = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      expect(canActivate(combat, "p1", aura)).toBe(false);
      s = settle(activate(s, "p1", aura));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Serra Angel");
      const [ninja] = idsOf(s, "p1", "battlefield", "Ninja");
      expect(ninja).toBeDefined();
      expect(chars(s, ninja as string).colors).toEqual(["B"]);
      expect(idsOf(s, "p1", "graveyard", "Uneasy Alliance")).toHaveLength(1);
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Choice: the given options if they are offered. */
  const pickIds = (req: ChoiceRequest, ids: string[]) =>
    req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;

  describe("Teenage Mutant Ninja Turtles, lot A — bleu", () => {
    it("April, Reporter of the Weird: combat damage to a player, draw that many, then discard a card", () => {
      let s = scenario({ p1: { battlefield: ["April, Reporter of the Weird"], hand: ["Opt"], library: lands("Island", 5) } });
      const april = idOf(s, "p1", "battlefield", "April, Reporter of the Weird");
      const opt = idOf(s, "p1", "hand", "Opt");
      let discarded = false;
      s = throughCombat(attack(s, [april]), (req) => {
        if (req.type === "pick" && req.options.includes(opt)) {
          discarded = true;
          return [opt];
        }
        return undefined;
      });
      expect(discarded).toBe(true);
      expect(s.players.p2?.life).toBe(18);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Bespoke Bō: returns up to one other nonland permanent; the equipped creature has +2/+1 and vigilance; Equip {3}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Bespoke Bō"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Bespoke Bō"), (req) => pickIds(req, [angel]));
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      const bo = idOf(s, "p1", "battlefield", "Bespoke Bō");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", bo, undefined, { targets: { t: [bear] } }));
      expect(s.objects[bo]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(chars(s, bear).keywords).toContain("vigilance");
    });

    it("Buzz Bots: flying and vigilance; when it dies, draw a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), "Buzz Bots"], hand: ["Lightning Strike"], library: lands("Island", 3) },
      });
      const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
      expect(chars(s, bots).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bots] } }));
      expect(idsOf(s, "p1", "graveyard", "Buzz Bots")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Crustacean Commando: creates a Mutagen token on entering", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Crustacean Commando"] } });
      s = settle(cast(s, "p1", "Crustacean Commando"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Crustacean Commando"))).toEqual([0, 3]);
    });

    describe("Does Machines", () => {
      it("level 1: on entering, mill two cards, draw two, then discard two", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Does Machines"], library: ["Opt", "Opt", "Island", "Swamp", "Forest"] },
        });
        s = settle(cast(s, "p1", "Does Machines"));
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Opt", "Swamp"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
      });

      it("level 2: returns up to two targeted artifact cards from your graveyard to hand", () => {
        let s = scenario({
          p1: { battlefield: ["Does Machines", ...lands("Island", 2)], graveyard: ["Buzz Bots", "Expedition Map", "Opt"] },
        });
        const cls = idOf(s, "p1", "battlefield", "Does Machines");
        const bots = idOf(s, "p1", "graveyard", "Buzz Bots");
        const map = idOf(s, "p1", "graveyard", "Expedition Map");
        let options: string[] = [];
        s = settle(activate(s, "p1", cls), (req) => {
          if (req.type === "pick" && req.options.includes(bots)) options = req.options;
          return pickIds(req, [bots, map]);
        });
        expect(s.objects[cls]?.classLevel).toBe(2);
        // Opt isn't an artifact: it isn't offered.
        expect(options).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Buzz Bots", "Expedition Map"]);
      });

      it("level 3: at the beginning of your combat, three +1/+1 counters; a noncreature artifact becomes a 0/0 Robot", () => {
        let s = scenario({ p1: { battlefield: ["Does Machines", ...lands("Island", 7), "Expedition Map"] } });
        const cls = idOf(s, "p1", "battlefield", "Does Machines");
        s = settle(activate(s, "p1", cls));
        s = settle(activate(s, "p1", cls));
        expect(s.objects[cls]?.classLevel).toBe(3);
        const map = idOf(s, "p1", "battlefield", "Expedition Map");
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat");
        s = settle(s, (req) => pickIds(req, [map]));
        expect(s.objects[map]?.counters["+1/+1"]).toBe(3);
        const c = chars(s, map);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toContain("Robot");
        expect(pt(s, map)).toEqual([3, 3]);
      });
    });

    it("Donatello, Gadget Master: combat damage to a player, a token copy of an artifact you control", () => {
      let s = scenario({ p1: { battlefield: ["Donatello, Gadget Master", "Expedition Map"] } });
      const don = idOf(s, "p1", "battlefield", "Donatello, Gadget Master");
      const map = idOf(s, "p1", "battlefield", "Expedition Map");
      s = throughCombat(attack(s, [don]), (req) => pickIds(req, [map]));
      expect(s.players.p2?.life).toBe(17);
      const maps = idsOf(s, "p1", "battlefield", "Expedition Map");
      expect(maps).toHaveLength(2);
      expect(maps.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    });

    describe("Donatello, Mutant Mechanic", () => {
      it("{T}: three +1/+1 counters on an artifact; if it isn't a creature, it becomes a 0/0 Robot", () => {
        let s = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Expedition Map", "Buzz Bots"] } });
        const don = idOf(s, "p1", "battlefield", "Donatello, Mutant Mechanic");
        const map = idOf(s, "p1", "battlefield", "Expedition Map");
        s = settle(activate(s, "p1", don, undefined, { targets: { t: [map] } }));
        expect(s.objects[don]?.tapped).toBe(true);
        expect(chars(s, map).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, map).subtypes).toContain("Robot");
        expect(pt(s, map)).toEqual([3, 3]);
        // An artifact creature keeps its base P/T (1/1 plus three counters).
        let t = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Buzz Bots"] } });
        const bots = idOf(t, "p1", "battlefield", "Buzz Bots");
        t = settle(
          activate(t, "p1", idOf(t, "p1", "battlefield", "Donatello, Mutant Mechanic"), undefined, { targets: { t: [bots] } }),
        );
        expect(pt(t, bots)).toEqual([4, 4]);
      });

      it("can only be activated at sorcery speed", () => {
        const s = scenario({ p1: { battlefield: ["Donatello, Mutant Mechanic", "Expedition Map"] }, step: "beginCombat" });
        const don = idOf(s, "p1", "battlefield", "Donatello, Mutant Mechanic");
        expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === don)).toBe(false);
      });

      it("one of your artifacts with counters goes to the graveyard: its counters go onto one of your artifacts or creatures", () => {
        let s = scenario({
          p1: {
            battlefield: [
              "Donatello, Mutant Mechanic",
              { name: "Buzz Bots", counters: { "+1/+1": 2 } },
              "Bear Cub",
              ...lands("Mountain", 2),
            ],
            hand: ["Lightning Strike"],
          },
        });
        const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bots] } }), (req) => pickIds(req, [bear]));
        expect(idsOf(s, "p1", "graveyard", "Buzz Bots")).toHaveLength(1);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(pt(s, bear)).toEqual([4, 4]);
      });

      it("an artifact with no counter triggers nothing", () => {
        let s = scenario({
          p1: {
            battlefield: ["Donatello, Mutant Mechanic", "Buzz Bots", "Bear Cub", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        const bots = idOf(s, "p1", "battlefield", "Buzz Bots");
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [bots] } });
        s = settle(s);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Donatello, Turtle Techie: on entering, draw a card if you control an artifact", () => {
      const run = (withArtifact: boolean) => {
        const battlefield = [...lands("Island", 4), ...(withArtifact ? ["Expedition Map"] : [])];
        const s = scenario({ p1: { battlefield, hand: ["Donatello, Turtle Techie"], library: lands("Island", 3) } });
        return settle(cast(s, "p1", "Donatello, Turtle Techie")).players.p1?.hand.length;
      };
      expect(run(true)).toBe(1);
      expect(run(false)).toBe(0);
    });

    it("Donatello, Way with Machines: a +1/+1 counter whenever an artifact enters under your control", () => {
      let s = scenario({
        p1: { battlefield: ["Donatello, Way with Machines", ...lands("Island", 3)], hand: ["Buzz Bots", "Expedition Map"] },
        p2: { battlefield: [...lands("Island", 2)], hand: ["Buzz Bots"] },
      });
      const don = idOf(s, "p1", "battlefield", "Donatello, Way with Machines");
      s = settle(cast(s, "p1", "Buzz Bots"));
      s = settle(cast(s, "p1", "Expedition Map"));
      expect(s.objects[don]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, don).keywords).toContain("flying");
      // An opposing artifact doesn't count.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(cast(s, "p2", "Buzz Bots"));
      expect(s.objects[don]?.counters["+1/+1"]).toBe(2);
    });

    it("Donatello's Technique: draw two cards", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Donatello's Technique"], library: lands("Swamp", 3) } });
      s = settle(cast(s, "p1", "Donatello's Technique"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp", "Swamp"]);
    });

    it("Kitsune, Dragon's Daughter: on entering, you may exchange control of two other creatures of different players", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Kitsune, Dragon's Daughter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Kitsune, Dragon's Daughter"), (req) =>
        req.intent === "may" ? [1] : pickIds(req, [bear, angel]),
      );
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(chars(s, idOf(s, "p1", "battlefield", "Kitsune, Dragon's Daughter")).keywords).toContain("vigilance");
    });

    it("Kitsune, Dragon's Daughter in multiplayer: two creatures of two different opponents are exchanged (PLAN-H, H2)", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Island", 6), hand: ["Kitsune, Dragon's Daughter"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        p3: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      const dragon = idOf(s, "p3", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Kitsune, Dragon's Daughter"), (req) =>
        req.intent === "may" ? [1] : pickIds(req, [angel, dragon]),
      );
      expect(s.objects[angel]?.controller).toBe("p3");
      expect(s.objects[dragon]?.controller).toBe("p2");
      expect(s.objects[cub]?.controller).toBe("p2");
    });

    it("Kitsune, Dragon's Daughter: you may decline the exchange", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Kitsune, Dragon's Daughter"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Kitsune, Dragon's Daughter"), (req) =>
        req.intent === "may" ? [0] : pickIds(req, [bear, angel]),
      );
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Kitsune, Dragon's Daughter: the exchange also triggers when she deals combat damage to a player", () => {
      let s = scenario({
        p1: { battlefield: ["Kitsune, Dragon's Daughter", { name: "Bear Cub", tapped: true }] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const kitsune = idOf(s, "p1", "battlefield", "Kitsune, Dragon's Daughter");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = throughCombat(attack(s, [kitsune]), (req) => (req.intent === "may" ? [1] : pickIds(req, [bear, angel])));
      expect(s.players.p2?.life).toBe(14);
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[angel]?.controller).toBe("p1");
    });

    it("Kitsune's Technique: the targeted opponent mills half their library, rounded up", () => {
      const run = (size: number) => {
        const s = scenario({
          p1: { battlefield: lands("Island", 6), hand: ["Kitsune's Technique"] },
          p2: { library: lands("Forest", size) },
        });
        const t = settle(cast(s, "p1", "Kitsune's Technique", { targets: { t: ["p2"] } }));
        return [t.players.p2?.graveyard.length, t.players.p2?.library.length];
      };
      expect(run(7)).toEqual([4, 3]);
      expect(run(6)).toEqual([3, 3]);
      expect(run(1)).toEqual([1, 0]);
    });

    it("Krang, Master Mind: affinity for artifacts; draws up to four cards; +1/+0 per other artifact", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6), "Expedition Map", "Buzz Bots"], hand: ["Krang, Master Mind", "Opt"] },
      });
      s = settle(cast(s, "p1", "Krang, Master Mind"));
      const krang = idOf(s, "p1", "battlefield", "Krang, Master Mind");
      // Eight mana minus two artifacts: the six Islands suffice.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && !s.objects[id]?.tapped)).toHaveLength(0);
      // One card in hand (Opt): he draws three.
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(pt(s, krang)).toEqual([3, 4]);
    });

    it("Krang, Master Mind: with four or more cards in hand, nothing is drawn", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 8), hand: ["Krang, Master Mind", "Opt", "Opt", "Opt", "Opt"] },
      });
      s = settle(cast(s, "p1", "Krang, Master Mind"));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Metalhead: returns up to one other artifact or creature; {R}, sacrifice another artifact: counter, menace, haste", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 5), "Mountain", "Expedition Map"], hand: ["Metalhead"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Metalhead"), (req) => pickIds(req, [angel]));
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
      const metal = idOf(s, "p1", "battlefield", "Metalhead");
      s = settle(activate(s, "p1", metal));
      expect(idsOf(s, "p1", "graveyard", "Expedition Map")).toHaveLength(1);
      expect(s.objects[metal]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, metal).keywords).toEqual(expect.arrayContaining(["menace", "haste"]));
      // Entered this turn, it can attack thanks to haste.
      s = throughCombat(attack(s, [metal]));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Mind Transfer Protocol: an artifact becomes a 4/5 artifact creature until end of turn; draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), "Expedition Map"],
          hand: ["Mind Transfer Protocol"],
          library: lands("Swamp", 3),
        },
      });
      const map = idOf(s, "p1", "battlefield", "Expedition Map");
      s = settle(cast(s, "p1", "Mind Transfer Protocol", { targets: { t: [map] } }));
      expect(chars(s, map).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, map)).toEqual([4, 5]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, map).types).not.toContain("Creature");
    });

    it("Ooze Spill: counters the targeted spell and creates a Mutagen", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        p2: { battlefield: lands("Island", 3), hand: ["Ooze Spill"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      const strike = s.stack[0]?.id as string;
      s = settle(cast(s, "p2", "Ooze Spill", { targets: { t: [strike] } }));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Ray Fillet, Man Ray: a Mutagen on entering; {2}, remove a +1/+1 counter from one of your creatures: draw", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: ["Ray Fillet, Man Ray"],
          library: lands("Swamp", 3),
        },
      });
      s = settle(cast(s, "p1", "Ray Fillet, Man Ray"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      const ray = idOf(s, "p1", "battlefield", "Ray Fillet, Man Ray");
      expect(chars(s, ray).keywords).toContain("flying");
      s = settle(activate(s, "p1", ray));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      // No counter left: the ability can no longer be activated.
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ray)).toBe(false);
    });

    it("Renet, Temporal Apprentice: returns each other nonland permanent that entered this turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 5), { name: "Bear Cub", sick: true }, "Serra Angel", { name: "Forest", sick: true }],
          hand: ["Renet, Temporal Apprentice"],
        },
        p2: { battlefield: [{ name: "Fire Elemental", sick: true }, "Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Renet, Temporal Apprentice"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Fire Elemental"]);
      expect(idsOf(s, "p1", "battlefield", "Renet, Temporal Apprentice")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("Renet: a permanent whose control changed this turn didn't enter this turn (PLAN-M M8b)", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Renet, Temporal Apprentice"] },
        p2: { battlefield: ["Llanowar Elves", { name: "Bear Cub", sick: true }] },
      });
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = steal(s, elves, "p1");
      expect(s.objects[elves]?.controlledSince).toBe(s.turn.number);
      s = settle(cast(s, "p1", "Renet, Temporal Apprentice"));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Bear Cub"]);
    });

    it("Retro-Mutation: the enchanted creature is a base 0/1 Turtle, with no abilities, that can't attack", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 3), "Serra Angel"], hand: ["Retro-Mutation"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Retro-Mutation", { targets: { enchant: [angel] } }));
      const c = chars(s, angel);
      expect([c.power, c.toughness]).toEqual([0, 1]);
      expect(c.subtypes).toEqual(["Turtle"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.keywords).not.toContain("vigilance");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: angel, defender: "p2" }] })).toThrow();
    });

    it("Return to the Sewers: the owner puts the creature on top or on the bottom; you create a Mutagen", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Return to the Sewers"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Forest", 3) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let chooser = "";
      s = cast(s, "p1", "Return to the Sewers", { targets: { t: [angel] } });
      s = settle(s, (req, _player, cur) => {
        if (req.intent === "topOrBottom" && cur.pending?.kind === "choice") {
          chooser = cur.pending.player;
          return ["top"];
        }
        return undefined;
      });
      expect(chooser).toBe("p2");
      expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Serra Angel");
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Sewer-veillance Cam: on entering and on leaving, tap or untap a creature; {3}{U}, sacrifice: draw two", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Sewer-veillance Cam"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // No mode: the target on trigger, then "tap?" (or "untap?") during resolution (608.2d).
      const asked: string[] = [];
      const answer = (req: ChoiceRequest) => {
        asked.push(req.type === "yesNo" ? req.prompt : req.intent);
        return req.type === "yesNo" ? [1] : pickIds(req, [angel]);
      };
      s = settle(cast(s, "p1", "Sewer-veillance Cam"), answer);
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(asked).not.toContain("triggerMode");
      expect(asked.some((p) => p.includes("Tap target creature?"))).toBe(true);
      const cam = idOf(s, "p1", "battlefield", "Sewer-veillance Cam");
      s = settle(activate(s, "p1", cam), answer);
      expect(asked.some((p) => p.includes("Untap target creature?"))).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Sewer-veillance Cam")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp", "Swamp"]);
      expect(s.objects[angel]?.tapped).toBe(false);
    });

    it("Stockman, Mad Fly-entist: on entering, draw a card, then discard a card", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Stockman, Mad Fly-entist", "Opt"], library: lands("Swamp", 3) },
      });
      let discardOptions: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Stockman, Mad Fly-entist"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        discardOptions = namesIn(cur, req.options);
        return pickNamed(cur, req, "Opt");
      });
      expect(discardOptions.sort()).toEqual(["Opt", "Swamp"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    });

    it("Turtles in Time: all creatures in hand; those who want shuffle hand and graveyard and draw seven cards", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 7), "Bear Cub"], hand: ["Turtles in Time", "Opt"], graveyard: ["Opt"] },
        p2: { battlefield: ["Serra Angel"], hand: ["Opt"], graveyard: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Turtles in Time"), (req, _player, cur) =>
        req.intent === "may" && cur.pending?.kind === "choice" ? [cur.pending.player === "p1" ? 1 : 0] : undefined,
      );
      // p1: Bear Cub, Opt and the graveyard shuffled, then seven cards drawn.
      expect(s.players.p1?.hand).toHaveLength(7);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(10 + 3 - 7);
      // p2 declines: the Angel is in their hand, their graveyard stays.
      expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Opt", "Serra Angel"]);
      expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Lightning Strike"]);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      // Turtles in Time is exiled.
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Turtles in Time"]);
    });

    it("Utrom Scientists: taps up to one creature and puts a stun counter on it", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Utrom Scientists"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Utrom Scientists"), (req) => pickIds(req, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(1);
      // The counter is removed instead of untapping the Angel.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun ?? 0).toBe(0);
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  /** Passes and answers choices until `until` (defenders don't block, nobody attacks). */
  const playUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 400 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else break;
    }
    return cur;
  };
  /** Resolves the stack and pending triggers, answering choices. */
  const settle = (s: S, answer: Answer = () => undefined): S =>
    playUntil(s, (x) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0, answer);
  const throughCombat = (s: S, answer: Answer = () => undefined): S => playUntil(s, (x) => x.turn.step === "main2", answer);
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Selects among a choice's options the objects named `name` (at most `n`). */
  const pickNamed = (s: S, req: ChoiceRequest, name: string, n = 1) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, n) : undefined;
  const answerNamed =
    (name: string, n = 1): Answer =>
    (req, _player, cur) => {
      const picked = pickNamed(cur, req, name, n);
      return picked?.length ? picked : undefined;
    };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Something left the battlefield under p1's control (Disappear). */
  const disappear = (s: S, name = "Llanowar Elves") => {
    destroy(s, idOf(s, "p1", "battlefield", name));
    return settle(s);
  };
  /** Goes to p1's end step, all its triggers resolved. */
  const toEndStep = (s: S, answer: Answer = () => undefined) =>
    playUntil(
      s,
      (x) =>
        x.turn.step === "end" &&
        x.pending?.kind === "priority" &&
        x.pending.player === "p1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0,
      answer,
    );

  describe("Teenage Mutant Ninja Turtles, lot A — noir", () => {
    it("Anchovy & Banana Pizza: destroys a creature on entering; Food: {2}, {T}, sacrifice it: 3 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Anchovy & Banana Pizza"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Anchovy & Banana Pizza"), answerNamed("Serra Angel"));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      const pizza = idOf(s, "p1", "battlefield", "Anchovy & Banana Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      s = settle(activate(s, "p1", pizza));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Anchovy & Banana Pizza")).toHaveLength(1);
    });

    it("Armaggon, Future Shark: destroys up to three targeted creatures", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 8), hand: ["Armaggon, Future Shark"] },
        p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Armaggon, Future Shark"), answerNamed("Bear Cub", 3));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(3);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(pt(s, idOf(s, "p1", "battlefield", "Armaggon, Future Shark"))).toEqual([9, 6]);
    });

    it("Bebop, Warthog Warrior: menace; your Rhinos have menace (not other creatures)", () => {
      const rhino = customCard({ name: "Test Rhino", typeLine: "Creature — Rhino", subtypes: ["Rhino"], power: 3, toughness: 3 });
      const s = scenario({ p1: { battlefield: ["Bebop, Warthog Warrior", rhino, "Bear Cub"] }, p2: { battlefield: [rhino] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bebop, Warthog Warrior")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Test Rhino")).keywords).toContain("menace");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
      expect(chars(s, idOf(s, "p2", "battlefield", "Test Rhino")).keywords).not.toContain("menace");
    });

    it("The Cloning of Shredder: I exiles a creature card and creates a non-legendary Mutant copy of it; II creates another", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["The Cloning of Shredder"], graveyard: ["Splinter, Hamato Yoshi"] },
      });
      s = settle(cast(s, "p1", "The Cloning of Shredder"), answerNamed("Splinter, Hamato Yoshi"));
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(namesIn(s, s.exile)).toEqual(["Splinter, Hamato Yoshi"]);
      const first = idOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(s.objects[first]?.isToken).toBe(true);
      expect(chars(s, first).supertypes).not.toContain("Legendary");
      expect(chars(s, first).subtypes).toEqual(expect.arrayContaining(["Mutant", "Ninja", "Rat"]));
      expect(pt(s, first)).toEqual([1, 3]);
      // Chapter II, after p1's next turn draw: a second copy; no legend rule.
      s = playUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3 && x.stack.length === 0);
      s = settle(s);
      const copies = idsOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(copies).toHaveLength(2);
      // Each copy gives +1/+1 to the other Ninja.
      for (const id of copies) expect(pt(s, id)).toEqual([2, 4]);
    });

    it("Death in the Family: exiles a creature with mana value 3 or less", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Death in the Family"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Death in the Family", { targets: { t: [angel] } })).toThrow();
      s = settle(cast(s, "p1", "Death in the Family", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Foot Mystic: lifelink; Disappear — a 1/1 black Ninja only if a permanent left under your control this turn", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Foot Mystic"] },
          p2: { battlefield: ["Bear Cub"] },
        });
      let s = settle(cast(setup(), "p1", "Foot Mystic"));
      expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Foot Mystic")).keywords).toContain("lifelink");
      // An opposing creature that dies doesn't count.
      let t = setup();
      destroy(t, idOf(t, "p2", "battlefield", "Bear Cub"));
      t = settle(cast(settle(t), "p1", "Foot Mystic"));
      expect(idsOf(t, "p1", "battlefield", "Ninja")).toHaveLength(0);
      s = settle(cast(disappear(setup()), "p1", "Foot Mystic"));
      const ninja = idOf(s, "p1", "battlefield", "Ninja");
      expect(pt(s, ninja)).toEqual([1, 1]);
      expect(chars(s, ninja).colors).toEqual(["B"]);
    });

    it("Insectoid Exterminator: Disappear — scry 1 at your end step", () => {
      const setup = () =>
        scenario({ p1: { battlefield: ["Insectoid Exterminator", "Llanowar Elves"], library: ["Opt", "Island", "Swamp"] } });
      let asked = false;
      const bottom: Answer = (req) => {
        if (req.intent !== "scryBottom" || req.type !== "pick") return undefined;
        asked = true;
        return req.options;
      };
      let s = toEndStep(setup(), bottom);
      expect(asked).toBe(false);
      s = toEndStep(disappear(setup()), bottom);
      expect(asked).toBe(true);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Insectoid Exterminator")).keywords).toContain("flying");
    });

    it("Lord Dregg: Disappear — a 1/1 flying Insect Warrior at the end step; {3}{G}, sacrifice a token: draw", () => {
      let s = scenario({ p1: { battlefield: ["Lord Dregg, Insect Invader", "Llanowar Elves", ...lands("Forest", 4)] } });
      s = toEndStep(disappear(s));
      const insect = idOf(s, "p1", "battlefield", "Insect Warrior");
      expect(pt(s, insect)).toEqual([1, 1]);
      expect(chars(s, insect).colors).toEqual(["B"]);
      expect(chars(s, insect).keywords).toContain("flying");
      const dregg = idOf(s, "p1", "battlefield", "Lord Dregg, Insect Invader");
      const hand = s.players.p1?.hand.length ?? 0;
      // Lord Dregg isn't a token: he can't pay this cost.
      expect(() => activate(s, "p1", dregg, "token", { sacrifice: [dregg] })).toThrow();
      s = settle(activate(s, "p1", dregg, "token", { sacrifice: [insect] }));
      expect(idsOf(s, "p1", "battlefield", "Insect Warrior")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      // With no token, no more activation is possible.
      expect(canActivate(s, "p1", dregg)).toBe(false);
    });

    describe("Madame Null, Power Broker", () => {
      const setup = (life = 20) =>
        scenario({ p1: { life, battlefield: ["Madame Null, Power Broker", ...lands("Forest", 2)], hand: ["Bear Cub"] } });

      it("another creature enters: pay life equal to its power for that many +1/+1 counters", () => {
        let asked = false;
        const s = settle(cast(setup(), "p1", "Bear Cub"), (req) => {
          if (req.intent !== "may") return undefined;
          asked = true;
          return [1];
        });
        expect(asked).toBe(true);
        expect(s.players.p1?.life).toBe(18);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(pt(s, bear)).toEqual([4, 4]);
      });

      it("decline: no life paid and no counters; no offer if your life isn't enough", () => {
        let s = settle(cast(setup(), "p1", "Bear Cub"), (req) => (req.intent === "may" ? [0] : undefined));
        expect(s.players.p1?.life).toBe(20);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
        let asked = false;
        s = settle(cast(setup(1), "p1", "Bear Cub"), (req) => {
          if (req.intent === "may") asked = true;
          return undefined;
        });
        expect(asked).toBe(false);
        expect(s.players.p1?.life).toBe(1);
      });

      it("it is life paid: Ashiok, Wicked Manipulator replaces it with exiling cards from the top (PLAN-H, H2)", () => {
        let s = scenario({
          p1: {
            battlefield: ["Madame Null, Power Broker", "Ashiok, Wicked Manipulator", ...lands("Forest", 2)],
            hand: ["Bear Cub"],
            library: lands("Forest", 6),
          },
        });
        s = settle(cast(s, "p1", "Bear Cub"), (req) => (req.intent === "may" ? [1] : undefined));
        expect(s.players.p1?.life).toBe(20);
        expect(s.players.p1?.library).toHaveLength(4);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
      });
    });

    it("Oroku Saki, Shredder Rising: combat damage to a player — you draw a card and lose 1 life", () => {
      let s = scenario({ p1: { battlefield: ["Oroku Saki, Shredder Rising"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Oroku Saki, Shredder Rising")]));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Pain 101: deathtouch; when it dies, it returns tapped under its owner's control", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Pain 101"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Pain 101", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("deathtouch");
      destroy(s, bear);
      s = settle(s);
      const back = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.objects[back]?.controller).toBe("p2");
      // New object: the effect no longer applies.
      expect(chars(s, back).keywords).not.toContain("deathtouch");
      destroy(s, back);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Paramecia Coloniex", () => {
      it("on entering, mill three cards", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Paramecia Coloniex"], library: ["Opt", "Island", "Swamp", "Forest"] },
        });
        s = settle(cast(s, "p1", "Paramecia Coloniex"));
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Swamp"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
      });

      it("when it dies, exile it: a creature card from your graveyard on top of the library", () => {
        let s = scenario({
          p1: { battlefield: ["Paramecia Coloniex"], graveyard: ["Serra Angel", "Bear Cub", "Opt"], library: ["Island"] },
        });
        destroy(s, idOf(s, "p1", "battlefield", "Paramecia Coloniex"));
        let options: (string | undefined)[] = [];
        s = settle(s, (req, _player, cur) => {
          if (req.intent === "may") return [1];
          if (req.type === "pick") {
            options = namesIn(cur, req.options);
            return pickNamed(cur, req, "Serra Angel");
          }
          return undefined;
        });
        // Only creature cards that stayed in the graveyard are offered.
        expect(options.sort()).toEqual(["Bear Cub", "Serra Angel"]);
        expect(namesIn(s, s.exile)).toEqual(["Paramecia Coloniex"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Serra Angel", "Island"]);
      });

      it("if you don't exile it, nothing moves", () => {
        let s = scenario({ p1: { battlefield: ["Paramecia Coloniex"], graveyard: ["Serra Angel"], library: ["Island"] } });
        destroy(s, idOf(s, "p1", "battlefield", "Paramecia Coloniex"));
        s = settle(s, (req) => (req.intent === "may" ? [0] : undefined));
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Paramecia Coloniex", "Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
      });
    });

    it("Savanti Romero: at the beginning of combat, a +1/+1 counter, then draw X and lose X life (X: its counters)", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Savanti Romero, Time's Exile", counters: { "+1/+1": 2 } }] } });
      s = throughCombat(s);
      const savanti = idOf(s, "p1", "battlefield", "Savanti Romero, Time's Exile");
      expect(s.objects[savanti]?.counters["+1/+1"]).toBe(3);
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.life).toBe(17);
      expect(chars(s, savanti).keywords).toContain("trample");
    });

    it("Shark Shredder: combat damage — a creature card from its graveyard enters under your control, tapped and attacking", () => {
      let s = scenario({ p1: { battlefield: ["Shark Shredder, Killer Clone"] }, p2: { graveyard: ["Serra Angel", "Opt"] } });
      const shark = idOf(s, "p1", "battlefield", "Shark Shredder, Killer Clone");
      expect(chars(s, shark).keywords).toContain("firstStrike");
      let options: (string | undefined)[] = [];
      s = playUntil(
        attack(s, [shark]),
        (x) => idsOf(x, "p1", "battlefield", "Serra Angel").length > 0 && x.stack.length === 0,
        (req, _player, cur) => {
          if (req.type !== "pick") return undefined;
          options = namesIn(cur, req.options);
          return pickNamed(cur, req, "Serra Angel");
        },
      );
      expect(options).toContain("Serra Angel");
      expect(options).not.toContain("Opt");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.owner).toBe("p2");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((a) => a.id === angel && a.defender === "p2")).toBe(true);
      expect(s.players.p2?.life).toBe(16);
      // Entered after the first-strike damage, the unblocked Angel deals damage in the regular damage step (510.4).
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(12);
    });

    it("Shredder, Unrelenting: on entering or attacking, another of your creatures gains deathtouch", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Shredder, Unrelenting"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Shredder, Unrelenting"), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options as string[];
        return [bear];
      });
      const shredder = idOf(s, "p1", "battlefield", "Shredder, Unrelenting");
      expect(options).not.toContain(shredder);
      expect(chars(s, bear).keywords).toContain("deathtouch");
      expect(chars(s, shredder).keywords).toContain("deathtouch");
      // On attacking (a turn later): the Bear Cub regains deathtouch.
      let t = scenario({ p1: { battlefield: ["Shredder, Unrelenting", "Bear Cub"] } });
      const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(chars(t, bear2).keywords).not.toContain("deathtouch");
      t = settle(attack(t, [idOf(t, "p1", "battlefield", "Shredder, Unrelenting")]), (req) =>
        req.type === "pick" && req.options.includes(bear2) ? [bear2] : undefined,
      );
      expect(chars(t, bear2).keywords).toContain("deathtouch");
    });

    describe("Shredder's Armor", () => {
      it("on entering, attaches to one of your creatures: +2/+1", () => {
        let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Shredder's Armor"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Shredder's Armor"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
        );
        expect(s.objects[idOf(s, "p1", "battlefield", "Shredder's Armor")]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 3]);
      });

      it("Equip — sacrifice another nonland permanent, only once per turn", () => {
        let s = scenario({
          p1: { battlefield: ["Shredder's Armor", "Bear Cub", "Llanowar Elves", "Llanowar Elves", "Swamp"] },
        });
        const armor = idOf(s, "p1", "battlefield", "Shredder's Armor");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const [elf1, elf2] = idsOf(s, "p1", "battlefield", "Llanowar Elves") as [string, string];
        // A land doesn't pay this cost.
        expect(() =>
          activate(s, "p1", armor, "Equip", { targets: { t: [bear] }, sacrifice: [idOf(s, "p1", "battlefield", "Swamp")] }),
        ).toThrow();
        s = settle(activate(s, "p1", armor, "Equip", { targets: { t: [bear] }, sacrifice: [elf1] }));
        expect(s.objects[armor]?.attachedTo).toBe(bear);
        expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(pt(s, bear)).toEqual([4, 3]);
        // Only once per turn, even with another Elf to sacrifice.
        expect(() => activate(s, "p1", armor, "Equip", { targets: { t: [elf2] }, sacrifice: [elf2] })).toThrow();
      });
    });

    describe("Shredder's Revenge", () => {
      it("mode 1: the targeted player discards two cards", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Revenge"] },
          p2: { hand: ["Opt", "Opt", "Island"] },
        });
        s = settle(cast(s, "p1", "Shredder's Revenge", { mode: 0, targets: { t: ["p2"] } }));
        expect(s.players.p2?.hand).toHaveLength(1);
        expect(s.players.p2?.graveyard).toHaveLength(2);
      });

      it("mode 2: the targeted player draws two cards and loses 2 life", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Revenge"] } });
        s = settle(cast(s, "p1", "Shredder's Revenge", { mode: 1, targets: { t: ["p1"] } }));
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(s.players.p1?.life).toBe(18);
        expect(s.players.p2?.life).toBe(20);
      });
    });

    it("Shredder's Technique: destroys a creature or an enchantment; a destroyed enchantment costs you 2 life", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Technique"] },
          p2: { battlefield: ["Bear Cub", "Warleader's Call"] },
        });
      let s = setup();
      s = settle(cast(s, "p1", "Shredder's Technique", { targets: { t: [idOf(s, "p2", "battlefield", "Warleader's Call")] } }));
      expect(idsOf(s, "p2", "graveyard", "Warleader's Call")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(18);
      let t = setup();
      t = settle(cast(t, "p1", "Shredder's Technique", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(t.players.p1?.life).toBe(20);
    });

    it("Shredder's Technique: an indestructible enchantment isn't destroyed, no life lost (PLAN-H, H2)", () => {
      const ward = customCard({
        name: "Enchantement indestructible",
        typeLine: "Enchantment",
        types: ["Enchantment"],
        keywords: ["indestructible"],
      });
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Shredder's Technique"] }, p2: { battlefield: [ward] } });
      s = settle(cast(s, "p1", "Shredder's Technique", { targets: { t: [idOf(s, "p2", "battlefield", ward.name)] } }));
      expect(idsOf(s, "p2", "battlefield", ward.name)).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
    });

    it("South Wind Avatar: another of your creatures dies — life equal to its toughness; each gain makes each opponent lose 1 life", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["South Wind Avatar", "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Serra Angel"));
      s = settle(s);
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([24, 19, 19]);
      // An opposing creature that dies gains nothing.
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = settle(s);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([24, 19]);
    });

    it("Splinter, Hamato Yoshi: menace; your other Ninjas have +1/+1", () => {
      const s = scenario({
        p1: { battlefield: ["Splinter, Hamato Yoshi", "Foot Mystic", "Bear Cub"] },
        p2: { battlefield: ["Foot Mystic"] },
      });
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Hamato Yoshi");
      expect(pt(s, splinter)).toEqual([1, 3]);
      expect(chars(s, splinter).keywords).toContain("menace");
      expect(pt(s, idOf(s, "p1", "battlefield", "Foot Mystic"))).toEqual([3, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Foot Mystic"))).toEqual([2, 4]);
    });

    it("Splinter's Technique: search for a card, put it into your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Splinter's Technique"], library: ["Island", "Serra Angel", "Opt"] },
      });
      s = settle(cast(s, "p1", "Splinter's Technique"), answerNamed("Serra Angel"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Stomped by the Foot: -2/-2; kicked by sacrificing an artifact or a creature, -5/-5", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Stomped by the Foot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Stomped by the Foot", { targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([2, 2]);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Stomped by the Foot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel2 = idOf(t, "p2", "battlefield", "Serra Angel");
      t = act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Stomped by the Foot"),
        kicked: true,
        targets: { t: [angel2] },
      });
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      t = settle(t);
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Super Shredder: whenever another permanent leaves the battlefield, a +1/+1 counter", () => {
      let s = scenario({
        p1: { battlefield: ["Super Shredder", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", "Warleader's Call"] },
      });
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p2", "battlefield", "Llanowar Elves"));
      destroy(s, idOf(s, "p2", "battlefield", "Warleader's Call"));
      s = settle(s);
      const shredder = idOf(s, "p1", "battlefield", "Super Shredder");
      expect(s.objects[shredder]?.counters["+1/+1"]).toBe(3);
      expect(pt(s, shredder)).toEqual([4, 4]);
    });

    it("Tunnel Rats: {4}{B} from the graveyard, it returns tapped", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), graveyard: ["Tunnel Rats"] } });
      const rats = idOf(s, "p1", "graveyard", "Tunnel Rats");
      s = settle(activate(s, "p1", rats));
      const back = idOf(s, "p1", "battlefield", "Tunnel Rats");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      // From the battlefield, the ability isn't offered.
      expect(canActivate(s, "p1", back)).toBe(false);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Chooses `id` in a choice that offers it. */
  const pickId =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const hit = ids.find((id) => req.options.includes(id));
      return hit ? [hit] : undefined;
    };
  const triggerMode =
    (index: number): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : undefined;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  describe("Teenage Mutant Ninja Turtles, lot A — rouge", () => {
    it("Bot Bashing Time: 6 damage to a creature, exiled if it would die this turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Bot Bashing Time"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Bot Bashing Time", { targets: { t: [dragon] } }));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shivan Dragon"]);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Broadcast Takeover: you control the opposing artifacts until end of turn, untapped and with haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Broadcast Takeover"] },
        p2: { battlefield: [{ name: "Ravenous Robots", tapped: true }, "Fishing Pole", "Bear Cub"] },
      });
      const robots = idOf(s, "p2", "battlefield", "Ravenous Robots");
      const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Broadcast Takeover"));
      expect(s.objects[robots]?.controller).toBe("p1");
      expect(s.objects[pole]?.controller).toBe("p1");
      // Only the artifacts.
      expect(s.objects[bear]?.controller).toBe("p2");
      expect(s.objects[robots]?.tapped).toBe(false);
      expect(chars(s, robots).keywords).toContain("haste");
      // Entered under your control this turn, it attacks thanks to haste.
      s = settle(attack(s, [robots]));
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(18);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[robots]?.controller).toBe("p2");
      expect(s.objects[pole]?.controller).toBe("p2");
    });

    it("Casey Jones, Jury-Rig Justiciar: haste; an artifact card among the top four, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 2),
          hand: ["Casey Jones, Jury-Rig Justiciar"],
          library: ["Opt", "Fishing Pole", "Island", "Bear Cub", "Swamp", "Forest"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Casey Jones, Jury-Rig Justiciar"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Fishing Pole");
      });
      // Only artifact cards are offered.
      expect(offered).toEqual(["Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fishing Pole"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library.slice(0, 2)).toEqual(["Swamp", "Forest"]);
      expect([...library.slice(2)].sort()).toEqual(["Bear Cub", "Island", "Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Casey Jones, Jury-Rig Justiciar")).keywords).toContain("haste");
    });

    describe("General Traag, Heart of Stone", () => {
      it("on entering, sacrificing another artifact deals 4 damage to a targeted creature", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole"], hand: ["General Traag, Heart of Stone"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        let sacOptions: string[] = [];
        s = settle(cast(s, "p1", "General Traag, Heart of Stone"), (req, _player, cur) => {
          if (req.type === "pick" && req.options.includes(pole)) sacOptions = req.options;
          return pickId(pole, angel)(req, "p1", cur);
        });
        // Traag himself isn't offered: "another artifact".
        expect(sacOptions).toEqual([pole]);
        expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(chars(s, idOf(s, "p1", "battlefield", "General Traag, Heart of Stone")).keywords).toContain("trample");
      });

      it("without a sacrifice, no damage", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole"], hand: ["General Traag, Heart of Stone"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "General Traag, Heart of Stone"), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Fishing Pole")).toHaveLength(1);
        expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage ?? 0).toBe(0);
      });
    });

    it("Hard-Won Jitte: the equipped creature has double strike (Equip {2})", () => {
      let s = scenario({ p1: { battlefield: ["Hard-Won Jitte", "Bear Cub", ...lands("Mountain", 2)] } });
      const jitte = idOf(s, "p1", "battlefield", "Hard-Won Jitte");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      s = settle(activate(s, "p1", jitte, "Equip", { targets: { t: [bear] } }));
      expect(s.objects[jitte]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = settle(attack(s, [bear]));
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Improvised Arsenal: +1/+0 per artifact you control; {4}{R}: a token copy of the Equipment", () => {
      let s = scenario({ p1: { battlefield: ["Improvised Arsenal", "Fishing Pole", "Bear Cub", ...lands("Mountain", 6)] } });
      const arsenal = idOf(s, "p1", "battlefield", "Improvised Arsenal");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", arsenal, "Equip ⟨", { targets: { t: [bear] } }));
      expect(s.objects[arsenal]?.attachedTo).toBe(bear);
      // Two artifacts: the Arsenal and the Fishing Pole.
      expect(pt(s, bear)).toEqual([4, 2]);
      s = settle(activate(s, "p1", arsenal, "copy"));
      const copies = idsOf(s, "p1", "battlefield", "Improvised Arsenal");
      expect(copies).toHaveLength(2);
      expect(copies.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
      // The token is one more artifact.
      expect(pt(s, bear)).toEqual([5, 2]);
    });

    it("Jennika's Technique: 2 damage to each creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Jennika's Technique"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Jennika's Technique"));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    });

    describe("Manhole Missile", () => {
      it("3 damage; a card from hand to the bottom of the library, then draw", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Manhole Missile", "Opt"], library: ["Island", "Swamp"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const elemental = idOf(s, "p2", "battlefield", "Fire Elemental");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(cast(s, "p1", "Manhole Missile", { targets: { t: [elemental] } }), pickId(opt));
        expect(s.objects[elemental]?.damage).toBe(3);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Swamp", "Opt"]);
      });

      it("with no card put on the bottom, no draw", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Manhole Missile", "Opt"], library: ["Island", "Swamp"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Manhole Missile", { targets: { t: [bear] } }), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(s.players.p1?.library).toHaveLength(2);
      });
    });

    it("Mouser Attack!: a colorless 1/1 Robot, or +3/+0 and first strike", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Mouser Attack!", "Mouser Attack!"] },
      });
      s = settle(cast(s, "p1", "Mouser Attack!", { mode: 0 }));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect(pt(s, robot)).toEqual([1, 1]);
      expect(chars(s, robot).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, robot).colors).toEqual([]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Mouser Attack!", { mode: 1, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
    });

    it("Mouser Foundry: a Robot on entering and one on leaving; {4}{R}, sacrifice: 3 damage to a creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 7), hand: ["Mouser Foundry"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Mouser Foundry"));
      expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      const foundry = idOf(s, "p1", "battlefield", "Mouser Foundry");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", foundry, undefined, { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Mouser Foundry")).toHaveLength(1);
      expect(s.objects[angel]?.damage).toBe(3);
      expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(2);
    });

    it("Mutant Town Musicians: Alliance — +1/+0 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Mutant Town Musicians", "Forest"], hand: ["Llanowar Elves"] } });
      const musicians = idOf(s, "p1", "battlefield", "Mutant Town Musicians");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(pt(s, musicians)).toEqual([3, 4]);
      expect(chars(s, musicians).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, musicians)).toEqual([2, 4]);
    });

    describe("Null Group Biological Assets", () => {
      it("first strike during your turn only", () => {
        const mine = scenario({ p1: { battlefield: ["Null Group Biological Assets"] } });
        expect(chars(mine, idOf(mine, "p1", "battlefield", "Null Group Biological Assets")).keywords).toContain("firstStrike");
        const theirs = scenario({ active: "p2", p1: { battlefield: ["Null Group Biological Assets"] } });
        expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Null Group Biological Assets")).keywords).not.toContain(
          "firstStrike",
        );
      });

      it("when it attacks, you may discard a card to draw one", () => {
        let s = scenario({ p1: { battlefield: ["Null Group Biological Assets"], hand: ["Opt"], library: lands("Island", 3) } });
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Null Group Biological Assets")]), pickId(opt));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });
    });

    it("Old Hob, Alleycat Blues: a 2/2 Mutant with haste in combat, destroyed at the end step; {1}{W}: indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Old Hob, Alleycat Blues", "Bear Cub", "Plains", "Mountain"] } });
      s = advanceUntil(
        s,
        (x) =>
          x.turn.step === "beginCombat" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          idsOf(x, "p1", "battlefield", "Mutant").length > 0,
      );
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect(pt(s, mutant)).toEqual([2, 2]);
      expect(chars(s, mutant).colors).toEqual(["R"]);
      expect(chars(s, mutant).keywords).toContain("haste");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: mutant, defender: "p2" },
          { id: bear, defender: "p2" },
        ],
      });
      const hob = idOf(s, "p1", "battlefield", "Old Hob, Alleycat Blues");
      // Only an attacking token can be targeted.
      expect(() => activate(s, "p1", hob, undefined, { targets: { t: [bear] } })).toThrow();
      s = settle(activate(s, "p1", hob, undefined, { targets: { t: [mutant] } }));
      expect(chars(s, mutant).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(16);
      // Indestructible until end of turn: the end step destruction has no effect.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
    });

    it("Old Hob: without protection, the Mutant is destroyed at the beginning of the end step", () => {
      let s = scenario({ p1: { battlefield: ["Old Hob, Alleycat Blues"] } });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(0);
      // During the opponent's turn, no token.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main2");
      expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(0);
    });

    it("Purple Dragon Punks: {R} only for an artifact spell or an ability", () => {
      const s = scenario({ p1: { battlefield: ["Purple Dragon Punks"], hand: ["Fishing Pole", "Shock"] } });
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Fishing Pole"))).toBe(true);
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      // An activated ability: equipping the Fishing Pole ({2}).
      const t = scenario({ p1: { battlefield: ["Purple Dragon Punks", "Purple Dragon Punks", "Fishing Pole", "Bear Cub"] } });
      const pole = idOf(t, "p1", "battlefield", "Fishing Pole");
      const after = settle(activate(t, "p1", pole, "Equip", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
      expect(after.objects[pole]?.attachedTo).toBe(idOf(t, "p1", "battlefield", "Bear Cub"));
    });

    it("Raphael, Most Attitude: Alliance — exiles the top card; on attacking, you may play it this turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raphael, Most Attitude", "Forest", "Mountain"],
          hand: ["Llanowar Elves"],
          library: ["Shock", "Island"],
        },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => (req.intent === "may" ? [1] : undefined));
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock"]);
      const shock = s.exile[0] as string;
      const raph = idOf(s, "p1", "battlefield", "Raphael, Most Attitude");
      expect(s.objects[raph]?.linked).toContain(shock);
      expect(chars(s, raph).keywords).toContain("menace");
      expect(canCast(s, "p1", shock)).toBe(false);
      s = settle(attack(s, [raph]));
      expect(canCast(s, "p1", shock)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Raphael, Most Attitude: only one of the cards exiled with him can be played", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raphael, Most Attitude", ...lands("Forest", 2), ...lands("Mountain", 2)],
          hand: ["Llanowar Elves", "Llanowar Elves"],
          library: ["Shock", "Shock", "Island"],
        },
      });
      const yes: Answer = (req) => (req.intent === "may" ? [1] : undefined);
      s = settle(cast(s, "p1", "Llanowar Elves"), yes);
      s = settle(cast(s, "p1", "Llanowar Elves"), yes);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Shock", "Shock"]);
      const [first, second] = s.exile as [string, string];
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Raphael, Most Attitude")]));
      expect(canCast(s, "p1", first) && canCast(s, "p1", second)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(canCast(s, "p1", second)).toBe(false);
    });

    it("Raphael, Most Attitude: the exile is optional", () => {
      let s = scenario({
        p1: { battlefield: ["Raphael, Most Attitude", "Forest"], hand: ["Llanowar Elves"], library: ["Shock", "Island"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => (req.intent === "may" ? [0] : undefined));
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Raphael, Ninja Destroyer: must be blocked; Rage — that much {R}, kept until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, Ninja Destroyer", "Mountain"], hand: ["Shock"] } });
      const raph = idOf(s, "p1", "battlefield", "Raphael, Ninja Destroyer");
      expect(chars(s, raph).keywords).toContain("mustBeBlocked");
      s = settle(cast(s, "p1", "Shock", { targets: { t: [raph] } }));
      expect(s.players.p1?.manaPool.R).toBe(2);
      // The mana stays from one step to the next...
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.manaPool.R).toBe(2);
      // ... but not beyond the turn.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.players.p1?.manaPool.R).toBe(0);
    });

    it("Raphael, the Nightwatcher: your attacking creatures have double strike", () => {
      let s = scenario({
        p1: { battlefield: ["Raphael, the Nightwatcher", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const raph = idOf(s, "p1", "battlefield", "Raphael, the Nightwatcher");
      expect(chars(s, bear).keywords).not.toContain("doubleStrike");
      s = settle(attack(s, [bear]));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      // Raphael doesn't attack: he doesn't have it.
      expect(chars(s, raph).keywords).not.toContain("doubleStrike");
      // The opposing creatures don't either.
      expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(16);
    });

    it("Raphael, Tough Turtle: Alliance — 1 damage to a targeted opponent", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, Tough Turtle", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Raphael's Technique: each player may discard their hand and draw seven cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Raphael's Technique", "Opt"], library: lands("Island", 10) },
        p2: { hand: ["Opt", "Opt"], library: lands("Swamp", 10) },
      });
      s = settle(cast(s, "p1", "Raphael's Technique"), (req, _player, cur) =>
        req.intent === "may" ? [cur.pending?.kind === "choice" && cur.pending.player === "p1" ? 1 : 0] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(lands("Island", 7));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Raphael's Technique"]);
      // p2 declined.
      expect(namesIn(s, s.players.p2?.hand)).toEqual(["Opt", "Opt"]);
    });

    describe("Ravenous Robots", () => {
      it("each artifact spell you cast creates a 1/1 Robot; not other spells", () => {
        let s = scenario({ p1: { battlefield: ["Ravenous Robots", ...lands("Mountain", 2)], hand: ["Fishing Pole", "Shock"] } });
        s = settle(cast(s, "p1", "Fishing Pole"));
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      });

      it("{R}, {T}: your creature tokens gain haste", () => {
        let s = scenario({ p1: { battlefield: ["Ravenous Robots", ...lands("Mountain", 2)], hand: ["Fishing Pole"] } });
        s = settle(cast(s, "p1", "Fishing Pole"));
        const robots = idOf(s, "p1", "battlefield", "Ravenous Robots");
        const token = idOf(s, "p1", "battlefield", "Robot");
        expect(chars(s, token).keywords).not.toContain("haste");
        s = settle(activate(s, "p1", robots));
        expect(s.objects[robots]?.tapped).toBe(true);
        expect(chars(s, token).keywords).toContain("haste");
        expect(chars(s, robots).keywords).not.toContain("haste");
      });
    });

    it("Rock Soldiers: on entering, destroys up to one targeted noncreature artifact", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Rock Soldiers"] },
        p2: { battlefield: ["Fishing Pole", "Ravenous Robots"] },
      });
      const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
      const robots = idOf(s, "p2", "battlefield", "Ravenous Robots");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Rock Soldiers"), (req) => {
        if (req.type !== "pick" || !req.options.includes(pole)) return undefined;
        options = req.options;
        return [pole];
      });
      expect(options).not.toContain(robots);
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Ravenous Robots")).toHaveLength(1);
    });

    it("Slash, Reptile Rampager: Alliance — 2 damage to each opponent; on attacking, a 2/2 Mutant", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Slash, Reptile Rampager", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 18, 18]);
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Slash, Reptile Rampager")]));
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect(pt(s, mutant)).toEqual([2, 2]);
      // The token doesn't attack.
      expect(s.combat?.attackers.map((a) => a.id)).not.toContain(mutant);
    });

    it("Spicy Oatmeal Pizza: 4 damage to any target and 3 to you; {2}, {T}, sacrifice: 3 life", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Spicy Oatmeal Pizza"] } });
      s = settle(cast(s, "p1", "Spicy Oatmeal Pizza"), pickId("p2"));
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.life).toBe(17);
      const pizza = idOf(s, "p1", "battlefield", "Spicy Oatmeal Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      s = settle(activate(s, "p1", pizza));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Spicy Oatmeal Pizza")).toHaveLength(1);
    });

    it("Wingnut, Bat on the Belfry: Alliance — flying, menace or haste, your choice; the other attackers get +1/+0", () => {
      let s = scenario({ p1: { battlefield: ["Wingnut, Bat on the Belfry", "Bear Cub", "Forest"], hand: ["Llanowar Elves"] } });
      const wingnut = idOf(s, "p1", "battlefield", "Wingnut, Bat on the Belfry");
      s = settle(cast(s, "p1", "Llanowar Elves"), triggerMode(0));
      expect(chars(s, wingnut).keywords).toContain("flying");
      expect(chars(s, wingnut).keywords).not.toContain("menace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [wingnut, bear]));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(pt(s, wingnut)).toEqual([1, 2]);
      // The Elves, which entered this turn, don't attack: no bonus.
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    });

    it('Wingnut: "your choice" chosen on resolution (haste)', () => {
      let s = scenario({ p1: { battlefield: ["Wingnut, Bat on the Belfry", "Forest"], hand: ["Llanowar Elves"] } });
      const wingnut = idOf(s, "p1", "battlefield", "Wingnut, Bat on the Belfry");
      let asked = false;
      s = settle(cast(s, "p1", "Llanowar Elves"), (req) => {
        if (req.type !== "pick" || !req.labels) return undefined;
        asked = req.intent !== "triggerMode";
        return Object.keys(req.labels).filter((k) => req.labels?.[k] === "ctx:gains|Haste");
      });
      expect(asked).toBe(true);
      expect(chars(s, wingnut).keywords).toContain("haste");
      expect(chars(s, wingnut).keywords).not.toContain("flying");
    });

    describe("Zog, Triceraton Castaway", () => {
      it("reach, trample; on entering, a targeted creature can't block this turn", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Zog, Triceraton Castaway"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Zog, Triceraton Castaway"), pickId(angel));
        expect(chars(s, angel).keywords).toContain("cantBlock");
        const zog = idOf(s, "p1", "battlefield", "Zog, Triceraton Castaway");
        expect(chars(s, zog).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, angel).keywords).not.toContain("cantBlock");
      });

      it("Mountain cycling {2}: a Mountain card from the library into hand", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 2),
            hand: ["Zog, Triceraton Castaway"],
            library: ["Island", "Mountain", "Forest"],
          },
        });
        const zog = idOf(s, "p1", "hand", "Zog, Triceraton Castaway");
        s = settle(activate(s, "p1", zog), (req, _player, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Mountain").slice(0, 1) : undefined,
        );
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);
        expect(idsOf(s, "p1", "graveyard", "Zog, Triceraton Castaway")).toHaveLength(1);
      });
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  /** Chooses, among a choice's options, the wanted objects; answers "yes" to questions. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Answers "yes" to all questions. */
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  /** Answers "no" to all questions and chooses nothing optional. */
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : req.type === "pick" && req.min === 0 ? [] : undefined);
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const tapFor = (s: S, player: string, source: string, color: ManaType) => {
    const a = legalActions(s, player).find((x) => x.type === "tapForMana" && x.source === source && x.colors.includes(color));
    if (a?.type !== "tapForMana") throw new Error(`${nameOf(s, source)} doesn't produce ${color}`);
    return act(s, player, { type: "tapForMana", source, ability: a.ability, color });
  };
  /** Goes to p2's declare blockers. */
  const toBlockers = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  /** Plays until the next turn (end step included). */
  const toNextTurn = (s: S) => advanceUntil(s, (x) => x.turn.number > s.turn.number);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  describe("Teenage Mutant Ninja Turtles, lot A — vert", () => {
    describe("Courier of Comestibles", () => {
      it("on entering: searches for a Food card and puts it into hand, without creating a token", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Courier of Comestibles"], library: ["Opt", "Guac & Marshmallow Pizza"] },
        });
        let offered: (string | undefined)[] = [];
        s = settle(cast(s, "p1", "Courier of Comestibles"), (req, _player, cur) => {
          if (req.type === "yesNo") return [1];
          if (req.type === "pick") offered = namesIn(cur, req.options);
          return undefined;
        });
        expect(offered).toEqual(["Guac & Marshmallow Pizza"]);
        expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      });

      it("without a card put into hand (declined or no Food): creates a Food token", () => {
        for (const [library, answer] of [
          [["Opt", "Guac & Marshmallow Pizza"], no],
          [["Opt", "Island"], yes],
        ] as const) {
          let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Courier of Comestibles"], library: [...library] } });
          s = settle(cast(s, "p1", "Courier of Comestibles"), answer);
          expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
          expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(0);
        }
      });
    });

    it("Cowabunga!: a Mutant, Ninja, Turtle or land among the top four; the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest"],
          hand: ["Cowabunga!"],
          library: ["Opt", "Michelangelo, Game Master", "Bear Cub", "Island", "Swamp", "Plains"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Cowabunga!"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Michelangelo, Game Master");
      });
      expect(offered.sort()).toEqual(["Island", "Michelangelo, Game Master"]);
      expect(idsOf(s, "p1", "hand", "Michelangelo, Game Master")).toHaveLength(1);
      const library = namesIn(s, s.players.p1?.library);
      expect(library.slice(0, 2)).toEqual(["Swamp", "Plains"]);
      expect(library.slice(2).sort()).toEqual(["Bear Cub", "Island", "Opt"]);
    });

    it("Frog Butler: deathtouch; {T}: one mana of any color; {2}: reach", () => {
      let s = scenario({ p1: { battlefield: ["Frog Butler", ...lands("Forest", 2)] } });
      const frog = idOf(s, "p1", "battlefield", "Frog Butler");
      expect(chars(s, frog).keywords).toContain("deathtouch");
      expect(chars(s, frog).keywords).not.toContain("reach");
      s = settle(activate(s, "p1", frog, "reach"));
      expect(chars(s, frog).keywords).toContain("reach");
      s = tapFor(s, "p1", frog, "U");
      expect(s.players.p1?.manaPool.U).toBe(1);
    });

    it("Groundchuck & Dirtbag: each land tapped for mana adds an additional {G}, not a creature", () => {
      let s = scenario({ p1: { battlefield: ["Groundchuck & Dirtbag", "Island", "Llanowar Elves"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Groundchuck & Dirtbag")).keywords).toContain("trample");
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Island"), "U");
      expect([s.players.p1?.manaPool.U, s.players.p1?.manaPool.G]).toEqual([1, 1]);
      s = tapFor(s, "p1", idOf(s, "p1", "battlefield", "Llanowar Elves"), "G");
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Guac & Marshmallow Pizza: +2/+2 and untaps the targeted creature; {2}, {T}, sacrifice: 3 life", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3)], hand: ["Guac & Marshmallow Pizza"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Guac & Marshmallow Pizza"), picking([bear]));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(s.objects[bear]?.tapped).toBe(false);
      const pizza = idOf(s, "p1", "battlefield", "Guac & Marshmallow Pizza");
      expect(chars(s, pizza).subtypes).toContain("Food");
      // Only two Forests remain: the Food ability.
      s = settle(activate(s, "p1", pizza, "life"));
      expect(s.players.p1?.life).toBe(23);
      expect(idsOf(s, "p1", "graveyard", "Guac & Marshmallow Pizza")).toHaveLength(1);
    });

    describe("Michelangelo, Game Master", () => {
      it("Disappear: a permanent left the battlefield this turn, a +1/+1 counter at your end step", () => {
        let s = scenario({
          p1: { battlefield: ["Michelangelo, Game Master", "Guac & Marshmallow Pizza", ...lands("Forest", 2)] },
        });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Guac & Marshmallow Pizza"), "life"));
        s = toNextTurn(s);
        expect(plusOnes(s, mikey)).toBe(1);
        expect(pt(s, mikey)).toEqual([4, 4]);
      });

      it("without a permanent gone, no counters", () => {
        let s = scenario({ p1: { battlefield: ["Michelangelo, Game Master"] } });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = toNextTurn(s);
        expect(plusOnes(s, mikey)).toBe(0);
      });
    });

    it("Michelangelo, Improviser: combat damage to a player, a creature and a land from hand put into play", () => {
      let s = scenario({
        p1: { battlefield: ["Michelangelo, Improviser"], hand: ["Bear Cub", "Forest", "Island", "Opt"] },
      });
      const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Improviser");
      const bear = idOf(s, "p1", "hand", "Bear Cub");
      const island = idOf(s, "p1", "hand", "Island");
      let offered: (string | undefined)[][] = [];
      s = throughCombat(attack(s, [mikey]), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = [...offered, namesIn(cur, req.options).sort()];
        return req.options.filter((id) => id === bear || id === island);
      });
      expect(s.players.p2?.life).toBe(16);
      expect(offered).toEqual([["Bear Cub"], ["Forest", "Island"]]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Opt"]);
    });

    describe("Michelangelo, Mutant BFF", () => {
      it("creates a Mutagen on entering and on attacking", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Michelangelo, Mutant BFF"] } });
        s = settle(cast(s, "p1", "Michelangelo, Mutant BFF"));
        expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
        let t = scenario({ p1: { battlefield: ["Michelangelo, Mutant BFF"] } });
        t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Michelangelo, Mutant BFF")]));
        expect(idsOf(t, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });

      it("your creatures with a counter can't be blocked by more than one creature", () => {
        let s = scenario({
          p1: { battlefield: ["Michelangelo, Mutant BFF", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
          p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = toBlockers(attack(s, [bear, elves]));
        const double = (target: string) => ({
          type: "declareBlockers" as const,
          blocks: [
            { blocker: angel, attacker: target },
            { blocker: dragon, attacker: target },
          ],
        });
        expect(() => act(s, "p2", double(bear))).toThrow();
        // The Elves, with no counter, can be blocked by two creatures.
        expect(() => act(s, "p2", double(elves))).not.toThrow();
      });
    });

    it("Michelangelo, Weirdness to 11: a Mutagen; +1/+1 counters on your creatures are increased by one", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Michelangelo, Weirdness to 11"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Michelangelo, Weirdness to 11"));
      const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Weirdness to 11");
      const mutagen = idOf(s, "p1", "battlefield", "Mutagen");
      s = settle(activate(s, "p1", mutagen, undefined, { targets: { t: [mikey] } }));
      expect(plusOnes(s, mikey)).toBe(2);
      expect(pt(s, mikey)).toEqual([3, 3]);
      // A Mutagen on an opposing creature: just one counter.
      let t = scenario({
        p1: { battlefield: ["Michelangelo, Weirdness to 11", ...lands("Forest", 4)], hand: ["Mutant Chain Reaction"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Mutant Chain Reaction", { targets: { t: [] } }));
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Mutagen"), undefined, { targets: { t: [bear] } }));
      expect(plusOnes(t, bear)).toBe(1);
    });

    it("Mona Lisa, Science Geek: reach; {T}: X mana of one color, X being her power", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Mona Lisa, Science Geek", counters: { "+1/+1": 2 } }] } });
      const mona = idOf(s, "p1", "battlefield", "Mona Lisa, Science Geek");
      expect(chars(s, mona).keywords).toContain("reach");
      s = tapFor(s, "p1", mona, "R");
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    describe("Mutant Chain Reaction", () => {
      it("destroys a creature with flying and creates a Mutagen; a creature without flying isn't a target", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [bear] } })).toThrow();
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });

      it("destroys an artifact; with no target, still creates a Mutagen", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] },
          p2: { battlefield: ["Fishing Pole"] },
        });
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] } }));
        expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
        let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Mutant Chain Reaction"] } });
        t = settle(cast(t, "p1", "Mutant Chain Reaction", { targets: { t: [] } }));
        expect(idsOf(t, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      });
    });

    it("New Generation's Technique: up to two basic land cards enter tapped", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["New Generation's Technique"],
          library: ["Bear Cub", "Island", "Plains", "Opt"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "New Generation's Technique"), (req, _player, cur) => {
        if (req.type === "pick") offered = namesIn(cur, req.options).sort();
        return undefined;
      });
      expect(offered).toEqual(["Island", "Plains"]);
      const found = [idOf(s, "p1", "battlefield", "Island"), idOf(s, "p1", "battlefield", "Plains")];
      expect(found.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Novel Nunchaku: attaches to your creature, which fights an opposing creature; +1/+1 and trample", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Novel Nunchaku"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Novel Nunchaku"), picking([bear, elves]));
      const nunchaku = idOf(s, "p1", "battlefield", "Novel Nunchaku");
      expect(s.objects[nunchaku]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(1);
    });

    describe("Party Dude", () => {
      it("level 1: each player creates a Food; level 2: an opposing artifact in the graveyard, draw", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 6), hand: ["Party Dude", "Mutant Chain Reaction"] },
        });
        s = settle(cast(s, "p1", "Party Dude"));
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(1);
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        expect(s.objects[dude]).toBeDefined();
        // Level 1 only: destroying the opposing Food doesn't make you draw.
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Food")] } }));
        expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
        expect(s.players.p1?.hand.length).toBe(hand - 1);
      });

      it("level 2: a destroyed opposing artifact makes you draw, not yours", () => {
        let s = scenario({
          p1: { battlefield: ["Party Dude", ...lands("Forest", 8)], hand: ["Mutant Chain Reaction", "Mutant Chain Reaction"] },
          p2: { battlefield: ["Fishing Pole"] },
        });
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        s = settle(activate(s, "p1", dude));
        const hand = s.players.p1?.hand.length ?? 0;
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] } }));
        expect(s.players.p1?.hand.length).toBe(hand); // the spell leaves the hand, one card drawn
        // Your own artifact (the Mutagen) destroyed: nothing.
        s = settle(cast(s, "p1", "Mutant Chain Reaction", { targets: { t: [idOf(s, "p1", "battlefield", "Mutagen")] } }));
        expect(s.players.p1?.hand.length).toBe(hand - 1);
      });

      it("level 3: on attacking, an attacking creature gets +X/+X (cards in hand)", () => {
        let s = scenario({
          p1: { battlefield: ["Party Dude", "Bear Cub", ...lands("Forest", 7)], hand: ["Opt", "Opt", "Island"] },
        });
        const dude = idOf(s, "p1", "battlefield", "Party Dude");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", dude));
        s = settle(activate(s, "p1", dude));
        s = throughCombat(attack(s, [bear]), picking([bear]));
        expect(s.players.p2?.life).toBe(15);
        expect(pt(s, bear)).toEqual([5, 5]);
      });
    });

    it("Primordial Pachyderm: reach, trample; on entering, you gain 2 life", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Primordial Pachyderm"] } });
      s = settle(cast(s, "p1", "Primordial Pachyderm"));
      const pach = idOf(s, "p1", "battlefield", "Primordial Pachyderm");
      expect(chars(s, pach).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
      expect(s.players.p1?.life).toBe(22);
    });

    it("Ragamuffin Raptor: returns a creature or Food card from your graveyard to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Ragamuffin Raptor"], graveyard: ["Opt", "Guac & Marshmallow Pizza"] },
      });
      let offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Ragamuffin Raptor"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options);
        return req.options.filter((id) => nameOf(cur, id) === "Guac & Marshmallow Pizza");
      });
      expect(offered).toEqual(["Guac & Marshmallow Pizza"]);
      expect(idsOf(s, "p1", "hand", "Guac & Marshmallow Pizza")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Rocksteady, Crash Courser: he and your Boars can't be blocked by more than one creature", () => {
      let s = scenario({
        p1: { battlefield: ["Rocksteady, Crash Courser", "Zoo Escapees", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const rock = idOf(s, "p1", "battlefield", "Rocksteady, Crash Courser");
      const zoo = idOf(s, "p1", "battlefield", "Zoo Escapees");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const blockers = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Shivan Dragon")];
      s = toBlockers(attack(s, [rock, zoo, bear]));
      const double = (target: string) => ({
        type: "declareBlockers" as const,
        blocks: blockers.map((blocker) => ({ blocker, attacker: target })),
      });
      expect(() => act(s, "p2", double(rock))).toThrow();
      expect(() => act(s, "p2", double(zoo))).toThrow();
      expect(() => act(s, "p2", double(bear))).not.toThrow();
    });

    describe("Saved by the Shell", () => {
      it("costs {1} less with a Turtle; a +1/+1 counter, trample, hexproof, indestructible", () => {
        let s = scenario({ p1: { battlefield: ["Michelangelo, Game Master", "Forest"], hand: ["Saved by the Shell"] } });
        const mikey = idOf(s, "p1", "battlefield", "Michelangelo, Game Master");
        s = settle(cast(s, "p1", "Saved by the Shell", { targets: { t: [mikey] } }));
        expect(plusOnes(s, mikey)).toBe(1);
        expect(chars(s, mikey).keywords).toEqual(expect.arrayContaining(["trample", "hexproof", "indestructible"]));
      });

      it("without a Turtle, a single Forest isn't enough", () => {
        const s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"], hand: ["Saved by the Shell"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Saved by the Shell", { targets: { t: [bear] } })).toThrow();
      });
    });

    it("Tenderize: your creature deals damage equal to its power to an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", ...lands("Forest", 2)], hand: ["Tenderize"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Tenderize", { targets: { a: [angel], b: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    it("Transdimensional Bovine: flying; {T}: two mana of one color", () => {
      let s = scenario({ p1: { battlefield: ["Transdimensional Bovine"] } });
      const ox = idOf(s, "p1", "battlefield", "Transdimensional Bovine");
      expect(chars(s, ox).keywords).toContain("flying");
      s = tapFor(s, "p1", ox, "B");
      expect(s.players.p1?.manaPool.B).toBe(2);
    });

    it("Turtle Power!: your Turtles get +2/+2, not other creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Michelangelo, Game Master", "Bear Cub", ...lands("Forest", 3)], hand: ["Turtle Power!"] },
        p2: { battlefield: ["Michelangelo, Mutant BFF"] },
      });
      s = settle(cast(s, "p1", "Turtle Power!"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Michelangelo, Game Master"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Michelangelo, Mutant BFF"))).toEqual([4, 4]);
    });

    describe("Venus, Torn Between Worlds", () => {
      it("whenever it is dealt damage, that many +1/+1 counters", () => {
        let s = scenario({
          p1: { battlefield: ["Venus, Torn Between Worlds"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const venus = idOf(s, "p1", "battlefield", "Venus, Torn Between Worlds");
        // Blocked by the Angel (4/4): 4 damage, 4 counters, and Venus survives.
        s = toBlockers(attack(s, [venus]));
        s = act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: venus }],
        });
        s = throughCombat(s);
        expect(plusOnes(s, venus)).toBe(4);
        expect(pt(s, venus)).toEqual([9, 9]);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("one of your creatures with a counter damages a player: you may pay {U} to draw", () => {
        const setup = () =>
          scenario({
            p1: {
              battlefield: [
                "Venus, Torn Between Worlds",
                { name: "Bear Cub", counters: { "+1/+1": 1 } },
                "Llanowar Elves",
                "Island",
              ],
              library: ["Opt", "Opt", "Opt"],
            },
          });
        let s = setup();
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        let asked = 0;
        s = throughCombat(attack(s, [bear, elves]), (req) => {
          if (req.type !== "yesNo") return undefined;
          asked += 1;
          return [1];
        });
        // Only the Bear Cub (with a counter) triggers; {U} paid, one card drawn.
        expect(asked).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
        let t = setup();
        t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]), no);
        expect(t.players.p1?.hand).toHaveLength(0);
      });
    });

    describe("West Wind Avatar", () => {
      it("on entering, sacrifice a land: 3 life; Disappear: draw at your end step", () => {
        let s = scenario({ p1: { battlefield: lands("Forest", 7), hand: ["West Wind Avatar"], library: ["Opt", "Opt"] } });
        const forest = idOf(s, "p1", "battlefield", "Forest");
        s = settle(cast(s, "p1", "West Wind Avatar"), picking([forest]));
        expect(chars(s, idOf(s, "p1", "battlefield", "West Wind Avatar")).keywords).toContain("trample");
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.number > 3);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });

      it("on attacking, with no sacrifice: no life and no draw at the end step", () => {
        let s = scenario({ p1: { battlefield: ["West Wind Avatar", "Forest"] } });
        const avatar = idOf(s, "p1", "battlefield", "West Wind Avatar");
        s = throughCombat(attack(s, [avatar]), no);
        expect(s.players.p1?.life).toBe(20);
        expect(s.players.p2?.life).toBe(13);
        s = advanceUntil(s, (x) => x.turn.number > 3);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Zoo Escapees: when it leaves the battlefield, a Mutagen", () => {
      let s = scenario({
        p1: { battlefield: ["Zoo Escapees", "Serra Angel", ...lands("Forest", 2)], hand: ["Tenderize"] },
        p2: { battlefield: ["Zoo Escapees"] },
      });
      const zoo = idOf(s, "p2", "battlefield", "Zoo Escapees");
      s = settle(cast(s, "p1", "Tenderize", { targets: { a: [idOf(s, "p1", "battlefield", "Serra Angel")], b: [zoo] } }));
      expect(idsOf(s, "p2", "graveyard", "Zoo Escapees")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Mutagen")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(0);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  const exiled = (s: S) => s.exile.map((id) => nameOf(s, id));

  /** Plays until `until` by passing, without attacking or blocking, answering the choices (default suggestion). */
  const run = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const quiet = (x: S) => x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0;
  /** Resolves the stack and pending triggers (at least one pass). */
  const settle = (s: S, answer?: Answer): S => {
    let first = true;
    return run(
      s,
      (x) => {
        const done = !first && quiet(x);
        first = false;
        return done;
      },
      answer,
    );
  };
  /** Until the second main phase (without attacking or blocking). */
  const toMain2 = (s: S, answer?: Answer) => run(s, (x) => x.turn.step === "main2" && quiet(x), answer);
  /** Until the end step of this turn, triggers resolved. */
  const toEndStep = (s: S, answer?: Answer) => run(s, (x) => x.turn.step === "end" && quiet(x), answer);
  /** Until the first main phase of p1's next turn, triggers resolved. */
  const toNextTurn = (s: S, answer?: Answer) => {
    const from = s.turn.number;
    return run(s, (x) => x.turn.active === "p1" && x.turn.number > from && x.turn.step === "main1" && quiet(x), answer);
  };
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Selects among a choice's options the object named `name`. */
  const pickNamed = (s: S, req: ChoiceRequest, name: string) =>
    req.type === "pick" ? req.options.filter((id) => nameOf(s, String(id)) === name).slice(0, 1) : undefined;
  /** Chooses `id` if it is offered. */
  const pickId = (req: ChoiceRequest, id: string) => (req.type === "pick" && req.options.includes(id) ? [id] : undefined);
  /** p1 deals 3 damage to their own creature with Lightning Strike (Disappear). */
  const strikeOwn = (s: S, name: string) =>
    settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", name)] } }));

  describe("Teenage Mutant Ninja Turtles, lot A — multicolores", () => {
    it("Baxter Stockman: a 1/1 Robot on entering; at the beginning of combat, +3/+0, first strike and vigilance to an artifact creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Mountain"], hand: ["Baxter Stockman"] } });
      s = settle(cast(s, "p1", "Baxter Stockman"));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect(chars(s, robot).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = run(s, (x) => x.turn.step === "beginCombat" && quiet(x));
      // Baxter isn't an artifact: he gets nothing.
      const baxter = idOf(s, "p1", "battlefield", "Baxter Stockman");
      expect([chars(s, baxter).power, chars(s, baxter).keywords]).toEqual([3, []]);
      const c = chars(s, robot);
      expect([c.power, c.toughness]).toEqual([4, 1]);
      expect(c.keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
    });

    describe("Bebop & Rocksteady", () => {
      it("on attacking: discarding a card avoids the sacrifice", () => {
        let s = scenario({ p1: { battlefield: ["Bebop & Rocksteady", "Bear Cub"], hand: ["Opt"] } });
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bebop & Rocksteady")]), (req) => pickId(req, opt));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bebop & Rocksteady")).toHaveLength(1);
      });

      it("on attacking, with no discard: a permanent is sacrificed", () => {
        let s = scenario({ p1: { battlefield: ["Bebop & Rocksteady", "Bear Cub"], hand: ["Opt"] } });
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bebop & Rocksteady")]), (req, _player, cur) =>
          req.type === "pick" && req.options.some((id) => nameOf(cur, String(id)) === "Opt")
            ? []
            : pickNamed(cur, req, "Bear Cub"),
        );
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("on blocking, empty hand: a permanent is sacrificed", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Bebop & Rocksteady", "Forest"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bebop = idOf(s, "p1", "battlefield", "Bebop & Rocksteady");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p1", { type: "declareBlockers", blocks: [{ blocker: bebop, attacker: bear }] });
        s = settle(s, (req, _player, cur) => pickNamed(cur, req, "Forest"));
        expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bebop & Rocksteady")).toHaveLength(1);
      });
    });

    describe("Brilliance Unleashed", () => {
      it("both modes: 5 damage, and a noncreature artifact returns as a flying 3/3 Robot", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 4), ...lands("Mountain", 2)],
            hand: ["Brilliance Unleashed"],
            graveyard: ["Fishing Pole"],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const pole = idOf(s, "p1", "graveyard", "Fishing Pole");
        s = settle(cast(s, "p1", "Brilliance Unleashed", { mode: 2, targets: { d: [angel], a: [pole] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        const back = idOf(s, "p1", "battlefield", "Fishing Pole");
        const c = chars(s, back);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(["Robot"]);
        expect([c.power, c.toughness]).toEqual([3, 3]);
        expect(c.keywords).toContain("flying");
      });

      it("an artifact creature card returns as is", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 4), ...lands("Mountain", 2)],
            hand: ["Brilliance Unleashed"],
            graveyard: ["Mechanized Ninja Cavalry"],
          },
        });
        const cavalry = idOf(s, "p1", "graveyard", "Mechanized Ninja Cavalry");
        s = settle(cast(s, "p1", "Brilliance Unleashed", { mode: 1, targets: { a: [cavalry] } }));
        const back = idOf(s, "p1", "battlefield", "Mechanized Ninja Cavalry");
        expect([chars(s, back).power, chars(s, back).toughness]).toEqual([1, 1]);
        expect(chars(s, back).keywords).not.toContain("flying");
        // Its enter ability: a 1/1 Robot.
        expect(idsOf(s, "p1", "battlefield", "Robot")).toHaveLength(1);
      });
    });

    describe("Dark Leo & Shredder", () => {
      const setup = (elites: number) => {
        let s = scenario({ p1: { battlefield: ["Dark Leo & Shredder", ...Array(elites).fill("Foot Elite")] } });
        const leo = idOf(s, "p1", "battlefield", "Dark Leo & Shredder");
        s = attack(s, [leo]);
        // Your attacking Ninjas have deathtouch, not the others.
        expect(chars(s, leo).keywords).toContain("deathtouch");
        expect(chars(s, idOf(s, "p1", "battlefield", "Foot Elite")).keywords).not.toContain("deathtouch");
        return toMain2(s);
      };

      it("combat damage to a player: a 1/1 Ninja; with five Ninjas, they lose half their life (rounded up)", () => {
        const s = setup(3);
        expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(1);
        // 20 - 1 = 19, then half rounded up (10).
        expect(s.players.p2?.life).toBe(9);
      });

      it("with only four Ninjas, no additional loss", () => {
        const s = setup(2);
        expect(idsOf(s, "p1", "battlefield", "Ninja")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(19);
      });
    });

    it("Don & Leo, Problem Solvers: at your end step, an artifact and a creature are exiled then return", () => {
      let s = scenario({
        p1: { battlefield: ["Don & Leo, Problem Solvers", "Fishing Pole", { name: "Bear Cub", counters: { "+1/+1": 2 } }] },
      });
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = toEndStep(s, (req) => pickId(req, pole) ?? pickId(req, bear));
      const newPole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newPole).not.toBe(pole);
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Don & Leo, Problem Solvers")).keywords).toContain("vigilance");
    });

    it("EPF Point Squad: Alliance — a +1/+1 counter when another creature enters under your control", () => {
      let s = scenario({ p1: { battlefield: ["EPF Point Squad", "Forest"], hand: ["Llanowar Elves"] } });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      const squad = idOf(s, "p1", "battlefield", "EPF Point Squad");
      expect(s.objects[squad]?.counters["+1/+1"]).toBe(1);
      expect([chars(s, squad).power, chars(s, squad).toughness]).toEqual([3, 2]);
    });

    it("Foot Elite: on attacking, another of your creatures gains +1/+0 and indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Foot Elite", "Bear Cub"] } });
      const elite = idOf(s, "p1", "battlefield", "Foot Elite");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let options: ChoiceValue[] = [];
      s = settle(attack(s, [elite]), (req) => {
        if (req.type === "pick") options = req.options;
        return pickId(req, bear);
      });
      expect(options).not.toContain(elite);
      expect(chars(s, bear).power).toBe(3);
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(chars(s, elite).keywords).not.toContain("indestructible");
    });

    describe("Splinter, Radical Rat", () => {
      it("Foot Ninjas: 3 life on entering; with Splinter, a Ninja's ability triggers twice", () => {
        const play = (withSplinter: boolean) => {
          const s = scenario({
            p1: {
              battlefield: [...lands("Plains", 6), ...(withSplinter ? ["Splinter, Radical Rat"] : [])],
              hand: ["Foot Ninjas"],
            },
          });
          return settle(cast(s, "p1", "Foot Ninjas"));
        };
        expect(play(false).players.p1?.life).toBe(23);
        expect(play(true).players.p1?.life).toBe(26);
      });

      it("{1}{U}: a targeted Ninja can't be blocked this turn (not a non-Ninja creature)", () => {
        let s = scenario({ p1: { battlefield: ["Splinter, Radical Rat", "Foot Elite", "Bear Cub", ...lands("Island", 2)] } });
        const splinter = idOf(s, "p1", "battlefield", "Splinter, Radical Rat");
        const elite = idOf(s, "p1", "battlefield", "Foot Elite");
        expect(() =>
          activate(s, "p1", splinter, "Ninja", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
        ).toThrow();
        s = settle(activate(s, "p1", splinter, "Ninja", { targets: { t: [elite] } }));
        expect(chars(s, elite).keywords).toContain("unblockable");
      });
    });

    it("Genghis Frog: a Mutagen when it enters or when another Mutant enters under your control", () => {
      let s = scenario({
        p1: { battlefield: ["Island", ...lands("Forest", 7)], hand: ["Genghis Frog", "Putrid Pals", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Genghis Frog"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
      s = settle(cast(s, "p1", "Putrid Pals"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
      // A Bear isn't a Mutant.
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Genghis Frog")).keywords).toContain("trample");
    });

    it("Go Ninja Go, both modes: an exiled creature returns, then damage equal to your greatest power", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Plains", "Shivan Dragon", { name: "Bear Cub", counters: { "+1/+1": 2 } }],
          hand: ["Go Ninja Go"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Go Ninja Go", { mode: 1, targets: { d: [bear] } })).toThrow();
      s = settle(cast(s, "p1", "Go Ninja Go", { mode: 2, targets: { f: [bear], d: [angel] } }));
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      // 5 blessures (Shivan Dragon) : l'Ange 4/4 meurt.
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Ice Cream Kitty", () => {
      it("{2}, sacrifice another creature: draw (not by sacrificing the Cat itself)", () => {
        let s = scenario({
          p1: { battlefield: ["Ice Cream Kitty", "Bear Cub", ...lands("Forest", 2)], library: ["Opt", "Island"] },
        });
        const kitty = idOf(s, "p1", "battlefield", "Ice Cream Kitty");
        expect(() => activate(s, "p1", kitty, "draw", { sacrifice: [kitty] })).toThrow();
        s = settle(activate(s, "p1", kitty, "draw", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });

      it("{2}, {T}, sacrifice it: you gain 3 life", () => {
        let s = scenario({ p1: { battlefield: ["Ice Cream Kitty", ...lands("Forest", 2)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ice Cream Kitty"), "3 life"));
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Ice Cream Kitty")).toHaveLength(1);
      });
    });

    describe("Karai, Future of the Foot", () => {
      it("combat damage to a player: a creature card from your graveyard returns to hand", () => {
        let s = scenario({ p1: { battlefield: ["Karai, Future of the Foot"], graveyard: ["Bear Cub"] } });
        s = toMain2(attack(s, [idOf(s, "p1", "battlefield", "Karai, Future of the Foot")]), (req, _player, cur) =>
          pickNamed(cur, req, "Bear Cub"),
        );
        expect(s.players.p2?.life).toBe(17);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      });

      /** Karai sneaked this turn (real cast in the declare blockers step), or on an earlier turn (simulated). */
      const sneaked = (thisTurn: boolean) => {
        if (!thisTurn) {
          let s = scenario({ p1: { battlefield: ["Karai, Future of the Foot"], graveyard: ["Serra Angel"] } });
          const karai = idOf(s, "p1", "battlefield", "Karai, Future of the Foot");
          s = attack(s, [karai]);
          (s.objects[karai] as { castVia?: string }).castVia = "sneak";
          s.version += 1;
          return toMain2(s, (req, _player, cur) => pickNamed(cur, req, "Serra Angel"));
        }
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", "Plains", "Swamp", "Swamp", "Swamp"],
            hand: ["Karai, Future of the Foot"],
            graveyard: ["Serra Angel"],
          },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        s = advanceUntil(
          s,
          (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
        );
        s = cast(s, "p1", "Karai, Future of the Foot", { alternative: true });
        const out = toMain2(s, (req, _player, cur) => pickNamed(cur, req, "Serra Angel"));
        // The Bear Cub returned to hand; Karai entered tapped and attacking.
        expect(idsOf(out, "p1", "hand", "Bear Cub")).toHaveLength(1);
        return out;
      };

      it("sneaked this turn: the card returns to the battlefield instead", () => {
        const s = sneaked(true);
        expect(s.players.p2?.life).toBe(17);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        // Only the attacker returned for the sneak is in hand.
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      });

      it("sneaked on an earlier turn: the card returns to hand", () => {
        const s = sneaked(false);
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      });
    });

    it("Karai's Technique, both modes: +3/+3 on one creature, -3/-3 on another", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", ...lands("Swamp", 2), "Bear Cub"], hand: ["Karai's Technique"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Karai's Technique", { mode: 2, targets: { p: [bear], m: [angel] } }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
    });

    describe("Krang & Shredder", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: [
              ...lands("Island", 3),
              ...lands("Swamp", 3),
              ...lands("Mountain", 2),
              "Bear Cub",
              "Tokka & Rahzar, Terrible Twos",
            ],
            hand: ["Krang & Shredder", "Lightning Strike"],
            library: lands("Island", 5),
          },
          p2: { library: ["Island", "Island", "Opt", ...lands("Forest", 5)] },
        });

      it("on entering, each opponent exiles up to one nonland card; Disappear: you cast it without paying (Tokka: 3 damage)", () => {
        let s = settle(cast(setup(), "p1", "Krang & Shredder"));
        expect(exiled(s)).toEqual(["Island", "Island", "Opt"]);
        expect(namesIn(s, s.players.p2?.library.slice(0, 1))).toEqual(["Forest"]);
        // Krang and Lightning Strike paid in full: Tokka & Rahzar damages nobody.
        s = strikeOwn(s, "Bear Cub");
        expect(s.players.p1?.life).toBe(20);
        s = untilCastNow(run(s, (x) => x.turn.step === "main2" && quiet(x)));
        const offered = castNowOf(s)?.cards ?? [];
        expect(namesIn(s, offered)).toEqual(["Opt"]);
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, free: true }));
        // Opt: scry 1 then draw; it goes to its owner's graveyard.
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Opt"]);
        // No mana spent on a spell with mana value 1: Tokka & Rahzar deals 3 damage to p1.
        expect(s.players.p1?.life).toBe(17);
      });

      it("with no permanent gone this turn, nothing is cast at the end step", () => {
        let s = settle(cast(setup(), "p1", "Krang & Shredder"));
        s = toEndStep(s);
        expect(castNowOf(s)).toBeUndefined();
        expect(exiled(s)).toContain("Opt");
      });
    });

    it("Tokka & Rahzar, Terrible Twos: can't be countered; menace", () => {
      expect(card("Tokka & Rahzar, Terrible Twos").rules?.cantBeCountered).toBe(true);
      const s = scenario({ p1: { battlefield: ["Tokka & Rahzar, Terrible Twos"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Tokka & Rahzar, Terrible Twos")).keywords).toContain("menace");
    });

    describe("The Last Ronin", () => {
      it("chapter I: destroy all creatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 5), "Forest", "Bear Cub"], hand: ["The Last Ronin"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Last Ronin"));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "The Last Ronin")]?.counters.lore).toBe(1);
      });

      it("chapter II: mill four cards, then a creature card from your graveyard returns to hand", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "The Last Ronin", counters: { lore: 1 } }],
            library: ["Island", "Shivan Dragon", "Opt", "Island", "Forest", ...lands("Forest", 5)],
          },
        });
        s = toNextTurn(s, (req, _player, cur) => pickNamed(cur, req, "Shivan Dragon"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Shivan Dragon"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Island", "Opt"]);
      });

      it("chapter III: this turn, a creature that attacks alone gets three +1/+1 counters, trample, lifelink and indestructible", () => {
        let s = scenario({ p1: { battlefield: [{ name: "The Last Ronin", counters: { lore: 2 } }, "Bear Cub"] } });
        s = toNextTurn(s);
        // Sacrificed after chapter III.
        expect(idsOf(s, "p1", "graveyard", "The Last Ronin")).toHaveLength(1);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attack(s, [bear]));
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink", "indestructible"]));
        s = toMain2(s);
        expect(s.players.p2?.life).toBe(15);
        expect(s.players.p1?.life).toBe(25);
      });
    });

    it("Lessons from Life: draw three cards, then you may put a land from your hand onto the battlefield tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Lessons from Life"],
          library: ["Forest", "Opt", "Island", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Lessons from Life"), (req, _player, cur) => pickNamed(cur, req, "Island"));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Opt"]);
      const islands = idsOf(s, "p1", "battlefield", "Island");
      expect(islands).toHaveLength(3);
      expect(islands.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Mechanized Ninja Cavalry and Slithering Cryptid: a 1/1 Robot and a Mutagen on entering", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Forest", 3)],
          hand: ["Mechanized Ninja Cavalry", "Slithering Cryptid"],
        },
      });
      s = settle(cast(s, "p1", "Mechanized Ninja Cavalry"));
      const robot = idOf(s, "p1", "battlefield", "Robot");
      expect([chars(s, robot).power, chars(s, robot).toughness, chars(s, robot).colors]).toEqual([1, 1, []]);
      s = settle(cast(s, "p1", "Slithering Cryptid"));
      expect(idsOf(s, "p1", "battlefield", "Mutagen")).toHaveLength(1);
    });

    it("Mikey & Leo, Chaos & Order: a counter put on one of your creatures makes you draw, once per turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mikey & Leo, Chaos & Order", "EPF Point Squad", ...lands("Forest", 2)],
          hand: ["Llanowar Elves", "Llanowar Elves"],
          library: lands("Island", 5),
        },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Llanowar Elves"]);
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p1", "battlefield", "EPF Point Squad")]?.counters["+1/+1"]).toBe(2);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Mouser Mark III: attacks only if you control another artifact", () => {
      const s = scenario({ p1: { battlefield: ["Mouser Mark III"] } });
      expect(() => attack(s, [idOf(s, "p1", "battlefield", "Mouser Mark III")])).toThrow();
      let t = scenario({ p1: { battlefield: ["Mouser Mark III", "Fishing Pole"] } });
      t = toMain2(attack(t, [idOf(t, "p1", "battlefield", "Mouser Mark III")]));
      expect(t.players.p2?.life).toBe(18);
    });

    describe("The Neutrinos", () => {
      it("Alliance: +1/+0 until end of turn when another creature enters", () => {
        let s = scenario({ p1: { battlefield: ["The Neutrinos", "Forest"], hand: ["Llanowar Elves"] } });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        const n = idOf(s, "p1", "battlefield", "The Neutrinos");
        expect([chars(s, n).power, chars(s, n).toughness]).toEqual([3, 4]);
        expect(chars(s, n).keywords).toContain("flying");
      });

      it("on attacking: one of your creatures is exiled, then returns tapped and attacking", () => {
        let s = scenario({ p1: { battlefield: ["The Neutrinos", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "The Neutrinos")]), (req) => pickId(req, bear));
        const back = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(back).not.toBe(bear);
        expect(s.objects[back]?.tapped).toBe(true);
        expect(s.combat?.attackers.map((a) => a.id)).toContain(back);
        s = toMain2(s);
        // 2 from the Bear, 3 from the Neutrinos: the returned Bear triggered Alliance.
        expect(s.players.p2?.life).toBe(15);
      });

      it("on attacking: a creature you own, even controlled by an opponent, returns under your control", () => {
        let s = scenario({ p1: { battlefield: ["The Neutrinos", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        steal(s, bear, "p2");
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "The Neutrinos")]), (req) => pickId(req, bear));
        const back = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(s.objects[back]?.tapped).toBe(true);
        expect(s.combat?.attackers.map((a) => a.id)).toContain(back);
      });
    });

    it("Nobody: returns another of your artifacts to hand, then scry 1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), "Fishing Pole"], hand: ["Nobody"], library: ["Opt", "Island", "Forest"] },
      });
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      s = settle(cast(s, "p1", "Nobody"), (req, _player, cur) => {
        if (req.intent === "scryBottom" && req.type === "pick") return pickNamed(cur, req, "Opt");
        return pickId(req, pole);
      });
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Forest", "Opt"]);
    });

    describe("Pizza Face, Gastromancer", () => {
      it("a Food on entering; Disappear: three +1/+1 counters, and an artifact becomes a 0/0 Mutant", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Swamp", 4), "Forest", ...lands("Mountain", 2), "Fishing Pole", "Bear Cub"],
            hand: ["Pizza Face, Gastromancer", "Lightning Strike"],
          },
        });
        s = settle(cast(s, "p1", "Pizza Face, Gastromancer"));
        expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
        s = strikeOwn(s, "Bear Cub");
        const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
        s = toEndStep(s, (req) => pickId(req, pole));
        expect(s.objects[pole]?.counters["+1/+1"]).toBe(3);
        const c = chars(s, pole);
        expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Mutant"]));
        expect([c.power, c.toughness]).toEqual([3, 3]);
      });

      it("with no permanent gone this turn, no counters", () => {
        let s = scenario({ p1: { battlefield: ["Pizza Face, Gastromancer", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = toEndStep(s, (req) => pickId(req, bear));
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      });

      it("{10}, {T}, sacrifice it: you gain 15 life", () => {
        let s = scenario({ p1: { battlefield: ["Pizza Face, Gastromancer", ...lands("Swamp", 10)] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Pizza Face, Gastromancer"), "15 life"));
        expect(s.players.p1?.life).toBe(35);
      });
    });

    it("Putrid Pals: Disappear — enters with two +1/+1 counters if one of your permanents left this turn", () => {
      const base = {
        battlefield: [...lands("Swamp", 4), ...lands("Mountain", 2), "Bear Cub"],
        hand: ["Putrid Pals", "Lightning Strike"],
      };
      let s = settle(cast(scenario({ p1: base }), "p1", "Putrid Pals"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Putrid Pals")).power).toBe(3);
      s = strikeOwn(scenario({ p1: base }), "Bear Cub");
      s = settle(cast(s, "p1", "Putrid Pals"));
      const pals = idOf(s, "p1", "battlefield", "Putrid Pals");
      expect(s.objects[pals]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, pals).keywords).toContain("deathtouch");
    });

    it("Raph & Leo, Sibling Rivals: at the first combat, untaps one or two attacking creatures, then an additional combat", () => {
      let s = scenario({ p1: { battlefield: ["Raph & Leo, Sibling Rivals", "Bear Cub"] } });
      const raph = idOf(s, "p1", "battlefield", "Raph & Leo, Sibling Rivals");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [raph, bear]), (req) => (req.type === "pick" ? [raph, bear] : undefined));
      expect([s.objects[raph]?.tapped, s.objects[bear]?.tapped]).toEqual([false, false]);
      // After the combat phase, another combat phase (with no main phase between the two).
      s = run(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
      expect(s.turn.step).toBe("declareAttackers");
      expect(s.players.p2?.life).toBe(16);
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [raph, bear].map((id) => ({ id, defender: "p2" })),
      });
      // It's no longer the first combat: no new trigger.
      expect(s.triggers).toHaveLength(0);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(12);
      expect(s.objects[raph]?.tapped).toBe(true);
    });

    it("Raph & Mikey, Troublemakers: on attacking, the first creature card revealed enters tapped and attacking", () => {
      let s = scenario({
        p1: { battlefield: ["Raph & Mikey, Troublemakers"], library: ["Island", "Forest", "Serra Angel", "Opt"] },
      });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Raph & Mikey, Troublemakers")]));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.tapped).toBe(true);
      // The revealed cards go to the bottom of the library.
      expect(namesIn(s, s.players.p1?.library.slice(0, 1))).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.library.slice(1)).sort()).toEqual(["Forest", "Island"]);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(9);
    });

    it("Tainted Treats: destroys an artifact or a creature; a Food if its mana value was 4 or less", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Forest", 2)], hand: ["Tainted Treats", "Tainted Treats"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Tainted Treats", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
      s = settle(cast(s, "p1", "Tainted Treats", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });
  });
});

describe("lot A, colorless and lands", () => {
  type S = GameState;
  const inExile = (s: S, name: string) => Object.values(s.objects).filter((o) => o.zone === "exile" && nameOf(s, o.id) === name);

  const playLand = (s: S, player: string, name: string) =>
    act(s, player, { type: "playLand", card: idOf(s, player, "hand", name) });
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)));
  const manaColors = (s: S, source: string) =>
    [...new Set(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : [])))].sort();

  /** Test 2/2 Turtle, cost {G}. */
  const TURTLE = customCard({
    name: "Test Turtle",
    subtypes: ["Turtle"],
    power: 2,
    toughness: 2,
    manaCost: { generic: 0, colored: { G: 1 }, x: 0 },
    manaCostText: "{G}",
    colors: ["G"],
  });

  describe("Teenage Mutant Ninja Turtles, lot A — colorless and lands", () => {
    describe("Chrome Dome", () => {
      it("your other artifact creatures have +1/+0 (not him, nor a nonartifact creature, nor the opponent's)", () => {
        const s = scenario({
          p1: { battlefield: ["Chrome Dome", "Henchbots", "Bear Cub"] },
          p2: { battlefield: ["Henchbots"] },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Chrome Dome")).power).toBe(1);
        expect(chars(s, idOf(s, "p1", "battlefield", "Henchbots")).power).toBe(3);
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
        expect(chars(s, idOf(s, "p2", "battlefield", "Henchbots")).power).toBe(2);
      });

      it("{5}: a token copy of another of your artifacts, with haste, sacrificed at the next end step", () => {
        let s = scenario({ p1: { battlefield: ["Chrome Dome", "Turtle Blimp", ...lands("Island", 5)] } });
        const dome = idOf(s, "p1", "battlefield", "Chrome Dome");
        const blimp = idOf(s, "p1", "battlefield", "Turtle Blimp");
        // "Another artifact": not itself.
        expect(() => activate(s, "p1", dome, "token copy", { targets: { t: [dome] } })).toThrow();
        s = settle(activate(s, "p1", dome, "token copy", { targets: { t: [blimp] } }));
        const copies = idsOf(s, "p1", "battlefield", "Turtle Blimp");
        expect(copies).toHaveLength(2);
        const token = copies.find((id) => id !== blimp) as string;
        expect(s.objects[token]?.isToken).toBe(true);
        expect(chars(s, token).keywords).toContain("haste");
        expect(chars(s, token).keywords).toContain("flying");
        // The copy enters: its enter ability creates a Mutant.
        expect(idsOf(s, "p1", "battlefield", "Mutant")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
        expect(idsOf(s, "p1", "battlefield", "Turtle Blimp")).toEqual([blimp]);
      });
    });

    describe("Everything Pizza", () => {
      it("on entering: a basic land card from the library into hand", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 2), hand: ["Everything Pizza"], library: ["Opt", "Swamp", "Opt"] },
        });
        s = settle(cast(s, "p1", "Everything Pizza"), (req, _player, cur) => pickNamed(cur, req, "Swamp"));
        expect(idsOf(s, "p1", "hand", "Swamp")).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("{2}{W}{U}{B}{R}{G}, {T}, sacrifice: 3 life and a card, opposing discard, 3 damage, three +1/+1 counters", () => {
        let s = scenario({
          p1: {
            battlefield: ["Everything Pizza", "Plains", "Island", "Swamp", "Mountain", "Forest", "Forest", "Forest", "Bear Cub"],
            library: ["Opt", "Opt"],
          },
          p2: { hand: ["Opt"] },
        });
        const pizza = idOf(s, "p1", "battlefield", "Everything Pizza");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", pizza, "discard", { targets: { p: ["p1"], d: ["p2"], c: [bear] } }));
        expect(s.players.p1?.life).toBe(23);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p2?.hand).toHaveLength(0);
        expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(17);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(3);
        expect(idsOf(s, "p1", "graveyard", "Everything Pizza")).toHaveLength(1);
      });
    });

    describe("Henchbots", () => {
      it("exiles a tapped opposing creature until the Henchbots leave the battlefield", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Henchbots"] },
          p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Henchbots"));
        expect(inExile(s, "Bear Cub")).toHaveLength(1);
        // The Angel, untapped, wasn't a legal target.
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        destroy(s, idOf(s, "p1", "battlefield", "Henchbots"));
        expect(inExile(s, "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      });

      it("with no tapped opposing creature, nothing is exiled", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 4), hand: ["Henchbots"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Henchbots"));
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Henchbots")).toHaveLength(1);
      });
    });

    it("Krang, Utrom Warlord: flying, trample, indestructible, haste, also for your other artifact creatures", () => {
      const s = scenario({
        p1: { battlefield: ["Krang, Utrom Warlord", "Henchbots", "Bear Cub"] },
        p2: { battlefield: ["Henchbots"] },
      });
      const all = ["flying", "trample", "indestructible", "haste"];
      expect(chars(s, idOf(s, "p1", "battlefield", "Krang, Utrom Warlord")).keywords).toEqual(expect.arrayContaining(all));
      expect(chars(s, idOf(s, "p1", "battlefield", "Henchbots")).keywords).toEqual(expect.arrayContaining(all));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      expect(chars(s, idOf(s, "p2", "battlefield", "Henchbots")).keywords).not.toContain("flying");
    });

    describe("Omni-Cheese Pizza", () => {
      it("on entering, draw a card; {2}, {T}, sacrifice: 3 life", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Omni-Cheese Pizza"], library: ["Opt", "Opt"] } });
        s = settle(cast(s, "p1", "Omni-Cheese Pizza"));
        expect(s.players.p1?.hand).toHaveLength(1);
        const pizza = idOf(s, "p1", "battlefield", "Omni-Cheese Pizza");
        s = settle(activate(s, "p1", pizza, "3 life"));
        expect(s.players.p1?.life).toBe(23);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
      });

      it("{1}, {T}, sacrifice: one mana of any color, without using the stack", () => {
        let s = scenario({ p1: { battlefield: ["Omni-Cheese Pizza", "Island"] } });
        const pizza = idOf(s, "p1", "battlefield", "Omni-Cheese Pizza");
        s = activate(s, "p1", pizza, "any color");
        expect(s.stack).toHaveLength(0);
        if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["R"] });
        expect(s.players.p1?.manaPool.R).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
      });
    });

    describe("Technodrome", () => {
      it("neither attacks nor blocks while its power is less than 6", () => {
        const s = scenario({
          p1: { battlefield: ["Technodrome", { name: "Technodrome", counters: { "+1/+1": 3 } }] },
        });
        const [weak, strong] = idsOf(s, "p1", "battlefield", "Technodrome") as [string, string];
        expect(chars(s, weak).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock", "reach", "trample"]));
        expect(chars(s, strong).power).toBe(6);
        expect(chars(s, strong).keywords).not.toContain("cantAttack");
        const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        expect(() => act(cur, "p1", { type: "declareAttackers", attackers: [{ id: weak, defender: "p2" }] })).toThrow();
        const after = act(cur, "p1", { type: "declareAttackers", attackers: [{ id: strong, defender: "p2" }] });
        expect(after.combat?.attackers.map((a) => a.id)).toContain(strong);
      });

      it("{T}, sacrifice another artifact: draw a card and a +1/+1 counter", () => {
        let s = scenario({ p1: { battlefield: ["Technodrome", "Omni-Cheese Pizza"], library: ["Opt", "Opt"] } });
        const drome = idOf(s, "p1", "battlefield", "Technodrome");
        s = settle(activate(s, "p1", drome, "Draw a card", { sacrifice: [idOf(s, "p1", "battlefield", "Omni-Cheese Pizza")] }));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[drome]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "graveyard", "Omni-Cheese Pizza")).toHaveLength(1);
        // With no other artifact: the ability can't be activated (it can't sacrifice itself).
        const t = scenario({ p1: { battlefield: ["Technodrome"] } });
        expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Technodrome"), "Draw a card")).toBe(false);
      });
    });

    it("Turtle Blimp: flying; on entering, a red 2/2 Mutant", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Turtle Blimp"] } });
      s = settle(cast(s, "p1", "Turtle Blimp"));
      const blimp = idOf(s, "p1", "battlefield", "Turtle Blimp");
      expect(chars(s, blimp).keywords).toContain("flying");
      expect(chars(s, blimp).types).not.toContain("Creature");
      const mutant = idOf(s, "p1", "battlefield", "Mutant");
      expect([chars(s, mutant).power, chars(s, mutant).toughness]).toEqual([2, 2]);
      expect(chars(s, mutant).colors).toEqual(["R"]);
    });

    describe("Turtle Van", () => {
      const crewAndAttack = (s: S, crew: string) => {
        const van = idOf(s, "p1", "battlefield", "Turtle Van");
        let cur = settle(activate(s, "p1", van, "Crew", { tap: [crew] }));
        expect(chars(cur, van).types).toContain("Creature");
        cur = attack(cur, [van]);
        return settle(cur);
      };

      it("on attacking: a +1/+1 counter on the creature that crewed it (not doubled if it's neither a Mutant, Ninja nor Turtle)", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Van", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const after = crewAndAttack(s, bear);
        expect(after.objects[bear]?.counters["+1/+1"]).toBe(2);
      });

      it("a Turtle that crewed it: a counter, then its +1/+1 counters are doubled", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Van", { name: TURTLE, counters: { "+1/+1": 1 } }] } });
        const turtle = idOf(s, "p1", "battlefield", "Test Turtle");
        const after = crewAndAttack(s, turtle);
        expect(after.objects[turtle]?.counters["+1/+1"]).toBe(4);
      });

      it('"target creature that crewed it": the target is chosen when the ability is put on the stack', () => {
        let s = scenario({
          p1: { battlefield: ["Turtle Van", "Bear Cub", "Llanowar Elves"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const van = idOf(s, "p1", "battlefield", "Turtle Van");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = settle(activate(s, "p1", van, "Crew", { tap: [bear, elves] }));
        s = attack(s, [van]);
        let asked: ChoiceRequest | undefined;
        for (let i = 0; i < 20 && !s.stack.some((x) => x.kind === "ability"); i++) {
          const p = s.pending;
          if (p?.kind === "choice") {
            asked = p.request;
            s = act(s, p.player, { type: "choose", values: [elves] });
          } else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
          else break;
        }
        expect(asked?.type === "pick" && asked.intent).toBe("triggerTarget");
        // Only creatures that crewed it this turn are offered.
        expect(asked?.type === "pick" && [...asked.options].sort()).toEqual([bear, elves].sort());
        expect(s.stack.find((x) => x.kind === "ability")?.targets.t).toEqual([elves]);
        s = settle(s);
        expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    describe("Weather Maker", () => {
      it("battlefield: a charge counter per land that enters under your control; {T}: one mana of any color", () => {
        let s = scenario({ p1: { battlefield: ["Weather Maker"], hand: ["Forest"] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        expect(manaColors(s, maker)).toEqual(["B", "G", "R", "U", "W"]);
        s = settle(playLand(s, "p1", "Forest"));
        expect(s.objects[maker]?.counters.charge).toBe(1);
      });

      it("{T}, remove two charge counters: {C}{C}; not without the counters", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Weather Maker", counters: { charge: 2 } }] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        expect(canActivate(s, "p1", maker, "3 damage")).toBe(false);
        s = activate(s, "p1", maker, "{C}{C}");
        expect(s.stack).toHaveLength(0);
        expect(s.players.p1?.manaPool.C).toBe(2);
        expect(s.objects[maker]?.counters.charge ?? 0).toBe(0);
      });

      it("{T}, remove three charge counters: 3 damage to any target", () => {
        let s = scenario({ p1: { battlefield: [{ name: "Weather Maker", counters: { charge: 3 } }] } });
        const maker = idOf(s, "p1", "battlefield", "Weather Maker");
        s = settle(activate(s, "p1", maker, "3 damage", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
        expect(s.objects[maker]?.counters.charge ?? 0).toBe(0);
      });
    });

    it("Dimension X (and the other two-color lands): enters tapped, you gain 1 life, {R} or {W}", () => {
      let s = scenario({ p1: { hand: ["Dimension X"] } });
      s = settle(playLand(s, "p1", "Dimension X"));
      const land = idOf(s, "p1", "battlefield", "Dimension X");
      expect(s.objects[land]?.tapped).toBe(true);
      expect(s.players.p1?.life).toBe(21);
      const colorsOf = (name: string) => {
        const t = scenario({ p1: { battlefield: [name] } });
        return manaColors(t, idOf(t, "p1", "battlefield", name));
      };
      expect(colorsOf("Dimension X")).toEqual(["R", "W"]);
      expect(colorsOf("Foot Headquarters")).toEqual(["B", "W"]);
      expect(colorsOf("Illegitimate Business")).toEqual(["B", "G"]);
      expect(colorsOf("Mutant Town")).toEqual(["G", "U"]);
      expect(colorsOf("TCRI Building")).toEqual(["R", "U"]);
    });

    describe("Northampton Farm", () => {
      it("{1}, {T}: exiles a creature you own (not an opponent's); {T}: {C}", () => {
        const s = scenario({
          p1: { battlefield: ["Northampton Farm", "Wastes", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const farm = idOf(s, "p1", "battlefield", "Northampton Farm");
        expect(manaColors(s, farm)).toEqual(["C"]);
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => activate(s, "p1", farm, "Exile", { targets: { t: [angel] } })).toThrow();
        const after = settle(activate(s, "p1", farm, "Exile", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        expect(inExile(after, "Bear Cub")).toHaveLength(1);
      });

      it("{1}, {T}: in multiplayer, your creature at an opponent's, but not the one an opponent took from another", () => {
        const s = scenario({
          players: 3,
          p1: { battlefield: ["Northampton Farm", "Wastes", "Bear Cub"] },
          p3: { battlefield: ["Serra Angel"] },
        });
        const farm = idOf(s, "p1", "battlefield", "Northampton Farm");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p3", "battlefield", "Serra Angel");
        steal(s, bear, "p3");
        steal(s, angel, "p2");
        expect(() => activate(s, "p1", farm, "Exile", { targets: { t: [angel] } })).toThrow();
        const after = settle(activate(s, "p1", farm, "Exile", { targets: { t: [bear] } }));
        expect(inExile(after, "Bear Cub")).toHaveLength(1);
      });

      it("{2}, {T}, sacrifice: an exiled creature returns under your control, the other cards to hand", () => {
        let s = scenario({ p1: { battlefield: ["Northampton Farm", ...lands("Wastes", 4), "Bear Cub", "Llanowar Elves"] } });
        const farm = idOf(s, "p1", "battlefield", "Northampton Farm");
        s = settle(activate(s, "p1", farm, "Exile", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
        // The land untaps on p1's next turn.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        s = settle(activate(s, "p1", farm, "Exile", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }));
        expect(inExile(s, "Bear Cub")).toHaveLength(1);
        expect(inExile(s, "Llanowar Elves")).toHaveLength(1);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5);
        s = settle(activate(s, "p1", farm, "returns"), (req, _player, cur) => pickNamed(cur, req, "Llanowar Elves"));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(inExile(s, "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p1", "graveyard", "Northampton Farm")).toHaveLength(1);
      });
    });

    describe("Turtle Lair", () => {
      it("{T}: {C}; or one mana of any color, only for a Ninja or Turtle spell", () => {
        const s = scenario({ p1: { battlefield: ["Turtle Lair"], hand: ["Llanowar Elves", TURTLE] } });
        expect(() => cast(s, "p1", "Llanowar Elves")).toThrow();
        const after = settle(cast(s, "p1", "Test Turtle"));
        expect(idsOf(after, "p1", "battlefield", "Test Turtle")).toHaveLength(1);
      });

      it("{3}, {T}: a Ninja or Turtle can't be blocked this turn", () => {
        let s = scenario({ p1: { battlefield: ["Turtle Lair", ...lands("Wastes", 3), TURTLE, "Bear Cub"] } });
        const lair = idOf(s, "p1", "battlefield", "Turtle Lair");
        const turtle = idOf(s, "p1", "battlefield", "Test Turtle");
        expect(() =>
          activate(s, "p1", lair, "blocked", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
        ).toThrow();
        s = settle(activate(s, "p1", lair, "blocked", { targets: { t: [turtle] } }));
        expect(chars(s, turtle).keywords).toContain("unblockable");
      });
    });
  });
});

describe("lot B1, faufilement", () => {
  const toBlockers = (s: S, attackers: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(
      cur,
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
  };
  const castOpt = (s: S, card: string) =>
    legalActions(s, "p1").find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);

  it("702.190a: in the declare blockers step, a creature is cast only for its sneak; the returned attacker is the player's choice", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel", ...Array(5).fill("Plains")], hand: ["Leonardo, Leader in Blue"] },
    });
    const card = idOf(s, "p1", "hand", "Leonardo, Leader in Blue");
    // In a main phase, no sneak.
    expect(() => act(s, "p1", { type: "cast", card, alternative: true })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = toBlockers(s, [bear, angel]);
    const opt = castOpt(s, card);
    expect(opt?.altAvailable).toBe(true);
    expect(opt?.normalAvailable).toBeUndefined();
    expect(opt?.altBounce).toEqual([bear, angel]);
    s = act(s, "p1", { type: "cast", card, alternative: true, bounce: [angel] });
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const leo = idOf(s, "p1", "battlefield", "Leonardo, Leader in Blue");
    expect(s.objects[leo]?.tapped).toBe(true);
    expect(s.combat?.attackers.find((a) => a.id === leo)?.defender).toBe("p2");
  });

  it("a sneaked sorcery is cast in the declare blockers step (Leonardo's Technique)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Leonardo's Technique"], graveyard: ["Llanowar Elves"] },
    });
    s = toBlockers(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Leonardo's Technique"),
      alternative: true,
      targets: { t: [elves] },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });
});

describe("lot C1, unique cards", () => {
  const settleAll = (s: S, answer: (req: ChoiceRequest) => ChoiceValue[] | undefined = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const castCard = (s: S, name: string, extra: object = {}) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
  const activateFirst = (s: S, source: string, extra: object = {}) => {
    const a = legalActions(s, "p1").find(
      (x): x is Extract<ActionOption, { type: "activate" }> => x.type === "activate" && x.source === source,
    );
    return act(s, "p1", { type: "activate", source, ability: a?.ability ?? -1, ...extra });
  };
  const toBlockers = (s: S, attackers: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(
      cur,
      (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority" && x.pending.player === "p1",
    );
  };

  it("April O'Neil, Hacktivist: one card per card type among your spells cast this turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["April O'Neil, Hacktivist", "Mountain", "Mountain", "Forest"],
        hand: ["Lightning Strike", "Llanowar Elves"],
        library: Array(6).fill("Island"),
      },
    });
    s = settleAll(castCard(s, "Lightning Strike", { targets: { t: ["p2"] } }));
    s = settleAll(castCard(s, "Llanowar Elves"));
    const hand = s.players.p1?.hand.length ?? 0;
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
    s = settleAll(s);
    expect(s.players.p1?.hand.length).toBe(hand + 2);
  });

  it("Fugitive Droid: counters only a spell that targets one of your artifacts or creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Fugitive Droid", "Island", "Bear Cub"] },
      p2: { battlefield: ["Mountain", "Mountain", "Mountain", "Mountain"], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.player === "p2");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const [toPlayer, toBearCard] = idsOf(s, "p2", "hand", "Lightning Strike") as [string, string];
    s = act(s, "p2", { type: "cast", card: toPlayer, targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "cast", card: toBearCard, targets: { t: [bear] } });
    const droid = idOf(s, "p1", "battlefield", "Fugitive Droid");
    s = act(s, "p2", { type: "pass" });
    const opt = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === droid,
    );
    const onBear = s.stack.find((x) => x.targets.t?.includes(bear))?.id as string;
    expect(opt?.targets[0]?.legal).toEqual([onBear]);
    s = settleAll(act(s, "p1", { type: "activate", source: droid, ability: opt?.ability ?? -1, targets: { t: [onBear] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(17);
  });

  it("Mondo Gecko: of the chosen color and hexproof from it until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Mondo Gecko", "Island"], hand: ["Opt"] },
      p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
    });
    const gecko = idOf(s, "p1", "battlefield", "Mondo Gecko");
    s = settleAll(activateFirst(s, gecko, { discard: [idOf(s, "p1", "hand", "Opt")] }), (req) =>
      req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
    );
    expect(chars(s, gecko).colors).toEqual(["R"]);
    // The opponent's red spell can't target it.
    s = act(s, "p1", { type: "pass" });
    const strike = legalActions(s, "p2").find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast");
    expect(strike?.modes[0]?.targets[0]?.legal ?? []).not.toContain(gecko);
  });

  describe("Ninja Teen", () => {
    it("level 3: a creature card from the graveyard is cast by its sneak {3}{B} in the declare blockers step", () => {
      let s = scenario({
        p1: { battlefield: ["Ninja Teen", "Bear Cub", ...Array(4).fill("Swamp")], graveyard: ["Serra Angel"] },
      });
      const teen = idOf(s, "p1", "battlefield", "Ninja Teen");
      (s.objects[teen] as { classLevel?: number }).classLevel = 3;
      s.version += 1;
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === angel)).toBe(false);
      s = toBlockers(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = act(s, "p1", { type: "cast", card: angel });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      const a = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[a]?.tapped).toBe(true);
      expect(s.combat?.attackers.some((x) => x.id === a)).toBe(true);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      // One of your creatures left (the Bear Cub returned): the opponent lost 1 life.
      expect(s.players.p2?.life).toBe(19);
    });

    it("level 3: the player chooses the unblocked attacker returned by the granted sneak (PLAN-M M6)", () => {
      let s = scenario({
        p1: { battlefield: ["Ninja Teen", "Bear Cub", "Savannah Lions", ...Array(4).fill("Swamp")], graveyard: ["Serra Angel"] },
      });
      const teen = idOf(s, "p1", "battlefield", "Ninja Teen");
      (s.objects[teen] as { classLevel?: number }).classLevel = 3;
      s.version += 1;
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = toBlockers(s, [cub, lions]);
      const offer = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === angel);
      const pick = offer?.type === "cast" ? offer.picks?.find((p) => p.slot === "returnAttacker") : undefined;
      expect(pick?.options.sort()).toEqual([cub, lions].sort());
      // The suggestion: the weakest attacker (both have power 2 here).
      expect(pick?.suggested).toHaveLength(1);
      const other = pick?.suggested[0] === cub ? lions : cub;
      const otherName = nameOf(s, other);
      s = act(s, "p1", { type: "cast", card: angel, picks: { returnAttacker: [other] } });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      expect(s.objects[other]).toBeUndefined();
      expect(s.combat?.attackers.some((x) => x.id === (pick?.suggested[0] as string))).toBe(true);
      expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id))).toEqual([otherName]);
    });
  });

  it("Rat King, Verminister: sacrifice three Rats (him included); the targeted card and its namesakes return tapped", () => {
    const rat = customCard({ name: "Test Rat", subtypes: ["Rat"], power: 1, toughness: 1 });
    let s = scenario({
      p1: { battlefield: ["Rat King, Verminister", rat, rat], graveyard: ["Bear Cub", "Bear Cub", "Serra Angel"] },
    });
    const king = idOf(s, "p1", "battlefield", "Rat King, Verminister");
    const [bear] = idsOf(s, "p1", "graveyard", "Bear Cub") as [string];
    const rats = idsOf(s, "p1", "battlefield", "Test Rat");
    s = settleAll(activateFirst(s, king, { sacrifice: [king, ...rats], targets: { t: [bear] } }));
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    expect(bears.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rat King, Verminister")).toHaveLength(1);
  });

  it("Don & Raph, Hard Science: on attacking, the next noncreature spell has affinity for artifacts", () => {
    let s = scenario({
      p1: { battlefield: ["Don & Raph, Hard Science", "Buzz Bots", "Buzz Bots", "Mountain"], hand: ["Lightning Strike"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Don & Raph, Hard Science"), defender: "p2" }],
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    // Lightning Strike ({1}{R}) costs {1} less (affinity): a single Mountain suffices.
    const life = s.players.p2?.life ?? 20;
    s = settleAll(castCard(s, "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(life - 3);
  });

  it("Mikey & Don: a Turtle spell cast from the top of the library enters with one more +1/+1 counter", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mikey & Don, Party Planners", "Plains", "Plains"],
        library: ["Lita, Little Orphan Amphibian", "Forest"],
      },
    });
    const lita = s.players.p1?.library[0] as string;
    s = settleAll(act(s, "p1", { type: "cast", card: lita }));
    const on = idOf(s, "p1", "battlefield", "Lita, Little Orphan Amphibian");
    expect(s.objects[on]?.counters["+1/+1"]).toBe(1);
    const forest = s.players.p1?.library[0] as string;
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });

  it("Kitsune's Technique: half the library, rounded up, in a single mill", () => {
    let s = scenario({
      p1: { battlefield: Array(6).fill("Island"), hand: ["Kitsune's Technique"] },
      p2: { library: Array(5).fill("Island") },
    });
    s = settleAll(castCard(s, "Kitsune's Technique", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(3);
  });
});

describe('"You put counters" (lot K2)', () => {
  it("Mikey & Leo: only counters you put on your creatures trigger it", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Mikey & Leo, Chaos & Order"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Bear Cub")).triggered).toEqual(["Mikey & Leo, Chaos & Order"]);
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual([]);
  });
});

describe("Teenage Mutant Ninja Turtles, PLAN-D D9: last cards", () => {
  it("North Wind Avatar: flying 5/5; the enter ability only triggers if it was cast", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Mountain"], hand: ["North Wind Avatar"] } });
    s = cast(s, "p1", "North Wind Avatar");
    // The spell resolves: the "if it was cast" ability waits on the stack.
    s = passAccepting(s, (x) => !x.stack.some((i) => i.kind === "spell"));
    const avatar = idOf(s, "p1", "battlefield", "North Wind Avatar");
    expect(s.stack.map((i) => (i.kind === "ability" ? s.defs[i.sourceDefId]?.name : undefined))).toEqual(["North Wind Avatar"]);
    expect([chars(s, avatar).power, chars(s, avatar).toughness]).toEqual([5, 5]);
    expect(chars(s, avatar).keywords).toContain("flying");
    expect([...chars(s, avatar).subtypes].sort()).toEqual(["Avatar", "Dragon", "Spirit"]);
    // Without a sideboard, nothing outside the game: no question, nothing happens.
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(hand);
    // Put onto the battlefield without being cast (Zombify): no trigger.
    let t = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["North Wind Avatar"] } });
    t = cast(t, "p1", "Zombify", { targets: { t: [idOf(t, "p1", "graveyard", "North Wind Avatar")] } });
    t = passAccepting(t, (x) => !x.stack.some((i) => i.kind === "spell"));
    expect(idsOf(t, "p1", "battlefield", "North Wind Avatar")).toHaveLength(1);
    expect(t.stack).toHaveLength(0);
    expect(t.triggers).toHaveLength(0);
  });

  it("North Wind Avatar: you may put a card from your sideboard (outside the game) into your hand, unseen by the opponent", () => {
    const setup = () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Mountain"], hand: ["North Wind Avatar"], sideboard: ["Shock", "Duress"] },
        p2: { sideboard: ["Negate"] },
      });
      s = cast(s, "p1", "North Wind Avatar");
      return passAccepting(s, (x) => !x.stack.some((i) => i.kind === "spell"));
    };
    const shock = (s: S) => s.players.p1?.sideboard.find((id) => nameOf(s, id) === "Shock") as string;
    let s = setup();
    const {
      s: after,
      events,
      asked,
    } = settleLogged(s, (req, p, x) => (p === "p1" && req.type === "pick" ? [shock(x)] : undefined));
    // A single question: the owner's sideboard only (not the opponent's), "may" (none is allowed).
    expect(asked).toHaveLength(1);
    const req = asked[0]?.state.pending;
    expect(req?.kind === "choice" && req.request.type === "pick" && [req.request.min, req.request.max]).toEqual([0, 1]);
    expect(req?.kind === "choice" && req.request.type === "pick" && namesIn(s, req.request.options).sort()).toEqual([
      "Duress",
      "Shock",
    ]);
    // The opponent doesn't see the cards offered.
    const seen = projectView(asked[0]?.state as S, "p2").pending;
    expect(seen).toEqual({ kind: "choice", player: "p1" });
    s = after;
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shock"]);
    expect(namesIn(s, s.players.p1?.sideboard)).toEqual(["Duress"]);
    expect(namesIn(s, s.players.p2?.sideboard)).toEqual(["Negate"]);
    // The opponent learns that a card came from outside the game, not which one.
    const moved = events.filter((e) => e.type === "moved" && e.from === "sideboard");
    expect(moved).toHaveLength(1);
    expect(filterEvents(moved, "p1")[0]).toMatchObject({ defId: s.objects[s.players.p1?.hand[0] ?? ""]?.defId });
    expect(filterEvents(moved, "p2")[0]).toEqual({ type: "moved", owner: "p1", from: "sideboard", to: "hand" });
    // Declined: the card stays in the sideboard.
    const declined = settle(setup(), (req) => (req.type === "pick" ? [] : undefined));
    expect(declined.players.p1?.hand).toHaveLength(0);
    expect(declined.players.p1?.sideboard).toHaveLength(2);
  });

  it("The sideboard is set up outside the game, kept by the record, and leaves with an eliminated player", () => {
    const deck = Array(40).fill(card("Island"));
    const { state, record } = createRecordedGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", deck, sideboard: [card("Shock"), card("North Wind Avatar")] },
        { id: "p2", name: "B", deck },
      ],
    });
    expect(namesIn(state, state.players.p1?.sideboard)).toEqual(["Shock", "North Wind Avatar"]);
    expect(state.players.p2?.sideboard).toEqual([]);
    expect(state.objects[state.players.p1?.sideboard[0] ?? ""]?.zone).toBe("sideboard");
    // The sideboard comes after every deck and draws nothing at random: the libraries are shuffled as without it.
    const plain = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", deck },
        { id: "p2", name: "B", deck },
      ],
    }).state;
    expect(plain.players.p2?.library.slice(0, 5)).toEqual(state.players.p2?.library.slice(0, 5));
    expect(plain.turn.startingPlayer).toBe(state.turn.startingPlayer);
    expect(record.players[0]?.sideboard).toEqual(["Shock", "North Wind Avatar"]);
    expect(isGameRecord(record)).toBe(true);
    const replayed = replayGame(record, card).state;
    expect(namesIn(replayed, replayed.players.p1?.sideboard)).toEqual(["Shock", "North Wind Avatar"]);
    // Neither the opponent's view nor their faces cite the sideboard.
    const view = projectView(state, "p2");
    const sideDefs = new Set((state.players.p1?.sideboard ?? []).map((id) => state.objects[id]?.defId));
    expect(Object.keys(visibleFaces(state, view, [])).some((d) => sideDefs.has(d))).toBe(false);
    // A player who leaves a multiplayer game takes their sideboard with them (800.4a).
    const three = createGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", deck, sideboard: [card("Shock")] },
        { id: "p2", name: "B", deck },
        { id: "p3", name: "C", deck },
      ],
    }).state;
    const gone = act(three, "p1", { type: "concede" });
    expect(gone.over).toBe(false);
    expect(gone.players.p1?.sideboard).toEqual([]);
    expect(Object.values(gone.objects).some((o) => o.zone === "sideboard")).toBe(false);
  });
});

describe('Teenage Mutant Ninja Turtles, PLAN-A A4a: "that player" in multiplayer', () => {
  it("Leatherhead: the destroyed artifact or enchantment is the one of the damaged player", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: [{ name: "Leatherhead, Swamp Stalker", counters: { hexproof: 1 } }] },
      p2: { battlefield: ["Warleader's Call"] },
      p3: { battlefield: ["Fishing Pole", "Trusty Boomerang"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Leatherhead, Swamp Stalker")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Fishing Pole", "Trusty Boomerang"]]);
    expect(idsOf(run.s, "p2", "battlefield", "Warleader's Call")).toHaveLength(1);
    expect(run.s.players.p3?.graveyard).toHaveLength(1);
  });

  it("Shark Shredder: the card comes from the damaged player's graveyard", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Shark Shredder, Killer Clone"] },
      p2: { graveyard: ["Serra Angel"] },
      p3: { graveyard: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Shark Shredder, Killer Clone")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
    expect(idsOf(run.s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it('Shark Shredder: the creature enters tapped and attacking without having "attacked" (508.4)', () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Shark Shredder, Killer Clone"] },
      p3: { graveyard: ["Serra Angel"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Shark Shredder, Killer Clone"), defender: "p3" },
      ],
    });
    s = throughCombat(s, (req, _p, cur) => (req.intent === "triggerTarget" ? pickNamed(cur, req, "Serra Angel") : undefined));
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.turnLog.some((e) => e.e === "attack" && e.id === angel)).toBe(false);
  });

  it("Shark Shredder: it attacks the damaged player, not the one your first creature attacks", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Shark Shredder, Killer Clone"] },
      p3: { graveyard: ["Serra Angel"] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Shark Shredder, Killer Clone"), defender: "p3" },
      ],
    });
    let defender: string | undefined;
    for (let i = 0; i < 80 && s.turn.step !== "main2"; i++) {
      const angel = idsOf(s, "p1", "battlefield", "Serra Angel")[0];
      if (angel && defender === undefined) defender = s.combat?.attackers.find((a) => a.id === angel)?.defender;
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values:
            (p.request.intent === "triggerTarget" ? pickNamed(s, p.request, "Serra Angel") : undefined) ?? p.request.suggested,
        });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    expect(defender).toBe("p3");
  });

  describe('Party Dude, level 3: "whenever one or more of your opponents are attacked"', () => {
    const run = (defender: "p1" | "p3" | "walker") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Party Dude", ...lands("Forest", 7)], hand: ["Opt", "Opt", "Island"] },
        p2: { battlefield: ["Bear Cub"] },
        p3: { battlefield: ["Ajani Resolute"] },
      });
      const dude = idOf(s, "p1", "battlefield", "Party Dude");
      s = settle(activate(s, "p1", dude));
      s = settle(activate(s, "p1", dude));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const target = defender === "walker" ? idOf(s, "p3", "battlefield", "Ajani Resolute") : defender;
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: target }] });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      return [chars(s, bear).power, chars(s, bear).toughness];
    };
    it("an opponent attacks another opponent: +X/+X", () => expect(run("p3")).toEqual([5, 5]));
    it("you are attacked, or only a planeswalker: nothing", () => {
      expect(run("p1")).toEqual([2, 2]);
      expect(run("walker")).toEqual([2, 2]);
    });
  });
});
