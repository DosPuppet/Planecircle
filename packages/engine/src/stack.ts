/**
 * Casting spells (601), activating abilities (602), resolving the stack (608).
 * On the engine side, casting is atomic: the client sends mode, targets, X and kicker at once,
 * and the mana payment is resolved automatically (mana pool first, then the solver).
 */

import {
  canForage,
  createTokenCopy,
  forage,
  forageOptions,
  payLife as payLife_,
  removeFromCombat,
  sacrifice as sacrificePermanent,
} from "./actions";
import { cardRule, castOption } from "./cardDef";
import { absentAnswer, ask } from "./choices";
import { counterLabel } from "./counterLabels";
import { SACRIFICE_TOKEN_AT_END_STEP } from "./dsl/when";
import {
  addEffect,
  announceDiscard,
  announceDiscardBatch,
  cardRefOf,
  concreteSpec,
  evalAmount,
  GRANTOR_KEY,
  moveDiscarded,
  moveWithSpec,
  permissionActive,
  runEffect,
  staticContext,
  withX,
} from "./effects";
import { RulesError, rethrowAsRules } from "./errors";
import { copiedDefId, effectivePower, hasKeyword } from "./layers";
import { MAX_X } from "./limits";
import { canPay, costToText, type ManaPurpose, manaAbilitiesOf, manaValue, payMana, totalCost } from "./mana";
import { firstOfEachName, hasName, isNameAllowed } from "./names";
import { asEntersChoices, ENTERS_PREFIX, withEntersChoices } from "./replacement";
import {
  bent,
  bump,
  changeCounters,
  chars,
  commanderOf,
  createObject,
  emit,
  FACE_DOWN_DEF,
  FACE_DOWN_ID,
  isAlive,
  isCreature,
  kickerPaidTimes,
  moveObject,
  newId,
  nextTimestamp,
  obj,
  onBattlefield,
  opponentsOf,
  removeFromGame,
  rulesEvent,
  shuffle,
  sickForActivation,
  snapshot,
  tapObject,
  turnFaceUp,
  unlockDoor,
} from "./state";
import {
  consumePlayerEffect,
  controlledAbilitiesWithSource,
  lifeCost,
  payableLife,
  playerStatic,
  playerStatics,
  playerStaticTotal,
} from "./statics";
import {
  isLegalTarget,
  legalTargets,
  matchesCard,
  matchesExiled,
  matchesObjectFilter,
  matchesView,
  resolveFilter,
  validateTargets,
  withChosen,
} from "./targets";
import { msg } from "./text";
import { checkCondition, checkCrime, createDelayed, onceKey, pushInline, simultaneously } from "./triggers";
import { activatedThisTurn, countTurnEvents, logTurnEvent, objectDidThisTurn } from "./turnlog";
import type {
  AbilityCostMod,
  AbilityDef,
  AbilityKind,
  ActivatedAbilityDef,
  AltCostPay,
  CardDef,
  CastChoices,
  CastLimit,
  CastVia,
  ChoiceValue,
  Color,
  Condition,
  CostDef,
  CostPick,
  CostSlot,
  Effect,
  ExiledFilter,
  GameObject,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ManaAbilityDef,
  ManaCost,
  ManaType,
  ModeDef,
  NextSpell,
  ObjectFilter,
  ObjectId,
  PendingStackChoice,
  PlayerId,
  PlayFromZone,
  SacrificeToPay,
  StackItem,
  TargetSpec,
} from "./types";
import { BASIC_LAND_TYPES, isManaAbility, PERMANENT_TYPES } from "./types";

export { RulesError };

/** Blitz (702.152): "When this creature dies, draw a card", gained as it enters. */
const BLITZ_DRAW: AbilityDef = {
  kind: "triggered",
  trigger: { on: "dies", who: "self" },
  targets: [],
  effects: [{ op: "draw", who: { kind: "you" }, amount: 1 }],
  label: msg("Blitz: when this creature dies, draw a card"),
};

/** Modifications a permanent spell enters with: subtypes (Noctis), blitz's draw. */
function arrivalMods(item: StackItem): LayerMods | undefined {
  const subtypes = item.arrival?.subtypes;
  const blitz = item.cast?.via === "blitz";
  if (!subtypes && !blitz) return undefined;
  return { ...(subtypes ? { addSubtypes: subtypes } : {}), ...(blitz ? { addAbilities: [BLITZ_DRAW] } : {}) };
}

/** Available alternative cost: the card's own (if its condition is met), otherwise the one granted to your spells (`altCostAll`). */
export function altCostFor(
  s: GameState,
  player: PlayerId,
  d: CardDef,
):
  | {
      mana: ManaCost;
      label: string;
      forage?: boolean;
      collectEvidence?: number;
      webSlinging?: boolean;
      via?: CastVia;
      pay?: AltCostPay;
    }
  | undefined {
  const own = castOption(d, "alternative");
  if (own && checkCondition(s, own.condition, player)) return own;
  for (const { id, ab } of playerStatics(s, player, "altCostAll")) {
    const a = ab.altCostAll;
    if (!a || (a.filter && !matchesView(spellView(d, player), a.filter, player))) continue;
    // Granted web-slinging (Amazing Spider-Man): it needs a tapped creature to return.
    if (a.webSlinging && a.mana) {
      if (webSlingingOptions(s, player).length === 0) continue;
      return { mana: a.mana, label: msg("Web-slinging — {cost}", { cost: costToText(a.mana) }), webSlinging: true };
    }
    // Blitz granted (Henzie "Toolbox" Torre): the spell's mana cost, possibly reduced.
    if (a.blitz && d.manaCost) {
      const reduce = a.blitz.reduce !== undefined ? Math.max(0, evalAmount(s, staticContext(s, player, id), a.blitz.reduce)) : 0;
      const mana = { ...d.manaCost, generic: Math.max(0, d.manaCost.generic - reduce) };
      return { mana, label: msg("Blitz — {cost}", { cost: costToText(mana) }), via: "blitz" };
    }
    // Conspiracy Unraveler: collect evidence N rather than pay the mana cost.
    if (a.collectEvidence)
      return {
        mana: { generic: 0, colored: {}, x: 0 },
        collectEvidence: a.collectEvidence,
        label: msg("Collect evidence {n}", { n: a.collectEvidence }),
      };
    // Label: the name of the card that grants the cost (Leyline of Mutation: "Leyline of Mutation — {W}{U}{B}{R}{G}").
    const giver = id ? (s.defs[s.objects[id]?.defId ?? ""]?.name ?? "") : "";
    if (a.mana)
      return {
        mana: a.mana,
        label: giver
          ? msg("{card} — {cost}", { card: giver, cost: costToText(a.mana) })
          : msg("Alternative cost — {cost}", { cost: costToText(a.mana) }),
      };
  }
  return undefined;
}

/** Convoke: the spell has it, or Dazzling Theater gives it to your creature spells. */
/** Improvise (702.126): printed, or given to the player's spells (Ironheart: "noncreature spells you cast"). */
/**
 * Does the spell have this keyword, printed or granted to spells by a static ability of the player (`spellKeywords`:
 * "creature spells you cast have convoke", "sorcery spells you cast have flash"…)? The only reading of a spell's keywords
 * outside the battlefield (PLAN-C, lot C11).
 */
export function spellHasKeyword(s: GameState, player: PlayerId, d: CardDef, kw: Keyword): boolean {
  if (d.keywords.includes(kw)) return true;
  return playerStatics(s, player, "spellKeywords").some(
    ({ ab }) => !!ab.spellKeywords?.keywords.includes(kw) && matchesView(spellView(d, player), ab.spellKeywords.filter, player),
  );
}

/** Keywords granted to this spell by its controller's static abilities (`spellKeywords`), without those it already has. */
export function grantedSpellKeywords(s: GameState, player: PlayerId, d: CardDef): Keyword[] {
  const out = new Set<Keyword>();
  for (const { ab } of playerStatics(s, player, "spellKeywords"))
    if (ab.spellKeywords && matchesView(spellView(d, player), ab.spellKeywords.filter, player))
      for (const k of ab.spellKeywords.keywords) if (!d.keywords.includes(k)) out.add(k);
  return [...out];
}

export function hasImprovise(s: GameState, player: PlayerId, d: CardDef): boolean {
  return spellHasKeyword(s, player, d, "improvise");
}

export function hasConvoke(s: GameState, player: PlayerId, d: CardDef): boolean {
  return spellHasKeyword(s, player, d, "convoke");
}

export function isPermanentCard(d: CardDef): boolean {
  return !d.types.includes("Instant") && !d.types.includes("Sorcery");
}

/**
 * Condition of a mode when the spell is announced (601.2b): "kicked" (additional cost paid, teamwork, blight…) is read
 * from the casting choices, not from the object; `not`, `all` and `any` compose it ("choose one; if the additional cost
 * was paid, choose both instead": each single mode requires that it was not). The other kinds are read outside
 * resolution (`checkCondition`). Shared by `legalActions` and `castSpell`.
 */
export function modeConditionHolds(s: GameState, player: PlayerId, card: ObjectId, c: Condition, kicked: boolean): boolean {
  switch (c.kind) {
    case "kicked":
      return kicked;
    case "not":
      return !modeConditionHolds(s, player, card, c.cond, kicked);
    case "all":
      return c.of.every((x) => modeConditionHolds(s, player, card, x, kicked));
    case "any":
      return c.of.some((x) => modeConditionHolds(s, player, card, x, kicked));
    default:
      return checkCondition(s, c, player, card);
  }
}

/** The "target" word of an Aura spell (303.4a). */
export const ENCHANT_SPEC = "enchant";

/** Modes of a spell; a permanent without targets has a single empty mode, an Aura targets what it will enchant. */
export function modesOf(d: CardDef): ModeDef[] {
  if (d.spell) return d.spell.modes;
  if (d.enchant) {
    const filter = d.enchant.player
      ? { players: "any" as const }
      : d.enchant.graveyard
        ? { cards: { filter: d.enchant.filter, whose: "any" as const } }
        : { objects: d.enchant.filter };
    return [{ targets: [{ id: ENCHANT_SPEC, label: d.enchant.label, filter }], effects: [] }];
  }
  return [{ targets: [], effects: [] }];
}

export function sorceryTiming(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0;
}

export function canCastTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.types.includes("Instant") || d.keywords.includes("flash")) return true;
  const flashIf = cardRule(d, "flashIf");
  if (flashIf && checkCondition(s, flashIf, player)) return true;
  if (sorceryTiming(s, player)) return true;
  // Valley Floodcaller: "you may cast noncreature spells as though they had flash".
  if (spellHasKeyword(s, player, d, "flash")) return true;
  // "You may cast spells as though they had flash."
  return s.battlefield.some(
    (id) => obj(s, id).controller === player && chars(s, id).abilities.some((ab) => ab.kind === "castPermission" && ab.flash),
  );
}

/** The player or planeswalker a sneaked creature will attack is still there (508.4a). */
function sneakDefenderStill(s: GameState, defender: string): boolean {
  const p = s.players[defender];
  return p ? !p.lost : onBattlefield(s, defender);
}

/** Sneak (702.190a): the spell is cast for its sneak cost during the declare blockers step. */
export function sneakTiming(s: GameState, player: PlayerId, d: CardDef): boolean {
  return (
    castOption(d, "alternative")?.via === "sneak" &&
    sneakOptions(s, player).length > 0 &&
    checkCondition(s, { kind: "sneakWindow" }, player)
  );
}

/** Sneak: the unblocked attackers you can return, weakest first (the default choice). */
export function sneakOptions(s: GameState, player: PlayerId): ObjectId[] {
  return [...unblockedAttackers(s, player)].sort((a, b) => chars(s, a).power - chars(s, b).power);
}

/** Abilities (on the battlefield) of the permanents this player controls. */
function controlledAbilities(s: GameState, player: PlayerId): CardDef["abilities"] {
  return controlledAbilitiesWithSource(s, player).map((e) => e.ab);
}

/** Number of lands the player can play this turn (305.2: 1, plus effects like Loot). */
export function landsAllowed(s: GameState, player: PlayerId): number {
  return 1 + playerStaticTotal(s, player, "extraLands");
}

/** Permission to play an exiled card (impulse draw, Etali…) that is still valid. */
function exilePermission(s: GameState, player: PlayerId, card: ObjectId) {
  return s.playPermissions?.find(
    (p) =>
      p.card === card &&
      p.player === player &&
      permissionActive(s, p) &&
      // Possibility Technician: "as long as you control a Kavu".
      (!p.condition || checkCondition(s, p.condition, player, p.source)),
  );
}

/** Muldrotha: permanent type still available to play this card from the graveyard this turn (the first one). */
function graveyardTypeAvailable(s: GameState, player: PlayerId, card: ObjectId): string | null {
  return graveyardTypesFree(s, player, card)[0] ?? null;
}

/** Muldrotha: the card's permanent types still available from the graveyard this turn, in the order of its type line. */
function graveyardTypesFree(s: GameState, player: PlayerId, card: ObjectId): string[] {
  if (s.turn.active !== player) return [];
  if (!controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.graveyardPermanentTypes)) return [];
  const d = s.defs[obj(s, card).defId];
  const used = s.turn.graveyardTypesUsed ?? [];
  return d?.types.filter((t) => PERMANENT_TYPES.includes(t) && !used.includes(t)) ?? [];
}

export function canPlayLand(s: GameState, player: PlayerId, card: ObjectId): boolean {
  return landPermitted(s, player, card) && sorceryTiming(s, player) && s.turn.landsPlayed < landsAllowed(s, player);
}

/**
 * May the player play this land from its zone (hand, exile, graveyard, top of the library), regardless of timing and of
 * the lands already played? (The interface shows these cards at the end of the hand.)
 */
/** Tinybones, Bauble Burglar: during your turn, the exiled cards with a stash counter that you don't own. */
function stashPlayable(s: GameState, player: PlayerId, o: GameObject): boolean {
  return (
    o.zone === "exile" &&
    o.owner !== player &&
    (o.counters.stash ?? 0) > 0 &&
    s.turn.active === player &&
    controlledAbilities(s, player).some((ab) => ab.kind === "castPermission" && ab.stash)
  );
}

/**
 * Face played as a land: the card if it is a land, otherwise the land back face of a modal double-faced card
 * (712.12: Sink into Stupor // Soporific Springs).
 */
export function landFace(d: CardDef | undefined): CardDef | undefined {
  if (!d) return undefined;
  if (d.types.includes("Land")) return d;
  const back = d.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
  return back?.types.includes("Land") ? back : undefined;
}

/** Land back face of a modal card whose front is also a land (Pathways: the played face is chosen). */
export function landBackFace(d: CardDef | undefined): CardDef | undefined {
  const back = d?.layout === "modal_dfc" && d.types.includes("Land") ? d.faceDefs?.[1] : undefined;
  return back?.types.includes("Land") ? back : undefined;
}

export function landPermitted(s: GameState, player: PlayerId, card: ObjectId): boolean {
  const o = s.objects[card];
  if (!o) return false;
  const d = s.defs[o.defId];
  if (!d || !landFace(d)) return false;
  return (
    (o.zone === "hand" && o.owner === player) ||
    (o.zone === "exile" && !!exilePermission(s, player, card) && !exilePermission(s, player, card)?.anyTime) ||
    // Valgavoth: the linked cards, lands included.
    (o.zone === "exile" && playFromRules(s, player, card, "linked", "lands").length > 0) ||
    // Tinybones: "play" the stash cards, lands included.
    stashPlayable(s, player, o) ||
    (o.zone === "library" &&
      o.owner === player &&
      s.players[player]?.library[0] === card &&
      playFromRules(s, player, card, "libraryTop", "lands").length > 0) ||
    // Town with an adventure (FIN): the card "on an adventure" is played as a land from exile (715.4).
    (o.zone === "exile" && !!o.onAdventure && o.owner === player) ||
    // "You may play that card this turn" (Tablet of Discovery: the milled card, land included).
    (o.zone === "graveyard" && !!exilePermission(s, player, card) && !exilePermission(s, player, card)?.anyTime) ||
    (o.zone === "graveyard" &&
      o.owner === player &&
      (graveyardTypeAvailable(s, player, card) === "Land" ||
        playFromRules(s, player, card, "graveyard", "lands").length > 0 ||
        // Mayhem of a land (Oscorp Industries): discarded this turn, it is played from the graveyard.
        (!!castOption(d, "mayhem") && objectDidThisTurn(s, o.id, "discard"))))
  );
}

/** Basic land types (205.3i). */

/** The spell's alternative cost is web-slinging: printed, or given (Amazing Spider-Man). */
export function isWebSlinging(s: GameState, player: PlayerId, d: CardDef): boolean {
  return castOption(d, "alternative")?.via === "webSlinging" || !!altCostFor(s, player, d)?.webSlinging;
}

/** Will the creature spell have riot as it enters: printed, or given by one of your permanents (Spider-Punk)? */
export function willHaveRiot(s: GameState, player: PlayerId, d: CardDef): boolean {
  if (d.keywords.includes("riot")) return true;
  if (!d.types.includes("Creature")) return false;
  const view = spellView(d, player);
  return s.battlefield.some(
    (id) =>
      s.objects[id]?.controller === player &&
      chars(s, id).abilities.some(
        (ab) =>
          ab.kind === "static" &&
          typeof ab.affects === "object" &&
          !!ab.mods.addKeywords?.includes("riot") &&
          matchesView(view, { ...ab.affects, other: undefined }, player, id),
      ),
  );
}

/** Web-slinging: the tapped creatures you control, cheapest first (the default choice). */
export function webSlingingOptions(s: GameState, player: PlayerId): ObjectId[] {
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && obj(s, id).tapped && isCreature(s, id))
    .sort((a, b) => mv(a) - mv(b));
}

/** Multiversal Passage: the land's first "as it enters" choice is a basic land type (one option per type). */
export function landTypeChoice(face: CardDef): boolean {
  const first = face.asEnters?.find((e) => e.op === "chooseOnEnter" || e.op === "chooseCopy");
  return first?.op === "chooseOnEnter" && first.kind === "landType";
}

export function playLand(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  payLife = false,
  landType?: string,
  chosen?: string,
  back = false,
): void {
  if (!canPlayLand(s, player, card)) throw new RulesError(msg("You can't play this land now"));
  const o = obj(s, card);
  // The played face: the card, or the land back face of a modal card (which then enters back face up); Pathways: the
  // back face if the player chooses it.
  const backLand = back ? landBackFace(s.defs[o.defId]) : undefined;
  if (back && !backLand) throw new RulesError(msg("This card has no land back face to play"));
  const face = backLand ?? landFace(s.defs[o.defId]);
  const backFace = !!face && face.id !== o.defId;
  // 614.12: the land's first "as it enters" question (Cavern of Souls: a creature type; Multiversal Passage: a basic land
  // type, `landType`; Echoing Deeps: the copied card, "" for none) is answered with the decision; without an answer, and
  // for the next ones, the suggested answer (`asEntersChoices`).
  const entering = { id: card, defId: face?.id ?? o.defId, controller: player };
  const choosesType = face ? landTypeChoice(face) : false;
  if (landType !== undefined && (!choosesType || !BASIC_LAND_TYPES.includes(landType)))
    throw new RulesError(msg("Invalid basic land type"));
  if (chosen !== undefined && choosesType) throw new RulesError(msg("This land asks for no choice"));
  let first: ChoiceValue[] | undefined;
  const given = landType ?? chosen;
  if (given !== undefined) {
    const probe = asEntersChoices(s, {}, entering, "land:", "probe");
    const request = "ask" in probe ? probe.ask.request : undefined;
    if (request?.type === "name") {
      // Cavern of Souls: a creature type (the whole official list, `isNameAllowed`).
      if (!isNameAllowed(s, request.of, given)) throw new RulesError(msg("Invalid choice"));
      first = [given];
    } else if (request?.type !== "pick") throw new RulesError(msg("This land asks for no choice"));
    else if (given === "" && request.min === 0) first = [];
    else if (request.options.includes(given)) first = [given];
    else throw new RulesError(msg("Invalid choice"));
  }
  // Shock lands: "you may pay 2 life; if you don't, it enters tapped".
  const shock = face?.shockLand;
  if (payLife && !shock) throw new RulesError(msg("This land asks for no life payment"));
  if (payLife && shock) {
    if (payableLife(s, player) < shock) throw new RulesError(msg("Not enough life"));
    payLife_(s, player, shock);
  }
  if (o.zone === "graveyard") s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), "Land"];
  const defId = o.defId;
  const fromZone = o.zone;
  const fromExile = o.zone === "exile" ? exilePermission(s, player, card) : undefined;
  const choices = asEntersChoices(s, {}, entering, "land:", first ? { first } : "auto");
  // Scorched Ruins: its "as it enters" effects put it elsewhere (into the graveyard, for lack of lands to sacrifice); the
  // land was still played (305.1).
  if (s.objects[card]?.zone !== fromZone) {
    s.turn.landsPlayed += 1;
    logTurnEvent(s, { e: "playLand", player, fromZone, types: face?.types ?? [], subtypes: face?.subtypes ?? [] });
    return;
  }
  const id = moveObject(s, card, "battlefield", {
    controller: player,
    enters: { shockPaid: payLife, ...("ask" in choices ? {} : choices) },
    ...(backFace ? { modalBack: true } : {}),
  });
  s.turn.landsPlayed += 1;
  emit({ type: "playLand", player, objectId: id as string, defId });
  if (id) rulesEvent(s, { e: "playLand", player, objectId: id, from: fromZone });
  const land = face;
  logTurnEvent(s, { e: "playLand", player, fromZone, types: land?.types ?? [], subtypes: land?.subtypes ?? [] });
  // Lightstall Inquisitor: a land played from exile this way enters tapped.
  const landed = id ? s.objects[id] : undefined;
  if (landed && fromExile?.tapped) {
    landed.tapped = true;
    bump(s);
  }
}

function flatTargets(t: Record<string, string[]>): string[] {
  return Object.values(t).flat();
}

/** The spell seen as an object, for filters ("Dragon spells you cast…"). */
export function spellView(d: CardDef, player: PlayerId): LkiSnapshot {
  return {
    id: "",
    defId: d.id,
    owner: player,
    controller: player,
    types: d.types,
    subtypes: d.subtypes,
    supertypes: d.supertypes,
    colors: d.colors,
    power: d.power ?? 0,
    toughness: d.toughness ?? 0,
    keywords: d.keywords,
    isToken: false,
    // "a spell with mana value 4 or greater" (Ashling's restricted mana, cost reductions), "named …".
    name: d.name,
    manaValue: manaValue(d.manaCost),
    ...(d.layout === "adventure" || d.subtypes.includes("Adventure") ? { adventure: true } : {}),
    ...((d.manaCost?.x ?? 0) > 0 ? { hasX: true } : {}),
    // A spell cast face down (disguise): "face-down spells" (Goblin Maskmaker).
    ...(d.id === FACE_DOWN_ID ? { faceDown: true } : {}),
  };
}

/** Does the spell's own reduction ("this spell costs {N} less to cast if…") apply? */
function ownReductionApplies(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  targets?: Record<string, string[]>,
  card?: ObjectId,
  kicked?: boolean,
): boolean {
  const cond = d.costReduction?.condition;
  if (!cond) return true;
  if (cond.kind === "targetMatches") {
    // "This spell costs {3} less to cast if it targets a tapped creature" (Luminous Rebuke); a targeted spell on the stack
    // (Brush Off: "if it targets an instant or sorcery spell").
    const spec = modesOf(d)[0]?.targets.find((t) => t.id === cond.spec);
    const ids = targets ? (targets[cond.spec] ?? []) : spec ? legalTargets(s, player, spec) : [];
    return ids.some((id) =>
      s.stack.some((x) => x.id === id && x.kind === "spell")
        ? matchesView(snapshot(s, id), cond.filter, player)
        : matchesObjectFilter(s, player, id, cond.filter),
    );
  }
  // "This spell costs {2} less to cast if it's bargained" (Hamlet Glutton): the caster's choice.
  if (cond.kind === "kicked") return !!kicked;
  // The cast card is the source: "behold a Goblin" doesn't count the card itself (601.2a).
  return checkCondition(s, cond, player, card);
}

/** Generic cost reduction applicable to this spell (601.2f). */
export function spellReduction(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  targets?: Record<string, string[]>,
  fromZone?: CastTerms["source"],
  card?: ObjectId,
  kicked?: boolean,
): { generic: number; colored: ManaCost["colored"] } {
  let r = 0;
  const colored: ManaCost["colored"] = {};
  const own = d.costReduction;
  const ok = ownReductionApplies(s, player, d, targets, card, kicked);
  if (own && ok) {
    r += evalAmount(s, staticContext(s, player, "", { sourceDefId: d.id }), own.generic);
  }
  const view = spellView(d, player);
  // Reductions granted to the player ("this turn" effects: Goblin Maskmaker).
  for (const { ab } of playerStatics(s, player, "spellCost")) {
    if (ab.spellCost && matchesView(view, ab.spellCost.filter, player)) r += ab.spellCost.reduce ?? 0;
  }
  // "The next noncreature spell you cast this turn has affinity for artifacts" (Don & Raph).
  for (const e of s.playerEffects) {
    const n = e.player === player && e.once ? e.ability.nextSpell : undefined;
    if (n?.reduce !== undefined && (!n.filter || matchesView(view, n.filter, player)))
      r += evalAmount(s, reductionContext(s, player, "", d.id), n.reduce);
  }
  for (const id of s.battlefield) {
    const o = obj(s, id);
    for (const ab of chars(s, id).abilities) {
      if (ab.kind !== "costReduction") continue;
      // Reductions from your permanents; taxes from opposing permanents on your spells (Thalia, the Survivor).
      const applies = ab.everyone || (ab.opponents ? o.controller !== player : o.controller === player);
      // Gathering Stone: "spells of the chosen type".
      if (!applies || !matchesView(view, withChosen(ab.filter, o), player)) continue;
      if (ab.condition && !checkCondition(s, ab.condition, o.controller, id)) continue;
      // "Spells cast from graveyards or from exile" (Aven Interrupter, Doc Aurlock).
      const zone = fromZone === "flashback" ? "graveyard" : fromZone;
      if (ab.fromZones && !(zone === "graveyard" || zone === "exile" ? ab.fromZones.includes(zone) : false)) continue;
      const n =
        ab.generic +
        (ab.genericAmount !== undefined ? evalAmount(s, reductionContext(s, o.controller, id, o.defId), ab.genericAmount) : 0);
      // "{U} (or {1}) less for each…" (Eluge): colored symbols, applied with 118.7c by `spellCost`.
      if (ab.colored) colored[ab.colored] = (colored[ab.colored] ?? 0) + Math.max(0, n);
      else r += n;
    }
  }
  return { generic: r, colored };
}

/**
 * Modifications as a spell enters (Noctis; next creature spell: Summon: Fenrir, Summon: Brynhildr; suspend: a creature
 * spell cast this way gains haste, 702.62a).
 */
function arrivalFor(terms: CastTerms, next: NextSpell[], d: CardDef): StackItem["arrival"] {
  const counters: { kind: string; n: number }[] = terms.finality ? [{ kind: "finality", n: 1 }] : [];
  // Mikey & Don: "if you cast a creature spell this way, it enters with an additional +1/+1 counter".
  if (terms.playFrom?.counters) counters.push({ kind: "+1/+1", n: terms.playFrom.counters });
  for (const n of next) if (n.counters) counters.push({ kind: "+1/+1", n: n.counters });
  const haste = next.some((n) => n.haste) || (terms.haste && d.types.includes("Creature")) || undefined;
  // The Tomb of Aclazotz: "it's a Vampire in addition to its other types".
  const subtypes = terms.playFrom?.addSubtypes;
  return counters.length || haste || subtypes ? { counters, haste, ...(subtypes ? { subtypes } : {}) } : undefined;
}

/**
 * "The next spell you cast this turn…" (family N): the one-shot effects that match this spell are removed and returned
 * (Teach by Example: copied; Theorist's Proxy: can't be countered; Summon: Fenrir: counter).
 */
function consumeNextSpells(s: GameState, player: PlayerId, d: CardDef): NextSpell[] {
  const view = spellView(d, player);
  const used = s.playerEffects.filter(
    (e) =>
      e.player === player &&
      e.once &&
      !!e.ability.nextSpell &&
      (!e.ability.nextSpell.filter || matchesView(view, e.ability.nextSpell.filter, player)),
  );
  if (used.length) s.playerEffects = s.playerEffects.filter((e) => !used.includes(e));
  return used.map((e) => e.ability.nextSpell as NextSpell);
}

