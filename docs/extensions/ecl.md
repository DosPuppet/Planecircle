# Lorwyn Eclipsed (ECL, 266 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-01, after Tarkir: Dragonstorm. 19 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): shock lands, blight as an optional additional cost, evoke, Moonshadow, Sapling Nursery… The set follows the integration rules of PLAN-R (R1 and R7, end of CLAUDE.md).

| Mechanic | Lot |
|---|---|
| Cards doable with the engine: blight (effect and cost), Vivid, changelings, convoke, granted persist, Commands ("choose two"), transforming double-faced cards | A |
| Engine forms: behold and exile from hand, chosen type read everywhere (`subtypeChosen`), "when it transforms into…", wither | B |
| Unique cards: restricted mana, linked exiled cards, conspire, spells that gain a keyword… | C |
| Replacements of families H and I (R1): tokens, counters, draw, mana | D |

The scripts are in `packages/cards/src/ecl/`: `cards` (meta cards, phase 1), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless and land) and `legends`. The tokens are in `ecl/common.ts`: green and white Kithkin, white and blue Merfolk, black and red Goblin, blue and black Faerie with flying, colorless Shapeshifter with changeling, black and green 2/2 Elf, 3/3 Elk, black and green Worm, Mutavault (land that becomes a 2/2 creature of all types), 3/4 Treefolk with reach.

## Lot A ✅ (227 / 266)

- **Cards:** 208 new ones, written by color:
  - white 37, blue 31, black 26, red 32, green 34, multicolor 41, colorless and land 8;
  - including the double-faced Brigid, Eirdu / Isilu, Sygg and Trystan, the five Commands ("choose two", one mode per pair), Tam, Twinflame Travelers, Chronicle of Victory, Dawn-Blessed Pennant, Eclipsed Realms.
