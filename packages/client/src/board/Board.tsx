import { type GameView, msg, type ObjectView, type PlayerView } from "@mtgx/engine";
import { motion } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { resolveBoardTheme } from "../boardThemes";
import { faceName, PHASE_BAR, STEP_LABEL } from "../i18n";
import { useLocalize, useT } from "../localize";
import { boardPick, choiceSource, pickValid, shortPrompt } from "../prompts/boardChoice";
import { myActions, useGame } from "../store";
import { isTouch, justLongPressed } from "../touch";
import { Arrows } from "./Arrows";
import { Backdrop } from "./Backdrop";
import { Card, CardBack, ManaCost } from "./Card";
import { combatPreview } from "./combatPreview";
import { Effects } from "./Effects";
import { type Glow, handGlow, permanentGlow, playableCards, stackGlow } from "./glows";
import { dropPlays, handTap } from "./handInput";
import {
  type BattlefieldFit,
  battlefieldModel,
  CARD_RATIO,
  fanSpread,
  fitBattlefield,
  fitHand,
  handFan,
  LAND_SCALE,
  PERM_RATIO,
  type Slot,
  splitLines,
  TOKEN_SHADOWS,
} from "./layout";
import { StackReveal } from "./StackReveal";

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

function ManaPool({ pool, restricted }: { pool: PlayerView["manaPool"]; restricted?: PlayerView["restrictedMana"] }) {
  const cost = Object.entries(pool)
    .flatMap(([m, n]) => Array(n).fill(`{${m}}`))
    .join("");
  const reserved = (restricted ?? []).map((m) => `{${m}}`).join("");
  const t = useT();
  if (!cost && !reserved) return null;
  return (
    <div className="mana-pool" title={t("Mana pool")}>
      {cost && <ManaCost cost={cost} size={18} />}
      {reserved && (
        <span className="mana-restricted" title={t("Mana restricted to certain spells or abilities")}>
          <ManaCost cost={reserved} size={18} />
        </span>
      )}
    </div>
  );
}

