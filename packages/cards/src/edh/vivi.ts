/**
 * Commander: "Vivi Ornitier Storm [TOODEEP]" deck (Vivi Ornitier; blue and red; rfoxley's list). A cEDH storm deck:
 * rituals and free mana (Lion's Eye Diamond, Lotus Petal, Simian Spirit Guide, Rite of Flame, Jeweled Amulet),
 * cantrips and Baubles, free counterspells and pitch spells (Pact of Negation, Misdirection, Snapback, Pyrokinesis),
 * Wheel of Fortune and extra turns that lose the game (Final Fortune), Tandem Lookout (soulbond).
 */
import type { CardScript, Effect, ObjectFilter } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  altCost,
  amount,
  cond,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TO_OPPONENT,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const BLUE: ObjectFilter = { colors: ["U"] };
/** "You may exile a [blue / red] card from your hand rather than pay this spell's mana cost." */
const pitch = (color: "U" | "R") => ({
  mana: "{0}",
  condition: cond.all(),
  label: color === "U" ? "Exile a blue card from your hand" : "Exile a red card from your hand",
  pay: { exileFromHand: { filter: { colors: [color] }, count: 1 } },
});
/** "Take an extra turn after this one. At the beginning of that turn's end step, you lose the game." */
const extraTurnThenLose: Effect[] = [fx.extraTurn, fx.delayedAt("yourNextEndStep", [fx.loseGame])];
/** "If an opponent controls a [land type]" (`controls` reads only your permanents). */
const opponentControls = (subtype: string) => cond.amountAtLeast(amount.count({ subtype, controller: "opponent" }), 1);
/** The Baubles: "Draw a card at the beginning of the next turn's upkeep." */
const drawNextUpkeep = fx.delayedAt("nextUpkeep", [fx.draw(1)]);