/** Cloud, Planet's Champion: reduction of an equip ability that targets the creature. */
export function equipDiscount(s: GameState, player: PlayerId, ab: ActivatedAbilityDef, target: ObjectId | undefined): number {
  if (!target || !ab.equip || s.objects[target]?.controller !== player) return 0;
  return cardRule(s.defs[copiedDefId(s, target)], "equipDiscountWhenTargeted") ?? 0;
}

/**
 * "Play from a zone" permissions (family C) that apply to this card, those without an extra cost or effect first
 * (Case of the Uneaten Feast before Noctis), then those that let mana of any type be spent. `linked`: only those of a
 * permanent the card is linked to (not effects, which have no source).
 */
export function playFromRules(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  zone: PlayFromZone["zone"],
  what: "lands" | "spells",
): PlayFromZone[] {
  const weight = (r: PlayFromZone) =>
    (r.payLife ? 2 : 0) +
    (r.forage || r.exileOthers ? 2 : 0) +
    (r.finality ? 1 : 0) +
    (r.addSubtypes ? 1 : 0) -
    (r.anyMana ? 0.5 : 0);
  return playerStatics(s, player, "playFrom")
    .flatMap(({ id, ab }) => {
      const r = ab.playFrom;
      if (!r || r.zone !== zone || (r.what && r.what !== what)) return [];
      if (zone === "linked" && !(id && s.objects[id]?.linked?.includes(card))) return [];
      if (r.filter && !matchesCard(s, player, card, { ...r.filter, controller: undefined }, id)) return [];
      // Granted mayhem (702.191a): only a card discarded this turn.
      if (r.mayhem && !objectDidThisTurn(s, card, "discard")) return [];
      // Maralen: mana value at most an amount evaluated for the source.
      if (r.maxManaValue !== undefined && id) {
        const max = evalAmount(s, reductionContext(s, player, id, obj(s, id).defId), r.maxManaValue);
        if (manaValue(s.defs[obj(s, card).defId]?.manaCost) > max) return [];
      }
      if (r.removeCountersAmong && countersAmongCreatures(s, player) < r.removeCountersAmong) return [];
      if (r.payLife && payableLife(s, player) < r.payLife) return [];
      if (r.forage && !canForage(s, player, card)) return [];
      if (r.exileOthers && !graveyardToExile(s, player, card, r.exileOthers)) return [];
      // Granted sneak: only during the sneak window, with an attacker to return.
      if (r.sneak && !(sneakOptions(s, player).length > 0 && checkCondition(s, { kind: "sneakWindow" }, player))) return [];
      // Johann: "once each turn" (the key of this permission, recorded on casting).
      const onceKey = r.oncePerTurn ? `playFrom:${id}` : undefined;
      if (onceKey && s.turn.onceFired.includes(onceKey)) return [];
      return [onceKey ? { ...r, onceKey } : r];
    })
    .sort((a, b) => weight(a) - weight(b));
}

/** Casting terms given by a "play from a zone" permission. */
function playFromTerms(r: PlayFromZone, source: "graveyard" | "library"): CastTerms {
  return {
    // Iroh, Grand Lotus: the card has flashback (exiled afterwards), for its mana cost or the given cost.
    source: r.flashback && source === "graveyard" ? "flashback" : source,
    ...(r.mayhem ? { mayhem: true } : {}),
    // Granted sneak: its cost, in the declare blockers step (the timing is already checked by `playFromRules`).
    ...(r.sneak ? { costOverride: r.sneak, sneakGranted: true, anyTime: true } : {}),
    ...(r.cost ? { costOverride: r.cost } : {}),
    playFrom: r,
    ...(r.payLife ? { payLife: r.payLife } : {}),
    ...(r.forage ? { forage: true } : {}),
    ...(r.finality ? { finality: true } : {}),
    ...(r.anyMana ? { anyMana: true } : {}),
    ...(r.onceKey ? { onceKey: r.onceKey } : {}),
  };
}

/**
 * Kicker without mana (FIN, WOE's bargain): the permanents that can pay it, the least valuable first (tokens, then by
 * increasing mana value). The player chooses (`CastChoices.sacrifice`); without a choice, the first one.
 */
export function kickerCostOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  targeted: ObjectId[] = [],
): ObjectId[] {
  const f =
    d.kicker?.pay?.sacrifice ??
    d.kicker?.pay?.bounce ??
    (d.kicker?.pay?.blight ? ({ types: ["Creature"] } as ObjectFilter) : undefined);
  if (!f) return [];
  // A cost is paid after targets are chosen (601.2h): a target can pay it. Targets come last (default choice), then the
  // cheapest, tokens first.
  const mv = (id: ObjectId) => (s.objects[id]?.isToken ? -1 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost));
  // Blight: like `blightTarget`, first a creature that survives (the toughest), otherwise the least valuable.
  const n = d.kicker?.pay?.blight ?? 0;
  const left = (id: ObjectId) => chars(s, id).toughness - (s.objects[id]?.damage ?? 0) - n;
  const value = (id: ObjectId) => (n > 0 ? (left(id) > 0 ? -left(id) - 100 : mv(id)) : mv(id));
  const rank = (id: ObjectId) => (targeted.includes(id) ? 1000 : 0) + value(id);
  return s.battlefield
    .filter((id) => id !== card && s.objects[id]?.controller === player && matchesObjectFilter(s, player, id, f, card))
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * Collect evidence N (701.59, Murders at Karlov Manor): cards from your graveyard with total mana value N or greater,
 * chosen automatically; null if impossible.
 */
export function evidenceCards(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  n: number,
  keep: readonly ObjectId[] = [],
): ObjectId[] | null {
  return pickEvidence(
    s,
    (s.players[player]?.graveyard ?? []).filter((id) => id !== card && !keep.includes(id)),
    n,
  );
}

/**
 * Automatic choice of evidence among `pool`: at each step, the cheapest card that is enough to reach N, otherwise the
 * most expensive (few cards exiled, without wasting an expensive card on a small N); null if the total is not enough.
 */
export function pickEvidence(s: GameState, pool: ObjectId[], n: number): ObjectId[] | null {
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const left = [...pool].sort((a, b) => mv(a) - mv(b));
  if (left.reduce((t, id) => t + mv(id), 0) < n) return null;
  const out: ObjectId[] = [];
  let total = 0;
  while (total < n && left.length) {
    const i = left.findIndex((id) => total + mv(id) >= n);
    const id = (i >= 0 ? left.splice(i, 1) : left.splice(left.length - 1, 1))[0] as ObjectId;
    out.push(id);
    total += mv(id);
  }
  return total >= n ? out : null;
}

/**
 * "Exile N cards from your graveyard" (Soaring Stoneglider's kicker): chosen automatically, lands first then the
 * cheapest; null if there are not enough.
 */
export function graveyardToExile(s: GameState, player: PlayerId, card: ObjectId, n: number): ObjectId[] | null {
  const mv = (id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
  const land = (id: ObjectId) => (s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land") ? 0 : 1);
  const pool = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
  if (pool.length < n) return null;
  return [...pool].sort((a, b) => land(a) - land(b) || mv(a) - mv(b)).slice(0, n);
}

/** Collects evidence (701.59): the cards are exiled, and "whenever you collect evidence" triggers. */
export function collectEvidence(s: GameState, player: PlayerId, cards: ObjectId[]): ObjectId[] {
  const exiled = cards.map((id) => moveObject(s, id, "exile")).filter((id): id is ObjectId => !!id);
  rulesEvent(s, { e: "collectEvidence", player });
  return exiled;
}

/** The permanent that pays the manaless kicker by default, if there is one. */
export function kickerCostPermanent(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  exclude: ObjectId[] = [],
): ObjectId | undefined {
  return kickerCostOptions(s, player, card, d, exclude)[0];
}

/**
 * Harmonize (702.180): untapped creatures the player can tap to reduce the harmonize cost by its power, and the default
 * choice for a generic cost `generic`: the smallest power that covers the whole generic part, otherwise the greatest
 * (none if the cost has no generic part).
 */
export function harmonizeOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  generic: number,
): { options: ObjectId[]; powers: Record<ObjectId, number>; suggested: ObjectId[] } {
  const options = s.battlefield.filter((id) => {
    const o = obj(s, id);
    return id !== card && o.controller === player && !o.tapped && isCreature(s, id) && chars(s, id).power > 0;
  });
  const powers = Object.fromEntries(options.map((id) => [id, chars(s, id).power]));
  const byPower = [...options].sort((a, b) => (powers[a] ?? 0) - (powers[b] ?? 0));
  // By default: the weakest one that is enough, first among creatures without a mana ability (a land creature tapped for
  // harmonize could no longer pay the rest of the cost, Restless Reef).
  const pick = (ids: ObjectId[]) => ids.find((id) => (powers[id] ?? 0) >= generic) ?? ids[ids.length - 1];
  const plain = byPower.filter((id) => manaAbilitiesOf(s, id).length === 0);
  const best = plain.find((id) => (powers[id] ?? 0) >= generic) ?? pick(byPower);
  return { options, powers, suggested: generic > 0 && best ? [best] : [] };
}

/** Total cost of a spell: base, flashback or alternative cost (or nothing), X, kicker, reductions. */
/**
 * What an alternative cost pays on top (Force of Will, Daze, the Flares, emerge), as cost slots (PLAN-M M6): the cards
 * exiled from the hand (suggestion: the cheapest first), the returned permanent (a tapped one first), the sacrificed
 * permanents (emerge: the greatest mana value, hence the biggest reduction; otherwise the lowest); `null` if it is
 * impossible. Every slot is `when: "alternative"`.
 */
export function altCostPicks(s: GameState, player: PlayerId, card: ObjectId, pay: AltCostPay): CostPick[] | null {
  const pl = s.players[player];
  if (!pl || (pay.life !== undefined && payableLife(s, player) < pay.life)) return null;
  const out: CostPick[] = [];
  if (pay.exileFromHand) {
    const f = pay.exileFromHand;
    const cards = pl.hand
      .filter((id) => id !== card && matchesCard(s, player, id, f.filter))
      .sort((a, b) => manaValue(s.defs[obj(s, a).defId]?.manaCost) - manaValue(s.defs[obj(s, b).defId]?.manaCost));
    if (cards.length < f.count) return null;
    out.push({
      slot: "handExile",
      label: msg("Alternative cost: exile {n} card(s) from your hand", { n: f.count }),
      count: f.count,
      options: cards,
      suggested: cards.slice(0, f.count),
      when: "alternative",
    });
  }
  if (pay.bounce) {
    const options = s.battlefield
      .filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, pay.bounce as ObjectFilter))
      .sort((a, b) => Number(obj(s, b).tapped) - Number(obj(s, a).tapped));
    if (options.length === 0) return null;
    out.push({
      slot: "altReturn",
      label: msg("Alternative cost: the permanent to return to its owner's hand"),
      count: 1,
      options,
      suggested: options.slice(0, 1),
      when: "alternative",
    });
  }
  const sac = pay.sacrificeReduce
    ? { filter: pay.sacrificeReduce, count: 1, order: "greatest" as const }
    : pay.sacrifice
      ? { ...pay.sacrifice, order: "lowest" as const }
      : undefined;
  if (sac) {
    const options = emergeCandidates(s, player, sac.filter, sac.order);
    if (options.length < sac.count) return null;
    out.push({
      slot: "altSacrifice",
      label: pay.sacrificeReduce
        ? msg("Emerge: the creature to sacrifice (the cost is reduced by its mana value)")
        : msg("Alternative cost: sacrifice {n} permanent(s)", { n: sac.count }),
      count: sac.count,
      options,
      suggested: options.slice(0, sac.count),
      when: "alternative",
    });
  }
  return out;
}

/**
 * What an alternative cost pays on top (Force of Will, Daze): the objects chosen by the player (`picks`, checked),
 * otherwise the suggestions of `altCostPicks`; `null` if it is impossible.
 */
export function altCostPayment(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  pay: AltCostPay,
  picks?: CastChoices["picks"],
): { exile: ObjectId[]; bounce?: ObjectId; sacrifice?: ObjectId[] } | null {
  const slots = altCostPicks(s, player, card, pay);
  if (!slots) return null;
  const chosen = (slot: CostSlot) => {
    const p = slots.find((x) => x.slot === slot);
    return p ? resolvePick(s, p, picks?.[slot]) : undefined;
  };
  const exile = chosen("handExile") ?? [];
  const bounce = chosen("altReturn")?.[0];
  const sacrifice = chosen("altSacrifice");
  return { exile, ...(bounce ? { bounce } : {}), ...(sacrifice ? { sacrifice } : {}) };
}

/** Emerge (702.119): the sacrificed permanent, chosen automatically (the greatest mana value, hence the biggest reduction). */
function emergeVictim(s: GameState, player: PlayerId, f: ObjectFilter): ObjectId | undefined {
  return emergeCandidates(s, player, f, "greatest")[0];
}

/** Total mana value of the targeted permanents (Urgent Necropsy's evidence). */
function targetsManaValue(s: GameState, targets: ObjectId[]): number {
  return targets.reduce((n, id) => n + (s.objects[id]?.zone === "battlefield" ? (snapshot(s, id).manaValue ?? 0) : 0), 0);
}

/**
 * Forage (701.61) as a cost: three cards from the graveyard or a Food (`oneOf`); suggestion: the automatic choice
 * (`forageOptions`). Null if it is impossible. `except`: the spell cast from the graveyard.
 */
function foragePick(s: GameState, player: PlayerId, except?: ObjectId, when?: CostPick["when"]): CostPick | null {
  const f = forageOptions(s, player, except);
  if (!f.suggested) return null;
  const graveyard = f.graveyard.length >= 3 ? f.graveyard : [];
  return {
    slot: "forage",
    label: msg("Forage: exile three cards from your graveyard or sacrifice a Food"),
    count: f.suggested.length,
    options: [...graveyard, ...f.foods],
    suggested: f.suggested,
    oneOf: [
      ...(graveyard.length ? [{ count: 3, options: graveyard }] : []),
      ...(f.foods.length ? [{ count: 1, options: f.foods }] : []),
    ],
    ...(when ? { when } : {}),
  };
}

/** The permanents that can be sacrificed for an alternative cost, in the order of the default choice. */
function emergeCandidates(s: GameState, player: PlayerId, f: ObjectFilter, order: "greatest" | "lowest"): ObjectId[] {
  const mv = (id: ObjectId) => snapshot(s, id).manaValue ?? 0;
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f))
    .sort((a, b) => (order === "greatest" ? mv(b) - mv(a) : mv(a) - mv(b)));
}

/** A mana cost paid N times (replicate, cumulative upkeep). */
export function timesCost(c: ManaCost, n: number): ManaCost {
  const colored: ManaCost["colored"] = {};
  for (const [k, v] of Object.entries(c.colored)) colored[k as ManaType] = (v ?? 0) * n;
  return { ...c, generic: c.generic * n, colored, ...(c.hybrid ? { hybrid: Array(n).fill(c.hybrid).flat() } : {}) };
}

/** K'rrik, Son of Yawgmoth: "for each {B} in a cost, you may pay 2 life rather than pay that mana" (Phyrexian mana). */
function asPhyrexian(s: GameState, player: PlayerId, cost: ManaCost): ManaCost {
  let out = cost;
  for (const { ab } of playerStatics(s, player, "phyrexianMana")) {
    const m = ab.phyrexianMana;
    const n = m ? (out.colored[m] ?? 0) : 0;
    if (!m || !n) continue;
    out = { ...out, colored: { ...out.colored, [m]: 0 }, phyrexian: [...(out.phyrexian ?? []), ...Array<ManaType>(n).fill(m)] };
  }
  return out;
}

export function spellCost(
  s: GameState,
  player: PlayerId,
  d: CardDef,
  opts: {
    x?: number;
    kicked?: boolean;
    flashback?: boolean;
    /** Without paying the mana cost (118.9): X is 0, the kicker can still be paid. */
    free?: boolean;
    /** The card's alternative cost (Blasphemous Edict). */
    alternative?: boolean;
    /** Mana of any type can be spent: colored symbols become generic. */
    anyMana?: boolean;
    /** Cast for its mayhem cost (Mayhem). */
    mayhem?: boolean;
    /** Cost replacing the mana cost (airbending: {2}). */
    costOverride?: ManaCost;
    /** Chosen targets ("if this spell targets…" reduction); absent: the most favorable target is assumed. */
    targets?: Record<string, string[]>;
    /** Zone the spell is cast from (reductions and taxes "from a graveyard or from exile"). */
    fromZone?: CastTerms["source"];
    /** The cast card (reduction conditions that exclude it: behold). */
    card?: ObjectId;
    /** Behold done (additional cost `behold`); absent: done if possible. */
    beheld?: boolean;
    /** Emerge: the sacrificed permanent (`altSacrifice`); absent: the default choice. */
    victim?: ObjectId;
  },
): ManaCost {
  const empty: ManaCost = { generic: 0, colored: {}, x: 0 };
  const alt = opts.alternative ? altCostFor(s, player, d) : undefined;
  // Emerge: the alternative cost is reduced by the mana value of the sacrificed permanent.
  const victim = alt?.pay?.sacrificeReduce ? (opts.victim ?? emergeVictim(s, player, alt.pay.sacrificeReduce)) : undefined;
  const altMana =
    alt && victim ? { ...alt.mana, generic: Math.max(0, alt.mana.generic - (snapshot(s, victim).manaValue ?? 0)) } : alt?.mana;
  const base = opts.free
    ? empty
    : alt
      ? (altMana as ManaCost)
      : opts.flashback
        ? (opts.costOverride ?? castOption(d, "flashback")?.cost ?? d.manaCost)
        : opts.mayhem
          ? (castOption(d, "mayhem")?.cost ?? d.manaCost)
          : (opts.costOverride ?? d.manaCost);
  // "This spell costs {1}{U} less to cast" (Brush Off): the colored symbols removed from the base cost.
  const ownColored = d.costReduction?.colored;
  const base1 =
    base && ownColored && !opts.free && ownReductionApplies(s, player, d, opts.targets, opts.card, opts.kicked)
      ? withoutColored(base, ownColored)
      : base;
  // Waterbend as an additional cost (Avatar): {N} or {X} more, to pay even without paying the mana cost.
  const add = d.additionalCost;
  const bend = (add?.waterbend ?? 0) + (add?.xCost === "waterbend" ? Math.max(0, opts.x ?? 0) : 0);
  const bendCost: ManaCost | undefined = bend ? { generic: bend, colored: {}, x: 0 } : undefined;
  // Replicate (702.56), squad (702.157): the cost paid X times.
  const replicated = kickerPaidTimes(d) && d.kicker && (opts.x ?? 0) > 0 ? timesCost(d.kicker.mana, opts.x ?? 0) : undefined;
  const kick = replicated ?? (opts.kicked && d.kicker ? d.kicker.mana : undefined);
  const extra = kick ? (bendCost ? totalCost(kick, 0, bendCost) : kick) : bendCost;
  const reduction = spellReduction(s, player, d, opts.targets, opts.fromZone, opts.card, opts.kicked);
  let cost0 = totalCost(
    base1,
    opts.free ? 0 : (opts.x ?? 0),
    extra,
    // 601.2f / 118.9d: a spell cast without paying its mana cost still pays the increases (Thalia, the Survivor); a
    // reduction doesn't go below zero.
    reduction.generic,
  );
  // Officious Interrogation: "costs {W}{U} more to cast for each target beyond the first".
  const perTarget = add?.costPerExtraTarget;
  const extraTargets = perTarget && opts.targets ? Math.max(0, flatTargets(opts.targets).length - 1) : 0;
  for (let i = 0; i < extraTargets && perTarget; i++) cost0 = totalCost(cost0, 0, perTarget);
  // Feed the Cycle: "forage or pay {B}" — the mana is added unless one forages (alternative cost).
  const cost1 = add?.forageOrPay && !alt?.forage ? totalCost(cost0, 0, add.forageOrPay) : cost0;
  // Wild Unraveling: "blight 2 or pay {1}" — the mana is added unless one blights (kicker).
  const cost1b = d.kicker?.orPay && !opts.kicked ? totalCost(cost1, 0, d.kicker.orPay) : cost1;
  // "Behold a Dragon or pay {1}": the mana is added without beholding (by default: behold if possible).
  const behold = add?.behold;
  const beheld = opts.beheld ?? (!!behold && beholdOptions(s, player, opts.card ?? "", behold.filter, behold.exiled).length > 0);
  const cost2 = behold?.orPay && !beheld ? totalCost(cost1b, 0, behold.orPay) : cost1b;
  // Aang, Master of Elements: "{W}{U}{B}{R}{G} less"; a symbol with no match in the cost reduces the generic part.
  const symbols = playerStatics(s, player, "spellCost").filter(
    ({ ab }) => ab.spellCost?.colored && matchesView(spellView(d, player), ab.spellCost.filter, player),
  );
  const cost = withoutColored(
    symbols.reduce((c, { ab }) => withoutColored(c, ab.spellCost?.colored ?? {}), cost2),
    reduction.colored,
  );
  // Case File Auditor: "as though it were mana of any color" for the matching spells.
  const anyMana =
    opts.anyMana ||
    playerStatics(s, player, "spellCost").some(
      ({ ab }) => ab.spellCost?.anyMana && matchesView(spellView(d, player), ab.spellCost.filter, player),
    );
  if (!anyMana) return asPhyrexian(s, player, cost);
  const colored =
    Object.values(cost.colored).reduce<number>((n, k) => n + (k ?? 0), 0) +
    (cost.hybrid?.length ?? 0) +
    (cost.twoHybrid?.length ?? 0);
  return { generic: cost.generic + colored, colored: {}, x: 0 };
}

/** Terms for casting a card from its current zone. */
export interface CastTerms {
  /** Only the card's Adventure (permission "cast it as an Adventure", Mosswood Dreadknight). */
  adventureOnly?: boolean;
  /** Cast for a granted sneak (Ninja Teen): an unblocked attacker is returned, the permanent enters attacking. */
  sneakGranted?: boolean;
  /** {N} more (Lightstall Inquisitor). */
  extraCost?: number;
  /** Castable from here only with warp (Timeline Culler, from the graveyard). */
  warpOnly?: boolean;
  /** Mayhem: cast from the graveyard for its mayhem cost, discarded this turn. */
  mayhem?: boolean;
  /** Airbending: cast for this cost rather than for its mana cost. */
  costOverride?: ManaCost;
  /** The replacement cost is a waterbend cost (Hama, the Bloodbender). */
  waterbendOverride?: boolean;
  source: "hand" | "graveyard" | "exile" | "flashback" | "library" | "command";
  /** Must be cast without paying its mana cost (Etali). */
  free?: boolean;
  /** May be cast without paying its mana cost, by choice (Omniscience). */
  freeOptional?: boolean;
  /** Ignores timing restrictions (Etali: cast during resolution, approximation). */
  anyTime?: boolean;
  /** Mana of any type can be spent (Tinybones). */
  anyMana?: boolean;
  /** Muldrotha: permanent type used. */
  graveyardType?: string;
  /** Quilled Greatwurm: counters to remove from among your creatures. */
  removeCounters?: number;
  /** Permission usable once each turn (Maralen): key recorded in `turn.onceFired` on casting. */
  onceKey?: string;
  /** Free permission once each turn (Zaffai): consumed only if the spell is cast without paying. */
  freeOnceKey?: string;
  /** Life paid in addition (Wickerfolk Indomitable, from the graveyard). */
  payLife?: number;
  /** Only when one could cast a sorcery (plotted card). */
  sorceryTiming?: boolean;
  /** Exiled (`exile`, Quistis Trepe) or put on the bottom of the library (`bottom`, Kylox's Voltstrider) instead of the graveyard. */
  after?: "exile" | "bottom";
  /** The permanent enters with a finality counter (Noctis). */
  finality?: boolean;
  /** Must also forage (Osteomancer Adept). */
  forage?: boolean;
  /** "Play from a zone" permission used (family C): subtypes on entering, one-shot use consumed. */
  playFrom?: PlayFromZone;
  /** Harmonize granted (Songcrafter Mage) to a card cast from the graveyard. */
  harmonize?: boolean;
  /** A creature spell cast this way gains haste (suspend, 702.62a). */
  haste?: boolean;
}

/** 702.170: the card (from the hand or the stack) is exiled face up and becomes plotted. */
export function plotCard(s: GameState, id: ObjectId): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  const player = o.owner;
  const onStack = s.stack.findIndex((x) => x.id === id);
  if (onStack >= 0) s.stack.splice(onStack, 1);
  // Already exiled (Kellan Joins Up: "exile a card from your hand; it becomes plotted"): it stays there.
  const exiled = o.zone === "exile" ? id : moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (!card) return null;
  card.exiledVia = { kind: "plot", turn: s.turn.number };
  emit({ type: "plotted", player, defId: card.defId });
  rulesEvent(s, { e: "plotted", card: card.id });
  // "When this card becomes plotted": the card is in exile, the ability triggers from there.
  for (const ab of s.defs[card.defId]?.abilities ?? []) {
    if (ab.kind === "triggered" && ab.trigger.on === "action" && ab.trigger.action === "plotted" && ab.trigger.self) {
      pushInline(s, player, card.id, card.defId, { targets: ab.targets, effects: ab.effects, label: ab.label });
    }
  }
  return card.id;
}

/** Suspend (702.62): the card (in hand, or the spell on the stack) is exiled with N time counters. */
export function suspendCard(s: GameState, id: ObjectId, time: number): void {
  const o = s.objects[id];
  if (!o) return;
  if (o.zone === "stack") {
    // The spell leaves the stack without being countered (a copy simply ceases to exist).
    const i = s.stack.findIndex((x) => x.id === id && x.kind === "spell");
    const item = s.stack[i];
    if (!item || item.copy) return;
    s.stack.splice(i, 1);
  } else if (o.zone !== "hand") return;
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to: "exile" });
  const exiled = moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (card?.zone !== "exile") return;
  card.suspended = true;
  changeCounters(s, card, "time", time);
}

/** Foretell (702.143a): the card is exiled from the hand; its owner may cast it on a later turn. */
export function foretellCard(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "hand") return;
  const exiled = moveObject(s, id, "exile");
  const card = exiled ? s.objects[exiled] : undefined;
  if (!card) return;
  card.exiledVia = { kind: "foretell", turn: s.turn.number };
  // Exiled face down: only its owner may look at it (702.143a).
  card.exiledFaceDown = [card.owner];
  emit({ type: "foretold", player: card.owner, defId: card.defId });
}

/** From where, and on what terms, may this player cast this card? */
/** 702.61: a spell with split second is on the stack — only mana abilities remain possible. */
export function splitSecondOnStack(s: GameState): boolean {
  // Yuriko, Blade of the Mighty: "during combat, players can't cast spells or activate abilities (other than mana
  // abilities)": like split second, for everyone.
  if (
    inCombat(s) &&
    s.playerOrder.some((p) =>
      playerStatics(s, p, "castLimit").some(
        ({ ab }) => ab.castLimit?.who === "each" && ab.castLimit.during === "combat" && ab.castLimit.abilities === "all",
      ),
    )
  )
    return true;
  return s.stack.some((item) => {
    if (item.kind !== "spell") return false;
    const d = s.defs[item.sourceDefId];
    return !!d && spellHasKeyword(s, item.controller, d, "splitSecond");
  });
}

/** Minimal context to evaluate an amount outside resolution (cost reductions). */
function reductionContext(s: GameState, controller: PlayerId, sourceId: string, sourceDefId: string) {
  return staticContext(s, controller, sourceId, { sourceDefId });
}

/**
 * The ability as it is paid: a cost replaced by nothing ("pay {0} rather than pay the equip cost", Kíli the Resourceful)
 * if a matching modifier applies; otherwise the ability itself. `legal.ts` and `activateAbility` read it, so the options
 * offered and the activation agree.
 */
