/** Engine types — filters, targets, triggers, conditions, references and amounts. Re-exported by `types.ts`. */
import type {
  CardType,
  CastVia,
  Color,
  Keyword,
  ManaType,
  PlayerDesignation,
  PlayerId,
  Step,
  TurnLogQuery,
  Zone,
} from "../types";

export interface TargetSpec {
  id: string;
  filter: TargetFilter;
  /** Total mana value of the targets at most N (Scout for Survivors). */
  maxTotalManaValue?: number;
  /** … or at most this amount, evaluated when the reflexive ability is put on the stack (Fire Lord Sozin: X paid). */
  maxTotalManaValueAmount?: Amount;
  /** "up to one target" */
  optional?: boolean;
  label?: string;
  /** Number of targets for this word "target" ("up to two target creatures"); 1 by default. */
  count?: number;
  /** Minimum number of targets when `count` > 1 ("one or two targets": 1); `count` by default. */
  minCount?: number;
  /** All targets of this word "target" belong to the same player ("from a single graveyard"). */
  samePlayer?: boolean;
  /** Number of targets if the spell was kicked ("if this spell was kicked, any number of targets instead"). */
  kickedCount?: number;
  /** These targets must differ from those of other words "target" ("two other targets"). */
  otherThan?: string[];
  /** Triggered ability: the target is not the event object ("a creature other than this creature"). */
  notEventObject?: boolean;
  /** Each target must be attached to a target of another word "target" ("Equipment attached to that creature"). */
  attachedToTarget?: string;
  /** Targets controlled by different players ("controlled by different players"). */
  differentPlayers?: boolean;
  /** The targets share a creature type (Unbury: "two target creature cards that share a creature type"). */
  shareCreatureType?: boolean;
  /**
   * Targets pairwise different in this characteristic: `name`, different names (Behold the Sinister Six!:
   * "target creature cards with different names"); `manaValue`, different mana values (Agadeem's Awakening).
   */
  distinct?: "name" | "manaValue";
  /** Variable number of targets ("up to X target creatures"): replaces `count` when the targets are chosen. */
  countAmount?: Amount;
  /** Filter if the spell was kicked or the gift was promised ("target nonland permanent instead"). */
  kickedFilter?: TargetFilter;
  /** Exact mana value evaluated when the reflexive ability is put on the stack (Wishing Well). */
  manaValueAmount?: Amount;
  /**
   * Maximum mana value evaluated on targeting, then again on resolution (608.2b): "a creature card with mana value X or
   * less, where X is the amount of life you gained this turn" (Moseo).
   */
  maxManaValueAmount?: Amount;
  /**
   * Exactly X targets, X being chosen for the spell or ability (Rot-Curse Rakshasa: "X target creatures");
   * `"upTo"`: up to X targets (Divergent Equation).
   */
  countX?: boolean | "upTo";
  /**
   * "… that player controls", "from that player's graveyard": each target is held (controlled on the battlefield or on
   * the stack, owned elsewhere) by a designated player: the event player (the damaged player: Fear of Burning Alive; the
   * one who destroys: Karmic Justice), the defending player (Fear of Falling, Chorale of the Void), or the player chosen
   * for another word "target" of the same spell or ability (`ref.target("p")`: Rite of Renewal). Evaluated on targeting
   * (`concreteSpec`, which replaces it with `ofPlayers`), then again on resolution (608.2b).
   */
  of?: Ref;
  /** `of` evaluated: the players who may hold the targets. Set by the engine (`concreteSpec`), never by a card. */
  ofPlayers?: PlayerId[];
}

/**
 * Face-up exiled cards: `withCost`: that have warp (Blade of the Swarm) or flashback (Sorceress's Schemes); `warped`:
 * exiled by warp (Close Encounter: "a warped card"); `own`: that you own (`true`) or not (`false`, Sentinel of Lost
 * Lore); `linked`: exiled "with" the source (Mimeoplasm).
 */
export interface ExiledFilter {
  filter?: ObjectFilter;
  withCost?: "warp" | "flashback";
  warped?: boolean;
  own?: boolean;
  linked?: boolean;
}

export interface TargetFilter {
  players?: "any" | "you" | "opponent";
  objects?: ObjectFilter;
  /** Cards in a graveyard ("target creature card from your graveyard"). */
  cards?: { filter: ObjectFilter; whose?: "you" | "opponent" | "any" };
  /** Face-up exiled cards (Blade of the Swarm: "target exiled card with warp"). */
  exiled?: ExiledFilter;
  /** Spells on the stack ("counter target creature spell"). */
  spells?: ObjectFilter;
  /** … that target a matching permanent (Fugitive Droid: "a spell that targets an artifact or creature you
   * control"). */
  spellsTargeting?: ObjectFilter;
  /** … or that target you (Hindering Light: "a spell that targets you or a permanent you control"). */
  spellsTargetingYou?: boolean;
  /** Spells or abilities on the stack with a single target (Bolt Bend). */
  /** `controller`: that you control; `source`: whose source matches (Scientist Supreme: "from an artifact source"). */
  stackItems?: {
    singleTarget?: boolean;
    /** Only spells ("target spell with a single target": Misdirection), only abilities, or only triggered abilities. */
    only?: "spells" | "abilities" | "triggered";
    controller?: "you";
    source?: ObjectFilter;
  };
}

