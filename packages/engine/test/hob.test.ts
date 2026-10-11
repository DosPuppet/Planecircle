/**
 * The Hobbit: each handled card is checked against its Oracle text (plan R, lot R7). Behold, Storied,
 * amassing Goblins, Dwarves and Equipment, Wolves, Treasures…
 */
import { TOKEN_SPECS } from "@mtgx/cards/tokens";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { playerStatic } from "../src/dsl";
import { addPump } from "../src/effects";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { canBlock } from "../src/turn";
import type { ActionOption, CardDef, ChoiceRequest, ChoiceValue, GameState, PlayerId, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castNowOf,
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
describe("The Hobbit", () => {
  it("Elven Passage: 1 life and sacrifice; the searched land enters tapped, then untaps by beholding an Elf in play", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: ["Elven Passage", ...battlefield], library: ["Opt", "Forest", "Island"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Elven Passage")), (req, _player, cur) =>
        req.intent === "search" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Elven Passage")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.library).toHaveLength(2);
      return s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped;
    };
    expect(run(["Llanowar Elves"])).toBe(false);
    expect(run(["Bear Cub"])).toBe(true);
  });

  describe("Azog, Moria's Ruin", () => {
    it("destroys one of your creatures: you amass Goblins X (its power) and draw a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Fire Elemental"], hand: ["Azog, Moria's Ruin"], library: lands("Island", 3) },
      });
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) =>
        req.type === "pick" && req.options.includes(fire) ? [fire] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
      expect(s.objects[army]?.controller).toBe("p1");
      expect(s.objects[army]?.counters["+1/+1"]).toBe(5);
      expect(chars(s, army).subtypes).toContain("Goblin");
    });

    it("the draw follows the destruction: a draw replacement carried by the destroyed creature no longer applies", () => {
      /** Test creature: "If you would draw a card, draw two cards instead." */
      const scribe = customCard({
        name: "Test Scribe",
        power: 1,
        toughness: 1,
        abilities: [{ kind: "eventReplacement", event: "draw", to: "you", modify: { times: 2 }, label: "Doubled draw" }],
      });
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), scribe], hand: ["Azog, Moria's Ruin"], library: lands("Island", 3) },
      });
      const target = idOf(s, "p1", "battlefield", "Test Scribe");
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) =>
        req.type === "pick" && req.options.includes(target) ? [target] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Test Scribe")).toHaveLength(1);
      // You controlled the creature (last known information): a single card, drawn after the destruction.
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
    });

    it('"up to one": with no target, nothing is destroyed or amassed, and you don\'t draw', () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) => (req.type === "pick" ? [] : undefined));
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.battlefield.some((id) => chars(s, id).subtypes.includes("Army"))).toBe(false);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("an opponent's creature: they amass, and you don't draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Azog, Moria's Ruin"] },
        p2: { battlefield: ["Bear Cub", "Fire Elemental"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Azog, Moria's Ruin"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const army = s.battlefield.find((id) => chars(s, id).subtypes.includes("Army")) as string;
      expect(s.objects[army]?.controller).toBe("p2");
      expect(chars(s, army).power).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("The Sackville-Bagginses: sacrifice another creature, card and Treasure; a sacrificed token makes you lose 1 life", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["The Sackville-Bagginses"], library: lands("Island", 3) },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "The Sackville-Bagginses"), (req) =>
      req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
    );
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    // The Cub is not a token: nobody loses life.
    expect(s.players.p2?.life).toBe(20);
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === treasure);
    s = act(s, "p1", {
      type: "tapForMana",
      source: treasure,
      ability: mana?.type === "tapForMana" ? mana.ability : 0,
      color: "B",
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(s.players.p2?.life).toBe(19);
  });

  it("The Sackville-Bagginses: the sacrifice is optional", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["The Sackville-Bagginses"] } });
    s = settle(cast(s, "p1", "The Sackville-Bagginses"), (req) => (req.type === "pick" ? [] : undefined));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(0);
  });

  it("Smaug the Magnificent: flying and haste; a Treasure at upkeep; when attacking, damage equal to your Treasures", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Smaug the Magnificent"] },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    const smaug = idOf(s, "p1", "battlefield", "Smaug the Magnificent");
    expect(chars(s, smaug).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = throughCombat(attack(s, [smaug]), (req) => (req.type === "pick" && req.options.includes(elves) ? [elves] : undefined));
    // One Treasure: 1 damage to the Elves (1/1), then 4 combat damage.
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(16);
  });

  describe("The Lonely Mountain", () => {
    it("enters tapped, unless you control an Equipment", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield, hand: ["The Lonely Mountain"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "The Lonely Mountain") }));
        return s.objects[idOf(s, "p1", "battlefield", "The Lonely Mountain")]?.tapped;
      };
      expect(run([])).toBe(true);
      expect(run(["Fishing Pole"])).toBe(false);
      const m = scenario({ p1: { battlefield: ["The Lonely Mountain"] } });
      const id = idOf(m, "p1", "battlefield", "The Lonely Mountain");
      expect(chars(m, id).subtypes).toContain("Mountain");
      expect(legalActions(m, "p1").some((a) => a.type === "tapForMana" && a.source === id && a.colors.includes("R"))).toBe(true);
    });

    it("{4}{R}, {T}: a red 2/2 Dwarf, {1} less per Equipment, at sorcery speed only", () => {
      const setup = (equipment: string[]) =>
        scenario({ p1: { battlefield: ["The Lonely Mountain", ...lands("Mountain", 3), ...equipment] } });
      // A single Equipment: {3}{R}, three Mountains are not enough.
      const one = setup(["Fishing Pole"]);
      expect(canActivate(one, "p1", idOf(one, "p1", "battlefield", "The Lonely Mountain"))).toBe(false);
      // Two Equipment: {2}{R}.
      let s = setup(["Fishing Pole", "Skateboard"]);
      const mountain = idOf(s, "p1", "battlefield", "The Lonely Mountain");
      s = settle(activate(s, "p1", mountain));
      const dwarf = idOf(s, "p1", "battlefield", "Dwarf");
      expect([chars(s, dwarf).power, chars(s, dwarf).toughness]).toEqual([2, 2]);
      expect(chars(s, dwarf).colors).toEqual(["R"]);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
      // Outside the main phase: impossible.
      let t = setup(["Fishing Pole", "Skateboard"]);
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "The Lonely Mountain"))).toBe(false);
    });
  });

  it("Dwarven Mauler: equip abilities that target it cost {2} less", () => {
    let s = scenario({ p1: { battlefield: ["Dwarven Mauler", "Bear Cub", "Fishing Pole"] } });
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const mauler = idOf(s, "p1", "battlefield", "Dwarven Mauler");
    // Equip {2} with no mana at all: possible on the Brute, not on the Cub.
    expect(() => activate(s, "p1", pole, undefined, { targets: { t: [bear] } })).toThrow();
    s = settle(activate(s, "p1", pole, undefined, { targets: { t: [mauler] } }));
    expect(s.objects[pole]?.attachedTo).toBe(mauler);
  });

  describe("Dáin's Company", () => {
    it("on entering: a Dwarf or Equipment among the top four cards, the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Mountain", "Plains"],
          hand: ["Dáin's Company"],
          library: ["Opt", "Fishing Pole", "Dwarven Mauler", "Island", "Swamp"],
        },
      });
      let seen: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Dáin's Company"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        seen = namesIn(cur, req.options);
        return pickNamed(cur, req, "Dwarven Mauler");
      });
      expect(seen.sort()).toEqual(["Dwarven Mauler", "Fishing Pole"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Dwarven Mauler"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Swamp");
      expect(library.slice(1).sort()).toEqual(["Fishing Pole", "Island", "Opt"]);
    });

    it("has lifelink as long as you control another Dwarf", () => {
      const alone = scenario({ p1: { battlefield: ["Dáin's Company", "Bear Cub"] } });
      expect(chars(alone, idOf(alone, "p1", "battlefield", "Dáin's Company")).keywords).not.toContain("lifelink");
      const s = scenario({ p1: { battlefield: ["Dáin's Company", "Dwarven Mauler"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Dáin's Company")).keywords).toContain("lifelink");
    });
  });

  describe("Kíli the Resourceful", () => {
    it("another Dwarf or Equipment entering makes you draw, only once per turn", () => {
      let s = scenario({
        p1: { battlefield: ["Kíli the Resourceful", ...lands("Mountain", 2)], hand: ["Dwarven Mauler", "Dwarven Mauler"] },
      });
      s = settle(cast(s, "p1", "Dwarven Mauler"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Dwarven Mauler"));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("storied: the first equip ability each turn costs {0}, not the next", () => {
      let s = scenario({
        p1: { battlefield: ["Kíli the Resourceful", "Fishing Pole", "Skateboard", "Mountain"], hand: ["Opt"] },
      });
      const kili = idOf(s, "p1", "battlefield", "Kíli the Resourceful");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const board = idOf(s, "p1", "battlefield", "Skateboard");
      // Kíli (legendary) and two artifacts: storied as soon as state-based actions are checked.
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.players.p1?.designations).toContain("enduringStory");
      // Free Equip {2}, with a single untapped Mountain that stays untapped.
      s = settle(activate(s, "p1", pole, undefined, { targets: { t: [kili] } }));
      expect(s.objects[pole]?.attachedTo).toBe(kili);
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(false);
      // The second Equip of the turn is paid: {1} for the Skateboard.
      s = settle(activate(s, "p1", board, undefined, { targets: { t: [kili] } }));
      expect(s.objects[board]?.attachedTo).toBe(kili);
      expect(s.objects[idOf(s, "p1", "battlefield", "Mountain")]?.tapped).toBe(true);
    });

    it("storied: the player may pay the printed equip cost instead of {0} (PLAN-M M6), which uses up the first equip", () => {
      let s = scenario({
        p1: { battlefield: ["Kíli the Resourceful", "Fishing Pole", "Skateboard", ...lands("Mountain", 3)] },
      });
      const kili = idOf(s, "p1", "battlefield", "Kíli the Resourceful");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      const board = idOf(s, "p1", "battlefield", "Skateboard");
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const offer = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === pole && a.label?.includes("Equip"));
      const pick = offer?.type === "activate" ? offer.picks?.find((p) => p.slot === "freeCost") : undefined;
      expect(pick).toMatchObject({ options: ["free", "printed"], suggested: ["free"], autoOk: true });
      const untapped = () => idsOf(s, "p1", "battlefield", "Mountain").filter((id) => !s.objects[id]?.tapped).length;
      s = settle(activate(s, "p1", pole, "Equip", { targets: { t: [kili] }, picks: { freeCost: ["printed"] } }));
      expect(s.objects[pole]?.attachedTo).toBe(kili);
      expect(untapped()).toBe(1);
      // The first equip of the turn is used: the Skateboard's costs {1}.
      const next = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === board && a.label?.includes("Equip"));
      expect(next?.type === "activate" && (next.picks ?? []).some((p) => p.slot === "freeCost")).toBe(false);
      s = settle(activate(s, "p1", board, "Equip", { targets: { t: [kili] } }));
      expect(untapped()).toBe(0);
    });

    it("storied: the Axe (token) and Bloodthorn Flail have equip abilities (first of the turn free)", () => {
      // Kíli (legendary), Bloodthorn Flail and the Axe of Iron Hills Blacksmith: storied on the next turn.
      const setup = () => {
        let s = scenario({
          p1: {
            battlefield: ["Kíli the Resourceful", "Bloodthorn Flail", "Bear Cub", ...lands("Plains", 4)],
            hand: ["Iron Hills Blacksmith"],
          },
        });
        s = settle(cast(s, "p1", "Iron Hills Blacksmith"));
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        expect(s.players.p1?.designations).toContain("enduringStory");
        return s;
      };
      const tappedPlains = (s: GameState) => idsOf(s, "p1", "battlefield", "Plains").filter((id) => s.objects[id]?.tapped).length;
      // The Axe first: free; Bloodthorn Flail next: {3}.
      let s = setup();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const axe = idOf(s, "p1", "battlefield", "Axe");
      const flail = idOf(s, "p1", "battlefield", "Bloodthorn Flail");
      s = settle(activate(s, "p1", axe, "Equip", { targets: { t: [bear] } }));
      expect(s.objects[axe]?.attachedTo).toBe(bear);
      expect(tappedPlains(s)).toBe(0);
      s = settle(activate(s, "p1", flail, "{3}", { targets: { t: [bear] } }));
      expect(s.objects[flail]?.attachedTo).toBe(bear);
      expect(tappedPlains(s)).toBe(3);
      // Bloodthorn Flail first: free; the Axe is then paid {2} (the turn log saw the first Equip).
      s = setup();
      const ids = (name: string) => idOf(s, "p1", "battlefield", name);
      s = settle(activate(s, "p1", ids("Bloodthorn Flail"), "{3}", { targets: { t: [ids("Bear Cub")] } }));
      expect(tappedPlains(s)).toBe(0);
      s = settle(activate(s, "p1", ids("Axe"), "Equip", { targets: { t: [ids("Bear Cub")] } }));
      expect(tappedPlains(s)).toBe(2);
    });

    it('storied: the whole equip cost is replaced, not only its mana ("pay {0} rather than", PLAN-L L5)', () => {
      let s = scenario({
        p1: {
          battlefield: ["Kíli the Resourceful", "Bloodthorn Flail", "Fishing Pole", "Bear Cub", "Plains"],
          hand: ["Opt"],
        },
      });
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.players.p1?.designations).toContain("enduringStory");
      const hand = s.players.p1?.hand.length ?? 0;
      const flail = idOf(s, "p1", "battlefield", "Bloodthorn Flail");
      s = settle(activate(s, "p1", flail, "Equip — discard", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(s.objects[flail]?.attachedTo).toBe(idOf(s, "p1", "battlefield", "Bear Cub"));
      // No card discarded.
      expect(s.players.p1?.hand.length).toBe(hand);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(0);
    });

    it("without storied, Equip is paid normally", () => {
      const s = scenario({ p1: { battlefield: ["Kíli the Resourceful", "Fishing Pole", "Bear Cub"] } });
      expect(s.players.p1?.designations ?? []).not.toContain("enduringStory");
      expect(canActivate(s, "p1", idOf(s, "p1", "battlefield", "Fishing Pole"))).toBe(false);
    });
  });

  describe("Chief Warg's Company", () => {
    it("attacks only with two other Wolves; a green 2/2 Wolf at each upkeep", () => {
      let s = scenario({ p1: { battlefield: ["Chief Warg's Company", "Desolation Prowler"] } });
      const chief = idOf(s, "p1", "battlefield", "Chief Warg's Company");
      expect(chars(s, chief).keywords).toContain("trample");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: chief, defender: "p2" }] })).toThrow();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const wolf = idOf(s, "p1", "battlefield", "Wolf");
      expect([chars(s, wolf).power, chars(s, wolf).toughness]).toEqual([2, 2]);
      expect(chars(s, wolf).colors).toEqual(["G"]);
      s = throughCombat(attack(s, [chief]));
      expect(s.players.p2?.life).toBe(15);
    });
  });
});

