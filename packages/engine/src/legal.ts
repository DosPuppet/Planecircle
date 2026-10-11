/**
 * Exhaustive enumeration of the legal actions of the player who has priority.
 * The interface highlights only these options; the AI and the autopilot use them too.
 */

import { castOption } from "./cardDef";
import { concreteSpec, staticContext } from "./effects";
import {
  availableMana,
  canPay,
  costToText,
  type ManaPurpose,
  manaAbilitiesOf,
  manaSources,
  manaValue,
  phyrexianLifeOptions,
  tapAnotherPick,
  totalCost,
} from "./mana";
import { asEntersChoices } from "./replacement";
import {
  abilitiesOf,
  abilityAsPaid,
  abilityManaCost,
  abilityPurpose,
  activatedAbility,
  activationPicks,
  activationZone,
  additionalOptions,
  altCostFor,
  altCostPayment,
  autoAdditional,
  canCastTiming,
  canPayNonManaCost,
  canPlayLand,
  castableFaces,
  castTerms,
  costDependsOnTarget,
  craftMaterials,
  craftSpec,
  crewCandidates,
  crewPower,
  discardCostOptions,
  evidenceCards,
  FACE_DOWN_SPELL,
  fixedCost,
  freeCostPick,
  graveyardToExile,
  greatestToughness,
  harmonizeOptions,
  hasConvoke,
  hasImprovise,
  hybridColors,
  hybridMatters,
  instantLoyalty,
  isWebSlinging,
  kickerCostOptions,
  kickerCostPermanent,
  landBackFace,
  landFace,
  landTypeChoice,
  mayActivate,
  modeConditionHolds,
  modesOf,
  pickHasChoice,
  sacrificeOptions,
  sneakOptions,
  sneakTiming,
  sorceryTiming,
  spellCost,
  spellHasKeyword,
  spellPicks,
  spellView,
  splitSecondOnStack,
  suggestedCrew,
  symbolCards,
  tapOthersOptions,
  tapXCandidates,
  warpOf,
  waterbendAmount,
  webSlingingOptions,
  xCosts,
} from "./stack";
import { payableLife } from "./statics";
import { ALL_CREATURE_TYPES, holderOf, matchesCard, matchesObjectFilter, NON_CREATURE_SUBTYPES } from "./targets";
import { msg } from "./text";

/** Winter, Cursed Rider: number of cards that can be exiled for "exile X … cards from your graveyard". */
function graveyardXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return (s.players[player]?.graveyard ?? []).filter((id) => id !== source && matchesCard(s, player, id, f, source)).length;
}

/** Radiant Lotus: number of permanents that can be sacrificed for "sacrifice one or more …". */
function sacrificeXOptions(s: GameState, player: PlayerId, source: ObjectId, f: ObjectFilter): number {
  return s.battlefield.filter((id) => obj(s, id).controller === player && matchesObjectFilter(s, player, id, f, source)).length;
}

/** Secluded Starforge: number of untapped permanents that can be tapped for "tap X …". */
/** "Tap X untapped [permanents]": the greatest X, the tapped permanents not paying mana (`tapXCandidates`). */
function tapXMax(
  s: GameState,
  player: PlayerId,
  source: ObjectId,
  f: ObjectFilter,
  pays: (exclude: Set<ObjectId>, x: number) => boolean,
): number {
  const ids = tapXCandidates(s, player, source, f);
  for (let x = ids.length; x > 0; x--) if (pays(new Set(ids.slice(0, x)), x)) return x;
  return 0;
}

import { chars, snapshot } from "./layers";
import { kickerPaidTimes, obj } from "./state";
import { legalTargets } from "./targets";
import type {
  ActionOption,
  CardDef,
  Condition,
  CostPick,
  GameState,
  ManaCost,
  ObjectFilter,
  ObjectId,
  PlayerId,
  TargetOption,
  TargetSpec,
} from "./types";
import { BASIC_LAND_TYPES } from "./types";

const GIFT_TEXT = {
  card: msg("Gift a card"),
  food: msg("Gift a Food"),
  fish: msg("Gift a tapped Fish"),
  treasure: msg("Gift a Treasure"),
} as const;

/** Labels of the kicker question: Offspring (702.175), Gift (702.174), Bargain (702.166). */
function kickerPrompt(d: CardDef): { title: string; without: string; with: string } | undefined {
  const k = d.kicker;
  if (!k) return undefined;
  if (k.kind === "offspring") {
    const c = costToText(k.mana);
    return {
      title: msg("Pay the offspring cost {cost}?", { cost: c }),
      without: msg("Without offspring"),
      with: msg("Offspring {cost}", { cost: c }),
    };
  }
  if (k.kind === "life" && k.pay?.life) {
    const pay = k.orPay ? costToText(k.orPay) : "";
    return {
      title: msg("Pay {life} life rather than {cost}?", { life: k.pay.life, cost: pay }),
      without: msg("Pay {cost}", { cost: pay }),
      with: msg("Pay {life} life", { life: k.pay.life }),
    };
  }
  if (k.kind === "waterbend") {
    const c = costToText(k.mana);
    return {
      title: msg("Waterbend {cost} (your untapped artifacts and creatures can each pay {1})?", { cost: c }),
      without: msg("Without waterbending"),
      with: msg("Waterbend {cost}", { cost: c }),
    };
  }
  if (k.kind === "blight" && k.pay?.blight) {
    const n = k.pay.blight;
    return {
      title: msg("Blight {n}: put {n} -1/-1 counter(s) on one of your creatures?", { n }),
      without: msg("Without blighting"),
      with: msg("Blight {n}", { n }),
    };
  }
  if (k.kind === "teamwork" && k.pay?.tapPower) {
    const n = k.pay.tapPower;
    return {
      title: msg("Teamwork {n}: tap creatures with total power {n} or more?", { n }),
      without: msg("Without teamwork"),
      with: msg("Teamwork {n}", { n }),
    };
  }
  if (k.kind === "exileGraveyard" && k.pay?.exileGraveyard) {
    const n = k.pay.exileGraveyard;
    const pay = k.orPay ? costToText(k.orPay) : "";
    return {
      title: msg("Exile {n} card(s) from your graveyard rather than pay {cost}?", { n, cost: pay }),
      without: msg("Pay {cost}", { cost: pay }),
      with: msg("Exile {n} card(s)", { n }),
    };
  }
  if (k.kind === "evidence" && k.pay?.collectEvidence) {
    const n = k.pay.collectEvidence;
    return {
      title: msg("Collect evidence {n}: exile cards with total mana value {n} or more from your graveyard?", { n }),
      without: msg("Without evidence"),
      with: msg("Collect evidence {n}", { n }),
    };
  }
  if (k.kind === "bargain") {
    return {
      title: msg("Bargain: sacrifice an artifact, an enchantment or a token?"),
      without: msg("Without bargaining"),
      with: msg("Bargain"),
    };
  }
  if (k.kind === "gift" && k.gift) {
    return {
      title: msg("Promise a gift to an opponent?"),
      without: msg("Without gift"),
      with: GIFT_TEXT[k.gift],
    };
  }
  return undefined;
}

