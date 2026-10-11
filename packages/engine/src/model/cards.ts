/** Engine types — Cards, abilities, costs, continuous effects (layers), tokens and moves. Re-exported by `types.ts`. */
import type {
  Amount,
  CardType,
  CastVia,
  Color,
  Condition,
  Effect,
  ExiledFilter,
  GiftKind,
  Keyword,
  ManaCost,
  ManaType,
  ObjectFilter,
  ObjectId,
  PayCost,
  PlayerId,
  Ref,
  TargetSpec,
  TriggerSpec,
} from "../types";

export interface CardDef {
  /** Stable identifier (slug of the name, or "token:..." for tokens). */
  id: string;
  name: string;
  typeLine: string;
  manaCost: ManaCost | null;
  manaCostText: string;
  colors: Color[];
  supertypes: string[];
  types: CardType[];
  subtypes: string[];
  power?: number;
  toughness?: number;
  keywords: Keyword[];
  /** Abilities of permanents (mana, activated). */
  abilities: AbilityDef[];
  /** Effect on resolution of an instant or a sorcery. */
  spell?: SpellDef;
  /** Kicker (702.33) and the optional costs read like one (offspring, gift, Bargain, blight, teamwork…). */
  kicker?: KickerDef;
  /** Planeswalker: starting loyalty (306.5b). */
  loyalty?: number;
  /**
   * Aura: what it can enchant (target of the Aura spell, then legality of the attachment). `graveyard`: "enchant
   * [filter] card in a graveyard" (Animate Dead): the spell targets a card in a graveyard, which returns to the
   * battlefield under the Aura's controller as the Aura enters attached to it (`stack.ts`).
   */
  enchant?: { filter: ObjectFilter; label: string; player?: boolean; graveyard?: boolean };
  /** "If this card is in your opening hand, you may begin the game with it on the battlefield." */
  /**
   * `notStartingPlayer`: only if you're not the starting player; `counter`: it enters with this counter;
   * `exileFromHand`: a card from your hand is then exiled (Gemstone Caverns); `revealFirstUpkeep`: the card is revealed
   * and stays in hand, and these effects happen at the beginning of the first upkeep (the Chancellors: "you may reveal
   * this card from your opening hand. If you do, at the beginning of the first upkeep, …").
   */
  leyline?: boolean | { notStartingPlayer?: boolean; counter?: string; exileFromHand?: boolean; revealFirstUpkeep?: Effect[] };
  /** Ward: cost to pay (mana or life). */
  ward?: {
    mana?: ManaCost;
    life?: number;
    lifePower?: boolean;
    discard?: boolean;
    discardRandom?: boolean;
    sacrifice?: number;
    /** The permanents to sacrifice: nonland (Valgavoth), creatures (Vein Ripper). */
    sacrificeFilter?: ObjectFilter;
    /** "Ward—Collect evidence N" (Axebane Ferox). */
    collectEvidence?: number;
    /** "Ward—Waterbend {N}" (The Unagi of Kyoshi Island): the ward's mana is a waterbend cost. */
    waterbend?: boolean;
    /** "Ward—Get N poison counters" (The Serpent Society). */
    poison?: number;
    /** "Ward—Discard a card or pay [mana]" (Titania): `discard` or this cost (`mana`), as chosen. */
    or?: PayCost;
  };
  /** "As an additional cost to cast this spell, …" (601.2b, 601.2h). */
  additionalCost?: AdditionalCost;
  /**
   * Other ways to cast the card (PLAN-M M5): flashback, from the graveyard, mayhem, madness, warp, plot, foretell, flash
   * for a surcharge, an alternative cost, face down. At most one of each kind, read by kind (`castOption(d, kind)`,
   * `cardDef.ts`), never by position.
   */
  castOptions?: CastOption[];
  /** Rules printed on the card about how it is cast, resolves or behaves (PLAN-M M5), read by `cardRule(d, key)`. */
  rules?: CardRules;
  /** "This spell costs {N} less to cast [if…]" (601.2f). */
  /** "This spell costs {N} less if…"; `colored`: colored symbols removed too (Brush Off: {1}{U}). */
  costReduction?: { generic: Amount; colored?: ManaCost["colored"]; condition?: Condition };
  /**
   * P/T defined by an ability (604.3, layer 7a): both (`pt`, e.g. cards in opponents' graveyards), only the power
   * (`power`, Enigma Drake) or only the toughness (`toughness`, Tarmogoyf with `power`).
   */
  cda?: { pt?: Amount; power?: Amount; toughness?: Amount };
  /**
   * "As it enters" (614.1c, 614.12, PLAN-H H9): the effects done while the permanent enters, before the enter event,
   * by a single loop (`asEntersChoices`, `replacement.ts`) whatever the path (permanent spell resolving, land played,
   * effect putting it onto the battlefield, other entry). Choices: `chooseOnEnter` (creature type, color, name,
   * mode…, `options` for the allowed choices), `chooseCopy` ("enters as a copy", 707.9), `devour` (702.82); any other
   * effect is written there too (Sin: remove counters); counters put on `ref.self` are the ones it enters with.
   */
  asEnters?: Effect[];
  /**
   * "As this creature is turned face up, put N [kind] counters on it" (Bubble Smuggler; Crowd-Control Warden: an amount
   * evaluated for it): put before it is turned face up, no ability on the stack.
   */
  faceUpCounters?: { kind: string; n: Amount };
  /** Crew N (Vehicle). */
  crew?: number;
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  image?: string;
  artCrop?: string;
  /**
   * Other printings of the card, with their art (PLAN-G: a reprint of a card already present); a deck
   * may choose one (`DeckEntries`, `PlayerSetup.printings`).
   */
  printings?: CardPrinting[];
  /** "Prepare" card (Reality Fracture): the spell attached to the creature (second face). */
  prepareFace?: PrepareFace;
  /** Multi-face layout (adventure, split card, transforming or modal double-faced card, meld). */
  layout?: MultiFaceLayout;
  /**
   * Full definitions of each face (0: front face, creature of an adventure, left half). The card itself
   * carries the characteristics outside the game: those of the front face, or the union of both halves of a split card.
   */
  faceDefs?: CardDef[];
  /** "As it enters, you may pay N life; if you don't, it enters tapped" (shock lands). */
  shockLand?: number;
  /**
   * Station (702.184): "N+ | …" thresholds (keywords read from the text, other abilities in the script) and the
   * threshold at which the Spacecraft becomes an artifact creature.
   */
  station?: { creatureAt?: number; thresholds: { n: number; keywords: Keyword[]; abilities: AbilityDef[] }[] };
  /** Toxic N (702.164): the number of poison counters (the keyword is in `keywords`). */
  toxic?: number;
  /** Saga (714): number of the final chapter (read from the text). */
  saga?: { chapters: number };
  /** Class (716): abilities of levels 2, 3… (level cost and added abilities). */
  classLevels?: { cost: ManaCost | null; abilities: AbilityDef[] }[];
  /** Case (719): "Solved" abilities (the "To solve" condition is compiled into the `solveCase` ability). */
  caseSolved?: AbilityDef[];
  /** Meld (701.42): the two parts and the melded card, by name. */
  meld?: { parts: string[]; result?: string };
  /** Melded card (shared back face of two cards): it doesn't go into a deck. */
  meldResult?: boolean;
  /** Definition of the melded card, registered in the game with the card (part of a meld pair). */
  meldResultDef?: CardDef;
  /** Definition of the prepared spell (copied into exile when the creature becomes prepared). */
  prepareSpell?: CardDef;
  /** false if the card has abilities the engine can't handle yet. */
  implemented: boolean;
  /** Reference printing (set code, collector number, rarity): decklist export, filters. */
  set?: string;
  number?: string;
  /**
   * Card of a pseudo-set imported by name (EDH, PLAN-E): Scryfall set of its printing (`number` is the number
   * in that set). Used by decklist export and the art menu; `set` stays the pseudo-set.
   */
  origin?: string;
  rarity?: string;
  /** Legality by format, from Scryfall at import time ("legal", "not_legal", "banned"…). */
  legalities?: Partial<Record<LegalityFormat, Legality>>;
  isToken?: boolean;
}

export type MultiFaceLayout = "adventure" | "split" | "transform" | "modal_dfc" | "meld" | "saga" | "class" | "case";

/** A displayable face (prepared spell, other face of a multi-faced card). */
export interface PrepareFace {
  name: string;
  manaCost: string;
  typeLine: string;
  text: string;
  fr?: { name?: string; typeLine?: string; text?: string; image?: string };
  /** Image specific to this face (back face of a double-faced card). */
  image?: string;
}

/** What an alternative cost makes you pay in addition to its mana (Force of Will, Force of Vigor, Daze). */
export interface AltCostPay {
  life?: number;
  /** Cards from your hand (other than the spell) matching the filter, exiled. */
  exileFromHand?: { filter: ObjectFilter; count: number };
  /** A matching permanent you control, returned to its owner's hand. */
  bounce?: ObjectFilter;
  /**
   * Emerge (702.119): a matching permanent you control, sacrificed; the cost is reduced by its mana value
   * (automatic choice: the greatest).
   */
  sacrificeReduce?: ObjectFilter;
  /**
   * `count` matching permanents you control, sacrificed (the Flares: "sacrifice a nontoken black creature rather than
   * pay"; Demon of Death's Gate: three black creatures; automatic choice: the lowest mana values).
   */
  sacrifice?: { filter: ObjectFilter; count: number };
}

/**
 * Kicker (702.33) and the optional costs read like one, paid as the spell is cast (`CastChoices.kicked`, read by
 * `cond.kicked`).
 */
