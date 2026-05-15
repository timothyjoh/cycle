---
id: refl-0065-extract-shared-head-capped-truncate-help
source: reflection
title: extract-shared-head-capped-truncate-helper-third-caller-landed
added_at: "2026-05-15T18:33:28.859Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0065"
---

`src/engine/run-cycle.ts:27-29` defines `MAX_STEP_END_STDERR = 2000` + `truncateStepEndStderr(s)` as a byte-for-byte duplicate of `src/engine/triage.ts:231-233`'s `MAX_ERR_LEN = 2000` + `truncate(s)` (used by `engine.paused last_errors[].error`). BUILD.md and CLAUDE.md's new bullet both flag the duplication as intentional, with the rule "extract a shared helper when a third caller lands."

Why it matters: the convention (slice to `MAX-1` + `…`, 2000-char cap) is now a load-bearing engine-wide contract — pinned by tests in both `tests/defaults/` and `tests/engine/run-cycle.step-end-stderr.test.ts`. Two inline copies drift risk is low today, but every future caller (agent-path step.end stderr, future event payloads, structured error reporting) will copy-paste a third / fourth time.

Suggested direction: when the agent-path extension above lands (or the next caller, whichever comes first), extract `truncateHeadCapped(s: string, max: number): string` into `src/engine/log.ts` (alongside the logger interface that consumes the result) or a new tiny `src/engine/log-fmt.ts`. Replace both call sites and adjust the CLAUDE.md notes that currently celebrate the intentional duplicate.
