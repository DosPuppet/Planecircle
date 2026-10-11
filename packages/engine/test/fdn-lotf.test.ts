/**
 * Foundations, lot F: cards with unique mechanics (casting permissions, doubling, protection,
 * choices on entering, restricted mana, spell copying, end of turn…
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import { fx, triggered, when } from "../src/dsl";
import { grantPlay } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { canPay, manaAbilitiesOf } from "../src/mana";
import { chars, onBattlefield } from "../src/state";
import type { ActionOption, GameState } from "../src/types";
import {
  act,
  advanceUntil,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  passAccepting,
  passBoth,
  scenario,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const choose = (s: S, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const castOption = (s: S, p: string, card: string) =>
  legalActions(s, p).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
const counters = (s: S, id: string) => s.objects[id]?.counters ?? {};
/** Advances (passes, suggested answers, no attack or block) until `until` is true. */
function advance(s: S, until: (x: S) => boolean): S {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur) && !cur.over; i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p.kind === "discard")
      cur = act(cur, p.player, { type: "discard", cards: (cur.players[p.player]?.hand ?? []).slice(0, p.count) });
    else break;
  }
  return cur;
}

describe("Lot F: players and prevention", () => {
  it("Crystal Barricade: player hexproof, noncombat damage prevented", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Crystal Barricade", "Llanowar Elves"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Burst Lightning"] },
    });
    const opt = castOption(s, "p2", idOf(s, "p2", "hand", "Burst Lightning"));
    expect(opt?.modes[0]?.targets[0]?.legal).not.toContain("p1");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = cast(s, "p2", "Burst Lightning", { targets: { t: [elf] } });
    s = passBoth(s);
    expect(onBattlefield(s, elf)).toBe(true);
  });

  it("Herald of Eternal Dawn: you don't lose at 0 life", () => {
    let s = scenario({
      p1: { battlefield: ["Herald of Eternal Dawn"], life: 1 },
      p2: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      active: "p2",
    });
    s = cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } });
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(-1);
    expect(s.over).toBe(false);
  });

  it("Niv-Mizzet: you draw as many cards as noncombat damage dealt to an opponent", () => {
    let s = scenario({ p1: { battlefield: ["Niv-Mizzet, Visionary", "Mountain"], hand: ["Burst Lightning"] } });
    const hand = s.players.p1?.hand.length ?? 0;
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p1?.hand.length).toBe(hand - 1 + 2);
  });

  it("Twinflame Tyrant: damage to opponents and their permanents is doubled", () => {
    let s = scenario({ p1: { battlefield: ["Twinflame Tyrant", "Mountain"], hand: ["Burst Lightning"] } });
    s = cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("Lot F: costs", () => {
  it("Luminous Rebuke costs {3} less if it targets a tapped creature", () => {
    const s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Luminous Rebuke"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }, "Llanowar Elves"] },
    });
    const card = idOf(s, "p1", "hand", "Luminous Rebuke");
    expect(castOption(s, "p1", card)).toBeDefined();
    expect(() =>
      cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }),
    ).toThrow();
    const t = cast(s, "p1", "Luminous Rebuke", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } });
    expect(passBoth(t).players.p2?.graveyard.map((id) => nameOf(t, id))).toBeDefined();
  });

  it("Blasphemous Edict: alternative cost {B} with 13 creatures in play", () => {
    const setup = (n: number) =>
      scenario({ p1: { battlefield: ["Swamp", ...Array(n).fill("Llanowar Elves")], hand: ["Blasphemous Edict"] } });
    expect(castOption(setup(5), "p1", idOf(setup(5), "p1", "hand", "Blasphemous Edict"))).toBeUndefined();
    let s = setup(13);
    const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Blasphemous Edict"));
    expect(opt?.altAvailable).toBe(true);
    s = cast(s, "p1", "Blasphemous Edict", { alternative: true });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Eaten Alive: sacrifice a creature, or pay {3}{B} instead", () => {
    const base = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Llanowar Elves"], hand: ["Eaten Alive"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
    let s = base();
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Eaten Alive", { targets: { t: [dragon] }, sacrifice: [] });
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(4);
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Shivan Dragon");

    let t = base();
    t = cast(t, "p1", "Eaten Alive", { targets: { t: [dragon] }, sacrifice: [idOf(t, "p1", "battlefield", "Llanowar Elves")] });
    expect(idsOf(t, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Omniscience: spells from hand are cast without paying", () => {
    let s = scenario({ p1: { battlefield: ["Omniscience"], hand: ["Shivan Dragon"] } });
    const opt = castOption(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"));
    expect(opt?.freeAvailable).toBe(true);
    s = cast(s, "p1", "Shivan Dragon", { free: true });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });
});

describe("Lot F: playing from other zones", () => {
  it("Sphinx of Forgotten Lore: an instant in the graveyard gains flashback (then is exiled)", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Sphinx of Forgotten Lore", "Mountain"], graveyard: ["Burst Lightning"] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Sphinx of Forgotten Lore"), defender: "p2" }],
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p1");
    const bolt = idOf(s, "p1", "graveyard", "Burst Lightning");
    expect(castOption(s, "p1", bolt)?.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Burst Lightning");
  });

  it("flashback {0} granted (Archmage's Newt pumped): cast for no mana, then exiled; nothing the next turn", () => {
    let s = scenario({ p1: { graveyard: ["Burst Lightning"] } });
    const bolt = idOf(s, "p1", "graveyard", "Burst Lightning");
    grantPlay(s, "p1", [bolt], "thisTurn", { flashback: true, free: true });
    expect(castOption(s, "p1", bolt)?.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Burst Lightning");
    // The permission expires at end of turn.
    const t = scenario({ p1: { graveyard: ["Burst Lightning"] } });
    const card = idOf(t, "p1", "graveyard", "Burst Lightning");
    grantPlay(t, "p1", [card], "thisTurn", { flashback: true });
    const next = advanceUntil(t, (x) => x.turn.number > t.turn.number && x.turn.active === "p1" && x.turn.step === "main1");
    expect(castOption(next, "p1", card)).toBeUndefined();
  });

  it("Strongbox Raider: the chosen card stays playable until the end of the next turn", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 4), "Island"],
        hand: ["Strongbox Raider"],
        library: ["Shivan Dragon", "Opt", "Forest", "Forest", "Forest"],
      },
    });
    // An attack this turn (turn log).
    s.turnLog.push({ e: "attack", player: "p1", defender: "p2", types: ["Creature"], subtypes: [] });
    s = cast(s, "p1", "Strongbox Raider");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "impulse");
    const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
    s = choose(s, [opt]);
    // Opponent's turn, then our next turn: still playable; the turn after that, not at all.
    s = advance(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(castOption(s, "p1", opt)).toBeDefined();
    s = advance(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
    expect(castOption(s, "p1", opt)).toBeUndefined();
  });

  it("Etali: the exiled cards are cast for free", () => {
    let s = scenario({
      step: "beginCombat",
      p1: { battlefield: ["Etali, Primal Storm"], library: ["Shivan Dragon", "Forest"] },
      p2: { library: ["Pelakka Wurm", "Forest"] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Etali, Primal Storm"), defender: "p2" }],
    });
    s = untilCastNow(s);
    // During resolution (608.2g): the two exiled spells are offered (not the lands).
    const wurm = s.exile.find((id) => nameOf(s, id) === "Pelakka Wurm") as string;
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect([...(castNowOf(s)?.cards ?? [])].sort()).toEqual([wurm, dragon].sort());
    expect(castOption(s, "p1", wurm)?.free).toBe(true);
    s = act(s, "p1", { type: "cast", card: wurm });
    // "As many spells as you want": the Dragon is still offered; we decline.
    expect(castNowOf(s)?.cards).toEqual([dragon]);
    s = act(s, "p1", { type: "pass" });
    expect(castNowOf(s)).toBeUndefined();
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.battlefield.some((id) => nameOf(s, id) === "Pelakka Wurm" && s.objects[id]?.controller === "p1")).toBe(true);
    // The uncast Dragon stays in exile, without permission.
    expect(s.exile).toContain(dragon);
    expect(castOption(s, "p1", dragon)).toBeUndefined();
  });

  /** The activated ability of Tinybones ("each opponent discards a card"). */
  const opt0 = (s: GameState) => {
    const tiny = idOf(s, "p1", "battlefield", "Tinybones, Bauble Burglar");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === tiny);
    return a?.type === "activate" ? a.ability : -1;
  };
  it("Tinybones: the discarded card is exiled with a plunder counter, playable with any mana", () => {
    let s = scenario({
      p1: { battlefield: ["Tinybones, Bauble Burglar", ...lands("Swamp", 5), "Forest"] },
      p2: { hand: ["Giant Growth"] },
    });
    const tiny = idOf(s, "p1", "battlefield", "Tinybones, Bauble Burglar");
    const discardAbility = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === tiny);
    s = act(s, "p1", {
      type: "activate",
      source: tiny,
      ability: discardAbility?.type === "activate" ? discardAbility.ability : -1,
    });
    s = passAccepting(s, (x) => x.stack.length === 0);
    const growth = s.exile.find((id) => nameOf(s, id) === "Giant Growth") as string;
    expect(counters(s, growth).stash).toBe(1);
    // Giant Growth costs {G}; the untapped Swamp is enough (mana of any type).
    for (const id of s.battlefield) if (nameOf(s, id) === "Forest") (s.objects[id] as { tapped: boolean }).tapped = true;
    const opt = castOption(s, "p1", growth);
    expect(opt).toBeDefined();
    // "Play": a discarded land can be played too (PLAN-D, D8).
    let t = scenario({
      p1: { battlefield: ["Tinybones, Bauble Burglar", ...lands("Swamp", 4)] },
      p2: { hand: ["Island"] },
    });
    t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Tinybones, Bauble Burglar"), ability: opt0(t) });
    t = passAccepting(t, (x) => x.stack.length === 0);
    const island = t.exile.find((id) => nameOf(t, id) === "Island") as string;
    expect(counters(t, island).stash).toBe(1);
    expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === island)).toBe(true);
    t = act(t, "p1", { type: "playLand", card: island });
    expect(idsOf(t, "p1", "battlefield", "Island")).toHaveLength(1);
  });

  it("Muldrotha: one permanent of each type from the graveyard, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Muldrotha, the Gravetide", ...lands("Forest", 6)],
        graveyard: ["Llanowar Elves", "Helpful Hunter", "Forest"],
      },
    });
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    expect(castOption(s, "p1", elves)?.fromGraveyard).toBe(true);
    s = act(s, "p1", { type: "cast", card: elves });
    s = passBoth(s);
    const hunter = idOf(s, "p1", "graveyard", "Helpful Hunter");
    expect(castOption(s, "p1", hunter)).toBeUndefined(); // Creature type already used this turn
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === idOf(s, "p1", "graveyard", "Forest"))).toBe(
      true,
    );
  });

  it("Muldrotha: the player chooses the permanent type a card with several uses (PLAN-M M6)", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: ["Muldrotha, the Gravetide", ...lands("Forest", 6)],
          graveyard: ["Gingerbrute", "Wayfarer's Bauble", "Llanowar Elves"],
        },
      });
    let s = start();
    const ginger = idOf(s, "p1", "graveyard", "Gingerbrute");
    const opt = castOption(s, "p1", ginger);
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "permanentType") : undefined;
    expect(pick?.options).toEqual(["Artifact", "Creature"]);
    expect(pick?.suggested).toEqual(["Artifact"]);
    // As a creature: the artifact (Wayfarer's Bauble) stays castable, the creature (Llanowar Elves) no longer is.
    s = passBoth(act(s, "p1", { type: "cast", card: ginger, picks: { permanentType: ["Creature"] } }));
    expect(castOption(s, "p1", idOf(s, "p1", "graveyard", "Wayfarer's Bauble"))).toBeDefined();
    expect(castOption(s, "p1", idOf(s, "p1", "graveyard", "Llanowar Elves"))).toBeUndefined();
    // By default, the first type (Artifact).
    let t = start();
    t = passBoth(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "Gingerbrute") }));
    expect(castOption(t, "p1", idOf(t, "p1", "graveyard", "Wayfarer's Bauble"))).toBeUndefined();
    // A type the card doesn't have: refused.
    const u = start();
    expect(() =>
      act(u, "p1", { type: "cast", card: idOf(u, "p1", "graveyard", "Gingerbrute"), picks: { permanentType: ["Enchantment"] } }),
    ).toThrow(RulesError);
  });

  it("Quilled Greatwurm: cast from the graveyard by removing six counters", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), "Llanowar Elves"], graveyard: ["Quilled Greatwurm"] } });
    const wurm = idOf(s, "p1", "graveyard", "Quilled Greatwurm");
    expect(castOption(s, "p1", wurm)).toBeUndefined();
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    (s.objects[elf] as { counters: Record<string, number> }).counters["+1/+1"] = 6;
    expect(castOption(s, "p1", wurm)).toBeDefined();
    s = act(s, "p1", { type: "cast", card: wurm });
    expect(counters(s, elf)["+1/+1"] ?? 0).toBe(0);
  });

  it("Quilled Greatwurm: the player distributes the six removed counters among their creatures", () => {
    const start = () => {
      const s = scenario({
        p1: {
          battlefield: [
            ...lands("Forest", 6),
            { name: "Llanowar Elves", counters: { "+1/+1": 4 } },
            { name: "Bear Cub", counters: { "+1/+1": 3 } },
          ],
          graveyard: ["Quilled Greatwurm"],
        },
      });
      return { s, wurm: idOf(s, "p1", "graveyard", "Quilled Greatwurm") };
    };
    const { s, wurm } = start();
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = castOption(s, "p1", wurm);
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "counterFrom") : undefined;
    expect(pick?.count).toBe(6);
    expect(pick?.options.sort()).toEqual([elf, cub].sort());
    expect(pick?.repeat).toEqual({ [elf]: 4, [cub]: 3 });
    // Three of each: the Elf keeps one counter (the engine would have taken them from the Elf first).
    const t = act(s, "p1", { type: "cast", card: wurm, picks: { counterFrom: [cub, cub, cub, elf, elf, elf] } });
    expect(counters(t, elf)["+1/+1"]).toBe(1);
    expect(counters(t, cub)["+1/+1"] ?? 0).toBe(0);
    // More counters than a creature has, or a number other than six: refused.
    expect(() => act(s, "p1", { type: "cast", card: wurm, picks: { counterFrom: [cub, cub, cub, cub, elf, elf] } })).toThrow(
      RulesError,
    );
    expect(() => act(s, "p1", { type: "cast", card: wurm, picks: { counterFrom: [elf, elf, elf, elf, cub] } })).toThrow(
      RulesError,
    );
  });

  it("Quilled Greatwurm: the player also chooses the kind of the counters removed from a creature (PLAN-M M6)", () => {
    const start = () =>
      scenario({
        p1: {
          battlefield: [
            ...lands("Forest", 6),
            { name: "Llanowar Elves", counters: { "+1/+1": 4, charge: 2 } },
            { name: "Bear Cub", counters: { "+1/+1": 3 } },
          ],
          graveyard: ["Quilled Greatwurm"],
        },
      });
    const s = start();
    const wurm = idOf(s, "p1", "graveyard", "Quilled Greatwurm");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = castOption(s, "p1", wurm);
    const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "counterFrom") : undefined;
    expect(pick?.options).toContain(`${elf}:charge`);
    expect(pick?.options).not.toContain(`${cub}:+1/+1`);
    // By default, the Elf's six counters (charge first, +1/+1 last).
    const d = act(start(), "p1", { type: "cast", card: wurm });
    expect(counters(d, elf)).toEqual({});
    // Four +1/+1 counters from the Elf (its charge counters stay), two from the Bear Cub.
    const plus = `${elf}:+1/+1`;
    const t = act(s, "p1", { type: "cast", card: wurm, picks: { counterFrom: [plus, plus, plus, plus, cub, cub] } });
    expect(counters(t, elf)).toEqual({ charge: 2 });
    expect(counters(t, cub)["+1/+1"]).toBe(1);
    // A kind chosen, then the default kind for the rest: two charge counters, then +1/+1 ones.
    const u = act(s, "p1", { type: "cast", card: wurm, picks: { counterFrom: [`${elf}:+1/+1`, elf, elf, cub, cub, cub] } });
    expect(counters(u, elf)).toEqual({ "+1/+1": 3 });
    // More counters of a kind than the creature has: refused.
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: wurm,
        picks: { counterFrom: [`${elf}:charge`, `${elf}:charge`, `${elf}:charge`, cub, cub, cub] },
      }),
    ).toThrow(RulesError);
  });

  it("Flamewake Phoenix: returns from the graveyard at the beginning of combat (ferocious, {R})", () => {
    let s = scenario({ step: "main1", p1: { battlefield: ["Shivan Dragon", "Mountain"], graveyard: ["Flamewake Phoenix"] } });
    s = passAccepting(
      s,
      (x) => idsOf(x, "p1", "battlefield", "Flamewake Phoenix").length === 1 || x.turn.step === "declareAttackers",
    );
    expect(idsOf(s, "p1", "battlefield", "Flamewake Phoenix")).toHaveLength(1);
  });
});

