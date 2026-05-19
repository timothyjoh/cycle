All context resolved. The open question from RESEARCH is answered: the issue says "before commit" but commit is engine-managed — `reflection` goes last after `documentation`. Now writing the plan.

# Implementation Plan: Cycle 0187

## Overview
Restore the `reflection` step as the final user-visible step in the `feature` workflow (`src/defaults/workflows.yml` and `.cycle/workflows.yml`), then update step-count assertions in two test files from 8→9.

## Current State (from Research)
- `src/defaults/workflows.yml` and `.cycle/workflows.yml` both have 8 feature steps ending with `documentation`; `reflection` was removed by commit `41d5f26`
- Engine (`run-cycle.ts:265–266`) already handles `reflection`: calls `ingestReflection` on success, emits `reflection.skipped` on failure (non-fatal) — zero engine changes needed
- `src/defaults/prompts/reflection.md` exists
- Two test files assert `deepEqual([..., "documentation"])` and `step count === 8`
- `sync-defaults` copies `src/defaults/` → `.cycle/`; both files are currently byte-identical

## Desired End State
- Feature workflow has 9 steps; `reflection` is last: `[..., "documentation", "reflection"]`
- Both `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts` assert 9 steps including `"reflection"` at position 8 (0-indexed)
- `npm test` passes; `npm run typecheck` passes; no regressions

## What We're NOT Doing
- No `commit` step added — commit is engine-managed; issue's "before commit" phrasing is legacy
- No engine changes (`run-cycle.ts` already handles reflection)
- No changes to other workflows (`document`, `quickfix`, `e2e-tests`)
- No new test file creation — updating two existing files only

## Implementation Approach
Three-step slice: (1) edit the canonical source `src/defaults/workflows.yml`, (2) propagate via `npm run sync-defaults`, (3) update both test files. Each slice is independently verifiable. No mocking needed — tests parse real YAML files.

---

## Task 1: Add `reflection` step to `src/defaults/workflows.yml`

### Overview
Insert the reflection step as step 9 (last) in the feature workflow, then propagate to `.cycle/workflows.yml` via sync-defaults.

### Changes Required
**File**: `src/defaults/workflows.yml`

At line 27 (after `documentation`), append:
```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

Feature steps block becomes:
```yaml
    steps:
      - { name: spec,          agent: claudecode, prompt: prompts/spec.md }
      - { name: research,      agent: claudecode, prompt: prompts/research.md }
      - { name: plan,          agent: claudecode, prompt: prompts/plan.md }
      - { name: build,         agent: claudecode, prompt: prompts/build.md }
      - { name: review,        agent: claudecode, prompt: prompts/review.md }
      - { name: fix,           agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,        agent: bash,       command: scripts/verify.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
```

**Command**: `npm run sync-defaults` — propagates `src/defaults/` to `.cycle/`

### Success Criteria
- [ ] `src/defaults/workflows.yml` feature steps list ends with `reflection`
- [ ] `.cycle/workflows.yml` feature steps list ends with `reflection` (sync-defaults ran)
- [ ] Step count is 9 in both files
- [ ] No `commit` step present in either file

---

## Task 2: Update step-order assertions in both test files

### Overview
Both test files use `deepEqual` on the step names array and assert `step count === 8`. Update both to include `"reflection"` and count 9.

### Changes Required

**File**: `tests/defaults/feature-yaml.test.ts`

Change line:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"]);
  assert.equal(feature.steps.length, 8, "regression guard: step count should be 8");
```
To:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation", "reflection"]);
  assert.equal(feature.steps.length, 9, "regression guard: step count should be 9");
```

**File**: `tests/dogfood/feature-yaml.test.ts`

Change lines in the first test (step sequence):
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"]);
  assert.equal(feature.steps.length, 8, "regression guard: step count should be 8");
```
To:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation", "reflection"]);
  assert.equal(feature.steps.length, 9, "regression guard: step count should be 9");
```

Note: the second test in `tests/dogfood/feature-yaml.test.ts` (engine-managed commit check) already asserts `!hasCommitStep` — no change needed there.

### Success Criteria
- [ ] Both test files assert `"reflection"` at position 8 in the `deepEqual` array
- [ ] Both test files assert `step count === 9`
- [ ] `npm test` passes with no failures

---

## Task 3: Verify full test suite and typecheck

### Overview
Run the full test suite and typecheck to confirm no regressions anywhere.

### Changes Required
No code changes — verification only.

**Commands**:
```
npm run typecheck
npm test
```

### Success Criteria
- [ ] `npm run typecheck` exits 0 with no warnings
- [ ] `npm test` passes all tests (all suite assertions green)
- [ ] Coverage does not regress vs master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] reflection step appears before commit in src/defaults/workflows.yml feature workflow` | Task 1 | "Before commit" = last step; commit is engine-managed, not a workflow step |
| `[ ] reflection step appears before commit in .cycle/workflows.yml feature workflow` | Task 1 | Propagated via `npm run sync-defaults` |
| `[ ] tests/defaults/feature-yaml.test.ts step-order assertion includes reflection` | Task 2 | deepEqual array updated to include `"reflection"` |
| `[ ] tests/dogfood/feature-yaml.test.ts step-order assertion includes reflection` | Task 2 | deepEqual array updated to include `"reflection"` |
| `[ ] npm test passes with no regressions` | Task 3 | Full suite + typecheck |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/feature-yaml.test.ts`: parses `src/defaults/workflows.yml` directly — real YAML, no mocking
- `tests/dogfood/feature-yaml.test.ts`: parses `.cycle/workflows.yml` directly — real YAML, no mocking
- Second dogfood test (engine-managed commit check) needs no changes; `!hasCommitStep` still holds

### Integration / E2E Tests
- No new integration tests needed — the engine's reflection handling is already tested elsewhere; this cycle only adds the step to the workflow definition

## Risk Assessment
- **sync-defaults divergence**: If `npm run sync-defaults` fails or produces unexpected output, `.cycle/workflows.yml` and `src/defaults/workflows.yml` diverge. Mitigation: run sync-defaults and immediately diff both files before proceeding.
- **YAML formatting**: Inline flow style `{ name: reflection, ... }` must match surrounding steps exactly to avoid YAML parse warnings. Mitigation: copy the `documentation` line format exactly.
- **Dogfood second test false confidence**: The `!hasCommitStep` assertion already passes and will continue to pass — no risk of regression there.
