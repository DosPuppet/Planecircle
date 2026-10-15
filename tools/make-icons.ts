/**
 * Planecircle icon: a ring of the five mana colors around a planeswalker spark, on the dark table. The SVG is drawn here
 * (single source); the PNG sizes a PWA needs are rendered by Chromium (Playwright). Writes packages/client/public/icons/.
 *
 * Usage: npx tsx tools/make-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "packages/client/public/icons";
mkdirSync(OUT, { recursive: true });

/** Mana colors in the order of the color pie, clockwise from the top. */
const MANA = ["#f4e7c3", "#3a8fd8", "#9a8aa8", "#e0503f", "#38a35e"];

/** Point on a circle of radius r around (256, 256), angle in degrees from the top, clockwise. */
const at = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(256 + r * Math.cos(a)).toFixed(2)} ${(256 + r * Math.sin(a)).toFixed(2)}`;
};

/**
 * `maskable`: full-bleed square, everything inside the safe circle (radius 205, 80% of the icon); otherwise a rounded
 * square with a little more room for the ring.
 */
function svg(maskable: boolean): string {
  const scale = maskable ? 0.8 : 1;
  const r = 158;
  const gap = 9;
  const arcs = MANA.map((c, i) => {
    const from = i * 72 + gap / 2 - 36;
    const to = from + 72 - gap;
    return `<path d="M ${at(r, from)} A ${r} ${r} 0 0 1 ${at(r, to)}" stroke="${c}"/>`;
  }).join("");
  // Spark: a four-pointed star, long vertically, with a softer diagonal one behind it.
  const star = (len: number, w: number, rot: number) =>
    `<path transform="rotate(${rot} 256 256)" d="M256 ${256 - len} C ${256 + w} ${256 - w} ${256 + w} ${256 - w} ${256 + len * 0.62} 256 C ${256 + w} ${256 + w} ${256 + w} ${256 + w} 256 ${256 + len} C ${256 - w} ${256 + w} ${256 - w} ${256 + w} ${256 - len * 0.62} 256 C ${256 - w} ${256 - w} ${256 - w} ${256 - w} 256 ${256 - len} Z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <radialGradient id="bg" cx="50%" cy="46%" r="70%">
    <stop offset="0" stop-color="#22304a"/><stop offset="0.55" stop-color="#121a28"/><stop offset="1" stop-color="#06080c"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffe2a0" stop-opacity="0.75"/><stop offset="0.35" stop-color="#f0b84a" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#f0b84a" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff6dc"/><stop offset="0.5" stop-color="#ffd47a"/><stop offset="1" stop-color="#e09a2a"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
${maskable ? `<rect width="512" height="512" fill="url(#bg)"/>` : `<rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bg)"/>`}
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="58"/>
  <g fill="none" stroke-width="30" stroke-linecap="round" filter="url(#soft)" opacity="0.55">${arcs}</g>
  <g fill="none" stroke-width="26" stroke-linecap="round">${arcs}</g>
  <circle cx="256" cy="256" r="118" fill="url(#glow)"/>
  <g fill="url(#spark)" opacity="0.55">${star(70, 9, 45)}</g>
  <g fill="url(#spark)">${star(112, 14, 0)}</g>
  <circle cx="256" cy="256" r="11" fill="#fffaf0"/>
</g>
</svg>
`;
}

writeFileSync(`${OUT}/icon.svg`, svg(false));
writeFileSync(`${OUT}/icon-maskable.svg`, svg(true));

/** File → [size, maskable]: manifest icons, Apple touch icon (opaque, the system rounds it), favicon. */
const PNGS: Record<string, [number, boolean]> = {
  "icon-192.png": [192, false],
  "icon-512.png": [512, false],
  "icon-maskable-512.png": [512, true],
  "apple-touch-icon.png": [180, true],
  "favicon-32.png": [32, false],
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, [size, maskable]] of Object.entries(PNGS)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg(maskable)).toString("base64")}" width="${size}" height="${size}"></body></html>`,
  );
  await page.screenshot({ path: `${OUT}/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`${OUT}/${file}`);
}
await browser.close();
