710/710 pass. All PLAN.md tasks complete.

Modified `tests/engine/triage-priority.test.ts` only — inserted four `assert.rejects`/ENOENT assertions targeting `docs/cycle/issues/raw/<id>.md`, one per discuss-path test ("discuss raw: agent never called", "roundtrip" before re-write, "discuss + all normal fail", "mixed batch"). `npm test` passed 710/710. Coverage run: lines 98.69%, branches 92.44%, functions 93.36%; all per-file floors met including `src/engine/triage.ts` at 99.49% ≥ 95%. Regression check confirmed: temporarily replacing `rename` with `copyFile` caused all four assertions to fire (`fail 4`); restoring `rename` returned to all-green. No deviations from PLAN.md; no follow-up items.

## Touched Files
- tests/engine/triage-priority.test.ts
