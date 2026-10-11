/**
 * Commander (EDH pseudo-set): rules tests for the "Stolen Futures" deck (The Ur-Sphinx). Sphinxes, free spells taken
 * from the opponents, piles, votes, extra turns and phases, connive X, opening-hand reveal (Chancellor of the Spires).
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  castNowOf,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  settleNoBlocks,
  stepTrail,
  throughCombat,
  untilCastNow,
} from "./helpers";

const handNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const playLand = (s: GameState, p: PlayerId, name: string) =>
  act(s, p, { type: "playLand", card: idOf(s, p, "hand", name) } as never);
const activations = (s: GameState, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
const tokensNamed = (s: GameState, p: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
/** Chooses the option whose label is given ("vote", "guess"…). */
const labeled = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => l === label)
        .map(([k]) => k)
    : undefined;
/** Combines answers: the first that gives one. */
const first =
  (...answers: ((req: ChoiceRequest, p: PlayerId, s: GameState) => (string | number)[] | undefined)[]) =>
  (req: ChoiceRequest, p: PlayerId, s: GameState) => {
    for (const a of answers) {
      const v = a(req, p, s);
      if (v?.length) return v;
    }
    return undefined;
  };
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
type Answer = (req: ChoiceRequest, p: PlayerId, s: GameState) => (string | number)[] | undefined;
/** Attacks p2 with the named creature of p1, without blocks, up to the second main phase. */
const attackWithIt = (s: GameState, name: string, answer: Answer = () => undefined) =>
  throughCombat(attack(s, [idOf(s, "p1", "battlefield", name)]), answer);
/** p2 receives priority (p1 passes with an empty stack). */
const toP2 = (s: GameState) => act(s, "p1", { type: "pass" });

