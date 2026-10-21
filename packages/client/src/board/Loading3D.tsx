/**
 * Loading screen of the 3D board (PLAN-W): over the board, in the table texture's colors, a progress bar and the step
 * under way (the engine, the arena, the cards), until the table is ready. Eager (it shows while the board's lazy chunks
 * are loading); styles inline, outside the budget of index.css. The prompts (mulligan) stay above it, outside the board.
 */
import type { CSSProperties } from "react";
import { useT } from "../localize";
import { useBoardTheme } from "./Board";

const OVERLAY: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 60,
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

/** `progress` in [0, 1]; `step`: what is loading now; `leaving`: fading out (the table is ready). */
export function Loading3D({ progress, step, leaving = false }: { progress: number; step: string; leaving?: boolean }) {
  const t = useT();
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      className="board3d-loading"
      role="progressbar"
      aria-label={t("Loading the 3D table")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ ...OVERLAY, opacity: leaving ? 0 : 1, pointerEvents: leaving ? "none" : undefined }}
    >
      <div style={TITLE}>{t("Preparing the 3D table…")}</div>
      <div style={TRACK}>
        <div style={{ ...FILL, width: `${percent}%` }} />
      </div>
      <div style={STEP}>{step}</div>
    </div>
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
