All inputs confirmed. Writing the plan to stdout now.

`★ Insight ─────────────────────────────────────`
This cycle is purely mechanical — 6 file touches, zero logic changes. The test files already serve as the regression net; updating them is the hardest "judgment call" (index arithmetic on a 9-step array). The sync-defaults script has a sha256 divergence guard, but since src and .cycle are currently byte-identical it will overwrite cleanly without `--force`.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0190

## Overview
Swap `reflection` and `documentation` in the feature workflow so reflection
runs at position 8 and documentation at position 9. This lets reflection
insights flow into the same cycle's documentation pass.

## Current State (from Research)
- `src/defaults/workflows.yml:27-28` — `documentation` then `reflection` (inline object syntax)
- `.cycle/workflows.yml:27-28` — byte-identical to src copy; safe to overwrite with `npm run sync-defaults`
- `tests/defaults/feature-yaml.test.ts:11` — deepEqual expects `[…, "documentation", "reflection"]`
- `tests/dogfood/feature-yaml.test.ts:13` — same deepEqual array
- `tests/defaults/feature-loadable.test.ts:17-20` — index-7 → documentation, index-8 → reflection
- `docs/ARCHITECTURE.md:496,663` — step sequence string `verify → documentation → reflection → commit → pr`

## Desired End State
- `src/defaults/workflows.yml` step 8 = `reflection`, step 9 = `documentation`
- `.cycle/workflows.yml` identical to src copy (post sync-defaults)
- All three test files assert the new order
- ARCHITECTURE.md both occurrences read `verify → reflection → documentation → commit → pr`
- `npm test` passes; 531+ tests, zero regressions

## What We're NOT Doing
- No changes to `reflection` or `documentation` prompt content
- No changes to any other workflow (`bug`, `research`, `document`, `quickfix`, `e2e-tests`)
- No changes to engine logic — step execution order is driven purely by YAML array order
- No new test files — existing pinning tests are sufficient

## Implementation Approach
Four atomic tasks in sequence: (1) mutate the YAML source, (2) propagate with
sync-defaults, (3) update all test assertions to the new order, (4) update
ARCHITECTURE.md prose. Run `npm test` after task 3 to confirm correctness
before touching docs.

---

## Task 1: Swap Steps in `src/defaults/workflows.yml`

### Overview
Move the `reflection` line above the `documentation` line. The inline YAML
object syntax and alignment are preserved exactly.

### Changes Required
**File**: `src/defaults/workflows.yml`

Current (lines 27-28):
```yaml
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
```

After swap (lines 27-28):
```yaml
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

### Success Criteria
- [ ] `reflection` is at index 7 (step 8), `documentation` at index 8 (step 9)
- [ ] YAML parses cleanly — `node -e "const Y=require('yaml'); Y.parse(require('fs').readFileSync('src/defaults/workflows.yml','utf8'))"`
- [ ] Step count remains 9

---

## Task 2: Propagate to `.cycle/workflows.yml` via sync-defaults

### Overview
Run `npm run sync-defaults` to overwrite `.cycle/workflows.yml`. The
sha256 divergence guard will not block because the two files are currently
byte-identical.

### Changes Required
**Command**: `npm run sync-defaults`

No manual file edits — the script handles it.

### Success Criteria
- [ ] Script exits 0
- [ ] `.cycle/workflows.yml` lines 27-28 match the swapped order from Task 1
- [ ] No `[SKIP]` warning emitted for `workflows.yml`

---

## Task 3: Update Test Assertions

### Overview
Update the three test files that assert index-based or name-array-based step
order. The second test in `tests/dogfood/feature-yaml.test.ts` (no commit step,
engine.commit.mode check) is unaffected.

### Changes Required

**File**: `tests/defaults/feature-yaml.test.ts:11`

Old:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation", "reflection"]);
```
New:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "documentation"]);
```

---

**File**: `tests/dogfood/feature-yaml.test.ts:13`

Old:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation", "reflection"]);
```
New:
```typescript
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "documentation"]);
```

