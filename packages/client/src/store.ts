/**
 * Interface state and interaction logic (casting spells, targeting, attacking, blocking).
 * The engine stays the only source of truth: only decisions taken from the legal options are sent.
 *
 * Texts: the store's own messages (toasts, notices) are `msg` texts, like the engine's and the server's, and are
 * translated at display (`App.tsx`, `useLocalize`); texts it builds for immediate display (turn banner) use `t()`.
 */

import type { AiLevel } from "@mtgx/ai";
import { CARDS, card, type DeckEntries, sideboardInGame, sideboardSwapError } from "@mtgx/cards";
import {
  type ActionOption,
  type AutopilotSettings,
  autoTarget,
  type CardDef,
  type CardFace,
  type ChoiceValue,
  type CostPick,
  type CostSlot,
  DEFAULT_AUTOPILOT,
  type Decision,
  type Format,
  type GameEvent,
  type GameRecord,
  type GameView,
  type ManaType,
  msg,
  type ObjectView,
  pickHasChoice,
  RULES_VERSION,
  type StackItemView,
  type Step,
  type TargetOption,
} from "@mtgx/engine";
import {
  type Clock,
  type MatchInfo,
  PROTOCOL_VERSION,
  type RoomInfo,
  type Seat,
  type ServerMessage,
} from "@mtgx/server/protocol";
import { create } from "zustand";
import { soundsFor } from "./audio/eventSounds";
import { playSound, preloadSounds } from "./audio/sfx";
import { findObjectEl } from "./board/layout";
import { type BoardThemeChoice, type Effects, loadBoardTheme, loadEffects, saveBoardTheme, saveEffects } from "./boardThemes";
import { fastMode } from "./fast";
import { describeEvents, type Lang, type LogLine, literal, localizeText } from "./i18n";
import { boardPick, togglePick } from "./prompts/boardChoice";
import type { FromWorker, Sandbox, ScenarioSpec } from "./protocol";
import { clearSavedGame, loadSavedGame, SaveWriter } from "./savedGame";
import { scenarioCards } from "./scenario";
import { LocalSession, RemoteSession, ReplaySession, type Session } from "./session";
import { setTextLang, t, textIn } from "./translate";

/** Definitions of the decks' cards (and of the sandbox or the scenario), sent to the game worker. */
function defsFor(decks: DeckEntries[], sandbox?: Sandbox, scenario?: ScenarioSpec): Record<string, CardDef> {
  const names = new Set<string>(decks.flatMap((d) => d.map(([, name]) => name)));
  for (const n of scenario ? scenarioCards(scenario) : []) names.add(n);
  for (const side of Object.values(sandbox ?? {})) {
    for (const n of [...(side.cards ?? []), ...(side.hand ?? []), ...(side.graveyard ?? [])]) names.add(n);
    for (const [n] of side.attach ?? []) names.add(n);
  }
  return Object.fromEntries([...names].map((n) => [n, card(n)]));
}

// ---------------------------------------------------------------------------
// Tutorial: decision guard (strict guidance) and update observer, installed by tutorial/store.ts
// ---------------------------------------------------------------------------

/** What the player asks for: a decision, or "end turn" (a setting, not a decision). */
export type PlayerIntent = Decision | { type: "endTurn" };

/** Returns a reminder (a text, translated at display) if the intent is refused, null if it is allowed. */
type DecisionGuard = (intent: PlayerIntent, view: GameView) => string | null;
let guard: DecisionGuard | null = null;
let observer: ((view: GameView, events: GameEvent[]) => void) | null = null;

export function setDecisionGuard(g: DecisionGuard | null): void {
  guard = g;
}

export function setUpdateObserver(o: ((view: GameView, events: GameEvent[]) => void) | null): void {
  observer = o;
}

/**
 * A cost slot once the targets are known: Urgent Necropsy's evidence total is the mana value of the chosen targets
 * (`minTotal.fromTargets`), with the engine's suggestion for that total.
 */
function pickForTargets(p: CostPick, targets: Record<string, string[]>): CostPick {
  const m = p.minTotal;
  if (!m?.fromTargets) return p;
  const from = m.fromTargets;
  const n = Object.values(targets)
    .flat()
    .reduce((t, id) => t + (from[id] ?? 0), 0);
  return { ...p, minTotal: { n, values: m.values }, suggested: evidenceSuggestion(p.options, m.values, n) };
}

/** The engine's choice of evidence (`pickEvidence`): the cheapest card that reaches N, otherwise the most expensive. */
function evidenceSuggestion(options: string[], values: Record<string, number>, n: number): string[] {
  const mv = (id: string) => values[id] ?? 0;
  const left = [...options].sort((a, b) => mv(a) - mv(b));
  const out: string[] = [];
  let total = 0;
  while (total < n && left.length) {
    const i = left.findIndex((id) => total + mv(id) >= n);
    const id = (i >= 0 ? left.splice(i, 1) : left.splice(left.length - 1, 1))[0] as string;
    out.push(id);
    total += mv(id);
  }
  return total >= n ? out : [];
}

/** Intent refused by the tutorial: the player is told and the casting in progress is abandoned. */
function refused(intent: PlayerIntent): boolean {
  const view = useGame.getState().view;
  const reason = view && guard ? guard(intent, view) : null;
  if (!reason) return false;
  playSound("error");
  useGame.getState().notify(reason);
  useGame.setState({ casting: null, manaPick: null, abilityMenu: null, selectedBlocker: null, legendConfirm: null });
  return true;
}

type CastOption = Extract<ActionOption, { type: "cast" }>;
type ActivateOption = Extract<ActionOption, { type: "activate" }>;
export type PlayableOption = CastOption | ActivateOption;

export interface Casting {
  option: PlayableOption;
  sourceId: string;
  mode: number | null;
  x: number | null;
  kicked: boolean | null;
  /** Chosen additional costs (discarded cards, sacrificed permanents). */
  discard: string[] | null;
  sacrifice: string[] | null;
  /** Permanents to tap for the cost (station, crew). */
  tap: string[] | null;
  /** Materials of a craft. */
  materials: string[] | null;
  /** Web-slinging: the tapped creature returned to hand. */
  bounce: string[] | null;
  /** Objects paid as a cost, chosen by slot (blight, evidence, exile from the graveyard…). */
  picks: Partial<Record<CostSlot, string[]>>;
  /** Slots already handled without a choice (automatic payment). */
  skippedPicks?: Partial<Record<CostSlot, boolean>>;
  /** How to pay for the spell: normal cost, without paying (Omniscience, Etali), alternative cost. */
  payMode: "normal" | "free" | "alt" | null;
  /** Color of the hybrid mana ("if {U}{U} was spent", Deceit); "auto": the automatic payment decides. */
  hybrid?: ManaType | "auto";
  /** Phyrexian symbols paid with life (PLAN-L L7); "auto": the mana pays first. */
  phyrexian?: number | "auto";
  /** Full control: the sources tapped by hand have been confirmed ("mana" stage, PLAN-L L7). */
  manaDone?: boolean;
  targets: Record<string, string[]>;
  stage:
    | "mode"
    | "pay"
    | "x"
    | "kicker"
    | "hybrid"
    | "phyrexian"
    | "mana"
    | "target"
    | "discard"
    | "sacrifice"
    | "tap"
    | "materials"
    | "bounce"
    | "pick";
  /** "pick" stage: the cost slot to choose. */
  pick?: CostPick;
  spec: TargetOption | null;
  /** Targets already chosen for `spec` when it accepts several. */
  picked?: string[];
}

/** Short-lived visual effect: damage/heal number, silhouette of a dying creature. */
export interface Fx {
  id: number;
  kind: "damage" | "heal" | "death" | "speed";
  /** Object or player aimed at (data-oid). */
  target: string;
  amount: number;
  /** Offset (s) to stagger the effects of one batch. */
  delay: number;
  /** Position captured before the screen update (useful if the object disappears). */
  rect: { x: number; y: number; w: number; h: number } | null;
}

export interface Hover {
  face: CardFace;
  obj?: ObjectView;
}

/** Best-of-three match against the AI (the server keeps that of an online match). */
export interface LocalMatch {
  bestOf: 3;
  wins: Record<string, number>;
  game: number;
  /** "p1", "p2", "draw" (a drawn match; "nul" in matches saved before PLAN-I), or null while the match goes on. */
  winner: string | null;
  /** Deck and sideboard of the current game, and those of the start of the match (a swap keeps the same cards). */
  deck: { main: DeckEntries; sideboard: DeckEntries };
  original: { main: DeckEntries; sideboard: DeckEntries };
  aiDeck: DeckEntries;
  /** The AI's sideboard (it keeps it from one game to the next). */
  aiSide?: DeckEntries;
  aiLevel?: AiLevel;
  /** Format of the match (absent: Standard): the sideboard swap must stay legal in it. */
  format?: Format;
}

/** Online game (room on the server). */
export interface OnlineState {
  status: "connecting" | RoomInfo["status"];
  /** Match (BO1 or BO3) and the player's current deck (starting point of the sideboard between two games). */
  match?: MatchInfo;
  deck?: RoomInfo["deck"];
  code: string | null;
  seat: Seat | null;
  players: RoomInfo["players"];
  /** Opponent disconnected: deadline for their return (Date.now()). */
  opponent: { connected: boolean; deadline: number | null };
  /** Timer of the current decision; `deadline` in Date.now(). */
  clock: (Clock & { deadline: number }) | null;
  /** Server error, already translated into the interface language. */
  error: string | null;
  /** Connection to the server lost: reconnecting. */
  reconnecting: boolean;
}