describe("lot A, white", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const tokens = (s: S, player: string, name: string) => idsOf(s, player, "battlefield", name);

  /** Picks the wanted options when they are offered. */
  const picking =
    (want: string[]): Answer =>
    (req) => {
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  const ability = (s: S, player: string, source: string) =>
    legalActions(s, player).find(
      (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
    );
  const activate = (s: S, player: string, source: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: ability(s, player, source)?.ability ?? -1, ...extra });
  /** Goes to the active player's declare attackers step. */
  const toAttack = (s: S) => advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  const attack = (s: S, player: string, ids: string[], defender: string) =>
    act(toAttack(s), player, { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender })) });

  describe("The Hobbit, lot A - white", () => {
    describe("recruit (Lake-town Lookout)", () => {
      const run = (top: string) => {
        let s = scenario({
          p1: {
            battlefield: ["Lake-town Lookout", "Mountain", "Mountain"],
            hand: ["Lightning Strike"],
            library: [top, "Plains"],
          },
        });
        const lookout = idOf(s, "p1", "battlefield", "Lake-town Lookout");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [lookout] } }));
        return s;
      };

      it("when it dies: draw then discard; a nonland card discarded gives a 1/1 Human Soldier", () => {
        const s = run("Opt");
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Lake-town Lookout", "Opt"]));
        expect(s.players.p1?.hand).toHaveLength(0);
        const soldier = tokens(s, "p1", "Human Soldier");
        expect(soldier).toHaveLength(1);
        expect(pt(s, soldier[0] as string)).toEqual([1, 1]);
        expect(chars(s, soldier[0] as string).colors).toEqual(["W"]);
      });

      it("a land card discarded: no token", () => {
        const s = run("Island");
        expect(namesIn(s, s.players.p1?.graveyard)).toContain("Island");
        expect(tokens(s, "p1", "Human Soldier")).toHaveLength(0);
      });
    });

    it("Celebrate the Mountain-king: exiles an opposing nonland permanent until it leaves, and recruit", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 8), hand: ["Celebrate the Mountain-king", "Thorin's Last Stand"], library: ["Opt"] },
        p2: { battlefield: ["Serra Angel", "Island"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Recruiting discards the drawn Opt.
      s = settle(cast(s, "p1", "Celebrate the Mountain-king"), (req, _player, cur) =>
        picking([angel, ...idsOf(cur, "p1", "hand", "Opt")])(req, "p1", cur),
      );
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(namesIn(s, s.exile)).toContain("Serra Angel");
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      // The enchantment destroyed, the Angel returns.
      const celebrate = idOf(s, "p1", "battlefield", "Celebrate the Mountain-king");
      s = settle(cast(s, "p1", "Thorin's Last Stand", { mode: 1, targets: { t: [celebrate] } }));
      expect(idsOf(s, "p1", "graveyard", "Celebrate the Mountain-king")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
    });

    describe("Dáin, Lord of the Iron Hills", () => {
      const setup = (p1: string[], p2Lands: number) =>
        toAttack(
          scenario({
            p1: { battlefield: p1 },
            p2: { battlefield: ["Bear Cub", ...lands("Mountain", p2Lands)] },
            active: "p2",
          }),
        );

      it("storied: attacking Dáin costs {1} per creature to the attacker", () => {
        const s = setup(["Dáin, Lord of the Iron Hills", "Dwarven Shortsword", "Dwarven Shortsword"], 0);
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).toThrow();
        let t = setup(["Dáin, Lord of the Iron Hills", "Dwarven Shortsword", "Dwarven Shortsword"], 1);
        t = act(t, "p2", {
          type: "declareAttackers",
          attackers: [{ id: idOf(t, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
        });
        expect(t.objects[idOf(t, "p2", "battlefield", "Mountain")]?.tapped).toBe(true);
      });

      it("without storied, the attack is free", () => {
        let s = setup(["Dáin, Lord of the Iron Hills"], 0);
        s = act(s, "p2", {
          type: "declareAttackers",
          attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: "p1" }],
        });
        expect(s.combat?.attackers).toHaveLength(1);
      });
    });

    it("Dwarven Provisioner: {3}{W} - your creatures get +1/+1 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Dwarven Provisioner", "Bear Cub", ...lands("Plains", 4)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const prov = idOf(s, "p1", "battlefield", "Dwarven Provisioner");
      s = settle(activate(s, "p1", prov));
      expect(pt(s, prov)).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Dwarven Shortsword: a 2/2 Dwarf enters, the Equipment attaches to it (+1/+2)", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Dwarven Shortsword"] } });
      s = settle(cast(s, "p1", "Dwarven Shortsword"));
      const dwarf = idOf(s, "p1", "battlefield", "Dwarf");
      expect(s.objects[idOf(s, "p1", "battlefield", "Dwarven Shortsword")]?.attachedTo).toBe(dwarf);
      expect(pt(s, dwarf)).toEqual([3, 4]);
      expect(chars(s, dwarf).colors).toEqual(["R"]);
    });

    it("Eagle of the Great Shelf: when attacking, +1/+1 for each of your other creatures", () => {
      let s = scenario({ p1: { battlefield: ["Eagle of the Great Shelf", "Bear Cub", "Llanowar Elves"] } });
      const eagle = idOf(s, "p1", "battlefield", "Eagle of the Great Shelf");
      s = settle(attack(s, "p1", [eagle], "p2"));
      expect(pt(s, eagle)).toEqual([4, 7]);
    });

    describe("The Eagles Are Coming!", () => {
      it("a creature you own returns to hand; at the next upkeep, a 4/4 flying Bird Soldier", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2)], hand: ["The Eagles Are Coming!"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "The Eagles Are Coming!", { targets: { t: [bear] } }));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
        expect(tokens(s, "p1", "Bird Soldier")).toHaveLength(0);
        s = settle(advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw"));
        const birds = tokens(s, "p1", "Bird Soldier");
        expect(birds).toHaveLength(1);
        expect(pt(s, birds[0] as string)).toEqual([4, 4]);
        expect(chars(s, birds[0] as string).keywords).toContain("flying");
      });

      it("kicked: as many targeted creatures as you like, a Bird for each; not opposing creatures", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 6)], hand: ["The Eagles Are Coming!"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        expect(() => cast(s, "p1", "The Eagles Are Coming!", { kicked: true, targets: { t: [bear, angel] } })).toThrow();
        s = settle(cast(s, "p1", "The Eagles Are Coming!", { kicked: true, targets: { t: [bear, elves] } }));
        expect(s.players.p1?.hand).toHaveLength(2);
        s = settle(advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw"));
        expect(tokens(s, "p1", "Bird Soldier")).toHaveLength(2);
      });

      it("a creature you own controlled by an opponent returns to your hand; not a stolen creature", () => {
        let s = scenario({
          p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 2)], hand: ["The Eagles Are Coming!"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        steal(s, elves, "p2");
        steal(s, bear, "p1");
        expect(() => cast(s, "p1", "The Eagles Are Coming!", { targets: { t: [bear] } })).toThrow();
        s = settle(cast(s, "p1", "The Eagles Are Coming!", { targets: { t: [elves] } }));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Llanowar Elves"]);
      });
    });

    it("Esgaroth Garrison: its power is the number of your creatures; on entering, recruit", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Esgaroth Garrison"], library: ["Opt"] },
      });
      s = settle(cast(s, "p1", "Esgaroth Garrison"));
      const garrison = idOf(s, "p1", "battlefield", "Esgaroth Garrison");
      // The Cub, the Garrison and the Human Soldier from recruiting.
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      expect(pt(s, garrison)).toEqual([3, 5]);
    });

    describe("Fíli the Pathfinder", () => {
      it("Fíli or another nontoken Dwarf enters: a 2/2 Dwarf; a Dwarf token triggers nothing", () => {
        let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Fíli the Pathfinder", "Dwarven Provisioner"] } });
        s = settle(cast(s, "p1", "Fíli the Pathfinder"));
        expect(tokens(s, "p1", "Dwarf")).toHaveLength(1);
        s = settle(cast(s, "p1", "Dwarven Provisioner"));
        expect(tokens(s, "p1", "Dwarf")).toHaveLength(2);
      });

      it("storied: your creatures get +1/+1", () => {
        let s = scenario({ p1: { battlefield: ["Fíli the Pathfinder", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        expect(pt(s, bear)).toEqual([2, 2]);
        let t = scenario({
          p1: { battlefield: ["Fíli the Pathfinder", "Bear Cub", "Dwarven Shortsword", "Dwarven Shortsword"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        t = settle(t);
        expect(pt(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(t, idOf(t, "p1", "battlefield", "Fíli the Pathfinder"))).toEqual([3, 3]);
        expect(pt(t, idOf(t, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        s = settle(s);
        expect(pt(s, bear)).toEqual([2, 2]);
      });
    });

    it("Gleaming Splendor: two targeted players draw; an opponent's second card this turn gives a Treasure", () => {
      let s = scenario({ p1: { battlefield: ["Gleaming Splendor", ...lands("Plains", 6)] } });
      const splendor = idOf(s, "p1", "battlefield", "Gleaming Splendor");
      s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(0);
      s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
      expect(s.players.p2?.hand).toHaveLength(2);
      // Your own second card doesn't count: a single Treasure.
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Iron Hills Blacksmith: on entering, an Axe Equipment (+1/+0, equip {2})", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Iron Hills Blacksmith"] } });
      s = settle(cast(s, "p1", "Iron Hills Blacksmith"));
      const axe = idOf(s, "p1", "battlefield", "Axe");
      expect(chars(s, axe).subtypes).toContain("Equipment");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", axe, { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Iron Hills Blacksmith")).keywords).toContain("doubleStrike");
    });

    describe("Lake-town Toymaker", () => {
      it("at the beginning of combat, with two cards drawn this turn: another creature gets +3/+0 and first strike", () => {
        let s = scenario({
          p1: { battlefield: ["Lake-town Toymaker", "Bear Cub", "Gleaming Splendor", ...lands("Plains", 6)] },
        });
        const splendor = idOf(s, "p1", "battlefield", "Gleaming Splendor");
        for (let i = 0; i < 2; i++) s = settle(activate(s, "p1", splendor, { targets: { t: ["p1", "p2"] } }));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(
          advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0),
          picking([bear]),
        );
        expect(pt(s, bear)).toEqual([5, 2]);
        expect(chars(s, bear).keywords).toContain("firstStrike");
      });

      it("without two cards drawn: nothing", () => {
        let s = scenario({ p1: { battlefield: ["Lake-town Toymaker", "Bear Cub"] } });
        s = toAttack(s);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });
    });

    it("Magnificent End: {3} less against a tapped creature; 5 damage", () => {
      const s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Magnificent End"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      expect(() => cast(s, "p1", "Magnificent End", { targets: { t: [dragon] } })).toThrow();
      const t = settle(cast(s, "p1", "Magnificent End", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("Moment of Glory: a counter on the target; cast from the graveyard (flashback), also on each of your other creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 6)], hand: ["Moment of Glory"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Moment of Glory", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Moment of Glory"), targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(namesIn(s, s.exile)).toContain("Moment of Glory");
    });

    it("The Mountain-king's Return: II a creature with MV 3 or less returns from the graveyard; III a +1/+1 counter", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "The Mountain-king's Return", counters: { lore: 1 } }],
          graveyard: ["Bear Cub", "Serra Angel"],
        },
        active: "p2",
        step: "end",
      });
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
      s = settle(s, picking([bear]));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(idsOf(s, "p1", "graveyard", "The Mountain-king's Return")).toHaveLength(1);
    });

    it("Ori, Keeper of Songs: storied, +1/+0 and vigilance", () => {
      let s = settle(scenario({ p1: { battlefield: ["Ori, Keeper of Songs"] } }));
      const ori = idOf(s, "p1", "battlefield", "Ori, Keeper of Songs");
      expect(pt(s, ori)).toEqual([3, 3]);
      expect(chars(s, ori).keywords).not.toContain("vigilance");
      s = settle(scenario({ p1: { battlefield: ["Ori, Keeper of Songs", "Dwarven Shortsword", "Dwarven Shortsword"] } }));
      const ori2 = idOf(s, "p1", "battlefield", "Ori, Keeper of Songs");
      expect(pt(s, ori2)).toEqual([4, 3]);
      expect(chars(s, ori2).keywords).toContain("vigilance");
    });

    it("The Queen of Dale: an opponent's first noncreature spell each turn makes you recruit", () => {
      let s = scenario({
        p1: { battlefield: ["The Queen of Dale"], library: ["Opt", "Opt", "Opt"] },
        p2: { battlefield: [...lands("Island", 2), ...lands("Forest", 1)], hand: ["Opt", "Opt", "Llanowar Elves"] },
        active: "p2",
      });
      s = settle(cast(s, "p2", "Llanowar Elves"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(0);
      s = settle(cast(s, "p2", "Opt"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
      s = settle(cast(s, "p2", "Opt"));
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
    });

    it('The Queen of Dale: "their first noncreature spell" is checked on trigger; a second spell in response doesn\'t cancel it', () => {
      let s = scenario({
        p1: { battlefield: ["The Queen of Dale"], library: ["Opt", "Opt", "Opt"] },
        p2: { battlefield: lands("Island", 2), hand: ["Opt", "Opt"] },
        active: "p2",
      });
      s = cast(s, "p2", "Opt");
      expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(1);
      // In response to the trigger, the opponent casts a second noncreature spell (which triggers nothing).
      s = cast(s, "p2", "Opt");
      expect(s.stack.filter((x) => x.kind === "ability")).toHaveLength(1);
      s = settle(s);
      expect(tokens(s, "p1", "Human Soldier")).toHaveLength(1);
    });

    it("Roads Go Ever, Ever On: I exiles two Plains, +2 life; II and III return them to hand; IV bolsters on attack", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Bear Cub"],
          hand: ["Roads Go Ever, Ever On"],
          library: [...lands("Plains", 3), ...lands("Forest", 7)],
        },
      });
      s = settle(cast(s, "p1", "Roads Go Ever, Ever On"));
      expect(s.players.p1?.life).toBe(22);
      expect(namesIn(s, s.exile)).toEqual(["Plains", "Plains"]);
      expect(s.players.p1?.library).toHaveLength(8);
      // Chapter II.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3));
      expect(namesIn(s, s.exile)).toEqual(["Plains"]);
      expect(namesIn(s, s.players.p1?.hand)).toContain("Plains");
      // Chapter III.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5));
      expect(s.exile).toHaveLength(0);
      // Chapter IV: the Saga is sacrificed, the effect lasts for the turn.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 7));
      expect(idsOf(s, "p1", "graveyard", "Roads Go Ever, Ever On")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, "p1", [bear], "p2"), picking([bear]));
      // Two Plains controlled: +2/+2.
      expect(pt(s, bear)).toEqual([4, 4]);
    });

    it("Settle the Wreckage: exiles the targeted player's attackers; they search for as many basic lands, tapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Settle the Wreckage"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Llanowar Elves"], library: [...lands("Mountain", 3), "Opt"] },
        active: "p2",
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = attack(s, "p2", [bear, angel], "p1");
      // p2 has priority after the declaration; p1 responds.
      s = act(s, "p2", { type: "pass" });
      s = settle(cast(s, "p1", "Settle the Wreckage", { targets: { t: ["p2"] } }));
      expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
      const mountains = idsOf(s, "p2", "battlefield", "Mountain");
      expect(mountains).toHaveLength(2);
      expect(mountains.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    describe("Stone by Sunlight", () => {
      it("destroys a creature with power 4 or greater, not a smaller one", () => {
        const s = scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Stone by Sunlight"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        expect(() =>
          cast(s, "p1", "Stone by Sunlight", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
        ).toThrow();
        const t = settle(
          cast(s, "p1", "Stone by Sunlight", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        );
        expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("or the creature becomes an artifact in addition and gains indestructible until end of turn", () => {
        let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Stone by Sunlight"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Stone by Sunlight", { mode: 1, targets: { c: [bear] } }));
        expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
        expect(chars(s, bear).keywords).toContain("indestructible");
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(chars(s, bear).types).not.toContain("Artifact");
      });
    });

    it("Thorin's Last Stand: your creatures get +2/+1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Thorin's Last Stand"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Thorin's Last Stand", { mode: 0 }));
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([4, 3]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("An Unexpected Party // At the Door: X 2/2 Dwarves, then the enchantment from exile gives +2/+2 to the chosen type", () => {
      let s = scenario({
        // No nontoken Dwarf in the game: the type of the tokens it creates is offered.
        p1: {
          battlefield: [...lands("Plains", 9), "Bear Cub"],
          hand: ["An Unexpected Party // At the Door"],
          library: lands("Plains", 6),
        },
      });
      s = settle(cast(s, "p1", "An Unexpected Party // At the Door", { face: 1, x: 2 }));
      const dwarves = tokens(s, "p1", "Dwarf");
      expect(dwarves).toHaveLength(2);
      expect(namesIn(s, s.exile)).toEqual(["An Unexpected Party // At the Door"]);
      const party = s.exile[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: party }), (req) =>
        req.type === "pick" && req.options.includes("Dwarf") ? ["Dwarf"] : undefined,
      );
      expect(pt(s, dwarves[0] as string)).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Gaze in Wonder (Velvetwing Butterflies): taps one or two targeted creatures", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Velvetwing Butterflies // Gaze in Wonder"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const ids = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Velvetwing Butterflies // Gaze in Wonder", { face: 1, targets: { t: ids } }));
      expect(ids.every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(namesIn(s, s.exile)).toEqual(["Velvetwing Butterflies // Gaze in Wonder"]);
    });

    describe("Vow to Erebor", () => {
      it("untaps the creature, +2/+2; a Dwarf can receive an Equipment you control", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), { name: "Dwarven Provisioner", tapped: true }, "Dwarven Shortsword"],
            hand: ["Vow to Erebor"],
          },
        });
        const prov = idOf(s, "p1", "battlefield", "Dwarven Provisioner");
        const sword = idOf(s, "p1", "battlefield", "Dwarven Shortsword");
        s = settle(cast(s, "p1", "Vow to Erebor", { targets: { t: [prov] } }), (req) => (req.type === "yesNo" ? [1] : undefined));
        expect(s.objects[prov]?.tapped).toBe(false);
        expect(s.objects[sword]?.attachedTo).toBe(prov);
        // 2/2, +2/+2, +1/+2.
        expect(pt(s, prov)).toEqual([5, 6]);
      });

      it("a creature that is not a Dwarf doesn't receive an Equipment", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), { name: "Bear Cub", tapped: true }, "Dwarven Shortsword"],
            hand: ["Vow to Erebor"],
          },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Vow to Erebor", { targets: { t: [bear] } }), (req) => (req.type === "yesNo" ? [1] : undefined));
        expect(s.objects[bear]?.tapped).toBe(false);
        expect(s.objects[idOf(s, "p1", "battlefield", "Dwarven Shortsword")]?.attachedTo).toBeUndefined();
        expect(pt(s, bear)).toEqual([4, 4]);
      });
    });
  });
});

