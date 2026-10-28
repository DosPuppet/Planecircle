/** Choice windows: kept for real decisions (mulligan, modes, X, kicker, discard…). */

import {
  type ChoiceRequest,
  type CostPick,
  costToText,
  type GameView,
  type ManaType,
  msg,
  type ObjectView,
  plainText,
} from "@mtgx/engine";
import { useEffect, useState } from "react";
import { Card, CardBack, ManaCost, RulesText } from "../board/Card";
import { Dialog } from "../Dialog";
import { faceName, type Lang } from "../i18n";
import { useLocalize, useT } from "../localize";
import { myActions, type PlayableOption, useGame } from "../store";
import { textIn } from "../translate";
import { useTutorial } from "../tutorial/store";
import { ChoicePrompt } from "./ChoicePrompt";
import { NameSearch } from "./NameSearch";
import { SideboardEditor } from "./SideboardEditor";
import { ZoneTabbed } from "./ZoneTabs";

function Modal({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog title={title} className={wide ? "wide" : undefined}>
      {children}
    </Dialog>
  );
}

function HandPicker({ view, selectable }: { view: GameView; selectable: boolean }) {
  const selection = useGame((s) => s.selection);
  const toggle = useGame((s) => s.toggleSelection);
  return (
    <div className="hand-picker">
      {view.hand.map((c) => (
        <Card
          key={c.uid}
          face={c}
          obj={c}
          width="var(--pick-w)"
          glow={selection.includes(c.id) ? "selected" : null}
          onClick={selectable ? () => toggle(c.id) : undefined}
        />
      ))}
    </div>
  );
}

function PendingPrompt({ view }: { view: GameView }) {
  const decide = useGame((s) => s.decide);
  const selection = useGame((s) => s.selection);
  const t = useT();
  const p = view.pending;
  if (!p || p.player !== view.viewer) return null;
  if (p.kind === "choice") return <ChoicePrompt view={view} />;
  switch (p.kind) {
    case "mulligan":
      return (
        <Modal title={p.mulligans === 0 ? t("Your opening hand") : t("Mulligan {n} — new hand", { n: p.mulligans })} wide>
          <HandPicker view={view} selectable={false} />
          <p className="hint">
            {p.mulligans > 0 &&
              `${
                p.bottom > 0
                  ? t("If you keep, you will put {n} card(s) on the bottom of your library.", { n: p.bottom })
                  : t("First mulligan free (multiplayer game): you keep the seven cards.")
              } `}
            {view.turn.active === view.viewer ? t("You start the game.") : t("You start second.")}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => decide({ type: "mulligan" })}>
              {t("Mulligan")}
            </button>
            <button type="button" className="btn primary" onClick={() => decide({ type: "keep" })}>
              {t("Keep")}
            </button>
          </div>
        </Modal>
      );
    case "bottomCards":
    case "discard": {
      const title =
        p.kind === "discard"
          ? t("Discard {n} card(s) (maximum hand size: 7)", { n: p.count })
          : t("Choose {n} card(s) to put on the bottom of your library", { n: p.count });
      return (
        <Modal title={title} wide>
          <HandPicker view={view} selectable />
          <div className="modal-actions">
            <button
              type="button"
              className="btn primary"
              disabled={selection.length !== p.count}
              onClick={() =>
                decide(p.kind === "discard" ? { type: "discard", cards: selection } : { type: "bottom", cards: selection })
              }
            >
              {t("Confirm ({n}/{count})", { n: selection.length, count: p.count })}
            </button>
          </div>
        </Modal>
      );
    }
    default:
      return null;
  }
}

function XPicker({ max, min = 0 }: { max: number; min?: number }) {
  const chooseX = useGame((s) => s.chooseX);
  const cancel = useGame((s) => s.cancel);
  const [x, setX] = useState(max);
  const t = useT();
  return (
    <Modal title={t("Choose the value of X")}>
      <div className="x-picker">
        <input type="range" min={min} max={max} value={x} onChange={(e) => setX(Number(e.target.value))} />
        <span className="x-value">X = {x}</span>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn primary" onClick={() => chooseX(x)}>
          {t("Confirm")}
        </button>
      </div>
    </Modal>
  );
}

