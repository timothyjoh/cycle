All questions resolved. Writing plan to stdout now.

# Implementation Plan: Cycle 0101

## Overview
Insert the `reflection` workflow step (before `commit`) into both `src/defaults/workflows.yml` and `.cycle/workflows.yml`, update the step-order test assertion, and add an ordering invariant to `CLAUDE.md`. Four surgical edits; no engine logic changes.

## Current State (from Research)

Both YAML files have `reflection` **entirely absent** (not misplaced — deleted by a prior regression in cycle ~0079). `src/defaults/workflows.yml` has 10 feature steps; `.cycle/workflows.yml` has 8. The test at `tests/defaults/feature-yaml.test.ts:11–12` asserts 10 steps with no `reflection`. `CLAUDE.md` is 60 lines and has no ordering invariant sentence anywhere.

Exact insert points confirmed:
- `src/defaults/workflows.yml:22` — reflection goes between line 21 (`verify`) and line 22 (`commit`)
- `.cycle/workflows.yml:29` — reflection goes between line 28 (`verify`) and line 29 (`commit`)
- LOCAL DIVERGENCE block occupies `.cycle/workflows.yml:11–16` exactly; survives untouched

## Desired End State

```
src/defaults/workflows.yml  feature steps: 11 items, reflection at index 7
.cycle/workflows.yml        feature steps: 9 items, reflection at index 7
tests/defaults/feature-yaml.test.ts  deepEqual has reflection at index 7, count = 11
CLAUDE.md                   Architecture section has ordering-invariant bullet
npm test                    exits 0
```

## What We're NOT Doing

- No changes to `src/engine/reflection.ts`
- No changes to any other workflow (quickfix, document, e2e-tests)
- No `npm run sync-defaults` (would clobber `.cycle/workflows.yml` LOCAL DIVERGENCE block)
- No new test files
- No changes to reflection prompt, artifact naming, or ingestion

## Implementation Approach

Four independent file edits applied in sequence, then a single `npm test` run. Because Tasks 1–4 touch different files with no runtime dependencies between them, they can be reviewed in any order but must all be complete before the Task 5 verification run. The YAML indent pattern is one leading space + 5 spaces per RESEARCH (actually 6 spaces per observed file content) — follow the surrounding line's exact indentation.

---

## Task 1: Insert `reflection` step into `src/defaults/workflows.yml`

### Overview
Add one line to the feature workflow between `verify` and `commit`, making `reflection` index 7 (0-based) of 11 total steps.

### Changes Required

**File**: `src/defaults/workflows.yml`

After line 21:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
```
Insert:
```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

Resulting feature steps block (lines 15–25 after edit):
```yaml
      - { name: spec,     agent: claudecode, prompt: prompts/spec.md }
      - { name: research, agent: claudecode, prompt: prompts/research.md }
      - { name: plan,     agent: claudecode, prompt: prompts/plan.md }
      - { name: build,    agent: claudecode, prompt: prompts/build.md }
      - { name: review,   agent: claudecode, prompt: prompts/review.md }
      - { name: fix,      agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,   agent: bash,       command: scripts/commit.sh }
      - { name: pr,       agent: bash,       command: scripts/pr.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

### Success Criteria
- [ ] File parses as valid YAML
- [ ] Feature workflow has exactly 11 steps
- [ ] Step at index 7 is `reflection`
- [ ] Steps 8–10 are `commit`, `pr`, `documentation`
- [ ] No other workflows modified

---

## Task 2: Insert `reflection` step into `.cycle/workflows.yml`

### Overview
Mirror Task 1 for the dogfood copy, inserting between `verify` (line 28) and `commit` (line 29). LOCAL DIVERGENCE block (lines 11–16) must survive byte-identical.

### Changes Required

**File**: `.cycle/workflows.yml`

After line 28:
```yaml
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
```
Insert:
```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

Resulting feature steps block (lines 22–30 after edit):
```yaml
      - { name: spec,     agent: claudecode, prompt: prompts/spec.md }
      - { name: research, agent: claudecode, prompt: prompts/research.md }
      - { name: plan,     agent: claudecode, prompt: prompts/plan.md }
      - { name: build,    agent: claudecode, prompt: prompts/build.md }
      - { name: review,   agent: claudecode, prompt: prompts/review.md }
      - { name: fix,      agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,   agent: bash,       command: scripts/verify.sh }
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
      - { name: commit,   agent: bash,       command: scripts/commit-trunk.sh }
```

LOCAL DIVERGENCE block (lines 11–16) must remain exactly:
```yaml
  # LOCAL DIVERGENCE FROM src/defaults/workflows.yml
  # This repo is trunk-based (see CLAUDE.md). feature here runs no_branch:true
  # and commits directly to master via commit-trunk.sh; the pr step is dropped.
  # src/defaults/workflows.yml still ships branch+PR for downstream consumers.
  # `npm run sync-defaults` will overwrite this file — do not run it without
  # restoring this divergence afterward.
```

### Success Criteria
- [ ] File parses as valid YAML
- [ ] Feature workflow has exactly 9 steps (no `pr`, no `documentation`)
- [ ] Step at index 7 is `reflection`
- [ ] Step at index 8 is `commit` (using `scripts/commit-trunk.sh`)
- [ ] `no_branch: true` still present
- [ ] LOCAL DIVERGENCE comment block lines 11–16 byte-identical
- [ ] No other workflows modified

