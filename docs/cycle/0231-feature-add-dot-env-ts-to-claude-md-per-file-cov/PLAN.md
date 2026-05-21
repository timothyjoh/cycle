# Implementation Plan: Cycle 0231

## Overview

This cycle corrects documentation drift by ensuring `src/engine/dot-env.ts (100%)` appears in `CLAUDE.md`'s per-file coverage floors bullet. Research confirms the entry is **already present** in `CLAUDE.md` line 37, added during cycle 0225 implementation (observation 3145). The build step is a verification and confirmation cycle.

## Current State (from Research)

`CLAUDE.md` line 37 already reads:

```
`src/engine/dot-env.ts` (100%), `src/engine/queue.ts` (90%), `src/engine/run-cycle.ts` (90%).
```

`scripts/coverage-gate.mjs` FLOORS table (line 27) enforces `"src/engine/dot-env.ts": 100` — in sync with `CLAUDE.md`.

Three other entries exist in `coverage-gate.mjs` but are absent from `CLAUDE.md` (`scripts/structural-invariants.mjs` at 90%, `src/engine/exec-spawn.ts` at 90%, `src/engine/reflection.ts` at 95%). These are **out of scope** per the SPEC.

## Desired End State

- `CLAUDE.md` line 37 contains `` `src/engine/dot-env.ts` (100%) `` (already true).
- `npm test` passes.
- `BUILD.md` documents the verified no-op outcome.

## What We're NOT Doing

- Modifying `scripts/coverage-gate.mjs` or any floor values.
- Adding the three additional coverage-gate entries (`structural-invariants.mjs`, `exec-spawn.ts`, `reflection.ts`) to `CLAUDE.md` — separate issue scope.
- Any changes to source or test files.

## Implementation Approach

The primary deliverable is already complete. The build step confirms the current state matches the SPEC, runs the full test suite to validate no regressions, and writes BUILD.md documenting the cycle outcome. No file changes are required beyond BUILD.md.

---

## Task 1: Confirm CLAUDE.md Entry Is Present

### Overview

Verify the pre-existing `dot-env.ts` entry in `CLAUDE.md` matches the required format before declaring the cycle complete.

### Changes Required

**File**: `CLAUDE.md`  
**Changes**: None. Current content at line 37 already includes `` `src/engine/dot-env.ts` (100%) `` in the per-file floors bullet, following the established `` `path/to/file.ts` (N%) `` inline pattern used for `path-utils.ts`, `engine-lock.ts`, `child-env.ts`, and `log-fmt.ts`.

Verify with:
```bash
grep -o 'dot-env\.ts.*100%' CLAUDE.md
```

Expected output: `` `src/engine/dot-env.ts` (100%) ``

### Success Criteria

- [ ] `grep 'dot-env\.ts' CLAUDE.md` returns a match on line 37
- [ ] Entry format matches `` `src/engine/dot-env.ts` (100%) `` exactly
- [ ] No other files have been modified

---

## Task 2: Run Full Test Suite

### Overview

Confirm `npm test` passes unmodified. This is a documentation-only cycle; zero logic was changed, so all tests must pass as-is.

### Changes Required

**File**: None.  
**Action**: Run `npm run test:coverage` (which auto-runs `check:coverage` and `check:invariants` afterward).

```bash
npm run test:coverage
```

### Success Criteria

- [ ] All test files pass (no failures, no skips that weren't pre-existing)
- [ ] Coverage gate passes — `src/engine/dot-env.ts` remains at 100% line coverage
- [ ] Structural invariants pass
- [ ] `npm run typecheck` passes

---

## Task 3: Write BUILD.md

### Overview

Document the cycle outcome in `BUILD.md`, confirming the no-op verification result and test metrics.

### Changes Required

**File**: `docs/cycle/0231-feature-add-dot-env-ts-to-claude-md-per-file-cov/BUILD.md`  
**Changes**: Create with the following structure:

```markdown
# BUILD — Cycle 0231

## Summary

Documentation-only cycle. `src/engine/dot-env.ts (100%)` was already present in
`CLAUDE.md` line 37 (added during cycle 0225 implementation). No file changes were
required. Cycle closes as a verified no-op.

## Changes

- `CLAUDE.md`: No change needed — entry already present.

## Test Results

[Coverage metrics from npm run test:coverage output]

## Coverage

- Line: [N]%
- Branch: [N]%
- Function: [N]%

Per-file floor `src/engine/dot-env.ts` (100%): PASS
```

### Success Criteria

- [ ] `BUILD.md` created at correct path
- [ ] Documents that the entry was pre-existing, not newly added
- [ ] Coverage metrics recorded

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`CLAUDE.md\` per-file floors bullet includes \`\`\`src/engine/dot-env.ts\`\`\` (100%)` | Task 1 | Entry already present; Task 1 verifies |
| `[ ] No files other than \`CLAUDE.md\` are modified` | Task 1 | No files modified at all; verified by Task 1 inspection |
| `[ ] \`npm test\` passes (documentation-only change, no logic affected)` | Task 2 | Full suite run confirms |

---

## Testing Strategy

### Unit Tests

- No new tests required — this is a documentation-only cycle.
- Existing `tests/engine/dot-env.test.ts` (7 tests) covers `loadDotEnv` behavior; all must continue to pass.
- Existing `tests/scripts/coverage-gate.test.ts` references `src/engine/dot-env.ts` in fixture data; must continue to pass.

### Integration / E2E Tests

- `npm run test:coverage` exercises the full pipeline: build → test → coverage gate → structural invariants.
- The coverage gate itself validates that `dot-env.ts` meets the 100% floor, confirming both the script and documentation are consistent.

## Risk Assessment

- **False no-op close**: If the entry was somehow removed between research and build execution, Task 1's grep will catch it and the build step must add it back following the pattern in `CLAUDE.md:37`. Risk: very low (file not in active development churn).
- **Out-of-scope drift temptation**: Three coverage-gate entries absent from `CLAUDE.md` (`structural-invariants.mjs`, `exec-spawn.ts`, `reflection.ts`) are known. The build agent must not add them — they belong in a separate cycle per the SPEC.