export interface ObjectFilter {
  /** The object must have at least one of these types. */
  types?: CardType[];
  /** A commander (903.3, PLAN-E: "if you control a commander", Fierce Guardianship). */
  commander?: boolean;
  /** The object must have none of these types ("noncreature"…). */
  notTypes?: CardType[];
  subtype?: string;
  controller?: "you" | "opponent";
  keyword?: Keyword;
  /** "another": excludes the source of the ability. */
  other?: boolean;
  /** The source itself ("when this creature dies, if it wasn't a Demon"). */
  self?: boolean;
  /**
   * Attachments relative to the source (a single field, PLAN-H H10): `host`, the permanent the source is attached to
   * ("equipped creature"); `notHost`, any other than it ("other than enchanted creature"); `toSource`, attached to the
   * source ("each Aura and Equipment attached to Kellan"); `toHost`, attached to the permanent the source is attached to
   * (With Great Power: "each Aura and Equipment attached to it"); `wasToSource`, was attached to the source when it left
   * the battlefield (Zack Fair). `host`, `notHost` and `toHost` are read on the battlefield (`matchesObjectFilter`, and
   * the triggers for `host`); `toSource` and `wasToSource` on any view.
   */
  attached?: "host" | "notHost" | "toSource" | "toHost" | "wasToSource";
  /**
   * Soulbond (702.95): paired (`true`) or unpaired (`false`); `source`: the source itself while it is paired, and the
   * creature paired with it ("each of those creatures", Tandem Lookout).
   */
  paired?: boolean | "source";
  /**
   * Crew or saddle this turn: `bySource`, a Vehicle the source crewed (Balthier and Fran); `source`, a creature that
   * crewed or saddled the source (Giant Beaver: "a creature that saddled it this turn").
   */
  crew?: "bySource" | "source";
  /**
   * Dynamic comparisons of a characteristic of the object (PLAN-H H10; fixed bounds stay `minPower`, `maxManaValue`…).
   * An amount (`to`) is evaluated by a single resolver, `resolveCompare` (`effects.ts`), from the source's point of
   * view: during a resolution (`withX`), with the context of what is resolving (its X, its targets); elsewhere
   * (`resolveFilter`: targets, statics, triggers), with the source alone, and X is the permanent's (the X of the spell
   * that put it onto the battlefield). See `FilterCompare`.
   */
  compare?: FilterCompare[];
  /** Has the same name as another matching permanent (Key to the Side-Door: "a legendary card with the same name as a
   * legendary permanent you control"); under `not`: "doesn't have the same name as a token you control" (Yenna). */
  sameNameAs?: ObjectFilter;
  /**
   * Shares a characteristic with the designated objects, resolved on resolution by `withX`: a creature type (Shared
   * Animosity: the event object; Path of Ancestry: your commanders), a card type (Braids, Arisen Nightmare: their last
   * known information if they left the battlefield), a color (Raiding Schemes) or the name (Dragonlord Kolaghan: "with
   * the same name as a card in their graveyard"). Nothing designated: nothing matches.
   */
  shares?: { what: "creatureType" | "cardType" | "color" | "name"; with: Ref };
  /** Equipped creature (at least one Equipment attached). */
  equipped?: boolean;
  /** Modified (700.9): has a counter on it, is equipped, or is enchanted by an Aura its controller controls. */
  modified?: boolean;
  /** Enchanted by at least one Aura (`true`), by an Aura you control (`byYou`), or by none (`false`). */
  enchanted?: boolean | "byYou";
  /** Minimum power ("creature with power 4 or greater"). */
  minPower?: number;
  maxManaValue?: number;
  manaValue?: number;
  name?: string;
  tapped?: boolean;
  colors?: Color[];
  /** Has at least one counter of this kind. */
  withCounter?: string;
  /**
   * Attacking creature; `"you"`: attacking you (you, not your planeswalkers); `"opponent"`: attacking one of your
   * opponents (a player); a reference: attacking one of the designated players (resolved by `withX` into a list of
   * players).
   */
  attacking?: boolean | "you" | "opponent" | Ref | PlayerId[];
  /** Blocking. */
  blocking?: boolean;
  /**
   * Blocked (`true`) or unblocked (`false`: once blockers are declared, 509.1h; Throatseeker: "unblocked attacking
   * Ninjas you control") attacker. Before blockers are declared, none matches.
   */
  blocked?: boolean;
  /** Multicolored (at least two colors). */
  /** Exact number of colors ("monocolored": 1). */
  colorCount?: number;
  /** Doesn't match this filter. */
  not?: ObjectFilter;
  multicolored?: boolean;
  /** Spell whose mana spent is less than its mana value (Unravel). */
  manaSpentBelowValue?: boolean;
  /** Was dealt damage this turn. */
  damaged?: boolean;
  /** At least one of these subtypes ("Cat or Dog"…). */
  anySubtype?: string[];
  notSubtype?: string;
  minManaValue?: number;
  maxPower?: number;
  /** Basic land (`false`: "nonbasic"). */
  basic?: boolean;
  /** Permanent card (off the stack): artifact, creature, enchantment, land, planeswalker, battle. */
  permanent?: boolean;
  /** At least one of these filters ("artifact, enchantment, or creature with flying"). */
  anyOf?: ObjectFilter[];
  /** Token (`false`: "nontoken"). */
  token?: boolean;
  minToughness?: number;
  /** Was dealt damage by the source this turn (Predator Ooze). */
  damagedBySource?: boolean;
  /**
   * Of the choice made by the source (its `chosen`), resolved by `withChosen`: the creature type or color chosen as it
   * entered (`subtype`, `color`); the name (`cardName`, Petrified Hamlet: "lands with the chosen name"); the card type
   * (`cardType`, Arachne: an entry mode whose options are card types); the parity of the mana value (`parity`, Gollum,
   * Riddle Master); a mana value, power or toughness equal to the chosen number (`number`, Talion, the Kindly Lord).
   */
  chosen?: "subtype" | "color" | "cardName" | "cardType" | "parity" | "number";
  /** Put into its current zone this turn ("card put into a graveyard this turn"). */
  enteredThisTurn?: boolean;
  /** A card in hand drawn this turn (Sylvan Library), read from the turn log. */
  drawnThisTurn?: boolean;
  /** Put into its zone from the battlefield this turn (Supper for Spiders). */
  fromBattlefieldThisTurn?: boolean;
  /** Legendary (true) or nonlegendary (false). */
  legendary?: boolean;
  /** Prepared spell (copy cast from exile, Codie). */
  preparedSpell?: boolean;
  /** Cast for its warp cost. */
  warped?: boolean;
  /** Prepared permanent. */
  prepared?: boolean;
  /** Attacked this turn. */
  attackedThisTurn?: boolean;
  /** Card put into the graveyard from the library this turn (milled: Raul, Tato Farmer, The Master). */
  milledThisTurn?: boolean;
  maxToughness?: number;
  /**
   * Owned by you or by an opponent, in any zone ("that you own": Get Out; "you own but don't control", with
   * `controller: "opponent"`: Coveted Falcon; "you control but don't own": Laughing Jasper Flint).
   */
  owner?: "you" | "opponent";
  /** None of these subtypes ("non-Outlaw": Shoot the Sheriff). */
  noneOfSubtypes?: string[];
  /** Card with no abilities (Fang-Druid Summoner, Rise from the Wreck). */
  noAbilities?: boolean;
  /** Face-down permanent (Duskmourn). */
  faceDown?: boolean;
  /**
   * Has at least one activated ability (The Enigma Jewel); `"mana"`: at least one mana ability (605.1a, Moonsilver
   * Key: "an artifact card with a mana ability").
   */
  withActivatedAbility?: boolean | "mana";
  /** Dealt damage this turn (Treacherous Greed). */
  dealtDamageThisTurn?: boolean;
  /** Suspected or not (701.60: "target suspected creature"). */
  suspected?: boolean;
  /**
   * You put a counter on it this turn (Fractal Tender); a kind: a counter of that kind (Kid Loki: "one or more +1/+1
   * counters"). Also read by static abilities.
   */
  countersPutByYouThisTurn?: boolean | string;
  /** Has disguise (Expose the Culprit: "face-up creatures you control with disguise"). */
  disguise?: boolean;
  /** {X} in its mana cost ("a spell with {X} in its mana cost": Matterbending Mage, Paradox Surveyor). */
  hasX?: boolean;
  /** Card with an Adventure (off the battlefield: graveyard, hand; Hearth Elemental). */
  adventure?: boolean;
  /** Permanent that entered by being cast ("if you cast it": The Sibsig Ceremony). */
  cast?: boolean;
}

