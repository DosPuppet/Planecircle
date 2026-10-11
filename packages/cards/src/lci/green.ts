/** The Lost Caverns of Ixalan — green cards. */
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  CAVE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  DINOSAUR_3_3,
  DINOSAUR_YOU,
  descend,
  entersWith,
  fx,
  MAP,
  manaAbility,
  modal,
  mode,
  PERMANENT_CARD,
  playerStatic,
  powerFor,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const CREATURE = { types: ["Creature" as const] };
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const explores = triggered(when.entersSelf, [fx.explore()], { label: "Explore" });
const mayMillTwo = triggered(when.entersSelf, [...fx.may("Mill two cards?", fx.mill(2))], {
  label: "Mill two cards",
});

export const GREEN: Record<string, CardScript> = {
  "Armored Kincaller": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], {
        condition: cond.any(
          cond.controls({ ...DINOSAUR_YOU, other: true }),
          cond.amountAtLeast(amount.countIn("hand", { subtype: "Dinosaur" }), 1),
        ),
        label: "+3 life (Dinosaur revealed or controlled)",
      }),
    ],
  },
  "Basking Capybara": {
    abilities: [staticAbility("self", { power: 3 }, { condition: descend(4), label: "Descend 4 — +3/+0" })],
  },
  "Bedrock Tortoise": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addKeywords: ["hexproof"] },
        {
          condition: cond.yourTurn,
          label: "Hexproof during your turn",
        },
      ),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addPowerRules: [powerFor.combatToughness] },
        {
          label: "Combat damage equal to toughness",
        },
      ),
    ],
  },
  "Cavern Stomper": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({
        mana: "{3}{G}",
        effects: [fx.modify(ref.self, { addBlockRules: [block.notByPowerLE2] })],
        label: "Can't be blocked by power 2 or less",
      }),
    ],
  },
  "Cenote Scout": { abilities: [explores] },
  "Coati Scavenger": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", PERMANENT_CARD, "you", "permanent card in your graveyard")],
        condition: descend(4),
        label: "Descend 4 — permanent card into your hand",
      }),
    ],
  },
  "Disturbed Slumber": {
    spell: spell(
      [target.permanent("t", ["Land"], { controller: "you" }, "land you control")],
      [
        fx.modify(ref.target(), {
          addTypes: ["Creature"],
          addSubtypes: ["Dinosaur"],
          setPower: 4,
          setToughness: 4,
          addKeywords: ["reach", "haste", "mustBeBlocked"],
        }),
      ],
    ),
  },
  "Earthshaker Dreadmaw": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ ...DINOSAUR_YOU, other: true }))], {
        label: "A card for each other Dinosaur",
      }),
    ],
  },
  "Explorer's Cache": {
    abilities: [
      entersWith({ counters: 2, label: "Enters with two +1/+1 counters" }),
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
      activated({
        tap: true,
        removeCounters: { kind: "+1/+1", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Move a +1/+1 counter",
      }),
    ],
  },
  "Ghalta, Stampede Tyrant": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "hand",
            CREATURE,
            { to: "battlefield" },
            { count: 60, min: 0, prompt: "Creatures to put onto the battlefield" },
          ),
        ],
        { label: "Creatures from your hand onto the battlefield" },
      ),
    ],
  },
  "Glimpse the Core": {
    spell: modal(
      mode(
        "Tapped basic Forest",
        [],
        [fx.search({ types: ["Land"], basic: true, subtype: "Forest" }, { to: "battlefield", tapped: true })],
      ),
      mode(
        "Tapped Cave from the graveyard",
        [target.cardInGraveyard("t", { subtype: "Cave" }, "you", "Cave card from your graveyard")],
        [fx.toBattlefield(ref.target(), { tapped: true })],
      ),
    ),
  },
  "Glowcap Lantern": {
    abilities: [
      // Both abilities belong to the equipped creature: its controller looks at the top of their library.
      staticAbility(
        "attached",
        {
          addAbilities: [
            playerStatic({ lookAt: "libraryTop", label: "You may look at the top card" }),
            triggered(when.attacksSelf, [fx.explore()], { label: "Explore" }),
          ],
        },
        { label: "Look at the top card; explores when attacking" },
      ),
    ],
  },
  "Growing Rites of Itlimoc": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: CREATURE, count: 1, rest: "bottom" })], {
        label: "Creature card into your hand",
      }),
      triggered(when.yourEndStep, [fx.transform()], {
        condition: cond.controls(CREATURE_YOU_CONTROL, 4),
        label: "Transform (four creatures)",
      }),
    ],
  },
  "Itlimoc, Cradle of the Sun": {
    abilities: [manaAbility("G"), manaAbility("G", 1, { per: CREATURE_YOU_CONTROL })],
  },
  "Huatli, Poet of Unity": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Basic land into your hand" }),
      activated({
        mana: "{3}{R/W}{R/W}",
        sorcerySpeed: true,
        effects: [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })],
        label: "Exile it, then return it transformed",
      }),
    ],
  },
  "Roar of the Fifth People": {
    abilities: [
      chapter([1], [fx.createTokens(DINOSAUR_3_3, 2)], { label: "Two 3/3 Dinosaurs" }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                staticAbility(
                  CREATURE_YOU_CONTROL,
                  { addAbilities: [manaAbility(["R", "G", "W"])] },
                  {
                    label: "Your creatures: {T}: {R}, {G} or {W}",
                  },
                ),
              ],
            },
            "permanent",
          ),
        ],
        { label: "Your creatures produce mana" },
      ),
      chapter([3], [fx.search({ subtype: "Dinosaur" })], { label: "Dinosaur card into your hand" }),
      chapter([4], [fx.pumpAll(DINOSAUR_YOU, 0, 0, ["doubleStrike", "trample"])], {
        label: "Double strike and trample",
      }),
    ],
  },
  "Huatli's Final Strike": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 1, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Hulking Raptor": {
    abilities: [triggered(when.step("main1"), [fx.addMana("G", "G")], { label: "Add {G}{G}" })],
  },
  "In the Presence of Ages": {
    // "A creature card and/or a land card": at most one of each type.
    spell: spell(
      [],
      [
        fx.lookAtTop(4, {
          filter: { anyOf: [CREATURE, { types: ["Land"] }] },
          count: 2,
          onePerType: ["Creature", "Land"],
          rest: "graveyard",
        }),
      ],
    ),
  },
  "Ixalli's Lorekeeper": {
    abilities: [
      manaAbility([...ANY_COLOR], 1, {
        restriction: { spell: { subtype: "Dinosaur" }, abilityOfSource: { subtype: "Dinosaur" } },
      }),
    ],
  },
  "Jadelight Spelunker": {
    abilities: [triggered(when.entersSelf, [fx.explore(ref.self, amount.sourceX)], { label: "Explores X times" })],
  },
  "Malamet Battle Glyph": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        ...fx.when(cond.targetMatches("a", { enteredThisTurn: true }), fx.addCounters(ref.target("a"), 1)),
        fx.fight(ref.target("a"), ref.target("b")),
      ],
    ),
  },
  "Malamet Brawler": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["trample"])], {
        targets: [target.creature("t", { attacking: true })],
        label: "Trample",
      }),
    ],
  },
  "Malamet Scythe": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to target creature",
      }),
    ],
  },
  "Malamet Veteran": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        condition: descend(4),
        label: "Descend 4 — +1/+1 counter",
      }),
    ],
  },
  "Mineshaft Spider": { abilities: [mayMillTwo] },
  "Nurturing Bristleback": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(DINOSAUR_3_3)], { label: "3/3 Dinosaur" })],
  },
  "Over the Edge": {
    spell: modal(
      mode(
        "Destroy an artifact or an enchantment",
        [targetObj("t", { types: ["Artifact", "Enchantment"] }, "artifact or enchantment")],
        [fx.destroy(ref.target())],
      ),
      mode("A creature explores twice", [target.creature("c", { controller: "you" })], [fx.explore(ref.target("c"), 2)]),
    ),
  },
  "Pathfinding Axejaw": { abilities: [explores] },
  "Poison Dart Frog": {
    abilities: [
      manaAbility([...ANY_COLOR]),
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 0, 0, ["deathtouch"])], label: "Deathtouch" }),
    ],
  },
  "Pugnacious Hammerskull": {
    abilities: [
      triggered(when.attacksSelf, [fx.counters(ref.self, "stun", 1)], {
        condition: cond.not(cond.controls({ ...DINOSAUR_YOU, other: true })),
        label: "Stun counter (no other Dinosaur)",
      }),
    ],
  },
  "River Herald Guide": { abilities: [explores] },
  "Seeker of Sunlight": {
    abilities: [activated({ mana: "{2}{G}", sorcerySpeed: true, effects: [fx.explore()], label: "Explore" })],
  },
  "Sentinel of the Nameless City": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) => triggered(t, [fx.createTokens(MAP)], { label: "Map token" })),
  },
  Spelunking: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { count: 1, min: 0, store: "l", prompt: "Land to put onto the battlefield" },
          ),
          ...fx.when(cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("l"), CAVE)), 1), fx.gainLife(4)),
        ],
        { label: "Draw, then a land from your hand" },
      ),
      playerStatic({ landsEnterUntapped: true, label: "Your lands enter untapped" }),
    ],
  },
  "Staggering Size": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3, ["trample"])]) },
  "Tendril of the Mycotyrant": {
    abilities: [
      activated({
        mana: "{5}{G}{G}",
        targets: [target.permanent("t", ["Land"], { controller: "you", notTypes: ["Creature"] }, "noncreature land you control")],
        effects: [
          fx.counters(ref.target(), "+1/+1", 7),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Fungus"], setPower: 0, setToughness: 0, addKeywords: ["haste"] },
            "permanent",
          ),
        ],
        label: "The land becomes a 0/0 Fungus",
      }),
    ],
  },
  "Walk with the Ancestors": {
    spell: spell(
      [target.optional(target.cardInGraveyard("t", PERMANENT_CARD, "you", "permanent card in your graveyard"))],
      [fx.toHand(ref.target()), fx.discover(4)],
    ),
  },
};
