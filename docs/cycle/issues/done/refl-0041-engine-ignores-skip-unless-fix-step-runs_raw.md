---
id: refl-0041-engine-ignores-skip-unless-fix-step-runs
source: reflection
title: engine-ignores-skip-unless-fix-step-runs-with-no-must-fix
added_at: "2026-05-14T04:04:06.496Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0041"
---

`workflows.yml` declares `fix` with `skip_unless: MUST-FIX.md` and `workflow.ts:10` parses the field into the typed step shape, but `src/engine/run-cycle.ts` never reads it. Cycle 0041's `FIX.md` records the symptom verbatim: review passed with no MUST-FIX.md, yet the engine still spawned the `claudecode` agent for the `fix` step, which then exited after producing a no-op FIX.md (~38s wall time in this cycle's log).

Every clean-review cycle pays that cost. Worse, the dead field gives a false sense of safety — readers of `feature.yaml` will assume `fix` is gated by MUST-FIX.md when it is not. Either honor `skip_unless` in `run-cycle.ts` (skip the step when the named artifact is absent, emit `step.end status: skipped`) or remove the field from the workflow type + YAML so the schema matches reality.

Fix is a few lines (predicate check before `runStep`, plus a new `step.end status: skipped` event the test matrix can assert on). Suggest start with honoring the field, since the YAML declarations clearly intended that semantics.
