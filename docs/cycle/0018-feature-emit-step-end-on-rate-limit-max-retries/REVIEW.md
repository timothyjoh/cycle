All checks pass. Writing the review artifact.

```markdown
# Review: Cycle 0018

## Overall Verdict
PASS — no fixes needed

This cycle adds the single missing `step.end` emission on the `rate_limit_max_retries` halt path, the only terminal path in the cycle loop that previously left a dangling `step.start`. The change is a localized, convention-faithful insertion; tests are specific and cardinality-pinned; docs are updated and fully backed by code; coverage and structural invariants hold.

## Code Quality Review

### Summary
The implementation matches the SPEC and PLAN exactly. The new emission at `src/engine/run-cycle.ts:449-456` is a faithful mirror of the shared failed-step `step.end` shape at `:586-599` (minus the bash-only `stdout`/`stdout_artifact` fields, correctly omitted because a rate-limited step is always an agent step). The pre-existing early `return` at `:463` short-circuits before the shared emission, so no double `step.end` occurs. This path increases observability rather than adding any silent-failure surface.

### Findings
1. **Convention adherence**: New emission mirrors the shared emit field-for-field (`cycle_id`, `step`, `status`, `exit_code`, `duration_ms`, `stderr`) — `src/engine/run-cycle.ts:449-456` vs `src/engine/run-cycle.ts:586-599`. `duration_ms` uses the identical `Math.max(0, Math.round(nowFn() - stepStart))` clamp, so it is provably non-negative and never omitted.
2. **No double emission**: The early `return { ..., status: "failed", failingStep: step.name }` at `src/engine/run-cycle.ts:463` is inside the `try`, short-circuiting before the loop-bottom emission at `:586` and flowing through the `finally` cleanup — confirmed and pinned by the test's start/end-count assertion.
3. **In-scope variables confirmed**: `r` (most-recent rate-limited `StepResult`, `:411`), `step`/`step.name`, `cycleId`, `nowFn`/`stepStart` (`:279`/`:287`), `truncateHeadCapped`, and `MAX_STEP_END_STDERR` are all in scope at the halt branch.
4. **Failure handling (fail-safe)**: This path *is* the failure path. The halt stays observable via `step.end` (new) + `engine.halted` + `cycle.end` + a failed-cycle return — no silent kill. No new `catch` was added; a `log.emit` rejection would propagate exactly as the adjacent `engine.halted`/`cycle.end` emits do. Correct decision — wrapping it would reintroduce a silent gap.
5. **No idempotency concern**: No file or external state mutated; within one `runCycle` the early `return` guarantees at-most-once emission per halt.

### Spec Compliance Checklist
- [x] Exactly one `step.end` (`status: "failed"`, integer `duration_ms`) on the `cap + 1`-th attempt — `src/engine/run-cycle.ts:449-456`
- [x] Ordering `step.end → engine.halted → cycle.end` — emit order `:449` → `:457` → `:462`
- [x] Early return value unchanged; flows through `finally` cleanup — `:463`
- [x] No second `step.end` (no fall-through to shared emission) — early return at `:463`
- [x] `duration_ms` clamps to `0` on negative/unavailable delta — `Math.max(0, …)` at `:454`
- [x] `stderr` excerpt follows the failed-step convention (`truncateHeadCapped`, `MAX_STEP_END_STDERR`) — `:455`
- [x] Out-of-scope items untouched (cap semantics, backoff, `RATE_LIMIT_PATTERNS`, iteration guard, normal pause/retry path)
- [x] SPEC has a populated `## Acceptance Criteria` section with 6 testable bullets
- [x] PLAN includes a `## SPEC Acceptance Traceability` section re-quoting every SPEC AC bullet verbatim, each paired with a covering task
- [x] Docs updated per SPEC (CLAUDE.md, docs/ENGINE.md; no README change required)

## Adversarial Test Review

### Summary
Strong. Tests run against a real temp git repo, a real fake-agent shell script on `PATH`, and `parseEvents()` over the real `.cycle/log.jsonl` — only `sleepFn: noopSleep` is injected. No mocking of `log.emit` or `fs`; this is genuine integration testing, not mock theater.

