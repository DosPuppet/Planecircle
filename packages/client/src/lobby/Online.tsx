/**
 * Online game against other players: nickname, deck, create a room of 2 to 4 players (code and link to share) or join
 * one. The game starts on the server as soon as the room is full.
 */

import type { AiLevel } from "@mtgx/ai";
import { FORMAT_LABELS, ONLINE_FORMATS } from "@mtgx/cards";
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

function Waiting() {
  const online = useGame((s) => s.online);
  const leaveRoom = useGame((s) => s.leaveRoom);
  const notify = useGame((s) => s.notify);
  const t = useT();
  const code = online?.code ?? "";
  const seats = online?.match?.seats ?? 2;
  const missing = Math.max(0, seats - (online?.players.length ?? 1));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      notify(t("Link copied: send it to your opponent."));
    } catch {
      notify(t("Link: {url}", { url: inviteLink(code) }));
    }
  };
  return (
    <div className="online-waiting">
      <div className="hint">{t("Room code")}</div>
      <div className="room-code" data-testid="room-code">
        {code}
      </div>
      <p className="hint">
        {seats > 2
          ? t("Give this code (or the link) to your opponents. The game starts when the {n} players are there.", {
              n: seats,
            })
          : t("Give this code (or the link) to your opponent. The game starts as soon as they arrive.")}
        {online?.match?.format === "unlimited" && ` ${t("Format: unlimited (all the cards of the catalog).")}`}
        {online?.match?.format === "commander" && ` ${t("Format: Commander (40 life).")}`}
      </p>
      {seats > 2 && (
        <ul className="online-seats" data-testid="online-seats">
          {online?.players.map((p) => (
            <li key={p.seat}>
              {p.name}
              {p.ai ? ` · ${t("AI")}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="lobby-actions">
        <button type="button" className="btn primary" onClick={copy}>
          {t("Copy the link")}
        </button>
        <button type="button" className="btn" onClick={leaveRoom}>
          {t("Cancel")}
        </button>
      </div>
      <div className="waiting-dots">
        {missing > 1
          ? t("Waiting for {n} players", { n: missing })
          : missing === 1 && seats > 2
            ? t("Waiting for a player")
            : t("Waiting for an opponent")}
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
  const decks = useAllDecks();
  const [name, setName] = useState(loadName);
  const [format, setFormat] = useState<Format>(() => {
    const f = loadFormat();
    return ONLINE_FORMATS.includes(f) ? f : "standard";
  });
  const chooseFormat = (f: Format) => {
    setFormat(f);
    saveFormat(f);
  };
  const [deckId, setDeckId] = useState(() => decks.find((d) => deckStatus(d, format).ok)?.id ?? "");
  const [code, setCode] = useState(codeFromUrl);
  const [bo3, setBo3] = useState(false);
  // Number of players of the created room (2 to 4), including seats held by the server's AI (PLAN-E, E14).
  const [players, setPlayers] = useState<2 | 3 | 4>(2);
  const [aiSeats, setAiSeats] = useState(0);
  const [aiLevel, setAiLevel] = useState<AiLevel>("medium");
  const ai = Math.min(aiSeats, players - 1);
  const commander = format === "commander";
  const deck = decks.find((d) => d.id === deckId);
  const ready = !!deck && deckStatus(deck, format).ok && name.trim().length > 0;
  const busy = online?.status === "connecting" && !online.error;
  const waiting = online?.status === "waiting";

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
        {waiting ? (
          <Waiting />
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
            <FormatChoice value={format} onChange={chooseFormat} formats={ONLINE_FORMATS} />
            {commander && <p className="hint">{t("Commander: joining a Commander room requires a deck with a commander.")}</p>}
            <DeckSelect
              label={
                format === "unlimited"
                  ? t("Your deck (unlimited)")
                  : t("Your deck (legal in {format})", { format: FORMAT_LABELS[format] })
              }
              value={deckId}
              onChange={setDeckId}
              format={format}
            />
            {online?.error && <div className="v-error online-error">{textIn(lang, online.error)}</div>}
            <div className="online-actions">
              <div className="online-card">
                <h3>{t("Create a game")}</h3>
                <p className="hint">{t("You will receive a code to share.")}</p>
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
                    deck &&
                    createRoom(name.trim(), deck.main, {
                      sideboard: commander ? [] : deck.sideboard,
                      bestOf: bo3 && players === 2 && !commander && ai === 0 ? 3 : 1,
                      format,
                      players,
                      ...(commander ? { commander: deck.commander ?? [] } : {}),
                      ...(ai > 0 ? { ai: { count: ai, level: players > 2 && aiLevel === "expert" ? "medium" : aiLevel } } : {}),
                    })
                  }
                >
                  {t("Create")}
                </button>
              </div>
              <div className="online-card">
                <h3>{t("Join")}</h3>
                <p className="hint">{t("The room sets its format: your deck must be legal in it.")}</p>
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
                  onClick={() =>
                    deck &&
                    joinRoom(
                      code,
                      name.trim(),
                      deck.main,
                      commander ? [] : deck.sideboard,
                      commander ? deck.commander : undefined,
                    )
                  }
                >
                  {t("Join")}
                </button>
              </div>
            </div>
            {!ready && (
              <p className="hint">
                {format === "unlimited"
                  ? t("Choose a nickname and a playable deck.")
                  : t("Choose a nickname and a deck legal in {format} and playable.", { format: FORMAT_LABELS[format] })}
              </p>
            )}
          </>
        )}
        <div className="lobby-actions">
          <button type="button" className="btn ghost" onClick={backToLobby}>
            ← {t("Home")}
          </button>
        </div>
      </div>
    </div>
  );
}
