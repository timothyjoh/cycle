---
id: feat-bash-step-output-capture
title: "Capture bash-step stdout on failure so verify failures are diagnosable from the log"
workflow: feature
depends_on: []
triaged_at: "2026-05-31T01:50:00.000Z"
source: user
priority: medium
---
## Problem

When a `bash` step (e.g. `verify` → `scripts/verify.sh` → `npm test`) fails, the
engine's `step.end` event records only `stderr` — but test runners print
failures to **stdout**, so the event shows `exit_code: 1, stderr: ""` and the
*reason* is invisible. This session, diagnosing a verify failure required
re-running `npm test` by hand. (Same observability family as `refl-0253`/`refl-0254`.)

## Task

Capture bash-step output so a failure is diagnosable from the engine's own log/
artifacts, without dumping unbounded output:

1. On a **failed** bash step, include a head-capped slice of **stdout** (and
   stderr) in the `step.end` event — reuse `truncateHeadCapped(s, max)` from
   `src/engine/log-fmt.ts` so the event stays bounded.
2. Additionally (or alternatively) write the full captured output to a per-cycle
   artifact (e.g. `docs/cycle/<id>-.../<step>.out`) so the complete failure is
   recoverable, with the event carrying a pointer to it.
3. Do not change behavior on success (no noise on the happy path) and never drop
   error lines silently.

## Acceptance criteria

- [ ] A failed bash step's `step.end` event carries a head-capped `stdout` (and `stderr`) excerpt sufficient to identify the failure.
- [ ] Full output recoverable via a per-cycle artifact (or documented decision if event-only).
- [ ] Successful steps unchanged (no added log noise).
- [ ] Tests cover: failing bash step → output present and capped; passing step → unchanged.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage floors hold.

## Notes

- Surfaced during the 2026-05-30/31 dogfood: `verify` failed `exit 1, stderr: ""`
  and the cause (test failures on stdout) was not visible in `run.log`.