describe("Lot F: doubling, copies, control", () => {
  it("Doubling Season: tokens and counters doubled", () => {
    let s = scenario({ p1: { battlefield: ["Doubling Season", ...lands("Mountain", 3)], hand: ["Dragon Fodder"] } });
    s = cast(s, "p1", "Dragon Fodder");
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(4);
  });

  it("Thousand-Year Storm: one copy per instant or sorcery already cast this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Thousand-Year Storm", ...lands("Mountain", 3)], hand: ["Burst Lightning", "Burst Lightning"] },
    });
    const bolts = idsOf(s, "p1", "hand", "Burst Lightning");
    s = act(s, "p1", { type: "cast", card: bolts[0] as string, targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(18);
    s = act(s, "p1", { type: "cast", card: bolts[1] as string, targets: { t: ["p2"] } });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(14); // the second bolt and its copy
  });

  it("Involuntary Employment: control until end of turn, untapped, haste", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Involuntary Employment"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = cast(s, "p1", "Involuntary Employment", { targets: { t: [dragon] } });
    s = passBoth(s);
    expect(s.objects[dragon]?.controller).toBe("p1");
    expect(s.objects[dragon]?.tapped).toBe(false);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(s.objects[dragon]?.controller).toBe("p2");
  });

  it("Abyssal Harvester: Nightmare copy of a creature that died this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Abyssal Harvester"] },
      p2: { battlefield: ["Shivan Dragon"], graveyard: ["Pelakka Wurm"] },
    });
    // The Wurm has been in the graveyard since a previous turn.
    (s.objects[idOf(s, "p2", "graveyard", "Pelakka Wurm")] as { controlledSince: number }).controlledSince = 1;
    const harvester = idOf(s, "p1", "battlefield", "Abyssal Harvester");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === harvester);
    expect(opt).toBeUndefined(); // the Wurm did not die this turn: no target, ability not offered
    destroy(s, idOf(s, "p2", "battlefield", "Shivan Dragon"));
    const dead = idOf(s, "p2", "graveyard", "Shivan Dragon");
    s = act(s, "p1", { type: "activate", source: harvester, ability: 0, targets: { t: [dead] } });
    s = passBoth(s);
    const copy = idOf(s, "p1", "battlefield", "Shivan Dragon");
    expect(s.objects[copy]?.isToken).toBe(true);
    expect(chars(s, copy).subtypes).toContain("Nightmare");
    // "Then exile all other Nightmare tokens": after the new copy is created, which sees the old one
    // leave ("whenever another creature you control leaves the battlefield").
    const watcher = customCard({
      name: "Veilleur",
      power: 1,
      toughness: 1,
      abilities: [
        triggered(when.leaves({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)], { label: "1 PV" }),
      ],
    });
    let t = scenario({ p1: { battlefield: ["Abyssal Harvester"] }, p2: { battlefield: ["Shivan Dragon", watcher] } });
    const h = idOf(t, "p1", "battlefield", "Abyssal Harvester");
    destroy(t, idOf(t, "p2", "battlefield", "Shivan Dragon"));
    const settled = (x: S) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority";
    t = act(t, "p1", { type: "activate", source: h, ability: 0, targets: { t: [idOf(t, "p2", "graveyard", "Shivan Dragon")] } });
    t = structuredClone(passAccepting(t, settled));
    t.objects[h]!.tapped = false;
    destroy(t, idOf(t, "p2", "battlefield", "Veilleur"));
    t = act(t, "p1", { type: "activate", source: h, ability: 0, targets: { t: [idOf(t, "p2", "graveyard", "Veilleur")] } });
    t = passAccepting(t, settled);
    expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(idsOf(t, "p1", "battlefield", "Veilleur")).toHaveLength(1);
    expect(t.players.p1?.life).toBe(21);
  });
});