describe("lot A, blue", () => {
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
  /** Plays up to the second main phase (without blocking), answering choices. */
  const toMain2 = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Discards: the named card. */
  const discarding =
    (name: string): Answer =>
    (req, _player, cur) =>
      req.type === "pick" && req.options.some((id) => nameOf(cur, id) === name) ? pickNamed(cur, req, name) : undefined;

  const TRINKET = customCard({
    name: "Hob Test Trinket",
    typeLine: "Artifact",
    types: ["Artifact"],
  });

  describe("The Hobbit, lot A - blue", () => {
    describe("Bilbo, Luckwearer // Burglar's Plot", () => {
      const BILBO = "Bilbo, Luckwearer // Burglar's Plot";

      it("can't be blocked; its combat damage to a player: draw, then discard", () => {
        let s = scenario({
          p1: { battlefield: [BILBO], hand: ["Lightning Strike"], library: ["Island", "Island"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bilbo = idOf(s, "p1", "battlefield", BILBO);
        expect(chars(s, bilbo).keywords).toContain("unblockable");
        s = attack(s, [bilbo]);
        expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), bilbo)).toBe(false);
        s = toMain2(s, discarding("Lightning Strike"));
        expect(s.players.p2?.life).toBe(19);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Lightning Strike"]);
      });

      it("Burglar's Plot: exchanges control of two creatures; two permanents with no common type are refused", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 5), "Bear Cub", TRINKET], hand: [BILBO] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const trinket = idOf(s, "p1", "battlefield", TRINKET.name);
        const card = idOf(s, "p1", "hand", BILBO);
        // Mode "creatures" (1): a noncreature artifact is not a legal target.
        expect(() => act(s, "p1", { type: "cast", card, face: 1, mode: 1, targets: { a: [trinket], b: [angel] } })).toThrow();
        s = settle(act(s, "p1", { type: "cast", card, face: 1, mode: 1, targets: { a: [bear], b: [angel] } }));
        expect(s.objects[bear]?.controller).toBe("p2");
        expect(s.objects[angel]?.controller).toBe("p1");
        // Adventure: the card is exiled, and the creature is cast from exile.
        expect(namesIn(s, s.exile)).toContain(BILBO);
      });
    });

    describe("Bilbo, Thief in the Night", () => {
      it("when attacking, cast an instant from your graveyard ({1} less), exiled afterwards", () => {
        let s = scenario({
          p1: { battlefield: ["Bilbo, Thief in the Night", "Mountain"], graveyard: ["Lightning Strike"] },
        });
        s = untilCastNow(attack(s, [idOf(s, "p1", "battlefield", "Bilbo, Thief in the Night")]));
        const offered = castNowOf(s)?.cards ?? [];
        expect(namesIn(s, offered)).toEqual(["Lightning Strike"]);
        // {1}{R} minus {1}: the single Mountain is enough.
        s = settle(act(s, "p1", { type: "cast", card: offered[0] as string, targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
        expect(namesIn(s, s.exile)).toContain("Lightning Strike");
        expect(s.players.p1?.graveyard).toHaveLength(0);
      });

      it("spells cast from the top of the library cost {1} less too (PLAN-M M8b)", () => {
        const TOP = customCard({
          name: "Test Top Caster",
          typeLine: "Enchantment",
          types: ["Enchantment"],
          abilities: [playerStatic({ playFrom: { zone: "libraryTop" } })],
        });
        const s = scenario({
          p1: { battlefield: ["Bilbo, Thief in the Night", TOP, "Forest"], library: ["Bear Cub", "Forest"] },
        });
        // Bear Cub ({1}{G}) for {G}.
        expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === s.players.p1?.library[0])).toBe(true);
        const t = scenario({ p1: { battlefield: ["Bear Cub", TOP, "Forest"], library: ["Bear Cub", "Forest"] } });
        expect(legalActions(t, "p1").some((a) => a.type === "cast" && a.card === t.players.p1?.library[0])).toBe(false);
      });

      it("an artifact cast this way then countered goes to the graveyard; only instants and sorceries are exiled (PLAN-M M8b)", () => {
        let s = scenario({
          p1: { battlefield: ["Bilbo, Thief in the Night"], graveyard: ["Fishing Pole"] },
          p2: { battlefield: lands("Island", 3), hand: ["Cancel"] },
        });
        s = untilCastNow(attack(s, [idOf(s, "p1", "battlefield", "Bilbo, Thief in the Night")]));
        const pole = (castNowOf(s)?.cards ?? [])[0] as string;
        expect(nameOf(s, pole)).toBe("Fishing Pole");
        // {1} minus {1}: free.
        s = act(s, "p1", { type: "cast", card: pole });
        const spell = s.stack.find((x) => x.kind === "spell")?.id as string;
        s = passAccepting(s, (x) => x.pending?.player === "p2" && x.pending.kind === "priority");
        s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Cancel"), targets: { t: [spell] } });
        s = passAccepting(s, (x) => !x.stack.some((i) => i.kind === "spell"));
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Fishing Pole"]);
        expect(namesIn(s, s.exile)).not.toContain("Fishing Pole");
      });

      it("without an artifact, instant or sorcery in the graveyard, nothing is offered", () => {
        let s = scenario({ p1: { battlefield: ["Bilbo, Thief in the Night"], graveyard: ["Bear Cub"] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Bilbo, Thief in the Night")]);
        s = toMain2(s);
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
        expect(s.players.p2?.life).toBe(18);
      });
    });

    it("Bilbo Baggins, Burglar: on entering, draw; Take a Glance: scry 2, then the creature is cast from exile", () => {
      const BAGGINS = "Bilbo Baggins, Burglar // Take a Glance";
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: [BAGGINS], library: ["Opt", "Forest", "Island"] } });
      let scried = 0;
      s = settle(cast(s, "p1", BAGGINS, { face: 1 }), (req, _player, cur) => {
        if (req.type !== "pick" || !req.prompt.startsWith("Scry")) return undefined;
        scried = req.options.length;
        return pickNamed(cur, req, "Opt");
      });
      expect(scried).toBe(2);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest", "Island", "Opt"]);
      const exiled = s.exile.find((id) => nameOf(s, id) === BAGGINS) as string;
      expect(exiled).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      expect(idsOf(s, "p1", "battlefield", BAGGINS)).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    });

    describe("Confusticate and Bebother", () => {
      it("counters a spell whose controller can't pay {4}", () => {
        let s = scenario({
          p1: {
            battlefield: ["Mountain", "Mountain", ...lands("Island", 3)],
            hand: ["Lightning Strike", "Confusticate and Bebother"],
          },
        });
        s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
        const strike = s.stack[0]?.id as string;
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 0, targets: { t: [strike] } }));
        expect(s.players.p2?.life).toBe(20);
        expect(namesIn(s, s.players.p1?.graveyard)).toContain("Lightning Strike");
      });

      it("the spell resolves if its controller pays {4}", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confusticate and Bebother"] },
          p2: { battlefield: [...lands("Mountain", 6)], hand: ["Lightning Strike"] },
          active: "p2",
        });
        s = cast(s, "p2", "Lightning Strike", { targets: { t: ["p1"] } });
        const strike = s.stack[0]?.id as string;
        s = act(s, "p2", { type: "pass" });
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 0, targets: { t: [strike] } }));
        expect(s.players.p1?.life).toBe(17);
      });

      it("second mode: draw two cards, then discard a card", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Confusticate and Bebother"], library: ["Opt", "Forest"] },
        });
        s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 1 }), discarding("Forest"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Confusticate and Bebother", "Forest"]);
      });
    });

    it("Elven Raft-Steerer: a land enters - tap an opposing creature, or untap one of yours", () => {
      let s = scenario({
        p1: { battlefield: ["Elven Raft-Steerer", { name: "Bear Cub", tapped: true }], hand: ["Island", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.type === "pick" && req.options.includes(angel) ? [angel] : undefined,
      );
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[bear]?.tapped).toBe(true);
      s.turn.landsPlayed = 0;
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.tapped).toBe(false);
    });

    it("Elvenking's Harper: {4}{U} - the targeted creature can't be blocked this turn", () => {
      let s = scenario({ p1: { battlefield: ["Elvenking's Harper", "Bear Cub", ...lands("Island", 5)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Elvenking's Harper"), undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("unblockable");
    });

    it("Enchanted River's Grasp: taps the creature, removes its counters; it loses its abilities and no longer untaps", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Enchanted River's Grasp"] },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 2 } }] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Enchanted River's Grasp", { targets: { enchant: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, angel).keywords).not.toContain("flying");
      expect(pt(s, angel)).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
    });

    it("Fateful Discovery: an artifact enters under your control, draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Fateful Discovery"], hand: [TRINKET], library: ["Island"] } });
      s = settle(cast(s, "p1", TRINKET.name));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    });

    it("Gandalf, Wandering Wizard: {6} - its owner shuffles it into their library and draws three cards", () => {
      let s = scenario({
        p1: { battlefield: ["Gandalf, Wandering Wizard", ...lands("Island", 6)], library: lands("Forest", 5) },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard")));
      expect(idsOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(namesIn(s, [...(s.players.p1?.library ?? []), ...(s.players.p1?.hand ?? [])])).toContain(
        "Gandalf, Wandering Wizard",
      );
    });

    it("Gandalf, Wandering Wizard: stolen, it returns to its owner's library, who draws", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), library: lands("Island", 5) },
        p2: { battlefield: ["Gandalf, Wandering Wizard"], library: lands("Forest", 5) },
      });
      const gandalf = idOf(s, "p2", "battlefield", "Gandalf, Wandering Wizard");
      steal(s, gandalf, "p1");
      s = settle(activate(s, "p1", gandalf));
      expect(s.players.p2?.hand).toHaveLength(3);
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    describe("Recruit", () => {
      it("Great Gilded Boat: when you attack, draw then discard; a nonland card discarded gives a Human Soldier", () => {
        let s = scenario({
          p1: { battlefield: ["Great Gilded Boat", "Bear Cub"], hand: ["Lightning Strike"], library: ["Island"] },
        });
        s = toMain2(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), discarding("Lightning Strike"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
        const soldiers = idsOf(s, "p1", "battlefield", "Human Soldier");
        expect(soldiers).toHaveLength(1);
        expect(pt(s, soldiers[0] as string)).toEqual([1, 1]);
        expect(chars(s, soldiers[0] as string).colors).toEqual(["W"]);
      });

      it("Long Lake Nuisance: on entering, recruit; a land discarded gives no token", () => {
        let s = scenario({
          p1: { battlefield: lands("Island", 4), hand: ["Long Lake Nuisance", "Forest"], library: ["Opt"] },
        });
        s = settle(cast(s, "p1", "Long Lake Nuisance"), discarding("Forest"));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(idsOf(s, "p1", "battlefield", "Human Soldier")).toHaveLength(0);
      });

      it("Sound the Trumpets: counters; a spell with mana value 2 or less gives a recruit, not beyond", () => {
        const run = (spell: string, mana: string[]) => {
          let s = scenario({
            p1: { battlefield: lands("Island", 3), hand: ["Sound the Trumpets", "Lightning Strike"], library: ["Island"] },
            p2: { battlefield: mana, hand: [spell] },
            active: "p2",
          });
          s = cast(s, "p2", spell, spell === "Lightning Strike" ? { targets: { t: ["p1"] } } : {});
          const target = s.stack[0]?.id as string;
          s = act(s, "p2", { type: "pass" });
          s = settle(cast(s, "p1", "Sound the Trumpets", { targets: { t: [target] } }), discarding("Lightning Strike"));
          expect(namesIn(s, s.players.p2?.graveyard)).toContain(spell);
          return s;
        };
        const cheap = run("Lightning Strike", lands("Mountain", 2));
        expect(cheap.players.p1?.life).toBe(20);
        expect(idsOf(cheap, "p1", "battlefield", "Human Soldier")).toHaveLength(1);
        const big = run("Serra Angel", lands("Plains", 5));
        expect(idsOf(big, "p1", "battlefield", "Human Soldier")).toHaveLength(0);
        expect(namesIn(big, big.players.p1?.hand).sort()).toEqual(["Lightning Strike"]);
      });
    });

    it("Lakeshore Apothecary: the second card drawn each turn puts a +1/+1 counter on it", () => {
      let s = scenario({
        p1: { battlefield: ["Lakeshore Apothecary", ...lands("Island", 2)], hand: ["Opt", "Opt"], library: lands("Island", 4) },
      });
      const apo = idOf(s, "p1", "battlefield", "Lakeshore Apothecary");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[apo]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[apo]?.counters["+1/+1"]).toBe(1);
    });

    it("Gone Fishing: exiles two of your creatures and/or lands, then returns them (untapped, without counters)", () => {
      const MARINERS = "Lake-town Mariners // Gone Fishing";
      let s = scenario({
        p1: {
          battlefield: [{ name: "Island", tapped: true }, ...lands("Island", 4), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: [MARINERS],
        },
      });
      const tapped = s.battlefield.find((id) => s.objects[id]?.tapped) as string;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", MARINERS, { face: 1, targets: { t: [tapped, bear] } }));
      const newBear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(newBear).not.toBe(bear);
      expect(s.objects[newBear]?.counters["+1/+1"] ?? 0).toBe(0);
      // Four Islands paid; the tapped exiled Island returns untapped.
      expect(idsOf(s, "p1", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(5);
    });

    it("The Lord of the Eagles: costs {X} less, X being the total power of your flying creatures; flash", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", "Bear Cub", ...lands("Island", 5)], hand: ["The Lord of the Eagles"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      // {7}{U}{U} - 4 (Serra Angel; the Bear doesn't fly): five Islands.
      s = settle(cast(s, "p1", "The Lord of the Eagles"));
      expect(idsOf(s, "p1", "battlefield", "The Lord of the Eagles")).toHaveLength(1);
    });

    it("Mirkwood Meditator: a land enters - you may make its base P/T 4/2 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Mirkwood Meditator"], hand: ["Island"] } });
      const med = idOf(s, "p1", "battlefield", "Mirkwood Meditator");
      expect(pt(s, med)).toEqual([2, 4]);
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(pt(s, med)).toEqual([4, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, med)).toEqual([2, 4]);
    });

    describe("Most Decrepit Old Bird // Speak Secrets", () => {
      const BIRD = "Most Decrepit Old Bird // Speak Secrets";

      it("Threshold: +1/+1 with seven or more cards in your graveyard", () => {
        const s = scenario({ p1: { battlefield: [BIRD], graveyard: lands("Island", 6) } });
        const bird = idOf(s, "p1", "battlefield", BIRD);
        expect(pt(s, bird)).toEqual([1, 1]);
        const t = scenario({ p1: { battlefield: [BIRD], graveyard: lands("Island", 7) } });
        expect(pt(t, idOf(t, "p1", "battlefield", BIRD))).toEqual([2, 2]);
      });

      it("Speak Secrets: mill four cards, then an instant or sorcery milled goes to your hand", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 2),
            hand: [BIRD],
            library: ["Forest", "Opt", "Bear Cub", "Island", "Lightning Strike"],
          },
        });
        s = settle(cast(s, "p1", BIRD, { face: 1 }));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Lightning Strike"]);
      });
    });

    describe("Old Fat Spider Can't See Me", () => {
      it("I: one of your creatures has hexproof as long as the Saga stays", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Old Fat Spider Can't See Me"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Old Fat Spider Can't See Me"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
        );
        expect(chars(s, bear).keywords).toContain("hexproof");
      });

      it("II: damage to the targeted creature is prevented; III and IV: draw; with the Saga gone, nothing", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Old Fat Spider Can't See Me", counters: { lore: 1 } }, "Bear Cub"] },
          active: "p2",
          step: "end",
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
        expect(s.objects[idOf(s, "p1", "battlefield", "Old Fat Spider Can't See Me")]?.counters.lore).toBe(2);
        s = toMain2(attack(s, [bear]));
        expect(s.players.p2?.life).toBe(20);
        // Chapter III: a card in addition to the turn's draw.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 4 && x.turn.step === "main1");
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(3);
        // Chapter IV: draw, then the Saga is sacrificed; the prevention ends.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 6 && x.turn.step === "main1");
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(5);
        expect(idsOf(s, "p1", "graveyard", "Old Fat Spider Can't See Me")).toHaveLength(1);
        s = toMain2(attack(s, [bear]));
        expect(s.players.p2?.life).toBe(18);
      });

      it("II: the prevention is an effect, not an ability of the creature: losing all abilities doesn't end it (PLAN-M M10d)", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Old Fat Spider Can't See Me", counters: { lore: 1 } }, "Bear Cub", "Plains", "Swamp", "Swamp"],
            hand: ["Abigale, Eloquent First-Year"],
          },
          active: "p2",
          step: "end",
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
        s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
        expect(chars(s, bear).abilities).toHaveLength(0);
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Abigale, Eloquent First-Year") }), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
        );
        expect(chars(s, bear).keywords).toContain("lifelink");
        s = toMain2(attack(s, [bear]));
        expect(s.players.p2?.life).toBe(20);
        expect(s.players.p1?.life).toBe(20);
      });
    });

    it("Plunder the Trollshaws: draw a card; cast from the graveyard (flashback {3}{U}), two cards instead", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), hand: ["Plunder the Trollshaws"], library: lands("Forest", 5) },
      });
      s = settle(cast(s, "p1", "Plunder the Trollshaws"));
      expect(s.players.p1?.hand).toHaveLength(1);
      const card = idOf(s, "p1", "graveyard", "Plunder the Trollshaws");
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(namesIn(s, s.exile)).toContain("Plunder the Trollshaws");
    });

    it("Ravenhill Flock: each card drawn puts a +1/+1 counter on it", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ravenhill Flock", ...lands("Island", 3)],
          hand: ["Confusticate and Bebother"],
          library: lands("Forest", 3),
        },
      });
      const flock = idOf(s, "p1", "battlefield", "Ravenhill Flock");
      s = settle(cast(s, "p1", "Confusticate and Bebother", { mode: 1 }));
      expect(s.objects[flock]?.counters["+1/+1"]).toBe(2);
    });

    it("Riddles in the Dark: four cards into two piles; the opponent chooses the one that goes to your hand, the other to the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Riddles in the Dark"],
          library: ["Opt", "Bear Cub", "Forest", "Island", "Serra Angel"],
        },
      });
      s = settle(cast(s, "p1", "Riddles in the Dark"), (req, _player, cur) => {
        if (req.type !== "pick" || req.intent !== "piles") return undefined;
        // p1: the face-down pile is the Opt alone; p2 gives the face-down pile.
        if (req.options.includes("down")) return ["down"];
        return pickNamed(cur, req, "Opt");
      });
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island", "Riddles in the Dark"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Serra Angel"]);
    });

    it("Riddles in the Dark (three players): you choose the opponent who chooses the pile", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Riddles in the Dark"],
          library: ["Opt", "Bear Cub", "Forest", "Island", "Serra Angel"],
        },
      });
      const offered: string[][] = [];
      let chooser: PlayerId | undefined;
      s = settle(cast(s, "p1", "Riddles in the Dark"), (req, player, cur) => {
        if (req.type === "pick" && req.options.includes("p3")) {
          offered.push([player, ...req.options]);
          return ["p3"];
        }
        if (req.type !== "pick" || req.intent !== "piles") return undefined;
        if (req.options.includes("down")) {
          chooser = player;
          return ["down"];
        }
        return pickNamed(cur, req, "Opt");
      });
      expect(offered).toEqual([["p1", "p2", "p3"]]);
      expect(chooser).toBe("p3");
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    });

    it("Roll-Roll-Roll-Roll: exiles one of your creatures, which returns at the beginning of the next end step", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: ["Roll-Roll-Roll-Roll"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Roll-Roll-Roll-Roll"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      s = advanceUntil(
        s,
        (x) =>
          x.turn.step === "end" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority" &&
          x.pending.player === "p1",
      );
      s = settle(s);
      const back = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Uncover the Moon-Letters: a noncreature spell - draw X cards (mana spent), then discard two", () => {
      let s = scenario({
        p1: {
          battlefield: ["Uncover the Moon-Letters", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          library: ["Opt", "Island", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.options.includes("yes") ? ["yes"] : undefined,
      );
      expect(s.players.p1?.library).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(3);
    });

    describe("Uneasy Partings", () => {
      it("costs {1} less if it targets a nontoken attacking creature; its owner puts it on top or bottom", () => {
        let s = scenario({
          p1: { battlefield: ["Bear Cub"] },
          p2: { battlefield: lands("Island", 3), hand: ["Uneasy Partings"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = attack(s, [bear]);
        s = act(s, "p1", { type: "pass" });
        s = settle(cast(s, "p2", "Uneasy Partings", { targets: { t: [bear] } }), (req) =>
          req.intent === "topOrBottom" ? ["bottom"] : undefined,
        );
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
        expect(nameOf(s, s.players.p1?.library.at(-1) as string)).toBe("Bear Cub");
        // {3}{U} minus {1}: the three Islands are enough.
        expect(idsOf(s, "p2", "battlefield", "Island").filter((id) => !s.objects[id]?.tapped)).toHaveLength(0);
      });

      it("without a targeted attacking creature, it costs {3}{U}", () => {
        const s = scenario({
          p1: { battlefield: lands("Island", 3), hand: ["Uneasy Partings"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        expect(() => cast(s, "p1", "Uneasy Partings", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
      });
    });

    describe("Wizard's Staff", () => {
      it("Equip Wizard {1}; the equipped creature has prowess", () => {
        let s = scenario({
          p1: {
            battlefield: ["Wizard's Staff", "Gandalf, Wandering Wizard", "Bear Cub", "Island", "Mountain", "Mountain"],
            hand: ["Lightning Strike"],
          },
        });
        const staff = idOf(s, "p1", "battlefield", "Wizard's Staff");
        const gandalf = idOf(s, "p1", "battlefield", "Gandalf, Wandering Wizard");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        // Equip Wizard only targets a Wizard.
        expect(() => activate(s, "p1", staff, "Wizard", { targets: { t: [bear] } })).toThrow();
        s = settle(activate(s, "p1", staff, "Wizard", { targets: { t: [gandalf] } }));
        expect(s.objects[staff]?.attachedTo).toBe(gandalf);
        expect(chars(s, gandalf).keywords).toContain("prowess");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        // The granted prowess triggers twice (triggered ability of the equipped creature).
        expect(pt(s, gandalf)).toEqual([6, 7]);
      });

      it("the equipped creature's triggered abilities trigger one more time", () => {
        let s = scenario({
          p1: {
            battlefield: ["Wizard's Staff", "Ravenhill Flock", ...lands("Island", 4)],
            hand: ["Opt"],
            library: lands("Forest", 3),
          },
        });
        const staff = idOf(s, "p1", "battlefield", "Wizard's Staff");
        const flock = idOf(s, "p1", "battlefield", "Ravenhill Flock");
        s = settle(activate(s, "p1", staff, "{3}", { targets: { t: [flock] } }));
        expect(s.objects[staff]?.attachedTo).toBe(flock);
        s = settle(cast(s, "p1", "Opt"));
        expect(s.objects[flock]?.counters["+1/+1"]).toBe(2);
      });
    });
  });
});

describe("lot A, black", () => {
  type S = GameState;
  /** Answer to a choice (`undefined`: the suggestion), according to the current position. */
  type Answer = (req: ChoiceRequest, cur: S, player: PlayerId) => ChoiceValue[] | undefined;
  /** Passes and answers choices until an empty stack, with no trigger pending. Defenders don't block. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur, p.player) ?? p.request.suggested });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  /** Advances (without attacking or blocking) until the condition, answering choices. */
  const advanceAnswering = (s: S, until: (x: S) => boolean, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 600 && !until(cur); i++) {
      const p = cur.pending;
      if (!p) break;
      if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
      else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else if (p.kind === "discard") {
        const hand = cur.players[p.player]?.hand ?? [];
        cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, Math.max(0, hand.length - 7)) });
      } else if (p.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, cur, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Selects, among the options of a "pick" choice, the indicated objects (if they are there). */
  const picking =
    (ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.some((id) => req.options.includes(id))
        ? ids.filter((id) => req.options.includes(id))
        : undefined;
  /** The Army controlled by `player` (or `undefined`). */
  const armyOf = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && chars(s, id).subtypes.includes("Army"));
  /** Goes to p1's declare attackers step and attacks p2 with `attackers`. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceAnswering(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };

  describe("The Hobbit, lot A - black", () => {
    describe("Along the Crooked Way", () => {
      it("on entering, a creature card returns to hand; the card leaves the graveyard: amass Goblins 1", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Along the Crooked Way"], graveyard: ["Bear Cub"] } });
        const bear = idOf(s, "p1", "graveyard", "Bear Cub");
        s = settle(cast(s, "p1", "Along the Crooked Way"), picking([bear]));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
        const army = armyOf(s, "p1") as string;
        expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
        expect(chars(s, army).subtypes).toContain("Goblin");
      });

      it("a creature card leaving an opponent's graveyard triggers nothing", () => {
        let s = scenario({
          p1: { battlefield: ["Along the Crooked Way", ...lands("Swamp", 2)], hand: ["Gollum the Abandoned"] },
          p2: { graveyard: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Gollum the Abandoned"), picking([idOf(s, "p2", "graveyard", "Serra Angel")]));
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        expect(armyOf(s, "p1")).toBeUndefined();
      });

      it("{1}{B}: your Goblins and Orcs gain menace until end of turn, not other creatures", () => {
        let s = scenario({
          p1: {
            battlefield: ["Along the Crooked Way", "Front Porch Sentries", "Bear Cub", ...lands("Swamp", 2)],
          },
          p2: { battlefield: ["Front Porch Sentries"] },
        });
        const way = idOf(s, "p1", "battlefield", "Along the Crooked Way");
        s = settle(activate(s, "p1", way));
        expect(chars(s, idOf(s, "p1", "battlefield", "Front Porch Sentries")).keywords).toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p2", "battlefield", "Front Porch Sentries")).keywords).not.toContain("menace");
      });
    });

    it("Bilbo's Deadly Slice: destroys a targeted creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    describe("Crude Bent Blade", () => {
      it("on entering, the targeted opponent sacrifices a creature of their choice", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Crude Bent Blade"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Crude Bent Blade"), (req, _cur, player) =>
          player === "p2" && req.type === "pick" && req.intent === "sacrifice" ? [bear] : undefined,
        );
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      });

      it("equip {2}: the equipped creature gets +2/+1", () => {
        let s = scenario({ p1: { battlefield: ["Crude Bent Blade", "Bear Cub", ...lands("Swamp", 2)] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Crude Bent Blade"), undefined, { targets: { t: [bear] } }));
        expect(chars(s, bear).power).toBe(4);
        expect(chars(s, bear).toughness).toBe(3);
      });
    });

    describe("Down, Down to Goblin-town", () => {
      const SAGA = "Down, Down to Goblin-town";

      it("chapter I: the opponent reveals their hand; you choose a nonland card they discard", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: [SAGA] }, p2: { hand: ["Island", "Opt", "Bear Cub"] } });
        const bear = idOf(s, "p2", "hand", "Bear Cub");
        let offered: string[] = [];
        s = settle(cast(s, "p1", SAGA), (req, cur, player) => {
          if (player === "p1" && req.type === "pick" && req.options.includes(bear)) {
            offered = namesIn(cur, req.options.map(String)).map(String);
            return [bear];
          }
          return undefined;
        });
        expect(offered.sort()).toEqual(["Bear Cub", "Opt"]);
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Island", "Opt"]);
      });

      it("chapter II: amass Goblins 1; chapters III and IV: the opponent loses 1 life, you gain 1", () => {
        let s = scenario({ p1: { battlefield: [{ name: SAGA, counters: { lore: 1 } }] } });
        const saga = idOf(s, "p1", "battlefield", SAGA);
        s = advanceAnswering(s, (x) => x.objects[saga]?.counters.lore === 2 && x.stack.length === 0 && x.triggers.length === 0);
        s = settle(s);
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(1);
        s = advanceAnswering(s, (x) => x.objects[saga]?.counters.lore === 3 && x.stack.length === 0 && x.triggers.length === 0);
        s = settle(s);
        expect(s.players.p2?.life).toBe(19);
        expect(s.players.p1?.life).toBe(21);
        s = advanceAnswering(s, (x) => !x.battlefield.includes(saga) && x.stack.length === 0 && x.triggers.length === 0);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(22);
        expect(idsOf(s, "p1", "graveyard", SAGA)).toHaveLength(1);
      });
    });

    it("Dreaded Bat-Cloud: costs {3} less if a creature died this turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Dreaded Bat-Cloud", "Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const castable = (x: S) =>
        legalActions(x, "p1").some((a) => a.type === "cast" && a.card === idOf(x, "p1", "hand", "Dreaded Bat-Cloud"));
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      // Two Swamps remain: {1}{B} is enough after the Cub dies.
      expect(castable(s)).toBe(true);
      s = settle(cast(s, "p1", "Dreaded Bat-Cloud"));
      expect(idsOf(s, "p1", "battlefield", "Dreaded Bat-Cloud")).toHaveLength(1);

      const t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Dreaded Bat-Cloud"] } });
      expect(castable(t)).toBe(false);
    });

    it("Front Porch Sentries: when it dies, a targeted opposing creature gets -1/-1", () => {
      let s = scenario({
        p1: { battlefield: ["Front Porch Sentries", ...lands("Swamp", 3)], hand: ["Bilbo's Deadly Slice"] },
        p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
      });
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      const sentries = idOf(s, "p1", "battlefield", "Front Porch Sentries");
      s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [sentries] } }), picking([elves]));
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).power).toBe(4);
    });

    it("Gathering of Darkness: up to one creature card returns to hand, then amass Goblins 3", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Gathering of Darkness"], graveyard: ["Bear Cub", "Serra Angel"] },
      });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = settle(cast(s, "p1", "Gathering of Darkness", { targets: { t: [angel] } }));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(3);
      expect(chars(s, army).power).toBe(3);
    });

    describe("Gnashing of Teeth", () => {
      it("mode 1: -5/-5; if the creature would die this turn, it's exiled instead", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Gnashing of Teeth"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 0, targets: { c: [angel] } }));
        expect(namesIn(s, s.exile)).toContain("Serra Angel");
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(0);
      });

      it("mode 2: only the targeted player's creatures get -1/-1", () => {
        let s = scenario({
          p1: { battlefield: ["Llanowar Elves", ...lands("Swamp", 3)], hand: ["Gnashing of Teeth"] },
          p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 1, targets: { p: ["p2"] } }));
        expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).power).toBe(1);
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      });
    });

    it("Gollum, Silent Slinker // Meager Meal: a +1/+1 counter and 2 life to the targeted player, then Gollum is cast from exile", () => {
      const CARD = "Gollum, Silent Slinker // Meager Meal";
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 6)], hand: [CARD] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const card = idOf(s, "p1", "hand", CARD);
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { c: [bear], p: ["p2"] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p2?.life).toBe(22);
      const exiled = s.exile.find((id) => nameOf(s, id) === CARD) as string;
      expect(s.objects[exiled]?.onAdventure).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      const gollum = idOf(s, "p1", "battlefield", CARD);
      expect(chars(s, gollum).keywords).toContain("menace");
      expect(chars(s, gollum).power).toBe(4);
    });

    describe("Gollum the Abandoned", () => {
      it("can't block; on entering, exiles up to one card from an opposing graveyard and each opponent loses 2 life", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 2), hand: ["Gollum the Abandoned"] },
          p2: { graveyard: ["Serra Angel", "Opt"] },
        });
        const angel = idOf(s, "p2", "graveyard", "Serra Angel");
        s = settle(cast(s, "p1", "Gollum the Abandoned"), picking([angel]));
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
        expect(s.players.p2?.life).toBe(18);
        expect(chars(s, idOf(s, "p1", "battlefield", "Gollum the Abandoned")).keywords).toContain("cantBlock");
      });

      it("from the graveyard, {2} and a sacrificed artifact or creature: it returns to hand (sorcery speed only)", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], graveyard: ["Gollum the Abandoned"] } });
        const gollum = idOf(s, "p1", "graveyard", "Gollum the Abandoned");
        s = settle(activate(s, "p1", gollum));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Gollum the Abandoned"]);
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);

        const t = scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2)], graveyard: ["Gollum the Abandoned"] },
          step: "beginCombat",
        });
        expect(() => activate(t, "p1", idOf(t, "p1", "graveyard", "Gollum the Abandoned"))).toThrow();
      });
    });

    it("Great Fierce Bee: one or more other creatures die at the same time: a single scry 1", () => {
      let s = scenario({
        p1: {
          battlefield: ["Great Fierce Bee", ...lands("Swamp", 3)],
          hand: ["Gnashing of Teeth"],
          library: ["Island", "Forest"],
        },
        p2: { battlefield: ["Llanowar Elves", "Llanowar Elves"] },
      });
      let scries = 0;
      s = settle(cast(s, "p1", "Gnashing of Teeth", { mode: 1, targets: { p: ["p2"] } }), (req) => {
        if (req.intent === "scryBottom") {
          scries++;
          return req.type === "pick" ? req.options.slice(0, 1) : undefined;
        }
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(2);
      expect(scries).toBe(1);
      // The top card (Island) was put on the bottom.
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });

    describe("Great Ugly-Looking Goblin // Clap! Snap!", () => {
      const CARD = "Great Ugly-Looking Goblin // Clap! Snap!";

      it("Clap! Snap!: amass Goblins 2", () => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: [CARD] } });
        s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", CARD), face: 1 }));
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
      });

      it("each creature you control with a +1/+1 counter has menace", () => {
        const s = scenario({
          p1: { battlefield: [CARD, { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
          p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p1", "battlefield", CARD)).keywords).not.toContain("menace");
        expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("menace");
      });
    });

    it("Rage into the Valley: you draw a card, lose 1 life and amass Goblins 2", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Rage into the Valley"], library: ["Opt"] } });
      s = settle(cast(s, "p1", "Rage into the Valley"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      expect(s.players.p1?.life).toBe(19);
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
    });

    it("Ravening Warg: Ferocious - it attacks while you control a creature with power 4 or greater: 2 life", () => {
      const run = (others: string[]) => {
        let s = scenario({ p1: { battlefield: ["Ravening Warg", ...others] } });
        s = attack(s, [idOf(s, "p1", "battlefield", "Ravening Warg")]);
        s = settle(s);
        return s.players.p1?.life;
      };
      expect(run(["Serra Angel"])).toBe(22);
      expect(run(["Bear Cub"])).toBe(20);
    });

    describe("Reverent Howl", () => {
      it("mode 1: the targeted player draws two cards and loses 2 life", () => {
        let s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Reverent Howl"] },
          p2: { library: ["Opt", "Opt", "Opt"] },
        });
        s = settle(cast(s, "p1", "Reverent Howl", { mode: 0, targets: { p: ["p2"] } }));
        expect(s.players.p2?.hand).toHaveLength(2);
        expect(s.players.p2?.life).toBe(18);
        expect(s.players.p1?.life).toBe(20);
      });

      it("mode 2: the targeted creature gets +2/+2 and lifelink until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Reverent Howl"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Reverent Howl", { mode: 1, targets: { c: [bear] } }));
        expect(chars(s, bear).power).toBe(4);
        expect(chars(s, bear).toughness).toBe(4);
        expect(chars(s, bear).keywords).toContain("lifelink");
      });
    });

    describe("Rhovanion Rampager", () => {
      it("when attacking, you may sacrifice another creature: as many +1/+1 counters as its power", () => {
        let s = scenario({ p1: { battlefield: ["Rhovanion Rampager", "Serra Angel"] } });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = attack(s, [rampager]);
        s = settle(s, (req) => (req.type === "pick" && req.intent === "sacrifice" ? [angel] : undefined));
        expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
        expect(s.objects[rampager]?.counters["+1/+1"]).toBe(4);
        expect(chars(s, rampager).power).toBe(7);
      });

      it("without a sacrifice, no counter", () => {
        let s = scenario({ p1: { battlefield: ["Rhovanion Rampager", "Serra Angel"] } });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        s = settle(attack(s, [rampager]), (req) => (req.type === "pick" && req.intent === "sacrifice" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
        expect(s.objects[rampager]?.counters["+1/+1"] ?? 0).toBe(0);
      });

      it("when it dies, amass Goblins X, X being its power", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Rhovanion Rampager", counters: { "+1/+1": 2 } }, ...lands("Swamp", 3)],
            hand: ["Bilbo's Deadly Slice"],
          },
        });
        const rampager = idOf(s, "p1", "battlefield", "Rhovanion Rampager");
        s = settle(cast(s, "p1", "Bilbo's Deadly Slice", { targets: { t: [rampager] } }));
        expect(idsOf(s, "p1", "graveyard", "Rhovanion Rampager")).toHaveLength(1);
        expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(5);
      });
    });

    describe("Stir Up Trouble", () => {
      const base = () =>
        scenario({
          p1: { battlefield: ["Bear Cub", ...lands("Swamp", 5)], hand: ["Stir Up Trouble"] },
          p2: { battlefield: ["Serra Angel"] },
        });

      it("additional cost: sacrifice an artifact or a creature", () => {
        let s = base();
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = cast(s, "p1", "Stir Up Trouble", { targets: { t: [angel] }, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(1);
        s = settle(s);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("or pay {4} more instead", () => {
        let s = base();
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = cast(s, "p1", "Stir Up Trouble", { targets: { t: [angel] }, sacrifice: [] });
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.battlefield.filter((id) => nameOf(s, id) === "Swamp" && s.objects[id]?.tapped)).toHaveLength(5);
        s = settle(s);
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });
    });

    it("Stony-Voiced Goblins: on entering, each opponent discards a card", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Swamp", 2), hand: ["Stony-Voiced Goblins", "Opt"] },
        p2: { hand: ["Opt"] },
        p3: { hand: ["Island"] },
      });
      s = settle(cast(s, "p1", "Stony-Voiced Goblins"));
      expect(s.players.p2?.hand).toHaveLength(0);
      expect(s.players.p3?.hand).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    });
  });
});

describe("lot A, red", () => {
  type S = GameState;
  /** Activates the ability of `source` whose label contains `label` (the first one otherwise). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** "Yes" answer to an optional question ("you may"). */
  const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
  /** Cards in exile owned by `player`. */
  const exiledOf = (s: S, player: string) => s.exile.filter((id) => s.objects[id]?.owner === player);
  /** The Army of `player`, if they have one. */
  const armyOf = (s: S, player: string) =>
    s.battlefield.find((id) => s.objects[id]?.controller === player && chars(s, id).subtypes.includes("Army"));
  /** Reaches the check of state-based actions (storied): both players pass once. */
  const sba = (s: S) => advanceUntil(act(act(s, "p1", { type: "pass" }), "p2", { type: "pass" }), (x) => x.turn.step === "main2");
  const GANDALF = "Gandalf, Goblins' Bane // Flameshape";
  const GLOIN = "Glóin the Mighty // Easy Pickings";
  const SMAUG = "Smaug, the Great Calamity // Spew Flame";
  const WIZARD = customCard({ name: "Test Wizard", subtypes: ["Wizard"], power: 1, toughness: 1 });
  /** A Treasure artifact (not a token): counts among "your Treasures". */
  const TREASURE = customCard({
    name: "Test Treasure",
    typeLine: "Artifact — Treasure",
    types: ["Artifact"],
    subtypes: ["Treasure"],
  });

  describe("The Hobbit, lot A - red", () => {
    describe("Balin, Loremaster", () => {
      it("on entering: discard your hand and draw that many; without storied, no damage", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Mountain", 5),
            hand: ["Balin, Loremaster", "Opt", "Bear Cub"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Balin, Loremaster"), yes);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
        expect(s.players.p2?.life).toBe(20);
      });

      it("another Dwarf enters, with storied: X damage to each opponent", () => {
        let s = scenario({
          p1: {
            battlefield: ["Balin, Loremaster", "Fishing Pole", "Skateboard", ...lands("Mountain", 3)],
            hand: ["Dori, Bearer of Friends", "Opt", "Bear Cub"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Dori, Bearer of Friends"), yes);
        expect(s.players.p1?.designations).toContain("enduringStory");
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
        expect(s.players.p2?.life).toBe(18);
      });

      it('"you may": declining, the hand is kept', () => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Balin, Loremaster", "Opt"], library: lands("Island", 5) },
        });
        s = settle(cast(s, "p1", "Balin, Loremaster"), (req) => (req.type === "yesNo" ? [0] : undefined));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
      });
    });

    it("Bombur, Gentle Dreamer: doesn't untap during your untap step, except with storied", () => {
      const run = (others: string[]) => {
        let s = scenario({ p1: { battlefield: [{ name: "Bombur, Gentle Dreamer", tapped: true }, ...others] } });
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        return s.objects[idOf(s, "p1", "battlefield", "Bombur, Gentle Dreamer")]?.tapped;
      };
      expect(run(["Bear Cub"])).toBe(true);
      expect(run(["Fishing Pole", "Skateboard"])).toBe(false);
    });

    it("Bothersome Noisemaker: a noncreature spell amasses Goblins 1, not a creature spell", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bothersome Noisemaker", ...lands("Island", 2), ...lands("Forest", 2)],
          hand: ["Opt", "Bear Cub"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(armyOf(s, "p1")).toBeUndefined();
      s = settle(cast(s, "p1", "Opt"));
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, army).subtypes).toContain("Goblin");
    });

    describe("Burn, Burn, Tree and Fern", () => {
      it("chapter I: 6 damage to a creature an opponent controls", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 4), "Serra Angel"], hand: ["Burn, Burn, Tree and Fern"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        s = settle(cast(s, "p1", "Burn, Burn, Tree and Fern"));
        expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
        // Your Angel was not a possible target.
        expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
      });

      it("chapter II: destroys an opposing artifact; chapters III and IV: add {R}", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Burn, Burn, Tree and Fern", counters: { lore: 1 } }] },
          p2: { battlefield: ["Fishing Pole"] },
          active: "p2",
        });
        const chapterOnStack = (x: S) =>
          x.turn.active === "p1" && x.turn.step === "main1" && (x.stack.length > 0 || x.pending?.kind === "choice");
        s = settle(advanceUntil(s, chapterOnStack));
        expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
        s = settle(advanceUntil(s, chapterOnStack));
        expect(s.players.p1?.manaPool.R).toBe(1);
      });
    });

    it("Dáin Ironfoot: an Axe attached to a targeted creature; when attacking, equipped attackers have double strike", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Dáin Ironfoot"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dáin Ironfoot"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      const axe = idOf(s, "p1", "battlefield", "Axe");
      expect(s.objects[axe]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(3);
      const dain = idOf(s, "p1", "battlefield", "Dáin Ironfoot");
      // The next turn (Dáin no longer has summoning sickness), Dáin and the equipped Cub attack.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(attack(s, [dain, bear]));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, dain).keywords).not.toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      // Equipped Cub: 3 + 3 (double strike); Dáin: 1.
      expect(s.players.p2?.life).toBe(13);
    });

    describe("Desert Were-Worm", () => {
      it("+2/+0 for each Mountain you control", () => {
        const s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 3), "Island"] } });
        expect(chars(s, idOf(s, "p1", "battlefield", "Desert Were-Worm")).power).toBe(6);
      });

      it("attack with total power 12 or greater: attackers untap and an additional combat phase, once per turn", () => {
        let s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 6)] }, p2: { life: 40 } });
        const worm = idOf(s, "p1", "battlefield", "Desert Were-Worm");
        s = settle(attack(s, [worm]));
        expect(s.objects[worm]?.tapped).toBe(false);
        // Second combat phase: new declaration of attackers.
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
        expect(s.pending?.kind).toBe("declareAttackers");
        s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: worm, defender: "p2" }] }));
        // No third combat: the ability only triggers the first time each turn.
        expect(s.objects[worm]?.tapped).toBe(true);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
        expect(s.turn.step).toBe("main2");
        expect(s.players.p2?.life).toBe(40 - 24);
      });

      it("total power under 12: nothing", () => {
        let s = scenario({ p1: { battlefield: ["Desert Were-Worm", ...lands("Mountain", 5)] } });
        const worm = idOf(s, "p1", "battlefield", "Desert Were-Worm");
        s = settle(attack(s, [worm]));
        expect(s.objects[worm]?.tapped).toBe(true);
      });
    });

    it("Desolation of Smaug: 3 damage to each non-Dragon creature; four mana reserved for Dragon spells", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 6), "Serra Angel"],
          hand: ["Desolation of Smaug", "Shivan Dragon", "Lightning Strike"],
        },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Desolation of Smaug"), (req) =>
        req.type === "divide" && req.intent === "manaColor" ? req.among.map((c) => (c === "R" ? 4 : 0)) : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(3);
      expect(s.players.p1?.restrictedMana).toHaveLength(4);
      // Two untapped Mountains and the reserved mana: Shivan Dragon ({4}{R}{R}) can be cast.
      s = settle(cast(s, "p1", "Shivan Dragon"));
      expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    });

    it("Desolation of Smaug: the reserved mana doesn't pay for a spell that isn't a Dragon", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Desolation of Smaug", "Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Desolation of Smaug"), (req) =>
        req.type === "divide" && req.intent === "manaColor" ? req.among.map((c) => (c === "R" ? 4 : 0)) : undefined,
      );
      expect(s.players.p1?.restrictedMana).toHaveLength(4);
      expect(() => cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } })).toThrow();
    });

    describe("Gandalf, Goblins' Bane // Flameshape", () => {
      it("a noncreature spell: +1/+1 until end of turn and 1 damage to each opponent", () => {
        let s = scenario({ p1: { battlefield: [GANDALF, "Island"], hand: ["Opt"], library: lands("Island", 3) } });
        const gandalf = idOf(s, "p1", "battlefield", GANDALF);
        s = settle(cast(s, "p1", "Opt"));
        expect(chars(s, gandalf).power).toBe(3);
        expect(chars(s, gandalf).toughness).toBe(4);
        expect(s.players.p2?.life).toBe(19);
      });

      it("Flameshape: the top two cards exiled, playable as long as you control a Wizard", () => {
        const run = (battlefield: (string | typeof WIZARD)[]) => {
          let s = scenario({
            p1: {
              battlefield: [...lands("Mountain", 4), ...battlefield],
              hand: [GANDALF],
              library: ["Lightning Strike", "Bear Cub", "Island"],
            },
          });
          const card = idOf(s, "p1", "hand", GANDALF);
          s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
          expect(s.players.p1?.library).toHaveLength(1);
          const exiled = exiledOf(s, "p1");
          expect(namesIn(s, exiled).sort()).toEqual(["Bear Cub", GANDALF, "Lightning Strike"]);
          return legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Lightning Strike");
        };
        expect(run([WIZARD])).toBe(true);
        expect(run(["Bear Cub"])).toBe(false);
      });
    });

    it("Gandalf, Spark Starter: 3 damage divided among one, two or three targets", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Gandalf, Spark Starter"] },
        p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Gandalf, Spark Starter"), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) return [bear, elves, "p2"];
        if (req.type === "divide") return req.among.map(() => 1);
        return undefined;
      });
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(1);
      expect(s.players.p2?.life).toBe(19);
    });

    describe("Glóin the Mighty // Easy Pickings", () => {
      it("at the beginning of your first main phase: add {R}{R}", () => {
        let s = scenario({ p1: { battlefield: [GLOIN] }, step: "upkeep" });
        s = advanceUntil(s, (x) => x.turn.step === "main1" && x.triggers.length === 0 && x.stack.length === 0);
        expect(s.players.p1?.manaPool.R).toBe(2);
      });

      it("Easy Pickings: 1 damage to each opposing creature, then Glóin is cast from exile", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 7), "Llanowar Elves"], hand: [GLOIN] },
          p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
        });
        const card = idOf(s, "p1", "hand", GLOIN);
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
        expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
        expect(namesIn(s, exiledOf(s, "p1"))).toEqual([GLOIN]);
        s = settle(act(s, "p1", { type: "cast", card: exiledOf(s, "p1")[0] as string }));
        expect(idsOf(s, "p1", "battlefield", GLOIN)).toHaveLength(1);
      });
    });

    it("Goblin-town Flunkies: on entering, amass Goblins 1", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Goblin-town Flunkies"] } });
      s = settle(cast(s, "p1", "Goblin-town Flunkies"));
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(1);
    });

    it("Gundabad Opportunist: the top card exiled stays playable until the end of your next turn", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 4),
          hand: ["Gundabad Opportunist"],
          library: ["Lightning Strike", ...lands("Island", 4)],
        },
      });
      s = settle(cast(s, "p1", "Gundabad Opportunist"));
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Lightning Strike"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && nameOf(s, a.card) === "Lightning Strike")).toBe(true);
    });

    it("Iron Hills Stalwart: attaches a targeted Equipment you control to a targeted creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Fishing Pole", "Bear Cub"], hand: ["Iron Hills Stalwart"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      s = settle(cast(s, "p1", "Iron Hills Stalwart"), (req) => {
        if (req.type === "pick" && req.options.includes(pole)) return [pole];
        if (req.type === "pick" && req.options.includes(bear)) return [bear];
        return undefined;
      });
      expect(s.objects[pole]?.attachedTo).toBe(bear);
    });

    describe("Last Light of Durin's Day", () => {
      it("a Mountain enters: a quest counter; at the sixth, sacrifice it and a Dragon from your hand enters", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Last Light of Durin's Day", counters: { quest: 4 } }],
            hand: ["Mountain", "Shivan Dragon"],
            library: ["Mountain", ...lands("Island", 3)],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }));
        expect(s.objects[idOf(s, "p1", "battlefield", "Last Light of Durin's Day")]?.counters.quest).toBe(5);
        // The next turn, the sixth Mountain.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }), (req, _player, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Shivan Dragon") : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Last Light of Durin's Day")).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
      });

      it("without a Dragon chosen in hand, it's searched for in the library", () => {
        let s = scenario({
          p1: {
            battlefield: [{ name: "Last Light of Durin's Day", counters: { quest: 5 } }],
            hand: ["Mountain"],
            library: ["Island", "Shivan Dragon", "Island"],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") }), (req, _player, cur) =>
          req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Shivan Dragon") : undefined,
        );
        expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(2);
      });
    });

    it("The Misty Mountains Cold: a Treasure; with four Treasures, the Saga is sacrificed and a 6/6 flying Dragon enters", () => {
      const run = (treasures: number) => {
        let s = scenario({
          p1: { battlefield: [...lands("Mountain", 3), ...Array(treasures).fill(TREASURE)], hand: ["The Misty Mountains Cold"] },
        });
        s = settle(cast(s, "p1", "The Misty Mountains Cold"));
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
        return s;
      };
      let s = run(2);
      expect(idsOf(s, "p1", "battlefield", "The Misty Mountains Cold")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Dragon")).toHaveLength(0);
      s = run(3);
      expect(idsOf(s, "p1", "graveyard", "The Misty Mountains Cold")).toHaveLength(1);
      const dragon = idOf(s, "p1", "battlefield", "Dragon");
      expect(chars(s, dragon).power).toBe(6);
      expect(chars(s, dragon).keywords).toContain("flying");
    });

    it("Misty Mountains Raider: whenever you attack, amass Goblins 2", () => {
      let s = scenario({ p1: { battlefield: ["Misty Mountains Raider", "Bear Cub"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.objects[armyOf(s, "p1") as string]?.counters["+1/+1"]).toBe(2);
    });

    describe("Óin the Brave", () => {
      it("with storied: +1/+0 and haste", () => {
        let s = scenario({ p1: { battlefield: ["Óin the Brave", "Fishing Pole", "Skateboard"] } });
        const oin = idOf(s, "p1", "battlefield", "Óin the Brave");
        s = sba(s);
        expect(chars(s, oin).power).toBe(2);
        expect(chars(s, oin).keywords).toContain("haste");
      });

      it("{1}, {T}, discard a card: draw a card", () => {
        let s = scenario({ p1: { battlefield: ["Óin the Brave", "Mountain"], hand: ["Opt"], library: lands("Island", 3) } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Óin the Brave")));
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      });
    });

    it("Pinecone Strike, both modes: 3 damage (exiled if it would die) and an artifact token destroyed", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Dori, Bearer of Friends", "Pinecone Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Dori, Bearer of Friends"));
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // A nontoken artifact is not a legal target.
      s = settle(cast(s, "p1", "Pinecone Strike", { mode: 2, targets: { c: [bear], a: [treasure] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(0);
      expect(namesIn(s, exiledOf(s, "p2"))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    });

    it("Ragged Short Spear: on entering, discard a card to draw two; the equipped creature has +2/+0", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Bear Cub"],
          hand: ["Ragged Short Spear", "Opt"],
          library: lands("Island", 3),
        },
      });
      s = settle(cast(s, "p1", "Ragged Short Spear"), (req) =>
        req.type === "pick" && req.intent === "discard" ? req.options.slice(0, 1) : undefined,
      );
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island", "Island"]);
      const spear = idOf(s, "p1", "battlefield", "Ragged Short Spear");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", spear, undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(4);
    });

    it("Spew Flame: 5 damage to a creature, then Smaug is cast from exile", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 12), hand: [SMAUG] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const card = idOf(s, "p1", "hand", SMAUG);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [dragon] } }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      const exiled = exiledOf(s, "p1")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      expect(idsOf(s, "p1", "battlefield", SMAUG)).toHaveLength(1);
    });

    it("Smaug's Fury: +3/+0, reach and first strike until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Smaug's Fury"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Smaug's Fury", { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(5);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["reach", "firstStrike"]));
    });

    it("Snowslope Hunter: sacrifice another creature or an artifact, during your turn and once per turn", () => {
      let s = scenario({
        p1: { battlefield: ["Snowslope Hunter", "Bear Cub", "Fishing Pole"], library: ["Opt", ...lands("Island", 4)] },
      });
      const hunter = idOf(s, "p1", "battlefield", "Snowslope Hunter");
      s = settle(activate(s, "p1", hunter, undefined, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Opt"]);
      expect(canActivate(s, "p1", hunter)).toBe(false);
      // During the opponent's turn: no.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(canActivate(s, "p1", hunter)).toBe(false);
    });

    it("Stone-Giant of High Pass: a Boulder on entering and on attacking; sacrifice an artifact: 4 damage", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 10), hand: ["Stone-Giant of High Pass"] } });
      s = settle(cast(s, "p1", "Stone-Giant of High Pass"));
      const boulder = idOf(s, "p1", "battlefield", "Stone Boulder");
      expect(chars(s, boulder).power).toBe(3);
      expect(chars(s, boulder).toughness).toBe(1);
      expect(chars(s, boulder).keywords).toContain("defender");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Stone-Giant of High Pass"), undefined, {
          targets: { t: ["p2"] },
          sacrifice: [boulder],
        }),
      );
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "battlefield", "Stone Boulder")).toHaveLength(0);
    });

    it("Stone-Giant of High Pass: a Boulder each time it attacks", () => {
      let s = scenario({ p1: { battlefield: ["Stone-Giant of High Pass"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Stone-Giant of High Pass")]));
      expect(idsOf(s, "p1", "battlefield", "Stone Boulder")).toHaveLength(1);
    });

    it("Tidings of War: amass Goblins 1; cast from the graveyard (flashback), 3 instead", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Tidings of War"] } });
      s = settle(cast(s, "p1", "Tidings of War"));
      const army = armyOf(s, "p1") as string;
      expect(s.objects[army]?.counters["+1/+1"]).toBe(1);
      const card = idOf(s, "p1", "graveyard", "Tidings of War");
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(s.objects[army]?.counters["+1/+1"]).toBe(4);
      expect(namesIn(s, exiledOf(s, "p1"))).toEqual(["Tidings of War"]);
    });
  });
});

