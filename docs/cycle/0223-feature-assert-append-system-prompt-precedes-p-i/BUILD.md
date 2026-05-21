The ordering assertion was already implemented in a prior session (lines 70-74 of `tests/engine/exec-claudecode.test.ts`). The file is clean and all quality gates pass.

## Summary

The ordering assertion `argv.indexOf("--append-system-prompt") < argv.indexOf("-p")` was already present in `tests/engine/exec-claudecode.test.ts` at lines 70-74 from a prior session. No code changes were required this session — the implementation matched PLAN.md exactly. Task 1 is complete.

Test suite: `npm test` — 659/659 pass, 0 failures.

Coverage (`npm run test:coverage`): Line 98.53%, Branch 92.53%, Function 92.95% — all exceed baselines (95%/75%/90%) and all per-file floors pass. No regression.

No deviations from PLAN.md. No deferred work.

## Touched Files

```
tests/engine/exec-claudecode.test.ts
```
