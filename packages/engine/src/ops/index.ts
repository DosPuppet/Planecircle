/**
 * Registers the effect handlers of every `ops/` domain (`opRegistry.ts`). Imported once by `game.ts`, through which the
 * public API (`index.ts`), the scenarios and the test helpers go.
 */
import { registerOps } from "../opRegistry";
import { HANDLERS as COUNTERS_HANDLERS } from "./counters";
import { HANDLERS as DAMAGE_HANDLERS } from "./damage";
import { HANDLERS as FLOW_HANDLERS } from "./flow";
import { HANDLERS as MANA_HANDLERS } from "./mana";
import { HANDLERS as PERMANENTS_HANDLERS } from "./permanents";
import { HANDLERS as PLAYERS_HANDLERS } from "./players";
import { HANDLERS as SPELLS_HANDLERS } from "./spells";
import { HANDLERS as ZONES_HANDLERS } from "./zones";

for (const handlers of [
  COUNTERS_HANDLERS,
  DAMAGE_HANDLERS,
  FLOW_HANDLERS,
  MANA_HANDLERS,
  PERMANENTS_HANDLERS,
  PLAYERS_HANDLERS,
  SPELLS_HANDLERS,
  ZONES_HANDLERS,
])
  registerOps(handlers);