describe("lot A, green", () => {
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
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((x) => x.type === "cast" && x.card === card);
  /** Picks the option whose id is `id`, if it is offered. */
  const pickId = (id: string) => (req: ChoiceRequest) => (req.type === "pick" && req.options.includes(id) ? [id] : undefined);
  /** Picks the option (mode…) whose label contains `text`. */
  const pickLabel = (req: ChoiceRequest, text: string) =>
    req.type === "pick" && req.labels ? req.options.filter((o) => req.labels?.[o]?.includes(text)).slice(0, 1) : undefined;
  /** Plays a land from hand; if it triggers something, resolves it. */
  const playLand = (s: S, name: string) => {
    const t = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
    return t.stack.length > 0 || t.triggers.length > 0 ? settle(t) : t;
  };

  describe("The Hobbit, lot A - green", () => {
    it("Attercop: reach and deathtouch; Landfall, +1/+1 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Attercop"], hand: ["Forest"] } });
      const spider = idOf(s, "p1", "battlefield", "Attercop");
      expect(chars(s, spider).keywords).toEqual(expect.arrayContaining(["reach", "deathtouch"]));
      s = playLand(s, "Forest");
      expect(pt(s, spider)).toEqual([3, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, spider)).toEqual([2, 1]);
    });

    describe("Bejeweled Warg", () => {
      it("combat damage to a player: a Treasure", () => {
        let s = scenario({ p1: { battlefield: ["Bejeweled Warg"] } });
        const warg = idOf(s, "p1", "battlefield", "Bejeweled Warg");
        s = throughCombat(attack(s, [warg]), (req) => pickLabel(req, "Treasure"));
        expect(s.players.p2?.life).toBe(17);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      });

      it("or a +1/+1 counter on a Wolf you control", () => {
        let s = scenario({ p1: { battlefield: ["Bejeweled Warg", "Wargling"] } });
        const warg = idOf(s, "p1", "battlefield", "Bejeweled Warg");
        const wargling = idOf(s, "p1", "battlefield", "Wargling");
        s = throughCombat(attack(s, [warg]), (req) => pickLabel(req, "Wolf") ?? pickId(wargling)(req));
        expect(s.objects[wargling]?.counters["+1/+1"]).toBe(1);
        expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      });
    });

    it("Beorn, Reluctant Host // Till and Tend: the Adventure allows an extra land, then the creature is cast from exile", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 7), hand: ["Beorn, Reluctant Host // Till and Tend", "Island", "Swamp"] },
      });
      const card = idOf(s, "p1", "hand", "Beorn, Reluctant Host // Till and Tend");
      s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
      const exiled = Object.values(s.objects).find((o) => o.zone === "exile" && o.owner === "p1")?.id as string;
      expect(nameOf(s, exiled)).toBe("Beorn, Reluctant Host // Till and Tend");
      s = playLand(s, "Island");
      s = playLand(s, "Swamp");
      expect(idsOf(s, "p1", "battlefield", "Swamp")).toHaveLength(1);
      expect(canCast(s, "p1", exiled)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: exiled }));
      const beorn = s.battlefield.find((id) => nameOf(s, id)?.startsWith("Beorn")) as string;
      expect(pt(s, beorn)).toEqual([5, 5]);
      expect(chars(s, beorn).keywords).toContain("trample");
    });

    describe("Beorn the Fierce", () => {
      it("your other Bears get +2/+2; in combat, a trample counter and the creature becomes a Bear", () => {
        let s = scenario({ p1: { battlefield: ["Beorn the Fierce", "Bear Cub", "Llanowar Elves"] } });
        const beorn = idOf(s, "p1", "battlefield", "Beorn the Fierce");
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        expect(pt(s, beorn)).toEqual([6, 6]);
        expect(pt(s, cub)).toEqual([4, 4]);
        expect(pt(s, elves)).toEqual([1, 1]);
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
        s = settle(s, pickId(elves));
        expect(s.objects[elves]?.counters.trample).toBe(1);
        expect(chars(s, elves).keywords).toContain("trample");
        expect(chars(s, elves).subtypes).toEqual(expect.arrayContaining(["Elf", "Bear"]));
        expect(pt(s, elves)).toEqual([3, 3]);
        // Three Bears (Beorn, the Cub, the Elves turned Bears): two cards drawn.
        expect(s.players.p1?.hand).toHaveLength(2);
        // The effect doesn't end at the next turn.
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, elves).subtypes).toContain("Bear");
      });

      it("fewer than three Bears: you don't draw", () => {
        let s = scenario({ p1: { battlefield: ["Beorn the Fierce", "Llanowar Elves"] } });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
        s = settle(s, pickId(elves));
        expect(chars(s, elves).subtypes).toContain("Bear");
        expect(s.players.p1?.hand).toHaveLength(0);
      });
    });

    it("Beorn's Hospitality: Landfall, a +1/+1 counter; {5}{G}{G}: becomes a Bear with P/T equal to your lands, permanently", () => {
      let s = scenario({ p1: { battlefield: ["Beorn's Hospitality", "Bear Cub", ...lands("Forest", 7)], hand: ["Forest"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const hosp = idOf(s, "p1", "battlefield", "Beorn's Hospitality");
      s = playLand(s, "Forest");
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
      s = settle(activate(s, "p1", hosp));
      expect(chars(s, hosp).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
      expect(chars(s, hosp).subtypes).toContain("Bear");
      expect(pt(s, hosp)).toEqual([8, 8]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, hosp).types).toContain("Creature");
      expect(pt(s, hosp)).toEqual([8, 8]);
    });

    it("Boughside Wanderers: a permanent card among the top four; Landfall, +2/+2", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 6),
          hand: ["Boughside Wanderers", "Island"],
          library: ["Opt", "Lightning Strike", "Bear Cub", "Swamp", "Mountain"],
        },
      });
      let seen: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Boughside Wanderers"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        seen = namesIn(cur, req.options);
        return pickNamed(cur, req, "Bear Cub");
      });
      expect(seen.sort()).toEqual(["Bear Cub", "Swamp"]);
      expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Island"]);
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Mountain");
      expect(library.slice(1).sort()).toEqual(["Lightning Strike", "Opt", "Swamp"]);
      const w = idOf(s, "p1", "battlefield", "Boughside Wanderers");
      s = playLand(s, "Island");
      expect(pt(s, w)).toEqual([6, 6]);
    });

    describe("Cantankerous Keepers", () => {
      it("affinity for Elves: {1} less per Elf you control", () => {
        const setup = (forests: number) =>
          scenario({
            p1: {
              battlefield: [
                ...lands("Forest", forests),
                { name: "Llanowar Elves", tapped: true },
                { name: "Llanowar Elves", tapped: true },
              ],
              hand: ["Cantankerous Keepers"],
            },
          });
        const three = setup(3);
        expect(canCast(three, "p1", idOf(three, "p1", "hand", "Cantankerous Keepers"))).toBe(false);
        const four = setup(4);
        expect(canCast(four, "p1", idOf(four, "p1", "hand", "Cantankerous Keepers"))).toBe(true);
      });

      it("on entering: mill four cards, the milled Elf cards go to hand", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Forest", 6),
            hand: ["Cantankerous Keepers"],
            library: ["Llanowar Elves", "Opt", "Woodland Weavemaster", "Bear Cub", "Llanowar Elves"],
          },
        });
        s = settle(cast(s, "p1", "Cantankerous Keepers"));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Llanowar Elves", "Woodland Weavemaster"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Llanowar Elves"]);
      });
    });

    it("Dancing from Dark to Dawn: a creature spell puts X counters (its mana value); Landfall, a 2/2 Bear", () => {
      let s = scenario({
        p1: {
          battlefield: ["Dancing from Dark to Dawn", "Llanowar Elves", ...lands("Forest", 5)],
          hand: ["Beorn the Fierce", "Island"],
        },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(cast(s, "p1", "Beorn the Fierce"), pickId(elves));
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(5);
      s = playLand(s, "Island");
      const bear = idOf(s, "p1", "battlefield", "Bear");
      // Ours 2/2, et +2/+2 de Beorn the Fierce.
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).colors).toEqual(["G"]);
    });

    it("Down in the Valley: I, a basic land in hand; II, Landfall creates an Elf; III, your Elves +1/+0 and vigilance", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Down in the Valley"], library: ["Island", "Opt", ...lands("Plains", 6)] },
      });
      s = settle(cast(s, "p1", "Down in the Valley"), (req, _player, cur) => pickNamed(cur, req, "Island"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
      const saga = idOf(s, "p1", "battlefield", "Down in the Valley");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(s);
      expect(s.objects[saga]?.counters.lore).toBe(2);
      s = playLand(s, "Island");
      const elf = idOf(s, "p1", "battlefield", "Elf");
      expect(pt(s, elf)).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 5);
      s = settle(s);
      expect(s.objects[saga]?.counters.lore).toBe(3);
      expect(pt(s, elf)).toEqual([2, 1]);
      expect(chars(s, elf).keywords).toContain("vigilance");
    });

    it("Galion, Elvenking's Butler: when attacking, another creature has Galion's base P/T until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Galion, Elvenking's Butler", "Llanowar Elves"] } });
      const galion = idOf(s, "p1", "battlefield", "Galion, Elvenking's Butler");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(attack(s, [galion, elves]), pickId(elves));
      expect(pt(s, elves)).toEqual([4, 4]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(12);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, elves)).toEqual([1, 1]);
    });

    it("Galion: the base power and the base toughness are Galion's, each its own (PLAN-M M8b)", () => {
      let s = scenario({ p1: { battlefield: ["Galion, Elvenking's Butler", "Llanowar Elves"] } });
      const galion = idOf(s, "p1", "battlefield", "Galion, Elvenking's Butler");
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      // Galion 6/4.
      addPump(s, [galion], 2, 0);
      s = settle(attack(s, [galion, elves]), pickId(elves));
      expect(pt(s, elves)).toEqual([6, 4]);
      // A later effect that sets its base P/T to 1/1: 1/1 (no toughness correction left over).
      s.effects.push({ id: "test-base", timestamp: 1e9, affected: [elves], setPower: 1, setToughness: 1, duration: "endOfTurn" });
      bump(s);
      expect(pt(s, elves)).toEqual([1, 1]);
    });

    it("Gigantic Big Bear: can't be countered; hexproof and haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 7), hand: ["Gigantic Big Bear"] },
        p2: { battlefield: lands("Island", 3), hand: ["Cancel"] },
      });
      s = cast(s, "p1", "Gigantic Big Bear");
      const spell = s.stack[0]?.id as string;
      s = act(s, "p1", { type: "pass" });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Cancel"), targets: { t: [spell] } }));
      const bear = idOf(s, "p1", "battlefield", "Gigantic Big Bear");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "haste"]));
      expect(idsOf(s, "p2", "graveyard", "Cancel")).toHaveLength(1);
    });

    it("Guardian of the Halls: {5}{G}{G}, three +1/+1 counters", () => {
      let s = scenario({ p1: { battlefield: ["Guardian of the Halls", ...lands("Forest", 7)] } });
      const g = idOf(s, "p1", "battlefield", "Guardian of the Halls");
      s = settle(activate(s, "p1", g));
      expect(pt(s, g)).toEqual([5, 5]);
    });

    describe("Little Bear", () => {
      it("flash; untaps another creature, and a Bear gets a +1/+1 counter", () => {
        let s = scenario({
          p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Forest", 3)], hand: ["Little Bear"] },
        });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Little Bear"), pickId(cub));
        expect(s.objects[cub]?.tapped).toBe(false);
        expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
      });

      it("a creature that is not a Bear is only untapped", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: [{ name: "Llanowar Elves", tapped: true }, ...lands("Forest", 3)], hand: ["Little Bear"] },
        });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        s = act(s, "p2", { type: "pass" });
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        s = settle(cast(s, "p1", "Little Bear"), pickId(elves));
        expect(s.objects[elves]?.tapped).toBe(false);
        expect(s.objects[elves]?.counters["+1/+1"] ?? 0).toBe(0);
      });
    });

    it("Mirkwood Pathmaker: P/T equal to the number of lands you control", () => {
      let s = scenario({ p1: { battlefield: ["Mirkwood Pathmaker", ...lands("Forest", 3)], hand: ["Island"] } });
      const m = idOf(s, "p1", "battlefield", "Mirkwood Pathmaker");
      expect(pt(s, m)).toEqual([3, 3]);
      s = playLand(s, "Island");
      expect(pt(s, m)).toEqual([4, 4]);
    });

    it("Nasty Little Rabbit: Ferocious, a +1/+1 counter at the beginning of combat only with a creature with power 4 or greater", () => {
      const run = (battlefield: string[]) => {
        let s = scenario({ p1: { battlefield: ["Nasty Little Rabbit", ...battlefield] } });
        s = settle(advanceUntil(s, (x) => x.turn.step === "beginCombat"));
        return s.objects[idOf(s, "p1", "battlefield", "Nasty Little Rabbit")]?.counters["+1/+1"] ?? 0;
      };
      expect(run(["Bear Cub"])).toBe(0);
      expect(run(["Serra Angel"])).toBe(1);
    });

    it("The Notary Hobbits: two nonlegendary copy tokens; {T}: {C} per Hobbit you control", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["The Notary Hobbits"] } });
      s = settle(cast(s, "p1", "The Notary Hobbits"));
      const hobbits = idsOf(s, "p1", "battlefield", "The Notary Hobbits");
      expect(hobbits).toHaveLength(3);
      const tokens = hobbits.filter((id) => s.objects[id]?.isToken);
      expect(tokens).toHaveLength(2);
      for (const id of tokens) expect(chars(s, id).supertypes).not.toContain("Legendary");
      // The tokens don't copy again ("if they aren't tokens").
      const card = hobbits.find((id) => !s.objects[id]?.isToken) as string;
      expect(chars(s, card).supertypes).toContain("Legendary");
      // The tokens no longer have summoning sickness on the next turn.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const t = tokens[0] as string;
      const mana = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === t);
      s = act(s, "p1", { type: "tapForMana", source: t, ability: mana?.type === "tapForMana" ? mana.ability : 0 });
      expect(s.players.p1?.manaPool.C).toBe(3);
    });

    describe("Old Fat Spider", () => {
      it("can't be blocked by creatures with power 2 or less", () => {
        let s = scenario({ p1: { battlefield: ["Old Fat Spider"] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
        const spider = idOf(s, "p1", "battlefield", "Old Fat Spider");
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        s = advanceUntil(attack(s, [spider]), (x) => x.pending?.kind === "declareBlockers");
        expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: cub, attacker: spider }] })).toThrow();
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: spider }] });
        expect(s.combat?.attackers.find((a) => a.id === spider)?.blockers).toEqual([angel]);
      });

      it("targeted by an opposing spell: you draw a card", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Old Fat Spider"] },
          p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
        });
        s = settle(cast(s, "p2", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Old Fat Spider")] } }));
        expect(s.players.p1?.hand).toHaveLength(1);
      });
    });

    describe("Part in Friendship", () => {
      const setup = (library: string[]) => {
        const s = scenario({
          p1: { battlefield: ["Part in Friendship", "Bear Cub", "Llanowar Elves", ...lands("Forest", 2)], library },
        });
        destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
        return s;
      };

      it("a creature dies: the revealed creature card enters play if its MV is at most your lands; the rest on the bottom", () => {
        const s = settle(setup(["Opt", "Llanowar Elves", "Island", "Swamp"]));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(2);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Swamp", "Opt"]);
        expect(s.players.p1?.hand).toHaveLength(0);
      });

      it("otherwise it goes to hand; only once per turn", () => {
        let s = settle(setup(["Opt", "Serra Angel", "Island", "Bear Cub"]));
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Bear Cub", "Opt"]);
        destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
        s = settle(s);
        expect(s.players.p1?.hand).toHaveLength(1);
        expect(s.players.p1?.library).toHaveLength(3);
      });
    });

    it("Quarrel: your creature deals damage equal to its power to an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Serra Angel", ...lands("Forest", 2)], hand: ["Quarrel"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(cast(s, "p1", "Quarrel", { targets: { a: [angel], b: [dragon] } }));
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    describe("Radagast of Rhosgobel", () => {
      it("the first creature spell each turn costs {2} less, not the next", () => {
        let s = scenario({
          p1: { battlefield: ["Radagast of Rhosgobel", ...lands("Forest", 2)], hand: ["Bear Cub", "Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Bear Cub"));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      });

      it("it can be cast as though it had flash", () => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Radagast of Rhosgobel", ...lands("Forest", 4)], hand: ["Bear Cub", "Bear Cub"] },
        });
        s = act(s, "p2", { type: "pass" });
        const cub = idOf(s, "p1", "hand", "Bear Cub");
        expect(canCast(s, "p1", cub)).toBe(true);
        s = settle(cast(s, "p1", "Bear Cub"));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        s = act(s, "p2", { type: "pass" });
        // The second creature spell of the turn doesn't have flash.
        expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
        expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      });
    });

    it("Through the Forest Gate: the lands among the top twenty cards enter tapped, then shuffle; 8 life", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Forest", 8),
          hand: ["Through the Forest Gate"],
          library: ["Island", "Opt", "Swamp", "Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Through the Forest Gate"), (req) => (req.type === "pick" ? req.options : undefined));
      const island = idOf(s, "p1", "battlefield", "Island");
      const swamp = idOf(s, "p1", "battlefield", "Swamp");
      expect(s.objects[island]?.tapped).toBe(true);
      expect(s.objects[swamp]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.life).toBe(28);
    });

    it("Troll Negotiations: two +1/+1 counters, then your creature fights an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: ["Llanowar Elves", ...lands("Forest", 4)], hand: ["Troll Negotiations"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Troll Negotiations", { targets: { a: [elves], b: [cub] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[elves]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[elves]?.damage).toBe(2);
      expect(pt(s, elves)).toEqual([3, 3]);
    });

    describe("Warg Tactics", () => {
      it("destroys a creature with flying (not another)", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 2), hand: ["Warg Tactics"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        const cub = idOf(s, "p2", "battlefield", "Bear Cub");
        expect(() => cast(s, "p1", "Warg Tactics", { mode: 0, targets: { t: [cub] } })).toThrow();
        s = settle(cast(s, "p1", "Warg Tactics", { mode: 0, targets: { t: [angel] } }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      });

      it("or a +1/+1 counter, trample and hexproof until end of turn", () => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 2)], hand: ["Warg Tactics"] } });
        const cub = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Warg Tactics", { mode: 1, targets: { t: [cub] } }));
        expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
        expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["trample", "hexproof"]));
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(chars(s, cub).keywords).not.toContain("hexproof");
      });
    });

    it("Wargling: Ferocious, when attacking +1/+0 and your creatures have trample", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Wargling", other] } });
        const w = idOf(s, "p1", "battlefield", "Wargling");
        const o = idOf(s, "p1", "battlefield", other);
        s = settle(attack(s, [w]));
        return [chars(s, w).power, chars(s, w).keywords.includes("trample"), chars(s, o).keywords.includes("trample")];
      };
      expect(run("Bear Cub")).toEqual([2, false, false]);
      expect(run("Serra Angel")).toEqual([3, true, true]);
    });

    it("Wilderland Scrounger: Ferocious, when attacking a +1/+1 counter on each of your creatures", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["Wilderland Scrounger", other] } });
        const w = idOf(s, "p1", "battlefield", "Wilderland Scrounger");
        const o = idOf(s, "p1", "battlefield", other);
        s = settle(attack(s, [w]));
        return [s.objects[w]?.counters["+1/+1"] ?? 0, s.objects[o]?.counters["+1/+1"] ?? 0];
      };
      expect(run("Bear Cub")).toEqual([0, 0]);
      expect(run("Serra Angel")).toEqual([1, 1]);
    });

    it("Wood Elves: a Forest card from the library enters untapped", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Wood Elves"], library: ["Island", "Plains", "Forest", "Opt"] },
      });
      let options: (string | undefined)[] = [];
      s = settle(cast(s, "p1", "Wood Elves"), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        options = namesIn(cur, req.options);
        return pickNamed(cur, req, "Forest");
      });
      expect(options).toEqual(["Forest"]);
      const forests = idsOf(s, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(4);
      expect(forests.filter((id) => !s.objects[id]?.tapped)).toHaveLength(1);
    });

    it("Woodland Weavemaster: vigilance; +1/+1 when another Elf enters", () => {
      let s = scenario({ p1: { battlefield: ["Woodland Weavemaster", "Forest"], hand: ["Llanowar Elves"] } });
      const w = idOf(s, "p1", "battlefield", "Woodland Weavemaster");
      expect(chars(s, w).keywords).toContain("vigilance");
      s = settle(cast(s, "p1", "Llanowar Elves"));
      expect(pt(s, w)).toEqual([2, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, w)).toEqual([1, 2]);
    });

    it("Woodland Weavemaster: {T}: X mana of one color (X: its power), only for Elf spells", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Woodland Weavemaster", counters: { "+1/+1": 1 } }],
          hand: ["Bear Cub", "Woodland Weavemaster"],
        },
      });
      const w = idOf(s, "p1", "battlefield", "Woodland Weavemaster");
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      expect(canCast(s, "p1", idOf(s, "p1", "hand", "Woodland Weavemaster"))).toBe(true);
      s = settle(cast(s, "p1", "Woodland Weavemaster"));
      expect(idsOf(s, "p1", "battlefield", "Woodland Weavemaster")).toHaveLength(2);
      expect(s.objects[w]?.tapped).toBe(true);
    });
  });
});

