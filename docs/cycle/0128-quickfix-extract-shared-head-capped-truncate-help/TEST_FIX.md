`log-fmt.ts`: 100% line, 100% branch, 100% function. All gates pass.

`★ Insight ─────────────────────────────────────`
Node 22's `--experimental-test-coverage` reports "all files" including test files themselves, making the aggregate look low (~81%). The `scripts/coverage-gate.mjs` LCOV check is the authoritative gate — it reads per-file line coverage from `.cycle/coverage.lcov` and applies per-file floors only to production source files.
`─────────────────────────────────────────────────`

**TEST_FIX.md summary:**

Tests `truncateHeadCapped head-caps at max with trailing ellipsis`, `truncateHeadCapped passes through short input unchanged`, `truncateHeadCapped boundary: exact max is unchanged`, and `truncateHeadCapped boundary: max+1 truncates to max with ellipsis` (new) all pass in `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` after the fix extracted `truncateHeadCapped` from `src/engine/log-fmt.ts` and removed the duplicate `truncateStepEndStderr` from `run-cycle.ts` and the inline `truncate`/`MAX_ERR_LEN` from `triage.ts`. Full suite: **462/462 pass**. Coverage: `log-fmt.ts` hits 100% line / 100% branch / 100% function; all per-file floors pass (triage ≥95%, issue-lifecycle ≥95%, commit-cycle ≥95%, branch ≥90%, stale-dist ≥95%, run-one ≥70%) — no regression from baseline.