interface Store {
  screen: "lobby" | "decks" | "game" | "online" | "tutorial";
  /** Tutorial game: going back to the menu leads to the tutorial menu. */
  tutorialGame: boolean;
  /** Deck open in the deck builder. */
  editingDeck: string | null;
  /** Decklist received by a link (`#deck=…`, decks/share.ts): the deck editor offers to import it. */
  sharedDeck: string | null;
  session: Session | null;
  online: OnlineState | null;
  view: GameView | null;
  faces: Record<string, CardFace>;
  log: LogLine[];
  /** Short message (`msg`, engine or server text: translated at display). */
  toast: { text: string; id: number } | null;
  /** Important message to acknowledge (game that cannot be resumed, online game lost); texts translated at display. */
  notice: { title: string; text: string } | null;
  /** Resume of a game when the page opens (local or online), waiting for its first state. */
  resuming: boolean;
  settings: AutopilotSettings;
  lang: Lang;
  casting: Casting | null;
  /**
   * Full control: a mana ability whose cost taps another permanent (Gene Pollinator), waiting for the player to choose
   * it (`costTap`, PLAN-M M6).
   */
  manaPick: { decision: Extract<Decision, { type: "tapForMana" }>; pick: CostPick } | null;
  /** `unavailable`: activated abilities of the permanent that cannot be activated right now (shown greyed out). */
  abilityMenu: {
    sourceId: string;
    options: ActionOption[];
    unavailable?: { label: string; cost: string }[];
  } | null;
  attackers: string[];
  /** Defender chosen for each attacker (multiplayer). */
  attackTargets: Record<string, string>;
  /** Attacker "aiming" (several possible defenders): its target, player or planeswalker, is clicked next. */
  aimingAttacker: string | null;
  blocks: Record<string, string>;
  selectedBlocker: string | null;
  selection: string[];
  /** Last card hovered (kept after the pointer leaves: the tutorial reads it). */
  hover: Hover | null;
  /** The pointer is still on the hovered card: the floating preview shows it (PLAN-V). */
  hoverLive: boolean;
  /** Floating preview kept open without hovering (tutorial step that shows the preview). */
  previewHold: boolean;
  /** Touch screen: card enlarged in an overlay (long press). */
  peek: Hover | null;
  /** Drawer of the log and settings (☰ button). */
  drawerOpen: boolean;
  graveyardOpen: string | null;
  /** Exile being viewed (cards owned by this player). */
  exileOpen: string | null;
  fx: Fx[];
  turnBanner: { id: number; text: string; mine: boolean } | null;
  spotlight: { id: number; face: CardFace; who: string } | null;
  /**
   * Stack item that resolves (or is countered, or has no legal target left), shown before its effect applies; the game
   * moves on only afterwards (see `playbackTimes`).
   */
  resolving: { id: number; item: StackItemView; outcome: "resolve" | "fizzle" | "countered" } | null;
  /** Pace of the effects (how long each resolution is shown). */
  pace: Pace;
  setPace(pace: Pace): void;
  /** Board texture (`boardThemes.ts`), kept in `localStorage`. */
  boardTheme: BoardThemeChoice;
  setBoardTheme(choice: BoardThemeChoice): void;
  /** Graphics (`boardThemes.ts`): 3D board, animated table and tilted battlefield, or light. */
  effects: Effects;
  setEffects(effects: Effects): void;
  /** The 3D board failed (WebGL context lost): the DOM board for the rest of the session (PLAN-W). */
  board3dFailed: boolean;
  failBoard3d(): void;
  /** The quality the 3D board draws at (shown in the Graphics setting; the governor may step it down). */
  board3dQuality: "high" | "medium" | "low" | null;
  setBoard3dQuality(q: "high" | "medium" | "low" | null): void;

  startGame(
    playerDeck: DeckEntries,
    aiDecks: DeckEntries[],
    sandbox?: Sandbox,
    aiLevel?: AiLevel,
    match?: { bestOf: 3; sideboard: DeckEntries; format?: Format },
    /** Commander (PLAN-E): the player's commander, then each AI's. */
    commander?: { player: DeckEntries; ai: DeckEntries[] },
    /** Sideboards of the player and of each AI, outside the game (North Wind Avatar); a match uses its own. */
    sides?: { player?: DeckEntries; ai?: DeckEntries[] },
  ): void;
  /** Match against the AI in progress (BO3). */
  localMatch: LocalMatch | null;
  /** Next game of a match: chosen deck and sideboard (against the AI: restart; online: sent to the server). */
  nextGame(main: DeckEntries, sideboard: DeckEntries): void;
  /** Tutorial: staged game. */
  startScenario(scenario: ScenarioSpec): void;
  openTutorial(): void;
  openOnline(): void;
  createRoom(
    name: string,
    deck: DeckEntries,
    opts?: {
      sideboard?: DeckEntries;
      bestOf?: 1 | 3;
      format?: Format;
      /** Number of players of the room (2 by default). */
      players?: 2 | 3 | 4;
      /** Commander: the commander. */
      commander?: DeckEntries;
      /** Seats held by the server's AI and its level (PLAN-E, E14). */
      ai?: { count: number; level: AiLevel };
    },
  ): void;
  joinRoom(code: string, name: string, deck: DeckEntries, sideboard?: DeckEntries, commander?: DeckEntries): void;
  /** Resumes this tab's online game (reconnection token), on load or after a disconnection. */
  resumeOnline(): void;
  /** Page opening: resumes this page's online game, otherwise the saved local game. */
  resumeAtStartup(): void;
  leaveRoom(): void;
  rematch(): void;
  receiveOnline(msg: ServerMessage): void;
  backToLobby(): void;
  openDeckBuilder(deckId?: string | null): void;
  receive(msg: FromWorker): void;
  /** Applies a game update (view, log, sounds, effects). */
  applyUpdate(msg: Extract<FromWorker, { type: "update" }>): void;
  /** Replay in progress: position, point of view, autoplay. */
  replay: {
    index: number;
    total: number;
    viewer: string;
    players: { id: string; name: string }[];
    playing: boolean;
    /** Replay stopped before the end, or recorded with another version of the rules (`msg` text). */
    warning: string | null;
  } | null;
  /** Downloads the game record (against the AI: at any time; online: once it is over). */
  exportGame(): void;
  /** Opens a game record in the viewer. */
  openReplay(record: GameRecord): void;
  replaySeek(index: number): void;
  replayViewer(player: string): void;
  replayPlay(on: boolean): void;
  decide(d: Decision): void;
  /** Shows a short message: a `msg` text, an engine or server text, translated at display. */
  notify(text: string): void;
  showNotice(title: string, text: string): void;
  dismissNotice(): void;
  /** Resumes the saved local game (page reopened); `false` if there is none. */
  resumeLocal(): boolean;
  /** Pass priority; with floating mana that would be lost, a first press only warns. */
  passPriority(): void;
  /**
   * "Resolve all" (as on MTGA): passes priority until the stack is empty; stops if an opponent adds a spell or an
   * ability, or as soon as the player plays something.
   */
  resolveAll(): void;
  /** Decision for which the floating mana warning was already given. */
  floatWarned: string | null;
  clickHandCard(id: string): void;
  clickPermanent(id: string): void;
  clickPlayer(id: string): void;
  beginCasting(option: PlayableOption, sourceId: string): void;
  /** Casting a legendary of which you already control a copy: waiting for confirmation. */
  legendConfirm: { option: PlayableOption; sourceId: string; name: string } | null;
  /** Land played with an "as it enters, choose…" question (Cavern of Souls): the expected answer. */
  landChoice: Extract<ActionOption, { type: "playLand" }> | null;
  /** Plays a land (the "as it enters" question is asked first, if it has one). */
  playLand(option: Extract<ActionOption, { type: "playLand" }>): void;
  /** The answer to the land's question (`null`: cancel, the land isn't played). */
  answerLandChoice(values: ChoiceValue[] | null): void;
  confirmLegend(): void;
  cancelLegend(): void;
  chooseMode(index: number): void;
  chooseX(x: number): void;
  chooseKicker(kicked: boolean): void;
  chooseHybrid(color: ManaType | "auto"): void;
  /** Number of Phyrexian symbols paid with life ("auto": the mana first). */
  choosePhyrexian(life: number | "auto"): void;
  /** "mana" stage (full control): the sources tapped by hand are enough, the automatic payment completes the rest. */
  confirmMana(): void;
  chooseNoTarget(): void;
  choosePayMode(mode: "normal" | "free" | "alt"): void;
  /** Chooses a target (or removes it, for a "target" word that accepts several). */
  pickTarget(id: string): void;
  /** Confirms the targets already chosen ("up to N"). */
  confirmTargets(): void;
  chooseAdditional(kind: "discard" | "sacrifice" | "tap" | "materials" | "bounce", ids: string[]): void;
  /** Objects chosen for a cost (`CostPick`). */
  choosePick(slot: CostSlot, ids: string[] | undefined): void;
  /**
   * Taps a source for its mana: in full control, a source whose cost taps another permanent asks which one first
   * (`manaPick`); otherwise the automatic choice.
   */
  tapMana(option: Extract<ActionOption, { type: "tapForMana" }>, color?: ManaType, colors?: ManaType[]): void;
  /** The other permanent tapped for the mana (`manaPick`); `undefined`: cancel. */
  chooseManaPick(ids: string[] | undefined): void;
  cancel(): void;
  toggleAttacker(id: string): void;
  /** Target chosen for the aiming attacker. */
  aimAttackAt(defender: string): void;
  allAttack(): void;
  /** "End turn": soft pass (stops if an opponent acts), or hard (`hard`). */
  endTurn(hard?: boolean): void;
  toggleStop(side: "own" | "opponent", step: Step): void;
  setFullControl(on: boolean): void;
  setHoldPriority(on: boolean): void;
  /** "Always answer this way": the answer kept for a trigger's "may" question (`ChoiceRequest.remember`). */
  keepAnswer(key: string, answer: 0 | 1): void;
  /** Forgets the kept answers. */
  clearAnswers(): void;
  /** Autopilot settings imposed by the tutorial (stops). */
  applySettings(partial: Partial<AutopilotSettings>): void;
  setLang(lang: Lang): void;
  setHover(h: Hover | null): void;
  /** The pointer left the hovered card: the floating preview closes (`hover` stays). */
  endHover(): void;
  setPreviewHold(hold: boolean): void;
  setPeek(h: Hover | null): void;
  setDrawerOpen(open: boolean): void;
  toggleSelection(id: string): void;
  openGraveyard(player: string | null): void;
  openExile(player: string | null): void;
}

/**
 * Name of the duplicated legendary if this spell is cast: a legendary permanent with the same name that you already
 * control (otherwise null). Only for a real cast of the card (not an ability, nor face down).
 */
function legendDuplicate(view: GameView | null, option: PlayableOption, sourceId: string): string | null {
  if (!view || option.type !== "cast" || option.faceDown) return null;
  const card = [...view.hand, ...view.playableElsewhere, ...(view.players[view.viewer]?.graveyard ?? [])].find(
    (c) => c.id === sourceId,
  );
  if (!card) return null;
  const name = option.faceName ?? card.name;
  const typeLine = option.faceName ? (card.otherFaces?.find((f) => f?.name === option.faceName)?.typeLine ?? "") : card.typeLine;
  if (!/\bLegendary\b/.test(typeLine)) return null;
  const mine = view.battlefield.some((o) => o.controller === view.viewer && o.name === name && /\bLegendary\b/.test(o.typeLine));
  return mine ? name : null;
}

