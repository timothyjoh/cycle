## Fix Cycle Summary

Addressed all 5 MUST-FIX tasks for cycle 0016:

- **Task 1 (Critical, SPEC.md empty):** Regenerated 103-line `SPEC.md` from RFC-001 §§ 10–12 + BB-5 title. Enumerates 6 numbered requirements (detection, base refresh, first-incomplete-step re-run, per-step restart tolerance, new events/warning reasons, fall-through) plus explicit non-goals. `wc -l` = 103; all 4 event/reason names found.
- **Task 2 (resume → fail drain paths):** Added 2 integration tests to `tests/cli/resume.test.ts` — retry-drain (attempt:0 build fail → row pending/attempt:1) and terminal-drain (attempt:2 build fail → file → failed/ with frontmatter stamps).
- **Task 3 (`resume_workflow_missing`):** Added test with log workflow `"ghost"` and `workflows.yml` only defining `feature` — asserts warning emitted, no resume events. Extended `seedTodo` helper with `includeWorkflowInFrontmatter` opt to suppress the frontmatter override.
- **Task 4 (row-mismatch sub-cases):** Added 2 tests covering `status:"pending"` and `cycle_id:"9999"` mismatch branches. With the existing missing-row test, all 3 mismatch sub-branches now exercised.
- **Task 5 (extract `runResumeOnce` + drain helpers):** Extracted `drainSuccess`, `drainRetry`, and `runResumeOnce` into `src/cli.ts`. Pop loop now shares the drain helpers. All early returns in `runResumeOnce` sit at depth 1 — no nested `if` chains, no duplicated drain bodies. Behavior unchanged; verified by all 10 resume tests passing pre- and post-refactor. Deviation: predicted -30 line drop didn't materialize (net +26 lines due to typed helper signatures); maintainability goals nonetheless achieved.

**Final test suite:** 204/204 pass. **Final coverage:** line 96.28% / branch 88.29% / function 95.19% — identical to BUILD.md pre-fix baseline (96.28 / 88.29 / 95.19), zero per-file regressions, all 3 baselines (95 / 75 / 90) exceeded. No tasks failed.
