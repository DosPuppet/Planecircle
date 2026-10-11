/**
 * Marvel's Spider-Man (partial set: cards of the meta decks): each implemented card is checked against its
 * Oracle (plan R, lot R7). Web-slinging (Spider-Sense), Mind Swap (Superior Spider-Man), Hydro-Man, Sandman, Carnage,
 * Aunt May, Spider Manifestation, Interdimensional Web Watch, Multiversal Passage and Spider-Rex.
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import type { ActionOption, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  cast,
  castable,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  passAccepting,
  picking,
  scenario,
  settle,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

describe("Marvel's Spider-Man", () => {
  describe("Hydro-Man, Fluid Felon", () => {
    it("a blue spell gives it +1/+1 until end of turn, not a red spell", () => {
      let s = scenario({
        p1: { battlefield: ["Hydro-Man, Fluid Felon", "Island", "Mountain"], hand: ["Opt", "Burst Lightning"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
      s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(pt(s, hydro)).toEqual([2, 2]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, hydro)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, hydro).types).toEqual(["Land"]);
    });

    it("at your end step, it untaps and becomes a land that produces {U} until your next turn", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Hydro-Man, Fluid Felon", tapped: true }] } });
      const hydro = idOf(s, "p1", "battlefield", "Hydro-Man, Fluid Felon");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[hydro]?.tapped).toBe(false);
      expect(chars(s, hydro).types).toEqual(["Land"]);
      expect(chars(s, hydro).subtypes).toEqual([]);
      // The opponent passes: you get priority during their turn.
      s = act(s, "p2", { type: "pass" });
      const mana = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === hydro);
      expect(mana.flatMap((a) => (a.type === "tapForMana" ? a.colors : []))).toEqual(["U"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(chars(s, hydro).types).toEqual(["Creature"]);
    });
  });

  describe("Sandman, Shifting Scoundrel", () => {
    it("its power and toughness are equal to the number of lands you control", () => {
      let s = scenario({ p1: { battlefield: ["Sandman, Shifting Scoundrel", ...lands("Forest", 3)], hand: ["Forest"] } });
      const sandman = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
      expect(pt(s, sandman)).toEqual([3, 3]);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      expect(pt(s, sandman)).toEqual([4, 4]);
    });

    it("can't be blocked by a creature with power 2 or less", () => {
      let s = scenario({
        p1: { battlefield: ["Sandman, Shifting Scoundrel", ...lands("Forest", 3)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const sandman = idOf(s, "p1", "battlefield", "Sandman, Shifting Scoundrel");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sandman, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: sandman }] })).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: sandman }] })).not.toThrow();
    });
  });

  describe("Superior Spider-Man", () => {
    it("Mind Swap: copy of a creature card in your graveyard (abilities included), 4/4, exiled afterwards", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Swamp", 2)],
          hand: ["Superior Spider-Man"],
          graveyard: ["Doctor Doom"],
        },
      });
      const doom = idOf(s, "p1", "graveyard", "Doctor Doom");
      s = settle(cast(s, "p1", "Superior Spider-Man"), picking([doom]));
      const spidey = s.battlefield.find((id) => chars(s, id).name === "Superior Spider-Man") as string;
      const c = chars(s, spidey);
      expect(pt(s, spidey)).toEqual([4, 4]);
      expect(c.supertypes).toContain("Legendary");
      expect(c.subtypes).toEqual(expect.arrayContaining(["Scientist", "Villain", "Spider", "Human", "Hero"]));
      // Doctor Doom's enter ability triggers: two Doombots.
      expect(idsOf(s, "p1", "battlefield", "Doombot")).toHaveLength(2);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Doctor Doom");
    });

    it('Mind Swap: "when you do, exile that card" is a reflexive ability, which can be responded to (PLAN-D, D3)', () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Swamp", 2)],
          hand: ["Superior Spider-Man"],
          graveyard: ["Bear Cub"],
        },
      });
      const cub = idOf(s, "p1", "graveyard", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Superior Spider-Man") });
      // The spell resolves (copy chosen); the reflexive ability waits on the stack, the card is still in the graveyard.
      s = passAccepting(s, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority");
      expect(s.stack[0]?.kind).toBe("ability");
      expect(s.players.p1?.graveyard).toContain(cub);
      s = settle(s);
      expect(s.players.p1?.graveyard).not.toContain(cub);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Bear Cub");
    });

    it("with no creature card in the graveyards, it enters as a 4/4 with no abilities", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Superior Spider-Man"] } });
      s = settle(cast(s, "p1", "Superior Spider-Man"));
      const spidey = idOf(s, "p1", "battlefield", "Superior Spider-Man");
      expect(pt(s, spidey)).toEqual([4, 4]);
      expect(chars(s, spidey).subtypes).toEqual(expect.arrayContaining(["Spider", "Human", "Hero"]));
    });
  });

  it("Multiversal Passage: without paying 2 life, it enters tapped; it has the chosen type", () => {
    let s = scenario({ p1: { hand: ["Multiversal Passage"] } });
    s = act(s, "p1", {
      type: "playLand",
      card: idOf(s, "p1", "hand", "Multiversal Passage"),
      payLife: false,
      landType: "Forest",
    });
    const passage = idOf(s, "p1", "battlefield", "Multiversal Passage");
    expect(s.objects[passage]?.tapped).toBe(true);
    expect(s.players.p1?.life).toBe(20);
    expect(chars(s, passage).subtypes).toEqual(["Forest"]);
  });

  it("Aunt May: 1 life for each other creature that entered under your control; a Spider gets a +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: ["Aunt May", ...lands("Forest", 4)], hand: ["Spider Manifestation", "Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Spider Manifestation"));
    expect(s.players.p1?.life).toBe(21);
    const spider = idOf(s, "p1", "battlefield", "Spider Manifestation");
    expect(s.objects[spider]?.counters["+1/+1"]).toBe(1);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(s.players.p1?.life).toBe(22);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    // An opposing creature doesn't count.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Aunt May"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(t.players.p1?.life).toBe(20);
  });

  describe("Carnage, Crimson Chaos", () => {
    const setup = () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Carnage, Crimson Chaos"],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      let options: string[] = [];
      s = settle(cast(s, "p1", "Carnage, Crimson Chaos"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        options = req.options.map(String);
        return [bear];
      });
      return { s, options, angel };
    };

    it("returns a creature card with mana value 3 or less from your graveyard (not more)", () => {
      const { s, options, angel } = setup();
      expect(options).not.toContain(angel);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Carnage, Crimson Chaos")).keywords).toContain("trample");
    });

    it("the returned creature attacks each combat and is sacrificed after damaging a player", () => {
      let { s } = setup();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow();
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  it("Spider Manifestation: {T} gives {R} or {G}; a spell with mana value 4 or more untaps it, not a cheaper spell", () => {
    let s = scenario({
      p1: { battlefield: ["Spider Manifestation", ...lands("Mountain", 6)], hand: ["Burst Lightning", "Shivan Dragon"] },
    });
    const spider = idOf(s, "p1", "battlefield", "Spider Manifestation");
    expect(chars(s, spider).keywords).toContain("reach");
    const tapSpider = (x: S) => {
      const a = legalActions(x, "p1").find((o) => o.type === "tapForMana" && o.source === spider);
      expect(a?.type === "tapForMana" ? [...a.colors].sort() : []).toEqual(["G", "R"]);
      return act(x, "p1", { type: "tapForMana", source: spider, ability: a?.type === "tapForMana" ? a.ability : -1, color: "R" });
    };
    s = tapSpider(s);
    s = settle(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
    expect(s.objects[spider]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    s = tapSpider(s);
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(s.objects[spider]?.tapped).toBe(false);
  });

  it("Interdimensional Web Watch: the top two cards exiled are playable; its mana only pays for spells from exile", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 4),
        hand: ["Interdimensional Web Watch", "Opt"],
        library: ["Bear Cub", "Forest", "Plains"],
      },
    });
    s = settle(cast(s, "p1", "Interdimensional Web Watch"));
    const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(bear).toBeDefined();
    expect(forest).toBeDefined();
    // Opt ({U}) from hand: the Watch's mana can't be used.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Opt"))).toBe(false);
    expect(castable(s, "p1", bear)).toBe(true);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: bear }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Interdimensional Web Watch: its mana doesn't pay for a spell cast from a graveyard (only from exile)", () => {
    const setup = (islands: number) =>
      scenario({ p1: { battlefield: ["Interdimensional Web Watch", ...lands("Island", islands)], graveyard: ["Think Twice"] } });
    const s = setup(1);
    // Flashback {2}{U}: the Watch's two mana can't be spent from the graveyard.
    expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Think Twice"))).toBe(false);
    const t = setup(3);
    expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Think Twice"))).toBe(true);
  });

  describe("Spider-Sense", () => {
    const setup = (p1Battlefield: (string | { name: string; tapped: boolean })[], spell: string) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: p1Battlefield, hand: ["Spider-Sense"] },
        p2: { battlefield: lands("Mountain", 5), hand: [spell] },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", spell),
        ...(spell === "Burst Lightning" ? { targets: { t: ["p1"] } } : {}),
      });
      return act(s, "p2", { type: "pass" });
    };

    it("counters an instant or sorcery; a creature spell is not a legal target", () => {
      let s = setup(lands("Island", 2), "Burst Lightning");
      s = settle(cast(s, "p1", "Spider-Sense", { targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
      const t = setup(lands("Island", 2), "Fire Elemental");
      expect(() => cast(t, "p1", "Spider-Sense", { targets: { t: [t.stack[0]?.id as string] } })).toThrow();
    });

    it("Web-slinging {U}: cast for {U} by returning a tapped creature you control to hand", () => {
      let s = setup(["Island", { name: "Bear Cub", tapped: true }], "Burst Lightning");
      s = settle(cast(s, "p1", "Spider-Sense", { alternative: true, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      // Without a tapped creature, no web-slinging.
      const t = setup(["Island", "Bear Cub"], "Burst Lightning");
      expect(() => cast(t, "p1", "Spider-Sense", { alternative: true, targets: { t: [t.stack[0]?.id as string] } })).toThrow();
    });
  });

  it("Spider-Rex: reach, trample; ward {2} counters an opposing spell that targets it unless paid", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Spider-Rex, Daring Dino"] },
      p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
    });
    const rex = idOf(s, "p1", "battlefield", "Spider-Rex, Daring Dino");
    expect(chars(s, rex).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
    s = settle(cast(s, "p2", "Burst Lightning", { targets: { t: [rex] } }));
    expect(s.objects[rex]?.damage ?? 0).toBe(0);
    expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
  });
});

describe("lot A, blanc", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  /** Chooses the mode of a modal triggered ability, then the wanted objects. */
  const modeThen =
    (index: number, want: string[] = []): Answer =>
    (req, player, cur) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : picking(want)(req, player, cur);
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  /** p1's Lightning Strike on the target. */
  const strike = (s: S, t: string) => settle(cast(s, "p1", "Lightning Strike", { targets: { t: [t] } }));

  describe("Marvel's Spider-Man, lot A — blanc", () => {
    describe("Anti-Venom, Horrifying Healer", () => {
      it("cast, it returns a creature card from your graveyard to the battlefield", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 5), hand: ["Anti-Venom, Horrifying Healer"], graveyard: ["Serra Angel"] },
        });
        const angel = idOf(s, "p1", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Anti-Venom, Horrifying Healer"), picking([angel]));
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(0);
      });

      it("put onto the battlefield without being cast, it returns nothing", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Plains", 5),
            hand: ["Anti-Venom, Horrifying Healer"],
            graveyard: ["Anti-Venom, Horrifying Healer", "Bear Cub"],
          },
        });
        const other = idOf(s, "p1", "graveyard", "Anti-Venom, Horrifying Healer");
        // The first (cast) returns the second; the second (not cast) doesn't return Bear Cub.
        s = settle(cast(s, "p1", "Anti-Venom, Horrifying Healer"), picking([other]));
        // The second Anti-Venom did come back (the legend rule puts one into the graveyard, under another id).
        expect(s.players.p1?.graveyard).not.toContain(other);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      });

      it("damage that would be dealt to it is prevented, and it gets that many +1/+1 counters", () => {
        let s = scenario({
          p1: { battlefield: ["Anti-Venom, Horrifying Healer", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        const venom = idOf(s, "p1", "battlefield", "Anti-Venom, Horrifying Healer");
        s = strike(s, venom);
        expect(s.objects[venom]?.damage ?? 0).toBe(0);
        expect(counters(s, venom)).toBe(3);
        expect(pt(s, venom)).toEqual([8, 8]);
      });
    });

    it("City Pigeon: when it leaves the battlefield, create a Food", () => {
      let s = scenario({ p1: { battlefield: ["City Pigeon", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      s = strike(s, idOf(s, "p1", "battlefield", "City Pigeon"));
      expect(idsOf(s, "p1", "graveyard", "City Pigeon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    });

    describe("Costume Closet", () => {
      it("enters with two counters; {T} moves a counter onto one of your creatures", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Costume Closet"] } });
        s = settle(cast(s, "p1", "Costume Closet"));
        const closet = idOf(s, "p1", "battlefield", "Costume Closet");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(counters(s, closet)).toBe(2);
        s = settle(activate(s, "p1", closet, { targets: { t: [bear] } }));
        expect(counters(s, closet)).toBe(1);
        expect(counters(s, bear)).toBe(1);
        expect(s.objects[closet]?.tapped).toBe(true);
      });

      it("a modified creature you control that leaves gives it a counter, not an unmodified creature", () => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "Costume Closet", counters: { "+1/+1": 2 } },
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Llanowar Elves",
              ...lands("Mountain", 4),
            ],
            hand: ["Lightning Strike", "Lightning Strike"],
          },
        });
        const closet = idOf(s, "p1", "battlefield", "Costume Closet");
        s = strike(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        expect(counters(s, closet)).toBe(2);
        s = strike(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(counters(s, closet)).toBe(3);
      });
    });

    describe("Daily Bugle Reporters", () => {
      it("Puff Piece: a +1/+1 counter on each of two creatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Daily Bugle Reporters"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        s = settle(cast(s, "p1", "Daily Bugle Reporters"), modeThen(0, [bear, elves]));
        expect(counters(s, bear)).toBe(1);
        expect(counters(s, elves)).toBe(1);
      });

      it("Investigative Journalism: a creature card with mana value 2 or less from your graveyard to hand", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Daily Bugle Reporters"], graveyard: ["Serra Angel", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Daily Bugle Reporters"), (req, p, cur) => {
          if (req.type === "pick" && req.intent === "triggerMode") return ["1"];
          if (req.type === "pick") {
            // Only Bear Cub (mana value 2) is a legal target, not Serra Angel (mana value 5).
            const names = req.options.map((o) => cur.defs[cur.objects[o]?.defId ?? ""]?.name);
            expect(names).not.toContain("Serra Angel");
          }
          return picking([idOf(cur, "p1", "graveyard", "Bear Cub")])(req, p, cur);
        });
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Flash Thompson: the two modes tap a creature and untap another", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), { name: "Bear Cub", tapped: true }], hand: ["Flash Thompson, Spider-Fan"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Flash Thompson, Spider-Fan"), (req, p, cur) => {
        if (req.type === "pick" && req.intent === "triggerMode") return ["2"];
        if (req.type === "pick" && req.prompt?.includes("to tap")) return [angel];
        if (req.type === "pick" && req.prompt?.includes("to untap")) return [bear];
        return picking([])(req, p, cur);
      });
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Friendly Neighborhood: three Citizens; the enchanted land gives +1/+1 for each creature you control", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Friendly Neighborhood"] } });
      const plains = idsOf(s, "p1", "battlefield", "Plains");
      const land = plains[5] as string;
      s = settle(cast(s, "p1", "Friendly Neighborhood", { targets: { enchant: [land] } }));
      const aura = idOf(s, "p1", "battlefield", "Friendly Neighborhood");
      expect(s.objects[aura]?.attachedTo).toBe(land);
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(3);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // The enchanted land (left untapped) carries the ability.
      expect(s.objects[land]?.tapped).toBe(false);
      s = settle(activate(s, "p1", land, { targets: { t: [bear] } }, /creature you control/));
      expect(s.objects[land]?.tapped).toBe(true);
      // Four creatures: Bear Cub and three Citizens.
      expect(pt(s, bear)).toEqual([6, 6]);
    });

    it("Origin of Spider-Man: I a 2/1 Spider; II counter and legendary Spider Hero; III double strike", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Origin of Spider-Man"] } });
      s = settle(cast(s, "p1", "Origin of Spider-Man"));
      const spider = idOf(s, "p1", "battlefield", "Spider");
      expect(pt(s, spider)).toEqual([2, 1]);
      expect(chars(s, spider).keywords).toContain("reach");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3),
        picking([bear]),
      );
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).supertypes).toContain("Legendary");
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spider", "Hero"]));
      s = settle(
        advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5),
        picking([bear]),
      );
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(idsOf(s, "p1", "graveyard", "Origin of Spider-Man")).toHaveLength(1);
      // The type added in chapter II stays.
      expect(chars(s, bear).subtypes).toContain("Spider");
    });

    describe("Rent Is Due", () => {
      const endStep = (s: S, answer: Answer) =>
        settle(
          advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice"),
          answer,
        );

      it("by tapping two creatures, you draw a card and keep it", () => {
        let s = scenario({
          p1: { battlefield: ["Rent Is Due", "Bear Cub", "Llanowar Elves"], library: ["Island", "Island"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = endStep(s, picking([bear, elves]));
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.objects[elves]?.tapped).toBe(true);
        expect(idsOf(s, "p1", "battlefield", "Rent Is Due")).toHaveLength(1);
      });

      it("otherwise, it is sacrificed", () => {
        let s = scenario({
          p1: { battlefield: ["Rent Is Due", "Bear Cub", "Llanowar Elves"], library: ["Island", "Island"] },
        });
        s = endStep(s, (req) => (req.type === "pick" ? [] : undefined));
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(idsOf(s, "p1", "graveyard", "Rent Is Due")).toHaveLength(1);
      });

      it("with only one untapped creature, it is sacrificed", () => {
        let s = scenario({ p1: { battlefield: ["Rent Is Due", "Bear Cub"], library: ["Island"] } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(idsOf(s, "p1", "graveyard", "Rent Is Due")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
      });
    });

    describe("Selfless Police Captain", () => {
      it("enters with a +1/+1 counter", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Selfless Police Captain"] } });
        s = settle(cast(s, "p1", "Selfless Police Captain"));
        expect(pt(s, idOf(s, "p1", "battlefield", "Selfless Police Captain"))).toEqual([2, 2]);
      });

      it("when it leaves, its +1/+1 counters go onto a creature you control", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Selfless Police Captain", counters: { "+1/+1": 2 } }, "Bear Cub", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = strike(s, idOf(s, "p1", "battlefield", "Selfless Police Captain"));
        expect(idsOf(s, "p1", "graveyard", "Selfless Police Captain")).toHaveLength(1);
        expect(counters(s, bear)).toBe(2);
      });
    });

    describe("Silver Sable, Mercenary Leader", () => {
      it("on entering, a +1/+1 counter on another creature", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Silver Sable, Mercenary Leader"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Silver Sable, Mercenary Leader"), picking([bear]));
        expect(counters(s, bear)).toBe(1);
        expect(counters(s, idOf(s, "p1", "battlefield", "Silver Sable, Mercenary Leader"))).toBe(0);
      });

      it("when it attacks, a modified creature you control gains lifelink", () => {
        let s = scenario({
          p1: {
            battlefield: ["Silver Sable, Mercenary Leader", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"],
          },
        });
        const sable = idOf(s, "p1", "battlefield", "Silver Sable, Mercenary Leader");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: sable, defender: "p2" }] });
        let options: string[] = [];
        s = settle(s, (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [bear];
        });
        // The Elves (unmodified) are not a legal target.
        expect(options).not.toContain(elves);
        expect(chars(s, bear).keywords).toContain("lifelink");
      });
    });

    describe("Spectacular Spider-Man", () => {
      it("{1}: it gains flying until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Spectacular Spider-Man", "Plains"] } });
        const spidey = idOf(s, "p1", "battlefield", "Spectacular Spider-Man");
        s = settle(activate(s, "p1", spidey, {}, /flying/));
        expect(chars(s, spidey).keywords).toContain("flying");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, spidey).keywords).not.toContain("flying");
      });

      it("{1}, sacrifice it: your creatures gain hexproof and indestructible", () => {
        let s = scenario({
          p1: { battlefield: ["Spectacular Spider-Man", "Plains", "Bear Cub"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const spidey = idOf(s, "p1", "battlefield", "Spectacular Spider-Man");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        s = settle(activate(s, "p1", spidey, {}, /hexproof/));
        expect(idsOf(s, "p1", "graveyard", "Spectacular Spider-Man")).toHaveLength(1);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
        expect(chars(s, elves).keywords).not.toContain("indestructible");
      });
    });

    describe("Spectacular Tactics", () => {
      it("a +1/+1 counter and hexproof for one of your creatures", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Spectacular Tactics"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Spectacular Tactics", { mode: 0, targets: { t: [bear] } }));
        expect(counters(s, bear)).toBe(1);
        expect(chars(s, bear).keywords).toContain("hexproof");
      });

      it("destroys a creature with power 4 or more, not a smaller one", () => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Spectacular Tactics"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Spectacular Tactics", { mode: 1, targets: { d: [bear] } })).toThrow();
        s = settle(
          cast(s, "p1", "Spectacular Tactics", { mode: 1, targets: { d: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    describe("Spider-UK", () => {
      it("Web-slinging {2}{W}: cast by returning a tapped creature to hand", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 3), { name: "Bear Cub", tapped: true }], hand: ["Spider-UK"] },
        });
        s = settle(cast(s, "p1", "Spider-UK", { alternative: true }));
        expect(idsOf(s, "p1", "battlefield", "Spider-UK")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      });

      it("at your end step, if two creatures entered under your control, draw and gain 2 life", () => {
        let s = scenario({
          p1: {
            battlefield: ["Spider-UK", ...lands("Forest", 2)],
            hand: ["Llanowar Elves", "Llanowar Elves"],
            library: ["Island"],
          },
        });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.life).toBe(22);
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("a single creature entered: nothing", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-UK", "Forest"], hand: ["Llanowar Elves"], library: ["Island"] },
        });
        s = settle(cast(s, "p1", "Llanowar Elves"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.life).toBe(20);
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Starling: another creature you control gains flying until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Starling, Aerial Ally"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Starling, Aerial Ally"), picking([bear]));
      expect(chars(s, bear).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    it("Sudden Strike: destroys an attacking creature; a creature outside combat is not a legal target", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Sudden Strike"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        active: "p2",
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(() => cast(s, "p1", "Sudden Strike", { targets: { t: [elves] } })).toThrow();
      s = settle(cast(s, "p1", "Sudden Strike", { targets: { t: [bear] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    describe("Thwip!", () => {
      it("+2/+2 and flying; on a Spider, you gain 2 life", () => {
        let s = scenario({ p1: { battlefield: ["Plains", "Spider-Man, Web-Slinger"], hand: ["Thwip!"] } });
        const spidey = idOf(s, "p1", "battlefield", "Spider-Man, Web-Slinger");
        s = settle(cast(s, "p1", "Thwip!", { targets: { t: [spidey] } }));
        expect(pt(s, spidey)).toEqual([5, 5]);
        expect(chars(s, spidey).keywords).toContain("flying");
        expect(s.players.p1?.life).toBe(22);
      });

      it("on a creature that isn't a Spider, no life", () => {
        let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Thwip!"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Thwip!", { targets: { t: [bear] } }));
        expect(pt(s, bear)).toEqual([4, 4]);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Web Up: exiles an opposing nonland permanent until it leaves the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Web Up"] },
        p2: { battlefield: ["Serra Angel", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Web Up"), picking([angel]));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Serra Angel");
      destroy(s, idOf(s, "p1", "battlefield", "Web Up"));
      s = settle(s);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Web-Shooters: +1/+1 and reach; when the equipped creature attacks, tap an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Web-Shooters", "Bear Cub", ...lands("Plains", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const shooters = idOf(s, "p1", "battlefield", "Web-Shooters");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", shooters, { targets: { t: [bear] } }, /Equip/));
      expect(s.objects[shooters]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("reach");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = settle(s, picking([angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Wild Pack Squad: at the beginning of your combat, a creature gains first strike and vigilance", () => {
      let s = scenario({ p1: { battlefield: ["Wild Pack Squad", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
      s = settle(s, picking([bear]));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "vigilance"]));
    });
  });
});

describe("lot A, bleu", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Declares the attackers (toward p2), then advances to the second main phase (no blocks). */
  const attackAndFinish = (s: S, attackers: string[], answer: Answer = () => undefined): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** The opponent (active) casts Burst Lightning on p1 and passes: p1 can respond. */
  const opponentBolt = (p1: { battlefield: string[]; hand: string[] }, p2Battlefield: string[] = []) => {
    let s = scenario({
      active: "p2",
      p1,
      p2: { battlefield: ["Mountain", ...p2Battlefield], hand: ["Burst Lightning"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
    return act(s, "p2", { type: "pass" });
  };

  describe("Marvel's Spider-Man, lot A — bleu", () => {
    describe("Amazing Acrobatics", () => {
      it("both modes: counters the spell and taps two creatures", () => {
        let s = opponentBolt({ battlefield: lands("Island", 3), hand: ["Amazing Acrobatics"] }, ["Bear Cub", "Serra Angel"]);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(
          cast(s, "p1", "Amazing Acrobatics", { mode: 2, targets: { s: [s.stack[0]?.id as string], c: [bear, angel] } }),
        );
        expect(s.players.p1?.life).toBe(20);
        expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.objects[angel]?.tapped).toBe(true);
      });

      it("a single mode: taps a creature, the spell resolves", () => {
        let s = opponentBolt({ battlefield: lands("Island", 3), hand: ["Amazing Acrobatics"] }, ["Bear Cub"]);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Amazing Acrobatics", { mode: 1, targets: { c: [bear] } }));
        expect(s.objects[bear]?.tapped).toBe(true);
        expect(s.players.p1?.life).toBe(18);
      });
    });

    it("Beetle, Legacy Criminal: exiled from the graveyard, +1/+1 counter and flying until end of turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], graveyard: ["Beetle, Legacy Criminal"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const beetle = idOf(s, "p1", "graveyard", "Beetle, Legacy Criminal");
      s = settle(activate(s, "p1", beetle, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(idsOf(s, "p1", "graveyard", "Beetle, Legacy Criminal")).toHaveLength(0);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Beetle, Legacy Criminal");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("flying");
    });

    describe("Doc Ock, Sinister Scientist", () => {
      it("base P/T 8/8 with eight or more cards in your graveyard (counters add to it)", () => {
        const s7 = scenario({ p1: { battlefield: ["Doc Ock, Sinister Scientist"], graveyard: lands("Island", 7) } });
        expect(pt(s7, idOf(s7, "p1", "battlefield", "Doc Ock, Sinister Scientist"))).toEqual([4, 5]);
        const s8 = scenario({
          p1: {
            battlefield: [{ name: "Doc Ock, Sinister Scientist", counters: { "+1/+1": 1 } }],
            graveyard: lands("Island", 8),
          },
        });
        expect(pt(s8, idOf(s8, "p1", "battlefield", "Doc Ock, Sinister Scientist"))).toEqual([9, 9]);
      });

      it("hexproof as long as you control another Villain", () => {
        const alone = scenario({ p1: { battlefield: ["Doc Ock, Sinister Scientist", "Bear Cub"] } });
        expect(chars(alone, idOf(alone, "p1", "battlefield", "Doc Ock, Sinister Scientist")).keywords).not.toContain("hexproof");
        const s = scenario({
          p1: { battlefield: ["Doc Ock, Sinister Scientist", "Mysterio's Phantasm"] },
          p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
          active: "p2",
        });
        const ock = idOf(s, "p1", "battlefield", "Doc Ock, Sinister Scientist");
        expect(chars(s, ock).keywords).toContain("hexproof");
        expect(() => cast(s, "p2", "Burst Lightning", { targets: { t: [ock] } })).toThrow();
      });
    });

    it("Doc Ock's Henchmen: plots when attacking (nonland card discarded: +1/+1 counter)", () => {
      let s = scenario({ p1: { battlefield: ["Doc Ock's Henchmen"], hand: ["Opt"] } });
      const henchmen = idOf(s, "p1", "battlefield", "Doc Ock's Henchmen");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = attackAndFinish(s, [henchmen], picking([opt]));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
      expect(s.objects[henchmen]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Flying Octobot: a +1/+1 counter when another Villain enters, once each turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Flying Octobot", ...lands("Island", 4), ...lands("Forest", 2)],
          hand: ["Mysterio's Phantasm", "Mysterio's Phantasm", "Bear Cub"],
        },
      });
      const octobot = idOf(s, "p1", "battlefield", "Flying Octobot");
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[octobot]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Mysterio's Phantasm"));
      expect(s.objects[octobot]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Mysterio's Phantasm"));
      expect(s.objects[octobot]?.counters["+1/+1"]).toBe(1);
    });

    describe("Hide on the Ceiling", () => {
      it("exiles X artifacts or creatures, which return under their owner's control at the next end step", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Hide on the Ceiling"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Hide on the Ceiling", { x: 2, targets: { t: [bear, angel] } }));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
        s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("exactly X targets", () => {
        const s = scenario({
          p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Hide on the Ceiling"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Hide on the Ceiling", { x: 1, targets: { t: [bear, angel] } })).toThrow();
      });
    });

    it("Impostor Syndrome: a nontoken creature that damages a player creates a nonlegendary token copy", () => {
      let s = scenario({ p1: { battlefield: ["Impostor Syndrome", "Beetle, Legacy Criminal"] } });
      const beetle = idOf(s, "p1", "battlefield", "Beetle, Legacy Criminal");
      s = attackAndFinish(s, [beetle]);
      const beetles = idsOf(s, "p1", "battlefield", "Beetle, Legacy Criminal");
      expect(beetles).toHaveLength(2);
      const token = beetles.find((id) => s.objects[id]?.isToken) as string;
      expect(token).toBeDefined();
      expect(chars(s, token).supertypes).not.toContain("Legendary");
      expect(chars(s, beetle).supertypes).toContain("Legendary");
      // The token that damages a player isn't copied.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
      s = attackAndFinish(s, [token]);
      expect(idsOf(s, "p1", "battlefield", "Beetle, Legacy Criminal")).toHaveLength(2);
    });

    describe("Lady Octopus, Inspired Inventor", () => {
      it("an ingenuity counter for the first and second cards drawn each turn, not the third", () => {
        let s = scenario({
          p1: { battlefield: ["Lady Octopus, Inspired Inventor", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"] },
        });
        const lady = idOf(s, "p1", "battlefield", "Lady Octopus, Inspired Inventor");
        for (let i = 0; i < 3; i++) s = settle(cast(s, "p1", "Opt"));
        expect(s.objects[lady]?.counters.ingenuity).toBe(2);
      });

      it("{T}: cast for free an artifact spell with mana value at most equal to the number of counters", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Lady Octopus, Inspired Inventor", counters: { ingenuity: 1 } }],
            hand: ["Expedition Map", "Swiftfoot Boots"],
          },
        });
        const lady = idOf(s, "p1", "battlefield", "Lady Octopus, Inspired Inventor");
        s = untilCastNow(activate(s, "p1", lady));
        const offered = castNowOf(s)?.cards ?? [];
        expect(offered.map((id) => nameOf(s, id))).toEqual(["Expedition Map"]);
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, free: true }));
        expect(idsOf(s, "p1", "battlefield", "Expedition Map")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Swiftfoot Boots")).toHaveLength(1);
      });
    });

    describe("Madame Web, Clairvoyant", () => {
      it("casts noncreature and Spider spells from the top of the library, not other creatures", () => {
        const top = (card: string) =>
          scenario({ p1: { battlefield: ["Madame Web, Clairvoyant", ...lands("Island", 4)], library: [card, "Island"] } });
        const opt = top("Opt");
        expect(castable(opt, "p1", opt.players.p1?.library[0] as string)).toBe(true);
        const spider = top("Spider-Byte, Web Warden");
        expect(castable(spider, "p1", spider.players.p1?.library[0] as string)).toBe(true);
        const bear = top("Bear Cub");
        expect(castable(bear, "p1", bear.players.p1?.library[0] as string)).toBe(false);
      });

      it("you attack: you may mill a card", () => {
        let s = scenario({ p1: { battlefield: ["Madame Web, Clairvoyant"], library: ["Opt", "Island"] } });
        s = attackAndFinish(s, [idOf(s, "p1", "battlefield", "Madame Web, Clairvoyant")], (req) =>
          req.type === "yesNo" ? [1] : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      });
    });

    it("Mysterio, Master of Illusion: a 3/3 Illusion for each nontoken Villain, exiled when it leaves", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 4), ...lands("Mountain", 2), "Doc Ock's Henchmen", "Bear Cub"],
          hand: ["Mysterio, Master of Illusion", "Lightning Strike"],
        },
      });
      s = settle(cast(s, "p1", "Mysterio, Master of Illusion"));
      const illusions = idsOf(s, "p1", "battlefield", "Illusion Villain");
      expect(illusions).toHaveLength(2);
      expect(pt(s, illusions[0] as string)).toEqual([3, 3]);
      const mysterio = idOf(s, "p1", "battlefield", "Mysterio, Master of Illusion");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [mysterio] } }));
      expect(idsOf(s, "p1", "graveyard", "Mysterio, Master of Illusion")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Illusion Villain")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Doc Ock's Henchmen")).toHaveLength(1);
    });

    it("Mysterio, Master of Illusion (official ruling): gone before the tokens are created, they are never exiled", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 4), ...lands("Mountain", 2), "Doc Ock's Henchmen"],
          hand: ["Mysterio, Master of Illusion", "Lightning Strike"],
        },
      });
      s = cast(s, "p1", "Mysterio, Master of Illusion");
      // Mysterio is on the battlefield, its enter ability on the stack: we kill it in response.
      s = passAccepting(
        s,
        (x) =>
          x.stack.length > 0 &&
          idsOf(x, "p1", "battlefield", "Mysterio, Master of Illusion").length === 1 &&
          x.pending?.kind === "priority" &&
          x.pending.player === "p1",
      );
      const mysterio = idOf(s, "p1", "battlefield", "Mysterio, Master of Illusion");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [mysterio] } }));
      expect(idsOf(s, "p1", "graveyard", "Mysterio, Master of Illusion")).toHaveLength(1);
      // A single nontoken Villain on resolution (the Henchmen): one Illusion, which stays.
      expect(idsOf(s, "p1", "battlefield", "Illusion Villain")).toHaveLength(1);
    });

    it("Mysterio's Phantasm: mills a card when attacking", () => {
      let s = scenario({ p1: { battlefield: ["Mysterio's Phantasm"], library: ["Opt", "Island"] } });
      s = attackAndFinish(s, [idOf(s, "p1", "battlefield", "Mysterio's Phantasm")]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(19);
    });

    it("Robotics Mastery: two 1/1 flying Robots on entering, the enchanted creature gets +2/+2", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Robotics Mastery"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Robotics Mastery", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      const robots = idsOf(s, "p1", "battlefield", "Robot");
      expect(robots).toHaveLength(2);
      expect(chars(s, robots[0] as string).keywords).toContain("flying");
      expect(chars(s, robots[0] as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    });

    describe("School Daze", () => {
      it("Do Homework: draw three cards", () => {
        let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["School Daze"] } });
        s = settle(cast(s, "p1", "School Daze", { mode: 0 }));
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("Fight Crime: counter a spell, draw a card", () => {
        let s = opponentBolt({ battlefield: lands("Island", 5), hand: ["School Daze"] });
        s = settle(cast(s, "p1", "School Daze", { mode: 1, targets: { t: [s.stack[0]?.id as string] } }));
        expect(s.players.p1?.life).toBe(20);
        expect(idsOf(s, "p2", "graveyard", "Burst Lightning")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Secret Identity", () => {
      it("Conceal: base 1/1 Citizen with hexproof until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Island", "Serra Angel"], hand: ["Secret Identity"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Secret Identity", { mode: 0, targets: { t: [angel] } }));
        expect(pt(s, angel)).toEqual([1, 1]);
        expect(chars(s, angel).subtypes).toEqual(["Citizen"]);
        expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["hexproof", "flying", "vigilance"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, angel)).toEqual([4, 4]);
        expect(chars(s, angel).subtypes).toEqual(["Angel"]);
      });

      it("Reveal: base 3/4 Hero with flying and vigilance", () => {
        let s = scenario({ p1: { battlefield: ["Island", "Bear Cub"], hand: ["Secret Identity"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Secret Identity", { mode: 1, targets: { t: [bear] } }));
        expect(pt(s, bear)).toEqual([3, 4]);
        expect(chars(s, bear).subtypes).toEqual(["Hero"]);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      });

      it("only targets a creature you control", () => {
        const s = scenario({ p1: { battlefield: ["Island"], hand: ["Secret Identity"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Secret Identity", { mode: 1, targets: { t: [bear] } })).toThrow();
      });
    });

    it("Spider-Byte, Web Warden: on entering, returns up to one nonland permanent to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Spider-Byte, Web Warden"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spider-Byte, Web Warden"), picking([angel]));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    });

    it("Spider-Man No More: base 1/1 Citizen with defender, without its other abilities", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Spider-Man No More"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Spider-Man No More", { targets: { enchant: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
      expect(chars(s, angel).subtypes).toEqual(["Citizen"]);
      expect(chars(s, angel).keywords).toEqual(["defender"]);
    });

    it("Unstable Experiment: the targeted player draws, then your creature plots", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Unstable Experiment", "Opt"] },
        p2: { library: ["Island", "Island"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Unstable Experiment", { targets: { p: ["p2"], c: [bear] } }), picking([opt]));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    describe("Whoosh!", () => {
      it("returns a nonland permanent to hand; kicked, also draw a card", () => {
        const setup = () =>
          scenario({ p1: { battlefield: lands("Island", 4), hand: ["Whoosh!"] }, p2: { battlefield: ["Serra Angel"] } });
        let s = setup();
        s = settle(cast(s, "p1", "Whoosh!", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(0);
        let k = setup();
        k = settle(cast(k, "p1", "Whoosh!", { kicked: true, targets: { t: [idOf(k, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(k, "p2", "hand", "Serra Angel")).toHaveLength(1);
        expect(k.players.p1?.hand).toHaveLength(1);
      });
    });
  });
});

describe("lot A, noir", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  /** Advances (without attacking) to the condition, answering the choices. */
  const advanceAnswering = (s: S, until: (x: S) => boolean, answer: Answer): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else cur = advanceUntil(cur, (x) => until(x) || x.pending?.kind === "choice", 1);
    }
    return cur;
  };
  /** Scry: all the cards looked at go to the graveyard. */
  const surveilAll: Answer = (req) => (req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined);
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const attackWith = (s: S, ids: string[]) => {
    const at = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(at, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
  };
  const graveyardIds = (s: S, player: string) => s.players[player]?.graveyard ?? [];

  const EDDIE = "Eddie Brock // Venom, Lethal Protector";
  const SAGA = "The Death of Gwen Stacy";

  describe("Marvel's Spider-Man, lot A — noir", () => {
    it("Agent Venom: another of your nontoken creatures dies, draw and lose 1 life; not for an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Venom", "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(19);
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [elves] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Agent Venom: neither a token, nor Agent Venom itself", () => {
      let s = scenario({
        p1: { battlefield: ["Agent Venom", "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { isToken: boolean }).isToken = true;
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(s.objects[bear]).toBeUndefined();
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Agent Venom")] } }));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Common Crook: when it dies, create a Treasure", () => {
      let s = scenario({ p1: { battlefield: ["Common Crook", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const crook = idOf(s, "p1", "battlefield", "Common Crook");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [crook] } }));
      expect(idsOf(s, "p1", "graveyard", "Common Crook")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    describe("The Death of Gwen Stacy", () => {
      it("chapter I: destroys the targeted creature", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [SAGA] }, p2: { battlefield: ["Serra Angel"] } });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", SAGA), picking([angel]));
        expect(s.objects[idOf(s, "p1", "battlefield", SAGA)]?.counters.lore).toBe(1);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("chapter II: each player may discard a card; whoever doesn't loses 3 life", () => {
        let s = scenario({
          p1: { battlefield: [{ name: SAGA, counters: { lore: 1 } }], hand: ["Opt"] },
          p2: { hand: ["Opt"] },
        });
        const saga = idOf(s, "p1", "battlefield", SAGA);
        s = advanceAnswering(
          s,
          (x) => x.objects[saga]?.counters.lore === 2 && x.stack.length === 0 && x.pending?.kind === "priority",
          (req, player) =>
            req.type === "pick" && req.intent === "punisher" ? [player === "p1" ? "discard" : "life"] : undefined,
        );
        expect(s.players.p1?.life).toBe(20);
        expect(graveyardIds(s, "p1")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(17);
        expect(graveyardIds(s, "p2")).toHaveLength(0);
      });

      it("chapter III: exiles the graveyards of the targeted players only", () => {
        let s = scenario({
          p1: { battlefield: [{ name: SAGA, counters: { lore: 2 } }], graveyard: ["Opt", "Bear Cub"] },
          p2: { graveyard: ["Serra Angel", "Opt"] },
        });
        s = advanceAnswering(
          s,
          (x) => (x.players.p2?.graveyard.length ?? 0) === 0 && x.pending?.kind === "priority",
          picking(["p2"]),
        );
        expect(graveyardIds(s, "p2")).toHaveLength(0);
        // The Saga is sacrificed after its last chapter; p1's graveyard wasn't exiled.
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });
    });

    describe("Eddie Brock // Venom, Lethal Protector", () => {
      it("on entering, returns a creature card with mana value 1 or less from your graveyard", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [EDDIE], graveyard: ["Llanowar Elves", "Bear Cub"] } });
        s = settle(cast(s, "p1", EDDIE));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      });

      it("a card with mana value 2 can't be returned", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [EDDIE], graveyard: ["Bear Cub"] } });
        s = settle(cast(s, "p1", EDDIE));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      });

      it("{3}{B}{R}{G}: transforms into a 5/5 Venom; when attacking, sacrifices a creature with mana value X, draws X and puts a permanent with mana value X or less", () => {
        let s = scenario({
          p1: {
            battlefield: [EDDIE, "Bear Cub", ...lands("Swamp", 4), "Mountain", "Forest"],
            hand: ["Serra Angel", "Llanowar Elves"],
            library: lands("Forest", 5),
          },
        });
        const venom = idOf(s, "p1", "battlefield", EDDIE);
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", venom));
        expect(chars(s, venom).name).toBe("Venom, Lethal Protector");
        expect(pt(s, venom)).toEqual([5, 5]);
        expect(chars(s, venom).keywords).toEqual(expect.arrayContaining(["menace", "trample", "haste"]));
        s = attackWith(s, [venom]);
        let offered: string[] = [];
        s = settle(s, (req, _p, cur) => {
          if (req.type !== "pick") return undefined;
          if (req.options.includes(bear)) return [bear];
          offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
          const elves = req.options.find((o) => nameOf(cur, String(o)) === "Llanowar Elves");
          return elves ? [elves] : undefined;
        });
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        // X = 2: two cards drawn; Serra Angel (mana value 5) is not offered.
        expect(offered).not.toContain("Serra Angel");
        expect(offered).toContain("Llanowar Elves");
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("Venom: without a sacrifice, nothing happens", () => {
        let s = scenario({
          p1: { battlefield: [EDDIE, "Bear Cub", ...lands("Swamp", 4), "Mountain", "Forest"], hand: ["Llanowar Elves"] },
        });
        const venom = idOf(s, "p1", "battlefield", EDDIE);
        s = settle(activate(s, "p1", venom));
        s = settle(attackWith(s, [venom]), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Inner Demons Gangsters and mayhem", () => {
      it("discard a card: +1/+0 and menace until end of turn, as a sorcery only", () => {
        let s = scenario({ p1: { battlefield: ["Inner Demons Gangsters"], hand: ["Opt"] } });
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = settle(activate(s, "p1", gang, { discard: [opt] }));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(pt(s, gang)).toEqual([4, 4]);
        expect(chars(s, gang).keywords).toContain("menace");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, gang)).toEqual([3, 4]);
      });

      it("Swarm, Being of Bees: discarded this turn, it can be cast from the graveyard for {B}; not otherwise", () => {
        let s = scenario({
          p1: { battlefield: ["Inner Demons Gangsters", "Swamp"], hand: ["Swarm, Being of Bees"], graveyard: ["Prison Break"] },
        });
        expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Prison Break"))).toBe(false);
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        s = settle(activate(s, "p1", gang, { discard: [idOf(s, "p1", "hand", "Swarm, Being of Bees")] }));
        const swarm = idOf(s, "p1", "graveyard", "Swarm, Being of Bees");
        expect(castable(s, "p1", swarm)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: swarm }));
        expect(idsOf(s, "p1", "battlefield", "Swarm, Being of Bees")).toHaveLength(1);
      });

      it("Prison Break: returns a creature with an additional +1/+1 counter; mayhem {3}{B} after a discard", () => {
        let s = scenario({
          p1: {
            battlefield: ["Inner Demons Gangsters", ...lands("Swamp", 4)],
            hand: ["Prison Break"],
            graveyard: ["Serra Angel"],
          },
        });
        const gang = idOf(s, "p1", "battlefield", "Inner Demons Gangsters");
        s = settle(activate(s, "p1", gang, { discard: [idOf(s, "p1", "hand", "Prison Break")] }));
        const pb = idOf(s, "p1", "graveyard", "Prison Break");
        expect(castable(s, "p1", pb)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: pb, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
        expect(pt(s, angel)).toEqual([5, 5]);
      });
    });

    it("Merciless Enforcers: {3}{B}, 1 damage to each opponent", () => {
      let s = scenario({ p1: { battlefield: ["Merciless Enforcers", ...lands("Swamp", 4)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Merciless Enforcers")));
      expect(s.players.p2?.life).toBe(19);
      // Lifelink: the damage from its ability also gains you life.
      expect(s.players.p1?.life).toBe(21);
    });

    it("Morlun, Devourer of Spiders: enters with X +1/+1 counters and deals X damage to an opponent", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Morlun, Devourer of Spiders"] } });
      s = settle(cast(s, "p1", "Morlun, Devourer of Spiders", { x: 3 }));
      const morlun = idOf(s, "p1", "battlefield", "Morlun, Devourer of Spiders");
      expect(s.objects[morlun]?.counters["+1/+1"]).toBe(3);
      expect(pt(s, morlun)).toEqual([5, 4]);
      expect(s.players.p2?.life).toBe(17);
    });

    it("Parker Luck: two players reveal their top card, lose life equal to the other's mana value, then take it into hand", () => {
      let s = scenario({
        p1: { battlefield: ["Parker Luck"], library: ["Shivan Dragon", ...lands("Forest", 5)] },
        p2: { library: ["Bear Cub", ...lands("Forest", 5)] },
      });
      s = advanceUntil(s, (x) => idsOf(x, "p1", "hand", "Shivan Dragon").length > 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(18);
      expect(s.players.p2?.life).toBe(14);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Risky Research: scry 2, then draw two cards; lose 2 life", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Risky Research"], library: lands("Forest", 6) } });
      s = settle(cast(s, "p1", "Risky Research"), surveilAll);
      expect(graveyardIds(s, "p1")).toHaveLength(3);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p1?.life).toBe(18);
    });

    describe("Scorpion, Seething Striker", () => {
      it("at your end step, if a creature died this turn, one of your creatures connives", () => {
        let s = scenario({
          p1: {
            battlefield: ["Scorpion, Seething Striker", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
            library: ["Serra Angel"],
          },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const scorpion = idOf(s, "p1", "battlefield", "Scorpion, Seething Striker");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
        s = advanceUntil(s, (x) => idsOf(x, "p1", "graveyard", "Serra Angel").length > 0);
        // Draws Serra Angel, discards it (nonland): a +1/+1 counter.
        s = settle(s);
        expect(s.objects[scorpion]?.counters["+1/+1"]).toBe(1);
        expect(pt(s, scorpion)).toEqual([4, 4]);
      });

      it("with no creature dead this turn, nothing", () => {
        let s = scenario({ p1: { battlefield: ["Scorpion, Seething Striker"], library: lands("Forest", 3) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(0);
        expect(s.players.p1?.library).toHaveLength(3);
      });
    });

    it("Scorpion's Sting: -3/-3 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Scorpion's Sting"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Scorpion's Sting", { targets: { t: [angel] } }));
      expect(pt(s, angel)).toEqual([1, 1]);
    });

    describe("Spider-Man Noir", () => {
      it("a creature that attacks alone gets a +1/+1 counter, then scry X (its counters)", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Man Noir", { name: "Bear Cub", counters: { "+1/+1": 1 } }], library: lands("Forest", 6) },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(attackWith(s, [bear]), surveilAll);
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
        expect(graveyardIds(s, "p1")).toHaveLength(2);
      });

      it("no trigger if two creatures attack", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Man Noir", "Bear Cub"], library: lands("Forest", 6) } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const noir = idOf(s, "p1", "battlefield", "Spider-Man Noir");
        s = settle(attackWith(s, [bear, noir]), surveilAll);
        expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
        expect(graveyardIds(s, "p1")).toHaveLength(0);
      });
    });

    describe("The Spot's Portal", () => {
      it("puts the creature on the bottom of its owner's library; you lose 2 life without a Villain", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["The Spot's Portal"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Spot's Portal", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        const lib = s.players.p2?.library ?? [];
        expect(nameOf(s, lib[lib.length - 1] ?? "")).toBe("Serra Angel");
        expect(s.players.p1?.life).toBe(18);
      });

      it("with a Villain, no life loss", () => {
        let s = scenario({
          p1: { battlefield: ["Common Crook", ...lands("Swamp", 3)], hand: ["The Spot's Portal"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "The Spot's Portal", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Tombstone, Career Criminal: returns a Villain from the graveyard to hand; your Villain spells cost {1} less", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Tombstone, Career Criminal"], graveyard: ["Common Crook", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Tombstone, Career Criminal"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const inHand = idOf(s, "p1", "hand", "Common Crook");
      // A single untapped Swamp: Common Crook ({1}{B}) costs {B}.
      expect(castable(s, "p1", inHand)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: inHand }));
      expect(idsOf(s, "p1", "battlefield", "Common Crook")).toHaveLength(1);
    });

    it("Venom, Evil Unleashed: {2}{B}, exile it from the graveyard: two +1/+1 counters and deathtouch", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], graveyard: ["Venom, Evil Unleashed"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const venom = idOf(s, "p1", "graveyard", "Venom, Evil Unleashed");
      s = settle(activate(s, "p1", venom, { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, bear).keywords).toContain("deathtouch");
      expect(s.exile.some((id) => nameOf(s, id) === "Venom, Evil Unleashed")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("deathtouch");
    });

    it("Venomized Cat: on entering, mill two cards", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Venomized Cat"], library: lands("Forest", 5) } });
      s = settle(cast(s, "p1", "Venomized Cat"));
      expect(graveyardIds(s, "p1")).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(3);
    });

    describe("Venom's Hunger", () => {
      it("costs {2} less with a Villain; destroys the creature, you gain 2 life", () => {
        let s = scenario({
          p1: { battlefield: ["Common Crook", ...lands("Swamp", 3)], hand: ["Venom's Hunger"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Venom's Hunger", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(22);
      });

      it("without a Villain, three Swamps are not enough", () => {
        const s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Venom's Hunger"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Venom's Hunger"))).toBe(false);
      });
    });

    it("Villainous Wrath: the opponent loses life equal to the number of their creatures, then all creatures are destroyed", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Villainous Wrath"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Villainous Wrath", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(20);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
    });
  });
});

describe("lot A, rouge", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  const exiled = (s: S, name: string) => s.exile.find((id) => nameOf(s, id) === name) as string;

  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  const playable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "playLand" && a.card === card);
  /** Activated ability of `source` whose label matches (the first otherwise). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const setCounters = (s: S, id: string, kind: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
    s.version += 1;
  };
  /** Declares the attackers against p2, then advances to the second main phase. */
  const attack = (s: S, ids: string[], answer?: Answer): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    cur = settle(cur, answer);
    return advanceUntil(cur, (x) => x.turn.step === "main2");
  };

  describe("Marvel's Spider-Man, lot A — rouge", () => {
    describe("Angry Rabble", () => {
      it("a spell with mana value 4 or more: 1 damage to each opponent; not a cheaper spell", () => {
        let s = scenario({
          p1: { battlefield: ["Angry Rabble", ...lands("Plains", 5), "Mountain"], hand: ["Serra Angel", "Shock"] },
        });
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(18);
        s = settle(cast(s, "p1", "Serra Angel"));
        expect(s.players.p2?.life).toBe(17);
      });

      it("{5}{R}, as a sorcery: two +1/+1 counters", () => {
        let s = scenario({ p1: { battlefield: ["Angry Rabble", ...lands("Mountain", 6)] } });
        const rabble = idOf(s, "p1", "battlefield", "Angry Rabble");
        s = settle(activate(s, "p1", rabble));
        expect(pt(s, rabble)).toEqual([4, 4]);
      });
    });

    describe("Electro, Assaulting Battery", () => {
      it("an instant adds {R}, and unspent red mana doesn't empty between steps", () => {
        let s = scenario({ p1: { battlefield: ["Electro, Assaulting Battery", "Mountain"], hand: ["Shock"] } });
        s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
        expect(s.players.p1?.manaPool.R).toBe(1);
        s = advanceUntil(s, (x) => x.turn.step === "main2");
        expect(s.players.p1?.manaPool.R).toBe(1);
      });

      it("when it leaves the battlefield, you may pay {X}: X damage to a targeted player", () => {
        let s = scenario({
          p1: { battlefield: ["Electro, Assaulting Battery", ...lands("Mountain", 6)], hand: ["Electro's Bolt"] },
        });
        const electro = idOf(s, "p1", "battlefield", "Electro, Assaulting Battery");
        s = settle(cast(s, "p1", "Electro's Bolt", { targets: { t: [electro] } }), (req) =>
          req.type === "number" ? [2] : req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Electro, Assaulting Battery")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    describe("Electro's Bolt and Romantic Rendezvous", () => {
      it("discard a card then draw two cards; the discarded Bolt can be cast from the graveyard for {1}{R} (mayhem)", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 4), hand: ["Romantic Rendezvous", "Electro's Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bolt = idOf(s, "p1", "hand", "Electro's Bolt");
        s = settle(cast(s, "p1", "Romantic Rendezvous"), picking([bolt]));
        expect(s.players.p1?.hand).toHaveLength(2);
        const inGy = idOf(s, "p1", "graveyard", "Electro's Bolt");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(act(s, "p1", { type: "cast", card: inGy, targets: { t: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        // Two tapped lands for the {1}{R} spell, two for mayhem.
        expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
      });
    });

    describe("Gwen Stacy // Ghost-Spider", () => {
      it("Gwen Stacy: the card exiled on entering is playable as long as you control it", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Gwen Stacy // Ghost-Spider", "Shock"], library: lands("Island", 5) },
        });
        s = settle(cast(s, "p1", "Gwen Stacy // Ghost-Spider"));
        const island = exiled(s, "Island");
        expect(island).toBeDefined();
        expect(playable(s, "p1", island)).toBe(true);
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(cast(s, "p1", "Shock", { targets: { t: [gwen] } }));
        expect(idsOf(s, "p1", "graveyard", "Gwen Stacy // Ghost-Spider")).toHaveLength(1);
        expect(playable(s, "p1", island)).toBe(false);
      });

      it("transforms into Ghost-Spider; a spell cast or a land played from exile gives it a +1/+1 counter", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Mountain", 6), "Island", "Plains"],
            hand: ["Gwen Stacy // Ghost-Spider"],
            library: ["Shock", ...lands("Island", 5)],
          },
        });
        s = settle(cast(s, "p1", "Gwen Stacy // Ghost-Spider"));
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(activate(s, "p1", gwen, {}, /Transform/));
        expect(chars(s, gwen).name).toBe("Ghost-Spider");
        expect(pt(s, gwen)).toEqual([4, 4]);
        expect(chars(s, gwen).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "haste"]));
        // Gwen Stacy's permission lasts: you still control this creature.
        const shock = exiled(s, "Shock");
        expect(castable(s, "p1", shock)).toBe(true);
        s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
        expect(s.objects[gwen]?.counters["+1/+1"]).toBe(1);
        // Remove two counters: exile the top card, playable this turn (a land: one more counter).
        setCounters(s, gwen, "+1/+1", 2);
        s = settle(activate(s, "p1", gwen, {}, /top card/));
        expect(s.objects[gwen]?.counters["+1/+1"] ?? 0).toBe(0);
        const island = exiled(s, "Island");
        expect(playable(s, "p1", island)).toBe(true);
        s = settle(act(s, "p1", { type: "playLand", card: island }));
        expect(s.objects[gwen]?.counters["+1/+1"]).toBe(1);
      });

      it("Ghost-Spider: the card exiled by its ability is no longer playable on the next turn", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Mountain", 4), "Island", "Plains", "Gwen Stacy // Ghost-Spider"],
            library: lands("Island", 8),
          },
        });
        const gwen = idOf(s, "p1", "battlefield", "Gwen Stacy // Ghost-Spider");
        s = settle(activate(s, "p1", gwen, {}, /Transform/));
        setCounters(s, gwen, "+1/+1", 2);
        s = settle(activate(s, "p1", gwen, {}, /top card/));
        const island = exiled(s, "Island");
        expect(playable(s, "p1", island)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        expect(s.exile).toContain(island);
        expect(playable(s, "p1", island)).toBe(false);
      });
    });

    describe("Heroes' Hangout", () => {
      it("Romantic Rendezvous: exile two cards, only one playable, until the end of your next turn", () => {
        let s = scenario({
          p1: { battlefield: ["Mountain"], hand: ["Heroes' Hangout"], library: ["Shock", "Opt", ...lands("Forest", 6)] },
        });
        let shock = "";
        s = settle(cast(s, "p1", "Heroes' Hangout", { mode: 0 }), (req, _p, cur) => {
          shock = exiled(cur, "Shock") ?? "";
          return req.type === "pick" && req.options.includes(shock) ? [shock] : undefined;
        });
        const opt = exiled(s, "Opt");
        expect(castable(s, "p1", opt)).toBe(false);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(castable(s, "p1", shock)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(castable(s, "p1", shock)).toBe(false);
      });

      it("Patrol Night: one or two creatures get +1/+0 and first strike until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Mountain", "Bear Cub", "Llanowar Elves"], hand: ["Heroes' Hangout"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = settle(cast(s, "p1", "Heroes' Hangout", { mode: 1, targets: { t: [bear, elves] } }));
        expect(pt(s, bear)).toEqual([3, 2]);
        expect(pt(s, elves)).toEqual([2, 1]);
        expect(chars(s, bear).keywords).toContain("firstStrike");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    describe("Hobgoblin, Mantled Marauder", () => {
      it("each discarded card gives it +2/+0 until end of turn", () => {
        let s = scenario({
          p1: { battlefield: ["Hobgoblin, Mantled Marauder", ...lands("Mountain", 2)], hand: ["Romantic Rendezvous", "Opt"] },
        });
        const hob = idOf(s, "p1", "battlefield", "Hobgoblin, Mantled Marauder");
        s = settle(cast(s, "p1", "Romantic Rendezvous"));
        expect(pt(s, hob)).toEqual([3, 2]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, hob)).toEqual([1, 2]);
      });
    });

    describe("J. Jonah Jameson", () => {
      it("suspects up to one creature; one of your creatures with menace that attacks creates a Treasure", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["J. Jonah Jameson"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "J. Jonah Jameson"), picking([bear]));
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "cantBlock"]));
        s = attack(s, [bear]);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      });

      it("a creature without menace that attacks creates nothing", () => {
        let s = scenario({ p1: { battlefield: ["J. Jonah Jameson", "Bear Cub"] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    describe("Masked Meower", () => {
      it("discard a card, sacrifice it: draw a card", () => {
        let s = scenario({ p1: { battlefield: ["Masked Meower"], hand: ["Opt"] } });
        const meower = idOf(s, "p1", "battlefield", "Masked Meower");
        s = settle(activate(s, "p1", meower, { discard: [idOf(s, "p1", "hand", "Opt")] }));
        expect(idsOf(s, "p1", "graveyard", "Masked Meower")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Maximum Carnage", () => {
      it("I: until your next turn, each creature attacks if able", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Maximum Carnage"] },
          p2: { battlefield: ["Bear Cub", "Forest"], hand: ["Llanowar Elves"] },
        });
        s = settle(cast(s, "p1", "Maximum Carnage"));
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p1"]);
        // A creature that arrives afterwards is affected too (ruling; PLAN-M M8a).
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
        s = settle(cast(s, "p2", "Llanowar Elves"));
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        expect(chars(s, elves).blockRules.map((r) => r.goadedBy)).toEqual(["p1"]);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
        expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        expect(chars(s, bear).blockRules).toEqual([]);
        expect(chars(s, elves).blockRules).toEqual([]);
      });

      it("I, with three players: each creature attacks a player other than you if able", () => {
        let s = scenario({
          players: 3,
          p1: { battlefield: lands("Mountain", 5), hand: ["Maximum Carnage"] },
          p2: { battlefield: ["Bear Cub"] },
          p3: { battlefield: ["Ajani Resolute"] },
        });
        s = settle(cast(s, "p1", "Maximum Carnage"));
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
        const attackTo = (d: string) => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: d }] });
        expect(() => attackTo("p1")).toThrow();
        // A planeswalker doesn't satisfy \"a player other than you\".
        expect(() => attackTo(idOf(s, "p3", "battlefield", "Ajani Resolute"))).toThrow();
        expect(() => attackTo("p3")).not.toThrow();
      });

      it("II: add {R}{R}{R}; III: 5 damage to each opponent, then it is sacrificed", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Maximum Carnage", counters: { lore: 1 } }] },
          active: "p2",
          step: "end",
        });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(s.players.p1?.manaPool.R).toBe(3);
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
        s = settle(s);
        expect(s.players.p2?.life).toBe(15);
        expect(idsOf(s, "p1", "graveyard", "Maximum Carnage")).toHaveLength(1);
      });
    });

    describe("Molten Man, Inferno Incarnate", () => {
      it("searches for a basic Mountain (tapped), gets +1/+1 for each Mountain; when leaving, sacrifice a land", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 3),
            hand: ["Molten Man, Inferno Incarnate"],
            library: ["Forest", "Mountain", "Forest"],
          },
          p2: { battlefield: [] },
        });
        s = settle(cast(s, "p1", "Molten Man, Inferno Incarnate"));
        const molten = idOf(s, "p1", "battlefield", "Molten Man, Inferno Incarnate");
        const mountains = idsOf(s, "p1", "battlefield", "Mountain");
        expect(mountains).toHaveLength(4);
        expect(mountains.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
        expect(pt(s, molten)).toEqual([4, 4]);
        expect(s.players.p1?.library.map((id) => nameOf(s, id))).not.toContain("Mountain");
      });

      it("when it leaves the battlefield, you sacrifice a land", () => {
        // Two Mountains: 2/2; a third land to cast the Bolt.
        let s = scenario({
          p1: { battlefield: ["Molten Man, Inferno Incarnate", ...lands("Mountain", 2), "Plains"], hand: ["Electro's Bolt"] },
        });
        const molten = idOf(s, "p1", "battlefield", "Molten Man, Inferno Incarnate");
        expect(pt(s, molten)).toEqual([2, 2]);
        s = settle(cast(s, "p1", "Electro's Bolt", { targets: { t: [molten] } }));
        expect(idsOf(s, "p1", "graveyard", "Molten Man, Inferno Incarnate")).toHaveLength(1);
        expect(s.battlefield.filter((id) => chars(s, id).types.includes("Land"))).toHaveLength(2);
      });
    });

    describe("Shadow of the Goblin", () => {
      it("at the beginning of your first main phase: discard a card, then draw a card", () => {
        let s = scenario({
          p1: { battlefield: ["Shadow of the Goblin"], hand: ["Opt"] },
          active: "p2",
          step: "end",
        });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        // The discarded Opt replaced: the turn's draw and the ability's draw.
        expect(s.players.p1?.hand).toHaveLength(2);
      });

      it("with no cards in hand, nothing is drawn", () => {
        let s = scenario({ p1: { battlefield: ["Shadow of the Goblin"] }, active: "p2", step: "end" });
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw"));
        // The turn's draw, discarded by the ability: no extra card.
        s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("a spell cast from anywhere but hand: 1 damage to each opponent; not from hand", () => {
        let s = scenario({
          p1: { battlefield: ["Shadow of the Goblin", ...lands("Mountain", 6)], hand: ["Romantic Rendezvous", "Electro's Bolt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bolt = idOf(s, "p1", "hand", "Electro's Bolt");
        s = settle(cast(s, "p1", "Romantic Rendezvous"), picking([bolt]));
        expect(s.players.p2?.life).toBe(20);
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Electro's Bolt"), targets: { t: [angel] } }));
        expect(s.players.p2?.life).toBe(19);
      });
    });

    describe("Shocker, Unshakable", () => {
      it("on entering, 2 damage to a creature and 2 to its controller; first strike during your turn only", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 6), hand: ["Shocker, Unshakable"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Shocker, Unshakable"), picking([bear]));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
        const shocker = idOf(s, "p1", "battlefield", "Shocker, Unshakable");
        expect(chars(s, shocker).keywords).toContain("firstStrike");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, shocker).keywords).not.toContain("firstStrike");
      });
    });

    describe("Shock", () => {
      it("2 damage to any target", () => {
        let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Shock"] }, p2: { battlefield: ["Bear Cub"] } });
        s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      });
    });

    describe("Spider-Gwen, Free Spirit", () => {
      it("when it becomes tapped, you may discard a card to draw one", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Gwen, Free Spirit"], hand: ["Opt"] } });
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = attack(s, [gwen], picking([opt]));
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(nameOf(s, s.players.p1?.hand[0] ?? "")).toBe("Forest");
      });

      it("without a discard, no draw", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Gwen, Free Spirit"], hand: ["Opt"] } });
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        s = attack(s, [gwen], (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Spinneret and Spiderling", () => {
      it("attacking with two Spiders: a +1/+1 counter; 4 or more damage: the top card is playable", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Spinneret and Spiderling", counters: { "+1/+1": 2 } }, "Spider-Gwen, Free Spirit"],
            library: ["Shock", ...lands("Forest", 5)],
          },
        });
        const spin = idOf(s, "p1", "battlefield", "Spinneret and Spiderling");
        const gwen = idOf(s, "p1", "battlefield", "Spider-Gwen, Free Spirit");
        s = attack(s, [spin, gwen], (req) => (req.type === "pick" ? [] : undefined));
        // 1/2 with three counters: 4 damage.
        expect(s.objects[spin]?.counters["+1/+1"]).toBe(3);
        expect(s.players.p2?.life).toBe(20 - 4 - 2);
        const shock = exiled(s, "Shock");
        expect(s.exile).toContain(shock);
        // Playable until the end of your next turn (no mana here: only the permission is checked).
        expect(s.playPermissions?.some((p) => p.card === shock && p.player === "p1" && p.until > s.turn.number)).toBe(true);
      });

      it("less than 4 damage: nothing is exiled; a single attacking Spider: no counter", () => {
        let s = scenario({ p1: { battlefield: ["Spinneret and Spiderling"], library: lands("Forest", 5) } });
        const spin = idOf(s, "p1", "battlefield", "Spinneret and Spiderling");
        s = attack(s, [spin]);
        expect(s.objects[spin]?.counters["+1/+1"] ?? 0).toBe(0);
        expect(s.exile).toHaveLength(0);
      });

      it("4 damage divided 2 + 2 between two blockers at the same time: the damage is added up, it triggers once (PLAN-M M10d)", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Spinneret and Spiderling", counters: { "+1/+1": 3 } }], library: lands("Forest", 5) },
          p2: { battlefield: ["Bear Cub", "Bear Cub"] },
        });
        const spin = idOf(s, "p1", "battlefield", "Spinneret and Spiderling");
        const [a, b] = idsOf(s, "p2", "battlefield", "Bear Cub") as [string, string];
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: spin, defender: "p2" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: a, attacker: spin },
            { blocker: b, attacker: spin },
          ],
        });
        s = throughCombat(s, (req) => (req.type === "divide" && req.among.length === 2 ? [2, 2] : undefined));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(2);
        expect(s.exile).toHaveLength(1);
      });
    });

    describe("Stegron the Dinosaur Man", () => {
      it("{1}{R}, discard it: one of your creatures gets +3/+1 and becomes a Dinosaur until end of turn", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Stegron the Dinosaur Man"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const stegron = idOf(s, "p1", "hand", "Stegron the Dinosaur Man");
        s = settle(activate(s, "p1", stegron, { targets: { t: [bear] } }));
        expect(idsOf(s, "p1", "graveyard", "Stegron the Dinosaur Man")).toHaveLength(1);
        expect(pt(s, bear)).toEqual([5, 3]);
        expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Dinosaur"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(pt(s, bear)).toEqual([2, 2]);
        expect(chars(s, bear).subtypes).not.toContain("Dinosaur");
      });
    });

    describe("Taxi Driver", () => {
      it("{1}, {T}: a creature gains haste", () => {
        let s = scenario({
          p1: { battlefield: ["Taxi Driver", "Mountain", { name: "Bear Cub", sick: true }] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Taxi Driver"), { targets: { t: [bear] } }));
        expect(chars(s, bear).keywords).toContain("haste");
        s = attack(s, [bear]);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    describe("Wisecrack", () => {
      it("the creature deals damage to itself equal to its power; not attacking, its controller takes nothing", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Wisecrack"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Wisecrack", { targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(20);
      });

      it("on an attacking creature, it dies and its controller takes 2 damage", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 3), hand: ["Wisecrack"] },
          p2: { battlefield: ["Bear Cub"] },
          active: "p2",
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
        s = settle(cast(s, "p1", "Wisecrack", { targets: { t: [bear] } }));
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
      });
    });
  });
});

describe("lot A, vert", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Plays (passes and answers to the choices, suggested by default) until the condition. */
  const runUntil = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Passes and answers the choices until the stack is empty, with no trigger waiting. */
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
  /** Answer that picks the cards with these names when they are among the options. */
  const pickingNames =
    (names: string[]): Answer =>
    (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      const picked = req.options.filter((o) => names.includes(nameOf(cur, String(o)) ?? ""));
      return picked.length > 0 ? picked.slice(0, req.max ?? picked.length) : undefined;
    };
  const triggerMode =
    (index: number): Answer =>
    (req) =>
      req.type === "pick" && req.intent === "triggerMode" ? [String(index)] : undefined;
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plusOnes = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));

  describe("Marvel's Spider-Man, lot A — vert", () => {
    describe("Damage Control Crew", () => {
      it("Repair: a card with mana value 4 or more from your graveyard returns to hand (not one with mana value 2)", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 4), hand: ["Damage Control Crew"], graveyard: ["Shivan Dragon", "Bear Cub"] },
        });
        const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        let offered: ChoiceValue[] = [];
        s = settle(cast(s, "p1", "Damage Control Crew"), (req, p, cur) => {
          if (req.type === "pick" && req.intent !== "triggerMode") offered = req.options;
          return triggerMode(0)(req, p, cur) ?? picking([dragon])(req, p, cur);
        });
        expect(offered).not.toContain(bear);
        expect(handNames(s)).toEqual(["Shivan Dragon"]);
      });

      it("Impound: exiles an artifact or an enchantment", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 4), hand: ["Damage Control Crew"] },
          p2: { battlefield: ["Gleaming Barrier"] },
        });
        s = settle(cast(s, "p1", "Damage Control Crew"), triggerMode(1));
        expect(idsOf(s, "p2", "battlefield", "Gleaming Barrier")).toHaveLength(0);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Gleaming Barrier");
        // Exiled, it doesn't die: no Treasure.
        expect(idsOf(s, "p2", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    it("Ezekiel Sims: at the beginning of combat on your turn, a Spider you control gets +2/+2", () => {
      let s = scenario({ p1: { battlefield: ["Ezekiel Sims, Spider-Totem", "Radioactive Spider", "Bear Cub"] } });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let offered: ChoiceValue[] = [];
      s = runUntil(
        s,
        (x) => x.pending?.kind === "declareAttackers",
        (req, p, cur) => {
          if (req.type === "pick") offered = req.options;
          return picking([spider])(req, p, cur);
        },
      );
      expect(offered).not.toContain(bear);
      expect(pt(s, spider)).toEqual([3, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, spider)).toEqual([1, 1]);
    });

    it("Grow Extra Arms: +4/+4; costs {1} less if it targets a Spider", () => {
      const s = scenario({ p1: { battlefield: ["Forest", "Radioactive Spider", "Bear Cub"], hand: ["Grow Extra Arms"] } });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() => cast(s, "p1", "Grow Extra Arms", { targets: { t: [bear] } })).toThrow();
      const t = settle(cast(s, "p1", "Grow Extra Arms", { targets: { t: [spider] } }));
      expect(pt(t, spider)).toEqual([5, 5]);
    });

    it("Guy in the Chair: Web Support puts a +1/+1 counter on a Spider only, as a sorcery", () => {
      let s = scenario({ p1: { battlefield: ["Guy in the Chair", "Radioactive Spider", "Bear Cub", ...lands("Forest", 3)] } });
      const guy = idOf(s, "p1", "battlefield", "Guy in the Chair");
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const web = ability(s, "p1", guy, /Web Support/);
      // Bear Cub is not a Spider.
      expect(web?.targets[0]?.legal).toEqual([spider]);
      s = settle(activate(s, "p1", guy, { targets: { t: [spider] } }, /Web Support/));
      expect(plusOnes(s, spider)).toBe(1);
      expect(s.objects[guy]?.tapped).toBe(true);
    });

    it("Kapow!: a +1/+1 counter on your creature, then it fights an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Kapow!"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const other = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Kapow!", { targets: { a: [bear], b: [other] } }));
      // The counter is placed before the fight: 3/3 against 2/2, only the opposing creature dies.
      expect(plusOnes(s, bear)).toBe(1);
      expect(s.objects[bear]?.damage).toBe(2);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Kraven's Cats: {2}{G}: +2/+2, only once each turn", () => {
      let s = scenario({ p1: { battlefield: ["Kraven's Cats", ...lands("Forest", 6)] } });
      const cats = idOf(s, "p1", "battlefield", "Kraven's Cats");
      s = settle(activate(s, "p1", cats));
      expect(pt(s, cats)).toEqual([4, 4]);
      expect(ability(s, "p1", cats)).toBeUndefined();
    });

    it("Lizard, Connors's Curse: another creature loses its abilities and becomes a base 4/4 green Lizard", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Lizard, Connors's Curse"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Lizard, Connors's Curse"), picking([angel]));
      const c = chars(s, angel);
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(c.colors).toEqual(["G"]);
      expect(c.subtypes).toEqual(["Lizard"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.keywords).not.toContain("vigilance");
      // The effect has no end.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, angel).subtypes).toEqual(["Lizard"]);
    });

    it("Lurking Lizards: a +1/+1 counter for each spell with mana value 4 or more you cast", () => {
      let s = scenario({
        p1: { battlefield: ["Lurking Lizards", ...lands("Mountain", 6), "Forest"], hand: ["Shivan Dragon", "Llanowar Elves"] },
      });
      const lizards = idOf(s, "p1", "battlefield", "Lurking Lizards");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(plusOnes(s, lizards)).toBe(0);
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(plusOnes(s, lizards)).toBe(1);
    });

    describe("Miles Morales // Ultimate Spider-Man", () => {
      it("on entering, a +1/+1 counter on each of up to two creatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Miles Morales // Ultimate Spider-Man"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Miles Morales // Ultimate Spider-Man"), picking([bear, angel]));
        expect(plusOnes(s, bear)).toBe(1);
        expect(plusOnes(s, angel)).toBe(1);
      });

      it("transforms as a sorcery; when attacking, doubles the counters of Spiders and legendary creatures", () => {
        let s = scenario({
          p1: {
            battlefield: [
              { name: "Miles Morales // Ultimate Spider-Man", counters: { "+1/+1": 1 } },
              { name: "Radioactive Spider", counters: { "+1/+1": 2 } },
              { name: "Bear Cub", counters: { "+1/+1": 1 } },
              "Mountain",
              "Plains",
              ...lands("Forest", 4),
            ],
          },
        });
        const miles = s.battlefield.find((id) => nameOf(s, id) === "Miles Morales // Ultimate Spider-Man") as string;
        const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", miles, {}, /Transform/));
        expect(chars(s, miles).name).toBe("Ultimate Spider-Man");
        expect(chars(s, miles).keywords).toEqual(expect.arrayContaining(["firstStrike", "haste"]));
        expect(pt(s, miles)).toEqual([5, 4]);
        s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = settle(s);
        expect(plusOnes(s, miles)).toBe(2);
        expect(plusOnes(s, spider)).toBe(4);
        expect(plusOnes(s, bear)).toBe(1);
      });

      it("Camouflage: a +1/+1 counter, hexproof and colorless until end of turn", () => {
        let s = scenario({
          p1: { battlefield: ["Miles Morales // Ultimate Spider-Man", ...lands("Forest", 6), "Mountain", "Plains"] },
        });
        const miles = s.battlefield.find((id) => nameOf(s, id) === "Miles Morales // Ultimate Spider-Man") as string;
        s = settle(activate(s, "p1", miles, {}, /Transform/));
        s = settle(activate(s, "p1", miles, {}, /Camouflage/));
        expect(plusOnes(s, miles)).toBe(1);
        expect(chars(s, miles).keywords).toContain("hexproof");
        expect(chars(s, miles).colors).toEqual([]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, miles).keywords).not.toContain("hexproof");
        expect([...chars(s, miles).colors].sort()).toEqual(["G", "R", "W"]);
      });
    });

    it("Pictures of Spider-Man: up to two creature cards among the top five; {1}, {T}, sacrifice: a Treasure", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Pictures of Spider-Man"],
          library: ["Bear Cub", "Opt", "Serra Angel", "Llanowar Elves", "Forest", "Shivan Dragon"],
        },
      });
      s = settle(cast(s, "p1", "Pictures of Spider-Man"), pickingNames(["Bear Cub", "Serra Angel"]));
      expect(handNames(s).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      // The rest goes to the bottom: Shivan Dragon (sixth card) is now on top.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shivan Dragon");
      const pictures = idOf(s, "p1", "battlefield", "Pictures of Spider-Man");
      s = settle(activate(s, "p1", pictures));
      expect(idsOf(s, "p1", "graveyard", "Pictures of Spider-Man")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Professional Wrestler: a Treasure on entering; can't be blocked by more than one creature", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Professional Wrestler" }] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const wrestler = idOf(s, "p1", "battlefield", "Professional Wrestler");
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wrestler, defender: "p2" }] });
      s = runUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: bear, attacker: wrestler },
            { blocker: elves, attacker: wrestler },
          ],
        }),
      ).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: bear, attacker: wrestler }] })).not.toThrow();

      let t = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Professional Wrestler"] } });
      t = settle(cast(t, "p1", "Professional Wrestler"));
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Radioactive Spider: {2}, sacrifice, as a sorcery: searches for a Spider Hero card (not a plain Spider)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Radioactive Spider", ...lands("Forest", 2)],
          library: ["Spider Manifestation", "Bear Cub", "Spider-Man, Brooklyn Visionary", "Forest"],
        },
      });
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      let offered: string[] = [];
      s = settle(activate(s, "p1", spider), (req, _p, cur) => {
        if (req.type === "pick") offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
        return undefined;
      });
      expect(offered).toEqual(["Spider-Man, Brooklyn Visionary"]);
      expect(handNames(s)).toEqual(["Spider-Man, Brooklyn Visionary"]);
      expect(idsOf(s, "p1", "graveyard", "Radioactive Spider")).toHaveLength(1);
    });

    describe("Scout the City", () => {
      it("Look Around: mill three cards, a permanent card among them to hand, and 3 life", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Scout the City"], library: ["Opt", "Bear Cub", "Forest", "Island"] },
        });
        let offered: string[] = [];
        s = settle(cast(s, "p1", "Scout the City", { mode: 0 }), (req, _p, cur) => {
          if (req.type === "pick") offered = req.options.map((o) => nameOf(cur, String(o)) ?? "");
          return pickingNames(["Bear Cub"])(req, _p, cur);
        });
        expect(offered.sort()).toEqual(["Bear Cub", "Forest"]);
        expect(handNames(s)).toEqual(["Bear Cub"]);
        expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p1?.life).toBe(23);
      });

      it("Bring Down: destroys a creature with flying, not another", () => {
        const s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Scout the City"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Scout the City", { mode: 1, targets: { t: [bear] } })).toThrow();
        const t = settle(cast(s, "p1", "Scout the City", { mode: 1, targets: { t: [angel] } }));
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Spider-Ham: a Food on entering; your other Spiders, Bears... get +1/+1, not the Elves", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), "Bear Cub", "Radioactive Spider", "Llanowar Elves"],
          hand: ["Spider-Ham, Peter Porker"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Spider-Ham, Peter Porker"));
      const ham = idOf(s, "p1", "battlefield", "Spider-Ham, Peter Porker");
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(pt(s, ham)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Radioactive Spider"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Spider-Man, Brooklyn Visionary: cast by web-slinging, it searches for a basic land that enters tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), { name: "Bear Cub", tapped: true }],
          hand: ["Spider-Man, Brooklyn Visionary"],
          library: ["Opt", "Island", "Serra Angel"],
        },
      });
      s = settle(cast(s, "p1", "Spider-Man, Brooklyn Visionary", { alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Spider-Man, Brooklyn Visionary")).toHaveLength(1);
      expect(handNames(s)).toEqual(["Bear Cub"]);
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
    });

    it("Strength of Will: indestructible, and as many +1/+1 counters as damage dealt to it, until end of turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Mountain", 2), "Bear Cub"],
          hand: ["Strength of Will", "Lightning Strike"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Strength of Will", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(plusOnes(s, bear)).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      expect(plusOnes(s, bear)).toBe(3);
    });

    it("Supportive Parents: tap two untapped creatures you control: one mana of any color", () => {
      let s = scenario({ p1: { battlefield: ["Supportive Parents", "Bear Cub", "Llanowar Elves"] } });
      const parents = idOf(s, "p1", "battlefield", "Supportive Parents");
      s = activate(s, "p1", parents);
      s = runUntil(s, (x) => x.pending?.kind === "priority");
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
      const pool: number[] = Object.values(s.players.p1?.manaPool ?? {});
      expect(pool.reduce((a, b) => a + b, 0)).toBe(1);
    });

    it("Supportive Parents: it can be one of the two creatures, even with summoning sickness (302.6)", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Supportive Parents", sick: true }, "Bear Cub"] } });
      const parents = idOf(s, "p1", "battlefield", "Supportive Parents");
      s = activate(s, "p1", parents);
      s = runUntil(s, (x) => x.pending?.kind === "priority");
      expect(s.objects[parents]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      const pool: number[] = Object.values(s.players.p1?.manaPool ?? {});
      expect(pool.reduce((a, b) => a + b, 0)).toBe(1);
    });

    describe("Terrific Team-Up", () => {
      it("costs {2} less with a permanent with mana value 4 or more; each creature gets +1/+0 and damages the target", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Forest", 2), "Bear Cub", "Shivan Dragon"], hand: ["Terrific Team-Up"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Terrific Team-Up", { targets: { a: [bear], b: [angel] } }));
        expect(pt(s, bear)).toEqual([3, 2]);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[angel]?.damage).toBe(3);
      });

      it("two creatures: each deals damage equal to its power; without mana value 4, no reduction", () => {
        const base = { battlefield: [...lands("Forest", 2), "Bear Cub", "Llanowar Elves"], hand: ["Terrific Team-Up"] };
        const s = scenario({ p1: base, p2: { battlefield: ["Serra Angel"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "Terrific Team-Up", { targets: { a: [bear, elves], b: [angel] } })).toThrow();
        let t = scenario({
          p1: { ...base, battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
        const elves2 = idOf(t, "p1", "battlefield", "Llanowar Elves");
        t = settle(
          cast(t, "p1", "Terrific Team-Up", {
            targets: { a: [bear2, elves2], b: [idOf(t, "p2", "battlefield", "Serra Angel")] },
          }),
        );
        // 3 + 2 damage: Serra Angel (4/4) dies.
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Wall Crawl: a 2/1 Spider, 1 life per Spider; your Spiders +1/+1 and can't be blocked by defenders", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), "Radioactive Spider", "Bear Cub"], hand: ["Wall Crawl"] },
        p2: { battlefield: ["Gleaming Barrier"] },
      });
      s = settle(cast(s, "p1", "Wall Crawl"));
      const token = idOf(s, "p1", "battlefield", "Spider");
      const spider = idOf(s, "p1", "battlefield", "Radioactive Spider");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.players.p1?.life).toBe(22);
      expect(pt(s, token)).toEqual([3, 2]);
      expect(pt(s, spider)).toEqual([2, 2]);
      expect(pt(s, bear)).toEqual([2, 2]);
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: spider, defender: "p2" },
          { id: bear, defender: "p2" },
        ],
      });
      s = runUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const wall = idOf(s, "p2", "battlefield", "Gleaming Barrier");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: spider }] })).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: bear }] })).not.toThrow();
    });

    it("Web of Life and Destiny: at the beginning of combat, a creature card among the top five onto the battlefield", () => {
      let s = scenario({
        p1: {
          // A creature: the declare attackers step happens this turn.
          battlefield: ["Web of Life and Destiny", "Llanowar Elves"],
          library: ["Forest", "Opt", "Serra Angel", "Island", "Forest", "Bear Cub"],
        },
      });
      s = runUntil(s, (x) => x.pending?.kind === "declareAttackers", pickingNames(["Serra Angel"]));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // The rest goes to the bottom: Bear Cub (sixth card) is now on top.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Bear Cub");
    });

    it("Web of Life and Destiny: convoke lets you cast it by tapping creatures", () => {
      const s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub", "Llanowar Elves", "Bear Cub", "Kraven's Cats"],
          hand: ["Web of Life and Destiny"],
        },
      });
      const t = settle(cast(s, "p1", "Web of Life and Destiny"));
      expect(idsOf(t, "p1", "battlefield", "Web of Life and Destiny")).toHaveLength(1);
    });
  });
});

