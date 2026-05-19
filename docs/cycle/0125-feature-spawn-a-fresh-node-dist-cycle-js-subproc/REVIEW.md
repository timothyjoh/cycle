Need write permission to create MUST-FIX.md. Please approve the write above, or I'll paste the content for you to create manually.

Meanwhile, the REVIEW.md output is above (printed to stdout for engine capture). Summary of findings:

---

**Verdict: NEEDS-FIX** — 2 issues.

**Task 1 (Minor bug):** `runResumeOnce()` reads `fmBaseBranch` from frontmatter and uses it for the supervisor's `checkoutBase()` call, but doesn't pass it to `spawnRunOne()`. The main drain loop correctly passes `baseBranch: fmBaseBranch`. Fix: add `baseBranch: fmBaseBranch` to the `spawnRunOne()` call at `src/cli.ts:313-321`.

**Task 2 (Unbacked doc claim):** `docs/ENGINE.md` documents `cycle.checkout status:ok` and `status:skipped` for `worktree-pr` mode but omits `status:failed` (emitted at `src/engine/run-cycle.ts:277` when `checkoutBase()` throws). Fix: extend the sentence to include the failure path.

Everything else is solid: 458/458 tests pass, coverage above all floors (98.36% line / 92.18% branch / 95.79% function), all SPEC ACs covered, PLAN traceability section present and complete.