/** Creature types of each object, for "that share a creature type" (`"*"`: all types). */
function creatureTypesOf(s: GameState, ids: ObjectId[]): Record<string, string[]> {
  return Object.fromEntries(
    ids.map((id) => {
      const v = snapshot(s, id);
      const all = v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES);
      return [id, all ? ["*"] : v.subtypes.filter((t) => !NON_CREATURE_SUBTYPES.has(t))];
    }),
  );
}

/**
 * Terror of the Peaks: "spells your opponents cast that target this creature cost an additional 3 life"; a spell
 * doesn't offer a target whose tax exceeds the life the player can pay (the engine would refuse the cast).
 */
function withoutUnpayableLifeTax(s: GameState, player: PlayerId, opts: TargetOption[]): TargetOption[] {
  const life = payableLife(s, player);
  const tax = (id: string) => {
    const t = s.objects[id];
    if (t?.zone !== "battlefield" || t.controller === player) return 0;
    return chars(s, id).abilities.reduce((m, ab) => m + (ab.kind === "playerStatic" ? (ab.targetLifeTax ?? 0) : 0), 0);
  };
  return opts.map((o) => (o.legal.some((id) => tax(id) > life) ? { ...o, legal: o.legal.filter((id) => tax(id) <= life) } : o));
}

/**
 * A mana value computed from the game, not from X (Squirming Emergence: "less than or equal to the number of permanent
 * cards in your graveyard"): evaluated now, as the engine does on casting (601.2c); an X bound stays a hint (`xAtLeast`).
 */
function concreteManaValue(s: GameState, player: PlayerId, t: TargetSpec, sourceId?: ObjectId): TargetSpec {
  const amounts = [t.maxManaValueAmount, t.manaValueAmount].filter((a) => a !== undefined);
  if (!amounts.length || amounts.some((a) => JSON.stringify(a).includes('"kind":"x"'))) return t;
  return concreteSpec(s, staticContext(s, player, sourceId ?? ""), t);
}

function targetOptions(s: GameState, player: PlayerId, specs: TargetSpec[], sourceId?: ObjectId): TargetOption[] {
  return specs.map((t0) => {
    const t = concreteManaValue(s, player, t0, sourceId);
    const all = legalTargets(s, player, t, sourceId);
    // "Total mana value N or less": a target that exceeds N on its own can never be chosen.
    const cap = t.maxTotalManaValue;
    const legal = cap === undefined ? all : all.filter((id) => (snapshot(s, id).manaValue ?? 0) <= cap);
    const opt: TargetOption = {
      id: t.id,
      label: t.label,
      optional: !!t.optional,
      legal,
      count: t.count && t.count > 1 ? t.count : undefined,
      min: t.minCount,
      ...(t.countX ? { countX: t.countX } : {}),
      kickedCount: t.kickedCount,
      kickedLegal: t.kickedFilter ? legalTargets(s, player, { ...t, filter: t.kickedFilter }, sourceId) : undefined,
      otherThan: t.otherThan,
      attachedToTarget: t.attachedToTarget,
      ...(t.shareCreatureType ? { shareCreatureType: creatureTypesOf(s, legal) } : {}),
      ...(cap !== undefined
        ? { maxTotalManaValue: { max: cap, values: Object.fromEntries(legal.map((id) => [id, snapshot(s, id).manaValue ?? 0])) } }
        : {}),
      // "Mana value X or less": X must be at least the target's mana value (601.2b before 601.2c).
      ...(t.maxManaValueAmount !== undefined && typeof t.maxManaValueAmount === "object" && t.maxManaValueAmount.kind === "x"
        ? { xAtLeast: Object.fromEntries(legal.map((id) => [id, snapshot(s, id).manaValue ?? 0])) }
        : {}),
      // "With mana value X": X is the target's mana value.
      ...(t.manaValueAmount !== undefined && typeof t.manaValueAmount === "object" && t.manaValueAmount.kind === "x"
        ? { xEquals: Object.fromEntries(legal.map((id) => [id, snapshot(s, id).manaValue ?? 0])) }
        : {}),
    };
    if (t.of?.kind === "target")
      opt.ofTarget = { id: t.of.id, holders: Object.fromEntries(legal.map((id) => [id, holderOf(s, id)])) };
    if (t.samePlayer || t.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      opt.group = { kind: t.samePlayer ? "same" : "different", holders };
    }
    // Different names: same "different" constraint, the name standing for the player.
    if (t.distinct === "name") {
      const holders: Record<string, string> = {};
      for (const id of legal) holders[id] = (s.objects[id] ? snapshot(s, id).name : undefined) ?? id;
      opt.group = { kind: "different", holders };
    }
    // Different mana values: the mana value stands for the player.
    if (t.distinct === "manaValue") {
      const holders: Record<string, string> = {};
      for (const id of legal) holders[id] = String((s.objects[id] ? snapshot(s, id).manaValue : undefined) ?? id);
      opt.group = { kind: "different", holders };
    }
    return opt;
  });
}

