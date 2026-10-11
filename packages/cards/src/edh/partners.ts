/**
 * Commander: the reprints left out of the reprint sets for a Commander-only mechanic (`EXCLUDED_REPRINTS`, PLAN-G),
 * defined here since PLAN-L L2: the partners of Commander 2016 and of other Commander products (Breeches, Dargo,
 * Ishai, Kraum, Malcolm, Thrasios, Tymna, Vial Smasher), Inalla (eminence) and Yuriko (commander ninjutsu, 702.49d).
 * Partner itself is read from the text (`canPair`).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import { activated, amount, cond, fx, ninjutsu, ref, TO_OPPONENT, TREASURE, target, triggered, when } from "./common";

const PIRATES_YOU: ObjectFilter = { subtype: "Pirate", controller: "you" };
const LAND: ObjectFilter = { types: ["Land"] };
/** Opponents dealt combat damage this turn (Tymna). */
const OPPONENTS_DEALT_COMBAT_DAMAGE = amount.turnEvents({
  event: "damage",
  who: "opponent",
  combat: true,
  toPlayer: true,
  distinct: "player",
});

export const EDH_PARTNERS: Record<string, CardScript> = {
  "Breeches, Brazen Plunderer": {
    abilities: [
      triggered(
        when.dealsDamage(PIRATES_YOU, { to: TO_OPPONENT }),
        [fx.exileTop(ref.eventPlayers, 1, "b"), fx.grantPlay(ref.stored("b"), { anyMana: true })],
        { batched: true, label: "Pirates deal damage to opponents: exile their top cards, you may play them this turn" },
      ),
    ],
  },
  "Dargo, the Shipwrecker": {
    // {2} less for each permanent sacrificed this way (a cost paid) and for each other artifact or creature sacrificed
    // this turn (601.2f: counted before the sacrifices of this casting).
    additionalCost: { sacrificeToPay: { filter: { types: ["Artifact", "Creature"] }, each: 2 } },
    costReduction: {
      generic: amount.plus(
        amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact", "Creature"] }),
        amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact", "Creature"] }),
      ),
    },
  },
  "Inalla, Archmage Ritualist": {
    abilities: [
      triggered(
        when.enters({ subtype: "Wizard", controller: "you", token: false, other: true }),
        fx.mayPay(
          "{1}",
          "Pay {1} to create a token copy of that Wizard?",
          fx.copyToken(ref.eventObject, { addKeywords: ["haste"], exileAtEndStep: true }),
        ),
        { fromCommand: true, label: "Eminence — another Wizard enters: pay {1} for a hasty token copy" },
      ),
      activated({
        tapOthers: { filter: { subtype: "Wizard" }, count: 5, includeSelf: true },
        targets: [target.player()],
        effects: [fx.loseLife(7, ref.target())],
        label: "Tap five Wizards: target player loses 7 life",
      }),
    ],
  },
  "Ishai, Ojutai Dragonspeaker": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.addCounters(ref.self, 1)], {
        label: "An opponent casts a spell: a +1/+1 counter",
      }),
    ],
  },
  "Kraum, Ludevic's Opus": {
    abilities: [
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.draw(1)], {
        label: "An opponent casts their second spell each turn: draw a card",
      }),
    ],
  },
  "Malcolm, Keen-Eyed Navigator": {
    abilities: [
      triggered(
        when.dealsDamage(PIRATES_YOU, { to: TO_OPPONENT }),
        [fx.createTokens(TREASURE, amount.refCount(ref.eventPlayers))],
        { batched: true, label: "Pirates deal damage to opponents: a Treasure for each opponent dealt damage" },
      ),
    ],
  },
  "Thrasios, Triton Hero": {
    abilities: [
      activated({
        mana: "{4}",
        effects: [
          fx.scry(1),
          fx.reveal(ref.libraryTop(ref.you)),
          // The revealed card is put onto the battlefield if it's a land; otherwise (nothing moved), draw a card.
          fx.moveTo(ref.filtered(ref.libraryTop(ref.you), LAND), { to: "battlefield", tapped: true }, { name: "l" }),
          ...fx.when(cond.not(cond.amountAtLeast(amount.refCount(ref.stored("l")), 1)), fx.draw(1)),
        ],
        label: "Scry 1, reveal the top card: a land onto the battlefield tapped, otherwise draw",
      }),
    ],
  },
  "Tymna the Weaver": {
    abilities: [
      triggered(
        when.postcombatMain,
        fx.when(
          cond.amountAtLeast(OPPONENTS_DEALT_COMBAT_DAMAGE, 1),
          fx.mayPayLife(OPPONENTS_DEALT_COMBAT_DAMAGE, "Pay X life to draw X cards?", fx.draw(OPPONENTS_DEALT_COMBAT_DAMAGE)),
        ),
        { label: "Postcombat main phase: pay X life, draw X cards (opponents dealt combat damage)" },
      ),
    ],
  },
  "Vial Smasher the Fierce": {
    abilities: [
      triggered(
        when.castNthSpell(1),
        [
          fx.chooseOpponent("o", { random: true }),
          fx.chooseAmong(ref.withPlaneswalkers(ref.stored("o")), ref.you, "d", {
            prompt: "That player or a planeswalker they control",
          }),
          fx.damage(amount.manaValueOf(ref.eventObject), ref.stored("d")),
        ],
        { label: "Your first spell each turn: damage equal to its mana value to a random opponent" },
      ),
    ],
  },
  "Yuriko, the Tiger's Shadow": {
    abilities: [
      ninjutsu("{U}{B}", { commander: true }),
      triggered(
        when.combatDamage({ subtype: "Ninja", controller: "you" }, true),
        [
          fx.reveal(ref.libraryTop(ref.you)),
          fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "y" }),
          fx.loseLife(amount.manaValueOf(ref.stored("y")), ref.eachOpponent),
        ],
        { label: "A Ninja deals combat damage to a player: top card into hand, each opponent loses its mana value" },
      ),
    ],
  },
};
