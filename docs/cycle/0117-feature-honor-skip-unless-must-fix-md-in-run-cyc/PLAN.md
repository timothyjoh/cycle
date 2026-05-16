Resolved all open questions. Now writing the plan to stdout.

```markdown
# Implementation Plan: Cycle 0117

## Overview

Wire `step.skip_unless` (already parsed from `workflows.yml` into `Step.skip_unless?: string`) into `run-cycle.ts` so steps with this field emit `step.end {status:"skipped"}` and skip the agent when the named artifact is absent. Fix `log-tail.ts` so resume treats that status as completed.

## Current State (from Research)

- `Step.skip_unless?: string` is parsed and typed in `workflow.ts:10` but never read by `run-cycle.ts`.
- Both `feature` and `e2e-tests` workflows declare `fix` with `skip_unless: MUST-FIX.md`.
- `run-cycle.ts:147–158` has an existing retry-skip block (`shouldSkipForArtifact`); new check slots in immediately after it (line 159), before the reset-eligible block (line 160).
- `stat` is already imported in `run-cycle.ts:21`.
- `log-tail.ts:52–58` collects `completedSteps` via `step.end status:"ok"` and `step.skipped` but has no branch for `step.end status:"skipped"`.
- `tests/engine/run-cycle.skip-completed.test.ts` provides the canonical test-repo-setup pattern (mkdtemp, git init, fake claude binary).
- `tests/engine/log-tail.test.ts:188–223` shows the existing `step.skipped` completedSteps assertion pattern.

## Desired End State

- `run-cycle.ts`: when `step.skip_unless` is set and the named file does not exist in `artifactDir`, the step emits `step.end {status:"skipped", step, reason:"skip_unless_artifact_missing", artifact:<name>}` and the loop continues to the next step. No `step.start` emitted, no agent spawned, no head_sha capture, no artifact overwrite.
- `log-tail.ts`: `completedSteps` includes steps whose log entry is `step.end {status:"skipped"}`.
- `tests/engine/run-cycle.skip-unless.test.ts` passes with three scenarios.
- `tests/engine/log-tail.test.ts` has a new case covering the new branch.
- Full test suite passes; aggregate coverage floors hold (≥95% line, ≥75% branch, ≥90% func).

## What We're NOT Doing

- Not changing `SKIP_ELIGIBLE_STEPS` or `shouldSkipForArtifact` (artifact-present retry-skip is a separate mechanism).
- Not adding multi-artifact conjunctions, path globs, or boolean predicates.
- Not modifying `RESET_ELIGIBLE_STEPS` (skipped steps fire before head_sha capture — already safe).
- Not changing `cli.ts` resume step selection (it depends on `completedSteps`, which log-tail fix handles).
- Not modifying `src/defaults/workflows.yml` (already has `skip_unless: MUST-FIX.md` in both workflow declarations; verify in Task 1 success criteria).

## Open Questions — Resolved

1. **`step.end` without `step.start` — safe for `lastStepStarted`?** Yes. The `lastStepStarted` scanner (log-tail.ts:64–86) scans backwards for `step.start` events; it only triggers on `step.start`. A bare `step.end {status:"skipped"}` with no preceding `step.start` is never matched by that scanner. Safe.

2. **Resume: does `skip_unless` re-evaluate?** No. After the log-tail fix, "fix" appears in `completedSteps`. `cli.ts:223–230` finds the first step not in `completedSteps` and sets `startStepIndex` past "fix". The predicate is not re-run. This matches AC bullet 4.

3. **Zero-byte `MUST-FIX.md` — present or absent?** Present (triggers fix). Use `st.isFile()` only — no size check. A zero-byte file is a signal that something wrote it; conservative direction is to run fix. The normal "no fixes needed" path simply never creates the file.

## Implementation Approach

Three surgical changes to two files plus two test additions:

1. `run-cycle.ts`: one new `if` block inside the step loop, between the retry-skip check and the reset-eligible check.
2. `log-tail.ts`: one new `else if` branch in the `completedSteps` loop.
3. `tests/engine/run-cycle.skip-unless.test.ts`: new file, three scenarios using the existing test-repo pattern.
4. `tests/engine/log-tail.test.ts`: one new test case.

---

## Task 1: Add `skip_unless` predicate to `run-cycle.ts`

### Overview

Insert a file-existence check immediately after the retry-skip block (line 158) and before the reset-eligible block (line 160). When `step.skip_unless` is set and the named artifact is absent, emit `step.end {status:"skipped"}` and continue without spawning an agent.

### Changes Required

**File**: `src/engine/run-cycle.ts`

**Insert after line 158** (closing `}` of the retry-skip block, before the `if (isResetEligible && ...)` line):

```typescript
      if (step.skip_unless) {
        const guardPath = join(artifactDir, step.skip_unless);
        let present = false;
        try {
          const st = await stat(guardPath);
          present = st.isFile();
        } catch {
          // ENOENT or unreadable — treat as absent
        }
        if (!present) {
          await log.emit("step.end", {
            cycle_id: cycleId,
            step: step.name,
            status: "skipped",
            reason: "skip_unless_artifact_missing",
            artifact: step.skip_unless,
          });
          continue;
        }
      }
