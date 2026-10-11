/** Special Guests (SPG): card scripts (PLAN-G). */
import { type Effect, msg, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cmp,
  cond,
  doesntUntap,
  entersWith,
  escalate,
  eventReplacement,
  fx,
  graveyardReplacement,
  investigate,
  loyalty,
  manaAbility,
  modal,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TO_CREATURE,
  TREASURE,
  target,
  triggered,
  when,
  ZOMBIE,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const RHINO: TokenSpec = {
  name: "Rhino",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Rhino"],
  power: 4,
  toughness: 4,
  keywords: ["trample"],
};
const CAT_WARRIOR: TokenSpec = {
  name: "Cat Warrior",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Cat", "Warrior"],
  power: 2,
  toughness: 2,
  abilities: [blockAbility(block.landwalk("Forest", "Forestwalk"))],
};
/** "… mana value less than or equal to the number of cards in its controller's graveyard" (on resolution). */
const DROWNABLE = (t: string) =>
  cond.amountAtLeast(
    amount.plus(amount.refCount(ref.graveyardOf(ref.controllerOf(ref.target(t)))), amount.neg(amount.manaValueOf(ref.target(t)))),
    0,
  );
const GOLEM_3: TokenSpec = {
  name: "Golem",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Golem"],
  power: 3,
  toughness: 3,
};
const SPIRIT_CLERIC: TokenSpec = {
  name: "Spirit Cleric",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Spirit", "Cleric"],
  power: 0,
  toughness: 0,
  cdaPT: amount.count({ subtype: "Spirit", controller: "you" }),
};
const ELDRAZI_SCION: TokenSpec = {
  name: "Eldrazi Scion",
  colors: [],
  types: ["Creature"],
  subtypes: ["Eldrazi", "Scion"],
  power: 1,
  toughness: 1,
  abilities: [manaAbility("C", 1, { sacrifice: true, noTap: true })],
};
const FAERIE_ROGUE: TokenSpec = {
  name: "Faerie Rogue",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Faerie", "Rogue"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** Zendikar "fetch" lands: {T}, 1 life, sacrifice: a [type] or [type] card onto the battlefield. */
const fetchland = (a: string, b: string, label: string): CardScript => ({
  abilities: [
    activated({
      tap: true,
      payLife: 1,
      sacrifice: true,
      effects: [fx.search({ types: ["Land"], anySubtype: [a, b] }, { to: "battlefield" })],
      label,
    }),
  ],
});
const BIRD_ILLUSION: TokenSpec = {
  name: "Bird Illusion",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird", "Illusion"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
const INSTANT_OR_SORCERY = { types: ["Instant" as const, "Sorcery" as const] };
/** Expropriate: the two options of the vote (their effects come after all the votes). */
const VOTES = [msg("Time (an extra turn for the caster)"), msg("Money (the caster takes a permanent of the voter)")];
/** "Activate only if you have exactly seven cards in hand" (Library of Alexandria). */
const SEVEN_IN_HAND = cond.all(
  cond.amountAtLeast(amount.countIn("hand", {}), 7),
  cond.not(cond.amountAtLeast(amount.countIn("hand", {}), 8)),
);
const sevenCardsDraw = (): CardScript => ({
  abilities: [
    manaAbility("C"),
    activated({
      tap: true,
      activationCondition: SEVEN_IN_HAND,
      effects: [fx.draw(1)],
      label: "Draw (exactly seven cards in hand)",
    }),
  ],
});
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
const FIRST_INSTANT = (n: number) => cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Instant"] }), n);

/**
 * Champion (702.72): "When this creature enters, sacrifice it unless you exile another [filter] you control; when it
 * leaves the battlefield, the card returns". `then`: what follows when an object was championed.
 */
function champion(filter: ObjectFilter, label: string, then: Effect[] = []) {
  const championed = cond.amountAtLeast(amount.refCount(ref.stored("champ")), 1);
  return triggered(
    when.entersSelf,
    [
      fx.chooseAmong(ref.permanentsOf(ref.you, { ...filter, other: true }), ref.you, "champ", {
        optional: true,
        prompt: msg("Champion: exile {what} you control (otherwise, sacrifice this creature)", { what: label }),
      }),
      fx.exileUntilLeaves(ref.stored("champ")),
      ...fx.when(cond.not(championed), fx.sacrificeIt(ref.self)),
      ...(then.length ? fx.when(championed, then) : []),
    ],
    { label: msg("Champion: {what}", { what: label }) },
  );
}

export const CARDS: Record<string, CardScript> = {
  "Chrome Mox": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.you, { notTypes: ["Artifact", "Land"] }, false, undefined, true)], {
        label: "Imprint: you may exile a nonartifact, nonland card from your hand",
      }),
      manaAbility(["W", "U", "B", "R", "G"], 1, { linkedColors: true }),
    ],
  },
  // Affinity for artifacts: read from the text.
  Frogmite: {},
  "Galvanic Blast": {
    // Metalcraft: 4 damage instead of 2 if you control three or more artifacts (on resolution).
    spell: spell(
      [target.any()],
      [
        ...fx.when(cond.controls({ types: ["Artifact"], controller: "you" }, 3), fx.damage(4, ref.target())),
        ...fx.when(cond.not(cond.controls({ types: ["Artifact"], controller: "you" }, 3)), fx.damage(2, ref.target())),
      ],
    ),
  },
  "Helix Pinnacle": {
    // Shroud: read from the text.
    abilities: [
      activated({ mana: "{X}", effects: [fx.counters(ref.self, "tower", amount.x)], label: "X tower counters" }),
      triggered(when.yourUpkeep, [fx.winGame], {
        condition: cond.amountAtLeast(amount.countersOn(ref.self, "tower"), 100),
        label: "100 or more tower counters: you win the game",
      }),
    ],
  },
  "Mistbind Clique": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Faerie" }, msg("a Faerie"), [
        fx.reflexive([target.player("p")], [fx.tap(ref.permanentsOf(ref.target("p"), { types: ["Land"] }))]),
      ]),
    ],
  },
  // Affinity for artifacts: read from the text.
  Thoughtcast: { spell: spell([], [fx.draw(2)]) },
  "Wanderwine Prophets": {
    abilities: [
      champion({ types: ["Creature"], subtype: "Merfolk" }, msg("a Merfolk")),
      triggered(
        when.combatDamageToPlayer,
        [fx.sacrifice(ref.you, { subtype: "Merfolk" }, 1, { optional: true, store: "m" }), ...fx.when(cond.v("m"), fx.extraTurn)],
        { label: "You may sacrifice a Merfolk: an extra turn" },
      ),
    ],
  },
  // — G4a: Special Guests of LCI, MKM and OTJ —
  "Lord of Atlantis": {
    abilities: [
      staticAbility(
        { subtype: "Merfolk", other: true },
        { power: 1, toughness: 1, addBlockRules: [block.landwalk("Island", "Islandwalk")] },
        { label: "Other Merfolk: +1/+1 and islandwalk" },
      ),
    ],
  },
  "Bridge from Below": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], token: false, owner: "you" }), [fx.createTokens(ZOMBIE)], {
        fromGraveyard: true,
        label: "From your graveyard: a nontoken creature is put into your graveyard, a 2/2 Zombie",
      }),
      triggered(when.dies({ types: ["Creature"], owner: "opponent" }), [fx.exileCard(ref.selfCard)], {
        fromGraveyard: true,
        label: "From your graveyard: a creature is put into an opponent's graveyard, exile this card",
      }),
    ],
  },
  "Mephidross Vampire": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you" },
        {
          addSubtypes: ["Vampire"],
          addAbilities: [
            triggered(when.dealsDamage("self", { to: TO_CREATURE }), [fx.addCounters(ref.self, 1)], {
              label: "Deals damage to a creature: a +1/+1 counter",
            }),
          ],
        },
        { label: "Your creatures are Vampires that grow by dealing damage to creatures" },
      ),
    ],
  },
  "Pitiless Plunderer": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", other: true }), [fx.createTokens(TREASURE)], {
        label: "Another creature you control dies: a Treasure",
      }),
    ],
  },
  // Menace: read from the text.
  "Rampaging Ferocidon": {
    abilities: [
      playerStatic({ cantGainLife: true, affects: "each", label: "Players can't gain life" }),
      triggered(when.enters({ types: ["Creature"], other: true }), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "Another creature enters: 1 damage to its controller",
      }),
    ],
  },
  // Trample, hexproof: read from the text.
  "Carnage Tyrant": { cantBeCountered: true },
  Polyraptor: {
    abilities: [triggered(when.isDealtDamage, [fx.copyToken(ref.self)], { label: "Enrage: a token copy" })],
  },
  "Kalamax, the Stormsire": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant"] }), [fx.copySpell(ref.eventObject, 1)], {
        condition: cond.all(cond.sourceMatches({ tapped: true }), FIRST_INSTANT(1), cond.not(FIRST_INSTANT(2))),
        label: "First instant of the turn, Kalamax tapped: copy it",
      }),
      triggered(when.copySpell({ types: ["Instant"] }), [fx.addCounters(ref.self, 1)], {
        label: "You copy an instant: a +1/+1 counter",
      }),
    ],
  },
  "Lord Windgrace": {
    abilities: [
      loyalty(2, {
        effects: [
          fx.discard(1, ref.you, { store: "l", storeFilter: { types: ["Land"] } }),
          fx.draw(1),
          ...fx.when(cond.v("l"), fx.draw(1)),
        ],
        label: "Discard, draw (one more if it was a land)",
      }),
      loyalty(-3, {
        targets: [target.upTo(2, target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard"))],
        effects: [fx.toBattlefield(ref.target())],
        label: "Up to two lands from your graveyard onto the battlefield",
      }),
      loyalty(-11, {
        targets: [target.upTo(6, target.nonland("t"))],
        effects: [fx.destroy(ref.target()), fx.createTokens(CAT_WARRIOR, 6)],
        label: "Destroy up to six nonland permanents; six Cat Warriors",
      }),
    ],
  },
  "Mana Crypt": {
    abilities: [
      triggered(when.yourUpkeep, [fx.coinFlip("f"), ...fx.when(cond.not(cond.v("f")), fx.damage(3, ref.you))], {
        label: "Coin flip: lost, 3 damage to you",
      }),
      manaAbility("C", 2),
    ],
  },
  "Star Compass": {
    abilities: [entersWith({ tapped: true, label: "Enters tapped" }), manaAbility([...ANY], 1, { likeLands: { basic: true } })],
  },
  "Ghostly Prison": {
    abilities: [playerStatic({ attackTax: 2, label: "Pay {2} for each creature attacking you" })],
  },
  Fabricate: { spell: spell([], [fx.search({ types: ["Artifact"] }, { to: "hand" })]) },
  "Show and Tell": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }, { types: ["Land"] }] },
          { to: "battlefield" },
          {
            who: ref.eachPlayer,
            count: 1,
            min: 0,
            prompt: "You may put an artifact, a creature, an enchantment or a land",
          },
        ),
      ],
    ),
  },
  "Tragic Slip": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(cond.morbid, fx.pump(ref.target(), -13, -13)),
        ...fx.when(cond.not(cond.morbid), fx.pump(ref.target(), -1, -1)),
      ],
    ),
  },
  Victimize: {
    spell: spell(
      [target.exactly(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard"))],
      [
        fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { store: "s" }),
        ...fx.when(cond.v("s"), fx.toBattlefield(ref.target(), { tapped: true })),
      ],
    ),
  },
  Gamble: { spell: spell([], [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })]) },
  // Suspend 4—{G}: read from the text.
  "Crashing Footfalls": { spell: spell([], [fx.createTokens(RHINO, 2)]) },
  "Tireless Tracker": {
    abilities: [
      triggered(when.enters({ types: ["Land"], controller: "you" }), [investigate()], { label: "Landfall: investigate" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.addCounters(ref.self, 1)], {
        label: "You sacrifice a Clue: a +1/+1 counter",
      }),
    ],
  },
  "Drown in the Loch": {
    spell: modal(
      mode("Counter target spell", [target.spell("s")], [...fx.when(DROWNABLE("s"), fx.counter(ref.target("s")))]),
      mode("Destroy target creature", [target.creature("c")], [...fx.when(DROWNABLE("c"), fx.destroy(ref.target("c")))]),
    ),
  },
  "Field of the Dead": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      manaAbility("C"),
      triggered(when.enters({ types: ["Land"], controller: "you" }), [fx.createTokens(ZOMBIE)], {
        condition: cond.amountAtLeast(amount.distinctNames({ types: ["Land"], controller: "you" }), 7),
        label: "Seven lands with different names: a 2/2 Zombie",
      }),
    ],
  },
  "Stoneforge Mystic": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Artifact"], subtype: "Equipment" }, { to: "hand" })], {
        label: "Search for an Equipment card",
      }),
      activated({
        mana: "{1}{W}",
        tap: true,
        effects: [
          fx.pickFromZone("hand", { types: ["Artifact"], subtype: "Equipment" }, { to: "battlefield" }, { count: 1, min: 0 }),
        ],
        label: "You may put an Equipment from your hand onto the battlefield",
      }),
    ],
  },
  // Flash, flying: read from the text.
  "Brazen Borrower": {
    abilities: [blockAbility(block.onlyBlocks({ keyword: "flying" }, "Blocks only creatures with flying"))],
  },
  "Petty Theft": {
    spell: spell(
      [target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls")],
      [fx.bounce(ref.target())],
    ),
  },
  Desertion: {
    spell: spell(
      [target.spell()],
      [
        fx.counter(ref.target(), undefined, "d"),
        fx.toBattlefield(ref.filtered(ref.stored("d"), { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }), {
          underYourControl: true,
        }),
      ],
    ),
  },
  "Morbid Opportunist": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.draw(1)], {
        oncePerTurn: true,
        batched: true,
        label: "One or more other creatures die: draw (once each turn)",
      }),
    ],
  },
  "Port Razer": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombat], {
        label: "Untap your creatures; an additional combat phase",
      }),
      blockAbility(block.notSameDefenderTwice),
    ],
  },
  Scapeshift: {
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"] }), ref.you, "s", {
          anyNumber: true,
          prompt: "Sacrifice any number of lands",
        }),
        fx.sacrificeIt(ref.stored("s")),
        fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, amount.refCount(ref.stored("s"))),
      ],
    ),
  },
  // Flash: read from the text.
  "Mystic Snake": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target())], { targets: [target.spell()], label: "Counter target spell" }),
    ],
  },
  Desert: {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        activationCondition: cond.step("endCombat"),
        targets: [target.creature("t", { attacking: true })],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage to target attacking creature (end of combat)",
      }),
    ],
  },
  "Prismatic Vista": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield" })],
        label: "Search for a basic land card",
      }),
    ],
  },
  // — G4b: Special Guests of BLB, DSK, FDN and DFT —
  "Swords to Plowshares": {
    spell: spell(
      [target.creature()],
      [fx.gainLife(amount.powerOf(ref.target()), ref.controllerOf(ref.target())), fx.exile(ref.target())],
    ),
  },
  // Flying: read from the text.
  "Ledger Shredder": {
    abilities: [
      triggered({ on: "castSpell", by: "any", nth: 2 }, [fx.connive(ref.self)], {
        label: "A player casts their second spell of the turn: connive",
      }),
    ],
  },
  "Rat Colony": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { subtype: "Rat", controller: "you", other: true }, label: "+1/+0 for each other Rat" },
      ),
    ],
  },
  "Relentless Rats": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { name: "Relentless Rats", other: true }, label: "+1/+1 for each other Relentless Rats" },
      ),
    ],
  },
  "Kindred Charge": {
    spell: spell(
      [],
      [
        fx.chooseForSelf("creatureType"),
        fx.copyToken(ref.permanentsOf(ref.you, { types: ["Creature"], chosen: "subtype" }), {
          addKeywords: ["haste"],
          exileAtEndStep: true,
        }),
      ],
    ),
  },
  "Sylvan Tutor": { spell: spell([], [fx.search({ types: ["Creature"] }, { to: "libraryTop" })]) },
  // Indestructible: read from the text.
  "Toski, Bearer of Secrets": {
    cantBeCountered: true,
    abilities: [
      staticAbility("self", { addKeywords: ["mustAttack"] }, { label: "Attacks each combat if able" }),
      triggered(when.combatDamage(YOUR_CREATURES, true), [fx.draw(1)], {
        label: "One of your creatures deals damage to a player: draw",
      }),
    ],
  },
  // Equip {2}: read from the text.
  "Sword of Fire and Ice": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [
            protection.from({ colors: ["R"] }, "Protection from red"),
            protection.from({ colors: ["U"] }, "Protection from blue"),
          ],
        },
        { label: "+2/+2, protection from red and from blue" },
      ),
      triggered(when.combatDamage({ types: ["Creature"], attached: "host" }, true), [fx.damage(2, ref.target()), fx.draw(1)], {
        targets: [target.any()],
        label: "2 damage to any target and draw",
      }),
    ],
  },
  "Hallowed Haunting": {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        { addKeywords: ["flying", "vigilance"] },
        {
          condition: cond.controls({ types: ["Enchantment"], controller: "you" }, 7),
          label: "Seven enchantments: your creatures have flying and vigilance",
        },
      ),
      triggered(when.castSpell("you", { types: ["Enchantment"] }), [fx.createTokens(SPIRIT_CLERIC)], {
        label: "Enchantment spell: a Spirit Cleric",
      }),
    ],
  },
  "Soul Warden": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], other: true }), [fx.gainLife(1)], {
        label: "Another creature enters: gain 1 life",
      }),
    ],
  },
  Damnation: { spell: spell([], [fx.destroyAll({ types: ["Creature"] }, undefined, true)]) },
  Sacrifice: {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.addManaChoice(amount.manaValueOf(ref.costSacrificed), ["B"])]),
  },
  "Unholy Heat": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [...fx.when(cond.delirium, fx.damage(6, ref.target())), ...fx.when(cond.not(cond.delirium), fx.damage(2, ref.target()))],
    ),
  },
  "Collected Company": {
    spell: spell(
      [],
      [
        fx.lookAtTop(6, {
          filter: { types: ["Creature"], maxManaValue: 3 },
          count: 2,
          to: { to: "battlefield" },
          rest: "bottom",
        }),
      ],
    ),
  },
  Condemn: {
    spell: spell(
      [target.creature("t", { attacking: true })],
      [
        fx.gainLife(amount.toughnessOf(ref.target()), ref.controllerOf(ref.target())),
        fx.moveTo(ref.target(), { to: "libraryBottom" }),
      ],
    ),
  },
  "Grim Tutor": { spell: spell([], [fx.search({}, { to: "hand" }), fx.loseLife(3)]) },
  // Flash, equip {3}: read from the text.
  Embercleave: {
    costReduction: { generic: amount.count({ types: ["Creature"], controller: "you", attacking: true }) },
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to one of your creatures",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["doubleStrike", "trample"] },
        {
          label: "+1/+1, double strike and trample",
        },
      ),
    ],
  },
  "Goblin Bushwhacker": {
    kicker: "{R}",
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(YOUR_CREATURES, 1, 0, ["haste"])], {
        condition: cond.kicked,
        label: "Kicked: your creatures get +1/+0 and gain haste",
      }),
    ],
  },
  "Paradise Druid": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ tapped: false }),
          label: "Hexproof as long as it's untapped",
        },
      ),
      manaAbility([...ANY]),
    ],
  },
  "Akroma's Memorial": {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        {
          addKeywords: ["flying", "firstStrike", "vigilance", "trample", "haste"],
          addProtections: [
            protection.from({ colors: ["B"] }, "Protection from black"),
            protection.from({ colors: ["R"] }, "Protection from red"),
          ],
        },
        { label: "Your creatures: flying, first strike, vigilance, trample, haste, protection from black and from red" },
      ),
    ],
  },
  "Temporal Manipulation": { spell: spell([], [fx.extraTurn]) },
  "Fiend Artisan": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 for each creature card in your graveyard" },
      ),
      activated({
        mana: "{X}{B/G}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        sorcerySpeed: true,
        effects: [fx.search({ types: ["Creature"], compare: [cmp.manaValue("<=", amount.x)] }, { to: "battlefield" })],
        label: "Search for a creature with mana value X or less",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Cavalier of Dawn": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target()), fx.createTokens(GOLEM_3, 1, ref.controllerOf(ref.target()))], {
        targets: [target.optional(target.nonland("t"))],
        label: "Destroy up to one nonland permanent; its controller creates a 3/3 Golem",
      }),
      triggered(when.diesSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] },
            "you",
            "artifact or enchantment card in your graveyard",
          ),
        ],
        label: "Return an artifact or enchantment card from your graveyard",
      }),
    ],
  },
  // Improvise: read from the text.
  "Whir of Invention": {
    spell: spell([], [fx.search({ types: ["Artifact"], compare: [cmp.manaValue("<=", amount.x)] }, { to: "battlefield" })]),
  },
  "Bone Miser": {
    abilities: [
      triggered(when.discard("you"), [fx.createTokens(ZOMBIE)], {
        condition: cond.refMatches(ref.eventObject, { types: ["Creature"] }),
        label: "You discard a creature card: a 2/2 Zombie",
      }),
      triggered(when.discard("you"), [fx.addMana("B", "B")], {
        condition: cond.refMatches(ref.eventObject, { types: ["Land"] }),
        label: "You discard a land card: {B}{B}",
      }),
      triggered(when.discard("you"), [fx.draw(1)], {
        condition: cond.refMatches(ref.eventObject, { notTypes: ["Creature", "Land"] }),
        label: "You discard another card: draw",
      }),
    ],
  },
  "Lord of the Undead": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Zombie", other: true },
        { power: 1, toughness: 1 },
        { label: "Other Zombies: +1/+1" },
      ),
      activated({
        mana: "{1}{B}",
        tap: true,
        targets: [target.cardInGraveyard("t", { subtype: "Zombie" }, "you", "Zombie card in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a Zombie card from your graveyard",
      }),
    ],
  },
  "Chandra's Ignition": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damage(
          amount.powerOf(ref.target()),
          ref.union(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.target()), ref.eachOpponent),
          ref.target(),
        ),
      ],
    ),
  },
  "Pathbreaker Ibex": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.pumpAll(YOUR_CREATURES, amount.maxPower(YOUR_CREATURES), amount.maxPower(YOUR_CREATURES), ["trample"])],
        { label: "Your creatures gain trample and get +X/+X (X: the greatest power)" },
      ),
    ],
  },
  // Flying, crew 3: read from the text.
  "Skysovereign, Consul Flagship": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "3 damage to a creature or planeswalker an opponent controls",
      }),
      triggered(when.attacksSelf, [fx.damage(3, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "3 damage to a creature or planeswalker an opponent controls",
      }),
    ],
  },
  // — G4c: Special Guests of TDM, EOE and ECL —
  "Eerie Ultimatum": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "battlefield" },
          {
            count: 99,
            min: 0,
            differentNames: true,
            prompt: "Permanent cards with different names to return to the battlefield",
          },
        ),
      ],
    ),
  },
  "Emergent Ultimatum": {
    spell: spell(
      [],
      [
        { op: "search", filter: { colorCount: 1 }, count: 3, to: { to: "exile" }, store: "e", distinctNames: true },
        fx.chooseAmong(ref.stored("e"), ref.eachOpponent, "o", {
          prompt: "Choose the card that returns to its library",
        }),
        fx.moveTo(ref.stored("o"), { to: "libraryTop" }),
        fx.shuffle(ref.you),
        fx.castNow(ref.except(ref.stored("e"), ref.stored("o")), { free: true, many: true }),
        fx.exileOnResolve,
      ],
    ),
  },
  "Genesis Ultimatum": {
    spell: spell(
      [],
      [fx.lookAtTop(5, { filter: { permanent: true }, count: 5, to: { to: "battlefield" }, rest: "hand" }), fx.exileOnResolve],
    ),
  },
  "Inspired Ultimatum": {
    spell: spell(
      [target.player("p"), { ...target.any("t") }],
      [fx.gainLife(5, ref.target("p")), fx.damage(5, ref.target("t")), fx.draw(5)],
    ),
  },
  "Ruinous Ultimatum": {
    spell: spell([], [fx.destroy(ref.permanentsOf(ref.eachOpponent, { notTypes: ["Land"] }))]),
  },
  "Arid Mesa": fetchland("Mountain", "Plains", "Search for a Mountain or Plains card"),
  "Marsh Flats": fetchland("Plains", "Swamp", "Search for a Plains or Swamp card"),
  "Misty Rainforest": fetchland("Forest", "Island", "Search for a Forest or Island card"),
  "Scalding Tarn": fetchland("Island", "Mountain", "Search for an Island or Mountain card"),
  "Verdant Catacombs": fetchland("Swamp", "Forest", "Search for a Swamp or Forest card"),
  "Warping Wail": {
    spell: modal(
      mode(
        "Exile a creature with power or toughness 1 or less",
        [target.creature("c", { anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] })],
        [fx.exile(ref.target("c"))],
      ),
      mode(
        "Counter target sorcery spell",
        [target.spell("s", { types: ["Sorcery"] }, "sorcery spell")],
        [fx.counter(ref.target("s"))],
      ),
      mode("Create a 1/1 Eldrazi Scion", [], [fx.createTokens(ELDRAZI_SCION)]),
    ),
  },
  "Deafening Silence": {
    abilities: [
      playerStatic({
        castLimit: { who: "each", maxSpells: 1, spellTypes: { notTypes: ["Creature"] } },
        label: "Each player: only one noncreature spell each turn",
      }),
    ],
  },
  "Nexus of Fate": { shuffleIntoLibrary: true, spell: spell([], [fx.extraTurn]) },
  "Paradox Haze": {
    enchant: { filter: {}, label: "player", player: true },
    abilities: [
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.extraUpkeeps(1, true)], {
        condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.attached)), 1)),
        oncePerTurn: true,
        label: "First upkeep of the enchanted player: an additional upkeep step",
      }),
    ],
  },
  Darkness: { spell: spell([], [fx.thisTurn({ replacement: { event: "damage", combat: true, modify: { prevent: true } } })]) },
  "Magus of the Moon": {
    abilities: [
      staticAbility(
        { types: ["Land"], basic: false },
        { setSubtypes: ["Mountain"], loseAllAbilities: true },
        {
          label: "Each nonbasic land is a Mountain",
        },
      ),
    ],
  },
  Burgeoning: {
    abilities: [
      triggered(
        { on: "playLand", whose: "opponent" },
        [fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield" }, { count: 1, min: 0 })],
        { label: "An opponent plays a land: you may put a land from your hand" },
      ),
    ],
  },
  "Green Sun's Zenith": {
    // "Shuffle Green Sun's Zenith into its owner's library": as it resolves only (countered, it goes to the graveyard).
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], colors: ["G"], compare: [cmp.manaValue("<=", amount.x)] }, { to: "battlefield" }),
        fx.shuffleOnResolve,
      ],
    ),
  },
  "Sliver Overlord": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.search({ subtype: "Sliver" }, { to: "hand" })],
        label: "Search for a Sliver card",
      }),
      activated({
        mana: "{3}",
        targets: [target.creature("t", { subtype: "Sliver" })],
        effects: [fx.gainControl(ref.target(), { indefinitely: true })],
        label: "Control of target Sliver",
      }),
    ],
  },
  "Idyllic Tutor": { spell: spell([], [fx.search({ types: ["Enchantment"] }, { to: "hand" })]) },
  "Kinsbaile Cavalier": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Knight", controller: "you" },
        { addKeywords: ["doubleStrike"] },
        {
          label: "Your Knights have double strike",
        },
      ),
    ],
  },
  Bitterblossom: {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(FAERIE_ROGUE)], {
        label: "Lose 1 life, a 1/1 flying Faerie Rogue",
      }),
    ],
  },
  // Flying: read from the text.
  "Faerie Macabre": {
    abilities: [
      activated({
        fromHand: true,
        discardSelf: true,
        targets: [target.upTo(2, target.cardInGraveyard("t", {}, "any"))],
        effects: [fx.exile(ref.target())],
        label: "Discard this card: exile up to two cards from graveyards",
      }),
    ],
  },
  // Haste: read from the text.
  "Goblin Chieftain": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Goblin", controller: "you", other: true },
        { power: 1, toughness: 1, addKeywords: ["haste"] },
        {
          label: "Your other Goblins: +1/+1 and haste",
        },
      ),
    ],
  },
  "Goblin Sharpshooter": {
    abilities: [
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
      triggered(when.dies({ types: ["Creature"] }), [fx.untap(ref.self)], { label: "A creature dies: untap it" }),
      activated({
        tap: true,
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage to any target",
      }),
    ],
  },
  "Heat Shimmer": {
    spell: spell([target.creature()], [fx.copyToken(ref.target(), { addKeywords: ["haste"], exileAtEndStep: true })]),
  },
  "Devoted Druid": {
    abilities: [
      manaAbility("G"),
      activated({ addCounters: { kind: "-1/-1", n: 1 }, effects: [fx.untap(ref.self)], label: "A −1/−1 counter: untap it" }),
    ],
  },
  "Leaf-Crowned Visionary": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Elf", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Your other Elves: +1/+1",
        },
      ),
      triggered(when.castSpell("you", { subtype: "Elf" }), fx.mayPay("{G}", "pay {G} to draw", fx.draw(1)), {
        label: "Elf spell: pay {G} to draw",
      }),
    ],
  },
  "Regal Force": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ types: ["Creature"], colors: ["G"], controller: "you" }))], {
        label: "Draw a card for each green creature you control",
      }),
    ],
  },
  Manamorphose: { spell: spell([], [fx.addManaCombination(2), fx.draw(1)]) },
  "Risen Reef": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Elemental", controller: "you" }),
        [fx.lookAtTop(1, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "hand" })],
        { label: "An Elemental enters: the top card, a land onto the battlefield tapped, otherwise to hand" },
      ),
    ],
  },
  // — G4d: Special Guests of SOS and FRA —
  "Dolmen Gate": {
    abilities: [
      eventReplacement({
        event: "damage",
        combat: true,
        toFilter: { types: ["Creature"], attacking: true, controller: "you" },
        modify: { prevent: true },
        label: "Prevent combat damage dealt to your attacking creatures",
      }),
    ],
  },
  "Door of Destinies": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(when.castSpell("you", { chosen: "subtype" }), [fx.counters(ref.self, "charge")], {
        label: "Spell of the chosen type: a charge counter",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", chosen: "subtype" },
        { power: 1, toughness: 1 },
        {
          perCounter: "charge",
          label: "Your creatures of the chosen type: +1/+1 for each charge counter",
        },
      ),
    ],
  },
  Archaeomancer: {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_OR_SORCERY, "you", "instant or sorcery card in your graveyard")],
        label: "Return an instant or a sorcery from your graveyard",
      }),
    ],
  },
  "Archmage Emeritus": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_OR_SORCERY), [fx.draw(1)], { label: "Magecraft: draw" }),
      triggered(when.copySpell(INSTANT_OR_SORCERY), [fx.draw(1)], { label: "Magecraft: draw" }),
    ],
  },
  "Murmuring Mystic": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_OR_SORCERY), [fx.createTokens(BIRD_ILLUSION)], {
        label: "Instant or sorcery: a 1/1 flying Bird Illusion",
      }),
    ],
  },
  // Flash: read from the text.
  "Dualcaster Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.copySpell(ref.target(), 1)], {
        targets: [target.spell("t", INSTANT_OR_SORCERY, "instant or sorcery spell")],
        label: "Copy target instant or sorcery spell",
      }),
    ],
  },
  "Magus of the Library": sevenCardsDraw(),
  "Library of Alexandria": sevenCardsDraw(),
  // Ward {2}: read from the text.
  "Adrix and Nev, Twincasters": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Your tokens are created twice over" }),
    ],
  },
  "Eye of Ugin": {
    abilities: [
      playerStatic({
        spellCost: { filter: { subtype: "Eldrazi", colorCount: 0 }, reduce: 2 },
        label: "Your colorless Eldrazi spells cost {2} less",
      }),
      activated({
        mana: "{7}",
        tap: true,
        effects: [fx.search({ types: ["Creature"], colorCount: 0 }, { to: "hand" })],
        label: "Search for a colorless creature card",
      }),
    ],
  },
  "Austere Command": {
    spell: modal(
      ...(() => {
        const choices = [
          { label: "Destroy all artifacts", effects: [fx.destroyAll({ types: ["Artifact"] })] },
          { label: "Destroy all enchantments", effects: [fx.destroyAll({ types: ["Enchantment"] })] },
          {
            label: "Destroy all creatures with MV 3 or less",
            effects: [fx.destroyAll({ types: ["Creature"], maxManaValue: 3 })],
          },
          {
            label: "Destroy all creatures with MV 4 or greater",
            effects: [fx.destroyAll({ types: ["Creature"], minManaValue: 4 })],
          },
        ];
        // "Choose two —": each pair, the destructions of the pair at the same time.
        return choices.flatMap((a, i) =>
          choices.slice(i + 1).map((b) => mode(msg("{a}; {b}", { a: a.label, b: b.label }), [], [...a.effects, ...b.effects])),
        );
      })(),
    ),
  },
  "Sublime Epiphany": {
    spell: escalate(
      "{0}",
      { label: "Counter target spell", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        label: "Counter target activated or triggered ability",
        targets: [{ id: "a", label: "activated or triggered ability", filter: { stackItems: { only: "abilities" } } }],
        effects: [fx.counter(ref.target("a"))],
      },
      { label: "Return a nonland permanent", targets: [target.nonland("n")], effects: [fx.bounce(ref.target("n"))] },
      {
        label: "A token copy of your target creature",
        targets: [target.creature("c", { controller: "you" })],
        effects: [fx.copyToken(ref.target("c"))],
      },
      { label: "Target player draws", targets: [target.player("p")], effects: [fx.draw(1, ref.target("p"))] },
    ),
  },
  Consider: { spell: spell([], [fx.surveil(1), fx.draw(1)]) },
  "Mind Twist": { spell: spell([target.player()], [fx.discard(amount.x, ref.target(), { random: true })]) },
  "Splinter Twin": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              tap: true,
              effects: [fx.copyToken(ref.self, { addKeywords: ["haste"], exileAtEndStep: true })],
              label: "A token copy with haste, exiled at the end step",
            }),
          ],
        },
        { label: "Enchanted creature can copy itself" },
      ),
    ],
  },
  "Root Maze": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { anyOf: [{ types: ["Artifact"] }, { types: ["Land"] }] },
        label: "Artifacts and lands enter tapped",
      }),
    ],
  },
  // — G4e: difficult sub-lot —
  "Noxious Revival": {
    spell: spell(
      [target.cardInGraveyard("t", {}, "any", "card in a graveyard")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Thousand-Year Elixir": {
    abilities: [
      playerStatic({
        activateAsThoughHaste: { types: ["Creature"] },
        label: "Abilities of your creatures can be activated as though they had haste",
      }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.untap(ref.target("t"))],
        label: "{1}, {T}: untap target creature",
      }),
    ],
  },
  "Grim Haruspex": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false, other: true }), [fx.draw(1)], {
        label: "Another nontoken creature you control dies: draw a card",
      }),
    ],
  },
  "Mirri, Weatherlight Duelist": {
    abilities: [
      triggered(when.attacksSelf, [fx.thisCombat({ maxBlockingCreatures: 1 }, ref.eachOpponent)], {
        label: "Attacks: each opponent can block with at most one creature this combat",
      }),
      playerStatic({
        maxOneAttacker: "you",
        condition: cond.sourceMatches({ tapped: true }),
        label: "Tapped: only one creature can attack you each combat",
      }),
    ],
  },
  "Consign to Memory": {
    spell: spell(
      [
        {
          id: "t",
          label: "triggered ability or colorless spell",
          filter: { stackItems: { only: "triggered" }, spells: { colorCount: 0 } },
        },
      ],
      [fx.counter(ref.target())],
    ),
  },
  "Underworld Breach": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { notTypes: ["Land"] }, what: "spells", exileOthers: 3 },
        label: "Nonland cards in your graveyard have escape (their cost and three other cards exiled)",
      }),
      triggered(when.step("end", "any"), [fx.sacrificeIt(ref.self)], {
        label: "At the beginning of the end step: sacrifice this enchantment",
      }),
    ],
  },
  "Phantasmal Image": {
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"] },
        {
          anyController: true,
          except: {
            addSubtypes: ["Illusion"],
            addAbilities: [
              triggered({ on: "becomesTarget", who: "self" }, [fx.sacrificeIt(ref.self)], {
                label: "Becomes the target of a spell or ability: sacrifice it",
              }),
            ],
          },
        },
      ),
    ],
  },
  "Flesh Duplicate": {
    // Fading 3 (702.63): it enters with three time counters (as it enters), and the upkeep ability is an exception of
    // the copy. Approximation: given even if the copied creature already has fading.
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"] },
        {
          anyController: true,
          counters: { kind: "time", n: 3 },
          except: {
            addAbilities: [
              triggered(
                when.yourUpkeep,
                [
                  fx.removeCounters(ref.self, 1, "time"),
                  ...fx.when(cond.not(cond.amountAtLeast(amount.countersOn(ref.self, "time"), 1)), fx.sacrificeIt(ref.self)),
                ],
                { label: "Fading: remove a time counter; once the last is removed, sacrifice it" },
              ),
            ],
          },
        },
      ),
    ],
  },
  Necrodominance: {
    abilities: [
      playerStatic({ skips: "drawStep", label: "Skip your draw step" }),
      triggered(when.step("end"), [fx.payLifeX("pay any amount of life (and draw that many)", "x"), fx.draw(amount.v("x"))], {
        label: "Your end step: pay X life, draw X cards",
      }),
      playerStatic({ maxHandSize: 5, label: "Maximum hand size: five" }),
      graveyardReplacement({ graveyardOf: "you", label: "What would go to your graveyard is exiled instead" }),
    ],
  },
  "Sphinx's Tutelage": {
    abilities: [
      triggered({ on: "draw", whose: "you" }, [fx.millWhileSharingColor(ref.target(), true)], {
        targets: [target.player("t", "opponent")],
        label: "You draw: the opponent mills two cards (and repeats if two nonland cards share a color)",
      }),
      activated({ mana: "{5}{U}", effects: fx.loot(1), label: "{5}{U}: draw, then discard a card" }),
    ],
  },
  "Library of Leng": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      playerStatic({
        discardToLibraryTop: true,
        label: "A card discarded by an effect can go on top of your library",
      }),
    ],
  },
  "Notion Thief": {
    abilities: [
      playerStatic({
        stealsOpponentDraws: true,
        label: "An opponent who draws (except the first card of their draw step): you draw instead",
      }),
    ],
  },
  "Maddening Hex": {
    enchant: { filter: {}, label: "player", player: true },
    abilities: [
      triggered(
        { on: "castSpell", by: "any", filter: { notTypes: ["Creature"] } },
        [
          fx.rollDie(6, "d"),
          fx.damage(amount.v("d"), ref.eventPlayer, ref.self),
          fx.attachRandom(ref.except(ref.eachOpponent, ref.attached)),
        ],
        {
          condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.attached)), 1)),
          label: "Enchanted player casts a noncreature spell: a d6, that much damage; the Aura moves to another opponent",
        },
      ),
    ],
  },
  "Painter's Servant": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [staticAbility({}, { setColorsChosen: "add" }, { label: "Permanents are the chosen color in addition" })],
  },
  // "two cards in your hand drawn this turn" (the turn log notes the cards drawn).
  "Sylvan Library": {
    abilities: [
      triggered(
        when.step("draw"),
        fx.may(
          "Draw two additional cards?",
          fx.draw(2),
          ...fx.unlessPays(
            ref.you,
            { life: 4 },
            fx.pickFromZone(
              "hand",
              { drawnThisTurn: true },
              { to: "libraryTop" },
              { count: 1, min: 1, prompt: "Put a card drawn this turn back on top of your library" },
            ),
          ),
          ...fx.unlessPays(
            ref.you,
            { life: 4 },
            fx.pickFromZone(
              "hand",
              { drawnThisTurn: true },
              { to: "libraryTop" },
              { count: 1, min: 1, prompt: "Put a card drawn this turn back on top of your library" },
            ),
          ),
        ),
        { label: "Your draw step: two additional cards; for two cards, pay 4 life or put it back on top" },
      ),
    ],
  },
  "Codie, Vociferous Codex": {
    abilities: [
      playerStatic({
        castLimit: {
          who: "you",
          spellTypes: { types: ["Artifact", "Creature", "Enchantment", "Planeswalker", "Battle"] },
          maxSpells: 0,
        },
        label: "You can't cast permanent spells",
      }),
      activated({
        mana: "{4}",
        tap: true,
        effects: [
          fx.addMana("W", "U", "B", "R", "G"),
          // "Exile cards until an instant or sorcery card with lesser mana value. Until end of turn, you may cast that
          // card without paying its mana cost. Put each other card exiled this way on the bottom in a random order."
          fx.whenNextSpellThisTurn([
            {
              op: "exileUntil",
              filter: { ...INSTANT_OR_SORCERY, compare: [cmp.manaValue("<", amount.manaValueOf(ref.target("s")))] },
              store: "codie",
              storeAll: "codieAll",
            },
            fx.grantPlay(ref.stored("codie"), { free: true, castOnly: true }),
            fx.moveTo(ref.except(ref.stored("codieAll"), ref.stored("codie")), { to: "libraryBottom", shuffle: true }),
          ]),
        ],
        label: "{4}, {T}: {W}{U}{B}{R}{G}; your next spell: exile until a cheaper instant or sorcery, castable free this turn",
      }),
    ],
  },
  // Council's dilemma (701.38): each player votes, starting with you and in turn order; then an extra turn for each vote
  // for time, and a permanent owned by the voter (whoever controls it) for each vote for money.
  Expropriate: {
    exileOnResolve: true,
    spell: spell(
      [],
      [
        fx.vote("v", { labels: VOTES }, { prompt: "Vote: time or money" }),
        ...fx.repeat(amount.votes("v", 1), fx.extraTurn),
        ...fx.forEachPlayer(ref.eachPlayer, (p, n) =>
          fx.repeat(
            amount.votes("v", 2, p),
            fx.chooseAmong(ref.permanentsOwnedBy(p), ref.you, `m${n}`),
            fx.giveControl(ref.stored(`m${n}`), ref.you),
          ),
        ),
      ],
    ),
  },
  "Robe of Stars": {
    abilities: [
      staticAbility("attached", { toughness: 3 }, { label: "Equipped creature gets +0/+3" }),
      activated({
        mana: "{1}{W}",
        effects: [fx.phaseOut(ref.attached)],
        label: "Astral projection — {1}{W}: equipped creature phases out",
      }),
    ],
  },
};