export interface KickerDef {
  /** Mana of the kicker; `{0}` for a kicker without mana (gift, Bargain, blight, teamwork, collect evidence…). */
  mana: ManaCost;
  /** Label of the kicker: Offspring (702.175) or Gift (702.174), read from the text (Bloomburrow)… */
  kind?:
    | "offspring"
    | "gift"
    | "bargain"
    | "blight"
    | "teamwork"
    | "evidence"
    | "exileGraveyard"
    | "waterbend"
    | "life"
    /** Replicate (702.56): the kicker is paid X times (X of the spell); the spell is copied X times. */
    | "replicate"
    /** Squad (702.157): the kicker is paid X times; as it enters, the permanent creates X tokens that are copies of it. */
    | "squad"
    /** Multikicker (702.33c): the kicker is paid X times (X of the spell, read by `amount.x`). */
    | "multikicker";
  /**
   * Kicker without mana: sacrifice (FIN, Bargain) or return a permanent, blight N (`blight`, Lorwyn Eclipsed:
   * N -1/-1 counters on a creature you control), or tap creatures with total power N (`tapPower`,
   * Teamwork, Marvel Super Heroes).
   */
  pay?: {
    sacrifice?: ObjectFilter;
    bounce?: ObjectFilter;
    blight?: number;
    tapPower?: number;
    collectEvidence?: number;
    /** "Exile N cards from your graveyard or pay [mana]" (Soaring Stoneglider), with `orPay`. */
    exileGraveyard?: number;
    /** "Pay N life or pay [mana]" (Redirect Lightning), with `orPay`. */
    life?: number;
  };
  /**
   * Mandatory additional cost "blight N or pay [mana]" (Wild Unraveling, Bogslither's Embrace): the kicker without
   * mana (`pay.blight`) or, if it isn't paid, this mana.
   */
  orPay?: ManaCost;
  /** Gift (702.174): what the chosen opponent gets if the gift is promised. */
  gift?: GiftKind;
}

/**
 * A way to cast a card other than for its mana cost from the hand (`CardDef.castOptions`, PLAN-M M5), by `kind`:
 * - `flashback` (702.34): from the graveyard for `cost`, then exiled; `extra`: costs in addition to it (Twinned Vision:
 *   "discard a card"; Group Project: "tap three creatures"; Deep Analysis: "pay 3 life"); `harmonize` (702.180): the
 *   same casting for the harmonize cost, a tapped creature you control reducing it by {X}, X being its power;
 * - `graveyard`: "you may cast this card from your graveyard [if…]" (Lightwheel Enhancements: max speed); `discard`: by
 *   discarding that many additional cards (Alien Symbiosis), matching `discardFilter` (retrace, 702.81: a land card,
 *   read from the text); `removeCountersAmong`: by removing N counters from among your creatures (Quilled Greatwurm,
 *   same key as `PlayFromZone`);
 * - `mayhem` (Spider-Man): castable from the graveyard for `cost` if it was discarded this turn;
 * - `madness` (702.35): when discarded, the card goes to exile and may be cast for `cost` (read from the text);
 * - `warp` (702.185): `cost`, additional `life`, and also castable from the graveyard (`fromGraveyard`, Timeline Culler);
 * - `plot` (702.170): cost of the special action "plot this card" (read from the text);
 * - `foretell` (702.143): cost to cast the foretold card on a later turn (read from the text);
 * - `flash`: "you may cast this spell as though it had flash if you pay `cost` more to cast it";
 * - `alternative`: "you may pay `mana` rather than pay this spell's mana cost [if…]" (118.9); `via`: the name of the
 *   cost, recorded at cast time (`CastInfo.via`) and read by `cond.castVia` and the rules: evoke (702.74, the creature
 *   is sacrificed when it enters), sneak (702.190, an unblocked attacker returned), web-slinging (a tapped creature
 *   returned), impending (702.176, `impending` time counters as it enters), dash, blitz; `pay`: other things paid
 *   along with the mana (Force of Will: 1 life and a blue card exiled from hand; Daze: an Island you control returned
 *   to hand; emerge: a creature sacrificed), the objects chosen automatically; `forage`: "forage" instead of the mana
 *   (Feed the Cycle);
 * - `faceDown`: disguise (702.168), cast face down as a 2/2 creature for {3}, `cost` turning it face up; `morph`
 *   (702.37): the same without ward {2}; `reducedBy`: "this cost is reduced by {1} for each…" (Fugitive Codebreaker).
 */
export type CastOption =
  | { kind: "flashback"; cost: ManaCost; extra?: AdditionalCost; harmonize?: boolean }
  | {
      kind: "graveyard";
      condition?: Condition;
      payLife?: number;
      sacrifice?: ObjectFilter;
      discard?: number;
      discardFilter?: ObjectFilter;
      finality?: boolean;
      removeCountersAmong?: number;
    }
  | { kind: "mayhem"; cost: ManaCost }
  | { kind: "madness"; cost: ManaCost }
  | { kind: "warp"; cost: ManaCost; life?: number; fromGraveyard?: boolean }
  | { kind: "plot"; cost: ManaCost }
  | { kind: "foretell"; cost: ManaCost }
  | { kind: "flash"; cost: ManaCost }
  | {
      kind: "alternative";
      mana: ManaCost;
      condition: Condition;
      label: string;
      forage?: boolean;
      via?: CastVia;
      pay?: AltCostPay;
      impending?: number;
    }
  | { kind: "faceDown"; cost: ManaCost; morph?: true; reducedBy?: Amount };

/** Rules printed on a card about how it is cast, resolves or behaves (`CardDef.rules`, PLAN-M M5). */
export interface CardRules {
  /** "This spell can't be countered." */
  cantBeCountered?: boolean;
  /** "This spell can't be copied" (Choreographed Sparks). */
  cantBeCopied?: boolean;
  /** "Exile [this spell]" on resolution, instead of the graveyard (Step Between Worlds). */
  exileOnResolve?: boolean;
  /** "If this card would be put into a graveyard from anywhere, shuffle it into its owner's library instead." */
  shuffleIntoLibrary?: boolean;
  /** Paradigm (Strixhaven): exiled on resolution; a free copy at the beginning of each of your main phases. */
  paradigm?: boolean;
  /** Storied (The Hobbit): its controller may gain an enduring story (see `stateBasedActions`). */
  storied?: boolean;
  /** Aura: "You control enchanted permanent" (Confiscate). */
  controlsEnchanted?: boolean;
  /** Wilt-Leaf Liege: discarded by a spell or ability an opponent controls, it goes to the battlefield. */
  opponentDiscardToBattlefield?: boolean;
  /** Cloud, Planet's Champion: "equip abilities you activate that target it cost {N} less to activate". */
  equipDiscountWhenTargeted?: number;
  /**
   * Activated abilities of sources with the chosen name (`GameObject.chosen.cardName`): cost {N} more (Skyseer's
   * Chariot), or can't be activated unless they're mana abilities (`"forbid"`: Sorcerous Spyglass, Petrified
   * Hamlet).
   */
  chosenNameAbilities?: number | "forbid";
  /** "You can't cast this spell unless…" (Proft, Sinister Mastermind: threshold). */
  castCondition?: Condition;
  /** "[This card] has flash as long as …" (Take for a Ride, Colossal Rattlewurm). */
  flashIf?: Condition;
  /**
   * "… if you controlled a Faerie as you cast this spell" (Faerie Fencing, Steer Clear): evaluated at cast time,
   * remembered by the spell (`cond.metWhenCast`).
   */
  whenCast?: Condition;
}

/** A printing of a card: its set, its number and its art. */
export interface CardPrinting {
  /** "SPG-13": set code and collector number. */
  key: string;
  set: string;
  number: string;
  image?: string;
  artCrop?: string;
  /** Image of the French printing, if there is one. */
  frImage?: string;
}

/**
 * Game formats: Standard, "unlimited" (any card of the catalog, whatever its legality: banned, outside Standard…;
 * only the deck construction rules remain) and Commander (903, PLAN-E: 100 cards including the commander,
 * singleton, color identity, banned list of `cards/data/commander.json`). The legalities imported from Scryfall
 * only cover the formats of `LegalityFormat`.
 */
export type Format = "standard" | "unlimited" | "commander";
/** Formats of the legalities imported from Scryfall. */
export type LegalityFormat = "standard";
export type Legality = "legal" | "not_legal" | "banned" | "restricted";

export interface SpellDef {
  /** A single mode = normal spell; several = "Choose one —". */
  modes: ModeDef[];
}

export interface ModeDef {
  label?: string;
  targets: TargetSpec[];
  effects: Effect[];
  /** Spree (702.172): additional cost of this mode (combined modes add theirs up). */
  extraCost?: ManaCost;
  /** Mode available only if the condition is met (delirium: "choose one or more instead"). */
  condition?: Condition;
  /**
   * Alternative cost specific to the mode, which replaces the mana cost (overload 702.96, cleave 702.148): the text
   * changes with the cost paid. Neither free nor with another alternative cost (118.9a); the mana value stays the card's.
   */
  cost?: ManaCost;
}

export type AbilityDef =
  | ManaAbilityDef
  | ActivatedAbilityDef
  | TriggeredAbilityDef
  | StaticAbilityDef
  | ReplacementAbilityDef
  | CostReductionAbilityDef
  | CastPermissionAbilityDef
  | PlayerStaticAbilityDef
  | PreventionAbilityDef
  | GraveyardReplacementAbilityDef
  | EventReplacementAbilityDef;

