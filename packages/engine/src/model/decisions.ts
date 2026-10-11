/** Engine types — Decisions, choices, action options and events. Re-exported by `types.ts`. */
import type { GiftKind, ManaCost, ManaType, ObjectId, PlayerId, Step, Zone } from "../types";

export type PendingDecision =
  /** `bottom`: cards to put on the bottom when keeping (the first mulligan is free with three or more players, 103.5c). */
  | { kind: "mulligan"; player: PlayerId; mulligans: number; bottom: number }
  | { kind: "bottomCards"; player: PlayerId; count: number }
  /**
   * `castNow`: restricted priority during a resolution (608.2g, "you may cast that card"): the player casts one of the
   * offered cards, or passes to decline. The resolution then resumes.
   */
  | { kind: "priority"; player: PlayerId; castNow?: CastNowRequest }
  | { kind: "declareAttackers"; player: PlayerId }
  | { kind: "declareBlockers"; player: PlayerId }
  | { kind: "discard"; player: PlayerId; count: number }
  | { kind: "choice"; player: PlayerId; request: ChoiceRequest; purpose: ChoicePurpose };

/** Cards a player may cast during the resolution of a spell or ability. */
export interface CastNowRequest {
  cards: ObjectId[];
  prompt: string;
}

// ---------------------------------------------------------------------------
// Generic choices: every question asked of a player goes through this model,
// which the interface knows how to display once and for all.
// ---------------------------------------------------------------------------

export type ChoiceValue = string | number;

/** What a "name" question asks to name (`ChoiceRequest` of type `name`, names.ts). */
export type NameKind = "card" | "land" | "creatureType";

export type ChoiceIntent =
  | "scryBottom"
  | "scryOrder"
  | "surveilGraveyard"
  | "discard"
  | "sacrifice"
  | "may"
  | "combatDamage"
  | "legend"
  | "triggerOrder"
  | "triggerTarget"
  | "triggerMode"
  | "lookAtTop"
  | "search"
  | "pickCards"
  | "topOrBottom"
  | "punisher"
  | "unlessPay"
  | "chooseOnEnter"
  | "piles"
  | "divideCounters"
  | "manaColor"
  | "payX"
  | "changeTarget"
  | "leyline"
  | "proliferate"
  | "impulse"
  | "divideDamage"
  | "keepPerType"
  | "keepWithinPower"
  | "reveal"
  | "discover"
  /** 903.9a: return one's commander to the command zone (yes / no). */
  | "commanderZone"
  | "other";

interface ChoiceBase {
  prompt: string;
  /** What this choice is for (useful to the AI and the interface). */
  intent: ChoiceIntent;
  /** Answer proposed by the engine, always valid: autopilot, AI fallback, pre-filling. */
  suggested: ChoiceValue[];
  /** The autopilot may answer with `suggested` (outside full control). */
  autoOk?: boolean;
  /** Labels of the options that are neither objects nor players (e.g. triggered abilities). */
  labels?: Record<string, string>;
  /**
   * The "may" question of a triggered ability (PLAN-L L8): the key under which the player can keep their answer
   * ("always answer this way", `AutopilotSettings.autoAnswers`): card, ability and question.
   */
  remember?: string;
}

export type ChoiceRequest = ChoiceBase &
  (
    | {
        type: "pick";
        options: string[];
        min: number;
        max: number;
        /** Constraint between the chosen options: same player or different players (the player of each option). */
        group?: { kind: "same" | "different"; holders: Record<string, string> };
      }
    /**
     * A name to choose (card name, land card name, creature type): any value of the catalog is allowed
     * (`isNameAllowed`, names.ts), without the question listing the cards of the game (the opponent's decklist);
     * `featured`: public names put forward (opponents' permanents, then yours, then graveyards, exile and command zone;
     * creature types: the most common among your cards). Answer: a name (English).
     */
    | { type: "name"; of: NameKind; featured: string[] }
    | { type: "number"; min: number; max: number }
    | { type: "order"; items: string[] }
    | { type: "yesNo" }
    | {
        type: "divide";
        among: string[];
        total: number;
        /** Trample constraint: the player is dealt damage only if each blocker has been assigned lethal damage. */
        lethal?: { player: string; needs: Record<string, number> };
        /** Minimum per recipient (601.2d: at least 1 per target). */
        minEach?: number;
      }
  );