describe("lot A, multicolores", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, cur: S) => ChoiceValue[] | undefined;
  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x): x is Extract<ActionOption, { type: "activate" }> => x.type === "activate" && x.source === source,
    );
    return act(s, player, { type: "activate", source, ability: a?.ability ?? -1, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const plus1 = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
  const hand = (s: S, p = "p1") => s.players[p]?.hand ?? [];
  /** Declares p1's attackers (against p2), then resolves the attack triggers. */
  const attack = (s: S, ids: string[], answer?: Answer): S => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    return settle(cur, answer);
  };
  const toMain2 = (s: S) => advanceUntil(s, (x) => x.turn.step === "main2");

  const VILLAIN_11 = customCard({
    name: "Test Henchman",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
    subtypes: ["Human", "Villain"],
    power: 1,
    toughness: 1,
  });
  const TRINKET = customCard({
    name: "Test Trinket",
    typeLine: "Artifact",
    types: ["Artifact"],
    manaCost: { generic: 2, colored: {}, x: 0 },
    manaCostText: "{2}",
  });

  describe("Marvel's Spider-Man, lot A — multicolores", () => {
    it("Araña: a counter on an attacking creature; a modified creature that damages a player exiles the top card, playable this turn", () => {
      let s = scenario({ p1: { battlefield: ["Araña, Heart of the Spider", "Bear Cub"] } });
      const arana = idOf(s, "p1", "battlefield", "Araña, Heart of the Spider");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [arana, cub], picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      expect(plus1(s, arana)).toBe(0);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(20 - 3 - 3);
      // Only the bear (modified) triggers: a single card exiled, playable this turn.
      expect(s.exile).toHaveLength(1);
      const exiled = s.exile[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === exiled)).toBe(true);
    });

    it("Biorganic Carapace: attaches on entering (+2/+2); the equipped creature draws a card for each modified creature", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 2),
            ...lands("Island", 2),
            "Bear Cub",
            { name: "Llanowar Elves", counters: { "+1/+1": 1 } },
            "Gnarlid Colony",
          ],
          hand: ["Biorganic Carapace"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Biorganic Carapace"), picking([cub]));
      const carapace = idOf(s, "p1", "battlefield", "Biorganic Carapace");
      expect(s.objects[carapace]?.attachedTo).toBe(cub);
      expect(pt(s, cub)).toEqual([4, 4]);
      s = attack(s, [cub]);
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(16);
      // The equipped bear and the elves with a counter are modified; Gnarlid Colony is not.
      expect(hand(s)).toHaveLength(2);
    });

    it("Cosmic Spider-Man: at the beginning of combat, your other Spiders gain its five abilities, not the other creatures", () => {
      let s = scenario({ p1: { battlefield: ["Cosmic Spider-Man", "Web-Warriors", "Bear Cub"] } });
      const web = idOf(s, "p1", "battlefield", "Web-Warriors");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      expect(chars(s, web).keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "trample", "lifelink", "haste"]));
      expect(chars(s, cub).keywords).not.toContain("flying");
    });

    it("Doctor Octopus: your other Villains get +2/+2; at your end step, you draw up to eight cards", () => {
      let s = scenario({
        p1: { battlefield: ["Doctor Octopus, Master Planner", "Prowler, Clawed Thief"], hand: ["Opt", "Opt", "Opt"] },
        p2: { battlefield: ["Mob Lookout"] },
      });
      const ock = idOf(s, "p1", "battlefield", "Doctor Octopus, Master Planner");
      expect(pt(s, ock)).toEqual([4, 8]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Prowler, Clawed Thief"))).toEqual([4, 5]);
      // Opposing Villains are not concerned.
      expect(pt(s, idOf(s, "p2", "battlefield", "Mob Lookout"))).toEqual([0, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(hand(s)).toHaveLength(8);
    });

    it("Doctor Octopus: your maximum hand size is eight (ten cards in hand: two discarded)", () => {
      let s = scenario({ p1: { battlefield: ["Doctor Octopus, Master Planner"], hand: lands("Island", 10) } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(hand(s)).toHaveLength(8);
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });

    it("Gallant Citizen: on entering, draw a card", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Gallant Citizen"] } });
      s = settle(cast(s, "p1", "Gallant Citizen"));
      expect(hand(s)).toHaveLength(1);
    });

    it("Green Goblin, Revenant: when attacking, discard a card then draw a card for each card discarded this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Green Goblin, Revenant", "Swamp"], hand: ["Pumpkin Bombardment", "Opt", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // Pumpkin Bombardment: discard as an additional cost (a first card discarded this turn).
      s = settle(cast(s, "p1", "Pumpkin Bombardment", { targets: { t: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(hand(s)).toHaveLength(1);
      const goblin = idOf(s, "p1", "battlefield", "Green Goblin, Revenant");
      s = attack(s, [goblin]);
      // The last card is discarded, then two cards drawn (two discarded this turn).
      expect(hand(s)).toHaveLength(2);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(
        expect.arrayContaining(["Opt", "Lightning Strike", "Pumpkin Bombardment"]),
      );
    });

    it("Pumpkin Bombardment: without a card to discard, you pay {2} more; 3 damage to the targeted creature", () => {
      const short = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Pumpkin Bombardment"] } });
      expect(castable(short, "p1", idOf(short, "p1", "hand", "Pumpkin Bombardment"))).toBe(false);
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Pumpkin Bombardment"] },
        p2: { battlefield: ["Gnarlid Colony"] },
      });
      const colony = idOf(s, "p2", "battlefield", "Gnarlid Colony");
      s = settle(cast(s, "p1", "Pumpkin Bombardment", { targets: { t: [colony] }, discard: [] }));
      expect(idsOf(s, "p2", "battlefield", "Gnarlid Colony")).toHaveLength(0);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    });

    it("Kraven, Proud Predator: its power is the greatest mana value among your permanents", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven, Proud Predator", ...lands("Plains", 5)], hand: ["Serra Angel"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven, Proud Predator");
      expect(pt(s, kraven)).toEqual([3, 4]);
      s = settle(cast(s, "p1", "Serra Angel"));
      expect(pt(s, kraven)).toEqual([5, 4]);
    });

    it("Mary Jane Watson: a Spider that enters makes you draw, once each turn", () => {
      let s = scenario({
        p1: { battlefield: ["Mary Jane Watson", ...lands("Plains", 4)], hand: ["Skyward Spider", "Skyward Spider"] },
      });
      s = settle(cast(s, "p1", "Skyward Spider"));
      expect(hand(s)).toHaveLength(2);
      s = settle(cast(s, "p1", "Skyward Spider"));
      expect(hand(s)).toHaveLength(1);
    });

    it("Mob Lookout: on entering, a creature you control connives", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", "Swamp"], hand: ["Mob Lookout", "Opt"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Mob Lookout"), picking([cub, opt]));
      // Draws a card (Forest), discards Opt (nonland): a +1/+1 counter on the bear.
      expect(plus1(s, cub)).toBe(1);
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Forest"]);
    });

    it("Morbius: from the graveyard, exile it to keep one of the top three cards, the others on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Swamp"],
          graveyard: ["Morbius the Living Vampire"],
          library: ["Opt", "Lightning Strike", "Think Twice", "Forest", "Forest"],
        },
      });
      const morbius = idOf(s, "p1", "graveyard", "Morbius the Living Vampire");
      const strike = s.players.p1?.library[1] as string;
      s = settle(activate(s, "p1", morbius), picking([strike]));
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Lightning Strike"]);
      expect(s.exile.map((id) => nameOf(s, id))).toContain("Morbius the Living Vampire");
      const lib = (s.players.p1?.library ?? []).map((id) => nameOf(s, id));
      expect(lib.slice(0, 2)).toEqual(["Forest", "Forest"]);
      expect(lib.slice(2).sort()).toEqual(["Opt", "Think Twice"]);
    });

    it("Prowler: whenever another Villain enters under your control, Prowler connives", () => {
      let s = scenario({
        p1: { battlefield: ["Prowler, Clawed Thief", "Island"], hand: [VILLAIN_11, "Opt"] },
      });
      const prowler = idOf(s, "p1", "battlefield", "Prowler, Clawed Thief");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Test Henchman"), picking([opt]));
      expect(plus1(s, prowler)).toBe(1);
      expect(pt(s, prowler)).toEqual([3, 4]);
    });

    describe("Rhino's Rampage", () => {
      it("+1/+0 then fight; excess damage destroys up to one noncreature artifact with mana value 3 or less", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Rhino's Rampage"] },
          p2: { battlefield: ["Llanowar Elves", TRINKET] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
        const trinket = idOf(s, "p2", "battlefield", "Test Trinket");
        s = settle(cast(s, "p1", "Rhino's Rampage", { targets: { a: [cub], b: [elves] } }), picking([trinket]));
        expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
        expect(idsOf(s, "p2", "battlefield", "Test Trinket")).toHaveLength(0);
        expect(s.objects[cub]?.damage).toBe(1);
        expect(pt(s, cub)).toEqual([3, 2]);
      });

      it("without excess damage, the artifact stays", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Rhino's Rampage"] },
          p2: { battlefield: ["Serra Angel", TRINKET] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const trinket = idOf(s, "p2", "battlefield", "Test Trinket");
        s = settle(cast(s, "p1", "Rhino's Rampage", { targets: { a: [cub], b: [angel] } }), picking([trinket]));
        expect(s.objects[angel]?.damage).toBe(3);
        expect(idsOf(s, "p2", "battlefield", "Test Trinket")).toHaveLength(1);
      });
    });

    it("Scarlet Spider, Kaine: on entering, you may discard a card for a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Scarlet Spider, Kaine", "Opt"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Scarlet Spider, Kaine"), picking([opt]));
      const kaine = idOf(s, "p1", "battlefield", "Scarlet Spider, Kaine");
      expect(plus1(s, kaine)).toBe(1);
      expect(pt(s, kaine)).toEqual([3, 2]);
      expect(hand(s)).toHaveLength(0);
    });

    describe("Shriek, Treblemaker", () => {
      it("at the beginning of your first main phase, discarding a card prevents a creature from blocking", () => {
        let s = scenario({
          p1: { battlefield: ["Shriek, Treblemaker"], hand: ["Opt"] },
          p2: { battlefield: ["Bear Cub"] },
          step: "draw",
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        const opt = idOf(s, "p1", "hand", "Opt");
        s = passAccepting(s, (x) => x.turn.step === "main1");
        s = settle(s, picking([opt, bear]));
        expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toContain("Opt");
        expect(chars(s, bear).keywords).toContain("cantBlock");
      });

      it("whenever an opposing creature dies, 1 damage to its controller", () => {
        let s = scenario({
          p1: { battlefield: ["Shriek, Treblemaker", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Silk: each creature spell creates a Human Citizen; {3}{G}{W}: +2/+2 and vigilance for your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Silk, Web Weaver", ...lands("Forest", 4), ...lands("Plains", 2)], hand: ["Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      const citizen = idOf(s, "p1", "battlefield", "Human Citizen");
      expect(chars(s, citizen).colors.sort()).toEqual(["G", "W"]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Silk, Web Weaver")));
      expect(pt(s, citizen)).toEqual([3, 3]);
      expect(chars(s, citizen).keywords).toContain("vigilance");
    });

    it("Skyward Spider: has flying only as long as it is modified", () => {
      const plain = scenario({ p1: { battlefield: ["Skyward Spider"] } });
      expect(chars(plain, idOf(plain, "p1", "battlefield", "Skyward Spider")).keywords).not.toContain("flying");
      const pumped = scenario({ p1: { battlefield: [{ name: "Skyward Spider", counters: { "+1/+1": 1 } }] } });
      expect(chars(pumped, idOf(pumped, "p1", "battlefield", "Skyward Spider")).keywords).toContain("flying");
    });

    it("SP//dr: a counter on entering; a modified creature that damages a player makes you draw", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 2), "Bear Cub", "Gnarlid Colony"],
          hand: ["SP//dr, Piloted by Peni"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const colony = idOf(s, "p1", "battlefield", "Gnarlid Colony");
      s = settle(cast(s, "p1", "SP//dr, Piloted by Peni"), picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      s = attack(s, [cub, colony]);
      s = toMain2(s);
      // Only the bear (modified) makes you draw.
      expect(hand(s)).toHaveLength(1);
    });

    it("Spider-Girl: flying during your turn only; when leaving, a Human Citizen", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Girl, Legacy Hero"] },
        p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Spider-Girl, Legacy Hero");
      expect(chars(s, girl).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, girl).keywords).not.toContain("flying");
      s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [girl] } }));
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(1);
    });

    describe("Spider-Man 2099", () => {
      it("can't be cast during your first three turns", () => {
        const early = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Spider-Man 2099"] }, turn: 5 });
        expect(castable(early, "p1", idOf(early, "p1", "hand", "Spider-Man 2099"))).toBe(false);
        const late = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Spider-Man 2099"] }, turn: 7 });
        expect(castable(late, "p1", idOf(late, "p1", "hand", "Spider-Man 2099"))).toBe(true);
      });

      it("at your end step, if it cast a spell from anywhere but hand, damage equal to its power", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Man 2099", ...lands("Island", 3)], graveyard: ["Think Twice"] },
        });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Think Twice") }));
        s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
        s = settle(s, picking(["p2"]));
        expect(s.players.p2?.life).toBe(18);
      });

      it("nothing if the spells were cast from hand", () => {
        let s = scenario({ p1: { battlefield: ["Spider-Man 2099", "Island"], hand: ["Opt"] } });
        s = settle(cast(s, "p1", "Opt"));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p2?.life).toBe(20);
      });
    });

    it("Spider-Man India: each creature spell puts a counter on one of your creatures, which gains flying", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Man India", "Bear Cub", "Forest"], hand: ["Llanowar Elves"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Llanowar Elves"), picking([cub]));
      expect(plus1(s, cub)).toBe(1);
      expect(chars(s, cub).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cub).keywords).not.toContain("flying");
    });

    it("Spider-Woman: your opponents' artifacts and creatures enter tapped, not yours", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Woman, Stunning Savior", "Forest"], hand: ["Llanowar Elves"] },
        p2: { battlefield: ["Forest"], hand: ["Llanowar Elves"] },
      });
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(cast(s, "p2", "Llanowar Elves"));
      expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
    });

    it("The Spot: exiles a permanent and a graveyard card; if it dies, it goes to the bottom and the cards return to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["The Spot, Living Portal", "Bake into a Pie"] },
        p2: { battlefield: ["Serra Angel"], graveyard: ["Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const cub = idOf(s, "p2", "graveyard", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Spot, Living Portal") });
      s = settle(s, picking([angel, cub]));
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      const spot = idOf(s, "p1", "battlefield", "The Spot, Living Portal");
      // Bake into a Pie: {2}{B}{B}, destroys The Spot.
      for (const id of s.battlefield.filter((x) => nameOf(s, x) === "Plains"))
        (s.objects[id] as { tapped: boolean }).tapped = false;
      s = settle(cast(s, "p1", "Bake into a Pie", { targets: { t: [spot] } }));
      expect(s.exile).toHaveLength(0);
      expect(
        hand(s, "p2")
          .map((id) => nameOf(s, id))
          .sort(),
      ).toEqual(["Bear Cub", "Serra Angel"]);
      const lib = s.players.p1?.library ?? [];
      expect(nameOf(s, lib[lib.length - 1] as string)).toBe("The Spot, Living Portal");
    });

    it("Sun-Spider: flying during your turn; on entering, searches for an Aura or Equipment card", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Sun-Spider, Nimble Webber"],
          library: ["Forest", "Swiftfoot Boots", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Sun-Spider, Nimble Webber"));
      expect(hand(s).map((id) => nameOf(s, id))).toEqual(["Swiftfoot Boots"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Sun-Spider, Nimble Webber")).keywords).toContain("flying");
    });

    describe("Symbiote Spider-Man", () => {
      it("combat damage to a player: look at that many cards, one to hand, the others to the graveyard", () => {
        let s = scenario({
          p1: { battlefield: ["Symbiote Spider-Man"], library: ["Opt", "Lightning Strike", "Forest", "Forest"] },
        });
        s = attack(s, [idOf(s, "p1", "battlefield", "Symbiote Spider-Man")]);
        s = toMain2(s);
        expect(s.players.p2?.life).toBe(18);
        expect(hand(s)).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("Find New Host: from the graveyard, a counter and the combat damage ability", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Island", 3)],
            graveyard: ["Symbiote Spider-Man"],
            library: ["Opt", "Lightning Strike", "Think Twice", "Forest", "Forest"],
          },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Symbiote Spider-Man"), { targets: { t: [cub] } }));
        expect(plus1(s, cub)).toBe(1);
        expect(s.exile.map((id) => nameOf(s, id))).toContain("Symbiote Spider-Man");
        s = attack(s, [cub]);
        s = toMain2(s);
        // 3 damage: three cards looked at, one to hand, two to the graveyard.
        expect(hand(s)).toHaveLength(1);
        expect(s.players.p1?.graveyard).toHaveLength(2);
      });
    });

    it("Ultimate Green Goblin: at your upkeep, discard a card, then create a Treasure", () => {
      let s = scenario({
        p1: { battlefield: ["Ultimate Green Goblin"], hand: ["Opt"] },
        step: "untap",
      });
      s = passAccepting(s, (x) => x.turn.step === "draw");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Vulture: when attacking, your other Villains gain flying until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Vulture, Scheming Scavenger", "Prowler, Clawed Thief", "Bear Cub"] },
      });
      const prowler = idOf(s, "p1", "battlefield", "Prowler, Clawed Thief");
      s = attack(s, [idOf(s, "p1", "battlefield", "Vulture, Scheming Scavenger")]);
      expect(chars(s, prowler).keywords).toContain("flying");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, prowler).keywords).not.toContain("flying");
    });

    it("Web-Warriors: on entering, a +1/+1 counter on each of your other creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 5), "Bear Cub", "Llanowar Elves"], hand: ["Web-Warriors"] },
        p2: { battlefield: ["Gnarlid Colony"] },
      });
      s = settle(cast(s, "p1", "Web-Warriors"));
      expect(plus1(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(plus1(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
      expect(plus1(s, idOf(s, "p1", "battlefield", "Web-Warriors"))).toBe(0);
      expect(plus1(s, idOf(s, "p2", "battlefield", "Gnarlid Colony"))).toBe(0);
    });

    it("Wraith: can't be blocked", () => {
      let s = scenario({ p1: { battlefield: ["Wraith, Vicious Vigilante"] }, p2: { battlefield: ["Serra Angel"] } });
      const wraith = idOf(s, "p1", "battlefield", "Wraith, Vicious Vigilante");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wraith, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: wraith }] })).toThrow();
      s = toMain2(s);
      expect(s.players.p2?.life).toBe(18);
    });
  });
});

