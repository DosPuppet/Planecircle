/**
 * Outlaws of Thunder Junction, lot B: legendaries, rares and unique cards (attack taxes, copies of spells and
 * abilities, creatures that saddled the Mount, coin flips, opponents' graveyards…).
 */
import type { CardScript, Effect, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BIRD_1,
  block,
  CREATURE_YOU_CONTROL,
  cond,
  ELK,
  eventReplacement,
  fx,
  loyalty,
  manaAbility,
  mercenary,
  mode,
  OUTLAW,
  OUTLAW_CREATURE,
  oneOrMore,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
  whileSaddled,
} from "./common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;
const LEGENDARY_CREATURE_YOU = { types: ["Creature" as const], controller: "you" as const, legendary: true };
const PLAYERS = (id = "t") => target.upTo(4, target.player(id));

/** Beau: legendary blue Ox, power and toughness equal to the number of lands you control. */
const BEAU: TokenSpec = {
  name: "Beau",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Ox"],
  legendary: true,
  power: 0,
  toughness: 0,
  cdaPT: amount.count({ types: ["Land"], controller: "you" }),
  text: "Beau's power and toughness are each equal to the number of lands you control.",
};

/** Meteorite: colorless artifact, "when it enters, 2 damage" and "{T}: one mana of any color". */
const METEORITE: TokenSpec = {
  name: "Meteorite",
  colors: [],
  types: ["Artifact"],
  subtypes: [],
  abilities: [
    triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 damage" }),
    manaAbility([...ALL_COLORS]),
  ],
  text: "When this token enters, it deals 2 damage to any target. {T}: Add one mana of any color.",
};

const freeFlashback = (what: ReturnType<typeof ref.target>): Effect => ({ op: "grantPlay", what, flashback: true, free: true });

