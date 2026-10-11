/** Engine types — game state: objects, players, stack, combat, pending triggers. Re-exported by `types.ts`. */
import type {
  AbilityDef,
  CardDef,
  CardType,
  ChoiceValue,
  Color,
  Condition,
  Effect,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ModeDef,
  PendingDecision,
  PlayerStaticAbilityDef,
  TargetSpec,
  TriggerSpec,
} from "../types";

export type PlayerId = string;
export type ObjectId = string;

/** "command": command zone (Commander, emblems). */
/** `phasedOut`: a phased-out permanent (702.26), treated as though it didn't exist until it phases in. */
export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "stack" | "exile" | "command" | "phasedOut";

export type Step =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "beginCombat"
  | "declareAttackers"
  | "declareBlockers"
  | "firstStrikeDamage"
  | "combatDamage"
  | "endCombat"
  | "main2"
  | "end"
  | "cleanup";

export const STEPS: readonly Step[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
  "main2",
  "end",
  "cleanup",
];

/** A designation a player keeps for the rest of the game (`PlayerState.designations`). */
export type PlayerDesignation = "citysBlessing" | "enduringStory";

export interface GameObject {
  /** Changes on each zone change (rule 400.7). */
  id: ObjectId;
  /** Physical identity of the card, stable across zones. Used only for display. */
  /** Cards linked by their physical identity (The Darkness Crystal: "exiled with"). */
  linkedUids?: string[];
  /** Host it was attached to before being unattached by a state-based action (Zack Fair). */
  lastAttachedTo?: ObjectId;
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  tapped: boolean;
  damage: number;
  /** Was dealt damage by a source with deathtouch since the last check. */
  deathtouched: boolean;
  /** Regeneration shields (701.19): each replaces the next destruction; they disappear at cleanup. */
  regenShields?: number;
  /** Counters by name: "+1/+1", "-1/-1", "stun", "loyalty"… */
  counters: Record<string, number>;
  /**
   * Timestamp of the last counter of each keyword kind put on it (flying, lifelink…): such a counter is a layer 6 effect
   * with that timestamp (122.1b, 613.7), so a later "loses all abilities" removes its keyword.
   */
  counterTimestamps?: Record<string, number>;
  /** Number of the turn during which the current controller gained control of it. */
  controlledSince: number;
  /**
   * Layer 2: controller in the absence of any control effect (who put the permanent onto the battlefield, 110.2).
   * Set as it enters; `controller` is the value computed by `syncControl` (control.ts).
   */
  baseController?: PlayerId;
  timestamp: number;
  isToken: boolean;
  /** "Only once" abilities already activated, or triggered ("triggers only once"): their indexes. */
  used?: number[];
  /** Permanent that entered from a kicked spell (or the copy of a kicked spell, 707.10). */
  kicked?: boolean;
  /** X paid to put it onto the battlefield (spell cast, Dune Drifter) or to turn it face up. */
  x?: number;
  /** How the spell that put it onto the battlefield was cast (absent: entered without being cast). */
  cast?: CastInfo;
  /** Aura or Equipment: the permanent it is attached to (301.5, 303.4). */
  attachedTo?: ObjectId;
  /** Soulbond (702.95): the creature this one is paired with (each one points to the other). */
  pairedWith?: ObjectId;
  /** Choices made as it entered (creature type, color, card name). */
  chosen?: {
    creatureType?: string;
    color?: Color;
    cardName?: string;
    landType?: string;
    parity?: "odd" | "even";
    mode?: string;
    number?: number;
    /** A player (Saskia the Unyielding: "as it enters, choose a player"). */
    player?: PlayerId;
    /** Secret choice (A Killer Among Us): hidden from opponents until it is revealed. */
    secret?: boolean;
  };
  /** Prepared (Reality Fracture): id of the copy of its spell, in exile. */
  preparedCopy?: ObjectId;
  /** Copy of a prepared spell (in exile then on the stack): the permanent that prepared it. Ceases to exist outside these zones. */
  preparedFor?: ObjectId;
  /** Active face of a multi-faced card (Adventure cast, back face…): its characteristics replace those of the card. */
  faceDefId?: string;
  /**
   * Face down (708): the object has the generic "face-down" definition (nameless 2/2 creature); the real card, the
   * ward {2} (disguise, cloak) and the costs to turn it face up are kept here.
   */
  faceDown?: { card: string; ward: boolean; upCosts: ManaCost[] };
  /** Zone the object came from into its current zone (Supper for Spiders: "from the battlefield"). */
  arrivedFrom?: Zone;
  /** Harnessed (Harness, Marvel Super Heroes): its ∞ abilities are active. */
  harnessed?: boolean;
  /**
   * Card exiled by a mechanic that makes it castable from exile on a later turn, and turn of the exile: warp
   * (702.185a, `warp`), plot (702.170d, `plot`), foretell (702.143a, `foretell`).
   */
  exiledVia?: { kind: "warp" | "plot" | "foretell"; turn: number };
  /** Exerted: doesn't untap during its controller's next untap step. */
  exerted?: boolean;
  /** Class (716): current level (1 by default). */
  classLevel?: number;
  /** Case (719): solved. */
  solved?: boolean;
  /** Monstrous (701.37b): a designation, not a counter (proliferate doesn't touch it); lost when it leaves the battlefield. */
  monstrous?: boolean;
  /** Room (709.5): unlocked doors (face indexes). */
  unlocked?: number[];
  /** Melded permanent (701.42): the two cards that form it; it becomes these cards again as it leaves the battlefield. */
  melded?: { defId: string; uid: string }[];
  /** Card "on an adventure" (715.4): exiled after its Adventure resolved; its owner may cast the creature. */
  onAdventure?: boolean;
  /** Copy of a card (Uldaros): leaves exile only for the stack; becomes a token on the battlefield. */
  cardCopy?: boolean;
  /**
   * Temporary emblem: it disappears at the end of turn `endOfTurn` (its number: this turn, or the end of your next
   * turn), or at the beginning of the next turn of player `turnOf` ("until your next turn").
   */
  expires?: { endOfTurn: number } | { turnOf: PlayerId };
  /** Has already dealt combat damage (Ruric Thar). */
  dealtCombatDamage?: boolean;
  /** Suspended exiled card (702.62): a time counter is removed at each of its owner's upkeeps. */
  suspended?: boolean;
  /**
   * Suspected (701.60, Murders at Karlov Manor): the timestamp at which it became suspected. Menace and "can't block"
   * are a layer 6 effect with that timestamp (a later "loses all abilities" removes them; it stays suspected).
   */
  suspected?: number;
  /** Has already dealt damage, combat or not (Karakyk Guardian). */
  dealtDamage?: boolean;
  /** Linked cards (exiled by this card, Hoarding Dragon). */
  linked?: ObjectId[];
  /** Exiled face down (406.3): the players who may look at it (empty: nobody). */
  exiledFaceDown?: PlayerId[];
  /** Unearthed (702.84a): if it would leave the battlefield, it is exiled instead. */
  exileIfLeaves?: boolean;
  /** Creatures that saddled or crewed this permanent (cost paid this turn). */
  crewedBy?: { turn: number; ids: ObjectId[] };
  /** Sources that dealt damage to it this turn (Predator Ooze). */
  damagedBy?: ObjectId[];
  /**
   * Modes already chosen (Demonic Pact); `turn`: the turn they refer to for the unique "this turn" modes (the list
   * starts over on another turn).
   */
  usedModes?: { modes: number[]; turn?: number };
}

