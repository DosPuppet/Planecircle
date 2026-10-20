import { type CardFace, counterLabel, HIDDEN_CARD_ID, msg, type ObjectView } from "@mtgx/engine";
import { motion } from "motion/react";
import { type CSSProperties, Fragment, memo, useCallback, useRef, useState } from "react";
import { splitTerms } from "../glossary/match";
import { Term } from "../glossary/Term";
import { faceArt, faceImage, faceName, faceText, faceType } from "../i18n";
import { detectBlockedScryfall, useCustomBack, useRelayActive } from "../images";
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";
import { useLongPress } from "../touch";
import { KeywordBadges } from "./Keywords";
import { PERM_RATIO, TAP_DEG, TAP_W } from "./layout";

export type Glow =
  | "playable"
  | "target"
  | "selectable"
  | "selected"
  /** Picked among the highlighted options (target, choice on the board): green check mark. */
  | "picked"
  | "attacking"
  | "blocking"
  | "activatable"
  | null;

const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;

/** Colors of the mana discs (hybrid symbols: split between two). */
const MANA_COLOR: Record<string, string> = {
  W: "#f8f3d6",
  U: "#a9d0ef",
  B: "#b7ada8",
  R: "#f09a7c",
  G: "#99cc9a",
};
const GREY = "#d0cac4";

/** Official glyphs (Mana font, public/mana/, `tools/mana-symbols.ts`): letters lowercased, T → tap, Q → untap. */
const GLYPHS = new Set(
  "w u b r g c s e x y z p tap untap chaos half infinity 100 1000000"
    .split(" ")
    .concat(Array.from({ length: 21 }, (_, i) => String(i))),
);
const glyphName = (sym: string) => ({ T: "tap", Q: "untap", "∞": "infinity", "½": "half" })[sym] ?? sym.toLowerCase();

/** The glyph of a symbol, drawn as a mask in the symbol's ink; `part`: one half of a hybrid symbol. */
function Glyph({ sym, part }: { sym: string; part?: 1 | 2 }) {
  const name = glyphName(sym);
  if (!GLYPHS.has(name)) return <>{sym}</>;
  return (
    <span
      className={`mana-glyph ${part ? `g${part}` : ""}`}
      style={{ "--glyph": `url("${import.meta.env.BASE_URL}mana/${name}.svg")` } as CSSProperties}
    />
  );
}

