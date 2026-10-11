/**
 * Commander: "The Fantastic Four" precon from Marvel Super Heroes (Invisible Woman, four colors without black).
 * Noncreature spells ("if you've cast a noncreature spell this turn"), rebound, paying {R}{G}{W}{U} when attacking.
 */
import type { Amount, CardScript, ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  cond,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const NONCREATURE: ObjectFilter = { notTypes: ["Creature"] };
/** "If you've cast a noncreature spell this turn" */
const CAST_NONCREATURE = cond.castThisTurn(1, true);
/** "At the beginning of combat on your turn, if you've cast a noncreature spell this turn, …" */
const heroCombat = (effects: Parameters<typeof triggered>[1], label: string, extra: object = {}) =>
  triggered(when.yourCombat, effects, { condition: CAST_NONCREATURE, label, ...extra });
const WALL: TokenSpec = {
  name: "Wall",
  colors: [],
  types: ["Creature"],
  subtypes: ["Wall"],
  power: 0,
  toughness: 3,
  keywords: ["defender", "reach"],
};
const MERFOLK: TokenSpec = { name: "Merfolk", colors: ["U"], types: ["Creature"], subtypes: ["Merfolk"], power: 1, toughness: 1 };
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 4,
  toughness: 4,
  keywords: ["flying", "haste"],
};
const mode = (label: string, targets: ModeDef["targets"], effects: ModeDef["effects"]): ModeDef => ({ label, targets, effects });
/** "You may pay {R}{G}{W}{U}. When you do, …" */
const payRGWU = (prompt: string, ...effects: Parameters<typeof fx.mayPay>[2][]) => fx.mayPay("{R}{G}{W}{U}", prompt, ...effects);
/** Greatest mana value among noncreature cards in your graveyard (Dragon Man). */
const MAX_NONCREATURE_GRAVEYARD: Amount = {
  kind: "aggregate",
  fn: "max",
  property: "manaValue",
  zone: "graveyard",
  filter: NONCREATURE,
} as Amount;

