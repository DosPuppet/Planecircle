import { lazy, Suspense, useEffect } from "react";
import { Board, useMainAction } from "./board/Board";
import { Loading3DBoard } from "./board/Loading3D";
import { ReplayBar } from "./board/ReplayBar";
import { DrawerToggle, PreviewFloat, Sidebar, TouchPreview } from "./board/Sidebar";
import { domEffects } from "./boardThemes";
import { DeckBuilder } from "./decks/DeckBuilder";
import { GlossaryDialog } from "./glossary/GlossaryDialog";
import { canTry3d, forced3d, PORTRAIT_PHONE, probe3d, useMedia } from "./graphics";
import { Lobby } from "./lobby/Lobby";
import { Online } from "./lobby/Online";
import { useLocalize, useT } from "./localize";
import { Prompts } from "./prompts/Prompts";
import { useGame } from "./store";
import { isTouch } from "./touch";
import { Coach } from "./tutorial/Coach";
import { TutorialMenu } from "./tutorial/TutorialMenu";

/** A short message; its text can come from the engine, the server or the interface (`msg`), translated here. */
function Toast() {
  const toast = useGame((s) => s.toast);
  const loc = useLocalize();
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id}>
      {loc(toast.text)}
    </div>
  );
}

/** Important message to acknowledge (game that cannot be resumed, online game lost), above every screen. */
function Notice() {
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  const loc = useLocalize();
  const t = useT();
  if (!notice) return null;
  const title = loc(notice.title);
  return (
    <div className="modal-backdrop">
      <div className="modal notice" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{loc(notice.text)}</p>
        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={dismiss}>
            {t("OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

function useShortcuts() {
  const action = useMainAction();
  const endTurn = useGame((s) => s.endTurn);
  const cancel = useGame((s) => s.cancel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!action.disabled) action.run?.();
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        const v = useGame.getState().view;
        // On your turn: until the end of the turn; on an opponent's turn: until your turn.
        if (v && v.pending?.player === v.viewer) endTurn(e.shiftKey);
      } else if (e.code === "Escape") {
        const s = useGame.getState();
        if (s.peek) s.setPeek(null);
        else if (s.drawerOpen) s.setDrawerOpen(false);
        else cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, endTurn, cancel]);
}

/** The 3D board (PLAN-W): its own chunks, with three.js, loaded only when it is drawn. */
const Board3D = lazy(() => import("./board3d/Board3D"));

/**
 * The DOM board, or the 3D board when the player chose it (Graphics) and the device can draw it (dev: `?board3d=force`
 * draws it on any renderer). A WebGL failure falls back to the DOM board for the rest of the session, with a word.
 */
function GameBoard() {
  const hasView = useGame((s) => !!s.view);
  const wants3d = useGame((s) => s.effects === "3d") || forced3d();
  // Another arena: a new scene, behind the loading screen.
  const arena = useGame((s) => s.arena3d);
  const failed = useGame((s) => s.board3dFailed);
  const fail = useGame((s) => s.failBoard3d);
  // A phone in portrait keeps the DOM board (its portrait layout); turned to landscape, the 3D board comes back.
  const portrait = useMedia(PORTRAIT_PHONE);
  if (failed || !hasView || !wants3d || portrait || !canTry3d(probe3d())) return <Board />;
  return (
    <Suspense fallback={<Loading3DBoard />}>
      <Board3D key={arena} arena={arena} onFail={fail} />
    </Suspense>
  );
}

function GameScreen() {
  useShortcuts();
  const drawerOpen = useGame((s) => s.drawerOpen);
  const effects = useGame((s) => domEffects(s.effects));
  // 3 or 4 players: too narrow for a phone in portrait (the rotate prompt stays); a duel plays in portrait too.
  const multi = useGame((s) => (s.view?.opponents.length ?? 1) > 1);
  const t = useT();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: only the browser's context menu is suppressed (touch), not an interaction
    <div
      className={`game ${drawerOpen ? "drawer-open" : ""} ${multi ? "multi" : ""}`}
      data-effects={effects}
      // Long press with a finger: no browser context menu (the card preview replaces it).
      onContextMenu={(e) => isTouch() && e.preventDefault()}
    >
      <GameBoard />
      <Sidebar />
      <ReplayBar />
      <DrawerToggle />
      <Prompts />
      <TouchPreview />
      <PreviewFloat />
      <Coach />
      <div className="rotate-hint">
        <div className="rotate-icon">⟳</div>
        {t("Turn your device to landscape to play.")}
      </div>
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      {screen === "decks" ? (
        <DeckBuilder />
      ) : screen === "lobby" ? (
        <Lobby />
      ) : screen === "online" ? (
        <Online />
      ) : screen === "tutorial" ? (
        <TutorialMenu />
      ) : (
        <GameScreen />
      )}
      <GlossaryDialog />
      <Toast />
      <Notice />
    </>
  );
}