/**
 * Comparison of a characteristic of the filtered object (`ObjectFilter.compare`, PLAN-H H10): its power, its toughness
 * or its mana value (0 for an object without one), `cmp` the value `to`. `to` is:
 * - an amount, replaced with its value by `resolveCompare` (`effects.ts`, see `ObjectFilter.compare`); as long as it
 *   is not resolved (filter read directly by `matchesView`), the comparison is ignored;
 * - `"power"` or `"basePower"`: the power, or the base power, of the object itself (Fecund Greenshell: "with toughness
 *   greater than its power"; Kutzil: "with power greater than its base power").
 * `cmp` `"odd"` or `"even"`, without `to`: even or odd value (Mutinous Massacre; 0 is even).
 * The source's values are read without a floor (107.1b, `raw` amount): "with greater power than this creature"
 * (stealth), "with mana value less than or equal to Alesha's power".
 */
export interface FilterCompare {
  what: "power" | "toughness" | "manaValue";
  cmp: "<" | "<=" | "=" | ">=" | ">" | "odd" | "even";
  to?: Amount | "power" | "basePower";
}

/** Events a generic `action` trigger can match (`TriggerSpec` `action`): the `e` of the engine's `RulesEvent`. */
export type ActionEvent =
  | "search"
  | "playerLost"
  | "discover"
  | "forage"
  | "gift"
  | "bend"
  | "caseSolved"
  | "manifestDread"
  | "attackTriggered"
  | "crime"
  | "collectEvidence"
  | "scry"
  | "exhaust"
  | "expend"
  | "saddled"
  | "plotted"
  | "cycled"
  | "transformed"
  | "monstrous";

/**
 * Trigger event (603). "self": the source itself; otherwise an object matching the filter, seen from the source's
 * controller.
 */
