# Final Fantasy (FIN, 307 cards including 2 assembled cards)

Mechanics and details of the lots (moved from CLAUDE.md).

Requested by the user on 2026-09-27.

| Mechanic | Lot |
|---|---|
| Towns (tapped lands, Adventure Towns) | A |
| tiered | A |
| "if at least four mana was spent" | A |
| job select and Equipment | A (simple), B |
| "Summon" Saga creatures | B |
| transformation (including Sagas on the back), assembly | C |
| remaining legendary cards and rares | D |

- Lot A ✅ (166/307). It covers:
  - job select (read from the text): on entering, a 1/1 Hero token is created and the Equipment attaches to it; "Name — Equip {N}" is read as Equip; helper `jobGear(type, P, T, keywords)`;
  - tiered (helper `tiered(...)`, like spree but a single tier); trigger `when.castNoncreatureWithMana(n)` (`minManaSpent`);
  - Adventure Towns (Lindblum, Midgar…): only the Adventure can be cast from the hand; the card "on an adventure" is played as a land from exile; the interface offers "Play this land" or "Cast [Adventure]";
  - `fx.counterExile` (Syncopate) and "unless its controller pays {X}" (X of the spell); `setBasePTAll` with power alone (PuPu UFO);
  - Hero, Knight, Moogle, Horror, Frog, Robot Warrior, Chocobo (2/2 Bird with landfall), 0/1 Wizard tokens (`fin/common.ts`);
  - AI: target enumeration discards the combinations that violate "another target" (`otherThan`).