/** A tagged mana in the pool (`PlayerState.restrictedMana`). */
export interface TaggedMana {
  type: ManaType;
  restriction?: ManaRestriction;
  source?: ObjectId;
  chosen?: GameObject["chosen"];
  rider?: ManaAbilityDef["rider"];
  /** "Until end of turn, you don't lose this mana as steps and phases end" (Klauth, Unrivaled Ancient). */
  keep?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  life: number;
  /** Noncombat damage dealt to them last turn (Command the Stage). */
  noncombatDamageLastTurn?: number;
  library: ObjectId[];
  hand: ObjectId[];
  graveyard: ObjectId[];
  command: ObjectId[];
  /** Phased-out permanents of this player (owner) (702.26). */
  phasedOut: ObjectId[];
  manaPool: Record<ManaType, number>;
  /**
   * Tagged mana of the pool, one entry per mana: restricted (Ashling, Rimebound: "only for spells with MV 4 or
   * greater") or carrying an effect (Cavern of Souls: "can't be countered"). `source` and `chosen`: the source that
   * produced it and its choice ("of the chosen type"), frozen on production.
   */
  restrictedMana?: TaggedMana[];
  /** Drew from an empty library since the last check (704.5b); `"win"`: replaced by a win (Laboratory Maniac). */
  drewFromEmptyLibrary: boolean | "win";
  lost: boolean;
  mulligans: number;
  /** Number of the last turn started by this player (0 if they haven't played yet). */
  lastTurnStarted: number;
  /** Starting life total (conditions "above your starting life total"). */
  startingLife: number;
  turnStats: TurnStats;
  /**
   * Counters on the player (122.1). `poison`: poison counters (104.3d: 10 or more, the player loses); `rad`: rad
   * counters (Fallout: at the beginning of their precombat main phase, the player mills that many cards; for each
   * nonland card milled, they lose 1 life and a counter, `radiation`, turn.ts).
   */
  counters?: { poison?: number; rad?: number };
  /** Number of turns started by this player (Jace Reawakened). */
  turnsTaken?: number;
  /** Speed (702.179): absent as long as no "Start your engines!" has started it; 4 = max speed. */
  speed?: number;
  /**
   * Designations kept for the rest of the game: the city's blessing (702.131, gained through ascend), an enduring story
   * (Storied, The Hobbit).
   */
  designations?: PlayerDesignation[];
  /** Mana that doesn't empty until end of turn (Savage Ventmaw). */
  manaKeep?: Partial<Record<ManaType, number>>;
  /** Mana that doesn't empty until end of combat (firebending). */
  manaKeepCombat?: Partial<Record<ManaType, number>>;
}

/**
 * Effect on a player, created by a resolution ("this turn, you may play an additional land", "you can't gain life"):
 * an ordinary player static, read by `playerStatic` (statics.ts) as if the player controlled it. `until`: last turn
 * it applies (null: the whole game); `once`: removed on its first use (`consumePlayerEffect`).
 */
export interface PlayerEffect {
  id: string;
  player: PlayerId;
  ability: PlayerStaticAbilityDef;
  until: number | null;
  /** First turn the effect applies ("during that turn": Kang the Conqueror's extra turn); from now on otherwise. */
  from?: number;
  once?: boolean;
  /** Timestamp of the effect (613.11: effects on the rules of the game, such as maximum hand size). */
  timestamp: number;
}

