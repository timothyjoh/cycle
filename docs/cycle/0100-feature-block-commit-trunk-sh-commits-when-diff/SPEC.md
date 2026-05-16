# SPEC — Cycle 0100: Block commit-trunk.sh Commits When Diff Contains No src/ Changes

## Objective
Add a source-file guard to `commit-trunk.sh` that rejects commits when the staged diff contains no files under `src/`. Artifact-only commits (docs, cycle logs, issue files) currently slip through because the existing empty-diff check only blocks a completely empty index. This guard closes that gap, ensuring every trunk commit contains at least one real implementation change.

## Source Issue
`refl-0083-commit-trunk-sh-commits-artifact-only-ch` — "Block commit-trunk.sh commits when diff contains no src/ changes (artifact-only guard)"

## Scope

### In Scope
- Add `src/`-presence guard to `src/defaults/scripts/commit-trunk.sh`, positioned after the existing empty-diff check
- Shell tests for the new guard covering: artifact-only blocked, src/-present passes, mixed src/+docs passes
- CLAUDE.md Architecture section update documenting the artifact-only guard

### Out of Scope
- `commit.sh` (branch-workflow variant — different lifecycle, deferred)
- Moving the guard into `verify.sh` as a post-condition (alternative noted in issue but not the primary path)
- `run-cycle.ts` empty-diff guard (tracked in `refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks`)

## Requirements
- After staging and after the empty-diff check, `commit-trunk.sh` must check `git diff --cached --name-only` for at least one path matching `^src/`
- When no `src/` path is found, exit 1 with message `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed` on stderr
- When `src/` paths are present (with or without non-`src/` paths alongside), the script proceeds normally
- The guard must not fire when the script exits early at the nothing-to-commit path (exit 0 before the guard is reached)
- The `src/defaults/scripts/commit-trunk.sh` change must be mirrored to `.cycle/scripts/commit-trunk.sh` via `npm run sync-defaults`

## Acceptance Criteria
- [ ] `commit-trunk.sh` exits 1 with `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed` on stderr when staged files are entirely under `docs/`, `.cycle/`, or issue directories
- [ ] `commit-trunk.sh` exits 0 and commits when at least one staged file is under `src/`
- [ ] Mixed commits (src/ + docs/ together) are unaffected — commit proceeds normally
- [ ] Completely empty staged index still exits 0 with "nothing to commit" (existing behavior preserved)
- [ ] New tests cover all four scenarios above and pass under `npm test`
- [ ] `npm run test:coverage` meets line ≥ 95% / branch ≥ 75% / function ≥ 90% baseline
- [ ] CLAUDE.md Architecture section documents the artifact-only guard in `commit-trunk.sh`
- [ ] All existing tests still pass

## Testing Strategy
- Node native test runner (`node:test`) — same pattern as `tests/defaults/commit-staging.test.ts`
- New test file: `tests/defaults/commit-trunk-artifact-guard.test.ts`
- `makeRepo` helper mirrors `commit-staging.test.ts` but copies `commit-trunk.sh` and `lib/closes.sh`; omits remote setup since `commit-trunk.sh` pushes to `origin` — stub push with a local bare remote or capture the error after commit (the guard check must happen before the push)
- Key scenarios:
  1. Artifact-only staged diff (only `docs/cycle/` files) → exit 1, stderr matches guard message, no commit created
  2. `src/` file staged alone → exit 0 (or push-error after commit; verify commit happened)
  3. `src/` + `docs/` staged together → commit includes both paths
  4. Empty staged index (after deny-list flush) → exit 0 "nothing to commit", guard not reached

## Documentation Updates
- **CLAUDE.md**: Add one bullet to the Architecture quick reference under commit-trunk.sh or the scripts section: artifact-only guard — exits non-zero when no `src/` file is in the staged diff, message `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed`
- **README.md**: No user-facing change required

## Dependencies
- `src/defaults/scripts/commit-trunk.sh` exists (confirmed)
- `src/defaults/scripts/lib/closes.sh` exists (confirmed)
- `npm run sync-defaults` available to mirror to `.cycle/scripts/`
- Node ≥ 22.6 runtime (existing constraint)
