File writes are blocked by permissions in this session. I'll output both documents as the engine would capture them from stdout.

---

# Review: Cycle 0117

## Overall Verdict

NEEDS-FIX — all 4 implementation tasks from PLAN.md are unimplemented. The build step exited 0 but made zero code changes; BUILD.md is a permission-request placeholder, not a completion record.

---

## Code Quality Review

### Summary

Feature entirely undelivered. `src/engine/run-cycle.ts` has no `skip_unless` predicate, `src/engine/log-tail.ts` has no `step.end status:"skipped"` branch, `tests/engine/run-cycle.skip-unless.test.ts` does not exist, `tests/engine/log-tail.test.ts` has no new cases. Codebase is identical to pre-build state.

### Findings

1. **Task 1 not implemented**: No `skip_unless` predicate in `src/engine/run-cycle.ts`. Step loop goes directly from line 158 to line 160 with no new block. `step.skip_unless` is never read at runtime.
2. **Task 2 not implemented**: `src/engine/log-tail.ts:54–58` still has only two branches (`step.end status:"ok"` and `step.skipped`). The `step.end status:"skipped"` else-if is absent.
3. **Task 3 not implemented**: `tests/engine/run-cycle.skip-unless.test.ts` does not exist.
4. **Task 4 not implemented**: `tests/engine/log-tail.test.ts` unchanged (224 lines); no new cases for `step.end status:"skipped"`.
5. **False-OK build**: `BUILD.md` reads "The write tools and bash file-writes are all requiring approval." Build agent exited 0 having delivered nothing — permission wall was hit, no fallback attempt made.

### Spec Compliance Checklist

- [ ] `run-cycle.ts` honors `skip_unless` by checking named artifact before spawning agent — **NOT IMPLEMENTED**
- [ ] Absent artifact → `step.end status:"skipped"`, no agent spawned, no `step.start` — **NOT IMPLEMENTED**
- [ ] Present artifact → step runs as today — **NOT IMPLEMENTED**
- [ ] Resume logic treats `status:"skipped"` same as `ok` via log-tail fix — **NOT IMPLEMENTED**
- [ ] Restart policy unaffected (check fires before head_sha capture) — **NOT IMPLEMENTED**
- [ ] Audit trail: event carries `reason:"skip_unless_artifact_missing"` + `artifact` — **NOT IMPLEMENTED**

### SPEC→PLAN Traceability

PLAN.md `## SPEC Acceptance Traceability` section (lines 233–246) maps all 6 AC bullets to tasks. Structurally complete. Traceability defect: tasks were never executed, not that they were unplanned.

---

## Adversarial Test Review

### Summary

No tests to review — none were written.

### Findings

1. **Task 3 absent**: `tests/engine/run-cycle.skip-unless.test.ts` does not exist. All three planned scenarios (clean path, dirty path, resume) are uncovered.
2. **Task 4 absent**: No new cases in `tests/engine/log-tail.test.ts`. The new log-tail branch has zero coverage.

### Test Coverage

- Command run: not run (no new code to cover)
- Line / branch / function: unchanged vs base
- Regressions vs base: none
- New code without tests: N/A — no new code exists
- Missing scenarios: clean-path skip, dirty-path run, resume-across-skipped, log-tail `step.end status:"skipped"` branch

---

## Doc-vs-Code Claim Verification

No documentation prose changed in cycle 0117 build step; pass skipped.

---

---

# Must-Fix Items: Cycle 0117

## Summary

1 critical issue: entire feature unimplemented. Build agent was blocked by write permissions and exited 0 without delivering any code.

## Tasks

- [ ] ### Task 1: Implement `skip_unless` predicate in `run-cycle.ts`
  **Priority:** Critical
  **Files:** `src/engine/run-cycle.ts`
  **Problem:** `step.skip_unless` is parsed by `workflow.ts:10` into `Step.skip_unless?: string` but never evaluated in the step loop. The fix step always spawns an agent regardless of whether `MUST-FIX.md` exists.
  **Fix:** Insert the following block after line 158 (closing `}` of the retry-skip block), before the `if (isResetEligible ...)` at line 160:
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
  `stat` is already imported at line 21. `join` is already imported.
  **Verify:** `npm run typecheck` passes; `grep -n "skip_unless" src/engine/run-cycle.ts` returns the new block.

- [ ] ### Task 2: Add `step.end status:"skipped"` branch to `log-tail.ts`
  **Priority:** Critical
  **Files:** `src/engine/log-tail.ts`
  **Problem:** `parseLogTail` collects `completedSteps` at lines 52–58 but has no branch for `step.end` with `status === "skipped"`. A resumed cycle where fix was skipped will re-run fix because it appears absent from `completedSteps`.
  **Fix:** Replace lines 52–58 with:
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
  **Verify:** `npm run typecheck` passes; existing log-tail tests still pass.

- [ ] ### Task 3: Create `tests/engine/run-cycle.skip-unless.test.ts`
  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.skip-unless.test.ts` (new)
  **Problem:** File does not exist. Three scenarios specified in PLAN.md Task 3 have no coverage.
  **Fix:** Create the file using the canonical fake-git-repo pattern from `tests/engine/run-cycle.skip-completed.test.ts:49–77`. Three scenarios:
  - **Scenario 1 (clean path):** Fake `claude` binary exits 1 with "should not run" to stderr. Artifact dir exists but `MUST-FIX.md` absent. Run `runCycle`. Assert log contains `step.end` with `status:"skipped"`, `step:"fix"`, `reason:"skip_unless_artifact_missing"`, `artifact:"MUST-FIX.md"`. Assert log does NOT contain `step.start` with `step:"fix"`. Assert cycle ends `status:"ok"`.
  - **Scenario 2 (dirty path):** Fake `claude` exits 0. Write `MUST-FIX.md` in artifact dir. Run `runCycle`. Assert log contains `step.start` with `step:"fix"`. Assert log contains `step.end` with `status:"ok"`, `step:"fix"`. Assert log does NOT contain `status:"skipped"`.
  - **Scenario 3 (resume):** Call `parseLogTail` on pre-seeded log containing `cycle.start` + `step.end {status:"skipped", step:"fix", ...}`. Assert "fix" appears in `completedSteps`. Assert `lastStepStarted` is `undefined`.
  **Verify:** `npm test` passes with all three new test scenarios green.

- [ ] ### Task 4: Add two test cases to `tests/engine/log-tail.test.ts`
  **Priority:** Critical
  **Files:** `tests/engine/log-tail.test.ts`
  **Problem:** The new `else if` branch in Task 2 has zero coverage. No test exercises `step.end status:"skipped"` path.
  **Fix:** After the existing `"parseLogTail counts step.skipped as completed"` test (around line 188), add:
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
  **Verify:** `npm test` passes; `npm run test:coverage && npm run check:coverage` — aggregate floors hold (Line ≥ 95%, Branch ≥ 75%, Func ≥ 90%).