describe("Lot F: choices on entering and restricted mana", () => {
  it("Banner of Kinship: chosen type, counters and bonus", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 5), "Llanowar Elves", "Llanowar Elves", "Prideful Parent"],
        hand: ["Banner of Kinship"],
      },
    });
    s = cast(s, "p1", "Banner of Kinship");
    s = passBoth(s);
    expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("chooseOnEnter");
    s = choose(s, ["Elf"]);
    const banner = idOf(s, "p1", "battlefield", "Banner of Kinship");
    expect(counters(s, banner).fellowship).toBe(2);
    const elf = idsOf(s, "p1", "battlefield", "Llanowar Elves")[0] as string;
    expect(chars(s, elf).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Prideful Parent")).power).toBe(2);
  });

  it("Heraldic Banner: chosen color, +1/+0 and mana of that color", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Llanowar Elves"], hand: ["Heraldic Banner"] } });
    s = cast(s, "p1", "Heraldic Banner");
    s = passBoth(s);
    s = choose(s, ["G"]);
    const banner = idOf(s, "p1", "battlefield", "Heraldic Banner");
    expect(manaAbilitiesOf(s, banner)[0]?.produce).toEqual(["G"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(2);
  });

  it("Secluded Courtyard: colored mana only for creatures of the chosen type", () => {
    let s = scenario({ p1: { hand: ["Secluded Courtyard", "Llanowar Elves", "Giant Growth"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Secluded Courtyard") });
    const court = idOf(s, "p1", "battlefield", "Secluded Courtyard");
    (s.objects[court] as { chosen?: { creatureType: string } }).chosen = { creatureType: "Elf" };
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBeDefined();
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Giant Growth"))).toBeUndefined();
  });

  it("Giada: other Angels enter with counters; {W} reserved for Angel spells", () => {
    let s = scenario({
      p1: { battlefield: ["Giada, Font of Hope", "Youthful Valkyrie", ...lands("Plains", 2)], hand: ["Dazzling Angel"] },
    });
    s = cast(s, "p1", "Dazzling Angel");
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Dazzling Angel").length === 1);
    expect(counters(s, idOf(s, "p1", "battlefield", "Dazzling Angel"))["+1/+1"]).toBe(2);
    const giada = idOf(s, "p1", "battlefield", "Giada, Font of Hope");
    expect(canPay(s, "p1", { generic: 0, colored: { W: 1 }, x: 0 }, new Set(s.battlefield.filter((id) => id !== giada)))).toBe(
      false,
    );
  });

  it("Soulstone Sanctuary: becomes a 3/3 creature of all types", () => {
    let s = scenario({ p1: { battlefield: ["Soulstone Sanctuary", ...lands("Forest", 4), "Imperious Perfect"] } });
    const land = idOf(s, "p1", "battlefield", "Soulstone Sanctuary");
    s = act(s, "p1", { type: "activate", source: land, ability: 1 });
    s = passBoth(s);
    const c = chars(s, land);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    // "Other Elves you control get +1/+1": all creature types, hence Elf.
    expect([c.power, c.toughness]).toEqual([4, 4]);
  });
});

describe("Lot F: miscellaneous", () => {
  it("Curator of Destinies: the opponent chooses the pile that goes to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Curator of Destinies"],
        library: ["Opt", "Forest", "Shivan Dragon", "Island", "Stab"],
      },
    });
    s = cast(s, "p1", "Curator of Destinies");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "piles");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    const top = req?.type === "pick" ? req.options : [];
    s = choose(s, top.slice(0, 2)); // face down: 2 cards
    expect(s.pending?.player).toBe("p2");
    s = choose(s, ["up"]); // the opponent gives the face-up pile (3 cards)
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Time Stop: the turn ends, the stack is exiled", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 7), hand: ["Pelakka Wurm"] },
      p2: { battlefield: lands("Island", 6), hand: ["Time Stop"] },
    });
    s = cast(s, "p1", "Pelakka Wurm");
    s = act(s, "p1", { type: "pass" });
    s = cast(s, "p2", "Time Stop");
    s = passBoth(s);
    expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Pelakka Wurm", "Time Stop"]);
    s = passAccepting(s, (x) => x.turn.active === "p2");
    expect(s.turn.number).toBe(4);
  });

  it("Nine-Lives Familiar: returns at the end step with one fewer counter", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Nine-Lives Familiar"] } });
    s = cast(s, "p1", "Nine-Lives Familiar");
    s = passBoth(s);
    let cat = idOf(s, "p1", "battlefield", "Nine-Lives Familiar");
    expect(counters(s, cat).revival).toBe(8);
    destroy(s, cat);
    s = advance(s, (x) => idsOf(x, "p1", "battlefield", "Nine-Lives Familiar").length === 1 || x.turn.active === "p2");
    cat = idOf(s, "p1", "battlefield", "Nine-Lives Familiar");
    expect(counters(s, cat).revival).toBe(7);
  });

  it("Kellan: Scout -> Detective -> Rogue 3/2 double strike", () => {
    let s = scenario({ p1: { battlefield: ["Kellan, Planar Trailblazer", ...lands("Mountain", 8)] } });
    const k = idOf(s, "p1", "battlefield", "Kellan, Planar Trailblazer");
    s = act(s, "p1", { type: "activate", source: k, ability: 1 }); // Detective first: no effect (not a Detective)
    s = passBoth(s);
    expect(chars(s, k).power).toBe(2);
    s = act(s, "p1", { type: "activate", source: k, ability: 0 });
    s = passBoth(s);
    expect(chars(s, k).subtypes).toContain("Detective");
    s = act(s, "p1", { type: "activate", source: k, ability: 1 });
    s = passBoth(s);
    expect([chars(s, k).power, chars(s, k).toughness]).toEqual([3, 2]);
    expect(chars(s, k).keywords).toContain("doubleStrike");
  });

  it("Loot: two lands per turn", () => {
    let s = scenario({ p1: { battlefield: ["Loot, Exuberant Explorer"], hand: ["Forest", "Island", "Swamp"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
    expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(false);
  });

  it("Elenda: hexproof against instants only", () => {
    const s = scenario({
      active: "p2",
      p1: { battlefield: ["Elenda, Saint of Dusk"] },
      p2: { battlefield: lands("Swamp", 2), hand: ["Stab", "Seeker's Folly"] },
    });
    const elenda = idOf(s, "p1", "battlefield", "Elenda, Saint of Dusk");
    expect(castOption(s, "p2", idOf(s, "p2", "hand", "Stab"))).toBeUndefined();
    expect(chars(s, elenda).keywords).not.toContain("hexproof");
  });

  it("Consuming Aberration: P/T = cards in opponents' graveyards; mill until a land", () => {
    let s = scenario({
      p1: { battlefield: ["Consuming Aberration", "Island"], hand: ["Opt"] },
      p2: { graveyard: ["Opt", "Stab", "Pelakka Wurm"], library: ["Opt", "Stab", "Forest", "Island"] },
    });
    const ab = idOf(s, "p1", "battlefield", "Consuming Aberration");
    expect(chars(s, ab).power).toBe(3);
    s = cast(s, "p1", "Opt");
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.graveyard).toHaveLength(6);
    expect(chars(s, ab).power).toBe(6);
  });

  it("Progenitus: protection from everything, shuffled into the library instead of the graveyard", () => {
    const s = scenario({
      p1: { battlefield: ["Progenitus"] },
      p2: { battlefield: ["Mountain", "Shivan Dragon"], hand: ["Burst Lightning"] },
    });
    const prog = idOf(s, "p1", "battlefield", "Progenitus");
    const opt = legalActions(s, "p2");
    void opt;
    dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Shivan Dragon")), prog, 5, false);
    expect(s.objects[prog]?.damage).toBe(0);
    const lib = s.players.p1?.library.length ?? 0;
    const { putIntoGraveyard } = { putIntoGraveyard: (x: S, id: string) => destroy(x, id) };
    putIntoGraveyard(s, prog);
    expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Progenitus");
    expect(s.players.p1?.library.length).toBe(lib + 1);
  });
});

describe("delayed abilities: frozen references", () => {
  it("Electroduplicate: the copy token is sacrificed at the end step", () => {
    let s = scenario({ p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 3)], hand: ["Electroduplicate"] } });
    s = cast(s, "p1", "Electroduplicate", { targets: { t: [idOf(s, "p1", "battlefield", "Shivan Dragon")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(2);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Kykar: the exiled creature returns at the end step", () => {
    let s = scenario({ p1: { battlefield: ["Kykar, Zephyr Awakener", "Llanowar Elves", "Island"], hand: ["Opt"] } });
    s = cast(s, "p1", "Opt");
    s = advance(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "triggerMode");
    s = choose(s, ["0"]);
    s = advance(s, (x) => x.stack.length === 0 && x.exile.length === 1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    s = advance(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });
});

describe("piles with several opponents (PLAN-H H4)", () => {
  it("Curator of Destinies: after the split, you choose the opponent who chooses the pile", () => {
    let s = scenario({
      players: 3,
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Curator of Destinies"],
        library: ["Opt", "Forest", "Shivan Dragon", "Island", "Stab"],
      },
    });
    s = cast(s, "p1", "Curator of Destinies");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "piles");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    const top = req?.type === "pick" ? req.options : [];
    s = choose(s, top.slice(0, 2));
    const who = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(s.pending?.player).toBe("p1");
    expect(who?.type === "pick" ? who.options : []).toEqual(["p2", "p3"]);
    s = choose(s, ["p3"]);
    expect(s.pending?.player).toBe("p3");
    s = choose(s, ["up"]);
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });
});
