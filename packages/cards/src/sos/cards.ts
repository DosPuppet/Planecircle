/**
 * Secrets of Strixhaven — cards of the meta decks (phase 1 of plan P4, lot M1). The other cards of the set are in the
 * files by color.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  entersWith,
  flashback,
  fx,
  INSTANT_SORCERY,
  loyalty,
  manaAbility,
  modal,
  mode,
  PEST,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Lands -----------------------------------------------------------------
  "Great Hall of the Biblioplex": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { payLife: 1, restriction: { spell: INSTANT_SORCERY } }),
      activated({
        mana: "{5}",
        effects: fx.when(
          cond.not(cond.sourceMatches({ types: ["Creature"] })),
          fx.modify(
            ref.self,
            {
              addTypes: ["Creature"],
              addSubtypes: ["Wizard"],
              setPower: 2,
              setToughness: 4,
              addAbilities: [
                triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 1, 0)], {
                  label: "+1/+0 until end of turn",
                }),
              ],
            },
            "permanent",
          ),
        ),
        label: "Becomes a 2/4 Wizard creature",
      }),
    ],
  },
  // --- Red -------------------------------------------------------------------
  "Impractical Joke": {
    spell: spell(
      [target.optional(target.creatureOrPlaneswalker())],
      [fx.thisTurn({ damageUnpreventable: true }), fx.damage(3, ref.target())],
    ),
  },
  // --- Multicolor ------------------------------------------------------------
  "Prismari Charm": {
    spell: modal(
      mode("Surveil 2, then draw a card", [], [fx.surveil(2), fx.draw(1)]),
      mode("1 damage to each of one or two targets", [target.between(1, 2, target.any())], [fx.damage(1, ref.target())]),
      mode("Return a nonland permanent", [target.nonland()], [fx.bounce(ref.target())]),
    ),
  },
  "Traumatic Critique": {
    spell: spell([target.any()], [fx.damage(amount.x, ref.target()), fx.draw(2), fx.discard(1)]),
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Professor Dellian Fel": {
    abilities: [
      loyalty(2, { effects: [fx.gainLife(3)], label: "Gain 3 life" }),
      loyalty(0, { effects: [fx.draw(1), fx.loseLife(1)], label: "Draw, lose 1 life" }),
      loyalty(-3, { targets: [target.creature()], effects: [fx.destroy(ref.target())], label: "Destroys a creature" }),
      loyalty(-6, {
        effects: [
          fx.emblem("Professor Dellian Fel", "Whenever you gain life, target opponent loses that much life.", [
            triggered(when.gainLife, [fx.loseLife(amount.eventAmount, ref.target())], {
              targets: [target.player("t", "opponent")],
              label: "An opponent loses that much life",
            }),
          ]),
        ],
        label: "Emblem",
      }),
    ],
  },
  "Witherbloom Charm": {
    spell: modal(
      mode(
        "Optional sacrifice: draw two cards",
        [],
        [fx.sacrifice(ref.you, {}, 1, { optional: true, store: "s" }), ...fx.when(cond.v("s"), fx.draw(2))],
      ),
      mode("Gain 5 life", [], [fx.gainLife(5)]),
      mode(
        "Destroys a nonland permanent with mana value 2 or less",
        [target.nonland("t", { maxManaValue: 2 })],
        [fx.destroy(ref.target())],
      ),
    ),
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Emeritus of Ideation": {
    prepareSpell: spell([target.player()], [fx.draw(3, ref.target())]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(
        when.attacksSelf,
        fx.may(
          "Exile eight cards from your graveyard to prepare this creature?",
          fx.when(
            cond.amountAtLeast(amount.cardsIn("graveyard"), 8),
            fx.pickFromZone(
              "graveyard",
              {},
              { to: "exile" },
              { count: 8, min: 8, prompt: "Exile eight cards from your graveyard" },
            ),
            fx.prepare(ref.self),
          ),
        ),
        { label: "Exile eight cards: becomes prepared" },
      ),
    ],
  },
  Erode: {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Petrified Hamlet": {
    // The name is chosen by the enters triggered ability.
    rules: { chosenNameAbilities: "forbid" },
    abilities: [
      triggered(when.entersSelf, [fx.chooseForSelf("landName")], { label: "Choose a land card name" }),
      manaAbility("C"),
      staticAbility(
        { types: ["Land"], chosen: "cardName" },
        { addAbilities: [manaAbility("C")] },
        {
          label: 'Lands with the chosen name have "{T}: Add {C}"',
        },
      ),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  Flashback: {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery card from your graveyard")],
      [fx.grantFlashback(ref.target())],
    ),
  },
  "Together as One": {
    // Converge: X = colors of mana spent.
    spell: spell(
      [target.player("p"), target.any("d")],
      [
        fx.draw(amount.colorsSpent, ref.target("p")),
        fx.damage(amount.colorsSpent, ref.target("d")),
        fx.gainLife(amount.colorsSpent),
      ],
    ),
  },
  "Tablet of Discovery": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(1, ref.you, { name: "m" }), fx.grantPlay(ref.stored("m"))], {
        label: "Mill a card, playable this turn",
      }),
      manaAbility("R"),
      manaAbility("R", 2, { restriction: { spell: INSTANT_SORCERY } }),
    ],
  },
  "Sundown Pass": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Tapped unless you control two or more other lands",
      }),
      manaAbility(["R", "W"]),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Hardened Academic": {
    abilities: [
      activated({ discard: 1, effects: [fx.modify(ref.self, { addKeywords: ["lifelink"] })], label: "Lifelink" }),
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.addCounters(ref.target(), 1)], {
        batched: true,
        targets: [target.creature("t", { controller: "you" })],
        label: "Cards leave your graveyard: a +1/+1 counter",
      }),
    ],
  },
  "Moseo, Vein's New Dean": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(PEST)], { label: "A 1/1 Pest" }),
      triggered(when.yourEndStep, [fx.toBattlefield(ref.target())], {
        condition: cond.lifeGainedAtLeast(1),
        targets: [
          {
            ...target.optional(
              target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card with mana value X or less"),
            ),
            // X: the life gained this turn, on targeting then on resolution.
            maxManaValueAmount: amount.lifeGainedThisTurn,
          },
        ],
        label: "Infusion: returns a creature with mana value X or less (life gained)",
      }),
    ],
  },
  "Practiced Offense": {
    castOptions: [flashback("{1}{W}")],
    // "Your choice of": chosen on resolution (608.2d), it is not a modal spell.
    spell: spell(
      [target.player("p"), target.creature("c")],
      [
        fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1),
        ...fx.yourChoice("the target creature gains…", "k", [
          { label: "double strike", effects: [fx.modify(ref.target("c"), { addKeywords: ["doubleStrike"] })] },
          { label: "lifelink", effects: [fx.modify(ref.target("c"), { addKeywords: ["lifelink"] })] },
        ]),
      ],
    ),
  },
  "Shattered Sanctum": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Tapped unless you control two or more other lands",
      }),
      manaAbility(["W", "B"]),
    ],
  },
  "Decorum Dissertation": {
    // Paradigm: read from the text.
    spell: spell([target.player()], [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())]),
  },

  // --- Lot M6 -----------------------------------------------------------------
  Daydream: {
    castOptions: [flashback("{2}{W}")],
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.exileCard(ref.target(), { name: "d" }), fx.toBattlefield(ref.stored("d"), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Deathcap Glade": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Tapped unless you control two or more other lands",
      }),
      manaAbility(["B", "G"]),
    ],
  },
  "Stormcarved Coast": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
        label: "Tapped unless you control two or more other lands",
      }),
      manaAbility(["U", "R"]),
    ],
  },
  "Dissection Practice": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, target.creature("a")), target.upTo(1, target.creature("b"))],
      [fx.loseLife(1, ref.target("p")), fx.gainLife(1), fx.pump(ref.target("a"), 1, 1), fx.pump(ref.target("b"), -1, -1)],
    ),
  },
  "Colorstorm Stallion": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [fx.pump(ref.self, 1, 1), ...fx.when(cond.amountAtLeast(amount.eventManaSpent, 5), fx.copyToken(ref.self))],
        { label: "Opus: +1/+1; five or more mana: a token copy" },
      ),
    ],
  },
  "Vibrant Outburst": {
    spell: spell(
      [target.any("d"), target.upTo(1, target.creature("c"))],
      [fx.damage(3, ref.target("d")), fx.tap(ref.target("c"))],
    ),
  },
  "Vicious Rivalry": {
    // "Pay X life" as an additional cost: read from the text.
    spell: spell(
      [],
      [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], compare: [cmp.manaValue("<=", amount.x)] })],
    ),
  },
  "Ral Zarek, Guest Lecturer": {
    abilities: [
      loyalty(1, { effects: [fx.surveil(2)], label: "Surveil 2" }),
      loyalty(-1, {
        targets: [target.upTo(8, target.player("t"))],
        effects: [fx.discard(1, ref.target())],
        label: "Each target player discards a card",
      }),
      loyalty(-2, {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with mana value 3 or less"),
        ],
        effects: [fx.toBattlefield(ref.target())],
        label: "Returns a creature with mana value 3 or less",
      }),
      loyalty(-7, {
        targets: [target.player("t", "opponent")],
        effects: [
          fx.coinFlip("h1"),
          fx.coinFlip("h2"),
          fx.coinFlip("h3"),
          fx.coinFlip("h4"),
          fx.coinFlip("h5"),
          fx.playerEffectTimes(
            { skips: "turn" },
            amount.plus(amount.v("h1"), amount.v("h2"), amount.v("h3"), amount.v("h4"), amount.v("h5")),
            ref.target(),
          ),
        ],
        label: "Five coins: the opponent skips X turns",
      }),
    ],
  },
};
