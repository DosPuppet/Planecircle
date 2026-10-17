# Teenage Mutant Ninja Turtles (TMT, 188 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-02, after Marvel's Spider-Man and before The Hobbit. 12 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): Sneak (read from the text, alternative cost by returning an unblocked attacker), Mutagen tokens, Classes... The set follows the integration rules of CLAUDE.md (debt, R1, R7). Split: one sublot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Groundwork: tokens | 0 |
| Cards doable with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendary and unique cards | C and following |

Scripts are in `packages/cards/src/tmt/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi` and `artifacts` (colorless cards and lands). Helpers are in `tmt/common.ts`.

## Sublot 0: groundwork ✅ (12 / 188)

- **Tokens:** Mutant 2/2 red, Ninja 1/1 black, Robot 1/1 colorless (artifact), Insect Warrior 1/1 black, Dinosaur Soldier 2/2 white; Mutagen and Ninja Turtle Spirit already existed; Rat, Food and Treasure come from the common ones.
- **Engine:** "if its Sneak cost was paid" is also read on the permanent (`cond.castVia("sneak")`, like Web-slinging and chaos).
- **Tests:** smoke test `ai/test/smoke/tmt.test.ts`.

## Sublot A1: white cards ✅ (38 / 188)

- **Cards (26):** Action News Crew, Agent Bishop, Man in Black, April O'Neil, Kunoichi Trainee, Dimensional Exile, East Wind Avatar, Featherbrained Filcher, Grounded for Life, Hamato Guardian Stance, High-Flying Ace, Jennika, Bad Apple Big Sister, Koya, Death from Above, Leader's Talent, Leonardo, Big Brother, Leonardo, Cutting Edge, Leonardo, Leader in Blue, Leonardo, Sewer Samurai, Leonardo's Technique, Lita, Little Orphan Amphibian, Mighty Mutanimals, Prehistoric Pet, Quintessential Katana, Sally Pride, Lioness Leader, Triceraton Commander, Turncoat Kunoichi, Turtles Forever, Uneasy Alliance.
- **Engine:** nothing new.
- **Gap found:** Sneak was not playable for a creature or a sorcery (no casting window, no tapped-and-attacking arrival); fixed in sublot B1, where the two disabled tests (Leonardo, Leader in Blue; Turncoat Kunoichi) are re-enabled.
- **Tests:** 37 rules tests ("lot A, white"); The Ooze: one Mutagen per +1/+1 counter on a creature that leaves (the note saying it was untestable was outdated).

## Sublot A2: blue cards ✅ (62 / 188)