```

No other changes to `run-cycle.ts`. `stat` and `join` are already imported.

### Success Criteria

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Both `feature` and `e2e-tests` workflows in `.cycle/workflows.yml` already have `skip_unless: MUST-FIX.md` on their `fix` step — no YAML change needed (verify by inspection)
- [ ] `src/defaults/workflows.yml` also has `skip_unless: MUST-FIX.md` on both `fix` steps — verify by inspection

---

## Task 2: Fix `log-tail.ts` to treat `step.end status:"skipped"` as completed

### Overview

Add one `else if` branch in the `completedSteps` loop so that `step.end` with `status === "skipped"` adds the step name to `completedSteps`, matching the existing `step.skipped` branch behavior.

### Changes Required

**File**: `src/engine/log-tail.ts`

**Current (lines 52–58)**:
```typescript
    if (e.event === "step.end" && (e as { status?: string }).status === "ok") {
      name = (e as { step?: string }).step;
    } else if (e.event === "step.skipped") {
      name = (e as { step?: string }).step;
    } else {
      continue;
    }
```

**Replace with**:
```typescript
    if (e.event === "step.end" && (e as { status?: string }).status === "ok") {
      name = (e as { step?: string }).step;
    } else if (e.event === "step.skipped") {
      name = (e as { step?: string }).step;
    } else if (e.event === "step.end" && (e as { status?: string }).status === "skipped") {
      name = (e as { step?: string }).step;
    } else {
      continue;
    }