### Findings
1. **Cardinality pinning**: Halt-path `step.end` asserted via `filter(...).length === 1` per the project's exactly-once rule, not a bare `find` — `tests/engine/rate-limit-integration.test.ts:298-302`.
2. **Specific assertions**: `status === "failed"`, `Number.isInteger(duration_ms)`, `duration_ms >= 0` — `tests/engine/rate-limit-integration.test.ts:303-307`. Not weak truthiness checks.
3. **Ordering verified by index**: `iStepEnd < iHalted < iCycleEnd` via `findIndex` — `tests/engine/rate-limit-integration.test.ts:310-320`.
4. **Start/end pairing**: `step.start` count equals `step.end` count for the rate-limited step — `tests/engine/rate-limit-integration.test.ts:323-326`. Directly guards against a fall-through double-emission regression.
5. **Boundary-below regression**: Exactly-`cap`-then-success asserts a single success-path `step.end` with `status: "ok"` and no spurious halt-path emission — `tests/engine/rate-limit-integration.test.ts:250-254`. Pins the increment-then-compare boundary on the safe side.
6. **Minor (not blocking)**: The `duration_ms` clamp-to-`0` branch (negative `nowFn() - stepStart` delta) is not exercised by a dedicated test — real-clock runs always yield a non-negative delta. This is acceptable: the clamp is the identical `Math.max(0, …)` construct used at the shared emission, and the value is provably `≥ 0` by construction. No action required.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: aggregate all-files Line 40.28% / Branch 87.13% / Function 45.54% (aggregate includes untested CLI entrypoints — consistent with the established baseline; the policy is enforced per-file). `src/engine/run-cycle.ts`: Line 99.69% (floor 90% — pass).
- Regressions vs base (per-file): none. All `coverage-gate` floors report `ok`, including `src/engine/run-cycle.ts 99.69% ≥ 90%`, `src/engine/rate-limit.ts 100.00% ≥ 100%`. `structural-invariants` all `ok`.
- New code without tests: none — the new halt-branch emission is directly exercised by the extended boundary-above integration test.
- Specific scenarios missing tests: none required by SPEC. (The `duration_ms`-clamp negative-delta branch is provably-safe-by-construction; see Finding 6.)
- Targeted suite: `tests/engine/rate-limit-integration.test.ts` — 10 tests, 10 pass, 0 fail. Full suite exit code 0; `npm run typecheck` clean.

## Doc-vs-Code Claim Verification

Diff touches in-scope doc paths `CLAUDE.md` and `docs/ENGINE.md` (the latter is outside `docs/cycle/*`). All introduced/modified claims are backed.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| halt path emits `step.end { status: "failed", duration_ms, exit_code, stderr }` for the rate-limited step | `CLAUDE.md:72` | `src/engine/run-cycle.ts:449-456` | OK |
| ordering `step.end → engine.halted → cycle.end` | `CLAUDE.md:72` | `src/engine/run-cycle.ts:449 → :457 → :462` | OK |
| `engine.max_rate_limit_retries` halt emits `step.end { status: "failed", duration_ms }` before `engine.halted` then `cycle.end` | `CLAUDE.md:105` | `src/engine/run-cycle.ts:449-456` | OK |
| halt branch emits `step.end` **first**, then `engine.halted`, then `cycle.end` | `docs/ENGINE.md:313` | `src/engine/run-cycle.ts:449,457,462` | OK |
| `step.end` `duration_ms` is `Math.max(0, Math.round(nowFn() - stepStart))` | `docs/ENGINE.md:313` | `src/engine/run-cycle.ts:454` | OK |
| `stderr` is the head-capped excerpt (`MAX_STEP_END_STDERR`) | `docs/ENGINE.md:313` | `src/engine/run-cycle.ts:455` | OK |
| Events block: `step.end` line precedes the `engine.halted` line | `docs/ENGINE.md:335` | `src/engine/run-cycle.ts:449` precedes `:457` | OK |
```
