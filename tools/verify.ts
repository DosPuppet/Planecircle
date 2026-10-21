/**
 * Verification of a lot, parallelized and timed.
 *
 * Usage:
 *   npm run verify -- --set FIN     verification of a lot (fuzz targeted on the set, about 2 min)
 *   npm run verify -- --set META    meta lot (plan P4): fuzz between the playable meta decks (docs/meta/)
 *   npm run verify -- --full        full verification (end of a set, before a merge)
 *   npm run verify -- --ci          continuous integration (GitHub Actions): checks, tests and short fuzzes on the
 *                                   whole pool, without interface tests or bench
 *   options: --ui (forces the interface tests), --no-ui (skips them), --no-bench (skips the bench of --full)
 *
 * Each step prints its duration; the detail of a step is printed only on failure (full logs in
 * test-results/verify/). The interface tests require Vite (npm run dev): by default, they run only if the client,
 * the view or the protocol changed since the last commit.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const full = flag("full");
const ci = flag("ci");
const set = opt("set")?.toUpperCase();
// Meta lot: the cards span several sets; the targeted fuzz plays the meta decks. Commander (PLAN-E):
// `--set COMMANDER` plays the Commander precons; `--set EDH` adds Commander games to the targeted series.
const pool = set === "META" ? "meta" : set === "COMMANDER" ? "commander" : set;
const commanderOnly = set === "COMMANDER" ? " --format commander" : "";
if (!full && !ci && !set) {
  console.error("Specify --set <set> (verification of a lot), --full or --ci.");
  process.exit(2);
}
const jobs = Math.max(1, availableParallelism() - 2);
const LOGS = "test-results/verify";
mkdirSync(LOGS, { recursive: true });

interface Step {
  name: string;
  cmd: string;
  /** Result line(s) to print even on success. */
  show?: RegExp;
}

interface Result {
  step: Step;
  ok: boolean;
  seconds: number;
  out: string;
}

function run(step: Step): Promise<Result> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", step.cmd], { env: { ...process.env, FORCE_COLOR: "0" } });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => {
      const seconds = (performance.now() - t0) / 1000;
      writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, out);
      resolve({ step, ok: code === 0, seconds, out });
    });
  });
}

function report(r: Result): void {
  const shown = r.step.show ? (r.out.match(new RegExp(r.step.show, "gm")) ?? []).map((l) => l.trim()).join(" | ") : "";
  console.log(`${r.ok ? "✅" : "❌"} ${r.step.name.padEnd(28)} ${r.seconds.toFixed(1).padStart(6)} s  ${shown}`);
  if (!r.ok) console.log(`${r.out.split("\n").slice(-40).join("\n")}\n`);
}

/** Steps started together; the group must finish before the next one. */
async function group(steps: Step[]): Promise<boolean> {
  const results = await Promise.all(steps.map(run));
  for (const r of results) report(r);
  return results.every((r) => r.ok);
}

/** A fuzz series; all the series run together (`runFuzz`). */
const fuzz = (name: string, args: string) => ({ name, args });
const FUZZ_SHOW = /^results: .*$/;

/**
 * All the fuzz series on a single process group (`fuzz.ts --batch`): no start-up or waiting for the slowest between two
 * series. One line per series, in the order they finish; the duration of a series runs from its first batch to its
 * last (the series overlap a little).
 */
async function runFuzz(series: { name: string; args: string }[]): Promise<boolean> {
  const file = `${LOGS}/fuzz-batch.json`;
  writeFileSync(file, JSON.stringify(series));
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "tools/fuzz.ts", "--batch", file, "--jobs", String(jobs)], {
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    let ok = true;
    let buf = "";
    let stderr = "";
    const reported = new Set<string>();
    child.stdout.on("data", (d) => {
      buf += d;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        const r = JSON.parse(line) as { name: string; ok: boolean; seconds: number; out: string };
        const step: Step = { name: r.name, cmd: "", show: FUZZ_SHOW };
        writeFileSync(`${LOGS}/${step.name.replace(/\W+/g, "-")}.log`, r.out);
        report({ step, ok: r.ok, seconds: r.seconds, out: r.out });
        reported.add(r.name);
        ok &&= r.ok;
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      // Abrupt stop (process killed, memory): the series without a summary have failed.
      for (const s of series.filter((x) => !reported.has(x.name)))
        report({ step: { name: s.name, cmd: "" }, ok: false, seconds: 0, out: stderr || `fuzz stopped (code ${code})` });
      resolve(ok && code === 0 && reported.size === series.length);
    });
  });
}

