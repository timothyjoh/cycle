## Summary

This cycle closes the last crash-safety gap in the failed-cycle dirty-worktree residue guard by persisting `pendingResidueContext` to `.cycle/failed-residue-context.json` at the within-budget `drainRetry` arm in `src/cli.ts`, making the guard crash-safe across **every** loop-back path rather than only the four terminal-failure branches.

**Files modified:**
- `src/cli.ts` (+3 lines) — added `await persistResidue(pendingResidueContext);` immediately after the in-memory assignment in the `else if (row.attempt + 1 < maxAttempts)` within-budget retry arm, plus a two-line comment explaining the crash-safe rationale. This is the fifth and final persist site, mechanically symmetric with the four terminal-failure branches (`:801`/`:858`/`:670`/`:883`). `persistResidue` is the existing best-effort wrapper that swallows a write failure into `engine.warning { reason: "residue_context_write_failed" }`, so the retry's own failure routing (`drainRetry` already ran) is never masked.
- `tests/cli/failed-residue-guard.test.ts` (+152 lines) — four new regression tests (see below).
- `CLAUDE.md` (1 line) — *Failed-cycle dirty-worktree residue guard* note updated: persist scope now reads "the four terminal-failure branches **and the within-budget retry arm** (five persist sites, cycle 0042)"; removed the "remaining limitation is that the within-budget retry arm is **not** persisted" sentence, replaced with a statement that the guard is now crash-safe across every loop-back path.
- `docs/ENGINE.md` (2 edits) — the cross-process-persistence paragraph (`:70`) now names five persist sites; the *Out of scope / known gaps* paragraph (`:76`) replaces the "Remaining known limitation" sentence with a "retry-arm persistence gap closed (cycle 0042)" note.

**PLAN.md tasks complete:** all six. Task 1 (persist call), Tasks 2–5 (regression tests), Task 6 (docs).

**Test suite:** `npm test` → **1072 pass, 0 fail** (full suite, auto-built first). Targeted file `tests/cli/failed-residue-guard.test.ts` → 18/18 pass (4 new).

**Coverage:** `npm run test:coverage` (which runs `check:coverage` + `check:invariants`) → **all per-file LCOV floor gates pass**, none regressed. Relevant: `src/engine/residue-context-store.ts` 100% ≥ 100%, `src/engine/run-cycle.ts` 100% ≥ 90%, `src/engine/failed-residue-guard.ts` 100% ≥ 100%. The structural invariant "failed-cycle dirty-worktree residue guard wired at exactly three gated sites" still reports `3` (the persist call adds no new check site). The node-runner global "all files" table reads line 44.34% / branch 88.38% / func 48.69% — unchanged framing (it counts test fixtures and non-instrumented files); the enforced policy is the per-file floor gate, which is green. `npm run typecheck` clean (no warnings).

**Failure modes handled and the tests covering them:**
- **Write failure at the new persist site** — pre-creating the target path as a non-empty directory forces `renameSync(tmp, <dir>)` to throw inside the atomic write; `persistResidue` catches it, emits exactly one `engine.warning { reason: "residue_context_write_failed" }`, does not throw, and the in-memory guard still produces the `engine.halted`/`engine.stop { reason: "failed_cycle_dirty_worktree" }` halt this same process. Covered by *"write failure at within-budget arm warns and falls back to in-memory guard"* (real-fs manipulation per the CLAUDE.md note that `node:fs/promises` cannot be `mock.method`-stubbed).
- **Crash-and-restart on the persisted retry context** — *"fresh start on persisted within-budget-retry context halts (cross-process)"* seeds the context file + a dirty `src/residue.ts` with no in-flight log tail; the fresh process reads the file, detects residue, and emits exactly one `engine.halted` + one terminal `engine.stop` (both cardinality-pinned), with no `cycle.start` (no new cycle stacked).
- **Idempotency / no stale file** — *"clean-tree clear after a within-budget retry deletes the persisted file"* uses a `.cycle/`-counter verify script (engine-owned, never trips the guard) that fails attempt 0 then succeeds attempt 1: the within-budget arm persists the context, the loop-top clean-tree clear deletes it via the existing `unpersistResidue()`, and the recovered retry drains `ok`. Asserts `contextExists()` is false at the end and no new production delete call was needed (per SPEC Out-of-Scope).
- **Happy-path persistence** — *"within-budget retry arm persists context to disk"* asserts the file is written with the correct `cycleId`/`issueId`/`failingStep: "verify"` after a `workflowYml(2, 2)` cycle routes through the within-budget arm.

**Deviations from PLAN.md:** one minor test-assertion adjustment in Task 5. The plan's draft asserted exactly one `queue.drained`, but the within-budget retry-drain itself emits a `queue.drained`, so the final-state run produces two drain events (one retry, one success). The assertion was changed to require exactly one `queue.drained` with `outcome: "ok"` (the successful recovered retry), which is the more precise check and the actual intent. No production-code deviation.

**Deferred work / follow-up:** none. SPEC scope fully satisfied; no out-of-scope work discovered.

## Touched Files
- src/cli.ts
- tests/cli/failed-residue-guard.test.ts
- CLAUDE.md
- docs/ENGINE.md