/** An update as it is applied: its events, with the views before and after (the 3D board's effects, PLAN-W). */
export interface AppliedUpdate {
  events: Extract<FromWorker, { type: "update" }>["events"];
  view: GameView;
  prev: GameView | null;
  faces: Extract<FromWorker, { type: "update" }>["faces"];
}
const updateListeners = new Set<(u: AppliedUpdate) => void>();

/** Called at each update, before the store changes (the cards still where they were); returns the unsubscription. */
export function subscribeUpdates(listener: (u: AppliedUpdate) => void): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

export function myActions(view: GameView | null): ActionOption[] {
  const p = view?.pending;
  return p?.kind === "priority" && p.player === view?.viewer ? (p.actions ?? []) : [];
}

function pendingKey(v: GameView | null): string {
  const p = v?.pending;
  if (!v || !p) return "none";
  // Two successive choices of the same resolution: the question itself tells them apart.
  const req =
    p.kind === "choice" && p.request
      ? `:${p.request.prompt}:${JSON.stringify(p.request.type === "pick" ? p.request.options : p.request.type === "name" ? [p.request.of, ...p.request.featured] : [])}`
      : "";
  return `${p.kind}:${p.player}:${v.turn.number}:${v.turn.step}:${v.stack.length}${req}`;
}

function targetSpecs(c: Casting): TargetOption[] {
  if (c.option.type === "cast") return c.option.modes.find((m) => m.index === c.mode)?.targets ?? [];
  return c.option.targets;
}

/** The cast or activation has mana to pay (a mana symbol in its cost), as far as the view tells. */
function paysMana(view: GameView | null, c: Casting): boolean {
  const symbol = /\{(?:[1-9]\d*|X|[WUBRGC](?:\/[WUBRGP])?|2\/[WUBRG])\}/;
  if (!view) return false;
  if (c.option.type === "activate") {
    const ability = c.option.ability;
    const o = view.battlefield.find((x) => x.id === c.sourceId);
    return symbol.test(o?.activated?.find((a) => a.index === ability)?.cost ?? "");
  }
  // Alternative cost: its own mana, read from its label (Force of Will, Daze: none; emerge: its cost).
  if (c.payMode === "alt") return symbol.test(c.option.altLabel ?? "");
  const card = c.option.card;
  const o = [...view.hand, ...view.playableElsewhere, ...view.battlefield].find((x) => x.id === card);
  return !!o && symbol.test(o.castCost?.text ?? o.manaCost);
}

function buildDecision(c: Casting): Decision {
  if (c.option.type === "cast") {
    return {
      type: "cast",
      card: c.option.card,
      face: c.option.face,
      faceDown: c.option.faceDown,
      warp: c.option.warp,
      mode: c.mode ?? 0,
      targets: c.targets,
      x: c.x ?? undefined,
      kicked: c.kicked ?? false,
      discard: c.discard ?? undefined,
      sacrifice: c.sacrifice ?? undefined,
      tap: c.tap ?? undefined,
      bounce: c.bounce ?? undefined,
      free: c.payMode === "free" && !c.option.free ? true : undefined,
      alternative: c.payMode === "alt" ? true : undefined,
      ...(c.hybrid && c.hybrid !== "auto" ? { hybridAs: c.hybrid } : {}),
      ...(typeof c.phyrexian === "number" ? { phyrexianLife: c.phyrexian } : {}),
      ...(Object.keys(c.picks).length ? { picks: c.picks } : {}),
    };
  }
  return {
    type: "activate",
    source: c.option.source,
    ability: c.option.ability,
    targets: c.targets,
    x: c.x ?? undefined,
    discard: c.discard ?? undefined,
    sacrifice: c.sacrifice ?? undefined,
    tap: c.tap ?? undefined,
    materials: c.materials ?? undefined,
    ...(typeof c.phyrexian === "number" ? { phyrexianLife: c.phyrexian } : {}),
    ...(Object.keys(c.picks).length ? { picks: c.picks } : {}),
  };
}

let toastId = 0;
let fxId = 0;

/** Position of a board element (before it disappears from the screen). */
function rectOf(id: string): Fx["rect"] {
  const el = findObjectEl(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Turns the events of an update into staggered visual effects. */
function playEffects(view: GameView, events: GameEvent[], faces: Record<string, CardFace>): void {
  const store = useGame;
  const fresh: Fx[] = [];
  let step = 0;
  const push = (kind: Fx["kind"], target: string, amount: number) => {
    fresh.push({ id: ++fxId, kind, target, amount, delay: Math.min(step * 0.22, 2.2), rect: rectOf(target) });
    step += 1;
  };
  let banner: Store["turnBanner"] = null;
  let spotlight: Store["spotlight"] = null;
  for (const e of events) {
    if (e.type === "damage" && !e.targetDefId && !view.players[e.target]) continue;
    if (e.type === "damage" && e.targetDefId) push("damage", e.target, e.amount);
    else if (e.type === "life") push(e.delta < 0 ? "damage" : "heal", e.player, Math.abs(e.delta));
    else if (e.type === "dies") push("death", e.objectId, 0);
    else if (e.type === "speed") {
      // 702.179: speed started, increased or reduced; shown to every player.
      push("speed", e.player, e.speed);
      if (e.speed >= 4) {
        const mine = e.player === view.viewer;
        banner = {
          id: ++fxId,
          mine,
          text: mine
            ? t("⚡ Max speed")
            : t("⚡ Max speed: {player}", { player: literal(view.players[e.player]?.name ?? t("the opponent")) }),
        };
      }
    } else if (e.type === "turnStart") {
      const mine = e.player === view.viewer;
      // Replay: no "Your turn to play" (nobody plays), the active player's name.
      const replaying = !!store.getState().replay;
      banner = {
        id: ++fxId,
        mine,
        text:
          mine && !replaying
            ? t("Your turn to play")
            : t("{player}'s turn", { player: literal(view.players[e.player]?.name ?? t("the opponent")) }),
      };
    } else if ((e.type === "cast" || e.type === "activate" || e.type === "trigger") && e.player !== view.viewer) {
      // The spell or the ability on the stack shows the art chosen by the opponent's deck (printing of a reprint,
      // custom art).
      const kind = e.type === "cast" ? "spell" : "ability";
      const onStack = view.stack.find((i) => i.defId === e.defId && i.controller === e.player && i.kind === kind);
      const face = onStack ?? faces[e.defId];
      if (face) spotlight = { id: ++fxId, face, who: view.players[e.player]?.name ?? t("The opponent") };
    }
  }
  if (!fresh.length && !banner && !spotlight) return;
  store.setState((s) => ({
    fx: [...s.fx, ...fresh],
    ...(banner ? { turnBanner: banner } : {}),
    ...(spotlight ? { spotlight } : {}),
  }));
  const ids = new Set(fresh.map((f) => f.id));
  const longest = fresh.reduce((m, f) => Math.max(m, f.delay), 0);
  // The longest effect (speed) lasts 2 s.
  setTimeout(() => store.setState((s) => ({ fx: s.fx.filter((f) => !ids.has(f.id)) })), (longest + 2.4) * 1000);
  if (banner) {
    const id = banner.id;
    setTimeout(() => store.getState().turnBanner?.id === id && store.setState({ turnBanner: null }), 1400);
  }
  if (spotlight) {
    const id = spotlight.id;
    setTimeout(() => store.getState().spotlight?.id === id && store.setState({ spotlight: null }), 1500);
  }
}

// ---------------------------------------------------------------------------
// Online play: reconnection token and nickname (kept: a reopened page resumes its game)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "planecircle.online";
const NAME_KEY = "planecircle.name";

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Game record downloaded as a JSON file ("planecircle-game-2026-09-29-1432.json", file name in the interface language). */
function downloadRecord(record: GameRecord): void {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = t("planecircle-game-{stamp}.json", { stamp: literal(stamp) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Replay autoplay: one step every 700 ms. */
let replayTimer: ReturnType<typeof setInterval> | null = null;

/** Save of the local game in progress (null: nothing to save: tutorial, sandbox, game left). */
let saver: SaveWriter | null = null;

/** Stops saving and erases the saved game (game left or replaced). */
function stopSaving(): void {
  saver?.stop();
  saver = null;
  clearSavedGame();
}

/** Writes the save of the local game at once (page closed). */
export function flushSave(): void {
  saver?.flush();
}

function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: no automatic reconnection
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // setting not kept
  }
}

const EMPTY_ONLINE: OnlineState = {
  status: "connecting",
  code: null,
  seat: null,
  players: [],
  opponent: { connected: true, deadline: null },
  clock: null,
  error: null,
  reconnecting: false,
};

/** Versions of this client, sent to the game server (an outdated client is refused). */
const VERSION = { protocol: PROTOCOL_VERSION, rules: RULES_VERSION };

/**
 * The online game is lost for good (room closed, game over and deleted, server unreachable): message to acknowledge
 * (`msg` texts), then back to the home screen. `keepToken`: the game still exists, open in another tab.
 */

/**
 * A player name written by the server as a text (online AI seats: `msg("AI {n} ({level})")`) in the interface language;
 * a nickname (no marker) stays as it is.
 */
function playerName(name: string, lang: Lang): string {
  return name.includes("⟨") ? textIn(lang, name) : name;
}

/** The view with its players' names in the interface language (see `playerName`); the same object when none changes. */
function withPlayerNames(view: GameView, lang: Lang): GameView {
  if (!Object.values(view.players).some((p) => p.name.includes("⟨"))) return view;
  const players = Object.fromEntries(
    Object.entries(view.players).map(([id, p]) => [id, { ...p, name: playerName(p.name, lang) }]),
  );
  return { ...view, players };
}

function onlineLost(title: string, text: string, keepToken = false): void {
  const store = useGame;
  retries = 0;
  if (!keepToken) saveToken(null);
  store.getState().session?.close();
  store.setState({
    online: null,
    session: null,
    screen: "lobby",
    view: null,
    resuming: false,
    casting: null,
    hover: null,
    peek: null,
    drawerOpen: false,
  });
  store.getState().showNotice(title, text);
}

/** Delay between two reconnection attempts, and number of attempts (≈ the server's return delay). */
const RETRY_MS = 2000;
const MAX_RETRIES = 30;
let retries = 0;

/**
 * Opens a connection to the server (closing the previous session). If the connection drops during
 * a game, reconnection is retried with the tab's token.
 */
function connectRemote(keep?: OnlineState | null): RemoteSession {
  const store = useGame;
  store.getState().session?.close();
  const session: RemoteSession = new RemoteSession(
    (m) => {
      retries = 0;
      store.getState().receiveOnline(m);
    },
    () => {
      const { online, session: current } = store.getState();
      if (current !== session || !online || !loadToken()) return;
      store.setState({ online: { ...online, reconnecting: true } });
      if (retries++ < MAX_RETRIES) setTimeout(() => store.getState().resumeOnline(), RETRY_MS);
      else
        onlineLost(
          msg("Connection lost"),
          msg("The server no longer answers: the online game cannot be resumed. Back to the home screen."),
        );
    },
  );
  store.setState({ session, online: keep ? { ...keep, error: null } : { ...EMPTY_ONLINE } });
  return session;
}

/** Pace of the effects, set by the player (sidebar), kept from one game to the next. */
export type Pace = "slow" | "normal" | "fast" | "none";

/** Paces offered in the sidebar; `label` and `hint` are `msg` texts, displayed through `textIn`. */
export const PACES: { pace: Pace; label: string; hint: string }[] = [
  { pace: "slow", label: msg("ctx:pace|Slow"), hint: msg("Each effect is shown for almost 2 seconds") },
  { pace: "normal", label: msg("ctx:pace|Normal"), hint: msg("Each effect is shown for a little more than a second") },
  { pace: "fast", label: msg("ctx:pace|Fast"), hint: msg("Each effect is shown for half a second") },
  { pace: "none", label: msg("ctx:pace|No pause"), hint: msg("Effects apply at once, without being shown") },
];

/**
 * Pace of the game: each resolution is shown (`resolving`) for `show` ms before its effect applies, then the result
 * stays visible `after` ms before the next step. An instant in the tests' fast mode.
 */
export function playbackTimes(pace: Pace): { show: number; after: number } {
  if (fastMode()) return { show: 40, after: 0 };
  return {
    slow: { show: 1900, after: 700 },
    normal: { show: 1100, after: 400 },
    fast: { show: 500, after: 150 },
    none: { show: 0, after: 0 },
  }[pace];
}

const PACE_KEY = "planecircle.pace";
const SETTINGS_KEY = "planecircle.autopilot";
const LANG_KEY = "planecircle.lang";

/** Autopilot settings kept from one session to the next (stops, full control, hold priority). */
function loadSettings(): AutopilotSettings {
  const base = structuredClone(DEFAULT_AUTOPILOT);
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AutopilotSettings> | null;
    if (!raw || typeof raw !== "object") return base;
    return {
      ...base,
      ...(typeof raw.fullControl === "boolean" ? { fullControl: raw.fullControl } : {}),
      ...(typeof raw.holdPriority === "boolean" ? { holdPriority: raw.holdPriority } : {}),
      ...(typeof raw.revealOpponentStack === "boolean" ? { revealOpponentStack: raw.revealOpponentStack } : {}),
      ...(raw.stops && Array.isArray(raw.stops.own) && Array.isArray(raw.stops.opponent)
        ? { stops: { own: raw.stops.own, opponent: raw.stops.opponent } }
        : {}),
      ...(raw.autoAnswers && typeof raw.autoAnswers === "object"
        ? {
            autoAnswers: Object.fromEntries(Object.entries(raw.autoAnswers).filter(([, v]) => v === 0 || v === 1)) as Record<
              string,
              0 | 1
            >,
          }
        : {}),
    };
  } catch {
    return base;
  }
}

function saveSettings(s: AutopilotSettings): void {
  try {
    const { fullControl, holdPriority, revealOpponentStack, stops, autoAnswers } = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fullControl, holdPriority, revealOpponentStack, stops, autoAnswers }));
  } catch {
    // Storage unavailable (private browsing): settings of the session only.
  }
}

