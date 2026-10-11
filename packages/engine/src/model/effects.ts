/** Engine types — effects (union `Effect`: one `op` per effect; handlers in `ops/`). Re-exported by `types.ts`. */
import type {
  AbilityDef,
  Amount,
  CardType,
  Color,
  Condition,
  CostDef,
  DelayedTiming,
  EventReplacement,
  Keyword,
  LayerMods,
  ManaAbilityDef,
  ManaCost,
  ManaRestriction,
  ManaType,
  ModeDef,
  MoveSpec,
  ObjectFilter,
  PlayerStaticAbilityDef,
  Ref,
  TargetSpec,
  TokenSpec,
  TriggerSpec,
} from "../types";

export type Effect =
  /** Airbend (Avatar): exiles the permanent or spell; its owner may cast it for {2} as long as it remains exiled. */
  | { op: "airbend"; what: Ref }
  /** "You [element]bend" (after an earthbend or firebend): event and turn log. */
  | { op: "bent"; kind: "water" | "earth" | "fire" | "air" }
  /** "Harness [this Infinity Stone]": its ∞ abilities become active. */
  | { op: "harness" }
  /**
   * Deadly Cover-Up: exile a card from an opponent's graveyard (chosen by the controller), then all cards with the same
   * name from their graveyard, hand and library; they shuffle, then draw as many cards as were exiled from their
   * hand.
   */
  /** `of`: the target (The End) rather than a card chosen in an opponent's graveyard. */
  /** `of`: a permanent (namesakes of its controller) or a graveyard card (of its owner); `draw`: they draw as many cards as were exiled from their hand. */
  | { op: "exileNamesakes"; of?: Ref; draw?: boolean }
  /** Player effect until end of turn ("damage can't be prevented this turn"); `times`: that many single-use effects. */
  | {
      op: "playerEffect";
      ability: Omit<PlayerStaticAbilityDef, "kind">;
      who?: Ref;
      /**
       * Until the beginning of the controller's next turn (`untilYourNextTurn`), of each affected player
       * (`untilTheirNextTurn`, Teferi's Reproach: "until that player's next turn"), until the end of the next turn of
       * each affected player (`throughTheirNextTurn`, Azor, the Lawbringer: "during that player's next turn", with a
       * `during: "yourTurn"` restriction) or for the rest of the game (`forever`: "they can't gain life for the rest
       * of the game", Screaming Nemesis); absent: until end of turn.
       */
      /** `throughYourNextTurn`: until the end of the controller's next turn, for every affected player (Single Combat). */
      /** `nextTurn`: only during the next turn of the game (Kang the Conqueror: "take an extra turn after this one.
       * During that turn, …"). */
      /** `thisCombat`: until the end of the current combat phase (Mirri, Weatherlight Duelist: "this combat"). */
      duration?:
        | "thisCombat"
        | "untilYourNextTurn"
        | "untilTheirNextTurn"
        | "throughTheirNextTurn"
        | "throughYourNextTurn"
        | "nextTurn"
        | "forever";
      times?: Amount;
      /** Single use, until end of turn ("the next spell you cast this turn"). */
      once?: boolean;
    }
  /** Proliferate N times (701.34), automatic choice: your permanents with counters, and among opponents -1/-1, stun and poison counters. */
  /** `what`: only the designated objects or players, without a choice (Powerful Broker). */
  | { op: "proliferate"; times: Amount; what?: Ref }
  /**
   * N counters on a matching permanent of the player; if they have none, they create the token first (family R4.6:
   * Jace's empower, amass). `addSubtypes`: the permanent gets these subtypes (701.47a).
   */
  | {
      op: "counterOnOrCreate";
      who: Ref;
      find: ObjectFilter;
      token: TokenSpec;
      kind: string;
      amount: Amount;
      addSubtypes?: string[];
    }
  /**
   * Suspend (702.62): the spell (removed from the stack, without being countered) or the card is exiled with N time
   * counters and becomes suspended (Taigam, Master Opportunist). See `suspendUpkeep` (turn.ts).
   */
  | { op: "suspend"; what: Ref; time: number }
  /** Endure N (701.64): N +1/+1 counters on the designated permanent, or a white N/N Spirit token, at your choice. */
  | { op: "endure"; what: Ref; amount: Amount }
  /** "Remove up to N counters" (automatic choice: loyalty, +1/+1, then the others). */
  | { op: "removeCounters"; what: Ref; n: Amount; kind?: string; store?: string }
  /** Suspect / no longer suspected (701.60). */
  | { op: "suspect"; what: Ref; value: boolean }
  /** Becomes prepared / unprepared (Reality Fracture). */
  | { op: "prepare"; what?: Ref; filter?: ObjectFilter; value: boolean }
  /**
   * `storeExcess`: excess damage (120.4a); `storeDealt`: the damage really dealt to the targets, after prevention and
   * redirection ("if a player is dealt damage this way": Sonic Shrieker; "a permanent dealt damage by": Torch the Tower).
   */
  | { op: "damage"; amount: Amount; to: Ref; source?: Ref; storeExcess?: string; storeDealt?: string }
  /** `storeExcess`: excess damage dealt to the second creature (The Last Agni Kai). */
  | { op: "fight"; a: Ref; b: Ref; storeExcess?: string }
  /** `double`: each object gets +X/+Y, where X and Y are its power and toughness ("double the power and toughness"). */
  | { op: "pump"; what: Ref; power: Amount; toughness: Amount; keywords?: Keyword[]; double?: boolean }
  /** Any continuous effect on objects (layers 4 to 7): "becomes 0/1 and loses all abilities"… */
  | {
      op: "modify";
      what: Ref;
      mods: LayerMods;
      /** `untilYourNextUpkeep`: until the beginning of the controller's next upkeep (Xenic Poltergeist). */
      duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "endOfYourNextTurn" | "untilYourNextUpkeep";
      /** Duration tied to a state (with `duration: "permanent"`): see `ModifyWhile`. */
      while?: ModifyWhile;
      /**
       * Base P/T set to this amount, evaluated on resolution (layer 7b); a pair: base power and base toughness (Galion,
       * Elvenking's Butler: "equal to Galion's power and toughness").
       */
      basePT?: Amount | [Amount, Amount];
    }
  /**
   * `store`: the number of permanents destroyed, and the cards put into the graveyard this way ("if a creature card is
   * put into a graveyard this way", "for each creature destroyed this way").
   */
  /** `noRegenerate`: "they can't be regenerated" (Damnation). */
  | { op: "destroy"; what: Ref; store?: string; noRegenerate?: boolean }
  /** "Tap any number of untapped [permanents] you control": `store` remembers their number. */
  /**
   * Tap chosen untapped permanents matching the filter (resolved by `withX`); `exactly`: none or exactly N (conspire:
   * "you may tap two untapped creatures [that share a color with it]").
   */
  | { op: "tapChosen"; filter: ObjectFilter; store: string; exactly?: number }
  /** "Put those counters on [target]": the counters the event object had (last known information). */
  | { op: "lkiCountersTo"; to: Ref }
  /** Moves a counter from one permanent onto another; its kind at your choice if it has several (Nesting Grounds). */
  | { op: "moveCounter"; from: Ref; to: Ref }
  /**
   * Mills two cards and repeats as long as they share a card type (The Tale of Tamiyo, `draw`: drawing first) or a
   * color (`share: "color"`: Grindstone; `nonland`: two nonland cards, Sphinx's Tutelage); `who`: the library of these
   * players (the controller by default).
   */
  | { op: "millWhileShared"; who?: Ref; share?: "color"; nonland?: boolean; draw?: boolean }
  /**
   * `store`: remembers the number of cards actually drawn ("if you draw one or more cards this way"), and under
   * `<store>Players` the number of players who drew at least one ("for each opponent who drew a card this way").
   */
  | { op: "draw"; who: Ref; amount: Amount; store?: string }
  | { op: "gainLife"; who: Ref; amount: Amount }
  /**
   * `tapped`: tapped tokens; `attacking`: tapped and attacking (508.4), what their controller chooses (one question for
   * all the tokens), or the designated player or planeswalker (Endless Foot Assault: "… attacking that player"; Adeline:
   * `ref.withPlaneswalkers`, at your choice; no tokens if nothing is designated).
   */
  /** `pt`: X/X token (power and toughness equal to the amount, Dance of the Tumbleweeds). */
  | {
      op: "createTokens";
      token: TokenSpec;
      count: Amount;
      for?: Ref;
      store?: string;
      /**
       * Aura or Equipment tokens created attached: `count` tokens for each designated object still on the battlefield,
       * attached to it (Roles: "a Role attached to [each creature]"); nothing for an object that is gone (303.7b).
       */
      attachTo?: Ref;
      tapped?: boolean;
      attacking?: boolean | Ref;
      pt?: Amount;
    }
  /** Counters (+1/+1 by default); a negative amount removes some. */
  | { op: "addCounters"; what: Ref; amount: Amount; kind?: string }
  /** `half`: each player loses half their life, rounded down (Pox Plague). */
  | { op: "loseLife"; who: Ref; amount: Amount; store?: string; half?: boolean }
  | { op: "bounce"; what: Ref }
  | { op: "exile"; what: Ref }
  /** Regenerate (701.19): a regeneration shield for each designated permanent, until end of turn. */
  | { op: "regenerate"; what: Ref }
  /** Phasing (702.26): the designated permanents phase out until their controller's untap step. */
  | { op: "phaseOut"; what: Ref }
  /**
   * `halfLibrary`: each player mills half their library, rounded down (Singularity Rupture); `graveyardSize`: as many
   * cards as there are in their graveyard (Riverchurn Monument).
   */
  | {
      op: "mill";
      who: Ref;
      amount: Amount;
      store?: { name: string; filter?: ObjectFilter };
      /** `"up"`: half rounded up (Kitsune's Technique). */
      halfLibrary?: boolean | "up";
      graveyardSize?: boolean;
    }
  /** Removes a counter from each of N matching permanents (chosen automatically); `store`: 1 if done. */
  /** Effects with choices during the resolution. */
  /** `who`: the player who scries ("target player scries 3", Bumi); you by default. */
  | { op: "scry"; amount: Amount; who?: Ref }
  /** `toHand`: the matching cards put into the graveyard this way then go to the hand (Enlightened Confidant). */
  /** `store`: the number of cards put back on top (Starving Revenant). */
  | { op: "surveil"; amount: Amount; toHand?: { filter?: ObjectFilter; maxManaValue?: Amount }; store?: string }
  /** `chooser: "controller"`: the effect's controller chooses from the revealed hand ("Pilfer"). */
  | {
      op: "discard";
      who: Ref;
      amount: Amount;
      /** Half the cards in their hand, rounded down (Pox Plague). */
      half?: boolean;
      filter?: ObjectFilter;
      chooser?: "controller";
      optional?: boolean;
      store?: string;
      /** "… at random" */
      random?: boolean;
      /** Remembers, under `store`, only the number of discarded cards matching this filter ("nonland cards"). */
      storeFilter?: ObjectFilter;
      /** "… unless they discard a card [of this type]" (Alpharael, Dreaming Acolyte). */
      unlessFilter?: ObjectFilter;
      /** The chosen card is exiled instead of discarded (Intimidation Tactics). */
      exile?: boolean;
      /** The player first reveals that many cards of their choice; the choice is made among them (Klaw, Sonic Subjugator). */
      reveal?: Amount;
    }
  | {
      op: "sacrifice";
      who: Ref;
      filter: ObjectFilter;
      amount: Amount;
      optional?: boolean;
      store?: string;
      /** "… with the greatest mana value among …" (Break Under Pressure). */
      greatestManaValue?: boolean;
      /**
       * Instead of sacrificing: "… chooses a creature they control and exiles it" (Sothera: `store` remembers the exiled
       * cards) or "… returns it to its owner's hand" (Summon: Valefor).
       */
      to?: "exile" | "hand";
      /** Half the matching permanents, rounded down (Zodiark). */
      half?: boolean;
      /** "… with the greatest power among …" (Consumed by Greed). */
      greatestPower?: boolean;
    }
  /**
   * Paying a cost during a resolution (PLAN-S, PLAN-M M4: the "pay" family, `ops/pay.ts`), by shape:
   * - `unless`: "… unless [`who`] pays [cost]" (ward, counterspells, cumulative upkeep): if they pay, the next `skip`
   *   effects are skipped; `or`: another cost of their choice (Lim-Dûl's Hex: "{B} or {3}"; Titania's ward: "discard a
   *   card or pay {2}"); `x`: {1} more per point ("{1} for each…", Swallowed by Leviathan); `times`: the cost paid that
   *   many times (cumulative upkeep, 702.24a); `store`: 1 if paid ("if they do", Divert Disaster); `cost.tapToPay`:
   *   the mana is a waterbend cost;
   * - `manaOf`: "you may pay [this card]'s mana cost" (automatic payment); `store`: 1 if paid;
   * - `totalManaValue`: exile `cost.exile` permanents you control with total mana value N or greater, the cheapest
   *   first (Fabrication Foundry); `store`: 1 if done;
   * - `cost.collectEvidence`: "you may collect evidence N. If you do, …" (701.59); `"X"`: X is `x` (an amount) or
   *   chosen (`x.chosen`), stored in `store`; `exclude`: cards that don't count (Lamplight Phoenix);
   * - `x.chosen`: choose X, then pay {X} (`cost.mana`) or X life (`cost.payLife`, Necrodominance), stored in `store`;
   *   `who`: that player pays (Plague of Vermin); `x.max`: "pay {1} up to three times" (Hawkeye);
   * - `cost.forage`: "you may forage. If you do, …" (701.61);
   * - `cost.behold`: "you may behold [filter]. If you do, …";
   * - `cost.mana`, `cost.payLife`: "you may pay [mana and/or life]. If you do, …";
   * - an empty cost: "you may …" (`fx.may`), asked to `who` ("[that player] may", the controller by default); `store`:
   *   the answer (1 = yes). Its question key stays `may` (answers kept by "always answer this way").
   * The "you may" forms skip the next `skip` effects when the player declines or can't pay.
   */
  | {
      op: "pay";
      cost: PayCost;
      or?: PayCost;
      who?: Ref;
      unless?: true;
      skip: number;
      prompt?: string;
      x?: Amount | { chosen: true; max?: Amount };
      times?: Amount;
      manaOf?: Ref;
      exclude?: Ref;
      totalManaValue?: Amount;
      store?: string;
    }
  /** "Choose" (608.2d): the player chooses an option during the resolution; `store` receives its rank (1, 2…). */
  /** `who`: that player chooses (Expropriate: each player votes), the controller by default. */
  | { op: "chooseOption"; prompt: string; labels: string[]; store: string; who?: Ref }
  /**
   * Replacement on objects until end of turn: "if this creature would die this turn, exile it instead"; "prevent all
   * combat damage that would be dealt to it this turn".
   */
  | { op: "objectReplacement"; kind: "exileIfDies" | "preventCombatDamage" | "preventDamage"; what: Ref }
  /** Doubles the number of +1/+1 counters. */
  /** Doubles the +1/+1 counters (or, `all`, each kind of counter) on the designated permanents. */
  | { op: "doubleCounters"; what: Ref; all?: boolean }
  | { op: "tap"; what: Ref; untap?: boolean }
  /**
   * The controller looks at the designated cards (Gitaxian Probe: a hand; Mishra's Bauble: a library's top card);
   * `random`: that many of them, at random (Urza's Bauble).
   */
  /** `reveal`: shown to all players ("reveal the top card of your library", "they reveal their hand"). */
  | { op: "look"; what: Ref; random?: number; reveal?: boolean }
  /** Soulbond (702.95): pairs the two designated creatures, if both are unpaired creatures the controller controls. */
  | { op: "pair"; what: Ref; with: Ref }
  /** Removes the designated creatures from combat (506.4: Reconnaissance). */
  | { op: "removeFromCombat"; what: Ref }
  /** Damage to each creature matching the filter (and possibly to players). */
  | { op: "damageAll"; amount: Amount; filter?: ObjectFilter; players?: Ref; source?: Ref }
  /** Blight N (ECL): each designated player puts N −1/−1 counters on a creature they control, of their choice; `store`: 1 if done. */
  | { op: "blight"; who: Ref; amount: Amount; store?: string }
  /** Sacrifice a specific object (temporary token, "sacrifice it"). */
  | { op: "sacrificeIt"; what: Ref }
  /** Moves an object (return to hand, exile, return from the graveyard to the battlefield…). */
  /** `attachTo`: an Aura or an Equipment that enters attached to the designated object, if it can be (One Last Job). */
  | { op: "moveTo"; what: Ref; spec: MoveSpec; store?: { name: string; filter?: ObjectFilter }; attachTo?: Ref }
  /** Moves all the objects of a zone matching the filter. */
  | {
      op: "moveAll";
      from: "battlefield" | "graveyard" | "hand";
      whose: Ref;
      filter: ObjectFilter;
      spec: MoveSpec;
      store?: string;
    }
  /** If the condition is false, the next `skip` effects are skipped. */
  | { op: "if"; cond: Condition; skip: number }
  /**
   * Look at the top N cards: take up to `count` matching the filter (to `to`), the rest goes to the bottom (random
   * order) or to the graveyard; `top`: it stays on top, in the same order; `reorder`: it is put back on top in the
   * order chosen by the one looking ("then put them back in any order": Ponder, Portent, Sensei's Divining Top; with
   * `count: 0`, nothing is taken).
   */
  | {
      op: "lookAtTop";
      n: Amount;
      /** The library looked at: that player's (Black Cat: a target opponent), yours by default. */
      who?: Ref;
      /** The cards taken are picked at random among those that match (Getaway Barrel). */
      random?: boolean;
      filter?: ObjectFilter;
      count: Amount;
      to: MoveSpec;
      /** `bottomAnyOrder`: "the rest on the bottom of your library in any order" (read from the text): the player orders
       * them; `bottom`: in a random order. */
      rest: "bottom" | "bottomAnyOrder" | "graveyard" | "top" | "reorder" | "hand";
      /** Maximum mana value of the cards taken (evaluated on resolution). */
      maxManaValue?: Amount;
      /** Total mana value of the cards taken at most N (Michelangelo's Technique). */
      maxTotalManaValue?: number;
      /** Remembers the number of cards taken ("if you didn't put a card into your hand this way"). */
      store?: string;
      /** Exactly `count` cards ("put one of them into your hand"), not "up to". */
      exact?: boolean;
      /** At most one card per card type (Atraxa, Grand Unifier); a list: only those types count ("a creature card and/or
       * a land card": Ojer Kaslem, In the Presence of Ages). */
      onePerType?: boolean | CardType[];
      /** The cards taken have different powers ("creature and/or Vehicle cards with different powers": Rip, Spawn Hunter). */
      distinctPower?: boolean;
      /**
       * Who chooses the cards and orders the rest: the controller (by default; Portent: another player's library), or
       * the library's owner (`owner`: "each player looks at … and may reveal", Explore the Vastlands).
       */
      chooser?: "owner";
      /** "You may reveal [a card] from among them and put it into your hand": the chosen cards are shown to all players
       * (read from the text, `scryfall.ts`); `all`: "reveal the top N cards" (all of them, before the choice: Ojer
       * Kaslem, Portent of Calamity). */
      reveal?: boolean | "all";
    }
  /**
   * Search one's library for up to `count` cards matching the filter, then shuffle. Without `to`, the found cards stay
   * in the library, remembered under `store`, and the library isn't shuffled (the effects that follow use them, then
   * shuffle: Sphinx Ambassador).
   */
  | {
      op: "search";
      filter: ObjectFilter;
      /** With `who`, read from the point of view of the searching player (Winds of Abandon: as many as their exiled creatures). */
      count: Amount;
      /**
       * Without `to`, the found cards are held (PLAN-M M10a): they stay where they are (revealed with `reveal`),
       * remembered under `store`, unshuffled; the effects that follow route them, then shuffle ("put it onto the
       * battlefield if it's a land, otherwise into your hand, then shuffle": Archdruid's Charm).
       */
      to?: MoveSpec;
      who?: Ref;
      /** "Search that player's library" (Sphinx Ambassador): the controller searches the designated player's library. */
      library?: Ref;
      store?: string;
      /** "… basic land cards with different names" */
      distinctNames?: boolean;
      /** Exact mana value (Repurposing Bay: 1 + that of the sacrificed artifact). */
      manaValue?: Amount;
      /** Mana value at most this amount (Grim Servant: your devotion to black). */
      maxManaValue?: Amount;
      /** "… reveal it": the found cards are shown to all players (read from the text, `scryfall.ts`). */
      reveal?: boolean;
      /**
       * "Search your library and/or graveyard" (Vision Quest, Delivery Moogle…), "your graveyard, hand, and/or library"
       * (Say Its Name, Agency Outfitter): the matching cards of these zones are offered with the library's, in one
       * choice; the library counts as searched (event, shuffle) when nothing is found or a card comes from it.
       */
      alsoFrom?: ("graveyard" | "hand")[];
      /**
       * One filter per card ("a basic land card and a Shrine card": Aang's Journey; "a card named Magnifying Glass
       * and/or a card named Thinking Cap": Agency Outfitter): up to one card for each filter (`count` ignored), each
       * card found taken for a different filter.
       */
      each?: ObjectFilter[];
    }
  | { op: "shuffle"; who: Ref }
  /** Exchanges control of two permanents (Trade the Helm). */
  | { op: "exchangeControl"; a: Ref; b: Ref }
  /** Base P/T of each matching permanent equal to the amount, until end of turn (Sita Varma). */
  | { op: "setBasePTAll"; filter: ObjectFilter; amount: Amount; powerOnly?: boolean }
  /**
   * The card is exiled to be cast on a later turn (`GameObject.exiledVia`): plotted (702.170, the card or spell, face up;
   * the plot special action and effects) or foretold (702.143a, from the hand, face down; the foretell special action).
   */
  | { op: "exileToCast"; what: Ref; kind: "plot" | "foretell" }
  /** Tarnation Vista: one mana of each color among the matching permanents. */
  | { op: "addManaColorsAmong"; filter: ObjectFilter; linked?: boolean }
  /** Each player may shuffle their hand and graveyard into their library, then draws N cards (Step Between Worlds). */
  | { op: "mayShuffleHandGraveyardDraw"; n: number }
  /** 705: coin flip; `store` is 1 if the controller wins. */
  /** Flips a coin (1 if won, 0 otherwise) or, with `sides`, rolls an N-sided die (706, result from 1 to N); stored. */
  /**
   * `each`: a coin for each designated object (Rakdos, the Showstopper); the objects whose coin comes up tails are stored
   * (`ref.stored(store)`).
   */
  | { op: "coinFlip"; store: string; sides?: number; each?: Ref }
  /** Another Round: choose permanents you control, exile them and return them, N times. */
  | { op: "flickerChosen"; filter: ObjectFilter; times: Amount }
  /** Choose a card name (without seeing any hidden card), remembered for `exileNamed` (Ancient Vendetta). */
  | { op: "chooseCardName" }
  /** Exiles up to N cards with the chosen name from the player's graveyard, hand and library; they shuffle. */
  | { op: "exileNamed"; who: Ref; max: number }
  /** Token copy of an object (copiable values), with possible modifications. */
  | {
      op: "copyToken";
      of: Ref;
      count?: Amount;
      addKeywords?: Keyword[];
      /** "… except it's a Nightmare in addition to its other types" */
      addSubtypes?: string[];
      /** Fate of the copies: see `CopyFate`. */
      atEnd?: CopyFate;
      /** "… except it's legendary" (Adagia, Windswept Bastion); "… except it isn't legendary" (Yenna). */
      legendary?: boolean;
      nonlegendary?: boolean;
      /** Remembers the created tokens. */
      store?: string;
      /** Abilities added to the copy (Face Yourself). */
      addAbilities?: AbilityDef[];
      /** Tapped copy (Kambal). */
      tapped?: boolean;
      /**
       * Tapped and attacking (Calamity, Galloping Inferno): its controller chooses what it attacks (508.4); a reference:
       * attacking that player (Echoing Assault: "attacking that player").
       */
      attacking?: boolean | Ref;
      /**
       * Myriad (702.116), Shredder: a tapped and attacking copy for each of the designated players, attacking that
       * player (or one of their designated planeswalkers, at your choice: `ref.withPlaneswalkers`); `count` is ignored.
       * `optional`: "you may" (myriad), asked player by player; the copies are exiled (myriad) or sacrificed
       * (Shredder) at end of combat (`atEnd`).
       */
      attackEach?: Ref;
      optional?: boolean;
      /**
       * Base P/T set (Nexus of Becoming: 3/3), or amounts evaluated on resolution (Saw in Half: half the power and
       * toughness of the destroyed creature, rounded up).
       */
      pt?: number | { power: Amount; toughness: Amount };
      /** "… except its equip abilities cost {N} less" (Firion). */
      equipDiscount?: number;
      /** "… except it's a black Demon" (Ardyn, the Usurper): colors and subtypes replaced. */
      setColors?: Color[];
      /** "… in addition to its other colors" (The Jolly Balloon Man). */
      addColors?: Color[];
      setSubtypes?: string[];
      /** "… except it's an artifact in addition" (Molten Duplication, Vaultborn Tyrant). */
      addTypes?: CardType[];
      /** The players who each create the tokens (Fractured Identity), the controller by default. */
      for?: Ref;
    }
  /** Delayed triggered ability: "at the beginning of the next end step, …". References are frozen now. */
  /**
   * `on` and `watch` (with `at: "thisTurn"`): "when [this object] … this turn" (603.7c), on an event that concerns one
   * of the objects designated now; `targets`: its targets, chosen when it triggers; `label`: its label.
   */
  | {
      op: "delayed";
      at: DelayedTiming;
      effects: Effect[];
      bind?: Record<string, Ref>;
      vars?: Record<string, Amount>;
      on?: TriggerSpec;
      watch?: Ref;
      targets?: TargetSpec[];
      label?: string;
      /** `thisTurn`: lasts until the end of the watched player's next turn instead (Nuka-Nuke Launcher). */
      until?: "theirNextTurn";
    }
  /** Reflexive triggered ability ("when you do, …"): its targets are chosen when it is put on the stack. */
  /** `bind`: objects frozen now, read again as targets by the reflexive ability ("this creature"). */
  /** `keepVars`: stored values passed to the reflexive ability ("pay {X}. When you do, … X …"). */
  | {
      op: "reflexive";
      targets: TargetSpec[];
      effects: Effect[];
      bind?: Record<string, Ref>;
      keepVars?: string[];
      /** Values frozen on creation ("the greatest mana value among the discarded cards", Ill-Timed Explosion). */
      vars?: Record<string, Amount>;
      /** "When you do, choose one —": modes chosen when it is put on the stack (Hylda). */
      modes?: ModeDef[];
    }
  /** Counters a spell or ability on the stack (701.5). */
  /** `store`: number of spells and abilities countered. */
  /** `exile`: exiled instead of put into the graveyard, all of them or the spells matching a filter (Thranduil's
   * Decree: permanent spells); `storeMoved`: the countered cards, where they went (Desertion). */
  | { op: "counter"; what: Ref; exile?: boolean | ObjectFilter; store?: string; storeMoved?: string }
  /**
   * "As this enters, choose a creature type / a color / a name / a mode…" (614.12, in `CardDef.asEnters`), or the same
   * choice made by a triggered ability or a spell (Petrified Hamlet, Harmonized Crescendo).
   * `options`: the only possible choices (A Killer Among Us: Human, Merfolk or Goblin; Thriving Grove: a color other
   * than green; Sieges: Abzan or Mardu); `secret`: hidden from opponents.
   */
  | {
      op: "chooseOnEnter";
      /** `player`: a player in the game (Saskia the Unyielding), read with `ref.chosenPlayer`. */
      /** `manaType`: a type of mana (107.4), read by `manaAbility(…, { produceChosen })`. */
      kind:
        | "creatureType"
        | "color"
        | "cardName"
        | "landName"
        | "landType"
        | "parity"
        | "mode"
        | "number"
        | "player"
        | "manaType";
      options?: string[];
      /** Name chosen among the designated cards (Koh, the Face Stealer: a card exiled with it). */
      optionsFrom?: Ref;
      secret?: boolean;
      /** Another player makes the choice for the source (Sphinx Ambassador: "that player chooses a card name"). */
      who?: Ref;
      /** `player` as it enters: it enters under the control of the chosen player (Xantcha, Sleeper Agent). */
      control?: boolean;
      /**
       * `manaType`: among the types of mana spent to pay the ability's cost, noted without a question when there is
       * only one (Jeweled Amulet: "note the type of mana spent to pay this activation cost"); none spent: nothing.
       */
      fromCost?: boolean;
    }
  /**
   * Devour N (702.82, in `CardDef.asEnters`): sacrifice permanents as it enters; N +1/+1 counters per sacrificed
   * permanent. `graveyardUpToX`: "exile up to X cards from your graveyard" instead (Mimeoplasm, linked cards).
   */
  | { op: "devour"; filter: ObjectFilter; n: number; graveyardUpToX?: boolean }
  /**
   * "As [this] enters, you may exchange its text box and another creature's" (Deadpool, Trading Card; in `asEnters`):
   * the chosen creature is stored (`$textSwap`), and the exchange is done as it enters (layer 3, `LayerMods.textOf`).
   */
  | { op: "exchangeTextBox" }
  /**
   * "You may have [this permanent] enter as a copy of …" (707.9, in `CardDef.asEnters`): the model is chosen as it
   * enters. `anyController`: any permanent (Mockingbird), otherwise one of yours; `fromGraveyards`: a card from a
   * graveyard (Superior Spider-Man, Echoing Deeps); `optional`: "you may" (otherwise the copy is mandatory if there is a
   * model); `duration`: "until end of turn" (Cursed Mirror); `except`: exceptions to the copy (707.9b, copiable: name,
   * P/T, types, abilities); if it copies: `counters`, it enters with these counters (Altered Ego: X +1/+1 counters);
   * `tapped`, it enters tapped (Echoing Deeps); `exile`, "when you do, exile this card" (reflexive ability, 603.12).
   */
  | {
      op: "chooseCopy";
      filter: ObjectFilter;
      anyController?: boolean;
      fromGraveyards?: boolean;
      optional?: boolean;
      duration?: "endOfTurn";
      except?: LayerMods;
      counters?: { kind: string; n: Amount };
      tapped?: boolean;
      exile?: boolean;
    }
  /** Reveals cards until N matching cards; those go according to `to`, the rest to the bottom at random. */
  /**
   * Reveals cards until N matching cards; they go to `to`, the rest to the bottom in a random order. Without `to`:
   * nothing moves, the matching cards are remembered (`store`, Sanar).
   */
  /** `who`: the revealed library (yours by default; Jhoira: a target opponent); `rest: "graveyard"`: the other revealed
   * cards go to the graveyard (Consuming Aberration: "then puts those cards into their graveyard"); `anyNumber`: "put any
   * number of those cards …" (Aurora Awakener), chosen by the controller, the others join the rest. */
  | {
      op: "revealUntilN";
      filter: ObjectFilter;
      n: Amount;
      to?: MoveSpec;
      store?: string;
      who?: Ref;
      rest?: "graveyard";
      anyNumber?: boolean;
    }
  /** The controller separates the top N cards into two piles, an opponent chooses one (to the hand), the other to the graveyard. */
  /** `revealed`: two revealed piles (Intrude on the Mind); `storeGraveyard`: number of cards put into the graveyard. */
  /** `opponentSeparates`: an opponent separates the revealed cards, the controller chooses their pile (Fact or Fiction). */
  | { op: "piles"; n: number; revealed?: boolean; storeGraveyard?: string; opponentSeparates?: boolean }
  /** "End the turn" (723). */
  | { op: "endTurn" }
  /** The effect's controller gains control of the object until end of turn. */
  /** `untilEndOfYourNextTurn`: until the end of your next turn (Evil's Thrall), otherwise until end of turn. */
  /**
   * The effect's controller (or the player `to`) gains control of the objects: until end of turn (by default), of your
   * next turn (Evil's Thrall), for as long as you control the source (Possession Engine) or indefinitely (Harmless
   * Offering).
   */
  | {
      op: "gainControl";
      what: Ref;
      /**
       * The player who gains control (by default, the effect's controller); `owner`: each object comes under the
       * control of its owner (Alicia Masters: "each player gains control of all creatures they own").
       */
      to?: Ref | "owner";
      /**
       * `whileSource`: "for as long as [the source] remains on the battlefield", whoever controls it; `whileAttached`:
       * "for as long as [`attachment`] is attached to it" (Eriette).
       */
      duration?: "endOfTurn" | "endOfYourNextTurn" | "whileYouControlSource" | "whileSource" | "whileAttached" | "permanent";
      attachment?: Ref;
    }
  /**
   * Additional phase, step or turn (`amount` times, 500.8 to 500.10): `upkeep`, a beginning phase reduced to its
   * upkeep after this phase (Obeka), or an upkeep step after this one (`after: "step"`, Paradox Haze); `combat`, a
   * combat phase after this phase (Aurelia), only during a main phase with `after: "main"` (Full Throttle);
   * `combatAfterMain`, a combat followed by a main phase after this main phase; `endStep`, an end step after this one;
   * `turn`.
   */
  | {
      op: "extra";
      /** `beginning`: a whole beginning phase, untap, upkeep and draw (Sphinx of the Second Sun). */
      kind: "upkeep" | "beginning" | "combat" | "combatAfterMain" | "endStep" | "turn";
      amount?: Amount;
      after?: "step" | "main";
    }
  /**
   * What becomes of the designated spell (on the stack), or of the one resolving, after its resolution: exiled (with a
   * `counter` counter, Goliath Daydreamer), plotted (Lilah), with rebound (702.88), or put onto the battlefield
   * transformed with a finality counter (Esper Origins).
   */
  /**
   * `bottom`: the resolving spell goes to the bottom of its owner's library (Ultimate Nullification); `shuffle`: it is
   * shuffled into it (Green Sun's Zenith).
   */
  | {
      op: "spellFate";
      fate: "exile" | "plot" | "rebound" | "battlefieldTransformed" | "bottom" | "shuffle";
      what?: Ref;
      counter?: string;
    }
  /** Copies of a spell on the stack (same targets). */
  /**
   * `haste`, `atEnd: "sacrifice"`: the copy of a creature spell has haste and is sacrificed at the beginning of the
   * next end step (same option as `copyToken`).
   */
  /** `loyalty`: the copy (a planeswalker) has this starting loyalty (Ob Nixilis, the Adversary's casualty X). */
  | {
      op: "copySpell";
      what: Ref;
      count: Amount;
      /** The player who copies it (and controls the copy), instead of the controller (Chain of Vapor). */
      for?: Ref;
      haste?: boolean;
      atEnd?: "sacrifice";
      nonlegendary?: boolean;
      loyalty?: Amount;
    }
  /** Exiles the top N cards of the library of each designated player (remembered under `store`). */
  /** `allBut`: all the cards except the bottom N (Doomsday Excruciator, Jace, Reality Sculptor). */
  | { op: "exileTop"; who: Ref; n?: Amount; allBut?: Amount; store?: string; faceDown?: MoveSpec["faceDown"] }
  /** Lets the controller play these exiled cards this turn. `spellsOnly`: cast only, without timing, for free. */
  /**
   * `condition`: only as long as it is met;
   * `for`: who can play it instead of the effect's controller (see that field), `extraCost` and `tapped`.
   */
  | {
      op: "grantPlay";
      what: Ref;
      /**
       * Absent: until end of turn. `untilYourNextTurn`: "until the end of your next turn", with `for: "owner"`: "until
       * your next turn" (Memory Vessel); `untilOwnersNextTurn`, with `for: "owner"`: "until the end of their next turn"
       * (Suspend Aggression); `untilYourNextEndStep`: "until your next end step" (Shadow Urchin); `forever`: no limit
       * ("for as long as it remains exiled", Emrakul).
       */
      duration?: "untilYourNextTurn" | "untilOwnersNextTurn" | "untilYourNextEndStep" | "forever";
      free?: boolean;
      anyTime?: boolean;
      /** "… until you exile another card with this creature": the source's previous permissions end (Superior Foes
       * of Spider-Man). */
      replacePrevious?: boolean;
      /** "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost" (Inside Information). */
      payLifeManaValue?: boolean;
      condition?: Condition;
      /**
       * Who can play the card, instead of the effect's controller: `owner`, its owner (Lightstall Inquisitor);
       * `nonOwners`, each player other than its owner (Ian Malcolm, Chaotician).
       */
      for?: "owner" | "nonOwners";
      /** {N} more (with `for: "owner"`). */
      extraCost?: number;
      /** A land played this way enters tapped (with `for: "owner"`, Lightstall Inquisitor). */
      tapped?: boolean;
      /** Mana of any type can be spent (Tinybones, Laughing Jasper Flint). */
      anyMana?: boolean;
      /** The spell is exiled (`exile`, Quistis Trepe) or put on the bottom of the library (`bottom`) instead of going to the graveyard. */
      after?: "exile" | "bottom";
      /** Only one of the designated cards can be cast (Buster Sword). */
      oneOf?: boolean;
      /** Granted flashback (or harmonize, 702.180): the card is exiled as it leaves the stack. */
      flashback?: true | "harmonize";
      /**
       * "You may cast [it]": not played as a land (Dream Harvest, Ragavan; nor a land back face); `adventure`: only as an
       * Adventure (Mosswood Dreadknight: "you may cast it from your graveyard as an Adventure").
       */
      castOnly?: true | "adventure";
    }
  /** Exiles the top cards until a matching card (remembered): Territorial Bruntar. */
  /**
   * Exiles from the top until a matching card (only that one is remembered); `untilTotalManaValue`: in the library of
   * each designated player (`who`), until a total mana value of N or more, all remembered (Dream Harvest).
   */
  /** `storeAll`: remembers every exiled card (Dazzling Sphinx: "the exiled cards that weren't cast"). */
  | { op: "exileUntil"; filter: ObjectFilter; store: string; who?: Ref; untilTotalManaValue?: number; storeAll?: string }
  /**
   * Speed (702.179) of each player of `who` (default: the controller) changed by `by`: "increase your speed by 1" (at
   * most 4), the inherent ability of speed (`rulesTrigger`); a decrease only for a player whose speed is greater than
   * each other player's, never below 1 (Spikeshell Harrier).
   */
  | { op: "speed"; who?: Ref; by: number }
  /**
   * Radiation (Fallout, `rulesTrigger`): the controller mills as many cards as they have rad counters; for each nonland
   * card milled, they lose 1 life (they gain it with Strong, the Brutish Thespian) and remove a counter.
   */
  | { op: "radiation" }
  /** "You control [target player] during their next turn" (The Dominion Bracelet). */
  /** `combatOnly`: only during that player's next combat phase. */
  /** The designated player (you by default) becomes the monarch (724). */
  | { op: "becomeMonarch"; who?: Ref }
  /**
   * Each designated player secretly chooses a number (from 0 to `max`), in APNAP order, without seeing the others';
   * stored under `store`, read by `ref.numberChoosers` and `amount.numberChosen` (Wheel of Misfortune). `prompt`: the
   * question ("choose a number", not secret: Expel the Interlopers); `suggested`: the suggested number (0 by default).
   */
  | { op: "chooseNumbers"; who: Ref; store: string; max: number; prompt?: string; suggested?: Amount }
  /** `thenExtraTurn`: after that turn, that player takes an extra turn (Emrakul, the Promised End). */
  | { op: "controlNextTurn"; who: Ref; combatOnly?: boolean; thenExtraTurn?: boolean }
  /** "Your life total becomes N" (The Endstone). */
  /**
   * The designated players have `amount` life, or (`exchange`) exchange their life totals with that player; each player
   * gains or loses the difference (701.12b, 118.5). `store`: the life lost by the controller.
   */
  | { op: "setLife"; who: Ref; amount?: Amount; exchange?: Ref; store?: string }
  /** Each designated player exiles a card from their hand (of their choice), remembered (Lightstall Inquisitor). */
  | { op: "exileFromOwnHand"; who: Ref; store: string }
  /** Copies the designated cards and allows casting some of them for free, for a limited total mana value (Uldaros). */
  /**
   * Copies of the designated cards, cast during the resolution (limited total mana value); `paid`: by paying their
   * cost (Kaervek); `storeCast`: number of copies cast.
   */
  /** `maxCount`: at most N copies cast (Baron Helmut Zemo: "up to three"). */
  | { op: "castCopiesFree"; what: Ref[]; maxTotalManaValue: number; paid?: boolean; storeCast?: string; maxCount?: number }
  /**
   * Internal: the "as it enters" choices of the resolving permanent spell (`CardDef.asEnters`, riot 702.136, those of
   * a copy's model), added by `specsAndEffects`; the `asEntersChoices` loop (`replacement.ts`).
   */
  | { op: "asEnters" }
  /** Two players exchange their life totals (701.12b: each gains or loses the difference); `store`: the life lost
   * this way by the controller (Mister Negative: "draw that many cards"). */
  /** "Do this only once each turn": the resolving triggered ability no longer triggers this turn. */
  | { op: "doneOncePerTurn" }
  /**
   * Transforms the designated double-faced permanents (712.10: front ↔ back); `may`: "you may transform it", asked for
   * each double-faced one (Nick Fury, Agent of S.H.I.E.L.D.).
   */
  | { op: "transform"; what: Ref; may?: boolean }
  /** "Exile them, then meld them into [card]": the source and a permanent with the given name (701.42). */
  | { op: "meld"; with: string }
  /** The designated creatures explore (701.44), `times` times. */
  | { op: "explore"; what: Ref; times?: Amount }
  /**
   * Discover N (701.57): exile from the top until a nonland card with mana value N or less, cast it without paying its
   * mana cost or put it into the hand; the rest to the bottom in a random order.
   * `who`: the player who discovers (you by default); `store`: the discovered card.
   */
  /**
   * Discover N (701.57); `cascade` (702.85): a nonland card with mana value strictly less than N, and the one not cast
   * goes to the bottom with the others (instead of the hand).
   */
  /** `filter`: the card found must also match it (Jodah, the Unifier: a legendary card). */
  /**
   * `exileFirst`: spells exiled before the search, which go to the bottom with the other exiled cards (Possibility
   * Storm: "that player exiles it, then exiles cards …"); `filter` is resolved while they are still on the stack.
   */
  | { op: "discover"; n: Amount; who?: Ref; store?: string; cascade?: boolean; filter?: ObjectFilter; exileFirst?: Ref }
  /**
   * 608.2g: "you may cast [these cards]" during the resolution. The player casts one of the cards right away (then
   * another one if `many`), or declines. `free`: without paying their mana cost; `after`: exiled (`exile`) or put on
   * the bottom of the library (`bottom`, Kylox's Voltstrider) instead of going to the graveyard. `storeCast` / `storeRest`: cards cast / left in their zone, for the next effects.
   */
  | {
      op: "castNow";
      what: Ref;
      free?: boolean;
      many?: boolean;
      after?: "exile" | "bottom";
      /** `after` only for the matching spells (Bilbo, Thief in the Night: "if an instant or sorcery spell cast this way"). */
      afterFilter?: ObjectFilter;
      anyMana?: boolean;
      storeCast?: string;
      storeRest?: string;
      /** Only the cards with mana value at most this amount (Kotis). */
      maxManaValue?: Amount;
      /** Cast for this cost rather than its mana cost (miracle: Lorehold, the Historian). */
      cost?: ManaCost;
      /** A creature spell cast this way gains haste (suspend, 702.62a). */
      haste?: boolean;
    }
  /** Craft: "return this card transformed under its owner's control"; the materials are linked to it. */
  | { op: "craftReturn" }
  /**
   * Tishana's Tidebinder: counter the ability; if it's an ability of an artifact, creature or planeswalker, that
   * permanent loses all abilities for as long as the source of the effect remains on the battlefield.
   */
  | { op: "counterAbilitySilence"; what: Ref }
  /** Sovereign Okinec Ahau: as many +1/+1 counters as the difference between its power and its base power. */
  | { op: "countersAboveBase"; filter: ObjectFilter }
  /** The designated creatures connive (701.50): their controller draws, discards; nonland: +1/+1 counter. */
  /** `n`: "connives X" (701.50e: draw X, discard X, a +1/+1 counter per nonland card discarded). */
  | { op: "connive"; what: Ref; n?: Amount }
  /** The source Mount becomes saddled until end of turn (702.171a). */
  /** The source (or the designated permanent) becomes saddled until end of turn. */
  | { op: "saddle"; what?: Ref }
  /** Manifest dread (701.62): look at the top two cards, manifest one, the other to the graveyard. */
  /** Manifest dread (701.62): `who` manifests (you by default), `times` times; `store` remembers the face-down creatures. */
  | { op: "manifestDread"; who?: Ref; times?: Amount; store?: string }
  /** Turns the designated permanents face up (without paying any cost). */
  /** `orExileCast`: "if you can't, exile it, then you may cast the exiled card without paying" (Etrata). */
  | { op: "turnFaceUp"; what: Ref; orExileCast?: boolean; store?: string }
  /** Station (702.184a): charge counters equal to the power of the creature tapped for the cost. */
  | { op: "station" }
  /** The source Class goes to level N (716.2a). */
  | { op: "setClassLevel"; level: number }
  /** The source Case becomes solved (719.2). */
  | { op: "solveCase" }
  /**
   * Monstrosity N (701.37): if the source permanent isn't monstrous, N +1/+1 counters on it and it becomes monstrous
   * (`GameObject.monstrous`, event `monstrous`); otherwise nothing.
   */
  | { op: "monstrosity"; amount: Amount }
  /** Unlocks door N of a Room (709.5e). */
  | { op: "unlockDoor"; what: Ref; door: number }
  /**
   * Room: "unlock a locked door" (`unlock`) or "lock or unlock a door" (`toggle`) of one of the designated Rooms; the
   * player chooses the door if there are several.
   */
  | { op: "door"; what: Ref; mode: "unlock" | "toggle" }
  /** "[This permanent] becomes a copy of [target] until end of turn" (layer 1). */
  /**
   * Becomes a copy of a permanent, or of a card in another zone (Likeness Looter: from the graveyard). Exceptions:
   * keywords added, the source's abilities kept (`keepAbilities`: their indexes in its definition); `ifManaValue`:
   * nothing if the model's mana value differs. `whileAttached`: "for as long as [`attachment`] remains attached to it"
   * (Assimilation Aegis), like `gainControl`.
   */
  | {
      op: "becomeCopy";
      what: Ref;
      of: Ref;
      duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "whileAttached";
      attachment?: Ref;
      addKeywords?: Keyword[];
      keepAbilities?: number[];
      ifManaValue?: Amount;
      /** Copy exceptions (707.9b): name, types, supertypes, P/T, keywords. */
      except?: LayerMods;
    }
  /** Untaps up to N of the controller's tapped permanents matching the filter (chosen automatically). */
  | { op: "untapUpTo"; filter: ObjectFilter; n: number }
  /** The resolving spell is exiled instead of going to the graveyard ("Exile Finale of Revelation"). */
  /**
   * The resolving spell is exiled instead of going to the graveyard; with `what` and `counter`, the designated spells
   * will be, with that counter (Goliath Daydreamer: "exile this card with a dream counter on it").
   */
  /** Poison counters (122.1f); 10 or more: the player loses. */
  /** Poison counters; `counter: "rad"`: rad counters (Fallout: "target player gets N rad counters"). */
  | { op: "poison"; who: Ref; n: Amount; counter?: "rad" }
  /** +1/+1 counters divided among the targets (at least 1 each). */
  /**
   * Distribute counters (+1/+1 by default, `counter`) among the targets, or on resolution among the designated
   * objects; `anyNumber`: "among any number of" (no minimum per object, Crashing Wave).
   */
  /**
   * `from`: "move any number of [kind] counters from [it] onto [them]" (Forgotten Ancient, Resourceful Defense): the
   * counters of that object, divided among the recipients and itself (its share stays on it); `counter: "any"`: one
   * division for each kind of counter it has. `total` is then ignored.
   */
  | { op: "countersDivided"; total: Amount; to: Ref; counter?: string; anyNumber?: boolean; from?: Ref }
  /**
   * Changes the target of a spell or ability with a single target (Bolt Bend); with several targets, new targets of
   * choice for each word "target", the original ones offered ("you may choose new targets": Commandeer).
   */
  | { op: "changeTarget"; what: Ref }
  /**
   * The mana added doesn't empty until end of turn (Savage Ventmaw), or until end of combat (`untilEndOfCombat`:
   * firebending). `times`: the list is added that many times ("firebending X").
   */
  | { op: "addManaUntilEndOfTurn"; mana: ManaType[]; times?: Amount; untilEndOfCombat?: boolean }
  /** The controller wins the game (Maze's End). */
  | { op: "winGame" }
  | { op: "loseGame"; who?: Ref }
  /** Triple Triad: each player exiles their top card; yours and those with lower mana value are playable for free this turn. */
  | { op: "tripleTriad" }
  /** "Unattach it" (Stolen Uniform, Unexpected Request); `ifAttachedTo`: only if it is attached to that permanent. */
  | { op: "unattach"; what: Ref; ifAttachedTo?: Ref }
  /** The designated spell (on the stack) enters with N additional +1/+1 counters (Torgal). */
  | { op: "spellArrivalCounters"; what: Ref; amount: Amount }
  /**
   * "The next time … this turn" shield (615.7): a single-use replacement on the controller, until end of turn;
   * `chooseSource`: "a source of your choice", chosen on resolution (New Way Forward).
   */
  | { op: "shield"; replacement: EventReplacement; chooseSource?: boolean }
  /** "Each [creature] deals damage equal to its power to [target]" (Bartz and Boko). */
  /** `from`: the designated creatures instead of the filter (Coordinated Clobbering). */
  /** `amount`: each deals that much damage (Case of the Gateway Express: 1), otherwise its power. */
  | { op: "eachDealsDamage"; filter: ObjectFilter; to: Ref; from?: Ref; amount?: Amount }
  /** Hauntwoods Shrieker: reveal the face-down permanent; if it's a creature card, you may turn it face up. */
  | { op: "revealFaceDown"; what: Ref }
  /** Counts the resolutions of this ability this turn, stored under `store` (Venom Connoisseur). */
  | { op: "countResolution"; store: string }
  /** Links cards to the source (Hoarding Dragon). */
  /** `to`: links to this object rather than to the source (an emblem created by the spell). */
  | { op: "link"; what: Ref; to?: Ref }
  /** "That player chooses one of them": `store` the chosen one, `${store}Rest` the others (Trial of Agony). */
  /** `anyNumber`: any number (Expose the Culprit); `anyZone`: also cards off the battlefield (Lazav). */
  /** `prompt`: the text of the question ("Choose the land to return"); by default, "these creatures". */
  /** `optional`: "up to one" (Light of Judgment) or "you may" (Unexpected Request): no choice possible. */
  /** `what` may designate players: "choose an opponent", without targeting them (`fx.chooseOpponent`). */
  /** `random`: a single one, chosen at random (Indoraptor: "choose an opponent at random"). */
  | {
      op: "chooseAmong";
      what: Ref;
      chooser: Ref;
      store: string;
      anyNumber?: boolean;
      /** With `anyNumber`: at most that many ("search your library for three cards": Intuition). */
      max?: number;
      anyZone?: boolean;
      prompt?: string;
      optional?: boolean;
      random?: boolean;
      /**
       * The suggested object: the one with the greatest mana value (Stinging Study: "the mana value of a commander you
       * own"), rather than the greatest toughness.
       */
      suggest?: "manaValue";
    }
  /** Attaches an Aura or an Equipment to a permanent (701.3). */
  /** `store`: number of objects actually attached (701.3b: an object already attached doesn't "become" attached; Thorin). */
  /** `random`: to one of the designated objects or players, chosen at random (Maddening Hex: "another one of your opponents"). */
  | { op: "attach"; what: Ref; to: Ref; store?: string; random?: boolean }
  /** Adds mana to the controller's mana pool. */
  /** `times`: each mana is added that many times ("{G} for each counter"). */
  /** `who`: the player who gets the mana (Cheering Crowd: the active player), the controller by default. */
  /** `rider`: the effect tied to the mana when it is spent to cast a matching spell (Arena of Glory: haste). */
  | { op: "addMana"; mana: ManaType[]; times?: Amount; who?: Ref; rider?: ManaAbilityDef["rider"] }
  /** Each player may discard their hand and draw seven cards (Arc of Fortune). */
  | { op: "mayWheel" }
  /** The designated player reveals their hand; the controller chooses a matching card from it, exiled and linked to the source. */
  /** `reveal`: the player reveals only that many cards from their hand, of their choice (Taster of Wares). */
  /** `optional`: "you may choose a card" (Severance Priest). */
  | { op: "exileFromHandLinked"; who: Ref; filter: ObjectFilter; untilLeaves?: boolean; reveal?: Amount; optional?: boolean }
  /** Adds N mana of a color chosen by the controller (`colors`: among these colors only, TDM Devotees). */
  /** `restriction`: restricted mana, kept apart in the pool (Ashling, Rimebound). */
  /** `keep`: the mana doesn't empty between the steps and phases of this turn (Branch of Vitu-Ghazi). */
  /** `combination`: "N mana in any combination of these colors" (distributed by the player). */
  | { op: "addManaChoice"; n: Amount; colors?: ManaType[]; restriction?: ManaRestriction; keep?: boolean; combination?: boolean }
  /** Exiles the top N cards; the controller chooses one of them they may play this turn. */
  | { op: "impulse"; n: number; until?: "thisTurn" | "yourNextTurn" | "yourNextEndStep" }
  /** Damage divided as the controller chooses among the targets (at least 1 each). */
  | { op: "damageDivided"; total: Amount; to: Ref }
  /**
   * "Keep the chosen permanents": for each designated player (`who`), in APNAP order, permanents they control are
   * chosen, by them (`chooser: "each"`) or by the effect's controller (`"you"`); then all their other permanents of
   * the filter (`filter`) meet their fate (`fate`), those of all players at the same time.
   * `pick`: `"one"` (a single one), `"onePerType"` (one of each permanent type: Liliana, Dreadhorde General, Tragic
   * Arrogance), `"totalPower"` (any number, with total power `max` or less: Destined Confrontation), `"sharesType"`
   * (a single one; those that share a creature type with it are kept too: Winnowing).
   * `among`: the permanents that can be chosen, if they differ from the filter (Unstable Glyphbridge: with power 2 or
   * less; Tragic Arrogance: an artifact, a creature, an enchantment and a planeswalker, lands included); its types also
   * bound those of `"onePerType"`.
   */
  | {
      op: "keep";
      who: Ref;
      chooser: "each" | "you";
      pick: "one" | "onePerType" | "totalPower" | "sharesType";
      filter: ObjectFilter;
      fate: "sacrifice" | "destroy";
      among?: ObjectFilter;
      max?: Amount;
    }
  /** The controller gets an emblem (114) with these abilities. */
  | {
      op: "emblem";
      name: string;
      abilities: AbilityDef[];
      text: string;
      /**
       * Temporary emblem: until your next turn, the end of this turn, or the end of your next turn (Season of the
       * Bold).
       */
      duration?: "untilYourNextTurn" | "endOfTurn" | "endOfYourNextTurn";
      /** Remembers the emblem (to link objects to it). */
      store?: string;
    }
  /** Exiles until the source leaves the battlefield (610.3). */
  | { op: "exileUntilLeaves"; what: Ref; toHand?: boolean }
  /** Choose cards (not targeted) in a zone of the controller and move them. */
  | {
      op: "pickFromZone";
      zone: "graveyard" | "hand";
      /** Each designated player chooses in their own zone (Worlds Within Worlds); otherwise the controller. */
      who?: Ref;
      filter: ObjectFilter;
      count: Amount;
      min?: number;
      /** Random choice (Omenpath Journey). */
      random?: boolean;
      to: MoveSpec;
      prompt?: string;
      /** Excludes the objects stored under this name ("another permanent card"). */
      excludeStored?: string;
      /** Mana value at most this amount (Anticausal Vestige: the number of lands). */
      maxManaValue?: Amount;
      /** Remembers the moved objects. */
      store?: string;
      /** Choose among these objects rather than in the zone (cards exiled with the source, stored…). */
      pool?: Ref;
      /**
       * "For each of those colors, a card of that color" (Sanar): at most one card per color among those of the
       * matching permanents (yours).
       */
      onePerColorOf?: ObjectFilter;
      /**
       * Cards pairwise different in this characteristic: `name`, different names (Eerie Ultimatum: "any number of
       * permanent cards with different names").
       */
      distinct?: "name";
    }
  /** The owner puts the object on the top or the bottom of their library. */
  /** `topDamage`: if the owner puts it on top, the source deals N damage to them (Clash of Elements). */
  /** `fromTop`: "Nth from the top" instead of the top (Trickster's Stratagem: second). */
  | { op: "libraryTopOrBottom"; what: Ref; topDamage?: number; fromTop?: number }
  /** Each designated player loses N life unless they discard a card or sacrifice a permanent. */
  /** `damage`: the source deals that damage instead of the life loss (Osseous Sticktwister). */
  /** `times`: repeated N times (Rottenmouth Viper: for each blight counter). */
  | {
      op: "punisher";
      who: Ref;
      loseLife: number;
      discard?: boolean;
      sacrifice?: ObjectFilter;
      damage?: Amount;
      times?: Amount;
    }
  /** Gift (702.174): the chosen opponent gets the promised gift. */
  | { op: "gift"; kind: GiftKind; token?: TokenSpec };