export type ChoicePurpose =
  | { kind: "effect" }
  | { kind: "combatDamage"; attacker: ObjectId }
  | { kind: "legend" }
  | { kind: "triggerOrder"; player: PlayerId }
  | { kind: "triggerTarget"; trigger: string; spec: string }
  | { kind: "triggerMode"; trigger: string }
  | { kind: "leyline"; player: PlayerId }
  /** Choice for an item already on the stack: new targets of a copy, division (see `StackItem.pendingChoices`). */
  | { kind: "stackChoice"; stackId: string }
  /** 903.9a: commander in a graveyard or in exile, which its owner may return to the command zone. */
  | { kind: "commanderZone"; card: ObjectId }
  /** 502.3: permanents the active player may choose not to untap (Hedge Whisperer). */
  | { kind: "untap"; player: PlayerId };

export interface CastChoices {
  /** Without paying the mana cost (Omniscience). */
  free?: boolean;
  /**
   * The spell's hybrid mana is paid with this color: each hybrid symbol that contains it ("if {U}{U} was spent",
   * Deceit); without a choice, automatic payment decides. Offered by `legalActions` (`hybridColors`, PLAN-L L7).
   */
  hybridAs?: ManaType;
  /**
   * Phyrexian mana (107.4f): how many Phyrexian symbols are paid with 2 life each (PLAN-L L7); without a choice, the
   * mana pays first. Offered by `legalActions` (`phyrexianLife`).
   */
  phyrexianLife?: number;
  /** The card's alternative cost. */
  alternative?: boolean;
  mode?: number;
  targets?: Record<string, string[]>;
  x?: number;
  kicked?: boolean;
  /** Additional costs: discarded cards, sacrificed permanents. */
  discard?: ObjectId[];
  sacrifice?: ObjectId[];
  /** Permanents tapped for the cost (station, crew, saddle), chosen by the player. */
  tap?: ObjectId[];
  /** Materials of a craft (702.167), chosen by the player. */
  materials?: ObjectId[];
  /** Tapped creature returned to hand for Web-slinging, chosen by the player (the cheapest by default). */
  bounce?: ObjectId[];
  /** Face cast of a multi-faced card (1: the adventure); absent: the card itself (front face). */
  face?: number;
  /** Cast face down for {3} (disguise). */
  faceDown?: boolean;
  /** Cast for its warp cost (702.185). */
  warp?: boolean;
  /**
   * Objects paid as a cost, chosen by the player, by slot (`CostPick.slot`); a missing slot takes the engine's
   * suggestion (PLAN-C, lots C7 and C8).
   */
  picks?: Partial<Record<CostSlot, ObjectId[]>>;
}

/**
 * Costs paid with chosen objects: blight, remove counters, exile cards from the graveyard (fixed or X), collect
 * evidence, sacrifice X permanents, exile another permanent, return an unblocked attacker (ninjutsu).
 */
export type CostSlot =
  | "blight"
  | "counterFrom"
  /** "Remove a counter from this creature": the kinds of counters removed (options: kinds, not objects). */
  | "counterKind"
  | "graveyardExile"
  | "graveyardExileX"
  | "evidence"
  | "sacrificeX"
  | "exileOther"
  | "returnAttacker"
  | "convoke"
  | "improvise"
  | "waterbend"
  | "delve"
  | "sacrificeToPay"
  /** Additional costs of a spell (Duskmourn, behold and exile): permanents exiled, returned, tapped; graveyard cards. */
  | "costExile"
  | "costBounce"
  | "costTap"
  | "costGraveyard"
  /** Behold: the permanent or the card in hand beheld (none: don't behold). */
  | "behold"
  /**
   * Alternative cost (PLAN-M M6): the cards exiled from the hand (Force of Will), the returned permanent (Daze), the
   * sacrificed permanents (the Flares, Demon of Death's Gate, emerge).
   */
  | "handExile"
  | "altReturn"
  | "altSacrifice"
  /** "Discard X cards" (Gix, Yawgmoth Praetor). */
  | "discardX"
  /** Cards of a color exiled from the graveyard for their mana symbols of that color (Baron Helmut Zemo). */
  | "symbolExile"
  /** Forage (701.61) as a cost: three cards from the graveyard or a Food (`oneOf`). */
  | "forage"
  /** Muldrotha: the permanent type a card with several uses (options: types, not objects). */
  | "permanentType"
  /** Kíli the Resourceful: pay {0} (`free`) or the printed cost (`printed`) (options: labels, not objects). */
  | "freeCost"
  /** "Choose a creature type and behold two creatures of that type" (Celestial Reunion): the type (options: types). */
  | "creatureType";

