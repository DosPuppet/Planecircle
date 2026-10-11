/**
 * Marvel's Spider-Man — multicolored cards (lot A). Flying, first strike, double strike, trample, lifelink, haste,
 * vigilance, menace, deathtouch, ward, Web-slinging and Mayhem are read from the text; "can't be blocked" is written
 * here (restriction).
 */
import type { AbilityDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  HUMAN_CITIZEN,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const MODIFIED_YOURS: ObjectFilter = { ...YOUR_CREATURES, modified: true };
const OTHER_VILLAINS: ObjectFilter = { subtype: "Villain", controller: "you", other: true };

/** Symbiote Spider-Man: "Whenever this creature deals combat damage to a player, …" (granted by Find New Host). */
const SYMBIOTE_DAMAGE: AbilityDef = triggered(
  when.combatDamageToPlayer,
  [fx.lookAtTop(amount.eventAmount, { count: 1, exact: true, rest: "graveyard" })],
  { label: "Look at that many cards from the top: one to your hand, the rest into your graveyard" },
);

export const MULTI: Record<string, CardScript> = {
  "Araña, Heart of the Spider": {
    abilities: [
      triggered(when.attackWith(), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { attacking: true })],
        label: "A +1/+1 counter on an attacking creature",
      }),
      triggered(when.combatDamage(MODIFIED_YOURS, true), [fx.exileTop(ref.you, 1, "a"), fx.grantPlay(ref.stored("a"))], {
        label: "Exile the top card: you may play it this turn",
      }),
    ],
  },
  "Biorganic Carapace": {
    // Equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attaches to a creature you control",
      }),
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addAbilities: [
            triggered(when.combatDamageToPlayer, [fx.draw(amount.count(MODIFIED_YOURS))], {
              label: "Draw a card for each modified creature you control",
            }),
          ],
        },
        { label: "+2/+2 and draws whenever it deals combat damage to a player" },
      ),
    ],
  },
  "Cosmic Spider-Man": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.pumpAll({ subtype: "Spider", controller: "you", other: true }, 0, 0, [
            "flying",
            "firstStrike",
            "trample",
            "lifelink",
            "haste",
          ]),
        ],
        { label: "Your other Spiders gain flying, first strike, trample, lifelink and haste" },
      ),
    ],
  },
  "Doctor Octopus, Master Planner": {
    abilities: [
      staticAbility(OTHER_VILLAINS, { power: 2, toughness: 2 }, { label: "Your other Villains get +2/+2" }),
      playerStatic({ maxHandSize: 8, label: "Maximum hand size: eight" }),
      triggered(when.yourEndStep, [fx.draw(amount.plus(8, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.handAtMost(ref.you, 7),
        label: "Draw until you have eight cards in hand",
      }),
    ],
  },
  "Gallant Citizen": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Green Goblin, Revenant": {
    abilities: [
      triggered(when.attacksSelf, [fx.discard(1), fx.draw(amount.cardsDiscardedThisTurn)], {
        label: "Discard a card, then draw a card for each card discarded this turn",
      }),
    ],
  },
  "Kraven, Proud Predator": {
    // Top of the Food Chain: power is the greatest mana value among your permanents (toughness 4).
    cda: { power: amount.maxManaValue({ controller: "you" }) },
  },
  "Mary Jane Watson": {
    abilities: [
      triggered(when.enters({ subtype: "Spider", controller: "you" }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "A Spider enters under your control: draw a card (once each turn)",
      }),
    ],
  },
  "Mob Lookout": {
    abilities: [
      triggered(when.entersSelf, [fx.connive(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature you control connives",
      }),
    ],
  },
  "Morbius the Living Vampire": {
    abilities: [
      activated({
        mana: "{U}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.lookAtTop(3, { count: 1, exact: true })],
        label: "Look at the top three cards: one to your hand, the rest on the bottom",
      }),
    ],
  },
  "Prowler, Clawed Thief": {
    abilities: [
      triggered(when.enters(OTHER_VILLAINS), [fx.connive(ref.self)], {
        label: "Another Villain enters: Prowler connives",
      }),
    ],
  },
  "Pumpkin Bombardment": {
    // "Discard a card or pay {2}" (additional cost).
    additionalCost: { discard: 1, discardOr: { mana: { generic: 2, colored: {}, x: 0 } } },
    spell: spell([target.creature()], [fx.damage(3, ref.target())]),
  },
  "Rhino's Rampage": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.pump(ref.target("a"), 1, 0),
        fx.fight(ref.target("a"), ref.target("b"), "e"),
        ...fx.when(
          cond.v("e"),
          fx.reflexive(
            [
              target.upTo(
                1,
                target.permanent(
                  "c",
                  ["Artifact"],
                  { notTypes: ["Creature"], maxManaValue: 3 },
                  "noncreature artifact with mana value 3 or less",
                ),
              ),
            ],
            [fx.destroy(ref.target("c"))],
          ),
        ),
      ],
    ),
  },
  "Scarlet Spider, Kaine": {
    // Menace and Mayhem {B/R}: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.addCounters(ref.self, 1))],
        { label: "You may discard a card: a +1/+1 counter" },
      ),
    ],
  },
  "Shriek, Treblemaker": {
    abilities: [
      triggered(
        when.step("main1"),
        [
          fx.discard(1, ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([target.creature("c")], [fx.modify(ref.target("c"), { addKeywords: ["cantBlock"] })]),
          ),
        ],
        { label: "You may discard a card: a creature can't block this turn" },
      ),
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "Sonic Blast — 1 damage to the player whose creature dies",
      }),
    ],
  },
  "Silk, Web Weaver": {
    // Web-slinging {1}{G}{W}: read from the text.
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.createTokens(HUMAN_CITIZEN)], {
        label: "A 1/1 Human Citizen",
      }),
      activated({
        mana: "{3}{G}{W}",
        effects: [fx.pumpAll(YOUR_CREATURES, 2, 2, ["vigilance"])],
        label: "Creatures you control get +2/+2 and gain vigilance",
      }),
    ],
  },
  "Skyward Spider": {
    // Ward {2}: read from the text.
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.sourceMatches({ modified: true }), label: "Has flying as long as it's modified" },
      ),
    ],
  },
  "SP//dr, Piloted by Peni": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "A +1/+1 counter on a creature",
      }),
      triggered(when.combatDamage(MODIFIED_YOURS, true), [fx.draw(1)], {
        label: "A modified creature you control deals damage to a player: draw a card",
      }),
    ],
  },
  "Spider-Girl, Legacy Hero": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Has flying during your turn" }),
      triggered(when.leavesSelf, [fx.createTokens(HUMAN_CITIZEN)], { label: "A 1/1 Human Citizen" }),
    ],
  },
  "Spider-Man 2099": {
    // From the Future: "You can't cast Spider-Man 2099 during your first, second, or third turns of the game".
    rules: { castCondition: cond.turnsTakenAtLeast(4) },
    abilities: [
      triggered(when.yourEndStep, [fx.damage(amount.powerOf(ref.self), ref.target())], {
        // A spell cast or a land played from anywhere other than your hand.
        condition: cond.any(
          ...(["cast", "playLand"] as const).flatMap((event) =>
            (["graveyard", "exile", "library", "command"] as const).map((z) =>
              cond.amountAtLeast(amount.turnEvents({ event, who: "you", fromZone: z }), 1),
            ),
          ),
        ),
        targets: [target.any()],
        label: "Damage equal to its power to any target",
      }),
    ],
  },
  "Spider-Man India": {
    // Web-slinging {1}{G}{W}: read from the text.
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Pavitr's Sevā — A +1/+1 counter and flying until end of turn",
        },
      ),
    ],
  },
  "Spider-Woman, Stunning Savior": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Artifact", "Creature"], controller: "opponent" },
        label: "Venom Blast — Artifacts and creatures your opponents control enter tapped",
      }),
    ],
  },
  "The Spot, Living Portal": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileCard(ref.target("p"), { name: "ep" }),
          fx.exileCard(ref.target("g"), { name: "eg" }),
          // The exiled cards are linked to The Spot (returned to hand when it dies).
          fx.link(ref.union(ref.stored("ep"), ref.stored("eg"))),
        ],
        {
          targets: [
            target.upTo(1, target.nonland("p")),
            target.upTo(
              1,
              target.cardInGraveyard(
                "g",
                { permanent: true, notTypes: ["Land"] },
                "any",
                "nonland permanent card in a graveyard",
              ),
            ),
          ],
          label: "Exiles a nonland permanent and a nonland permanent card from a graveyard",
        },
      ),
      triggered(
        when.diesSelf,
        [fx.moveTo(ref.selfCard, { to: "libraryBottom" }, { name: "b" }), ...fx.when(cond.v("b"), fx.toHand(ref.linked))],
        { label: "On the bottom of the library; the exiled cards return to their owners' hands" },
      ),
    ],
  },
  "Sun-Spider, Nimble Webber": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Has flying during your turn" }),
      triggered(when.entersSelf, [fx.search({ anySubtype: ["Aura", "Equipment"] })], {
        label: "Search for an Aura or Equipment card",
      }),
    ],
  },
  "Symbiote Spider-Man": {
    abilities: [
      SYMBIOTE_DAMAGE,
      activated({
        mana: "{2}{U/B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addAbilities: [SYMBIOTE_DAMAGE] }, "permanent")],
        label: "Find New Host — A +1/+1 counter; it gains the combat damage ability",
      }),
    ],
  },
  "Ultimate Green Goblin": {
    // Mayhem {2}{B/R}: read from the text.
    abilities: [
      triggered(when.yourUpkeep, [fx.discard(1), fx.createTokens(TREASURE)], {
        label: "Discard a card, then create a Treasure",
      }),
    ],
  },
  "Vulture, Scheming Scavenger": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll(OTHER_VILLAINS, 0, 0, ["flying"])], {
        label: "Your other Villains gain flying until end of turn",
      }),
    ],
  },
  "Web-Warriors": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll({ ...YOUR_CREATURES, other: true }, 1)], {
        label: "A +1/+1 counter on each of your other creatures",
      }),
    ],
  },
  // Fear Gas: "can't be blocked" (double strike is read from the text).
  "Wraith, Vicious Vigilante": { keywords: ["unblockable"] },
};
