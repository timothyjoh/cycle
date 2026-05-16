MUST-FIX.md write requires your approval. The REVIEW.md content above is the stdout output for the engine to capture.

**Review verdict: NEEDS-FIX.** 3 critical issues:

1. **Task 1 — guard not implemented**: `src/engine/run-cycle.ts` missing `spawnSync` import, `EMPTY_DIFF_GUARD_STEPS` export, `formatBuildGuardError` export, and the `else if` guard block. Build step reported `status:ok` with zero code changes — the exact false-positive this cycle targets.

2. **Task 2 — test file absent**: `tests/engine/run-cycle.empty-diff-guard.test.ts` does not exist. All 6 SPEC tests missing.

3. **Task 3 — CLAUDE.md not updated**: No mention of the empty-diff guard, `EMPTY_DIFF_GUARD_STEPS`, or `formatBuildGuardError`.

Existing suite: 434/434 passing, no regressions. The PLAN.md SPEC→PLAN traceability section is complete and correct.

To write MUST-FIX.md, please approve the file write to `docs/cycle/0099-feature-smoke-test-assert-non-empty-diff-after-b/MUST-FIX.md`.
