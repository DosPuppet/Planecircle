/**
 * Commander: "Nissa, Non-Green Animist (Landfall w/ Big Creatures)" deck (Nissa, Leyline Tamer; white, blue, black,
 * red). Landfall (Retreats, Emeria, Ob Nixilis, Roil Elemental, Ruin Crab, Valakut Exploration), replayed lands
 * (Crucible of Worlds, Trade Routes, Walking Atlas, Oboro), ordered top of library (Ponder, Portent, Sensei's Divining
 * Top, Scroll Rack) and big creatures (Avacyn, Elesh Norn, Hullbreaker Horror, Nezahal, Agent of Treachery).
 */
import type { CardScript, ObjectFilter, Ref } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  BIRD_W,
  cond,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const LEGENDARY_CREATURES_YOU: ObjectFilter = { types: ["Creature"], legendary: true, controller: "you" };
/** "Look at the top N cards, then put them back in any order" (nothing is taken). */
const reorderTop = (n: number, who?: Ref) => fx.lookAtTop(n, { count: 0, rest: "reorder", ...(who ? { who } : {}) });

export const EDH_NISSA: Record<string, CardScript> = {
  // --- Big creatures --------------------------------------------------------------------------------------------------
  "Agent of Treachery": {
    abilities: [
      triggered(when.entersSelf, [fx.gainControl(ref.target(), { indefinitely: true })], {
        targets: [target.permanent("t", [], {}, "permanent")],
        label: "Gain control of target permanent",
      }),
      // "If …": checked on trigger and on resolution (603.4).
      triggered(when.yourEndStep, [fx.draw(3)], {
        condition: cond.controls({ controller: "you", owner: "opponent" }, 3),
        label: "Three or more permanents you don't own: draw three cards",
      }),
    ],
  },
  // Flying, vigilance, indestructible: read from the text.
  "Avacyn, Angel of Hope": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["indestructible"] },
        { label: "Your other permanents have indestructible" },
      ),
    ],
  },
  // Emerge from artifact: read from the text (sacrifice an artifact, cost reduced by its mana value).
  Crabomination: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileTop(ref.target("p"), 1, "top"),
          fx.pickFromZone("graveyard", {}, { to: "exile" }, { who: ref.target("p"), random: true, store: "gy" }),
          fx.pickFromZone("hand", {}, { to: "exile" }, { who: ref.target("p"), random: true, store: "hd" }),
          fx.castNow(ref.union(ref.stored("top"), ref.stored("gy"), ref.stored("hd")), { free: true }),
        ],
        {
          targets: [target.player("p", "opponent")],
          label: "Target opponent exiles the top of their library, a card at random from their graveyard and from their hand",
        },
      ),
    ],
  },
  // Vigilance: read from the text.
  "Elesh Norn, Mother of Machines": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "enter" },
        label: "Permanents entering cause your abilities to trigger an additional time",
      }),
      playerStatic({
        triggerMod: { effect: "none", on: "enter", sources: { controller: "opponent" } },
        label: "Permanents entering don't cause abilities of permanents your opponents control to trigger",
      }),
    ],
  },
  // Flying: read from the text.
  "Emeria Angel": {
    abilities: [
      triggered(when.landfall, fx.may("Create a 1/1 Bird token with flying?", fx.createTokens(BIRD_W)), {
        label: "Landfall — 1/1 Bird token with flying",
      }),
    ],
  },
  // Flying: read from the text.
  "Emeria Shepherd": {
    abilities: [
      triggered(
        when.landfall,
        [
          ...fx.when(
            cond.eventObjectMatches({ subtype: "Plains" }),
            fx.yourChoice("Emeria Shepherd: target card…", "es", [
              { label: "Onto the battlefield", effects: [fx.toBattlefield(ref.target())] },
              { label: "Into your hand", effects: [fx.toHand(ref.target())] },
              { label: "Stays in the graveyard", effects: [] },
            ]),
          ),
          ...fx.when(
            cond.not(cond.eventObjectMatches({ subtype: "Plains" })),
            fx.may("Return target card to your hand?", fx.toHand(ref.target())),
          ),
        ],
        {
          targets: [target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "nonland permanent card")],
          label: "Landfall — a nonland permanent card returns (onto the battlefield with a Plains)",
        },
      ),
    ],
  },
  // Vigilance: read from the text.
  "Gandalf, Shadow's Foe": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"), { tapped: true })],
        {
          targets: [target.upTo(3, target.permanent("t", ["Land"], { controller: "you" }, "land you control"))],
          label: "Exile up to three of your lands, then return them tapped",
        },
      ),
      triggered(when.landfall, [fx.draw(1), fx.addCounters(ref.self, 1)], {
        label: "Landfall — draw a card, a +1/+1 counter on Gandalf",
      }),
    ],
  },
  // First strike: read from the text.
  "Geode Rager": {
    abilities: [
      triggered(when.landfall, [fx.goad(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }))], {
        targets: [target.player("p")],
        label: "Landfall — goad each creature target player controls",
      }),
    ],
  },
  // Flash: read from the text. "Choose up to one": each mode has an optional target.
  "Hullbreaker Horror": {
    rules: { cantBeCountered: true },
    abilities: [
      triggeredModal(
        when.castSpell("you"),
        [
          mode(
            "Return a spell you don't control to its owner's hand",
            [target.optional(target.spell("t", { controller: "opponent" }, "spell you don't control"))],
            [fx.bounce(ref.target())],
          ),
          mode(
            "Return a nonland permanent to its owner's hand",
            [target.optional(target.nonland("t"))],
            [fx.bounce(ref.target())],
          ),
        ],
        { label: "You cast a spell: return an opposing spell or a nonland permanent" },
      ),
    ],
  },
  "Nezahal, Primal Tide": {
    rules: { cantBeCountered: true },
    abilities: [
      playerStatic({ maxHandSize: "none", label: "You have no maximum hand size" }),
      triggered(when.castSpell("opponent", { notTypes: ["Creature"] }), [fx.draw(1)], {
        label: "An opponent casts a noncreature spell: draw a card",
      }),
      activated({
        discard: 3,
        effects: [
          fx.exileCard(ref.self, { name: "n" }),
          fx.delayed([fx.toBattlefield(ref.target("k"), { tapped: true })], { k: ref.stored("n") }),
        ],
        label: "Discard three cards: exile Nezahal, it returns tapped at the next end step",
      }),
    ],
  },
  "Ob Nixilis, the Fallen": {
    abilities: [
      triggered(
        when.landfall,
        fx.may("Target player loses 3 life and Ob Nixilis gets three +1/+1 counters?", fx.loseLife(3, ref.target("p")), [
          fx.addCounters(ref.self, 3),
        ]),
        { targets: [target.player("p")], label: "Landfall — 3 life lost, three +1/+1 counters" },
      ),
    ],
  },
  // Flying: read from the text.
  "Roil Elemental": {
    abilities: [
      triggered(
        when.landfall,
        fx.may(
          "Gain control of target creature for as long as you control Roil Elemental?",
          fx.gainControlWhileSource(ref.target()),
        ),
        { targets: [target.creature()], label: "Landfall — gain control of a creature" },
      ),
    ],
  },
  "Ruin Crab": {
    abilities: [
      triggered(when.landfall, [fx.mill(3, ref.eachOpponent)], { label: "Landfall — each opponent mills three cards" }),
    ],
  },
  "Walking Atlas": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield" },
            { min: 0, prompt: "Put a land card from your hand onto the battlefield" },
          ),
        ],
        label: "You may put a land from your hand onto the battlefield",
      }),
    ],
  },

  // --- Enchantments -------------------------------------------------------------------------------------------------
  "Retreat to Coralhelm": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode(
            "You may tap or untap target creature",
            [target.creature()],
            fx.yourChoice("Retreat to Coralhelm: target creature…", "rc", [
              { label: "Untap", effects: [fx.untap(ref.target())] },
              { label: "Tap", effects: [fx.tap(ref.target())] },
              { label: "Do nothing", effects: [] },
            ]),
          ),
          mode("Scry 1", [], [fx.scry(1)]),
        ],
        { label: "Landfall — tap or untap a creature, or scry 1" },
      ),
    ],
  },
  "Retreat to Hagra": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode(
            "Target creature gets +1/+0 and gains deathtouch",
            [target.creature()],
            [fx.pump(ref.target(), 1, 0, ["deathtouch"])],
          ),
          mode("Each opponent loses 1 life; you gain 1 life", [], [fx.loseLife(1, ref.eachOpponent), fx.gainLife(1)]),
        ],
        { label: "Landfall — +1/+0 and deathtouch, or drain 1" },
      ),
    ],
  },
  "Trade Routes": {
    abilities: [
      activated({
        mana: "{1}",
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "land you control")],
        effects: [fx.toHand(ref.target())],
        label: "Return a land you control to its owner's hand",
      }),
      activated({
        mana: "{1}",
        discard: 1,
        discardFilter: { types: ["Land"] },
        effects: [fx.draw(1)],
        label: "Discard a land card: draw a card",
      }),
    ],
  },
  // The exiled cards are linked to the enchantment ("exiled with this enchantment") and stay playable as long as they
  // remain exiled, even if it leaves the battlefield.
  "Valakut Exploration": {
    abilities: [
      triggered(
        when.landfall,
        [fx.exileTop(ref.you, 1, "v"), fx.link(ref.stored("v")), fx.grantPlay(ref.stored("v"), { forever: true })],
        {
          label: "Landfall — exile the top card; you may play it for as long as it remains exiled",
        },
      ),
      triggered(
        when.yourEndStep,
        [fx.moveTo(ref.linked, { to: "graveyard" }, { name: "g" }), fx.damage(amount.v("g"), ref.eachOpponent)],
        {
          condition: cond.amountAtLeast(amount.refCount(ref.linked), 1),
          label: "The exiled cards go to the graveyard: that much damage to each opponent",
        },
      ),
    ],
  },

  // --- Artifacts -----------------------------------------------------------------------------------------------------
  "Crucible of Worlds": {
    abilities: [playerStatic({ playFrom: { zone: "graveyard", what: "lands" }, label: "Play lands from your graveyard" })],
  },
  // The cards exiled face down return on top, then are put back in any order.
  "Scroll Rack": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            {},
            { to: "exile", faceDown: "you" },
            {
              count: amount.cardsIn("hand"),
              min: 0,
              store: "r",
              prompt: "Exile any number of cards from your hand face down",
            },
          ),
          fx.lookAtTop(amount.v("r"), { count: amount.v("r"), exact: true, to: { to: "hand" } }),
          fx.moveTo(ref.stored("r"), { to: "libraryTop" }),
          fx.lookAtTop(amount.v("r"), { count: 0, rest: "reorder" }),
        ],
        label: "Exchange cards from your hand for as many cards from the top of your library",
      }),
    ],
  },
  "Sensei's Divining Top": {
    abilities: [
      activated({ mana: "{1}", effects: [reorderTop(3)], label: "Look at the top three cards and reorder them" }),
      activated({
        tap: true,
        effects: [fx.draw(1), fx.moveTo(ref.self, { to: "libraryTop" })],
        label: "Draw a card, then put this artifact on top of your library",
      }),
    ],
  },
  "Wayfarer's Bauble": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Search for a basic land card, put it onto the battlefield tapped",
      }),
    ],
  },

  // --- Sorceries ----------------------------------------------------------------------------------------------------
  Ponder: {
    spell: spell([], [reorderTop(3), ...fx.may("Shuffle your library?", fx.shuffle()), fx.draw(1)]),
  },
  Portent: {
    spell: spell(
      [target.player("p")],
      [
        reorderTop(3, ref.target("p")),
        ...fx.may("Have that player shuffle their library?", fx.shuffle(ref.target("p"))),
        fx.delayedAt("nextUpkeep", [fx.draw(1)]),
      ],
    ),
  },
  "Scheming Symmetry": {
    spell: spell([target.exactly(2, target.player("p"))], [fx.search({}, { to: "libraryTop" }, 1, ref.target("p"))]),
  },

  // --- Lands ---------------------------------------------------------------------------------------------------------
  "Boggart Trawler": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.graveyardOf(ref.target("p")), { to: "exile" })], {
        targets: [target.player("p")],
        label: "Exile target player's graveyard",
      }),
    ],
  },
  // "You may pay 3 life; if you don't, it enters tapped": read from the text.
  "Boggart Bog": { abilities: [manaAbility("B")] },
  "Eiganjo, Seat of the Empire": {
    abilities: [
      manaAbility("W"),
      // Channel: from the hand, discarding the card; {1} less for each legendary creature you control.
      activated({
        mana: "{2}{W}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count(LEGENDARY_CREATURES_YOU) },
        targets: [
          {
            ...target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] }),
            label: "attacking or blocking creature",
          },
        ],
        effects: [fx.damage(4, ref.target())],
        label: "Channel — 4 damage to an attacking or blocking creature",
      }),
    ],
  },
  "Oboro, Palace in the Clouds": {
    abilities: [
      manaAbility("U"),
      activated({ mana: "{1}", effects: [fx.toHand(ref.self)], label: "Return Oboro to its owner's hand" }),
    ],
  },
  "Takenuma, Abandoned Mire": {
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{3}{B}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count(LEGENDARY_CREATURES_YOU) },
        effects: [
          fx.mill(3),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature", "Planeswalker"] },
            { to: "hand" },
            { prompt: "Return a creature or planeswalker card from your graveyard to your hand" },
          ),
        ],
        label: "Channel — mill three cards, then a creature or planeswalker returns to hand",
      }),
    ],
  },
  "Talon Gates of Madara": {
    abilities: [
      triggered(when.entersSelf, [fx.phaseOut(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Up to one target creature phases out",
      }),
      manaAbility("C"),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaChoice(1, ANY_COLOR)],
        label: "One mana of any color",
      }),
      activated({
        mana: "{4}",
        fromHand: true,
        effects: [fx.toBattlefield(ref.selfCard)],
        label: "Put this card from your hand onto the battlefield",
      }),
    ],
  },
};
