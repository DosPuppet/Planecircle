/**
 * Outlaws of Thunder Junction, lot A: plot (702.170), spree (702.172), crimes (700.13), ability counters (122.1b),
 * fast lands.
 */
import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { fx, ref, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { chars, moveObject, random } from "../src/state";
import { plainText } from "../src/text";
import { declareAttackers, declareBlockers } from "../src/turn";
import type { ChoiceRequest, ChoiceValue, GameState, PlayerId, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  attackPlayer,
  canActivate,
  cast,
  castable,
  castNowOf,
  combatTargetsOffered,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  stepTrail,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const abilityIndex = (s: S, id: string, label: string) =>
  (s.defs[s.objects[id]?.defId ?? ""]?.abilities ?? []).findIndex(
    (a) => a.kind === "activated" && plainText(a.label ?? "").startsWith(label),
  );

/** Crimes committed by p1 this turn (turn log). */
const crimesOf = (s: GameState) => s.turnLog.filter((e) => e.e === "crime" && e.player === "p1").length;
describe("Outlaws of Thunder Junction", () => {
  it("plot: special action from hand, then free cast on a later turn, at sorcery timing", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Djinn of Fool's Fall"] } });
    const djinn = idOf(s, "p1", "hand", "Djinn of Fool's Fall");
    s = act(s, "p1", { type: "activate", source: djinn, ability: abilityIndex(s, djinn, "Plot") });
    // Special action: no stack, the card is exiled and plotted.
    expect(s.stack).toHaveLength(0);
    const plotted = s.exile.find((id) => s.objects[id]?.exiledVia?.kind === "plot") as string;
    expect(plotted).toBeDefined();
    // Not this turn.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === plotted)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const cast = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === plotted);
    expect(cast?.type === "cast" && cast.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: plotted });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Djinn of Fool's Fall")).toHaveLength(1);
    expect(s.players.p1?.manaPool.U ?? 0).toBe(0);
  });

  it("spree: the costs of the chosen modes add up; a mode that is too expensive is not offered", () => {
    const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Trash the Town"] }, p2: { battlefield: ["Bear Cub"] } });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const labels = opt?.type === "cast" ? opt.modes.map((m) => plainText(m.label ?? "")) : [];
    // {G} + {2} + {1} = 4 mana for two modes, 5 for all three: only 3 Forests.
    expect(labels).toContain("Two +1/+1 counters");
    expect(labels).toContain("Trample + Combat damage: draw two cards");
    expect(labels).not.toContain("Two +1/+1 counters + Trample + Combat damage: draw two cards");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Two +1/+1 counters") : undefined;
    let t = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Trash the Town"),
      mode: mode?.index,
      targets: { a: [bear] },
    });
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(3);
    t = passBoth(t);
    expect(t.objects[bear]?.counters["+1/+1"]).toBe(2);
  });

  it('crime: targeting an opponent or something they control triggers "whenever you commit a crime"', () => {
    let s = scenario({
      p1: { battlefield: ["Blood Hustler", ...lands("Mountain", 2)], hand: ["Scorching Shot"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const hustler = idOf(s, "p1", "battlefield", "Blood Hustler");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Scorching Shot"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    expect(crimesOf(s)).toBe(1);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[hustler]?.counters["+1/+1"]).toBe(1);
    // Targeting your own creature is not a crime.
    let t = scenario({ p1: { battlefield: ["Omenport Vigilante", ...lands("Mountain", 2)], hand: ["Scorching Shot"] } });
    const vig = idOf(t, "p1", "battlefield", "Omenport Vigilante");
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Scorching Shot"), targets: { t: [vig] } });
    expect(crimesOf(t)).toBe(0);
    expect(chars(t, vig).keywords).not.toContain("doubleStrike");
  });

  it("ability counters: a deathtouch counter gives deathtouch (Vraska Joins Up)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 1), ...lands("Forest", 1)], hand: ["Vraska Joins Up"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vraska Joins Up") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("deathtouch");
  });

  it("fast lands: untapped with two or fewer other lands, tapped beyond that", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Blooming Marsh"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Blooming Marsh") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Blooming Marsh"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Blooming Marsh") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Blooming Marsh")]?.tapped).toBe(true);
  });

  it('"when this card becomes plotted" triggers from exile (Longhorn Sharpshooter)', () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Longhorn Sharpshooter"] } });
    const card = idOf(s, "p1", "hand", "Longhorn Sharpshooter");
    s = act(s, "p1", { type: "activate", source: card, ability: abilityIndex(s, card, "Plot") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.life).toBe(18);
  });

  it("Archangel of Tithes: attacking costs {1} per creature", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => declareAttackers(s, "p1", [{ id: bear, defender: "p2" }])).toThrow();
    const t = scenario({
      p1: { battlefield: ["Bear Cub", "Plains"] },
      p2: { battlefield: ["Archangel of Tithes"] },
      step: "declareAttackers",
    });
    declareAttackers(t, "p1", [{ id: idOf(t, "p1", "battlefield", "Bear Cub"), defender: "p2" }]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("High Noon: only one spell per player each turn", () => {
    let s = scenario({
      p1: { battlefield: ["High Noon", ...lands("Mountain", 4)], hand: ["Scorching Shot", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(legalActions(s, "p1").some((a) => a.type === "cast")).toBe(false);
  });

  it("Double Down: the copy of an outlaw creature spell becomes a token", () => {
    let s = scenario({ p1: { battlefield: ["Double Down", ...lands("Swamp", 3)], hand: ["Vault Plunderer"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vault Plunderer") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Vault Plunderer")).toHaveLength(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
  });

  it("Terror of the Peaks: an opposing spell that targets it costs 3 more life", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Terror of the Peaks"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Terror of the Peaks")] },
    });
    expect(s.players.p1?.life).toBe(17);
  });

  it("Step Between Worlds is exiled as it resolves; Magebane Lizard damages the caster", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Step Between Worlds"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Step Between Worlds") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Step Between Worlds")).toBe(true);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      p2: { battlefield: ["Magebane Lizard"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    t = passAccepting(t, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.life).toBe(19);
  });

  it("The Big Score : Rest in Peace, Grand Abolisher, Torpor Orb, Worldwalker Helm", () => {
    let s = scenario({
      p1: { battlefield: ["Rest in Peace", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = passBoth(s);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    // Grand Abolisher: during p1's turn, p2 casts nothing.
    const t = scenario({
      p1: { battlefield: ["Grand Abolisher"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    expect(legalActions(t, "p2").some((a) => a.type === "cast")).toBe(false);
    // Torpor Orb: a creature entering triggers nothing.
    let u = scenario({ p1: { battlefield: ["Torpor Orb", ...lands("Plains", 3)], hand: ["Holy Cow"] } });
    u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Holy Cow") });
    u = passBoth(u);
    expect(u.players.p1?.life).toBe(20);
    // Worldwalker Helm: a Treasure comes with a Clue.
    let v = scenario({ p1: { battlefield: ["Worldwalker Helm", "Treasure Dredger", ...lands("Swamp", 1)] } });
    const dredger = idOf(v, "p1", "battlefield", "Treasure Dredger");
    v = act(v, "p1", { type: "activate", source: dredger, ability: 0 });
    v = passBoth(v);
    expect(idsOf(v, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(idsOf(v, "p1", "battlefield", "Map")).toHaveLength(1);
  });
});

describe("Outlaws of Thunder Junction: amounts on entering", () => {
  it("Sheriff of Safe Passage: a +1/+1 counter plus one for each other creature you control", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", "Plains", "Plains", "Plains"], hand: ["Sheriff of Safe Passage"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sheriff of Safe Passage") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    const sheriff = idOf(s, "p1", "battlefield", "Sheriff of Safe Passage");
    expect(s.objects[sheriff]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, sheriff).power).toBe(3);
  });
});

describe("Outlaws of Thunder Junction: meta cards checked against their Oracle text (PLAN-C, lot C13)", () => {
  /** Index of the mode (or the combination of modes of a spree spell) whose label is `label`. */
  const modeOf = (s: S, name: string, label: string) => {
    const card = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    if (!mode) throw new Error(`mode "${label}" not found for ${name}`);
    return mode.index;
  };
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);

  it("Inspiring Vantage, Spirebluff Canal, Concealed Courtyard: untapped with two or fewer other lands; two colors", () => {
    const fast: [string, string[]][] = [
      ["Inspiring Vantage", ["R", "W"]],
      ["Spirebluff Canal", ["U", "R"]],
      ["Concealed Courtyard", ["W", "B"]],
    ];
    for (const [name, colors] of fast) {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [name] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
      const land = idOf(s, "p1", "battlefield", name);
      expect(s.objects[land]?.tapped, name).toBe(false);
      const produced = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === land ? a.colors : []));
      expect([...produced].sort(), name).toEqual([...colors].sort());
      let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [name] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", name) });
      expect(t.objects[idOf(t, "p1", "battlefield", name)]?.tapped, name).toBe(true);
    }
  });

  it("Shoot the Sheriff: destroys a creature that is not an outlaw", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Shoot the Sheriff"] },
      p2: { battlefield: ["Bear Cub", "Forsaken Miner"] },
    });
    // Forsaken Miner is a Rogue: an outlaw, not a target.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Shoot the Sheriff"),
        targets: { t: [idOf(s, "p2", "battlefield", "Forsaken Miner")] },
      }),
    ).toThrow();
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shoot the Sheriff"), targets: { t: [cub] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Three Steps Ahead: counters a spell; token copy of a creature you control; draw two then discard one", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Three Steps Ahead"], library: lands("Forest", 3) },
    });
    const mode = modeOf(s, "Three Steps Ahead", "Token copy + Draw two, discard one");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Three Steps Ahead"),
      mode,
      targets: { c: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    const cubs = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(cubs).toHaveLength(2);
    expect(cubs.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    // "Counter" mode on an opposing spell.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Three Steps Ahead"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    const spell = t.stack[0]?.id as string;
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Three Steps Ahead"),
      mode: modeOf(t, "Three Steps Ahead", "Counter a spell"),
      targets: { s: [spell] },
    });
    t = settle(t);
    expect(t.players.p1?.life).toBe(20);
    expect(idsOf(t, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
  });

  it("Doc Aurlock, Grizzled Genius: spells from the graveyard or exile and plot cost {2} less", () => {
    // Think Twice: flashback {2}{U}, so {U} with Doc Aurlock.
    const withDoc = scenario({ p1: { battlefield: ["Doc Aurlock, Grizzled Genius", "Island"], graveyard: ["Think Twice"] } });
    expect(castable(withDoc, "p1", idOf(withDoc, "p1", "graveyard", "Think Twice"))).toBe(true);
    const without = scenario({ p1: { battlefield: ["Island"], graveyard: ["Think Twice"] } });
    expect(castable(without, "p1", idOf(without, "p1", "graveyard", "Think Twice"))).toBe(false);
    // Longhorn Sharpshooter: plot {3}{R}, so {1}{R}.
    let s = scenario({
      p1: { battlefield: ["Doc Aurlock, Grizzled Genius", ...lands("Mountain", 2)], hand: ["Longhorn Sharpshooter"] },
    });
    const card = idOf(s, "p1", "hand", "Longhorn Sharpshooter");
    const plot = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
    expect(plot).toBeDefined();
    s = act(s, "p1", { type: "activate", source: card, ability: plot?.type === "activate" ? plot.ability : -1 });
    expect(s.exile.some((id) => nameOf(s, id) === "Longhorn Sharpshooter" && s.objects[id]?.exiledVia?.kind === "plot")).toBe(
      true,
    );
    const noDoc = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Longhorn Sharpshooter"] } });
    expect(canActivate(noDoc, "p1", idOf(noDoc, "p1", "hand", "Longhorn Sharpshooter"))).toBe(false);
  });

  it("Requisition Raid: destroys an artifact and puts a +1/+1 counter on each creature of a targeted player", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 3)], hand: ["Requisition Raid"] },
      p2: { battlefield: ["Ghost Vacuum", "Shivan Dragon"] },
    });
    const vacuum = idOf(s, "p2", "battlefield", "Ghost Vacuum");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Requisition Raid"),
      mode: modeOf(s, "Requisition Raid", "Destroy an artifact + +1/+1 counter on a player's creatures"),
      targets: { a: [vacuum], p: ["p1"] },
    });
    s = settle(s);
    expect(s.objects[vacuum]).toBeUndefined();
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Lively Dirge: a card from the library to the graveyard; up to two creatures with total mana value 4 or less return", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: lands("Swamp", 5),
          hand: ["Lively Dirge"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Shivan Dragon"],
          library: ["Forest", "Serra Angel", "Forest"],
        },
      });
    let s = start();
    const both = modeOf(
      s,
      "Lively Dirge",
      "A card from your library into your graveyard + Up to two creatures (total mana value 4 or less)",
    );
    // Bear Cub (2) and Shivan Dragon (6): more than 4 in total.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Lively Dirge"),
        mode: both,
        targets: { c: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Shivan Dragon")] },
      }),
    ).toThrow();
    s = start();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lively Dirge"),
      mode: both,
      targets: { c: [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Llanowar Elves")] },
    });
    s = settle(s, (req, _p, x) => pickNamed(x, req, "Serra Angel"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Lively Dirge", "Serra Angel", "Shivan Dragon"]);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Forsaken Miner: can't block; when you commit a crime, pay {B} to return it from the graveyard", () => {
    const board = scenario({ p1: { battlefield: ["Forsaken Miner"] } });
    expect(chars(board, idOf(board, "p1", "battlefield", "Forsaken Miner")).keywords).toContain("cantBlock");
    let s = scenario({ p1: { battlefield: ["Mountain", "Swamp"], hand: ["Burst Lightning"], graveyard: ["Forsaken Miner"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p2"] } });
    s = settle(s, yes);
    expect(idsOf(s, "p1", "battlefield", "Forsaken Miner")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(18);
    // Without a crime (target: yourself), nothing.
    let t = scenario({ p1: { battlefield: ["Mountain", "Swamp"], hand: ["Burst Lightning"], graveyard: ["Forsaken Miner"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Burst Lightning"), targets: { t: ["p1"] } });
    t = settle(t, yes);
    expect(idsOf(t, "p1", "graveyard", "Forsaken Miner")).toHaveLength(1);
  });

  it("Nurturing Pixie: returns a non-Faerie permanent you control and gets a +1/+1 counter; without a return, no counter", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Nurturing Pixie"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nurturing Pixie") });
    s = settle(s, picking([cub]));
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    const pixie = idOf(s, "p1", "battlefield", "Nurturing Pixie");
    expect(chars(s, pixie)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, pixie).keywords).toContain("flying");
    let t = scenario({ p1: { battlefield: ["Plains"], hand: ["Nurturing Pixie"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nurturing Pixie") });
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Nurturing Pixie")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Bovine Intervention: destroys an artifact or a creature; its controller creates a 2/2 white Ox", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Bovine Intervention"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bovine Intervention"), targets: { t: [dragon] } });
    s = settle(s);
    expect(s.objects[dragon]).toBeUndefined();
    const ox = idOf(s, "p2", "battlefield", "Ox");
    expect(chars(s, ox)).toMatchObject({ power: 2, toughness: 2, colors: ["W"] });
    expect(idsOf(s, "p1", "battlefield", "Ox")).toHaveLength(0);
  });

  it("Return the Favor: copies a spell (new targets possible); changes the target of a single-target spell", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Lightning Strike", "Return the Favor"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    const strike = s.stack[0]?.id as string;
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Return the Favor"),
      mode: modeOf(s, "Return the Favor", "Copy a spell or ability"),
      targets: { c: [strike] },
    });
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
    // The opposing spell that targets you is sent back to its caster.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Mountain", 3), hand: ["Return the Favor"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    const theirs = t.stack[0]?.id as string;
    t = act(t, "p2", { type: "pass" });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Return the Favor"),
      mode: modeOf(t, "Return the Favor", "Change the target"),
      targets: { b: [theirs] },
    });
    t = settle(t, picking(["p2"]));
    expect(t.players.p1?.life).toBe(20);
    expect(t.players.p2?.life).toBe(17);
  });

  it("Aven Interrupter: exiles a spell that becomes plotted; opposing spells from exile cost {2} more", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Plains", 3), hand: ["Aven Interrupter"] },
      p2: { battlefield: lands("Mountain", 6), hand: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "hand", "Shivan Dragon");
    s = act(s, "p2", { type: "cast", card: dragon });
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Aven Interrupter") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Aven Interrupter")).toHaveLength(1);
    const plotted = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect(plotted).toBeDefined();
    expect(s.objects[plotted]?.exiledVia?.kind).toBe("plot");
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    // On p2's next turn: cast without paying its mana cost, but {2} more.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.number > 3 && x.turn.step === "main1" && x.stack.length === 0);
    s = act(s, "p2", { type: "cast", card: plotted });
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.tapped)).toHaveLength(2);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Magda, the Hoardmaster: a tapped Treasure on the first crime of the turn; three Treasures sacrificed for a 4/4 Scorpion Dragon", () => {
    let s = scenario({
      p1: { battlefield: ["Magda, the Hoardmaster", ...lands("Mountain", 2)], hand: ["Burst Lightning", "Burst Lightning"] },
    });
    for (const card of idsOf(s, "p1", "hand", "Burst Lightning")) {
      s = act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } });
      s = settle(s);
    }
    const treasures = idsOf(s, "p1", "battlefield", "Treasure");
    expect(treasures).toHaveLength(1);
    expect(s.objects[treasures[0] as string]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Magda, the Hoardmaster"] } });
    createTokens(t, "p1", TOKEN_SPECS.Treasure as TokenSpec, 3);
    const magda = idOf(t, "p1", "battlefield", "Magda, the Hoardmaster");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === magda);
    t = act(t, "p1", { type: "activate", source: magda, ability: ab?.type === "activate" ? ab.ability : -1 });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    const dragon = t.battlefield.find((id) => t.objects[id]?.isToken && chars(t, id).subtypes.includes("Dragon")) as string;
    expect(chars(t, dragon)).toMatchObject({ power: 4, toughness: 4, colors: ["R"] });
    expect(chars(t, dragon).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
  });
});

describe('"Choose one" chosen on resolution (lot K3)', () => {
  it("Rattleback Apothecary: the targeted creature gains your choice of menace OR lifelink, not both", () => {
    const run = (menace: 0 | 1) => {
      let s = scenario({
        p1: { battlefield: ["Rattleback Apothecary", ...lands("Mountain", 2)], hand: ["Scorching Shot"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const rattle = idOf(s, "p1", "battlefield", "Rattleback Apothecary");
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Scorching Shot"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
      });
      for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice")
          s = act(s, p.player, { type: "choose", values: p.request.type === "yesNo" ? [menace] : p.request.suggested });
        else break;
      }
      return chars(s, rattle).keywords;
    };
    const a = run(1);
    expect(a).toContain("menace");
    expect(a).not.toContain("lifelink");
    const b = run(0);
    expect(b).toContain("lifelink");
    expect(b).not.toContain("menace");
  });
});

describe("Outlaws of Thunder Junction, lot K6: choices handed back to the player", () => {
  /** Plays Arid Archway, returns the land named `back` and notes the choices posed. */
  const archway = (back: string) => {
    let s = scenario({ p1: { battlefield: ["Plains", "Forlorn Flats"], hand: ["Arid Archway"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Arid Archway") });
    const intents: string[] = [];
    let options: string[] = [];
    let targets: string[] = [];
    s = settle(s, (req, _p, cur) => {
      intents.push(req.intent);
      if (req.type === "pick" && req.intent === "pickCards") {
        options = req.options.map((id) => nameOf(cur, id) ?? "");
        const item = cur.stack.find((i) => cur.defs[i.sourceDefId]?.name === "Arid Archway");
        targets = Object.values(item?.targets ?? {}).flat();
        return pickNamed(cur, req, back);
      }
      return undefined;
    });
    return { s, intents, options, targets };
  };

  it("Arid Archway: the returned land is chosen on resolution (not targeted), itself included", () => {
    const self = archway("Arid Archway");
    expect(self.options.sort()).toEqual(["Arid Archway", "Forlorn Flats", "Plains"]);
    expect(self.targets).toHaveLength(0);
    expect(idsOf(self.s, "p1", "hand", "Arid Archway")).toHaveLength(1);
    // It is not \"another Desert\" itself: no scry.
    expect(self.intents).not.toContain("surveilGraveyard");
  });

  it("Arid Archway: another Desert returned, scry 1; a land that is not a Desert, nothing", () => {
    const desert = archway("Forlorn Flats");
    expect(idsOf(desert.s, "p1", "hand", "Forlorn Flats")).toHaveLength(1);
    expect(desert.intents).toContain("surveilGraveyard");
    const plains = archway("Plains");
    expect(idsOf(plains.s, "p1", "hand", "Plains")).toHaveLength(1);
    expect(idsOf(plains.s, "p1", "battlefield", "Arid Archway")).toHaveLength(1);
    expect(plains.intents).not.toContain("surveilGraveyard");
  });
});

describe('Mounts: "a creature that mounted it this turn" (lot K6)', () => {
  /** Saddles the Mount (taps the suggested creatures), then attacks with it; `answer` answers the choices. */
  const saddleAndAttack = (
    s0: GameState,
    mountName: string,
    answer: (req: { type: string; options?: string[] }) => unknown[],
    tap?: string[],
  ) => {
    let s = s0;
    const mount = idOf(s, "p1", "battlefield", mountName);
    const saddle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === mount);
    s = act(s, "p1", {
      type: "activate",
      source: mount,
      ability: saddle?.type === "activate" ? saddle.ability : -1,
      ...(tap ? { tap } : {}),
    });
    s = passBoth(s);
    s = attack(s, [mount]);
    for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request as never) as (string | number)[] });
      else break;
    }
    return s;
  };

  it("Giant Beaver: the counter goes on a creature that saddled it (only possible target)", () => {
    let s = scenario({ p1: { battlefield: ["Giant Beaver", "Serra Angel", "Bear Cub"] } });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const targetOptions: string[][] = [];
    s = saddleAndAttack(
      s,
      "Giant Beaver",
      (req) => {
        if (req.type === "pick" && req.options?.includes(angel)) targetOptions.push(req.options);
        return req.type === "pick" ? (req.options?.includes(angel) ? [angel] : (req.options ?? []).slice(0, 1)) : [0];
      },
      [angel],
    );
    // The Mount 3 taps the Angel (power 4); the Bear did not saddle it.
    expect(targetOptions.every((o) => !o.includes(bear))).toBe(true);
    expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
  });

  it("Rambling Possum: +1/+2, then you may return to hand the ones that saddled it", () => {
    const setup = () => scenario({ p1: { battlefield: ["Rambling Possum", "Bear Cub"] } });
    const back = saddleAndAttack(setup(), "Rambling Possum", (req) => (req.type === "pick" ? (req.options ?? []) : [1]));
    expect(idOf(back, "p1", "hand", "Bear Cub")).toBeDefined();
    const stay = saddleAndAttack(setup(), "Rambling Possum", (req) =>
      req.type === "pick" && (req.options?.length ?? 0) > 0 && (req as { min?: number }).min === 0 ? [] : [],
    );
    expect(idOf(stay, "p1", "battlefield", "Bear Cub")).toBeDefined();
  });
});

