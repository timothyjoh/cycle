---
id: refl-0087-retry-skip-policy-reuses-below-threshold
title: "Fix retry-skip gate: re-validate spec artifact against SPEC_MIN_BYTES before skipping"
workflow: feature
depends_on: []
triaged_at: "2026-05-16T03:13:55.563Z"
source: triage
failed_at: "2026-05-16T04:38:49.167Z"
failed_step: verify
failed_attempts: 3
last_cycle_id: "0090"
---
## Problem

The retry-skip gate in `src/engine/run-cycle.ts` skips the `spec` step when `SPEC.md` exists with `> 0` bytes (`artifact_present`). When a spec step fails the post-condition guard (`SPEC_MIN_BYTES = 200`), the below-threshold artifact persists on disk. On the next attempt (attempt 2+), the skip gate fires — emitting `step.skipped {reason: artifact_present}` — and all downstream steps (research, plan, build, fix) operate on a `SPEC.md` that contains only an error note rather than real acceptance criteria.

This is exactly what happened in cycle 0087: attempt 1 produced a 164-byte `SPEC.md` (permissions-error note only), which failed the spec guard. Attempt 2 skipped spec via the artifact-present gate and all subsequent steps treated the error note as a valid spec.

## Root Cause

The `SKIP_ELIGIBLE_STEPS` gate uses `byteLength > 0` to determine artifact presence. It does not re-apply the spec-guard post-condition (`SPEC_MIN_BYTES`) that originally rejected the artifact on the prior attempt.

Affected location: the retry-skip block in `runCycle` in `src/engine/run-cycle.ts`, inside the per-step loop where `step.skipped` is emitted for `spec`.

## Acceptance Criteria

1. When the retry-skip gate would skip the `spec` step, it reads the existing `SPEC.md` and measures `Buffer.byteLength(content, "utf8")`.
2. If the measured size is `< SPEC_MIN_BYTES`, the gate does **not** skip the step — it proceeds as if the artifact is absent and the spec step re-runs.
3. A regression test in `tests/engine/` verifies that a below-threshold `SPEC.md` on a retry pop does **not** produce `step.skipped` for spec — instead the spec step re-runs and the post-condition guard fires again.
4. `npm test` passes with no coverage regressions.

## Implementation Notes

- Fix is localized to the `spec` branch of the skip-eligible check. `research` and `plan` have no post-condition byte floor; their `> 0` semantics remain correct and must not change.
- `SPEC_MIN_BYTES` and `formatSpecGuardError` are already exported from `src/engine/run-cycle.ts` — reuse them, do not duplicate the constant.
- No queue schema change needed: the fix is purely in the skip-gate read path. The artifact file can simply be ignored (not deleted) when below threshold; the spec step overwrites it on re-run.
- The artifact path follows the same pattern already used by the existing skip gate: `path.join(artifactDir, 'SPEC.md')`.
- The `fs.readFile` call for re-validation should be wrapped to treat ENOENT as "absent" (fall through to re-run) without throwing.
