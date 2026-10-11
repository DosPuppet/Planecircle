/**
 * Commander: "Stolen Futures" deck (The Ur-Sphinx; white, blue and black; LoneWolf87x's list). Sphinxes (Unesh, Tivit,
 * Yennett, Consecrated Sphinx, Sphinx of the Second Sun), free spells taken from the opponents (Chancellor of the
 * Spires, Dazzling Sphinx, Master of Predicaments, Mnemonic Betrayal, Sphinx Ambassador, Breach the Multiverse), extra
 * turns and phases (Medomai the Ageless, Sphinx of the Second Sun), tutors and fast mana (Mystical Tutor, Grim
 * Monolith). Hall of the Bandit Lord is with the other lands of the decks (`edh/lands.ts`).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CLUE,
  cmp,
  cond,
  costReducer,
  doesntUntap,
  eventReplacement,
  FOOD,
  fx,
  manaAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const INSTANT_SORCERY: ObjectFilter = { types: ["Instant", "Sorcery"] };
const ARTIFACT_CREATURE: ObjectFilter = { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] };
/** "Reveal the top N cards. An opponent separates them into two piles; one into your hand, the other into your graveyard." */
const sphinxPiles = (n: number) => fx.piles(n, { revealed: true, opponentSeparates: true });

export const EDH_UR_SPHINX: Record<string, CardScript> = {
  // --- Sphinxes -------------------------------------------------------------------------------------------------------
  // Flying: read from the text (all the Sphinxes below).
  "Azor, the Lawbringer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.throughTheirNextTurn(
            { castLimit: { who: "you", during: "yourTurn", maxSpells: 0, spellTypes: { types: ["Instant", "Sorcery"] } } },
            ref.eachOpponent,
          ),
        ],
        { label: "Each opponent can't cast instant or sorcery spells during their next turn" },
      ),
      // "Pay {X}{W}{U}{U}": {W}{U}{U}, then X (a single payment in the rules; same result).
      triggered(
        when.attacksSelf,
        fx.mayPay("{W}{U}{U}", "Pay {X}{W}{U}{U} to gain X life and draw X cards?", [
          fx.payX("Pay X: you gain X life and draw X cards", "x"),
          fx.gainLife(amount.v("x")),
          fx.draw(amount.v("x")),
        ]),
        { label: "You may pay {X}{W}{U}{U}: gain X life and draw X cards" },
      ),
    ],
  },
  "Chancellor of the Spires": {
    leyline: { revealFirstUpkeep: [fx.mill(7, ref.eachOpponent)] },
    abilities: [
      triggered(when.entersSelf, [fx.castNow(ref.target(), { free: true })], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "opponent", "instant or sorcery card in an opponent's graveyard")],
        label: "You may cast an instant or sorcery card from an opponent's graveyard without paying its mana cost",
      }),
    ],
  },
  "Consecrated Sphinx": {
    abilities: [
      triggered(when.draw(undefined, "opponent"), fx.may("Draw two cards?", fx.draw(2)), {
        label: "An opponent draws a card: you may draw two cards",
      }),
    ],
  },
  "Dazzling Sphinx": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          { op: "exileUntil", filter: INSTANT_SORCERY, store: "d", who: ref.eventPlayer, storeAll: "all" },
          fx.castNow(ref.stored("d"), { free: true }),
          // "Then that player puts the exiled cards that weren't cast on the bottom of their library in a random order."
          fx.moveTo(ref.stored("all"), { to: "libraryBottom", shuffle: true }),
        ],
        {
          label: "That player exiles cards until an instant or sorcery card; you may cast it for free; the rest on the bottom",
        },
      ),
    ],
  },
  "Dream Trawler": {
    // Lifelink: read from the text.
    abilities: [
      triggered(when.draw(), [fx.pump(ref.self, 1, 0)], { label: "You draw a card: +1/+0 until end of turn" }),
      triggered(when.attacksSelf, [fx.draw(1)], { label: "Attacks: draw a card" }),
      activated({
        discard: 1,
        effects: [fx.modify(ref.self, { addKeywords: ["hexproof"] }), fx.tap(ref.self)],
        label: "Discard a card: hexproof until end of turn; tap it",
      }),
    ],
  },
  "Magister Sphinx": {
    abilities: [
      triggered(when.entersSelf, [fx.setLife(10, ref.target("p"))], {
        targets: [target.player("p")],
        label: "Target player's life total becomes 10",
      }),
    ],
  },
  "Master of Predicaments": {
    abilities: [
      // The opponent guesses without seeing the card; a wrong guess lets you cast it for free.
      triggered(
        when.combatDamageToPlayer,
        [
          fx.chooseAmong(ref.handOf(ref.you), ref.you, "c", { anyZone: true, prompt: "Choose a card in your hand" }),
          ...fx.yourChoice(
            "Is the mana value of the chosen card greater than 4?",
            "g",
            [
              {
                label: "Greater than 4",
                effects: fx.when(
                  cond.refMatches(ref.stored("c"), { compare: [cmp.manaValue("<=", 4)] }),
                  fx.castNow(ref.stored("c"), { free: true }),
                ),
              },
              {
                label: "4 or less",
                effects: fx.when(
                  cond.refMatches(ref.stored("c"), { minManaValue: 5 }),
                  fx.castNow(ref.stored("c"), { free: true }),
                ),
              },
            ],
            ref.eventPlayer,
          ),
        ],
        { label: "That player guesses the mana value of a card in your hand; wrong: you may cast it for free" },
      ),
    ],
  },
  "Medomai the Ageless": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.extraTurn], { label: "Take an extra turn after this one" }),
      staticAbility(
        "self",
        { addKeywords: ["cantAttack"] },
        { condition: cond.extraTurn, label: "Can't attack during extra turns" },
      ),
    ],
  },
  "Raffine, Scheming Seer": {
    // Ward {1}: read from the text.
    abilities: [
      triggered(when.attackWith(1), [fx.connive(ref.target(), amount.count({ types: ["Creature"], attacking: true }))], {
        targets: [target.creature("t", { attacking: true })],
        label: "Target attacking creature connives X (X: the number of attacking creatures)",
      }),
    ],
  },
  "Scholar of the Lost Trove": {
    abilities: [
      triggered(when.entersSelf, [fx.castNow(ref.target(), { free: true, after: "exile" })], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery", "Artifact"] })],
        label: "You may cast an instant, sorcery or artifact card from your graveyard for free (exiled afterwards)",
      }),
    ],
  },
  "Sharuum the Hegemon": {
    abilities: [
      triggered(when.entersSelf, fx.may("Return that artifact card to the battlefield?", fx.toBattlefield(ref.target())), {
        targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card in your graveyard")],
        label: "You may return an artifact card from your graveyard to the battlefield",
      }),
    ],
  },
  "Sphinx Ambassador": {
    abilities: [
      // "Search that player's library for a card": the card found stays there, remembered; they shuffle at the end.
      triggered(
        when.combatDamageToPlayer,
        [
          { op: "search", filter: {}, count: 1, library: ref.eventPlayer, store: "s" },
          fx.chooseForSelf("cardName", { who: ref.eventPlayer }),
          ...fx.when(
            cond.refMatches(ref.stored("s"), { types: ["Creature"], not: { chosen: "cardName" } }),
            fx.may(
              "Put that creature card onto the battlefield under your control?",
              fx.toBattlefield(ref.stored("s"), { underYourControl: true }),
            ),
          ),
          fx.shuffle(ref.eventPlayer),
        ],
        {
          label: "Search that player's library; they name a card; a creature without that name may enter under your control",
        },
      ),
    ],
  },
  "Sphinx Summoner": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search your library for an artifact creature card?", fx.search(ARTIFACT_CREATURE)), {
        label: "You may search your library for an artifact creature card",
      }),
    ],
  },
  "Sphinx of Uthuun": {
    abilities: [
      triggered(when.entersSelf, [sphinxPiles(5)], {
        label: "Reveal the top five cards; an opponent separates them into two piles; one into your hand",
      }),
    ],
  },
  "Sphinx of the Second Sun": {
    abilities: [
      triggered(when.postcombatMain, [fx.extraBeginningPhase], {
        label: "Postcombat main phase: an additional beginning phase after this phase",
      }),
    ],
  },
  "Tivit, Seller of Secrets": {
    // Ward {3}: read from the text. Council's dilemma (vote, 701.38): each vote takes effect as it is cast.
    abilities: [
      triggered(when.entersSelf, tivitVote(), { label: "Council's dilemma — evidence (Clue) or bribery (Treasure)" }),
      triggered(when.combatDamageToPlayer, tivitVote(), { label: "Council's dilemma — evidence (Clue) or bribery (Treasure)" }),
    ],
  },
  "Unesh, Criosphinx Sovereign": {
    abilities: [
      costReducer({ subtype: "Sphinx" }, 2, "Sphinx spells you cast cost {2} less"),
      triggered(when.enters({ subtype: "Sphinx", controller: "you" }), [sphinxPiles(4)], {
        label: "A Sphinx enters: reveal the top four cards; an opponent separates them into two piles",
      }),
    ],
  },
  "Windreader Sphinx": {
    abilities: [
      triggered(when.attacks({ types: ["Creature"], keyword: "flying" }), fx.may("Draw a card?", fx.draw(1)), {
        label: "A creature with flying attacks: you may draw a card",
      }),
    ],
  },
  "Yennett, Cryptic Sovereign": {
    // Vigilance, menace: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // "Reveal the top card of your library."
          fx.reveal(ref.libraryTop(ref.you)),
          ...fx.when(
            cond.refMatches(ref.libraryTop(ref.you), { compare: [cmp.parity("odd")] }),
            fx.castNow(ref.libraryTop(ref.you), { free: true, storeCast: "cast" }),
          ),
          ...fx.when(cond.not(cond.v("cast")), fx.draw(1)),
        ],
        { label: "Top card: you may cast it for free if its mana value is odd; otherwise, draw a card" },
      ),
    ],
  },

  // --- Other cards ----------------------------------------------------------------------------------------------------
  "Academy Manufactor": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { anySubtype: ["Clue", "Food", "Treasure"] },
        instead: { oneOfEach: [CLUE, FOOD, TREASURE] },
        modify: {},
        label: "If you would create a Clue, Food, or Treasure token, instead create one of each",
      }),
    ],
  },
  "Breach the Multiverse": {
    spell: spell(
      [],
      [
        fx.mill(10, ref.eachPlayer),
        // One card chosen for each player, then all of them put onto the battlefield at the same time.
        ...fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.chooseAmong(ref.zone("graveyard", p, { types: ["Creature", "Planeswalker"] }), ref.you, `breach${n}`, {
            anyZone: true,
            prompt: "Choose a creature or planeswalker card in that player's graveyard",
          }),
        ]),
        fx.toBattlefield(ref.union(...[0, 1, 2, 3, 4, 5].map((n) => ref.stored(`breach${n}`))), { underYourControl: true }),
        fx.modify(ref.permanentsOf(ref.you, { types: ["Creature"] }), { addSubtypes: ["Phyrexian"] }, "permanent"),
      ],
    ),
  },
  "Grim Monolith": {
    abilities: [
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
      manaAbility("C", 3),
      activated({ mana: "{4}", effects: [fx.untap(ref.self)], label: "Untap this artifact" }),
    ],
  },
  "Mnemonic Betrayal": {
    spell: spell(
      [],
      [
        fx.moveAll("graveyard", ref.eachOpponent, {}, { to: "exile" }, "m"),
        // "You may cast spells from among those cards": not the lands.
        fx.grantPlay(ref.filtered(ref.stored("m"), { notTypes: ["Land"] }), { anyMana: true }),
        fx.delayed([fx.moveTo(ref.target("m"), { to: "graveyard" })], { m: ref.stored("m") }),
        fx.exileOnResolve,
      ],
    ),
  },
  "Mystical Tutor": {
    spell: spell([], [fx.search(INSTANT_SORCERY, { to: "libraryTop" })]),
  },
  "Raise the Palisade": {
    spell: spell(
      [],
      [
        fx.chooseForSelf("creatureType"),
        fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], not: { chosen: "subtype" } }, { to: "hand" }),
      ],
    ),
  },
  Reconnaissance: {
    abilities: [
      activated({
        mana: "{0}",
        targets: [target.creature("t", { attacking: true, controller: "you" })],
        effects: [fx.removeFromCombat(ref.target()), fx.untap(ref.target())],
        label: "Remove an attacking creature you control from combat and untap it",
      }),
    ],
  },
  "Urza's Incubator": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      {
        ...costReducer({ types: ["Creature"], chosen: "subtype" }, 2, "Creature spells of the chosen type cost {2} less"),
        everyone: true,
      },
    ],
  },
};

/** Tivit: each player votes for evidence (investigate) or bribery (a Treasure); you may vote an additional time. */
function tivitVote() {
  const choices = [
    { label: "Evidence (investigate)", effects: [fx.createTokens(CLUE)] },
    { label: "Bribery (a Treasure)", effects: [fx.createTokens(TREASURE)] },
  ];
  return [
    ...fx.forEachPlayer(ref.eachPlayer, (p, n) => fx.yourChoice("Vote for evidence or bribery", `vote${n}`, choices, p)),
    ...fx.yourChoice("You may vote an additional time", "voteExtra", [...choices, { label: "No additional vote", effects: [] }]),
  ];
}