/** Mana symbols: "{2}{G}{G}" → the official symbols, on their colored discs. */
export function ManaCost({ cost, size = 16 }: { cost: string; size?: number }) {
  const t = useT();
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
  return (
    <span className="mana-cost" style={{ "--sym": `${size}px` } as CSSProperties}>
      {symbols.map((s, i) => {
        // Hybrid ({W/U}) or generic hybrid ({2/W}): a disc split diagonally, both glyphs.
        const hybrid = /^([WUBRG2])\/([WUBRG])$/.exec(s);
        if (hybrid) {
          const [, a = "", b = ""] = hybrid;
          return (
            <span
              key={i}
              className="mana-sym hybrid"
              title={`{${s}}`}
              style={{ "--m1": MANA_COLOR[a] ?? GREY, "--m2": MANA_COLOR[b] ?? GREY } as CSSProperties}
            >
              <Glyph sym={a} part={1} />
              <Glyph sym={b} part={2} />
            </span>
          );
        }
        // Phyrexian mana: the color, or 2 life.
        const phyrexian = /^([WUBRG])\/P$/.exec(s);
        if (phyrexian)
          return (
            <span
              key={i}
              className="mana-sym"
              style={{ background: MANA_COLOR[phyrexian[1] ?? ""] }}
              title={t("{symbol}: {color} or 2 life", { symbol: `{${s}}`, color: `{${phyrexian[1]}}` })}
            >
              <Glyph sym="P" />
            </span>
          );
        return (
          <span key={i} className="mana-sym" style={{ background: MANA_COLOR[s] ?? GREY }} title={`{${s}}`}>
            <Glyph sym={s} />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Rules text whose symbols ("{T}", "{2}{R}") are pips, as on the printed card, and whose glossary words are explained
 * on hover (`self`: the glossary entry whose definition this is, not marked).
 */
export function RulesText({ text, size = 13, self }: { text: string; size?: number; self?: string }) {
  const lang = useGame((s) => s.lang);
  // Words first, on the whole text: a form may look at the cost after it ("Équipement {2}"). i18n-ignore: French card text
  return (
    <>
      {splitTerms(text, lang).map((part, i) =>
        typeof part !== "string" && part.entry.id !== self ? (
          <Term key={i} entry={part.entry}>
            {part.text}
          </Term>
        ) : (
          <Fragment key={i}>
            {(typeof part === "string" ? part : part.text)
              .split(/((?:\{[^}]+\})+)/)
              .map((piece, j) => (j % 2 ? <ManaCost key={j} cost={piece} size={size} /> : piece))}
          </Fragment>
        ),
      )}
    </>
  );
}

/** Text frame: the fallback when the image does not load, and the look of tokens. */
function TextFrame({ face, obj }: { face: CardFace; obj?: ObjectView }) {
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const color = obj?.colors[0] ?? "C";
  return (
    <div className={`text-frame frame-${color}`}>
      <div className="tf-head">
        <span className="tf-name">{faceName(face, lang)}</span>
        <ManaCost cost={face.manaCost} size={10} />
      </div>
      <div className="tf-type">{loc(faceType(face, lang))}</div>
      <div className="tf-text">{faceText(face, lang)}</div>
      {face.basePower !== undefined && (
        <div className="tf-pt">
          {face.basePower}/{face.baseToughness}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  face: CardFace;
  obj?: ObjectView;
  /** CSS width (variable or value). */
  width: string;
  /** Battlefield art card (PLAN-V, as on MTGA): the art in a colored frame, shorter, leaning when tapped. */
  art?: boolean;
  layoutId?: string;
  tapped?: boolean;
  glow?: Glow;
  showStats?: boolean;
  dim?: boolean;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  oid?: string;
}

/**
 * A card, memoized (PLAN-L L10): each update recreates the view's objects, so the card only renders again when its face,
 * its object or another property changes in value; the click goes through a stable function that calls the latest
 * `onClick` (no stale closure).
 */
export function Card(props: CardProps) {
  const latest = useRef(props.onClick);
  latest.current = props.onClick;
  const onClick = useCallback(() => latest.current?.(), []);
  return <CardView {...props} onClick={props.onClick ? onClick : undefined} />;
}

/** Same card: the same values (face and object compared by content, the views being rebuilt at each update). */
function sameCard(a: CardProps, b: CardProps): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof CardProps)[]);
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    if ((k === "face" || k === "obj") && JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    return false;
  }
  return true;
}

const CardView = memo(function CardView({
  face,
  obj,
  width,
  art = false,
  layoutId,
  tapped,
  glow,
  showStats,
  dim,
  className,
  onClick,
  hoverable = true,
  oid,
}: CardProps) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const setPeek = useGame((s) => s.setPeek);
  const t = useT();
  const loc = useLocalize();
  // Touch screen: a long press replaces hovering (overlaid preview).
  const longPress = useLongPress(hoverable ? () => setPeek({ face, obj }) : undefined);
  useRelayActive(); // new URL when the image relay turns on
  // Failed images: next image, then the text frame. A new URL (relay turned on in the meantime) gets another try.
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);
  // Art card: the art crop; if it fails, the whole card framed on its art box.
  const crop = art ? faceArt(face, lang) : undefined;
  const cropOk = crop && !failedSrcs.includes(crop.src);
  const src = cropOk ? crop.src : faceImage(face, lang);
  const fullArt = art && (!cropOk || crop.full);
  const failed = !!src && failedSrcs.includes(src);
  const ratio = art ? PERM_RATIO : 1.395;
  const height = `calc(${width} * ${ratio})`;
  const slotW = !tapped ? width : art ? `calc(${width} * ${TAP_W})` : height;

  // A card exiled face down that the player can't look at (406.3): its back.
  if (face.defId === HIDDEN_CARD_ID)
    return (
      <div className={`card-slot ${className ?? ""}`} style={{ width, height }} data-oid={oid}>
        <CardBack width={width} ratio={ratio} custom={obj ? customBackOf(obj.owner) : false} />
      </div>
    );

  const power = obj?.power;
  const toughness = obj?.toughness;
  const buffed = power !== undefined && (power > (face.basePower ?? 0) || (toughness ?? 0) > (face.baseToughness ?? 0));
  const debuffed = power !== undefined && (power < (face.basePower ?? 0) || (toughness ?? 0) < (face.baseToughness ?? 0));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a role "button" when the card can be used; otherwise, hovering only shows its preview
    <div
      className={`card-slot ${className ?? ""}`}
      style={{ width: slotW, height }}
      data-oid={oid}
      onMouseEnter={hoverable ? () => setHover({ face, obj }) : undefined}
      // Keyboard: Tab to reach a playable card, Enter or Space to use it (focus shows the preview).
      {...(onClick ? { tabIndex: 0, role: "button", "aria-label": faceName(face, lang) } : {})}
      onFocus={onClick && hoverable ? () => setHover({ face, obj }) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      {...longPress}
    >
      <motion.div
        layoutId={layoutId}
        layout
        transition={SPRING}
        className={`card ${art ? `art-card c-${frameOf(obj)}` : ""} ${glow ? `glow-${glow}` : ""} ${dim ? "dim" : ""} ${onClick ? "clickable" : ""}`}
        style={{ width, height }}
        animate={{ rotate: tapped ? (art ? TAP_DEG : 90) : 0 }}
        onClick={onClick}
      >
        <TextFrame face={face} obj={obj} />
        {src && !failed && (
          <img
            src={src}
            className={fullArt ? "full" : undefined}
            alt={faceName(face, lang)}
            draggable={false}
            onError={() => {
              setFailedSrcs((f) => [...f, src]);
              // Scryfall blocked by the network? The server's relay takes over (auto mode).
              void detectBlockedScryfall();
            }}
            // The battlefield shows at once (no lazy loading: the card arrives from the hand or the stack).
            loading={art ? undefined : "lazy"}
            decoding="async"
          />
        )}
        {art && src && !failed && <div className="art-name">{faceName(face, lang)}</div>}
        {obj?.castCost && obj.zone !== "battlefield" && obj.zone !== "stack" && (
          <div
            className={`cost-badge ${obj.castCost.delta < 0 ? "cheaper" : obj.castCost.delta > 0 ? "dearer" : ""}`}
            title={t("Cost to pay: {cost}", { cost: obj.castCost.text })}
          >
            <ManaCost cost={obj.castCost.text} size={15} />
          </div>
        )}
        {showStats && obj && (
          <>
            {power !== undefined && (
              <div
                className={`pt-badge ${buffed ? "buffed" : ""} ${debuffed ? "debuffed" : ""}`}
                title={obj.damage > 0 ? t("{n} damage marked", { n: obj.damage }) : undefined}
              >
                {power}/<span className={obj.damage > 0 ? "damaged" : undefined}>{(toughness ?? 0) - obj.damage}</span>
              </div>
            )}
            {obj.chosen?.manaType && (
              <div className="chosen-badge" title={t("Noted type of mana")}>
                <ManaCost cost={`{${obj.chosen.manaType}}`} size={15} />
              </div>
            )}
            {obj.chosen && !obj.chosen.manaType && (
              <div className="chosen-badge" title={t("Choice made as it entered")}>
                {obj.chosen.creatureType ??
                  obj.chosen.mode ??
                  (obj.chosen.number !== undefined ? String(obj.chosen.number) : undefined) ??
                  loc(COLOR_NAME[obj.chosen.color ?? ""] ?? "")}
              </div>
            )}
            {obj.types.includes("Planeswalker") && (
              <div className="loyalty-badge" title={t("Loyalty")}>
                {obj.counters.loyalty ?? 0}
              </div>
            )}
            <CounterBadges counters={obj.counters} />
            {obj.zone === "battlefield" && <KeywordBadges obj={obj} />}
            {obj.prepared && (
              <div className="prepared-badge" title={t("Prepared: its spell can be cast (at the end of your hand)")}>
                {t("Prepared")}
              </div>
            )}
            {obj.suspected && (
              <div className="suspected-badge" title={t("Suspected: it has menace and can't block")}>
                {t("Suspected")}
              </div>
            )}
            {obj.monstrous && (
              <div className="monstrous-badge" title={t("Monstrous: its monstrosity ability no longer does anything")}>
                {t("Monstrous")}
              </div>
            )}
            {obj.sick && obj.types.includes("Creature") && (
              <div className="sick-badge" title={t("Summoning sickness")}>
                z
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}, sameCard);

const COLOR_NAME: Record<string, string> = {
  W: msg("White"),
  U: msg("Blue"),
  B: msg("Black"),
  R: msg("Red"),
  G: msg("Green"),
};

/** Counter badges: +N for +1/+1, -N for -1/-1, name and number for the others. */
function CounterBadges({ counters }: { counters: Record<string, number> }) {
  const loc = useLocalize();
  const net = (counters["+1/+1"] ?? 0) - (counters["-1/-1"] ?? 0);
  const others = Object.entries(counters).filter(([k, n]) => n > 0 && k !== "+1/+1" && k !== "-1/-1" && k !== "loyalty");
  return (
    <div className="counter-badges">
      {net !== 0 && <span className={`counter-badge ${net < 0 ? "minus" : ""}`}>{net > 0 ? `+${net}` : net}</span>}
      {others.map(([k, n]) => (
        <span key={k} className="counter-badge other" title={loc(counterLabel(k))}>
          {loc(counterLabel(k))} {n}
        </span>
      ))}
    </div>
  );
}

/** Frame color of an art card: land, colorless, multicolored (gold) or its color. */
function frameOf(obj: ObjectView | undefined): string {
  if (!obj) return "C";
  if (obj.types.includes("Land")) return "L";
  if (obj.colors.length > 1) return "M";
  return obj.colors[0] ?? "C";
}

/** Does this player's deck use custom art (card backs)? A string: their art set. */
const customBackOf = (owner: string): boolean | string => useGame.getState().view?.players[owner]?.customArt ?? false;

/** The back of a card; `custom`: the player who owns it uses custom art (a string: of that art set first). */
export function CardBack({ width, custom, ratio = 1.395 }: { width: string; custom?: boolean | string; ratio?: number }) {
  const back = useCustomBack(typeof custom === "string" ? custom : undefined);
  const image = custom && back ? { backgroundImage: `url("${back}")` } : {};
  return <div className="card-back" style={{ width, height: `calc(${width} * ${ratio})`, ...image }} />;
}
