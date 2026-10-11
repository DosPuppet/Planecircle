/** Stellar Sights (EOS): card scripts (PLAN-G). Lands only. */
import { type AbilityDef, type Color, type Keyword, msg } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  target,
  triggered,
  when,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const TAPPED = entersWith({ tapped: true, label: "Enters tapped" });
const ARTIFACTS_3 = cond.controls({ types: ["Artifact"], controller: "you" }, 3);
const LUCK = cond.amountAtLeast(amount.countersOn(ref.self, "luck"), 1);

/**
 * Creature lands of Worldwake and Oath of the Gatewatch: tapped, two colors; "until end of turn, this land becomes an
 * X/Y [its colors] Elemental creature with …; it's still a land".
 */
function manland(
  colors: [Color, Color],
  mana: string,
  pt: [number, number],
  extra: { keywords?: Keyword[]; abilities?: AbilityDef[]; label?: string } = {},
): CardScript {
  return {
    abilities: [
      TAPPED,
      manaAbility(colors),
      activated({
        mana,
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Elemental"],
            setPower: pt[0],
            setToughness: pt[1],
            setColors: colors,
            ...(extra.keywords ? { addKeywords: extra.keywords } : {}),
            ...(extra.abilities ? { addAbilities: extra.abilities } : {}),
          }),
        ],
        label: extra.label ?? msg("Becomes a {power}/{toughness} creature", { power: pt[0], toughness: pt[1] }),
      }),
    ],
  };
}

