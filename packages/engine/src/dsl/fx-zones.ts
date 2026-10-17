import { msg } from "../text";
import type { Amount, CardType, Effect, MoveSpec, ObjectFilter, Ref } from "../types";
import { ref } from "./refs";
import { allMatching } from "./shared";

/** Options of a search (`fx.search`, `fx.searchHold`). */
interface SearchOpts {
  alsoFrom?: ("graveyard" | "hand" | "sideboard")[];
  each?: ObjectFilter[];
  reveal?: boolean;
  distinctNames?: boolean;
}

const searchOpts = (o: SearchOpts): Partial<Extract<Effect, { op: "search" }>> => ({
  ...(o.alsoFrom?.length ? { alsoFrom: o.alsoFrom } : {}),
  ...(o.each ? { each: o.each, count: o.each.length } : {}),
  ...(o.reveal ? { reveal: true } : {}),
  ...(o.distinctNames ? { distinctNames: true } : {}),
});

/** `fx` builders (dsl.ts) of zones: moving, destroying, sacrificing, exiling, milling, searching, looking at and revealing cards (`ops/zones.ts`). */
export const zonesFx = {
  destroy: (what: Ref, store?: string): Effect => ({ op: "destroy", what, store }),
  tapChosen: (filter: ObjectFilter, store: string, opts: { exactly?: number; sharesColorWith?: Ref } = {}): Effect => ({
    op: "tapChosen",
    filter: opts.sharesColorWith ? { ...filter, shares: { what: "color", with: opts.sharesColorWith } } : filter,
    store,
    ...(opts.exactly !== undefined ? { exactly: opts.exactly } : {}),
  }),
  millWhileShared: { op: "millWhileShared", draw: true } as Effect,
  /** "[The player] mills two cards; if two [nonland] cards that share a color were milled, repeat." */
  millWhileSharingColor: (who: Ref, nonland = false): Effect => ({
    op: "millWhileShared",
    who,
    share: "color",
    ...(nonland ? { nonland } : {}),
  }),
  bounce: (what: Ref): Effect => ({ op: "bounce", what }),
  /** Airbend: exiles; its owner may cast it for {2} as long as it remains exiled. */
  airbend: (what: Ref): Effect => ({ op: "airbend", what }),
  /**
   * "Keep the chosen permanents": for each player of `who` (APNAP order), permanents they control are chosen (`pick`), by
   * them (`chooser: "each"`, the default) or by you (`"you"`); then their other permanents of the filter are sacrificed
   * (`fate`, the default) or destroyed, all at the same time. `among`: those that can be chosen (the filter by default);
   * `max`: the total power of `"totalPower"`.
   */
  keep: (
    who: Ref,
    pick: "one" | "onePerType" | "totalPower" | "sharesType",
    filter: ObjectFilter,
    opts: { chooser?: "each" | "you"; fate?: "sacrifice" | "destroy"; among?: ObjectFilter; max?: Amount } = {},
  ): Effect => ({
    op: "keep",
    who,
    chooser: opts.chooser ?? "each",
    pick,
    filter,
    fate: opts.fate ?? "sacrifice",
    ...(opts.among ? { among: opts.among } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
  }),
  exile: (what: Ref): Effect => ({ op: "exile", what }),
  mill: (n: Amount, who: Ref = ref.you, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "mill",
    who,
    amount: n,
    store,
  }),
  /** Each designated player mills half their library, rounded down. */
  /** "Half their library", rounded down (or up: `roundUp`). */
  millHalf: (who: Ref, roundUp = false): Effect => ({ op: "mill", who, amount: 0, halfLibrary: roundUp ? "up" : true }),
  /** Each designated player mills as many cards as there are in their graveyard. */
  millGraveyardSize: (who: Ref): Effect => ({ op: "mill", who, amount: 0, graveyardSize: true }),
  scry: (n: Amount, who?: Ref): Effect => ({ op: "scry", amount: n, ...(who ? { who } : {}) }),
  surveil: (n: Amount, toHand?: { filter?: ObjectFilter; maxManaValue?: Amount }, store?: string): Effect => ({
    op: "surveil",
    amount: n,
    toHand,
    store,
  }),
  discard: (
    n: Amount,
    who: Ref = ref.you,
    opts: {
      filter?: ObjectFilter;
      chooser?: "controller";
      optional?: boolean;
      store?: string;
      random?: boolean;
      storeFilter?: ObjectFilter;
      unlessFilter?: ObjectFilter;
      exile?: boolean;
      half?: boolean;
      /** The player first reveals that many cards of their choice; the choice is made among them (Klaw). */
      reveal?: Amount;
    } = {},
  ): Effect => ({ op: "discard", who, amount: n, ...opts }),
  sacrifice: (
    who: Ref,
    filter: ObjectFilter,
    n: Amount = 1,
    opts: {
      optional?: boolean;
      store?: string;
      greatestManaValue?: boolean;
      greatestPower?: boolean;
      to?: "exile" | "hand";
      half?: boolean;
      exploit?: boolean;
    } = {},
  ): Effect => ({
    op: "sacrifice",
    who,
    filter,
    amount: n,
    ...opts,
  }),
  /** `anyNumber`: "put any number of those cards [to]", the controller chooses (the others join the rest). */
  revealUntilN: (
    filter: ObjectFilter,
    n: Amount,
    to?: MoveSpec,
    store?: string,
    who?: Ref,
    opts: { anyNumber?: boolean } = {},
  ): Effect => ({
    op: "revealUntilN",
    filter,
    n,
    to,
    store,
    ...(who ? { who } : {}),
    ...(opts.anyNumber ? { anyNumber: true } : {}),
  }),
  piles: (n: number, opts: { revealed?: boolean; storeGraveyard?: string; opponentSeparates?: boolean } = {}): Effect => ({
    op: "piles",
    n,
    ...opts,
  }),
  /** "Exile the top N cards"; `faceDown`: face down, and who can look at them (406.3). */
  exileTop: (who: Ref, n: Amount, store: string, faceDown?: MoveSpec["faceDown"]): Effect => ({
    op: "exileTop",
    who,
    n,
    store,
    ...(faceDown ? { faceDown } : {}),
  }),
  exileUntil: (filter: ObjectFilter, store: string): Effect => ({ op: "exileUntil", filter, store }),
  /** Each designated player exiles the top of their library until a total mana value of N or more. */
  exileUntilTotalManaValue: (who: Ref, n: number, store: string): Effect => ({
    op: "exileUntil",
    filter: {},
    store,
    who,
    untilTotalManaValue: n,
  }),
  flickerChosen: (filter: ObjectFilter, times: Amount): Effect => ({ op: "flickerChosen", filter, times }),
  exileNamed: (who: Ref, max: number): Effect => ({ op: "exileNamed", who, max }),
  /** Deadly Cover-Up: a card from an opponent's graveyard, and all cards with the same name (graveyard, hand, library). */
  exileNamesakes: { op: "exileNamesakes" } as Effect,
  /** The End: exiles the designated permanent and cards with the same name (graveyard, hand, library of its controller). */
  exileWithNamesakes: (of: Ref): Effect => ({ op: "exileNamesakes", of, draw: true }),
  /** Surgical Extraction: the designated graveyard card and cards with the same name (graveyard, hand, library of its owner). */
  exileCardAndNamesakes: (of: Ref): Effect => ({ op: "exileNamesakes", of }),
  /** Devour N (702.82, in `asEnters`); read from the text ("Devour 2"). */
  devour: (filter: ObjectFilter, n: number, opts: { graveyardUpToX?: boolean } = {}): Effect => ({
    op: "devour",
    filter,
    n,
    ...opts,
  }),
  exileFromOwnHand: (who: Ref, store: string): Effect => ({ op: "exileFromOwnHand", who, store }),
  /**
   * Manifest (701.40, under your control unless `ownerControl`: Yarus) or cloak (701.58, `ward`: 2/2 with ward {2})
   * the designated cards; `store`: the face-down creatures (Cryptic Coat: "then attach this Equipment to it").
   */
  putFaceDown: (what: Ref, ward = false, opts: { store?: string; ownerControl?: boolean } = {}): Effect => ({
    op: "moveTo",
    what,
    spec: {
      to: "battlefield",
      as: ward ? "cloak" : "manifest",
      ...(ward || opts.ownerControl ? {} : { underYourControl: true }),
    },
    ...(opts.store ? { store: { name: opts.store } } : {}),
  }),
  /** Cloak (701.58): face down, 2/2 with ward {2}; `store`: the creatures created this way. */
  cloak: (what: Ref, store?: string): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "battlefield", as: "cloak" },
    ...(store ? { store: { name: store } } : {}),
  }),
  manifestDread: { op: "manifestDread" } as Effect,
  revealFaceDown: (what: Ref): Effect => ({ op: "revealFaceDown", what }),
  /** "[That player] manifests dread [N times]"; `store`: the face-down creatures ("then attach this Equipment to it"). */
  manifestDreadBy: (opts: { who?: Ref; times?: Amount; store?: string }): Effect => ({ op: "manifestDread", ...opts }),
  /** "[creature] explores" (701.44), `times` times. */
  explore: (what: Ref = ref.self, times?: Amount): Effect => ({ op: "explore", what, times }),
  /** "[creature] connives" (701.50). */
  connive: (what: Ref = ref.self, n?: Amount): Effect => ({ op: "connive", what, ...(n !== undefined ? { n } : {}) }),
  /** `orExileStore`: otherwise (instant or sorcery), the card is exiled and stored (Etrata). */
  turnFaceUp: (what: Ref, orExileStore?: string): Effect => ({
    op: "turnFaceUp",
    what,
    ...(orExileStore ? { orExileCast: true, store: orExileStore } : {}),
  }),
  /** "Transform [this permanent]" (front ↔ back). */
  /** `may`: "you may transform it" (asked only for a double-faced permanent). */
  transform: (what: Ref = ref.self, may = false): Effect => ({ op: "transform", what, ...(may ? { may } : {}) }),
  /** "Exile them, then meld them": the source and a permanent named `with`, into their melded card. */
  meld: (withName: string): Effect => ({ op: "meld", with: withName }),
  untapUpTo: (filter: ObjectFilter, n: number): Effect => ({ op: "untapUpTo", filter, n }),
  /** Destroys the object and all other permanents with the same name (Maelstrom Pulse). */
  destroySameName: (what: Ref): Effect => ({ op: "destroy", what: { kind: "sameName", ref: what, zone: "battlefield" } }),
  /**
   * Steel Hellkite: "destroy each nonland permanent with mana value X whose controller was dealt combat damage by this
   * creature this turn" (the turn log, damage dealt by the source).
   */
  hellkite: {
    op: "destroy",
    what: {
      kind: "zone",
      zone: "battlefield",
      who: {
        kind: "playersWhere",
        of: { kind: "eachPlayer" },
        where: {
          kind: "amountAtLeast",
          amount: { kind: "turnEvents", query: { event: "damage", who: "you", combat: true, toPlayer: true, self: "source" } },
          n: 1,
        },
      },
      filter: { notTypes: ["Land"], compare: [{ what: "manaValue", cmp: "=", to: { kind: "x" } }] },
    },
  } as Effect,
  /** "That player chooses one of them": `ref.stored(store)` the chosen one, `ref.stored(store + "Rest")` the others. */
  chooseAmong: (
    what: Ref,
    chooser: Ref,
    store: string,
    opts: {
      anyNumber?: boolean;
      max?: number;
      anyZone?: boolean;
      prompt?: string;
      optional?: boolean;
      random?: boolean;
      suggest?: "manaValue";
    } = {},
  ): Effect => ({
    op: "chooseAmong",
    what,
    chooser,
    store,
    ...opts,
  }),
  /**
   * "Choose an opponent" ("another player"), without targeting: the controller chooses, or chance (`random`);
   * `ref.stored(store)` designates them afterwards. No question with a single opponent; suggestion: the next opponent in
   * turn order.
   */
  chooseOpponent: (store: string, opts: { random?: boolean; prompt?: string } = {}): Effect => ({
    op: "chooseAmong",
    what: { kind: "eachOpponent" },
    chooser: { kind: "you" },
    store,
    prompt: opts.prompt ?? msg("Choose an opponent"),
    ...(opts.random ? { random: true } : {}),
  }),
  exileFromHandLinked: (who: Ref, filter: ObjectFilter, untilLeaves?: boolean, reveal?: Amount, optional?: boolean): Effect => ({
    op: "exileFromHandLinked",
    who,
    filter,
    untilLeaves,
    reveal,
    ...(optional ? { optional } : {}),
  }),
  /** Exiles face down (nobody looks at them) the whole library except the bottom `keep` cards. */
  exileLibraryButBottom: (who: Ref, keep = 1): Effect => ({ op: "exileTop", who, allBut: keep, faceDown: "nobody" }),
  tap: (what: Ref): Effect => ({ op: "tap", what }),
  /** "Look at [these cards]" (only the controller sees them); `random`: that many at random ("a card at random"). */
  look: (what: Ref, random?: number): Effect => ({ op: "look", what, ...(random !== undefined ? { random } : {}) }),
  /** "Reveal [these cards]": shown to all players. */
  reveal: (what: Ref): Effect => ({ op: "look", what, reveal: true }),
  /** Soulbond (702.95): pairs the two creatures. */
  pair: (what: Ref, withRef: Ref): Effect => ({ op: "pair", what, with: withRef }),
  /** "Remove [the creature] from combat" (506.4). */
  removeFromCombat: (what: Ref): Effect => ({ op: "removeFromCombat", what }),
  untap: (what: Ref): Effect => ({ op: "tap", what, untap: true }),
  destroyAll: (filter: ObjectFilter, store?: string, noRegenerate?: boolean): Effect => ({
    op: "destroy",
    what: allMatching(filter),
    store,
    ...(noRegenerate ? { noRegenerate } : {}),
  }),
  sacrificeIt: (what: Ref): Effect => ({ op: "sacrificeIt", what }),
  moveTo: (what: Ref, spec: MoveSpec, store?: { name: string; filter?: ObjectFilter }, attachTo?: Ref): Effect => ({
    op: "moveTo",
    what,
    spec,
    store,
    ...(attachTo ? { attachTo } : {}),
  }),
  /** Returns to hand (from any zone). */
  toHand: (what: Ref): Effect => ({ op: "moveTo", what, spec: { to: "hand" } }),
  /** Puts onto the battlefield (from the graveyard, exile…). */
  toBattlefield: (what: Ref, spec: Omit<MoveSpec, "to"> = {}): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "battlefield", ...spec },
  }),
  exileCard: (what: Ref, store?: { name: string; filter?: ObjectFilter }): Effect => ({
    op: "moveTo",
    what,
    spec: { to: "exile" },
    store,
  }),
  moveAll: (
    from: "battlefield" | "graveyard" | "hand",
    whose: Ref,
    filter: ObjectFilter,
    spec: MoveSpec,
    store?: string,
  ): Effect => ({
    store,
    op: "moveAll",
    from,
    whose,
    filter,
    spec,
  }),
  shuffle: (who: Ref = ref.you): Effect => ({ op: "shuffle", who }),
  lookAtTop: (
    n: Amount,
    opts: {
      filter?: ObjectFilter;
      count?: Amount;
      to?: MoveSpec;
      /** `reorder`: the rest is put back on top in the order of your choice; `top`: it stays there, in the same order. */
      rest?: "bottom" | "graveyard" | "top" | "reorder" | "hand";
      maxManaValue?: Amount;
      maxTotalManaValue?: number;
      store?: string;
      /** Exactly `count` cards ("put one of them into your hand"), not "up to". */
      exact?: boolean;
      /** Another player's library (Black Cat: a targeted opponent). */
      who?: Ref;
      /** The cards taken are picked at random (Getaway Barrel). */
      random?: boolean;
      /** One card per card type at most (Atraxa, Grand Unifier); a list: only those types count. */
      onePerType?: boolean | CardType[];
      /** The cards taken have different powers (Rip, Spawn Hunter). */
      distinctPower?: boolean;
      /** The owner of the library chooses ("each player looks at …", with `who`). */
      chooser?: "owner";
      /** "Reveal the top N cards": all of them are shown before the choice. */
      revealAll?: boolean;
    } = {},
  ): Effect => ({
    op: "lookAtTop",
    n,
    ...(opts.who ? { who: opts.who } : {}),
    ...(opts.chooser ? { chooser: opts.chooser } : {}),
    ...(opts.random ? { random: true } : {}),
    ...(opts.onePerType ? { onePerType: opts.onePerType } : {}),
    ...(opts.distinctPower ? { distinctPower: true } : {}),
    ...(opts.revealAll ? { reveal: "all" as const } : {}),
    filter: opts.filter,
    count: opts.count ?? 1,
    to: opts.to ?? { to: "hand" },
    rest: opts.rest ?? "bottom",
    maxTotalManaValue: opts.maxTotalManaValue,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    exact: opts.exact,
  }),
  /** `toHand`: the cards return to their owner's hand, and graveyard cards can be exiled. */
  exileUntilLeaves: (what: Ref, toHand?: boolean): Effect => ({ op: "exileUntilLeaves", what, ...(toHand ? { toHand } : {}) }),
  /** Choose (without targeting) cards from your graveyard, your hand or your sideboard (outside the game). */
  pickFromZone: (
    zone: "graveyard" | "hand" | "sideboard",
    filter: ObjectFilter,
    to: MoveSpec,
    opts: {
      count?: Amount;
      min?: number;
      prompt?: string;
      excludeStored?: string;
      maxManaValue?: Amount;
      store?: string;
      pool?: Ref;
      random?: boolean;
      onePerColorOf?: ObjectFilter;
      differentNames?: boolean;
      who?: Ref;
    } = {},
  ): Effect => ({
    op: "pickFromZone",
    ...(opts.who ? { who: opts.who } : {}),
    zone,
    filter,
    to,
    count: opts.count ?? 1,
    min: opts.min,
    prompt: opts.prompt,
    excludeStored: opts.excludeStored,
    maxManaValue: opts.maxManaValue,
    store: opts.store,
    pool: opts.pool,
    random: opts.random,
    onePerColorOf: opts.onePerColorOf,
    ...(opts.differentNames ? { distinct: "name" as const } : {}),
  }),
  topOrBottom: (what: Ref, topDamage?: number, fromTop?: number): Effect => ({
    op: "libraryTopOrBottom",
    what,
    topDamage,
    ...(fromTop ? { fromTop } : {}),
  }),
  /** Reveals until a matching card, puts it into `to`, the rest on the bottom in a random order. */
  revealUntil: (filter: ObjectFilter, to: MoveSpec = { to: "hand" }): Effect => ({ op: "revealUntilN", filter, n: 1, to }),
  search: (
    filter: ObjectFilter,
    to: MoveSpec = { to: "hand" },
    count: Amount = 1,
    who?: Ref,
    store?: string,
    manaValue?: Amount,
    /**
     * `alsoFrom`: "search your library and/or graveyard" (and hand, and outside the game: `sideboard`), one choice among
     * these zones; `each`: one filter per
     * card ("a basic land card and a Shrine card"); `reveal`: the found cards are shown to all players.
     */
    opts: SearchOpts = {},
  ): Effect => ({
    op: "search",
    filter,
    count,
    to,
    who,
    store,
    manaValue,
    ...searchOpts(opts),
  }),
  /**
   * A search whose found cards are held (PLAN-M M10a): they stay in the library (revealed with `reveal`), remembered
   * under `store`, unshuffled; the effects that follow route them (`ref.stored(store)`), then `fx.shuffle(ref.you)`
   * where the Oracle text shuffles ("put it onto the battlefield tapped if it's a land card, otherwise into your hand,
   * then shuffle": Archdruid's Charm).
   */
  searchHold: (filter: ObjectFilter, store: string, count: Amount = 1, opts: SearchOpts = {}): Effect => ({
    op: "search",
    filter,
    count,
    store,
    ...searchOpts(opts),
  }),
  /** Untaps the matching permanents you control. */
  untapAll: (filter: ObjectFilter): Effect => ({
    op: "tap",
    what: { kind: "zone", zone: "battlefield", who: { kind: "you" }, filter },
    untap: true,
  }),
};