export function abilityAsPaid(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ActivatedAbilityDef {
  return freeCostGiver(s, player, source, ab) ? { ...ab, cost: { mana: { generic: 0, colored: {}, x: 0 } } } : ab;
}

/** The modifier that lets this ability be paid with {0} (Kíli the Resourceful), with its source, if one applies. */
function freeCostGiver(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): { id?: ObjectId } | undefined {
  return playerStatics(s, player, "abilityCost").find(({ id, ab: x }) => {
    const m = x.abilityCost;
    if (!m?.free || (m.ability && !isAbilityKind(ab, m.ability)) || (m.notSelf && id === source)) return false;
    return !m.source || matchesObjectFilter(s, player, source, m.source);
  });
}

/**
 * Kíli the Resourceful (PLAN-M M6): "you may pay {0} rather than pay the equip cost" — the choice between {0} (`free`,
 * the suggestion) and the printed cost (`printed`), a payment detail (`autoOk`). Offered only when the printed cost is
 * mana alone and payable for each offered target (`targets`: the legal targets "t", when the cost depends on it).
 */
export function freeCostPick(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  printed: ActivatedAbilityDef,
  index: number,
  targets?: ObjectId[],
): CostPick | undefined {
  const giver = freeCostGiver(s, player, source, printed);
  const mana = printed.cost.mana;
  if (!giver || !mana || mana.x) return undefined;
  if (Object.entries(printed.cost).some(([k, v]) => k !== "mana" && v !== undefined)) return undefined;
  if (!canPayNonManaCost(s, source, printed, index)) return undefined;
  const payable = (t: ObjectId | "best") =>
    canPay(s, player, abilityManaCost(s, player, source, printed, t), undefined, abilityPurpose(source, printed));
  if (costDependsOnTarget(printed) ? !targets?.length || !targets.every(payable) : !payable("best")) return undefined;
  const cost = costToText(mana);
  return {
    slot: "freeCost",
    label: giver.id
      ? msg("{card}: pay {free} rather than pay the cost ({cost})?", { card: cardRefOf(s, giver.id), free: "{0}", cost })
      : msg("Pay {free} rather than pay the cost ({cost})?", { free: "{0}", cost }),
    count: 1,
    options: ["free", "printed"],
    labels: { free: msg("Pay {cost}", { cost: "{0}" }), printed: msg("Pay {cost}", { cost }) },
    suggested: ["free"],
    autoOk: true,
  };
}

/**
 * Cost modifiers of activated abilities (family A): Boom Scholar (exhaust of your other permanents), Mutagen Man (your
 * artifact tokens), Kíli the Resourceful (first equip of the turn free), Inquisitive Glimmer (unlock), Doc Aurlock
 * (plot).
 */
function abilityCostReduction(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): number {
  const kind = (m: AbilityCostMod) => !m.ability || isAbilityKind(ab, m.ability);
  let n = 0;
  for (const { id, ab: x } of playerStatics(s, player, "abilityCost")) {
    const m = x.abilityCost;
    if (!m || !kind(m) || (m.notSelf && id === source)) continue;
    if (m.source && !matchesObjectFilter(s, player, source, m.source)) continue;
    const by = id ?? source;
    let k =
      m.reduce === undefined
        ? 0
        : typeof m.reduce === "number"
          ? m.reduce
          : evalAmount(s, reductionContext(s, player, by, s.objects[by]?.defId ?? ""), m.reduce);
    // "Can't reduce the mana in that cost to less than one mana": at most the mana value minus one.
    if (m.minOneMana) k = Math.min(k, Math.max(0, manaValue(ab.cost.mana ?? null) - 1));
    n += Math.max(0, k);
  }
  return n;
}

/**
 * Mana cost of an activated ability: the printed one, or, for a power-up of a source that entered this turn, that cost
 * minus the source's mana cost (generic and colored symbols).
 */
/**
 * Part of a spell payable by waterbending: its additional cost "waterbend {N}" or "{X}", and its kicker if it is one
 * ("you may waterbend {N}").
 */
export function waterbendAmount(d: CardDef, kicked: boolean, x: number): number {
  return (
    (d.additionalCost?.waterbend ?? 0) +
    (d.additionalCost?.xCost === "waterbend" ? Math.max(0, x) : 0) +
    (kicked && d.kicker?.kind === "waterbend" ? d.kicker.mana.generic : 0)
  );
}

const ABILITY_KINDS: readonly AbilityKind[] = ["exhaust", "equip", "unlock", "plot", "powerUp", "turnFaceUp"];

/** Is the activated ability (or the special action) of this kind? */
export function isAbilityKind(ab: ActivatedAbilityDef, kind: AbilityKind): boolean {
  switch (kind) {
    case "exhaust":
      return !!ab.exhaust;
    case "equip":
      return !!ab.equip;
    case "unlock":
      return !!ab.specialAction && ab.effects.some((e) => e.op === "unlockDoor");
    case "turnFaceUp":
      return !!ab.specialAction && ab.effects.some((e) => e.op === "turnFaceUp");
    case "plot":
      return ab.effects.some((e) => e.op === "exileToCast" && e.kind === "plot");
    case "powerUp":
      return !!ab.powerUp;
  }
}

/**
 * What the mana of an activated ability is spent on: its source, its kinds (restricted mana: "activate an equip
 * ability"), and waterbending (the whole cost is one, X included).
 */
export function abilityPurpose(source: ObjectId, ab: ActivatedAbilityDef): ManaPurpose {
  const kinds = ABILITY_KINDS.filter((k) => isAbilityKind(ab, k));
  return {
    abilitySource: source,
    ...(kinds.length ? { abilityKinds: kinds } : {}),
    ...(ab.cost.tapToPay === "waterbend" ? { waterbend: Number.POSITIVE_INFINITY } : {}),
    ...(ab.cost.tapToPay === "convoke" ? { convoke: true } : {}),
  };
}

export function abilityMana(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ManaCost | undefined {
  const m = printedAbilityMana(s, source, ab);
  const o = s.objects[source];
  if (!m || !o) return m;
  // Agatha's Soul Cauldron: the mana is spent as though it were mana of any type (colored symbols become
  // generic).
  const any = playerStatics(s, o.controller, "abilityCost").some(
    ({ ab: x }) =>
      x.abilityCost?.anyMana && (!x.abilityCost.source || matchesObjectFilter(s, o.controller, source, x.abilityCost.source)),
  );
  if (!any) return m;
  // "Of any color": {C} is still owed as colorless mana.
  const colored =
    Object.entries(m.colored).reduce<number>((n, [k, v]) => (k === "C" ? n : n + (v ?? 0)), 0) +
    (m.hybrid?.length ?? 0) +
    (m.twoHybrid?.length ?? 0);
  return { generic: m.generic + colored, colored: m.colored.C ? { C: m.colored.C } : {}, x: m.x };
}

function printedAbilityMana(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ManaCost | undefined {
  const m = ab.cost.mana;
  const o = s.objects[source];
  if (!m || !ab.powerUp || !o || o.controlledSince !== s.turn.number) return m;
  const own = s.defs[o.defId]?.manaCost;
  if (!own) return m;
  const colored: ManaCost["colored"] = {};
  for (const [k, n] of Object.entries(m.colored)) {
    const left = (n ?? 0) - (own.colored[k as ManaType] ?? 0);
    if (left > 0) colored[k as ManaType] = left;
  }
  return { ...m, generic: Math.max(0, m.generic - own.generic), colored };
}

/** Does the ability's own reduction read its target ("{1} less for each color of target creature")? */
function reductionReadsTarget(ab: ActivatedAbilityDef): boolean {
  const red = ab.reduction;
  if (!red) return false;
  let hit = readsTargetMemo.get(red);
  if (hit === undefined) {
    hit = JSON.stringify(red.generic).includes('"kind":"target"');
    readsTargetMemo.set(red, hit);
  }
  return hit;
}
const readsTargetMemo = new WeakMap<object, boolean>();

/**
 * Reduction specific to an ability's target: its own reduction when it reads the target (Warrior's Blades: "for each
 * +1/+1 counter on target creature"; Dragonfire Blade: "for each color of target creature"), the equip reductions of
 * the targeted creature.
 */
function targetReduction(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  target: ObjectId | undefined,
): number {
  if (!target || !s.objects[target]) return 0;
  let own = 0;
  const red = ab.reduction;
  if (red && reductionReadsTarget(ab) && (!red.condition || checkCondition(s, red.condition, player, source))) {
    const ctx = reductionContext(s, player, source, s.objects[source]?.defId ?? "");
    own = Math.max(0, evalAmount(s, { ...ctx, targets: { [ab.targets?.[0]?.id ?? "t"]: [target] } }, red.generic));
  }
  return own + equipDiscount(s, player, ab, target);
}

/** Does the ability have a cost that depends on its target? */
export function costDependsOnTarget(ab: ActivatedAbilityDef): boolean {
  return reductionReadsTarget(ab) || !!ab.equip;
}

/**
 * Mana cost of an activated ability, reductions included (the only computation, shared by `legal.ts` and
 * `activateAbility`): for a given target, or `"best"` (the most favorable target, to know whether the ability can be
 * offered).
 */
export function abilityManaCost(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  target: ObjectId | undefined | "best",
  x = 0,
): ManaCost {
  const byTarget =
    target === "best"
      ? costDependsOnTarget(ab)
        ? Math.max(0, ...s.battlefield.map((c) => targetReduction(s, player, source, ab, c)))
        : 0
      : targetReduction(s, player, source, ab, target);
  // A special action (turning face up, plotting, unlocking) is not an activated ability: Agatha's Soul Cauldron ("to
  // activate abilities") doesn't apply to it.
  const mana = ab.specialAction ? ab.cost.mana : abilityMana(s, source, ab);
  return asPhyrexian(s, player, totalCost(mana, x, undefined, byTarget + abilityReduction(s, player, source, ab)));
}

export function abilityReduction(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): number {
  const mods = abilityCostReduction(s, player, source, ab);
  const red = ab.reduction;
  const tax = chosenNameTax(s, source) - mods;
  // A reduction that reads the target is counted with the target (`targetReduction`).
  if (!red || reductionReadsTarget(ab)) return -tax;
  // "This ability costs {N} less to activate" (Starport Security, Survey Mechan, The Dominion Bracelet).
  if (red.condition && !checkCondition(s, red.condition, player, source)) return 0;
  return -tax + Math.max(0, evalAmount(s, reductionContext(s, player, source, s.objects[source]?.defId ?? ""), red.generic));
}

/**
 * One-shot ability still available: not activated yet, or fewer times than allowed (Wonder Man, Hollywood Hero: "each
 * power-up of permanents you control can be activated an additional time").
 */
function onceAvailable(s: GameState, o: GameObject, ab: ActivatedAbilityDef, index: number): boolean {
  const uses = (o.used ?? []).filter((i) => i === index).length;
  const extra = ab.powerUp
    ? playerStatics(s, o.controller, "powerUpExtraUses").reduce((n, { ab: x }) => n + (x.powerUpExtraUses ?? 0), 0)
    : 0;
  return uses < 1 + extra;
}

/**
 * Baron Helmut Zemo: the cards of the color in the graveyard to exile to total N symbols of that color (richest first),
 * or null if it is impossible.
 */
export function symbolCards(s: GameState, player: PlayerId, req: { color: ManaType; n: number }): ObjectId[] | null {
  const symbols = (id: ObjectId) => colorSymbols(s, id, req.color);
  const pool = (s.players[player]?.graveyard ?? [])
    .filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.colors.includes(req.color as Color))
    .sort((a, b) => symbols(b) - symbols(a));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of pool) {
    if (total >= req.n) break;
    out.push(id);
    total += symbols(id);
  }
  return total >= req.n ? out : null;
}

/** Mana symbols of a color in a card's mana cost (hybrid symbols included). */
function colorSymbols(s: GameState, id: ObjectId, color: ManaType): number {
  const c = s.defs[s.objects[id]?.defId ?? ""]?.manaCost;
  return c ? (c.colored[color] ?? 0) + (c.hybrid ?? []).filter((h) => h.includes(color)).length : 0;
}

/** Elvish Refueler: during your turn, as long as no exhaust ability has been activated this turn. */
function exhaustReusable(s: GameState, player: PlayerId, ab: ActivatedAbilityDef): boolean {
  return (
    !!ab.exhaust &&
    s.turn.active === player &&
    !(s.players[player]?.turnStats.exhaustActivated ?? 0) &&
    playerStatic(s, player, "exhaustReuse")
  );
}

/**
 * Warp of a card: its own, or the one Tannuk, Steadfast Second grants to the cards in your hand
 * ("artifact cards and red creature cards in your hand have warp {2}{R}").
 */
export function warpOf(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
): { cost: ManaCost; life?: number; fromGraveyard?: boolean } | undefined {
  const own = castOption(d, "warp");
  if (own) return own;
  const o = s.objects[card];
  if (o?.zone !== "hand") return undefined;
  for (const { ab } of playerStatics(s, player, "grantWarp")) {
    if (ab.grantWarp && matchesView(spellView(d, player), ab.grantWarp.filter, player)) {
      return { cost: ab.grantWarp.cost };
    }
  }
  return undefined;
}

/** Face-down spell (disguise): the "face-down" definition, costing {3} (702.168a). */
export const FACE_DOWN_SPELL: CardDef = { ...FACE_DOWN_DEF, manaCost: { generic: 3, colored: {}, x: 0 }, manaCostText: "{3}" };

/**
 * Castable faces of a card: the card itself (front) and, for an adventurer card, the Adventure (face 1), unless the card
 * is already "on an adventure" (then only the creature can be cast).
 */
export function castableFaces(s: GameState, card: ObjectId, d: CardDef): [number | undefined, CardDef][] {
  const o = s.objects[card];
  const adventure = d.layout === "adventure" ? d.faceDefs?.[1] : undefined;
  // Land card with an Adventure (FIN towns): only the Adventure is cast.
  if (d.types.includes("Land")) return adventure && !o?.onAdventure ? [[1, adventure]] : [];
  if (adventure && !o?.onAdventure)
    return [
      [undefined, d],
      [1, adventure],
    ];
  // Split card (709.3): either half is cast (doors of a Room included); with fuse (702.102), both halves together from
  // the hand (third face, built at import).
  if (d.layout === "split" && (d.faceDefs?.length ?? 0) >= 2) {
    const halves: [number, CardDef][] = [
      [0, d.faceDefs?.[0] as CardDef],
      [1, d.faceDefs?.[1] as CardDef],
    ];
    const fused = d.faceDefs?.[2];
    return fused && o?.zone === "hand" ? [...halves, [2, fused]] : halves;
  }
  // Modal double-faced card (712.12): either face is cast.
  const back = d.layout === "modal_dfc" ? d.faceDefs?.[1] : undefined;
  if (back && !back.types.includes("Land"))
    return [
      [undefined, d],
      [1, back],
    ];
  return [[undefined, d]];
}

const COMBAT_STEPS: readonly string[] = [
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
];
const inCombat = (s: GameState) => COMBAT_STEPS.includes(s.turn.step);

/**
 * Casting restrictions (family D) currently weighing on this player, wherever they come from: Bilbo's Gambit, Avatar's
 * Wrath, Kutzil, Grand Abolisher, Sandswirl Wanderglyph, High Noon, Yuriko.
 */
function castLimits(s: GameState, player: PlayerId): CastLimit[] {
  const out: CastLimit[] = [];
  for (const q of s.playerOrder) {
    for (const { ab } of playerStatics(s, q, "castLimit")) {
      const l = ab.castLimit;
      if (!l) continue;
      if (l.who === "you" ? q !== player : l.who === "opponents" ? q === player : false) continue;
      if (l.during === "yourTurn" && s.turn.active !== q) continue;
      if (l.during === "combat" && !inCombat(s)) continue;
      if (l.attackedYou && countTurnEvents(s, { event: "attack", againstYou: true }, q, player) === 0) continue;
      out.push(l);
    }
  }
  return out;
}

/** Karlov Watchdog: may this player turn their permanents face up? */
export function faceUpLocked(s: GameState, player: PlayerId): boolean {
  return castLimits(s, player).some((l) => l.faceUp);
}

/**
 * Grand Abolisher, Yuriko: are the activated abilities of this source locked for this player? `mana`: a mana ability,
 * which Yuriko ("abilities that aren't mana abilities") leaves alone and Grand Abolisher ("abilities of artifacts,
 * creatures, or enchantments") locks too.
 */
export function abilitiesLocked(s: GameState, player: PlayerId, source: ObjectId, mana = false): boolean {
  return castLimits(s, player).some(
    (l) =>
      (l.abilities === "all" && !mana) ||
      (l.abilities === "artifactsCreaturesEnchantments" &&
        chars(s, source).types.some((t) => t === "Artifact" || t === "Creature" || t === "Enchantment")),
  );
}

export function castTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const spells = s.players[player]?.turnStats.spellsCast ?? 0;
  const fromHand = s.objects[card]?.zone === "hand";
  for (const l of castLimits(s, player)) {
    if (l.faceUp) continue;
    if (l.sorceryTiming) {
      if (!sorceryTiming(s, player)) return null;
      continue;
    }
    if (l.spellTypes) {
      const types = s.defs[s.objects[card]?.defId ?? ""]?.types ?? [];
      const { types: only, notTypes } = l.spellTypes;
      if ((only && !only.some((t) => types.includes(t))) || notTypes?.some((t) => types.includes(t))) continue;
      if (countTurnEvents(s, { event: "cast", who: "you", ...l.spellTypes }, player) >= (l.maxSpells ?? 0)) return null;
      continue;
    }
    if (l.maxSpells !== undefined ? spells >= l.maxSpells : !l.exceptFromHand || !fromHand) return null;
  }
  const base = baseCastTerms(s, player, card);
  const terms = base && freeCastTerms(s, player, card, base);
  // Weftwalking: "the first spell each player casts during each of their turns may be cast without paying".
  if (
    terms &&
    !terms.free &&
    s.turn.active === player &&
    (s.players[player]?.turnStats.spellsCast ?? 0) === 0 &&
    s.playerOrder.some((p) => playerStatic(s, p, "firstSpellFree"))
  ) {
    return { ...terms, freeOptional: true };
  }
  return terms;
}

/**
 * "You may cast spells without paying their mana costs": `freeFrom` permissions (from the hand: Omniscience; from any
 * zone: Dracogenesis, As Foretold), and "the next spell … may be cast without paying its mana cost" (`NextSpell.free`:
 * World War Hulk). A "once each turn" permission is consumed only if it is used (`freeOnceKey`); the next spell, for its
 * part, consumes the effect whether it is paid or not. Never with another alternative cost (118.9a: flashback, mayhem,
 * warp alone, replacement cost).
 */
function freeCastTerms(s: GameState, player: PlayerId, card: ObjectId, terms: CastTerms): CastTerms {
  if (terms.free || terms.freeOptional || terms.source === "flashback" || terms.mayhem || terms.warpOnly || terms.costOverride)
    return terms;
  const d = s.defs[s.objects[card]?.defId ?? ""];
  if (!d) return terms;
  const view = spellView(d, player);
  const next = s.playerEffects.some((e) => {
    const n = e.player === player && e.once ? e.ability.nextSpell : undefined;
    return !!n?.free && (!n.filter || matchesView(view, n.filter, player));
  });
  if (next) return { ...terms, freeOptional: true };
  const perms = controlledAbilitiesWithSource(s, player).filter(
    ({ id, ab }) =>
      ab.kind === "castPermission" &&
      (ab.freeFrom === "any" || ab.freeFrom === terms.source) &&
      // Dracogenesis: only Dragon spells; Omnipresence: mana value at most the number of creatures you control.
      (!ab.freeFilter || matchesView(view, resolveFilter(s, ab.freeFilter, id), player)) &&
      (!ab.condition || checkCondition(s, ab.condition, player, id)) &&
      // Zaffai and the Tempests: once each turn (the permission is consumed by a spell cast for free).
      !(ab.freeOncePerTurn && s.turn.onceFired.includes(`freeCast:${id}`)),
  );
  if (perms.length === 0) return terms;
  const unlimited = perms.some(({ ab }) => ab.kind === "castPermission" && !ab.freeOncePerTurn);
  const once = unlimited ? undefined : perms[0];
  return { ...terms, freeOptional: true, ...(once ? { freeOnceKey: `freeCast:${once.id}` } : {}) };
}

function baseCastTerms(s: GameState, player: PlayerId, card: ObjectId): CastTerms | null {
  const o = s.objects[card];
  if (!o) return null;
  const d = s.defs[o.defId];
  if (!d) return null;
  const castCondition = cardRule(d, "castCondition");
  if (castCondition && !checkCondition(s, castCondition, player, card)) return null;
  if (o.zone === "hand") {
    if (o.owner !== player) return null;
    // Buster Sword: a spell from your hand without paying its mana cost, this turn.
    const handPerm = exilePermission(s, player, card);
    if (handPerm) return { source: "hand", free: handPerm.free, anyTime: handPerm.anyTime, costOverride: handPerm.cost };
    return { source: "hand" };
  }
  // 903.8: its owner may cast their commander from the command zone, for {2} more for each previous cast from that zone
  // (commander tax, paid even if the spell is free).
  if (o.zone === "command") {
    const rec = o.owner === player ? commanderOf(s, o) : undefined;
    if (!rec) return null;
    return { source: "command", ...(rec.casts ? { extraCost: 2 * rec.casts } : {}) };
  }
  if (o.zone === "graveyard") {
    // Tinybones, the Pickpocket: a card from another graveyard, castable with mana of any type.
    const gyPerm = exilePermission(s, player, card);
    if (gyPerm?.flashback) return { source: "flashback", free: gyPerm.free, harmonize: gyPerm.harmonize };
    if (gyPerm)
      return {
        source: "graveyard",
        anyMana: gyPerm.anyMana,
        free: gyPerm.free,
        // "You may cast [the card]" during a resolution (608.2g): the casting timing is ignored.
        anyTime: gyPerm.anyTime,
        after: gyPerm.after === "exile" ? "exile" : undefined,
        ...(gyPerm.adventureOnly ? { adventureOnly: true } : {}),
      };
    if (o.owner !== player) return null;
    // Timeline Culler: "you may cast this card from your graveyard using its warp ability".
    if (castOption(d, "warp")?.fromGraveyard) return { source: "graveyard", warpOnly: true };
    // Mayhem: discarded this turn, it is cast from the graveyard for its mayhem cost.
    if (castOption(d, "mayhem") && objectDidThisTurn(s, o.id, "discard")) return { source: "graveyard", mayhem: true };
    const flashback = castOption(d, "flashback");
    if (flashback) {
      // Deep Analysis: "Flashback—{1}{U}, Pay 3 life".
      const life = flashback.extra?.payLife;
      if (life && payableLife(s, player) < life) return null;
      return { source: "flashback", ...(life ? { payLife: life } : {}) };
    }
    // "Play from the graveyard" permissions (family C): Case of the Uneaten Feast, Hades, The Tomb of Aclazotz,
    // Noctis (life and finality), Festival of Embers (life), Osteomancer Adept (forage and finality)…
    const rules = playFromRules(s, player, card, "graveyard", "spells");
    const free = rules.find((r) => !r.payLife && !r.forage && !r.exileOthers && !r.finality && !r.addSubtypes);
    if (free) return playFromTerms(free, "graveyard");
    const t = graveyardTypeAvailable(s, player, card);
    if (t && t !== "Land") return { source: "graveyard", graveyardType: t };
    if (rules[0]) return playFromTerms(rules[0], "graveyard");
    const fromGy = castOption(d, "graveyard");
    if (fromGy && (!fromGy.condition || checkCondition(s, fromGy.condition, player, card))) {
      // Wickerfolk Indomitable: "by paying 2 life and sacrificing an artifact or creature in addition".
      if (fromGy.payLife && payableLife(s, player) < fromGy.payLife) return null;
      // Quilled Greatwurm: "by removing six counters from among creatures you control".
      const counters = fromGy.removeCountersAmong;
      if (counters)
        return countersAmongCreatures(s, player) >= counters ? { source: "graveyard", removeCounters: counters } : null;
      // Hundred-Battle Veteran: "if you do, it enters with a finality counter".
      return { source: "graveyard", payLife: fromGy.payLife, finality: fromGy.finality };
    }
    return null;
  }
  if (o.zone === "library") {
    // Vizier of the Menagerie (creatures, mana of any type), The Lunar Whale, Mm'menon (artifacts)…
    const top = s.players[o.owner]?.library[0];
    if (o.owner !== player || top !== card) return null;
    // Planetarium of Wan Shi Tong: "you may cast that card without paying its mana cost" (permission, `castNow`).
    const libPerm = exilePermission(s, player, card);
    if (libPerm)
      return {
        source: "library",
        anyMana: libPerm.anyMana,
        free: libPerm.free,
        after: libPerm.after === "exile" ? "exile" : undefined,
        anyTime: libPerm.anyTime,
      };
    const rule = playFromRules(s, player, card, "libraryTop", "spells")[0];
    // Gwenom: life equal to its mana value rather than its mana cost (like Valgavoth).
    if (rule?.payLifeManaValue) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "library", free: true, payLife: life || undefined, playFrom: rule };
    }
    return rule ? playFromTerms(rule, "library") : null;
  }
  if (o.zone === "exile") {
    // 702.143a: a foretold card is cast on a later turn for its foretell cost.
    const via = o.exiledVia;
    if (via?.kind === "foretell") {
      const foretell = castOption(d, "foretell");
      return o.owner === player && via.turn < s.turn.number && foretell ? { source: "exile", costOverride: foretell.cost } : null;
    }
    // 702.170d: a plotted card is cast without paying its cost, on a later turn, at sorcery speed.
    if (via?.kind === "plot") {
      return o.owner === player && via.turn < s.turn.number ? { source: "exile", free: true, sorceryTiming: true } : null;
    }
    // Reality Fracture: the copy of a prepared permanent's spell, castable by that permanent's current controller.
    if (o.preparedFor) {
      const perm = s.objects[o.preparedFor];
      return perm?.zone === "battlefield" && perm.controller === player && perm.preparedCopy === card
        ? { source: "exile" }
        : null;
    }
    // Exiled cards linked to a permanent (family C, `zone: "linked"`): Null Summoner, Intrepid Paleontologist (finality),
    // Taster of Wares (mana of any type), Maralen (free, once each turn), Dawnhand Dissident (counters removed), Hama
    // (waterbend), Valgavoth (life equal to its mana value).
    const linked = playFromRules(s, player, card, "linked", "spells")[0];
    if (linked?.waterbend) {
      const generic = manaValue(d.manaCost);
      return { source: "exile", costOverride: { generic, colored: {}, x: 0 }, waterbendOverride: true };
    }
    if (linked?.payLifeManaValue) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "exile", free: true, payLife: life || undefined };
    }
    if (linked)
      return {
        source: "exile",
        ...(linked.finality ? { finality: true } : {}),
        ...(linked.free ? { free: true } : {}),
        ...(linked.anyMana ? { anyMana: true } : {}),
        ...(linked.removeCountersAmong ? { removeCounters: linked.removeCountersAmong } : {}),
        ...(linked.onceKey ? { onceKey: linked.onceKey } : {}),
      };
    // 715.4: the card "on an adventure": its owner may cast the creature.
    if (o.onAdventure && o.owner === player) return { source: "exile" };
    // 702.185a: exiled by warp, castable from exile from the next turn on.
    if (via?.kind === "warp" && o.owner === player && s.turn.number > via.turn) return { source: "exile" };
    const perm = exilePermission(s, player, card);
    // Inside Information: life equal to its mana value rather than its mana cost (like Valgavoth).
    if (perm?.payLifeManaValue && !d.types.includes("Land")) {
      const life = manaValue(d.manaCost);
      if (life > 0 && payableLife(s, player) < life) return null;
      return { source: "exile", free: true, payLife: life || undefined };
    }
    if (perm)
      return {
        source: "exile",
        free: perm.free,
        anyTime: perm.anyTime,
        extraCost: perm.extraCost,
        anyMana: perm.anyMana,
        costOverride: perm.cost,
        // "… then exile it" (Nita, Forum Conciliator), as from the graveyard.
        after: perm.after,
        ...(perm.haste ? { haste: true } : {}),
      };
    // Tinybones: opponents' cards exiled with a stash counter, during your turn.
    if (stashPlayable(s, player, o)) return { source: "exile", anyMana: true };
  }
  return null;
}

/** From where may this player cast this spell? */
export function castSource(s: GameState, player: PlayerId, card: ObjectId): CastTerms["source"] | null {
  return castTerms(s, player, card)?.source ?? null;
}

/** Counters (all kinds) on the creatures this player controls. */
function countersAmongCreatures(s: GameState, player: PlayerId): number {
  return s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id))
    .reduce((n, id) => n + Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0), 0);
}

/**
 * "Remove N counters from among creatures you control" (Quilled Greatwurm, Dawnhand Dissident): the player divides the
 * removals among their creatures, one object per counter (`repeat`); suggestion: the most loaded first.
 */
function countersAmongPick(s: GameState, player: PlayerId, n: number): CostPick {
  const options = s.battlefield
    .filter((id) => obj(s, id).controller === player && isCreature(s, id) && countersOf(s, id) > 0)
    .sort((a, b) => countersOf(s, b) - countersOf(s, a));
  const kinds = counterKindOptions(s, options);
  return {
    slot: "counterFrom",
    label: msg("Remove {n} counter(s) from among creatures you control", { n }),
    count: n,
    options: [...options, ...kinds.options],
    suggested: options.flatMap((id) => Array<ObjectId>(countersOf(s, id)).fill(id)).slice(0, n),
    repeat: { ...Object.fromEntries(options.map((id) => [id, countersOf(s, id)])), ...kinds.repeat },
    ...(kinds.options.length ? { labels: kinds.labels } : {}),
  };
}

