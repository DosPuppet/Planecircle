# Edge of Eternities (EOE)

**✅ 260 / 260** (lots A to D). Mechanics and details of the lots (moved from CLAUDE.md).

| Mechanic | Cards | Lot |
|---|---:|---|
| warp | 32 | A |
| Station (Spacecraft, Planets) | 27 | B |
| void | 14 | A |
| Lander, Robot, Drone, Munitions tokens | ~40 | A |
| "your second spell each turn" | 6 | A |
| "two or more tapped creatures" | 6 | A |
| shock lands | 5 | A |

- Lot A ✅ (170/260). It covers:
  - warp (702.185):
    - casting option "(warp)" from the hand (`CardDef.warp`, read from the text, life included);
    - the permanent is exiled at the next end step, then castable again from exile on a later turn (`exiledVia` of kind `warp`);
    - Timeline Culler: from the graveyard; `warped` filter;
  - void: condition `cond.void` (a nonland permanent left the battlefield or a spell was cast with warp this turn);
  - generic triggers and tools:
    - `when.castNthSpell(2)`;
    - "whenever you sacrifice" (`when.sacrifice`, engine function `sacrifice`);
    - grouped combat damage (`when.combatDamageBatch`);
    - "enchanted creature is dealt damage";
    - "put into a graveyard from the battlefield" (`when.putIntoGraveyardSelf`);
    - "dies" for artifacts when the filter names them;
  - tapped or attacking tokens (`fx.createTappedTokens`); "if they pay" (`unlessPays` with `paidStore`); `blocking` and `damaged` filters;
  - blocking restrictions `canBlockOnlyFlyers` (Drone) and `cantBeBlockedByMoreThanOne`;
  - shock lands: two options "play this land" (pay 2 life, untapped; or tapped).
- Lot B ✅ (201/260): Station (702.184).
  - The tiers "N+ | …" and the creature threshold are read from the text (`CardDef.station`). A tier's keywords are automatic; its other abilities come from the script (`stationAbilities`), without which the card stays unhandled;
  - the "Station" ability is generated: the player chooses the creature to tap (`ActionOption.additional.tap`, `CastChoices.tap`), then the `station` effect puts as many charge counters as its power (Tapestry Warden: its toughness);
  - Planets; mana equal to the counters (`amountCounters`); legendary copies; `multicolored` filter;
  - tapping or untapping a permanent advances the state version ("tapped creatures" statics, detected by the fuzz).
- Lot C ✅ (241/260): 40 rares, mythics and unique cards (`eoe/rares.ts`). The engine gains:
  - the mana spent to cast (`manaSpent` on the spell and the permanent; Amount `manaSpent`, filter `manaSpentBelowValue` and comparison `cmp.manaValue("<=", amount.sourceManaSpent)`);
  - reduced activation costs (`reduction`, with a condition), "remove a counter from a creature", "tap X artifacts" (`tapX`);
  - player statics: doubled enters triggers, +1 card with a small hand, artifact spells from the top of the library, first spell free, uncounterable creature spells, unpreventable combat damage, lands from the graveyard, granted warp;
  - conditional or variable cost reductions (affinity for artifacts, second spell of the turn);
  - mana restricted to artifact abilities or to spells cast from anywhere other than hand, and the mana ability that taps another permanent (Gene Pollinator);
  - exiled cards playable under a condition, by their owner, with an added cost, lands tapped (`grantPlay`); "exile up to one nonland card";
  - an "exiled card" target (`TargetFilter.exiled`), granted ward (`wardAbility`, the card's ward is read only if Scryfall gives it as a keyword);
  - delayed abilities at the end step of your next turn and at end of combat (`fx.delayedAt`);
  - "[that player] may…; if they don't" (`fx.mayForStore`), "your life total becomes N", "dies or is exiled" (with minimum power), the condition "you attacked with a Spacecraft" (`cond.attackedWith`).
- Lot D ✅ (**260/260**): the last 19 cards (`eoe/unique.ts`). The engine gains:
  - **control of an opponent's turn** (722, The Dominion Bracelet): `GameState.turnControl`, `decider(s)` gives the player who decides; `submit` accepts their decision on behalf of the controlled player; the host and the server (clock) ask them for it; their view presents the decision as their own, with the controlled player's hand (`GameView.controlling`, banner "You control …");
  - devour (`CardDef.devour`, read from the text: sacrifices chosen during resolution);
  - filtered counter doubling (`countersFilter`), tokens replaced by copies of the enchanted permanent;
  - targets with limited total mana value (`maxTotalManaValue`), parity filters and "toughness ≤ X";
  - "each opponent chooses a creature and exiles it" (`sacrifice` with `exile`), the cards exiled by the source (`ref.exiledWith`);
  - `pickFromZone` among remembered or linked objects (`pool`), with variable maximum mana value;
  - "discard two cards unless you discard an artifact card", milling half the library;
  - a permanent put onto the battlefield attacking; the condition "a player controls no creatures";
  - enters replacements also apply to created tokens, and can read the mana spent and the lands that entered this turn.
- Smoke test: the scenario's opponent has a Goblin Firebomb in hand (target of artifact counterspells).

## PLAN-M M8b (rules 200)

- **Mm'menon, the Right Hand:** `ManaRestriction.spellFrom: "elsewhere"` (former `spellNotFromHand`), no change of behavior.
