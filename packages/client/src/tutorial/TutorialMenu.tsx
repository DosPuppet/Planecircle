/** Tutorial menu: play everything through, resume where you left off, or choose a lesson. */
import { resolveBoardTheme } from "../boardThemes";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { LESSONS, lessonById } from "./lessons";
import { useTutorial } from "./store";

export function TutorialMenu() {
  const progress = useTutorial((t) => t.progress);
  const start = useTutorial((t) => t.start);
  const resetProgress = useTutorial((t) => t.resetProgress);
  const backToLobby = useGame((s) => s.backToLobby);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const resume = lessonById(progress.current);
  const allDone = LESSONS.every((l) => progress.done.includes(l.id));
  // The menus stand on the chosen table texture (still; "random": the first one).
  const board = useGame((s) => resolveBoardTheme(s.boardTheme, 0));
  return (
    <div className="lobby tutorial-menu" data-board={board}>
      <header className="lobby-head">
        <h1>{t("Learn to play")}</h1>
      </header>
      <div className="lobby-body">
        <p className="tutorial-intro">
          {t(
            "Short lessons, on real game excerpts, to discover Magic: The Gathering and the Planecircle interface. Your progress is saved: you can stop and resume later.",
          )}
        </p>
        <div className="lobby-actions">
          {resume && (
            <button type="button" className="btn primary big" onClick={() => start(resume.id, true)}>
              {t("Resume: {title}", { title: resume.title })}
            </button>
          )}
          <button
            type="button"
            className={`btn big ${resume ? "" : "primary"}`}
            onClick={() => start(LESSONS[0]?.id ?? "", true)}
          >
            {progress.done.length > 0 || resume ? t("Start everything over from the beginning") : t("Play all lessons")}
          </button>
          <button type="button" className="btn big" onClick={backToLobby}>
            {t("Back")}
          </button>
        </div>
        {allDone && <p className="hint">{t("All lessons are complete. Well done!")}</p>}
        <ol className="lesson-list">
          {LESSONS.map((l, i) => {
            const done = progress.done.includes(l.id);
            const current = progress.current === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`lesson-tile ${done ? "done" : ""} ${current ? "current" : ""}`}
                  onClick={() => start(l.id)}
                >
                  <span className="lesson-num">{done ? "✓" : i + 1}</span>
                  <span className="lesson-body">
                    <span className="lesson-title">
                      {textIn(lang, l.title)}
                      {current && <span className="lesson-badge">{t("to resume")}</span>}
                    </span>
                    <span className="lesson-summary">{textIn(lang, l.summary)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {(progress.done.length > 0 || resume) && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => window.confirm(t("Erase your tutorial progress?")) && resetProgress()}
          >
            {t("Reset")}
          </button>
        )}
      </div>
    </div>
  );
}
