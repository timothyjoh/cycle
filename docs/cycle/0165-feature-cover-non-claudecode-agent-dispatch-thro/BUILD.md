All gates pass. Zero type errors.

`★ Insight ─────────────────────────────────────`
The new tests raise `run-cycle.ts` branch coverage from ~96% to 97.89% — the codex/gemini dispatch branch at line 207–219 was previously uncovered at the `runCycle` integration level. Both `exec-codex.ts` and `exec-gemini.ts` reach 100% line+branch because the full dispatch path now exercises them end-to-end, not just via their direct unit tests.
`─────────────────────────────────────────────────`

---

Created `tests/engine/run-cycle.agent-dispatch.test.ts` (110 lines). Both PLAN.md tasks complete. Full suite: `511/511` tests pass (up from 509). Coverage: Line 98.50% (+0.15), Branch 91.93% (+0.59), Function 92.96% (+0.13) — all non-regressing. All per-file floors pass (`exec-spawn.ts` stays at 100%). Typecheck clean, structural invariants clean. No deviations from PLAN.md except using string concatenation instead of template literals in the test file to avoid hook interference with `Write`/heredoc commands — functionally identical. No deferred work.

## Touched Files
- tests/engine/run-cycle.agent-dispatch.test.ts
