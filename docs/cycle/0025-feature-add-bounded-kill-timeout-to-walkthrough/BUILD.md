All quality gates pass. The per-file coverage gate (`npm run check:coverage`, run automatically after `test:coverage`) reports every floor met, including the SPEC-targeted `src/engine/walkthrough.ts` at 100% (floor 95%) and `src/engine/run-cycle.ts` at 100% (floor 90%); the aggregate lcov branch coverage is 87.49% (floor 75%). The low aggregate line/function figures reflect lcov including test-helper files — the authoritative per-file gate is green and structural invariants pass.

## Summary

This cycle gave `execWalkthroughHook` a config-gated, bounded-kill wall-clock timeout that mirrors the SIGTERM→SIGKILL escalation in `src/engine/exec-spawn.ts`, so a hung end-of-`feature` walkthrough hook fails-and-moves-on instead of stalling the engine indefinitely.

**Files modified:**
- `src/engine/walkthrough.ts` (+~55 lines): added exported `WALKTHROUGH_KILL_GRACE_MS` (5000), `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS` (600000, documented-but-not-auto-applied), the injectable `WalkthroughTimer` seam + `defaultTimer`, and an optional 4th `{ timeoutMs, timer }` options arg on `execWalkthroughHook`. The spawn now uses `detached: true` (own process group) and adds a `settled`/`done()` single-resolve guard, a `killTree(sig)` process-group kill with a `child.kill` fallback in nested try/catch, an arm-only-when-positive timeout, the SIGTERM→SIGKILL grace escalation, and a `timedOut` close-shape branch. The spawn-error `stderr + String(err)` shape is preserved verbatim (regression contract).
- `src/engine/workflow.ts` (+7 lines): added the optional `walkthrough_hook_timeout_ms?: number` field to `EngineConfig`.
- `src/engine/run-cycle.ts` (+~17 lines): added `formatWalkthroughTimeoutError(stepName, exitCode)`; in the `walkthrough_capture` intercept, defensively coerced `cfg.engine.walkthrough_hook_timeout_ms` (valid positive integer arms; `0`/negative/non-integer/`NaN`/`Infinity`/non-number/absent ⇒ `0`/disabled, matching the `max_rate_limit_retries` convention), passed `{ timeoutMs }` into the spawn, and branched the fatal `step.end.stderr` on `wr.timedOut` to carry timeout-specific wording referencing the actual exit code. `exit_code`, `duration_ms`, `cycle.end`, and the return shape are unchanged.
- `tests/engine/walkthrough.test.ts` (+~115 lines): five new unit tests — timer-armed-but-fast-hook (ok, no `timedOut`, no kill), SIGTERM→SIGKILL escalation against a `trap '' TERM; sleep 30` hook with an injected synchronous timer (proves SIGTERM-alone leaves the promise pending, SIGKILL resolves `{ failed, timedOut: true }`), disabled-guard (`timeoutMs: 0` and omitted opts arm no timer; slow hook completes), the killTree already-gone fallback (stale timeout/grace callbacks fired after resolve exercise both kill catch branches without double-resolving), and a default-constant assertion.
- `tests/engine/run-cycle.walkthrough.test.ts` (+~85 lines): three new integration tests — timeout fatal-routing (a `sleep 30` hook + `walkthrough_hook_timeout_ms: 100` ⇒ `step.end { failed }` precedes the single `cycle.end { failed, failing_step: "walkthrough_capture" }`, timeout-specific stderr, `runCycle` returns `{ status: "failed", failingStep: "walkthrough_capture" }`), disabled-when-absent (a 0.3s hook with no config runs to completion, media still collected), and non-integer coercion (`1.5` ⇒ disabled, slow hook completes ok).
- `docs/ENGINE.md`: replaced the *Walkthrough capture* "Known limitation" paragraph (which named a "future" config) with the implemented bounded-kill behavior, config, coercion rule, default, escalation, fatal routing, and no-partial-media-salvage note.
- `CLAUDE.md`: added the `engine.walkthrough_hook_timeout_ms` bullet to the *Workflow defaults* `engine.*` list and extended the `src/engine/walkthrough.ts` architecture note.

**PLAN.md tasks complete:** Task 1 (timeout + injectable timer seam on `execWalkthroughHook`), Task 2 (read-site coercion + timeout-specific fatal routing), and Task 3 (documentation) — all complete.

**Test suite:** `npm test` → 912 tests, 912 pass, 0 fail. `npm run typecheck` → clean, no warnings.

**Coverage:** `npm run test:coverage` (which chains `npm run check:coverage` + `npm run check:invariants`) → all per-file floors met, including `src/engine/walkthrough.ts` 100.00% (≥ 95%), `src/engine/run-cycle.ts` 100.00% (≥ 90%), and `src/engine/exec-spawn.ts` 100.00%; structural invariants all pass. No per-file regressions.

**Failure modes handled this cycle:** (1) hook hangs past the bound — armed timer fires SIGTERM, escalates to SIGKILL after a 5s grace, marks `timedOut: true`, resolves `failed` on `close`, routes through the existing fatal path with distinguishable stderr (covered by the escalation unit test + the timeout integration test); (2) double-resolution — the `settled`/`done()` single-resolve guard makes timeout + `close`/`error` mutually exclusive (covered by the killTree-fallback test, which fires stale callbacks post-resolve); (3) process already gone — `process.kill(-pid)` throws are caught and fall back to `child.kill`, swallowing only the already-dead case (covered by the fallback test); (4) malformed/absent/disabled config — defensively coerced to `0` (no timer armed, degrade to prior no-timeout behavior), never failing the spawn (covered by the non-integer and absent-config integration tests); (5) spawn `error` still resolves a failed `StepResult`, never a rejection (existing regression test preserved). No errors are silently swallowed — every terminal path resolves a structured `StepResult` and the timeout surfaces as an observable fatal step failure.

**Deviations from PLAN.md:** None material. The plan suggested coercion could be a "focused helper test"; since the coercion is inline at the read site (not an exported function), the coercion branches are covered through `runCycle` integration tests (positive value arms, non-integer and absent both disable) rather than a unit helper. Per the plan's resolved Open Question 3, no `npm run sync-defaults` was run (the key is intentionally not added to shipped `src/defaults/workflows.yml`).

**Deferred / follow-up:** None. The default value is documented as a recommended opt-in (`600000`) rather than auto-applied, reconciling the SPEC "sensible non-zero default" prose with the binding acceptance criterion that an absent config arms no timer.

## Touched Files
- src/engine/walkthrough.ts
- src/engine/workflow.ts
- src/engine/run-cycle.ts
- tests/engine/walkthrough.test.ts
- tests/engine/run-cycle.walkthrough.test.ts
- docs/ENGINE.md
- CLAUDE.md