export interface AdditionalCost {
  discard?: number;
  /** "Pay N life" (Deep Analysis: "Flashback—{1}{U}, Pay 3 life", in the `extra` of the flashback option). */
  payLife?: number;
  /** Only matching cards (retrace, 702.81: a land card). */
  discardFilter?: ObjectFilter;
  /**
   * Alternative to discarding: "Discard a card or …". `life`: "… pay N life" (Bitter Triumph: without discarding,
   * the player pays that life); `mana`: "… pay [mana]" (Titania: without discarding, this mana is added to the cost);
   * `sacrifice`: "… sacrifice a permanent" (Souls of the Lost: a chosen permanent is sacrificed), a filter:
   * "… sacrifice an artifact" (Demand Answers).
   */
  discardOr?: { life?: number; mana?: ManaCost; sacrifice?: boolean | ObjectFilter };
  /**
   * Behold (701.65): choose a matching permanent you control or reveal such a card from your hand.
   * "You may behold" (the Exhales); with `orPay`: "behold … or pay [mana]" (this mana is added without
   * beholding). The spell remembers that it beheld (`cond.beheld`) and what it beheld (`ref.cost("beheld")`).
   * `required`: mandatory ("choose a creature you control or reveal a creature card from your hand",
   * Monstrous Emergence); `exiled`: a matching exiled card instead of a card from hand (Close Encounter).
   */
  /** `count`: "behold three Elementals" (Kindle the Inner Flame's flashback): that many distinct objects. */
  behold?: { filter: ObjectFilter; orPay?: ManaCost; required?: boolean; exiled?: ExiledFilter; count?: number };
  /** Collect evidence X, X being the total mana value of the targeted permanents (Urgent Necropsy). */
  collectEvidenceTargetsManaValue?: boolean;
  /**
   * Chosen automatically (Duskmourn): permanents exiled (linked to the permanent), returned, tapped; graveyard cards
   * exiled. `fromHand`: "behold a [type] and exile it" (Lorwyn Eclipsed): a permanent you control or
   * a card from your hand.
   */
  exile?: { filter: ObjectFilter; count: number; fromHand?: boolean };
  bounce?: { filter: ObjectFilter; count: number };
  tap?: { filter: ObjectFilter; count: number };
  exileGraveyard?: number;
  /** `orPay`: "sacrifice a creature or pay {3}{B}" (without a sacrifice, this mana is added to the cost). */
  sacrifice?: { filter: ObjectFilter; count: number; orPay?: ManaCost };
  /**
   * "You may sacrifice any number of [filter]. This spell costs {N} less to cast for each permanent sacrificed
   * this way" (Rottenmouth Viper {1}, Dargo {2}): each sacrifice pays `each` (1 by default) of the generic, as the
   * player chooses (otherwise as few as possible).
   */
  sacrificeToPay?: SacrificeToPay;
  /**
   * X of the spell paid other than with mana, as an additional cost: "pay X life" (`life`, Vicious Rivalry),
   * "blight X" (`blight`, Soul Immolation: X at most the greatest toughness among your creatures; the creature
   * is chosen as for an ability cost, `blightTarget`).
   */
  xCost?: "life" | "blight" | "waterbend";
  /**
   * Waterbend as an additional cost of the spell (Avatar): "waterbend {N}" (`waterbend: N`), "waterbend {X}"
   * (`xCost: "waterbend"`), or optional "you may waterbend {N}" (the kicker, `kicker.kind: "waterbend"`). That mana
   * may be paid by tapping untapped artifacts and creatures ({1} each).
   */
  waterbend?: number;
  /** "This spell costs [mana] more to cast for each target beyond the first" (Officious Interrogation). */
  costPerExtraTarget?: ManaCost;
  /** "As an additional cost, forage or pay [mana]" (Feed the Cycle): the "Forage" alternative cost avoids it. */
  forageOrPay?: ManaCost;
}

/** Sacrifice as an additional cost that pays part of the generic cost (`AdditionalCost.sacrificeToPay`). */
export interface SacrificeToPay {
  filter: ObjectFilter;
  /** Generic mana paid by each sacrifice ({2} less for each: Dargo); 1 by default. */
  each?: number;
}

/** "[Filter] spells you cast cost {N} less." */
export interface CostReductionAbilityDef {
  kind: "costReduction";
  filter: ObjectFilter;
  generic: number;
  /** Applies to opponents' spells (Thalia, the Survivor: negative generic = tax); `everyone`: to those of
   * all players (Arachne, Psionic Weaver). */
  opponents?: boolean;
  everyone?: boolean;
  /** Variable reduction (affinity for artifacts: Sami, Wildcat Captain), added to `generic`. */
  genericAmount?: Amount;
  /**
   * The reduction is in symbols of this color: each point removes one, otherwise one generic mana (118.7c; Eluge:
   * "costs {U} (or {1}) less for each…").
   */
  colored?: ManaType;
  /** Only if the condition is met (Uthros Psionicist: "the second spell you cast each turn"). */
  condition?: Condition;
  /** Only for spells cast from these zones (Aven Interrupter, Doc Aurlock: graveyard or exile). */
  fromZones?: ("graveyard" | "exile")[];
  label?: string;
}

/**
 * Kind of an activated ability or special action (cost modifiers, restricted mana): exhaust, Equip,
 * unlock a door, plot, power-up, turn a permanent face up.
 */
export type AbilityKind = "exhaust" | "equip" | "unlock" | "plot" | "powerUp" | "turnFaceUp";

/** Allowed use of restricted mana (mana ability, or mana added by an effect: Ashling, Rimebound). */
export interface ManaRestriction {
  spell?: ObjectFilter;
  /** Activate an ability of these kinds ("or activate an equip ability", "unlock a door"). */
  ability?: AbilityKind[];
  abilityOfCreature?: ObjectFilter;
  abilityOfSource?: ObjectFilter;
  notSpellFromHand?: boolean;
  spellNotFromHand?: boolean;
}

export interface ManaAbilityDef {
  kind: "mana";
  cost: CostDef;
  /** The player chooses one of these types. */
  produce: ManaType[];
  /** "N mana in any combination of [these types]": each mana has its own type (Vivi Ornitier). */
  combination?: boolean;
  /** Produces the color chosen as it entered (Heraldic Banner). */
  produceChosen?: boolean;
  /** Mana that can be spent only on a spell (or an ability of a source creature) matching the filter. */
  /** `notSpellFromHand`: "this mana can't be spent to cast spells from your hand" (Heartwood Crafter). */
  /** `abilityOfSource`: ability of any source matching the filter (Steelswarm Operator); */
  /** `spellNotFromHand`: "only to cast a spell from anywhere other than your hand" (Mm'menon, the Right Hand). */
  restriction?: ManaRestriction;
  /** Gene Pollinator: "tap an untapped permanent you control" in addition to {T} (chosen automatically). */
  /** `"creature"`: an untapped creature (Springleaf Drum); a filter: a matching permanent (Relic of Legends). */
  tapAnother?: boolean | "creature" | "artifact" | ObjectFilter;
  /** "Activate only if you control…" (Aetherdrift verges). */
  condition?: Condition;
  /** "Activate only once each turn" (Vivi Ornitier). */
  oncePerTurn?: boolean;
  /** Twitching Doll: "put a [nest] counter on this creature" when it's activated. */
  addCounter?: string;
  /** Temple of Cyclical Time: "remove a [time] counter from this land" when it's activated. */
  removeCounter?: string;
  /**
   * Drawback of the mana ability, applied as it resolves (605.3b): the source deals damage to its
   * controller (Ancient Tomb, "pain" lands), each opponent gains life (Grove of the Burnwillows).
   */
  drawback?: { damageYou?: number; opponentsGainLife?: number };
  /**
   * One mana of any of the colors among the designated objects: the matching permanents you control (Meteor Crater,
   * Plaza of Heroes), the matching cards in your graveyard (The Grey Havens), the cards exiled with the source (Pit of
   * Offerings: `ref.linked`).
   */
  produceColorsOf?: Ref;
  /**
   * One mana of a type of `produce` that a matching land could produce: that you control (Reflecting Pool;
   * Star Compass: basic), or an opponent's if the filter says so (`controller: "opponent"`: Exotic Orchard).
   */
  produceLikeLands?: ObjectFilter;
  /**
   * Commander (903.4): one mana of any color in your commander's color identity (Command Tower, Arcane
   * Signet); without a commander, no mana (903.4f).
   */
  produceIdentity?: boolean;
  /**
   * Effect if this mana is spent to cast a matching spell (Carnelian Orb: haste; Pyromancer's Goggles: copy;
   * `uncounterable`: "that spell can't be countered", Cavern of Souls). `effects`: "when this mana is spent
   * to cast [a matching spell], [effects]", triggered ability of the source (Path of Ancestry: scry 1).
   */
  rider?: { spell: ObjectFilter; effect?: "haste" | "copy" | "uncounterable"; effects?: Effect[] };
  amount: number;
  /**
   * Variable amount, evaluated for the source ("{G} for each Elf you control"; The Eternity Elevator: its charge
   * counters; The Core: permanent cards in your graveyard; Redshift: its power; Loot, the Nexus: different powers among
   * your creatures); otherwise `amount`.
   */
  amountOf?: Amount;
}

export interface ActivatedAbilityDef {
  kind: "activated";
  cost: CostDef;
  targets: TargetSpec[];
  effects: Effect[];
  sorcerySpeed?: boolean;
  label?: string;
  /** "Activate this ability only once." */
  once?: boolean;
  /**
   * Power-up (Marvel Super Heroes): only once, and the cost is reduced by the mana cost of the
   * source if it entered this turn.
   */
  powerUp?: boolean;
  /** Ability activated from the graveyard ("Return this card from your graveyard…"). */
  fromGraveyard?: boolean;
  /** Ability activated from hand (cycling, "discard this card: …"). */
  fromHand?: boolean;
  /**
   * Also activated from the command zone, as well as from its own zone (commander ninjutsu, 702.49d: "from your hand
   * or the command zone").
   */
  fromCommand?: boolean;
  /** Cycling ability (702.29): "when you cycle this card" triggers. */
  cycling?: boolean;
  /** Exhaust (702.177): a single activation; "whenever you activate an exhaust ability" triggers. */
  exhaust?: boolean;
  /** "Activate only once each turn." */
  oncePerTurn?: boolean;
  /** "Activate only if…" / "… only during your turn". */
  activationCondition?: Condition;
  /** Equip ability (Kíli: the first each turn may cost {0}). */
  equip?: boolean;
  /** Special action (116): no stack, immediate effects (unlock a door of a Room). */
  specialAction?: boolean;
  /**
   * "This ability costs {N} less to activate [if …]" (N evaluated on activation); an amount that reads the target is
   * evaluated for it ("{1} less for each +1/+1 counter on target creature": Warrior's Blades; "for each color of target
   * creature": Dragonfire Blade).
   */
  reduction?: { generic: Amount; condition?: Condition };
  /**
   * Who may activate it, if not only its controller (602.2): `"opponents"` (Oft-Nabbed Goat: "only your opponents may
   * activate this ability"), `"any"` (Xantcha: "any player may activate this ability"). "You" in its effects is the
   * player who activates it.
   */
  activators?: "opponents" | "any";
}

