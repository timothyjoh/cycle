All new tests pass. Final verification — typecheck was clean, coverage gates all green. The build (via pretest) succeeded.

## Summary

Implemented per-step and per-workflow `timeout_ms` override as a pure config-resolution change layered over the existing `engine.step_timeout_ms` default. Modified `src/engine/workflow.ts` (+27 lines): added an optional `timeout_ms?: number` to both the `Step` and `Workflow` types, added the exported pure helper `resolveStepTimeoutMs(stepTimeout, workflowTimeout, engineTimeout)` (with an internal `coerceTimeout` accepting only positive integers), and wired it into the existing per-step resolution loop in `loadConfig` so each concrete `step.timeout_ms` holds the effective `step ?? workflow ?? engine` value. Modified `src/engine/run-cycle.ts` (2 lines): the agent-step spawn now passes `timeoutMs: step.timeout_ms` and `step.timeout` reports `limit_ms: step.timeout_ms ?? null` — replacing the two direct `cfg.engine.step_timeout_ms` reads. This completes PLAN.md Tasks 1, 2, and 3; the SIGTERM→SIGKILL kill-tree, 5s grace, `result.timedOut` marking, `formatTimeoutProofError`, and `step.timeout_salvaged` are all reused byte-for-byte.

Created `tests/engine/workflow-timeout.test.ts` (210 lines): direct pure-helper tests across the precedence/failure matrix plus end-to-end `loadConfig` tests for step-beats-workflow-beats-engine, regression (`step.timeout_ms === engine.step_timeout_ms` when no override; `undefined` when engine absent), and malformed/non-positive/non-integer/string values falling through without throwing. Extended `tests/engine/run-cycle.completion-proof.test.ts` (+72 lines): generalized the `workflowYml`/`setupRepo` helpers to emit step-level and workflow-level `timeout_ms`, and added two integration tests proving a short step-level (and separately, workflow-level) `timeout_ms` of 200ms — against a 100s engine default and a hung `sleep 30` fake agent — observably kills the step with `step.timeout.limit_ms` equal to the resolved override value (cardinality-pinned `filter(...).length === 1`).

Updated `CLAUDE.md` (config bullet documenting the override, resolution order, and defensive-ignore behavior) and `docs/ENGINE.md` (new *Step timeout resolution* section). README.md unchanged per SPEC.

Test command: `npm test` → **1122 tests, 1122 pass, 0 fail**. Coverage command: `npm run test:coverage` → all per-file floors pass (notably `src/engine/run-cycle.ts` 100.00% ≥ 90%; global gates green); `npm run typecheck` clean; structural invariants all ok. No coverage regressions.

Failure modes handled: (1) malformed/non-positive `timeout_ms` at step or workflow level (non-number / non-integer / `0` / negative / `NaN` / `Infinity` / string) — `coerceTimeout` returns `undefined` and the value silently falls through to the next level per SPEC, never throwing and never arming a zero/negative timer (covered by `loadConfig: malformed step…`, `…malformed step AND workflow…`, `…string timeout_ms…`, and the helper's `malformed/non-positive…` matrix test); (2) the resolved engine-level value passed through un-coerced so the no-override path is byte-for-byte unchanged (covered by the regression test); (3) a resolved short timeout reached at runtime routes through the unchanged fatal timeout path with an observable `step.timeout` event (covered by both integration tests). No errors swallowed beyond the SPEC-mandated intentional fall-through.

No deviations from PLAN.md. No deferred work — idle/stall detection and bash-step timeouts remain explicitly out of scope per SPEC.

## Touched Files
- src/engine/workflow.ts
- src/engine/run-cycle.ts
- tests/engine/workflow-timeout.test.ts
- tests/engine/run-cycle.completion-proof.test.ts
- CLAUDE.md
- docs/ENGINE.md