---

## Task 3: Update `tests/defaults/feature-yaml.test.ts` step assertions

### Overview
The test reads `src/defaults/workflows.yml` and asserts exact step names + count. Update both assertions to match the post-Task-1 state: 11 steps, `reflection` at index 7.

### Changes Required

**File**: `tests/defaults/feature-yaml.test.ts`

Line 11 — update `deepEqual`:
```ts
// Before:
assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "documentation"]);
// After:
assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
```

Line 12 — update count:
```ts
// Before:
assert.equal(feature.steps.length, 10, "regression guard: step count should be 10");
// After:
assert.equal(feature.steps.length, 11, "regression guard: step count should be 11");
```

### Success Criteria
- [ ] `deepEqual` array has `"reflection"` at index 7 (between `"verify"` and `"commit"`)
- [ ] Count assertion is `11`
- [ ] No other lines changed
- [ ] Test passes against updated `src/defaults/workflows.yml`

---

## Task 4: Add ordering invariant to `CLAUDE.md`

### Overview
Add a new bullet to the Architecture section (after the ENGINE.md reference, current line 44) documenting that `reflection` must precede `commit`/`pr`.

### Changes Required

**File**: `CLAUDE.md`

After line 44 (the `**Detailed engine implementation notes:**` line), add:
```markdown
- **Workflow step ordering:** `reflection` must precede `commit` and `pr` in any workflow that uses it — reflection artifacts must ride the same commit as the feature change that produced them.
```

The Architecture section after edit (lines 36–46):
```markdown
## Architecture

Key modules: `src/engine/` (run-cycle, queue, triage, reflection, blocked, log, branch, exec-*), `src/cli.ts`, `src/defaults/`.

After editing `src/defaults/`, run `npm run sync-defaults`.

Issue lifecycle: `docs/cycle/issues/{raw,todo,done,blocked,failed}/` — see [docs/RFC-001-issue-lifecycle.md](docs/RFC-001-issue-lifecycle.md).

**Detailed engine implementation notes:** [docs/ENGINE.md](docs/ENGINE.md) — covers triage, queue drain, blocked propagation, halt policy, resume, restart policy, retry skip, reflection, documentation step, artifact sanitization, spec post-condition, review Pass 3, and SPEC→PLAN traceability.
- **Workflow step ordering:** `reflection` must precede `commit` and `pr` in any workflow that uses it — reflection artifacts must ride the same commit as the feature change that produced them.
```

### Success Criteria
- [ ] Architecture section contains the ordering invariant sentence
- [ ] Sentence mentions `reflection` must precede `commit`
- [ ] Single bullet, no sub-bullets
- [ ] File remains 61 lines total (one line added)
- [ ] No other sections modified

---

## Task 5: Verify — run `npm test`

### Overview
Run the full test suite to confirm all four edits are correct and no regressions introduced.

### Changes Required
None — verification only.

### Commands
```
npm test
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] `tests/defaults/feature-yaml.test.ts` passes
- [ ] All prior tests still pass (no regressions)
- [ ] No TypeScript compiler warnings

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/defaults/workflows.yml feature steps contain [..., "verify", "reflection", "commit", "pr", "documentation"]` | Task 1 | |
| `[ ] .cycle/workflows.yml feature steps contain [..., "verify", "reflection", "commit"] (no pr)` | Task 2 | |
| `[ ] .cycle/workflows.yml LOCAL DIVERGENCE block (lines 11–16) byte-identical to pre-edit` | Task 2 | Explicit preservation requirement |
| `[ ] tests/defaults/feature-yaml.test.ts deepEqual assertion lists "reflection" at index 7 and step-count assertion is 11` | Task 3 | |
| `[ ] CLAUDE.md Architecture section contains an ordering invariant sentence documenting that reflection must precede commit` | Task 4 | |
| `[ ] npm test exits 0 with no regressions` | Task 5 | |
| `[ ] All existing tests still pass` | Task 5 | |
| `[ ] No compiler/linter warnings introduced` | Task 5 | |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/feature-yaml.test.ts` — primary guard; updated in Task 3 to assert 11 steps with `reflection` at index 7
- No new test files needed; YAML editing and CLAUDE.md doc updates require no new unit coverage
- No mocking; test reads actual YAML file

### Integration / E2E Tests
- `npm test` (Task 5) exercises the full suite including the updated YAML test
- No engine-level integration tests needed — no engine behavior changes

## Risk Assessment

- **sync-defaults clobbers `.cycle/workflows.yml`**: Mitigated by explicit "do not run sync-defaults" in this plan. If accidentally run, the LOCAL DIVERGENCE block is documented verbatim above and can be restored.
- **YAML indentation mismatch**: Both files use consistent 6-space indent for step entries. Edit tool exact-string match will fail if wrong — this is a safety net, not a risk.
- **Test assertion order**: `deepEqual` is order-sensitive. `reflection` must be at index 7 exactly, not appended or inserted elsewhere. Task 3 specifies the exact array.
