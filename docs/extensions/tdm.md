# Tarkir: Dragonstorm (TDM, 259 cards)

Mechanics and details of the lots.

Phase 2 of plan P4 (see `docs/history.md`), requested by the user on 2026-10-01. 25 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): behold, mobilize, harmonize, Omen and renew were born there. The set follows the integration rules of PLAN-R (R1 and R7, end of CLAUDE.md).

| Mechanic | Lot |
|---|---|
| Cards doable with the engine: Devotees, Dragonstorms, Monuments, lands, behold ("Exhale"), mobilize, harmonize, Sagas | A |
| Endure (701.64), Flurry, renew, Omen dragons, Sieges | B |
| Legendary and unique cards | C |
| New Way Forward: "the next time" shields (615.7), on the generic replacement frame (R1) | D |

The scripts are in `packages/cards/src/tdm/`: `cards` (meta cards, phase 1), `white`, `blue`, `black`, `red`, `green`, `multi` and `artifacts` (colorless artifacts and lands). The helpers are in `tdm/common.ts`:

- tokens: Monk, Warrior, 1/1 white Spirit (X/X with `createXXToken`), 2/2 Soldier, Zombie Druid, Bird, 5/5 Elephant, Reliquary Dragon;
- filters: `DRAGON_CARD`, `DRAGON_YOU`, `CREATURE_WITH_COUNTER` ("a creature you control with a counter");
- cycles: `devotee(colors)`, `dragonstorm()`, `monumentSearch(lands)`, `entersTappedUnless(lands)`, `triLand(colors)`.

## Lot A ✅ (187 / 259)

