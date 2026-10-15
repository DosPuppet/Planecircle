/**
 * Import and export of decklists (MTGA and MTGO formats, English or French names), and of a deck by a link and its QR
 * code (`share.ts`).
 */
import { CARDS, CardIndex, type DeckList, parseDeckList, serializeDeckList } from "@mtgx/cards";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { Dialog } from "../Dialog";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { usePrintings } from "./printings";
import { deckLink, decodeDeck, sharedDeckData } from "./share";
import { deckName } from "./store";

/**
 * Reading a QR code from the camera: the browser's own detector where it exists (Chrome, Android), otherwise jsQR, a
 * chunk of its own loaded only then (Safari, iPhone: a deck link scanned by the camera opens Safari, not the installed
 * app, so the app scans by itself).
 */
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
const DetectorClass = () =>
  (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
const canScan = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** A reader of the current video frame: the text of the QR code seen, or null. */
async function frameReader(v: HTMLVideoElement): Promise<() => Promise<string | null>> {
  const Detector = DetectorClass();
  if (Detector) {
    const detector = new Detector({ formats: ["qr_code"] });
    return async () => (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  return async () => {
    if (!g || !v.videoWidth) return null;
    // At most 720 px on the long side: enough for a code filling part of the frame, and fast.
    const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * k);
    canvas.height = Math.round(v.videoHeight * k);
    g.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

/** Camera scanner of a QR code: calls `onText` with the first code read. */
function QrScanner({ onText, onClose }: { onText: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const t = useT();
  const latest = useRef(onText);
  latest.current = onText;
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current;
        if (stopped || !v) return;
        v.srcObject = stream;
        await v.play();
        const read = await frameReader(v);
        const scan = async () => {
          if (stopped) return;
          const text = await read().catch(() => null);
          if (text) return latest.current(text);
          timer = window.setTimeout(scan, 250);
        };
        void scan();
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);
  return (
    <div className="qr-scanner">
      {failed ? (
        <p className="hint">{t("The camera is not available.")}</p>
      ) : (
        <p className="hint">{t("Point the camera at a deck's QR code.")}</p>
      )}
      <video ref={video} muted playsInline />
      <button type="button" className="btn ghost" onClick={onClose}>
        {t("Cancel")}
      </button>
    </div>
  );
}

/** Place of a JSX element in a translated sentence (split around it). */
const SLOT = "\u0001";

const INDEX = new CardIndex(CARDS);

export function DeckModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog title={title} className="wide deck-modal" backdropClassName="full" onClose={onClose}>
      {children}
    </Dialog>
  );
}

export function ImportModal({
  current,
  initialText = "",
  onClose,
  onCreate,
  onReplace,
}: {
  /** Decklist to start from (a deck received by a link). */
  initialText?: string;
  /** Editable deck currently open (null if it is read only). */
  current: DeckList | null;
  onClose: () => void;
  onCreate: (deck: DeckList) => void;
  onReplace: (deck: DeckList) => void;
}) {
  const [text, setText] = useState(initialText);
  const [name, setName] = useState("");
  const [scanning, setScanning] = useState(false);
  const notify = useGame((s) => s.notify);
  const lang = useGame((s) => s.lang);
  const t = useT();
  // A deck link pasted (copied from Safari, received in a message): replaced by its decklist.
  // biome-ignore lint/correctness/useExhaustiveDependencies: decoded again only when the text changes
  useEffect(() => {
    const data = sharedDeckData(text.trim());
    if (!data || /\n/.test(text.trim())) return;
    let live = true;
    void decodeDeck(data).then((list) => {
      if (!live) return;
      if (list) setText(list);
      else notify(t("This deck link is damaged."));
    });
    return () => {
      live = false;
    };
  }, [text]);
  // "(STA) 42": printing of the table, once loaded.
  const table = usePrintings();
  const parsed = useMemo(() => parseDeckList(text, INDEX, table?.findPrinting), [text, table]);
  const mainCount = parsed.main.reduce((a, [n]) => a + n, 0);
  const sideCount = parsed.sideboard.reduce((a, [n]) => a + n, 0);
  const blocking = parsed.issues.filter((i) => i.kind === "unknown" || i.kind === "syntax");
  const deck: DeckList = {
    id: "import",
    name: name || parsed.name || t("Imported deck"),
    colors: [],
    main: parsed.main,
    sideboard: parsed.sideboard,
    // "Commander" section (or *CMDR* mark): a Commander deck (PLAN-E).
    ...(parsed.commander?.length ? { commander: parsed.commander, format: "commander" as const } : {}),
  };
  /** Replaces, on the given line, the unknown name with the suggestion. */
  const applySuggestion = (line: number, suggestion: string) => {
    const lines = text.split("\n");
    const l = lines[line - 1];
    if (l === undefined) return;
    const m = /^(\s*(?:SB:\s*)?\d+\s*[xX]?\s+)/.exec(l);
    lines[line - 1] = `${m?.[1] ?? "1 "}${suggestion}`;
    setText(lines.join("\n"));
  };
  const counts = t("Deck: {main} cards · Sideboard: {side}", { main: SLOT, side: SLOT }).split(SLOT);
  return (
    <DeckModal title={t("Import a decklist")} onClose={onClose}>
      <p className="hint">
        {t(
          'Paste a list exported from MTG Arena, MTGO or a deck site ("4 Llanowar Elves (FDN) 227", "4 Elfes de Llanowar"…), or a Planecircle deck link.',
        )}
      </p>
      {scanning ? (
        <QrScanner
          onClose={() => setScanning(false)}
          onText={(raw) => {
            setScanning(false);
            // A Planecircle deck link, or a decklist written in the code itself.
            const data = sharedDeckData(raw);
            if (!data) return setText(raw);
            void decodeDeck(data).then((list) => (list ? setText(list) : notify(t("This deck link is damaged."))));
          }}
        />
      ) : (
        canScan() && (
          <button type="button" className="btn small" onClick={() => setScanning(true)}>
            {t("Scan a QR code")}
          </button>
        )
      )}
      <textarea
        className="decklist-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Deck\n4 Llanowar Elves (FDN) 227\n20 Forest\n\nSideboard\n2 Broken Wings"}
        rows={12}
        spellCheck={false}
      />
      <div className="import-report">
        <span>
          {counts[0]}
          <strong>{mainCount}</strong>
          {counts[1]}
          <strong>{sideCount}</strong>
          {counts[2]}
        </span>
        {parsed.issues.map((i) => (
          <div key={`${i.line}-${i.kind}`} className={i.kind === "unimplemented" || i.kind === "ignored" ? "v-warn" : "v-error"}>
            {t("Line {line}: {message}", { line: i.line, message: textIn(lang, i.message) })}
            {i.suggestion && (
              <button type="button" className="btn small" onClick={() => applySuggestion(i.line, i.suggestion as string)}>
                {t('Replace with "{name}"', { name: i.suggestion })}
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="import-name">
        {t("Deck name")}
        <input value={name} placeholder={parsed.name ?? t("Imported deck")} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("Cancel")}
        </button>
        {current && (
          <button type="button" className="btn" disabled={!mainCount || blocking.length > 0} onClick={() => onReplace(deck)}>
            {t('Replace "{name}"', { name: current.name })}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!mainCount || blocking.length > 0} onClick={() => onCreate(deck)}>
          {t("Create a new deck")}
        </button>
      </div>
    </DeckModal>
  );
}

/** QR code of the deck's link: a phone camera opens Planecircle, which offers to import it. */
function DeckQr({ deck }: { deck: DeckList }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();
  useEffect(() => {
    let live = true;
    void deckLink(deck).then((l) => live && setLink(l));
    return () => {
      live = false;
    };
  }, [deck]);
  if (!link) return null;
  const copy = async () => {
    await navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="deck-qr">
      {/* Dark modules on white, with a quiet zone: what phone cameras read best. */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated by uqr from our own link */}
      <div className="deck-qr-code" dangerouslySetInnerHTML={{ __html: renderSVG(link, { ecc: "L", border: 3 }) }} />
      <p className="hint">{t("Scan it with a phone camera: Planecircle opens and offers to import the deck.")}</p>
      <button type="button" className="btn small" onClick={copy}>
        {copied ? t("Link copied!") : t("Copy the link")}
      </button>
    </div>
  );
}

export function ExportModal({ deck, onClose }: { deck: DeckList; onClose: () => void }) {
  const [format, setFormat] = useState<"mtga" | "fr" | "en" | "qr">("mtga");
  const [copied, setCopied] = useState(false);
  const lang = useGame((s) => s.lang);
  const t = useT();
  // A precon is exported under its name in the interface language.
  const name = deckName(deck, lang);
  const text = serializeDeckList(
    { ...deck, name },
    CARDS,
    format === "mtga" || format === "qr" ? { format: "mtga" } : { format: "plain", lang: format },
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: select the text for a manual copy.
      (document.querySelector(".decklist-output") as HTMLTextAreaElement | null)?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <DeckModal title={t('Export "{name}"', { name })} onClose={onClose}>
      <div className="seg export-format">
        <button type="button" className={format === "mtga" ? "on" : ""} onClick={() => setFormat("mtga")}>
          MTG Arena
        </button>
        <button type="button" className={format === "en" ? "on" : ""} onClick={() => setFormat("en")}>
          {t("Text (English)")}
        </button>
        <button type="button" className={format === "fr" ? "on" : ""} onClick={() => setFormat("fr")}>
          {t("Text (French)")}
        </button>
        <button type="button" className={format === "qr" ? "on" : ""} onClick={() => setFormat("qr")}>
          {t("QR code")}
        </button>
      </div>
      {format === "qr" ? (
        <DeckQr deck={{ ...deck, name }} />
      ) : (
        <textarea className="decklist-output" value={text} readOnly rows={14} spellCheck={false} />
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("Close")}
        </button>
        {format !== "qr" && (
          <>
            <button type="button" className="btn" onClick={download}>
              {t("Download (.txt)")}
            </button>
            <button type="button" className="btn primary" onClick={copy}>
              {copied ? t("Copied!") : t("Copy")}
            </button>
          </>
        )}
      </div>
    </DeckModal>
  );
}
