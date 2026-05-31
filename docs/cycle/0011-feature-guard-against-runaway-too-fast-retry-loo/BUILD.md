## Summary

This cycle's three coordinated changes (config key, per-step `duration_ms` emission, supervisor iteration-too-fast guard) were already implemented in the working tree from the prior attempt; this pass completed the three SPEC-named test gaps that the review recorded in `MUST-FIX.md` and hardened the supervisor guard into a directly unit-testable shape, with no behavior change.

To make the guard's failing-step/`duration_ms` log reader and its counter transition testable in isolation (the `src/cli.ts` supervisor is a top-level script that executes on import and therefore cannot be imported by a unit test), I extracted both into a new side-effect-free module `src/engine/iteration-guard.ts` (~100 lines): `readCycleEndFailure(repoRoot, cycleId)` (the bottom-up log-tail read, moved verbatim from `cli.ts`, returning `{ failingStep, durationMs }`; missing/unreadable/non-numeric ⇒ `undefined`) and a new pure `advanceFastFailCounter(prev, opts)` state transition that encapsulates the increment/reset/`fastBail` decision. `src/cli.ts` now imports both: the inline `readCycleEndFailure` (~48 lines) was deleted and the hand-rolled counter mutation in the exec-failure branch (~18 lines) was replaced by a single `advanceFastFailCounter(...)` call assigning back into the existing module-level `fastFailKey`/`fastFailCount` state — net reduction in `cli.ts`, identical runtime behavior (the two existing callers, the main loop and the out-of-scope resume path's `.failingStep`, were repointed to the imported reader).

Tests added/extended for the three MUST-FIX items: new `tests/engine/iteration-guard.test.ts` (11 tests) covers MUST-FIX Task 1 (counter reset on a *different* failing step never reaches `K`; reset on `≥`-threshold, unreadable, undefined-step, and guard-disabled inputs; same-step increment to `K=2` ⇒ `fastBail`) and MUST-FIX Task 2 (`readCycleEndFailure` returns `durationMs: undefined` for absent and non-numeric `duration_ms`, and `{ undefined, undefined }` for an unreadable log). For MUST-FIX Task 3, `tests/engine/run-cycle.step-end-duration.test.ts` gained a `skip_unless`-miss case asserting the `status:"skipped"` `step.end` carries an integer `duration_ms ≥ 0` (injected `nowFn` ⇒ exact `33`). The prior build's `tests/cli/iteration-too-fast.test.ts` (5 integration tests) and the existing duration tests are unchanged and still pass.

**Tests / coverage.** Full suite `npm test` → **812 passed, 0 failed**. `npm run test:coverage` → exit 0; every per-file floor green (`src/engine/run-cycle.ts` **99.63%** line ≥ 90%; `src/cli/run-one.ts` 73.96% ≥ 70%; the 100% floors all hold) and `npm run check:invariants` clean — no regression. `npm run typecheck` clean, no warnings. The new `src/engine/iteration-guard.ts` is fully exercised by its unit test; `src/cli.ts` has no per-file floor and its supervisor branch remains covered by the spawned-binary integration tests.

**Config / sync.** `engine.min_step_duration_ms: 2000` is present in `EngineConfig` (`src/engine/workflow.ts:40`), `src/defaults/workflows.yml:8`, and (after `npm run sync-defaults`) `.cycle/workflows.yml:8`; the two YAML engine blocks are byte-identical.

**Failure modes handled / tested.** *Malformed/absent/0/negative/non-finite config* → resolved to `thresholdMs = 0` (guard disabled) at the supervisor read site via `Number.isFinite && > 0`; the supervisor never throws — covered by the `0` and `"abc"` integration tests plus the guard-disabled unit test. *Unreadable/absent/non-numeric `duration_ms`* → reader returns `durationMs: undefined`, `advanceFastFailCounter` treats the attempt as not sub-threshold and resets the counter (degrade to normal count-based retry, never a spurious bail) — covered by the reader and counter unit tests. *Different failing step within a retrying cycle* → distinct key resets the counter to 1, so two different-step sub-threshold failures never reach `K` — covered by the new different-step unit test. *Non-monotonic clock* → `Math.max(0, Math.round(...))` clamps `duration_ms` to a non-negative integer — covered by the clamp test. *No silent termination* → the fast-bail still emits exactly one `step.warning { reason: "iteration_too_fast" }` before `terminalDrain` (cardinality-pinned in the integration test).

**Deviations from PLAN.** PLAN Task 3 kept `readCycleEndFailure` and the counter logic inline in `cli.ts`; to satisfy the review's MUST-FIX intent ("requires exporting `readCycleEndFailure` from `src/cli.ts` for a direct unit test") given that `cli.ts` runs on import, I extracted them into `src/engine/iteration-guard.ts` instead of exporting from the entry script. Behavior is unchanged; a one-line architecture note for the new module was added to CLAUDE.md.

**Deferred / follow-up.** None. All three MUST-FIX items are now covered by tests; no production defect was found, and the prior build's `README.md` / `docs/ENGINE.md` documentation remains accurate (no new user-facing surface beyond what is already documented).

## Touched Files
- src/engine/workflow.ts
- src/engine/run-cycle.ts
- src/cli.ts
- src/engine/iteration-guard.ts
- src/defaults/workflows.yml
- .cycle/workflows.yml
- tests/cli/iteration-too-fast.test.ts
- tests/engine/run-cycle.step-end-duration.test.ts
- tests/engine/iteration-guard.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
- docs/ARCHITECTURE.md
