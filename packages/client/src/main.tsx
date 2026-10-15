// First: the "mtgmate.*" keys renamed before the stores read them.
import "./storageRename";
import { msg } from "@mtgx/engine";
import { LayoutGroup, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { playSound, unlockAudio, useAudio } from "./audio/sfx";
import { decodeDeck, sharedDeckData } from "./decks/share";
import { detectBlockedScryfall, loadCustomArt } from "./images";
import { prefetchGameWorker } from "./session";
import { flushSave, useGame } from "./store";
import { useTutorial } from "./tutorial/store";
import "./styles.css";

// Dev mode: access to the stores for the Playwright scripts (sandbox, see protocol.ts; tutorial).
if (import.meta.env.DEV) {
  const w = window as unknown as { __mtgx: typeof useGame; __tuto: typeof useTutorial };
  w.__mtgx = useGame;
  w.__tuto = useTutorial;
}

// Production: service worker (application cached, offline start; public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    // The game worker cached from the first visit (game against the AI offline).
    .then(() => setTimeout(prefetchGameWorker, 3000))
    .catch((e) => console.warn("Service worker not registered:", e));
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* Reduced motion if the system asks for it (accessibility). */}
      <MotionConfig reducedMotion="user">
        <LayoutGroup>
          <App />
        </LayoutGroup>
      </MotionConfig>
    </StrictMode>,
  );
}

// Sound: unlocked on the first gesture (browsers' autoplay policy), button clicks, M = mute.
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener(
  "click",
  (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.("button.btn, .main-button");
    if (btn && !(btn as HTMLButtonElement).disabled) playSound("click");
  },
  { capture: true },
);
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  useAudio.getState().toggleMute();
});

// Images: Scryfall blocked by the player's network? Relay through the server (auto mode, see images.ts).
void detectBlockedScryfall();
// The server's custom art (/art/, see tools/custom-art.ts).
void loadCustomArt();

// Page reopened: resume the online game, otherwise the saved game against the AI (except for an invitation link
// ?room=CODE, which opens online play; the saved game resumes at the next opening).
// A deck link (#deck=…, scanned QR code): the deck editor offers to import it; nothing is resumed.
const invited = new URLSearchParams(location.search).has("room");
const deckData = sharedDeckData(location.hash);
if (deckData) {
  history.replaceState(null, "", location.pathname + location.search);
  void decodeDeck(deckData).then((list) => {
    if (list) useGame.setState({ screen: "decks", sharedDeck: list });
    else useGame.getState().notify(msg("This deck link is damaged."));
  });
} else if (invited && !localStorage.getItem("planecircle.online")) useGame.getState().openOnline();
else useGame.getState().resumeAtStartup();
// Page closed: the save of the local game is written at once.
window.addEventListener("pagehide", flushSave);