export const EDH_FANTASTIC: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  "Invisible Woman": {
    abilities: [
      heroCombat([fx.createTokens(WALL)], "A 0/3 Wall with defender and reach"),
      triggered(
        when.attackWith(),
        payRGWU(
          "Pay {R}{G}{W}{U} to pump a creature and make it unblockable?",
          fx.reflexive([target.creature()], [fx.pump(ref.target(), amount.count(CREATURE_YOU), 0, ["unblockable"])]),
        ),
        { label: "Pay {R}{G}{W}{U}: +1/+0 for each creature and unblockable" },
      ),
    ],
  },

  // --- Heroes ---------------------------------------------------------------------------------------------------------
  "Alicia Masters, Skilled Sculptor": {
    abilities: [
      heroCombat([fx.createTokens(TREASURE)], "A Treasure"),
      triggered(when.yourEndStep, [fx.returnControlToOwners(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"] }))], {
        label: "Sense the good: each player regains control of their creatures",
      }),
    ],
  },
  // Flying: read from the text.
  "Black Bolt, Inhuman King": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.pump(ref.self, 2, 2)], {
        label: "Noncreature spell: +2/+2 until end of turn",
      }),
      // "That player": the controller of the spell or ability that targets it (the player of the event).
      triggered(when.targetedByOpponent({ self: true }), [fx.destroy(ref.target())], {
        targets: [target.of(ref.eventPlayer, target.nonland("t"), "nonland permanent that player controls")],
        label: "Deadly voice: destroy a nonland permanent that player controls",
      }),
    ],
  },
  "Council of Reeds": {
    abilities: [
      playerStatic({ noLegendRule: { types: ["Creature"] }, label: "The legend rule doesn't apply to your creatures" }),
      heroCombat([fx.copyToken(ref.self)], "A token copy of Council of Reeds"),
    ],
  },
  // Flying: read from the text.
  "Crystal, Inhuman Princess": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.damage(amount.colorsOf(ref.eventObject), ref.eachOpponent)], {
        label: "Noncreature spell: as much damage to each opponent as it has colors",
      }),
      manaAbility(["R", "G", "W", "U"]),
    ],
  },
  // Flying: read from the text.
  "Dragon Man, Reformed Robot": {
    cdaPower: amount.max(amount.maxManaValue({ ...NONCREATURE, permanent: true, controller: "you" }), MAX_NONCREATURE_GRAVEYARD),
    castFromGraveyard: { discard: 1 },
  },
  "Franklin Richards, Ascendant": {
    abilities: [heroCombat([fx.discover(6)], "Discover 6")],
  },
  // Flying, trample, indestructible: read from the text.
  "Galactus, Devourer of Worlds": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.permanent("t", [], {}, "permanent")],
        label: "Exile a permanent",
      }),
      staticAbility(
        "self",
        {
          addBlockRules: [
            {
              mustAttackPlayer: "mostLifeOpponent",
              label: "Insatiable hunger: attacks an opponent with the most life each combat if able",
            },
          ],
        },
        { condition: cond.not(cond.controls({ name: "Silver Surfer, Galactus's Herald" })), label: "Insatiable hunger" },
      ),
    ],
  },
  // Flying: read from the text.
  "H.E.R.B.I.E., Lovable Robot": {
    abilities: [
      heroCombat([fx.surveil(1)], "ctx:imperative|Surveil 1"),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaChoice(1, ANY_COLOR)],
        label: "One mana of any color",
      }),
    ],
  },
  "Human Torch": {
    abilities: [
      heroCombat([fx.pump(ref.self, 0, 0, ["flying", "doubleStrike", "haste"])], "Flying, double strike and haste"),
      triggered(
        when.attacksSelf,
        payRGWU(
          "Pay {R}{G}{W}{U} so that its damage to an opponent also hits the others?",
          fx.modify(ref.self, {
            addAbilities: [
              triggered(
                when.combatDamageToOpponent("self"),
                [fx.damage(amount.eventAmount, ref.except(ref.eachOpponent, ref.eventPlayer))],
                { label: "That much damage to each other opponent" },
              ),
            ],
          }),
        ),
        { label: "Pay {R}{G}{W}{U}: its damage to an opponent also hits the others" },
      ),
    ],
  },
  // Vigilance: read from the text.
  "Lockjaw, Slobbering Teleporter": {
    abilities: [
      heroCombat(
        [
          fx.addCounters(ref.self, 1),
          fx.reflexive(
            [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
            [fx.pump(ref.self, 0, 0, ["unblockable"]), fx.pump(ref.target(), 0, 0, ["unblockable"])],
          ),
        ],
        "A +1/+1 counter; Lockjaw and another of your creatures can't be blocked",
      ),
    ],
  },
  // Reach, vigilance: read from the text.
  "Medusa, Inhuman Queen": {
    abilities: [
      triggered(when.castSpell("any", NONCREATURE), [fx.addCounters(ref.self, 1)], {
        label: "A player casts a noncreature spell: a +1/+1 counter",
      }),
    ],
  },
  // Reach, vigilance: read from the text.
  "Mister Fantastic": {
    abilities: [
      heroCombat([fx.draw(1)], "Draw a card"),
      activated({
        mana: "{R}{G}{W}{U}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "triggered ability you control",
            filter: { stackItems: { only: "triggered", controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 2)],
        label: "Copy one of your triggered abilities twice",
      }),
    ],
  },
  // Flying: read from the text.
  "Namor, Atlantean King": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.createTokens(MERFOLK)], { label: "Noncreature spell: a 1/1 Merfolk" }),
      // "Attacks a player who has more life than you": the defending player, compared on trigger; only your other
      // creatures attacking that player get +2/+0.
      triggered(when.attacksAPlayer, [fx.pumpAll({ ...CREATURE_YOU, attacking: ref.defendingPlayer, other: true }, 2, 0)], {
        triggerCondition: cond.amountGreater({ kind: "lifeTotal", who: ref.defendingPlayer }, amount.lifeTotal),
        label: "Your other attacking creatures get +2/+0",
      }),
    ],
  },
  // Flying, vigilance, trample, haste: read from the text.
  "Power Pack": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.pickFromZone("graveyard", { types: ["Instant", "Sorcery"] }, { to: "exile" }, { random: true, store: "p" }),
          fx.delayedAt("yourNextUpkeep", [fx.castNow(ref.target("p"), { free: true, after: "exile" })], { p: ref.stored("p") }),
        ],
        { label: "Exile an instant or sorcery at random; cast it for free at your next upkeep" },
      ),
    ],
  },
  // Flying: read from the text.
  "Silver Surfer, Galactus's Herald": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Search for Galactus, Devourer of Worlds?", fx.search({ name: "Galactus, Devourer of Worlds" }, { to: "hand" })),
        { label: "Search for Galactus" },
      ),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.modify(
            ref.target(),
            { addBlockRules: [{ mustAttackPlayer: "eventPlayer", label: "Attacks that player each combat if able" }] },
            "endOfYourNextTurn",
          ),
        ],
        { targets: [target.creature()], label: "A creature attacks that player each combat if able" },
      ),
    ],
  },
  // Trample: read from the text.
  "The Thing": {
    abilities: [
      heroCombat([fx.addCounters(ref.self, 4)], "Four +1/+1 counters"),
      triggered(
        when.attacksSelf,
        payRGWU(
          "Pay {R}{G}{W}{U} to double the counters on your permanents?",
          fx.reflexive(
            [target.upTo(10, target.permanent("t", [], { controller: "you" }, "permanent you control"))],
            [fx.doubleAllCounters(ref.target())],
          ),
        ),
        { label: "Pay {R}{G}{W}{U}: double each kind of counter on your target permanents" },
      ),
    ],
  },
  "Valeria Richards, Precocious": {
    abilities: [
      { kind: "costReduction", filter: NONCREATURE, generic: 1, label: "Your noncreature spells cost {1} less" },
      triggered(when.castSpell("you", NONCREATURE), [fx.draw(1)], {
        condition: cond.castThisTurn(1, true, true),
        label: "First noncreature spell of the turn: draw a card",
      }),
    ],
  },
  // "Can't be blocked": read from the text.
  "Willie Lumpkin, Postman": {
    abilities: [
      triggered(
        when.combatDamageToOpponent("self"),
        [
          fx.draw(1),
          ...fx.mayForStore(
            ref.eventPlayer,
            "Draw a card (you won't be able to attack its controller during your next turn)?",
            "d",
            fx.draw(1, ref.eventPlayer),
          ),
          // "During their next turn": until the end of that player's next turn.
          ...fx.when(cond.v("d"), fx.throughTheirNextTurn({ cantAttack: { of: "you" } }, ref.eventPlayer)),
        ],
        { label: "You draw; that player may draw, and then can't attack you" },
      ),
    ],
  },

  // --- Artifacts and enchantments -----------------------------------------------------------------------------------
  "Cosmic Crucible": {
    abilities: [
      triggered(when.step("main1", "you"), [fx.addManaCombination(4, ANY_COLOR)], {
        label: "First main phase: four mana in any combination of colors",
      }),
      triggered(
        when.castSpell("you", NONCREATURE),
        [
          ...fx.mayForStore(ref.you, "Copy this spell?", "c", fx.copySpell(ref.eventObject, 1)),
          ...fx.when(cond.v("c"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "You may copy a noncreature spell (once per turn)" },
      ),
    ],
  },
  "Mind's Dilation": {
    abilities: [
      triggered(
        { on: "castSpell", by: "opponent", nth: 1 },
        [fx.exileTop(ref.eventPlayer, 1, "m"), fx.castNow(ref.stored("m"), { free: true })],
        { label: "An opponent's first spell: they exile the top card, you may cast it for free" },
      ),
    ],
  },
  "Mirage Mirror": {
    abilities: [
      activated({
        mana: "{2}",
        targets: [
          target.permanent("t", ["Artifact", "Creature", "Enchantment", "Land"], {}, "artifact, creature, enchantment or land"),
        ],
        effects: [fx.becomeCopy(ref.self, ref.target(), "endOfTurn")],
        label: "Becomes a copy until end of turn",
      }),
    ],
  },
  "Monologue Tax": {
    abilities: [
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.createTokens(TREASURE)], {
        label: "An opponent's second spell: a Treasure",
      }),
    ],
  },
  "Negative Zone Portal": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "opponent", "card in an opponent's graveyard")],
        effects: [
          fx.exileCard(ref.target(), { name: "z" }),
          fx.link(ref.stored("z")),
          ...fx.when(cond.targetMatches("t", { types: ["Creature"] }), fx.draw(1)),
        ],
        label: "Exile a card from an opponent's graveyard (a creature: draw a card)",
      }),
      // "A card exiled with it at random": drawn among the linked cards still in exile.
      triggered(
        when.yourUpkeep,
        [
          fx.coinFlip("w"),
          ...fx.when(
            cond.not(cond.v("w")),
            fx.sacrificeIt(ref.self),
            fx.pickFromZone("graveyard", {}, { to: "hand" }, { pool: ref.linked, random: true }),
          ),
        ],
        {
          condition: cond.amountAtLeast(amount.refCount(ref.filtered(ref.linked, { types: ["Creature"] })), 4),
          label: "Four exiled creatures: flip a coin; on a loss, sacrifice it",
        },
      ),
    ],
  },
  // Flying: read from the text; no Crew (it becomes a creature when you cast a noncreature spell).
  "The Fantasticar": {
    abilities: [
      triggered(
        when.castSpell("you", NONCREATURE),
        fx.may("Does The Fantasticar become an artifact creature until end of turn?", fx.animateVehicle(ref.self)),
        { label: "Noncreature spell: it may become an artifact creature" },
      ),
      triggered(
        { on: "castSpell", by: "you", nth: 4, filter: NONCREATURE },
        [
          fx.sacrifice(ref.you, { self: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.createTokens(CONSTRUCT, 4)),
        ],
        { label: "Fourth noncreature spell: sacrifice it for four 4/4 Constructs" },
      ),
    ],
  },
  "Unstable Molecule Suit": {
    // Equip {4} and "Equip commander {2}": read from the text.
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["indestructible"] }, { label: "+2/+2, indestructible" }),
    ],
  },

  // --- Instants and sorceries (rebound, flashback and convoke read from the text) -----------------------------------
  "Cleansing Nova": {
    spell: {
      modes: [
        mode("Destroy all creatures", [], [fx.destroyAll({ types: ["Creature"] })]),
        mode(
          "Destroy all artifacts and enchantments",
          [],
          [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] })],
        ),
      ],
    },
  },
  "Clever Concealment": {
    spell: spell(
      [target.upTo(30, target.nonland("t", { controller: "you" }, "nonland permanent of yours"))],
      [fx.phaseOut(ref.target())],
    ),
  },
  "Cut a Deal": {
    // "For each opponent who drew a card this way": not one whose library was empty or whose draw was replaced.
    spell: spell([], [fx.draw(1, ref.eachOpponent, "deal"), fx.draw(amount.v("dealPlayers"))]),
  },
  "Deep Analysis": {
    flashback: "{1}{U}",
    flashbackCost: { payLife: 3 },
    spell: spell([target.player("p")], [fx.draw(2, ref.target("p"))]),
  },
  "Fantastic Elasticity": {
    spell: {
      modes: [
        mode("Return a nonland permanent", [target.nonland("n")], [fx.bounce(ref.target("n"))]),
        mode(
          "Get back an instant or sorcery",
          [target.cardInGraveyard("g", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery card in your graveyard")],
          [fx.toHand(ref.target("g"))],
        ),
      ],
    },
  },
  // The colors of the permanents you control and of the spells you've cast this turn (turn log), itself included.
  "First Family": {
    spell: spell([], [fx.draw(amount.colorsAmongWithSpellsCast), fx.gainLife(amount.colorsAmongWithSpellsCast)]),
  },
  "Flame On!": {
    spell: spell(
      [target.creature()],
      [
        fx.addCounters(ref.target(), amount.countIn("graveyard", { notTypes: ["Creature", "Land"] })),
        fx.pump(ref.target(), 0, 0, ["flying"]),
      ],
    ),
  },
  "Galvanic Iteration": {
    flashback: "{1}{U}{R}",
    spell: spell([], [fx.copyNextSpell]),
  },
  "Hull Breach": {
    spell: {
      modes: [
        mode("Destroy target artifact", [target.permanent("a", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target("a"))]),
        mode(
          "Destroy an enchantment",
          [target.permanent("e", ["Enchantment"], {}, "enchantment")],
          [fx.destroy(ref.target("e"))],
        ),
        mode(
          "Destroy target artifact and target enchantment",
          [target.permanent("a2", ["Artifact"], {}, "artifact"), target.permanent("e2", ["Enchantment"], {}, "enchantment")],
          [fx.destroy(ref.target("a2")), fx.destroy(ref.target("e2"))],
        ),
      ],
    },
  },
  "Into the Time Vortex": {
    abilities: [triggered(when.castSelf, [fx.cascade(5)], { label: "Cascade" })],
    spell: spell([], []),
  },
  "Invisible Force Field": {
    spell: spell(
      [target.upTo(4, target.permanent("t", [], { controller: "you" }, "permanent you control"))],
      [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
    ),
  },
  "It's Clobberin' Time!": {
    spell: {
      modes: [
        mode(
          "Your creature deals damage to an opposing creature",
          [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
          [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
        ),
        mode(
          "Destroy target artifact or enchantment",
          [target.permanent("d", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
          [fx.destroy(ref.target("d"))],
        ),
      ],
    },
  },
  "Nova Flame": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.addCounters(ref.target(), amount.x),
        fx.damage(
          amount.powerOf(ref.target()),
          ref.except(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"] }), ref.target()),
          ref.target(),
        ),
      ],
    ),
  },
  "Recurring Insight": {
    spell: spell([target.player("p", "opponent")], [fx.draw(amount.refCount(ref.handOf(ref.target("p"))))]),
  },
  "Seize the Day": {
    flashback: "{2}{R}",
    spell: spell([target.creature()], [fx.untap(ref.target()), fx.extraCombatAfterMain]),
  },
  "Taunt from the Rampart": {
    spell: spell(
      [],
      [
        fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"], controller: "opponent" }), "untilYourNextTurn", {
          addKeywords: ["cantBlock"],
        }),
      ],
    ),
  },
  Terramorph: {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield" })]),
  },
  // You choose for each player, among all their permanents (an artifact land can be the "artifact" kept); only their
  // nonland permanents are sacrificed.
  "Tragic Arrogance": {
    spell: spell(
      [],
      [
        fx.keep(
          ref.eachPlayer,
          "onePerType",
          { notTypes: ["Land"] },
          { chooser: "you", among: { types: ["Artifact", "Creature", "Enchantment", "Planeswalker"] } },
        ),
      ],
    ),
  },
  "Ultimate Nullification": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], legendary: true }, count: 1 } },
    spell: spell(
      [],
      [
        fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"] }, { to: "exile" }),
        fx.exileCard(ref.allGraveyards),
        fx.bottomOnResolve,
      ],
    ),
  },
};
