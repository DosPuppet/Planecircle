/** Target and reference builders of the card DSL (dsl.ts): `target.*`, `ref.*`. */
import { msg } from "../text";
import type { Amount, CardType, Condition, ObjectFilter, Ref, TargetSpec } from "../types";

export const target = {
  any: (id = "t"): TargetSpec => ({
    id,
    label: msg("any target"),
    filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"] } },
  }),
  creature: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label:
      extra.controller === "you"
        ? msg("creature you control")
        : extra.controller === "opponent"
          ? msg("creature an opponent controls")
          : msg("creature"),
    filter: { objects: { types: ["Creature"], ...extra } },
  }),
  permanent: (id: string, types: CardType[], extra: ObjectFilter = {}, label?: string): TargetSpec => ({
    id,
    label,
    filter: { objects: { types, ...extra } },
  }),
  player: (id = "t", which: "any" | "opponent" = "any"): TargetSpec => ({
    id,
    label: which === "opponent" ? msg("opponent") : msg("player"),
    filter: { players: which },
  }),
  optional: (t: TargetSpec): TargetSpec => ({ ...t, optional: true }),
  /** "up to N [targets]" */
  upTo: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n, optional: true }),
  /** "N [targets]" (exactly N, all different). */
  exactly: (n: number, t: TargetSpec): TargetSpec => ({ ...t, count: n }),
  /** "one or two targets": between `min` and `max` targets. */
  between: (min: number, max: number, t: TargetSpec): TargetSpec => ({ ...t, count: max, minCount: min }),
  /**
   * "… that player controls", "from that player's graveyard": the targets are held by the designated player (the player
   * of the event, the defending player, or the one chosen for another "target" word: `ref.target("p")`).
   */
  of: (who: Ref, t: TargetSpec, label?: string): TargetSpec => ({ ...t, of: who, ...(label ? { label } : {}) }),
  /** "target [filter] card from your graveyard / from a graveyard" */
  cardInGraveyard: (
    id = "t",
    filter: ObjectFilter = {},
    whose: "you" | "opponent" | "any" = "you",
    label = whose === "you" ? msg("card in your graveyard") : msg("card in a graveyard"),
  ): TargetSpec => ({ id, label, filter: { cards: { filter, whose } } }),
  /** "target nonland permanent" (and other combinations of types) */
  nonland: (id = "t", extra: ObjectFilter = {}, label = msg("nonland permanent")): TargetSpec => ({
    id,
    label,
    filter: { objects: { ...extra, notTypes: ["Land", ...(extra.notTypes ?? [])] } },
  }),
  /** "target spell or ability with a single target" (Bolt Bend) */
  stackItemSingleTarget: (id = "t"): TargetSpec => ({
    id,
    label: msg("spell or ability with a single target"),
    filter: { stackItems: { singleTarget: true } },
  }),
  /** "target spell" (on the stack) */
  spell: (id = "t", filter: ObjectFilter = {}, label = msg("spell")): TargetSpec => ({ id, label, filter: { spells: filter } }),
  creatureOrPlaneswalker: (id = "t", extra: ObjectFilter = {}): TargetSpec => ({
    id,
    label: msg("creature or planeswalker"),
    filter: { objects: { types: ["Creature", "Planeswalker"], ...extra } },
  }),
};

