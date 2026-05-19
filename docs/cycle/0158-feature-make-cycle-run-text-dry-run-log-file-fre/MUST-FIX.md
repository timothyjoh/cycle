# Must-Fix Items: Cycle 0158

## Summary
2 issues: 1 already fixed (Task 1 from initial review pass), 1 new from second review pass (Task 2).

## Tasks

- [x] ### Task 1: Pin `engine.stop` cardinality in dry-run test
  **Priority:** Minor
  **Files:** `tests/cli/multi-loop.test.ts`
  **Problem:** Line 52 used `findLast` to locate `engine.stop` in the stdout events array. CLAUDE.md requires exactly-once engine events to be cardinality-pinned via `expectExactlyOne` (or `filter(...).length === 1`). `findLast` lets double-emission bugs through silently.
  **Fix:** Add `import { expectExactlyOne } from "../helpers.ts"` and replace `events.findLast(…)` with `expectExactlyOne(events, "engine.stop")`.
  **Status:** ✅ Fixed — 504/504 pass; coverage 98.35% / 91.34% / 92.83%, all gates green.

- [x] ### Task 2: Remove dead `args.dryRun` branches left by relocation
  **Priority:** Minor
  **Files:** `src/cli.ts`
  **Problem:** After the dry-run block relocated to `src/cli.ts:95–114` with `process.exit(0)`, `args.dryRun` is always `false` for all code below line 116. Five dead sites were not cleaned up:
  - **Line 127**: `const cfg = args.dryRun ? null : await loadConfig(cwd)` — left-arm ternary is unreachable.
  - **Line 135**: `if (!args.dryRun && cfg)` — `!args.dryRun` is always `true`; the guard is redundant.
  - **Line 385**: `if (!args.dryRun && cfg)` — same.
  - **Line 513**: `status: args.dryRun ? "ok" : halted ? "halted" : "ok"` — left arm unreachable.
  - **Line 514**: `dry_run: args.dryRun` — always emits `dry_run: false` on every real `engine.stop` event; semantically misleading and noisy in the log.

  **Fix:** Apply each substitution in order (line numbers shift after each edit — work bottom-up or use exact string matching):

  1. **Line 127** — replace:
     ```typescript
     const cfg = args.dryRun ? null : await loadConfig(cwd);
     ```
     with:
     ```typescript
     const cfg = await loadConfig(cwd);
     ```

  2. **Line 135** — replace:
     ```typescript
     if (!args.dryRun && cfg) {
     ```
     with:
     ```typescript
     if (cfg) {
     ```

  3. **Line 385** — replace the resume-block guard:
     ```typescript
     if (!args.dryRun && cfg) {
     ```
     with:
     ```typescript
     if (cfg) {
     ```
     (This is the block starting `const tail = await readLogTail(cwd);`.)

  4. **Lines 512–514** — replace:
     ```typescript
     await log.emit("engine.stop", {
       status: args.dryRun ? "ok" : halted ? "halted" : "ok",
       dry_run: args.dryRun,
     ```
     with:
     ```typescript
     await log.emit("engine.stop", {
       status: halted ? "halted" : "ok",
       dry_run: false,
     ```
     (Keeping `dry_run: false` literal preserves the field for log consumers that read it; it is now explicit rather than a dead variable reference. Alternatively drop the field entirely — either is acceptable; prefer keeping it for log schema consistency.)

  **Verify:**
  - `npm run typecheck` passes with no warnings.
  - `npm test` passes 504/504.
  - `grep -n "args\.dryRun" src/cli.ts` returns only line 95 (the `if (args.dryRun)` block itself) and no others.
  **Status:** ✅ Fixed
  **What was done:** Applied all four substitutions bottom-up: simplified `engine.stop` emit to `halted ? "halted" : "ok"` with literal `dry_run: false`; replaced both `if (!args.dryRun && cfg)` guards with `if (cfg)`; replaced ternary on `loadConfig` with direct `await loadConfig(cwd)`. Typecheck clean, 504/504 pass, coverage 98.41% / 91.43% / 92.83%, all per-file floors met.
