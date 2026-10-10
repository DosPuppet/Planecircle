# PLAN-M — Backlog, debt and approximations pass (2026-10-10)

## Context

After PLAN-L and the Tevesh Szat & Jeska and Deadpool precons, the user asked for a new pass on `docs/backlog.md`, `packages/cards/data/debt-baseline.json` and `docs/approximations.md`: what can be included, optimised, or removed from debt or approximations. Four read-only surveys (2026-10-10) checked every entry against the code, and a design pass covered the large items.

**User decisions (2026-10-10):**
- **Automatic choices:** all of them become player questions, including those kept earlier by user decision (PLAN-H, PLAN-J). Choices with real stakes are always asked. Payment details (Gene Pollinator, Relic of Legends, Kíli's {0}, the objects that pay for delve, convoke or waterbend) take the suggestion outside full control, as on Arena.
- **PLAN-S final option:** both the "pay" family and the `CardDef` rework are in scope (with `CardScript` derived from `CardDef`).
- **Performance:** out of scope (trigger index, compiled filters, cheaper state copy).

**Survey findings:**
- **Bugs:**
  - Jaxis, the Troublemaker has no Blitz: `scryfall.ts` doesn't parse printed Blitz. Jaxis is its only printed user.
  - Grim Giganotosaurus records "monstrous" as a counter, so proliferating it fires the destroy-all again. Alpha Deathclaw and Maester Seymour fake monstrosity each in their own way.
  - Possibility Storm: the cast spell stays in exile for good.
- **Stale approximation entries:** convoke with a creature that has a mana ability (fixed in L11), Thousand Moons Infantry and Bender's Waterskin (`untapOnOthersUntap` since J5).
- **Entries to reword:**
  - "enters" effects outside a resolution: ninjutsu and sneak now ask their questions.
  - Reflecting Pool: excluding lands of the same kind is correct (106.7); only the Command Tower part is wrong.
  - Tivit: votes now exist on other cards.
  - Nyxbloom Ancient: probably correct; check the ruling.
- **Stale backlog rows:**
  - layer 3 (`LayerMods.textOf` exists since Deadpool);
  - the Samut split-second flag (now under `spellKeywords`);
  - "check other phasing cards" (done);
  - `noLifeGainForAll` (gone);
  - `millUntil`, `becomeCopyKeepAbilities`, `noncombatBonusThisTurn` (removed in J4a);
  - "AI bounds on very large boards" (already measured: 5.7 ms average).
- **Debt:**
  - No entry in the baseline is stale by count.
  - Mergeable entries: `Ref.hostOf` into `Ref.attached`; the `foretell` op and key; `sacrificeCount`; `convoke` with `waterbend`; `perSameName` with `perOwnCreatureTypes`; `reduceSpeed` with `increaseSpeed`.
  - Assimilation Aegis is in the catalog, so the Eriette family has a second user.
  - Wheel of Misfortune's secret choices now have two more users: Mob Verdict and Prisoner's Dilemma.
  - Several baseline descriptions are wrong ("single card" for `spellKeywords` and `cantBeSacrificed`).
  - `importCycleMax` 21 can drop to about 10-12: `effects.ts:12-19` imports every `ops/*.ts` handler table directly; replace that with a registry, plus two late imports.
  - `fx` is now about 1,325 lines (`dsl.ts:582-1906`), not 970.
- **Audits:** the open lists of 2026-10-02, 2026-10-03-cards and 2026-10-07-debt are mostly stale. What remains is covered below or kept.

## Out of scope (stays documented)

- **Rules deferred until a card requires them:**
  - 509.1a (blocking several attackers);
  - battles;
  - loop shortcuts (732);
  - the 616.1 replacement order;
  - layers outside the battlefield (Leyline of Transformation, Painter's Servant, Biotransference).
- **Large approximations:**
  - simultaneous blocks in multiplayer;
  - the 613.8 dependency sort;
  - division, gift and copy-target timing;
  - the "one or more" batch model;
  - costs paid before mana (601.2g-h);
  - an AI controlling another player's turn;
  - pool mana tagged by source (Bat Colony, Tecutlan, The Myriad Pools);
  - mana abilities with a cost in the automatic payment.
- **Large cards:** Slicer (More Than Meets the Eye), Animate Dead, Desperate Ritual (splice), Harold and Bob, Young Deathclaws, Incubate as a double-faced token, Pandemonium (an ability controlled by another player).
- **Kept on purpose:**
  - safety caps (Sin, Ad Nauseam, Delina);
  - display-only differences (persist badge, Outlaws' Merriment, Tibalt's Trickery);
  - the outside-the-game zone;
  - Skyseer's Chariot and Nameless Inversion (PLAN-J reasons);
  - Lifecraft Engine;
  - Feral Encounter;
  - Laboratory Maniac;
  - Tandem Lookout;
  - Final Fortune and the like.
- Performance work, Commander balance, the meta snapshot, public-service features.

## Principles (as in PLAN-J and PLAN-L)

- **Refactor lots** (M2 to M6, M12) change no behavior:
  - golden games replay identically and `RULES_VERSION` stays;
  - the `npm run fuzz` print is recorded before the lot and must match after it on `--pool all`, `--pool meta`, `--format commander --pool commander` and `--players 4`;
  - `--offers` passes.
- **[rules] lots** advance `RULES_VERSION` once each and regenerate only the golden games that diverge (the commit names them). They are grouped into one release (`tools/rooms-check.ts`).
- **Lifted approximations:** each gets an Oracle-based test and leaves `docs/approximations.md`. Each item is checked against its Oracle text and rulings first. One that turns out larger moves to a later lot or stays documented with its reason.
- **New questions:**
  - never asked with a single option;
  - the suggestion is the engine's former pick;
  - English source text with a `fr.json` entry (vouvoiement);
  - AI answers through `heuristicChoice` with the suggestion when `autoOk`.
- **Debt:** ceilings lowered as soon as they go down (`npx tsx tools/debt-ceilings.ts --write "reason"`). A raise is justified in `ceilingNotes`.
- **Process:** one commit per lot or sub-lot on `dev`; `npm run verify -- --set <EXT>` per lot (with `--ui` when the client changes); `--full` at the end.

## Lots (in execution order)

### M0 — Housekeeping (docs only)

- This plan as `docs/plans/PLAN-M.md`, and the CLAUDE.md "Plans" line.
- `approximations.md`: remove the three stale entries; reword "enters outside a resolution", Reflecting Pool and Tivit. Check Nyxbloom Ancient against its rulings and reword or remove it.
- `backlog.md`: remove or rewrite the stale rows listed above, and give the `fx` size.
- `debt-baseline.json`: fix the wrong descriptions (`spellKeywords`, `cantBeSacrificed`, `untapOnOthersUntap`, the `hostOf`/`chooseNumbers` "to reuse for" texts).
- Audits: mark the open items that are done.

### M1 — Bugs [rules]

- **Printed Blitz** (702.152) read from the text in `cards/src/scryfall.ts`, like dash: `altCost` with `via: "blitz"`. Haste, sacrifice at end step and the draw on death are already granted by `stack.ts:128-142`. Test on Jaxis.
- **Monstrosity (701.37) as a generic form:**
  - `fx.monstrosity(n)`: "if it isn't monstrous", add the counters, then the creature becomes monstrous;
  - a monstrous designation on the object, not a counter (reuse an existing object designation if one exists; otherwise justify the `GameObject` field);
  - a "becomes monstrous" action trigger.
  - Applies to Grim Giganotosaurus (`rex/cards.ts:171`), Alpha Deathclaw (`edh/mutant.ts:83`) and Maester Seymour (`edh/counterblitz.ts:186`). Test that proliferate does not fire it again.
- **Possibility Storm** (`edh/deadpool.ts:482`): exile the cast spell first, search using it, then put it on the bottom with the others.

### M2 — Engine health (no rules change)

- **Import cycle:** `ops/*.ts` register their handlers in a registry, instead of `effects.ts:12-19` importing every `HANDLERS` table. Also move the late imports `syncControl` (`state.ts:852`) and `copyStackItem` (`stack.ts:36`). Lower `importCycleMax` from 21 to the measured value.
- **Split `fx`** (`dsl.ts:582-1906`) into `engine/src/dsl/*.ts` by family. The public `fx` object is unchanged.
- **Token factory:** a single `creature()` in `fdn/common.ts`, replacing 15 copies. `sos/common.ts` and `mkm/common.ts` keep thin wrappers.
- **GameState groups:**
  - `setup`: `mulliganQueue`, `mulliganTaken`, `leylineAsked`;
  - `batch`: `eventBatch`, `leftBatch`.
  - GameState 41 → 38. Saved games replay their decisions, so the state shape is not persisted; check `fingerprint.ts` and `savedGame.ts`.
- **Comments:** mark the engine-only fields (`againstYou`, `ofPlayers`, `sourceDefIs`) as internal, like `onceKey`.
- **New test:** every op written by an implemented card has a handler. `runEffectWith` ignores unknown ops silently (`effects.ts:1309`), and raw `{ op: … } as Effect` literals exist (`edh/rakdos.ts:277,528`, `rex/cards.ts:203`, `lci/legends.ts:139`).

### M3 — Small debt merges (M3a no rules change; M3b [rules])

**M3a:**
- `Ref.hostOf` into `Ref.attached { of?: Ref }` (`model/rules.ts:694-698`, `effects.ts:581`): Ref 38 → 37.
- The `foretell` op into a shared exile-to-cast op with `kind` (plot shape, `scryfall.ts:229-262`). The card field moves with castOptions in M5.
- `AltCostPay.sacrifice { filter, count }` replaces `sacrificeCount` (`model/cards.ts:333-336`, `stack.ts:872`).
- `CostDef`: one field for "creatures help pay an ability's mana", with values `"waterbend"` and `"convoke"`: CostDef 28 → 27.
- `perSameName` and `perOwnCreatureTypes` as one layer 7c multiplier relative to the affected object (`layers.ts:1361-1367`): LayerMods 31 → 30.
- `reduceSpeed` and `increaseSpeed` as one `speed { who, by }` op: Effect −1.

**M3b [rules]:** Assimilation Aegis (`otj/unique.ts:449`) rewritten as a `becomesAttached` trigger plus `becomeCopy` while attached. This removes three single-card debt entries (Eriette's family gets its second user) and one `audit-baseline.json` deviation.

### M4 — The "pay" family (no rules change)

One Effect `{ op: "pay"; cost: PayCost; or?; who?; unless?; skip; prompt?; x?; times?; manaOf?; exclude?; totalManaValue?; store? }`.

- `PayCost` is a `Pick<CostDef, …>` alias. CostDef gains `discardRandom`, `poison`, `behold`, and `collectEvidence: number | "X"`.
- All `fx.*` helpers keep their signatures (about 400 call sites unchanged).
- **The handler dispatches to the old bodies, moved verbatim.** This keeps the same:
  - question keys (`pay`, `unless`, `unlessHow`, `evidence`, `behold`, `paycost`, `payx`…);
  - option strings;
  - intents;
  - prompts;
  - payment order.

  Quirks (the Titania and Lim-Dûl question order) are not fixed here.
- **Other readers:** `view.ts:487-509` `wardCost` reads `pay.cost`, through a `payCostText` helper shared with the `unless` prompt. `replacement.ts:161,220` `CHOICE_OPS` becomes a predicate.
- **Sub-lots:**
  - **M4a:** record the fuzz prints;
  - **M4b:** mayPay family, payCostOf;
  - **M4c:** unlessPay, ward, cumulative upkeep, face-down ward, raw literals;
  - **M4d:** forage, collectEvidence, behold;
  - **M4e:** exileForManaValue (its debt entry moves to `singleCardKeys.totalManaValue`);
  - **M4f:** payX;
  - **M4g:** `may`. It is the hottest op (261 users) and keeps the key `may` for the saved "always answer" settings. Kept only if the bench, compared alternately against the code before, shows no regression.
- **Expected:** Effect 148 → about 140, Effect (fields) 650 → about 611, CostDef +3.

### M5 — The CardDef rework (no rules change)

**Pattern:** write both forms, then switch.
1. `singleDef` (`scryfall.ts:928-1460`) writes the old and new fields.
2. A one-off test checks that they match on every implemented card.
3. The readers switch, using lookups by kind (`castOption(d, kind)`, `rule(d, key)`), never iteration order. The priority chains in `baseCastTerms` (`stack.ts:1594-1622`), `spellCost` (`stack.ts:950-994`) and the `castOption` block in `legal.ts:520-764` keep their order.
4. The old fields are deleted.

`legalActions` output must stay byte-identical, because the tutorial depends on it (Burst Lightning's kicker).

**Sub-lots:**
- **M5a:** `cda { pt, power, toughness }`. CardDef 91 → 89.
- **M5b:** `kicker: KickerDef` (kicker, kickerCost, kickerKind, kickerOrPay, gift). → 85.
- **M5c:** xCost, waterbend, forageOrPay, costPerExtraTarget into `AdditionalCost`. → 81.
- **M5d:** `castOptions[]` for graveyard, exile and flash: flashback, harmonize, mayhem, madness, warp, plot, foretell, castFromGraveyard, flashExtraCost. → 72.
- **M5e:** `castOptions[]` for alternatives and face down: altCost, evoke, sneak, webSlinging, impending, disguise, morph, disguiseReduction. `via` replaces the `castVia` chain (`stack.ts:2366-2380`). → 64.
- **M5f:** `rules: CardRules`, a plain object with the 13 card-rule flags (no inflation of the measured surfaces). → 52.

**Measured surfaces:** `CastOption` is added to the measured unions and to `singleCardVariants`, and `KickerDef`/`CardRules` to the interfaces, so single-card kinds stay under the guard. Their `singleCardKeys` entries move accordingly.

Saved games, printings and `origin` are not affected: records store names and decisions.

### M6 — Cost choices offered to the player (no rules change)

**Engine:** new `CostSlot`s in `activationPicks`/`spellPicks` (`stack.ts:3150, 3290`). Each slot's `suggested` is today's automatic function. No new `ActionOption`s, so no explosion of offers. The AI sends no picks and so keeps today's choice.
- **Shared extensions:**
  - `CostPick.autoOk` (the client skips the pick outside full control);
  - label slots (generalizing `counterKind` in `decisionShape.ts:51`);
  - `oneOf` (forage);
  - `minTotal.fromTargets` (Urgent Necropsy).
- **Always asked:**
  - the exiled card of Force of Will and Force of Vigor; Daze's Island;
  - the sacrifice of Flare of Malice, Demon of Death's Gate and Cresting Mosasaurus (`spellCost` reads the chosen victim, `stack.ts:954`);
  - Ninja Teen's bounce (`legal.ts:741`);
  - Gix's discards;
  - the cards Zemo exiles for boast;
  - Urgent Necropsy's evidence;
  - Muldrotha's type;
  - the counter kind for Quilled Greatwurm, Dawnhand Dissident, Scholar of New Horizons and O'aka (options `id:kind`);
  - forage as a cost (Feed the Cycle).
- **`autoOk`:**
  - Kíli's {0}: the slot is published only when the printed cost is also payable;
  - Gene Pollinator and Relic of Legends: `tapForMana.picks.costTap` (`mana.ts:227, 594`), published when there are 2 or more candidates.

**Client:** `CostPickPicker` gets composite labels with `cardRef` and the skip logic (`store.ts:995-1003`, `Prompts.tsx:239-321`).

**Checks:** a Playwright script with screenshots; `tutorial.test.ts` and `tutorial-smoke`.

### M7 — General approximations [rules]

- **Suspend** gives haste to the cast card itself: `castNow` with `haste` sets `StackItem.arrival.haste` (`turn.ts:212`, `stack.ts:4205`). Also fixes Taigam.
- **Shock lands put onto the battlefield at random** are asked: the random pick is stored in `r.vars` (the Indoraptor pattern, `zones.ts:288-292, 704, 1331`).
- **Grand Abolisher:** `abilitiesLocked` is checked in `canActivateMana` (`mana.ts:202`).
- **Ral (emblem) and Prismari:** an Amount for the spells cast before, read from the cast event's `spellsBefore` (`stack.ts:2542`).
- **Suspect:** a timestamped layer 6 entry, like ability counters (`layers.ts:943-949`, `:1321`).
- **"At the beginning of the end step, sacrifice this token"** becomes an ability of the token, via `copyToken.addAbilities` (Kindle the Inner Flame, Choreographed Sparks, Chandra Flameshaper, Electroduplicate).
- **Gift of a permanent:** the gift recipient is copied onto the trigger (`ops/players.ts:113`).
- **Soulstone Sanctuary:** checked against `CREATURE_TYPES` (`targets.ts:192`, `names.ts:21`).
- **Shared Animosity:** a changeling counts all creature types (`effects.ts:116`).
- **Reflecting Pool:** Command Tower counts (`mana.ts:183`).
- **Neriv:** the last-known information carries the turn the object entered (`targets.ts:338`).
- **Green Sun's Zenith:** a "shuffle" fate in `spellFate`; a countered GSZ goes to the graveyard.
- **Quina:** the Frog extras are also applied to copy tokens (`permanents.ts:740`).

### M8 — Small card lifts: Standard sets [rules]

Grouped by set in sub-lots of about 10 cards. Each card is checked against its Oracle text first.

- **Script changes using existing forms:**
  - Garruk −4 (`attacking: "opponent"`);
  - The Irencrag;
  - Brave the Wilds (modes under kicked or not);
  - End-Blaze Epiphany;
  - Aurora Awakener (any number);
  - Ojer Kaslem and Portent of Calamity (`lookAtTop` with `onePerType`; this removes `op.portent`);
  - Zimone's Experiment and Break Out (`chooseAmong` over the library's top cards);
  - The Kingpin of Crime and Maximum Carnage (turn emblems with a static);
  - Expel the Interlopers (`chooseNumbers`; removes a modal special case in `triggers.ts`);
  - Rakdos, Patron of Chaos;
  - Will, Scion of Peace and Rowan, Scion of War.
- **Small engine options:**
  - Memory Vessel (a "can't play from hand" CastLimit);
  - Neriv (see M7);
  - Acrobatic Cheerleader (a once-ever trigger);
  - Rip, Spawn Hunter (`distinctPower`);
  - Unable to Scream (can't be turned face up);
  - Interdimensional Web Watch (mana for a spell cast from exile);
  - Dream Harvest and Ragavan (a cast-only flag on `grantPlay`);
  - Azula (flash on `PlayFromZone`);
  - Zuko (a controller on `MoveSpec`);
  - Squawkroaster (colors from the previous pass);
  - Locus of Enlightenment (once per turn);
  - Teamwork (ignores the crew bonus);
  - Transcendent Archaic and Cut a Deal (number of cards actually drawn, stored);
  - Spider-Slayer (the damaged object as the event object);
  - Bard, King of Dale (a `firstOfDrawStep` condition);
  - Galion (separate base power and toughness);
  - Kang (no power-up on the extra turn);
  - Bilbo (library in `fromZones`; only instants and sorceries exiled);
  - Teval (delve, convoke, improvise and waterbend sources pay generic only).
- **Medium items that fit here:** Cloak and Dagger (recheck at resolution), Nick Fury (ask to transform), Renet (an entered-turn field separate from `controlledSince`), Raft Security Officer.

### M9 — Small card lifts: reprints and EDH [rules]

- **Script changes:**
  - Willie Lumpkin (`fx.throughTheirNextTurn`);
  - Helm of the Host (`copyToken` store + haste);
  - The Ur-Sphinx (all players mill first);
  - Breach the Multiverse (a single move);
  - Codie (`exileUntil` + `grantPlay` this turn);
  - Plague of Vermin (repeated rounds);
  - Stinging Study (choose among your commanders);
  - Expropriate (a Ref for permanents owned by a player).
- **Small engine options:**
  - Hindering Light (spells that target you);
  - Elturel Survivors (lands of the defending player);
  - Mirri (an end-of-combat duration);
  - Sylvan Library (cards drawn this turn marked);
  - Gix (pay 1 life through `mayPay` with a payer);
  - Notion Thief (`drawCards` with a recursion guard);
  - Sphinx Ambassador (searching another player's library fires the search event);
  - Sphinx of the Second Sun (a postcombat main phase recognized; also Florian and Tymna);
  - Cryptolith Fragment (a real mana ability with its drawback);
  - First Family (spell colors from the turn log);
  - Vislor Turlough (the goad ends when control changes);
  - Xenic Poltergeist (until your next upkeep);
  - Share the Spoils (only on the player's own turn);
  - Emrakul, the World Anew (protection from spells on the stack);
  - Mariposa Military Base (asEnters may: tapped + 2 rad);
  - Fathom Mage (one trigger per counter).
- **Medium items that fit here:** Sundering Eruption (a turn player effect), Collective Effort (escalate by tapping a creature), Forgotten Ancient and Resourceful Defense (a `divide` question), Jeska, Yuna (a rider for the next creature spell), Jeweled Amulet (mana type spent recorded).

### M10 — Medium families [rules]

- **M10a: searches.**
  - A search option that holds the found cards (revealed, not moved), then routes them: Archdruid's Charm, Flourishing Bloom-Kin, Dina's Guidance, Elemental Teachings, Celestial Reunion (with behold as an optional cost sharing a type), Aang's Journey (one search, one filter per card).
  - Searches across several zones: Say Its Name, Worldsoul's Rage, Agency Outfitter (`Ref union` for `pickFromZone`).
- **M10b: simultaneous secret choices and votes.**
  - One op for choices revealed together: Wheel of Misfortune, Mob Verdict, Prisoner's Dilemma, A Killer Among Us's secret.
  - A shared vote helper with an extra-vote player static: Tivit, Expropriate, Mob Verdict.
  - Removes `op.chooseNumbers`, and the variants if the form allows.
- **M10c: New Blood.**
  - `LayerMods.replaceCreatureType { from, to }`, in layer 3 with `textOf`, in timestamp order: it maps the subtypes and the subtype fields of abilities (CDAs included).
  - An op that asks for the type (name kind `creatureType`), a trigger refresh next to `e.textOf` (`triggers.ts:124`), and a badge like Deadpool's.
- **M10d: others, one by one.**
  - Echoing Assault (one trigger per attacked player, `triggers.ts:632`);
  - Spinneret and Spiderling (batched damage summed);
  - Henry Wu (an "exploit" action event);
  - Hunting Velociraptor (types shared with the spell);
  - Vigor (a self-trigger "put into a graveyard from anywhere");
  - Marvin (granted abilities from the previous pass, with a loop guard);
  - Riku of Many Paths (number of modes chosen);
  - The Infamous Cruelclaw (discard as an alternative cost in `castNow`);
  - Raiding Schemes (conspire as an optional cost);
  - Silverquill (casualty as a cost);
  - Rottenmouth Viper (sacrifice any number);
  - Old Fat Spider (prevention while the Saga stays);
  - Bumi (attacker filter for the combat);
  - Fblthp (plot from the library top);
  - Cursecloth Wrappings (embalm granted to a graveyard card; white token);
  - Behold variants merged if Celestial Reunion allows (Condition 47 → 46).

### M11 — Automatic choices at resolution and outside it [rules]

- **M11a: questions inside ops.** Each uses `autoOk` with the suggestion, and is asked only with 2 or more options.
  - amass Army (+ Goblin Plate Mail, `counters.ts:69`);
  - untap up to N lands (Rewind, Unwind, Frantic Search): any tapped land the filter allows; scripts that mean "yours" get `controller: "you"` (`zones.ts:1764`);
  - Yenna's Aura host (shared with `moveTo`);
  - Library of Leng (the 5 effect discard paths, `effects.ts:1147`);
  - forage as an effect (after M4);
  - Opposition Agent (the search is asked of its controller);
  - Scholar of New Horizons (battlefield or hand).

  The AI (`ai/src/choices.ts:160`) answers with the suggestion. The fuzz's random AI covers the alternatives.
- **M11b: land play.**
  - `legalActions` probes the first "as it enters" question on a clone for lands with non-choice effects (`legal.ts:410-414`).
  - `Decision.playLand.answer` sits next to `chosen`, so old records still replay.
  - Applies to Scorched Ruins and the reveal of Foreboding Ruins, Fortified Village, Port Town and Vineglimmer Snarl (`autoOk`).
- **M11c: off-stack queue.**
  - `GameState.offStack` (+1, justified) is drained by state-based actions like the commander question (`turn.ts:2085-2125`) and runs through `s.resolving` like `resolveManaAbilityNow` (`stack.ts:3881`).
  - Used only when an arrival has a real choice: linked-exile returns (`replacement.ts:667`), Auras entering outside a resolution (`replacement.ts:524`), full "as it enters" effects (Sin, Mox Diamond, devour).
  - Gemstone Caverns (after `answerLeylines`).
  - The `auto choice` entries become `timing` entries ("at the next check").
- **Expect:** Commander precon golden games to be regenerated (the Y'shtola deck uses "untap up to N").

### M12 — `CardScript` derived from `CardDef` (no rules change)

- A codemod over about 250 script lines, with cost helpers (`flashback("{4}{R}{R}")`, `kicker("{2}")`).
- `singleDef` merges by spread; `tools/card-coverage.ts:67` is updated.
- Done last: it touches every card file.

### M13 — Closing

`docs/history.md` § 16, `backlog.md` ("PLAN-M: not done"), CLAUDE.md, the tracking and summary in `PLAN-M.md`, and the final `npm run verify -- --full`.

## Expected debt movement

| Measure | Change |
|---|---|
| Effect | 148 → about 138 |
| Effect (fields) | 650 → about 605 |
| CardDef | 91 → about 52 (with the new `CastOption`, `KickerDef` and `CardRules` surfaces measured) |
| Ref | 38 → 37 |
| LayerMods | 31 → 30 (+1 in M10c) |
| GameState | 41 → 39 |
| importCycleMax | 21 → about 10-12 |
| Single-card entries | about 10 fewer (hostOf, becomesAttached, attachment, foretell ×2, sacrificeCount, convoke, perSameName, portent, chooseNumbers…) |

## Verification

- **Per lot:**
  - `npm run verify -- --set <EXT>` (the sets touched; `--set COMMANDER` for EDH work);
  - `--ui` for M6, M10c (badge) and M11 (client choices);
  - Vite restarted first.
- **Refactor lots** (M2 to M6, M12):
  - golden games identical (`ai/test/golden.test.ts`);
  - fuzz prints identical before and after (`npm run fuzz -- --games 300 --pool all --jobs 10` and the meta, commander and 4-player variants, same seed);
  - `--offers 5` passes;
  - `tutorial.test.ts` for M5 and M6.
- **[rules] lots:** `RULES_VERSION` advanced; `npm run golden -- --update` only for the games that diverge (named in the commit); one Oracle test per lifted approximation in `engine/test/<ext>.test.ts` or `edh*.test.ts`; rulings in `rulings.test.ts` where relevant.
- **New questions:**
  - a Playwright script with screenshots in `test-results/`;
  - `lang-smoke` (French catalog entries present);
  - the strict fuzz `--offers`;
  - `checkInvariants`: no `autoOk` question with a single option.
- **Debt:** `packages/cards/test/debt.test.ts` and `audit.test.ts` pass with the ceilings lowered.
- **End:**
  - `npm run verify -- --full`;
  - bench compared alternately against the code before the plan (M4g and M2 in particular);
  - `npx tsx tools/rooms-check.ts` before deploying the [rules] release.

## Tracking

| Lot | State | Commit | Rules |
|---|---|---|---|
| M0 | to do | | |
| M1 | to do | | |
| M2 | to do | | |
| M3a | to do | | |
| M3b | to do | | |
| M4 | to do | | |
| M5 | to do | | |
| M6 | to do | | |
| M7 | to do | | |
| M8 | to do | | |
| M9 | to do | | |
| M10 | to do | | |
| M11 | to do | | |
| M12 | to do | | |
| M13 | to do | | |
