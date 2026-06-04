# Implementation Plan: Cycle 0051

## Overview
Extend `allocateCycleId` so the next cycle id is `max(highest committed docs/cycle/NNNN-* dir, highest .cycle/log.jsonl cycle_id) + 1`, zero-padded to 4 digits, with a bounded, fail-safe directory scan — making cycle numbering monotonic and collision-free across a fresh checkout or wiped log while leaving the intact-log common path byte-for-byte identical.

## Current State (from Research)
- `allocateCycleId(repoRoot)` (`src/engine/cycle-id.ts:4`-`18`) derives the next id from `.cycle/log.jsonl` alone: a single `readFile` wrapped in degrade-to-`highest=0` `try/catch`, a per-line `JSON.parse` inside its own `try/catch`, the defensive `typeof e.cycle_id === "string" ? parseInt(...) : NaN` + `!Number.isNaN` numeric extraction, returning `String(highest + 1).padStart(4, "0")`.
- On an empty/absent log, `highest` stays `0` and it returns `"0001"`, colliding with committed historical `docs/cycle/NNNN-*` directories after a fresh checkout.
- Canonical fail-safe directory-read idioms exist: `readdir({ withFileTypes: true })` enumeration (`triage.ts:362`, `walkthrough.ts:153`, `reflection.ts:265`) and the ENOENT-degrade `try/catch` around `readdir` (`walkthrough.ts:151`-`157`).
- Error handling in this module is entirely local swallow-and-degrade — no logging, no events, no rethrow. The function is a pure read-only helper with no observability surface; idempotency is irrelevant (read-only).
- Tests use real temp dirs (`mkdtemp`/`mkdir`/`writeFile`, torn down in `finally`), no fs mocking (per the repo rule that `node:fs/promises` cannot be stubbed via `mock.method`). `src/engine/cycle-id.ts` is **not** currently in the `FLOORS` table (`scripts/coverage-gate.mjs:12`-`44`); peer helpers (`path-utils.ts`, `log-fmt.ts`, `rate-limit.ts`) are pinned at `100`.

## Desired End State
`allocateCycleId(repoRoot)` returns `String(max(highestDir, highestLogId) + 1).padStart(4, "0")` where `highestDir` is the largest integer captured from a `docs/cycle/` directory entry matching `^(\d{4})-`. Verify: with dirs `0001-…`–`0258-…` and an empty/absent log ⇒ `"0259"`; log-dominant and intact-log paths unchanged; missing/unreadable `docs/cycle/` ⇒ log-derived id without throwing. `npm test`, `npm run typecheck`, `npm run test:coverage` (incl. `check:coverage` / `check:invariants`) all pass.

## What We're NOT Doing
- Reconciling or renaming already-collided `0048-*` directories on this machine (prevents future collisions; does not repair past ones).
- Any change to how `cycle_id` is consumed downstream (`run-one`, queue, branch naming, artifact-dir computation) — the padded-4-digit-string return contract is preserved.
- Backfilling or rewriting `.cycle/log.jsonl`.
- Recursive traversal of `docs/cycle/`, per-entry `stat` beyond `readdir({ withFileTypes: true })`, or any handling of >9999 (5+-digit) numbering (out of scope; `^(\d{4})-` only).
- Adding structured events/logging/observability to the function (it has none today; that pattern is preserved).

## Implementation Approach
Add a single bounded `readdir(join(repoRoot, "docs/cycle"), { withFileTypes: true })` scan that, for each `isDirectory()` entry whose basename matches `^(\d{4})-`, extracts the captured group via `parseInt(..., 10)` with a `!Number.isNaN` guard and folds it into the same `highest` accumulator already used by the log scan. The dir scan is wrapped in its own `try/catch` that degrades to "no directory contribution" (contributes `0`) on any error, mirroring the existing log-read degrade. Both sources feed one `highest`, so the final `String(highest + 1).padStart(4, "0")` line is unchanged and the `max` semantics fall out naturally. The intact-log path (log max ≥ dir max) yields the identical id because the dir scan can only raise, never lower, `highest`. Resolve the open coverage-floor question by **adding** a `100`% floor for `src/engine/cycle-id.ts` (consistent with peer helpers; the new tests give full branch coverage) and recording it in CLAUDE.md.

## Failure & Resilience Decisions

