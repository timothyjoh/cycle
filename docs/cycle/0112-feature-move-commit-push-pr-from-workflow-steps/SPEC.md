# SPEC — Cycle 0112: Move commit/push/PR from workflow steps to engine-level behavior

## Objective
Extract commit, push, and PR creation from workflow step definitions and make them engine-managed behavior. Currently every workflow embeds explicit `commit` and `pr` steps that run like any other step — the engine has no awareness of commit lifecycle, retries, or push failures. This cycle delivers the `trunk` mode end-to-end: config parsing, `commitCycle()` for trunk mode, push retry with backoff, closes-block generation, workflow migration (remove the step-level commit/pr definitions and obsolete scripts), and full test coverage. Worktree-based modes (`worktree-pr`, `review-pr`) are deferred to a follow-on cycle.

## Source Issue
`engine-level-commit-push-pr` — "Move commit/push/PR from workflow steps to engine-level behavior"

## Scope

### In Scope
- `CommitConfig` type + `engine.commit` block parsed from `workflows.yml` (config loader)
- `commitCycle()` engine function implementing `trunk` and `local-only` modes with push retry (3× backoff)
- Closes-block generation from `CYCLE_ISSUE_ID` + `gh repo view`
- Migration: remove `commit`/`pr` steps from `src/defaults/workflows.yml` and `.cycle/workflows.yml`; delete `commit.sh`, `commit-trunk.sh`, `pr.sh`, `lib/closes.sh`; remove `no_branch` field from schema and all usages
- Tests covering trunk mode, local-only mode, and the push retry/failure path

### Out of Scope
- `worktree-pr` mode (worktree create/destroy lifecycle, trunk sync after merge)
- `review-pr` mode (halt-after-PR-creation behavior)
- Per-workflow commit mode override
- Remote CI gating, parallel PR queuing, deployment hooks

## Requirements
- `engine.commit` block in `workflows.yml` controls commit behavior; defaults to `mode: trunk, push: true`
- Engine fires `commitCycle()` after all steps complete with `status: ok` — not as a step
- Push retry: 3 attempts with short backoff (e.g., 1s, 2s, 4s); persistent push failure counts toward `max_consecutive_failures`
- Commit message format: `cycle {id}: {title}` with a `Closes #N` footer when `gh repo view` resolves the issue URL
- `local-only` mode commits without pushing
- `no_branch` field removed from workflow schema and defaults; `engine.commit.mode` owns branching strategy
- Obsolete scripts (`commit.sh`, `commit-trunk.sh`, `pr.sh`, `lib/closes.sh`) deleted from `src/defaults/scripts/`
- Subprocess discipline: all git/gh invocations use spawn with array args, no `exec`/`shell:true`

## Acceptance Criteria
- [ ] `engine.commit` parses correctly from both `src/defaults/workflows.yml` and `.cycle/workflows.yml`; unknown mode throws at parse time
- [ ] Engine calls `commitCycle()` after a successful cycle run — verified by integration test or test double
- [ ] Push retries up to 3× with backoff; fourth failure marks cycle as failed
- [ ] Commit message matches `cycle {id}: {title}` format
- [ ] `local-only` mode commits without any push attempt
- [ ] `no_branch` field absent from schema, defaults, and all TypeScript types
- [ ] Obsolete scripts deleted; `sync-defaults` copies the updated defaults without them
- [ ] Workflow `commit`/`pr` steps removed from both `workflows.yml` files
- [ ] All existing tests still pass (`npm test`)
- [ ] Coverage does not decrease vs. baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] No compiler warnings (`npm run typecheck`)

## Testing Strategy
- Framework: existing Vitest suite (`npm test`)
- Unit tests for `commitCycle()`: mock `spawnSync`/`spawn`; verify trunk mode calls `git commit` then `git push`; verify retry count and backoff; verify local-only skips push
- Unit test for closes-block generation: mock `gh repo view` output; assert footer appended
- Unit test for config parsing: valid config, missing `engine.commit` block (defaults applied), unknown mode (throws)
- Regression: full suite passes after script deletion and workflow migration

## Documentation Updates
- **CLAUDE.md**: No command changes needed; `commit` step removal is transparent to users
- **`src/defaults/workflows.yml` comments**: Remove references to `commit`/`pr` steps; add comment noting commit is engine-managed
- **`docs/ENGINE.md`**: Add section describing engine-managed commit lifecycle and `engine.commit` config shape

## Dependencies
- `src/engine/config.ts` (or equivalent config loader) must already exist — it does
- `gh` CLI available in PATH (already a runtime requirement per `BRIEF.md`)
- `git` available in PATH (already required)
