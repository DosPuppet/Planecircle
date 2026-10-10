/**
 * Building blocks of Tarkir: Dragonstorm (TDM): tokens, filters and helpers of the cycles (Devotees, Dragonstorms,
 * Monuments, lands). The DSL and the common tokens come from lci/common.ts.
 */
import type { AbilityDef, dsl, ManaType, ObjectFilter, TargetSpec, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import { creature } from "../fdn/common";
import { activated, cond, entersWith, fx, manaAbility, ref, target, triggered, when } from "../lci/common";

export * from "../lci/common";

/** Monk: 1/1 white creature with prowess. */
export const MONK: TokenSpec = creature("Monk", ["W"], ["Monk"], 1, 1, { keywords: ["prowess"] });
/** Warrior: 1/1 red creature (mobilize, Dalkovan Encampment). */
export const WARRIOR_R: TokenSpec = creature("Warrior", ["R"], ["Warrior"], 1, 1);
/** Spirit: 1/1 white creature with no abilities (endure, Great Arashin City); X/X with `createXXToken`. */
export const SPIRIT_W: TokenSpec = creature("Spirit", ["W"], ["Spirit"], 1, 1);
/** Soldier: 2/2 white creature (Teeming Dragonstorm, Signaling Roar). */
export const SOLDIER_2: TokenSpec = creature("Soldier", ["W"], ["Soldier"], 2, 2);
/** Zombie Druid: 2/2 black creature. */
export const ZOMBIE_DRUID: TokenSpec = creature("Zombie Druid", ["B"], ["Zombie", "Druid"], 2, 2);
/** Bird: 1/1 white creature with flying. */
export const BIRD_W: TokenSpec = creature("Bird", ["W"], ["Bird"], 1, 1, { keywords: ["flying"] });
/** Elephant: 5/5 green creature. */
export const ELEPHANT_5: TokenSpec = creature("Elephant", ["G"], ["Elephant"], 5, 5);

/** Reliquary Dragon (Dragonbroods' Relic): 4/4 Dragon of all colors, flying, lifelink, 3 damage when it enters. */
export const RELIQUARY_DRAGON: TokenSpec = creature("Reliquary Dragon", ["W", "U", "B", "R", "G"], ["Dragon"], 4, 4, {
  keywords: ["flying", "lifelink"],
  abilities: [
    triggered(when.entersSelf, [fx.damage(3, ref.target())], {
      targets: [target.any()],
      label: "3 damage to any target",
    }),
  ],
  text: "Flying, lifelink\nWhen this token enters, it deals 3 damage to any target.",
});

/** Dragons. */
export const DRAGON_CARD: ObjectFilter = { subtype: "Dragon" };
export const DRAGON_YOU: ObjectFilter = { subtype: "Dragon", controller: "you" };
/** "A creature with a counter on it" you control. */
export const CREATURE_WITH_COUNTER: ObjectFilter = { types: ["Creature"], controller: "you", withCounter: "any" };

/** Devotees: "{1}: Add [one of these colors]. Activate only once each turn." */
export function devotee(colors: ManaType[]): AbilityDef {
  return activated({
    mana: "{1}",
    oncePerTurn: true,
    effects: [fx.addManaChoice(1, colors)],
    label: msg("{1}: one mana {colors} (once per turn)", { colors: colors.map((c) => `{${c}}`).join(", ") }),
  });
}

/** Dragonstorms: "When a Dragon you control enters, return this enchantment to its owner's hand." */
export const dragonstorm = (): AbilityDef =>
  triggered(when.enters({ subtype: "Dragon", controller: "you" }), [fx.bounce(ref.self)], {
    label: "A Dragon enters: return this enchantment to hand",
  });

/** Monuments: "When this artifact enters, search for a basic [Plains, Swamp, or Forest] card". */
export function monumentSearch(lands: string[]): AbilityDef {
  return triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true, anySubtype: lands })], {
    label: msg("Search for a basic card ({lands})", { lands: lands.join(", ") }),
  });
}

/** "This land enters tapped unless you control a [type] or a [type]." */
export function entersTappedUnless(lands: string[]): AbilityDef {
  return entersWith({
    tapped: true,
    condition: cond.not(cond.controls({ anySubtype: lands })),
    label: msg("Tapped, unless you control: {lands}", { lands: lands.join(" or ") }),
  });
}

/** Three-color lands: "This land enters tapped. {T}: Add [one of these colors]." */
export function triLand(colors: ManaType[]): AbilityDef[] {
  return [entersWith({ tapped: true, label: "Enters tapped" }), manaAbility(colors)];
}

/** Flurry: "whenever you cast your second spell each turn, …". */
export function flurry(effects: dsl.Effects, label: string, targets: TargetSpec[] = []): AbilityDef {
  return triggered(when.castNthSpell(2), effects, { targets, label: msg("Flurry — {label}", { label }) });
}

/** Renew: "[cost], Exile this card from your graveyard: … Activate only as a sorcery." */
export function renew(mana: string, targets: TargetSpec[], effects: dsl.Effects, label: string): AbilityDef {
  return activated({
    mana,
    fromGraveyard: true,
    exileSelf: true,
    sorcerySpeed: true,
    targets,
    effects,
    label: msg("Renew — {label}", { label }),
  });
}
