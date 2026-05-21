# Review: Cycle 0246

## Overall Verdict

PASS — no fixes needed

## Code Quality Review

### Summary

Single targeted edit to `tests/cli/engine-lock-integration.test.ts`. The `waitForAbsence` helper is well-shaped, follows the existing `waitForLock` polling convention, and the SIGTERM test replacement is clean. All quality gates pass.

### Findings

1. **Pre-existing typecheck error (not introduced)**: `src/cli.ts:241` has a TS2345 error on `CYCLE_TRUNK_BASED` type — confirmed pre-existing from the `ad669f5` commit, not introduced by this cycle. No action required.

2. **SIGINT and stale-lock tests retain bare pattern**: Lines 216–222 (SIGINT) and 99–105 (stale-lock) still use the racy `readFile`/`lockExists` approach. Both are explicitly out of scope per SPEC; noted for awareness only.

### Spec Compliance Checklist

- [x] `waitForAbsence` defined in `tests/cli/engine-lock-integration.test.ts` with `timeout` and `interval` options — `tests/cli/engine-lock-integration.test.ts:171`
- [x] Lines 235–241 bare `readFile`/`lockExists` block replaced with `await waitForAbsence(lockPath)` — `tests/cli/engine-lock-integration.test.ts:254`
- [x] No fixed `setTimeout`/sleep in SIGTERM lock-absence assertion path — the `setTimeout` inside `waitForAbsence` is the poll sleep, not a fixed delay
- [x] `npm test` passes with zero failures — 713/713
- [x] `npm run check:coverage` passes with `engine-lock.ts` at 100% line coverage — confirmed 100.00%
- [x] `npm run check:invariants` passes — all 4 invariants OK
- [x] PLAN.md includes `## SPEC Acceptance Traceability` section covering all 7 SPEC AC bullets

## Adversarial Test Review

### Summary

Test quality is adequate. The helper is a test utility, not production code, so absence of unit tests for `waitForAbsence`'s own edge paths (timeout expiry, non-ENOENT propagation) is acceptable per PLAN.md's explicit reasoning. The SIGTERM integration test exercises the success path end-to-end.

### Findings

1. **Timeout and non-ENOENT paths untested**: `waitForAbsence`'s timeout-expiry branch (the final `throw`) and the non-ENOENT re-throw branch are not directly exercised by any test. This is accepted because `waitForAbsence` is a test helper. If promoted to shared infrastructure, these would need coverage.

2. **`waitForLock` uses `readFile` not `stat`**: Minor inconsistency with the new helper, which uses `stat` for efficiency. Not a problem, just a style asymmetry in pre-existing code.

3. **Assertion quality after `waitForAbsence`**: Replacing `assert.equal(lockExists, false, ...)` with `await waitForAbsence(lockPath)` means a pass is implicit (no exception = lock absent). The error message on failure (`waitForAbsence: <path> still present after 2000 ms`) is descriptive. Adequate.

### Test Coverage

- Command run: `npm run test:coverage`
- Line / branch / function: 98.75% / 92.54% / 93.36% (all files)
- `engine-lock.ts` specifically: 100.00% line / 100.00% branch / 66.67% function
- Regressions vs base (per-file): none — `engine-lock.ts` holds at 100% line; 66.67% function is pre-existing (two exported functions, one not exercised by unit tests, covered by integration test path)
- New code without tests: `waitForAbsence` is a test helper — no production code added
- Specific scenarios missing tests: timeout-expiry throw and non-ENOENT propagation in `waitForAbsence`, both accepted as test-helper exemptions

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