export interface StackItem {
  /** For a spell: id of the card object on the stack. For an ability: its own id. */
  id: string;
  /** Esper Origins: after the resolution, exiled then put onto the battlefield transformed with a finality counter. */
  toBattlefieldTransformed?: boolean;
  /** Modifications when the permanent enters (Torgal, Summon: Fenrir, Summon: Brynhildr, Noctis). */
  /** `atEnd`: the token (copy of a creature spell) gains "At the beginning of the end step, sacrifice this token". */
  /** `nonlegendary`: the copy isn't legendary (copy exception, 707.9b; Jackal, The Clone Saga). */
  arrival?: {
    counters?: { kind: string; n: number }[];
    haste?: boolean;
    subtypes?: string[];
    atEnd?: "sacrifice";
    nonlegendary?: boolean;
    /** Starting loyalty instead of the printed one (copy from Ob Nixilis, the Adversary). */
    loyalty?: number;
  };
  kind: "spell" | "ability";
  controller: PlayerId;
  /** Spell: the object on the stack. Ability: the source permanent (may have disappeared). */
  sourceId: ObjectId;
  sourceDefId: string;
  abilityIndex: number;
  mode: number;
  targets: Record<string, string[]>;
  x: number;
  kicked: boolean;
  /** Spell cast (absent for an ability or a copy): how it was cast. */
  cast?: CastInfo;
  /** Last known information of the source (abilities). */
  sourceSnapshot: { keywords: Keyword[]; power: number; controller: PlayerId };
  /** Triggered ability: what triggered it. */
  event?: TriggerEventData;
  /** Cast with flashback: exiled instead of going to the graveyard. */
  flashback?: boolean;
  /**
   * Into its owner's library instead of the graveyard: on the bottom (`bottom`, Kylox's Voltstrider, Ultimate
   * Nullification) or shuffled into it (`shuffle`, Green Sun's Zenith).
   */
  libraryInstead?: "bottom" | "shuffle";
  /** Adventure cast: exiled "on an adventure" after its resolution. */
  adventure?: boolean;
  /** Objects paid for the cost. */
  paid?: CostPaid;
  /** Sources whose mana was used to cast it ("using mana produced by [this source]"). */
  manaSources?: ObjectId[];
  /** Rebound (702.88, granted by Ojer Pakpatiq). */
  rebound?: boolean;
  /** Exiled as it resolves instead of going to the graveyard, with this counter if it is named (Goliath Daydreamer: "dream"). */
  exileWithCounter?: string;
  /** Lilah: exiled and plotted instead of going to the graveyard. */
  plotOnResolve?: boolean;
  /** Delayed or reflexive ability: its own effects and targets. */
  inline?: InlineAbility;
  /**
   * Copy of a spell or ability (707.10). A spell copy is an object on the stack (`cardCopy`), without a card: it
   * ceases to exist as it leaves the stack, except a copy of a permanent spell, which becomes a token.
   */
  copy?: boolean;
  /**
   * Choices still to be announced before the next priority (`announceNext`, stack.ts): new targets of a copy
   * (707.10c), one step per word "target" then `announce` ("becomes the target"); division (601.2d, 603.3d).
   */
  pendingChoices?: PendingStackChoice[];
  /** Announced division (601.2d): per word "target", the share of each target, in the order of the targets. */
  division?: Record<string, number[]>;
  /** "This spell can't be countered" (granted on cast). */
  uncounterable?: boolean;
  /** Effects of mana spent (Carnelian Orb, Pyromancer's Goggles). */
  riders?: ("haste" | "copy" | "uncounterable")[];
}

/** Choice of a stack item still to be made (see `StackItem.pendingChoices`). */
export type PendingStackChoice =
  | { step: "target"; spec: string }
  | { step: "announce" }
  | { step: "divide" }
  /** The opponent who will get the promised gift (702.174a). */
  | { step: "gift" };

/** Ability created during the game (delayed, reflexive): no index in its source's definition. */
export interface InlineAbility {
  targets: TargetSpec[];
  effects: Effect[];
  /** References frozen on creation (e.g. "this creature" exiled). */
  bound?: Record<string, string[]>;
  /** Values frozen on creation (e.g. number of counters of the dead creature). */
  vars?: Record<string, ChoiceValue[]>;
  /** Triggered ability granted "if…": the condition, checked again on resolution (603.4). */
  condition?: Condition;
  /** Modal ability ("when you do, choose one —", Hylda; granted modal ability): the mode is chosen when it is put on
   * the stack, then its targets; `targets` and `effects` are then ignored. */
  modes?: ModeDef[];

  label?: string;
}

/** Timing of a delayed ability: next end step, end step of your next turn, end of combat. */
export type DelayedTiming =
  | "nextEndStep"
  | "yourNextEndStep"
  | "yourEndStep"
  | "endOfCombat"
  | "nextUpkeep"
  | "yourNextUpkeep"
  /** "at the beginning of your next main phase" (Mana Sculpt). */
  | "yourNextMain"
  /**
   * "When [this object] … this turn" (603.7c): the delayed ability triggers on an event (`DelayedTrigger.on`), each
   * time it happens until end of turn.
   */
  | "thisTurn"
  /**
   * "When [this object] …" without a duration (603.7c): the delayed ability triggers only once, the next time the
   * event happens, then ends (Ugin, the Ineffable: "when this token leaves the battlefield").
   */
  | "next";

export interface DelayedTrigger {
  id: string;
  controller: PlayerId;
  sourceId: ObjectId;
  sourceDefId: string;
  at: DelayedTiming;
  /** Created during an end step or the cleanup: triggers only at the end step of the following turn. */
  /** `thisTurn`: the turn of its creation (it ends with it). */
  notBeforeTurn: number;
  /** `thisTurn`: it lasts until the end of this turn rather than of its creation's ("until the end of that player's next turn"). */
  untilTurn?: number;
  ability: InlineAbility;
  /** Delayed ability on an event ("when this creature dies this turn", Grim Javelineer): the trigger. */
  on?: TriggerSpec;
  /** Watched objects (603.7c): the event object must be one of them. */
  watch?: ObjectId[];
}

/**
 * Counters of the current turn, per player, specific to one rule (order of the spells, first coin…). What happened
 * during the turn and that the cards query (life gained or lost, draws, discards, crimes…) is in the turn log
 * (`s.turnLog`, `turnlog.ts`).
 */
export interface TurnStats {
  spellsCast: number;
  /** Coin flips of this player this turn (Edgar). */
  coinFlips?: number;
  /** Exhaust abilities activated this turn (Elvish Refueler). */
  exhaustActivated?: number;
  /** Total mana spent to cast spells this turn (Expend, Bloomburrow). */
  manaSpentOnSpells?: number;
}

