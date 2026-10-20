/**
 * An opponent's spell or ability on the stack, when the player has no possible response: it is shown to them
 * (card, caster, targets) for at least a few seconds before passing. OK passes at once.
 * If the player can respond, none of this: the game already waits for them ("respond?" banner).
 */
import type { GameView } from "@mtgx/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { fastMode } from "../fast";
import { faceName } from "../i18n";
import { useLocalize, useT } from "../localize";
import { myActions, useGame } from "../store";
import { useTutorialHold } from "../tutorial/store";
import { Card, RulesText } from "./Card";

/** Display time before passing automatically (an instant in the fast test mode). */
export const REVEAL_MS = fastMode() ? 300 : 5000;

/** The opponent's spell or ability to show, if there is one and the player can do nothing about it. */
function revealed(view: GameView | null, fullControl: boolean) {
  const p = view?.pending;
  if (!view || fullControl || p?.kind !== "priority" || p.player !== view.viewer) return null;
  const top = view.stack[view.stack.length - 1];
  if (!top || top.controller === view.viewer) return null;
  // A possible response: the player decides themselves (no timer).
  if (myActions(view).some((a) => a.type !== "pass" && a.type !== "tapForMana")) return null;
  return top;
}

export function StackReveal() {
  const view = useGame((s) => s.view);
  const fullControl = useGame((s) => s.settings.fullControl);
  const decide = useGame((s) => s.decide);
  const lang = useGame((s) => s.lang);
  const top = revealed(view, fullControl);
  const topId = top?.id;
  const [started, setStarted] = useState(0);
  // Guided tutorial: the player clicks OK themselves, when the guide asks them to.
  const held = useTutorialHold();
  const t = useT();

  // Timer: passes on its own after REVEAL_MS (restarted for each new stack item).
  useEffect(() => {
    if (!topId || held) return;
    setStarted(Date.now());
    const timer = setTimeout(() => decide({ type: "pass" }), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [topId, decide, held]);

  const nameOf = (id: string) => {
    if (!view) return id;
    const player = view.players[id];
    if (player) return id === view.viewer ? t("you") : player.name;
    const o = view.battlefield.find((x) => x.id === id) ?? view.stack.find((x) => x.id === id);
    return o ? faceName(o, lang) : t("a card");
  };

  // The card name is set in bold inside the sentence: the template is split around a marker.
  const CARD = "\u0001";
  const caster = top ? (view?.players[top.controller]?.name ?? t("The opponent")) : "";
  const label =
    top?.kind === "ability"
      ? t("{player} activates {card}", { player: caster, card: CARD })
      : t("{player} casts {card}", { player: caster, card: CARD });
  const [before = "", after = ""] = label.split(CARD);

  return (
    <AnimatePresence>
      {top && view && (
        <motion.div
          key={top.id}
          className="stack-reveal"
          initial={{ opacity: 0, x: 40, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25 }}
        >
          <div className="stack-reveal-label">
            {before}
            <strong>{faceName(top, lang)}</strong>
            {after}
          </div>
          <Card face={top} width="var(--spotlight-w)" hoverable />
          {top.effect && <EffectFrame text={top.effect} ability={top.kind === "ability"} />}
          {top.targets.length > 0 && (
            <div className="stack-reveal-targets">
              {top.targets.length > 1
                ? t("Targets: {list}", { list: top.targets.map(nameOf).join(", ") })
                : t("Target: {list}", { list: top.targets.map(nameOf).join(", ") })}
            </div>
          )}
          <button type="button" className="btn primary stack-reveal-ok" onClick={() => decide({ type: "pass" })}>
            OK
          </button>
          {!held && (
            <div className="stack-reveal-timer">
              <div key={started} className="stack-reveal-bar" style={{ animationDuration: `${REVEAL_MS}ms` }} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The effect played (mode of a modal spell, ability of a permanent), framed in blue under the card shown. */
export function EffectFrame({ text, ability }: { text: string; ability?: boolean }) {
  const t = useT();
  const loc = useLocalize();
  return (
    <div className="effect-frame">
      <span className="effect-frame-kind">{ability ? t("Ability") : t("Chosen mode")}</span>
      <RulesText text={loc(text)} />
    </div>
  );
}

/** An opponent's spell is shown by the panel: the transient spotlight would duplicate it. */
export function useRevealActive(): boolean {
  const view = useGame((s) => s.view);
  const fullControl = useGame((s) => s.settings.fullControl);
  return revealed(view, fullControl) !== null;
}