/**
 * Removes one counter per occurrence of each chosen creature: of the chosen kind (`id:kind`), otherwise of the default
 * kind among the remaining counters (−1/−1 first, +1/+1 last).
 */
function removeCountersFromEach(s: GameState, from: ObjectId[]): void {
  const byObject = new Map<ObjectId, { kinds: string[]; n: number }>();
  for (const entry of from) {
    const { id, kind } = counterEntry(entry);
    const e = byObject.get(id) ?? { kinds: [], n: 0 };
    if (kind) e.kinds.push(kind);
    else e.n++;
    byObject.set(id, e);
  }
  for (const [id, e] of byObject) {
    const o = obj(s, id);
    const rest = { ...o.counters };
    for (const k of e.kinds) rest[k] = (rest[k] ?? 0) - 1;
    const kinds = [...e.kinds, ...anyCountersDefault(rest, e.n)];
    for (const kind of new Set(kinds)) changeCounters(s, o, kind, -kinds.filter((k) => k === kind).length);
  }
}

function countersOf(s: GameState, id: ObjectId): number {
  return Object.values(obj(s, id).counters).reduce((a, b) => a + Math.max(0, b), 0);
}

/** Options of the additional costs (cards to discard, permanents to sacrifice), or null if they can't be paid. */
export function additionalOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback = false,
): {
  discard?: {
    count: number;
    options: ObjectId[];
    orLife?: number;
    orSacrifice?: boolean;
    orPay?: ManaCost;
    orPayAffordable?: boolean;
  };
  sacrifice?: { count: number; options: ObjectId[]; orPay?: ManaCost; orPayAffordable?: boolean };
} | null {
  let add = additionalCostOf(d, flashback);
  // Wickerfolk Indomitable: additional sacrifice when it is cast from the graveyard.
  const gy = s.objects[card]?.zone === "graveyard" ? castOption(d, "graveyard") : undefined;
  if (gy?.sacrifice) add = { ...add, sacrifice: { filter: gy.sacrifice, count: 1 } };
  // Alien Symbiosis: "by discarding a card in addition to paying its other costs".
  if (gy?.discard) add = { ...add, discard: gy.discard, ...(gy.discardFilter ? { discardFilter: gy.discardFilter } : {}) };
  if (!add) return {};
  // Mandatory behold (Monstrous Emergence): there must be a permanent or a card to choose.
  if (
    add.behold?.required &&
    beholdOptions(s, player, card, add.behold.filter, add.behold.exiled).length < (add.behold.count ?? 1)
  )
    return null;
  const out: ReturnType<typeof additionalOptions> = {};
  if (add.discard) {
    const df = add.discardFilter;
    const hand = (s.players[player]?.hand ?? []).filter(
      (id) => id !== card && (!df || matchesCard(s, player, id, { ...df, controller: undefined })),
    );
    // Souls of the Lost: "… or sacrifice a permanent".
    const sf = typeof add.discardOr?.sacrifice === "object" ? add.discardOr.sacrifice : undefined;
    const perms = add.discardOr?.sacrifice
      ? s.battlefield.filter((id) => obj(s, id).controller === player && (!sf || matchesObjectFilter(s, player, id, sf)))
      : [];
    const options = [...hand, ...perms];
    // Bitter Triumph: "… or pay 3 life" (one must have at least that much, 119.4).
    const life = add.discardOr?.life;
    const orLife = life !== undefined && payableLife(s, player) >= life ? life : undefined;
    const orPay = add.discardOr?.mana;
    if (options.length < add.discard && orLife === undefined && !orPay) return null;
    out.discard = {
      count: add.discard,
      options,
      ...(orLife !== undefined ? { orLife } : {}),
      ...(orPay ? { orPay } : {}),
      ...(add.discardOr?.sacrifice ? { orSacrifice: true } : {}),
    };
  }
  if (add.sacrifice) {
    const f = add.sacrifice.filter;
    const options = s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
    // "Sacrifice a creature or pay {3}{B}": without a creature, the option to pay remains.
    if (options.length < add.sacrifice.count && !add.sacrifice.orPay) return null;
    out.sacrifice = { count: add.sacrifice.count, options, orPay: add.sacrifice.orPay };
  }
  return out;
}

/**
 * Additional costs chosen automatically (Duskmourn): exile or return permanents you control, tap untapped permanents,
 * exile cards from your graveyard. Payment uses what is worth the least: tokens and small permanents first; to tap,
 * creatures before lands. `null`: the cost can't be paid.
 */
/** Additional costs of the spell, and those of flashback when it is cast that way (Twinned Vision, Group Project). */
function additionalCostOf(d: CardDef, flashback: boolean): CardDef["additionalCost"] {
  const extra = flashback ? castOption(d, "flashback")?.extra : undefined;
  return extra ? { ...d.additionalCost, ...extra } : d.additionalCost;
}

export function autoAdditional(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback = false,
): { exile: ObjectId[]; bounce: ObjectId[]; tap: ObjectId[]; graveyard: ObjectId[] } | null {
  const out = { exile: [] as ObjectId[], bounce: [] as ObjectId[], tap: [] as ObjectId[], graveyard: [] as ObjectId[] };
  const add = additionalCostOf(d, flashback);
  if (!add) return out;
  const used = new Set<ObjectId>();
  const mine = (f: ObjectFilter) =>
    s.battlefield.filter((id) => !used.has(id) && obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost ?? null);
  const pick = (ids: ObjectId[], n: number, score: (id: ObjectId) => number): ObjectId[] | null => {
    if (ids.length < n) return null;
    const chosen = [...ids].sort((a, b) => score(a) - score(b)).slice(0, n);
    for (const id of chosen) used.add(id);
    return chosen;
  };
  const isLand = (id: ObjectId) => chars(s, id).types.includes("Land");
  if (add.exile) {
    const f = add.exile.filter;
    // Behold: a card from the hand (other than the one being cast) also fits; a token is exiled first, then a card from
    // the hand, then a permanent, each time the cheapest.
    const hand = add.exile.fromHand
      ? (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, f, card))
      : [];
    const where = (id: ObjectId) => (obj(s, id).isToken ? -100 : obj(s, id).zone === "hand" ? 0 : 50);
    const c = pick([...mine(f), ...hand], add.exile.count, (id) => where(id) + mv(id));
    if (!c) return null;
    out.exile = c;
  }
  if (add.bounce) {
    const c = pick(mine(add.bounce.filter), add.bounce.count, (id) =>
      obj(s, id).isToken ? 100 : isLand(id) ? 50 + (obj(s, id).tapped ? 0 : 1) : mv(id),
    );
    if (!c) return null;
    out.bounce = c;
  }
  if (add.tap) {
    const options = mine({ ...add.tap.filter, tapped: false });
    const score = (id: ObjectId) => (isLand(id) ? 100 : chars(s, id).power);
    let c = pick(options, add.tap.count, score);
    if (!c) return null;
    // Guardian of the Great Door: if the permanents tapped by default don't leave enough to pay the spell's mana, they are
    // chosen one by one, keeping the needed sources (when possible).
    const cost = spellCost(s, player, d, { flashback, card });
    const others = [...used].filter((id) => !c?.includes(id));
    if (!canPay(s, player, cost, new Set(used))) {
      for (const id of c) used.delete(id);
      const chosen: ObjectId[] = [];
      for (let i = 0; i < add.tap.count; i++) {
        const rest = [...options].filter((id) => !chosen.includes(id)).sort((a, b) => score(a) - score(b));
        const keep = rest.find((id) => canPay(s, player, cost, new Set([...others, ...chosen, id]))) ?? rest[0];
        if (keep) chosen.push(keep);
      }
      for (const id of chosen) used.add(id);
      c = chosen;
    }
    out.tap = c;
  }
  if (add.exileGraveyard) {
    const gy = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
    if (gy.length < add.exileGraveyard) return null;
    out.graveyard = [...gy]
      .sort(
        (a, b) =>
          Number(!s.defs[obj(s, a).defId]?.types.includes("Land")) - Number(!s.defs[obj(s, b).defId]?.types.includes("Land")),
      )
      .slice(0, add.exileGraveyard);
  }
  return out;
}

/**
 * Behold (701.65): the matching permanents you control, then the matching cards in your hand (other than the cast
 * card). A permanent first: there is nothing to reveal.
 */
export function beholdOptions(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  filter: ObjectFilter,
  exiled?: ExiledFilter,
): ObjectId[] {
  const mine = s.battlefield.filter(
    (id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, { ...filter, controller: "you" }, card),
  );
  // Close Encounter: a matching exiled card instead of a card from the hand.
  const others = exiled
    ? s.exile.filter((id) => matchesExiled(s, player, id, exiled, card))
    : (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, filter, card));
  return [...mine, ...others];
}

/**
 * Suggested behold: a permanent first (nothing to reveal); when mandatory (Monstrous Emergence, Close Encounter: damage
 * equal to its power), the greatest power, a permanent on equal power.
 */
function beholdSuggestion(s: GameState, options: ObjectId[], required?: boolean): ObjectId | null {
  if (!required) return options[0] ?? null;
  let best: ObjectId | null = null;
  let max = Number.NEGATIVE_INFINITY;
  for (const id of options) {
    const p = chars(s, id).power;
    if (p > max) [best, max] = [id, p];
  }
  return best;
}

/** Suggested objects to behold: one (`beholdSuggestion`), or `count` of them, the permanents first (nothing to reveal). */
function beholdSuggestions(s: GameState, options: ObjectId[], required: boolean | undefined, count: number): ObjectId[] {
  if (count <= 1) {
    const one = beholdSuggestion(s, options, required);
    return one ? [one] : [];
  }
  return options.length >= count ? options.slice(0, count) : [];
}

/**
 * The permanents or cards beheld on casting (`count` of them, distinct): the chosen ones (checked; empty list: none,
 * unless beholding is mandatory), otherwise the suggestion.
 */
function beholdChoice(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  chosen: ObjectId[] | undefined,
  flashback: boolean,
): ObjectId[] {
  const behold = additionalCostOf(d, flashback)?.behold;
  if (!behold) {
    if (chosen?.length) throw new RulesError(msg("This spell doesn't ask you to behold"));
    return [];
  }
  const count = behold.count ?? 1;
  const options = beholdOptions(s, player, card, behold.filter, behold.exiled);
  const ids = chosen === undefined ? beholdSuggestions(s, options, behold.required, count) : chosen;
  if (ids.length === 0) {
    if (behold.required) throw new RulesError(msg("Choose what the additional cost asks for"));
    return [];
  }
  if (ids.length !== count || new Set(ids).size !== ids.length || ids.some((id) => !options.includes(id)))
    throw new RulesError(msg("Invalid behold choice"));
  return ids;
}

/** Slot of each additional cost chosen by the player. */
const ADDITIONAL_SLOTS = { exile: "costExile", bounce: "costBounce", tap: "costTap", graveyard: "costGraveyard" } as const;

/**
 * Additional costs paid with objects (exile, return or tap permanents, exile cards from the graveyard): the player
 * chooses them; the suggestion is the automatic choice (`autoAdditional`).
 */
export function additionalPicks(s: GameState, player: PlayerId, card: ObjectId, d: CardDef, flashback = false): CostPick[] {
  const add = additionalCostOf(d, flashback);
  const auto = add ? autoAdditional(s, player, card, d, flashback) : null;
  if (!add || !auto) return [];
  const mine = (f: ObjectFilter) =>
    s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f));
  const out: CostPick[] = [];
  if (add.exile) {
    const f = add.exile.filter;
    const hand = add.exile.fromHand
      ? (s.players[player]?.hand ?? []).filter((id) => id !== card && matchesCard(s, player, id, f, card))
      : [];
    out.push({
      slot: "costExile",
      label: add.exile.fromHand
        ? msg("Behold and exile {n} card(s) (on the battlefield or from your hand)", { n: add.exile.count })
        : msg("Exile {n} permanent(s) you control", { n: add.exile.count }),
      count: add.exile.count,
      options: [...mine(f), ...hand],
      suggested: auto.exile,
    });
  }
  if (add.bounce)
    out.push({
      slot: "costBounce",
      label: msg("Return {n} permanent(s) you control to hand", { n: add.bounce.count }),
      count: add.bounce.count,
      options: mine(add.bounce.filter),
      suggested: auto.bounce,
    });
  if (add.tap)
    out.push({
      slot: "costTap",
      label: msg("Tap {n} untapped permanent(s) you control", { n: add.tap.count }),
      count: add.tap.count,
      options: mine({ ...add.tap.filter, tapped: false }),
      suggested: auto.tap,
    });
  if (add.exileGraveyard)
    out.push({
      slot: "costGraveyard",
      label: msg("Exile {n} card(s) from your graveyard", { n: add.exileGraveyard }),
      count: add.exileGraveyard,
      options: (s.players[player]?.graveyard ?? []).filter((id) => id !== card),
      suggested: auto.graveyard,
    });
  return out;
}

/** The objects of the additional costs: those chosen by the player (checked, no duplicate across costs), otherwise the automatic choice. */
function chosenAdditional(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  flashback: boolean,
  auto: NonNullable<ReturnType<typeof autoAdditional>>,
  picks: CastChoices["picks"],
): NonNullable<ReturnType<typeof autoAdditional>> {
  const out = { ...auto };
  const offered = additionalPicks(s, player, card, d, flashback);
  for (const slot of Object.values(ADDITIONAL_SLOTS))
    if (picks?.[slot] && !offered.some((p) => p.slot === slot))
      throw new RulesError(msg("This spell doesn't have that additional cost"));
  const used = new Set<ObjectId>();
  for (const [key, slot] of Object.entries(ADDITIONAL_SLOTS) as [keyof typeof ADDITIONAL_SLOTS, CostSlot][]) {
    const p = offered.find((x) => x.slot === slot);
    if (!p) continue;
    const chosen = resolvePick(s, p, picks?.[slot]);
    if (new Set(chosen).size !== chosen.length || chosen.some((id) => used.has(id)))
      throw new RulesError(msg("The same object can't pay two costs"));
    for (const id of chosen) used.add(id);
    out[key] = chosen;
  }
  return out;
}

/** Colors offered for a spell's hybrid mana (PLAN-L L7: for any hybrid cost). */
export function hybridColors(d: CardDef): ManaType[] {
  const pairs = [...(d.manaCost?.hybrid ?? []), ...(castOption(d, "alternative")?.mana.hybrid ?? [])];
  return [...new Set(pairs.flat())];
}

/** One of the spell's abilities reads the spent colors (`spentColor`): the hybrid color changes the outcome. */
export function hybridMatters(d: CardDef): boolean {
  return hybridColors(d).length > 0 && JSON.stringify(d.abilities).includes('"kind":"spentColor"');
}

/** The cost, with each hybrid symbol that contains this color paid with this color. */
export function hybridPaidAs(cost: ManaCost, color: ManaType): ManaCost {
  const keep = (cost.hybrid ?? []).filter((h) => !h.includes(color));
  const n = (cost.hybrid ?? []).length - keep.length;
  return { ...cost, colored: { ...cost.colored, [color]: (cost.colored[color] ?? 0) + n }, hybrid: keep };
}

