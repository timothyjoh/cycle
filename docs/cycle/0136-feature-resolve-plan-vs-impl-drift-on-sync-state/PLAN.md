Both open questions resolved:
1. **Bullet vs paragraph**: Append a 4th bullet to the existing "When divergence is detected" list — it directly qualifies the 3rd bullet ("No `.sync-state.json` entry is written for skipped paths") without needing a new section.
2. **CLAUDE.md**: SPEC explicitly says no CLAUDE.md changes; the existing link to `docs/sync-defaults.md` is sufficient.

Writing plan to stdout now.

# Implementation Plan: Cycle 0136

## Overview

Doc-only change: update `docs/sync-defaults.md` to document that `.cycle/.sync-state.json` is written unconditionally on every successful `sync-defaults` run, and that `{}` is the expected first-run body when every destination is locally divergent. Resolves the plan-vs-impl drift logged in `refl-0048`.

## Current State (from Research)

- `scripts/sync-defaults.mjs:123` calls `await writeStateAtomic(state)` unconditionally — outside any conditional, always executes after the loop.
- On an all-divergent first run: `loadState()` returns `{}` (ENOENT path), loop appends nothing, `writeStateAtomic({})` writes `{}\n`.
- `docs/sync-defaults.md` lines 5–8 document divergence behavior via a 3-bullet list; the 3rd bullet says "No `.sync-state.json` entry is written for skipped paths" — true but incomplete: the file itself is still written.
- 7 existing tests pass; no new tests required (SPEC explicit).

## Desired End State

`docs/sync-defaults.md` has a 4th bullet under "When divergence is detected" that states:
- `.cycle/.sync-state.json` is (re)written on every successful invocation regardless of skip count
- `{}` is the expected content when every destination is divergent

Verify: `npm test` passes unmodified; `docs/sync-defaults.md` diff shows only the bullet addition.

## What We're NOT Doing

- No code changes to `scripts/sync-defaults.mjs`
- No guard behind `copied.length > 0` (option 1 — deferred per SPEC)
- No schema changes to `.sync-state.json`
- No new tests
- No CLAUDE.md or README.md edits

## Implementation Approach

Single edit to `docs/sync-defaults.md`: append one bullet to the existing "When divergence is detected" list. Collocating the new fact with the existing divergence bullets is the most natural fit — a reader hitting bullet 3 ("No entry written for skipped paths") immediately sees bullet 4 clarifying the file itself is still written.

---

## Task 1: Extend "When divergence is detected" block in docs/sync-defaults.md

### Overview

Add a 4th bullet that explicitly documents the unconditional state-file write and the `{}` first-run shape.

### Changes Required

**File**: `docs/sync-defaults.md`

Current lines 5–8:
```
When divergence is detected:
- Non-divergent paths are copied normally.
- Divergent destinations: stderr gets `skipped <path> — locally divergent`, plus a final `N path(s) skipped` summary.
- Exit code is `2`. No `.sync-state.json` entry is written for skipped paths.
```

After change (add bullet at line 9, before the blank line that precedes the force-overwrite section):
```
When divergence is detected:
- Non-divergent paths are copied normally.
- Divergent destinations: stderr gets `skipped <path> — locally divergent`, plus a final `N path(s) skipped` summary.
- Exit code is `2`. No `.sync-state.json` entry is written for skipped paths.
- `.cycle/.sync-state.json` is (re)written on every successful invocation regardless of how many paths were skipped. When every destination is locally divergent and nothing is copied, the file contains `{}` — this is the expected first-run shape.
```

### Success Criteria

- [ ] `docs/sync-defaults.md` contains explicit statement that `.sync-state.json` is written unconditionally
- [ ] `docs/sync-defaults.md` states `{}` is expected when all destinations are divergent
- [ ] No other files changed
- [ ] `npm test` passes

---

## Task 2: Verify existing tests pass unmodified

### Overview

Confirm the doc-only edit introduces no regressions. No code was changed, so this is a sanity gate.

### Changes Required

None — run only.

### Success Criteria

- [ ] `npm test` exits 0
- [ ] All 7 `sync-defaults-guard` tests pass
- [ ] No compiler/linter warnings

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] docs/sync-defaults.md` contains an explicit statement that `.sync-state.json` is written unconditionally on every successful invocation | Task 1 | 4th bullet in "When divergence is detected" |
| `[ ] docs/sync-defaults.md` states that `{}` is the expected state-file body when all destinations are divergent | Task 1 | Same bullet, second sentence |
| `[ ] No code changes in scripts/sync-defaults.mjs` | Task 1 | Only `docs/sync-defaults.md` edited |
| `[ ] All existing tests still pass (npm test)` | Task 2 | |
| `[ ] No compiler/linter warnings introduced` | Task 2 | Doc-only; no TS surface touched |

---

## Testing Strategy

### Unit Tests

No new tests — SPEC explicit. Existing `tests/defaults/sync-defaults-guard.test.ts` (7 tests) cover the state-write behavior under partial and full divergence; they remain the validation baseline.

### Integration / E2E Tests

`npm test` (full suite) serves as integration gate. The sync-defaults-guard tests exercise the real script via `spawnSync` against isolated fixture directories — no mocking needed, no mocking introduced.

## Risk Assessment

- **Doc inconsistency with future code changes**: Low — if option 1 (conditional write) is ever implemented, this doc bullet will need updating. Acceptable: issue `refl-0048` remains open as a deferred option 1 tracker.
- **Bullet placement misread**: The new bullet follows "No `.sync-state.json` entry is written for skipped paths" — close enough that a reader sees both in one pass. No structural ambiguity.