describe("lot A, colorless cards and lands", () => {
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
  /** Passes and answers the choices (suggested answer by default) until the stack is empty, with no trigger waiting. */
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
  /** Passes and answers the choices until `until` is true. */
  const run = (s: S, until: (s: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && !until(cur); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Activated ability of `source` whose label matches (the first otherwise). */
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const manaColors = (s: S, player: string, source: string) => [
    ...new Set(legalActions(s, player).flatMap((a) => (a.type === "tapForMana" && a.source === source ? (a.colors ?? []) : []))),
  ];

  const SPIDER = customCard({
    name: "Test Spider",
    typeLine: "Creature — Spider",
    subtypes: ["Spider"],
    power: 1,
    toughness: 4,
  });
  const WALL = customCard({ name: "Test Wall", typeLine: "Creature — Wall", subtypes: ["Wall"], power: 1, toughness: 4 });

  describe("Marvel's Spider-Man, lot A: colorless cards and lands", () => {
    describe("Bagel and Schmear", () => {
      it("Share: {W}, {T}, sacrifice: a +1/+1 counter on a targeted creature and a card drawn, as a sorcery only", () => {
        let s = scenario({ p1: { battlefield: ["Bagel and Schmear", "Plains", "Bear Cub"] } });
        const bagel = idOf(s, "p1", "battlefield", "Bagel and Schmear");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", bagel, { targets: { t: [bear] } }, /Share/));
        expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Bagel and Schmear")).toHaveLength(1);
        // During the opponent's turn, Share can't be activated.
        let t = scenario({ p1: { battlefield: ["Bagel and Schmear", "Plains", ...lands("Forest", 2)] }, active: "p2" });
        t = act(t, "p2", { type: "pass" });
        const other = idOf(t, "p1", "battlefield", "Bagel and Schmear");
        expect(ability(t, "p1", other, /Nosh/)).toBeDefined();
        expect(ability(t, "p1", other, /Share/)).toBeUndefined();
      });

      it("Nosh: {2}, {T}, sacrifice: you gain 3 life and draw a card", () => {
        let s = scenario({ p1: { battlefield: ["Bagel and Schmear", ...lands("Forest", 2)] } });
        const bagel = idOf(s, "p1", "battlefield", "Bagel and Schmear");
        s = settle(activate(s, "p1", bagel, {}, /Nosh/));
        expect(s.players.p1?.life).toBe(23);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(chars(s, idOf(s, "p1", "graveyard", "Bagel and Schmear")).subtypes).toContain("Food");
      });
    });

    describe("Doc Ock's Tentacles", () => {
      it("a creature with mana value 5 or more that enters can equip itself; +4/+4", () => {
        let s = scenario({ p1: { battlefield: ["Doc Ock's Tentacles", ...lands("Mountain", 6)], hand: ["Shivan Dragon"] } });
        s = settle(cast(s, "p1", "Shivan Dragon"), (req) => (req.type === "yesNo" ? [1] : undefined));
        const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
        expect(s.objects[idOf(s, "p1", "battlefield", "Doc Ock's Tentacles")]?.attachedTo).toBe(dragon);
        expect(pt(s, dragon)).toEqual([9, 9]);
      });

      it("a creature with mana value 4 or less triggers nothing", () => {
        let s = scenario({ p1: { battlefield: ["Doc Ock's Tentacles", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
        s = cast(s, "p1", "Bear Cub");
        s = passAccepting(s, (x) => x.stack.length === 0);
        expect(s.triggers).toHaveLength(0);
        expect(s.stack).toHaveLength(0);
        expect(s.objects[idOf(s, "p1", "battlefield", "Doc Ock's Tentacles")]?.attachedTo).toBeFalsy();
      });
    });

    it("Eerie Gravestone: draws on entering; {1}{B}, sacrifice: mills four, a milled creature card to hand", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4)],
          hand: ["Eerie Gravestone"],
          library: ["Island", "Bear Cub", "Island", "Serra Angel", "Island", "Island"],
        },
      });
      s = settle(cast(s, "p1", "Eerie Gravestone"));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const stone = idOf(s, "p1", "battlefield", "Eerie Gravestone");
      let options: string[] = [];
      let offered: string[] = [];
      s = settle(activate(s, "p1", stone), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        offered = options.map((id) => nameOf(cur, id) ?? "");
        return req.options.filter((o) => nameOf(cur, String(o)) === "Serra Angel");
      });
      // Only the milled creature cards are offered.
      expect(options).toHaveLength(2);
      expect(offered.sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Island", "Serra Angel"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual([
        "Bear Cub",
        "Eerie Gravestone",
        "Island",
        "Island",
      ]);
    });

    it("Hot Dog Cart: a Food token on entering; {T}: one mana of any color", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Hot Dog Cart"] } });
      s = settle(cast(s, "p1", "Hot Dog Cart"));
      expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
      const cart = idOf(s, "p1", "battlefield", "Hot Dog Cart");
      expect(manaColors(s, "p1", cart).sort()).toEqual(["B", "G", "R", "U", "W"]);
    });

    it("Living Brain: at the beginning of combat, a non-Equipment artifact becomes a 3/3 creature and untaps", () => {
      let s = scenario({
        p1: { battlefield: ["Living Brain, Mechanical Marvel", { name: "Hot Dog Cart", tapped: true }, "Spider-Suit"] },
      });
      const cart = idOf(s, "p1", "battlefield", "Hot Dog Cart");
      const suit = idOf(s, "p1", "battlefield", "Spider-Suit");
      const brain = idOf(s, "p1", "battlefield", "Living Brain, Mechanical Marvel");
      let options: string[] = [];
      s = run(
        s,
        (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.stack.length === 0 && x.triggers.length === 0,
        (req) => {
          if (req.type !== "pick") return undefined;
          options = req.options.map(String);
          return [cart];
        },
      );
      expect(options.sort()).toEqual([brain, cart].sort());
      expect(options).not.toContain(suit);
      expect(chars(s, cart).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(pt(s, cart)).toEqual([3, 3]);
      expect(s.objects[cart]?.tapped).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, cart).types).not.toContain("Creature");
    });

    it("Mechanical Mobster: exiles up to one card from a graveyard; a targeted creature plots", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Mechanical Mobster", "Opt"], library: ["Island", "Island"] },
        p2: { graveyard: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "graveyard", "Bear Cub");
      const opt = idOf(s, "p1", "hand", "Opt");
      s = cast(s, "p1", "Mechanical Mobster");
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(bear)) return [bear];
        if (req.options.includes(opt)) return [opt];
        return undefined;
      });
      const mobster = idOf(s, "p1", "battlefield", "Mechanical Mobster");
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      // Plot: draw (an Island), discard Opt (nonland): a +1/+1 counter.
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.objects[mobster]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, mobster)).toEqual([3, 2]);
    });

    it("News Helicopter: a 1/1 green and white Human Citizen on entering", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["News Helicopter"] } });
      s = settle(cast(s, "p1", "News Helicopter"));
      const citizen = idOf(s, "p1", "battlefield", "Human Citizen");
      expect(pt(s, citizen)).toEqual([1, 1]);
      expect(chars(s, citizen).colors.sort()).toEqual(["G", "W"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "News Helicopter")).keywords).toContain("flying");
    });

    it("Passenger Ferry: when attacking, pay {U}: another targeted attacking creature can't be blocked", () => {
      let s = scenario({
        p1: { battlefield: ["Passenger Ferry", "Bear Cub", "Serra Angel", "Island"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const ferry = idOf(s, "p1", "battlefield", "Passenger Ferry");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // Crew 2 with the Bear.
      s = settle(activate(s, "p1", ferry, { tap: [bear] }, /Crew/));
      expect(chars(s, ferry).types).toContain("Creature");
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: ferry, defender: "p2" },
          { id: angel, defender: "p2" },
        ],
      });
      let asked = false;
      s = run(
        s,
        (x) => x.pending?.kind === "declareBlockers",
        (req) => {
          if (req.type === "yesNo") asked = true;
          return undefined;
        },
      );
      expect(asked).toBe(true);
      // Only the other attacking creature is a legal target: it is chosen automatically.
      expect(chars(s, angel).keywords).toContain("unblockable");
      expect(chars(s, ferry).keywords).not.toContain("unblockable");
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(() =>
        act(s, "p2", {
          type: "declareBlockers",
          blocks: [{ blocker: idOf(s, "p2", "battlefield", "Llanowar Elves"), attacker: angel }],
        }),
      ).toThrow();
    });

    it("Passenger Ferry: without paying {U}, nothing changes", () => {
      let s = scenario({ p1: { battlefield: ["Passenger Ferry", "Bear Cub", "Serra Angel", "Island"] } });
      const ferry = idOf(s, "p1", "battlefield", "Passenger Ferry");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", ferry, { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }, /Crew/));
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: ferry, defender: "p2" },
          { id: angel, defender: "p2" },
        ],
      });
      s = run(
        s,
        (x) =>
          x.turn.step === "declareAttackers" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        (req) => (req.type === "yesNo" ? [0] : undefined),
      );
      expect(chars(s, angel).keywords).not.toContain("unblockable");
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(false);
    });

    it("Peter Parker's Camera: three film counters; {2}, {T}, remove one: copy of a triggered ability", () => {
      let s = scenario({ p1: { battlefield: ["Peter Parker's Camera", ...lands("Plains", 5)], hand: ["News Helicopter"] } });
      const camera = idOf(s, "p1", "battlefield", "Peter Parker's Camera");
      // The film counters are placed on entering: checked on a cast Camera.
      let c = scenario({ p1: { battlefield: lands("Plains", 1), hand: ["Peter Parker's Camera"] } });
      c = settle(cast(c, "p1", "Peter Parker's Camera"));
      expect(c.objects[idOf(c, "p1", "battlefield", "Peter Parker's Camera")]?.counters.film).toBe(3);
      s.objects[camera] = { ...(s.objects[camera] as NonNullable<S["objects"][string]>), counters: { film: 3 } };
      s.version += 1;
      s = cast(s, "p1", "News Helicopter");
      s = passAccepting(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      expect(ability(s, "p1", camera)?.targets[0]?.legal).toContain(trigger);
      s = settle(activate(s, "p1", camera, { targets: { t: [trigger] } }));
      expect(idsOf(s, "p1", "battlefield", "Human Citizen")).toHaveLength(2);
      expect(s.objects[camera]?.counters.film).toBe(2);
    });

    describe("Rocket-Powered Goblin Glider", () => {
      it("equipped: +2/+0, flying and haste; cast from hand, it doesn't attach", () => {
        let s = scenario({ p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Rocket-Powered Goblin Glider"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Rocket-Powered Goblin Glider"), picking([bear]));
        const glider = idOf(s, "p1", "battlefield", "Rocket-Powered Goblin Glider");
        expect(s.objects[glider]?.attachedTo).toBeFalsy();
        s = settle(activate(s, "p1", glider, { targets: { t: [bear] } }, /Equip/));
        expect(s.objects[glider]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 2]);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      });

      it("mayhem: discarded this turn, cast from the graveyard for {2}, it attaches to one of your creatures", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], graveyard: ["Rocket-Powered Goblin Glider"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const card = idOf(s, "p1", "graveyard", "Rocket-Powered Goblin Glider");
        s.turnLog.push({ e: "discard", player: "p1", amount: 1, id: card });
        s = settle(act(s, "p1", { type: "cast", card }), picking([bear]));
        const glider = idOf(s, "p1", "battlefield", "Rocket-Powered Goblin Glider");
        expect(s.objects[glider]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([4, 2]);
      });
    });

    it("Spider-Bot: you may put a basic land card on top of your library", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Spider-Bot"], library: ["Bear Cub", "Serra Angel", "Island", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Spider-Bot"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        const island = req.options.find((o) => nameOf(cur, String(o)) === "Island");
        return island ? [island] : undefined;
      });
      const top = s.players.p1?.library[0] as string;
      expect(nameOf(s, top)).toBe("Island");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Spider-Mobile: when attacking, +1/+1 per Spider you control", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Mobile", SPIDER, SPIDER, "Bear Cub"] } });
      const mobile = idOf(s, "p1", "battlefield", "Spider-Mobile");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Crew 2 with the Bear: both Spiders stay untapped (they count even tapped).
      s = settle(activate(s, "p1", mobile, { tap: [bear] }, /Crew/));
      expect(pt(s, mobile)).toEqual([3, 3]);
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: mobile, defender: "p2" }] });
      s = run(
        s,
        (x) =>
          x.turn.step === "declareAttackers" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority" &&
          x.pending.player === "p2",
      );
      expect(pt(s, mobile)).toEqual([5, 5]);
      expect(chars(s, mobile).keywords).toContain("trample");
    });

    it("Spider-Mobile: when blocking, +1/+1 per Spider you control", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Spider-Mobile", SPIDER, "Serra Angel"] },
      });
      const mobile = idOf(s, "p2", "battlefield", "Spider-Mobile");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      // The opponent equips the Vehicle with the Angel during your main phase.
      s = settle(activate(s, "p2", mobile, { tap: [angel] }, /Crew/));
      s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: mobile, attacker: bear }] });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step === "declareBlockers");
      expect(pt(s, mobile)).toEqual([4, 4]);
    });

    describe("Spider-Slayer, Hatred Honed", () => {
      it("destroys the Spider it damages, not another creature", () => {
        let s = scenario({
          p1: { battlefield: ["Spider-Slayer, Hatred Honed"] },
          p2: { battlefield: [SPIDER, WALL] },
        });
        const slayer = idOf(s, "p1", "battlefield", "Spider-Slayer, Hatred Honed");
        const spider = idOf(s, "p2", "battlefield", "Test Spider");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: slayer, defender: "p2" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: spider, attacker: slayer }] });
        s = advanceUntil(s, (x) => x.turn.step === "end");
        expect(idsOf(s, "p2", "graveyard", "Test Spider")).toHaveLength(1);

        let t = scenario({ p1: { battlefield: ["Spider-Slayer, Hatred Honed"] }, p2: { battlefield: [WALL] } });
        const slayer2 = idOf(t, "p1", "battlefield", "Spider-Slayer, Hatred Honed");
        const wall = idOf(t, "p2", "battlefield", "Test Wall");
        t = passAccepting(t, (x) => x.pending?.kind === "declareAttackers");
        t = act(t, "p1", { type: "declareAttackers", attackers: [{ id: slayer2, defender: "p2" }] });
        t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
        t = act(t, "p2", { type: "declareBlockers", blocks: [{ blocker: wall, attacker: slayer2 }] });
        t = advanceUntil(t, (x) => x.turn.step === "end");
        expect(idsOf(t, "p2", "battlefield", "Test Wall")).toHaveLength(1);
      });

      it("triggers when it deals damage to a Spider, not when a Spider it damaged is dealt damage by another source", () => {
        const TOUGH_SPIDER = customCard({
          name: "Test Tough Spider",
          typeLine: "Creature — Spider",
          subtypes: ["Spider"],
          power: 0,
          toughness: 5,
          keywords: ["indestructible"],
        });
        let s = scenario({
          p1: { battlefield: ["Spider-Slayer, Hatred Honed", "Mountain"], hand: ["Shock"] },
          p2: { battlefield: [TOUGH_SPIDER] },
        });
        const slayer = idOf(s, "p1", "battlefield", "Spider-Slayer, Hatred Honed");
        const spider = idOf(s, "p2", "battlefield", "Test Tough Spider");
        s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: slayer, defender: "p2" }] });
        s = passAccepting(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: spider, attacker: slayer }] });
        // The damage dealt by Spider-Slayer triggers (indestructible: the Spider survives).
        s = advanceUntil(s, (x) => x.stack.length > 0);
        expect(nameOf(s, s.stack[0]?.sourceId ?? "")).toBe("Spider-Slayer, Hatred Honed");
        s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
        expect(idsOf(s, "p2", "battlefield", "Test Tough Spider")).toHaveLength(1);
        // Shock deals damage to that Spider: Spider-Slayer doesn't trigger.
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: [spider] } });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
        expect(s.objects[spider]?.damage).toBe(4);
        expect(s.stack).toHaveLength(0);
        expect(s.triggers).toHaveLength(0);
      });

      it("{6}, exile it from your graveyard: two tapped 1/1 flying artifact Robots", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 6), graveyard: ["Spider-Slayer, Hatred Honed"] } });
        const card = idOf(s, "p1", "graveyard", "Spider-Slayer, Hatred Honed");
        s = settle(activate(s, "p1", card));
        const robots = idsOf(s, "p1", "battlefield", "Robot");
        expect(robots).toHaveLength(2);
        for (const r of robots) {
          expect(s.objects[r]?.tapped).toBe(true);
          expect(chars(s, r).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
          expect(chars(s, r).keywords).toContain("flying");
        }
        expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Spider-Slayer, Hatred Honed"]);
      });
    });

    it("Spider-Suit: the equipped creature gets +2/+2 and is a Spider Hero in addition to its other types", () => {
      let s = scenario({ p1: { battlefield: ["Spider-Suit", "Bear Cub", ...lands("Plains", 3)] } });
      const suit = idOf(s, "p1", "battlefield", "Spider-Suit");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", suit, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Spider", "Hero"]));
    });

    describe("Steel Wrecking Ball", () => {
      it("on entering, 5 damage to a targeted creature", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Steel Wrecking Ball"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Steel Wrecking Ball"), picking([angel]));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("{1}{R}, discard it: destroy a targeted artifact", () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 2), hand: ["Steel Wrecking Ball"] },
          p2: { battlefield: ["Hot Dog Cart"] },
        });
        const ball = idOf(s, "p1", "hand", "Steel Wrecking Ball");
        const cart = idOf(s, "p2", "battlefield", "Hot Dog Cart");
        s = settle(activate(s, "p1", ball, { targets: { t: [cart] } }));
        expect(idsOf(s, "p2", "graveyard", "Hot Dog Cart")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Steel Wrecking Ball")).toHaveLength(1);
      });
    });

    it("Subway Train: on entering, pay {G}: a basic land card to hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Subway Train"], library: ["Bear Cub", "Island", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Subway Train"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        const island = req.options.find((o) => nameOf(cur, String(o)) === "Island");
        return island ? [island] : undefined;
      });
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped && nameOf(s, id) === "Forest")).toHaveLength(3);
    });

    describe("Daily Bugle Building", () => {
      it("{T}: {C}; {1}, {T}: one mana of any color", () => {
        const s = scenario({ p1: { battlefield: ["Daily Bugle Building", "Forest"] } });
        const bugle = idOf(s, "p1", "battlefield", "Daily Bugle Building");
        expect(manaColors(s, "p1", bugle)).toEqual(["C"]);
        expect(ability(s, "p1", bugle, /any color/)).toBeDefined();
      });

      it("Smear Campaign: only a legendary creature, which gains menace until end of turn", () => {
        let s = scenario({
          p1: { battlefield: ["Daily Bugle Building", "Forest", "Bear Cub", "Living Brain, Mechanical Marvel"] },
        });
        const bugle = idOf(s, "p1", "battlefield", "Daily Bugle Building");
        const brain = idOf(s, "p1", "battlefield", "Living Brain, Mechanical Marvel");
        expect(ability(s, "p1", bugle, /Smear Campaign/)?.targets[0]?.legal).toEqual([brain]);
        s = settle(activate(s, "p1", bugle, { targets: { t: [brain] } }, /Smear Campaign/));
        expect(chars(s, brain).keywords).toContain("menace");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, brain).keywords).not.toContain("menace");
      });
    });

    it("Ominous Asylum: enters tapped, {B} or {R}; {4}, {T}: scry 1", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Ominous Asylum" }, ...lands("Swamp", 4)],
          hand: ["Savage Mansion"],
          library: ["Bear Cub", "Island"],
        },
      });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Savage Mansion") });
      expect(s.objects[idOf(s, "p1", "battlefield", "Savage Mansion")]?.tapped).toBe(true);
      const asylum = idOf(s, "p1", "battlefield", "Ominous Asylum");
      expect(manaColors(s, "p1", asylum).sort()).toEqual(["B", "R"]);
      s = settle(activate(s, "p1", asylum, {}, /Surveil/), (req) =>
        req.type === "pick" ? req.options.filter((o) => nameOf(s, String(o)) === "Bear Cub") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[asylum]?.tapped).toBe(true);
    });

    it("Vibrant Cityscape: {T}, sacrifice it: a basic land onto the battlefield, tapped", () => {
      let s = scenario({ p1: { battlefield: ["Vibrant Cityscape"], library: ["Bear Cub", "Island", "Bear Cub"] } });
      const city = idOf(s, "p1", "battlefield", "Vibrant Cityscape");
      s = settle(activate(s, "p1", city));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Vibrant Cityscape")).toHaveLength(1);
    });
  });
});

