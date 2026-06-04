reason: duplicate

This cycle's SPEC was already delivered in full by cycle 0026
("Add before/after walkthrough capture to the quickfix bug-fix workflow",
commit 331a675). Every In-Scope item, Requirement, and Acceptance
Criterion is already shipped and tested on master. No code change is
warranted.

## Evidence
- src/defaults/workflows.yml:58 — `walkthrough_before` declared between `plan_fix` and `quick_fix` (`agent: bash`, no `command`).
- src/defaults/workflows.yml:62 — `walkthrough_after` declared as the final quickfix step after `verify`.
- src/engine/run-cycle.ts:49 — `WALKTHROUGH_PHASES` maps `walkthrough_before → "before"`, `walkthrough_after → "after"`.
- src/engine/run-cycle.ts:494 — phase-aware intercept (`WALKTHROUGH_PHASES.has(step.name)`) handles the steps before they reach `execBashStep`/completion-proof.
- src/engine/run-cycle.ts:521 — `CYCLE_WALKTHROUGH_PHASE` passed to the hook via the `extra`/`buildChildEnv` re-inject contract alongside `CYCLE_ARTIFACT_DIR`.
- tests/defaults/quickfix-yaml.test.ts:12 — asserts the exact quickfix step sequence including both walkthrough steps (and an identical `.cycle/workflows.yml` deployed-copy test at line 28, proving sync-defaults parity).
- tests/engine/run-cycle.walkthrough.test.ts:377 — quickfix before/after happy-path test (phase env, phase-scoped media dir, per-phase manifests).
- tests/engine/run-cycle.walkthrough.test.ts:442 — `walkthrough_before` failure is fatal and `quick_fix` does not run.
- tests/engine/run-cycle.walkthrough.test.ts:427 — no-hook clean-skip for both quickfix walkthrough steps.
- docs/ENGINE.md:277 — "Phase-aware quickfix capture (before/after)" already documents the shipped behavior.