/**
 * Alternative cost paid to cast a spell (601.2b, only one per cast), read by rules or abilities: Web-slinging, Mayhem,
 * Sneak, evoke (702.74), Warp, impending (702.176), dash (702.109).
 */
export type CastVia = "webSlinging" | "mayhem" | "sneak" | "evoke" | "warp" | "impending" | "dash" | "blitz";

/** Objects paid for the cost of a spell or ability (last known information available). */
export interface CostPaid {
  sacrificed?: ObjectId[];
  /** Discarded cards (Grab the Prize). */
  discarded?: ObjectId[];
  /** Exiled cards (craft materials, Fear of Abduction: linked to the permanent). */
  exiled?: ObjectId[];
  /** Tapped permanents (station). */
  tapped?: ObjectId[];
  /**
   * Permanent chosen or card revealed to behold (Monstrous Emergence: "the chosen creature or the revealed card"), or
   * exiled card chosen (Close Encounter).
   */
  beheld?: ObjectId[];
  /** Ninjutsu (702.49c): what the returned unblocked attacker was attacking (player or planeswalker). */
  defender?: string;
}

/**
 * How a spell was cast: noted on the stack (`StackItem.cast`), then on the permanent it becomes (`GameObject.cast`),
 * read by the conditions "if it was cast…" and the rules (warp, impending, evoke).
 */
export interface CastInfo {
  /** Zone it was cast from. */
  from: Zone;
  via?: CastVia;
  /** Mana spent to cast it, in total and per type. */
  manaSpent?: number;
  spentColors?: Partial<Record<ManaType, number>>;
  /**
   * Share of the mana spent by source: `cave`, produced by Caves (Bat Colony); `artifact`, by artifact sources (Coin
   * of Mastery). Not copiable (`copyStackItem`).
   */
  spentFrom?: { cave?: number; artifact?: number };
  /** Creature returned to hand for Web-slinging (Scarlet Spider, Ben Reilly). */
  costBounced?: ObjectId[];
  /** Sneak: what the returned creature was attacking (the permanent enters tapped and attacking). */
  sneakDefender?: string;
  /** Behold as an additional cost (`cond.beheld`). */
  beheld?: boolean;
  /** `CardDef.rules.whenCast` met on cast ("if you controlled a Faerie as you cast this spell"). */
  metWhenCast?: boolean;
  /**
   * Promised gift (702.174a): the opponent chosen as the spell is cast, announced like a division (`announceNext`);
   * absent with a single opponent (it's them), except on a copy, which keeps the original's opponent (707.10).
   */
  giftTo?: PlayerId;
}

/** Turn event (`turnlog.ts`): move, spell cast, sacrifice, damage. */
export type TurnLogEntry =
  | {
      e: "zone";
      /** `null`: token created (it comes from no zone). */
      from: Zone | null;
      to: Zone;
      owner: PlayerId;
      /** Controller at the time it left (last known information for the battlefield). */
      controller: PlayerId;
      types: CardType[];
      subtypes: string[];
      supertypes?: string[];
      token?: boolean;
      /** Entered face down (Tunnel Tipster: "a face-down creature entered the battlefield under your control"). */
      faceDown?: boolean;
      /** On the battlefield: the new object (`enteredThisTurn`: "each other nonland permanent that entered this turn"). */
      id?: ObjectId;
    }
  | {
      e: "cast";
      player: PlayerId;
      /** The card's name ("the first Otter spell other than Alania", PLAN-L L4). */
      name?: string;
      types: CardType[];
      subtypes: string[];
      supertypes: string[];
      fromZone: Zone;
      token?: boolean;
      /** Mana value of the spell (Rhino, Barreling Brute: "a spell with mana value 4 or greater"). */
      manaValue?: number;
      /** Cast for its warp cost (Vide, Edge of Eternities). */
      warped?: boolean;
      /** Keywords of the spell cast (Momo, Friendly Flier: "creature spell with flying"). */
      keywords?: Keyword[];
      /** Colors of the spell cast (Veil of Summer: "a blue or black spell"). */
      colors?: Color[];
    }
  /** Land played (305.1), with its starting zone ("played a land from anywhere other than your hand", Spider-Man 2099). */
  | { e: "playLand"; player: PlayerId; fromZone: Zone; types: CardType[]; subtypes: string[] }
  /** Attack of a creature: `player` attacks `defender` (the attacked player, or the planeswalker's controller). */
  /** `id`: the attacker ("a creature that attacked this turn"). */
  | { e: "attack"; player: PlayerId; defender: PlayerId; types: CardType[]; subtypes: string[]; id?: ObjectId }
  | { e: "sacrifice"; player: PlayerId; types: CardType[]; subtypes: string[]; supertypes?: string[]; token?: boolean }
  /**
   * Counters put on a permanent (`id`); `player`: the one who puts them (controller of what is resolving). Also read
   * per object (`countersPutThisTurn`: "the first time this turn", "you put counters on it this turn").
   */
  | { e: "counters"; player: PlayerId; kind: string; n: number; types: CardType[]; subtypes: string[]; id: ObjectId }
  /**
   * Activated ability (not a special action) of object `id`; `equip`: an equip ability (Kíli the Resourceful);
   * `loyalty`: a loyalty ability (606.3: one per turn); `index`: the index of a "once each turn" ability.
   */
  | {
      e: "activate";
      player: PlayerId;
      equip?: boolean;
      loyalty?: boolean;
      types?: CardType[];
      subtypes?: string[];
      id?: ObjectId;
      index?: number;
    }
  /** A permanent becomes tapped ("the first time it becomes tapped this turn"); `player`: who taps it. */
  | { e: "tap"; player: PlayerId; id: ObjectId; types?: CardType[]; subtypes?: string[] }
  /** A permanent untaps; `untapStep`: during its controller's untap step (The Millennium Calendar). */
  | { e: "untap"; player: PlayerId; id: ObjectId; untapStep?: boolean; types?: CardType[]; subtypes?: string[] }
  /** A Mount becomes saddled (702.171b: until end of turn). */
  | { e: "saddled"; player: PlayerId; id: ObjectId; types?: CardType[]; subtypes?: string[] }
  /** Life gained or lost by `player` (one event per gain or loss). */
  | { e: "lifeGain" | "lifeLoss"; player: PlayerId; amount: number; types?: CardType[]; subtypes?: string[] }
  /** A card drawn; cards discarded (`amount`); a scry or a surveil; a crime (700.13); a permanent turned face
   * up. */
  /** `search`: search of one's library (Archive Trap: "if an opponent searched their library"). */
  /** `drawStep`: a card drawn during the player's own draw step (Orcish Bowmasters, Notion Thief: "except the first"). */
  | {
      e: "draw" | "scry" | "crime" | "turnFaceUp" | "search";
      player: PlayerId;
      types?: CardType[];
      subtypes?: string[];
      drawStep?: boolean;
    }
  /** `id`: the discarded card, in its new zone (Mayhem: "if you discarded it this turn"). */
  | { e: "discard"; player: PlayerId; amount: number; types?: CardType[]; subtypes?: string[]; id?: ObjectId }
  /** Element bending (Avatar). */
  | { e: "bend"; player: PlayerId; kind: "water" | "earth" | "fire" | "air"; types?: CardType[]; subtypes?: string[] }
  | {
      e: "damage";
      /** Damaged player, or controller of the damaged permanent. */
      player: PlayerId;
      toPlayer: boolean;
      amount: number;
      combat: boolean;
      sourceController: PlayerId;
      sourceColors: Color[];
      sourceTypes: CardType[];
      /** Subtypes of the source (prowl, 702.76: "a creature of one of its creature types"). */
      sourceSubtypes?: string[];
      sourceSupertypes: string[];
      /** Identity of the source ("three or more sources dealt damage", Case of the Burning Masks). */
      sourceKey?: string;
      /** The damaged permanent (an object that changes zones is a new object, 400.7) and the source object, if any. */
      id?: ObjectId;
      sourceId?: ObjectId;
      types?: CardType[];
      subtypes?: string[];
      supertypes?: string[];
      token?: boolean;
    };

