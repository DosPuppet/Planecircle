# The Lost Caverns of Ixalan (LCI, 279 cards)

Mechanics and details of the lots.

Requested by the user on 2026-09-28. Explore (701.44), Map tokens and finality counters already existed in the core.

| Mechanic | Lot |
|---|---|
| Cards doable with the engine (explore, Maps, Treasures, Descend 4 and 8, fathomless descent), tokens, "Restless" lands, simple Caves | A |
| Discover, "if you descended this turn", Cave mana | B |
| Craft (Craft with …) and back faces | C |
| Legendary and unique cards | D |

The scripts are in `packages/cards/src/lci/`: `white`, `blue`, `black`, `red`, `green`, `multi` (legendary cards included) and `artifacts` (colorless artifacts and lands). The helpers are in `lci/common.ts`: `descend(4 | 8)` and `PERMANENT_CARDS` (permanent cards in your graveyard), `CAVES` (Caves you control plus Cave cards in the graveyard), `ARTIFACT_ENTERED`, the Gnome, Fungus, 3/3 Dinosaur, Egg, Angel, Merfolk, Skeleton Pirate, Vampire, Vampire Demon, Golem, Spirit and Gnome Soldier tokens.

- Lot A ✅ (185/279). It covers:
  - Descend N: a condition on the number of permanent cards in the graveyard (`cond.amountAtLeast`), without new engine code; fathomless descent goes through `perGraveyard` (statics) or `PERMANENT_CARDS` (amounts);
  - the "Restless" lands (helper `restless`: tapped, two-color, animated by `fx.modify`, attack trigger) and the Caves with simple abilities;
  - transforming cards without craft: Grasping Shadows, Dowsing Device, Growing Rites of Itlimoc, Huatli (Saga on the back), Treasure Map;
  - **fix**: a permanent put onto the battlefield tapped by an effect (`moveWithSpec`) advances the state version; the fuzz found it with The Wandering Rescuer.
