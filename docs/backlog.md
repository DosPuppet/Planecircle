# Backlog: everything still open

What is still open after the finished plans (R, P4, C, D, S, G, A, E, H, J, L) and the two archived audits (2026-09-29, 2026-09-30), condensed from their "deferred", "reports" and "leftovers" sections. What was done is told in `docs/history.md`. The open items of the current audits are in `docs/audits/2026-10-02.md`, `docs/audits/2026-10-03-cards.md` and `docs/audits/2026-10-07-debt.md`. Per-card approximations are not repeated here: they live in `docs/approximations.md` (an approximation lifted is removed from there; a new one is added there).

Each item cites its origin (plan, lot). "Status checked" means compared with the later plans; where an item may have been done by a later plan without the text saying so, it says "check".

## Deferred until a card requires it

From PLAN-R ("Deferred until no card requires it", state of 2026-10-02, audit section 5.9) and the "absent but no card concerned" list of the 2026-09-30 audit (section 3.2). Implement a rule here only when a card of the pool needs it; before doing so, reread the paragraph of the history about the lot that deferred it.

| Rule | What | Trigger | Status |
|---|---|---|---|
| 509.1a (a creature blocks one attacker) | A creature blocking several attackers ("can block an additional creature", "can block any number of creatures") | a pool card with such an ability | still deferred (PLAN-R R5) |
| 509.1c, 509.1d | Blocking obligations ("must be blocked if able", "blocks if able", "blocks this attacker if able") with maximization | done in PLAN-C C4 (MKM cards). Lure-style effects ("all creatures able to block it do so") | the maximization exists; no Lure in the pool |
| 310 (battles) | Battles (siege, defense counters, protector) | a pool card that is a battle | still deferred (PLAN-R, PLAN-C "What we do not do") |
| 702.26 (phasing) | Phasing | done in PLAN-G G4e (Robe of Stars); Clever Concealment, Talon Gates and Teferi's Protection use the same `phaseOut` | done |
| 613.1c / layer 3 | Text-changing effects (layer 3) | whole text boxes exchanged since the Deadpool deck (`LayerMods.textOf`, 612); a word replaced in a text (New Blood) is PLAN-M M10c | partly done |
| 732 | Loop shortcuts (optional loops). Mandatory loops are a draw (104.4b), done in R6; the three safety guards remain | a pool card whose loop is meant to be played | still deferred (PLAN-R R6) |
| 613 outside the battlefield | Real layers for cards in hand, on the stack and in the graveyard. Replaced by spell characteristics (`spellHasKeyword`, `grantedSpellKeywords`, PLAN-C C11); judged more costly than useful | Leyline of Transformation (types of cards outside the battlefield) and Prismari / Lorehold (granted abilities, not keywords) stay approximated | deferred by decision (PLAN-C) |
| 616.1 | A `ChoiceRequest` for the order of replacement effects: the engine still picks the order best for the affected player (`chooseReplacementOrder`, up to 5 replacements, then the best result) | a card where the order is a real decision for a player who is not the affected one | deferred (PLAN-R R1) |
| 722 | View of the player who controls another player's turn | done (`view.ts`) | done |
| 615.7 | "The next time" shields | done (`fx.shield`, TDM) | done |
| 903 partner / background | Commander pairs (partner, "choose a Background", friends forever) | a deck that has a pair (PLAN-E) | done 2026-10-09 (rules 178, Mario & Luigi deck: `canPair`, `decklist.ts`) |
| Mechanics absent from the pool | day and night, dungeons, the Ring, energy, initiative (the undertaking), battles. Phyrexian mana, phasing, regeneration, monarch were added since (G4e, H6) | a pool card with the mechanic; recheck the Oracle texts after each import | checked 2026-10-09 (PLAN-L): none in the pool |

Related deferrals from the same plans:
- PLAN-C "What we do not do" lists the same rules (block several attackers, battles, phasing, layer 3, loop shortcuts) as waiting for a card that requires them.
- Commander, Limited and eternal formats were out of scope; Commander was added by PLAN-E. Limited and eternal formats stay out of scope (CLAUDE.md).

