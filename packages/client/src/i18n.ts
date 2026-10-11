/** Interface labels (English `msg` texts, translated at display with `textIn`) and the formatting of the game log. */

import { tokenImage } from "@mtgx/cards";
import {
  type CardFace,
  cardRef,
  type GameEvent,
  type GameView,
  HIDDEN_CARD_ID,
  type Keyword,
  msg,
  type Step,
} from "@mtgx/engine";
import { customImage, imageUrl } from "./images";
import { type Lang, localize, textIn, tr } from "./translate";

export type { Lang } from "./translate";

/** Step names (`msg` texts: displayed through `textIn`). */
export const STEP_LABEL: Record<Step, string> = {
  untap: msg("Untap step"),
  upkeep: msg("Upkeep step"),
  draw: msg("Draw step"),
  main1: msg("Main phase 1"),
  beginCombat: msg("Beginning of combat step"),
  declareAttackers: msg("Declare attackers step"),
  declareBlockers: msg("Declare blockers step"),
  firstStrikeDamage: msg("First-strike damage step"),
  combatDamage: msg("Combat damage step"),
  endCombat: msg("End of combat step"),
  main2: msg("Main phase 2"),
  end: msg("End step"),
  cleanup: msg("Cleanup step"),
};

/** Steps shown in the phase bar (short label, a `msg` text displayed through `textIn`). */
export const PHASE_BAR: { step: Step; short: string }[] = [
  { step: "upkeep", short: msg("ctx:phase|Upkeep") },
  { step: "draw", short: msg("ctx:phase|Draw") },
  { step: "main1", short: msg("ctx:phase|Main 1") },
  { step: "beginCombat", short: msg("ctx:phase|Combat") },
  { step: "declareAttackers", short: msg("ctx:phase|Attack") },
  { step: "declareBlockers", short: msg("ctx:phase|Block") },
  { step: "combatDamage", short: msg("ctx:phase|Damage") },
  { step: "endCombat", short: msg("ctx:phase|End combat") },
  { step: "main2", short: msg("ctx:phase|Main 2") },
  { step: "end", short: msg("ctx:phase|End") },
];

/** The engine's safety caps (`engine/src/limits.ts`), named in the log. */
const CAPS: Record<"tokens" | "amount" | "permutations" | "layers", string> = {
  tokens: msg("tokens"),
  amount: msg("amount"),
  permutations: msg("replacement order"),
  layers: msg("layer dependencies"),
};

/** Reason for a loss, added to the log ("Bob loses (10 poison counters)."); none for a loss of life. */
const LOSS_REASON: Record<"life" | "draw" | "poison" | "concede" | "commander", string | null> = {
  life: null,
  draw: msg("empty library"),
  poison: msg("10 poison counters"),
  concede: msg("concession"),
  commander: msg("21 damage from a single commander"),
};

/** Keyword names (`msg` texts: displayed through `textIn`). */
export const KEYWORD_LABEL: Record<Keyword, string> = {
  flying: msg("Flying"),
  reach: msg("Reach"),
  firstStrike: msg("First strike"),
  doubleStrike: msg("Double strike"),
  deathtouch: msg("Deathtouch"),
  lifelink: msg("Lifelink"),
  trample: msg("Trample"),
  vigilance: msg("Vigilance"),
  haste: msg("Haste"),
  menace: msg("Menace"),
  defender: msg("Defender"),
  flash: msg("Flash"),
  hexproof: msg("Hexproof"),
  shroud: msg("Shroud"),
  infect: msg("Infect"),
  toxic: msg("Toxic"),
  indestructible: msg("Indestructible"),
  prowess: msg("Prowess"),
  ward: msg("Ward"),
  changeling: msg("Changeling"),
  wither: msg("Wither"),
  mustBeBlocked: msg("Must be blocked"),
  damageHealsFirst: msg("Each damage heals the previous damage"),
  cantBlock: msg("Can't block"),
  startYourEngines: msg("Start your engines!"),
  decayed: msg("Decayed"),
  ascend: msg("Ascend"),
  cantBeSacrificed: msg("Can't be sacrificed"),
  cantBeSuspected: msg("Can't become suspected"),
  cantBeTurnedFaceUp: msg("Can't be turned face up"),
  cantAttack: msg("Can't attack"),
  unblockable: msg("Can't be blocked"),
  mustAttack: msg("Attacks each combat"),
  noActivatedAbilities: msg("Activated abilities can't be activated"),
  keepsDamage: msg("Damage isn't removed"),
  convoke: msg("Convoke"),
  improvise: msg("Improvise"),
  delve: msg("Delve"),
  splitSecond: msg("Split second"),
  rebound: msg("Rebound"),
  riot: msg("Riot"),
  attacksDespiteDefender: msg("Attacks despite defender"),
};

