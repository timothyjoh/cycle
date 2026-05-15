Write permissions are blocked in review mode. The REVIEW.md content is my text output (engine captures it); MUST-FIX.md content follows for manual write or fix-step approval.

---

# Review: Cycle 0080

## Overall Verdict
NEEDS-FIX — build step produced zero implementation.

NEEDS-FIX triggers: all 10 SPEC acceptance criteria unmet (no code written, no tests, no CLAUDE.md update).

## Code Quality Review

### Summary
The build agent was blocked by a write-permission prompt on `src/engine/run-cycle.ts` and produced only a placeholder BUILD.md ("Need write permission... Please approve the edit."). The build step exited 0 and the cycle closed `ok` — exactly the silent-success gap this cycle was meant to close. Bootstrap paradox: the guard didn't exist yet to catch itself.

### Findings
1. **Missing implementation**: `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError` do not exist in `src/engine/run-cycle.ts`. The spec-guard block ends at line 205 with no `else if` — `src/engine/run-cycle.ts:194–206`
2. **Missing import**: `spawnSync` is not imported in `run-cycle.ts` (only `writeFile, readFile, stat` present from `node:fs/promises`) — `src/engine/run-cycle.ts:1–20`
3. **Missing test file**: `tests/engine/run-cycle.empty-diff-guard.test.ts` does not exist
4. **Missing CLAUDE.md update**: "Empty-diff post-condition" bullet absent — confirmed by `grep -n "Empty-diff" CLAUDE.md` returning nothing

### Spec Compliance Checklist
- [ ] `build` step exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"build post-condition failed: no code changes detected"` — **NOT IMPLEMENTED**
- [ ] `fix` step exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"fix post-condition failed: no code changes detected"` — **NOT IMPLEMENTED**
- [ ] `build`/`fix` that produces non-empty diff is unaffected — **NOT IMPLEMENTED**
- [ ] `no_branch: true` workflow bypasses guard — **NOT IMPLEMENTED**
- [ ] Bash agent bypasses guard — **NOT IMPLEMENTED**
- [ ] Artifact written before guard fires; placeholder survives — **NOT IMPLEMENTED**
- [ ] Tests cover all 5 key scenarios — **NOT IMPLEMENTED**
- [ ] Coverage does not drop — **CANNOT VERIFY** (no new code to test)
- [ ] All existing tests still pass — likely OK (no source changes)
- [ ] No compiler/linter warnings — **CANNOT VERIFY** (no new code)

## Adversarial Test Review

### Summary
Weak — no tests exist for this cycle's feature.

### Findings
1. **Zero test coverage for new feature**: The test file `tests/engine/run-cycle.empty-diff-guard.test.ts` was never created. None of the 6 required scenarios are covered.
2. **Existing test suite unaffected**: Since no source files changed, existing tests likely pass, but this provides no signal about the unimplemented feature.

### Test Coverage
- Command run: unable to run `npm test` (permission blocked in review context)
- Line / branch / function: not measurable (no new code exists to measure)
- Regressions vs base: none expected (no source changes)
- New code without tests: N/A — no new code was written
- Specific scenarios missing tests: all 6 from PLAN.md Task 2 (empty-diff→failed for build; empty-diff→failed for fix; non-empty diff→ok; `no_branch:true` bypass; bash-agent bypass; artifact-survives-guard)

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

---

The MUST-FIX.md content (for manual write since permissions blocked in review mode):

**`docs/cycle/0080-feature-add-empty-diff-post-condition-guard-to-b/MUST-FIX.md`**

```markdown
# Must-Fix Items: Cycle 0080

## Summary
1 critical issue: build step produced zero implementation. The build agent was blocked by a write-permission prompt on `src/engine/run-cycle.ts`, wrote a placeholder artifact, and exited 0. No guard existed to catch this, so the cycle closed `ok` with no code, no tests, and no doc update. All 10 SPEC acceptance criteria are unmet.

## Tasks

- [ ] ### Task 1: Implement the empty-diff guard in `src/engine/run-cycle.ts`
  **Priority:** Critical
  **Files:** `src/engine/run-cycle.ts`
  **Problem:** `EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`, the `spawnSync` import, and the guard `else if` block are all absent. The spec-guard block ends at line 205 with no subsequent `else if`.
  **Fix:**
  1. Add `import { spawnSync } from "node:child_process";` near the top (alongside existing imports).
  2. After `formatSpecGuardError` at line 54, add:
     ```typescript
     export const EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string> = new Set(["build", "fix"]);
     export function formatBuildGuardError(stepName: string): string {
       return `${stepName} post-condition failed: no code changes detected`;
     }
     ```
  3. After the closing brace of the `if (step.name === "spec") { ... }` block (line 205), append:
     ```typescript
     } else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch) {
       const diff = spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
       if (diff.status === 0 && !diff.stdout) {
         r.status = "failed";
         r.exitCode = r.exitCode || 1;
         r.stderr = formatBuildGuardError(step.name);
       }
     }
     ```
  **Verify:** `grep -n "EMPTY_DIFF_GUARD_STEPS" src/engine/run-cycle.ts` returns a line. `npm run typecheck` exits 0.

- [ ] ### Task 2: Create `tests/engine/run-cycle.empty-diff-guard.test.ts` with all 6 scenarios
  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.empty-diff-guard.test.ts` (new file)
  **Problem:** No test file exists. All 7 test-related SPEC acceptance criteria are unmet.
  **Fix:** Follow the helper pattern from `tests/engine/run-cycle.spec-guard.test.ts`. Implement all 6 scenarios:
  - Scenario 1: `build` empty diff → `step.end status:failed`, stderr `"build post-condition failed: no code changes detected"`
  - Scenario 2: `fix` empty diff → `step.end status:failed`, stderr `"fix post-condition failed: no code changes detected"`
  - Scenario 3: non-empty diff → `step.end status:ok` (`seedTrackedFile: true`, fake claude overwrites it)
  - Scenario 4: `no_branch: true` → `step.end status:ok`
  - Scenario 5: bash agent → `step.end status:ok`
  - Scenario 6: artifact survives guard → `r.status === "failed"` AND `BUILD.md` contains fake stdout
  **Verify:** `npm test` exits 0 with all existing + 6 new tests passing. Coverage stays at line ≥ 95%, branch ≥ 75%, function ≥ 90%.

- [ ] ### Task 3: Add "Empty-diff post-condition" bullet to `CLAUDE.md`
  **Priority:** Critical
  **Files:** `CLAUDE.md`
  **Problem:** `grep -n "Empty-diff" CLAUDE.md` returns nothing.
  **Fix:** After the "Spec post-condition" bullet (CLAUDE.md line 77), insert:
  > - Empty-diff post-condition: `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>` (`{"build","fix"}`) and `formatBuildGuardError(stepName)`. After the artifact write seam, for non-bash agents on branch-based workflows, `spawnSync("git", ["diff", "HEAD"])` runs; empty stdout flips `r.status = "failed"` with stderr `"<step> post-condition failed: no code changes detected"` before `step.end` emits. Bypassed for `no_branch: true` workflows and bash agents. `EMPTY_DIFF_GUARD_STEPS` is distinct from `RESET_ELIGIBLE_STEPS` for independent evolution.
  **Verify:** `grep -n "Empty-diff post-condition" CLAUDE.md` returns exactly 1 result.
```
