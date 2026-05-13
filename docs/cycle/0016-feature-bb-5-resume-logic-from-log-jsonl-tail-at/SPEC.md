# Spec: BB-5 — Resume logic from log.jsonl tail

**Source:** Issue title `BB-5: Resume logic from log.jsonl tail` and
`docs/RFC-001-issue-lifecycle.md` §§ 10–12.

## Goal

When `cycle` is re-invoked after a mid-cycle crash (process kill, OOM,
SIGTERM, machine reboot), the engine resumes the in-flight cycle from
the last incomplete workflow step on the same branch and artifact
directory, instead of allocating a new `cycle_id` and re-running from
step 0. A second invocation that follows a clean stop (last log event
is `engine.stop` or a matching `cycle.end`) starts fresh.

## Requirements

1. **Detection criterion.** On `engine.start`, scan `.cycle/log.jsonl`
   backwards. The cycle is in-flight iff the most-recent `cycle.start`
   has no matching `cycle.end` with the same `cycle_id` appearing
   after it. A trailing `engine.stop`, a matching `cycle.end ok`, or
   a matching `cycle.end failed` all yield "no in-flight cycle" and
   the engine starts fresh. Malformed lines must be skipped, not
   thrown.

2. **Pre-resume base refresh.** Before re-entering the cycle, the
   engine performs `checkoutBase` + `pullBase` (= `git fetch` + ff
   merge of the configured base branch, default `main`). On failure
   the engine emits
   `engine.warning reason: resume_base_refresh_failed` and skips
   resume (the in-flight cycle stays on disk; engine falls through to
   the normal triage → pop loop).

3. **Re-run from first incomplete step.** Read `step.end status:ok`
   events emitted after the in-flight `cycle.start` whose `cycle_id`
   matches. The set of those step names is `completed_steps`. The
   `start_step_index` is the index of the first
   `workflow.steps[i].name` not in `completed_steps`. A
   `step.end status:failed` does NOT count as complete — the failed
   step is re-run. If every step is complete, `start_step_index ==
   steps.length` and resume emits `cycle.end ok` immediately.

4. **Restart-tolerance per step.**
   - Prompt steps: overwrite their artifact file on re-entry (no
     "artifact already exists" guard required).
   - `commit.sh`: already idempotent
     (`git diff --cached --quiet` short-circuit) — no change.
   - `verify.sh`: stateless — no change.
   - `pr.sh`: MUST detect an existing PR via
     `gh pr list --head "${branch}"` and reuse the returned
     `number`/`url` instead of calling `gh pr create`. Empty list →
     fresh `gh pr create` path.

5. **New events / reasons.**
   - `engine.resume` — emitted by the CLI with
     `{ cycle_id, issue_id, from_step, completed_steps }` immediately
     before `runCycle({ resume })`.
   - `cycle.resume` — emitted by `runCycle` in place of `cycle.start`
     with `{ cycle_id, workflow, title, issue_id, start_step_index }`.
   - `engine.warning reason: resume_base_refresh_failed` — fetch / ff
     merge failure during pre-resume refresh.
   - `engine.warning reason: resume_row_mismatch` — the in-flight
     `issue_id` has no matching `tbd.jsonl` row, OR the matching row
     is not `status: in_progress`, OR it is `in_progress` for a
     different `cycle_id`. Carries
     `{ cycle_id, issue_id, row_status, row_cycle_id }`. Resume is
     skipped; engine falls through to normal flow.
   - `engine.warning reason: resume_workflow_missing` — the workflow
     name resolved from the in-flight log (or the todo file's
     frontmatter) is not present in `workflows.yml`. Resume is
     skipped.

6. **Fall-through into the normal triage → pop loop.** After resume
   completes (success, retry-drain, terminal-drain, or skip-via-
   warning), the engine continues into the existing triage → pop
   loop so additional queued rows can run in the same invocation.
   `--dry-run` skips resume entirely.

## Out of scope (explicit non-goals)

- No reflection step (BB-7).
- No `propagateBlocked` work beyond what already exists (BB-6).
- No multi-process locking / PID files; concurrent invocations are
  not supported.
- No retroactive draining of stale `in_progress` rows when the log
  shows `cycle.end` was already emitted — fresh start is correct.
- No queue-row hand-edit reconciliation — `resume_row_mismatch`
  surfaces it; operator handles manually.

## Verification surfaces

- `src/engine/log-tail.ts` — `parseLogTail` / `readLogTail`.
- `src/engine/branch.ts` — `checkoutCycleBranch` (idempotent).
- `src/engine/run-cycle.ts` — `resume` option, `cycle.resume` emit.
- `src/engine/queue.ts` — `markInProgress` idempotent for
  `(id, sameCycleId)`, throws on `(id, otherCycleId)` while
  `in_progress`.
- `src/cli.ts` — resume hook between `engine.start` and pop loop.
- `src/defaults/scripts/pr.sh` — `gh pr list --head` reuse.
- Tests: `tests/engine/log-tail.test.ts`,
  `tests/engine/branch.test.ts`, `tests/engine/run-cycle.test.ts`
  resume cases, `tests/engine/queue.test.ts` idempotency cases,
  `tests/cli/resume.test.ts`,
  `tests/defaults/pr-restart-tolerance.test.ts`.
