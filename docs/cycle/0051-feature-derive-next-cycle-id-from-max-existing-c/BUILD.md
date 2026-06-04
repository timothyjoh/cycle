All gates pass. Writing the build summary.

## Summary

Cycle 0051 extends `allocateCycleId` to derive the next cycle id from `max(highest committed docs/cycle/NNNN-* dir, highest .cycle/log.jsonl cycle_id) + 1`, so a wiped/empty log on a fresh checkout can no longer restart numbering at `0001` and collide with historical cycle directories.

**Files modified:**
- `src/engine/cycle-id.ts` (+11 lines): added `readdir` to the import and a single bounded, fail-safe `readdir(docs/cycle, { withFileTypes: true })` scan after the existing log-scan block. Each `isDirectory()` entry matching `^(\d{4})-` folds its parsed id into the same `highest` accumulator (`!Number.isNaN` guarded); the scan is wrapped in its own `try/catch` that degrades to "no directory contribution" on any error. The increment-and-pad return line is unchanged, so `max` semantics fall out naturally and the intact-log path (log max ≥ dir max) is byte-for-byte identical.
- `tests/engine/cycle-id.test.ts` (+103 lines): added a `seedCycleDirs` helper and seven scenario tests — fresh checkout with empty-file log ⇒ `0259`, fresh checkout with absent log ⇒ `0259`, log-dominant ⇒ `0301`, dir-dominant ⇒ `0259`, absent `docs/cycle/` failure path ⇒ log-derived `0051` (no throw), non-matching entries (`issues/`, `099-foo/`, stray `cycle-notes.md`) ignored ⇒ `0011`, and both sources empty ⇒ `0001`.
- `scripts/coverage-gate.mjs` (+1 line): registered the `src/engine/cycle-id.ts` 100% per-file line floor alongside the peer engine helpers.
- `CLAUDE.md` (+1 entry): recorded `src/engine/cycle-id.ts` (100%) in the Per-file floors list.
- `tests/scripts/coverage-gate.test.ts` (+3 lines): added `src/engine/cycle-id.ts` to the three LCOV fixtures (ALL_PASSING, the below-floor case, and the absolute-paths list) so the gate's own tests account for the new floored path.
- `tests/engine/fix-guard.test.ts` (+4 lines): the four MUST-FIX-preseeding tests implicitly relied on `allocateCycleId` returning `0001` from an empty log; folding the dir scan in means the pre-seeded `docs/cycle/0001-feature-*` dir now bumps allocation to `0002`, decoupling the cycle's artifact dir from the pre-seeded MUST-FIX.md. Passing `cycleId: "0001"` explicitly to `runCycle` restores the intended coupling (this matches reality, where a cycle has a fixed id and its dir holds MUST-FIX).

**PLAN.md tasks complete:** Task 1 (dir-scan fold into `allocateCycleId`), Task 2 (unit-test coverage for all named scenarios), Task 3 (coverage floor registration + CLAUDE.md note) — all done.

**Test command:** `npm run test:coverage` (auto-builds, runs the full `node:test` suite, then `check:coverage` + `check:invariants`) → **1097 tests, 1097 pass, 0 fail**. `npm run typecheck` (`tsc --noEmit`) clean, no warnings. `npm run check:invariants` clean.

**Coverage:** `src/engine/cycle-id.ts` reports 100.00% line / 91.30% branch / 100.00% function; the new 100% per-file line floor is enforced and met (`coverage-gate: ok — src/engine/cycle-id.ts 100.00% ≥ 100%`). No per-file regressions elsewhere.

**Failure modes handled:** absent/unreadable `docs/cycle/` ⇒ the `readdir` rejection is caught at the dir-scan boundary, contributes `0`, and the log-derived id is returned without throwing (covered by the absent-`docs/cycle/` test asserting `0051` and no throw); malformed/non-matching basenames (3-digit `099-foo/`, `issues/`, stray files) are skipped by the `isDirectory()` + `^(\d{4})-` + `!Number.isNaN` filter (covered by the non-matching-entries test); both sources empty ⇒ `0001` (covered). The function never throws; errors are swallowed only at the documented directory-scan boundary and the overall allocation always returns a valid 4-digit id. Read-only allocation — no state mutation, idempotent across step retry/restart for the same on-disk state.

**Deviations from PLAN.md:** two test-only edits beyond the planned three files were required and made — updating `tests/scripts/coverage-gate.test.ts` (the gate's own fixtures must include any newly-floored path, else the gate exits 2 on a missing LCOV block) and `tests/engine/fix-guard.test.ts` (decoupling its pre-seeded artifact dir from `allocateCycleId` via explicit `cycleId`). Both are direct, in-scope consequences of the allocation change, not scope creep.

**Deferred work / follow-up:** none. Reconciling the already-collided `0048-*` directories on this machine remains explicitly out of scope per SPEC (this fix prevents future collisions; it does not repair past ones).

## Touched Files
- src/engine/cycle-id.ts
- tests/engine/cycle-id.test.ts
- scripts/coverage-gate.mjs
- CLAUDE.md
- tests/scripts/coverage-gate.test.ts
- tests/engine/fix-guard.test.ts
- docs/ARCHITECTURE.md
