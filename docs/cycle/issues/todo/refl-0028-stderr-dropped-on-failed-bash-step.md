---
id: refl-0028-stderr-dropped-on-failed-bash-step
title: Surface head-capped stderr on failed step.end events from execBashStep
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:20:57.263Z"
source: triage
---
## Problem

`src/engine/run-cycle.ts:80` emits `step.end {status, exit_code}` and discards the `stderr` already captured by `src/engine/exec-bash.ts:23`. This masked the root cause of two consecutive `commit` failures (cycles 0026 + 0027, both exit 128) — the planner had to manually re-run `bash -x .cycle/scripts/commit.sh` against the dirty tree to diagnose the `git add <missing-path>` bug. Without that manual repro, the third retry would have failed identically.

Reflection origin: cycle 0028, `priority_hint: 9`.

## Scope

- Include a head-capped `stderr` field (e.g. first 2000 chars, trailing `…` on overflow — match the existing `engine.paused` truncation convention) on `step.end` whenever `status === 'failed'`.
- Successful step.end events stay quiet (no stderr field) so the log stays readable.
- Only the bash-exec path in scope; `execClaudecodeStep` is out of scope unless the same masking applies (verify and call out in BUILD.md if it does).

## Acceptance

- A failing `execBashStep` invocation surfaces the captured stderr (head-capped) on the emitted `step.end` event.
- A succeeding `execBashStep` invocation does NOT add a stderr field to `step.end`.
- New test in `tests/engine/run-cycle.test.ts` (or wherever `execBashStep` is exercised) asserts both cases — stderr present on failure, absent on success.
- Truncation cap matches the existing convention used elsewhere in the engine (cross-reference `engine.paused` truncation helper if one exists; otherwise inline a constant and note the duplication in REFLECTION.md).
- `npm test`, `npm run typecheck`, and coverage gates (line ≥95%, branch ≥75%, func ≥90%) all pass.

## Out of scope

- Reformatting the log schema beyond adding the optional field.
- stderr surfacing for non-failed statuses.
- Refactoring `execBashStep`'s capture mechanism — it already captures stderr; this cycle just stops dropping it on the floor.