export interface CostDef {
  mana?: ManaCost;
  tap?: boolean;
  /**
   * What is done with the source to pay: sacrifice it, exile it (from the battlefield or the graveyard), discard it
   * (ability activated from hand), return it to hand (Maze's End), exert it (701.43: it won't untap
   * during its controller's next untap step).
   */
  self?: "sacrifice" | "exile" | "discard" | "bounce" | "exert";
  /**
   * Craft (702.167): exile materials from among the other permanents you control and/or the cards in your
   * graveyard (chosen automatically, graveyard cards first). `each`: one material per filter (The Grim Captain);
   * `orMore`: one or more; `preferHighManaValue`: the most expensive first (Jadeheart Attendant).
   */
  craft?: {
    filter?: ObjectFilter;
    count: number;
    orMore?: boolean;
    each?: ObjectFilter[];
    preferHighManaValue?: boolean;
    /** "One or more": one material per new color (Sunbird Standard), rather than the whole graveyard. */
    distinctColors?: boolean;
  };
  /** Sacrifice other permanents (chosen by the player). */
  /** `includeSelf`: the source may be among the sacrificed permanents (Rat King: "sacrifice three Rats"). */
  /** `distinct: "name"`: permanents with different names (Transmutation Font: "three artifact tokens with different names"). */
  /**
   * `count: "X"`: X matching permanents, X ≥ 1 chosen on activation (Radiant Lotus; chosen automatically, the source
   * last). The other "X" costs read the same way: `tapOthers`, `exileFromGraveyard`, `removeCounters.n`, `discard`,
   * `payLife` (`{ kind: "x" }`), see `xCosts` (stack.ts).
   */
  sacrifice?: { filter: ObjectFilter; count: number | "X"; includeSelf?: boolean; distinct?: "name" };
  /** Blight N (ECL): N −1/−1 counters on a creature you control (chosen automatically: `blightTarget`). */
  blight?: number;
  /** Collect evidence N (701.59, MKM): graveyard cards with total mana value N or greater (chosen automatically). */
  collectEvidence?: number;
  /**
   * Permanents tapped to help pay the mana of the ability (chosen by the player in full control, otherwise by the
   * solver):
   * - `waterbend` (Avatar): the mana cost is a "waterbend" cost; each untapped artifact or creature you control may be
   *   tapped to pay {1};
   * - `convoke`: "for each mana in this ability's activation cost, you may tap an untapped creature you control rather
   *   than pay that mana" (Heirloom Epic): convoke for an ability (702.51).
   */
  tapToPay?: "waterbend" | "convoke";
  /** "X can't be 0": smallest allowed value of X (Katara, Water Tribe's Hope; Gogo, Master of Mimicry). */
  minX?: number;
  /** The exiled evidence is linked to the source (Kylox's Voltstrider: "among cards exiled with it"). */
  linkEvidence?: boolean;
  /**
   * Remove counters from the source. `kind: "any"`: "remove N counters from this creature", of any
   * kind (ECL), removed by the engine: −1/−1 first, +1/+1 last.
   */
  removeCounters?: { kind: string; n: number | "X" };
  /**
   * "Exile any number of [color] cards from your graveyard with N or more [color] mana symbols among
   * their mana costs" (Baron Helmut Zemo: boast): chosen automatically (fewest cards), recorded in
   * `costExiled`.
   */
  exileGraveyardSymbols?: { color: ManaType; n: number };
  /** Tap other untapped permanents you control (chosen automatically). `includeSelf`: "tap N untapped
   * creatures you control", the source may be one of them, even with summoning sickness (302.6). */
  tapOthers?: { filter: ObjectFilter; count: number | "X"; includeSelf?: boolean };
  /**
   * Ability granted by another permanent (`Characteristics.grantors`): what is done with it to pay ("Tap Fishing
   * Pole", "Exile The Dominion Bracelet", "Sacrifice Deconstruction Hammer").
   */
  grantor?: "tap" | "exile" | "sacrifice";
  /**
   * Loyalty ability (606): loyalty counters added (+N) or removed (−N); `"X"`: "−X", X loyalty
   * counters removed (X chosen on activation).
   */
  loyalty?: number | "X";
  /** Remove a counter from a permanent you control (chosen automatically: Sunstar Chaplain). */
  /** Remove `n` counters (1 by default) from among matching permanents you control (Iron Spider: two). */
  removeCounterFrom?: { filter: ObjectFilter; kind: string; n?: number };
  /** Exile other cards from your graveyard (chosen automatically: Gallia). */
  exileFromGraveyard?: { filter: ObjectFilter; count: number | "X" };
  /** Put counters on the source (Mazemind Tome: page counter). */
  addCounters?: { kind: string; n: number };
  /** Crew N (702.122): tap untapped creatures with total power N or greater (chosen automatically). */
  crew?: number;
  /** "Pay N life"; an amount evaluated for the source (War Room: the colors in your commanders' color identity). */
  payLife?: Amount;
  /** Discard N cards (chosen by the player; by default the first ones in hand); `"X"`: Gix, Yawgmoth Praetor. */
  discard?: number | "X";
  /** "Discard your hand" (payable even with an empty hand). */
  discardHand?: boolean;
  /** … only matching cards (Lluwen: "discard a land card"). */
  discardFilter?: ObjectFilter;
  /** Ninjutsu: return an unblocked attacker you control to hand (chosen automatically: the weakest). */
  returnUnblockedAttacker?: boolean;
  /** "Return [a permanent] you control to its owner's hand" (Urban Retreat: a tapped
   * creature); chosen by the player (`bounce`), otherwise the cheapest. */
  bounce?: ObjectFilter;
  /** "Exile [a permanent] you control" (The Soul Stone: a creature), the cheapest by default. */
  exile?: ObjectFilter;
  /** Forage (701.61): exile three cards from your graveyard or sacrifice a Food (automatic choice). */
  forage?: boolean;
  /** With `discard`: the card is discarded at random (Alpharael, Stonechosen's ward). Only in a `pay` effect for now. */
  discardRandom?: boolean;
  /** Get N poison counters (The Serpent Society's ward). Only in a `pay` effect for now. */
  poison?: number;
  /**
   * Behold: choose a matching permanent you control or reveal a matching card from your hand. Only in a `pay`
   * effect for now (the additional cost to cast is `AdditionalCost.behold`).
   */
  behold?: ObjectFilter;
}
/** Modifications made by a continuous effect, sorted by layer (613). */
/**
 * Blocking rule of a creature (layer 6, family R4.1): "can't be blocked by [filter]", "can block
 * only [filter]", number of blockers, "can't attack or block alone". `label`: displayed badge.
 */
export interface BlockRule {
  /** Blockers matching the filter can't block it. */
  cantBeBlockedBy?: ObjectFilter;
  /**
   * "Creatures with power less than [this permanent]'s power can't block" (Champion of Lambholt): `source`, the
   * permanent of the static (fixed by `resolveBlockRules`), its power compared at the moment of blocking.
   */
  cantBeBlockedByWeakerThan?: ObjectId | "source";
  /** It can block only an attacker matching the filter. */
  canBlockOnly?: ObjectFilter;
  /** Blocked by at least / at most N creatures. */
  minBlockers?: number;
  maxBlockers?: number;
  /** Can't attack or block alone (Toby, Beastie Befriender). */
  notAlone?: boolean;
  /**
   * Can't attack this player or their planeswalkers. In a script: `"you"` (Eriette of the Charmed Apple: "can't
   * attack you"), replaced by the source's controller when the static ability applies, or by the controller of
   * the effect as it resolves (Promise of Loyalty); see `resolveBlockRules`.
   */
  /** `"owner"`: the owner of the source (Alexios, Xantcha: "can't attack its owner"). */
  cantAttackPlayer?: PlayerId | "you" | "owner";
  /**
   * Goad (701.38): it attacks each combat if able, and a player other than this one if able (508.1d).
   * In a script, `"you"` (`fx.goad`): the controller of the effect, fixed on resolution. Several players can goad
   * it (701.38c): as many requirements. Maximum Carnage imposes the same requirements without the word "goad".
   */
  goadedBy?: PlayerId | "you";
  /**
   * Attack requirement (508.1d): it attacks this player each combat if able (Silver Surfer: `"eventPlayer"`, the
   * player of the event, fixed on resolution), or an opponent with the most life among the opponents
   * of its controller (Galactus: `"mostLifeOpponent"`, read at each declaration). A planeswalker doesn't satisfy it.
   */
  mustAttackPlayer?: PlayerId | "eventPlayer" | "mostLifeOpponent";
  /** Landwalk (702.14): can't be blocked as long as the defending player controls a matching permanent. */
  unblockableIfDefenderControls?: ObjectFilter;
  /**
   * "Can't be blocked by creatures that player controls" (The Black Gate: the chosen player). In an
   * effect, a reference (`ref.stored("…")`), fixed on resolution (`resolveBlockRules`); an unfixed reference (in
   * a static ability) designates no one.
   */
  cantBeBlockedByPlayer?: PlayerId | Ref;
  /** "Can't attack a player it already attacked this turn" (Port Razer). */
  notDefendersAttackedThisTurn?: boolean;
  /**
   * Block requirement (509.1c): it blocks this turn if able (Culvert Ambusher, Hustle), or blocks that attacker
   * if able (Tolsimir: `"eventObject"` in a script, replaced on resolution by the object of the event).
   */
  mustBlock?: boolean;
  mustBlockAttacker?: ObjectId | "eventObject";
  label: string;
}

