# Commander: EDH pseudo-set (PLAN-E)

Cards of the Commander decks that are absent from the app's sets and reprints, imported by name from the decklists in
`docs/commander/decks/` (`npm run import-cards -- edh`, then `npm run import-printings`). Each card keeps the printing
chosen by the import (`CardDef.origin`: set of origin, `number`: its number) and the color identity given by Scryfall
(data only, compared with the identity computed by the engine). Outside Standard. Plan: PLAN-E, see `docs/history.md`.

The scripts are in `packages/cards/src/edh/`; the rules tests in `packages/engine/test/edh.test.ts`; the smoke test in
`packages/ai/test/smoke/edh.test.ts`. Coverage per deck: `npm run coverage -- --deck <id|all> [--text]`.

| Deck | Commander | EDH cards |
|---|---|---|
| `edgar-markov` | Edgar Markov (Mardu, vampires) | 61 to do on 2026-10-06 |
| `yshtola` | Y'shtola, Night's Blessed (Esper, drain and control) | 66 to do (10 in common with Edgar) |
| `ur-dragon` | The Ur-Dragon (Dragons, five colors) | 51 |
| `rakdos` | Rakdos, Lord of Riots (big free spells) | 57 |
| `multiverse-reforged` | Jace, Multiverse Architect (official Reality Fracture precon) | 57 |
| `turtle-power` | Heroes in a Half Shell (official Teenage Mutant Ninja Turtles precon) | 68 |
| `counter-blitz` | Tidus, Yuna's Guardian (official Final Fantasy X precon) | 67 |
| `fantastic-four` | Invisible Woman (official Fantastic Four precon) | 47 (6 in common with Counter Blitz) |
| `mutant-menace` | The Wise Mothman (official Fallout precon) | 57 (3 in common with Counter Blitz) |
| `nissa` | Nissa, Leyline Tamer (landfall, four colors without green; deck removed 2026-10-09, cards kept) | 34 |
| `vision` | The Vision (colorless artifacts, Urza lands, Eldrazi) | 63 |
| `dark-leo` | Dark Leo & Shredder (Ninjas, white and black) | 27 |
| `ur-sphinx` | The Ur-Sphinx (Sphinxes, Esper) | 28 |
| `vivi` | Vivi Ornitier (cEDH storm, blue and red) | 39 |
| `sephiroth` | Sephiroth, Fabled SOLDIER (aristocrats, mono-black) | 31 |
| `mario-luigi` | Bruse Tarl and Reyhan, partners (+1/+1 counters, four colors) | 38 |
| `tevesh-jeska` | Tevesh Szat and Jeska, partners (Demons and reanimation, black and red) | 36 |
| `deadpool` | Deadpool, Trading Card (exchanged text boxes, copies and chaos, black and red) | 38 |

## E0 — import ✅

117 cards, from 36 sets (mostly Commander: FRC, LCC, MSC, FIC, FDC, CMM...). None is scripted yet; the cards made only
of keywords are already playable (Vampire of the Dire Moon...).

## E6 — mechanics that mention the commander ✅ (14 / 117)

| Mechanic | Form | Cards |
|---|---|---|
| Mana of the commander's color identity (903.4, nothing without a commander) | `manaAbility(…, { commanderIdentity: true })` (`ManaAbilityDef.produceIdentity`) | Command Tower, Arcane Signet, Path of Ancestry |
| Mana of an opponent's lands | `likeLands: { controller: "opponent" }` (the filter names the controller; among `produce`) | Exotic Orchard, Fellwar Stone |
| "If you control a commander, you may cast this without paying its mana cost" | `altCost` `{0}` with `cond.controls({ commander: true })` (`ObjectFilter.commander`, `LkiSnapshot.commander`) | Fierce Guardianship, Deadly Rollick, Flawless Maneuver |
| "Enters tapped unless you have two or more opponents" | `entersWith` with `amount.refCount(ref.eachOpponent)` | Luxury Suite, Vault of Champions, Morphic Pool, Sea of Clouds |
| Eminence (113.6) | `triggered(…, { fromCommand: true })`: the ability also works from the command zone (`commandZoneAbilities`, `detectTriggers`) | Edgar Markov |

- **Tests:** `engine/test/edh.test.ts` (11).
- **Approximation:** Path of Ancestry (scry 1 not done); lifted after the bilan (rules 142): "when that mana is spent to cast [a matching spell], [effects]" (`rider.effects`, triggered ability of the source) and "that shares a creature type with your commander" (`sharesCreatureTypeWith: ref.commanders()`, the `commanders` reference: the commanders of the designated players, wherever they are); 4 tests in `edh.test.ts`.
- **Debt:** `fromCommand` specific to Edgar Markov for now (family of eminence commanders); ObjectFilter ceiling 86 → 87.

## E8 — mana base ✅ (44 / 117)