describe("The Ur-Sphinx, Stolen Futures (EDH)", () => {
  describe("Sphinxes", () => {
    it("Azor, the Lawbringer: opponents can't cast instants or sorceries during their next turn; {X}{W}{U}{U} on attack", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 3)], hand: ["Azor, the Lawbringer"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Lightning Bolt"] },
      });
      s = settle(castIt(s, "p1", "Azor, the Lawbringer"));
      // During your turn (it isn't their next turn yet), they still can.
      expect(castable(toP2(s), "p2", idOf(s, "p2", "hand", "Shock"))).toBe(true);
      const p2Main = (n: number) => (x: GameState) =>
        x.turn.number === n && x.turn.step === "main1" && x.pending?.kind === "priority" && x.pending.player === "p2";
      s = advanceUntil(s, p2Main(4));
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Shock"))).toBe(false);
      // Their following turn: the restriction is over.
      s = advanceUntil(s, p2Main(6));
      expect(castable(s, "p2", idOf(s, "p2", "hand", "Shock"))).toBe(true);

      // Attack: {W}{U}{U} then X = 2 (seven lands: X up to 4).
      let t = scenario({
        p1: {
          battlefield: ["Azor, the Lawbringer", ...lands("Plains", 3), ...lands("Island", 4)],
          library: lands("Island", 10),
        },
      });
      t = attackWithIt(t, "Azor, the Lawbringer", (req) =>
        req.type === "yesNo" ? [1] : req.type === "number" ? [2] : undefined,
      );
      expect(t.players.p1?.life).toBe(22);
      expect(t.players.p1?.hand).toHaveLength(2);
      expect(t.players.p2?.life).toBe(14);
    });

    it("Chancellor of the Spires: revealed from the opening hand, each opponent mills seven at the first upkeep", () => {
      const deck = (extra: string, land: string) => [extra, ...Array(59).fill(land)].map((n) => card(n));
      // A seed where the Chancellor is in p1's opening hand; p2 starts (its upkeep is the first one).
      let s!: GameState;
      for (let seed = 1; seed < 200; seed++) {
        s = createGame({
          seed,
          startingPlayer: "p2",
          players: [
            { id: "p1", name: "A", deck: deck("Chancellor of the Spires", "Island") },
            { id: "p2", name: "B", deck: deck("Swamp", "Swamp") },
          ],
        }).state;
        if (idsOf(s, "p1", "hand", "Chancellor of the Spires").length) break;
      }
      for (let i = 0; i < 4 && s.pending?.kind === "mulligan"; i++) s = act(s, s.pending.player, { type: "keep" });
      expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("leyline");
      const chancellor = idOf(s, "p1", "hand", "Chancellor of the Spires");
      s = act(s, "p1", { type: "choose", values: [chancellor] });
      // Revealed: it stays in hand; at p2's first upkeep (turn 1), p2 mills seven, p1 nothing.
      expect(idsOf(s, "p1", "hand", "Chancellor of the Spires")).toEqual([chancellor]);
      s = advanceUntil(s, (x) => x.turn.step === "draw" || x.turn.step === "main1");
      expect(s.turn.number).toBe(1);
      expect(s.players.p2?.graveyard).toHaveLength(7);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it("Chancellor of the Spires: enters, you may cast an instant or sorcery from an opponent's graveyard for free", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 7), hand: ["Chancellor of the Spires"] },
        p2: { graveyard: ["Lightning Bolt", "Bear Cub"] },
      });
      const bolt = idOf(s, "p2", "graveyard", "Lightning Bolt");
      s = castIt(s, "p1", "Chancellor of the Spires");
      s = untilCastNow(passAccepting(s, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability"));
      expect(s.stack[0]?.targets).toEqual({ t: [bolt] });
      s = untilCastNow(s);
      expect(castNowOf(s)?.cards).toEqual([bolt]);
      s = act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } } as never);
      s = settle(s);
      expect(s.players.p2?.life).toBe(17);
      // The spell was cast by p1 but stays p2's card: back to its owner's graveyard.
      expect(graveyardNames(s, "p2")).toContain("Lightning Bolt");
    });

    it("Consecrated Sphinx: whenever an opponent draws a card, you may draw two cards", () => {
      let s = scenario({
        p1: { battlefield: ["Consecrated Sphinx"], library: lands("Island", 10) },
        p2: { battlefield: ["Island"], hand: ["Opt"], library: lands("Swamp", 10) },
        active: "p2",
      });
      s = settle(castIt(s, "p2", "Opt"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.players.p1?.hand).toHaveLength(2);
      // Its own draws don't trigger it.
      let t = scenario({ p1: { battlefield: ["Consecrated Sphinx", "Island"], hand: ["Opt"], library: lands("Island", 10) } });
      t = settle(castIt(t, "p1", "Opt"));
      expect(t.players.p1?.hand).toHaveLength(1);
    });

    it("Dazzling Sphinx: that player exiles until an instant or sorcery; you may cast it free; the rest on the bottom", () => {
      let s = scenario({
        p1: { battlefield: ["Dazzling Sphinx"] },
        p2: { library: ["Bear Cub", "Swamp", "Lightning Bolt", "Island", "Island"] },
      });
      s = advanceUntil(
        attack(s, [idOf(s, "p1", "battlefield", "Dazzling Sphinx")]),
        (x) => !!castNowOf(x) || x.turn.step === "main2",
        200,
      );
      const bolt = castNowOf(s)?.cards[0] ?? "";
      expect(nameOf(s, bolt)).toBe("Lightning Bolt");
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } } as never));
      expect(s.players.p2?.life).toBe(20 - 4 - 3);
      // Bear Cub and Swamp under the two Islands; the Bolt in its owner's graveyard.
      expect(namesIn(s, s.players.p2?.library)).toEqual(["Island", "Island", "Bear Cub", "Swamp"]);
      expect(graveyardNames(s, "p2")).toEqual(["Lightning Bolt"]);
    });

    it("Dream Trawler: +1/+0 per card drawn, draws when attacking; discard a card: hexproof and tapped", () => {
      let s = scenario({
        p1: { battlefield: ["Dream Trawler"], hand: ["Island"], library: lands("Island", 10) },
      });
      const trawler = idOf(s, "p1", "battlefield", "Dream Trawler");
      s = attackWithIt(s, "Dream Trawler");
      // Attack: a card drawn, +1/+0; 4 lifelink damage.
      expect(chars(s, trawler).power).toBe(4);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.life).toBe(24);
      let t = scenario({ p1: { battlefield: ["Dream Trawler"], hand: ["Island"] } });
      const tr = idOf(t, "p1", "battlefield", "Dream Trawler");
      const ab = activations(t, "p1", tr)[0];
      t = settle(act(t, "p1", { type: "activate", source: tr, ability: ab?.ability } as never));
      expect(chars(t, tr).keywords).toContain("hexproof");
      expect(t.objects[tr]?.tapped).toBe(true);
      expect(t.players.p1?.hand).toHaveLength(0);
    });

    it("Magister Sphinx: target player's life total becomes 10", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Magister Sphinx"] },
        p2: { life: 40 },
      });
      s = settle(castIt(s, "p1", "Magister Sphinx"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(10);
    });

    it("Master of Predicaments: a wrong guess lets you cast the chosen card without paying its mana cost", () => {
      /** Attacks with the Master; the opponent answers `guess`; stops at the free cast or at the second main phase. */
      const guessing = (guess: string) => {
        let s = scenario({ p1: { battlefield: ["Master of Predicaments"], hand: ["Sphinx of the Final Word"] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Master of Predicaments")]);
        for (let i = 0; i < 200 && !castNowOf(s) && s.turn.step !== "main2"; i++) {
          const p = s.pending;
          if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
          else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
          else if (p?.kind === "choice")
            s = act(s, p.player, { type: "choose", values: labeled(guess)(p.request) ?? p.request.suggested } as never);
          else break;
        }
        return s;
      };
      // Right guess (a seven-mana card is greater than 4): nothing.
      const s = guessing("Greater than 4");
      expect(castNowOf(s)).toBeUndefined();
      expect(handNames(s, "p1")).toEqual(["Sphinx of the Final Word"]);
      // Wrong guess: cast for free.
      let t = guessing("4 or less");
      const sphinx = castNowOf(t)?.cards[0] ?? "";
      expect(nameOf(t, sphinx)).toBe("Sphinx of the Final Word");
      t = settle(act(t, "p1", { type: "cast", card: sphinx } as never));
      expect(idsOf(t, "p1", "battlefield", "Sphinx of the Final Word")).toHaveLength(1);
    });

    it("Medomai the Ageless: combat damage gives an extra turn, during which it can't attack", () => {
      let s = scenario({ p1: { battlefield: ["Medomai the Ageless"] } });
      const medomai = idOf(s, "p1", "battlefield", "Medomai the Ageless");
      s = attackWithIt(s, "Medomai the Ageless");
      expect(s.extraTurns).toEqual(["p1"]);
      s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
      expect(s.turn.active).toBe("p1");
      expect(s.turn.extra).toBe(true);
      expect(chars(s, medomai).keywords).toContain("cantAttack");
      // The next ordinary turn: it can attack again.
      s = advanceUntil(s, (x) => x.turn.number === 6 && x.turn.step === "main1");
      expect(s.turn.active).toBe("p1");
      expect(s.turn.extra).toBeUndefined();
      expect(chars(s, medomai).keywords).not.toContain("cantAttack");
    });

    it("Raffine, Scheming Seer: whenever you attack, target attacking creature connives X (the attackers)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Raffine, Scheming Seer", "Bear Cub", "Savannah Lions"],
          hand: ["Shock", "Island"],
          library: ["Lightning Bolt", "Opt", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = act(
        advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
        "p1",
        {
          type: "declareAttackers",
          attackers: [
            { id: bear, defender: "p2" },
            { id: lions, defender: "p2" },
          ],
        },
      );
      // Target: the Bear; X = 2: two cards drawn, two discarded (Shock and Island: one nonland).
      s = settleNoBlocks(s, (req, _p, st) =>
        req.type === "pick" && req.intent === "triggerTarget"
          ? [bear]
          : req.type === "pick" && req.intent === "discard"
            ? req.options.filter((id) => ["Shock", "Island"].includes(nameOf(st, id) ?? "")).slice(0, 2)
            : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Lightning Bolt", "Opt"]);
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(1);
    });

    it("Scholar of the Lost Trove: casts an instant, sorcery or artifact from your graveyard for free; exiled after", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 7), hand: ["Scholar of the Lost Trove"], graveyard: ["Lightning Bolt"] },
      });
      const bolt = idOf(s, "p1", "graveyard", "Lightning Bolt");
      s = castIt(s, "p1", "Scholar of the Lost Trove");
      s = untilCastNow(passAccepting(s, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability"));
      s = untilCastNow(s);
      expect(castNowOf(s)?.cards).toEqual([bolt]);
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } } as never));
      expect(s.players.p2?.life).toBe(17);
      expect(exiled(s, "Lightning Bolt")).toHaveLength(1);
      expect(graveyardNames(s, "p1")).toEqual([]);
    });

    it("Sharuum the Hegemon: you may return target artifact card from your graveyard to the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Island", 2), ...lands("Swamp", 2)],
          hand: ["Sharuum the Hegemon"],
          graveyard: ["Grim Monolith", "Bear Cub"],
        },
      });
      s = settle(castIt(s, "p1", "Sharuum the Hegemon"), yes);
      expect(idsOf(s, "p1", "battlefield", "Grim Monolith")).toHaveLength(1);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
    });

    it("Sphinx Ambassador: a creature card whose name the player didn't name enters under your control", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Sphinx Ambassador"] },
          p2: { library: ["Island", "Bear Cub", "Swamp"] },
        });
      // The opponent names Island: the Bear Cub may enter under p1's control.
      let s = start();
      s = attackWithIt(s, "Sphinx Ambassador", (req, _p, st) =>
        req.type === "pick" && req.prompt.includes("library")
          ? req.options.filter((id) => nameOf(st, id) === "Bear Cub")
          : req.type === "name"
            ? ["Island"]
            : req.type === "yesNo"
              ? [1]
              : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.library).toHaveLength(2);
      // The opponent names Bear Cub: it stays in their library.
      let t = start();
      t = attackWithIt(t, "Sphinx Ambassador", (req, _p, st) =>
        req.type === "pick" && req.prompt.includes("library")
          ? req.options.filter((id) => nameOf(st, id) === "Bear Cub")
          : req.type === "name"
            ? ["Bear Cub"]
            : req.type === "yesNo"
              ? [1]
              : undefined,
      );
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(namesIn(t, t.players.p2?.library).sort()).toEqual(["Bear Cub", "Island", "Swamp"]);
    });

    it("Sphinx Summoner: you may search your library for an artifact creature card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Swamp", 2)],
          hand: ["Sphinx Summoner"],
          library: ["Island", "Magister Sphinx", "Grim Monolith", "Bear Cub"],
        },
      });
      // Only the artifact creature card can be found.
      let offered: string[] = [];
      s = settle(
        castIt(s, "p1", "Sphinx Summoner"),
        first(yes, (req, _p, st) => {
          if (req.type !== "pick" || req.intent !== "search") return undefined;
          offered = namesIn(st, req.options) as string[];
          return req.options;
        }),
      );
      expect(offered).toEqual(["Magister Sphinx"]);
      expect(handNames(s, "p1")).toEqual(["Magister Sphinx"]);
    });

    it("Sphinx of Uthuun: an opponent separates the top five cards into two piles; one into your hand", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 7),
          hand: ["Sphinx of Uthuun"],
          library: ["Opt", "Shock", "Bear Cub", "Island", "Swamp", "Forest"],
        },
      });
      s = settle(castIt(s, "p1", "Sphinx of Uthuun"));
      expect((s.players.p1?.hand.length ?? 0) + (s.players.p1?.graveyard.length ?? 0)).toBe(5);
      expect(s.players.p1?.library).toHaveLength(1);
    });

    it("Sphinx of the Second Sun: an additional beginning phase (untap, upkeep, draw) after the postcombat main phase", () => {
      let s = scenario({
        p1: { battlefield: ["Sphinx of the Second Sun", { name: "Island", tapped: true }], library: lands("Island", 10) },
        step: "main1",
      });
      s = advanceUntil(
        s,
        (x) => x.turn.step === "main2" && x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0,
      );
      const steps: string[] = [];
      for (let i = 0; i < 100 && s.turn.active === "p1"; i++) {
        if (steps[steps.length - 1] !== s.turn.step) steps.push(s.turn.step);
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested } as never);
        else break;
      }
      expect(steps.slice(0, 4)).toEqual(["main2", "upkeep", "draw", "end"]);
      expect(s.players.p1?.hand).toHaveLength(1);
      // The Island untapped, a card drawn.
      expect(s.battlefield.every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Tivit, Seller of Secrets: each player votes (you may vote again); a Clue per evidence vote, a Treasure per bribery", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Island", 2), ...lands("Swamp", 2)],
          hand: ["Tivit, Seller of Secrets"],
        },
      });
      s = settle(castIt(s, "p1", "Tivit, Seller of Secrets"), (req, p) =>
        req.type === "pick" && req.labels
          ? p === "p2"
            ? labeled("Bribery (a Treasure)")(req)
            : req.prompt.includes("additional")
              ? labeled("Evidence (investigate)")(req)
              : labeled("Bribery (a Treasure)")(req)
          : undefined,
      );
      expect(tokensNamed(s, "p1", "Treasure")).toHaveLength(2);
      expect(tokensNamed(s, "p1", "Clue")).toHaveLength(1);
    });

    it("Unesh, Criosphinx Sovereign: Sphinx spells cost {2} less; a Sphinx entering reveals four cards in two piles", () => {
      let s = scenario({
        p1: {
          battlefield: ["Unesh, Criosphinx Sovereign", ...lands("Island", 3)],
          hand: ["Dazzling Sphinx"],
          library: ["Opt", "Shock", "Island", "Swamp", "Forest"],
        },
      });
      // {3}{U}{U} − {2}: three Islands are enough.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Dazzling Sphinx"))).toBe(true);
      s = settle(castIt(s, "p1", "Dazzling Sphinx"));
      expect((s.players.p1?.hand.length ?? 0) + (s.players.p1?.graveyard.length ?? 0)).toBe(4);
      expect(s.players.p1?.library).toHaveLength(1);
    });

    it("Windreader Sphinx: whenever a creature with flying attacks, you may draw a card", () => {
      let s = scenario({
        p1: { battlefield: ["Windreader Sphinx", "Healer's Hawk", "Bear Cub"], library: lands("Island", 10) },
      });
      s = act(
        advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
        "p1",
        {
          type: "declareAttackers",
          attackers: ["Windreader Sphinx", "Healer's Hawk", "Bear Cub"].map((n) => ({
            id: idOf(s, "p1", "battlefield", n),
            defender: "p2",
          })),
        },
      );
      s = settleNoBlocks(s, yes);
      // Two flying attackers: two cards.
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Yennett, Cryptic Sovereign: casts the top card for free if its mana value is odd, otherwise draws it", () => {
      // Lightning Bolt (1, odd): cast for free.
      let s = scenario({ p1: { battlefield: ["Yennett, Cryptic Sovereign"], library: ["Lightning Bolt", "Island"] } });
      s = advanceUntil(attack(s, [idOf(s, "p1", "battlefield", "Yennett, Cryptic Sovereign")]), (x) => !!castNowOf(x), 100);
      const bolt = castNowOf(s)?.cards[0] ?? "";
      expect(nameOf(s, bolt)).toBe("Lightning Bolt");
      s = settleNoBlocks(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } } as never));
      expect(s.players.p1?.hand).toHaveLength(0);
      // Bear Cub (2, even): drawn.
      let t = scenario({ p1: { battlefield: ["Yennett, Cryptic Sovereign"], library: ["Bear Cub", "Island"] } });
      t = attackWithIt(t, "Yennett, Cryptic Sovereign");
      expect(handNames(t, "p1")).toEqual(["Bear Cub"]);
    });
  });

  describe("other cards", () => {
    it("Academy Manufactor: a Clue, Food or Treasure becomes one of each; two Manufactors, three of each", () => {
      let s = scenario({ p1: { battlefield: ["Academy Manufactor", "Tireless Tracker"], hand: ["Forest"] } });
      s = settle(playLand(s, "p1", "Forest"));
      for (const n of ["Clue", "Food", "Treasure"]) expect(tokensNamed(s, "p1", n)).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Academy Manufactor", "Academy Manufactor", "Tireless Tracker"], hand: ["Forest"] },
      });
      t = settle(playLand(t, "p1", "Forest"));
      for (const n of ["Clue", "Food", "Treasure"]) expect(tokensNamed(t, "p1", n)).toHaveLength(3);
    });

    it("Breach the Multiverse: each player mills ten, then a creature or planeswalker card of each graveyard is yours", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 7)],
          hand: ["Breach the Multiverse"],
          library: ["Savannah Lions", ...lands("Swamp", 12)],
        },
        p2: { library: ["Bear Cub", ...lands("Island", 12)] },
      });
      s = settle(castIt(s, "p1", "Breach the Multiverse"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(s.objects[bear]?.controller).toBe("p1");
      expect(s.objects[bear]?.owner).toBe("p2");
      expect(chars(s, bear).subtypes).toContain("Phyrexian");
      expect(chars(s, lions).subtypes).toContain("Phyrexian");
      expect(s.players.p2?.library).toHaveLength(3);
    });

    it("Grim Monolith: {T}: {C}{C}{C}; doesn't untap during your untap step; {4}: untap it", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Grim Monolith", tapped: true }] }, active: "p2" });
      const mono = idOf(s, "p1", "battlefield", "Grim Monolith");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.objects[mono]?.tapped).toBe(true);
      // {T}: {C}{C}{C}, with three Islands: Consecrated Sphinx ({4}{U}{U}).
      let t = scenario({ p1: { battlefield: ["Grim Monolith", ...lands("Island", 3)], hand: ["Consecrated Sphinx"] } });
      t = settle(castIt(t, "p1", "Consecrated Sphinx"));
      expect(idsOf(t, "p1", "battlefield", "Consecrated Sphinx")).toHaveLength(1);
      const m = idOf(t, "p1", "battlefield", "Grim Monolith");
      expect(t.objects[m]?.tapped).toBe(true);
      // {4}: untap it.
      let u = scenario({ p1: { battlefield: [{ name: "Grim Monolith", tapped: true }, ...lands("Island", 4)] } });
      const mu = idOf(u, "p1", "battlefield", "Grim Monolith");
      const untap = activations(u, "p1", mu)[0];
      u = settle(act(u, "p1", { type: "activate", source: mu, ability: untap?.ability } as never));
      expect(u.objects[mu]?.tapped).toBe(false);
    });

    it("Hall of the Bandit Lord: enters tapped; {T}, pay 3 life: {C}, a creature spell cast with it gains haste", () => {
      let s = scenario({ p1: { hand: ["Hall of the Bandit Lord"] } });
      s = settle(playLand(s, "p1", "Hall of the Bandit Lord"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Hall of the Bandit Lord")]?.tapped).toBe(true);
      // Bear Cub ({1}{G}) with a Forest and the Hall: it has haste, 3 life paid.
      let u = scenario({ p1: { battlefield: ["Hall of the Bandit Lord", "Forest"], hand: ["Bear Cub"] } });
      u = settle(castIt(u, "p1", "Bear Cub"));
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      expect(u.players.p1?.life).toBe(17);
      expect(chars(u, bear).keywords).toContain("haste");
    });

    it("Mnemonic Betrayal: cast spells from the opponents' exiled graveyards with any mana; the rest returns at the end step", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Mnemonic Betrayal"] },
        p2: { graveyard: ["Lightning Bolt", "Bear Cub", "Mountain"] },
      });
      s = settle(castIt(s, "p1", "Mnemonic Betrayal"));
      expect(exiled(s, "Mnemonic Betrayal")).toHaveLength(1);
      // Lightning Bolt with a Swamp (mana of any type); the Mountain can't be played.
      const bolt = exiled(s, "Lightning Bolt")[0] ?? "";
      const mountain = exiled(s, "Mountain")[0] ?? "";
      expect(castable(s, "p1", bolt)).toBe(true);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } } as never));
      expect(s.players.p2?.life).toBe(17);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Lightning Bolt", "Mountain"]);
    });

    it("Mystical Tutor: an instant or sorcery card on top of your library", () => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Mystical Tutor"], library: ["Island", "Bear Cub", "Shock", "Swamp"] },
      });
      let offered: string[] = [];
      s = settle(castIt(s, "p1", "Mystical Tutor"), (req, _p, st) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = namesIn(st, req.options) as string[];
        return req.options;
      });
      expect(offered).toEqual(["Shock"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Shock");
    });

    it("Raise the Palisade: creatures not of the chosen type return to their owners' hands", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 5), "Consecrated Sphinx", "Bear Cub"], hand: ["Raise the Palisade"] },
        p2: { battlefield: ["Savannah Lions", "Dazzling Sphinx"] },
      });
      s = settle(castIt(s, "p1", "Raise the Palisade"), picking(["Sphinx"]));
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(handNames(s, "p2")).toEqual(["Savannah Lions"]);
      expect(idsOf(s, "p2", "battlefield", "Dazzling Sphinx")).toHaveLength(1);
    });

    it("Reconnaissance: {0}: an attacking creature you control is removed from combat and untapped", () => {
      let s = scenario({ p1: { battlefield: ["Reconnaissance", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const recon = idOf(s, "p1", "battlefield", "Reconnaissance");
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1" && x.stack.length === 0);
      expect(s.objects[bear]?.tapped).toBe(true);
      const ab = activations(s, "p1", recon)[0];
      s = act(s, "p1", { type: "activate", source: recon, ability: ab?.ability, targets: { t: [bear] } } as never);
      s = passAccepting(s, (x) => x.stack.length === 0);
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(s.combat?.attackers.some((a) => a.id === bear) ?? false).toBe(false);
      s = settleNoBlocks(s);
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(20);
    });

    it("Urza's Incubator: creature spells of the chosen type cost {2} less, for every player", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3)], hand: ["Urza's Incubator", "Dazzling Sphinx"] },
        p2: { battlefield: ["Island", "Island", "Island"], hand: ["Sphinx of Forgotten Lore"] },
      });
      s = settle(castIt(s, "p1", "Urza's Incubator"), picking(["Sphinx"]));
      // {2}{U}{U} − {2} for p2 (flash): two Islands.
      expect(chars(s, idOf(s, "p1", "battlefield", "Urza's Incubator")).name).toBe("Urza's Incubator");
      expect(s.objects[idOf(s, "p1", "battlefield", "Urza's Incubator")]?.chosen?.creatureType).toBe("Sphinx");
      expect(castable(toP2(s), "p2", idOf(s, "p2", "hand", "Sphinx of Forgotten Lore"))).toBe(true);
    });
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("The Ur-Sphinx: every player mills first, then a milled card of each player may be cast for free", () => {
    let s = scenario({
      p1: { battlefield: ["The Ur-Sphinx"], library: ["Shock", ...lands("Island", 3)] },
      p2: { library: ["Lightning Bolt", ...lands("Island", 3)] },
    });
    s = untilCastNow(attack(s, [idOf(s, "p1", "battlefield", "The Ur-Sphinx")]));
    // The first offer (p1's Shock): p2 has already milled their Lightning Bolt.
    expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Shock"]);
    expect(graveyardNames(s, "p2")).toEqual(["Lightning Bolt"]);
    s = untilCastNow(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string, free: true, targets: { t: ["p2"] } }));
    expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Lightning Bolt"]);
    s = settleNoBlocks(
      act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string, free: true, targets: { t: ["p2"] } }),
    );
    expect(s.players.p2?.life).toBeLessThanOrEqual(15);
  });

  it("Breach the Multiverse: a card chosen in each graveyard, then all put onto the battlefield together", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 7), hand: ["Breach the Multiverse"], library: ["Savannah Lions", ...lands("Swamp", 12)] },
      p2: { library: ["Bear Cub", "Llanowar Elves", ...lands("Island", 12)] },
    });
    // When p2's graveyard is chosen from, p1's choice (Savannah Lions) is still in p1's graveyard.
    let lionsZoneAtSecondChoice: string | undefined;
    s = settle(castIt(s, "p1", "Breach the Multiverse"), (req, _p, st) => {
      if (req.type !== "pick") return undefined;
      const names = namesIn(st, req.options);
      if (names.includes("Bear Cub")) {
        const lions = st.players.p1?.graveyard.find((id) => nameOf(st, id) === "Savannah Lions");
        lionsZoneAtSecondChoice = lions ? st.objects[lions]?.zone : "gone";
        return req.options.filter((id) => nameOf(st, id) === "Llanowar Elves");
      }
      return undefined;
    });
    expect(lionsZoneAtSecondChoice).toBe("graveyard");
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(graveyardNames(s, "p2")).toContain("Bear Cub");
  });

  it("Sphinx Ambassador: searching another player's library isn't \"searching their library\" (Wan Shi Tong doesn't trigger)", () => {
    let s = scenario({
      p1: { battlefield: ["Sphinx Ambassador"] },
      p2: { battlefield: ["Wan Shi Tong, Librarian"], library: ["Island", "Bear Cub", "Swamp"] },
    });
    const wan = idOf(s, "p2", "battlefield", "Wan Shi Tong, Librarian");
    let intent: string | undefined;
    s = attackWithIt(s, "Sphinx Ambassador", (req, _p, st) => {
      if (req.type === "pick" && req.intent === "search") {
        intent = req.intent;
        return req.options.filter((id) => nameOf(st, id) === "Bear Cub");
      }
      return req.type === "name" ? ["Island"] : req.type === "yesNo" ? [1] : undefined;
    });
    expect(intent).toBe("search");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[wan]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players.p2?.hand).toHaveLength(0);
  });

  it("Sphinx of the Second Sun: every postcombat main phase, also the one after an additional combat (505.1a)", () => {
    const s = scenario({
      p1: {
        battlefield: ["Sphinx of the Second Sun", "Bear Cub", ...lands("Mountain", 4)],
        hand: ["Seize the Day"],
        library: lands("Island", 10),
      },
      step: "main1",
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    // Seize the Day in the first main phase: an additional combat and main phase, then the turn's own combat and main.
    const cast = settle(castIt(s, "p1", "Seize the Day", { targets: { t: [cub] } }));
    const { steps } = stepTrail(cast, (x) => x.turn.active !== "p1");
    expect(steps.slice(0, steps.indexOf("cleanup") + 1)).toEqual([
      ...["beginCombat", "declareAttackers", "endCombat", "main2", "untap", "upkeep", "draw"],
      ...["beginCombat", "declareAttackers", "endCombat", "main2", "untap", "upkeep", "draw"],
      ...["end", "cleanup"],
    ]);
  });
});