- **Cards:** 162 new ones, including the cycles of the Devotees, Dragonstorms, Monuments, the three-color lands and the "enters tapped unless" lands, the "Exhale" spells (behold a Dragon), the Sagas, Stormscale Scion (storm: `castSelf` and `copySpell`), Dragonstorm Globe, Breaching Dragonstorm (`castNow` on the exiled card).
- **The engine gains:**
  - `fx.addManaChoice(n, colors)`: one mana among certain colors only (Devotees: "{1}: add {R}, {W} or {B}; once per turn");
  - `fx.lookAtTop(…, { exact: true })`: take exactly N cards, and not "up to N" (Sibsig Appraiser, Rakshasa's Bargain, Rediscover the Way);
  - `cond.sourceDealtDamage` and `GameObject.dealtDamage`: "as long as it hasn't dealt damage yet", combat or not (Karakyk Guardian);
  - search reads `cmp.manaValue("<=", amount.x)` with the X of the resolving spell (Nature's Rhythm).
- **Costs:** cost increases go through a negative `costReduction` (Caustic Exhale: {1} more without a Dragon to behold; Dragon's Prey: {2} more if it targets a Dragon); affinity for creatures and "{1} less for each attacking creature" through an amount.
- **Fix [rules]:** an intervening "if" on the event object (`cond.eventObjectMatches` as a triggered ability condition) was never true on triggering: Aclazotz, Deepest Betrayal (LCI) never created a Bat when an opponent discarded a land. `checkCondition` receives the event object, on triggering and on resolution (603.4). `RULES_VERSION` = 20, golden games regenerated.
- **Debt:** `damageDivided` now serves two cards (Twin Bolt): its entry leaves `debt-baseline.json`.
- **Tests:** `engine/test/tdm.test.ts` (24 more rules tests: Devotees, Dragonstorms, variable costs, Sunpearl Kirin, Furious Forebear, Karakyk Guardian, storm, Host of the Hereafter, Monuments, Embermouth Sentinel, Nature's Rhythm, Severance Priest, Flamehold Grappler…), the Aclazotz fix in `engine/test/lci.test.ts`, the smoke test `ai/test/smoke/tdm.test.ts`; one more pattern in the Oracle expectations ("Return target card from your graveyard to your hand.").

## Lot B ✅ (232 / 259)

- **Cards:** 45 new ones: endure (Anafenza, Fortress Kin-Guard, Warden of the Grove…), flurry (Poised Practitioner, Wingblade Disciple, Cori-Steel Cutter, Devoted Duelist…), renew (Agent of Kotis, Sage of the Fang, Naga Fleshcrafter, Kheru Goldkeeper…), the Omen dragons (Riling Dawnbreaker, Marang River Regent, Scavenger Regent, Bloomvine Regent…) and the five Sieges.
- **The engine gains:**
  - endure (701.64): effect `endure` (`fx.endure(ref, n)`, `ops/counters.ts`). The controller chooses N +1/+1 counters or an N/N white Spirit token; if the permanent is no longer on the battlefield, the token is created; endure 0 does nothing;
  - choosing a mode on entering (Sieges, 614.12): `asEnters: [fx.chooseForSelf("mode", { options: ["Abzan", "Mardu"] })]` (script), the chosen mode kept in `chosen.mode` (badge on the card), read by `cond.chosenMode("Abzan")`;
  - `triggerMod.on: "attack"` (family G): "if a creature attacking causes an ability of a permanent you control to trigger, it triggers an additional time" (Windcrag Siege, Mardu mode: mobilize included);
  - the keyword decayed (`decayed`, 702.147: can't block; sacrificed at end of combat after attacking), and the counter of the same name;
  - `amount.countersOn(ref, "any")`: all the object's counters (Warden of the Grove).
- **Helpers:** `flurry(effects, label, targets)` (flurry: `when.castNthSpell(2)`) and `renew(mana, targets, effects, label)` in `tdm/common.ts`.
- **Behavior unchanged** for the cards already handled (identical golden games): no new rules version.
- **Tests:** 13 more rules tests in `engine/test/tdm.test.ts` (endure by choice, token when the permanent is gone, Warden of the Grove, flurry on the second spell only, renew of Sage of the Fang, Exude Toxin, Bloomvine Regent, the Barrensteppe, Glacierwood and Windcrag Sieges, flash of Whirlwing Stormbrood). Verified in the browser by a one-off Playwright script (screenshots in `test-results/tdm/`): choice of a Siege's mode, mode badge, choice of endure.
- **On the way:** `tutorial-smoke` was already failing before this lot ("off-guide action refused"): it clicked 300 ms after the start of lesson 2, before the game was ready. It now waits for the player's priority.

## Lot C ✅ (257 / 259)

- **Cards:** 25 legendary and unique cards, in `tdm/legends.ts`: Ugin, Eye of the Storms, Elspeth, Storm Slayer, Taigam, Teval, Kotis, Shiko, Ureni, Betor, Narset, Eshki, Felothar, Zurgo, Sidisi, The Sibsig Ceremony, Call the Spirit Dragons, All-Out Assault, Mardu Siegebreaker, Roar of Endless Song, Songcrafter Mage, Stalwart Successor, Hundred-Battle Veteran, Krumar Initiate, Rot-Curse Rakshasa, Dracogenesis, Formation Breaker.
- **The engine gains:**
  - suspend (702.62): effect `suspend` (`fx.suspend(ref, n)`); the spell leaves the stack without being countered (or the card leaves the hand) and goes to exile with N time counters. At each upkeep of its owner, an ability removes a counter (`suspendUpkeep`, `turn.ts`); on the last one, they may cast the card without paying (haste for a creature) (Taigam);
  - delve (702.66) granted to spells: `playerStatic({ delveSpells: true })`; the mana solver uses it as a last resort, each graveyard card exiled paying {1} (Teval);
  - an additional combat after the main phase, followed by a main phase (`fx.extraCombatAfterMain`, All-Out Assault);
  - "can't be sacrificed" (`cantBeSacrificed`, restriction read by sacrifice, its costs and its choices: Zurgo);
  - the trigger `countersPut(…, firstThisTurn)` ("the first time counters are put on it each turn": Stalwart Successor);
  - `fx.doublePT(ref)`: double the power and toughness of each designated creature (Roar of Endless Song, Dragonclaw Strike);
  - granted harmonize (`fx.grantHarmonize`, Songcrafter Mage);
  - the amounts `counterKindsAmong` (Hundred-Battle Veteran) and `totalToughness` (Betor), the reference `ref.union` (Call the Spirit Dragons), the `cast` filters ("if you cast it": The Sibsig Ceremony) and `cmp.power("<", amount.sourcePower)` (Formation Breaker), `castNow` with `maxManaValue` (Kotis), `castFromGraveyard.finality` (Hundred-Battle Veteran), `freeFilter` of a casting permission (Dracogenesis), the cost `payLifeX` (Krumar Initiate) and the `countX` targets ("X target creatures": Rot-Curse Rakshasa).
- **Fixes on the way:**
  - decayed granted by a counter didn't have its triggered ability: the quick filter of trigger sources only knew prowess;
  - the debt guard read the `Keyword` union up to the first ";", including in a comment: it now strips comments.
- **Debt:** three justified entries (`delveSpells`, `cantBeSacrificed`, `suspend`, one card each), two removed (`chooseAmong` and `untapAll` now serve several cards).
- **Behavior unchanged** for the cards already handled (identical golden games).
- **Tests:** 23 more rules tests in `engine/test/tdm.test.ts`, at least one per card (suspend over four turns, delve, extra combat, victory of Call the Spirit Dragons…).

## Lot D ✅ (**259 / 259**) — damage replacements (R1)

New Way Forward brings the first "the next time" shield (615.7) and Neriv a new damage replacement (family E): as rule R1 requires (end of CLAUDE.md), the generic frame is written and the flags of the same family are converted to it.

- **The engine gains:**
  - `EventReplacement` (`model/cards.ts`): event (`damage` or `lifeLoss`), source (filter seen from the controller), recipient (`you`, `yourSide`, `opponent`, `opponentSide`, `toFilter`), combat or not, `modify : { add, times, atLeast, prevent }` (`atLeastSourcePower` before PLAN-H H7a), `onPrevent` (mill the opponents, reflexive ability "when damage is prevented this way"). Printed ability `eventReplacement(…)` (`EventReplacementAbilityDef`); player effect `fx.thisTurn({ replacement })`;
  - the collector `eventReplacements` (`statics.ts`) and the application in `dealDamage` and `loseLife`: modifications ordered by `chooseReplacementOrder` (616.1); a prevention controlled by a player other than the damaged one goes before the modifications (The Mindskinner mills the least), the damaged player's goes after (New Way Forward returns the most);
  - the shields (615.7): `fx.shield(replacement, sourceChoice)`, a single-use player effect until end of turn, removed when it applies (`consumeReplacement`);
  - prevented damage no longer counts as dealt (Ruric Thar, Karakyk Guardian).
- **Conversions:** ten `PlayerStaticAbilityDef` flags disappear (`noncombatDamageBonusAll`, `noncombatDamageBonus`, `noncombatDamageBonusAmount`, `noncombatDamageAtLeastPower`, `damagePlusOneFrom`, `damagePlusOneToOpponents`, `damageTakenDoubled`, `damageToOpponentsMills`, `creaturesDamageImmune`, `doubleOpponentLifeLossYourTurn`), as well as the damage doublers (`damageToOpponents`, `creatureDamage`, `damageFilter`, `noncombatDamage`) and the operations `doubleDamageTo` and `preventDamageToYourCreatures`. Converted cards: Tomik, Izzet Sparkmage, Bloodletter of Aclazotz, Ojer Axonil, Artist's Talent, Valley Flamecaller, Far Fortune, The Mindskinner, The Rollercrusher Ride, Twinflame Tyrant, Gratuitous Violence, Trance Kuja, the Marvel Super Heroes card that doubles the damage of the equipped creature, Lightning, Army of One, Summon: Alexander and Taii Wakeen.
- **Debt:** a generic field (`replacement`) and an operation (`shield`, one card) come in; ten flags and two operations go out.
- **[rules]:** `RULES_VERSION` = 21, golden games regenerated (they already replayed identically).
- **Tests:** Neriv and New Way Forward in `engine/test/tdm.test.ts` (3 tests: double damage, single-use shield, other source and end of turn); two 616.1 decisions in `engine/test/rulings.test.ts` (the damaged player's shield after the opposing doubler, opposing prevention before); the existing tests of the converted cards (`audit`, `rulings`, `player-effects`) pass with no change of result.

## Set summary

- 234 cards added in four lots (25 were already handled by the meta phase), 0 deviations in the Oracle ↔ script audit.
- 63 rules tests in `engine/test/tdm.test.ts` (in addition to the 24 of the meta phase), 2 in `rulings.test.ts`, 1 in `lci.test.ts`.
- Deviations found on the way and fixed: intervening condition on the event object (Aclazotz), decayed granted by a counter, blind spot of the debt guard, `tutorial-smoke` delay.

## PLAN-M M7 (rules 198)

- **Neriv, Heart of the Storm:** a creature that entered this turn and left the battlefield before dealing its damage is judged by its last known information (`LkiSnapshot.controlledSince`).
- **Taigam, Master Opportunist:** the suspended copy fix is general (suspend: haste only for the suspended creature; `docs/extensions/core.md`).
- **Tests:** `tdm.test.ts` (+1 Neriv).

## PLAN-M M8b (rules 200)

- **Teval, Arbiter of Virtue:** a card exiled for delve pays generic mana only, never a {C} symbol (the solver's delve and convoke sources no longer have the `C` color; waterbend and improvise already paid generic only). Test added (Warping Wail).
