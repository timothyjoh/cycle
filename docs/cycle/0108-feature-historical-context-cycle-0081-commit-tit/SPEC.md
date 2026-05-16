# SPEC — Cycle 0108: Close Historical Context Issue for Cycle 0081 Misleading Commit

## Objective
Cycle 0081 closed with a commit title that claims it applied the reflection-before-commit reorder, but the actual diff contained no src/ changes (BUILD.md was a placeholder; a human-assisted commit later did the real work). This cycle acknowledges that historical record, verifies the current status of the empty-diff guard that was meant to prevent recurrence, documents the verification findings, and closes the source issue as acknowledged-done.

## Source Issue
`refl-0081-cycle-0081-drained-done-with-placeholder-historical-context` — "Historical context: cycle 0081 commit title describes unshipped reflection-before-commit reorder"

## Scope

### In Scope
- Verify whether the empty-diff post-condition guard (cycle 0098 target) and artifact-only commit guard (cycle 0100 target) are actually present in `src/` and `.cycle/scripts/`
- Document findings in the cycle BUILD artifact
- If either guard is absent: create a new `todo/` issue for the missing implementation
- Move the source issue from `docs/cycle/issues/todo/` to `docs/cycle/issues/done/`

### Out of Scope
- Implementing the missing guards (separate cycle if needed)
- Modifying any src/ engine code
- Changing any workflow or test files

## Requirements
- Verification must inspect actual source files (`src/engine/run-cycle.ts`, `.cycle/scripts/commit-trunk.sh`), not commit messages
- If a guard is missing, a new issue file must be created in `docs/cycle/issues/todo/` with a clear description of what needs to be implemented
- The source issue must be moved to `done/` on completion

## Acceptance Criteria
- [ ] BUILD.md documents whether the empty-diff post-condition guard exists in `src/engine/run-cycle.ts`
- [ ] BUILD.md documents whether the artifact-only guard (no src/ changes → exit non-zero) exists in `.cycle/scripts/commit-trunk.sh`
- [ ] If either guard is absent: a new issue file exists in `docs/cycle/issues/todo/` describing the missing guard implementation
- [ ] `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` is moved to `docs/cycle/issues/done/`
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- No new tests required; this is a verification and documentation cycle
- `npm test` must pass after the issue file move to confirm no regressions

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes
- **README.md**: No changes
- Cycle BUILD artifact documents verification findings inline

## Dependencies
- `src/engine/run-cycle.ts` and `.cycle/scripts/commit-trunk.sh` must be readable (already present in repo)
- `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` must exist (confirmed)