describe("Outlaws of Thunder Junction, lot K8 : mythiques", () => {
  type S = GameState;
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: S, source: string, label: string, extra: object = {}, player: PlayerId = "p1") => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").startsWith(label),
    );
    if (a?.type !== "activate") throw new Error(`ability "${label}" not found`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Answers yes/no to questions and chooses the wanted objects. */
  const answering =
    (opts: { yes?: boolean; pick?: string[] }) =>
    (req: ChoiceRequest): ChoiceValue[] | undefined => {
      if (req.type === "yesNo" && opts.yes !== undefined) return [opts.yes ? 1 : 0];
      return opts.pick ? picking(opts.pick)(req) : undefined;
    };
  const tokensOf = (s: S, player: PlayerId, name: string) =>
    s.battlefield.filter((id) => s.objects[id]?.controller === player && s.objects[id]?.isToken && nameOf(s, id) === name);
  const SOLDIER: TokenSpec = {
    name: "Soldier",
    colors: ["W"],
    types: ["Creature"],
    subtypes: ["Soldier"],
    power: 1,
    toughness: 1,
  };

  it("Annie Flash, the Veteran: cast, it returns tapped a permanent with mana value 3 or less from your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Forest", ...lands("Plains", 4)],
        hand: ["Annie Flash, the Veteran"],
        graveyard: ["Bear Cub", "Serra Angel", "Swab Goblin"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    const elves = idOf(s, "p2", "graveyard", "Llanowar Elves");
    let offered: string[] = [];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Annie Flash, the Veteran") });
    s = settle(s, (req) => {
      if (req.type === "pick" && req.options.includes(cub)) offered = req.options;
      return picking([cub])(req);
    });
    expect(offered).not.toContain(angel);
    expect(offered).not.toContain(elves);
    expect(offered).toContain(cub);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Serra Angel", "Swab Goblin"]);
  });

  it("Annie Flash, the Veteran: tapped, it exiles the top two cards, playable this turn only", () => {
    let s = scenario({
      p1: {
        battlefield: ["Annie Flash, the Veteran", ...lands("Forest", 2)],
        library: ["Mountain", "Bear Cub", ...lands("Forest", 8)],
      },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Annie Flash, the Veteran")]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(16);
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    const cub = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(mountain).toBeDefined();
    expect(cub).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    expect(castable(s, "p1", cub)).toBe(true);
    const later = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > s.turn.number);
    expect(legalActions(later, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
    expect(castable(later, "p1", cub)).toBe(false);
  });

  it("Bristly Bill, Spine Sower: a land enters, a counter on a targeted creature; {3}{G}{G} doubles the counters on your creatures only", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bristly Bill, Spine Sower", { name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Forest", 5)],
        hand: ["Forest"],
      },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const bill = idOf(s, "p1", "battlefield", "Bristly Bill, Spine Sower");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = settle(s, picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    s = settle(activate(s, bill, "Double"));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(4);
    expect(s.objects[bill]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
  });

  it("Final Showdown: creatures lose their abilities until end of turn", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Final Showdown"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Creatures lose all abilities") : undefined;
    s = settle(cast(s, "p1", "Final Showdown", { mode: mode?.index }));
    expect(chars(s, angel).keywords).not.toContain("flying");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, angel).keywords).toContain("flying");
  });

  it('Final Showdown: the chosen creature (no target) becomes indestructible and survives "destroy all creatures"', () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 7)], hand: ["Final Showdown"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const mode =
      opt?.type === "cast"
        ? opt.modes.find(
            (m) => plainText(m.label ?? "") === "A creature you control gains indestructible + Destroy all creatures",
          )
        : undefined;
    expect(mode).toBeDefined();
    s = cast(s, "p1", "Final Showdown", { mode: mode?.index });
    // No target: the choice is made on resolution.
    expect(s.stack[0]?.targets ?? {}).toEqual({});
    s = settle(s, picking([cub]));
    expect(
      namesIn(
        s,
        s.battlefield.filter((id) => chars(s, id).types.includes("Creature")),
      ),
    ).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toContain("Llanowar Elves");
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Geralf, the Fleshwright: a 2/2 Zombie Rogue from your second spell of the turn; a counter per other Zombie that entered this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Geralf, the Fleshwright", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"] },
    });
    const zombies = (x: S) => tokensOf(x, "p1", "Zombie Rogue");
    s = settle(cast(s, "p1", "Opt"));
    expect(zombies(s)).toHaveLength(0);
    s = settle(cast(s, "p1", "Opt"));
    const [first] = zombies(s) as [string];
    expect(zombies(s)).toHaveLength(1);
    expect(chars(s, first)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, first).colors).toEqual(expect.arrayContaining(["U", "B"]));
    expect(s.objects[first]?.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(cast(s, "p1", "Opt"));
    const second = zombies(s).find((id) => id !== first) as string;
    expect(s.objects[second]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[first]?.counters["+1/+1"] ?? 0).toBe(0);
    // During the opponent's turn, no Zombie.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Geralf, the Fleshwright", ...lands("Island", 2)], hand: ["Opt", "Opt"] },
    });
    for (let i = 0; i < 2; i++) {
      t = act(t, "p2", { type: "pass" });
      t = settle(cast(t, "p1", "Opt"));
    }
    expect(zombies(t)).toHaveLength(0);
  });

  it("Ghired, Mirror of the Wilds: your nontoken creatures copy a token you control that entered this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Ghired, Mirror of the Wilds", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    createTokens(s, "p1", SOLDIER, 1);
    createTokens(s, "p1", SOLDIER, 1);
    const [fresh, old] = tokensOf(s, "p1", "Soldier") as [string, string];
    // The second token entered on an earlier turn: its arrival is not in this turn's log.
    s.turnLog = s.turnLog.filter((e) => !(e.e === "zone" && e.id === old));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, idOf(s, "p1", "battlefield", "Ghired, Mirror of the Wilds")).keywords).toContain("haste");
    // Tokens and opposing creatures do not have the ability.
    expect(canActivate(s, "p1", fresh)).toBe(false);
    expect(canActivate(s, "p2", idOf(s, "p2", "battlefield", "Llanowar Elves"))).toBe(false);
    expect(canActivate(s, "p1", cub)).toBe(true);
    expect(() => activate(s, cub, "Copy", { targets: { t: [old] } })).toThrow();
    s = settle(activate(s, cub, "Copy", { targets: { t: [fresh] } }));
    expect(tokensOf(s, "p1", "Soldier")).toHaveLength(3);
    expect(s.objects[cub]?.tapped).toBe(true);
  });

  it("Gisa, the Hellraiser: Skeletons and Zombies +1/+1 and menace; a crime creates two tapped Zombies, once each turn", () => {
    let s = scenario({
      p1: { battlefield: ["Gisa, the Hellraiser", "Bear Cub", ...lands("Mountain", 2)], hand: ["Shock", "Shock"] },
    });
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    const zombies = tokensOf(s, "p1", "Zombie Rogue");
    expect(zombies).toHaveLength(2);
    for (const z of zombies) {
      expect(s.objects[z]?.tapped).toBe(true);
      expect(chars(s, z)).toMatchObject({ power: 3, toughness: 3 });
      expect(chars(s, z).keywords).toContain("menace");
    }
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, cub).keywords).not.toContain("menace");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(tokensOf(s, "p1", "Zombie Rogue")).toHaveLength(2);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Goldvein Hydra: enters with X counters; when it dies, as many tapped Treasures as its power", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 4), ...lands("Swamp", 3)], hand: ["Goldvein Hydra", "Murder"] } });
    s = settle(cast(s, "p1", "Goldvein Hydra", { x: 3 }));
    const hydra = idOf(s, "p1", "battlefield", "Goldvein Hydra");
    expect(chars(s, hydra)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, hydra).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "haste"]));
    s = settle(cast(s, "p1", "Murder", { targets: { t: [hydra] } }));
    const treasures = tokensOf(s, "p1", "Treasure");
    expect(treasures).toHaveLength(3);
    expect(treasures.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Kellan, the Kid: a spell cast from anywhere but hand lets you cast for free a permanent spell with lesser or equal mana value from hand, otherwise put a land", () => {
    const setup = () => {
      let s = scenario({
        p1: {
          battlefield: ["Kellan, the Kid", ...lands("Island", 4)],
          hand: ["Djinn of Fool's Fall", "Serra Angel", "Shivan Dragon", "Plains"],
        },
      });
      s = activate(s, idOf(s, "p1", "hand", "Djinn of Fool's Fall"), "Plot");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const plotted = s.exile.find((id) => nameOf(s, id) === "Djinn of Fool's Fall") as string;
      return untilCastNow(act(s, "p1", { type: "cast", card: plotted }));
    };
    let s = setup();
    // Only the permanent spell with mana value 5 or less is offered (neither the mana value 6 Dragon, nor the land).
    expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Serra Angel"]);
    const lands0 = s.battlefield.filter((id) => nameOf(s, id) === "Island" && !s.objects[id]?.tapped).length;
    s = act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string });
    // Cast (on the stack, without paying its mana cost), and not put onto the battlefield.
    expect(s.stack.some((i) => i.kind === "spell" && s.defs[i.sourceDefId]?.name === "Serra Angel")).toBe(true);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && !s.objects[id]?.tapped)).toHaveLength(lands0);
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(0);
    // Without a cast spell: a land from hand.
    let t = setup();
    t = settle(t, (req) =>
      req.type === "pick" ? req.options.filter((id) => nameOf(t, id) === "Plains").slice(0, 1) : undefined,
    );
    expect(idsOf(t, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
    // A spell cast from hand triggers nothing.
    let u = scenario({ p1: { battlefield: ["Kellan, the Kid", ...lands("Forest", 2)], hand: ["Bear Cub", "Llanowar Elves"] } });
    u = cast(u, "p1", "Bear Cub");
    expect(u.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
  });

  it("Oko, the Ringleader: at the beginning of combat, copy of one of your creatures with hexproof, until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Oko, the Ringleader", "Bear Cub"] } });
    const oko = idOf(s, "p1", "battlefield", "Oko, the Ringleader");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, picking([cub]));
    expect(chars(s, oko)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, oko).types).toContain("Creature");
    expect(chars(s, oko).types).not.toContain("Planeswalker");
    expect(chars(s, oko).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, oko).types).toContain("Planeswalker");
    expect(chars(s, oko).keywords).not.toContain("hexproof");
  });

  it("Oko, the Ringleader: +1 draw two and discard two (only one after a crime); −1 3/3 Elk; −5 copy your other nonland permanents", () => {
    const base = { battlefield: ["Oko, the Ringleader", "Mountain"], hand: ["Shock", "Bear Cub", "Opt"] };
    let s = scenario({ p1: base });
    const oko = idOf(s, "p1", "battlefield", "Oko, the Ringleader");
    s = settle(activate(s, oko, "+1: Draw two"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect(s.objects[oko]?.counters.loyalty).toBe(4);
    let t = scenario({ p1: base });
    t = settle(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
    t = settle(activate(t, oko, "+1: Draw two"));
    expect(t.players.p1?.hand).toHaveLength(3);
    expect(namesIn(t, t.players.p1?.graveyard).filter((n) => n !== "Shock")).toHaveLength(1);
    let e = scenario({ p1: { battlefield: ["Oko, the Ringleader"] } });
    e = settle(activate(e, idOf(e, "p1", "battlefield", "Oko, the Ringleader"), "−1: 3/3 Elk"));
    const [elk] = tokensOf(e, "p1", "Elk") as [string];
    expect(chars(e, elk)).toMatchObject({ power: 3, toughness: 3, colors: ["G"] });
    let c = scenario({
      p1: { battlefield: [{ name: "Oko, the Ringleader", counters: { loyalty: 6 } }, "Bear Cub", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    c = settle(activate(c, idOf(c, "p1", "battlefield", "Oko, the Ringleader"), "−5: Copy"));
    expect(idsOf(c, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(idsOf(c, "p1", "battlefield", "Forest")).toHaveLength(1);
    expect(idsOf(c, "p1", "battlefield", "Oko, the Ringleader")).toHaveLength(1);
    expect(idsOf(c, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Railway Brawler: another creature you control that enters gets as many counters as its power; plot {3}{G}", () => {
    let s = scenario({
      p1: { battlefield: ["Railway Brawler", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      p2: { hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Railway Brawler")]?.counters["+1/+1"] ?? 0).toBe(0);
    const t = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Railway Brawler"] } });
    const brawler = idOf(t, "p1", "hand", "Railway Brawler");
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === brawler && a.label?.startsWith("Plot"))).toBe(
      true,
    );
  });

  it("Rakdos, the Muscle: sacrificing another creature exiles as many cards as its mana value, playable with any mana until your next end step", () => {
    let s = scenario({
      p1: { battlefield: ["Rakdos, the Muscle", "Bear Cub", "Llanowar Elves", "Swamp"] },
      p2: { library: ["Shock", "Mountain", ...lands("Forest", 8)] },
    });
    const rakdos = idOf(s, "p1", "battlefield", "Rakdos, the Muscle");
    s = activate(s, rakdos, "Gains indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settle(s, picking(["p2"]));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    expect(chars(s, rakdos).keywords).toContain("indestructible");
    expect(s.objects[rakdos]?.tapped).toBe(true);
    // Once each turn.
    expect(canActivate(s, "p1", rakdos)).toBe(false);
    const shock = s.exile.find((id) => nameOf(s, id) === "Shock") as string;
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    expect(shock).toBeDefined();
    expect(mountain).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // Le Marais paie {R}.
    expect(castable(s, "p1", shock)).toBe(true);
    // After your end step, no longer playable (even during the opponent's turn).
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(castable(s, "p1", shock)).toBe(false);
  });

  it("Selvala, Eager Trailblazer: a creature spell creates a 1/1 Mercenary; {T}: one mana of a color per different power", () => {
    let s = scenario({
      p1: { battlefield: ["Selvala, Eager Trailblazer", ...lands("Forest", 2)], hand: ["Bear Cub", "Opt"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    const [merc] = tokensOf(s, "p1", "Mercenary") as [string];
    expect(chars(s, merc)).toMatchObject({ power: 1, toughness: 1, colors: ["R"] });
    // Powers 4, 2 and 1: three mana.
    const selvala = idOf(s, "p1", "battlefield", "Selvala, Eager Trailblazer");
    const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === selvala);
    s = act(s, "p1", {
      type: "tapForMana",
      source: selvala,
      ability: mana?.type === "tapForMana" ? mana.ability : -1,
      color: "U",
    });
    expect(s.players.p1?.manaPool.U).toBe(3);
    // A spell that is not a creature: no Mercenary.
    s = settle(cast(s, "p1", "Opt"));
    expect(tokensOf(s, "p1", "Mercenary")).toHaveLength(1);
  });

  it("The Gitrog, Ravenous Ride: combat damage to a player, sacrificing the one that saddled it draws X and puts up to X tapped lands", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Gitrog, Ravenous Ride", "Bear Cub"],
        hand: ["Plains", "Island", "Opt"],
        library: lands("Swamp", 10),
      },
    });
    const gitrog = idOf(s, "p1", "battlefield", "The Gitrog, Ravenous Ride");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activate(s, gitrog, "Saddle", { tap: [cub] });
    s = settle(s);
    s = attack(s, [gitrog]);
    s = throughCombat(s, (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.options.includes(cub)) return [cub];
      if (req.type === "pick")
        return req.options.filter((id) => ["Plains", "Island", "Swamp"].includes(nameOf(cur, id) ?? "")).slice(0, 2);
      return undefined;
    });
    expect(s.players.p2?.life).toBe(14);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    // Two cards drawn, two lands put onto the battlefield tapped.
    const landsIn = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Land"));
    expect(landsIn).toHaveLength(2);
    expect(landsIn.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.players.p1?.hand).toHaveLength(3);
    // Without a creature that saddled it, nothing.
    let t = scenario({ p1: { battlefield: ["The Gitrog, Ravenous Ride", "Bear Cub"], hand: ["Plains"] } });
    t = attack(t, [idOf(t, "p1", "battlefield", "The Gitrog, Ravenous Ride")]);
    t = throughCombat(t);
    expect(t.players.p2?.life).toBe(14);
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Tinybones, the Pickpocket: combat damage to a player, cast a nonland permanent from their graveyard with any mana", () => {
    let s = scenario({
      p1: { battlefield: ["Tinybones, the Pickpocket", ...lands("Island", 2)] },
      p2: { graveyard: ["Cathar Commando", "Forest", "Bear Cub"] },
    });
    const commando = idOf(s, "p2", "graveyard", "Cathar Commando");
    const cub = idOf(s, "p2", "graveyard", "Bear Cub");
    const forest = idOf(s, "p2", "graveyard", "Forest");
    let offered: string[] = [];
    s = attack(s, [idOf(s, "p1", "battlefield", "Tinybones, the Pickpocket")]);
    for (let i = 0; i < 80 && !castNowOf(s); i++) {
      const p = s.pending;
      if (p?.kind === "choice") {
        if (p.request.type === "pick") offered = p.request.options;
        s = act(s, p.player, { type: "choose", values: picking([commando])(p.request) ?? p.request.suggested });
      } else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else break;
    }
    expect(offered).toEqual(expect.arrayContaining([commando, cub]));
    expect(offered).not.toContain(forest);
    // Targeting a card in the opposing graveyard is a crime.
    expect(crimesOf(s)).toBeGreaterThan(0);
    // Two Islands pay {1}{W}: any type of mana.
    expect(namesIn(s, castNowOf(s)?.cards)).toEqual(["Cathar Commando"]);
    s = act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Cathar Commando")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(19);
    // A card without flash is also cast during resolution (608.2g; PLAN-D, D8).
    let t = scenario({
      p1: { battlefield: ["Tinybones, the Pickpocket", ...lands("Island", 2)] },
      p2: { graveyard: ["Bear Cub"] },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Tinybones, the Pickpocket")]);
    for (let i = 0; i < 80 && !castNowOf(t); i++) {
      const p = t.pending;
      if (p?.kind === "choice") t = act(t, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "declareBlockers") t = act(t, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "priority") t = act(t, p.player, { type: "pass" });
      else break;
    }
    expect(namesIn(t, castNowOf(t)?.cards)).toEqual(["Bear Cub"]);
    t = settle(act(t, "p1", { type: "cast", card: castNowOf(t)?.cards[0] as string }));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Vraska, the Silencer: an opposing nontoken creature dies, paying {1} returns it tapped under your control, an artifact Treasure only", () => {
    let s = scenario({
      p1: { battlefield: ["Vraska, the Silencer", "Llanowar Elves", ...lands("Mountain", 3)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Pyroclasm"), answering({ yes: true }));
    const back = s.battlefield.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(back).toBeDefined();
    expect(s.objects[back]?.controller).toBe("p1");
    expect(s.objects[back]?.owner).toBe("p2");
    expect(s.objects[back]?.tapped).toBe(true);
    expect(chars(s, back).types).toEqual(["Artifact"]);
    expect(chars(s, back).subtypes).toEqual(["Treasure"]);
    // The Elves (yours) stay in the graveyard; a single {1} paid.
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Llanowar Elves", "Pyroclasm"]));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Mountain" && s.objects[id]?.tapped)).toHaveLength(3);
    expect(cub).toBeDefined();
    // Declining to pay: the card stays in the graveyard.
    let t = scenario({
      p1: { battlefield: ["Vraska, the Silencer", ...lands("Mountain", 3)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    t = settle(cast(t, "p1", "Pyroclasm"), answering({ yes: false }));
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Bear Cub"]);
  });

  it("Assimilation Aegis: each time it becomes attached, that creature becomes a copy of the exiled creature for as long as it stays attached (PLAN-M M3b)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 4)], hand: ["Assimilation Aegis"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    // The exile on entering, linked to the Equipment (put onto the battlefield: its trigger targets the Dragon).
    const aegis = moveObject(s, idOf(s, "p1", "hand", "Assimilation Aegis"), "battlefield") as string;
    s = settle(s, (req) => (req.type === "pick" ? [idOf(s, "p2", "battlefield", "Shivan Dragon")] : undefined));
    expect(s.exile.filter((id) => nameOf(s, id) === "Shivan Dragon")).toHaveLength(1);
    // Equipped: the Bear becomes a copy of the Dragon (layer 1, 707.2).
    s = settle(activate(s, aegis, "Equip", { targets: { t: [bear] } }));
    expect(s.objects[aegis]?.attachedTo).toBe(bear);
    expect(chars(s, bear).name).toBe("Shivan Dragon");
    expect(chars(s, bear).power).toBe(5);
    // Equipped to the Elves: the Bear is a Bear again, the Elves become the copy (a new trigger).
    s = settle(activate(s, aegis, "Equip", { targets: { t: [elves] } }));
    expect(s.objects[aegis]?.attachedTo).toBe(elves);
    expect(chars(s, bear).name).toBe("Bear Cub");
    expect(chars(s, elves).name).toBe("Shivan Dragon");
    // Unattached: the copy ends (611.2b).
    runEffect(
      s,
      {
        item: { id: "x", controller: "p1", sourceId: aegis, sourceDefId: "x", targets: {} },
        controller: "p1",
        targets: {},
        vars: {},
        pc: 0,
      } as never,
      fx.unattach(ref.self),
    );
    expect(s.objects[aegis]?.attachedTo).toBeUndefined();
    expect(chars(s, elves).name).toBe("Llanowar Elves");
    expect(s.effects.some((e) => e.copyOf)).toBe(false);
  });
});

describe("Outlaws of Thunder Junction, lot K8 : rares (1)", () => {
  /** Activates the ability of `source` (the first one, or the one whose label starts with `label`). */
  const activate = (s: GameState, source: string, label?: string, extra: object = {}) => {
    const opt = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === source && (!label || plainText(a.label ?? "").startsWith(label)),
    );
    if (opt?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, "p1", { type: "activate", source, ability: opt.ability, ...extra });
  };
  /** A generator value such that the next coin flip is won (or lost). */
  const rngFor = (won: boolean) => {
    for (let r = 0; r < 1000; r++) if (random({ rng: r } as unknown as GameState) < 0.5 === won) return r;
    return 0;
  };
  const etbLife = (name: string, legendary: boolean) =>
    customCard({
      name,
      supertypes: legendary ? ["Legendary"] : [],
      power: 2,
      toughness: 2,
      abilities: [triggered(when.entersSelf, [fx.gainLife(1)], { label: "1 PV" })],
    });

  it("Akul the Unrepentant: sacrifice three other creatures: a creature from your hand onto the battlefield, once each turn", () => {
    const two = scenario({ p1: { battlefield: ["Akul the Unrepentant", "Bear Cub", "Bear Cub"], hand: ["Serra Angel"] } });
    expect(canActivate(two, "p1", idOf(two, "p1", "battlefield", "Akul the Unrepentant"))).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Akul the Unrepentant", ...Array(6).fill("Bear Cub")], hand: ["Serra Angel", "Forest"] },
    });
    const akul = idOf(s, "p1", "battlefield", "Akul the Unrepentant");
    expect(chars(s, akul).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
    s = activate(s, akul, undefined, { sacrifice: idsOf(s, "p1", "battlefield", "Bear Cub").slice(0, 3) });
    let offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Serra Angel");
    });
    expect(offered).toEqual(["Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(3);
    // Only once each turn.
    expect(canActivate(s, "p1", akul)).toBe(false);
  });

  it("Annie Joins Up: 5 damage to an opposing creature; triggers of your legendary creatures trigger one more time", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 2), "Forest", "Plains", ...lands("Plains", 4)],
        hand: ["Annie Joins Up", etbLife("Legendary Hero", true), etbLife("Recruit", false)],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Annie Joins Up") });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
    expect(s.objects[angel]?.zone).not.toBe("battlefield");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Legendary Hero") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Recruit") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Another Round: X = 1, the chosen creature is exiled then returned twice (two enter triggers)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 5), "Inspiring Overseer", { name: "Bear Cub", counters: { "+1/+1": 1 } }],
        hand: ["Another Round"],
      },
    });
    const overseer = idOf(s, "p1", "battlefield", "Inspiring Overseer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Another Round"), x: 1 });
    s = settle(s, (req) => (req.type === "pick" && req.options.includes(overseer) ? [overseer] : undefined));
    expect(s.players.p1?.life).toBe(22);
    expect(idsOf(s, "p1", "battlefield", "Inspiring Overseer")).toHaveLength(1);
    // The unchosen creature stays in place (same object, counter kept).
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
  });

  it("Bonny Pall, Clearcutter: Beau has P/T equal to the number of your lands; when you attack, draw then a land from hand or graveyard", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), ...lands("Forest", 2)], hand: ["Bonny Pall, Clearcutter"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bonny Pall, Clearcutter") });
    s = settle(s);
    const beau = idOf(s, "p1", "battlefield", "Beau");
    expect(chars(s, beau).power).toBe(6);
    expect(chars(s, beau).toughness).toBe(6);
    expect(chars(s, beau).supertypes).toContain("Legendary");
    let t = scenario({
      p1: { battlefield: ["Bonny Pall, Clearcutter", "Bear Cub"], graveyard: ["Plains"], library: ["Island", "Forest"] },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
    t = settle(t, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      // Nothing from hand; the Plains from the graveyard.
      return namesIn(cur, req.options).includes("Plains") ? pickNamed(cur, req, "Plains") : [];
    });
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
    expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
  });

  it("Botanical Sanctum: untapped with two or fewer other lands, tapped beyond that; produces {G} or {U}", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Botanical Sanctum"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Botanical Sanctum") });
    const sanctum = idOf(s, "p1", "battlefield", "Botanical Sanctum");
    expect(s.objects[sanctum]?.tapped).toBe(false);
    s = act(s, "p1", { type: "tapForMana", source: sanctum, ability: 0, color: "U" });
    expect(s.players.p1?.manaPool.U).toBe(1);
    let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Botanical Sanctum"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Botanical Sanctum") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Botanical Sanctum")]?.tapped).toBe(true);
  });

  it("Breeches, the Blastmaker: on the second spell, sacrifice an artifact: coin flip won, copy; lost, damage equal to mana value", () => {
    const artifact = customCard({ name: "Bibelot", typeLine: "Artifact", types: ["Artifact"] });
    const run = (sacrifice: boolean, won: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Breeches, the Blastmaker", artifact, "Island", ...lands("Mountain", 2)],
          hand: ["Opt", "Lightning Strike"],
        },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
      // First spell: no trigger.
      expect(s.triggers.length + s.stack.filter((i) => i.kind === "ability").length).toBe(0);
      s = settle(s);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
      s.rng = rngFor(won);
      s = settle(s, (req, _p, cur) => {
        if (req.type === "pick" && req.options.includes("p2")) return ["p2"];
        if (req.type === "pick" && namesIn(cur, req.options).includes("Bibelot")) return sacrifice ? req.options : [];
        if (req.type === "yesNo") return [sacrifice ? 1 : 0];
        return undefined;
      });
      return s;
    };
    const none = run(false, true);
    expect(none.players.p2?.life).toBe(17);
    expect(idsOf(none, "p1", "battlefield", "Bibelot")).toHaveLength(1);
    const copied = run(true, true);
    expect(copied.players.p2?.life).toBe(14);
    expect(idsOf(copied, "p1", "battlefield", "Bibelot")).toHaveLength(0);
    // Flip lost: 2 damage (mana value of Lightning Strike) on top of the spell's 3.
    const lost = run(true, false);
    expect(lost.players.p2?.life).toBe(15);
  });

  it("Bruse Tarl, Roving Rancher: your Oxen have double strike; on entering, top card exiled: land, a 2/2 Ox", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)], hand: ["Bruse Tarl, Roving Rancher"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bruse Tarl, Roving Rancher") });
    s = settle(s);
    expect(exiled(s, "Forest")).toHaveLength(1);
    const ox = idOf(s, "p1", "battlefield", "Ox");
    expect(chars(s, ox).power).toBe(2);
    expect(chars(s, ox).colors).toEqual(["W"]);
    expect(chars(s, ox).keywords).toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bruse Tarl, Roving Rancher")).keywords).not.toContain("doubleStrike");
  });

  it("Bruse Tarl, Roving Rancher: when attacking, an exiled nonland card is cast until the end of your next turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bruse Tarl, Roving Rancher", ...lands("Forest", 2)], library: ["Bear Cub", ...lands("Forest", 8)] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bruse Tarl, Roving Rancher")]);
    s = settleNoBlocks(s);
    const cub = exiled(s, "Bear Cub")[0] as string;
    expect(cub).toBeDefined();
    expect(idsOf(s, "p1", "battlefield", "Ox")).toHaveLength(0);
    s = throughCombat(s);
    expect(castable(s, "p1", cub)).toBe(true);
    // Still during your next turn, not after.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 5);
    expect(castable(s, "p1", cub)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 7);
    expect(s.objects[cub]?.zone).toBe("exile");
    expect(castable(s, "p1", cub)).toBe(false);
  });

  it("Calamity, Galloping Inferno: saddled, two tapped and attacking copies of a nonlegendary creature that saddled it, sacrificed at the end step", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Calamity, Galloping Inferno", "Bear Cub", "Bruse Tarl, Roving Rancher"] } });
    // Without a Mount: nothing.
    let n = setup();
    n = attack(n, [idOf(n, "p1", "battlefield", "Calamity, Galloping Inferno")]);
    n = settleNoBlocks(n);
    expect(idsOf(n, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    let s = setup();
    const calamity = idOf(s, "p1", "battlefield", "Calamity, Galloping Inferno");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const bruse = idOf(s, "p1", "battlefield", "Bruse Tarl, Roving Rancher");
    expect(chars(s, calamity).keywords).toContain("haste");
    s = activate(s, calamity, "Saddle", { tap: [bear, bruse] });
    s = passBoth(s);
    s = attack(s, [calamity]);
    s = settleNoBlocks(s);
    const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => id !== bear);
    expect(copies).toHaveLength(2);
    expect(copies.every((id) => s.objects[id]?.tapped && s.combat?.attackers.some((a) => a.id === id))).toBe(true);
    // Bruse Tarl is legendary: no copy.
    expect(idsOf(s, "p1", "battlefield", "Bruse Tarl, Roving Rancher")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
    // Two nonlegendary creatures saddled it: a copy of each, your choice.
    let m = scenario({ p1: { battlefield: ["Calamity, Galloping Inferno", "Bear Cub", "Swab Goblin"] } });
    const cal = idOf(m, "p1", "battlefield", "Calamity, Galloping Inferno");
    const cub = idOf(m, "p1", "battlefield", "Bear Cub");
    const goblin = idOf(m, "p1", "battlefield", "Swab Goblin");
    m = activate(m, cal, "Saddle", { tap: [cub, goblin] });
    m = passBoth(m);
    m = attack(m, [cal]);
    let picks = 0;
    m = settleNoBlocks(m, (req) => {
      if (req.type !== "pick" || !req.options.includes(cub)) return undefined;
      expect(req.options).toContain(goblin);
      return [picks++ === 0 ? cub : goblin];
    });
    expect(idsOf(m, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(idsOf(m, "p1", "battlefield", "Swab Goblin")).toHaveLength(2);
  });

  it("Caustic Bronco: when attacking, the top card to hand; you lose life equal to its mana value, or each opponent does if it is saddled", () => {
    const run = (saddled: boolean) => {
      let s = scenario({ p1: { battlefield: ["Caustic Bronco", "Serra Angel"], library: ["Shivan Dragon", "Forest"] } });
      const bronco = idOf(s, "p1", "battlefield", "Caustic Bronco");
      if (saddled) {
        s = activate(s, bronco, "Saddle", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] });
        s = passBoth(s);
      }
      s = attack(s, [bronco]);
      s = settle(s);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shivan Dragon"]);
      return [s.players.p1?.life, s.players.p2?.life];
    };
    expect(run(false)).toEqual([14, 20]);
    expect(run(true)).toEqual([20, 14]);
  });

  it("Claim Jumper: if an opponent has more lands, a tapped Plains, then a second one if they still have more", () => {
    const run = (opponentLands: number) => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Claim Jumper"], library: [...lands("Plains", 3), "Forest"] },
        p2: { battlefield: lands("Island", opponentLands) },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Claim Jumper") });
      s = settle(s);
      expect(chars(s, idOf(s, "p1", "battlefield", "Claim Jumper")).keywords).toContain("vigilance");
      const plains = idsOf(s, "p1", "battlefield", "Plains");
      expect(plains.slice(3).every((id) => s.objects[id]?.tapped)).toBe(true);
      return plains.length - 3;
    };
    expect(run(6)).toBe(2);
    expect(run(4)).toBe(1);
    expect(run(3)).toBe(0);
  });

  it("Colossal Rattlewurm: flash if you control a Desert; {1}{G}, exile it from the graveyard: a tapped Desert", () => {
    const flash = (desert: boolean) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Forest", 4), ...(desert ? ["Conduit Pylons"] : [])], hand: ["Colossal Rattlewurm"] },
      });
      s = act(s, "p2", { type: "pass" });
      return castable(s, "p1", idOf(s, "p1", "hand", "Colossal Rattlewurm"));
    };
    expect(flash(false)).toBe(false);
    expect(flash(true)).toBe(true);
    let s = scenario({
      p1: { battlefield: lands("Forest", 2), graveyard: ["Colossal Rattlewurm"], library: ["Forest", "Conduit Pylons"] },
    });
    s = activate(s, idOf(s, "p1", "graveyard", "Colossal Rattlewurm"));
    s = settle(s);
    expect(exiled(s, "Colossal Rattlewurm")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Conduit Pylons")]?.tapped).toBe(true);
  });

  it("Duelist of the Mind: power equal to cards drawn this turn; on the first crime of the turn only, draw then discard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Duelist of the Mind", ...lands("Mountain", 4)],
        hand: ["Lightning Strike", "Lightning Strike", "Shivan Dragon"],
      },
    });
    const duelist = idOf(s, "p1", "battlefield", "Duelist of the Mind");
    expect(chars(s, duelist).power).toBe(0);
    expect(chars(s, duelist).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s, (req, _p, cur) => (req.type === "pick" ? pickNamed(cur, req, "Shivan Dragon") : undefined));
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Lightning Strike", "Shivan Dragon"]);
    expect(chars(s, duelist).power).toBe(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s);
    // Second crime: no new trigger.
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(chars(s, duelist).power).toBe(1);
  });

  it("Dust Animus: with five or more untapped lands, enters with two +1/+1 counters and a lifelink counter; plot {1}{W}", () => {
    const run = (n: number) => {
      let s = scenario({ p1: { battlefield: lands("Plains", n), hand: ["Dust Animus"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dust Animus") });
      return settle(s);
    };
    const big = run(7);
    const animus = idOf(big, "p1", "battlefield", "Dust Animus");
    expect(chars(big, animus).power).toBe(4);
    expect(chars(big, animus).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    const small = run(6);
    const plain = idOf(small, "p1", "battlefield", "Dust Animus");
    expect(chars(small, plain).power).toBe(2);
    expect(chars(small, plain).keywords).not.toContain("lifelink");
    let p = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Dust Animus"] } });
    p = activate(p, idOf(p, "p1", "hand", "Dust Animus"), "Plot");
    expect(p.exile.some((id) => nameOf(p, id) === "Dust Animus" && p.objects[id]?.exiledVia?.kind === "plot")).toBe(true);
  });

  it("Eriette, the Beguiler: an Aura attached to an opposing permanent with mana value less than or equal to its own gives you control of it", () => {
    let s = scenario({
      p1: { battlefield: ["Eriette, the Beguiler", ...lands("Plains", 4)], hand: ["Pacifism", "Pacifism"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, idOf(s, "p1", "battlefield", "Eriette, the Beguiler")).keywords).toContain("lifelink");
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Pacifism")[0] as string, targets: { enchant: [bear] } });
    s = settle(s);
    expect(s.objects[bear]?.controller).toBe("p1");
    // Serra Angel (mana value 5) costs more than Pacifism (mana value 2).
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pacifism"), targets: { enchant: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.controller).toBe("p2");
  });

  it("Eriette, the Beguiler: a trigger — control lasts while the Aura is attached, even after Eriette leaves; not retroactive (PLAN-L L5)", () => {
    let s = scenario({
      p1: { battlefield: ["Eriette, the Beguiler", ...lands("Plains", 4)], hand: ["Pacifism"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pacifism"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.controller).toBe("p1");
    // Eriette leaves: the Bear stays.
    moveObject(s, idOf(s, "p1", "battlefield", "Eriette, the Beguiler"), "graveyard");
    s = settle(act(s, "p1", { type: "pass" }));
    expect(s.objects[bear]?.controller).toBe("p1");
    // The Aura leaves: the Bear goes back.
    destroy(s, idOf(s, "p1", "battlefield", "Pacifism"));
    s = settle(act(s, "p1", { type: "pass" }));
    expect(s.objects[bear]?.controller).toBe("p2");
    // An Aura already attached when Eriette arrives: no steal.
    let t = scenario({
      p1: { battlefield: [...lands("Plains", 6)], hand: ["Pacifism", "Eriette, the Beguiler"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear2 = idOf(t, "p2", "battlefield", "Bear Cub");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Pacifism"), targets: { enchant: [bear2] } }));
    moveObject(t, idOf(t, "p1", "hand", "Eriette, the Beguiler"), "battlefield");
    t = settle(act(t, "p1", { type: "pass" }));
    expect(idsOf(t, "p1", "battlefield", "Eriette, the Beguiler")).toHaveLength(1);
    expect(t.objects[bear2]?.controller).toBe("p2");
  });

  it("Fblthp, Lost on the Range: plot the top nonland card by paying its mana cost, a special action from the library (PLAN-M M10d); ward {2}", () => {
    let s = scenario({
      p1: { battlefield: ["Fblthp, Lost on the Range", ...lands("Forest", 2)], library: ["Bear Cub", ...lands("Forest", 6)] },
    });
    const top = s.players.p1?.library[0] as string;
    const plot = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === top);
    expect(plot?.type === "activate" && plainText(plot.label ?? "")).toBe("Plot");
    // A special action: no stack, the card is plotted at once.
    s = act(s, "p1", { type: "activate", source: top, ability: plot?.type === "activate" ? plot.ability : -1 });
    expect(s.stack).toHaveLength(0);
    const cub = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(s.objects[cub]?.exiledVia?.kind).toBe("plot");
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
    // A land on top: nothing to plot.
    const l = scenario({ p1: { battlefield: ["Fblthp, Lost on the Range", ...lands("Forest", 2)] } });
    const landTop = l.players.p1?.library[0];
    expect(legalActions(l, "p1").some((a) => a.type === "activate" && a.source === landTop)).toBe(false);
    // Without Fblthp: no plot from the library.
    const n = scenario({ p1: { battlefield: lands("Forest", 2), library: ["Bear Cub"] } });
    const nTop = n.players.p1?.library[0];
    expect(legalActions(n, "p1").some((a) => a.type === "activate" && a.source === nTop)).toBe(false);
    // Ward {2}: an opposing spell that targets it is countered for lack of payment.
    let w = scenario({
      active: "p2",
      p1: { battlefield: ["Fblthp, Lost on the Range"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    const f = idOf(w, "p1", "battlefield", "Fblthp, Lost on the Range");
    w = act(w, "p2", { type: "cast", card: idOf(w, "p2", "hand", "Lightning Strike"), targets: { t: [f] } });
    w = settle(w);
    expect(w.objects[f]?.zone).toBe("battlefield");
    expect(namesIn(w, w.players.p2?.graveyard)).toEqual(["Lightning Strike"]);
  });

  it("Fortune, Loyal Steed: scry 2 on entering; saddled and attacking, at end of combat it and the creature that saddled it are exiled then returned", () => {
    let e = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Fortune, Loyal Steed"] } });
    e = act(e, "p1", { type: "cast", card: idOf(e, "p1", "hand", "Fortune, Loyal Steed") });
    let scried = 0;
    e = settle(e, (req) => {
      if (req.intent === "scryBottom" && req.type === "pick") scried = req.options.length;
      return undefined;
    });
    expect(scried).toBe(2);
    let s = scenario({ p1: { battlefield: ["Fortune, Loyal Steed", "Bear Cub"] } });
    const fortune = idOf(s, "p1", "battlefield", "Fortune, Loyal Steed");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activate(s, fortune, "Saddle", { tap: [bear] });
    s = passBoth(s);
    s = attack(s, [fortune]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(18);
    const newFortune = idOf(s, "p1", "battlefield", "Fortune, Loyal Steed");
    const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(newFortune).not.toBe(fortune);
    expect(newBear).not.toBe(bear);
    expect(s.objects[newFortune]?.tapped).toBe(false);
    expect(s.objects[newBear]?.tapped).toBe(false);
  });
});

describe("Outlaws of Thunder Junction, lot K8 : rares (2)", () => {
  type S = GameState;
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  /** Index of the mode (or the combination of modes of a spree spell) whose label is `label`. */
  const modeOf = (s: S, name: string, label: string) => {
    const card = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    if (!mode) throw new Error(`mode "${label}" not found for ${name}`);
    return mode.index;
  };
  const treasures = (s: S, p: "p1" | "p2") => idsOf(s, p, "battlefield", "Treasure");

  it("Freestrider Lookout: on the first crime of the turn, a land among the top five enters tapped; once each turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Freestrider Lookout", ...lands("Mountain", 4)],
        hand: ["Shock", "Shock"],
        library: ["Bear Cub", "Plains", "Serra Angel", "Island", "Giant Growth", "Swamp"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Freestrider Lookout")).keywords).toContain("reach");
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Shock")[0] as string, targets: { t: ["p2"] } });
    s = settle(s, (req, _p, x) => pickNamed(x, req, "Plains"));
    const plains = idOf(s, "p1", "battlefield", "Plains");
    expect(s.objects[plains]?.tapped).toBe(true);
    // The four other cards looked at go to the bottom; Swamp (sixth) is now on top.
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Swamp");
    expect(lib.slice(1).sort()).toEqual(["Bear Cub", "Giant Growth", "Island", "Serra Angel"]);
    // Second crime of the same turn: no new trigger.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p1?.library).toHaveLength(5);
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(0);
  });

  it("Great Train Heist: +1/+0 and first strike until end of turn; a tapped Treasure per creature that damages the opponent", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Mountain", 4)], hand: ["Great Train Heist"] },
    });
    const mode = modeOf(s, "Great Train Heist", "+1/+0 and first strike + Combat damage: Treasures");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Great Train Heist"), mode, targets: { p: ["p2"] } });
    s = settle(s);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const bears = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, cub).power).toBe(3);
    expect(chars(s, cub).toughness).toBe(2);
    expect(chars(s, cub).keywords).toContain("firstStrike");
    s = attack(s, [cub, bears]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(15);
    const t = treasures(s, "p1");
    expect(t).toHaveLength(2);
    expect(t.every((id) => s.objects[id]?.tapped)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, cub).power).toBe(2);
    expect(chars(s, cub).keywords).not.toContain("firstStrike");
  });

  it("Great Train Heist: only the creatures that damage the chosen opponent make Treasures (three players, PLAN-L L4)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Mountain", 2)], hand: ["Great Train Heist"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Great Train Heist"),
      mode: modeOf(s, "Great Train Heist", "Combat damage: Treasures"),
      targets: { p: ["p3"] },
    });
    s = settle(s);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: cub, defender: "p2" },
        { id: elves, defender: "p3" },
      ],
    });
    s = throughCombat(s);
    expect(treasures(s, "p1")).toHaveLength(1);
  });

  it("Great Train Heist: untaps your creatures and adds a combat phase", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Great Train Heist"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = advanceUntil(s, (x) => x.turn.step === "endCombat" && x.pending?.kind === "priority");
    expect(s.objects[cub]?.tapped).toBe(true);
    expect(s.players.p2?.life).toBe(18);
    const mode = modeOf(s, "Great Train Heist", "Untap your creatures, additional combat");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Great Train Heist"), mode });
    s = settle(s);
    expect(s.objects[cub]?.tapped).toBe(false);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cub, defender: "p2" }] });
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(16);
  });

  it("Great Train Heist: outside your combat phase, the first mode untaps your creatures without an extra combat", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Mountain", 4)], hand: ["Great Train Heist"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const mode = modeOf(s, "Great Train Heist", "Untap your creatures, additional combat");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Great Train Heist"), mode }));
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(s.turn.addedPhases).toBeUndefined();
    // Only one combat phase this turn.
    s = attack(s, [cub]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(18);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.active === "p2");
    expect(s.turn.active).toBe("p2");
  });

  it("Hell to Pay: X damage to a creature; as many tapped Treasures as excess damage", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 7), hand: ["Hell to Pay", "Hell to Pay"] },
      p2: { battlefield: ["Bear Cub", { name: "Serra Angel", damage: 1 }] },
    });
    // 4 damage to a 2/2: 2 excess.
    s = act(s, "p1", {
      type: "cast",
      card: idsOf(s, "p1", "hand", "Hell to Pay")[0] as string,
      x: 4,
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(treasures(s, "p1")).toHaveLength(2);
    expect(treasures(s, "p1").every((id) => s.objects[id]?.tapped)).toBe(true);
    // 1 damage to a 4/4 already damaged once: not lethal, no Treasure.
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hell to Pay"), x: 1, targets: { t: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.damage).toBe(2);
    expect(treasures(s, "p1")).toHaveLength(2);
  });
  it("Hellspur Posse Boss: two 1/1 red Mercenaries on entering; your other outlaws have haste", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Bear Cub", sick: true }, { name: "Forsaken Miner", sick: true }, ...lands("Mountain", 4)],
        hand: ["Hellspur Posse Boss"],
      },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hellspur Posse Boss") });
    s = settle(s);
    const boss = idOf(s, "p1", "battlefield", "Hellspur Posse Boss");
    const mercs = idsOf(s, "p1", "battlefield", "Mercenary");
    expect(mercs).toHaveLength(2);
    const merc = mercs[0] as string;
    expect(chars(s, merc).power).toBe(1);
    expect(chars(s, merc).toughness).toBe(1);
    expect(chars(s, merc).colors).toEqual(["R"]);
    expect(chars(s, merc).keywords).toContain("haste");
    expect(chars(s, idOf(s, "p1", "battlefield", "Forsaken Miner")).keywords).toContain("haste");
    // Neither Bear Cub (not an outlaw) nor the Boss itself (\"other\").
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
    expect(chars(s, boss).keywords).not.toContain("haste");
    // Token: {T}: one of your creatures gets +1/+0; not an opposing creature.
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(() => act(s, "p1", { type: "activate", source: merc, ability: 0, targets: { t: [elves] } })).toThrow();
    s = act(s, "p1", { type: "activate", source: merc, ability: 0, targets: { t: [boss] } });
    s = settle(s);
    expect(chars(s, boss).power).toBe(3);
    expect(chars(s, boss).toughness).toBe(4);
  });

  it("Insatiable Avarice: search for a card and put it on top; a targeted player draws three cards and loses 3 life", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Insatiable Avarice"], library: [...lands("Forest", 6), "Serra Angel"] },
    });
    const mode = modeOf(
      s,
      "Insatiable Avarice",
      "Search for a card, put it on top + A player draws three cards and loses 3 life",
    );
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Insatiable Avarice"), mode, targets: { p: ["p1"] } });
    s = settle(s, (req, _p, x) => pickNamed(x, req, "Serra Angel"));
    // The searched card is on top after the shuffle: it is one of the three drawn cards.
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Forest", "Serra Angel"]);
    expect(s.players.p1?.life).toBe(17);
    // Mode alone on the opponent.
    let t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Insatiable Avarice"] } });
    const m2 = modeOf(t, "Insatiable Avarice", "A player draws three cards and loses 3 life");
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Insatiable Avarice"), mode: m2, targets: { p: ["p2"] } });
    t = settle(t);
    expect(t.players.p2?.hand).toHaveLength(3);
    expect(t.players.p2?.life).toBe(17);
    expect(t.players.p1?.life).toBe(20);
  });

  it("Kaervek, the Punisher: on each crime, exile a black card from your graveyard and copy it; casting the copy costs 2 life", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: ["Kaervek, the Punisher", ...lands("Mountain", 1), ...lands("Swamp", 1)],
          hand: ["Shock"],
          graveyard: ["Infestation Sage", "Bear Cub"],
        },
      });
    let s = start();
    const sage = idOf(s, "p1", "graveyard", "Infestation Sage");
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
    // Bear Cub (green) is not a possible target.
    expect(s.pending?.kind === "choice" && s.pending.request.type === "pick" && s.pending.request.options).not.toContain(cub);
    s = act(s, "p1", { type: "choose", values: [sage] });
    s = untilCastNow(s);
    expect(s.players.p1?.graveyard).not.toContain(sage);
    expect(exiled(s, "Infestation Sage")).toHaveLength(2);
    const copy = castNowOf(s)?.cards[0] as string;
    s = act(s, "p1", { type: "cast", card: copy });
    s = settle(s);
    expect(s.players.p1?.life).toBe(18);
    const tokens = idsOf(s, "p1", "battlefield", "Infestation Sage");
    expect(tokens).toHaveLength(1);
    expect(s.objects[tokens[0] as string]?.isToken).toBe(true);
    expect(s.players.p2?.life).toBe(18);
    // Copy not cast: no life loss; the card stays exiled.
    let t = start();
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
    t = act(t, "p1", { type: "choose", values: [idOf(t, "p1", "graveyard", "Infestation Sage")] });
    t = untilCastNow(t);
    t = act(t, "p1", { type: "pass" });
    t = settle(t);
    expect(t.players.p1?.life).toBe(20);
    expect(exiled(t, "Infestation Sage")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Infestation Sage")).toHaveLength(0);
  });

  it("Kambal, Profiteering Mayor: tapped copies of opposing tokens once each turn; your tokens make each opponent lose 1 life and you gain 1", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Kambal, Profiteering Mayor"] },
      p2: { battlefield: lands("Mountain", 4), hand: ["Dragon Fodder", "Dragon Fodder"] },
    });
    s = act(s, "p2", { type: "cast", card: idsOf(s, "p2", "hand", "Dragon Fodder")[0] as string });
    s = settle(s);
    const mine = idsOf(s, "p1", "battlefield", "Goblin");
    expect(mine).toHaveLength(2);
    expect(mine.every((id) => s.objects[id]?.isToken && s.objects[id]?.tapped)).toBe(true);
    expect(chars(s, mine[0] as string).power).toBe(1);
    // A single batch of tokens entered: a single drain.
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(21);
    // Second opposing batch of the same turn: no copy (once each turn), no drain (opposing tokens).
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Dragon Fodder") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(2);
    expect(idsOf(s, "p2", "battlefield", "Goblin")).toHaveLength(4);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Kambal, Profiteering Mayor: only a copy of each token of the batch (not of tokens that entered earlier in the turn)", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Kambal, Profiteering Mayor"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Dragon Fodder"] },
    });
    // An opposing Cat that entered this turn, before Kambal.
    createTokens(s, "p2", TOKEN_SPECS.Cat as TokenSpec, 1);
    moveObject(s, idOf(s, "p1", "hand", "Kambal, Profiteering Mayor"), "battlefield");
    expect(s.triggers).toHaveLength(0);
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Dragon Fodder") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(0);
  });

  it("Kellan Joins Up: plot a nonland card with mana value 3 or less from your hand; a legendary creature entering gives a counter to your creatures", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Bear Cub",
          "Forest",
          "Plains",
          "Island",
          "Island",
          "Mountain",
          "Forest",
          "Forest",
          "Mountain",
          "Mountain",
          "Island",
          "Island",
        ],
        hand: ["Kellan Joins Up", "Llanowar Elves", "Shivan Dragon", "Malcolm, the Eyes", "Swab Goblin", "Swamp"],
      },
    });
    const elves = idOf(s, "p1", "hand", "Llanowar Elves");
    let options: string[] = [];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kellan Joins Up") });
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || !req.options.includes(elves)) return undefined;
      options = namesIn(cur, req.options) as string[];
      return [elves];
    });
    expect(options.sort()).toEqual(["Llanowar Elves", "Malcolm, the Eyes", "Swab Goblin"]);
    expect(s.exile.some((id) => nameOf(s, id) === "Llanowar Elves" && s.objects[id]?.exiledVia?.kind === "plot")).toBe(true);
    // A nonlegendary creature: nothing.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Swab Goblin") });
    s = settle(s);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[cub]?.counters["+1/+1"] ?? 0).toBe(0);
    // A legendary creature: a counter on each of your creatures, itself included.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Malcolm, the Eyes") });
    s = settle(s);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Swab Goblin")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Malcolm, the Eyes")]?.counters["+1/+1"]).toBe(1);
  });

  it("Laughing Jasper Flint: at upkeep, exile as many opposing cards as outlaws, castable this turn with any mana", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Laughing Jasper Flint", "Forsaken Miner", "Bear Cub", ...lands("Forest", 4)] },
      p2: { library: ["Lightning Strike", "Shock", "Giant Growth", ...lands("Forest", 5)] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
    // Two outlaws (Jasper, Forsaken Miner): two cards exiled.
    expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    expect(exiled(s, "Shock")).toHaveLength(1);
    expect(exiled(s, "Giant Growth")).toHaveLength(0);
    const strike = exiled(s, "Lightning Strike")[0] as string;
    s = act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
    // End of turn: Shock is no longer castable.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const shock = exiled(s, "Shock")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === shock)).toBe(false);
  });

  it("Laughing Jasper Flint: creatures you control but don't own are Mercenaries", () => {
    let s = scenario({
      p1: { battlefield: ["Laughing Jasper Flint", "Llanowar Elves", ...lands("Mountain", 3)], hand: ["Take for a Ride"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(chars(s, cub).subtypes).not.toContain("Mercenary");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Take for a Ride"), targets: { t: [cub] } });
    s = settle(s);
    expect(s.objects[cub]?.controller).toBe("p1");
    expect(chars(s, cub).subtypes).toContain("Mercenary");
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).subtypes).not.toContain("Mercenary");
  });

  it("Lilah, Undefeated Slickshot: prowess; a multicolored instant or sorcery cast from hand is exiled and plotted as it resolves", () => {
    let s = scenario({
      p1: { battlefield: ["Lilah, Undefeated Slickshot", "Island", ...lands("Mountain", 2)], hand: ["Slick Sequence", "Shock"] },
    });
    const lilah = idOf(s, "p1", "battlefield", "Lilah, Undefeated Slickshot");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Slick Sequence"), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect([chars(s, lilah).power, chars(s, lilah).toughness]).toEqual([4, 4]);
    const plotted = exiled(s, "Slick Sequence")[0] as string;
    expect(s.objects[plotted]?.exiledVia?.kind).toBe("plot");
    expect(idsOf(s, "p1", "graveyard", "Slick Sequence")).toHaveLength(0);
    // A monocolored instant goes to the graveyard.
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
    expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
    expect(chars(s, lilah).power).toBe(5);
    // Plotted: cast for free on a later turn.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === plotted);
    expect(opt?.type === "cast" && opt.free).toBe(true);
    // Cast from exile: it goes to the graveyard.
    s = settle(act(s, "p1", { type: "cast", card: plotted, targets: { t: ["p2"] } }));
    expect(idsOf(s, "p1", "graveyard", "Slick Sequence")).toHaveLength(1);
  });

  it("Marchesa, Dealer of Death: on each crime, pay {1}: one of the top two cards to hand (mandatory), the other to the graveyard", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Marchesa, Dealer of Death", "Mountain", "Island"],
          hand: ["Shock"],
          library: ["Opt", "Plains", "Forest"],
        },
      });
    let s = setup();
    let pick: ChoiceRequest | undefined;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Opt")) {
        pick = req;
        return pickNamed(cur, req, "Opt");
      }
      return undefined;
    });
    expect(pick?.type === "pick" && [pick.min, pick.max]).toEqual([1, 1]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Plains", "Shock"]);
    expect(idsOf(s, "p1", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
    // Without paying: nothing.
    let t = setup();
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Shock"), targets: { t: ["p2"] } }), no);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Shock"]);
  });

  it("Obeka, Splitter of Seconds: combat damage to a player, as many additional upkeep steps after combat", () => {
    const UPKEEP = customCard({
      name: "Horloge d'entretien",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [triggered(when.step("upkeep"), [fx.gainLife(1)], { label: "1 PV" })],
    });
    let s = scenario({ p1: { battlefield: ["Obeka, Splitter of Seconds", UPKEEP], library: ["Forest", "Island"] } });
    const obeka = idOf(s, "p1", "battlefield", "Obeka, Splitter of Seconds");
    expect(chars(s, obeka).keywords).toContain("menace");
    const { s: after, steps } = stepTrail(attack(s, [obeka]), (x) => x.turn.step === "main2");
    s = after;
    expect(s.players.p2?.life).toBe(18);
    // Two real upkeep steps after the combat phase (neither untap nor draw), then the main phase.
    expect(steps.slice(-4)).toEqual(["endCombat", "upkeep", "upkeep", "main2"]);
    expect(s.players.p1?.hand).toHaveLength(0);
    // The \"at the beginning of your upkeep\" ability triggers at each.
    expect(s.players.p1?.life).toBe(22);
  });

  it("One Last Job: the three modes, an Aura or an Equipment returns attached to a creature chosen on resolution", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swab Goblin", ...lands("Plains", 7)],
        hand: ["One Last Job"],
        graveyard: ["Bear Cub", "Bounding Felidar", "Lavaspur Boots"],
      },
    });
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    const felidar = idOf(s, "p1", "graveyard", "Bounding Felidar");
    const boots = idOf(s, "p1", "graveyard", "Lavaspur Boots");
    const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
    const label = "A creature + A Mount or a Vehicle + An attached Aura or Equipment";
    const job = idOf(s, "p1", "hand", "One Last Job");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === job);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    // Bear Cub is not a Mount; Lavaspur Boots is not a creature.
    expect(mode?.targets.find((t) => t.id === "m")?.legal).toEqual([felidar]);
    expect(mode?.targets.find((t) => t.id === "c")?.legal).not.toContain(boots);
    s = act(s, "p1", {
      type: "cast",
      card: job,
      mode: modeOf(s, "One Last Job", label),
      targets: { c: [cub], m: [felidar], a: [boots] },
    });
    // The creature that receives the Equipment is chosen on resolution (PLAN-D, D7): the one returned by the first mode
    // may be it.
    const offered: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick" || !req.prompt.startsWith("One Last Job")) return undefined;
      offered.push(...req.options.map((id) => nameOf(cur, id) ?? id));
      return req.options.filter((id) => nameOf(cur, id) === "Bear Cub");
    });
    expect(offered.sort()).toEqual(["Bear Cub", "Bounding Felidar", "Swab Goblin"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bounding Felidar")).toHaveLength(1);
    const onField = idOf(s, "p1", "battlefield", "Lavaspur Boots");
    expect(s.objects[onField]?.attachedTo).toBe(idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(s.objects[onField]?.attachedTo).not.toBe(goblin);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["One Last Job"]);
  });

  it("Ornery Tumblewagg: at the beginning of combat, a +1/+1 counter on the targeted creature; saddled and attacking, doubles its counters", () => {
    let s = scenario({ p1: { battlefield: ["Ornery Tumblewagg", "Bear Cub", "Swab Goblin"] } });
    const wagg = idOf(s, "p1", "battlefield", "Ornery Tumblewagg");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const goblin = idOf(s, "p1", "battlefield", "Swab Goblin");
    const saddle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === wagg);
    s = act(s, "p1", {
      type: "activate",
      source: wagg,
      ability: saddle?.type === "activate" ? saddle.ability : -1,
      tap: [goblin],
    });
    s = passBoth(s);
    const pickCub: Answer = (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined);
    for (let i = 0; i < 100 && s.pending?.kind !== "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: pickCub(p.request, p.player, s) ?? p.request.suggested });
      else break;
    }
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wagg, defender: "p2" }] });
    s = settleNoBlocks(s, pickCub);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
  });

  it("Outcaster Trailblazer: one mana of the color chosen on entering; another creature with power 4 or more entering draws", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Outcaster Trailblazer"], library: ["Island", "Island", "Island"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Outcaster Trailblazer") }), (req) =>
      req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
    );
    expect(s.players.p1?.manaPool.R).toBe(1);
    let t = scenario({
      p1: {
        battlefield: ["Outcaster Trailblazer", ...lands("Plains", 5), "Forest", "Forest"],
        hand: ["Bear Cub", "Serra Angel"],
      },
    });
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Bear Cub") }));
    expect(t.players.p1?.hand).toHaveLength(1);
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Serra Angel") }));
    expect(t.players.p1?.hand).toHaveLength(1);
    // Complot {2}{G}.
    const u = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Outcaster Trailblazer"] } });
    const card = idOf(u, "p1", "hand", "Outcaster Trailblazer");
    expect(legalActions(u, "p1").some((a) => a.type === "activate" && a.source === card && a.label?.startsWith("Plot"))).toBe(
      true,
    );
  });
});