describe("lot B1, Web-slinging and mayhem", () => {
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, extra: object = {}, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1, ...extra });
  const discarded = (s: S, id: string) => {
    s.turnLog.push({ e: "discard", player: s.objects[id]?.owner ?? "p1", amount: 1, id });
  };
  const castOption = (s: S, player: string, card: string) =>
    legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);

  describe("Spiders-Man, Heroic Horde", () => {
    it("cast with web-slinging: 3 life and two 2/1 Spiders with reach; the tapped creature returns to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 6), { name: "Bear Cub", tapped: true }], hand: ["Spiders-Man, Heroic Horde"] },
      });
      s = settle(cast(s, "p1", "Spiders-Man, Heroic Horde", { alternative: true }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(23);
      const spiders = idsOf(s, "p1", "battlefield", "Spider");
      expect(spiders).toHaveLength(2);
      expect(pt(s, spiders[0] as string)).toEqual([2, 1]);
      expect(chars(s, spiders[0] as string).keywords).toContain("reach");
    });

    it("cast for their mana cost: nothing", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Spiders-Man, Heroic Horde"] } });
      s = settle(cast(s, "p1", "Spiders-Man, Heroic Horde"));
      expect(idsOf(s, "p1", "battlefield", "Spiders-Man, Heroic Horde")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
    });
  });

  describe("Scarlet Spider, Ben Reilly", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Mountain", "Forest", { name: "Llanowar Elves", tapped: true }, { name: "Serra Angel", tapped: true }],
          hand: ["Scarlet Spider, Ben Reilly"],
        },
      });

    it("Web-slinging: the player chooses the returned creature; X counters, X being its mana value", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Scarlet Spider, Ben Reilly");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      // The cheapest is offered first (default choice).
      expect(castOption(s, "p1", card)?.altBounce).toEqual([idOf(s, "p1", "battlefield", "Llanowar Elves"), angel]);
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, bounce: [angel] }));
      const spider = idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly");
      expect(s.objects[spider]?.counters["+1/+1"]).toBe(5);
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    });

    it("without a choice, the cheapest returns (one counter); an untapped creature can't be returned", () => {
      let s = setup();
      const card = idOf(s, "p1", "hand", "Scarlet Spider, Ben Reilly");
      expect(() =>
        act(s, "p1", { type: "cast", card, alternative: true, bounce: [idOf(s, "p1", "battlefield", "Mountain")] }),
      ).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, alternative: true }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly")]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    });

    it("cast for its mana cost: no counter", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Forest", "Forest"], hand: ["Scarlet Spider, Ben Reilly"] } });
      s = settle(cast(s, "p1", "Scarlet Spider, Ben Reilly"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Scarlet Spider, Ben Reilly")]?.counters["+1/+1"] ?? 0).toBe(0);
    });
  });

  describe("Sandman's Quicksand", () => {
    it("cast from hand: all creatures get -2/-2", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Serra Angel"], hand: ["Sandman's Quicksand"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Sandman's Quicksand"));
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([2, 2]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("mayhem cost paid: only the opponents' creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], graveyard: ["Sandman's Quicksand"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "graveyard", "Sandman's Quicksand");
      discarded(s, card);
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([2, 2]);
    });
  });

  describe("Alien Symbiosis", () => {
    it("can be cast from the graveyard by discarding an additional card; +1/+1, menace, Symbiote", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], graveyard: ["Alien Symbiosis"], hand: ["Opt"] },
      });
      const card = idOf(s, "p1", "graveyard", "Alien Symbiosis");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(castOption(s, "p1", card)?.additional?.discard?.count).toBe(1);
      s = settle(act(s, "p1", { type: "cast", card, targets: { enchant: [bear] }, discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("menace");
      expect(chars(s, bear).subtypes).toContain("Symbiote");
    });

    it("without a card to discard, no casting from the graveyard", () => {
      const s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], graveyard: ["Alien Symbiosis"] } });
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Alien Symbiosis"))).toBe(false);
    });
  });

  describe("Oscorp Industries", () => {
    it("discarded this turn, it is playable from the graveyard; entered from a graveyard, you lose 2 life", () => {
      let s = scenario({ p1: { graveyard: ["Oscorp Industries"] } });
      const card = idOf(s, "p1", "graveyard", "Oscorp Industries");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(false);
      discarded(s, card);
      s = act(s, "p1", { type: "playLand", card });
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      const land = idOf(s, "p1", "battlefield", "Oscorp Industries");
      expect(s.objects[land]?.tapped).toBe(true);
      expect(s.players.p1?.life).toBe(18);
    });

    it("played from hand: no life loss", () => {
      let s = scenario({ p1: { hand: ["Oscorp Industries"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Oscorp Industries") });
      s = passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0);
      expect(s.players.p1?.life).toBe(20);
    });
  });

  describe("Norman Osborn // Green Goblin", () => {
    const goblin = () => {
      let s = scenario({
        p1: {
          battlefield: ["Norman Osborn // Green Goblin", "Island", "Swamp", "Mountain", ...lands("Mountain", 3)],
          graveyard: ["Shivan Dragon", "Lightning Strike", "Forest"],
        },
      });
      const norman = idOf(s, "p1", "battlefield", "Norman Osborn // Green Goblin");
      expect(chars(s, norman).keywords).toContain("unblockable");
      s = settle(activate(s, "p1", norman, {}, /Transform/));
      expect(chars(s, norman).name).toBe("Green Goblin");
      return s;
    };

    it("Goblin Formula: a nonland card discarded this turn can be cast from the graveyard, {2} less", () => {
      let s = goblin();
      const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      const forest = idOf(s, "p1", "graveyard", "Forest");
      expect(castable(s, "p1", strike)).toBe(false);
      discarded(s, strike);
      discarded(s, dragon);
      discarded(s, forest);
      expect(castable(s, "p1", strike)).toBe(true);
      // A land doesn't have mayhem.
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
      // Lightning Strike ({1}{R}) costs {R}: a single untapped Mountain is enough.
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });
  });

  describe("Peter Parker // Amazing Spider-Man", () => {
    it("Peter Parker creates a Spider; Amazing Spider-Man gives Web-slinging {G}{W}{U} to your colored legendary spells", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Island", "Forest", "Forest", "Plains", "Island", "Plains"],
          hand: ["Peter Parker // Amazing Spider-Man", "Kraven, Proud Predator", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Peter Parker // Amazing Spider-Man"));
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(1);
      const peter = idOf(s, "p1", "battlefield", "Peter Parker // Amazing Spider-Man");
      // Reach is the token's, not Peter Parker's (PLAN-D, D8: keywords read face by face).
      expect(chars(s, peter).keywords).not.toContain("reach");
      expect(chars(s, idOf(s, "p1", "battlefield", "Spider")).keywords).toContain("reach");
      s = settle(activate(s, "p1", peter, {}, /Transform/));
      expect(chars(s, peter).name).toBe("Amazing Spider-Man");
      // All the lands are tapped except one: a tapped creature and {G}{W}{U} are needed.
      const kraven = idOf(s, "p1", "hand", "Kraven, Proud Predator");
      expect(castOption(s, "p1", kraven)?.altAvailable).toBeUndefined();
      const spider = idOf(s, "p1", "battlefield", "Spider");
      s.objects[spider]!.tapped = true;
      for (const id of s.battlefield) if (nameOf(s, id) !== "Spider" && s.objects[id]?.tapped) s.objects[id]!.tapped = false;
      expect(castOption(s, "p1", kraven)?.altAvailable).toBe(true);
      // A nonlegendary spell doesn't have Web-slinging.
      expect(castOption(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))?.altAvailable).toBeUndefined();
      s = settle(act(s, "p1", { type: "cast", card: kraven, alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Kraven, Proud Predator")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(0);
    });
  });

  describe("Urban Retreat", () => {
    it("{2}, return a tapped creature: the land goes from your hand to the battlefield, as a sorcery", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), { name: "Bear Cub", tapped: true }], hand: ["Urban Retreat"] },
      });
      const card = idOf(s, "p1", "hand", "Urban Retreat");
      s = settle(activate(s, "p1", card));
      expect(idsOf(s, "p1", "battlefield", "Urban Retreat")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      // That is not the turn's land drop.
      expect(s.turn.landsPlayed).toBe(0);
    });

    it("without a tapped creature, the ability is not offered", () => {
      const s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Urban Retreat"] } });
      expect(ability(s, "p1", idOf(s, "p1", "hand", "Urban Retreat"))).toBeUndefined();
    });
  });
});

