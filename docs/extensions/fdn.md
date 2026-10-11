# Foundations (FDN)

**✅ 517 / 517** (main set, lots A to F: 276 / 276; reprints: 241 / 241). Lots of the main set and of the reprints (moved from CLAUDE.md).

- A. Long tail (DSL primitives, dual lands)
- B. Library and graveyard (graveyard targets, search, return)
- C. Stack: counterspells, ward, spells on the stack as targets
- D. Auras and Equipment
- E. Planeswalkers and emblems
- F. Unique mechanics:
  - casting permissions (Omniscience, Etali, Muldrotha, Tinybones, impulse draw, granted flashback, casting from the graveyard);
  - alternative costs and "sacrifice or pay";
  - doubling effects (tokens, counters, damage);
  - protection from everything and hexproof from instants;
  - player statics;
  - choices on entering and restricted mana;
  - spell copying, control change, ending the turn, variable P/T, triggers from the graveyard.

Reprints: hexproof from a color, changeling, blocking restrictions ("must be blocked", "can't be blocked by…"), Crew, activation costs (exile, return to hand, counters, once per turn), poison counters, additional combat phases, mana kept until end of turn, spells copied by the mana spent, retargeting, winning and losing by effect, Auras "you control enchanted creature".

## PLAN-M M7 (rules 198)

- **Electroduplicate, Chandra, Flameshaper:** the copy's "At the beginning of the end step, sacrifice this token" is an ability of the token (`addAbilities: [SACRIFICE_TOKEN_AT_END_STEP]`).
- **Soulstone Sanctuary:** "all creature types" are those of 205.3m (not Book, Equipment or Food).
- **Tests:** `fdn-lotf.test.ts` (+1 Electroduplicate; the Soulstone Sanctuary test checks the subtypes).