export type TriggerSpec =
  /**
   * A player performs an action announced by the engine's event of that name (PLAN-J J3), `whose` relative to the
   * controller (you by default): search ("whenever an opponent searches their library": Wan Shi Tong), playerLost
   * ("when an opponent loses the game": Shinryu; a player who just lost still counts as an opponent), discover (the
   * event amount is N), forage, gift, bend (waterbend, earthbend, firebend or airbend), caseSolved, manifestDread (the
   * event object is the card put into the graveyard), attackTriggered ("a creature you control attacking causes one of
   * its abilities to trigger"), crime (700.13), collectEvidence, scry (scry or surveil), exhaust ("whenever you
   * activate an exhaust ability"), expend (`n`: "whenever you expend your Nth total mana", Bloomburrow). `self`: an
   * action on the source itself: saddled (702.171), plotted ("when this card becomes plotted"), cycled (from the
   * graveyard; the event amount is the X of the cycling cost), transformed ("when this permanent transforms into
   * [this face]": carried by that face, read after the transformation), monstrous ("when this creature becomes
   * monstrous", 701.37b).
   */
  /** `whose: "chosen"`: the source's chosen player (`chosen.player`: "when the chosen player loses the game", Shinryu). */
  | { on: "action"; action: ActionEvent; whose?: "you" | "opponent" | "any" | "chosen"; self?: boolean; n?: number }
  /**
   * `fromZone`: only an object that entered from that zone, or was cast from it (Twilight Diviner: a graveyard;
   * Extraordinary Journey: exile).
   */
  | { on: "enters"; who: "self" | ObjectFilter; fromZone?: "graveyard" | "exile" }
  | { on: "dies"; who: "self" | ObjectFilter }
  /** A matching permanent is destroyed by a spell or ability (an opponent's: `byOpponent`); event player: the one who destroys. */
  | { on: "destroyed"; who: ObjectFilter; byOpponent?: boolean }
  /** `to`: only to that zone ("when this artifact is put into a graveyard from the battlefield"). */
  /** `whileCrafting`: exiled as a crafting material (Market Gnome). */
  /** `who` filter: "whenever a creature you control with a +1/+1 counter on it leaves the battlefield". */
  /** `withoutDying`: "leaves the battlefield without dying" (Dour Port-Mage, Three Tree Scribe). */
  | {
      on: "leaves";
      who: "self" | "linked" | ObjectFilter;
      to?: Zone;
      whileCrafting?: boolean;
      withoutDying?: boolean;
    }
  /**
   * "Whenever you gain life [for the first time each turn]", "whenever an opponent loses life", "whenever you gain or
   * lose life" (`change` absent); `whose` relative to the controller, you by default.
   */
  | { on: "life"; change?: "gain" | "loss"; whose?: "you" | "opponent" | "any"; first?: boolean }
  /** "Whenever an opponent gains control of a permanent you controlled" (Zidane). */
  | { on: "controlChange" }
  /**
   * `alone`: "whenever a creature you control attacks alone" (Squall, Seifer). `defending: "you"`: it attacks the
   * controller (not their planeswalkers); `"youOrYourPlaneswalkers"`: the controller or a planeswalker they control;
   * `"player"`: it attacks a player (not a planeswalker).
   */
  | { on: "attacks"; who: "self" | ObjectFilter; defending?: "you" | "youOrYourPlaneswalkers" | "player"; alone?: boolean }
  /**
   * `to`: what is dealt the damage, players (`players`, relative to the ability's controller) or objects (`objects`):
   * "to a player" (`{ players: "any" }`), "to one of your opponents", "to a player or planeswalker" (Flitterwing
   * Nuisance), "to a creature" (Mephidross Vampire).
   */
  | { on: "dealsCombatDamage"; who: "self" | ObjectFilter; to?: TargetFilter }
  /** `targeting`: the spell targets a matching object (`objects`) or player (`players`). */
  | {
      on: "castSpell";
      by: "you" | "opponent" | "any";
      filter?: ObjectFilter;
      /** `orFilter`: the spell matches the filter OR targets what is indicated (Danitha, Sword of Hope). */
      targeting?: Pick<TargetFilter, "objects" | "players"> & { orFilter?: boolean };
      /** "your second spell each turn": the Nth spell cast by that player this turn. */
      nth?: number;
      /** "a spell with a single target" (Spinerock Tyrant). */
      singleTarget?: boolean;
      /** "…, if it's not their turn" (Adrenaline Jockey, March of the World Ooze). */
      notTheirTurn?: boolean;
      /** Modal spell (Riku of Many Paths). */
      modal?: boolean;
      /** Cast from anywhere other than the hand (Kellan, the Kid). */
      notFromHand?: boolean;
      /** "…, if at least N mana was spent to cast it" (Final Fantasy). */
      minManaSpent?: number;
      /** "a spell they don't own" (Gonti, Night Minister). */
      notOwned?: boolean;
      /**
       * Alania: the first spell of one of these types ("Instant", "Sorcery") or subtypes ("Otter") cast this turn,
       * other than the source.
       */
      firstOf?: string[];
      /** "if mana from a [Treasure] was spent to cast it" (Smaug, Wicked Worm): a matching source, seen through its
       * last known information if it is gone; `{ self: true }`: "using mana produced by [this source]" (Tecutlan,
       * Barracks of the Thousand). */
      usingManaFrom?: ObjectFilter;
      /** Cast from exile (Quintorius Kand). */
      fromExile?: boolean;
      /** Cast from the hand (Ojer Pakpatiq). */
      fromHand?: boolean;
      /**
       * Granted storm (702.40a; Ral's emblem, Prismari): the event amount is the number of spells cast before it this
       * turn by all players, read when it was cast, rather than the instants and sorceries you cast before it.
       */
      storm?: boolean;
    }
  /**
   * "At the beginning of [the step]"; `main`: each main phase (Carpet of Flowers); `nth`: only the Nth main phase of
   * the turn (Survival: the second, 505.1a), or each postcombat main phase (`"postcombat"`: every main phase but the
   * first, 505.1a; Sphinx of the Second Sun, Florian, Tymna: also those added after an additional combat).
   */
  | { on: "step"; step: Step | "main"; whose: "you" | "opponent" | "any"; nth?: number | "postcombat" }
  | { on: "landfall" }
  /** "Whenever you draw [your second card each turn]"; `whose` relative to the controller. */
  /** `exceptTurnDraw`: "except the first one they draw in each of their draw steps" (Orcish Bowmasters). */
  | { on: "draw"; whose: "you" | "opponent" | "any"; nth?: number; exceptTurnDraw?: boolean }
  /** "Whenever you attack [with N or more creatures]" */
  /** `anyPlayer`: "whenever a player attacks with N or more creatures" (Aurelia, the Law Above). */
  /**
   * `defending`: an opponent attacks, and only their attackers attacking you (`"you"`, Lulu), you and/or your
   * planeswalkers (`"youOrYourPlaneswalkers"`, Tomik, Wielder of Law) count; the event player is then the attacker.
   */
  /**
   * `eachPlayer`: "whenever you attack a player [with one or more …]": one trigger for each player attacked (not a
   * planeswalker) by at least `min` matching attackers, that player being `ref.eventPlayer` (Echoing Assault, Bitter
   * Work).
   */
  | {
      on: "attackWith";
      min?: number;
      filter?: ObjectFilter;
      anyPlayer?: boolean;
      defending?: "you" | "youOrYourPlaneswalkers";
      eachPlayer?: boolean;
    }
  /** "Whenever counters are put on …" */
  /** `firstThisTurn`: "if it's the first time counters have been put on it this turn" (Stalwart Successor). */
  /** `by: "you"`: "whenever you put counters" (the one who puts them: controller of what is resolving, otherwise of
   * the permanent). */
  /** `each`: "whenever a [+1/+1] counter is put on …", one trigger per counter (Fathom Mage), each with an amount of 1. */
  | { on: "countersPut"; who: "self" | ObjectFilter; kind?: string; firstThisTurn?: boolean; by?: "you"; each?: boolean }
  /** Damage dealt by a source (noncombat only if requested), possibly to an opponent. */
  /** `anySourceYouControl`: any source (spells included) controlled by the ability's controller (Niv-Mizzet). */
  | {
      on: "dealsDamage";
      who: "self" | ObjectFilter;
      noncombatOnly?: boolean;
      /** What is dealt the damage (as for `dealsCombatDamage`). */
      to?: TargetFilter;
      anySourceYouControl?: boolean;
      /** Taii Wakeen: damage equal to the damaged creature's toughness. */
      exactToughness?: boolean;
      /**
       * Imodane: the source is a spell (filtered by `who`) that targets only a single creature, and the damage is dealt
       * to that creature.
       */
      spellToSoleTarget?: boolean;
      /** `damaged`: the event object is what is dealt the damage (Spider-Slayer, Hatred Honed: "destroy that creature"). */
      eventObject?: "damaged";
    }
  /** "Whenever an opponent discards a card" */
  /** `self`: "when you discard this card" (triggers from the graveyard, Titanbones). */
  | { on: "discard"; whose: "you" | "opponent" | "any"; self?: boolean }
  /** "Whenever [this creature] becomes the target of a spell or ability [an opponent controls]" */
  /** `spells`: matching spells too ("a creature or creature spell you control", Surrak). */
  | {
      on: "becomesTarget";
      who: "self" | ObjectFilter;
      /**
       * Who targets: `opponent`, a spell or ability an opponent controls (ward); `you`, a spell or ability the source's
       * controller controls (Valiant, Bloomburrow); `yourSpell`, a spell you cast, not a copy ("whenever you cast a
       * spell that targets this creature", with `who: "self"`).
       */
      by?: "opponent" | "you" | "yourSpell";
      spells?: boolean;
      /** A targeted player counts too (Loki, God of Mischief: "a player or permanent"). */
      players?: boolean;
      /** Only by an ability (not a spell). */
      only?: "abilities";
    }
  /** "Whenever [this creature] becomes tapped" (`untap`: becomes untapped). */
  /** `byYou`: "whenever you tap [a creature]" (Solitary Sanctuary: an opponent's creature). */
  /**
   * `cause: "teamwork"`: tapped to pay for teamwork (Agent Maria Hill); `firstThisTurn`: the first time it becomes
   * tapped this turn (Captain America, Living Legend).
   */
  /** `untap`: "whenever [it] becomes untapped" instead (Fishing Pole). */
  | {
      on: "taps";
      who: "self" | ObjectFilter;
      byYou?: boolean;
      /** `mana`: tapped for mana (Forbidden Orchard: "whenever you tap it for mana"). */
      cause?: "teamwork" | "mana";
      firstThisTurn?: boolean;
      untap?: boolean;
    }
  /** "When you cast this spell" (the source is the spell on the stack). */
  | { on: "castSelf" }
  /** Saga chapter (714.2): a lore counter makes the count reach or exceed one of these chapters. */
  | { on: "chapter"; chapters: number[] }
  /** "When this Class becomes level N" (716). */
  | { on: "classLevel"; level: number }
  /** "Whenever a [creature] explores [a land / nonland card]" (701.44). */
  | { on: "explores"; who: "self" | ObjectFilter; land?: boolean }
  /** "Whenever you sacrifice [a permanent]" */
  | { on: "sacrifice"; anyPlayer?: boolean; byOpponent?: boolean; who: ObjectFilter }
  /** "Whenever this creature saddles a Mount or crews a Vehicle [during your main phase]"; the event object is the Mount or the Vehicle. */
  | { on: "crews"; mainPhase?: boolean }
  /** "When this creature is turned face up"; `who`: "whenever a [filter] permanent is turned face up". */
  | { on: "turnedFaceUp"; who?: ObjectFilter }
  /** "Whenever a [creature] becomes blocked" (Norin). */
  | { on: "becomesBlocked"; who: ObjectFilter }
  /**
   * An Aura or an Equipment matching `who` (`"self"`: this one, Assimilation Aegis) becomes attached to a permanent
   * matching `to` (relative to the ability's controller): Eriette. The event object is the attachment, the event player
   * the host's controller.
   */
  | { on: "becomesAttached"; who: "self" | ObjectFilter; to?: ObjectFilter }
  /** "When you unlock this door" (Room: `door` is set at import from the face). */
  | { on: "unlockDoor"; door?: number }
  /** Eerie (Duskmourn): "whenever an enchantment you control enters and whenever you fully unlock a Room". */
  | { on: "eerie" }
  /** "Whenever this creature (or enchanted/equipped creature) is dealt damage" */
  /** Filter: "whenever a creature you control is dealt damage" (The Sensational She-Hulk). */
  /** `attached`: the enchanted or equipped creature, or the enchanted player (player Aura, Grievous Wound). */
  /**
   * "Whenever [this creature / an object / enchanted player / you / an opponent] is dealt damage"; a player: `"you"`,
   * `"opponent"` (from any source); `combat`: only combat damage (`true`) or the other damage (`false`). The event
   * object is the source for a damaged player.
   */
  /** `excess`: "are dealt excess [noncombat] damage" (120.4a, Magmatic Galleon): the amount is the excess. */
  | { on: "isDealtDamage"; who: "self" | "attached" | "you" | "opponent" | ObjectFilter; combat?: boolean; excess?: boolean }
  /** "Whenever you copy a [matching] spell" (Kalamax, the Stormsire); `ref.eventObject`: the copy. */
  | { on: "copySpell"; filter?: ObjectFilter }
  /** "Whenever one or more [creatures] deal combat damage to a player": once per step and per player. */
  /** `to`: only the damage dealt to these players ("to you": Tamiyo, Upriser Crowned). */
  | { on: "combatDamageBatch"; who: ObjectFilter; to?: TargetFilter }
  /**
   * "Whenever one or more [nonland] cards are milled" (once per mill); `whose`: by that player ("whenever an opponent
   * mills a nonland card"); `amount.eventAmount`: the number of those cards.
   */
  | { on: "milled"; whose?: "you" | "opponent" | "any"; nonland?: boolean }
  /** "Whenever a [creature] blocks" */
  /** `eventObject: "attacker"`: the event object is the blocked attacker (Skewer Slinger: "that creature"). */
  | { on: "blocks"; who: "self" | ObjectFilter; attacker?: ObjectFilter; eventObject?: "attacker" }
  /** "Whenever [creature] dies or is exiled" (from the battlefield). */
  | { on: "diesOrExiled"; who: "self" | ObjectFilter; minPower?: number }
  /** "Whenever you play a land"; `from`: only from these zones ("from exile", Ghost-Spider). */
  /** `whose`: who plays the land (you by default; Burgeoning: an opponent). */
  | { on: "playLand"; from?: Zone[]; whose?: "you" | "opponent" | "any" }
  /** "Whenever [you] discard one or more cards" (amount: their number). */
  | { on: "discardBatch"; whose: "you" | "opponent" | "any" }
  /**
   * A card changes zones (Ketramose: "put into exile from graveyards and/or the battlefield"; Dredger's Insight:
   * "leave your graveyard"). `whose`: the card's owner.
   */
  /**
   * `linked`: a card linked to the source (exiled with it) leaves that zone; `ref.eventPlayer` is then the player who
   * controls it afterwards (Share the Spoils: "when they do", the player who played it).
   */
  | { on: "zoneChange"; from: Zone[]; to?: Zone[]; filter?: ObjectFilter; whose?: "you" | "opponent" | "any"; linked?: boolean }
  /** "Whenever you activate a loyalty ability [by removing at least N counters]"; `byOpponent`: an opponent activates it. */
  | { on: "loyaltyActivated"; minRemoved?: number; byOpponent?: boolean }
  /** "Whenever you activate an ability that isn't a mana ability" (the object: the ability on the stack);
   * `source`: only that of a matching permanent (Elrond, Moon-Reader: "of a creature"); `targeting`: that targets a
   * matching object or player (Ertha Jo: "a creature or player"). */
  | { on: "activateAbility"; source?: ObjectFilter; targeting?: Pick<TargetFilter, "objects" | "players"> };