/** Slots whose options are labels, not objects (kinds of counters, permanent types, a way to pay, creature types). */
export const LABEL_SLOTS: readonly CostSlot[] = ["counterKind", "permanentType", "freeCost", "creatureType"];

/** A cost paid with objects, as offered to the player (`legalActions`) and checked on payment. */
export interface CostPick {
  slot: CostSlot;
  label: string;
  /** Number of objects; `countIsX`: as many as the chosen X. */
  count: number;
  countIsX?: boolean;
  options: ObjectId[];
  /** The default choice (the engine's, when the player doesn't choose). */
  suggested: ObjectId[];
  /** Removing counters: the same object may come back, at most as many times as it has counters. */
  repeat?: Record<ObjectId, number>;
  /**
   * Options that are not objects (kinds of counters, `counterKind`; `id:kind`, a kind of counter on an object): their
   * label, which may cite cards (`cardRef`).
   */
  labels?: Record<string, string>;
  /**
   * Collect evidence N: cards with total mana value N or greater (`count` ignored). `fromTargets` (Urgent Necropsy):
   * N is the total mana value of the chosen targets, read from this table (`n` is then 0 until the targets are known).
   */
  minTotal?: { n: number; values: Record<ObjectId, number>; fromTargets?: Record<ObjectId, number> };
  /** Spell: only if it is kicked (or bargained…), or cast for its alternative cost. */
  when?: "kicked" | "alternative";
  /** Spell: only with one of these modes (`ModeDef.additionalCost`: escalate paid by tapping creatures). */
  modes?: number[];
  /**
   * At most `count` objects, all used to pay (convoke, improvise, waterbend, delve); no choice: automatic payment
   * decides (`suggested` empty).
   */
  atMost?: boolean;
  /** The player may choose nothing ("you may behold"): an empty list is an answer. */
  optional?: boolean;
  /**
   * Payment detail (PLAN-M M6): outside full control, the interface keeps the suggestion without asking (Kíli's {0},
   * the permanent tapped by Gene Pollinator).
   */
  autoOk?: true;
  /** Exactly one of these groups, all of its `count` objects among its `options` (forage: three cards, or a Food). */
  oneOf?: { count: number; options: ObjectId[] }[];
}

export type Decision =
  | { type: "keep" }
  | { type: "mulligan" }
  | { type: "bottom"; cards: ObjectId[] }
  | { type: "pass" }
  /** `landType`: basic land type chosen as it enters (Multiversal Passage). */
  /** `chosen`: "as it enters, choose…" (Cavern of Souls: a creature type), among the action's options. */
  /** `back`: play the land back face of a modal card whose front face is also a land (Blightstep Pathway). */
  | { type: "playLand"; card: ObjectId; payLife?: boolean; landType?: string; chosen?: string; back?: boolean }
  | ({ type: "cast"; card: ObjectId } & CastChoices)
  | ({ type: "activate"; source: ObjectId; ability: number } & CastChoices)
  /**
   * `color`: the type of the mana (one of the ability's); `colors`: the type of each mana of an "in any combination"
   * ability (as many as it produces; PLAN-L L3).
   */
  /** `picks.costTap`: the other permanent tapped for the cost (Gene Pollinator, Relic of Legends; PLAN-M M6). */
  | {
      type: "tapForMana";
      source: ObjectId;
      ability: number;
      color?: ManaType;
      colors?: ManaType[];
      picks?: Partial<Record<CostSlot, ObjectId[]>>;
    }
  /** Undoes tapping a source for its mana, as long as that mana hasn't been used (`GameState.manaUndo`). */
  | { type: "undoMana"; source: ObjectId }
  | { type: "declareAttackers"; attackers: { id: ObjectId; defender: PlayerId }[] }
  | { type: "declareBlockers"; blocks: { blocker: ObjectId; attacker: ObjectId }[] }
  | { type: "discard"; cards: ObjectId[] }
  | { type: "choose"; values: ChoiceValue[] }
  | { type: "concede" };