describe("Outlaws of Thunder Junction, lot K8 : rares (3)", () => {
  /** Index of the mode (modal spell or spree) whose label is `label`. */
  const modeOf = (s: GameState, name: string, label: string) => {
    const card = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    if (!mode) throw new Error(`mode "${label}" not found for ${name}`);
    return mode.index;
  };
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: GameState, source: string, label: string, extra: object = {}) => {
    const opt = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === source && plainText(a.label ?? "").startsWith(label),
    );
    if (opt?.type !== "activate") throw new Error(`ability "${label}" not found`);
    return act(s, "p1", { type: "activate", source, ability: opt.ability, ...extra });
  };
  /** Saddles the Mount `mount` by tapping `riders`. */
  const saddle = (s: GameState, mount: string, riders: string[]) => activate(s, mount, "Saddle", { tap: riders });

  it("Pillage the Bog: look at twice as many cards as your lands, take exactly one, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Forest"],
        hand: ["Pillage the Bog"],
        library: ["Island", "Plains", "Serra Angel", "Mountain", "Bear Cub", "Shock", "Opt", "Swamp"],
      },
    });
    const seen: ChoiceRequest[] = [];
    s = cast(s, "p1", "Pillage the Bog");
    s = settle(s, (req, _p, cur) => {
      seen.push(req);
      return pickNamed(cur, req, "Serra Angel");
    });
    const pick = seen.find((r) => r.type === "pick");
    // Three lands: the top six cards; one card to take, mandatory.
    expect(pick?.type === "pick" && pick.options.length).toBe(6);
    expect(pick?.type === "pick" && pick.min).toBe(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
    // The two cards not looked at stay on top, the other five go to the bottom.
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib.slice(0, 2)).toEqual(["Opt", "Swamp"]);
    expect([...lib.slice(2)].sort()).toEqual(["Bear Cub", "Island", "Mountain", "Plains", "Shock"]);
  });

  it("Pitiless Carnage: sacrifice any number of permanents, then draw that many cards", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Bear Cub", "Serra Angel"], hand: ["Pitiless Carnage"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Pitiless Carnage");
    s = settle(s, picking([bear, angel]));
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Pitiless Carnage", "Serra Angel"]);
    expect(s.players.p1?.hand).toHaveLength(2);
    // No sacrifice: no card drawn.
    let t = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Pitiless Carnage"] } });
    t = cast(t, "p1", "Pitiless Carnage");
    t = settle(t, (req) => (req.type === "pick" ? [] : undefined));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Riku of Many Paths: a modal spell triggers the ability (1/1 flying Bird); a nonmodal spell does not", () => {
    let s = scenario({
      p1: {
        battlefield: ["Riku of Many Paths", ...lands("Swamp", 6), ...lands("Forest", 2)],
        hand: ["Rush of Dread", "Bear Cub"],
      },
    });
    s = cast(s, "p1", "Rush of Dread", {
      mode: modeOf(s, "Rush of Dread", "They lose half their life"),
      targets: { c: ["p2"] },
    });
    let modes: string[] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
      modes = req.options.map((o) => req.labels?.[o] ?? "");
      return req.options.filter((o) => req.labels?.[o] === "1/1 flying Bird");
    });
    // One mode chosen for the spell: up to one of Riku's.
    expect(modes).toEqual(["Exile the top card, playable", "+1/+1 counter and trample", "1/1 flying Bird", "None"]);
    const birds = idsOf(s, "p1", "battlefield", "Bird");
    expect(birds).toHaveLength(1);
    expect(chars(s, birds[0] as string).keywords).toContain("flying");
    expect(s.players.p2?.life).toBe(10);
    // Bear Cub is not a modal spell.
    s = cast(s, "p1", "Bear Cub");
    expect(s.triggers).toHaveLength(0);
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
  });

  it("Riku of Many Paths: up to X modes, X the number of modes chosen for the spell (PLAN-M M10d)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Riku of Many Paths", ...lands("Swamp", 8)],
        hand: ["Rush of Dread"],
        library: lands("Forest", 3),
      },
      p2: { battlefield: ["Bear Cub"], life: 20 },
    });
    const riku = idOf(s, "p1", "battlefield", "Riku of Many Paths");
    s = cast(s, "p1", "Rush of Dread", {
      mode: modeOf(s, "Rush of Dread", "They sacrifice half their creatures + They lose half their life"),
      targets: { a: ["p2"], c: ["p2"] },
    });
    let modes: string[] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
      modes = req.options.map((o) => plainText(req.labels?.[o] ?? ""));
      return req.options.filter((o) => plainText(req.labels?.[o] ?? "") === "+1/+1 counter and trample + 1/1 flying Bird");
    });
    // Two modes chosen: the pairs are offered, not the three together.
    expect(modes).toContain("Exile the top card, playable + 1/1 flying Bird");
    expect(modes).not.toContain("Exile the top card, playable + +1/+1 counter and trample + 1/1 flying Bird");
    expect(idsOf(s, "p1", "battlefield", "Bird")).toHaveLength(1);
    expect(s.objects[riku]?.counters["+1/+1"]).toBe(1);
  });

  it("Rush of Dread: the three modes, each rounded up, for the targeted opponent", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 8), hand: ["Rush of Dread"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel", "Riku of Many Paths"], hand: lands("Forest", 3), life: 15 },
    });
    s = cast(s, "p1", "Rush of Dread", {
      mode: modeOf(
        s,
        "Rush of Dread",
        "They sacrifice half their creatures + They discard half their hand + They lose half their life",
      ),
      targets: { a: ["p2"], b: ["p2"], c: ["p2"] },
    });
    s = settle(s);
    // 3 creatures → 2 sacrificed; 3 cards → 2 discarded; 15 life → 8 lost.
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p2?.life).toBe(7);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Satoru, the Infiltrator: draws if the creature enters without having been cast, not if mana was spent to cast it", () => {
    let s = scenario({
      p1: {
        battlefield: ["Satoru, the Infiltrator", ...lands("Forest", 8)],
        hand: ["Bear Cub", "Smuggler's Surprise", "Serra Angel"],
      },
    });
    s = cast(s, "p1", "Bear Cub");
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Serra Angel", "Smuggler's Surprise"]);
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    s = cast(s, "p1", "Smuggler's Surprise", {
      mode: modeOf(s, "Smuggler's Surprise", "Up to two creatures from your hand"),
    });
    s = settle(s, picking([angel]));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // The Angel was put onto the battlefield without being cast: one card drawn.
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
  });

  it("Seraphic Steed: a 3/3 flying Angel only if it attacks while saddled", () => {
    let s = scenario({ p1: { battlefield: ["Seraphic Steed", "Serra Angel"] } });
    const steed = idOf(s, "p1", "battlefield", "Seraphic Steed");
    expect(chars(s, steed).keywords).toEqual(expect.arrayContaining(["firstStrike", "lifelink"]));
    s = attack(s, [steed]);
    s = settleNoBlocks(s);
    expect(idsOf(s, "p1", "battlefield", "Angel")).toHaveLength(0);

    let t = scenario({ p1: { battlefield: ["Seraphic Steed", "Serra Angel"] } });
    const steed2 = idOf(t, "p1", "battlefield", "Seraphic Steed");
    t = saddle(t, steed2, [idOf(t, "p1", "battlefield", "Serra Angel")]);
    t = passBoth(t);
    t = attack(t, [steed2]);
    t = settleNoBlocks(t);
    const angels = idsOf(t, "p1", "battlefield", "Angel");
    expect(angels).toHaveLength(1);
    const a = chars(t, angels[0] as string);
    expect([a.power, a.toughness]).toEqual([3, 3]);
    expect(a.keywords).toContain("flying");
  });

  it("Slickshot Show-Off: +2/+0 until end of turn for each noncreature spell, nothing for a creature spell", () => {
    let s = scenario({
      p1: { battlefield: ["Slickshot Show-Off", "Island", "Island", "Forest", "Forest"], hand: ["Opt", "Bear Cub"] },
    });
    const show = idOf(s, "p1", "battlefield", "Slickshot Show-Off");
    expect(chars(s, show).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = cast(s, "p1", "Bear Cub");
    s = settle(s);
    expect(chars(s, show).power).toBe(1);
    s = cast(s, "p1", "Opt");
    s = settle(s);
    expect([chars(s, show).power, chars(s, show).toughness]).toEqual([3, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, show).power).toBe(1);
  });

  it("Smuggler's Surprise: mill four cards and return up to two creatures or lands; your creatures with power 4 or more are protected", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 4), "Serra Angel", "Bear Cub"],
        hand: ["Smuggler's Surprise"],
        library: ["Opt", "Bear Cub", "Shock", "Island", "Serra Angel", "Plains"],
      },
    });
    s = cast(s, "p1", "Smuggler's Surprise", {
      mode: modeOf(s, "Smuggler's Surprise", "Mill four cards, return two of them + Your creatures with power 4: protected"),
    });
    let options: string[] = [];
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = namesIn(cur, req.options) as string[];
      return req.options.filter((id) => nameOf(cur, id) !== "Opt" && nameOf(cur, id) !== "Shock");
    });
    // Only the milled creature and land are offered; the cards not milled stay in the library.
    expect(options.sort()).toEqual(["Bear Cub", "Island"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Island"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Opt", "Shock", "Smuggler's Surprise"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Serra Angel", "Plains"]);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).keywords).not.toContain("indestructible");
  });

  it("Stingerback Terror: 7/7 flying and trample, -1/-1 for each card in your hand", () => {
    let s = scenario({ p1: { battlefield: ["Stingerback Terror"], hand: ["Forest", "Island"] } });
    const terror = idOf(s, "p1", "battlefield", "Stingerback Terror");
    expect([chars(s, terror).power, chars(s, terror).toughness]).toEqual([5, 5]);
    expect(chars(s, terror).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect([chars(s, terror).power, chars(s, terror).toughness]).toEqual([6, 6]);
    // The cards in the opponent's hand do not count.
    const t = scenario({ p1: { battlefield: ["Stingerback Terror"] }, p2: { hand: lands("Forest", 3) } });
    expect(chars(t, idOf(t, "p1", "battlefield", "Stingerback Terror")).power).toBe(7);
  });

  it("Stoic Sphinx: hexproof as long as its controller hasn't cast a spell this turn", () => {
    let s = scenario({ p1: { battlefield: ["Stoic Sphinx", "Island"], hand: ["Opt"] } });
    const sphinx = idOf(s, "p1", "battlefield", "Stoic Sphinx");
    expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["hexproof", "flying", "flash"]));
    s = cast(s, "p1", "Opt");
    expect(chars(s, sphinx).keywords).not.toContain("hexproof");
    // A spell cast by the opponent does not remove it.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Stoic Sphinx"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Opt") });
    expect(chars(t, idOf(t, "p1", "battlefield", "Stoic Sphinx")).keywords).toContain("hexproof");
  });

  it("Taii Wakeen, Perfect Shot: draw when noncombat damage equals the creature's toughness, not beyond", () => {
    const wall = customCard({ name: "Mur de test", power: 0, toughness: 5 });
    let s = scenario({
      p1: { battlefield: ["Taii Wakeen, Perfect Shot", ...lands("Mountain", 4)], hand: ["Scorching Shot", "Scorching Shot"] },
      p2: { battlefield: [wall, "Bear Cub"] },
    });
    s = cast(s, "p1", "Scorching Shot", { targets: { t: [idOf(s, "p2", "battlefield", "Mur de test")] } });
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Mur de test")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Scorching Shot", "Forest"]);
    // 5 damage to a creature with toughness 2: no draw.
    s = cast(s, "p1", "Scorching Shot", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } });
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
  });

  it("Taii Wakeen, Perfect Shot: {X}, {T}: your sources deal X additional noncombat damage this turn", () => {
    const giant = customCard({ name: "Colosse de test", power: 1, toughness: 7 });
    let s = scenario({
      p1: { battlefield: ["Taii Wakeen, Perfect Shot", ...lands("Mountain", 4)], hand: ["Scorching Shot"] },
      p2: { battlefield: [giant] },
    });
    const taii = idOf(s, "p1", "battlefield", "Taii Wakeen, Perfect Shot");
    s = activate(s, taii, "Noncombat damage", { x: 2 });
    s = settle(s);
    expect(s.objects[taii]?.tapped).toBe(true);
    s = cast(s, "p1", "Scorching Shot", { targets: { t: [idOf(s, "p2", "battlefield", "Colosse de test")] } });
    s = settle(s);
    // 5 + 2 = 7 damage: the Colossus's toughness, which dies, and Taii draws.
    expect(idsOf(s, "p2", "graveyard", "Colosse de test")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
  });

  it("The Key to the Vault: look at as many cards as combat damage, exile a nonland card and cast it for free", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Key to the Vault", "Bear Cub", ...lands("Island", 3)],
        library: ["Forest", "Serra Angel", "Opt", "Plains"],
      },
    });
    const key = idOf(s, "p1", "battlefield", "The Key to the Vault");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activate(s, key, "Equip", { targets: { t: [bear] } });
    s = passBoth(s);
    expect(s.objects[key]?.attachedTo).toBe(bear);
    s = attack(s, [bear]);
    let options: string[] = [];
    const answer: Answer = (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Serra Angel");
    };
    for (let i = 0; i < 100 && !castNowOf(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else break;
    }
    expect(s.players.p2?.life).toBe(18);
    // Two damage: the top two cards; only the nonland card is offered.
    expect(options).toEqual(["Serra Angel"]);
    const angel = castNowOf(s)?.cards[0] as string;
    expect(nameOf(s, angel)).toBe("Serra Angel");
    s = act(s, "p1", { type: "cast", card: angel });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // The Forest goes to the bottom, under the cards not looked at.
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt", "Plains", "Forest"]);
  });

  it("Tinybones Joins Up: targeted players discard; a legendary creature entering makes the targeted players mill and lose 1 life", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Tinybones Joins Up", "Vadmir, New Blood", "Forest"] },
      p2: { hand: ["Island", "Plains"] },
    });
    s = cast(s, "p1", "Tinybones Joins Up");
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Vadmir, New Blood"]);
    s = cast(s, "p1", "Vadmir, New Blood");
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
    expect(s.players.p2?.graveyard.length).toBe(2);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.library).toHaveLength(10);
    // A nonlegendary creature triggers nothing.
    let t = scenario({ p1: { battlefield: ["Tinybones Joins Up", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
    t = cast(t, "p1", "Bear Cub");
    t = settle(t);
    expect(t.players.p2?.life).toBe(20);
    expect(t.players.p2?.graveyard).toHaveLength(0);
  });

  it("Vadmir, New Blood: a +1/+1 counter per crime, once each turn; menace and lifelink with four counters", () => {
    let s = scenario({ p1: { battlefield: ["Vadmir, New Blood", ...lands("Mountain", 2)], hand: ["Shock", "Shock"] } });
    const vadmir = idOf(s, "p1", "battlefield", "Vadmir, New Blood");
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.objects[vadmir]?.counters["+1/+1"]).toBe(1);
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    s = settle(s);
    expect(crimesOf(s)).toBe(2);
    expect(s.objects[vadmir]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, vadmir).keywords).not.toContain("menace");
    const kw = (n: number) => {
      const t = scenario({ p1: { battlefield: [{ name: "Vadmir, New Blood", counters: { "+1/+1": n } }] } });
      return chars(t, idOf(t, "p1", "battlefield", "Vadmir, New Blood")).keywords;
    };
    expect(kw(3)).not.toContain("lifelink");
    expect(kw(4)).toEqual(expect.arrayContaining(["menace", "lifelink"]));
  });

  it("Wylie Duke, Atiin Hero: when it becomes tapped (saddling a Mount), +1 life and a card; attacking with vigilance doesn't tap it", () => {
    let s = scenario({ p1: { battlefield: ["Wylie Duke, Atiin Hero"] } });
    const wylie = idOf(s, "p1", "battlefield", "Wylie Duke, Atiin Hero");
    s = attack(s, [wylie]);
    s = settleNoBlocks(s);
    expect(s.objects[wylie]?.tapped).toBe(false);
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.hand).toHaveLength(0);

    let t = scenario({ p1: { battlefield: ["Wylie Duke, Atiin Hero", "Seraphic Steed"] } });
    const wylie2 = idOf(t, "p1", "battlefield", "Wylie Duke, Atiin Hero");
    t = saddle(t, idOf(t, "p1", "battlefield", "Seraphic Steed"), [wylie2]);
    t = settle(t);
    expect(t.objects[wylie2]?.tapped).toBe(true);
    expect(t.players.p1?.life).toBe(21);
    expect(t.players.p1?.hand).toHaveLength(1);
  });
});

