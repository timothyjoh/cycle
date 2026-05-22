---
id: refl-0247-src-cli-ts-has-no-per-file-coverage-floo
title: Add per-file coverage floor for src/cli.ts in coverage-gate.mjs
workflow: feature
depends_on: []
triaged_at: "2026-05-22T00:01:46.274Z"
source: triage
priority: low
---
## Problem

`src/cli.ts` is absent from the `FLOORS` table in `scripts/coverage-gate.mjs`. This means coverage regressions in `src/cli.ts` are invisible to the gate. The file contains `spawnRunOne`, the `run` command entry point, and all CLI wiring — all peer modules (`triage.ts`, `child-env.ts`, `engine-lock.ts`, `run-cycle.ts`, etc.) have enforced floors. The omission is inconsistency, not a deliberate exception; cycle 0247's PLAN.md called it out explicitly.

## Steps

1. Run `npm run test:coverage` and inspect `.cycle/coverage.lcov` (or `npm run check:coverage` output) to measure the current line coverage percentage for `src/cli.ts`.
2. Add a `src/cli.ts` entry to the `FLOORS` table in `scripts/coverage-gate.mjs`. Set the floor to the measured current coverage rounded down to the nearest whole percent (minimum 70%).
3. Run `npm run check:coverage` — must pass with the new entry.
4. Run `npm test` — full suite must pass.
5. Add the new floor to the coverage policy table in `CLAUDE.md` (the per-file floors list).

## Acceptance criteria

- `scripts/coverage-gate.mjs` FLOORS table contains an entry for `src/cli.ts` at a realistic floor (≥ 70%).
- `npm run check:coverage` exits 0.
- `npm test` passes (713+ tests, no regressions).
- `CLAUDE.md` coverage policy section lists `src/cli.ts` with its floor.

## Notes

Expected current coverage is 70–80% given the mix of testable logic and process-entry boilerplate. Do not set the floor above the measured value — the gate must pass on the current codebase before it can protect future changes.