/**
 * Protection (702.16) or hexproof (702.11d) from a quality, described by a filter on the source (the
 * spell, or the source of the ability or damage; family R4.2). Protection from everything: empty filter.
 */
export interface ProtectionRule {
  from: ObjectFilter;
  /** Hexproof: only against targeting by an opponent. Otherwise protection (DEBT). */
  hexproofOnly?: boolean;
  /**
   * Commander: protection from each color outside the color identity of the commanders of the protected
   * permanent's controller (903.4; Commander's Plate), added to the `from` filter; no protection if the identity has
   * all five colors.
   */
  outsideIdentity?: boolean;
  label: string;
}

/**
 * "Uses its toughness (or a modified power) for …" (family R4.3): combat damage (Ghalta, Loot, the
 * Anomaly), crew and saddle (pilots, Interface Ace), station (Tapestry Warden).
 */
export interface PowerRule {
  uses: ("combatDamage" | "crew" | "station")[];
  /** Toughness instead of power: always, or only if it's greater. */
  toughness?: "always" | "ifGreater";
  /** The absolute value of a negative power. */
  absolute?: boolean;
  /** As though its power were N greater. */
  bonus?: number;
  label: string;
}

export interface LayerMods {
  /**
   * Layer 3 (612, text-changing effects): the object has the text box of this definition (abilities, keywords,
   * characteristic-defining abilities) instead of its own (Deadpool, Trading Card: two exchanged text boxes). Not copiable.
   */
  textOf?: string;
  /**
   * Layer 7c: `power`/`toughness` multiplied by a number relative to each affected object:
   * - `sameName`: the other creatures its controller controls with the same name (Mirror Box);
   * - `ownCreatureTypes`: its number of creature types, at most `max` (Diligent Zookeeper: "+1/+1 for each of its
   *   creature types, to a maximum of 10"; changeling: all).
   */
  perAffected?: { what: "sameName" } | { what: "ownCreatureTypes"; max: number };
  /** Layer 6: "uses its toughness for" rules granted. */
  addPowerRules?: PowerRule[];
  /** Layer 6: protections and hexproof "from [filter]" granted. */
  addProtections?: ProtectionRule[];
  /** Layer 6: (non-keyword) abilities granted. */
  addAbilities?: AbilityDef[];
  /** Layer 6: blocking rules granted. */
  addBlockRules?: BlockRule[];
  /** Layer 4: types and subtypes added. */
  addTypes?: CardType[];
  addSubtypes?: string[];
  /** Layer 4: supertypes added ("except it's legendary"). */
  addSupertypes?: string[];
  /** Supertypes removed ("except it isn't legendary", The Apprentice's Folly, Yenna). */
  removeSupertypes?: string[];
  /** Layer 4: types replaced ("is a land and loses all other card types"), subtypes replaced. */
  setTypes?: CardType[];
  setSubtypes?: string[];
  /** Name replaced (Witness Protection). */
  setName?: string;
  /** Layer 5: colors replaced; `addColors`: "in addition to its other colors". */
  setColors?: Color[];
  /**
   * "Enchanted land is the chosen color" (Shimmerwilds Growth): the color chosen by the source; `"add"`:
   * "in addition to its other colors" (Painter's Servant).
   */
  setColorsChosen?: boolean | "add";
  addColors?: Color[];
  /** Layer 4: has all creature types (Soulstone Sanctuary, changeling). */
  allCreatureTypes?: boolean;
  /**
   * Layer 4: additionally has the subtype chosen by the source: `"subtype"`, the chosen creature type (Adaptive
   * Automaton); `"landType"`, the chosen basic land type (Multiversal Passage).
   */
  addChosen?: "subtype" | "landType";
  /** Layer 6: abilities (keywords) added or removed. */
  addKeywords?: Keyword[];
  removeKeywords?: Keyword[];
  /**
   * "… loses [keyword] and can't have or gain it" (Archetype of Courage): removed after all other layer 6
   * effects, whatever their timestamps (keyword counters included, 122.1b).
   */
  forbidKeywords?: Keyword[];
  loseAllAbilities?: boolean;
  /** Layer 1: becomes a copy of this definition (copiable values; Hall of Echoes). */
  copyOf?: string;
  /** Secret Invasion: copy of the card exiled by the source (linked by "exile until"). */
  copyLinkedExile?: boolean;
  /**
   * Has the printed activated (and mana) abilities of other objects: the cards linked to the source (`linked`:
   * Territory Forge; `triggered`: also their triggered abilities, and `filter` `chosen: "cardName"`: only the linked card
   * whose name was chosen, Koh, the Face Stealer), the matching cards in its controller's graveyard (`graveyard`:
   * Thranduil, the Elvenking), the matching creatures that don't have its name (`battlefield`: Marvin, Murderous Mimic).
   */
  gainAbilitiesOf?: { zone: "linked" | "graveyard" | "battlefield"; filter?: ObjectFilter; triggered?: boolean };
  /** Layer 7b: P/T set. */
  setPower?: number;
  setToughness?: number;
  /** Layer 7c: P/T modifications. */
  power?: number;
  toughness?: number;
  /** Layer 7d: P and T switched. */
  switchPT?: boolean;
}

/** Replacement effect carried by the card itself (614.1c–d: "enters tapped", "enters with…"). */
export interface ReplacementAbilityDef {
  kind: "replacement";
  entersTapped?: boolean;
  /** "This creature enters prepared." */
  entersPrepared?: boolean;
  /** Number of +1/+1 counters on entering (X of the spell included). */
  entersWithCounters?: Amount;
  /** Condition (raid, kicker…) evaluated as it enters. */
  condition?: Condition;
  /**
   * Type of the counters (+1/+1 by default): "revival", "fellowship"…; `*` (with `affects`): each kind present on
   * the source (Blue, Loyal Raptor).
   */
  counterKind?: string;
  /** Applies to the other permanents matching the filter (seen from the source's controller), not to the source. */
  affects?: ObjectFilter;
  label?: string;
}

/**
 * 614.1a: "if [an object] would be put into a graveyard, exile it instead" (Rest in Peace, Leyline of the Void,
 * Garruk, The Darkness Crystal, Valgavoth…). Several replacements: see `replaceGraveyard` (replacement.ts, 616.1).
 */
export interface GraveyardReplacementAbilityDef {
  kind: "graveyardReplacement";
  /** Objects concerned, seen from the source's controller (types, tokens, "controlled by an opponent"…). */
  filter?: ObjectFilter;
  /** Only from the battlefield ("die"). */
  fromBattlefield?: boolean;
  /** Graveyard concerned: that of the source's controller, or that of one of their opponents; all by default. */
  graveyardOf?: "you" | "opponent";
  /** Only what the source's controller didn't control (Valgavoth). */
  notControlledByYou?: boolean;
  /** The exiled card is linked to the source: by identifier (Valgavoth, playable) or by physical identity (Darkness Crystal). */
  link?: "object" | "uid";
  /** The source's controller gains this much life. */
  gainLife?: number;
  /** Head of the Hunt: "when you do, create [this token]" (created at once). */
  createToken?: TokenSpec;
  condition?: Condition;
  label?: string;
}

/**
 * Replacement or prevention of a numeric event (614, 615, 616; families E and F of PLAN-R, lot R1): damage or
 * life loss, seen from the replacement's controller. Printed: `EventReplacementAbilityDef`; temporary:
 * player effect (`fx.thisTurn({ replacement })`); "the next time" shield (615.7): single-use effect.
 */