/**
 * Query on the turn log (`amount.turnEvents`). `who`: the player concerned (owner of the moved card, or its controller
 * if it was leaving the battlefield; caster; damaged player; sacrificer), seen from the ability's controller; absent:
 * all. `sum`: sum of the damage rather than number of entries; `perPlayer`: a single player's greatest total.
 */
export interface TurnLogQuery {
  event: TurnLogEntry["e"];
  who?: "you" | "opponent";
  /** Move: the player concerned is the owner ("put into your graveyard", Descend). */
  byOwner?: boolean;
  /**
   * Characteristics of the entry's object (a single comparator, `turnlog.ts`, also for `source`): at least one of these
   * types, this subtype, this supertype, at least one of these colors (only spells cast have them: "a blue or black
   * spell").
   */
  types?: CardType[];
  subtype?: string;
  supertype?: string;
  colors?: Color[];
  /** None of these types ("noncreature spell"). */
  notTypes?: CardType[];
  notSubtype?: string;
  /** A spell cast that has this keyword ("creature spell with flying"). */
  keyword?: Keyword;
  token?: boolean;
  /** Move: entered face down (or not). */
  faceDown?: boolean;
  /**
   * Attack: against the querying player ("each opponent who attacked you this turn"). Set by the engine (`stack.ts`,
   * `attackedYou` cast limits), never by a card.
   */
  againstYou?: boolean;
  /** Spell cast for its warp cost. */
  warped?: boolean;
  /** Spell with mana value at least this. */
  minManaValue?: number;
  /** Activated ability: only equip abilities. */
  equip?: boolean;
  from?: Zone;
  to?: Zone;
  fromZone?: Zone;
  combat?: boolean;
  toPlayer?: boolean;
  /**
   * Damage: its source, compared like the entry's object (types, subtype, supertype, colors); `controller`: a source
   * the querying player controlled.
   */
  source?: Pick<TurnLogQuery, "types" | "subtype" | "supertype" | "colors"> & { controller?: "you" };
  /** The sum of the quantities (damage, life, discarded cards) rather than the number of entries. */
  sum?: boolean;
  /**
   * Damage: only the damage dealt to the ability's source (`target`: Tangled Colony, "the amount of damage dealt to it
   * this turn") or by it (`source`: Steel Hellkite, "dealt combat damage by this creature this turn").
   */
  self?: "target" | "source";
  /** Untap: during the controller's untap step ("whenever you untap one or more permanents during your untap step"). */
  untapStep?: boolean;
  perPlayer?: boolean;
  /** Activated ability: only loyalty abilities. */
  loyalty?: boolean;
  /**
   * The number of different values among the entries: sources of the damage (Case of the Burning Masks), kinds of
   * bending (Avatar Aang), card types (April O'Neil: "each type among spells cast"), players concerned (Kaito:
   * "opponents who lost life"), objects (attacks: "each creature that attacked this turn", a creature that attacks in
   * two combats counts once), attacked players (Fast Forward: "each opponent you attacked this turn").
   */
  distinct?: "source" | "kind" | "type" | "player" | "object" | "defender";
}

