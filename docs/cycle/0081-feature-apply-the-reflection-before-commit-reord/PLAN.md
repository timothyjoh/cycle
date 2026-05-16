All four edit targets confirmed. Writing the plan now.

# Implementation Plan: Cycle 0081

## Overview
Swap `reflection` before `commit` in both workflow files, update the step-order test assertion to match, and add an invariant bullet to CLAUDE.md explaining why the ordering matters. No engine source changes.

## Current State (from Research)
- `src/defaults/workflows.yml:14-25`: steps end with `…verify, commit, pr, reflection, documentation` — `reflection` is at index 9 (post-`pr`).
- `.cycle/workflows.yml:17-30`: steps end with `…verify, commit, reflection` — `reflection` is at index 8 (post-`commit`). Lines 11-16 carry the LOCAL DIVERGENCE comment block that must survive untouched.
- `tests/defaults/feature-yaml.test.ts:11`: `assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection", "documentation"])` — order is wrong, count stays 11.
- `CLAUDE.md:73`: reflection-step bullet exists, but has no ordering invariant sentence.

## Desired End State
After this cycle:
- Both workflow files have `reflection` immediately before `commit` in their feature step lists.
- The test assertion matches the new `src/defaults/` order.
- CLAUDE.md's reflection bullet ends with a sentence explaining the ordering invariant.
- `npm test` exits 0 with no regressions, no new warnings.

## What We're NOT Doing
- No changes to reflection step implementation logic (`src/engine/reflection.ts`).
- No changes to how reflection artifacts are named, stored, or ingested.
- No changes to any other workflow (quickfix, document, e2e-tests) step orders.
- No new test files (existing assertion covers the invariant once updated).
- No changes to README.md.

## Implementation Approach
Four surgical line-level edits, applied in dependency order (workflow files first, then test, then docs). Each edit is isolated — no cascading effects on engine source. Verify with `npm test` after all four edits are applied.

---

## Task 1: Swap `reflection` before `commit` in `src/defaults/workflows.yml`

### Overview
Move the `reflection` step entry from index 9 (after `pr`) to index 7 (before `commit`). Step count stays 11; `documentation` stays last.

### Changes Required
**File**: `src/defaults/workflows.yml`

Current lines 22–25:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: commit,   agent: bash,       command: scripts/commit.sh }
      - { name: pr,       agent: bash,       command: scripts/pr.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

New lines 22–25:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,   agent: bash,       command: scripts/commit.sh }
      - { name: pr,       agent: bash,       command: scripts/pr.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

### Success Criteria
- [ ] `reflection` step appears at index 7 (between `verify` and `commit`)
- [ ] Step count remains 11
- [ ] YAML parses without errors

---

## Task 2: Swap `reflection` before `commit` in `.cycle/workflows.yml`

### Overview
Move the `reflection` step from index 8 (after `commit`) to index 7 (before `commit`) in the dogfood feature workflow. The LOCAL DIVERGENCE comment block (lines 11–16) must remain byte-identical.

### Changes Required
**File**: `.cycle/workflows.yml`

Current lines 28–30:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: commit,   agent: bash,       command: scripts/commit-trunk.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

New lines 28–30:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,   agent: bash,       command: scripts/commit-trunk.sh }
```

LOCAL DIVERGENCE block (lines 11–16) is unchanged. No `pr` step added.

### Success Criteria
- [ ] `reflection` appears at index 7 (between `verify` and `commit`)
- [ ] `no_branch: true` and `commit-trunk.sh` still present; no `pr` step
- [ ] LOCAL DIVERGENCE comment block (lines 11–16) byte-identical to before
- [ ] YAML parses without errors

---

## Task 3: Update step-order assertion in `tests/defaults/feature-yaml.test.ts`

### Overview
Update the `assert.deepEqual` call on line 11 to match the new step order. Step count stays 11.

### Changes Required
**File**: `tests/defaults/feature-yaml.test.ts`

Current line 11:
```ts
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection", "documentation"]);
```

New line 11:
```ts
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
```

Line 12 (`assert.equal(feature.steps.length, 11, …)`) is unchanged.

### Success Criteria
- [ ] Assertion array has `"reflection"` at index 7, `"commit"` at index 8, `"pr"` at index 9
- [ ] Step count assertion still 11
- [ ] Test passes against the updated `src/defaults/workflows.yml`

---

## Task 4: Add ordering invariant bullet to `CLAUDE.md`

### Overview
Append an invariant sentence to the end of the reflection-step bullet at `CLAUDE.md:73` explaining why `reflection` must precede `commit`.

### Changes Required
**File**: `CLAUDE.md` (line 73)

Locate the reflection-step bullet (starts with `- Reflection step: src/engine/reflection.ts…`). Append to the end of that bullet (after the final period before the line break):

> `Ordering invariant: \`reflection\` must precede \`commit\` in the workflow so that reflection artifacts (\`docs/cycle/issues/raw/refl-<cycleId>-*.md\`) are committed under the cycle that produced them and are not scooped by the next cycle's commit step.`

The full bullet remains a single unbroken line consistent with the CLAUDE.md style (no sub-bullets).

### Success Criteria
- [ ] Reflection-step bullet at line 73 ends with the invariant sentence
- [ ] No new lines or sub-bullets introduced; single-line bullet style preserved
- [ ] `npm run typecheck` still exits 0 (doc-only change; typecheck is a sanity guard)

---

## Task 5: Verify — run full test suite

### Overview
Run `npm test` to confirm all tests pass with no regressions after the four edits.

### Changes Required
No code changes. Execute:
```sh
npm test
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] `tests/defaults/feature-yaml.test.ts` passes with the new assertion
- [ ] No other test regressions
- [ ] No compiler/linter warnings

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/workflows.yml: reflection step appears before commit step` | Task 1 | |
| `[ ] .cycle/workflows.yml: reflection appears before commit, LOCAL DIVERGENCE block intact and unchanged` | Task 2 | |
| `[ ] tests/defaults/feature-yaml.test.ts: step-order assertion updated to [..."reflection","commit","pr"...]` | Task 3 | |
| `[ ] CLAUDE.md: invariant bullet present under reflection-step architecture note` | Task 4 | |
| `[ ] npm test exits 0 with no regressions` | Task 5 | |
| `[ ] All existing tests still pass` | Task 5 | |
| `[ ] No compiler/linter warnings introduced` | Task 5 | |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/feature-yaml.test.ts`: primary guard. After Task 1 + Task 3, this test must pass. It reads `src/defaults/workflows.yml` directly and asserts exact step order. No mocking needed — reads the real YAML file.
- All other test files: unchanged; run as regression suite in Task 5.

### Integration / E2E Tests
- No engine behavior changes, so no integration test additions needed.
- `npm run typecheck` as a sanity check after Task 4 (doc-only change touches no TS).

## Risk Assessment
- **`.cycle/workflows.yml` LOCAL DIVERGENCE block accidentally modified**: Mitigation — read the block verbatim before editing and verify it is byte-identical post-edit. The edit touches only lines 29–30.
- **Step count mismatch after reorder**: Mitigation — count stays 11 in both files; the test's `assert.equal(length, 11)` is unchanged and guards this.
- **Sync-defaults clobbering `.cycle/workflows.yml`**: Not a risk for this cycle — the divergence guard will skip `.cycle/workflows.yml` as before. Do not run `sync-defaults` during this cycle.
