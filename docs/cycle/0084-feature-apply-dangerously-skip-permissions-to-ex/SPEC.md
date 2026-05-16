`★ Insight ─────────────────────────────────────`
This is an operator-assisted cycle — the issue explicitly says NOT to let the engine handle it. The fix is already known (line 13, add `--dangerously-skip-permissions`). The SPEC just needs to document the one-line change with clear acceptance criteria so the cycle artifacts are complete.
`─────────────────────────────────────────────────`

# SPEC — Cycle 0084: Apply --dangerously-skip-permissions to exec-claudecode.ts

## Objective
Add `--dangerously-skip-permissions` to the Claude CLI spawn args in `src/engine/exec-claudecode.ts`. This single-line fix unblocks engine subprocesses that have been silently producing artifact-only commits (no `src/` changes) across four consecutive cycles (0079, 0081, 0082, 0083) because `settings.local.json` overrides global Write/Edit permissions for spawned processes.

## Source Issue
`refl-0083-exec-claudecode-ts-dangerously-skip-perm-apply-fix` — "Apply --dangerously-skip-permissions to exec-claudecode.ts spawn (operator-assisted)"

## Scope

### In Scope
- Add `--dangerously-skip-permissions` flag to the `spawn("claude", ...)` call in `src/engine/exec-claudecode.ts:13`

### Out of Scope
- Changes to `settings.local.json` or `settings.json`
- Test assertion updates for the `--dangerously-skip-permissions` flag (tracked separately in `refl-0083-exec-claudecode-test-does-not-assert-dan`)
- The artifact-only commit guard (`refl-0083-commit-trunk-sh-commits-artifact-only-ch`)

## Requirements
- `spawn("claude", ["-p", prompt], ...)` becomes `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], ...)`
- No other lines in the file change
- All existing tests pass without modification

## Acceptance Criteria
- [ ] `src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` as the first element of the args array
- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` matches exactly line 13
- [ ] `npm test` passes with no failures
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean)
- [ ] Diff shows exactly one line changed in `src/engine/exec-claudecode.ts`

## Testing Strategy
- Run `npm test` (Node native test runner) — no new tests needed for this change
- The existing test suite in `tests/engine/exec-claudecode.test.ts` exercises the spawn path; tests pass if the flag is accepted by the fake claude binary
- Note: the test does not currently assert `--dangerously-skip-permissions` presence (tracked in `refl-0083-exec-claudecode-test-does-not-assert-dan`) — that gap is out of scope here

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change — this is an implementation detail of the engine, not a new command or convention
- **README.md**: No change

## Dependencies
- `src/engine/exec-claudecode.ts` at current HEAD (line 13 is the spawn call — confirmed by reading the file)
- Claude CLI must accept `--dangerously-skip-permissions` as a leading flag before `-p` (it does — this is the same flag used in prior manual fixes)
