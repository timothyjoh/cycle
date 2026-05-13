---
id: refl-0028-stderr-dropped-on-failed-bash-step
source: reflection
title: stderr-dropped-on-failed-bash-step
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0028"
---

`src/engine/run-cycle.ts:80` emits `step.end {status, exit_code}` and discards the `stderr` already captured by `src/engine/exec-bash.ts:23`. This masked the root cause of two consecutive `commit` failures (cycles 0026 + 0027, both exit 128) — RESEARCH explicitly notes the planner had to manually re-run `bash -x .cycle/scripts/commit.sh` against the dirty tree to diagnose the `git add <missing-path>` bug. Without that manual repro, the third retry would have failed identically.

Fix is a one-line edit: include a head-capped (e.g. first 2000 chars) `stderr` field on `step.end` whenever `status === 'failed'`. Existing successful steps stay quiet to keep the log readable. Pair with a brief test in `tests/engine/run-cycle.test.ts` (or wherever `execBashStep` is exercised) that asserts the surfaced field on a failure case.