describe("Outlaws of Thunder Junction, lot K8 : peu communes (1)", () => {
  type S = GameState;
  const abilityOf = (s: S, id: string, label: string) =>
    (s.defs[s.objects[id]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && plainText(a.label ?? "").startsWith(label),
    );
  const activate = (s: S, id: string, label: string, extra: object = {}) =>
    act(s, "p1", { type: "activate", source: id, ability: abilityOf(s, id, label), ...extra });
  const modeOf = (s: S, name: string, label: string) => {
    const id = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === id);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    if (!mode) throw new Error(`mode "${label}" not found for ${name}`);
    return mode.index;
  };
  const tokens = (s: S, player: string, name: string) =>
    s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && nameOf(s, id) === name);
  const strike = (s: S, target: string) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [target] } });
  const ROGUE = customCard({ name: "Test Rogue", subtypes: ["Rogue"], power: 2, toughness: 2 });
  /** Saddles the Mount by tapping `tap`, then attacks with it and lets the triggers resolve. */
  const saddleAndAttack = (s0: S, mount: string, tap: string[]) => {
    let s = s0;
    const saddle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === mount);
    s = act(s, "p1", { type: "activate", source: mount, ability: saddle?.type === "activate" ? saddle.ability : -1, tap });
    s = settle(s);
    s = attack(s, [mount]);
    return settleNoBlocks(s);
  };

  it("Aloe Alchemist: plotted, the targeted creature gets +3/+2 and trample until end of turn; it has trample", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 2)], hand: ["Aloe Alchemist"] } });
    const alchemist = idOf(s, "p1", "hand", "Aloe Alchemist");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activate(s, alchemist, "Plot");
    s = settle(s, picking([cub]));
    expect(chars(s, cub)).toMatchObject({ power: 5, toughness: 4 });
    expect(chars(s, cub).keywords).toContain("trample");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub)).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, cub).keywords).not.toContain("trample");
    expect(Object.values(s.defs).find((d) => d.name === "Aloe Alchemist")?.keywords).toContain("trample");
  });

  it("At Knifepoint: your outlaws have first strike during your turn only; a crime creates a Mercenary, once each turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["At Knifepoint", ROGUE, "Bear Cub", ...lands("Mountain", 4)],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: [ROGUE] },
    });
    const rogue = idOf(s, "p1", "battlefield", "Test Rogue");
    expect(chars(s, rogue).keywords).toContain("firstStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("firstStrike");
    expect(chars(s, idOf(s, "p2", "battlefield", "Test Rogue")).keywords).not.toContain("firstStrike");
    s = strike(s, "p2");
    s = settle(s);
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(1);
    s = strike(s, "p2");
    s = settle(s);
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(1);
    const merc = tokens(s, "p1", "Mercenary")[0] as string;
    expect(chars(s, merc)).toMatchObject({ power: 1, toughness: 1 });
    expect(chars(s, merc).keywords).toContain("firstStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, rogue).keywords).not.toContain("firstStrike");
  });

  it("Badlands Revival: a creature card from your graveyard returns to the battlefield, a permanent card to hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 4), "Forest"],
        hand: ["Badlands Revival"],
        graveyard: ["Serra Angel", "Plains", "Lightning Strike"],
      },
      p2: { graveyard: ["Shivan Dragon"] },
    });
    const revival = idOf(s, "p1", "hand", "Badlands Revival");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === revival);
    const legal = (slot: string) =>
      opt?.type === "cast" ? ((opt.modes[0]?.targets ?? []).find((t) => t.id === slot)?.legal ?? []) : [];
    // A sorcery is not a permanent card; the opposing graveyard is not concerned.
    expect(namesIn(s, legal("p")).sort()).toEqual(["Plains", "Serra Angel"]);
    expect(namesIn(s, legal("c"))).toEqual(["Serra Angel"]);
    s = act(s, "p1", {
      type: "cast",
      card: revival,
      targets: { c: [idOf(s, "p1", "graveyard", "Serra Angel")], p: [idOf(s, "p1", "graveyard", "Plains")] },
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Badlands Revival", "Lightning Strike"]);
  });

  it("Bandit's Haul: a loot counter on the first crime of the turn only; {2}, {T}, two counters removed: draw", () => {
    let s = scenario({
      p1: { battlefield: ["Bandit's Haul", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    const haul = idOf(s, "p1", "battlefield", "Bandit's Haul");
    s = strike(s, "p2");
    s = settle(s);
    s = strike(s, "p2");
    s = settle(s);
    expect(s.objects[haul]?.counters.loot).toBe(1);
    // A single counter: the draw is not possible.
    let t = scenario({ p1: { battlefield: [{ name: "Bandit's Haul", counters: { loot: 1 } }, ...lands("Mountain", 2)] } });
    expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Bandit's Haul"))).toBe(false);
    t = scenario({ p1: { battlefield: [{ name: "Bandit's Haul", counters: { loot: 3 } }, ...lands("Mountain", 2)] } });
    const h = idOf(t, "p1", "battlefield", "Bandit's Haul");
    t = activate(t, h, "Draw");
    t = settle(t);
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.objects[h]?.counters.loot).toBe(1);
    expect(t.objects[h]?.tapped).toBe(true);
  });

  it("Baron Bertram Graywater: a token entering creates a 1/1 Vampire Rogue with lifelink, once each turn; {1}{B}, sacrifice: draw", () => {
    let s = scenario({
      p1: { battlefield: ["Baron Bertram Graywater", "At Knifepoint", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    s = strike(s, "p2");
    s = settle(s);
    // The Mercenary triggers the Baron; the Vampire does not trigger it a second time.
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(1);
    const vampires = tokens(s, "p1", "Vampire Rogue");
    expect(vampires).toHaveLength(1);
    expect(chars(s, vampires[0] as string)).toMatchObject({ power: 1, toughness: 1 });
    expect(chars(s, vampires[0] as string).keywords).toContain("lifelink");
    let t = scenario({ p1: { battlefield: ["Baron Bertram Graywater", "Bear Cub", ...lands("Swamp", 2)] } });
    const baron = idOf(t, "p1", "battlefield", "Baron Bertram Graywater");
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = activate(t, baron, "Draw", { sacrifice: [cub] });
    t = settle(t);
    expect(t.objects[cub]).toBeUndefined();
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.objects[baron]).toBeDefined();
  });

  it("Beastbond Outcaster: on entering, draw only if you control a creature with power 4 or more", () => {
    const run = (other: string) => {
      let s = scenario({ p1: { battlefield: [other, ...lands("Forest", 3)], hand: ["Beastbond Outcaster"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Beastbond Outcaster") });
      s = settle(s);
      return s.players.p1?.hand.length;
    };
    expect(run("Serra Angel")).toBe(1);
    expect(run("Bear Cub")).toBe(0);
  });

  it("Betrayal at the Vault: your creature deals damage equal to its power to each of two other targeted creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Shivan Dragon", ...lands("Forest", 6)], hand: ["Betrayal at the Vault"] },
      p2: { battlefield: ["Serra Angel", "Swab Goblin", "Bear Cub"] },
    });
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const bears = idOf(s, "p2", "battlefield", "Swab Goblin");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legalA = opt?.type === "cast" ? ((opt.modes[0]?.targets ?? []).find((t) => t.id === "a")?.legal ?? []) : [];
    expect(legalA).toEqual([dragon]);
    // The source creature cannot also be one of the two other targets.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Betrayal at the Vault"),
        targets: { a: [dragon], b: [dragon, angel] },
      }),
    ).toThrow();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Betrayal at the Vault"),
      targets: { a: [dragon], b: [angel, bears] },
    });
    s = settle(s);
    expect(s.objects[angel]).toBeUndefined();
    expect(s.objects[bears]).toBeUndefined();
    expect(s.objects[cub]?.damage).toBe(0);
    expect(s.objects[dragon]?.damage).toBe(0);
  });

  it("Binding Negotiation: you may make a player discard a nonland card; otherwise, an exiled card of the opponent goes to their graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Binding Negotiation"] },
      p2: { hand: ["Lightning Strike", "Mountain"] },
    });
    const pickedFrom: string[][] = [];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Binding Negotiation"), targets: { t: ["p2"] } });
    s = settle(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      pickedFrom.push(namesIn(cur, req.options) as string[]);
      return req.options.filter((id) => nameOf(cur, id) === "Lightning Strike");
    });
    // The land is not offered.
    expect(pickedFrom[0]).toEqual(["Lightning Strike"]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Lightning Strike"]);
    expect(namesIn(s, s.players.p2?.hand)).toEqual(["Mountain"]);
    // Without a nonland card in hand: the opponent's exiled card goes to their graveyard.
    let t = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Binding Negotiation"] },
      p2: { hand: ["Mountain"], library: ["Serra Angel", "Forest"] },
    });
    const exiledAngel = moveObject(t, t.players.p2?.library[0] ?? "", "exile") ?? "";
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Binding Negotiation"), targets: { t: ["p2"] } });
    t = settle(t, picking([exiledAngel]));
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Serra Angel"]);
    expect(t.exile).toHaveLength(0);
    expect(namesIn(t, t.players.p2?.hand)).toEqual(["Mountain"]);
  });

  it("Boom Box: {6}, {T}, sacrifice it: destroy up to one artifact, creature and land targeted", () => {
    let s = scenario({
      p1: { battlefield: ["Boom Box", ...lands("Mountain", 6)] },
      p2: { battlefield: ["Bandit's Haul", "Bear Cub", "Forest", "Serra Angel"] },
    });
    const box = idOf(s, "p1", "battlefield", "Boom Box");
    const haul = idOf(s, "p2", "battlefield", "Bandit's Haul");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const forest = idOf(s, "p2", "battlefield", "Forest");
    s = activate(s, box, "Destroy", { targets: { a: [haul], c: [cub], l: [forest] } });
    expect(s.objects[box]).toBeUndefined();
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Bandit's Haul", "Bear Cub", "Forest"]);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    // Up to one: a single target is enough.
    let t = scenario({ p1: { battlefield: ["Boom Box", ...lands("Mountain", 6)] }, p2: { battlefield: ["Bear Cub", "Forest"] } });
    t = activate(t, idOf(t, "p1", "battlefield", "Boom Box"), "Destroy", {
      targets: { a: [], c: [idOf(t, "p2", "battlefield", "Bear Cub")], l: [] },
    });
    t = settle(t);
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Bear Cub"]);
  });

  it("Bounding Felidar: attacking while saddled, a +1/+1 counter on each of your other creatures and 1 life per creature", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Bounding Felidar", "Bear Cub", "Swab Goblin"] }, p2: { battlefield: ["Bear Cub"] } });
    let s = setup();
    const felidar = idOf(s, "p1", "battlefield", "Bounding Felidar");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const bears = idOf(s, "p1", "battlefield", "Swab Goblin");
    s = saddleAndAttack(s, felidar, [cub]);
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bears]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[felidar]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players.p1?.life).toBe(22);
    // Without being saddled: nothing.
    let t = setup();
    t = attack(t, [idOf(t, "p1", "battlefield", "Bounding Felidar")]);
    t = settleNoBlocks(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(t.players.p1?.life).toBe(20);
  });

  it("Brimstone Roundup: your second spell of the turn creates a 1/1 Mercenary; neither the first nor the third", () => {
    let s = scenario({
      p1: {
        battlefield: ["Brimstone Roundup", ...lands("Mountain", 6)],
        hand: ["Lightning Strike", "Lightning Strike", "Lightning Strike"],
      },
    });
    s = strike(s, "p2");
    s = settle(s);
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(0);
    s = strike(s, "p2");
    s = settle(s);
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(1);
    s = strike(s, "p2");
    s = settle(s);
    expect(tokens(s, "p1", "Mercenary")).toHaveLength(1);
  });

  it("Bucolic Ranch: its colored mana is only for Mount spells; {3}, {T}: a Mount from the top to hand", () => {
    const s = scenario({ p1: { battlefield: ["Bucolic Ranch", "Plains", "Plains"], hand: ["Bear Cub", "Congregation Gryff"] } });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Congregation Gryff"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    let t = scenario({ p1: { battlefield: ["Bucolic Ranch", ...lands("Plains", 3)], library: ["Bounding Felidar", "Forest"] } });
    t = activate(t, idOf(t, "p1", "battlefield", "Bucolic Ranch"), "A Mount");
    t = settle(t, (req) => (req.type === "pick" ? req.options : undefined));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Bounding Felidar"]);
  });

  it("Bucolic Ranch: a card that is not a Mount may be put on the bottom of the library", () => {
    let s = scenario({ p1: { battlefield: ["Bucolic Ranch", ...lands("Plains", 3)], library: ["Island", "Forest", "Forest"] } });
    s = activate(s, idOf(s, "p1", "battlefield", "Bucolic Ranch"), "A Mount");
    s = settle(s, (req) => (req.type === "pick" ? req.options : req.type === "yesNo" ? [1] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
    const lib = s.players.p1?.library ?? [];
    expect(nameOf(s, lib[lib.length - 1] as string)).toBe("Island");
    expect(nameOf(s, lib[0] as string)).toBe("Forest");
    // Without putting it on the bottom: it stays on top.
    let t = scenario({ p1: { battlefield: ["Bucolic Ranch", ...lands("Plains", 3)], library: ["Island", "Forest", "Forest"] } });
    t = activate(t, idOf(t, "p1", "battlefield", "Bucolic Ranch"), "A Mount");
    t = settle(t, (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(nameOf(t, t.players.p1?.library[0] as string)).toBe("Island");
  });

  it("Cactusfolk Sureshot: at the beginning of combat on your turn, your other creatures with power 4 or more gain trample and haste", () => {
    let s = scenario({
      p1: { battlefield: ["Cactusfolk Sureshot", { name: "Serra Angel", sick: true }, "Bear Cub"] },
    });
    const sureshot = idOf(s, "p1", "battlefield", "Cactusfolk Sureshot");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, sureshot).keywords).toEqual(expect.arrayContaining(["reach", "ward"]));
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    s = settle(s);
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(chars(s, cub).keywords).not.toContain("trample");
    expect(chars(s, sureshot).keywords).not.toContain("trample");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).keywords).not.toContain("trample");
    // Not at the opponent's turn combat.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "beginCombat");
    expect(s.stack).toHaveLength(0);
  });

  it("Canyon Crab: {1}{U}: +2/-2; at your end step, with no spell cast from your hand, draw then discard", () => {
    let s = scenario({ p1: { battlefield: ["Canyon Crab", ...lands("Island", 2)], hand: ["Plains"] } });
    const crab = idOf(s, "p1", "battlefield", "Canyon Crab");
    s = activate(s, crab, "+2/-2");
    s = settle(s);
    expect(chars(s, crab)).toMatchObject({ power: 2, toughness: 3 });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, crab)).toMatchObject({ power: 0, toughness: 5 });
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    // With a spell cast from hand: nothing.
    let t = scenario({ p1: { battlefield: ["Canyon Crab", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    t = strike(t, "p2");
    t = settle(t);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Lightning Strike"]);
  });

  it("Caught in the Crossfire: 2 damage to each outlaw, to each non-outlaw, or to both", () => {
    const run = (label: string) => {
      let s = scenario({
        p1: { battlefield: [ROGUE, ...lands("Mountain", 4)], hand: ["Caught in the Crossfire"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Caught in the Crossfire"),
        mode: modeOf(s, "Caught in the Crossfire", label),
      });
      s = settle(s);
      return [idsOf(s, "p1", "battlefield", "Test Rogue").length, idsOf(s, "p2", "battlefield", "Bear Cub").length];
    };
    expect(run("2 damage to each outlaw")).toEqual([0, 1]);
    expect(run("2 damage to each non-outlaw")).toEqual([1, 0]);
    expect(run("2 damage to each outlaw + 2 damage to each non-outlaw")).toEqual([0, 0]);
  });

  it("Congregation Gryff: attacking while saddled, +X/+X where X is the number of your Mounts; flying and lifelink", () => {
    const setup = () => scenario({ p1: { battlefield: ["Congregation Gryff", "Bounding Felidar", "Serra Angel"] } });
    let s = setup();
    const gryff = idOf(s, "p1", "battlefield", "Congregation Gryff");
    expect(chars(s, gryff).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
    s = saddleAndAttack(s, gryff, [idOf(s, "p1", "battlefield", "Serra Angel")]);
    expect(chars(s, gryff)).toMatchObject({ power: 3, toughness: 6 });
    let t = setup();
    const g = idOf(t, "p1", "battlefield", "Congregation Gryff");
    t = attack(t, [g]);
    t = settleNoBlocks(t);
    expect(chars(t, g)).toMatchObject({ power: 1, toughness: 4 });
  });

  it("Cunning Coyote: haste; on entering, another creature you control gets +1/+1 and haste until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", sick: true }, ...lands("Mountain", 2)], hand: ["Cunning Coyote"] },
      p2: { battlefield: ["Swab Goblin"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const options: string[][] = [];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cunning Coyote") });
    s = settle(s, (req) => {
      if (req.type !== "pick") return undefined;
      options.push(req.options);
      return [cub];
    });
    const coyote = idOf(s, "p1", "battlefield", "Cunning Coyote");
    // Neither the Coyote itself nor an opposing creature.
    expect(options.every((o) => !o.includes(coyote) && !o.includes(idOf(s, "p2", "battlefield", "Swab Goblin")))).toBe(true);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, cub).keywords).toContain("haste");
    expect(chars(s, coyote).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub)).toMatchObject({ power: 2, toughness: 2 });
  });

  it("Deepmuck Desperado: on the first crime of the turn, each opponent mills three cards; not on later ones", () => {
    let s = scenario({
      p1: { battlefield: ["Deepmuck Desperado", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = strike(s, "p2");
    s = settle(s);
    expect(s.players.p2?.graveyard).toHaveLength(3);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    s = strike(s, "p2");
    s = settle(s);
    expect(s.players.p2?.graveyard).toHaveLength(3);
    // Targeting your own creature is not a crime.
    let t = scenario({ p1: { battlefield: ["Deepmuck Desperado", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    t = strike(t, idOf(t, "p1", "battlefield", "Deepmuck Desperado"));
    t = settle(t);
    expect(t.players.p2?.graveyard).toHaveLength(0);
  });

  it("Demonic Ruckus: +1/+1, menace and trample; put into a graveyard from the battlefield, draw", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 4)], hand: ["Demonic Ruckus", "Lightning Strike"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Demonic Ruckus"), targets: { enchant: [cub] } });
    s = settle(s);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["menace", "trample"]));
    s = strike(s, cub);
    s = settle(s);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Demonic Ruckus", "Lightning Strike"]);
    expect(s.players.p1?.hand).toHaveLength(1);
    // Same trigger on Reach for the Sky (common): the Aura put into a graveyard from the battlefield draws.
    let r = scenario({
      p1: {
        battlefield: [{ name: "Bear Cub", damage: 1 }, ...lands("Forest", 4), ...lands("Mountain", 2)],
        hand: ["Reach for the Sky", "Lightning Strike"],
      },
    });
    const bear = idOf(r, "p1", "battlefield", "Bear Cub");
    r = settle(act(r, "p1", { type: "cast", card: idOf(r, "p1", "hand", "Reach for the Sky"), targets: { enchant: [bear] } }));
    expect(chars(r, bear)).toMatchObject({ power: 5, toughness: 4 });
    expect(chars(r, bear).keywords).toContain("reach");
    r = settle(strike(r, bear));
    expect(idsOf(r, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(r.players.p1?.hand).toHaveLength(1);
  });

  it("Emergent Haunting: at your end step, with no spell cast from your hand, becomes a 3/3 flying Spirit for good; {2}{U}: scry 1", () => {
    let s = scenario({ p1: { battlefield: ["Emergent Haunting", ...lands("Island", 3)], library: ["Plains", "Forest"] } });
    const haunting = idOf(s, "p1", "battlefield", "Emergent Haunting");
    s = activate(s, haunting, "Surveil");
    s = settle(s, (req) => (req.type === "pick" ? req.options : req.type === "yesNo" ? [1] : undefined));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Plains"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, haunting)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, haunting).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(chars(s, haunting).subtypes).toContain("Spirit");
    expect(chars(s, haunting).keywords).toContain("flying");
    // With a spell cast from hand: stays a plain enchantment.
    let t = scenario({ p1: { battlefield: ["Emergent Haunting", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    const h = idOf(t, "p1", "battlefield", "Emergent Haunting");
    t = strike(t, "p2");
    t = settle(t);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(chars(t, h).types).not.toContain("Creature");
  });
});

describe("Outlaws of Thunder Junction, lot K8 : peu communes (2)", () => {
  type S = GameState;
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  const no: Answer = (req) => (req.type === "yesNo" ? [0] : undefined);
  /** Index of the activated ability of `source` offered by `legalActions` (the first one, or the one whose label starts with `label`). */
  const abilityOf = (s: S, source: string, label?: string) => {
    const opt = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === source && (!label || plainText(a.label ?? "").startsWith(label)),
    );
    return opt?.type === "activate" ? opt.ability : -1;
  };
  /** Index of the spell mode (spree) whose label is `label`. */
  const modeOf = (s: S, card: string, label: string) => {
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    return opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label)?.index : undefined;
  };

  it("Ertha Jo, Frontier Mentor: on entering, a 1/1 red Mercenary; an activated ability that targets a creature is copied", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)], hand: ["Ertha Jo, Frontier Mentor"] },
    });
    s = settle(cast(s, "p1", "Ertha Jo, Frontier Mentor"));
    const merc = idOf(s, "p1", "battlefield", "Mercenary");
    const c = chars(s, merc);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([1, 1, ["R"], ["Mercenary"]]);
    // On the next turn, the Mercenary targets Ertha Jo: the ability and its copy give +2/+0 in total.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const ertha = idOf(s, "p1", "battlefield", "Ertha Jo, Frontier Mentor");
    s = act(s, "p1", { type: "activate", source: merc, ability: abilityOf(s, merc), targets: { t: [ertha] } });
    s = settle(s);
    expect([chars(s, ertha).power, chars(s, ertha).toughness]).toEqual([4, 4]);
  });

  it("Ferocification: at the beginning of combat on your turn, +2/+0 or menace and haste to one of your creatures; nothing on the opponent's turn", () => {
    const setup = (active: "p1" | "p2") =>
      scenario({ active, p1: { battlefield: ["Ferocification", { name: "Bear Cub", sick: true }] }, p2: { battlefield: [] } });
    let modes: string[] = [];
    let s = advanceUntil(setup("p1"), (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, (req) => {
      if (req.intent !== "triggerMode" || req.type !== "pick") return undefined;
      modes = req.options;
      return ["1"];
    });
    expect(modes).toEqual(["0", "1"]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "haste"]));
    expect(chars(s, bear).power).toBe(2);
    // End of turn: no more menace or haste.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("menace");
    // Mode +2/+0.
    let t = advanceUntil(setup("p1"), (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    t = settle(t, (req) => (req.intent === "triggerMode" ? ["0"] : undefined));
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(4);
    // On the opponent's turn: no trigger.
    const u = advanceUntil(setup("p2"), (x) => x.turn.step === "main2");
    expect(u.turn.active).toBe("p2");
    expect(chars(u, idOf(u, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("Fleeting Reflection: your creature gains hexproof, untaps and becomes a copy of another creature until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 2)], hand: ["Fleeting Reflection"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Fleeting Reflection", { targets: { t: [bear], c: [angel] } }));
    expect(s.objects[bear]?.tapped).toBe(false);
    const c = chars(s, bear);
    expect([c.name, c.power, c.toughness]).toEqual(["Serra Angel", 4, 4]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "hexproof"]));
    expect(c.controller).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    const after = chars(s, bear);
    expect([after.name, after.power]).toEqual(["Bear Cub", 2]);
    expect(after.keywords).not.toContain("hexproof");
    // \"Up to one other creature\": without a second target, only hexproof and the untap.
    let t = scenario({
      p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 2)], hand: ["Fleeting Reflection"] },
    });
    const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Fleeting Reflection", { targets: { t: [bear2] } }));
    expect(t.objects[bear2]?.tapped).toBe(false);
    expect(chars(t, bear2).name).toBe("Bear Cub");
    expect(chars(t, bear2).keywords).toContain("hexproof");
  });

  it('Form a Posse: creates X 1/1 red Mercenaries with "{T}: +1/+0 to one of your creatures, as a sorcery"', () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Form a Posse"] } });
    s = settle(cast(s, "p1", "Form a Posse", { x: 3 }));
    const mercs = idsOf(s, "p1", "battlefield", "Mercenary");
    expect(mercs).toHaveLength(3);
    const c = chars(s, mercs[0] as string);
    expect([c.power, c.toughness, c.colors]).toEqual([1, 1, ["R"]]);
    const ability = c.abilities.find((a) => a.kind === "activated");
    expect(ability?.kind === "activated" && ability.sorcerySpeed).toBe(true);
    expect(ability?.kind === "activated" && ability.cost.tap).toBe(true);
  });

  it("Frontier Seeker: among the top five cards, a Mount creature card or a Plains card to hand, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Frontier Seeker"],
        library: ["Bear Cub", "Plains", "Gila Courser", "Island", "Lightning Strike", "Swamp"],
      },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Frontier Seeker"), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "lookAtTop") return undefined;
      offered = (namesIn(cur, req.options) as string[]).sort();
      return req.options.filter((id) => nameOf(cur, id) === "Gila Courser");
    });
    expect(offered).toEqual(["Gila Courser", "Plains"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Gila Courser"]);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Swamp");
    expect(lib).toHaveLength(5);
  });

  it("Full Steam Ahead: your creatures get +2/+2, trample and can't be blocked except by one creature, until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 5)], hand: ["Full Steam Ahead"] },
      p2: { battlefield: ["Swab Goblin", "Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Full Steam Ahead"));
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toContain("trample");
    // Opposing creatures are not concerned.
    expect(chars(s, idOf(s, "p2", "battlefield", "Swab Goblin")).power).toBe(2);
    s = attack(s, [bear]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const two = [
      { blocker: idOf(s, "p2", "battlefield", "Swab Goblin"), attacker: bear },
      { blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: bear },
    ];
    expect(() => declareBlockers(s, "p2", two)).toThrow();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).power).toBe(2);
    expect(chars(s, bear).keywords).not.toContain("trample");
  });

  it("Getaway Glamer: + {1} exiles a nontoken creature that returns at the end step under its owner's control", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Getaway Glamer"] }, p2: { battlefield: ["Serra Angel"] } });
    const card = idOf(s, "p1", "hand", "Getaway Glamer");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const mode = modeOf(s, card, "Exile a nontoken creature, it returns");
    s = settle(act(s, "p1", { type: "cast", card, mode, targets: { e: [angel] } }));
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Getaway Glamer: + {2} destroys the creature only if no other creature has greater power", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Getaway Glamer"] },
        p2: { battlefield: ["Serra Angel", "Swab Goblin"] },
      });
    const run = (victim: string) => {
      const s = setup();
      const card = idOf(s, "p1", "hand", "Getaway Glamer");
      const mode = modeOf(s, card, "Destroy the creature with the greatest power");
      return settle(act(s, "p1", { type: "cast", card, mode, targets: { d: [idOf(s, "p2", "battlefield", victim)] } }));
    };
    const bears = run("Swab Goblin");
    expect(idsOf(bears, "p2", "battlefield", "Swab Goblin")).toHaveLength(1);
    const angel = run("Serra Angel");
    expect(idsOf(angel, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(namesIn(angel, angel.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Gila Courser: attacking while saddled exiles the top card, playable until the end of your next turn; unsaddled, nothing", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Gila Courser", "Bear Cub", ...lands("Mountain", 2)],
          library: ["Lightning Strike", ...lands("Forest", 9)],
        },
      });
    // Unsaddled: no exile.
    let n = attack(setup(), [idOf(setup(), "p1", "battlefield", "Gila Courser")]);
    n = settle(n);
    expect(exiled(n, "Lightning Strike")).toHaveLength(0);
    let s = setup();
    const mount = idOf(s, "p1", "battlefield", "Gila Courser");
    s = act(s, "p1", { type: "activate", source: mount, ability: abilityOf(s, mount) });
    s = passBoth(s);
    s = attack(s, [mount]);
    s = settle(s);
    const strike = exiled(s, "Lightning Strike")[0] as string;
    expect(strike).toBeDefined();
    s = throughCombat(s);
    expect(castable(s, "p1", strike)).toBe(true);
    // On p1's next turn, still playable; the turn after, no longer.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 5);
    expect(castable(s, "p1", strike)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 7);
    expect(s.exile).toContain(strike);
    expect(castable(s, "p1", strike)).toBe(false);
  });

  it("Gold Rush: creates a Treasure, then up to one creature gets +2/+2 for each Treasure you control", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 4)], hand: ["Gold Rush", "Gold Rush"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Gold Rush", { targets: { t: [bear] } }));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 4]);
    // Two Treasures: +4/+4 more.
    s = settle(cast(s, "p1", "Gold Rush", { targets: { t: [bear] } }));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([8, 8]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).power).toBe(2);
  });

  it("Hellspur Brute: costs {1} less for each outlaw you control; trample", () => {
    const run = (others: string[]) => {
      const s = scenario({ p1: { battlefield: [...others, ...lands("Mountain", 3)], hand: ["Hellspur Brute"] } });
      return { s, ok: castable(s, "p1", idOf(s, "p1", "hand", "Hellspur Brute")) };
    };
    expect(run(["Bear Cub", "Bear Cub"]).ok).toBe(false);
    const { s, ok } = run(["Hellspur Brute", "Hollow Marauder"]);
    expect(ok).toBe(true);
    const t = settle(cast(s, "p1", "Hellspur Brute"));
    const brutes = idsOf(t, "p1", "battlefield", "Hellspur Brute");
    expect(brutes).toHaveLength(2);
    expect(chars(t, brutes[1] as string).keywords).toContain("trample");
  });

  it("Hollow Marauder: costs {1} less for each creature card in your graveyard; the opponent discards, and you draw unless they discarded a card with mana value 4 or more", () => {
    const run = (oppHand: string[]) => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 3),
          hand: ["Hollow Marauder"],
          graveyard: ["Bear Cub", "Bear Cub", "Serra Angel", "Swamp", "Swab Goblin"],
        },
        p2: { hand: oppHand },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Hollow Marauder"))).toBe(true);
      s = settle(cast(s, "p1", "Hollow Marauder"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      return s;
    };
    const big = run(["Serra Angel"]);
    expect(namesIn(big, big.players.p2?.graveyard)).toEqual(["Serra Angel"]);
    expect(big.players.p1?.hand).toHaveLength(0);
    expect(chars(big, idOf(big, "p1", "battlefield", "Hollow Marauder")).keywords).toContain("flying");
    const small = run(["Bear Cub"]);
    expect(namesIn(small, small.players.p2?.graveyard)).toEqual(["Bear Cub"]);
    expect(small.players.p1?.hand).toHaveLength(1);
    // Not enough creature cards: too expensive.
    const t = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Hollow Marauder"], graveyard: ["Bear Cub", "Swamp"] } });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Hollow Marauder"))).toBe(false);
  });

  it("Hollow Marauder: one card drawn for each targeted opponent who didn't discard a card with mana value 4 or more (multiplayer)", () => {
    const run = (p2Hand: string[], p3Hand: string[], targets: string[]) => {
      const s = scenario({
        players: 3,
        p1: {
          battlefield: lands("Swamp", 3),
          hand: ["Hollow Marauder"],
          graveyard: ["Bear Cub", "Bear Cub", "Serra Angel", "Swamp", "Swab Goblin"],
        },
        p2: { hand: p2Hand },
        p3: { hand: p3Hand },
      });
      return settle(cast(s, "p1", "Hollow Marauder"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? targets : undefined,
      );
    };
    // p2 discards Serra Angel (mana value 5), p3 Bear Cub: one card.
    expect(run(["Serra Angel"], ["Bear Cub"], ["p2", "p3"]).players.p1?.hand).toHaveLength(1);
    // Neither discards a card with mana value 4 or more (p3 has no card): two cards.
    expect(run(["Bear Cub"], [], ["p2", "p3"]).players.p1?.hand).toHaveLength(2);
    // Both discard a card with mana value 4 or more: nothing.
    expect(run(["Serra Angel"], ["Shivan Dragon"], ["p2", "p3"]).players.p1?.hand).toHaveLength(0);
    // Only p3 is targeted: p2 discards nothing and doesn't count.
    const one = run(["Bear Cub"], ["Shivan Dragon"], ["p3"]);
    expect(one.players.p2?.hand).toHaveLength(1);
    expect(one.players.p1?.hand).toHaveLength(0);
  });

  it("Honest Rutstein: on entering, returns a creature card from your graveyard; your creature spells cost {1} less", () => {
    let s = scenario({
      p1: {
        battlefield: ["Swamp", "Forest", "Swamp", "Mountain"],
        hand: ["Honest Rutstein", "Lightning Strike"],
        graveyard: ["Swab Goblin", "Opt"],
      },
    });
    s = settle(cast(s, "p1", "Honest Rutstein"));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    // One Mountain remains: Swab Goblin ({1}{R}) costs {R}; Lightning Strike is not reduced.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Swab Goblin"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Strike"))).toBe(false);
  });

  it("Intimidation Campaign: on entering, drain 1 and draw; a crime lets you return it to hand (not a spell without a crime)", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Bear Cub", "Island", ...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Intimidation Campaign", "Shock", "Shock"],
        },
      });
    let s = settle(cast(setup(), "p1", "Intimidation Campaign"));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    expect(s.players.p1?.hand).toHaveLength(3);
    // Shocking your own creature is not a crime: no question.
    let asked = false;
    s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }), (req) => {
      if (req.type === "yesNo") asked = true;
      return undefined;
    });
    expect(asked).toBe(false);
    const declined = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), no);
    expect(idsOf(declined, "p1", "battlefield", "Intimidation Campaign")).toHaveLength(1);
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), yes);
    expect(idsOf(s, "p1", "battlefield", "Intimidation Campaign")).toHaveLength(0);
    expect(idsOf(s, "p1", "hand", "Intimidation Campaign")).toHaveLength(1);
  });

  it("Intrepid Stablemaster: reach; {T}: {G}; {T}: two mana of one color, only for Mount or Vehicle spells", () => {
    const s = scenario({
      p1: { battlefield: ["Intrepid Stablemaster", "Mountain"], hand: ["Gila Courser", "Irascible Wolverine"] },
    });
    const sm = idOf(s, "p1", "battlefield", "Intrepid Stablemaster");
    expect(chars(s, sm).keywords).toContain("reach");
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Gila Courser"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Irascible Wolverine"))).toBe(false);
    const t = settle(cast(s, "p1", "Gila Courser"));
    expect(idsOf(t, "p1", "battlefield", "Gila Courser")).toHaveLength(1);
  });

  it("Jem Lightfoote, Sky Explorer: flying, vigilance; at your end step, draw if you cast no spell from your hand", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Jem Lightfoote, Sky Explorer", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    let s = setup();
    expect(chars(s, idOf(s, "p1", "battlefield", "Jem Lightfoote, Sky Explorer")).keywords).toEqual(
      expect.arrayContaining(["flying", "vigilance"]),
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(2);
    let t = settle(cast(setup(), "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Jolene, Plundering Pugilist: a Treasure when you attack with a creature with power 4 or more; {1}{R}, sacrifice a Treasure: 1 damage", () => {
    const setup = () => scenario({ p1: { battlefield: ["Jolene, Plundering Pugilist", "Bear Cub", ...lands("Mountain", 2)] } });
    let n = setup();
    n = throughCombat(attack(n, [idOf(n, "p1", "battlefield", "Bear Cub")]));
    expect(idsOf(n, "p1", "battlefield", "Treasure")).toHaveLength(0);
    let s = setup();
    const jolene = idOf(s, "p1", "battlefield", "Jolene, Plundering Pugilist");
    s = throughCombat(attack(s, [jolene]));
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    expect(s.players.p2?.life).toBe(16);
    s = act(s, "p1", {
      type: "activate",
      source: jolene,
      ability: abilityOf(s, jolene),
      targets: { t: ["p2"] },
      sacrifice: [treasure],
    });
    s = settle(s);
    expect(s.players.p2?.life).toBe(15);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
  });

  it("Kraum, Violent Cacophony: your second spell of the turn gives a +1/+1 counter and a draw (neither the first nor the third)", () => {
    let s = scenario({ p1: { battlefield: ["Kraum, Violent Cacophony", ...lands("Island", 3)], hand: ["Opt", "Opt", "Opt"] } });
    const kraum = idOf(s, "p1", "battlefield", "Kraum, Violent Cacophony");
    expect(chars(s, kraum).keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[kraum]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players.p1?.library).toHaveLength(9);
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[kraum]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.library).toHaveLength(7);
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[kraum]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Lassoed by the Law: exiles an opposing nonland permanent until it leaves, and creates a Mercenary", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 6)], hand: ["Lassoed by the Law", "Disenchant"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Lassoed by the Law"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") offered = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(offered.length === 0 || offered.every((n) => n === "Serra Angel")).toBe(true);
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Mercenary")).toHaveLength(1);
    s = settle(cast(s, "p1", "Disenchant", { targets: { t: [idOf(s, "p1", "battlefield", "Lassoed by the Law")] } }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Lavaspur Boots: the equipped creature gets +1/+0, haste and ward {1}; equip {1}", () => {
    let s = scenario({
      p1: { battlefield: ["Lavaspur Boots", { name: "Bear Cub", sick: true }, "Plains"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const boots = idOf(s, "p1", "battlefield", "Lavaspur Boots");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "activate", source: boots, ability: abilityOf(s, boots), targets: { t: [bear] } }));
    expect(s.objects[boots]?.attachedTo).toBe(bear);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).toughness).toBe(2);
    expect(chars(s, bear).keywords).toContain("haste");
    // Ward {1}: the opponent's Shock, which can't pay, is countered.
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: [bear] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Shock"]);
  });

  it("Lazav, Familiar Stranger: a crime, once each turn: +1/+1 counter, then exile a card from a graveyard and, if it is a creature, a copy of your choice", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Lazav, Familiar Stranger", ...lands("Mountain", 2)], hand: ["Shock", "Shock"] },
        p2: { graveyard: ["Serra Angel"] },
      });
    const pickAngel: Answer = (req, _p, cur) =>
      req.type === "pick"
        ? req.options.filter((id) => nameOf(cur, id) === "Serra Angel")
        : req.type === "yesNo"
          ? [1]
          : undefined;
    let s = settle(cast(setup(), "p1", "Shock", { targets: { t: ["p2"] } }), pickAngel);
    const lazav = idOf(s, "p1", "battlefield", "Lazav, Familiar Stranger");
    expect(s.objects[lazav]?.counters["+1/+1"]).toBe(1);
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(chars(s, lazav).name).toBe("Serra Angel");
    expect([chars(s, lazav).power, chars(s, lazav).toughness]).toEqual([5, 5]);
    // Only once each turn.
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), pickAngel);
    expect(s.objects[lazav]?.counters["+1/+1"]).toBe(1);
    // End of turn: becomes Lazav again.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, lazav).name).toBe("Lazav, Familiar Stranger");
    // \"You may\": it may choose not to become a copy.
    const declined = settle(cast(setup(), "p1", "Shock", { targets: { t: ["p2"] } }), (req, p, cur) =>
      req.type === "yesNo" ? [0] : pickAngel(req, p, cur),
    );
    const lz = idOf(declined, "p1", "battlefield", "Lazav, Familiar Stranger");
    expect(exiled(declined, "Serra Angel")).toHaveLength(1);
    expect(chars(declined, lz).name).toBe("Lazav, Familiar Stranger");
  });
});

