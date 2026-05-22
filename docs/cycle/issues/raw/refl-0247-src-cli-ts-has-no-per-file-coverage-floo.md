---
id: refl-0247-src-cli-ts-has-no-per-file-coverage-floo
source: reflection
title: src/cli.ts has no per-file coverage floor in coverage-gate.mjs
added_at: "2026-05-21T23:59:29.171Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0247"
---

The PLAN.md explicitly notes: "src/cli.ts has no per-file floor in scripts/coverage-gate.mjs; no coverage regression possible from this change." This means future changes to `src/cli.ts` — which contains `spawnRunOne`, the `run` command entry point, and all CLI wiring — can silently degrade test coverage without the gate catching it.

All other critical modules (`triage.ts`, `child-env.ts`, `engine-lock.ts`, `run-cycle.ts`, etc.) have floors enforced in the `FLOORS` table. The `src/cli.ts` omission is an inconsistency, not a deliberate exception.

Add a floor entry for `src/cli.ts` in `scripts/coverage-gate.mjs`. The current coverage for that file should be checked first to set a realistic floor (likely 70–80% given the CLI surface area).
