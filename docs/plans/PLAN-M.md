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

  Quirks (the Titania and Lim-Dûl's Hex question order) are not fixed here.
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
| M1 | done: printed Blitz read from the text (Jaxis), monstrosity as a generic form (`fx.monstrosity`, `GameObject.monstrous`, action trigger; Grim Giganotosaurus, Alpha Deathclaw, Maester Seymour; proliferate no longer re-fires it), Possibility Storm's spell exiled first and put on the bottom (`discover.exileFirst`; narrower entry left); 4 tests added | | 196 |
| M2 | done: effect handlers registered by `ops/index.ts` in `opRegistry.ts` (imported by `game.ts`), `syncControl` moved to `state.ts` and `copyStackItem` to `stack.ts` (importCycleMax 21 → 10); `fx` split into `engine/src/dsl/fx-<domain>.ts` (one family per `ops/` domain) with `refs.ts`, `when.ts` and `shared.ts`; one `creature()` token factory in `fdn/common.ts` (14 copies removed, sos and mkm wrappers); `GameState.setup` and `GameState.batch` (GameState 41 → 38); engine-only fields marked; `cards/test/op-handlers.test.ts` (2 tests: every op written by a card has a handler, foretell excepted as a special action; the `Effect` union and the registry match); fuzz prints identical | | 196 |
| M3a | done: `Ref.hostOf` into `Ref.attached { of }` (`ref.hostOf` kept as a helper); the `plot` and `foretell` ops into `exileToCast { what, kind }` (the foretell special-action exception of `op-handlers.test.ts` removed; `CardDef.foretell` stays a single-card key until M5); `AltCostPay.sacrifice { filter, count }` replaces `sacrificeCount`; `CostDef.tapToPay` (`"waterbend"` \| `"convoke"`) replaces `CostDef.waterbend` and `convoke` (the `activated` options unchanged); `LayerMods.perAffected` (`{ what: "sameName" }` \| `{ what: "ownCreatureTypes", max }`) replaces `perSameName` and `perOwnCreatureTypes`; `reduceSpeed` and `increaseSpeed` into `speed { who?, by }` (entry `op.speed`, Spikeshell Harrier). Ceilings: CostDef 28 → 27, LayerMods 31 → 30, Effect 149 → 147, Effect (fields) 653 → 652, Ref 38 → 37, Ref (fields) 69 → 68; Single-card values 132 → 135 (the three values that replace keys); baseline: 6 entries removed (`Ref.hostOf`, `op.foretell`, `sacrificeCount`, `convoke`, `perSameName`, `perOwnCreatureTypes`), `op.reduceSpeed` renamed `op.speed`; fuzz prints identical | | 196 |
| M3b | done: Assimilation Aegis rewritten from its Oracle text: a `becomesAttached` trigger (`who: "self"`, to a creature) with `fx.becomeCopy(ref.attached, a creature card exiled with it, "whileAttached", { attachment })` (`becomeCopy` gains the `whileAttached` duration of `gainControl`); `endDetachedEffects` (`state.ts`) ends "for as long as it is attached" effects as soon as the attachment moves (`attach`) or is removed (`unattach`), also at `syncControl`; `copyLinkedExile` kept for Secret Invasion (a static "until this Aura leaves"). Debt: `TriggerSpec.becomesAttached` and `attachment` leave the baseline, `copyLinkedExile` enters it (Secret Invasion alone); Single-card values 135 → 134, Effect (fields) 652 → 653; the audit-baseline deviation removed. 1 test added (`otj.test.ts`: equip → copy, re-equip → the first back to normal and the second a copy, unattached → ends), the N9 audit test moved to Secret Invasion; golden games all identical (none regenerated) | | 197 |
| M4 | done: one `pay` op (`ops/pay.ts`; `cost: PayCost`, a `Pick` of `CostDef` with `collectEvidence` widened to `number \| "X"`; `or`, `who`, `unless`, `skip`, `prompt`, `x`, `times`, `manaOf`, `exclude`, `totalManaValue`, `store`) replaces `mayPay`, `unlessPay`, `payCostOf`, `forage`, `collectEvidence`, `behold`, `exileForManaValue`, `payX` and `may` (M4g kept: bench compared alternately, no regression); the handler dispatches by shape to the former bodies, moved verbatim (question keys, options, intents, prompts, payment order unchanged); the `fx` helpers keep their signatures and move to `dsl/fx-pay.ts` (`fx.unlessPays` gains `discard`, `sacrifice` and an amount `life`: the raw literals of Protection Racket, Ob Nixilis, the Adversary and Indoraptor go through it); `wardAbility`, `cumulativeUpkeepAbility` and `FACE_DOWN_WARD` build it; `CardDef.ward.orMana` becomes `ward.or` (a `PayCost`); `payCostText` (`mana.ts`) shared by the "unless" question and the ward badge; `isChoiceEffect` (`replacement.ts`) replaces the `behold` op in the "as enters" choices. CostDef gains `discardRandom`, `poison`, `behold`. Ceilings: Effect 147 → 139, Effect (fields) 653 → 614, CostDef 27 → 30, Single-card values 134 → 135 (`collectEvidence="X"`, Incinerator of the Guilty); baseline: `op.exileForManaValue` → `singleCardKeys.totalManaValue`. Fuzz prints identical, golden games identical | | 197 |
| M5 | done: `CardDef` grouped (91 → 52 fields), written by `singleDef`; `CardScript` keeps its flat keys (translated by `singleDef`) until M12. M5a `cda { pt, power, toughness }`; M5b `kicker: KickerDef { mana, kind, pay, orPay, gift }` (former `kicker`, `kickerKind`, `kickerCost`, `kickerOrPay`, `gift`); M5c `xCost`, `waterbend`, `forageOrPay`, `costPerExtraTarget` into `AdditionalCost`; M5d/M5e `castOptions: CastOption[]`, a union by `kind` (`flashback` with `extra` and `harmonize`, `graveyard`, `mayhem`, `madness`, `warp`, `plot`, `foretell`, `flash`, `alternative` with `via` evoke/sneak/webSlinging/impending/dash/blitz and `impending`, `faceDown` with `morph` and `reducedBy`), read by `castOption(d, kind)` (`engine/src/cardDef.ts`); the `castVia` chain of `castSpell` reduced to the alternative's `via` (printed evoke and impending are always the alternative chosen); M5f `rules: CardRules` (13 flags), read by `cardRule(d, key)`. Debt guard: `KickerDef`, `CardRules` measured, `CastOption` a measured union and in `singleCardVariants`; `singleCardValues` qualifies `kicker.kind` (not a discriminant). Ceilings: CardDef 91 → 52, AdditionalCost 12 → 16, new KickerDef 5, CardRules 13, CastOption 10, CastOption (fields) 38; Single-card values 135 unchanged. Baseline: `foretell` → variant `CastOption.foretell`, `disguiseReduction` → `reducedBy`; `webSlinging`, `mayhem`, `sneak` (granted forms) and `disguise` (filter), single-card keys masked until now by the CardDef fields, entered with their reason. `audit.ts` counts the group members as fields (audit output identical). Every card definition checked identical to the former form (one-off dump, 6,462 cards); fuzz prints identical after M5b, M5e and M5f, golden games and `tutorial.test.ts` unchanged | | 197 |
| M6 | done: new `CostSlot`s, each `suggested` = the former automatic pick (the AI sends no picks): `handExile`, `altReturn`, `altSacrifice` (`altCostPicks`, `when: "alternative"`: Force of Will, Force of Vigor, Daze, Flare of Malice, Demon of Death's Gate, emerge — `spellCost` reads the chosen victim, `legal.ts` offers only the victims that leave the cost payable), `returnAttacker` for a granted sneak (Ninja Teen), `discardX` (Gix, `countIsX`), `symbolExile` (Zemo, `minTotal` of {B} symbols), `evidence` with `minTotal.fromTargets` (Urgent Necropsy), `permanentType` (Muldrotha, a label slot, non-land types still free), `counterFrom` options `id:kind` (Quilled Greatwurm, Dawnhand Dissident, Scholar of New Horizons, O'aka; `counterKindOptions`, labels citing the card), `forage` with `oneOf` (Feed the Cycle, Osteomancer Adept, Thornvault Forager; `forageOptions` in `actions.ts`), `freeCost` (Kíli, `autoOk`, offered when the printed cost is mana alone and payable for every legal target), `tapForMana.picks.costTap` (Gene Pollinator, Relic of Legends, `autoOk`, 2+ candidates). Shared: `CostPick.autoOk`, `oneOf`, `minTotal.fromTargets`; `LABEL_SLOTS` (generalizes `counterKind` in `decisionShape.ts`, which also checks `tapForMana.picks`); `pickHasChoice` (no question with a single possible answer; also hides an evidence slot whose options are all needed); `checkOffers` handles `oneOf`. Client: `CostPickPicker` takes `onChoose`/`onCancel` (casting stage and the new full-control `manaPick` for `costTap`; `tapMana` replaces the direct `tapForMana` decisions), `oneOf` groups, per-object counter totals, autoOk skipped outside full control, `fromTargets` total and suggestion computed from the chosen targets; an alternative cost without mana no longer opens the full-control "mana" stage. 19 tests added (altcosts 4, edh-sephiroth, edh-tevesh, rex, tmt, fca, msh, mkm, fdn-lotf 2, edh-singles2, blb 2, hob, eoe, edh-mana); `tools/cost-picks-smoke.ts` (Muldrotha's type, Force of Will's exiled card; screenshots in `test-results/m6/`). Fuzz prints identical, strict fuzz (`--offers 5`, all and commander) without disagreement, golden games and `tutorial.test.ts` unchanged | | 197 |
| M7 | done: suspend gives haste to the suspended creature cast (`castNow.haste`, permission and `CastTerms.haste`; Taigam too); random picks put onto the battlefield kept with the answers (`randomPick`, `zones.ts`), so shock lands, "as enters" choices and the attacked player are asked; Grand Abolisher also locks mana abilities (`abilitiesLocked(…, mana)` in `canActivateMana`, the automatic payment included; Yuriko no longer locks activated mana abilities); granted storm read from the cast event (`when.castSpellStorm`, castSpell trigger `storm`: Ral's emblem, whose text said "replicate", and Prismari); suspect as a timestamped layer 6 entry (`GameObject.suspected` holds the timestamp); "At the beginning of the end step, sacrifice this token" as an ability of the token (`SACRIFICE_TOKEN_AT_END_STEP`: Kindle the Inner Flame, Electroduplicate, Chandra, Flameshaper via `copyToken.addAbilities`; Choreographed Sparks via `arrival.atEnd`); a permanent's gift recipient copied onto its triggers (`StackItem.cast.giftTo`) and "if kicked / gift promised" from last known information (`LkiSnapshot.kicked`); creature types from the official list (`isCreatureType`, `hasAllCreatureTypes`, `creatureTypesOf`; `NON_CREATURE_SUBTYPES` removed: Soulstone Sanctuary, changeling, Shared Animosity with `anySubtype: ["*"]`, Diligent Zookeeper); Reflecting Pool counts Command Tower; Neriv from last known information (`LkiSnapshot.controlledSince`); Green Sun's Zenith shuffled only as it resolves (spell fate `shuffle`, `StackItem.bottomInstead` → `libraryInstead`); Quina's Frog (and Worldwalker Helm's Map) for token copies (`createPlusTokens`). Bug found by `verify` (present before the lot, 4-player SOS and 3-player BIG fuzz): a permanent chosen for another cost of a spell (sacrifice, "discard or sacrifice", the kicker's sacrificed, blighted or returned permanent) could also sacrifice itself for mana, then the cost crashed on a missing object; `castSpell` now passes them as `sacrificedForCost` to the payment (as `activateAbility` does). 16 tests added (rulings 4, big, blb 2, sos, mkm, fdn-lotf, wot, eos, tdm, spg, fin) and 2 extended (Choreographed Sparks, Soulstone Sanctuary); 14 approximation entries removed. Ceilings: Effect (fields) 614 → 615, TriggerSpec (fields) 146 → 147, Single-card values 135 → 136 (`fate=shuffle`, Green Sun's Zenith). Golden games all identical (none regenerated) | | 198 |
| M8 | M8a done: Garruk, Curse Breaker −4 (any player's creatures attacking one of your opponents, only those pumped; Jace's emblem was exact); The Irencrag (`loseAllAbilities` with the new abilities in the same modification; `staticSlots` keeps statics granted by the same effect or a later one); Brave the Wilds (two modes under bargained or not); End-Blaze Epiphany (card chosen as the ability resolves); Aurora Awakener (`revealUntilN.anyNumber`); Ojer Kaslem and In the Presence of Ages (`lookAtTop.onePerType` as a type list, `reveal: "all"`); Portent of Calamity (`lookAtTop` with `onePerType`, op `portent` removed); Zimone's Experiment and Break Out (`chooseAmong` over the library's top cards, moved straight); The Kingpin of Crime and Maximum Carnage (emblem statics); Expel the Interlopers (`chooseNumbers` with `prompt` and `suggested`, `cmp.power(">=", amount.numberChosen)`; one mode instead of eleven); Rakdos, Patron of Chaos (offered only if the opponent can sacrifice two); Will and Rowan, Scion (`fx.thisTurn({ spellCost })`, `spellCost.reduce` an amount frozen at resolution). 5 tests added (fra, blb, mkm 2, sos) and 9 extended or rewritten (woe 4, ecl 2, lci, msh, spm; the Riku test of `generic-forms.test.ts` adapted); 14 approximation entries removed. Debt: op `portent` and the stale `chooseNumbers` / `Amount.numberChosen` entries (now also Expel) left the baseline, `suggested` entered (Expel); Effect 139 → 138, Effect (fields) 615 → 617, Single-card values 136 → 137 (`cmp >=`). Golden games all identical (none regenerated). M8b done: Memory Vessel (`castLimit.from: "hand"`, lands included; `from: "elsewhere"` replaces `exceptFromHand`); Acrobatic Cheerleader (`once` on a triggered ability, `GameObject.used`); Rip, Spawn Hunter (`lookAtTop.distinctPower`, top X revealed); Unable to Scream and Karlov Watchdog (restriction `cantBeTurnedFaceUp`, also against effects; `CastLimit.faceUp` removed); Interdimensional Web Watch (`ManaRestriction.spellFrom: "exile"`, replaces `spellNotFromHand`; `ManaPurpose.from`); Dream Harvest and Ragavan (`grantPlay.castOnly`, replaces `adventureOnly`: `castOnly: "adventure"`); Azula (`PlayFromZone.anyTime`); Zuko (`MoveSpec.controller`); Squawkroaster (Vivid reads the colors of the previous layer pass); Locus of Enlightenment (`gainAbilitiesOf.oncePerTurn`; a mana ability's once-per-turn key per ability); teamwork (plain power, `CrewUse`); Transcendent Archaic (`draw.store`: cards actually drawn; usable by Cut a Deal in M9); Spider-Slayer (`dealsDamage.eventObject: "damaged"`); Bard, King of Dale (`EventReplacement.exceptTurnDraw`); Galion (`modify.basePT` as a pair); Kang (player effect `nextTurn`, `PlayerEffect.from`, `castLimit.abilities: "powerUp"`); Bilbo (`fromZones` library and command; `castNow.afterFilter`); Teval (delve and convoke never pay {C}); Cloak and Dagger (a `target.of` target rechecked on resolution as held by the chosen player); Nick Fury (`transform.may`); Renet ("entered this turn" read from the turn log, battlefield arrivals logged with the new id; no longer `controlledSince`); Raft Security Officer (one ability, reduction read from the target); found by the FCA strict fuzz (seed 26, present before the lot): an additional sacrifice offers the Treasures last and `legalActions` doesn't count the mana of the one sacrificed by default (Deadly Dispute). 22 tests added (dsk 3, spm 2, ecl 2, fca, tla, lci, meta, sos, hob 4, msh 3, tdm, tmt, offers) and 4 extended or rewritten (big, tla, msh, mkm; otj's Ghired staging adapted); 23 approximation entries removed. Debt: keyword `cantBeTurnedFaceUp`, keys `afterFilter` and `distinctPower` entered; `exceptFromHand`, `faceUp`, `adventureOnly`, `eventObject`, `exceptTurnDraw` left the baseline; Single-card values 137 → 146, PlayFromZone 21 → 22, EventReplacement 19 → 20, MoveSpec 18 → 19, Effect (fields) 617 → 621, TriggerSpec (fields) 147 → 148, CastLimit 9 → 8. Golden games all identical (none regenerated) | | 199, 200 |
| M9 | M9a done: Willie Lumpkin (`fx.throughTheirNextTurn`); Helm of the Host (`copyToken.store` + a `modify` with haste: a copy of the token has none); The Ur-Sphinx (all players mill, then the casts); Breach the Multiverse (one `chooseAmong` per player, then a single move); Codie (`exileUntil` with a lesser mana value resolved by `withX`, `grantPlay` free until end of turn, the rest on the bottom); Plague of Vermin (rounds repeated while someone pays, twenty at most); Stinging Study (`chooseAmong` among your commanders, `suggest: "manaValue"`); Expropriate (`ref.permanentsOwnedBy`, Ref zone `owned`); Hindering Light (`TargetFilter.spellsTargetingYou`); Elturel Survivors (`refCount` of `ref.defendingPlayer`'s permanents in the layers, `refCount:zone`); Mirri (`fx.thisCombat`, player effect `endOfCombat`); Sylvan Library (`ObjectFilter.drawnThisTurn`, the draw logged with its card); Gix (`fx.mayPayLifeFor`: a payment by that player; an unpayable life payment isn't asked); Notion Thief (the thief's draw through `drawCards`, replaced by an opposing thief but not twice, 614.5); Sphinx Ambassador (`search.library`, the found card held in the library, the `search` event naming the library); Sphinx of the Second Sun, Florian and Tymna (`when.postcombatMain`, `nth: "postcombat"`); Cryptolith Fragment (a mana ability with `drawback.life`, replacing `opponentsGainLife`); First Family (`aggregate.withSpellsCast`); Vislor Turlough (`ModifyWhile` `sourceControlledBy`); Xenic Poltergeist (duration `untilYourNextUpkeep`); Share the Spoils (`PlayFromZone.during`); Emrakul, the World Anew (`protection.spells`, `asSpell` through target legality); Mariposa Military Base (`chooseOption` as an "as it enters" choice, `fx.tap(ref.self)` = enters tapped); Fathom Mage (`when.eachCounterPut`); Cut a Deal (`draw.store` → `<store>Players`). 22 tests added (edh-fantastic 2, edh-darkleo, edh-ursphinx 4, edh-tevesh, edh-deadpool 4, edh-rakdos 2, edh-mana, edh-counterblitz, spg 4, otp, fca) and 4 rewritten (First Family, Codie, Plague of Vermin 2); 24 approximation entries removed, 1 narrowed (Plague of Vermin: the twenty-round cap). Debt: `owned`, `drawnThisTurn`, `spellsTargetingYou`, `withSpellsCast`, `library`, `suggest`, `sourceControlledBy` entered; `opponentsGainLife` and `storeAll` (now two users) left the baseline; Single-card values 146 → 148, ObjectFilter 64 → 65, PlayFromZone 22 → 23, Effect (fields) 621 → 623, TriggerSpec (fields) 148 → 149, Amount (fields) 77 → 78, Ref (fields) 68 → 69. Bundle: the `index` chunk 2299 → 2303 KB, its budget raised 2300 → 2350 KB (`tools/bundle-size.ts`). Golden games all identical (none regenerated). Medium items (Sundering Eruption, Collective Effort, Forgotten Ancient, Resourceful Defense, Jeska, Yuna, Jeweled Amulet): M9b. M9b done: Sundering Eruption (emblem static for the turn); Collective Effort (escalate by tapping creatures: `ModeDef.additionalCost`, `CostPick.modes`); Forgotten Ancient and Resourceful Defense (`fx.moveCountersDivided`: a division, one per kind); Jeska (player effect, `EventReplacement.sourceRef`); Yuna (`ManaAbilityDef.playerEffect`, the spell being paid included); Jeweled Amulet (`CostPaid.manaTypes`, `chosen.manaType`, a real mana ability); Echoing Assault and Bitter Work (`attackWith.eachPlayer`, target attacking that player); also Rewind, Unwind, Frantic Search and Finale of Revelation ("untap up to N" asked), Scholar of New Horizons (the "you may" asked), Creeping Bloodsucker (`storeDealt`); found by the strict fuzz (present before the lot): the automatic payment with Vivi Ornitier's surplus mana. 11 tests added (edh-counterblitz 4, edh-deadpool 2, edh-tevesh, edh-staples, edh-rakdos, edh-vivi, tla) and 4 rewritten or extended (Forgotten Ancient, Resourceful Defense, Jeweled Amulet, Scholar of New Horizons); 10 approximation entries removed. Left: Scorched Ruins and the reveal lands (an "as it enters" pick beyond the first question of a land played), Relic of Legends (payment detail), Kardur and the larger `rule` entries. Debt: `sourceRef`, `fromCost`, `playerEffect` entered; `removeCounter` left; EventReplacement 20 → 21, Effect (fields) 623 → 625, TriggerSpec (fields) 149 → 150. Golden games all identical (none regenerated) | | 201, 202 |
| M10 | M10a done: searches that hold the found cards (`fx.searchHold`: a `search` without `to`, revealed, routed by the effects that follow, then `fx.shuffle`): Archdruid's Charm and Flourishing Bloom-Kin (the land straight onto the battlefield; the player chooses which Forest), Dina's Guidance (hand or graveyard asked, `fx.yourChoice`), Elemental Teachings (the opponent chooses among the held cards), Celestial Reunion ("choose a creature type and behold two creatures of that type" as a real optional cost: `additionalCost.behold { count, ofChosenType }`, label cost slot `creatureType` with the behold slot grouped by type (`oneOf`, so independent defaults agree: found by the ECL strict fuzz), the type noted on the spell, `chosen.creatureType`; `Condition.beholdSharingType` removed); one filter per card (`search.each`, a pick that can't give each card its own filter refused): Aang's Journey kicked (one search, one shuffle), Agency Outfitter; several zones in one choice: `search.alsoFrom` (replaces `alsoGraveyard`; Say Its Name, Agency Outfitter: the library shuffled and the search event only if a card comes from it or nothing is found), Worldsoul's Rage (`pickFromZone` over `ref.union` of the hand and the graveyard); Opposition Agent exiles only the cards found in the library (held cards included). 5 tests added (mkm 2, dsk, tla, ecl) and 4 rewritten or extended (Archdruid's Charm, Worldsoul's Rage, Dina's Guidance, Elemental Teachings); 8 approximation entries removed, 1 narrowed (Celestial Reunion: the types offered are those named by the candidates). Debt: `ofChosenType` entered, `Condition.beholdSharingType` left; Effect (fields) 625 → 626, Condition 47 → 46, Condition (fields) 90 → 87. Golden games all identical (none regenerated). M10b done: one `eachChooses` op (replaces `chooseNumbers`): each player chooses in turn order starting with the controller a number, an option or another player; `secret` answers stay under question keys (`secretAnswerKey`) hidden from the view, the events and the AI's state (`forgetSecrets`, called by `determinize`), then are revealed together (`chose` event, game log); public answers and votes are announced as made. Votes (`fx.vote`, 701.38) with the `extraVotes` player static (Tivit: "you may vote an additional time", any vote), effects after all votes, "for each … vote" by `fx.repeat` (op `repeat`: copies its effects into the resolution, 100 at most) and `amount.votes(store, option | player, by)` (`Amount.numberChosen` → `chosen`, `Ref.numberChoosers` → `choosers`, also an option's rank): Wheel of Misfortune, Mob Verdict (one damage event per vote), Prisoner's Dilemma, Tivit, Expropriate. A Killer Among Us: `chosen.secret` is the chooser (only they see it, whoever controls it), the `revealChosen` cost (only they can activate; reveals it). 8 tests added (edh-rakdos, edh-deadpool 2, edh-ursphinx 2, spg, mkm, plus 2 in `ai/test/hidden-info.test.ts`); 4 approximation entries removed, 1 narrowed (Wheel: 0 to 20). Debt: `extraVotes` and `revealChosen` enter the baseline, `Ref.numberChoosers` and `secret` leave it; CostDef 30 → 31, Effect 138 → 139, Effect (fields) 626 → 631, Amount (fields) 78 → 81. Golden games all identical (none regenerated). M10c done: text-changing effects that replace a word (612.2, layer 3): `LayerMods.replaceWord { kind: "creatureType", from, to }` applied with `textOf` in timestamp order, mapping the type line and the subtype fields of the ability data (`textChange.ts`: filters, token specs and their name, counts, type changes; statics through `staticSlots`, characteristic-defining P/T recomputed; not copiable); op `changeText` (`fx.replaceCreatureType`) asks the type among those its text uses (type line first, no question for one); New Blood rewritten (the "Vampire in addition" approximation removed; display-only remainder noted: image, Oracle text and labels keep the printed wording); pen badge "Vampire instead of Elf" (`ObjectView.wordChanges`) and a preview line. Found: `fx.gainControl` without option lasts until end of turn, so eight cards whose control has no duration lost it at cleanup; `{ indefinitely: true }` for Agent of Treachery, Captivating Vampire, New Blood, Tevesh Szat's −10, Sliver Overlord, Emrakul, the World Anew, Coveted Falcon, Archmage's Charm. 3 tests added and 1 rewritten (`edh-edgar`), 4 extended (control after the turn); 1 approximation entry removed, the backlog layer-3 row done. Debt: op `changeText` enters the baseline; LayerMods 30 → 31, Effect 139 → 140, Effect (fields) 631 → 635. Golden games all identical (none regenerated). M10d done: two strict-fuzz disagreements fixed first (Commander, 3 players: seed 250, the automatic payment now activates the sources that cost life before a drawback, Hall of the Bandit Lord then Ancient Tomb at 3 life; seed 267, the default harmonize creature leaves the rest payable with Springleaf Drum); 14 cards lifted: Spinneret and Spiderling and Innocent Bystander (`batched: "sum"`: simultaneous damage added up), Henry Wu (exploit action event, his own trigger), Hunting Velociraptor (prowl by the spell's creature types), Vigor (trigger from the graveyard, `when.putIntoGraveyardFromAnywhereSelf`; found: the Eldrazi titans' same trigger fired for any card put into a graveyard), Marvin (granted abilities from the previous layer pass, loop guard), Riku of Many Paths (`CastInfo.modes`, up to X combinations), The Infamous Cruelclaw (`castNow.discard`), Raiding Schemes and Silverquill (`copyCost`: conspire and casualty as optional cost slots), Rottenmouth Viper (any number of sacrifices), Old Fat Spider (`fx.whileSource` prevention effect), Bumi, Unleashed (`fx.nextCombat({ attackersOnly })`), Fblthp (plot special action from the library top), Cursecloth Wrappings (embalm granted to the graveyard card, white Zombie token). Tests: 13 added (offers 2, spm, mkm, rex 2, edh-turtles, edh-rakdos, dsk, otj, blb 2, hob) and 7 rewritten (ecl, sos, otj 2, dft, blb, tla); 11 approximation entries removed, 3 narrowed (Cursecloth: the token's mana cost; Marvin: abilities naming their grantor; Raiding Schemes/Silverquill: one instance per spell). Debt: `attackersOnly`, `copyCost`, `plotFromLibraryTop` (playerStatic), `manaOfSource`, `casualty`, `conspire`, `prowl`, `exploit` (single-card keys) enter the baseline, `sourceRef` leaves it; CostDef 31 → 32, ActivatedAbilityDef 19 → 20, CastInfo 10 → 11, Effect (fields) 635 → 637, single-card values 148 → 151. Golden games all identical (none regenerated) | | 203, 204, 205, 206 |
| M11 | M11a/b done: questions inside ops, each with `suggested` = the engine's former pick and asked only with two answers or more: amass asks which Army among several (`counterOnOrCreate`, intent `amass`; `fx.amass(…, store)`: Goblin Plate Mail attaches to that Army); a token copy of an Aura asks its host (`auraHostChoice`, shared with `moveTo`; `auraHosts` takes a definition for a copy not created yet: Yenna); Library of Leng asks which cards discarded by an effect go on top (`discardToTopChoice`, card by card, in the order of the answer; discard, connive, wheel and punisher; a random discard kept under a key for the replay; madness cards offered, not suggested; a cost discard such as a ward's "discard a card" no longer goes on top: costs aren't effects); forage as an effect asks three cards or a Food, then which (intent `forage`); Opposition Agent: the search was already asked of the Agent's controller and the "may" before it stays the searcher's (rulings), and every card found is now exiled, in any zone searched (ruling; M10a exiled only the library's). The untap-up-to-N entry was stale (M9b). Land play: `landEntersQuestion` (`replacement.ts`) gives the first "as it enters" question in `probe` mode, or in `ask` mode on a copy of the state (events discarded) when the effects do more than choose (Scorched Ruins, Lake of the Dead: the lands sacrificed; Mariposa); `Decision.playLand.answer: ChoiceValue[]` (several values; `chosen` still read for older records, `decisionShape.ts` checks `answer`), validated by `validateChoice`; the reveal lands (Port Town, Fortified Village, Vineglimmer Snarl, Foreboding Ruins) use `fx.mayReveal` (`CostDef.reveal`, an `autoOk` question in `asEnters`, read by `cond.beheld`). AI: `heuristicChoice` answers `autoOk` questions (except trigger order, proliferate, combat damage) and the intents `amass`, `libraryTop`, `forage` with the suggestion; Yenna's host keeps the simulation of `moveTo`'s host question. `checkInvariants`: no `autoOk` question with a single answer. Client: `playLand` skips an `autoOk` land question outside full control; `LandChoice` handles a multi-value pick (toggle, counter, Confirm) and names hand and battlefield cards; one-off Playwright check (Scorched Ruins' lands, Library of Leng; screenshots in `test-results/m11/`, script deleted). 12 tests added (edh-vision 4, hob 2, woe, spg 2, blb 2, edh-deadpool) and 1 in `ai/test/invariants.test.ts`; 9 approximation entries removed (untap up to N, amass, forage during a resolution, Yenna, Goblin Plate Mail, Library of Leng, the reveal lands, Scorched Ruins, Opposition Agent), the Aura and payment-detail entries reworded. Debt: CostDef 32 → 33 (`reveal`), Effect (fields) 637 → 638 (`counterOnOrCreate.store`). Golden games all identical (none regenerated). M11c: to do | | 207 |
| M12 | to do | | |
| M13 | to do | | |
