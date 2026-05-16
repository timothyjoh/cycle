---
id: refl-0087-retry-skip-policy-reuses-below-threshold
source: reflection
title: retry-skip policy reuses below-threshold SPEC artifact without re-validation
added_at: "2026-05-16T03:02:38.462Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0087"
---

Cycle 0087 attempt 1 failed the spec step: SPEC.md was 164 bytes (below `SPEC_MIN_BYTES = 200`). The artifact contains only a permissions-error note. On attempt 2, `step.skipped {reason: artifact_present}` fired because the file exists with >0 bytes — and research, plan, build, and fix all operated on a SPEC.md that describes a permissions approval request rather than actual acceptance criteria.

The retry-skip gate at `src/engine/run-cycle.ts` checks `> 0` bytes, which is intentionally loose for valid artifacts but creates a blind spot when the artifact is a known-bad error message. A spec that failed the post-condition guard should not be eligible for the skip path on retry.

Suggested fix: after `step.skipped` fires for spec, re-validate the existing artifact against `SPEC_MIN_BYTES`. If it fails, clear the artifact and re-run the spec step. Alternatively, track `spec_guard_failed` in the cycle's `tbd.jsonl` row so retry explicitly re-runs spec regardless of artifact presence.
