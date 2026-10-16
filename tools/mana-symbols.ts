/**
 * Mana symbols: copies the glyphs the game shows (mana, generic numbers, tap and untap, energy, snow, Phyrexian…) from
 * the Mana font package (`mana-font`, by Andrew Gioia: font SIL OFL 1.1, CSS MIT; the symbols themselves are
 * Wizards of the Coast's) to packages/client/public/mana/, served as is and drawn as CSS masks by `ManaCost`.
 *
 * Usage: npx tsx tools/mana-symbols.ts   (after an update of mana-font)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = "node_modules/mana-font/svg";
const OUT = "packages/client/public/mana";

/** The names of `ManaCost` (Card.tsx, GLYPHS): letters lowercased, T → tap, Q → untap. */
export const GLYPHS = [
  "w",
  "u",
  "b",
  "r",
  "g",
  "c",
  "s",
  "e",
  "x",
  "y",
  "z",
  "p",
  "tap",
  "untap",
  "chaos",
  "half",
  "infinity",
  ...Array.from({ length: 21 }, (_, i) => String(i)),
  "100",
  "1000000",
];

mkdirSync(OUT, { recursive: true });
for (const g of GLYPHS) copyFileSync(`${SRC}/${g}.svg`, `${OUT}/${g}.svg`);
const version = (JSON.parse(readFileSync("node_modules/mana-font/package.json", "utf8")) as { version: string }).version;
writeFileSync(
  `${OUT}/LICENSE.txt`,
  `Mana symbols from Mana ${version} (https://github.com/andrewgioia/mana), by Andrew Gioia.
The Mana font is licensed under the SIL OFL 1.1; its CSS under the MIT License.
All mana, tap and card type symbol images are copyright Wizards of the Coast.
Copied by tools/mana-symbols.ts.
`,
);
console.log(`${GLYPHS.length} symbols copied to ${OUT}`);
