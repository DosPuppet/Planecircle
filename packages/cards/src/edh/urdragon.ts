/**
 * Commander: The Ur-Dragon deck (Dragons, five colors; "How to Train Ur-Dragon [Primer!]", Moxfield). The commander,
 * its Dragons, the mana base (mana creatures and artifacts, lands) and the spells.
 */
import type { CardScript, Effect, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  cond,
  doesntUntap,
  entersWith,
  fx,
  loyalty,
  manaAbility,
  modal,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const DRAGON_YOU: ObjectFilter = { subtype: "Dragon", controller: "you" };
const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Your commanders on the battlefield or in the command zone (Majestic Genesis). */
const COMMANDERS_OUT = ref.union(
  ref.zone("battlefield", ref.eachPlayer, { commander: true, owner: "you" }),
  ref.zone("command", ref.you, { commander: true }),
);

/** 1/1 blue Faerie Dragon with flying (Ancient Gold Dragon). */
const FAERIE_DRAGON: TokenSpec = {
  name: "Faerie Dragon",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Faerie", "Dragon"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** 1/1 colorless Spirit (Forbidden Orchard). */
const SPIRIT_COLORLESS: TokenSpec = {
  name: "Spirit",
  colors: [],
  types: ["Creature"],
  subtypes: ["Spirit"],
  power: 1,
  toughness: 1,
};
/** 2/2 blue Bird with flying (Swan Song). */
const BIRD_BLUE: TokenSpec = {
  name: "Bird",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird"],
  power: 2,
  toughness: 2,
  keywords: ["flying"],
};

/** "Whenever [this Dragon] or another Dragon you control enters, it deals X damage to any target, where X is the
 * number of Dragons you control" (Scourge of Valkas, Dragon Tempest). */
const dragonEntersDamage = (label: string) =>
  triggered(when.enters(DRAGON_YOU), [fx.damage(amount.count(DRAGON_YOU), ref.target(), ref.eventObject)], {
    targets: [target.any()],
    label,
  });

export const EDH_URDRAGON: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  "The Ur-Dragon": {
    abilities: [
      // Eminence: from the command zone too. "Other": not The Ur-Dragon itself.
      playerStatic({
        spellCost: { filter: { subtype: "Dragon", not: { name: "The Ur-Dragon" } }, reduce: 1 },
        fromCommand: true,
        label: "Eminence — your other Dragon spells cost {1} less",
      }),
      triggered(
        when.attackWith(1, DRAGON_YOU),
        [
          fx.draw(amount.eventAmount),
          fx.pickFromZone("hand", { permanent: true }, { to: "battlefield" }, { min: 0, prompt: "A permanent from your hand" }),
        ],
        { label: "Dragons attack: draw that many cards, then a permanent from your hand onto the battlefield" },
      ),
    ],
  },

  // --- Mana: creatures and artifacts ---------------------------------------------------------------------------------
  "Birds of Paradise": { abilities: [manaAbility(ANY_COLOR)] },
  "Noble Hierarch": { abilities: [manaAbility(["G", "W", "U"])] },
  "Ignoble Hierarch": { abilities: [manaAbility(["B", "R", "G"])] },
  "Delighted Halfling": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, {
        restriction: { spell: { legendary: true } },
        rider: { spell: { legendary: true }, effect: "uncounterable" },
      }),
    ],
  },
  "Selvala, Heart of the Wilds": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], other: true }),
        fx.when(
          cond.eventObjectStrictlyGreatestPower,
          fx.mayFor(ref.controllerOf(ref.eventObject), "Draw a card?", fx.draw(1, ref.controllerOf(ref.eventObject))),
        ),
        { label: "A creature with greater power than all others enters: its controller may draw" },
      ),
      activated({
        mana: "{G}",
        tap: true,
        effects: [fx.addManaCombination(amount.maxPower(CREATURE_YOU))],
        label: "X mana in any combination of colors (X: the greatest power among your creatures)",
      }),
    ],
  },
  "Mana Vault": {
    abilities: [
      manaAbility("C", 3),
      triggered(when.yourUpkeep, fx.mayPay("{4}", "Pay {4} to untap Mana Vault?", fx.untap(ref.self)), {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Pay {4}: untap it",
      }),
      triggered(when.step("draw"), [fx.damage(1, ref.you)], {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Tapped: 1 damage to you",
      }),
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
    ],
  },
  // "If this artifact would enter, you may discard a land card instead. If you do, put this artifact onto the
  // battlefield. If you don't, put it into its owner's graveyard": as it enters (614.1c).
  "Mox Diamond": {
    asEnters: [
      fx.discard(1, ref.you, { filter: { types: ["Land"] }, optional: true, store: "land" }),
      ...fx.when(cond.not(cond.v("land")), fx.moveTo(ref.self, { to: "graveyard" })),
    ],
    abilities: [manaAbility(ANY_COLOR)],
  },
  "Chromatic Orrery": {
    abilities: [
      playerStatic({
        // Spells and activated abilities alike.
        spellCost: { filter: {}, anyMana: true },
        abilityCost: { anyMana: true },
        label: "You may spend mana as though it were mana of any color",
      }),
      manaAbility("C", 5),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.draw(amount.colorsAmong())],
        label: "Draw a card for each color among your permanents",
      }),
    ],
  },

  // --- Lands --------------------------------------------------------------------------------------------------------
  "City of Brass": {
    abilities: [
      manaAbility(ANY_COLOR),
      triggered(when.tapsSelf, [fx.damage(1, ref.you)], { label: "Becomes tapped: 1 damage to you" }),
    ],
  },
  // Approximation: "whenever you tap this land for mana" is read as "whenever it becomes tapped".
  "Forbidden Orchard": {
    abilities: [
      manaAbility(ANY_COLOR),
      // "Whenever you tap this land for mana".
      triggered({ on: "taps", who: "self", cause: "mana" }, [fx.createTokens(SPIRIT_COLORLESS, 1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Target opponent creates a 1/1 colorless Spirit",
      }),
    ],
  },
  "Arena of Glory": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ subtype: "Mountain" })),
        label: "Tapped without a Mountain",
      }),
      manaAbility("R"),
      activated({
        mana: "{R}",
        tap: true,
        exert: true,
        effects: [fx.addManaWithRider({ spell: { types: ["Creature"] }, effect: "haste" }, "R", "R")],
        label: "Exert it: {R}{R}; a creature cast with this mana has haste",
      }),
    ],
  },
  "Boseiju, Who Endures": {
    abilities: [
      manaAbility("G"),
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count({ types: ["Creature"], legendary: true, controller: "you" }) },
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment", "Land"],
            { controller: "opponent", not: { types: ["Land"], basic: true } },
            "artifact, enchantment or nonbasic land an opponent controls",
          ),
        ],
        effects: [
          fx.destroy(ref.target()),
          ...fx.mayFor(
            ref.controllerOf(ref.target()),
            "search for a land with a basic land type",
            fx.search(
              { types: ["Land"], anySubtype: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
              { to: "battlefield" },
              1,
              ref.controllerOf(ref.target()),
            ),
          ),
        ],
        label: "Channel — destroy an artifact, enchantment or nonbasic land an opponent controls",
      }),
    ],
  },
  "Horizon of Progress": {
    abilities: [
      manaAbility([...ANY_COLOR, "C"], 1, { likeLands: {}, payLife: 1 }),
      activated({
        mana: "{3}",
        tap: true,
        effects: [
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { min: 0, prompt: "A land" }),
        ],
        label: "Put a land card from your hand onto the battlefield tapped",
      }),
      activated({ mana: "{1}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Sacrifice it: draw a card" }),
    ],
  },

  // --- Enchantments and artifacts -----------------------------------------------------------------------------------
  "Dragon Tempest": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, keyword: "flying" }), [fx.pump(ref.eventObject, 0, 0, ["haste"])], {
        label: "A creature with flying enters: it gains haste",
      }),
      dragonEntersDamage("A Dragon enters: it deals X damage (X: your Dragons)"),
    ],
  },
  "Temur Ascendancy": {
    abilities: [
      staticAbility(CREATURE_YOU, { addKeywords: ["haste"] }, { label: "Your creatures have haste" }),
      triggered(when.enters({ ...CREATURE_YOU, minPower: 4 }), fx.may("Draw a card?", fx.draw(1)), {
        label: "A creature with power 4 or greater enters: you may draw",
      }),
    ],
  },
  "Steely Resolve": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { types: ["Creature"], chosen: "subtype" },
        { addKeywords: ["shroud"] },
        { label: "Creatures of the chosen type have shroud" },
      ),
    ],
  },

  // --- Planeswalker ---------------------------------------------------------------------------------------------------
  "Kiora, Behemoth Beckoner": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, minPower: 4 }), [fx.draw(1)], {
        label: "A creature with power 4 or greater enters: draw a card",
      }),
      loyalty(-1, {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        effects: [fx.untap(ref.target())],
        label: "Untap target permanent",
      }),
    ],
  },

  // --- Spells ---------------------------------------------------------------------------------------------------------
  "Stubborn Denial": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
      [
        fx.when(cond.ferocious, fx.counter(ref.target())),
        fx.when(
          cond.not(cond.ferocious),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{1}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Swan Song": {
    spell: spell(
      [target.spell("t", { types: ["Enchantment", "Instant", "Sorcery"] }, "enchantment, instant or sorcery spell")],
      [fx.counter(ref.target()), fx.createTokens(BIRD_BLUE, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Crux of Fate": {
    spell: modal(
      {
        label: "Destroy all Dragon creatures",
        targets: [],
        effects: [fx.destroyAll({ types: ["Creature"], subtype: "Dragon" })],
      },
      {
        label: "Destroy all non-Dragon creatures",
        targets: [],
        effects: [fx.destroyAll({ types: ["Creature"], notSubtype: "Dragon" })],
      },
    ),
  },
  "Majestic Genesis": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.greatestManaValueOf(COMMANDERS_OUT), {
          filter: { permanent: true },
          count: amount.greatestManaValueOf(COMMANDERS_OUT),
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },

  // --- Dragons --------------------------------------------------------------------------------------------------------
  "Ancient Gold Dragon": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rollDie(20, "d20"), fx.createTokens(FAERIE_DRAGON, amount.v("d20"))], {
        label: "Combat damage to a player: roll a d20, that many 1/1 flying Faerie Dragons",
      }),
    ],
  },
  "Cavern-Hoard Dragon": {
    costReduction: { generic: amount.maxOverPlayers(ref.eachOpponent, amount.count({ types: ["Artifact"], controller: "you" })) },
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [fx.createTokens(TREASURE, amount.refCount(ref.zone("battlefield", ref.eventPlayer, { types: ["Artifact"] })))],
        { label: "Combat damage to a player: a Treasure for each artifact that player controls" },
      ),
    ],
  },
  "Dragonlord Dromoka": {
    rules: { cantBeCountered: true },
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn" },
        label: "Your opponents can't cast spells during your turn",
      }),
    ],
  },
  "Dragonlord Kolaghan": {
    abilities: [
      staticAbility(
        { ...CREATURE_YOU, other: true },
        { addKeywords: ["haste"] },
        { label: "Other creatures you control have haste" },
      ),
      triggered(when.castSpell("opponent", { types: ["Creature", "Planeswalker"] }), [fx.loseLife(10, ref.eventPlayer)], {
        condition: cond.amountAtLeast(
          amount.refCount(ref.zone("graveyard", ref.eventPlayer, { shares: { what: "name", with: ref.eventObject } })),
          1,
        ),
        label: "An opponent casts a spell with the same name as a card in their graveyard: they lose 10 life",
      }),
    ],
  },
  "Ganax, Astral Hunter": {
    abilities: [triggered(when.enters(DRAGON_YOU), [fx.createTokens(TREASURE)], { label: "A Dragon enters: a Treasure" })],
  },
  "Goldlust Triad": {
    // Myriad: read from the text.
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(TREASURE)], { label: "A Treasure" })],
  },
  "Goldspan Dragon": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "It attacks: a Treasure" }),
      triggered({ on: "becomesTarget", who: "self", spells: true }, [fx.createTokens(TREASURE)], {
        label: "Targeted by a spell: a Treasure",
      }),
      staticAbility(
        { subtype: "Treasure", controller: "you" },
        { addAbilities: [manaAbility(ANY_COLOR, 2, { sacrifice: true })] },
        { label: 'Your Treasures: "{T}, sacrifice: two mana of any one color"' },
      ),
    ],
  },
  "Hellkite Courser": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Put your commander onto the battlefield?",
          // "Put a commander you own from the command zone onto the battlefield": one, chosen among two partners.
          fx.chooseAmong(ref.zone("command", ref.you, { commander: true }), ref.you, "c", {
            anyZone: true,
            prompt: "Choose your commander",
          }),
          fx.moveTo(ref.stored("c"), { to: "battlefield" }, { name: "cmd" }),
          fx.pump(ref.stored("cmd"), 0, 0, ["haste"]),
          fx.delayed([fx.moveTo(ref.target("cmd"), { to: "command" })], { cmd: ref.stored("cmd") }),
        ),
        { label: "Your commander enters with haste; it returns to the command zone at the end step" },
      ),
    ],
  },
  "Klauth, Unrivaled Ancient": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.addManaCombination(amount.totalPower({ attacking: true, controller: "you" }), undefined, { spell: {} }, true)],
        { label: "X mana (total power of the attackers), for spells, kept until end of turn" },
      ),
    ],
  },
  "Korvold, Fae-Cursed King": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.sacrifice(ref.you, { permanent: true, other: true })], { label: "Sacrifice another permanent" }),
      ),
      triggered(when.sacrifice({}), [fx.addCounters(ref.self, 1), fx.draw(1)], {
        label: "You sacrifice a permanent: +1/+1 counter and draw a card",
      }),
    ],
  },
  "Miirym, Sentinel Wyrm": {
    abilities: [
      triggered(
        when.enters({ ...DRAGON_YOU, token: false, other: true }),
        [fx.copyToken(ref.eventObject, { nonlegendary: true })],
        { label: "Another nontoken Dragon enters: a nonlegendary token copy" },
      ),
    ],
  },
  "Old Gnawbone": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU, true), [fx.createTokens(TREASURE, amount.eventAmount)], {
        label: "Combat damage to a player: that many Treasures",
      }),
    ],
  },
  "Scourge of Valkas": {
    abilities: [
      dragonEntersDamage("It or another Dragon enters: X damage (X: your Dragons)"),
      activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
    ],
  },
  Tiamat: {
    abilities: [
      triggered(
        when.entersSelf,
        [{ ...fx.search({ subtype: "Dragon", not: { name: "Tiamat" } }, { to: "hand" }, 5), distinctNames: true } as Effect],
        { condition: cond.wasCast, label: "Search for up to five Dragon cards with different names" },
      ),
    ],
  },
  "Ureni of the Unwritten": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [fx.lookAtTop(8, { filter: { types: ["Creature"], subtype: "Dragon" }, count: 1, to: { to: "battlefield" } })],
          { label: "Eight cards: a Dragon creature card onto the battlefield" },
        ),
      ),
    ],
  },
  "Zurgo and Ojutai": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ enteredThisTurn: true }),
          label: "Hexproof as long as it entered this turn",
        },
      ),
      triggered(
        when.combatDamageBatch(DRAGON_YOU),
        [
          fx.lookAtTop(3, { count: 1, exact: true, rest: "bottom" }),
          fx.pickFromZone(
            "hand",
            {},
            { to: "hand" },
            { min: 0, pool: ref.eventObjects, prompt: "You may return one of these Dragons to its owner's hand" },
          ),
        ],
        { label: "Dragons deal damage to a player: one of the top three cards into your hand; one of these Dragons may return" },
      ),
    ],
  },
};
