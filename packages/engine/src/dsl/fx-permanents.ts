import { msg } from "../text";
import type {
  AbilityDef,
  Amount,
  BlockRule,
  CardType,
  Color,
  CopyFate,
  Effect,
  Keyword,
  LayerMods,
  ObjectFilter,
  Ref,
  TokenSpec,
} from "../types";
import { zonesFx } from "./fx-zones";
import { ref } from "./refs";
import { allMatching } from "./shared";
import { triggered, when } from "./when";

/**
 * Goad (701.38): attack rule fixed at resolution on the controller of the effect (`fx.goad`). Its label distinguishes it
 * from a rule of the same form that is not goad (`attackRequirements`).
 */
const GOADED: BlockRule = {
  goadedBy: "you",
  label: msg("Goaded: attacks each combat if able, and a player other than the one who goaded it if able"),
};

/** The filter restricted to creatures ("creatures you control get…"). */
function creaturesOnly(filter: ObjectFilter): ObjectFilter {
  if (!filter.types) return { ...filter, types: ["Creature"] };
  if (filter.types.every((t) => t === "Creature")) return filter;
  return { types: ["Creature"], ...(filter.controller ? { controller: filter.controller } : {}), anyOf: [filter] };
}

/** `fx` builders (dsl.ts) of permanents: modifications, tokens, control, copies, attachments, choices made for the source (`ops/permanents.ts`). */
export const permanentsFx = {
  pump: (what: Ref, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what,
    power,
    toughness,
    keywords,
  }),
  /** "Double the power and toughness of [those creatures] until end of turn" (each according to its own). */
  doublePT: (what: Ref, keywords?: Keyword[]): Effect => ({ op: "pump", what, power: 0, toughness: 0, keywords, double: true }),
  /** The matching creatures get +X/+Y (and keywords) until end of turn. */
  pumpAll: (filter: ObjectFilter, power: Amount, toughness: Amount, keywords?: Keyword[]): Effect => ({
    op: "pump",
    what: allMatching(creaturesOnly(filter)),
    power,
    toughness,
    keywords,
  }),
  /**
   * Goad (701.38): until your next turn (or forever: Dack Fayden), those creatures attack each combat if able, and a
   * player other than you if able. "You" is fixed at resolution (`goadedBy`).
   * `extra`: other modifications for the same duration (Taunt from the Rampart: "can't block").
   */
  goad: (what: Ref, duration: "permanent" | "untilYourNextTurn" = "untilYourNextTurn", extra: LayerMods = {}): Effect => ({
    op: "modify",
    what,
    mods: { ...extra, addBlockRules: [...(extra.addBlockRules ?? []), GOADED] },
    duration,
  }),
  /** Goaded "for as long as [that player] controls it" (Vislor Turlough): `ModifyWhile` `sourceControlledBy`. */
  goadWhileControlledBy: (what: Ref, holder: Ref): Effect => ({
    op: "modify",
    what,
    mods: { addBlockRules: [GOADED] },
    duration: "permanent",
    while: { sourceControlledBy: holder },
  }),
  /**
   * `basePT`: base P/T set to this amount, evaluated at resolution (Fractalize: "X+1/X+1"); a pair: base power and base
   * toughness (Galion, Elvenking's Butler).
   */
  modify: (
    what: Ref,
    mods: LayerMods,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "endOfYourNextTurn" | "untilYourNextUpkeep" = "endOfTurn",
    basePT?: Amount | [Amount, Amount],
  ): Effect => ({
    op: "modify",
    what,
    mods,
    duration,
    ...(basePT !== undefined ? { basePT } : {}),
  }),
  /** Modification that lasts "for as long as it has a [kind] counter" (Ultima: "for as long as this land has a blight counter"). */
  modifyWhileCounter: (what: Ref, mods: LayerMods, kind: string): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: { counter: kind },
  }),
  /** Modification that lasts "for as long as this creature remains tapped" (Hedge Whisperer). */
  modifyWhileTapped: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "sourceTapped",
  }),
  /** Creates tokens (for you, or for another player: "its controller creates…"). */
  createTokens: (token: TokenSpec, count: Amount = 1, forWho?: Ref, store?: string, attachTo?: Ref): Effect => ({
    op: "createTokens",
    attachTo,
    token,
    count,
    for: forWho,
    store,
  }),
  /** Tapped tokens (and attacking if `attacking`). */
  /** X/X token: power and toughness equal to the amount. */
  createXXToken: (token: TokenSpec, pt: Amount, count: Amount = 1): Effect => ({ op: "createTokens", token, count, pt }),
  createTappedTokens: (
    token: TokenSpec,
    count: Amount = 1,
    opts: { attacking?: boolean | Ref; store?: string } = {},
  ): Effect => ({
    op: "createTokens",
    token,
    count,
    tapped: true,
    ...opts,
  }),
  /** "Harness [this Infinity Stone]" (Harness). */
  harness: { op: "harness" } as Effect,
  /**
   * Earthbend N (701.65, Avatar): the land becomes a 0/0 creature with haste that's still a land, with N +1/+1
   * counters, and "when it dies or is exiled, return it to the battlefield tapped".
   */
  earthbend: (what: Ref, n: Amount): Effect[] => [
    {
      op: "modify",
      what,
      mods: {
        addTypes: ["Creature"],
        setPower: 0,
        setToughness: 0,
        addKeywords: ["haste"],
        addAbilities: [
          triggered(when.diesOrExiled("self"), [zonesFx.toBattlefield(ref.selfCard, { tapped: true })], {
            label: msg("Returns to the battlefield tapped"),
          }),
        ],
      },
      duration: "permanent",
    },
    { op: "addCounters", what, amount: n },
    { op: "bent", kind: "earth" },
  ],
  /** "Regenerate [this permanent]" (701.19). */
  regenerate: (what: Ref): Effect => ({ op: "regenerate", what }),
  /** "[This permanent] phases out" (702.26). */
  phaseOut: (what: Ref): Effect => ({ op: "phaseOut", what }),
  /** `whileAttached`: "for as long as [this attachment] is attached to it" (Eriette: the Aura of the event). */
  gainControl: (what: Ref, opts: { untilEndOfYourNextTurn?: boolean; whileAttached?: Ref } = {}): Effect => ({
    op: "gainControl",
    what,
    ...(opts.untilEndOfYourNextTurn ? { duration: "endOfYourNextTurn" } : {}),
    ...(opts.whileAttached ? { duration: "whileAttached", attachment: opts.whileAttached } : {}),
  }),
  /** "Do this only once each turn" (with `oncePerTurn: "ifDone"`). */
  doneOncePerTurn: { op: "doneOncePerTurn" } as Effect,
  exchangeControl: (a: Ref, b: Ref): Effect => ({ op: "exchangeControl", a, b }),
  /**
   * Gains control as long as you control the source; `restrict`: it can't attack or block (Possession Engine);
   * `remains`: as long as the source remains on the battlefield, whoever controls it (Cytoplast Manipulator).
   */
  gainControlWhileSource: (what: Ref, restrict = false, remains = false): Effect[] => [
    { op: "gainControl", what, duration: remains ? "whileSource" : "whileYouControlSource" },
    ...(restrict
      ? [
          {
            op: "modify",
            what,
            mods: { addKeywords: ["cantAttack", "cantBlock"] },
            duration: "permanent",
            while: "source",
          } as Effect,
        ]
      : []),
  ],
  /** "The base P/T of … becomes N"; `powerOnly`: only the base power (PuPu UFO). */
  setBasePTAll: (filter: ObjectFilter, amount: Amount, powerOnly?: boolean): Effect => ({
    op: "setBasePTAll",
    filter,
    amount,
    powerOnly,
  }),
  chooseCardName: { op: "chooseCardName" } as Effect,
  /**
   * "Choose [a creature type, a color, a name, a mode…]" for the source: as it enters (in `asEnters`, 614.12) or by a
   * triggered ability ("when this land enters, choose a land card name").
   * `options`: the only allowed choices (Thriving Grove: a color other than green; Sieges: Abzan or Mardu).
   */
  chooseForSelf: (
    kind: Extract<Effect, { op: "chooseOnEnter" }>["kind"],
    opts: { options?: string[]; optionsFrom?: Ref; secret?: boolean; who?: Ref; control?: boolean; fromCost?: boolean } = {},
  ): Effect => ({ op: "chooseOnEnter", kind, ...opts }),
  /**
   * "You may have [this permanent] enter as a copy of [filter]" (707.9, in `asEnters`): see the `chooseCopy` effect
   * ("you may": `optional`, the case of every card so far).
   */
  /** "As [this] enters, you may exchange its text box and another creature's" (in `asEnters`, Deadpool). */
  exchangeTextBox: { op: "exchangeTextBox" } as Effect,
  chooseCopy: (filter: ObjectFilter, opts: Omit<Extract<Effect, { op: "chooseCopy" }>, "op" | "filter"> = {}): Effect => ({
    op: "chooseCopy",
    filter,
    optional: true,
    ...opts,
  }),
  /** "[This Mount] becomes saddled until end of turn". */
  saddle: (what: Ref = ref.self): Effect => ({ op: "saddle", what }),
  /** "[This Vehicle] becomes an artifact creature until end of turn". */
  animateVehicle: (what: Ref = ref.self): Effect => ({
    op: "modify",
    what,
    mods: { addTypes: ["Artifact", "Creature"] },
    duration: "endOfTurn",
  }),
  /** "… for as long as [this source] remains on the battlefield" (Kitesail Larcenist). */
  modifyWhileSource: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "source",
  }),
  /** "… for as long as you control [this source]" (Ty Lee, Spider-Woman). */
  modifyWhileYouControl: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "youControlSource",
  }),
  /** "… for as long as it remains tapped": for each affected object, until it untaps (Braided Net). */
  modifyWhileAffectedTapped: (what: Ref, mods: LayerMods): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: "tapped",
  }),
  /** "Suspect [the creature]" (701.60); `value: false`: "it's no longer suspected". */
  suspect: (what: Ref, value = true): Effect => ({ op: "suspect", what, value }),
  becomeCopy: (
    what: Ref,
    of: Ref,
    duration: "endOfTurn" | "permanent" | "untilYourNextTurn" | "whileAttached" = "endOfTurn",
    /**
     * `except`: copy exceptions (707.9b: name, types, P/T…), Absorbing Man, Taskmaster; `attachment`: with
     * `"whileAttached"`, the Aura or Equipment that must remain attached (Assimilation Aegis).
     */
    opts: { addKeywords?: Keyword[]; keepAbilities?: number[]; ifManaValue?: Amount; except?: LayerMods; attachment?: Ref } = {},
  ): Effect => ({
    op: "becomeCopy",
    what,
    of,
    duration,
    ...opts,
  }),
  /** Continuous effect that ends when the designated card leaves exile ("until that card is cast from exile"). */
  modifyWhileExiled: (what: Ref, mods: LayerMods, card: Ref): Effect => ({
    op: "modify",
    what,
    mods,
    duration: "permanent",
    while: { exiled: card },
  }),
  giveControl: (what: Ref, to: Ref): Effect => ({ op: "gainControl", what, to, duration: "permanent" }),
  /** Each designated object returns to its owner's control. */
  returnControlToOwners: (what: Ref): Effect => ({ op: "gainControl", what, to: "owner", duration: "permanent" }),
  unattach: (what: Ref, ifAttachedTo?: Ref): Effect => ({ op: "unattach", what, ifAttachedTo }),
  link: (what: Ref, to?: Ref): Effect => ({ op: "link", what, to }),
  /** "You get an emblem with …" */
  emblem: (
    name: string,
    text: string,
    abilities: AbilityDef[],
    untilYourNextTurn?: boolean,
    thisTurn?: boolean,
    store?: string,
    untilEndOfYourNextTurn?: boolean,
  ): Effect => ({
    op: "emblem",
    name,
    text,
    abilities,
    store,
    ...(untilYourNextTurn
      ? { duration: "untilYourNextTurn" }
      : thisTurn
        ? { duration: "endOfTurn" }
        : untilEndOfYourNextTurn
          ? { duration: "endOfYourNextTurn" }
          : {}),
  }),
  /** Attaches an Aura or an Equipment (the source by default) to the designated permanent. */
  attach: (to: Ref, what: Ref = ref.self, store?: string): Effect => ({ op: "attach", what, to, store }),
  /** Attaches to one of the designated objects or players, chosen at random (Maddening Hex). */
  attachRandom: (to: Ref, what: Ref = ref.self): Effect => ({ op: "attach", what, to, random: true }),
  modifyAll: (filter: ObjectFilter, mods: LayerMods, duration: "endOfTurn" | "untilYourNextTurn" = "endOfTurn"): Effect => ({
    op: "modify",
    what: allMatching(filter),
    mods,
    duration,
  }),
  copyToken: (
    of: Ref,
    opts: {
      count?: Amount;
      /** The players who each create the tokens (Fractured Identity). */
      for?: Ref;
      addKeywords?: Keyword[];
      addSubtypes?: string[];
      sacrificeAtEndStep?: boolean;
      exileAtEndStep?: boolean;
      addAbilities?: AbilityDef[];
      legendary?: boolean;
      nonlegendary?: boolean;
      store?: string;
      tapped?: boolean;
      attacking?: boolean | Ref;
      attackEach?: Ref;
      /** With `attackEach`: "you may", for each player (myriad). */
      optional?: boolean;
      atEndOfCombat?: "exile" | "sacrifice";
      addTypes?: CardType[];
      pt?: number | { power: Amount; toughness: Amount };
      setColors?: Color[];
      addColors?: Color[];
      setSubtypes?: string[];
      equipDiscount?: number;
      sacrificeAtNextUpkeep?: boolean;
    } = {},
  ): Effect => {
    const { sacrificeAtEndStep, exileAtEndStep, atEndOfCombat, sacrificeAtNextUpkeep, ...rest } = opts;
    const atEnd: CopyFate | undefined = atEndOfCombat
      ? { fate: atEndOfCombat, at: "endOfCombat" }
      : sacrificeAtNextUpkeep
        ? { fate: "sacrifice", at: "nextUpkeep" }
        : exileAtEndStep
          ? "exile"
          : sacrificeAtEndStep
            ? "sacrifice"
            : undefined;
    return { op: "copyToken", of, ...rest, ...(atEnd ? { atEnd } : {}) };
  },
};
