/** Bloomburrow — black cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  FOOD,
  flashback,
  fx,
  GAINED_OR_LOST,
  kin,
  modal,
  mode,
  pawprint,
  playerStatic,
  ref,
  SNAIL,
  spell,
  staticAbility,
  THRESHOLD,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const creatureCard = (id = "t", label = "creature card from your graveyard") =>
  target.cardInGraveyard(id, { types: ["Creature"] }, "you", label);

export const BLACK: Record<string, CardScript> = {
  "Agate-Blade Assassin": {
    abilities: [
      triggered(when.attacksSelf, [fx.loseLife(1, ref.defendingPlayer), fx.gainLife(1)], {
        label: "Defending player loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Bandit's Talent": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.eachOpponent, { unlessFilter: { notTypes: ["Land"] } })], {
        label: "Each opponent discards two cards (or a nonland one)",
      }),
    ],
    classLevels: [
      [
        triggered(
          when.step("upkeep", "opponent"),
          fx.when(cond.handAtMost(ref.eventPlayer, 1), fx.loseLife(2, ref.eventPlayer)),
          { label: "Hand of 1 card or fewer: loses 2 life" },
        ),
      ],
      [
        triggered(when.step("draw", "you"), [fx.draw(amount.opponentsWithHandAtMost(1))], {
          label: "Extra draw for each opponent out of cards",
        }),
      ],
    ],
  },
  "Bonebind Orator": {
    abilities: [
      activated({
        mana: "{3}{B}",
        exileSelf: true,
        fromGraveyard: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "other creature card")],
        effects: [fx.toHand(ref.target())],
        label: "Gets back another creature",
      }),
    ],
  },
  "Bonecache Overseer": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        activationCondition: cond.any(cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 3), cond.sacrificedFood),
        effects: [fx.draw(1)],
        label: "Draw a card",
      }),
    ],
  },
  "Coiling Rebirth": {
    spell: spell(
      [creatureCard()],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "r" }),
        ...fx.when(
          cond.all(cond.gift, cond.refMatches(ref.stored("r"), { legendary: false })),
          fx.copyToken(ref.stored("r"), { pt: 1 }),
        ),
      ],
    ),
  },
  "Consumed by Greed": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, creatureCard())],
      [
        fx.sacrifice(ref.target("p"), { types: ["Creature"] }, 1, { greatestPower: true }),
        ...fx.when(cond.gift, fx.toHand(ref.target())),
      ],
    ),
  },
  "Cruelclaw's Heist": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] }, exile: true, store: "e" }),
        ...fx.when(cond.gift, fx.grantPlay(ref.stored("e"), { forever: true, anyMana: true })),
      ],
    ),
  },
  "Daggerfang Duo": {
    abilities: [triggered(when.entersSelf, fx.may("Mill two cards?", fx.mill(2)), { label: "Mill 2" })],
  },
  "Darkstar Augur": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "a" }), fx.loseLife(amount.manaValueOf(ref.stored("a")))],
        { label: "Top card into hand, lose life equal to its mana value" },
      ),
    ],
  },
  Diresight: { spell: spell([], [fx.surveil(2), fx.draw(2), fx.loseLife(2)]) },
  "Downwind Ambusher": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "-1/-1 to a creature an opponent controls",
          [target.creature("t", { controller: "opponent" })],
          [fx.pump(ref.target(), -1, -1)],
        ),
        mode(
          "Destroys a creature an opponent controls that was dealt damage this turn",
          [target.creature("t", { controller: "opponent", damaged: true })],
          [fx.destroy(ref.target())],
        ),
      ]),
    ],
  },
  "Early Winter": {
    spell: modal(
      mode("Exiles a creature", [target.creature()], [fx.exile(ref.target())]),
      mode(
        "An opponent exiles an enchantment",
        [target.player("p", "opponent")],
        [fx.sacrifice(ref.target("p"), { types: ["Enchantment"] }, 1, { to: "exile" })],
      ),
    ),
  },
  "Feed the Cycle": {
    additionalCost: { forageOrPay: cost("{B}") },
    spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
  },
  Fell: { spell: spell([target.creature()], [fx.destroy(ref.target())]) },
  "Glidedive Duo": {
    abilities: [triggered(when.entersSelf, fx.drain(2), { label: "Each opponent loses 2 life, you gain 2" })],
  },
  "Hazel's Nocturne": {
    spell: spell([target.upTo(2, creatureCard())], [fx.toHand(ref.target()), ...fx.drain(2)]),
  },
  "Huskburster Swarm": {
    costReduction: {
      generic: amount.plus(amount.countIn("graveyard", { types: ["Creature"] }), amount.countExiled({ types: ["Creature"] })),
    },
  },
  "Iridescent Vinelasher": {
    abilities: [
      triggered(when.landfall, [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Landfall — 1 damage to an opponent",
      }),
    ],
  },
  "Maha, Its Feathers Night": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "opponent" }, { setToughness: 1 }, { label: "Base toughness 1" }),
    ],
  },
  "Moonstone Harbinger": {
    abilities: [
      triggered(when.lifeChange, [fx.pumpAll(kin(["Bat"]), 1, 0, ["deathtouch"])], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Bats +1/+0 and deathtouch",
      }),
    ],
  },
  "Nocturnal Hunger": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), ...fx.when(cond.not(cond.gift), fx.loseLife(2))]),
  },
  "Osteomancer Adept": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.emblem(
            "Osteomancer Adept",
            msg(
              "Until end of turn, you may cast creature spells from your graveyard by foraging; they enter with a finality counter.",
            ),
            [
              playerStatic({
                playFrom: { zone: "graveyard", filter: { types: ["Creature"] }, what: "spells", forage: true, finality: true },
              }),
            ],
            false,
            true,
          ),
        ],
        label: "Creatures castable from the graveyard (forage)",
      }),
    ],
  },
  "Persistent Marshstalker": {
    abilities: [
      staticAbility("self", { power: 1 }, { per: kin(["Rat"], { other: true }), label: "+1/+0 for each other Rat" }),
      triggered(
        when.attackWith(1, { subtype: "Rat" }),
        fx.mayPay(
          "{2}{B}",
          "Pay {2}{B} to return it attacking?",
          fx.toBattlefield(ref.selfCard, { tapped: true, attacking: true }),
        ),
        { fromGraveyard: true, condition: THRESHOLD, label: "Threshold — returns tapped and attacking" },
      ),
    ],
  },
  "Psychic Whorl": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(2, ref.target()), ...fx.when(cond.controls({ types: ["Creature"], subtype: "Rat" }), fx.surveil(2))],
    ),
  },
  "Ravine Raider": {
    abilities: [activated({ mana: "{1}{B}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1" })],
  },
  "Rottenmouth Viper": {
    // Optional additional cost: each nonland permanent sacrificed reduces the cost by {1} (the player's choice).
    additionalCost: { sacrificeToPay: { filter: { notTypes: ["Land"] } } },
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.counters(ref.self, "blight", 1),
            fx.punisher(ref.eachOpponent, 4, {
              discard: true,
              sacrifice: { notTypes: ["Land"] },
              times: amount.countersOn(ref.self, "blight"),
            }),
          ],
          { label: "Blight counter; 4 life per counter" },
        ),
      ),
    ],
  },
  "Ruthless Negotiation": {
    castOptions: [flashback("{4}{B}")],
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileFromOwnHand(ref.target(), "x"), ...fx.when(cond.spellCastFromGraveyard, fx.draw(1))],
    ),
  },
  Savor: { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2), fx.createTokens(FOOD)]) },
  "Scales of Shale": {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Lizard", controller: "you" }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 0, ["lifelink", "indestructible"])]),
  },
  "Scavenger's Talent": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.createTokens(FOOD)], {
        batched: true,
        oncePerTurn: true,
        label: "Food",
      }),
    ],
    classLevels: [
      [
        triggered(when.sacrifice({}), [fx.mill(2, ref.target())], {
          targets: [target.player()],
          label: "A player mills two cards",
        }),
      ],
      [
        triggered(
          when.yourEndStep,
          [
            fx.sacrifice(ref.you, { notTypes: ["Land"], other: true }, 3, { optional: true, store: "s" }),
            ...fx.when(
              cond.v("s", 3),
              fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "battlefield", counters: { kind: "finality", n: 1 } }),
            ),
          ],
          { label: "Sacrifice three permanents: reanimation" },
        ),
      ],
    ],
  },
  "Season of Loss": {
    spell: pawprint(
      {
        pips: 1,
        label: "Each player sacrifices a creature",
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] })],
      },
      {
        pips: 2,
        label: "Draw for each creature that died under your control",
        effects: [fx.draw(amount.yourCreaturesDiedThisTurn)],
      },
      {
        pips: 3,
        label: "Each opponent loses X life (creatures in the graveyard)",
        effects: [fx.loseLife(amount.countIn("graveyard", { types: ["Creature"] }), ref.eachOpponent)],
      },
    ),
  },
  "Sinister Monolith": {
    abilities: [
      triggered(when.yourCombat, fx.drain(1), { label: "Each opponent loses 1 life and you gain 1 life" }),
      activated({
        tap: true,
        payLife: 2,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.draw(2)],
        label: "Draw two cards",
      }),
    ],
  },
  Stargaze: {
    spell: spell(
      [],
      [fx.lookAtTop(amount.plus(amount.x, amount.x), { count: amount.x, rest: "graveyard" }), fx.loseLife(amount.x)],
    ),
  },
  "Starlit Soothsayer": {
    abilities: [triggered(when.yourEndStep, [fx.surveil(1)], { condition: GAINED_OR_LOST, label: "Surveil 1" })],
  },
  "Starscape Cleric": {
    keywords: ["cantBlock"],
    abilities: [triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "Each opponent loses 1 life" })],
  },
  "Thornplate Intimidator": {
    abilities: [
      triggered(when.entersSelf, [fx.punisher(ref.target(), 3, { discard: true, sacrifice: { notTypes: ["Land"] } })], {
        targets: [target.player("t", "opponent")],
        label: "Loses 3 life unless sacrifice or discard",
      }),
    ],
  },
  "Thought-Stalker Warlock": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(
            cond.refLostLife(ref.target()),
            fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }),
          ),
          ...fx.when(cond.not(cond.refLostLife(ref.target())), fx.discard(1, ref.target())),
        ],
        { targets: [target.player("t", "opponent")], label: "Discard" },
      ),
    ],
  },
  "Valley Rotcaller": {
    abilities: [
      triggered(when.attacksSelf, fx.drain(amount.count(kin(["Squirrel", "Bat", "Lizard", "Rat"], { other: true }))), {
        label: "Drain for each Squirrel, Bat, Lizard and Rat",
      }),
    ],
  },
  "Wick, the Whorled Mind": {
    abilities: [
      triggered(
        when.enters(kin(["Rat"])),
        [
          // "A Snail you control": untargeted choice, on resolution. The counter first, otherwise the token just
          // created would make the counter's condition true.
          ...fx.when(
            cond.controls({ subtype: "Snail" }),
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Snail" }), ref.you, "s", {
              prompt: "Choose the Snail that gets the counter",
            }),
            fx.addCounters(ref.stored("s"), 1),
          ),
          ...fx.when(cond.not(cond.controls({ subtype: "Snail" })), fx.createTokens(SNAIL)),
        ],
        { label: "1/1 Snail, or a +1/+1 counter on a Snail" },
      ),
      activated({
        mana: "{U}{B}{R}",
        sacrificeOther: { filter: { types: ["Creature"], subtype: "Snail" } },
        effects: [fx.damage(amount.powerOf(ref.costSacrificed), ref.eachOpponent), fx.draw(amount.powerOf(ref.costSacrificed))],
        label: "Damage and draw equal to the Snail's power",
      }),
    ],
  },
  "Wick's Patrol": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3),
          fx.reflexive(
            [target.creature("t", { controller: "opponent" })],
            [fx.pump(ref.target(), amount.neg(amount.maxManaValueInGraveyard), amount.neg(amount.maxManaValueInGraveyard))],
          ),
        ],
        { label: "Mill 3, then -X/-X" },
      ),
    ],
  },
};
