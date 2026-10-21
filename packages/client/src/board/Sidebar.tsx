import { type CardFace, msg, type ObjectView } from "@mtgx/engine";
import { useEffect, useRef, useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { BOARD_THEMES } from "../boardThemes";
import { glossaryForKeyword } from "../glossary/entries";
import { termsIn } from "../glossary/match";
import { useGlossary } from "../glossary/store";
import { Term } from "../glossary/Term";
import { probe3d } from "../graphics";
import { CustomArtToggle, ImageRelayToggle } from "../ImageRelayToggle";
import { faceImage, faceName, faceText, faceType, KEYWORD_LABEL, type LogLine } from "../i18n";
import { customImage, imageUrl, useRelayActive } from "../images";
import { LangToggle } from "../LangToggle";
import { useLocalize, useT } from "../localize";
import { PACES, useGame } from "../store";
import { isTouch, justLongPressed } from "../touch";
import { textIn } from "../translate";
import { ManaCost, RulesText } from "./Card";

/** A "Max speed —" ability (702.179) in the card's text (English or French). */
const MAX_SPEED = /Max speed —|Vitesse maximale —/;

/** Preview of a card with "Max speed": is the ability active for its controller? */
function MaxSpeedNote({ speed }: { speed: number | undefined }) {
  const t = useT();
  const on = (speed ?? 0) >= 4;
  return (
    <div className={`preview-speed ${on ? "on" : ""}`}>
      {on
        ? t("⚡ Max speed: active")
        : speed === undefined
          ? t("⚡ Max speed: inactive (no speed)")
          : t("⚡ Max speed: inactive (speed {speed}/4)", { speed })}
    </div>
  );
}

/**
 * The enlarged card: image, then its texts and state. `terms`: the definitions of its glossary words next to it (the
 * floating preview, which the mouse can't reach: MTGA style); elsewhere the words are hovered or long-pressed.
 */
export function Preview({ terms = false }: { terms?: boolean }) {
  const hover = useGame((s) => s.hover);
  const players = useGame((s) => s.view?.players);
  useRelayActive(); // new URL when the image relay turns on
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  // Double-faced card: show the back face (F key or button).
  const [flipped, setFlipped] = useState(false);
  const backImage = hover?.face.otherFaces?.find((f) => f?.image);
  useEffect(() => {
    if (!backImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") setFlipped((x) => !x);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backImage]);
  if (!hover)
    return (
      <div className="preview empty">
        {isTouch() ? t("Long-press a card to enlarge it.") : t("Hover over a card to enlarge it.")}
      </div>
    );
  const { face, obj } = hover;
  const back =
    flipped && backImage
      ? ((face.customArt ? customImage(backImage.name, false, face.customArt) : undefined) ??
        imageUrl((lang === "fr" && backImage.fr?.image) || backImage.image))
      : undefined;
  // Your face-down card: only you see which card it is.
  const hidden = obj?.faceDownCard;
  const src = back ?? (hidden ? faceImage(hidden, lang) : undefined) ?? faceImage(face, lang);
  const baseKw = new Set(obj?.keywords ?? []);
  return (
    <div className="preview">
      {src ? (
        <img className="preview-img" src={src} alt={faceName(face, lang)} />
      ) : (
        <div className={`preview-img token frame-${obj?.colors[0] ?? "C"}`}>
          <div className="token-name">{faceName(face, lang)}</div>
          <div className="token-type">{loc(faceType(face, lang))}</div>
          <div className="token-text">
            <RulesText text={faceText(face, lang)} />
          </div>
          {obj?.power !== undefined && (
            <div className="token-pt">
              {obj.power}/{obj.toughness}
            </div>
          )}
        </div>
      )}
      <div className="preview-info">
        <div className="preview-title">
          <span>{faceName(face, lang)}</span>
          <ManaCost cost={face.manaCost} size={14} />
        </div>
        <div className="preview-type">{loc(faceType(face, lang))}</div>
        {obj && players && MAX_SPEED.test(`${face.text}\n${face.fr?.text ?? ""}`) && (
          <MaxSpeedNote speed={players[obj.controller]?.speed} />
        )}
        {/* Oracle text always shown: frameless art, foreign printings, small print. An exchanged text box (Deadpool,
            Trading Card) replaces it. */}
        {obj?.textBox ? (
          <div className="preview-text" data-text-box={obj.textBox.defId}>
            <div className="preview-text-box">{t("Text box of {card}", { card: faceName(obj.textBox, lang) })}</div>
            <RulesText text={faceText(obj.textBox, lang)} />
          </div>
        ) : (
          faceText(face, lang) && (
            <div className="preview-text">
              <RulesText text={faceText(face, lang)} />
            </div>
          )
        )}
        {/* Words replaced in its text (New Blood, 612.2): the printed text keeps its wording. */}
        {obj?.wordChanges?.map((w) => (
          <div key={`${w.from}>${w.to}`} className="preview-text-box" data-word-change={`${w.from}>${w.to}`}>
            {t("Text changed: {to} instead of {from}", { to: w.to, from: w.from })}
          </div>
        ))}
        {backImage && (
          <button type="button" className="btn small ghost preview-flip" onClick={() => setFlipped((x) => !x)}>
            {flipped ? t("Show the front (F)") : t("Show the back (F)")}
          </button>
        )}
        {face.otherFaces?.map(
          (f) =>
            f && (
              // Other face: back face, adventure, other half of a split card.
              <div key={f.name} className="preview-prepare">
                <div className="preview-title">
                  <span>{(lang === "fr" && f.fr?.name) || f.name}</span>
                  {f.manaCost && <ManaCost cost={f.manaCost} size={14} />}
                </div>
                <div className="preview-type">{(lang === "fr" && f.fr?.typeLine) || f.typeLine}</div>
                <div className="preview-text">
                  <RulesText text={(lang === "fr" && f.fr?.text) || f.text} />
                </div>
              </div>
            ),
        )}
        {face.prepareFace && (
          // A "prepare" card: the spell attached to the creature.
          <div className="preview-prepare">
            <div className="preview-title">
              <span>
                {(lang === "fr" && face.prepareFace.fr?.name) || face.prepareFace.name}{" "}
                <span className="hint">{t("(prepared spell)")}</span>
              </span>
              <ManaCost cost={face.prepareFace.manaCost} size={14} />
            </div>
            <div className="preview-type">{(lang === "fr" && face.prepareFace.fr?.typeLine) || face.prepareFace.typeLine}</div>
            <div className="preview-text">
              <RulesText text={(lang === "fr" && face.prepareFace.fr?.text) || face.prepareFace.text} />
            </div>
          </div>
        )}
        {(obj?.classLevel || obj?.solved) && (
          <div className="preview-stats">
            {obj.solved ? t("Case solved") : t("Class level {level}", { level: obj.classLevel ?? 0 })}
          </div>
        )}
        {obj?.power !== undefined && (
          <div className="preview-stats">
            {t("Power/Toughness:")}{" "}
            <strong>
              {obj.power}/{obj.toughness}
            </strong>
            {obj.damage > 0 && <span className="dmg"> · {t("{n} damage marked", { n: obj.damage })}</span>}
            {Object.entries(obj.counters)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <span key={k}> · {t("{n} {kind} counter(s)", { n, kind: k })}</span>
              ))}
          </div>
        )}
        {baseKw.size > 0 && (
          <div className="preview-kw">
            {[...baseKw].map((k) => {
              const entry = glossaryForKeyword(k);
              return (
                <span key={k} className="kw">
                  {entry ? <Term entry={entry}>{loc(KEYWORD_LABEL[k])}</Term> : loc(KEYWORD_LABEL[k])}
                </span>
              );
            })}
          </div>
        )}
        {obj?.sick && obj.types.includes("Creature") && <div className="preview-note">{t("Summoning sickness")}</div>}
        {!face.implemented && <div className="preview-warn">{t("Not yet supported by the engine")}</div>}
      </div>
      {terms && <PreviewTerms face={face} obj={obj} />}
    </div>
  );
}

/** At most this many definitions next to the floating preview (a card rarely has more words to explain). */
const MAX_TERMS = 6;

/**
 * Definitions of the glossary words of the previewed card, as MTG Arena shows them next to the enlarged card: the
 * words of its texts in order, then the keywords it has without them being written (granted by another permanent).
 */
function PreviewTerms({ face, obj }: { face: CardFace; obj?: ObjectView }) {
  const lang = useGame((s) => s.lang);
  const shown = obj?.textBox ?? face;
  const texts = [
    faceText(shown, lang),
    ...(face.otherFaces ?? []).map((f) => (f ? (lang === "fr" && f.fr?.text) || f.text : "")),
    face.prepareFace ? (lang === "fr" && face.prepareFace.fr?.text) || face.prepareFace.text : "",
  ];
  const entries = new Set(texts.flatMap((text) => (text ? termsIn(text, lang) : [])));
  for (const k of obj?.keywords ?? []) {
    const entry = glossaryForKeyword(k);
    if (entry) entries.add(entry);
  }
  if (entries.size === 0) return null;
  return (
    <div className="preview-terms">
      {[...entries].slice(0, MAX_TERMS).map((e) => (
        <div key={e.id} className="preview-term" data-term={e.id}>
          <strong>{textIn(lang, e.name)}</strong>
          <span>{textIn(lang, e.help)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Text of a log line, with hoverable card names (preview in the sidebar, kept after hovering as for the cards of the
 * board; on touch, overlaid).
 */
function LogText({ line }: { line: LogLine }) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const setPeek = useGame((s) => s.setPeek);
  const cards = line.cards ?? [];
  if (!cards.length) return <>{line.text}</>;
  const named = cards
    .map((face) => ({ face, label: faceName(face, lang) }))
    .filter((x) => x.label && line.text.includes(x.label))
    .sort((a, b) => b.label.length - a.label.length);
  if (!named.length) return <>{line.text}</>;
  const pattern = new RegExp(`(${named.map((x) => x.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  return (
    <>
      {line.text.split(pattern).map((part, i) => {
        const hit = named.find((x) => x.label === part);
        if (!hit) return part;
        return (
          <button
            type="button"
            key={i}
            className="log-card"
            onMouseEnter={() => setHover({ face: hit.face })}
            onFocus={() => setHover({ face: hit.face })}
            onClick={() => isTouch() && setPeek({ face: hit.face })}
          >
            {part}
          </button>
        );
      })}
    </>
  );
}

function Log() {
  const log = useGame((s) => s.log);
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on each new line
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);
  return (
    <div className="log" ref={ref}>
      {log.map((l) => (
        <div key={l.id} className={`log-line ${l.kind}`}>
          <LogText line={l} />
        </div>
      ))}
    </div>
  );
}

/** Pace of the effects: how long each resolving spell or ability is shown before it applies. */
/** "Concede" in two steps: a click by mistake does not lose the game. */
function ConcedeButton({ onConcede }: { onConcede: () => void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="btn small ghost" onClick={() => setAsking(true)}>
        {t("Concede")}
      </button>
    );
  return (
    <span className="concede-confirm">
      {t("Concede the game?")}
      <button type="button" className="btn small danger" onClick={onConcede}>
        {t("Yes, concede")}
      </button>
      <button type="button" className="btn small ghost" onClick={() => setAsking(false)}>
        {t("No")}
      </button>
    </span>
  );
}

function PaceControl() {
  const pace = useGame((s) => s.pace);
  const setPace = useGame((s) => s.setPace);
  const t = useT();
  const loc = useLocalize();
  return (
    <div className="pace-control" title={t("How long each effect is shown before it applies")}>
      <span>{t("Effects")}</span>
      <div className="seg">
        {PACES.map((p) => (
          <button
            key={p.pace}
            type="button"
            className={pace === p.pace ? "on" : ""}
            title={loc(p.hint)}
            onClick={() => setPace(p.pace)}
          >
            {loc(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Graphics: animated table and tilted battlefield, or light (less powerful devices). */
/**
 * The 3D board's state: the graphics card the browser draws with (on a laptop, it may be the integrated one) and the
 * quality drawn (the governor steps it down when frames are slow).
 */
function Board3dNote({ renderer }: { renderer: string }) {
  const quality = useGame((s) => s.board3dQuality);
  const t = useT();
  const loc = useLocalize();
  return (
    <div className="board3d-note">
      <span>{t("Graphics card: {name}", { name: renderer.replace(/^ANGLE \((.*)\)$/, "$1") })}</span>
      {quality && <span>{t("3D quality: {quality}", { quality: loc(QUALITY_LABEL[quality]) })}</span>}
    </div>
  );
}

const QUALITY_LABEL = {
  high: msg("ctx:quality|high"),
  medium: msg("ctx:quality|medium"),
  low: msg("ctx:quality|low"),
};

function GraphicsControl() {
  const effects = useGame((s) => s.effects);
  const setEffects = useGame((s) => s.setEffects);
  const t = useT();
  // The 3D board (PLAN-W): offered where the browser has WebGL2 on a real GPU.
  const support = probe3d();
  return (
    <div className="pace-control">
      <span>{t("Graphics")}</span>
      <div className="seg">
        <button
          type="button"
          className={effects === "3d" ? "on" : ""}
          disabled={!support.ok}
          title={
            support.ok
              ? t("3D table with lights, seen at an angle (needs a graphics card)")
              : support.reason === "webgl2"
                ? t("3D board unavailable: this browser has no WebGL2")
                : t("3D board unavailable: no graphics card in use (software rendering would be too slow)")
          }
          onClick={() => setEffects("3d")}
        >
          {t("ctx:graphics|3D")}
        </button>
        <button
          type="button"
          className={effects === "full" ? "on" : ""}
          title={t("Animated table and tilted battlefield")}
          onClick={() => setEffects("full")}
        >
          {t("ctx:graphics|Full")}
        </button>
        <button
          type="button"
          className={effects === "light" ? "on" : ""}
          title={t("Still table and flat battlefield, for less powerful devices")}
          onClick={() => setEffects("light")}
        >
          {t("ctx:graphics|Light")}
        </button>
      </div>
      {effects === "3d" && support.ok && <Board3dNote renderer={support.renderer} />}
    </div>
  );
}

/** Board texture: one swatch per texture, and "random" (a texture drawn for each game). */
function BoardThemeControl() {
  const choice = useGame((s) => s.boardTheme);
  const setChoice = useGame((s) => s.setBoardTheme);
  const t = useT();
  const loc = useLocalize();
  return (
    <div className="board-theme-control" title={t("Board texture")}>
      <span>{t("Board")}</span>
      <div className="swatches">
        {BOARD_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`swatch ${choice === theme.id ? "on" : ""}`}
            data-board={theme.id}
            title={loc(theme.label)}
            aria-label={t("Board: {theme}", { theme: theme.label })}
            aria-pressed={choice === theme.id}
            onClick={() => setChoice(theme.id)}
          />
        ))}
        <button
          type="button"
          className={`swatch random ${choice === "random" ? "on" : ""}`}
          title={t("Random (one texture per game)")}
          aria-label={t("Board: random for each game")}
          aria-pressed={choice === "random"}
          onClick={() => setChoice("random")}
        >
          ?
        </button>
      </div>
    </div>
  );
}

function Settings() {
  const settings = useGame((s) => s.settings);
  const setFullControl = useGame((s) => s.setFullControl);
  const setHoldPriority = useGame((s) => s.setHoldPriority);
  const clearAnswers = useGame((s) => s.clearAnswers);
  const kept = Object.keys(settings.autoAnswers ?? {}).length;
  const decide = useGame((s) => s.decide);
  const backToLobby = useGame((s) => s.backToLobby);
  const over = useGame((s) => s.view?.over);
  const online = useGame((s) => !!s.online);
  const tutorial = useGame((s) => s.tutorialGame);
  const replay = useGame((s) => !!s.replay);
  const exportGame = useGame((s) => s.exportGame);
  const openGlossary = useGlossary((s) => s.openGlossary);
  const t = useT();
  return (
    <div className="settings">
      <LangToggle />
      <SoundControl />
      <label className="toggle" title={t("Receive priority at every step, without automation")}>
        <input type="checkbox" checked={settings.fullControl} onChange={(e) => setFullControl(e.target.checked)} />
        {t("Full control")}
      </label>
      <label className="toggle" title={t("Receive priority after casting a spell, to respond to it yourself")}>
        <input type="checkbox" checked={!!settings.holdPriority} onChange={(e) => setHoldPriority(e.target.checked)} />
        {t("Hold priority")}
      </label>
      {kept > 0 && (
        <button
          type="button"
          className="btn small ghost"
          title={t('Ask again the questions answered with "Always answer this way"')}
          onClick={clearAnswers}
        >
          {t("Forget the kept answers ({n})", { n: kept })}
        </button>
      )}
      <PaceControl />
      <GraphicsControl />
      <BoardThemeControl />
      <ImageRelayToggle />
      <CustomArtToggle />
      <button type="button" className="btn small ghost" onClick={() => openGlossary()}>
        {t("Glossary")}
      </button>
      {!over && !replay && <ConcedeButton onConcede={() => decide({ type: "concede" })} />}
      {/* Game record (replay, bug report); online, only once the game is over. */}
      {!tutorial && !replay && (!online || over) && (
        <button
          type="button"
          className="btn small ghost"
          title={t("Download the game (a file to watch again, or to attach to a bug report)")}
          onClick={exportGame}
        >
          {t("Export the game")}
        </button>
      )}
      <button
        type="button"
        className="btn small ghost"
        onClick={() => {
          // Online, leaving a game in progress counts as conceding.
          if (online && !over && !window.confirm(t("Leave the online game? It will count as a concession."))) return;
          backToLobby();
        }}
      >
        {t("Menu")}
      </button>
    </div>
  );
}

export function Sidebar() {
  const setDrawerOpen = useGame((s) => s.setDrawerOpen);
  const t = useT();
  return (
    <aside className="sidebar">
      <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t("Close the panel")}>
        ×
      </button>
      <Settings />
      <div className="log-title">{t("Log")}</div>
      <Log />
    </aside>
  );
}

/** Touch screen: card enlarged by a long press, overlaid; a tap anywhere closes it. */
export function TouchPreview() {
  const peek = useGame((s) => s.peek);
  const setPeek = useGame((s) => s.setPeek);
  if (!peek) return null;
  return (
    // Neither the click that ends the long press (it lands on the overlay) nor the preview's buttons (other face)
    // close it.
    // biome-ignore lint/a11y/noStaticElementInteractions: touch overlay over the whole screen: a tap closes it, Escape too
    <div
      className="touch-preview"
      onClick={(e) => !justLongPressed() && !(e.target as HTMLElement).closest("button") && setPeek(null)}
      onKeyDown={(e) => e.key === "Escape" && setPeek(null)}
    >
      <Preview />
    </div>
  );
}

/** What shows a card's preview when hovered: cards (board, hand, stack, dialogs), names in the log, commanders. */
const HOVER_SOURCES = ".card-slot, .log-card, .commander-chip";
/** Width taken by the floating preview before it is measured, for the side switch (image and info column). */
const FLOAT_ROOM = 640;

/**
 * Preview of the hovered card, floating at the left of the screen as on MTG Arena (PLAN-V), on the right when the
 * pointer is under it. It closes shortly after the pointer leaves the card, and does not catch the mouse. Touch screens
 * use `TouchPreview`.
 */
export function PreviewFloat() {
  const hover = useGame((s) => s.hover);
  const live = useGame((s) => s.hoverLive);
  const hold = useGame((s) => s.previewHold);
  const [right, setRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isTouch()) return;
    let timer = 0;
    // The pointer is on no card any more (also when the hovered card leaves the screen without a mouseleave).
    const onOver = (e: PointerEvent) => {
      window.clearTimeout(timer);
      if (e.pointerType !== "mouse") return;
      // Its width with the definitions next to the card, when it is shown.
      setRight(e.clientX < (ref.current?.offsetWidth ?? FLOAT_ROOM - 24) + 24);
      if (!(e.target as Element | null)?.closest?.(HOVER_SOURCES))
        timer = window.setTimeout(() => useGame.getState().endHover(), 80);
    };
    const onDown = () => useGame.getState().endHover();
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  if (isTouch() || !(hold || (live && hover))) return null;
  return (
    <div ref={ref} className={`preview-float ${right && !hold ? "right" : ""}`} data-tuto="preview">
      <Preview terms />
    </div>
  );
}

/** Button that opens the drawer of the log and settings. */
export function DrawerToggle() {
  const t = useT();
  const open = useGame((s) => s.drawerOpen);
  const setDrawerOpen = useGame((s) => s.setDrawerOpen);
  return (
    <>
      <button type="button" className="drawer-toggle" onClick={() => setDrawerOpen(!open)} aria-label={t("Log and settings")}>
        ☰
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: the scrim closes the drawer, which its button and Escape also do
        <div
          className="drawer-scrim"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setDrawerOpen(false)}
        />
      )}
    </>
  );
}
