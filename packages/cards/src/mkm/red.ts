/**
 * Murders at Karlov Manor — red cards (lot A). Disguise, ward, prowess and the other keywords are read from the text;
 * "investigate" creates a Clue (`investigate`), "suspect" goes through `fx.suspect`.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  DETECTIVE,
  fx,
  GOBLIN,
  INSTANT_SORCERY,
  investigate,
  mode,
  ref,
  spell,
  spree,
  staticAbility,
  THOPTER,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ARTIFACT = { types: ["Artifact" as const] };

/** "{2}, Sacrifice [this Clue]: Draw a card." */
const clueAbility = activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" });

const NONBASIC_LAND = { types: ["Land" as const], basic: false };

export const RED: Record<string, CardScript> = {
  "Anzrag's Rampage": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Artifact"], controller: "opponent" }),
        // X: the artifacts put into a graveyard from the battlefield this turn (including the ones just destroyed).
        fx.exileTop(
          ref.you,
          amount.turnEvents({ event: "zone", from: "battlefield", to: "graveyard", types: ["Artifact"] }),
          "x",
        ),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          {
            pool: ref.stored("x"),
            count: 1,
            min: 0,
            store: "c",
            prompt: "An exiled creature card to put onto the battlefield",
          },
        ),
        fx.modify(ref.stored("c"), { addKeywords: ["haste"] }, "permanent"),
        fx.delayed([fx.toHand(ref.target("c"))], { c: ref.stored("c") }),
      ],
    ),
  },
  "Bolrac-Clan Basher": {},
  "Case of the Crimson Pulse": {
    abilities: [triggered(when.entersSelf, [fx.discard(1), fx.draw(2)], { label: "Discard a card, then draw two cards" })],
    // "You have no cards in hand" (`handAtMost` is only read when an effect resolves).
    caseToSolve: cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 1)),
    caseSolved: [
      triggered(when.yourUpkeep, [fx.discard(amount.cardsIn("hand")), fx.draw(2)], {
        label: "Discard your hand, then draw two cards",
      }),
    ],
  },
  "Caught Red-Handed": {
    cantBeCountered: true,
    spell: spell(
      [target.creature()],
      [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"]), fx.suspect(ref.target())],
    ),
  },
  "The Chase Is On": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"]), investigate()]),
  },
  "Concealed Weapon": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(when.turnedFaceUp, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach this Equipment to a creature you control",
      }),
    ],
  },
  "Connecting the Dots": {
    abilities: [
      // The card is exiled face down (nobody sees it).
      triggered(
        when.attacks({ types: ["Creature"], controller: "you" }),
        [fx.exileTop(ref.you, 1, "x", "nobody"), fx.link(ref.stored("x"))],
        { label: "Exile the top card of your library" },
      ),
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        discardHand: true,
        effects: [fx.toHand(ref.linked)],
        label: "Discard your hand: the cards exiled with this enchantment go to their owner's hand",
      }),
    ],
  },
  "Convenient Target": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.attached)], { label: "Suspect the enchanted creature" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      activated({
        mana: "{2}{R}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.self)],
        label: "Return this card from your graveyard to your hand",
      }),
    ],
  },
  "Cornered Crook": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(3, ref.target())])),
        ],
        { label: "You may sacrifice an artifact: 3 damage to any target" },
      ),
    ],
  },
  "Crime Novelist": {
    abilities: [
      triggered(when.sacrifice(ARTIFACT), [fx.addCounters(ref.self, 1), fx.addMana("R")], {
        label: "+1/+1 counter and {R}",
      }),
    ],
  },
  "Expedited Inheritance": {
    abilities: [
      triggered(
        when.dealtDamage({ types: ["Creature"] }),
        fx.mayFor(
          ref.controllerOf(ref.eventObject),
          "Exile that many cards from the top of your library (playable until the end of your next turn)?",
          fx.exileTop(ref.controllerOf(ref.eventObject), amount.eventAmount, "x"),
          fx.grantPlay(ref.stored("x"), { for: "owner", untilOwnersNextTurn: true }),
        ),
        { label: "Its controller may exile that many cards from the top of their library" },
      ),
    ],
  },
  "Felonious Rage": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.pump(ref.target(), 2, 0, ["haste"]),
        fx.whenThisTurn(when.dies({}), ref.target(), [fx.createTokens(DETECTIVE)], { label: "2/2 Detective" }),
      ],
    ),
  },
  "Frantic Scapegoat": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self)], { label: "Suspect it" }),
      // "One or more": one trigger per creature; the condition, checked again on resolution (603.4), lets only one of
      // them become suspected.
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        fx.may("Suspect this creature instead?", fx.suspect(ref.eventObject), fx.suspect(ref.self, false)),
        { condition: cond.sourceMatches({ suspected: true }), label: "Transfer the suspicion" },
      ),
    ],
  },
  Galvanize: {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(cond.drewAtLeast(2), fx.damage(5, ref.target())),
        ...fx.when(cond.not(cond.drewAtLeast(2)), fx.damage(3, ref.target())),
      ],
    ),
  },
  "Gearbane Orangutan": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Destroy up to one target artifact",
            [target.upTo(1, target.permanent("t", ["Artifact"], {}, "artifact"))],
            [fx.destroy(ref.target())],
          ),
          mode(
            "Sacrifice an artifact: two +1/+1 counters",
            [],
            [fx.sacrifice(ref.you, ARTIFACT, 1, { store: "s" }), ...fx.when(cond.v("s"), fx.addCounters(ref.self, 2))],
          ),
        ],
        { label: "Choose a mode" },
      ),
    ],
  },
  "Harried Dronesmith": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(THOPTER, 1, undefined, "t"),
          fx.pump(ref.stored("t"), 0, 0, ["haste"]),
          fx.delayedAt("yourEndStep", [fx.sacrificeIt(ref.target("t"))], { t: ref.stored("t") }),
        ],
        { label: "1/1 flying Thopter with haste, sacrificed at your end step" },
      ),
    ],
  },
  "Innocent Bystander": {
    abilities: [
      triggered(when.isDealtDamage, [investigate()], {
        // "Dealt 3 or more damage all at once" (ruling): the damage of several sources at the same time is added up.
        condition: cond.amountAtLeast(amount.eventAmount, 3),
        batched: "sum",
        label: "3 or more damage: investigate",
      }),
    ],
  },
  Knife: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "During your turn: +1/+0 and first strike" },
      ),
      clueAbility,
    ],
  },
  "Krenko, Baron of Tin Street": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: ARTIFACT },
        effects: [fx.addCountersAll({ subtype: "Goblin", controller: "you" }, 1)],
        label: "A +1/+1 counter on each Goblin you control",
      }),
      triggered(
        when.zoneChange(["battlefield"], { to: ["graveyard"], filter: ARTIFACT }),
        fx.mayPay(
          "{R}",
          "Pay {R} to create a 1/1 Goblin with haste?",
          fx.createTokens(GOBLIN, 1, undefined, "g"),
          fx.pump(ref.stored("g"), 0, 0, ["haste"]),
        ),
        { label: "Pay {R}: 1/1 Goblin with haste" },
      ),
    ],
  },
  "Krenko's Buzzcrusher": {
    abilities: [
      // "For each player, destroy up to one nonbasic land that player controls": one choice per player (no target),
      // then a single destruction; the controller of each destroyed land may search for a basic land. For your own
      // lands, a yes/no question first: the suggested answer ("No") doesn't destroy yours.
      triggered(
        when.entersSelf,
        [
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.permanentsOf(ref.you, NONBASIC_LAND)), 1),
            fx.yourChoice("Also destroy one of your nonbasic lands?", "bzMine", [
              { label: "No", effects: [] },
              {
                label: "Yes",
                effects: [
                  fx.chooseAmong(ref.permanentsOf(ref.you, NONBASIC_LAND), ref.you, "bzYou", {
                    prompt: "Choose one of your nonbasic lands to destroy",
                  }),
                ],
              },
            ]),
          ),
          ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [
            fx.chooseAmong(ref.permanentsOf(p, NONBASIC_LAND), ref.you, `bz${n}`, {
              optional: true,
              prompt: "Choose up to one nonbasic land of this player to destroy",
            }),
          ]),
          fx.destroy(ref.union(ref.stored("bzYou"), ...Array.from({ length: 6 }, (_, n) => ref.stored(`bz${n}`))), "d"),
          fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.stored("d"))),
        ],
        { label: "Destroy up to one nonbasic land per player; its controller searches for a basic land" },
      ),
    ],
  },
  "Offender at Large": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.upTo(1, target.creature())],
        label: "+2/+0 to up to one creature",
      }),
      triggered(when.turnedFaceUp, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.upTo(1, target.creature())],
        label: "+2/+0 to up to one creature",
      }),
    ],
  },
  "Person of Interest": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.self), fx.createTokens(DETECTIVE)], {
        label: "Suspect it; 2/2 Detective",
      }),
    ],
  },
  "Pyrotechnic Performer": {
    abilities: [
      triggered(
        when.permanentTurnedFaceUp({ types: ["Creature"], controller: "you" }),
        [fx.damage(amount.powerOf(ref.eventObject), ref.eachOpponent, ref.eventObject)],
        { label: "It deals damage equal to its power to each opponent" },
      ),
    ],
  },
  "Reckless Detective": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
          ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
          ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.draw(1), fx.pump(ref.self, 2, 0)),
        ],
        { label: "Sacrifice an artifact or discard a card: draw, +2/+0" },
      ),
    ],
  },
  "Red Herring": {
    keywords: ["mustAttack"],
    abilities: [clueAbility],
  },
  "Rubblebelt Braggart": {
    abilities: [
      triggered(when.attacksSelf, fx.may("Suspect this creature?", fx.suspect(ref.self)), {
        condition: cond.not(cond.sourceMatches({ suspected: true })),
        label: "You may suspect it",
      }),
    ],
  },
  "Suspicious Detonation": {
    cantBeCountered: true,
    costReduction: { generic: 3, condition: cond.sacrificedThisTurn },
    spell: spell([target.creature()], [fx.damage(4, ref.target())]),
  },
  "Torch the Witness": {
    spell: spell(
      [target.creature()],
      [fx.damageStoringExcess(amount.plus(amount.x, amount.x), ref.target(), "e"), ...fx.when(cond.v("e"), investigate())],
    ),
  },
  "Incinerator of the Guilty": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        fx.mayCollectEvidenceX(
          "x",
          fx.damage(amount.v("x"), ref.permanentsOf(ref.eventPlayer, { types: ["Creature", "Planeswalker"] })),
        ),
        { label: "Collect evidence X: X damage to each creature and planeswalker of that player" },
      ),
    ],
  },
  "Lamplight Phoenix": {
    abilities: [
      triggered(
        when.diesSelf,
        fx.mayCollectEvidence(
          4,
          { exclude: ref.selfCard },
          fx.exileCard(ref.selfCard, { name: "p" }),
          fx.toBattlefield(ref.stored("p"), { tapped: true }),
        ),
        { label: "Exile it and collect evidence 4: it returns tapped" },
      ),
    ],
  },
  "Fugitive Codebreaker": {
    disguiseReduction: amount.countIn("graveyard", INSTANT_SORCERY),
    abilities: [
      triggered(when.turnedFaceUp, [fx.discard(amount.cardsIn("hand"), ref.you), fx.draw(3)], {
        label: "Discard your hand, then draw three cards",
      }),
    ],
  },
  "Goblin Maskmaker": {
    abilities: [
      triggered(when.attacksSelf, [fx.thisTurn({ spellCost: { filter: { faceDown: true }, reduce: 1 } })], {
        label: "Your face-down spells cost {1} less this turn",
      }),
    ],
  },
  "Expose the Culprit": {
    // "One or both": two modes with no extra cost.
    spell: spree(
      {
        cost: "{0}",
        label: "Turn a face-down creature face up",
        targets: [{ ...target.creature("a", { faceDown: true }), label: "face-down creature" }],
        effects: [fx.turnFaceUp(ref.target("a"))],
      },
      {
        cost: "{0}",
        label: "Exile your face-up creatures with disguise, then cloak them",
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], faceDown: false, disguise: true }), ref.you, "e", {
            anyNumber: true,
          }),
          fx.exileCard(ref.stored("e"), { name: "x" }),
          fx.cloak(ref.stored("x")),
        ],
      },
    ),
  },
  "Case of the Burning Masks": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "3 damage to an opponent's creature",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.turnEvents({ event: "damage", source: { controller: "you" }, distinct: "source" }), 3),
    caseSolved: [
      activated({
        sacrifice: true,
        effects: [fx.impulse(3)],
        label: "Sacrifice it: exile three cards, play one of them this turn",
      }),
    ],
  },
  "Demand Answers": {
    additionalCost: { discard: 1, discardOr: { sacrifice: { types: ["Artifact"] } } },
    spell: spell([], [fx.draw(2)]),
  },
};