---

**File**: `tests/defaults/feature-loadable.test.ts:17-20`

Old:
```typescript
    assert.equal(w.steps[7].name, "documentation");
    assert.equal(w.steps[7].agent, "claudecode");
    assert.equal(w.steps[8].name, "reflection");
    assert.equal(w.steps[8].agent, "claudecode");
```
New:
```typescript
    assert.equal(w.steps[7].name, "reflection");
    assert.equal(w.steps[7].agent, "claudecode");
    assert.equal(w.steps[8].name, "documentation");
    assert.equal(w.steps[8].agent, "claudecode");
```

### Success Criteria
- [ ] `npm test` passes (531+ tests, 0 failures)
- [ ] No coverage floor regressions — test files are excluded from per-file floors

---

## Task 4: Update `docs/ARCHITECTURE.md`

### Overview
Two occurrences of the step sequence string need the `documentation` and
`reflection` tokens swapped in place.

### Changes Required
**File**: `docs/ARCHITECTURE.md:496`

Old:
```
spec → research → plan → build → review → fix → verify → documentation → reflection → commit → pr
```
New:
```
spec → research → plan → build → review → fix → verify → reflection → documentation → commit → pr
```

**File**: `docs/ARCHITECTURE.md:663`

Old:
```
`spec → research → plan → build → review → fix → verify → documentation → reflection → commit → pr`.
```
New:
```
`spec → research → plan → build → review → fix → verify → reflection → documentation → commit → pr`.
```

The prose at line 500 (`documentation` and `reflection` are non-fatal terminal steps) names
both steps without implying order — no change needed.

### Success Criteria
- [ ] Both occurrences updated
- [ ] No other occurrences of `documentation → reflection` remain in the file (`grep "documentation → reflection" docs/ARCHITECTURE.md` returns empty)
- [ ] `npm test` still passes

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`reflection\` step appears before \`documentation\` in \`src/defaults/workflows.yml\` feature workflow` | Task 1 | Swap lines 27-28 |
| `[ ] \`npm run sync-defaults\` run; \`.cycle/workflows.yml\` reflects the new order` | Task 2 | Script propagates change |
| `[ ] \`tests/defaults/feature-yaml.test.ts\` step-order array updated to \`[..., "verify", "reflection", "documentation"]\`` | Task 3 | Line 11 updated |
| `[ ] \`tests/dogfood/feature-yaml.test.ts\` step-order array updated to match` | Task 3 | Line 13 updated |
| `[ ] \`docs/ARCHITECTURE.md\` updated wherever it lists \`verify → documentation → reflection\` or \`documentation → reflection\` in prose or YAML examples` | Task 4 | Lines 496 and 663 updated |
| `[ ] \`npm test\` passes with no regressions` | Task 3 (verified after) | Final gate |

---

## Testing Strategy

### Unit Tests
- `tests/defaults/feature-yaml.test.ts` — deepEqual on names array; catches wrong order
- `tests/dogfood/feature-yaml.test.ts` — same check against `.cycle/workflows.yml`; catches sync-defaults miss
- `tests/defaults/feature-loadable.test.ts` — index assertions via engine loader; catches YAML parse or loader mismatch

No mocking needed — all three tests read real files from disk.

### Integration / E2E Tests
- `npm test` runs the full 531-test suite including build step; serves as the regression gate
- No additional integration tests needed; the pinning tests provide complete coverage of the change

## Risk Assessment
- **sync-defaults divergence guard fires**: Mitigated — src and .cycle are byte-identical, guard will not block; exit 0 expected
- **Third test file missed**: Mitigated — RESEARCH.md identified `feature-loadable.test.ts` as a third assertion site with index-based checks; included in Task 3
- **Additional ARCHITECTURE.md occurrences**: Mitigated — post-edit `grep "documentation → reflection"` confirms zero remaining matches
```