export const EDH_VIVI: Record<string, CardScript> = {
  // --- Mana -----------------------------------------------------------------------------------------------------------
  "City of Traitors": {
    abilities: [
      manaAbility("C", 2),
      triggered(when.playLand, [fx.sacrificeIt(ref.self)], {
        condition: cond.eventObjectMatches({ other: true }),
        label: "You play another land: sacrifice this land",
      }),
    ],
  },
  "Desperate Ritual": {
    // Splice onto Arcane {1}{R}: not done (see docs/approximations.md).
    spell: spell([], [fx.addMana("R", "R", "R")]),
  },
  "Fiery Islet": {
    abilities: [
      manaAbility(["U", "R"], 1, { payLife: 1 }),
      activated({ mana: "{1}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Sacrifice it: draw a card" }),
    ],
  },
  // The type of the mana spent is noted on the artifact (`chosen.manaType`); the second ability produces the last noted
  // type (none noted: no mana).
  "Jeweled Amulet": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        activationCondition: cond.not(cond.counterAtLeast("charge", 1)),
        effects: [fx.counters(ref.self, "charge"), fx.chooseForSelf("manaType", { fromCost: true })],
        label: "Put a charge counter on it and note the type of mana spent (only without a charge counter)",
      }),
      manaAbility([], 1, {
        produceChosen: true,
        removeCounter: "charge",
        condition: cond.counterAtLeast("charge", 1),
      }),
    ],
  },
  // "Activate only as an instant": a mana ability never activated during the payment of a cost (automatic payment
  // doesn't use it), so only when you have priority.
  "Lion's Eye Diamond": {
    abilities: [
      activated({
        discardHand: true,
        sacrifice: true,
        effects: [fx.addManaChoice(3)],
        label: "Discard your hand, sacrifice it: three mana of any one color",
      }),
    ],
  },
  "Lotus Petal": { abilities: [manaAbility(ANY_COLOR, 1, { sacrifice: true })] },
  "Mox Amber": {
    abilities: [manaAbility(ANY_COLOR, 1, { colorsOf: { types: ["Creature", "Planeswalker"], legendary: true } })],
  },
  "Paradise Mantle": {
    // Equip {1}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        { addAbilities: [manaAbility(ANY_COLOR)] },
        { label: 'Equipped creature has "{T}: Add one mana of any color"' },
      ),
    ],
  },
  "Rite of Flame": {
    spell: spell(
      [],
      [
        fx.addMana("R", "R"),
        { op: "addMana", mana: ["R"], times: amount.countIn("graveyard", { name: "Rite of Flame" }, "all") },
      ],
    ),
  },
  "Simian Spirit Guide": {
    abilities: [
      activated({ fromHand: true, exileSelf: true, effects: [fx.addMana("R")], label: "Exile it from your hand: add {R}" }),
    ],
  },
  "Strike It Rich": {
    // Flashback: read from the text.
    spell: spell([], [fx.createTokens(TREASURE)]),
  },

  // --- Card draw and selection ----------------------------------------------------------------------------------------
  "Borne Upon a Wind": {
    spell: spell([], [fx.thisTurn({ spellKeywords: { filter: {}, keywords: ["flash"] } }), fx.draw(1)]),
  },
  "Faithless Looting": {
    // Flashback: read from the text.
    spell: spell([], [fx.draw(2), fx.discard(2)]),
  },
  "Gitaxian Probe": {
    spell: spell([target.player("p")], [fx.look(ref.handOf(ref.target("p"))), fx.draw(1)]),
  },
  Intuition: {
    spell: spell(
      [target.player("o", "opponent")],
      [
        fx.chooseAmong(ref.zone("library", ref.you), ref.you, "i", {
          anyNumber: true,
          max: 3,
          anyZone: true,
          prompt: "Search your library for three cards",
        }),
        // "… and reveal them" (to all players).
        fx.reveal(ref.stored("i")),
        fx.chooseAmong(ref.stored("i"), ref.target("o"), "k", {
          anyZone: true,
          prompt: "Choose the card that goes to its owner's hand",
        }),
        fx.toHand(ref.stored("k")),
        fx.moveTo(ref.stored("kRest"), { to: "graveyard" }),
        fx.shuffle(),
      ],
    ),
  },
  "Jeska's Will": {
    spell: modal(
      mode(
        "Add {R} for each card in target opponent's hand",
        [target.player("o", "opponent")],
        [{ op: "addMana", mana: ["R"], times: amount.refCount(ref.handOf(ref.target("o"))) }],
      ),
      mode(
        "Exile the top three cards of your library; you may play them this turn",
        [],
        [fx.exileTop(ref.you, 3, "j"), fx.grantPlay(ref.stored("j"))],
      ),
      {
        label: "Both (you control a commander)",
        targets: [target.player("p", "opponent")],
        effects: [
          { op: "addMana", mana: ["R"], times: amount.refCount(ref.handOf(ref.target("p"))) },
          fx.exileTop(ref.you, 3, "j"),
          fx.grantPlay(ref.stored("j")),
        ],
        condition: cond.controls({ commander: true }),
      },
    ),
  },
  "Mishra's Bauble": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.player("p")],
        effects: [fx.look(ref.libraryTop(ref.target("p"))), drawNextUpkeep],
        label: "Look at the top card of a player's library; draw a card at the next upkeep",
      }),
    ],
  },
  "Urza's Bauble": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.player("p")],
        effects: [fx.look(ref.handOf(ref.target("p")), 1), drawNextUpkeep],
        label: "Look at a card at random in a player's hand; draw a card at the next upkeep",
      }),
    ],
  },
  "Wheel of Fortune": {
    spell: spell([], [fx.discard(99, ref.eachPlayer), fx.draw(7, ref.eachPlayer)]),
  },

  // --- Interaction ----------------------------------------------------------------------------------------------------
  "Chain of Vapor": {
    spell: spell(
      [target.nonland("t")],
      [
        fx.bounce(ref.target()),
        // "That permanent's controller may sacrifice a land. If the player does, they may copy this spell."
        ...fx.mayFor(
          ref.controllerOf(ref.target()),
          "Sacrifice a land to copy Chain of Vapor (with a new target)?",
          fx.sacrifice(ref.controllerOf(ref.target()), { types: ["Land"] }, 1),
          fx.copySpell(ref.self, 1, { for: ref.controllerOf(ref.target()) }),
        ),
      ],
    ),
  },
  "Crowd's Favor": {
    // Convoke: read from the text.
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"])]),
  },
  "Dizzy Spell": {
    // Transmute {1}{U}{U}: read from the text.
    spell: spell([target.creature()], [fx.pump(ref.target(), -3, 0)]),
  },
  "Gut Shot": { spell: spell([target.any()], [fx.damage(1, ref.target())]) },
  "Mental Misstep": {
    spell: spell([target.spell("t", { manaValue: 1 }, "spell with mana value 1")], [fx.counter(ref.target())]),
  },
  Misdirection: {
    castOptions: [altCost(pitch("U"))],
    spell: spell(
      [{ id: "t", label: "spell with a single target", filter: { stackItems: { singleTarget: true, only: "spells" } } }],
      [fx.changeTarget(ref.target())],
    ),
  },
  "Mogg Salvage": {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.all(opponentControls("Island"), cond.controls({ subtype: "Mountain" })),
        label: "Without paying its mana cost (an opponent controls an Island, you control a Mountain)",
      }),
    ],
    spell: spell([target.permanent("t", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target())]),
  },
  "Pact of Negation": {
    spell: spell(
      [target.spell()],
      [
        fx.counter(ref.target()),
        fx.delayedAt("yourNextUpkeep", [fx.unlessPays(ref.you, { mana: "{3}{U}{U}" }, fx.loseGame)].flat()),
      ],
    ),
  },
  Pyroblast: {
    spell: modal(
      mode(
        "Counter target spell if it's blue",
        [target.spell("s")],
        fx.when(cond.targetMatches("s", BLUE), fx.counter(ref.target("s"))),
      ),
      mode(
        "Destroy target permanent if it's blue",
        [target.permanent("p", [], {}, "permanent")],
        fx.when(cond.targetMatches("p", BLUE), fx.destroy(ref.target("p"))),
      ),
    ),
  },
  Pyrokinesis: {
    castOptions: [altCost(pitch("R"))],
    spell: spell([target.between(1, 4, target.creature())], [fx.damageDivided(4, ref.target())]),
  },
  "Red Elemental Blast": {
    spell: modal(
      mode("Counter target blue spell", [target.spell("s", BLUE, "blue spell")], [fx.counter(ref.target("s"))]),
      mode("Destroy target blue permanent", [target.permanent("p", [], BLUE, "blue permanent")], [fx.destroy(ref.target("p"))]),
    ),
  },
  Snapback: {
    castOptions: [altCost(pitch("U"))],
    spell: spell([target.creature()], [fx.bounce(ref.target())]),
  },
  Submerge: {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.all(opponentControls("Forest"), cond.controls({ subtype: "Island" })),
        label: "Without paying its mana cost (an opponent controls a Forest, you control an Island)",
      }),
    ],
    spell: spell([target.creature()], [fx.moveTo(ref.target(), { to: "libraryTop" })]),
  },
  "Tormod's Crypt": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.player("p")],
        effects: [fx.moveAll("graveyard", ref.target("p"), {}, { to: "exile" })],
        label: "Exile target player's graveyard",
      }),
    ],
  },
  "Twisted Image": {
    spell: spell([target.creature()], [fx.modify(ref.target(), { switchPT: true }), fx.draw(1)]),
  },

  // --- Creatures ------------------------------------------------------------------------------------------------------
  "Dragon's Rage Channeler": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.surveil(1)], {
        label: "You cast a noncreature spell: surveil 1",
      }),
      staticAbility(
        "self",
        { power: 2, toughness: 2, addKeywords: ["flying", "mustAttack"] },
        { condition: cond.delirium, label: "Delirium — +2/+2, flying, attacks each combat if able" },
      ),
    ],
  },
  "Tandem Lookout": {
    // Soulbond: read from the text (the pairing abilities).
    abilities: [
      staticAbility(
        { types: ["Creature"], paired: "source" },
        {
          addAbilities: [
            triggered(when.dealsDamage("self", { to: TO_OPPONENT }), [fx.draw(1)], {
              label: "Deals damage to an opponent: draw a card",
            }),
          ],
        },
        { label: 'Paired: each of those creatures has "whenever it deals damage to an opponent, draw a card"' },
      ),
    ],
  },

  // --- Extra turns that lose the game ---------------------------------------------------------------------------------
  "Final Fortune": { spell: spell([], extraTurnThenLose) },
  "Last Chance": { spell: spell([], extraTurnThenLose) },
  "Warrior's Oath": { spell: spell([], extraTurnThenLose) },
};