describe("lot A, multicolor", () => {
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const activate = (s: S, player: string, source: string, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error(`ability not found: ${source}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Answers any object choice by taking `id` if offered. */
  const pick =
    (id: string): Answer =>
    (req) =>
      req.type === "pick" && req.options.includes(id) ? [id] : undefined;
  const tokensNamed = (s: S, name: string) => s.battlefield.filter((id) => s.objects[id]?.isToken && nameOf(s, id) === name);
  const armies = (s: S) => s.battlefield.filter((id) => chars(s, id).subtypes.includes("Army"));
  const canCast = (s: S, player: string, card: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === card);

  describe("The Hobbit, lot A - multicolor", () => {
    describe("Bard, King of Dale", () => {
      it("the first card of the draw step isn't doubled; a later draw is", () => {
        let s = scenario({
          step: "upkeep",
          p1: { battlefield: ["Bard, King of Dale", "Island"], hand: ["Opt"], library: lands("Forest", 10) },
        });
        s = advanceUntil(s, (x) => x.turn.step === "main1");
        expect(s.players.p1?.hand).toHaveLength(2);
        s = settle(cast(s, "p1", "Opt"));
        // Opt: one card drawn, replaced by two.
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("a card drawn during the upkeep doesn't make the first card of the draw step doubled (PLAN-M M8b)", () => {
        let s = scenario({
          step: "upkeep",
          p1: { battlefield: ["Bard, King of Dale", "Island"], hand: ["Opt"], library: lands("Forest", 10) },
        });
        // Opt in the upkeep: two cards.
        s = settle(cast(s, "p1", "Opt"));
        expect(s.turn.step).toBe("upkeep");
        expect(s.players.p1?.hand).toHaveLength(2);
        // The draw step's card: one.
        s = advanceUntil(s, (x) => x.turn.step === "main1");
        expect(s.players.p1?.hand).toHaveLength(3);
      });

      it("tokens created under your control are doubled", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bard, King of Dale", "Thranduil, Sindarin Liege // Silvan Rally"],
            hand: ["Forest"],
          },
        });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        expect(tokensNamed(s, "Elf")).toHaveLength(2);
      });
    });

    it("Bard the Bowman: your second card each turn puts a +1/+1 counter on a creature, which gains lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Bard the Bowman", "Bear Cub", ...lands("Island", 2)], hand: ["Opt", "Opt"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Opt"), pick(bear));
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Opt"), pick(bear));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
      // Until end of turn only.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("lifelink");
    });

    describe("Bard's Company", () => {
      it("is cast as though it had flash if you control a Human", () => {
        const run = (creature: string) => {
          let s = scenario({
            active: "p2",
            p1: { battlefield: [creature, "Plains", "Island", ...lands("Forest", 2)], hand: ["Bard's Company"] },
          });
          s = act(s, "p2", { type: "pass" });
          return canCast(s, "p1", idOf(s, "p1", "hand", "Bard's Company"));
        };
        expect(run("Patient Instructor")).toBe(true);
        expect(run("Bear Cub")).toBe(false);
      });

      it("your other creatures get +1/+1; recruit: a nonland card discarded creates a Human Soldier", () => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", "Plains", "Island", ...lands("Forest", 2)],
            hand: ["Bard's Company"],
            library: ["Opt", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Bard's Company"));
        expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
        const soldier = tokensNamed(s, "Human Soldier")[0] as string;
        expect(pt(s, soldier)).toEqual([2, 2]);
        expect(chars(s, soldier).colors).toEqual(["W"]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(s, idOf(s, "p1", "battlefield", "Bard's Company"))).toEqual([2, 3]);
      });
    });

    it("Patient Instructor: recruiting by discarding a land creates no token", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Island", "Forest"], hand: ["Patient Instructor"], library: ["Forest", "Opt"] },
      });
      s = settle(cast(s, "p1", "Patient Instructor"));
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
      expect(tokensNamed(s, "Human Soldier")).toHaveLength(0);
    });

    describe("Bifur, Melodic Rider", () => {
      it("when attacking, a +1/+1 counter on a creature; storied: your Dwarves' abilities trigger twice", () => {
        const run = (others: string[]) => {
          let s = scenario({ p1: { battlefield: ["Bifur, Melodic Rider", ...others] } });
          const bifur = idOf(s, "p1", "battlefield", "Bifur, Melodic Rider");
          s = settle(attack(s, [bifur]), pick(bifur));
          return s.objects[bifur]?.counters["+1/+1"];
        };
        // Bifur (legendary) and two artifacts: storied.
        expect(run(["Fishing Pole", "Fishing Pole"])).toBe(2);
        expect(run(["Fishing Pole", "Bear Cub"])).toBe(1);
      });

      it("storied: another Dwarf's ability (Nori) also triggers one more time", () => {
        let s = scenario({ p1: { battlefield: ["Bifur, Melodic Rider", "Nori, Teller of Tales", "Fishing Pole"] } });
        const nori = idOf(s, "p1", "battlefield", "Nori, Teller of Tales");
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: nori, defender: "p2" }] });
        expect(s.triggers.length + s.stack.length).toBe(2);
      });
    });

    describe("Bolg of the North", () => {
      it("sacrificing another creature: damage equal to its power; the excess amasses Goblins", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Fire Elemental"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Bolg of the North"), (req) =>
          req.type === "pick" && req.options.includes(fire) ? [fire] : pick(bear)(req, "p1", s),
        );
        expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
        expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
        // Fire Elemental: 5; Bear Cub: toughness 2; excess of 3.
        const army = armies(s)[0] as string;
        expect(s.objects[army]?.controller).toBe("p1");
        expect(s.objects[army]?.counters["+1/+1"]).toBe(3);
        expect(chars(s, army).subtypes).toContain("Goblin");
      });

      it("without a sacrifice, nothing happens; without excess, no Army", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        s = settle(cast(s, "p1", "Bolg of the North"), (req) => (req.intent === "sacrifice" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(s.objects[idOf(s, "p2", "battlefield", "Fire Elemental")]?.damage).toBe(0);

        let t = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Bear Cub"], hand: ["Bolg of the North"] },
          p2: { battlefield: ["Fire Elemental"] },
        });
        const bear = idOf(t, "p1", "battlefield", "Bear Cub");
        const fire = idOf(t, "p2", "battlefield", "Fire Elemental");
        t = settle(cast(t, "p1", "Bolg of the North"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? [bear] : pick(fire)(req, "p1", t),
        );
        expect(t.objects[fire]?.damage).toBe(2);
        expect(armies(t)).toHaveLength(0);
      });
    });

    it("Bolg's Company: haste with another Goblin; {T}, sacrifice another Goblin: add {B}{R}", () => {
      let s = scenario({ p1: { battlefield: ["Bolg's Company", "Goblin Smuggler"] } });
      const company = idOf(s, "p1", "battlefield", "Bolg's Company");
      expect(chars(s, company).keywords).toContain("haste");
      s = activate(s, "p1", company);
      expect(idsOf(s, "p1", "graveyard", "Goblin Smuggler")).toHaveLength(1);
      expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
      expect(chars(s, company).keywords).not.toContain("haste");
    });

    it("The Chief Warg: Ferocious - when attacking with a creature with power 4 or greater, draw a card and lose 1 life", () => {
      const run = (other: string) => {
        let s = scenario({ p1: { battlefield: ["The Chief Warg", other], library: lands("Forest", 3) } });
        s = settle(attack(s, [idOf(s, "p1", "battlefield", "The Chief Warg")]));
        return [s.players.p1?.hand.length, s.players.p1?.life];
      };
      expect(run("Fire Elemental")).toEqual([1, 19]);
      expect(run("Bear Cub")).toEqual([0, 20]);
    });

    it("Duskwatch Hunter: +1/+1 counter on entering; can't be blocked by tokens", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", ...lands("Forest", 2), "Duskwatch Hunter"], hand: ["Duskwatch Hunter"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      const hunter = idOf(s, "p1", "battlefield", "Duskwatch Hunter");
      s = settle(cast(s, "p1", "Duskwatch Hunter"), pick(hunter));
      expect(s.objects[hunter]?.counters["+1/+1"]).toBe(1);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const lionsObj = s.objects[lions];
      if (lionsObj) lionsObj.isToken = true;
      s = attack(s, [hunter]);
      expect(canBlock(s, lions, hunter)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), hunter)).toBe(true);
    });

    describe("Eagle's Rescue", () => {
      it("the enchanted creature gets +2/+2 and flying", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Plains", 2), ...lands("Island", 2), "Bear Cub"], hand: ["Eagle's Rescue"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Eagle's Rescue", { targets: { enchant: [bear] } }));
        expect(pt(s, bear)).toEqual([4, 4]);
        expect(chars(s, bear).keywords).toContain("flying");
      });

      it("from the graveyard, at sorcery speed: returns attached to one of your creatures with power 1 or less", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Plains", 2), ...lands("Island", 2), "Llanowar Elves", "Bear Cub"],
            graveyard: ["Eagle's Rescue"],
          },
        });
        const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const rescue = idOf(s, "p1", "graveyard", "Eagle's Rescue");
        expect(() => activate(s, "p1", rescue, { targets: { t: [bear] } })).toThrow();
        // Entering "attached to the targeted creature": no other host is asked for.
        let asked = false;
        s = settle(activate(s, "p1", rescue, { targets: { t: [elves] } }), () => {
          asked = true;
          return undefined;
        });
        expect(asked).toBe(false);
        const aura = idOf(s, "p1", "battlefield", "Eagle's Rescue");
        expect(s.objects[aura]?.attachedTo).toBe(elves);
        expect(pt(s, elves)).toEqual([3, 3]);
        expect(chars(s, elves).keywords).toContain("flying");
      });
    });

    it("Fearsome Goblin Pair: when it dies, amass Goblins 4", () => {
      let s = scenario({ p1: { battlefield: ["Fearsome Goblin Pair", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
      const pair = idOf(s, "p1", "battlefield", "Fearsome Goblin Pair");
      s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [pair] } }));
      const army = armies(s)[0] as string;
      expect(pt(s, army)).toEqual([4, 4]);
      expect(chars(s, army).subtypes).toEqual(expect.arrayContaining(["Goblin", "Army"]));
      expect(chars(s, army).colors).toEqual(["B"]);
    });

    it("Goblin Plate Mail: amasses Goblins 1 and attaches to the Army (+1/+0 and menace)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Goblin Plate Mail"] } });
      s = settle(cast(s, "p1", "Goblin Plate Mail"));
      const army = armies(s)[0] as string;
      expect(s.objects[idOf(s, "p1", "battlefield", "Goblin Plate Mail")]?.attachedTo).toBe(army);
      expect(pt(s, army)).toEqual([2, 1]);
      expect(chars(s, army).keywords).toContain("menace");
    });

    describe("The Great Goblin", () => {
      it("counters on an Army you control: 2 damage to a targeted opponent", () => {
        let s = scenario({ p1: { battlefield: ["The Great Goblin", "Swamp", "Mountain"], hand: ["Goblin Plate Mail"] } });
        s = settle(cast(s, "p1", "Goblin Plate Mail"));
        expect(s.players.p2?.life).toBe(18);
      });

      it("another Goblin dies: the top card is exiled, playable until the end of your next turn", () => {
        let s = scenario({
          p1: {
            battlefield: ["The Great Goblin", "Goblin Smuggler", "Mountain", "Island"],
            hand: ["Lightning Strike"],
            library: ["Opt", ...lands("Forest", 5)],
          },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p1", "battlefield", "Goblin Smuggler")] } }));
        const opt = s.exile.find((id) => nameOf(s, id) === "Opt") as string;
        expect(opt).toBeDefined();
        // Lightning Strike tapped both lands; on p1's next turn, Opt is still cast from exile.
        s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
        expect(canCast(s, "p1", opt)).toBe(true);
        s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
        expect(canCast(s, "p1", opt)).toBe(false);
      });
    });

    describe("Mirkwood Nurturer", () => {
      it("returns another of your permanents; if it's done, a +1/+1 counter", () => {
        let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Mirkwood Nurturer"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Mirkwood Nurturer"), pick(bear));
        expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Mirkwood Nurturer"))).toEqual([4, 3]);
      });

      it("without a target, no counter", () => {
        let s = scenario({ p1: { battlefield: [...lands("Forest", 3), "Bear Cub"], hand: ["Mirkwood Nurturer"] } });
        s = settle(cast(s, "p1", "Mirkwood Nurturer"), (req) => (req.type === "pick" ? [] : undefined));
        expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
        expect(pt(s, idOf(s, "p1", "battlefield", "Mirkwood Nurturer"))).toEqual([3, 2]);
      });
    });

    it("Nori, Teller of Tales: when attacking, a targeted attacking creature gets first strike until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Nori, Teller of Tales", "Bear Cub"] } });
      const nori = idOf(s, "p1", "battlefield", "Nori, Teller of Tales");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(attack(s, [nori, bear]), pick(bear));
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    describe("Silvan Reveler", () => {
      it("on entering: draw, discard; a discarded land enters tapped", () => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
            hand: ["Silvan Reveler"],
            library: ["Swamp", "Opt"],
          },
        });
        s = settle(cast(s, "p1", "Silvan Reveler"));
        const swamp = idOf(s, "p1", "battlefield", "Swamp");
        expect(s.objects[swamp]?.tapped).toBe(true);
        expect(s.players.p1?.graveyard).toHaveLength(0);
      });

      it("Landfall from the graveyard: pay {1}{G}{U} to return it to hand", () => {
        const s = scenario({
          p1: { battlefield: ["Forest", "Island", "Island"], hand: ["Forest"], graveyard: ["Silvan Reveler"] },
        });
        const play = (yes: boolean) =>
          settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (req) =>
            req.intent === "may" ? [yes ? 1 : 0] : undefined,
          );
        expect(idsOf(play(false), "p1", "graveyard", "Silvan Reveler")).toHaveLength(1);
        const paid = play(true);
        expect(idsOf(paid, "p1", "hand", "Silvan Reveler")).toHaveLength(1);
        expect(paid.battlefield.filter((id) => paid.objects[id]?.tapped)).toHaveLength(3);
      });
    });

    describe("Thranduil, Sindarin Liege // Silvan Rally", () => {
      const THRANDUIL = "Thranduil, Sindarin Liege // Silvan Rally";

      it("your other Elves get +1/+1; Landfall: a 1/1 green Elf token", () => {
        let s = scenario({ p1: { battlefield: [THRANDUIL, "Llanowar Elves"], hand: ["Forest"] } });
        expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
        expect(pt(s, idOf(s, "p1", "battlefield", THRANDUIL))).toEqual([2, 3]);
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        const elf = tokensNamed(s, "Elf")[0] as string;
        expect(pt(s, elf)).toEqual([2, 2]);
        expect(chars(s, elf).colors).toEqual(["G"]);
      });

      it("Silvan Rally: mill four cards, then up to two milled land cards go to your hand", () => {
        let s = scenario({
          p1: { battlefield: lands("Forest", 3), hand: [THRANDUIL], library: ["Opt", "Island", "Bear Cub", "Swamp", "Mountain"] },
        });
        s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", THRANDUIL), face: 1 });
        s = settle(s, (req, _player, cur) => {
          if (req.type !== "pick") return undefined;
          // Only the milled land cards are offered (not the Mountain, fifth card, left in the library).
          expect(namesIn(cur, req.options.map(String)).sort()).toEqual(["Island", "Swamp"]);
          return req.options;
        });
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Swamp"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
        expect(s.exile.some((id) => nameOf(s, id) === THRANDUIL)).toBe(true);
      });
    });

    describe("Thranduil's Company", () => {
      it("with another Elf, an additional land; Landfall: two +1/+1 counters and vigilance", () => {
        let s = scenario({ p1: { battlefield: ["Thranduil's Company", "Llanowar Elves"], hand: ["Forest", "Island"] } });
        const company = idOf(s, "p1", "battlefield", "Thranduil's Company");
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), pick(company));
        expect(s.objects[company]?.counters["+1/+1"]).toBe(2);
        expect(chars(s, company).keywords).toContain("vigilance");
        // Second land of the turn allowed.
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") }), pick(company));
        expect(s.objects[company]?.counters["+1/+1"]).toBe(4);
      });

      it("without another Elf, no additional land", () => {
        let s = scenario({ p1: { battlefield: ["Thranduil's Company"], hand: ["Forest", "Island"] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        expect(() => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") })).toThrow();
      });
    });

    describe("Tom, Bert, and William", () => {
      it("{1}, sacrifice another creature: draw as many as its power, then discard a card", () => {
        let s = scenario({
          p1: { battlefield: ["Tom, Bert, and William", "Fire Elemental", "Swamp"], library: lands("Forest", 8) },
        });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Tom, Bert, and William")));
        expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(4);
        expect(s.players.p1?.graveyard).toHaveLength(2);
      });

      it("when they die as a creature, they return to the battlefield as a noncreature artifact", () => {
        let s = scenario({
          p1: {
            battlefield: ["Tom, Bert, and William", ...lands("Mountain", 4)],
            hand: ["Lightning Strike", "Lightning Strike"],
          },
        });
        const tbw = idOf(s, "p1", "battlefield", "Tom, Bert, and William");
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [tbw] } }));
        // 3 damage on a 5/5: the second Lightning Strike kills it.
        expect(idsOf(s, "p1", "battlefield", "Tom, Bert, and William")).toEqual([tbw]);
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [tbw] } }));
        const back = idOf(s, "p1", "battlefield", "Tom, Bert, and William");
        expect(chars(s, back).types).toEqual(["Artifact"]);
        expect(chars(s, back).subtypes).toEqual([]);
      });
    });
  });
});

describe("lot A, colorless cards and lands", () => {
  type S = GameState;
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
  /** Picks among a choice's options the named objects (one copy per given name). */
  const pickNamed = (s: S, req: ChoiceRequest, ...names: string[]) => {
    if (req.type !== "pick") return undefined;
    const left = [...req.options];
    return names.flatMap((n) => {
      const i = left.findIndex((id) => typeof id === "string" && nameOf(s, id) === n);
      return i < 0 ? [] : left.splice(i, 1);
    });
  };
  /** Equips `equipment` onto `creature` ("Equip" ability). */
  const equip = (s: S, equipment: string, creature: string) =>
    settle(activate(s, "p1", equipment, "Equip", { targets: { t: [creature] } }));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  const DWARF_CARD: CardDef = customCard({ name: "Test Dwarf", subtypes: ["Dwarf"], power: 2, toughness: 2 });

  describe("The Hobbit, lot A - colorless cards and lands", () => {
    // --- Colorless creatures --------------------------------------------------------
    it("Long-Bodied Grey Dog: flash and reach; on entering, a tapped Treasure", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 3), hand: ["Long-Bodied Grey Dog"] } });
      s = settle(cast(s, "p1", "Long-Bodied Grey Dog"));
      const dog = idOf(s, "p1", "battlefield", "Long-Bodied Grey Dog");
      expect(chars(s, dog).keywords).toEqual(expect.arrayContaining(["flash", "reach"]));
      const treasure = idOf(s, "p1", "battlefield", "Treasure");
      expect(s.objects[treasure]?.tapped).toBe(true);
    });

    it("Old Thrush: you gain 2 life, then a searched basic land goes on top of the shuffled library", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 2), hand: ["Old Thrush"], library: ["Opt", "Swamp", "Serra Angel", "Island"] },
      });
      s = settle(cast(s, "p1", "Old Thrush"), (req, _player, cur) =>
        req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Swamp") : undefined,
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.library).toHaveLength(4);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Swamp");
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("Troop of Ponies: two basic lands, one onto the battlefield tapped, the other to hand", () => {
      let s = scenario({
        p1: { battlefield: ["Troop of Ponies", ...lands("Wastes", 2)], library: ["Opt", "Forest", "Island", "Swamp"] },
      });
      const troop = idOf(s, "p1", "battlefield", "Troop of Ponies");
      s = settle(activate(s, "p1", troop), (req, _player, cur) => {
        if (req.type !== "pick") return undefined;
        return req.intent === "search" ? pickNamed(cur, req, "Forest", "Island") : pickNamed(cur, req, "Island");
      });
      expect(idsOf(s, "p1", "graveyard", "Troop of Ponies")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Opt", "Swamp"]);
    });

    // --- The Arkenstone // Seek the Heart --------------------------------------------
    describe("The Arkenstone // Seek the Heart", () => {
      it("your creatures get +1/+1; at the beginning of your end step, draw a card", () => {
        let s = scenario({
          p1: { battlefield: ["The Arkenstone // Seek the Heart", "Bear Cub"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
        expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(1);
      });

      it("Seek the Heart: a legendary creature card to hand, then the card is exiled (castable afterwards)", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Plains", 8),
            hand: ["The Arkenstone // Seek the Heart"],
            library: ["Bear Cub", "Thorin Oakenshield", "Opt"],
          },
        });
        const card = idOf(s, "p1", "hand", "The Arkenstone // Seek the Heart");
        let seen: (string | undefined)[] = [];
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }), (req, _player, cur) => {
          if (req.type !== "pick" || req.intent !== "search") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return pickNamed(cur, req, "Thorin Oakenshield");
        });
        expect(seen).toEqual(["Thorin Oakenshield"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Thorin Oakenshield"]);
        // New object in exile (400.7): the card is there, and The Arkenstone can then be cast from exile.
        const exiled = s.exile.find((id) => nameOf(s, id) === "The Arkenstone // Seek the Heart") as string;
        expect(exiled).toBeDefined();
        expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === exiled)).toBe(true);
      });
    });

    // --- The Black Arrow -------------------------------------------------------------
    describe("The Black Arrow", () => {
      it("on entering, 1 damage: a Dragon thus damaged is destroyed", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
        const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
        s = settle(cast(s, "p1", "The Black Arrow", { targets: { t: [dragon] } }));
        expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      });

      it("a creature that is not a Dragon is dealt only 1 damage; a player can be targeted", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "The Black Arrow", { targets: { t: [bear] } }));
        expect(s.objects[bear]?.damage).toBe(1);
        expect(s.battlefield).toContain(bear);
        let t = scenario({ p1: { battlefield: lands("Wastes", 3), hand: ["The Black Arrow"] } });
        t = settle(cast(t, "p1", "The Black Arrow", { targets: { t: ["p2"] } }));
        expect(t.players.p2?.life).toBe(19);
      });

      it("the equipped creature gets +1/+1 and reach; Equip {1}", () => {
        let s = scenario({ p1: { battlefield: ["The Black Arrow", "Bear Cub", "Wastes"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = equip(s, idOf(s, "p1", "battlefield", "The Black Arrow"), bear);
        expect(pt(s, bear)).toEqual([3, 3]);
        expect(chars(s, bear).keywords).toContain("reach");
      });
    });

    // --- Dwarven Mattock ----------------------------------------------------------------
    it("Dwarven Mattock: attaches on entering to the targeted Dwarf, which gets +2/+2 and ward {1}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Wastes", 2), DWARF_CARD], hand: ["Dwarven Mattock"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const dwarf = idOf(s, "p1", "battlefield", DWARF_CARD.name);
      s = settle(cast(s, "p1", "Dwarven Mattock"), (req) =>
        req.type === "pick" && req.options.includes(dwarf) ? [dwarf] : undefined,
      );
      const mattock = idOf(s, "p1", "battlefield", "Dwarven Mattock");
      expect(s.objects[mattock]?.attachedTo).toBe(dwarf);
      expect(pt(s, dwarf)).toEqual([4, 4]);
      // Ward {1}: the opponent's Shock, who has no mana left to pay it, is countered.
      s = act(s, "p1", { type: "pass" });
      s = cast(s, "p2", "Lightning Strike", { targets: { t: [dwarf] } });
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(s.objects[dwarf]?.damage).toBe(0);
    });

    // --- Giant's Boulder -------------------------------------------------------------
    describe("Giant's Boulder", () => {
      it("on entering, scry 2", () => {
        let s = scenario({ p1: { battlefield: ["Wastes"], hand: ["Giant's Boulder"], library: ["Opt", "Island", "Swamp"] } });
        let asked = false;
        s = settle(cast(s, "p1", "Giant's Boulder"), (req, _player, cur) => {
          if (req.type === "pick" && req.options.length === 2) {
            asked = true;
            expect(namesIn(cur, req.options as string[]).sort()).toEqual(["Island", "Opt"]);
          }
          return undefined;
        });
        expect(asked).toBe(true);
      });

      it("{1}, {T}: one mana of any color", () => {
        let s = scenario({ p1: { battlefield: ["Giant's Boulder", "Wastes"], hand: ["Llanowar Elves"] } });
        s = activate(s, "p1", idOf(s, "p1", "battlefield", "Giant's Boulder"), "color");
        s = settle(s, (req) => (req.type === "pick" && req.options.includes("G") ? ["G"] : undefined));
        expect(s.players.p1?.manaPool.G).toBe(1);
        s = settle(cast(s, "p1", "Llanowar Elves"));
        expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      });

      it("{7}, {T}, sacrifice it: destroy a targeted permanent", () => {
        let s = scenario({ p1: { battlefield: ["Giant's Boulder", ...lands("Wastes", 7)] }, p2: { battlefield: ["Island"] } });
        const island = idOf(s, "p2", "battlefield", "Island");
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Giant's Boulder"), "Destroy", { targets: { t: [island] } }));
        expect(idsOf(s, "p2", "graveyard", "Island")).toHaveLength(1);
        expect(idsOf(s, "p1", "graveyard", "Giant's Boulder")).toHaveLength(1);
      });
    });

    // --- Glamdring // Gleam of Death -------------------------------------------------
    describe("Glamdring, Foe-hammer // Gleam of Death", () => {
      it("your instants and sorceries cost {X} less, X being the power of the equipped creature", () => {
        let s = scenario({
          p1: {
            battlefield: ["Glamdring, Foe-hammer // Gleam of Death", "Bear Cub", ...lands("Plains", 2), "Mountain"],
            hand: ["Lightning Strike"],
          },
        });
        const glamdring = idOf(s, "p1", "battlefield", "Glamdring, Foe-hammer // Gleam of Death");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        // Unequipped: X = 0, and {1}{R} isn't payable with the single Mountain left after Equip.
        s = equip(s, glamdring, bear);
        expect(s.objects[glamdring]?.attachedTo).toBe(bear);
        s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
        expect(s.players.p2?.life).toBe(17);
      });

      it("without an equipped creature, no reduction", () => {
        const s = scenario({
          p1: { battlefield: ["Glamdring, Foe-hammer // Gleam of Death", "Bear Cub", "Mountain"], hand: ["Lightning Strike"] },
        });
        expect(() => cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } })).toThrow();
      });

      it("Gleam of Death: mill six cards, then the instants and sorceries among them go to hand", () => {
        let s = scenario({
          p1: {
            battlefield: lands("Island", 4),
            hand: ["Glamdring, Foe-hammer // Gleam of Death"],
            library: ["Opt", "Bear Cub", "Lightning Strike", "Forest", "Serra Angel", "Island", "Swamp"],
          },
        });
        const card = idOf(s, "p1", "hand", "Glamdring, Foe-hammer // Gleam of Death");
        s = settle(act(s, "p1", { type: "cast", card, face: 1 }));
        expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Lightning Strike", "Opt"]);
        expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Island", "Serra Angel"]);
        expect(namesIn(s, s.players.p1?.library)).toEqual(["Swamp"]);
        expect(namesIn(s, s.exile)).toEqual(["Glamdring, Foe-hammer // Gleam of Death"]);
      });
    });

    // --- My Precious // Allure of Power ----------------------------------------
    describe("My Precious // Allure of Power", () => {
      it("Equip-{2}, pay 2 life: the equipped creature has hexproof and can't be blocked", () => {
        let s = scenario({
          p1: { battlefield: ["My Precious // Allure of Power", "Bear Cub", ...lands("Wastes", 2)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const precious = idOf(s, "p1", "battlefield", "My Precious // Allure of Power");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = equip(s, precious, bear);
        expect(s.objects[precious]?.attachedTo).toBe(bear);
        expect(s.players.p1?.life).toBe(18);
        expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "unblockable"]));
        s = attack(s, [bear]);
        // The Angel can't block it: the defender has no block to declare, and the Cub deals its damage.
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "main2", 50);
        expect(s.pending?.kind).not.toBe("declareBlockers");
        expect(s.players.p2?.life).toBe(18);
        // Control: without the Precious, the Angel could block.
        let w = scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
        w = attack(w, [idOf(w, "p1", "battlefield", "Bear Cub")]);
        w = advanceUntil(w, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "main2", 50);
        expect(w.pending?.kind).toBe("declareBlockers");
      });

      it("Allure of Power: sacrifice a creature as an additional cost, draw two cards", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["My Precious // Allure of Power"] },
        });
        const card = idOf(s, "p1", "hand", "My Precious // Allure of Power");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(act(s, "p1", { type: "cast", card, face: 1, sacrifice: [bear] }));
        expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
        expect(s.players.p1?.hand).toHaveLength(2);
        expect(namesIn(s, s.exile)).toEqual(["My Precious // Allure of Power"]);
        // Without a creature to sacrifice, the spell can't be cast.
        const t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["My Precious // Allure of Power"] } });
        const c2 = idOf(t, "p1", "hand", "My Precious // Allure of Power");
        expect(() => act(t, "p1", { type: "cast", card: c2, face: 1 })).toThrow();
      });
    });

    // --- Orcrist ---------------------------------------------------------------------
    it("Orcrist, Goblin-cleaver: +2/+2 and trample; combat damage to a player: a Treasure per creature of the chosen type", () => {
      let s = scenario({
        p1: { battlefield: ["Orcrist, Goblin-cleaver", "Bear Cub", "Bear Cub", "Llanowar Elves", ...lands("Wastes", 3)] },
      });
      const orcrist = idOf(s, "p1", "battlefield", "Orcrist, Goblin-cleaver");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, orcrist, bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("trample");
      let offered = false;
      s = throughCombat(attack(s, [bear]), (req) => {
        if (req.type === "name" && req.of === "creatureType") {
          offered = true;
          return ["Bear"];
        }
        return undefined;
      });
      expect(offered).toBe(true);
      expect(s.players.p2?.life).toBe(16);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    // --- Dard ------------------------------------------------------------------------
    describe("Sting, Bilbo's Sword", () => {
      it("on entering: a sharpening counter per creature of the targeted opponent, and attaches; +1/+0 per counter", () => {
        let s = scenario({
          p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Sting, Bilbo's Sword"] },
          p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel", "Island"] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Sting, Bilbo's Sword"), (req) => {
          if (req.type !== "pick") return undefined;
          if (req.options.includes("p2")) return ["p2"];
          if (req.options.includes(bear)) return [bear];
          return undefined;
        });
        const sting = idOf(s, "p1", "battlefield", "Sting, Bilbo's Sword");
        expect(s.objects[sting]?.counters.hone).toBe(3);
        expect(s.objects[sting]?.attachedTo).toBe(bear);
        expect(pt(s, bear)).toEqual([5, 2]);
      });

      it('"up to one" creature: with no target, Sting stays unattached but gets its counters', () => {
        let s = scenario({
          p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Sting, Bilbo's Sword"] },
          p2: { battlefield: ["Bear Cub"] },
        });
        s = settle(cast(s, "p1", "Sting, Bilbo's Sword"), (req) => {
          if (req.type !== "pick") return undefined;
          return req.options.includes("p2") ? ["p2"] : [];
        });
        const sting = idOf(s, "p1", "battlefield", "Sting, Bilbo's Sword");
        expect(s.objects[sting]?.counters.hone).toBe(1);
        expect(s.objects[sting]?.attachedTo).toBeFalsy();
        expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      });
    });

    // --- Thrór's Map, Spatula -----------------------------------------------------
    it("Thrór's Map: a basic land in hand on entering; {2}, {T}: draw, then discard", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 4), hand: ["Thrór's Map"], library: ["Opt", "Forest", "Island", "Swamp"] },
      });
      s = settle(cast(s, "p1", "Thrór's Map"), (req, _player, cur) =>
        req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Thrór's Map")), (req, _player, cur) =>
        req.type === "pick" ? pickNamed(cur, req, "Forest") : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    });

    it("Well-Worn Spatula: you gain 2 life on entering; the equipped creature gets +1/+1; Equip {1}", () => {
      let s = scenario({ p1: { battlefield: [...lands("Wastes", 2), "Bear Cub"], hand: ["Well-Worn Spatula"] } });
      s = settle(cast(s, "p1", "Well-Worn Spatula"));
      expect(s.players.p1?.life).toBe(22);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, idOf(s, "p1", "battlefield", "Well-Worn Spatula"), bear);
      expect(pt(s, bear)).toEqual([3, 3]);
    });

    // --- Terrains --------------------------------------------------------------------
    it("dual lands of the cycle: enter tapped and produce their two colors", () => {
      const cycle: [string, string[]][] = [
        ["Elvenking's Halls", ["G", "U"]],
        ["Goblin-town", ["B", "R"]],
        ["Iron Hills", ["R", "W"]],
        ["Lake-town", ["W", "U"]],
        ["Mirkwood", ["B", "G"]],
      ];
      for (const [name, colors] of cycle) {
        let s = scenario({ p1: { hand: [name] } });
        s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) }));
        expect(s.objects[idOf(s, "p1", "battlefield", name)]?.tapped).toBe(true);
        const u = scenario({ p1: { battlefield: [name] } });
        const id = idOf(u, "p1", "battlefield", name);
        const produced = legalActions(u, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        expect([...new Set(produced)].sort()).toEqual([...colors].sort());
      }
    });

    it("Elvenking's Halls: {2}{G}{U}, {T}, sacrifice it: two +1/+1 counters on an Elf, at sorcery speed only", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: ["Elvenking's Halls", "Llanowar Elves", "Bear Cub", ...lands("Forest", 2), ...lands("Island", 2)] },
        });
      let s = setup();
      const halls = idOf(s, "p1", "battlefield", "Elvenking's Halls");
      const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
      expect(() =>
        activate(s, "p1", halls, "counters", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      ).toThrow();
      s = settle(activate(s, "p1", halls, "counters", { targets: { t: [elf] } }));
      expect(s.objects[elf]?.counters["+1/+1"]).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Elvenking's Halls")).toHaveLength(1);
      let t = setup();
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Elvenking's Halls"), "counters")).toBe(false);
    });

    it("Mirkwood: a Bear, a Spider or a Wolf; Goblin-town: a Goblin or an Orc", () => {
      let s = scenario({
        p1: { battlefield: ["Mirkwood", "Bear Cub", "Llanowar Elves", ...lands("Swamp", 2), ...lands("Forest", 2)] },
      });
      const mirkwood = idOf(s, "p1", "battlefield", "Mirkwood");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(() =>
        activate(s, "p1", mirkwood, "counters", { targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] } }),
      ).toThrow();
      s = settle(activate(s, "p1", mirkwood, "counters", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      const orc = customCard({ name: "Test Orc", subtypes: ["Orc"], power: 2, toughness: 1 });
      let g = scenario({ p1: { battlefield: ["Goblin-town", orc, "Bear Cub", ...lands("Swamp", 2), ...lands("Mountain", 2)] } });
      const town = idOf(g, "p1", "battlefield", "Goblin-town");
      const orcId = idOf(g, "p1", "battlefield", orc.name);
      expect(() => activate(g, "p1", town, "counters", { targets: { t: [idOf(g, "p1", "battlefield", "Bear Cub")] } })).toThrow();
      g = settle(activate(g, "p1", town, "counters", { targets: { t: [orcId] } }));
      expect(g.objects[orcId]?.counters["+1/+1"]).toBe(2);
    });

    describe("Hobbit Hole", () => {
      it("{T}, sacrifice it: a basic land onto the battlefield tapped", () => {
        let s = scenario({ p1: { battlefield: ["Hobbit Hole"], library: ["Opt", "Plains", "Island"] } });
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hobbit Hole")), (req, _player, cur) =>
          req.type === "pick" && req.intent === "search" ? pickNamed(cur, req, "Plains") : undefined,
        );
        expect(idsOf(s, "p1", "graveyard", "Hobbit Hole")).toHaveLength(1);
        expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
        expect(s.players.p1?.library).toHaveLength(2);
      });

      it("Hobbit cycling {4}: discard it to search for a Hobbit card", () => {
        let s = scenario({
          p1: { battlefield: lands("Wastes", 4), hand: ["Hobbit Hole"], library: ["Opt", "Belladonna Took", "Bear Cub"] },
        });
        const hole = idOf(s, "p1", "hand", "Hobbit Hole");
        let seen: (string | undefined)[] = [];
        s = settle(activate(s, "p1", hole), (req, _player, cur) => {
          if (req.type !== "pick" || req.intent !== "search") return undefined;
          seen = namesIn(cur, req.options as string[]);
          return undefined;
        });
        expect(seen).toEqual(["Belladonna Took"]);
        expect(namesIn(s, s.players.p1?.hand)).toEqual(["Belladonna Took"]);
        expect(idsOf(s, "p1", "graveyard", "Hobbit Hole")).toHaveLength(1);
      });
    });
  });
});

describe("lot C1, unique cards", () => {
  const LEGEND = customCard({ name: "Test Legend", supertypes: ["Legendary"], power: 1, toughness: 1 });
  const ELF_WITH_ABILITY = customCard({
    name: "Test Elf Pinger",
    subtypes: ["Elf"],
    power: 1,
    toughness: 1,
    abilities: [
      {
        kind: "activated",
        cost: { mana: { generic: 0, colored: {}, x: 0 } },
        targets: [],
        effects: [{ op: "gainLife", who: { kind: "you" }, amount: 1 }],
        label: "You gain 1 life",
      } as never,
    ],
  });

  it("Elrond: activating a creature's ability makes you draw (once per turn), not an artifact's", () => {
    let s = scenario({
      p1: {
        battlefield: ["Elrond, Moon-Reader", "Key to the Side-Door", ...lands("Island", 9), "Bear Cub"],
        library: lands("Island", 5),
      },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(
      activate(s, "p1", idOf(s, "p1", "battlefield", "Key to the Side-Door"), "blocked", {
        targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
      }),
    );
    expect(s.players.p1?.hand.length).toBe(hand);
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Elrond, Moon-Reader"), "Exile", { targets: { t: [] } }));
    expect(s.players.p1?.hand.length).toBe(hand + 1);
  });

  it("Master's Councillors: +2/+0 per graveyard of seven cards or more", () => {
    const s = scenario({ p1: { battlefield: ["Master's Councillors"] }, p2: { graveyard: lands("Island", 7) } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Master's Councillors")).power).toBe(3);
  });

  it("Thranduil's Decree: a countered permanent spell is exiled, and then cast without paying", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Thranduil's Decree"] },
      p2: { battlefield: ["Forest", "Forest"], hand: ["Bear Cub"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.player === "p2");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    s = act(s, "p2", { type: "pass" });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Thranduil's Decree"),
        targets: { t: [s.stack[0]?.id as string] },
      }),
    );
    const cub = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(cub).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.player === "p1");
    s = settle(act(s, "p1", { type: "cast", card: cub }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Inside Information: exiled cards are playable this turn, a spell by paying life equal to its MV", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Inside Information"] },
      p2: { library: ["Lightning Strike", "Forest", "Island"] },
    });
    s = settle(cast(s, "p1", "Inside Information", { x: 2, targets: { t: ["p2"] } }));
    const strike = s.exile.find((id) => nameOf(s, id) === "Lightning Strike") as string;
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p2?.life).toBe(17);
    s = act(s, "p1", { type: "playLand", card: forest });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(1);
  });

  it("The Master of Lake-town: a player who loses life mills that many cards", () => {
    let s = scenario({
      p1: { battlefield: ["The Master of Lake-town", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
      p2: { library: lands("Island", 6) },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(3);
  });

  it("Supper for Spiders: opposing creatures that died this turn come back to your side, as Foods", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp"], hand: ["Supper for Spiders"] },
      p2: { battlefield: ["Bear Cub"], graveyard: ["Serra Angel"] },
    });
    destroy(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    s = settle(cast(s, "p1", "Supper for Spiders"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub).types).toEqual(["Artifact"]);
    expect(chars(s, cub).subtypes).toEqual(["Food"]);
    // Serra Angel did not die this turn.
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Getaway Barrel: put into a graveyard from the battlefield, a random creature among the top thirteen", () => {
    let s = scenario({
      p1: { battlefield: ["Getaway Barrel"], library: ["Island", "Bear Cub", "Island", "Serra Angel", ...lands("Island", 12)] },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Getaway Barrel"));
    s = settle(s);
    const creatures = s.battlefield.filter((id) => ["Bear Cub", "Serra Angel"].includes(nameOf(s, id) ?? ""));
    expect(creatures).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(15);
  });

  it("Dwalin: a sharpening counter on each of your Equipment, +1/+0 per counter to the equipped creature", () => {
    let s = scenario({
      p1: { battlefield: ["Sting, Bilbo's Sword", "Bear Cub", "Mountain", "Plains"], hand: ["Dwalin, Weaponmaster"] },
    });
    const sting = idOf(s, "p1", "battlefield", "Sting, Bilbo's Sword");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s.objects[sting]!.attachedTo = bear;
    s.version += 1;
    s = settle(cast(s, "p1", "Dwalin, Weaponmaster"));
    expect(s.objects[sting]?.counters.hone).toBe(1);
    expect(chars(s, bear).power).toBe(3);
  });

  it("Smaug, Wicked Worm: a spell paid with a Treasure's mana makes you draw and lose 1 life; without a Treasure, nothing", () => {
    let s = scenario({ p1: { battlefield: ["Smaug, Wicked Worm", "Forest"], hand: ["Bear Cub"], library: lands("Island", 3) } });
    createTokens(s, "p1", TOKEN_SPECS.Treasure as TokenSpec, 1);
    const hand = s.players.p1?.hand.length ?? 0;
    // {1}{G}: the Forest and the Treasure.
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(s.players.p1?.hand.length).toBe(hand);
    expect(s.players.p1?.life).toBe(19);
    let t = scenario({
      p1: { battlefield: ["Smaug, Wicked Worm", "Forest", "Forest"], hand: ["Bear Cub"], library: lands("Island", 3) },
    });
    t = settle(cast(t, "p1", "Bear Cub"));
    expect(t.players.p1?.life).toBe(20);
  });

  it("Thranduil, the Elvenking: the activated abilities of the Elf cards in your graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Thranduil, the Elvenking"], graveyard: [ELF_WITH_ABILITY] } });
    const t = idOf(s, "p1", "battlefield", "Thranduil, the Elvenking");
    s = settle(activate(s, "p1", t, "life"));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Key to the Side-Door: discard a legendary card with the same name as one of your legends to draw two cards", () => {
    let s = scenario({
      p1: { battlefield: ["Key to the Side-Door", "Island", LEGEND], hand: [LEGEND, "Serra Angel"], library: lands("Island", 3) },
    });
    const key = idOf(s, "p1", "battlefield", "Key to the Side-Door");
    const opt = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "activate" }> =>
        a.type === "activate" && a.source === key && !!a.label?.includes("draw"),
    );
    expect(opt?.additional?.discard?.options).toEqual([idOf(s, "p1", "hand", "Test Legend")]);
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: key,
        ability: opt?.ability ?? -1,
        discard: [idOf(s, "p1", "hand", "Test Legend")],
      }),
    );
    expect(s.players.p1?.hand.length).toBe(hand + 1);
  });
});

describe("The Hobbit: meta cards (PLAN-C, lot C13)", () => {
  describe("Nighthowl Pursuer", () => {
    /** Attacks with the Wolf and returns its power and toughness after the triggers. */
    const attackWith = (p1: string[], p2: string[] = []) => {
      let s = scenario({ p1: { battlefield: ["Nighthowl Pursuer", ...p1] }, p2: { battlefield: p2 } });
      const wolf = idOf(s, "p1", "battlefield", "Nighthowl Pursuer");
      s = settle(attack(s, [wolf]));
      return [chars(s, wolf).power, chars(s, wolf).toughness];
    };

    it("menace", () => {
      const s = scenario({ p1: { battlefield: ["Nighthowl Pursuer"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Nighthowl Pursuer")).keywords).toContain("menace");
    });

    it("Ferocious: when attacking while you control a creature with power 4 or greater, +2/+2 until end of turn", () => {
      expect(attackWith(["Serra Angel"])).toEqual([3, 3]);
      let s = scenario({ p1: { battlefield: ["Nighthowl Pursuer", "Serra Angel"] } });
      const wolf = idOf(s, "p1", "battlefield", "Nighthowl Pursuer");
      s = throughCombat(attack(s, [wolf]));
      expect(s.players.p2?.life).toBe(17);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, wolf).power, chars(s, wolf).toughness]).toEqual([1, 1]);
    });

    it("Ferocious: without a creature with power 4 or greater, no bonus", () => {
      expect(attackWith(["Bear Cub"])).toEqual([1, 1]);
    });

    it("Ferocious: an opponent's creature with power 4 doesn't count", () => {
      expect(attackWith(["Bear Cub"], ["Serra Angel", "Shivan Dragon"])).toEqual([1, 1]);
    });
  });

  describe("Thorin, Mountain-king", () => {
    const THORIN = "Thorin, Mountain-king";
    /** Casts Thorin; `pickFor` answers the targets of its trigger and of the reflexive ability. */
    const enter = (s: S, pick: (req: ChoiceRequest, cur: S) => ChoiceValue[] | undefined) =>
      settle(cast(s, "p1", THORIN), (req, _p, cur) => pick(req, cur));

    it("trample", () => {
      const s = scenario({ p1: { battlefield: [THORIN] } });
      expect(chars(s, idOf(s, "p1", "battlefield", THORIN)).keywords).toContain("trample");
    });

    it("on entering, attaches your targeted Equipment to one of your creatures; it deals damage equal to its power (equipped) to a creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Sword of Vengeance", "Hard-Won Jitte", "Bear Cub"], hand: [THORIN] },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const sword = idOf(s, "p1", "battlefield", "Sword of Vengeance");
      const jitte = idOf(s, "p1", "battlefield", "Hard-Won Jitte");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = enter(s, (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(sword)) return [sword, jitte];
        if (req.options.includes(dragon)) return [dragon];
        if (req.options.includes(bear)) return [bear];
        return undefined;
      });
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(s.objects[jitte]?.attachedTo).toBe(bear);
      // Bear Cub 2/2 + Sword of Vengeance (+2/+0) : 4 blessures au Dragon 5/5.
      expect(s.objects[dragon]?.damage).toBe(4);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("without a targeted Equipment, the creature deals no damage", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Sword of Vengeance"], hand: [THORIN] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const sword = idOf(s, "p1", "battlefield", "Sword of Vengeance");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = enter(s, (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(sword)) return [];
        if (req.options.includes(bear)) return [bear];
        return undefined;
      });
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.objects[bear]?.damage ?? 0).toBe(0);
    });

    it("if the targeted creature left the battlefield, no Equipment attaches and nothing is damaged", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Sword of Vengeance", "Bear Cub"], hand: [THORIN] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const sword = idOf(s, "p1", "battlefield", "Sword of Vengeance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", THORIN) });
      // Thorin resolves; its trigger goes on the stack (Sword and Bear targeted).
      for (let i = 0; i < 20 && s.stack[0]?.kind !== "ability"; i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice") {
          const req = p.request;
          const want = req.type === "pick" ? [sword, bear].find((id) => req.options.includes(id)) : undefined;
          s = act(s, p.player, { type: "choose", values: want ? [want] : req.suggested });
        } else break;
      }
      expect(s.stack[0]?.targets).toEqual({ e: [sword], c: [bear] });
      destroy(s, bear);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(angel) ? [angel] : undefined));
      expect(s.objects[sword]?.attachedTo).toBeUndefined();
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });

    // Gap: the reflexive ability depends on the number of targeted Equipment (`refCount`), not on an Equipment that
    // "becomes attached" (701.3b: an Equipment already attached to this creature doesn't attach again). A Sword
    // already attached to the Bear, targeted with it, still makes Serra Angel take 4 damage.
    it('701.3b: a targeted Equipment already attached to the creature doesn\'t "become" attached, so no damage', () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Sword of Vengeance", "Bear Cub"], hand: [THORIN] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const sword = idOf(s, "p1", "battlefield", "Sword of Vengeance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      (s.objects[sword] as { attachedTo?: string }).attachedTo = bear;
      s = enter(s, (req) => {
        if (req.type !== "pick") return undefined;
        if (req.options.includes(sword)) return [sword];
        if (req.options.includes(angel)) return [angel];
        return req.options.includes(bear) ? [bear] : undefined;
      });
      expect(s.objects[sword]?.attachedTo).toBe(bear);
      expect(s.battlefield).toContain(angel);
      expect(s.objects[angel]?.damage ?? 0).toBe(0);
    });
  });

  describe("Bofur, Reliable Guardian // Concerted Care", () => {
    const BOFUR = "Bofur, Reliable Guardian // Concerted Care";

    it("Bofur: 1/1 legendary creature costing {W}, with lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], hand: [BOFUR] } });
      s = settle(cast(s, "p1", BOFUR));
      const bofur = idOf(s, "p1", "battlefield", BOFUR);
      expect([chars(s, bofur).power, chars(s, bofur).toughness]).toEqual([1, 1]);
      expect(chars(s, bofur).supertypes).toContain("Legendary");
      expect(chars(s, bofur).keywords).toContain("lifelink");
      s = scenario({ p1: { battlefield: [BOFUR] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", BOFUR)]));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Concerted Care (instant): in response, your creature gains hexproof and indestructible; the opposing spell fails", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: [BOFUR] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = cast(s, "p2", "Lightning Strike", { targets: { t: [bear] } });
      s = act(s, "p2", { type: "pass" });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", BOFUR), face: 1, targets: { t: [bear] } });
      s = settle(s);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
      expect(s.objects[bear]?.damage ?? 0).toBe(0);
      expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
      // Indestructible: the destruction has no effect.
      destroy(s, bear);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // Then the card goes on an adventure; the creature is cast afterwards from exile.
      const card = s.exile.find((id) => nameOf(s, id) === BOFUR) as string;
      expect(s.objects[card]?.onAdventure).toBe(true);
      // Until end of turn.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0);
      expect(chars(s, bear).keywords).not.toContain("hexproof");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
      s = settle(act(s, "p1", { type: "cast", card }));
      expect(idsOf(s, "p1", "battlefield", BOFUR)).toHaveLength(1);
    });

    it("Concerted Care: targets an artifact you control, but not an opposing creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Sword of Vengeance"], hand: [BOFUR] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", BOFUR);
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => act(s, "p1", { type: "cast", card, face: 1, targets: { t: [theirs] } })).toThrow();
      const sword = idOf(s, "p1", "battlefield", "Sword of Vengeance");
      s = settle(act(s, "p1", { type: "cast", card, face: 1, targets: { t: [sword] } }));
      expect(chars(s, sword).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    });
  });
});

describe('"You put counters" (lot K2)', () => {
  it("The Great Goblin: only counters you put on your Goblins trigger it", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "The Great Goblin"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "The Great Goblin")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "The Great Goblin")).triggered).toEqual(["The Great Goblin"]);
  });
});

describe("Head of the Hunt (PLAN-D, D3)", () => {
  it("an opposing creature that would die is exiled; the Wolf comes from a reflexive ability, which can be responded to", () => {
    let s = scenario({
      p1: { battlefield: ["Head of the Hunt", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: [cub] } });
    s = passAccepting(s, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority");
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub")).toBe(true);
    // The Wolf doesn't exist yet: the ability waits on the stack.
    expect(idsOf(s, "p1", "battlefield", "Wolf")).toHaveLength(0);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Wolf")).toHaveLength(1);
  });
});

describe("The Hobbit, PLAN-D D9: last cards", () => {
  it("Large Bear: 5/5 hybrid black or green; haste (attacks the turn it enters), trample, reach", () => {
    // {3}{B/G}{B/G}: payable with black as well as green.
    for (const color of ["Swamp", "Forest"]) {
      const s = scenario({ p1: { battlefield: lands(color, 5), hand: ["Large Bear"] } });
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Large Bear"))).toBe(true);
    }
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)], hand: ["Large Bear"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Large Bear"));
    const bear = idOf(s, "p1", "battlefield", "Large Bear");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([5, 5]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["reach", "trample", "haste"]));
    // Haste: it attacks right away; trample: 2 damage to the blocking Bear Cub, 3 to the player.
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = advanceUntil(attack(s, [bear]), (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: cub, attacker: bear }] });
    s = throughCombat(s);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(17);
    // Reach: it can block a flying creature.
    let t = scenario({ active: "p2", p1: { battlefield: ["Large Bear", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
    t = act(t, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
    expect(canBlock(t, idOf(t, "p1", "battlefield", "Large Bear"), angel)).toBe(true);
    expect(canBlock(t, idOf(t, "p1", "battlefield", "Bear Cub"), angel)).toBe(false);
  });
});

describe("PLAN-M M11a: amass asks which Army", () => {
  const ARMY = customCard({ name: "Test Army", subtypes: ["Army"], power: 0, toughness: 1 });
  const armiesOf = (s: GameState) => s.battlefield.filter((id) => chars(s, id).subtypes.includes("Army"));

  it("Goblin Plate Mail: with two Armies, the player chooses the one that gets the counter; the Equipment attaches to it", () => {
    let s = scenario({ p1: { battlefield: [ARMY, ARMY, "Swamp", "Mountain"], hand: ["Goblin Plate Mail"] } });
    const [first, second] = armiesOf(s) as [string, string];
    let asked: ChoiceRequest | undefined;
    s = settle(cast(s, "p1", "Goblin Plate Mail"), (req) => {
      if (req.intent !== "amass") return undefined;
      asked = req;
      return [second];
    });
    // 701.47a: "put N +1/+1 counters on an Army you control" (several: the player's choice; suggestion: the first).
    expect(asked?.type === "pick" && [asked.options, asked.suggested]).toEqual([[first, second], [first]]);
    expect(s.objects[second]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[first]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(chars(s, second).subtypes).toContain("Goblin");
    expect(chars(s, first).subtypes).not.toContain("Goblin");
    // "Then attach this Equipment to that Army."
    expect(s.objects[idOf(s, "p1", "battlefield", "Goblin Plate Mail")]?.attachedTo).toBe(second);
    expect(chars(s, second).keywords).toContain("menace");
  });

  it("Fearsome Goblin Pair: a single Army, no question", () => {
    let s = scenario({ p1: { battlefield: [ARMY, "Fearsome Goblin Pair", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
    const army = armiesOf(s)[0] as string;
    const pair = idOf(s, "p1", "battlefield", "Fearsome Goblin Pair");
    let asked = false;
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [pair] } }), (req) => {
      if (req.intent === "amass") asked = true;
      return undefined;
    });
    expect(asked).toBe(false);
    expect(s.objects[army]?.counters["+1/+1"]).toBe(4);
  });
});