describe("lot C1, copies and legends", () => {
  const LEGEND_SPIDER = customCard({
    name: "Test Legendary Spider",
    supertypes: ["Legendary"],
    subtypes: ["Spider"],
    power: 1,
    toughness: 1,
    manaCost: { generic: 1, colored: {}, x: 0 },
  });
  const LEGEND_HUMAN = customCard({
    name: "Test Legendary Human",
    supertypes: ["Legendary"],
    subtypes: ["Human"],
    power: 1,
    toughness: 1,
  });
  const pickName =
    (name: string): Answer =>
    (req) =>
      req.type === "name" && req.intent === "chooseOnEnter" ? [name] : undefined;
  const nextMain = (s: S) =>
    advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > s.turn.number);

  describe("Chameleon, Master of Disguise", () => {
    it("enters as a copy of one of your creatures, but keeps its name (the legend rule doesn't apply)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Kraven, Proud Predator"], hand: ["Chameleon, Master of Disguise"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven, Proud Predator");
      s = settle(cast(s, "p1", "Chameleon, Master of Disguise"), picking([kraven]));
      const chameleon = idOf(s, "p1", "battlefield", "Chameleon, Master of Disguise");
      expect(chars(s, chameleon).name).toBe("Chameleon, Master of Disguise");
      expect(pt(s, chameleon)).toEqual([chars(s, kraven).power, chars(s, kraven).toughness]);
      expect(chars(s, chameleon).supertypes).toContain("Legendary");
      expect(idsOf(s, "p1", "battlefield", "Kraven, Proud Predator")).toHaveLength(1);
    });
  });

  describe("The Clone Saga", () => {
    it("II: your next creature spell this turn is copied, and the copy isn't legendary", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "The Clone Saga", counters: { lore: 1 } }, "Forest"], hand: [LEGEND_SPIDER] },
      });
      s = settle(nextMain(s));
      expect(s.objects[idOf(s, "p1", "battlefield", "The Clone Saga")]?.counters.lore).toBe(2);
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      const spiders = idsOf(s, "p1", "battlefield", "Test Legendary Spider");
      expect(spiders).toHaveLength(2);
      const token = spiders.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, token).supertypes).not.toContain("Legendary");
    });

    it("III: a creature of the chosen name that damages a player this turn makes you draw", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "The Clone Saga", counters: { lore: 2 } }, "Bear Cub"], library: lands("Island", 10) },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number && x.pending?.kind === "choice");
      s = settle(s, pickName("Bear Cub"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }],
      });
      s = advanceUntil(s, (x) => x.turn.step === "endCombat" || x.turn.step === "main2");
      s = settle(s);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
  });

  describe("Jackal, Genius Geneticist", () => {
    it("a creature spell with mana value equal to its power is copied (nonlegendary), then Jackal gets a counter", () => {
      let s = scenario({
        p1: {
          battlefield: ["Jackal, Genius Geneticist", ...lands("Forest", 4)],
          hand: [LEGEND_SPIDER, "Bear Cub", "Llanowar Elves"],
        },
      });
      const jackal = idOf(s, "p1", "battlefield", "Jackal, Genius Geneticist");
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Spider")).toHaveLength(2);
      expect(pt(s, jackal)).toEqual([2, 2]);
      // Power 2: a spell with mana value 1 no longer triggers, a spell with mana value 2 does.
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      expect(pt(s, jackal)).toEqual([3, 3]);
    });
  });

  describe("Spider-Verse", () => {
    it("the legend rule doesn't apply to your Spiders, but still applies to other legends", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Verse", LEGEND_SPIDER, LEGEND_HUMAN, "Forest"], hand: [LEGEND_SPIDER, LEGEND_HUMAN] },
      });
      s = settle(cast(s, "p1", "Test Legendary Spider"));
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Spider")).toHaveLength(2);
      s = settle(cast(s, "p1", "Test Legendary Human"), () => undefined);
      expect(idsOf(s, "p1", "battlefield", "Test Legendary Human")).toHaveLength(1);
    });

    it("a spell cast from anywhere but hand can be copied; once each turn, but declining doesn't count", () => {
      let s = scenario({
        p1: {
          battlefield: ["Spider-Verse", ...lands("Island", 9)],
          graveyard: ["Think Twice", "Think Twice", "Think Twice"],
          library: lands("Island", 12),
        },
      });
      const decline: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
      const accept: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
      const flashback = (cur: S) => act(cur, "p1", { type: "cast", card: idOf(cur, "p1", "graveyard", "Think Twice") });
      const hand0 = s.players.p1?.hand.length ?? 0;
      s = settle(flashback(s), decline);
      expect(s.players.p1?.hand.length).toBe(hand0 + 1);
      s = settle(flashback(s), accept);
      expect(s.players.p1?.hand.length).toBe(hand0 + 3);
      // Already done this turn: no more copy.
      s = settle(flashback(s), accept);
      expect(s.players.p1?.hand.length).toBe(hand0 + 4);
    });
  });

  describe("Behold the Sinister Six!", () => {
    it("returns up to six creature cards with different names", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 7),
          hand: ["Behold the Sinister Six!"],
          graveyard: ["Bear Cub", "Bear Cub", "Serra Angel"],
        },
      });
      const [b1, b2] = idsOf(s, "p1", "graveyard", "Bear Cub") as [string, string];
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      const card = idOf(s, "p1", "hand", "Behold the Sinister Six!");
      const opt = legalActions(s, "p1").find(
        (a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card,
      );
      expect(opt?.modes[0]?.targets[0]?.group?.kind).toBe("different");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [b1, b2] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [b1, angel] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });
});

