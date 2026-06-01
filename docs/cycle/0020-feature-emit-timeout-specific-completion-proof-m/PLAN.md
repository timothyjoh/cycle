# Implementation Plan: Cycle 0020

## Overview
Add a timeout-aware completion-proof failure message: when a `"nonempty"` proof-policy step times out (`r.timedOut === true`) and leaves an empty declared artifact, `step.end.stderr` reports a timeout-specific cause that references the real exit code, instead of the existing hard-coded `"<step> exited 0 but <artifact> is empty"` wording that contradicts `exit_code: 143`. Routing (failed → retry) is unchanged; only the `r.stderr` string value branches.

## Current State (from Research)
- The `"nonempty"` proof arm in `src/engine/run-cycle.ts:508-511` unconditionally sets `proofError = formatCompletionProofError(step.name, artifactPath)` when `classifyArtifact(artifactPath) === "empty"`.
- The downstream handler `src/engine/run-cycle.ts:519-522` assigns `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = proofError`. The `else if (r.timedOut)` salvage branch (lines 523-529) accepts the work only when `proofError` is null (artifact passed its proof).
- `formatCompletionProofError` (`src/engine/run-cycle.ts:195-197`) is one of four exported, single-expression, greppable template-literal formatters (`formatSpecGuardError`, `formatFixGuardError`, `formatEmptyDiffGuardError` at lines 183-193) — the shape precedent for the new formatter.
- `r.timedOut?: true` originates in `src/engine/exec-spawn.ts:60-87` (SIGTERM-then-SIGKILL on timer expiry); `StepResult` type in `src/engine/exec-bash.ts:5-13`. Timeout limit is `cfg.engine.step_timeout_ms`, passed at `src/engine/run-cycle.ts:421`.
- `step.end` (`src/engine/run-cycle.ts:589-602`) emits `exit_code: r.exitCode` (empirically 143 on timeout) alongside `stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)` — the contradiction surface.
- `step.completion_check` (`src/engine/run-cycle.ts:513-518`) emits `status: proofError ? "fail" : "pass"` — the cardinality-pinned event that must keep firing exactly once.
- Test file `tests/engine/run-cycle.completion-proof.test.ts`: `workflowYml(steps)` helper (lines 24-45) emits no `step_timeout_ms`; `setupRepo` writes a fake `claude` script and single-step `feature` workflow; cardinality asserted via `expectExactlyOne`. No existing test drives `r.timedOut` through `runCycle` (only `tests/engine/exec-spawn.test.ts:108-135` tests `runAgent` directly with a `sleep 30` / `timeoutMs: 300` fake). Per-file floor for `run-cycle.ts` is 90%.

### Open Questions — Resolved
- **Exit-code source**: `formatTimeoutProofError` interpolates the actual `r.exitCode` (not a literal `143`), satisfying the SPEC requirement ("references the actual exit code") and remaining robust to any signal-derived code. The end-to-end test asserts on `/timed out/` + presence of the exit code + **absence of** `"exited 0"`, not on a literal `143` (the killed-child code is environment-dependent).
- **Timeout simulation in `runCycle`**: extend `workflowYml` with an optional `stepTimeoutMs` parameter that injects `engine.step_timeout_ms` into the emitted YAML. The fake `claude` hangs with `sleep 30` while writing nothing to stdout; a small timeout (`200` ms) deterministically yields `r.timedOut === true` with an empty artifact (no stdout ⇒ empty artifact) well within the test runner's window and without CI flake (30 s ≫ 200 ms margin).
- **Dedicated formatter unit test**: yes — add a `formatTimeoutProofError` unit test mirroring the existing `formatCompletionProofError` unit test (`run-cycle.completion-proof.test.ts:109-113`), in addition to the end-to-end `runCycle` assertion.

