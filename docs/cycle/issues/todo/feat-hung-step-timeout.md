---
id: feat-hung-step-timeout
title: "Per-step wall-clock timeout: kill and fail a hung agent step"
workflow: feature
depends_on: []
triaged_at: "2026-05-31T01:50:00.000Z"
source: user
priority: high
---
## Problem

An agent step that hangs (the `claude`/agent subprocess stops making progress
but never exits) runs **indefinitely** — the engine has no step timeout and
never regains control. Observed this session: a `build` step hung ~60 minutes
(no file changes, no subprocess activity) and only stopped because it was killed
manually. The idea was captured earlier in `d7d45b0` ("hung step timeout idea");
this issue implements it.

## Task

Add a per-step wall-clock timeout to the agent-step execution path
(`src/engine/run-cycle.ts` / the exec dispatch):

1. Add `engine.step_timeout_ms?: number` to `EngineConfig` (default e.g.
   2_700_000 = 45 min; 0/undefined = disabled). Wire into `engine.json` defaults;
   run `npm run sync-defaults`.
2. When an agent step exceeds the timeout, **terminate the subprocess and its
   children** (SIGTERM then SIGKILL; mind PID-tree cleanup — a killed parent can
   orphan the `claude` child), and treat the step as a failed result
   (`{ status: "failed", reason: "step_timeout" }`) so it flows through the
   normal retry / `max_cycle_attempts` machinery.
3. Emit `step.timeout { step, elapsed_ms, limit_ms }` before failing.
4. Bash steps: apply the same timeout (a hung `verify.sh` should also be bounded).
5. The timeout/clock must be **injectable** for tests (no real waiting) — follow
   the `sleepFn` injection precedent in `run-cycle.ts`.

## Acceptance criteria

- [ ] `engine.step_timeout_ms` config (default documented; 0/undefined disables); synced to `.cycle/`.
- [ ] A step exceeding the timeout is killed (process + children) and returns a `step_timeout` failure that routes through retry.
- [ ] `step.timeout` event emitted with `elapsed_ms`/`limit_ms`.
- [ ] Timeout is injectable; tests cover: step exceeds limit → killed + failed; step under limit → unaffected; disabled (0) → no timeout.
- [ ] No orphaned subprocess left after a timeout kill (assert in test where feasible).
- [ ] `npm run typecheck` clean; `npm test` passes; coverage floors hold.

## Notes

- Twin of `feat-step-completion-proof`: completion-proof catches "exited 0 but
  empty"; this catches "never exited at all." Together they close the
  false-success / no-progress failure class observed during the 2026-05-30/31
  dogfood.
