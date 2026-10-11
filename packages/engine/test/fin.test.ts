/**
 * Final Fantasy, lot A: job select, tiered, "if at least four mana were spent", Syncopate, Towns with Adventure.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, destroy } from "../src/actions";
import { activated, fx, ref, spell, target, triggered, when } from "../src/dsl";
import { addEffect, moveWithSpec } from "../src/effects";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { changeCounters, chars, moveObject } from "../src/state";
import { plainText } from "../src/text";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  cast,
  castable,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  pickNamed,
  scenario,
  settle as settleAll,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castModes = (s: S, card: string) => {
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
  return opt?.type === "cast" ? opt.modes : [];
};

describe("Final Fantasy", () => {
  it("job select: the Equipment creates a 1/1 Hero and attaches to it", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Black Mage's Rod"] } });
    const rod = idOf(s, "p1", "hand", "Black Mage's Rod");
    s = act(s, "p1", { type: "cast", card: rod });
    s = settle(s);
    const [hero] = idsOf(s, "p1", "battlefield", "Hero");
    expect(hero).toBeDefined();
    expect(s.objects[idOf(s, "p1", "battlefield", "Black Mage's Rod")]?.attachedTo).toBe(hero);
    const c = chars(s, hero as string);
    expect(c.power).toBe(2);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Hero", "Wizard"]));
  });

  it("tiered: the additional costs of the tiers; a tier that is too expensive is not offered", () => {
    const s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Thunder Magic"] }, p2: { battlefield: ["Bear Cub"] } });
    const magic = idOf(s, "p1", "hand", "Thunder Magic");
    const labels = castModes(s, magic).map((m) => m.label);
    expect(labels).toHaveLength(1);
    const t = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Thunder Magic"] }, p2: { battlefield: ["Bear Cub"] } });
    expect(castModes(t, idOf(t, "p1", "hand", "Thunder Magic"))).toHaveLength(2);
  });

  it("'if at least four mana were spent': Sahagin triggers for a spell with 4 mana, not 1", () => {
    let s = scenario({
      p1: { battlefield: ["Sahagin", ...lands("Mountain", 5)], hand: ["Thunder Magic", "Thunder Magic"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const sahagin = idOf(s, "p1", "battlefield", "Sahagin");
    const wurm = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const [a, b] = idsOf(s, "p1", "hand", "Thunder Magic") as [string, string];
    // Tier {0}: 1 mana spent, no trigger.
    s = act(s, "p1", { type: "cast", card: a, mode: castModes(s, a)[0]?.index, targets: { t: [wurm] } });
    s = settle(s);
    expect(s.objects[sahagin]?.counters["+1/+1"] ?? 0).toBe(0);
    // Tier {3}: 4 mana spent.
    const mode = castModes(s, b).find((m) => m.label?.includes("4 damage"));
    s = act(s, "p1", { type: "cast", card: b, mode: mode?.index, targets: { t: [wurm] } });
    s = settle(s);
    expect(s.objects[sahagin]?.counters["+1/+1"]).toBe(1);
  });

  it("Syncopate: countered for lack of paying {X}, the spell is exiled", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      p2: { battlefield: lands("Island", 3), hand: ["Syncopate"] },
    });
    const shock = idOf(s, "p1", "hand", "Burst Lightning");
    s = act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } });
    s = act(s, "p1", { type: "pass" });
    const sync = idOf(s, "p2", "hand", "Syncopate");
    s = act(s, "p2", { type: "cast", card: sync, x: 2, targets: { t: [s.stack[0]?.id as string] } });
    s = settle(s);
    expect(s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Burst Lightning");
    expect(s.objects[shock]).toBeUndefined();
    expect(s.players.p2?.life).toBe(20);
  });

  it("Summon: Saga creature, chapter I on arrival, sacrificed after the last chapter", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Summon: Shiva"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Summon: Shiva") });
    s = settle(s);
    const shiva = idOf(s, "p1", "battlefield", "Summon: Shiva");
    expect(s.objects[shiva]?.counters.lore).toBe(1);
    expect(chars(s, shiva).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun).toBe(1);
    s = advanceUntil(s, (x) => !x.battlefield.includes(shiva));
    expect(idsOf(s, "p1", "graveyard", "Summon: Shiva")).toHaveLength(1);
  });

  it("Excalibur II: a charge counter per life gain, +1/+1 per counter", () => {
    let s = scenario({
      p1: { battlefield: ["Excalibur II", "Bear Cub", "Dazzling Angel", ...lands("Plains", 4)], hand: ["Healer's Hawk"] },
    });
    const sword = idOf(s, "p1", "battlefield", "Excalibur II");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const equip = (s.defs[s.objects[sword]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Equip"),
    );
    s = act(s, "p1", { type: "activate", source: sword, ability: equip, targets: { t: [bear] } });
    s = passBoth(s);
    expect(chars(s, bear).power).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Healer's Hawk") });
    s = settle(s);
    // Dazzling Angel: +1 life on the Hawk's arrival, so a charge counter.
    expect(s.objects[sword]?.counters.charge).toBe(1);
    expect(chars(s, bear).power).toBe(3);
  });

  it("transformation into a Saga: lore counter, chapters, then back to the front face (Jill // Shiva)", () => {
    let s = scenario({
      p1: { battlefield: ["Jill, Shiva's Dominant // Shiva, Warden of Ice", ...lands("Island", 5)] },
      p2: { battlefield: ["Bear Cub", "Forest"] },
    });
    const jill = idOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    const index = (s.defs[s.objects[jill]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Exile it"),
    );
    s = act(s, "p1", { type: "activate", source: jill, ability: index });
    s = settle(s);
    const shiva = idOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    expect(chars(s, shiva).name).toBe("Shiva, Warden of Ice");
    expect(s.objects[shiva]?.counters.lore).toBe(1);
    // Chapter III: the opposing lands are tapped, then Shiva returns to its front face (without being sacrificed).
    s = advanceUntil(s, (x) => !x.battlefield.includes(shiva) && x.stack.length === 0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Forest")]?.tapped).toBe(true);
    const back = idsOf(s, "p1", "battlefield", "Jill, Shiva's Dominant // Shiva, Warden of Ice");
    expect(back).toHaveLength(1);
    expect(chars(s, back[0] as string).name).not.toBe("Shiva, Warden of Ice");
    expect(s.objects[back[0] as string]?.counters.lore).toBeUndefined();
  });

  it("meld: Vanille and Fang become Ragnarok by paying {3}{B}{G}", () => {
    let s = scenario({
      turn: 2,
      p1: {
        battlefield: ["Vanille, Cheerful l'Cie", "Fang, Fearless l'Cie", "Swamp", "Forest", ...lands("Plains", 3)],
      },
    });
    s = advanceUntil(s, (x) =>
      x.battlefield.some((id) => x.defs[x.objects[id]?.defId ?? ""]?.name === "Ragnarok, Divine Deliverance"),
    );
    expect(idsOf(s, "p1", "battlefield", "Ragnarok, Divine Deliverance")).toHaveLength(1);
  });

  it("Crystals: life gains doubled (Wind), opposing mill +4 (Water)", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Wind Crystal", "The Water Crystal", "Dazzling Angel", ...lands("Plains", 3)],
        hand: ["Healer's Hawk"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Healer's Hawk") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    let t = scenario({
      p1: { battlefield: ["The Water Crystal", ...lands("Island", 6)], hand: ["Jidoor, Aristocratic Capital // Overture"] },
    });
    const lib = t.players.p2?.library.length ?? 0;
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Jidoor, Aristocratic Capital // Overture"),
      face: 1,
      targets: { t: ["p2"] },
    });
    t = settle(t);
    expect(t.players.p2?.graveyard.length).toBe(Math.floor(lib / 2) + 4);
  });

  it("Stuck in Summoner's Sanctum: activated abilities can no longer be activated", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Stuck in Summoner's Sanctum"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stuck in Summoner's Sanctum"), targets: { enchant: [elves] } });
    s = settle(s);
    expect(s.objects[elves]?.tapped).toBe(true);
    s.objects[elves]!.tapped = false;
    expect(legalActions(s, "p2").some((a) => a.type === "tapForMana" && a.source === elves)).toBe(false);
  });

  it("kicker without mana: Vayne's Treachery sacrifices a creature (not its target) and gives -6/-6", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], hand: ["Vayne's Treachery"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const card = idOf(s, "p1", "hand", "Vayne's Treachery");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && opt.kickerAffordable).toBe(true);
    s = act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [dragon] } });
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Zodiark: each player sacrifices half of their non-God creatures, and Zodiark grows", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Swamp", 5)], hand: ["Zodiark, Umbral God"] },
      p2: { battlefield: ["Bear Cub", "Bear Cub", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Zodiark, Umbral God") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(s.objects[idOf(s, "p1", "battlefield", "Zodiark, Umbral God")]?.counters["+1/+1"]).toBe(2);
  });

  it("The Wandering Minstrel and Quina: untapped lands, Frog in addition to the tokens", () => {
    let s = scenario({ p1: { battlefield: ["The Wandering Minstrel", "Quina, Qu Gourmet"], hand: ["Baron, Airship Kingdom"] } });
    const town = idOf(s, "p1", "hand", "Baron, Airship Kingdom");
    s = act(s, "p1", { type: "playLand", card: town });
    expect(s.objects[idOf(s, "p1", "battlefield", "Baron, Airship Kingdom")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: ["Quina, Qu Gourmet", ...lands("Island", 3)], hand: ["Dragoon's Wyvern"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Dragoon's Wyvern") });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Hero")).toHaveLength(1);
    // A single Frog: the added token doesn't trigger the replacement.
    expect(idsOf(t, "p1", "battlefield", "Frog")).toHaveLength(1);
  });

  it("Quina: a token copy also comes with a Frog (PLAN-M M7)", () => {
    let s = scenario({
      p1: { battlefield: ["Quina, Qu Gourmet", "Bear Cub", ...lands("Mountain", 3)], hand: ["Electroduplicate"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Electroduplicate"), targets: { t: [bear] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Frog")).toHaveLength(1);
  });

  it("Torgal: the first Human creature spell enters with a counter per Dog or Wolf", () => {
    let t = scenario({ p1: { battlefield: ["Torgal, A Fine Hound", ...lands("Plains", 4)], hand: ["Adelbert Steiner"] } });
    const card = idOf(t, "p1", "hand", "Adelbert Steiner");
    t = act(t, "p1", { type: "cast", card });
    t = settle(t);
    // Adelbert Steiner is a Human: a counter per Dog or Wolf (Torgal).
    expect(t.objects[idOf(t, "p1", "battlefield", "Adelbert Steiner")]?.counters["+1/+1"]).toBe(1);
  });

  it("Esper Origins: cast with flashback, it enters transformed with a finality counter", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Esper Origins // Summon: Esper Maduin"] } });
    const card = s.players.p1?.graveyard[0] as string;
    s = act(s, "p1", { type: "cast", card });
    s = settle(s);
    const [perm] = idsOf(s, "p1", "battlefield", "Esper Origins // Summon: Esper Maduin");
    expect(perm).toBeDefined();
    expect(chars(s, perm as string).name).toBe("Summon: Esper Maduin");
    expect(s.objects[perm as string]?.counters.finality).toBe(1);
    expect(s.objects[perm as string]?.counters.lore).toBe(1);
  });

  it("Trance Kuja: damage from a Wizard you control is doubled", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kuja, Genome Sorcerer // Trance Kuja, Fate Defied", "Black Waltz No. 3", ...lands("Mountain", 1)],
        hand: ["Burst Lightning"],
      },
    });
    const kuja = idOf(s, "p1", "battlefield", "Kuja, Genome Sorcerer // Trance Kuja, Fate Defied");
    s.objects[kuja]!.faceDefId = s.defs[s.objects[kuja]!.defId]!.faceDefs![1]!.id;
    bump(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burst Lightning"), targets: { t: ["p2"] } });
    s = settle(s);
    // Black Waltz No. 3 (Wizard): 2 damage doubled = 4; Burst Lightning (spell): 2.
    expect(s.players.p2?.life).toBe(14);
  });

  it("The Darkness Crystal: the opposing creature is exiled (linked) instead of dying, +2 life, then comes back to you", () => {
    let s = scenario({
      p1: { battlefield: ["The Darkness Crystal", ...lands("Mountain", 1), ...lands("Swamp", 6)], hand: ["Burst Lightning"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Burst Lightning"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    const exiled = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub") as string;
    expect(exiled).toBeDefined();
    const crystal = idOf(s, "p1", "battlefield", "The Darkness Crystal");
    const index = (s.defs[s.objects[crystal]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated");
    s = act(s, "p1", { type: "activate", source: crystal, ability: index, targets: { t: [exiled] } });
    s = passBoth(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });

  it("Ancient Adamantoise absorbs the damage dealt to its controller and to its other permanents", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Burst Lightning", "Burst Lightning"] },
      p2: { battlefield: ["Ancient Adamantoise", "Bear Cub"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Burst Lightning") as [string, string];
    s = act(s, "p1", { type: "cast", card: a, targets: { t: ["p2"] } });
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: b, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(20);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Ancient Adamantoise")]?.damage).toBe(4);
  });

  it("Absolute Virtue: its controller can't be targeted or damaged by its opponents", () => {
    const s = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Burst Lightning"] },
      p2: { battlefield: ["Absolute Virtue"] },
    });
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).not.toContain("p2");
  });

  it("Zidane: a Treasure when an opponent gains control of one of your permanents", () => {
    let s = scenario({
      p1: { battlefield: ["Stiltzkin, Moogle Merchant", "Zidane, Tantalus Thief", "Bear Cub", ...lands("Plains", 2)] },
    });
    const stiltzkin = idOf(s, "p1", "battlefield", "Stiltzkin, Moogle Merchant");
    const index = (s.defs[s.objects[stiltzkin]?.defId ?? ""]?.abilities ?? []).findIndex((a) => a.kind === "activated");
    s = act(s, "p1", {
      type: "activate",
      source: stiltzkin,
      ability: index,
      targets: { p: ["p2"], t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("PuPu UFO: only the base power becomes the number of Towns", () => {
    let s = scenario({ p1: { battlefield: ["PuPu UFO", "Adventurer's Inn", "Capital City", ...lands("Island", 3)] } });
    const ufo = idOf(s, "p1", "battlefield", "PuPu UFO");
    const index = (s.defs[s.objects[ufo]?.defId ?? ""]?.abilities ?? []).findIndex(
      (a) => a.kind === "activated" && a.label?.startsWith("Base power"),
    );
    s = act(s, "p1", { type: "activate", source: ufo, ability: index });
    s = passBoth(s);
    expect(chars(s, ufo).power).toBe(2);
    expect(chars(s, ufo).toughness).toBe(4);
  });

  it("Adventure Town: the Adventure is cast, then the land is played from exile", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Lindblum, Industrial Regency // Mage Siege"] } });
    const card = idOf(s, "p1", "hand", "Lindblum, Industrial Regency // Mage Siege");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && opt.face).toBe(1);
    s = act(s, "p1", { type: "cast", card, face: 1 });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Wizard")).toHaveLength(1);
    const exiled = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
    expect(exiled).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === exiled)).toBe(true);
    s = act(s, "p1", { type: "playLand", card: exiled });
    expect(idsOf(s, "p1", "battlefield", "Lindblum, Industrial Regency // Mage Siege")).toHaveLength(1);
  });
});

describe("Final Fantasy, meta cards (PLAN-C, lot C13)", () => {
  it("Starting Town: untapped during your first three turns, tapped afterwards; {T}, 1 life: one mana of your choice", () => {
    const play = (turn: number) => {
      const s = scenario({ turn, p1: { hand: ["Starting Town"] } });
      const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Starting Town") });
      return { t, town: idOf(t, "p1", "battlefield", "Starting Town") };
    };
    // Turn 5: p1's third turn (1, 3, 5).
    const early = play(5);
    expect(early.t.objects[early.town]?.tapped).toBe(false);
    const late = play(7);
    expect(late.t.objects[late.town]?.tapped).toBe(true);
    let s = early.t;
    const colorless = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === early.town);
    expect(colorless?.type === "tapForMana" && colorless.colors).toEqual(["C"]);
    const any = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === early.town);
    s = act(s, "p1", { type: "activate", source: early.town, ability: any?.type === "activate" ? any.ability : -1 });
    s = passAccepting(s, (x) => x.pending?.kind !== "choice");
    expect(s.players.p1?.life).toBe(19);
    const pool: Record<string, number> = { ...s.players.p1?.manaPool };
    expect(Object.values(pool).reduce((n, v) => n + v, 0)).toBe(1);
    expect(pool.C ?? 0).toBe(0);
  });

  it("Sazh's Chocobo: a +1/+1 counter for each land that enters under your control", () => {
    let s = scenario({ p1: { battlefield: ["Sazh's Chocobo"], hand: ["Forest"] } });
    const bird = idOf(s, "p1", "battlefield", "Sazh's Chocobo");
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    expect(s.objects[bird]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, bird).power).toBe(1);
  });

  it("Buster Sword: +3/+2; combat damage to a player: draw, then cast a spell with MV ≤ damage for free", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Buster Sword", ...lands("Plains", 2)], hand: ["Serra Angel", "Shivan Dragon"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const sword = idOf(s, "p1", "battlefield", "Buster Sword");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
    s = act(s, "p1", {
      type: "activate",
      source: sword,
      ability: equip?.type === "activate" ? equip.ability : -1,
      targets: { t: [bear] },
    });
    s = settle(s);
    expect(chars(s, bear).power).toBe(5);
    expect(chars(s, bear).toughness).toBe(4);
    s = attack(s, [bear]);
    s = untilCastNow(s);
    expect(s.players.p2?.life).toBe(15);
    expect(s.players.p1?.hand).toHaveLength(3);
    // 5 damage: Serra Angel (MV 5) is offered, not Shivan Dragon (MV 6).
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    expect(castNowOf(s)?.cards).toContain(angel);
    expect(castNowOf(s)?.cards).not.toContain(idOf(s, "p1", "hand", "Shivan Dragon"));
    s = settle(act(s, "p1", { type: "cast", card: angel }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // Cast without paying: the two Plains were used for the equip cost only.
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Cloud, Midgar Mercenary: searches for an Equipment; equipped, the triggers of its Equipment happen twice", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Cloud, Midgar Mercenary"], library: ["Forest", "Buster Sword", "Forest"] },
    });
    s = settle(cast(s, "p1", "Cloud, Midgar Mercenary"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Buster Sword"]);
    let t = scenario({ p1: { battlefield: ["Cloud, Midgar Mercenary", "Buster Sword"] } });
    const cloud = idOf(t, "p1", "battlefield", "Cloud, Midgar Mercenary");
    t.objects[idOf(t, "p1", "battlefield", "Buster Sword")]!.attachedTo = cloud;
    bump(t);
    t = attack(t, [cloud]);
    t = settleNoBlocks(t);
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(15);
    // Two Buster Sword triggers: two cards drawn.
    expect(t.players.p1?.hand).toHaveLength(2);
  });

  it("The Masamune: a creature dying triggers the abilities of the equipped creature and of your emblems one more time", () => {
    // Two identical creatures, "when this creature dies, you gain 3 life"; only the first is equipped.
    const mourner = customCard({
      name: "Pleureur",
      power: 2,
      toughness: 2,
      abilities: [triggered(when.dies({ self: true }), [fx.gainLife(3)], { label: "3 PV" })],
    });
    let s = scenario({ p1: { battlefield: ["The Masamune", mourner, mourner] } });
    const [equipped, bare] = idsOf(s, "p1", "battlefield", "Pleureur") as [string, string];
    s.objects[idOf(s, "p1", "battlefield", "The Masamune")]!.attachedTo = equipped;
    bump(s);
    destroy(s, equipped);
    s = settleAll(s);
    expect(s.players.p1?.life).toBe(26);
    s = structuredClone(s);
    destroy(s, bare);
    s = settleAll(s);
    expect(s.players.p1?.life).toBe(29);
    // Emblem: "whenever a creature dies, you gain 1 life", twice while The Masamune is in play.
    const giver = customCard({
      name: "Emblem Giver",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: spell(
        [],
        [
          fx.emblem("Deuil", "Whenever a creature dies, you gain 1 life.", [
            triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(1)], { label: "1 PV" }),
          ]),
        ],
      ),
    });
    let t = scenario({ p1: { battlefield: ["The Masamune", "Bear Cub"], hand: [giver] } });
    t = structuredClone(settleAll(cast(t, "p1", "Emblem Giver")));
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settleAll(t);
    expect(t.players.p1?.life).toBe(22);
  });

  it("Zack Fair: enters with a counter; sacrificed, gives indestructible, its counters and one of its Equipment", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Buster Sword", "Buster Sword", ...lands("Plains", 2)], hand: ["Zack Fair"] },
    });
    s = settle(cast(s, "p1", "Zack Fair"));
    const zack = idOf(s, "p1", "battlefield", "Zack Fair");
    expect(s.objects[zack]?.counters["+1/+1"]).toBe(1);
    const [other, sword] = idsOf(s, "p1", "battlefield", "Buster Sword") as [string, string];
    s.objects[sword]!.attachedTo = zack;
    s.objects[other]!.attachedTo = zack;
    bump(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === zack);
    s = act(s, "p1", {
      type: "activate",
      source: zack,
      ability: ab?.type === "activate" ? ab.ability : -1,
      targets: { t: [bear] },
    });
    expect(idsOf(s, "p1", "graveyard", "Zack Fair")).toHaveLength(1);
    // "An Equipment that was attached to Zack": you choose which; the other stays unattached.
    s = settleAll(s, (req) => (req.type === "pick" && req.options.includes(sword) ? [sword] : undefined));
    expect(chars(s, bear).keywords).toContain("indestructible");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[sword]?.attachedTo).toBe(bear);
    expect(s.objects[other]?.attachedTo).toBeUndefined();
    expect(chars(s, bear).power).toBe(6);
  });

  it("Cecil, Dark Knight: deathtouch; its damage makes you lose that much life, then it transforms at 10 life or less", () => {
    const CECIL = "Cecil, Dark Knight // Cecil, Redeemed Paladin";
    let s = scenario({ p1: { battlefield: [CECIL] } });
    let cecil = idOf(s, "p1", "battlefield", CECIL);
    expect(chars(s, cecil).keywords).toContain("deathtouch");
    s = throughCombat(attack(s, [cecil]));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(18);
    expect(chars(s, cecil).name).not.toBe("Cecil, Redeemed Paladin");
    expect(s.objects[cecil]?.tapped).toBe(true);
    let t = scenario({ p1: { life: 12, battlefield: [CECIL] } });
    cecil = idOf(t, "p1", "battlefield", CECIL);
    t = throughCombat(attack(t, [cecil]));
    expect(t.players.p1?.life).toBe(10);
    expect(chars(t, cecil).name).toBe("Cecil, Redeemed Paladin");
    expect(t.objects[cecil]?.tapped).toBe(false);
    expect(chars(t, cecil).keywords).toContain("lifelink");
  });

  it("Cecil, Redeemed Paladin: when it attacks, the other attackers become indestructible", () => {
    const CECIL = "Cecil, Dark Knight // Cecil, Redeemed Paladin";
    let s = scenario({ p1: { battlefield: [CECIL, "Bear Cub", "Llanowar Elves"] } });
    const cecil = idOf(s, "p1", "battlefield", CECIL);
    s.objects[cecil]!.faceDefId = s.defs[s.objects[cecil]!.defId]!.faceDefs![1]!.id;
    bump(s);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(attack(s, [cecil, bear]));
    expect(chars(s, bear).keywords).toContain("indestructible");
    expect(chars(s, cecil).keywords).not.toContain("indestructible");
    expect(chars(s, elves).keywords).not.toContain("indestructible");
  });

  it("Fire Magic: 1, 2 or 3 damage to each creature depending on the tier", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 6), "Llanowar Elves", "Bear Cub"], hand: ["Fire Magic"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
    const fire = (mode: number) => {
      const s = setup();
      const card = idOf(s, "p1", "hand", "Fire Magic");
      return settle(act(s, "p1", { type: "cast", card, mode: castModes(s, card)[mode]?.index }));
    };
    let s = fire(0);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(1);
    s = fire(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    s = fire(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(6);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(3);
  });

  it("The Fire Crystal: red spells cost {1} less, haste, temporary copy of one of your creatures", () => {
    let s = scenario({
      p1: {
        battlefield: ["The Fire Crystal", { name: "Bear Cub", sick: true }, ...lands("Mountain", 5)],
        hand: ["Shivan Dragon"],
      },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toContain("haste");
    // Shivan Dragon ({4}{R}{R}) for five Mountains.
    s = settle(cast(s, "p1", "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shivan Dragon")).keywords).toContain("haste");
    let t = scenario({ p1: { battlefield: ["The Fire Crystal", "Bear Cub", ...lands("Mountain", 6)] } });
    const crystal = idOf(t, "p1", "battlefield", "The Fire Crystal");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === crystal);
    t = act(t, "p1", {
      type: "activate",
      source: crystal,
      ability: ab?.type === "activate" ? ab.ability : -1,
      targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] },
    });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Mana en n'importe quelle combinaison (lot K2)", () => {
  it("Vivi Ornitier: X mana in any combination of {U} and {R}; power 3, it pays {1}{U}{R} by itself", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Vivi Ornitier", counters: { "+1/+1": 3 } }], hand: ["Broadside Barrage"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const barrage = idOf(s, "p1", "hand", "Broadside Barrage");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === barrage)).toBe(true);
    s = act(s, "p1", { type: "cast", card: barrage, targets: { t: [bear] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("tapped by hand (PLAN-L L3): one type per mana, as many as it produces, among its own", () => {
    // Power 2 (0/3 and two counters): two mana.
    const s = scenario({ p1: { battlefield: [{ name: "Vivi Ornitier", counters: { "+1/+1": 2 } }] } });
    const vivi = idOf(s, "p1", "battlefield", "Vivi Ornitier");
    const offer = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === vivi);
    expect(offer).toMatchObject({ amount: 2, combination: true, colors: ["U", "R"] });
    const ability = offer?.type === "tapForMana" ? offer.ability : -1;
    const t = act(s, "p1", { type: "tapForMana", source: vivi, ability, colors: ["U", "R"] });
    expect(t.players.p1?.manaPool).toMatchObject({ U: 1, R: 1 });
    // One color for everything stays possible.
    expect(act(s, "p1", { type: "tapForMana", source: vivi, ability, color: "R" }).players.p1?.manaPool.R).toBe(2);
    // Wrong count, or a type it doesn't produce: refused.
    expect(() => act(s, "p1", { type: "tapForMana", source: vivi, ability, colors: ["U", "R", "R"] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "tapForMana", source: vivi, ability, colors: ["U", "G"] })).toThrow(RulesError);
  });

  it('a source that is not "in any combination" refuses several types', () => {
    const s = scenario({ p1: { battlefield: ["Sol Ring"] } });
    const ring = idOf(s, "p1", "battlefield", "Sol Ring");
    const offer = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === ring);
    expect(offer && "combination" in offer).toBe(false);
    const ability = offer?.type === "tapForMana" ? offer.ability : -1;
    expect(() => act(s, "p1", { type: "tapForMana", source: ring, ability, colors: ["C", "C"] })).toThrow(RulesError);
  });
});

describe("Final Fantasy, lot K6: choices given back to the player", () => {
  /** Plays (without attacking) answering choices until `until`. */
  const runUntil = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 300 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else break;
    }
    return s;
  };

  const TERRA = "Terra, Magical Adept // Esper Terra";

  it("Esper Terra: 'up to three' lore counters on the Saga copy, from zero to three", () => {
    for (const yes of [0, 1, 2, 3]) {
      const s0 = scenario({ p1: { battlefield: ["Summon: Shiva"], hand: [TERRA] } });
      const shiva = idOf(s0, "p1", "battlefield", "Summon: Shiva");
      moveWithSpec(s0, "p1", idOf(s0, "p1", "hand", TERRA), { to: "battlefield", transformed: true });
      let asked = 0;
      const copyOf = (s: S) => s.battlefield.find((id) => s.objects[id]?.isToken && nameOf(s, id) === "Summon: Shiva");
      const s = runUntil(
        s0,
        (req) => {
          if (req.type === "yesNo") return [asked++ < yes ? 1 : 0];
          return req.type === "pick" && req.options.includes(shiva) ? [shiva] : undefined;
        },
        (x) => !!copyOf(x) && !x.stack.some((i) => x.defs[i.sourceDefId]?.name === TERRA),
      );
      const copy = copyOf(s) as string;
      expect(copy).toBeDefined();
      // The Saga's arrival counter (714.3a), plus the chosen counters.
      expect(s.objects[copy]?.counters.lore).toBe(1 + yes);
      expect(asked).toBe(Math.min(yes + 1, 3));
      expect(chars(s, copy).keywords).toContain("haste");
    }
  });

  it("Beatrix, Loyal General: any number of your Equipment, chosen one by one, on the targeted creature", () => {
    const s0 = scenario({ p1: { battlefield: ["Beatrix, Loyal General", "Bear Cub", "Black Mage's Rod", "Black Mage's Rod"] } });
    const bear = idOf(s0, "p1", "battlefield", "Bear Cub");
    const [rod1, rod2] = idsOf(s0, "p1", "battlefield", "Black Mage's Rod") as [string, string];
    let offered: string[] = [];
    const s = runUntil(
      s0,
      (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(bear)) return [bear];
        if (req.options.includes(rod1)) {
          offered = req.options;
          expect(req.min).toBe(0);
          return [rod2];
        }
        return undefined;
      },
      (x) => x.turn.step === "declareAttackers",
    );
    expect(offered.sort()).toEqual([rod1, rod2].sort());
    expect(s.objects[rod2]?.attachedTo).toBe(bear);
    expect(s.objects[rod1]?.attachedTo).toBeFalsy();

    // None: nothing is attached.
    const none = runUntil(
      s0,
      (req) =>
        req.type === "pick" ? (req.options.includes(bear) ? [bear] : req.options.includes(rod1) ? [] : undefined) : undefined,
      (x) => x.turn.step === "declareAttackers",
    );
    expect(none.objects[rod1]?.attachedTo).toBeFalsy();
    expect(none.objects[rod2]?.attachedTo).toBeFalsy();
  });

  it("Zell Dincht: the returned land is not targeted, it is chosen on resolution", () => {
    const s0 = scenario({ p1: { battlefield: ["Zell Dincht", "Mountain", "Forest"] } });
    const forest = idOf(s0, "p1", "battlefield", "Forest");
    let onStack: S | undefined;
    const s = runUntil(
      s0,
      (req, _p, cur) => {
        if (req.type === "pick" && req.options.includes(forest)) {
          onStack = cur;
          expect(req.options).toHaveLength(2);
          return [forest];
        }
        return undefined;
      },
      (x) => x.turn.step === "end" && x.stack.length === 0 && !!onStack,
    );
    const item = onStack?.stack.find((i) => onStack?.defs[i.sourceDefId]?.name === "Zell Dincht");
    expect(item).toBeDefined();
    expect(Object.values(item?.targets ?? {}).flat()).toHaveLength(0);
    expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(1);
  });
});

