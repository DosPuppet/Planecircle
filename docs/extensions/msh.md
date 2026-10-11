# Marvel Super Heroes (MSH, 271 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-02, after Avatar: The Last Airbender. 20 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): power-up (`activated({ powerUp: true })`), teamwork (read from the text, a kicker "tap creatures with total power N"), harness (`fx.harness`, `cond.harnessed`), equip worthy, Doombot… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Breakdown: one sub-lot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Foundation: tokens | 0 |
| Cards feasible with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendaries and unique cards | C and following |

The scripts are in `packages/cards/src/msh/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless cards and lands) and `legends`. The helpers are in `msh/common.ts`.

## Sub-lot 0: foundation ✅ (20 / 271)

- **Tokens:** 2/1 black Villain with menace, 3/2 white Hero with vigilance, 2/2 colorless Villain Robot (artifact), 0/4 colorless Wall with defender, 1/1 green Insect, 1/1 blue Merfolk; Doombot existed; Soldier, Clue, Treasure and Food come from the commons.
- **Engine:** nothing new.
- **Tests:** smoke test `ai/test/smoke/msh.test.ts`.

## Sub-lot A1: white cards ✅ (52 / 271)

- **Cards (32):** Agent 13, Sharon Carter, Agent Phil Coulson, Agents of S.H.I.E.L.D., Avengers Assemble!, Borough Backup, Brave Brawler, Captain America, Wings of Freedom, Captain Mar-Vell, Space-Born, Colleen Wing, Street Samurai, Crowd of True Believers, Helicarrier Strike, Hero in Training, Invisible Woman, Sue Storm, Luke Cage, Power Man, Mockingbird, Ace Agent, Monica Rambeau // Photon, Living Light, Murdock's Crusade, Nick Fury, Agent of S.H.I.E.L.D., Night Nurse, Healer of Heroes, Okoye, Dora Milaje Leader, Origin of the Avengers, Panther Pounce, Patriot, Shield Wielder, Quake, Agent of S.H.I.E.L.D., Raft Security Officer, Red Guardian, Super-Soldier, The Sentry, Golden Guardian (The Void token), S.H.I.E.L.D. Spy Kit, Super Villain Lockup, Super-Soldier Serum, Wakandan Drone Flock, White Widow, Free Agent.
- **Engine:** nothing new ("both if teamwork was paid": a mode under `cond.kicked`; conditional flash through `playerStatic({ flashFor })`).
- **Left for later:** Agent Maria Hill (tapped to pay a teamwork), Captain America, Super-Soldier (shield counter).
- **Tests:** 35 rules tests ("lot A, white").

## Sub-lot A2: blue cards ✅ (86 / 271)

- **Cards (34):** Aerial Doombot, A.I.M. Scientists, Atlantean Cavalry, Atlantis Attacks, Attuma, Atlantean Warlord, Bold Biochemist, Bruce Banner // The Incredible Hulk, Depower, Echo, Perceptive Prodigy, Falcon, Winged Wonder, Falcon's Wing Harness, Frozen in Ice, Futurist Forge, Giant-Sized Flying Ant, Hydraulic Helper, I Am Iron Man, Iron Lad, Diverging Destiny, Justice, Vance Astrovik, Kang the Conqueror, Mister Fantastic, Reed Richards, Ms. Marvel, Kamala Khan, Multiversal Incursion, Pym Particles, Rewrite History, Secret Invasion, S.H.I.E.L.D. Deployment Drone, S.H.I.E.L.D. Flying Car, Shuri, Wakandan Inventor, Stature, Size Shifter, Super Intelligence, Super Suit, Thirst for Knowledge, Tony Stark // The Invincible Iron Man, Wiccan, Rising Magician.
- **Engine:** nothing new. Connive now serves several cards: its debt entry is removed.
- **Left for later:** Ironheart, Clever Champion (improvise), Kid Loki ("creatures you put counters on this turn" in a static ability), Leader, Super-Genius (connive replacement), Loki, God of Mischief (an ability that targets), Namor the Sub-Mariner (blue symbols in a spell's cost), Trickster's Stratagem (second from the top).
- **Tests:** 40 rules tests ("lot A, blue").

## Sub-lot A3: black cards ✅ (120 / 271)

- **Cards (34):** Agents of HYDRA, Arnim Zola, Bio-Fanatic, Baron Strucker, HYDRA Overlord, Construct a Cosmic Cube, Crossbones, Malicious Mercenary, Cruel Alliance, Dark Deed, Decoy Ploy, Doom Reigns Supreme, Elektra, Daughter of the Hand, Grim Reaper, Lethal Legionnaire, Hour of Defeat, HYDRA Infiltration, HYDRA Troopers, Kingpin's Enforcers, Madame Masque, The Masters of Evil, Moonstone, Harsh Mistress, Ninja of the Hand, Project Deathlok Soldier, Red Room Recruit, Robot Domination, Ronin, Shadow Stalker, Roxxon Brutes, Stolen Stark Tech, Super-Skrull, Swordsman, Sharp Scoundrel, Thunderbolts Conspiracy, Too Evil to Stay Dead, Unliving Legionnaire, Visions of Villainy, Whiplash, Vengeful Engineer, Widow's Bite, Yellowjacket, Heartless Marauder.
- **Engine fix:** the trigger "[cards] put into a zone" (`when.zoneChange`) respects `nontoken` and `token`: a token is not a card. Moonshadow (ECL, "permanent cards") is fixed; test drawn from the rules in `rulings.test.ts`.
- **Left for later:** Baron Helmut Zemo (boast and cost in black symbols), Black Widow, Super Spy (exile until a card in another player's library), Klaw, Sonic Subjugator (discard after a partial reveal).
- **Rules version:** 46.
- **Tests:** 41 rules tests ("lot A, black") and 1 test drawn from the rules.

## Sub-lot A4: red cards ✅ (147 / 271)

- **Cards (27):** Crimson Operative, Death to Our Enemies, Fin Fang Foom, Hawkeye, Master Marksman, Hawkeye's Bow, Hex Magic, Hire a Crew, HULK SMASH!, Human Torch, Johnny Storm, HYDRA Assault Robot, Iron Fist, Living Weapon, Jessica Jones, Private Eye, K'un-Lun Warrior, Machinesmith Automaton, Misty Knight, Hero for Hire, Photon Blast Barrage, Quicksilver, Brash Blur, Red Hulk, Repulsor Blast, The Scarlet Witch, Speed, Young Avenger, Stark Industries Executive, Super Speed, Team Tactics, Truck Toss, Vision of Love, Volcanic Villain.
- **Engine:** nothing new (enchantments with plan counters like Political Triumph, spell copies with new targets, "can be blocked only by creatures with haste").
- **Left for later:** Evil's Thrall (control until the end of your next turn), Hawkeye, Young Avenger (damage increased by the source's power), Loki Laufeyson ("the next spell with mana value at most its power"), Wonder Man, Hollywood Hero (reactivate a power-up).
- **Tests:** 34 rules tests ("lot A, red").

## Sub-lot A5: green cards ✅ (180 / 271)

- **Cards (33):** Ant-Man's Army, Call Damage Control, Claim the Kingdom, Doc Samson, Super Psychiatrist, Earth's Mightiest Heroes, Epic Fight, Go Nuts!, Guerrilla Gorilla, Hellcat, Undying Vigilante, Hercules, Prince of Power, Heroic Feast, Hulkling, Burgeoning Bruiser, Ka-Zar of the Savage Land, Knight of Wundagore, Mister Hyde, Monster Within, Mole Man, Moloid Master, Pet Avengers, Punishing Punch, Rapid Rescue, Reptil, Dinomorpher, Restorative Technique, Rick Jones, Destined Sidekick, Serpent Specialist, She-Hulk, Jade Defender, Super Strength, The Thing, Ben Grimm, Tigra, Feline Fury, Training Regimen, The Unbeatable Squirrel Girl, Undercover Skrull, Wakandan Royal Guard, White Tiger, Ava Ayala, World War Hulk.
- **Engine:** nothing new (Doc Samson's counter replacement on the `eventReplacement` frame, lands played from the library and the graveyard, Reptil's base P/T and replaced types).
- **Left for later:** Shang-Chi, Master of Kung Fu (activate as though they had haste), Powerful Broker (proliferate limited to one target).
- **Tests:** 40 rules tests ("lot A, green").

## Sub-lot A6: multicolor, colorless and lands ✅ (240 / 271)

- **Multicolor (30):** Abomination, Terrifying Titan, Alien Invasion, Ant-Man, Colony Commander, Armor Wars, Avengers: Under Siege, Beast, Erudite Aerialist, Black Panther, Vanguard, Black Widow, Double Agent, Bullseye, Death Dealer, Cloak and Dagger, Entwined, The Coming of Galactus, Daredevil, Man Without Fear, Ghost, Spectral Saboteur, Iron Man, Master of Machines, Kang, Temporal Tyrant, Killmonger, Scourge of Wakanda, King T'Challa // Black Panther, Hope Enduring, The Kingpin of Crime, Madame Hydra, The Mighty Thor, Jane Foster, Moon Girl and Devil Dinosaur, Speedball, New Warrior, Spider-Man, To the Rescue, Spider-Woman, Secret Agent, The Super Hero Civil War, Thanos, the Mad Titan, U.S.Agent, John Walker, Vision Quest, War Machine, Legacy of Iron, Winter Soldier, Icy Assassin.
- **Colorless and lands (30):** A.I.M. Synthoids, Captain America's Shield, Cosmic Cube, Dependable Quinjet, H.E.R.B.I.E. Scout Unit, Iron Man Armor, S.H.I.E.L.D. Helicarrier, The Ten Rings, Ultron, Artificial Malevolence, Ultron Drone, Vibranium Energy Daggers, The Vision, Viv Vision, Teen Synthezoid, A.I.M. Labs, Asgardian Citadel, Avengers Hangar, Avengers Tower, Baxter Building, Birnin Zana Plaza, Dark Fortress, Fisk Tower, Gathering Place, Hell's Kitchen, Los Diablos Missile Base, Pym Technologies, Stark Industries, Subterranean Cavern, Surveillance Room, Training Compound, Villainous Hideout.
- **Engine fixes (tests drawn from the rules in `rulings.test.ts`):**
  - the last known information of a permanent is taken before its removal from combat (506.4): "when an attacking creature dies" finally triggers;
  - an Equipment that becomes a creature becomes unattached (301.5c, 704.5n): animated Iron Man Armor;
  - a card from the library cast by a permission ("cast it now") follows the permission's timing;
  - P/T defined by an ability read "legendary" in their filters.
- **Debt:** control "for as long as [the source]" (`gainControlWhileSource`) now serves several cards: its entry is removed.
- **Left for later:** Ares, God of War, Absorbing Man, Taskmaster, The Astonishing Ant-Man, Captain America, Living Legend, Hulk, Gamma Goliath, The Ruinous Wrecking Crew, Scientist Supreme of A.I.M., The Serpent Society, Storm, Windrider, Titania, Rugged Rumbler, Worlds Within Worlds, Arc Reactor, Super-Adaptoid.
- **Rules version:** 47.
- **Tests:** 34 rules tests ("lot A, multicolor"), 24 ("lot A, colorless and lands") and 3 tests drawn from the rules.

## Sub-lot B1: improvise ✅ (242 / 271)

- **Cards (2):** Arc Reactor, Ironheart, Clever Champion.
- **The engine gains:** improvise (702.126), read from the text (`improvise` keyword): when paying the spell, each untapped artifact can pay {1} of the generic cost (mana solver source, like waterbend, with no cap); it can also be given to the player's spells (`playerStatic({ spellKeywords: { filter, keywords: ["improvise"] } })`, Ironheart: "your noncreature spells").
- **Rules version:** 48.
- **Tests:** 2 rules tests ("lot B1").

## Sub-lot B2: shield counters and tapping ✅ (245 / 271)

- **Cards (3):** Captain America, Super-Soldier, Agent Maria Hill, Captain America, Living Legend.
- **The engine gains:**
  - shield counters (122.1c), the counter rule applied by the engine: a permanent that would be dealt damage or be destroyed loses a shield counter instead (a replacement, not a prevention);
  - the tap event carries its cause (`cause: "teamwork"`: tapped to pay a teamwork) and says whether it is the first tapping of the turn (`tapsThisTurn`); the trigger `{ on: "taps", cause, firstThisTurn }`.
- **Rules version:** 49.
- **Tests:** 4 rules tests ("lot B2").

## Sub-lot B3: power-up ✅ (247 / 271)

- **Cards (2):** Hulk, Gamma Goliath, Wonder Man, Hollywood Hero.
- **The engine gains:**
  - `abilityCost: { ability: "powerUp" }`: ability cost modifiers target power-ups (Hulk: "those of your other creatures cost {3} less");
  - once-only abilities count their activations; `powerUpExtraUses` allows activating each power-up N more times (Wonder Man; justified debt entry).
- **Approximation kept:** Kang the Conqueror ("this turn, power-up abilities can't be activated": an extra turn does not carry the effect yet).
- **Rules version:** 50.
- **Tests:** 2 rules tests ("lot B3").

## Sub-lot C1: characteristics, filters and costs ✅ (255 / 271)

- **Cards (8):** Super-Adaptoid, Ares, God of War, Namor the Sub-Mariner, Kid Loki, The Astonishing Ant-Man, Hawkeye, Young Avenger, Shang-Chi, Master of Kung Fu, Powerful Broker.
- **The engine gains:**
  - the filter `countersPutByYouThisTurn` ("that you put counters on this turn") also read by static abilities and triggers, and limited to one kind (`countersPutByYouThisTurn: "+1/+1"`, Kid Loki);
  - `playerStatic({ activateAsThoughHaste: filter })`: activate the {T} abilities of those creatures despite summoning sickness, without being able to attack (Shang-Chi; justified debt entry);
  - `modify.add: amount.powerOf(ref.self)` (`addSourcePower` before PLAN-H H7a): damage increased by the power of the replacement's source (Hawkeye, with `combat: false`);
  - the cost `removeCountersX` ("remove any number of counters from this creature", X = the number removed);
  - the amount `manaSymbolsOf(ref, color)` (mana symbols of a color in a cost, hybrids included: Namor);
  - `fx.proliferate(n, target)`: proliferate on only the designated objects or players (Powerful Broker).
- Ares and Super-Adaptoid benefit from the lot A6 fixes (last known information of an attacking creature, "legendary" in P/T defined by an ability).
- **Rules version:** 51.
- **Tests:** 8 rules tests ("lot C1").

## Sub-lot C2: copies, control and targets ✅ (263 / 271)

- **Cards (8):** Absorbing Man, Taskmaster, Mercenary Mimic, Evil's Thrall, Loki, God of Mischief, Loki Laufeyson, Scientist Supreme of A.I.M., Storm, Windrider, Leader, Super-Genius.
- **The engine gains:**
  - `fx.becomeCopy(…, "untilYourNextTurn", { except })`: a copy until your next turn, with copy exceptions (707.9b: name, types, supertypes, P/T, keywords); a creature card in a graveyard can be copied (Taskmaster);
  - the duration `endOfYourNextTurn` ("until the end of your next turn") and `fx.gainControl(…, { untilEndOfYourNextTurn })`;
  - the condition `cond.amountGreater(a, b)` ("a Villain with greater mana value");
  - `becomesTarget` with `players` and `abilitiesOnly` ("a player or permanent becomes the target of an ability you control");
  - the `nextSpell` filter fixed on resolution (Loki Laufeyson: "mana value at most its power");
  - the `stackItems` target with `controller` and `source` ("an ability you control from an artifact source");
  - the reference `ref.targetsOfEventObject` ("those creatures": the targets of the cast spell);
  - the replaceable event `connive` (Leader: draw a card first).
- **Rules version:** 52.
- **Tests:** 8 rules tests ("lot C2").

## Sub-lot C3: costs, hand and library ✅ (271 / 271)

- **Cards (8):** Trickster's Stratagem, Baron Helmut Zemo, Black Widow, Super Spy, Klaw, Sonic Subjugator, The Ruinous Wrecking Crew, The Serpent Society, Titania, Rugged Rumbler, Worlds Within Worlds.
- **The engine gains:**
  - `fx.topOrBottom(…, fromTop)`: "second from the top or on the bottom";
  - "discard a card or pay {M}", as an additional cost (`additionalCost.discardOr.mana`, choice offered by the interface and the AI) and as a ward (`ward.orMana`, read from the text);
  - the ward "get N poison counters" (`ward.poison`, read from the text);
  - `fx.discard(…, { chooser: "controller", reveal })`: the player first reveals N cards of their choice, you choose among them;
  - `fx.pickFromZone(…, { who })`: each player chooses in their own zone, for themselves;
  - `exileUntil` in another player's library (`who`);
  - the cost `exileGraveyardSymbols` ("exile [color] cards from your graveyard with total N symbols"), the reference `ref.costExiled` and `castCopiesFree(…, { maxCount })` (Baron Helmut Zemo's boast).
- **Rules version:** 53.
- **Tests:** 8 rules tests ("lot C3").

## PLAN-M M8a (rules 199)

- **The Kingpin of Crime:** the toughness rule is the static of an emblem until end of turn, so creatures that arrive afterwards follow it too. Test extended.
