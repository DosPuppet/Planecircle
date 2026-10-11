# Secrets of Strixhaven (SOS, 262 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-01, after Wilds of Eldraine and before Murders at Karlov Manor. 27 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): Prepare (Emeritus of Ideation), Opus (Colorstorm Stallion), Infusion (Moseo), Paradigm (Decorum Dissertation), converge, flashback, dual lands… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Split: one sublot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Core: tokens, Repartee, Infusion, Opus, Increment helpers | 0 |
| Cards doable with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendary and unique cards | C and following |

The scripts are in `packages/cards/src/sos/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless and lands) and `legends`. The helpers are in `sos/common.ts`.

## Sublot 0: core ✅ (27 / 262)

- **Tokens:** 1/1 black and green Pest ("whenever this attacks, you gain 1 life"), 1/1 white and black flying Inkling, 2/2 red and white Spirit, 0/0 green and blue Fractal, 3/3 blue and red flying Elemental.
- **Repartee:** `REPARTEE`, "whenever you cast an instant or sorcery spell that targets a creature" (`when.castSpell` with `targeting`).
- **Infusion:** `INFUSION`, "if you gained life this turn".
- **Opus:** `OPUS` ("whenever you cast an instant or sorcery spell"), `OPUS_BIG` (five or more mana spent) and `opusInstead(normal, enhanced)` ("… instead").
- **Increment:** `INCREMENT`, "whenever you cast a spell, if the mana spent is greater than this creature's power or toughness, a +1/+1 counter".
- **[rules] "If" conditions of triggered abilities:** an amount read in a condition sees the event object (`checkAmount`, `amount.eventManaSpent`: the cast spell). `RULES_VERSION` = 27.
- **Coverage:** `npm run coverage -- --text` also displays the spell of a "prepared" card (`prepareFace`).
- **Tests:** 4 tests in `engine/test/sos.test.ts` ("core"); smoke test `ai/test/smoke/sos.test.ts`.

## Sublot A1: white cards ✅ (54 / 262)

- **Cards:** 27 (of 29), including 6 prepared cards (Elite Interceptor, Emeritus of Truce, Honorbound Page, Informed Inkwright, Joined Researchers, Spiritcall Enthusiast…), Repartee (Eager Glyphmage, Rehearsed Debater, Stirring Hopesinger…), the flashback of Antiquities on the Loose and Dig Site Inventory (written in the script: it isn't read from the text).
- **Remaining:** Group Project (flashback "tap three creatures", cost without mana), Soaring Stoneglider ("exile two cards from your graveyard or pay {1}{W}").
- **Tests:** 29 rules tests ("lot A — white").

## Sublot A2: blue cards ✅ (82 / 262)

- **Cards:** 26 (of 29), including 7 prepared (Campus Composer, Encouraging Aviator, Harmonized Trio, Jadzi, Landscape Painter, Skycoach Conductor, Spellbook Seeker), Increment (Pensive Professor, Tester of the Tangential, Textbook Tabulator), Opus (Muse Seeker, Divergent Equation…), Fractalize, Mathemagics.
- **The engine gains:**
  - `fx.modify(…, basePT)`: base P/T set to an amount evaluated on resolution (Fractalize: X+1/X+1);
  - `fx.removeCounters` takes an amount; `amount.pow(base, X)` (Mathemagics: 2^X cards);
  - `countX: "upTo"`: "up to X targets" (Divergent Equation);
  - `fx.reflexive(…, keepVars)`: the reflexive ability receives remembered values ("pay {X}. When you do, move X counters", Tester of the Tangential).
- **Debt:** the `payX` entry of `debt-baseline.json` is removed (the operation serves two cards).
- **Remaining:** Brush Off (colored reduction "if it targets a spell"), Mana Sculpt (mana spent on the targeted spell, "at the beginning of your next main phase"), Matterbending Mage ("a spell with {X} in its cost").
- **Tests:** 32 rules tests ("lot A — blue").

## Sublot A3: black cards ✅ (110 / 262)

- **Cards:** 28 (of 29), including 7 prepared (spells cast from exile, prepare conditions), Repartee, Infusion (Foolish Fate, Poisoner's Apprentice…), converge, End of the Hunt, Postmortem Professor, Withering Curse.
- **Fix:** "distribute X counters" with fewer counters than targets no longer requires one counter per target (impossible choice found by the fuzz).
- **Remaining:** Pox Plague (per-player amounts: "lose half your life, rounded down", "discard half your hand").
- **Tests:** 30 rules tests ("lot A — black").

## Sublot A4: red cards ✅ (135 / 262)

- **Cards:** 25 (of 27), including Opus (Thunderdrum Soloist, Pigment Wrangler, Garrison Excavator, Tome Blast…), prepared, Mica (sacrificing an artifact copies the spell), Rubble Rouser (mana ability with a cost and a reflexive ability), Improvisation Capstone (Paradigm), Archaic's Agony (converge and excess damage), flashback of Duel Tactics and Tome Blast.
- **Remaining:** Magmablood Archaic (converge "enters with"; colors spent on the triggering spell), Choreographed Sparks ("this spell can't be copied"; copy of a creature spell with haste, sacrificed at end of turn).
- **Tests:** 31 rules tests ("lot A — red").

## Sublot A5: green cards ✅ (166 / 262)

- **Cards:** 31 (of 32), including Increment (Ambitious Augmenter, Topiary Lecturer…), prepared (Emeritus of Abundance, Infirmary Healer, Studious First-Year, Vastlands Scavenger), Infusion, Fractals and converge (Snarl Song), Slumbering Trudge.
- **[rules] "Enters with" amounts and conditions:** they can add, subtract and take a maximum (Slumbering Trudge: "three minus X stun counters"), count the colors spent (converge), and the conditions see X ("if X is 2 or less, it enters tapped"). Fix along the way: Sheriff of Safe Passage (OTJ) entered without a counter (0/0); test added in `otj.test.ts`. `RULES_VERSION` = 28.
- **Remaining:** Wildgrowth Archaic ("that creature spell enters with X counters, where X is the number of colors spent to cast it": colors spent on the triggering spell).
- **Tests:** 34 rules tests ("lot A — green") and 1 OTJ test.

## Sublot A6: multicolor, colorless and lands ✅ (246 / 262)

- **Cards:** 62 multicolor (of 69: the five colleges, Repartee, Infusion, Opus, Increment, prepared, converge, the legendary Silverquill, Prismari, Witherbloom…, Nita, Forum Conciliator, Molten Note, Fix What's Broken) and 18 colorless and lands (the five colorless Archaics, Diary of Dreams, Page, Loose Leaf, Strixhaven Skycoach, surveil lands and slow lands).
- **The engine gains:**
  - the comparison `cmp.manaValue("<=", amount.colorsSpent)` ("with mana value at most the number of colors spent to cast it", Sundering Archaic); `cmp.manaValue("=", amount.x)` also serves `moveAll` (Fix What's Broken: "each artifact and creature card with mana value X");
  - a card made castable from exile with "then exile it" returns there (`exileAfter`, like from the graveyard: Nita);
  - `amount.manaSpent` reads the mana spent on an instant or sorcery that resolves (Molten Note).
- **[rules]** `RULES_VERSION` = 29.
- **Remaining:** Suspend Aggression ("until the end of its owner's next turn"), Zaffai and the Tempests (free spell once per turn), Geometer's Arthropod and Paradox Surveyor ("card with {X} in its cost"), Fractal Tender ("if you put a counter on it this turn"), Lorehold, the Historian (miracle), Quandrix, the Proof (cascade).
- **Tests:** 59 rules tests ("lot A — multicolor") and 19 ("lot A — colorless and lands").

## Sublot B1: spells with {X} in their cost ✅ (249 / 262)

- **Cards:** Matterbending Mage, Geometer's Arthropod, Paradox Surveyor.
- **The engine gains:** the filter `hasX` ("a spell / a card with {X} in its mana cost", read on snapshots and spell views) and `amount.eventX` (the X of the triggering spell).
- **Tests:** 3 rules tests ("lot B1").

## Sublot B2: colors spent on the triggering spell ✅ (251 / 262)

- **Cards:** Magmablood Archaic, Wildgrowth Archaic.
- **The engine gains:** `amount.eventColorsSpent` (colors of mana spent on the event's spell); the "enters with" converge goes through `entersWith({ counters: amount.colorsSpent })` (lot A5). The test helper `scenario` accepts counters on a permanent (`counters`).
- **Debt:** the `spellArrivalCounters` entry is removed (the operation serves two cards).
- **Tests:** 2 rules tests ("lot B2").

## Sublot B3: costs ✅ (254 / 262)

- **Cards:** Group Project, Soaring Stoneglider, Brush Off.
- **The engine gains:**
  - `flashbackCost` (an `AdditionalCost` added to the flashback) replaces `flashbackDiscard`: "Flashback—tap three untapped creatures" (Group Project, with a flashback {0}); Twinned Vision becomes `{ discard: 1 }`;
  - "as an additional cost, exile N cards from your graveyard or pay [mana]" is read from the text: kicker without mana `kickerCost.exileGraveyard` (cards chosen automatically, lands first) and `kickerOrPay`, modeled on "blight N or pay";
  - the spell's own reduction can remove colored symbols (`costReduction.colored`, Brush Off: {1}{U}) and its condition "if it targets…" recognizes a targeted spell on the stack.
- **Tests:** 3 rules tests ("lot B3").

## Sublot C1: halves per player, playable exile, counters put, next main phase ✅ (258 / 262)

- **Cards:** Pox Plague, Suspend Aggression, Fractal Tender, Mana Sculpt.
- **The engine gains:**
  - `fx.loseHalfLife(who)` and `fx.discard(…, { half: true })`: half of each player's life or hand, rounded down (like `sacrifice({ half })`);
  - `fx.grantPlay(…, { for: "owner", untilOwnersNextTurn })`: "its owner may play it until the end of their next turn"; with `for: "owner"`, `untilYourNextTurn` means "until your next turn";
  - who put counters on an object this turn (`GameObject.countersPutBy`) and the filter `countersPutByYouThisTurn`;
  - the `yourNextMain` moment of delayed abilities ("at the beginning of your next main phase", the postcombat one included), `fx.delayedAt(…, vars)` and `amount.manaSpentOf(ref)` (mana spent on the targeted spell).
- **[rules] Fix:** Memory Vessel (BIG) made the cards playable only this turn, instead of "until your next turn". `RULES_VERSION` = 30.
- **Tests:** 4 rules tests ("lot C1").

## Sublot C2: free spell once per turn, copies ✅ (260 / 262)

- **Cards:** Zaffai and the Tempests, Choreographed Sparks.
- **The engine gains:**
  - `castPermission({ freeFromHand, freeOncePerTurn, condition })`: "once during each of your turns, you may cast an instant or sorcery spell from your hand without paying its mana cost"; the permission is consumed only by a spell cast for free;
  - "this spell can't be copied" is read from the text (`CardDef.cantBeCopied`, checked by `copyStackItem`);
  - `fx.copySpell(…, { haste, sacrificeAtEnd })`: the copy of a creature spell (a token) has haste and is sacrificed at the beginning of the next end step. Fix: a copy no longer inherits the arrival modifications granted to the original spell (707.2), and a token copy of a permanent spell receives its own.
- **[rules]** `RULES_VERSION` = 31.
- **Tests:** 3 rules tests ("lot C2").

## Sublot C3: cascade and miracle ✅ (262 / 262)

- **Cards:** Quandrix, the Proof (cascade, and "instant and sorcery spells you cast from your hand have cascade"), Lorehold, the Historian (miracle {2} granted to the instants and sorceries in your hand).
- **The engine gains:**
  - cascade (702.85): `fx.cascade(N)`, a variant of discover (`discover` with `cascade`: strictly lesser mana value, the uncast card goes to the bottom);
  - the draw event designates the drawn card (`ref.eventObject` of a `draw` trigger);
  - `fx.castNow(…, { cost })`: cast now for a given cost, also from the hand (permission `cost` read for the hand).
- **[rules]** `RULES_VERSION` = 32.
- **Deviations:** cascade and miracle are approximated (see `docs/approximations.md`).
- **Tests:** 4 rules tests ("lot C3").

## PLAN-M M7 (rules 198)

- **Prismari, the Inspiration:** the granted storm is `when.castSpellStorm` (count read from the cast event, `spellsBefore`): a spell cast in response to the trigger is no longer counted.
- **Choreographed Sparks:** the token copy of the creature spell gains "At the beginning of the end step, sacrifice this token" as an ability (`SACRIFICE_TOKEN_AT_END_STEP`), not a delayed ability.
- **Tests:** `sos.test.ts` (+1 Prismari; the Choreographed Sparks test checks the ability).

## PLAN-M M8a (rules 199)

- **Zimone's Experiment:** `chooseAmong` (up to two) among the creature and land cards of the top five, revealed, the rest on the bottom in a random order, then the cards go straight from the library. 1 test added.
