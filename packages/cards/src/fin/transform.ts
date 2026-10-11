/** Final Fantasy — transforming cards (Sagas on the back included) and meld (lot C). Scripts by face name. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  chocobo,
  cond,
  costReducer,
  entersWith,
  eventReplacement,
  FOOD,
  flashback,
  fx,
  graveyardReplacement,
  KNIGHT_2,
  manaAbility,
  playerStatic,
  ref,
  staticAbility,
  TOWN,
  TREASURE,
  target,
  targetObj,
  triggered,
  WIZARD_0_1,
  when,
} from "./common";

const PERMANENT_CARD = { permanent: true };
const YOURS = { types: ["Creature" as const], controller: "you" as const };
const OTHERS = { ...YOURS, other: true };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

/** "Exile [this card], then return it to the battlefield transformed under its owner's control." */
const flipOut = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })];
/** "Exile [this back face], then return it to the battlefield": it comes back on its front face. */
const flipBack = () => [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"))];
/** Ability "{cost}, {T}: exile it, then return it transformed. Activate only as a sorcery." */
const transformAbility = (mana: string, label = "Exile it, then return it transformed") =>
  activated({ mana, tap: true, sorcerySpeed: true, effects: flipOut(), label });

export const TRANSFORM: Record<string, CardScript> = {
  // --- White ------------------------------------------------------------------
  "Dion, Bahamut's Dominant": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", anyOf: [{ self: true }, { subtype: "Knight" }] },
        { addKeywords: ["flying"] },
        { condition: cond.yourTurn, label: "Dragonwing Dive: flying during your turn" },
      ),
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_2)], { label: "2/2 Knight" }),
      transformAbility("{4}{W}{W}"),
    ],
  },
  "Bahamut, Warden of Light": {
    abilities: [
      chapter([1, 2], [fx.addCountersAll(OTHERS, 1), fx.pumpAll(OTHERS, 0, 0, ["flying"])], { label: "Wings of Light" }),
      chapter([3], [fx.destroy(ref.target()), ...flipBack()], {
        targets: [targetObj("t", { permanent: true }, "permanent")],
        label: "Gigaflare",
      }),
    ],
  },
  "Sidequest: Catch a Fish": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.lookAtTop(1, {
            filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
            count: 1,
            rest: "top",
            store: "fish",
          }),
          fx.when(cond.v("fish"), fx.createTokens(FOOD), fx.transform()),
        ],
        { label: "Top card: artifact or creature into your hand" },
      ),
    ],
  },
  "Cooking Campsite": {
    abilities: [
      manaAbility("W"),
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        sorcerySpeed: true,
        effects: [fx.addCountersAll(YOURS, 1)],
        label: "A +1/+1 counter on each creature",
      }),
    ],
  },
  "Venat, Heart of Hydaelyn": {
    abilities: [
      triggered(when.castSpell("you", { legendary: true }), [fx.draw(1)], { oncePerTurn: true, label: "Draw" }),
      activated({
        mana: "{7}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.nonland("t")],
        effects: [fx.exile(ref.target()), fx.transform()],
        label: "Hero's Sundering",
      }),
    ],
  },
  "Hydaelyn, the Mothercrystal": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), 1),
          fx.modify(ref.target(), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
          fx.when(cond.targetMatches("t", { legendary: true }), fx.draw(1)),
        ],
        { targets: [target.creature("t", { controller: "you", other: true })], label: "Blessing of Light" },
      ),
    ],
  },

  // --- Blue -------------------------------------------------------------------
  "Jill, Shiva's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "Return another nonland permanent",
      }),
      transformAbility("{3}{U}{U}"),
    ],
  },
  "Shiva, Warden of Ice": {
    abilities: [
      chapter([1, 2], [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t")],
        label: "Mesmerize: can't be blocked",
      }),
      chapter([3], [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Land"] })), ...flipBack()], {
        label: "Cold Snap",
      }),
    ],
  },
  "Sidequest: Card Collection": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.discard(2)], { label: "Draw three, discard two" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard"), 8),
        label: "Transform (eight cards in your graveyard)",
      }),
    ],
  },
  "Magicked Card": {},

  // --- Black ------------------------------------------------------------------
  "Cecil, Dark Knight": {
    abilities: [
      triggered(
        when.dealsDamage("self"),
        [fx.loseLife(amount.eventAmount), fx.when(cond.not(cond.lifeAtLeast(11)), fx.untap(ref.self), fx.transform())],
        { label: "Darkness: lose that much life" },
      ),
    ],
  },
  "Cecil, Redeemed Paladin": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ types: ["Creature"], attacking: true, other: true }, 0, 0, ["indestructible"])], {
        label: "Protect: the other attackers are indestructible",
      }),
    ],
  },
  "Jecht, Reluctant Guardian": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.may("Exile Jecht and return it transformed?", ...flipOut())], {
        label: "Transform",
      }),
    ],
  },
  "Braska's Final Aeon": {
    abilities: [
      chapter([1, 2], [fx.discard(1, ref.eachOpponent), fx.draw(1)], { label: "Jecht Beam" }),
      chapter([3], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 2)], { label: "Ultimate Jecht Shot" }),
    ],
  },
  "Sidequest: Hunt the Mark": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "Destroy up to one creature",
      }),
      triggered(
        when.yourEndStep,
        [fx.createTokens(TREASURE), fx.when(cond.controls({ subtype: "Treasure" }, 3), fx.transform())],
        { condition: cond.creaturesDied(1, true), label: "Treasure, then transform (three Treasures)" },
      ),
    ],
  },
  "Yiazmat, Ultimate Mark": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, tap it",
      }),
    ],
  },
  "Vincent Valentine": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent" }),
        [fx.addCounters(ref.self, amount.powerOf(ref.eventObject))],
        {
          label: "Counters equal to its power",
        },
      ),
      triggered(when.attacksSelf, [fx.may("Transform Vincent Valentine?", fx.transform())], { label: "Transform" }),
    ],
  },
  "Galian Beast": {
    abilities: [triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Returns tapped" })],
  },

  // --- Green ------------------------------------------------------------------
  "Sidequest: Raise a Chocobo": {
    abilities: [
      triggered(when.entersSelf, [chocobo()], { label: "2/2 Chocobo" }),
      triggered(when.step("main1"), [fx.transform()], {
        condition: cond.controls({ types: ["Creature"], subtype: "Bird" }, 4),
        label: "Transform (four Birds)",
      }),
    ],
  },
  "Black Chocobo": {
    abilities: [
      triggered(when.transformsSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Transforms: search for a land",
      }),
      triggered(when.landfall, [fx.pumpAll({ ...YOURS, subtype: "Bird" }, 1, 0)], { label: "Landfall: Birds get +1/+0" }),
    ],
  },

  // --- Multicolored -----------------------------------------------------------
  "Joshua, Phoenix's Dominant": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Discard up to two cards, draw that many",
      }),
      transformAbility("{3}{R}{W}"),
    ],
  },
  "Phoenix, Warden of Fire": {
    abilities: [
      chapter([1, 2], [fx.damage(2, ref.eachOpponent)], { label: "Rising Flames" }),
      chapter([3], [fx.toBattlefield(ref.target()), ...flipBack()], {
        targets: [
          {
            ...target.upTo(20, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")),
            maxTotalManaValue: 6,
          },
        ],
        label: "Flames of Rebirth",
      }),
    ],
  },
  "The Emperor of Palamecia": {
    abilities: [
      manaAbility(["U", "R"], 1, { restriction: { spell: { notTypes: ["Creature"] } } }),
      triggered(
        when.castNoncreatureWithMana(4),
        [fx.addCounters(ref.self, 1), fx.when(cond.counterAtLeast("+1/+1", 3), fx.transform())],
        { label: "+1/+1 counter, then transform (three)" },
      ),
    ],
  },
  "The Lord Master of Hell": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.damage(amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }), ref.eachOpponent)],
        { label: "Starfall" },
      ),
    ],
  },
  "Exdeath, Void Warlock": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 life" }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.amountAtLeast(amount.countIn("graveyard", PERMANENT_CARD), 6),
        label: "Transform (six permanent cards in your graveyard)",
      }),
    ],
  },
  "Neo Exdeath, Dimension's End": { cda: { power: amount.countIn("graveyard", PERMANENT_CARD) } },
  "Garland, Knight of Cornelia": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.surveil(1)], { label: "Surveil 1" }),
      activated({
        mana: "{3}{B}{B}{R}{R}",
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.self, { transformed: true })],
        label: "Returns transformed from the graveyard",
      }),
    ],
  },
  "Chaos, the Endless": {
    abilities: [
      triggered(when.diesSelf, [fx.moveTo(ref.selfCard, { to: "libraryBottom" })], { label: "To the bottom of the library" }),
    ],
  },

  // --- Land -------------------------------------------------------------------
  "Clive, Ifrit's Dominant": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.may(
            "Discard your hand to draw cards equal to your devotion to red?",
            fx.discard(amount.cardsIn("hand")),
            fx.draw(amount.devotion("R")),
          ),
        ],
        { label: "Discard your hand, draw for devotion" },
      ),
      transformAbility("{4}{R}{R}"),
    ],
  },
  "Ifrit, Warden of Inferno": {
    abilities: [
      chapter([1], [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Lunge: fight",
      }),
      chapter([2, 3], [fx.addMana("R", "R", "R", "R"), fx.when(cond.counterAtLeast("lore", 3), ...flipBack())], {
        label: "Brimstone: {R}{R}{R}{R}",
      }),
    ],
  },
  "Ultimecia, Time Sorceress": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) => triggered(t, [fx.surveil(2)], { label: "Surveil 2" })),
      triggered(
        when.yourEndStep,
        fx.mayPay(
          "{4}{U}{U}{B}{B}",
          "Pay {4}{U}{U}{B}{B} and exile eight cards from your graveyard?",
          fx.pickFromZone("graveyard", {}, { to: "exile" }, { count: 8, min: 8, prompt: "Exile eight cards" }),
          fx.transform(),
        ),
        { condition: cond.amountAtLeast(amount.countIn("graveyard"), 8), label: "Pay, exile eight cards: transform" },
      ),
    ],
  },
  "Ultimecia, Omnipotent": {
    abilities: [triggered(when.transformsSelf, [fx.extraTurn], { label: "Time Compression: extra turn" })],
  },
  "Sephiroth, Fabled SOLDIER": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(
          t,
          [
            fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
            fx.when(cond.v("s"), fx.draw(1)),
          ],
          { label: "Sacrifice a creature: draw" },
        ),
      ),
      triggered(
        when.dies({ types: ["Creature"], other: true }),
        [
          ...fx.drain(1, ref.target()),
          fx.countResolution("n"),
          fx.when(
            cond.all(cond.v("n", 4), cond.not(cond.v("n", 5))),
            fx.emblem(
              "Sephiroth, One-Winged Angel",
              "Whenever a creature dies, target opponent loses 1 life and you gain 1 life.",
              [
                triggered(when.dies({ types: ["Creature"] }), fx.drain(1, ref.target()), {
                  targets: [target.player("t", "opponent")],
                  label: "Drain 1",
                }),
              ],
            ),
            fx.transform(),
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "Drain 1; fourth time: transform" },
      ),
    ],
  },
  "Sephiroth, One-Winged Angel": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 99, { optional: true, store: "s" }), fx.draw(amount.v("s"))],
        { label: "Sacrifice creatures: draw that many" },
      ),
    ],
  },
  "Kuja, Genome Sorcerer": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.createTappedTokens(WIZARD_0_1, 1),
          fx.when(cond.controls({ types: ["Creature"], subtype: "Wizard" }, 4), fx.transform()),
        ],
        { label: "Tapped Wizard, then transform (four Wizards)" },
      ),
    ],
  },
  "Trance Kuja, Fate Defied": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { types: ["Creature"], subtype: "Wizard", controller: "you" },
        modify: { times: 2 },
        label: "Flare Star: damage from your Wizards doubled",
      }),
    ],
  },
  "Kefka, Court Mage": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [fx.discard(1, ref.eachPlayer, { store: "k" }), fx.draw(amount.cardTypesOf(ref.stored("k")))], {
          label: "Each player discards; draw for each card type",
        }),
      ),
      activated({
        mana: "{8}",
        sorcerySpeed: true,
        effects: [fx.sacrifice(ref.eachOpponent, { permanent: true }), fx.transform()],
        label: "Each opponent sacrifices a permanent; transform",
      }),
    ],
  },
  "Kefka, Ruler of Ruin": {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.draw(amount.eventAmount)], {
        condition: cond.yourTurn,
        label: "Draw that many cards",
      }),
    ],
  },
  "Serah Farron": {
    abilities: [
      costReducer({ types: ["Creature"], legendary: true }, 2, "First legendary creature spell costs {2} less", {
        condition: cond.noLegendaryCreatureCastThisTurn,
      }),
      triggered(when.yourCombat, [fx.may("Transform Serah Farron?", fx.transform())], {
        condition: cond.controls({ types: ["Creature"], legendary: true, other: true }, 2),
        label: "Transform (two other legendary creatures)",
      }),
    ],
  },
  "Crystallized Serah": {
    abilities: [
      costReducer({ types: ["Creature"], legendary: true }, 2, "First legendary creature spell costs {2} less", {
        condition: cond.noLegendaryCreatureCastThisTurn,
      }),
      staticAbility(
        { ...YOURS, legendary: true },
        { power: 2, toughness: 2 },
        { label: "Legendary creatures you control get +2/+2" },
      ),
    ],
  },
  "Esper Origins": {
    castOptions: [flashback("{3}{G}")],
    spell: {
      modes: [
        {
          targets: [],
          effects: [fx.surveil(2), fx.gainLife(2), ...fx.when(cond.spellCastFromGraveyard, fx.resolveToBattlefieldTransformed)],
        },
      ],
    },
  },
  "Summon: Esper Maduin": {
    abilities: [
      chapter([1], [fx.when(cond.refMatches(ref.libraryTop(ref.you), PERMANENT_CARD), fx.toHand(ref.libraryTop(ref.you)))], {
        label: "Top card: a permanent into your hand",
      }),
      chapter([2], [fx.addMana("G", "G")], { label: "Add {G}{G}" }),
      chapter([3], [fx.pumpAll(OTHERS, 2, 2, ["trample"])], { label: "Other creatures you control: +2/+2, trample" }),
    ],
  },
  "Emet-Selch, Unsundered": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) => triggered(t, fx.loot(1), { label: "Draw, then discard" })),
      triggered(when.yourUpkeep, [fx.may("Transform Emet-Selch?", fx.transform())], {
        condition: cond.amountAtLeast(amount.countIn("graveyard"), 14),
        label: "Transform (fourteen cards in your graveyard)",
      }),
    ],
  },
  "Hades, Sorcerer of Eld": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard" },
        condition: cond.yourTurn,
        label: "Echo of the Lost: play from your graveyard",
      }),
      graveyardReplacement({ graveyardOf: "you", label: "Your graveyard is exiled" }),
    ],
  },
  "Crystal Fragments": {
    abilities: [staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }), transformAbility("{5}{W}{W}")],
  },
  "Summon: Alexander": {
    abilities: [
      chapter([1, 2], [fx.preventDamageToYourCreatures], { label: "Damage to your creatures prevented this turn" }),
      chapter([3], [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))], {
        label: "Tap creatures your opponents control",
      }),
    ],
  },
  "Terra, Magical Adept": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(5, ref.you, { name: "t" }),
          fx.pickFromZone("graveyard", { types: ["Enchantment"] }, { to: "hand" }, { pool: ref.stored("t"), min: 0 }),
        ],
        { label: "Mill five, an enchantment into your hand" },
      ),
      transformAbility("{4}{R}{G}", "Trance: exile it, then return it transformed"),
    ],
  },
  "Esper Terra": {
    abilities: [
      chapter(
        [1, 2, 3],
        [
          fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true, store: "copy" }),
          // "Up to three lore counters": from zero to three, put at once on the copy if it is a Saga.
          fx.when(
            cond.refMatches(ref.stored("copy"), { subtype: "Saga" }),
            fx.mayForStore(
              ref.you,
              "Put at least one lore counter on the copy?",
              "lore1",
              fx.mayForStore(ref.you, "At least two counters?", "lore2", fx.mayForStore(ref.you, "Three counters?", "lore3")),
            ),
            fx.counters(ref.stored("copy"), "lore", amount.plus(amount.v("lore1"), amount.v("lore2"), amount.v("lore3"))),
          ),
        ],
        {
          targets: [targetObj("t", { types: ["Enchantment"], legendary: false, controller: "you" }, "nonlegendary enchantment")],
          label: "Copy of an enchantment",
        },
      ),
      chapter([4], [fx.addMana("W", "W", "U", "U", "B", "B", "R", "R", "G", "G"), ...flipBack()], {
        label: "Add two mana of each color",
      }),
    ],
  },
  "Zenos yae Galvus": {
    abilities: [
      // The creature is chosen on resolution (without targeting it); if there is none, the others still get -2/-2.
      triggered(
        when.entersSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }), ref.you, "c", {
            prompt: "Choose a creature an opponent controls",
          }),
          fx.link(ref.stored("c")),
          fx.pump(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], other: true }), ref.stored("c")), -2, -2),
        ],
        { label: "My First Friend" },
      ),
      // "As this creature transforms into Shinryu, choose an opponent" (PLAN-L L4): chosen as the ability resolves,
      // just before it transforms.
      triggered(when.linkedLeaves, [fx.chooseForSelf("player", { optionsFrom: ref.eachOpponent }), fx.transform()], {
        label: "The chosen creature leaves: transform",
      }),
    ],
  },
  "Shinryu, Transcendent Rival": {
    abilities: [
      triggered({ on: "action", action: "playerLost", whose: "chosen" }, [fx.winGame], {
        label: "Burning Chains — the chosen player loses: you win",
      }),
    ],
  },
  "Sidequest: Play Blitzball": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+2/+0",
      }),
      triggered(
        when.step("endCombat"),
        [fx.transform(), fx.reflexive([target.creature("c", { controller: "you" })], [fx.attach(ref.target("c"))])],
        { condition: cond.playerCombatDamageAtLeast(6), label: "Six combat damage: transform, attach" },
      ),
    ],
  },
  "World Champion, Celestial Weapon": {
    abilities: [staticAbility("attached", { power: 2, addKeywords: ["doubleStrike"] }, { label: "+2/+0, double strike" })],
  },
  "Balamb Garden, SeeD Academy": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["G", "U"]),
      activated({
        mana: "{5}{G}{U}",
        tap: true,
        reduction: { generic: amount.count({ ...TOWN, controller: "you", other: true }) },
        effects: [fx.transform()],
        label: "Transform",
      }),
    ],
  },
  "Balamb Garden, Airborne": { abilities: [triggered(when.attacksSelf, [fx.draw(1)], { label: "Draw" })] },

  // --- Meld -------------------------------------------------------------------
  "Fang, Fearless l'Cie": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.draw(1), fx.loseLife(1)], {
        oncePerTurn: true,
        label: "Draw, lose 1 life",
      }),
    ],
  },
  "Vanille, Cheerful l'Cie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(2), fx.pickFromZone("graveyard", PERMANENT_CARD, { to: "hand" }, { prompt: "A permanent card into your hand" })],
        { label: "Mill two, a permanent card into your hand" },
      ),
      triggered(
        when.step("main1"),
        fx.mayPay("{3}{B}{G}", "Pay {3}{B}{G} to meld Vanille and Fang?", fx.meld("Fang, Fearless l'Cie")),
        {
          condition: cond.controls({ types: ["Creature"], name: "Fang, Fearless l'Cie" }),
          label: "Meld them into Ragnarok",
        },
      ),
    ],
  },
  "Ragnarok, Divine Deliverance": {
    abilities: [
      triggered(when.diesSelf, [fx.destroy(ref.target("p")), fx.toBattlefield(ref.target("c"))], {
        targets: [
          targetObj("p", { permanent: true }, "permanent"),
          target.cardInGraveyard("c", { ...PERMANENT_CARD, legendary: false }, "you", "nonlegendary permanent card"),
        ],
        label: "Destroy a permanent, return a permanent card",
      }),
    ],
  },
};
