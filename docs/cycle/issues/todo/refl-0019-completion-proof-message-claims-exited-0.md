---
id: refl-0019-completion-proof-message-claims-exited-0
title: Emit timeout-specific completion-proof message instead of claiming
  exited-0 on timed-out steps
workflow: feature
depends_on: []
triaged_at: 2026-06-01T04:34:42.386Z
source: triage
priority: medium
---
## Problem

The completion-proof branch in `src/engine/run-cycle.ts` (around line 484) runs on `(r.status === "ok" || r.timedOut)`, so a step killed at the timeout limit (SIGTERM, `exit_code: 143`) still writes its empty artifact and runs the `"nonempty"` check. For the `nonempty` policy it stamps `formatCompletionProofError(step, path)`, whose text hard-codes `"<step> exited 0 but … is empty — treating as failure"`. The resulting `step.end` then carries the self-contradictory pair `exit_code: 143` + `stderr: "<step> exited 0 but …<ARTIFACT> is empty"`.

Cycle 0019 tripped over this directly: the `review` step timed out twice at the 2,700,000 ms limit (`step.timeout` events at 03:11 and 04:06 in `.cycle/log.jsonl`), each producing an empty `REVIEW.md` and burning a full `max_cycle_attempts` slot, before the third attempt succeeded. The `step.timeout` event is logged separately, but the most-read field — `step.end.stderr` — actively lies about the cause, telling an operator the agent "exited 0" when it was actually SIGTERM-killed after 45 minutes. That misdirection costs debugging time exactly when a step is hanging.

## Suggested direction

When `r.timedOut` is true, emit a timeout-specific completion-proof message (e.g. `"<step> timed out (exit 143) and left <artifact> empty — treating as failure"`) instead of reusing the exited-0 wording, so the `step.end.stderr` line matches the exit code. Keep the exited-0 wording only for the genuine `r.status === "ok"` path.

## Scope / constraints

- The routing outcome (failed → retry) is already correct and must **not** change — only the human-facing message text branches on `r.timedOut`.
- Cover the new timeout-message branch with a test that asserts a timed-out artifact step produces the timeout-specific stderr (not the exited-0 wording) and that the exited-0 path is unchanged.
- Honor the exactly-once / cardinality-pinned event conventions; `step.completion_check` status routing stays as-is.
