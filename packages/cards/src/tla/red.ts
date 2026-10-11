/** Avatar: The Last Airbender: red cards. */
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  entersWith,
  eventReplacement,
  exhaust,
  firebending,
  flashback,
  fx,
  kicker,
  MONK_R,
  modal,
  mode,
  ref,
  SOLDIER_FIRE,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "land you control");
const LESSON_IN_GRAVEYARD = cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 1);

export const RED: Record<string, CardScript> = {
  "Boar-q-pine": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.self, 1)], {
        label: "A +1/+1 counter",
      }),
    ],
  },
  "Bumi Bash": {
    spell: modal(
      mode(
        "Damage equal to the number of lands you control",
        [target.creature()],
        [fx.damage(amount.count({ types: ["Land"], controller: "you" }), ref.target())],
      ),
      mode(
        "Destroys a land creature or a nonbasic land",
        [
          target.permanent(
            "u",
            ["Land"],
            { anyOf: [{ types: ["Creature"] }, { basic: false }] },
            "land creature or nonbasic land",
          ),
        ],
        [fx.destroy(ref.target("u"))],
      ),
    ),
  },
  "The Cave of Two Lovers": {
    abilities: [
      chapter([1], [fx.createTokens(ALLY, 2)], { label: "Two 1/1 Allies" }),
      chapter([2], [fx.search({ anySubtype: ["Mountain", "Cave"] })], { label: "A Mountain or Cave card" }),
      chapter([3], fx.earthbend(ref.target(), 3), { targets: [LAND_YOU_CONTROL], label: "Earthbend 3" }),
    ],
  },
  "Combustion Man": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.mayForStore(
            ref.controllerOf(ref.target()),
            "Take damage equal to Combustion Man's power to save this permanent?",
            "hurt",
            fx.damage(amount.powerOf(ref.self), ref.controllerOf(ref.target())),
          ),
          ...fx.when(cond.not(cond.v("hurt")), fx.destroy(ref.target())),
        ],
        {
          targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
          label: "Destroys the permanent unless its controller takes damage",
        },
      ),
    ],
  },
  "Crescent Island Temple": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MONK_R, amount.count({ subtype: "Shrine", controller: "you" }))], {
        label: "A 1/1 Monk for each Shrine",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), [fx.createTokens(MONK_R)], {
        label: "A 1/1 Monk",
      }),
    ],
  },
  "Cunning Maneuver": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 1), fx.createTokens(CLUE)]),
  },
  "Deserter's Disciple": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true, maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Another creature you control with power 2 or less can't be blocked",
      }),
    ],
  },
  "Fire Nation Attacks": {
    castOptions: [flashback("{8}{R}")],
    spell: spell([], [fx.createTokens(SOLDIER_FIRE, 2)]),
  },
  "Fire Nation Cadets": {
    abilities: [
      staticAbility(
        "self",
        { addAbilities: [firebending(2)] },
        { condition: LESSON_IN_GRAVEYARD, label: "Firebending 2 with a Lesson in your graveyard" },
      ),
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0 until end of turn" }),
    ],
  },
  "Fire Nation Raider": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CLUE)], { condition: cond.raid, label: "Raid: a Clue" })],
  },
  "Fire Sages": {
    // Firebending 1: read from the text.
    abilities: [activated({ mana: "{1}{R}{R}", effects: [fx.addCounters(ref.self, 1)], label: "A +1/+1 counter" })],
  },
  "Firebending Student": {
    // Prowess: read from the text; "firebending X, where X is its power": written here.
    abilities: [firebending(amount.powerOf(ref.self))],
  },
  "How to Start a Riot": {
    spell: spell(
      [target.creature(), target.player("p")],
      [
        fx.modify(ref.target(), { addKeywords: ["menace"] }),
        fx.pump(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 2, 0),
      ],
    ),
  },
  "Jeong Jeong, the Deserter": {
    // Firebending 1: read from the text.
    abilities: [
      exhaust({
        mana: "{3}",
        effects: [
          fx.addCounters(ref.self, 1),
          { op: "playerEffect", ability: { nextSpell: { filter: { subtype: "Lesson" }, copy: true } }, once: true },
        ],
        label: "A +1/+1 counter; your next Lesson spell this turn is copied",
      }),
    ],
  },
  "Jet's Brainwashing": {
    kicker: kicker("{3}"),
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), { addKeywords: ["cantBlock"] }),
        ...fx.when(
          cond.kicked,
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.modify(ref.target(), { addKeywords: ["haste"] }),
        ),
        fx.createTokens(CLUE),
      ],
    ),
  },
  "Mai, Jaded Edge": {
    // Prowess: read from the text.
    abilities: [exhaust({ mana: "{3}", effects: [fx.counters(ref.self, "doubleStrike")], label: "A double strike counter" })],
  },
  "Mongoose Lizard": {
    // Menace and mountaincycling: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target())], {
        targets: [target.any()],
        label: "1 damage to any target",
      }),
    ],
  },
  "Ran and Shaw": {
    // Flying and firebending 2: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { nonlegendary: true })], {
        condition: cond.all(
          cond.wasCast,
          cond.amountAtLeast(amount.countIn("graveyard", { anyOf: [{ subtype: "Dragon" }, { subtype: "Lesson" }] }), 3),
        ),
        label: "A nonlegendary token copy",
      }),
      activated({
        mana: "{3}{R}",
        effects: [fx.pumpAll({ types: ["Creature"], subtype: "Dragon", controller: "you" }, 2, 0)],
        label: "Dragons you control get +2/+0",
      }),
    ],
  },
  "Rough Rhino Cavalry": {
    // Firebending 2: read from the text.
    abilities: [
      exhaust({
        mana: "{8}",
        effects: [fx.addCounters(ref.self, 2), fx.modify(ref.self, { addKeywords: ["trample"] })],
        label: "Two +1/+1 counters and trample",
      }),
    ],
  },
  "Solstice Revelations": {
    castOptions: [flashback("{6}{R}")],
    spell: spell(
      [],
      [
        fx.exileUntil({ notTypes: ["Land"] }, "x"),
        // Cast without paying if its mana value is less than the number of Mountains you control; otherwise (or if you decline), to hand.
        fx.castNow(ref.stored("x"), {
          free: true,
          maxManaValue: amount.plus(amount.count({ subtype: "Mountain", controller: "you" }), -1),
        }),
        fx.toHand(ref.stored("x")),
      ],
    ),
  },
  "Tiger-Dillo": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.controls({ types: ["Creature"], minPower: 4, other: true })),
          label: "Can't attack or block without another creature with power 4 or greater",
        },
      ),
    ],
  },
  "Treetop Freedom Fighters": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" })],
  },
  "Twin Blades": {
    // Flash and equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.modify(ref.target(), { addKeywords: ["doubleStrike"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attaches to a creature you control, which gains double strike",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Ty Lee, Artful Acrobat": {
    // Prowess: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.mayPay(
            "{1}",
            "Pay {1} so that a creature can't block?",
            fx.reflexive([target.creature()], [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })]),
          ),
        ],
        { label: "Pay {1}: a creature can't block this turn" },
      ),
    ],
  },
  "War Balloon": {
    // Flying and crew 3: read from the text.
    abilities: [
      activated({ mana: "{1}", effects: [fx.counters(ref.self, "fire")], label: "A fire counter" }),
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        { condition: cond.counterAtLeast("fire", 3), label: "Artifact creature with three or more fire counters" },
      ),
    ],
  },
  "Wartime Protestors": {
    // Haste: read from the text.
    abilities: [
      triggered(
        when.enters({ subtype: "Ally", controller: "you", other: true }),
        [fx.addCounters(ref.eventObject, 1), fx.modify(ref.eventObject, { addKeywords: ["haste"] })],
        { label: "A +1/+1 counter and haste for the Ally" },
      ),
    ],
  },
  "Yuyan Archers": {
    // Reach: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "You may discard a card to draw a card",
      }),
    ],
  },
  "Zhao, the Moon Slayer": {
    // Menace: read from the text.
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Land"], basic: false },
        label: "Nonbasic lands enter tapped",
      }),
      activated({ mana: "{7}", effects: [fx.counters(ref.self, "conqueror")], label: "A conqueror counter" }),
      // The Mountain type gives "{T}: Add {R}" (305.6).
      staticAbility(
        { types: ["Land"], basic: false },
        { setSubtypes: ["Mountain"], loseAllAbilities: true },
        { condition: cond.counterAtLeast("conqueror", 1), label: "Nonbasic lands are Mountains" },
      ),
    ],
  },
  "Zuko, Exiled Prince": {
    // Firebending 3: read from the text.
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.exileTop(ref.you, 1, "z"), fx.grantPlay(ref.stored("z"))],
        label: "Exile the top card, playable this turn",
      }),
    ],
  },
  // "Pay 5 life or pay {2}": read from the text.
  "Redirect Lightning": {
    spell: spell([target.stackItemSingleTarget()], [fx.changeTarget(ref.target())]),
  },
  // Foretell {2}{R}: read from the text.
  "Sozin's Comet": {
    spell: spell([], [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addAbilities: [firebending(5)] })]),
  },
  "The Last Agni Kai": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.fight(ref.target("a"), ref.target("b"), "excess"),
        { op: "addManaUntilEndOfTurn", mana: ["R"], times: amount.v("excess") },
        fx.thisTurn({ keepUnspentMana: { types: ["R"] }, label: "You don't lose unspent red mana" }),
      ],
    ),
  },
  // Flash: read from the text.
  "Fated Firepower": {
    abilities: [
      entersWith({ counters: amount.x, counterKind: "fire", label: "Enters with X fire counters" }),
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        modify: { add: amount.countersOn(ref.self, "fire") },
        label: "Your sources deal additional damage equal to the number of fire counters",
      }),
    ],
  },
  "Firebender Ascension": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SOLDIER_FIRE)], { label: "A 2/2 Soldier with firebending 1" }),
      triggered(
        when.attackAbilityTriggered,
        [
          fx.counters(ref.self, "quest"),
          ...fx.when(
            cond.counterAtLeast("quest", 4),
            fx.may("Copy this ability?", fx.copySpell(ref.abilitiesFromEventObject, 1)),
          ),
        ],
        { label: "A quest counter; at 4 or more, you may copy the ability" },
      ),
    ],
  },
};
