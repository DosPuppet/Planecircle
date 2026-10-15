/** Sound setting: speaker (muted / on, shortcut M), volume, and a panel to listen to every sound. */
import { useState } from "react";
import { Dialog } from "../Dialog";
import { useLocalize, useT } from "../localize";
import { playSound, preloadSounds, unlockAudio, useAudio } from "./sfx";
import { SOUND_LABELS, type SoundKey } from "./sounds";

/** Every sound of the game, one button each: to set the volume, and to judge the sounds. */
function SoundTest({ onClose }: { onClose: () => void }) {
  const t = useT();
  const loc = useLocalize();
  return (
    <Dialog title={t("Sounds of the game")} className="wide" onClose={onClose}>
      <div className="sound-test">
        {(Object.keys(SOUND_LABELS) as SoundKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className="btn small"
            onClick={() => {
              unlockAudio();
              playSound(key);
            }}
          >
            ♪ {loc(SOUND_LABELS[key])}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onClose}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}

const SPEAKER = "M4 9v6h4l5 4V5L8 9H4z";
const WAVES = "M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12";
const CROSS = "M16.5 9.5l5 5M21.5 9.5l-5 5";

export function SoundControl() {
  const { volume, muted, setVolume, toggleMute } = useAudio();
  const silent = muted || volume === 0;
  const [testing, setTesting] = useState(false);
  const t = useT();
  return (
    <div className="sound-control">
      <button
        type="button"
        className="sound-toggle"
        onClick={toggleMute}
        aria-label={silent ? t("Turn sound on") : t("Mute sound")}
        title={silent ? t("Turn sound on (M)") : t("Mute sound (M)")}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d={SPEAKER} fill="currentColor" />
          <path d={silent ? CROSS : WAVES} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label={t("Sound effects volume")}
      />
      <button
        type="button"
        className="sound-toggle"
        onClick={() => {
          preloadSounds();
          setTesting(true);
        }}
        aria-label={t("Listen to the sounds of the game")}
        title={t("Listen to the sounds of the game")}
      >
        ♪
      </button>
      {testing && <SoundTest onClose={() => setTesting(false)} />}
    </div>
  );
}