**Task 1 — dir-scan in `allocateCycleId`** (filesystem read; subprocess/network: none):
- **Failure modes**: `docs/cycle/` missing or unreadable (`ENOENT`, `EACCES`, etc.) ⇒ the `readdir` rejects; caught at the dir-scan boundary and treated as `highestDir = 0` (no contribution). The log scan still runs and its result is returned. Malformed/non-matching basenames (non-4-digit prefix, non-numeric, files, `issues/`, `reports/`) are skipped by the `^(\d{4})-` regex + `isDirectory()` filter + `!Number.isNaN` guard, never raised. The function never throws; if both sources yield nothing it returns `"0001"`.
- **Idempotency**: N/A for state — read-only allocation, no files mutated, no subprocess spawned. Safe to re-run; the engine's step retry/restart re-invocation produces the same id for the same on-disk state.
- **Observability**: none added — consistent with the module's existing silent-degrade design. The allocated id first appears downstream via the caller's `cycle.start` log event. No new event surface is introduced (matches RESEARCH "Failure handling / Observability: none in this module").
- **No silent failure**: errors are swallowed *only* at the directory-scan boundary (the documented degrade); the overall allocation always completes and returns a valid 4-digit id. No error that should reach a caller is dropped — there is no caller-facing error contract here (the function's contract is "always returns a padded id"). A per-line/per-entry parse failure is the intended skip-and-continue, identical to the pre-existing log-parse guard.

**Tasks 2 & 3** (tests / config + doc edits): N/A — pure. Test files exercise behavior against real temp dirs; the coverage-floor and CLAUDE.md edits are static config/text with no runtime failure surface.

---

## Task 1: Fold highest `docs/cycle/NNNN-*` dir into `allocateCycleId`

### Overview
Add a bounded, fail-safe `docs/cycle/` directory scan and fold its highest 4-digit basename into the existing `highest` accumulator before the unchanged increment-and-pad return.

### Changes Required
**File**: `src/engine/cycle-id.ts`
**Changes**:
- Extend the import to add `readdir`: `import { readFile, readdir } from "node:fs/promises";`
- After the existing log-scan `try/catch` block and before the `return`, add the dir scan that contributes to the same `highest`:

```ts
try {
  const entries = await readdir(join(repoRoot, "docs/cycle"), { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = /^(\d{4})-/.exec(ent.name);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (!Number.isNaN(id) && id > highest) highest = id;
  }
} catch { /* no docs/cycle dir, or unreadable — log-derived id stands */ }

return String(highest + 1).padStart(4, "0");
```

- The log-scan block, the per-line parse guard, and the `String(highest + 1).padStart(4, "0")` return remain byte-for-byte except for the new block inserted before the return.

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck` — no warnings).
- [ ] `allocateCycleId` returns `max(highestDir, highestLogId) + 1` padded to 4 digits.
- [ ] Intact-log path (log max ≥ dir max) returns the identical id as before (dir scan can only raise `highest`).
- [ ] Failure paths behave as designed: a `readdir` rejection is caught at the dir-scan boundary, `highestDir` contributes `0`, the log-derived id is returned, and the function does not throw. No error swallowed outside the documented degrade boundary.

---

## Task 2: Unit-test coverage for dir-aware allocation

### Overview
Extend `tests/engine/cycle-id.test.ts` with the scenarios from the SPEC testing strategy, using the existing real-temp-dir pattern (no fs mocking).

### Changes Required
**File**: `tests/engine/cycle-id.test.ts`
**Changes**: Add tests (each: `mkdtemp` a `repoRoot`, populate, assert, `rm` in `finally`). A small helper to seed N `docs/cycle/NNNN-feature-x` dirs via `mkdir(..., { recursive: true })` keeps the cases terse.

- **Fresh checkout (dir-dominant, empty/absent log) ⇒ `"0259"`**: seed `docs/cycle/0001-…` … `0258-…`, no log (or empty `.cycle/log.jsonl`); assert `"0259"`.
- **Log-dominant common path unchanged ⇒ `"0301"`**: seed dirs up to `0258`, write a log whose max `cycle_id` is `0300`; assert `"0301"`.
- **Dir-dominant ⇒ `"0259"`**: log max `0050`, dirs up to `0258`; assert `"0259"`.
- **Failure-path, `docs/cycle/` absent ⇒ log-derived**: log max `0050`, no `docs/cycle/` dir; assert `"0051"` and that the call does not throw.
- **Non-matching entries ignored**: seed `docs/cycle/0010-feature-x/`, plus an `issues/` dir, a stray file `docs/cycle/cycle-notes.md`, and a 3-digit `docs/cycle/099-foo/`; empty log; assert `"0011"`.
- **Both sources empty ⇒ `"0001"`**: empty `.cycle/`, no `docs/cycle/`; assert `"0001"` (preserves existing behavior — may reuse/keep the existing "starts at 0001" test).
- **Empty/absent log, dirs present (missing-log branch)**: covered by the fresh-checkout case; ensure one variant uses a fully **absent** `.cycle/log.jsonl` and one uses an **empty** file to exercise both log-degrade entries.

> Use a moderate dir count (e.g. seed `0001`, `0050`, `0258` rather than all 258) where only the max matters, to keep test I/O cheap while still asserting `max` selection; use the full contiguous range only if a test specifically reads the SPEC's literal `0259` expectation — seeding just the highest dir (`0258`) plus a couple of lower ones is sufficient since only the maximum is selected.

### Success Criteria
- [ ] All new tests pass under `npm test` (`node:test`).
- [ ] Existing two tests still pass.
- [ ] Each failure mode named in Task 1 has a covering test (absent `docs/cycle/` ⇒ log-derived; non-matching/malformed entries skipped; both-empty ⇒ `"0001"`).
- [ ] No reliance on `mock.method` for `node:fs/promises` (real temp dirs only).

---

## Task 3: Register coverage floor and record it in CLAUDE.md

### Overview
Resolve the RESEARCH open question by adding a per-file coverage floor for `src/engine/cycle-id.ts` (decision: **add**, at `100`, consistent with peer engine helpers now that the new tests cover every branch) and recording it per the SPEC Documentation Updates note.

### Changes Required
**File**: `scripts/coverage-gate.mjs`
**Changes**: Add `"src/engine/cycle-id.ts"` to the `FLOORS` table at `100` (line/branch/function as the table shape requires), alongside the existing pinned helpers (`path-utils.ts`, `log-fmt.ts`, etc.).

**File**: `CLAUDE.md`
**Changes**: In the **Coverage policy** → **Per-file floors** list, add `src/engine/cycle-id.ts` (100%) to the enumerated set.

### Success Criteria
- [ ] `npm run test:coverage` passes, including the auto-run `npm run check:coverage` with the new floor enforced (no regression; `cycle-id.ts` meets 100%).
- [ ] `npm run check:invariants` passes unchanged.
- [ ] CLAUDE.md Per-file floors list includes `src/engine/cycle-id.ts`.
- [ ] If the new tests do not in fact reach 100% on every branch, add the missing-branch test rather than lowering the floor (fail loud, not silent).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] With `docs/cycle/` pre-seeded with dirs `0001-…` through `0258-…` and an empty (or absent) `.cycle/log.jsonl`, `allocateCycleId` returns `"0259"` (the user-observable benefit: fresh-checkout numbering no longer restarts at `0001`). | Task 1, Task 2 | Fresh-checkout dir-dominant test (both empty-file and absent-log variants). |
| [ ] With a log whose max `cycle_id` is `0300` and a `docs/cycle/` whose highest dir is `0258`, `allocateCycleId` returns `"0301"` (log-dominant common path unchanged). | Task 1, Task 2 | Log-dominant test. |
| [ ] With a log whose max is `0050` and a `docs/cycle/` whose highest dir is `0258`, `allocateCycleId` returns `"0259"` (dir-dominant path). | Task 1, Task 2 | Dir-dominant test. |
| [ ] **Failure-path**: when `docs/cycle/` does not exist (or `readdir` rejects), `allocateCycleId` does not throw and returns the log-derived id (e.g. log max `0050` ⇒ `"0051"`). | Task 1, Task 2 | Dir-scan `try/catch` degrade + absent-`docs/cycle/` test. |
| [ ] Non-matching entries under `docs/cycle/` (e.g. an `issues/` dir, a stray file, a `cycle-notes.md`) are ignored and do not affect the result. | Task 1, Task 2 | `isDirectory()` + `^(\d{4})-` filter; non-matching-entries test. |
| [ ] All existing tests still pass (`npm test`). | Task 1, Task 2, Task 3 | Full suite run; intact-log path unchanged. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck`). | Task 1 | `tsc --noEmit` clean. |

