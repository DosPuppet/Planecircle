/**
 * Loading screen of the 3D board (PLAN-W): over the board, in the table texture's colors, a progress bar and the step
 * under way (the engine, the arena, the cards), until the table is ready. Eager (it shows while the board's lazy chunks
 * are loading); styles inline, outside the budget of index.css. Above everything while it shows (the user: nothing of
 * the board, its hand or its prompts drawn over it): a portal into the page, fixed, on top. A ring turns as long as it
 * shows, a CSS transform animation (the compositor plays it even while the page's script is busy building the arena:
 * it never looks frozen).
 */
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useT } from "../localize";
import { useBoardTheme } from "./Board";

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  background: "radial-gradient(ellipse 120% 95% at 50% 45%, var(--bd-1), var(--bd-0) 75%)",
  transition: "opacity 0.45s ease",
};
const TITLE: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "1.35rem", color: "var(--gold)", letterSpacing: 1 };
const TRACK: CSSProperties = {
  width: "min(420px, 70vw)",
  height: 8,
  borderRadius: 4,
  background: "rgba(255, 255, 255, 0.08)",
  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.08)",
  overflow: "hidden",
};
const FILL: CSSProperties = {
  height: "100%",
  borderRadius: 4,
  background: "linear-gradient(90deg, #b8862e, var(--gold))",
  boxShadow: "0 0 10px color-mix(in srgb, var(--gold) 60%, transparent)",
  transition: "width 0.3s ease",
};
const STEP: CSSProperties = { fontSize: "0.8rem", color: "var(--dim)", minHeight: "1.2em" };
const RING: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "3px solid rgba(255, 255, 255, 0.1)",
  borderTopColor: "var(--gold)",
  animation: "board3d-spin 0.9s linear infinite",
  willChange: "transform",
};
/** The ring's turn (its own rule: index.css has no room left). */
const SPIN = "@keyframes board3d-spin { to { transform: rotate(360deg); } }";

/**
 * `progress` in [0, 1] (none: a rebuild, the ring alone); `step`: what is loading now; `leaving`: fading out (the table
 * is ready).
 */
export function Loading3D({ progress, step, leaving = false }: { progress?: number; step: string; leaving?: boolean }) {
  const t = useT();
  // The table texture's colors (its variables hang on `data-board`: the portal leaves the board).
  const theme = useBoardTheme();
  const percent = progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return createPortal(
    <div
      className="board3d-loading"
      data-board={theme}
      role="progressbar"
      aria-label={t("Loading the 3D table")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ ...OVERLAY, opacity: leaving ? 0 : 1, pointerEvents: leaving ? "none" : undefined }}
    >
      <style>{SPIN}</style>
      <div style={RING} />
      <div style={TITLE}>{t("Preparing the 3D table…")}</div>
      {percent !== undefined && (
        <div style={TRACK}>
          <div style={{ ...FILL, width: `${percent}%` }} />
        </div>
      )}
      <div style={STEP}>{step}</div>
    </div>,
    document.body,
  );
}

/** The board while the 3D board's code loads (three.js, its lazy chunks): the loading screen alone, at its start. */
export function Loading3DBoard() {
  const theme = useBoardTheme();
  const t = useT();
  return (
    <div className="board" data-board={theme}>
      <Loading3D progress={0.05} step={t("Loading the 3D engine…")} />
    </div>
  );
}
