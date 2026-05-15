---
id: refl-0070-resume-entry-skip-gate-test-still-tautol
title: Replace or delete tautological `skip gate self-suppresses on resume entry` test
workflow: feature
depends_on: []
triaged_at: "2026-05-15T20:55:20.019Z"
source: triage
---
## Context

Cycle 0070's REVIEW.md Adversarial finding 3 flagged a test in `tests/engine/run-cycle.skip-completed.test.ts` (or wherever the skip-gate suite lives) named approximately `"skip gate self-suppresses on resume entry"`. The test sets `cycleId:"0001"`, `attempt:1`, `resume:{startStepIndex:0}`, and pre-seeds `<artifactDir>/SPEC.md` / `RESEARCH.md` / `PLAN.md`. It then asserts no `step.skipped` events fire for those steps.

The scenario it encodes is impossible in production: a real resume entry at `startStepIndex:0` with `attempt:1` would mean a same-cycleId crash before any step ran, which by construction means there is nothing to skip. The test passes vacuously and was NOT touched by cycle 0070's FIX.md (FIX.md addressed only the three MUST-FIX items: drainFailedRetry cycle_id preservation, README claim backing, and CLAUDE.md/ARCHITECTURE.md prose). The test now sits as a coverage placeholder asserting the predicate's mechanics in a scenario that does not exist in production.

## Risk

- **False confidence**: gives readers the impression that the resume + skip interaction is covered when it isn't.
- **Brittle under change**: when resume semantics shift (e.g., `startStepIndex` math, `parseLogTail` treatment of `step.skipped`), this test will either keep passing vacuously or fail in a way that is hard to interpret because the scenario it asserts isn't realistic.
- The predicate (`!isResumeEntry`) is already exercised by the `attempt=1-with-artifacts` happy-path test, so deletion does not lose coverage.

## Acceptance criteria

Pick ONE of the two paths below and execute it. Document the choice in SPEC.md.

### Path A — Delete the test outright

1. Remove the `"skip gate self-suppresses on resume entry"` test from its current file (likely `tests/engine/run-cycle.skip-completed.test.ts`).
2. Verify the `!isResumeEntry` branch in `src/engine/run-cycle.ts` is still covered by the existing `attempt=1-with-artifacts` test (the one that fires three `step.skipped` events on a fresh retry pop). If coverage drops below baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%, plus the `src/engine/triage.ts ≥ 95%` per-file floor), reject Path A and switch to Path B.
3. `npm test` and `npm run test:coverage` both pass; per-file gate intact.

### Path B — Replace with a realistic resume scenario

1. Construct a test that simulates a real resume entry:
   - Pre-write a `.cycle/log.jsonl` containing a prior `cycle.start` with the same `cycle_id`, plus `step.end status:"ok"` events for `spec`, `research`, `plan` (the pre-build steps), and crucially NO matching `cycle.end` (so resume kicks in).
   - Compute `startStepIndex` via `parseLogTail` so it lands past the completed pre-build steps (it should point at `build` or later).
   - Pre-seed the artifact directory with `SPEC.md` / `RESEARCH.md` / `PLAN.md` so the skip predicate would otherwise want to fire.
   - Invoke `runCycle({ resume: { startStepIndex } })` and assert that NO `step.skipped {reason:"artifact_present"}` events fire for `spec`/`research`/`plan` — because `startStepIndex` already covers them and the resume-entry self-suppression must defer to resume math.
2. Name the test something realistic, e.g. `"resume past completed pre-build steps: skip gate self-suppresses (startStepIndex covers them)"`.
3. Coverage and gates intact.

## Notes for SPEC step

- The skip gate is documented in `CLAUDE.md` near the "Retry skip policy (pre-build only)" entry, including the line: "The gate self-suppresses on resume entry (governed by `startStepIndex`)..." — that prose should remain accurate after this change.
- `parseLogTail` treats `step.skipped` as terminal-equivalent to `step.end status:"ok"` for resume-index math (per `CLAUDE.md`). Path B's test must not accidentally re-assert that — it should pin the orthogonal claim that on resume, the skip predicate itself does NOT fire because resume math already covers the completed steps.
- This is a `no_branch:true` dogfood repo; the cycle ships via `commit-trunk.sh`, not via a PR.

## Out of scope

- Re-examining the skip gate semantics themselves (they were correctness-verified in cycle 0070's MUST-FIX work).
- Refactoring the broader skip-completed test suite — touch only the one tautological test.
