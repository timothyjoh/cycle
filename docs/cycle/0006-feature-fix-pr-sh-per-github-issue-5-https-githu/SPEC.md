# SPEC — Cycle 0006: pr.sh falls back to immediate merge when auto-merge is disabled

## Objective
Make `pr.sh` resilient to repositories that have GitHub's "Allow auto-merge" setting disabled. Today the script blindly calls `gh pr merge --squash --auto`, which fails with `GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)` and halts the cycle. After this change, the script detects exactly that error and falls back to a synchronous squash-merge so general consumers (whose repos default to auto-merge off) get clean cycle completion without manual intervention.

## Source Issue
`txt-20260512-234907-fix-pr-sh-per-github-issue-5-https-githu` — "Fix pr.sh per GitHub issue #5 — fall back to immediate merge when auto-merge is disabled on the repo."

## Scope

### In Scope
- Update `src/defaults/scripts/pr.sh` to catch the `enablePullRequestAutoMerge` error from `gh pr merge --squash --auto` and fall back to `gh pr merge <n> --squash --delete-branch` (immediate merge). On any other first-attempt error, surface it and exit non-zero. On both-failed, emit both errors on stderr and exit non-zero. PR URL stays the stdout contract.
- Add a focused test in `tests/defaults/scripts.test.ts` (or a sibling test file) that asserts `pr.sh` contains the auto-merge call, the specific `enablePullRequestAutoMerge` detection, the immediate-merge fallback invocation, and preserves the stdout PR-URL contract — pure source-shape assertions, mirroring `commit-staging.test.ts`'s style.

### Out of Scope
- Detecting branch protection rules ahead of time (issue explicit out-of-scope).
- Changing the merge mode default (still squash).
- Polling logic redesign — the existing 30-min poll only matters for the auto-merge path and is unchanged. Fallback path is synchronous, no polling.
- Updating `.cycle/scripts/pr.sh` in the consuming-repo instance (synced separately via the same byte-equality check used in cycle 0005).

## Requirements
- First attempt remains `gh pr merge "${pr_number}" --squash --auto`.
- Capture stderr of the first attempt. If it contains the literal substring `Auto merge is not allowed for this repository` (or the GraphQL token `enablePullRequestAutoMerge`), invoke `gh pr merge "${pr_number}" --squash --delete-branch` immediately.
- On fallback success: echo `${pr_url}` to stdout and exit 0 — same contract as the auto-merge happy path. Skip the poll loop (PR is already merged).
- On any other first-attempt error: print the captured stderr and exit non-zero. No silent retry.
- On fallback failure: print both the auto-merge error and the fallback error on stderr; exit non-zero.
- `set -euo pipefail` semantics preserved — do not lose error visibility from the fallback branch.
- Idempotent re-runs: not a goal beyond what already exists.

## Acceptance Criteria
- [ ] `pr.sh` invokes `gh pr merge … --squash --auto` first.
- [ ] On the `enablePullRequestAutoMerge` / `Auto merge is not allowed for this repository` error, `pr.sh` invokes `gh pr merge … --squash --delete-branch` and, on success, echoes the PR URL to stdout and exits 0.
- [ ] On any other first-attempt error, `pr.sh` exits non-zero with the original stderr visible (no fallback invoked).
- [ ] On fallback failure, both error messages reach stderr and the script exits non-zero.
- [ ] New test in `tests/defaults/` validates the source contains: the `--auto` first call, the `enablePullRequestAutoMerge`/`Auto merge is not allowed` detection, the `--delete-branch` fallback invocation, and the PR-URL stdout contract on the fallback branch.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced.
- [ ] `src/defaults/scripts/pr.sh` and `.cycle/scripts/pr.sh` remain byte-equal after sync (cycle 0005 convention).

## Testing Strategy
- **Framework.** `node:test` + `node:assert/strict`, matching `tests/defaults/commit-staging.test.ts` and `tests/defaults/scripts.test.ts`.
- **Approach.** Source-shape assertions on `src/defaults/scripts/pr.sh` — read the file, grep for required tokens. This mirrors the existing test discipline for cycle's shell scripts (no live `gh` shell-out in unit tests). Live behavior is validated by the dogfood loop itself.
- **Key scenarios covered by assertions.**
  - Contains `gh pr merge "${pr_number}" --squash --auto` (first attempt unchanged).
  - Contains `enablePullRequestAutoMerge` *or* `Auto merge is not allowed for this repository` (detection token).
  - Contains `gh pr merge "${pr_number}" --squash --delete-branch` (fallback invocation).
  - Contains an explicit `echo "${pr_url}"` reachable from the fallback success path.
  - Still references the existing 30-min poll deadline (regression guard on the auto-merge path).
- **E2E.** Not applicable — no UI. The cycle engine's own next run on a follow-up issue is the end-to-end signal.

## Documentation Updates
- **README.md / BRIEF.md**: no user-facing change needed — pr.sh is an internal default script and the new behavior is a strict fallback, not a new feature flag.
- **DOGFOOD.md**: append a one-line entry noting the auto-merge-disabled failure mode is now handled by pr.sh fallback (closes the observation logged from cycles 0001/0002).
- **CLAUDE.md / AGENTS.md**: no convention change.

Documentation is part of "done" — the DOGFOOD.md note is the only doc surface affected.

## Dependencies
- `gh` CLI available and authenticated (existing runtime dependency).
- No new env vars. No new packages.
- The consuming repo's `.cycle/scripts/pr.sh` is synced from `src/defaults/scripts/pr.sh` per cycle 0005's byte-equality convention.
