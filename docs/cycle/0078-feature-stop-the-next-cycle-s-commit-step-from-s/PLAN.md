All decisions made. Writing the plan now.

# Implementation Plan: Cycle 0078

## Overview
Move the `reflection` step before `commit` in both `feature` workflow files so that reflection artifacts (`REFLECTION.md` and `refl-<cycleId>-*.md` raws) are staged and committed under the cycle that produced them, not scooped by the next cycle's commit step.

## Current State (from Research)
- `src/defaults/workflows.yml` order: `…verify → commit → pr → reflection → documentation`
- `.cycle/workflows.yml` order: `…verify → commit → reflection` (trunk-based, `no_branch: true`)
- Both commit scripts use a greedy `git status --porcelain` walk with no exclusion for reflection artifacts; reflection files written after commit are left untracked for the next cycle to scoop
- `reflection` is already non-fatal in `run-cycle.ts` (hard-coded in the non-fatal set); when exec-fails, no files are written to disk at all, so commit seeing zero reflection artifacts is correct behavior
- `tests/defaults/feature-yaml.test.ts` hard-codes the step name array and count — must be updated

## Desired End State
- `src/defaults/workflows.yml` step order: `spec, research, plan, build, review, fix, verify, reflection, commit, pr, documentation`
- `.cycle/workflows.yml` step order: `spec, research, plan, build, review, fix, verify, reflection, commit`
- `tests/defaults/feature-yaml.test.ts` asserts the new order and count (still 11)
- `CLAUDE.md` documents the reflection-artifact ownership invariant
- `npm test` passes, coverage not decreased

## What We're NOT Doing
- Moving `documentation` before `commit` — SPEC scopes only reflection artifacts
- Changing `commit.sh` or `commit-trunk.sh` denylist logic — covered by `refl-0029`
- Changing reflection prompt or what `ingestReflection` writes
- Implementing option (b): no `commit-reflection.sh` script, no new bash step
- Re-attributing reflection artifacts already on `master`
- Modifying `run-cycle.ts` non-fatal handling — the existing path already does the right thing after reorder

## Implementation Approach
Option (a): reorder `reflection` before `commit`. When reflection succeeds, it writes `REFLECTION.md` to `docs/cycle/<cycleId>-*/` and `refl-<cycleId>-*.md` to `docs/cycle/issues/raw/`; then `commit` (or `commit-trunk.sh`) stages them under this cycle's title via the existing greedy walk. When reflection exec-fails (non-fatal), no files are written — `commit` stages zero reflection artifacts and exits 0. No engine changes, no new scripts, minimal surface area.

---

## Task 1: Reorder `reflection` before `commit` in `src/defaults/workflows.yml`

### Overview
Move the `reflection` line from after `pr` to before `commit` in the shipped default feature workflow.

### Changes Required
**File**: `src/defaults/workflows.yml`

Current lines 22–25:
```yaml
      - { name: commit,        agent: bash,       command: scripts/commit.sh }
      - { name: pr,            agent: bash,       command: scripts/pr.sh }
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

Replace with:
```yaml
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,        agent: bash,       command: scripts/commit.sh }
      - { name: pr,            agent: bash,       command: scripts/pr.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

### Success Criteria
- [ ] `src/defaults/workflows.yml` lists `reflection` immediately before `commit` in the `feature` workflow
- [ ] `pr` and `documentation` positions are unchanged relative to each other
- [ ] File parses as valid YAML

---

## Task 2: Reorder `reflection` before `commit` in `.cycle/workflows.yml`

### Overview
Apply the same reorder to the dogfood trunk-based workflow, preserving the existing `no_branch: true` divergence and comment block.

### Changes Required
**File**: `.cycle/workflows.yml`

Current lines 29–30:
```yaml
      - { name: commit,     agent: bash,       command: scripts/commit-trunk.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

Replace with:
```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,     agent: bash,       command: scripts/commit-trunk.sh }
```

The `document` and `e2e-tests` workflows below are untouched — neither contains a `reflection` step.

### Success Criteria
- [ ] `.cycle/workflows.yml` lists `reflection` immediately before `commit` in the `feature` workflow
- [ ] The `no_branch: true` divergence comment block (lines 11–16) is intact
- [ ] `document` and `e2e-tests` workflows are unchanged
- [ ] File parses as valid YAML

---

## Task 3: Update `feature-yaml.test.ts` to assert new step order

### Overview
The test on line 11 hard-codes the exact step name array; it will fail with the old order after the YAML edits. Update the expected array to match the new order.

### Changes Required
**File**: `tests/defaults/feature-yaml.test.ts`

Current line 11:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection", "documentation"]);
```