function targetsAvailable(opts: TargetOption[]): boolean {
  const need = (t: TargetOption) => (t.optional || t.countX ? 0 : (t.min ?? t.count ?? 1));
  // "Another target": enough distinct targets for all the linked "target" words (Betrayal at the Vault).
  for (const t of opts) {
    if (!t.otherThan?.length) continue;
    const group = [t, ...opts.filter((o) => t.otherThan?.includes(o.id))];
    if (new Set(group.flatMap((o) => o.legal)).size < group.reduce((n, o) => n + need(o), 0)) return false;
  }
  return opts.every((t) => {
    // "X targets": X can be 0.
    if (t.optional || t.countX) return true;
    const need = t.min ?? t.count ?? 1;
    if (t.group?.kind === "different") return new Set(Object.values(t.group.holders)).size >= need;
    // "Targeting the same player": enough targets held by one player.
    if (t.group?.kind === "same") {
      const per = new Map<string, number>();
      for (const h of Object.values(t.group.holders)) per.set(h, (per.get(h) ?? 0) + 1);
      return [...per.values()].some((n) => n >= need);
    }
    if (t.legal.length < need) return false;
    // "That share a creature type": enough targets that share one.
    const share = t.shareCreatureType;
    if (share && need > 1) {
      const wild = t.legal.filter((id) => share[id]?.includes("*")).length;
      const count = new Map<string, number>();
      for (const id of t.legal)
        if (!share[id]?.includes("*")) for (const ty of share[id] ?? []) count.set(ty, (count.get(ty) ?? 0) + 1);
      return wild >= need || [...count.values()].some((n) => n + wild >= need);
    }
    return true;
  });
}

/** Greatest payable value of X for a cost that depends on X. */
function maxXFor(
  s: GameState,
  player: PlayerId,
  costAt: (x: number) => ManaCost,
  /** What the mana is spent on for this value of X (waterbend {X}). */
  purposeAt?: (x: number) => ManaPurpose,
): number {
  const upper = availableMana(s, player, undefined, purposeAt?.(Number.MAX_SAFE_INTEGER)) - manaValue(costAt(0));
  for (let x = upper; x > 0; x--) if (canPay(s, player, costAt(x), undefined, purposeAt?.(x))) return x;
  return 0;
}

/** Greatest payable value of X (null if the cost has no X). */
function maxX(
  s: GameState,
  player: PlayerId,
  cost: ManaCost | null | undefined,
  exclude?: ReadonlySet<ObjectId>,
  /** What the mana is spent on (activated ability: its source, waterbend). */
  purpose?: ManaPurpose,
): number | null {
  if (!cost?.x) return null;
  const upper = Math.floor((availableMana(s, player, exclude, purpose) - manaValue(cost)) / cost.x);
  for (let x = upper; x > 0; x--) if (canPay(s, player, totalCost(cost, x), exclude, purpose)) return x;
  return 0;
}

/** Choice of the creatures that crew or saddle: total power required, powers, default choice. */
function crewSpec(s: GameState, player: PlayerId, source: ObjectId, n: number) {
  const options = crewCandidates(s, player, source);
  const suggested = suggestedCrew(s, player, source, n);
  return {
    count: suggested.length,
    options,
    minPower: n,
    powers: Object.fromEntries(options.map((id) => [id, Math.max(0, crewPower(s, id))])),
    suggested,
  };
}