/**
 * An engine text (`msg`, `cardRef`) in the chosen language: template and values from the catalogs, cards by their name
 * in that language.
 */
export function localizeText(text: string, faces: Record<string, CardFace>, lang: Lang): string {
  return localize(text, lang, (id) => (faces[id] ? faceName(faces[id], lang) : tr(lang, "this card")));
}

/** A value inserted as is in a text (a name already in the right language): never looked up in the catalogs. */
export const literal = (value: string) => cardRef(value);
/** Renders a `msg` text whose values are `literal`. */
const render = (text: string, lang: Lang) => localize(text, lang, (value) => value);

export function faceName(face: CardFace | undefined, lang: Lang): string {
  if (!face) return "?";
  if (face.defId === "face-down") return tr(lang, "Face-down card");
  if (face.isToken) return render(msg("{name} token", { name: literal(face.name) }), lang);
  return (lang === "fr" && face.fr?.name) || face.name;
}

export function faceText(face: CardFace, lang: Lang): string {
  return (lang === "fr" && face.fr?.text) || face.text;
}

export function faceType(face: CardFace, lang: Lang): string {
  // A hidden card's type line is an engine text ("Face-down card").
  if (face.defId === HIDDEN_CARD_ID) return textIn(lang, face.typeLine);
  return (lang === "fr" && face.fr?.typeLine) || face.typeLine;
}

/**
 * Image of a face: the custom art if the face asks for it (custom printing, token of a deck that uses some) and there is
 * one; otherwise Scryfall's (relayed if Scryfall is blocked, see images.ts).
 */
export function faceImage(face: CardFace, lang: Lang): string | undefined {
  const custom =
    face.customArt && face.defId !== HIDDEN_CARD_ID ? customImage(face.name, face.isToken, face.customArt) : undefined;
  if (custom) return custom;
  // Token: the image of a matching Scryfall token (data/tokens.json), otherwise the text frame.
  return imageUrl((lang === "fr" && face.fr?.image) || face.image || (face.isToken ? tokenImage(face) : undefined));
}

export interface LogLine {
  id: number;
  text: string;
  kind: "turn" | "me" | "opp" | "info" | "win" | "lose";
  /** Cards named in the line: their name can be hovered there (preview). */
  cards?: CardFace[];
}

let nextLine = 1;

/**
 * Turns the engine's events into readable log lines, in `lang`. Each sentence is one `msg` template (the French catalog
 * gives today's French sentences); the viewer's own actions have their own templates (French conjugation, "you").
 */
