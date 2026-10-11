/**
 * Generic choices: validation of the answers and building of the requests.
 */
import { RulesError } from "./errors";
import { isNameAllowed } from "./names";
import { msg } from "./text";
import type { ChoicePurpose, ChoiceRequest, ChoiceValue, GameState, PlayerId } from "./types";

/**
 * Marker of a card in a player-facing text (prompt, label): the interface replaces it with the name of the card in its
 * language (`localizeText` of the client).
 */
export function cardRef(defId: string): string {
  return `⟦${defId}⟧`;
}

export function ask(s: GameState, player: PlayerId, request: ChoiceRequest, purpose: ChoicePurpose): void {
  s.pending = { kind: "choice", player, request, purpose };
}

/**
 * Answer on behalf of a player who left the game (800.4a): they make no more decisions, so they do nothing optional
 * ("may" declined, no object chosen if allowed, the minimum of a number); otherwise, the answer suggested by the
 * engine.
 */
export function absentAnswer(req: ChoiceRequest): ChoiceValue[] {
  switch (req.type) {
    case "yesNo":
      return [0];
    case "pick":
      return req.min === 0 ? [] : req.suggested;
    case "number":
      return [req.min];
    default:
      return req.suggested;
  }
}

const isInt = (v: ChoiceValue): v is number => typeof v === "number" && Number.isInteger(v);

/** Checks that an answer meets the request; throws a RulesError otherwise (`s`: names accepted by a "name" question). */
export function validateChoice(req: ChoiceRequest, values: ChoiceValue[], s: GameState): void {
  switch (req.type) {
    case "name": {
      const v = values[0];
      if (values.length !== 1 || typeof v !== "string") throw new RulesError(msg("A name was expected"));
      if (!isNameAllowed(s, req.of, v))
        throw new RulesError(
          req.of === "creatureType"
            ? msg("Unknown creature type: {name}", { name: v })
            : msg("Unknown card name: {name}", { name: v }),
        );
      return;
    }
    case "pick": {
      if (new Set(values).size !== values.length) throw new RulesError(msg("Duplicate choice"));
      if (values.some((v) => typeof v !== "string" || !req.options.includes(v)))
        throw new RulesError(msg("Choice not among the options"));
      if (values.length < req.min || values.length > req.max) {
        throw new RulesError(
          req.min === req.max
            ? msg("Choose exactly {n}", { n: req.min })
            : msg("Choose between {min} and {max}", { min: req.min, max: req.max }),
        );
      }
      return;
    }
    case "number": {
      const v = values[0];
      if (values.length !== 1 || v === undefined || !isInt(v) || v < req.min || v > req.max) {
        throw new RulesError(msg("Expected a number between {min} and {max}", { min: req.min, max: req.max }));
      }
      return;
    }
    case "order": {
      const sorted = [...values].map(String).sort();
      const expected = [...req.items].sort();
      if (sorted.length !== expected.length || sorted.some((v, i) => v !== expected[i]))
        throw new RulesError(msg("Invalid order"));
      return;
    }
    case "yesNo":
      if (values.length !== 1 || (values[0] !== 0 && values[0] !== 1)) throw new RulesError(msg("Expected a yes/no answer"));
      return;
    case "divide": {
      if (values.length !== req.among.length || values.some((v) => !isInt(v) || v < 0))
        throw new RulesError(msg("Invalid division"));
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (sum !== req.total) throw new RulesError(msg("Divide exactly {n}", { n: req.total }));
      if (req.minEach && values.some((v) => (v as number) < (req.minEach as number))) {
        throw new RulesError(msg("At least {n} for each", { n: req.minEach }));
      }
      if (req.lethal) {
        const lethal = req.lethal;
        const toPlayer = values[req.among.indexOf(lethal.player)] as number | undefined;
        if (toPlayer && toPlayer > 0) {
          for (const [id, need] of Object.entries(lethal.needs)) {
            if ((values[req.among.indexOf(id)] as number) < need) {
              throw new RulesError(msg("Trample: each blocker must be assigned lethal damage before the player"));
            }
          }
        }
      }
      return;
    }
  }
}

/** Answer as a target → quantity table, for a division. */
export function divisionOf(req: Extract<ChoiceRequest, { type: "divide" }>, values: ChoiceValue[]): Record<string, number> {
  const out: Record<string, number> = {};
  req.among.forEach((id, i) => {
    out[id] = Number(values[i] ?? 0);
  });
  return out;
}

/**
 * Secret choices (701.38c "secretly", `eachChooses` with `secret`): the key suffix of a player's answer still hidden
 * (`i`: their additional votes). The answers stay under these keys until all are made, then they are revealed.
 */
export function secretAnswerKey(player: PlayerId, i: number): string {
  return `secret|${player}|${i}`;
}

/**
 * The state as `viewer` may know it, for secret choices (the AI's state, `forAgent`): the answers of the other players
 * not yet revealed are removed (the resolution asks them again in a simulation), and so is the value of a secret choice
 * of a permanent made by another player (A Killer Among Us). Modifies `s` (a copy).
 */
export function forgetSecrets(s: GameState, viewer: PlayerId): void {
  const vars = s.resolving?.vars;
  if (vars)
    for (const k of Object.keys(vars)) {
      const m = /(?:^|:)secret\|([^|]+)\|\d+$/.exec(k);
      if (m && m[1] !== viewer) delete vars[k];
    }
  for (const id of s.battlefield) {
    const o = s.objects[id];
    if (o?.chosen?.secret && o.chosen.secret !== viewer) o.chosen = { secret: o.chosen.secret };
  }
}
