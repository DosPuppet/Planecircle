/**
 * Murders at Karlov Manor — white cards (lot A). Disguise, ward, Equipment and keywords are read from the text;
 * "investigate" creates a Clue (`investigate`).
 */
import type { ObjectFilter, Ref } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  CLUE,
  cond,
  DETECTIVE,
  DOG,
  eventReplacement,
  fx,
  investigate,
  playerStatic,
  ref,
  SUSPECTED,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** "another creature you control with power 2 or less". */
const ANOTHER_SMALL: ObjectFilter = { ...YOUR_CREATURES, other: true, maxPower: 2 };
const YOUR_DETECTIVES: ObjectFilter = { subtype: "Detective", controller: "you" };

/** "Each chosen player investigates": a Clue for each of them, under their control. */
const investigateFor = (who: Ref) => fx.createTokens(CLUE, 1, who);

export const WHITE: Record<string, CardScript> = {
  "Absolving Lammasu": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.permanentsOf(ref.eachPlayer, SUSPECTED), false)], {
        label: "Suspected creatures are no longer suspected",
      }),
      triggered(when.diesSelf, [fx.gainLife(3), fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "Gain 3 life and suspect an opponent's creature",
      }),
    ],
  },
  "Assemble the Players": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { types: ["Creature"], maxPower: 2 }, what: "spells", oncePerTurn: true },
        label: "Once each turn, cast a creature spell with power 2 or less from the top of your library",
      }),
    ],
  },
  "Auspicious Arrival": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2), investigate()]),
  },
  "Call a Surprise Witness": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 })],
      [fx.toBattlefield(ref.target(), { counters: { kind: "flying", n: 1 }, addSubtypes: ["Spirit"] })],
    ),
  },
  "Case of the Pilfered Proof": {
    abilities: [
      triggered(when.enters(YOUR_DETECTIVES), [fx.addCounters(ref.eventObject, 1)], {
        label: "A +1/+1 counter on the Detective",
      }),
      triggered(when.permanentTurnedFaceUp(YOUR_DETECTIVES), [fx.addCounters(ref.eventObject, 1)], {
        label: "A +1/+1 counter on the turned-up Detective",
      }),
    ],
    caseToSolve: cond.controls(YOUR_DETECTIVES, 3),
    caseSolved: [
      eventReplacement({ event: "tokens", to: "you", plus: CLUE, modify: {}, label: "A Clue in addition to your tokens" }),
    ],
  },
  "Defenestrated Phantom": {},
  "Delney, Streetwise Lookout": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, maxPower: 2 },
        { addBlockRules: [block.notBy({ minPower: 3 }, "Can't be blocked by creatures with power 3 or greater")] },
        { label: "Your creatures with power 2 or less can't be blocked by creatures with power 3 or greater" },
      ),
      playerStatic({
        triggerMod: { effect: "again", sources: { ...YOUR_CREATURES, maxPower: 2 } },
        label: "Abilities of your creatures with power 2 or less trigger an additional time",
      }),
    ],
  },
  "Doorkeeper Thrull": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "none", on: "enter", entering: { types: ["Artifact", "Creature"] }, everyone: true },
        label: "Artifacts and creatures entering don't cause abilities to trigger",
      }),
    ],
  },
  "Due Diligence": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["vigilance"])], {
        targets: [target.creature("t", { controller: "you", attached: "notHost" })],
        label: "Another creature of yours gets +2/+2 and gains vigilance",
      }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["vigilance"] }, { label: "+2/+2 and vigilance" }),
    ],
  },
  "Essence of Antiquity": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.modifyAll(YOUR_CREATURES, { addKeywords: ["hexproof"] }), fx.untapAll(YOUR_CREATURES)], {
        label: "Your creatures gain hexproof; untap them",
      }),
    ],
  },
  "Forum Familiar": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.bounce(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [{ id: "t", label: "another permanent you control", filter: { objects: { controller: "you", other: true } } }],
        label: "Return another permanent of yours; a +1/+1 counter",
      }),
    ],
  },
  "Griffnaut Tracker": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true }],
        label: "Exile up to two cards from a single graveyard",
      }),
    ],
  },
  "Haazda Vigilante": {
    abilities: [when.entersSelf, when.attacksSelf].map((trigger) =>
      triggered(trigger, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        label: "A +1/+1 counter on a creature of yours with power 2 or less",
      }),
    ),
  },
  "Inside Source": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DETECTIVE)], { label: "A 2/2 Detective" }),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", YOUR_DETECTIVES)],
        effects: [fx.pump(ref.target(), 2, 0, ["vigilance"])],
        label: "A Detective of yours gets +2/+0 and gains vigilance",
      }),
    ],
  },
  "Krovod Haunch": {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Gain 3 life" }),
      triggered(when.putIntoGraveyardSelf, [fx.mayPay("{1}{W}", "Pay {1}{W} for two 1/1 Dogs?", fx.createTokens(DOG, 2))], {
        label: "Pay {1}{W}: two 1/1 Dogs",
      }),
    ],
  },
  "Makeshift Binding": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exile an opponent's creature; gain 2 life",
      }),
    ],
  },
  "Marketwatch Phantom": {
    abilities: [
      triggered(when.enters(ANOTHER_SMALL), [fx.modify(ref.self, { addKeywords: ["flying"] })], {
        label: "Gains flying until end of turn",
      }),
    ],
  },
  "Museum Nightwatch": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(DETECTIVE)], { label: "A 2/2 Detective" })],
  },
  "Neighborhood Guardian": {
    abilities: [
      triggered(when.enters(ANOTHER_SMALL), [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature of yours gets +1/+1",
      }),
    ],
  },
  "Not on My Watch": {
    spell: spell([target.creature("t", { attacking: true })], [fx.exile(ref.target())]),
  },
  "Novice Inspector": {
    abilities: [triggered(when.entersSelf, [investigate()], { label: "Investigate" })],
  },
  "On the Job": {
    spell: spell([], [fx.pumpAll(YOUR_CREATURES, 2, 1), investigate()]),
  },
  "Perimeter Enforcer": {
    abilities: [
      triggered(when.enters({ ...YOUR_DETECTIVES, other: true }), [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
      triggered(when.permanentTurnedFaceUp(YOUR_DETECTIVES), [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
    ],
  },
  "Sanctuary Wall": {
    abilities: [
      activated({
        mana: "{2}{W}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.tap(ref.target()),
          ...fx.may(
            "Put a stun counter on it and on this Wall?",
            fx.counters(ref.target(), "stun"),
            fx.counters(ref.self, "stun"),
          ),
        ],
        label: "Tap a creature",
      }),
    ],
  },
  "Seasoned Consultant": {
    abilities: [triggered(when.attackWith(3), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" })],
  },
  "Unyielding Gatekeeper": {
    abilities: [
      triggered(
        when.turnedFaceUp,
        [
          fx.exileCard(ref.target(), { name: "gate" }),
          // The condition reads the last known information of the exiled target.
          ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.toBattlefield(ref.stored("gate"), { tapped: true })),
          ...fx.when(
            cond.not(cond.targetMatches("t", { controller: "you" })),
            fx.createTokens(DETECTIVE, 1, ref.controllerOf(ref.target())),
          ),
        ],
        {
          targets: [target.nonland("t", { other: true })],
          label: "Exile another nonland permanent",
        },
      ),
    ],
  },
  Wrench: {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addKeywords: ["vigilance"],
          addAbilities: [
            activated({
              mana: "{3}",
              tap: true,
              targets: [target.creature()],
              effects: [fx.tap(ref.target())],
              label: "Tap a creature",
            }),
          ],
        },
        { label: '+1/+1, vigilance and "{3}, {T}: Tap target creature"' },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Tenth District Hero": {
    abilities: [
      activated({
        mana: "{1}{W}",
        collectEvidence: 2,
        effects: [fx.modify(ref.self, { setSubtypes: ["Human", "Detective"], addKeywords: ["vigilance"] }, "permanent", 4)],
        label: "Collect evidence 2: 4/4 Human Detective with vigilance",
      }),
      activated({
        mana: "{2}{W}",
        collectEvidence: 4,
        effects: fx.when(
          cond.sourceMatches({ subtype: "Detective" }),
          fx.modify(
            ref.self,
            {
              setName: "Mileva, the Stalwart",
              addSupertypes: ["Legendary"],
              addAbilities: [
                staticAbility(
                  { types: ["Creature"], controller: "you", other: true },
                  { addKeywords: ["indestructible"] },
                  { label: "Your other creatures have indestructible" },
                ),
              ],
            },
            "permanent",
            5,
          ),
        ),
        label: "Collect evidence 4: becomes Mileva, the Stalwart (5/5, your other creatures indestructible)",
      }),
    ],
  },
  "Aurelia's Vindicator": {
    abilities: [
      // "up to X targets": X is the one of the disguise cost paid (`amount.sourceX`), evaluated when targeting.
      triggered(when.turnedFaceUp, [fx.exileUntilLeaves(ref.target(), true)], {
        targets: [
          {
            id: "t",
            label: "another creature or creature card in a graveyard",
            filter: {
              objects: { types: ["Creature"], other: true },
              cards: { filter: { types: ["Creature"] }, whose: "any" },
            },
            count: 1,
            optional: true,
            countAmount: amount.sourceX,
          },
        ],
        label: "Exile up to X other creatures or creature cards (returned to hand when it leaves)",
      }),
    ],
  },
  "Karlov Watchdog": {
    abilities: [
      staticAbility(
        { controller: "opponent", faceDown: true },
        { addKeywords: ["cantBeTurnedFaceUp"] },
        { condition: cond.yourTurn, label: "During your turn, your opponents' permanents can't be turned face up" },
      ),
      triggered(when.attackWith(3), [fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 1)], {
        label: "You attack with three or more creatures: your creatures +1/+1",
      }),
    ],
  },
  "Case File Auditor": {
    abilities: [
      ...[when.entersSelf, when.caseSolved].map((w) =>
        triggered(w, [fx.lookAtTop(6, { filter: { types: ["Enchantment"] }, count: 1, rest: "bottom" })], {
          label: "Look at six cards: an enchantment into your hand",
        }),
      ),
      playerStatic({
        spellCost: { filter: { subtype: "Case" }, anyMana: true },
        label: "Mana of any color for Case spells",
      }),
    ],
  },
  "Case of the Gateway Express": {
    abilities: [
      triggered(when.entersSelf, [fx.eachDealsDamage({ types: ["Creature"], controller: "you" }, ref.target(), 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Each creature of yours deals 1 damage to the target creature",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.turnEvents({ event: "attack", distinct: "object" }), 3),
    caseSolved: [staticAbility({ types: ["Creature"], controller: "you" }, { power: 1 }, { label: "Your creatures +1/+0" })],
  },
  "No Witnesses": {
    spell: spell([], [investigateFor(ref.playersWithMost({ types: ["Creature"] })), fx.destroyAll({ types: ["Creature"] })]),
  },
  "Wojek Investigator": {
    abilities: [
      triggered(when.yourUpkeep, [investigate(amount.opponentsWithMoreInHand)], {
        label: "Investigate once for each opponent who has more cards in hand than you",
      }),
    ],
  },
};
