# Standard meta (plan P4, phase 1)

Cards from the most played Standard decks, across all sets, before the complete set-by-set coverage (PLAN-P4, condensed in `docs/history.md`). The decks surveyed are in `docs/meta/2026-09-29/`. Each lot makes a few archetypes playable, main deck **and** sideboard (BO3 needs it).

Checking a lot: `npm run verify -- --set META`. The targeted fuzz then plays the already playable meta decks against each other (`npm run fuzz -- --pool meta`), and the test `cards/test/meta-decks.test.ts` checks that the decks of the finished lots are legal and playable.

Scripts go in their set's folder (`packages/cards/src/<ext>/cards.ts`, one file per set while it is partial). They will be split by color once the set is fully covered.

## Lot M1 — Izzet Spellementals and Mono-Green Landfall (28.9% of the meta)

22 cards: 17 from the main decks, 5 from the sideboards. Rules tests in `engine/test/meta.test.ts`.

### Engine

- **Harmonize** (702.180, Tarkir: Dragonstorm):
  - read from the text (`scryfall.ts`): the harmonize cost is stored in `CardDef.flashback`, with `CardDef.harmonize`. The card is therefore cast from the graveyard like a flashback, then exiled;
  - you may tap an untapped creature you control to reduce the generic part by its power: `CastChoices.tap` (at most one creature), offered by `additional.tap` of the cast option (`harmonizeOptions`, `stack.ts`);
  - without `tap` in the decision (AI, autopilot), the default choice applies: the smallest power that covers all the generic cost, otherwise the largest; `tap: []` taps nothing;
  - `legalActions` counts the possible reduction to know whether the spell is payable.
- **Bargain** (702.166, Wilds of Eldraine): read from the Scryfall keywords, it is a {0} kicker "sacrifice an artifact, an enchantment or a token" (`kickerKind: "bargain"`, question "Bargain").
- **Kicker with no mana, chosen by the player** (Bargain, and the Final Fantasy kickers): the cast option gives the possible permanents (`kickerPermanents`, the default choice first), and the decision designates the permanent by `sacrifice`. The interface asks which one if there is more than one possibility; with no choice, the cheapest (token first).
- **Behold** (701.63): the condition `cond.behold(filter)` replaces `beholdJace` (which becomes a special case): a matching permanent you control, or a matching card in your hand.
- **Earthbend** (Avatar): `fx.earthbend(ref, n)`. The land becomes a 0/0 creature with haste (still a land), gets N +1/+1 counters and the ability "when it dies or is exiled, return it to the battlefield tapped".
- **Player effect until end of turn:** `fx.thisTurn({ … })`, the `playerEffect` effect. For example `damageUnpreventable`: "damage can't be prevented this turn".
- **"One or two targets":** `target.between(1, 2, spec)` (`TargetSpec.minCount`, `TargetOption.min`).
- **"Becomes the target" trigger extended to spells:** `when.targetedByOpponent(filter, true)` ("a creature or creature spell you control", Surrak).
- **`adventure` filter** (cards outside the battlefield): "card with an Adventure" (Hearth Elemental).
- **Tools:**
  - `tools/meta-decks.ts` reads the meta decks;
  - `fuzz --pool meta` plays the playable meta decks;
  - `verify --set META` checks a meta lot; `--ci` and `--full` each have a meta fuzz;
  - the interface sandbox (dev mode) accepts cards in the graveyard (`graveyard`).

### Cards, by set

- **Secrets of Strixhaven (SOS):**
  - Great Hall of the Biblioplex: mana restricted to instants and sorceries; becomes a 2/4 Wizard creature;
  - Impractical Joke;
  - Prismari Charm;
  - Traumatic Critique.
- **Lorwyn Eclipsed (ECL):**
  - Steam Vents (shock land, read from the text);
  - Spell Snare;
  - Sunderflock: cost reduced by the greatest mana value among your Elementals;
  - Sear;
  - Sapling Nursery: affinity for Forests, 3/4 Treefolk token with reach (`ecl/common.ts`).
- **Avatar: The Last Airbender (TLA):**
  - Ba Sing Se;
  - Earthbender Ascension.
