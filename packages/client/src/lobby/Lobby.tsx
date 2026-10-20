import type { AiLevel } from "@mtgx/ai";
import { CARDS, type DeckList, FORMAT_LABELS, validateDeck } from "@mtgx/cards";
import { type Format, isGameRecord, msg } from "@mtgx/engine";
import { useEffect, useMemo, useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ManaCost } from "../board/Card";
import { resolveBoardTheme } from "../boardThemes";
import { Dialog } from "../Dialog";
import { deckCover, deckDescription, deckName, useAllDecks } from "../decks/store";
import { useGlossary } from "../glossary/store";
import { CustomArtToggle, ImageRelayToggle } from "../ImageRelayToggle";
import { useRelayActive } from "../images";
import { LangToggle } from "../LangToggle";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { useTutorial } from "../tutorial/store";
import { FormatChoice, loadFormat, saveFormat } from "./FormatChoice";

/**
 * A deck can start a game if it is legal in the format and all its cards are playable. `reason` and `format` are texts
 * to translate (`textIn`).
 */
export function deckStatus(d: DeckList, format: Format = "standard"): { ok: boolean; reason?: string; format: string } {
  const v = validateDeck(d, CARDS, format);
  const label = v.welcome ? msg("Welcome") : FORMAT_LABELS[v.format];
  if (!v.legal) return { ok: false, reason: v.errors[0], format: label };
  if (!v.playable) return { ok: false, reason: msg("Contains cards not playable yet"), format: label };
  return { ok: true, format: label };
}

/** Deck categories of the home screen: precons by family, then the player's. Labels to translate (`textIn`). */
const CATEGORIES = [
  { key: "welcome", label: msg("Beginner (welcome)") },
  { key: "fin", label: "Final Fantasy" },
  { key: "meta", label: msg("Standard meta") },
  { key: "commander", label: "Commander" },
  { key: "mine", label: msg("Your decks") },
] as const;
type Category = (typeof CATEGORIES)[number]["key"];

/** Category of a deck, from its id (precons); the player's decks go into "Your decks". */
export function deckCategory(d: DeckList): Category {
  if (!d.builtin) return "mine";
  if (d.id.startsWith("fin-")) return "fin";
  if (d.id.startsWith("meta-")) return "meta";
  if (d.id.startsWith("cmd-")) return "commander";
  return "welcome";
}

/** Bracket of a Commander deck: its label, its rank (for sorting) and its origin. */
interface Bracket {
  label: string;
  rank: number;
  /** Declared by the source of the list; otherwise estimated from the Game Changers (a floor only). */
  declared: boolean;
}

/** Estimate of `validateDeck` (no Game Changer: 1–2; up to three: 3; beyond: 4+) and its rank. */
const ESTIMATE_RANK: Record<string, number> = { "1–2": 1.5, "3": 3, "4+": 4 };

/** Bracket of a Commander deck: the one its source declares, otherwise the estimate; nothing for another deck. */
export function deckBracket(d: DeckList): Bracket | undefined {
  if (d.format !== "commander" && !d.commander?.length) return undefined;
  if (d.bracket) return { label: String(d.bracket), rank: d.bracket, declared: true };
  const estimate = validateDeck(d, CARDS, "commander").bracket;
  return estimate ? { label: `≈ ${estimate}`, rank: ESTIMATE_RANK[estimate] ?? 5, declared: false } : undefined;
}

