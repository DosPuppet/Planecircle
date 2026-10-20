/**
 * Glossary words in a rules text: underlined and colored; their definition shows on hover (mouse) or on a long press
 * (finger), and a click opens the glossary at that entry.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGame } from "../store";
import { isTouch, useLongPress } from "../touch";
import { textIn } from "../translate";
import type { GlossaryEntry } from "./entries";
import { useGlossary } from "./store";

/** Room kept between the tooltip and the edge of the screen (half its maximum width, 260 px, plus a margin). */
const EDGE = 138;

interface Tip {
  x: number;
  y: number;
  /** Above the word, when it is too low on the screen for the tooltip to fit under it. */
  above: boolean;
}

export function Term({ entry, children }: { entry: GlossaryEntry; children: string }) {
  const lang = useGame((s) => s.lang);
  const openGlossary = useGlossary((s) => s.openGlossary);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (el: Element) => {
    const r = el.getBoundingClientRect();
    const above = r.bottom > window.innerHeight * 0.7;
    const x = Math.min(Math.max(r.left + r.width / 2, EDGE), Math.max(EDGE, window.innerWidth - EDGE));
    setTip({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const longPress = useLongPress(target ? () => show(target) : undefined);
  // Finger: the tooltip stays until the next touch anywhere.
  useEffect(() => {
    if (!tip || !isTouch()) return;
    const close = () => setTip(null);
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [tip]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the definition is also in the glossary, opened by a click
    // biome-ignore lint/a11y/useKeyWithClickEvents: the glossary has its own button in the menus
    <span
      ref={setTarget}
      className="kw-term"
      data-term={entry.id}
      onMouseEnter={(e) => !isTouch() && show(e.currentTarget)}
      onMouseLeave={() => !isTouch() && setTip(null)}
      onClick={(e) => {
        if (isTouch()) return;
        e.stopPropagation();
        setTip(null);
        openGlossary(entry.id);
      }}
      {...longPress}
    >
      {children}
      {tip &&
        createPortal(
          <div className={`kw-tip term ${tip.above ? "above" : ""}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
            <strong>{textIn(lang, entry.name)}</strong>
            <span>{textIn(lang, entry.help)}</span>
          </div>,
          document.body,
        )}
    </span>
  );
}
