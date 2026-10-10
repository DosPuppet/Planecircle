import { creature } from "../fdn/common";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  doesntUntap,
  entersWith,
  eventReplacement,
  fx,
  KNIGHT_VIGILANCE,
  playerStatic,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  ZOMBIE,
} from "../woe/common";

const SOLDIER_LIFELINK = creature("Soldier", ["W"], ["Soldier"], 1, 1, { keywords: ["lifelink"] });
const GRIFFIN = creature("Griffin", ["W"], ["Griffin"], 2, 2, { keywords: ["flying"] });
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
/** The player of the event is that very player (not another one): `ref.except(eventPlayer, who)` is empty. */
const eventPlayerIs = (who: Parameters<typeof ref.except>[1]) =>
  cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, who)), 1));
/** "Nonbasic lands are Mountains" (305.7: they lose their abilities). */
const MOUNTAINS = staticAbility(
  { types: ["Land"], basic: false },
  { setSubtypes: ["Mountain"], loseAllAbilities: true },
  {
    label: "ctx:wot|Nonbasic lands are Mountains",
  },
);

export const CARDS: Record<string, CardScript> = {
  // Extort: read from the text.
  "Blind Obedience": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent" },
        label: "Artifacts and creatures your opponents control enter tapped",
      }),
    ],
  },
  // — White —
  "Dawn of Hope": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, fx.mayPay("{2}", "pay {2} to draw", fx.draw(1)), {
        label: "You gain life: pay {2} to draw",
      }),
      activated({ mana: "{3}{W}", effects: [fx.createTokens(SOLDIER_LIFELINK)], label: "A 1/1 Soldier with lifelink" }),
    ],
  },
  "Grasp of Fate": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        // "For each opponent, up to one target nonland permanent that player controls."
        targets: [
          {
            ...target.upTo(
              1,
              target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls (one per opponent)"),
            ),
            differentPlayers: true,
            countAmount: amount.refCount(ref.eachOpponent),
          },
        ],
        label: "Exile up to one nonland permanent of each opponent until this leaves",
      }),
    ],
  },
  "Greater Auramancy": {
    abilities: [
      staticAbility(
        { types: ["Enchantment"], controller: "you", other: true },
        { addKeywords: ["shroud"] },
        {
          label: "Other enchantments you control have shroud",
        },
      ),
      staticAbility(
        { ...YOUR_CREATURES, enchanted: true },
        { addKeywords: ["shroud"] },
        {
          label: "Enchanted creatures you control have shroud",
        },
      ),
    ],
  },
  "Griffin Aerie": {
    abilities: [
      triggered(when.step("end"), [fx.createTokens(GRIFFIN)], {
        condition: cond.lifeGainedAtLeast(3),
        label: "3 life gained this turn: a 2/2 flying Griffin",
      }),
    ],
  },
  "Intangible Virtue": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, token: true },
        { power: 1, toughness: 1, addKeywords: ["vigilance"] },
        {
          label: "Creature tokens you control: +1/+1 and vigilance",
        },
      ),
    ],
  },
  "Knightly Valor": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_VIGILANCE)], { label: "A 2/2 Knight with vigilance" }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["vigilance"] }, { label: "+2/+2 and vigilance" }),
    ],
  },
  "Land Tax": {
    abilities: [
      triggered(when.yourUpkeep, [fx.search(BASIC_LAND, { to: "hand" }, 3)], {
        // An opponent controls more lands: you aren't among the players who control the most.
        condition: cond.amountAtLeast(amount.refCount(ref.except(ref.you, ref.playersWithMost({ types: ["Land"] }))), 1),
        label: "An opponent has more lands: up to three basic lands to hand",
      }),
    ],
  },
  "Leyline of Sanctity": {
    leyline: true,
    abilities: [playerStatic({ hexproof: true, label: "You have hexproof" })],
  },
  "Smothering Tithe": {
    abilities: [
      triggered(when.draw(undefined, "opponent"), [fx.unlessPays(ref.eventPlayer, { mana: "{2}" }, fx.createTokens(TREASURE))], {
        label: "An opponent draws: a Treasure, unless they pay {2}",
      }),
    ],
  },
  // — Blue —
  Compulsion: {
    abilities: [
      activated({ mana: "{1}{U}", discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw" }),
      activated({ mana: "{1}{U}", sacrifice: true, effects: [fx.draw(1)], label: "Sacrifice it: draw" }),
    ],
  },
  "Copy Enchantment": { asEnters: [fx.chooseCopy({ types: ["Enchantment"] }, { anyController: true })] },
  Curiosity: {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(
        { on: "dealsDamage", who: { attached: "host" }, to: { players: "opponent" } },
        fx.may("draw one card", fx.draw(1)),
        { label: "The enchanted creature deals damage to an opponent: you may draw" },
      ),
    ],
  },
  "Forced Fruition": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.draw(7, ref.eventPlayer)], {
        label: "An opponent casts a spell: they draw seven cards",
      }),
    ],
  },
  "Fraying Sanity": {
    enchant: { filter: {}, label: "player", player: true },
    abilities: [
      triggered(
        { on: "step", step: "end", whose: "any" },
        // X: the cards (not the tokens) put into the enchanted player's graveyard this turn, from anywhere.
        [
          fx.mill(
            { kind: "turnEvents", query: { event: "zone", to: "graveyard", byOwner: true, token: false }, of: ref.attached },
            ref.attached,
          ),
        ],
        { label: "The enchanted player mills as many cards as were put into their graveyard this turn" },
      ),
    ],
  },
  "Hatching Plans": {
    abilities: [triggered(when.putIntoGraveyardSelf, [fx.draw(3)], { label: "Put into a graveyard: draw three cards" })],
  },
  "Intruder Alarm": {
    abilities: [
      doesntUntap({ types: ["Creature"] }, { label: "Creatures don't untap" }),
      triggered(when.enters({ types: ["Creature"] }), [fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }))], {
        label: "A creature enters: untap all creatures",
      }),
    ],
  },
  "Kindred Discovery": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(when.enters({ ...YOUR_CREATURES, chosen: "subtype" }), [fx.draw(1)], {
        label: "A creature of the chosen type enters: draw",
      }),
      triggered(when.attacks({ ...YOUR_CREATURES, chosen: "subtype" }), [fx.draw(1)], {
        label: "A creature of the chosen type attacks: draw",
      }),
    ],
  },
  "Leyline of Anticipation": {
    leyline: true,
    abilities: [{ kind: "castPermission", flash: true, label: "You may cast spells as though they had flash" }],
  },
  "Rhystic Study": {
    abilities: [
      triggered(
        when.castSpell("opponent"),
        [fx.unlessPays(ref.eventPlayer, { mana: "{1}" }, fx.may("draw one card", fx.draw(1)))],
        { label: "An opponent casts a spell: you may draw, unless they pay {1}" },
      ),
    ],
  },
  "Spreading Seas": {
    enchant: { filter: { types: ["Land"] }, label: "land" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      staticAbility(
        "attached",
        { setSubtypes: ["Island"], loseAllAbilities: true },
        { label: "The enchanted land is an Island" },
      ),
    ],
  },
  // — Black —
  "Dark Tutelage": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "d" }), fx.loseLife(amount.manaValueOf(ref.stored("d")))],
        { label: "The top card to hand; lose life equal to its mana value" },
      ),
    ],
  },
  "Grave Pact": {
    abilities: [
      triggered(when.dies(YOUR_CREATURES), [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        label: "A creature you control dies: each other player sacrifices a creature",
      }),
    ],
  },
  Oppression: {
    abilities: [
      triggered(when.castSpell("any"), [fx.discard(1, ref.eventPlayer)], {
        label: "A player casts a spell: they discard a card",
      }),
    ],
  },
  "Oversold Cemetery": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toHand(ref.target())], {
        targets: [
          target.optional(target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card from your graveyard")),
        ],
        condition: cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 4),
        label: "Four creature cards in the graveyard: return one to hand",
      }),
    ],
  },
  "Polluted Bonds": {
    abilities: [
      triggered(
        when.enters({ types: ["Land"], controller: "opponent" }),
        [fx.loseLife(2, ref.controllerOf(ref.eventObject)), fx.gainLife(2)],
        { label: "A land an opponent controls enters: its controller loses 2 life, you gain 2" },
      ),
    ],
  },
  "Sanguine Bond": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "You gain life: target opponent loses that much",
      }),
    ],
  },
  "Stab Wound": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { power: -2, toughness: -2 }, { label: "−2/−2" }),
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.loseLife(2, ref.controllerOf(ref.attached))], {
        condition: eventPlayerIs(ref.controllerOf(ref.attached)),
        label: "Upkeep of the enchanted creature's controller: they lose 2 life",
      }),
    ],
  },
  "Waste Not": {
    abilities: [
      triggered(when.discard("opponent"), [fx.createTokens(ZOMBIE)], {
        condition: cond.refMatches(ref.eventObject, { types: ["Creature"] }),
        label: "An opponent discards a creature: a 2/2 Zombie",
      }),
      triggered(when.discard("opponent"), [fx.addMana("B", "B")], {
        condition: cond.refMatches(ref.eventObject, { types: ["Land"] }),
        label: "An opponent discards a land: {B}{B}",
      }),
      triggered(when.discard("opponent"), [fx.draw(1)], {
        condition: cond.refMatches(ref.eventObject, { notTypes: ["Creature", "Land"] }),
        label: "An opponent discards another card: draw",
      }),
    ],
  },
  // — Red —
  "Aggravated Assault": {
    abilities: [
      activated({
        mana: "{3}{R}{R}",
        sorcerySpeed: true,
        effects: [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombatAfterMain],
        label: "Untap your creatures; an additional combat and main phase",
      }),
    ],
  },
  "Blood Moon": { abilities: [MOUNTAINS] },
  "Dragon Mantle": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      staticAbility(
        "attached",
        { addAbilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })] },
        { label: '"{R}: +1/+0"' },
      ),
    ],
  },
  "Fiery Emancipation": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        modify: { times: 3 },
        label: "Your sources deal triple damage",
      }),
    ],
  },
  "Goblin Bombardment": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "Sacrifice a creature: 1 damage to any target",
      }),
    ],
  },
  "Leyline of Lightning": {
    leyline: true,
    abilities: [
      triggered(when.castSpell("you"), fx.mayPay("{1}", "pay {1} for 1 damage", fx.damage(1, ref.target())), {
        targets: [{ id: "t", label: "player or planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
        label: "You cast a spell: pay {1} for 1 damage",
      }),
    ],
  },
  "Mana Flare": {
    abilities: [
      eventReplacement({
        event: "mana",
        source: { types: ["Land"] },
        modify: { add: 1 },
        label: "A land tapped for mana produces an additional one",
      }),
    ],
  },
  "Raid Bombardment": {
    abilities: [
      // "The player or planeswalker that creature is attacking": the one of the attack event.
      triggered(when.attacks({ ...YOUR_CREATURES, maxPower: 2 }), [fx.damage(1, ref.eventPlayer)], {
        label: "A creature you control with power 2 or less attacks: 1 damage to what it's attacking",
      }),
    ],
  },
  Repercussion: {
    abilities: [
      triggered(when.dealtDamage({ types: ["Creature"] }), [fx.damage(amount.eventAmount, ref.controllerOf(ref.eventObject))], {
        label: "A creature is dealt damage: that much to its controller",
      }),
    ],
  },
  "Sneak Attack": {
    abilities: [
      activated({
        mana: "{R}",
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield", addKeywords: ["haste"] },
            { count: 1, min: 0, store: "s" },
          ),
          fx.delayed([fx.sacrificeIt(ref.target("s"))], { s: ref.stored("s") }),
        ],
        label: "Put a creature from your hand onto the battlefield with haste; sacrificed at the end step",
      }),
    ],
  },
  // — Green —
  "Defense of the Heart": {
    abilities: [
      triggered(when.yourUpkeep, [fx.sacrificeIt(ref.self), fx.search({ types: ["Creature"] }, { to: "battlefield" }, 2)], {
        condition: cond.amountAtLeast(
          amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Creature"] }, 3))),
          1,
        ),
        label: "An opponent has three creatures: sacrifice it, two creatures from your library",
      }),
    ],
  },
  "Hardened Scales": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "An additional +1/+1 counter on your creatures",
      }),
    ],
  },
  "Leyline of Abundance": {
    leyline: true,
    abilities: [
      eventReplacement({
        event: "mana",
        source: { types: ["Creature"], controller: "you" },
        extraMana: "G",
        modify: { add: 1 },
        label: "A creature you control tapped for mana: an additional {G}",
      }),
      activated({
        mana: "{6}{G}{G}",
        effects: [fx.addCountersAll(YOUR_CREATURES, 1)],
        label: "A +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Nature's Will": {
    abilities: [
      triggered(
        { on: "combatDamageBatch", who: YOUR_CREATURES },
        [
          fx.tap(ref.permanentsOf(ref.eventPlayer, { types: ["Land"] })),
          fx.untap(ref.permanentsOf(ref.you, { types: ["Land"] })),
        ],
        { label: "Your creatures deal combat damage to a player: tap their lands, untap yours" },
      ),
    ],
  },
  "Parallel Lives": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Your tokens are created twice over" }),
    ],
  },
  "Primal Vigor": {
    abilities: [
      eventReplacement({ event: "tokens", modify: { times: 2 }, label: "Tokens are created twice over" }),
      eventReplacement({
        event: "counters",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "+1/+1 counters are doubled",
      }),
    ],
  },
  "Prismatic Omen": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addSubtypes: ["Plains", "Island", "Swamp", "Mountain", "Forest"] },
        { label: "Lands you control have every basic land type" },
      ),
    ],
  },
  "Season of Growth": {
    abilities: [
      triggered(when.enters(YOUR_CREATURES), [fx.scry(1)], { label: "A creature you control enters: scry 1" }),
      triggered(when.castSpell("you", undefined, { objects: YOUR_CREATURES }), [fx.draw(1)], {
        label: "You cast a spell that targets a creature you control: draw",
      }),
    ],
  },
  "Unnatural Growth": {
    abilities: [
      triggered(
        { on: "step", step: "beginCombat", whose: "any" },
        [fx.doublePT(ref.permanentsOf(ref.you, { types: ["Creature"] }))],
        {
          label: "Beginning of each combat: double the power and toughness of your creatures",
        },
      ),
    ],
  },
  "Utopia Sprawl": {
    enchant: { filter: { types: ["Land"], subtype: "Forest" }, label: "Forest" },
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      eventReplacement({
        event: "mana",
        source: { attached: "host" },
        extraMana: "chosen",
        modify: { add: 1 },
        label: "The enchanted Forest tapped for mana: an additional mana of the chosen color",
      }),
    ],
  },
  "Phyrexian Unlife": {
    abilities: [
      playerStatic({
        cantLose: "life",
        infectDamageAtZeroLife: true,
        label:
          "You don't lose for having 0 or less life; at 0 or less life, damage is dealt to you as though its source had infect",
      }),
    ],
  },
  "Ground Seal": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Enters: draw a card" }),
      playerStatic({
        cantTargetGraveyardCards: true,
        affects: "each",
        label: "Cards in graveyards can't be the targets of spells or abilities",
      }),
    ],
  },
  "Shared Animosity": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], controller: "you" }),
        [
          fx.pump(
            ref.eventObject,
            amount.refCount(
              ref.except(
                ref.zone("battlefield", ref.eachPlayer, {
                  types: ["Creature"],
                  attacking: true,
                  shares: { what: "creatureType", with: ref.eventObject },
                }),
                ref.eventObject,
              ),
            ),
            0,
          ),
        ],
        { label: "A creature you control attacks: +1/+0 for each other attacker that shares a creature type with it" },
      ),
    ],
  },
  "Karmic Justice": {
    abilities: [
      triggered(
        when.destroyedByOpponent({ notTypes: ["Creature"], controller: "you" }),
        fx.may("Destroy a permanent of that opponent?", fx.destroy(ref.target())),
        {
          targets: [target.of(ref.eventPlayer, { id: "t", filter: { objects: {} } }, "permanent of that opponent")],
          label: "An opponent destroys a noncreature permanent you control: you may destroy one of their permanents",
        },
      ),
    ],
  },
  "As Foretold": {
    abilities: [
      triggered(when.yourUpkeep, [fx.counters(ref.self, "time", 1)], { label: "Upkeep: a time counter" }),
      {
        kind: "castPermission",
        freeFrom: "any",
        freeOncePerTurn: true,
        freeFilter: { compare: [cmp.manaValue("<=", amount.lkiCounters("time"))] },
        label: "Once each turn: {0} rather than the cost of a spell with mana value at most the number of time counters",
      },
    ],
  },
  Necropotence: {
    abilities: [
      playerStatic({ skips: "drawStep", label: "Skip your draw step" }),
      triggered({ on: "discard", whose: "you" }, [fx.exileCard(ref.eventObject)], {
        label: "You discard a card: exile it from your graveyard",
      }),
      activated({
        payLife: 1,
        effects: [
          fx.exileTop(ref.you, 1, "n", "you"),
          fx.delayedAt("yourEndStep", [fx.toHand(ref.target("n"))], { n: ref.stored("n") }),
        ],
        label: "Pay 1 life: exile the top card face down; it goes to your hand at your next end step",
      }),
    ],
  },
};
