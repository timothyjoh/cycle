---
id: step-restart-tolerance-audit-overwrite-and-idempotent-steps
title: Audit overwrite + already-idempotent workflow steps for restart-tolerance
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:17:01.544Z"
source: triage
parent: step-restart-tolerance-audit
failed_at: "2026-05-13T22:23:54.192Z"
failed_step: spec
failed_attempts: 3
---
## Why

BB-5 (resume from `log.jsonl` tail, landed in cycle 0016) re-runs the first workflow step whose `step.end status:ok` event is missing after the in-flight `cycle.start`. For that to be safe, every workflow step must be restart-tolerant. Several steps in the `feature` workflow are already restart-tolerant by construction — but none of them have a halt-and-resume test that proves it. This audit closes that gap for the easy steps.

## Scope

Covers the following `feature` workflow steps:

| Step | Why it's already restart-tolerant | What to prove |
|---|---|---|
| `spec` | Prompt overwrites `SPEC.md` | Re-run overwrites cleanly, no stale content |
| `research` | Prompt overwrites `RESEARCH.md` | Same |
| `plan` | Prompt overwrites `PLAN.md` | Same |
| `review` | Prompt overwrites `REVIEW.md` + `MUST-FIX.md` | Same |
| `verify` | Re-runs `npm test`; pure | Re-run produces same pass/fail |
| `commit` | `git diff --cached --quiet` short-circuits no-op | Re-run after a successful commit is a no-op |
| `pr` | BB-5 made `pr.sh` detect existing PR via `gh pr list --head` and reuse it | Re-run after PR creation reuses number/URL |
| `reflection` | `ingestReflection` unlinks prior `refl-<cycleId>-*.md` files in `raw/` before re-writing (per CLAUDE.md) | Re-run produces same set of raws, not duplicates |

## Acceptance

- For each step above, add a test under `tests/` that:
  1. Runs the engine up to and including that step (using existing test fixtures / mocked workflow).
  2. Halts (simulate by truncating the matching `step.end` from `log.jsonl`, or by killing the cycle mid-flight where the harness supports it).
  3. Resumes via `runCycle({ resume: { startStepIndex } })`.
  4. Asserts the on-disk artifact / git state / `raw/` contents are byte-identical (or equivalent for non-deterministic content) to a fresh run.
- Tests live alongside existing engine tests, follow the same `node:test` + spawn-stub style.
- `npm test` and `npm run typecheck` pass.
- Coverage does not regress vs. master baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%).
- `BUILD.md` reports the per-step test names + the coverage numbers.

## Out of scope

- `build` step (covered by `step-restart-tolerance-audit-build-step-policy`).
- `fix` step (covered by `step-restart-tolerance-audit-fix-step-policy`).
- Workflows other than `feature`.

## Notes

If any step in this list turns out to **not** be restart-tolerant, file a child raw rather than expanding scope here — the goal of this work item is to lock in what is already true.