## Testing Strategy

### Unit Tests
- **Selection logic**: dir-dominant (`0259`), log-dominant (`0301`), tie/intact-log unchanged. Key edge cases: empty `docs/cycle/` vs. absent `docs/cycle/`; empty log file vs. absent log file (exercise both log-degrade entries and both dir-degrade outcomes).
- **Failure-path tests** (one per named failure mode):
  - Absent/unreadable `docs/cycle/` ⇒ `readdir` rejects ⇒ log-derived id, no throw (`0050` ⇒ `"0051"`).
  - Malformed/non-matching entries (`issues/`, stray file, 3-digit `099-foo/`) ⇒ skipped, do not affect result.
  - Both sources empty ⇒ `"0001"`.
- **Mocking strategy**: none — real temp dirs (`mkdtemp`/`mkdir`/`writeFile`, `finally` `rm`), per the repo rule that `node:fs/promises` cannot be `mock.method`-stubbed. The "unreadable" failure is exercised via an **absent** directory (clean, portable `ENOENT`) rather than a chmod-based permission trap, since the catch is error-agnostic (any error ⇒ contribute `0`) and absent-dir already drives that branch deterministically.

### Integration / E2E Tests
- None required (SPEC: "No UI changes; no E2E tests required"). The function is consumed verbatim by `src/cli.ts:716` and `src/engine/run-cycle.ts:370`; the preserved padded-string contract means no integration change is needed, and existing run-cycle/cli tests continue to pass as regression coverage.

## Risk Assessment
- **Intact-log behavior drift**: mitigated by folding into the same `highest` accumulator (dir scan can only raise, never lower) and the log-dominant regression test asserting the unchanged id.
- **Over-broad basename match (e.g. 5+ digits, or `0258` inside a longer run)**: mitigated by anchoring `^(\d{4})-` exactly and `parseInt` on the captured 4-digit group; >9999 is explicitly out of scope.
- **Coverage floor too strict (100%) blocking the build**: mitigated by the Task 2 test matrix covering every branch (both degrade catches, the `isDirectory`/regex/`NaN` skips, and the increment); if a branch is uncovered, add the test rather than lower the floor.
- **Counting `.` / non-directory siblings**: mitigated by the `ent.isDirectory()` guard before the regex, matching the established `readdir({ withFileTypes: true })` enumeration idiom.