export interface EventReplacement {
  /**
   * The numeric event: damage and life loss (families E and F); tokens created and counters put (family H); life
   * gained, cards drawn, cards milled, mana produced (family I); `untap`: a permanent untapping (only
   * prevention applies to it: Blossombind, "can't become untapped"; with `untapStep`, "doesn't untap during
   * its controller's untap step"); `payLife`: life paid (Ashiok, Wicked
   * Manipulator: `instead.exileFromLibrary`, that many cards from the top of the library exiled instead).
   */
  /** `connive`: a creature is about to connive; `modify.add`: its controller first draws that many cards (Leader). */
  event:
    | "damage"
    | "lifeLoss"
    | "lifeGain"
    | "draw"
    | "mill"
    | "counters"
    | "tokens"
    | "mana"
    | "untap"
    | "payLife"
    | "connive"
    | "explore";
  /** Source of the damage (filter seen from the controller: `controller: "you"` for "your sources"); mana: the tapped permanent. */
  source?: ObjectFilter;
  /**
   * Player concerned, seen from the controller: them (`you`), them or their permanents (`yourSide`), an opponent (`opponent`), an
   * opponent or their permanents (`opponentSide`); absent: all. Damage: the one dealt damage; life loss or gain, draw,
   * mill: the player; counters: the permanent's controller; tokens: the one who creates them; mana: the one who taps.
   */
  to?: "you" | "yourSide" | "opponent" | "opponentSide";
  /** Only a matching permanent: dealt damage (Summon: Alexander), receiving the counters; tokens: the token created. */
  toFilter?: ObjectFilter;
  /** Counters: only this kind ("+1/+1"). */
  counter?: string;
  /** Counters: not those put to pay a cost (Doubling Season: "if an effect would put counters"). */
  effectOnly?: boolean;
  /** Counters: only those put by the replacement's controller (Innkeeper's Talent: "if you would put"). */
  byYou?: boolean;
  /**
   * Tokens: other tokens instead (Draconic Visitor: a 5/5 Dragon) or copies of the permanent the source is
   * attached to (Moonlit Meditation, Mirrormind Crown); `firstEachTurn`: only the first time each turn; `may`:
   * "you may instead" (asked by the effect creating the tokens, before they are created).
   */
  /**
   * `oneOfEach`: "instead create one of each" of these tokens, for each token (Academy Manufactor); each such
   * replacement applies once to the tokens it creates (616.1: with two Manufactors, three of each).
   */
  instead?: {
    token?: TokenSpec;
    copyOfAttached?: boolean;
    firstEachTurn?: boolean;
    exileFromLibrary?: boolean;
    may?: boolean;
    oneOfEach?: TokenSpec[];
  };
  /** Tokens: "those tokens plus a [N] token" (Quina: a Frog; Worldwalker Helm: a Map). */
  plus?: TokenSpec;
  /**
   * Mana: only when this type is produced (Ultima: a land tapped for {C}); the additional mana added is of the same
   * type (`same`, by default), of the color chosen by the source (`chosen`, Shimmerwilds Growth) or of this type.
   */
  manaProduced?: ManaType;
  /** `any`: one mana of any color (Buried in the Garden) — approximated: the color of the mana produced. */
  extraMana?: "same" | "chosen" | "any" | ManaType;
  /** true: only combat damage; false: only other damage. */
  combat?: boolean;
  /**
   * "That much plus N", "twice that much", "at least N", "prevent it". `add` and `atLeast` are evaluated from the
   * replacement's point of view (`ref.self`: its source): the flame counters of Fated Firepower, the power of Hawkeye,
   * Young Avenger or of Ojer Axonil; an amount that isn't a written number is floored at 0 (see `replacementAmounts`, statics.ts).
   */
  modify: {
    add?: Amount;
    times?: number;
    atLeast?: Amount;
    prevent?: boolean;
  };
  /** After a prevention: each opponent of the controller mills that many (The Mindskinner); reflexive ability
   * "when damage is prevented this way" (New Way Forward: `amount.eventAmount` and `ref.eventObject`, the source);
   * that many counters of this type on the replacement's source, in the same replacement (Anti-Venom), or on the
   * permanent that would have been dealt the damage (`countersOnDamaged`: Vigor). */
  onPrevent?: { opponentsMill?: boolean; reflexive?: Effect[]; counters?: string; countersOnDamaged?: string };
  /** Damage: dealt instead to the permanent the source is attached to (`attached`: With Great Power) or to the source
   * itself (`source`: Ancient Adamantoise). */
  redirectTo?: "attached" | "source";
  /** Shield: only this source, chosen at creation (`sourceDefIs` for a spell without an object). */
  sourceIs?: ObjectId;
  /** Set by the engine (`fx.shield`, `ops/damage.ts`), never by a card: the definition of `sourceIs`. */
  sourceDefIs?: string;
  /** Shield: the object that created it (source of the reflexive ability). */
  origin?: { id: ObjectId; defId: string };
  /**
   * `untap`: only during the untap step of the permanent's controller (502.3, "doesn't untap during
   * its controller's untap step"); `"may"`: its controller chooses whether to untap it (Hedge Whisperer:
   * "you may choose not to untap this creature during your untap step"). Without this field, it can't
   * become untapped at all (Blossombind).
   */
  untapStep?: true | "may";
}

/** Replacement of a numeric event printed on a permanent ("if a source you control would…"). */
export interface EventReplacementAbilityDef extends EventReplacement {
  kind: "eventReplacement";
  condition?: Condition;
  label?: string;
}

/** "You may cast spells as though they had flash." */
export interface CastPermissionAbilityDef {
  kind: "castPermission";
  /** "You may cast spells as though they had flash." */
  flash?: true;
  /**
   * Spells without paying their mana cost: `hand`, those from your hand (Omniscience); `exile`, those cast from exile
   * (Warped Space, with `freeOncePerTurn`); `any`, from any zone you can cast them from (Dracogenesis, As Foretold).
   */
  freeFrom?: "hand" | "exile" | "any";
  /** Only matching spells (Dracogenesis: "you may cast Dragon spells without paying"). */
  freeFilter?: ObjectFilter;
  /** Once each turn (Zaffai and the Tempests); `condition`: only when it's met (during your turn). */
  freeOncePerTurn?: true;
  condition?: Condition;
  /** Tinybones: during your turn, play the cards exiled with a stash counter that you don't own (mana of any type). */
  stash?: true;
  /** Muldrotha: during your turn, a land and a permanent spell of each type from your graveyard. */
  graveyardPermanentTypes?: true;
  label?: string;
}

/**
 * "The next [matching] spell you cast this turn…" (family N, R4.6): copied (Teach by Example),
 * can't be countered (Theorist's Proxy), with counters or haste on entering (Summon: Fenrir).
 */
export interface NextSpell {
  filter?: ObjectFilter;
  copy?: boolean;
  /** With `copy`: the copy isn't legendary (copy exception, 707.9b; The Clone Saga). */
  nonlegendary?: boolean;
  /** Reduction of the generic cost of that spell (Don & Raph: affinity for artifacts, `amount.count(…)`). */
  reduce?: Amount;
  uncounterable?: boolean;
  /** "… may be cast without paying its mana cost", from any zone (World War Hulk); consumed even if paid. */
  free?: boolean;
  counters?: number;
  haste?: boolean;
  /** Triggered ability "when you cast [that spell]" (Codie, Vociferous Codex); the spell is `ref.target("s")`. */
  trigger?: Effect[];
}

/**
 * Casting restriction (family D, R4.5), seen from the player who has the static ability: who is concerned, when, and
 * what is forbidden (all spells, beyond N per turn, or those cast from anywhere other than hand).
 */
export interface CastLimit {
  who: "you" | "opponents" | "each";
  /** Only during the turn of the static ability's player, or during combat. */
  during?: "yourTurn" | "combat";
  /** Only the opponents who attacked the static ability's player this turn (Sandswirl Wanderglyph). */
  attackedYou?: boolean;
  /** At most N spells per turn (High Noon: 1). */
  maxSpells?: number;
  /** Only spells of these types, counted by themselves (Deafening Silence: one noncreature spell per turn). */
  spellTypes?: { types?: CardType[]; notTypes?: CardType[] };
  /** Only spells cast from anywhere other than hand (Avatar's Wrath). */
  exceptFromHand?: boolean;
  /** Spells can be cast only any time you could cast a sorcery (Teferi, Mage of Zhalfir). */
  sorceryTiming?: boolean;
  /** Only turning permanents face up (Karlov Watchdog): neither spells nor abilities are blocked. */
  faceUp?: boolean;
  /**
   * Also blocks activated abilities: all but mana abilities (Yuriko), or those of artifacts, creatures and enchantments,
   * mana abilities included (Grand Abolisher).
   */
  abilities?: "all" | "artifactsCreaturesEnchantments";
}

/**
 * Modified triggers (family G, R4.5): one more time (Fractured Realm, Starfield Vocalist, Annie Joins Up,
 * Roaming Throne, Traveling Chocobo) or never (Torpor Orb, Karn, Argent Defender).
 */
export interface TriggerMod {
  effect: "again" | "none";
  /**
   * Only triggers caused by an event: `enter`, a permanent entering, matching `entering`;
   * `attack`, a creature attacking ("whenever … attacks", "… you attack with"); `dies`, a creature
   * dying (The Masamune); `draw`, a card being drawn, by any player (Krang, the All-Powerful).
   */
  on?: "enter" | "attack" | "dies" | "draw";
  entering?: ObjectFilter;
  /**
   * Abilities concerned: those of matching permanents (by default, your permanents). `attached: "host"`: the
   * permanent the static ability's source is attached to, even if it has just left the battlefield. With
   * `effect: "none"`: the permanents whose entering doesn't trigger abilities (Elesh Norn, Mother of Machines:
   * `controller: "opponent"`).
   */
  sources?: ObjectFilter;
  /** Also the abilities of your emblems (The Masamune: "… or an emblem you own"). */
  emblems?: boolean;
  /** Concerns the abilities of all players (Torpor Orb). */
  everyone?: boolean;
}

/**
 * Cost modifier of activated abilities (family A, R4.4): {N} less, or {0} for the first one this turn.
 */
export interface AbilityCostMod {
  /** Abilities concerned: exhaust, Equip, unlock a door, plot…; otherwise all. */
  ability?: AbilityKind;
  /** Sources concerned (Mutagen Man: your artifact tokens). */
  source?: ObjectFilter;
  /** Not the abilities of the static ability's source (Boom Scholar: "your other permanents"). */
  notSelf?: boolean;
  /**
   * {N} less; a variable quantity is evaluated for the static ability's source (Agatha of the Vile Cauldron: its
   * power). `minOneMana`: the mana cost doesn't go below one mana.
   */
  reduce?: number | Amount;
  minOneMana?: boolean;
  /**
   * "You may pay {0} rather than pay the [equip] cost" (Kíli the Resourceful): the whole cost, mana and other costs,
   * becomes nothing (always used: an automatic choice).
   */
  free?: boolean;
  /**
   * Mana is spent on these abilities as though it were mana of any type (Agatha's Soul Cauldron: abilities
   * of creatures you control).
   */
  anyMana?: boolean;
}

/**
 * Permission to play from a zone (family C, R4.4): the cards of its graveyard or the top card of its
 * library, matching the filter, may be played (lands) or cast (spells), with possible additional costs or
 * effects. `linked`: the exiled cards linked to the source (`GameObject.linked`), of any owner unless the filter
 * has `owner` (Null Summoner, Intrepid Paleontologist, Taster of Wares, Maralen, Hama, Valgavoth…).
 */
