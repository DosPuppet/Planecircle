/**
 * Generic display of any question asked by the engine (ChoiceRequest):
 * choose cards or players, an order, yes/no, a number, a division.
 */
import type { ChoiceValue, GameView, ObjectView } from "@mtgx/engine";
import { useEffect, useState } from "react";
import { Card } from "../board/Card";
import { Dialog } from "../Dialog";
import { faceName } from "../i18n";
import { useLocalize, useLocalizedView, useT } from "../localize";
import { useGame } from "../store";
import { boardPick, choiceSource, type PickRequest, pickValid, shortPrompt, shownOptions, togglePick } from "./boardChoice";
import { NameSearch } from "./NameSearch";
import { arrangedTopOrder, clearTopOrder, isScryOrSurveil, ScryArrange } from "./ScryArrange";
import { ZoneTabbed } from "./ZoneTabs";

type ChoiceView = Extract<NonNullable<GameView["pending"]>, { kind: "choice" }>;

function Label({ id, objects, view }: { id: string; objects: ObjectView[]; view: GameView }) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  // Labels given by the engine for the options that are neither cards nor players.
  const labels = view.pending?.kind === "choice" ? view.pending.request?.labels : undefined;
  if (labels?.[id]) return <>{labels[id]}</>;
  const o = objects.find((x) => x.id === id);
  if (o) return <>{faceName(o, lang)}</>;
  return <>{id === view.viewer ? t("You") : (view.players[id]?.name ?? id)}</>;
}

