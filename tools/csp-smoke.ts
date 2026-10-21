/**
 * The 3D board under the production CSP (PLAN-X). Vite sends no CSP, so the other interface tests cannot see what it
 * blocks (the basis transcoder's `new Function`, the models' textures loaded from blob URLs both got through them): here
 * the client build (`packages/client/dist`, built by verify's bundle step) is served by the game server itself, with
 * its headers, on a port of its own. For each arena built in data/arena/ (none: the plain table), a game against the
 * AI on the 3D board (tried on SwiftShader, at low quality, as a player may); it fails on a violation of the CSP, a
 * texture not loaded, the arena given up (its toast), the 3D board not drawn, or a page error.
 * Screenshots in test-results/csp/.
 *
 * Requires: `npm run build` (or verify's bundle step) after a change to the client.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/csp";
mkdirSync(OUT, { recursive: true });
const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
/** What a blocked load writes in the console. */
const BLOCKED = /Content Security Policy|Content-Security-Policy|Refused to|Couldn't load texture|arena not loaded/i;

if (!existsSync("packages/client/dist/index.html")) {
  console.log("FAILED: no client build (npm run build)");
  process.exit(1);
}

const failures: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

const server: ChildProcess = spawn(process.execPath, ["--import", "tsx", "packages/server/src/main.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
  stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  up = await fetch(`${BASE}/healthz`).then(
    (r) => r.ok,
    () => false,
  );
  if (!up) await new Promise((r) => setTimeout(r, 500));
}
check(up, "the game server serves the client build");
const csp = up ? ((await fetch(BASE)).headers.get("content-security-policy") ?? "") : "";
check(
  csp.includes("script-src 'self' 'wasm-unsafe-eval'") && !csp.includes("'unsafe-eval'"),
  "with its CSP (no JavaScript eval)",
);

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const arenas = ["tavern", "shrine"].filter((id) => existsSync(`data/arena/${id}/manifest.json`));
if (!arenas.length) console.log("(no arena built: the plain table only; npm run arena-assets)");
for (const arena of arenas.length ? arenas : ["tavern"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((id) => {
    localStorage.setItem("planecircle.effects", "3d");
    localStorage.setItem("planecircle.quality3d", "low");
    localStorage.setItem("planecircle.arena3d", id);
  }, arena);
  const page = await ctx.newPage();
  const blocked: string[] = [];
  const errors: string[] = [];
  page.on("console", (m) => {
    if (BLOCKED.test(m.text())) blocked.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { timeout: 120_000 });
  await page.getByRole("button", { name: "Jouer contre l'IA" }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 120_000 });
  const drawn = await page
    .locator(".board3d canvas")
    .waitFor({ state: "visible", timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  check(drawn, `${arena}: the 3D board is drawn (tried on a software renderer)`);
  await page
    .locator(".board3d-loading")
    .waitFor({ state: "detached", timeout: 120_000 })
    .catch(() => {});
  // The models' textures and the cards' images arrive after the loading screen at low quality: a few seconds more.
  await page.waitForTimeout(5000);
  const toast =
    (await page
      .locator(".toast")
      .textContent()
      .catch(() => "")) ?? "";
  check(!blocked.length, `${arena}: nothing blocked by the CSP, every texture loaded`, blocked.slice(0, 4));
  check(!/arène 3D|3D arena/.test(toast), `${arena}: the arena loaded (no toast)`, toast); // i18n-ignore: the French interface
  check(!errors.length, `${arena}: no page error`, errors.slice(0, 3));
  await page.screenshot({ path: `${OUT}/${arena}.png`, timeout: 120_000 });
  await ctx.close();
}
await browser.close();
stop();
if (failures.length) {
  console.log(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("ok: the 3D board loads under the production CSP");