export interface CombatState {
  /** `defender`: attacked player, or attacked planeswalker (object id, 506.2). */
  attackers: { id: ObjectId; defender: string; blockers: ObjectId[]; blocked: boolean }[];
  blockers: { id: ObjectId; attacker: ObjectId }[];
  /** Creatures that dealt damage during the first-strike damage step. */
  firstStrikers: ObjectId[];
  /** Defending players who still have to declare their blockers (APNAP order). */
  blockQueue: PlayerId[];
  /** Blocks already declared, applied together once all defenders have declared (509.1, hidden until then). */
  pendingBlocks?: { player: PlayerId; blocks: { blocker: ObjectId; attacker: ObjectId }[] }[];
  /** Damage step being prepared (damage assignment by the attackers). */
  damageStep: "first" | "regular" | null;
  /** Attackers whose controller still has to assign their damage. */
  assignQueue: ObjectId[];
  /** Chosen assignments: attacker → (target → damage). */
  assignments: Record<ObjectId, Record<string, number>>;
}

export type CreatedReplacement =
  | { id: string; kind: "exileIfDies"; objects: ObjectId[] }
  | { id: string; kind: "preventCombatDamage" | "preventDamage"; objects: ObjectId[] };

/** Data of the event that triggered an ability. */
export interface TriggerEventData {
  /** Object concerned (old id if it changed zones). */
  objectId?: ObjectId;
  /** New id of that object after its zone change. */
  newObjectId?: ObjectId;
  player?: PlayerId;
  amount?: number;
  /**
   * Defending player of the attacking creature (the source, otherwise the event object), frozen on trigger (508.5: the
   * one it was attacking, even if it left combat or the attacked planeswalker disappeared); read by
   * `ref.defendingPlayer`.
   */
  defendingPlayer?: PlayerId;
  /**
   * "One or more …" (`batched` trigger): the objects and players of the other events of the batch, in order (the first
   * is `objectId`, `player`); read by `ref.eventObjects` ("those creatures", "one of them") and `ref.eventPlayers`.
   */
  others?: { objectId?: ObjectId; newObjectId?: ObjectId; player?: PlayerId }[];
}

/** Triggered ability waiting to be put on the stack (603.3). */
export interface PendingTrigger {
  id: string;
  sourceId: ObjectId;
  sourceDefId: string;
  abilityIndex: number;
  controller: PlayerId;
  sourceSnapshot: { keywords: Keyword[]; power: number; controller: PlayerId };
  event: TriggerEventData;
  /** Targets chosen as the questions go (603.3d). */
  targets: Record<string, string[]>;
  /** Resolution order already chosen by its controller. */
  ordered?: boolean;
  /** Modal ability: chosen mode. */
  mode?: number;
  /** Delayed or reflexive ability. */
  inline?: InlineAbility;
  /** Batch of simultaneous events that triggered it ("one or more …": a single trigger per batch). */
  batch?: number;
}

/** Characteristics of an object at the time it left the battlefield (last known information). */
export interface LkiSnapshot {
  /** Counters put on it this turn, "player|kind" (filter `countersPutByYouThisTurn`). */
  countersPutThisTurn?: string[];
  id: ObjectId;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  types: CardType[];
  subtypes: string[];
  supertypes: string[];
  colors: Color[];
  power: number;
  /** Base power (layer 7b). */
  basePower?: number;
  toughness: number;
  keywords: Keyword[];
  isToken: boolean;
  attacking?: boolean;
  /** The player it is attacking (absent if it attacks a planeswalker or isn't attacking). */
  attackedPlayer?: PlayerId;
  blocking?: boolean;
  /** Blocked attacker (`true`), unblocked once blockers are declared (`false`), otherwise absent (filter `blocked`). */
  blocked?: boolean;
  attachedTo?: ObjectId;
  /** Soulbond (702.95): the paired creature (filter `paired`). */
  pairedWith?: ObjectId;
  /** Physical identity (follows the card from one zone to another). */
  uid?: string;
  /** Commander (903.3, filter `commander`). */
  commander?: boolean;
  linked?: ObjectId[];
  damagedBy?: ObjectId[];
  name?: string;
  manaValue?: number;
  /** {X} in its mana cost (Matterbending Mage, Paradox Surveyor). */
  hasX?: boolean;
  /** Suspected (701.60). */
  suspected?: boolean;
  /** Entered from a kicked spell or with its gift promised (`cond.kicked` once it has left: 603.4, 608.2h). */
  kicked?: boolean;
  /** Turn it came under its controller's control (`GameObject.controlledSince`): "entered this turn" once it has left. */
  controlledSince?: number;
  /** Spell that has an Adventure (creature or Adventure of an Adventurer card; Beluna Grandsquall). */
  adventure?: boolean;
  tapped?: boolean;
  /** Effective abilities (printed or granted) at the time of the snapshot. */
  abilities?: AbilityDef[];
  counters?: Record<string, number>;
  /** Choice made as it entered (`GameObject.chosen`). */
  chosen?: GameObject["chosen"];
  /** Marked damage (this turn). */
  damage?: number;
  /** Copy of a prepared spell. */
  preparedSpell?: boolean;
  prepared?: boolean;
  /** An Equipment is attached to it. */
  equipped?: boolean;
  /** Controllers of the Auras attached to it. */
  enchantedBy?: PlayerId[];
  lastAttachedTo?: ObjectId;
  /** Creatures that saddled or crewed it this turn. */
  crewedByThisTurn?: ObjectId[];
  /** Cast for its warp cost. */
  warped?: boolean;
  /** Face down. */
  faceDown?: boolean;
  /** Was dealt damage this turn. */
  damaged?: boolean;
  /** Mana spent to cast it (spell on the stack). */
  manaSpent?: number;
  /** Entered by being cast (filter `cast`). */
  cast?: boolean;
}

/** Ongoing resolution of a spell or ability, possibly suspended on a choice. */
export interface Resolution {
  item: StackItem;
  /** Mana ability (605.3b): resolved without the stack; priority then returns to that player, as it was. */
  returnPriority?: { holder: PlayerId; passes: number };
  effects: Effect[];
  /** Index of the current effect. */
  pc: number;
  controller: PlayerId;
  targets: Record<string, string[]>;
  /** Answers to the choices already made, by key. */
  vars: Record<string, ChoiceValue[]>;
  /** Key of the expected choice. */
  awaiting: string | null;
}

