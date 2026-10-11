/** Murders at Karlov Manor — black cards. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BAT_1,
  type CardScript,
  cond,
  DOG,
  entersWith,
  fx,
  investigate,
  modal,
  mode,
  ref,
  SKELETON_B,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };
const CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** A creature card put into your graveyard from anywhere this turn. */
const CREATURE_CARD_TO_YOUR_GRAVEYARD = amount.turnEvents({
  event: "zone",
  to: "graveyard",
  types: ["Creature"],
  token: false,
  byOwner: true,
  who: "you",
});
/** "Whenever one or more creature cards leave your graveyard" (with `batched`). */
const CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD = when.zoneChange(["graveyard"], { filter: CREATURE, whose: "you" });

export const BLACK: Record<string, CardScript> = {
  "Agency Coroner": {
    abilities: [
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [
          fx.when(cond.refMatches(ref.costSacrificed, { suspected: true }), fx.draw(2)),
          fx.when(cond.not(cond.refMatches(ref.costSacrificed, { suspected: true })), fx.draw(1)),
        ],
        label: "Draw a card (two if the sacrificed creature was suspected)",
      }),
    ],
  },
  "Alley Assailant": {
    // Disguise {4}{B}{B}: read from the text.
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.turnedFaceUp, fx.drain(3, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "Turned face up: an opponent loses 3 life, you gain 3 life",
      }),
    ],
  },
  "Barbed Servitor": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self)], { label: "Suspect it" }),
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], {
        label: "Draw a card, lose 1 life",
      }),
      triggered(when.isDealtDamage, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "An opponent loses life equal to the damage dealt to it",
      }),
    ],
  },
  "Basilica Stalker": {
    // Disguise {4}{B}: read from the text.
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.gainLife(1), fx.surveil(1)], {
        label: "Gain 1 life, surveil 1",
      }),
    ],
  },
  "Case of the Gorgon's Kiss": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { damaged: true }))],
        label: "Destroy a creature dealt damage this turn",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "graveyard", types: ["Creature"], token: false }), 3),
    caseSolved: [
      staticAbility(
        "self",
        {
          addTypes: ["Creature"],
          addSubtypes: ["Gorgon"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["deathtouch", "lifelink"],
        },
        { label: "4/4 Gorgon with deathtouch and lifelink" },
      ),
    ],
  },
  "Case of the Stashed Skeleton": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SKELETON_B, 1, undefined, "sk"), fx.suspect(ref.stored("sk"))], {
        label: "Suspected 2/1 Skeleton",
      }),
    ],
    caseToSolve: cond.not(cond.controls({ subtype: "Skeleton", suspected: true })),
    caseSolved: [
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.search({})],
        label: "Search your library for a card",
      }),
    ],
  },
  "Cerebral Confiscation": {
    spell: modal(
      mode("An opponent discards two cards", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
      mode(
        "An opponent reveals their hand; you choose a nonland card they discard",
        [target.player("t", "opponent")],
        [fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" })],
      ),
    ),
  },
  "Clandestine Meddler": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
        label: "Suspect another creature you control",
      }),
      triggered(when.attackWith(1, { types: ["Creature"], suspected: true }), [fx.surveil(1)], {
        label: "Suspected creatures attack: surveil 1",
      }),
    ],
  },
  "Extract a Confession": {
    // Collect evidence 6 (optional additional cost): read from the text.
    spell: spell(
      [],
      [
        fx.when(cond.not(cond.kicked), fx.sacrifice(ref.eachOpponent, CREATURE)),
        fx.when(cond.kicked, fx.sacrifice(ref.eachOpponent, CREATURE, 1, { greatestPower: true })),
      ],
    ),
  },
  Festerleech: {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.mill(2)], { label: "Mill two cards" }),
      activated({ mana: "{1}{B}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 until end of turn" }),
    ],
  },
  "Homicide Investigator": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [investigate(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Investigate",
      }),
    ],
  },
  "Hunted Bonebrute": {
    // Menace and disguise {1}{B}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DOG, 2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "An opponent creates two 1/1 Dogs",
      }),
      triggered(when.diesSelf, [fx.loseLife(3, ref.eachOpponent)], { label: "Each opponent loses 3 life" }),
    ],
  },
  "Illicit Masquerade": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURE_YOU_CONTROL, 1, "impostor")], {
        label: "An impostor counter on each of your creatures",
      }),
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "impostor" }),
        [fx.exileCard(ref.eventObject), fx.toBattlefield(ref.target())],
        {
          targets: [
            target.upTo(1, {
              ...target.cardInGraveyard("t", CREATURE, "you", "other creature card in your graveyard"),
              notEventObject: true,
            }),
          ],
          label: "Exile it; return another creature from your graveyard to the battlefield",
        },
      ),
    ],
  },
  "It Doesn't Add Up": {
    spell: spell(
      [target.cardInGraveyard("t", CREATURE, "you", "creature card in your graveyard")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "back" }), fx.suspect(ref.stored("back"))],
    ),
  },
  "Lead Pipe": {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(when.dies({ attached: "host" }), [fx.loseLife(1, ref.eachOpponent)], {
        label: "Each opponent loses 1 life",
      }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Leering Onlooker": {
    abilities: [
      activated({
        mana: "{2}{B}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTappedTokens(BAT_1, 2)],
        label: "From the graveyard: two tapped 1/1 flying Bats",
      }),
    ],
  },
  "Long Goodbye": {
    rules: { cantBeCountered: true },
    spell: spell([target.creatureOrPlaneswalker("t", { maxManaValue: 3 })], [fx.destroy(ref.target())]),
  },
  "Macabre Reconstruction": {
    costReduction: { generic: 2, condition: cond.amountAtLeast(CREATURE_CARD_TO_YOUR_GRAVEYARD, 1) },
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", CREATURE, "you", "creature card in your graveyard"))],
      [fx.toHand(ref.target())],
    ),
  },
  "Massacre Girl, Known Killer": {
    // Menace: read from the text.
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { addKeywords: ["wither"] }, { label: "Your creatures have wither" }),
      // "if its toughness was less than 1": read from its last known information.
      triggered(when.dies({ types: ["Creature"], controller: "opponent", maxToughness: 0 }), [fx.draw(1)], {
        label: "An opponent's creature with toughness less than 1 dies: draw a card",
      }),
    ],
  },
  Murder: { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Nightdrinker Moroii": {
    // Disguise {B}{B}: read from the text.
    abilities: [triggered(when.entersSelf, [fx.loseLife(3)], { label: "You lose 3 life" })],
  },
  "Outrageous Robbery": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "r", "you"), fx.grantPlay(ref.stored("r"), { forever: true, anyMana: true })],
    ),
  },
  "Persuasive Interrogators": {
    abilities: [
      triggered(when.entersSelf, [investigate(1)], { label: "Investigate" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.poison(ref.target(), 2)], {
        targets: [target.player("t", "opponent")],
        label: "You sacrifice a Clue: an opponent gets two poison counters",
      }),
    ],
  },
  "Presumed Dead": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 2, 0),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(
              when.diesSelf,
              [fx.moveTo(ref.selfCard, { to: "battlefield" }, { name: "back" }), fx.suspect(ref.stored("back"))],
              { label: "Returns to the battlefield, suspected" },
            ),
          ],
        }),
      ],
    ),
  },
  "Repeat Offender": {
    abilities: [
      activated({
        mana: "{2}{B}",
        // The counter first: if it wasn't suspected, it only becomes suspected.
        effects: [
          fx.when(cond.sourceMatches({ suspected: true }), fx.addCounters(ref.self, 1)),
          fx.when(cond.not(cond.sourceMatches({ suspected: true })), fx.suspect(ref.self)),
        ],
        label: "+1/+1 counter if it's suspected, otherwise suspect it",
      }),
    ],
  },
  "Rot Farm Mortipede": {
    abilities: [
      triggered(CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD, [fx.pump(ref.self, 1, 0, ["menace", "lifelink"])], {
        batched: true,
        label: "+1/+0, menace and lifelink until end of turn",
      }),
    ],
  },
  "Slice from the Shadows": {
    rules: { cantBeCountered: true },
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.neg(amount.x), amount.neg(amount.x))]),
  },
  "Slimy Dualleech": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 1, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        label: "+1/+0 and deathtouch to a creature with power 2 or less",
      }),
    ],
  },
  "Snarling Gorehound": {
    // Menace: read from the text.
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true, maxPower: 2 }), [fx.surveil(1)], {
        label: "Surveil 1",
      }),
    ],
  },
  "Soul Enervation": {
    // Flash: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -4, -4)], {
        targets: [target.creature()],
        label: "-4/-4 until end of turn",
      }),
      triggered(CREATURE_CARDS_LEAVE_YOUR_GRAVEYARD, fx.drain(1), {
        batched: true,
        label: "Each opponent loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Toxin Analysis": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "lifelink"]), investigate(1)]),
  },
  "Undercity Eliminator": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Artifact", "Creature"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.creature("t", { controller: "opponent" })], [fx.exile(ref.target())])),
        ],
        { label: "Sacrifice an artifact or a creature: exile an opponent's creature" },
      ),
    ],
  },
  "Unscrupulous Agent": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromOwnHand(ref.target(), "x")], {
        targets: [target.player("t", "opponent")],
        label: "An opponent exiles a card from their hand",
      }),
    ],
  },
  "Polygraph Orb": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { count: 2, exact: true, rest: "graveyard" }), fx.loseLife(2)], {
        label: "Two of the top four cards into your hand, the rest into your graveyard; lose 2 life",
      }),
      activated({
        mana: "{2}",
        tap: true,
        collectEvidence: 3,
        effects: [fx.punisher(ref.eachOpponent, 3, { discard: true, sacrifice: { types: ["Creature"] } })],
        label: "Each opponent loses 3 life unless they discard a card or sacrifice a creature",
      }),
    ],
  },
  "Vein Ripper": {
    abilities: [
      // Ward—Sacrifice a creature: read from the text.
      triggered(when.dies({ types: ["Creature"] }), [fx.loseLife(2, ref.target()), fx.gainLife(2)], {
        targets: [target.player("t", "opponent")],
        label: "A creature dies: the target opponent loses 2 life, you gain 2",
      }),
    ],
  },
};