- **Wilds of Eldraine (WOE):**
  - Sleight of Hand;
  - Hearth Elemental // Stoke Genius (adventure);
  - Torch the Tower (Bargain).
- **Tarkir: Dragonstorm (TDM):**
  - Winternight Stories (Harmonize);
  - Surrak, Elusive Hunter.
- **The Hobbit (HOB):** Elven Passage (behold an Elf).
- **Teenage Mutant Ninja Turtles (TMT):**
  - Escape Tunnel;
  - Leatherhead, Swamp Stalker: hexproof counter.
- **Murders at Karlov Manor (MKM):** Thundering Falls, surveil land; the `surveilLand` model also serves the other lands of this cycle.
- **Marvel's Spider-Man (SPM):**
  - Hydro-Man, Fluid Felon: becomes a land until your next turn;
  - Sandman, Shifting Scoundrel: returns from the graveyard with a land card.

## Lot M2 — Dimir Midrange and Jund Sacrifice (cumulative 43.7% of the meta)

23 cards: 15 from the main decks, 8 from the sideboards. Tests in `engine/test/meta.test.ts` ("lot M2").

### Engine

- **Optional blight as an additional cost** ("you may blight N", Lorwyn Eclipsed): read from the text, it is a {0} kicker that puts N -1/-1 counters on a creature you control (`kickerCost.blight`, `kickerKind: "blight"`). The creature is chosen like the Bargain permanent (`CastChoices.sacrifice`, `kickerPermanents`). "If the additional cost was paid": `cond.kicked`.
- **Teamwork N** (Marvel Super Heroes): read from the text, it is a {0} kicker "tap creatures with total power N or greater" (`kickerCost.tapPower`). The cast option gives `kickerTap` (like crew), the decision designates the creatures by `tap`; without `tap`, the weakest sufficient ones.
- **Amass** (701.47): `fx.amass(player, subtype, N)`, with a black 0/0 Army created if needed, which also becomes of that subtype.
- **Triggers:**
  - `when.search("opponent")`: "whenever an opponent searches their library" (`search` event, emitted by the search effect);
  - `when.leaves(filter)`: "whenever a [creature you control with a +1/+1 counter] leaves the battlefield";
  - `when.sacrifice(filter, false, true)`: sacrificed by an opponent.
- **`activatedReduction` static** (`playerStatic`): activated abilities of your permanents matching the filter cost {N} less (Mutagen Man: artifact tokens).
- **`damageHealsFirst` restriction** (Wolverine): new damage first heals the previous damage.
- **"MV X or less"** for mass effects (`modifyAll`, `destroyAll`): comparison `cmp.manaValue("<=", amount.x)`, with the spell's X.
- **Mutagen token** (`tmt/common.ts`).

### Cards, by set

- **Avatar: The Last Airbender (TLA):** Callous Inspector, Deadly Precision, Obsessive Pursuit, Wan Shi Tong, Librarian; in the sideboard, Day of Black Sun and Raven Eagle.
- **Marvel Super Heroes (MSH), new set started:** Hidden Lair, The Wondrous Wasp, We Say Thee Nay!, Wolverine, Fierce Fighter.
- **Lorwyn Eclipsed (ECL):** Blood Crypt and Overgrown Tomb (shock lands), Requiting Hex (blight 1).
- **The Hobbit (HOB):** Azog, Moria's Ruin (amass Goblins); The Sackville-Bagginses.
- **Teenage Mutant Ninja Turtles (TMT):** Dream Beavers, Mutagen Man, Living Ooze; in the sideboard, The Ooze.
- **Secrets of Strixhaven (SOS), sideboard:** Professor Dellian Fel, Witherbloom Charm.
- **Wilds of Eldraine (WOE), sideboard:** Disdainful Stroke.
- **Tarkir: Dragonstorm (TDM), sideboard:** Strategic Betrayal.
- **Murders at Karlov Manor (MKM), sideboard:** Vengeful Tracker.

## Lot M3 — Dimir Excruciator, Azorius Control and Selesnya Landfall (cumulative 53.2% of the meta)

15 cards: 12 from the main decks, 3 from the sideboards (Day of Black Sun and Strategic Betrayal were done in lot M2). Tests in `engine/test/meta.test.ts` ("lot M3").

### Engine

