## Fix Summary

All 5 MUST-FIX tasks resolved.

**Task 1 (Critical — coverage non-determinism):** Removed in-test `npm run build` fallbacks from `tests/cli/multi-loop.test.ts` (replaced with read-only `ensureDist()`). Added `pretest` + `pretest:coverage` scripts in `package.json` so `node scripts/build.mjs` runs once before the runner starts. Updated `CLAUDE.md` Commands table. **Discovered a second source of the race**: `tests/build.test.ts` itself called `npm run build` (which does `rm -rf dist`) from inside a parallel-running test file — rewrote it to assert against the pretest-produced `dist/cycle.js`.

**Task 2 (Critical — orphan file on mutate fail):** Split the terminal-failure block in `src/cli.ts:125-150`. `mutateFrontmatter` failure no longer skips `rename`; `rename` catch only swallows `ENOENT`; a `queue.drain_warning` event records the mutate failure to `log.jsonl`. Added integration test "terminal failure with malformed frontmatter".

**Task 3 (Minor — propagateBlocked spy):** `src/engine/blocked.ts` now accepts an optional `Logger` and emits `queue.propagate_blocked`. `src/cli.ts` passes the engine logger. Added unit test in `tests/engine/blocked.test.ts` and an explicit assertion in the integration "terminal failure" test.

**Task 4 (Minor — dynamic import):** `readQueue` added to the static import block; dynamic `await import("./engine/queue.ts")` deleted.

**Task 5 (Minor — dead fallback):** Dropped `?? "unknown"` — `failed_step: r.failingStep` direct.

**Verification:** `rm -rf dist && npm run test:coverage` run three consecutive times → **137 tests pass, 0 fail every run.** `npm run typecheck` shows only the two pre-existing `findLast` errors in `tests/cli/multi-loop.test.ts` (obs #498). Coverage: **line 98.61% / branch 86.45% / function 94.52%** — clear of baseline (≥95 / ≥75 / ≥90).

**Files touched:** `src/cli.ts`, `src/engine/blocked.ts`, `tests/cli/multi-loop.test.ts`, `tests/cli/queue-drain.test.ts`, `tests/engine/blocked.test.ts`, `tests/build.test.ts`, `package.json`, `CLAUDE.md`, `docs/cycle/0014-feature-bb-3-new-tbd-jsonl-row-schema-and-drain/MUST-FIX.md`.
