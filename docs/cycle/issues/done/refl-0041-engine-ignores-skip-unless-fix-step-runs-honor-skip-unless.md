---
id: refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless
title: "Honor `skip_unless: MUST-FIX.md` in run-cycle.ts so clean-review cycles skip the `fix` step"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T04:05:53.857Z"
source: triage
parent: refl-0041-engine-ignores-skip-unless-fix-step-runs
---
## Problem

`workflows.yml` declares the `fix` step with `skip_unless: MUST-FIX.md`, and `src/engine/workflow.ts:10` parses the field into the typed step shape — but `src/engine/run-cycle.ts` never reads it. Every clean-review cycle still spawns the `claudecode` agent for `fix`, which then produces a no-op `FIX.md` (~38s wall in cycle 0041's log).

The dead field is worse than wasted cycles: readers of `feature.yaml` will reasonably assume `fix` is gated by `MUST-FIX.md` when it is not. Two coherent fixes exist; this issue picks the one matching declared YAML intent.

## Acceptance

- `run-cycle.ts` honors `skip_unless: <artifact>` on any step by checking for the named file in the cycle artifact directory (`docs/cycle/<cycleId>-<workflow>-<slug>/<artifact>`) immediately before spawning the agent.
- When the artifact is absent, the step emits `step.end status: "skipped"` (new status value alongside `ok` / `failed`) and the workflow proceeds to the next step. No agent process is spawned, no `step.start` head_sha capture, no artifact overwrite.
- When the artifact is present, the step runs exactly as today (no behavior change for dirty-review cycles).
- Resume logic in `cli.ts` — the "first step whose name does not appear in `step.end status: ok` after the in-flight `cycle.start`" rule — treats `skipped` the same as `ok`: a skipped step is complete for resume purposes and is not re-evaluated on resume.
- Restart policy (build/fix hard-reset on resume) is unaffected: `skip_unless` is checked before `head_sha` capture, so skipped steps never record `head_sha` and never trigger a reset on resume.
- Append-only log: the new `step.end status: "skipped"` event carries `{step: <name>, reason: "skip_unless_artifact_missing", artifact: <name>}` so the audit trail explains why no agent ran.

## Tests

- Unit (`tests/unit/run-cycle.skip-unless.test.ts`): predicate fires when artifact missing → `runStep` returns a synthetic `{status: "skipped"}` result and no agent module is invoked; predicate passes when artifact present → normal `runStep` path.
- Integration (`tests/integration/feature-clean-review-skips-fix.test.ts`): end-to-end feature cycle with a stub review step that produces no `MUST-FIX.md` → log shows `step.end {step: "fix", status: "skipped"}`, no `claudecode` spawn, cycle proceeds to `verify`.
- Integration: dirty-review path (`MUST-FIX.md` present) → `fix` runs as today, asserts `step.end status: ok` for `fix`.
- Integration: resume across a `skipped` fix → engine.resume re-reads log, sees `fix` already `skipped`, advances to `verify` without re-evaluating the predicate or re-running `fix`.
- Coverage must hold vs baseline (95% line / 75% branch / 90% func) and the new branch/event paths must be covered by the above tests.

## Notes

- `priority_hint: 7` from cycle 0041 reflection — every clean-review cycle pays ~38s of dead agent time and propagates the false-gating mental model.
- Alternative considered: remove `skip_unless` from the workflow type + YAML and document the unconditional run. Rejected — the YAML declarations clearly intended the gated semantics; honoring the field aligns code with intent.
- Out of scope: generalizing `skip_unless` to arbitrary boolean predicates, multi-artifact conjunctions, or path globs. Single-artifact-presence only for this cycle.
- Origin: `docs/cycle/0041-feature-define-enforce-restart-policy-for-fix-st/REFLECTION.md`; symptom captured verbatim in that cycle's `FIX.md`.