export function describeEvents(
  events: GameEvent[],
  view: GameView,
  faces: Record<string, CardFace>,
  lang: Lang,
  /** Previous view: lets the log name targets that died in the meantime. */
  previous?: GameView | null,
): LogLine[] {
  const me = view.viewer;
  /** A player at the start of a sentence, and as an object ("to you", "to Bob"). */
  const who = (p: string) => (p === me ? tr(lang, "You") : (view.players[p]?.name ?? tr(lang, "The opponent")));
  const whom = (p: string) => (p === me ? tr(lang, "you") : (view.players[p]?.name ?? tr(lang, "the opponent")));
  const kind = (p: string): LogLine["kind"] => (p === me ? "me" : "opp");
  // Cards cited by the current line (names that can be hovered in the log).
  let cited: CardFace[] = [];
  const cite = (f: CardFace | undefined) => {
    if (f && f.defId !== "face-down" && f.defId !== HIDDEN_CARD_ID && !cited.some((c) => c.defId === f.defId)) cited.push(f);
    return f;
  };
  const name = (defId?: string) => literal(faceName(cite(defId ? faces[defId] : undefined), lang));
  const names = (defIds: string[]) => literal(defIds.map((d) => faceName(cite(faces[d]), lang)).join(", "));
  const targetName = (id: string) => {
    if (view.players[id]) return whom(id);
    const o =
      view.battlefield.find((x) => x.id === id) ??
      previous?.battlefield.find((x) => x.id === id) ??
      view.stack.find((x) => x.id === id) ??
      previous?.stack.find((x) => x.id === id) ??
      Object.values(view.players)
        .flatMap((p) => p.graveyard)
        .find((x) => x.id === id);
    return o ? faceName(cite(faces[o.defId] ?? o), lang) : tr(lang, "a target");
  };
  const targets = (ids: string[]) => literal(ids.map(targetName).join(", "));
  const player = (p: string) => literal(who(p));
  const out: LogLine[] = [];
  const add = (text: string, k: LogLine["kind"]) => {
    out.push({ id: nextLine++, text: render(text, lang), kind: k, ...(cited.length ? { cards: cited } : {}) });
    cited = [];
  };
  // Damage to a player: the life loss that follows is the same one (already told by the damage line).
  let hurt: { player: string; amount: number } | null = null;
  for (const e of events) {
    cited = [];
    switch (e.type) {
      case "gameStart":
        add(e.startingPlayer === me ? msg("You start.") : msg("{player} starts.", { player: player(e.startingPlayer) }), "info");
        break;
      case "mulligan":
        add(
          e.player === me
            ? msg("You take a mulligan ({count}).", { count: e.count })
            : msg("{player} takes a mulligan ({count}).", { player: player(e.player), count: e.count }),
          kind(e.player),
        );
        break;
      case "keep":
        add(
          e.player === me
            ? msg("You keep {n} cards.", { n: e.handSize })
            : msg("{player} keeps {n} cards.", { player: player(e.player), n: e.handSize }),
          kind(e.player),
        );
        break;
      case "turnStart":
        add(
          e.player === me
            ? msg("Turn {n} — your turn", { n: e.turn })
            : msg("Turn {n} — {player}", { n: e.turn, player: player(e.player) }),
          "turn",
        );
        break;
      case "draw":
        if (view.turn.number === 0) break; // opening hands: no noise in the log
        if (e.player === me && e.defId) add(msg("You draw {card}.", { card: name(e.defId) }), "me");
        else if (e.player !== me) add(msg("{player} draws a card.", { player: player(e.player) }), "opp");
        break;
      case "monarch":
        add(
          e.player === me ? msg("You become the monarch.") : msg("{player} becomes the monarch.", { player: player(e.player) }),
          kind(e.player),
        );
        break;
      case "playLand":
        add(
          e.player === me
            ? msg("You play {card}.", { card: name(e.defId) })
            : msg("{player} plays {card}.", { player: player(e.player), card: name(e.defId) }),
          kind(e.player),
        );
        break;
      case "cast":
      case "activate": {
        const to = e.targets.length ? targets(e.targets) : null;
        const card = name(e.defId);
        const p = player(e.player);
        let text: string;
        if (e.type === "cast") {
          if (e.player === me)
            text = to ? msg("You cast {card} → {targets}.", { card, targets: to }) : msg("You cast {card}.", { card });
          else
            text = to
              ? msg("{player} casts {card} → {targets}.", { player: p, card, targets: to })
              : msg("{player} casts {card}.", { player: p, card });
        } else if (e.player === me)
          text = to ? msg("You activate {card} → {targets}.", { card, targets: to }) : msg("You activate {card}.", { card });
        else
          text = to
            ? msg("{player} activates {card} → {targets}.", { player: p, card, targets: to })
            : msg("{player} activates {card}.", { player: p, card });
        add(text, kind(e.player));
        break;
      }
      case "trigger": {
        const to = e.targets.length ? targets(e.targets) : null;
        const card = name(e.defId);
        add(
          to ? msg("Triggered ability: {card} → {targets}.", { card, targets: to }) : msg("Triggered ability: {card}.", { card }),
          kind(e.player),
        );
        break;
      }
      case "fizzle":
        add(msg("{card} doesn't resolve: illegal targets.", { card: name(e.defId) }), "info");
        break;
      case "copy":
        add(msg("{card} is copied.", { card: name(e.defId) }), kind(e.player));
        break;
      case "endTurn":
        add(msg("The turn ends."), "info");
        break;
      case "plotted":
        add(
          e.player === me
            ? msg("You plot {card}.", { card: name(e.defId) })
            : msg("{player} plots {card}.", { player: player(e.player), card: name(e.defId) }),
          kind(e.player),
        );
        break;
      case "foretold": {
        // An opponent's foretold card is hidden (exiled face down).
        const hidden = e.defId === HIDDEN_CARD_ID;
        const text =
          e.player === me
            ? hidden
              ? msg("You foretell a card.")
              : msg("You foretell {card}.", { card: name(e.defId) })
            : hidden
              ? msg("{player} foretells a card.", { player: player(e.player) })
              : msg("{player} foretells {card}.", { player: player(e.player), card: name(e.defId) });
        add(text, kind(e.player));
        break;
      }
      case "speed": {
        const max = e.speed >= 4;
        const text =
          e.player === me
            ? max
              ? msg("You reach speed {speed} (max).", { speed: e.speed })
              : msg("You reach speed {speed}.", { speed: e.speed })
            : max
              ? msg("{player} reaches speed {speed} (max).", { player: player(e.player), speed: e.speed })
              : msg("{player} reaches speed {speed}.", { player: player(e.player), speed: e.speed });
        add(text, kind(e.player));
        break;
      }
      case "turnControl": {
        const by = player(e.by);
        const of = literal(whom(e.player));
        let text: string;
        if (e.by === me)
          text = e.combatOnly
            ? msg("You control {player}'s next combat phase.", { player: of })
            : msg("You control {player}'s turn.", { player: of });
        else if (e.player === me)
          text = e.combatOnly
            ? msg("{controller} controls your next combat phase.", { controller: by })
            : msg("{controller} controls your turn.", { controller: by });
        else
          text = e.combatOnly
            ? msg("{controller} controls {player}'s next combat phase.", { controller: by, player: of })
            : msg("{controller} controls {player}'s turn.", { controller: by, player: of });
        add(text, "info");
        break;
      }
      case "attach":
        add(msg("{card} is attached to {host}.", { card: name(e.defId), host: name(e.toDefId) }), "info");
        break;
      case "countered":
        add(msg("{card} is countered by {source}.", { card: name(e.defId), source: name(e.by) }), "info");
        break;
      case "damage":
        add(
          msg("{source} deals {n} damage to {target}.", {
            source: name(e.sourceDefId),
            n: e.amount,
            target: e.targetDefId ? name(e.targetDefId) : literal(whom(e.target)),
          }),
          "info",
        );
        if (!e.targetDefId) hurt = { player: e.target, amount: e.amount };
        break;
      case "life":
        if (e.delta > 0)
          add(
            e.player === me
              ? msg("You gain {n} life ({life}).", { n: e.delta, life: e.life })
              : msg("{player} gains {n} life ({life}).", { player: player(e.player), n: e.delta, life: e.life }),
            kind(e.player),
          );
        else if (e.delta < 0) {
          if (hurt && hurt.player === e.player && hurt.amount === -e.delta) hurt = null;
          else
            add(
              e.player === me
                ? msg("You lose {n} life ({life}).", { n: -e.delta, life: e.life })
                : msg("{player} loses {n} life ({life}).", { player: player(e.player), n: -e.delta, life: e.life }),
              kind(e.player),
            );
        }
        break;
      case "dies": {
        // A replacement can change the destination: exiled instead of dying, shuffled into the library.
        const card = name(e.defId);
        add(
          e.to === "exile"
            ? msg("{card} is exiled instead.", { card })
            : e.to === "library"
              ? msg("{card} is shuffled into its owner's library.", { card })
              : msg("{card} goes to the graveyard.", { card }),
          "info",
        );
        break;
      }
      case "token":
        add(
          e.controller === me
            ? msg("You create a {token}.", { token: name(e.defId) })
            : msg("{player} creates a {token}.", { player: player(e.controller), token: name(e.defId) }),
          kind(e.controller),
        );
        break;
      case "transform":
        add(msg("Transform: {card}.", { card: name(e.defId) }), "info");
        break;
      case "attack": {
        const cards = names(e.attackers.map((a) => a.defId));
        add(
          e.player === me
            ? msg("You attack with {cards}.", { cards })
            : msg("{player} attacks with {cards}.", { player: player(e.player), cards }),
          kind(e.player),
        );
        break;
      }
      case "block":
        for (const b of e.blocks)
          add(
            msg("{blocker} blocks {attacker}.", { blocker: name(b.blockerDefId), attacker: name(b.attackerDefId) }),
            kind(e.player),
          );
        break;
      case "discard":
        add(
          e.player === me
            ? msg("You discard {cards}.", { cards: names(e.defIds) })
            : msg("{player} discards {cards}.", { player: player(e.player), cards: names(e.defIds) }),
          kind(e.player),
        );
        break;
      case "reveal":
        if (e.defIds.length)
          add(
            e.look
              ? msg("You look at {cards}.", { cards: names(e.defIds) })
              : e.player === me
                ? msg("You reveal {cards}.", { cards: names(e.defIds) })
                : msg("{player} reveals {cards}.", { player: player(e.player), cards: names(e.defIds) }),
            kind(e.player),
          );
        break;
      case "rad": {
        const n = Math.abs(e.amount);
        const args = { player: player(e.player), n, total: e.total };
        const mine = e.player === me;
        let text: string;
        if (e.amount > 0)
          text = mine
            ? n > 1
              ? msg("You get {n} rad counters ({total}).", args)
              : msg("You get {n} rad counter ({total}).", args)
            : n > 1
              ? msg("{player} gets {n} rad counters ({total}).", args)
              : msg("{player} gets {n} rad counter ({total}).", args);
        else
          text = mine
            ? n > 1
              ? msg("Radiation: You lose {n} rad counters ({total}).", args)
              : msg("Radiation: You lose {n} rad counter ({total}).", args)
            : n > 1
              ? msg("Radiation: {player} loses {n} rad counters ({total}).", args)
              : msg("Radiation: {player} loses {n} rad counter ({total}).", args);
        add(text, kind(e.player));
        break;
      }
      case "poison": {
        const args = { player: player(e.player), n: e.amount, total: e.total };
        add(
          e.player === me
            ? e.amount > 1
              ? msg("You get {n} poison counters ({total}).", args)
              : msg("You get {n} poison counter ({total}).", args)
            : e.amount > 1
              ? msg("{player} gets {n} poison counters ({total}).", args)
              : msg("{player} gets {n} poison counter ({total}).", args),
          kind(e.player),
        );
        break;
      }
      case "dieRoll":
        add(
          e.player === me
            ? msg("You roll {result} on a {sides}-sided die.", { result: e.result, sides: e.sides })
            : msg("{player} rolls {result} on a {sides}-sided die.", {
                player: player(e.player),
                result: e.result,
                sides: e.sides,
              }),
          kind(e.player),
        );
        break;
      case "lose": {
        const reason = LOSS_REASON[e.reason];
        const p = player(e.player);
        add(
          e.player === me
            ? reason
              ? msg("You lose ({reason}).", { reason })
              : msg("You lose.")
            : reason
              ? msg("{player} loses ({reason}).", { player: p, reason })
              : msg("{player} loses.", { player: p }),
          kind(e.player),
        );
        break;
      }
      case "moved": {
        // 702.26: phasing out and phasing in are not zone changes.
        if (e.to === "phasedOut" || e.from === "phasedOut") {
          const card = name(e.defId);
          add(e.to === "phasedOut" ? msg("{card} phases out.", { card }) : msg("{card} phases in.", { card }), "info");
          break;
        }
        if (!e.defId) {
          // Another player's hidden card (search into the hand, card put back into the library…).
          const p = player(e.owner);
          add(
            e.to === "hand"
              ? msg("{player} puts a card into their hand.", { player: p })
              : msg("{player} puts a card into their library.", { player: p }),
            "opp",
          );
          break;
        }
        const card = name(e.defId);
        const where: Record<string, string> = {
          hand: msg("{card} returns to its owner's hand.", { card }),
          exile: msg("{card} is exiled.", { card }),
          graveyard: msg("{card} goes to the graveyard.", { card }),
          battlefield: msg("{card} enters the battlefield.", { card }),
          library: msg("{card} is put into its owner's library.", { card }),
          command: msg("{card} returns to the command zone.", { card }),
        };
        add(where[e.to] ?? msg("{card} goes to {zone}.", { card, zone: literal(e.to) }), "info");
        break;
      }
      case "scry":
        add(
          e.player === me
            ? msg("You scry: {top} on top, {bottom} on the bottom.", { top: e.top, bottom: e.bottom })
            : msg("{player} scries: {top} on top, {bottom} on the bottom.", {
                player: player(e.player),
                top: e.top,
                bottom: e.bottom,
              }),
          kind(e.player),
        );
        break;
      case "capReached":
        add(msg("Safety cap reached ({cap}): the result is approximated.", { cap: CAPS[e.cap] }), "info");
        break;
      case "gameOver":
        add(
          e.winner === me ? msg("Victory!") : e.winner ? msg("Defeat.") : msg("The game is a draw."),
          e.winner === me ? "win" : "lose",
        );
        break;
      default:
        break;
    }
  }
  return out;
}
