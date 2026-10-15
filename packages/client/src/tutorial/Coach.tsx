/**
 * The tutorial guide: a text bubble next to the element concerned, which is surrounded by a glowing ring.
 * The ring does not catch clicks: the element stays playable underneath.
 */
import type { GameView } from "@mtgx/engine";
import { Fragment, useEffect, useRef, useState } from "react";
import { ManaCost } from "../board/Card";
import { findObjectEl } from "../board/layout";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { LESSONS, lessonById } from "./lessons";
import { placeBubble, type Rect } from "./placement";
import { stepText, type Target } from "./runtime";
import { useTutorial } from "./store";

const SELECTORS: Record<Exclude<Target, object>, string[]> = {
  myLife: ['[data-tuto="life-me"]'],
  oppLife: ['[data-tuto="life-opp"]'],
  hand: ['[data-tuto="hand"]'],
  myField: ['[data-tuto="field-me"]'],
  oppField: ['[data-tuto="field-opp"]'],
  library: ['[data-tuto="library-me"]'],
  graveyard: ['[data-tuto="graveyard-me"]'],
  phaseBar: ['[data-tuto="phase-bar"]'],
  stops: ['[data-tuto="stops"]'],
  mainButton: ['[data-tuto="main-button"]'],
  endTurn: ['[data-tuto="end-turn"]'],
  log: [".sidebar .log"],
  preview: ['[data-tuto="preview"]'],
  // The panel of an opponent's spell (OK button) if it is shown, otherwise the stack.
  stack: [".stack-reveal", '[data-tuto="stack"]'],
  settings: [".sidebar .settings"],
};

function cardId(t: Extract<Target, object>, v: GameView): string | undefined {
  const owner = t.owner === "opponent" ? v.opponents[0] : v.viewer;
  if (t.zone === "stack") return v.stack.find((it) => it.name === t.card)?.id;
  if (t.zone !== "battlefield") {
    const inHand = v.hand.find((o) => o.name === t.card)?.id;
    if (inHand || t.zone === "hand") return inHand;
  }
  return v.battlefield.find((o) => o.name === t.card && o.controller === owner)?.id;
}