**Cards (30, `edh/lands.ts`):** pain lands and talismans (Adarkar Wastes, Caves of Koilos, Underground River, Talisman of Dominance, Hierarchy, Progress), check lands (Dragonskull Summit, Drowned Catacomb, Glacial Fortress, Isolated Chapel), "two basic lands" (Prairie Stream, Sunken Hollow), tri-lands (Savai Triome, Raffine's Tower, Arcane Sanctum), fetch lands (Bloodstained Mire, Flooded Strand, Polluted Delta), Bojuka Bog, Otawara, Soaring City (channel), Phyrexian Tower, Sunken Ruins, Unclaimed Territory, Urborg, Tomb of Yawgmoth, Voldaren Estate (Blood token, discard as a cost), Reliquary Tower, Thought Vessel, Decanter of Endless Water, Sol Ring, Relic of Legends.

- **Engine:** `tapAnother` of a mana ability accepts an `ObjectFilter` (Relic of Legends: an untapped legendary creature), read by `otherToTap` and the payment solver.
- **Tests:** `engine/test/edh-mana.test.ts` (17).
- **Approximations:** Relic of Legends (tapped creature chosen by the engine); Phyrexian Tower and Sunken Ruins are activated by hand.
- Done by an agent in an isolated copy, integrated by cherry-pick.

## E10 — Edgar Markov: vampires ✅ (75 / 117)

**Cards (31, `edh/edgar.ts`):** Blood Artist, Bloodline Keeper, Captivating Vampire, Champion of Dusk, Charismatic Conqueror, Clavileño, Cordial Vampire, Cruel Celebrant, Drana, Edgar, Charmed Groom, Elenda, Forerunner of the Legion, Indulgent Aristocrat, Knight of the Ebon Legion, Legion Lieutenant, Malakir Bloodwitch, Markov Baron, Master of Dark Rites, Mavren Fein, Sanctum Seeker, Stromkirk Captain, Twilight Prophet, Vampire Socialite, Viscera Seer, Vito, Welcoming Vampire, Yahenni, New Blood, Olivia's Wrath, Pact of the Serpent, Sorin, Imperious Bloodlord; tokens `VAMPIRE_FLYING`, `VAMPIRE_WB_LIFELINK`.

- **Engine:** ascend (keyword read from the text, `PlayerState.citysBlessing` acquired by a state-based action, `cond.citysBlessing`; shown in the interface by an icon in the corner of the player's battlefield, with a tooltip: `PlayerView.citysBlessing`, `CitysBlessing` in `Board.tsx`); the condition of an `entersWith({ affects, condition })` is checked from the point of view of the source's controller.
- **Existing forms reused:** `tapOthers` (Captivating Vampire), additional `tap` cost (New Blood), `fx.chooseForSelf("creatureType")` (Pact of the Serpent), restricted `addManaChoice` (Master of Dark Rites), `fx.mayForStore` put to the opposing controller (Charismatic Conqueror).
- **Tests:** `engine/test/edh-edgar.test.ts` (38).
- **Approximations:** New Blood (no text change), ascend of a permanent only.
- **Debt:** PlayerState 22 → 23, Condition 52 → 53; `perPlayer` is no longer specific to one card.

## E12 — Y'shtola: drain and control ✅ (94 / 117)

**Cards (19, `edh/yshtola.ts`):** Y'shtola, Night's Blessed, Emet-Selch of the Third Seat, Esper Sentinel, Kambal, Lotho, Lyse Hext, Orcish Bowmasters, Papalymo Totolymo, Sheoldred, the Apocalypse, Tataru Taru, Irenicus's Vile Duplication, Quantum Misalignment, Mindcrank, Bloodchief Ascension, Helm of the Ghastlord, Mystic Remora, Ophidian Eye, Propaganda, Teferi, Time Raveler.

- **Engine:** cumulative upkeep (702.24, read from the text: age counter, then the cost paid once per counter, `unlessPay.times`, `cumulativeUpkeepAbility`); printed rebound (keyword `rebound`); draw "except the first one in each of their draw steps" (`turnDraw` of the event, `when.drawExceptTurnDraw`); zone change "an opponent's" (`whose: "opponent"`).
- **Tests:** `engine/test/edh-yshtola.test.ts` (31), including the Mindcrank + Bloodchief Ascension loop until defeat.
- **Approximations:** Propaganda (also taxes planeswalkers), Orcish Bowmasters (draw step).
- **Debt:** Effect (fields) 635, TriggerSpec (fields) 160; `perPlayer` and `sorceryTiming` are no longer specific to one card.

## E9 — common spells and engines ✅ (117 / 117)

**Cards (23, `edh/staples.ts`):** Teferi's Protection, The One Ring, Demonic Tutor, Enlightened Tutor, Force of Negation, Snuff Out, Vindicate, Toxic Deluge, Farewell, Damn, Rewind, Unwind, Frantic Search, Sink into Stupor // Soporific Springs, Village Rites, Black Market Connections, Skullclamp, Phyrexian Altar, Herald's Horn, Vanquisher's Banner, Anointed Procession, Exquisite Blood, Blade of the Bloodchief.

- **Engine:** player protection (`PlayerStaticAbilityDef.protection`: `"opponents"` or `"everything"`, in place of `protectionFromOpponents`; `playerProtectedFrom` for targets and damage); "your life total can't change" (`lifeLoss` replacement that prevents, 119.8: `payableLife`, no life payment beyond 0); land back face of a modal card played as a land (712.12, `landFace`, `moveObject(…, { modalBack })`); "choose one or more" (`oneOrMore`).
- **Tests:** `engine/test/edh-staples.test.ts` (31), including the Exquisite Blood + Sanguine Bond loop (win with two players, next player with three) and Anointed Procession with Edgar's eminence.
- **Approximations:** Enlightened Tutor and Herald's Horn (no reveal), "untap up to N lands", Phyrexian Altar, Teferi's Protection (Aura on the player).

**Both decks are playable:** `cmd-edgar-markov` (88 / 88 excluding basic lands) and `cmd-yshtola` (91 / 91).

## Deck The Ur-Dragon: Dragons, five colors ✅ (168 / 168)

Added on 2026-10-06 with the "Add a Commander deck" recipe (CLAUDE.md). List: "How to Train Ur-Dragon [Primer!]" by Shiny_Latios on Moxfield (bracket 4, updated 2026-09-27), in `docs/commander/decks/ur-dragon.txt`; precon `cmd-ur-dragon` (7 Game Changers: Chrome Mox, Demonic Tutor, Mana Vault, Mox Diamond, Smothering Tithe, Teferi's Protection, The One Ring).

**Import:** 51 cards absent from the catalog added to EDH; 48 cards of the deck were already playable (Standard, reprints, previous decks). The import by name now takes the most recent French printing from another set (image included) when the printing of origin has none, and ignores French printings whose text is in English (EOC at Scryfall): every EDH card has a French image, 16 cards of the previous decks gained one; Korvold, Mox Diamond and the ten original dual lands (French printings without text at Scryfall, or with English text) have their French text completed by hand in `cards/data/french-overrides.json`, applied by the import by name.

**Cards (41, `edh/urdragon.ts` and `edh/lands.ts`):** The Ur-Dragon; mana: Birds of Paradise, Noble Hierarch, Ignoble Hierarch, Delighted Halfling, Selvala, Heart of the Wilds, Mana Vault, Mox Diamond, Chromatic Orrery; lands: City of Brass, Forbidden Orchard, Arena of Glory, Boseiju, Who Endures, Horizon of Progress, Windswept Heath, Wooded Foothills, Ketria Triome; enchantments and planeswalker: Dragon Tempest, Temur Ascendancy, Steely Resolve, Kiora, Behemoth Beckoner; spells: Stubborn Denial, Swan Song, Crux of Fate, Majestic Genesis; Dragons: Ancient Gold Dragon, Cavern-Hoard Dragon, Dragonlord Dromoka, Dragonlord Kolaghan, Ganax, Astral Hunter, Goldlust Triad, Goldspan Dragon, Hellkite Courser, Klauth, Unrivaled Ancient, Korvold, Fae-Cursed King, Miirym, Sentinel Wyrm, Old Gnawbone, Scourge of Valkas, Tiamat, Ureni of the Unwritten, Zurgo and Ojutai.

- **Engine:**
  - eminence of a player static (`PlayerStaticAbilityDef.fromCommand`: The Ur-Dragon, cost reduction from the command zone);
  - command zone in references (`ref.zone("command", …)`, cards only, not emblems) and in moves (`MoveSpec.to: "command"`): Hellkite Courser, Majestic Genesis;
  - myriad (702.116, read from the text): `copyToken` with `attackEach` (one copy attacks each of the designated players) and `exileAtEndOfCombat`;
  - tagged mana kept until end of turn (`TaggedMana.keep`, `addManaCombination(…, keep)`: Klauth); mana produced by an effect carrying an associated effect (`fx.addManaWithRider`: Arena of Glory, haste);
  - "with the same name as [the designated object]" (`ObjectFilter.nameOf`, resolved by `withX`: Dragonlord Kolaghan); greatest amount among players (`amount.maxOverPlayers`: Cavern-Hoard Dragon); power greater than each other creature's (`cond.eventObjectStrictlyGreatestPower`: Selvala);
  - fix: a condition read at resolution (`fx.when`) sees the triggering object and event;
  - mandatory loop that accumulates (104.4b): Ganax and Draconic Visitor (a Dragon enters → a Treasure → a 5/5 Dragon instead) restart endlessly; the engine did not see it (the fingerprint changes with every token, the order of triggers reset the counter) and a four-player game lasted hours; it is now detected (fingerprint where tokens and stack objects count only once, `outcomeHash(s, true)`); test in `edh-urdragon.test.ts`;
  - AI: with more than 12 objects on the stack or 150 permanents, choices are no longer simulated (`docs/ai.md`);
  - fix found by the strict fuzz: payment does not use more life-costing sources (Mana Confluence, Horizon of Progress) than the player can afford (119.4); test in `offers.test.ts`.
- **Tools:** `npm run arena -- … --by-deck --deck cmd-<id>` measures a Commander precon against each of the others.
- **Tests:** `engine/test/edh-urdragon.test.ts` (32); EDH smoke test (168 cards); Commander fuzz with 2, 3 and 4 players, strict (`--offers 4`) and "chaos" clean.
- **Approximations:** Mox Diamond (enters ability), Forbidden Orchard ("becomes tapped"), Chromatic Orrery (spells only), myriad (one question, players only), Hellkite Courser (two commanders), Zurgo and Ojutai (order below).
- **Debt:** `fromCommand` (player static), `nameOf`, `attackEach`, `exileAtEndOfCombat` justified in `debt-baseline.json`; ObjectFilter 87 → 88, Amount 31 → 32, Condition (fields) 97 → 98, Effect (fields) 635 → 638, Amount (fields) 67 → 70; `fromCommand` is no longer specific to Edgar Markov.
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-ur-dragon`, against Edgar and Y'shtola in turn): in a duel, The Ur-Dragon wins 54.9% ± 4.0 (597 decided games, 3 draws, 17 turns on average); with four players (seats Ur-Dragon, other, Ur-Dragon, other), 41.2% ± 5.7 (291 decided games, 9 draws, 37 turns). Within the 45 to 55% target in a duel, a little below with four players; the list is not touched.

## Deck Rakdos, Lord of Riots: big free spells ✅ (225 / 225)

Added on 2026-10-06 with the "Add a Commander deck" recipe. List: "Rakdos, Lord of Big Free Stuff" by wachelreeks on Moxfield (updated 2026-09-24), in `docs/commander/decks/rakdos.txt`; precon `cmd-rakdos` (2 Game Changers: Demonic Tutor, Vampiric Tutor; estimated bracket 3).

**Import:** 57 cards absent from the catalog added to EDH, all with a French image; French text of Lim-Dûl's Hex completed by hand (`french-overrides.json`).

**Cards (57, `edh/rakdos.ts` and `edh/lands.ts`):** Rakdos, Lord of Riots; Eldrazi: Emrakul, the Promised End, Emrakul, the World Anew, It That Betrays, Kozilek, Butcher of Truth, Kozilek, the Broken Reality, Ulamog, the Ceaseless Hunger, Ulamog, the Defiler, Ulamog, the Infinite Gyre; Blightsteel Colossus, Cityscape Leveler, Razaketh, the Foulblooded, Ancient Cellarspawn, Exocrine, Screamer-Killer, Knollspine Dragon, Shivan Devastator, Walking Ballista, Sandstone Oracle; damage and life loss: Creeping Bloodsucker, Fanatic of Mogis, Gray Merchant of Asphodel, Grim Servant, Keen Duelist, Plague Spitter, Shepherd of Rot, Spear Spewer, Stormfist Crusader, Thermo-Alchemist, Florian, Voldaren Scion, Imperial Recruiter, Priest of Gix, Tuktuk Rubblefort; enchantments: Descent into Avernus, Lim-Dûl's Hex, Pandemonium, Phyrexian Reclamation, Protection Racket, Sanctum of Stone Fangs; spells: Agadeem's Awakening, Bloodsoaked Insight, Shatterskull Smashing, Valakut Awakening (land back faces), Deflecting Swat, Rakdos Charm, Wheel of Misfortune; Ob Nixilis, the Adversary; mana: Rakdos Signet, Talisman of Indulgence, Cryptolith Fragment, Lightning Greaves; lands: Blackcleave Cliffs, Blightstep Pathway, Foreboding Ruins, Graven Cairns, Smoldering Marsh, Sulfurous Springs.

- **Engine:**
  - "for each player, …": `fx.forEachPlayer(of, (p, n) => …)`, unrolled for six seats with the `nth` reference (Lim-Dûl's Hex, Protection Racket, Gray Merchant, Kozilek, the Broken Reality, Ob Nixilis);
  - secretly chosen numbers: `fx.chooseNumbers`, `ref.numberChoosers`, `amount.numberChosen` (Wheel of Misfortune);
  - "unless they pay {B} or {3}": `unlessPays(…, { mana, orMana })` without discard;
  - annihilator N and unearth read from the text (`scryfall.ts`); unearthed: `MoveSpec.exileIfLeaves`, `GameObject.exileIfLeaves` (exiled if it would leave the battlefield); madness written out in full ("Madness—Pay six {C}");
  - manifest from the hand: `MoveSpec.as: "manifest"`, with each player's choice in their hand (`pickFromZone` and `who`);
  - spell copy with starting loyalty (`copySpell(…, { loyalty })`, Ob Nixilis's X victim); controlled turn followed by an extra turn (`controlNextTurn(…, thenExtraTurn)`, Emrakul, the Promised End);
  - targets with different mana values (`TargetSpec.differentManaValues`); search bounded by an amount (`search` and `maxManaValue`, Grim Servant);
  - Powerstone token (mana reserved for artifact spells and abilities);
  - modal cards whose front and back are lands (Blightstep Pathway // Searstep Pathway): the player chooses the face played (`playLand` and `back`, one option per face; rules 147);
  - fix: the triggers of a sacrifice follow the sacrificed card into its new zone (It That Betrays);
  - fix found by the strict fuzz: a spell no longer offers as a target a creature with an unpayable life tax (Terror of the Peaks, at 2 life); test in `offers.test.ts`.
- **Tests:** `engine/test/edh-rakdos.test.ts` (30, including Ob Nixilis's X victim with a modified power: the copy's loyalty is the creature's power at the time of the sacrifice); EDH smoke test (225 cards); Commander fuzz with 2, 3 and 4 players, strict and "chaos" clean (a few drawn games from simultaneous defeat: damage to each player).
- **Approximations:** Foreboding Ruins, Pandemonium, Sandstone Oracle (lifted by PLAN-H H4), Emrakul, the World Anew (protection from spells), Cryptolith Fragment, Wheel of Misfortune, Gray Merchant and Creeping Bloodsucker, Keen Duelist.
- **Debt:** `chooseNumbers`, `differentManaValues`, `exileIfLeaves`, `manifest` justified; `cast` is no longer specific to one card; ceilings raised (GameObject 62, Effect 153, Ref 34, Amount 33...).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-rakdos`, against the three other precons in turn): in a duel, Rakdos wins 33.2% ± 3.8 (599 decided games, 18 turns); with four players, 26.6% ± 5.0 (297 decided games, 35 turns). Clearly under the 45 to 55% target; to study in the AI first (casting Rakdos and the Eldrazi at the right time, keeping life loss for the reduction), the list is not touched. Two decisions of more than 20 s on a board of 270 permanents (known limit of the medium level, `docs/ai.md`).


## Multiverse Reforged precon (Reality Fracture): Jace, Multiverse Architect ✅ (282 / 282)

Added on 2026-10-06 at the user's request. Official list of the "Multiverse Reforged" precon of Reality Fracture (MTGJSON, retrieved 2026-10-06), in `docs/commander/decks/multiverse-reforged.txt`; precon `cmd-multiverse-reforged` (white, blue, black, red; no Game Changer, estimated bracket 1–2).

**Import:** 57 cards absent from the catalog added to EDH, all with their French text.

**Cards (57, `edh/multiverse.ts` and `edh/lands.ts`):** Jace, Multiverse Architect; creatures: Akroma, Angel of Fury, Archfiend of Despair, Archon of Cruelty, Avacyn, Angel of Horror, Dack Fayden, Helping Hand, Darksteel Angel, Ginger, Queen of Sweets, Jhoira, Weatherlight Corsair, Memnarch, the Warden, Nissa, Leyline Tamer, Niv-Mizzet, Ghost Counsel, Ob Nixilis, the Ascended, Omnath, Locus of the Void, Serra's Emissary, Tamiyo, Upriser Crowned, The Ur-Sphinx, Venser, Fervent Forger; Elspeth, Sun's Champion; artifacts and enchantments: Azorius, Dimir and Izzet Signet, Talisman of Creativity, Currency Converter, Cursed Mirror, Proteus Staff, Staff of the Storyteller, Dreadhorde Invasion, Shark Typhoon, Skrelv's Hive, Whirlwind of Thought; spells: Brainsurge, Despark, Fact or Fiction, Grand Crescendo, Lingering Souls, Martial Coup, Mass Polymorph, Occult Epiphany, Secure the Wastes, Sunfall, Synthetic Destiny, Teferi's Reproach, White Sun's Twilight; lands: Battlefield Forge, Clifftop Retreat, Contaminated Landscape, Fetid Heath, Kher Keep, Mystic Gate, Perilous Landscape, Radiant Summit, Shivan Reef, Sulfur Falls, Turbulent Crater, Turbulent Shore, Turbulent Wetlands.

- **Engine:**
  - monarch (724): `GameState.monarch`, `fx.becomeMonarch`, `cond.monarch`; draw at the beginning of the monarch's end step, transfer to a player one of whose creatures deals combat damage to them, monarchy passed on when the monarch leaves the game; crown on the board, with a help bubble;
  - toxic (702.164): `CardDef.toxic` and `TokenSpec.toxic`, poison counters in addition to combat damage to a player; corrupted via `amount.poison`;
  - piles separated by an opponent (`piles` and `opponentSeparates`, Fact or Fiction); reveal in another player's library (`revealUntilN` and `who`, Dack Fayden);
  - "its creatures can't attack your Jaces" (`cantAttackPlaneswalkers`); player protection from a filter (Serra's Emissary: the chosen card type);
  - "until that player's next turn" effects (`fx.untilTheirNextTurn`, Teferi's Reproach); life paid in a variable amount (`fx.mayPayLife`, Niv-Mizzet);
  - unspent mana as an amount (`amount.manaInPool`, Omnath); incubate (701.53);
  - the grouped combat damage trigger passes on all the creatures concerned (`ref.eventObjects`), and can be limited to those that hurt you (`toYou`, Tamiyo);
  - fix found by the strict fuzz: a P/T defined by unspent mana (Omnath) makes the characteristics cache depend on the mana pool.
- **Tests:** `engine/test/edh-multiverse.test.ts` (21); strict Commander fuzz with 2 and 4 players clean.
- **Approximations:** Cursed Mirror, monarch (draw and combat transfer without the stack, lifted by PLAN-H H6), Incubator, The Ur-Sphinx.
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-multiverse-reforged`, against the five other precons in turn): in a duel, 52.3% ± 4.0 (596 decided games, 19 turns); with four players (seats A, B, A, B), 48.3% ± 5.7 (294 decided games, 45 turns). Within the target. A four-player game never ended: Dack Fayden had handed out Darksteel Angels, and every player, at negative life, could not lose (per the rules); the arena now counts a Commander game of more than 150 turns as unfinished (`maxTurns`). Medium AI decisions of more than 3 minutes on a board of 160 permanents (known limit, `docs/ai.md`).

## Turtle Power! precon (Teenage Mutant Ninja Turtles): Heroes in a Half Shell ✅ (350 / 350)

Added on 2026-10-06 at the user's request. Official list of the "Turtle Power!" precon of Teenage Mutant Ninja Turtles (MTGJSON, retrieved 2026-10-06), in `docs/commander/decks/turtle-power.txt`; precon `cmd-turtle-power` (five colors; no Game Changer, estimated bracket 1–2). The 20 Teenage Mutant Ninja Turtles (TMT) cards of the deck were already playable.

**Import:** 68 cards absent from the catalog added to EDH; Double Jump // Flying Kick was never printed in French: text translated by hand ("Double saut // Coup de pied volant", `french-overrides.json`, which now accepts the text of each face).

**Cards (68, `edh/turtles.ts`, `edh/lands.ts` and `edh/commander.ts`):** Heroes in a Half Shell; characters: April O'Neil, Live on the Scene, Baxter, Fly in the Ointment, Bebop, Skull & Crossbones, Casey Jones, Back Alley Brute, Donatello, the Brains, Irma, Part-Time Mutant, Krang, the All-Powerful, Leatherhead, Iron Gator, Leonardo, the Balance, Michelangelo, the Heart, Raphael, the Muscle, Rat King, Pale Piper, Ray Fillet, Wave Warrior, Rocksteady, Mutant Marauder, Shredder, Shadow Master, Splinter, the Mentor, Tempestra, Dame of Games, Tokka & Rahzar, Unsupervised; other creatures: Acidic Slime, Big Mother Mouser, Biogenic Ooze, Corpsejack Menace, Dimension X Pizzasaur, Electric Seaweed, Roadkill Rodney, Steelbane Hydra, Vigor, Voracious Hydra; artifacts: Arcade Cabinet, Coin of Mastery, Exploding Barrel, Foot Chopper, Mole Module; enchantments: Endless Foot Assault, High Score, Level Up, Ninja Pizza, Together Forever; spells: Blasphemous Act, Continue?, Cultivate, Double Jump // Flying Kick, Fast Forward, Game Over, Harmonize, Here Comes a New Hero!, Shellshock, Special Move, Super Combo, Swift Demise, Vanquish the Horde, Wave Goodbye; lands: Ash Barrens, Big Apple, 3 a.m., Cinder Glade, Grand Coliseum, Hidden Hideout, Hinterland Harbor, Rain-Slicked Copse, Rootbound Crag, Sodden Verdure, Spire Garden, Thriving Grove, Thriving Isle, Thriving Moor, Undergrowth Stadium, Vernal Fen.

- **Engine:**
  - squad (702.157), read from the text: the squad cost is a kicker paid X times, like replicate (`kickerKind: "squad"`, `kickerPaidTimes`); on entering, that many token copies;
  - fuse (702.102), read from the text: a third face of split cards (targets and effects of both halves, total cost), castable from the hand only;
  - evolve (Ray Fillet): the amount comparison (`cond.amountGreater`) is evaluated at trigger time; the X of a permanent is known as soon as it enters;
  - artifact mana spent to cast a spell (`amount.artifactManaSpent`, Coin of Mastery; excess mana produced is not counted);
  - tokens that attack a designated player (`createTappedTokens(…, { attacking: p })`, Endless Foot Assault); copies sacrificed at end of combat (`copyToken.atEnd`, Shredder; myriad exiles them);
  - opponents attacked this turn (`amount.opponentsAttackedThisTurn`, Fast Forward); starting life (`amount.startingLife`, `cond.someoneAtHalfStartingLife`, Game Over); counters of all kinds among permanents (`countersAmong(…, "any")`);
  - triggers caused by a draw doubled (`TriggerMod.on: "draw"`, Krang); prevented damage changed into counters on the protected permanent (`onPrevent.countersOnDamaged`, Vigor);
  - color excluded from a choice on entering (`fx.chooseForSelf("color", { options })` in `asEnters`, Thriving lands).
- **Tests:** `engine/test/edh-turtles.test.ts` (18); fuse cast menu checked in the browser (`test-results/fuse/`).
- **Approximations:** Vigor (put into the graveyard), Shredder (attack on a planeswalker), Coin of Mastery (excess mana produced).
- **Balance** (medium AI, `--by-deck --deck cmd-turtle-power`): in a duel, 47.4% ± 4.0 (597 decided games, 19 turns); with four players (seats A, B, A, B), 35.7% ± 5.4 (297 decided games, 42 turns), under the fair share of 50%; to study in the AI first (grouped Turtle attacks, counters), the official list is not touched.

## Counter Blitz, The Fantastic Four and Mutant Menace precons ✅ (521 / 521)

Added on 2026-10-07 at the user's request: three official lists retrieved from MTGJSON (`docs/commander/decks/counter-blitz.txt`, `fantastic-four.txt`, `mutant-menace.txt`); precons `cmd-counter-blitz` (Tidus, Yuna's Guardian, green, white, blue; one Game Changer, Farewell, estimated bracket 3), `cmd-fantastic-four` (Invisible Woman, white, blue, red, green; no Game Changer) and `cmd-mutant-menace` (The Wise Mothman, blue, black, green; no Game Changer).

**Import:** 171 cards absent from the catalog added to EDH. Resourceful Defense has only a French printing with English text at Scryfall: French text completed by hand (`french-overrides.json`); the import by name now also finds these texts by the full name of a multi-faced card (Double Jump // Flying Kick).

**Counter Blitz (67, `edh/counterblitz.ts`, `edh/lands.ts`):** Tidus, Yuna's Guardian; guardians and legends: Auron, Gatta and Luzzu, Kimahri, Lord Jyscal Guado, Lulu, Maester Seymour, O'aka, Rikku, Shelinda, Sin, Tromell, Wakka, Yuna, Grand Summoner; creatures: Altered Ego, Bane of Progress, Chasm Skulker, Chocobo Knights, Duskshell Crawler, Fathom Mage, Forgotten Ancient, Generous Patron, Grateful Apparition, Gyre Sage, Incubation Druid, Luminous Broodmoth, Rampant Rejuvenator, Scholar of New Horizons, Sunscorch Regent; summons: Summon: Ixion, Magus Sisters, Valefor, Yojimbo; artifacts and enchantments: Blitzball Stadium, Bred for the Hunt, Everflowing Chalice, Fight Rigging, Inexorable Tide, Path of Discovery, Resourceful Defense, Sphere Grid, Summoner's Sending; spells: Collective Effort, Damning Verdict, Destroy Evil, Promise of Loyalty, Protection Magic, Pull from Tomorrow, Three Visits, Yuna's Decision, Yuna's Whistle; lands: Brushland, Canopy Vista, Flooded Grove, Forge of Heroes, Fortified Village, Idyllic Beachfront, Overflowing Basin, Port Town, Radiant Grove, Seaside Citadel, Skycloud Expanse, Sungrass Prairie, Sunpetal Grove, Tangled Islet, Temple of the False God, Vineglimmer Snarl.

**The Fantastic Four (47, `edh/fantastic.ts`):** Invisible Woman; heroes: Alicia Masters, Black Bolt, Council of Reeds, Crystal, Dragon Man, Franklin Richards, Galactus, H.E.R.B.I.E., Human Torch, Lockjaw, Medusa, Mister Fantastic, Namor, Power Pack, Silver Surfer, The Thing, Valeria Richards, Willie Lumpkin; artifacts and enchantments: Cosmic Crucible, Mind's Dilation, Mirage Mirror, Monologue Tax, Negative Zone Portal, The Fantasticar, Unstable Molecule Suit; spells: Cleansing Nova, Clever Concealment, Cut a Deal, Deep Analysis, Fantastic Elasticity, First Family, Flame On!, Galvanic Iteration, Hull Breach, Into the Time Vortex, Invisible Force Field, It's Clobberin' Time!, Nova Flame, Recurring Insight, Seize the Day, Taunt from the Rampart, Terramorph, Tragic Arrogance, Ultimate Nullification; lands: Rejuvenating Springs, Scorched Geyser.

**Mutant Menace (57, `edh/mutant.ts`, `edh/lands.ts`):** The Wise Mothman; Mutants and legends: Agent Frank Horrigan, Alpha Deathclaw, Hancock, Harold and Bob, Jason Bright, Lily Bowen, Marcus, Piper Wright, Raul, Strong, The Master; creatures: Bloatfly Swarm, Cathedral Acolyte, Feral Ghoul, Glowing One, Infesting Radroach, Lumbering Megasloth, Mirelurk Queen, Nightkin Ambusher, Rampaging Yao Guai, Screeching Scorchbeast, Tato Farmer, Vexing Radgull, Watchful Radstag, Winding Constrictor, Young Deathclaws; artifacts and enchantments: Branching Evolution, Contagion Clasp, Guardian Project, Nuka-Nuke Launcher, Power Fist, Recon Craft Theta, Strength Bobblehead, Struggle for Project Purity, Vault 12: The Necropolis, Vault 87: Forced Evolution; spells: Atomize, Biomass Mutation, Casualties of War, Contaminated Drink, Find // Finality, Mutational Advantage, Nuclear Fallout, Putrefy, Radstorm, Rampant Growth; lands: Darkwater Catacombs, Fetid Pools, Mariposa Military Base, Mortuary Mire, Tainted Isle, Tainted Wood, Viridescent Bog, Woodland Cemetery; talismans: Curiosity, Resilience.

- **Engine:**
  - rad counters (Fallout): `PlayerState.rad`, `fx.rad`, `amount.rad`; at the beginning of their precombat main phase, a player who has some mills that many cards and loses 1 life and one counter for each nonland card milled (Strong: they gain life, `radiationGains`); proliferate gives one more; ☢ badge on the board and a journal line;
  - grouped mill: `millCards` (a single mill, a single `milled` event), trigger "whenever one or more [nonland] cards are milled" (`{ on: "milled", whose, nonland }`, `amount.eventAmount`: their number), filter "milled this turn" (`milledThisTurn`, card that went from the library to the graveyard during this turn);
  - multikicker (702.33c, Everflowing Chalice), read from the text like squad; "Equip commander {N}" read from the text (one more Equip ability, which targets only a commander);
  - control returned to each owner (`fx.returnControlToOwners`, Alicia Masters); "keep one permanent of each type" without lands (`fx.keep(…, "onePerType", …)` since PLAN-H H8a, Tragic Arrogance: you choose for each player); spell put on the bottom of the library (`fx.bottomOnResolve`); "each opponent returns a creature of greater mana value to hand" (`sacrifice(…, { to: "hand" })`, the former `exile: true` becomes `to: "exile"`);
  - P/T defined by the maximum of two amounts and by the greatest mana value in a graveyard (Dragon Man); total of an amount among players (`amount.sumOverPlayers`, Vault 12); shared evolve (`evolve`, `edh/common.ts`);
  - fix reported by the user: "the first time this ability resolves each turn" was never reset (Nissa, Leyline Tamer revealed a creature only once per game; Belladonna Took too); test in `edh-multiverse.test.ts`;
  - fixes found by the strict fuzz: rad and poison counters advance the characteristics cache (Nightkin Ambusher, corrupted).
- **Tests:** `engine/test/edh-counterblitz.test.ts` (17), `edh-fantastic.test.ts` (11), `edh-mutant.test.ts` (13), Nissa (1); EDH smoke test (521 cards).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-<id>`, against the eight other precons in turn; 400 games in a duel, 150 with four players, seats A, B, A, B, fair share 50%):

  | Precon | Duel | Four players |
  |---|---|---|
  | Counter Blitz | 46.8% ± 4.9 | 45.0% ± 8.0 |
  | The Fantastic Four | 30.1% ± 4.5 | 32.4% ± 7.5 |
  | Mutant Menace | 42.7% ± 4.9 | 39.2% ± 7.9 |

  The Fantastic Four is clearly weak: the AI casts few noncreature spells before combat (which wakes up its heroes) and rarely pays {R}{G}{W}{U}; to study in the AI first, the official list is not touched. One medium AI decision of 50 s with four players (loaded board).
- **Tools:** bundle budgets raised (`commander` chunk 551 KB for a budget of 800 KB, printings table 466 KB for 600 KB).
- **Approximations:** see `docs/approximations.md` (radiation without the stack, lifted by PLAN-H H6; Sin, Altered Ego, Collective Effort, Forgotten Ancient, Resourceful Defense, Yuna, Grand Summoner, Fathom Mage, Promise of Loyalty, Deep Analysis, First Family, Namor, Black Bolt, Willie Lumpkin, Tragic Arrogance, Negative Zone Portal, Cut a Deal, Hancock, Harold and Bob, Jason Bright, Lumbering Megasloth, Nightkin Ambusher, Nuka-Nuke Launcher, Young Deathclaws, Winding Constrictor, Mariposa Military Base, Finality, Mutational Advantage).

## Deck Nissa, Leyline Tamer: landfall and big creatures ✅ (555 / 555)

**Removed on 2026-10-09 at the user's request:** list `docs/commander/decks/nissa.txt` and precon `cmd-nissa` deleted (recoverable from Git); its 34 cards stay in the EDH catalog (the by-name import keeps cards already imported), with their scripts and tests.

Added on 2026-10-08 at the user's request with the "Add a Commander deck" recipe. List: "Nissa, Non-Green Animist (Landfall w/ Big Creatures)" by KamiNinja on Moxfield (declared bracket 4, updated 2026-10-02), in `docs/commander/decks/nissa.txt`; precon `cmd-nissa` (white, blue, black, red; 4 Game Changers: Cyclonic Rift, Farewell, Teferi's Protection, Vampiric Tutor). The commander and 60 other cards were already playable (Multiverse Reforged, other decks, sets).

**Import:** 34 cards absent from the catalog added to EDH, all with their French text.

**Cards (34, `edh/nissa.ts`, `edh/lands.ts`, `edh/commander.ts`):** creatures: Agent of Treachery, Avacyn, Angel of Hope, Crabomination, Elesh Norn, Mother of Machines, Emeria Angel, Emeria Shepherd, Gandalf, Shadow's Foe, Geode Rager, Hullbreaker Horror, Nezahal, Primal Tide, Ob Nixilis, the Fallen, Roil Elemental, Ruin Crab, Walking Atlas; enchantments: Retreat to Coralhelm, Retreat to Hagra, Trade Routes, Valakut Exploration; artifacts: Crucible of Worlds, Scroll Rack, Sensei's Divining Top, Wayfarer's Bauble; spells: Ponder, Portent, Scheming Symmetry; lands: Boggart Trawler // Boggart Bog, Command Beacon, Eiganjo, Seat of the Empire, Oboro, Palace in the Clouds, Raugrin Triome, Takenuma, Abandoned Mire, Talon Gates of Madara, Training Center, Xander's Lounge.

- **Engine:**
  - "look at the top N cards, then put them back in any order": `lookAtTop` and `rest: "reorder"` (ordering question asked of the player looking, also in another player's library: Portent); no question when all the cards looked at must be taken (`exact`, Scroll Rack; Kellan, Daring Traveler no longer asks anything when the card necessarily goes to hand);
  - silent entries (`triggerMod` `none`): any ability that an entry triggers (landfall included, not only "enters"), and only those of the filter's sources (Elesh Norn, Mother of Machines: opposing permanents; `everyone` for Torpor Orb and Hushbringer);
  - emerge from an artifact ("Emerge from artifact", Crabomination), read from the text;
  - fix: a "target permanent" written `target.permanent("t", [], …)` (filter with empty types) matched nothing; the ability never had a target (Alpha Deathclaw, Galactus, The Thing, Invisible Force Field, Forge of Heroes, Resourceful Defense); a filter with empty `types` no longer constrains the type.
- **Tests:** `engine/test/edh-nissa.test.ts` (37), Alpha Deathclaw in `edh-mutant.test.ts`, Elesh Norn in `rulings.test.ts`; EDH smoke test (555 cards); strict Commander fuzz with four players clean.
- **Approximations:** Command Beacon (with two commanders, both go to hand).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-nissa`, against the nine other precons in turn): in a duel, 37.7% ± 6.7 (199 decided games out of 200, 19.6 turns); with four players (seats A, B, A, B, fair share 50%), 51.5% ± 9.8 (99 decided games out of 100, 44.8 turns). Under the target in a duel, within the target with four players. To study in the AI first (replayed lands, top of library), the list is not touched.
- **Debt:** no new entry; `sacrificeReduce` (emerge) is no longer specific to one card and leaves the baseline; ceilings unchanged.

## Deck The Vision: colorless artifacts ✅ (626 / 626)

Added on 2026-10-08 at the user's request with the "Add a Commander deck" recipe. List: "Nier Automata Deck" by DoomMeat on Moxfield (declared bracket 3, updated 2026-10-05), in `docs/commander/decks/vision.txt`; precon `cmd-vision` (colorless; 1 Game Changer: The One Ring). The commander (Marvel Super Heroes) and 34 other cards were already playable.

**Import:** 63 cards absent from the catalog added to EDH, with their French text.

**Cards (63, `edh/vision.ts` and `edh/visionLands.ts`):** artifacts: Basalt Monolith, Cloud Key, Darksteel Forge, Darksteel Monolith, Forsaken Monument, Fractured Powerstone, Gerrard's Hourglass Pendant, Liquimetal Torque, Manifold Key, Moonsilver Key, Mox Opal, Mystic Forge, Nevinyrral's Disk, The Mightstone and Weakstone, Unwinding Clock, Vedalken Orrery, Voltaic Key; Equipment: Adaptive Omnitool, Brotherhood Regalia, Champion's Helm, Commander's Plate, Excalibur, Sword of Eden, Hammer of Nazahn, Mithril Coat, Nettlecyst, Silver Shroud Costume, Sword of Feast and Famine, Sword of Truth and Justice; planeswalkers: Karn, Living Legacy, Ugin, the Ineffable, Ugin, the Spirit Dragon; creatures: Glaring Fleshraker, Liberator, Urza's Battlethopter, Scrap Trawler, Shimmer Myr, Skittering Cicada, Wandering Archaic // Explore the Vastlands; spells: All Is Dust, Desecrate Reality, Echoes of Eternity, Eldrazi Confluence, Eldritch Immunity, Kozilek's Command, Null Elemental Blast; lands: Abstergo Entertainment, Buried Ruin, Darksteel Citadel, Emergence Zone, Planar Nexus, Sanctum of Ugin, Scorched Ruins, Shrine of the Forsaken Gods, The Grey Havens, The Mycosynth Gardens, Urza's Cave, Urza's Mine, Urza's Power Plant, Urza's Saga, Urza's Tower, Urza's Workshop, Vesuva, War Room, Witch's Clinic.

- **Engine:**
  - activated abilities of emblems (114.4): Karn, Living Legacy (−7); the activatable emblem becomes a button in the player's bar;
  - delayed "the next time" ability without duration (603.7c, `fx.whenNext`): it triggers once (Ugin, the Ineffable);
  - `lookAtTop` with `chooser: "owner"`: each player chooses in their own library (Explore the Vastlands);
  - "mana value X or less" (`maxManaValueAmount: amount.x`) checked on casting with the announced X; `legalActions` publishes the minimum X of each target (`TargetOption.xAtLeast`), the AI takes a sufficient X (Kozilek's Command, and also Here Comes a New Hero!, Agadeem's Awakening);
  - filters and amounts: "with a mana ability" (`withActivatedAbility: "mana"`), protection from outside the commander's identity (`outsideIdentity`), colors of the commanders' identity (`amount.commanderColors`), life of a cost computed (`CostDef.payLife` amount), untapping during the other players' steps according to a filter (`untapOnOthersUntap`, which replaces the Prop Room static), colors of the cards in the graveyard for a mana ability (`colorsZone`);
  - "Equip legendary creature {N}" read from the text, like "Equip commander";
  - fixes: a spell on the stack triggers only its "when you cast this spell" abilities (Ugin, Eye of the Storms triggered itself with "whenever you cast a colorless spell"); a land that its "enters" effects put into the graveyard (Scorched Ruins) crashed `playLand`, it now counts as played.
- **Tests:** `engine/test/edh-vision.test.ts` (62), Echoes of Eternity and Gerrard's Hourglass Pendant in `rulings.test.ts`; EDH smoke test (618 cards, colorless sources added for {C} costs); strict fuzz with two players and Commander with four players with no refused option.
- **Approximations:** Scorched Ruins (sacrificed lands chosen by the engine), The Mycosynth Gardens (mana value checked at resolution, like Likeness Looter).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-vision`, against the ten other precons in turn): in a duel, 49.7% ± 6.9 (199 decided games out of 200, 20.6 turns); with four players (seats A, B, A, B, fair share 50%), 41.8% ± 9.8 (98 decided games out of 100, 48.8 turns). Within the target in a duel, a little under the target with four players (wide uncertainty).
- **Debt:** `outsideIdentity` (Commander's Plate) and `produceColorsZone` (The Grey Havens) enter the baseline; `ifManaValue`, `manaProduced`, `withActivatedAbility` and the `Ref.commanders` variant are no longer in it (shared); ceilings Effect (fields) 639 → 640 and values specific to one card 104 → 105.

**"Weight of the World" list (2026-10-08, rules 173):** at the user's request, the deck follows the list of their Nier: Automata proxy set (TappedOut, https://tappedout.net/mtg-decks/weight-of-the-world-1/; estimated bracket 3, three Game Changers: Ancient Tomb, Mana Vault, Mishra's Workshop). Six cards change: Arid Archway, Basalt Monolith, Everflowing Chalice, The One Ring, Ugin, the Spirit Dragon and Vesuva go out; Ancient Tomb, Candelabra of Tawnos, Mana Vault, Mishra's Workshop, Null Brooch and Sensei's Divining Top come in. The `Sideboard` section of `vision.txt` (ignored by the precon) lists the extras of the proxy set, imported for the players' decks. The import by name now keeps any card already imported, even removed from its list (Ugin, the Spirit Dragon stays in the catalog).

- **Cards (8):** Candelabra of Tawnos (exactly X targets, `countX`), Mishra's Workshop (mana reserved for artifact spells), Null Brooch (discard your hand as a cost); sideboard: Eldrazi Conscription (annihilator granted), Foundry Inspector, Palladium Myr, Portal to Phyrexia (creature from a graveyard, Phyrexian in addition), Super State (base 9/9; damage to each other opponent). No new form.
- **Engine fix:** attacking creatures tap before the attack tax is paid (508.1f, then 508.1h); a creature sacrificed to pay it (Eldrazi Spawn in front of Ghostly Prison) leaves combat. The engine crashed ("Unknown object") in the four-player arena.
- **Tests:** 8 more in `engine/test/edh-vision.test.ts` (70); strict EDH fuzz with two and four players with no refused option.
- **Balance** (same settings as before): in a duel, 50.0% ± 6.9 (200 games, 20.0 turns); with four players, 49.0% ± 9.8 (100 games, 48.1 turns), against 41.8% with the old list.
- **Custom art:** `npm run custom-art -- <folder>` (`tools/custom-art.ts`); the precon uses it for all its cards (`"art": "custom"`), the other decks keep Scryfall's (selectable card by card in the editor); every card of the deck has its own except Shrine of the Forsaken Gods (absent from the folder).

## Deck Dark Leo & Shredder: Ninjas ✅ (653 / 653)

Added on 2026-10-08 at the user's request with the "Add a Commander deck" recipe. List: "I Am Ninja, Sneaking in the Shadows" by Fullmoon on Moxfield (updated 2026-09-19), in `docs/commander/decks/dark-leo.txt`; precon `cmd-dark-leo` (white and black), bracket 4 as on Moxfield (four Game Changers: Smothering Tithe, Bolas's Citadel, Teferi's Protection, Farewell; first declared bracket 3, then 4 at the user's request, the arena putting it above the other precons). The commander (Turtles) and 57 other cards were already playable.

**Import:** 27 cards absent from the catalog added to EDH, with their French text; 0 color identity discrepancies with Scryfall.

**Cards (27, `edh/darkleo.ts`, and Tainted Field in `edh/lands.ts`):** Ninjas: Ink-Eyes, Servant of Oni, Nashi, Moon Sage's Scion, Nezumi Prowler, Okiba-Gang Shinobi, Orochi Soul-Reaver, Throat Slitter, Throatseeker; other creatures: Archetype of Courage, Astarion, the Decadent, Bloodline Pretender, Changeling Outcast, Leonardo, Worldly Warrior, Mirror Entity, Splinter, Aging Champion; enchantments: Cover of Darkness, Legion Loyalty, No Mercy, Wound Reflection; instant: Akroma's Will; artifacts: Helm of the Host, Sonic Screwdriver, Strionic Resonator, Whispersilk Cloak; lands: Access Tunnel, Shizo, Death's Storehouse, Tainted Field, The Black Gate.

- **Engine:**
  - ninjutsu of EDH cards: the `ninjutsu(cost)` helper (`edh/common.ts`), modeled on Kaito (702.49c: the Ninja attacks what the returned creature was attacking);
  - `blocked` filter (509.1h): attacking creature that is blocked, or unblocked once blockers are declared (Throatseeker; a Ninja put onto the battlefield attacking by ninjutsu is unblocked); the layer cache follows blocks (`bumpFor(s, "blocks")`, `blocked` and `blocking` filters);
  - `LayerMods.forbidKeywords`: "loses [keyword] and can't have or gain it", removed at the end of layer 6, after the more recent effects and ability counters (Archetype of Courage);
  - blocking rule `cantBeBlockedByPlayer`: "can't be blocked by creatures that player controls", the player (a reference) frozen at resolution (The Black Gate: the player chosen among those with the most life);
  - fear (702.36): the `block.fear` blocking rule (Cover of Darkness, Shizo); granted myriad: `myriadAbility()` (`dsl.ts`), also used for the myriad read from the text (Legion Loyalty);
  - "As The Black Gate enters, you may pay 3 life": a land that names itself is read as a shock land.
- **Tests:** `engine/test/edh-darkleo.test.ts` (27); four rulings in `rulings.test.ts` (unblocked ninjutsu Ninja and Throatseeker, Wound Reflection counts life lost and not net loss, Akroma's Will keeps both its modes if the commander leaves after the cast, double strike escapes Archetype of Courage); EDH smoke test (653 cards); strict fuzz with two and four players with no refused option.
- **Approximations:** Helm of the Host (the token's haste is copiable), Cover of Darkness and Shizo (fear is a blocking rule, not a keyword).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-dark-leo`, against the eleven other precons in turn): in a duel, 56.0% ± 6.9 (200 games, 18.4 turns); with four players (seats A, B, A, B, fair share 50%), 60.0% ± 9.6 (100 games, 43.5 turns). A little above the target, within the uncertainty in a duel. One declare-blockers step at 128 permanents (myriad and copy tokens) took the opposing medium AI about 9 s (game 75 with four players).
- **Debt:** `blocked` (Throatseeker), `cantBeBlockedByPlayer` (The Black Gate) and `forbidKeywords` (Archetype of Courage) enter the baseline; the `regenerate` operation, the `returnUnblockedAttacker` property and the `Condition.mostLife` variant are no longer in it (shared); ceilings ObjectFilter 71 → 72, LayerMods 30 → 31, BlockRule 13 → 14.

## Deck The Ur-Sphinx: Sphinxes ✅ (681 / 681)

Added on 2026-10-09 at the user's request with the "Add a Commander deck" recipe (the Nissa deck was removed the same day, its cards kept). List: "Stolen Futures" by LoneWolf87x on Moxfield (updated 2026-09-29), in `docs/commander/decks/ur-sphinx.txt`; precon `cmd-ur-sphinx` (white, blue and black), bracket 4 (thirteen Game Changers: Ancient Tomb, Chrome Mox, Consecrated Sphinx, Cyclonic Rift, Force of Will, Grim Monolith, Mana Vault, Mox Diamond, Mystical Tutor, Rhystic Study, Smothering Tithe, Teferi's Protection, Vampiric Tutor). The commander (Multiverse Reforged) and 67 other cards were already playable; the Moxfield sideboard ("considering": Temporal Mastery, Scroll Rack, Talisman of Hierarchy) is not imported.

**Import:** 28 cards absent from the catalog added to EDH; French text from Scryfall except Grim Monolith (French name only) and Scholar of the Lost Trove (never printed in French), completed by hand in `french-overrides.json`; 0 color identity discrepancies with Scryfall.

**Cards (28, `edh/ursphinx.ts`, and Hall of the Bandit Lord in `edh/lands.ts`):** Sphinxes: Azor, the Lawbringer, Chancellor of the Spires, Consecrated Sphinx, Dazzling Sphinx, Dream Trawler, Magister Sphinx, Master of Predicaments, Medomai the Ageless, Raffine, Scheming Seer, Scholar of the Lost Trove, Sharuum the Hegemon, Sphinx Ambassador, Sphinx Summoner, Sphinx of Uthuun, Sphinx of the Second Sun, Tivit, Seller of Secrets, Unesh, Criosphinx Sovereign, Windreader Sphinx, Yennett, Cryptic Sovereign; other cards: Academy Manufactor, Breach the Multiverse, Grim Monolith, Hall of the Bandit Lord, Mnemonic Betrayal, Mystical Tutor, Raise the Palisade, Reconnaissance, Urza's Incubator.

- **Engine** (rules 175, details in `docs/engine.md`):
  - "connives X" (701.50e, Raffine): draw X, discard X, a counter per nonland card discarded;
  - player effect "during that player's next turn" (`throughTheirNextTurn`, Azor: no instant or sorcery during their next turn);
  - additional whole beginning phase, untap, upkeep and draw (Sphinx of the Second Sun); extra turns known to the rules (`TurnState.extra`, `cond.extraTurn`: Medomai can't attack during them);
  - removal from combat (506.4, Reconnaissance);
  - "instead create one of each" tokens (Academy Manufactor), each such replacement applied once to what it creates (616.1: two Manufactors, three of each);
  - opening-hand reveal with effects at the first upkeep (`leyline.revealFirstUpkeep`, the Chancellor cycle);
  - search of another player's library (choice among the cards of the `library` zone, Sphinx Ambassador), a player other than the controller choosing for the source (the opponent names a card), "not of the chosen name" read inside `not`;
  - `exileUntil.storeAll` (Dazzling Sphinx: the cards not cast go on the bottom); votes as `forEachPlayer` + `yourChoice` (Tivit).
- **Tests:** `engine/test/edh-ursphinx.test.ts` (29, among them Academy Manufactor's ruling with two Manufactors); EDH smoke test (681 cards).
- **Approximations:** Dazzling Sphinx (the rest in exile order), Yennett (top card not shown when not cast), Tivit (votes take effect as cast), Breach the Multiverse (one graveyard after the other), Sphinx Ambassador (no "search" event), Sphinx of the Second Sun (only the second main phase is postcombat).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-ur-sphinx`, against the eleven other precons in turn): in a duel, 43.0% ± 6.9 (200 games, 19.4 turns); with four players (seats A, B, A, B, fair share 50%), 35.0% ± 9.3 (100 games, 44.6 turns). Under the target, clearly with four players: a control deck whose strength lies in choices the medium AI makes poorly (free spells, piles, Mystical Tutor, Reconnaissance); to study in the AI first, the list is not touched. Slowest decision: 1.1 s (four players).
- **Debt:** `removeFromCombat` (Reconnaissance), `Condition.extraTurn` (Medomai), `oneOfEach` (Academy Manufactor), `revealFirstUpkeep` (Chancellor of the Spires) and `storeAll` (Dazzling Sphinx) enter the baseline; `opponentSeparates` leaves it (Fact or Fiction, Sphinx of Uthuun, Unesh); ceilings Single-card values 104 → 106, Effect 149 → 150, Effect (fields) 640 → 645, Condition 53 → 54, Condition (fields) 97 → 98.

## Deck Vivi Ornitier: storm ✅ (721 / 721)

Added on 2026-10-09 at the user's request with the "Add a Commander deck" recipe. List: "Vivi Ornitier Storm [TOODEEP]" by rfoxley on Moxfield (a cEDH deck, updated 2026-04-28), in `docs/commander/decks/vivi.txt`; precon `cmd-vivi` (blue and red), bracket 5 (cEDH; thirteen Game Changers: Ancient Tomb, Chrome Mox, Fierce Guardianship, Force of Will, Gamble, Intuition, Jeska's Will, Lion's Eye Diamond, Mana Vault, Mox Diamond, Mystical Tutor, The One Ring, Underworld Breach). The commander (Final Fantasy) and 59 other cards were already playable (Brain Freeze, Underworld Breach, Force of Will, Daze, Gemstone Caverns...).

**Import:** 39 cards absent from the catalog added to EDH; French text from Scryfall except twelve old printings with a French name but no French text (City of Traitors, Intuition, Jeweled Amulet, Lion's Eye Diamond, Lotus Petal, Misdirection, Pyroblast, Pyrokinesis, Red Elemental Blast, Submerge, Urza's Bauble, Wheel of Fortune), completed by hand in `french-overrides.json`; 0 color identity discrepancies with Scryfall.

**Cards (39, `edh/vivi.ts`):** mana: City of Traitors, Desperate Ritual, Fiery Islet, Jeweled Amulet, Lion's Eye Diamond, Lotus Petal, Mox Amber, Paradise Mantle, Rite of Flame, Simian Spirit Guide, Strike It Rich; cards and information: Borne Upon a Wind, Faithless Looting, Gitaxian Probe, Intuition, Jeska's Will, Mishra's Bauble, Urza's Bauble, Wheel of Fortune; interaction: Chain of Vapor, Crowd's Favor, Dizzy Spell, Gut Shot, Mental Misstep, Misdirection, Mogg Salvage, Pact of Negation, Pyroblast, Pyrokinesis, Red Elemental Blast, Snapback, Submerge, Tormod's Crypt, Twisted Image; creatures: Dragon's Rage Channeler, Tandem Lookout; extra turns that lose: Final Fortune, Last Chance, Warrior's Oath.

- **Engine** (rules 176, details in `docs/engine.md`):
  - soulbond (702.95): pairing (`GameObject.pairedWith`, `fx.pair`), filter `paired`, the two pairing abilities read from the text, the pair broken by the state-based checks;
  - transmute (702.53), read from the text (Dizzy Spell);
  - "look at" cards seen by their player only (`fx.look`, `reveal` event with `look`, filtered for the others): Gitaxian Probe, Mishra's Bauble, Urza's Bauble (a card at random);
  - "copy this spell" during its own resolution, by another player (`copySpell.for`, Chain of Vapor); a copy may replace targets that no longer exist (707.10c, kept by default);
  - `chooseAmong` "any number" with a maximum (Intuition: three cards, the opponent picks one); `stackItems.spellsOnly` (Misdirection);
  - Lion's Eye Diamond, Simian Spirit Guide: mana abilities with a cost (discarding the hand, exile from hand), activated by hand, never by the automatic payment.
- **Tests:** `engine/test/edh-vivi.test.ts` (29); EDH smoke test (721 cards).
- **Approximations:** Desperate Ritual (no splice), Jeweled Amulet (the mana type is not noted), Tandem Lookout (pair broken at the state-based checks), Intuition (cards shown to the choosing opponent only), Final Fortune and its cousins (lost at the end step of your next turn).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-vivi`, against the twelve other precons in turn): in a duel, 21.0% ± 5.6 (200 games, 18.3 turns); with four players (seats A, B, A, B, fair share 50%), 17.0% ± 7.4 (100 games, 40.1 turns). Far under the target: a storm deck whose engine (Underworld Breach with Lion's Eye Diamond and Brain Freeze, rituals chained in one turn) the AI doesn't assemble; to study in the AI first, the list is not touched.
- **AI turn length** (measured with self-play, actions of the AI during its own turn, Vivi against the other precons): medium, 2.7 actions per turn on average (others 2.6), 6 at the 95th percentile, 19 at most; expert, 3.8 on average (others 3.1), 10 at the 95th percentile, 24 at most, with 2.2 s of thinking per turn on average outside the interface (others 1.3 s; 10 s at most). In the interface, thinking is capped at 0.7 s per decision and each resolution is shown about 1.5 s (normal pace): a long Vivi turn lasts about 15 to 40 s.
- **Debt:** `pair` (soulbond), `paired` and `spellsOnly` enter the baseline; `switchPT` and `with` leave it (shared); ceilings Single-card values 106 → 107, GameObject 49 → 50, ObjectFilter 72 → 73, Effect 150 → 152, Effect (fields) 645 → 653.

## Deck Sephiroth: aristocrats ✅ (751 / 751)

Added on 2026-10-09 at the user's request with the "Add a Commander deck" recipe. List: "Sephiroth's Singularity" by Grumpywolf on Moxfield (updated 2026-10-08), in `docs/commander/decks/sephiroth.txt`; precon `cmd-sephiroth` (mono-black), bracket 4 (nine Game Changers: Ancient Tomb, Bolas's Citadel, Chrome Mox, Demonic Tutor, Mana Vault, Necropotence, Orcish Bowmasters, The One Ring, Vampiric Tutor). The commander (Final Fantasy) and 52 other cards were already playable; the Moxfield sideboard (seven "considering" cards) is not imported.

**Import:** 31 cards absent from the catalog added to EDH; French text from Scryfall except four old printings with a French name only (Lake of the Dead, Mortuary, Tombstone Stairwell, Yawgmoth's Will), completed by hand in `french-overrides.json`; 0 color identity discrepancies with Scryfall.

**Cards (31, `edh/sephiroth.ts`):** creatures: Accursed Marauder, Ayara, First of Locthwain, Braids, Arisen Nightmare, Crypt Ghast, Drivnod, Carnage Dominus, Fleshbag Marauder, Fumulus, the Infestation, Gravecrawler, Great Unclean One, Jadar, Ghoulcaller of Nephalia, Merciless Executioner, Ophiomancer, Pawn of Ulamog, Stridehangar Automaton, Warren Soultrader, Zulaport Cutthroat; planeswalker: Tevesh Szat, Doom of Fools; artifacts and enchantments: Ashnod's Altar, Biotransference, Jet Medallion, Mortuary, Tombstone Stairwell; lands: Barad-dûr, Cabal Coffers, Lake of the Dead, Nykthos, Shrine to Nyx; spells: Entomb, Fell the Profane // Fell Mire, Flare of Malice, Malakir Rebirth // Malakir Mire, Yawgmoth's Will.

- **Engine** (rules 177, details in `docs/engine.md`):
  - filter `sharesCardTypeWith` (Braids: "a permanent that shares a card type with it", read from the sacrificed permanent's last known information); the `sacrifice` operation resolves its filter like the zone references (`withX`);
  - sacrifice as an alternative cost (`AltCostPay.sacrifice`, the Flares), the lowest mana value chosen automatically;
  - the Eldrazi Spawn token moves to `edh/common.ts` (The Vision, Pawn of Ulamog);
  - an Oracle test of the lands that enter untapped no longer takes a land that "would enter" (Lake of the Dead: a replacement).
- **Tests:** `engine/test/edh-sephiroth.test.ts` (27); EDH smoke test (751 cards). Two script bugs found by the tests: `fx.forEachPlayer` goes through six seats, so Braids drew and Great Unclean One created a Demon for absent seats (now guarded by the seat's presence).
- **Approximations:** Biotransference (creature cards outside the battlefield are not artifacts), Flare of Malice (the sacrificed creature is chosen by the engine), Tombstone Stairwell (no world rule).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-sephiroth`, against the thirteen other precons in turn): in a duel, 48.0% ± 6.9 (200 games, 19.0 turns); with four players (seats A, B, A, B, fair share 50%), 59.0% ± 9.6 (100 games, 42.8 turns). Within the target. Slowest decision: 1.7 s, an opponent at 82 permanents with four players. AI turn length (medium, actions during its own turn): 3.2 on average, 7 at the 95th percentile, 17 at most (the other decks: 3.2, 8, 14). Strict fuzz with the precons clean.
- **Debt:** `sharesCardTypeWith` enters the baseline; ceiling ObjectFilter 73 → 74.

## Deck Mario & Luigi: partners ✅ (788 / 788)

Added on 2026-10-09 at the user's request with the "Add a Commander deck" recipe. List: "Mario & Luigi" by Brainstorm on Archidekt (updated 2025-12-28; the first list taken from Archidekt, through its API, the "Sideboard", "Maybeboard" and "Tokens & Extras" categories left out), in `docs/commander/decks/mario-luigi.txt`; precon `cmd-mario-luigi` (white, black, red and green), bracket 3 (one Game Changer, Gamble). The first deck with two commanders: Bruse Tarl, Boorish Herder and Reyhan, Last of the Abzan, both with partner. 39 cards were already playable.

**Import:** 38 cards absent from the catalog added to EDH, all with their French text; the import now quotes a name that contains double quotes (Henzie "Toolbox" Torre) between single quotes, which Scryfall requires; 0 color identity discrepancies with Scryfall.

**Cards (38, `edh/marioluigi.ts`; the three tri-lands in `edh/lands.ts`):** commanders: Bruse Tarl, Boorish Herder, Reyhan, Last of the Abzan; creatures: Abzan Falconer, Atla Palani, Nest Tender, Champion of Lambholt, Conclave Mentor, Dusk Legion Duelist, Ghave, Guru of Spores, Grenzo, Dungeon Warden, Henzie "Toolbox" Torre, Jirina Kudro, Kethis, the Hidden Hand, Kibo, Uktabi Prince, Kresh the Bloodbraided, Loyal Guardian, Mikaeus, the Lunarch, Saskia the Unyielding, The Balrog of Moria, Tuskguard Captain; planeswalkers: Jiang Yanggu, Wildcrafter, Samut, the Tested; artifacts and enchantments: Boros Signet, Golgari Signet, Cathars' Crusade, Elemental Bond, Greater Good, Invigorating Hot Spring, Mayael's Aria; lands: Gavony Township, Indatha Triome, Jetmir's Garden, Ziatora's Proving Ground; spells: Beast Within, Kazuul's Fury // Kazuul's Cliffs, Nature's Lore, Overwhelming Stampede, Single Combat.

- **Engine** (rules 178, details in `docs/engine.md`):
  - commander pairs (702.124): a deck rule read from the text (Partner, "Partner—[quality]", "Partner with [name]", Friends forever, "Choose a Background", "Doctor's companion"), the engine already keeping each commander apart (tax, commander damage); the deck editor's ♛ button adds a valid partner as the second commander instead of replacing the first; the backlog item "903 partner / background" is closed;
  - blitz (702.152) granted to spells (Henzie), with its reduction per commander cast; `amount.commanderCasts` (Jirina Kudro);
  - "choose a player" as it enters and `ref.chosenPlayer` (Saskia); the bottom card of a library (Grenzo); outlast read from the text (Abzan Falconer, Tuskguard Captain);
  - "creatures with power less than [this]'s can't block your creatures", compared at block time (Champion of Lambholt);
  - a `zoneChange` trigger from the battlefield keeps the permanent's last known information (Reyhan: its counters);
  - player effects "until the end of your next turn" for every player (Single Combat).
- **Tests:** `engine/test/edh-marioluigi.test.ts` (18, among them a game started with both partners and their separate taxes); `cards/test/commander-format.test.ts` (the pairs and their rules); EDH smoke test (788 cards).
- **Approximations:** Reyhan ("put into the command zone" only from the battlefield).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-mario-luigi`, against the fourteen other precons in turn): in a duel, 51.3% ± 6.9 (199 decided games out of 200, 19.7 turns); with four players (seats A, B, A, B, fair share 50%), 41.4% ± 9.7 (99 decided games out of 100, 48.6 turns). Within the target. One opposing decision took 4.2 s on a board at the 400-permanent cap (game 88 with four players). Strict fuzz with the precons clean. The bundle budget of the Commander chunk goes from 800 to 1,000 KB (841 KB with fifteen precons).
- **Personal art** (same day, at the user's request, like The Vision): Super Mario proxies, 99 images with meaningless file names, identified one by one (the real card name is in the subtitle of each proxy), copied with their card's name into `/home/dospu/MarioLuigi_cards` (cards at the top, `Tokens/`, `Extras/`; the original folder untouched) and prepared into `data/art/` together with `Nier_cards` (`tools/custom-art.ts` now takes several folders: alone, one folder would delete the other deck's images). Every card of the deck has its image, both faces of Kazuul's Fury included, and eight tokens (Banana, Beast, Cat Beast, Egg, Human Soldier, Saproling, Spirit, Treasure); the Spirit token keeps The Vision's image (a single image per token name, the first folder wins); six extras outside the list (the Archidekt sideboard: Greasewrench Goblin, Picnic Ruiner, Bulwark Ox prepared; Armorcraft Judge, Night's Whisper, Unnatural Restoration absent from the catalog). The precon takes `"art": "custom"` (its tile shows Mario). French names for the precons added this day (The Ur-Sphinx, Vivi Ornitier, Sephiroth, Mario & Luigi).
- **Art sets** (same day, at the user's request: tokens specific to each deck): each folder of `tools/custom-art.ts` is an art set (`Nier_cards=nier`, `MarioLuigi_cards=mario`, listed under `sets` in `manifest.json`, version 2); the printing key "custom:<set>" (engine: `customPrinting`, `customArtSet`) shows only that set's images, its tokens and its card back (without an image in its set, a card keeps Scryfall's); plain "custom" keeps the shared images. The view carries the set (`CardFace.customArt`, `PlayerView.customArt`: a string), the deck builder offers one "Custom illustration (set)" choice per set, `PROTOCOL_VERSION` 5. The Vision takes "custom:nier", Mario & Luigi "custom:mario": each deck its own Spirit token; the Mario folder has no card back, so a Mario player's hidden cards show the standard back.
- **Debt:** `Ref.chosenPlayer`, `cantBeBlockedByWeakerThan`, `bottom` (library) and `blitz` enter the baseline; ceilings BlockRule 14 → 15, Amount 35 → 36, Ref 35 → 36.

## Commander-only reprints (PLAN-L L2) ✅ (798 / 798)

Added on 2026-10-09 (PLAN-L, lot L2): the ten cards of `EXCLUDED_REPRINTS` (PLAN-G: left out of the reprint sets for a Commander-only mechanic) still missing from the catalog. They belong to no precon: the EDH import now adds the `EXCLUDED_REPRINTS` names to the decklists' (`tools/import-scryfall.ts`), so all fifteen are defined in EDH (the five others came with decks: Akroma's Will, Bruse Tarl, Command Beacon, Command Tower, Jeska's Will).

**Import:** 10 cards, all with their French text; 0 color identity discrepancies with Scryfall; nothing else in `edh.json` changed.

**Cards (10, `edh/partners.ts`):** partners Breeches, Brazen Plunderer, Dargo, the Shipwrecker, Ishai, Ojutai Dragonspeaker, Kraum, Ludevic's Opus, Malcolm, Keen-Eyed Navigator, Thrasios, Triton Hero, Tymna the Weaver, Vial Smasher the Fierce (Partner read from the text); Inalla, Archmage Ritualist (eminence, `fromCommand`); Yuriko, the Tiger's Shadow (commander ninjutsu).

- **Engine** (rules 186):
  - activated abilities from the command zone (`ActivatedAbilityDef.fromCommand`, the flag triggered and static abilities already had): commander ninjutsu (702.49d), "from your hand or the command zone" (`ninjutsu(cost, { commander: true })`); the hand shows the commander with its playable ability, as for a cast;
  - "one or more [creatures] deal damage to your opponents": the batched trigger keeps the players of every event of the batch, read by `ref.eventPlayers` (Breeches: "each of those opponents'", Malcolm: "for each opponent dealt damage");
  - `AdditionalCost.sacrificeToPay` becomes `{ filter, each }`: {2} less for each permanent sacrificed (Dargo; Rottenmouth Viper keeps {1}); a {2} sacrifice used for the last {1} pays only {1} (a reduction never leaves mana in the pool).
- **Tests:** `engine/test/edh-partners.test.ts` (17: the pairs, each card's Oracle text, Dargo's two reductions and the empty pool, Inalla from the command zone, Yuriko's commander ninjutsu from the command zone and from the hand); EDH smoke test (798 cards).
- **Approximations:** none.
- **Debt:** `sacrificeToPay` and `each` leave the single-card keys (two cards each); ceilings ActivatedAbilityDef 17 → 18, Ref 36 → 37.

## Deck Tevesh Szat & Jeska: Demons ✅ (834 / 834)

Added on 2026-10-10 at the user's request with the "Add a Commander deck" recipe. List: "Tevesh Szat + Jeska - My Demonic Signature Deck" by Kronic_EDH_Vet on Moxfield (updated 2026-10-04, read through the Moxfield API), in `docs/commander/decks/tevesh-jeska.txt`; precon `cmd-tevesh-jeska` (black and red), bracket 4 (four Game Changers: Demonic Tutor, Jeska's Will, Mana Vault, Vampiric Tutor). Two partner commanders, Tevesh Szat, Doom of Fools (already playable, Sephiroth deck) and Jeska, Thrice Reborn; 49 other cards were already playable. The Moxfield sideboard (Jeweled Lotus and Mana Crypt, banned) and maybeboard (13 cards) are not imported.

**Import:** 36 cards absent from the catalog added to EDH; French text from Scryfall except two old printings without one (Hellfire, Legends; Soul Exchange, Fallen Empires: never printed in French), completed by hand in `french-overrides.json`; 0 color identity discrepancies with Scryfall.

**Cards (36, `edh/teveshjeska.ts`; Tainted Peak in `edh/lands.ts`):** commander: Jeska, Thrice Reborn; creatures: Abyssal Persecutor, Anger, Bloodthirster, Demon of Death's Gate, Falthis, Shadowcat Familiar, Herald of Slaanesh, Kardur, Doomscourge, Orcus, Prince of Undeath, Rakdos, the Showstopper, Reaper from the Abyss, Shadowborn Demon, Shadowgrange Archfiend; enchantments: Animate Dead, Bitter Reunion, Rite of Belzenlok; lands: Maze of Ith, Tainted Peak, Volrath's Stronghold, Wasteland, Westvale Abbey // Ormendahl, Profane Prince; spells: Buried Alive, Chaos Warp, Dread Return, Hellfire, Infernal Grasp, Kindred Dominance, Night's Whisper, Promise of Power, Seize the Spotlight, Sign in Blood, Soul Exchange, Stinging Study, Temur Battle Rage, Tibalt's Trickery, Vandalblast.

- **Engine** (rules 194, details in `docs/engine.md`):
  - Auras that enchant a card in a graveyard (`enchant.graveyard`, Animate Dead): the spell targets the card, which returns under the Aura's controller as the Aura enters attached to it, the creature linked to the Aura ("when it leaves, sacrifice that creature");
  - static abilities that work from the graveyard (`staticAbility(…, { fromGraveyard })`, 113.6: Anger);
  - an alternative cost that sacrifices several permanents (`AltCostPay.sacrificeCount`, Demon of Death's Gate; `AltCostPay.sacrifice { filter, count }` since PLAN-M M3a);
  - a coin for each object (`fx.coinFlipEach`, Rakdos, the Showstopper: the objects whose coin comes up tails are stored);
  - P/T counters other than +1/+1 and −1/−1 (122.1a: "+2/+2" of Soul Exchange) count in layer 7c;
  - the filter of discover and cascade is resolved during the resolution (`withX`), and `withX` resolves a designated object inside `not` (Tibalt's Trickery: "with a different name than that spell");
  - entwine is written with `escalate` (Promise of Power: both modes for {4} more), and the Oracle test of modal spells counts the extra mode.
- **Tests:** `engine/test/edh-tevesh.test.ts` (39: each card's Oracle text, among them Animate Dead and its sacrifice when it leaves, Anger in and out of the graveyard, Jeska's loyalty from the commander casts, Orcus's two modes, the free cast offered by Tibalt's Trickery to the spell's controller); EDH smoke test (834 cards).
- **Approximations:** Animate Dead (reanimation during the resolution; entering without being cast, it stays in its zone), Jeska (opponents read from the creature's controller), Kardur (its attack requirements are a goad), Stinging Study (the greatest commander mana value), Tibalt's Trickery (a three-sided roll; cascade prompt), Demon of Death's Gate (the sacrificed creatures are chosen by the engine).
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-tevesh-jeska`, against the fifteen other precons in turn): in a duel, 55.5% ± 6.9 (200 games, 21.3 turns); with four players (seats A, B, A, B, fair share 50%), 42.7% ± 9.9 (96 decided games out of 100, 2 draws and 2 unfinished, 63.6 turns). Within the target, but the four-player games are long (the other decks: 42 to 49 turns; likely Abyssal Persecutor, which keeps opponents from losing and which the AI does not sacrifice on purpose). Slowest decision: 6.5 s, an opponent at 116 permanents with four players.
- **Debt:** `graveyard` (enchant) and `sacrificeCount` enter the baseline; `notDefendersAttackedThisTurn` leaves it (Port Razer and Bloodthirster); ceiling Effect (fields) 647 → 648 (`coinFlip.each`).

## Deck Deadpool: chaos ✅ (872 / 872)

Added on 2026-10-10 at the user's request with the "Add a Commander deck" recipe. List: "Deadpool, Commander Deck" by ReallyBadWizard on Moxfield (updated 2026-10-04, read through the Moxfield API), in `docs/commander/decks/deadpool.txt`; precon `cmd-deadpool` (black and red), bracket 3 (three Game Changers: Ancient Tomb, Jeska's Will, Opposition Agent). The Moxfield sideboard (four cards) and maybeboard are not imported. 48 cards were already playable. The rules of Deadpool's exchange come from the Oracle text and the Comprehensive Rules (612, 613.1c, 707.2): Scryfall has no ruling, and the Reddit guide the user pointed to ("Deadpool, Trading Card — everything you need to know") could not be read (Reddit refuses automated access); EDHREC's article on the commander was used for the copies.

**Import:** 38 cards absent from the catalog added to EDH; French text from Scryfall except five cards completed by hand in `french-overrides.json`: Deadpool, Trading Card (Secret Lair), Olinda the Oblivious and Slicer (both faces) were never printed in French; Karn, Silver Golem and Xenic Poltergeist (old printings) have a French name only. The import now keeps the multi-word creature types whole (The Master, Multiplied: "Time Lord"). 0 color identity discrepancies with Scryfall.

**Cards (38, `edh/deadpool.ts`):** commander: Deadpool, Trading Card; creatures: Alexios, Deimos of Kosmos, Dalek Squadron, Delina, Wild Mage, Elturel Survivors, Gogo, Mysterious Mime, Humble Defector, Jaxis, the Troublemaker, Karn, Silver Golem, Life of the Party, Oft-Nabbed Goat, Olinda the Oblivious, Opposition Agent, Orthion, Hero of Lavabrink, Pinnacle Monk // Mystic Peak, Slicer, Hired Muscle // Slicer, High-Speed Antagonist, The Master, Multiplied, Vislor Turlough, Xantcha, Sleeper Agent, Xenic Poltergeist; artifacts and enchantments: Blade of Selves, Changing Loyalty, Conjurer's Closet, Echoing Assault, Golden Argosy, Mirror Box, Possibility Storm, Share the Spoils, Warstorm Surge; spells: Disrupt Decorum, Ensnared by the Mara, Hagra Mauling // Hagra Broodpit, Mana Geyser, Mob Verdict, Prisoner's Dilemma, Saw in Half, Sundering Eruption // Volcanic Fissure, Tempt with Mayhem.

- **Engine** (rules 195, details in `docs/engine.md`):
  - Deadpool's exchange of text boxes (612, layer 3): `LayerMods.textOf`, chosen as he enters (`fx.exchangeTextBox`), each taking the other's text box as it is for as long as it stays on the battlefield; the text taken brings its abilities, keywords and characteristic-defining abilities (its "enters" abilities trigger as Deadpool enters), not the name, types or P/T; not copiable (707.2: a token copy of Deadpool has his printed text and exchanges in turn). Interface: the preview shows the text box the permanent has ("Text box of …"), and a badge marks it on the battlefield;
  - abilities that other players may activate (602.2, `activators`: Xantcha, Oft-Nabbed Goat); a permanent that enters under the control of a chosen opponent (Xantcha); "can't attack its owner" (Alexios, Xantcha);
  - The Master, Multiplied: your triggered abilities can't make you sacrifice or exile your creature tokens (myriad, "sacrifice it at the next end step"); Opposition Agent: you choose what your opponents find, the cards are exiled with it and you may play them with any mana;
  - token copies with P/T amounts (Saw in Half: half, rounded up) or attacking a given player; "when a player plays a card exiled with this" (Share the Spoils); "+1/+1 for each other creature with the same name" (Mirror Box);
  - bug fixed: a `modify` effect whose P/T is an amount (Karn, Silver Golem: the mana value) evaluated it after invalidating the characteristics cache, which then stayed stale without the effect;
  - bug found by the chaos fuzz (older than this deck: the seventeenth precon only changed the pairings): a decision announcing X = 10⁹ for a squad spell (Endless Foot Assault, Turtle Power!) built a cost of a billion symbols, and the payment solver ran out of memory before refusing it; an announced X above a million is now refused (`MAX_X`, `limits.ts`).
- **Tests:** `engine/test/edh-deadpool.test.ts` (42: the exchange and its triggers, the exchange that lasts after Deadpool leaves, a token copy of Deadpool that exchanges in turn, each card's Oracle text, Opposition Agent's search chosen by its controller, Possibility Storm's free spell, the votes of Mob Verdict and the three outcomes of Prisoner's Dilemma); EDH smoke test (872 cards); `engine/test/limits.test.ts` (the X cap); one-off interface script `tools/textbox-smoke.ts` (the badge and the preview of an exchanged text box, screenshots in `test-results/textbox/`).
- **Approximations:** Elturel Survivors, Echoing Assault, Possibility Storm, Mob Verdict and Prisoner's Dilemma (choices one after the other), Vislor Turlough, Slicer ("More Than Meets the Eye" not handled), Delina (ten rolls at most), Xenic Poltergeist, Sundering Eruption, Share the Spoils, Opposition Agent.
- **Balance** (medium AI on both sides, `--by-deck --deck cmd-deadpool`, against the sixteen other precons in turn): in a duel, 24.5% ± 6.0 (200 games, 17.9 turns); with four players (seats A, B, A, B, fair share 50%), 48.5% ± 9.8 (99 decided games out of 100, 35.5 turns). Within the target with four players, far under it in a duel: a chaos deck whose gifts (Xantcha, Humble Defector, Life of the Party, Share the Spoils, Vislor Turlough) all go to the single opponent in a duel; to study in the AI first (Deadpool's exchange, the gifts), the list is not touched. Slowest decision: 3.9 s, an opposing declare-blockers step at 124 permanents with four players.
- **Debt:** player statics `searchControl` and `tokenShield`, operation `exchangeTextBox`, keys `perSameName` and `control` enter the baseline; ceilings ActivatedAbilityDef 18 → 19, LayerMods 29 → 31, Effect 147 → 148, Effect (fields) 648 → 650, TriggerSpec (fields) 145 → 146.

## PLAN-M M1: bugs (rules 196)

- **Printed blitz** (702.152) is read from the text (`scryfall.ts`, `altCost` with `via: "blitz"`), like dash: haste, "when this creature dies, draw a card" and the sacrifice at the next end step come from the cast, as for Henzie's granted blitz. Jaxis, the Troublemaker (its only printed user) can now be cast for {1}{R}.
- **Monstrosity** (701.37) as a generic form: `fx.monstrosity(n)` (op `monstrosity`: if the source isn't monstrous, N +1/+1 counters, then it becomes monstrous, even with N = 0), the `GameObject.monstrous` designation (not a counter: proliferate doesn't touch it; shown by a "Monstrous" badge, `ObjectView.monstrous`), the "becomes monstrous" action trigger (`when.becomesMonstrous`, `ActionEvent` `monstrous`). The ability can be activated again; it then does nothing (701.37c). Alpha Deathclaw ("enters or becomes monstrous: destroy target permanent") and Maester Seymour (X counted on resolution) use it, like Grim Giganotosaurus (REX).
- **Possibility Storm:** the spell is exiled first (its card types read on the stack), then goes to the bottom with the other exiled cards in a random order (`discover.exileFirst`), as the official ruling says; it no longer stays in exile.
- **Tests:** `edh-deadpool.test.ts` (+2: Jaxis cast for blitz; Possibility Storm, the card not cast and the spell on the bottom), `edh-mutant.test.ts` (+1: Alpha Deathclaw), `edh-singles2.test.ts` (Maester Seymour activated again), `rex.test.ts` (+1: proliferate and a second activation).
- **Debt:** `exileFirst` enters the baseline; ceilings GameObject 50 → 51, Effect 148 → 149, Effect (fields) 650 → 653, Single-card values 131 → 132 (`via: "blitz"`, Jaxis).
