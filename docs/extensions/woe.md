# Wilds of Eldraine (WOE, 269 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-01, together with Secrets of Strixhaven and Murders at Karlov Manor. 11 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): Adventures, Bargain, Song of Totentanz, The End, Restless Cottage… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Split: one sublot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Core: Roles (Aura tokens, 704.5y), Celebration, tokens | 0 |
| Cards doable with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendary and unique cards | C and following |

The scripts are in `packages/cards/src/woe/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless and lands) and `legends`. The helpers are in `woe/common.ts`.

## Sublot 0: core ✅ (11 / 269)

- **Roles (303.7):** Aura enchantment tokens, subtype Role, "Enchant creature" (`TokenSpec.enchant`, new): Cursed (the creature is 1/1), Monster (+1/+1, trample), Royal (+1/+1, ward {1}), Sorcerer (+1/+1, scry 1 when attacking), Virtuous (+1/+1 for each enchantment you control), Wicked (+1/+1; to the graveyard, each opponent loses 1 life), Young Hero (when attacking with toughness 3 or less, a +1/+1 counter). `createRole(role, creature)` creates the attached token, and nothing if the creature is no longer there (303.7b).
- **[rules] 704.5y:** several Roles of the same player attached to the same permanent: only the most recent remains (`turn.ts`). `RULES_VERSION` = 26.
- **Celebration:** `CELEBRATION`, "two or more nonland permanents entered under your control this turn" (turn log, tokens included).
- **Tokens:** 2/2 Knight with vigilance, 1/1 Human; Rat "can't block", Food and Treasure come from the commons.
- **Tests:** 5 tests in `engine/test/woe.test.ts` (Monster and Cursed, two players, Wicked, Young Hero, Celebration); smoke test `ai/test/smoke/woe.test.ts`.

## Sublot A1: white cards ✅ (53 / 269)

- **Cards:** 42 (of 45), including 7 Adventures (two entries each), the Roles (Betroth the Beast, Charmed Clothier, Cursed Courtier, Unassuming Sage, Spellbook Vendor, Protective Parents, Return Triumphant), Celebration (Armory Mice, Gallant Pie-Wielder, Tuinvale Guide, Pests of Honor, Lady of Laughter), Bargain (Archon's Glory, Kellan's Lightblades), the Sagas The Princess Takes Flight and Three Blind Mice.
- **Remaining:** Archon of the Wild Rose and A Tale for the Ages ("enchanted creature" filter), Solitary Sanctuary (which taps a creature).
- **Tests:** 38 rules tests in `engine/test/woe.test.ts` ("lot A — white").

## Sublot A2: blue cards ✅ (88 / 269)

- **Cards:** 35 (of 41), including 11 Adventures (Aquatic Alchemist, Beluna's Gatekeeper, Galvanic Giant, Horned Loch-Whale, Obyra's Attendants, Picklock Prankster, Vantress Transmuter, Virtue of Knowledge, Frolicking Familiar, Threadbind Clique, Twining Twins), Archive Dragon, Chancellor of Tales, Faerie Slumber Party, Gadwick's First Duel, Into the Fae Court, Storyteller Pixie; Faerie token "can block only creatures with flying" (local to `blue.ts`).
- **Remaining:** Ice Out and Johann's Stopgap (reduction "if bargained"), Asinine Antics (a Role per opposing creature), Ingenious Prodigy (skulk), Elusive Otter (X distributed counters), Extraordinary Journey ("cast from exile").
- **Tests:** 34 rules tests ("lot A — blue").

## Sublot A3: black cards ✅ (132 / 269)

- **Cards:** 44 (of 48), including 8 Adventures, Rankle's Prank ("one or more" through {0} modes), Lich-Knights' Conquest and Malevolent Witchkite ("sacrifice any number"), Specter of Mortality (reflexive ability), Beseech the Mirror (free cast during resolution).
- **Remaining:** Ashiok, Wicked Manipulator (paying life replaced by exile; total mana value in exile), Lord Skitter's Blessing (enchanted creature), Tangled Colony (damage dealt, last known information), Twisted Sewer-Witch (a Role per Rat).
- **Tests:** 45 rules tests ("lot A — black").

## Sublot A4: red cards ✅ (172 / 269)

- **Cards:** 40 (of 43), including Adventures, Celebration (Goddric, Redcap Thief…), the Roles, the Rats, Expensive Taste (opposing cards exiled and playable), Become Brutes.
- **Remaining:** Imodane, the Pyrohammer (damage from a single-target spell to its target), Skewer Slinger (the blocked attacker as the event object), Kellan, the Fae-Blooded (counting the Auras and Equipment attached to the source).
- **Tests:** 41 rules tests ("lot A — red"). On the way, the face-down card audit (`ai/test/hidden-info.test.ts`) counted as a leak an opposing hand looked at legitimately (Solve for Disappointment, drawn in a random deck): only the face-down permanent is now audited there.

## Sublot A5: green cards ✅ (213 / 269)

- **Cards:** 41 (of 44), including Adventures (Beanstalk Wurm, Ferocious Werefox, Hollow Scavenger, Stormkeld Vanguard, Virtue of Strength, Gingerbread Hunter, Questing Druid, Tempest Hart, Intrepid Trufflesnout), Blossoming Tortoise (`abilityCost`), Territorial Witchstalker, Curse of the Werefox (Role then reflexive ability), The Huntsman's Redemption.
- **Debt:** `extraLandThisTurn` now serves two cards (Plant Beans): its entry leaves `debt-baseline.json`.
- **Remaining:** Graceful Takedown (enchanted creature), Hamlet Glutton (reduction "if bargained"), Sentinel of Lost Lore (cards exiled by another owner; "one or more" as a triggered ability).
- **Deviation noted:** a mana replacement "twice that much" (`modify.times`) is not applied, only "that much plus N" is (lot B).
- **Tests:** 41 rules tests ("lot A — green").

## Sublot A6: multicolor, colorless cards and lands ✅ (236 / 269)

- **Cards:** 23 (of 37):
  - multicolor: Ash, Party Crasher; The Goose Mother; Greta, Sweettooth Scourge; Neva, Stalked by Nightmares; Obyra, Dreaming Duelist; Totentanz, Swarm Piper; Troyan, Gutsy Explorer; Will, Scion of Peace;
  - colorless: Collector's Vault, Eriette's Tempting Apple, Gingerbrute, Hylda's Crown of Winter, The Irencrag, Prophetic Prism, Scarecrow Guide, Syr Ginger, Three Bowls of Porridge;
  - lands: Crystal Grotto, Edgewall Inn, the four "Restless" lands.
- **Remaining (lot B and following):** Agatha of the Vile Cauldron, The Apprentice's Folly, Yenna, Eriette of the Charmed Apple, Syr Armont, Faunsbane Troll, Hylda of the Icy Crown, Sharae of Numbing Depths, Johann, Likeness Looter, Rowan, Scion of War, Talion, Beluna Grandsquall, Agatha's Soul Cauldron.
- **Tests:** 28 rules tests ("lot A — multicolor").

### Left to do after lot A (33 cards): engine forms (all done in lots B and C)

| What is missing | Cards |
|---|---|
| "Enchanted creature (by you)" filter | Archon of the Wild Rose, A Tale for the Ages, Lord Skitter's Blessing, Graceful Takedown, Eriette of the Charmed Apple, Syr Armont |
| Who taps a creature ("you tap an opposing creature") | Solitary Sanctuary, Hylda of the Icy Crown, Sharae of Numbing Depths (and Icewrought Sentry, approximated) |
| One effect per object (a Role for each creature) | Asinine Antics, Twisted Sewer-Witch |
| Cost reduction "if bargained" | Ice Out, Johann's Stopgap, Hamlet Glutton |
| Attached to the source (Auras and Equipment on it) | Kellan, the Fae-Blooded, Faunsbane Troll |
| Others | Ingenious Prodigy, Elusive Otter, Extraordinary Journey, Ashiok, Tangled Colony, Imodane, Skewer Slinger, Sentinel of Lost Lore, Agatha of the Vile Cauldron, The Apprentice's Folly, Yenna, Johann, Likeness Looter, Rowan, Talion, Beluna Grandsquall, Agatha's Soul Cauldron |

## Sublot B1: enchanted creatures ✅ (242 / 269)

- **Cards:** Archon of the Wild Rose, A Tale for the Ages, Lord Skitter's Blessing, Graceful Takedown, Eriette of the Charmed Apple, Syr Armont, the Redeemer.
- **The engine gains:**
  - the filter `enchanted` (`true`: enchanted by at least one Aura; `"byYou"`: by an Aura you control; `false`), read on `LkiSnapshot.enchantedBy` (controllers of the attached Auras, computed like `equipped`);
  - the attack rule `BlockRule.cantAttackPlayer` ("can't attack you or planeswalkers you control"); a script writes `cantAttackSourceController`, fixed on the source's controller when the static applies.
- **Tests:** 5 rules tests ("lot B1"): Archon (with a Monster Role of yours or of the opponent), A Tale for the Ages and Syr Armont, Lord Skitter's Blessing on drawing, Graceful Takedown, Eriette (attack refused, drain).

## Sublot B2: "you tap an opposing creature" ✅ (245 / 269)

- **Cards:** Solitary Sanctuary, Hylda of the Icy Crown, Sharae of Numbing Depths; Icewrought Sentry is no longer approximated.
- **The engine gains:** the tap event says who taps (`by`: the controller of what resolves, otherwise, for a cost or mana, the controller of the permanent); the `taps` trigger takes `byYou` ("whenever you tap…").
- **Tests:** 4 rules tests ("lot B2").

## Sublot B3: a Role for each creature ✅ (247 / 269)

- **Cards:** Asinine Antics (flash for {2} more, `flashExtraCost`), Twisted Sewer-Witch.
- **The engine gains:** `createTokens(…, attachTo)` creates Aura or Equipment tokens attached to each designated object still on the battlefield; `createRole` uses it (no more condition or remembered variable).
- **Tests:** 2 rules tests ("lot B3").

## Sublot B4: "costs less if bargained" ✅ (250 / 269)

- **Cards:** Ice Out, Johann's Stopgap, Hamlet Glutton (`costReduction` under `cond.kicked`).
- **The engine gains:** a cost reduction under `cond.kicked` sees the caster's choice (`spellReduction` receives `kicked`).
- **Fix:** a spell payable only with its kicker (Hamlet Glutton bargained, with five lands) was never offered. `legalActions` offers it, the AI casts it with the kicker, and the interface sets Bargain outright instead of asking.
- **Tests:** 1 rules test ("lot B4").

## Sublot C1: skulk, distributed counters, attached Auras, life lost ✅ (255 / 269)

- **Cards:** Ingenious Prodigy, Elusive Otter // Grove's Bounty, Kellan, the Fae-Blooded // Birthright Boon, Faunsbane Troll, Rowan, Scion of War.
- **The engine gains:**
  - the filters `compare: [cmp.power(">", amount.sourcePower)]` (skulk: "can't be blocked by creatures with greater power") and `attached: "toSource"` ("attached to this creature": "for each" statics, sacrifice costs);
  - `countersDivided` accepts an amount ("distribute X counters");
  - `amount.lifeLostThisTurn`.
- **Tests:** 5 rules tests ("lot C1").

## Sublot C2: damage from a targeted spell, blocks, damage dealt ✅ (258 / 269)

- **Cards:** Imodane, the Pyrohammer, Skewer Slinger, Tangled Colony.
- **The engine gains:**
  - a spell that deals damage is identified by its stack item (`DamageSource.stackId`, `damage` event); the `dealsDamage` trigger takes `spellToSoleTarget` ("a spell that targets only a creature deals damage to it");
  - the `blocks` trigger can designate the blocked attacker as the event object (`eventObject: "attacker"`);
  - last known information keeps the marked damage (`LkiSnapshot.damage`), read by `amount.lkiDamage`.
- **Tests:** 3 rules tests ("lot C2").

## Sublot C3: copies ✅ (261 / 269)

- **Cards:** The Apprentice's Folly, Yenna, Redtooth Regent, Likeness Looter.
- **The engine gains:**
  - `removeSupertypes` (layer 4) and the `nonlegendary` option of `copyToken` ("except it isn't legendary"), with `store`;
  - the filter `notSameNameAs` ("that doesn't have the same name as a token / another permanent you control");
  - `becomeCopy` also copies a card outside the battlefield (graveyard), with added keywords, abilities of the source kept (`keepAbilities`, by rank: no circular structure) and a required mana value (`ifManaValue`).
- **Tests:** 3 rules tests ("lot C3").

## Sublot C4: top of the library, ability costs, Adventures, exile ✅ (266 / 269)

- **Cards:** Johann, Apprentice Sorcerer, Agatha of the Vile Cauldron, Agatha's Soul Cauldron, Beluna Grandsquall // Seek Thrills, Extraordinary Journey.
- **The engine gains:**
  - `PlayFromZone.oncePerTurn` ("once each turn, you may cast… from the top of your library"): the permission used is noted in `turn.onceFired`;
  - `AbilityCostMod.reduce` as an amount (variable reduction, evaluated for the static's source: Agatha's power), `minOneMana` ("this can't reduce the mana in that cost to less than one mana") and `anyMana` ("spend this mana as though it were mana of any color" for those abilities; {C} is still owed as colorless);
  - the enters trigger `fromZone: "graveyard" | "exile"` (replaces `fromGraveyard`): entered from that zone or cast from it (`GameObject.castFromExile`);
  - the filter `adventure` also applies to spells (`spellView`: "permanent spells that have an Adventure").
- **Tests:** 8 rules tests ("lot C4").

## Sublot C5: paying life, chosen number, Adventure cards in exile ✅ (269 / 269)

- **Cards:** Ashiok, Wicked Manipulator, Talion, the Kindly Lord, Sentinel of Lost Lore.
- **The engine gains:**
  - `payLife` (`actions.ts`): all life payments (ability and spell costs, warp, shock lands, "unless", Terror of the Peaks…) go through it; the replacement `eventReplacement({ event: "payLife", instead: { exileFromLibrary: true } })` (R1) exiles that many cards from the top of the library if it has enough. The "enough life" checks are unchanged (rulings);
  - the choice on entering `asEnters: [fx.chooseForSelf("number")]` (1 to 10, badge on the card) and the filter `numberChosen` (equal mana value, power or toughness);
  - `amount.totalManaValue(filter, "exile")`: the cards you own in exile (face down: 0);
  - the exiled card target `own: false` ("you don't own").
- **Tests:** 7 rules tests ("lot C5") and 2 official rulings of Ashiok (`rulings.test.ts`).
- **Deviations:** Sentinel of Lost Lore ("one or more" as optional targets), documented approximation; lifted in PLAN-H (H2): modal triggered ability (`oneOrMore`).

## PLAN-M M8a (rules 199)

- **The Irencrag:** "loses all other abilities" is `loseAllAbilities` with the added equip and static in the same modification; `staticSlots` (`layers.ts`) now keeps the statics granted by the same effect or a later one. Test extended.
- **Brave the Wilds:** two modes, the target land only in the bargained one (mode conditions read at announcement). Test extended.
- **Expel the Interlopers:** the number is chosen as the spell resolves (`fx.chooseNumbers` with a `prompt` and a `suggested` amount: one more than your greatest creature power), then `destroyAll` with `cmp.power(">=", amount.numberChosen("n"))`; one mode instead of eleven. Test rewritten.
- **Will, Scion of Peace and Rowan, Scion of War:** a player effect for the turn (`fx.thisTurn({ spellCost })`), its `reduce` an amount frozen as the ability resolves (`spellCost.reduce` accepts an amount). Rowan's test extended (life lost afterwards, Rowan gone, next turn).