## Desired End State
- `src/engine/run-cycle.ts` exports a new pure `formatTimeoutProofError(stepName, artifactPath, exitCode)` and the `"nonempty"` proof arm branches on `r.timedOut` to choose it over `formatCompletionProofError`.
- A timed-out empty-artifact step produces `step.end.stderr` referencing "timed out" and the exit code, with no `"exited 0"` substring; the clean exit-0 empty-artifact path is byte-for-byte unchanged.
- Tests cover: the new timeout branch (e2e), the unchanged exit-0 branch (existing regression anchor), the timeout-salvage regression, `step.completion_check` exactly-once, and the formatter unit.
- CLAUDE.md, AGENTS.md (if present), and `docs/ENGINE.md` *Completion-proof post-condition* updated.
- `npm test`, `npm run typecheck`, and coverage gates pass; `run-cycle.ts` stays ≥ 90%.

Verify: `npm test` green; `grep -n "formatTimeoutProofError" src/engine/run-cycle.ts` shows the formatter + the branch; the new test asserts the timeout wording and the absence of `exited 0`.

## What We're NOT Doing
- No change to the completion-proof routing outcome (failed → retry), `r.status`/`r.exitCode` assignment, `step.completion_check` status logic, `step.timeout`, or `step.timeout_salvaged`.
- No change to the `spec-min-bytes` or `fix-conditional` proof-policy message branches.
- No new engine event; no change to any existing event's emission count.
- No change to timeout limits, `engine.step_timeout_ms` defaults, or why steps time out.
- No README change (no user-facing surface change).

## Implementation Approach
Single-file code change in `src/engine/run-cycle.ts`: add one exported pure formatter next to its siblings, then add a `r.timedOut` ternary inside the existing `"nonempty"` arm so `proofError` selects the timeout wording when the killed step left an empty artifact. The downstream `if (proofError)` handler and the `else if (r.timedOut)` salvage branch are reused verbatim — the salvage branch only runs when `proofError` is null, so the new wording never interacts with salvage. The exit code is interpolated from `r.exitCode` for honesty about the actual signal-derived code. Tests extend the existing harness with a timeout-injecting workflow and a hanging fake agent.

## Failure & Resilience Decisions

**Task 1 (`formatTimeoutProofError`)** — N/A — pure. Single-expression template-literal function, no I/O, no failure surface.

**Task 2 (branch in the `"nonempty"` arm)** — governs failure-message text on an already-failing path.
- **Failure modes**: none new. `classifyArtifact` already fails closed (unreadable ⇒ `"empty"`, `src/engine/run-cycle.ts:160-167`). The branch only chooses between two non-empty strings for an already-detected empty artifact; it adds no I/O, no subprocess, no network.
- **Idempotency**: safe to re-run. The block is a pure post-condition on a single in-memory `StepResult`; no state mutation beyond local fields on `r`. Engine retries re-enter the step cleanly. `r.exitCode || 1` remains a no-op on the timeout path (already non-zero) and a guard on any zero-code empty path.
- **Observability**: the surfaced diagnostic is `r.stderr`, emitted via the unchanged `step.end { exit_code, stderr }` (`src/engine/run-cycle.ts:589-602`). `step.completion_check { status: "fail" }` still fires exactly once. The new wording makes the failure *more* diagnosable (exit code now matches the message).
- **No silent failure**: the message text is non-empty by construction (template literal with required interpolations); `r.status = "failed"` and a non-zero `r.exitCode` route through the existing `max_cycle_attempts` retry path. Nothing is swallowed.

**Task 3 (tests)** — test code. Failure simulation is the point: the hanging fake agent + small timeout deterministically exercises the timed-out-empty branch. No production failure surface.

---

## Task 1: Add `formatTimeoutProofError` pure formatter

### Overview
Introduce an exported, single-expression formatter parallel in shape to `formatCompletionProofError`, producing a timeout-specific message that references the actual exit code and never contains `"exited 0"`.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Add directly after `formatCompletionProofError` (`src/engine/run-cycle.ts:195-197`):

```ts
export function formatTimeoutProofError(stepName: string, artifactPath: string, exitCode: number): string {
  return `${stepName} timed out (exit ${exitCode}) and left ${artifactPath} empty — treating as failure`;
}
```