/** Conditions ("intervening if" 603.4, "as long as"…). */
export type Condition =
  | { kind: "controls"; filter: ObjectFilter; atLeast?: number }
  /** The spell that puts the object onto the battlefield was kicked. */
  | { kind: "kicked" }
  | { kind: "yourTurn" }
  | { kind: "opponentsTurn" }
  /** The current turn is an extra turn (500.7). */
  | { kind: "extraTurn" }
  /** The source has at least N counters of this kind. */
  | { kind: "counterAtLeast"; counter: string; n: number }
  | { kind: "not"; cond: Condition }
  /**
   * The source was cast (the spell resolving, or the permanent it became): from that zone, or for that alternative
   * cost (Web-slinging, Mayhem, sneak, evoke…).
   */
  | { kind: "cast"; from?: Zone; via?: CastVia }
  /** Value stored during the resolution ("if you do", "if a creature card was exiled"). */
  | { kind: "var"; name: string; atLeast?: number }
  | { kind: "all"; of: Condition[] }
  /** At least N permanents matching the filter on the whole battlefield (Blasphemous Edict). */
  | { kind: "battlefieldCount"; filter: ObjectFilter; atLeast: number }
  /** The source matches the filter ("if Kellan is a Scout"). */
  | { kind: "sourceMatches"; filter: ObjectFilter }
  /** Cost reduction: a target of this word "target" matches the filter (Luminous Rebuke). */
  | { kind: "targetMatches"; spec: string; filter: ObjectFilter }
  /** During the resolution: the designated object matches the filter ("if it's a Cat"). */
  | { kind: "refMatches"; ref: Ref; filter: ObjectFilter }
  /** The event object (last known information) matches the filter ("if it was attacking"). */
  | { kind: "eventObjectMatches"; filter: ObjectFilter }
  /** An amount evaluated from the controller's point of view reaches N ("total power 8 or greater"). */
  | { kind: "amountAtLeast"; amount: Amount; n: number }
  /** One amount strictly greater than another, evaluated on resolution (Evil's Thrall). */
  | { kind: "amountGreater"; a: Amount; b: Amount }
  /** X of the spell resolving. */
  | { kind: "xAtLeast"; n: number }
  /** It is the first combat phase of the turn (Genji Glove). */
  | { kind: "firstCombat" }
  /** You control a creature with the greatest power or tied for it (Summon: Fenrir). */
  | { kind: "controlsGreatestPower" }
  /** The source is prepared. */
  | { kind: "prepared" }
  /** "Behold a Jace": you control a Jace or you have a Jace card in hand. */
  /** "If {U}{U} was spent to cast it": at least N mana of this type spent to cast the source. */
  | { kind: "spentColor"; color: ManaType; n: number }
  /** Sneak: declare blockers step, with an unblocked attacker you control. */
  | { kind: "sneakWindow" }
  /** You have a designation kept for the game: an enduring story (Storied), the city's blessing (ascend, 702.131). */
  | { kind: "designation"; which: PlayerDesignation }
  /** You are the monarch (724). */
  | { kind: "monarch" }
  /** The source is harnessed (Harness): its ∞ abilities are active. */
  | { kind: "harnessed" }
  /** The event object (gone from the battlefield) had the greatest power among its controller's creatures, counting
   * those that left at the same time (Kraven the Hunter). `strictAmongAll`: its power is greater than that of each
   * other creature, whoever controls it (Selvala, Heart of the Wilds). */
  | { kind: "eventObjectGreatestPower"; strictAmongAll?: boolean }
  /** Behold (701.63): you control a matching permanent, or you reveal a matching card from your hand. */
  | { kind: "behold"; filter: ObjectFilter }
  /** The spell was cast by beholding (additional cost `behold`). */
  | { kind: "beheld" }
  /** The card's `whenCast` condition was met when the spell was cast. */
  | { kind: "metWhenCast" }
  /** A single creature attacks, and it attacks a player ("attacks a player alone"). */
  | { kind: "attackingAlone" }
  /** An opponent was dealt noncombat damage last turn (Command the Stage). */
  | { kind: "opponentDealtNoncombatDamageLastTurn" }
  /** Sieges: the source chose this mode as it entered. */
  | { kind: "chosenMode"; mode: string }
  /** The source has already dealt damage, combat or not (Karakyk Guardian), or combat damage (`combat`: Ruric Thar). */
  | { kind: "sourceDealtDamage"; combat?: boolean }
  /** Room (709.5): the source's door N is locked; all its doors are unlocked. */
  | { kind: "doorLocked"; door: number }
  /** Class: the source is at exactly this level. Case: the source is solved. */
  | { kind: "classLevel"; level: number }
  /** Mount: the source was saddled this turn. */
  | { kind: "saddled" }
  | { kind: "solved" }
  /** Max speed (4); `not` for "a player who doesn't have max speed". */
  | { kind: "maxSpeed" }
  /** It is at least your Nth turn (Jace Reawakened: "not during your first three turns"). */
  | { kind: "turnsTakenAtLeast"; n: number }
  /** It is this step (Smoky Lounge: "your first main phase"). */
  /** `first`: the first end step of the turn (Y'shtola Rhul). */
  | { kind: "step"; step: Step; first?: boolean }
  /** The amount is a prime number (Zimone, All-Questioning). */
  | { kind: "prime"; amount: Amount }
  /** At least one of the conditions. */
  | { kind: "any"; of: Condition[] }
  /** An opponent has more lands, life, creatures or cards in hand than you (Beza). */
  | { kind: "opponentHasMore"; what: "lands" | "life" | "creatures" | "hand" }
  /** The designated player has at most N cards in hand (evaluated during the resolution). */
  | { kind: "handAtMost"; ref: Ref; n: number }
  /** The designated player (you by default) has the most life, or is tied for it (Preacher of the Schism). */
  | { kind: "mostLife"; ref?: Ref };