- Lot B ✅ (188/307): 11 Equipment (`fin/gear.ts`) and 11 Summons (`fin/summons.ts`, Saga creatures written with `chapter`). The engine gains:
  - `fx.discard` remembers the discarded cards (`ref.stored`, Ninja's Blades);
  - Equip "pay 3 life, once per turn" written in the script (Dark Knight's Greatsword);
  - `chapter` is exported by `fdn/common.ts`;
  - fix: Territory Forge advances the state version when linking the card, and keeps only the abilities of a card that is still exiled; the fuzz cache invariant names the card and the diverging fields.

  Moved to lot D: Summon: Primal Odin ("that player loses the game"), Summon: Brynhildr, Summon: Fenrir, Summon: Bahamut (total mana value), Aettir and Priwen, Buster Sword, Genji Glove, The Masamune.
- Lot C ✅ (217/307): 18 transforming cards and the assembly Vanille + Fang = Ragnarok (`fin/transform.ts`, scripts by face name). The engine gains:
  - Sagas on the back: the face is recognized as a Saga at import (type line), it enters transformed with a lore counter, and the precombat main phase counter and the sacrifice (714.4) read the active face (`copiedDefId`); a Saga returned to its front is no longer a Saga;
  - helpers `flipOut` / `flipBack` ("exile it, then return it [transformed]");
  - the condition "a creature died under an opponent's control this turn" (`cond.creaturesDied(n, true)`, `turnStats.creaturesLost`);
  - 11 cards from the starter decks (`fin/starter.ts`, numbers outside the main set), with the amount `creaturesDiedThisTurn` and the `attach` effect that attaches several Equipment at once (Beatrix).
- Lot D1 ✅ (242/307): 25 legendary cards, Crystals and unique cards (`fin/legends.ts`). The engine gains:
  - the `equipped` filter (equipped creature, computed in the view);
  - the target "activated or triggered ability, or noncreature spell" (`stackItems.abilitiesOnly`, Louisoix's Sacrifice);
  - "unless its controller pays {1} for each…" (`unlessPays` with `genericAmount`), "that player loses the game" (`fx.playerLoses`);
  - damage dealt by another source to each creature (`damageAll` with `source`, Nibelheim Aflame);
  - doubled life gain (`doubler({ lifeGain })`), increased opponent mill (`opponentMillExtra`), the first coin won each turn (`winFirstCoinFlips`);
  - the restriction `noActivatedAbilities` (activated and mana abilities).
- Lot D2 ✅ (264/307): 22 cards (`fin/legends2.ts`, and Clive, Ultimecia, Sephiroth in `fin/transform.ts`). The engine gains:
  - the kicker without mana (`kickerCost`: sacrifice or return a permanent, chosen automatically, never a target of the spell);
  - extra turns (`GameState.extraTurns`, `fx.extraTurn`) and extra end steps (`fx.extraEndStep`, `cond.firstEndStep`);
  - the trigger "attacks alone" (`when.attacksAlone`), "a player sacrifices" (`when.sacrifice(filter, true)`);
  - the amounts `totalManaValue`, `eventManaSpent`, `devotion`; the effect `eachDealsDamage`; sacrificing half (`half`);
  - the player statics `landsEnterUntapped`, `playTopCard` (with a condition), `extraToken` (Quina);
  - the restrictions `minThreeBlockers` and `combatDamageImmune`; token copies "except it's a black Demon" (`setColors`, `setSubtypes`);
  - Cloud, Midgar Mercenary (`doubleTriggersWhenEquipped`); casting permissions that exile the spell afterwards (`grantPlay` with `exileAfter`).
- Lot D3 ✅ (288/307): 24 cards (`fin/legends3.ts`, and Kuja, Kefka, Serah, Esper Origins, Emet-Selch, Crystal Fragments, Terra in `fin/transform.ts`). The engine gains:
  - modifications when a spell arrives (`StackItem.arrival`): the next creature spell of the turn (`fx.nextCreatureSpell`, Fenrir, Brynhildr), counters added to a spell on the stack (`fx.spellArrivalCounters`, Torgal), artifacts cast from the graveyard with finality (`artifactsFromGraveyardLife`, Noctis);
  - damage doubled by a filtered source (`doubler({ damageFilter })`, Trance Kuja) or dealt to a player until the next turn (`fx.doubleDamageTo`, Lightning); the prevention of damage to your creatures this turn (Summon: Alexander);
  - **fix**: damage from a permanent's ability has that permanent as its source (lifelink, deathtouch, doublings);
  - the combat phase counter (`cond.firstCombat`), the conditions "an opponent dealt damage by a legendary creature", "a player was dealt N combat damage", "first legendary creature spell of the turn", "the creature with the greatest power";
  - the resolved spell that enters transformed (`fx.resolveToBattlefieldTransformed`, Esper Origins), playing from your graveyard and exiling your own graveyard (Hades), base P/T equal to life (Aettir and Priwen), mana ability without {T} once per turn (Vivi), Equip reduction on a target (`equipDiscountWhenTargeted`), filter `crew: "bySource"`, amount `cardTypesOf`, `removeCounters` of one kind with memorization.
- Lot D4 ✅ (**307/307**): the last 19 cards (`fin/legends4.ts`, and Zenos, Play Blitzball in `fin/transform.ts`). The engine gains:
  - `setController` (state.ts): every control change goes through it and emits the `controlChange` event (trigger `when.opponentGainsControl`, Zidane);
  - `fx.unattach`, the ward "pay life equal to its power" (`ward.lifePower`), delayed abilities "at the next upkeep" (`nextUpkeep`);
  - token copies with reduced Equip and sacrificed at the next upkeep (Firion); Triple Triad (`fx.tripleTriad`);
  - Ancient Adamantoise (keywords `keepsDamage`, `absorbsDamage`), the player's protection from their opponents (`protectionFromOpponents`, which became `protection: "opponents"` in lot E9 of PLAN-E);
  - filtered `playTopCard` and filtered doubled enters triggers (Traveling Chocobo), doubled death triggers (The Masamune);
  - the single-use free permission from the hand (`ref.handOf`, `grantPlay` with `oneOf`, Buster Sword);
  - the exile "instead of dying" linked by physical identity (`linkedUids`, The Darkness Crystal);
  - the triggers "the linked object leaves the battlefield" and "an opponent loses the game" (Zenos, Shinryu); the extra {C} from lands (Ultima); `lastAttachedTo` (Zack Fair). (Legendary cards, rares, complex transforming cards: Clive, Terra, Sephiroth, Zenos, Kefka, Kuja, Serah, Ultimecia, Emet-Selch, Esper Origins, Crystal Fragments, Play Blitzball…).

## PLAN-M M7 (rules 198)

- **Quina, Qu Gourmet:** token copies (`copyToken`) also come with the Frog, once per player who creates them (`createPlusTokens`, `actions.ts`, shared with Worldwalker Helm's Map and the copies of Moonlit Meditation).
- **Tests:** `fin.test.ts` (+1).
