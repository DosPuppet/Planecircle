/**
 * Record of a game: seed, players and decks (in order), then all the applied decisions.
 * Since the engine is deterministic, replaying these decisions gives back exactly the same game: resuming an online
 * game after a server restart, replays, exporting a game to report a bug.
 *
 * Decks are recorded by card names: `resolve` gives back the definitions on replay.
 */
export { outcomeHash } from "./fingerprint";

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, type GameVariant, type StepResult, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export const RECORD_FORMAT = "mtgx-game";
export const RECORD_VERSION = 1;

/**
 * Version of the engine rules. It moves at each lot that changes the behavior of a game (PLAN-R in docs/history.md,
 * "[rules]" lots): a record from another version may no longer replay identically. Absent from a record: 0.
 *
 * - 1: one id counter per prefix (lot F1).
 * - 2: R0.1 fixes (split second, protection, 704.5b, winning or losing the game, counters paid as a cost, 506.4).
 * - 3: R0.2 fixes (taxes of free spells, attack and block taxes added up, requirement to attack without paying a tax).
 * - 4: cleanup with state-based actions, triggers and priority (514.3a, R0.3).
 * - 5: lifelink, one gain per source and per batch of simultaneous damage (R0.4).
 * - 6: permanents that enter at the same time see each other enter (603.6a, R0.5).
 * - 7: single access to player statics, conditions and player effects respected everywhere (R4.0).
 * - 8: counters, types, tapped state, attack, haste and Impending set before the enters event; defender of attacking
 *   tokens chosen (R2.1).
 * - 9: copies of permanents (mana value, loyalty and replacements of the copied definition, copy of a copy, copy by a
 *   static ability, copy of a Clone spell; R2.2).
 * - 10: a Clone or an Aura that enters without being cast chooses what it copies or enchants; an Aura with nothing to
 *   enchant stays in its zone (707.5, 303.4f, 303.4g; R2.3).
 * - 11: order of the replacements that modify a number (damage, counters, life, draw) chosen for the affected player;
 *   every draw of the game goes through the replacements (616.1; R1).
 * - 12: a spell copy is an object on the stack; new targets may be chosen for any copy, and they become its targets
 *   (ward); division of damage and counters announced when put on the stack, the share of a target that became illegal
 *   is lost (707.10c, 601.2d, 608.2b; R3).
 * - 13: control is a layer (613.1b): base controller and timestamped control effects; a player who leaves the game
 *   gives back what they had stolen (800.4a; R2.4).
 * - 14: layer dependencies by fixed point (conditions, "for each", characteristic-defining P/T that read permanents);
 *   copiable copy exceptions; added colors (613.8, 707.9b, 105.3; R2.5).
 * - 15: protection and hexproof "from [filter]": Sword of Wealth and Power protects from instants and sorceries,
 *   Resilient Roadrunner from Coyotes (702.16; R4.2).
 * - 16: permissions to play from the graveyard or the top of the library unified (a permission without a cost comes
 *   before Muldrotha; Forgotten Cellar: only spells); cost modifiers of abilities unified (R4.4).
 * - 17: mulligans round by round (103.5); defenders' blocks applied together (509.1; R5).
 * - 18: loop of mandatory actions, the game is a draw (104.4b); the triggers of a player who leaves the game cease to
 *   exist (800.4a; R6).
 * - 19: card accuracy (R7): "the event object" and "if the source…" read the last known information of a departed
 *   object (603.10); `pumpAll` respects "other"; multiple prowess; land played from the graveyard through a permission;
 *   the mana solver prefers the ability that produces the most (Tablet of Discovery).
 * - 20: Tarkir: Dragonstorm, lot A: an intervening "if" on the event object is checked on triggering and on resolution
 *   (603.4; Aclazotz); "has already dealt damage" (Karakyk Guardian); "mana value X or less" in a search (Nature's
 *   Rhythm).
 * - 21: replacements of damage and of life loss as data (`EventReplacement`, R1, families E and F); a prevention by a
 *   player other than the damaged one comes before the modifications, theirs after (616.1); "the next time" shields
 *   (615.7, New Way Forward); prevented damage does not count as dealt.
 * - 22: a permanent that leaves the battlefield is always removed from combat (506.4), whatever the effect or cost that
 *   moves it (Lorwyn Eclipsed: "behold and exile" an attacker).
 * - 23: Lorwyn Eclipsed, lot B: "of the chosen type" read everywhere (effect filters, triggers, cost reductions,
 *   replacements; choice of a spell or an emblem); "when it transforms into…"; wither (702.80); "untap" removes a stun
 *   counter (122.1d); created tokens are in the turn log; "another card" recognizes the dead source; a cost reduction
 *   sees the cast card (behold); "remove a counter" of any kind; the layer cache is invalidated after the departure of
 *   the permanents of an eliminated player (800.4a).
 * - 24: Lorwyn Eclipsed, lot C: a cast spell is seen with its mana value and its name (filters of restricted mana and
 *   of cost reductions); restricted mana in the pool; counters put in the turn log; a spell on the stack can gain a
 *   keyword; "cast the linked exiled cards" with its variants (free, once each turn, this turn…).
 * - 25: Lorwyn Eclipsed, lot D: replacements of families H and I (tokens, counters, life gained, draw, mill, mana) as
 *   data (`EventReplacement`), doublers and flags converted; "those tokens plus a token" applied once per event; a
 *   permanent may be unable to untap; "enchanted land is the chosen color".
 * - 26: Wilds of Eldraine, core: Aura tokens (Roles), only one Role per player on the same permanent (704.5y).
 * - 27: Secrets of Strixhaven, core: an "if" condition of a triggered ability reads the amounts of the event object
 *   (mana spent on the cast spell: Increment); Wilds of Eldraine, lots C4 and C5: centralized life payment (Ashiok),
 *   "once each turn" from the top of the library, reduced ability costs.
 * - 28: Secrets of Strixhaven, lot A: "enters with" amounts can add, negate, take a maximum and count the colors spent
 *   (Sheriff of Safe Passage entered without counters); "enters with" conditions see X; "distribute X counters" without
 *   a minimum per target when X is smaller than the number of targets.
 * - 29: Secrets of Strixhaven, lot A6: the mana spent on a resolving instant or sorcery is read (`manaSpent`); a card
 *   cast from exile with "then exile it" goes back there; mana value filters "X" and "colors spent".
 * - 30: Secrets of Strixhaven, lot C1: "playable until your next turn" for the owner (Memory Vessel only lasted this
 *   turn) and "until the end of their next turn"; who put counters on an object this turn; halves of life and hand per
 *   player; delayed abilities "at the beginning of your next main phase".
 * - 31: Secrets of Strixhaven, lot C2: a spell copy no longer inherits the enters modifications of the original; the
 *   token copy of a permanent spell gets its own (haste, sacrifice at end of turn); free spell from the hand once each
 *   turn; "this spell can't be copied".
 * - 32: Secrets of Strixhaven, lot C3: cascade (702.85); the draw event designates the drawn card (miracle); "cast now"
 *   for a given cost from the hand.
 * - 33: Murders at Karlov Manor, lot A: a triggered ability with "one to N targets" respects the minimum (Armament
 *   Dragon had no target below N creatures); the condition of a trigger sees the event (amount); "if they have no cards
 *   in hand" outside resolution; suspect designation (701.60).
 * - 34: Murders at Karlov Manor, lot A6: a spell or an ability with "X targets" is offered even without a target (X =
 *   0); the AI adjusts X to the number of targets.
 * - 35: Murders at Karlov Manor, lot B1: collect evidence as an ability cost (and a mana cost), as an optional effect
 *   (N or X), as ward, and "whenever you collect evidence"; automatic choice of the evidence without wasting an
 *   expensive card; ward "sacrifice [type]" filtered.
 * - 36: Murders at Karlov Manor, lot B2: X in a disguise cost, reduced disguise cost, reduction of face-down spells,
 *   ban on turning face up, land cast face down; a face-down arrival is recorded in the turn log as a creature without
 *   types (the card stays hidden).
 * - 37: Murders at Karlov Manor, lot C3: a spell that leaves the stack goes through a single path (exile or bottom of
 *   the library instead of the graveyard); `cond.refMatches` resolves its filter; a "leaves" trigger of an exiled
 *   creature follows the new card; "for as long as the source remains tapped" effects.
 * - 38: Avatar: The Last Airbender, core: firebending mana stays until end of combat (and not of turn); waterbend
 *   (artifacts and creatures tapped for {1}) in the costs of activated abilities.
 * - 39: Avatar: The Last Airbender, lot A5: the power and toughness of the creature of an event that left the
 *   battlefield ("when it dies, X being its power") are its last known information (608.2h).
 * - 40: Avatar: The Last Airbender, lot A6: "X can't be 0" (`minX`) refuses an activation with too small an X (Katara,
 *   Water Tribe's Hope; Gogo, Master of Mimicry).
 * - 41: Avatar: The Last Airbender, lot B1: waterbend as a spell cost (additional, X, optional), as ward, "unless they
 *   pay" and as a replacement cost of linked cards; control of a player limited to their next combat phase; distributed
 *   counters of another kind, among any number of objects.
 * - 42: Avatar: The Last Airbender, lot B2: event "you bend [the element]" (water paid, earth, fire resolved, air),
 *   recorded in the turn log; cost reduction by colored symbols (Aang, Master of Elements).
 * - 43: Avatar: The Last Airbender, lot C1: P/T defined by counters on permanents, colors among a filter and excluded
 *   types read during the layers; bonus per creature type of each affected object; modes of a triggered ability under a
 *   condition; scry done by a targeted player.
 * - 44: Avatar: The Last Airbender, lot C2: omen (702.143); "pay N life or {M}"; flashback given to graveyard cards;
 *   top card of the library cast through a permission; excess damage of a combat; unspent mana kept or converted; spell
 *   keywords; the mana pool moves the state version.
 * - 45: Avatar: The Last Airbender, lot C3: "keep creatures with total power N or less"; damage increased by the
 *   counters of the replacement's source; ability triggered by a creature's attack (event); abilities of the chosen
 *   linked card; total mana value of the targets of a reflexive ability fixed when it is put on the stack.
 * - 46: Marvel Super Heroes, lot A3: the trigger "[cards] put into a zone" respects `nontoken` and `token` (a token is
 *   not a card: Moonshadow, Robot Domination).
 * - 47: Marvel Super Heroes, lot A6: last known information of a permanent taken before its removal from combat ("when
 *   an attacking creature dies"); an Equipment that became a creature becomes unattached (301.5c); a library card cast
 *   through a permission follows its timing; P/T defined by an ability read "legendary".
 * - 48: Marvel Super Heroes, lot B1: improvise (702.126), printed or given to the player's spells.
 * - 49: Marvel Super Heroes, lot B2: shield counters (122.1c: damage and destruction replaced by the removal of a
 *   counter); the tapping of a permanent is recorded (cause "teamwork", first tap of the turn).
 * - 50: Marvel Super Heroes, lot B3: reductions of the cost of power-ups; counted uses of single-use abilities (Wonder
 *   Man: one more activation).
 * - 51: Marvel Super Heroes, lot C1: "counters put by you this turn" read by static abilities (and by kind); activate
 *   despite summoning sickness; damage increased by the source's power; cost "remove X counters"; symbols of one color
 *   in a cost; proliferate on a target.
 * - 52: Marvel Super Heroes, lot C2: copy "until your next turn" with exceptions (707.9b); control until the end of
 *   your next turn; "becomes the target" for players and for abilities only; filter of `nextSpell` frozen on
 *   resolution; abilities targeted by controller and source; targets of the event's spell; connive replaced; comparison
 *   of two amounts.
 * - 53: Marvel Super Heroes, lot C3: second from the top; "discard a card or pay {M}" (cost and ward); ward "get N
 *   poison counters"; discard after a partial reveal; choice in their own hand for each player; exile until a card in
 *   another player's library; cost in mana symbols from the graveyard; maximum number of copies cast.
 * - 54: Marvel's Spider-Man, lots B1 to C3: creature returned by web-slinging chosen, chaos given and chaos of a land,
 *   "can't be countered" generalized (Chimil and Hexing Squelcher now protect all your spells), riot, damage
 *   redirection, permanents gone during the same decision (`leftBatch`).
 * - 55: Teenage Mutant Ninja Turtles, lot B1: sneak castable in the declare blockers step for creatures and sorceries,
 *   returned attacker chosen, sneaked permanent entering tapped and attacking; targets "of different players" without
 *   enough players: no legal target.
 * - 56: Teenage Mutant Ninja Turtles, lot C1: "each opponent exiles up to…" for each designated player; half of the
 *   library rounded up; chosen color frozen in a "becomes the chosen color" effect; sneak given from the graveyard;
 *   spells targeting your permanents; reduction of the next spell; counters of a spell cast from the top of the
 *   library; sacrifice that includes the source; graveyard cards with the same name.
 * - 57: The Hobbit, lot A: a restricted mana produced by hand goes into the restricted pool; the choice of a creature
 *   type also offers the types of the tokens that the cards of the game create.
 * - 58: The Hobbit, lot C1: hone counters (+1/+0 to the equipped creature), graveyards of N cards, trigger "activate an
 *   ability of a creature", mana of a Treasure spent, counterspell that exiles a permanent, permission paid in life,
 *   card revealed at random, activated abilities of graveyard cards, card with the same name as a permanent, card that
 *   came from the battlefield this turn.
 * - 59: the control given by an Aura (or a "for as long as" effect) comes back as soon as it leaves the battlefield,
 *   without waiting for state-based actions (found by the "chaos" fuzz).
 * - 60: ceilings: 100 tokens at most per event, none beyond 400 objects on the battlefield, replaced amounts capped at
 *   one million (token doublers multiplying, found by the "AI levels" fuzz).
 * - 61: offered options and accepted decisions aligned (PLAN-C, lot C2, strict fuzz `--offers`): "X targets" with X =
 *   0, a target can pay the kicker (blight, Bargain), a permanent sacrificed for the cost of an ability can first
 *   produce its mana, paying 0 life with a negative total, the evidence of a mana does not take the card that exiles
 *   itself for its ability (engine crash), sacrifices and "tap X" by default first without a mana ability (and reserved
 *   for the payment), Emrakul: the land's ability lasts until the spell is cast (601.2i), a mana ability with no
 *   possible color produces nothing (106.7).
 * - 62: "tap another permanent" sources (Springleaf Drum) share the permanents to tap; harmonize taps by default a
 *   creature without a mana ability (PLAN-C, lot C3, strict fuzz).
 * - 63: 509.1c by maximization: a block declaration is refused only if another one obeys more requirements ("blocks
 *   this Wolf if able" and "must be blocked if able" no longer block each other); 509.1d: a block tax lifts the
 *   requirements; the default attack declaration makes the creatures that must attack do so (on the server, an expired
 *   rope with Juggernaut made the player concede the game). PLAN-C, lot C4.
 * - 64: marked mana: a restricted source or one carrying an effect (Cavern of Souls) tapped by hand puts its mana in
 *   the marked pool with its source, its choice and its effect; these sources are offered for manual tapping (PLAN-C,
 *   lot C5).
 * - 65: objects paid as a cost chosen by the player (`CastChoices.picks`: blight, counters, exile from the graveyard,
 *   evidence, sacrifice X, exile a permanent, ninjutsu, convoke, improvise, waterbend, delve; without a choice, the
 *   engine's suggestion, unchanged); blight as a kicker takes by default a creature that survives, like `blightTarget`
 *   (PLAN-C, lots C7 and C8).
 * - 66: "as it enters, choose…" asked of the player for a played land (`playLand.chosen`, Cavern of Souls) and for a
 *   permanent put onto the battlefield by an effect (`moveTo`) (PLAN-C, lot C9).
 * - 67: keywords granted to spells (`spellKeywords`, `spellHasKeyword`) instead of four flags (flash, convoke, delve,
 *   split second); a spell on the stack has the keywords granted to it by its controller's static abilities (Heartflame
 *   Duelist: lifelink, copies included) (PLAN-C, lot C11).
 * - 68: "one or more …" triggers: one per batch of simultaneous events (`GameState.eventBatch`); Ordeal of Nylea
 *   triggers whichever way it is sacrificed; discards as a cost (Hallway Heckler, Solitary Cell, Murmuring Volume,
 *   Thunderhead Gunner, Avishkar Raceway); Pyrewood Gearhulk, The Earth Crystal, Chandra (+1), Boommobile (PLAN-C, lot
 *   C12).
 * - 69: Thorin, Mountain-king deals damage only if an Equipment becomes attached (701.3b); Dalkovan Encampment: delayed
 *   ability independent of the land (603.7); the Spirit token of Realm of Koh can block a Spirit (PLAN-C, lot C13).
 * - 70: Cloud, Midgar Mercenary and The Masamune go through `triggerMod`; The Masamune also doubles the triggers of
 *   your emblems when it is attached to nothing (Oracle); "attacked / dealt damage this turn" read from the turn log
 *   (PLAN-C, lot C14).
 * - 71: a source sacrificed for its mana cost (Treasure) produces according to its last known information: mana
 *   replacements apply (Roxanne, Starfall Savant), as the solver counted them ("Inconsistent payment").
 * - 72: additional cost "sacrifice any number of permanents", each reducing the cost by {1} (Rottenmouth Viper);
 *   permission to cast from the graveyard limited to the Adventure (Mosswood Dreadknight); spell cast with a keyword in
 *   the turn log (Momo, Friendly Flier); color of hybrid mana chosen on casting (Deceit) (lot K1).
 * - 73: mana "in any combination of colors" divided by the solver or by the player (Vivi Ornitier, Muerra…); "whenever
 *   you put counters" counts only those you put, on any creature if the text says so; "tap N untapped creatures" can
 *   tap the source (302.6) (lot K2).
 * - 74: shock land put onto the battlefield by an effect: its future controller can pay the life for it to enter
 *   untapped; "discard your hand" is a cost (Reverberating Summons, Connecting the Dots, Tarrian's Journal); a
 *   triggered ability granted "if…" checks its condition again on resolution (603.4); timings fixed by script
 *   (Earthbender Ascension, Fire Lord Azula, Azog, Puca's Eye, Ill-Timed Explosion, Granite Witness, Ezrim,
 *   Sewer-veillance Cam, Rattleback Apothecary) (lot K3).
 * - 75: Liliana the Faultless: "discard a card" is a cost (lot K4).
 * - 76: choices given back to the player: kind of the counters removed by an effect; objects of a spell's additional
 *   costs (exile, return, tap, exile from the graveyard, behold and exile); untargeted choices on resolution (Seasons,
 *   Wick, Mistbreath Elder, Zell Dincht, Arid Archway, Empower Jace); "you may", "up to" (Esper Terra, Beatrix, Hama,
 *   Avatar Destiny, Severance Priest, Rambling Possum); targets "other than this creature" (Pawpatch Recruit) and "that
 *   saddled it" (Giant Beaver) (lot K6).
 * - 77: durations: "until your next end step" for playable cards (Shadow Urchin, Seek the Beast, Haste Magic, Opera
 *   Love Song), "for as long as you control [the source]" (Ty Lee, Spider-Woman), "for as long as it remains tapped"
 *   (Braided Net), emblem "until the end of your next turn" (Season of the Bold) (lot K7).
 * - 78: a token described as tapped (`TokenSpec.tapped`) enters tapped (Tenured Tethermage); Dread Summons and Revenge
 *   of the Rats create tapped tokens; Biogenic Upgrade asks for one to three targets (lot K8, FDN).
 * - 79: "one or two targets": at least one (Get Out, Coordinated Clobbering, Omnivorous Flytrap, Untimely Malfunction)
 *   (lot K8, DSK).
 * - 80: Aetherdrift (lot K8): a Vehicle that became a creature by exhaust stays one; Boom Scholar also gives trample to
 *   Vehicles; Cloudspire Skycycle (one or two targets), Cloudspire Coordinator (turn log), Demonic Junker (only if the
 *   creature is destroyed), Gastal Thrillroller (discard as a cost), Gonti (mana of any type), Full Throttle (all the
 *   creatures that attacked), Lifecraft Engine (crewed Vehicles).
 * - 81: a condition on a target or on the event object still on the battlefield reads the full filter ("entered this
 *   turn", Malamet Battle Glyph); the discovering player is fixed on the first pass (Zoyowa's Justice); The Lost
 *   Caverns of Ixalan (lot K8): The Ancient One, Dire Blunderbuss, Sunfire Torch (objects linked to reflexive
 *   abilities), Cosmium Confluence (chosen Cave, untargeted), The Myriad Pools (mana of the land), Jade Seedstones (one
 *   to three targets), Hurl into History (counters, then discovers).
 * - 82: a choice in a zone keeps the maximum mana value of its filter; Wreck Remover does exile the graveyard card;
 *   Final Fantasy (lot K8): Ambrosia Whiteheart (untargeted return), Delivery Moogle, Eden ("another"), Ignis Scientia,
 *   Qutrub Forayer and Magic Pot (exile from the graveyard), Rydia (X checked on resolution).
 * - 83: Outlaws of Thunder Junction (lot K8): Final Showdown, Pillage the Bog, Marchesa, Oko, Rakdos, Geralf, Calamity,
 *   Lazav, Lilah, Bucolic Ranch, Demonic Ruckus, Reach for the Sky.
 * - 84: "N damage to each creature and each planeswalker" also damages planeswalkers (Calamitous Cave-In, Splatter
 *   Technique, Dragonback Assault, Fulminous Forte); Reality Fracture (lot K8): Ajani's Anguish and Fblthp (the X of
 *   the cast card), Hunter's Axe (trample or deathtouch, as chosen), Tinybones, Pocket Nuisance (once per grouped
 *   discard).
 * - 85: a level triggered ability (station) triggers even without a printed triggered ability (Dawnsire, Entropic
 *   Battlecruiser, Sledge-Class Seedship, Synthesizer Labship); Edge of Eternities (lot K8): Archenemy's Charm (one or
 *   two targets), Pain for All ("another target"), Broodguard Elite (all its counters).
 * - 86: "enters with" a number of counters read from the game state (Gev, Scaled Scorch); counter replacement "if you
 *   would put" (`byYou`, Innkeeper's Talent); Bloomburrow (lot K8): Dragonhawk (until your next end step), Kitnap (no
 *   stun counters if the gift is promised), Gev (your creatures).
 * - 87: "of your choice" chosen on resolution (608.2d, `fx.yourChoice`) and not as a mode: Practiced Offense, Wingnut,
 *   Manifold Mouse; Iceberg Titan taps or untaps on resolution (PLAN-D, lot D1).
 * - 88: "when you do" after a replacement or an arrival: reflexive ability put on the stack (Head of the Hunt: the
 *   Wolf; Superior Spider-Man: the exile of the copied card) (PLAN-D, lot D3).
 * - 89: behold as an additional cost (`additionalCost.behold`): chosen on casting, the card from the hand revealed,
 *   remembered by the spell (`cond.beheld`), "or pay {N}"; behold during a resolution (`fx.mayBehold`): the Exhales,
 *   Countersculpt, the five "behold or pay {2}" of ECL, Sarkhan, Elven Passage (PLAN-D, lot D2).
 * - 90: a computed target mana value (`maxManaValueAmount`) is evaluated when a triggered ability targets, then on
 *   resolution (Moseo, Vein's New Dean) (PLAN-D, lot D4).
 * - 91: condition remembered on casting (`whenCast`, Faerie Fencing, Steer Clear); trigger condition checked on
 *   triggering only (`triggerCondition`, Social Snub) (PLAN-D, lot D5).
 * - 92: "up to X targets" of a triggered ability chosen on triggering (Prismabasher, Heroic Feast, Rollercrusher
 *   Ride…); modes of a reflexive ability (Hylda) and of a granted modal ability; Ghostly Dancers chooses on resolution
 *   (PLAN-D, lot D6).
 * - 93: kind of counter removed as a cost chosen by the player (`counterKind`); optional copies of Moonlit Meditation
 *   and Mirrormind Crown; Equipment or host chosen on resolution (Light of Judgment, Unexpected Request, One Last Job:
 *   `chooseAmong.optional`, `moveTo.attachTo`); cost "tap four permanents" that keeps the needed mana (Guardian of the
 *   Great Door) (PLAN-D, lot D7).
 * - 94: small discrepancies (PLAN-D, lot D8): keywords read only if they are printed (Dion, Peter Parker, Goddric,
 *   Reluctant Role Model); loot lands playable (Tinybones); graveyard card cast during a resolution without flash
 *   (Tinybones, the Pickpocket); X frozen on discard (Ill-Timed Explosion); "for as long as that land has a blight
 *   counter" (Ultima); permission linked to the object (Lightning); Glowcap Lantern attached; Faller's Faithful,
 *   Sunstar Expansionist, Singularity Rupture.
 * - 95: "collect evidence" by an effect: the player chooses the exiled cards (Izoni, Evidence Examiner, Sample
 *   Collector…; PLAN-D, lot D9).
 * - 96: a mana source that collects evidence (Cryptex) does not take an object reserved by the rest of the cost (craft
 *   material); found by the starting fuzz of PLAN-S.
 * - 97: the turn log becomes the only source of "this turn" (PLAN-S, lot S2): life gained and lost, draws, discards,
 *   scries, crimes, loyalty activations, transformations; "an opponent" there is an opponent still in the game
 *   (800.4a); "entered face down" counts any face-down arrival (Oblivious Bookworm).
 * - 98: amount families (PLAN-S, lot S3): `aggregate` (mana value computed on the battlefield: a copy has that of what
 *   it copies, 707.2; total power on entering without the entering object), `spent`, `manaSymbols`, reference
 *   `playersWhere`.
 * - 99: how a spell was cast (PLAN-S, lot S4): `CastInfo` on the stack item then on the permanent; evoke, warp and
 *   impending are alternative costs (`via`); "if this spell was cast from a graveyard" reads the casting zone (and no
 *   longer the flashback mark).
 * - 100: "all …" effects act on a zone reference (PLAN-S, lot S6c): the spell's X in a filter is read by the reference
 *   (`withX`); `destroy` also remembers the number of destroyed permanents.
 * - 101: effect families (PLAN-S, lots S6d and S6e): `extra`, `spellFate`, `gainControl` (durations, player `to`),
 *   `grantPlay{flashback}`, warp exile through `moveTo` (`moveWithSpec`), reference `sameName` (Maelstrom Pulse),
 *   duration of emblems.
 * - 102: filters (PLAN-S, lot S8b): the sub-filters `anyOf` and `not` are evaluated like the filter itself (fields
 *   specific to the object, chosen values) instead of being read only on the view (an unknown field was ignored there).
 * - 103: reprints (PLAN-G, lot G2a): mode cast for its own cost (overload, cleave), escalate, dash and spectacle; the
 *   number of cards of a search made by other players is read from each one's point of view.
 * - 104: reprints (PLAN-G, lot G2b): shroud; exalted, affinity for artifacts, modular, graft and extort read from the
 *   text (the extort of The Kingpin of Crime is no longer written by hand); a source that produces 0 mana (Vivi
 *   Ornitier with power 0) no longer pays anything; an ability whose only cost is {X} is offered from 1.
 * - 105: storm read from the text (G2c): the spells cast before it, by all players, counted on casting (and not on
 *   resolution nor only yours: Stormscale Scion); overload and cleave offered in a separate cast option (never free); a
 *   spell that an eliminated player controls without owning it is exiled (800.4a).
 * - 106: Stellar Sights lands (G3a): drawback of a mana ability (`drawback`: damage to you, life to opponents).
 * - 107: Stellar Sights lands (G3b): infect (702.90), regeneration (701.19, shields removed at cleanup), move a
 *   counter, mana of the colors of your permanents or of the types of your lands, conditional leyline.
 * - 108: Special Guests (G4a): landwalk, "doesn't attack the same player twice", player statics that affect other
 *   players (`affects`), trigger "you copy a spell", suspend from the hand (special action), countered card remembered
 *   wherever it goes (`storeMoved`).
 * - 109: Special Guests (G4b): destruction without possible regeneration (`noRegenerate`, Damnation).
 * - 110: Special Guests (G4c): limit of spells by types (`castLimit.spellTypes`), "a player plays a land"
 *   (`playLand.whose`).
 * - 111: Breaking News (G6): the search of one's library is recorded in the turn log (Archive Trap).
 * - 112: Through the Ages (G7): a mana ability can tap an artifact (`tapAnother: "artifact"`, Urza).
 * - 113: Phyrexian mana (107.4f, G4e): each {C/P} is paid with mana, otherwise 2 life; K'rrik (`phyrexianMana`).
 * - 114: alternative costs that make you pay life, exile cards from the hand or return a permanent (`altCost.pay`).
 * - 115: player rules (win on impossible draw, life floor, damage like infect at 0 life, graveyard cards that can't be
 *   targeted), "three times as much" mana replacement, N-sided die, morph (702.37).
 * - 116: combat: a player blocks with at most N creatures, at most one creature attacks a player; destruction recorded
 *   with the destroying player (`destroyed` trigger); hexproof of a player from a filter; retrace (702.81).
 * - 117: madness (702.35), emerge (702.119), replicate (702.56), given escape, granted prowl, gain control of a spell,
 *   cast only as a sorcery, copy exceptions in `entersAsCopyMods`.
 * - 118: skipped draw step, stolen draw (Notion Thief), skipped extra turns, discard to the top of the library, generic
 *   maximum hand size (and condition of a static ability read for its controller), life paid as chosen, mill repeated
 *   by color, one card per type (Atraxa).
 * - 119: token copies created by other players, filtered cascade, P/T equal to the linked cards.
 * - 120: discard X cards as a cost, permission to play for other players, Aura attached to a random player, chosen
 *   color added.
 * - 121: phasing (702.26), vote and payment by another player, trigger of the next cast spell, Saga transformed into a
 *   land with given escape.
 * - 122: pass on the approximations (A0): "the defending player" of an attack trigger whose source doesn't attack is
 *   the attacker's (Raid Bombardment); removing all counters no longer asks for their kind.
 * - 123: approximations lifted by script (A1): Kellan, the Kid casts the spell, Dyadrine makes the creatures be chosen,
 *   "when it transforms" abilities on the back face (Ultimecia, Black Chocobo), Tellah in one trigger…
 * - 124: approximations lifted by script (A2); "do this only once each turn" checked again on resolution (two triggers
 *   on the stack); "another card" also excludes the card of the dead creature (new id).
 * - 125: a permanent exiled or returned as an additional cost no longer adds its mana replacement to the offered
 *   payment (Champion of the Path, Lavaleaper); a creature that must attack but can attack no defender is no longer
 *   required to (The Void, Storm, Windrider).
 * - 126: generic families (A3c): distinct attackers in the turn log, mana restricted to a kind of ability (equip,
 *   unlock, turn face up…), beheld object readable after the cost, "you / an opponent is dealt damage" from any source.
 * - 127: generic families (A3b): maximum hand size in timestamp order, "choose both" if the additional cost is paid (a
 *   single mode refused), a new land type replaces only the land types (205.1a, 305.7), saddles and crews added up over
 *   the turn, enters counters as an amount.
 * - 128: generic families (A3a): owner filter and `ownerOf` reference, last known controller of an object gone from the
 *   battlefield this turn (`controllerOf`), different names when choosing and sacrificing as a cost, recipient of the
 *   damage of triggers (`to`).
 * - 129: medium families (A4b): objects of a "one or more" batch (`ref.eventObjects`), delayed ability linked to an
 *   object for the rest of the turn (`fx.whenThisTurn`, 603.7c), "the first time each turn" recorded before the "if"
 *   condition (`oncePerTurn: "firstEvent"`).
 * - 130: medium families (A4a): target owned by a designated player (`TargetSpec.of`: player of the event, defending
 *   player, player of another target), new targets of a spell with several targets, granted ability that knows the
 *   permanent that grants it (`ref.grantor`, `CostDef.grantor`).
 * - 131: medium families (A4c): free spell from any zone (`castPermission.freeFrom`), phases and steps added in their
 *   place (queues `turn.addedPhases`/`addedSteps`, rank of the main phase), counters removed among several creatures
 *   chosen by the player; the return of a creature by web-slinging is counted before the mana.
 * - 132: printings from the table (`STA-42@<id>`, `printing.ts`) kept by `createGame` and shown by the view.
 * - 133: Commander (PLAN-E, E2): `commander` variant (40 life, command zone, casting from it with the tax, return to
 *   the command zone 903.9a and 903.9b, 21 commander damage); only emblems have active abilities in the command zone.
 * - 134: free mulligan in a game with three players or more (103.5c): the first mulligan doesn't count.
 * - 135: mechanics that cite the commander (PLAN-E, E6): mana of the commander's identity, `commander` filter,
 *   abilities that work from the command zone (eminence), mana of an opponent's lands.
 * - 136: mana base of the Commander decks (PLAN-E, E8): `tapAnother` of a mana ability accepts a filter (Relic of
 *   Legends), read by the payment solver.
 * - 137: Edgar Markov's vampires (PLAN-E, E10): ascend and the city's blessing (702.131, state-based action); the
 *   condition of an `entersWith` that affects other permanents is checked (Vampire Socialite).
 * - 138: Y'shtola deck (PLAN-E, E12): cumulative upkeep (702.24), printed rebound, draw trigger "except the first one
 *   in their draw step" (`turnDraw`), zone change "of an opponent".
 * - 139: common spells of the Commander decks (PLAN-E, E9): protection of a player ("from opponents" or "from
 *   everything", 702.16j), "your life total can't change" (life loss prevented, 119.8: life payable 0), land back face
 *   of a modal card played as a land (712.12), "choose one or more" (`oneOrMore`).
 * - 140: two "like lands" sources (Exotic Orchard for two players) no longer consult each other (infinite recursion
 *   found by the three-player Commander fuzz).
 * - 141: 903.9b asked of the owner: a commander put into its owner's hand or library (draw included) can go to the
 *   command zone, at the next check, as from a graveyard or exile.
 * - 142: Path of Ancestry: scry 1 when its mana is spent to cast a creature spell that shares a creature type with your
 *   commander (triggered effect carried by the mana, `rider.effects`; reference `commanders`); "shares a creature type
 *   with" several objects: a type of one of them is enough.
 * - 143: The Ur-Dragon Commander deck: a condition read on resolution sees the triggering object and event (Selvala);
 *   myriad; marked mana kept until end of turn (Klauth) or carrying an effect produced by an effect (Arena of Glory);
 *   eminence of a player static; command zone in references and moves (Hellkite Courser); "with the same name as" a
 *   designated object; greatest amount among players; the payment doesn't use more sources that cost life than the
 *   player can pay (strict fuzz); 104.4b: a loop that accumulates (tokens, triggers on the stack) is a draw, and the
 *   choices made during the loop don't break it.
 * - 144: free mulligan in any Commander game, duel included (rule of the format); elsewhere, with three players or more
 *   (103.5c).
 * - 145: Rakdos, Lord of Riots Commander deck: "for each player" (`nth` reference), secretly chosen numbers, two costs
 *   to choose from for "unless they pay", annihilator and unearth read from the text, manifest from the hand, spell
 *   copy with starting loyalty, controlled turn followed by an extra turn, targets with different mana values, search
 *   bounded by an amount; a sacrificed card is followed into its new zone by the triggers of its sacrifice.
 * - 146: "discard a card or pay {2}" (Titania): the offered payment takes into account the commander tax and the extra
 *   costs (strict fuzz).
 * - 147: modal card whose front and back are lands (Pathways): the player chooses the played face (`playLand` and
 *   `back`).
 * - 148: "Multiverse Reforged" Commander precon: monarch (724: draw at the end step, transfer through combat damage,
 *   departure of the monarch), toxic (702.164), piles separated by the opponent, reveal in another player's library,
 *   restriction "can't attack your Jaces", protection of a player from a filter, "until that player's next turn"
 *   effects, variable life paid, unused mana and poison counters as amounts; the trigger of grouped combat damage
 *   passes on the creatures concerned. "Turtle Power!" precon: squad (702.157), fuse (702.102), evolve checked on
 *   triggering (comparison of amounts), X of a permanent known as soon as it enters, artifact mana spent, tokens that
 *   attack a designated player, copies sacrificed at end of combat, doubled draw triggers (Krang), prevention changed
 *   into counters on the protected permanent (Vigor), color excluded from a choice on entering (Thriving).
 * - 149: "Counter Blitz", "The Fantastic Four" and "Mutant Menace" Commander precons: rad counters (radiation at the
 *   beginning of the precombat main phase, proliferate of players), grouped mill (`milled` trigger, "milled this
 *   turn"), multikicker, equip a commander, control given back to the owners, keep a permanent of each nonland type,
 *   spell put on the bottom of the library, sacrifice replaced by a return to hand, P/T defined by the maximum of two
 *   amounts. Fix: "the first time this ability resolves this turn" is reset each turn (Nissa, Leyline Tamer and
 *   Belladonna Took only worked once per game).
 * - 150: PLAN-H H2a: approximations lifted by the scripts (The Endstone, Hapatra, Kitesail Larcenist, Choco, Radiant
 *   Lotus, Hollow Marauder, Garruk, Veiled Butcher, Betor, Whiskervale Forerunner, Thousand Moons Smithy, Sandswirl
 *   Wanderglyph, Ojer Kaslem…).
 * - 151: PLAN-H H2b: approximations lifted by the scripts (Krenko's Buzzcrusher, Kaya, Spirits' Justice, Jetsam, Super
 *   Intelligence, Sentinel of Lost Lore, The Legend of Yangchen, Kitsune, Madame Null, Shredder's Technique…); the
 *   optional choice of chooseAmong suggests another player's object first.
 * - 152: PLAN-H H2c: approximations lifted by the scripts (Finality, Black Bolt, Nightkin Ambusher, Negative Zone
 *   Portal, Mutational Advantage; Namor, Ragavan, Sylvan Library, Expropriate, Plague of Vermin shortened); prevention
 *   of damage to objects fixed on resolution (objectReplacement preventDamage).
 * - 153: PLAN-H H4: choose a player without targeting them (chooseAmong on players, at random; fx.chooseOpponent):
 *   piles separated by the chosen opponent, opponent of the gift chosen on casting (and kept by the copies), Discerning
 *   Financier, Sandstone Oracle, Zuko, Conflicted, Indoraptor.
 * - 154: PLAN-H H6: rules actions on the stack (rulesTrigger, synthetic sources rules:*): the monarch's draw (724.2)
 *   and the monarch changing after combat damage, radiation (if checked again on resolution), speed (702.179, once each
 *   turn).
 * - 155: PLAN-H H3: goad (701.38, fx.goad, BlockRule.goadedBy) and attack requirements (508.1d, mustAttackPlayer): the
 *   largest number of requirements satisfied, never a tax imposed; the AI and the default declaration respect them
 *   (attack restrictions of each creature included); Dack Fayden, Fast Forward, Taunt from the Rampart, Galactus,
 *   Silver Surfer, Maximum Carnage.
 * - 156: 800.4a: a question asked during a resolution of a player who has left the game is not asked; concession in the
 *   middle of a resolution (the ability of a departed player ceases to exist)
 * - 157: Mutant Menace: Mirelurk Queen, Nightkin Ambusher and The Master, Transcendent give their rad counters to the
 *   targeted player (the target was read under another name)
 * - 158: PLAN-H H5: attacked player in multiplayer (508.4: the controller chooses what a permanent put onto the
 *   battlefield attacking attacks), ninjutsu (702.49c: the defender of the returned creature), conditions on the
 *   attacked player (you only or your planeswalkers too), attack tax against you only
 * - 159: Serra's Emissary protects your creatures of the chosen type; equip abilities written by hand recognized as
 *   such (Kíli, Freya…); Exhaust of Liliana the Repentant
 * - 160: PLAN-H H8a: a single "keep" operation (choice in APNAP order, then simultaneous sacrifice or destruction;
 *   Tragic Arrogance: the caster chooses), Kindred Judgment, Sunspine Lynx, Momentum Breaker and Command Bridge on
 *   common forms
 * - 161: PLAN-H H8b: player statics merged (cantGainLife of the enchanted player, damage that can't be prevented,
 *   cantLose, skips, maxHandSize, lookAt, cantAttack), "doesn't untap" as a replacement of the untap step (Prop Room,
 *   loss of abilities), Hedge Whisperer: real choice (502.3)
 * - 162: PLAN-H H9: generic "as it enters" (asEnters: one loop for the four paths of entering; a copy makes the choices
 *   of its model, 707.9; nothing for a face-down one, 708.2); Echoing Deeps, Cursed Mirror, Altered Ego, Sin,
 *   Dawn-Blessed Pennant, Indominus Rex, Mox Diamond
 * - 163: Chosen card name (Skyseer's Chariot, Sorcerous Spyglass, The Clone Saga): the offered names and the suggestion
 *   no longer rely on the opponent's hand (hidden information), but on the permanents
 * - 164: Naming a card, a land card or a creature type: full catalog (outside the game state), public names first,
 *   official list of creature types (205.3m); no name taken from the opponents' decks anymore
 * - 165: Audit of 2026-10-07: names of cards with several faces (709.4, 715.4, 712.8a; "A // B" is not a name), goad
 *   kept despite the loss of abilities (701.38), defending player frozen on triggering (Namor, myriad, Specimen
 *   Freighter)
 * - 166: Raid Bombardment damages the player or planeswalker that the creature attacks
 * - 167: Mana value of an object that has ceased to exist: its last known information; a token moved off the
 *   battlefield stays designated (Zoyowa's Justice on a token makes you discover X)
 * - 168: Molten Tide adds an {R}; Virtue of Strength triples the mana; Eclipsed Realms: the eight tribes of Lorwyn;
 *   Talion no longer suggests based on cards exiled face down
 * - 169: Hancock, Ghoulish Mayor no longer pumps itself ("each other creature")
 * - 170: Nissa, Leyline Tamer deck (Commander): "target permanent" without a type (Alpha Deathclaw, Galactus, The
 *   Thing, Invisible Force Field, Forge of Heroes, Resourceful Defense); silenced arrivals for any ability they trigger
 *   and limited to the sources of the filter (Elesh Norn, Mother of Machines); top of the library put back in the
 *   chosen order (lookAtTop reorder); no question when all the cards looked at must be taken; emerge from an artifact
 * - 171: Mana: a source that taps another permanent (Springleaf Drum) doesn't count on a permanent already tapped or
 *   sacrificed for another cost of the same payment (Guardian of the Great Door)
 * - 172: The Vision deck (Commander): activated abilities of emblems (114.4, Karn, Living Legacy); delayed ability "the
 *   next time" without a duration (603.7c, `at: "next"`); a spell on the stack triggers only its "when you cast this
 *   spell" abilities (Ugin, Eye of the Storms); "mana value X or less" checked on casting with the announced X
 *   (Kozilek's Command, Here Comes a New Hero!, Agadeem's Awakening); a land that its "as it enters" effects put
 *   elsewhere counts as played (Scorched Ruins); protection outside the commander's identity; life of a cost computed
 *   (War Room); untapping during other players' untap step according to a filter (Unwinding Clock)
 * - 173: The Vision deck after the "Weight of the World" list (Ancient Tomb, Candelabra of Tawnos, Mana Vault, Mishra's
 *   Workshop, Null Brooch, Sensei's Divining Top); reserve cards of the proxy set (Eldrazi Conscription, Foundry
 *   Inspector, Palladium Myr, Portal to Phyrexia, Super State); attacking creatures become tapped before the attack tax
 *   (508.1f, 508.1h), and the one sacrificed to pay it leaves combat (Eldrazi Spawn: the engine crashed)
 * - 174: Dark Leo & Shredder deck (Commander): ninjutsu of the EDH cards; filter "blocked / unblocked attacking"
 *   (509.1h, Throatseeker); "can't have or gain [keyword]", applied at the end of layer 6 (Archetype of Courage);
 *   "can't be blocked by creatures that player controls" (The Black Gate); fear; granted myriad (Legion Loyalty); a
 *   legendary land that refers to itself by name in "you may pay N life" (The Black Gate)
 * - 175: The Ur-Sphinx deck (Commander): "connives X" (701.50e, Raffine); a player effect "during that player's next
 *   turn" (Azor); an additional whole beginning phase (Sphinx of the Second Sun); extra turns known to the rules
 *   (Medomai); removal from combat (Reconnaissance); "instead create one of each" tokens (Academy Manufactor);
 *   opening-hand reveal with effects at the first upkeep (Chancellor of the Spires); "not of the chosen name" read
 *   inside `not` (Sphinx Ambassador); another player chooses for the source; library zone reference
 * - 176: Vivi Ornitier deck (Commander): soulbond (702.95, Tandem Lookout); transmute read from the text (Dizzy
 *   Spell); "look at" cards seen by their player only (Gitaxian Probe, the Baubles); "copy this spell" while it
 *   resolves, by another player (Chain of Vapor); a copy may replace targets that no longer exist (707.10c); "any
 *   number" choices with a maximum (Intuition); "target spell with a single target" (Misdirection)
 * - 177: Sephiroth deck (Commander): "a permanent that shares a card type with it" (Braids, Arisen Nightmare), the
 *   sacrifice filters resolve the values of what is resolving; sacrifice as an alternative cost (the Flares)
 * - 178: Mario & Luigi deck (Commander): commander pairs (702.124, partner, Background…); blitz granted (Henzie
 *   "Toolbox" Torre); "times you've cast a commander" (Jirina Kudro); "the chosen player" (Saskia); bottom card of a
 *   library (Grenzo); "weaker than [this] can't block" (Champion of Lambholt); outlast read from the text; a
 *   "zoneChange" trigger from the battlefield keeps the permanent's last known information (Reyhan); effects on all
 *   players until the end of your next turn (Single Combat)
 * - 179: PLAN-J J4a: damage of the turn log carries the damaged and source objects ("was dealt damage this turn" also
 *   counts damage no longer marked; Tangled Colony counts the damage dealt to it this turn; Steel Hellkite reads the
 *   players its own object damaged); untaps logged (The Millennium Calendar only for one or more); Mimeoplasm's copy
 *   exceptions are copiable (707.9b); Consuming Aberration reveals then puts into the graveyard (no mill); Ertha Jo
 *   also sees granted abilities; a card manifested by an effect asks no shock-land or Aura-host question
 * - 180: PLAN-J J4b: Twists and Turns is an explore replacement (each copy scries 1); Warped Space is a free-cast
 *   permission from exile, once each turn per permission, never combined with another alternative cost (118.9a)
 * - 181: PLAN-J J4c: The Mindskinner's opponents really mill (mill replacements, "milled" event, turn log)
 * - 182: PLAN-J J5: looking at an opponent's hand (Sorcerous Spyglass, Arachne, Deep-Cavern Bat); untap during the
 *   other players' untap steps (Thousand Moons Infantry, Bender's Waterskin); counters as it is turned face up (Bubble
 *   Smuggler, Crowd-Control Warden); "the life lost this way" is the loss done (Gray Merchant, Malakir Bloodwitch,
 *   Exsanguinate); a counter of any kind for a cost (Scholar of New Horizons, O'aka); Chromatic Orrery's abilities;
 *   Jason Bright's "different", Hancock's counters of any kind, Lumbering Megasloth's player counters; Promise of
 *   Loyalty through keep; Deep Analysis's flashback life; Squirming Emergence checked at targeting; one commander for
 *   Hellkite Courser and Command Beacon; no question for a single mana color; Forbidden Orchard only tapped for mana;
 *   Riku's modal spells read from the text; colored cost reductions follow 118.7c
 * - 183: PLAN-J J6b: "on the bottom in any order" asks the order (read from the text, 12 cards); the cards put back on
 *   top in any order are ordered (Rowan's Grim Search); cascade's card not cast goes to the bottom shuffled with the
 *   others (702.85a); Dazzling Sphinx's cards in a random order
 * - 184: PLAN-J J6c: "with mana value X" on an activated ability's target is checked with the announced X (Likeness
 *   Looter, The Mycosynth Gardens, Rydia); the legal options offer only the targets of an affordable X (`xEquals`)
 * - 185: PLAN-J J6d: "is a [creature type]" replaces only the creature types, the other subtypes stay (205.1b)
 * - 186: PLAN-L L2: activated abilities from the command zone (commander ninjutsu, 702.49d); the players of a "one or
 *   more" batch kept with the trigger (`ref.eventPlayers`); a sacrifice that reduces the cost pays {N} each (Dargo)
 *   and never leaves mana in the pool
 * - 187: PLAN-L L3: a mana ability "in any combination" tapped by hand takes one type per mana (`tapForMana.colors`);
 *   Baxter Building, Realm-Scorcher Hellkite and Desolation of Smaug ask one division instead of four colors
 * - 188: PLAN-L L4: Exemplar of Light (counters you put), Orphans of the Wheat (itself too), damage really dealt
 *   (`storeDealt`: Sonic Shrieker, Torch the Tower), control while the source remains (Cytoplast Manipulator, The Super
 *   Hero Civil War), Central Elevator's names, Alania's "other than Alania", Eluge's {U} reduction (118.7c), a delayed
 *   ability that watches a player (Great Train Heist), Shinryu's chosen opponent, library and/or graveyard in one
 *   search (Vision Quest, Delivery Moogle, Fang-Druid Summoner), the first draw of the draw step from the turn log
 *   (Orcish Bowmasters, Notion Thief), curses fall off a protected player, Sorceress's Schemes' exiled card with
 *   flashback, Memories Returning's alternating choices, a sneaked creature whose defender is gone isn't attacking
 *   (508.4a)
 * - 189: PLAN-L L5a: Hawkeye pays {1} up to three times, then chooses up to that many modes in one ability; Nuka-Nuke
 *   Launcher's rad counters for the defending player until the end of their next turn, and intimidate with the color;
 *   Kíli replaces the whole equip cost; Abuelo's Awakening enters 1/1; Heirloom Epic's convoke
 * - 190: PLAN-L L5b: Moonlit Meditation's "you may" for amass, endure and gift tokens; the "as it enters" choices of
 *   token copies created by an effect are asked; Theorist's Sanctum beholds as it enters (a real choice, the card
 *   revealed); behold of several objects, also as a flashback cost (Kindle the Inner Flame)
 * - 191: PLAN-L L5c: the player who puts counters (infect and wither: the source's controller, 120.3d; costs: the
 *   payer; entering: the controller, 122.6a); ability counters are layer 6 effects timestamped on arrival (613.7);
 *   Eriette is a "becomes attached" trigger with a control that lasts while the Aura is attached; tokens created
 *   attacking are divided among the defenders (508.4)
 * - 192: PLAN-L L7: Phyrexian mana paid with life or mana as the player chooses (`phyrexianLife`, 107.4f); the color
 *   of the hybrid mana can be chosen for any hybrid spell
 * - 193: PLAN-L L11: "exile target spell" exiles spells (Mindbreak Trap); Endless Detour also moves a card from a
 *   graveyard; flashback with a mana cost read from the Oracle text (Siphon Insight, Faithless Looting, Lingering Souls,
 *   Strike It Rich had none); a creature with a mana ability can be tapped for convoke (702.51a); Akroma, Angel of Fury
 *   and Emrakul, the Promised End have their protections; Swift Demise destroys the creatures that were dealt damage;
 *   Shelinda's "otherwise" reads its condition once (`fx.ifElse`); Summoner's Sending reads the exiled card's mana
 *   value; Yuna's mana rider sees the spell it was spent on
 * - 194: Tevesh Szat & Jeska deck: Auras that enchant a card in a graveyard (Animate Dead), static abilities that work
 *   from the graveyard (Anger), an alternative cost that sacrifices several permanents (Demon of Death's Gate), a coin
 *   for each object (Rakdos, the Showstopper), "+N/+M" counters (Soul Exchange), discover and cascade filters resolved
 *   during the resolution (Tibalt's Trickery)
 * - 195: Deadpool deck: exchanged text boxes (612, layer 3, `LayerMods.textOf`); abilities that other players may
 *   activate (602.2, `activators`); a permanent that enters under an opponent's control; "can't attack its owner"; The
 *   Master, Multiplied's token shield; Opposition Agent's control of the opponents' searches; token copies with P/T
 *   amounts or attacking a designated player; a `modify` with a P/T amount no longer leaves a stale characteristics
 *   cache; multi-word creature types ("Time Lord") kept whole by the import; an announced X above a million is refused
 * - 196: PLAN-M M1: printed blitz read from the text (Jaxis, the Troublemaker); monstrosity (701.37) as a designation,
 *   not a counter (`fx.monstrosity`, "becomes monstrous" action trigger: proliferate no longer fires Grim
 *   Giganotosaurus again; Alpha Deathclaw and Maester Seymour can be activated again, doing nothing once monstrous);
 *   Possibility Storm exiles the spell first and puts it on the bottom with the other exiled cards
 * - 197: PLAN-M M3b: Assimilation Aegis as a "becomes attached" trigger: the creature becomes a copy of the exiled
 *   card for as long as the Equipment stays attached to it (`becomeCopy` whileAttached), with the timestamp of the
 *   effect, instead of a static; "for as long as it is attached" effects (Eriette, the Aegis) end as soon as the
 *   attachment moves or is removed, not at the next state-based check
 * - 198: PLAN-M M7: suspend gives haste to the suspended creature cast (not the next creature spell); a random pick put
 *   onto the battlefield is kept with the answers, so shock lands and "as enters" choices are asked; Grand Abolisher
 *   also locks mana abilities (Yuriko no longer locks activated mana abilities); granted storm (Ral's emblem,
 *   Prismari) counted when the spell is cast; suspect as a timestamped layer 6 effect; "at the beginning of the end
 *   step, sacrifice this token" as an ability of the token; a permanent's gift recipient carried by its triggers and
 *   "if kicked / gift promised" read from last known information; only the official creature types for changeling and
 *   "all creature types" (Soulstone Sanctuary, Shared Animosity, Diligent Zookeeper); Reflecting Pool counts Command
 *   Tower; Neriv reads "entered this turn" from last known information; Green Sun's Zenith shuffled only as it
 *   resolves; Quina's Frog (and Worldwalker Helm's Map) also for token copies; a permanent chosen for another cost of a
 *   spell (sacrifice, "discard or sacrifice", the kicker's permanent) no longer sacrifices itself for its mana (crash
 *   found by the fuzz: Demand Answers with a Treasure, Bogslither's Embrace blighting Traxos)
 */