/** Language of the interface and of the cards, French by default (PLAN-I); also sets the language of `t()`. */
function loadLang(): Lang {
  let lang: Lang = "fr";
  try {
    if (localStorage.getItem(LANG_KEY) === "en") lang = "en";
  } catch {
    // Storage unavailable: French.
  }
  setTextLang(lang);
  return lang;
}

function loadPace(): Pace {
  try {
    const v = localStorage.getItem(PACE_KEY);
    return PACES.some((p) => p.pace === v) ? (v as Pace) : "normal";
  } catch {
    return "normal";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Updates received but not displayed yet, with the session that sent them (ignored if it changed). */
const playback: { msg: Extract<FromWorker, { type: "update" }>; session: Session | null }[] = [];
let pumping = false;
let resolvingNow = false;

/** "Resolve all" in progress: the stack items known when it started, and the player's own added since. */
let resolvingAll: Set<string> | null = null;

/** A resolution is being shown, or updates are waiting: the displayed view is not the latest yet. */
function playbackBusy(): boolean {
  return resolvingNow || playback.length > 0;
}

/** The stack item that the update takes off the stack (resolved, countered or without target), if it is displayed. */
function leavingItem(
  view: GameView | null,
  events: GameEvent[],
): { item: StackItemView; outcome: "resolve" | "fizzle" | "countered" } | null {
  for (const e of events) {
    if (e.type !== "resolve" && e.type !== "fizzle" && e.type !== "countered") continue;
    const item = view?.stack.find((x) => x.id === e.stackId);
    if (item) return { item, outcome: e.type };
  }
  return null;
}

export const useGame = create<Store>((set, get) => {
  /** Displays the waiting updates one by one, showing each resolution before applying its effect. */
  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (playback.length) {
        const next = playback[0];
        if (!next) break;
        if (next.session !== get().session) {
          playback.shift();
          continue;
        }
        const leaving = leavingItem(get().view, next.msg.events);
        const times = playbackTimes(get().pace);
        if (leaving && times.show > 0) {
          resolvingNow = true;
          set({ resolving: { id: ++fxId, ...leaving } });
          await sleep(times.show);
          resolvingNow = false;
          // The game changed during the wait (back to the menu, new game): this step is dropped.
          if (next.session !== get().session) continue;
        }
        playback.shift();
        set({ resolving: null });
        get().applyUpdate(next.msg);
        if (leaving && playback.length > 0 && times.after > 0) await sleep(times.after);
      }
    } finally {
      pumping = false;
      resolvingNow = false;
      if (get().resolving) set({ resolving: null });
    }
    continueResolveAll();
  };
  /** "Resolve all": once the updates are shown, passes again while the stack resolves without an opposing response. */
  const continueResolveAll = () => {
    const v = get().view;
    if (!resolvingAll || !v || playbackBusy()) return;
    if (v.over || v.stack.length === 0 || v.stack.some((i) => !resolvingAll?.has(i.id) && i.controller !== v.viewer)) {
      resolvingAll = null;
      return;
    }
    for (const i of v.stack) resolvingAll.add(i.id);
    if (v.pending?.kind === "priority" && v.pending.player === v.viewer) get().decide({ type: "pass" });
  };
  /** Choice on the board in progress (MTGA style): a click selects or removes the option. Returns false outside this mode. */
  const pickOnBoard = (id: string): boolean => {
    const req = boardPick(get().view);
    if (!req) return false;
    if (req.options.includes(id)) set({ selection: togglePick(req, get().selection, id) });
    else get().notify(msg("This choice isn't possible."));
    return true;
  };
  /** Moves on through the choices of a cast; sends the decision when everything is chosen. */
  const continueCasting = (c: Casting) => {
    if (c.option.type === "cast" && c.mode === null) {
      if (c.option.modes.length > 1) return set({ casting: { ...c, stage: "mode" } });
      c.mode = c.option.modes[0]?.index ?? 0;
    }
    if (c.option.type === "cast" && c.payMode === null) {
      const o = c.option;
      const modes = o.free
        ? (["free"] as const)
        : ([o.normalAvailable && "normal", o.freeAvailable && "free", o.altAvailable && "alt"].filter(Boolean) as (
            | "normal"
            | "free"
            | "alt"
          )[]);
      // Without paying is always the best choice, except for an X spell (X is then 0).
      if (modes.length === 1 || (modes.includes("free") && o.xMax === null))
        c.payMode = modes.includes("free") ? "free" : (modes[0] ?? "normal");
      else return set({ casting: { ...c, stage: "pay" } });
    }
    if (c.x === null) {
      if (c.payMode !== "free" && c.option.xMax !== null && c.option.xMax > 0) return set({ casting: { ...c, stage: "x" } });
      c.x = c.payMode === "free" ? 0 : (c.option.xMax ?? 0);
    }
    if (c.option.type === "cast" && c.kicked === null) {
      const o = c.option;
      const m = o.modes.find((x) => x.index === c.mode);
      // Mode that requires or excludes the additional cost ("if it was paid, choose both instead"): no question.
      if (m?.requiresKicker || m?.forbidsKicker) c.kicked = !!m.requiresKicker;
      // Payable only with the kicker ("costs {2} less if it was bargained"): no question.
      else if (o.kickerAffordable && !o.normalAvailable && !o.freeAvailable && !o.altAvailable && !o.free) c.kicked = true;
      else if (o.kickerAffordable) return set({ casting: { ...c, stage: "kicker" } });
      else c.kicked = false;
    }
    // Hybrid mana: the color to spend, unless without paying; asked when the result depends on it (Deceit), and for any
    // hybrid spell in full control.
    if (
      c.option.type === "cast" &&
      c.option.hybridColors?.length &&
      (c.option.hybridMatters || get().settings.fullControl) &&
      c.payMode !== "free" &&
      c.hybrid === undefined
    )
      return set({ casting: { ...c, stage: "hybrid" } });
    // Phyrexian mana: mana or life (107.4f), when both are possible; the normal cost only.
    if (c.option.phyrexianLife && (c.option.type === "activate" || c.payMode === "normal") && c.phyrexian === undefined)
      return set({ casting: { ...c, stage: "phyrexian" } });
    // Bargain (kicker without mana): the sacrificed permanent, if there is a choice.
    if (
      c.option.type === "cast" &&
      c.kicked &&
      !c.option.additional?.sacrifice &&
      (c.option.kickerPermanents?.length ?? 0) > 1 &&
      c.sacrifice === null
    )
      return set({ casting: { ...c, stage: "sacrifice", spec: null } });
    // Web-slinging or sneak: the creature to return, if there is a choice.
    if (c.option.type === "cast" && c.payMode === "alt" && (c.option.altBounce?.length ?? 0) > 1 && c.bounce === null)
      return set({ casting: { ...c, stage: "bounce", spec: null } });
    // Teamwork: the creatures to tap.
    if (c.option.type === "cast" && c.kicked && c.option.kickerTap && c.tap === null)
      return set({ casting: { ...c, stage: "tap", spec: null } });
    for (const spec0 of targetSpecs(c)) {
      // Gift promised (Bloomburrow): "instead, target nonland permanent".
      const spec1 = c.kicked && spec0.kickedLegal ? { ...spec0, legal: spec0.kickedLegal } : spec0;
      // "Target player … cards from their graveyard" (Rite of Renewal): those of the player already chosen.
      const of = spec1.ofTarget;
      const spec = of
        ? { ...spec1, legal: spec1.legal.filter((id) => (c.targets[of.id] ?? []).includes(of.holders[id] ?? "")) }
        : spec1;
      if (c.targets[spec.id] !== undefined) continue;
      // Optional target without any legal option: nothing to ask.
      if (spec.optional && spec.legal.length === 0) {
        c.targets[spec.id] = [];
        continue;
      }
      const auto = get().settings.fullControl ? null : autoTarget(spec);
      if (auto) {
        c.targets[spec.id] = [auto];
        continue;
      }
      let effective = c.kicked && spec.kickedCount ? { ...spec, count: spec.kickedCount } : spec;
      // "X targets" (Doppelgang): as many targets as the chosen X (at most the possible targets).
      if (spec.countX) {
        const x = Math.min(c.x ?? 0, spec.legal.length);
        if (x === 0) {
          c.targets[spec.id] = [];
          continue;
        }
        effective = { ...effective, count: x };
      }
      // "Equipment attached to that creature": only the options attached to the target already chosen.
      const host = spec.attachedToTarget;
      if (host) {
        const hosts = c.targets[host] ?? [];
        const legal = spec.legal.filter((id) =>
          hosts.includes(get().view?.battlefield.find((o) => o.id === id)?.attachedTo ?? ""),
        );
        effective = { ...effective, legal };
        if (legal.length === 0 && spec.optional) {
          c.targets[spec.id] = [];
          continue;
        }
      }
      return set({ casting: { ...c, stage: "target", spec: effective, picked: [] } });
    }
    // Additional costs: chosen last, once the targets are known.
    const extra = c.option.type === "cast" || c.option.type === "activate" ? c.option.additional : undefined;
    if (extra && "discard" in extra && extra.discard && c.discard === null)
      return set({ casting: { ...c, stage: "discard", spec: null } });
    if (extra?.sacrifice && c.sacrifice === null) return set({ casting: { ...c, stage: "sacrifice", spec: null } });
    if (extra && "tap" in extra && extra.tap && c.tap === null) return set({ casting: { ...c, stage: "tap", spec: null } });
    if (extra && "materials" in extra && extra.materials && c.materials === null)
      return set({ casting: { ...c, stage: "materials", spec: null } });
    // Objects paid as a cost (blight, evidence, exile from the graveyard…), when the cost applies and the choice matters.
    for (const p0 of c.option.picks ?? []) {
      if (c.picks[p0.slot] !== undefined || c.skippedPicks?.[p0.slot]) continue;
      if ((p0.when === "kicked" && !c.kicked) || (p0.when === "alternative" && c.payMode !== "alt")) continue;
      // A cost of some modes only (escalate paid by tapping creatures: Collective Effort).
      if (p0.modes && !p0.modes.includes(c.mode ?? 0)) continue;
      // Convoke, improvise, waterbending, delve and the payment details (Kíli's {0}): the automatic payment chooses,
      // except in full control.
      if ((p0.atMost || p0.autoOk) && !get().settings.fullControl) continue;
      // Urgent Necropsy: the evidence total is that of the chosen targets (none: nothing to collect).
      const p = pickForTargets(p0, c.targets);
      if (p0.minTotal?.fromTargets && !p.minTotal?.n) continue;
      const count = p.countIsX ? (c.x ?? 0) : p.count;
      if (p.countIsX && count === 0) continue;
      // A single possible answer: no question (PLAN-M M6).
      if (!p.atMost && !p.optional && !pickHasChoice({ ...p, count })) continue;
      return set({ casting: { ...c, stage: "pick", spec: null, pick: { ...p, count } } });
    }
    // Full control: the player taps the sources to pay with, the automatic payment completes the rest.
    if (get().settings.fullControl && !c.manaDone && c.payMode !== "free" && paysMana(get().view, c))
      return set({ casting: { ...c, stage: "mana", spec: null } });
    get().decide(buildDecision(c));
  };

  const sendSettings = (settings: AutopilotSettings) => {
    set({ settings });
    saveSettings(settings);
    get().session?.send({ type: "settings", settings });
  };

  /** Starts a game against the AI in a new worker. */
  function startLocal(
    playerDeck: DeckEntries,
    aiDecks: DeckEntries[],
    sandbox?: Sandbox,
    aiLevel?: AiLevel,
    startingPlayer?: string,
    /** Commander: number of commanders at the top of each deck (player, then AIs). */
    commanders?: number[],
    sides?: { player?: DeckEntries; ai?: DeckEntries[] },
  ): void {
    get().session?.close();
    preloadSounds();
    // Save for the resume when the page is reopened (not for the sandbox, which is not recorded). The match is noted as
    // it was at the start of the game: the game counts when it ends, after a resume too.
    stopSaving();
    const match = get().localMatch;
    saver = sandbox ? null : new SaveWriter(() => ({ aiLevel, match, log: get().log }));
    const session = new LocalSession((m) => get().receive(m));
    const settings = { ...get().settings, passUntilTurn: null };
    set({ screen: "game", session, view: null, log: [], casting: null, attackers: [], blocks: {}, selection: [], settings });
    // Outside the game: only the cards of the sideboard that the engine plays.
    const playerSide = sideboardInGame(sides?.player);
    const aiSides = aiDecks.map((_, i) => sideboardInGame(sides?.ai?.[i]));
    session.send({
      type: "start",
      seed: Math.floor(Math.random() * 2 ** 31),
      playerName: t("You"),
      aiNames: aiDecks.length > 1 ? aiDecks.map((_, i) => t("AI {n}", { n: i + 1 })) : [t("AI")],
      playerDeck,
      aiDecks,
      ...(playerSide.length ? { playerSide } : {}),
      ...(aiSides.some((x) => x.length) ? { aiSides } : {}),
      defs: defsFor([playerDeck, ...aiDecks, playerSide, ...aiSides], sandbox),
      sandbox,
      fast: fastMode(),
      aiLevel,
      startingPlayer,
      ...(commanders ? { variant: "commander" as const, commanders } : {}),
    });
    session.send({ type: "settings", settings });
  }

  return {
    screen: "lobby",
    replay: null,
    tutorialGame: false,
    editingDeck: null,
    sharedDeck: null,
    session: null,
    online: null,
    view: null,
    faces: {},
    log: [],
    toast: null,
    notice: null,
    resuming: false,
    floatWarned: null,
    settings: loadSettings(),
    lang: loadLang(),
    casting: null,
    manaPick: null,
    abilityMenu: null,
    attackers: [],
    attackTargets: {},
    aimingAttacker: null,
    blocks: {},
    selectedBlocker: null,
    selection: [],
    hover: null,
    hoverLive: false,
    previewHold: false,
    peek: null,
    drawerOpen: false,
    graveyardOpen: null,
    exileOpen: null,
    fx: [],
    turnBanner: null,
    spotlight: null,
    resolving: null,
    boardTheme: loadBoardTheme(),
    setBoardTheme(boardTheme) {
      set({ boardTheme });
      saveBoardTheme(boardTheme);
    },
    effects: loadEffects(),
    setEffects(effects) {
      // Choosing 3D again tries it again.
      set({ effects, board3dFailed: false });
      saveEffects(effects);
    },
    board3dQuality: null,
    setBoard3dQuality(board3dQuality) {
      set({ board3dQuality });
    },
    board3dFailed: false,
    failBoard3d() {
      if (get().board3dFailed) return;
      set({ board3dFailed: true });
      get().notify(msg("The 3D board stopped (graphics lost): back to the flat board."));
    },
    pace: loadPace(),
    setPace(pace) {
      set({ pace });
      try {
        localStorage.setItem(PACE_KEY, pace);
      } catch {
        // storage unavailable: setting not kept
      }
    },

    startGame(playerDeck, aiDecks, sandbox, aiLevel, match, commander, sides) {
      get().session?.close();
      const localMatch: LocalMatch | null =
        match && aiDecks.length === 1
          ? {
              bestOf: 3,
              wins: { p1: 0, p2: 0 },
              game: 1,
              winner: null,
              deck: { main: playerDeck, sideboard: match.sideboard },
              original: { main: playerDeck, sideboard: match.sideboard },
              aiDeck: aiDecks[0] as DeckEntries,
              ...(sides?.ai?.[0]?.length ? { aiSide: sides.ai[0] } : {}),
              aiLevel,
              ...(match.format && match.format !== "standard" ? { format: match.format } : {}),
            }
          : null;
      set({ online: null, tutorialGame: false, replay: null, localMatch });
      if (commander) {
        // Commander: each deck starts with its commander (worker: `commanders`, cards at the top of the deck).
        const size = (e: DeckEntries) => e.reduce((n, [k]) => n + k, 0);
        startLocal(
          [...commander.player, ...playerDeck],
          aiDecks.map((d, i) => [...(commander.ai[i] ?? []), ...d]),
          sandbox,
          aiLevel,
          undefined,
          [size(commander.player), ...aiDecks.map((_, i) => size(commander.ai[i] ?? []))],
        );
        return;
      }
      startLocal(playerDeck, aiDecks, sandbox, aiLevel, undefined, undefined, {
        player: match?.sideboard ?? sides?.player,
        ai: sides?.ai,
      });
    },

    nextGame(main, sideboard) {
      const online = get().online;
      if (online) {
        (get().session as RemoteSession | null)?.raw({ type: "sideboard", main, sideboard });
        return;
      }
      const m = get().localMatch;
      if (!m || m.winner) return;
      const error = sideboardSwapError(m.original, { main, sideboard }, CARDS, m.format);
      if (error) return get().notify(error);
      // The loser of the previous game starts.
      const last = get().view;
      const loser = last?.winner ? (last.winner === "p1" ? "p2" : "p1") : undefined;
      set({ localMatch: { ...m, deck: { main, sideboard }, game: m.game + 1 } });
      startLocal(main, [m.aiDeck], undefined, m.aiLevel, loser, undefined, {
        player: sideboard,
        ...(m.aiSide ? { ai: [m.aiSide] } : {}),
      });
    },

    localMatch: null,
    startScenario(scenario) {
      stopSaving();
      get().session?.close();
      preloadSounds();
      const session = new LocalSession((m) => get().receive(m));
      // Default settings: the tutorial sets the stops it needs itself.
      const settings = structuredClone(DEFAULT_AUTOPILOT);
      set({
        screen: "game",
        tutorialGame: true,
        replay: null,
        localMatch: null,
        online: null,
        session,
        view: null,
        log: [],
        fx: [],
        casting: null,
        attackers: [],
        blocks: {},
        selection: [],
        hover: null,
        settings,
      });
      session.send({
        type: "start",
        seed: 1,
        playerName: t("You"),
        aiNames: [t("Opponent")],
        playerDeck: [],
        aiDecks: [],
        defs: defsFor([], undefined, scenario),
        scenario,
        fast: fastMode(),
      });
      session.send({ type: "settings", settings });
    },

    openTutorial() {
      set({ screen: "tutorial" });
    },

    openOnline() {
      set({ screen: "online", tutorialGame: false });
    },

    createRoom(name, deck, opts = {}) {
      set({ localMatch: null });
      connectRemote().raw({
        type: "create",
        name,
        deck,
        sideboard: opts.sideboard,
        bestOf: opts.bestOf,
        format: opts.format,
        ...(opts.players && opts.players > 2 ? { players: opts.players } : {}),
        ...(opts.commander?.length ? { commander: opts.commander } : {}),
        ...(opts.ai?.count ? { ai: opts.ai } : {}),
        version: VERSION,
      });
      saveName(name);
    },

    joinRoom(code, name, deck, sideboard, commander) {
      set({ localMatch: null });
      connectRemote().raw({
        type: "join",
        code,
        name,
        deck,
        sideboard,
        ...(commander?.length ? { commander } : {}),
        version: VERSION,
      });
      saveName(name);
    },

    resumeAtStartup() {
      if (loadToken()) {
        set({ screen: "game", resuming: true });
        return get().resumeOnline();
      }
      get().resumeLocal();
    },

    resumeOnline() {
      const token = loadToken();
      if (!token) return;
      connectRemote(get().online?.status === "connecting" ? undefined : get().online).raw({
        type: "rejoin",
        token,
        version: VERSION,
      });
    },

    leaveRoom() {
      const session = get().session;
      if (session instanceof RemoteSession) session.raw({ type: "leave" });
      session?.close();
      saveToken(null);
      set({
        online: null,
        session: null,
        screen: "lobby",
        view: null,
        casting: null,
        hover: null,
        peek: null,
        drawerOpen: false,
      });
    },

    rematch() {
      const session = get().session;
      if (session instanceof RemoteSession) session.raw({ type: "rematch" });
    },

    receiveOnline(m) {
      const online = get().online;
      if (!online) return;
      switch (m.type) {
        case "room": {
          const r = m.room;
          saveToken(r.token);
          if (get().resuming && r.status === "waiting") set({ resuming: false });
          const starting = r.status === "playing" && online.status !== "playing";
          set({
            online: {
              ...online,
              status: r.status,
              code: r.code,
              seat: r.seat,
              players: r.players.map((p) => ({ ...p, name: playerName(p.name, get().lang) })),
              match: r.match,
              deck: r.deck,
              error: null,
              reconnecting: false,
            },
            ...(starting
              ? { screen: "game", view: null, log: [], casting: null, attackers: [], blocks: {}, selection: [], fx: [] }
              : r.status === "waiting"
                ? { screen: "online" }
                : {}),
          });
          if (starting) {
            preloadSounds();
            get().session?.send({ type: "settings", settings: get().settings });
          }
          return;
        }
        case "update":
          set({
            online: { ...online, clock: m.clock ? { ...m.clock, deadline: Date.now() + m.clock.remainingMs } : null },
            ...(get().screen !== "game" ? { screen: "game" } : {}),
          });
          get().receive({ type: "update", view: m.view, events: m.events, faces: m.faces });
          return;
        case "opponent":
          set({
            online: {
              ...online,
              opponent: { connected: m.connected, deadline: m.remainingMs === null ? null : Date.now() + m.remainingMs },
            },
          });
          return;
        case "record":
          downloadRecord(m.record);
          return;
        case "error": {
          if (m.code === "rules") return get().receive({ type: "error", message: m.message });
          // Client of another version than the server: the page reloads (it is served network first, sw.js), the token
          // is kept to resume the game with the new version.
          if (m.code === "version") {
            onlineLost(msg("New version"), msg("{message} The page will reload.", { message: m.message }), true);
            setTimeout(() => location.reload(), 3000);
            return;
          }
          // This page's game no longer exists (over and deleted, server restarted without being able to resume it).
          const back = msg("{message} Back to the home screen.", { message: m.message });
          if (m.code === "token") return onlineLost(msg("Online game over"), back);
          // Resume refused: the game is already open in another tab or another browser.
          if (m.code === "state" && !online.code) return onlineLost(msg("Game open elsewhere"), back, true);
          // Room closed by the server during a game or a resume.
          if (m.code === "closed" && (online.code || get().resuming)) return onlineLost(msg("Room closed"), back);
          playSound("error");
          // The server's message (an English `msg` text), in the interface language.
          const error = localizeText(m.message, get().faces, get().lang);
          set({ online: { ...online, error, status: online.code ? online.status : "connecting" } });
          if (!online.code || m.code === "closed") {
            // Creation or arrival refused, or room closed by the server: the connection is closed.
            if (m.code === "closed") saveToken(null);
            get().session?.close();
            set({ session: null, online: { ...online, error, status: "connecting" } });
          }
          return;
        }
      }
    },

    openDeckBuilder(deckId) {
      set({ screen: "decks", editingDeck: deckId ?? get().editingDeck });
    },

    exportGame() {
      get().session?.send({ type: "export" });
    },

    openReplay(record) {
      get().session?.close();
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      let session: ReplaySession;
      try {
        session = new ReplaySession(record, card);
      } catch (e) {
        return get().notify(msg("Replay impossible: {error}", { error: e instanceof Error ? e.message : String(e) }));
      }
      const viewer = record.players[0]?.id ?? "p1";
      set({
        screen: "game",
        tutorialGame: false,
        online: null,
        localMatch: null,
        session,
        log: [],
        fx: [],
        // Nothing of the previous game: turn banner, opponent's spell shown, message.
        turnBanner: null,
        spotlight: null,
        toast: null,
        casting: null,
        attackers: [],
        blocks: {},
        selection: [],
        replay: {
          index: 0,
          total: session.states.length - 1,
          viewer,
          players: record.players.map((p) => ({ id: p.id, name: playerName(p.name, get().lang) })),
          playing: false,
          warning: session.warning,
        },
      });
      const { view, faces } = session.frame(0, viewer, false);
      set({ view: withPlayerNames(view, get().lang), faces });
    },

    replaySeek(index) {
      const { replay, session } = get();
      if (!replay || !(session instanceof ReplaySession)) return;
      const i = Math.max(0, Math.min(replay.total, index));
      // One step forward: its events (log, sounds, effects); a jump: the state only, log emptied.
      const step = i === replay.index + 1;
      const frame = session.frame(i, replay.viewer, step);
      if (step) {
        get().receive({ type: "update", ...frame });
      } else set({ view: withPlayerNames(frame.view, get().lang), faces: frame.faces, log: [] });
      set({ replay: { ...replay, index: i } });
      if (i >= replay.total) get().replayPlay(false);
    },

    replayViewer(player) {
      const { replay, session } = get();
      if (!replay || !(session instanceof ReplaySession)) return;
      const frame = session.frame(replay.index, player, false);
      set({
        replay: { ...replay, viewer: player },
        view: withPlayerNames(frame.view, get().lang),
        faces: frame.faces,
        log: [],
      });
    },

    replayPlay(on) {
      const replay = get().replay;
      if (!replay) return;
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (on)
        replayTimer = setInterval(() => {
          const r = get().replay;
          if (r) get().replaySeek(r.index + 1);
        }, 700);
      set({ replay: { ...replay, playing: on } });
    },

    backToLobby() {
      resolvingAll = null;
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (get().replay) set({ replay: null });
      if (get().online) return get().leaveRoom();
      // Game left: nothing left to resume.
      stopSaving();
      get().session?.close();
      set({
        screen: get().tutorialGame && get().screen === "game" ? "tutorial" : "lobby",
        tutorialGame: false,
        session: null,
        view: null,
        casting: null,
        hover: null,
        peek: null,
        drawerOpen: false,
      });
    },

    receive(m) {
      if (m.type === "saved") {
        saver?.apply(m);
        return;
      }
      if (m.type === "resumeFailed") {
        stopSaving();
        get().session?.close();
        set({ session: null, screen: "lobby", view: null, resuming: false, localMatch: null });
        return get().showNotice(
          msg("Game cannot be resumed"),
          msg("The saved game cannot be resumed: {reason}.", { reason: m.message }),
        );
      }
      if (m.type === "record") {
        if (m.record) downloadRecord(m.record);
        else get().notify(msg("This game is not recorded (tutorial or sandbox)."));
        return;
      }
      if (m.type === "error") {
        playSound("error");
        return get().notify(m.message);
      }
      if (get().resuming) set({ resuming: false });
      // Replay: the steps are displayed at once (the viewer has its own controls).
      if (get().replay) return get().applyUpdate(m);
      playback.push({ msg: m, session: get().session });
      void pump();
    },

    applyUpdate(update) {
      const { events, faces } = update;
      const view = withPlayerNames(update.view, get().lang);
      // Match against the AI: the game that ends counts (two wins take the match, three games at most).
      const m = get().localMatch;
      if (m && !m.winner && view.over && !get().view?.over) {
        const wins = { ...m.wins };
        if (view.winner) wins[view.winner] = (wins[view.winner] ?? 0) + 1;
        const decided = (wins.p1 ?? 0) >= 2 || (wins.p2 ?? 0) >= 2 || m.game >= m.bestOf;
        const winner = decided ? ((wins.p1 ?? 0) > (wins.p2 ?? 0) ? "p1" : (wins.p2 ?? 0) > (wins.p1 ?? 0) ? "p2" : null) : null;
        set({ localMatch: { ...m, wins, winner: decided ? (winner ?? "draw") : null } });
      }
      const lines = describeEvents(events, view, faces, get().lang, get().view);
      for (const cue of soundsFor(events, view, get().view, faces)) playSound(cue.key, cue);
      playEffects(view, events, faces);
      for (const listener of updateListeners) listener({ events, view, prev: get().view, faces });
      const changed = pendingKey(get().view) !== pendingKey(view);
      // Soft pass: an opponent's spell or ability hands back control; the pass until the end of the turn stops there.
      const st = get().settings;
      const top = view.stack[view.stack.length - 1];
      if (
        st.passUntilTurn !== null &&
        st.passMode !== "hard" &&
        view.pending?.kind === "priority" &&
        view.pending.player === view.viewer &&
        top &&
        top.controller !== view.viewer
      )
        sendSettings({ ...st, passUntilTurn: null });
      // Forced attacks (508.1d: "attacks each combat if able", goad): already selected, toward the defender that
      // satisfies their requirements (impossible to remove on the engine side).
      const p = view.pending;
      const forcedAttacks = p?.kind === "declareAttackers" && p.player === view.viewer ? (p.forced ?? []) : [];
      const forced = forcedAttacks.map((a) => a.id);
      set((s) => ({
        view,
        faces,
        log: [...s.log, ...lines].slice(-400),
        ...(changed
          ? {
              casting: null,
              manaPick: null,
              abilityMenu: null,
              attackers: forced,
              attackTargets: Object.fromEntries(forcedAttacks.map((a) => [a.id, a.defender])),
              aimingAttacker: null,
              legendConfirm: null,
              blocks: {},
              selectedBlocker: null,
              selection: [],
            }
          : {}),
      }));
      observer?.(view, events);
    },

    decide(d) {
      // While a resolution is being shown, the displayed view is not the game's yet.
      if (playbackBusy()) return;
      // Playing something ends "Resolve all" (answering a question of a resolving spell does not).
      if (d.type === "cast" || d.type === "activate" || d.type === "playLand") resolvingAll = null;
      if (refused(d)) return;
      get().session?.send({ type: "decision", decision: d });
      // Mana tapped by hand during the "mana" stage of a cast: the cast goes on.
      const keep = (d.type === "tapForMana" || d.type === "undoMana") && get().casting?.stage === "mana";
      set({ casting: keep ? get().casting : null, manaPick: null, abilityMenu: null, selectedBlocker: null, selection: [] });
    },

    tapMana(option, color, colors) {
      const decision: Extract<Decision, { type: "tapForMana" }> = {
        type: "tapForMana",
        source: option.source,
        ability: option.ability,
        ...(colors ? { colors } : { color: color ?? option.colors[0] }),
      };
      // A payment detail (`autoOk`): asked only in full control.
      const pick = option.picks?.[0];
      if (pick && get().settings.fullControl) return set({ manaPick: { decision, pick }, abilityMenu: null });
      get().decide(decision);
    },

    chooseManaPick(ids) {
      const m = get().manaPick;
      if (!m || ids === undefined) return set({ manaPick: null });
      get().decide({ ...m.decision, picks: { [m.pick.slot]: ids } });
    },

    resolveAll() {
      const v = get().view;
      if (!v || v.stack.length === 0) return;
      resolvingAll = new Set(v.stack.map((i) => i.id));
      get().decide({ type: "pass" });
    },

    passPriority() {
      const v = get().view;
      if (!v) return;
      const pool: Record<string, number> = v.players[v.viewer]?.manaPool ?? {};
      const floating = Object.values(pool).some((n) => n > 0);
      const key = pendingKey(v);
      // Empty stack: the step is about to end and the mana pool to empty.
      if (floating && v.stack.length === 0 && get().floatWarned !== key) {
        set({ floatWarned: key });
        return get().notify(msg("Unused mana: it will be lost at the end of the step. Press again to pass."));
      }
      get().decide({ type: "pass" });
    },

    showNotice(title, text) {
      playSound("error");
      set({ notice: { title, text } });
    },

    dismissNotice() {
      set({ notice: null });
    },

    resumeLocal() {
      const saved = loadSavedGame();
      if (!saved) return false;
      // The game's cards: a card removed or renamed since (update) makes the resume impossible, without blocking.
      const decks = saved.record.players.map((p) =>
        [...p.deck, ...(p.sideboard ?? [])].map((name) => [1, name] as [number, string]),
      );
      let defs: Record<string, CardDef>;
      try {
        defs = defsFor(decks);
      } catch (e) {
        get().receive({
          type: "resumeFailed",
          message: msg("one of its cards is unknown to this version ({error})", {
            error: e instanceof Error ? e.message : String(e),
          }),
        });
        return false;
      }
      get().session?.close();
      preloadSounds();
      saver = new SaveWriter(() => ({ aiLevel: saved.aiLevel, match: saved.match, log: get().log }));
      saver.start(saved.record);
      const session = new LocalSession((m) => get().receive(m));
      const settings = { ...get().settings, passUntilTurn: null };
      // The saved log carries on (negative ids: they do not meet those of the next lines).
      const log = (saved.log ?? []).map((l, i) => ({ ...l, id: -(i + 1) }));
      set({
        screen: "game",
        resuming: true,
        session,
        online: null,
        tutorialGame: false,
        replay: null,
        localMatch: saved.match,
        view: null,
        log: [...log, { id: -(log.length + 1), text: t("Game resumed."), kind: "info" }],
        casting: null,
        attackers: [],
        blocks: {},
        selection: [],
        settings,
      });
      session.send({ type: "resume", record: saved.record, defs, aiLevel: saved.aiLevel, fast: fastMode() });
      session.send({ type: "settings", settings });
      return true;
    },

    notify(text) {
      const id = ++toastId;
      set({ toast: { text, id } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 2600);
    },

    clickHandCard(id) {
      const { view, casting } = get();
      if (!view) return;
      if (casting) return get().cancel();
      const p = view.pending;
      if ((p?.kind === "discard" || p?.kind === "bottomCards") && p.player === view.viewer) return get().toggleSelection(id);
      const acts = myActions(view);
      const lands = acts.filter((a) => a.type === "playLand" && a.card === id);
      const casts = acts.filter((a): a is CastOption => a.type === "cast" && a.card === id);
      // Shock land: pay the life (untapped) or not (tapped); adventure town: play the land or cast the Adventure.
      if (lands.length > 1 || (lands.length === 1 && casts.length > 0))
        return set({ abilityMenu: { sourceId: id, options: [...lands, ...casts] } });
      const land = lands[0];
      if (lands.length === 1 && land?.type === "playLand") return get().playLand(land);
      const cast = casts[0];
      // Activated abilities from the hand (cycling, "discard this card: …"), or several faces (adventure).
      const fromHand = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
      if (casts.length + fromHand.length > 1) return set({ abilityMenu: { sourceId: id, options: [...casts, ...fromHand] } });
      if (fromHand[0] && !cast) return get().beginCasting(fromHand[0], id);
      if (cast) return get().beginCasting(cast, id);
      if (p?.kind === "priority" && p.player === view.viewer) {
        const card = view.hand.find((c) => c.id === id);
        if (card && !card.implemented) get().notify(msg("The engine doesn't handle this card yet."));
        else if (card?.types.includes("Land")) get().notify(msg("You can't play a land now."));
        else get().notify(msg("You can't cast this spell now (timing or mana)."));
      }
    },

    clickPermanent(id) {
      const { view, casting } = get();
      if (!view) return;
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id)) return get().pickTarget(id);
        return get().notify(msg("Invalid target."));
      }
      // "mana" stage (full control): a click taps the source for its mana, or undoes it.
      if (casting?.stage === "mana") {
        if (view.battlefield.find((o) => o.id === id)?.undoMana) return get().decide({ type: "undoMana", source: id });
        const mana = myActions(view).filter((a) => a.type === "tapForMana" && a.source === id);
        const m = mana[0];
        if (mana.length > 1 || (m?.type === "tapForMana" && (m.colors.length > 1 || m.combination)))
          return set({ abilityMenu: { sourceId: id, options: mana } });
        if (m?.type === "tapForMana") return get().tapMana(m);
        return get().notify(msg("This permanent can't produce mana now."));
      }
      if (pickOnBoard(id)) return;
      const p = view.pending;
      if (!p || p.player !== view.viewer) return;
      if (p.kind === "declareAttackers") {
        // Attackable planeswalker: target of the aiming attacker.
        if (p.defenders?.includes(id)) return get().aimAttackAt(id);
        return get().toggleAttacker(id);
      }
      if (p.kind === "declareBlockers") {
        const cands = p.candidates ?? [];
        const mine = cands.find((c) => c.blocker === id);
        const blocks = { ...get().blocks };
        if (mine) {
          if (blocks[id]) {
            delete blocks[id];
            return set({ blocks, selectedBlocker: null });
          }
          if (mine.attackers.length === 1) {
            blocks[id] = mine.attackers[0] as string;
            return set({ blocks, selectedBlocker: null });
          }
          return set({ selectedBlocker: get().selectedBlocker === id ? null : id });
        }
        const sel = get().selectedBlocker;
        const selCand = cands.find((c) => c.blocker === sel);
        if (sel && selCand?.attackers.includes(id)) {
          blocks[sel] = id;
          return set({ blocks, selectedBlocker: null });
        }
        return;
      }
      if (p.kind === "priority") {
        // Land tapped for its mana, still unused: a click undoes it (Arena style).
        if (view.battlefield.find((o) => o.id === id)?.undoMana) return get().decide({ type: "undoMana", source: id });
        const acts = myActions(view);
        const activations = acts.filter((a): a is ActivateOption => a.type === "activate" && a.source === id);
        const mana = acts.filter((a) => a.type === "tapForMana" && a.source === id);
        // Activated abilities impossible right now (mana, target, timing): shown greyed out rather than hidden, so that
        // a click on a land does not silently tap it for its mana (Rogue's Passage without {4} available).
        const perm = view.battlefield.find((o) => o.id === id);
        const unavailable = (perm?.controller === view.viewer ? (perm.activated ?? []) : []).filter(
          (a) => !activations.some((x) => x.ability === a.index),
        );
        if (activations.length + mana.length > 1 || (unavailable.length > 0 && activations.length + mana.length > 0))
          return set({ abilityMenu: { sourceId: id, options: [...activations, ...mana], unavailable } });
        if (unavailable.length > 0 && activations.length + mana.length === 0)
          return get().notify(
            msg("{ability}: not possible now (mana, target or timing).", { ability: unavailable[0]?.label ?? "" }),
          );
        if (activations[0]) return get().beginCasting(activations[0], id);
        const m = mana[0];
        // Several types (City of Brass, "in any combination"): the menu asks which (PLAN-L L3).
        if (m?.type === "tapForMana" && (m.colors.length > 1 || m.combination))
          return set({ abilityMenu: { sourceId: id, options: mana, unavailable } });
        if (m?.type === "tapForMana") return get().tapMana(m);
      }
    },

    clickPlayer(id) {
      const { casting, view } = get();
      const p = view?.pending;
      if (p?.kind === "declareAttackers" && p.player === view?.viewer && p.defenders?.includes(id)) {
        return get().aimAttackAt(id);
      }
      if (pickOnBoard(id)) return;
      if (casting?.stage === "target" && casting.spec) {
        if (casting.spec.legal.includes(id)) return get().pickTarget(id);
        get().notify(msg("Invalid target."));
      }
    },

    beginCasting(option, sourceId) {
      set({ abilityMenu: null });
      // Legend rule (704.5j): warn before casting a duplicate (it cannot be undone afterwards).
      const dup = legendDuplicate(get().view, option, sourceId);
      if (dup && get().legendConfirm?.sourceId !== sourceId) {
        return set({ legendConfirm: { option, sourceId, name: dup } });
      }
      set({ legendConfirm: null });
      continueCasting({
        option,
        sourceId,
        mode: null,
        x: null,
        kicked: null,
        discard: null,
        sacrifice: null,
        tap: null,
        materials: null,
        bounce: null,
        picks: {},
        payMode: null,
        targets: {},
        stage: "mode",
        spec: null,
      });
    },

    legendConfirm: null,
    landChoice: null,

    playLand(option) {
      // The land's "as it enters" question; a detail (`autoOk`: the card a reveal land shows) keeps the engine's
      // suggestion outside full control (PLAN-M M11b).
      if (option.choose && !(option.choose.autoOk && !get().settings.fullControl))
        return set({ landChoice: option, abilityMenu: null });
      set({ abilityMenu: null });
      get().decide({
        type: "playLand",
        card: option.card,
        payLife: option.payLife,
        landType: option.landType,
        ...(option.back ? { back: true } : {}),
      });
    },

    answerLandChoice(values) {
      const option = get().landChoice;
      set({ landChoice: null });
      if (!option || values === null) return;
      get().decide({
        type: "playLand",
        card: option.card,
        payLife: option.payLife,
        landType: option.landType,
        answer: values,
        ...(option.back ? { back: true } : {}),
      });
    },

    confirmLegend() {
      const c = get().legendConfirm;
      if (c) get().beginCasting(c.option, c.sourceId);
    },

    cancelLegend() {
      set({ legendConfirm: null });
    },

    chooseMode(index) {
      const c = get().casting;
      if (!c) return;
      // "If the additional cost was paid, choose both instead": the "both" mode requires paying it, each single mode
      // requires not paying it.
      const m = c.option.type === "cast" ? c.option.modes.find((x) => x.index === index) : undefined;
      const kicked = m?.requiresKicker ? true : m?.forbidsKicker ? false : undefined;
      continueCasting({ ...c, mode: index, ...(kicked !== undefined ? { kicked } : {}) });
    },

    choosePayMode(payMode) {
      const c = get().casting;
      if (c) continueCasting({ ...c, payMode });
    },

    chooseX(x) {
      const c = get().casting;
      if (c) continueCasting({ ...c, x });
    },

    chooseKicker(kicked) {
      const c = get().casting;
      if (c) continueCasting({ ...c, kicked });
    },

    chooseHybrid(color) {
      const c = get().casting;
      if (c) continueCasting({ ...c, hybrid: color });
    },

    choosePhyrexian(life) {
      const c = get().casting;
      if (c) continueCasting({ ...c, phyrexian: life });
    },

    confirmMana() {
      const c = get().casting;
      if (c?.stage === "mana") continueCasting({ ...c, manaDone: true });
    },

    chooseAdditional(kind, ids) {
      const c = get().casting;
      if (c) continueCasting({ ...c, [kind]: ids });
    },

    choosePick(slot, ids) {
      const c = get().casting;
      if (!c) return;
      // `undefined`: no choice (automatic payment); the slot is noted as handled.
      const skipped = { ...(c.skippedPicks ?? {}), [slot]: true };
      if (ids === undefined) return continueCasting({ ...c, skippedPicks: skipped, pick: undefined });
      continueCasting({ ...c, picks: { ...c.picks, [slot]: ids }, skippedPicks: skipped, pick: undefined });
    },

    pickTarget(id) {
      const c = get().casting;
      if (!c?.spec || c.stage !== "target") return;
      const max = c.spec.count ?? 1;
      if (max === 1) return continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: [id] } });
      const cur = c.picked ?? [];
      const g = c.spec.group;
      let picked: string[];
      if (cur.includes(id)) picked = cur.filter((x) => x !== id);
      else if (g?.kind === "same" && cur.some((x) => g.holders[x] !== g.holders[id])) picked = [id];
      else picked = [...(g?.kind === "different" ? cur.filter((x) => g.holders[x] !== g.holders[id]) : cur), id];
      if (picked.length >= max) return continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: picked }, picked: [] });
      set({ casting: { ...c, picked } });
    },

    confirmTargets() {
      const c = get().casting;
      if (!c?.spec) return;
      const picked = c.picked ?? [];
      if (picked.length === 0 && !c.spec.optional) return;
      continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: picked }, picked: [] });
    },

    chooseNoTarget() {
      const c = get().casting;
      if (c?.spec?.optional) continueCasting({ ...c, targets: { ...c.targets, [c.spec.id]: [] } });
    },

    cancel() {
      set({
        casting: null,
        manaPick: null,
        abilityMenu: null,
        selectedBlocker: null,
        aimingAttacker: null,
        legendConfirm: null,
      });
    },

    toggleAttacker(id) {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers" || !p.candidates?.includes(id)) return;
      const cur = get().attackers;
      // Creature already attacking: it no longer attacks.
      if (cur.includes(id)) return set({ attackers: cur.filter((a) => a !== id), aimingAttacker: null });
      // What this creature can attack ("can't attack you": not every defender).
      const defenders = p.allowed?.[id] ?? p.defenders ?? [];
      // Several possible targets (MTGA style): the creature is "aiming", its target is clicked next.
      if (defenders.length > 1) return set({ aimingAttacker: get().aimingAttacker === id ? null : id });
      const target = defenders[0];
      set({ attackers: [...cur, id], attackTargets: target ? { ...get().attackTargets, [id]: target } : get().attackTargets });
    },

    aimAttackAt(defender) {
      const aiming = get().aimingAttacker;
      if (!aiming) return get().notify(msg("First click the attacking creature, then its target."));
      const p = get().view?.pending;
      const allowed = p?.kind === "declareAttackers" ? p.allowed?.[aiming] : undefined;
      if (allowed && !allowed.includes(defender)) return get().notify(msg("This creature can't attack this target."));
      set({
        attackers: get().attackers.includes(aiming) ? get().attackers : [...get().attackers, aiming],
        attackTargets: { ...get().attackTargets, [aiming]: defender },
        aimingAttacker: null,
      });
    },

    allAttack() {
      const p = get().view?.pending;
      if (p?.kind !== "declareAttackers") return;
      // Everyone attacks the last chosen target (an aimed planeswalker, an opponent), otherwise the first opponent;
      // those whose target is already chosen keep it.
      const chosen = Object.values(get().attackTargets).at(-1);
      const target = chosen && p.defenders?.includes(chosen) ? chosen : p.defenders?.[0];
      const forced = new Map((p.forced ?? []).map((a) => [a.id, a.defender]));
      // Each creature keeps its target; otherwise its forced attack; otherwise the common target if it can attack it.
      const targetOf = (id: string) => {
        const allowed = p.allowed?.[id] ?? p.defenders ?? [];
        const chosenFor = get().attackTargets[id] ?? forced.get(id);
        if (chosenFor) return chosenFor;
        return target && allowed.includes(target) ? target : allowed[0];
      };
      const ids = (p.candidates ?? []).filter((id) => !!targetOf(id));
      set({
        attackers: [...ids],
        attackTargets: Object.fromEntries(ids.map((id) => [id, targetOf(id) as string])),
      });
    },

    endTurn(hard) {
      const v = get().view;
      if (!v || refused({ type: "endTurn" })) return;
      set({ casting: null, attackers: [] });
      sendSettings({ ...get().settings, passUntilTurn: v.turn.number, passMode: hard ? "hard" : "soft" });
    },

    toggleStop(side, step) {
      const s = get().settings;
      const list = s.stops[side];
      const next = list.includes(step) ? list.filter((x) => x !== step) : [...list, step];
      sendSettings({ ...s, stops: { ...s.stops, [side]: next } });
    },

    setFullControl(on) {
      sendSettings({ ...get().settings, fullControl: on });
    },

    setHoldPriority(on) {
      sendSettings({ ...get().settings, holdPriority: on });
    },

    keepAnswer(key, answer) {
      const st = get().settings;
      sendSettings({ ...st, autoAnswers: { ...st.autoAnswers, [key]: answer } });
    },

    clearAnswers() {
      sendSettings({ ...get().settings, autoAnswers: {} });
    },

    applySettings(partial) {
      sendSettings({ ...get().settings, ...partial });
    },

    setLang(lang) {
      setTextLang(lang);
      set({ lang });
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // Storage unavailable: language of the session only.
      }
    },

    setHover(h) {
      set({ hover: h, hoverLive: !!h });
    },

    endHover() {
      if (get().hoverLive) set({ hoverLive: false });
    },

    setPreviewHold(hold) {
      set({ previewHold: hold });
    },

    setPeek(h) {
      set(h ? { peek: h, hover: h } : { peek: null });
    },

    setDrawerOpen(open) {
      set({ drawerOpen: open });
    },

    toggleSelection(id) {
      const cur = get().selection;
      set({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
    },

    openGraveyard(player) {
      set({ graveyardOpen: player });
    },

    openExile(player) {
      set({ exileOpen: player });
    },
  };
});