function targetElement(t: Target | undefined, v: GameView | null): Element | null {
  if (!t || !v) return null;
  if (typeof t === "object") {
    const id = cardId(t, v);
    return id ? findObjectEl(id) : null;
  }
  for (const sel of SELECTORS[t]) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** What the bubble should avoid covering: cards and players on the board, hand, buttons, choice windows. */
const OBSTACLES = ".board [data-oid], .board [data-oids], .action-panel, .stack-reveal, .modal, .banner";

function rectOf(el: Element | null): Rect | null {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

const keyOf = (r: Rect | null) => (r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : "");

/**
 * Ring around the target and position of the bubble, tracked on every frame
 * (animations, resizing, moving cards).
 */
function useCoachLayout(
  target: Target | undefined,
  bubble: React.RefObject<HTMLDivElement | null>,
): { ring: Rect | null; pos: { left: number; top: number } | null } {
  const view = useGame((s) => s.view);
  const [layout, setLayout] = useState<{ ring: Rect | null; pos: { left: number; top: number } | null }>({
    ring: null,
    pos: null,
  });
  const last = useRef("");
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const tick = () => {
      // Every 4 frames: enough to follow the cards, without measuring the whole board all the time.
      if (frame++ % 4 === 0) {
        const ring = rectOf(targetElement(target, view));
        const b = bubble.current;
        const size = { w: b?.offsetWidth ?? 360, h: b?.offsetHeight ?? 120 };
        const obstacles = [...document.querySelectorAll(OBSTACLES)]
          .filter((el) => !b?.contains(el))
          .map((el) => rectOf(el))
          .filter((r): r is Rect => !!r)
          .map((r) => ({ r, weight: 1 }));
        const pos = placeBubble(ring, size, { w: window.innerWidth, h: window.innerHeight }, obstacles, GAP + PAD);
        const key = `${keyOf(ring)}|${Math.round(pos.left)},${Math.round(pos.top)}`;
        if (key !== last.current) {
          last.current = key;
          setLayout({ ring, pos });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, view, bubble]);
  return layout;
}

/** Guide text: **bold** and mana symbols ({G}, {1}…). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\{[^}]+\}(?:\{[^}]+\})*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p}`;
        if (p.startsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("{")) return <ManaCost key={key} cost={p} size={15} />;
        return <Fragment key={key}>{p}</Fragment>;
      })}
    </>
  );
}

const GAP = 14;
const PAD = 6;

/**
 * A step about the log or the settings opens their drawer (closed again afterwards if the guide opened it); a step about
 * the preview keeps the floating preview open (PLAN-V: no sidebar).
 */
function useShownTarget(target: Target | undefined) {
  useEffect(() => {
    const game = useGame.getState();
    if (target === "log" || target === "settings") {
      if (game.drawerOpen) return;
      game.setDrawerOpen(true);
      return () => useGame.getState().setDrawerOpen(false);
    }
    if (target === "preview") {
      game.setPreviewHold(true);
      return () => useGame.getState().setPreviewHold(false);
    }
  }, [target]);
}

export function Coach() {
  const tuto = useTutorial();
  const t = useT();
  const lang = useGame((s) => s.lang);
  const lesson = lessonById(tuto.lessonId);
  const step = lesson?.steps[tuto.step];
  const ref = useRef<HTMLDivElement>(null);
  const { ring: rect, pos } = useCoachLayout(tuto.finished ? undefined : step?.target, ref);
  const [hidden, setHidden] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bubble reappears at every new step
  useEffect(() => setHidden(false), [tuto.lessonId, tuto.step, tuto.finished]);
  useShownTarget(tuto.finished ? undefined : step?.target);
  if (!lesson || !step) return null;
  const index = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[index + 1];
  const tip = step.free && tuto.ctx ? step.tips?.find((x) => tuto.ctx && x.when(tuto.ctx))?.text : undefined;

  if (hidden) {
    return (
      <button type="button" className="coach-reopen" onClick={() => setHidden(false)}>
        {t("Guide")}
      </button>
    );
  }

  return (
    <>
      {rect && !tuto.finished && (
        <div
          className={`coach-ring ${step.next ? "dim" : ""}`}
          style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }}
        />
      )}
      <div
        ref={ref}
        className={`coach ${tuto.finished ? "done" : ""}`}
        style={{
          width: "min(380px, calc(100vw - 24px))",
          left: pos?.left ?? 12,
          top: pos?.top ?? 70,
          visibility: pos ? "visible" : "hidden",
        }}
        role="dialog"
      >
        <div className="coach-head">
          <span>{t("Lesson {n}/{total} · {title}", { n: index + 1, total: LESSONS.length, title: lesson.title })}</span>
          {!tuto.finished && (
            <span className="coach-count">
              {tuto.step + 1}/{lesson.steps.length}
            </span>
          )}
        </div>
        {tuto.finished ? (
          <>
            <div className="coach-text">
              <strong>{t("Lesson complete!")}</strong>{" "}
              {nextLesson
                ? t('Up next: "{title}".', { title: nextLesson.title })
                : t("You have finished the whole tutorial. Well done!")}
            </div>
            <div className="coach-actions">
              {nextLesson && (
                <button type="button" className={`btn small ${tuto.chain ? "primary" : ""}`} onClick={tuto.startNext}>
                  {t("Next lesson")}
                </button>
              )}
              <button type="button" className={`btn small ${tuto.chain && nextLesson ? "" : "primary"}`} onClick={tuto.quit}>
                {t("Tutorial menu")}
              </button>
              <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title={t("Hide the guide")}>
                {t("Hide")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="coach-text">
              <RichText text={textIn(lang, stepText(step, tuto.ctx))} />
            </div>
            {tip && (
              <div className="coach-tip">
                <RichText text={textIn(lang, tip)} />
              </div>
            )}
            <div className="coach-actions">
              {step.next && (
                <button type="button" className="btn small primary coach-next" onClick={tuto.next}>
                  {tuto.step + 1 === lesson.steps.length ? t("Finish") : t("Next")}
                </button>
              )}
              <span className="coach-spacer" />
              {step.free && (
                <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title={t("Hide the guide")}>
                  {t("Hide")}
                </button>
              )}
              <button type="button" className="btn small ghost" onClick={tuto.restart} title={t("Restart the lesson")}>
                {t("Restart")}
              </button>
              <button type="button" className="btn small ghost" onClick={tuto.quit}>
                {t("Quit")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
