/**
 * Commander (EDH pseudo-set): rules tests for the "The Fantastic Four" precon (Marvel Super Heroes).
 * Heroes who awaken after a noncreature spell, control returned to owners, legend rule lifted,
 * copies, equipping a commander, spell put on the bottom of the library.
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { moveObject, random } from "../src/state";
import { attackableDefenders } from "../src/turn";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attackPlayer,
  castable,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  scenario,
  settle,
  steal,
  throughCombat,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const toCombat = (s: GameState) =>
  advanceUntil(
    s,
    (x) =>
      x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0 || x.pending?.kind === "priority"),
    50,
  );

describe("The Fantastic Four (EDH)", () => {
  it("Invisible Woman: after a noncreature spell, a 0/3 Wall at the beginning of combat; nothing without one", () => {
    let s = scenario({ p1: { battlefield: ["Invisible Woman", "Island"], hand: ["Opt"], library: lands("Island", 3) } });
    s = settle(castIt(s, "p1", "Opt"));
    s = settle(toCombat(s));
    expect(tokens(s, "p1", "Wall")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Invisible Woman"] } });
    t = settle(toCombat(t));
    expect(tokens(t, "p1", "Wall")).toHaveLength(0);
  });

  it("Alicia Masters: at your end step, each player takes back the creatures they own", () => {
    let s = scenario({ p1: { battlefield: ["Alicia Masters, Skilled Sculptor"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = steal(s, bear, "p1");
    expect(s.objects[bear]?.controller).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 100);
    expect(s.objects[bear]?.controller).toBe("p2");
  });

  it("Council of Reeds: the legend rule doesn't apply to your creatures; a copy after a noncreature spell", () => {
    let s = scenario({ p1: { battlefield: ["Council of Reeds", "Island"], hand: ["Opt"], library: lands("Island", 3) } });
    s = settle(castIt(s, "p1", "Opt"));
    s = settle(toCombat(s));
    expect(onField(s, "p1", "Council of Reeds")).toBe(2);
  });

  it("Crystal: a noncreature spell deals as much damage as it has colors to each opponent", () => {
    let s = scenario({
      p1: { battlefield: ["Crystal, Inhuman Princess", "Plains", "Swamp", "Island"], hand: ["Vindicate"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.players.p2?.life).toBe(18);
  });

  it("Dragon Man: power equal to the highest mana value among your permanents and noncreature cards", () => {
    const s = scenario({
      p1: { battlefield: ["Dragon Man, Reformed Robot", "Sol Ring"], graveyard: ["Vindicate", "Gigantosaurus"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragon Man, Reformed Robot")).power).toBe(3);
  });

  it("Valeria Richards: your noncreature spells cost {1} less; the first one draws a card", () => {
    let s = scenario({
      p1: { battlefield: ["Valeria Richards, Precocious", "Swamp", "Plains"], hand: ["Vindicate"], library: lands("Island", 3) },
      p2: { battlefield: ["Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Vindicate");
    expect(castable(s, "p1", card)).toBe(true);
    const h = hand(s, "p1");
    s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(hand(s, "p1")).toBe(h - 1 + 1);
  });

  it("Monologue Tax: an opponent's second spell in a turn creates a Treasure", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Monologue Tax"] },
      p2: { battlefield: lands("Island", 2), hand: ["Opt", "Opt"], library: lands("Island", 4) },
    });
    s = settle(castIt(s, "p2", "Opt"));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
    s = settle(castIt(s, "p2", "Opt"));
    expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
  });

  it("Nova Flame: X counters on your creature, which damages each other creature equal to its power", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 5), "Bear Cub"], hand: ["Nova Flame"] },
      p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castIt(s, "p1", "Nova Flame", { x: 1, targets: { t: [bear] } }));
    // 3/3: Savannah Lions dies, Serra Angel (4/4) survives; the Bear is not damaged.
    expect([onField(s, "p2", "Savannah Lions"), onField(s, "p2", "Serra Angel"), s.objects[bear]?.damage]).toEqual([0, 1, 0]);
  });

  it("Tragic Arrogance: each player keeps one permanent of each type; lands stay", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Tragic Arrogance"] },
      p2: { battlefield: ["Bear Cub", "Savannah Lions", "Forest", "Forest", "Sol Ring", "Arcane Signet"] },
    });
    s = settle(castIt(s, "p1", "Tragic Arrogance"));
    expect(onField(s, "p2", "Forest")).toBe(2);
    expect(onField(s, "p2", "Bear Cub") + onField(s, "p2", "Savannah Lions")).toBe(1);
    expect(onField(s, "p2", "Sol Ring") + onField(s, "p2", "Arcane Signet")).toBe(1);
    expect(onField(s, "p1", "Plains")).toBe(5);
  });

  it("Tragic Arrogance with three players: you choose for each player, then all sacrifice at the same time", () => {
    // Oracle: "For each player, you choose from among the permanents that player controls an artifact, a creature, an
    // enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control. »
    const vault = customCard({ name: "Test Vault", typeLine: "Artifact Land", types: ["Artifact", "Land"] });
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Savannah Lions"], hand: ["Tragic Arrogance"] },
      p2: { battlefield: [vault, "Sol Ring", "Arcane Signet", "Serra Angel", "Bear Cub"] },
      p3: { battlefield: ["Adaptive Automaton", "Arcane Signet", "Llanowar Elves"] },
    });
    const field = s.battlefield.length;
    const asked: string[] = [];
    // p2: the artifact land as an artifact (their real artifacts are sacrificed); p3: the artifact creature twice.
    const want = ["Savannah Lions", "Test Vault", "Bear Cub", "Adaptive Automaton"];
    s = settle(castIt(s, "p1", "Tragic Arrogance"), (req, p, cur) => {
      if (req.type !== "pick" || req.intent !== "keepPerType" || !cur) return undefined;
      // No permanent is sacrificed before the choices are over.
      expect(cur.battlefield.length).toBe(field);
      const owner = cur.objects[req.options[0] as string]?.controller;
      asked.push(`${p}:${owner}`);
      const name = want.find((w) => req.options.some((id) => nameOf(cur, id) === w));
      return req.options.filter((id) => nameOf(cur, id) === name).slice(0, 1);
    });
    expect(asked).toEqual(["p1:p1", "p1:p2", "p1:p2", "p1:p3", "p1:p3"]);
    expect([onField(s, "p1", "Savannah Lions"), onField(s, "p1", "Bear Cub"), onField(s, "p1", "Plains")]).toEqual([1, 0, 5]);
    expect(onField(s, "p2", "Test Vault") + onField(s, "p2", "Bear Cub")).toBe(2);
    expect(onField(s, "p2", "Sol Ring") + onField(s, "p2", "Arcane Signet") + onField(s, "p2", "Serra Angel")).toBe(0);
    expect([
      onField(s, "p3", "Adaptive Automaton"),
      onField(s, "p3", "Arcane Signet"),
      onField(s, "p3", "Llanowar Elves"),
    ]).toEqual([1, 0, 0]);
  });

  it("Ultimate Nullification: sacrifice a legendary creature; exile creatures and graveyards; to the bottom of the library", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Invisible Woman"], hand: ["Ultimate Nullification"], graveyard: ["Opt"] },
      p2: { battlefield: ["Serra Angel"], graveyard: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Ultimate Nullification", { sacrifice: [idOf(s, "p1", "battlefield", "Invisible Woman")] }));
    // Invisible Woman, sacrificed as a cost, is exiled with the graveyards; the spell ends up on the bottom of the library.
    expect([onField(s, "p2", "Serra Angel"), s.players.p2?.graveyard.length, s.players.p1?.graveyard.length]).toEqual([0, 0, 0]);
    const lib = s.players.p1?.library ?? [];
    expect(nameOf(s, lib[lib.length - 1] ?? "")).toBe("Ultimate Nullification");
  });

  it('Unstable Molecule Suit: "Equip commander {2}" only targets a commander', () => {
    const s = scenario({ p1: { battlefield: ["Unstable Molecule Suit", "Bear Cub", ...lands("Plains", 4)] } });
    const suit = idOf(s, "p1", "battlefield", "Unstable Molecule Suit");
    const labels = legalActions(s, "p1")
      .filter((a) => a.type === "activate" && a.source === suit)
      .map((a) => (a.type === "activate" ? a.label : ""));
    // No commander in play: only the {4} option is offered.
    expect(labels.some((l) => l?.includes("commandant"))).toBe(false);
    expect(labels.some((l) => l?.includes("{4}"))).toBe(true);
  });
});

describe("The Fantastic Four: approximations lifted (PLAN-H, H2c)", () => {
  it("Black Bolt: targeted by an opponent, it destroys a nonland permanent of THAT player (not of another opponent)", () => {
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Black Bolt, Inhuman King"] },
      p2: { battlefield: ["Mountain", "Bear Cub", "Serra Angel"], hand: ["Shock"] },
      p3: { battlefield: ["Llanowar Elves"] },
    });
    const bolt = idOf(s, "p1", "battlefield", "Black Bolt, Inhuman King");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [bolt] } });
    const offered: (string | undefined)[][] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "triggerTarget") return undefined;
      offered.push(namesIn(cur, req.options));
      return req.options.filter((id) => nameOf(cur, String(id)) === "Bear Cub");
    });
    // The nonland permanents of the player who targeted Black Bolt, not those of p3.
    expect(offered.map((x) => [...x].sort())).toEqual([["Bear Cub", "Serra Angel"]]);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p3", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it("Namor: it attacks a player with more life than you -> +2/+0 to your other attackers; another opponent doesn't count", () => {
    const run = (defender: "p2" | "p3") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Namor, Atlantean King", "Bear Cub"] },
        p2: { life: 25 },
        p3: { life: 15 },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attackPlayer(s, [idOf(s, "p1", "battlefield", "Namor, Atlantean King"), cub], defender));
      return chars(s, cub).power;
    };
    expect(run("p2")).toBe(4);
    // p3 has less life than you: no bonus, even if p2 has more.
    expect(run("p3")).toBe(2);
  });

  it("Namor killed in response to his attack trigger: your other creatures attacking that player still get +2/+0 (508.5)", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Namor, Atlantean King", "Bear Cub"] }, p2: { life: 25 } });
    const namor = idOf(s, "p1", "battlefield", "Namor, Atlantean King");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attackPlayer(s, [namor, cub], "p2");
    s = advanceUntil(s, (x) => x.stack.length > 0 && x.pending?.kind === "priority");
    destroy(s, namor);
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Namor, Atlantean King")).toHaveLength(0);
    expect(chars(s, cub).power).toBe(4);
  });

  it("Negative Zone Portal: coin flip lost, it is sacrificed and a card exiled with it, chosen at random, returns to hand", () => {
    const names = ["Bear Cub", "Llanowar Elves", "Serra Angel", "Shivan Dragon"];
    const start = () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Negative Zone Portal"] }, p2: { graveyard: names } });
      const portal = s.objects[idOf(s, "p1", "battlefield", "Negative Zone Portal")];
      const exiledCards = names.map((n) => moveObject(s, idOf(s, "p2", "graveyard", n), "exile") as string);
      if (portal) portal.linked = exiledCards;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.stack.length > 0);
      return s;
    };
    // Generator states where the flip is lost; the returned card varies with the draw.
    const losing = Array.from({ length: 200 }, (_, r) => r).filter((r) => random({ rng: r } as unknown as GameState) >= 0.5);
    const returned = new Set<string | undefined>();
    for (const r of losing.slice(0, 12)) {
      let s = start();
      s.rng = r;
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Negative Zone Portal")).toHaveLength(0);
      const hand = namesIn(s, s.players.p2?.hand).filter((n) => names.includes(n ?? ""));
      expect(hand).toHaveLength(1);
      returned.add(hand[0]);
    }
    expect(returned.size).toBeGreaterThan(1);
  });
});

describe("The Fantastic Four (EDH): goad and attack requirements (PLAN-H, lot H3)", () => {
  const declare = (s: GameState, p: PlayerId, attackers: { id: string; defender: string }[]) =>
    act(s, p, { type: "declareAttackers", attackers });
  const toAttacks = (s: GameState, p: PlayerId) =>
    advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === p);

  it("Taunt from the Rampart: opposing creatures goaded, which can't block, until your next turn", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Taunt from the Rampart"] },
      p2: { battlefield: ["Bear Cub"] },
      p3: { battlefield: ["Savannah Lions"] },
    });
    s = settle(castIt(s, "p1", "Taunt from the Rampart"));
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const lions = idOf(s, "p3", "battlefield", "Savannah Lions");
    expect(chars(s, lions).keywords).toContain("cantBlock");
    s = toAttacks(s, "p2");
    expect(() => declare(s, "p2", [])).toThrow();
    // Goaded by p1: a player other than p1 if possible.
    expect(() => declare(s, "p2", [{ id: bear, defender: "p1" }])).toThrow();
    s = declare(s, "p2", [{ id: bear, defender: "p3" }]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
    expect(chars(s, lions).keywords).not.toContain("cantBlock");
  });

  it("Galactus: it attacks each combat an opponent with the most life, except with Silver Surfer", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Galactus, Devourer of Worlds"] },
      p2: { life: 25 },
      p3: { life: 30 },
    });
    const galactus = idOf(s, "p1", "battlefield", "Galactus, Devourer of Worlds");
    s = toAttacks(s, "p1");
    expect(() => declare(s, "p1", [])).toThrow();
    expect(() => declare(s, "p1", [{ id: galactus, defender: "p2" }])).toThrow();
    expect(() => declare(s, "p1", [{ id: galactus, defender: "p3" }])).not.toThrow();
    // Tie: either one.
    let tie = scenario({ players: 3, p1: { battlefield: ["Galactus, Devourer of Worlds"] } });
    tie = toAttacks(tie, "p1");
    expect(() => declare(tie, "p1", [{ id: galactus, defender: "p2" }])).not.toThrow();
    expect(() => declare(tie, "p1", [{ id: galactus, defender: "p3" }])).not.toThrow();
    let surfer = scenario({
      players: 3,
      p1: { battlefield: ["Galactus, Devourer of Worlds", "Silver Surfer, Galactus's Herald"] },
      p3: { life: 30 },
    });
    surfer = toAttacks(surfer, "p1");
    expect(() => declare(surfer, "p1", [])).not.toThrow();
  });

  it("Silver Surfer: the targeted creature attacks the damaged player each combat if able, until the end of your next turn", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Silver Surfer, Galactus's Herald"] },
      p3: { battlefield: ["Bear Cub"] },
    });
    const surfer = idOf(s, "p1", "battlefield", "Silver Surfer, Galactus's Herald");
    const bear = idOf(s, "p3", "battlefield", "Bear Cub");
    s = attackPlayer(s, [surfer], "p2");
    s = throughCombat(s, (req) => (req.type === "pick" && req.intent === "triggerTarget" ? [bear] : undefined));
    expect(s.players.p2?.life).toBe(16);
    expect(chars(s, bear).blockRules.map((r) => r.mustAttackPlayer)).toEqual(["p2"]);
    s = toAttacks(s, "p3");
    expect(() => declare(s, "p3", [])).toThrow();
    expect(() => declare(s, "p3", [{ id: bear, defender: "p1" }])).toThrow();
    s = declare(s, "p3", [{ id: bear, defender: "p2" }]);
    // During p1's next turn, still in effect; after that, nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main2");
    expect(chars(s, bear).blockRules).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it("Namor, Atlantean King: only your other creatures attacking that player get +2/+0; nothing against a planeswalker", () => {
    const run = (namorAt: "p2" | "walker") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Namor, Atlantean King", "Bear Cub", "Llanowar Elves"], life: 10 },
        p2: { battlefield: ["Ajani Resolute"] },
      });
      const [namor, bear, elves] = ["Namor, Atlantean King", "Bear Cub", "Llanowar Elves"].map((n) =>
        idOf(s, "p1", "battlefield", n),
      );
      const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: namor as string, defender: namorAt === "walker" ? walker : "p2" },
          { id: bear as string, defender: "p2" },
          { id: elves as string, defender: "p3" },
        ],
      });
      s = settle(s);
      return [bear, elves].map((id) => chars(s, id as string).power);
    };
    expect(run("p2")).toEqual([4, 1]);
    expect(run("walker")).toEqual([2, 1]);
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("Willie Lumpkin, Postman: the player who draws can't attack you or your permanents during their next turn, and only then", () => {
    let s = scenario({
      players: 4,
      p1: { battlefield: ["Willie Lumpkin, Postman"], library: lands("Forest", 3) },
      p3: { library: lands("Forest", 3) },
    });
    const willie = idOf(s, "p1", "battlefield", "Willie Lumpkin, Postman");
    s = throughCombat(attackPlayer(s, [willie], "p3"), (req) => (req.intent === "may" ? [1] : undefined));
    expect(hand(s, "p3")).toBe(1);
    // The effect lasts through p3's next turn (not until p1's next turn).
    const effect = s.playerEffects.find((e) => e.player === "p3" && e.ability.cantAttack);
    expect(effect?.ability.cantAttack?.of).toBe("p1");
    expect(effect?.until).toBe(s.turn.number + 2);
    s = advanceUntil(s, (x) => x.turn.active === "p3");
    expect(attackableDefenders(s, "p3")).toEqual(["p4", "p2"]);
    // Over once p3's turn is: not still running during p4's turn.
    s = advanceUntil(s, (x) => x.turn.active === "p4");
    expect(s.playerEffects.some((e) => e.player === "p3" && e.ability.cantAttack)).toBe(false);
  });

  it("Cut a Deal: you draw a card for each opponent who actually drew one (empty library, draw replaced)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Plains", 3), hand: ["Cut a Deal"], library: lands("Plains", 3) },
      p2: { library: [] },
      p3: { library: lands("Island", 2) },
    });
    s = settle(castIt(s, "p1", "Cut a Deal"));
    expect([hand(s, "p1"), hand(s, "p3")]).toEqual([1, 1]);
    // Notion Thief replaces each opponent's draw: none of them drew, you only draw the stolen cards.
    let t = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Notion Thief"], hand: ["Cut a Deal"], library: lands("Plains", 3) },
      p2: { library: lands("Island", 2) },
    });
    t = settle(castIt(t, "p1", "Cut a Deal"));
    expect([hand(t, "p1"), hand(t, "p2")]).toEqual([1, 0]);
  });
});