export interface TargetOption {
  id: string;
  label?: string;
  optional: boolean;
  legal: string[];
  /** Maximum number of targets for this "target" word (1 by default). */
  count?: number;
  /** Minimum number of targets ("one or two targets"); `count` by default. */
  min?: number;
  /** Exactly X targets (`true`), or up to X (`"upTo"`), X being chosen for the spell or ability. */
  countX?: boolean | "upTo";
  /** Constraint between the targets: same player, or different players (with the player of each target). */
  group?: { kind: "same" | "different"; holders: Record<string, string> };
  kickedCount?: number;
  /** Legal targets if the spell is kicked or if the gift is promised (different filter). */
  kickedLegal?: string[];
  otherThan?: string[];
  attachedToTarget?: string;
  /**
   * "Target player … target cards from their graveyard" (Rite of Renewal): each target must be held by a target of the
   * other word `id`; `holders`: the player who holds each legal target.
   */
  ofTarget?: { id: string; holders: Record<string, string> };
  /** "Total mana value N or less" (Scout for Survivors): N and the mana value of each legal target. */
  maxTotalManaValue?: { max: number; values: Record<string, number> };
  /**
   * "That share a creature type" (Secret Tunnel): the creature types of each legal target (`"*"`: all,
   * changeling).
   */
  shareCreatureType?: Record<string, string[]>;
  /** At least one of the targets must be one of these (the cost reduction that makes the spell affordable). */
  requiredAmong?: string[];
  /**
   * "Mana value X or less" (`TargetSpec.maxManaValueAmount` being X): the smallest value of X that makes each target
   * legal (its mana value); targets that require more than the largest affordable X are not offered
   * (Kozilek's Command, Here Comes a New Hero!, Agadeem's Awakening).
   */
  xAtLeast?: Record<string, number>;
  /**
   * "With mana value X" (`TargetSpec.manaValueAmount` being X): the only value of X that makes each target legal (its
   * mana value; Likeness Looter, The Mycosynth Gardens, Rydia).
   */
  xEquals?: Record<string, number>;
}

export interface ModeOption {
  index: number;
  label?: string;
  targets: TargetOption[];
  /** Mode possible only by paying the additional cost ("if you paid it, choose both"). */
  requiresKicker?: boolean;
  /** Mode possible only without paying the additional cost (a single mode: "if it was paid, choose both"). */
  forbidsKicker?: boolean;
}