export function DeckChoice({
  label,
  value,
  onChange,
  format = "standard",
  showLabel = true,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  /** Format of the game: a deck illegal in this format cannot be chosen. */
  format?: Format;
  /** The label above the list (not in the picker window, whose title it is). */
  showLabel?: boolean;
}) {
  const decks = useAllDecks();
  useRelayActive(); // deck art relayed if Scryfall is blocked
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  const lang = useGame((s) => s.lang);
  const t = useT();
  // One category at a time; at first, the one of the chosen deck.
  const chosen = decks.find((d) => d.id === value);
  const [category, setCategory] = useState<Category>(chosen ? deckCategory(chosen) : "welcome");
  const brackets = useMemo(() => new Map(decks.map((d) => [d.id, deckBracket(d)])), [decks]);
  const rank = (d: DeckList) => {
    return brackets.get(d.id)?.rank ?? 6;
  };
  // Commander: sorted by bracket, from the mildest to the most optimized.
  const shown = decks
    .filter((d) => deckCategory(d) === category)
    .sort((a, b) => (category === "commander" ? rank(a) - rank(b) : 0));
  return (
    <div className="deck-choice">
      {showLabel && <div className="deck-choice-label">{label}</div>}
      <div className="seg deck-categories" role="tablist" aria-label={t("{label}: categories", { label })}>
        {CATEGORIES.map((c) => {
          const n = decks.filter((d) => deckCategory(d) === c.key).length;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              className={category === c.key ? "on" : ""}
              onClick={() => setCategory(c.key)}
            >
              {textIn(lang, c.label)} <span className="deck-category-count">{n}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <div className="deck-empty">{t('No deck yet. Create one, or import a list, from "My decks".')}</div>}
      <div className="deck-list">
        {shown.map((d) => {
          const status = deckStatus(d, format);
          const cover = deckCover(d);
          const bracket = brackets.get(d.id);
          return (
            <div
              key={d.id}
              className={`deck-tile ${value === d.id ? "on" : ""} ${status.ok ? "" : "invalid"}`}
              title={status.reason && textIn(lang, status.reason)}
            >
              <button type="button" className="deck-tile-main" disabled={!status.ok} onClick={() => onChange(d.id)}>
                <div className="deck-art" style={{ backgroundImage: cover ? `url(${cover})` : undefined }}>
                  {bracket && (
                    <span
                      className="deck-bracket"
                      title={
                        bracket.declared
                          ? t("Bracket declared by the source of the list")
                          : t("Bracket estimated from the deck's Game Changers (a floor only)")
                      }
                    >
                      {t("Bracket {label}", { label: bracket.label })}
                    </span>
                  )}
                </div>
                <div className="deck-body">
                  <div className="deck-name">
                    {deckName(d, lang)} <ManaCost cost={d.colors.map((c) => `{${c}}`).join("")} size={14} />
                  </div>
                  <div className="deck-desc">{deckDescription(d, lang) ?? (d.builtin ? "" : t("My deck"))}</div>
                  <div className="deck-count">
                    {t("{n} cards", { n: d.main.reduce((n, [k]) => n + k, 0) })}
                    {status.ok ? ` · ${textIn(lang, status.format)}` : ""}
                    {d.builtin ? ` · ${t("precon")}` : ""}
                    {!status.ok && <span className="deck-invalid"> · {status.reason && textIn(lang, status.reason)}</span>}
                  </div>
                </div>
              </button>
              <button
                type="button"
                className="btn small ghost deck-edit"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeckBuilder(d.id);
                }}
              >
                {d.builtin ? t("View") : t("Edit")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The chosen deck as a summary (art, name, colors, cards, format); a click opens a window to change it (`DeckChoice`):
 * the home screen fits on one screen, whatever the number of decks.
 */
export function DeckSelect({
  label,
  value,
  onChange,
  format = "standard",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  format?: Format;
  /** Several AIs: a smaller summary, the art on the side. */
  compact?: boolean;
}) {
  const decks = useAllDecks();
  useRelayActive(); // deck art relayed if Scryfall is blocked
  const lang = useGame((s) => s.lang);
  const t = useT();
  const [open, setOpen] = useState(false);
  const d = decks.find((x) => x.id === value);
  const status = d && deckStatus(d, format);
  const cover = d && deckCover(d);
  return (
    <div className={`deck-pick ${compact ? "compact" : ""}`}>
      <div className="deck-choice-label">{label}</div>
      <button
        type="button"
        className={`deck-summary ${status && !status.ok ? "invalid" : ""}`}
        onClick={() => setOpen(true)}
        title={t("Change the deck")}
      >
        <div className="deck-summary-art" style={{ backgroundImage: cover ? `url(${cover})` : undefined }} />
        <div className="deck-summary-body">
          <div className="deck-name">
            {d ? deckName(d, lang) : "—"} {d && <ManaCost cost={d.colors.map((c) => `{${c}}`).join("")} size={14} />}
          </div>
          {d && (
            <div className="deck-count">
              {t("{n} cards", { n: d.main.reduce((n, [k]) => n + k, 0) })}
              {status?.ok ? ` · ${textIn(lang, status.format)}` : ""}
              {status && !status.ok && <span className="deck-invalid"> · {status.reason && textIn(lang, status.reason)}</span>}
            </div>
          )}
        </div>
        <span className="deck-summary-change">{t("Change")}</span>
      </button>
      {open && (
        <Dialog title={label} className="wide deck-picker" backdropClassName="full" onClose={() => setOpen(false)}>
          <DeckChoice
            label={label}
            value={value}
            format={format}
            showLabel={false}
            onChange={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

const LEVEL_KEY = "planecircle.aiLevel";

/** AI levels; `label` and `hint` are texts to translate (`textIn`). */
export const LEVELS: { level: AiLevel; label: string; hint: string }[] = [
  {
    level: "beginner",
    label: msg("Beginner"),
    hint: msg("To learn: the AI makes mistakes and does not set traps for you."),
  },
  { level: "medium", label: msg("Medium"), hint: msg("The AI plays correctly and blocks with caution.") },
  {
    level: "expert",
    label: msg("High"),
    hint: msg(
      "The AI simulates the combats and the next turns before playing (in a duel; in multiplayer, it simulates the combats).",
    ),
  },
];

function loadLevel(): AiLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return LEVELS.some((l) => l.level === v) ? (v as AiLevel) : "medium";
  } catch {
    return "medium";
  }
}

function saveLevel(level: AiLevel): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    // setting not kept
  }
}

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const openDeckBuilder = useGame((s) => s.openDeckBuilder);
  const openOnline = useGame((s) => s.openOnline);
  const openTutorial = useGame((s) => s.openTutorial);
  const openGlossary = useGlossary((s) => s.openGlossary);
  const lang = useGame((s) => s.lang);
  const t = useT();
  // New player (no lesson started): the tutorial is put forward.
  const newcomer = useTutorial((x) => x.progress.done.length === 0 && !x.progress.current);
  const decks = useAllDecks();
  const [mine, setMine] = useState(decks[0]?.id ?? "");
  // One deck per AI (three at most); at first, different decks to vary the opponents.
  const [ai, setAi] = useState(() => [1, 2, 3].map((i) => decks[i]?.id ?? decks[1]?.id ?? ""));
  const [aiCount, setAiCount] = useState(1);
  const byId = (id: string) => decks.find((d) => d.id === id);
  const me = byId(mine);
  const them = ai.slice(0, aiCount).map(byId);
  // Format of the game (Standard, or unlimited), kept from one game to the next.
  const [format, setFormat] = useState<Format>(loadFormat);
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
    // A deck that does not suit the new format (Commander: a deck with a commander) is replaced by the first one that
    // does, for the player and for each AI.
    const fits = (id: string) => {
      const d = byId(id);
      return !!d && deckStatus(d, f).ok;
    };
    const firstFit = decks.filter((d) => deckStatus(d, f).ok).map((d) => d.id);
    if (!fits(mine) && firstFit[0]) setMine(firstFit[0]);
    setAi((prev) => prev.map((id, i) => (fits(id) ? id : (firstFit[(i + 1) % firstFit.length] ?? id))));
  };
  const commander = format === "commander";
  const canStart = !!me && deckStatus(me, format).ok && them.every((d) => !!d && deckStatus(d, format).ok);
  // Best-of-three match (duel), kept from one game to the next.
  const [bo3, setBo3] = useState(() => localStorageFlag("planecircle.bo3"));
  useEffect(() => saveFlag("planecircle.bo3", bo3), [bo3]);
  const [level, setLevel] = useState<AiLevel>(loadLevel);
  const chooseLevel = (l: AiLevel) => {
    setLevel(l);
    saveLevel(l);
  };
  // The menus stand on the chosen table texture (still; "random": the first one).
  const board = useGame((s) => resolveBoardTheme(s.boardTheme, 0));
  const play = () =>
    canStart &&
    startGame(
      me.main,
      them.map((d) => (d as DeckList).main),
      undefined,
      level,
      bo3 && aiCount === 1 && !commander ? { bestOf: 3, sideboard: me.sideboard ?? [], format } : undefined,
      commander ? { player: me.commander ?? [], ai: them.map((d) => (d as DeckList).commander ?? []) } : undefined,
      { player: me.sideboard, ai: them.map((d) => (d as DeckList).sideboard ?? []) },
    );
  return (
    <div className="lobby home" data-board={board}>
      {/* Top bar (as on MTGA): the other places of the game, and the settings. */}
      <header className="lobby-top">
        <h1 className="lobby-logo">
          Planecircle <span className="build-tag">(alpha build)</span>
        </h1>
        <nav className="lobby-nav">
          <button type="button" className="btn" onClick={() => openDeckBuilder(null)}>
            {t("My decks")}
          </button>
          <button type="button" className="btn" onClick={openOnline}>
            {t("Against a player")}
          </button>
          <button type="button" className={`btn ${newcomer ? "learn" : ""}`} onClick={openTutorial}>
            {t("Learn to play")}
          </button>
          <button type="button" className="btn" onClick={() => openGlossary()}>
            {t("Glossary")}
          </button>
          <ReplayOpener />
        </nav>
        <div className="lobby-settings">
          <SoundControl />
          <LangToggle />
          <details className="lobby-more">
            <summary title={t("More settings")} aria-label={t("More settings")}>
              ⚙
            </summary>
            <div className="lobby-more-panel">
              <ImageRelayToggle />
              <CustomArtToggle />
            </div>
          </details>
        </div>
      </header>
      {/* A game against the AI: your side against theirs, on one screen. */}
      <main className="lobby-play">
        <FormatChoice value={format} onChange={chooseFormat} />
        <div className="lobby-sides">
          <section className="side-panel">
            <DeckSelect label={t("Your deck")} value={mine} onChange={setMine} format={format} />
          </section>
          <div className="lobby-vs" aria-hidden="true">
            VS
          </div>
          <section className="side-panel ai-side">
            <div className="ai-count">
              <span>{t("AI opponents")}</span>
              <div className="seg">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" className={aiCount === n ? "on" : ""} onClick={() => setAiCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <span className="hint">
                {aiCount > 1 ? t("Free-for-all multiplayer") : t("Duel")}
                {commander ? ` · ${t("{n} life", { n: 40 })}` : ""}
              </span>
            </div>
            {them.map((_, i) => (
              <DeckSelect
                key={i}
                label={aiCount > 1 ? t("Deck of AI {n}", { n: i + 1 }) : t("AI's deck")}
                value={ai[i] ?? ""}
                format={format}
                compact={aiCount > 1}
                onChange={(id) => setAi((prev) => prev.map((v, k) => (k === i ? id : v)))}
              />
            ))}
            <div className="ai-level">
              <div className="ai-count">
                <span>{t("AI level")}</span>
                <div className="seg">
                  {LEVELS.map((l) => (
                    <button
                      key={l.level}
                      type="button"
                      className={level === l.level ? "on" : ""}
                      onClick={() => chooseLevel(l.level)}
                    >
                      {textIn(lang, l.label)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hint ai-level-hint">{textIn(lang, LEVELS.find((l) => l.level === level)?.hint ?? "")}</div>
            </div>
            {aiCount === 1 && !commander && (
              <label className="toggle" title={t("Best of three games, with your sideboard between the games")}>
                <input type="checkbox" checked={bo3} onChange={(e) => setBo3(e.target.checked)} />
                {t("Match of 3 games (BO3)")}
              </label>
            )}
          </section>
        </div>
        <div className="lobby-help">
          <strong>{t("Shortcuts:")}</strong>{" "}
          {t(
            "Space = main button · Enter = pass the turn · Esc = cancel · M = mute. Drag a card to the battlefield to play it. The small dots under the phase bar set your stops.",
          )}
        </div>
        <footer className="lobby-foot">
          {t(
            "Free and non-commercial fan project. Magic: The Gathering is a trademark of Wizards of the Coast; this project is neither approved nor endorsed by Wizards. Card images and data: Scryfall.",
          )}
        </footer>
      </main>
      {/* Always in sight, bottom right (as on MTGA). */}
      <div className="play-bar">
        <button type="button" className="btn primary play-button" disabled={!canStart} onClick={play}>
          {t("Play against the AI")}
        </button>
      </div>
    </div>
  );
}

/** "Replay a game": opens an exported file ("Export the game") in the replay viewer. */
function ReplayOpener() {
  const openReplay = useGame((s) => s.openReplay);
  const notify = useGame((s) => s.notify);
  const t = useT();
  return (
    <label className="btn replay-open">
      {t("Replay a game")}
      <input
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const record = JSON.parse(await file.text()) as unknown;
            if (!isGameRecord(record)) return notify(t("This file is not a Planecircle game."));
            openReplay(record);
          } catch {
            notify(t("Unreadable file."));
          }
        }}
      />
    </label>
  );
}

/** Remembered boolean setting (storage can be unavailable: private browsing, preview). */
function localStorageFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // storage unavailable: setting not remembered
  }
}