export const ref = {
  target: (id = "t"): Ref => ({ kind: "target", id }),
  /** The object of the triggering event ("this creature", "this spell"…). */
  eventObject: { kind: "eventObject" } as Ref,
  /** "One or more …" (`batched` trigger): the objects of all the events of the batch ("those creatures"). */
  eventObjects: { kind: "eventObjects" } as Ref,
  eventPlayer: { kind: "eventPlayer" } as Ref,
  /** "One or more …" (`batched` trigger): the players of all the events of the batch ("each of those opponents"). */
  eventPlayers: { kind: "eventPlayers" } as Ref,
  /** The permanent that grants the ability ("Return Trusty Boomerang", in the ability granted to the equipped creature). */
  grantor: { kind: "grantor" } as Ref,
  self: { kind: "self" } as Ref,
  you: { kind: "you" } as Ref,
  eachOpponent: { kind: "eachOpponent" } as Ref,
  eachPlayer: { kind: "eachPlayer" } as Ref,
  /** The permanent the source is attached to ("the equipped / enchanted creature"). */
  attached: { kind: "attached" } as Ref,
  /** The permanents attached to the designated object (filter with `ref.filtered`). */
  attachmentsOf: (r: Ref): Ref => ({ kind: "attachmentsOf", ref: r }),
  /** The permanents the designated objects are attached to (an Aura's host): `attached` with `of`. */
  hostOf: (r: Ref): Ref => ({ kind: "attached", of: r }),
  /** "Its controller" (last known controller of an object that left the battlefield this turn). */
  controllerOf: (r: Ref): Ref => ({ kind: "controllerOf", ref: r }),
  /** "Its owner". */
  ownerOf: (r: Ref): Ref => ({ kind: "ownerOf", ref: r }),
  /** "this card", wherever it is (Angelic Destiny). */
  selfCard: { kind: "selfCard" } as Ref,
  linked: { kind: "linked" } as Ref,
  /** The player chosen as the source entered ("the chosen player"). */
  chosenPlayer: { kind: "chosenPlayer" } as Ref,
  /** What was paid in objects for the cost (sacrificed permanents, discarded cards…). */
  cost: (paid: Extract<Ref, { kind: "cost" }>["paid"]): Ref => ({ kind: "cost", paid }),
  costSacrificed: { kind: "cost", paid: "sacrificed" } as Ref,
  costDiscarded: { kind: "cost", paid: "discarded" } as Ref,
  /** The designated objects that match the filter (Ghost Vacuum: "each creature card exiled with…"). */
  filtered: (r: Ref, filter: ObjectFilter): Ref => ({ kind: "filtered", ref: r, filter }),
  /** Union of references, without duplicates. */
  union: (...of: Ref[]): Ref => ({ kind: "union", of }),
  /** "The creatures blocked by [it] / blocking [it]" during this combat. */
  combatPartners: (r: Ref): Ref => ({ kind: "combatPartners", ref: r }),
  /**
   * The players who chose (`fx.chooseNumbers`, `fx.eachChooses`): the highest number, the lowest, not the lowest, or the
   * option of that rank (from 1).
   */
  choosers: (store: string, which: "highest" | "lowest" | "notLowest" | number): Ref => ({ kind: "choosers", store, which }),
  /** The n-th (from 0) of the designated objects or players. */
  nth: (of: Ref, n: number): Ref => ({ kind: "nth", of, n }),
  /** Commander: the commanders of the designated players (you by default), wherever they are. */
  commanders: (who: Ref = { kind: "you" }): Ref => ({ kind: "commanders", who }),
  /** The objects of `r` except those of `exclude` ("all other creatures"). */
  except: (r: Ref, exclude: Ref): Ref => ({ kind: "except", ref: r, exclude }),
  /** Cards exiled by the source "until it leaves the battlefield". */
  exiledWith: { kind: "exiledWith" } as Ref,
  /** The cards exiled to pay the cost ("copy the exiled cards"). */
  costExiled: { kind: "cost", paid: "exiled" } as Ref,
  /** The cards in your graveyard with the same name as the designated card, itself included (Rat King, Verminister). */
  sameNameInGraveyard: (r: Ref): Ref => ({ kind: "sameName", ref: r, zone: "graveyard" }),
  /** The permanents with the same name as the designated objects, themselves included. */
  sameNameOnBattlefield: (r: Ref): Ref => ({ kind: "sameName", ref: r, zone: "battlefield" }),
  /** The creature returned to hand for Web-slinging (Scarlet Spider, Ben Reilly). */
  costBounced: { kind: "cost", paid: "bounced" } as Ref,
  /** The targets of the spell or ability of the event ("those creatures"). */
  targetsOfEventObject: { kind: "targetsOfEventObject" } as Ref,
  /** The abilities on the stack whose source is the object of the event, most recent first. */
  abilitiesFromEventObject: { kind: "abilitiesFromEventObject" } as Ref,
  /** The designated players for whom the condition is true, from their point of view. */
  playersWhere: (of: Ref, where: Condition): Ref => ({ kind: "playersWhere", of, where }),
  playersWithoutMaxSpeed: {
    kind: "playersWhere",
    of: { kind: "eachPlayer" },
    where: { kind: "not", cond: { kind: "maxSpeed" } },
  } as Ref,
  libraryTop: (who: Ref): Ref => ({ kind: "libraryTop", who }),
  /** The top N cards of the designated player's library (Memories Returning). */
  libraryTopCards: (who: Ref, count: number): Ref => ({ kind: "libraryTop", who, count }),
  /** The bottom card of the designated player's library. */
  libraryBottom: (who: Ref): Ref => ({ kind: "libraryTop", who, bottom: true }),
  /** The objects in a zone of the designated players (see the `zone` reference). */
  zone: (zone: Extract<Ref, { kind: "zone" }>["zone"], who: Ref, filter?: ObjectFilter): Ref => ({
    kind: "zone",
    zone,
    who,
    ...(filter ? { filter } : {}),
  }),
  stackItemsOf: (who: Ref): Ref => ({ kind: "zone", zone: "stack", who }),
  exiledCardsOf: (who: Ref): Ref => ({ kind: "zone", zone: "exile", who }),
  allGraveyards: { kind: "zone", zone: "graveyard", who: { kind: "eachPlayer" } } as Ref,
  graveyardOf: (who: Ref): Ref => ({ kind: "zone", zone: "graveyard", who }),
  crewedBy: { kind: "crewedBy" } as Ref,
  stored: (name: string): Ref => ({ kind: "stored", name }),
  /** "each [creature] [the designated player] controls" */
  permanentsOf: (player: Ref, filter: ObjectFilter): Ref => ({ kind: "zone", zone: "battlefield", who: player, filter }),
  /** The permanents the player owns, whoever controls them (Expropriate). */
  permanentsOwnedBy: (player: Ref, filter: ObjectFilter = {}): Ref => ({
    kind: "zone",
    zone: "battlefield",
    who: player,
    filter,
    owned: true,
  }),
  playersWithMost: (filter: ObjectFilter): Ref => ({ kind: "playersWithMost", filter }),
  /** The defending player of the attacking source creature (or the controller of the attacked planeswalker). */
  defendingPlayer: { kind: "defendingPlayer" } as Ref,
  /** "That player or a planeswalker they control": the designated players and their planeswalkers. */
  withPlaneswalkers: (of: Ref): Ref => ({ kind: "withPlaneswalkers", of }),
  handOf: (player: Ref, filter: ObjectFilter = {}, maxManaValue?: Amount): Ref => ({
    kind: "zone",
    zone: "hand",
    who: player,
    filter,
    ...(maxManaValue !== undefined ? { maxManaValue } : {}),
  }),
};
