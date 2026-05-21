CLAUDE.md already has `engine-lock.ts` (100%) at line 37 — committed in cycle 0203. Two `coverage-gate.mjs` entries (`scripts/structural-invariants.mjs`, `src/engine/exec-spawn.ts`) are absent from CLAUDE.md but out of scope per SPEC. Writing plan now.

# Implementation Plan: Cycle 0204

## Overview
Add `src/engine/engine-lock.ts` (100%) to the per-file floors list in CLAUDE.md's Coverage policy section. The entry was added to `scripts/coverage-gate.mjs` during cycle 0202 but the CLAUDE.md prose was not updated at that time.

## Current State (from Research)
**The primary SPEC change is already applied and committed.** `CLAUDE.md:37` already includes `src/engine/engine-lock.ts` (100%)` between `path-utils.ts` and `child-env.ts`, added during cycle 0203's documentation step (commit `69afe4e`). CLAUDE.md does not appear in `git status`, confirming the change is committed and the working tree is clean with respect to this file.

Two additional `coverage-gate.mjs` FLOORS entries are absent from CLAUDE.md prose — `scripts/structural-invariants.mjs` (90%) and `src/engine/exec-spawn.ts` (90%) — but SPEC explicitly prohibits touching any file beyond CLAUDE.md and limits scope to `engine-lock.ts` only.

## Desired End State
`CLAUDE.md:37` contains `src/engine/engine-lock.ts` (100%)` in the per-file floors list (already true). `npm test` passes with no regressions. Two follow-up issues filed for the out-of-scope gaps.

## What We're NOT Doing
- Modifying `scripts/coverage-gate.mjs` or any coverage thresholds.
- Adding `scripts/structural-invariants.mjs` (90%) or `src/engine/exec-spawn.ts` (90%) to CLAUDE.md (deferred; out of scope per SPEC).
- Implementing an automatic sync mechanism between `coverage-gate.mjs` FLOORS and CLAUDE.md.
- Touching any file other than CLAUDE.md (and the cycle artifact files).

## Implementation Approach
The primary change is pre-applied. The build step consists of: (1) confirm the existing entry matches SPEC format, (2) run `npm test` as the regression guard, (3) file two follow-up issues for the uncovered FLOORS entries so they don't get lost.

---

## Task 1: Confirm CLAUDE.md Entry Matches SPEC Format

### Overview
Verify the existing `engine-lock.ts` entry in CLAUDE.md exactly matches the required format and placement before marking build complete. No edit required.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: None — verify line 37 contains `` `src/engine/engine-lock.ts` (100%) `` in the per-file floors bullet, adjacent to `` `src/engine/path-utils.ts` (100%) `` on its left and `` `src/engine/child-env.ts` (100%) `` on its right.

Current confirmed state of line 37 (excerpt):
```
`src/engine/path-utils.ts` (100%), `src/engine/engine-lock.ts` (100%), `src/engine/child-env.ts` (100%)
```

### Success Criteria
- [ ] `src/engine/engine-lock.ts` (100%) present in CLAUDE.md Coverage policy per-file floors bullet
- [ ] Format matches adjacent `src/engine/path-utils.ts` (100%) entry exactly
- [ ] No other content in CLAUDE.md is changed

---

## Task 2: Run Full Test Suite

### Overview
Execute `npm test` to confirm no regressions. The SPEC requires this as the only functional acceptance criterion for a documentation-only change.

### Changes Required
**File**: None

### Success Criteria
- [ ] `npm test` exits 0
- [ ] All per-file coverage floors pass (including `engine-lock.ts` 100% already enforced by `scripts/coverage-gate.mjs`)
- [ ] Zero test failures

---

## Task 3: File Follow-Up Issues for Uncovered FLOORS Entries

### Overview
Two `coverage-gate.mjs` FLOORS entries are absent from CLAUDE.md prose: `scripts/structural-invariants.mjs` (90%) and `src/engine/exec-spawn.ts` (90%). SPEC prohibits adding them in this cycle, but they must not be silently dropped. File two issues to the `todo/` queue.

### Changes Required
**File**: `docs/cycle/issues/todo/refl-0204-claude-md-missing-structural-invariants-floor.md`
```markdown
# CLAUDE.md per-file floors list missing structural-invariants.mjs 90% floor

scripts/structural-invariants.mjs has a 90% floor in coverage-gate.mjs FLOORS table
(line 20) but is not listed in CLAUDE.md Coverage policy section.
Add: `scripts/structural-invariants.mjs` (90%) to the per-file floors bullet in CLAUDE.md.
```

**File**: `docs/cycle/issues/todo/refl-0204-claude-md-missing-exec-spawn-floor.md`
```markdown
# CLAUDE.md per-file floors list missing exec-spawn.ts 90% floor

src/engine/exec-spawn.ts has a 90% floor in coverage-gate.mjs FLOORS table
(line 22) but is not listed in CLAUDE.md Coverage policy section.
Add: `src/engine/exec-spawn.ts` (90%) to the per-file floors bullet in CLAUDE.md.
```

### Success Criteria
- [ ] Two issue files created in `docs/cycle/issues/todo/`
- [ ] Each file names the missing entry and the fix required
- [ ] CLAUDE.md itself is not changed by this task

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ]` `CLAUDE.md` Coverage policy section lists `src/engine/engine-lock.ts` (100%) alongside the other per-file floors. | Task 1 | Already committed in cycle 0203; Task 1 verifies |
| `[ ]` Entry format matches the adjacent `src/engine/path-utils.ts` (100%) entry. | Task 1 | Confirmed at line 37 |
| `[ ]` No other content in `CLAUDE.md` is changed. | Task 1 | No edits needed; pre-applied state verified |
| `[ ]` `npm test` passes. | Task 2 | Full suite regression run |

---

## Testing Strategy

### Unit Tests
No unit tests required — documentation-only change. `npm test` functions as a regression guard confirming no test suite breakage.

### Integration / E2E Tests
`npm run test:coverage` + `npm run check:coverage` verifies `engine-lock.ts` line coverage meets 100% floor (already enforced; this is a confirmation run).

## Risk Assessment
- **Pre-applied change**: Low risk — the change is already committed; the only risk is the format not matching SPEC, which Task 1 explicitly checks.
- **Follow-up issues not filed**: If Task 3 is skipped, the two FLOORS gaps will remain invisible to contributors indefinitely; filing them closes the loop.
- **npm test regression**: Negligible — no code was changed in this cycle.