export function castSpell(s: GameState, player: PlayerId, card: ObjectId, choices: CastChoices): void {
  const terms = castTerms(s, player, card);
  if (!terms) throw new RulesError(msg("You can't cast this card from here"));
  const o = obj(s, card);
  const cardDef = s.defs[o.defId];
  // A land with disguise (Branch of Vitu-Ghazi) is cast face down.
  const landFaceDown = !!cardDef?.types.includes("Land") && !!choices.faceDown && !!castOption(cardDef, "faceDown");
  if (!cardDef || (cardDef.types.includes("Land") && cardDef.layout !== "adventure" && !landFaceDown))
    throw new RulesError(msg("This is not a spell"));
  if (!cardDef.implemented) throw new RulesError(msg("{card} is not handled by the engine yet", { card: cardDef.name }));
  // Cast face: the card itself, or its Adventure (715.3).
  const face = landFaceDown
    ? ([undefined, cardDef] as [number | undefined, CardDef])
    : castableFaces(s, card, cardDef).find(([f]) => f === choices.face);
  if (!face) throw new RulesError(msg("This face can't be cast"));
  if (terms.adventureOnly && !(face[0] === 1 && face[1].subtypes.includes("Adventure")))
    throw new RulesError(msg("This card can only be cast from here as an Adventure"));
  // Disguise (702.168a): cast face down as a 2/2 creature with no name for {3}.
  const faceDown = castOption(cardDef, "faceDown");
  if (choices.faceDown && !faceDown) throw new RulesError(msg("This card can't be cast face down"));
  // Warp (702.185): from the hand (or the graveyard if the card allows it), for its warp cost.
  const warp = choices.warp ? warpOf(s, player, card, cardDef) : undefined;
  if (choices.warp && (!warp || (terms.source !== "hand" && !(terms.source === "graveyard" && warp.fromGraveyard)))) {
    throw new RulesError(msg("This card can't be cast with warp"));
  }
  if (terms.warpOnly && !choices.warp) throw new RulesError(msg("This card can only be cast from here with warp"));
  if (warp?.life && payableLife(s, player) < warp.life) throw new RulesError(msg("Not enough life"));
  const d = choices.faceDown ? FACE_DOWN_SPELL : warp ? { ...face[1], manaCost: warp.cost } : face[1];
  if (splitSecondOnStack(s)) throw new RulesError(msg("No spells or abilities now (split second or combat)"));
  // Harbinger of the Tides: "as though it had flash if you pay {2} more".
  const flashExtra = !terms.anyTime && !canCastTiming(s, player, d) ? castOption(d, "flash")?.cost : undefined;
  // Sneak (702.190a): in the declare blockers step, when you have priority.
  const sneakNow = !!choices.alternative && sneakTiming(s, player, d);
  if (!terms.anyTime && !canCastTiming(s, player, d) && !flashExtra && !sneakNow)
    throw new RulesError(msg("You can't cast this spell now"));
  if (terms.sorceryTiming && !sorceryTiming(s, player)) throw new RulesError(msg("Only at sorcery speed"));
  const flashback = terms.source === "flashback";
  const free = !!terms.free || (!!choices.free && !!terms.freeOptional);
  if (choices.free && !free) throw new RulesError(msg("This spell can't be cast without paying its cost"));
  const alternative = !!choices.alternative && !free;
  if (alternative && !altCostFor(s, player, d)) {
    throw new RulesError(msg("Alternative cost unavailable"));
  }
  const modes = modesOf(d);
  const modeIndex = choices.mode ?? 0;
  const mode = modes[modeIndex];
  if (!mode) throw new RulesError(msg("Invalid mode"));
  // Overload, cleave: the mode is cast for its own cost, neither for free nor with another alternative cost (118.9a).
  if (mode.cost && (free || alternative)) throw new RulesError(msg("This mode can only be cast for its own cost"));
  const dc = mode.cost ? { ...d, manaCost: mode.cost } : d;
  // "If the additional cost was paid, choose both instead": the mode requires (or excludes) the kicker chosen with the
  // decision.
  if (mode.condition && !modeConditionHolds(s, player, card, mode.condition, !!choices.kicked)) {
    if (modeConditionHolds(s, player, card, mode.condition, !choices.kicked))
      throw new RulesError(
        choices.kicked ? msg("Additional cost paid: choose both modes") : msg("This mode requires paying the additional cost"),
      );
    throw new RulesError(msg("This mode is not available"));
  }
  // "Mana value X or less": the target is checked with the announced X (601.2b, then 601.2c).
  const xCtx = { ...staticContext(s, player, card, { sourceDefId: d.id }), x: Math.max(0, Math.floor(choices.x ?? 0)) };
  const castSpecs = mode.targets.map((t) =>
    t.maxManaValueAmount !== undefined || t.manaValueAmount !== undefined ? concreteSpec(s, xCtx, t) : t,
  );
  const targets = validateTargets(s, player, castSpecs, choices.targets, {
    kicked: !!choices.kicked,
    sourceId: card,
    x: choices.x,
  });
  const hasX =
    (!free && !!(flashback ? (castOption(dc, "flashback")?.cost ?? dc.manaCost)?.x : dc.manaCost?.x)) ||
    !!d.additionalCost?.xCost ||
    kickerPaidTimes(d);
  const x = hasX ? Math.max(0, Math.floor(choices.x ?? 0)) : 0;
  if (x > MAX_X) throw new RulesError(msg("X is too large"));
  // Vicious Rivalry: "as an additional cost to cast this spell, pay X life".
  if (d.additionalCost?.xCost === "life" && x > payableLife(s, player)) throw new RulesError(msg("Not enough life"));
  // Soul Immolation: "blight X; X can't be greater than the greatest toughness among creatures you control".
  if (d.additionalCost?.xCost === "blight" && x > greatestToughness(s, player))
    throw new RulesError(msg("X exceeds the greatest toughness"));
  const kicked = !!choices.kicked && !!d.kicker && !kickerPaidTimes(d);
  // Part of the cost payable by waterbending: additional cost, kicker, or replacement cost (Hama).
  const bendPaid =
    waterbendAmount(d, kicked, x) +
    (terms.waterbendOverride && terms.costOverride && !free && !alternative ? terms.costOverride.generic : 0);
  // Additional costs: checked before any state change.
  const opts = additionalOptions(s, player, card, d, flashback);
  if (!opts) throw new RulesError(msg("Can't pay the additional cost"));
  // Kicker without mana (bargain): the permanent to sacrifice or return, chosen by the player (`sacrifice`, when the
  // spell has no other sacrifice as a cost); without a choice, the cheapest, tokens first.
  const kickerOptions =
    kicked && d.kicker?.pay && d.kicker.pay.life === undefined ? kickerCostOptions(s, player, card, d, flatTargets(targets)) : [];
  const kickerChoice = kicked && d.kicker?.pay && !opts.sacrifice && choices.sacrifice?.length ? choices.sacrifice : undefined;
  if (kickerChoice && (kickerChoice.length !== 1 || !kickerOptions.includes(kickerChoice[0] as ObjectId)))
    throw new RulesError(msg("Invalid permanent for this cost"));
  const kickerPermanent = kickerChoice?.[0] ?? kickerOptions[0];
  const teamwork = kicked ? d.kicker?.pay?.tapPower : undefined;
  const evidence =
    kicked && d.kicker?.pay?.collectEvidence ? spellPickNow(s, player, card, d, x, "evidence", "kicked", choices) : undefined;
  if (evidence === null) throw new RulesError(msg("Not enough evidence to collect in your graveyard"));
  // Urgent Necropsy: "collect evidence X, where X is the total mana value of the target permanents" (the chosen cards,
  // otherwise the engine's choice).
  const targetEvidenceX = d.additionalCost?.collectEvidenceTargetsManaValue ? targetsManaValue(s, flatTargets(targets)) : 0;
  const targetEvidencePick =
    targetEvidenceX > 0
      ? spellPicks(s, player, card, d, x, {}, flatTargets(targets)).find((p) => p.slot === "evidence" && !p.when)
      : undefined;
  if (targetEvidenceX > 0 && !targetEvidencePick) throw new RulesError(msg("Not enough evidence to collect in your graveyard"));
  const targetEvidence = targetEvidencePick ? resolvePick(s, targetEvidencePick, choices.picks?.evidence) : undefined;
  const gyExile =
    kicked && d.kicker?.pay?.exileGraveyard
      ? spellPickNow(s, player, card, d, x, "graveyardExile", "kicked", choices)
      : undefined;
  if (gyExile === null) throw new RulesError(msg("Not enough cards in your graveyard"));
  // Redirect Lightning: "pay 5 life or pay {2}" (the kicker is the life payment).
  const kickerLife = kicked ? d.kicker?.pay?.life : undefined;
  if (kickerLife !== undefined && payableLife(s, player) < kickerLife) throw new RulesError(msg("Not enough life"));
  if (kicked && d.kicker?.pay && kickerLife === undefined && !teamwork && !evidence && !gyExile && !kickerPermanent)
    throw new RulesError(msg("Can't pay the kicker"));
  // Teamwork: the tapped creatures (chosen by `tap`, otherwise the weakest that suffice).
  const teamTap = teamwork !== undefined ? chosenCrew(s, player, card, teamwork, choices.tap) : [];
  if (teamwork !== undefined && teamTap.length === 0) throw new RulesError(msg("Not enough total power for teamwork"));
  const discard = choices.discard ?? [];
  const sacrifice = kickerChoice ? [] : (choices.sacrifice ?? []);
  const check = (chosen: ObjectId[], spec?: { count: number; options: ObjectId[]; orPay?: ManaCost; orLife?: number }) => {
    const need = spec?.count ?? 0;
    if (spec?.orPay && chosen.length === 0) return; // the mana will be paid instead
    if (spec?.orLife !== undefined && chosen.length === 0) return; // the life will be paid instead
    if (chosen.length !== need || new Set(chosen).size !== need || chosen.some((id) => !spec?.options.includes(id))) {
      throw new RulesError(msg("Invalid additional cost choice"));
    }
  };
  check(discard, opts.discard);
  check(sacrifice, opts.sacrifice);
  const autoPaid = autoAdditional(s, player, card, d, flashback);
  if (!autoPaid) throw new RulesError(msg("Can't pay the additional cost"));
  const auto = chosenAdditional(s, player, card, d, flashback, autoPaid, choices.picks);
  const beheldIds = beholdChoice(s, player, card, d, choices.picks?.behold, flashback);
  const beheldId = beheldIds[0];
  // "… if you controlled a Faerie as you cast this spell": evaluated now (601.2), before the payment.
  const whenCast = cardRule(d, "whenCast");
  const metWhenCast = whenCast ? checkCondition(s, whenCast, player, card) : undefined;
  // Molten Exhale: "as though it had flash if you behold": cast that way, it must behold.
  if (
    d.additionalCost?.behold &&
    cardRule(d, "flashIf") &&
    !beheldId &&
    !canCastTiming(s, player, { ...d, rules: { ...d.rules, flashIf: undefined } })
  )
    throw new RulesError(msg("Without beholding, this spell can only be cast at sorcery speed"));
  let cost = spellCost(s, player, dc, {
    beheld: !!beheldId,
    x,
    kicked,
    flashback,
    free,
    alternative,
    anyMana: terms.anyMana,
    mayhem: terms.mayhem,
    costOverride: terms.costOverride,
    targets,
    fromZone: terms.source,
    card,
    // Emerge: the chosen victim reduces the cost (checked when the alternative cost is paid).
    victim: alternative ? choices.picks?.altSacrifice?.[0] : undefined,
  });
  // Terror of the Peaks: "spells your opponents cast that target this creature cost an additional 3 life".
  const lifeTax = flatTargets(targets).reduce((n, id) => {
    const t = s.objects[id];
    if (t?.zone !== "battlefield" || t.controller === player) return n;
    return n + chars(s, id).abilities.reduce((m, ab) => m + (ab.kind === "playerStatic" ? (ab.targetLifeTax ?? 0) : 0), 0);
  }, 0);
  // Paying 0 life is always possible (119.4), even with a negative total (Herald of Eternal Dawn).
  if (lifeTax > 0 && lifeTax > payableLife(s, player)) throw new RulesError(msg("Not enough life"));
  // Spree: the additional costs of the chosen modes (paid even if the spell is free).
  if (mode.extraCost) cost = addCosts(cost, mode.extraCost);
  if (opts.sacrifice?.orPay && sacrifice.length === 0) cost = addCosts(cost, opts.sacrifice.orPay);
  // Titania: "discard a card or pay {2}".
  if (opts.discard?.orPay && discard.length === 0) cost = addCosts(cost, opts.discard.orPay);
  if (flashExtra) cost = addCosts(cost, flashExtra);
  if (terms.extraCost) cost = addCosts(cost, { generic: terms.extraCost, colored: {}, x: 0 });
  // Harmonize: a tapped creature reduces the cost by its power (`tap` absent: the default choice; []: none).
  const harmonize = flashback && (!!castOption(d, "flashback")?.harmonize || !!terms.harmonize);
  if (choices.tap?.length && !harmonize && teamwork === undefined) throw new RulesError(msg("No creature to tap for this spell"));
  const harmony = harmonize ? harmonizeOptions(s, player, card, cost.generic) : undefined;
  const harmonyTap = harmony ? (choices.tap ?? harmony.suggested) : [];
  if (harmonyTap.length > 1 || harmonyTap.some((id) => !harmony?.options.includes(id)))
    throw new RulesError(msg("Invalid creature for harmonize"));
  for (const id of harmonyTap) cost = totalCost(cost, 0, undefined, harmony?.powers[id] ?? 0);
  // Hybrid mana paid with a chosen color (Deceit: "if {U}{U} was spent").
  if (choices.hybridAs) {
    if (!cost.hybrid?.some((h) => h.includes(choices.hybridAs as ManaType)))
      throw new RulesError(msg("This hybrid mana can't be paid with this color"));
    cost = hybridPaidAs(cost, choices.hybridAs);
  }
  if (choices.phyrexianLife && choices.phyrexianLife > (cost.phyrexian?.length ?? 0))
    throw new RulesError(msg("Not that many Phyrexian mana symbols to pay with life"));

  // Counters removed from among your creatures: divided by the player (`counterFrom`), otherwise the suggestion.
  const countersFrom = terms.removeCounters
    ? resolvePick(s, countersAmongPick(s, player, terms.removeCounters), choices.picks?.counterFrom)
    : undefined;
  // Muldrotha: the permanent type used (chosen among those still free, otherwise the first one).
  const typePick = terms.graveyardType
    ? spellPicks(s, player, card, d, x, { graveyardType: terms.graveyardType }).find((p) => p.slot === "permanentType")
    : undefined;
  const graveyardType = typePick ? resolvePick(s, typePick, choices.picks?.permanentType)[0] : terms.graveyardType;
  // 601.2a: the spell moves to the stack (new object), then the costs are paid (601.2g–h).
  if (graveyardType) s.turn.graveyardTypesUsed = [...(s.turn.graveyardTypesUsed ?? []), graveyardType];
  // The Tomb of Aclazotz: the one-shot permission is consumed.
  const once = terms.playFrom && s.playerEffects.find((e) => e.once && e.ability.playFrom === terms.playFrom);
  if (once) s.playerEffects = s.playerEffects.filter((e) => e !== once);
  if (countersFrom) removeCountersFromEach(s, countersFrom);
  if (terms.onceKey) s.turn.onceFired.push(terms.onceKey);
  if (free && terms.freeOnceKey) s.turn.onceFired.push(terms.freeOnceKey);
  const view = spellView(d, player);
  // Casting the copy of a prepared spell unprepares its permanent (even if the spell is then countered).
  const preparedFor = o.preparedFor ? s.objects[o.preparedFor] : undefined;
  if (preparedFor?.preparedCopy === card) delete preparedFor.preparedCopy;
  // One-shot permission (Buster Sword): the other cards of the group lose it.
  const group = exilePermission(s, player, card)?.group;
  if (group) s.playPermissions = (s.playPermissions ?? []).filter((p) => p.group !== group);
  const stackId = moveObject(s, card, "stack", { controller: player }) as string;
  // Forage as a cost (Osteomancer Adept, or Feed the Cycle's alternative cost): the card has left the graveyard. The
  // objects chosen by the player (`forage`), otherwise the automatic choice.
  if (terms.forage || (alternative && altCostFor(s, player, d)?.forage)) {
    const f = foragePick(s, player);
    if (!f || !forage(s, player, resolvePick(s, f, choices.picks?.forage))) throw new RulesError(msg("Can't forage"));
  }
  // Granted escape (Underworld Breach): N other cards from the graveyard exiled in addition.
  const escapeN = terms.playFrom?.exileOthers;
  if (escapeN) {
    const cards = graveyardToExile(s, player, stackId, escapeN);
    if (!cards) throw new RulesError(msg("You must exile {n} other cards from your graveyard", { n: escapeN }));
    for (const id of cards) moveObject(s, id, "exile");
  }
  // Force of Will, Daze: life, cards exiled from the hand, returned permanent, paid with the alternative cost.
  const altPay = alternative ? altCostFor(s, player, d)?.pay : undefined;
  if (altPay) {
    const paid = altCostPayment(s, player, stackId, altPay, choices.picks);
    if (!paid) throw new RulesError(msg("Can't pay this alternative cost"));
    if (altPay.life) payLife_(s, player, altPay.life);
    for (const id of paid.exile) moveObject(s, id, "exile");
    if (paid.bounce) moveObject(s, paid.bounce, "hand");
    for (const id of paid.sacrifice ?? []) sacrificePermanent(s, id);
  }
  // Conspiracy Unraveler: "collect evidence 10 rather than pay the mana cost".
  const altEvidence = alternative ? altCostFor(s, player, d)?.collectEvidence : undefined;
  if (altEvidence) {
    const cards = spellPickNow(s, player, stackId, d, x, "evidence", "alternative", choices);
    if (!cards) throw new RulesError(msg("Not enough evidence to collect in your graveyard"));
    collectEvidence(s, player, cards);
  }
  // Additional costs, chosen by the player or automatically (before the mana: these permanents no longer produce mana).
  for (const id of [...auto.tap, ...harmonyTap]) tapObject(s, obj(s, id));
  // Agent Maria Hill: "tapped to pay a teamwork cost".
  for (const id of teamTap) tapObject(s, obj(s, id), "teamwork");
  for (const id of auto.bounce) moveObject(s, id, "hand");
  for (const id of auto.graveyard) moveObject(s, id, "exile");
  const costExiled = auto.exile.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id);
  // Sneak: the weakest unblocked attacker returns to its owner's hand.
  // Web-slinging: a tapped creature you control returns to hand (by choice, the cheapest by default).
  const bounced: ObjectId[] = [];
  const webSlinging = alternative && isWebSlinging(s, player, d);
  if (webSlinging) {
    const options = webSlingingOptions(s, player);
    const tapped = choices.bounce?.length ? choices.bounce[0] : options[0];
    if (!tapped || !options.includes(tapped) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError(msg("No tapped creature to return"));
    removeFromCombat(s, tapped);
    const back = moveObject(s, tapped, "hand");
    if (back) bounced.push(back);
  }
  const sneaked = (alternative && castOption(d, "alternative")?.via === "sneak") || !!terms.sneakGranted;
  let sneakDefender: string | undefined;
  if (sneaked) {
    // The returned unblocked attacker: by choice (`bounce`; `returnAttacker` for a granted sneak), the weakest by
    // default.
    const options = sneakOptions(s, player);
    const picked = terms.sneakGranted ? choices.picks?.returnAttacker : undefined;
    if (picked && (picked.length !== 1 || !options.includes(picked[0] as ObjectId)))
      throw new RulesError(
        msg("Invalid choice: {label}", { label: msg("Sneak: the unblocked attacker to return to its owner's hand") }),
      );
    const back = picked?.[0] ?? (choices.bounce?.length ? choices.bounce[0] : options[0]);
    if (!back || !options.includes(back) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError(msg("No unblocked attacker"));
    sneakDefender = s.combat?.attackers.find((a) => a.id === back)?.defender;
    removeFromCombat(s, back);
    moveObject(s, back, "hand");
  }
  // Collect evidence: the graveyard cards are exiled while paying the cost.
  if (evidence) collectEvidence(s, player, evidence);
  if (targetEvidence) collectEvidence(s, player, targetEvidence);
  for (const id of gyExile ?? []) moveObject(s, id, "exile");
  // Only an Adventure goes "on an adventure"; an omen (same Scryfall layout) is shuffled into the library.
  const adventure = choices.face !== undefined && cardDef.layout === "adventure" && d.subtypes.includes("Adventure");
  if (choices.face !== undefined) obj(s, stackId).faceDefId = d.id;
  if (choices.faceDown && faceDown) {
    const spellObj = obj(s, stackId);
    s.defs[FACE_DOWN_ID] ??= FACE_DOWN_DEF;
    spellObj.faceDown = { card: spellObj.defId, ward: !faceDown.morph, upCosts: [faceDown.cost] };
    spellObj.defId = FACE_DOWN_ID;
  }
  // The next spell: can't be countered (Theorist's Proxy), counters or haste (Summon: Fenrir), copied (below).
  const next = consumeNextSpells(s, player, d);
  const uncounterable = next.some((n) => n.uncounterable);
  // Alternative cost paid (601.2b: only one), read by the rules and by "if it was cast this way" conditions: the name
  // of the alternative cost paid (`via`: evoke, impending, dash, blitz…), web-slinging and sneak also when granted.
  const castVia: CastVia | undefined = webSlinging
    ? "webSlinging"
    : terms.mayhem
      ? "mayhem"
      : sneaked
        ? "sneak"
        : warp
          ? "warp"
          : alternative
            ? altCostFor(s, player, d)?.via
            : undefined;
  const item: StackItem = {
    id: stackId,
    kind: "spell",
    controller: player,
    sourceId: stackId,
    sourceDefId: d.id,
    abilityIndex: -1,
    mode: modeIndex,
    targets,
    x,
    kicked,
    sourceSnapshot: { keywords: d.keywords, power: d.power ?? 0, controller: player },
    // Quistis Trepe: exiled as it leaves the stack, like flashback.
    flashback: flashback || terms.after === "exile",
    ...(terms.after === "bottom" ? { libraryInstead: "bottom" as const } : {}),
    arrival: arrivalFor(terms, next, d),
    adventure: adventure || undefined,
    cast: {
      from: terms.source === "flashback" ? "graveyard" : terms.source,
      via: castVia,
      ...(sneaked ? { sneakDefender } : {}),
      costBounced: bounced.length ? bounced : undefined,
      manaSpent: free ? 0 : manaValue(cost),
      beheld: beheldId ? true : undefined,
      metWhenCast: metWhenCast || undefined,
    },
    // Permanents sacrificed as an additional cost ("if the sacrificed permanent was a Vehicle").
    paid: {
      sacrificed: sacrifice.length ? [...sacrifice] : undefined,
      exiled: costExiled.length ? costExiled : undefined,
      beheld: beheldIds.length ? beheldIds : undefined,
    },
    uncounterable: uncounterable || undefined,
  };
  s.stack.push(item);
  // Beholding cards from the hand: they are revealed.
  const revealed = beheldIds.filter((id) => s.objects[id]?.zone === "hand");
  if (revealed.length) emit({ type: "reveal", player, defIds: revealed.map((id) => s.objects[id]?.defId ?? "") });
  // Permanents another cost still needs (sacrificed, sacrificed instead of a discard, or the kicker's sacrificed, blighted
  // or returned permanent): the payment doesn't use their mana abilities that sacrifice them (Treasure).
  const neededForCosts = [
    ...sacrifice,
    ...discard.filter((id) => s.objects[id]?.zone === "battlefield"),
    ...(kicked && kickerPermanent ? [kickerPermanent] : []),
  ];
  try {
    const taps: { id: ObjectId; ab?: ManaAbilityDef; amount: number; chosen?: GameObject["chosen"] }[] = [];
    const spent: Partial<Record<ManaType, number>> = {};
    payMana(
      s,
      player,
      cost,
      undefined,
      {
        ...(neededForCosts.length ? { sacrificedForCost: new Set(neededForCosts) } : {}),
        spell: view,
        convoke: hasConvoke(s, player, d),
        improvise: hasImprovise(s, player, d) || undefined,
        delve: spellHasKeyword(s, player, d, "delve"),
        sacrificeToPay: d.additionalCost?.sacrificeToPay,
        fromHand: terms.source === "hand",
        ...(bendPaid ? { waterbend: bendPaid } : {}),
        ...(onlyChosen(validHelperPicks(s, player, stackId, d, choices)) ? { only: onlyChosen(choices.picks) } : {}),
        ...(choices.phyrexianLife !== undefined ? { phyrexianLife: choices.phyrexianLife } : {}),
      },
      taps,
      spent,
    );
    if (Object.keys(spent).length && item.cast) item.cast.spentColors = spent;
    // A waterbend cost was paid ("whenever you waterbend").
    if (
      d.additionalCost?.waterbend !== undefined ||
      d.additionalCost?.xCost === "waterbend" ||
      (kicked && d.kicker?.kind === "waterbend") ||
      (terms.waterbendOverride && !free && !alternative)
    )
      bent(s, player, "water");
    // Mana from Caves (Bat Colony) and sources used (Tecutlan, Barracks of the Thousand).
    if (taps.length) {
      item.manaSources = taps.flatMap((t) => Array(t.amount).fill(t.id) as ObjectId[]);
      // A source sacrificed for its mana (Treasure) is known by its last known information.
      const subtypes = (id: ObjectId) => (s.objects[id] ? chars(s, id).subtypes : (s.lki[id]?.subtypes ?? []));
      const caves = taps.filter((t) => subtypes(t.id).includes("Cave")).reduce((n, t) => n + t.amount, 0);
      if (caves && item.cast) item.cast.spentFrom = { ...item.cast.spentFrom, cave: caves };
      // Coin of Mastery: mana spent from artifact sources (a sacrificed Treasure, by its last known information).
      // Excess mana produced (Sol Ring for a single {1}) stays in the pool: it is counted against the artifacts first.
      const types = (id: ObjectId) => (s.objects[id] ? chars(s, id).types : (s.lki[id]?.types ?? []));
      const artifacts = taps.filter((t) => types(t.id).includes("Artifact")).reduce((n, t) => n + t.amount, 0);
      const excess = Math.max(0, taps.reduce((n, t) => n + t.amount, 0) - Object.values(spent).reduce((n, k) => n + (k ?? 0), 0));
      if (artifacts > excess && item.cast) item.cast.spentFrom = { ...item.cast.spentFrom, artifact: artifacts - excess };
    }
    // Effects tied to the spent mana, if this spell matches (Carnelian Orb, Pyromancer's Goggles; Cavern of Souls: "of
    // the chosen type" is read on the source; Path of Ancestry: "that shares a creature type with your commander", a
    // triggered ability of the source).
    const riders = taps.flatMap(({ id, ab, chosen }) => {
      const rider = ab?.rider;
      if (!rider) return [];
      // Marked mana in the pool: its source's choice, fixed when produced (Cavern of Souls).
      const src = chosen ? { chosen } : s.objects[id];
      const filter = withX(s, src ? withChosen(rider.spell, src) : rider.spell, staticContext(s, player, id));
      if (!matchesView(view, filter, player, id)) return [];
      const defId = s.objects[id]?.defId ?? s.lki[id]?.defId;
      // The spell this mana was spent on is the event's object (Yuna: "that creature enters with…").
      if (rider.effects && defId)
        pushInline(s, player, id, defId, { targets: [], effects: rider.effects }, { objectId: item.id, player });
      return rider.effect ? [rider.effect] : [];
    });
    if (riders.length) item.riders = riders;
    if (riders.includes("uncounterable")) item.uncounterable = true;
  } catch (e) {
    rethrowAsRules(e, msg("Not enough mana"));
  }
  // Warp "Warp—{B}, Pay 2 life": the life is part of the cost.
  if (warp?.life) payLife_(s, player, warp.life);
  if (terms.payLife) payLife_(s, player, terms.payLife);
  if (d.additionalCost?.xCost === "life" && x > 0) payLife_(s, player, x);
  if (kickerLife) payLife_(s, player, kickerLife);
  if (d.additionalCost?.xCost === "blight" && x > 0) {
    const blighted = spellPickNow(s, player, item.id, d, x, "blight", undefined, choices)?.[0];
    if (blighted) changeCounters(s, obj(s, blighted), "-1/-1", x, { asCost: true, by: player });
  }
  if (lifeTax) payLife_(s, player, lifeTax);
  // Emrakul, the Exigent Doom: "until this card is cast from exile" — the costs are paid, the spell is cast (601.2i);
  // the ability granted to the land may have been used to pay them.
  const uid = s.objects[item.id]?.uid;
  if (uid && s.effects.some((e) => e.untilExiledUid === uid)) {
    s.effects = s.effects.filter((e) => e.untilExiledUid !== uid);
    bump(s);
  }
  // Pyromancer's Goggles: "copy that spell".
  for (const r of item.riders ?? []) if (r === "copy") copyStackItem(s, item, player);
  // Teach by Example: "when you next cast an instant or sorcery spell this turn, copy that spell".
  for (const n of next) {
    if (!n.copy) continue;
    const id = copyStackItem(s, item, player);
    const copy = n.nonlegendary && id ? s.stack.find((x) => x.id === id) : undefined;
    if (copy) copy.arrival = { ...copy.arrival, nonlegendary: true };
  }
  // Bitter Triumph: without a discarded card, the life is paid.
  if (opts.discard?.orLife !== undefined && discard.length === 0) payLife_(s, player, opts.discard.orLife);
  // Souls of the Lost: a permanent chosen instead of a card is sacrificed.
  const sacrificedInstead = discard.filter((id) => obj(s, id).zone === "battlefield");
  const handDiscard = discard.filter((id) => !sacrificedInstead.includes(id));
  for (const id of sacrificedInstead) sacrificePermanent(s, id);
  if (handDiscard.length) {
    emit({ type: "discard", player, defIds: handDiscard.map((id) => obj(s, id).defId) });
    const discarded = handDiscard.map((id) => moveDiscarded(s, player, id));
    for (const id of discarded) announceDiscard(s, player, id);
    announceDiscardBatch(s, player, handDiscard.length);
    // Grab the Prize: "if the discarded card wasn't a land card".
    item.paid = { ...item.paid, discarded: discarded.filter((id): id is string => !!id) };
  }
  for (const id of sacrifice) sacrificePermanent(s, id);
  if (kicked && kickerPermanent && d.kicker?.pay?.sacrifice) sacrificePermanent(s, kickerPermanent);
  else if (kicked && kickerPermanent && d.kicker?.pay?.blight)
    changeCounters(s, obj(s, kickerPermanent), "-1/-1", d.kicker.pay.blight, { asCost: true, by: player });
  else if (kicked && kickerPermanent && d.kicker?.pay?.bounce) moveObject(s, kickerPermanent, "hand");
  s.priority.passes = 0;
  emit({ type: "cast", player, stackId, defId: d.id, targets: flatTargets(targets) });
  // 903.8: one more cast from the command zone (the next one's tax increases by {2}).
  if (terms.source === "command") {
    const rec = commanderOf(s, s.objects[stackId]);
    if (rec) rec.casts += 1;
  }
  const caster = s.players[player];
  const instantOrSorcery = d.types.includes("Instant") || d.types.includes("Sorcery");
  // Thousand-Year Storm: instants and sorceries cast before this one this turn (read before logging this spell).
  const before = countTurnEvents(s, { event: "cast", who: "you", types: ["Instant", "Sorcery"] }, player);
  // Storm (702.40a): spells cast before this one this turn, by all players.
  const spellsBefore = countTurnEvents(s, { event: "cast" }, player);
  if (caster) {
    caster.turnStats.spellsCast += 1;
    // Turn log: "legendary creature spell cast this turn", "spell cast from your hand".
    logTurnEvent(s, {
      e: "cast",
      player,
      name: d.name,
      types: d.types,
      subtypes: d.subtypes,
      supertypes: d.supertypes,
      fromZone: terms.source === "flashback" ? "graveyard" : terms.source,
      manaValue: manaValue(d.manaCost) + (x && d.manaCost?.x ? x * d.manaCost.x : 0),
      warped: warp ? true : undefined,
      keywords: chars(s, stackId).keywords,
      colors: chars(s, stackId).colors,
    });
    bump(s); // static abilities depend on it ("if you've cast two spells this turn")
  }
  rulesEvent(s, { e: "cast", player, stackId, instantSorceryBefore: instantOrSorcery ? before : undefined, spellsBefore });
  // Codie, Vociferous Codex: "when you next cast a spell this turn, …" (the spell: `ref.target("s")`).
  for (const n of next)
    if (n.trigger)
      pushInline(s, player, stackId, d.id, {
        targets: [],
        effects: n.trigger,
        bound: { s: [stackId] },
        label: msg("Next spell"),
      });
  // Expend N (Bloomburrow): the N-th total mana spent to cast spells this turn.
  const spent = item.cast?.manaSpent ?? 0;
  if (caster && spent > 0) {
    const was = caster.turnStats.manaSpentOnSpells ?? 0;
    caster.turnStats.manaSpentOnSpells = was + spent;
    for (const n of [4, 8]) if (was < n && was + spent >= n) rulesEvent(s, { e: "expend", player, n });
  }
  announceTargets(s, stackId, player, targets);
}

/**
 * Removes colored symbols from a cost: each symbol removes one of its color, otherwise one generic mana (118.7c), without
 * going below zero.
 */
function withoutColored(cost: ManaCost, colored: ManaCost["colored"]): ManaCost {
  const out = { ...cost.colored };
  let generic = cost.generic;
  for (const [k, n] of Object.entries(colored)) {
    for (let i = 0; i < (n ?? 0); i++) {
      const left = out[k as ManaType] ?? 0;
      if (left > 1) out[k as ManaType] = left - 1;
      else if (left === 1) delete out[k as ManaType];
      else if (generic > 0) generic -= 1;
    }
  }
  return { ...cost, generic, colored: out };
}

/** Sum of two mana costs. */
function addCosts(a: ManaCost, b: ManaCost): ManaCost {
  const colored = { ...a.colored };
  for (const [k, n] of Object.entries(b.colored)) colored[k as ManaType] = (colored[k as ManaType] ?? 0) + (n ?? 0);
  return {
    generic: a.generic + b.generic,
    colored,
    x: a.x,
    hybrid: [...(a.hybrid ?? []), ...(b.hybrid ?? [])],
    twoHybrid: [...(a.twoHybrid ?? []), ...(b.twoHybrid ?? [])],
  };
}

/** Announces the targets of an item put on the stack (ward, "becomes the target"). */
export function announceTargets(s: GameState, stackId: string, controller: PlayerId, targets: Record<string, string[]>): void {
  const all = flatTargets(targets);
  if (all.length) rulesEvent(s, { e: "targeted", stackId, controller, targets: all });
  checkCrime(s, controller, all);
}

/**
 * "Can't be countered" static abilities: the controller's spells (Sphinx of the Final Word, Frenzied Baloth, Chimil),
 * or everyone's spells and abilities (Spider-Punk).
 */
function protectedFromCounter(s: GameState, item: StackItem): boolean {
  const d = s.defs[item.sourceDefId];
  for (const p of s.playerOrder) {
    for (const { ab } of playerStatics(s, p, "uncounterable")) {
      const u = ab.uncounterable;
      if (!u || (!u.everyone && p !== item.controller)) continue;
      if (item.kind === "ability" ? u.abilities : !u.filter || (!!d && matchesView(spellView(d, item.controller), u.filter, p)))
        return true;
    }
  }
  return false;
}

/** 701.5: counters the stack item; a countered spell goes to the graveyard (exile if it was cast with flashback). */
export function counterItem(s: GameState, id: string, by: string, exile = false): boolean {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (!item || s.resolving?.item.id === id) return false;
  if (item.kind === "spell" && (cardRule(s.defs[item.sourceDefId], "cantBeCountered") || item.uncounterable)) return false;
  if (protectedFromCounter(s, item)) return false;
  s.stack.splice(i, 1);
  emit({ type: "countered", stackId: item.id, defId: item.sourceDefId, by });
  // Last known information ("its controller creates…").
  if (item.kind === "spell" && s.objects[item.sourceId]) s.lki[item.id] = snapshot(s, item.sourceId);
  if (item.kind === "spell" && s.objects[item.sourceId]) spellToRest(s, item, exile);
  return true;
}

/** "Exile the spell" (airbending): it leaves the stack without being countered; a copy ceases to exist. */
export function exileSpell(s: GameState, id: string): ObjectId | undefined {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (item?.kind !== "spell" || s.resolving?.item.id === id) return undefined;
  s.stack.splice(i, 1);
  const moved = s.objects[item.sourceId] ? moveObject(s, item.sourceId, "exile") : undefined;
  bump(s);
  return moved ?? undefined;
}

/** "Return target spell to its owner's hand": a copy ceases to exist. */
export function bounceSpell(s: GameState, id: string): void {
  spellToZone(s, id, "hand");
}

/** Removes a spell from the stack to its owner's hand or library (Swat Away: top or bottom). */
export function spellToZone(s: GameState, id: string, to: "hand" | "libraryTop" | "libraryBottom"): void {
  const i = s.stack.findIndex((x) => x.id === id);
  const item = s.stack[i];
  if (item?.kind !== "spell" || s.resolving?.item.id === id) return;
  s.stack.splice(i, 1);
  if (s.objects[item.sourceId]) {
    if (to === "hand") moveObject(s, item.sourceId, "hand");
    else moveObject(s, item.sourceId, "library", { position: to === "libraryTop" ? "top" : "bottom" });
  }
  bump(s);
}

/** Abilities of an object: computed by the layers on the battlefield (granted, lost), printed elsewhere. */
export function abilitiesOf(s: GameState, id: ObjectId): CardDef["abilities"] {
  const o = s.objects[id];
  if (!o) return [];
  return o.zone === "battlefield" ? chars(s, id).abilities : (s.defs[o.defId]?.abilities ?? []);
}

/** The permanent that grants `source` its ability at rank `index` ("equipped creature has '…'"), if it is on the battlefield. */
export function grantorOf(s: GameState, source: ObjectId, index: number): ObjectId | undefined {
  if (s.objects[source]?.zone !== "battlefield") return undefined;
  const g = chars(s, source).grantors?.[index];
  return g && onBattlefield(s, g) ? g : undefined;
}

export function activatedAbility(s: GameState, source: ObjectId, index: number): ActivatedAbilityDef | null {
  const ab = abilitiesOf(s, source)[index];
  return ab?.kind === "activated" ? ab : null;
}

/** Permanents that can be sacrificed for the ability's cost (source excluded). */
export function sacrificeOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.sacrifice?.filter;
  if (!f) return [];
  const self = !!ab.cost.sacrifice?.includeSelf;
  const ids = s.battlefield.filter(
    (id) =>
      (self || id !== source) &&
      obj(s, id).controller === player &&
      matchesObjectFilter(s, player, id, f, source) &&
      !hasKeyword(s, id, "cantBeSacrificed"),
  );
  // Default choice (the first ones): first what doesn't produce mana (a Treasure can still pay the cost).
  const makesMana = (id: ObjectId) => manaAbilitiesOf(s, id).length > 0;
  const ordered = [...ids.filter((id) => !makesMana(id)), ...ids.filter(makesMana)];
  if (ab.cost.sacrifice?.distinct !== "name") return ordered;
  // "with different names" (Transmutation Font): one permanent per name first, so that the default choice is allowed.
  const first = firstOfEachName(ordered, (id) => chars(s, id).name);
  return [...first, ...ordered.filter((id) => !first.includes(id))];
}

/** Number of different names among permanents ("with different names" cost). */
function distinctNames(s: GameState, ids: readonly ObjectId[]): number {
  return firstOfEachName(ids, (id) => chars(s, id).name).length;
}

/**
 * "Tap X untapped [permanents]" (Secluded Starforge): the candidates, first those that don't produce mana (the first X
 * are the default choice; they don't pay the ability's mana).
 */
export function tapXCandidates(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): ObjectId[] {
  const ids = s.battlefield.filter(
    (id) =>
      id !== source && obj(s, id).controller === player && !obj(s, id).tapped && matchesObjectFilter(s, player, id, f, source),
  );
  const makesMana = (id: ObjectId) => manaAbilitiesOf(s, id).length > 0;
  return [...ids.filter((id) => !makesMana(id)), ...ids.filter(makesMana)];
}

export function tapOthersOptions(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.tapOthers?.filter;
  if (!f) return [];
  const self = !!ab.cost.tapOthers?.includeSelf;
  return s.battlefield.filter(
    (id) =>
      (id !== source || self) &&
      obj(s, id).controller === player &&
      !obj(s, id).tapped &&
      matchesObjectFilter(s, player, id, f, source),
  );
}

/** Crew N: untapped creatures (other than the source) with total power N or greater, weakest first. */
function crewOptions(s: GameState, player: PlayerId, source: ObjectId, n: number): ObjectId[] | null {
  const ids = crewCandidates(s, player, source).sort((a, b) => crewPower(s, a) - crewPower(s, b));
  const out: ObjectId[] = [];
  let total = 0;
  for (const id of ids) {
    if (total >= n) break;
    out.push(id);
    total += Math.max(0, crewPower(s, id));
  }
  return total >= n ? out : null;
}

/** Creatures that can saddle or crew the source. */
export function crewCandidates(s: GameState, player: PlayerId, source: ObjectId): ObjectId[] {
  return s.battlefield.filter(
    (id) => id !== source && obj(s, id).controller === player && !obj(s, id).tapped && isCreature(s, id),
  );
}

/** Default crew choice (weakest first), for the interface and the AI. */
export function suggestedCrew(s: GameState, player: PlayerId, source: ObjectId, n: number): ObjectId[] {
  return crewOptions(s, player, source, n) ?? [];
}

