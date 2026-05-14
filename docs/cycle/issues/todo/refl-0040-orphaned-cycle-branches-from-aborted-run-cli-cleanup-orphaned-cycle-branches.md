---
id: refl-0040-orphaned-cycle-branches-from-aborted-run-cli-cleanup-orphaned-cycle-branches
title: "CLI: housekeeping pass to list+delete orphaned cycle/* branches with no in_progress row"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T03:44:08.010Z"
source: triage
parent: refl-0040-orphaned-cycle-branches-from-aborted-run
---
Implement an engine-level housekeeping pass that lists, and (with confirmation) deletes, orphaned local `cycle/*` branches — branches that have no matching `in_progress` row in `.cycle/tbd.jsonl`. Motivating incident: cycle 0038 `pr`-step failure and cycle 0039 engine restart during `research` left `cycle/feature/define-enforce-restart-policy-for-build` branch state with no automatic cleanup. SPEC §Out of Scope for cycle 0040 explicitly deferred "Auto-recovery of orphaned cycle branches from prior aborted runs" — this work item closes that deferral.

## Shape (decide during plan)

Pick exactly one of:

- **A.** New one-shot subcommand: `cycle cleanup [--dry-run|--yes] [--force]`.
- **B.** Flag on existing read-only command: `cycle status --clean-orphans [--dry-run|--yes]`.

Leaning toward **A** because `status` is currently strictly read-only (see CLAUDE.md Commands table) and adding a write-path side door violates that contract. Resolve in PLAN.

## Behavior

- `--dry-run` (default): lists candidates as JSON `Array<{branch, head_sha, last_commit_subject, in_progress_cycle_id: null}>` to stdout, exits 0, no mutations.
- `--yes`: deletes only the listed orphans after a single confirmation prompt; non-interactive when `--yes` is supplied.
- Source of truth for "live" branches: `.cycle/tbd.jsonl` rows where `status: in_progress`. Each carries `cycle_id`; map to `cycle/<workflow>/<slug>` via the popped todo's frontmatter (`workflow`) plus the slug embedded in the cycle branch name.
- A branch is "orphaned" iff its name matches `^cycle/` AND no `in_progress` row resolves to that exact name.
- Safety:
  - Never delete the currently-checked-out branch (refuse + warn).
  - Never delete `master` / configured base branch.
  - Refuse to run if the working tree is dirty unless `--force` is passed.
  - Use `git branch -D` only after the orphan check; never `--prune` blindly.
- Audit: emit one event per deletion to `.cycle/log.jsonl`, shape `{event: "branch.cleanup_deleted", name, was_head_sha, deleted_at}`. Append-only, same writer as the existing audit log.

## Acceptance

- Subcommand (or flag) wired into `src/cli.ts` and `src/cli/parse-args.ts`; unknown flags rejected.
- `--dry-run` prints the JSON array described above to stdout and exits 0 with no filesystem or git mutations.
- `--yes` deletes only orphans, appends one `branch.cleanup_deleted` event per deletion, and exits 0 on success.
- Integration tests (synthetic-fixture, real git, stub `claude` on private PATH per existing patterns) cover:
  - **(a)** No orphans present → no-op, empty array, no audit events.
  - **(b)** Orphan branch present with no matching `in_progress` row → deleted under `--yes`, retained under `--dry-run`.
  - **(c)** `in_progress` row in `tbd.jsonl` references a `cycle/<workflow>/<slug>` branch → branch is never deleted, regardless of `--yes`.
  - **(d)** Current HEAD is a `cycle/*` branch → command refuses to delete it, exits non-zero with an explanatory message.
  - **(e)** Dirty working tree → command refuses without `--force`.
- Coverage policy (CLAUDE.md): line ≥95%, branch ≥75%, func ≥90% — no per-file regressions vs. master baseline.
- CLAUDE.md interim manual-cleanup section (from sibling `refl-0040-orphaned-cycle-branches-from-aborted-run-claude-md-manual-cleanup-note`) is replaced with a pointer to the new subcommand and updated example invocation.

## Out of scope

- Remote-branch cleanup (`refs/remotes/origin/cycle/*`); local refs only.
- Auto-running cleanup at `engine.stop` or `engine.start`; trigger remains explicit operator action.
- GC of orphaned `.cycle/cycles/<cycleId>/` artifact directories — separate concern, file as its own raw if needed.