Rationale: `exit ${exitCode}` interpolates `r.exitCode` (robust to the signal-derived code, empirically 143) rather than hard-coding `143`. Shares the `… — treating as failure` greppable tail with the sibling formatter. The string deliberately omits the substring `"exited 0"`.

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck`)
- [ ] `formatTimeoutProofError("review", "/a/b/REVIEW.md", 143)` returns `review timed out (exit 143) and left /a/b/REVIEW.md empty — treating as failure`
- [ ] Output does not contain `"exited 0"`
- [ ] Failure paths behave as designed — N/A (pure)

---

## Task 2: Branch the `"nonempty"` proof message on `r.timedOut`

### Overview
Inside the `"nonempty"` proof arm, when the artifact classifies empty, select `formatTimeoutProofError` if the step timed out; otherwise keep `formatCompletionProofError`.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Replace the `else // "nonempty"` block at `src/engine/run-cycle.ts:508-511`:

```ts
} else { // "nonempty"
  if ((await classifyArtifact(artifactPath)) === "empty") {
    proofError = r.timedOut
      ? formatTimeoutProofError(step.name, artifactPath, r.exitCode)
      : formatCompletionProofError(step.name, artifactPath);
  }
}
```

The downstream `step.completion_check` emission (`src/engine/run-cycle.ts:513-518`), the `if (proofError)` failure assignment (lines 519-522), and the `else if (r.timedOut)` salvage branch (lines 523-529) are unchanged. Because the salvage branch is reached only when `proofError` is null, the timeout wording fires exclusively on the empty-artifact path and never affects salvage.

Confirm `r.exitCode` is typed `number` on `StepResult` (`src/engine/exec-bash.ts`) so the formatter call typechecks; if it is `number | undefined`, pass `r.exitCode ?? 143` — verify the type at implementation time and adjust the formatter call (not the formatter signature).

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` warning-clean
- [ ] Timed-out empty-artifact step: `r.stderr` is the timeout wording; `r.status === "failed"`, `r.exitCode` non-zero
- [ ] Exit-0 empty-artifact step: `r.stderr` equals `formatCompletionProofError(...)` (unchanged)
- [ ] `step.completion_check` still emitted exactly once with `status: "fail"` on the timed-out-empty path
- [ ] `step.timeout_salvaged` path (artifact non-empty + timed out) unchanged → `r.status === "ok"`
- [ ] Failure paths behave as designed (errors surfaced via `r.stderr` + `step.end`, no silent catch)

---

## Task 3: Tests — timeout branch, unchanged branch, salvage regression, cardinality, formatter unit

### Overview
Extend the completion-proof test harness to drive `r.timedOut` through `runCycle` and assert the new and unchanged message paths.

### Changes Required
**File**: `tests/engine/run-cycle.completion-proof.test.ts`

1. Import `formatTimeoutProofError` from `../../src/engine/run-cycle.ts` (alongside `formatCompletionProofError`).

2. Extend `workflowYml` to accept an optional timeout, injecting it under `engine:`:

```ts
function workflowYml(steps: { name: string }[], stepTimeoutMs?: number): string {
  // ...existing lines, with the following added after "  base_branch: main":
  //   ...(stepTimeoutMs !== undefined ? [`  step_timeout_ms: ${stepTimeoutMs}`] : [])
}
```
Thread an optional `stepTimeoutMs` through `setupRepo` to `workflowYml`. Keep existing call sites unchanged (parameter optional).

3. **Formatter unit test** (mirrors lines 109-113):
```ts
test("formatTimeoutProofError: timeout wording with exit code, no 'exited 0'", () => {
  const out = formatTimeoutProofError("review", "/a/b/REVIEW.md", 143);
  assert.equal(out, "review timed out (exit 143) and left /a/b/REVIEW.md empty — treating as failure");
  assert.match(out, /timed out \(exit 143\)/);
  assert.doesNotMatch(out, /exited 0/);
});
```

4. **E2E timeout branch test**: fake `claude` body `#!/bin/bash\nsleep 30\n`; `setupRepo(..., [{ name: "review" }], 200)`. Run `runCycle` with the existing `env`/`commit.mode: trunk`/`push: false` pattern. Assert:
   - result `status === "failed"`, `failingStep === "review"`;
   - the `review` `step.end` event's `stderr` matches `/review timed out \(exit \d+\)/` and `assert.doesNotMatch(stderr, /exited 0/)`;
   - `step.end.exit_code` is non-zero;
   - `step.completion_check` fires exactly once with `status: "fail"` via `expectExactlyOne(events.filter(e => e.event === "step.completion_check" && e.step === "review"), ...)` (or `assert.equal(filter(...).length, 1)`).
   Give the test an explicit generous `node:test` timeout if needed (the child is killed at 200 ms; total well under default).