/** Property read by an aggregate (`Amount` `aggregate`). */
export type AggregateProperty =
  | "power"
  | "toughness"
  | "manaValue"
  | "color"
  /** Color pair of an object that has exactly two colors (Niv-Mizzet, Guildpact). */
  | "colorPair"
  | "cardType"
  | "permanentType"
  | "subtype"
  | "basicLandType"
  | "name"
  /** Kinds of counters present (Hundred-Battle Veteran). */
  | "counterKind"
  /** Number of counters of the kind `counter`. */
  | "counters"
  /** Colors of the card's color identity (903.4: War Room, "the colors in your commanders' color identity"). */
  | "colorIdentity";

/** Reference to a player or an object, resolved when the effect happens. */
export type Ref =
  | { kind: "target"; id: string }
  | { kind: "self" }
  | { kind: "you" }
  | { kind: "eachOpponent" }
  | { kind: "eachPlayer" }
  /** The object of the trigger event (the creature that enters, dies, attacks, the spell cast…). */
  | { kind: "eventObject" }
  /**
   * "One or more …": the objects of all the events of the batch ("those creatures", "one of them"), like
   * `eventObject` for each; in an aggregate, an object gone from the battlefield is read from its last known information.
   */
  | { kind: "eventObjects" }
  /** "Those players" of a "one or more" batch: the players of all its events (Breeches: "each of those opponents"). */
  | { kind: "eventPlayers" }
  /**
   * The permanent the source is attached to ("equipped / enchanted creature"); with `of`, the permanents the designated
   * objects are attached to ("that permanent", the host of an Aura: Eriette).
   */
  | { kind: "attached"; of?: Ref }
  /** The permanents attached to the designated object ("an Equipment attached to that creature", Light of Judgment). */
  | { kind: "attachmentsOf"; ref: Ref }
  /** "This card", wherever it is now (follows the physical identity: Angelic Destiny). */
  | { kind: "selfCard" }
  /** Cards linked to the source (Hoarding Dragon). */
  | { kind: "linked" }
  /** Cards exiled "until" the source leaves the battlefield (Pinnacle Starcage). */
  | { kind: "exiledWith" }
  /** The targets of the event's spell or ability (Storm, Windrider: "those creatures"). */
  | { kind: "targetsOfEventObject" }
  /** The most recent ability on the stack whose source is the event object (Firebender Ascension). */
  | { kind: "abilitiesFromEventObject" }
  /** Top card of the library of each designated player. */
  /** `bottom`: the bottom card instead (Grenzo, Dungeon Warden); `count`: the top N cards (Memories Returning). */
  | { kind: "libraryTop"; who: Ref; bottom?: boolean; count?: number }
  /** Creatures that saddled or crewed the source this turn (Fortune, Calamity, The Gitrog, Luxurious Locomotive). */
  | { kind: "crewedBy" }
  /** The designated objects that match the filter, in any zone (Ghost Vacuum: the creature cards). */
  | { kind: "filtered"; ref: Ref; filter: ObjectFilter }
  /** The objects of `ref` minus those of `exclude` ("all other creatures"). */
  | { kind: "except"; ref: Ref; exclude: Ref }
  /** The event player (damaged player, caster of the spell…). */
  | { kind: "eventPlayer" }
  /**
   * The permanent that grants the activated ability that is resolving ("equipped creature has '… Return Trusty
   * Boomerang to its owner's hand'"), remembered on activation; nothing if it has changed zones since.
   */
  | { kind: "grantor" }
  /** The player chosen by the source as it entered (Saskia the Unyielding), if still in the game. */
  | { kind: "chosenPlayer" }
  /**
   * The controller of the designated object; gone from the battlefield this turn, its last known controller (608.2h:
   * Winds of Abandon, Indomitable Creativity); otherwise, off the battlefield and the stack, its owner.
   */
  | { kind: "controllerOf"; ref: Ref }
  /** The owner of the designated object ("its owner …": Zoyowa's Justice). */
  | { kind: "ownerOf"; ref: Ref }
  /** Objects moved earlier during the resolution (`store` of a move), under their new id. */
  | { kind: "stored"; name: string }
  /** "Each player who controls the most [creatures]" (No Witnesses). */
  | { kind: "playersWithMost"; filter: ObjectFilter }
  /** The defending player of the attacking source (the one who controls the attacked planeswalker). */
  | { kind: "defendingPlayer" }
  /**
   * The designated players for whom the condition is true, evaluated from their point of view ("each opponent who has
   * at most one card in hand", "the players who don't have max speed").
   */
  | { kind: "playersWhere"; of: Ref; where: Condition }
  /**
   * What was paid in objects for the cost of the spell or ability resolving (last known information): sacrificed
   * permanents, discarded cards (still present), exiled cards, creature returned for Web-slinging.
   */
  /** `defender`: what the unblocked attacker returned for ninjutsu was attacking (702.49c). */
  | { kind: "cost"; paid: "sacrificed" | "discarded" | "exiled" | "bounced" | "beheld" | "defender" }
  /** The designated players and the planeswalkers they control ("that player or a planeswalker they control"). */
  | { kind: "withPlaneswalkers"; of: Ref }
  /**
   * The objects of a zone of the designated players, matching the filter: permanents they control, cards in their
   * graveyard, in their hand (mana value at most `maxManaValue`), face-up exiled cards they own, spells and abilities
   * they control on the stack (except what is resolving).
   */
  | {
      kind: "zone";
      /** `library`: the cards of the library, in order (searched: Sphinx Ambassador; never shown outside a choice). */
      zone: "battlefield" | "graveyard" | "hand" | "exile" | "stack" | "command" | "library";
      who: Ref;
      filter?: ObjectFilter;
      maxManaValue?: Amount;
      /** On the battlefield: the permanents they own, whoever controls them (Expropriate: "a permanent owned by the voter"). */
      owned?: boolean;
    }
  /**
   * The objects with the same name as the designated objects (themselves included): on the battlefield (Maelstrom
   * Pulse), or in your graveyard (Rat King, Verminister).
   */
  | { kind: "sameName"; ref: Ref; zone: "battlefield" | "graveyard" }
  /** Union of references, without duplicates (Call the Spirit Dragons: the Dragons chosen for each color). */
  | { kind: "union"; of: Ref[] }
  /** The creatures blocking the designated objects or blocked by them during this combat (Ride Down). */
  | { kind: "combatPartners"; ref: Ref }
  /** Commander (903.3): the commanders of the designated players, wherever they are ("your commander", Path of Ancestry). */
  | { kind: "commanders"; who: Ref }
  /** The players who chose the highest number, the lowest, or not the lowest (`fx.chooseNumbers`). */
  | { kind: "numberChoosers"; store: string; which: "highest" | "lowest" | "notLowest" }
  /** The nth (from 0) of the designated objects or players, nothing if there aren't that many (`fx.forEachPlayer`). */
  | { kind: "nth"; of: Ref; n: number };

