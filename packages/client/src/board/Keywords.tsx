/**
 * Badges for a permanent's active abilities (flying, reach, first strike, ward…), MTGA style:
 * one icon per keyword (printed or granted), and the details on hover (their definition: the glossary).
 */
import type { Keyword, ObjectView } from "@mtgx/engine";
import { RESTRICTIONS } from "@mtgx/engine";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { glossaryForKeyword } from "../glossary/entries";
import { faceName, faceText, KEYWORD_LABEL } from "../i18n";
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";

/** Keywords of no interest on the battlefield (or already shown elsewhere). */
const HIDDEN: ReadonlySet<Keyword> = new Set<Keyword>(["flash", "convoke", "startYourEngines"]);

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const solid = { fill: "currentColor" } as const;
const SHIELD = "M12 3 L20 6 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6 Z";

/** Icons (24×24 viewBox, inherited color). */
const ICONS: Partial<Record<Keyword, ReactNode>> = {
  flying: <path {...solid} d="M2 19 C8 18 13 14 16 5 C17.5 9 16.5 13 13.5 16 L21 15 C18 19.5 12 21 6 20.5 Z" />,
  reach: <path {...solid} d="M12 2 L19 10 H14.5 V21 H9.5 V10 H5 Z" />,
  firstStrike: (
    <g {...stroke}>
      <path d="M20 4 L9 15" />
      <path d="M6 12 L12 18" />
      <path d="M8.5 15.5 L4 20" />
    </g>
  ),
  doubleStrike: (
    <g {...stroke}>
      <path d="M20 4 L9 15" />
      <path d="M6 12 L12 18" />
      <path d="M8.5 15.5 L4 20" />
      <path d="M4 4 L15 15" />
      <path d="M12 18 L18 12" />
      <path d="M15.5 15.5 L20 20" />
    </g>
  ),
  deathtouch: (
    <g>
      <path {...solid} d="M5 11 A7 7 0 0 1 19 11 V15 H16 V19 H8 V15 H5 Z" />
      <circle cx="9.2" cy="11.5" r="1.8" fill="#15181e" />
      <circle cx="14.8" cy="11.5" r="1.8" fill="#15181e" />
    </g>
  ),
  lifelink: <path {...solid} d="M12 20.5 L4.2 12.8 A4.6 4.6 0 0 1 12 6.6 A4.6 4.6 0 0 1 19.8 12.8 Z" />,
  trample: (
    <g {...stroke} strokeWidth={2.6}>
      <path d="M4 6 L10 12 L4 18" />
      <path d="M12 6 L18 12 L12 18" />
    </g>
  ),
  vigilance: (
    <g>
      <path {...stroke} d="M2 12 C6 5.5 18 5.5 22 12 C18 18.5 6 18.5 2 12 Z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </g>
  ),
  haste: <path {...solid} d="M13.5 2 L4.5 13.5 H11 L10 22 L19.5 9.5 H13 Z" />,
  menace: <path {...solid} d="M3 4 L12 10 L21 4 L18 14.5 L12 21 L6 14.5 Z" />,
  defender: (
    <g {...stroke} strokeWidth={1.8}>
      <path d="M3 6 H21 V18 H3 Z" />
      <path d="M3 12 H21" />
      <path d="M9 6 V12" />
      <path d="M15 12 V18" />
    </g>
  ),
  hexproof: <path {...stroke} d={SHIELD} />,
  ward: (
    <g>
      <path {...stroke} d={SHIELD} />
      <circle cx="12" cy="11.5" r="3" fill="currentColor" />
    </g>
  ),
  indestructible: (
    <g>
      <path {...stroke} d="M12 2.5 L20.5 7.25 V16.75 L12 21.5 L3.5 16.75 V7.25 Z" />
      <path {...solid} d="M12 7 L16 9.3 V14.7 L12 17 L8 14.7 V9.3 Z" />
    </g>
  ),
  prowess: <path {...solid} d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" />,
};

/** Icon of protections and hexproof "from [filter]": a marked shield. */
const PROTECTION_ICON = (
  <g>
    <path {...solid} d={SHIELD} />
    <path d="M12 7.5 V16 M8 11.5 H16" stroke="#15181e" strokeWidth={2.2} strokeLinecap="round" />
  </g>
);

/** Icon of restrictions ("can't block"…): a struck-through circle. */
const RESTRICTION_ICON = (
  <g {...stroke}>
    <circle cx="12" cy="12" r="8" />
    <path d="M6.5 6.5 L17.5 17.5" />
  </g>
);

/** Icon of goad (701.38): an attack arrow. */
const GOAD_ICON = (
  <g {...stroke}>
    <path d="M5 19 L17 7" />
    <path d="M10 7 H17 V14" />
  </g>
);

/** Icon of an exchanged text box (Deadpool, Trading Card): two crossing arrows. */
const TEXT_BOX_ICON = (
  <g {...stroke}>
    <path d="M4 8 H18 L14 4" />
    <path d="M20 16 H6 L10 20" />
  </g>
);

/** Icon of a word replaced in the text (New Blood): a pen. */
const WORD_CHANGE_ICON = (
  <g {...stroke}>
    <path d="M5 19 L6 15 L16 5 L19 8 L9 18 Z" />
    <path d="M14 7 L17 10" />
  </g>
);