describe("lot C2, costs, amounts and players", () => {
  const ability = (s: S, player: string, source: string, label?: RegExp) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === source && (!label || label.test(a.label ?? "")),
    );
  const activate = (s: S, player: string, source: string, label?: RegExp) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source, label)?.ability ?? -1 });
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("The Soul Stone: exile a creature to exploit it; ∞ at your upkeep, a creature from your graveyard returns", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Soul Stone", ...lands("Swamp", 7), "Bear Cub"],
        graveyard: ["Serra Angel"],
        library: lands("Swamp", 5),
      },
    });
    const stone = idOf(s, "p1", "battlefield", "The Soul Stone");
    s = settle(activate(s, "p1", stone, /harness/));
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Cub")).toBe(true);
    expect(s.objects[stone]?.harnessed).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number && x.turn.step === "main1");
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("The Soul Stone: without a creature to exile, no exploit", () => {
    const s = scenario({ p1: { battlefield: ["The Soul Stone", ...lands("Swamp", 7)] } });
    expect(ability(s, "p1", idOf(s, "p1", "battlefield", "The Soul Stone"), /harness/)).toBeUndefined();
  });

  it("Iron Spider: {T} puts a counter on your artifact creatures; {2} removes two counters divided to draw", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Iron Spider, Stark Upgrade",
          { name: "Spider-Bot", counters: { "+1/+1": 1 } },
          "Bear Cub",
          ...lands("Island", 2),
        ],
        library: lands("Island", 3),
      },
    });
    const iron = idOf(s, "p1", "battlefield", "Iron Spider, Stark Upgrade");
    const bot = idOf(s, "p1", "battlefield", "Spider-Bot");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // A single counter among your artifacts: not enough.
    expect(ability(s, "p1", iron, /draw a card/)).toBeUndefined();
    s = settle(activate(s, "p1", iron, /each artifact creature/));
    expect(s.objects[iron]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bot]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", iron, /draw a card/));
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    expect((s.objects[iron]?.counters["+1/+1"] ?? 0) + (s.objects[bot]?.counters["+1/+1"] ?? 0)).toBe(1);
  });

  it("Cheering Crowd: at the beginning of each player's first main phase, they may put a counter on it and it adds {C} per counter", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Cheering Crowd", counters: { "+1/+1": 1 } }] }, turn: 1 });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "choice");
    expect(s.pending?.kind === "choice" && s.pending.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [1] });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const crowd = idOf(s, "p1", "battlefield", "Cheering Crowd");
    expect(s.objects[crowd]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p2?.manaPool.C).toBe(2);
    expect(s.players.p1?.manaPool.C ?? 0).toBe(0);
  });

  describe("Mister Negative", () => {
    it("swaps life totals with a targeted opponent; you draw as many as you lost", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Mister Negative"], library: lands("Plains", 6) },
      });
      s.players.p1!.life = 10;
      s.players.p2!.life = 7;
      const hand = (s.players.p1?.hand.length ?? 0) - 1;
      s = settle(cast(s, "p1", "Mister Negative"), yes);
      expect(s.players.p1?.life).toBe(7);
      expect(s.players.p2?.life).toBe(10);
      expect(s.players.p1?.hand.length).toBe(hand + 3);
    });

    it("if you gain life, you don't draw", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 6), "Swamp"], hand: ["Mister Negative"], library: lands("Plains", 6) },
      });
      s.players.p1!.life = 4;
      const hand = (s.players.p1?.hand.length ?? 0) - 1;
      s = settle(cast(s, "p1", "Mister Negative"), yes);
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(4);
      expect(s.players.p1?.hand.length).toBe(hand);
    });
  });

  describe("Rhino, Barreling Brute", () => {
    const attack = (s: S) => {
      let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      cur = act(cur, "p1", {
        type: "declareAttackers",
        attackers: [{ id: idOf(cur, "p1", "battlefield", "Rhino, Barreling Brute"), defender: "p2" }],
      });
      return settle(cur);
    };
    it("if it attacks after a spell with mana value 4 or more this turn: draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: ["Rhino, Barreling Brute", ...lands("Mountain", 6)],
          hand: ["Shivan Dragon"],
          library: lands("Mountain", 3),
        },
      });
      s = settle(cast(s, "p1", "Shivan Dragon"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s);
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
    it("after a spell with mana value 3 or less only: nothing", () => {
      let s = scenario({
        p1: { battlefield: ["Rhino, Barreling Brute", ...lands("Forest", 2)], hand: ["Bear Cub"], library: lands("Mountain", 3) },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s);
      expect(s.players.p1?.hand.length).toBe(hand);
    });
  });

  it("Kraven's Last Hunt: I mills five cards, then damage equal to the greatest power in your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Kraven's Last Hunt"],
        library: ["Bear Cub", "Serra Angel", "Forest", "Forest", "Llanowar Elves", "Shivan Dragon"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = settle(cast(s, "p1", "Kraven's Last Hunt"), picking([dragon]));
    expect(s.players.p1?.graveyard).toHaveLength(5);
    // Serra Angel (4) is the strongest of the milled cards; the Shivan Dragon left in the library doesn't count.
    expect(s.objects[dragon]?.damage).toBe(4);
  });

  describe("Kraven the Hunter", () => {
    it("the opposing creature with the greatest power dies: draw a card and a counter; not for a smaller one", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven the Hunter"], library: lands("Swamp", 4) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const kraven = idOf(s, "p1", "battlefield", "Kraven the Hunter");
      const hand = s.players.p1?.hand.length ?? 0;
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // The Serra Angel is stronger: nothing triggers.
      expect(s.triggers).toHaveLength(0);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = settle(passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0));
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      expect(s.objects[kraven]?.counters["+1/+1"]).toBe(1);
    });

    it("died at the same time: only the greatest counts (the others are seen by their last known information)", () => {
      let s = scenario({
        p1: { battlefield: ["Kraven the Hunter"], library: lands("Swamp", 4) },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Llanowar Elves"] },
      });
      const hand = s.players.p1?.hand.length ?? 0;
      for (const name of ["Bear Cub", "Serra Angel", "Llanowar Elves"]) destroy(s, idOf(s, "p2", "battlefield", name));
      s = settle(passAccepting(s, (x) => x.triggers.length === 0 && x.stack.length === 0));
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });
  });
});

