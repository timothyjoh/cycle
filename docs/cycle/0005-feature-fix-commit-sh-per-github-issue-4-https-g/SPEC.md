```markdown
# SPEC — Cycle 0005: commit.sh selective staging (drop `git add -A`)

## Objective
Replace `git add -A` in the default `commit.sh` with an explicit allowlist
of paths so cycle commits contain only the cycle's intended change
surface. Transient files under `.claude/`, `dist/`, `node_modules/`, and
stray worktree gitlinks must never leak into a cycle commit or PR. This
closes a general consumer correctness gap (GH issue #4) observed across
dogfood cycles 0001 and 0002.

## Source Issue
`txt-20260512-234907-fix-commit-sh-per-github-issue-4-https-g` — "Fix
commit.sh per GitHub issue #4 — stage only the cycle's expected change
surface; drop `git add -A`."

GitHub: https://github.com/timothyjoh/cycle/issues/4

## Scope

### In Scope
- Rewrite `src/defaults/scripts/commit.sh` to stage an explicit allowlist
  derived from `CYCLE_ID` and report any residual unstaged paths to
  stderr without staging them.
- Add unit/integration tests under `tests/defaults/` covering the new
  selective-staging behavior and the transient-rejection guarantee.
- Sync the regenerated script to `.cycle/scripts/commit.sh` via the
  existing `npm run sync-defaults` flow so the repo's own engine
  consumes the fix.

### Out of Scope
- Engine-side enforcement of staging policy (cycle.ts changes). Script
  remains the policy boundary per the issue.
- `.gitignore` defaults emitted by `cycle init`.
- Changes to `pr.sh`, `verify.sh`, or any other default script.
- `dist/defaults/scripts/commit.sh` source edit — that file is the
  build output and is regenerated, not authored.

## Requirements

Functional:
- `commit.sh` MUST NOT call `git add -A` (or `git add .` from the repo
  root) anywhere in its execution path.
- `commit.sh` MUST stage, when present and modified/untracked:
  1. `docs/cycle/<CYCLE_ID>-*/` — the cycle's artifact directory
     (resolved by glob on the leading cycle id).
  2. The matching issue file under `docs/cycle/issues/queued/` or
     `docs/cycle/issues/triaged/` whose path appears in the
     cycle.start record (resolvable from `CYCLE_ID` via
     `.cycle/log.jsonl` lookup, or via an env var the engine already
     exports — pick whichever is already available; do not invent new
     engine plumbing).
  3. All tracked modifications and untracked additions OUTSIDE the
     transient denylist (see below). Concretely: stage every path
     reported by `git status --porcelain` that is not matched by the
     denylist and is not a directory gitlink.
- `commit.sh` MUST treat the following as a hard denylist and never
  stage them, even if they match the allowlist by accident:
  - `.claude/**`
  - `.cycle/cycle.pid`
  - `.cycle/scheduled_tasks.lock` (and any path ending in `.lock`)
  - `dist/**`
  - `node_modules/**`
  - Any submodule / worktree gitlink (git status code `160000`).
- If `git status --porcelain` is non-empty after the staging pass,
  `commit.sh` MUST emit each residual path on its own line to stderr
  with a `commit.sh: unstaged residual: ` prefix. It must NOT stage
  them and must NOT exit non-zero solely on residuals.
- If nothing was staged (`git diff --cached --quiet` succeeds), keep
  the existing `nothing to commit` exit-0 behavior.
- On success, keep the existing trailing `git rev-parse HEAD` so the
  engine can capture the commit sha.

Non-functional:
- Script remains bash, `set -euo pipefail`, no new external
  dependencies. Portable on macOS bash 3.2 and Linux bash ≥ 4.
- Runtime overhead negligible (one `git status` parse, one `git add`
  per allowed path or batched).

## Acceptance Criteria
- [ ] `src/defaults/scripts/commit.sh` contains no `git add -A` and no
      `git add .` invocation.
- [ ] Running the script in a fixture repo where the working tree
      contains both intended cycle paths and transient paths (a
      `.claude/scheduled_tasks.lock`, a stray `dist/foo.js`, and a
      gitlink entry) produces a commit whose `git show --stat` lists
      only the intended paths.
- [ ] The residual transients still appear in `git status` after the
      script runs and are echoed to stderr with the documented prefix.
- [ ] `tests/defaults/scripts.test.ts` (or a sibling test file) covers
      both the happy path and the transient-rejection path against a
      throwaway git repo created in a temp dir.
- [ ] `.cycle/scripts/commit.sh` matches `src/defaults/scripts/commit.sh`
      byte-for-byte after `npm run sync-defaults`.
- [ ] All existing tests in `tests/**` still pass (`npm test`).
- [ ] `tsc --noEmit` reports zero errors.
- [ ] `docs/DOGFOOD.md` retrospective entry for the `commit.sh
      over-staged` finding is marked resolved with a pointer to cycle
      0005.

## Testing Strategy

Framework: Node's built-in `node:test` + `node:assert` (already used by
the suite). Shell behavior is exercised by spawning bash from a Node
test against a tmpdir-scoped fixture git repo.

Key scenarios:
1. **Happy path.** Fixture repo with: an artifact dir
   `docs/cycle/0099-feature-test/SPEC.md`, a queued issue file, and an
   in-tree source change. Run `CYCLE_ID=0099 CYCLE_TITLE=... commit.sh`
   and assert the resulting commit's file list contains exactly those
   three paths.
2. **Transient rejection.** Same fixture, plus
   `.claude/scheduled_tasks.lock`, `dist/foo.js`, and a fake worktree
   gitlink entry. Assert none of those appear in the commit and that
   each is reported on stderr.
3. **Empty staging.** Fixture repo where no intended paths changed —
   assert exit 0 and "nothing to commit" message.
4. **Regression.** Existing `commit.sh has shebang and is executable`
   test continues to pass.

No browser/E2E tests required — this change has no UI surface.

## Documentation Updates
- **`docs/DOGFOOD.md`**: mark the `commit.sh over-staged` retrospective
  finding resolved, reference cycle 0005 and GH issue #4.
- **`.cycle/CLAUDE.md`** (if it documents script contracts): note that
  `commit.sh` is selective, not blanket-staging, and that authors of
  new default-emitted artifacts should ensure their paths fall under the
  allowlist or be added explicitly.

No README user-facing change — this is internal engine behavior.

## Dependencies
- Existing `npm run sync-defaults` script (`scripts/sync-defaults.mjs`)
  to mirror `src/defaults/scripts/` into `.cycle/scripts/`.
- `bash`, `git` on `PATH` (already required by the engine).
- `CYCLE_ID` and `CYCLE_TITLE` env vars exported by the engine before
  invoking the commit step (already the contract).
- No new npm dependencies.
```
