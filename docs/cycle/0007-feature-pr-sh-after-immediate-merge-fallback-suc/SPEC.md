# SPEC — Cycle 0007: pr.sh remote branch cleanup after fallback merge

## Objective
When `pr.sh`'s auto-merge attempt fails and the synchronous immediate-merge fallback completes the squash merge, the remote feature branch (`origin/cycle/<workflow>/<slug>`) is left orphaned. `gh pr merge --delete-branch` only deletes the ref when GitHub itself performs the merge asynchronously via the auto-merge queue; on the synchronous fallback path the flag is silently ignored. This cycle adds an explicit ref deletion via `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>` after a successful fallback merge, with regression tests, so the fallback path matches the cleanliness contract of the happy path.

## Source Issue
`txt-20260513-011616-pr-sh-after-immediate-merge-fallback-suc` — "pr.sh: after immediate-merge fallback succeeds, delete the remote branch"

## Scope

### In Scope
- Add explicit remote branch deletion via `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>` in `src/defaults/scripts/pr.sh`, executed only after the fallback merge returns exit 0.
- Add static test coverage in `tests/defaults/pr-auto-merge-fallback.test.ts` (or a sibling test file) asserting the deletion call shape, ordering (after merge success), and stderr-prefixed warning on deletion failure.

### Out of Scope
- Changing the happy-path (auto-merge queue) behavior — `--delete-branch` continues to handle that case.
- Cleaning up local branches (engine, not `pr.sh`, owns local branch state after `cycle.end`).
- Backporting the deletion logic to historical orphaned remote branches (operator concern, separate cleanup).
- Refactoring `pr.sh` structure beyond the fallback success block.

## Requirements
- The new `gh api -X DELETE` call MUST run **only** when the fallback merge (`gh pr merge ... --squash --delete-branch` in the fallback branch) succeeds — never on the auto-merge poll path, never on fallback failure.
- The owner/repo pair MUST be resolved at runtime (e.g. via `gh repo view --json nameWithOwner -q .nameWithOwner`) so the script is repo-agnostic. The branch name comes from the existing `${branch}` variable.
- A failed ref-deletion MUST NOT mark the cycle as failed: the merge already succeeded, so the script must emit a `pr.sh:`-prefixed warning to stderr, still print `${pr_url}` to stdout, and exit 0. Orphan ref is a janitorial concern, not a quality gate.
- Existing behaviors preserved: 30-minute auto-merge poll, error-classification `case` (GraphQL token + human text), `fallback_rc` capture idiom, all current `pr.sh:` stderr prefixes.
- No new external dependencies. Pure `gh` CLI.

## Acceptance Criteria
- [ ] `src/defaults/scripts/pr.sh` contains a `gh api -X DELETE repos/.../git/refs/heads/...` invocation reachable only on the fallback merge success branch.
- [ ] Owner/repo resolution uses `gh repo view --json nameWithOwner` (or equivalent `gh` call) — not hardcoded, not parsed from `git remote`.
- [ ] Fallback merge failure path is unchanged: stderr diagnostics + exit 1.
- [ ] Ref-deletion failure logs a `pr.sh:` warning to stderr and still exits 0 with `${pr_url}` on stdout.
- [ ] New regression tests in `tests/defaults/` assert: (a) the DELETE call exists, (b) it references `git/refs/heads/`, (c) it is positioned after the fallback merge and gated on its success, (d) the warn-and-continue pattern on deletion failure.
- [ ] All existing tests in `tests/defaults/pr-auto-merge-fallback.test.ts` still pass (regression guard for the prior cycle's behavior).
- [ ] `npm test` green across the full suite.
- [ ] No new compiler/linter warnings.
- [ ] Byte-equality between `src/defaults/scripts/pr.sh` and any deployed copy under `dist/` is restored after the build step (matches Cycle 0005/0006 convention).

## Testing Strategy
- **Framework.** Node's built-in `node:test` + `node:assert/strict` — matches existing `tests/defaults/*.test.ts` style.
- **Static-shape tests** (consistent with current `pr-auto-merge-fallback.test.ts` approach — these scripts run inside `gh` so live integration is infeasible in CI):
  - Assert presence and shape of the `gh api -X DELETE repos/.../git/refs/heads/...` call.
  - Assert the DELETE call appears textually **after** the fallback `gh pr merge` invocation.
  - Assert the DELETE call is conditioned on `fallback_rc -eq 0` (or equivalent control flow) so a failed fallback merge cannot trigger ref deletion.
  - Assert a `pr.sh:`-prefixed warning string exists for ref-deletion failures and that the deletion failure path still echoes `${pr_url}` (success-with-warning contract).
- **Regression coverage.** Re-run the existing 7 assertions in `pr-auto-merge-fallback.test.ts` to guarantee Cycle 0006's contract is intact.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: no behavior contract change for callers; skip unless a doc currently lists `pr.sh` post-conditions explicitly. If `CLAUDE.md` enumerates which side effects `pr.sh` performs, add "deletes remote feature branch after fallback merge" to that list.
- **README.md**: surface a one-line note under any "merge behavior" or "auto-merge fallback" section that the fallback path now performs explicit ref cleanup so branch lists stay clean on repos with auto-merge disabled. If no such section exists, skip — this is an internal correctness fix.
- **DOGFOOD.md (if present)**: tick off the orphaned-branch sharp edge once the change merges, mirroring how Cycle 0005/0006 resolutions were recorded.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `pr.sh` infrastructure from Cycle 0006 (auto-merge fallback path) — already on `master`.
- `gh` CLI with `api` subcommand and repo read scope (already required for `gh pr create`/`merge`).
- `git` for `${branch}` resolution (already used).
- No new env vars; `gh` auth context already required by every other call in this script.