/** Files changed since the last commit (tracked or not). */
async function changedFiles(): Promise<string[]> {
  const r = await run({ name: "git-status", cmd: "git status --porcelain" });
  return r.out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

async function viteUp(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:5173/", { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const t0 = performance.now();
let ok = true;

// 1. Static checks (light, together), then vitest (it already takes all the cores).
ok &&= await group([
  { name: "tsc", cmd: "npx tsc -p tsconfig.json" },
  { name: "biome", cmd: "npx biome check .", show: /^Found .*$/ },
  {
    name: "coverage",
    cmd:
      set === "COMMANDER"
        ? "npx tsx tools/card-coverage.ts --deck all"
        : `npx tsx tools/card-coverage.ts --set ${set && set !== "META" ? set : "standard"}`,
    show: /^.* cards handled .*$/,
  },
  { name: "bundle", cmd: "npx tsx tools/bundle-size.ts", show: /^bundle: .*$/ },
]);
// A lot runs the card smoke test of its own set only (the others: CI on every push, --full); META spans every set.
const SMOKE = "packages/ai/test/smoke";
const smokeFiles = readdirSync(SMOKE).filter((f) => f.endsWith(".test.ts"));
const own = (code: string) => smokeFiles.filter((f) => f === `${code}.test.ts` || f.startsWith(`${code}-`));
const lotCode = set === "COMMANDER" ? "edh" : set?.toLowerCase();
const keep = !full && !ci && lotCode && set !== "META" ? (own(lotCode).length ? own(lotCode) : ["others.test.ts"]) : null;
const skip = keep ? smokeFiles.filter((f) => !keep.includes(f)).map((f) => `${SMOKE}/${f}`) : [];
ok &&= await group([
  {
    name: keep ? `vitest (smoke: ${keep.join(", ")})` : "vitest",
    cmd: `MTGX_SKIP=${skip.join(",")} npx vitest run`,
    show: /^\s*Tests .*$/,
  },
]);

// 2. Fuzz: all the series together, on all the cores.
const fuzzes = ci
  ? [
      fuzz("fuzz 2 p.", "--games 150 --pool all --seed 1 --offers 4"),
      fuzz("fuzz 3 players", "--games 40 --pool all --players 3"),
      fuzz("fuzz AI levels", "--games 20 --pool all --ai levels"),
      fuzz("fuzz chaos 2 p.", "--games 100 --pool all --ai chaos --seed 3000"),
      fuzz("fuzz meta", "--games 60 --pool meta --ai mixed"),
      fuzz("fuzz Commander 4 p.", "--games 20 --pool all --players 4 --format commander"),
    ]
  : full
    ? [
        fuzz("fuzz 2 p. seed 1", "--games 300 --pool all --seed 1 --offers 4"),
        fuzz("fuzz 2 p. seed 1000", "--games 300 --pool all --seed 1000"),
        fuzz("fuzz 2 p. seed 5000", "--games 300 --pool all --seed 5000"),
        fuzz("fuzz 3 players", "--games 200 --pool all --players 3"),
        fuzz("fuzz 4 players", "--games 100 --pool all --players 4"),
        fuzz("fuzz mixed AI", "--games 100 --pool all --ai mixed"),
        fuzz("fuzz AI levels", "--games 60 --pool all --ai levels"),
        fuzz("fuzz chaos 2 p.", "--games 300 --pool all --ai chaos --seed 3000"),
        fuzz("fuzz chaos 4 p.", "--games 60 --pool all --ai chaos --players 4"),
        fuzz("fuzz meta", "--games 100 --pool meta --ai levels"),
        fuzz("fuzz Commander 2 p.", "--games 100 --pool all --format commander --offers 4"),
        fuzz("fuzz Commander 4 p.", "--games 60 --pool all --players 4 --format commander"),
        fuzz("fuzz Commander chaos 4 p.", "--games 30 --pool all --players 4 --format commander --ai chaos"),
      ]
    : [
        fuzz(`fuzz ${set} 2 players`, `--games 300 --pool ${pool} --seed 1 --offers 4${commanderOnly}`),
        fuzz(`fuzz ${set} 3 players`, `--games 100 --pool ${pool} --players 3${commanderOnly}`),
        fuzz(`fuzz ${set} 4 players`, `--games 60 --pool ${pool} --players 4${commanderOnly}`),
        fuzz(`fuzz ${set} mixed AI`, `--games 60 --pool ${pool} --ai mixed${commanderOnly}`),
        fuzz(`fuzz ${set} AI levels`, `--games 30 --pool ${pool} --ai levels${commanderOnly}`),
        fuzz("fuzz whole pool", "--games 200 --pool all --seed 2000"),
        fuzz(`fuzz ${set} chaos`, `--games 150 --pool ${pool} --ai chaos${commanderOnly}`),
        ...(set === "EDH"
          ? [
              fuzz("fuzz Commander 2 p.", "--games 100 --pool EDH --format commander --offers 4"),
              fuzz("fuzz Commander 4 p.", "--games 30 --pool EDH --players 4 --format commander"),
            ]
          : []),
      ];
ok = (await runFuzz(fuzzes)) && ok;

// 3. Bench (full verification only: it judges a lot's regression poorly, especially on battery).
if (full && !flag("no-bench")) ok = (await group([{ name: "bench", cmd: "npx tsx tools/bench.ts", show: /^Targets .*$/ }])) && ok;

// 4. Interface tests, if the client, the view or the protocol changed (or --ui, or --full).
const changed = await changedFiles();
const uiTouched = changed.some((f) => /packages\/client\/|engine\/src\/view\.ts|server\/src\/protocol\.ts/.test(f));
if (!ci && !flag("no-ui") && (full || flag("ui") || uiTouched)) {
  if (await viteUp()) {
    // Two queues in parallel, of similar durations (about 100 s each): ui-smoke, mobile-smoke and tutorial-smoke on
    // one side, the others on the other.
    // No more: under a heavier load, the games played in the browser run out of time.
    const chain = async (steps: Step[]) => {
      let chainOk = true;
      for (const step of steps) chainOk = (await group([step])) && chainOk;
      return chainOk;
    };
    const results = await Promise.all([
      chain([
        { name: "ui-smoke", cmd: "npx tsx tools/ui-smoke.ts", show: /^No page error\.$/ },
        { name: "mobile-smoke", cmd: "npx tsx tools/mobile-smoke.ts", show: /^ok: no page error$/ },
        { name: "tutorial-smoke", cmd: "npx tsx tools/tutorial-smoke.ts", show: /^ok: tutorial followed end to end$/ },
        // The first lesson on the 3D board (PLAN-W): the guide finds its cards through the proxies.
        { name: "tutorial-3d", cmd: "npx tsx tools/tutorial-smoke.ts --3d --only 1", show: /^ok: lesson 1 .*$/ },
        { name: "commander-smoke", cmd: "npx tsx tools/commander-smoke.ts", show: /^ok: no page error$/ },
      ]),
      chain([
        { name: "deck-smoke", cmd: "npx tsx tools/deck-smoke.ts", show: /^ok: game started.*$/ },
        { name: "battlefield-smoke", cmd: "npx tsx tools/battlefield-smoke.ts", show: /^ok: no page error$/ },
        { name: "board3d-smoke", cmd: "npx tsx tools/board3d-smoke.ts", show: /^ok: no page error$/ },
        { name: "proxy-smoke", cmd: "npx tsx tools/proxy-smoke.ts", show: /^ok: no page error$/ },
        { name: "replay-smoke", cmd: "npx tsx tools/replay-smoke.ts", show: /^ok: replay .*$/ },
        { name: "bo3-smoke", cmd: "npx tsx tools/bo3-smoke.ts", show: /^ok: BO3 .*$/ },
      ]),
    ]);
    ok = results.every(Boolean) && ok;
    // Display in both languages (PLAN-I): two games in the browser, alone (in a queue, it slowed the others into timeouts).
    // A lot plays 50 actions per game, then concedes (the end-of-game window is checked either way); --full plays 150.
    ok =
      (await group([
        { name: "lang-smoke", cmd: `npx tsx tools/lang-smoke.ts ${full ? 150 : 50}`, show: /^ok: both languages.*$/ },
      ])) && ok;
    // The 3D board under the production CSP (Vite sends none): the bundle step's build, served by the game server.
    ok =
      (await group([
        { name: "csp-smoke", cmd: "npx tsx tools/csp-smoke.ts", show: /^ok: the 3D board loads under the production CSP$/ },
      ])) && ok;
    // Latency of the high AI in real time: alone (a parallel load would skew the measurement), full verification.
    if (full)
      ok =
        (await group([{ name: "ai-smoke", cmd: "npx tsx tools/ai-smoke.ts", show: /^ok: AI level and latency checked$/ }])) && ok;
  } else {
    console.log("⚠️  interface tests skipped: Vite does not answer on http://localhost:5173 (run npm run dev)");
    ok = false;
  }
} else {
  const why = ci ? "continuous integration" : flag("no-ui") ? "--no-ui" : "neither client, nor view, nor protocol changed";
  console.log(`·  interface tests skipped (${why})`);
}

console.log(
  `\n${ok ? "✅ Verification passed" : "❌ Verification failed"} in ${((performance.now() - t0) / 1000).toFixed(0)} s.`,
);
process.exitCode = ok ? 0 : 1;
