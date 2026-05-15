# SPEC — Cycle 0068: Regression test for commit.sh worktree-missing-path branch

## Objective
Lock in the staged-deletion branch added in `src/defaults/scripts/commit.sh:59-64` with an automated test so a future edit that reintroduces unflagged `git add -- "$path"` on a missing-worktree path fails fast in CI instead of surfacing as a sparse runtime incident during a real commit step.

## Source Issue
`refl-0028-commit-sh-missing-path-branch-has-no-reg` — "Add regression test for commit.sh worktree-missing-path branch"

## Scope

### In Scope
- New test file `tests/defaults/commit_sh.test.ts` driving `src/defaults/scripts/commit.sh` against ephemeral git repos via `spawnSync`, covering the three staged/unstaged-deletion + control cases.

### Out of Scope
- Refactoring or merging with the existing `tests/defaults/commit-staging.test.ts` (separate file per issue acceptance text; consolidation is a future cycle if desired).
- Changes to `commit.sh` itself or to `closes.sh`.
- Adding similar regression coverage for `commit-trunk.sh`.

## Requirements
- Test file at `tests/defaults/commit_sh.test.ts`, runnable by `npm test` via Node's native test runner, no new dependencies.
- Each case builds an isolated repo with `mkdtempSync` (or `mkdtemp`), seeds one commit, copies `src/defaults/scripts/commit.sh` + `src/defaults/scripts/lib/closes.sh` into `.cycle/scripts/`, and invokes the script via `spawnSync("bash", [".cycle/scripts/commit.sh"], ...)` with array args (no `shell: true`).
- All `spawn`/`spawnSync` calls use array args, per repo subprocess discipline.
- Subprocess env sets `CYCLE_ID` + `CYCLE_TITLE`. `commit.gpgsign=false` + `user.email`/`user.name` config to avoid signing prompts.
- Temp dirs cleaned up in a `finally` block on every test.

## Acceptance Criteria
- [ ] `tests/defaults/commit_sh.test.ts` exists and is picked up by `npm test`.
- [ ] **Case 1 — staged deletion (`D ` in porcelain).** Seed repo has a tracked `victim.txt`; remove it with `git rm` (staging the deletion) before running `commit.sh`. Script exits 0, creates a commit, and the commit's name-only diff includes `victim.txt` as a deletion. No `git add` pathspec error in stderr.
- [ ] **Case 2 — unstaged worktree deletion (` D` in porcelain).** Seed repo has a tracked `victim.txt`; `fs.rm` it from the worktree without staging. Script exits 0, creates a commit recording the deletion (verified by name-only diff or `git ls-tree`). No `git add` pathspec error in stderr.
- [ ] **Case 3 — control: new file + modification.** Add a new tracked-eligible source path under `src/` and modify the seed `README.md`. Script exits 0; commit contains both paths.
- [ ] All existing tests still pass (398/398 baseline).
- [ ] No new compiler/linter warnings (`npm run typecheck` clean).
- [ ] Coverage gates still green (line ≥95, branch ≥75, func ≥90; per-file floor `src/engine/triage.ts ≥95%` untouched).
- [ ] Reverting the `if [ ! -e "$path" ]` block in `commit.sh` causes Case 1 and Case 2 to fail (verified manually during build; documented in BUILD.md).

## Testing Strategy
- Node's native `node:test` + `node:assert/strict` runner, mirroring the helper shape in `tests/defaults/commit-staging.test.ts:8-54` (`makeRepo`, `runScript`, `commitFiles`, `porcelainPaths`).
- Three `test(...)` blocks, one per case. Each:
  1. Builds the repo via the shared helper.
  2. Sets up the file-system state that produces the targeted porcelain XY code.
  3. Asserts on `r.status`, `r.stderr`, and the resulting commit's tree (`git diff-tree --no-commit-id --name-status -r HEAD` to distinguish `D` from `A`/`M`).
- Edge / regression coverage: assert stderr is free of `pathspec .* did not match` for the deletion cases — that's the precise symptom the guard prevents.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: no change. The "Subprocess discipline" section already covers the test's spawn rules; no new convention introduced.
- **README.md**: no change. Internal regression test, not user-visible behavior.
- **BUILD.md / FIX.md (cycle artifacts)**: BUILD.md must record the manual revert-and-rerun check that proves the test actually guards the branch.

## Dependencies
- `src/defaults/scripts/commit.sh` and `src/defaults/scripts/lib/closes.sh` exist at HEAD (they do — current source verified).
- Node ≥ 22.6 with `--experimental-strip-types` for direct `.ts` test execution (already the project floor).
- No external services or env vars required beyond the per-test `CYCLE_ID` / `CYCLE_TITLE` injected via `spawnSync` env.
