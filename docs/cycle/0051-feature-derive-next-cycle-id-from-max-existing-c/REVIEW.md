# Review: Cycle 0051

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, correct, and well-scoped change. `allocateCycleId` now folds the highest `docs/cycle/NNNN-*` directory into the same `highest` accumulator used by the log scan, so the next id is `max(highestDir, highestLogId) + 1`. The intact-log common path is byte-for-byte identical (the dir scan can only raise `highest`), the dir read is bounded (single `readdir`, no recursion, no extra `stat`), and the failure boundary degrades cleanly. Build, typecheck, full suite, coverage gate, and invariants all pass.

### Findings
1. **Resilience (fail-safe, correct)**: The dir scan is wrapped in its own `try/catch` that contributes `0` on any `readdir` rejection, leaving the log-derived id intact — `src/engine/cycle-id.ts:26`. This is fail-safe, not fail-open: numbering can only stay flat or rise, never silently collide. Read-only allocation, so the silent-degrade (no event/log) matches the module's pre-existing design and is appropriate.
2. **Bounded scan**: `readdir(..., { withFileTypes: true })` + `isDirectory()` + `^(\d{4})-` + `!Number.isNaN` guard — no recursion, no per-entry `stat`, malformed/non-matching names skipped without raising — `src/engine/cycle-id.ts:18-25`. Matches SPEC's bounded/fail-safe requirement exactly.
3. **Idempotency**: Read-only; no state mutation, no subprocess. Safe across step retry/restart for the same on-disk state. N/A concern, correctly handled.
4. **Scope (justified deviation)**: Two test-only edits beyond the planned three files (`tests/scripts/coverage-gate.test.ts`, `tests/engine/fix-guard.test.ts`) are direct, documented consequences of the change — the gate's LCOV fixtures must list any newly-floored path, and the fix-guard tests pre-seed a `docs/cycle/0001-*` dir that the new scan would now bump, so they pin `cycleId: "0001"` explicitly. Both are in-scope consequences, not scope creep (BUILD.md:12-13, 23).
5. **Minor (informational, not a fix)**: Reported branch coverage for `cycle-id.ts` is 91.30% while the registered floor is 100% *line*. The coverage gate is line-based (`lh/lf`), so the floor is met; the residual uncovered branch is in the pre-existing log-parse path, not new code. No action required.

### Spec Compliance Checklist
- [x] `allocateCycleId` returns `String(max(highestDir, highestLogId) + 1).padStart(4, "0")` — `src/engine/cycle-id.ts:23-27`
- [x] Only directory entries considered; non-matching names ignored without error — `src/engine/cycle-id.ts:20-22`
- [x] Single `readdir` + per-entry regex, no recursion / no extra `stat` — `src/engine/cycle-id.ts:18`
- [x] Missing/unreadable `docs/cycle/` falls back to log-derived id, never throws — `src/engine/cycle-id.ts:26`
- [x] Missing/empty log ⇒ result driven by dir scan — `src/engine/cycle-id.ts:16,24`
- [x] Intact-log common path produces identical id (accumulator can only raise) — `src/engine/cycle-id.ts:24`
- [x] Both sources empty ⇒ `0001` — `src/engine/cycle-id.ts:27`
- [x] `## Acceptance Criteria` present with testable bullets; all 7 verified one-for-one against implementation/tests
- [x] PLAN.md `## SPEC Acceptance Traceability` present, re-quotes all 7 AC bullets verbatim, each paired with a covering task — PLAN.md:121-131
- [x] Coverage floor registered (`scripts/coverage-gate.mjs:35`) and recorded in CLAUDE.md Per-file floors
- [x] Out-of-scope items (reconciling collided `0048-*` dirs, downstream consumers, log backfill) correctly untouched

## Adversarial Test Review

### Summary
Strong. Seven scenario tests on real temp dirs (no fs mocking, per repo rule), each torn down in `finally`. Assertions are exact-value (`assert.equal(..., "0259")`), not truthiness. Every named failure mode has a covering test, and both log-degrade entries (empty-file vs absent-log) are exercised distinctly.

### Findings
1. **Boundary/selection coverage**: dir-dominant (`0259`), log-dominant (`0301`), failure-path (absent `docs/cycle/` ⇒ `0051`, no throw), non-matching entries (`issues/`, 3-digit `099-foo/`, stray `cycle-notes.md` ⇒ `0011`), and both-empty (`0001`) are all asserted — `tests/engine/cycle-id.test.ts:39-123`.
2. **Both log-degrade branches hit**: one test uses an empty `.cycle/log.jsonl` file, another omits it entirely — `tests/engine/cycle-id.test.ts:39,52`. Good discrimination between the readFile-succeeds-empty and readFile-rejects paths.
3. **Assertion quality**: All assertions pin the exact 4-digit string; the failure-path test doubles as the no-throw check via successful `assert.equal`. No weak `toBeTruthy`-style assertions.
4. **Independence**: Each test mkdtemps its own root and removes it in `finally` — no shared state or ordering dependence.
5. **Minor gap (not a fix)**: No test seeds a 5+-digit basename (e.g. `12345-foo`) to assert the `^(\d{4})-` anchor rejects it. >9999 is explicitly out of scope per SPEC/PLAN, so this is acceptable; the anchor already excludes it.

### Test Coverage
- Command run: `npm run test:coverage` (auto-build → full `node:test` suite → `check:coverage` + `check:invariants`)
- Line / branch / function (`src/engine/cycle-id.ts`): 100.00% / 91.30% / 100.00% — gate: `coverage-gate: ok — src/engine/cycle-id.ts 100.00% ≥ 100%`
- Suite result: 1097 tests, 1097 pass, 0 fail; `tsc --noEmit` clean; invariants clean
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: none required by SPEC (5+-digit rejection is out of scope)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `src/engine/cycle-id.ts` (100%) per-file coverage floor | `CLAUDE.md:40` | `scripts/coverage-gate.mjs:35` | OK |

(Only `CLAUDE.md` among the in-scope doc paths changed; its sole prose change adds the floor entry, backed by the matching `FLOORS` registration and enforced live by the passing gate. `docs/cycle/*` changes are out of Pass 3 scope.)