describe("lot C3, unique cards", () => {
  const playable = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => (a.type === "cast" || a.type === "playLand") && a.card === card);
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Arachne: the type chosen on entering (not creature) costs {1} more for all players", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Arachne, Psionic Weaver", "Lightning Strike"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Arachne, Psionic Weaver"), (req) =>
      req.type === "pick" && req.intent === "chooseOnEnter" ? ["Instant"] : undefined,
    );
    const arachne = idOf(s, "p1", "battlefield", "Arachne, Psionic Weaver");
    expect(s.objects[arachne]?.chosen?.mode).toBe("Instant");
    expect(legalActions(s, "p1").some((o) => o.type === "cast" && o.card === idOf(s, "p1", "hand", "Lightning Strike"))).toBe(
      false,
    );
    // Two Mountains are no longer enough for the opponent {1}{R} + {1}.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castable(s, "p2", idOf(s, "p2", "hand", "Lightning Strike"))).toBe(false);
  });

  it('Arachne (PLAN-H H9): the "on entering" question offers the card types other than creature', () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Arachne, Psionic Weaver"] } });
    s = passAccepting(cast(s, "p1", "Arachne, Psionic Weaver"), (x) => x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.prompt).toBe("Choose a card type");
    expect(req?.type === "pick" && req.options).not.toContain("Creature");
    expect(req?.labels?.Instant).toBe("Instant");
  });

  describe("With Great Power . . .", () => {
    it("+2/+2 for each Aura and Equipment attached to the creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["With Great Power . . ."] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "With Great Power . . .", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 4]);
    });

    it("damage that would be dealt to you is dealt to the enchanted creature instead", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Serra Angel"], hand: ["With Great Power . . ."] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "With Great Power . . .", { targets: { enchant: [angel] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[angel]?.damage).toBe(3);
    });
  });

  describe("Spider-Punk", () => {
    it("your other Spiders have riot: counter or haste, your choice as the spell resolves", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Punk", ...lands("Forest", 4)], hand: ["Radioactive Spider", "Radioactive Spider"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Spider-Punk")).keywords).toContain("riot");
      const pick =
        (v: string): Answer =>
        (req) =>
          req.type === "pick" && req.options.includes("haste") ? [v] : undefined;
      s = settle(cast(s, "p1", "Radioactive Spider"), pick("counter"));
      s = settle(cast(s, "p1", "Radioactive Spider"), pick("haste"));
      const [a, b] = idsOf(s, "p1", "battlefield", "Radioactive Spider") as [string, string];
      expect(s.objects[a]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, a).keywords).not.toContain("haste");
      expect(s.objects[b]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, b).keywords).toContain("haste");
    });

    it("spells and abilities can't be countered, for all players", () => {
      let s = scenario({
        p1: { battlefield: ["Spider-Punk", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island", "Island", "Island"], hand: ["Spider-Sense"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      s = settle(
        act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Spider-Sense"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      expect(s.players.p2?.life).toBe(17);
    });
  });

  it("Superior Foes of Spider-Man: the exiled card stays playable until another is exiled this way", () => {
    let s = scenario({
      p1: {
        battlefield: ["Superior Foes of Spider-Man", ...lands("Plains", 10)],
        hand: ["Serra Angel", "Serra Angel"],
        library: ["Forest", "Island", "Swamp"],
      },
    });
    s = settle(cast(s, "p1", "Serra Angel"), yes);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(playable(s, "p1", forest)).toBe(true);
    s = settle(cast(s, "p1", "Serra Angel"), yes);
    const island = s.exile.find((id) => nameOf(s, id) === "Island") as string;
    expect(playable(s, "p1", island)).toBe(true);
    expect(playable(s, "p1", forest)).toBe(false);
  });

  it("Black Cat: two of the top nine cards of an opponent's library exiled, playable with mana of any type", () => {
    const lib = [
      "Lightning Strike",
      "Opt",
      "Bear Cub",
      "Mountain",
      "Island",
      "Swamp",
      "Forest",
      "Plains",
      "Island",
      "Shivan Dragon",
    ];
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Plains", "Plains"], hand: ["Black Cat, Cunning Thief"] },
      p2: { library: lib },
    });
    const wanted = (s.players.p2?.library ?? []).filter((id) => ["Lightning Strike", "Opt"].includes(nameOf(s, id) ?? ""));
    s = settle(cast(s, "p1", "Black Cat, Cunning Thief"), (req) =>
      req.type === "pick" && req.intent === "lookAtTop" ? wanted : undefined,
    );
    const strike = s.exile.find((id) => nameOf(s, id) === "Lightning Strike") as string;
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
    expect(s.players.p2?.library).toHaveLength(8);
    // The tenth (Shivan Dragon) stays on top; the other seven go to the bottom.
    expect(nameOf(s, s.players.p2?.library[0] as string)).toBe("Shivan Dragon");
    // Deux Plaines payent {1}{R} : mana de n'importe quel type.
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Gwenom: when attacking, the cards on top of your library can be played; a spell is paid with life equal to its mana value", () => {
    let s = scenario({ p1: { battlefield: ["Gwenom, Remorseless"], library: ["Serra Angel", "Forest", "Island"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Gwenom, Remorseless"), defender: "p2" }],
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    const angel = s.players.p1?.library[0] as string;
    expect(nameOf(s, angel)).toBe("Serra Angel");
    expect(playable(s, "p1", angel)).toBe(true);
    // Lifelink: 4 damage, +4 life; the Serra Angel costs 5 life.
    const life = s.players.p1?.life ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: angel }));
    expect(s.players.p1?.life).toBe(life - 5);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    const forest = s.players.p1?.library[0] as string;
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });
});

