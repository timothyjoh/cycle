---
id: engine-level-commit-push-pr
title: Move commit/push/PR from workflow steps to engine-level behavior
workflow: feature
depends_on: []
triaged_at: "2026-05-16T20:27:12.000Z"
source: triage
---
## Problem

Commit, push, and PR creation are currently encoded as explicit steps in every workflow (`{ name: commit, agent: bash, command: scripts/commit-trunk.sh }`). This couples commit strategy to individual workflows, makes the behavior non-uniform across workflows, and prevents the engine from managing the commit lifecycle itself (retries, worktree cleanup, trunk sync).

In practice the engine is not committing after successful cycles because the commit step is part of the workflow definition and runs like any other step — with no engine-level awareness of success, retries, or push failures.

## Design decisions (fully resolved)

### Config shape

Add an `engine.commit` block to `workflows.yml` (global only, no per-workflow override):

```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master
  commit:
    mode: trunk        # trunk | worktree-pr | review-pr | local-only
    push: true
    auto_merge: false  # only relevant for worktree-pr
```

### Modes

| Mode | Behavior |
|---|---|
| `trunk` | Commit directly to base branch, push to remote |
| `worktree-pr` | Each cycle in its own worktree; push branch, create PR, merge immediately, delete worktree, pull trunk |
| `review-pr` | Same as worktree-pr but engine halts after PR creation and prints link — human reviews before proceeding |
| `local-only` | Commit only, no push |

### Trigger

Engine fires commit after **all steps complete with `status: ok`**, including `documentation`. Not a step — an engine action.

### Commit failure handling

Retry push up to 3× with short backoff. If still failing, treat as cycle failure (counts toward `max_consecutive_failures`). The cycle's tested changes are sunk cost; don't re-run the whole cycle for a transient push failure.

### Commit message

Hardcoded format: `cycle {id}: {title}`. Engine generates a `Closes #N` block using `CYCLE_ISSUE_ID` and `gh repo view`.

### Worktree lifecycle (mode: worktree-pr)

- Worktree created **before spec step**
- Worktree deleted **after merge confirmed**
- Trunk sync (`git pull origin master`) happens implicitly after merge before next cycle's worktree is created

### review-pr halt behavior

Engine halts after PR creation, prints PR link, stops. Serial: one PR per run. Human merges, restarts cycle.

### Migration

- Remove `commit` and `pr` steps from all workflow definitions in `src/defaults/workflows.yml` and `.cycle/workflows.yml`
- Delete `src/defaults/scripts/commit.sh`, `commit-trunk.sh`, `pr.sh`, `lib/closes.sh`
- Remove `no_branch` flag from workflow definitions — `engine.commit.mode` owns this
- Clean break (pre-1.0); no backwards-compatibility shim

## Implementation tasks

1. Add `CommitConfig` type and parse `engine.commit` in `src/engine/config.ts` (or equivalent loader)
2. Implement `commitCycle()` engine function covering all four modes
3. Implement push retry loop (3× backoff)
4. Implement worktree create/destroy lifecycle for `worktree-pr` and `review-pr` modes
5. Implement trunk sync after merge in `worktree-pr` mode
6. Implement closes-block generation in the engine
7. Remove `commit`/`pr` steps from both `workflows.yml` files
8. Delete the four obsolete scripts
9. Remove `no_branch` field from workflow schema and all usages
10. Add tests covering all four modes and the retry/failure path

## Out of scope

- Remote CI gating (the cycle's own verify step is the quality gate)
- Per-workflow commit mode override
- Parallel PR queuing
- Deployment hooks (left to individual repo workflows)