/** Free test sorcery: "transform the targeted permanent". */
const TRANSMUTE = customCard({
  name: "Transmutation",
  typeLine: "Sorcery",
  types: ["Sorcery"],
  spell: spell([target.permanent("t", ["Creature", "Enchantment"])], [fx.transform(ref.target())]),
});

describe("Final Fantasy, lot K8: mythic, rare and uncommon cards", () => {
  /** Plays answering choices (suggested answer by default) until `until`; neither attacks nor blocks. */
  const play = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 400 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = s.players[p.player]?.hand ?? [];
        s = act(s, p.player, { type: "discard", cards: hand.slice(0, p.count) });
      } else break;
    }
    return s;
  };
  /** Answer: 'yes' (or 'no') to questions, `want` when it is among the options of a choice. */
  const answering =
    (yes: boolean, want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        if (picked.length > 0) return picked.slice(0, req.max);
      }
      return undefined;
    };
  /** Resolves the stack, answering choices. */
  const resolve = (s: S, answer: Answer = () => undefined) => settleAll(s, answer);
  /** Activates the ability of `source` whose label starts with `label` (the first one, with no label). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const opt = legalActions(s, player).find(
      (a) => a.type === "activate" && a.source === source && (!label || plainText(a.label ?? "").startsWith(label)),
    );
    if (opt?.type !== "activate") throw new Error(`ability "${label ?? "?"}" not found`);
    return act(s, player, { type: "activate", source, ability: opt.ability, ...extra });
  };
  const canUse = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source && (!label || a.label?.startsWith(label)));
  /** Shows the back face of a transformable card. */
  const flip = (s: S, id: string) => {
    s.objects[id]!.faceDefId = s.defs[s.objects[id]!.defId]!.faceDefs![1]!.id;
    bump(s);
  };
  const life = (s: S, p: string) => s.players[p]?.life;
  const hand = (s: S, p: string) => s.players[p]?.hand.length ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;
  /** Until the main phase 1 of `p`'s next turn. */
  const toMain = (s: S, p: string, answer: Answer = () => undefined) =>
    play(
      s,
      answer,
      (x) =>
        x.turn.active === p &&
        x.turn.step === "main1" &&
        x.stack.length === 0 &&
        x.triggers.length === 0 &&
        x.pending?.kind === "priority" &&
        x.turn.number > s.turn.number,
    );

  describe("mythiques", () => {
    it("Aettir and Priwen: base P/T equal to your life (counters on top), tracks your life; Equip {5}", () => {
      let s = scenario({
        p1: {
          life: 13,
          battlefield: ["Aettir and Priwen", { name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Plains", 5)],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const gear = idOf(s, "p1", "battlefield", "Aettir and Priwen");
      s = resolve(activate(s, "p1", gear, "Equip", { targets: { t: [bear] } }));
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
      expect(pt(s, bear)).toEqual([14, 14]);
      s.players.p1!.life = 6;
      bump(s);
      expect(pt(s, bear)).toEqual([7, 7]);
    });

    it("Clive, Ifrit's Dominant: on arrival, you may discard your hand then draw according to your devotion to red", () => {
      const CLIVE = "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno";
      const run = (yes: boolean) => {
        const s = scenario({ p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 6)], hand: [CLIVE, "Opt", "Bear Cub"] } });
        return resolve(cast(s, "p1", CLIVE), answering(yes));
      };
      const yes = run(true);
      // Devotion: {R}{R} from Clive and {R}{R} from the Dragon.
      expect(hand(yes, "p1")).toBe(4);
      expect(namesIn(yes, yes.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
      const no = run(false);
      expect(namesIn(no, no.players.p1?.hand).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Ifrit, Warden of Inferno: I fights another targeted creature; III: returns to its front face (not at II)", () => {
      const CLIVE = "Clive, Ifrit's Dominant // Ifrit, Warden of Inferno";
      let s = scenario({ p1: { battlefield: [CLIVE, ...lands("Mountain", 6)] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", CLIVE)), answering(true, [angel]));
      const ifrit = idOf(s, "p1", "battlefield", CLIVE);
      expect(chars(s, ifrit).name).toBe("Ifrit, Warden of Inferno");
      expect(pt(s, ifrit)).toEqual([9, 9]);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[ifrit]?.damage).toBe(4);
      // Chapter II: two counters, it stays Ifrit.
      s = play(
        s,
        () => undefined,
        (x) => (x.objects[ifrit]?.counters.lore ?? 0) >= 2 && x.stack.length === 0,
      );
      expect(chars(s, ifrit).name).toBe("Ifrit, Warden of Inferno");
      // Chapter III: exiled then returned to its front face.
      s = play(
        s,
        () => undefined,
        (x) => !x.battlefield.includes(ifrit) && x.stack.length === 0,
      );
      const back = idOf(s, "p1", "battlefield", CLIVE);
      expect(chars(s, back).name).not.toBe("Ifrit, Warden of Inferno");
      expect(pt(s, back)).toEqual([5, 5]);
      expect(s.objects[back]?.counters.lore).toBeUndefined();
    });

    it("Cloud, Planet's Champion: equipped, double strike and indestructible during your turn only; Equip targeting it costs {2} less", () => {
      let s = scenario({ p1: { battlefield: ["Cloud, Planet's Champion", "Buster Sword", "Bear Cub"] } });
      const cloud = idOf(s, "p1", "battlefield", "Cloud, Planet's Champion");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      expect(chars(s, cloud).keywords).not.toContain("doubleStrike");
      // Without a land: Equip {2} only targets Cloud.
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === sword);
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toEqual([cloud]);
      s = resolve(activate(s, "p1", sword, "Equip", { targets: { t: [cloud] } }));
      expect(s.objects[sword]?.attachedTo).toBe(cloud);
      expect(chars(s, cloud).keywords).toEqual(expect.arrayContaining(["doubleStrike", "indestructible"]));
      const t = scenario({ active: "p2", p1: { battlefield: ["Cloud, Planet's Champion", "Buster Sword"] } });
      const c2 = idOf(t, "p1", "battlefield", "Cloud, Planet's Champion");
      t.objects[idOf(t, "p1", "battlefield", "Buster Sword")]!.attachedTo = c2;
      bump(t);
      expect(chars(t, c2).keywords).not.toContain("doubleStrike");
      expect(chars(t, c2).keywords).not.toContain("indestructible");
    });

    it("Dark Confidant: at your upkeep, the top card goes to hand and you lose life equal to its mana value", () => {
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: ["Dark Confidant"], library: ["Shivan Dragon", "Forest", "Forest"] },
      });
      s = toMain(s, "p1");
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Forest", "Shivan Dragon"]);
      expect(life(s, "p1")).toBe(14);
    });

    it("Emet-Selch: mills on arrival; transforms at upkeep with fourteen cards in the graveyard, not thirteen", () => {
      const EMET = "Emet-Selch, Unsundered // Hades, Sorcerer of Eld";
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Swamp"], hand: [EMET, "Opt"], library: ["Bear Cub", "Forest"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = resolve(cast(s, "p1", EMET), answering(true, [opt]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(chars(s, idOf(s, "p1", "battlefield", EMET)).keywords).toContain("vigilance");
      const upkeep = (n: number) => {
        const t = scenario({ active: "p2", turn: 4, p1: { battlefield: [EMET], graveyard: lands("Forest", n) } });
        const emet = idOf(t, "p1", "battlefield", EMET);
        return chars(toMain(t, "p1", answering(true)), emet).name;
      };
      expect(upkeep(14)).toBe("Hades, Sorcerer of Eld");
      expect(upkeep(13)).not.toBe("Hades, Sorcerer of Eld");
    });

    it("Hades, Sorcerer of Eld: during your turn, you play from your graveyard; what would go to the graveyard is exiled", () => {
      const EMET = "Emet-Selch, Unsundered // Hades, Sorcerer of Eld";
      let s = scenario({ p1: { battlefield: [EMET, "Island"], graveyard: ["Opt", "Forest"] } });
      flip(s, idOf(s, "p1", "battlefield", EMET));
      const opt = idOf(s, "p1", "graveyard", "Opt");
      expect(castable(s, "p1", opt)).toBe(true);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === idOf(s, "p1", "graveyard", "Forest"))).toBe(
        true,
      );
      s = resolve(act(s, "p1", { type: "cast", card: opt }));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(exiled(s, "Opt")).toHaveLength(1);
      // During the opponent's turn: no spell from the graveyard.
      const t = scenario({ active: "p2", p1: { battlefield: [EMET, "Island"], graveyard: ["Opt"] } });
      flip(t, idOf(t, "p1", "battlefield", EMET));
      const u = act(t, "p2", { type: "pass" });
      expect(castable(u, "p1", idOf(u, "p1", "graveyard", "Opt"))).toBe(false);
    });

    it("Gogo, Master of Mimicry: copies an ability you control X times; X can't be 0", () => {
      const healer = customCard({
        name: "Healer",
        power: 1,
        toughness: 1,
        abilities: [activated({ tap: true, effects: [fx.gainLife(2)], label: "2 life" })],
      });
      let s = scenario({ p1: { battlefield: ["Gogo, Master of Mimicry", healer, ...lands("Island", 4)] } });
      const gogo = idOf(s, "p1", "battlefield", "Gogo, Master of Mimicry");
      expect(canUse(s, "p1", gogo)).toBe(false);
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Healer"), "2 life");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === gogo);
      expect(opt?.type === "activate" && opt.xMin).toBe(1);
      s = act(s, "p1", {
        type: "activate",
        source: gogo,
        ability: opt?.type === "activate" ? opt.ability : -1,
        x: 2,
        targets: { t: [s.stack[0]?.id as string] },
      });
      s = resolve(s);
      expect(life(s, "p1")).toBe(26);
    });

    it("Kefka, Court Mage: each player discards; you draw a card per card type discarded", () => {
      const KEFKA = "Kefka, Court Mage // Kefka, Ruler of Ruin";
      const run = (mine: string, theirs: string) => {
        const s = scenario({
          p1: { battlefield: ["Island", "Swamp", "Mountain", ...lands("Plains", 2)], hand: [KEFKA, mine] },
          p2: { hand: [theirs] },
        });
        return resolve(cast(s, "p1", KEFKA));
      };
      const two = run("Bear Cub", "Opt");
      expect(hand(two, "p1")).toBe(2);
      expect(two.players.p2?.hand).toHaveLength(0);
      expect(hand(run("Forest", "Forest"), "p1")).toBe(1);
    });

    it("Kefka: {8} each opponent sacrifices a permanent and Kefka transforms; Ruler of Ruin draws the life lost during your turn", () => {
      const KEFKA = "Kefka, Court Mage // Kefka, Ruler of Ruin";
      let s = scenario({
        p1: { battlefield: [KEFKA, ...lands("Mountain", 8)], hand: ["Burst Lightning"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const kefka = idOf(s, "p1", "battlefield", KEFKA);
      s = resolve(activate(s, "p1", kefka));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(chars(s, kefka).name).toBe("Kefka, Ruler of Ruin");
      expect(chars(s, kefka).keywords).toContain("flying");
      // Burst Lightning: 2 life lost, two cards.
      let t = scenario({ p1: { battlefield: [KEFKA, "Mountain"], hand: ["Burst Lightning"] } });
      flip(t, idOf(t, "p1", "battlefield", KEFKA));
      t = resolve(cast(t, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(hand(t, "p1")).toBe(2);
      // During the opponent's turn: nothing.
      let u = scenario({
        active: "p2",
        p1: { battlefield: [KEFKA] },
        p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
      });
      flip(u, idOf(u, "p1", "battlefield", KEFKA));
      u = resolve(cast(u, "p2", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(life(u, "p2")).toBe(18);
      expect(hand(u, "p1")).toBe(0);
    });

    it("Lightning, Army of One: after combat damage to a player, damage to that player and their permanents is doubled", () => {
      let s = scenario({
        p1: { battlefield: ["Lightning, Army of One", ...lands("Mountain", 2)], hand: ["Burst Lightning", "Burst Lightning"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const light = idOf(s, "p1", "battlefield", "Lightning, Army of One");
      expect(chars(s, light).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample", "lifelink"]));
      s = throughCombat(attack(s, [light]));
      expect(life(s, "p2")).toBe(17);
      expect(life(s, "p1")).toBe(23);
      const [a, b] = idsOf(s, "p1", "hand", "Burst Lightning") as [string, string];
      s = resolve(act(s, "p1", { type: "cast", card: a, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(13);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(act(s, "p1", { type: "cast", card: b, targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Nibelheim Aflame: your creature damages each other creature according to its power; flashback, discard your hand and draw four cards", () => {
      const setup = (where: "hand" | "graveyard") =>
        scenario({
          p1: {
            battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Mountain", 7)],
            hand: where === "hand" ? ["Nibelheim Aflame", "Opt"] : ["Opt"],
            graveyard: where === "graveyard" ? ["Nibelheim Aflame"] : [],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup("hand");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = resolve(cast(s, "p1", "Nibelheim Aflame", { targets: { t: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[dragon]?.damage).toBe(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = setup("graveyard");
      const d2 = idOf(t, "p1", "battlefield", "Shivan Dragon");
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "Nibelheim Aflame"), targets: { t: [d2] } }));
      expect(hand(t, "p1")).toBe(4);
      expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(exiled(t, "Nibelheim Aflame")).toHaveLength(1);
    });

    it("Sephiroth, Fabled SOLDIER: optional sacrifice to draw; each other death drains 1; the fourth time, it transforms and gives the emblem", () => {
      const SEPH = "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: [SEPH] } });
      s = resolve(cast(s, "p1", SEPH), (req, _p, cur) => pickNamed(cur, req, "Bear Cub") ?? answering(true)(req, _p, cur));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(1);
      expect(life(s, "p2")).toBe(19);
      expect(life(s, "p1")).toBe(21);
      let t = scenario({ p1: { battlefield: [SEPH] }, p2: { battlefield: lands("Bear Cub", 5) } });
      const seph = idOf(t, "p1", "battlefield", SEPH);
      const kill = (x: S) => {
        const y = structuredClone(x);
        destroy(y, idsOf(y, "p2", "battlefield", "Bear Cub")[0] as string);
        return resolve(y);
      };
      for (let i = 0; i < 3; i++) t = kill(t);
      expect(life(t, "p2")).toBe(17);
      expect(chars(t, seph).name).not.toBe("Sephiroth, One-Winged Angel");
      t = kill(t);
      expect(life(t, "p2")).toBe(16);
      expect(chars(t, seph).name).toBe("Sephiroth, One-Winged Angel");
      // Fifth death: only the emblem drains.
      t = kill(t);
      expect(life(t, "p2")).toBe(15);
      expect(life(t, "p1")).toBe(25);
    });

    it("Sephiroth, One-Winged Angel: when attacking, sacrifice as many other creatures as you want and draw that many", () => {
      const SEPH = "Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel";
      let s = scenario({ p1: { battlefield: [SEPH, "Bear Cub", "Bear Cub", "Llanowar Elves"] } });
      const seph = idOf(s, "p1", "battlefield", SEPH);
      flip(s, seph);
      expect(chars(s, seph).keywords).toContain("flying");
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(attack(s, [seph]), answering(true, bears));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(2);
    });

    it("Sephiroth, Planet's Heir: opposing creatures -2/-2 until end of turn; a counter per opposing creature that dies", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", ...lands("Swamp", 5)], hand: ["Sephiroth, Planet's Heir"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Sephiroth, Planet's Heir"));
      const seph = idOf(s, "p1", "battlefield", "Sephiroth, Planet's Heir");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(counters(s, seph)).toBe(1);
      expect(chars(s, seph).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, angel)).toEqual([4, 4]);
    });

    it("Summon: Bahamut: I destroys up to one nonland permanent; IV deals the total MV of your other permanents to each opponent", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 9), hand: ["Summon: Bahamut"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const forest = idOf(s, "p2", "battlefield", "Forest");
      let seen: string[] = [];
      s = resolve(cast(s, "p1", "Summon: Bahamut"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) {
          seen = req.options;
          return [angel];
        }
        return undefined;
      });
      expect(seen).not.toContain(forest);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Bahamut", counters: { lore: 3 } }, "Shivan Dragon", "Bear Cub", "Plains"] },
      });
      t = toMain(t, "p1");
      // Shivan Dragon (6) + Bear Cub (2), the land counts for 0.
      expect(life(t, "p2")).toBe(12);
      expect(idsOf(t, "p1", "graveyard", "Summon: Bahamut")).toHaveLength(1);
    });

    it("Summon: Knights of Round: three 2/2 Knights per chapter; V: +2/+2 and an indestructible counter on each of your other creatures", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), hand: ["Summon: Knights of Round"] } });
      s = resolve(cast(s, "p1", "Summon: Knights of Round"));
      expect(idsOf(s, "p1", "battlefield", "Knight")).toHaveLength(3);
      const kor = idOf(s, "p1", "battlefield", "Summon: Knights of Round");
      expect(chars(s, kor).keywords).toContain("indestructible");
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Knights of Round", counters: { lore: 4 } }, "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const k2 = idOf(t, "p1", "battlefield", "Summon: Knights of Round");
      t = toMain(t, "p1");
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(pt(t, bear)).toEqual([4, 4]);
      expect(counters(t, bear, "indestructible")).toBe(1);
      expect(counters(t, idOf(t, "p2", "battlefield", "Serra Angel"), "indestructible")).toBe(0);
      expect(t.battlefield).not.toContain(k2);
    });

    it("Traveling Chocobo: lands and Bird spells from the top of the library; a land's enters triggers happen twice", () => {
      const s = scenario({ p1: { battlefield: ["Traveling Chocobo", "Sazh's Chocobo"], library: ["Forest", "Bear Cub"] } });
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
      const t = resolve(act(s, "p1", { type: "playLand", card: top }));
      expect(counters(t, idOf(t, "p1", "battlefield", "Sazh's Chocobo"))).toBe(2);
      // A non-Bird creature on top can't be cast.
      const u = scenario({ p1: { battlefield: ["Traveling Chocobo", ...lands("Forest", 2)], library: ["Bear Cub"] } });
      expect(castable(u, "p1", u.players.p1?.library[0] as string)).toBe(false);
    });

    it("Y'shtola Rhul: at your end step, one of your creatures is exiled then returns, and there is an extra end step (only one)", () => {
      let s = scenario({ p1: { battlefield: ["Y'shtola Rhul", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      const seen = new Set<string>();
      const pickBear: Answer = (req, _p, cur) => pickNamed(cur, req, "Bear Cub");
      s = play(s, pickBear, (x) => {
        for (const id of idsOf(x, "p1", "battlefield", "Bear Cub")) seen.add(id);
        return x.turn.active === "p2";
      });
      // The original Bear Cub and two returns.
      expect(seen.size).toBe(3);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Yuna, Hope of Spira: during your turn, it and your enchantment creatures have trample, lifelink and ward; an enchantment returns from the graveyard with a finality counter", () => {
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      let s = scenario({ p1: { battlefield: ["Yuna, Hope of Spira", "Bear Cub"], graveyard: [charm] } });
      const yuna = idOf(s, "p1", "battlefield", "Yuna, Hope of Spira");
      expect(chars(s, yuna).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
      s = play(s, answering(true, idsOf(s, "p1", "graveyard", "Charme")), (x) => x.turn.active === "p2");
      const back = idOf(s, "p1", "battlefield", "Charme");
      expect(counters(s, back, "finality")).toBe(1);
      expect(chars(s, yuna).keywords).not.toContain("trample");
    });
  });

  describe("rares (1)", () => {
    it("A Realm Reborn: your other permanents have '{T}: add one mana of any color', not the opponent's", () => {
      const s = scenario({ p1: { battlefield: ["A Realm Reborn", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const manaOf = (p: string, src: string) => legalActions(s, p).find((a) => a.type === "tapForMana" && a.source === src);
      const mine = manaOf("p1", idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(mine?.type === "tapForMana" && [...mine.colors].sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(manaOf("p1", idOf(s, "p1", "battlefield", "A Realm Reborn"))).toBeUndefined();
      expect(manaOf("p2", idOf(s, "p2", "battlefield", "Bear Cub"))).toBeUndefined();
    });

    it("Aerith Gainsborough: a counter on each life gain; when it dies, its counters go onto each of your legendary creatures", () => {
      let s = scenario({ p1: { battlefield: ["Aerith Gainsborough"] } });
      const aerith = idOf(s, "p1", "battlefield", "Aerith Gainsborough");
      expect(chars(s, aerith).keywords).toContain("lifelink");
      s = throughCombat(attack(s, [aerith]));
      expect(life(s, "p1")).toBe(22);
      expect(counters(s, aerith)).toBe(1);
      let t = scenario({
        p1: { battlefield: [{ name: "Aerith Gainsborough", counters: { "+1/+1": 2 } }, "Cloud, Planet's Champion", "Bear Cub"] },
      });
      destroy(t, idOf(t, "p1", "battlefield", "Aerith Gainsborough"));
      t = resolve(t);
      expect(counters(t, idOf(t, "p1", "battlefield", "Cloud, Planet's Champion"))).toBe(2);
      expect(counters(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Ardyn, the Usurper: at the beginning of combat, a creature card from a graveyard becomes a 5/5 black Demon token with menace, lifelink and haste", () => {
      let s = scenario({ p1: { battlefield: ["Ardyn, the Usurper"] }, p2: { graveyard: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = play(s, answering(true, [angel]), (x) => x.turn.step === "declareAttackers" || x.pending?.kind === "declareAttackers");
      const token = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(s.objects[token]?.isToken).toBe(true);
      expect(pt(s, token)).toEqual([5, 5]);
      expect(chars(s, token).colors).toEqual(["B"]);
      expect(chars(s, token).subtypes).toEqual(["Demon"]);
      expect(chars(s, token).keywords).toEqual(expect.arrayContaining(["flying", "menace", "lifelink", "haste"]));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Ardyn, the Usurper")).keywords).not.toContain("menace");
    });

    it("Astrologian's Planisphere: the equipped creature is a Wizard; a counter per noncreature spell and on the third card drawn", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 9), hand: ["Astrologian's Planisphere", "Opt", "Bear Cub", "Quick Study"] },
      });
      s = resolve(cast(s, "p1", "Astrologian's Planisphere"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(chars(s, hero).subtypes).toEqual(expect.arrayContaining(["Hero", "Wizard"]));
      // Opt: noncreature spell (1), first card drawn.
      s = resolve(cast(s, "p1", "Opt"));
      expect(counters(s, hero)).toBe(1);
      // A creature spell: nothing (Bear Cub can't be cast for lack of {G}: we go straight to Quick Study).
      s = resolve(cast(s, "p1", "Quick Study"));
      // Quick Study (2) and the third card drawn (3).
      expect(counters(s, hero)).toBe(3);
    });

    it("Balamb Garden: enters tapped; transforming costs {1} less per other Town; the Vehicle draws when attacking", () => {
      const BALAMB = "Balamb Garden, SeeD Academy // Balamb Garden, Airborne";
      const s = scenario({ p1: { hand: [BALAMB] } });
      const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", BALAMB) });
      expect(t.objects[idOf(t, "p1", "battlefield", BALAMB)]?.tapped).toBe(true);
      // Two other Towns: {3}{G}{U} for five mana sources.
      let u = scenario({ p1: { battlefield: [BALAMB, "Adventurer's Inn", "Capital City", "Forest", "Island", "Forest"] } });
      const garden = idOf(u, "p1", "battlefield", BALAMB);
      expect(canUse(u, "p1", garden, "Transform")).toBe(true);
      const v = scenario({ p1: { battlefield: [BALAMB, "Forest", "Island", "Forest", "Forest", "Forest"] } });
      expect(canUse(v, "p1", idOf(v, "p1", "battlefield", BALAMB), "Transform")).toBe(false);
      u = resolve(activate(u, "p1", garden, "Transform"));
      expect(chars(u, garden).name).toBe("Balamb Garden, Airborne");
      expect(chars(u, garden).keywords).toContain("flying");
      let w = scenario({ p1: { battlefield: [BALAMB, "Bear Cub"] } });
      const g2 = idOf(w, "p1", "battlefield", BALAMB);
      flip(w, g2);
      w = resolve(activate(w, "p1", g2, "Crew", { tap: [idOf(w, "p1", "battlefield", "Bear Cub")] }));
      w = resolve(attack(w, [g2]));
      expect(hand(w, "p1")).toBe(1);
    });

    it("Balthier and Fran: your Vehicles +1/+1, reach and vigilance; a Vehicle they crewed attacks: pay {1}{R}{G} for an additional combat", () => {
      let s = scenario({
        p1: { battlefield: ["Balthier and Fran", "The Regalia", "Mountain", "Forest", "Forest"] },
        p2: { battlefield: ["The Regalia"] },
      });
      const regalia = idOf(s, "p1", "battlefield", "The Regalia");
      expect(pt(s, regalia)).toEqual([5, 5]);
      expect(chars(s, regalia).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
      expect(chars(s, idOf(s, "p2", "battlefield", "The Regalia")).keywords).not.toContain("reach");
      const bf = idOf(s, "p1", "battlefield", "Balthier and Fran");
      s = resolve(activate(s, "p1", regalia, "Crew", { tap: [bf] }));
      s = attack(s, [regalia]);
      s = play(
        s,
        answering(true),
        (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && (x.players.p2?.life ?? 20) < 20),
      );
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(life(s, "p2")).toBe(15);
      expect(s.objects[regalia]?.tapped).toBe(false);
    });

    it("Bartz and Boko: affinity for Birds; each of your other Birds deals its power to a targeted opposing creature", () => {
      const wall = customCard({ name: "Mur", power: 0, toughness: 20 });
      let s = scenario({
        p1: {
          battlefield: [{ name: "Sazh's Chocobo", counters: { "+1/+1": 3 } }, "Healer's Hawk", "Bear Cub", ...lands("Forest", 3)],
          hand: ["Bartz and Boko"],
        },
        p2: { battlefield: [wall, "Bear Cub"] },
      });
      const target = idOf(s, "p2", "battlefield", "Mur");
      // {3}{G}{G} minus two Birds: three Forests suffice.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bartz and Boko"))).toBe(true);
      s = resolve(cast(s, "p1", "Bartz and Boko"), answering(true, [target]));
      // Sazh's Chocobo (3) and Hawk (1); neither Bartz and Boko (4) nor the Bear Cub.
      expect(s.objects[target]?.damage).toBe(4);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.damage).toBe(0);
    });

    it("Choco, Seeker of Paradise: attacking Birds make you look at that many cards, one to hand, lands in play tapped; land: +1/+0", () => {
      let s = scenario({
        p1: {
          battlefield: ["Choco, Seeker of Paradise", "Healer's Hawk", "Healer's Hawk"],
          library: ["Forest", "Bear Cub", "Shock", "Opt"],
        },
      });
      const choco = idOf(s, "p1", "battlefield", "Choco, Seeker of Paradise");
      const birds = idsOf(s, "p1", "battlefield", "Healer's Hawk");
      s = attack(s, [choco, ...birds]);
      // Three Birds: the top three cards are looked at (not milled: they stay in the library during
      // the choices); one to hand, then the lands among the others onto the battlefield, the rest to the graveyard.
      const offered: number[] = [];
      s = resolve(s, (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return req.max === 1 && offered.length === 1 ? pickNamed(cur, req, "Bear Cub") : req.options;
      });
      expect(offered).toEqual([3, 1]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      const forest = idOf(s, "p1", "battlefield", "Forest");
      expect(s.objects[forest]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shock"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt"]);
      expect(chars(s, choco).power).toBe(4);
    });

    it("Choco, Seeker of Paradise: 'that many cards' as Birds that attacked, even if they left the battlefield before resolution", () => {
      let s = scenario({
        p1: {
          battlefield: ["Choco, Seeker of Paradise", "Healer's Hawk", "Healer's Hawk"],
          library: ["Forest", "Bear Cub", "Shock", "Opt"],
        },
      });
      const choco = idOf(s, "p1", "battlefield", "Choco, Seeker of Paradise");
      const birds = idsOf(s, "p1", "battlefield", "Healer's Hawk");
      s = structuredClone(attack(s, [choco, ...birds]));
      expect(s.stack.some((i) => i.kind === "ability" && s.defs[i.sourceDefId]?.name === "Choco, Seeker of Paradise")).toBe(true);
      // The two Hawks and Choco itself die, ability on the stack: three cards are still looked at.
      for (const id of [...birds, choco]) destroy(s, id);
      const offered: number[] = [];
      s = resolve(s, (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered.push(req.options.length);
        return req.max === 1 && offered.length === 1 ? pickNamed(cur, req, "Bear Cub") : req.options;
      });
      expect(offered).toEqual([3, 1]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Opt"]);
    });

    it("Clive's Hideaway: hideaway 4; {2}, {T}: the exiled card is played for free with four legendary creatures, not with three", () => {
      const legend = (n: number) =>
        customCard({ name: `Legend ${n}`, supertypes: ["Legendary"], typeLine: "Legendary Creature", power: 1, toughness: 1 });
      const run = (count: number) => {
        let s = scenario({
          p1: {
            battlefield: [...[1, 2, 3, 4].slice(0, count).map(legend), "Forest", "Forest"],
            hand: ["Clive's Hideaway"],
            library: ["Shivan Dragon", "Forest", "Forest", "Forest", "Opt"],
          },
        });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Clive's Hideaway") });
        s = resolve(s, (req, _p, cur) => pickNamed(cur, req, "Shivan Dragon"));
        expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
        expect(namesIn(s, s.players.p1?.library)[0]).toBe("Opt");
        s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Clive's Hideaway"), "Play"));
        return { s, dragon: exiled(s, "Shivan Dragon")[0] as string };
      };
      const four = run(4);
      expect(castable(four.s, "p1", four.dragon)).toBe(true);
      const done = resolve(act(four.s, "p1", { type: "cast", card: four.dragon }));
      expect(idsOf(done, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      const three = run(3);
      expect(castable(three.s, "p1", three.dragon)).toBe(false);
    });

    it("Deadly Embrace: destroys an opposing creature, then draws a card per creature that died this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Deadly Embrace"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Deadly Embrace");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(2);
    });

    it("Dion, Bahamut's Dominant: a 2/2 Knight on arrival; Dion and your other Knights fly during your turn", () => {
      const DION = "Dion, Bahamut's Dominant // Bahamut, Warden of Light";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: [DION] } });
      s = resolve(cast(s, "p1", DION));
      const dion = idOf(s, "p1", "battlefield", DION);
      const knight = idOf(s, "p1", "battlefield", "Knight");
      expect(pt(s, knight)).toEqual([2, 2]);
      expect(chars(s, dion).keywords).toContain("flying");
      expect(chars(s, knight).keywords).toContain("flying");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      // Outside your turn, neither Dion nor the Knight flies (PLAN-D, D8: the back face's flying is no longer read from the front face).
      expect(chars(s, knight).keywords).not.toContain("flying");
      expect(chars(s, dion).keywords).not.toContain("flying");
    });

    it("Bahamut, Warden of Light: I a counter and flying on each of your other creatures; III destroys a targeted permanent and returns to its front face", () => {
      const DION = "Dion, Bahamut's Dominant // Bahamut, Warden of Light";
      let s = scenario({
        p1: { battlefield: [DION, "Bear Cub", ...lands("Plains", 6)] },
        p2: { battlefield: ["Bear Cub", "Forest"] },
      });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", DION)));
      const bahamut = idOf(s, "p1", "battlefield", DION);
      expect(chars(s, bahamut).name).toBe("Bahamut, Warden of Light");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(counters(s, bahamut)).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
      const forest = idOf(s, "p2", "battlefield", "Forest");
      s = play(s, answering(true, [forest]), (x) => !x.battlefield.includes(bahamut) && x.stack.length === 0);
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", DION)).name).not.toBe("Bahamut, Warden of Light");
    });

    it("Edgar, King of Figaro: on arrival, a card per artifact you control", () => {
      let s = scenario({
        p1: { battlefield: ["Buster Sword", "Aettir and Priwen", ...lands("Island", 6)], hand: ["Edgar, King of Figaro"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      s = resolve(cast(s, "p1", "Edgar, King of Figaro"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Firion, Wild Rose Warrior: your equipped creatures have haste; a nontoken Equipment enters: a copy (Equip {2} less), sacrificed at the next upkeep", () => {
      let s = scenario({
        p1: {
          battlefield: ["Firion, Wild Rose Warrior", { name: "Bear Cub", sick: true }, ...lands("Mountain", 3)],
          hand: ["Buster Sword"],
        },
      });
      s = resolve(cast(s, "p1", "Buster Sword"));
      const swords = idsOf(s, "p1", "battlefield", "Buster Sword");
      expect(swords).toHaveLength(2);
      const token = swords.find((id) => s.objects[id]?.isToken) as string;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).not.toContain("haste");
      // Equip {2} - {2}: free.
      s = resolve(activate(s, "p1", token, "Equip", { targets: { t: [bear] } }));
      expect(s.objects[token]?.attachedTo).toBe(bear);
      expect(chars(s, bear).keywords).toContain("haste");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "draw",
      );
      expect(idsOf(s, "p1", "battlefield", "Buster Sword")).toHaveLength(1);
    });

    it("From Father to Son: searches for a Vehicle for the hand; cast from the graveyard, it enters the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["From Father to Son"], library: ["Forest", "The Regalia", "Forest"] },
      });
      s = resolve(cast(s, "p1", "From Father to Son"), (req, _p, cur) => pickNamed(cur, req, "The Regalia"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["The Regalia"]);
      let t = scenario({
        p1: { battlefield: lands("Plains", 7), graveyard: ["From Father to Son"], library: ["Forest", "The Regalia"] },
      });
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "From Father to Son") }), (req, _p, cur) =>
        pickNamed(cur, req, "The Regalia"),
      );
      expect(idsOf(t, "p1", "battlefield", "The Regalia")).toHaveLength(1);
      expect(exiled(t, "From Father to Son")).toHaveLength(1);
    });

    it("Genji Glove: double strike; at the first combat, the equipped creature untaps and a combat phase is added", () => {
      let s = scenario({ p1: { battlefield: ["Genji Glove", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Genji Glove")]!.attachedTo = bear;
      bump(s);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      s = attack(s, [bear]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" || (x.pending?.kind === "declareAttackers" && (x.players.p2?.life ?? 20) < 20),
      );
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(life(s, "p2")).toBe(16);
      expect(s.objects[bear]?.tapped).toBe(false);
      // Second combat: no third.
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" || x.pending?.kind === "declareAttackers",
      );
      expect(s.turn.step).toBe("main2");
      expect(life(s, "p2")).toBe(12);
    });

    it("Gilgamesh, Master-at-Arms: the Equipment among the top six enter play; one can attach to a Samurai", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 6),
          hand: ["Gilgamesh, Master-at-Arms"],
          library: ["Buster Sword", "Forest", "Genji Glove", "Opt", "Forest", "Forest", "Aettir and Priwen"],
        },
      });
      let sword = "";
      s = resolve(cast(s, "p1", "Gilgamesh, Master-at-Arms"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        const named = pickNamed(cur, req, "Buster Sword");
        if (named?.length) sword = named[0] as string;
        return req.type === "pick" && req.max > 1 ? req.options : named?.length ? named : undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Buster Sword")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Genji Glove")).toHaveLength(1);
      // The seventh (Aettir and Priwen) was not looked at.
      expect(idsOf(s, "p1", "battlefield", "Aettir and Priwen")).toHaveLength(0);
      const gil = idOf(s, "p1", "battlefield", "Gilgamesh, Master-at-Arms");
      const attached = s.battlefield.filter((id) => s.objects[id]?.attachedTo === gil);
      expect(attached).toHaveLength(1);
      expect(sword).not.toBe("");
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Aettir and Priwen");
    });
  });

  describe("rares (2)", () => {
    const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });

    it("Golbez, Crystal Collector: surveil 1 when one of your artifacts enters", () => {
      let s = scenario({ p1: { battlefield: ["Golbez, Crystal Collector"], hand: [trinket], library: ["Forest", "Opt"] } });
      const top = s.players.p1?.library[0] as string;
      let asked = false;
      s = resolve(cast(s, "p1", "Babiole"), (req) => {
        if (req.type === "pick" && req.options.includes(top)) {
          asked = true;
          return [top];
        }
        return undefined;
      });
      expect(asked).toBe(true);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Golbez: at your end step, with four artifacts a creature returns to hand; with eight, each opponent loses its power; with three, nothing", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Golbez, Crystal Collector", ...Array(n).fill(trinket)], graveyard: ["Shivan Dragon"] },
        });
        return play(
          s,
          () => undefined,
          (x) => x.turn.active === "p2",
        );
      };
      const four = run(4);
      expect(idsOf(four, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(life(four, "p2")).toBe(20);
      const eight = run(8);
      expect(idsOf(eight, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      expect(life(eight, "p2")).toBe(15);
      expect(idsOf(run(3), "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Hope Estheim: at your end step, each opponent mills as many cards as you gained life this turn", () => {
      let s = scenario({ p1: { battlefield: ["Hope Estheim"] } });
      const hope = idOf(s, "p1", "battlefield", "Hope Estheim");
      expect(chars(s, hope).keywords).toContain("lifelink");
      s = attack(s, [hope]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(s.players.p2?.graveyard).toHaveLength(2);
      const t = play(
        scenario({ p1: { battlefield: ["Hope Estheim"] } }),
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(t.players.p2?.graveyard).toHaveLength(0);
    });

    it("Ishgard / Faith & Grief: up to two artifact or enchantment cards from the graveyard to hand, then the land (tapped) from exile", () => {
      const ISHGARD = "Ishgard, the Holy See // Faith & Grief";
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      let s = scenario({
        p1: { battlefield: lands("Plains", 5), hand: [ISHGARD], graveyard: ["Buster Sword", charm, "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", ISHGARD);
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.face === 1);
      const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
      expect(legal).toHaveLength(2);
      expect(legal).not.toContain(idOf(s, "p1", "graveyard", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "cast", card, face: 1, targets: { t: legal } }));
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Buster Sword", "Charme"]);
      const town = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
      s = act(s, "p1", { type: "playLand", card: town });
      expect(s.objects[idOf(s, "p1", "battlefield", ISHGARD)]?.tapped).toBe(true);
    });

    it("Jecht, Reluctant Guardian: menace; combat damage to a player: you may transform it into Braska's Final Aeon (I: opposing discard, you draw)", () => {
      const JECHT = "Jecht, Reluctant Guardian // Braska's Final Aeon";
      let s = scenario({ p1: { battlefield: [JECHT] }, p2: { hand: ["Opt"] } });
      const jecht = idOf(s, "p1", "battlefield", JECHT);
      expect(chars(s, jecht).keywords).toContain("menace");
      s = resolve(throughCombat(attack(s, [jecht]), answering(true)));
      const aeon = idOf(s, "p1", "battlefield", JECHT);
      expect(chars(s, aeon).name).toBe("Braska's Final Aeon");
      expect(life(s, "p2")).toBe(16);
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(hand(s, "p1")).toBe(1);
      // Declined: it stays Jecht.
      let t = scenario({ p1: { battlefield: [JECHT] } });
      t = resolve(throughCombat(attack(t, [idOf(t, "p1", "battlefield", JECHT)]), answering(false)));
      expect(chars(t, idOf(t, "p1", "battlefield", JECHT)).name).not.toBe("Braska's Final Aeon");
    });

    it("Braska's Final Aeon: III each opponent sacrifices two creatures", () => {
      const JECHT = "Jecht, Reluctant Guardian // Braska's Final Aeon";
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JECHT, counters: { lore: 2 } }] },
        p2: { battlefield: lands("Bear Cub", 3) },
      });
      flip(s, idOf(s, "p1", "battlefield", JECHT));
      s = toMain(s, "p1");
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", JECHT)).toHaveLength(1);
    });

    it("Jenova, Ancient Calamity: at combat, as many counters as its power on another creature, which becomes a Mutant; a Mutant dies during your turn: draw its power", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Jenova, Ancient Calamity", counters: { "+1/+1": 2 } }, "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = play(s, answering(true, [bear]), (x) => x.pending?.kind === "declareAttackers");
      expect(counters(s, bear)).toBe(3);
      expect(chars(s, bear).subtypes).toEqual(expect.arrayContaining(["Bear", "Mutant"]));
      destroy(s, bear);
      s = resolve(act(s, "p1", { type: "declareAttackers", attackers: [] }));
      expect(hand(s, "p1")).toBe(5);
      // During the opponent's turn: nothing.
      const mutant = customCard({ name: "Mutant", subtypes: ["Mutant"], power: 3, toughness: 3 });
      let u = scenario({ active: "p2", p1: { battlefield: ["Jenova, Ancient Calamity", mutant] } });
      destroy(u, idOf(u, "p1", "battlefield", "Mutant"));
      u = resolve(act(u, "p2", { type: "pass" }));
      expect(hand(u, "p1")).toBe(0);
    });

    it("Joshua, Phoenix's Dominant: discard up to two cards, draw that many", () => {
      const JOSHUA = "Joshua, Phoenix's Dominant // Phoenix, Warden of Fire";
      let s = scenario({ p1: { battlefield: ["Mountain", "Plains", "Plains"], hand: [JOSHUA, "Opt", "Forest", "Bear Cub"] } });
      const two = [idOf(s, "p1", "hand", "Opt"), idOf(s, "p1", "hand", "Forest")];
      s = resolve(cast(s, "p1", JOSHUA), answering(true, two));
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
      expect(hand(s, "p1")).toBe(3);
    });

    it("Phoenix, Warden of Fire: I and II deal 2 damage to each opponent (lifelink); III returns creatures with total MV 6 at most, then returns to its front face", () => {
      const JOSHUA = "Joshua, Phoenix's Dominant // Phoenix, Warden of Fire";
      let s = scenario({ p1: { battlefield: [JOSHUA, ...lands("Mountain", 3), "Plains", "Plains"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", JOSHUA)));
      const phoenix = idOf(s, "p1", "battlefield", JOSHUA);
      expect(chars(s, phoenix).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(22);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JOSHUA, counters: { lore: 2 } }], graveyard: ["Shivan Dragon", "Bear Cub"] },
      });
      flip(t, idOf(t, "p1", "battlefield", JOSHUA));
      const dragon = idOf(t, "p1", "graveyard", "Shivan Dragon");
      const bear = idOf(t, "p1", "graveyard", "Bear Cub");
      let offered: number | undefined;
      t = toMain(t, "p1", (req) => {
        if (req.type === "pick" && req.options.includes(dragon)) {
          offered = req.max;
          return [dragon];
        }
        return undefined;
      });
      expect(offered).toBeGreaterThanOrEqual(1);
      expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toEqual([bear]);
      expect(chars(t, idOf(t, "p1", "battlefield", JOSHUA)).name).not.toBe("Phoenix, Warden of Fire");
      // Both together (MV 8): refused.
      let u = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: JOSHUA, counters: { lore: 2 } }], graveyard: ["Shivan Dragon", "Bear Cub"] },
      });
      flip(u, idOf(u, "p1", "battlefield", JOSHUA));
      const both = [...(u.players.p1?.graveyard ?? [])];
      let refused = false;
      u = toMain(u, "p1", (req, player, cur) => {
        if (req.type === "pick" && both.every((id) => req.options.includes(id)) && !refused) {
          refused = true;
          expect(() => act(cur, player, { type: "choose", values: both })).toThrow();
          return [both[1] as string];
        }
        return undefined;
      });
      expect(refused).toBe(true);
    });

    it("Judgment Bolt: 5 damage to the targeted creature and X to its controller, X being the number of your Equipment", () => {
      let s = scenario({
        p1: { battlefield: ["Buster Sword", "Genji Glove", ...lands("Mountain", 4)], hand: ["Judgment Bolt"] },
        p2: { battlefield: ["Shivan Dragon", "Buster Sword"] },
      });
      s = resolve(cast(s, "p1", "Judgment Bolt", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(life(s, "p2")).toBe(18);
    });

    it("Jumbo Cactuar: when attacking, +9999/+0", () => {
      let s = scenario({ p1: { battlefield: ["Jumbo Cactuar"] } });
      const cactuar = idOf(s, "p1", "battlefield", "Jumbo Cactuar");
      s = resolve(attack(s, [cactuar]));
      expect(pt(s, cactuar)).toEqual([10000, 7]);
    });

    it("Kain, Traitorous Dragoon: flies during your turn; combat damage to a player: they take Kain, you draw, create tapped Treasures and lose that much", () => {
      let s = scenario({ p1: { battlefield: ["Kain, Traitorous Dragoon"] } });
      const kain = idOf(s, "p1", "battlefield", "Kain, Traitorous Dragoon");
      expect(chars(s, kain).keywords).toContain("flying");
      s = throughCombat(attack(s, [kain]));
      expect(s.objects[kain]?.controller).toBe("p2");
      expect(hand(s, "p1")).toBe(2);
      const treasures = idsOf(s, "p1", "battlefield", "Treasure");
      expect(treasures).toHaveLength(2);
      expect(treasures.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(life(s, "p1")).toBe(18);
      // With its new controller, during your turn: no flying.
      expect(chars(s, kain).keywords).not.toContain("flying");
    });

    it("Lightning, Security Sergeant: combat damage to a player: the top card is exiled and playable as long as you control it", () => {
      let s = scenario({ p1: { battlefield: ["Lightning, Security Sergeant"], library: ["Forest", "Opt"] } });
      const light = idOf(s, "p1", "battlefield", "Lightning, Security Sergeant");
      expect(chars(s, light).keywords).toContain("menace");
      s = throughCombat(attack(s, [light]));
      const forest = exiled(s, "Forest")[0] as string;
      expect(forest).toBeDefined();
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
      destroy(s, light);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
      // Lightning leaving and coming back is a new object: the permission doesn't return (PLAN-D, D8).
      let t = scenario({ p1: { battlefield: ["Lightning, Security Sergeant"], library: ["Forest", "Opt"] } });
      t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Lightning, Security Sergeant")]));
      const card = exiled(t, "Forest")[0] as string;
      expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(true);
      const away = moveObject(t, idOf(t, "p1", "battlefield", "Lightning, Security Sergeant"), "exile") as string;
      moveObject(t, away, "battlefield");
      expect(idsOf(t, "p1", "battlefield", "Lightning, Security Sergeant")).toHaveLength(1);
      expect(legalActions(t, "p1").some((a) => a.type === "playLand" && a.card === card)).toBe(false);
    });

    it("Machinist's Arsenal: the equipped creature is an Artificer and gets +2/+2 per artifact you control", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Machinist's Arsenal"] } });
      s = resolve(cast(s, "p1", "Machinist's Arsenal"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(chars(s, hero).subtypes).toContain("Artificer");
      expect(pt(s, hero)).toEqual([3, 3]);
      const t = scenario({ p1: { battlefield: ["Machinist's Arsenal", "Bear Cub", trinket] }, p2: { battlefield: [trinket] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t.objects[idOf(t, "p1", "battlefield", "Machinist's Arsenal")]!.attachedTo = bear;
      bump(t);
      expect(pt(t, bear)).toEqual([6, 6]);
    });

    it("Magitek Scythe: on arrival, you may attach it: first strike and must be blocked this turn; +2/+1", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Magitek Scythe"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Magitek Scythe"), answering(true, [bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Magitek Scythe")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([4, 3]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Magitek Scythe"] } });
      t = resolve(cast(t, "p1", "Magitek Scythe"), answering(false));
      expect(t.objects[idOf(t, "p1", "battlefield", "Magitek Scythe")]?.attachedTo).toBeFalsy();
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("firstStrike");
    });

    it("Matoya, Archon Elder: you draw a card whenever you scry or surveil", () => {
      let s = scenario({ p1: { battlefield: ["Matoya, Archon Elder", "Island"], hand: ["Opt"] } });
      s = resolve(cast(s, "p1", "Opt"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Memories Returning: three of the top five cards to hand, two on the bottom; flashback {7}{U}{U}", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 4),
          hand: ["Memories Returning"],
          library: ["Opt", "Bear Cub", "Forest", "Shivan Dragon", "Serra Angel", "Island"],
        },
      });
      s = resolve(cast(s, "p1", "Memories Returning"));
      expect(hand(s, "p1")).toBe(3);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Island");
      const t = scenario({ p1: { battlefield: lands("Island", 9), graveyard: ["Memories Returning"] } });
      expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Memories Returning"))).toBe(true);
    });

    it("Memories Returning: you and the chosen opponent take turns (PLAN-L L4)", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 4),
          hand: ["Memories Returning"],
          library: ["Opt", "Bear Cub", "Forest", "Shivan Dragon", "Serra Angel", "Island"],
        },
      });
      const choosers: string[] = [];
      const want: Record<string, string> = { p1: "Shivan Dragon", p2: "Serra Angel" };
      s = resolve(cast(s, "p1", "Memories Returning"), (req, p, cur) => {
        if (req.type !== "pick") return undefined;
        choosers.push(p);
        // p1 takes the Dragon, p2 sends the Angel to the bottom; then the first card offered.
        const named = req.options.find((id) => nameOf(cur, id) === want[p]);
        if (named) {
          want[p] = "";
          return [named];
        }
        return [req.options[0] as string];
      });
      expect(choosers).toEqual(["p1", "p2", "p1", "p2"]);
      expect(namesIn(s, s.players.p1?.hand)).toContain("Shivan Dragon");
      expect(namesIn(s, s.players.p1?.hand)).not.toContain("Serra Angel");
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Serra Angel", expect.any(String)]);
    });

    it("Midgar / Reactor Raid: you may sacrifice an artifact or creature to draw two cards; the land enters tapped", () => {
      const MIDGAR = "Midgar, City of Mako // Reactor Raid";
      const run = (yes: boolean) => {
        const s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: [MIDGAR] } });
        return resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", MIDGAR), face: 1 }), (req, p, cur) =>
          yes
            ? pickNamed(cur, req, "Bear Cub")?.length
              ? pickNamed(cur, req, "Bear Cub")
              : answering(true)(req, p, cur)
            : answering(false)(req, p, cur),
        );
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(hand(yes, "p1")).toBe(2);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(hand(no, "p1")).toBe(0);
      const town = no.exile.find((id) => no.objects[id]?.onAdventure) as string;
      const land = act(no, "p1", { type: "playLand", card: town });
      expect(land.objects[idOf(land, "p1", "battlefield", MIDGAR)]?.tapped).toBe(true);
    });

    it("Minwu, White Mage: vigilance, lifelink; each life gain puts a counter on each of your Clerics", () => {
      const cleric = customCard({ name: "Clerc", subtypes: ["Human", "Cleric"], power: 1, toughness: 1 });
      let s = scenario({ p1: { battlefield: ["Minwu, White Mage", cleric, "Bear Cub"] } });
      const minwu = idOf(s, "p1", "battlefield", "Minwu, White Mage");
      expect(chars(s, minwu).keywords).toEqual(expect.arrayContaining(["vigilance", "lifelink"]));
      s = throughCombat(attack(s, [minwu]));
      expect(life(s, "p1")).toBe(23);
      expect(counters(s, minwu)).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Clerc"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("Moogles' Valor: a 1/2 lifelink Moogle per creature you control, then your creatures become indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 5)], hand: ["Moogles' Valor"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Moogles' Valor"));
      const moogles = idsOf(s, "p1", "battlefield", "Moogle");
      expect(moogles).toHaveLength(2);
      expect(pt(s, moogles[0] as string)).toEqual([1, 2]);
      expect(chars(s, moogles[0] as string).keywords).toEqual(expect.arrayContaining(["lifelink", "indestructible"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
    });
  });

  describe("rares (3)", () => {
    it("Ninja's Blades: +1/+1, Ninja; combat damage to a player: draw, discard, it loses life equal to the discarded card's MV", () => {
      let s = scenario({ p1: { battlefield: ["Ninja's Blades", "Bear Cub"], hand: ["Shivan Dragon"], library: ["Forest"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Ninja's Blades")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).subtypes).toContain("Ninja");
      const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
      s = throughCombat(attack(s, [bear]), answering(true, [dragon]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(life(s, "p2")).toBe(11);
    });

    it("Noctis, Prince of Lucis: lifelink; your artifact spells can be cast from the graveyard for 3 more life, with a finality counter", () => {
      let s = scenario({
        p1: { battlefield: ["Noctis, Prince of Lucis", ...lands("Plains", 3)], graveyard: ["Buster Sword", "Bear Cub"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Noctis, Prince of Lucis")).keywords).toContain("lifelink");
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Bear Cub"))).toBe(false);
      const sword = idOf(s, "p1", "graveyard", "Buster Sword");
      expect(castable(s, "p1", sword)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: sword }));
      expect(life(s, "p1")).toBe(17);
      expect(counters(s, idOf(s, "p1", "battlefield", "Buster Sword"), "finality")).toBe(1);
    });

    it("Raubahn, Bull of Ala Mhigo: when attacking, attaches one of your Equipment to a targeted attacking creature; ward: pay life equal to its power", () => {
      let s = scenario({ p1: { battlefield: ["Raubahn, Bull of Ala Mhigo", "Bear Cub", "Buster Sword"] } });
      const raubahn = idOf(s, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      s = resolve(attack(s, [raubahn, bear]), (req) =>
        req.type === "pick"
          ? req.options.includes(sword)
            ? [sword]
            : req.options.includes(bear)
              ? [bear]
              : undefined
          : undefined,
      );
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      // Ward: the opponent refuses to pay 2 life, its spell is countered.
      const ward = (pay: boolean) => {
        let t = scenario({
          active: "p2",
          p1: { battlefield: ["Raubahn, Bull of Ala Mhigo"] },
          p2: { battlefield: ["Mountain"], hand: ["Burst Lightning"] },
        });
        const r = idOf(t, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo");
        t = resolve(cast(t, "p2", "Burst Lightning", { targets: { t: [r] } }), answering(pay));
        return t;
      };
      const no = ward(false);
      expect(idsOf(no, "p1", "battlefield", "Raubahn, Bull of Ala Mhigo")).toHaveLength(1);
      expect(life(no, "p2")).toBe(20);
      const yes = ward(true);
      expect(idsOf(yes, "p1", "graveyard", "Raubahn, Bull of Ala Mhigo")).toHaveLength(1);
      expect(life(yes, "p2")).toBe(18);
    });

    it("Rosa, Resolute White Mage: reach; at the beginning of your combat, a +1/+1 counter and lifelink on one of your creatures", () => {
      let s = scenario({ p1: { battlefield: ["Rosa, Resolute White Mage", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Rosa, Resolute White Mage")).keywords).toContain("reach");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      let offered: string[] = [];
      s = play(
        s,
        (req) => {
          if (req.type === "pick" && req.options.includes(bear)) {
            offered = req.options;
            return [bear];
          }
          return undefined;
        },
        (x) => x.pending?.kind === "declareAttackers",
      );
      expect(offered).not.toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
    });

    it("Sazh Katzroy: searches for a Bird or a basic land; when attacking, a counter on a targeted creature then doubles its counters", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Sazh Katzroy"], library: ["Bear Cub", "Healer's Hawk", "Forest"] },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Sazh Katzroy"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Healer's Hawk");
      });
      expect(offered.sort()).toEqual(["Forest", "Healer's Hawk"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Healer's Hawk"]);
      let t = scenario({ p1: { battlefield: ["Sazh Katzroy", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Sazh Katzroy")]), answering(true, [bear]));
      expect(counters(t, bear)).toBe(4);
    });

    it("Seifer Almasy: a creature attacking alone has double strike; its damage to a player lets you cast an instant or sorcery with MV 3 or less from the graveyard for free, exiled afterwards", () => {
      let s = scenario({ p1: { battlefield: ["Seifer Almasy"], graveyard: ["Burst Lightning", "Shivan Dragon"] } });
      const seifer = idOf(s, "p1", "battlefield", "Seifer Almasy");
      s = resolve(attack(s, [seifer]));
      expect(chars(s, seifer).keywords).toContain("doubleStrike");
      s = untilCastNow(s);
      const burst = idOf(s, "p1", "graveyard", "Burst Lightning");
      expect(castNowOf(s)?.cards).toEqual([burst]);
      s = resolve(act(s, "p1", { type: "cast", card: burst, targets: { t: ["p2"] } }));
      s = throughCombat(s);
      expect(life(s, "p2")).toBe(12);
      expect(exiled(s, "Burst Lightning")).toHaveLength(1);
      // Two attackers: no double strike.
      let t = scenario({ p1: { battlefield: ["Seifer Almasy", "Bear Cub"] } });
      const s2 = idOf(t, "p1", "battlefield", "Seifer Almasy");
      t = resolve(attack(t, [s2, idOf(t, "p1", "battlefield", "Bear Cub")]));
      expect(chars(t, s2).keywords).not.toContain("doubleStrike");
    });

    it("Serah Farron: the first legendary creature spell of the turn costs {2} less; at combat, with two other legendaries, she can become Crystallized Serah (+2/+2 to legendaries)", () => {
      const SERAH = "Serah Farron // Crystallized Serah";
      let s = scenario({ p1: { battlefield: [SERAH, "Plains", "Plains"], hand: ["Aerith Gainsborough", "Minwu, White Mage"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Aerith Gainsborough"))).toBe(true);
      s = resolve(cast(s, "p1", "Aerith Gainsborough"));
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
      // The second ({3}{W}{W} → no reduction) can't be cast with a Plains.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Minwu, White Mage"))).toBe(false);
      const legend = (n: number) =>
        customCard({ name: `Legend ${n}`, supertypes: ["Legendary"], typeLine: "Legendary Creature", power: 1, toughness: 1 });
      let t = scenario({ p1: { battlefield: [SERAH, legend(1), legend(2), "Bear Cub"] } });
      const serah = idOf(t, "p1", "battlefield", SERAH);
      t = play(t, answering(true), (x) => x.pending?.kind === "declareAttackers");
      expect(chars(t, serah).name).toBe("Crystallized Serah");
      expect(chars(t, serah).types).toEqual(["Artifact"]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Legend 1"))).toEqual([3, 3]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      // Only one other legendary: no transformation.
      let u = scenario({ p1: { battlefield: [SERAH, legend(1)] } });
      u = play(u, answering(true), (x) => x.pending?.kind === "declareAttackers");
      expect(chars(u, idOf(u, "p1", "battlefield", SERAH)).name).not.toBe("Crystallized Serah");
    });

    it("Seymour Flux: at your upkeep, you may pay 1 life to draw and put a counter on him", () => {
      const run = (yes: boolean) => {
        const s = scenario({ active: "p2", turn: 4, p1: { battlefield: ["Seymour Flux"] } });
        return toMain(s, "p1", answering(yes));
      };
      const yes = run(true);
      expect(life(yes, "p1")).toBe(19);
      expect(hand(yes, "p1")).toBe(2);
      expect(counters(yes, idOf(yes, "p1", "battlefield", "Seymour Flux"))).toBe(1);
      const no = run(false);
      expect(life(no, "p1")).toBe(20);
      expect(hand(no, "p1")).toBe(1);
    });

    it("Sin, Spira's Punishment: a permanent card in your graveyard exiled at random becomes a tapped token; a land makes it start over", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", "Island", ...lands("Forest", 5)],
          hand: ["Sin, Spira's Punishment"],
          graveyard: ["Bear Cub", "Opt"],
        },
      });
      s = resolve(cast(s, "p1", "Sin, Spira's Punishment"));
      const token = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[token]?.isToken).toBe(true);
      expect(s.objects[token]?.tapped).toBe(true);
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sin, Spira's Punishment"], graveyard: ["Plains", "Mountain"] } });
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Sin, Spira's Punishment")]));
      expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Mountain")).toHaveLength(1);
      expect(t.players.p1?.graveyard).toHaveLength(0);
    });

    it("Squall, SeeD Mercenary: attacks alone: double strike; damage to a player: a permanent card with MV 3 or less returns from the graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Squall, SeeD Mercenary"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const squall = idOf(s, "p1", "battlefield", "Squall, SeeD Mercenary");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      let offered: string[] = [];
      s = throughCombat(attack(s, [squall]), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) {
          offered = req.options;
          return [bear];
        }
        return undefined;
      });
      expect(offered).not.toContain(idOf(s, "p1", "graveyard", "Shivan Dragon"));
      expect(life(s, "p2")).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Summon: Brynhildr: I exiles the top card, playable during each turn the Saga gets a counter; II: your next creature spell of the turn has haste", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Mountain", "Mountain", "Forest", "Forest"],
          hand: ["Summon: Brynhildr", "Bear Cub"],
          library: ["Burst Lightning", "Forest", "Forest", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Summon: Brynhildr"));
      const burst = exiled(s, "Burst Lightning")[0] as string;
      expect(castable(s, "p1", burst)).toBe(true);
      // Opponent's turn: no counter, not playable.
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "main1",
      );
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", burst)).toBe(false);
      // Your next turn (chapter II): playable again; the Bear Cub cast has haste.
      s = toMain(s, "p1");
      expect(castable(s, "p1", burst)).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    });

    it("Summon: G.F. Cerberus: II copies your next instant or sorcery of the turn, III copies it twice", () => {
      const run = (lore: number) => {
        let s = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: [{ name: "Summon: G.F. Cerberus", counters: { lore } }, "Mountain"], hand: ["Burst Lightning"] },
        });
        s = toMain(s, "p1");
        return resolve(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      };
      expect(life(run(1), "p2")).toBe(16);
      expect(life(run(2), "p2")).toBe(14);
    });

    it("Summon: Leviathan: I returns to hand each creature that is not a Kraken, Leviathan, Merfolk, Octopus or Serpent; ward {2}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Summon: Leviathan"] },
        p2: { battlefield: ["Serra Angel", "Summon: Leviathan"] },
      });
      s = resolve(cast(s, "p1", "Summon: Leviathan"));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Summon: Leviathan")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Summon: Leviathan")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Leviathan")).keywords).toContain("ward");
    });

    it("Summon: Leviathan: II until end of turn, each sea creature that attacks draws a card", () => {
      let s = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Leviathan", counters: { lore: 1 } }, "Bear Cub"] },
      });
      s = toMain(s, "p1");
      const before = hand(s, "p1");
      const lev = idOf(s, "p1", "battlefield", "Summon: Leviathan");
      s = resolve(attack(s, [lev, idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(hand(s, "p1")).toBe(before + 1);
    });

    it("Summon: Primal Odin: I destroys an opposing creature; II: its combat damage makes you lose the game; III: draw two cards, each player loses 2 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Summon: Primal Odin"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Summon: Primal Odin"), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      let t = scenario({ active: "p2", turn: 4, p1: { battlefield: [{ name: "Summon: Primal Odin", counters: { lore: 1 } }] } });
      t = toMain(t, "p1");
      t = throughCombat(attack(t, [idOf(t, "p1", "battlefield", "Summon: Primal Odin")]));
      expect(t.over).toBeTruthy();
      expect(t.players.p2?.lost).toBe(true);
      let u = scenario({ active: "p2", turn: 4, p1: { battlefield: [{ name: "Summon: Primal Odin", counters: { lore: 2 } }] } });
      u = toMain(u, "p1");
      expect(hand(u, "p1")).toBe(3);
      expect(life(u, "p1")).toBe(18);
      expect(life(u, "p2")).toBe(18);
    });

    it("Summon: Titan: I mills five cards; II lands in the graveyard return tapped; III another creature gets +X/+X (X = your lands) and trample", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Summon: Titan"] } });
      s = resolve(cast(s, "p1", "Summon: Titan"));
      expect(s.players.p1?.graveyard).toHaveLength(5);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Titan")).keywords).toEqual(
        expect.arrayContaining(["reach", "trample"]),
      );
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Titan", counters: { lore: 1 } }], graveyard: ["Island", "Plains", "Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(t.objects[idOf(t, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(idsOf(t, "p1", "battlefield", "Plains")).toHaveLength(1);
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      let u = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Titan", counters: { lore: 2 } }, "Bear Cub", ...lands("Forest", 3)] },
      });
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      u = toMain(u, "p1", answering(true, [bear]));
      expect(pt(u, bear)).toEqual([5, 5]);
      expect(chars(u, bear).keywords).toContain("trample");
    });

    it("Summoner's Grimoire: the equipped creature is a Shaman; when attacking, a creature from your hand enters play (an enchantment creature, tapped and attacking)", () => {
      const setup = (card: string) => {
        const s = scenario({ p1: { battlefield: ["Summoner's Grimoire", "Bear Cub"], hand: [card] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s.objects[idOf(s, "p1", "battlefield", "Summoner's Grimoire")]!.attachedTo = bear;
        bump(s);
        return { s, bear };
      };
      const a = setup("Shivan Dragon");
      expect(chars(a.s, a.bear).subtypes).toContain("Shaman");
      const s = resolve(attack(a.s, [a.bear]), (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      expect(s.combat?.attackers.some((x) => x.id === dragon)).toBe(false);
      const b = setup("Summon: Shiva");
      const t = resolve(attack(b.s, [b.bear]), (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      const shiva = idOf(t, "p1", "battlefield", "Summon: Shiva");
      expect(t.objects[shiva]?.tapped).toBe(true);
      expect(t.combat?.attackers.some((x) => x.id === shiva)).toBe(true);
      // A single choice among all the creature cards in hand (enchantments included), and optional.
      const both = (pick: (options: string[], s: S) => string[]) => {
        const c = scenario({
          p1: { battlefield: ["Summoner's Grimoire", "Bear Cub"], hand: ["Shivan Dragon", "Summon: Shiva"] },
        });
        const bear = idOf(c, "p1", "battlefield", "Bear Cub");
        c.objects[idOf(c, "p1", "battlefield", "Summoner's Grimoire")]!.attachedTo = bear;
        bump(c);
        const asked: string[][] = [];
        const end = resolve(attack(c, [bear]), (req, _p, cur) => {
          if (req.type !== "pick") return undefined;
          asked.push(req.options.map(String));
          return pick(req.options.map(String), cur);
        });
        return { end, asked };
      };
      const shivaFirst = both((options, cur) => options.filter((id) => nameOf(cur, id) === "Summon: Shiva"));
      expect(shivaFirst.asked).toHaveLength(1);
      expect(shivaFirst.asked[0]).toHaveLength(2);
      expect(idsOf(shivaFirst.end, "p1", "battlefield", "Summon: Shiva")).toHaveLength(1);
      expect(idsOf(shivaFirst.end, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      const none = both(() => []);
      expect(none.end.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("rares (4)", () => {
    const sorcery = (n: number) =>
      customCard({
        name: `Sorcery ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });
    const tapMana = (s: S, source: string, color: string) => {
      const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === source);
      return act(s, "p1", { type: "tapForMana", source, ability: opt?.type === "tapForMana" ? opt.ability : 0, color } as never);
    };

    it("Tellah, Great Sage: a Hero per noncreature spell; four mana spent: draw two cards; eight: sacrifice it, it deals that much damage to each opponent", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Island", n)], hand: [sorcery(n)] } });
        return resolve(cast(s, "p1", `Sorcery ${n}`));
      };
      const one = run(1);
      expect(idsOf(one, "p1", "battlefield", "Hero")).toHaveLength(1);
      expect(hand(one, "p1")).toBe(0);
      const four = run(4);
      expect(idsOf(four, "p1", "battlefield", "Hero")).toHaveLength(1);
      expect(hand(four, "p1")).toBe(2);
      expect(idsOf(four, "p1", "battlefield", "Tellah, Great Sage")).toHaveLength(1);
      const eight = run(8);
      expect(hand(eight, "p1")).toBe(2);
      expect(idsOf(eight, "p1", "graveyard", "Tellah, Great Sage")).toHaveLength(1);
      expect(life(eight, "p2")).toBe(12);
      // A single triggered ability (not three) above the spell.
      const cast8 = cast(
        scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Island", 8)], hand: [sorcery(8)] } }),
        "p1",
        "Sorcery 8",
      );
      const pending = passAccepting(cast8, (x) => x.triggers.length === 0 && x.pending?.kind === "priority");
      expect(pending.stack.filter((i) => i.kind === "ability")).toHaveLength(1);
      // A creature spell: nothing.
      const c = resolve(
        cast(
          scenario({ p1: { battlefield: ["Tellah, Great Sage", ...lands("Forest", 2)], hand: ["Bear Cub"] } }),
          "p1",
          "Bear Cub",
        ),
      );
      expect(idsOf(c, "p1", "battlefield", "Hero")).toHaveLength(0);
    });

    it("The Earth Crystal: green spells cost {1} less; +1/+1 counters put on your creatures are doubled; {4}{G}{G}, {T}: distribute two counters", () => {
      let s = scenario({ p1: { battlefield: ["The Earth Crystal", "Sazh's Chocobo", "Forest"], hand: ["Bear Cub", "Forest"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Sazh's Chocobo"))).toBe(2);
      let t = scenario({
        p1: { battlefield: ["The Earth Crystal", "Bear Cub", ...lands("Forest", 6)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "The Earth Crystal"), "Distribute", { targets: { t: [bear] } }));
      expect(counters(t, bear)).toBe(4);
      // The opposing creatures: not doubled.
      let v = scenario({
        active: "p2",
        p1: { battlefield: ["The Earth Crystal"] },
        p2: { battlefield: ["Sazh's Chocobo"], hand: ["Forest"] },
      });
      v = resolve(act(v, "p2", { type: "playLand", card: idOf(v, "p2", "hand", "Forest") }));
      expect(counters(v, idOf(v, "p2", "battlefield", "Sazh's Chocobo"))).toBe(1);
    });

    it("The Lunar Whale: flying; after attacking this turn, you may play the top card of your library", () => {
      let s = scenario({ p1: { battlefield: ["The Lunar Whale", "Bear Cub"], library: ["Forest", "Opt"] } });
      const whale = idOf(s, "p1", "battlefield", "The Lunar Whale");
      expect(chars(s, whale).keywords).toContain("flying");
      const top = s.players.p1?.library[0] as string;
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(false);
      s = resolve(activate(s, "p1", whale, "Crew", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = throughCombat(attack(s, [whale]));
      expect(life(s, "p2")).toBe(17);
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === top)).toBe(true);
    });

    it("The Regalia: haste; when attacking, reveals up to one land, put into play tapped, the rest on the bottom", () => {
      let s = scenario({ p1: { battlefield: ["The Regalia", "Bear Cub"], library: ["Opt", "Bear Cub", "Island", "Forest"] } });
      const regalia = idOf(s, "p1", "battlefield", "The Regalia");
      expect(chars(s, regalia).keywords).toContain("haste");
      s = resolve(activate(s, "p1", regalia, "Crew", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      s = resolve(attack(s, [regalia]));
      const island = idOf(s, "p1", "battlefield", "Island");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Forest");
      expect(namesIn(s, s.players.p1?.library.slice(1)).sort()).toEqual(["Bear Cub", "Opt"]);
    });

    it("Tifa Lockhart: trample; whenever a land enters under your control, its power doubles until end of turn", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Tifa Lockhart", counters: { "+1/+1": 2 } }], hand: ["Forest"] } });
      const tifa = idOf(s, "p1", "battlefield", "Tifa Lockhart");
      expect(chars(s, tifa).keywords).toContain("trample");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(pt(s, tifa)).toEqual([6, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, tifa)).toEqual([3, 4]);
    });

    it("Triple Triad: at your upkeep, each player exiles their top card; you play yours for free and those of lower MV", () => {
      const run = (mine: string, theirs: string) => {
        const s = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: ["Triple Triad"], library: [mine, "Forest"] },
          p2: { library: [theirs, "Forest"] },
        });
        return toMain(s, "p1");
      };
      let s = run("Shivan Dragon", "Bear Cub");
      const dragon = exiled(s, "Shivan Dragon")[0] as string;
      const bear = exiled(s, "Bear Cub")[0] as string;
      expect(castable(s, "p1", dragon)).toBe(true);
      expect(castable(s, "p1", bear)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: bear }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      const t = run("Bear Cub", "Shivan Dragon");
      expect(castable(t, "p1", exiled(t, "Bear Cub")[0] as string)).toBe(true);
      expect(castable(t, "p1", exiled(t, "Shivan Dragon")[0] as string)).toBe(false);
    });

    it("Ultima: destroys all artifacts and creatures, then ends the turn", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Buster Sword", ...lands("Plains", 5)], hand: ["Ultima"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      s = resolve(cast(s, "p1", "Ultima"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
      expect(exiled(s, "Ultima")).toHaveLength(1);
      expect(s.turn.active).toBe("p2");
    });

    it("Ultima Weapon: +7/+7; when the equipped creature attacks, destroy a targeted opposing creature", () => {
      let s = scenario({ p1: { battlefield: ["Ultima Weapon", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Ultima Weapon")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([9, 9]);
      s = resolve(attack(s, [bear]), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Ultima, Origin of Oblivion: when attacking, a blight counter: the land loses its types and abilities and produces {C}; your lands tapped for {C} add one more", () => {
      let s = scenario({ p1: { battlefield: ["Ultima, Origin of Oblivion", "Forest"] } });
      const ultima = idOf(s, "p1", "battlefield", "Ultima, Origin of Oblivion");
      expect(chars(s, ultima).keywords).toContain("flying");
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = throughCombat(attack(s, [ultima]), answering(true, [forest]));
      expect(counters(s, forest, "blight")).toBe(1);
      expect(chars(s, forest).subtypes).toEqual([]);
      const opt = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === forest);
      expect(opt?.type === "tapForMana" && opt.colors).toEqual(["C"]);
      expect(tapMana(s, forest, "C").players.p1?.manaPool.C).toBe(2);
      // "As long as this land has a blight counter" (PLAN-D, D8): Ultima gone, the effect stays; without the counter, it
      // cesse.
      destroy(s, ultima);
      expect(chars(s, forest).subtypes).toEqual([]);
      const colors = (x: S) =>
        legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === forest ? a.colors : []));
      expect(colors(s)).toEqual(["C"]);
      changeCounters(s, s.objects[forest]!, "blight", -1);
      expect(chars(s, forest).subtypes).toEqual(["Forest"]);
      expect(colors(s)).toEqual(["G"]);
      const t = scenario({ p1: { battlefield: ["Ultima, Origin of Oblivion", "Capital City"] } });
      const u = tapMana(t, idOf(t, "p1", "battlefield", "Capital City"), "C");
      expect(u.players.p1?.manaPool.C).toBe(2);
    });

    it("Ultimecia, Temporal Threat: on arrival, taps opposing creatures; one of your creatures deals combat damage to a player: draw", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 6)], hand: ["Ultimecia, Temporal Threat"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Ultimecia, Temporal Threat"));
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Vaan, Street Thief: its combat damage exiles the top card of the player's library: cast it or create a Treasure; a spell of another owner: counter on your Scouts", () => {
      let s = scenario({ p1: { battlefield: ["Vaan, Street Thief"] }, p2: { library: ["Opt", "Forest"] } });
      const vaan = idOf(s, "p1", "battlefield", "Vaan, Street Thief");
      s = untilCastNow(attack(s, [vaan]));
      expect(castNowOf(s)?.cards).toEqual(exiled(s, "Opt"));
      s = throughCombat(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Vaan, Street Thief", "Forest", "Forest"] },
        p2: { library: ["Bear Cub", "Forest"] },
      });
      const v2 = idOf(t, "p1", "battlefield", "Vaan, Street Thief");
      t = untilCastNow(attack(t, [v2]));
      t = throughCombat(act(t, "p1", { type: "cast", card: exiled(t, "Bear Cub")[0] as string }));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
      expect(counters(t, v2)).toBe(1);
    });

    it("Venat, Heart of Hydaelyn: a legendary spell draws, once per turn; {7}, {T}: exiles a nonland permanent and transforms", () => {
      const VENAT = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal";
      let s = scenario({
        p1: { battlefield: [VENAT, ...lands("Plains", 7)], hand: ["Aerith Gainsborough", "Rosa, Resolute White Mage"] },
      });
      s = resolve(cast(s, "p1", "Aerith Gainsborough"));
      expect(hand(s, "p1")).toBe(2);
      s = resolve(cast(s, "p1", "Rosa, Resolute White Mage"));
      expect(hand(s, "p1")).toBe(1);
      let t = scenario({ p1: { battlefield: [VENAT, ...lands("Plains", 7)] }, p2: { battlefield: ["Serra Angel", "Forest"] } });
      const venat = idOf(t, "p1", "battlefield", VENAT);
      t = resolve(
        activate(t, "p1", venat, "Hero's Sundering", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }),
      );
      expect(exiled(t, "Serra Angel")).toHaveLength(1);
      expect(chars(t, venat).name).toBe("Hydaelyn, the Mothercrystal");
      expect(chars(t, venat).keywords).toContain("indestructible");
    });

    it("Hydaelyn, the Mothercrystal: at the beginning of combat, a counter and indestructible until your next turn on another creature; legendary: draw", () => {
      const VENAT = "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal";
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: [VENAT, other] } });
        flip(s, idOf(s, "p1", "battlefield", VENAT));
        const id = idOf(s, "p1", "battlefield", other);
        s = play(s, answering(true, [id]), (x) => x.pending?.kind === "declareAttackers");
        return { s, id };
      };
      const { s, id } = run("Bear Cub");
      expect(counters(s, id)).toBe(1);
      expect(chars(s, id).keywords).toContain("indestructible");
      expect(hand(s, "p1")).toBe(0);
      const t = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(t, id).keywords).toContain("indestructible");
      const legend = run("Aerith Gainsborough");
      expect(hand(legend.s, "p1")).toBe(1);
    });

    it("Vincent Valentine: an opposing creature dies: as many counters as its power; Galian Beast (trample, lifelink) returns tapped on its front face when it dies", () => {
      const VINCENT = "Vincent Valentine // Galian Beast";
      let s = scenario({ p1: { battlefield: [VINCENT] }, p2: { battlefield: ["Serra Angel"] } });
      const vincent = idOf(s, "p1", "battlefield", VINCENT);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(counters(s, vincent)).toBe(4);
      s = resolve(attack(s, [vincent]), answering(true));
      expect(chars(s, vincent).name).toBe("Galian Beast");
      expect(chars(s, vincent).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      let t = scenario({ p1: { battlefield: [VINCENT] } });
      flip(t, idOf(t, "p1", "battlefield", VINCENT));
      destroy(t, idOf(t, "p1", "battlefield", VINCENT));
      t = resolve(act(t, "p1", { type: "pass" }));
      const back = idOf(t, "p1", "battlefield", VINCENT);
      expect(t.objects[back]?.tapped).toBe(true);
      expect(chars(t, back).name).not.toBe("Galian Beast");
    });

    it("Xande, Dark Mage: menace; +1/+1 per noncreature nonland card in your graveyard", () => {
      const s = scenario({ p1: { battlefield: ["Xande, Dark Mage"], graveyard: ["Opt", "Buster Sword", "Bear Cub", "Forest"] } });
      const xande = idOf(s, "p1", "battlefield", "Xande, Dark Mage");
      expect(chars(s, xande).keywords).toContain("menace");
      expect(pt(s, xande)).toEqual([5, 5]);
    });

    it("Zanarkand / Lasting Fayth: a 1/1 Hero with a +1/+1 counter per land you control", () => {
      const ZANARKAND = "Zanarkand, Ancient Metropolis // Lasting Fayth";
      let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: [ZANARKAND] } });
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ZANARKAND), face: 1 }));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([7, 7]);
      const town = s.exile.find((id) => s.objects[id]?.onAdventure) as string;
      s = act(s, "p1", { type: "playLand", card: town });
      expect(s.objects[idOf(s, "p1", "battlefield", ZANARKAND)]?.tapped).toBe(true);
    });

    it("Zenos yae Galvus: creatures other than him and the chosen creature get -2/-2; when it leaves, he becomes Shinryu (flying, 8/8)", () => {
      const ZENOS = "Zenos yae Galvus // Shinryu, Transcendent Rival";
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: [ZENOS] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", ZENOS), answering(true, [angel]));
      const zenos = idOf(s, "p1", "battlefield", ZENOS);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(pt(s, zenos)).toEqual([4, 4]);
      destroy(s, angel);
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(chars(s, zenos).name).toBe("Shinryu, Transcendent Rival");
      expect(pt(s, zenos)).toEqual([8, 8]);
      expect(chars(s, zenos).keywords).toContain("flying");
      // The creature is chosen without being targeted: with no opposing creature, the others still get -2/-2.
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: [ZENOS] } });
      t = resolve(cast(t, "p1", ZENOS));
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(chars(t, idOf(t, "p1", "battlefield", ZENOS)).name).not.toBe("Shinryu, Transcendent Rival");
    });

    it("Shinryu: an opponent chosen as it transforms; only that player losing wins the game (four players, PLAN-L L4)", () => {
      const ZENOS = "Zenos yae Galvus // Shinryu, Transcendent Rival";
      let s = scenario({
        players: 4,
        p1: { battlefield: [...lands("Swamp", 5)], hand: [ZENOS] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", ZENOS), answering(true, [angel]));
      destroy(s, angel);
      // The transform: p1 chooses p3 among the opponents.
      let asked: string[] = [];
      s = resolve(act(s, "p1", { type: "pass" }), (req) => {
        if (req.type === "pick" && req.intent === "chooseOnEnter") {
          asked = req.options as string[];
          return ["p3"];
        }
        return undefined;
      });
      expect(asked.sort()).toEqual(["p2", "p3", "p4"]);
      const shinryu = idOf(s, "p1", "battlefield", ZENOS);
      expect(s.objects[shinryu]?.chosen?.player).toBe("p3");
      // p2 loses: nothing. p3 (the chosen one) loses: p1 wins (p4, still in the game, loses with it: 104.2a).
      (s.players.p2 as { life: number }).life = 0;
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(s.players.p2?.lost).toBe(true);
      expect(s.over).toBeFalsy();
      (s.players.p3 as { life: number }).life = 0;
      s = resolve(act(s, s.pending?.kind === "priority" ? s.pending.player : "p1", { type: "pass" }));
      expect(s.over).toBe(true);
      expect(s.winner).toBe("p1");
    });
  });

  /** Index of the mode (or combination of modes) whose label is `label`. */
  const modeOf = (s: S, card: string, label: string) => {
    const mode = castModes(s, card).find((m) => plainText(m.label ?? "") === label);
    if (!mode)
      throw new Error(
        `mode "${label}" not found (${castModes(s, card)
          .map((m) => m.label)
          .join(" | ")})`,
      );
    return mode.index;
  };
  /** Chooses the mode `index` of a modal triggered ability. */
  const triggerMode =
    (index: number, then: Answer = () => undefined): Answer =>
    (req, p, s) =>
      req.intent === "triggerMode" && req.type === "pick" ? [String(index)] : then(req, p, s);

  it("Louisoix's Sacrifice: as an additional cost, sacrifice a legendary creature or pay {2}; counters a noncreature spell or an ability", () => {
    const setup = (mine: (string | { name: string })[]) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: mine, hand: ["Louisoix's Sacrifice"] },
        p2: { battlefield: ["Mountain", "Forest", "Forest"], hand: ["Burst Lightning", "Bear Cub"] },
      });
      s = cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } });
      return act(s, "p2", { type: "pass" });
    };
    // {U} + {2}.
    let s = setup(lands("Island", 3));
    s = resolve(cast(s, "p1", "Louisoix's Sacrifice", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(life(s, "p1")).toBe(20);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped && s.objects[id]?.controller === "p1")).toHaveLength(3);
    // {U} and a sacrificed legendary creature.
    let t = setup(["Island", "Aerith Gainsborough"]);
    const aerith = idOf(t, "p1", "battlefield", "Aerith Gainsborough");
    t = resolve(cast(t, "p1", "Louisoix's Sacrifice", { sacrifice: [aerith], targets: { t: [t.stack[0]?.id as string] } }));
    expect(life(t, "p1")).toBe(20);
    expect(idsOf(t, "p1", "graveyard", "Aerith Gainsborough")).toHaveLength(1);
    // A creature spell isn't a target.
    let u = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Louisoix's Sacrifice"] },
      p2: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
    });
    u = act(cast(u, "p2", "Bear Cub"), "p2", { type: "pass" });
    expect(castable(u, "p1", idOf(u, "p1", "hand", "Louisoix's Sacrifice"))).toBe(false);
  });

  describe("peu communes (1)", () => {
    it("Al Bhed Salvagers: it or another of your creatures or artifacts dies: drain 1; not for an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Al Bhed Salvagers", "Bear Cub", "Buster Sword"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const kill = (id: string) => {
        destroy(s, id);
        s = resolve(act(s, "p1", { type: "pass" }));
      };
      kill(idOf(s, "p1", "battlefield", "Bear Cub"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
      s = toMain(s, "p1");
      kill(idOf(s, "p1", "battlefield", "Buster Sword"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
      kill(idOf(s, "p2", "battlefield", "Bear Cub"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 18]);
      kill(idOf(s, "p1", "battlefield", "Al Bhed Salvagers"));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
    });

    it("Ambrosia Whiteheart: flash; on arrival, you may return another of your permanents (chosen on resolution); land: +1/+0", () => {
      const run = (yes: boolean) => {
        let s = scenario({ active: "p2", p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Ambrosia Whiteheart"] } });
        s = act(s, "p2", { type: "pass" });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = cast(s, "p1", "Ambrosia Whiteheart");
        expect(s.stack[0]?.targets ?? {}).toEqual({});
        return resolve(s, answering(yes, [bear]));
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "hand", "Bear Cub")).toHaveLength(1);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      let s = scenario({ p1: { battlefield: ["Ambrosia Whiteheart"], hand: ["Plains"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Ambrosia Whiteheart"))).toEqual([3, 2]);
    });

    it("Ashe, Princess of Dalmasca: when attacking, an artifact among the top five cards goes to hand, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ashe, Princess of Dalmasca"],
          library: ["Forest", "Buster Sword", "Opt", "Forest", "Bear Cub", "Island"],
        },
      });
      s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Ashe, Princess of Dalmasca")]), (req, _p, cur) =>
        pickNamed(cur, req, "Buster Sword"),
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Buster Sword"]);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Island");
    });

    it("Auron's Inspiration: attacking creatures get +2/+0 until end of turn; flashback {2}{W}{W}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Plains", 3)], hand: ["Auron's Inspiration"] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s = attack(s, [a]);
      s = resolve(cast(s, "p1", "Auron's Inspiration"));
      expect(pt(s, a)).toEqual([4, 2]);
      expect(pt(s, b)).toEqual([2, 2]);
      const t = scenario({ p1: { battlefield: lands("Plains", 4), graveyard: ["Auron's Inspiration"] } });
      expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Auron's Inspiration"))).toBe(true);
    });

    it("Barret Wallace: reach; when attacking, it deals the defender as much damage as you have equipped creatures", () => {
      let s = scenario({ p1: { battlefield: ["Barret Wallace", "Bear Cub", "Bear Cub", "Buster Sword", "Genji Glove"] } });
      const [a, b] = idsOf(s, "p1", "battlefield", "Bear Cub") as [string, string];
      s.objects[idOf(s, "p1", "battlefield", "Buster Sword")]!.attachedTo = a;
      s.objects[idOf(s, "p1", "battlefield", "Genji Glove")]!.attachedTo = b;
      bump(s);
      const barret = idOf(s, "p1", "battlefield", "Barret Wallace");
      expect(chars(s, barret).keywords).toContain("reach");
      s = resolve(attack(s, [barret]));
      expect(life(s, "p2")).toBe(18);
    });

    it("Battle Menu: one of four modes; 'Magic' only targets a creature with power 4 or greater", () => {
      const s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Battle Menu"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Battle Menu");
      const magic = castModes(s, card).find((m) => m.label?.startsWith("Magic"));
      expect(magic?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      const knight = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Attack: 2/2 Knight") }));
      expect(idsOf(knight, "p1", "battlefield", "Knight")).toHaveLength(1);
      const item = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Item: +4 life") }));
      expect(life(item, "p1")).toBe(24);
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const ability = resolve(
        act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Ability: +0/+4"), targets: { t: [bear] } }),
      );
      expect(pt(ability, bear)).toEqual([2, 6]);
    });

    it("Cactuar: trample; at your end step, it returns to hand if it didn't arrive this turn", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Cactuar"] } });
      s = resolve(cast(s, "p1", "Cactuar"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Cactuar")).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Cactuar")).toHaveLength(1);
      const t = advanceUntil(scenario({ p1: { battlefield: ["Cactuar"] } }), (x) => x.turn.active === "p2");
      expect(idsOf(t, "p1", "hand", "Cactuar")).toHaveLength(1);
    });

    it("Cargo Ship: flying, vigilance; its {C} only pays for artifact spells and artifact abilities", () => {
      const s = scenario({ p1: { battlefield: ["Cargo Ship", "Forest", "Forest"], hand: ["Buster Sword", "Shivan Dragon"] } });
      const ship = idOf(s, "p1", "battlefield", "Cargo Ship");
      expect(chars(s, ship).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Buster Sword"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Cargo Ship", "Forest"], hand: ["Bear Cub"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Choco-Comet: X damage to any target, and a 2/2 Bird that gets +1/+0 for each land", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Choco-Comet", "Forest"] } });
      s = resolve(cast(s, "p1", "Choco-Comet", { x: 3, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(17);
      const bird = idOf(s, "p1", "battlefield", "Bird");
      expect(pt(s, bird)).toEqual([2, 2]);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(pt(s, bird)).toEqual([3, 2]);
    });

    it("Chocobo Racetrack: whenever a land enters under your control, a 2/2 Bird", () => {
      let s = scenario({ p1: { battlefield: ["Chocobo Racetrack"], hand: ["Forest"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const birds = idsOf(s, "p1", "battlefield", "Bird");
      expect(birds).toHaveLength(1);
      expect(chars(s, birds[0] as string).colors).toEqual(["G"]);
    });

    it("Cid, Timeless Artificer: your artifact creatures and Heroes get +1/+1 per Artificer you control and per Artificer card in your graveyard", () => {
      const s = scenario({
        p1: { battlefield: ["Cid, Timeless Artificer", "Demon Wall", "Bear Cub"], graveyard: ["Al Bhed Salvagers", "Bear Cub"] },
        p2: { battlefield: ["Demon Wall"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Demon Wall"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Cid, Timeless Artificer"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Demon Wall"))).toEqual([3, 3]);
    });

    it("Circle of Power: draw two cards, lose 2 life, a 0/1 Wizard that damages opponents with each noncreature spell; your Wizards +1/+0 and lifelink", () => {
      const mage = customCard({ name: "Mage", subtypes: ["Human", "Wizard"], power: 2, toughness: 1 });
      let s = scenario({ p1: { battlefield: [mage, ...lands("Swamp", 4), "Island"], hand: ["Circle of Power", "Opt"] } });
      s = resolve(cast(s, "p1", "Circle of Power"));
      expect(hand(s, "p1")).toBe(3);
      expect(life(s, "p1")).toBe(18);
      const wizard = idOf(s, "p1", "battlefield", "Wizard");
      expect(pt(s, wizard)).toEqual([1, 1]);
      expect(chars(s, wizard).keywords).toContain("lifelink");
      expect(pt(s, idOf(s, "p1", "battlefield", "Mage"))).toEqual([3, 1]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Mage")).keywords).toContain("lifelink");
      s = resolve(cast(s, "p1", "Opt"));
      expect(life(s, "p2")).toBe(19);
      expect(life(s, "p1")).toBe(19);
    });

    it("Clash of the Eikons: one or more modes; combat, or a lore counter removed or added on your Saga", () => {
      let s = scenario({
        p1: {
          battlefield: ["Shivan Dragon", { name: "Summon: Shiva", counters: { lore: 1 } }, "Forest"],
          hand: ["Clash of the Eikons"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Clash of the Eikons");
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const shiva = idOf(s, "p1", "battlefield", "Summon: Shiva");
      s = resolve(
        act(s, "p1", {
          type: "cast",
          card,
          mode: modeOf(s, card, "Fight + Put a lore counter"),
          targets: { a: [dragon], b: [angel], l: [shiva] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[shiva]?.counters.lore).toBe(2);
      let t = scenario({
        p1: { battlefield: [{ name: "Summon: Shiva", counters: { lore: 2 } }, "Forest"], hand: ["Clash of the Eikons"] },
      });
      const c2 = idOf(t, "p1", "hand", "Clash of the Eikons");
      const s2 = idOf(t, "p1", "battlefield", "Summon: Shiva");
      t = resolve(act(t, "p1", { type: "cast", card: c2, mode: modeOf(t, c2, "Remove a lore counter"), targets: { r: [s2] } }));
      expect(t.objects[s2]?.counters.lore).toBe(1);
    });

    it("Cloud of Darkness: flying; on arrival, a targeted opposing creature gets -X/-X, X being the number of permanent cards in your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swamp", ...lands("Forest", 4)],
          hand: ["Cloud of Darkness"],
          graveyard: ["Forest", "Bear Cub", "Opt"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Cloud of Darkness"), answering(true, [angel]));
      expect(pt(s, angel)).toEqual([2, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Cloud of Darkness")).keywords).toContain("flying");
    });

    it("Coliseum Behemoth: trample; on arrival, destroy an artifact or enchantment, or draw a card", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Forest", 7), hand: ["Coliseum Behemoth"] },
          p2: { battlefield: ["Buster Sword", "Bear Cub"] },
        });
      let s = setup();
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      s = resolve(cast(s, "p1", "Coliseum Behemoth"), triggerMode(0, answering(true, [sword])));
      expect(idsOf(s, "p2", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Coliseum Behemoth")).keywords).toContain("trample");
      const t = resolve(cast(setup(), "p1", "Coliseum Behemoth"), triggerMode(1));
      expect(hand(t, "p1")).toBe(1);
      expect(idsOf(t, "p2", "battlefield", "Buster Sword")).toHaveLength(1);
    });

    it("Coral Sword: flash; on arrival, attaches to one of your creatures that gains first strike this turn; +1/+0", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Coral Sword"] } });
      s = act(s, "p2", { type: "pass" });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Coral Sword"), answering(true, [bear]));
      expect(s.objects[idOf(s, "p1", "battlefield", "Coral Sword")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p1");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("Crystal Fragments: +1/+1; becomes Summon: Alexander: I prevents damage to your creatures this turn; III taps opposing creatures", () => {
      const CF = "Crystal Fragments // Summon: Alexander";
      let s = scenario({ p1: { battlefield: [CF, "Bear Cub", ...lands("Plains", 7), "Mountain"], hand: ["Burst Lightning"] } });
      const frag = idOf(s, "p1", "battlefield", CF);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[frag]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      s = resolve(activate(s, "p1", frag, "Exile it"));
      const alex = idOf(s, "p1", "battlefield", CF);
      expect(chars(s, alex).name).toBe("Summon: Alexander");
      expect(chars(s, alex).keywords).toContain("flying");
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.damage ?? 0).toBe(0);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: CF, counters: { lore: 2 } }] },
        p2: { battlefield: ["Bear Cub"] },
      });
      flip(t, idOf(t, "p1", "battlefield", CF));
      t = toMain(t, "p1");
      expect(t.objects[idOf(t, "p2", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Dark Knight's Greatsword: +3/+0 and Knight; Equip by paying 3 life, once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Dark Knight's Greatsword"] } });
      s = resolve(cast(s, "p1", "Dark Knight's Greatsword"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([4, 1]);
      expect(chars(s, hero).subtypes).toContain("Knight");
      const sword = idOf(s, "p1", "battlefield", "Dark Knight's Greatsword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", sword, "Equip", { targets: { t: [bear] } }));
      expect(life(s, "p1")).toBe(17);
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(canUse(s, "p1", sword, "Equip")).toBe(false);
    });

    it("Delivery Moogle: flying; searches your library and/or graveyard for an artifact card with MV 2 or less", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Delivery Moogle"], graveyard: ["Coral Sword", "Buster Sword"] },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Delivery Moogle"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Coral Sword");
      });
      expect(offered).toEqual(["Coral Sword"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Coral Sword"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Delivery Moogle")).keywords).toContain("flying");
      let t = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Delivery Moogle"], library: ["Buster Sword", "Cargo Ship", "Forest"] },
      });
      t = resolve(cast(t, "p1", "Delivery Moogle"), (req, _p, cur) => pickNamed(cur, req, "Cargo Ship"));
      expect(namesIn(t, t.players.p1?.hand)).toEqual(["Cargo Ship"]);
    });

    it("Demon Wall: defender and menace; {5}{B}: two +1/+1 counters, and with a counter it can attack", () => {
      let s = scenario({ p1: { battlefield: ["Demon Wall", ...lands("Swamp", 6)] } });
      const wall = idOf(s, "p1", "battlefield", "Demon Wall");
      expect(chars(s, wall).keywords).toEqual(expect.arrayContaining(["defender", "menace"]));
      s = resolve(activate(s, "p1", wall, "Two +1/+1 counters"));
      expect(pt(s, wall)).toEqual([5, 5]);
      expect(chars(s, wall).keywords).not.toContain("defender");
      s = throughCombat(attack(s, [wall]));
      expect(life(s, "p2")).toBe(15);
      // 'A counter': any type of counter, not only +1/+1.
      const t = scenario({ p1: { battlefield: [{ name: "Demon Wall", counters: { oil: 1 } }] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Demon Wall")).keywords).not.toContain("defender");
    });

    it("Diamond Weapon: costs {1} less per permanent card in your graveyard; reach; combat damage that would be dealt to it is prevented", () => {
      // Three permanent cards (the instant doesn't count): {4}{G}{G}, not with five Forests.
      const s = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Diamond Weapon"],
          graveyard: ["Forest", "Bear Cub", "Buster Sword", "Opt"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Diamond Weapon"))).toBe(false);
      const t = scenario({
        p1: {
          battlefield: lands("Forest", 5),
          hand: ["Diamond Weapon"],
          graveyard: ["Forest", "Bear Cub", "Buster Sword", "Serra Angel"],
        },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Diamond Weapon"))).toBe(true);
      let u = scenario({ p1: { battlefield: ["Diamond Weapon"] }, p2: { battlefield: ["Shivan Dragon"] } });
      const weapon = idOf(u, "p1", "battlefield", "Diamond Weapon");
      expect(chars(u, weapon).keywords).toContain("reach");
      u = attack(u, [weapon]);
      u = passAccepting(u, (x) => x.pending?.kind === "declareBlockers");
      u = act(u, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(u, "p2", "battlefield", "Shivan Dragon"), attacker: weapon }],
      });
      u = throughCombat(u);
      expect(u.objects[weapon]?.damage ?? 0).toBe(0);
      expect(idsOf(u, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Dragoon's Lance: +1/+0 and Knight; the equipped creature flies during your turn", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Dragoon's Lance"] } });
      s = resolve(cast(s, "p1", "Dragoon's Lance"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([2, 1]);
      expect(chars(s, hero).subtypes).toContain("Knight");
      expect(chars(s, hero).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, hero).keywords).not.toContain("flying");
    });

    it("Eden, Seat of the Sanctum: {5}, {T}: mill two cards; you may sacrifice it to return another permanent card from the graveyard to hand", () => {
      let s = scenario({
        p1: {
          battlefield: ["Eden, Seat of the Sanctum", ...lands("Plains", 5)],
          library: ["Shivan Dragon", "Bear Cub", "Forest"],
        },
      });
      const eden = idOf(s, "p1", "battlefield", "Eden, Seat of the Sanctum");
      let offered: string[] = [];
      s = resolve(activate(s, "p1", eden, "Mill"), (req, _p, cur) => {
        if (req.type === "yesNo") return [1];
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return pickNamed(cur, req, "Shivan Dragon");
      });
      // Eden, sacrificed, is not a target.
      expect(offered.sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Shivan Dragon"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Eden, Seat of the Sanctum"]);
    });

    it("Eject: can't be countered; returns a nonland permanent to hand, draw a card", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Eject"] },
        p2: { battlefield: ["Serra Angel", ...lands("Island", 3)], hand: ["Louisoix's Sacrifice"] },
      });
      s = cast(s, "p1", "Eject", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
      s = act(s, "p1", { type: "pass" });
      s = resolve(cast(s, "p2", "Louisoix's Sacrifice", { targets: { t: [s.stack[0]?.id as string] } }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      expect(hand(s, "p1")).toBe(1);
    });

    it("Elixir: enters tapped; {5}, {T}, exile: nonland cards from the graveyard go to the library, you gain that much life", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Elixir"] } });
      s = resolve(cast(s, "p1", "Elixir"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Elixir")]?.tapped).toBe(true);
      let t = scenario({
        p1: { battlefield: ["Elixir", ...lands("Plains", 5)], graveyard: ["Opt", "Bear Cub", "Forest"], library: [] },
      });
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Elixir")));
      expect(life(t, "p1")).toBe(22);
      expect(namesIn(t, t.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(exiled(t, "Elixir")).toHaveLength(1);
    });

    it("Ether: {T}, exile: {U}, and your next instant or sorcery of the turn is copied", () => {
      let s = scenario({ p1: { battlefield: ["Ether"], hand: ["Opt"] } });
      // Mana ability: it resolves without using the stack.
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Ether"));
      expect(s.players.p1?.manaPool.U).toBe(1);
      expect(exiled(s, "Ether")).toHaveLength(1);
      s = resolve(cast(s, "p1", "Opt"));
      expect(hand(s, "p1")).toBe(2);
    });

    it("Evil Reawakened: a creature card from your graveyard returns with two additional +1/+1 counters", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Evil Reawakened"], graveyard: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", "Evil Reawakened", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 4]);
    });

    it("Exdeath, Void Warlock: +3 life on arrival; at your end step, with six permanent cards in the graveyard, it becomes Neo Exdeath (power = those cards, trample)", () => {
      const EX = "Exdeath, Void Warlock // Neo Exdeath, Dimension's End";
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: [EX] } });
      s = resolve(cast(s, "p1", EX));
      expect(life(s, "p1")).toBe(23);
      const run = (n: number) => {
        const t = scenario({ p1: { battlefield: [EX], graveyard: [...lands("Forest", n), "Opt"] } });
        const ex = idOf(t, "p1", "battlefield", EX);
        return { t: advanceUntil(t, (x) => x.turn.active === "p2"), ex };
      };
      const six = run(6);
      expect(chars(six.t, six.ex).name).toBe("Neo Exdeath, Dimension's End");
      expect(pt(six.t, six.ex)).toEqual([6, 3]);
      expect(chars(six.t, six.ex).keywords).toContain("trample");
      const five = run(5);
      expect(chars(five.t, five.ex).name).not.toBe("Neo Exdeath, Dimension's End");
    });
  });

  describe("peu communes (2)", () => {
    const sorceryOf = (n: number) =>
      customCard({
        name: `Rituel ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });

    it("Freya Crescent: flies during your turn; its {R} pays for an Equipment spell, not another spell", () => {
      const s = scenario({ p1: { battlefield: ["Freya Crescent", "Mountain", "Mountain"], hand: ["Buster Sword"] } });
      const freya = idOf(s, "p1", "battlefield", "Freya Crescent");
      expect(chars(s, freya).keywords).toContain("flying");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Buster Sword"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Freya Crescent", "Forest"], hand: ["Bear Cub"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
      const u = scenario({ active: "p2", p1: { battlefield: ["Freya Crescent"] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Freya Crescent")).keywords).not.toContain("flying");
    });

    it("Freya Crescent: its {R} pays 'Equip', not another ability of an Equipment", () => {
      const s = scenario({ p1: { battlefield: ["Freya Crescent", "Shadowspear", "Bear Cub"] } });
      // Shadowspear: '{1}: …' can't be paid with Freya's mana (and Equip {2} requires one more mana).
      const spear = idOf(s, "p1", "battlefield", "Shadowspear");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === spear)).toBe(false);
      let t = scenario({ p1: { battlefield: ["Freya Crescent", "Shadowspear", "Bear Cub", "Mountain"] } });
      const tSpear = idOf(t, "p1", "battlefield", "Shadowspear");
      const cub = idOf(t, "p1", "battlefield", "Bear Cub");
      const options = legalActions(t, "p1").filter((a) => a.type === "activate" && a.source === tSpear);
      const equip = options.find((a) => a.type === "activate" && /Equip/.test(a.label ?? ""));
      expect(equip?.type).toBe("activate");
      t = settle(
        act(t, "p1", {
          type: "activate",
          source: tSpear,
          ability: equip?.type === "activate" ? equip.ability : -1,
          targets: { t: [cub] },
        }),
      );
      expect(t.objects[tSpear]?.attachedTo).toBe(cub);
      expect(t.objects[idOf(t, "p1", "battlefield", "Freya Crescent")]?.tapped).toBe(true);
    });

    it("G'raha Tia: reach; other creatures or artifacts of yours die: draw, once per turn", () => {
      let s = scenario({ p1: { battlefield: ["G'raha Tia", "Bear Cub", "Buster Sword"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "G'raha Tia")).keywords).toContain("reach");
      destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(0);
      s = structuredClone(s);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(1);
      s = structuredClone(s);
      destroy(s, idOf(s, "p1", "battlefield", "Buster Sword"));
      s = resolve(act(s, "p1", { type: "pass" }));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Gaius van Baelsar: each player sacrifices a creature token, a nontoken creature or an enchantment, depending on the mode", () => {
      const charm = customCard({ name: "Charme", typeLine: "Enchantment", types: ["Enchantment"] });
      const setup = () => {
        const s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), charm], hand: ["Gaius van Baelsar"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel", charm] },
        });
        // The opposing Bear Cub stands in for a creature token.
        s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]!.isToken = true;
        return s;
      };
      const a = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(1));
      expect(idsOf(a, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(a, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(a, "p1", "graveyard", "Gaius van Baelsar")).toHaveLength(1);
      const b = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(2));
      expect(idsOf(b, "p1", "graveyard", "Charme")).toHaveLength(1);
      expect(idsOf(b, "p2", "graveyard", "Charme")).toHaveLength(1);
      expect(idsOf(b, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      const c = resolve(cast(setup(), "p1", "Gaius van Baelsar"), triggerMode(0));
      expect(idsOf(c, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(idsOf(c, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(c, "p1", "battlefield", "Gaius van Baelsar")).toHaveLength(1);
    });

    it("Galuf's Final Act: +1/+0 until end of turn, and when it dies, as many counters as its power on up to one targeted creature", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Serra Angel", "Forest", "Forest"], hand: ["Galuf's Final Act"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Galuf's Final Act", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      destroy(s, bear);
      s = resolve(act(s, "p1", { type: "pass" }), answering(true, [angel]));
      expect(counters(s, angel)).toBe(3);
    });

    it("Garland: surveil 1 on each noncreature spell; from the graveyard, returns transformed into Chaos (flying), which goes to the bottom of the library when it dies", () => {
      const GARLAND = "Garland, Knight of Cornelia // Chaos, the Endless";
      let s = scenario({ p1: { battlefield: [GARLAND, "Island"], hand: ["Opt"], library: ["Forest", "Island", "Bear Cub"] } });
      let surveils = 0;
      s = resolve(cast(s, "p1", "Opt"), (req) => {
        if (req.intent === "surveilGraveyard") surveils++;
        return undefined;
      });
      expect(surveils).toBe(1);
      let t = scenario({ p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 4)], graveyard: [GARLAND] } });
      const card = idOf(t, "p1", "graveyard", GARLAND);
      t = resolve(activate(t, "p1", card));
      const chaos = idOf(t, "p1", "battlefield", GARLAND);
      expect(chars(t, chaos).name).toBe("Chaos, the Endless");
      expect(chars(t, chaos).keywords).toContain("flying");
      destroy(t, chaos);
      t = resolve(act(t, "p1", { type: "pass" }));
      expect(namesIn(t, t.players.p1?.library).at(-1)).toBe(GARLAND);
    });

    it("Garnet, Princess of Alexandria: lifelink; when attacking, remove lore counters from your Sagas for as many +1/+1 counters", () => {
      let s = scenario({
        p1: { battlefield: ["Garnet, Princess of Alexandria", { name: "Summon: Shiva", counters: { lore: 2 } }] },
      });
      const garnet = idOf(s, "p1", "battlefield", "Garnet, Princess of Alexandria");
      expect(chars(s, garnet).keywords).toContain("lifelink");
      s = resolve(attack(s, [garnet]), answering(true));
      expect(counters(s, garnet)).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Summon: Shiva")]?.counters.lore).toBe(1);
    });

    it("Garnet: the Sagas are chosen one by one ('from each, any number')", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Garnet, Princess of Alexandria",
            { name: "Summon: Shiva", counters: { lore: 2 } },
            { name: "Summon: Shiva", counters: { lore: 1 } },
          ],
        },
      });
      const garnet = idOf(s, "p1", "battlefield", "Garnet, Princess of Alexandria");
      const [a, b] = idsOf(s, "p1", "battlefield", "Summon: Shiva") as [string, string];
      let options: string[] = [];
      s = resolve(attack(s, [garnet]), (req) => {
        if (req.type !== "pick") return undefined;
        options = req.options.map(String);
        return [a];
      });
      expect(options.sort()).toEqual([a, b].sort());
      expect(counters(s, garnet)).toBe(1);
      expect(s.objects[a]?.counters.lore).toBe(1);
      expect(s.objects[b]?.counters.lore).toBe(1);
    });

    it("Giott, King of the Dwarves: double strike; a Dwarf or an Equipment enters: you may discard to draw", () => {
      let s = scenario({
        p1: { battlefield: ["Giott, King of the Dwarves", "Mountain"], hand: ["Coral Sword", "Forest"], library: ["Opt"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Giott, King of the Dwarves")).keywords).toContain("doubleStrike");
      const forest = idOf(s, "p1", "hand", "Forest");
      s = resolve(
        cast(s, "p1", "Coral Sword"),
        answering(true, [forest, idOf(s, "p1", "battlefield", "Giott, King of the Dwarves")]),
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      let t = scenario({ p1: { battlefield: ["Giott, King of the Dwarves", "Forest", "Forest"], hand: ["Bear Cub", "Forest"] } });
      let asked = false;
      t = resolve(cast(t, "p1", "Bear Cub"), (req) => {
        if (req.type === "yesNo") asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
    });

    it("Gladiolus Amicitia: searches for a land put into play tapped; for each land, another of your creatures gets +2/+2 and trample", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 4), "Mountain", "Mountain"],
          hand: ["Gladiolus Amicitia"],
          library: ["Bear Cub", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Gladiolus Amicitia"), (req, p, cur) =>
        pickNamed(cur, req, "Island")?.length ? pickNamed(cur, req, "Island") : answering(true, [bear])(req, p, cur),
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, idOf(s, "p1", "battlefield", "Gladiolus Amicitia"))).toEqual([6, 6]);
    });

    it("Ignis Scientia: a land among the top six into play tapped; {1}{G}{U}, {T}: exile a card from a graveyard, a Food if it was a creature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forest", "Forest", "Island"],
          hand: ["Ignis Scientia"],
          library: ["Opt", "Bear Cub", "Island", "Forest", "Opt", "Opt", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Ignis Scientia"), (req, _p, cur) => pickNamed(cur, req, "Island"));
      // The Island paid for the spell and the one put into play, tapped.
      expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => s.objects[id]?.tapped)).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Forest");
      let t = scenario({
        p1: { battlefield: ["Ignis Scientia", "Forest", "Forest", "Island"] },
        p2: { graveyard: ["Bear Cub", "Opt"] },
      });
      const ignis = idOf(t, "p1", "battlefield", "Ignis Scientia");
      t = resolve(activate(t, "p1", ignis, "Exile", { targets: { t: [idOf(t, "p2", "graveyard", "Bear Cub")] } }));
      expect(exiled(t, "Bear Cub")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
      let u = scenario({ p1: { battlefield: ["Ignis Scientia", "Forest", "Forest", "Island"] }, p2: { graveyard: ["Opt"] } });
      u = resolve(
        activate(u, "p1", idOf(u, "p1", "battlefield", "Ignis Scientia"), "Exile", {
          targets: { t: [idOf(u, "p2", "graveyard", "Opt")] },
        }),
      );
      expect(idsOf(u, "p1", "battlefield", "Food")).toHaveLength(0);
    });

    it("Il Mheg Pixie: flying; surveil 1 when attacking", () => {
      let s = scenario({ p1: { battlefield: ["Il Mheg Pixie"], library: ["Forest", "Opt"] } });
      const pixie = idOf(s, "p1", "battlefield", "Il Mheg Pixie");
      expect(chars(s, pixie).keywords).toContain("flying");
      const top = s.players.p1?.library[0] as string;
      s = resolve(attack(s, [pixie]), (req) => (req.type === "pick" && req.options.includes(top) ? [top] : undefined));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Judge Magister Gabranth: menace; a counter whenever another of your creatures or one of your artifacts dies", () => {
      let s = scenario({
        p1: { battlefield: ["Judge Magister Gabranth", "Bear Cub", "Buster Sword"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const judge = idOf(s, "p1", "battlefield", "Judge Magister Gabranth");
      expect(chars(s, judge).keywords).toContain("menace");
      for (const [p, name] of [
        ["p1", "Bear Cub"],
        ["p1", "Buster Sword"],
        ["p2", "Bear Cub"],
      ] as const) {
        s = structuredClone(s);
        destroy(s, idOf(s, p, "battlefield", name));
        s = resolve(act(s, "p1", { type: "pass" }));
      }
      expect(counters(s, judge)).toBe(2);
    });

    it("Lion Heart: 2 damage to any target on arrival; +2/+1", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Lion Heart"] } });
      s = resolve(cast(s, "p1", "Lion Heart"), (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(life(s, "p2")).toBe(18);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Lion Heart")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([4, 3]);
    });

    it("Locke Cole: deathtouch, lifelink; combat damage to a player: draw, then discard", () => {
      let s = scenario({ p1: { battlefield: ["Locke Cole"], hand: ["Forest"], library: ["Opt"] } });
      const locke = idOf(s, "p1", "battlefield", "Locke Cole");
      expect(chars(s, locke).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      const forest = idOf(s, "p1", "hand", "Forest");
      s = throughCombat(attack(s, [locke]), answering(true, [forest]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(life(s, "p1")).toBe(22);
    });

    it("Magitek Armor: a 1/1 Hero on arrival; Crew 1", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Magitek Armor"] } });
      s = resolve(cast(s, "p1", "Magitek Armor"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      const armor = idOf(s, "p1", "battlefield", "Magitek Armor");
      s = resolve(activate(s, "p1", armor, "Crew", { tap: [hero] }));
      expect(chars(s, armor).types).toContain("Creature");
    });

    it("Omega, Heartless Evolution: taps up to one nonland permanent per opponent, X stun counters and X life (X = your nonbasic lands)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Capital City", "Adventurer's Inn", ...lands("Forest", 4), "Island"],
          hand: ["Omega, Heartless Evolution"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Omega, Heartless Evolution"), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(2);
      expect(life(s, "p1")).toBe(22);
    });

    it("Opera Love Song: exiles the top two cards, playable until your next end step; or one or two creatures +2/+0", () => {
      const s = scenario({
        p1: {
          battlefield: ["Mountain", "Mountain", "Bear Cub", "Bear Cub"],
          hand: ["Opera Love Song"],
          library: ["Forest", "Opt", "Island"],
        },
      });
      const card = idOf(s, "p1", "hand", "Opera Love Song");
      let a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Exile the top two cards, playable") }));
      const forest = exiled(a, "Forest")[0] as string;
      expect(exiled(a, "Opt")).toHaveLength(1);
      expect(legalActions(a, "p1").some((x) => x.type === "playLand" && x.card === forest)).toBe(true);
      a = advanceUntil(a, (x) => x.turn.active === "p2");
      a = advanceUntil(a, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(legalActions(a, "p1").some((x) => x.type === "playLand" && x.card === forest)).toBe(false);
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      const b = resolve(
        act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "One or two creatures get +2/+0"), targets: { t: bears } }),
      );
      expect(bears.map((id) => pt(b, id))).toEqual([
        [4, 2],
        [4, 2],
      ]);
    });

    it("Overkill: the targeted creature gets -0/-9999 until end of turn", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Overkill"] }, p2: { battlefield: ["Serra Angel"] } });
      s = resolve(cast(s, "p1", "Overkill", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Phantom Train: trample; sacrifice another artifact or creature: a counter, and it becomes a Spirit artifact creature until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Phantom Train", "Bear Cub"] } });
      const train = idOf(s, "p1", "battlefield", "Phantom Train");
      expect(chars(s, train).types).not.toContain("Creature");
      s = resolve(activate(s, "p1", train, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(chars(s, train).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, train).subtypes).toContain("Spirit");
      expect(chars(s, train).keywords).toContain("trample");
      expect(pt(s, train)).toEqual([5, 5]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, train).types).not.toContain("Creature");
    });

    it("Phoenix Down: {1}{W}, {T}, exile: a creature with MV 4 or less returns tapped, or a Skeleton, Spirit or Zombie is exiled", () => {
      let s = scenario({ p1: { battlefield: ["Phoenix Down", "Plains", "Plains"], graveyard: ["Bear Cub", "Shivan Dragon"] } });
      const down = idOf(s, "p1", "battlefield", "Phoenix Down");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === down && a.label?.startsWith("Return"));
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([idOf(s, "p1", "graveyard", "Bear Cub")]);
      s = resolve(activate(s, "p1", down, "Return", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
      expect(exiled(s, "Phoenix Down")).toHaveLength(1);
      const zombie = customCard({ name: "Zombie", subtypes: ["Zombie"], power: 2, toughness: 2 });
      let t = scenario({ p1: { battlefield: ["Phoenix Down", "Plains", "Plains"] }, p2: { battlefield: [zombie, "Bear Cub"] } });
      const td = idOf(t, "p1", "battlefield", "Phoenix Down");
      const o2 = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === td && a.label?.startsWith("Exile"));
      expect(o2?.type === "activate" && o2.targets[0]?.legal).toEqual([idOf(t, "p2", "battlefield", "Zombie")]);
      t = resolve(activate(t, "p1", td, "Exile", { targets: { t: [idOf(t, "p2", "battlefield", "Zombie")] } }));
      expect(exiled(t, "Zombie")).toHaveLength(1);
    });

    it("Poison the Waters: all creatures -1/-1; or the targeted player reveals their hand and discards the artifact or creature you choose", () => {
      const s = scenario({
        p1: { battlefield: ["Swamp", "Swamp", "Llanowar Elves"], hand: ["Poison the Waters"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Bear Cub", "Buster Sword"] },
      });
      const card = idOf(s, "p1", "hand", "Poison the Waters");
      const a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "All creatures get -1/-1") }));
      expect(idsOf(a, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(pt(a, idOf(a, "p2", "battlefield", "Bear Cub"))).toEqual([1, 1]);
      let chooser = "";
      let offered: string[] = [];
      const b = resolve(
        act(s, "p1", {
          type: "cast",
          card,
          mode: modeOf(s, card, "Discard an artifact or creature"),
          targets: { t: ["p2"] },
        }),
        (req, p, cur) => {
          if (req.type !== "pick") return undefined;
          chooser = p;
          offered = namesIn(cur, req.options) as string[];
          return pickNamed(cur, req, "Buster Sword");
        },
      );
      expect(chooser).toBe("p1");
      expect(offered.sort()).toEqual(["Bear Cub", "Buster Sword"]);
      expect(namesIn(b, b.players.p2?.graveyard)).toEqual(["Buster Sword"]);
    });

    it("Prompto Argentum: haste; a Treasure for each noncreature spell paid with at least four mana", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["Prompto Argentum", ...lands("Mountain", n)], hand: [sorceryOf(n)] } });
        return resolve(cast(s, "p1", `Rituel ${n}`));
      };
      expect(idsOf(run(4), "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(idsOf(run(3), "p1", "battlefield", "Treasure")).toHaveLength(0);
      const s = scenario({ p1: { battlefield: ["Prompto Argentum"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Prompto Argentum")).keywords).toContain("haste");
    });

    it("Queen Brahne: prowess; when attacking, a 0/1 Wizard that damages opponents with each noncreature spell", () => {
      let s = scenario({ p1: { battlefield: ["Queen Brahne", "Mountain"], hand: ["Burst Lightning"] } });
      const queen = idOf(s, "p1", "battlefield", "Queen Brahne");
      s = resolve(attack(s, [queen]));
      expect(idsOf(s, "p1", "battlefield", "Wizard")).toHaveLength(1);
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: ["p2"] } }));
      expect(pt(s, queen)).toEqual([3, 2]);
      expect(life(s, "p2")).toBe(17);
    });

    it("Quistis Trepe: on arrival, you may cast an instant or sorcery from a graveyard with mana of any type; it is exiled afterwards", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Quistis Trepe"] },
        p2: { graveyard: ["Burst Lightning"] },
      });
      s = untilCastNow(cast(s, "p1", "Quistis Trepe"));
      const burst = idOf(s, "p2", "graveyard", "Burst Lightning");
      expect(castNowOf(s)?.cards).toEqual([burst]);
      s = resolve(act(s, "p1", { type: "cast", card: burst, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(18);
      expect(exiled(s, "Burst Lightning")).toHaveLength(1);
    });

    it("Random Encounter: mill four cards, the milled creatures enter with haste and return to hand at the end step", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Random Encounter"], library: lands("Bear Cub", 4) } });
      s = resolve(cast(s, "p1", "Random Encounter"));
      const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(bears).toHaveLength(4);
      expect(chars(s, bears[0] as string).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(4);
    });

    it("Reach the Horizon: up to two basic lands or Towns with different names, put into play tapped", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 4),
          hand: ["Reach the Horizon"],
          library: ["Forest", "Forest", "Capital City", "Shivan Dragon"],
        },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Reach the Horizon"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return [
          req.options.find((id) => nameOf(cur, id) === "Forest"),
          req.options.find((id) => nameOf(cur, id) === "Capital City"),
        ] as string[];
      });
      expect(offered).not.toContain("Shivan Dragon");
      expect(s.objects[idOf(s, "p1", "battlefield", "Capital City")]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(5);
    });

    it("Relentless X-ATM092: can't be blocked except by three or more creatures; {8}: returns from the graveyard tapped with a finality counter", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), graveyard: ["Relentless X-ATM092"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "graveyard", "Relentless X-ATM092")));
      const robot = idOf(s, "p1", "battlefield", "Relentless X-ATM092");
      expect(s.objects[robot]?.tapped).toBe(true);
      expect(counters(s, robot, "finality")).toBe(1);
      let t = scenario({ p1: { battlefield: ["Relentless X-ATM092"] }, p2: { battlefield: ["Bear Cub", "Bear Cub"] } });
      const r2 = idOf(t, "p1", "battlefield", "Relentless X-ATM092");
      t = attack(t, [r2]);
      t = passAccepting(t, (x) => x.pending?.kind === "declareBlockers");
      const [b1, b2] = idsOf(t, "p2", "battlefield", "Bear Cub") as [string, string];
      expect(() =>
        act(t, "p2", {
          type: "declareBlockers",
          blocks: [
            { blocker: b1, attacker: r2 },
            { blocker: b2, attacker: r2 },
          ],
        }),
      ).toThrow();
    });

    it("Relm's Sketching: a token copy of a targeted artifact, creature or land", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Relm's Sketching"] },
        p2: { battlefield: ["Serra Angel", "Capital City"] },
      });
      s = resolve(cast(s, "p1", "Relm's Sketching", { targets: { t: [idOf(s, "p2", "battlefield", "Capital City")] } }));
      const copy = idOf(s, "p1", "battlefield", "Capital City");
      expect(s.objects[copy]?.isToken).toBe(true);
    });

    it("Reno and Rude: menace; combat damage: exiles the top card of the player's library; by sacrificing another creature or an artifact, you play it this turn with any mana", () => {
      const run = (yes: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Reno and Rude", "Llanowar Elves", "Swamp", "Swamp"] },
          p2: { library: ["Bear Cub", "Forest"] },
        });
        const reno = idOf(s, "p1", "battlefield", "Reno and Rude");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = throughCombat(attack(s, [reno]), answering(yes, yes ? [elves] : []));
        return s;
      };
      const yes = run(true);
      const bear = exiled(yes, "Bear Cub")[0] as string;
      expect(idsOf(yes, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(castable(yes, "p1", bear)).toBe(true);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(castable(no, "p1", exiled(no, "Bear Cub")[0] as string)).toBe(false);
      expect(chars(no, idOf(no, "p1", "battlefield", "Reno and Rude")).keywords).toContain("menace");
    });

    it("Restoration Magic: tier 'Cura': a permanent gains hexproof and indestructible, you gain 3 life", () => {
      const s = scenario({ p1: { battlefield: ["Bear Cub", "Plains", "Plains"], hand: ["Restoration Magic"] } });
      const card = idOf(s, "p1", "hand", "Restoration Magic");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const mode = castModes(s, card).find((m) => m.label?.includes("Cura"));
      const t = resolve(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { t: [bear] } }));
      expect(chars(t, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
      expect(life(t, "p1")).toBe(23);
    });

    it("Ride the Shoopuf: for each land, a counter on one of your creatures; {5}{G}{G}: becomes a 7/7 Beast creature", () => {
      let s = scenario({ p1: { battlefield: ["Ride the Shoopuf", "Bear Cub", ...lands("Forest", 7)], hand: ["Forest"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), answering(true, [bear]));
      expect(counters(s, bear)).toBe(1);
      const shoopuf = idOf(s, "p1", "battlefield", "Ride the Shoopuf");
      s = resolve(activate(s, "p1", shoopuf));
      expect(pt(s, shoopuf)).toEqual([7, 7]);
      expect(chars(s, shoopuf).subtypes).toContain("Beast");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, shoopuf).types).toContain("Creature");
    });
  });

  describe("peu communes (3)", () => {
    const sorceryOf = (n: number) =>
      customCard({
        name: `Rituel ${n}`,
        typeLine: "Sorcery",
        types: ["Sorcery"],
        manaCost: { generic: n, colored: {}, x: 0 },
        manaCostText: `{${n}}`,
        spell: spell([], [fx.gainLife(1)]),
      });
    const surveilOf: Answer = (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined);

    it("Ring of the Lucii: {T}: {C}{C}; {2}, {T}, 1 life: tap a targeted nonland permanent", () => {
      let s = scenario({
        p1: { battlefield: ["Ring of the Lucii", "Plains", "Plains"] },
        p2: { battlefield: ["Serra Angel", "Forest"] },
      });
      const ring = idOf(s, "p1", "battlefield", "Ring of the Lucii");
      const mana = act(s, "p1", { type: "tapForMana", source: ring, ability: 0, color: "C" } as never);
      expect(mana.players.p1?.manaPool.C).toBe(2);
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ring);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
      s = resolve(activate(s, "p1", ring, "Tap", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
      expect(life(s, "p1")).toBe(19);
    });

    it("Rinoa Heartilly: creates Angelo, a legendary 1/1 Dog; when attacking, another of your creatures gets +1/+1 per creature you control", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Forest", "Forest", "Forest", "Plains", "Plains"], hand: ["Rinoa Heartilly"] },
      });
      s = resolve(cast(s, "p1", "Rinoa Heartilly"));
      const angelo = idOf(s, "p1", "battlefield", "Angelo");
      expect(chars(s, angelo).supertypes).toContain("Legendary");
      expect(pt(s, angelo)).toEqual([1, 1]);
      let t = scenario({ p1: { battlefield: ["Rinoa Heartilly", "Bear Cub", "Llanowar Elves"] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Rinoa Heartilly")]), answering(true, [bear]));
      expect(pt(t, bear)).toEqual([5, 5]);
    });

    it("Rufus Shinra: when attacking, creates Darkstar (legendary 2/2 Dog) if you don't control one", () => {
      let s = scenario({ turn: 3, p1: { battlefield: ["Rufus Shinra"] } });
      const rufus = idOf(s, "p1", "battlefield", "Rufus Shinra");
      s = throughCombat(attack(s, [rufus]));
      expect(idsOf(s, "p1", "battlefield", "Darkstar")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
      s = throughCombat(act(s, "p1", { type: "declareAttackers", attackers: [{ id: rufus, defender: "p2" }] }));
      expect(idsOf(s, "p1", "battlefield", "Darkstar")).toHaveLength(1);
    });

    it("Rydia, Summoner of Mist: land: you may discard to draw; {X}, {T}: a Saga from the graveyard returns with a finality counter and haste", () => {
      let s = scenario({ p1: { battlefield: ["Rydia, Summoner of Mist"], hand: ["Forest", "Opt"], library: ["Bear Cub"] } });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), answering(true, [opt]));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: {
          battlefield: ["Rydia, Summoner of Mist", "Mountain", "Mountain"],
          graveyard: ["Summon: Brynhildr"],
          library: ["Forest", "Forest"],
        },
      });
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Rydia, Summoner of Mist"), "Summon", {
          x: 2,
          targets: { t: [idOf(t, "p1", "graveyard", "Summon: Brynhildr")] },
        }),
      );
      const saga = idOf(t, "p1", "battlefield", "Summon: Brynhildr");
      expect(counters(t, saga, "finality")).toBe(1);
      expect(chars(t, saga).keywords).toContain("haste");
      // X different from the mana value (1 or 3 for an MV 2 Saga): the target isn't legal ("with mana value X").
      const u = scenario({
        p1: { battlefield: ["Rydia, Summoner of Mist", ...lands("Mountain", 3)], graveyard: ["Summon: Brynhildr"] },
      });
      for (const x of [1, 3])
        expect(() =>
          activate(u, "p1", idOf(u, "p1", "battlefield", "Rydia, Summoner of Mist"), "Summon", {
            x,
            targets: { t: [idOf(u, "p1", "graveyard", "Summon: Brynhildr")] },
          }),
        ).toThrow();
    });

    it("Rydia's Return: your creatures +3/+3; or up to two permanent cards from the graveyard to hand", () => {
      const s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 5)],
          hand: ["Rydia's Return"],
          graveyard: ["Shivan Dragon", "Opt", "Forest"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Rydia's Return");
      const a = resolve(act(s, "p1", { type: "cast", card, mode: modeOf(s, card, "Creatures you control get +3/+3") }));
      expect(pt(a, idOf(a, "p1", "battlefield", "Bear Cub"))).toEqual([5, 5]);
      expect(pt(a, idOf(a, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      const mode = castModes(s, card).find((m) => m.label === "Return up to two permanent cards");
      expect(mode?.targets[0]?.legal).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
      const targets = [idOf(s, "p1", "graveyard", "Shivan Dragon"), idOf(s, "p1", "graveyard", "Forest")];
      const b = resolve(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { t: targets } }));
      expect(namesIn(b, b.players.p1?.hand).sort()).toEqual(["Forest", "Shivan Dragon"]);
    });

    it("Samurai's Katana: +2/+2, trample, haste and Samurai", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Samurai's Katana"] } });
      s = resolve(cast(s, "p1", "Samurai's Katana"));
      const hero = idOf(s, "p1", "battlefield", "Hero");
      expect(pt(s, hero)).toEqual([3, 3]);
      expect(chars(s, hero).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
      expect(chars(s, hero).subtypes).toContain("Samurai");
    });

    it("Sandworm: haste; destroys a targeted land, whose controller may search for a basic land put into play tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Sandworm"] },
        p2: { battlefield: ["Capital City"], library: ["Bear Cub", "Island"] },
      });
      const city = idOf(s, "p2", "battlefield", "Capital City");
      let chooser = "";
      s = resolve(cast(s, "p1", "Sandworm"), (req, p, cur) => {
        if (req.type === "pick" && req.options.includes(city)) return [city];
        const island = pickNamed(cur, req, "Island");
        if (island?.length) chooser = p;
        return island?.length ? island : undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Capital City")).toHaveLength(1);
      expect(chooser).toBe("p2");
      expect(s.objects[idOf(s, "p2", "battlefield", "Island")]?.tapped).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Sandworm")).keywords).toContain("haste");
    });

    it("Self-Destruct: your creature deals X damage to another target and X to itself (X = its power)", () => {
      let s = scenario({ p1: { battlefield: ["Serra Angel", "Mountain", "Mountain"], hand: ["Self-Destruct"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Self-Destruct", { targets: { s: [angel], t: ["p2"] } }));
      expect(life(s, "p2")).toBe(16);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Shambling Cie'th: enters tapped; on each noncreature spell, you may pay {B} to return it from the graveyard to hand", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Shambling Cie'th"] } });
      s = resolve(cast(s, "p1", "Shambling Cie'th"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Shambling Cie'th")]?.tapped).toBe(true);
      const run = (yes: boolean) => {
        const t = scenario({ p1: { battlefield: ["Island", "Swamp"], hand: ["Opt"], graveyard: ["Shambling Cie'th"] } });
        return resolve(cast(t, "p1", "Opt"), answering(yes));
      };
      expect(idsOf(run(true), "p1", "hand", "Shambling Cie'th")).toHaveLength(1);
      expect(idsOf(run(false), "p1", "graveyard", "Shambling Cie'th")).toHaveLength(1);
    });

    it("Shantotto, Tactician Magician: +X/+0 per noncreature spell (X = mana spent); X ≥ 4: draw", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Shantotto, Tactician Magician", ...lands("Island", n)], hand: [sorceryOf(n)] },
        });
        return resolve(cast(s, "p1", `Rituel ${n}`));
      };
      const four = run(4);
      expect(pt(four, idOf(four, "p1", "battlefield", "Shantotto, Tactician Magician"))).toEqual([4, 4]);
      expect(hand(four, "p1")).toBe(1);
      const two = run(2);
      expect(pt(two, idOf(two, "p1", "battlefield", "Shantotto, Tactician Magician"))).toEqual([2, 4]);
      expect(hand(two, "p1")).toBe(0);
    });

    it("Sidequest: Card Collection: draw three, discard two; at your end step, with eight cards in the graveyard, becomes Magicked Card (flying Vehicle)", () => {
      const SQ = "Sidequest: Card Collection // Magicked Card";
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [SQ] } });
      s = resolve(cast(s, "p1", SQ));
      expect(hand(s, "p1")).toBe(1);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      const run = (n: number) => {
        const t = scenario({ p1: { battlefield: [SQ], graveyard: lands("Forest", n) } });
        const id = idOf(t, "p1", "battlefield", SQ);
        return { t: advanceUntil(t, (x) => x.turn.active === "p2"), id };
      };
      const eight = run(8);
      expect(chars(eight.t, eight.id).name).toBe("Magicked Card");
      expect(chars(eight.t, eight.id).keywords).toContain("flying");
      const seven = run(7);
      expect(chars(seven.t, seven.id).name).not.toBe("Magicked Card");
    });

    it("Sidequest: Catch a Fish: at upkeep, an artifact or creature on top goes to hand: Food and transformation into Cooking Campsite", () => {
      const SQ = "Sidequest: Catch a Fish // Cooking Campsite";
      const run = (top: string) => {
        const s = scenario({ active: "p2", turn: 4, p1: { battlefield: [SQ], library: [top, "Island"] } });
        const id = idOf(s, "p1", "battlefield", SQ);
        return { s: toMain(s, "p1", answering(true, s.players.p1?.library.slice(0, 1) ?? [])), id };
      };
      const fish = run("Bear Cub");
      expect(idsOf(fish.s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(fish.s, "p1", "battlefield", "Food")).toHaveLength(1);
      expect(chars(fish.s, fish.id).name).toBe("Cooking Campsite");
      const none = run("Forest");
      expect(idsOf(none.s, "p1", "battlefield", "Food")).toHaveLength(0);
      expect(chars(none.s, none.id).name).not.toBe("Cooking Campsite");
    });

    it("Cooking Campsite: {T}: {W}; {3}, {T}, sacrifice an artifact: a +1/+1 counter on each of your creatures", () => {
      const SQ = "Sidequest: Catch a Fish // Cooking Campsite";
      let s = scenario({ p1: { battlefield: [SQ, "Bear Cub", "Buster Sword", ...lands("Plains", 3)] } });
      const camp = idOf(s, "p1", "battlefield", SQ);
      flip(s, camp);
      s = resolve(activate(s, "p1", camp, "A +1/+1 counter", { sacrifice: [idOf(s, "p1", "battlefield", "Buster Sword")] }));
      expect(idsOf(s, "p1", "graveyard", "Buster Sword")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Sidequest: Hunt the Mark: destroys up to one creature; at your end step, if an opposing creature died, a Treasure", () => {
      const SQ = "Sidequest: Hunt the Mark // Yiazmat, Ultimate Mark";
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: [SQ] }, p2: { battlefield: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", SQ), answering(true, [idOf(s, "p2", "battlefield", "Bear Cub")]));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const t = advanceUntil(scenario({ p1: { battlefield: [SQ] } }), (x) => x.turn.active === "p2");
      expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Yiazmat, Ultimate Mark: {1}{B}, sacrifice another creature or an artifact: indestructible until end of turn, and tap it", () => {
      const SQ = "Sidequest: Hunt the Mark // Yiazmat, Ultimate Mark";
      let s = scenario({ p1: { battlefield: [SQ, "Bear Cub", "Swamp", "Swamp"] } });
      const y = idOf(s, "p1", "battlefield", SQ);
      flip(s, y);
      s = resolve(activate(s, "p1", y, "Indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(chars(s, y).keywords).toContain("indestructible");
      expect(s.objects[y]?.tapped).toBe(true);
    });

    it("Sidequest: Play Blitzball: +2/+0 at the beginning of combat; a player took 6 combat damage: becomes World Champion (+2/+0, double strike), attached", () => {
      const SQ = "Sidequest: Play Blitzball // World Champion, Celestial Weapon";
      const run = (name: string) => {
        let s = scenario({ p1: { battlefield: [SQ, name] } });
        const c = idOf(s, "p1", "battlefield", name);
        s = play(s, answering(true, [c]), (x) => x.pending?.kind === "declareAttackers");
        expect(pt(s, c)[0]).toBe((name === "Bear Cub" ? 2 : 5) + 2);
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: c, defender: "p2" }] });
        s = play(s, answering(true, [c]), (x) => x.turn.step === "main2");
        return { s, c, sq: idOf(s, "p1", "battlefield", SQ) };
      };
      const big = run("Shivan Dragon");
      expect(life(big.s, "p2")).toBe(13);
      expect(chars(big.s, big.sq).name).toBe("World Champion, Celestial Weapon");
      expect(big.s.objects[big.sq]?.attachedTo).toBe(big.c);
      expect(chars(big.s, big.c).keywords).toContain("doubleStrike");
      const small = run("Bear Cub");
      expect(chars(small.s, small.sq).name).not.toBe("World Champion, Celestial Weapon");
    });

    it("Sidequest: Raise a Chocobo: a 2/2 Bird on arrival; with four Birds, becomes Black Chocobo (land searched; land: your Birds +1/+0)", () => {
      const SQ = "Sidequest: Raise a Chocobo // Black Chocobo";
      let s = scenario({ p1: { battlefield: ["Forest", "Forest"], hand: [SQ] } });
      s = resolve(cast(s, "p1", SQ));
      expect(idsOf(s, "p1", "battlefield", "Bird")).toHaveLength(1);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: {
          battlefield: [SQ, "Healer's Hawk", "Healer's Hawk", "Healer's Hawk", "Healer's Hawk"],
          library: ["Bear Cub", "Forest", "Island"],
        },
      });
      const id = idOf(t, "p1", "battlefield", SQ);
      t = toMain(t, "p1", (req, _p, cur) => pickNamed(cur, req, "Forest"));
      expect(chars(t, id).name).toBe("Black Chocobo");
      const hawk = idOf(t, "p1", "battlefield", "Healer's Hawk");
      // The searched land arrives: your Birds +1/+0 (Black Chocobo included).
      expect(t.objects[idOf(t, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
      expect(pt(t, hawk)).toEqual([2, 1]);
      expect(pt(t, id)).toEqual([3, 2]);
      // "When this permanent transforms into Black Chocobo": also when another effect transforms it.
      let v = scenario({ p1: { battlefield: [SQ], hand: [TRANSMUTE], library: ["Bear Cub", "Forest"] } });
      v = resolve(
        act(v, "p1", {
          type: "cast",
          card: idOf(v, "p1", "hand", "Transmutation"),
          targets: { t: [idOf(v, "p1", "battlefield", SQ)] },
        }),
      );
      expect(chars(v, idOf(v, "p1", "battlefield", SQ)).name).toBe("Black Chocobo");
      expect(idsOf(v, "p1", "battlefield", "Forest")).toHaveLength(1);
    });

    it("Sleep Magic: the enchanted creature is tapped and no longer untaps; damaged, the Aura is sacrificed", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Mountain"], hand: ["Sleep Magic", "Burst Lightning"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Sleep Magic", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      const t = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(t.objects[angel]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Burst Lightning", { targets: { t: [angel] } }));
      expect(idsOf(s, "p1", "graveyard", "Sleep Magic")).toHaveLength(1);
    });

    it("Snow Villiers: vigilance; its power is equal to the number of creatures you control", () => {
      const s = scenario({ p1: { battlefield: ["Snow Villiers", "Bear Cub", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
      const snow = idOf(s, "p1", "battlefield", "Snow Villiers");
      expect(pt(s, snow)).toEqual([3, 3]);
      expect(chars(s, snow).keywords).toContain("vigilance");
    });

    it("Sorceress's Schemes: an instant or sorcery card from the graveyard to hand, and {R}", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Sorceress's Schemes"], graveyard: ["Opt", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Sorceress's Schemes");
      const legal = castModes(s, card)[0]?.targets[0]?.legal ?? [];
      expect(legal).toEqual([idOf(s, "p1", "graveyard", "Opt")]);
      s = resolve(act(s, "p1", { type: "cast", card, targets: { t: legal } }));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });

    it("Sorceress's Schemes: or an exiled card with flashback you own (PLAN-L L4)", () => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Sorceress's Schemes"], graveyard: ["Think Twice", "Opt"] },
        p2: { graveyard: ["Think Twice"] },
      });
      const mine = idOf(s, "p1", "graveyard", "Think Twice");
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const theirs = idOf(s, "p2", "graveyard", "Think Twice");
      const exiled = [mine, opt, theirs].map((id) => moveObject(s, id, "exile") as string);
      const legal = castModes(s, idOf(s, "p1", "hand", "Sorceress's Schemes"))[0]?.targets[0]?.legal ?? [];
      // Only your exiled Think Twice (flashback); not Opt (no flashback), not the opponent's.
      expect(legal).toEqual([exiled[0]]);
    });

    it("Stolen Uniform: you gain control of the targeted Equipment and attach it to your creature", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island"], hand: ["Stolen Uniform"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Stolen Uniform", { targets: { c: [bear], e: [sword] } }));
      expect(s.objects[sword]?.controller).toBe("p1");
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([5, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[sword]?.controller).toBe("p2");
    });

    it("Stolen Uniform: when you lose control of the Equipment (at cleanup), it is unattached from your creature, not before", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island"], hand: ["Stolen Uniform"] },
        p2: { battlefield: ["Buster Sword"] },
      });
      const sword = idOf(s, "p2", "battlefield", "Buster Sword");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Stolen Uniform", { targets: { c: [bear], e: [sword] } }));
      // At the end step, the Equipment is still yours and attached.
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(s.objects[sword]?.controller).toBe("p1");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[sword]?.controller).toBe("p2");
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Summon: Anima: I to III, draw and lose 1 life; IV, each opponent sacrifices a creature and loses 3 life; menace", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Summon: Anima"] } });
      s = resolve(cast(s, "p1", "Summon: Anima"));
      expect(hand(s, "p1")).toBe(1);
      expect(life(s, "p1")).toBe(19);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Anima")).keywords).toContain("menace");
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Anima", counters: { lore: 3 } }] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(life(t, "p2")).toBe(17);
    });

    it("Summon: Esper Ramuh: I deals to an opposing creature as much as your noncreature nonland cards in the graveyard; II your Wizards +1/+0", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["Summon: Esper Ramuh"],
          graveyard: ["Opt", "Opt", "Buster Sword", "Bear Cub", "Forest"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Summon: Esper Ramuh"), answering(true, [angel]));
      expect(s.objects[angel]?.damage).toBe(3);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Esper Ramuh", counters: { lore: 1 } }, "Bear Cub"] },
      });
      t = toMain(t, "p1");
      expect(pt(t, idOf(t, "p1", "battlefield", "Summon: Esper Ramuh"))).toEqual([4, 3]);
      expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Summon: Fenrir: I basic land put into play tapped; II your next creature spell enters with a counter; III draw if you have the greatest power", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Summon: Fenrir"], library: ["Bear Cub", "Island"] } });
      s = resolve(cast(s, "p1", "Summon: Fenrir"), (req, _p, cur) => pickNamed(cur, req, "Island"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Fenrir", counters: { lore: 1 } }, "Forest", "Forest"], hand: ["Bear Cub"] },
      });
      t = toMain(t, "p1");
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(counters(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(1);
      const third = (theirs: string) => {
        const u = scenario({
          active: "p2",
          turn: 4,
          p1: { battlefield: [{ name: "Summon: Fenrir", counters: { lore: 2 } }] },
          p2: { battlefield: [theirs] },
        });
        return hand(toMain(u, "p1"), "p1");
      };
      // Fenrir 3/2: tied with a 3/x, it draws; against the Dragon, no (only the draw step card).
      expect(third("Bear Cub")).toBe(2);
      expect(third("Shivan Dragon")).toBe(1);
    });

    it("Summon: Primal Garuda: I 4 damage to a tapped opposing creature; II another of your creatures gets +1/+0 and flying", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Summon: Primal Garuda"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Summon: Primal Garuda"), (req) => {
        if (req.type === "pick" && req.options.includes(angel)) offered = req.options;
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(offered).not.toContain(idOf(s, "p2", "battlefield", "Bear Cub"));
      let t = scenario({
        active: "p2",
        turn: 4,
        p1: { battlefield: [{ name: "Summon: Primal Garuda", counters: { lore: 1 } }, "Bear Cub"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = toMain(t, "p1", answering(true, [bear]));
      expect(pt(t, bear)).toEqual([3, 2]);
      expect(chars(t, bear).keywords).toContain("flying");
    });

    it("Swallowed by Leviathan: surveil 2, then the spell is countered unless its controller pays {1} per card in your graveyard", () => {
      const run = (lands2: number) => {
        let s = scenario({
          active: "p2",
          p1: {
            battlefield: lands("Island", 3),
            hand: ["Swallowed by Leviathan"],
            graveyard: ["Opt"],
            library: ["Forest", "Forest", "Forest"],
          },
          p2: { battlefield: lands("Mountain", lands2), hand: ["Burst Lightning"] },
        });
        s = act(cast(s, "p2", "Burst Lightning", { targets: { t: ["p1"] } }), "p2", { type: "pass" });
        return resolve(
          cast(s, "p1", "Swallowed by Leviathan", { targets: { t: [s.stack[0]?.id as string] } }),
          (req, p, cur) => surveilOf(req, p, cur) ?? (req.type === "yesNo" ? [1] : undefined),
        );
      };
      // Three cards in the graveyard after the surveil: {3} to pay.
      const poor = run(3);
      expect(life(poor, "p1")).toBe(20);
      expect(poor.players.p1?.graveyard.length).toBeGreaterThanOrEqual(3);
      const rich = run(4);
      expect(life(rich, "p1")).toBe(18);
    });

    it("The Crystal's Chosen: four 1/1 Heroes, then a +1/+1 counter on each of your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 7)], hand: ["The Crystal's Chosen"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "The Crystal's Chosen"));
      const heroes = idsOf(s, "p1", "battlefield", "Hero");
      expect(heroes).toHaveLength(4);
      expect(heroes.every((id) => counters(s, id) === 1)).toBe(true);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
    });

    it("The Emperor of Palamecia: its mana only pays for noncreature spells; a counter per noncreature spell at four mana, then transformation at three", () => {
      const EMP = "The Emperor of Palamecia // The Lord Master of Hell";
      const s = scenario({ p1: { battlefield: [EMP, "Forest"], hand: ["Bear Cub"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      let t = scenario({
        p1: { battlefield: [{ name: EMP, counters: { "+1/+1": 1 } }, ...lands("Island", 4)], hand: [sorceryOf(4), sorceryOf(3)] },
      });
      const emp = idOf(t, "p1", "battlefield", EMP);
      t = resolve(cast(t, "p1", "Rituel 3"));
      expect(counters(t, emp)).toBe(1);
      t = scenario({
        p1: { battlefield: [{ name: EMP, counters: { "+1/+1": 2 } }, ...lands("Island", 4)], hand: [sorceryOf(4)] },
      });
      const e2 = idOf(t, "p1", "battlefield", EMP);
      t = resolve(cast(t, "p1", "Rituel 4"));
      expect(counters(t, e2)).toBe(3);
      expect(chars(t, e2).name).toBe("The Lord Master of Hell");
    });

    it("The Lord Master of Hell: when attacking, X damage to each opponent (X = noncreature nonland cards in your graveyard)", () => {
      const EMP = "The Emperor of Palamecia // The Lord Master of Hell";
      let s = scenario({ p1: { battlefield: [EMP], graveyard: ["Opt", "Buster Sword", "Bear Cub", "Forest"] } });
      const lord = idOf(s, "p1", "battlefield", EMP);
      flip(s, lord);
      s = resolve(attack(s, [lord]));
      expect(life(s, "p2")).toBe(18);
    });

    it("The Final Days: two tapped 2/2 Horrors; flashback, as many as creature cards in your graveyard", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["The Final Days"] } });
      s = resolve(cast(s, "p1", "The Final Days"));
      const horrors = idsOf(s, "p1", "battlefield", "Horror");
      expect(horrors).toHaveLength(2);
      expect(horrors.every((id) => s.objects[id]?.tapped)).toBe(true);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 6), graveyard: ["The Final Days", "Bear Cub", "Bear Cub", "Shivan Dragon", "Opt"] },
      });
      t = resolve(act(t, "p1", { type: "cast", card: idOf(t, "p1", "graveyard", "The Final Days") }));
      expect(idsOf(t, "p1", "battlefield", "Horror")).toHaveLength(3);
    });

    it("The Gold Saucer: {2}, {T}: coin flip, a Treasure if you win (Edgar makes you win); {3}, {T}, sacrifice two artifacts: draw", () => {
      let s = scenario({ p1: { battlefield: ["The Gold Saucer", "Edgar, King of Figaro", "Plains", "Plains"] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "The Gold Saucer"), "Flip a coin"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let t = scenario({ p1: { battlefield: ["The Gold Saucer", trinket, trinket, ...lands("Plains", 3)] } });
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "The Gold Saucer"), "Draw", {
          sacrifice: idsOf(t, "p1", "battlefield", "Babiole"),
        }),
      );
      expect(hand(t, "p1")).toBe(1);
      expect(idsOf(t, "p1", "graveyard", "Babiole")).toHaveLength(2);
    });

    it("The Prima Vista: flying; becomes an artifact creature when you cast a noncreature spell with mana value four or more", () => {
      const run = (n: number) => {
        const s = scenario({ p1: { battlefield: ["The Prima Vista", ...lands("Island", n)], hand: [sorceryOf(n)] } });
        const t = resolve(cast(s, "p1", `Rituel ${n}`));
        return chars(t, idOf(t, "p1", "battlefield", "The Prima Vista"));
      };
      expect(run(4).types).toContain("Creature");
      expect(run(4).keywords).toContain("flying");
      expect(run(3).types).not.toContain("Creature");
    });

    it("Thief's Knife: +1/+1 and Rogue; the equipped creature draws when it deals combat damage to a player", () => {
      let s = scenario({ p1: { battlefield: ["Thief's Knife", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s.objects[idOf(s, "p1", "battlefield", "Thief's Knife")]!.attachedTo = bear;
      bump(s);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).subtypes).toContain("Rogue");
      s = throughCombat(attack(s, [bear]));
      expect(hand(s, "p1")).toBe(1);
    });

    it("Tidus, Blitzball Star: a counter for each artifact that enters under your control; when attacking, taps an opposing creature", () => {
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let s = scenario({ p1: { battlefield: ["Tidus, Blitzball Star"], hand: [trinket] }, p2: { battlefield: ["Serra Angel"] } });
      const tidus = idOf(s, "p1", "battlefield", "Tidus, Blitzball Star");
      s = resolve(cast(s, "p1", "Babiole"));
      expect(counters(s, tidus)).toBe(1);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(attack(s, [tidus]), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Tifa's Limit Break: +2/+2 at the first tier, doubles power and toughness at the second", () => {
      const s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Forest", 3)],
          hand: ["Tifa's Limit Break"],
        },
      });
      const card = idOf(s, "p1", "hand", "Tifa's Limit Break");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const tier = (label: string) => castModes(s, card).find((m) => m.label?.includes(label))?.index;
      const a = resolve(act(s, "p1", { type: "cast", card, mode: tier("Somersault"), targets: { t: [bear] } }));
      expect(pt(a, bear)).toEqual([5, 5]);
      const b = resolve(act(s, "p1", { type: "cast", card, mode: tier("Meteor Strikes"), targets: { t: [bear] } }));
      expect(pt(b, bear)).toEqual([6, 6]);
    });

    it("Tonberry: enters tapped with a stun counter; first strike and deathtouch during your turn", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Tonberry"] } });
      s = resolve(cast(s, "p1", "Tonberry"));
      const tonberry = idOf(s, "p1", "battlefield", "Tonberry");
      expect(s.objects[tonberry]?.tapped).toBe(true);
      expect(counters(s, tonberry, "stun")).toBe(1);
      expect(chars(s, tonberry).keywords).toEqual(expect.arrayContaining(["firstStrike", "deathtouch"]));
      const t = scenario({ active: "p2", p1: { battlefield: ["Tonberry"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Tonberry")).keywords).not.toContain("deathtouch");
    });

    it("Travel the Overworld: affinity for Towns; draw four cards", () => {
      let s = scenario({
        p1: {
          battlefield: ["Capital City", "Adventurer's Inn", "Crossroads Village", "Island", "Island"],
          hand: ["Travel the Overworld"],
        },
      });
      const card = idOf(s, "p1", "hand", "Travel the Overworld");
      expect(castable(s, "p1", card)).toBe(true);
      s = resolve(cast(s, "p1", "Travel the Overworld"));
      expect(hand(s, "p1")).toBe(4);
      const t = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Travel the Overworld"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Travel the Overworld"))).toBe(false);
    });

    it("Ultimecia, Time Sorceress: surveil 2 on arrival; at the end step, pay and exile eight cards: Ultimecia, Omnipotent (menace) and an extra turn", () => {
      const ULT = "Ultimecia, Time Sorceress // Ultimecia, Omnipotent";
      let s = scenario({
        p1: { battlefield: ["Island", "Island", "Swamp", "Swamp", "Swamp"], hand: [ULT], library: ["Forest", "Forest", "Opt"] },
      });
      s = resolve(cast(s, "p1", ULT), surveilOf);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      let t = scenario({
        p1: { battlefield: [ULT, ...lands("Island", 6), "Swamp", "Swamp"], graveyard: lands("Forest", 9) },
      });
      const u = idOf(t, "p1", "battlefield", ULT);
      t = play(t, answering(true), (x) => x.turn.number > 3 && x.turn.step === "main1");
      expect(chars(t, u).name).toBe("Ultimecia, Omnipotent");
      expect(chars(t, u).keywords).toContain("menace");
      expect(t.players.p1?.graveyard).toHaveLength(1);
      expect(t.turn.active).toBe("p1");
      // "When she transforms into Ultimecia, Omnipotent": also when another effect transforms her.
      let v = scenario({ p1: { battlefield: [ULT], hand: [TRANSMUTE] } });
      v = resolve(
        act(v, "p1", {
          type: "cast",
          card: idOf(v, "p1", "hand", "Transmutation"),
          targets: { t: [idOf(v, "p1", "battlefield", ULT)] },
        }),
      );
      expect(chars(v, idOf(v, "p1", "battlefield", ULT)).name).toBe("Ultimecia, Omnipotent");
      expect(v.extraTurns).toEqual(["p1"]);
    });

    it("Ultros, Obnoxious Octopus: noncreature spell at four mana: taps and stuns an opposing creature; at eight: eight +1/+1 counters", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { battlefield: ["Ultros, Obnoxious Octopus", ...lands("Island", n)], hand: [sorceryOf(n)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(cast(s, "p1", `Rituel ${n}`), answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      const four = run(4);
      const angel = idOf(four, "p2", "battlefield", "Serra Angel");
      expect(four.objects[angel]?.tapped).toBe(true);
      expect(counters(four, angel, "stun")).toBe(1);
      expect(counters(four, idOf(four, "p1", "battlefield", "Ultros, Obnoxious Octopus"))).toBe(0);
      const eight = run(8);
      expect(counters(eight, idOf(eight, "p1", "battlefield", "Ultros, Obnoxious Octopus"))).toBe(8);
      const three = run(3);
      expect(three.objects[idOf(three, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(false);
    });

    it("Unexpected Request: you control the targeted creature until end of turn, untapped and with haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Unexpected Request"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Unexpected Request", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.controller).toBe("p1");
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(chars(s, angel).keywords).toContain("haste");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Unexpected Request: the Equipment is chosen on resolution ('you may'), detached at the end step (PLAN-D, D7)", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Buster Sword", ...lands("Mountain", 3)], hand: ["Unexpected Request"] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = start();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const sword = idOf(s, "p1", "battlefield", "Buster Sword");
      // The spell only targets the creature.
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Unexpected Request"));
      expect(opt?.type === "cast" ? opt.modes[0]?.targets.map((t) => t.id) : []).toEqual(["t"]);
      const asked: string[] = [];
      s = resolve(cast(s, "p1", "Unexpected Request", { targets: { t: [angel] } }), (req) => {
        if (req.type === "pick" && req.options.includes(sword)) asked.push(...req.options);
        return undefined;
      });
      expect(asked).toEqual([sword]);
      expect(s.objects[sword]?.attachedTo).toBe(angel);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      // Declined: nothing is attached.
      let t = start();
      t = resolve(cast(t, "p1", "Unexpected Request", { targets: { t: [angel] } }), (req) =>
        req.type === "pick" && req.options.includes(sword) ? [] : undefined,
      );
      expect(t.objects[sword]?.attachedTo).toBeUndefined();
    });

    it("Light of Judgment: 6 damage; up to one Equipment attached to the creature, chosen on resolution, is destroyed (PLAN-D, D7)", () => {
      const start = () => {
        const s = scenario({
          p1: { battlefield: lands("Mountain", 6), hand: ["Light of Judgment"] },
          p2: { battlefield: ["Serra Angel", "Buster Sword", "Buster Sword"] },
        });
        const [a, b] = idsOf(s, "p2", "battlefield", "Buster Sword");
        s.objects[a as string]!.attachedTo = idOf(s, "p2", "battlefield", "Serra Angel");
        bump(s);
        return { s, attached: a as string, loose: b as string };
      };
      const { s: s0, attached, loose } = start();
      const angel = idOf(s0, "p2", "battlefield", "Serra Angel");
      const opt = legalActions(s0, "p1").find((a) => a.type === "cast" && a.card === idOf(s0, "p1", "hand", "Light of Judgment"));
      expect(opt?.type === "cast" ? opt.modes[0]?.targets.map((t) => t.id) : []).toEqual(["c"]);
      const offered: string[] = [];
      const s = resolve(cast(s0, "p1", "Light of Judgment", { targets: { c: [angel] } }), (req) => {
        if (req.type === "pick" && req.options.includes(attached)) offered.push(...req.options);
        return undefined;
      });
      expect(offered).toEqual([attached]);
      expect(s.battlefield).not.toContain(attached);
      expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Buster Sword", "Serra Angel"]);
      expect(s.battlefield).toContain(loose);
      expect(s.battlefield).not.toContain(angel);
      // 'Up to one': you can destroy none.
      const again = start();
      const t = resolve(cast(again.s, "p1", "Light of Judgment", { targets: { c: [angel] } }), (req) =>
        req.type === "pick" && req.options.includes(again.attached) ? [] : undefined,
      );
      expect(t.battlefield).toContain(again.attached);
    });

    it("Valkyrie Aerial Unit: affinity for artifacts; flying; surveil 2 on arrival", () => {
      const trinket = customCard({ name: "Babiole", typeLine: "Artifact", types: ["Artifact"] });
      let s = scenario({
        p1: {
          battlefield: [trinket, trinket, trinket, ...lands("Island", 4)],
          hand: ["Valkyrie Aerial Unit"],
          library: ["Forest", "Forest", "Opt"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Valkyrie Aerial Unit"))).toBe(true);
      s = resolve(cast(s, "p1", "Valkyrie Aerial Unit"), surveilOf);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Valkyrie Aerial Unit")).keywords).toContain("flying");
    });
  });
});

describe("Diamond Weapon: Immunity is a prevention on the creature (PLAN-H, H8b)", () => {
  it("only combat damage; if it loses its abilities, nothing is prevented", () => {
    const s = scenario({ p1: { battlefield: ["Diamond Weapon"] } });
    const dw = idOf(s, "p1", "battlefield", "Diamond Weapon");
    const src = { defId: "test", controller: "p2", keywords: [] };
    dealDamage(s, src, dw, 3, true);
    expect(s.objects[dw]?.damage).toBe(0);
    dealDamage(s, src, dw, 2, false);
    expect(s.objects[dw]?.damage).toBe(2);
    addEffect(s, [dw], { loseAllAbilities: true }, "endOfTurn");
    dealDamage(s, src, dw, 3, true);
    expect(s.objects[dw]?.damage).toBe(5);
  });
});
