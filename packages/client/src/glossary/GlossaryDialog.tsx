/**
 * The glossary window: every entry by section, in the interface language with its name in the other language (the
 * words of English guides and of French cards), searchable; above every screen (home, deck editor, game).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RulesText } from "../board/Card";
import { Dialog } from "../Dialog";
import { useT } from "../localize";
import { useGame } from "../store";
import { type Lang, textIn } from "../translate";
import { GLOSSARY, GLOSSARY_KINDS, type GlossaryEntry } from "./entries";
import { useGlossary } from "./store";

/** Lowercase, without accents: "célérité" is found by "celerite". */ // i18n-ignore: a French search example
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function matches(entry: GlossaryEntry, query: string, lang: Lang): boolean {
  if (!query) return true;
  const words = [textIn("en", entry.name), textIn("fr", entry.name), textIn(lang, entry.help)];
  return words.some((w) => fold(w).includes(query));
}

export function GlossaryDialog() {
  const open = useGlossary((s) => s.open);
  if (!open) return null;
  return <GlossaryWindow />;
}

function GlossaryWindow() {
  const focus = useGlossary((s) => s.focus);
  const close = useGlossary((s) => s.closeGlossary);
  const lang = useGame((s) => s.lang);
  const other: Lang = lang === "fr" ? "en" : "fr";
  const t = useT();
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const q = fold(query.trim());
  const sections = useMemo(
    () =>
      GLOSSARY_KINDS.map(({ kind, title }) => ({
        kind,
        title,
        entries: GLOSSARY.filter((e) => e.kind === kind && matches(e, q, lang)).sort((a, b) =>
          textIn(lang, a.name).localeCompare(textIn(lang, b.name), lang),
        ),
      })).filter((s) => s.entries.length > 0),
    [q, lang],
  );
  // A word clicked in a text (or in a definition here): its entry, in sight, the search cleared.
  useEffect(() => {
    if (!focus) return;
    setQuery("");
    const frame = requestAnimationFrame(() =>
      list.current?.querySelector(`[data-entry="${focus}"]`)?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focus]);
  return (
    <Dialog title={t("Glossary")} className="wide glossary" onClose={close} testId="glossary">
      <input
        type="search"
        className="choice-search"
        placeholder={t("Search a word")}
        aria-label={t("Search a word")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="glossary-list" ref={list}>
        {sections.length === 0 && <p className="hint">{t("No word found.")}</p>}
        {sections.map((s) => (
          <section key={s.kind}>
            <h3>{textIn(lang, s.title)}</h3>
            <dl>
              {s.entries.map((e) => {
                const name = textIn(lang, e.name);
                const otherName = textIn(other, e.name);
                return (
                  <div key={e.id} className={`glossary-entry ${focus === e.id ? "focus" : ""}`} data-entry={e.id}>
                    <dt>
                      {name}
                      {otherName !== name && (
                        <span className="hint" lang={other}>
                          {" "}
                          · {otherName}
                        </span>
                      )}
                    </dt>
                    <dd>
                      <RulesText text={textIn(lang, e.help)} self={e.id} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}