export function legalActions(s: GameState, player: PlayerId): ActionOption[] {
  const p = s.pending;
  if (p?.kind !== "priority" || p.player !== player) return [];
  const out: ActionOption[] = [{ type: "pass" }];
  const hand = s.players[player]?.hand ?? [];

  // Playable cards: hand, graveyard (flashback, Muldrotha, Zul Ashur…) and exile (impulse, Etali, Tinybones).
  const graveyard = (s.players[player]?.graveyard ?? []).filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  const exiled = s.exile.filter((id) => castTerms(s, player, id) || canPlayLand(s, player, id));
  // Top of the library (Vizier of the Menagerie).
  const top = s.players[player]?.library[0];
  if (top && castTerms(s, player, top)) exiled.push(top);
  // Command zone: their commander (903.8).
  const command = (s.players[player]?.command ?? []).filter((id) => castTerms(s, player, id));
  for (const card of [...hand, ...graveyard, ...exiled, ...command]) {
    const d = s.defs[obj(s, card).defId];
    if (!d) continue;
    // The land face: the card, or the land back face of a modal card (whose front face stays castable).
    const land = landFace(d);
    if (land) {
      if (canPlayLand(s, player, card)) {
        // Pathways: the front and back faces are lands; one option per face.
        const back = landBackFace(d);
        for (const [face, side] of back
          ? ([
              [land, {}],
              [back, { back: true, faceName: back.name }],
            ] as const)
          : ([[land, {}]] as const)) {
          // Shock land: pay the life (untapped) or not (tapped).
          // Multiversal Passage: one option per chosen basic land type.
          const choosesType = landTypeChoice(face);
          const types = choosesType ? BASIC_LAND_TYPES : [undefined];
          // "As it enters, choose…" (Cavern of Souls, Echoing Deeps): the first question of the "as it enters" loop,
          // asked when playing the land (none if there is nothing to choose).
          const probe =
            face.asEnters?.length && !choosesType
              ? asEntersChoices(s, {}, { id: card, defId: face.id, controller: player }, "land:", "probe")
              : undefined;
          const choose = probe && "ask" in probe ? { choose: probe.ask.request } : {};
          for (const landType of types) {
            const extra = landType ? { landType, ...choose, ...side } : { ...choose, ...side };
            if (face.shockLand && payableLife(s, player) >= face.shockLand)
              out.push({ type: "playLand", card, payLife: true, ...extra });
            out.push({ type: "playLand", card, ...extra });
          }
        }
      }
      // Adventure town: the Adventure stays castable; a land with disguise, face down (Branch of Vitu-Ghazi).
      if (land === d && d.layout !== "adventure" && !castOption(d, "faceDown")) continue;
    }
    const terms = castTerms(s, player, card);
    if (!terms || !d.implemented) continue;
    // Each castable face (the card, its adventure) gives a separate option; disguise, face down.
    if (!terms.warpOnly)
      for (const [face, faceDef] of castableFaces(s, card, d))
        if (!terms.adventureOnly || (face === 1 && faceDef.subtypes.includes("Adventure")))
          for (const v of modesOf(faceDef).some((m) => m.cost) ? [undefined, "modeCost" as const] : [undefined])
            offerCast(card, face, faceDef, terms, v);
    if (castOption(d, "faceDown")) offerCast(card, undefined, FACE_DOWN_SPELL, terms, "faceDown");
    // Warp (702.185): from the hand, or the graveyard if the card allows it.
    const warp = warpOf(s, player, card, d);
    const life = payableLife(s, player);
    if (warp && (terms.source === "hand" || terms.warpOnly) && life >= (warp.life ?? 0)) {
      offerCast(card, undefined, { ...d, manaCost: warp.cost }, terms, "warp");
    }
  }

  function offerCast(
    card: ObjectId,
    face: number | undefined,
    d: CardDef,
    terms: NonNullable<ReturnType<typeof castTerms>>,
    variant?: "faceDown" | "warp" | "modeCost",
  ) {
    // Timing: normal, ignored (Etali), or flash for an additional cost (Harbinger of the Tides).
    const onTime = terms.anyTime || (terms.sorceryTiming ? sorceryTiming(s, player) : canCastTiming(s, player, d));
    // Sneak: outside its usual timing, the spell can only be cast for its sneak cost.
    const sneakOnly = !onTime && !terms.free && sneakTiming(s, player, d);
    // A "any time you could cast a sorcery" permission (plotted card) beats the paid flash (Mystical Tether).
    const flashCost = castOption(d, "flash")?.cost;
    if (!onTime && (!flashCost || terms.sorceryTiming) && !sneakOnly) return;
    const timingExtra = onTime || sneakOnly ? undefined : flashCost;
    const flashback = terms.source === "flashback";
    // Condition of a mode read with and without the additional cost ("if it was paid, choose both instead").
    const kickerNeeds = (c: Condition | undefined): { ok: boolean; requiresKicker?: true; forbidsKicker?: true } => {
      if (!c) return { ok: true };
      const withKicker = modeConditionHolds(s, player, card, c, true);
      const without = modeConditionHolds(s, player, card, c, false);
      return {
        ok: withKicker || without,
        requiresKicker: (withKicker && !without) || undefined,
        forbidsKicker: (without && !withKicker) || undefined,
      };
    };
    const modes = modesOf(d)
      .map((m, index) => ({
        index,
        label: m.label,
        targets: withoutUnpayableLifeTax(s, player, targetOptions(s, player, m.targets, card)),
        extra: m.extraCost,
        ...kickerNeeds(m.condition),
      }))
      .filter((m) => m.ok)
      // Gift promised: the targets specific to the gift are enough (Into the Flood Maw without an opposing creature).
      .filter(
        (m) =>
          targetsAvailable(m.targets) ||
          (!!d.kicker && targetsAvailable(m.targets.map((t) => (t.kickedLegal ? { ...t, legal: t.kickedLegal } : t)))),
      )
      // Spree: the mode's additional cost must be payable.
      .filter(
        (m) =>
          !m.extra ||
          canPay(
            s,
            player,
            totalCost(
              totalCost(spellCost(s, player, d, { free: terms.free }), 0, m.extra),
              0,
              terms.extraCost ? { generic: terms.extraCost, colored: {}, x: 0 } : undefined,
            ),
          ),
      )
      .map(({ extra: _, ok: __, ...m }) => m);
    if (modes.length === 0) return;
    const additional = additionalOptions(s, player, card, d, terms.source === "flashback");
    if (!additional) return;
    // Additional costs chosen automatically: these permanents can't be used to pay the mana.
    const auto = autoAdditional(s, player, card, d, terms.source === "flashback");
    if (!auto) return;
    const spent = [...auto.tap, ...auto.exile, ...auto.bounce];
    const exclude = spent.length ? new Set(spent) : undefined;
    // The permanents exiled or returned by the cost (before the mana) no longer apply their mana replacements.
    const gone = auto.exile.length || auto.bounce.length ? new Set([...auto.exile, ...auto.bounce]) : undefined;
    const purpose0: ManaPurpose = {
      ...(gone ? { gone } : {}),
      spell: spellView(d, player),
      convoke: hasConvoke(s, player, d),
      improvise: hasImprovise(s, player, d) || undefined,
      delve: spellHasKeyword(s, player, d, "delve"),
      sacrificeToPay: d.additionalCost?.sacrificeToPay,
      fromHand: terms.source === "hand",
    };
    // Waterbend as an additional cost: its share of the cost, depending on the kicker and X.
    const purposeFor = (kicked: boolean, x: number): ManaPurpose => {
      const w = waterbendAmount(d, kicked, x) + (terms.waterbendOverride ? (terms.costOverride?.generic ?? 0) : 0);
      return w ? { ...purpose0, waterbend: w } : purpose0;
    };
    const purpose = purposeFor(false, 0);
    const base = {
      flashback,
      anyMana: terms.anyMana,
      mayhem: terms.mayhem,
      costOverride: terms.costOverride,
      fromZone: terms.source,
      card,
    };
    // "Sacrifice a creature or pay {3}{B}": with no creature to sacrifice, the mana is added to the cost.
    const sac = additional.sacrifice;
    const mustPayInstead = !!sac?.orPay && sac.options.length < sac.count;
    // Titania: with no card to discard, the mana is added to the cost.
    const dis = additional.discard;
    const mustPayDiscard = !!dis?.orPay && dis.options.length < dis.count;
    // Surcharge of the permission (Lightstall Inquisitor: "costs {1} more"; commander tax), as in `castSpell`, and
    // timing surcharge.
    const withSurcharges = (c: ManaCost) => {
      const a = terms.extraCost ? totalCost(c, 0, { generic: terms.extraCost, colored: {}, x: 0 }) : c;
      return timingExtra ? totalCost(a, 0, timingExtra) : a;
    };
    const withExtra = (c: ManaCost) => {
      const a0 = mustPayInstead && sac?.orPay ? totalCost(c, 0, sac.orPay) : c;
      const a1 = mustPayDiscard && dis?.orPay ? totalCost(a0, 0, dis.orPay) : a0;
      return withSurcharges(a1);
    };
    // Harmonize: also payable by tapping a creature (which then isn't used to pay the mana).
    const harmony =
      flashback && (castOption(d, "flashback")?.harmonize || terms.harmonize)
        ? harmonizeOptions(s, player, card, withExtra(spellCost(s, player, d, base)).generic)
        : undefined;
    const payableWith = (c: ManaCost) =>
      canPay(s, player, c, exclude, purpose) ||
      !!harmony?.options.some((id) =>
        canPay(s, player, totalCost(c, 0, undefined, harmony.powers[id] ?? 0), new Set([...(exclude ?? []), id]), purpose),
      );
    const normal = !sneakOnly && !terms.free && payableWith(withExtra(spellCost(s, player, d, base)));
    // Phyrexian mana: the numbers of symbols payable with life (normal cost), when there is a choice (PLAN-L L7).
    const phyrexian = normal
      ? phyrexianLifeOptions(s, player, withExtra(spellCost(s, player, d, base)), exclude, purpose)
      : undefined;
    // Without paying its mana cost: taxes (Thalia, the Survivor) and additional costs remain to be paid.
    const freePayable = () => payableWith(withExtra(spellCost(s, player, d, { ...base, free: true })));
    if (terms.free && !freePayable()) return;
    const freeAvailable = !sneakOnly && !!terms.freeOptional && freePayable();
    const alt = terms.free ? undefined : altCostFor(s, player, d);
    // The permanents returned or sacrificed by the alternative cost (Daze, emerge) no longer produce mana.
    const altPaid = alt?.pay ? altCostPayment(s, player, card, alt.pay) : undefined;
    // Web-slinging: the tapped creature returned by default (Nyxbloom Ancient no longer triples the mana).
    const webBounce = alt && isWebSlinging(s, player, d) ? webSlingingOptions(s, player)[0] : undefined;
    const altGone = [altPaid?.bounce, ...(altPaid?.sacrifice ?? []), webBounce].filter((x): x is string => !!x);
    // Emerge: only the victims that leave the reduced cost payable are offered.
    const emergeVictims = (p: CostPick): CostPick => ({
      ...p,
      options: p.options.filter(
        (v) =>
          v === p.suggested[0] ||
          canPay(
            s,
            player,
            withExtra(spellCost(s, player, d, { ...base, alternative: true, victim: v })),
            new Set([...(exclude ?? []), v]),
            { ...purpose, gone: new Set([...(gone ?? []), v]) },
          ),
      ),
    });
    const altAvailable =
      !!alt &&
      (!alt.collectEvidence || !!evidenceCards(s, player, card, alt.collectEvidence)) &&
      (!alt.pay || !!altPaid) &&
      canPay(
        s,
        player,
        withExtra(spellCost(s, player, d, { ...base, alternative: true })),
        altGone.length ? new Set([...(exclude ?? []), ...altGone]) : exclude,
        altGone.length ? { ...purpose, gone: new Set([...(gone ?? []), ...altGone]) } : purpose,
      );
    // Payable kicker ("costs {2} less if it's bargained": Hamlet Glutton may be payable only when bargained).
    // Teamwork: the creatures tapped for the kicker don't pay the mana.
    const kickerPay = d.kicker?.pay;
    const kickerCrew = kickerPay?.tapPower !== undefined ? suggestedCrew(s, player, card, kickerPay.tapPower) : [];
    // Replicate (702.56), squad (702.157): the cost is paid X times (X chosen as for an X spell), not as a kicker.
    const replicate = kickerPaidTimes(d);
    const kickerAffordable =
      !sneakOnly &&
      !!d.kicker &&
      !replicate &&
      !flashback &&
      (!kickerPay ||
        (kickerPay.tapPower !== undefined
          ? kickerCrew.length > 0
          : kickerPay.collectEvidence !== undefined
            ? !!evidenceCards(s, player, card, kickerPay.collectEvidence)
            : kickerPay.life !== undefined
              ? payableLife(s, player) >= kickerPay.life
              : kickerPay.exileGraveyard !== undefined
                ? !!graveyardToExile(s, player, card, kickerPay.exileGraveyard)
                : !!kickerCostPermanent(s, player, card, d))) &&
      canPay(
        s,
        player,
        withExtra(spellCost(s, player, d, { ...base, kicked: true, free: terms.free })),
        kickerCrew.length ? new Set([...(exclude ?? []), ...kickerCrew]) : undefined,
        purposeFor(true, 0),
      );
    // Overload, cleave: the modes with their own cost form a separate option (`variant` "modeCost"), payable, without
    // free casting or other alternative cost (118.9a); the ordinary option has only the other modes.
    const allModes = modesOf(d);
    const modeCost = variant === "modeCost";
    for (let i = modes.length - 1; i >= 0; i--) {
      const own = allModes[(modes[i] as (typeof modes)[number]).index]?.cost;
      const ok = modeCost
        ? !!own && !terms.free && payableWith(withExtra(spellCost(s, player, { ...d, manaCost: own }, base)))
        : !own;
      if (!ok) modes.splice(i, 1);
    }
    if (modes.length === 0) return;
    if (!modeCost && !terms.free && !normal && !freeAvailable && !altAvailable && !kickerAffordable) return;
    // A mode that requires the additional cost needs a payable kicker; a mode that excludes it, another way to pay.
    const unkickedPayable = modeCost || !!terms.free || normal || freeAvailable || altAvailable;
    for (let i = modes.length - 1; i >= 0; i--) {
      const m = modes[i] as (typeof modes)[number];
      if ((m.requiresKicker && !kickerAffordable) || (m.forbidsKicker && !unkickedPayable)) modes.splice(i, 1);
    }
    if (modes.length === 0) return;
    // A mode that has targets only with the kicker or the gift (Too Evil to Stay Dead) needs a payable kicker.
    if (!kickerAffordable)
      for (let i = modes.length - 1; i >= 0; i--)
        if (!targetsAvailable((modes[i] as (typeof modes)[number]).targets)) modes.splice(i, 1);
    if (modes.length === 0) return;
    // "This spell costs {W}{U} more for each target beyond the first" (Officious Interrogation): no more targets than
    // the available mana allows.
    if (d.additionalCost?.costPerExtraTarget && normal && !freeAvailable && !altAvailable)
      for (const m of modes)
        for (const t of m.targets) {
          let n = t.count ?? 1;
          const dummy = (k: number) => ({ [t.id]: Array.from({ length: k }, (_, i) => `#${i}`) });
          while (n > 1 && !payableWith(withExtra(spellCost(s, player, d, { ...base, targets: dummy(n) })))) n--;
          t.count = n > 1 ? n : undefined;
        }
    // "This spell costs {N} less if it targets…" (Luminous Rebuke): payable only thanks to the reduction, the spell
    // offers only the targets that give it (otherwise the player would choose a target and the payment would fail).
    const reduction = d.costReduction?.condition;
    if (normal && !freeAvailable && !altAvailable && reduction?.kind === "targetMatches") {
      const full = payableWith(withExtra(spellCost(s, player, d, { ...base, targets: { [reduction.spec]: [] } })));
      if (!full)
        for (const m of modes)
          for (const t of m.targets) {
            if (t.id !== reduction.spec) continue;
            const giving = t.legal.filter((id) =>
              payableWith(withExtra(spellCost(s, player, d, { ...base, targets: { [t.id]: [id] } }))),
            );
            // Several targets ("up to two", This Town Ain't Big Enough): at least one that gives the reduction.
            if ((t.count ?? 1) > 1) Object.assign(t, { requiredAmong: giving, optional: false, min: 1 });
            else Object.assign(t, { legal: giving, optional: false });
          }
    }
    // Is the mana to pay instead of the sacrifice available?
    if (dis?.orPay) {
      dis.orPayAffordable = canPay(
        s,
        player,
        totalCost(withSurcharges(spellCost(s, player, d, base)), 0, dis.orPay),
        undefined,
        purpose,
      );
    }
    if (sac?.orPay) {
      sac.orPayAffordable = canPay(
        s,
        player,
        totalCost(withSurcharges(spellCost(s, player, d, base)), 0, sac.orPay),
        undefined,
        purpose,
      );
    }
    const hasX =
      (!terms.free && !!(flashback ? (castOption(d, "flashback")?.cost ?? d.manaCost)?.x : d.manaCost?.x)) ||
      d.additionalCost?.xCost === "waterbend" ||
      replicate;
    // Vicious Rivalry: X is paid in life.
    // Soul Immolation: X blighted, at most the greatest toughness among your creatures.
    const lifeX = !normal
      ? null
      : d.additionalCost?.xCost === "life"
        ? payableLife(s, player)
        : d.additionalCost?.xCost === "blight"
          ? greatestToughness(s, player)
          : null;
    const xMax =
      lifeX ??
      (hasX && (normal || terms.free)
        ? maxXFor(
            s,
            player,
            (x) => withExtra(spellCost(s, player, d, { ...base, x, free: terms.free })),
            (x) => purposeFor(false, x),
          )
        : null);
    // "Mana value X or less": only the targets allowed by the greatest payable X are offered.
    const castModes = modes.some((m) => m.targets.some((t) => t.xAtLeast))
      ? modes
          .map((m) => ({
            ...m,
            targets: m.targets.map((t) =>
              t.xAtLeast ? { ...t, legal: t.legal.filter((id) => (t.xAtLeast?.[id] ?? 0) <= (xMax ?? 0)) } : t,
            ),
          }))
          .filter((m) => targetsAvailable(m.targets))
      : modes;
    if (castModes.length === 0) return;
    out.push({
      type: "cast",
      card,
      ...(face !== undefined ? { face, faceName: d.name } : {}),
      ...(variant === "faceDown" ? { faceDown: true, faceName: msg("Face down") } : {}),
      ...(variant === "warp" ? { warp: true } : {}),
      modes: castModes,
      xMax,
      kickerAffordable: !modeCost && kickerAffordable,
      kickerPrompt: d.kicker ? kickerPrompt(d) : undefined,
      ...(hybridColors(d).length ? { hybridColors: hybridColors(d) } : {}),
      ...(hybridMatters(d) ? { hybridMatters: true as const } : {}),
      ...(phyrexian ? { phyrexianLife: phyrexian } : {}),
      fromGraveyard: terms.source === "graveyard" || terms.source === "flashback" ? true : undefined,
      fromExile: terms.source === "exile" ? true : undefined,
      free: (!modeCost && terms.free) || undefined,
      freeAvailable: (!modeCost && freeAvailable) || undefined,
      altAvailable: (!modeCost && altAvailable) || undefined,
      altLabel: !modeCost && altAvailable ? alt?.label : undefined,
      // A mode with its own cost (overload) is paid like the normal cost.
      normalAvailable: normal || modeCost || undefined,
      additional:
        additional.discard || additional.sacrifice || harmony?.options.length
          ? { ...additional, ...(harmony?.options.length ? { tap: { count: 1, ...harmony, optional: true as const } } : {}) }
          : undefined,
      altBounce: !altAvailable
        ? undefined
        : isWebSlinging(s, player, d)
          ? webSlingingOptions(s, player)
          : castOption(d, "alternative")?.via === "sneak"
            ? sneakOptions(s, player)
            : undefined,
      kickerPermanents:
        kickerPay && !kickerPay.tapPower && !kickerPay.collectEvidence && !kickerPay.exileGraveyard
          ? kickerCostOptions(s, player, card, d)
          : undefined,
      kickerTap: kickerPay?.tapPower ? crewSpec(s, player, card, kickerPay.tapPower) : undefined,
      // Objects paid as a cost (evidence, exile from the graveyard, blight X), when the player has a choice to make.
      ...(() => {
        const picks = spellPicks(s, player, card, d, undefined, terms)
          .map((p) => (p.slot === "altSacrifice" && alt?.pay?.sacrificeReduce ? emergeVictims(p) : p))
          .filter(
            (p) =>
              (p.when !== "kicked" || kickerAffordable) &&
              (p.when !== "alternative" || altAvailable) &&
              (p.atMost || p.optional || pickHasChoice(p)),
          );
        return picks.length ? { picks } : {};
      })(),
    });
  }

  const offField = (zone: "graveyard" | "hand", flag: "fromGraveyard" | "fromHand") =>
    (s.players[player]?.[zone] ?? []).filter((id) =>
      s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && ab[flag]),
    );
  // Emblems: their activated abilities work in the command zone (114.4; Karn, Living Legacy); a card's, only those
  // that say so (commander ninjutsu).
  const emblems = (s.players[player]?.command ?? []).filter((id) =>
    s.defs[obj(s, id).defId]?.abilities.some((ab) => ab.kind === "activated" && (obj(s, id).isToken || ab.fromCommand)),
  );
  for (const id of [...s.battlefield, ...offField("graveyard", "fromGraveyard"), ...offField("hand", "fromHand"), ...emblems]) {
    const o = obj(s, id);
    // 602.2: abilities that other players may activate (Xantcha, Oft-Nabbed Goat).
    const foreign = o.zone === "battlefield" && o.controller !== player;
    if (
      foreign
        ? !abilitiesOf(s, id).some((ab) => ab.kind === "activated" && ab.activators)
        : o.zone !== "battlefield" && o.owner !== player
    )
      continue;
    abilitiesOf(s, id).forEach((_, index) => {
      const printed = activatedAbility(s, id, index);
      const ab = printed && abilityAsPaid(s, player, id, printed);
      if (!ab || activationZone(o, ab) !== o.zone || !mayActivate(s, player, o, ab) || !canPayNonManaCost(s, id, ab, index))
        return;
      const fc = fixedCost(ab.cost);
      const xc = xCosts(ab.cost);
      if (ab.sorcerySpeed && !instantLoyalty(s, player, id, ab) && !sorceryTiming(s, player)) return;
      // Craft: the source and the exiled materials don't pay the mana.
      const exclude = ab.cost.craft
        ? new Set([id, ...(craftMaterials(s, player, id, ab) ?? [])])
        : ab.cost.tap
          ? new Set([id])
          : undefined;
      // Warrior's Blades, Dragonfire Blade: at best, the most favorable target.
      if (ab.cost.exileGraveyardSymbols && !symbolCards(s, player, ab.cost.exileGraveyardSymbols)) return;
      const abCost = abilityManaCost(s, player, id, ab, "best");
      // The permanents sacrificed by default can pay with an ability that doesn't sacrifice them (Treasure: no).
      const sacrificed = fc.sacrifice ? sacrificeOptions(s, player, id, ab).slice(0, fc.sacrifice.count) : [];
      const purpose = sacrificed.length
        ? { ...abilityPurpose(id, ab), sacrificedForCost: new Set(sacrificed) }
        : abilityPurpose(id, ab);
      if (ab.cost.mana && !canPay(s, player, abCost, exclude, purpose)) return;
      const targets = targetOptions(s, player, ab.targets, id);
      // Cost that depends on the target: only the targets that make the ability payable are offered.
      if (ab.cost.mana && costDependsOnTarget(ab))
        for (const t of targets)
          if (t.id === "t")
            t.legal = t.legal.filter((c) =>
              canPay(s, player, abilityManaCost(s, player, id, ab, c), exclude, abilityPurpose(id, ab)),
            );
      if (!targetsAvailable(targets)) return;
      const xMax0 =
        ab.cost.loyalty === "X"
          ? (o.counters.loyalty ?? 0)
          : xc.removeCounters
            ? (o.counters[xc.removeCounters] ?? 0)
            : xc.tap
              ? tapXMax(
                  s,
                  player,
                  id,
                  xc.tap,
                  (tapped, x) =>
                    !ab.cost.mana ||
                    canPay(
                      s,
                      player,
                      abilityManaCost(s, player, id, ab, "best", x),
                      new Set([...(exclude ?? []), ...tapped]),
                      purpose,
                    ),
                )
              : xc.discard
                ? (s.players[player]?.hand ?? []).filter((c) => c !== id).length
                : xc.exileFromGraveyard
                  ? graveyardXOptions(s, player, id, xc.exileFromGraveyard)
                  : xc.sacrifice
                    ? sacrificeXOptions(s, player, id, xc.sacrifice)
                    : maxX(s, player, ab.cost.mana, exclude, abilityPurpose(id, ab));
      // Krumar Initiate: "pay X life" — X doesn't exceed the life total.
      const xMax = xc.payLife && xMax0 !== null ? Math.min(xMax0, Math.max(0, payableLife(s, player))) : xMax0;
      // "X can't be 0" (and "sacrifice X permanents", Radiant Lotus): offered only if X can reach its minimum.
      // Only an {X} cost (Helix Pinnacle): at X = 0, the activation is free and has no effect; it isn't offered (the
      // engine always accepts it), which keeps an AI from activating it endlessly.
      const onlyX =
        !!ab.cost.mana?.x &&
        !ab.cost.mana.generic &&
        !Object.values(ab.cost.mana.colored).some(Boolean) &&
        Object.keys(ab.cost).every((k) => k === "mana" || (ab.cost as Record<string, unknown>)[k] === undefined);
      const minX = ab.cost.minX ?? (xc.sacrifice || onlyX ? 1 : undefined);
      if (minX !== undefined && (xMax ?? 0) < minX) return;
      // "With mana value X": only the targets whose mana value is an affordable X.
      const fit = (t: TargetOption) =>
        t.xEquals
          ? { ...t, legal: t.legal.filter((c) => (t.xEquals?.[c] ?? 0) <= (xMax ?? 0) && (t.xEquals?.[c] ?? 0) >= (minX ?? 0)) }
          : t;
      if (targets.some((t) => t.xEquals)) {
        const fitted = targets.map(fit);
        if (!targetsAvailable(fitted)) return;
        targets.splice(0, targets.length, ...fitted);
      }
      out.push({
        type: "activate",
        source: id,
        ability: index,
        label: ab.label,
        targets,
        xMax,
        ...(minX !== undefined ? { xMin: minX } : {}),
        // Phyrexian mana (Drivnod; K'rrik): the numbers of symbols payable with life, when there is a choice.
        ...(() => {
          const phyrexian = ab.cost.mana ? phyrexianLifeOptions(s, player, abCost, exclude, purpose) : undefined;
          return phyrexian ? { phyrexianLife: phyrexian } : {};
        })(),
        // Objects paid as a cost, when the player has a choice to make.
        ...(() => {
          const picks = activationPicks(s, player, id, ab).filter((p) => p.atMost || p.countIsX || pickHasChoice(p));
          // Kíli the Resourceful: {0} or the printed cost.
          const free =
            ab !== printed ? freeCostPick(s, player, id, printed, index, targets.find((t) => t.id === "t")?.legal) : undefined;
          if (free) picks.push(free);
          return picks.length ? { picks } : {};
        })(),
        additional:
          fc.sacrifice || fc.tapOthers || fc.discard || ab.cost.crew !== undefined || ab.cost.craft
            ? {
                ...(fc.sacrifice
                  ? { sacrifice: { count: fc.sacrifice.count, options: sacrificeOptions(s, player, id, ab) } }
                  : {}),
                ...(fc.discard
                  ? { discard: { count: fc.discard, options: discardCostOptions(s, player, id, ab.cost.discardFilter) } }
                  : {}),
                // Station: the player chooses the creature to tap.
                ...(fc.tapOthers ? { tap: { count: fc.tapOthers.count, options: tapOthersOptions(s, player, id, ab) } } : {}),
                // Crew, saddle: the player chooses the creatures (enough total power).
                ...(ab.cost.crew !== undefined ? { tap: crewSpec(s, player, id, ab.cost.crew) } : {}),
                // Craft: the player chooses their materials.
                ...(ab.cost.craft ? { materials: craftSpec(s, player, id, ab) ?? undefined } : {}),
              }
            : undefined,
      });
    });
  }

  // Restricted sources too (Cavern of Souls): tapped by hand, their mana goes into the marked pool.
  for (const src of manaSources(s, player, undefined, { manual: true })) {
    if (src.ability < 0) continue;
    const ab = manaAbilitiesOf(s, src.id)[src.ability];
    // Gene Pollinator, Relic of Legends: the other permanent to tap, when there is a choice.
    const tapPick = ab?.tapAnother ? tapAnotherPick(s, src.id, src.ability) : undefined;
    if (ab)
      out.push({
        type: "tapForMana",
        source: src.id,
        ability: src.ability,
        colors: ab.produce,
        ...(src.combination && src.amount > 1 ? { amount: src.amount, combination: true as const } : {}),
        ...(tapPick ? { picks: [tapPick] } : {}),
      });
  }
  // 702.61: split second — no spells or abilities (except mana) while the spell is on the stack; special actions
  // remain possible (702.61b).
  if (splitSecondOnStack(s))
    return out.filter(
      (a) =>
        a.type === "pass" ||
        a.type === "tapForMana" ||
        (a.type === "activate" && !!activatedAbility(s, a.source, a.ability)?.specialAction),
    );
  // 608.2g: during a resolution, only the offered cards (or pass to decline).
  const now = p.castNow;
  if (now)
    return out.filter((a) => a.type === "pass" || a.type === "tapForMana" || (a.type === "cast" && now.cards.includes(a.card)));
  return out;
}

/** "Meaningful" actions: everything but passing and producing mana. */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass" && a.type !== "tapForMana");
}