export const RULES_VERSION = 198;

/** One checkpoint every N decisions (plus the last one of the game). */
export const CHECKPOINT_EVERY = 25;

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  version: typeof RECORD_VERSION;
  seed: number;
  /**
   * Starting player imposed at creation (absent: drawn at random by the engine, which consumes its randomness; the
   * replay must redo this draw, not replace it with its result).
   */
  startingPlayer?: PlayerId;
  startingLife?: number;
  /** Rules variant (PLAN-E: `commander`). */
  variant?: GameVariant;
  /**
   * `printings`: printing chosen for each card of the deck (same order; absent if none); `commanders`: indices of the
   * commanders in the deck (Commander).
   */
  players: { id: PlayerId; name: string; deck: string[]; printings?: (string | null)[]; commanders?: number[] }[];
  /** Applied decisions, in order: [player who decided, decision]. */
  decisions: [PlayerId, Decision][];
  /** Start date (ISO), for display. */
  createdAt?: string;
  /** Version of the engine rules that played the game (absent: 0). */
  rules?: number;
  /** Checkpoints: [number of applied decisions, `outcomeHash` of the resulting state]. */
  checkpoints?: [number, string][];
}

/** Creates the game and the record that will allow replaying it. */
export function createRecordedGame(opts: GameOptions): StepResult & { record: GameRecord } {
  const result = createGame(opts);
  const record: GameRecord = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    seed: opts.seed,
    startingPlayer: opts.startingPlayer,
    startingLife: opts.startingLife,
    ...(opts.variant ? { variant: opts.variant } : {}),
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map((c) => c.name),
      ...(p.printings?.some(Boolean) ? { printings: p.deck.map((_, i) => p.printings?.[i] ?? null) } : {}),
      ...(p.commanders?.length ? { commanders: [...p.commanders] } : {}),
    })),
    decisions: [],
    createdAt: new Date().toISOString(),
    rules: RULES_VERSION,
    checkpoints: [],
  };
  return { ...result, record };
}

