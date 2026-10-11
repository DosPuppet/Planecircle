/** Wilds of Eldraine — black cards. */

import type { ObjectFilter, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CURSED_ROLE,
  chapter,
  cond,
  createRole,
  entersWith,
  FOOD,
  fx,
  HUMAN_W,
  mode,
  RAT_NO_BLOCK,
  ref,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  WICKED_ROLE,
  when,
} from "./common";

/** "an artifact, enchantment, or token" (Bargain, Devouring Sugarmaw, Lich-Knights' Conquest…). */
const ARTIFACT_ENCHANTMENT_TOKEN: ObjectFilter = { anyOf: [{ types: ["Artifact", "Enchantment"] }, { token: true }] };

/** "Whenever an enchantment you control is put into a graveyard from the battlefield" */
const YOUR_ENCHANTMENT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Enchantment"], controller: "you" },
  to: "graveyard",
};

/** "Sacrifice any number of artifacts, enchantments, and/or tokens": their number is stored under `n`. */
const sacrificeAnyNumber = (store: string) =>
  fx.sacrifice(ref.you, ARTIFACT_ENCHANTMENT_TOKEN, amount.count({ ...ARTIFACT_ENCHANTMENT_TOKEN, controller: "you" }), {
    optional: true,
    store,
  });

const YOUR_CREATURE = (id = "c") => target.creature(id, { controller: "you" });