- Lot B ✅ (221/279). The engine gains:
  - Discover (701.57): effect `discover` (`fx.discover(n, { who, store })`, `ops/spells.ts`). The exiled cards are revealed (`reveal` event), the rest goes on the bottom in a random order; the player chooses (intent `discover`) to cast the card without paying its mana cost or to put it into hand. Trigger `when.discover` (`amount.eventAmount`: the value N);
  - "this turn" Descend: `turnStats.descended`, counted in `moveObject` (permanent card, not a token, put into its owner's graveyard from anywhere); `cond.descended` and `amount.descendedThisTurn`;
  - Cave mana: `payMana` returns the sources tapped by the automatic payment; the spell retains `spentFrom.cave` (passed to the permanent, `amount.caveManaSpent`) and `manaSources`;
  - the options of the `castSpell` trigger: `usingManaFromSelf` ("using mana produced by [this source]": Tecutlan) and `fromExile` (Quintorius Kand).
- Lot C ✅ (239/279). The engine gains:
  - Craft (702.167): cost `craft` (`CostDef.craft`, helper `craft(mana, materials)` in `dsl.ts`) and effect `craftReturn`. The materials (`craftMaterials`, `stack.ts`) are chosen automatically: graveyard cards first, then tokens, then other permanents (cheapest first, or most expensive first with `preferHighManaValue`); `each` (one material per filter: The Grim Captain), `orMore` (one or more), `distinctColors` (Sunbird Standard). The source and the materials don't pay the mana; the exiled materials are linked to the back face (`ref.linked`);
  - the amounts `linkedTotalPower` (Mastercraft Raptor) and `linkedColors` (Sunbird Effigy), and `addManaColorsAmong` on linked cards;
  - the trigger "exiled for a craft" (`leaves` with `whileCrafting`: Market Gnome);
  - `cdaValue` (P/T defined by an ability) accounts for subtypes and "one of" (The Mycotyrant, Gnome Soldier token);
  - **fix**: a card put onto the battlefield transformed (or tapped) is so before its enters triggers (712.14): previously, the front face triggered.

- Lot D ✅ (**279/279**). The scripts are in `lci/legends.ts`. The engine gains:
  - the Gods and their Temples: return transformed and tapped on death (helper `returnsAsTemple`), Temples (helper `temple`) with the amounts `attackersThisTurn` (Temple of Civilization) and `redNoncombatDamageThisTurn` (Temple of Power), the mana ability that removes a counter (`removeCounter`: Temple of Cyclical Time);
  - Ojer Taq: tripling `creatureTokensTriple` (`tokenMultiplier`, `statics.ts`, also for copy tokens); Ojer Axonil: static `noncombatDamageAtLeastPower` (`dealDamage`); Ojer Pakpatiq: rebound (702.88: `fx.grantRebound`, `StackItem.rebound`, delayed ability `yourNextUpkeep`) and the `fromHand` option of the `castSpell` trigger;
  - Bloodletter of Aclazotz: `doubleOpponentLifeLossYourTurn` (`loseLife`);
  - the additional costs "discard a card or pay 3 life" (`discardOr.life`: Bitter Triumph) and "… or sacrifice a permanent" (`discardOr.sacrifice`: Souls of the Lost), offered by the client's additional cost window (button "Pay 3 life instead") and by the AI;
  - base power (`Characteristics.basePower`, after layer 7b), the comparison `cmp.power(">", "basePower")` (Kutzil) and the effect `countersAboveBase` (Sovereign Okinec Ahau);
  - `fx.modifyWhileSource` (Kitesail Larcenist), `fx.counterAbilitySilence` (Tishana's Tidebinder), `fx.keep(…, "one", …, { fate: "destroy" })` (Unstable Glyphbridge, PLAN-H H8a), `exileForManaValue` (Fabrication Foundry), `graveyardCreatureOnce` (The Tomb of Aclazotz: finality and Vampire subtype on entering), the linked exile of a card from hand that returns to hand (`exileFromHandLinked(…, untilLeaves)`: Deep-Cavern Bat);
  - the player restrictions: `opponentsCantCastYourTurn` (Kutzil), `attackersCantCast` and `cantAttackYouThisTurn` (Sandswirl Wanderglyph, `s.turn.attackBans` and `attackedBy`);
  - the condition `mostLife` (Preacher of the Schism), the amounts `creaturesLeftThisTurn`, `permanentTypesInGraveyard`, `untappedInUntapStep`;
  - Locus of Enlightenment: the `activated` event and the `activateAbility` trigger; the filter `withActivatedAbility` (The Enigma Jewel);
  - Roaming Throne: `doubleTriggersFor` (chosen type); Twists and Turns: `scryBeforeExplore`;
  - the mana abilities `produceLinkedColors` (Pit of Offerings) and `amountGraveyard` (The Core), and the rider `uncounterable` (Cavern of Souls; the chosen type is read on the source);
  - Intrepid Paleontologist: `playFrom: { zone: "linked", filter, finality }` (PLAN-H H7b);
  - **fix**: `cdaValue` (P/T defined by an ability) accounts for the full filter, including in graveyards (Souls of the Lost); the log names arrivals on the battlefield.

Tests: `engine/test/lci.test.ts` and the smoke test `ai/test/smoke/lci.test.ts`.

## PLAN-M M8a (rules 199)

- **Ojer Kaslem:** one choice of a creature card and/or a land card, put onto the battlefield together, all the cards revealed first (`lookAtTop` with `onePerType: ["Creature", "Land"]`, `reveal: "all"`); an artifact creature and a creature are refused. In the Presence of Ages uses the same type list. Test rewritten.

## PLAN-M M8b (rules 200)

- **Locus of Enlightenment:** the gained activated abilities of the exiled cards can each be activated only once each turn (`gainAbilitiesOf.oncePerTurn`; a mana ability's "once each turn" is now noted per ability, `mana:<id>:<index>`). Test added.