function chosenCrew(s: GameState, player: PlayerId, source: ObjectId, n: number, picked: ObjectId[] | undefined): ObjectId[] {
  if (!picked?.length) return crewOptions(s, player, source, n) ?? [];
  const legal = crewCandidates(s, player, source);
  if (new Set(picked).size !== picked.length || picked.some((id) => !legal.includes(id)))
    throw new RulesError(msg("Invalid crew creatures"));
  if (picked.reduce((t, id) => t + Math.max(0, crewPower(s, id)), 0) < n)
    throw new RulesError(msg("Not enough total power ({n} required)", { n }));
  return picked;
}

/** Power counted to saddle and crew: toughness (Interface Ace), +2 for pilots. */
export function crewPower(s: GameState, id: ObjectId): number {
  return effectivePower(chars(s, id), "crew");
}

/**
 * A source whose name was chosen by a permanent whose rule is `chosenNameAbilities: "forbid"` (Sorcerous Spyglass,
 * Petrified Hamlet); the rule is that of the effective definition (a copy of Spyglass has it too).
 */
function spyglassed(s: GameState, source: ObjectId): boolean {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.some(
    (id) =>
      hasName(name, obj(s, id).chosen?.cardName) && cardRule(s.defs[copiedDefId(s, id)], "chosenNameAbilities") === "forbid",
  );
}

/** Skyseer's Chariot: {N} more for activated abilities of sources with the chosen name (`chosenNameAbilities: N`). */
function chosenNameTax(s: GameState, source: ObjectId): number {
  const name = s.objects[source] && chars(s, source).name;
  return s.battlefield.reduce((n, id) => {
    const rule = cardRule(s.defs[copiedDefId(s, id)], "chosenNameAbilities");
    const tax = typeof rule === "number" ? rule : 0;
    return n + (tax && hasName(name, obj(s, id).chosen?.cardName) ? tax : 0);
  }, 0);
}

/** Jace's Machinations: loyalty ability of a Jace activatable at instant speed this turn. */
export function instantLoyalty(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): boolean {
  return (
    ab.cost.loyalty !== undefined && playerStatic(s, player, "jaceLoyaltyInstant") && chars(s, source).subtypes.includes("Jace")
  );
}

/** Cards in your graveyard that can be exiled for the cost ("exile another creature card from your graveyard"): cheapest first. */
function graveyardExileOptions(s: GameState, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] {
  const f = ab.cost.exileFromGraveyard;
  const o = s.objects[source];
  if (!f || !o) return [];
  return (s.players[o.owner]?.graveyard ?? [])
    .filter((id) => id !== source && matchesCard(s, o.owner, id, { ...f.filter, controller: undefined }))
    .sort((a, b) => manaValue(s.defs[obj(s, a).defId]?.manaCost) - manaValue(s.defs[obj(s, b).defId]?.manaCost));
}

/**
 * Craft (702.167): materials chosen automatically among the cards in the player's graveyard (first), then their tokens,
 * then their other permanents (cheapest first, unless `preferHighManaValue`). "One or more": all the matching cards in
 * the graveyard, otherwise a permanent. `null` if the cost can't be paid.
 */
/** Possible materials of a craft: graveyard cards, then tokens, then other matching permanents. */
function craftPool(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef) {
  const c = ab.cost.craft;
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  const order = (ids: ObjectId[]) => [...ids].sort((a, b) => (c?.preferHighManaValue ? mv(b) - mv(a) : mv(a) - mv(b)));
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => id !== source);
  const permanents = s.battlefield.filter((id) => id !== source && obj(s, id).controller === player);
  const matches = (id: ObjectId, f: ObjectFilter) =>
    obj(s, id).zone === "battlefield"
      ? matchesObjectFilter(s, player, id, f, source)
      : matchesCard(s, player, id, { ...f, controller: undefined }, source);
  const candidates = (f: ObjectFilter) => [
    ...order(graveyard.filter((id) => matches(id, f))),
    ...order(permanents.filter((id) => obj(s, id).isToken && matches(id, f))),
    ...order(permanents.filter((id) => !obj(s, id).isToken && matches(id, f))),
  ];
  return { matches, candidates };
}

/** Choice of craft materials offered to the player: options, number, default choice. */
export function craftSpec(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
): { min: number; max: number; options: ObjectId[]; suggested: ObjectId[] } | null {
  const c = ab.cost.craft;
  const suggested = craftMaterials(s, player, source, ab);
  if (!c || !suggested) return null;
  const { candidates } = craftPool(s, player, source, ab);
  const options = [...new Set(c.each ? c.each.flatMap((f) => candidates(f)) : candidates(c.filter ?? {}))];
  const n = c.each ? c.each.length : c.count;
  return { min: c.orMore ? 1 : n, max: c.orMore ? options.length : n, options, suggested };
}

/** Materials chosen by the player, checked (702.167); without a choice, the default ones. */
export function chosenCraftMaterials(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  picked: ObjectId[] | undefined,
): ObjectId[] | null {
  const c = ab.cost.craft;
  if (!c) return [];
  if (!picked?.length) return craftMaterials(s, player, source, ab);
  const spec = craftSpec(s, player, source, ab);
  if (!spec) return null;
  const bad = () => new RulesError(msg("Invalid craft materials"));
  if (new Set(picked).size !== picked.length || picked.some((id) => !spec.options.includes(id))) throw bad();
  if (picked.length < spec.min || picked.length > spec.max) throw bad();
  if (c.each) {
    // One distinct material per filter: a complete assignment is needed.
    const { matches } = craftPool(s, player, source, ab);
    const assign = (i: number, used: Set<ObjectId>): boolean => {
      const f = c.each?.[i];
      if (!f) return true;
      return picked.some((id) => !used.has(id) && matches(id, f) && assign(i + 1, new Set([...used, id])));
    };
    if (!assign(0, new Set())) throw bad();
  }
  return picked;
}

export function craftMaterials(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] | null {
  const c = ab.cost.craft;
  if (!c) return [];
  const { candidates } = craftPool(s, player, source, ab);
  if (c.each) {
    // One distinct material per filter (assignment by backtracking, the lists are short).
    const pick = (i: number, used: ObjectId[]): ObjectId[] | null => {
      const f = c.each?.[i];
      if (!f) return used;
      for (const id of candidates(f)) {
        if (used.includes(id)) continue;
        const rest = pick(i + 1, [...used, id]);
        if (rest) return rest;
      }
      return null;
    };
    return pick(0, []);
  }
  const all = candidates(c.filter ?? {});
  if (c.orMore && c.distinctColors) {
    const seen = new Set<string>();
    const picked = all.filter((id) => {
      const fresh = (s.defs[obj(s, id).defId]?.colors ?? []).filter((col) => !seen.has(col));
      for (const col of fresh) seen.add(col);
      return fresh.length > 0;
    });
    return picked.length ? picked : all.length ? all.slice(0, 1) : null;
  }
  if (c.orMore) {
    const fromGraveyard = all.filter((id) => obj(s, id).zone === "graveyard");
    return fromGraveyard.length ? fromGraveyard : all.length ? all.slice(0, 1) : null;
  }
  return all.length >= c.count ? all.slice(0, c.count) : null;
}

/**
 * Permanents the cost's counters are removed from, one id per counter (those that carry the most first); `null` if there
 * are not enough.
 */
function counterSources(s: GameState, player: PlayerId, source: ObjectId, ab: ActivatedAbilityDef): ObjectId[] | null {
  const c = ab.cost.removeCounterFrom;
  if (!c) return null;
  const ids = s.battlefield
    .filter(
      (id) =>
        obj(s, id).controller === player &&
        countersFor(obj(s, id), c.kind) > 0 &&
        matchesObjectFilter(s, player, id, c.filter, source),
    )
    .sort((a, b) => countersFor(obj(s, b), c.kind) - countersFor(obj(s, a), c.kind));
  const out = ids.flatMap((id) => Array<ObjectId>(countersFor(obj(s, id), c.kind)).fill(id));
  const n = c.n ?? 1;
  return out.length >= n ? out.slice(0, n) : null;
}

/** Zone an ability is activated from: battlefield, graveyard or hand. */
export function abilityZone(ab: ActivatedAbilityDef): "battlefield" | "graveyard" | "hand" {
  return ab.fromGraveyard ? "graveyard" : ab.fromHand ? "hand" : "battlefield";
}

/**
 * Zone this object activates this ability from: the ability's own, or the command zone for an emblem (114.4: its
 * abilities work there; Karn, Living Legacy) and for an ability that says so (`fromCommand`: commander ninjutsu).
 * Outside the battlefield, the owner activates it.
 */
/**
 * 602.2: may this player activate this ability of this object? Its controller (its owner outside the battlefield), or the
 * players its `activators` designate (Xantcha: any player; Oft-Nabbed Goat: only the opponents of its controller).
 */
export function mayActivate(s: GameState, player: PlayerId, o: GameObject, ab: ActivatedAbilityDef): boolean {
  const holder = o.zone === "battlefield" ? o.controller : o.owner;
  if (o.zone !== "battlefield" || !ab.activators) return holder === player;
  return ab.activators === "any" || (player !== holder && opponentsOf(s, holder).includes(player));
}

export function activationZone(o: GameObject, ab: ActivatedAbilityDef): "battlefield" | "graveyard" | "hand" | "command" {
  return o.zone === "command" && (o.isToken || ab.fromCommand) ? "command" : abilityZone(ab);
}

/** Counters of a kind on an object (`any`: all). */
function countersFor(o: GameObject, kind: string): number {
  return kind === "any" ? Object.values(o.counters).reduce<number>((n, k) => n + (k ?? 0), 0) : (o.counters[kind] ?? 0);
}

/** N counters of any kind, default choice: −1/−1 first, +1/+1 last (one kind per counter). */
function anyCountersDefault(counters: GameObject["counters"], n: number): string[] {
  const kinds = Object.keys(counters).sort(
    (a, b) => Number(b === "-1/-1") - Number(a === "-1/-1") || Number(a === "+1/+1") - Number(b === "+1/+1"),
  );
  const out: string[] = [];
  for (const k of kinds) for (let i = 0; i < (counters[k] ?? 0) && out.length < n; i++) out.push(k);
  return out;
}

/** Greatest toughness among a player's creatures (0 if they have none). */
export function greatestToughness(s: GameState, player: PlayerId): number {
  let best = 0;
  for (const id of s.battlefield) {
    if (obj(s, id).controller === player && isCreature(s, id)) best = Math.max(best, chars(s, id).toughness);
  }
  return best;
}

/**
 * Creature that `player` blights (ECL) when the choice is made for them: first one that survives the N −1/−1 counters
 * (the toughest), otherwise the least valuable (token, then smallest mana value). Null if they have no creature.
 */
export function blightTarget(s: GameState, player: PlayerId, n: number): ObjectId | null {
  const mine = s.battlefield.filter((id) => obj(s, id).controller === player && isCreature(s, id));
  if (mine.length === 0) return null;
  const left = (id: ObjectId) => chars(s, id).toughness - (s.objects[id]?.damage ?? 0) - n;
  const value = (id: ObjectId) => (s.objects[id]?.isToken ? -1 : manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost));
  const survivors = mine.filter((id) => left(id) > 0).sort((a, b) => left(b) - left(a));
  return survivors[0] ?? [...mine].sort((a, b) => value(a) - value(b))[0] ?? null;
}

/** Can the ability's non-mana costs be paid? */
/** The fixed parts of a cost: without its "X" parts (`xCosts`), memoized per definition. */
type FixedCost = Omit<CostDef, "sacrifice" | "tapOthers" | "exileFromGraveyard" | "removeCounters" | "discard"> & {
  sacrifice?: Omit<NonNullable<CostDef["sacrifice"]>, "count"> & { count: number };
  tapOthers?: Omit<NonNullable<CostDef["tapOthers"]>, "count"> & { count: number };
  exileFromGraveyard?: Omit<NonNullable<CostDef["exileFromGraveyard"]>, "count"> & { count: number };
  removeCounters?: { kind: string; n: number };
  discard?: number;
};
const fixedMemo = new WeakMap<CostDef, FixedCost>();
export function fixedCost(c: CostDef): FixedCost {
  let hit = fixedMemo.get(c);
  if (hit === undefined) {
    const x = xCosts(c);
    hit = {
      ...c,
      sacrifice: x.sacrifice ? undefined : (c.sacrifice as FixedCost["sacrifice"]),
      tapOthers: x.tap ? undefined : (c.tapOthers as FixedCost["tapOthers"]),
      exileFromGraveyard: x.exileFromGraveyard ? undefined : (c.exileFromGraveyard as FixedCost["exileFromGraveyard"]),
      removeCounters: x.removeCounters ? undefined : (c.removeCounters as FixedCost["removeCounters"]),
      discard: x.discard ? undefined : (c.discard as number | undefined),
      payLife: x.payLife ? undefined : c.payLife,
    };
    fixedMemo.set(c, hit);
  }
  return hit as FixedCost;
}

/**
 * The "X" parts of a cost (X chosen on activation), written with `"X"` in the cost keys: tap X untapped permanents
 * (Secluded Starforge), exile X cards from your graveyard (Winter, Cursed Rider), sacrifice X permanents, X ≥ 1
 * (Radiant Lotus), discard X cards (Gix, Yawgmoth Praetor), remove X counters of a kind (The Astonishing Ant-Man),
 * pay X life (`payLife: { kind: "x" }`, Krumar Initiate).
 */
export function xCosts(c: CostDef): {
  tap?: ObjectFilter;
  exileFromGraveyard?: ObjectFilter;
  sacrifice?: ObjectFilter;
  discard?: boolean;
  removeCounters?: string;
  payLife?: boolean;
} {
  return {
    ...(c.tapOthers?.count === "X" ? { tap: c.tapOthers.filter } : {}),
    ...(c.exileFromGraveyard?.count === "X" ? { exileFromGraveyard: c.exileFromGraveyard.filter } : {}),
    ...(c.sacrifice?.count === "X" ? { sacrifice: c.sacrifice.filter } : {}),
    ...(c.discard === "X" ? { discard: true } : {}),
    ...(c.removeCounters?.n === "X" ? { removeCounters: c.removeCounters.kind } : {}),
    ...(typeof c.payLife === "object" && c.payLife.kind === "x" ? { payLife: true } : {}),
  };
}

export function canPayNonManaCost(s: GameState, source: ObjectId, ab: ActivatedAbilityDef, index = -1): boolean {
  const fc = fixedCost(ab.cost);
  const o = s.objects[source];
  if (!o || o.zone !== activationZone(o, ab)) return false;
  if (o.zone === "battlefield" && !ab.specialAction && chars(s, source).keywords.includes("noActivatedAbilities")) return false;
  if (ab.once && !onceAvailable(s, o, ab, index) && !exhaustReusable(s, o.controller, ab)) return false;
  if (o.zone === "battlefield" && abilitiesLocked(s, o.controller, source, isManaAbility(ab))) return false;
  if (ab.oncePerTurn && activatedThisTurn(s, source, { index })) return false;
  const who = o.zone !== "battlefield" ? o.owner : o.controller;
  if (ab.activationCondition && !checkCondition(s, ab.activationCondition, who, source)) return false;
  // Sorcerous Spyglass: the (non-mana) abilities of sources with the chosen name can't be activated.
  if (spyglassed(s, source)) return false;
  // Karlov Watchdog: "permanents your opponents control can't be turned face up during your turn".
  if (ab.effects.some((e) => e.op === "turnFaceUp") && faceUpLocked(s, who)) return false;
  if (ab.cost.crew !== undefined && crewOptions(s, who, source, ab.cost.crew) === null) return false;
  if (ab.cost.tap && (o.tapped || sickForActivation(s, source))) return false;
  // 606.3: only one loyalty ability per planeswalker each turn; no more than its loyalty can be removed.
  if (ab.cost.loyalty !== undefined) {
    if (activatedThisTurn(s, source, { loyalty: true })) return false;
    const lc = ab.cost.loyalty === "X" ? 0 : ab.cost.loyalty;
    if (lc < 0 && (o.counters.loyalty ?? 0) < -lc) return false;
  }
  if (fc.exileFromGraveyard && graveyardExileOptions(s, source, ab).length < fc.exileFromGraveyard.count) return false;
  if (ab.cost.removeCounterFrom && !counterSources(s, who, source, ab)) return false;
  if (ab.cost.blight && !blightTarget(s, o.controller, ab.cost.blight)) return false;
  if (ab.cost.collectEvidence && !evidenceCards(s, who, source, ab.cost.collectEvidence)) return false;
  // "Tap / exile / sacrifice [the permanent that grants the ability]" (Fishing Pole, The Dominion Bracelet).
  if (ab.cost.grantor) {
    const g = grantorOf(s, source, index);
    if (!g || (ab.cost.grantor === "tap" && obj(s, g).tapped)) return false;
    if (ab.cost.grantor === "sacrifice" && hasKeyword(s, g, "cantBeSacrificed")) return false;
  }
  const player = o.zone !== "battlefield" ? o.owner : o.controller;
  if (fc.removeCounters && countersFor(o, fc.removeCounters.kind) < fc.removeCounters.n) return false;
  if (fc.payLife && payableLife(s, player) < lifeCost(s, player, source, fc.payLife)) return false;
  if (fc.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    const n = fc.sacrifice.distinct === "name" ? distinctNames(s, options) : options.length;
    if (n < fc.sacrifice.count) return false;
  }
  if (fc.tapOthers && tapOthersOptions(s, player, source, ab).length < fc.tapOthers.count) return false;
  if (fc.discard && discardCostOptions(s, player, source, ab.cost.discardFilter).length < fc.discard) return false;
  if (ab.cost.returnUnblockedAttacker && unblockedAttackers(s, player).length === 0) return false;
  if (ab.cost.bounce && bounceCostOptions(s, player, source, ab.cost.bounce).length === 0) return false;
  if (ab.cost.exile && bounceCostOptions(s, player, source, ab.cost.exile).length === 0) return false;
  if (ab.cost.forage && !canForage(s, player)) return false;
  if (ab.cost.craft && !craftMaterials(s, player, source, ab)) return false;
  return true;
}

/** Permanents the player can return to hand for a cost (`CostDef.bounce`), cheapest first. */
export function bounceCostOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): ObjectId[] {
  const mv = (id: ObjectId) => manaValue(s.defs[obj(s, id).defId]?.manaCost);
  return s.battlefield
    .filter((id) => id !== source && obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source))
    .sort((a, b) => mv(a) - mv(b));
}

/** Ninjutsu (702.49): the player's unblocked attackers, once blockers are declared. */
export function unblockedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  const afterBlocks = ["declareBlockers", "firstStrikeDamage", "combatDamage", "endCombat"].includes(s.turn.step);
  if (!s.combat || !afterBlocks || s.turn.active !== player) return [];
  if (s.turn.step === "declareBlockers" && s.pending?.kind === "declareBlockers") return [];
  return s.combat.attackers.filter((a) => !a.blocked && s.objects[a.id]?.controller === player).map((a) => a.id);
}

/** Cards in hand that can be discarded for an activation cost (not the source itself). */
export function discardCostOptions(s: GameState, player: PlayerId, source: ObjectId, filter?: ObjectFilter): ObjectId[] {
  return (s.players[player]?.hand ?? []).filter(
    (id) => id !== source && (!filter || matchesCard(s, player, id, { ...filter, controller: undefined }, source)),
  );
}

// ---------------------------------------------------------------------------
// Objects paid as costs, chosen by the player (PLAN-C, lots C7 and C8)
// ---------------------------------------------------------------------------

const manaValueOf = (s: GameState, id: ObjectId) => manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);

/**
 * Costs of an ability paid with objects to choose, with the engine's suggestion (its choice when the player doesn't
 * choose). `x`: the X of the activation; absent (`legalActions`), the "X" costs are `countIsX`. Computed when each cost
 * is paid: the suggestion is the one the engine applied at that moment.
 */
export function activationPicks(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  x?: number,
): CostPick[] {
  const c = ab.cost;
  const fc = fixedCost(ab.cost);
  const xc = xCosts(ab.cost);
  const out: CostPick[] = [];
  const mine = (id: ObjectId) => s.objects[id]?.controller === player;
  if (c.blight) {
    const best = blightTarget(s, player, c.blight);
    const options = s.battlefield.filter((id) => mine(id) && isCreature(s, id));
    if (best)
      out.push({
        slot: "blight",
        label:
          c.blight > 1
            ? msg("Blight {n}: the creature that gets {n} −1/−1 counters", { n: c.blight })
            : msg("Blight {n}: the creature that gets the −1/−1 counter", { n: c.blight }),
        count: 1,
        options: [best, ...options.filter((id) => id !== best)],
        suggested: [best],
      });
  }
  // "Remove a counter from this creature": the kind, when the source carries several.
  const self = s.objects[source];
  if (fc.removeCounters?.kind === "any" && self) {
    const kinds = Object.keys(self.counters).filter((k) => (self.counters[k] ?? 0) > 0);
    if (kinds.length > 1)
      out.push({
        slot: "counterKind",
        label: msg("Remove {n} counter(s) from this creature", { n: fc.removeCounters.n }),
        count: fc.removeCounters.n,
        options: kinds,
        labels: Object.fromEntries(
          kinds.map((k) => [k, msg("{counter} counter ({n})", { counter: counterLabel(k), n: self.counters[k] ?? 0 })]),
        ),
        suggested: anyCountersDefault(self.counters, fc.removeCounters.n),
        repeat: Object.fromEntries(kinds.map((k) => [k, self.counters[k] ?? 0])),
      });
  }
  if (c.removeCounterFrom) {
    const r = c.removeCounterFrom;
    const options = s.battlefield.filter(
      (id) => mine(id) && countersFor(obj(s, id), r.kind) > 0 && matchesObjectFilter(s, player, id, r.filter, source),
    );
    const suggested = counterSources(s, player, source, ab);
    // "Remove a counter" of any kind (Scholar of New Horizons, O'aka): the kind can be chosen too (`id:kind`).
    const kinds = r.kind === "any" ? counterKindOptions(s, options) : undefined;
    if (suggested)
      out.push({
        slot: "counterFrom",
        label:
          r.kind === "any"
            ? msg("Remove {n} counter(s)", { n: r.n ?? 1 })
            : msg("Remove {n} {kind} counter(s)", { n: r.n ?? 1, kind: r.kind }),
        count: r.n ?? 1,
        options: [...options, ...(kinds?.options ?? [])],
        suggested,
        repeat: {
          ...Object.fromEntries(options.map((id) => [id, countersFor(obj(s, id), r.kind)])),
          ...kinds?.repeat,
        },
        ...(kinds?.options.length ? { labels: kinds.labels } : {}),
      });
  }
  if (fc.exileFromGraveyard) {
    const options = graveyardExileOptions(s, source, ab);
    const n = fc.exileFromGraveyard.count;
    if (options.length >= n)
      out.push({
        slot: "graveyardExile",
        label: msg("Exile {n} card(s) from your graveyard", { n }),
        count: n,
        options,
        suggested: options.slice(0, n),
      });
  }
  if (xc.exileFromGraveyard) {
    const f = xc.exileFromGraveyard;
    const options = (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source));
    out.push({
      slot: "graveyardExileX",
      label: msg("Exile X cards from your graveyard"),
      count: x ?? 0,
      countIsX: x === undefined,
      options,
      suggested: options.slice(0, x ?? 0),
    });
  }
  if (xc.sacrifice) {
    const f = xc.sacrifice;
    // The others first, the source last (Radiant Lotus).
    const options = s.battlefield
      .filter((id) => mine(id) && matchesObjectFilter(s, player, id, f, source))
      .sort((a, b) => (a === source ? 1 : 0) - (b === source ? 1 : 0));
    out.push({
      slot: "sacrificeX",
      label: msg("Sacrifice X permanents"),
      count: x ?? 0,
      countIsX: x === undefined,
      options,
      suggested: options.slice(0, x ?? 0),
    });
  }
  if (c.exile) {
    const options = bounceCostOptions(s, player, source, c.exile);
    if (options.length)
      out.push({ slot: "exileOther", label: msg("Exile a permanent"), count: 1, options, suggested: options.slice(0, 1) });
  }
  if (c.returnUnblockedAttacker) {
    const options = [...unblockedAttackers(s, player)].sort((a, b) => chars(s, a).power - chars(s, b).power);
    if (options.length)
      out.push({
        slot: "returnAttacker",
        label: msg("Return an unblocked attacker to its owner's hand"),
        count: 1,
        options,
        suggested: options.slice(0, 1),
      });
  }
  if (c.tapToPay) out.push(...manaHelperPicks(s, player, source, { [c.tapToPay]: true }));
  // Gix, Yawgmoth Praetor: "discard X cards" (by default, the first ones in the hand).
  if (xc.discard) {
    const options = discardCostOptions(s, player, source, undefined);
    out.push({
      slot: "discardX",
      label: msg("Discard X cards"),
      count: x ?? 0,
      countIsX: x === undefined,
      options,
      suggested: options.slice(0, x ?? 0),
    });
  }
  // Baron Helmut Zemo: black cards from the graveyard with N or more black mana symbols among their mana costs.
  if (c.exileGraveyardSymbols) {
    const req = c.exileGraveyardSymbols;
    const suggested = symbolCards(s, player, req);
    const options = (s.players[player]?.graveyard ?? []).filter((id) =>
      s.defs[s.objects[id]?.defId ?? ""]?.colors.includes(req.color as Color),
    );
    if (suggested)
      out.push({
        slot: "symbolExile",
        label: msg("Exile cards from your graveyard with {n} or more {mana} symbols among their mana costs", {
          n: req.n,
          mana: `{${req.color}}`,
        }),
        count: suggested.length,
        options,
        suggested,
        minTotal: { n: req.n, values: Object.fromEntries(options.map((id) => [id, colorSymbols(s, id, req.color)])) },
      });
  }
  // Forage as a cost (701.61): three cards from the graveyard or a Food.
  if (c.forage) {
    const f = foragePick(s, player);
    if (f) out.push(f);
  }
  if (c.collectEvidence) {
    const options = (s.players[player]?.graveyard ?? []).filter((id) => id !== source);
    const suggested = evidenceCards(s, player, source, c.collectEvidence);
    if (suggested)
      out.push({
        slot: "evidence",
        label: msg("Collect evidence {n} (total mana value {n} or greater)", { n: c.collectEvidence }),
        count: suggested.length,
        options,
        suggested,
        minTotal: { n: c.collectEvidence, values: Object.fromEntries(options.map((id) => [id, manaValueOf(s, id)])) },
      });
  }
  return out;
}

/** What the casting terms add to a spell's cost slots (`spellPicks`). */
export type PickTerms = Partial<Pick<CastTerms, "source" | "removeCounters" | "sneakGranted" | "forage" | "graveyardType">>;

/**
 * Costs of a spell paid with objects to choose: evidence (kicker, alternative cost, the targets' mana value), exiling
 * cards from the graveyard (kicker), blight X, what the alternative cost pays on top, forage, the attacker returned by
 * a granted sneak, Muldrotha's type. `x` absent (`legalActions`): the blight X suggestion assumes X = 1. `targets`
 * absent (`legalActions`): Urgent Necropsy's evidence reads the targets' mana values (`minTotal.fromTargets`).
 */
