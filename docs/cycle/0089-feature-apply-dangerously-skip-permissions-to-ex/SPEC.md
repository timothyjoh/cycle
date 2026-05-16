`★ Insight ─────────────────────────────────────`
This is cycle 0089 — the 6th attempt at a single-line fix. The issue explicitly states the fix must come from the operator session (not engine subprocess) due to permission constraints. The spec must be tight: two edits, one test run.
`─────────────────────────────────────────────────`

# SPEC — Cycle 0089: Apply --dangerously-skip-permissions to exec-claudecode spawn

## Objective
Add `--dangerously-skip-permissions` as the first argument to the `claude` spawn call in `src/engine/exec-claudecode.ts`, and pin its presence with a regression assertion in the test suite. This unblocks the cycle engine from running Claude subprocesses under restricted permission environments.

## Source Issue
`refl-0087-dangerously-skip-permissions-still-absen` — "Apply --dangerously-skip-permissions to exec-claudecode spawn and pin with test assertion"

## Scope

### In Scope
- Add `--dangerously-skip-permissions` as the first arg in the `spawn` call at `src/engine/exec-claudecode.ts:13`
- Add `assert.match(r.stdout, /--dangerously-skip-permissions/)` assertion to `tests/engine/exec-claudecode.test.ts` after the existing `/SPECCED/` match

### Out of Scope
- Any other permission system changes
- Changes to `settings.local.json` or `settings.json`
- Any other exec-* files or workflow changes

## Requirements
- `--dangerously-skip-permissions` must be the first positional argument in the spawn array (before `-p`)
- The test assertion must exercise the flag so future regressions are caught
- No other behavior changes

## Acceptance Criteria
- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13
- [ ] `--dangerously-skip-permissions` is first in the spawn args array, before `-p`
- [ ] `grep -n 'dangerously-skip-permissions' tests/engine/exec-claudecode.test.ts` returns the `assert.match` line
- [ ] `npm test` exits 0 with the new assertion exercised
- [ ] All existing tests still pass

## Testing Strategy
- Node native test runner (`npm test`)
- The existing exec-claudecode test already stubs the `claude` subprocess; the new `assert.match` on stdout confirms the flag appears in the spawned command args
- No new test files needed — one assertion added to the existing test

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes needed
- **README.md**: No changes needed

## Dependencies
- `src/engine/exec-claudecode.ts` must exist at its current path (confirmed)
- `tests/engine/exec-claudecode.test.ts` must exist at its current path (confirmed)
