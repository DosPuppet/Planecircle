/**
 * The Hobbit — cards of the meta decks (phase 1 of plan P4, lot M1): behold (`cond.behold`). The other cards of the
 * set are in the files by color.
 */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  cost,
  DWARF,
  entersWith,
  fx,
  graveyardReplacement,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  WOLF,
  wardAbility,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Lands -----------------------------------------------------------------
  "Elven Passage": {
    abilities: [
      activated({
        tap: true,
        payLife: 1,
        sacrifice: true,
        effects: [
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, undefined, "land"),
          // "You may behold an Elf. If you do, untap this land."
          ...fx.mayBehold({ subtype: "Elf" }, fx.untap(ref.stored("land"))),
        ],
        label: "Search for a basic land card (untapped by beholding an Elf)",
      }),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Azog, Moria's Ruin": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.amass(ref.controllerOf(ref.target()), "Goblin", amount.powerOf(ref.target())),
          // "If you controlled that creature": its last known information if it was destroyed.
          ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.draw(1)),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Destroys a creature; its controller amasses Goblins",
        },
      ),
    ],
  },
  "The Sackville-Bagginses": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }], other: true }, 1, {
            optional: true,
            store: "s",
          }),
          ...fx.when(cond.v("s"), fx.draw(1), fx.createTokens(TREASURE)),
        ],
        { label: "Optional sacrifice: draw, a Treasure" },
      ),
      triggered(when.sacrifice({ token: true }), [fx.loseLife(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "An opponent loses 1 life",
      }),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Smaug the Magnificent": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(amount.count({ subtype: "Treasure", controller: "you" }), ref.target())], {
        targets: [target.any()],
        label: "Damage equal to the number of your Treasures",
      }),
      triggered(when.yourUpkeep, [fx.createTokens(TREASURE)], { label: "A Treasure" }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Thorin Oakenshield": {
    // Storied: read from the text.
    abilities: [
      staticAbility(
        { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "you" },
        { addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { condition: cond.enduringStory, label: "Enduring story: your artifacts and creatures have ward {1}" },
      ),
    ],
  },
  "Concerted Care": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artifact or creature you control")],
      [fx.modify(ref.target(), { addKeywords: ["hexproof", "indestructible"] })],
    ),
  },
  "The Lonely Mountain": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ subtype: "Equipment" })),
        label: "Tapped unless you control an Equipment",
      }),
      activated({
        mana: "{4}{R}",
        tap: true,
        sorcerySpeed: true,
        reduction: { generic: amount.count({ subtype: "Equipment", controller: "you" }) },
        effects: [fx.createTokens(DWARF)],
        label: "A 2/2 Dwarf",
      }),
    ],
  },
  "Dwarven Mauler": { rules: { equipDiscountWhenTargeted: 2 } },
  "Thorin, Mountain-king": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // 701.3b: only the Equipment that become attached count (not one that already was).
          fx.attach(ref.target("c"), ref.target("e"), "attached"),
          ...fx.when(
            cond.v("attached"),
            fx.reflexive(
              [target.upTo(1, target.creature("d"))],
              [fx.damage(amount.powerOf(ref.target("c")), ref.target("d"), ref.target("c"))],
              { c: ref.target("c") },
            ),
          ),
        ],
        {
          targets: [
            {
              ...target.permanent(
                "e",
                ["Artifact"],
                { subtype: "Equipment", controller: "you" },
                "any number of Equipment you control",
              ),
              count: 20,
              optional: true,
            },
            target.creature("c", { controller: "you" }),
          ],
          label: "Attaches your Equipment; the creature deals damage to a creature",
        },
      ),
    ],
  },
  "Dáin's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink"] },
        { condition: cond.controls({ subtype: "Dwarf", other: true }), label: "Lifelink with another Dwarf" },
      ),
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(4, {
            count: 1,
            filter: { anyOf: [{ subtype: "Dwarf" }, { subtype: "Equipment" }] },
            to: { to: "hand" },
            rest: "bottom",
          }),
        ],
        { label: "A Dwarf or an Equipment among the top four" },
      ),
    ],
  },
  "Kíli the Resourceful": {
    abilities: [
      playerStatic({
        // "Pay {0} rather than pay the equip cost of the first equip ability you activate each turn": the whole cost
        // (colored mana, life, sacrifice, discard; PLAN-L L5); no equip activated yet this turn.
        abilityCost: { ability: "equip", free: true },
        condition: cond.all(
          cond.enduringStory,
          cond.not(cond.amountAtLeast(amount.turnEvents({ event: "activate", who: "you", equip: true }), 1)),
        ),
        label: "Enduring story: first equip of the turn for {0}",
      }),
      triggered(
        when.enters({ anyOf: [{ subtype: "Dwarf" }, { subtype: "Equipment" }], controller: "you", other: true }),
        [fx.draw(1)],
        {
          oncePerTurn: true,
          label: "Draw a card",
        },
      ),
    ],
  },
  "Bilbo's Gambit": {
    // Gift a Treasure: read from the text.
    spell: spell(
      [target.spell()],
      [fx.bounce(ref.target()), ...fx.when(cond.gift, fx.thisTurn({ castLimit: { who: "you" } }, ref.eachPlayer))],
    ),
  },
  "Belladonna Took": {
    abilities: [
      triggered(
        when.enters({ token: true, controller: "you" }),
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.gainLife(1)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
          ...fx.when(
            cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))),
            fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1),
          ),
        ],
        { label: "1st time: 1 life; 2nd: draw; 3rd: +1/+1 on your creatures" },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Chief Warg's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack"] },
        {
          condition: cond.not(cond.controls({ subtype: "Wolf", other: true }, 2)),
          label: "Attacks only with two other Wolves",
        },
      ),
      triggered(when.yourUpkeep, [fx.createTokens(WOLF)], { label: "A 2/2 Wolf" }),
    ],
  },
  "Head of the Hunt": {
    abilities: [
      graveyardReplacement({
        filter: { types: ["Creature"], controller: "opponent" },
        fromBattlefield: true,
        createToken: WOLF,
        label: "Opponents' creatures that die are exiled; a 2/2 Wolf",
      }),
    ],
  },
  "Nighthowl Pursuer": {
    abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 2, 2)], { condition: cond.ferocious, label: "Ferocious: +2/+2" })],
  },
  "Desolation Prowler": {
    abilities: [activated({ payLife: 2, oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2" })],
  },
  "Gollum, Riddle Master": {
    asEnters: [fx.chooseForSelf("parity")],
    abilities: [
      triggeredModal(
        when.castSpell("opponent", { chosen: "parity" }),
        [
          mode("A +1/+1 counter on Gollum", [], [fx.addCounters(ref.self, 1)]),
          mode("Drain 2", [], fx.drain(2)),
          mode("Draw a card", [], [fx.draw(1)]),
        ],
        { uniqueModes: true, label: "Opponent's spell of the chosen parity: a mode not chosen yet" },
      ),
    ],
  },
};