/** Continuous effect from the resolution of a spell or ability. */
export interface ContinuousEffect extends LayerMods {
  id: string;
  timestamp: number;
  /** Set of objects locked in on resolution (rule 611.2c). */
  affected: ObjectId[];
  /**
   * "until end of turn", for as long as the objects remain on the battlefield, "until your next turn", or "until the
   * end of your next turn" (Evil's Thrall: removed at the cleanup of the next turn of `until`).
   */
  duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "endOfYourNextTurn";
  /** For "until your next turn" and "until the end of your next turn": the player concerned. */
  until?: PlayerId;
  /** "until the end of your next turn": turn of creation (the effect lasts beyond the current turn). */
  sinceTurn?: number;
  /** The effect ends when the card with this physical identity leaves exile. */
  untilExiledUid?: string;
  /** The effect ends when this source leaves the battlefield (Possession Engine). */
  whileSource?: ObjectId;
  /** The effect ends when this source untaps or leaves the battlefield (Hedge Whisperer). */
  whileSourceTapped?: ObjectId;
  /** The effect ends, for each affected object, when it untaps ("for as long as it remains tapped", Braided Net). */
  whileAffectedTapped?: boolean;
  /** The effect ends, for each affected object, when it no longer has a counter of this kind (Ultima: "for as long as
   * this land has a doom counter on it"). */
  whileAffectedHasCounter?: string;
  /**
   * 707.9b: exceptions of a copy effect ("except it's a Zombie"); they are part of the copiable values, which a copy
   * of this object takes over (`copiableExceptions`).
   */
  copiable?: boolean;
  /** Layer 2: the player who controls the affected objects (applied by `syncControl`, in timestamp order). */
  controller?: PlayerId;
  /** "For as long as you control [the source]": the effect ends as soon as that player no longer controls `whileSource` (611.2b). */
  whileControlledBy?: PlayerId;
  /**
   * "For as long as that Aura is attached to it" (Eriette, Assimilation Aegis): ends when `whileAttached` is no longer
   * attached to an affected object (`endDetachedEffects`).
   */
  whileAttached?: ObjectId;
}

export type Flow = "mulligan" | "stepStart" | "tba" | "priority" | "resolving" | "stepEnd" | "over";

/**
 * Commander game (903, PLAN-E). Commanders are designated by physical identity (`uid`, stable from one zone to
 * another, 903.3: the designation follows the card; a token or a copy isn't one).
 */
export interface CommanderState {
  cards: Record<
    string,
    {
      owner: PlayerId;
      /** Definition of the card (view, fingerprint), even when the object is gone (owner eliminated). */
      defId: string;
      /** 903.8: number of times it was cast from the command zone. */
      casts: number;
      /** 903.10a: combat damage dealt to each player over the course of the game. */
      damage: Record<PlayerId, number>;
      /** 903.9a: object (graveyard or exile) for which the return to the command zone has already been offered. */
      offered?: ObjectId;
    }
  >;
}

