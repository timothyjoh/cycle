Need write permission to `src/engine/run-cycle.ts` and `tests/engine/run-cycle.test.ts`. Please approve edits to those two files so I can apply the fix.

Once approved, I'll:
1. Delete the 2-line dead wrapper from `run-cycle.ts`
2. Drop `findPriorBuildHeadSha` from the import in `run-cycle.test.ts`
3. Rewrite the 4 `findPriorBuildHeadSha` tests to call `findPriorStepHeadSha(root, "0042", "build")` directly
