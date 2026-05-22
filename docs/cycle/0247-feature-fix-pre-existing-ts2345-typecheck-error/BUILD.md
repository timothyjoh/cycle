713 tests pass, 0 fail. All coverage gates pass. All structural invariants pass. Typecheck exits zero.

## Summary

Modified `src/cli.ts` line 236: added `: Record<string, string>` type annotation to the `extra` ternary declaration inside `spawnRunOne`. This is a one-character-group change that widens the inferred union type `{ CYCLE_TRUNK_BASED: string } | { CYCLE_TRUNK_BASED?: undefined }` to the explicit concrete type `Record<string, string>`, satisfying the `buildChildEnv(extra: Record<string, string>)` parameter constraint in both branches without altering runtime behavior or emitted JavaScript.

**Task 1 complete** (the only task in PLAN.md).

`npm run typecheck` before fix: exit 1, TS2345 error at src/cli.ts:241. After fix: exit 0, no errors.

`npm run test:coverage` result: **713/713 tests pass, 0 failures**. Coverage: line 98.75%, branch 92.54%, function 93.36% — identical to baseline, no regression. All per-file coverage floors pass. All structural invariants pass.

No deviations from PLAN.md. No new tests added (SPEC explicitly waives this). No documentation changes required (CLAUDE.md typecheck gate requirement already documented). No deferred work.

## Touched Files
- src/cli.ts
