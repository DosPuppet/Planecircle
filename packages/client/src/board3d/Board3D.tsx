/**
 * The 3D board (PLAN-W): the battlefields drawn by three.js on a table seen at an angle, as on MTG Arena, under the
 * same DOM HUD as the DOM board (bars, center strip, hand, main button). Each card has a DOM proxy laid exactly over its
 * mesh (`project.ts`): clicks, hover, preview, keyboard, glows, badges, arrows, the tutorial and the tests go through it,
 * with the DOM board's own code. Loaded on demand (chunks `board3d` and `three`).
 */
import "./board3d.css";
import type { ObjectView, PlayerView } from "@mtgx/engine";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arrows } from "../board/Arrows";
import { ActionPanel, CenterStrip, Hand, OpponentHand, PlayerBar, useBoardTheme, usePermanentGlow } from "../board/Board";
import { Card } from "../board/Card";
import { Effects } from "../board/Effects";
import { StackReveal } from "../board/StackReveal";
import { fastMode } from "../fast";
import { useT } from "../localize";
import { useGame } from "../store";
import { type Arena, loadArena } from "./assets";
import { frameSeats, viewProjection } from "./camera";
import { type CardNode, pileNodes, tableNodes } from "./model";
import {
  type CardPose,
  cardMatrix3d,
  cssMatrix,
  invert,
  type Mat4,
  multiply,
  pointerToTable,
  screenRect,
  toScreen,
  type Vec3,
} from "./project";
import type { Quality } from "./quality";
import { type HandPose, TableScene } from "./scene";
import { type Rect, type Table, toWorld } from "./seats";

interface Measures {
  w: number;
  h: number;
  /** Heights of the HUD: opponents' bars, center strip, your bar and hand. */
  top: number;
  center: number;
  bottom: number;
}

const translate = (x: number, y: number): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1];

/** Screen rectangle (board px) of a table rectangle. */
function projectRect(vp: Mat4, size: { w: number; h: number }, table: Table, r: Rect) {
  const pts = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ].map(([x, y]) => {
    const p = toWorld(table, x as number, y as number);
    return toScreen(vp, size, [p.x, 0, p.z]);
  });
  const left = Math.min(...pts.map((p) => p.x));
  const top = Math.min(...pts.map((p) => p.y));
  return { left, top, width: Math.max(...pts.map((p) => p.x)) - left, height: Math.max(...pts.map((p) => p.y)) - top };
}