export interface GameState {
  /** Batches of simultaneous events. */
  batch: {
    /** Counter of the batches of simultaneous events ("one or more …" triggers). */
    eventBatch?: number;
    /**
     * Permanents gone from the battlefield during the current decision (their last information in `lki`): those that
     * leave at the same time see each other (Kraven the Hunter: "the greatest power among creatures that player
     * controls"). Emptied at the start of each decision.
     */
    leftBatch?: ObjectId[];
  };
  /** Incremented on each change that can affect characteristics (invalidates the layer cache). */
  version: number;
  rng: number;
  /**
   * Next number per prefix (objects `o…`, effects `e…`, triggers `t…`, abilities `a…`…): one more effect doesn't shift
   * the object ids, which the recorded decisions cite.
   */
  idCounters: Record<string, number>;
  timestamp: number;
  defs: Record<string, CardDef>;
  objects: Record<ObjectId, GameObject>;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  battlefield: ObjectId[];
  exile: ObjectId[];
  stack: StackItem[];
  turn: {
    number: number;
    active: PlayerId;
    step: Step;
    /** While the craft materials are being exiled (Market Gnome). */
    crafting?: boolean;
    landsPlayed: number;
    /** "Once each turn" abilities already triggered (source:index; `rules:speed`: speed, 702.179). */
    onceFired: string[];
    /** 514.3a: priority was given during the cleanup; there will be another cleanup step. */
    cleanupAgain?: boolean;
    /** Muldrotha: permanent types already played from the graveyard this turn. */
    graveyardTypesUsed?: string[];
    /**
     * 500.8: phases added "after this phase", by their first step (`beginCombat`: a combat, Aurelia; `main2`: a main
     * phase, All-Out Assault; `upkeep`: a beginning phase reduced to its upkeep, Obeka). They begin at the end of the
     * current phase; the most recently created one happens first (at the head of the queue).
     */
    addedPhases?: Step[];
    /** 500.10: steps added "after this step" (Paradox Haze, Y'shtola Rhul), at the head of the queue. */
    addedSteps?: Step[];
    /** The step where the turn resumes once the added phases are played (the one that followed the original phase). */
    resumeAt?: Step;
    /** Added beginning phase (Obeka): it ends with its upkeep step (neither untap nor draw). */
    upkeepOnly?: boolean;
    /** Rank of the current or past main phase (505.1: the first, the second…; Survival, Carpet of Flowers). */
    mainPhase?: number;
    /** Combat phases begun this turn (Genji Glove: "if it's the first combat phase of the turn"). */
    combats?: number;
    /** End steps already begun this turn (Y'shtola Rhul: "if it's the first end step of the turn"). */
    endSteps?: number;
    /** Number of resolutions per ability this turn (Venom Connoisseur). */
    resolutionCounts?: Record<string, number>;
    /** An extra turn (500.7: Medomai the Ageless, "can't attack during extra turns"). */
    extra?: boolean;
    startingPlayer: PlayerId;
  };
  flow: Flow;
  priority: { holder: PlayerId; passes: number };
  combat: CombatState | null;
  effects: ContinuousEffect[];
  pending: PendingDecision | null;
  /** Start of the game: mulligans (103.5) and "leyline" cards (103.6). */
  setup: {
    mulliganQueue: PlayerId[];
    /** 103.5: players who decided to take a mulligan in this round; they take it together at the end. */
    mulliganTaken?: PlayerId[];
    /** Players who were offered their "leyline" cards at the start of the game. */
    leylineAsked?: PlayerId[];
  };
  /**
   * Mana taps that can still be undone (Arena style): source tapped only for {T}, without a trigger, mana still in the
   * pool. Emptied by any decision other than producing or undoing mana (`undoMana`, mana.ts).
   */
  manaUndo?: { player: PlayerId; source: ObjectId; color: ManaType; amount: number }[];
  /**
   * 104.4b: passes chained with a non-empty stack, without any other decision, and fingerprints recorded beyond 20
   * (game.ts); the same fingerprint three times, or more than 2,000 passes, and the game is a draw.
   */
  /**
   * 104.4b: suspected loop (consecutive passes with a non-empty stack); `seen`: recorded fingerprints; `growth`:
   * fingerprints where tokens and stack objects count only once, with the size of the stack and the battlefield.
   */
  loop?: { passes: number; seen: string[]; growth?: { h: string; stack: number; field: number }[] };
  resolving: Resolution | null;
  /** Replacement and prevention effects created by resolutions (until end of turn). */
  replacements: CreatedReplacement[];
  /** Triggered abilities waiting to be put on the stack. */
  triggers: PendingTrigger[];
  /** Delayed triggered abilities waiting for their moment. */
  delayed: DelayedTrigger[];
  /** Cards a player may play from exile until the end of turn `until` (impulse, Etali…). */
  /**
   * Playable exiled cards. `condition`: only as long as it is met (Possibility Technician); `extraCost`: {N} more;
   * `tapped`: a land played this way enters tapped (Lightstall Inquisitor).
   */
  playPermissions?: {
    card: ObjectId;
    player: PlayerId;
    until: number;
    /** "Until your next end step": the permission ends at the beginning of the end step of turn `until`. */
    beforeEndStep?: boolean;
    free?: boolean;
    anyTime?: boolean;
    condition?: Condition;
    source?: ObjectId;
    extraCost?: number;
    tapped?: boolean;
    anyMana?: boolean;
    /**
     * "If it would be put into a graveyard, exile it instead" (`exile`, Quistis Trepe) or "put it on the bottom of its
     * owner's library" (`bottom`, Kylox's Voltstrider).
     */
    after?: "exile" | "bottom";
    /** "Pay life equal to its mana value rather than pay its mana cost" (Inside Information). */
    payLifeManaValue?: boolean;
    /** Only one card of the group can be cast (Buster Sword: "a spell from your hand"). */
    group?: string;
    /** Discover: if the card hasn't been cast when the permission expires, it goes to the hand. */
    orHand?: boolean;
    /** Permission of a "cast it" during a resolution (608.2g): removed as soon as the player answers. */
    now?: boolean;
    /** Granted flashback (702.34): cast from the graveyard, exiled afterwards (Sphinx of Forgotten Lore, Archmage's Newt). */
    flashback?: boolean;
    /** Granted harmonize (702.180, Songcrafter Mage): with `flashback`, a tapped creature reduces the cost. */
    harmonize?: boolean;
    /** Airbend: castable for this cost rather than its mana cost. */
    cost?: ManaCost;
    /**
     * "You may cast it": a land can't be played this way (Dream Harvest, Ragavan, Nimble Pilferer; nor the land back
     * face of a modal double-faced card); `adventure`: only as its Adventure (Mosswood Dreadknight).
     */
    castOnly?: true | "adventure";
    /** A creature spell cast this way gains haste (suspend, 702.62a). */
    haste?: boolean;
  }[];
  /**
   * 722: "you control [that player] during their next turn" (The Dominion Bracelet). `turn` is set at the beginning
   * of that turn; during that turn, the decisions of `player` are made by `by`.
   */
  /** `combatOnly`: only during that player's next combat phase (Secret of Bloodbending). */
  turnControl?: { player: PlayerId; by: PlayerId; turn?: number; combatOnly?: boolean; thenExtraTurn?: boolean };
  /** Monarch (724): the player who draws a card at the beginning of their end step; absent as long as nobody is. */
  monarch?: PlayerId;
  /** Extra turns to come (500.7: the most recent first). */
  extraTurns?: PlayerId[];
  /** "End the turn" (Time Stop): the turn goes directly to the cleanup step. */
  endTurnRequested?: boolean;
  /** Cards exiled "until [the source] leaves the battlefield". */
  /** `toHand`: the cards return to their owner's hand (Deep-Cavern Bat). */
  linkedExile: { sourceId: ObjectId; cards: ObjectId[]; toHand?: boolean }[];
  /** Last known information, by old id (purged at the end of each step). */
  lki: Record<ObjectId, LkiSnapshot>;
  /** Log of the events of the current turn (`turnlog.ts`), emptied at the beginning of each turn. */
  turnLog: TurnLogEntry[];
  /** Effects on players created by resolutions (`PlayerEffect`). */
  playerEffects: PlayerEffect[];
  /** Printing chosen by the deck for a card, by physical identity (`uid` → `CardPrinting.key`, PLAN-G). */
  printings?: Record<string, string>;
  /** Commander (903, PLAN-E): absent outside a Commander game. */
  commander?: CommanderState;
  winner: PlayerId | null;
  over: boolean;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------