5. **Unchanged exit-0 branch**: the existing test at `run-cycle.completion-proof.test.ts:132-171` (empty stdout, clean exit 0) already anchors `/review exited 0 but .*REVIEW\.md is empty — treating as failure/`. Confirm it still passes unchanged; no new test required, but add an explicit `assert.doesNotMatch(stderr, /timed out/)` to that assertion to pin the branch separation.

6. **Salvage regression**: fake `claude` writes non-empty content to its artifact path then `sleep 30` (so it is killed after producing output), with `stepTimeoutMs: 200`. Assert the cycle does **not** fail on `review` (salvage accepts the work → `r.status === "ok"`) and `step.timeout_salvaged` is emitted for `review`. If reliably writing the artifact before the kill proves timing-sensitive, gate this as the regression for salvage using a slightly larger write-then-hang margin; the artifact write must complete before the 200 ms timer. Document the chosen margin inline.

### Success Criteria
- [ ] `npm test` passes (all new + existing tests)
- [ ] Timeout e2e test asserts timeout wording, absence of `exited 0`, non-zero exit code, `step.completion_check` exactly-once `fail`
- [ ] Exit-0 regression test still green with added `doesNotMatch(/timed out/)` pin
- [ ] Salvage regression confirms `step.timeout_salvaged` + non-failing cycle
- [ ] `npm run test:coverage` keeps `run-cycle.ts` ≥ 90% and global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] Failure-path tests exercise the timed-out empty-artifact branch deterministically (hang ≫ timeout)

---

## Task 4: Documentation updates

### Overview
Record the message branch in the engine docs and project conventions; documentation is part of "done".

### Changes Required
**File**: `CLAUDE.md` — in the `run-cycle.ts` completion-proof contract note, add that the `"nonempty"` proof message branches on `r.timedOut`: timeout-specific wording (referencing the actual exit code) for SIGTERM-killed steps via `formatTimeoutProofError`, exited-0 wording via `formatCompletionProofError` for the clean exit path, and that the routing outcome (failed → retry) and `step.completion_check`/`step.timeout_salvaged` behavior are unchanged.

**File**: `AGENTS.md` — if present and it mirrors the CLAUDE.md completion-proof note, apply the same edit; if absent or unrelated, skip (note in BUILD.md which applied). Verify with `ls AGENTS.md`.

**File**: `docs/ENGINE.md` → *Completion-proof post-condition* (around lines 135-145) — revise the existing caveat that documents the misleading `exited 0`-on-timeout message so the documented `step.end.stderr` examples match the exit code; show both the timeout wording and the exit-0 wording.

**File**: `README.md` — no change (confirm no user-facing surface changed).