export type ActionOption =
  | { type: "pass" }
  /** `landType`: basic land type chosen as it enters (Multiversal Passage). */
  /** `choose`: the land's "as it enters, choose…" question, to ask when playing it (answer: `chosen`). */
  /** `back` and `faceName`: the land back face of a modal card whose front face is also a land. */
  | {
      type: "playLand";
      card: ObjectId;
      payLife?: boolean;
      landType?: string;
      choose?: ChoiceRequest;
      back?: boolean;
      faceName?: string;
    }
  | {
      type: "cast";
      card: ObjectId;
      /** Face cast (adventure…) and its name, for the interface. */
      face?: number;
      faceName?: string;
      /** Cast face down for {3} (disguise). */
      faceDown?: boolean;
      /** Cast for its warp cost. */
      warp?: boolean;
      modes: ModeOption[];
      xMax: number | null;
      kickerAffordable: boolean;
      /** Optional cost specific to the set (Bloomburrow): question and answers displayed instead of "kicker". */
      kickerPrompt?: { title: string; without: string; with: string };
      /** Possible colors to pay the hybrid mana (`CastChoices.hybridAs`). */
      hybridColors?: ManaType[];
      /** The outcome depends on the color of the hybrid mana spent (Deceit): the choice is always asked. */
      hybridMatters?: true;
      /** Numbers of Phyrexian symbols payable with life, when there is a choice (`CastChoices.phyrexianLife`). */
      phyrexianLife?: number[];
      /** Cast from the graveyard thanks to flashback. */
      fromGraveyard?: boolean;
      /** Playable exiled card (impulse, Etali, Tinybones). */
      fromExile?: boolean;
      /** Must be cast without paying its mana cost (Etali). */
      free?: boolean;
      /** May be cast without paying its mana cost (Omniscience). */
      freeAvailable?: boolean;
      /** Alternative cost affordable (Blasphemous Edict). */
      altAvailable?: boolean;
      /** Label of the alternative cost ("Impending 4—{2}{W}{W}"). */
      altLabel?: string;
      /** Normal cost affordable. */
      normalAvailable?: boolean;
      additional?: {
        /** `orLife`: this life may be paid instead of discarding; `orSacrifice`: the options include permanents. */
        discard?: {
          count: number;
          options: ObjectId[];
          orLife?: number;
          orSacrifice?: boolean;
          /** "… or pay [mana]" (Titania); `orPayAffordable`: this mana is affordable. */
          orPay?: ManaCost;
          orPayAffordable?: boolean;
        };
        /** `orPay`: this mana may be paid instead of sacrificing (Eaten Alive). */
        sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
        /**
         * Harmonize (702.180): at most `count` (1) creature to tap, optional, which reduces the cost by its power
         * (`powers`); `suggested`: the default choice (applied if the decision has no `tap`).
         */
        tap?: { count: number; options: ObjectId[]; powers: Record<ObjectId, number>; suggested: ObjectId[]; optional: true };
      };
      /**
       * Kicker without mana (Bargain, FIN): permanents that can pay it if the spell is kicked, the default choice
       * first; the player designates one with `sacrifice`.
       */
      kickerPermanents?: ObjectId[];
      /** Web-slinging: tapped creatures that can be returned (the cheapest first), designated with `bounce`. */
      altBounce?: ObjectId[];
      /** Teamwork: creatures to tap if the spell is kicked (total power `minPower`), designated with `tap`. */
      kickerTap?: {
        count: number;
        options: ObjectId[];
        minPower: number;
        powers: Record<ObjectId, number>;
        suggested: ObjectId[];
      };
      /** Objects paid as a cost to choose (evidence, graveyard exile, blight X), when there is a choice. */
      picks?: CostPick[];
    }
  | {
      type: "activate";
      source: ObjectId;
      ability: number;
      label?: string;
      targets: TargetOption[];
      xMax: number | null;
      /** Smallest allowed value of X ("X can't be 0"). */
      xMin?: number;
      /** Numbers of Phyrexian symbols payable with life, when there is a choice (`CastChoices.phyrexianLife`). */
      phyrexianLife?: number[];
      additional?: {
        sacrifice?: { count: number; options: ObjectId[] };
        /**
         * Permanents to tap: exactly `count` (station), or, with `minPower`, as many as desired provided their total
         * power (`powers`) reaches `minPower` (crew, saddle). `suggested`: the default choice.
         */
        tap?: {
          count: number;
          options: ObjectId[];
          minPower?: number;
          powers?: Record<ObjectId, number>;
          suggested?: ObjectId[];
        };
        discard?: { count: number; options: ObjectId[] };
        /** Craft: between `min` and `max` materials among `options` (graveyard and permanents). */
        materials?: { min: number; max: number; options: ObjectId[]; suggested: ObjectId[] };
      };
      /** Objects paid as a cost to choose (blight, evidence, graveyard exile…), when there is a choice. */
      picks?: CostPick[];
    }
  /** `amount` and `combination`: an "in any combination" ability that produces several mana (a division to ask). */
  | {
      type: "tapForMana";
      source: ObjectId;
      ability: number;
      colors: ManaType[];
      amount?: number;
      combination?: true;
      /** The other permanent to tap for the cost, when there is a choice (`costTap`, `autoOk`). */
      picks?: CostPick[];
    };