/** What a gift offers: a card, a Food, a tapped Fish, a Treasure. */
/**
 * What a `pay` effect pays: the fields of an ability cost (`CostDef`) a resolution can ask for. `collectEvidence` also
 * takes `"X"` there (the X of the effect, `x`).
 */
export type PayCost = Omit<
  Pick<
    CostDef,
    | "mana"
    | "payLife"
    | "sacrifice"
    | "discard"
    | "discardRandom"
    | "collectEvidence"
    | "tapToPay"
    | "forage"
    | "exile"
    | "behold"
    | "poison"
  >,
  "collectEvidence"
> & { collectEvidence?: number | "X" };

export type GiftKind = "card" | "food" | "fish" | "treasure";

/**
 * Duration of a `modify` effect tied to a state (611.2b): `source`, for as long as the source remains on the
 * battlefield (Kitesail Larcenist); `sourceTapped`, for as long as it remains tapped (Hedge Whisperer);
 * `youControlSource`, for as long as you control it (Ty Lee, Spider-Woman: ends if it leaves or changes controller);
 * `tapped`, for each affected object, for as long as it remains tapped (Braided Net); `{ counter }`, for each affected
 * object, for as long as it has a counter of that kind (Ultima); `{ exiled }`, until the designated card leaves exile
 * (Emrakul).
 */
export type ModifyWhile =
  | "source"
  | "sourceTapped"
  | "youControlSource"
  | "tapped"
  | { counter: string }
  | {
      exiled: Ref;
    }
  /** "For as long as [that player] controls [the source]" (Vislor Turlough: "goaded for as long as they control it"). */
  | { sourceControlledBy: Ref };

/**
 * Fate of token copies (`copyToken`): sacrificed (`sacrifice`) or exiled (`exile`, Stormsplitter) at the beginning of
 * the next end step; with `at`, at end of combat (`endOfCombat`: myriad, Shredder) or at the beginning of the next
 * upkeep (`nextUpkeep`, Firion).
 */
export type CopyFate =
  | "sacrifice"
  | "exile"
  | { fate: "sacrifice" | "exile"; at: "endOfCombat" }
  | { fate: "sacrifice"; at: "nextUpkeep" };

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
