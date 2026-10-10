import type { Amount, Effect, ManaAbilityDef, ManaRestriction, ManaType, ObjectFilter } from "../types";

/** `fx` builders (dsl.ts) of mana (`ops/mana.ts`). */
export const manaFx = {
  addMana: (...mana: ManaType[]): Effect => ({ op: "addMana", mana }),
  /** "Add [mana]. If this mana is spent to cast [a matching spell], [effect]" (Arena of Glory). */
  addManaWithRider: (rider: NonNullable<ManaAbilityDef["rider"]>, ...mana: ManaType[]): Effect => ({
    op: "addMana",
    mana,
    rider,
  }),
  /** "Add N mana of any one color"; `colors`: "{R}, {W}, or {B}". */
  addManaChoice: (n: Amount = 1, colors?: ManaType[], restriction?: ManaRestriction, keep?: boolean): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    ...(keep ? { keep } : {}),
  }),
  /** "Add N mana in any combination of colors"; `colors`: "{R} and/or {G} for each …". */
  addManaCombination: (n: Amount, colors?: ManaType[], restriction?: ManaRestriction, keep?: boolean): Effect => ({
    op: "addManaChoice",
    n,
    colors,
    restriction,
    combination: true,
    ...(keep ? { keep } : {}),
  }),
  addManaColorsAmong: (filter: ObjectFilter): Effect => ({ op: "addManaColorsAmong", filter }),
  addManaUntilEndOfTurn: (...mana: ManaType[]): Effect => ({ op: "addManaUntilEndOfTurn", mana }),
  /** Mana that stays until end of combat, `times` times (firebending). */
  addManaUntilEndOfCombat: (mana: ManaType[], times?: Amount): Effect => ({
    op: "addManaUntilEndOfTurn",
    mana,
    untilEndOfCombat: true,
    ...(times !== undefined ? { times } : {}),
  }),
  addManaTimes: (times: Amount, ...mana: ManaType[]): Effect => ({ op: "addMana", mana, times }),
};
