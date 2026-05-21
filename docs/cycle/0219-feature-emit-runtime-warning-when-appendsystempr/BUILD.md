Zero errors.

## Summary

Modified `src/engine/run-cycle.ts` (+8 lines): extracted `appendSP` local variable from the inline ternary at the `mod.runStep` call site and inserted a conditional `log.emit("step.warning", { cycle_id, step, reason: "append_system_prompt_ignored", agent })` guard before `mod.runStep` fires when `appendSP` is set and `step.agent !== "claudecode"`.

Created `tests/engine/run-cycle.append-system-prompt-warning.test.ts` (+80 lines): integration-style test using real `runCycle` + fake `codex` binary on PATH with a `build` step workflow; asserts the `step.warning` event with `reason: "append_system_prompt_ignored"` and `agent: "codex"` appears in `log.jsonl`.

Both PLAN.md tasks complete. `npm test`: 648/648 pass (1 new). `npm run test:coverage`: Line 98.47%, Branch 92.44%, Function 92.95% — all global and per-file gates pass. `npm run typecheck`: zero errors. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.append-system-prompt-warning.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0218-argv-order-for-append-system-prompt-unas.md
- docs/cycle/issues/raw/refl-0218-non-claudecode-exec-modules-silently-ign.md
- docs/cycle/issues/todo/refl-0216-review-md-artifact-contaminated-despite.md