interface Tip {
  x: number;
  y: number;
  title: string;
  help?: string;
}

export function KeywordBadges({ obj }: { obj: ObjectView }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const shown = obj.keywords.filter((k) => !HIDDEN.has(k));
  const protections = obj.protections ?? [];
  const powerRules = obj.powerRules ?? [];
  const goaded = obj.goaded ?? [];
  // "Doesn't untap" (replacement of the untap step): shown with the rules, as a restriction.
  const rules = obj.untapRule ? [...(obj.blockRules ?? []), obj.untapRule] : (obj.blockRules ?? []);
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  const textBox = obj.textBox;
  const wordChanges = obj.wordChanges ?? [];
  if (
    shown.length === 0 &&
    rules.length === 0 &&
    protections.length === 0 &&
    powerRules.length === 0 &&
    goaded.length === 0 &&
    !textBox &&
    wordChanges.length === 0
  )
    return null;
  // Goad: by whom, and what it imposes (a player other than them).
  const goadedBy = (by: string) =>
    by === view?.viewer ? t("Goaded by you") : t("Goaded by {player}", { player: view?.players[by]?.name ?? by });
  // Engine texts (rules, protections, reminders) are localized when shown.
  const hover = (title: string, help?: string) => (ev: React.MouseEvent<HTMLElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setTip({ x: r.right + 6, y: r.top + r.height / 2, title: loc(title), help: help === undefined ? undefined : loc(help) });
  };
  return (
    <>
      <div className="kw-badges">
        {textBox && (
          <span
            className="kw-badge"
            data-text-box={textBox.defId}
            role="img"
            aria-label={t("Text box of {card}", { card: faceName(textBox, lang) })}
            onMouseEnter={(ev) => {
              const r = ev.currentTarget.getBoundingClientRect();
              setTip({
                x: r.right + 6,
                y: r.top + r.height / 2,
                title: t("Text box of {card}", { card: faceName(textBox, lang) }),
                help: faceText(textBox, lang),
              });
            }}
            onMouseLeave={() => setTip(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {TEXT_BOX_ICON}
            </svg>
          </span>
        )}
        {wordChanges.map((w) => {
          const title = t("Text changed: {to} instead of {from}", { to: w.to, from: w.from });
          return (
            <span
              key={`${w.from}>${w.to}`}
              className="kw-badge"
              data-word-change={`${w.from}>${w.to}`}
              role="img"
              aria-label={title}
              onMouseEnter={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                setTip({
                  x: r.right + 6,
                  y: r.top + r.height / 2,
                  title,
                  help: t("Every instance of the creature type {from} in its text reads {to}.", { to: w.to, from: w.from }),
                });
              }}
              onMouseLeave={() => setTip(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {WORD_CHANGE_ICON}
              </svg>
            </span>
          );
        })}
        {protections.map((title) => (
          <span
            key={title}
            className="kw-badge"
            data-protection={title}
            role="img"
            aria-label={loc(title)}
            onMouseEnter={hover(title)}
            onMouseLeave={() => setTip(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {PROTECTION_ICON}
            </svg>
          </span>
        ))}
        {powerRules.map((title) => (
          <span
            key={title}
            className="kw-badge"
            data-power-rule={title}
            role="img"
            aria-label={loc(title)}
            onMouseEnter={hover(title)}
            onMouseLeave={() => setTip(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
                {loc(title).charAt(0)}
              </text>
            </svg>
          </span>
        ))}
        {goaded.map((g) => {
          const title = goadedBy(g.by);
          return (
            <span
              key={`${g.by}-${g.label}`}
              className="kw-badge restriction"
              data-goaded={g.by}
              role="img"
              aria-label={title}
              onMouseEnter={hover(title, g.label)}
              onMouseLeave={() => setTip(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {GOAD_ICON}
              </svg>
            </span>
          );
        })}
        {rules.map((title) => (
          <span
            key={title}
            className="kw-badge restriction"
            data-rule={title}
            role="img"
            aria-label={loc(title)}
            onMouseEnter={hover(title)}
            onMouseLeave={() => setTip(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {RESTRICTION_ICON}
            </svg>
          </span>
        ))}
        {shown.map((k) => {
          const restriction = RESTRICTIONS.includes(k);
          const title =
            k === "ward" && obj.ward
              ? t("{keyword} — {cost}", { keyword: loc(KEYWORD_LABEL[k]), cost: loc(obj.ward) })
              : loc(KEYWORD_LABEL[k]);
          return (
            <span
              key={k}
              className={`kw-badge ${restriction ? "restriction" : ""}`}
              data-kw={k}
              role="img"
              aria-label={title}
              onMouseEnter={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                const help = glossaryForKeyword(k)?.help;
                setTip({ x: r.right + 6, y: r.top + r.height / 2, title, help: help === undefined ? undefined : loc(help) });
              }}
              onMouseLeave={() => setTip(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {restriction
                  ? RESTRICTION_ICON
                  : (ICONS[k] ?? (
                      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
                        {title.charAt(0)}
                      </text>
                    ))}
              </svg>
            </span>
          );
        })}
      </div>
      {tip &&
        createPortal(
          <div className="kw-tip" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.title}</strong>
            {tip.help && <span>{tip.help}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}