export const CARDS: Record<string, CardScript> = {
  "Ancient Tomb": { abilities: [manaAbility("C", 2, { drawback: { damageYou: 2 } })] },
  "Blinkmoth Nexus": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Blinkmoth"],
            setPower: 1,
            setToughness: 1,
            addKeywords: ["flying"],
          }),
        ],
        label: "Becomes a 1/1 artifact creature with flying",
      }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { subtype: "Blinkmoth" })],
        effects: [fx.pump(ref.target(), 1, 1)],
        label: "Target Blinkmoth gets +1/+1",
      }),
    ],
  },
  "Bonders' Enclave": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.controls({ types: ["Creature"], controller: "you", minPower: 4 }),
        effects: [fx.draw(1)],
        label: "Draw (creature with power 4 or greater)",
      }),
    ],
  },
  // Indestructible: read from the text.
  "Cascading Cataracts": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.addManaCombination(5)],
        label: "Five mana in any combination",
      }),
    ],
  },
  // Exalted: read from the text.
  "Cathedral of War": { abilities: [TAPPED, manaAbility("C")] },
  "Celestial Colonnade": manland(["W", "U"], "{3}{W}{U}", [4, 4], { keywords: ["flying", "vigilance"] }),
  "Contested War Zone": {
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "any" } },
        [fx.giveControl(ref.self, ref.controllerOf(ref.eventObject))],
        {
          // The damage is dealt to you: the damaged player is not an opponent.
          condition: cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.eachOpponent)), 1),
          label: "The controller of the creature that deals damage to you gains control of it",
        },
      ),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.pumpAll({ attacking: true }, 1, 0)],
        label: "Attacking creatures get +1/+0",
      }),
    ],
  },
  "Creeping Tar Pit": manland(["U", "B"], "{1}{U}{B}", [3, 2], { keywords: ["unblockable"] }),
  "Crystal Quarry": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{5}", tap: true, effects: [fx.addMana("W", "U", "B", "R", "G")], label: "Add {W}{U}{B}{R}{G}" }),
    ],
  },
  "Deserted Temple": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Land"], {}, "land")],
        effects: [fx.untap(ref.target())],
        label: "Untap target land",
      }),
    ],
  },
  "Dust Bowl": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Land"] }, includeSelf: true },
        targets: [target.permanent("t", ["Land"], { basic: false }, "nonbasic land")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy target nonbasic land",
      }),
    ],
  },
  "Eldrazi Temple": {
    abilities: [
      manaAbility("C"),
      manaAbility("C", 2, {
        // "Colorless Eldrazi": spells and sources with no color.
        restriction: { spell: { subtype: "Eldrazi", colorCount: 0 }, abilityOfSource: { subtype: "Eldrazi", colorCount: 0 } },
      }),
    ],
  },
  "Endless Sands": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.moveTo(ref.target(), { to: "exile" }, { name: "e" }), fx.link(ref.stored("e"))],
        label: "Exile a creature you control",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.toBattlefield(ref.filtered(ref.linked, { types: ["Creature"] }))],
        label: "The creature cards exiled with this land return",
      }),
    ],
  },
  "Grove of the Burnwillows": {
    abilities: [manaAbility("C"), manaAbility(["R", "G"], 1, { drawback: { life: { who: "opponents", delta: 1 } } })],
  },
  "High Market": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(1)],
        label: "Sacrifice a creature: 1 life",
      }),
    ],
  },
  "Hissing Quagmire": manland(["B", "G"], "{1}{B}{G}", [2, 2], { keywords: ["deathtouch"] }),
  "Inventors' Fair": {
    abilities: [
      triggered(when.yourUpkeep, [fx.gainLife(1)], { condition: ARTIFACTS_3, label: "Three artifacts: 1 life" }),
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        activationCondition: ARTIFACTS_3,
        effects: [fx.search({ types: ["Artifact"] }, { to: "hand" })],
        label: "Search for an artifact card",
      }),
    ],
  },
  "Lavaclaw Reaches": manland(["B", "R"], "{1}{B}{R}", [2, 2], {
    abilities: [activated({ mana: "{X}", effects: [fx.pump(ref.self, amount.x, 0)], label: "+X/+0" })],
  }),
  // Hexproof: read from the text.
  "Lotus Field": {
    abilities: [
      TAPPED,
      triggered(when.entersSelf, [fx.sacrifice(ref.you, { types: ["Land"] }, 2)], { label: "Sacrifice two lands" }),
      manaAbility([...ANY], 3),
    ],
  },
  "Lumbering Falls": manland(["G", "U"], "{2}{G}{U}", [3, 3], { keywords: ["hexproof"] }),
  "Mana Confluence": { abilities: [manaAbility([...ANY], 1, { payLife: 1 })] },
  Mirrorpool: {
    abilities: [
      TAPPED,
      manaAbility("C"),
      activated({
        mana: "{2}{C}",
        tap: true,
        sacrifice: true,
        targets: [
          target.spell("t", { types: ["Instant", "Sorcery"], controller: "you" }, "instant or sorcery spell you control"),
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copy target instant or sorcery spell you control",
      }),
      activated({
        mana: "{4}{C}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target())],
        label: "A token copy of target creature you control",
      }),
    ],
  },
  Mutavault: {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.self, { addTypes: ["Creature"], setPower: 2, setToughness: 2, addKeywords: ["changeling"] })],
        label: "Becomes a 2/2 creature with all creature types",
      }),
    ],
  },
  "Mystifying Maze": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [target.creature("t", { attacking: true, controller: "opponent" })],
        effects: [
          fx.moveTo(ref.target(), { to: "exile" }, { name: "m" }),
          fx.delayed([fx.toBattlefield(ref.target("m"), { tapped: true })], { m: ref.stored("m") }),
        ],
        label: "Exile the attacker; it returns tapped at the end step",
      }),
    ],
  },
  "Needle Spires": manland(["R", "W"], "{2}{R}{W}", [2, 1], { keywords: ["doubleStrike"] }),
  "Petrified Field": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card from your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a land card from your graveyard",
      }),
    ],
  },
  // Modular 1: read from the text.
  "Power Depot": {
    abilities: [
      TAPPED,
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } },
      }),
    ],
  },
  "Raging Ravine": manland(["R", "G"], "{2}{R}{G}", [3, 3], {
    abilities: [triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "Attacks: a +1/+1 counter" })],
  }),
  "Scavenger Grounds": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Desert" }, includeSelf: true },
        effects: [fx.moveTo(ref.zone("graveyard", ref.eachPlayer), { to: "exile" })],
        label: "Exile all graveyards",
      }),
    ],
  },
  "Shambling Vent": manland(["W", "B"], "{1}{W}{B}", [2, 3], { keywords: ["lifelink"] }),
  "Stirring Wildwood": manland(["G", "W"], "{1}{G}{W}", [3, 4], { keywords: ["reach"] }),
  "Strip Mine": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.permanent("t", ["Land"], {}, "land")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy the target land",
      }),
    ],
  },
  "Terrain Generator": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.pickFromZone("hand", BASIC_LAND, { to: "battlefield", tapped: true }, { count: 1, min: 0 })],
        label: "You may put a basic land from your hand onto the battlefield tapped",
      }),
    ],
  },
  "Thespian's Stage": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.permanent("t", ["Land"], {}, "land")],
        // "… except it has this ability": the ability at index 1 (this one) is kept.
        effects: [fx.becomeCopy(ref.self, ref.target(), "permanent", { keepAbilities: [1] })],
        label: "Becomes a copy of target land",
      }),
    ],
  },
  "Wandering Fumarole": manland(["U", "R"], "{2}{U}{R}", [1, 4], {
    abilities: [
      activated({
        mana: "{0}",
        effects: [fx.modify(ref.self, { switchPT: true })],
        label: "Switch its power and toughness",
      }),
    ],
  }),
  "Blast Zone": {
    abilities: [
      entersWith({ counters: 1, counterKind: "charge", label: "Enters with a charge counter" }),
      manaAbility("C"),
      activated({
        mana: "{X}{X}",
        tap: true,
        effects: [fx.counters(ref.self, "charge", amount.x)],
        label: "X charge counters",
      }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        effects: [fx.destroyAll({ notTypes: ["Land"], compare: [cmp.manaValue("=", amount.lkiCounters("charge"))] })],
        label: "Destroy each nonland permanent with mana value equal to its charge counters",
      }),
    ],
  },
  "Gemstone Caverns": {
    leyline: { notStartingPlayer: true, counter: "luck", exileFromHand: true },
    abilities: [manaAbility("C", 1, { condition: cond.not(LUCK) }), manaAbility([...ANY], 1, { condition: LUCK })],
  },
  "Inkmoth Nexus": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Phyrexian", "Blinkmoth"],
            setPower: 1,
            setToughness: 1,
            addKeywords: ["flying", "infect"],
          }),
        ],
        label: "Becomes a 1/1 artifact creature with flying and infect",
      }),
    ],
  },
  "Meteor Crater": { abilities: [manaAbility([...ANY], 1, { colorsOf: {} })] },
  "Nesting Grounds": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          { id: "a", label: "permanent you control", filter: { objects: { controller: "you" } } },
          { id: "b", label: "second permanent", filter: { objects: {} } },
        ],
        effects: [fx.moveCounter(ref.target("a"), ref.target("b"))],
        label: "Move a counter from a permanent you control onto another",
      }),
    ],
  },
  "Plaza of Heroes": {
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, { restriction: { spell: { legendary: true } } }),
      manaAbility([...ANY], 1, { colorsOf: { legendary: true } }),
      activated({
        mana: "{3}",
        tap: true,
        exileSelf: true,
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
        label: "Target legendary creature gains hexproof and indestructible",
      }),
    ],
  },
  "Reflecting Pool": { abilities: [manaAbility([...ANY, "C"], 1, { likeLands: {} })] },
  Swarmyard: {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        targets: [target.creature("t", { anySubtype: ["Insect", "Rat", "Spider", "Squirrel"] })],
        effects: [fx.regenerate(ref.target())],
        label: "Regenerate target Insect, Rat, Spider or Squirrel",
      }),
    ],
  },
};
