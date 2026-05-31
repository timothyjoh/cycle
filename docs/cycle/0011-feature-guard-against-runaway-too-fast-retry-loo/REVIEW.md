# Review: Cycle 0011

## Overall Verdict
PASS — no fixes needed

All eight SPEC Acceptance Criteria pass, the three items from the prior review pass's `MUST-FIX.md` are fully resolved by new tests, full suite is green (812 passed / 0 failed), typecheck is clean, every coverage floor holds (`src/engine/run-cycle.ts` 99.63% ≥ 90%), structural invariants pass, and `.cycle/workflows.yml` is byte-identical to the synced default. No code-quality, test, or doc-vs-code defect found. The stale (now-resolved) `MUST-FIX.md` was removed so it does not re-drive the `fix` step.

## Code Quality Review

### Summary
A clean, well-scoped three-part change: an injectable `nowFn` clock adds an integer `duration_ms ≥ 0` to every `step.end` in `runCycle`; a new side-effect-free `src/engine/iteration-guard.ts` houses the bottom-up log reader and a pure counter transition; the `src/cli.ts` supervisor interposes a fast-bail in the exec-failure branch. Failure handling is fail-safe throughout — every retry-suppressing decision emits a `step.warning` first (no silent kill), and every degrade path (unreadable duration, malformed config, different step) resets to normal count-based retry rather than spuriously bailing.

### Findings
1. **Architecture (positive)**: extracting `readCycleEndFailure` + `advanceFastFailCounter` into `src/engine/iteration-guard.ts` makes the supervisor logic unit-testable despite `cli.ts` executing on import — a sound deviation from PLAN Task 3 (inline), documented in BUILD.md and CLAUDE.md — `src/engine/iteration-guard.ts:14,73`.
2. **Fail-safe (positive)**: threshold resolved at the read site with `typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0` — a non-numeric/negative/absent value disables the guard and never throws — `src/cli.ts:510-513`.
3. **Idempotency (positive)**: the counter is in-memory only, keyed by `${cycleId}::${failingStep}`, and reset on success, every terminal drain (fast-bail, budget-exhausted, commit-failure), ≥-threshold failure, unreadable duration, and different step — `src/cli.ts:534-535,549-550,583-584,599-600` + `src/engine/iteration-guard.ts:89-90`.
4. **No silent failure (positive)**: the only swallowed `catch` is the intentional degrade-to-normal-retry on an unreadable log; it is observable indirectly (no warning ⇒ normal retry) and documented — `src/engine/iteration-guard.ts:53`.
5. **Clamp correctness (positive)**: `Math.max(0, Math.round(nowFn() - stepStart))` guarantees a non-negative integer even with a non-monotonic clock — `src/engine/run-cycle.ts:320,498`.
6. **Minor (no action)**: the supervisor-level *different-step reset* and *unreadable-duration* paths are exercised at the pure-function level (`advanceFastFailCounter`/`readCycleEndFailure`) rather than via a multi-step integration fixture; this is the correct decision point and is acceptable coverage, but a multi-step integration fixture would additionally pin the `cli.ts` wiring (no per-file floor on `cli.ts`).

### Spec Compliance Checklist
- [x] `engine.min_step_duration_ms` in `EngineConfig` (`src/engine/workflow.ts:40`), `src/defaults/workflows.yml:8` = `2000`, `.cycle/workflows.yml` byte-identical to synced default (verified via `Buffer.compare === 0`)
- [x] Every `runCycle` `step.end` carries integer `duration_ms ≥ 0` — both sites (`src/engine/run-cycle.ts:320` skip_unless-miss, `:498` main); no other emission sites exist
- [x] `K=2` same-step sub-threshold failures ⇒ exactly one `iteration_too_fast` warning + `terminalDrain`, no third `cycle.start` (integration test, cardinality-pinned)
- [x] `duration_ms ≥ threshold` retries to `max_cycle_attempts`, no warning (slow-failure integration test)
- [x] `0`/absent/malformed disables guard, full budget consumed, no throw (`0` and `"abc"` integration tests)
- [x] Successful cycle resets the counter, no warning (success-reset integration test)
- [x] All existing tests pass — 812 passed, 0 failed
- [x] `npm run typecheck` clean; coverage floors hold (`run-cycle.ts` 99.63% ≥ 90%)
- [x] SPEC has a populated `## Acceptance Criteria` section (SPEC.md:29-37)
- [x] PLAN has `## SPEC Acceptance Traceability` re-quoting every AC bullet verbatim with a covering task (PLAN.md:274-285)
- [x] Docs updated per SPEC — CLAUDE.md, README.md, docs/ENGINE.md

