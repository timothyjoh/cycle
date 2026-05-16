`★ Insight ─────────────────────────────────────`
The test fake binary echoes `$@` (all args), so asserting `/--dangerously-skip-permissions/` in stdout proves the flag was passed at spawn time. Adding the assertion is only meaningful if the flag exists in the source — both changes must land atomically.
`─────────────────────────────────────────────────`

Writing SPEC to stdout as required by the engine:

# SPEC — Cycle 0085: Add --dangerously-skip-permissions Flag and Test Pin

## Objective
Add `--dangerously-skip-permissions` to the Claude CLI spawn args in `src/engine/exec-claudecode.ts` and pin its presence with a test assertion in `tests/engine/exec-claudecode.test.ts`. Four consecutive cycles (0079, 0081, 0082, 0083) silently dropped this flag because the test suite never caught its absence — this cycle closes the gap permanently.

## Source Issue
`refl-0083-exec-claudecode-test-does-not-assert-dan` — "Add --dangerously-skip-permissions assertion to exec-claudecode test 1"

## Scope

### In Scope
- Add `--dangerously-skip-permissions` to the `spawn("claude", …)` args in `src/engine/exec-claudecode.ts`
- Add `assert.match(r.stdout, /--dangerously-skip-permissions/)` to test 1 in `tests/engine/exec-claudecode.test.ts`

### Out of Scope
- Changing any other spawn args or CLI flags
- Modifying how permissions are resolved or configured elsewhere
- Any changes to workflow YAML or `.cycle/` configuration

## Requirements
- `src/engine/exec-claudecode.ts` must pass `--dangerously-skip-permissions` as a CLI arg when spawning `claude`
- Test 1 in `tests/engine/exec-claudecode.test.ts` must assert `r.stdout` matches `/--dangerously-skip-permissions/`
- All existing tests must continue to pass

## Acceptance Criteria
- [ ] `src/engine/exec-claudecode.ts` spawn call includes `--dangerously-skip-permissions` in args array
- [ ] Test 1 in `tests/engine/exec-claudecode.test.ts` has `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the existing `/SPECCED/` assertion
- [ ] `npm test` passes with both changes present
- [ ] Removing `--dangerously-skip-permissions` from `exec-claudecode.ts` causes test 1 to fail
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Node native test runner (`npm test`)
- The existing fake `claude` binary in test 1 echoes all args via `$@` — the new assertion directly validates the flag was passed at spawn time
- Manual regression check: temporarily remove the flag from `exec-claudecode.ts` and verify test 1 fails before restoring

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — this is an internal implementation detail, not a workflow convention
- **README.md**: No user-facing change

## Dependencies
- Node ≥ 22.6 (already required by project)
- `src/engine/exec-claudecode.ts` and `tests/engine/exec-claudecode.test.ts` must exist at HEAD (they do)