export default function Board3D({ onFail }: { onFail: () => void }) {
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  const attackers = useGame((s) => s.attackers);
  const blocks = useGame((s) => s.blocks);
  const attackTargets = useGame((s) => s.attackTargets);
  const clickPermanent = useGame((s) => s.clickPermanent);
  const openGraveyard = useGame((s) => s.openGraveyard);
  const openExile = useGame((s) => s.openExile);
  const t = useT();
  const theme = useBoardTheme();
  const glow = usePermanentGlow();
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TableScene | null>(null);
  const [m, setMeasures] = useState<Measures>({ w: 0, h: 0, top: 0, center: 0, bottom: 0 });

  // The board and its HUD measured: the table takes what the HUD leaves.
  useLayoutEffect(() => {
    const measure = () => {
      const board = boardRef.current;
      if (!board) return;
      const next = {
        w: board.clientWidth,
        h: board.clientHeight,
        top: topRef.current?.offsetHeight ?? 0,
        center: centerRef.current?.offsetHeight ?? 0,
        bottom: bottomRef.current?.offsetHeight ?? 0,
      };
      setMeasures((cur) => (Object.entries(next).every(([k, v]) => cur[k as keyof Measures] === v) ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [boardRef.current, topRef.current, centerRef.current, bottomRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The scene lives as long as the board; a WebGL failure brings back the DOM board.
  // biome-ignore lint/correctness/useExhaustiveDependencies: created once; onFail only switches boards
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Cards fly faster in the fast test mode, and jump with reduced motion.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const speed = reduced ? Number.POSITIVE_INFINITY : fastMode() ? 5 : 1;
    // Dev mode: `&quality=low|medium|high` starts at that quality (the interface tests draw in software).
    const asked = import.meta.env.DEV ? new URLSearchParams(location.search).get("quality") : null;
    const quality: Quality = asked === "low" || asked === "medium" ? asked : "high";
    let scene: TableScene;
    try {
      scene = new TableScene(canvas, onFail, speed, quality);
      sceneRef.current = scene;
    } catch {
      onFail();
      return;
    }
    // The arena (W5), when it was built: the board plays on the plain table until it has loaded.
    let alive = true;
    let arena: Arena | null = null;
    void loadArena(scene.webgl).then((a) => {
      if (!alive) return a?.dispose();
      arena = a;
      scene.setArena(a);
    });
    return () => {
      alive = false;
      scene.dispose();
      arena?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const players = view ? [view.viewer, ...view.opponents] : [];
  const playersKey = players.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the players are keyed by playersKey
  const { table, framing } = useMemo(
    () => frameSeats({ w: m.w, h: m.h }, players, { top: m.top, center: m.center, bottom: m.bottom }),
    [m, playersKey],
  );
  const aspect = m.w / Math.max(1, m.h);
  const vp = useMemo(() => viewProjection(framing, aspect), [framing, aspect]);
  const size = { w: m.w, h: m.h };

  const blocked = new Set(Object.values(blocks));
  const uiKey = (o: ObjectView) => `${glow(o) ?? ""}|${blocked.has(o.id) ? "b" : ""}|${attackTargets[o.id] ?? ""}`;
  const attacking = (o: ObjectView) => o.attacking || attackers.includes(o.id);
  // Each card with its glow: the proxy's CSS ring and the mesh's rim (W6) show the same state.
  const nodes = (view && m.w ? tableNodes(view, table, uiKey, attacking).nodes : []).map((n) => ({
    ...n,
    glow: n.kind === "permanent" || n.kind === "attachment" ? glow(n.obj) : null,
  }));
  const piles = view && m.w ? pileNodes(view, table) : [];
  const signature = [...nodes, ...piles]
    .map(
      (n) =>
        `${n.uid}:${n.obj.defId}:${n.kind}:${n.count ?? ""}:${n.glow ?? ""}:${n.pose.x.toFixed(4)},${n.pose.z.toFixed(4)},${n.pose.w.toFixed(4)},${n.pose.rot}`,
    )
    .join("|");
  const hand = view ? [...view.hand, ...view.playableElsewhere] : [];
  const handKey = hand.map((c) => `${c.uid}:${c.defId}`).join(" ");

  // Where the stack's cards lie over the table: a spell resolving flies from there to its place.
  const stackSeen = useRef(new Map<string, { x: number; z: number }>());
  useLayoutEffect(() => {
    const board = boardRef.current;
    const inv = invert(vp);
    if (!board || !view || !inv || !m.w) return;
    const box = board.getBoundingClientRect();
    for (const item of view.stack) {
      const el = board.querySelector(`.stack [data-oid="${CSS.escape(item.id)}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const p = pointerToTable(inv, { w: m.w, h: m.h }, (r.left + r.right) / 2 - box.left, (r.top + r.bottom) / 2 - box.top);
      if (p) stackSeen.current.set(item.uid, p);
    }
  });
  // A card seen nowhere before: from the stack, a token from above, any other card dropping onto the table; none at the
  // first drawing (the board appears as it is).
  const drawn = useRef(false);
  const tokens = new Set(nodes.filter((n) => n.obj.isToken).map((n) => n.uid));
  const start = (uid: string, target: CardPose): CardPose | undefined => {
    if (!drawn.current) return undefined;
    const s = stackSeen.current.get(uid);
    if (s) return { ...target, x: s.x, z: s.z, y: target.y + 0.8 };
    return { ...target, y: target.y + (tokens.has(uid) ? 1.6 : 0.5) };
  };

  // The hand: where the DOM lays each card (read each frame while it moves), for the meshes to follow.
  const viewRef = useRef(view);
  viewRef.current = view;
  const handSource = useCallback((): HandPose[] => {
    const board = boardRef.current;
    const v = viewRef.current;
    if (!board || !v) return [];
    const box = board.getBoundingClientRect();
    const uidOf = new Map([...v.hand, ...v.playableElsewhere].map((c) => [c.id, c.uid]));
    const out: HandPose[] = [];
    let index = 0;
    for (const el of board.querySelectorAll<HTMLElement>(".hand .hand-card")) {
      index++;
      const slot = el.querySelector<HTMLElement>(".card-slot[data-oid]");
      const uid = slot && uidOf.get(slot.dataset.oid as string);
      if (!slot || !uid) continue;
      const style = getComputedStyle(el);
      const tm = new DOMMatrix(style.transform);
      const scale = Math.hypot(tm.a, tm.b) || 1;
      const r = slot.getBoundingClientRect();
      out.push({
        uid,
        cx: (r.left + r.right) / 2 - box.left,
        cy: (r.top + r.bottom) / 2 - box.top,
        w: slot.offsetWidth * scale,
        h: slot.offsetHeight * scale,
        angle: Math.atan2(tm.b, tm.a),
        // As the DOM paints them: by z-index (the hovered or dragged card on top), then in the order of the hand.
        order: (Number.parseInt(style.zIndex, 10) || 0) * 1000 + index,
      });
    }
    return out;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the palette is read from the texture's CSS variables
  useEffect(() => {
    const scene = sceneRef.current;
    const board = boardRef.current;
    if (!scene || !board) return;
    const css = getComputedStyle(board);
    scene.setPalette({
      deep: css.getPropertyValue("--bd-0").trim() || "#06080c",
      mid: css.getPropertyValue("--bd-1").trim() || "#1b2433",
      pool: css.getPropertyValue("--bd-pool").trim() || "#6f8fb8",
    });
    // The glows' colors (styles.css): the rims of the meshes take the colors of the proxies' rings.
    const color = (v: string) => css.getPropertyValue(v).trim() || "#ffffff";
    scene.setGlowColors({
      playable: color("--playable"),
      target: color("--target"),
      selectable: "#ffffff",
      selected: color("--gold"),
      picked: color("--picked"),
      attacking: color("--attack"),
      blocking: color("--block"),
      activatable: color("--activatable"),
    });
  }, [theme]);
  useEffect(() => {
    if (!m.w || !m.h) return;
    sceneRef.current?.setView(m.w, m.h, framing);
    sceneRef.current?.setTable(table);
  }, [m, framing, table]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: redrawn when the cards or their places change (signature)
  useEffect(() => {
    sceneRef.current?.setCards([...nodes, ...piles], lang, start);
    drawn.current = true;
  }, [signature, lang]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the hand's cards are keyed by handKey
  useEffect(() => {
    sceneRef.current?.setHand(
      hand.map((c) => ({ uid: c.uid, face: c, obj: c })),
      lang,
      handSource,
    );
  }, [handKey, lang, handSource]);
  // The DOM hand moves by its own springs (hover, drag, a card coming in): the meshes follow while it does.
  useEffect(() => {
    const row = bottomRef.current;
    if (!row) return;
    const follow = () => sceneRef.current?.live(600);
    const kinds = ["pointerover", "pointermove", "pointerdown", "pointerup", "pointerout"] as const;
    for (const k of kinds) row.addEventListener(k, follow);
    return () => {
      for (const k of kinds) row.removeEventListener(k, follow);
    };
  }, []);
  // Any other change (a glow, a choice): the hand may move too.
  useEffect(() => {
    sceneRef.current?.live(450);
  });

  // Dev mode: where a card lies on the screen (board3d-smoke compares it with its proxy).
  const latest = useRef({ nodes, vp, size });
  latest.current = { nodes, vp, size };
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __board3d?: unknown };
    w.__board3d = {
      drawing: () => sceneRef.current?.drawing ?? false,
      handShown: () => sceneRef.current?.handShown ?? 0,
      arenaShown: () => sceneRef.current?.arenaShown ?? false,
      quality: () => sceneRef.current?.quality,
      projectedRect(id: string) {
        const { nodes: ns, vp: m4, size: sz } = latest.current;
        const n = ns.find((x) => x.id === id && x.kind !== "shadow");
        const box = boardRef.current?.getBoundingClientRect();
        if (!n || !box) return null;
        const r = screenRect(m4, sz, n.pose);
        return { left: r.left + box.left, top: r.top + box.top, right: r.right + box.left, bottom: r.bottom + box.top };
      },
    };
    return () => {
      w.__board3d = undefined;
    };
  }, []);

  if (!view) return null;
  const me = view.players[view.viewer] as PlayerView;
  const opponents = view.opponents.map((id) => view.players[id]).filter((p): p is PlayerView => !!p);
  const center = m.w ? toScreen(vp, size, [0, 0, 0] as Vec3).y : m.h / 2;

  const proxy = (n: CardNode, zone: { left: number; top: number }) => {
    const matrix = multiply(translate(-zone.left, -zone.top), cardMatrix3d(vp, size, n.pose, n.px));
    const clickable = n.kind === "permanent" || n.kind === "attachment";
    return (
      <div
        key={n.uid}
        className={`p3 ${n.kind}`}
        style={{ transform: cssMatrix(matrix), zIndex: n.layer + 1 }}
        data-oids={n.pile?.join(" ")}
      >
        <Card
          ghost
          art
          face={n.obj}
          obj={n.obj}
          width={`${n.px.w}px`}
          glow={clickable ? glow(n.obj) : null}
          showStats={n.kind === "permanent" && (n.obj.types.includes("Creature") || !n.obj.types.includes("Land"))}
          onClick={clickable ? () => clickPermanent(n.id) : undefined}
          oid={clickable ? n.id : undefined}
        />
        {n.pile && <span className="token-count">×{n.pile.length}</span>}
      </div>
    );
  };

  /** A pile's proxy: the graveyard and the exile open their list, as the bar's buttons do; the library shows its count. */
  const pileProxy = (n: CardNode, zone: { left: number; top: number }) => {
    const matrix = multiply(translate(-zone.left, -zone.top), cardMatrix3d(vp, size, n.pose, n.px));
    const style: CSSProperties = { transform: cssMatrix(matrix), width: n.px.w, height: n.px.h };
    const count = n.count ?? 0;
    if (n.kind === "library")
      return (
        <div key={n.uid} className="pile3d library" style={style} title={t("Library: {n} cards", { n: count })}>
          <span className="pile3d-count">{count}</span>
        </div>
      );
    const open = n.kind === "graveyard" ? () => openGraveyard(n.player) : () => openExile(n.player);
    const label =
      n.kind === "graveyard"
        ? t("Graveyard: {n} cards (click to view)", { n: count })
        : t("Exile: {n} cards (click to view)", { n: count });
    return (
      <button
        key={n.uid}
        type="button"
        className={`pile3d ${n.kind}`}
        style={style}
        title={label}
        aria-label={label}
        onClick={open}
      >
        <span className="pile3d-count">{count}</span>
      </button>
    );
  };

  return (
    <div className="board board3d" id="board" data-board={theme} ref={boardRef}>
      <canvas className="board3d-canvas" ref={canvasRef} />
      {m.w > 0 &&
        table.seats.map((seat) => {
          const r = projectRect(vp, size, table, seat.zone);
          const style: CSSProperties = { left: r.left, top: r.top, width: r.width, height: r.height };
          return (
            <div
              key={seat.player}
              className={`battlefield bf3d ${seat.mine ? "me" : "opp"}`}
              data-tuto={seat.mine ? "field-me" : "field-opp"}
              style={style}
            >
              {nodes.filter((n) => n.player === seat.player && n.kind !== "shadow").map((n) => proxy(n, r))}
            </div>
          );
        })}
      {m.w > 0 &&
        table.seats.map((seat) => {
          const r = projectRect(vp, size, table, seat.piles);
          return (
            <div
              key={seat.player}
              className={`piles3d ${seat.mine ? "me" : "opp"}`}
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            >
              {piles.filter((n) => n.player === seat.player).map((n) => pileProxy(n, r))}
            </div>
          );
        })}
      <div className={`opp-bars n${opponents.length}`} ref={topRef}>
        {opponents.map((opp) => (
          <div key={opp.id} className={`top-row ${opp.lost ? "eliminated" : ""}`}>
            <PlayerBar player={opp} isMe={false} />
            <OpponentHand count={opp.handCount} custom={opp.customArt} />
          </div>
        ))}
      </div>
      <div className="center3d" ref={centerRef} style={{ top: center - m.center / 2 }}>
        <CenterStrip />
      </div>
      <div className="bottom-row" ref={bottomRef}>
        <PlayerBar player={me} isMe={true} />
        <Hand ghost />
        <ActionPanel />
      </div>
      <Arrows />
      <Effects />
      <StackReveal />
    </div>
  );
}