## Adversarial Test Review

### Summary
Strong. Three layers: pure unit tests for the reader and counter transition, deterministic-clock unit tests for both `step.end` emission sites (including the clamp and skip_unless-miss branch), and spawned-binary integration tests over real `.cycle/log.jsonl`. Minimal mocking — the only injected seam is `RunCycleOpts.nowFn`, mirroring the established `sleepFn` pattern; failure scenarios are tested as thoroughly as the happy path.

### Findings
1. **Cardinality pinning (positive)**: the fast-bail warning is asserted with `filter(...).length === 1`, and a follow-up `cycle.start`-after-warning scan asserts no further retry — `tests/cli/iteration-too-fast.test.ts:126,143`.
2. **Assertion quality (positive)**: specific assertions — `assert.equal(w.threshold_ms, 5000)`, `assert.deepEqual(b.state, { key: "C1::verify", count: 1 })`, `assert.equal(d, 33)` — not weak truthiness checks.
3. **Boundary coverage (positive)**: non-monotonic clock clamp (`duration_ms === 0`), absent/non-numeric `duration_ms`, undefined failing step, and unreadable log all covered — `tests/engine/run-cycle.step-end-duration.test.ts:127`, `tests/engine/iteration-guard.test.ts:35-73,118-146`.
4. **Test independence (positive)**: each test uses an isolated `mkdtemp` repo with `finally` cleanup; the per-issue counter-file fixture in the success-reset test avoids cross-test shared state.

### Test Coverage
- Command run: `npm run test:coverage`
- Tests: 812 passed, 0 failed; exit 0
- Per-file floors: all green — notably `src/engine/run-cycle.ts` 99.63% ≥ 90%, `src/cli/run-one.ts` 73.96% ≥ 70%, all 100% floors hold; structural invariants pass
- Regressions vs base (per-file): none
- New code without tests: none — `src/engine/iteration-guard.ts` fully exercised by 11 unit tests; `cli.ts` supervisor branch covered by 5 spawned-binary integration tests
- Specific scenarios missing tests: none required by SPEC; optional hardening — a multi-step integration fixture asserting the different-step reset at the supervisor wiring level (covered at the pure-function level today)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `iteration-guard.ts` exports `readCycleEndFailure(repoRoot, cycleId)` | `CLAUDE.md:77` | `src/engine/iteration-guard.ts:14` | OK |
| `iteration-guard.ts` exports pure `advanceFastFailCounter(prev, opts)` | `CLAUDE.md:77` | `src/engine/iteration-guard.ts:73` | OK |
| `engine.min_step_duration_ms` default 2,000 | `CLAUDE.md:100`, `README.md:163` | `src/defaults/workflows.yml:8`, `src/engine/workflow.ts:40` | OK |
| `K=2` consecutive same-step threshold | `CLAUDE.md:100`, `docs/ENGINE.md:340` | `src/cli.ts:222` (`ITERATION_TOO_FAST_K = 2`) | OK |
| Emits `step.warning { reason: "iteration_too_fast", duration_ms, threshold_ms }` | `CLAUDE.md:100`, `README.md:163`, `docs/ENGINE.md:330` | `src/cli.ts:573-578` | OK |
| `0`/absent/malformed disables guard | `CLAUDE.md:100`, `README.md:163`, `docs/ENGINE.md:320` | `src/cli.ts:510-513` | OK |
| Routes through `terminalDrain`, no new halt reason, counts toward `max_consecutive_failures` | `CLAUDE.md:100`, `docs/ENGINE.md:330` | `src/cli.ts:579-582` | OK |
| `duration_ms` on every `step.end` via injectable clock | `docs/ENGINE.md:317` | `src/engine/run-cycle.ts:320,498` | OK |
| `RunCycleOpts.nowFn?: () => number` test seam, default `Date.now` | `docs/ENGINE.md:317` | `src/engine/run-cycle.ts:233,277` | OK |
| Threshold resolution `typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0` | `docs/ENGINE.md:320` | `src/cli.ts:512` | OK |
| Counter pair `(fastFailKey, fastFailCount)` keyed by `${cycleId}::${failingStep}` | `docs/ENGINE.md:324` | `src/cli.ts:223-224`, `:555` | OK |
| Unreadable/non-numeric `duration_ms` ⇒ `undefined` ⇒ degrade, no spurious bail | `docs/ENGINE.md:326`, `CLAUDE.md:77` | `src/engine/iteration-guard.ts:48,89-90` | OK |