/**
 * Adds an accepted decision to the record, with a checkpoint every `every` decisions (`CHECKPOINT_EVERY` by default;
 * 1 for the save of a local game, checked decision by decision on resume).
 */
export function recordDecision(
  record: GameRecord,
  player: PlayerId,
  d: Decision,
  after: GameState,
  every: number = CHECKPOINT_EVERY,
): void {
  record.decisions.push([player, d]);
  const n = record.decisions.length;
  if (n % every !== 0 && !after.over) return;
  record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(after)]];
}

/** Checks the shape of a received record (imported file, server disk). */
export function isGameRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  return (
    !!r &&
    r.format === RECORD_FORMAT &&
    r.version === RECORD_VERSION &&
    Number.isInteger(r.seed) &&
    (r.rules === undefined || Number.isInteger(r.rules)) &&
    (r.checkpoints === undefined ||
      (Array.isArray(r.checkpoints) &&
        r.checkpoints.every((c) => Array.isArray(c) && Number.isInteger(c[0]) && typeof c[1] === "string"))) &&
    (r.startingPlayer === undefined || typeof r.startingPlayer === "string") &&
    (r.variant === undefined || r.variant === "commander") &&
    Array.isArray(r.players) &&
    r.players.every(
      (p) =>
        typeof p?.id === "string" &&
        typeof p.name === "string" &&
        Array.isArray(p.deck) &&
        (p.commanders === undefined ||
          (Array.isArray(p.commanders) && p.commanders.every((i) => Number.isInteger(i) && i >= 0 && i < p.deck.length))) &&
        (p.printings === undefined ||
          (Array.isArray(p.printings) && p.printings.every((k) => k === null || typeof k === "string"))),
    ) &&
    Array.isArray(r.decisions) &&
    r.decisions.every((d) => Array.isArray(d) && typeof d[0] === "string" && !!d[1] && typeof d[1] === "object")
  );
}