describe("Marvel's Spider-Man, PLAN-D D9: last cards", () => {
  it("Raging Goblinoids: 5/4, haste; mayhem {2}{R} from the graveyard only if it was discarded this turn", () => {
    // In the graveyard without having been discarded this turn: no mayhem.
    const stale = scenario({ p1: { battlefield: lands("Mountain", 3), graveyard: ["Raging Goblinoids"] } });
    expect(castable(stale, "p1", idOf(stale, "p1", "graveyard", "Raging Goblinoids"))).toBe(false);

    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["Romantic Rendezvous", "Raging Goblinoids"], library: lands("Island", 5) },
    });
    const goblinoids = idOf(s, "p1", "hand", "Raging Goblinoids");
    s = settle(cast(s, "p1", "Romantic Rendezvous"), picking([goblinoids]));
    const inGy = idOf(s, "p1", "graveyard", "Raging Goblinoids");
    s = settle(act(s, "p1", { type: "cast", card: inGy }));
    const id = idOf(s, "p1", "battlefield", "Raging Goblinoids");
    expect(pt(s, id)).toEqual([5, 4]);
    // Two Mountains for Romantic Rendezvous, three for mayhem {2}{R}.
    expect(s.battlefield.filter((x) => s.objects[x]?.tapped)).toHaveLength(5);
    // Haste: it attacks the turn it enters.
    expect(chars(s, id).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(15);
  });
});
