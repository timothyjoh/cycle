All gates green. Writing the build summary.

## Summary

This cycle extracts the triplicated terminal-failure bookkeeping from the `src/cli.ts` supervisor loop into a single pure helper, exactly per PLAN.md. A new module `src/engine/halt-accounting.ts` (44 lines) exports the `HaltContext` type and the pure, side-effect-free `recordTerminalFailure(prev, opts)` function, which increments `consecutiveFailures`, appends `cycleId` to a **new** `failedCycles` array (never mutating the input), records `lastHaltContext`, resets the fast-fail counter to `{ key: null, count: 0 }`, and returns a `{ halt }` decision computed against `maxConsecutiveFailures`. `src/cli.ts` was modified (+31/−19): the local `HaltContext` type definition was removed and the type is now imported from the new module; the commit-failure, fast-bail, and budget-exhausted branches each now call `recordTerminalFailure`, reassign their five loop `let` variables from the result, and act on `acct.halt` to set `halted`/`haltReason`/`activeCycleId = undefined`/`break` — all control flow (and each `await terminalDrain(...)`, plus the fast-bail `step.warning` emit) stays visible at the call site. The out-of-scope resume-block copy (`src/cli.ts:439-447`, no fast-fail reset/no inline break), the success-path reset, the retry-drain, and the triage halt were left untouched (one `failedCycles.push` remains, in the resume block, as expected).

PLAN.md tasks completed: Task 1 (pure helper + `HaltContext` move), Task 2 (all three branches rewired), Task 3 (unit tests), and Task 4 (coverage floor + CLAUDE.md docs). All four are done.

Tests added: `tests/engine/halt-accounting.test.ts` (108 lines, 7 `node:test` cases) covering per-path increment/append-by-one across all three paths, input-array immutability (frozen-array non-mutation + distinct return reference), `lastHaltContext` field correctness for `"commit"` / resolved-step / `undefined`, fastFail reset for every input, the halt boundary at threshold 2 (first call no-halt, second halts), below-threshold no-halt (threshold 3), and threshold-1 immediate halt.

Full test suite: `npm test` → **EXIT 0, 824 tests, 824 pass, 0 fail**. Coverage command: `npm run test:coverage` → **EXIT 0**; `src/engine/halt-accounting.ts` reports line 100.00% / branch 100.00% / funcs 100.00%, and the per-file coverage gate plus structural invariants both pass (`coverage-gate: ok — src/engine/halt-accounting.ts 100.00% ≥ 100%`). Every existing per-file floor (triage 99.75%, issue-lifecycle 100%, commit-cycle 99.55%, run-cycle 99.65%, etc.) still passes — no regression. `npm run typecheck` → no warnings.

Failure modes handled: the helper is pure with no I/O and therefore no failure surface to swallow — it returns its halt decision rather than hiding control flow, so a wrong-cardinality halt would surface as a test failure (the below-threshold no-halt case and the at-threshold halt case both pin this). The pre-existing fallible operations (`terminalDrain`, `log.emit`) remain awaited at each call site with their rejection-propagation behavior unchanged; no new `try/catch` was introduced and no error is swallowed. Idempotency is preserved: bookkeeping is in-process state guarded by the engine PID lockfile, and the array-copy semantics (`[...prev, cycleId]` + caller reassignment) match the established success-path reassignment pattern, so there is no aliasing or double-count risk.

Coverage-gate fixture sync: adding `src/engine/halt-accounting.ts` to the `FLOORS` table in `scripts/coverage-gate.mjs` initially broke three fixture-driven tests in `tests/scripts/coverage-gate.test.ts` (their hand-maintained LCOV fixtures enumerate every floored path and lacked the new block). I added the matching `halt-accounting` block to all three affected fixtures (`ALL_PASSING`, the below-floor fixture, and the absolute-path array). This is a necessary keep-in-sync edit, not scope creep — the same drift the helper extraction is meant to eliminate at the source level.

Deviations from PLAN.md: none of substance. The only addition beyond the plan's enumerated file list was the required `tests/scripts/coverage-gate.test.ts` fixture sync described above, which the plan implied by adding the new FLOORS entry but did not call out explicitly.

Deferred work / follow-up notes: none. The optional `docs/ENGINE.md` note and the optional structural-invariant for "exactly one terminal-failure bookkeeping implementation" were not added (SPEC marked both optional); a future cycle could register such an invariant in `scripts/structural-invariants.mjs` to lock in the de-duplication mechanically.

## Touched Files
- src/engine/halt-accounting.ts
- src/cli.ts
- tests/engine/halt-accounting.test.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