Replace with:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
```

Line 12 (`assert.equal(feature.steps.length, 11, …)`) is unchanged — step count stays 11.

### Success Criteria
- [ ] Test asserts `reflection` before `commit` in the expected name array
- [ ] Step count guard remains `11`
- [ ] `npm test` runs this test and it passes

---

## Task 4: Document the reflection-artifact invariant in `CLAUDE.md`

### Overview
SPEC requires a CLAUDE.md note explaining which commit owns reflection artifacts and why.

### Changes Required
**File**: `CLAUDE.md`

In the **"Workflow defaults"** section (currently has 3 bullets), append:
```
- Reflection artifacts — `REFLECTION.md` and `refl-<cycleId>-*.md` raws in `docs/cycle/issues/raw/` — are committed under the cycle that produced them, not the next cycle. This invariant holds because `reflection` runs before `commit` in the `feature` workflow; if reflection is skipped (non-fatal), no artifacts are written so commit sees zero reflection files to stage.
```

### Success Criteria
- [ ] New bullet appears in the "Workflow defaults" section
- [ ] Note explains both the mechanism and the non-fatal case

---

## Task 5: Verify full test suite passes

### Overview
Run `npm test` to confirm all existing tests still pass after the YAML and test-assertion changes.

### Changes Required
No code changes — verification only.

### Success Criteria
- [ ] `npm test` exits 0
- [ ] Coverage (line ≥ 95%, branch ≥ 75%, function ≥ 90%) not decreased
- [ ] No TypeScript errors (`npm run typecheck`)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Running a full feature cycle end-to-end: the cycle's REFLECTION.md and any refl-<cycleId>-*.md files are committed under that cycle's title, not the next cycle's.` | Task 1 + Task 2 | Reordering reflection before commit in both workflow files achieves this end-to-end |
| `[ ] reflection.skipped (parse error or exec failure) does not block the cycle from reaching cycle.end status:ok.` | WAIVED — existing non-fatal handling in run-cycle.ts already satisfies this; no code change needed; Task 5 verifies via existing reflection exec-failed tests |
| `[ ] Regression test passes that verifies the chosen fix: either a workflow-step-ordering assertion (option a) or an integration test confirming file-to-commit partitioning (option b).` | Task 3 | Updating feature-yaml.test.ts to assert reflection before commit is the option (a) regression test |
| `[ ] Both src/defaults/workflows.yml and .cycle/workflows.yml reflect the new step order or new step, and the .cycle/ copy preserves its existing no_branch: true / trunk divergence comment.` | Task 1 + Task 2 | Task 1 edits src/defaults, Task 2 edits .cycle/ while explicitly preserving the divergence block |
| `[ ] CLAUDE.md documents the resulting invariant (which commit owns reflection artifacts and why).` | Task 4 | |
| `[ ] All existing tests still pass.` | Task 5 | |
| `[ ] No compiler/linter warnings introduced.` | Task 5 | typecheck run in Task 5 verification |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/feature-yaml.test.ts` — updated to assert `reflection` precedes `commit`; no new mocking needed, reads real YAML file

### Integration / E2E Tests
- Existing `tests/engine/run-cycle.reflection.test.ts` covers exec-failed (non-fatal) and success paths — no changes needed, continue to pass
- Existing `tests/defaults/commit-staging.test.ts` covers commit scripts — no changes needed
- `npm run typecheck` confirms no type regressions

## Risk Assessment
- **`sync-defaults` clobber**: `.cycle/workflows.yml` is flagged as locally divergent by the sync guard — no risk of it being overwritten without `--force`. Both files are edited in the same cycle so they stay in sync.
- **Resume correctness**: Adding `reflection` at a new index position changes `startStepIndex` math in `parseLogTail` for in-flight cycles at the moment of deploy, but that only affects the current live run. This cycle introduces the change as part of its own commit, so the next cycle starts fresh with the new order.
- **`RESET_ELIGIBLE_STEPS` / `SKIP_ELIGIBLE_STEPS`**: `reflection` is in neither set; reordering it does not affect the reset or skip-completed policies for `build`/`fix`.