## Rules and engine

**Replacement and prevention families (PLAN-R R4.4, R4.5, R4.6; PLAN-H H8b)**
- Spell gratuities (`firstSpellFree`, `freeFromExileOncePerTurn`) and family B (gifts granted to spells) stay player flags: merging them would only move one-card booleans around (R4.4).
- Family L (`flashFor` is already generic; `jaceLoyaltyInstant` went through `fx.thisTurn`); life flags: `cantGainLife` was merged by H8b (`noLifeGainForAll` no longer exists) (R4.5).
- The rest of `TurnStats` (life gained, cards drawn, spells cast...) is not in the turn log: these are general statistics read at every condition evaluation, and recounting them in the log would cost more without reducing one-card debt (R4.6).
- Combat player statics kept separate for want of a common evaluator: `attackTax` / `blockTax`, `maxOneAttacker`, `maxBlockingCreatures` (508.1 vs 509.1; H8b).
- `GraveyardReplacement` `gainLife` / `createToken` -> `then`: dropped (two evaluators would remain: the life gain is part of the replacement, the token comes from a reflexive ability, 603.12; H7a).

**Cost and choice slots (PLAN-C C8, C9, C12)**
- Still automatic (documented): evidence "X = value of the targets" (Urgent Necropsy), forage, counter removal among several creatures of one kind (Dyadrine; Quilled Greatwurm needs `removeCountersAmong`/kind choice), symbol exile (Zemo), Champions (C8).
- Entry choices still on their default: exile-linked returns and state-based actions (C9). PLAN-H H9 added questions for the other paths, PLAN-L L5b for the token copies created by an effect; `shockLand` stays apart (already a common arrival question). (Abuelo's Awakening's 1/1 right after arriving: `MoveSpec.mods`, PLAN-L L5a.)

**Approximation groups left by PLAN-C C12** (check each against `docs/approximations.md` before starting; some were touched by later plans)
- Choices at resolution without a target (about 15 cards, one by one): partly done by D1 (`fx.yourChoice`), H2c (Finality) and H4; remaining ones are listed in `approximations.md`.
- "Tap N untapped creatures", the source included, and "player who put the counters": done in K2 (rules 73), Orphans of the Wheat and Exemplar of Light in PLAN-L L4, the player who puts counters everywhere in L5c. (Eriette, the Beguiler is a "becomes attached" trigger since PLAN-L L5c.)

**Single-card remains of the DSL (PLAN-S, PLAN-H reports)**
- Kept after PLAN-S for want of a generic form that really simplifies: `exileNamesakes`, `chooseCardName`, the pair of "wheels" (`mayWheel`, `mayShuffleHandGraveyardDraw`), `shield`, `setBasePTAll`, `diesOrExiled`, `notSubtype` (read by `printedMatch` during layers, which ignores unknown fields). (`chooseRiot`, the four "keep ...", `destroyAllButChosenType` were merged later by H8a and H9.)
- Interval comparisons as `{ min?, max? }` (hundreds of literals for little gain), `GameState.over` (implicit guard against `flow` overwriting the end of the game; four tests fail without it), `CardScript` derived from `CardDef` (S10b; PLAN-M M12). (The `setup` and `batch` groups of `GameState`, the split of `fx` into `engine/src/dsl/fx-*.ts` and the single `creature()` token factory were done by PLAN-M M2.) (Merging the action `RulesEvent`s with the action triggers, T1/T2 of the PLAN-S final option, was done by PLAN-J J3: one `action` trigger, TriggerSpec 58 -> 41.)
- PLAN-S final option: done by PLAN-M M4 and M5, except `CardScript` derived from `CardDef` (PLAN-M M12; until then the scripts write the former flat keys, `flashback`, `altCost`, `cantBeCountered`…, which `singleDef` translates). (The "pay" family was done by PLAN-M M4: one `pay` op for `mayPay`, `unlessPay`, `payCostOf`, `forage`, `collectEvidence`, `behold`, `exileForManaValue`, `payX` and `may`; `tapOrSacrifice` and `removeCounterFromEach` no longer exist. The `CardDef` rework was done by PLAN-M M5: `cda { pt, power, toughness }`, `kicker: KickerDef`, X paid other than with mana, waterbend, "forage or pay" and the per-target surcharge in `AdditionalCost`, `castOptions: CastOption[]` read by `castOption(d, kind)`, `rules: CardRules` read by `cardRule(d, key)`; CardDef 91 -> 52 fields. `entersAsCopy{}` was not needed: "enters as a copy" is `fx.chooseCopy` in `asEnters` since PLAN-H H9.)
- PLAN-H H9 left single-card: `while: { exiled }` of Emrakul (duration, not counted by the guard because the name `exiled` is shared in another sense).
- C14 left some "this turn"-like fields that last beyond a turn; PLAN-H H7b and H11 moved them (`exiledVia`, `expires`, turn log), so the `turnFields` list is empty.

