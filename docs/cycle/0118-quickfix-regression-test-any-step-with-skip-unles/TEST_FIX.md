All data collected. Here's the summary for TEST_FIX.md:

---

Three regression tests in `tests/engine/run-cycle.skip-unless.test.ts` cover the `skip_unless` contract: (1) `"skip_unless: fix step skipped when MUST-FIX.md absent"` — verifies `runCycle` emits `step.end {status:"skipped", reason:"skip_unless_artifact_missing"}` and no `step.start` when the guard artifact is missing; (2) `"skip_unless: fix step runs when MUST-FIX.md present"` — verifies the step executes normally when the artifact exists; (3) `"skip_unless resume: step.end status:skipped counts as completed in parseLogTail"` — verifies `parseLogTail` counts skipped steps in `completedSteps` for resume purposes. Full suite: **440/440 pass, 0 fail**. Coverage: Lines 99.2% (2749/2772), Branches 92.4% (800/866), Functions 97.2% (176/181) — all above project floors (≥95% line, ≥75% branch, ≥90% function). `run-cycle.ts` hits 100% line coverage (289/289); `log-tail.ts` hits 98.2% (112/114). No regressions.