export function spellPicks(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  x?: number,
  terms: PickTerms = {},
  targets?: ObjectId[],
): CostPick[] {
  const flashback = terms.source === "flashback";
  const out: CostPick[] = additionalPicks(s, player, card, d, flashback);
  // Counters to remove from among your creatures to cast it from here (`CastTerms.removeCounters`).
  if (terms.removeCounters) out.push(countersAmongPick(s, player, terms.removeCounters));
  // Granted sneak (Ninja Teen): the unblocked attacker returned to hand (the weakest by default).
  if (terms.sneakGranted) {
    const options = sneakOptions(s, player);
    if (options.length)
      out.push({
        slot: "returnAttacker",
        label: msg("Sneak: the unblocked attacker to return to its owner's hand"),
        count: 1,
        options,
        suggested: options.slice(0, 1),
      });
  }
  // Muldrotha: the permanent type a card with several uses (the first one still free by default).
  if (terms.graveyardType) {
    const types = graveyardTypesFree(s, player, card).filter((t) => t !== "Land");
    if (types.length)
      out.push({
        slot: "permanentType",
        label: msg("The permanent type used to cast it from your graveyard"),
        count: 1,
        options: types,
        labels: Object.fromEntries(types.map((t) => [t, t])),
        suggested: [terms.graveyardType],
      });
  }
  // Forage as a cost: from the graveyard (Osteomancer Adept), or as the alternative cost (Feed the Cycle).
  if (terms.forage) {
    const f = foragePick(s, player, card);
    if (f) out.push(f);
  }
  const alt = altCostFor(s, player, d);
  if (alt?.forage) {
    const f = foragePick(s, player, card, "alternative");
    if (f) out.push(f);
  }
  // Force of Will, Daze, the Flares, emerge: what the alternative cost pays on top.
  if (alt?.pay) out.push(...(altCostPicks(s, player, card, alt.pay) ?? []));
  // Urgent Necropsy: "collect evidence X, where X is the total mana value of the permanents this spell targets".
  if (d.additionalCost?.collectEvidenceTargetsManaValue) {
    const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
    const values = Object.fromEntries(graveyard.map((id) => [id, manaValueOf(s, id)]));
    const n = targets ? targetsManaValue(s, targets) : 0;
    const suggested = targets ? evidenceCards(s, player, card, n) : [];
    if (suggested && graveyard.length)
      out.push({
        slot: "evidence",
        label: targets
          ? msg("Collect evidence {n} (total mana value {n} or greater)", { n })
          : msg("Collect evidence X (X: the total mana value of the targets)"),
        count: suggested.length,
        options: graveyard,
        suggested,
        minTotal: {
          n,
          values,
          ...(targets
            ? {}
            : {
                fromTargets: Object.fromEntries(
                  s.battlefield.map((id) => [id, snapshot(s, id).manaValue ?? 0] as const).filter(([, v]) => v > 0),
                ),
              }),
        },
      });
  }
  // Behold: a permanent or a card from the hand (or `count` of them), or nothing ("you may", or pay the extra cost).
  const behold = additionalCostOf(d, flashback)?.behold;
  if (behold) {
    const options = beholdOptions(s, player, card, behold.filter, behold.exiled);
    const suggested = beholdSuggestions(s, options, behold.required, behold.count ?? 1);
    if (options.length)
      out.push({
        slot: "behold",
        label: behold.required
          ? (behold.count ?? 1) > 1
            ? msg("Behold {n}: choose permanents you control or reveal cards from your hand", { n: behold.count ?? 1 })
            : behold.exiled
              ? msg("Choose a permanent you control or an exiled card")
              : msg("Choose a permanent you control or reveal a card from your hand")
          : behold.orPay
            ? msg("Behold (or choose nothing and pay the extra cost)")
            : msg("You may behold (a permanent or a card from your hand, revealed)"),
        count: behold.count ?? 1,
        options,
        suggested,
        ...(behold.required ? {} : { optional: true }),
      });
  }
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => id !== card);
  const evidencePick = (n: number, when: CostPick["when"]): CostPick | null => {
    const suggested = evidenceCards(s, player, card, n);
    if (!suggested) return null;
    return {
      slot: "evidence",
      label: msg("Collect evidence {n} (total mana value {n} or greater)", { n }),
      count: suggested.length,
      options: graveyard,
      suggested,
      minTotal: { n, values: Object.fromEntries(graveyard.map((id) => [id, manaValueOf(s, id)])) },
      when,
    };
  };
  const altEvidence = altCostFor(s, player, d)?.collectEvidence;
  if (altEvidence) {
    const p = evidencePick(altEvidence, "alternative");
    if (p) out.push(p);
  }
  if (d.kicker?.pay?.collectEvidence) {
    const p = evidencePick(d.kicker.pay.collectEvidence, "kicked");
    if (p) out.push(p);
  }
  if (d.kicker?.pay?.exileGraveyard) {
    const n = d.kicker.pay.exileGraveyard;
    const suggested = graveyardToExile(s, player, card, n);
    if (suggested)
      out.push({
        slot: "graveyardExile",
        label: msg("Exile {n} card(s) from your graveyard", { n }),
        count: n,
        options: graveyard,
        suggested,
        when: "kicked",
      });
  }
  out.push(
    ...manaHelperPicks(s, player, card, {
      convoke: hasConvoke(s, player, d),
      improvise: hasImprovise(s, player, d),
      waterbend: d.additionalCost?.waterbend !== undefined || d.additionalCost?.xCost === "waterbend",
      delve: spellHasKeyword(s, player, d, "delve"),
      sacrificeToPay: d.additionalCost?.sacrificeToPay,
    }),
  );
  if (d.additionalCost?.xCost === "blight") {
    const best = blightTarget(s, player, Math.max(1, x ?? 1));
    const options = s.battlefield.filter((id) => s.objects[id]?.controller === player && isCreature(s, id));
    if (best)
      out.push({
        slot: "blight",
        label: msg("Blight X: the creature that gets the X −1/−1 counters"),
        count: 1,
        options: [best, ...options.filter((id) => id !== best)],
        suggested: [best],
      });
  }
  return out;
}

/**
 * Objects that can help pay the mana (convoke, improvise, waterbend, delve): chosen by the player, otherwise by the
 * automatic payment (`atMost`, empty suggestion).
 */
function manaHelperPicks(
  s: GameState,
  player: PlayerId,
  except: ObjectId,
  kinds: { convoke?: boolean; improvise?: boolean; waterbend?: boolean; delve?: boolean; sacrificeToPay?: SacrificeToPay },
): CostPick[] {
  const out: CostPick[] = [];
  const untapped = (id: ObjectId) =>
    id !== except && s.objects[id]?.controller === player && !s.objects[id]?.tapped && s.objects[id]?.zone === "battlefield";
  const add = (slot: CostSlot, label: string, options: ObjectId[]) => {
    if (options.length) out.push({ slot, label, count: options.length, options, suggested: [], atMost: true });
  };
  if (kinds.convoke)
    add(
      "convoke",
      msg("Convoke: the creatures to tap (each pays {1} or one mana of its color)"),
      s.battlefield.filter((id) => untapped(id) && isCreature(s, id)),
    );
  if (kinds.improvise)
    add(
      "improvise",
      msg("Improvise: the artifacts to tap (each pays {1})"),
      s.battlefield.filter((id) => untapped(id) && chars(s, id).types.includes("Artifact")),
    );
  if (kinds.waterbend)
    add(
      "waterbend",
      msg("Waterbend: the artifacts and creatures to tap (each pays {1})"),
      s.battlefield.filter((id) => untapped(id) && (chars(s, id).types.includes("Artifact") || isCreature(s, id))),
    );
  if (kinds.sacrificeToPay) {
    const f = kinds.sacrificeToPay.filter;
    add(
      "sacrificeToPay",
      msg("Additional cost: the permanents to sacrifice (each reduces the cost by {cost})", {
        cost: `{${kinds.sacrificeToPay.each ?? 1}}`,
      }),
      s.battlefield.filter(
        (id) => id !== except && s.objects[id]?.controller === player && matchesObjectFilter(s, player, id, f),
      ),
    );
  }
  if (kinds.delve)
    add(
      "delve",
      msg("Delve: the cards in your graveyard to exile (each pays {1})"),
      (s.players[player]?.graveyard ?? []).filter((id) => id !== except),
    );
  return out;
}

/** A spell's convoke, improvise, waterbend and delve choices, checked (otherwise `RulesError`). */
function validHelperPicks(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  choices: CastChoices,
): CastChoices["picks"] {
  for (const p of spellPicks(s, player, card, d).filter((x) => x.atMost)) {
    const chosen = choices.picks?.[p.slot];
    if (chosen) resolvePick(s, p, chosen);
  }
  for (const k of ["convoke", "improvise", "waterbend", "delve", "sacrificeToPay"] as const)
    if (choices.picks?.[k] && !spellPicks(s, player, card, d).some((p) => p.slot === k))
      throw new RulesError(msg("This spell can't be paid this way"));
  return choices.picks;
}

/** Payment constraint: the objects chosen by the player for convoke, improvise, delve… */
function onlyChosen(picks: CastChoices["picks"]): ManaPurpose["only"] | undefined {
  const only: NonNullable<ManaPurpose["only"]> = {};
  for (const k of ["convoke", "improvise", "waterbend", "delve", "sacrificeToPay"] as const) if (picks?.[k]) only[k] = picks[k];
  return Object.keys(only).length ? only : undefined;
}

/** The objects of a spell's cost slot, chosen when that cost is paid. */
function spellPickNow(
  s: GameState,
  player: PlayerId,
  card: ObjectId,
  d: CardDef,
  x: number,
  slot: CostSlot,
  when: CostPick["when"],
  choices: CastChoices,
): ObjectId[] | null {
  const pick = spellPicks(s, player, card, d, x).find((p) => p.slot === slot && p.when === when);
  if (!pick) return null;
  return resolvePick(s, pick, choices.picks?.[slot]);
}

/**
 * Does the slot leave the player a choice (PLAN-M M6: a question is never asked with a single possible answer)? With
 * a minimum total, the answer is forced when every option is needed to reach it.
 */
export function pickHasChoice(p: CostPick): boolean {
  if (p.minTotal) {
    const m = p.minTotal;
    if (m.fromTargets) return p.options.length > 0;
    const total = p.options.reduce((n, id) => n + (m.values[id] ?? 0), 0);
    return p.options.some((id) => total - (m.values[id] ?? 0) >= m.n);
  }
  return p.options.length > p.count || (!!p.repeat && p.options.length > 1);
}

/** Objects chosen for a cost: the player's if they are valid (otherwise `RulesError`), failing that the suggestion. */
export function resolvePick(s: GameState, pick: CostPick, chosen: ObjectId[] | undefined): ObjectId[] {
  if (chosen === undefined) return pick.suggested;
  if (chosen.some((id) => !pick.options.includes(id)))
    throw new RulesError(msg("Invalid choice: {label}", { label: pick.label }));
  // Forage: exactly one of the groups (three cards from the graveyard, or a Food).
  if (pick.oneOf) {
    const ok =
      new Set(chosen).size === chosen.length &&
      pick.oneOf.some((g) => chosen.length === g.count && chosen.every((id) => g.options.includes(id)));
    if (!ok) throw new RulesError(msg("Invalid choice: {label}", { label: pick.label }));
    return chosen;
  }
  if (pick.atMost) {
    if (new Set(chosen).size !== chosen.length || chosen.length > pick.count)
      throw new RulesError(msg("Invalid choice: {label}", { label: pick.label }));
    return chosen;
  }
  if (pick.minTotal) {
    const total = chosen.reduce((n, id) => n + (pick.minTotal?.values[id] ?? 0), 0);
    if (new Set(chosen).size !== chosen.length || total < pick.minTotal.n)
      throw new RulesError(msg("Not enough total mana value: {label}", { label: pick.label }));
    return chosen;
  }
  if (chosen.length !== pick.count)
    throw new RulesError(msg("{n} object(s) to choose: {label}", { n: pick.count, label: pick.label }));
  const times = new Map<ObjectId, number>();
  for (const id of chosen) times.set(id, (times.get(id) ?? 0) + 1);
  for (const [id, n] of times)
    if (n > (pick.repeat?.[id] ?? 1)) throw new RulesError(msg("Invalid choice: {label}", { label: pick.label }));
  // Counters of a chosen kind (`id:kind`): with the counters of the default kind (`id`), no more than the object has.
  if (pick.repeat && chosen.some((id) => id.includes(":"))) {
    const perObject = new Map<ObjectId, number>();
    for (const id of chosen) perObject.set(counterEntry(id).id, (perObject.get(counterEntry(id).id) ?? 0) + 1);
    for (const [id, n] of perObject)
      if (n > (pick.repeat[id] ?? 0)) throw new RulesError(msg("Invalid choice: {label}", { label: pick.label }));
  }
  void s;
  return chosen;
}

/** A counter removed from an object, as chosen: `id` (the default kind) or `id:kind`. */
function counterEntry(entry: string): { id: ObjectId; kind?: string } {
  const i = entry.indexOf(":");
  return i < 0 ? { id: entry } : { id: entry.slice(0, i), kind: entry.slice(i + 1) };
}

/**
 * "Remove a counter from among…" with the kind of each counter offered (PLAN-M M6): an `id:kind` option for each kind
 * of counter on each object that carries two kinds or more (a bare `id` removes the default kind). Their labels cite
 * the card.
 */
function counterKindOptions(
  s: GameState,
  ids: ObjectId[],
): { options: ObjectId[]; labels: Record<string, string>; repeat: Record<string, number> } {
  const options: ObjectId[] = [];
  const labels: Record<string, string> = {};
  const repeat: Record<string, number> = {};
  for (const id of ids) {
    const counters = obj(s, id).counters;
    const kinds = Object.keys(counters).filter((k) => (counters[k] ?? 0) > 0);
    if (kinds.length < 2) continue;
    for (const k of kinds) {
      const key = `${id}:${k}`;
      options.push(key);
      repeat[key] = counters[k] ?? 0;
      labels[key] = msg("{card}: {counter} counter ({n})", {
        card: cardRefOf(s, id),
        counter: counterLabel(k),
        n: counters[k] ?? 0,
      });
    }
  }
  return { options, labels, repeat };
}

/** The objects of an ability's cost slot, chosen when that cost is paid. */
function pickNow(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  ab: ActivatedAbilityDef,
  x: number,
  slot: CostSlot,
  choices: CastChoices,
): ObjectId[] {
  const pick = activationPicks(s, player, source, ab, x).find((p) => p.slot === slot);
  if (!pick) {
    if (choices.picks?.[slot]?.length) throw new RulesError(msg("This cost doesn't ask for this choice"));
    return [];
  }
  return resolvePick(s, pick, choices.picks?.[slot]);
}

export function activateAbility(s: GameState, player: PlayerId, source: ObjectId, index: number, choices: CastChoices): void {
  const o = s.objects[source];
  const printed = activatedAbility(s, source, index);
  // Kíli the Resourceful: {0} by default, the printed cost if the player chooses it (`freeCost`).
  const costChoice = choices.picks?.freeCost;
  if (costChoice && (costChoice.length !== 1 || !["free", "printed"].includes(costChoice[0] as string)))
    throw new RulesError(msg("This cost doesn't ask for this choice"));
  const ab = printed && (costChoice?.[0] === "printed" ? printed : abilityAsPaid(s, player, source, printed));
  if (costChoice?.[0] === "free" && ab === printed) throw new RulesError(msg("This cost doesn't ask for this choice"));
  if (!ab || !o) throw new RulesError(msg("Unknown ability"));
  const fc = fixedCost(ab.cost);
  const xc = xCosts(ab.cost);
  const zone = activationZone(o, ab);
  if (o.zone !== zone || !mayActivate(s, player, o, ab)) {
    throw new RulesError(msg("You don't control this permanent"));
  }
  if (
    ab.sorcerySpeed &&
    !instantLoyalty(s, player, source, ab) &&
    !(s.turn.active === player && (s.turn.step === "main1" || s.turn.step === "main2") && s.stack.length === 0)
  ) {
    throw new RulesError(msg("This ability can only be activated at sorcery speed"));
  }
  if (!canPayNonManaCost(s, source, ab, index)) throw new RulesError(msg("Can't pay the cost"));
  // 702.61b: split second doesn't prevent special actions (turning a card face up).
  if (!ab.specialAction && splitSecondOnStack(s))
    throw new RulesError(msg("No spells or abilities now (split second or combat)"));
  let sacrificed: ObjectId[] = [];
  if (fc.sacrifice) {
    const options = sacrificeOptions(s, player, source, ab);
    sacrificed = choices.sacrifice ?? options.slice(0, fc.sacrifice.count);
    if (sacrificed.length !== fc.sacrifice.count || sacrificed.some((id) => !options.includes(id))) {
      throw new RulesError(msg("Invalid sacrifice"));
    }
    if (fc.sacrifice.distinct === "name" && distinctNames(s, sacrificed) !== sacrificed.length)
      throw new RulesError(msg("The sacrificed permanents must have different names"));
  }
  const x =
    ab.cost.mana?.x ||
    ab.cost.loyalty === "X" ||
    xc.tap ||
    xc.exileFromGraveyard ||
    xc.sacrifice ||
    xc.discard ||
    xc.removeCounters
      ? Math.max(0, Math.floor(choices.x ?? 0))
      : 0;
  if (x > MAX_X) throw new RulesError(msg("X is too large"));
  // "With mana value X" (an exact or maximum mana value read from X): checked with the announced X (601.2b, then 601.2c).
  const xCtx = { ...staticContext(s, player, source), x };
  const specs = ab.targets?.map((t) =>
    t.manaValueAmount !== undefined || t.maxManaValueAmount !== undefined ? concreteSpec(s, xCtx, t) : t,
  );
  const targets = validateTargets(s, player, specs, choices.targets, { sourceId: source, x });
  // Krumar Initiate: "pay X life".
  if (xc.payLife && x > 0 && payableLife(s, player) < x) throw new RulesError(msg("Not enough life"));
  if (xc.sacrifice && x < 1) throw new RulesError(msg("Sacrifice at least one permanent"));
  if (ab.cost.minX !== undefined && x < ab.cost.minX) throw new RulesError(msg("X must be at least {n}", { n: ab.cost.minX }));
  if (ab.cost.loyalty === "X" && x > (o.counters.loyalty ?? 0)) throw new RulesError(msg("Not enough loyalty counters"));
  if (xc.removeCounters && x > (o.counters[xc.removeCounters] ?? 0)) throw new RulesError(msg("Not enough counters"));
  // "Tap X untapped artifacts": chosen now, they don't pay the ability's mana.
  const tapXOptions = xc.tap ? tapXCandidates(s, player, source, xc.tap) : [];
  const tapXChosen = xc.tap ? (choices.tap?.length === x ? choices.tap : tapXOptions.slice(0, x)) : [];
  if (tapXChosen.length < (xc.tap ? x : 0) || tapXChosen.some((id) => !tapXOptions.includes(id)))
    throw new RulesError(msg("Not enough permanents to tap"));
  const c = chars(s, source);
  const grantor = grantorOf(s, source, index);
  // Special action (116.2, unlocking a door): the costs are paid, the effects apply without the stack.
  if (ab.specialAction) {
    if (ab.cost.mana) {
      // Doc Aurlock (plot), Inquisitive Glimmer (unlock): cheaper.
      try {
        // The X of a disguise cost (Aurelia's Vindicator); the ability's own reduction (Fugitive Codebreaker).
        payMana(s, player, abilityManaCost(s, player, source, ab, undefined, x), undefined, {
          ...abilityPurpose(source, ab),
          ...(choices.phyrexianLife !== undefined ? { phyrexianLife: choices.phyrexianLife } : {}),
        });
      } catch (e) {
        rethrowAsRules(e, msg("Not enough mana"));
      }
    }
    for (const e of ab.effects) {
      if (e.op === "unlockDoor") unlockDoor(s, source, e.door);
      if (e.op === "turnFaceUp") {
        // "up to X targets" when turned face up: the X paid (`amount.sourceX`).
        if (ab.cost.mana?.x) o.x = x;
        turnFaceUp(s, source);
      }
      if (e.op === "exileToCast") {
        if (e.kind === "plot") plotCard(s, source);
        else foretellCard(s, source);
      }
      // Suspend (702.62a): a special action from the hand.
      if (e.op === "suspend") suspendCard(s, source, e.time);
    }
    s.priority.passes = 0;
    return;
  }
  const item: StackItem = {
    id: newId(s, "a"),
    kind: "ability",
    controller: player,
    sourceId: source,
    sourceDefId: o.defId,
    abilityIndex: index,
    mode: 0,
    targets,
    x,
    kicked: false,
    sourceSnapshot: { keywords: c.keywords, power: c.power, controller: player },
    // Granted ability (not in the printed definition): its effects travel with it, and so does the permanent that grants
    // it (`ref.grantor`).
    inline:
      s.defs[o.defId]?.abilities[index] === ab
        ? undefined
        : {
            targets: ab.targets,
            effects: ab.effects,
            label: ab.label,
            ...(grantor ? { bound: { [GRANTOR_KEY]: [grantor] } } : {}),
          },
  };
  s.stack.push(item);
  // Costs: mana (without tapping the source if it must tap for the cost), then {T}, then sacrifice.
  // The permanents chosen for other costs (sacrifice, tap, crew) are not used to pay the mana.
  // Permanents to tap: chosen by the player (station), otherwise automatically.
  const tapOptions = fc.tapOthers ? tapOthersOptions(s, player, source, ab) : [];
  const tapOthers = fc.tapOthers
    ? choices.tap?.length
      ? choices.tap
      : [...tapOptions]
          // The source ("tap N creatures", itself included) as a last resort.
          .sort((a, b) => Number(a === source) - Number(b === source) || chars(s, b).power - chars(s, a).power)
          .slice(0, fc.tapOthers.count)
    : [];
  if (
    fc.tapOthers &&
    (tapOthers.length !== fc.tapOthers.count ||
      new Set(tapOthers).size !== tapOthers.length ||
      tapOthers.some((id) => !tapOptions.includes(id)))
  ) {
    throw new RulesError(msg("Invalid permanents to tap"));
  }
  // Crew and saddle (702.122, 702.171): the creatures chosen by the player (enough total power), otherwise the default
  // choice (weakest first).
  const crew = ab.cost.crew !== undefined ? chosenCrew(s, player, source, ab.cost.crew, choices.tap) : [];
  // Craft: the materials chosen by the player, otherwise the default ones (graveyard cards first).
  const materials = ab.cost.craft ? chosenCraftMaterials(s, player, source, ab, choices.materials) : [];
  if (!materials) throw new RulesError(msg("Not enough craft materials"));
  if (ab.cost.mana) {
    const reserved = new Set([
      ...tapOthers,
      ...tapXChosen,
      ...crew,
      ...materials,
      ...(ab.cost.tap || ab.cost.craft ? [source] : []),
      ...(ab.cost.grantor && grantor ? [grantor] : []),
    ]);
    try {
      // Warrior's Blades, Dragonfire Blade: the cost depends on the targeted creature.
      const cost = abilityManaCost(s, player, source, ab, targets.t?.[0], x);
      const purpose0 = abilityPurpose(source, ab);
      // Waterbend, convoke: the objects chosen by the player (checked), otherwise the automatic payment.
      const only =
        ab.cost.tapToPay && choices.picks?.[ab.cost.tapToPay]
          ? { [ab.cost.tapToPay]: pickNow(s, player, source, ab, x, ab.cost.tapToPay, choices) }
          : undefined;
      const purpose = {
        ...purpose0,
        ...(only ? { only } : {}),
        ...(choices.phyrexianLife !== undefined ? { phyrexianLife: choices.phyrexianLife } : {}),
      };
      if (choices.phyrexianLife && choices.phyrexianLife > (cost.phyrexian?.length ?? 0))
        throw new RulesError(msg("Not that many Phyrexian mana symbols to pay with life"));
      payMana(s, player, cost, reserved, sacrificed.length ? { ...purpose, sacrificedForCost: new Set(sacrificed) } : purpose);
      if (ab.cost.tapToPay === "waterbend") bent(s, player, "water");
    } catch (e) {
      rethrowAsRules(e, msg("Not enough mana"));
    }
  }
  if (ab.cost.tap) tapObject(s, o);
  if (xc.removeCounters && x > 0) changeCounters(s, o, xc.removeCounters, -x);
  if (ab.cost.grantor === "tap" && grantor) tapObject(s, obj(s, grantor));
  if (ab.cost.loyalty !== undefined) {
    const cost = ab.cost.loyalty === "X" ? -x : ab.cost.loyalty;
    if (cost !== 0) changeCounters(s, o, "loyalty", cost, { asCost: true, by: player });
    rulesEvent(s, { e: "loyalty", player, sourceId: source, cost });
  }
  // One entry per activation: Wonder Man allows one more activation of power-ups.
  if (ab.once) o.used = [...(o.used ?? []), index];
  if (ab.exhaust) {
    const pl = s.players[player];
    const stats = pl?.turnStats;
    if (stats) stats.exhaustActivated = (stats.exhaustActivated ?? 0) + 1;
    rulesEvent(s, { e: "exhaust", player, source });
    // Pit Automaton: the next exhaust ability this turn is copied (new targets may be chosen).
    if (consumePlayerEffect(s, player, "copyNextExhaust")) copyStackItem(s, item, player);
  }
  if (ab.cost.addCounters) changeCounters(s, o, ab.cost.addCounters.kind, ab.cost.addCounters.n, { asCost: true, by: player });
  for (const id of crew) tapObject(s, obj(s, id));
  if (crew.length) {
    // "The creatures that crewed / saddled it this turn" (702.122, 702.171): all those of the turn's activations.
    const before = o.crewedBy?.turn === s.turn.number ? o.crewedBy.ids : [];
    o.crewedBy = { turn: s.turn.number, ids: [...before, ...crew.filter((id) => !before.includes(id))] };
    rulesEvent(s, { e: "crewed", vehicle: source, crew: [...crew] });
  }
  if (ab.cost.self === "exert") o.exerted = true;
  // "Remove a counter from this creature": the chosen kinds (`counterKind`), otherwise the default choice.
  if (fc.removeCounters?.kind === "any") {
    const n = fc.removeCounters.n;
    const kinds = pickNow(s, player, source, ab, x, "counterKind", choices);
    const byKind = new Map<string, number>();
    for (const k of kinds.length ? kinds : anyCountersDefault(o.counters, n)) byKind.set(k, (byKind.get(k) ?? 0) + 1);
    for (const [k, m] of byKind) changeCounters(s, o, k, -m);
  } else if (fc.removeCounters) changeCounters(s, o, fc.removeCounters.kind, -fc.removeCounters.n);
  if (fc.payLife) payLife_(s, player, lifeCost(s, player, source, fc.payLife));
  if (xc.payLife && x > 0) payLife_(s, player, x);
  for (const id of tapOthers) tapObject(s, obj(s, id));
  // The sacrificed permanents remain readable (last known information: "its toughness").
  item.paid = {
    sacrificed: sacrificed.length ? [...sacrificed] : undefined,
    tapped: tapOthers.length ? [...tapOthers] : undefined,
  };
  for (const id of sacrificed) sacrificePermanent(s, id);
  if (ab.cost.self === "sacrifice") sacrificePermanent(s, source);
  if (ab.cost.grantor === "sacrifice" && grantor) sacrificePermanent(s, grantor);
  if (ab.cost.grantor === "exile" && grantor) {
    s.lki[grantor] ??= snapshot(s, grantor);
    moveObject(s, grantor, "exile");
  }
  // The source leaves its zone to pay the cost: its last known information is kept ("this card", wherever it is).
  if (ab.cost.self === "exile" || ab.cost.self === "discard" || ab.cost.self === "bounce") s.lki[source] ??= snapshot(s, source);
  // Costs paid with objects chosen by the player (otherwise the engine's suggestion): `activationPicks`.
  const pick = (slot: CostSlot) => pickNow(s, player, source, ab, x, slot, choices);
  if (fc.exileFromGraveyard) for (const id of pick("graveyardExile")) moveObject(s, id, "exile");
  // Blight N as a cost (ECL): by default, `blightTarget`.
  const blighted = ab.cost.blight ? pick("blight")[0] : undefined;
  if (blighted && ab.cost.blight) changeCounters(s, obj(s, blighted), "-1/-1", ab.cost.blight, { asCost: true, by: player });
  // "Remove a counter from a creature you control": by default, the one that carries the most.
  if (ab.cost.removeCounterFrom) {
    // "Remove a counter" of any kind (Scholar of New Horizons): the chosen kind (`id:kind`), otherwise the default one,
    // −1/−1 first, +1/+1 last. The chosen kinds are removed first.
    const entries = pick("counterFrom").map(counterEntry);
    for (const { id, kind: chosen } of [...entries.filter((e) => e.kind), ...entries.filter((e) => !e.kind)]) {
      const k = ab.cost.removeCounterFrom.kind;
      const kind = k === "any" ? (chosen ?? anyCountersDefault(obj(s, id).counters, 1)[0]) : k;
      if (kind) changeCounters(s, obj(s, id), kind, -1, true);
    }
  }
  // Collect evidence N as a cost (Forensic Researcher, Polygraph Orb).
  if (ab.cost.collectEvidence) {
    const exiled = collectEvidence(s, player, pick("evidence"));
    if (ab.cost.linkEvidence) o.linked = [...(o.linked ?? []), ...exiled];
  }
  // "Tap X untapped artifacts": X chosen on activation (permanents chosen before the mana payment).
  for (const id of tapXChosen) tapObject(s, obj(s, id));
  // Winter, Cursed Rider: "exile X artifact cards from your graveyard".
  if (xc.exileFromGraveyard) {
    const chosen = pick("graveyardExileX");
    if (chosen.length < x) throw new RulesError(msg("Not enough cards to exile"));
    for (const id of chosen) moveObject(s, id, "exile");
  }
  // Radiant Lotus: "sacrifice one or more artifacts" (by default, the others first, the source last).
  if (xc.sacrifice) {
    const chosen = pick("sacrificeX");
    if (chosen.length < x) throw new RulesError(msg("Not enough permanents to sacrifice"));
    item.paid = { ...item.paid, sacrificed: chosen };
    for (const id of chosen) sacrificePermanent(s, id);
  }
  // Forage (701.61): three cards from the graveyard or a Food (chosen, otherwise the automatic choice).
  if (ab.cost.forage) {
    const chosen = pick("forage");
    if (!chosen.length || !forage(s, player, chosen)) throw new RulesError(msg("Can't forage"));
  }
  // Ninjutsu: an unblocked attacker returns to its owner's hand (by default, the weakest).
  if (ab.cost.returnUnblockedAttacker) {
    const weakest = pick("returnAttacker")[0];
    if (!weakest) throw new RulesError(msg("No unblocked attacker"));
    // 702.49c: the ninja will attack what the returned creature was attacking (`ref.cost("defender")`).
    const defender = s.combat?.attackers.find((a) => a.id === weakest)?.defender;
    if (defender) item.paid = { ...item.paid, defender };
    removeFromCombat(s, weakest);
    moveObject(s, weakest, "hand");
  }
  // Urban Retreat: "return a tapped creature you control to its owner's hand".
  if (ab.cost.bounce) {
    const options = bounceCostOptions(s, player, source, ab.cost.bounce);
    const back = choices.bounce?.length ? choices.bounce[0] : options[0];
    if (!back || !options.includes(back) || (choices.bounce?.length ?? 1) !== 1)
      throw new RulesError(msg("No permanent to return"));
    removeFromCombat(s, back);
    moveObject(s, back, "hand");
  }
  // The Soul Stone: "exile a creature you control".
  if (ab.cost.exile) {
    const gone = pick("exileOther")[0];
    if (!gone) throw new RulesError(msg("No permanent to exile"));
    removeFromCombat(s, gone);
    moveObject(s, gone, "exile");
  }
  // "Discard a card": chosen by the player (otherwise the first one in the hand).
  if (fc.discard) {
    const options = discardCostOptions(s, player, source, ab.cost.discardFilter);
    const chosen = choices.discard?.length ? choices.discard : options.slice(0, fc.discard);
    if (chosen.length !== fc.discard || chosen.some((id) => !options.includes(id))) throw new RulesError(msg("Invalid discard"));
    emit({ type: "discard", player, defIds: chosen.map((id) => obj(s, id).defId) });
    for (const id of chosen) announceDiscard(s, player, moveDiscarded(s, player, id));
    announceDiscardBatch(s, player, chosen.length);
  }
  // Gix, Yawgmoth Praetor: "discard X cards" (the chosen cards, `discard` or `discardX`, otherwise the first ones).
  if (xc.discard && x > 0) {
    const options = discardCostOptions(s, player, source, undefined);
    const chosen = choices.discard?.length ? choices.discard : pick("discardX");
    if (chosen.length !== x || chosen.some((id) => !options.includes(id))) throw new RulesError(msg("Invalid discard"));
    emit({ type: "discard", player, defIds: chosen.map((id) => obj(s, id).defId) });
    for (const id of chosen) announceDiscard(s, player, moveDiscarded(s, player, id));
    announceDiscardBatch(s, player, chosen.length);
  }
  // "Discard your hand": the whole hand, while paying the cost (601.2h).
  if (ab.cost.discardHand) {
    const hand = [...(s.players[player]?.hand ?? [])];
    if (hand.length) {
      emit({ type: "discard", player, defIds: hand.map((id) => obj(s, id).defId) });
      for (const id of hand) announceDiscard(s, player, moveDiscarded(s, player, id));
      announceDiscardBatch(s, player, hand.length);
    }
  }
  // Craft: the materials are exiled (and linked to the back face on resolution), then the source.
  if (materials.length) {
    s.turn.crafting = true;
    const exiled = materials.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id);
    delete s.turn.crafting;
    item.paid = { ...item.paid, exiled };
  }
  // Baron Helmut Zemo: the cards exiled from the graveyard, recorded for the effect ("copy those cards").
  if (ab.cost.exileGraveyardSymbols) {
    const cards = pick("symbolExile");
    if (!cards.length) throw new RulesError(msg("Not enough mana symbols in your graveyard"));
    item.paid = { ...item.paid, exiled: cards.map((id) => moveObject(s, id, "exile")).filter((id): id is string => !!id) };
  }
  if (ab.cost.self === "exile") moveObject(s, source, "exile");
  if (ab.cost.self === "discard") {
    const card = moveDiscarded(s, player, source);
    announceDiscard(s, player, card);
    announceDiscardBatch(s, player, 1);
    if (ab.cycling && card) rulesEvent(s, { e: "cycled", player, card, x });
  }
  if (ab.cost.self === "bounce") moveObject(s, source, "hand");
  s.priority.passes = 0;
  emit({ type: "activate", player, stackId: item.id, defId: o.defId, targets: flatTargets(targets) });
  // Turn log: also "one loyalty ability per turn" (606.3) and the "once each turn" abilities, read by
  // `canPayNonManaCost` (`activatedThisTurn`).
  logTurnEvent(s, {
    e: "activate",
    player,
    equip: ab.equip || undefined,
    loyalty: ab.cost.loyalty !== undefined || undefined,
    id: source,
    index: ab.oncePerTurn ? index : undefined,
  });
  rulesEvent(s, { e: "activated", player, stackId: item.id });
  announceTargets(s, item.id, player, targets);
  // 605.1a / 605.3b: a mana ability doesn't use the stack; it resolves immediately.
  if (isManaAbility(ab)) resolveManaAbilityNow(s, item);
}