export const BLACK: Record<string, CardScript> = {
  "Tangled Colony": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(RAT_NO_BLOCK, amount.lkiDamage)], {
        label: "A 1/1 Rat for each damage dealt to it this turn",
      }),
    ],
  },
  "Twisted Sewer-Witch": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(RAT_NO_BLOCK), ...createRole(WICKED_ROLE, ref.permanentsOf(ref.you, { subtype: "Rat" }))],
        { label: "A 1/1 Rat, then a Wicked Role attached to each Rat you control" },
      ),
    ],
  },
  "Lord Skitter's Blessing": {
    abilities: [
      triggered(when.entersSelf, createRole(WICKED_ROLE), {
        targets: [target.creature("t", { controller: "you" })],
        label: "A Wicked Role attached to a creature you control",
      }),
      triggered(when.step("draw", "you"), [fx.loseLife(1), fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], enchanted: true }),
        label: "You control an enchanted creature: lose 1 life, draw an additional card",
      }),
    ],
  },
  "Ashiok's Reaper": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.draw(1)], { label: "One of your enchantments to the graveyard: draw" }),
    ],
  },
  "Back for Seconds": {
    // Bargained: one of the targeted cards with MV 4 or less can enter the battlefield instead of going to hand.
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard"))],
      [
        ...fx.when(
          cond.kicked,
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield" },
            {
              count: 1,
              min: 0,
              pool: ref.target(),
              maxManaValue: 4,
              prompt: "You may put one of them (MV 4 or less) onto the battlefield",
            },
          ),
        ),
        fx.toHand(ref.target()),
      ],
    ),
  },
  "Barrow Naughty": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink"] },
        {
          condition: cond.controls({ subtype: "Faerie", other: true }),
          label: "Lifelink as long as you control another Faerie",
        },
      ),
      activated({ mana: "{2}{B}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0 until end of turn" }),
    ],
  },
  "Beseech the Mirror": {
    // The card is exiled face down (only you see it).
    spell: spell(
      [],
      [
        fx.search({}, { to: "exile", faceDown: "you" }, 1, undefined, "s"),
        ...fx.when(cond.kicked, fx.castNow(ref.stored("s"), { free: true, maxManaValue: 4 })),
        ...fx.when(cond.amountAtLeast(amount.inExile(ref.stored("s")), 1), fx.toHand(ref.stored("s"))),
      ],
    ),
  },
  "Candy Grapple": {
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.kicked(-5, -3), amount.kicked(-5, -3))]),
  },
  "Conceited Witch": {},
  "Price of Beauty": { spell: spell([YOUR_CREATURE("t")], createRole(WICKED_ROLE)) },
  "Dream Spoilers": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.pump(ref.target(), -1, -1)], {
        targets: [target.optional(target.creature("t", { controller: "opponent" }))],
        label: "Spell cast during an opponent's turn: -1/-1 to a creature an opponent controls",
      }),
    ],
  },
  "Ego Drain": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" }),
        ...fx.when(cond.not(cond.controls({ subtype: "Faerie" })), fx.exileFromOwnHand(ref.you, "e")),
      ],
    ),
  },
  "Eriette's Whisper": {
    spell: spell(
      [target.player("p", "opponent"), target.optional(YOUR_CREATURE())],
      [fx.discard(2, ref.target("p")), ...createRole(WICKED_ROLE, ref.target("c"))],
    ),
  },
  "Faerie Dreamthief": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.draw(1), fx.loseLife(1)],
        label: "From the graveyard: draw a card, lose 1 life",
      }),
    ],
  },
  "Faerie Fencing": {
    // "if you controlled a Faerie as you cast this spell": checked on casting.
    rules: { whenCast: cond.controls({ subtype: "Faerie" }) },
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), amount.neg(amount.x), amount.neg(amount.x)),
        ...fx.when(cond.metWhenCast, fx.pump(ref.target(), -3, -3)),
      ],
    ),
  },
  "Feed the Cauldron": {
    spell: spell(
      [target.creature("t", { maxManaValue: 3 })],
      [fx.destroy(ref.target()), ...fx.when(cond.yourTurn, fx.createTokens(FOOD))],
    ),
  },
  "Fell Horseman": {
    abilities: [
      triggered(when.diesSelf, [fx.moveTo(ref.selfCard, { to: "libraryBottom" })], {
        label: "Goes to the bottom of its owner's library",
      }),
    ],
  },
  "Deathly Ride": {
    spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toHand(ref.target())]),
  },
  "Gumdrop Poisoner": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pump(ref.target(), amount.neg(amount.lifeGainedThisTurn), amount.neg(amount.lifeGainedThisTurn))],
        {
          targets: [target.optional(target.creature())],
          label: "-X/-X, where X is the life gained this turn",
        },
      ),
    ],
  },
  "Tempt with Treats": { spell: spell([], [fx.createTokens(FOOD)]) },
  "High Fae Negotiator": {
    abilities: [
      triggered(when.entersSelf, fx.drain(3), {
        condition: cond.kicked,
        label: "Bargained: each opponent loses 3 life, you gain 3 life",
      }),
    ],
  },
  "Hopeless Nightmare": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent)], {
        label: "Each opponent discards a card and loses 2 life",
      }),
      triggered(when.putIntoGraveyardSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({ mana: "{2}{B}", effects: [fx.sacrificeIt(ref.self)], label: "Sacrifice this enchantment" }),
    ],
  },
  "Lich-Knights' Conquest": {
    spell: spell(
      [],
      [
        sacrificeAnyNumber("n"),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { count: amount.v("n"), prompt: "As many creature cards from your graveyard as permanents sacrificed" },
        ),
      ],
    ),
  },
  "Lord Skitter, Sewer King": {
    abilities: [
      triggered(when.enters({ subtype: "Rat", controller: "you", other: true }), [fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "opponent", "card in an opponent's graveyard"))],
        label: "Another Rat enters: exile a card from an opponent's graveyard",
      }),
      triggered(when.yourCombat, [fx.createTokens(RAT_NO_BLOCK)], { label: "A 1/1 Rat that can't block" }),
    ],
  },
  "Lord Skitter's Butcher": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("A 1/1 Rat that can't block", [], [fx.createTokens(RAT_NO_BLOCK)]),
          mode(
            "Sacrifice another creature: scry 2, draw",
            [],
            [
              fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
              ...fx.when(cond.v("s"), fx.scry(2), fx.draw(1)),
            ],
          ),
          mode(
            "Your creatures gain menace",
            [],
            [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["menace"] })],
          ),
        ],
        { label: "Choose a mode" },
      ),
    ],
  },
  Mintstrosity: {
    abilities: [triggered(when.diesSelf, [fx.createTokens(FOOD)], { label: "A Food" })],
  },
  "Not Dead After All": {
    spell: spell(
      [YOUR_CREATURE("t")],
      [
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(
              when.diesSelf,
              [
                fx.moveTo(ref.selfCard, { to: "battlefield", tapped: true }, { name: "back" }),
                ...createRole(WICKED_ROLE, ref.stored("back")),
              ],
              { label: "Returns tapped with a Wicked Role" },
            ),
          ],
        }),
      ],
    ),
  },
  "Rankle's Prank": {
    // "Choose one or more": every combination, in printed order.
    spell: spree(
      { cost: "{0}", label: "Each player discards two cards", effects: [fx.discard(2, ref.eachPlayer)] },
      { cost: "{0}", label: "Each player loses 4 life", effects: [fx.loseLife(4, ref.eachPlayer)] },
      {
        cost: "{0}",
        label: "Each player sacrifices two creatures",
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 2)],
      },
    ),
  },
  "Rat Out": {
    spell: spell([target.optional(target.creature())], [fx.pump(ref.target(), -1, -1), fx.createTokens(RAT_NO_BLOCK)]),
  },
  "Rowan's Grim Search": {
    spell: spell(
      [],
      [
        ...fx.when(cond.kicked, fx.lookAtTop(4, { count: 2, to: { to: "libraryTop" }, rest: "graveyard" })),
        fx.draw(2),
        fx.loseLife(2),
      ],
    ),
  },
  "Scream Puff": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(FOOD)], { label: "A Food" })],
  },
  "Shatter the Oath": {
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "creature or enchantment"), target.optional(YOUR_CREATURE())],
      [fx.destroy(ref.target()), ...createRole(WICKED_ROLE, ref.target("c"))],
    ),
  },
  "Specter of Mortality": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "exile" },
            {
              count: amount.countIn("graveyard", { types: ["Creature"] }),
              min: 0,
              store: "ex",
              prompt: "You may exile creature cards from your graveyard",
            },
          ),
          // "When you do": reflexive ability, X being the number of exiled cards.
          ...fx.when(
            cond.v("ex"),
            fx.reflexive(
              [],
              [
                fx.pumpAll(
                  { types: ["Creature"], other: true },
                  amount.neg(amount.refCount(ref.target("ex"))),
                  amount.neg(amount.refCount(ref.target("ex"))),
                ),
              ],
              { ex: ref.stored("ex") },
            ),
          ),
        ],
        { label: "Exile creature cards: the other creatures get -X/-X" },
      ),
    ],
  },
  "Spiteful Hexmage": {
    abilities: [
      triggered(when.entersSelf, createRole(CURSED_ROLE), {
        targets: [YOUR_CREATURE("t")],
        label: "A Cursed Role on a creature you control",
      }),
    ],
  },
  "Stingblade Assassin": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          target.permanent(
            "t",
            ["Creature"],
            { controller: "opponent", damaged: true },
            "creature an opponent controls that was dealt damage this turn",
          ),
        ],
        label: "Destroy a creature an opponent controls that was dealt damage this turn",
      }),
    ],
  },
  "Sugar Rush": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0), fx.draw(1)]) },
  "Sweettooth Witch": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { subtype: "Food" } },
        targets: [target.player()],
        effects: [fx.loseLife(2, ref.target())],
        label: "Target player loses 2 life",
      }),
    ],
  },
  "Taken by Nightmares": {
    spell: spell(
      [target.creature()],
      [fx.exile(ref.target()), ...fx.when(cond.controls({ types: ["Enchantment"] }), fx.scry(2))],
    ),
  },
  "Virtue of Persistence": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { underYourControl: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in a graveyard")],
        label: "A creature card from a graveyard enters under your control",
      }),
    ],
  },
  "Locthwain Scorn": { spell: spell([target.creature()], [fx.pump(ref.target(), -3, -3), fx.gainLife(2)]) },
  "Voracious Vermin": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(RAT_NO_BLOCK)], { label: "A 1/1 Rat that can't block" }),
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another creature you control dies: a +1/+1 counter",
      }),
    ],
  },
  "Warehouse Tabby": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.createTokens(RAT_NO_BLOCK)], {
        label: "One of your enchantments to the graveyard: a Rat",
      }),
      activated({
        mana: "{1}{B}",
        effects: [fx.pump(ref.self, 0, 0, ["deathtouch"])],
        label: "Deathtouch until end of turn",
      }),
    ],
  },
  "Wicked Visitor": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.loseLife(1, ref.eachOpponent)], {
        label: "One of your enchantments to the graveyard: each opponent loses 1 life",
      }),
    ],
  },
  "The Witch's Vanity": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxManaValue: 2 })],
        label: "Destroy a creature an opponent controls with MV 2 or less",
      }),
      chapter([2], [fx.createTokens(FOOD)], { label: "A Food" }),
      chapter([3], createRole(WICKED_ROLE), {
        targets: [YOUR_CREATURE("t")],
        label: "A Wicked Role on a creature you control",
      }),
    ],
  },
  "Callous Sell-Sword": {
    abilities: [
      entersWith({
        counters: amount.yourCreaturesDiedThisTurn,
        label: "A +1/+1 counter for each creature that died under your control this turn",
      }),
    ],
  },
  "Burn Together": {
    spell: spell(
      [YOUR_CREATURE("c"), { ...target.any("t"), otherThan: ["c"] }],
      [fx.damage(amount.powerOf(ref.target("c")), ref.target("t"), ref.target("c")), fx.sacrificeIt(ref.target("c"))],
    ),
  },
  "Cruel Somnophage": { cda: { pt: amount.countIn("graveyard", { types: ["Creature"] }, "all") } },
  "Can't Wake Up": { spell: spell([target.player()], [fx.mill(4, ref.target())]) },
  "Devouring Sugarmaw": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.sacrifice(ref.you, ARTIFACT_ENCHANTMENT_TOKEN, 1, { optional: true, store: "s" }),
          ...fx.when(cond.not(cond.v("s")), fx.tap(ref.self)),
        ],
        { label: "Sacrifice an artifact, an enchantment or a token; otherwise, tap it" },
      ),
    ],
  },
  "Have for Dinner": { spell: spell([], [fx.createTokens(HUMAN_W), fx.createTokens(FOOD)]) },
  "Spellscorn Coven": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Each opponent discards a card" })],
  },
  "Take It Back": { spell: spell([target.spell()], [fx.bounce(ref.target())]) },
  "Experimental Confectioner": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      triggered(when.sacrifice({ subtype: "Food" }), [fx.createTokens(RAT_NO_BLOCK)], {
        label: "You sacrifice a Food: a Rat",
      }),
    ],
  },
  "Malevolent Witchkite": {
    abilities: [
      triggered(when.entersSelf, [sacrificeAnyNumber("n"), fx.draw(amount.v("n"))], {
        label: "Sacrifice artifacts, enchantments and/or tokens, then draw that many",
      }),
    ],
  },
  "Old Flitterfang": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(FOOD)], {
        condition: cond.morbid,
        label: "A creature died this turn: a Food",
      }),
      activated({
        mana: "{2}{B}",
        sacrificeOther: { filter: { types: ["Creature", "Artifact"], other: true } },
        effects: [fx.pump(ref.self, 2, 2)],
        label: "+2/+2 until end of turn",
      }),
    ],
  },
};