function Option({
  id,
  objects,
  view,
  selected,
  onClick,
}: {
  id: string;
  objects: ObjectView[];
  view: GameView;
  selected?: boolean;
  onClick?: () => void;
}) {
  const o = objects.find((x) => x.id === id);
  if (o) return <Card face={o} obj={o} width="var(--pick-w)" glow={selected ? "selected" : null} onClick={onClick} />;
  return (
    <button type="button" className={`btn choice ${selected ? "primary" : ""}`} onClick={onClick}>
      <Label id={id} objects={objects} view={view} />
    </button>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Choice among permanents (MTGA-style): no window; the options are highlighted on the board and this panel recalls the
 * effect (resolving card, prompt) and the selection. The main button (Space) also confirms.
 */
function BoardChoicePanel({ view, req }: { view: GameView; req: PickRequest }) {
  const decide = useGame((s) => s.decide);
  const selection = useGame((s) => s.selection);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  const source = choiceSource(view);
  const effect = source?.effect && loc(source.effect);
  const valid = pickValid(req, selection);
  return (
    <div className="board-choice" role="dialog" aria-label={req.prompt}>
      {source && (
        <>
          <div className="board-choice-label">
            <strong>{faceName(source.face, lang)}</strong>
          </div>
          <Card face={source.face} width="var(--board-choice-w)" hoverable />
          {effect && <div className="board-choice-effect">{effect}</div>}
        </>
      )}
      <div className="effect-frame">
        <span className="effect-frame-kind">{t("You choose")}</span>
        {capitalize(shortPrompt(req.prompt, source && { face: { ...source.face, name: faceName(source.face, lang) }, effect }))}
      </div>
      <p className="board-choice-hint">
        {req.max > 1
          ? t("Click the highlighted cards — selection: {n} / {max}", { n: selection.length, max: req.max })
          : t("Click the highlighted card — selection: {n} / {max}", { n: selection.length, max: req.max })}
      </p>
      <div className="board-choice-actions">
        <button
          type="button"
          className="btn small ghost"
          onClick={() => useGame.setState({ selection: req.suggested.map(String) })}
        >
          {t("Suggestion")}
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={!valid}
          onClick={() => decide({ type: "choose", values: selection })}
        >
          {selection.length === 0 && req.min === 0 ? t("None") : t("Confirm")}
        </button>
      </div>
    </div>
  );
}

export function ChoicePrompt({ view: raw }: { view: GameView }) {
  // Card names of the prompts and engine labels in the interface language.
  const view = useLocalizedView(raw);
  const pick = boardPick(view);
  if (pick) return <BoardChoicePanel view={view} req={pick} />;
  return <ChoiceModal view={view} />;
}

function ChoiceModal({ view }: { view: GameView }) {
  const decide = useGame((s) => s.decide);
  const keepAnswer = useGame((s) => s.keepAnswer);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  const p = view.pending as ChoiceView;
  const req = p.request;
  const [values, setValues] = useState<ChoiceValue[]>(req?.suggested ?? []);
  const [query, setQuery] = useState("");
  // "Always answer this way" (a trigger's "may", PLAN-L L8).
  const [always, setAlways] = useState(false);
  // New question: back to the engine's suggestion.
  useEffect(() => {
    setValues(req?.suggested ?? []);
    setQuery("");
    setAlways(false);
  }, [req]);
  // Scry: the order of the cards left on top was arranged with the first question (ScryArrange).
  const arranged = req?.type === "order" && req.intent === "scryOrder" ? arrangedTopOrder(req.items) : null;
  useEffect(() => {
    if (!arranged) return;
    clearTopOrder();
    decide({ type: "choose", values: arranged });
  }, [arranged, decide]);
  if (!req || arranged) return null;
  const objects = p.objects ?? [];
  const send = (v: ChoiceValue[]) => decide({ type: "choose", values: v });
  if (req.type === "pick" && isScryOrSurveil(req))
    return <ScryArrange req={req} view={view} objects={objects} onConfirm={send} />;

  let body: React.ReactNode = null;
  let valid = true;
  switch (req.type) {
    case "pick": {
      const toggle = (id: string) => setValues((cur) => togglePick(req, cur.map(String), id));
      valid = values.length >= req.min && values.length <= req.max;
      // Long lists (a library searched, creature types…): search, and the selection first.
      const long = req.options.length > 20;
      // What the search reads: a card's name in the interface language (and its English name), otherwise the label.
      const searchable = (id: string) => {
        const o = objects.find((x) => x.id === id);
        return o ? `${faceName(o, lang)} ${o.name}` : loc(req.labels?.[id] ?? id);
      };
      const cards = req.options.every((id) => objects.some((x) => x.id === id));
      const shown = shownOptions(req.options, values.map(String), query, searchable, cards);
      // The rest of another player's hand looked at (Deep-Cavern Bat: its lands), shown greyed after the options.
      const unchoosable = (req.unchoosable ?? []).flatMap((id) => objects.filter((x) => x.id === id));
      body = (
        <>
          {long && (
            <input
              className="choice-search"
              placeholder={t("Search…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: the search is the main action of this window
              autoFocus
            />
          )}
          {/* Cards of several graveyards (or of exile): one tab per zone. */}
          <ZoneTabbed view={view} objects={objects} ids={shown} selected={values.map(String)} lang={lang}>
            {(inTab) => (
              <div className={`hand-picker ${long ? "long" : ""}`}>
                {inTab.map((id) => (
                  <Option
                    key={id}
                    id={id}
                    objects={objects}
                    view={view}
                    selected={values.includes(id)}
                    onClick={() => toggle(id)}
                  />
                ))}
                {unchoosable.map((o) => (
                  <Card key={o.id} face={o} obj={o} width="var(--pick-w)" dim />
                ))}
              </div>
            )}
          </ZoneTabbed>
          <p className="hint">
            {req.min === req.max
              ? t("Choose {n} — selection: {count}", { n: req.min, count: values.length })
              : t("Choose from {min} to {max} — selection: {count}", {
                  min: req.min,
                  max: req.max,
                  count: values.length,
                })}
            {unchoosable.length > 0 && ` — ${t("the greyed cards can't be chosen")}`}
          </p>
        </>
      );
      break;
    }
    case "order": {
      const move = (i: number, d: number) =>
        setValues((cur) => {
          const next = [...cur];
          const j = i + d;
          if (j < 0 || j >= next.length) return cur;
          [next[i], next[j]] = [next[j] as ChoiceValue, next[i] as ChoiceValue];
          return next;
        });
      body = (
        <div className="hand-picker ordered">
          {values.map((id, i) => (
            <div key={String(id)} className="order-item">
              <span className="order-rank">{i + 1}</span>
              <Option id={String(id)} objects={objects} view={view} />
              <div className="order-moves">
                <button type="button" className="btn small" disabled={i === 0} onClick={() => move(i, -1)}>
                  ←
                </button>
                <button type="button" className="btn small" disabled={i === values.length - 1} onClick={() => move(i, 1)}>
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      );
      break;
    }
    case "yesNo": {
      // The card asking the question (resolving spell or ability), as in the panel of the choices on the board.
      const source = choiceSource(view);
      const answer = (v: 0 | 1) => {
        if (always && req.remember) keepAnswer(req.remember, v);
        send([v]);
      };
      return (
        <Dialog
          title={req.prompt}
          before={
            source && (
              <div className="yes-no-source">
                <Card face={source.face} width="var(--board-choice-w)" hoverable />
                {source.effect && <div className="board-choice-effect">{loc(source.effect)}</div>}
              </div>
            )
          }
        >
          {req.remember && (
            <label className="toggle always-answer">
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
              {t("Always answer this way for this ability")}
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => answer(0)}>
              {t("No")}
            </button>
            <button type="button" className="btn primary" onClick={() => answer(1)}>
              {t("Yes")}
            </button>
          </div>
        </Dialog>
      );
    }
    case "name": {
      // Card name, land card name, creature type: search in the whole catalog (without the opponent's decklist).
      const value = String(values[0] ?? "");
      valid = !!value;
      body = (
        <NameSearch
          of={req.of}
          featured={req.featured}
          suggested={String(req.suggested[0] ?? "")}
          value={value}
          onChange={(n) => setValues([n])}
          onSubmit={(n) => send([n])}
        />
      );
      break;
    }
    case "number": {
      const v = Number(values[0] ?? req.min);
      body = (
        <div className="x-picker">
          <input type="range" min={req.min} max={req.max} value={v} onChange={(e) => setValues([Number(e.target.value)])} />
          <span className="x-value">{v}</span>
        </div>
      );
      break;
    }
    case "divide": {
      const nums = req.among.map((_, i) => Number(values[i] ?? 0));
      const sum = nums.reduce((a, b) => a + b, 0);
      // Same checks as the engine: at least `minEach` each; trample, the player only after lethal damage to each
      // blocker.
      const tooFew = !!req.minEach && nums.some((n) => n < (req.minEach as number));
      const lethal = req.lethal;
      const trampleTooEarly =
        !!lethal &&
        (nums[req.among.indexOf(lethal.player)] ?? 0) > 0 &&
        Object.entries(lethal.needs).some(([id, need]) => (nums[req.among.indexOf(id)] ?? 0) < need);
      valid = sum === req.total && !tooFew && !trampleTooEarly;
      const bump = (i: number, d: number) => setValues(nums.map((n, k) => (k === i ? Math.max(0, n + d) : n)));
      body = (
        <>
          <div className="divide-list">
            {req.among.map((id, i) => (
              <div key={id} className="divide-row">
                <span className="divide-name">
                  <Label id={id} objects={objects} view={view} />
                  {req.lethal?.needs[id] !== undefined && <em> {t("(lethal: {n})", { n: req.lethal.needs[id] })}</em>}
                </span>
                <button type="button" className="btn small" onClick={() => bump(i, -1)}>
                  −
                </button>
                <span className="divide-value">{nums[i]}</span>
                <button type="button" className="btn small" disabled={sum >= req.total} onClick={() => bump(i, 1)}>
                  +
                </button>
              </div>
            ))}
          </div>
          <p className="hint">
            {t("Assigned: {sum} / {total}", { sum, total: req.total })}
            {trampleTooEarly && ` — ${t("trample: lethal damage to each blocker first")}`}
            {tooFew && ` — ${t("at least {n} for each", { n: req.minEach ?? 0 })}`}
          </p>
        </>
      );
      break;
    }
  }

  return (
    <Dialog title={req.prompt} className="wide">
      {body}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => setValues(req.suggested)}>
          {t("Suggestion")}
        </button>
        <button type="button" className="btn primary" disabled={!valid} onClick={() => send(values)}>
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}
