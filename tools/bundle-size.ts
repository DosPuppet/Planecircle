/**
 * Size budget of the interface bundle (PLAN-C in docs/history.md, lot C3): builds the client (`vite build`) and checks the
 * size of each chunk. The game worker must not embed the cards (it receives their definitions).
 *
 * Usage: npx tsx tools/bundle-size.ts   (run by `npm run verify`)
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";

const KB = 1024;
/** Maximum size of each chunk (name prefix → bytes). */
const BUDGET: Record<string, number> = {
  "game.worker": 600 * KB,
  // Engine and card scripts: 2299 KB after PLAN-M M8b, 2303 KB after M9a (2026-10-11).
  index: 2350 * KB,
  cards: 6500 * KB,
  // Cards of the Commander decks (EDH pseudo-set, PLAN-E): 551 KB with nine precons (07/10/2026), 841 KB with fifteen
  // (2026-10-09); beyond about 1 MB, load them on demand (PLAN-E, principle 1).
  commander: 1000 * KB,
  // French catalogs (PLAN-I): 712 KB with 8,806 texts (2026-10-08), loaded at start-up (French is the default).
  locales: 900 * KB,
  vendor: 450 * KB,
  // Printings table (deck builder), loaded on demand; 466 KB with the Commander cards (07/10/2026).
  printings: 600 * KB,
  // Animated table (PLAN-V, raw WebGL), loaded on demand: a missing chunk means it was merged into the application.
  backdrop: 12 * KB,
};

/** Stylesheet (PLAN-V): 56.5 KB before the MTGA restyle (2026-10-15); each restyle batch deletes the rules it replaces. */
const CSS_BUDGET: Record<string, number> = {
  index: 60 * KB,
};

execSync("npm run build -w @mtgx/client", { stdio: "pipe" });
const dir = new URL("../packages/client/dist/assets/", import.meta.url);
const all = readdirSync(dir);
const errors: string[] = [];
const sizes: string[] = [];
for (const [ext, budget] of [
  [".js", BUDGET],
  [".css", CSS_BUDGET],
] as const) {
  const files = all.filter((f) => f.endsWith(ext));
  for (const [prefix, max] of Object.entries(budget)) {
    const file = files.find((f) => f.startsWith(`${prefix}-`));
    const name = ext === ".js" ? prefix : `${prefix}${ext}`;
    if (!file) {
      errors.push(`chunk ${name} not found`);
      continue;
    }
    const size = statSync(new URL(file, dir)).size;
    sizes.push(`${name} ${Math.round(size / KB)} KB`);
    if (size > max) errors.push(`${name}: ${Math.round(size / KB)} KB, budget ${Math.round(max / KB)} KB`);
  }
}
// A scripted card in the worker means that it imports @mtgx/cards (CLAUDE.md rule, "Bundle").
const worker = all.find((f) => f.startsWith("game.worker-"));
if (worker && readFileSync(new URL(worker, dir), "utf8").includes("Luminous Rebuke"))
  errors.push("the worker embeds the cards (@mtgx/cards imported)");
console.log(`bundle: ${sizes.join(", ")}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