const ICONS = {
  library: "M4 3h11a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V3zm2 2v12h9V5H6zm13 2h1v14H8v-1h11V7z",
  hand: "M3 6l7-3 3 7-7 3-3-7zm8 2l6-2 3 8-6 2-3-8z",
  grave: "M7 21V9a5 5 0 0 1 10 0v12H7zm4-12v3H9v2h2v4h2v-4h2v-2h-2V9h-2z",
  // A vortex (spiral) for exile.
  exile:
    "M12 3a9 9 0 1 1-9 9h2a7 7 0 1 0 7-7 5 5 0 0 0-5 5 3 3 0 0 0 3 3 1 1 0 0 0 1-1h2a3 3 0 0 1-3 3 5 5 0 0 1-5-5 7 7 0 0 1 7-7z",
  // A crown with three points.
  crown: "M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7zm3 14h12v2H6v-2z",
  // A city: three crenellated towers.
  city: "M2 21V10h2V8h2v2h1V5h2v2h2V5h2v2h2V5h2v5h1V8h2v2h2v11h-8v-4a2 2 0 0 0-4 0v4H2z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Life total: grows and changes color on each change. */
function LifeTotal({ life }: { life: number }) {
  const prev = useRef(life);
  const delta = life - prev.current;
  useEffect(() => {
    prev.current = life;
  }, [life]);
  return (
    <motion.span
      key={life}
      className={`life ${life <= 5 ? "low" : ""}`}
      initial={delta ? { scale: 1.7, color: delta < 0 ? "#ff5a4f" : "#6ee7a0" } : false}
      animate={{ scale: 1, color: life <= 5 ? "#ff7a6b" : "#e9edf2" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {life}
    </motion.span>
  );
}

export function PlayerBar({ player, isMe }: { player: PlayerView; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const clickPlayer = useGame((s) => s.clickPlayer);
  const clickPermanent = useGame((s) => s.clickPermanent);
  const openGraveyard = useGame((s) => s.openGraveyard);
  const openExile = useGame((s) => s.openExile);
  const lang = useGame((s) => s.lang);
  const aiming = useGame((s) => s.aimingAttacker);
  const selection = useGame((s) => s.selection);
  const t = useT();
  const loc = useLocalize();
  const p = view.pending;
  const pick = boardPick(view);
  const picked = !!pick && selection.includes(player.id);
  // Targeting of a spell, option of a choice on the board, or possible target of the attacker being aimed.
  const resolvingTargets = useGame((s) => s.resolving?.item.targets);
  const isTarget =
    !!resolvingTargets?.includes(player.id) ||
    (casting?.stage === "target" && casting.spec?.legal.includes(player.id)) ||
    (!!pick && !picked && pick.options.includes(player.id)) ||
    (!!aiming && p?.kind === "declareAttackers" && !!(p.allowed?.[aiming] ?? p.defenders)?.includes(player.id));
  const thinking = view.pending?.player === player.id && !isMe;
  const active = view.turn.active === player.id;
  const top = player.graveyard[player.graveyard.length - 1];
  return (
    <div className={`player-bar ${isMe ? "me" : "opp"} ${active ? "active-turn" : ""}`}>
      <button
        type="button"
        className={`avatar ${isTarget ? "glow-target" : ""} ${picked ? "glow-picked" : ""} ${active ? "active" : ""}`}
        data-oid={player.id}
        data-tuto={isMe ? "life-me" : "life-opp"}
        onClick={() => clickPlayer(player.id)}
      >
        <span className="avatar-initial">{isMe ? t("ctx:initial|Y") : player.name.slice(0, 3)}</span>
        <LifeTotal life={player.life} />
      </button>
      <div className="player-info">
        <div className="player-name">
          {player.name}
          {active && <span className="turn-chip">{isMe ? t("Your turn") : t("Their turn")}</span>}
          {thinking && <span className="thinking">{t("thinking…")}</span>}
        </div>
        <div className="player-counts">
          <span title={t("Library")} data-tuto={isMe ? "library-me" : undefined}>
            <Icon d={ICONS.library} /> {player.libraryCount}
          </span>
          {!isMe && (
            <span title={t("Hand")}>
              <Icon d={ICONS.hand} /> {player.handCount}
            </span>
          )}
          <button
            type="button"
            className="gy-button"
            data-tuto={isMe ? "graveyard-me" : undefined}
            title={t("Graveyard (click to view)")}
            onClick={() => openGraveyard(player.id)}
          >
            <Icon d={ICONS.grave} /> {player.graveyard.length}
            {top && <span className="gy-top">{faceName(top, lang)}</span>}
          </button>
          <button
            type="button"
            className="gy-button exile-button"
            data-tuto={isMe ? "exile-me" : undefined}
            title={t("Exile (click to view)")}
            onClick={() => openExile(player.id)}
          >
            <Icon d={ICONS.exile} /> {view.exile.filter((o) => o.owner === player.id).length}
          </button>
          {!!player.poison && (
            <span
              className={`poison-chip ${player.poison >= 7 ? "danger" : ""}`}
              title={t("Poison counters (10: the player loses)")}
            >
              ☠ {player.poison}
            </span>
          )}
          {!!player.rad && (
            <span
              className="poison-chip rad-chip"
              title={t(
                "Rad counters: at the beginning of their first main phase, the player mills that many cards and loses 1 life (and a counter) for each nonland card milled",
              )}
            >
              ☢ {player.rad}
            </span>
          )}
          {!!player.skipTurns && (
            <span
              className="poison-chip skip-chip"
              title={t("Skips their next {n} turn(s)", { n: player.skipTurns })}
              data-testid="skip-turns"
            >
              ⏭ {player.skipTurns}
            </span>
          )}
          {player.speed !== undefined && <SpeedGauge player={player.id} speed={player.speed} />}
          {player.emblems.map((e, i) =>
            // Emblem with an ability that can be activated now (Karn, Living Legacy): a button.
            isMe && myActions(view).some((a) => a.type === "activate" && a.source === e.id) ? (
              <button
                type="button"
                key={`${e.name}-${i}`}
                className="emblem-chip activatable"
                title={t("{text} (click to activate)", { text: loc(e.text) })}
                onClick={() => clickPermanent(e.id)}
              >
                ✦ {loc(e.name)}
              </button>
            ) : (
              <span key={`${e.name}-${i}`} className="emblem-chip" title={loc(e.text)}>
                ✦ {loc(e.name)}
              </span>
            ),
          )}
        </div>
        <CommanderChips player={player} />
      </div>
      <ManaPool pool={player.manaPool} restricted={player.restrictedMana} />
    </div>
  );
}

/** Zone of a commander, as shown on its chip (missing: in the command zone). */
const COMMANDER_ZONE: Partial<Record<string, string>> = {
  battlefield: msg("on the battlefield"),
  stack: msg("on the stack"),
  hand: msg("in hand"),
  library: msg("in the library"),
  graveyard: msg("in the graveyard"),
  exile: msg("in exile"),
};

/**
 * Commander (PLAN-E): the player's commanders (zone, tax of the next cast from the command zone) and the commander
 * damage they have received (21 from the same commander: they lose).
 */
function CommanderChips({ player }: { player: PlayerView }) {
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const t = useT();
  const loc = useLocalize();
  const name = (defId: string) => faceName(faces[defId], lang);
  // Short name (before the comma: "Edgar Markov", "Y'shtola") for the damage received, the full name in the tooltip.
  const short = (defId: string) => name(defId).split(",")[0];
  if (!player.commanders?.length && !player.commanderDamage?.length) return null;
  return (
    <div className="commander-row">
      {player.commanders?.map((c) => {
        const zone = COMMANDER_ZONE[c.zone];
        const where = zone === undefined ? undefined : loc(zone);
        // The commander's card in the art of its owner's deck (custom art).
        const base = faces[c.defId];
        const face = base && player.customArt ? { ...base, customArt: player.customArt } : base;
        const title = where ? t("Commander ({zone})", { zone: where }) : t("Commander (command zone)");
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: hovering only shows the card's preview
          <span
            key={c.defId}
            className={`commander-chip ${c.zone === "command" ? "waiting" : ""}`}
            title={c.tax ? t("{commander} · tax +{tax}", { commander: title, tax: c.tax }) : title}
            onMouseEnter={face ? () => setHover({ face }) : undefined}
            data-testid="commander-chip"
          >
            ♛ {name(c.defId)}
            {where && <span className="commander-where"> · {where}</span>}
            {c.tax > 0 && <span className="commander-tax">+{c.tax}</span>}
          </span>
        );
      })}
      {player.commanderDamage?.map((c) => (
        <span
          key={c.defId}
          className={`commander-damage ${c.amount >= 15 ? "danger" : ""}`}
          title={t("Commander damage received from {card} (21: the player loses)", { card: name(c.defId) })}
          data-testid="commander-damage"
        >
          ⚔ {short(c.defId)} {c.amount}
        </span>
      ))}
    </div>
  );
}

/**
 * Speed (702.179): a gauge from 1 to 4; at 4, the player's "Max speed" abilities are active.
 * Remounted on each change (key), to replay the animation.
 */
function SpeedGauge({ player, speed }: { player: string; speed: number }) {
  const t = useT();
  const max = speed >= 4;
  const title = max
    ? t('Max speed (4/4): "Max speed" abilities are active')
    : t('Speed {speed}/4: "Max speed" abilities are not active yet', { speed });
  return (
    <span
      key={speed}
      className={`speed-gauge ${max ? "max" : ""}`}
      title={title}
      role="img"
      aria-label={title}
      data-speed-of={player}
    >
      ⚡
      <span className="speed-pips">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`speed-pip ${n <= speed ? "on" : ""}`} />
        ))}
      </span>
      {max ? "MAX" : speed}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Battlefield
// ---------------------------------------------------------------------------

export function usePermanentGlow(): (o: ObjectView) => Glow {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const attackers = useGame((s) => s.attackers);
  const blocks = useGame((s) => s.blocks);
  const selectedBlocker = useGame((s) => s.selectedBlocker);
  const aiming = useGame((s) => s.aimingAttacker);
  const selection = useGame((s) => s.selection);
  const resolving = useGame((s) => s.resolving);
  return permanentGlow({
    view,
    acts: myActions(view),
    pick: boardPick(view),
    casting,
    attackers,
    blocks,
    selectedBlocker,
    aiming,
    selection,
    resolving,
  });
}

/**
 * A permanent, with its Auras and Equipment stacked behind it, then the cards it exiled (Sheltered by Ghosts, linked
 * cards…): they stick out the same way, tinted, and grow on hover.
 */
function Permanent({
  o,
  width,
  isMe,
  attached,
  exiled = [],
  glow,
  showStats,
}: {
  o: ObjectView;
  width: string;
  isMe: boolean;
  attached: ObjectView[];
  exiled?: ObjectView[];
  glow: (o: ObjectView) => Glow;
  showStats: boolean;
}) {
  const clickPermanent = useGame((s) => s.clickPermanent);
  const attackers = useGame((s) => s.attackers);
  const t = useT();
  const attacking = o.attacking || attackers.includes(o.id);
  const n = attached.length + exiled.length;
  return (
    <div
      className={`perm ${attacking ? (isMe ? "advance-up" : "advance-down") : ""} ${n ? "has-attach" : ""}`}
      style={n ? ({ "--attach-n": n } as CSSProperties) : undefined}
    >
      {attached.map((a, i) => (
        <div key={a.uid} className="attachment" style={{ "--attach-i": i } as CSSProperties}>
          <Card
            face={a}
            obj={a}
            width={width}
            art
            layoutId={a.uid}
            tapped={a.tapped}
            glow={glow(a)}
            onClick={() => clickPermanent(a.id)}
            oid={a.id}
          />
        </div>
      ))}
      {exiled.map((a, i) => (
        <div
          key={a.uid}
          className="attachment exiled-under"
          style={{ "--attach-i": attached.length + i } as CSSProperties}
          title={t("Exiled card (hover to see it)")}
        >
          <Card face={a} obj={a} width={width} art />
          <span className="exiled-tag">{t("ctx:zone|Exile")}</span>
        </div>
      ))}
      <Card
        face={o}
        obj={o}
        width={width}
        art
        layoutId={o.uid}
        tapped={o.tapped}
        glow={glow(o)}
        showStats={showStats}
        onClick={() => clickPermanent(o.id)}
        oid={o.id}
      />
    </div>
  );
}

/**
 * Pile of identical tokens (as on MTGA): the top card, a few cards offset behind it and the number.
 * A click acts on the first token; since tokens in different states are not grouped, making a token
 * attack takes it out of the pile.
 */
function TokenStack({ slot, width, isMe, glow }: { slot: Slot; width: string; isMe: boolean; glow: (o: ObjectView) => Glow }) {
  const top = slot.objs[0] as ObjectView;
  const shadows = Math.min(TOKEN_SHADOWS, slot.objs.length - 1);
  const t = useT();
  return (
    <div
      className="perm-group token-stack"
      data-oids={slot.objs.map((o) => o.id).join(" ")}
      style={{ "--shadows": shadows } as CSSProperties}
      title={t("{n} {name} tokens", { n: slot.objs.length, name: top.name })}
    >
      {slot.objs.slice(1, 1 + shadows).map((o, i) => (
        <div key={o.uid} className="token-shadow" style={{ "--shadow-i": shadows - i } as CSSProperties}>
          <Card face={o} obj={o} width={width} art tapped={o.tapped} hoverable={false} />
        </div>
      ))}
      <Permanent o={top} width={width} isMe={isMe} attached={[]} glow={glow} showStats />
      <span className="token-count">×{slot.objs.length}</span>
    </div>
  );
}

function PermanentLine({
  slots,
  row,
  isMe,
  attachments,
  exiled,
  glow,
}: {
  slots: Slot[];
  row: "front" | "back";
  isMe: boolean;
  /** Auras and Equipment, by host permanent. */
  attachments: Map<string, ObjectView[]>;
  /** Cards exiled by a permanent, by permanent. */
  exiled: Map<string, ObjectView[]>;
  glow: (o: ObjectView) => Glow;
}) {
  const width = row === "back" ? "var(--land-w)" : "var(--card-w)";
  return (
    <div className="perm-line">
      {slots.map((slot, i) => {
        const first = slot.objs[0] as ObjectView;
        // Back row: wider space between the lands and the artifacts or enchantments.
        const blockStart = i > 0 && slot.block !== slots[i - 1]?.block ? "block-start" : "";
        if (slot.kind === "tokens") {
          return (
            <div key={first.uid} className={`slot ${blockStart}`}>
              <TokenStack slot={slot} width={width} isMe={isMe} glow={glow} />
            </div>
          );
        }
        return (
          <div key={first.uid} className={`slot perm-group ${slot.kind === "pile" ? "stacked" : ""} ${blockStart}`}>
            {slot.objs.map((o) => (
              <Permanent
                key={o.uid}
                o={o}
                width={width}
                isMe={isMe}
                attached={attachments.get(o.id) ?? []}
                exiled={exiled.get(o.id)}
                glow={glow}
                showStats={slot.block !== "lands"}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A player's battlefield: the card size depends on their zone alone (as on MTGA). */
function Battlefield({ player, isMe }: { player: string; isMe: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const glow = usePermanentGlow();
  const blocks = useGame((s) => s.blocks);
  const attackTargets = useGame((s) => s.attackTargets);
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<BattlefieldFit>({ cardW: 0, frontLines: 1, backLines: 1, walkerStep: 0 });
  // Tokens whose interface state differs (glow, blocked attacker, attacked player) are not grouped.
  const blocked = new Set(Object.values(blocks));
  const uiKey = (o: ObjectView) => `${glow(o) ?? ""}|${blocked.has(o.id) ? "b" : ""}|${attackTargets[o.id] ?? ""}`;
  const { attachments, exiled, front, back, walkers, depth, signature } = battlefieldModel(view, player, uiKey);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed when the permanents change (signature)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const f = fitBattlefield(el.clientWidth, el.clientHeight, front, back, walkers, depth);
      setFit((cur) =>
        cur.cardW === f.cardW &&
        cur.frontLines === f.frontLines &&
        cur.backLines === f.backLines &&
        cur.walkerStep === f.walkerStep
          ? cur
          : f,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [signature]);

  const { cardW, frontLines, backLines, walkerStep } = fit;
  const lines = (slots: Slot[], n: number, row: "front" | "back") => {
    const ls = splitLines(slots, n);
    return (isMe ? ls : ls.reverse()).map((l, i) => (
      <PermanentLine key={`${row}${i}`} slots={l} row={row} isMe={isMe} attachments={attachments} exiled={exiled} glow={glow} />
    ));
  };
  const rows = [
    <div key="f" className="perm-row front">
      {lines(front, frontLines, "front")}
    </div>,
    <div key="b" className="perm-row back">
      {lines(back, backLines, "back")}
    </div>,
  ];
  const style = cardW ? ({ "--card-w": `${cardW}px`, "--land-w": `${cardW * LAND_SCALE}px` } as CSSProperties) : undefined;
  // Planeswalkers overlap when they don't fit in height (the top of each card stays visible).
  const overlap = cardW ? Math.min(0, walkerStep - cardW * PERM_RATIO) : 0;
  return (
    <div ref={ref} className={`battlefield ${isMe ? "me" : "opp"}`} data-tuto={isMe ? "field-me" : "field-opp"} style={style}>
      {view.players[player]?.citysBlessing && <CitysBlessing name={isMe ? null : (view.players[player]?.name ?? "")} />}
      {view.players[player]?.monarch && (
        <Monarch name={isMe ? null : (view.players[player]?.name ?? "")} slot={view.players[player]?.citysBlessing ? 1 : 0} />
      )}
      <div className="bf-rows">{isMe ? rows : rows.reverse()}</div>
      {walkers.length > 0 && (
        // Planeswalker (and battle) zone, on the far right as on MTGA.
        <div className="walker-zone">
          {walkers.map((slot, i) => {
            const o = slot.objs[0] as ObjectView;
            return (
              <div key={o.uid} className="walker" style={{ marginTop: i ? overlap : 0, "--walker-z": i + 1 } as CSSProperties}>
                <Permanent
                  o={o}
                  width="var(--card-w)"
                  isMe={isMe}
                  attached={attachments.get(o.id) ?? []}
                  exiled={exiled.get(o.id)}
                  glow={glow}
                  showStats
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * City's blessing (702.131): an icon in a corner of the battlefield of whoever has it; on hover (or on touch), what it
 * is and who holds it.
 */
function CitysBlessing({ name }: { name: string | null }) {
  const t = useT();
  return (
    // Button (focusable): the tooltip also shows on touch and with the keyboard.
    <button
      type="button"
      className="citys-blessing"
      aria-label={
        name === null
          ? t("City's blessing: you have the city's blessing")
          : t("City's blessing: {player} has the city's blessing", { player: name })
      }
      data-testid="citys-blessing"
    >
      <Icon d={ICONS.city} />
      <span className="citys-blessing-tip" role="tooltip">
        <strong>{t("City's blessing")}</strong>
        <span>
          {name === null
            ? t("You have the city's blessing for the rest of the game.")
            : t("{player} has the city's blessing for the rest of the game.", { player: name })}
        </span>
        <span className="citys-blessing-rule">
          {t("It is gained through ascend, by controlling ten or more permanents; the abilities that require it are active.")}
        </span>
      </span>
    </button>
  );
}

/**
 * Monarch (724): a crown in the corner of the battlefield of whoever is the monarch (next to the city's blessing if they
 * also have it); on hover (or on touch), what it is and who is.
 */
function Monarch({ name, slot }: { name: string | null; slot: number }) {
  const t = useT();
  return (
    <button
      type="button"
      className="citys-blessing monarch-badge"
      style={{ left: 4 + slot * 32 }}
      aria-label={name === null ? t("Monarch: you are the monarch") : t("Monarch: {player} is the monarch", { player: name })}
      data-testid="monarch"
    >
      <Icon d={ICONS.crown} />
      <span className="citys-blessing-tip" role="tooltip">
        <strong>{t("Monarch")}</strong>
        <span>{name === null ? t("You are the monarch.") : t("{player} is the monarch.", { player: name })}</span>
        <span className="citys-blessing-rule">
          {t(
            "At the beginning of their end step, the monarch draws a card. A creature that deals combat damage to the monarch makes its controller the monarch.",
          )}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Center strip: phases, stack, instructions
// ---------------------------------------------------------------------------

function PhaseBar() {
  const view = useGame((s) => s.view) as GameView;
  const settings = useGame((s) => s.settings);
  const toggleStop = useGame((s) => s.toggleStop);
  const t = useT();
  const loc = useLocalize();
  const myTurn = view.turn.active === view.viewer;
  // The player's name is set in bold inside the sentence: the template is split around a marker.
  const PLAYER = "\u0001";
  const [turnBefore = "", turnAfter = ""] = t("Turn {n} · {player}", { n: view.turn.number, player: PLAYER }).split(PLAYER);
  return (
    <div className="phase-bar" data-tuto="phase-bar">
      <div className="phase-turn">
        {turnBefore}
        <strong>{myTurn ? t("you") : view.players[view.turn.active]?.name}</strong>
        {turnAfter}
      </div>
      <div className="phases" data-tuto="stops">
        {PHASE_BAR.map(({ step, short }) => {
          const current = view.turn.step === step || (step === "combatDamage" && view.turn.step === "firstStrikeDamage");
          return (
            <div
              key={step}
              className={`phase ${current ? (myTurn ? "current me" : "current opp") : ""}`}
              title={loc(STEP_LABEL[step])}
            >
              <span className="phase-label">{loc(short)}</span>
              <span className="stops">
                <button
                  type="button"
                  className={`stop me ${settings.stops.own.includes(step) ? "on" : ""}`}
                  title={t("Stop during your turn: {step}", { step: STEP_LABEL[step] })}
                  onClick={() => toggleStop("own", step)}
                />
                <button
                  type="button"
                  className={`stop opp ${settings.stops.opponent.includes(step) ? "on" : ""}`}
                  title={t("Stop during the opponent's turn: {step}", { step: STEP_LABEL[step] })}
                  onClick={() => toggleStop("opponent", step)}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StackView() {
  const view = useGame((s) => s.view) as GameView;
  const casting = useGame((s) => s.casting);
  const pickTarget = useGame((s) => s.pickTarget);
  const notify = useGame((s) => s.notify);
  const t = useT();
  const loc = useLocalize();
  if (view.stack.length === 0) return null;
  const targeting = casting?.stage === "target" ? casting.spec : null;
  return (
    <div className="stack" data-tuto="stack">
      <div className="stack-label">{t("Stack")}</div>
      <div className="stack-items">
        {view.stack.map((item, i) => (
          <motion.div
            key={item.id}
            className={`stack-item ${item.controller === view.viewer ? "me" : "opp"}`}
            style={{ zIndex: i }}
            initial={{ scale: 0.6, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <Card
              face={item}
              width="var(--stack-w)"
              layoutId={item.kind === "spell" ? item.uid : undefined}
              oid={item.id}
              glow={stackGlow(item.id, i === view.stack.length - 1, casting)}
              onClick={
                targeting
                  ? () => (targeting.legal.includes(item.id) ? pickTarget(item.id) : notify(t("Invalid target.")))
                  : undefined
              }
            />
            {item.kind === "ability" && !item.effect && <div className="ability-tag">{t("Ability")}</div>}
            {item.effect && i === view.stack.length - 1 && (
              <div className="stack-effect" title={loc(item.effect)}>
                {loc(item.effect)}
              </div>
            )}
            {item.copy && <div className="ability-tag">{t("ctx:noun|Copy")}</div>}
            {item.kicked && <div className="ability-tag">{t("Kicked")}</div>}
            {item.x > 0 && <div className="ability-tag">X = {item.x}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Banner() {
  const view = useGame((s) => s.view) as GameView;
  const loc = useLocalize();
  const t = useT();
  const casting = useGame((s) => s.casting);
  const cancel = useGame((s) => s.cancel);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const confirmTargets = useGame((s) => s.confirmTargets);
  const confirmMana = useGame((s) => s.confirmMana);
  const aiming = useGame((s) => s.aimingAttacker);
  const lang = useGame((s) => s.lang);
  const selection = useGame((s) => s.selection);
  const p = view.pending;
  const mine = p?.player === view.viewer;
  const pick = boardPick(view);
  const nameOf = (id: string | undefined) =>
    (id && (view.players[id]?.name ?? faceNameOf(view.battlefield.find((o) => o.id === id)))) || t("The opponent");
  const faceNameOf = (o: ObjectView | undefined) => (o ? faceName(o, lang) : undefined);

  let text: string;
  let extra: React.ReactNode = null;
  if (casting?.stage === "target" && casting.spec) {
    const max = casting.spec.count ?? 1;
    const n = casting.picked?.length ?? 0;
    const label = casting.spec.label === undefined ? t("target") : loc(casting.spec.label);
    text =
      max === 1
        ? t("Choose a target: {label}", { label })
        : casting.spec.optional
          ? t("Choose up to {max} targets: {label} ({n}/{max})", { max, label, n })
          : t("Choose {max} targets: {label} ({n}/{max})", { max, label, n });
    extra = (
      <>
        {max > 1 && (n > 0 || casting.spec.optional) && (
          <button type="button" className="btn small primary" onClick={confirmTargets}>
            {t("Confirm ({n})", { n })}
          </button>
        )}
        {casting.spec.optional && max === 1 && (
          <button type="button" className="btn small" onClick={chooseNoTarget}>
            {t("No target")}
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={cancel}>
          {t("Cancel (Esc)")}
        </button>
      </>
    );
  } else if (casting?.stage === "mana") {
    // Full control (PLAN-L L7): the sources tapped by hand pay first, the automatic payment completes the rest.
    text = t("Tap your sources, then pay (the rest is automatic)");
    extra = (
      <>
        <button type="button" className="btn small primary" onClick={confirmMana} data-testid="pay-mana">
          {t("Pay")}
        </button>
        <button type="button" className="btn small ghost" onClick={cancel}>
          {t("Cancel (Esc)")}
        </button>
      </>
    );
  } else if (pick) {
    const source = choiceSource(view);
    const what = shortPrompt(loc(pick.prompt), source);
    const counts = { n: selection.length, max: pick.max };
    text = source
      ? t("{card}: {prompt} ({n}/{max})", { card: faceName(source.face, lang), prompt: what, ...counts })
      : t("{prompt} ({n}/{max})", { prompt: what, ...counts });
  } else if (!p) text = view.over ? t("Game over") : "…";
  else if (!mine) {
    const player = nameOf(p.player);
    switch (p.kind) {
      case "priority":
        text = t("{player} is playing…", { player });
        break;
      case "declareAttackers":
        text = t("{player} is declaring attackers…", { player });
        break;
      case "declareBlockers":
        text = t("{player} is declaring blockers…", { player });
        break;
      case "mulligan":
      case "bottomCards":
        text = t("{player} is choosing their hand…", { player });
        break;
      case "choice":
        text = t("{player} is making a choice…", { player });
        break;
      case "discard":
        text = t("{player} is discarding…", { player });
        break;
      default:
        text = t("{player} is thinking…", { player });
    }
  } else if (p.kind === "declareAttackers") {
    const defenders = p.defenders ?? [];
    text =
      defenders.length <= 1
        ? t("Click the attacking creatures")
        : aiming
          ? t("{attacker} attacks… click its target (highlighted) — Esc to cancel", { attacker: nameOf(aiming) })
          : t("Click a creature, then the player or planeswalker it attacks");
  } else if (p.kind === "declareBlockers") {
    text = t("Blockers: click one of your creatures, then the attacker to block");
  } else if (p.kind === "priority" && p.castNow) {
    // 608.2g: the card to cast glows at the end of the hand; the main button declines.
    text = loc(p.castNow.prompt);
  } else if (p.kind === "priority" && view.stack.length > 0) {
    const top = view.stack[view.stack.length - 1];
    // "respond?" only if a response is possible (otherwise the StackReveal panel shows it).
    const canRespond = myActions(view).some((a) => a.type !== "pass" && a.type !== "tapForMana");
    if (top && top.controller !== view.viewer) {
      const args = { player: nameOf(top.controller), card: faceName(top, lang) };
      if (top.kind === "ability")
        text = canRespond ? t("{player} activates {card} — respond?", args) : t("{player} activates {card}", args);
      else text = canRespond ? t("{player} casts {card} — respond?", args) : t("{player} casts {card}", args);
    } else text = t("Your spell is about to resolve");
  } else {
    const step = STEP_LABEL[view.turn.step];
    text =
      view.turn.active === view.viewer
        ? t("{step} — your turn", { step })
        : t("{step} — {player}", { step, player: nameOf(view.turn.active) });
  }
  return (
    <div className={`banner ${mine ? "mine" : ""}`}>
      <span>{text}</span>
      {extra}
    </div>
  );
}

/** Time left before `deadline` (Date.now()), refreshed several times per second. */
function useRemaining(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

/** Rope (online play): the end of the time for the current decision, as on MTGA. */
function Rope() {
  const clock = useGame((s) => s.online?.clock);
  const view = useGame((s) => s.view);
  const remaining = useRemaining(clock?.deadline);
  const t = useT();
  if (!clock || remaining === null || !view || view.over || remaining > clock.ropeMs) return null;
  const mine = clock.player === view.viewer;
  const who = mine ? t("You") : (view.players[clock.player]?.name ?? t("The opponent"));
  const seconds = Math.ceil(remaining / 1000);
  const timeouts = clock.timeouts[clock.player];
  return (
    <div className={`rope ${mine ? "mine" : ""}`} role="timer" aria-live="polite">
      <div className="rope-bar" style={{ width: `${(remaining / clock.ropeMs) * 100}%` }} />
      <span className="rope-text">
        {timeouts
          ? t("{player} · {seconds} s · time out {count}/{max}", {
              player: who,
              seconds,
              count: timeouts,
              max: clock.maxTimeouts,
            })
          : t("{player} · {seconds} s", { player: who, seconds })}
      </span>
    </div>
  );
}

/** Network banner (online play): opponent disconnected, or your connection lost. */
function NetBanner() {
  const online = useGame((s) => s.online);
  const view = useGame((s) => s.view);
  const remaining = useRemaining(online?.opponent.deadline);
  const t = useT();
  if (!online || !view || view.over) return null;
  if (online.reconnecting) return <div className="net-banner">{t("Connection to the server lost — reconnecting…")}</div>;
  // Multiplayer: the players still in the game who have disconnected (they concede if they don't come back in time).
  if ((online.match?.seats ?? 2) > 2) {
    const gone = online.players.filter((p) => p.seat !== online.seat && !p.connected && !view.players[p.seat]?.lost);
    if (!gone.length) return null;
    return (
      <div className="net-banner">
        {gone.length > 1
          ? t("{players} have disconnected — they concede if they don't come back in time", {
              players: gone.map((p) => p.name).join(", "),
            })
          : t("{player} has disconnected — they concede if they don't come back in time", { player: gone[0]?.name ?? "" })}
      </div>
    );
  }
  if (online.opponent.connected) return null;
  const opp = view.players[view.opponents[0] ?? ""]?.name ?? t("The opponent");
  return (
    <div className="net-banner">
      {remaining !== null
        ? t("{player} has disconnected — win by concession in {seconds} s if they don't come back", {
            player: opp,
            seconds: Math.ceil(remaining / 1000),
          })
        : t("{player} has disconnected", { player: opp })}
    </div>
  );
}

export function CenterStrip() {
  return (
    <div className="center-strip">
      <PhaseBar />
      <div className="center-main">
        <Banner />
        <StackView />
      </div>
      <Rope />
      <NetBanner />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hand and actions
// ---------------------------------------------------------------------------

/** Tag of the cards playable from a zone other than the hand. */
const ZONE_TAG: Record<string, string> = {
  exile: msg("ctx:zone|Exile"),
  graveyard: msg("Graveyard"),
  library: msg("Library"),
  command: msg("ctx:card|Commander"),
};

/** The hand; `ghost` (3D board, PLAN-W): the same cards and gestures, drawn by the meshes under them. */
export function Hand({ ghost = false }: { ghost?: boolean }) {
  const view = useGame((s) => s.view) as GameView;
  const clickHandCard = useGame((s) => s.clickHandCard);
  const setHover = useGame((s) => s.setHover);
  const selection = useGame((s) => s.selection);
  const casting = useGame((s) => s.casting);
  const loc = useLocalize();
  const handRef = useRef<HTMLDivElement>(null);
  // A drag also ends with a "tap": it is ignored so as not to send two decisions.
  const dragged = useRef(false);
  // Touch screen: card lifted by a first tap (no hover), played by the second.
  const [lifted, setLifted] = useState<string | null>(null);
  const playable = playableCards(myActions(view));
  // Cards playable from another zone (exile, graveyard, top of the library): at the end of the hand, tagged.
  const cards = [...view.hand, ...view.playableElsewhere];
  const elsewhere = new Map(view.playableElsewhere.map((c) => [c.id, c.zone]));
  const n = cards.length;

  // Step between the cards: they close up to fit in the width of the hand (see fitHand).
  const [box, setBox] = useState({ width: 0, cardW: 0, rise: 34 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the number of cards changes
  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const measure = () => {
      const cardW = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      // Hovered card: it rises out of the bottom of the screen until it is whole (share hidden: 1 − --hand-peek).
      const peek = Number.parseFloat(getComputedStyle(el).getPropertyValue("--hand-peek")) || 0.82;
      const rise = Math.max(34, Math.round(cardW * CARD_RATIO * (1 - peek)) + 12);
      setBox((cur) =>
        cur.width === el.clientWidth && cur.cardW === cardW && cur.rise === rise ? cur : { width: el.clientWidth, cardW, rise },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);
  const step = box.cardW ? fitHand(box.width, box.cardW, n) : null;
  const spread = fanSpread(box.width, box.cardW);
  const margin = step === null ? undefined : `0 ${-(box.cardW - step) / 2}px`;
  const selecting =
    view.pending?.player === view.viewer && (view.pending.kind === "discard" || view.pending.kind === "bottomCards");
  const liftedId = lifted && cards.some((c) => c.id === lifted) ? lifted : null;
  // Touching outside the hand puts the lifted card back down.
  useEffect(() => {
    if (!liftedId) return;
    const drop = (e: globalThis.PointerEvent) => {
      if (!handRef.current?.contains(e.target as Node)) setLifted(null);
    };
    document.addEventListener("pointerdown", drop);
    return () => document.removeEventListener("pointerdown", drop);
  }, [liftedId]);

  return (
    <div className="hand" data-tuto="hand" ref={handRef}>
      {cards.map((c, i) => {
        const { angle, lift } = handFan(i, n, spread);
        const up = liftedId === c.id;
        return (
          <motion.div
            key={c.uid}
            className={`hand-card ${elsewhere.has(c.id) ? `from-elsewhere from-${elsewhere.get(c.id)}` : ""} ${up ? "lifted" : ""}`}
            style={{ zIndex: up ? 40 : i, margin }}
            animate={up ? { rotate: 0, y: -box.rise, scale: 1.12 } : { rotate: angle, y: lift, scale: 1 }}
            drag
            dragSnapToOrigin
            dragMomentum={false}
            whileHover={{ y: -box.rise, scale: 1.08, zIndex: 40, rotate: 0 }}
            whileDrag={{ scale: 1.05, zIndex: 60, rotate: 0 }}
            onPointerDown={() => {
              dragged.current = false;
            }}
            onDragStart={() => {
              dragged.current = true;
              setLifted(null);
            }}
            onTap={(e) => {
              if (dragged.current || justLongPressed()) return;
              const mouse = (e as PointerEvent).pointerType === "mouse";
              if (handTap({ mouse, touch: isTouch(), selecting, lifted: up }) === "lift") {
                setLifted(c.id);
                setHover({ face: c, obj: c });
                return;
              }
              setLifted(null);
              clickHandCard(c.id);
            }}
            onDragEnd={(_, info) => {
              const handTop = handRef.current?.getBoundingClientRect().top ?? window.innerHeight;
              if (dropPlays(info.point.y - window.scrollY, handTop)) clickHandCard(c.id);
            }}
          >
            <Card
              face={c}
              obj={c}
              width="var(--hand-w)"
              layoutId={c.uid}
              ghost={ghost}
              glow={handGlow(c.id, selection, casting, playable)}
              oid={c.id}
            />
            {elsewhere.has(c.id) && <span className="zone-tag">{loc(ZONE_TAG[elsewhere.get(c.id) ?? ""] ?? "")}</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

/** An opponent's hand: card backs fanned at the top edge of the screen, as on MTGA. */
export function OpponentHand({ count, custom }: { count: number; custom?: boolean | string }) {
  return (
    <div className="opp-hand" style={{ "--n": count } as CSSProperties}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="opp-back" style={{ "--i": i } as CSSProperties}>
          <CardBack width="var(--back-w)" custom={custom} />
        </span>
      ))}
    </div>
  );
}

/**
 * The main button: its label, its action; `hot` (amber, as on MTGA) when it moves the game forward, `respond` (blue)
 * when it lets the stack resolve.
 */
export function useMainAction(): { label: string; run?: () => void; disabled?: boolean; hot?: boolean; respond?: boolean } {
  // Only these data matter: no redraw on each card hover (the whole store would change).
  const s = useGame(
    useShallow((g) => ({
      view: g.view,
      casting: g.casting,
      attackers: g.attackers,
      attackTargets: g.attackTargets,
      blocks: g.blocks,
      selection: g.selection,
      decide: g.decide,
      cancel: g.cancel,
      endTurn: g.endTurn,
      allAttack: g.allAttack,
      passPriority: g.passPriority,
    })),
  );
  const t = useT();
  const v = s.view;
  if (!v) return { label: "…", disabled: true };
  const p = v.pending;
  if (!p) return { label: v.over ? t("Game over") : "…", disabled: true };
  if (p.player !== v.viewer) return { label: t("Opponent…"), disabled: true };
  const pass = () => s.passPriority();
  switch (p.kind) {
    case "priority":
      if (s.casting) return { label: t("Cancel"), run: s.cancel };
      if (p.castNow) return { label: t("Don't cast"), run: pass };
      if (v.stack.length > 0) return { label: t("Resolve"), run: pass, hot: true, respond: true };
      if (v.turn.active === v.viewer) {
        if (v.turn.step === "main1" && v.potentialAttackers > 0) return { label: t("Combat"), run: pass, hot: true };
        if (v.turn.step === "main1" || v.turn.step === "main2")
          return { label: t("End turn"), run: () => s.endTurn(), hot: true };
      }
      return { label: t("Pass"), run: pass, hot: true };
    case "declareAttackers": {
      const n = s.attackers.length;
      // MTGA style: with no selection, the button selects all the creatures; a second press confirms.
      if (!n && (p.candidates?.length ?? 0) > 0) return { label: t("Attack with all"), hot: true, run: s.allAttack };
      return {
        label: n ? t("Attack ({n})", { n }) : t("No attack"),
        hot: true,
        run: () =>
          s.decide({
            type: "declareAttackers",
            attackers: s.attackers.map((id) => ({
              id,
              defender: s.attackTargets[id] ?? p.allowed?.[id]?.[0] ?? p.defenders?.[0] ?? (v.opponents[0] as string),
            })),
          }),
      };
    }
    case "declareBlockers": {
      const entries = Object.entries(s.blocks);
      // Menace (702.110) flagged during the declaration: a single blocker on a creature with menace.
      const per = new Map<string, number>();
      for (const [, a] of entries) per.set(a, (per.get(a) ?? 0) + 1);
      const menace = [...per].find(([a, n]) => n === 1 && v.battlefield.find((o) => o.id === a)?.keywords.includes("menace"));
      if (menace) return { label: t("Menace: two or more blockers"), disabled: true };
      return {
        label: entries.length ? t("Block ({n})", { n: entries.length }) : t("No block"),
        hot: true,
        run: () => s.decide({ type: "declareBlockers", blocks: entries.map(([blocker, attacker]) => ({ blocker, attacker })) }),
      };
    }
    case "choice": {
      const pick = boardPick(v);
      if (!pick) return { label: t("Choose…"), disabled: true };
      const n = s.selection.length;
      return {
        label: n === 0 && pick.min === 0 ? t("ctx:choice|None") : t("Confirm ({n})", { n }),
        hot: true,
        disabled: !pickValid(pick, s.selection),
        run: () => s.decide({ type: "choose", values: s.selection }),
      };
    }
    default:
      return { label: t("Choose…"), disabled: true };
  }
}

/** Damage preview of the combat being prepared (chosen attackers, blocks being chosen or declared). */
function CombatPreviewLine() {
  const view = useGame((s) => s.view) as GameView;
  const attackers = useGame((s) => s.attackers);
  const attackTargets = useGame((s) => s.attackTargets);
  const blocks = useGame((s) => s.blocks);
  const t = useT();
  const p = view.pending;
  const choosingAttack = p?.kind === "declareAttackers" && p.player === view.viewer;
  const atk = choosingAttack
    ? attackers.map((id) => ({
        id,
        defender: attackTargets[id] ?? p.allowed?.[id]?.[0] ?? p.defenders?.[0] ?? (view.opponents[0] as string),
      }))
    : (view.combat?.attackers ?? []);
  const declared = Object.fromEntries((view.combat?.attackers ?? []).flatMap((a) => a.blockers.map((b) => [b, a.id])));
  const choosingBlocks = p?.kind === "declareBlockers" && p.player === view.viewer;
  const preview = combatPreview(view, atk, choosingBlocks ? { ...declared, ...blocks } : declared);
  if (!preview || view.over) return null;
  const name = (id: string) => view.battlefield.find((o) => o.id === id)?.name ?? "";
  const parts = Object.entries(preview.lifeLoss)
    .filter(([, n]) => n !== 0)
    .map(([pl, n]) => {
      const player = pl === view.viewer ? t("you") : (view.players[pl]?.name ?? pl);
      const lethal = n > 0 && (view.players[pl]?.life ?? 0) - n <= 0;
      if (n < 0) return t("{player} +{n} life", { player, n: -n });
      return lethal ? t("{player} −{n} life (lethal)", { player, n }) : t("{player} −{n} life", { player, n });
    });
  if (preview.dies.length) parts.push(t("dying: {list}", { list: preview.dies.map(name).join(", ") }));
  if (parts.length === 0) return null;
  return (
    <div className="combat-preview" role="status">
      {t("Preview: {list}", { list: parts.join(" · ") })}
    </div>
  );
}

export function ActionPanel() {
  const view = useGame((s) => s.view) as GameView;
  const endTurn = useGame((s) => s.endTurn);
  const decide = useGame((s) => s.decide);
  const resolveAll = useGame((s) => s.resolveAll);
  const attackers = useGame((s) => s.attackers);
  const action = useMainAction();
  const t = useT();
  const myTurn = view.turn.active === view.viewer;
  const p = view.pending;
  const mine = p?.player === view.viewer && (p?.kind === "priority" || p?.kind === "declareAttackers");
  return (
    <div className="action-panel">
      <CombatPreviewLine />
      {view.controlling && (
        <div className="control-banner">
          {t("You control {player}", { player: view.players[view.controlling]?.name ?? t("the opponent") })}
        </div>
      )}
      <button
        type="button"
        className={`main-button ${action.hot ? "hot" : ""} ${action.respond ? "respond" : ""}`}
        data-tuto="main-button"
        disabled={action.disabled}
        onClick={action.run}
        title={t("Space")}
      >
        {action.label}
      </button>
      {/* The secondary actions on one line under the main button. */}
      <div className="action-row">
        {/* Three items or more on the stack (as on MTGA): resolve them all, unless an opponent responds. */}
        {action.respond && !action.disabled && view.stack.length > 2 && (
          <button
            type="button"
            className="btn small resolve-all"
            onClick={resolveAll}
            title={t("Pass until the stack is empty (stops if an opponent responds)")}
          >
            {t("Resolve all ({n})", { n: view.stack.length })}
          </button>
        )}
        {p?.kind === "declareAttackers" &&
          p.player === view.viewer &&
          (attackers.length > 0 || (p.candidates?.length ?? 0) > 0) && (
            <button
              type="button"
              className="btn small no-attack"
              onClick={() => decide({ type: "declareAttackers", attackers: [] })}
              title={t("Don't attack this turn")}
            >
              {t("No attack")}
            </button>
          )}
        {mine && !view.over && (
          <button
            type="button"
            className="btn small ghost"
            data-tuto="end-turn"
            onClick={(e) => endTurn(e.shiftKey)}
            title={
              myTurn
                ? t(
                    "Enter: pass until the end of the turn (stops if an opponent acts); Shift+Enter or Shift+click: let everything pass",
                  )
                : t(
                    "Enter: pass until your turn (stops if the opponent casts a spell, and for your blocks); Shift+Enter or Shift+click: let everything pass",
                  )
            }
          >
            {myTurn ? t("Pass the turn ⏎") : t("Until my turn ⏎")}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full board
// ---------------------------------------------------------------------------

/** The table texture of this game: the chosen one, or for "random" one drawn for each game (new session), then kept. */
export function useBoardTheme(): string {
  const choice = useGame((s) => s.boardTheme);
  const session = useGame((s) => s.session);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new draw on each new session.
  const roll = useMemo(() => Math.random(), [session]);
  return resolveBoardTheme(choice, roll);
}

export function Board() {
  const view = useGame((s) => s.view);
  const resuming = useGame((s) => s.resuming);
  const t = useT();
  const theme = useBoardTheme();
  if (!view)
    return (
      <div className="board loading" data-board={theme}>
        {resuming ? t("Resuming the game…") : t("Shuffling the libraries…")}
      </div>
    );
  const me = view.players[view.viewer] as PlayerView;
  const opponents = view.opponents.map((id) => view.players[id]).filter((p): p is PlayerView => !!p);
  return (
    <div className="board" id="board" data-board={theme}>
      <Backdrop theme={theme} />
      <div className={`opp-bars n${opponents.length}`}>
        {opponents.map((opp) => (
          <div key={opp.id} className={`top-row ${opp.lost ? "eliminated" : ""}`}>
            <PlayerBar player={opp} isMe={false} />
            <OpponentHand count={opp.handCount} custom={opp.customArt} />
          </div>
        ))}
      </div>
      <div className={`opponents n${opponents.length}`}>
        {opponents.map((opp) => (
          <div key={opp.id} className={`opp-zone ${opp.lost ? "eliminated" : ""}`}>
            <Battlefield player={opp.id} isMe={false} />
          </div>
        ))}
      </div>
      <CenterStrip />
      <Battlefield player={me.id} isMe={true} />
      <div className="bottom-row">
        <PlayerBar player={me} isMe={true} />
        <Hand />
        <ActionPanel />
      </div>
      <Arrows />
      <Effects />
      <StackReveal />
    </div>
  );
}
