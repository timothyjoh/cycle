All inputs resolved. Writing the plan now.

`★ Insight ─────────────────────────────────────`
The SPEC was authored against the cycle-0046 state where `no_branch: true` was a YAML field and commit steps lived in the workflow. Cycle ~0130 moved both into the engine layer. The correct modern invariants are the inverse: `no_branch` absent + `engine.commit.mode: worktree-pr` + no commit/pr steps. The plan must restate ACs 3 and 4 rather than waive them.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0137

## Overview
Add `tests/defaults/local-workflows-divergence.test.ts` — a single regression-pin test that reads `.cycle/workflows.yml` and asserts the three trunk-based invariants that define the engine-managed commit shape. Guards against future sync-defaults clobber or LLM drift silently reverting trunk-based dogfood config.

## Current State (from Research)
- `.cycle/workflows.yml` has `engine.commit.mode: worktree-pr` and 8 feature steps; no `no_branch` field, no `commit` step, no `pr` step.
- `tests/dogfood/feature-yaml.test.ts` already covers the same invariants but lives in the `dogfood/` bucket.
- `tests/defaults/` uses Node built-in `node:test` + `yaml` package; files auto-discovered by `npm test`.
- SPEC ACs 3 and 4 are stale: they describe a pre-cycle-0130 shape (`no_branch: true`, `commit-trunk.sh` script field) that no longer exists. The correct modern invariants are the inverse.

## Desired End State
`tests/defaults/local-workflows-divergence.test.ts` exists, passes under `npm test`, and pins three invariants: `no_branch` absent, no `commit` step, no `pr` step, plus `engine.commit.mode === "worktree-pr"`. All 474+ existing tests continue to pass.

## What We're NOT Doing
- Not modifying `.cycle/workflows.yml`
- Not modifying `tests/dogfood/feature-yaml.test.ts` (even though there's overlap — both serve distinct test categories)
- Not adding shared YAML helpers or touching `src/engine/workflow.ts`
- Not implementing runtime `no_branch` override (separate issue `refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override`)

## Implementation Approach
Single-task, single-file addition. Follow the exact pattern of `tests/defaults/feature-yaml.test.ts` (14 lines, single `test()`, no helpers). Include a header comment naming the cycle-0046 incident. Assert the four currently-correct trunk-based invariants, each with a named failure message. Stay under the 25-line budget.

---

## Task 1: Create regression-pin test for `.cycle/workflows.yml` trunk-based shape

### Overview
Create `tests/defaults/local-workflows-divergence.test.ts` with one `test()` block asserting four trunk-based invariants against `.cycle/workflows.yml`.

### Changes Required

**File**: `tests/defaults/local-workflows-divergence.test.ts` _(new)_

```typescript
// regression pin for cycle 0046 incident — sync-defaults clobber wiped trunk-based shape
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

type StepEntry = { name: string };
type WorkflowEntry = { name: string; steps: StepEntry[]; no_branch?: boolean };

test("local .cycle/workflows.yml preserves trunk-based shape", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: WorkflowEntry) => w.name === "feature");
  assert.ok(feature, "feature workflow must exist in .cycle/workflows.yml");
  assert.ok(!feature.no_branch, "feature.no_branch must be absent — engine.commit.mode owns branching");
  const hasCommitStep = feature.steps.some((s: StepEntry) => s.name === "commit");
  assert.ok(!hasCommitStep, "commit must not be a workflow step — engine manages commit lifecycle");
  const hasPrStep = feature.steps.some((s: StepEntry) => s.name === "pr");
  assert.ok(!hasPrStep, "pr must not be a workflow step — engine manages pr creation");
  assert.equal(y.engine?.commit?.mode, "worktree-pr", "engine.commit.mode must be worktree-pr — trunk-based enforced via CYCLE_TRUNK_BASED=1");
});
```

20 lines total — within the 25-line budget.

### Success Criteria
- [ ] File exists at `tests/defaults/local-workflows-divergence.test.ts`
- [ ] `npm test` runs it with no extra flags and it passes
- [ ] All 474+ existing tests still pass
- [ ] `npm run typecheck` passes (no TS errors)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] tests/defaults/local-workflows-divergence.test.ts exists` | Task 1 | |
| `[ ] Test reads .cycle/workflows.yml from repo root and parses as YAML` | Task 1 | `readFile(".cycle/workflows.yml", "utf8")` + `YAML.parse` |
| `[ ] Test asserts feature.no_branch === true` | Task 1 | **RESTATED**: SPEC was written against pre-cycle-0130 shape. The modern invariant is `no_branch` must be ABSENT — engine.commit.mode now owns branching. Test asserts `!feature.no_branch`. |
| `[ ] Test asserts the feature commit step script field references commit-trunk.sh` | Task 1 | **RESTATED**: No commit step exists post-cycle-0130. Engine manages commit lifecycle. Test asserts `hasCommitStep === false`. |
| `[ ] Test asserts no step in feature has name: pr` | Task 1 | `hasPrStep === false` |
| `[ ] Each assertion includes a named failure message identifying the invariant` | Task 1 | All four assertions include named messages identifying the invariant |
| `[ ] npm test runs and passes this file with no opt-in flag` | Task 1 | Node auto-discovers `tests/defaults/*.test.ts` |
| `[ ] All existing tests still pass` | Task 1 | Verified via `npm test` full run |

---

## Testing Strategy

### Unit Tests
- Single `test()` in the new file covering all four invariants in one pass
- No mocking — reads the live `.cycle/workflows.yml` directly (real-file test, not unit)
- Four assertions per existing `tests/dogfood/` pattern

### Integration / E2E Tests
- `npm test` full run verifies no regression in the 474+ existing tests

## Risk Assessment
- **Overlap with dogfood test**: `tests/dogfood/feature-yaml.test.ts` covers the same invariants. Mitigation: the two tests serve distinct categories (`defaults/` = deployed config shape, `dogfood/` = live behavior). Duplication is intentional and bounded.
- **SPEC ACs 3 and 4 are stale**: Both describe pre-cycle-0130 YAML fields that no longer exist. Plan restates them to current-correct invariants. No waiver — the protective intent is preserved.