- **The engine gains:**
  - blight N ("blight N": N -1/-1 counters on a creature you control):
    - as an effect, `fx.blight(n, who, store)`, `ops/counters.ts`: each designated player chooses their creature; `store` is 1 if it was done ("you may blight 1; if you do…");
    - as an ability cost, `activated({ blight: N })`: the creature is chosen by the engine (`blightTarget`, `stack.ts`);
  - "blight N or pay {M}" as an additional cost (Wild Unraveling, Bogslither's Embrace): read from the text, it is the "blight" kicker and, if not paid, the mana `CardDef.kickerOrPay`;
  - "blight X; X can't be greater than the greatest toughness among your creatures" (Soul Immolation): `CardDef.xCost: "blight"`. The field replaces `payLifeX` ("pay X life", Vicious Rivalry: `xCost: "life"`);
  - Vivid: `amount.colorsAmong(filter)`, the number of colors among permanents (yours by default);
  - changeling is read from the Scryfall text (`scryfall.ts`).
- **Fix [rules]:** a permanent that leaves the battlefield is removed from combat in `moveObject`, whatever effect or cost moves it (506.4). The cost "behold a Kithkin and exile it" of Champion of the Clachan exiled an attacker without removing it from combat (found by the fuzz). `RULES_VERSION` = 22, golden games regenerated.
- **Debt:** `proliferate` and `revealUntilN` now serve several cards, and changeling is read from the text: their entries leave `debt-baseline.json`.
- **Audit:** Sygg and Trystan ("when it transforms into…" done by the ability that transforms it) go into `audit-baseline.json`, pending lot B.
- **Tests:** 203 more rules tests in `engine/test/ecl.test.ts` (one `describe` per color, local helpers); the smoke test `ai/test/smoke/ecl.test.ts`, where Champion of the Clachan and Champions of the Shoal get a changeling to behold.
- **Approximations:** see `docs/approximations.md`, Lorwyn Eclipsed section.

## Lot B ✅ (243 / 266)

- **Cards:** 16 new ones: Grub, the Goblin, Elemental and Elf Champions (Champion of the Weird, Champion of the Path, Champions of the Perfect), Wild Unraveling, Bogslither's Embrace, Soul Immolation, Selfless Safewright, Harmonized Crescendo, Bloodline Bidding, Gathering Stone, Rimefire Torque, Oko (double-faced planeswalker), Barbed Bloodletter, Squawkroaster, Shadow Urchin.
- **The engine gains:**
  - the trigger "when it transforms into [this face]" (`when.transformsSelf`, `transformed` event), carried by the targeted face: Brigid, Sygg and Trystan take it, and their entries leave `audit-baseline.json`;
  - behold and exile a card from hand (`additionalCost.exile.fromHand`, helper `champion(type, abilities)` in `ecl/common.ts`); "behold or pay": helper `beholdOrPay(type, N)`;
  - "of the chosen type" read everywhere: `resolveFilter` (targets, counts, searches, `lookAtTop`), `matchWho` (triggers), the source filter of damage replacements, cost reductions. The choice made by a spell that resolves is kept on the spell (Harmonized Crescendo); an emblem keeps the choice of the effect that creates it (Oko); last known information keeps the choice;
  - wither (702.80): -1/-1 counters instead of marked damage;
  - P/T defined by Vivid (`colorsAmong` in `cdaValue`);
  - "remove N counters from this creature" of any kind (`removeCounters.kind: "any"`);
  - `fx.blight` keeps the blighted creatures (`ref.stored`, "the blighted creature");
  - choosing a creature type always offers the most common types (no option without a creature known in the game).
- **Fixes [rules]:**
  - blighting for several players ("each opponent blights 1") put the first player's counters twice: all the choices are now made first;
  - a cost reduction sees the spell being cast: "behold a Goblin" no longer counts it itself;
  - "untap" removes a stun counter instead of untapping (122.1d), like the untap step (`untapObject`);
  - created tokens are noted in the turn log ("a creature entered under your control this turn");
  - "another card" recognizes the dead source, now a graveyard card (physical identity);
  - `amount.countersOn(ref.eventObject)` reads the counters of a dead creature (last known information);
  - a player who leaves the game (800.4a): the characteristics cache is invalidated after their permanents leave (Ygra, Eater of All still made creatures Foods; found by the fuzz at 3 players).

  `RULES_VERSION` = 23, golden games regenerated.
- **Approximations lifted:** "remove a counter" limited to -1/-1, Champions without the hand, "behold or pay" that excluded its own name, the transformation of Brigid, Sygg and Trystan, Morcant's Loyalist, Bristlebane Outrider and Thoughtweft Charge, Collective Inferno.
- **Tests:** 23 more rules tests in `engine/test/ecl.test.ts` ("Lorwyn Eclipsed, lot B").

## Lot C ✅ (261 / 266)

- **Cards:** 18 new ones: Kinbinding, Winnowing, Unbury, Glen Elendra's Answer, Swat Away, Lasting Tarfire, Spinerock Tyrant, Dawnhand Dissident, Maralen, Taster of Wares, Twilight Diviner, Goliath Daydreamer, Dream Harvest, Lluwen, Ashling (double-faced), Celestial Reunion, Raiding Schemes, Sanar.
- **The engine gains:**
  - restricted mana added by an effect (player's `restrictedMana`, `fx.addManaChoice(n, colors, restriction)`): the solver spends it first, and only for a permitted payment; it disappears when the pool empties (Ashling, Rimebound);
  - the permission "cast the linked exiled cards" takes variants: any owner, free, once per turn, only this turn, capped mana value, removing counters among your creatures, with mana of any type (Dawnhand Dissident, Maralen, Taster of Wares);
  - a static multiplied by a count from the turn log (`perTurnEvents`, Kinbinding); counters put on a permanent are in the log (`event: "counters"`, Lasting Tarfire);
  - a spell on the stack can gain a keyword (`fx.modify` on a spell, Spinerock Tyrant), and the trigger "a spell with a single target" (`singleTarget`);
  - `exileOnResolve` generalized: exile the designated spells as it resolves, with a counter (Goliath Daydreamer);
  - the Ref `stackItemsOf(players)` and the count of countered spells (`fx.counter(ref, store)`, Glen Elendra's Answer);
  - a targeted spell put on top or bottom of the library (`spellToZone`, Swat Away);
  - the target constraint "that share a creature type" (`shareCreatureType`, Unbury);
  - "exile up to a total mana value of N" for each designated player (Dream Harvest); "discard a land card" as a cost (`discardFilter`, Lluwen); "reveal X cards from your hand", chosen by their owner (Taster of Wares);
  - the enters trigger "from a graveyard" (`fromGraveyard`, Twilight Diviner); "reveal up to X" with variable X, and "one card per color" (Sanar; Aurora Awakener is simplified by it); tapping exactly N creatures that share a color with a spell (conspire, Raiding Schemes); the condition "behold two creatures of a type of [the object]" (Celestial Reunion).
- **Debt:** a single new operation for Winnowing, which became `fx.keep(…, "sharesType", …)` in PLAN-H H8a; the other forms extend existing operations.
- **Fix [rules]:** a cast spell was seen without mana value or name (`spellView`): a filter "spell with mana value 4 or more" on a spell being cast never matched. `RULES_VERSION` = 24, golden games regenerated.
- **Display limit:** restricted mana does not yet appear in the displayed pool.
- **Tests:** 18 more rules tests in `engine/test/ecl.test.ts` ("Lorwyn Eclipsed, lot C"). The smoke test now tries an action's decisions until the first one the engine accepts (Unbury: two cards that share a type, a constraint that target enumeration doesn't see).

## Lot D ✅ (266 / 266): replacements of families H and I (R1)

- **Cards:** Mirrormind Crown, Blossombind, Mornsong Aria, Lavaleaper, Shimmerwilds Growth.
- **The engine gains** the replacements of families H and I on the `EventReplacement` frame (R1), like the damage ones in lot D of Tarkir:
  - `event: "tokens"` (`createTokens`, `copyToken`): "twice / three times that many" (`modify.times`), other tokens instead (`instead.token`), copies of the permanent the source is attached to, the first time each turn (`instead.copyOfAttached`, `firstEachTurn`), "those tokens plus one token" (`plus`);
  - `event: "counters"` (`changeCounters`): counter kind (`counter`), not for a cost (`effectOnly`), prevention (Blossombind: "can't have counters put on it");
  - `event: "lifeGain"`, `"draw"`, `"mill"` (`gainLife`, `drawCards`, milling): "that much plus N", "twice that much", prevention (Mornsong Aria: "players can't draw cards or gain life");
  - `event: "mana"` (mana production of a tapped permanent): one more mana of the same type, of the color chosen by the source (`extraMana: "chosen"`) or only when a type is produced (`manaProduced`, Ultima);
  - `event: "untap"`: a permanent that can't be untapped (Blossombind), including during the untap step (`untapObject`);
  - `quantityMods`, `recipientMatches` and `playerSide` (`statics.ts`) gather the replacements that apply; the filter `attached: "host"` ("enchanted / equipped creature") also applies to permanents; `setColorsChosen`: "enchanted land is the chosen color".
- **Conversion:** the doublers (`doubler`, `DoublerAbilityDef`: Doubling Season, Ojer Taq, The Wind Crystal, The Earth Crystal…) and 13 flags of `PlayerStaticAbilityDef` (`extraToken`, `extraMapToken`, `replaceArtifactTokens`, `tokensAsCopiesOfAttached`, `plusOneCounterBonus`, `lifeGainBonus`, `noLifeGainForAll`, `drawDouble`, `drawPlusOneWhenHandSmall`, `opponentMillExtra`, `extraMountainMana`, `extraColorlessFromLands`, `artifactTokenManaBonus`) become `eventReplacement`s in the scripts of 19 files; their entries leave `debt-baseline.json`.
- **[rules]** "those tokens plus one token" applies once per event (Worldwalker Helm and Quina no longer give each other an extra Frog for the Map). `RULES_VERSION` = 25, golden games regenerated.
- **Audit:** Lavaleaper and Shimmerwilds Growth (triggered mana abilities written as replacements) go into `audit-baseline.json`; Vnwxt's entry leaves it (the "2" is in the script).
- **Tests:** 5 more rules tests in `engine/test/ecl.test.ts` ("lot D"), 2 in `engine/test/rulings.test.ts` (token replaced then doubled; prevention stronger than a doubler); the existing tests of the converted flags (`audit.test.ts`, `fra-lotf.test.ts`) go through the new frame.

## PLAN-M M7 (rules 198)

- **Kindle the Inner Flame:** the copy's "At the beginning of the end step, sacrifice this token" is an ability of the token (`SACRIFICE_TOKEN_AT_END_STEP`).

## PLAN-M M8a (rules 199)

- **End-Blaze Epiphany:** the playable card is chosen as the delayed ability resolves (`chooseAmong` among the exiled cards, then `grantPlay` on that one). Test rewritten.
- **Aurora Awakener:** "any number" of the revealed permanent cards (`revealUntilN` with `anyNumber`: a pick from 0 to all, the others join the rest on the bottom). Test extended.