- **Evoke** (702.74): read from the text; alternative cost (`altCost`, "Evoke — …") and the ability "when it enters, if it was evoked, sacrifice it" (`cond.evoked`).
- **Mana spent by type:** payment returns it (`payMana`, argument `spent`); it is kept on the spell and the permanent (`spentColors`), and read by `cond.spent("U", 2)` ("if {U}{U} was spent to cast it"). Enters conditions see it: it goes through the enters context, like evoke.
- **Mobilize N** (702.181, Tarkir: Dragonstorm): read from the text; N tapped and attacking red 1/1 Warriors, sacrificed at the beginning of the next end step.
- **Power-up** (Marvel Super Heroes): `activated({ powerUp: true })`, only once; the cost is reduced by the source's mana cost if it entered this turn (`abilityMana`).
- **Collect evidence N** as an optional additional cost ("you may collect evidence N"): read from the text ({0} kicker, `kickerCost.collectEvidence`); the graveyard cards are chosen automatically (most expensive first).
- **`fx.exileNamesakes`** (Deadly Cover-Up): a card from an opponent's graveyard and its namesakes (graveyard, hand, library); that player draws as many cards as were exiled from their hand.
- **Chosen land card name** (Petrified Hamlet): `fx.chooseForSelf("landName")` (enters triggered ability), `nameChosen` filter; the non-mana abilities of sources with the chosen name are blocked, as with Sorcerous Spyglass (`chosenNameAbilities: "forbid"`, PLAN-H H9).
- **Copy of a creature card from a graveyard on entering** (Superior Spider-Man, Mind Swap): `entersAsCopyOfGraveyard` (name, P/T) with `entersAsCopyAddSubtypes`; the copied card is exiled.

### Cards, by set

- **Secrets of Strixhaven (SOS):** Emeritus of Ideation (prepared, spell Ancestral Recall), Erode, Petrified Hamlet.
- **Lorwyn Eclipsed (ECL):** Hallowed Fountain and Temple Garden (shock lands), Deceit (evoke, mana spent).
- **Murders at Karlov Manor (MKM):** Meticulous Archive, No More Lies, Deadly Cover-Up (collect evidence 6).
- **Avatar: The Last Airbender (TLA):** Shared Roots.
- **Marvel Super Heroes (MSH):** M.O.D.O.K.; in the sideboard, Captain Marvel, Earth's Protector (power-up).
- **Marvel's Spider-Man (SPM):** Superior Spider-Man.
- **Tarkir: Dragonstorm (TDM), sideboard:** Voice of Victory (mobilize 2), Qarsi Revenant (Renew).

## Lot M4 — 4c Control, Boros Dragons and Jeskai Artifacts (cumulative 67.1% of the meta)

23 cards: 22 from the main decks, 1 from a sideboard. Tests in `engine/test/meta.test.ts` ("lot M4").

### Engine

- **Basic land type chosen when playing a land** (Multiversal Passage): `asEnters: [fx.chooseForSelf("landType")]`; `legalActions` offers one `playLand` option per type (`landType`, also for paying or not the 2 life), and the static `addChosen: "landType"` gives it that type (hence its mana). The shock land "Then you may pay 2 life" is read from the text.
- **Harness** (Marvel Super Heroes): `fx.harness` and `cond.harnessed` for the ∞ abilities.
- **Converge:** `amount.colorsSpent`, the colors of mana spent to cast the spell.
- **Firebending N** (Avatar): read from the text; "whenever this creature attacks, add N {R}".
- Tokens: 1/1 Monk with prowess (`tdm/common.ts`), Doombot (`msh/common.ts`), 4/4 Dragon with firebending 4 (`tla/common.ts`).

### Cards, by set