```

### Success Criteria

- [ ] `npm run typecheck` passes
- [ ] Existing log-tail tests still pass (no regression)
- [ ] New test case (Task 4) verifies the branch is exercised

---

## Task 3: New test file `tests/engine/run-cycle.skip-unless.test.ts`

### Overview

Three end-to-end scenarios using the canonical fake-git-repo pattern from `run-cycle.skip-completed.test.ts`. Each test seeds a minimal cycle environment, runs `runCycle`, and asserts log output.

### Changes Required

**File**: `tests/engine/run-cycle.skip-unless.test.ts` (new)

**Setup pattern** (replicate from `run-cycle.skip-completed.test.ts:49–77`):
- `mkdtemp` for `root` and `bin`
- `git init -b main`, initial commit
- Write `.cycle/workflows.yml` with a minimal workflow where `fix` has `skip_unless: MUST-FIX.md`
- Write fake `claude` binary in `bin/`
- Pass `env: { PATH: \`${bin}:${process.env.PATH}\`, CYCLE_BASE: "main" }`

**Scenario 1 — clean path (MUST-FIX.md absent)**:
- Fake `claude` binary: exits 1 with "should not run" to stderr (fail-if-invoked pattern)
- Write artifact dir but do NOT write `MUST-FIX.md`
- Run `runCycle` with a step list ending in `fix` (skip_unless: MUST-FIX.md)
- Assert log contains `step.end` with `status:"skipped"`, `step:"fix"`, `reason:"skip_unless_artifact_missing"`, `artifact:"MUST-FIX.md"`
- Assert log does NOT contain `step.start` with `step:"fix"`
- Assert cycle ends `status:"ok"`

**Scenario 2 — dirty path (MUST-FIX.md present)**:
- Fake `claude` binary: exits 0, writes some stdout
- Write `MUST-FIX.md` in artifact dir (non-empty)
- Run `runCycle` with same step list
- Assert log contains `step.start` with `step:"fix"`
- Assert log contains `step.end` with `status:"ok"`, `step:"fix"`
- Assert log does NOT contain `status:"skipped"`

**Scenario 3 — resume across skipped fix**:
- Pre-seed log with `cycle.start` + `step.end {status:"skipped", step:"fix", ...}` (simulating a cycle where fix was skipped)
- Call `parseLogTail` on the pre-seeded log
- Assert "fix" appears in `completedSteps`
- Assert `lastStepStarted` is `undefined` (no open step)
- Then verify that passing `completedSteps` to the resume step-selection logic would skip past "fix" to "verify"

### Success Criteria

- [ ] All three test scenarios pass
- [ ] `npm test` passes (full suite)

---

## Task 4: New test case in `tests/engine/log-tail.test.ts`

### Overview

Two new test cases covering the new `step.end {status:"skipped"}` branch: one verifying it adds to completedSteps, one verifying cross-cycle isolation still holds.

### Changes Required

**File**: `tests/engine/log-tail.test.ts`

Add after the existing `"parseLogTail counts step.skipped as completed"` test (line ~188):

```typescript
test("parseLogTail counts step.end status:skipped as completed", () => {
  const r = parseLogTail(
    lines([
      ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "t", issue_id: "i" }),
      ev("step.end", { cycle_id: "0001", step: "spec", status: "ok" }),
      ev("step.end", { cycle_id: "0001", step: "fix", status: "skipped", reason: "skip_unless_artifact_missing", artifact: "MUST-FIX.md" }),
    ])
  );
  assert.deepEqual(r!.completedSteps, ["spec", "fix"]);
});

test("parseLogTail ignores step.end status:skipped from a different cycle_id", () => {
  const r = parseLogTail(
    lines([
      ev("cycle.start", { cycle_id: "0001", workflow: "feature", title: "t", issue_id: "i" }),
      ev("step.end", { cycle_id: "9999", step: "fix", status: "skipped", reason: "skip_unless_artifact_missing", artifact: "MUST-FIX.md" }),
    ])
  );
  assert.deepEqual(r!.completedSteps, []);
});
```

### Success Criteria

- [ ] Both new test cases pass
- [ ] Existing log-tail tests unaffected
- [ ] New branch in log-tail.ts is covered

---

## SPEC Acceptance Traceability

The SPEC.md file was not written to disk (placeholder only). Acceptance criteria sourced from the issue document `docs/cycle/issues/todo/refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless.md` `## Acceptance` section — the authoritative requirements for this cycle.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `run-cycle.ts` honors `skip_unless: <artifact>` on any step by checking for the named file in the cycle artifact directory (`docs/cycle/<cycleId>-<workflow>-<slug>/<artifact>`) immediately before spawning the agent. | Task 1 | `join(artifactDir, step.skip_unless)` |
| When the artifact is absent, the step emits `step.end status: "skipped"` (new status value alongside `ok` / `failed`) and the workflow proceeds to the next step. No agent process is spawned, no `step.start` head_sha capture, no artifact overwrite. | Task 1 | `continue` after emit; no `step.start` before the check |
| When the artifact is present, the step runs exactly as today (no behavior change for dirty-review cycles). | Task 1 | `if (!present)` guard — falls through to existing logic when present |
| Resume logic in `cli.ts` — the "first step whose name does not appear in `step.end status: ok` after the in-flight `cycle.start`" rule — treats `skipped` the same as `ok`: a skipped step is complete for resume purposes and is not re-evaluated on resume. | Task 2 + Task 4 | log-tail fix populates completedSteps; no cli.ts change needed |
| Restart policy (build/fix hard-reset on resume) is unaffected: `skip_unless` is checked before `head_sha` capture, so skipped steps never record `head_sha` and never trigger a reset on resume. | Task 1 | Insertion point before reset-eligible block (line 160) guarantees this |
| Append-only log: the new `step.end status: "skipped"` event carries `{step: <name>, reason: "skip_unless_artifact_missing", artifact: <name>}` so the audit trail explains why no agent ran. | Task 1 | Event payload includes all three fields |

---

## Testing Strategy

### Unit Tests

- **`tests/engine/log-tail.test.ts`** (Task 4): Two new cases. Uses `parseLogTail` directly with inline event strings — no I/O, no mocking. Covers: new branch adds to completedSteps; cross-cycle isolation holds.

### Integration / E2E Tests

- **`tests/engine/run-cycle.skip-unless.test.ts`** (Task 3): Real git repo in tmpdir, real `runCycle` call, fake `claude` binary. Three scenarios cover the full signal path: clean (skip), dirty (run), resume (completedSteps populated correctly). No heavy mocking — the fake binary is the minimum stub needed.

### Coverage

No per-file floor is set for `src/engine/run-cycle.ts` or `src/engine/log-tail.ts`. Aggregate floors (≥95% line, ≥75% branch, ≥90% func) must hold. The new `if (!present)` branch and the new `else if` in log-tail are directly exercised by the test scenarios above.

## Risk Assessment

- **`stat` on `artifactDir` before the dir is created**: `artifactDir` is initialized at `run-cycle.ts:105–126` before the step loop begins; it always exists by the time steps run. The `stat` on the artifact file will ENOENT cleanly. No risk.
- **`step.end` with `status:"skipped"` in `lastStepStarted` scanner**: Resolved as safe — scanner only activates on `step.start` events (backward scan), never touches bare `step.end`. No risk.
- **TypeScript type for `status`**: `StepResult.status` is `"ok" | "failed"` in `exec-bash.ts`. The new `step.end` is emitted directly via `log.emit`, not through `StepResult`. The `status` field in the log event is an untyped string — no type widening needed. No risk.
```