function initial(record: GameRecord, resolve: (name: string) => CardDef): StepResult {
  return createGame({
    seed: record.seed,
    startingPlayer: record.startingPlayer,
    startingLife: record.startingLife,
    variant: record.variant,
    players: record.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map(resolve),
      printings: p.printings,
      commanders: p.commanders,
    })),
  });
}

/** Replays the game up to decision `upTo` (excluded; all by default): state and events produced. */
export function replayGame(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  upTo = record.decisions.length,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = initial(record, resolve);
  const all = [...events];
  for (const [player, d] of record.decisions.slice(0, upTo)) {
    ({ state, events } = submit(state, player, d));
    all.push(...events);
  }
  return { state, events: all };
}

/** All the states of the game: the start, then one per decision (step-by-step replays). */
export function replayStates(record: GameRecord, resolve: (name: string) => CardDef): GameState[] {
  let { state } = initial(record, resolve);
  const out = [state];
  for (const [player, d] of record.decisions) {
    state = submit(state, player, d).state;
    out.push(state);
  }
  return out;
}

/** Checked replay: where and why the game stops being the one that was recorded. */
export interface ReplayDivergence {
  /** Number of decisions applied without discrepancy. */
  index: number;
  reason: "error" | "checkpoint";
  message: string;
}

/**
 * Replays the record checking its checkpoints, and stops at the first divergence: refused decision (or engine error),
 * or different fingerprint. `onStep` receives each validated state (the start included) and the events that lead to
 * it. Only the states before the failing checkpoint are shown as safe: the discrepancy may date from before it, but
 * not from before the previous checkpoint.
 */