- **Tarkir: Dragonstorm (TDM):** Clarion Conqueror, Dispelling Exhale, Inevitable Defeat, Jeskai Revelation, Maelstrom of the Spirit Dragon, Magmatic Hellkite, Mistrise Village, Sarkhan, Dragon Ascendant, Twinmaw Stormbrood // Charring Bite (omen), United Battlefront.
- **Secrets of Strixhaven (SOS):** Flashback, Sundown Pass, Tablet of Discovery, Together as One (converge).
- **Marvel Super Heroes (MSH):** Castle Doom, The Mind Stone (harness), Thor, God of Thunder.
- **Wilds of Eldraine (WOE):** Candy Trail. **Lorwyn Eclipsed (ECL):** Firdoch Core. **The Hobbit (HOB):** Smaug the Magnificent.
- **Avatar: The Last Airbender (TLA):** Momo, Friendly Flier; in the sideboard, The Legend of Roku // Avatar Roku (Saga that transforms, firebending 4).
- **Marvel's Spider-Man (SPM):** Multiversal Passage.

## Lot M5 — Boros Dwarves, Lifegain, Mardu Discard and Boros Tokens (cumulative 79.8% of the meta)

34 cards: 31 from the main decks, 3 from the sideboards. Tests in `engine/test/meta.test.ts` ("lot M5").

### Engine

- **Storied / enduring story** (The Hobbit): read from the text (`CardDef.storied`); a state-based action gives the controller of such a permanent, if they control three or more artifacts, legendaries and/or Sagas, a permanent player effect `enduringStory` (`cond.enduringStory`).
- **Sneak** (Ninja Turtles): read from the text; alternative cost possible during the declare blockers step (`cond.sneakWindow`), which returns your weakest unblocked attacker to hand; `cond.sneaked` on resolution.
- **Mayhem** (Spider-Man): read from the text; a card discarded this turn (`GameObject.discardedTurn`) is cast from the graveyard for its mayhem cost.
- **Paradigm** (Strixhaven): read from the text; the spell is exiled and an emblem (linked to the card) offers to cast a free copy of it at the beginning of each of your first main phases.
- **Equip:** "Equip worthy" (red and/or white legendary non-Villain creature) and "{1} less for each color of the target creature" read from the text; equip abilities are marked (`equip`) and logged (`activate` in the turn log); Kíli: the first one each turn costs {0} (`firstEquipFree`).
- **Mode reserved for the paid cost** ("if the additional cost was paid, choose both"): a mode with `condition: cond.kicked` requires the kicker in the decision (`ModeOption.requiresKicker`; the interface and the AI pay it).
- **Linked reflexive ability:** `fx.reflexive(targets, effects, { c: ref.target("c") })` re-reads an object from the original ability.
- **Player effects:** `fx.thisTurn(ability, players)` for other players (`cantCastSpells`); `castCreaturesFromGraveyard`.
- **Hexproof from monocolored** (`hexproofFromMonocolored`).
- The Oracle ↔ script audit counts the abilities of a solved Case.

### Cards, by set

- **The Hobbit (HOB):** Belladonna Took, Bofur, Reliable Guardian // Concerted Care, Dwarven Mauler, Dáin's Company, Kíli the Resourceful, The Lonely Mountain, Thorin Oakenshield, Thorin, Mountain-king; in the sideboard, Bilbo's Gambit.
- **Tarkir: Dragonstorm (TDM):** Dalkovan Encampment, Dragonfire Blade, Frontline Rush, Stadium Headliner (mobilize 1), Tersa Lightshatter.
- **Teenage Mutant Ninja Turtles (TMT):** Casey Jones, Vigilante, Cool but Rude (Class), Skateboard, The Last Ronin's Technique (sneak).
- **Secrets of Strixhaven (SOS):** Hardened Academic, Moseo, Vein's New Dean (infusion), Practiced Offense, Shattered Sanctum; in the sideboard, Decorum Dissertation (paradigm).
- **Lorwyn Eclipsed (ECL):** Emptiness (evoke), Iron-Shield Elf, Moonshadow; in the sideboard, Pyrrhic Strike (blight 2, both modes).
- **Marvel's Spider-Man (SPM):** Aunt May, Carnage, Crimson Chaos (mayhem).
- **Murders at Karlov Manor (MKM):** Case of the Uneaten Feast (Case), Warleader's Call.
- **Marvel Super Heroes (MSH):** Mjölnir, Hammer of Thor (equip worthy), Political Triumph.
- **Wilds of Eldraine (WOE):** Song of Totentanz (Torch the Tower was in lot M1).

## Lot M6 — Izzet Aggro, Mono-Black Aggro, Azorius Momo, Golgari Midrange, Bant Airbending Combo, Jeskai Control (cumulative 88.1% of the meta)