/** 605.3b: resolves a mana ability without using the stack; the player keeps priority. */
function resolveManaAbilityNow(s: GameState, item: StackItem): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  const { effects } = specsAndEffects(s, item);
  s.resolving = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: { ...(item.inline?.bound ?? {}) },
    vars: { ...(item.inline?.vars ?? {}) },
    awaiting: null,
    returnPriority: { ...s.priority },
  };
  // A choice (color of the mana) suspends the resolution; the answer will give priority back (`game.ts`).
  if (continueResolution(s)) s.flow = "priority";
}

/** "Target" words of a stack item (Bolt Bend). */
/**
 * "Target" words of a stack item, made concrete in its context (608.2b: values evaluated again, Moseo; the player who
 * holds the targets, Fear of Falling).
 */
export function stackItemSpecs(s: GameState, item: StackItem, specs = specsAndEffects(s, item).specs): TargetSpec[] {
  // The number of targets and the other values, fixed when targeting, are not evaluated again.
  const again = (x: TargetSpec) => x.maxManaValueAmount !== undefined || (x.of !== undefined && x.of.kind !== "target");
  if (!specs.some(again)) return specs;
  const ctx = {
    ...staticContext(s, item.controller, item.sourceId, { sourceDefId: item.sourceDefId, event: item.event }),
    x: item.x,
  };
  return specs.map((x) => (again(x) ? concreteSpec(s, ctx, x, true) : x));
}

export function specsAndEffects(s: GameState, item: StackItem): { specs: TargetSpec[]; effects: Effect[] } {
  const d = s.defs[item.sourceDefId];
  if (!d) return { specs: [], effects: [] };
  if (item.kind === "spell") {
    const mode = modesOf(d)[item.mode];
    // 614.1c, 614.12: the "as it enters" effects (choices, copy, devour, riot 702.136) happen during the resolution of the
    // permanent spell (`asEntersChoices`). A copy of a permanent spell too: it becomes a token that enters the same way
    // (707.10).
    const enters: Effect[] =
      isPermanentCard(d) && (d.asEnters?.length || willHaveRiot(s, item.controller, d)) ? [{ op: "asEnters" }] : [];
    return { specs: mode?.targets ?? [], effects: [...(mode?.effects ?? []), ...enters] };
  }
  // Delayed, reflexive or granted ability: its effects travel with it; so does the condition of a granted "if…" ability
  // (603.4).
  if (item.inline) {
    const c = item.inline.condition;
    if (c && !checkCondition(s, c, item.controller, item.sourceId, item.event?.objectId, item.event))
      return { specs: [], effects: [] };
    const m = item.inline.modes?.[item.mode];
    return m ? { specs: m.targets, effects: m.effects } : { specs: item.inline.targets, effects: item.inline.effects };
  }
  const ab = d.abilities[item.abilityIndex];
  if (ab?.kind === "triggered") {
    // 603.4: the condition of an "if…" ability is checked again on resolution.
    if (ab.condition && !checkCondition(s, ab.condition, item.controller, item.sourceId, item.event?.objectId, item.event))
      return { specs: [], effects: [] };
    // "Do this only once each turn": already done by another trigger of the same ability (two on the stack).
    if (ab.oncePerTurn === "ifDone" && s.turn.onceFired.includes(onceKey(item.sourceDefId, item.sourceId, item.abilityIndex)))
      return { specs: [], effects: [] };
    if (ab.modes) {
      const mode = ab.modes[item.mode];
      return { specs: mode?.targets ?? [], effects: mode?.effects ?? [] };
    }
    return { specs: ab.targets, effects: ab.effects };
  }
  return ab?.kind === "activated" ? { specs: ab.targets, effects: ab.effects } : { specs: [], effects: [] };
}

/**
 * Starts the resolution of the object on top of the stack (608).
 * Returns true if the resolution is over, false if it waits for a choice (s.flow = "resolving").
 */
export function resolveTop(s: GameState): boolean {
  // The object stays on the stack during its whole resolution (608.2); it leaves only at the end.
  const item = s.stack[s.stack.length - 1];
  if (!item) return true;
  const { specs: specs0, effects } = specsAndEffects(s, item);
  // Target values evaluated again on resolution (Moseo: the life gained this turn; Fear of Falling: the defending
  // player).
  const specs = stackItemSpecs(s, item, specs0);

  // 608.2b: the targets are checked again. If all of them have become illegal, the spell doesn't resolve.
  // Fixed references of a delayed ability (`bind`): kept as they are, they are not targets.
  const legal: Record<string, string[]> = { ...(item.inline?.bound ?? {}) };
  let chosen = 0;
  let stillLegal = 0;
  for (const spec of specs) {
    const ids = item.targets[spec.id] ?? [];
    chosen += ids.length;
    // Promised gift or kicker: its own filter ("instead, target nonland permanent").
    const legalSpec = item.kicked && spec.kickedFilter ? { ...spec, filter: spec.kickedFilter } : spec;
    legal[spec.id] = ids.filter((id) => isLegalTarget(s, item.controller, legalSpec, id, item.sourceId));
    stillLegal += legal[spec.id]?.length ?? 0;
  }
  if (chosen > 0 && stillLegal === 0) {
    s.stack.pop();
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    if (item.kind === "spell" && s.objects[item.sourceId]) spellToRest(s, item);
    return true;
  }

  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  s.resolving = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: legal,
    // Delayed ability: values fixed when it was created.
    vars: { ...(item.inline?.vars ?? {}) },
    awaiting: null,
  };
  return continueResolution(s);
}

/** Runs the remaining effects; stops at the first choice to ask. */
export function continueResolution(s: GameState): boolean {
  const r = s.resolving;
  if (!r) return true;
  while (r.pc < r.effects.length && !s.over) {
    // Each effect is a set of simultaneous events (look-back of triggers).
    const result = simultaneously(s, () => runEffect(s, r, r.effects[r.pc] as Effect));
    // 800.4a: a player who has left the game ("that player may…" addressed to the damaged opponent, eliminated by that
    // damage) has nothing left to decide: their answer is that of an absent player, and the effect resumes with it.
    if (result && "ask" in result && !isAlive(s, result.ask.player)) {
      r.vars[result.ask.key] = absentAnswer(result.ask.request);
      continue;
    }
    if (result && "castNow" in result && !isAlive(s, result.castNow.player)) {
      r.vars[result.castNow.key] = [];
      continue;
    }
    if (result && "ask" in result) {
      r.awaiting = result.ask.key;
      // The "may" of a triggered ability, asked to its controller: the answer can be kept (PLAN-L L8).
      const req = result.ask.request;
      const item = r.item;
      const remember =
        req.type === "yesNo" &&
        req.intent === "may" &&
        item.kind === "ability" &&
        item.event &&
        result.ask.player === item.controller
          ? `${item.sourceDefId}:${item.abilityIndex}:${result.ask.key}`
          : undefined;
      ask(s, result.ask.player, remember ? { ...req, remember } : req, { kind: "effect" });
      s.flow = "resolving";
      return false;
    }
    if (result && "castNow" in result) {
      r.awaiting = result.castNow.key;
      s.pending = {
        kind: "priority",
        player: result.castNow.player,
        castNow: { cards: result.castNow.cards, prompt: result.castNow.prompt },
      };
      s.flow = "resolving";
      return false;
    }
    if (result && "skip" in result) r.pc += result.skip;
    r.pc += 1;
  }
  finishResolution(s, r.item, r.targets, r.vars);
  s.resolving = null;
  return true;
}

/** Answer to a choice asked during the resolution. */
export function answerResolutionChoice(s: GameState, values: ChoiceValue[]): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError(msg("No pending resolution"));
  r.vars[r.awaiting] = values;
  r.awaiting = null;
  return continueResolution(s);
}

/**
 * Answer to a "cast now" priority (608.2g): `card` is the cast card (already put on the stack by the caller), or `null`
 * for a refusal. The resolution resumes.
 */
export function answerCastNow(s: GameState, card: ObjectId | null): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError(msg("No pending resolution"));
  r.vars[r.awaiting] = card ? [card] : [];
  r.awaiting = null;
  return continueResolution(s);
}

/** Removes the permissions of a "cast it" during a resolution (they are valid only for the answer). */
export function dropNowPermissions(s: GameState): void {
  if (s.playPermissions?.some((p) => p.now)) s.playPermissions = s.playPermissions.filter((p) => !p.now);
}

function finishResolution(
  s: GameState,
  item: StackItem,
  targets: Record<string, string[]>,
  vars: Record<string, ChoiceValue[]> = {},
): void {
  const i = s.stack.findIndex((x) => x.id === item.id);
  if (i >= 0) s.stack.splice(i, 1);
  // 707.10: a copy of a spell ceases to exist as it leaves the stack; a copy of a permanent spell becomes a token as it
  // resolves (Double Down).
  // 614.1c, 614.12: what the "as it enters" effects done during the resolution bring (operation `asEnters`).
  const entering = (d: CardDef) =>
    asEntersChoices(
      s,
      vars,
      { id: item.sourceId, defId: d.id, controller: item.controller, x: item.x, kicked: item.kicked },
      ENTERS_PREFIX,
      "auto",
    );
  if (item.kind === "spell" && item.copy) {
    const d = s.defs[item.sourceDefId];
    const choices = d && isPermanentCard(d) ? entering(d) : undefined;
    // A copy that its "as it enters" effects sent elsewhere (Mox Diamond with no land discarded) doesn't become a
    // token.
    const stays = !!s.objects[item.sourceId];
    if (stays) removeFromGame(s, item.sourceId);
    if (d && stays && choices && !("ask" in choices)) {
      const token = createTokenCopy(
        s,
        item.controller,
        d.id,
        withEntersChoices(
          {
            x: item.x,
            kicked: item.kicked,
            // Choreographed Sparks: "the copy gains haste".
            counters: item.arrival?.counters,
            ...(item.arrival?.loyalty !== undefined ? { loyalty: item.arrival.loyalty } : {}),
            haste: item.arrival?.haste,
            ...(item.arrival?.nonlegendary ? { mods: { removeSupertypes: ["Legendary"] }, modsCopiable: true } : {}),
          },
          choices,
        ),
      );
      // "… and 'At the beginning of the end step, sacrifice this token'": an ability the token gains.
      if (item.arrival?.atEnd === "sacrifice" && s.objects[token]?.zone === "battlefield")
        addEffect(s, [token], { addAbilities: [SACRIFICE_TOKEN_AT_END_STEP] }, "permanent");
    }
    return;
  }
  if (item.kind === "spell" && s.objects[item.sourceId]) {
    const d = s.defs[item.sourceDefId];
    const choices = d && isPermanentCard(d) ? entering(d) : undefined;
    if (d && choices && !("ask" in choices)) {
      // Back face of a modal double-faced card cast: the permanent enters with that face.
      const face = s.objects[item.sourceId]?.faceDefId;
      // Animate Dead: the targeted card in a graveyard returns to the battlefield under the Aura's controller, and the
      // Aura enters attached to it (approximation: within the resolution, not by its "enters" triggered ability).
      const reanimated =
        d.enchant?.graveyard && targets[ENCHANT_SPEC]?.[0]
          ? (moveObject(s, targets[ENCHANT_SPEC][0], "battlefield", { controller: item.controller }) ?? undefined)
          : undefined;
      // 303.4f: an Aura enters attached to the object it targeted.
      const enteredId = moveObject(s, item.sourceId, "battlefield", {
        controller: item.controller,
        enters: withEntersChoices(
          {
            x: item.x,
            kicked: item.kicked,
            cast: item.cast,
            attachTo: d.enchant?.graveyard ? reanimated : d.enchant ? targets[ENCHANT_SPEC]?.[0] : undefined,
            // Sneak: it enters tapped and attacking what the returned creature was attacking; if that player left the
            // game or that planeswalker the battlefield, it enters tapped but not attacking (508.4a).
            ...(item.cast?.sneakDefender
              ? { tapped: true, attacking: sneakDefenderStill(s, item.cast.sneakDefender) ? item.cast.sneakDefender : undefined }
              : {}),
            // Counters, haste and subtypes on entering (Torgal, Summon: Fenrir, Noctis), impending: before the event.
            counters: item.arrival?.counters,
            ...(item.arrival?.loyalty !== undefined ? { loyalty: item.arrival.loyalty } : {}),
            haste: item.arrival?.haste || item.cast?.via === "blitz",
            mods: arrivalMods(item),
            impending: item.cast?.via === "impending" ? (castOption(d, "alternative")?.impending ?? 0) : undefined,
          },
          choices,
        ),
      });
      const arrived = enteredId ? s.objects[enteredId] : undefined;
      if (arrived && item.x) arrived.x = item.x;
      // "When this Aura leaves the battlefield, that creature's controller sacrifices it": the creature is linked to it.
      if (arrived && reanimated) arrived.linked = [...(arrived.linked ?? []), reanimated];
      // Fear of Abduction: the cards exiled to pay the additional cost are linked to the permanent.
      const exiled = item.paid?.exiled ?? [];
      if (arrived && exiled.length) arrived.linked = [...(arrived.linked ?? []), ...exiled];
      // Blitz (702.152): sacrificed at the beginning of the next end step (haste and the draw come with its entering).
      if (item.cast?.via === "blitz" && arrived) {
        createDelayed(s, item.controller, arrived.id, arrived.defId, {
          targets: [],
          effects: [{ op: "sacrificeIt", what: { kind: "target", id: "b" } }],
          bound: { b: [arrived.id] },
          label: msg("Blitz: sacrifice it"),
        });
      }
      // Warp: exiled at the beginning of the next end step.
      if (item.cast?.via === "warp" && arrived) {
        createDelayed(s, item.controller, arrived.id, arrived.defId, {
          targets: [],
          effects: [{ op: "moveTo", what: { kind: "target", id: "w" }, spec: { to: "exile", warp: true } }],
          bound: { w: [arrived.id] },
          label: msg("Warp: exile it"),
        });
      }
      const card = arrived ? s.defs[arrived.defId] : undefined;
      if (face && arrived && card?.layout === "split") {
        // Room (709.5d): the cast door is unlocked as it enters.
        const door = card.faceDefs?.findIndex((f) => f.id === face) ?? -1;
        if (door >= 0) unlockDoor(s, arrived.id, door);
      } else if (face && arrived) {
        arrived.faceDefId = face;
        bump(s);
      }
      // Carnelian Orb: "it gains haste until end of turn".
      const entered = s.battlefield[s.battlefield.length - 1];
      if (item.riders?.includes("haste") && entered) {
        bump(s);
        s.effects.push({
          id: newId(s, "e"),
          timestamp: nextTimestamp(s),
          affected: [entered],
          addKeywords: ["haste"],
          duration: "endOfTurn",
        });
      }
    } else resolvedSpellAway(s, item, d);
  }
}

/**
 * Destination of an instant or sorcery that has finished resolving: graveyard; exile for flashback;
 * exile "on an adventure" for an Adventure (715.4); shuffled into the library for an omen.
 */
function resolvedSpellAway(s: GameState, item: StackItem, d: CardDef | undefined): void {
  // Esper Origins: exiled, then onto the battlefield transformed with a finality counter.
  if (item.toBattlefieldTransformed) {
    const exiled = moveObject(s, item.sourceId, "exile");
    if (exiled)
      moveWithSpec(s, item.controller, exiled, { to: "battlefield", transformed: true, counters: { kind: "finality", n: 1 } });
    return;
  }
  // Lilah: exiled and plotted instead of going to the graveyard.
  if (item.plotOnResolve && !item.flashback) {
    plotCard(s, item.sourceId);
    return;
  }
  // Paradigm: exiled; after the first resolution, an emblem offers to cast a free copy of it at the beginning of each of
  // your first main phases.
  if (d && cardRule(d, "paradigm") && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    const defId = `emblem:paradigm-${d.id}`;
    const already = Object.values(s.objects).some((o) => o.defId === defId && o.controller === item.controller);
    if (exiled && !already) {
      s.defs[defId] ??= {
        id: defId,
        name: msg("Paradigm: {card}", { card: d.name }),
        typeLine: msg("Emblem"),
        manaCost: null,
        manaCostText: "",
        colors: [],
        supertypes: [],
        types: [],
        subtypes: [],
        keywords: [],
        abilities: [
          {
            kind: "triggered",
            trigger: { on: "step", step: "main1", whose: "you" },
            targets: [],
            effects: [{ op: "castCopiesFree", what: [{ kind: "linked" }], maxTotalManaValue: 99 }],
            label: msg("Paradigm: cast a copy of {card}", { card: d.name }),
          },
        ],
        text: `At the beginning of your first main phase, you may cast a copy of ${d.name} from exile without paying its mana cost.`,
        implemented: true,
        isToken: true,
      };
      const emblem = createObject(s, defId, item.controller, "command", { isToken: true });
      emblem.linked = [exiled];
      bump(s);
    }
    return;
  }
  // Goliath Daydreamer: exiled with a dream counter instead of going to the graveyard (a copy ceases to exist).
  if (item.exileWithCounter !== undefined && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    const o = exiled ? s.objects[exiled] : undefined;
    if (o && item.exileWithCounter) changeCounters(s, o, item.exileWithCounter, 1);
    return;
  }
  // "Exile [this spell]" (Step Between Worlds).
  if (cardRule(d, "exileOnResolve")) {
    moveObject(s, item.sourceId, "exile");
    return;
  }
  if (item.adventure && !item.flashback) {
    const id = moveObject(s, item.sourceId, "exile");
    const o = id ? s.objects[id] : undefined;
    if (o) o.onAdventure = true;
    return;
  }
  // Rebound (702.88): a spell cast from the hand is exiled; at the beginning of your next upkeep, you may cast it from
  // exile without paying its mana cost (during the resolution of the delayed ability, 608.2g). Printed keyword (Quantum
  // Misalignment) or granted to the spell (Ojer Pakpatiq: `item.rebound`).
  const rebound = item.rebound || (!!d && spellHasKeyword(s, item.controller, d, "rebound"));
  if (rebound && item.cast?.from === "hand" && !item.flashback && !item.copy) {
    const exiled = moveObject(s, item.sourceId, "exile");
    if (exiled) {
      const grant: Effect = { op: "castNow", what: { kind: "target", id: "rb" }, free: true };
      createDelayed(
        s,
        item.controller,
        exiled,
        item.sourceDefId,
        { targets: [], effects: [grant], bound: { rb: [exiled] } },
        "yourNextUpkeep",
      );
    }
    return;
  }
  if (!item.flashback && d?.subtypes.includes("Omen")) {
    const id = moveObject(s, item.sourceId, "library");
    const owner = id ? s.objects[id]?.owner : undefined;
    if (owner) shuffle(s, s.players[owner]?.library ?? []);
    return;
  }
  spellToRest(s, item);
}

/**
 * A spell leaving the stack: into exile (flashback, "exile it"), on the bottom of the library or shuffled into it,
 * otherwise into the graveyard.
 */
function spellToRest(s: GameState, item: StackItem, exile = false): void {
  if (item.flashback || exile) moveObject(s, item.sourceId, "exile");
  else if (item.libraryInstead === "bottom") moveObject(s, item.sourceId, "library", { position: "bottom" });
  else if (item.libraryInstead === "shuffle") {
    const id = moveObject(s, item.sourceId, "library");
    const owner = id ? s.objects[id]?.owner : undefined;
    if (owner) shuffle(s, s.players[owner]?.library ?? []);
  } else moveObject(s, item.sourceId, "graveyard");
}

// ---------------------------------------------------------------------------
// Copies of spells and abilities (707.10); the choices about them are made in stackChoices.ts.
// ---------------------------------------------------------------------------

/** Spell with a promised gift whose opponent is not chosen yet (regardless of the number of opponents). */
export function giftChoiceNeeded(s: GameState, item: StackItem): boolean {
  return (
    item.kind === "spell" &&
    !!item.kicked &&
    !!item.cast &&
    !item.cast.giftTo &&
    s.defs[item.sourceDefId]?.kicker?.kind === "gift"
  );
}

/**
 * Opponent of the promised gift already set for a spell: chosen, or the only opponent of its controller (nothing was
 * asked). Undefined if it remains to be chosen or if nothing is promised.
 */
function giftRecipient(s: GameState, item: StackItem): PlayerId | undefined {
  if (item.cast?.giftTo) return item.cast.giftTo;
  if (!giftChoiceNeeded(s, item) || item.copy) return undefined;
  const opponents = opponentsOf(s, item.controller);
  return opponents.length === 1 ? opponents[0] : undefined;
}

/**
 * Copy of a spell or ability on the stack (707.10): same choices (mode, X, kicker, division) and same targets, which
 * its controller may change. A spell copy is an object on the stack (N11): it can be targeted, and what depends on the
 * spell's source (hexproof from instants…) sees it. Returns the id of the copy.
 */
export function copyStackItem(s: GameState, item: StackItem, controller: PlayerId): string {
  // "This spell can't be copied" (Choreographed Sparks).
  if (item.kind === "spell" && cardRule(s.defs[item.sourceDefId], "cantBeCopied")) return "";
  let id: string;
  if (item.kind === "spell") {
    const src = s.objects[item.sourceId];
    // 707.10: the copy is owned by the player who puts it on the stack.
    const o = createObject(s, src?.defId ?? item.sourceDefId, controller, "stack");
    o.cardCopy = true;
    if (src?.faceDefId) o.faceDefId = src.faceDefId;
    if (src?.faceDown) o.faceDown = { ...src.faceDown };
    id = o.id;
  } else id = newId(s, "copy");
  const retarget: PendingStackChoice[] = specsAndEffects(s, item)
    .specs.filter((spec) => (item.targets[spec.id]?.length ?? 0) > 0)
    .map((spec) => ({ step: "target", spec: spec.id }));
  const pending: PendingStackChoice[] = [
    ...retarget,
    ...(retarget.length ? [{ step: "announce" } as const] : []),
    // The original's division is not announced yet (copy made during the cast).
    ...(item.pendingChoices?.some((c) => c.step === "divide") ? [{ step: "divide" } as const] : []),
  ];
  // Gift promised: the copy keeps the opponent chosen for the original (707.10), even if another player controls it.
  // Not chosen yet (copy made during the cast): the original's answer is carried over to it (`answerStackChoice`).
  const giftTo = giftRecipient(s, item);
  const giftPending = !giftTo && giftChoiceNeeded(s, item);
  if (giftPending) pending.unshift({ step: "gift" });
  const copy: StackItem = {
    ...item,
    id,
    sourceId: item.kind === "spell" ? id : item.sourceId,
    controller,
    copy: true,
    riders: undefined,
    // The entering modifications granted to the spell (counters, haste) are not copiable (707.2).
    arrival: undefined,
    manaSources: undefined,
    cast: item.cast ? { ...item.cast, spentFrom: undefined, ...(giftTo ? { giftTo } : {}) } : undefined,
    targets: { ...item.targets },
    pendingChoices: pending.length ? pending : undefined,
  };
  s.stack.push(copy);
  emit({ type: "copy", stackId: id, defId: item.sourceDefId, player: controller });
  if (item.kind === "spell") rulesEvent(s, { e: "copySpell", player: controller, stackId: id });
  return id;
}