function AdditionalCostPicker({
  kind,
  count,
  options,
  orPay,
  orSacrifice,
  minPower,
  powers,
  suggested,
  min,
  title,
}: {
  kind: "discard" | "sacrifice" | "tap" | "materials" | "bounce";
  count: number;
  options: string[];
  /** Crew, saddle: as many creatures as wanted, with total power at least `minPower`. */
  minPower?: number;
  powers?: Record<string, number>;
  suggested?: string[];
  /** "… or pay {3}{B}" (or "3 life"): this may be paid instead. */
  orPay?: string;
  /** "Discard a card or sacrifice a permanent": the options include permanents. */
  orSacrifice?: boolean;
  /** Craft "one or more": at least `min`, at most `count`. */
  min?: number;
  /** Title of the window, instead of the title derived from `kind`. */
  title?: string;
}) {
  const view = useGame((s) => s.view);
  const choose = useGame((s) => s.chooseAdditional);
  const cancel = useGame((s) => s.cancel);
  const [picked, setPicked] = useState<string[]>([]);
  const t = useT();
  if (!view) return null;
  const all = [...view.hand, ...view.battlefield, ...(view.players[view.viewer]?.graveyard ?? [])];
  const byPower = minPower !== undefined;
  const power = picked.reduce((n, id) => n + (powers?.[id] ?? 0), 0);
  const ready = byPower ? power >= minPower : picked.length >= (min ?? count) && picked.length <= count;
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : byPower || cur.length < count ? [...cur, id] : cur));
  return (
    <Modal
      title={
        title ??
        (kind === "discard" && orSacrifice
          ? t("Additional cost: discard a card or sacrifice a permanent")
          : kind === "discard"
            ? t("Additional cost: discard {n} card(s)", { n: count })
            : kind === "materials"
              ? min !== undefined && min !== count
                ? t("Craft: exile from {min} to {max} material(s)", { min, max: count })
                : t("Craft: exile {n} material(s)", { n: count })
              : kind === "tap" && byPower
                ? t("Tap creatures with total power {n} or more", { n: minPower })
                : kind === "tap"
                  ? t("Cost: tap {n} creature(s)", { n: count })
                  : t("Additional cost: sacrifice {n} permanent(s)", { n: count }))
      }
      wide
    >
      <div className="hand-picker">
        {options.map((id) => {
          const o = all.find((x) => x.id === id);
          return o ? (
            <Card
              key={id}
              face={o}
              obj={o}
              width="var(--pick-w)"
              glow={picked.includes(id) ? "selected" : null}
              onClick={() => toggle(id)}
            />
          ) : null;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
        {orPay && (
          <button type="button" className="btn" onClick={() => choose(kind, [])}>
            {t("Pay {cost} instead", { cost: orPay })}
          </button>
        )}
        {suggested && (
          <button type="button" className="btn" onClick={() => setPicked(suggested)}>
            {t("Suggestion")}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!ready} onClick={() => choose(kind, picked)}>
          {byPower
            ? t("Confirm (power {n}/{min})", { n: power, min: minPower })
            : t("Confirm ({n}/{count})", { n: picked.length, count })}
        </button>
      </div>
    </Modal>
  );
}

/** Casting: the cost slot of the "pick" stage. */
function CastingPick({ pick }: { pick: CostPick }) {
  const choose = useGame((s) => s.choosePick);
  const cancel = useGame((s) => s.cancel);
  return <CostPickPicker pick={pick} onChoose={(ids) => choose(pick.slot, ids)} onCancel={cancel} />;
}

/** Full control: the other permanent tapped for a mana ability's cost (Gene Pollinator, PLAN-M M6). */
function ManaPick() {
  const manaPick = useGame((s) => s.manaPick);
  const choose = useGame((s) => s.chooseManaPick);
  if (!manaPick) return null;
  return (
    <CostPickPicker
      key={`${manaPick.decision.source}-${manaPick.decision.ability}`}
      pick={manaPick.pick}
      onChoose={(ids) => choose(ids ?? manaPick.pick.suggested)}
      onCancel={() => choose(undefined)}
    />
  );
}

/** A chosen counter (`id:kind`) or object: the object it is taken from. */
const objectOf = (option: string) => option.split(":")[0] as string;

/**
 * Objects paid as a cost (`CostPick`): blight, remove counters, exile cards from the graveyard, collect evidence,
 * sacrifice X permanents… The suggestion is the engine's choice; an object can come back for counters (`repeat`), with
 * a chosen kind (`id:kind`, a label citing the card); forage takes one of its groups (`oneOf`).
 */
function CostPickPicker({
  pick,
  onChoose,
  onCancel,
}: {
  pick: CostPick;
  onChoose: (ids: string[] | undefined) => void;
  onCancel: () => void;
}) {
  const view = useGame((s) => s.view);
  const [picked, setPicked] = useState<string[]>([]);
  const t = useT();
  const loc = useLocalize();
  if (!view) return null;
  const all = [...view.hand, ...view.battlefield, ...Object.values(view.players).flatMap((p) => p.graveyard), ...view.exile];
  const total = pick.minTotal ? picked.reduce((n, id) => n + (pick.minTotal?.values[id] ?? 0), 0) : 0;
  const group = pick.oneOf?.find((g) => picked.length > 0 && picked.every((id) => g.options.includes(id)));
  // Counters: no more counters taken from an object (kinds included) than it carries.
  const fromObject = (id: string, list: string[]) => list.filter((x) => objectOf(x) === objectOf(id)).length;
  const ready =
    pick.atMost || (pick.optional && picked.length === 0)
      ? true
      : pick.oneOf
        ? !!group && picked.length === group.count
        : pick.minTotal
          ? total >= pick.minTotal.n
          : picked.length === pick.count;
  const times = (id: string) => picked.filter((x) => x === id).length;
  const toggle = (id: string) =>
    setPicked((cur) => {
      // Forage: the objects of one group (three cards, or a Food); another group starts over.
      if (pick.oneOf) {
        if (cur.includes(id)) return cur.filter((x) => x !== id);
        const g = pick.oneOf.find((x) => x.options.includes(id));
        const same = cur.filter((x) => g?.options.includes(x));
        return g && same.length < g.count ? [...same, id] : same;
      }
      const max = pick.repeat?.[id] ?? 1;
      const room = !pick.repeat || fromObject(id, cur) < (pick.repeat[objectOf(id)] ?? max);
      // Counters: each click removes one more, until there are none left, then it starts over.
      if (pick.repeat && times(id) < max && cur.length < pick.count && room) return [...cur, id];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return pick.minTotal || cur.length < pick.count ? [...cur, id] : cur;
    });
  return (
    <Modal title={t("Cost: {label}", { label: loc(pick.label) })} wide>
      <div className="hand-picker">
        {pick.options.map((id) => {
          // Options that are not objects (kinds of counters, types, a way to pay): one button per option.
          const label = pick.labels?.[id];
          if (label)
            return (
              <div key={id} className="pick-slot">
                <button type="button" className={`btn choice${picked.includes(id) ? " primary" : ""}`} onClick={() => toggle(id)}>
                  {loc(label)}
                </button>
                {pick.repeat && times(id) > 0 && <span className="pick-count">×{times(id)}</span>}
              </div>
            );
          const o = all.find((x) => x.id === id);
          return o ? (
            <div key={id} className="pick-slot">
              <Card
                face={o}
                obj={o}
                width="var(--pick-w)"
                glow={picked.includes(id) ? "selected" : null}
                onClick={() => toggle(id)}
              />
              {pick.repeat && times(id) > 0 && <span className="pick-count">×{times(id)}</span>}
            </div>
          ) : null;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn" onClick={() => setPicked(pick.suggested)}>
          {t("Suggestion")}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          // No object chosen for convoke (and others): the automatic payment decides.
          onClick={() => (pick.atMost && picked.length === 0 ? onChoose(undefined) : onChoose(picked))}
        >
          {pick.atMost
            ? picked.length
              ? t("Confirm ({n})", { n: picked.length })
              : t("Automatic payment")
            : pick.minTotal
              ? t("Confirm (value {n}/{min})", { n: total, min: pick.minTotal.n })
              : pick.optional && picked.length === 0
                ? t("Choose nothing")
                : t("Confirm ({n}/{count})", { n: picked.length, count: group?.count ?? pick.count })}
        </button>
      </div>
    </Modal>
  );
}

/** Targets off the battlefield (cards in a graveyard or in exile): chosen in a window. */
function TargetCardPicker() {
  const view = useGame((s) => s.view);
  const casting = useGame((s) => s.casting);
  const pickTarget = useGame((s) => s.pickTarget);
  const confirmTargets = useGame((s) => s.confirmTargets);
  const chooseNoTarget = useGame((s) => s.chooseNoTarget);
  const cancel = useGame((s) => s.cancel);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  if (!view || !casting?.spec) return null;
  const spec = casting.spec;
  // Cards of a graveyard, or exiled (Blade of the Swarm: "card exiled with warp").
  // One tab per graveyard (and exile) when the possible targets are in several zones.
  const cards = [...Object.values(view.players).flatMap((p) => p.graveyard), ...view.exile];
  const options = cards.filter((o) => spec.legal.includes(o.id));
  const max = spec.count ?? 1;
  const picked = casting.picked ?? [];
  return (
    <Modal
      title={
        max > 1
          ? t("Choose up to {n} targets: {label}", { n: max, label: spec.label ? loc(spec.label) : t("card") })
          : t("Choose a target: {label}", { label: spec.label ? loc(spec.label) : t("card") })
      }
      wide
    >
      <ZoneTabbed view={view} objects={options} ids={options.map((o) => o.id)} selected={picked} lang={lang}>
        {(shown) => (
          <div className="hand-picker">
            {options
              .filter((o) => shown.includes(o.id))
              .map((o) => (
                <Card
                  key={o.id}
                  face={o}
                  obj={o}
                  width="var(--pick-w)"
                  glow={picked.includes(o.id) ? "selected" : "target"}
                  onClick={() => pickTarget(o.id)}
                />
              ))}
          </div>
        )}
      </ZoneTabbed>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
        {spec.optional && max === 1 && (
          <button type="button" className="btn" onClick={chooseNoTarget}>
            {t("No target")}
          </button>
        )}
        {max > 1 && (
          <button type="button" className="btn primary" disabled={picked.length === 0 && !spec.optional} onClick={confirmTargets}>
            {t("Confirm ({n}/{count})", { n: picked.length, count: max })}
          </button>
        )}
      </div>
    </Modal>
  );
}

function CastingPrompt() {
  const casting = useGame((s) => s.casting);
  const view = useGame((s) => s.view);
  const chooseMode = useGame((s) => s.chooseMode);
  const chooseKicker = useGame((s) => s.chooseKicker);
  const chooseHybrid = useGame((s) => s.chooseHybrid);
  const choosePhyrexian = useGame((s) => s.choosePhyrexian);
  const choosePayMode = useGame((s) => s.choosePayMode);
  const cancel = useGame((s) => s.cancel);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  if (!casting) return null;
  const opt = casting.option;
  if (casting.stage === "mode" && opt.type === "cast") {
    // The cast card, next to its modes (hoverable: full text in the preview).
    const card = view && [...view.hand, ...view.playableElsewhere, ...view.battlefield].find((o) => o.id === opt.card);
    return (
      <Modal title={t("Choose a mode")}>
        <div className="mode-pick">
          {card && <Card face={card} obj={card} width="var(--mode-card-w)" hoverable />}
          <div className="choice-list">
            {opt.modes.map((m) => (
              <button key={m.index} type="button" className="btn choice" onClick={() => chooseMode(m.index)}>
                {m.label ? loc(m.label) : t("Mode {n}", { n: m.index + 1 })}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "pick" && casting.pick) return <CastingPick key={casting.pick.slot} pick={casting.pick} />;
  if (casting.stage === "x" && opt.xMax !== null)
    return <XPicker max={opt.xMax} min={opt.type === "activate" ? (opt.xMin ?? 0) : 0} />;
  if (casting.stage === "target" && casting.spec && view) {
    const onBoard = new Set([...view.battlefield.map((o) => o.id), ...Object.keys(view.players), ...view.stack.map((x) => x.id)]);
    if (casting.spec.legal.some((id) => !onBoard.has(id))) return <TargetCardPicker />;
  }
  // Teamwork: creatures with enough total power.
  if (casting.stage === "tap" && opt.type === "cast" && casting.kicked && opt.kickerTap) {
    const spec = opt.kickerTap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        options={spec.options}
        minPower={spec.minPower}
        powers={spec.powers}
        suggested={spec.suggested}
        title={t("Teamwork: tap creatures with total power {n} or more", { n: spec.minPower })}
      />
    );
  }
  // Harmonize: an optional creature to tap, which reduces the cost by its power.
  if (casting.stage === "tap" && opt.type === "cast" && opt.additional?.tap) {
    const spec = opt.additional.tap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        min={0}
        options={spec.options}
        powers={spec.powers}
        suggested={spec.suggested}
        title={t("Harmonize: tap a creature to reduce the cost by its power (optional)")}
      />
    );
  }
  if (casting.stage === "tap" && opt.type === "activate" && opt.additional?.tap) {
    const spec = opt.additional.tap;
    return (
      <AdditionalCostPicker
        kind="tap"
        count={spec.count}
        options={spec.options}
        minPower={spec.minPower}
        powers={spec.powers}
        suggested={spec.suggested}
      />
    );
  }
  if (casting.stage === "materials" && opt.type === "activate" && opt.additional?.materials) {
    const spec = opt.additional.materials;
    return (
      <AdditionalCostPicker kind="materials" count={spec.max} min={spec.min} options={spec.options} suggested={spec.suggested} />
    );
  }
  if (casting.stage === "sacrifice" && opt.type === "activate" && opt.additional?.sacrifice) {
    const spec = opt.additional.sacrifice;
    return <AdditionalCostPicker kind="sacrifice" count={spec.count} options={spec.options} />;
  }
  // Web-slinging (a tapped creature) or sneak (an unblocked attacker): the creature to return to hand. Only these two
  // costs return a creature (`altBounce`): the one that is not web-slinging is sneak.
  if (casting.stage === "bounce" && opt.type === "cast" && opt.altBounce) {
    const sneak = !plainText(opt.altLabel ?? "").startsWith("Web-slinging");
    return (
      <AdditionalCostPicker
        kind="bounce"
        count={1}
        options={opt.altBounce}
        suggested={opt.altBounce.slice(0, 1)}
        title={
          sneak
            ? t("Sneak: choose the unblocked attacker to return to its owner's hand")
            : t("Web-slinging: choose the tapped creature to return to its owner's hand")
        }
      />
    );
  }
  // Bargain (kicker without mana): the permanent to sacrifice.
  if (casting.stage === "sacrifice" && opt.type === "cast" && !opt.additional?.sacrifice && opt.kickerPermanents) {
    return (
      <AdditionalCostPicker
        kind="sacrifice"
        count={1}
        options={opt.kickerPermanents}
        suggested={opt.kickerPermanents.slice(0, 1)}
        title={
          opt.kickerPrompt
            ? t("{with}: choose the permanent", { with: loc(opt.kickerPrompt.with) })
            : t("Kicker: choose the permanent")
        }
      />
    );
  }
  if ((casting.stage === "discard" || casting.stage === "sacrifice") && opt.type === "cast") {
    const spec = opt.additional?.[casting.stage];
    const sac = opt.additional?.sacrifice;
    const dis = opt.additional?.discard;
    const orPay =
      casting.stage === "sacrifice"
        ? sac?.orPayAffordable && sac.orPay
        : casting.stage === "discard" && dis?.orPayAffordable && dis.orPay;
    // Bitter Triumph: "discard a card or pay 3 life".
    const orLife = casting.stage === "discard" ? opt.additional?.discard?.orLife : undefined;
    if (spec) {
      return (
        <AdditionalCostPicker
          kind={casting.stage}
          count={spec.count}
          options={spec.options}
          orPay={orPay ? costToText(orPay) : orLife !== undefined ? t("{n} life", { n: orLife }) : undefined}
          orSacrifice={casting.stage === "discard" && !!opt.additional?.discard?.orSacrifice}
        />
      );
    }
  }
  if (casting.stage === "pay" && opt.type === "cast") {
    return (
      <Modal title={t("How do you pay for this spell?")}>
        <div className="choice-list">
          {opt.normalAvailable && (
            <button type="button" className="btn choice" onClick={() => choosePayMode("normal")}>
              {t("Pay its mana cost")}
            </button>
          )}
          {(opt.freeAvailable || opt.free) && (
            <button type="button" className="btn choice primary" onClick={() => choosePayMode("free")}>
              {t("Without paying its mana cost")}
              {opt.xMax !== null ? " (X = 0)" : ""}
            </button>
          )}
          {opt.altAvailable && (
            <button type="button" className="btn choice" onClick={() => choosePayMode("alt")}>
              {opt.altLabel ? loc(opt.altLabel) : t("Alternative cost")}
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "hybrid" && casting.option.type === "cast") {
    const names: Record<string, string> = {
      W: msg("All white"),
      U: msg("All blue"),
      B: msg("All black"),
      R: msg("All red"),
      G: msg("All green"),
    };
    return (
      <Modal title={t("Pay the hybrid mana with…")}>
        {casting.option.hybridMatters && <p className="hint">{t("The spell's outcome depends on the mana spent.")}</p>}
        <div className="choice-list">
          {(casting.option.hybridColors ?? []).map((c) => (
            <button key={c} type="button" className="btn choice" onClick={() => chooseHybrid(c)}>
              <ManaCost cost={`{${c}}`} /> {names[c] ? textIn(lang, names[c]) : c}
            </button>
          ))}
          <button type="button" className="btn choice ghost" onClick={() => chooseHybrid("auto")}>
            {t("Automatic")}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "phyrexian" && opt.phyrexianLife) {
    return (
      <Modal title={t("Pay the Phyrexian mana with…")}>
        <p className="hint">{t("Each Phyrexian symbol is paid with its mana or with 2 life.")}</p>
        <div className="choice-list">
          {opt.phyrexianLife.map((n) => (
            <button key={n} type="button" className="btn choice" onClick={() => choosePhyrexian(n)}>
              {n === 0
                ? t("Mana only")
                : n === 1
                  ? t("2 life for one symbol")
                  : t("{life} life for {n} symbols", { n, life: 2 * n })}
            </button>
          ))}
          <button type="button" className="btn choice ghost" onClick={() => choosePhyrexian("auto")}>
            {t("Automatic")}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      </Modal>
    );
  }
  if (casting.stage === "kicker") {
    // Offspring and Gift (Bloomburrow): same mechanism, other labels (from the engine).
    const prompt = casting.option.type === "cast" ? casting.option.kickerPrompt : undefined;
    const labels = prompt
      ? { title: loc(prompt.title), without: loc(prompt.without), with: loc(prompt.with) }
      : { title: t("Pay the kicker?"), without: t("Without kicker"), with: t("With kicker") };
    return (
      <Modal title={labels.title}>
        <div className="choice-list">
          <button type="button" className="btn choice" onClick={() => chooseKicker(false)}>
            {labels.without}
          </button>
          <button type="button" className="btn choice primary" onClick={() => chooseKicker(true)}>
            {labels.with}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={cancel}>
            {t("Cancel")}
          </button>
        </div>
      </Modal>
    );
  }
  return null;
}

/** Name of the cast face: the adventure (or other face), otherwise the front of the card ("A // B" → "A"). */
function faceLabel(source: ObjectView | undefined, face: string | undefined, lang: Lang): string {
  if (!source) return "";
  if (!face) return lang === "fr" && source.fr?.name ? source.fr.name : (source.name.split(" // ")[0] ?? source.name);
  // Fuse (702.102): both halves, under the full name of the card.
  if (face === source.name) return (lang === "fr" && source.fr?.name) || face;
  const f = source.otherFaces?.find((x) => x?.name === face);
  // Not a face of the card: a label from the engine (face down).
  return (lang === "fr" && f?.fr?.name) || (f ? face : textIn(lang, face));
}

/** Basic land types, for the choice of Multiversal Passage. */
const LAND_TYPES: Record<string, string> = {
  Plains: msg("ctx:landType|Plains"),
  Island: msg("ctx:landType|Island"),
  Swamp: msg("ctx:landType|Swamp"),
  Mountain: msg("ctx:landType|Mountain"),
  Forest: msg("ctx:landType|Forest"),
};

/**
 * Mana "in any combination" tapped by hand (PLAN-L L3): how many mana of each of the source's types, as many as it
 * produces in all.
 */
function ManaDivision({ colors, amount, onAdd }: { colors: string[]; amount: number; onAdd: (colors: ManaType[]) => void }) {
  const t = useT();
  const [counts, setCounts] = useState<number[]>(() => colors.map((_, i) => (i === 0 ? amount : 0)));
  const sum = counts.reduce((a, b) => a + b, 0);
  const bump = (i: number, d: number) => setCounts(counts.map((n, k) => (k === i ? Math.max(0, n + d) : n)));
  const chosen = colors.flatMap((c, i) => Array<ManaType>(counts[i] ?? 0).fill(c as ManaType));
  return (
    <div className="mana-division" data-testid="mana-division">
      <div className="divide-list">
        {colors.map((c, i) => (
          <div key={c} className="divide-row">
            <span className="divide-name">
              <ManaCost cost={`{${c}}`} />
            </span>
            <button type="button" className="btn small" aria-label={t("One less")} onClick={() => bump(i, -1)}>
              −
            </button>
            <span className="divide-value">{counts[i]}</span>
            <button
              type="button"
              className="btn small"
              aria-label={t("One more")}
              disabled={sum >= amount}
              onClick={() => bump(i, 1)}
            >
              +
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn choice" disabled={sum !== amount} onClick={() => onAdd(chosen)}>
        <RulesText text={t("Add {mana}", { mana: chosen.map((c) => `{${c}}`).join("") })} />
      </button>
      {sum !== amount && <p className="hint">{t("Assigned: {sum} / {total}", { sum, total: amount })}</p>}
    </div>
  );
}

function AbilityMenu() {
  const menu = useGame((s) => s.abilityMenu);
  const view = useGame((s) => s.view);
  const beginCasting = useGame((s) => s.beginCasting);
  const playLand = useGame((s) => s.playLand);
  const tapMana = useGame((s) => s.tapMana);
  const cancel = useGame((s) => s.cancel);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const loc = useLocalize();
  if (!menu || !view) return null;
  const source = [...view.battlefield, ...view.hand].find((o) => o.id === menu.sourceId);
  return (
    <Modal title={faceName(source, lang)}>
      <div className="choice-list">
        {menu.options.map((o, i) => {
          if (o.type === "cast") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => beginCasting(o, menu.sourceId)}>
                {t("Cast {name}", { name: faceLabel(source, o.faceName, lang) })}
                {o.warp ? ` ${t("(warp)")}` : ""}
                {o.faceName && o.faceName === source?.name ? ` — ${t("fuse, both halves")}` : ""}
                {/* Overload, cleave: the mode (and its cost) tells the two ways of casting apart. */}
                {o.modes.length === 1 && o.modes[0]?.label ? ` — ${loc(o.modes[0].label)}` : ""}
              </button>
            );
          }
          if (o.type === "activate") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => beginCasting(o, menu.sourceId)}>
                {o.label ? loc(o.label) : t("Activate the ability")}
              </button>
            );
          }
          if (o.type === "playLand") {
            return (
              <button key={i} type="button" className="btn choice" onClick={() => playLand(o)}>
                {/* Pathways: each land face has its option. */}
                {menu.options.some((x) => x.type === "playLand" && x.back)
                  ? t("Play {name}", { name: faceLabel(source, o.faceName, lang) })
                  : o.payLife
                    ? t("Play this land paying 2 life (untapped)")
                    : menu.options.some((x) => x.type === "playLand" && x.payLife)
                      ? t("Play this land tapped")
                      : t("Play this land")}
                {o.landType ? ` — ${textIn(lang, LAND_TYPES[o.landType] ?? o.landType)}` : ""}
              </button>
            );
          }
          if (o.type === "tapForMana" && o.combination && o.amount) {
            return <ManaDivision key={i} colors={o.colors} amount={o.amount} onAdd={(colors) => tapMana(o, undefined, colors)} />;
          }
          if (o.type === "tapForMana") {
            return o.colors.map((c) => (
              <button key={`${i}-${c}`} type="button" className="btn choice" onClick={() => tapMana(o, c)}>
                <RulesText text={t("Add {mana}", { mana: `{${c}}` })} />
              </button>
            ));
          }
          return null;
        })}
        {menu.unavailable?.map((a, i) => (
          <button key={`off-${i}`} type="button" className="btn choice" disabled title={t("Mana, target or timing: not now")}>
            {a.cost
              ? t("{label} — {cost}: not possible now", { label: loc(a.label), cost: loc(a.cost) })
              : t("{label} — not possible now", { label: loc(a.label) })}
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
      </div>
    </Modal>
  );
}

/** A player's exile (their exiled cards), open to everyone; "exiled by …" when a permanent holds the card. */
function ExileViewer() {
  const open = useGame((s) => s.exileOpen);
  const view = useGame((s) => s.view);
  const close = useGame((s) => s.openExile);
  const lang = useGame((s) => s.lang);
  const t = useT();
  if (!open || !view) return null;
  const player = view.players[open];
  if (!player) return null;
  const cards = view.exile.filter((c) => c.owner === open);
  const playable = new Set(view.playableElsewhere.map((c) => c.id));
  const holder = new Map<string, string>();
  for (const [source, ids] of Object.entries(view.exiledWith ?? {})) {
    const src = view.battlefield.find((o) => o.id === source);
    if (src) for (const id of ids) holder.set(id, faceName(src, lang));
  }
  return (
    <Dialog
      className="wide"
      onClose={() => close(null)}
      title={
        open === view.viewer
          ? t("Exile — you ({n})", { n: cards.length })
          : t("Exile — {player} ({n})", { player: player.name, n: cards.length })
      }
    >
      <div className="hand-picker">
        {cards.length === 0 && <p className="hint">{t("Empty.")}</p>}
        {[...cards].reverse().map((c) => (
          <div key={c.uid} className="exile-entry">
            <Card face={c} obj={c} width="var(--pick-w)" glow={playable.has(c.id) ? "playable" : null} />
            {holder.has(c.id) && <span className="exile-holder">{t("Exiled by {name}", { name: holder.get(c.id) ?? "" })}</span>}
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => close(null)}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * An opponent's hand: the cards you have seen in it (looked at or revealed) and that are still there, the others face
 * down.
 */
function HandViewer() {
  const open = useGame((s) => s.handOpen);
  const view = useGame((s) => s.view);
  const close = useGame((s) => s.openHand);
  const t = useT();
  if (!open || !view) return null;
  const player = view.players[open];
  if (!player) return null;
  const known = player.knownHand ?? [];
  const unknown = Math.max(0, player.handCount - known.length);
  return (
    <Dialog
      className="wide"
      onClose={() => close(null)}
      title={t("Hand — {player} ({n})", { player: player.name, n: player.handCount })}
    >
      <div className="hand-picker">
        {player.handCount === 0 && <p className="hint">{t("Empty.")}</p>}
        {known.map((c) => (
          <Card key={c.uid} face={c} obj={c} width="var(--pick-w)" />
        ))}
        {Array.from({ length: unknown }, (_, i) => (
          <CardBack key={i} width="var(--pick-w)" custom={player.customArt} />
        ))}
      </div>
      {unknown > 0 && known.length > 0 && (
        <p className="hint">{t("Face down: the cards you haven't seen ({n}).", { n: unknown })}</p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => close(null)}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}

function GraveyardViewer() {
  const open = useGame((s) => s.graveyardOpen);
  const view = useGame((s) => s.view);
  const close = useGame((s) => s.openGraveyard);
  const beginCasting = useGame((s) => s.beginCasting);
  const t = useT();
  // Flashback: spells castable from the graveyard,
  // and abilities activated from the graveyard.
  const graveIds = new Set((view && open ? view.players[open]?.graveyard : [])?.map((c) => c.id));
  const castable = myActions(view).filter(
    (a): a is PlayableOption => (a.type === "cast" && !!a.fromGraveyard) || (a.type === "activate" && graveIds.has(a.source)),
  );
  const idOf = (a: PlayableOption) => (a.type === "cast" ? a.card : a.source);
  const flashback = new Set(castable.map(idOf));
  const castFromGraveyard = (id: string) => {
    const opt = castable.find((a) => idOf(a) === id);
    if (!opt) return;
    close(null);
    beginCasting(opt, id);
  };
  if (!open || !view) return null;
  const player = view.players[open];
  if (!player) return null;
  return (
    <Dialog
      className="wide"
      onClose={() => close(null)}
      title={
        open === view.viewer
          ? t("Graveyard — you ({n})", { n: player.graveyard.length })
          : t("Graveyard — {player} ({n})", { player: player.name, n: player.graveyard.length })
      }
    >
      <div className="hand-picker">
        {player.graveyard.length === 0 && <p className="hint">{t("Empty.")}</p>}
        {[...player.graveyard].reverse().map((c) => (
          <Card
            key={c.uid}
            face={c}
            obj={c}
            width="var(--pick-w)"
            glow={flashback.has(c.id) ? "playable" : null}
            onClick={flashback.has(c.id) ? () => castFromGraveyard(c.id) : undefined}
          />
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => close(null)}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}

/** Score of a BO3 match, from the player's point of view ("1 – 0"), and its outcome. */
function matchSummary(view: GameView): {
  bestOf: number;
  game: number;
  mine: number;
  theirs: number;
  decided: boolean;
  wonMatch: boolean;
} | null {
  const s = useGame.getState();
  const opp = view.opponents[0] ?? "";
  if (s.online?.match && s.online.match.bestOf > 1) {
    const m = s.online.match;
    const me = (s.online.seat ?? "p1") as "p1" | "p2";
    const them = me === "p1" ? "p2" : "p1";
    return {
      bestOf: m.bestOf,
      game: m.game,
      mine: m.wins[me] ?? 0,
      theirs: m.wins[them] ?? 0,
      decided: !!m.winner || s.online.status === "over",
      wonMatch: m.winner === me,
    };
  }
  const m = s.localMatch;
  if (!m) return null;
  return {
    bestOf: m.bestOf,
    game: m.game,
    mine: m.wins[view.viewer] ?? 0,
    theirs: m.wins[opp] ?? 0,
    decided: !!m.winner,
    wonMatch: m.winner === view.viewer,
  };
}

/**
 * Multiplayer: the player is eliminated but the game goes on without them (800.4a); they can watch the end or quit.
 */
function Eliminated({ view }: { view: GameView }) {
  const backToLobby = useGame((s) => s.backToLobby);
  const replay = useGame((s) => !!s.replay);
  const t = useT();
  if (view.over || replay || !view.players[view.viewer]?.lost) return null;
  return (
    <div className="eliminated-banner" role="status" data-testid="eliminated">
      <span>{t("You have been eliminated. The game goes on without you.")}</span>
      <button type="button" className="btn" onClick={backToLobby}>
        {t("Quit")}
      </button>
    </div>
  );
}

function GameOver({ view }: { view: GameView }) {
  const backToLobby = useGame((s) => s.backToLobby);
  const online = useGame((s) => s.online);
  const rematch = useGame((s) => s.rematch);
  const openRoom = useGame((s) => s.openRoom);
  const localMatch = useGame((s) => s.localMatch);
  const replay = useGame((s) => !!s.replay);
  const nextGame = useGame((s) => s.nextGame);
  const t = useT();
  // The window set aside to look at the final battlefield (a bar at the top brings it back).
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    if (!view.over) setViewing(false);
    // Conceded from the drawer: it closes, the result shows.
    else useGame.getState().setDrawerOpen(false);
  }, [view.over]);
  // Tutorial: the guide announces the end of the game itself and offers what comes next.
  const coached = useTutorial((x) => !!x.lessonId);
  if (!view.over || coached || replay) return null;
  const me = online?.players.find((p) => p.seat === online.seat);
  const opp = online?.players.find((p) => p.seat !== online.seat);
  // Multiplayer: the rematch waits until all the other players, still connected, accept it (`ready` once the match is
  // over: the next match's deck chosen, the same one for a rematch).
  const others = online?.players.filter((p) => p.seat !== online.seat) ?? [];
  const multi = others.length > 1;
  const othersConnected = others.every((p) => p.connected);
  const won = view.winner === view.viewer;
  const match = matchSummary(view);
  // BO3 in progress: sideboard then next game (online, "sideboard" status sent by the server).
  const between = !!match && !match.decided && (online ? online.status === "sideboard" : true);
  const deckNow = online ? online.deck : localMatch?.deck;
  const original = online ? online.deck : localMatch?.original;
  const title = match?.decided
    ? match.wonMatch
      ? t("Match won!")
      : match.mine === match.theirs
        ? t("Match drawn")
        : t("Match lost")
    : won
      ? t("Victory!")
      : view.winner
        ? t("Defeat")
        : t("Game drawn");
  if (viewing)
    return (
      <div className={`gameover-bar ${won ? "won" : "lost"}`} role="status">
        <strong>{title}</strong>
        <button type="button" className="btn small primary" onClick={() => setViewing(false)}>
          {t("Back to the result")}
        </button>
        <button type="button" className="btn small" onClick={backToLobby}>
          {online ? t("Quit") : t("Back to menu")}
        </button>
      </div>
    );
  return (
    <Dialog backdropClassName="soft" className={`gameover ${won ? "won" : "lost"} ${between ? "wide" : ""}`} title={title}>
      {!won && view.winner && view.opponents.length > 1 && (
        <p className="match-score">{t("{name} wins the game.", { name: view.players[view.winner]?.name ?? "" })}</p>
      )}
      {match && (
        <p className="match-score">
          {t("Game {game} · Score {mine} – {theirs} (best of {bestOf})", {
            game: match.game,
            mine: match.mine,
            theirs: match.theirs,
            bestOf: match.bestOf,
          })}
        </p>
      )}
      <p className="hint">
        {t("Turn {n} · You {life} life", { n: view.turn.number, life: view.players[view.viewer]?.life ?? "" })}
        {view.opponents
          .map((o) => ` · ${t("{name} {life} life", { name: view.players[o]?.name ?? "", life: view.players[o]?.life ?? "" })}`)
          .join("")}
      </p>
      {between && deckNow && original && (
        <SideboardEditor
          key={`${match?.game}`}
          start={deckNow}
          original={original}
          waiting={
            online && me?.ready
              ? opp?.name
                ? t("Waiting for {name}…", { name: opp.name })
                : t("Waiting for the opponent…")
              : undefined
          }
          onSubmit={nextGame}
        />
      )}
      {online && !between && !multi && opp?.ready && !me?.ready && (
        <p className="hint">{t("{name} offers a rematch.", { name: opp.name })}</p>
      )}
      {online && !between && multi && others.some((p) => p.ready) && !me?.ready && (
        <p className="hint">
          {others.filter((p) => p.ready).length > 1
            ? t("{names} offer a rematch.", {
                names: others
                  .filter((p) => p.ready)
                  .map((p) => p.name)
                  .join(", "),
              })
            : t("{name} offers a rematch.", { name: others.find((p) => p.ready)?.name ?? "" })}
        </p>
      )}
      <div className="modal-actions">
        {online && !between && (
          <button
            type="button"
            className="btn primary"
            disabled={!!me?.ready || !othersConnected}
            onClick={rematch}
            title={
              !othersConnected ? (multi ? t("A player has left the game") : t("Your opponent has left the game")) : undefined
            }
          >
            {me?.ready
              ? multi
                ? t("Waiting for the other players…")
                : opp?.name
                  ? t("Waiting for {name}…", { name: opp.name })
                  : t("Waiting for the opponent…")
              : t("Rematch")}
          </button>
        )}
        {/* Another deck for the next match: back to the room. */}
        {online && !between && (
          <button type="button" className="btn" data-testid="change-deck" onClick={openRoom}>
            {t("Change the deck")}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => setViewing(true)}>
          {t("View the battlefield")}
        </button>
        <button type="button" className={`btn ${online ? "" : "primary"}`} onClick={backToLobby}>
          {online ? t("Quit") : t("Back to menu")}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Land played with an "as it enters" question (Cavern of Souls: a creature type; Echoing Deeps: a land card of a
 * graveyard to copy, or none; Scorched Ruins: the two lands to sacrifice; a reveal land: the card to reveal, or none).
 */
function LandChoice() {
  const option = useGame((s) => s.landChoice);
  const answer = useGame((s) => s.answerLandChoice);
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const t = useT();
  const [filter, setFilter] = useState("");
  const request = option?.choose;
  const [picked, setPicked] = useState<string[]>([]);
  // A new question: back to the engine's suggestion (several answers: Scorched Ruins).
  useEffect(() => {
    setPicked(request?.type === "pick" ? request.suggested.map(String) : []);
  }, [request]);
  if (request?.type === "name") return <LandNameChoice key={option?.card} request={request} />;
  if (request?.type !== "pick") return null;
  const suggested = request.suggested.map(String);
  const several = request.max > 1;
  // A card (a graveyard's, the hand's, a permanent): its name; otherwise the engine's label, or the value.
  const objects = [
    ...Object.values(view?.players ?? {}).flatMap((pl) => pl.graveyard),
    ...(view?.hand ?? []),
    ...(view?.battlefield ?? []),
  ];
  const label = (v: string) => {
    const card = objects.find((o) => o.id === v);
    return card ? faceName(card, lang) : loc(request.labels?.[v] ?? v);
  };
  const shown = request.options
    .map(String)
    .filter((v) => !filter || label(v).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => Number(suggested.includes(b)) - Number(suggested.includes(a)));
  const toggle = (v: string) =>
    setPicked((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < request.max ? [...cur, v] : cur));
  const valid = picked.length >= request.min && picked.length <= request.max;
  return (
    <Modal title={loc(request.prompt)}>
      {request.options.length > 12 && (
        <input className="choice-filter" placeholder={t("Filter…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      <div className="choice-list scroll">
        {shown.slice(0, 60).map((v) => (
          <button
            key={v}
            type="button"
            className={`btn choice ${several ? (picked.includes(v) ? "primary" : "") : suggested.includes(v) ? "suggested" : ""}`}
            aria-pressed={several ? picked.includes(v) : undefined}
            onClick={() => (several ? toggle(v) : answer([v]))}
          >
            {label(v)}
            {!several && suggested.includes(v) ? ` ${t("(suggestion)")}` : ""}
          </button>
        ))}
      </div>
      {several && (
        <p className="hint">
          {request.min === request.max
            ? t("Choose {n} — selection: {count}", { n: request.min, count: picked.length })
            : t("Choose from {min} to {max} — selection: {count}", {
                min: request.min,
                max: request.max,
                count: picked.length,
              })}
        </p>
      )}
      <div className="modal-actions">
        {!several && request.min === 0 && (
          <button type="button" className="btn" onClick={() => answer([])}>
            {t("ctx:feminine|None")}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => answer(null)}>
          {t("Cancel")}
        </button>
        {several && (
          <button type="button" className="btn primary" disabled={!valid} onClick={() => answer(picked)}>
            {t("Confirm")}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Land played with a name to choose (Cavern of Souls: a creature type): search in the whole list. */
function LandNameChoice({ request }: { request: Extract<ChoiceRequest, { type: "name" }> }) {
  const answer = useGame((s) => s.answerLandChoice);
  const loc = useLocalize();
  const t = useT();
  const suggested = String(request.suggested[0] ?? "");
  const [value, setValue] = useState(suggested);
  return (
    <Modal title={loc(request.prompt)}>
      <NameSearch
        of={request.of}
        featured={request.featured}
        suggested={suggested}
        value={value}
        onChange={setValue}
        onSubmit={(name) => answer([name])}
      />
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => answer(null)}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn primary" disabled={!value} onClick={() => answer([value])}>
          {t("Confirm")}
        </button>
      </div>
    </Modal>
  );
}

/** Place of a JSX element in a translated sentence (split around it). */
const SLOT = "\u0001";

/** Legend rule: confirmation before casting a legendary of which you already control a copy. */
function LegendConfirm() {
  const pending = useGame((s) => s.legendConfirm);
  const confirm = useGame((s) => s.confirmLegend);
  const cancel = useGame((s) => s.cancelLegend);
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  const t = useT();
  if (!pending || !view) return null;
  const existing = view.battlefield.find((o) => o.controller === view.viewer && o.name === pending.name);
  const shown = existing ? faceName(existing, lang) : pending.name;
  // The card name goes in bold: the sentence is split around its place.
  const [before, after] = t(
    "You already control {card}. If you cast this spell, you will have to choose which one to keep: the other one will go to the graveyard.",
    { card: SLOT },
  ).split(SLOT);
  return (
    <Modal title={t("Legend rule")}>
      <p className="legend-warning">
        {before}
        <strong>{shown}</strong>
        {after}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={cancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn primary" onClick={confirm}>
          {t("Cast anyway")}
        </button>
      </div>
    </Modal>
  );
}

export function Prompts() {
  const view = useGame((s) => s.view);
  if (!view) return null;
  return (
    <>
      <PendingPrompt view={view} />
      <CastingPrompt />
      <AbilityMenu />
      <ManaPick />
      <LegendConfirm />
      <LandChoice />
      <GraveyardViewer />
      <ExileViewer />
      <HandViewer />
      <GameOver view={view} />
      <Eliminated view={view} />
    </>
  );
}
