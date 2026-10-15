import { rmSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Vitest 5.0.1 does not delete the temporary directory of its main instance (`/tmp/<nanoid>/ssr`, about 60 MB
      // per run): hundreds of runs filled up `/tmp` on 2026-10-02. It is deleted on close.
      name: "mtgx-clear-vitest-tmp",
      configureVitest({ vitest }) {
        const dir = (vitest as unknown as { _tmpDir?: string })._tmpDir;
        if (!dir) return;
        const clear = () => rmSync(dir, { recursive: true, force: true });
        vitest.onClose(clear);
        process.once("exit", clear);
      },
    },
  ],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // `verify --set <EXT>`: the card smoke tests of the other sets are skipped (MTGX_SKIP, comma-separated files); CI
    // and `verify --full` run them all.
    exclude: [...configDefaults.exclude, ...(process.env.MTGX_SKIP?.split(",").filter(Boolean) ?? [])],
    // Workers reused across test files (the cards and the engine loaded once per worker, not once per file): 111 -> 95 s
    // (2026-10-15). Tests must not leave shared module state changed (a stubbed global is restored in afterEach).
    isolate: false,
  },
});
