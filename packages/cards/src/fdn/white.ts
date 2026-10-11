/** Foundations — white cards. */
import {
  activated,
  amount,
  CAT,
  CAT_BEAST,
  CAT_LIFELINK,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DOG,
  entersWith,
  eventReplacement,
  FOOD,
  fx,
  HUMAN,
  KNIGHT,
  kicker,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  prevention,
  protection,
  protectionAbility,
  RABBIT,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  WITH_P1P1,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Celestial Armor": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "attaches, hexproof and indestructible",
      }),
      staticAbility("attached", { power: 2, addKeywords: ["flying"] }, { label: "Equipped creature: +2/+0 and flying" }),
    ],
  },
  "Twinblade Blessing": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double strike" })],
  },
  "Fleeting Flight": {
    spell: spell(
      [target.creature()],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"]), fx.preventCombatDamage(ref.target())],
    ),
  },
  "Arahbo, the First Fang": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Cat", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(when.enters({ types: ["Creature"], subtype: "Cat", controller: "you", token: false }), [fx.createTokens(CAT)], {
        label: "1/1 Cat",
      }),
    ],
  },
  "Armasaur Guide": {
    abilities: [
      triggered(when.attackWith(3), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Cat Collector": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Food" }),
      triggered(when.gainLifeFirst, [fx.createTokens(CAT)], { condition: cond.yourTurn, label: "1/1 Cat" }),
    ],
  },
  "Claws Out": {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Cat", controller: "you" }) },
    spell: spell([], [fx.pumpAll({ controller: "you" }, 2, 2)]),
  },
  "Dauntless Veteran": {
    abilities: [triggered(when.attacksSelf, [fx.pumpAll({ controller: "you" }, 1, 1)], { label: "your creatures +1/+1" })],
  },
  "Dazzling Angel": {
    abilities: [triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], { label: "+1 life" })],
  },
  "Divine Resilience": {
    kicker: kicker("{2}{W}"),
    spell: spell(
      [{ ...target.creature("t", { controller: "you" }), kickedCount: 99 }],
      [fx.pump(ref.target(), 0, 0, ["indestructible"])],
    ),
  },
  "Exemplar of Light": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      // "Whenever you put one or more +1/+1 counters on this creature": only the counters you put (PLAN-L L4).
      triggered({ on: "countersPut", who: "self", kind: "+1/+1", by: "you" }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "draw a card",
      }),
    ],
  },
  "Felidar Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you", other: true }))],
        label: "+1/+1 counters",
      }),
    ],
  },
  "Guarded Heir": { abilities: [triggered(when.entersSelf, [fx.createTokens(KNIGHT, 2)], { label: "two 3/3 Knights" })] },
  "Hare Apparent": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(RABBIT, amount.count({ types: ["Creature"], name: "Hare Apparent", controller: "you", other: true }))],
        { label: "1/1 Rabbits" },
      ),
    ],
  },
  "Helpful Hunter": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "draw a card" })] },
  "Inspiring Paladin": {
    abilities: [
      staticAbility("self", { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
      staticAbility(WITH_P1P1, { addKeywords: ["firstStrike"] }, { condition: cond.yourTurn }),
    ],
  },
  "Joust Through": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }] },
          "attacking or blocking creature",
        ),
      ],
      [fx.damage(3, ref.target()), fx.gainLife(1)],
    ),
  },
  "Prideful Parent": { abilities: [triggered(when.entersSelf, [fx.createTokens(CAT)], { label: "1/1 Cat" })] },
  "Raise the Past": {
    spell: spell([], [fx.moveAll("graveyard", ref.you, { types: ["Creature"], maxManaValue: 2 }, { to: "battlefield" })]),
  },
  "Skyknight Squire": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      staticAbility(
        "self",
        { addKeywords: ["flying"], addSubtypes: ["Knight"] },
        { condition: cond.counterAtLeast("+1/+1", 3), label: "Flying and Knight (3 counters)" },
      ),
    ],
  },
  "Squad Rallier": {
    abilities: [
      activated({
        mana: "{2}{W}",
        effects: [fx.lookAtTop(4, { filter: { types: ["Creature"], maxPower: 2 } })],
        label: "Look at the top 4 cards",
      }),
    ],
  },
  "Sun-Blessed Healer": {
    kicker: kicker("{1}{W}"),
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"], maxManaValue: 2 })],
        condition: cond.kicked,
        label: "Kicker: return a permanent",
      }),
    ],
  },
  "Valkyrie's Call": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false, notSubtype: "Angel" }),
        [
          fx.toBattlefield(ref.eventObject, {
            counters: { kind: "+1/+1", n: 1 },
            addKeywords: ["flying"],
            addSubtypes: ["Angel"],
          }),
        ],
        { label: "returns as an Angel" },
      ),
    ],
  },
  "Vanguard Seraph": { abilities: [triggered(when.gainLifeFirst, [fx.surveil(1)], { label: "surveil 1" })] },
  "Ajani's Pridemate": { abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" })] },
  "Angel of Finality": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.target(), {}, { to: "exile" })], {
        targets: [target.player()],
        label: "exiles a graveyard",
      }),
    ],
  },
  "Authority of the Consuls": {
    abilities: [
      entersWith({ tapped: true, affects: CREATURE_OPP, label: "Opponents' creatures enter tapped" }),
      triggered(when.enters(CREATURE_OPP), [fx.gainLife(1)], { label: "+1 life" }),
    ],
  },
  "Banishing Light": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "opponent's nonland permanent")],
        label: "exiles until it leaves",
      }),
    ],
  },
  "Cathar Commando": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Sacrifice: destroy an artifact or an enchantment",
      }),
    ],
  },
  "Day of Judgment": { spell: spell([], [fx.destroyAll({ types: ["Creature"] })]) },
  "Make Your Move": {
    spell: spell(
      [
        targetObj(
          "t",
          { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], minPower: 4 }] },
          "artifact, enchantment or creature with power 4 or greater",
        ),
      ],
      [fx.destroy(ref.target())],
    ),
  },
  "Mischievous Pup": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.optional(targetObj("t", { controller: "you", other: true }, "other permanent you control"))],
        label: "returns a permanent",
      }),
    ],
  },
  "Resolute Reinforcements": { abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER)], { label: "1/1 Soldier" })] },
  "Stroke of Midnight": {
    spell: spell([target.nonland()], [fx.destroy(ref.target()), fx.createTokens(HUMAN, 1, ref.controllerOf(ref.target()))]),
  },
  "Youthful Valkyrie": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU_CONTROL, subtype: "Angel", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Crystal Barricade": {
    abilities: [
      playerStatic({ hexproof: true, label: "You have hexproof" }),
      prevention(
        { types: ["Creature"], controller: "you", other: true },
        { noncombatOnly: true, label: "Prevents noncombat damage" },
      ),
    ],
  },
  "Herald of Eternal Dawn": {
    abilities: [playerStatic({ cantLose: true, label: "You can't lose the game" })],
  },
  "Luminous Rebuke": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Giada, Font of Hope": {
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], subtype: "Angel", controller: "you" }),
        affects: { types: ["Creature"], subtype: "Angel", controller: "you", other: true },
        label: "The other Angels enter with counters",
      }),
      manaAbility("W", 1, { restriction: { spell: { subtype: "Angel" } } }),
    ],
  },

  // --- Reprints ---
  "Adamant Will": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["indestructible"])]) },
  "Ancestor Dragon": {
    abilities: [triggered(when.attackWith(1), [fx.gainLife(amount.eventAmount)], { label: "1 life for each attacker" })],
  },
  "Angel of Vitality": {
    abilities: [
      eventReplacement({ event: "lifeGain", to: "you", modify: { add: 1 }, label: "Each life gain +1" }),
      staticAbility("self", { power: 2, toughness: 2 }, { condition: cond.lifeAtLeast(25), label: "+2/+2 at 25 life or more" }),
    ],
  },
  "Angelic Destiny": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 4, toughness: 4, addKeywords: ["flying", "firstStrike"], addSubtypes: ["Angel"] },
        { label: "+4/+4, flying, first strike, Angel" },
      ),
      triggered(when.dies({ attached: "host" }), [fx.toHand(ref.selfCard)], { label: "returns to hand" }),
    ],
  },
  "Angelic Edict": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment"] }, "creature or enchantment")],
      [fx.exileCard(ref.target())],
    ),
  },
  "Archway Angel": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.gainLife(
            amount.plus(
              amount.count({ subtype: "Gate", controller: "you" }),
              amount.count({ subtype: "Gate", controller: "you" }),
            ),
          ),
        ],
        {
          label: "2 life for each Gate",
        },
      ),
    ],
  },
  "Ballyrush Banneret": {
    abilities: [costReducer({ anySubtype: ["Kithkin", "Soldier"] }, 1, "Kithkin and Soldiers: {1} less")],
  },
  "Charming Prince": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Scry 2", [], [fx.scry(2)]),
        mode("You gain 3 life", [], [fx.gainLife(3)]),
        mode(
          "Exile another creature (returns at the end step)",
          [target.creature("t", { controller: "you", other: true })],
          [
            fx.exileCard(ref.target(), { name: "p" }),
            fx.delayed([fx.toBattlefield(ref.target("p"), { underYourControl: true })], { p: ref.stored("p") }),
          ],
        ),
      ]),
    ],
  },
  "Crusader of Odric": { cda: { pt: amount.count({ types: ["Creature"], controller: "you" }) } },
  "Dawnwing Marshal": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll({ controller: "you" }, 1, 1)], label: "Your creatures +1/+1" })],
  },
  "Deadly Riposte": {
    spell: spell(
      [targetObj("t", { types: ["Creature"], tapped: true }, "tapped creature")],
      [fx.damage(3, ref.target()), fx.gainLife(2)],
    ),
  },
  "Devout Decree": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Planeswalker"], colors: ["B", "R"] }, "black or red creature or planeswalker")],
      [fx.exileCard(ref.target()), fx.scry(1)],
    ),
  },
  Disenchant: {
    spell: spell([target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")], [fx.destroy(ref.target())]),
  },
  "Elspeth's Smite": {
    spell: spell(
      [
        targetObj(
          "t",
          { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }] },
          "attacking or blocking creature",
        ),
      ],
      [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())],
    ),
  },
  "Felidar Cub": {
    abilities: [
      activated({
        sacrifice: true,
        targets: [target.permanent("t", ["Enchantment"], {}, "enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy target enchantment",
      }),
    ],
  },
  "Felidar Retreat": {
    abilities: [
      triggeredModal(when.landfall, [
        mode("2/2 Cat Beast", [], [fx.createTokens(CAT_BEAST)]),
        mode(
          "+1/+1 counter on each creature, vigilance",
          [],
          [fx.addCountersAll(CREATURE_YOU_CONTROL), fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["vigilance"] })],
        ),
      ]),
    ],
  },
  Fumigate: { spell: spell([], [fx.destroyAll({ types: ["Creature"] }, "dead"), fx.gainLife(amount.v("dead"))]) },
  "Herald of Faith": { abilities: [triggered(when.attacksSelf, [fx.gainLife(2)], { label: "+2 life" })] },
  "Hinterland Sanctifier": {
    abilities: [triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], { label: "+1 life" })],
  },
  "Ingenious Leonin": {
    abilities: [
      activated({
        mana: "{3}{W}",
        targets: [
          targetObj(
            "t",
            { types: ["Creature"], controller: "you", attacking: true, other: true },
            "other attacking creature of yours",
          ),
        ],
        effects: [
          fx.addCounters(ref.target(), 1),
          ...fx.when(cond.refMatches(ref.target(), { subtype: "Cat" }), fx.pump(ref.target(), 0, 0, ["firstStrike"])),
        ],
        label: "+1/+1 counter (first strike if a Cat)",
      }),
    ],
  },
  "Inspiring Overseer": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 life, draw" })],
  },
  "Jazal Goldmane": {
    abilities: [
      activated({
        mana: "{3}{W}{W}",
        effects: [
          fx.pumpAll(
            { controller: "you", attacking: true },
            amount.count({ types: ["Creature"], controller: "you", attacking: true }),
            amount.count({ types: ["Creature"], controller: "you", attacking: true }),
          ),
        ],
        label: "Attackers +X/+X",
      }),
    ],
  },
  "Knight of Grace": {
    abilities: [
      protectionAbility(protection.hexproofFrom({ colors: ["B"] }, "Hexproof from black")),
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.battlefieldCount({ colors: ["B"] }, 1), label: "+1/+0 (black permanent)" },
      ),
    ],
  },
  "Leonin Vanguard": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.self, 1, 1), fx.gainLife(1)], {
        condition: cond.controls({ types: ["Creature"] }, 3),
        label: "+1/+1 and +1 life",
      }),
    ],
  },
  "Linden, the Steadfast Queen": {
    abilities: [
      triggered(when.attacks({ types: ["Creature"], controller: "you", colors: ["W"] }), [fx.gainLife(1)], { label: "+1 life" }),
    ],
  },
  "Lyra Dawnbringer": {
    abilities: [
      staticAbility(
        { ...OTHER_CREATURE_YOU_CONTROL, subtype: "Angel" },
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        {
          label: "Other Angels +1/+1 and lifelink",
        },
      ),
    ],
  },
  "Make a Stand": {
    spell: spell([], [fx.pumpAll({ controller: "you" }, 1, 0, ["indestructible"])]),
  },
  "Mentor of the Meek": {
    abilities: [
      triggered(
        when.enters({ ...OTHER_CREATURE_YOU_CONTROL, maxPower: 2 }),
        fx.mayPay("{1}", "Pay {1} to draw a card?", fx.draw(1)),
        { label: "{1}: draw" },
      ),
    ],
  },
  "Moment of Triumph": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2), fx.gainLife(2)]) },
  Pacifism: {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Can't attack or block" })],
  },
  "Prayer of Binding": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.optional(target.nonland("t", { controller: "opponent" }, "opponent's nonland permanent"))],
        label: "exiles until it leaves, +2 life",
      }),
    ],
  },
  "Regal Caracal": {
    abilities: [
      staticAbility(
        { ...OTHER_CREATURE_YOU_CONTROL, subtype: "Cat" },
        { power: 1, toughness: 1, addKeywords: ["lifelink"] },
        {
          label: "Other Cats +1/+1 and lifelink",
        },
      ),
      triggered(when.entersSelf, [fx.createTokens(CAT_LIFELINK, 2)], { label: "two 1/1 Cats" }),
    ],
  },
  "Release the Dogs": { spell: spell([], [fx.createTokens(DOG, 4)]) },
  "Stasis Snare": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "exiles until it leaves",
      }),
    ],
  },
  "Syr Alin, the Lion's Claw": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ controller: "you", other: true }, 1, 1)], { label: "other creatures +1/+1" }),
    ],
  },
  "Twinblade Paladin": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike"] },
        { condition: cond.lifeAtLeast(25), label: "Double strike at 25 life" },
      ),
    ],
  },
  "Valorous Stance": {
    spell: modal(
      mode("Indestructible", [target.creature()], [fx.pump(ref.target(), 0, 0, ["indestructible"])]),
      mode(
        "Destroy target creature with toughness 4 or greater",
        [target.creature("t", { minToughness: 4 })],
        [fx.destroy(ref.target())],
      ),
    ),
  },
};