describe("Outlaws of Thunder Junction, lot K8 : peu communes (3)", () => {
  type S = GameState;
  const abilityIndex = (s: S, id: string, label: string) =>
    chars(s, id).abilities.findIndex((a) => a.kind === "activated" && plainText(a.label ?? "").startsWith(label));
  const activate = (s: S, id: string, label: string, extra: object = {}) =>
    act(s, "p1", { type: "activate", source: id, ability: abilityIndex(s, id, label), ...extra });
  const libraryIds = (s: S, name: string) => (s.players.p1?.library ?? []).filter((id) => nameOf(s, id) === name);
  /** Passes and answers the choices until the stack is empty, noting the intents of the choices posed. */
  const settleLogging = (s: S, intents: string[], answer: (req: ChoiceRequest, cur: S) => (string | number)[] | undefined) =>
    settle(s, (req, _p, cur) => {
      intents.push(req.intent);
      return answer(req, cur);
    });
  const modeIndex = (s: S, card: string, label: string) => {
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    return opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label)?.index : undefined;
  };

  it("Luxurious Locomotive: a Treasure for each creature that equipped it when it attacks; Crew only once each turn", () => {
    let s = scenario({ p1: { battlefield: ["Luxurious Locomotive", "Bear Cub", "Swab Goblin", "Serra Angel"] } });
    const loco = idOf(s, "p1", "battlefield", "Luxurious Locomotive");
    const crew = abilityIndex(s, loco, "Crew");
    s = activate(s, loco, "Crew", {
      tap: [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Swab Goblin")],
    });
    s = passBoth(s);
    expect(chars(s, loco).types).toContain("Creature");
    // The Angel stays untapped, but Crew activates only once each turn.
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === loco && a.ability === crew)).toBe(false);
    s = settle(attack(s, [loco]));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
  });

  it("Make Your Own Luck: a nonland card among the top three is exiled and plotted, the rest to hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), ...lands("Island", 2)],
        hand: ["Make Your Own Luck"],
        library: ["Bear Cub", "Plains", "Swab Goblin", "Swamp"],
      },
    });
    const bear = libraryIds(s, "Bear Cub")[0] as string;
    let options: string[] = [];
    s = settle(cast(s, "p1", "Make Your Own Luck"), (req) => {
      if (req.type === "pick" && req.options.includes(bear)) {
        options = req.options.map((id) => nameOf(s, id) ?? "");
        return [bear];
      }
      return undefined;
    });
    // The Plains is not offered (nonland card).
    expect(options.sort()).toEqual(["Bear Cub", "Swab Goblin"]);
    const plotted = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(s.objects[plotted]?.exiledVia?.kind).toBe("plot");
    expect(idsOf(s, "p1", "hand", "Plains")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Swab Goblin")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Swamp"]);
    // Plotted: cast for free on a later turn.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === plotted);
    expect(opt?.type === "cast" && opt.free).toBe(true);
  });

  it("Map the Frontier: up to two basic lands and/or Deserts enter tapped; not another land", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Map the Frontier"],
        library: ["Blooming Marsh", "Plains", "Bear Cub", "Forlorn Flats", "Island"],
      },
    });
    const plains = libraryIds(s, "Plains")[0] as string;
    const flats = libraryIds(s, "Forlorn Flats")[0] as string;
    let options: string[] = [];
    s = settle(cast(s, "p1", "Map the Frontier"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      return picking([plains, flats])(req);
    });
    expect(options).not.toContain("Blooming Marsh");
    expect(options).not.toContain("Bear Cub");
    expect(options).toEqual(expect.arrayContaining(["Plains", "Island", "Forlorn Flats"]));
    for (const name of ["Plains", "Forlorn Flats"]) {
      const ids = idsOf(s, "p1", "battlefield", name);
      expect(ids).toHaveLength(1);
      expect(s.objects[ids[0] as string]?.tapped).toBe(true);
    }
    expect(s.players.p1?.library).toHaveLength(3);
  });

  it("Marauding Sphinx: flying, vigilance, ward; scry 2 on the first crime of the turn only", () => {
    let s = scenario({ p1: { battlefield: ["Marauding Sphinx", ...lands("Mountain", 2)], hand: ["Shock", "Shock"] } });
    const sphinx = idOf(s, "p1", "battlefield", "Marauding Sphinx");
    expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "ward"]));
    const intents: string[] = [];
    let looked = 0;
    s = settleLogging(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), intents, (req) => {
      if (req.intent === "surveilGraveyard" && req.type === "pick") looked = req.options.length;
      return undefined;
    });
    expect(intents.filter((i) => i === "surveilGraveyard")).toHaveLength(1);
    expect(looked).toBe(2);
    s = settleLogging(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), intents, () => undefined);
    expect(s.players.p2?.life).toBe(16);
    expect(intents.filter((i) => i === "surveilGraveyard")).toHaveLength(1);
  });

  it("Metamorphic Blast: the creature becomes a base 0/1 white Rabbit until end of turn; the targeted player draws two cards", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Metamorphic Blast"] },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const blast = idOf(s, "p1", "hand", "Metamorphic Blast");
    const both = modeIndex(s, blast, "Becomes a white 0/1 Rabbit + A player draws two cards");
    expect(both).toBeDefined();
    s = settle(act(s, "p1", { type: "cast", card: blast, mode: both, targets: { c: [angel], p: ["p2"] } }));
    const c = chars(s, angel);
    // Base power and toughness 0/1, plus the counter; the abilities remain.
    expect([c.power, c.toughness]).toEqual([1, 2]);
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Rabbit"]);
    expect(c.keywords).toContain("flying");
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(s.players.p1?.hand).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    expect([chars(s, angel).power, chars(s, angel).subtypes]).toEqual([5, ["Angel"]]);
  });

  it("Miriam, Herd Whisperer: Mounts and Vehicles have hexproof during your turn; counter when a Mount attacks", () => {
    let s = scenario({ p1: { battlefield: ["Miriam, Herd Whisperer", "Giant Beaver", "Mobile Homestead", "Bear Cub"] } });
    const beaver = idOf(s, "p1", "battlefield", "Giant Beaver");
    const home = idOf(s, "p1", "battlefield", "Mobile Homestead");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, beaver).keywords).toContain("hexproof");
    expect(chars(s, home).keywords).toContain("hexproof");
    expect(chars(s, bear).keywords).not.toContain("hexproof");
    const theirs = scenario({ active: "p2", p1: { battlefield: ["Miriam, Herd Whisperer", "Giant Beaver"] } });
    expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Giant Beaver")).keywords).not.toContain("hexproof");
    s = settle(attack(s, [beaver, bear]));
    expect(s.objects[beaver]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Mobile Homestead: haste with a Mount; when attacking, a land from the top may enter tapped", () => {
    const none = scenario({ p1: { battlefield: ["Mobile Homestead"] } });
    expect(chars(none, idOf(none, "p1", "battlefield", "Mobile Homestead")).keywords).not.toContain("haste");
    const run = (top: string, take: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Mobile Homestead", "Giant Beaver"], library: [top, "Swamp"] },
      });
      const home = idOf(s, "p1", "battlefield", "Mobile Homestead");
      expect(chars(s, home).keywords).toContain("haste");
      s = passBoth(activate(s, home, "Crew", { tap: [idOf(s, "p1", "battlefield", "Giant Beaver")] }));
      return settle(attack(s, [home]), (req) => (req.type === "pick" && !take ? [] : undefined));
    };
    const land = run("Plains", true);
    const plains = idOf(land, "p1", "battlefield", "Plains");
    expect(land.objects[plains]?.tapped).toBe(true);
    const declined = run("Plains", false);
    expect(namesIn(declined, declined.players.p1?.library)).toEqual(["Plains", "Swamp"]);
    const spell = run("Bear Cub", true);
    expect(namesIn(spell, spell.players.p1?.library)).toEqual(["Bear Cub", "Swamp"]);
  });

  it("Neutralize the Guards: the targeted opponent's creatures get -1/-1 until end of turn, then scry 2", () => {
    let s = scenario({
      p1: { battlefield: ["Swab Goblin", ...lands("Swamp", 3)], hand: ["Neutralize the Guards"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const intents: string[] = [];
    s = settleLogging(cast(s, "p1", "Neutralize the Guards", { targets: { t: ["p2"] } }), intents, () => undefined);
    expect(crimesOf(s)).toBe(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([1, 1]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Swab Goblin")).power).toBe(2);
    expect(intents).toContain("surveilGraveyard");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    expect(chars(s, cub).power).toBe(2);
  });

  it("Nimble Brigand: unblockable after a crime this turn; draws when it damages a player", () => {
    let s = scenario({ p1: { battlefield: ["Nimble Brigand", "Mountain"], hand: ["Shock"] } });
    const brigand = idOf(s, "p1", "battlefield", "Nimble Brigand");
    expect(chars(s, brigand).keywords).not.toContain("unblockable");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(chars(s, brigand).keywords).toContain("unblockable");
    s = advanceUntil(attack(s, [brigand]), (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Outcaster Greenblade: a basic land or a Desert to hand; +1/+1 per Desert controlled", () => {
    let s = scenario({
      p1: {
        battlefield: ["Forlorn Flats", ...lands("Forest", 3)],
        hand: ["Outcaster Greenblade", "Forlorn Flats"],
        library: ["Blooming Marsh", "Bear Cub", "Forlorn Flats", "Plains"],
      },
    });
    const flats = libraryIds(s, "Forlorn Flats")[0] as string;
    let options: string[] = [];
    s = settle(cast(s, "p1", "Outcaster Greenblade"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map((id) => nameOf(cur, id) ?? "");
      return [flats];
    });
    expect(options.sort()).toEqual(["Forlorn Flats", "Plains"]);
    expect(idsOf(s, "p1", "hand", "Forlorn Flats")).toHaveLength(2);
    const blade = idOf(s, "p1", "battlefield", "Outcaster Greenblade");
    expect([chars(s, blade).power, chars(s, blade).toughness]).toEqual([2, 3]);
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forlorn Flats") });
    expect([chars(s, blade).power, chars(s, blade).toughness]).toEqual([3, 4]);
  });

  it("Outlaw Stitcher: 2/2 Zombie Rogue with two counters for each spell cast this turn after the first", () => {
    const run = (before: number) => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), ...lands("Mountain", before)], hand: ["Outlaw Stitcher", "Shock", "Shock"] },
      });
      for (let i = 0; i < before; i++) s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = settle(cast(s, "p1", "Outlaw Stitcher"));
      const zombie = idOf(s, "p1", "battlefield", "Zombie Rogue");
      const c = chars(s, zombie);
      expect(c.colors.sort()).toEqual(["B", "U"]);
      return [c.power, c.toughness];
    };
    expect(run(0)).toEqual([2, 2]);
    expect(run(1)).toEqual([4, 4]);
    expect(run(2)).toEqual([6, 6]);
  });

  it("Plan the Heist: scry 3 only with no cards in hand, then draw three cards", () => {
    const run = (hand: string[]) => {
      const s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Plan the Heist", ...hand] } });
      const intents: string[] = [];
      let looked = 0;
      const t = settleLogging(cast(s, "p1", "Plan the Heist"), intents, (req) => {
        if (req.intent === "surveilGraveyard" && req.type === "pick") looked = req.options.length;
        return undefined;
      });
      return { hand: t.players.p1?.hand.length, looked, surveil: intents.includes("surveilGraveyard") };
    };
    expect(run([])).toEqual({ hand: 3, looked: 3, surveil: true });
    expect(run(["Bear Cub"])).toEqual({ hand: 4, looked: 0, surveil: false });
  });

  it("Prairie Dog: counter at your end step with no spell cast from hand; {4}{W} adds one more counter", () => {
    const run = (spell: boolean, pump: boolean) => {
      let s = scenario({ p1: { battlefield: ["Prairie Dog", ...lands("Plains", 5), "Mountain"], hand: ["Shock"] } });
      const dog = idOf(s, "p1", "battlefield", "Prairie Dog");
      expect(chars(s, dog).keywords).toContain("lifelink");
      if (spell) s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      if (pump) s = settle(activate(s, dog, "One more"));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      return s.objects[dog]?.counters["+1/+1"] ?? 0;
    };
    expect(run(false, false)).toBe(1);
    expect(run(true, false)).toBe(0);
    expect(run(false, true)).toBe(2);
  });

  it("Prosperity Tycoon: 1/1 red Mercenary on entering; {2}, sacrifice a token: indestructible and tapped", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Prosperity Tycoon"] } });
    s = settle(cast(s, "p1", "Prosperity Tycoon"));
    const merc = idOf(s, "p1", "battlefield", "Mercenary");
    const m = chars(s, merc);
    expect([m.power, m.toughness, m.colors]).toEqual([1, 1, ["R"]]);
    const tycoon = idOf(s, "p1", "battlefield", "Prosperity Tycoon");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === tycoon);
    // Only a token can be sacrificed (not the Bear, which is a card).
    expect(opt?.type === "activate" ? opt.additional?.sacrifice?.options : []).toEqual([merc]);
    s = settle(activate(s, tycoon, "Indestructible", { sacrifice: [merc] }));
    expect(s.objects[merc]).toBeUndefined();
    expect(chars(s, tycoon).keywords).toContain("indestructible");
    expect(s.objects[tycoon]?.tapped).toBe(true);
  });

  it("Rakish Crew: Mercenary on entering; drain 1 when an outlaw you control dies, not another creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 3), "Bear Cub"], hand: ["Rakish Crew", "Shock", "Shock"] },
      p2: { battlefield: ["Nimble Brigand"] },
    });
    s = settle(cast(s, "p1", "Rakish Crew"));
    const merc = idOf(s, "p1", "battlefield", "Mercenary");
    s = settle(cast(s, "p1", "Shock", { targets: { t: [merc] } }));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    // An opposing outlaw or a creature that isn't one: nothing.
    s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
  });

  it("Rakish Crew: the death of an opposing outlaw doesn't drain", () => {
    let s = scenario({
      p1: { battlefield: ["Rakish Crew", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: [{ name: "Nimble Brigand", damage: 1 }] },
    });
    s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Nimble Brigand")] } }));
    expect(idsOf(s, "p2", "graveyard", "Nimble Brigand")).toHaveLength(1);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
  });

  it("Raucous Entertainer: a counter on each creature you control that entered this turn, not the others", () => {
    let s = scenario({
      p1: { battlefield: ["Raucous Entertainer", "Bear Cub", ...lands("Mountain", 3)], hand: ["Swab Goblin"] },
      p2: { battlefield: [{ name: "Llanowar Elves", sick: true }] },
    });
    s = settle(cast(s, "p1", "Swab Goblin"));
    const ent = idOf(s, "p1", "battlefield", "Raucous Entertainer");
    s = settle(activate(s, ent, "Counter on your creatures"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Swab Goblin")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[ent]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Redrock Sentinel: defender; {2}, {T}, sacrifice a land: draw a card and create a Treasure", () => {
    let s = scenario({ p1: { battlefield: ["Redrock Sentinel", ...lands("Forest", 3), "Bear Cub"] } });
    const sentinel = idOf(s, "p1", "battlefield", "Redrock Sentinel");
    expect(chars(s, sentinel).keywords).toContain("defender");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sentinel);
    const options = opt?.type === "activate" ? (opt.additional?.sacrifice?.options ?? []) : [];
    expect(namesIn(s, options).every((n) => n === "Forest")).toBe(true);
    const forest = idsOf(s, "p1", "battlefield", "Forest")[2] as string;
    s = settle(activate(s, sentinel, "Draw", { sacrifice: [forest] }));
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.objects[sentinel]?.tapped).toBe(true);
  });

  it("Resilient Roadrunner: protection from Coyotes; {3}: blocked only by creatures with haste this turn", () => {
    const blockers = (pump: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Resilient Roadrunner", ...lands("Mountain", 3)] },
        p2: { battlefield: ["Driftgloom Coyote", "Bear Cub", "Resilient Roadrunner"] },
      });
      const runner = idOf(s, "p1", "battlefield", "Resilient Roadrunner");
      expect(chars(s, runner).keywords).toContain("haste");
      if (pump) s = settle(activate(s, runner, "Blocked"));
      s = advanceUntil(attack(s, [runner]), (x) => x.pending?.kind === "declareBlockers");
      const ok = (name: string) => {
        try {
          act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: idOf(s, "p2", "battlefield", name), attacker: runner }] });
          return true;
        } catch {
          return false;
        }
      };
      return { coyote: ok("Driftgloom Coyote"), cub: ok("Bear Cub"), hasty: ok("Resilient Roadrunner"), s, runner };
    };
    const { coyote, cub, hasty } = blockers(false);
    expect([coyote, cub, hasty]).toEqual([false, true, true]);
    const pumped = blockers(true);
    expect([pumped.coyote, pumped.cub, pumped.hasty]).toEqual([false, false, true]);
    // The effect lasts only this turn.
    const next = advanceUntil(pumped.s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    expect(chars(next, pumped.runner).blockRules ?? []).toHaveLength(0);
  });

  it("Rictus Robber: 2/2 Zombie Rogue on entering only if a creature died this turn", () => {
    const run = (kill: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Mountain"], hand: ["Rictus Robber", "Shock"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      if (kill) s = settle(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      s = settle(cast(s, "p1", "Rictus Robber"));
      return idsOf(s, "p1", "battlefield", "Zombie Rogue").length;
    };
    expect(run(true)).toBe(1);
    expect(run(false)).toBe(0);
  });

  it("Rise of the Varmints: X green 2/1 Varmints, X being the number of creature cards in your graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Rise of the Varmints"], graveyard: ["Bear Cub", "Swab Goblin", "Plains"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Rise of the Varmints"));
    const varmints = idsOf(s, "p1", "battlefield", "Varmint");
    expect(varmints).toHaveLength(2);
    const v = chars(s, varmints[0] as string);
    expect([v.power, v.toughness, v.colors]).toEqual([2, 1, ["G"]]);
  });
});