export interface PlayFromZone {
  zone: "graveyard" | "libraryTop" | "linked";
  /** Read by `matchesCard` ("you own": `owner`; "exiled this turn": `enteredThisTurn`). */
  filter?: ObjectFilter;
  /** Mana value at most this amount, evaluated for the source (Maralen: your Elves and Faeries). */
  maxManaValue?: Amount;
  /** Without paying its mana cost (Maralen). */
  free?: boolean;
  /** By waterbending {X} rather than paying its mana cost, X being its mana value (Hama, the Bloodbender). */
  waterbend?: boolean;
  /** By also removing N counters from among creatures you control (Dawnhand Dissident). */
  removeCountersAmong?: number;
  /** Lands, spells, or both (by default). */
  what?: "lands" | "spells";
  /** Additional life paid (Noctis, Festival of Embers). */
  payLife?: number;
  /** Additional forage (Osteomancer Adept). */
  forage?: boolean;
  /** Escape (702.138) granted: also exile N other cards from your graveyard (Underworld Breach: 3). */
  exileOthers?: number;
  /** The permanent enters with a finality counter. */
  finality?: boolean;
  /** Mana of any type (Vizier of the Menagerie). */
  anyMana?: boolean;
  /** Additional subtypes on entering (The Tomb of Aclazotz: Vampire). */
  addSubtypes?: string[];
  /** Once each turn (Johann, Apprentice Sorcerer); `onceKey`: set by the engine, the permission used. */
  oncePerTurn?: boolean;
  onceKey?: string;
  /**
   * The card has flashback (Iroh, Grand Lotus): cast from the graveyard, then exiled; its cost is `cost`, otherwise
   * its mana cost.
   */
  flashback?: boolean;
  /** A creature spell cast this way enters with N additional +1/+1 counters (Mikey & Don, Party Planners). */
  counters?: number;
  /** Sneak granted (Ninja Teen: "creature cards in your graveyard have sneak {3}{B}"): the card is
   * cast for this cost during the sneak window, by returning an unblocked attacker. */
  sneak?: ManaCost;
  /** "Pay life equal to its mana value rather than pay its mana cost" (Gwenom, Remorseless; Valgavoth, Terror Eater). */
  payLifeManaValue?: boolean;
  /** The card has mayhem (Goblin Formula): cast from the graveyard for its mayhem cost, its mana cost, if it was
   * discarded this turn. */
  mayhem?: boolean;
  cost?: ManaCost;
}

/** Static ability that applies to players (hexproof, "can't lose"…). */
export interface PlayerStaticAbilityDef {
  /** Also works from the command zone (113.6; eminence: The Ur-Dragon). */
  fromCommand?: boolean;
  /** Play or cast cards from the graveyard or the top of the library (family C, R4.4). */
  playFrom?: PlayFromZone;
  /** Cost of activated abilities modified (family A, R4.4). */
  abilityCost?: AbilityCostMod;
  /** Restriction on casting spells (and activating abilities) (family D, R4.5). */
  castLimit?: CastLimit;
  /**
   * Cost of matching spells: {N} less (`reduce`, Goblin Maskmaker: "face-down spells you cast this
   * turn"); mana is spent as though it were mana of any color (`anyMana`, Case File Auditor); fewer
   * colored symbols (`colored`, Aang, Master of Elements: "{W}{U}{B}{R}{G} less"), each removing
   * a symbol of its color, otherwise {1} of the generic (601.2f). An amount `reduce` of an effect is frozen as it
   * resolves ("cost {X} less this turn, where X is …": Will, Scion of Peace).
   */
  spellCost?: { filter: ObjectFilter; reduce?: Amount; anyMana?: boolean; colored?: ManaCost["colored"] };
  /** Triggers doubled or suppressed (family G, R4.5). */
  triggerMod?: TriggerMod;
  /** Replacement or prevention of a numeric event, set by an effect (families E and F, R1). */
  replacement?: EventReplacement;
  /** "The next spell you cast this turn…" (family N, R4.6), set by a single-use effect. */
  nextSpell?: NextSpell;
  kind: "playerStatic";
  /** Hall of Echoes: the legend rule doesn't apply to your permanents; only to these (Spider-Verse: your
   * Spiders). */
  noLegendRule?: boolean | ObjectFilter;
  /**
   * Opposition Agent (with `affects: "opponents"`): the source's controller controls the affected players while they
   * search their library (they choose what is found), and the cards found are exiled, linked to the source.
   */
  searchControl?: boolean;
  /**
   * The Master, Multiplied: "triggered abilities you control can't cause you to sacrifice or exile creature tokens you
   * control" (read by `tokenShielded`).
   */
  tokenShield?: boolean;
  /** Jace's Machinations: loyalty abilities of your Jaces at instant speed. */
  jaceLoyaltyInstant?: boolean;
  /**
   * "Can't gain life" (119.7): Screaming Nemesis (effect), Rampaging Ferocidon (`affects: "each"`),
   * Archfiend of Despair (`affects: "opponents"`), Grievous Wound (`affects: "enchanted"`). A "can't" wins (101.2): no replacement of the gain applies then
   * (neither "that much plus N" nor "twice that much"), and nothing triggers.
   */
  cantGainLife?: boolean;
  /** K'rrik: each symbol of this color in your costs can also be paid with 2 life (Phyrexian mana, 107.4f). */
  phyrexianMana?: ManaType;
  /** Pit Automaton: your next exhaust ability is copied (single use). */
  copyNextExhaust?: boolean;
  /**
   * This player's creatures can't attack `of` or their planeswalkers (Sandswirl Wanderglyph); with `subtype`,
   * only their planeswalkers of that subtype (Jace, Multiverse Architect: "your Jaces"). In an effect
   * (`fx.thisTurn`), `"you"` designates the controller of the effect, fixed on resolution. Read by `attackableDefenders`.
   */
  cantAttack?: { of: PlayerId; subtype?: string };
  /** "You have hexproof"; a filter: only against these sources (Veil of Summer: blue and black). */
  hexproof?: boolean | ObjectFilter;
  /**
   * `true`: "you can't lose the game and your opponents can't win the game" (Herald of Eternal Dawn,
   * Angel's Grace); `"life"`: you don't lose the game for having 0 or less life (Marina Vendrell's
   * Grimoire, Phyrexian Unlife). Read by `cantLose` (statics.ts).
   */
  cantLose?: true | "life";
  /** "You gain life rather than lose life from radiation" (Strong, the Brutish Thespian). */
  radiationGains?: boolean;
  /** Keywords of matching spells the player controls (Lo and Li: "your Lesson spells have lifelink"). */
  spellKeywords?: { filter: ObjectFilter; keywords: Keyword[] };
  /**
   * Unspent mana (500.4): these types don't empty at the end of steps and phases (The Last Agni Kai, set by
   * `fx.thisTurn`); `becomes`: it becomes this type instead of emptying (Ozai, the Phoenix King).
   */
  keepUnspentMana?: { types?: ManaType[]; becomes?: ManaType };
  /** "You may play an additional land on each of your turns." */
  extraLands?: number;
  /** "Lands you control enter untapped" (The Wandering Minstrel). */
  landsEnterUntapped?: boolean;
  /**
   * Player protection (702.16): from each of their opponents (`opponents`, Absolute Virtue) or from everything
   * (`everything`, 702.16j: Teferi's Protection, The One Ring). The player can't be targeted by spells and
   * abilities of those sources, and damage they would deal to them is prevented; they can be attacked.
   */
  /** A filter: protection from the sources matching it (Serra's Emissary: the chosen card type). */
  protection?: "opponents" | "everything" | ObjectFilter;
  /** "The first time you flip coins each turn, you win those flips" (Edgar, King of Figaro). */
  winFirstCoinFlips?: boolean;
  /**
   * "[Spells] you control can't be countered" (`filter`: instants and sorceries, Sphinx of the
   * Final Word; creatures, Frenzied Baloth; absent: all, Chimil); `abilities`: abilities neither; `everyone`:
   * those of all players (Spider-Punk: "spells and abilities can't be countered").
   */
  uncounterable?: { filter?: ObjectFilter; abilities?: boolean; everyone?: boolean };
  /** Weftwalking (applies to everyone): each player's first spell during their turn may be cast without paying. */
  firstSpellFree?: boolean;
  /** Tannuk, Steadfast Second: cards in your hand matching the filter have warp at this cost. */
  grantWarp?: { filter: ObjectFilter; cost: ManaCost };
  /**
   * At most one creature can attack each combat: each of your planeswalkers (`walkers`, Tomik, Orzhov Lawmage) or
   * you (`you`, Mirri, Weatherlight Duelist, as long as it's tapped).
   */
  maxOneAttacker?: "walkers" | "you";
  /** Mirri, Weatherlight Duelist (set by `fx.thisTurn` on the opponents): this player blocks with at most N creatures. */
  maxBlockingCreatures?: number;
  /** "Max speed — …": the ability applies only if the condition is met. */
  condition?: Condition;
  /**
   * Players concerned: its controller (by default), their opponents, each player ("players can't…"), or
   * the player the source enchants (`enchanted`, Grievous Wound: "enchanted player can't…").
   */
  affects?: "opponents" | "each" | "enchanted";
  /**
   * Hidden information the player may look at any time: the top card of their library (`libraryTop`,
   * Vizier of the Menagerie) or their opponents' face-down creatures (`faceDown`, Found Footage). Read by
   * `mayLookAt` (statics.ts).
   */
  lookAt?: "libraryTop" | "faceDown";
  /**
   * Attack tax: creatures can't attack you unless their controller pays {N} for each (Propaganda: not
   * attacks on your planeswalkers); `defending: "youOrYourPlaneswalkers"`: you or your planeswalkers (Archangel of
   * Tithes).
   */
  attackTax?: number | { amount: number; defending: "youOrYourPlaneswalkers" };
  /** Archangel of Tithes (attacking): opposing creatures block only if their controller pays {1} for each. */
  blockTax?: number;
  /** Terror of the Peaks: spells opponents cast that target this creature cost N more life. */
  targetLifeTax?: number;
  /** Elvish Refueler: during your turn, as long as no exhaust ability has been activated, they can be activated again. */
  exhaustReuse?: boolean;
  /** Shang-Chi: abilities of matching creatures are activated as though they had haste (not attacking). */
  activateAsThoughHaste?: ObjectFilter;
  /** Wonder Man, Hollywood Hero: each power-up of your permanents may be activated N more times. */
  powerUpExtraUses?: number;
  /**
   * What the player skips (500.11): their next turn (`turn`, Ral Zarek: one effect per skipped turn, consumed), their
   * draw step (`drawStep`, Necropotence, Necrodominance) or the extra turns they would begin
   * (`extraTurns`, Trouble in Pairs with `affects: "opponents"`). Read by `skips` (statics.ts).
   */
  skips?: "turn" | "drawStep" | "extraTurns";
  /** Library of Leng: a card discarded by an effect may be put on top of your library. */
  discardToLibraryTop?: boolean;
  /** Notion Thief: an opponent who draws (except the first card of their draw step) doesn't draw; you draw. */
  stealsOpponentDraws?: boolean;
  /** Sanctum Lurker: your planeswalkers aren't put into the graveyard for lack of loyalty. */
  walkersSurviveZeroLoyalty?: boolean;
  /**
   * Your matching permanents untap during each other player's untap step: your creatures (Prop
   * Room), your artifacts (Unwinding Clock).
   */
  untapOnOthersUntap?: ObjectFilter;
  /** Nowhere to Run: opposing creatures can be targeted despite hexproof; their ward doesn't trigger. */
  ignoreOpponentsHexproofWard?: boolean;
  /** Leyline of Mutation: alternative cost for all your spells. */
  /**
   * Alternative cost of your spells: a mana cost (Leyline of Mutation: {W}{U}{B}{R}{G}) or collect evidence N
   * (Conspiracy Unraveler: 10) "rather than pay the mana cost"; only the spells matching `filter`, and
   * with `webSlinging` by returning a tapped creature (Amazing Spider-Man: "Web-slinging {G}{W}{U}").
   */
  /**
   * `blitz` (702.152): the spell's own mana cost, reduced by `reduce` generic mana (Henzie "Toolbox" Torre: the
   * commander casts); the creature gains haste and "when it dies, draw a card", and is sacrificed at the next end step.
   */
  altCostAll?: {
    mana?: ManaCost;
    collectEvidence?: number;
    filter?: ObjectFilter;
    webSlinging?: boolean;
    blitz?: { reduce?: Amount };
  };
  /**
   * Maximum hand size (402.2), evaluated for the source's controller: Necrodominance (5), Winter, Misanthropic
   * Guide (`affects: "opponents"`); `"none"`: "you have no maximum hand size". Rule-changing effects,
   * applied in timestamp order (613.11, `maxHandSize` of turn.ts).
   */
  maxHandSize?: Amount | "none";
  /** Phyrexian Unlife: as long as you have 0 or less life, damage is dealt to you as though its source had infect. */
  infectDamageAtZeroLife?: boolean;
  /** Angel's Grace: damage that would reduce your life total below N reduces it to N instead. */
  damageLifeFloor?: number;
  /** Laboratory Maniac: if you would draw a card from an empty library, you win the game instead. */
  winOnEmptyDraw?: boolean;
  /** Ground Seal (`affects: "each"`): cards in graveyards can't be the targets of your spells and abilities. */
  cantTargetGraveyardCards?: boolean;
  /**
   * Damage can't be prevented (all players): all of it (`true`, Sunspine Lynx) or combat damage
   * (`"combat"`, Frenzied Baloth). Read by `damageUnpreventable` (statics.ts).
   */
  damageUnpreventable?: true | "combat";
  label?: string;
}

