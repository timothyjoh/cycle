# Implementation Plan: Cycle 0224

## Overview
Replace the hardcoded cycle-0217 path in the `spec.md` File Artifact Mode negative example with a generic placeholder, then sync to the dogfood copy. One-line substitution; no logic changes.

## Current State (from Research)
`src/defaults/prompts/spec.md:131` contains `SPEC.md written to \`docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md\`.` inside the confirmation-sentences prohibition block. `.cycle/prompts/spec.md:131` is identical (byte-sync enforced by `tests/defaults/spec-prompt-ac.test.ts:76-82`). No test currently asserts absence of the hardcoded path or presence of the placeholder.

## Desired End State
- `src/defaults/prompts/spec.md:131`: `SPEC.md written to \`docs/cycle/NNNN-feature-<title>/SPEC.md\`.`
- `.cycle/prompts/spec.md:131`: same line (synced)
- `grep 0217-feature-fix-spec-step-learning-mode-conflict-cau src/defaults/prompts/spec.md` → no match
- `grep "NNNN-feature" src/defaults/prompts/spec.md` → match
- Full test suite passes; coverage floors hold

## What We're NOT Doing
- Updating any other prompt template files
- Adding new automated test assertions (SPEC explicitly defers this)
- Changing the sanitizer or test infrastructure
- Updating other hardcoded cycle references elsewhere in the codebase

## Implementation Approach
Single-line string substitution in the source template, followed by the standard sync-defaults propagation step. The change is non-functional — no behavior changes, no new code paths. Verification is grep + full test suite.

---

## Task 1: Replace Hardcoded Path in Source Template

### Overview
Edit `src/defaults/prompts/spec.md` line 131, replacing the cycle-0217-specific path with the generic placeholder mandated by the SPEC.

### Changes Required
**File**: `src/defaults/prompts/spec.md`

**Line 131 — before:**
```
  SPEC.md written to `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`.
```

**Line 131 — after:**
```
  SPEC.md written to `docs/cycle/NNNN-feature-<title>/SPEC.md`.
```

No other lines in this file are touched.

### Success Criteria
- [ ] `grep "0217-feature-fix-spec-step-learning-mode-conflict-cau" src/defaults/prompts/spec.md` returns no matches
- [ ] `grep "NNNN-feature-<title>" src/defaults/prompts/spec.md` returns exactly one match (line 131)
- [ ] File still contains `SPEC.md written to` (existing test `spec prompt File Artifact Mode includes concrete 'SPEC.md written to' negative example` must still pass)

---

## Task 2: Sync to Dogfood Copy and Verify

### Overview
Run `npm run sync-defaults` to propagate the source edit to `.cycle/prompts/spec.md`, then run the full test suite and coverage checks.

### Changes Required
**Command**: `npm run sync-defaults`

This writes `.cycle/prompts/spec.md` (and updates `.cycle/.sync-state.json`). No manual edits to `.cycle/` files.

**Verification commands** (run in order):
1. `grep "0217-feature-fix-spec-step-learning-mode-conflict-cau" .cycle/prompts/spec.md` → no match
2. `grep "NNNN-feature-<title>" .cycle/prompts/spec.md` → match
3. `npm test`
4. `npm run typecheck`
5. `npm run test:coverage && npm run check:coverage`

### Success Criteria
- [ ] `.cycle/prompts/spec.md` contains `NNNN-feature-<title>` and does not contain `0217-feature-fix-spec-step-learning-mode-conflict-cau`
- [ ] `npm test` passes (659 tests, 0 failures)
- [ ] `npm run typecheck` passes with no warnings
- [ ] `npm run test:coverage && npm run check:coverage` passes all per-file floors
- [ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ]` `src/defaults/prompts/spec.md` contains `docs/cycle/NNNN-feature-<title>/SPEC.md` and does not contain `0217-feature-fix-spec-step-learning-mode-conflict-cau` | Task 1 | Verified by grep after edit |
| `[ ]` `.cycle/prompts/spec.md` contains the same generic placeholder (sync confirmed) | Task 2 | Verified by grep after sync-defaults |
| `[ ]` `npm test` passes with no failures | Task 2 | Full suite run |
| `[ ]` `npm run typecheck` passes with no warnings | Task 2 | tsc --noEmit |
| `[ ]` Coverage does not decrease vs baseline | Task 2 | check:coverage enforces per-file floors |

---

## Testing Strategy

### Unit Tests
- No new test code required (SPEC explicitly excludes new assertions).
- Existing `tests/defaults/spec-prompt-ac.test.ts:57-62` (`SPEC.md written to` substring) must still pass after the path is genericized — the prose prefix is preserved.
- Existing `tests/defaults/spec-prompt-ac.test.ts:76-82` (byte-identity dogfood assertion) will fail between Task 1 and Task 2, then pass once sync-defaults runs. Run tests only after Task 2 is complete.

### Integration / E2E Tests
- `npm test` runs the full 659-test suite including all defaults and engine tests.
- `tests/engine/sanitize-artifact.test.ts` is unaffected (uses `0217-feature-fix-spec-step` shorthand in test-data strings, not the prompt template file).

## Risk Assessment
- **Sync forgotten**: If `npm run sync-defaults` is skipped, the byte-identity test fails. Mitigation: Task 2 runs sync before any test command.
- **Wrong occurrence replaced**: Only one occurrence of the hardcoded path exists in `src/defaults/prompts/spec.md` (line 131). Confirmed by RESEARCH. Mitigation: grep after edit to confirm zero remaining matches.