describe("Outlaws of Thunder Junction, lot K8 : peu communes (4)", () => {
  type S = GameState;
  /** Index of the activated ability of `id` whose label starts with `label`. */
  const abilityIndex = (s: S, id: string, label: string) =>
    (s.defs[s.objects[id]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && plainText(a.label ?? "").startsWith(label),
    );
  /** Index of the (spree) mode with label `label` for the card `name` in p1's hand. */
  const modeOf = (s: S, name: string, label: string) => {
    const card = idOf(s, "p1", "hand", name);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => plainText(m.label ?? "") === label) : undefined;
    if (!mode) throw new Error(`mode "${label}" not found for ${name}`);
    return mode.index;
  };
  /** Options offered by a \"pick\" choice (empty otherwise). */
  const optionsOf = (req: ChoiceRequest) => (req.type === "pick" ? req.options : []);
  /** Answer that declines an optional choice (\"you may\"): nothing chosen, or \"no\". */
  const decline = (req: ChoiceRequest) => (req.type === "pick" && req.min === 0 ? [] : req.type === "yesNo" ? [0] : undefined);

  it("Rustler Rampage: untaps the targeted player's creatures (not the other's) and gives double strike until end of turn", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Bear Cub", tapped: true }, { name: "Swab Goblin", tapped: true }, ...lands("Plains", 3)],
        hand: ["Rustler Rampage"],
      },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const bears = idOf(s, "p1", "battlefield", "Swab Goblin");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = cast(s, "p1", "Rustler Rampage", {
      mode: modeOf(s, "Rustler Rampage", "Untap a player's creatures + Double strike"),
      targets: { p: ["p1"], c: [cub] },
    });
    s = settle(s);
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(s.objects[bears]?.tapped).toBe(false);
    expect(s.objects[theirs]?.tapped).toBe(true);
    expect(chars(s, cub).keywords).toContain("doubleStrike");
    expect(chars(s, bears).keywords).not.toContain("doubleStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("doubleStrike");
  });

  it("Ruthless Lawbringer: you may sacrifice another creature; if you do, destroy the targeted nonland permanent", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Bear Cub", "Plains", "Swamp", "Swamp"], hand: ["Ruthless Lawbringer"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
    let s = setup();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const forest = idOf(s, "p2", "battlefield", "Forest");
    const sacrificeOptions: string[][] = [];
    const targetOptions: string[][] = [];
    s = settle(cast(s, "p1", "Ruthless Lawbringer"), (req) => {
      if (req.intent === "sacrifice" || optionsOf(req).includes(cub)) sacrificeOptions.push(optionsOf(req));
      else targetOptions.push(optionsOf(req));
      if (optionsOf(req).includes(cub)) return [cub];
      if (optionsOf(req).includes(angel)) return [angel];
      return undefined;
    });
    const law = idOf(s, "p1", "battlefield", "Ruthless Lawbringer");
    // The sacrifice is of another creature; the target is never a land.
    expect(sacrificeOptions.length).toBeGreaterThan(0);
    expect(sacrificeOptions.some((o) => o.includes(law))).toBe(false);
    expect(targetOptions.some((o) => o.includes(angel))).toBe(true);
    expect(targetOptions.some((o) => o.includes(forest))).toBe(false);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Without a sacrifice, nothing is destroyed.
    let t = setup();
    t = settle(cast(t, "p1", "Ruthless Lawbringer"), decline);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Sandstorm Verge: {3}, {T}: the targeted creature can't block this turn, only at sorcery timing", () => {
    let s = scenario({ p1: { battlefield: ["Sandstorm Verge", ...lands("Plains", 3)] }, p2: { battlefield: ["Bear Cub"] } });
    const verge = idOf(s, "p1", "battlefield", "Sandstorm Verge");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", {
      type: "activate",
      source: verge,
      ability: abilityIndex(s, verge, "Can't block"),
      targets: { t: [cub] },
    });
    expect(s.objects[verge]?.tapped).toBe(true);
    s = settle(s);
    expect(chars(s, cub).keywords).toContain("cantBlock");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("cantBlock");
    // Not during combat (sorcery speed).
    const t = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Sandstorm Verge", ...lands("Plains", 3)] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const v2 = idOf(t, "p1", "battlefield", "Sandstorm Verge");
    expect(
      legalActions(t, "p1").some(
        (a) => a.type === "activate" && a.source === v2 && a.ability === abilityIndex(t, v2, "Can't block"),
      ),
    ).toBe(false);
  });

  it("Scalestorm Summoner: when attacking, a 3/1 red Dinosaur if you control a creature with power 4 or more, otherwise nothing", () => {
    const run = (others: string[]) => {
      let s = scenario({ p1: { battlefield: ["Scalestorm Summoner", ...others] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Scalestorm Summoner")]);
      return settleNoBlocks(s);
    };
    const big = run(["Serra Angel"]);
    const dino = idOf(big, "p1", "battlefield", "Dinosaur");
    const c = chars(big, dino);
    expect([c.power, c.toughness]).toEqual([3, 1]);
    expect(c.colors).toEqual(["R"]);
    expect(c.subtypes).toContain("Dinosaur");
    // The Summoner (3/3) and a 2/2 aren't enough.
    expect(idsOf(run(["Bear Cub"]), "p1", "battlefield", "Dinosaur")).toHaveLength(0);
  });

  it("Servant of the Stinger: combat damage to a player after a crime: you may sacrifice it to search for a card; without a crime, nothing", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Servant of the Stinger", "Mountain"],
          hand: ["Shock"],
          library: ["Forest", "Forest", "Serra Angel", "Forest"],
        },
      });
    let s = setup();
    const servant = idOf(s, "p1", "battlefield", "Servant of the Stinger");
    expect(chars(s, servant).keywords).toContain("deathtouch");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(crimesOf(s)).toBe(1);
    s = attack(s, [servant]);
    s = throughCombat(s, (req, _p, st) =>
      req.intent === "search" ? pickNamed(st, req, "Serra Angel") : picking([servant])(req),
    );
    expect(s.players.p2?.life).toBe(17);
    expect(idsOf(s, "p1", "graveyard", "Servant of the Stinger")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    // Without a crime this turn: no trigger, the Servant stays.
    let t = setup();
    const asked: string[] = [];
    t = attack(t, [idOf(t, "p1", "battlefield", "Servant of the Stinger")]);
    t = throughCombat(t, (req) => {
      asked.push(req.intent);
      return undefined;
    });
    expect(t.players.p2?.life).toBe(19);
    expect(idsOf(t, "p1", "battlefield", "Servant of the Stinger")).toHaveLength(1);
    expect(asked).not.toContain("search");
  });

  it("Shackle Slinger: on the second spell of the turn, taps the targeted opposing creature, or stuns it if it is already tapped", () => {
    const run = (tapped: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Shackle Slinger", ...lands("Mountain", 3)], hand: ["Shock", "Shock", "Shock"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped }] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      const slinger = idOf(s, "p1", "battlefield", "Shackle Slinger");
      const seen: string[][] = [];
      const answer = (req: ChoiceRequest) => {
        seen.push(optionsOf(req));
        return picking([cub])(req);
      };
      s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), answer);
      // First spell: nothing.
      expect(s.objects[cub]?.tapped).toBe(tapped);
      expect(s.objects[cub]?.counters.stun ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }), answer);
      expect(seen.some((o) => o.includes(slinger))).toBe(false);
      return { s, cub };
    };
    const untapped = run(false);
    expect(untapped.s.objects[untapped.cub]?.tapped).toBe(true);
    expect(untapped.s.objects[untapped.cub]?.counters.stun ?? 0).toBe(0);
    const tapped = run(true);
    expect(tapped.s.objects[tapped.cub]?.tapped).toBe(true);
    expect(tapped.s.objects[tapped.cub]?.counters.stun).toBe(1);
    // Third spell: no new trigger.
    const third = settle(cast(tapped.s, "p1", "Shock", { targets: { t: ["p2"] } }), picking([tapped.cub]));
    expect(third.objects[tapped.cub]?.counters.stun).toBe(1);
  });

  it("Shepherd of the Clouds: returns the targeted permanent card with mana value 3 or less from your graveyard to hand, to the battlefield with a Mount", () => {
    const run = (mount: boolean) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 5), ...(mount ? ["Stubborn Burrowfiend"] : [])],
          hand: ["Shepherd of the Clouds"],
          graveyard: ["Bear Cub", "Serra Angel", "Shock", "Swab Goblin"],
        },
      });
      const cub = idOf(s, "p1", "graveyard", "Bear Cub");
      const offered: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Shepherd of the Clouds"), (req, _p, cur) => {
        offered.push(...optionsOf(req).map((id) => nameOf(cur, id)));
        return picking([cub])(req);
      });
      expect(offered).toContain("Bear Cub");
      expect(offered).not.toContain("Serra Angel");
      expect(offered).not.toContain("Shock");
      return s;
    };
    const hand = run(false);
    expect(idsOf(hand, "p1", "hand", "Bear Cub")).toHaveLength(1);
    const shepherd = idOf(hand, "p1", "battlefield", "Shepherd of the Clouds");
    expect(chars(hand, shepherd).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    const field = run(true);
    expect(idsOf(field, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(field, "p1", "hand", "Bear Cub")).toHaveLength(0);
  });

  it("Shifting Grift: durably exchanges control of the two targeted creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 4)], hand: ["Shifting Grift"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Shifting Grift", {
      mode: modeOf(s, "Shifting Grift", "Exchange two creatures"),
      targets: { c1: [cub], c2: [angel] },
    });
    s = settle(s);
    expect(s.objects[cub]?.controller).toBe("p2");
    expect(s.objects[angel]?.controller).toBe("p1");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[cub]?.controller).toBe("p2");
    expect(s.objects[angel]?.controller).toBe("p1");
  });

  it('Shifting Grift: the "artifacts" mode exchanges two artifacts; two Islands don\'t pay for the "creatures" mode ({U}{U} + {2})', () => {
    let s = scenario({
      p1: { battlefield: ["Tomb Trawler", ...lands("Island", 3)], hand: ["Shifting Grift"] },
      p2: { battlefield: ["Thunder Lasso"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const labels = opt?.type === "cast" ? opt.modes.map((m) => plainText(m.label ?? "")) : [];
    expect(labels).toContain("Exchange two artifacts");
    expect(labels).not.toContain("Exchange two creatures");
    const trawler = idOf(s, "p1", "battlefield", "Tomb Trawler");
    const lasso = idOf(s, "p2", "battlefield", "Thunder Lasso");
    s = cast(s, "p1", "Shifting Grift", {
      mode: modeOf(s, "Shifting Grift", "Exchange two artifacts"),
      targets: { a1: [trawler], a2: [lasso] },
    });
    s = settle(s);
    expect(s.objects[trawler]?.controller).toBe("p2");
    expect(s.objects[lasso]?.controller).toBe("p1");
  });

  it("Slick Sequence: 2 damage to any target; draw only if you cast another spell this turn", () => {
    // Only spell of the turn: no draw.
    let s = scenario({ p1: { battlefield: ["Island", "Mountain"], hand: ["Slick Sequence"] } });
    s = settle(cast(s, "p1", "Slick Sequence", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.hand).toHaveLength(0);
    // After another spell: draw.
    let t = scenario({
      p1: { battlefield: ["Island", ...lands("Mountain", 2)], hand: ["Shock", "Slick Sequence"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    t = settle(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
    const cub = idOf(t, "p2", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Slick Sequence", { targets: { t: [cub] } }));
    expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(1);
    // A spell cast by the opponent doesn't count.
    let u = scenario({
      p1: { battlefield: ["Island", "Mountain"], hand: ["Slick Sequence"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    u = cast(u, "p1", "Slick Sequence", { targets: { t: ["p2"] } });
    u = act(u, "p1", { type: "pass" });
    u = settle(cast(u, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(u.players.p2?.life).toBe(18);
    expect(u.players.p1?.hand).toHaveLength(0);
  });

  it("Slickshot Lockpicker: the targeted instant or sorcery in your graveyard gains flashback (its mana cost) until end of turn", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Mountain", 2)],
          hand: ["Slickshot Lockpicker"],
          graveyard: ["Shock", "Bear Cub"],
        },
      });
    let s = setup();
    const shock = idOf(s, "p1", "graveyard", "Shock");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Slickshot Lockpicker"), (req) => {
      seen.push(optionsOf(req));
      return picking([shock])(req);
    });
    expect(seen.flat().map((id) => nameOf(s, id))).not.toContain("Bear Cub");
    expect(castable(s, "p1", shock)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    expect(exiled(s, "Shock")).toHaveLength(1);
    // Not cast: the flashback disappears at end of turn.
    let t = setup();
    const shock2 = idOf(t, "p1", "graveyard", "Shock");
    t = settle(cast(t, "p1", "Slickshot Lockpicker"), picking([shock2]));
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.pending?.kind === "priority" && x.pending.player === "p1");
    expect(castable(t, "p1", shock2)).toBe(false);
  });

  it("Slickshot Lockpicker: Plot {2}{U} from hand", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Slickshot Lockpicker"] } });
    const card = idOf(s, "p1", "hand", "Slickshot Lockpicker");
    s = act(s, "p1", { type: "activate", source: card, ability: abilityIndex(s, card, "Plot") });
    const plotted = s.exile.find((id) => nameOf(s, id) === "Slickshot Lockpicker") as string;
    expect(s.objects[plotted]?.exiledVia?.kind).toBe("plot");
    expect(s.stack).toHaveLength(0);
  });

  it("Spinewoods Armadillo: {1}{G}, discard it: a basic land or a Desert from the library to hand, and 3 life", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Spinewoods Armadillo"],
        library: ["Serra Angel", "Sandstorm Verge", "Plains", "Ruthless Lawbringer"],
      },
    });
    const armadillo = idOf(s, "p1", "hand", "Spinewoods Armadillo");
    const offered: string[] = [];
    s = act(s, "p1", { type: "activate", source: armadillo, ability: abilityIndex(s, armadillo, "Basic land") });
    expect(idsOf(s, "p1", "graveyard", "Spinewoods Armadillo")).toHaveLength(1);
    s = settle(s, (req, _p, st) => {
      for (const id of optionsOf(req)) offered.push(nameOf(st, id) ?? "");
      return pickNamed(st, req, "Sandstorm Verge");
    });
    expect(offered).toEqual(expect.arrayContaining(["Sandstorm Verge", "Plains"]));
    expect(offered).not.toContain("Serra Angel");
    expect(offered).not.toContain("Ruthless Lawbringer");
    expect(idsOf(s, "p1", "hand", "Sandstorm Verge")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(23);
    // 7/7 with reach and ward.
    const t = scenario({ p1: { battlefield: ["Spinewoods Armadillo"] } });
    const c = chars(t, idOf(t, "p1", "battlefield", "Spinewoods Armadillo"));
    expect([c.power, c.toughness]).toEqual([7, 7]);
    expect(c.keywords).toEqual(expect.arrayContaining(["reach", "ward"]));
  });

  it("Stubborn Burrowfiend: saddled, mills two cards then +X/+X until end of turn (X: creature cards in your graveyard)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Stubborn Burrowfiend", "Bear Cub"],
        graveyard: ["Swab Goblin", "Shock"],
        library: ["Serra Angel", "Forest", "Forest", "Forest"],
      },
    });
    const fiend = idOf(s, "p1", "battlefield", "Stubborn Burrowfiend");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const saddle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === fiend);
    s = act(s, "p1", {
      type: "activate",
      source: fiend,
      ability: saddle?.type === "activate" ? saddle.ability : -1,
      tap: [cub],
    });
    s = settle(s);
    expect(s.players.p1?.library).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    // Swab Goblin and Serra Angel: X = 2 (neither Shock nor the Forest).
    const c = chars(s, fiend);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const d = chars(s, fiend);
    expect([d.power, d.toughness]).toEqual([2, 2]);
  });

  it("Take for a Ride: gain control of the targeted creature until end of turn, untap it, and it gains haste; flash after a crime", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Take for a Ride"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Take for a Ride", { targets: { t: [angel] } }));
    expect(s.objects[angel]?.controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(false);
    expect(chars(s, angel).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[angel]?.controller).toBe("p2");
    // Outside the main phase: only after a crime.
    let t = scenario({
      step: "beginCombat",
      p1: { battlefield: lands("Mountain", 4), hand: ["Take for a Ride", "Shock"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ride = idOf(t, "p1", "hand", "Take for a Ride");
    expect(castable(t, "p1", ride)).toBe(false);
    t = settle(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(t.turn.step).toBe("beginCombat");
    expect(castable(t, "p1", ride)).toBe(true);
  });

  it("This Town Ain't Big Enough: costs {3} less if it targets a permanent you control; returns up to two nonland permanents", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["This Town Ain't Big Enough"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
    let s = setup();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Only the opposing permanent: {4}{U} with two Islands, refused.
    expect(() => cast(setup(), "p1", "This Town Ain't Big Enough", { targets: { t: [angel] } })).toThrow();
    s = settle(cast(s, "p1", "This Town Ain't Big Enough", { targets: { t: [cub, angel] } }));
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    // A land is not a target.
    const forest = idOf(setup(), "p2", "battlefield", "Forest");
    expect(() => cast(setup(), "p1", "This Town Ain't Big Enough", { targets: { t: [cub, forest] } })).toThrow();
  });

  it("Thunder Lasso: attaches on entering to your targeted creature (+1/+1); when it attacks, taps the defender's targeted creature", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Plains", 3)], hand: ["Thunder Lasso"] },
      p2: { battlefield: ["Swab Goblin"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const bears = idOf(s, "p2", "battlefield", "Swab Goblin");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Thunder Lasso"), (req) => {
      seen.push(optionsOf(req));
      return picking([cub])(req);
    });
    expect(seen.some((o) => o.includes(bears))).toBe(false);
    const lasso = idOf(s, "p1", "battlefield", "Thunder Lasso");
    expect(s.objects[lasso]?.attachedTo).toBe(cub);
    const c = chars(s, cub);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(canActivate(s, "p1", lasso)).toBe(false);
    const attackSeen: string[][] = [];
    s = attack(s, [cub]);
    s = settle(s, (req) => {
      attackSeen.push(optionsOf(req));
      return picking([bears])(req);
    });
    expect(attackSeen.some((o) => o.includes(cub))).toBe(false);
    expect(s.objects[bears]?.tapped).toBe(true);
  });

  it("Tomb Trawler: {2}: the targeted card in your graveyard goes to the bottom of your library", () => {
    let s = scenario({
      p1: { battlefield: ["Tomb Trawler", ...lands("Forest", 2)], graveyard: ["Serra Angel"] },
      p2: { graveyard: ["Bear Cub"] },
    });
    const trawler = idOf(s, "p1", "battlefield", "Tomb Trawler");
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    const theirs = idOf(s, "p2", "graveyard", "Bear Cub");
    const c = chars(s, trawler);
    expect([c.power, c.toughness]).toEqual([0, 4]);
    expect(() =>
      act(s, "p1", {
        type: "activate",
        source: trawler,
        ability: abilityIndex(s, trawler, "A card"),
        targets: { t: [theirs] },
      }),
    ).toThrow();
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: trawler,
        ability: abilityIndex(s, trawler, "A card"),
        targets: { t: [angel] },
      }),
    );
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(11);
    expect(nameOf(s, s.players.p1?.library.at(-1) as string)).toBe("Serra Angel");
  });

  it("Unfortunate Accident: destroy the targeted creature and/or create a 1/1 red Mercenary (spree costs added up)", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Unfortunate Accident"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Unfortunate Accident", {
      mode: modeOf(s, "Unfortunate Accident", "Destroy a creature + 1/1 Mercenary"),
      targets: { c: [angel] },
    });
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    const merc = idOf(s, "p1", "battlefield", "Mercenary");
    const c = chars(s, merc);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors).toEqual(["R"]);
    expect(c.subtypes).toContain("Mercenary");
    // Mercenaire seul : {B} + {1}.
    let t = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Unfortunate Accident"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Unfortunate Accident", { mode: modeOf(t, "Unfortunate Accident", "1/1 Mercenary") }));
    expect(idsOf(t, "p1", "battlefield", "Mercenary")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it('Unfortunate Accident: the Mercenary has "{T}: +1/+0 to your targeted creature", at sorcery timing', () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Unfortunate Accident"] } });
    s = settle(cast(s, "p1", "Unfortunate Accident", { mode: modeOf(s, "Unfortunate Accident", "1/1 Mercenary") }));
    const merc = idOf(s, "p1", "battlefield", "Mercenary");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    // Summoning sickness: not this turn.
    expect(canActivate(s, "p1", merc)).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    expect(canActivate(s, "p1", merc)).toBe(true);
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === merc);
    s = act(s, "p1", {
      type: "activate",
      source: merc,
      ability: opt?.type === "activate" ? opt.ability : -1,
      targets: { t: [cub] },
    });
    s = settle(s);
    expect(chars(s, cub).power).toBe(3);
  });

  it("Unscrupulous Contractor: you may sacrifice a creature (itself included); if you do, the targeted player draws two cards and loses 2 life", () => {
    const setup = () => scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Unscrupulous Contractor"] } });
    let s = setup();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const sacOptions: string[][] = [];
    s = settle(cast(s, "p1", "Unscrupulous Contractor"), (req) => {
      const o = optionsOf(req);
      if (o.includes(cub)) {
        sacOptions.push(o);
        return [cub];
      }
      if (o.includes("p2")) return ["p2"];
      return undefined;
    });
    const contractor = idOf(s, "p1", "battlefield", "Unscrupulous Contractor");
    expect(sacOptions[0]).toContain(contractor);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(20);
    // Without a sacrifice: nothing.
    let t = setup();
    t = settle(cast(t, "p1", "Unscrupulous Contractor"), decline);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(t.players.p2?.hand).toHaveLength(0);
    expect(t.players.p2?.life).toBe(20);
  });

  it("Vial Smasher, Gleeful Grenadier: 1 damage to the targeted opponent when another outlaw enters under your control, not for another creature", () => {
    let s = scenario({
      p1: {
        battlefield: ["Vial Smasher, Gleeful Grenadier", ...lands("Swamp", 2), ...lands("Forest", 2)],
        hand: ["Servant of the Stinger", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Servant of the Stinger"), picking(["p2"]));
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(20);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(s.players.p2?.life).toBe(19);
  });

  it("Visage Bandit: may enter as a copy of one of your creatures, also being a Shapeshifter Rascal; otherwise a 2/2", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Serra Angel", ...lands("Island", 4)], hand: ["Visage Bandit"] },
        p2: { battlefield: ["Bear Cub"] },
      });
    let s = setup();
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Visage Bandit"), (req) => {
      seen.push(optionsOf(req));
      return picking([angel])(req);
    });
    expect(seen.some((o) => o.includes(angel))).toBe(true);
    expect(seen.some((o) => o.includes(theirs))).toBe(false);
    const bandit = idOf(s, "p1", "battlefield", "Visage Bandit");
    const c = chars(s, bandit);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Angel", "Shapeshifter", "Rogue"]));
    // Without a copy: 2/2 Shapeshifter Rascal.
    let t = setup();
    t = settle(cast(t, "p1", "Visage Bandit"), decline);
    const d = chars(t, idOf(t, "p1", "battlefield", "Visage Bandit"));
    expect([d.power, d.toughness]).toEqual([2, 2]);
    expect(d.subtypes).toEqual(expect.arrayContaining(["Shapeshifter", "Rogue"]));
  });

  it("Wrangler of the Damned: at the beginning of your end step, a 2/2 white flying Spirit if you cast no spell from your hand this turn", () => {
    const toEnd = (s: S) => advanceUntil(s, (x) => x.turn.active === "p2");
    const quiet = toEnd(scenario({ p1: { battlefield: ["Wrangler of the Damned"] } }));
    const spirit = idOf(quiet, "p1", "battlefield", "Spirit");
    const c = chars(quiet, spirit);
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.colors).toEqual(["W"]);
    expect(c.keywords).toContain("flying");
    let s = scenario({ p1: { battlefield: ["Wrangler of the Damned", "Mountain"], hand: ["Shock"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Wrangler of the Damned")).keywords).toContain("flash");
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    s = toEnd(s);
    expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(0);
    // Not during the opponent's end step.
    const other = advanceUntil(
      scenario({ active: "p2", p1: { battlefield: ["Wrangler of the Damned"] } }),
      (x) => x.turn.active === "p1",
    );
    expect(idsOf(other, "p1", "battlefield", "Spirit")).toHaveLength(0);
  });
});

describe('PLAN-A A3: "the creatures that saddled it this turn" accumulate the Mount activations of the turn', () => {
  /** Saddles the Mount once for each group of tapped creatures. */
  const saddleWith = (s0: GameState, mount: string, ...groups: string[][]) => {
    let s = s0;
    for (const tap of groups) {
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === mount);
      s = act(s, "p1", { type: "activate", source: mount, ability: a?.type === "activate" ? a.ability : -1, tap });
      s = passBoth(s);
    }
    return s;
  };

  it("Giant Beaver: saddled twice, both creatures can receive the counter", () => {
    let s = scenario({ p1: { battlefield: ["Giant Beaver", "Serra Angel", "Shivan Dragon"] } });
    const beaver = idOf(s, "p1", "battlefield", "Giant Beaver");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    s = saddleWith(s, beaver, [angel], [dragon]);
    expect(s.objects[beaver]?.crewedBy?.ids.sort()).toEqual([angel, dragon].sort());
    s = attack(s, [beaver]);
    let options: string[] = [];
    s = settle(s, (req) => {
      if (req.type !== "pick") return undefined;
      options = req.options;
      return [angel];
    });
    expect(options.sort()).toEqual([angel, dragon].sort());
    expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
  });

  it("Rambling Possum: saddled twice, both creatures can return to hand", () => {
    let s = scenario({ p1: { battlefield: ["Rambling Possum", "Bear Cub", "Llanowar Elves"] } });
    const possum = idOf(s, "p1", "battlefield", "Rambling Possum");
    s = saddleWith(s, possum, [idOf(s, "p1", "battlefield", "Bear Cub")], [idOf(s, "p1", "battlefield", "Llanowar Elves")]);
    s = attack(s, [possum]);
    s = settle(s, (req) => (req.type === "pick" ? req.options : undefined));
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
  });

  it("Fortune, Loyal Steed: at end of combat, it and up to one creature that saddled it are exiled then returned", () => {
    let s = scenario({ p1: { battlefield: ["Fortune, Loyal Steed", "Bear Cub", "Llanowar Elves"] } });
    const fortune = idOf(s, "p1", "battlefield", "Fortune, Loyal Steed");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = saddleWith(s, fortune, [bear], [elves]);
    s = attack(s, [fortune]);
    let asked: { options: string[]; max?: number } | undefined;
    s = throughCombat(s, (req) => {
      // Fortune returns: scry 2 (suggested answer).
      if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
      asked = { options: req.options, max: req.max };
      return [bear];
    });
    expect(asked?.options.sort()).toEqual([bear, elves].sort());
    expect(asked?.max).toBe(1);
    // The Bear returns (new object, untapped); the Elves, not chosen, stay tapped.
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).not.toContain(bear);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toEqual([elves]);
    expect(s.objects[elves]?.tapped).toBe(true);
  });

  it("The Gitrog, Ravenous Ride: sacrifice a single creature that saddled it; X is its power", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Gitrog, Ravenous Ride", "Bear Cub", "Serra Angel"],
        hand: [],
        library: lands("Swamp", 10),
      },
    });
    const gitrog = idOf(s, "p1", "battlefield", "The Gitrog, Ravenous Ride");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = saddleWith(s, gitrog, [bear], [angel]);
    s = attack(s, [gitrog]);
    let options: string[] = [];
    s = throughCombat(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(angel)) {
        options = req.options;
        return [angel];
      }
      return [];
    });
    expect(options.sort()).toEqual([bear, angel].sort());
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Serra Angel"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toEqual([bear]);
    // Power of the Angel: 4 cards drawn (no land put onto the battlefield).
    expect(s.players.p1?.hand).toHaveLength(4);
  });
});