export const UNIQUE: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Another Round": {
    spell: spell([], [fx.flickerChosen({ types: ["Creature"] }, amount.plus(amount.x, 1))]),
  },
  "Archangel of Tithes": {
    abilities: [
      playerStatic({
        attackTax: { amount: 1, defending: "youOrYourPlaneswalkers" },
        condition: cond.sourceMatches({ tapped: false }),
        label: "Attacking you or your planeswalkers: {1} per creature",
      }),
      playerStatic({ blockTax: 1, condition: cond.sourceMatches({ attacking: true }), label: "Blocking: {1} per creature" }),
    ],
  },
  "Aven Interrupter": {
    abilities: [
      triggered(when.entersSelf, [fx.plot(ref.target())], {
        targets: [target.spell("t")],
        label: "Exile a spell, it becomes plotted",
      }),
      {
        kind: "costReduction",
        filter: {},
        generic: -2,
        opponents: true,
        fromZones: ["graveyard", "exile"],
        label: "Opponents' spells from a graveyard or exile: cost {2} more",
      },
    ],
  },
  "Fortune, Loyal Steed": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      whileSaddled(
        [
          fx.delayedAt(
            "endOfCombat",
            [
              fx.chooseAmong(ref.target("c"), ref.you, "c1", {
                optional: true,
                prompt: "Also exile up to one creature that saddled it this turn",
              }),
              fx.exileCard(ref.target("f"), { name: "x" }),
              fx.exileCard(ref.stored("c1"), { name: "y" }),
              fx.toBattlefield(ref.stored("x")),
              fx.toBattlefield(ref.stored("y")),
            ],
            { f: ref.self, c: ref.crewedBy },
          ),
        ],
        { label: "End of combat: exile it with up to one creature that saddled it, then return them" },
      ),
    ],
  },
  "High Noon": {
    abilities: [
      playerStatic({ castLimit: { who: "each", maxSpells: 1 }, label: "Each player can cast only one spell each turn" }),
      activated({
        mana: "{4}{R}",
        sacrifice: true,
        targets: [target.any("t")],
        effects: [fx.damage(5, ref.target())],
        label: "5 damage",
      }),
    ],
  },
  "Prairie Dog": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.not(cond.handSpellThisTurn),
        label: "+1/+1 counter",
      }),
      activated({
        mana: "{4}{W}",
        effects: [
          fx.emblem(
            "Prairie Dog",
            "Until end of turn, if you would put one or more +1/+1 counters on a creature you control, put that many plus one instead.",
            [
              eventReplacement({
                event: "counters",
                to: "yourSide",
                toFilter: { types: ["Creature"] },
                counter: "+1/+1",
                modify: { add: 1 },
              }),
            ],
            false,
            true,
          ),
        ],
        label: "One more +1/+1 counter this turn",
      }),
    ],
  },

  // --- Blue ------------------------------------------------------------------
  "Archmage's Newt": {
    abilities: [
      triggered(
        when.combatDamage("self", true),
        [fx.when(cond.saddled, freeFlashback(ref.target())), fx.when(cond.not(cond.saddled), fx.grantFlashback(ref.target()))],
        {
          targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery")],
          label: "Flashback granted ({0} if saddled)",
        },
      ),
    ],
  },
  "Double Down": {
    abilities: [triggered(when.castSpell("you", OUTLAW), [fx.copySpell(ref.eventObject, 1)], { label: "Copy the outlaw spell" })],
  },
  "Fblthp, Lost on the Range": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card" }),
      // The top card has plot for its mana cost: a special action from the library (no stack).
      playerStatic({ plotFromLibraryTop: true, label: "You may plot nonland cards from the top of your library" }),
    ],
  },
  "The Key to the Vault": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], attached: "host" }, true),
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { notTypes: ["Land"] },
            count: 1,
            to: { to: "exile" },
            rest: "bottom",
            store: "k",
          }),
          fx.castNow(ref.stored("k"), { free: true }),
        ],
        { label: "Exile a nonland card, cast it for free" },
      ),
    ],
  },
  "Step Between Worlds": { exileOnResolve: true, spell: spell([], [fx.mayShuffleHandGraveyardDraw(7)]) },
  "Visage Bandit": {
    asEnters: [fx.chooseCopy({ types: ["Creature"], controller: "you" }, { except: { addSubtypes: ["Shapeshifter", "Rogue"] } })],
  },
  "Jace Reawakened": {
    castCondition: cond.turnsTakenAtLeast(4),
    abilities: [
      loyalty(1, { effects: fx.loot(1), label: "Draw, then discard" }),
      loyalty(1, {
        effects: [
          fx.pickFromZone(
            "hand",
            { notTypes: ["Land"], maxManaValue: 3 },
            { to: "exile" },
            { min: 0, store: "j", prompt: "You may plot a card" },
          ),
          fx.plot(ref.stored("j")),
        ],
        label: "Plot a card from your hand",
      }),
      loyalty(-6, {
        effects: [
          fx.emblem(
            "Jace Reawakened",
            "Until end of turn, whenever you cast a spell, copy it.",
            [triggered(when.castSpell("you"), [fx.copySpell(ref.eventObject, 1)], { label: "Copy the spell" })],
            false,
            true,
          ),
        ],
        label: "Emblem: copy your spells this turn",
      }),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Binding Negotiation": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller", optional: true, store: "d" }),
        fx.when(
          cond.not(cond.v("d")),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "graveyard" },
            {
              pool: ref.exiledCardsOf(ref.target()),
              min: 0,
              prompt: "You may put one of their exiled cards into their graveyard",
            },
          ),
        ),
      ],
    ),
  },
  "Caustic Bronco": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }),
          fx.when(cond.saddled, fx.loseLife(amount.manaValueOf(ref.stored("c")), ref.eachOpponent)),
          fx.when(cond.not(cond.saddled), fx.loseLife(amount.manaValueOf(ref.stored("c")))),
        ],
        { label: "Top card into your hand, life loss" },
      ),
    ],
  },
  "Kaervek, the Punisher": {
    abilities: [
      triggered(
        when.crime,
        [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.castCopiesFree([ref.stored("k")], 99, { paid: true, storeCast: "kc" }),
          fx.when(cond.v("kc"), fx.loseLife(2)),
        ],
        {
          targets: [target.upTo(1, target.cardInGraveyard("t", { colors: ["B"] }, "you", "black card"))],
          label: "Copy a black card from your graveyard",
        },
      ),
    ],
  },
  "Tinybones Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], { targets: [PLAYERS()], label: "Each targeted player discards" }),
      triggered(when.enters(LEGENDARY_CREATURE_YOU), [fx.mill(1, ref.target()), fx.loseLife(1, ref.target())], {
        targets: [PLAYERS()],
        label: "Mill a card, lose 1 life",
      }),
    ],
  },
  "Tinybones, the Pickpocket": {
    abilities: [
      triggered(when.combatDamage("self", true), [fx.castNow(ref.target(), { anyMana: true })], {
        targets: [
          target.of(
            ref.eventPlayer,
            target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "any", "nonland permanent card"),
            "nonland permanent card from that player's graveyard",
          ),
        ],
        label: "Cast a card from their graveyard",
      }),
    ],
  },

  // --- Red -------------------------------------------------------------------
  "Calamity, Galloping Inferno": {
    abilities: [
      // Twice: a nonlegendary creature that saddled it, chosen, and a tapped and attacking copy.
      whileSaddled(
        ["a", "b"].flatMap((k) => [
          fx.chooseAmong(ref.filtered(ref.crewedBy, { types: ["Creature"], legendary: false }), ref.you, k, {
            prompt: "Choose a nonlegendary creature that saddled it",
          }),
          fx.copyToken(ref.stored(k), { tapped: true, attacking: true, sacrificeAtEndStep: true }),
        ]),
        { label: "Two attacking copies of a creature that saddled it" },
      ),
    ],
  },
  "Great Train Heist": {
    spell: spree(
      {
        cost: "{2}{R}",
        label: "Untap your creatures, additional combat",
        // "If it's your combat phase, there is an additional combat phase after this phase."
        effects: [
          fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })),
          ...fx.when(
            cond.all(
              cond.yourTurn,
              cond.any(
                cond.step("beginCombat"),
                cond.step("declareAttackers"),
                cond.step("declareBlockers"),
                cond.step("firstStrikeDamage"),
                cond.step("combatDamage"),
                cond.step("endCombat"),
              ),
            ),
            fx.extraCombat,
          ),
        ],
      },
      { cost: "{2}", label: "+1/+0 and first strike", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 0, ["firstStrike"])] },
      {
        cost: "{R}",
        label: "Combat damage: Treasures",
        targets: [target.player("p", "opponent")],
        // "Whenever a creature you control deals combat damage to that player this turn" (PLAN-L L4).
        effects: [
          fx.whenThisTurn(when.combatDamage(CREATURE_YOU_CONTROL, true), ref.target("p"), [fx.createTappedTokens(TREASURE)], {
            label: "Tapped Treasure",
          }),
        ],
      },
    ),
  },
  "Magebane Lizard": {
    abilities: [
      triggered(
        when.castSpell("any", { notTypes: ["Creature"] }),
        [fx.damage(amount.noncreatureCastBy(ref.eventPlayer), ref.eventPlayer)],
        {
          label: "Damage to the caster",
        },
      ),
    ],
  },
  "Resilient Roadrunner": {
    abilities: [
      protectionAbility(protection.from({ subtype: "Coyote" }, "Protection from Coyotes")),
      activated({
        mana: "{3}",
        effects: [
          fx.modify(ref.self, {
            addBlockRules: [block.notBy({ not: { keyword: "haste" } }, "Can't be blocked except by creatures with haste")],
          }),
        ],
        label: "Blocked only by haste",
      }),
    ],
  },
  "Return the Favor": {
    spell: spree(
      {
        cost: "{1}",
        label: "Copy a spell or ability",
        targets: [{ id: "c", label: "spell or ability", filter: { stackItems: {} } }],
        effects: [fx.copySpell(ref.target("c"), 1)],
      },
      {
        cost: "{1}",
        label: "Change the target",
        targets: [target.stackItemSingleTarget("b")],
        effects: [fx.changeTarget(ref.target("b"))],
      },
    ),
  },
  "Terror of the Peaks": {
    abilities: [
      playerStatic({ targetLifeTax: 3, label: "Opponents' spells that target it: cost 3 life more" }),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.damage(amount.powerOf(ref.eventObject), ref.target())],
        {
          targets: [target.any("t")],
          label: "Damage equal to its power",
        },
      ),
    ],
  },

  // --- Multicolor ------------------------------------------------------------
  "Annie Joins Up": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creatureOrPlaneswalker("t", { controller: "opponent" })],
        label: "5 damage",
      }),
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], legendary: true } },
        label: "Triggers of your legendaries doubled",
      }),
    ],
  },
  "Assimilation Aegis": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t"))],
        label: "Exile a creature",
      }),
      // "Whenever this Equipment becomes attached to a creature, for as long as this Equipment remains attached to it,
      // that creature becomes a copy of a creature card exiled with this Equipment" (PLAN-M M3b, Eriette's family).
      triggered(
        { on: "becomesAttached", who: "self", to: { types: ["Creature"] } },
        [
          fx.becomeCopy(ref.attached, ref.filtered(ref.exiledWith, { types: ["Creature"] }), "whileAttached", {
            attachment: ref.self,
          }),
        ],
        { label: "The equipped creature becomes a copy of the exiled creature" },
      ),
    ],
  },
  "Bonny Pall, Clearcutter": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BEAU)], { label: "Beau" }),
      triggered(
        when.attackWith(1),
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, store: "h", prompt: "A land from your hand" },
          ),
          fx.when(
            cond.not(cond.v("h")),
            fx.pickFromZone(
              "graveyard",
              { types: ["Land"] },
              { to: "battlefield" },
              { min: 0, prompt: "A land from your graveyard" },
            ),
          ),
        ],
        { label: "Draw, then a land" },
      ),
    ],
  },
  "Breeches, the Blastmaker": {
    abilities: [
      triggered(
        when.castNthSpell(2),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.coinFlip("w")),
          fx.when(cond.all(cond.v("s"), cond.v("w")), fx.copySpell(ref.eventObject, 1)),
          fx.when(cond.all(cond.v("s"), cond.not(cond.v("w"))), fx.damage(amount.manaValueOf(ref.eventObject), ref.target())),
        ],
        { targets: [target.any("t")], label: "Sacrifice an artifact: flip a coin" },
      ),
    ],
  },
  "Doc Aurlock, Grizzled Genius": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard", "exile"],
        label: "Spells from a graveyard or exile: cost {2} less",
      },
      playerStatic({ abilityCost: { ability: "plot", reduce: 2 }, label: "Plotting costs {2} less" }),
    ],
  },
  "Eriette, the Beguiler": {
    // "Whenever an Aura you control becomes attached to a nonland permanent an opponent controls with mana value less
    // than or equal to that Aura's mana value, you gain control of that permanent for as long as that Aura is attached
    // to it" (PLAN-L L5).
    abilities: [
      triggered(
        {
          on: "becomesAttached",
          who: { subtype: "Aura", controller: "you" },
          to: { controller: "opponent", notTypes: ["Land"] },
        },
        [fx.gainControl(ref.hostOf(ref.eventObject), { whileAttached: ref.eventObject })],
        {
          triggerCondition: cond.not(
            cond.amountGreater(amount.manaValueOf(ref.hostOf(ref.eventObject)), amount.manaValueOf(ref.eventObject)),
          ),
          label: "An Aura of yours steals the cheaper permanent it enchants",
        },
      ),
    ],
  },
  "Ertha Jo, Frontier Mentor": {
    abilities: [
      triggered(when.entersSelf, [mercenary()], { label: "1/1 Mercenary" }),
      triggered(when.activateTargeting, [fx.copySpell(ref.eventObject, 1)], { label: "Copy the ability" }),
    ],
  },
  "Ghired, Mirror of the Wilds": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", token: false },
        {
          addAbilities: [
            activated({
              tap: true,
              targets: [
                targetObj("t", { token: true, controller: "you", enteredThisTurn: true }, "token that entered this turn"),
              ],
              effects: [fx.copyToken(ref.target())],
              label: "Copy a token that entered this turn",
            }),
          ],
        },
        { label: '"{T}: copy a token"' },
      ),
    ],
  },
  "The Gitrog, Ravenous Ride": {
    abilities: [
      // "You may sacrifice a creature that saddled it this turn. If you do, draw X cards": X is the
      // power of the sacrificed creature (last known information).
      triggered(
        when.combatDamage("self", true),
        [
          fx.chooseAmong(ref.crewedBy, ref.you, "g", {
            optional: true,
            prompt: "You may sacrifice a creature that saddled it this turn",
          }),
          fx.sacrificeIt(ref.stored("g")),
          fx.draw(amount.powerOf(ref.stored("g"))),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield", tapped: true },
            { count: amount.powerOf(ref.stored("g")), min: 0 },
          ),
        ],
        { condition: cond.amountAtLeast(amount.refCount(ref.crewedBy), 1), label: "Sacrifice: draw, lands" },
      ),
    ],
  },
  "Kambal, Profiteering Mayor": {
    abilities: [
      triggered(when.enters({ token: true, controller: "opponent" }), [fx.copyToken(ref.eventObjects, { tapped: true })], {
        oncePerTurn: true,
        batched: true,
        label: "Tapped copies of opponents' tokens",
      }),
      triggered(when.enters({ token: true, controller: "you" }), fx.drain(1), { batched: true, label: "Drain 1" }),
    ],
  },
  "Kellan, the Kid": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", notFromHand: true },
        [
          // "You may cast a permanent spell with lesser or equal mana value from your hand without paying its mana
          // cost. If you don't, you may put a land card from your hand onto the battlefield."
          fx.castNow(ref.handOf(ref.you, { permanent: true }, amount.manaValueOf(ref.eventObject)), {
            free: true,
            storeCast: "k",
          }),
          fx.when(cond.not(cond.v("k")), fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield" }, { min: 0 })),
        ],
        { label: "Cast a permanent spell for free, otherwise a land" },
      ),
    ],
  },
  "Laughing Jasper Flint": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", owner: "opponent" },
        { addSubtypes: ["Mercenary"] },
        {
          label: "Your stolen creatures are Mercenaries",
        },
      ),
      triggered(
        when.yourUpkeep,
        [
          fx.exileTop(ref.target(), amount.count({ ...OUTLAW_CREATURE, controller: "you" }), "j"),
          fx.grantPlay(ref.stored("j"), { anyMana: true }),
        ],
        { targets: [target.player("t", "opponent")], label: "Exile cards from the top of their library, castable" },
      ),
    ],
  },
  "Lazav, Familiar Stranger": {
    abilities: [
      triggered(
        when.crime,
        [
          fx.addCounters(ref.self, 1),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "exile" },
            { pool: ref.allGraveyards, min: 0, store: "l", prompt: "You may exile a card from a graveyard" },
          ),
          fx.when(
            cond.refMatches(ref.stored("l"), { types: ["Creature"] }),
            fx.may("Does Lazav become a copy of that card until end of turn?", fx.becomeCopy(ref.self, ref.stored("l"))),
          ),
        ],
        { oncePerTurn: true, label: "Counter, exile a card, copy it" },
      ),
    ],
  },
  "Lilah, Undefeated Slickshot": {
    abilities: [
      // "cast from your hand": read on the spell when it is cast (the `spellCastFromHand` condition would apply
      // to the resolving ability).
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"], multicolored: true }, fromHand: true },
        [fx.plotOnResolve(ref.eventObject)],
        { label: "The spell will be plotted" },
      ),
    ],
  },
  "Make Your Own Luck": {
    spell: spell(
      [],
      [
        fx.lookAtTop(3, { filter: { notTypes: ["Land"] }, count: 1, to: { to: "exile" }, rest: "hand", store: "m" }),
        fx.plot(ref.stored("m")),
      ],
    ),
  },
  "Obeka, Splitter of Seconds": {
    abilities: [
      triggered(when.combatDamage("self", true), [fx.extraUpkeeps(amount.eventAmount)], {
        label: "Additional upkeep steps",
      }),
    ],
  },
  "Oko, the Ringleader": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.becomeCopy(ref.self, ref.target(), "endOfTurn", { addKeywords: ["hexproof"] })], {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Becomes a copy of a creature you control",
      }),
      loyalty(1, {
        effects: [fx.draw(2), fx.when(cond.crime, fx.discard(1)), fx.when(cond.not(cond.crime), fx.discard(2))],
        label: "Draw two, then discard",
      }),
      loyalty(-1, { effects: [fx.createTokens(ELK)], label: "3/3 Elk" }),
      loyalty(-5, {
        effects: [fx.copyToken(ref.permanentsOf(ref.you, { notTypes: ["Land"], other: true }))],
        label: "Copy your other nonland permanents",
      }),
    ],
  },
  "Rakdos, the Muscle": {
    abilities: [
      triggered(
        when.sacrifice({ types: ["Creature"], other: true }),
        [
          fx.exileTop(ref.target(), amount.manaValueOf(ref.eventObject), "r"),
          fx.grantPlay(ref.stored("r"), { untilYourNextEndStep: true, anyMana: true }),
        ],
        { targets: [target.player("t")], label: "Exile cards from their library, playable" },
      ),
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        oncePerTurn: true,
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Gains indestructible, tap it",
      }),
    ],
  },
  "Riku of Many Paths": {
    abilities: [
      // "Choose up to X, where X is the number of times you chose a mode for that spell": each combination of modes,
      // under the condition X ≥ its number of modes (each Riku mode at most once), or none.
      triggeredModal(
        { on: "castSpell", by: "you", modal: true },
        [
          ...oneOrMore(
            {
              label: "Exile the top card, playable",
              effects: [fx.exileTop(ref.you, 1, "k"), fx.grantPlay(ref.stored("k"), { untilYourNextTurn: true })],
            },
            { label: "+1/+1 counter and trample", effects: [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["trample"])] },
            { label: "1/1 flying Bird", effects: [fx.createTokens(BIRD_1)] },
          ).map((m) => ({ ...m, condition: cond.amountAtLeast(amount.eventModesChosen, m.chosen ?? 1) })),
          mode("None", [], []),
        ],
        { label: "Up to X modes" },
      ),
    ],
  },
  "Roxanne, Starfall Savant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTappedTokens(METEORITE)], { label: "Meteorite" }),
      triggered(when.attacksSelf, [fx.createTappedTokens(METEORITE)], { label: "Meteorite" }),
      eventReplacement({
        event: "mana",
        to: "you",
        source: { types: ["Artifact"], token: true },
        modify: { add: 1 },
        label: "Artifact tokens: one more mana",
      }),
    ],
  },
  "Satoru, the Infiltrator": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", token: false }),
        [fx.when(cond.not(cond.amountAtLeast(amount.eventManaSpent, 1)), fx.draw(1))],
        { batched: true, label: "Draw" },
      ),
    ],
  },
  "Taii Wakeen, Perfect Shot": {
    abilities: [
      triggered(
        { on: "dealsDamage", who: {}, anySourceYouControl: true, noncombatOnly: true, exactToughness: true },
        [fx.draw(1)],
        {
          label: "Draw",
        },
      ),
      activated({
        mana: "{X}",
        tap: true,
        // "This turn, if a source you control would deal noncombat damage, it deals that much damage plus X instead."
        effects: [
          fx.thisTurn({
            replacement: { event: "damage", source: { controller: "you" }, combat: false, modify: { add: amount.x } },
          }),
        ],
        label: "Noncombat damage +X",
      }),
    ],
  },
  "Vraska, the Silencer": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent", token: false }),
        fx.mayPay(
          "{1}",
          "Pay {1} to bring it back as a Treasure?",
          fx.moveTo(ref.eventObject, { to: "battlefield", underYourControl: true, tapped: true }, { name: "v" }),
          fx.modify(
            ref.stored("v"),
            {
              setTypes: ["Artifact"],
              setSubtypes: ["Treasure"],
              addAbilities: [manaAbility([...ALL_COLORS], 1, { sacrifice: true })],
            },
            "permanent",
          ),
        ),
        { label: "Bring it back as a Treasure" },
      ),
    ],
  },

  // --- Colorless -------------------------------------------------------------
  "Luxurious Locomotive": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE, amount.refCount(ref.crewedBy))], {
        label: "A Treasure for each creature that crewed it",
      }),
    ],
  },
};