/** Static prevention: "prevent all [noncombat] damage that would be dealt to [filter]." */
export interface PreventionAbilityDef {
  kind: "prevention";
  filter: ObjectFilter;
  noncombatOnly?: boolean;
  combatOnly?: boolean;
  /** Prevents instead the damage dealt by matching sources (Fog Bank: `{ self: true }`). */
  source?: ObjectFilter;
  label?: string;
}

/** Doubling replacements (614.1a): tokens, counters, damage dealt to opponents. */

/** Static ability: generates a continuous effect as long as the source is on the battlefield (604, 611.3). */
export interface StaticAbilityDef {
  kind: "static";
  /** Also works from the command zone (113.6; eminence, Commander). */
  fromCommand?: boolean;
  /** Works only from its owner's graveyard (113.6: Anger, "as long as this card is in your graveyard"). */
  fromGraveyard?: boolean;
  /**
   * "self": the source itself; "attached": the permanent the source is attached to
   * ("equipped / enchanted creature"); otherwise the permanents matching the filter (seen from the controller).
   */
  affects: "self" | "attached" | ObjectFilter;
  /** "as long as…" */
  condition?: Condition;
  mods: LayerMods;
  /** P/T multiplied by the number of matching permanents ("+1/+1 for each Forest you control"). */
  per?: ObjectFilter;
  /** P/T multiplied by the number of counters of this type on the source (Banner of Kinship; `"any"`: all kinds, Hancock). */
  perCounter?: string;
  /** P/T multiplied by the number of cards in the controller's graveyard matching the filter (Winter). */
  perGraveyard?: ObjectFilter;
  /** P/T multiplied by the controller's life total (The Last Ride). */
  perLife?: boolean;
  /** P/T multiplied by the number of cards in the controller's hand (Stingerback Terror). */
  perHand?: boolean;
  /**
   * P/T multiplied by an amount computed like a P/T defined by an ability (Earthen Ally: "for each color
   * among Allies you control"): amounts readable during the layers (`colorsAmong`, `count`, the turn log, speed, `div`…).
   */
  perAmount?: Amount;
  label?: string;
}

export interface TriggeredAbilityDef {
  kind: "triggered";
  trigger: TriggerSpec;
  /** Condition checked on triggering and on resolution. */
  condition?: Condition;
  /**
   * Condition of the trigger itself, checked on triggering only ("when you cast this spell while you control a
   * creature", Social Snub): it isn't an "if" (603.4), the resolution doesn't check it again.
   */
  triggerCondition?: Condition;
  targets: TargetSpec[];
  effects: Effect[];
  /** Modal ability ("choose one —"): the mode is chosen as it's put on the stack. */
  modes?: ModeDef[];
  /** "This ability triggers only once each turn."; `ifDone`: "do this only once each turn" (it
   * triggers as long as the effect hasn't been done, `fx.doneOncePerTurn` records it; Spider-Verse); `firstEvent`: "… for the
   * first time each turn" (recorded at the first event, even if the "if …" condition isn't met, 603.4:
   * Fear of Missing Out). */
  oncePerTurn?: boolean | "ifDone" | "firstEvent";
  /** Triggers from its owner's graveyard (Flamewake Phoenix). */
  fromGraveyard?: boolean;
  /**
   * Also works from the command zone (113.6; eminence, Commander: "if [this commander] is in the command zone
   * or on the battlefield").
   */
  fromCommand?: boolean;
  /** "Choose a mode that hasn't been chosen" (Demonic Pact); `turn`: this turn (Monument to Endurance). */
  uniqueModes?: boolean | "turn";
  /** "one or more …": a single pending occurrence at a time (same batch of events). */
  batched?: boolean;
  /** Ward (702.21): Nowhere to Run prevents it from triggering. */
  ward?: boolean;
  label?: string;
}
export interface TokenSpec {
  name: string;
  colors: Color[];
  types: CardType[];
  subtypes: string[];
  power?: number;
  toughness?: number;
  keywords?: Keyword[];
  abilities?: AbilityDef[];
  text?: string;
  legendary?: boolean;
  tapped?: boolean;
  /** P/T defined by an ability (Beau: the number of lands you control). */
  cdaPT?: Amount;
  /** Aura token (Roles of Wilds of Eldraine): what it can enchant. */
  enchant?: CardDef["enchant"];
  /** Toxic N (702.164). */
  toxic?: number;
}

/** Destination of an object move. */
export interface MoveSpec {
  /** `command`: its owner's command zone (Hellkite Courser: "return it to the command zone"). */
  to: "hand" | "battlefield" | "graveyard" | "exile" | "libraryTop" | "libraryBottom" | "command";
  /** Exiled by warp: castable from exile on a later turn (`exiledVia` of kind `warp`). */
  warp?: boolean;
  tapped?: boolean;
  /** On the battlefield: under the control of the effect's controller (otherwise of the owner). */
  underYourControl?: boolean;
  /** Counters put on entering (614.1c) or on the exiled card; "with X counters": an amount. */
  counters?: { kind: string; n: Amount };
  /** Types and subtypes added to the object ("it's a Demon in addition to its other types"). */
  addTypes?: CardType[];
  addSubtypes?: string[];
  addKeywords?: Keyword[];
  /** Types and subtypes replaced ("it's an enchantment; it's not a creature", Duskmourn). */
  setTypes?: CardType[];
  setSubtypes?: string[];
  /** Other modifications in place as it enters ("it's a 1/1 Spirit creature", Abuelo's Awakening: its base P/T). */
  mods?: LayerMods;
  /** Enters transformed (back face of a double-faced card). */
  transformed?: boolean;
  /**
   * Tapped and attacking (508.4): what its controller chooses among their opponents and their planeswalkers (Chorale of the
   * Void), or the designated player or planeswalker (Shark Shredder: "that player"; ninjutsu: `ref.cost("defender")`).
   */
  attacking?: boolean | Ref;
  /** With `libraryTop`: Nth from the top (Riptide Gearhulk: 3). */
  fromTop?: number;
  /** With `libraryTop`: "shuffle it into its owner's library"; with `libraryBottom`: "on the bottom in a random order". */
  shuffle?: boolean;
  /**
   * Exiled face down (406.3): who may look at it — the effect's controller ("you may look at it"), its
   * owner (foretell) or nobody (Doomsday Excruciator).
   */
  faceDown?: "you" | "owner" | "nobody";
  /**
   * On the battlefield face down, 2/2: cloaked (`cloak`, 701.58: with ward {2}, under the control
   * of the effect's controller; Vannifar) or manifested (`manifest`, 701.40: under its owner's control, unless
   * `underYourControl`; Kozilek, the Broken Reality: from hand).
   */
  as?: "cloak" | "manifest";
  /** On the battlefield: if it would leave, it is exiled instead (unearth, 702.84a). */
  exileIfLeaves?: boolean;
}
