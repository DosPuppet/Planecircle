# Planecircle

A platform for playing Magic: The Gathering against one or more AIs (head-to-head or multiplayer) and online against other players (2 to 4, best-of-three in duels; Standard, Unlimited or Commander). It is built on a **home-grown rules engine in TypeScript** and a 2D interface designed to be a fast way to play and test decks:

- automatic priority passing, with a stop on "End turn" at the end of each of your turns (even with nothing to play);
- automatic mana payment;
- configurable stops;
- target chosen automatically when there is only one;
- drag and drop;
- cards playable from outside the hand (flashback, land from the graveyard, exile, top of the library) shown at the end of the hand, with a label giving their zone;
- modified mana cost (reduction, tax, flashback) shown on the card in hand;
- AI at three selectable levels (beginner, medium, high), from heuristic play to ISMCTS search in duels (see docs/ai.md);
- browsable exile: a button next to the graveyard, and cards exiled by a permanent shown under it (hover to see them);
- an MTG Arena-style table: battlefield art cards that lean when tapped, a tilted table with an optional animated background (a few kilobytes of WebGL, off in "light" graphics), the card preview floating at the left, settings and log in a ☰ drawer (see docs/ui.md);
- an optional 3D board ("3D" in Graphics, on a device with a graphics card): the cards on a tavern table seen at an angle, a fireplace and candles casting shadows, cards flying between zones, runes and particles for spells and combat (three.js and the arena loaded only for those who choose it);
- decks shared by a QR code: the export window draws a code of a Planecircle link that carries the deck; any phone camera opens it, and Planecircle offers to import the deck. In the installed app (on an iPhone, a camera opens Safari, whose storage is not the app's), the import window scans the code itself, or takes the link pasted;
- playable on tablets and on phones in landscape (see "Tablet and phone");
- card images relayed by the server when the player's network blocks Scryfall (see "Images blocked by the network");
- cards in French or English: name, text and illustration of the matching printing (the French printing of another set when the original does not exist in French; text completed by hand when Scryfall does not have it).

**Every card legal in Standard is playable** (last set added: The Hobbit, 188 / 188). Latest addition: **Commander**, for 2 to 4 players, against the AI and online, with seventeen preconstructed decks (Edgar Markov, Y'shtola, The Ur-Dragon, Rakdos, Lord of Riots, The Vision, Dark Leo & Shredder, The Ur-Sphinx, Vivi Ornitier, Sephiroth, Mario & Luigi, Tevesh Szat & Jeska, Deadpool, and the official precons of Reality Fracture, Teenage Mutant Ninja Turtles, Final Fantasy X, The Fantastic Four and Fallout); further decks arrive one at a time, each with its cards.

## Scope: Standard

The target scope before any set is the **Standard format**: constructed, 60 cards minimum, 4 copies maximum (except basic lands and "any number" cards), 15-card sideboard.

Cards were covered **set by set, at 100% before moving on to the next** (except during the "meta" phase of plan P4, see below): every card legal in Standard is playable. All Standard sets are imported (texts, legalities, faces); a card the engine does not handle would appear greyed out in the deckbuilder, marked "coming soon".

**Sets legal in Standard as of 2026-09-25** (source: Scryfall, to be rechecked at each rotation):

| Set | Cards handled |
|---|---|
| **Foundations (FDN)** | ✅ 517 / 517 |
| **Reality Fracture (FRA)** | ✅ 279 / 279 |
| **Edge of Eternities (EOE)** | ✅ 260 / 260 |
| **Aetherdrift (DFT)** | ✅ 260 / 260 |
| **Outlaws of Thunder Junction (OTJ) and The Big Score (BIG)** | ✅ 269 / 269 and 30 / 30 |
| **Final Fantasy (FIN)** | ✅ 307 / 307 |
| **Duskmourn: House of Horror (DSK)** | ✅ 268 / 268 |
| **Bloomburrow (BLB)** | ✅ 266 / 266 |
| **The Lost Caverns of Ixalan (LCI)** | ✅ 279 / 279 |
| **Tarkir: Dragonstorm (TDM)** | ✅ 259 / 259 |
| **Lorwyn Eclipsed (ECL)** | ✅ 266 / 266 |
| **Wilds of Eldraine (WOE)** | ✅ 269 / 269 |
| **Secrets of Strixhaven (SOS)** | ✅ 262 / 262 |
| **Murders at Karlov Manor (MKM)** | ✅ 271 / 271 |
| **Avatar: The Last Airbender (TLA)** | ✅ 280 / 280 |
| **Marvel Super Heroes (MSH)** | ✅ 271 / 271 |
| **Marvel's Spider-Man (SPM)** | ✅ 188 / 188 |
| **Teenage Mutant Ninja Turtles (TMT)** | ✅ 188 / 188 |
| **The Hobbit (HOB)** | ✅ 188 / 188 |

In total, **5,164 playable cards** out of 5,164 cards legal in Standard (100%, checked every week against Scryfall: `tools/check-legality.ts`). The lines above add up to 5,177 cards: they also count the 13 banned cards, which are handled but refused by deck validation, except in the "Unlimited" format (chosen on the home screen, against the AI, and when creating an online game), which accepts any card in the catalog regardless of its legality.

**Reprints, for the Unlimited format** (plan G, history in `docs/history.md`): the Special Guests and the bonus sheets released with the sets above, outside Standard, with the illustration of the reprint. Cards with Commander-only mechanics (partner, eminence…) wait for a Commander deck that asks for them (plan E).

| Set | Cards handled |
|---|---|
| Special Guests (SPG) | 132 / 132 |
| Stellar Sights (EOS) | 43 / 43 |
| Enchanting Tales (WOT) | 55 / 55 |
| Breaking News (OTP) | 61 / 61 |
| Through the Ages (FCA) | 50 / 50 |
| Mystical Archive (SOA) | 37 / 37 |
| Source Material (PZA) | 15 / 15 |
| Jurassic World Collection (REX) | 20 / 20 |

**Meta decks (plan P4, phase 1 finished):** before finishing the last sets one by one, the cards of the most played Standard decks were written (MTGGoldfish survey of 2026-09-29, `docs/meta/`). The **twenty archetypes surveyed** (88.1% of the meta) are playable, sideboard included; the top five are offered as preconstructed decks (Izzet Spellementals, Mono-Green Landfall, Dimir Midrange, Jund Sacrifice, 4c Control). A few reprints from older sets are also legal because they appear in those sets.

**Banned in Standard** (13):

- Abuelo's Awakening
- Badgermole Cub
- Cori-Steel Cutter
- Gran-Gran
- Heartfire Hero
- Hopeless Nightmare
- Monstrous Rage
- Proft's Eidetic Memory
- Screaming Nemesis
- Stormchaser's Talent
- This Town Ain't Big Enough
- Up the Beanstalk
- Vivi Ornitier

**Commander (plan E, history in `docs/history.md`):** format rules (command zone, tax, return to the command zone offered to the owner, commander damage, 40 life, color identity, partner pairs, singleton, Scryfall's ban list and Game Changers, free first mulligan), for 2 to 4 players, against the AI and online (with AI seats run by the server), Commander deck editor (100 cards, identity, bracket estimated from the Game Changers). Seventeen playable precons: Edgar Markov (vampires, Mardu) and Y'shtola, Night's Blessed (drain and control, Esper), from the EDHREC average lists at bracket 4 (2026-10-06), The Ur-Dragon (Dragons, five colors, Moxfield list "How to Train Ur-Dragon"), Rakdos, Lord of Riots (big, nearly free spells, black and red, Moxfield list), The Vision (colorless artifacts, Urza lands and Eldrazi, TappedOut list "Weight of the World"), Dark Leo & Shredder (Ninjas and ninjutsu, white and black, Moxfield list "I Am Ninja, Sneaking in the Shadows"), The Ur-Sphinx (Sphinxes, free spells taken from the opponents and extra turns, Esper, Moxfield list "Stolen Futures"), Vivi Ornitier (cEDH storm, blue and red, Moxfield list "Vivi Ornitier Storm [TOODEEP]"), Sephiroth (aristocrats and combo, mono-black, Moxfield list "Sephiroth's Singularity"), Mario & Luigi (two partner commanders, Bruse Tarl and Reyhan, +1/+1 counters in four colors, Archidekt list), Tevesh Szat & Jeska (two partner commanders, Demons and reanimation, black and red, Moxfield list "Tevesh Szat + Jeska - My Demonic Signature Deck"), Deadpool (Deadpool, Trading Card exchanges his text box with another creature's; copies and chaos, black and red, Moxfield list "Deadpool, Commander Deck"), and five official precons: Multiverse Reforged (Jace, Multiverse Architect, Reality Fracture), Turtle Power! (Heroes in a Half Shell, Teenage Mutant Ninja Turtles), Counter Blitz (Tidus, Yuna's Guardian, Final Fantasy X), The Fantastic Four (Invisible Woman, Marvel Super Heroes) and Mutant Menace (The Wise Mothman, Fallout, with rad counters). Cards arrive deck by deck: those missing from the catalog form the "Commander" pseudo-set (EDH, 872 / 872 cards handled, `docs/extensions/edh.md`). To add a deck: list in `docs/commander/decks/`, `npm run import-cards -- edh`, scripts and tests, precon (recipe in CLAUDE.md).

| Precon | Colors | Source | Game Changers (estimated bracket) |
|---|---|---|---|
| Edgar Markov: Vampires | white, black, red | EDHREC, "optimized" average list | 5 (4+) |
| Y'shtola, Night's Blessed: drain and control | white, blue, black | EDHREC, "optimized" average list | 13 (4+) |
| The Ur-Dragon: Dragons | five colors | Moxfield, "How to Train Ur-Dragon [Primer!]" | 7 (4+) |
| Rakdos, Lord of Riots: big free spells | black, red | Moxfield, "Rakdos, Lord of Big Free Stuff" | 2 (3) |
| Multiverse Reforged: Jace, Multiverse Architect | white, blue, black, red | official Reality Fracture precon | 0 (1–2) |
| Turtle Power!: Heroes in a Half Shell | five colors | official Teenage Mutant Ninja Turtles precon | 0 (1–2) |
| Counter Blitz: Tidus, Yuna's Guardian | green, white, blue | official Final Fantasy X precon | 1 (3) |
| The Fantastic Four: Invisible Woman | white, blue, red, green | official Marvel Super Heroes precon | 0 (1–2) |
| Mutant Menace: The Wise Mothman | blue, black, green | official Fallout precon | 0 (1–2) |
| The Vision: colorless artifacts | colorless | TappedOut, "Weight of the World" | 3 (3) |
| Dark Leo & Shredder: Ninjas | white, black | Moxfield, "I Am Ninja, Sneaking in the Shadows" | 4 (4+) |
| The Ur-Sphinx: Sphinxes | white, blue, black | Moxfield, "Stolen Futures" | 13 (4+) |
| Vivi Ornitier: Storm | blue, red | Moxfield, "Vivi Ornitier Storm [TOODEEP]" (cEDH) | 13 (5) |
| Sephiroth: Aristocrats | black | Moxfield, "Sephiroth's Singularity" | 9 (4+) |
| Mario & Luigi: Partners | white, black, red, green | Archidekt, "Mario & Luigi" | 1 (3) |
| Tevesh Szat & Jeska: Demons | black, red | Moxfield, "Tevesh Szat + Jeska - My Demonic Signature Deck" | 4 (4+) |
| Deadpool: Chaos | black, red | Moxfield, "Deadpool, Commander Deck" | 3 (3) |

**Out of scope for now:** Limited (sealed, draft), eternal formats, Alchemy digital cards.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

### Playing online (2 to 4 players)

- **In development:** `npm run server` (game server, port 8787) and `npm run dev`. Open two tabs, then "Against a player": one creates the game, the other joins with the code or the link.
- **Rooms:** Standard, Unlimited or Commander format; 2 to 4 seats, each held by a player or by a server AI (the game starts when all human seats are taken). With several players, a player who leaves concedes and the game goes on without them.
- **On a local network:** `npm run build` then `npm run server`. The server also serves the interface: your opponent opens the displayed "network" address (`http://<ip>:8787`).
- **On a server (Internet, HTTPS):** Node + pm2 behind nginx, with a subdomain. The step-by-step guide is in [docs/deployment.md](docs/deployment.md); the files are in `deploy/` (pm2 configuration, nginx site, update script).
- **Best-of-three match (BO3, duels only):** tick it when creating the room (and, against the AI, on the home screen). Between two games, each player adjusts their deck with their sideboard (same cards in total, legal deck), then the loser of the previous game starts the next one. The match stops at two wins.
- **Room rules:**
  - 60 s per decision, with a rope shown during the last 20;
  - on expiry, a default decision is played; 3 expirations count as a loss;
  - after a disconnection, 60 s to come back (by reloading the page), otherwise a loss;
  - rematch possible in the same room.
- **Environment variables:** `PORT`, `HOST` (`127.0.0.1` behind nginx), `MTGX_DECISION_MS`, `MTGX_GRACE_MS`, `MTGX_MAX_ROOMS`, `MTGX_DATA_DIR` (game saves, resumed after a restart; `data/rooms` by default), `MTGX_MAX_ROOMS_PER_IP` (4), `MTGX_ORIGINS` (origins allowed for the WebSocket besides the site itself), `MTGX_MAX_HEAP_MB`; AI seats: `MTGX_AI_WORKERS` (2), `MTGX_MAX_AI_ROOMS` (12), `MTGX_MAX_RSS_MB` (640). `/healthz` reports the server state (details in [docs/deployment.md](docs/deployment.md)).

### Replays and game export

- **Export the game** (☰ drawer) downloads a JSON file: the seed, the decks and all the decisions. Since the engine is deterministic, this file is enough to replay the game exactly; attach it to a bug report. Against the AI, export is possible at any time; online, only once the game is over (the file reveals the decks).
- **Review a game** (home screen) opens this file in the viewer: step by step, automatic playback, jump to the start or the end, and choice of point of view (each player sees only what they saw).
- **Online,** games are saved the same way by the server (`data/rooms`): a restart no longer cuts them off.
- **Rules version:** the record notes the engine's rules version and a fingerprint of the game every 25 decisions. A game recorded by an earlier engine version that no longer replays identically stops at the first divergence, shown in the viewer's bar.

### Tablet and phone

The interface adapts to the screen: tablet in landscape or portrait, phone in landscape, and phone in portrait for a duel (the hand on a line of its own under your avatar and the main button). With 3 or 4 players, a phone in portrait shows "Rotate your device".

- **The hand** tightens to always fit the width of the screen. On a phone, it extends below the screen, as in MTG Arena.
- **By finger:**
  - a first tap raises a card in hand and enlarges it, a second plays it; you can also drag it to the battlefield;
  - a long press on any card shows it large, and a tap closes it.
- **Settings and log** are in a drawer opened by the ☰ button, at every screen width.
- **Graphics:** "light" by default on a small touch screen (flat battlefield, still table), "full" otherwise; "3D" by choice where the browser has WebGL2 on a graphics card (the drawer then shows the card in use and the quality drawn); to change in the drawer.
- **Install as an app (PWA):** "Add to Home Screen" (Safari) or "Install" (Chrome) gives Planecircle its icon and a full-screen window; games against the AI work offline. The icon is drawn in code: `npx tsx tools/make-icons.ts` renders `packages/client/public/icons/`.
- **Trying on a real device:** `npm run dev -- --host`, then open the displayed "Network" address from the tablet (same Wi-Fi network).

### Images blocked by the network

Card images come from Scryfall (`cards.scryfall.io`). Some networks (company, school) block it, and cards are then displayed as a text frame. The Planecircle server can relay the images through `/scry/…`:

- **Automatic:** at startup, if Scryfall does not answer and the server does, the relay turns on by itself.
- **By hand:** the **"Images through the Planecircle server"** checkbox, on the home screen (top right) or in the game settings. Tick it if cards do not show. The choice is remembered.
- **Server:** only card images are relayed (allow list); it is not an open proxy. Behind nginx, the images are cached (see [docs/deployment.md](docs/deployment.md)). In dev, Vite relays `/scry` directly.
- If Scryfall is reachable, images come straight from Scryfall, and the server is not used.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify -- --set <EXT>` | Parallel check of a batch (about 2 min): types, Biome, coverage, all tests, targeted fuzz on the set at 2, 3 and 4 players; interface tests if the client changed. `--set COMMANDER`: the Commander precons; `--set EDH`: the Commander pseudo-set |
| `npm run verify -- --full` | Full check (about 7 min): fuzz on the whole pool, bench and interface tests. Duration of each step shown, logs in `test-results/verify/` |
| `npm run verify -- --ci` | Continuous-integration check (GitHub Actions, on every push): types, Biome, coverage, tests and short fuzz on the whole pool, without interface or bench |
| `npm test` | Rules and AI tests, and a smoke test of every handled card (Vitest, one file per set) |
| `npm run golden [-- --update]` | Golden games (`tools/golden.ts`): checks that they replay identically; `--update` regenerates only those that diverge after a `RULES_VERSION` change |
| `npm run fuzz -- --games 300 [--pool decks\|all\|meta\|<EXT>\|commander] [--format commander] [--players 4] [--offers 4] [--ai random\|heuristic\|mixed\|beginner\|medium\|expert\|levels\|chaos] [--seed N] [--jobs 10]` | AI-versus-AI games, invariants checked at every decision. `--pool FIN`: decks drawn mostly from that set. `--format commander`: Commander games (random decks, or `--pool commander`: the precons). `--offers N`: strict fuzz (every offered option must be accepted). `--jobs`: games spread over several processes, same results for the same seed |
| `npm run bench` | Engine decisions per second and AI decision time (targets: ≥ 5,000 dec/s, medium AI < 50 ms, high AI < 150 ms; measure on mains power) |
| `npm run arena -- --a expert --b medium [--games 600] [--jobs 10] [--budget 100] [--pool decks\|all\|mix\|meta\|commander] [--players 4]` | AI tournament (seats and decks alternated): win rate with a 95% interval, decision time; `expert:0` = high without ISMCTS. Deck balance: `--a medium --b medium --format commander --pool commander --by-deck --deck cmd-<id>`. `--jobs`: all cores minus two by default (same results whatever `--jobs`); progress every 10 s; the five slowest decisions and the command that replays their game; `MTGX_SLOW_MS=N` flags decisions longer than N ms |
| `npm run ai-smoke` | AI level: home-screen selector, latency of the high AI in real time, normal and 4x slowed processor (dev server running) |
| `npm run tutorial-smoke [-- --only 2,3] [-- --debug]` | Tutorial followed in the browser like a player, refusal outside the guide, resume (dev server running) |
| `npm run coverage [-- --set all\|standard\|<EXT>] [-- --text [--color W]] [-- --card "<name>"] [-- --deck <id\|all>] [-- --audit]` | Cards handled per set, Oracle texts of the remaining cards, text and script of a card; `--deck`: cards of a Commander deck to script; `--audit`: gaps between the Oracle text and the script of handled cards |
| `npm run server` | Online game server (WebSocket `/ws`, also serves `packages/client/dist`) |
| `npm run online-smoke [-- --base <url>]` | Online duel between two browsers: room, invitation link, rope, resume after reload, rematch (dev server by default, or `--base` toward a production server or nginx) |
| `npm run proxy-smoke` | Image relay: Scryfall blocked (automatic switch to `/scry/`), "Images through the Planecircle server" checkbox (dev server running) |
| `npm run bo3-smoke` | BO3 match against the AI: sideboard between games, loser starts, match outcome (dev server running) |
| `npm run replay-smoke` | Replays: game against the AI exported, then reopened in the viewer (forward, back, end, point of view) (dev server running) |
| `npm run mobile-smoke` | Emulated tablet and phone: hand, main button and fields on screen, long press, tap to raise a card, drawer, portrait (dev server running) |
| `npm run battlefield-smoke` | Loaded boards (tokens, 2nd row, 4 players) put into play by the dev-mode sandbox: rows, token stacks, no cropped card (dev server running) |
| `npm run import-tokens` | Token images: Scryfall tokens of the Standard sets (`t<code>`), then those of the scripts' other tokens by name, into `packages/cards/data/tokens.json` |
| `npm run import-cards -- <set>\|all\|edh` | Scryfall import of a set, of all Standard sets except FDN and FRA (`all`), or by name of the Commander deck cards missing from the catalog (`edh`, French printings first) |
| `npm run import-printings` | Printings table (illustrations of your choice in the deck editor); also compares the color identity against Scryfall |
| `npx tsx tools/check-legality.ts [--commander] [--write]` | Standard legalities (or Commander bans and Game Changers) compared against Scryfall; weekly CI task |
| `npx tsx tools/commander-smoke.ts` | Commander in the browser: home screen, editor, four-player game (dev server running) |
| `npm run deck-smoke` | Deckbuilder end to end: import, editing, export, persistence, game (dev server running) |
| `npm run ui-smoke -- <folder> [actions]` | Plays a game in Chromium through the interface and takes screenshots (dev server running) |
| `npm run typecheck` / `npm run lint` | Strict TypeScript / Biome |

## Architecture

```
packages/
  engine/   pure, deterministic engine: JSON state, decisions, rules, autopilot, filtered view, GameHost
            src/model/ (types), src/ops/ (effect processing by domain); guide: docs/engine.md
  cards/    Scryfall data (data/<set>.json: 20 Standard sets, 8 reprint sets, Commander pseudo-set
            edh.json), card scripts (src/<ext>/*.ts), Scryfall text reading (src/scryfall.ts), decklists, preconstructed
            decks (decks/*.json: 5 FDN welcome decks, FIN Starter Kit, 5 meta decks, 12 Commander decks)
  ai/       three-level AI (parameterized heuristic, combat by simulation, ISMCTS), random AI (fuzz),
            scripted opponent (tutorial); guide: docs/ai.md
  server/   online play: rooms of 2 to 4 seats, server-side GameHost (authoritative), AI seats in workers,
            timer, reconnection, saving and resuming; shared protocol; Scryfall image relay (/scry/)
  client/   React + Vite + Zustand + Motion; the game runs in a Web Worker; deckbuilder; MTGA-style board layout (board/layout.ts) and look (docs/ui.md);
            sound effects (audio/); touch gestures (touch.ts); image relay (images.ts)
tools/      Scryfall import, checks, fuzz, bench, coverage, interface tests
docs/       engine guide, known approximations, set details, deployment
```

- **`submit(state, player, decision) → { state, events }`**: the engine advances on its own up to the next decision. It then gives the exhaustive list of legal options (`legalActions`), used by the interface, the AI and the autopilot.
- **Autopilot** (`engine/src/autopilot.ts`): it answers trivial decisions. The engine itself stays strict. "Full control" mode disables the autopilot, except "End turn", which remains an explicit request. During your turn, it always stops at the second main phase: you end the turn yourself. Real decisions (commander returning to the command zone…) are never taken for you.
- **Card effects**: they are serializable data (`engine/src/dsl.ts`), never code stored in the state.
- **Rule 400.7**: an object that changes zone gets a new identifier (`id`). The `uid` identifier follows the physical card for animations.
- **N players**: priority in turn order, APNAP order, one defender per attacker (player or planeswalker), player elimination (800.4a), free mulligan with three or more players.
- **Commander** (903): commanders designated by their physical identity, command zone (tax, eminence), return offered to the owner, commander damage, color identity.
- **Loops** (104.4b): a loop of mandatory actions is a draw, including a loop that accumulates tokens or triggers.
- **Generic choices** (`choices.ts`): every question goes through a `ChoiceRequest` (choose, order, yes/no, number, distribute) with a suggested answer. A resolution can be suspended on a choice and then resumed; intermediate values ("if you do") are remembered in the resolution.
- **Triggered abilities** (`triggers.ts`):
  - detected at the moment of the event, with look-back for simultaneous deaths;
  - put on the stack in APNAP order;
  - "if…" conditions are rechecked on resolution;
  - also handled: modal abilities, "once per turn", delayed and reflexive abilities, and emblems.
- **Layers** (`layers.ts`):
  - characteristics computed layer by layer (4 to 7): types, colors, granted or lost abilities, P/T;
  - static abilities, including on "the equipped or enchanted creature";
  - result cached by state version; the fuzz checks the cache.
- **Stack**: targetable spells and abilities, counterspells, ward, "can't be countered".
- **Attachments**: Auras (targeted on casting), Equipment ("Equip" read from the text), state-based actions 704.5m–n.
- **Planeswalkers**: loyalty, loyalty abilities (one per turn), planeswalker attacks, emblems.
- **Replacements and prevention** (`replacement.ts`) and **costs** (`mana.ts`, `stack.ts`):
  - replacements: exile instead of dying, entering tapped or with counters (including imposed by another permanent), prevention;
  - numeric event replacements as data (`eventReplacement`, 616.1): damage, life loss and gain, draw, mill, counters, tokens, mana and untap ("plus N more", "twice that many", prevention, "the next time" shields), in the order most favorable to the affected player;
  - costs: hybrid, additional costs, flashback, reductions, sacrifice or counters as a cost, activation from the graveyard.
- **Multi-faced cards**: adventures and omens, double-faced cards (transform, modal faces, Sagas on the back), split cards and Rooms, meld; Sagas, Classes and Cases; face-down cards (disguise, cloak, manifest), hidden from the opponent.
- **Set mechanics**: among others, prepare (FRA), warp and station (EOE), speed, exhaust and Vehicles (DFT), plot, spree and crimes (OTJ), job select and tiered (FIN), Rooms, manifest dread, Eerie, Survival, Delirium and Impending (DSK), Offspring, Gift, Forage, Expend, Valiant and Seasons (BLB), endure, flurry, renew and omens (TDM), blight, Vivid, changeling, behold, wither and conspire (ECL), eminence, myriad, annihilator, delve, casualty and secretly chosen numbers (Commander), Roles, Celebration, Adventures and Bargain (WOE), Repartee, Infusion, Opus, Increment, cascade and miracle (SOS), suspect, disguise, cloak and collect evidence (MKM), waterbending, earthbending, firebending and airbending, and omens (TLA), power-up, teamwork, improvise and shield counters (MSH), Web-slinging, chaos, riot and modified creatures (SPM), sneak attack, Mutagen, Alliance and Vanishing (TMT), Storied, recruit and sharpening counters (HOB). The details per set are in `docs/extensions/`.
- **Performance**: `submit` copies the state then mutates it (no Immer); AI simulations use `applyMutable` on a working copy.

## Adding a card

A card's characteristics (cost, types, P/T, keywords, loyalty, ward, "Equip", cycling, Saga chapters…) come from Scryfall. A "vanilla" or "french vanilla" creature therefore works without a script. Otherwise, its behavior is described in `packages/cards/src/<ext>/*.ts`:

```ts
"Burst Lightning": { kicker: "{4}", spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
```

Every handled card is played automatically by the smoke test (`packages/ai/test/smoke/`, one file per set). New mechanics also get a rules test (`packages/engine/test/<ext>.test.ts`). For a mechanic the engine lacks, `docs/engine.md` says where to touch.

**Adding a set:**
1. `npm run coverage -- --set <EXT> --text` gives the texts of the remaining cards.
2. Write the scripts in batches (A: simple cards; B: flagship mechanics; C and following: unique cards), with `npm run verify -- --set <EXT>` then one commit per batch. Each batch adds its rules tests (`engine/test/<ext>.test.ts`) and follows the rules of CLAUDE.md (no new single-card flag, replacements through `eventReplacement`).
3. Finish with `npm run verify -- --full`.

## Status

| Stage | Content | Status |
|---|---|---|
| 1. Foundations | monorepo, strict TS, Biome, Vitest, FDN Scryfall import | ✅ |
| 2. Engine core | turns and phases, priority and stack, mana, combat and keywords, state-based actions, London mulligan, X, kicker, modal spells, activated abilities, tokens | ✅ |
| 3. Client against the AI | MTGA-style board (creatures in front; lands, then artifacts, then enchantments behind; planeswalker zone apart, far right; attachments and exiled cards on their host; browsable exile; "×N" token stacks; multiple rows and card size adapted to the space), fanned hand, drag and drop, arrows, phase bar and stops, autopilot, log | ✅ |
| 4a. Engine foundations | N players, generic choices, triggers, layers, replacements, costs, performance | ✅ |
| 4b. Deckbuilder | filterable collection, deck and sideboard, 60/4/15 validation (Standard, Unlimited) and Commander (100 cards, commander, identity, Game Changers), decklist import and export (MTGA, MTGO, Moxfield, French names), illustrations of your choice, persistence | ✅ |
| 4c. FDN, main set (no. 1 to 281) | batches A (long tail) to F (unique mechanics: casting permissions, doublings, protection, choices on entering, restricted mana, spell copying…) | ✅ **276 / 276** |
| 4d. FDN, reprints (no. 282 and up) | cards of the starter decks and the Starter Collection | ✅ **241 / 241** (517 / 517 for all of FDN) |
| 4e. Standard legality | imported Scryfall legalities, list of banned cards, format validation in the deckbuilder | ✅ |
| 4f. Multi-faced cards | adventures, double-faced, split cards and Rooms, Sagas, Classes, Cases, face-down, meld | ✅ |
| 4g. Other Standard sets | one set at a time: Reality Fracture ✅, Edge of Eternities ✅, Aetherdrift ✅, Outlaws of Thunder Junction + The Big Score ✅, Final Fantasy ✅, Duskmourn ✅, Bloomburrow ✅, The Lost Caverns of Ixalan ✅, Tarkir: Dragonstorm ✅, Lorwyn Eclipsed ✅, Wilds of Eldraine ✅, Secrets of Strixhaven ✅, Murders at Karlov Manor ✅, Avatar: The Last Airbender ✅, Marvel Super Heroes ✅, Marvel's Spider-Man ✅, Teenage Mutant Ninja Turtles ✅, The Hobbit ✅: all of Standard is covered | ✅ |
| 5. AI | three selectable levels (beginner, medium, high); evaluation on lasting characteristics; attacks and blocks by simulation; ISMCTS in duels (determinization of hidden information), time budget; AI tournament (`npm run arena`); guide: docs/ai.md | ✅ |
| 6. Online PvP | 2 to 4 players (Standard, Unlimited, Commander), AI seats: Node `ws` server (`GameHost`, filtered views and faces), room code, rope, reconnection, resume after restart, rematch, BO3 in duels | ✅; pm2 + nginx deployment documented |
| 7. Finishing touches | sound effects ✅; tablet and phone ✅; Scryfall image relay ✅; replays (seed + decisions) ✅; token images ✅; tutorial ✅; music | in progress |
| 8. Commander | format rules, 2 to 4 players, against the AI and online; decks added one by one (12 precons, 653 Commander-only cards) | ✅ being extended |

The tracking (status, conventions, pitfalls) is in [CLAUDE.md](CLAUDE.md), the history in [docs/history.md](docs/history.md), the open items in [docs/backlog.md](docs/backlog.md), and the current plan in [docs/plans/PLAN-I.md](docs/plans/PLAN-I.md) (bilingual application and English code and documents). Known approximations are in [docs/approximations.md](docs/approximations.md), and the details of each set in [docs/extensions/](docs/extensions/).

## Legal notice

The project's code is under the [MIT](LICENSE) license. It does not cover what belongs to Wizards of the Coast (card names, texts and illustrations, mana symbols, trademarks) nor Scryfall's data and images.

Free, non-commercial fan project ([Fan Content Policy](https://company.wizards.com/fancontentpolicy) of Wizards of the Coast). Images stay hosted by Scryfall and are not copied into the repository. The server relay passes them on as they are, without storing them anywhere but in nginx's cache. The sound effects are packs by [Kenney](https://www.kenney.nl) under the CC0 license (`packages/client/public/sounds/LICENSE-kenney.txt`).