describe('Outlaws of Thunder Junction, PLAN-A A4a: "the defending player", "that player" with several', () => {
  it("Spring Splasher: the targeted creature is the defending player's", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Spring Splasher"] },
      p2: { battlefield: ["Serra Angel"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Spring Splasher")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
  });

  it("Thunder Lasso: the tapped creature is the defending player's", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Thunder Lasso", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s.objects[idOf(s, "p1", "battlefield", "Thunder Lasso")]!.attachedTo = bear;
    s.version += 1;
    const run = combatTargetsOffered(attackPlayer(s, [bear], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
    expect(run.s.objects[idOf(run.s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(false);
  });

  it("Tinybones, the Pickpocket: the card comes from the graveyard of the damaged player", () => {
    const s = scenario({
      players: 3,
      p1: { battlefield: ["Tinybones, the Pickpocket"] },
      p2: { graveyard: ["Serra Angel"] },
      p3: { graveyard: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Tinybones, the Pickpocket")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
  });
});

describe("attack tax and planeswalkers (PLAN-H, lot H5)", () => {
  it("Archangel of Tithes: attacking a planeswalker of its controller also costs {1}", () => {
    const s = scenario({
      p1: { battlefield: ["Bear Cub"] },
      p2: { battlefield: ["Archangel of Tithes", "Ajani Resolute"] },
      step: "declareAttackers",
    });
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    expect(() => declareAttackers(s, "p1", [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: walker }])).toThrow();
  });
});

describe("attacking copies in multiplayer (PLAN-H, lot H5)", () => {
  const activate = (s: GameState, source: string, label: string, extra: object = {}) => {
    const opt = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === source && plainText(a.label ?? "").startsWith(label),
    );
    if (opt?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, "p1", { type: "activate", source, ability: opt.ability, ...extra });
  };
  it('Calamity, Galloping Inferno: "repeat this process" — each copy chooses what it attacks (508.4)', () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Calamity, Galloping Inferno", "Bear Cub", "Swab Goblin"] } });
    const cal = idOf(s, "p1", "battlefield", "Calamity, Galloping Inferno");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activate(s, cal, "Saddle", { tap: [cub, idOf(s, "p1", "battlefield", "Swab Goblin")] });
    s = passBoth(s);
    s = attack(s, [cal]);
    const defenders = ["p2", "p3"];
    let asked = 0;
    s = settleNoBlocks(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(cub)) return [cub];
      asked++;
      return [defenders.shift() as string];
    });
    expect(asked).toBe(2);
    const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => id !== cub);
    expect(copies.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender)).toEqual(["p2", "p3"]);
  });
});