export function replayChecked(
  record: GameRecord,
  resolve: (name: string) => CardDef,
  onStep?: (state: GameState, events: GameEvent[]) => void,
): { state: GameState; applied: number; divergence: ReplayDivergence | null } {
  let { state, events } = initial(record, resolve);
  onStep?.(state, events);
  const expected = new Map(record.checkpoints ?? []);
  let verified = { state, applied: 0 };
  const pending: [GameState, GameEvent[]][] = [];
  const flush = () => {
    for (const [st, ev] of pending) onStep?.(st, ev);
    pending.length = 0;
  };
  for (let i = 0; i < record.decisions.length; i++) {
    const [player, d] = record.decisions[i] as [PlayerId, Decision];
    try {
      ({ state, events } = submit(state, player, d));
    } catch (e) {
      flush();
      const message = e instanceof Error ? e.message : String(e);
      return { state, applied: i, divergence: { index: i, reason: "error", message } };
    }
    pending.push([state, events]);
    const hash = expected.get(i + 1);
    if (hash === undefined) continue;
    if (hash !== outcomeHash(state)) {
      pending.length = 0;
      return {
        state: verified.state,
        applied: verified.applied,
        divergence: { index: verified.applied, reason: "checkpoint", message: `discrepancy found at decision ${i + 1}` },
      };
    }
    flush();
    verified = { state, applied: i + 1 };
  }
  flush();
  return { state, applied: record.decisions.length, divergence: null };
}
