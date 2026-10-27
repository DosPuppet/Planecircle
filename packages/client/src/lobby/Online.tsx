/**
 * Online game against other players: nickname, create a room of 2 to 4 players (format, AI seats, BO3; code and link to
 * share) or join one with its code. In the room, each player chooses their deck, legal in the room's format, and says
 * they are ready: the match starts when the room is full and everyone is ready. After a match, the players come back to
 * the room to choose another deck for the next one (or play the rematch with the same deck).
 */

import type { AiLevel } from "@mtgx/ai";
import { type DeckEntries, type DeckList, FORMAT_LABELS, ONLINE_FORMATS } from "@mtgx/cards";
import type { Format } from "@mtgx/engine";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { resolveBoardTheme } from "../boardThemes";
import { useAllDecks } from "../decks/store";
import { LangToggle } from "../LangToggle";
import { useT } from "../localize";
import { loadName, useGame } from "../store";
import { textIn } from "../translate";
import { FormatChoice, loadFormat, saveFormat } from "./FormatChoice";
import { DeckSelect, deckStatus, LEVELS } from "./Lobby";

/** Code prefilled by an invitation link (?room=CODE). */
function codeFromUrl(): string {
  try {
    return (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();
  } catch {
    return "";
  }
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

/** Deck last chosen in an online room (storage can be unavailable: private browsing, preview). */
const DECK_KEY = "planecircle.onlineDeck";

function loadDeckId(): string {
  try {
    return localStorage.getItem(DECK_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveDeckId(id: string): void {
  try {
    localStorage.setItem(DECK_KEY, id);
  } catch {
    // choice not kept
  }
}

const sameEntries = (a: DeckEntries, b: DeckEntries) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The room, before the first match (code to share, players arriving) or after a match: the players, each one's state,
 * and the deck chosen for the next match.
 */
function Room() {
  const online = useGame((s) => s.online);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const chooseDeck = useGame((s) => s.chooseDeck);
  const unready = useGame((s) => s.unready);
  const notify = useGame((s) => s.notify);
  const t = useT();
  const decks = useAllDecks();
  const format: Format = online?.match?.format ?? "standard";
  const commander = format === "commander";
  const usable = (id: string) => {
    const d = decks.find((x) => x.id === id);
    return d && deckStatus(d, format).ok ? d : undefined;
  };
  // Between two matches: the deck just played; otherwise the last one chosen online; otherwise the first legal one.
  const [deckId, setDeckId] = useState(() => {
    const played = online?.deck?.main.length
      ? decks.find((d) => sameEntries(d.main, online.deck?.main ?? []) && deckStatus(d, format).ok)
      : undefined;
    return played?.id ?? usable(loadDeckId())?.id ?? decks.find((d) => deckStatus(d, format).ok)?.id ?? "";
  });
  const deck = usable(deckId);
  if (!online) return null;
  const code = online.code ?? "";
  const seats = online.match?.seats ?? 2;
  const missing = Math.max(0, seats - online.players.length);
  const over = online.status === "over";
  const me = online.players.find((p) => p.seat === online.seat);
  const ready = !!me?.ready;
  const send = (d: DeckList) => {
    saveDeckId(d.id);
    chooseDeck({ main: d.main, ...(commander ? { commander: d.commander ?? [] } : { sideboard: d.sideboard }) });
  };
  // Already ready: another deck chosen is sent at once (the player stays ready).
  const pick = (id: string) => {
    setDeckId(id);
    const d = usable(id);
    if (ready && d) send(d);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      notify(t("Link copied: send it to your opponent."));
    } catch {
      notify(t("Link: {url}", { url: inviteLink(code) }));
    }
  };
  const others = online.players.filter((p) => p.seat !== online.seat);
  const gone = others.filter((p) => !p.connected);
  const choosing = others.filter((p) => p.connected && !p.ready);
  const winner = online.match?.winner ? online.players.find((p) => p.seat === online.match?.winner) : undefined;
  return (
    <div className="online-waiting online-room">
      {over ? (
        <>
          <h2>{t("Next match")}</h2>
          <p className="hint">
            {winner
              ? winner.seat === online.seat
                ? t("You won the last match.")
                : t("{name} won the last match.", { name: winner.name })
              : t("The last match was a draw.")}{" "}
            {t("Choose your deck for the next one, or keep the same.")}
          </p>
        </>
      ) : (
        <>
          <div className="hint">{t("Room code")}</div>
          <div className="room-code" data-testid="room-code">
            {code}
          </div>
          <p className="hint">
            {seats > 2
              ? t(
                  "Give this code (or the link) to your opponents. The game starts when the {n} players have chosen their deck.",
                  {
                    n: seats,
                  },
                )
              : t("Give this code (or the link) to your opponent. The game starts when you have both chosen your deck.")}
            {format === "unlimited" && ` ${t("Format: unlimited (all the cards of the catalog).")}`}
            {commander && ` ${t("Format: Commander (40 life).")}`}
          </p>
        </>
      )}
      <ul className="online-seats" data-testid="online-seats">
        {online.players.map((p) => (
          <li key={p.seat} className={p.ready ? "ready" : ""} data-seat={p.seat}>
            <span className="seat-name">{p.seat === online.seat ? t("{name} (you)", { name: p.name }) : p.name}</span>
            <span className="seat-state">
              {p.ai ? t("AI") : !p.connected ? t("disconnected") : p.ready ? t("ready") : t("choosing a deck")}
            </span>
          </li>
        ))}
        {Array.from({ length: missing }, (_, i) => (
          <li key={`free-${i}`} className="free">
            <span className="seat-name">{t("Free seat")}</span>
          </li>
        ))}
      </ul>
      <DeckSelect
        label={
          format === "unlimited"
            ? t("Your deck (unlimited)")
            : t("Your deck (legal in {format})", { format: FORMAT_LABELS[format] })
        }
        value={deckId}
        onChange={pick}
        format={format}
      />
      {commander && <p className="hint">{t("Commander: your deck needs a commander.")}</p>}
      <div className="lobby-actions">
        {ready ? (
          <button type="button" className="btn" data-testid="room-unready" onClick={unready}>
            {t("Not ready")}
          </button>
        ) : (
          <button
            type="button"
            className="btn primary big"
            data-testid="room-ready"
            disabled={!deck}
            onClick={() => deck && send(deck)}
          >
            {t("Ready")}
          </button>
        )}
        {!over && (
          <button type="button" className="btn" onClick={copy}>
            {t("Copy the link")}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={leaveRoom}>
          {t("Leave the room")}
        </button>
      </div>
      <div className={missing > 0 || ready ? "waiting-dots" : "hint"}>
        {missing > 1
          ? t("Waiting for {n} players", { n: missing })
          : missing === 1 && seats > 2
            ? t("Waiting for a player")
            : missing === 1
              ? t("Waiting for an opponent")
              : !ready
                ? t("Choose your deck, then click Ready.")
                : gone.length > 0
                  ? t("Not connected: {names}", { names: gone.map((p) => p.name).join(", ") })
                  : t("Waiting for {names} to choose their deck", { names: choosing.map((p) => p.name).join(", ") })}
      </div>
    </div>
  );
}

export function Online() {
  const online = useGame((s) => s.online);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const backToLobby = useGame((s) => s.backToLobby);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const [name, setName] = useState(loadName);
  const [format, setFormat] = useState<Format>(() => {
    const f = loadFormat();
    return ONLINE_FORMATS.includes(f) ? f : "standard";
  });
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
  };
  const [code, setCode] = useState(codeFromUrl);
  const [bo3, setBo3] = useState(false);
  // Number of players of the created room (2 to 4), including seats held by the server's AI (PLAN-E, E14).
  const [players, setPlayers] = useState<2 | 3 | 4>(2);
  const [aiSeats, setAiSeats] = useState(0);
  const [aiLevel, setAiLevel] = useState<AiLevel>("medium");
  const ai = Math.min(aiSeats, players - 1);
  const commander = format === "commander";
  const ready = name.trim().length > 0;
  const busy = online?.status === "connecting" && !online.error;
  // In a room: before the first match, or between two matches (back from the result to change the deck).
  const inRoom = !!online?.code && (online.status === "waiting" || online.status === "over");

  // The menus stand on the chosen table texture (still; "random": the first one).
  const board = useGame((s) => resolveBoardTheme(s.boardTheme, 0));
  return (
    <div className="lobby online" data-board={board}>
      <header className="lobby-head">
        <div className="lobby-sound">
          <SoundControl />
          <LangToggle />
        </div>
        <h1>{t("Online game")}</h1>
        <p className="hint">{t("From 2 to 4 players, in the format and number chosen by the one who creates the game")}</p>
      </header>
      <div className="lobby-body">
        {inRoom ? (
          <Room />
        ) : (
          <>
            <label className="online-field">
              <span className="deck-choice-label">{t("Your nickname")}</span>
              <input
                className="search"
                value={name}
                maxLength={20}
                placeholder={t("Nickname visible to your opponent")}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {online?.error && <div className="v-error online-error">{textIn(lang, online.error)}</div>}
            <div className="online-actions">
              <div className="online-card">
                <h3>{t("Create a game")}</h3>
                <p className="hint">{t("You will receive a code to share; each player chooses their deck in the room.")}</p>
                <FormatChoice value={format} onChange={chooseFormat} formats={ONLINE_FORMATS} />
                <div className="ai-count">
                  <span>{t("Players")}</span>
                  <div className="seg">
                    {([2, 3, 4] as const).map((n) => (
                      <button key={n} type="button" className={players === n ? "on" : ""} onClick={() => setPlayers(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ai-count">
                  <span>{t("of which AI")}</span>
                  <div className="seg">
                    {Array.from({ length: players }, (_, n) => n).map((n) => (
                      <button key={n} type="button" className={ai === n ? "on" : ""} onClick={() => setAiSeats(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {ai > 0 && (
                  <div className="ai-count">
                    <span>{t("Level")}</span>
                    <div className="seg">
                      {LEVELS.filter((l) => l.level !== "expert" || players === 2).map((l) => (
                        <button
                          key={l.level}
                          type="button"
                          className={aiLevel === l.level ? "on" : ""}
                          onClick={() => setAiLevel(l.level)}
                          title={textIn(lang, l.hint)}
                        >
                          {textIn(lang, l.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {players === 2 && !commander && ai === 0 && (
                  <label className="toggle" title={t("Best of three games, with your sideboard between the games")}>
                    <input type="checkbox" checked={bo3} onChange={(e) => setBo3(e.target.checked)} />
                    {t("Match of 3 games (BO3)")}
                  </label>
                )}
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy}
                  onClick={() =>
                    createRoom(name.trim(), {
                      bestOf: bo3 && players === 2 && !commander && ai === 0 ? 3 : 1,
                      format,
                      players,
                      ...(ai > 0 ? { ai: { count: ai, level: players > 2 && aiLevel === "expert" ? "medium" : aiLevel } } : {}),
                    })
                  }
                >
                  {t("Create")}
                </button>
              </div>
              <div className="online-card">
                <h3>{t("Join")}</h3>
                <p className="hint">{t("The room sets its format: you choose your deck once inside.")}</p>
                <input
                  className="search code-input"
                  value={code}
                  maxLength={6}
                  placeholder="CODE"
                  aria-label={t("Room code")}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy || code.length !== 6}
                  onClick={() => joinRoom(code, name.trim())}
                >
                  {t("Join")}
                </button>
              </div>
            </div>
            {!ready && <p className="hint">{t("Choose a nickname.")}</p>}
          </>
        )}
        {/* In a room, "Leave the room" takes its place. */}
        {!inRoom && (
          <div className="lobby-actions">
            <button type="button" className="btn ghost" onClick={backToLobby}>
              ← {t("Home")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
