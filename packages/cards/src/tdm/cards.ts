/**
 * Tarkir: Dragonstorm — cards of the meta decks (phase 1 of plan P4, batch M1). Harmonize (702.180) is read from the
 * text (`scryfall.ts`): cast from the graveyard like flashback, a tapped creature reduces the cost. The set will be
 * covered in full in phase 2.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  fx,
  GOBLIN,
  MONK,
  manaAbility,
  modal,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  WARRIOR_R,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Blue ------------------------------------------------------------------
  "Winternight Stories": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Creature"] } })]),
  },
  // --- Green -----------------------------------------------------------------
  "Surrak, Elusive Hunter": {
    rules: { cantBeCountered: true },
    abilities: [
      triggered(when.targetedByOpponent({ types: ["Creature"], controller: "you" }, true), [fx.draw(1)], {
        label: "Draw a card",
      }),
    ],
  },

  // --- Batch M2 -----------------------------------------------------------------
  "Strategic Betrayal": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.sacrifice(ref.target(), { types: ["Creature"] }, 1, { to: "exile" }),
        fx.moveAll("graveyard", ref.target(), {}, { to: "exile" }),
      ],
    ),
  },

  // --- Batch M3 -----------------------------------------------------------------
  "Voice of Victory": {
    // Mobilize 2: read from the text.
    abilities: [playerStatic({ castLimit: { who: "opponents", during: "yourTurn" } })],
  },
  "Qarsi Revenant": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [
          fx.counters(ref.target(), "flying"),
          fx.counters(ref.target(), "deathtouch"),
          fx.counters(ref.target(), "lifelink"),
        ],
        label: "Renew: flying, deathtouch and lifelink",
      }),
    ],
  },

  // --- Batch M4 -----------------------------------------------------------------
  "Dispelling Exhale": {
    // "As an additional cost to cast this spell, you may behold a Dragon": done on casting, remembered by the spell.
    additionalCost: { behold: { filter: { subtype: "Dragon" } } },
    spell: spell(
      [target.spell()],
      [
        ...fx.when(cond.beheld, fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target()))),
        ...fx.when(
          cond.not(cond.beheld),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Inevitable Defeat": {
    rules: { cantBeCountered: true },
    spell: spell([target.nonland()], [fx.exile(ref.target()), fx.loseLife(3, ref.controllerOf(ref.target())), fx.gainLife(3)]),
  },
  "Jeskai Revelation": {
    spell: spell(
      [{ id: "b", label: "spell or permanent", filter: { spells: {}, objects: { permanent: true } } }, target.any("d")],
      [fx.bounce(ref.target("b")), fx.damage(4, ref.target("d")), fx.createTokens(MONK, 2), fx.draw(2), fx.gainLife(4)],
    ),
  },
  "Mistrise Village": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ anySubtype: ["Mountain", "Forest"] })),
        label: "Tapped, unless you control a Mountain or a Forest",
      }),
      manaAbility("U"),
      activated({
        mana: "{U}",
        tap: true,
        effects: [fx.nextSpellUncounterable],
        label: "The next spell can't be countered",
      }),
    ],
  },
  "Sarkhan, Dragon Ascendant": {
    abilities: [
      triggered(when.entersSelf, fx.mayBehold({ subtype: "Dragon" }, fx.createTokens(TREASURE)), {
        label: "Beholding a Dragon: a Treasure",
      }),
      triggered(
        when.enters({ subtype: "Dragon", controller: "you" }),
        [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addSubtypes: ["Dragon"], addKeywords: ["flying"] })],
        { label: "+1/+1 counter; flying Dragon until end of turn" },
      ),
    ],
  },
  "Maelstrom of the Spirit Dragon": {
    abilities: [
      manaAbility("C"),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { anySubtype: ["Dragon", "Omen"] } } }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ subtype: "Dragon" }, { to: "hand" })],
        label: "Search for a Dragon card",
      }),
    ],
  },
  "Magmatic Hellkite": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.search(
            BASIC_LAND,
            { to: "battlefield", tapped: true, counters: { kind: "stun", n: 1 } },
            1,
            ref.controllerOf(ref.target()),
          ),
        ],
        {
          targets: [target.permanent("t", ["Land"], { basic: false, controller: "opponent" }, "opponent's nonbasic land")],
          label: "Destroys a nonbasic land",
        },
      ),
    ],
  },
  "Clarion Conqueror": {
    abilities: [
      staticAbility(
        { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Planeswalker"] }] },
        { addKeywords: ["noActivatedAbilities"] },
        { label: "Activated abilities of artifacts, creatures and planeswalkers can't be activated" },
      ),
    ],
  },
  "Twinmaw Stormbrood": { abilities: [triggered(when.entersSelf, [fx.gainLife(5)], { label: "Gain 5 life" })] },
  "Charring Bite": { spell: spell([target.creature("t", { not: { keyword: "flying" } })], [fx.damage(5, ref.target())]) },
  "United Battlefront": {
    spell: spell(
      [],
      [
        fx.lookAtTop(7, {
          count: 2,
          filter: { permanent: true, notTypes: ["Creature", "Land"], maxManaValue: 3 },
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },

  // --- Batch M5 -----------------------------------------------------------------
  "Dalkovan Encampment": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ anySubtype: ["Swamp", "Mountain"] })),
        label: "Tapped, unless you control a Swamp or a Mountain",
      }),
      manaAbility("W"),
      activated({
        mana: "{2}{W}",
        tap: true,
        // "Whenever you attack this turn": delayed ability (603.7), carried by an emblem for the turn; it no longer
        // depends on the land (which can leave the battlefield).
        effects: [
          fx.emblem(
            "Dalkovan Encampment",
            "Whenever you attack this turn, create two 1/1 red Warrior creature tokens that are tapped and attacking. Sacrifice them at the beginning of the next end step.",
            [
              triggered(
                when.attackWith(1),
                [
                  fx.createTappedTokens(WARRIOR_R, 2, { attacking: true, store: "w" }),
                  fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("w") }),
                ],
                { label: "Two attacking 1/1 Warriors" },
              ),
            ],
            false,
            true,
          ),
        ],
        label: "This turn, each attack creates two Warriors",
      }),
    ],
  },
  "Dragonfire Blade": {
    // Equip {4}, {1} less for each color of the target creature: read from the text.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [protection.hexproofFrom({ colorCount: 1 }, "Hexproof from monocolored")],
        },
        { label: "+2/+2, hexproof from monocolored" },
      ),
    ],
  },
  "Frontline Rush": {
    spell: modal(
      mode("Two 1/1 Goblins", [], [fx.createTokens(GOBLIN, 2)]),
      mode(
        "+X/+X (your creatures)",
        [target.creature()],
        [
          fx.pump(
            ref.target(),
            amount.count({ types: ["Creature"], controller: "you" }),
            amount.count({ types: ["Creature"], controller: "you" }),
          ),
        ],
      ),
    ),
  },
  "Stadium Headliner": {
    // Mobilize 1: read from the text.
    abilities: [
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(amount.count({ types: ["Creature"], controller: "you" }), ref.target())],
        label: "Damage equal to the number of your creatures",
      }),
    ],
  },
  "Tersa Lightshatter": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Discard up to two cards, draw that many",
      }),
      triggered(
        when.attacksSelf,
        fx.when(
          cond.amountAtLeast(amount.cardsIn("graveyard"), 7),
          fx.pickFromZone("graveyard", {}, { to: "exile" }, { count: 1, random: true, store: "x" }),
          fx.grantPlay(ref.stored("x")),
        ),
        { label: "Seven cards in the graveyard: exiles a card at random, playable this turn" },
      ),
    ],
  },

  // --- Batch M6 -----------------------------------------------------------------
  "Channeled Dragonfire": { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
  "Sage of the Skies": {
    abilities: [
      triggered(when.castSelf, [fx.copySpell(ref.self, 1)], {
        condition: cond.amountAtLeast(amount.spellsCastThisTurn, 2),
        label: "Another spell cast this turn: copy this spell",
      }),
    ],
  },
  "Heritage Reclamation": {
    spell: modal(
      mode("Destroys an artifact", [target.permanent("a", ["Artifact"])], [fx.destroy(ref.target("a"))]),
      mode("Destroys an enchantment", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
      mode(
        "Exiles a card from a graveyard, draw",
        [target.optional(target.cardInGraveyard("g", {}, "any"))],
        [fx.exileCard(ref.target("g")), fx.draw(1)],
      ),
    ),
  },
};
