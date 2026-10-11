# Bloomburrow (BLB, 266 cards)

Mechanics and details of the lots.

Requested by the user on 2026-09-28. Classes (716) and Threshold already existed in the core.

| Mechanic | Lot |
|---|---|
| Cards doable with the engine, tokens (Otter, Bat, Snail, Squirrel, Wall), lands (Villages, Three Tree City) | A |
| Offspring, Gift, Forage, Expend, Valiant, Seasons ("paw" modes) | B |
| Legendary and unique cards (Alania, Vren, Mockingbird, Portent of Calamity, Osteomancer Adept, Festival of Embers…) | C |

The scripts are in `packages/cards/src/blb/`: `white`, `blue`, `black`, `red`, `green`, `multi` (legendary cards included) and `artifacts` (artifacts, lands and special cards from no. 262 on). The helpers are in `blb/common.ts`: `valiant`, `expend`, `kin` (animal families), `entersAndSacrificed`, `FOOD_ABILITY`, and the Otter, Bat, Snail, Squirrel, Wall, Vren Rat, Sword and Cragflame tokens.

- Lot A ✅. It covers the cards without a new mechanic, the Classes (ten Talents), Threshold, the Villages (mana reserved for creature spells) and Three Tree City.
- Lot B ✅. The engine gains:
  - Offspring (702.175): "Offspring {2}" is read from the text (`parseOffspring`, `cards/src/scryfall.ts`). It is a kicker (`CardDef.kickerKind = "offspring"`); the trigger "when it enters, create a 1/1 token copy of it" is generated;
  - Gift (702.174): "Gift a card / a Food / a tapped Fish / a Treasure" is read from the text (`parseGift`). It is a kicker at {0} (`kickerKind = "gift"`, `CardDef.gift`). The `gift` effect is added at the head of each mode of an instant or sorcery, or in a generated enters trigger for a permanent. The opponent who receives it is chosen right after the spell is put on the stack, like a division (`stackChoices.ts`, `CastInfo.giftTo`, PLAN-H H4; no question with a single opponent; a copy keeps the original's opponent, 707.10). `cond.gift` (= `cond.kicked`) reads "if the gift was promised", `when.giveGift` "whenever you give a gift";
  - targets specific to the gift: `TargetSpec.kickedFilter` ("instead, target nonland permanent"), checked on casting and on resolution, and offered to the AI and to the interface (`TargetOption.kickedLegal`); `kickedCount` serves additional targets;
  - the kicker question has its own labels (`kickerPrompt` of the option: "Pay the offspring cost {2}?", "Promise a Food");
  - Forage (701.61): `canForage` and `forage` (`actions.ts`), as an effect (`fx.mayForage`), as an activation cost (`activated({ forage: true })`), as an alternative cost (`forageOrPay`: Feed the Cycle, "Forage — {1}{B}") and as a cost to cast from the graveyard (Osteomancer Adept). Trigger `when.forage`;
  - Expend N: `turnStats.manaSpentOnSpells`, `expend` event emitted on casting when the total crosses 4 or 8; `when.expend(n)`, helper `expend(4, …)`;
  - Valiant: `becomesTarget` with `byYou` (spell or ability you control), once per turn; `becomesTarget` also accepts a filter (Pawpatch Recruit: `when.targetedByOpponent`);
  - Seasons: `pawprint(...)` (`dsl.ts`) generates all the combinations of modes up to five {P}, the same mode several times; the targets of each copy are renamed.
- Lot C ✅ (**266/266**). The engine gains:
  - prowess granted or carried by a token (ability added by the layers; `liveSources` no longer ignores these creatures);
  - the triggers `lifeChange` (gain or lose life), `leavesWithoutDying`, `attackWith` with a filter ("with one or more Rats"), `castSpell.firstOf` (Alania);
  - the conditions `any`, `opponentHasMore` (Beza), `lostLife`, `refLostLife`, `handAtMost`, `targetChosen`, `sacrificedFood`, `canForage`; the reference `defendingPlayer`;
  - the amounts `inExile`, `yourCreaturesDiedThisTurn`, `opponentCreaturesExiledThisTurn` (Vren), `opponentsWithHandAtMost`, `lkiPower`, `instantSorceryCast`, `cardsLeftGraveyardThisTurn`;
  - the player statics `noncombatDamageBonusAmount` (Artist's Talent), `damageUnpreventable` (Sunspine Lynx), `instantsSorceriesFromGraveyardLife` (Festival of Embers), `flashFor` (Valley Floodcaller), `damagePlusOneFrom` (Valley Flamecaller), `creaturesFromGraveyardForage` (Osteomancer Adept);
  - the effects `untapAll`, `forEachPlayer` with `damage` (Sunspine Lynx, PLAN-H H8a), `portent`; `modifyAll` until your next turn; repeated `punisher` (`times`); `sacrifice` of the greatest power; `copyToken` exiled at the end step; reflexive targets of variable mana value (`manaValueAmount`, Wishing Well);
  - copying on entering a creature of any controller, with extra keywords (Mockingbird);
  - the keyword `cantBeBlockedByPowerGE2` (Azure Beastbinder).

Tests: `engine/test/blb.test.ts` (29 tests) and the smoke test `ai/test/smoke/blb.test.ts`.

## PLAN-M M7 (rules 198)

- **Ral, Crackling Wit's emblem** has storm (the emblem text said "replicate"): `when.castSpellStorm` (castSpell trigger with `storm`: the event amount is the cast event's `spellsBefore`), so the copies are counted when the spell is cast, not at resolution.
- **Gift of a permanent:** the "gift promised" trigger carries the chosen opponent (`StackItem.cast.giftTo`, copied when it is put on the stack) and its "if the gift was promised" reads the last known information (`LkiSnapshot.kicked`): a permanent gone before the trigger resolves still gives the gift to the chosen opponent.
- **Tests:** `blb.test.ts` (+2: Ral's storm with a spell cast in response; Scrapshooter destroyed in response, three players).

## PLAN-M M8a (rules 199)

- **Portent of Calamity:** the player chooses the exiled cards, at most one per card type (`lookAtTop` with `onePerType`, all revealed, `store`), then the free cast with four or more; the `portent` operation is removed. 1 test added.

## PLAN-M M10d (rules 206)

- **The Infamous Cruelclaw:** "cast that card by discarding a card rather than paying its mana cost": the discard is a cost paid while casting (`castNow.discard`, an additional discard of the permission), not before; with no card to discard, it isn't offered and stays in exile. Tests: 1 rewritten, 1 added; approximation removed.
- **Rottenmouth Viper:** "sacrifice any number of nonland permanents": the permanents chosen beyond the generic cost are sacrificed too, reducing nothing more. Test added; approximation removed.