- **Cards (24):** April, Reporter of the Weird, Bespoke Bō, Buzz Bots, Crustacean Commando, Does Machines, Donatello, Gadget Master, Donatello, Mutant Mechanic, Donatello, Turtle Techie, Donatello, Way with Machines, Donatello's Technique, Kitsune, Dragon's Daughter, Kitsune's Technique, Krang, Master Mind, Metalhead, Mind Transfer Protocol, Ooze Spill, Ray Fillet, Man Ray, Renet, Temporal Apprentice, Retro-Mutation, Return to the Sewers, Sewer-veillance Cam, Stockman, Mad Fly-entist, Turtles in Time, Utrom Scientists.
- **Engine fix:** a trigger whose targets must be "controlled by different players" has no legal target when all the possible creatures belong to the same player (603.3d); it asked for an impossible choice (Kitsune, Dragon's Daughter, found by the fuzz; test in `rulings.test.ts`).
- **Debt:** "shuffle hand and graveyard into library, then draw" is also used by Turtles in Time: its entry is removed.
- **Left for later:** April O'Neil, Hacktivist (distinct types among the spells cast this turn), Fugitive Droid (target a spell that targets your permanents), Mondo Gecko (hexproof from a chosen color).
- **Tests:** 32 rules tests ("lot A, blue") and one in `rulings.test.ts`.

## Sublot A3: black cards ✅ (86 / 188)

- **Cards (24):** Anchovy & Banana Pizza, Armaggon, Future Shark, Bebop, Warthog Warrior, The Cloning of Shredder, Death in the Family, Foot Mystic, Insectoid Exterminator, Lord Dregg, Insect Invader, Madame Null, Power Broker, Oroku Saki, Shredder Rising, Pain 101, Paramecia Coloniex, Savanti Romero, Time's Exile, Shark Shredder, Killer Clone, Shredder, Unrelenting, Shredder's Armor, Shredder's Revenge, Shredder's Technique, South Wind Avatar, Splinter, Hamato Yoshi, Splinter's Technique, Stomped by the Foot, Super Shredder, Tunnel Rats.
- **Engine:** nothing new.
- **Left for later:** Ninja Teen (at level 3, Sneak given to creature cards in the graveyard), Rat King, Verminister ("the targeted card and all other cards with the same name").
- **Tests:** 29 rules tests ("lot A, black").

## Sublot A4: red cards ✅ (111 / 188)

- **Cards (25):** Bot Bashing Time, Broadcast Takeover, Casey Jones, Jury-Rig Justiciar, General Traag, Heart of Stone, Hard-Won Jitte, Improvised Arsenal, Jennika's Technique, Manhole Missile, Mouser Attack!, Mouser Foundry, Mutant Town Musicians, Null Group Biological Assets, Old Hob, Alleycat Blues, Purple Dragon Punks, Raphael, Most Attitude, Raphael, Ninja Destroyer, Raphael, the Nightwatcher, Raphael, Tough Turtle, Raphael's Technique, Ravenous Robots, Rock Soldiers, Slash, Reptile Rampager, Spicy Oatmeal Pizza, Wingnut, Bat on the Belfry, Zog, Triceraton Castaway.
- **Engine:** nothing new. "Discard your hand, then draw seven cards" is also used by Raphael's Technique: the `mayWheel` debt entry is removed; the Oracle <-> script audit notes it as an equivalence (seven cards by construction).
- **Tests:** 34 rules tests ("lot A, red").

## Sublot A5: green cards ✅ (135 / 188)

- **Cards (24):** Courier of Comestibles, Cowabunga!, Frog Butler, Groundchuck & Dirtbag, Guac & Marshmallow Pizza, Michelangelo, Game Master, Michelangelo, Improviser, Michelangelo, Mutant BFF, Michelangelo, Weirdness to 11, Mona Lisa, Science Geek, Mutant Chain Reaction, New Generation's Technique, Novel Nunchaku, Party Dude, Primordial Pachyderm, Ragamuffin Raptor, Rocksteady, Crash Courser, Saved by the Shell, Tenderize, Transdimensional Bovine, Turtle Power!, Venus, Torn Between Worlds, West Wind Avatar, Zoo Escapees.
- **Engine:** nothing new (Groundchuck & Dirtbag: the triggered mana ability is a mana replacement, like Badgermole Cub; intentional gap in `audit-baseline.json`).
- **Tests:** 33 rules tests ("lot A, green").

## Sublot A6: multicolor and colorless cards, and lands ✅ (180 / 188)

- **Multicolor cards (29):** Baxter Stockman, Bebop & Rocksteady, Brilliance Unleashed, Dark Leo & Shredder, Don & Leo, Problem Solvers, EPF Point Squad, Foot Elite, Foot Ninjas, Genghis Frog, Go Ninja Go, Ice Cream Kitty, Karai, Future of the Foot, Karai's Technique, Krang & Shredder, The Last Ronin, Lessons from Life, Mechanized Ninja Cavalry, Mikey & Leo, Chaos & Order, Mouser Mark III, The Neutrinos, Nobody, Pizza Face, Gastromancer, Putrid Pals, Raph & Leo, Sibling Rivals, Raph & Mikey, Troublemakers, Slithering Cryptid, Splinter, Radical Rat, Tainted Treats, Tokka & Rahzar, Terrible Twos.
- **Colorless cards and lands (16):** Chrome Dome, Everything Pizza, Henchbots, Krang, Utrom Warlord, Omni-Cheese Pizza, Technodrome, Turtle Blimp, Turtle Van, Weather Maker, Dimension X, Foot Headquarters, Illegitimate Business, Mutant Town, Northampton Farm, TCRI Building, Turtle Lair.
- **Engine:** nothing new.
- **Left for later:** Don & Raph, Hard Science (affinity for artifacts given to the next noncreature spell), Mikey & Don, Party Planners (one more counter for a creature cast from the top of the library), North Wind Avatar (a card outside the game).
- **Tests:** 63 rules tests ("lot A, multicolor" and "lot A, colorless and lands"); Karai's sneaked branch is simulated until sublot B1.

## Sublot B1: Sneak ✅ (180 / 188)

- **Engine:**
  - Sneak (702.190a) is cast at the declare blockers step, when you have priority, for a creature or a sorcery too (`sneakTiming`); outside its usual timing, the option offers only the Sneak cost;
  - the unblocked attacker to return is a choice (`bounce` in the decision, `altBounce` in the option, the weakest by default; the interface window also serves Web-slinging);
  - a sneaked permanent arrives tapped and attacking what the returned creature was attacking;
  - `RULES_VERSION` = 55, golden games regenerated.
- **Tests:** 2 rules tests ("lot B1"); the two disabled tests of lot A (Leonardo, Leader in Blue; Turncoat Kunoichi) are re-enabled and Karai is really sneaked.

## Sublot C1: unique cards ✅ (188 / 188)

- **Cards (8):** April O'Neil, Hacktivist, Fugitive Droid, Mondo Gecko, Ninja Teen, Rat King, Verminister, Don & Raph, Hard Science, Mikey & Don, Party Planners, North Wind Avatar.
- **Engine:**
  - turn log: `distinctTypes` (different card types among the spells cast);
  - target "spell that targets [a matching permanent]" (`spellsTargeting`);
  - an effect "becomes the chosen color and gains hexproof from it" freezes the chosen color (each activation keeps its own); protection also reads a "chosen" filter (`resolveFilter`);
  - Sneak given from the graveyard (`playFrom.sneak`, Ninja Teen);
  - next-spell cost reduction (`nextSpell.reduce`, affinity for artifacts); counters on a creature spell cast from the top of the library (`playFrom.counters`);
  - sacrifice as a cost that can include the source (`sacrificeOther.includeSelf`); `ref.sameNameInGraveyard` (the card and its namesakes);
  - approximations lifted: "each opponent exiles until..." applies to each designated player (Krang & Shredder); "half, rounded up" in a single mill (`fx.millHalf(…, true)`, Kitsune's Technique);
  - `RULES_VERSION` = 56, golden games regenerated.
- **Approximations:** North Wind Avatar (no "outside the game" zone, lifted in rules 209); Ninja Teen (the attacker returned by the granted Sneak is the weakest).
- **Tests:** 8 rules tests ("lot C1").

## PLAN-M M8b (rules 200)

- **Renet, Temporal Apprentice:** "entered this turn" on the battlefield is the arrival logged in the turn log with the new object's id (`enteredThisTurn`, `turnlog.ts`), not `controlledSince`: a change of control is no longer an arrival (power-up "if he entered this turn", Cloudspire Coordinator and the other `enteredThisTurn` filters too). Test added.

## Outside the game: the sideboard (rules 209)

- **Engine:** the sideboard is a hidden zone of its owner (`sideboard`, `PlayerState.sideboard`, 400.11b), filled from `PlayerSetup.sideboard` after every deck (a game without one is numbered and shuffled as before), kept by the record (`GameRecord.players[].sideboard`), hidden like the hand (`filterEvents`, `determinize`), emptied when its owner leaves (800.4a); `fx.pickFromZone("sideboard", …)` takes a card from it. Online and against the AI, the deck's sideboard (only its cards the engine plays, `sideboardInGame`) is the one of the current game (after a BO3 swap); none in Commander.
- **Forms:** `fx.pickFromZone("sideboard", …)`, `ref.zone("sideboard", who, filter)` (choices among cards held outside the game, `chooseAmong`), `fx.search(…, { alsoFrom: ["sideboard"] })` ("your library and/or outside the game").
- **North Wind Avatar:** "you may put a card you own from outside the game into your hand" picks from the sideboard (none: nothing happens); the opponent's log says only that a card came from outside the game.
- **Turtles Forever:** the search offers the legendary creature cards of the sideboard with the library's; the four are revealed; the two not chosen are shuffled into the library, a sideboard card too (Oracle). Still approximated: "exactly four".
- **Extrapolate the Impossible (FRA):** see `docs/extensions/fra.md`.
- **Tests:** 5 rules tests (North Wind Avatar: the pick, hidden from the opponent, declined; setup, record, replay, elimination; Turtles Forever from the sideboard; Extrapolate the Impossible: two tests in `fra.test.ts`).