### Success Criteria
- [ ] CLAUDE.md completion-proof note mentions the `r.timedOut` message branch and `formatTimeoutProofError`
- [ ] `docs/ENGINE.md` *Completion-proof post-condition* example no longer shows `exited 0` paired with a timeout exit code
- [ ] AGENTS.md handled (edited or explicitly N/A) — recorded in BUILD.md
- [ ] No README change

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] When an artifact step in `STEP_ARTIFACTS` with `proof: "nonempty"` times out (`r.timedOut === true`) and leaves an empty artifact, the emitted `step.end.stderr` contains the timeout-specific wording (references "timed out" and the exit code) and does **not** contain the substring `exited 0`. | Task 1, Task 2, Task 3 | Formatter + branch; e2e test asserts `/timed out \(exit \d+\)/` and `doesNotMatch(/exited 0/)` |
| [ ] When the same step exits 0 cleanly with an empty artifact, the emitted `step.end.stderr` still equals the existing `formatCompletionProofError` output (`"<step> exited 0 but <artifact> is empty — treating as failure"`). | Task 2, Task 3 | Branch keeps the else path; existing test (lines 132-171) anchors it, augmented with `doesNotMatch(/timed out/)` |
| [ ] On the timed-out-empty path, `r.status === "failed"` and `r.exitCode` is non-zero (routing outcome unchanged) — verified by the failed cycle result and the same retry behavior as before. | Task 2, Task 3 | Downstream `if (proofError)` handler reused verbatim; e2e asserts failed result + non-zero exit code |
| [ ] `step.completion_check` is emitted exactly once for the step with `status: "fail"` on the timed-out-empty path (cardinality-pinned via `filter(...).length === 1`). | Task 3 | `expectExactlyOne` / `filter(...).length === 1` assertion |
| [ ] All existing tests still pass. | Task 3, Task 4 | `npm test` green; existing completion-proof tests unmodified except additive pin |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | `tsc --noEmit` warning-clean; verify `r.exitCode` type for the formatter call |

---

## Testing Strategy

### Unit Tests
- `formatTimeoutProofError(name, path, exitCode)`: exact-string equality, `/timed out \(exit 143\)/` match, `doesNotMatch(/exited 0/)`. Greppable-shape parity with the existing `formatCompletionProofError` unit test.
- **Failure-path tests** (named failure modes):
  - *Timed-out empty artifact*: hanging fake (`sleep 30`) with `step_timeout_ms: 200`, empty stdout ⇒ empty artifact ⇒ `r.timedOut === true` + `proofError` set → assert timeout wording, no `exited 0`, `status === "failed"`, non-zero exit code, `step.completion_check` exactly-once `fail`.
  - *Clean exit-0 empty artifact*: existing test (lines 132-171) — exit 0, empty stdout → exited-0 wording unchanged, plus added `doesNotMatch(/timed out/)`.
  - *Timed-out non-empty artifact (salvage)*: write-then-hang fake with `step_timeout_ms: 200` → `r.timedOut === true` but `proofError` null → salvage path, `status === "ok"`, `step.timeout_salvaged` emitted.
- **Mocking strategy**: real implementations only — real git repo (`setupRepo`), real fake-`claude` shell scripts on a temp PATH, real `runCycle`, real `.cycle/log.jsonl` parsing. No mocks; `node:fs/promises` is not stubbed (per CLAUDE.md). The hang/kill is real subprocess timeout behavior, not simulated.

### Integration / E2E Tests
- The timeout-branch and salvage tests are full `runCycle` invocations through the real engine path (config load → step exec → timeout kill → proof check → `step.end`/`cycle.end`), exercising the branch end-to-end. No UI/E2E beyond the engine harness (SPEC: "No UI changes; no E2E tests required").

## Risk Assessment
- **Timeout test flakiness on slow CI**: the 30 s hang vs 200 ms timeout margin is ~150×; the child is killed long before producing output. Mitigation: keep the hang at `sleep 30` (not `sleep 1`); if a runner is pathologically slow, the only effect is the kill firing later, still before stdout — the empty-artifact outcome is stable. Set a generous per-test `node:test` timeout.
- **Salvage test timing (write-before-kill)**: the fake must finish writing its artifact before the 200 ms timer. Mitigation: write immediately at script start, then `sleep 30`; 200 ms is ample for a single small `echo > artifact`. If still tight, raise `step_timeout_ms` to e.g. `500` for the salvage case only and document inline.
- **`r.exitCode` type mismatch**: if `StepResult.exitCode` is `number | undefined`, the formatter call needs a `?? 143` fallback. Mitigation: verify the type at `src/engine/exec-bash.ts` during implementation and adjust the call site, not the formatter signature.
- **Coverage dip**: the new formatter + branch add lines/branches; the timeout and salvage tests cover both arms of the `r.timedOut` ternary. Mitigation: confirm `npm run test:coverage` keeps `run-cycle.ts` ≥ 90% before commit.
