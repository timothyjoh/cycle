---
id: refl-0040-orphaned-cycle-branches-from-aborted-run-claude-md-manual-cleanup-note
title: Document manual cleanup procedure for orphaned cycle/* branches in CLAUDE.md
workflow: document
depends_on: []
triaged_at: "2026-05-14T03:44:08.010Z"
source: triage
parent: refl-0040-orphaned-cycle-branches-from-aborted-run
---
Add a short section to CLAUDE.md documenting the manual cleanup procedure for orphaned `cycle/<workflow>/<slug>` branches left behind by aborted runs. Motivating incidents: cycle 0038 `pr`-step failure and cycle 0039 engine restart during `research` both left real `cycle/feature/define-enforce-restart-policy-for-build` branch state with no automatic cleanup. SPEC §Out of Scope for cycle 0040 explicitly deferred auto-recovery of orphaned cycle branches; this note is interim guidance until the CLI housekeeping subcommand lands (see sibling work item `refl-0040-orphaned-cycle-branches-from-aborted-run-cli-cleanup-orphaned-cycle-branches`).

## Why orphans occur

- Engine aborts outside the normal terminal-failure path (process kill, OS restart, mid-`research`/`spec`/`plan` halt).
- `createCycleBranch` reuses the same branch name on retry, so partial agent state from a non-`build` step survives indefinitely on the cycle branch.
- Policy 1 hard-reset only wipes the branch on `build` resume — `spec`/`research`/`plan` aborts leave the branch dirty forever.

## Cover in the note

- One paragraph explaining the failure mode and why it is currently harmless-but-cluttering (branch reuse keeps things correct, stale refs just accumulate).
- How to identify safe-to-delete branches: enumerate `git for-each-ref refs/heads/cycle/` and cross-reference against `tbd.jsonl` rows where `status: in_progress`.
- A copy-pasteable preview + delete pair, e.g.:
  - Preview: `git for-each-ref --format='%(refname:short)' refs/heads/cycle/`
  - Confirm none match an in-progress row in `.cycle/tbd.jsonl`.
  - Delete: `git branch -D <branch>` per orphan (do NOT use `xargs` blindly — review the list first).
- Forward pointer to the CLI subcommand work item that will replace this procedure.

## Acceptance

- New subsection appears in CLAUDE.md adjacent to the existing resume / Policy 1 documentation (the `## Architecture quick reference` block).
- Procedure is copy-pasteable, references the current `cycle/<workflow>/<slug>` branch-name format, and explicitly names `.cycle/tbd.jsonl` `in_progress` rows as the source of truth for live branches.
- No code changes outside CLAUDE.md.