// ---------------------------------------------------------------------------
// Events (log, animations)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "gameStart"; startingPlayer: PlayerId }
  | { type: "mulligan"; player: PlayerId; count: number }
  | { type: "keep"; player: PlayerId; handSize: number }
  | { type: "turnStart"; turn: number; player: PlayerId }
  | { type: "step"; step: Step }
  | { type: "draw"; player: PlayerId; objectId?: ObjectId; defId?: string }
  | { type: "playLand"; player: PlayerId; objectId: ObjectId; defId: string }
  | { type: "cast"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "activate"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  | { type: "resolve"; stackId: string; defId: string }
  | { type: "fizzle"; stackId: string; defId: string }
  | { type: "copy"; stackId: string; defId: string; player: PlayerId }
  | { type: "poison"; player: PlayerId; amount: number; total: number }
  /** Rad counters received (`amount` > 0) or removed by radiation (`amount` < 0); `total`: afterwards. */
  | { type: "rad"; player: PlayerId; amount: number; total: number }
  /** The player becomes the monarch (724). */
  | { type: "monarch"; player: PlayerId }
  | { type: "endTurn"; player: PlayerId }
  | { type: "countered"; stackId: string; defId: string; by: string }
  | { type: "attach"; objectId: ObjectId; defId: string; to: ObjectId; toDefId: string }
  | { type: "damage"; sourceDefId: string; target: string; targetDefId?: string; amount: number; combat: boolean }
  | { type: "life"; player: PlayerId; delta: number; life: number }
  | { type: "dies"; objectId: ObjectId; defId: string; to: Zone }
  | { type: "destroy"; objectId: ObjectId; defId: string }
  | { type: "token"; objectId: ObjectId; defId: string; controller: PlayerId }
  /** Cards revealed to everyone (top of the library of a creature that explores…). */
  /** `look`: the player only looks at the cards (Gitaxian Probe, Mishra's Bauble): nobody else receives the event. */
  | { type: "reveal"; player: PlayerId; defIds: string[]; look?: boolean }
  /** Gift (702.174) offered by `player` to `to`. */
  | { type: "gift"; player: PlayerId; to: PlayerId; kind: GiftKind }
  /** A face-down permanent is turned face up (the card is revealed). */
  | { type: "turnedFaceUp"; objectId: ObjectId; defId: string }
  /** 702.170: the card becomes plotted. */
  | { type: "plotted"; player: PlayerId; defId: string }
  /** 705: coin flip. */
  | { type: "coinFlip"; player: PlayerId; won: boolean }
  | { type: "dieRoll"; player: PlayerId; sides: number; result: number }
  /** A safety cap cut an amount (`limits.ts`): approximation reported in the log. */
  | { type: "capReached"; cap: "tokens" | "amount" | "permutations" | "layers" }
  /** 702.179: the player's new speed. */
  | { type: "speed"; player: PlayerId; speed: number }
  /** 722: `by` controls `player`'s turn. */
  | { type: "turnControl"; player: PlayerId; by: PlayerId; combatOnly?: boolean }
  /** Foretell (702.143): a card in hand is exiled, castable later. */
  | { type: "foretold"; player: PlayerId; defId: string }
  /** A double-faced permanent transforms (`defId`: the face now visible). */
  | { type: "transform"; objectId: ObjectId; defId: string }
  | { type: "attack"; player: PlayerId; attackers: { id: ObjectId; defId: string }[] }
  | {
      type: "block";
      player: PlayerId;
      blocks: { blocker: ObjectId; attacker: ObjectId; blockerDefId: string; attackerDefId: string }[];
    }
  | { type: "discard"; player: PlayerId; defIds: string[] }
  /** `objectId` and `defId` are removed (filterEvents) for a hidden → hidden move of an opponent's card. */
  /** `faceDown`: exiled face down, visible only to the listed players (filtered by `filterEvents`). */
  | { type: "moved"; owner: PlayerId; objectId?: ObjectId; defId?: string; from: Zone; to: Zone; faceDown?: PlayerId[] }
  | { type: "scry"; player: PlayerId; top: number; bottom: number }
  | { type: "choice"; player: PlayerId; intent: ChoiceIntent }
  /**
   * What a player chose, said to everyone (`eachChooses`): a vote or a public choice as it is made, a secret choice when
   * it is revealed (`revealed`: all the secret answers together; A Killer Among Us's type as its ability is activated).
   * `values`: option labels, numbers or player ids.
   */
  | { type: "chose"; player: PlayerId; defId: string; values: string[]; vote?: boolean; revealed?: boolean }
  | { type: "trigger"; player: PlayerId; stackId: string; defId: string; targets: string[] }
  /** `commander`: 21 combat damage from the same commander (704.6c). */
  | { type: "lose"; player: PlayerId; reason: "life" | "draw" | "poison" | "concede" | "commander" }
  /** `reason`: "loop", game drawn on a loop of mandatory actions (104.4b). */
  | { type: "gameOver"; winner: PlayerId | null; reason?: "loop" };
