---
id: refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics
title: "Retry economics: skip pre-build steps whose artifacts already exist on cycle retry"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:19:21.503Z"
source: triage
parent: refl-0028-engine-retries-redo-spec-research-plan-w
---
## Context

Cycles 0026, 0027, and 0028 all retried after a `commit` failure. On each retry the engine re-ran the full `spec → research → plan → build → review → fix → verify → commit` pipeline against a working tree where SPEC/RESEARCH/PLAN mutations from the prior attempt were already on the branch. The output was a re-derivation of the same artifacts, burning ~14 minutes of claudecode per retry. 0028's BUILD.md notes: "Pre-applied SPEC mutations inherited from cycles 0026/0027 left in place and verified."

This is structurally distinct from per-step restart tolerance (covered by the `step-restart-tolerance-audit-*` cluster). That work targets a step that crashed mid-execution; this work targets steps that fully completed in a prior cycle attempt and should not run again at all.

## Proposed direction

When the engine pops a `tbd.jsonl` row with `attempt > 0` (i.e. a retry for the same `issue_id`), skip pre-build workflow steps whose artifact files already exist under the cycle artifact dir and pass an existence + non-empty gate:

- `spec`: skip if `SPEC.md` exists and is non-empty.
- `research`: skip if `RESEARCH.md` exists and is non-empty.
- `plan`: skip if `PLAN.md` exists and is non-empty.
- `build`, `review`, `fix`, `verify`, `commit`: retain per-step restart policy (out of scope here; see `step-restart-tolerance-audit-*`).

Emit one `step.skipped` event per skipped step with `{step_name, reason: "artifact_present", artifact_path}`. Skips advance the resume index identically to a real `step.end status:ok`, so log-tail resume math is unchanged.

Provide an opt-out: `--no-skip-completed` (CLI flag) or `engine.skip_completed_on_retry: false` in `workflows.yml`. Default ON.

## Acceptance

- New engine behavior: on retry (`attempt > 0`) for same `issue_id`, pre-build steps with valid existing artifacts are skipped.
- `step.skipped {reason: "artifact_present", step_name, artifact_path}` emitted for each skipped step.
- Unit tests: (1) fresh cycle (attempt=0) does not skip; (2) retry with all three pre-build artifacts present skips all three; (3) retry with only SPEC.md present skips spec, runs research+plan; (4) `--no-skip-completed` disables skipping; (5) empty artifact file (zero bytes) does not trigger skip.
- Integration test: full feature workflow on a retry pop completes without re-running spec/research/plan when artifacts exist on the cycle branch.
- Coverage holds (line ≥95%, branch ≥75%, function ≥90%); typecheck clean.
- CLAUDE.md + RFC-001 (or ARCHITECTURE.md) updated to document the skip rule and opt-out.

## Out of scope

- The companion stderr-on-bash-failure root cause (filed separately as `refl-0028-stderr-dropped-on-failed-bash-step.md`). That issue reduces the blast radius of silent commit failures; this issue reduces the cost of recovering from them.
- Per-step partial-restart logic for build/fix/verify (`step-restart-tolerance-audit-*`).
- Cross-cycle artifact reuse (e.g. inheriting SPEC across different `issue_id`s) — explicitly out of scope; skip key is `(issue_id, cycle artifact dir)` only.

## References

- Origin cycle: 0028 (priority_hint 7)
- Related cluster: `step-restart-tolerance-audit-overwrite-and-idempotent-steps`, `step-restart-tolerance-audit-build-step-policy`, `step-restart-tolerance-audit-fix-step-policy`
- Companion: `refl-0028-stderr-dropped-on-failed-bash-step` (still in raw/)
