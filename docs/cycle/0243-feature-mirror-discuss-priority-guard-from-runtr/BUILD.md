All gates pass. `triage.ts` at 99.49% line coverage (≥95% floor). Overall: 98.69% lines, 92.44% branches, 93.36% functions — no regression vs baseline.

## Summary

Modified `src/engine/triage.ts` (+1 line): inserted `if (raw.fm.priority === "discuss") continue;` immediately after the `for (const raw of raws) {` loop opener in `dryRunTriage`, before the existing comment and `processRawWithRetry` call — mirroring the guard in `runTriage`.

Modified `tests/engine/triage-dry-run.test.ts` (+51 lines): extended `rawBody` helper with optional fourth parameter `priority?: string` (backward-compatible; all 11 existing call sites unaffected), then appended two new tests — "dryRun skips discuss-priority raw: returns empty reports, no agent call" (asserts `reports.length === 0`, `calls === 0`) and "dryRun mixed batch: discuss skipped, normal raw processed once" (asserts `reports.length === 1`, `reports[0].raw_id === "norm1"`, `reports[0].status === "ok"`, `calls === 1`).

Modified `docs/ENGINE.md` (+1 line, -1 line): replaced the "Known limitation" paragraph at line 21 with "Discuss routing in dry-run" paragraph accurately describing the post-fix behavior.

All tasks from PLAN.md complete (Tasks 1–4). `npm test` ran 712 tests, 0 failures. `npm run test:coverage` produced 98.69% lines / 92.44% branches / 93.36% functions; `triage.ts` at 99.49% (≥95% floor); all per-file floors and invariants passed. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/triage.ts
- tests/engine/triage-dry-run.test.ts
- docs/ENGINE.md
