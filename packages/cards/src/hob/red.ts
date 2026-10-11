/** The Hobbit — red cards (lot A). */
import {
  AXE,
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  DRAGON_6,
  doesntUntap,
  flashback,
  fx,
  modal,
  mode,
  ref,
  STONE_BOULDER,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** Your Treasures. */
const YOUR_TREASURES = { subtype: "Treasure", controller: "you" as const };

export const RED: Record<string, CardScript> = {
  // Storied: read from the text.
  "Balin, Loremaster": {
    abilities: [
      triggered(
        when.enters({ subtype: "Dwarf", controller: "you" }),
        fx.may(
          "Discard your hand to draw that many cards?",
          fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }),
          fx.draw(amount.v("d")),
          ...fx.when(cond.enduringStory, fx.damage(amount.v("d"), ref.eachOpponent)),
        ),
        { label: "Discard your hand, draw that many (enduring story: that much damage to each opponent)" },
      ),
    ],
  },
  // Storied: read from the text.
  "Bombur, Gentle Dreamer": {
    abilities: [
      doesntUntap("self", { condition: cond.not(cond.enduringStory), label: "Doesn't untap without an enduring story" }),
    ],
  },
  "Bothersome Noisemaker": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.amass(ref.you, "Goblin", 1)], {
        label: "Noncreature spell: amass Goblins 1",
      }),
    ],
  },
  "Burn, Burn, Tree and Fern": {
    abilities: [
      chapter([1], [fx.damage(6, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Chapter I — 6 damage to an opponent's creature",
      }),
      chapter([2], [fx.destroy(ref.target())], {
        targets: [target.permanent("t", ["Artifact"], { controller: "opponent" }, "artifact an opponent controls")],
        label: "Chapter II — destroys an opponent's artifact",
      }),
      chapter([3, 4], [fx.addMana("R")], { label: "Chapters III and IV — add {R}" }),
    ],
  },
  "Dáin Ironfoot": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(AXE, 1, undefined, "axe"),
          // "When you do, attach it to target creature you control."
          fx.reflexive([target.creature("c", { controller: "you" })], [fx.attach(ref.target("c"), ref.target("axe"))], {
            axe: ref.stored("axe"),
          }),
        ],
        { label: "An Axe, attached to one of your creatures" },
      ),
      triggered(when.attacksSelf, [fx.pumpAll({ attacking: true, equipped: true }, 0, 0, ["doubleStrike"])], {
        label: "Your equipped attackers have double strike",
      }),
    ],
  },
  "Desert Were-Worm": {
    abilities: [
      staticAbility("self", { power: 2 }, { per: { subtype: "Mountain", controller: "you" }, label: "+2/+0 for each Mountain" }),
      triggered(when.attackWith(1), [fx.untapAll({ attacking: true }), fx.extraCombat], {
        condition: cond.amountAtLeast(amount.totalPower({ attacking: true, controller: "you" }), 12),
        oncePerTurn: true,
        label: "Attack with total power 12 or greater: untap the attackers, additional combat",
      }),
    ],
  },
  "Desolation of Smaug": {
    spell: spell(
      [],
      [
        fx.damageAll(3, { types: ["Creature"], notSubtype: "Dragon" }),
        // "Four mana in any combination of colors": one division (PLAN-L L3).
        fx.addManaCombination(4, undefined, { spell: { subtype: "Dragon" } }),
      ],
    ),
  },
  // Trample: read from the text.
  "Dori, Bearer of Friends": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "A Treasure" })],
  },

  // --- Gandalf, Goblins' Bane // Flameshape -----------------------------------
  "Gandalf, Goblins' Bane": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 1, 1), fx.damage(1, ref.eachOpponent)], {
        label: "Noncreature spell: +1/+1 and 1 damage to each opponent",
      }),
    ],
  },
  Flameshape: {
    // The cards are exiled face down (only you see them).
    spell: spell(
      [],
      [
        fx.exileTop(ref.you, 2, "e", "you"),
        fx.grantPlay(ref.stored("e"), { forever: true, condition: cond.controls({ subtype: "Wizard" }) }),
      ],
    ),
  },

  // Reach: read from the text.
  "Gandalf, Spark Starter": {
    abilities: [
      triggered(when.entersSelf, [fx.damageDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.any())],
        label: "3 damage divided among one, two or three targets",
      }),
    ],
  },

  // --- Glóin the Mighty // Easy Pickings --------------------------------------
  "Glóin the Mighty": {
    abilities: [triggered(when.step("main1", "you"), [fx.addMana("R", "R")], { label: "Add {R}{R}" })],
  },
  "Easy Pickings": { spell: spell([], [fx.damageAll(1, { types: ["Creature"], controller: "opponent" })]) },

  // Haste: read from the text.
  "Goblin-town Flunkies": {
    abilities: [triggered(when.entersSelf, [fx.amass(ref.you, "Goblin", 1)], { label: "Amass Goblins 1" })],
  },
  "Gundabad Opportunist": {
    abilities: [
      triggered(when.entersSelf, [fx.impulse(1, "yourNextTurn")], {
        label: "Exiles the top card, playable until the end of your next turn",
      }),
    ],
  },
  // Reach, trample: read from the text.
  "Iron Hills Stalwart": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.permanent("e", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Equipment you control"),
          target.upTo(1, target.creature("c", { controller: "you" })),
        ],
        label: "Attaches one of your Equipment to one of your creatures",
      }),
    ],
  },
  // Mountaincycling: read from the text.
  "Last Light of Durin's Day": {
    abilities: [
      triggered(
        when.enters({ subtype: "Mountain", controller: "you" }),
        [
          fx.counters(ref.self, "quest"),
          ...fx.when(
            cond.counterAtLeast("quest", 6),
            fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
            // "Search your hand and/or library for a Dragon card": in the hand first, otherwise in the library (which
            // is then shuffled).
            ...fx.when(
              cond.v("s"),
              fx.pickFromZone(
                "hand",
                { subtype: "Dragon" },
                { to: "battlefield" },
                { min: 0, store: "h", prompt: "Choose a Dragon from your hand (none: search the library)" },
              ),
              ...fx.when(cond.not(cond.v("h")), fx.search({ subtype: "Dragon" }, { to: "battlefield" })),
            ),
          ),
        ],
        { label: "A quest counter; at six, sacrifice it: a Dragon onto the battlefield" },
      ),
    ],
  },
  "The Misty Mountains Cold": {
    abilities: [
      chapter(
        [1, 2, 3, 4],
        [
          fx.createTokens(TREASURE),
          ...fx.when(
            cond.controls(YOUR_TREASURES, 4),
            fx.sacrifice(ref.you, { self: true }, 1, { store: "s" }),
            ...fx.when(cond.v("s"), fx.createTokens(DRAGON_6)),
          ),
        ],
        { label: "A Treasure; with four Treasures, sacrifice the Saga: a 6/6 flying Dragon" },
      ),
    ],
  },
  "Misty Mountains Raider": {
    abilities: [triggered(when.attackWith(1), [fx.amass(ref.you, "Goblin", 2)], { label: "Amass Goblins 2" })],
  },
  // Storied: read from the text.
  "Óin the Brave": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["haste"] },
        { condition: cond.enduringStory, label: "Enduring story: +1/+0 and haste" },
      ),
      activated({ mana: "{1}", tap: true, discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw a card" }),
    ],
  },
  "Pinecone Strike": {
    // "Choose one or both."
    spell: modal(
      mode("3 damage to a creature", [target.creature("c")], [fx.exileIfDies(ref.target("c")), fx.damage(3, ref.target("c"))]),
      mode(
        "Destroys an artifact token",
        [target.permanent("a", ["Artifact"], { token: true }, "artifact token")],
        [fx.destroy(ref.target("a"))],
      ),
      mode(
        "Both",
        [target.creature("c"), target.permanent("a", ["Artifact"], { token: true }, "artifact token")],
        [fx.exileIfDies(ref.target("c")), fx.damage(3, ref.target("c")), fx.destroy(ref.target("a"))],
      ),
    ),
  },
  // Equip {3}: read from the text.
  "Ragged Short Spear": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))], {
        label: "Discard a card: draw two cards",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },

  // --- Smaug, the Great Calamity // Spew Flame --------------------------------
  // Flying: read from the text.
  "Smaug, the Great Calamity": {},
  "Spew Flame": { spell: spell([target.creature()], [fx.damage(5, ref.target())]) },

  "Smaug's Fury": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["reach", "firstStrike"])]),
  },
  "Snowslope Hunter": {
    abilities: [
      activated({
        sacrificeOther: { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }] } },
        activationCondition: cond.yourTurn,
        oncePerTurn: true,
        effects: [fx.impulse(1, "yourNextTurn")],
        label: "Sacrifice another creature or an artifact: exile the top card, playable until your next turn",
      }),
    ],
  },
  "Stone-Giant of High Pass": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(trigger, [fx.createTokens(STONE_BOULDER)], { label: "A Boulder (3/1 defender Wall)" }),
      ),
      activated({
        mana: "{2}{R}",
        sacrificeOther: { filter: { types: ["Artifact"] } },
        targets: [target.any()],
        effects: [fx.damage(4, ref.target())],
        label: "Sacrifice an artifact: 4 damage",
      }),
    ],
  },
  "Tidings of War": {
    castOptions: [flashback("{3}{R}")],
    spell: spell(
      [],
      [
        ...fx.when(cond.spellCastFromGraveyard, fx.amass(ref.you, "Goblin", 3)),
        ...fx.when(cond.not(cond.spellCastFromGraveyard), fx.amass(ref.you, "Goblin", 1)),
      ],
    ),
  },
};
