/**
 * Shape of a received decision (online client, AI, script): checked before touching the engine, so that a malformed
 * decision is refused by a RulesError rather than causing a TypeError deep in the engine.
 * Legality (cards in hand, targets, costs…) is still checked by the rules themselves.
 */
import { RulesError } from "./errors";
import { msg } from "./text";
import { type CostSlot, type Decision, type GameState, LABEL_SLOTS } from "./types";

type Rec = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
/** List of distinct objects (discarded, sacrificed cards…): a duplicate makes no sense. */
const isIdSet = (v: unknown): v is string[] => isStrArray(v) && new Set(v).size === v.length;

function bad(field: string): never {
  throw new RulesError(msg("Malformed decision: {field}", { field }));
}

/** Optional field: absent (undefined), or well-formed. */
function opt(d: Rec, field: string, ok: (v: unknown) => boolean): void {
  if (d[field] !== undefined && !ok(d[field])) bad(field);
}

/** Object cited as the card or source of the action: it must exist. */
function objectRef(s: GameState, d: Rec, field: string): void {
  const id = d[field];
  if (!isStr(id)) bad(field);
  if (!s.objects[id]) throw new RulesError(msg("Unknown object"));
}

/** Objects cited in a list: they must all exist. */
function objectRefs(s: GameState, ids: unknown[]): void {
  if (ids.some((id) => !s.objects[id as string])) throw new RulesError(msg("Unknown object"));
}

function castChoices(s: GameState, d: Rec): void {
  for (const f of ["free", "alternative", "kicked", "faceDown", "warp"]) opt(d, f, (v) => typeof v === "boolean");
  for (const f of ["mode", "x", "face"]) opt(d, f, isIndex);
  for (const f of ["discard", "sacrifice", "tap", "materials", "bounce"]) {
    opt(d, f, isIdSet);
    objectRefs(s, (d[f] as string[] | undefined) ?? []);
  }
  opt(d, "targets", (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isStrArray));
  picksShape(s, d);
}

/**
 * Objects paid as a cost, by slot: lists of ids of existing objects (repeated for counters; `id:kind` for a kind of
 * counter on an object). The label slots (kinds of counters, permanent types, a way to pay) are not objects: their
 * values are checked by the payment of the cost.
 */
function picksShape(s: GameState, d: Rec): void {
  opt(d, "picks", (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isStrArray));
  for (const [slot, ids] of Object.entries((d.picks as Record<string, string[]> | undefined) ?? {}))
    if (!LABEL_SLOTS.includes(slot as CostSlot))
      objectRefs(
        s,
        ids.map((id) => id.split(":")[0] as string),
      );
}

function pairs(v: unknown, a: string, b: string): boolean {
  return Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && isStr((x as Rec)[a]) && isStr((x as Rec)[b]));
}

export function checkDecisionShape(s: GameState, raw: Decision): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("decision");
  const d = raw as unknown as Rec;
  switch (raw.type) {
    case "keep":
    case "mulligan":
    case "pass":
    case "concede":
      return;
    case "bottom":
    case "discard":
      if (!isIdSet(d.cards)) bad("cards");
      objectRefs(s, d.cards);
      return;
    case "playLand":
      objectRef(s, d, "card");
      opt(d, "payLife", (v) => typeof v === "boolean");
      opt(d, "landType", (v) => typeof v === "string");
      opt(d, "chosen", (v) => typeof v === "string");
      opt(d, "back", (v) => typeof v === "boolean");
      return;
    case "cast":
      objectRef(s, d, "card");
      castChoices(s, d);
      return;
    case "activate":
      objectRef(s, d, "source");
      if (!isIndex(d.ability)) bad("ability");
      castChoices(s, d);
      return;
    case "undoMana":
      objectRef(s, d, "source");
      return;
    case "tapForMana":
      objectRef(s, d, "source");
      if (!isIndex(d.ability)) bad("ability");
      opt(d, "color", isStr);
      opt(d, "colors", isStrArray);
      picksShape(s, d);
      return;
    case "declareAttackers":
      if (!pairs(d.attackers, "id", "defender")) bad("attackers");
      if (!isIdSet((d.attackers as Rec[]).map((a) => a.id))) bad("attackers");
      objectRefs(
        s,
        (d.attackers as Rec[]).map((a) => a.id),
      );
      return;
    case "declareBlockers":
      if (!pairs(d.blocks, "blocker", "attacker")) bad("blocks");
      objectRefs(
        s,
        (d.blocks as Rec[]).flatMap((b) => [b.blocker, b.attacker]),
      );
      return;
    case "choose":
      if (!Array.isArray(d.values) || !d.values.every((v) => isStr(v) || Number.isFinite(v))) bad("values");
      return;
    default:
      bad("type");
  }
}