## Cards: documented approximations to revisit

Per card, in `docs/approximations.md`. Cards the plans left explicitly documented:
- **PLAN-D:** Sidisi (its X comes from the sacrificed creature), Lifecraft Engine, Raiding Schemes, North Wind Avatar (card outside the game); Moonlit Meditation does not replace token copies created by an effect (amass, endure and gift are replaced since PLAN-L L5b). (Theorist's Sanctum, Kindle the Inner Flame, Hawkeye: PLAN-L L5a and L5b; Zhao: no entry left.)
- **PLAN-A:** the kind of counters removed from one creature (Quilled Greatwurm): asked since PLAN-M M6. Kept on purpose: Arena-style automatic choices, "exact in duel" entries, timings with the same result, the "outside the game" zone (Extrapolate the Impossible, Turtles Forever, North Wind Avatar). (Central Elevator, Heirloom Epic, Eluge, Alania, Vision Quest, Zenos, Great Train Heist, Sonic Shrieker: lifted in PLAN-L L4 and L5a.)
- **PLAN-E:** Relic of Legends (the tapped creature: chosen in full control since PLAN-M M6; the automatic payment uses it once), New Blood, "untap up to N lands", Phyrexian Altar (general entry: the automatic payment never sacrifices). 903.9b timing: the commander question comes at the next check, not at the instant of the move (PLAN-L L5c: a question before the move is only possible inside a resolution).
- **PLAN-H (H11 report):** Kíli's {0} is always used (declining it is never offered): offered in full control since PLAN-M M6 (a payment detail). (Nuka-Nuke Launcher, sneak, Kíli's Equip cost and the defenders of tokens created attacking: PLAN-L L4, L5a and L5c.)
- **PLAN-G:** the 15 Commander-only reprints are all in the catalog since PLAN-L L2 (EDH pseudo-set). Out of the plan's scope: Commander sets, "Eternal" sets (TLE, SPE, TMC, HOC), Jumpstart (J25), Clue Edition (CLU), promos, Through the Omenpaths (OM1), Modern Horizons 3 Special Guests (set absent).
- **PLAN-C C19:** 5 cards that Scryfall does not have in French (Behind the Mask, Burden of Proof, Lead Pipe, Flotsam // Jetsam, Bloomvine Regent; still none on 2026-10-09). Also without any French at Scryfall: Candelabra of Tawnos, Leonardo, Worldly Warrior, Mishra's Workshop, Splinter, Aging Champion, Super State, The Mightstone and Weakstone, Library of Alexandria.
- **Card tests (PLAN-C C13, continuous):** the share of cards named in a rules test per extension. The C13 target (50 % per extension) is met: on 2026-10-09 after PLAN-L L11, 5,466 / 6,382 (86 %); EOS, OTP, SOA and WOT at 100 %, EDH 92 % (65 cards never named, uncommons and commons); the lowest are now SPG and OTJ 70 %, LCI 70 %, DSK 73 %, BLB 74 %. Next target: the never-named rares and mythics of those sets (`npm run coverage -- --set all --tests [--meta]`, `--set <EXT>`). Also pending: more Oracle expectation patterns (`clause` in `oracle-expectations.test.ts`) for recurring text forms, more official-ruling tests (`rulings.test.ts`) for other interactions (PLAN-R R7 "to continue").

## PLAN-J: not done (2026-10-09)

- **Automatic choices kept** (user decision, as in PLAN-H; all become player questions in PLAN-M): which Army gets amass counters; which lands "untap up to N lands" picks (only yours) — PLAN-M M11. Asked since PLAN-M M6 (cost choices): the exiled card of Force of Will and Force of Vigor, Daze's Island, the sacrifices of Flare of Malice, Demon of Death's Gate and Cresting Mosasaurus, the kind of counter removed for Scholar of New Horizons and O'aka; the permanent Gene Pollinator and Relic of Legends tap (in full control, a payment detail).
- **Immediate "effects" in replacements and mana abilities** (`GraveyardReplacement.gainLife` / `createToken`, `onPrevent.opponentsMill`, mana `removeCounter`, `drawback.opponentsGainLife`): a generic list would need an effect runner off the stack, inside mana payment; PLAN-H rejected it for the graveyard replacements. The Mindskinner's mill was made a real mill instead (J4c).
- **Token-copy exceptions as `LayerMods`** (`copyToken`'s ~10 exception fields, Firion's `equipDiscount`, `removeSupertypes`): a copy rework for two keys.
- **Renames only, kept:** the activation flags `exhaustReuse`, `powerUpExtraUses`, `activateAsThoughHaste`, `jaceLoyaltyInstant` (under `abilityCost` they would stay one-card fields); the ninjutsu cost as `CostDef.bounce` (one key, a changed default pick); the low-value keys `graveyardSize`, `stash`, `forageOrPay`, `collectEvidenceTargetsManaValue`, the default-pick hints `distinctColors` / `preferHighManaValue`.
- **Approximations kept:** Skyseer's Chariot (a "nonland name" question would need a new name kind in the client, the server catalog and the protocol, for one card); Nameless Inversion (an empty `setSubtypes` means "all subtypes" for Ultima; "loses all creature types" needs its own form); Creeping Bloodsucker and Winding Constrictor (damage dealt and player counters do not return what was done); Sidisi; Drown in the Loch (a per-target graveyard size).
- **Variants and ops kept** (no generic form or a net gain of zero): Amount `pow`, the Wheel of Misfortune family (`numberChosen`, `numberChoosers`, `chooseNumbers`), `beholdSharingType`, `extraTurn`, `prime`, `opponentDealtNoncombatDamageLastTurn` (the turn log is cleared each turn), `sourceDealtDamage` (an object's lifetime), the six single-card Refs, Karmic Justice's `destroyed`, ops `counterAbilitySilence`, `countersAboveBase`, `exileForManaValue` (PLAN-M M4: now a `pay` effect, its `totalManaValue` field a single-card key), `flickerChosen`, `meld`, `portent`, `tripleTriad`, `revealFaceDown`, `reduceSpeed` (PLAN-M M3a: merged with `increaseSpeed` into `speed { who?, by }`, still written by Spikeshell Harrier alone); `while: "sourceTapped"` / `"tapped"`.

## PLAN-L: not done (2026-10-09)

- **User decisions** (out of the plan's scope): the PLAN-S "pay" family (done by PLAN-M M4) and `CardDef` rework, Commander balance (Edgar Markov), a new meta snapshot, the public-service features.
- **Measured and dropped:** the attackers weighed against the attacked player in multiplayer (47.8 % ± 2.8 over 1,198 games, L1b).
- **Left documented:** 903.9b timing (L5c); Moonlit Meditation for token copies created by an effect (L5b); Kíli's {0} always used (offered in full control since PLAN-M M6); tokens created attacking keep one defender per player.
- **Official-ruling tests:** none added by L11 (continuous item, "Card tests" above).

## AI

- Multiplayer: ISMCTS is for duels only; Commander at two uses it (kept after a 40-game measure); in 3 to 4 players the heuristic level plays. The 1.5 to 4 s per medium decision on large boards (PLAN-C C17) no longer holds: on 2026-10-09 the bench's Commander line (four precons) measured 5.7 ms on average on boards of 50 to 62 permanents, 308 ms at worst.
- Server-side determinization: done in PLAN-L L1b (`forAgent`, `AiOptions.fair` for the server's AI seats and the browser worker). Refused AI decisions in Commander: fixed in PLAN-L L1a, counted by the arena.
- Performance ideas not done (PLAN-H report): tokens created by batch, lazy trigger sources, cheaper state copy (AI bounds on very large boards: not needed, see the Commander bench figures above). PLAN-S: compiled filters once (P3) and a trigger index by event (P4): under 4 % and 8 % of profile time after P1/P2; the absolute bench target of 5,000 decisions/s is judged before and after, never reached against an old number on WSL.
- 2026-09-29/30 audit leftovers: holding a counterspell done in PLAN-L L1b; no other card-specific hints in `policy.ts` (targeting the right threat), no deck-specific game plan, no archetype mulligan, no multiplayer policy beyond the lethal/threat attack choice, no weight tuning by self-play.
- Commander balance (PLAN-E E15, to decide with the user): with the medium AI Edgar Markov wins 59.3 % +/- 3.9 in duel (600 games) and its seats 33.3 % +/- 5.3 at four players (300 games); lists were not touched (a gap is fixed in the AI first).
- Commander position in the bench (PLAN-E E15 report): done in PLAN-L L1 (four precons, timed by board size).

## Client and interface

From PLAN-C C18 (not done) and PLAN-R R8 (not done):
- Choice of the lands to tap at payment and of the hybrid symbol: done in PLAN-L L7 (full control: a "mana" stage of the cast and the hybrid color for any hybrid spell; Phyrexian mana chosen by the player).
- Scry and surveil by dragging: done in PLAN-L L6.
- `Card` memoized, font sizes in `rem`, Biome rule `noStaticElementInteractions`, ARIA of the windows (shared `Dialog`: `aria-modal`, title, focus kept and given back): done in PLAN-L L10.
- Land untap for a land whose ability has another cost or a trigger (Arena does not allow it either); combat preview that ignores replacements and triggers.
- Playwright capture for the new client choices of PLAN-A (the two modes of Teamwork, target tied to a chosen player, counters split among creatures) (A report).
- From the 2026-09-30 audit section 4: done in PLAN-L (L8: always answer a trigger's "may" the same way; L9: automatic lands, sample hand, mana-value columns).

## Platform, security, operations

- Public service gaps (2026-09-29/30 audits): no accounts, ranking, matchmaking, spectators, chat or emotes, game history; the 200 room slots can be occupied by abandoned rooms (5 minutes each). Rooms are persisted since P2/C16, so this item concerns capacity only (`maxRooms`, `maxHeapMb`, `MTGX_MAX_AI_ROOMS`).
- AI rooms: 12 at most in practice (RSS 640 MB under pm2's 768 MB, PLAN-E E15 measure); to revisit if the VPS changes.
- Absolute bench: the CPU is variable under WSL; `bench` and `ai-smoke` are reliable only on mains power (CLAUDE.md pitfalls).
- Legalities are checked weekly against Scryfall (C19) but a rotation or an announced ban before a reimport goes through `cards/data/legality-overrides.json`.
- The meta snapshot of `docs/meta/2026-09-29/` is dated (online games, one representative list per archetype): redo the analysis (same method) before a new meta-driven lot (PLAN-P4 limits).

## Process reminders from the plans

- A [rules] lot advances `RULES_VERSION`; golden games that replay identically stay untouched; a lot without rules change must replay them identically without advancing the version (PLAN-C).
- Group [rules] lots in one release: each version change can interrupt online games and make local saves unresumable; run `npx tsx tools/rooms-check.ts` before deploying (PLAN-C C16, `deploy/update.sh`).
- Report of a lot: tests added, gaps found, approximations removed or added, change in the debt reference, bench if a hot path is touched (PLAN-C).
- Before implementing a deferred rule, reread the paragraph of `docs/history.md` that deferred it (CLAUDE.md "Deferred until a card requires it").