47 cards: 42 from the main decks, 5 from the sideboards. The twenty archetypes surveyed are playable: phase 1 of plan P4 is finished. Tests in `engine/test/meta.test.ts` ("lot M6").

### Engine

- **Airbend** (Avatar): `fx.airbend(ref)` exiles the permanent or spell (`exileSpell`, without countering it); its owner may cast it from exile for {2} (`cost` permission, `CastTerms.costOverride`). "Whenever you cast a spell from exile": `castSpell` with `fromExile`.
- **Web-slinging** (Spider-Man): read from the text; alternative cost that returns a tapped creature you control to hand (the cheapest).
- **"Pay X life" as an additional cost** (Vicious Rivalry): read from the text (`payLifeX`); the spell's X is paid in life.
- **Chosen parity** (Gollum): `asEnters: [fx.chooseForSelf("parity")]`, `parityChosen` filter.
- **Skipped turns** (Ral Zarek): `skipTurn` player effect, one per skipped turn (`fx.playerEffectTimes`), consumed at the beginning of the turn.
- **Player effects until your next turn:** `fx.untilYourNextTurn` (Avatar's Wrath: `castOnlyFromHand`).
- **Miscellaneous:** `ref.except` reference ("all other creatures"); `noCounters` filter; "triggered ability" target (`stackItems.triggeredOnly`); `lookAtTop` with a maximum total mana value (`maxTotalManaValue`); `when.dealtDamage(filter)` trigger; "instead of the graveyard" replacement that creates a token (`graveyardReplacement.createToken`); `fx.exileWithNamesakes(target)` (The End); mana ability that taps a creature (`tapAnother: "creature"`); `cantBeBlockedByNonSpirits` restriction; a modal double-faced card can transform (Jennifer Walters).
- Tokens: Ally and Spirit (`tla/common.ts`), Wolf (`hob/common.ts`).

### Cards, by set

- **Avatar: The Last Airbender (TLA):** Aang, Swift Savior // Aang and La, Ocean's Fury, Aang, at the Crossroads // Aang, Destined Savior, Abandon Attachments, Abandoned Air Temple, Accumulate Wisdom, Airbender Ascension, Appa, Steadfast Guardian, Combustion Technique, Firebending Lesson, Heartless Act, Iroh's Demonstration, It'll Quench Ya!, Price of Freedom, Realm of Koh; in the sideboard, Avatar's Wrath.
- **Secrets of Strixhaven (SOS):** Colorstorm Stallion (Opus), Daydream, Deathcap Glade, Dissection Practice, Stormcarved Coast, Vibrant Outburst; in the sideboard, Ral Zarek, Guest Lecturer, Vicious Rivalry.
- **Wilds of Eldraine (WOE):** Bramble Familiar // Fetch Quest, Mosswood Dreadknight // Dread Whispers, Restless Cottage, Scalding Viper // Steam Clean, The End.
- **The Hobbit (HOB):** Chief Warg's Company, Desolation Prowler, Gollum, Riddle Master, Head of the Hunt, Nighthowl Pursuer.
- **Marvel Super Heroes (MSH):** Avengers Disassembled, Doctor Doom, Gleaming Bastion, Jennifer Walters // The Sensational She-Hulk.
- **Tarkir: Dragonstorm (TDM):** Channeled Dragonfire (harmonize), Sage of the Skies; in the sideboard, Heritage Reclamation.
- **Marvel's Spider-Man (SPM):** Interdimensional Web Watch, Spider Manifestation; in the sideboard, Spider-Sense (web-slinging).
- **Murders at Karlov Manor (MKM):** Steamcore Scholar, Underground Mortuary. **Teenage Mutant Ninja Turtles (TMT):** Michelangelo's Technique (sneak). **Lorwyn Eclipsed (ECL):** Springleaf Drum.

## PLAN-M M8b (rules 200)

- **Teamwork:** the creatures tapped for teamwork count their power, without a pilot's crew bonus (`crewPower(…, "teamwork")`, `CrewUse`). Test added (We Say Thee Nay! and a 1/1 pilot).
- **Interdimensional Web Watch:** see `spm.md`.
