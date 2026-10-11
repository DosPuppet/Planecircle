# Murders at Karlov Manor (MKM, 268 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-01, after Wilds of Eldraine and Secrets of Strixhaven. 10 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): surveil lands, Vengeful Tracker, collect evidence (Deadly Cover-Up)… Disguise, cloak, Cases, collect evidence and Clues already exist in the engine. The set follows the integration rules of CLAUDE.md (debt, R1, R7). Breakdown: one sub-lot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Foundation: suspect (701.60), tokens | 0 |
| Cards feasible with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendaries and unique cards | C and following |

The scripts are in `packages/cards/src/mkm/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless cards and lands) and `legends`. The helpers are in `mkm/common.ts`.

## Sub-lot 0: foundation ✅ (10 / 268)

- **Suspect (701.60):** designation `GameObject.suspected`; a suspected permanent has menace and "can't block" (added with the counter keywords, after layer 6 effects); `fx.suspect(ref)` and `fx.suspect(ref, false)` ("it's no longer suspected"); `suspected` filter (`SUSPECTED`: "suspected creature"); the designation is lost on leaving the battlefield. The view shows it (`ObjectView.suspected`, "Suspected" badge).
- **Tokens:** 2/2 white and blue Detective, 2/1 black Skeleton, 1/1 white and black flying Spirit, 5/5 green and white Wolf with trample, 2/1 black and green Spider (reach, menace), 2/2 red Imp ("when it dies, it deals 2 damage to each opponent"), 1/1 blue Merfolk; Clue, Thopter, Dog, Human and Goblin come from the commons.
- **Tests:** 2 tests in `engine/test/mkm.test.ts` ("foundation"); smoke test `ai/test/smoke/mkm.test.ts`.

## Sub-lot A1: white cards ✅ (37 / 268)

- **Cards:** 27 (out of 34), including suspect, Cases (Case of the Pilfered Proof), disguise (Perimeter Enforcer, Haazda Vigilante…), Clues and Detectives.
- **[rules] Engine fixes (found by the lot A agents):**
  - a triggered ability with "one, two or three targets" (`target.between`) respects its minimum: Armament Dragon (TDM) had no target with fewer than three creatures (test added in `tdm.test.ts`);
  - the condition of a triggered ability sees the whole event (`amount.eventAmount`: "if 3 or more damage");
  - `cond.handAtMost` ("if it has no cards in hand") is evaluated outside resolution ("To solve" of a Case, a trigger's condition): it was always false.
  - `RULES_VERSION` = 33.
- **Debt:** the `suspect` operation (701.60) enters `debt-baseline.json` as long as a single card uses it; `solveCase` (Cases) leaves it, several cards use it.
- **Remaining:** Aurelia's Vindicator (X of the disguise cost), Case File Auditor ("whenever you solve a Case"), Case of the Gateway Express (each creature deals 1 damage), Karlov Watchdog ("can't be turned face up"), No Witnesses ("each player who controls the most creatures"), Wojek Investigator ("opponents who have more cards in hand"), Tenth District Hero (collect evidence as an ability cost).
- **Tests:** 35 rules tests ("lot A — white").

## Sub-lot A2: blue cards ✅ (68 / 268)

- **Cards:** 31 (out of 36), including 4 Auras (Behind the Mask, Burden of Proof, Lost in the Maze, Out Cold…), disguise (Bubble Smuggler, Living Conundrum…), Cases (Case of the Filched Falcon, Case of the Ransacked Lab), Cold Case Cracker, Proft's Eidetic Memory.
- **Debt:** the `suspect` operation now serves several cards: its entry is removed.
- **Remaining:** Forensic Researcher (collect evidence as an ability cost), Surveillance Monitor ("you may collect evidence", "whenever you collect evidence"), Conspiracy Unraveler (alternative cost "collect evidence 10"), Cryptic Coat (cloak then attach the Equipment), Intrude on the Mind (revealed piles, cards put into the graveyard counted).
- **Tests:** 41 rules tests ("lot A — blue").

## Sub-lot A3: black cards ✅ (101 / 268)

- **Cards:** 33 (out of 35), including suspect (Barbed Servitor, Hunted Bonebrute, Repeat Offender…), disguise, Cases (Case of the Gorgon's Kiss, Case of the Stashed Skeleton), collect evidence (Extract a Confession, Leering Onlooker…), Massacre Girl, Known Killer, Outrageous Robbery.
- **Remaining:** Polygraph Orb (collect evidence as an ability cost), Vein Ripper (ward "sacrifice a creature").
- **Tests:** 42 rules tests ("lot A — black").

## Sub-lot A4: red cards ✅ (129 / 268)

- **Cards:** 28 (out of 35), including suspect (Convenient Target, Person of Interest, Reckless Detective…), Cases (Case of the Crimson Pulse), disguise, Krenko, Baron of Tin Street, Innocent Bystander (trigger condition on damage dealt, thanks to the lot A1 fix).
- **Remaining:** Case of the Burning Masks (distinct sources that dealt damage), Demand Answers ("discard a card or sacrifice an artifact"), Expose the Culprit ("with disguise", exile then cloak), Fugitive Codebreaker (reduced disguise cost), Goblin Maskmaker (cost reduction of face-down spells this turn), Incinerator of the Guilty and Lamplight Phoenix ("you may collect evidence").
- **Tests:** 34 rules tests ("lot A — red").

## Sub-lot A5: green cards ✅ (157 / 268)

- **Cards:** 28 (out of 35), including Cases (Case of the Locked Hothouse, Case of the Trampled Garden), disguise, cloak (Hide in Plain Sight), Glint Weaver and Case of the Trampled Garden ("one to three targets", thanks to the lot A1 fix), The Pride of Hull Clade; local 0/1 Plant and 0/0 Ooze tokens.
- **Debt:** the `putFaceDown` operation (cloak) enters `debt-baseline.json` as long as a single card uses it.
- **Remaining:** Airtight Alibi ("can't become suspected"), Axebane Ferox (ward "collect evidence 4"), Culvert Ambusher ("blocks if able"), Hedge Whisperer, A Killer Among Us (secret choice among three types), Sample Collector ("you may collect evidence"), Tunnel Tipster (face-down creature that entered this turn).
- **Tests:** 36 rules tests ("lot A — green").

## Sub-lot A6: multicolor, colorless and lands ✅ (217 / 268)

- **Cards:** 44 multicolor (out of 65: Agrus Kos, Alquist Proft, Teysa, Trostani, Ezrim, Kellan, Rakdos, Doppelgang, Lightning Helix, the split cards Cease // Desist, Fuss // Bother, Push // Pull…) and 16 colorless and lands (out of 18: Case of the Shattered Pact, Gravestone Strider, Thinking Cap — "Equip Detective {1}" written by hand —, the seven surveil lands, Public Thoroughfare, Scene of the Crime).
- **[rules]** A spell or ability with "X targets" (`countX`) is offered even without a target (X = 0); target options carry `countX`, the AI adjusts X to the number of targets and the interface asks for as many targets as the chosen X. `RULES_VERSION` = 34.
- **Remaining:** 21 multicolor (collect evidence outside spell costs: Evidence Examiner, Izoni, Kylox's Voltstrider, Urgent Necropsy; Aurelia, Buried in the Garden, Ill-Timed Explosion, Judith, Kaya, Lazav, Vannifar, Yarus, Etrata, Kylox, Niv-Mizzet, Officious Interrogation, Tin Street Gossip, Tolsimir, Hustle // Bustle, Treacherous Greed, Flotsam // Jetsam), Cryptex and Branch of Vitu-Ghazi.
- **Tests:** 56 rules tests ("lot A — multicolor") and 20 ("lot A — colorless and lands").

## Sub-lot B1: collect evidence (701.59) ✅ (229 / 268)

- **Cards:** Surveillance Monitor, Forensic Researcher, Sample Collector, Incinerator of the Guilty, Lamplight Phoenix, Evidence Examiner, Izoni, Center of the Web, Polygraph Orb, Vein Ripper, Tenth District Hero, Cryptex, Axebane Ferox.
- **The engine gains:**
  - collect evidence N as the cost of an activated ability (`activated({ collectEvidence })`) and of a mana ability (`manaAbility(…, { collectEvidence })`, Cryptex);
  - the optional effect `fx.mayCollectEvidence(N, { exclude }, …effects)` ("you may collect evidence N. If you do, …"; `exclude`: Lamplight Phoenix, exiled at the same time) and `fx.mayCollectEvidenceX(store, …)` (chosen X, Incinerator of the Guilty);
  - the event and trigger "whenever you collect evidence" (`when.collectEvidence`), also emitted by the additional cost of spells;
  - the wards "collect evidence N" and "sacrifice a creature" (read from the text; `ward.sacrificeFilter` replaces `sacrificeNonland`);
  - the automatic choice of evidence: the cheapest card that suffices, otherwise the most expensive (an expensive card is no longer wasted for a small N).
- **[rules] Fix (3-player fuzz):** "must be blocked if able" takes menace into account (509.1c): the requirement applies only if the defender can field enough blockers, and the default block puts in as many (a suspected creature that must be blocked). Test in `rulings.test.ts`.
- **[rules]** `RULES_VERSION` = 35.
- **Tests:** 8 rules tests ("lot B1") and 1 official ruling.

## Sub-lot B2: disguise ✅ (235 / 268)

- **Cards:** Aurelia's Vindicator, Fugitive Codebreaker, Goblin Maskmaker, Karlov Watchdog, Branch of Vitu-Ghazi, Tunnel Tipster.
- **The engine gains:**
  - a disguise cost with {X}: the special action "turn face up" pays X and remembers it (`amount.sourceX`, "up to X targets");
  - `disguiseReduction` ("this cost is reduced by {1} for each…"), applied to the disguise cost only;
  - the `playerStatic({ spellCost: { filter, reduce } })` family (the player's spells cost less, for example this turn with `fx.thisTurn`) and the `faceDown` filter on a spell cast face down;
  - `castLimit.faceUp`: "your opponents' permanents can't be turned face up during your turn";
  - a land card with disguise is cast face down; `fx.addManaChoice(…, keep)` (mana kept until end of turn);
  - `fx.exileUntilLeaves(ref, toHand)`: exile, graveyard cards included, returning to hand when the source leaves;
  - the turn log notes face-down entries (`faceDown`), as creatures with no type.
- **[rules]** `RULES_VERSION` = 36.
- **Debt:** `spellCost` enters `debt-baseline.json` as a generic family (cost reductions granted to a player, filtered).
- **Tests:** 6 rules tests ("lot B2").

## Sub-lot B3: cloak (701.58) ✅ (241 / 268)

- **Cards:** Cryptic Coat, Expose the Culprit, Yarus, Roar of the Old Gods, Etrata, Deadly Fugitive, Vannifar, Evolved Enigma, Lazav, Wearer of Faces.
- **The engine gains:**
  - `fx.cloak(ref, store)` and `fx.putFaceDown(ref, ward, { store, ownerControl })`: face-down creatures are remembered ("then attach this Equipment to it") and can return under their owner's control (Yarus);
  - the destination `{ to: "battlefield", as: "cloak" }` of a move ("cloak a card from your hand");
  - `fx.turnFaceUp(ref, store)`: an instant or sorcery card, which can't be turned face up, is exiled and remembered (Etrata then casts it for free);
  - the `disguise` filter ("with disguise"); `fx.chooseAmong(…, { anyNumber, anyZone })` (any number; cards outside the battlefield, like those exiled with Lazav).
- **Debt:** the `putFaceDown` operation serves several cards: its entry is removed.
- **Tests:** 6 rules tests ("lot B3").

## Sub-lot B4: suspect and Cases ✅ (245 / 268)

- **Cards:** Airtight Alibi, Case File Auditor, Case of the Gateway Express, Case of the Burning Masks.
- **The engine gains:**
  - the restriction keyword `cantBeSuspected` ("can't become suspected"), read by `fx.suspect` (justified entry in `debt-baseline.json`);
  - the event and trigger "whenever you solve a Case" (`when.caseSolved`);
  - `spellCost.anyMana`: "you may spend mana as though it were mana of any color to cast [filter] spells";
  - `fx.eachDealsDamage(filter, target, amount)`: each creature deals that much damage (instead of its power);
  - the turn log notes the source of the damage (`sourceKey`); `distinctSources` counts the different sources ("three or more sources you controlled dealt damage this turn").
- **Interface:** "Suspected" badge checked by a one-off Playwright script (capture `test-results/mkm/suspect.png`).
- **Tests:** 4 rules tests ("lot B4").

## Sub-lot C1: block requirements (509.1c) ✅ (248 / 268)

- **Cards:** Culvert Ambusher, Tolsimir, Midnight's Light (legendary token Voja Fenstalker), Hustle // Bustle.
- **The engine gains:** the block requirements of the `BlockRule` family: `mustBlock` ("blocks this turn if able") and `mustBlockAttacker` ("blocks this Wolf if able"; `mustBlockEventObject` in a script, fixed on resolution); the declaration of blockers checks them (blocking another attacker doesn't satisfy a requirement about a specific attacker) and the default block (`requiredBlocks`) respects them.
- **Tests:** 3 rules tests ("lot C1").

## Sub-lot C2: amounts and costs ✅ (258 / 268)

- **Cards:** No Witnesses, Wojek Investigator, Ill-Timed Explosion, Officious Interrogation, Demand Answers, Treacherous Greed, Urgent Necropsy, Niv-Mizzet, Guildpact, Aurelia, the Law Above, Tin Street Gossip.
- **The engine gains:**
  - `ref.playersWithMost(filter)` ("each player who controls the most creatures");
  - the amounts `opponentsWithMoreInHand`, `greatestManaValueOf(ref)` and `colorPairsAmong(filter)`;
  - `costPerExtraTarget` ("costs {W}{U} more for each target beyond the first");
  - filtered `discardOr.sacrifice` ("discard a card or sacrifice an artifact");
  - `collectEvidenceTargetsManaValue` ("collect evidence X, where X is the total mana value of the targeted permanents");
  - the `dealtDamageThisTurn` filter ("a creature that dealt damage this turn");
  - `when.attackWith(N, filter, anyPlayer)` ("whenever a player attacks with N or more creatures").
- **Fix:** Troyan, Gutsy Explorer (WOE): its mana also serves spells with {X} in their cost (`hasX` filter); the approximation is removed.
- **Tests:** 10 rules tests ("lot C2").

## Sub-lot C3: last unique cards ✅ (268 / 268)

- **Cards:** Conspiracy Unraveler, Intrude on the Mind, Hedge Whisperer, A Killer Among Us, Kylox's Voltstrider, Judith, Carnage Connoisseur, Kaya, Spirits' Justice, Kylox, Visionary Inventor, Flotsam // Jetsam, Buried in the Garden.
- **The engine gains:**
  - `altCostAll` accepts an evidence cost ("collect evidence 10 rather than pay the mana cost of your spells"); Leyline of Mutation (DSK) moves to the `{ mana }` form;
  - `linkEvidence`: the cards exiled for a "collect evidence" cost are linked to the source ("among the cards exiled with it");
  - `castNow` / `grantPlay`: `bottomAfter` ("if it would go to the graveyard, put it on the bottom of the library instead"); the spell leaving the stack (resolved, countered or without target) goes through a single path (`spellToRest`);
  - `fx.piles`: revealed piles and cards put into the graveyard kept (`storeGraveyard`);
  - effects "for as long as [the source] remains tapped" (`fx.modifyWhileTapped`) and the restriction keyword `mayNotUntap` ("you may choose not to untap it"; justified entry in `debt-baseline.json`);
  - choice restricted to a list and secret choice (`fx.chooseForSelf(kind, { options, secret })`), hidden from the other players in their view;
  - `ref.graveyardOf(players)` and the amount `totalPowerOf(ref)` (total power, last known information after sacrifice);
  - trigger "leaves [a zone other than the battlefield]" (`from`), with the new card as the event's object when it is exiled;
  - `extraMana: "any"` ("one additional mana of any color that land produced").
- **Fix:** `cond.refMatches` resolves the filter (chosen types, "of that type") like the other filters.
- **Rules version:** 37.
- **Tests:** 10 rules tests ("lot C3").

## Legal promotions in Standard ✅ (271 / 271, 2026-10-03, PLAN-C C19)

The weekly comparison with Scryfall (`tools/check-legality.ts`) found three Standard-legal cards missing from the data: they exist only as MKM promotional printings, which the import discarded. The import now keeps a promo when it is the card's only printing in the set.

- **Melek, Reforged Researcher:** P/T equal to twice the instants and sorceries in the graveyard (`amount.plus`); the first instant or sorcery each turn costs {3} less (turn log).
- **Tomik, Wielder of Law:** affinity for planeswalkers (generic cost reduction per planeswalker); "an opponent who attacks you or planeswalkers you control with two or more creatures" (`when.opponentAttacksYouWith`, `defending: "you"` field of the `attackWith` trigger).
- **Voja, Jaws of the Conclave:** counters per Elf on each of your creatures, one card per Wolf.

Three rules tests in `engine/test/mkm.test.ts`.

## PLAN-M M7 (rules 198)

- **Suspect** (701.60c): `GameObject.suspected` holds the timestamp at which the permanent became suspected; menace and "can't block" are a layer 6 entry with that timestamp (like ability counters), so a later "loses all abilities" removes them (it stays suspected) and an earlier one does not.
- **Tests:** `mkm.test.ts` (+1).

## PLAN-M M8a (rules 199)

- **Break Out:** the creature card is chosen with `chooseAmong` among the top six and goes straight from the library (battlefield or hand); the rest on the bottom in a random order. 1 test added.
- **Rakdos, Patron of Chaos:** the sacrifice is offered only to an opponent who controls two nonland, nontoken permanents (otherwise you draw). 1 test added.

## PLAN-M M8b (rules 200)

- **Karlov Watchdog:** "permanents your opponents control can't be turned face up during your turn" is the restriction `cantBeTurnedFaceUp` granted to your opponents' face-down permanents during your turn (the `CastLimit.faceUp` flag is gone); an effect can no longer turn them face up either. Test extended.

## PLAN-M M10a (rules 203)

- **Archdruid's Charm, Flourishing Bloom-Kin:** the search holds the cards found in the library (`fx.searchHold`, revealed), then routes them: the land onto the battlefield tapped, a creature into the hand (Archdruid's Charm); the player chooses which Forest enters tapped, the other goes into the hand (Bloom-Kin; a single Forest found enters); then shuffle. Nothing goes through the hand any more. Test added (Bloom-Kin) and extended (Archdruid's Charm).
- **Agency Outfitter:** one search over the graveyard, the hand and the library (`search.alsoFrom`), up to one card of each name (`search.each`, one filter per card); the library is shuffled (and the search event emitted) only if a card comes from it or nothing is found. Test added.
- **Worldsoul's Rage:** the up to X land cards are chosen among the hand and the graveyard together (`pickFromZone` over `ref.union` of the two zones). Test rewritten.

## PLAN-M M10b (rules 204)

- **A Killer Among Us:** the secret type is known only to the player who chose it (`chosen.secret` holds that player): the view hides it from everyone else, whoever controls the enchantment, and so does the AI's state (`forgetSecrets`). "Reveal the creature type you chose" is a cost (`revealChosen`): only that player can activate the ability (ruling: another controller can't), and paying it shows the type to everyone (`chose` event). Test added.

## PLAN-M M10d (rules 206)

- **Innocent Bystander:** "is dealt 3 or more damage" (ruling: "all at once") adds up the damage of several sources at the same time (`batched: "sum"`). Test added (two blockers, 2 + 1).
