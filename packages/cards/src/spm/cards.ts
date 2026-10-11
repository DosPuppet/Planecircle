/**
 * Marvel's Spider-Man — cards of the meta decks (phase 1 of plan P4, lot M1). The other cards of the set are in the
 * per-color files.
 */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cond,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Blue ------------------------------------------------------------------
  "Hydro-Man, Fluid Felon": {
    abilities: [
      triggered(when.castSpell("you", { colors: ["U"] }), [fx.pump(ref.self, 1, 1)], {
        condition: cond.sourceMatches({ types: ["Creature"] }),
        label: "+1/+1 until end of turn",
      }),
      triggered(
        when.yourEndStep,
        [
          fx.untap(ref.self),
          // "Until your next turn, it becomes a land and gains '{T}: Add {U}.'" (it is no longer a creature).
          fx.modify(ref.self, { setTypes: ["Land"], setSubtypes: [], addAbilities: [manaAbility("U")] }, "untilYourNextTurn"),
        ],
        { label: "Untaps and becomes a land until your next turn" },
      ),
    ],
  },
  // --- Green -----------------------------------------------------------------
  "Sandman, Shifting Scoundrel": {
    cda: { pt: amount.count({ types: ["Land"], controller: "you" }) },
    abilities: [
      blockAbility(block.notByPowerLE2),
      activated({
        mana: "{3}{G}{G}",
        fromGraveyard: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard")],
        effects: [fx.toBattlefield(ref.selfCard, { tapped: true }), fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Returns with a land card from your graveyard",
      }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Superior Spider-Man": {
    // "… except its name is Superior Spider-Man and it's a 4/4 Spider Human Hero in addition to its other types.
    // When you do, exile that card."
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"] },
        {
          fromGraveyards: true,
          exile: true,
          except: {
            setName: "Superior Spider-Man",
            setPower: 4,
            setToughness: 4,
            addSubtypes: ["Spider", "Human", "Hero"],
          },
        },
      ),
    ],
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Multiversal Passage": {
    // The basic land type is chosen when playing the land (one option per type); "pay 2 life" is read from the text.
    asEnters: [fx.chooseForSelf("landType")],
    abilities: [staticAbility("self", { addChosen: "landType" }, { label: "Is the chosen type" })],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Aunt May": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.gainLife(1), ...fx.when(cond.eventObjectMatches({ subtype: "Spider" }), fx.addCounters(ref.eventObject, 1))],
        { label: "Gain 1 life (Spider: +1/+1 counter)" },
      ),
    ],
  },
  "Carnage, Crimson Chaos": {
    // Mayhem {B}{R}: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveTo(ref.target(), { to: "battlefield" }, { name: "c" }),
          fx.modify(
            ref.stored("c"),
            {
              addKeywords: ["mustAttack"],
              addAbilities: [triggered(when.combatDamageToPlayer, [fx.sacrificeIt(ref.self)], { label: "Sacrifice it" })],
            },
            "permanent",
          ),
        ],
        {
          targets: [
            target.cardInGraveyard(
              "t",
              { types: ["Creature"], maxManaValue: 3 },
              "you",
              "creature card with mana value 3 or less",
            ),
          ],
          label: "Returns a creature, which attacks and is sacrificed after dealing damage to a player",
        },
      ),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Spider Manifestation": {
    abilities: [
      manaAbility(["R", "G"]),
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.untap(ref.self)], { label: "Untaps" }),
    ],
  },
  "Interdimensional Web Watch": {
    abilities: [
      triggered(when.entersSelf, [fx.exileTop(ref.you, 2, "w"), fx.grantPlay(ref.stored("w"), { untilYourNextTurn: true })], {
        label: "Exiles the top two cards, playable until the end of your next turn",
      }),
      manaAbility(["W", "U", "B", "R", "G"], 2, { restriction: { spellFrom: "exile" }, combination: true }),
    ],
  },
  "Spider-Sense": {
    // Web-slinging {U}: read from the text.
    spell: spell(
      [
        {
          id: "t",
          label: "instant, sorcery or triggered ability",
          filter: { spells: INSTANT_SORCERY, stackItems: { only: "triggered" } },
        },
      ],
      [fx.counter(ref.target())],
    ),
  },
};