export type Amount =
  | number
  /**
   * Aggregate over objects: those of the filter on the battlefield (seen from the controller), those of another zone
   * (`zone`, of the players `whose`, you by default), or the designated objects (`of`). On the battlefield, the computed
   * characteristics; elsewhere, the printed ones (last known information for an object that is gone). `fn`: sum (each
   * value floored at 0), greatest value (0 without objects), number of different values, or `mostShared`: the greatest
   * number of objects that share a creature type (changelings included).
   */
  | {
      kind: "aggregate";
      fn: "sum" | "max" | "distinct" | "mostShared";
      property: AggregateProperty;
      filter?: ObjectFilter;
      zone?: "graveyard" | "hand" | "exile";
      whose?: "you" | "opponents" | "all";
      of?: Ref;
      /** Kind of counter (`property: "counters"`). */
      counter?: string;
      /**
       * `distinct` colors: the colors of the spells you've cast this turn (turn log) count too (First Family: "colors
       * among permanents you control and spells you've cast this turn").
       */
      withSpellsCast?: boolean;
    }
  /**
   * What was spent to cast the source (the spell resolving, or the permanent it became), or the designated objects
   * (`of`: the event's spell…): X, mana, number of colors of mana, mana from Caves.
   */
  | { kind: "spent"; what: "x" | "mana" | "colors" | "cave" | "artifact"; of?: Ref }
  /**
   * Mana symbols of this color, hybrids included, in the mana costs of the designated objects (Namor: the event's
   * spell); without `of`, of your permanents (devotion, 700.5).
   */
  | { kind: "manaSymbols"; color: ManaType; of?: Ref }
  | { kind: "x" }
  | { kind: "kicked"; yes: number; no: number }
  | { kind: "powerOf"; ref: Ref }
  /** Quantity of the event (damage dealt, life gained…). */
  | { kind: "eventAmount" }
  /** Number of objects matching the filter, seen from the controller (on the battlefield by default). */
  | {
      kind: "count";
      filter: ObjectFilter;
      zone?: "battlefield" | "graveyard" | "hand" | "exile";
      whose?: "you" | "opponents" | "all";
    }
  /** Counters of a kind on an object. */
  | { kind: "countersOn"; ref: Ref; counter: string }
  | { kind: "sum"; of: Amount[] }
  /**
   * Negation ("-X/-0") and integer division ("for every seven cards"); `up`: rounded up ("half their life, rounded
   * up", `amount.halfLife`).
   */
  | { kind: "neg"; of: Amount }
  | { kind: "div"; of: Amount; by: number; up?: boolean }
  /** Power: `base` to the power `of` (Mathemagics: "2^X cards"), capped at 2^20. */
  | { kind: "pow"; base: number; of: Amount }
  /** Value stored during the resolution (life lost this way, excess damage…). */
  | { kind: "var"; name: string }
  /**
   * Your life total (0 at the lowest); `starting`: your starting life total (Game Over: "half their starting life
   * total"); `who`: that of the first designated player rather than yours (0 if there is none).
   */
  | { kind: "lifeTotal"; starting?: boolean; who?: Ref }
  /** Times you've cast a commander from the command zone this game (903.8: the tax counter of each of your commanders). */
  | { kind: "commanderCasts" }
  | { kind: "manaValueOf"; ref: Ref }
  | { kind: "toughnessOf"; ref: Ref }
  /** Number of cards in a zone of the controller. */
  | { kind: "cardsIn"; zone: "hand" | "graveyard" | "library" }
  /** Your speed (0 if you have none). */
  | { kind: "speed" }
  /** Number of designated objects (Luxurious Locomotive: the creatures that crewed it). */
  | { kind: "refCount"; ref: Ref }
  /** Unlocked doors among the Rooms the controller controls (Duskmourn). */
  | { kind: "unlockedDoors" }
  /** The greatest of the amounts. */
  | { kind: "max"; of: Amount[] }
  /**
   * The greatest value of the amount, evaluated from the point of view of each of the designated players ("the greatest
   * number of artifacts an opponent controls", Cavern-Hoard Dragon); 0 without players.
   */
  /** The greatest amount among the players (seen from each); `sum`: their total (Vault 12: "rad counters among players"). */
  | { kind: "maxOverPlayers"; players: Ref; amount: Amount; sum?: boolean }
  /** Unused mana in your mana pool, marked mana included (Omnath, Locus of the Void). */
  | { kind: "manaInPool" }
  /** Your poison counters (corrupted: `amount.maxOverPlayers(ref.eachOpponent, amount.poison)`). */
  /** Poison counters of your controller; `counter: "rad"`: their rad counters (Mariposa Military Base). */
  | { kind: "poison"; counter?: "rad" }
  /** The highest number chosen (`fx.chooseNumbers`, Wheel of Misfortune). */
  | { kind: "numberChosen"; store: string }
  /** Number of graveyards that contain at least N cards (Master's Councillors, The Master of Lake-town). */
  | { kind: "graveyardsWithAtLeast"; n: number }
  /** Designated objects still in exile (Dragonhawk: "those of these cards still exiled"). */
  | { kind: "inExile"; ref: Ref }
  /** Power of the source when the ability triggered ("when this creature dies, … equal to its power"). */
  | { kind: "lkiPower" }
  /** Turn log (`turnlog.ts`): matching entries, seen from the ability's controller. */
  /** `of`: count for these players ("the cards milled by target player") rather than for the controller. */
  | { kind: "turnEvents"; query: TurnLogQuery; of?: Ref }
  /**
   * Raw value, without a floor (107.1b), for the comparisons of filters (`ObjectFilter.compare`). Without `of`, of the
   * source: `power`, its power on the battlefield, otherwise from its last known information (0 without a source);
   * `manaSpent`, the mana spent to cast it (the permanent, its last known information, otherwise its spell on the
   * stack; 0 by default). With `of` (`power` only): the power of the first designated object still on the battlefield
   * (Fell the Mighty: the target creature); without such an object, no value (NaN: no comparison is true).
   */
  | { kind: "raw"; what: "power" | "manaSpent"; of?: Ref };
