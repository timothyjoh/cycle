## Summary

This cycle adds the missing `step.end` emission on the `rate_limit_max_retries` halt path in `runCycle`, eliminating the only terminal path that left a dangling `step.start` unmatched.

**Files modified:**
- `src/engine/run-cycle.ts` (+20 lines): Inside the `if (rateLimitRetries > maxRateLimitRetries)` halt branch, before the existing `engine.halted` emit, inserted one `await log.emit("step.end", …)` mirroring the shared emission's failed-step shape — `cycle_id`, `step: step.name`, `status: "failed"`, `exit_code: r.exitCode`, `duration_ms: Math.max(0, Math.round(nowFn() - stepStart))` (clamped non-negative), and an unconditional head-capped `stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)`. The bash-only `stdout`/`stdout_artifact` fields are intentionally omitted (out of scope for a rate-limited agent step). The pre-existing early `return` short-circuits before the shared `step.end` at the loop bottom, so no double emission occurs.
- `tests/engine/rate-limit-integration.test.ts` (+44 lines): Extended the boundary-above halt test to assert exactly one `step.end` for `research` (`filter(...).length === 1`), `status: "failed"`, integer `duration_ms ≥ 0`, the `step.end → engine.halted → cycle.end` index ordering, and matching `step.start`/`step.end` counts (both 1). Extended the boundary-below test to assert exactly one success-path `step.end` for `research` with `status: "ok"` (no spurious halt-path emission).
- `CLAUDE.md` (2 notes): Updated the `run-cycle.ts` rate-limit retry-loop architecture note and the *Workflow defaults* `engine.max_rate_limit_retries` bullet to state the halt now emits `step.end` (status `failed`, with `duration_ms`) before `engine.halted` → `cycle.end`.
- `docs/ENGINE.md` (2 spots): Updated the halt-path step list under *Retry loop* (`step.end` first, with ordering and `duration_ms`/`stderr` mechanics) and added a `step.end` line to the rate-limit Events JSON block before the `engine.halted` line.

**PLAN.md tasks complete:** Task 1 (emit `step.end` in halt branch), Task 2 (extend boundary-above + boundary-below tests), Task 3 (CLAUDE.md + docs/ENGINE.md updates; no README change per SPEC).

**Test suite:** `npm run test:coverage` (full suite, auto-builds via `pretest`, then runs `coverage-gate.mjs` + `structural-invariants.mjs`) — **870 tests, 870 pass, 0 fail, 0 cancelled**. `npm run typecheck` (`tsc --noEmit`) clean, no warnings.

**Coverage:** Project totals Branch 87.13%; `src/engine/run-cycle.ts` Line 99.69% / Branch 96.28% / Function 95.00% (per-file floor 90% — passes). All per-file coverage-gate floors report `ok`; no regressions. The new halt-branch lines are directly exercised by the extended boundary-above integration test (real temp git repo, fake agent shell script on `PATH`, `parseEvents` over the real `.cycle/log.jsonl`; only `sleepFn: noopSleep` injected).

**Failure modes handled:** This path *is* the failure path (single step rate-limited more than the cap). The fix keeps the halt fully observable — `step.end` (new) + `engine.halted` + `cycle.end` + a failed-cycle return — with no silent kill. `duration_ms` clamps to `0` on any negative/unavailable delta (never negative, never omitted). No `try/catch` was added around the new emit: a `log.emit` rejection propagates exactly as the adjacent `engine.halted`/`cycle.end` emits do, through the `finally` checkout/base-pull cleanup, which still runs. Covered by the boundary-above test (exactly-once halt-path `step.end`, integer non-negative `duration_ms`, ordering) and the boundary-below test (no spurious halt-path emission on the non-halt success path).

**Deviations from PLAN.md:** None. The `expectExactlyOne` helper was already imported in the test file; the cardinality assertions use `filter(...).length === 1` directly since the halt-path `step.end` for `research` is the only such event on that path.

**Deferred / follow-up:** None new. The downstream `iteration-guard.ts` / `readCycleEndFailure` consumer (now unblocked by this emission) remains out of scope per SPEC.

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/rate-limit-integration.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/ARCHITECTURE.md
