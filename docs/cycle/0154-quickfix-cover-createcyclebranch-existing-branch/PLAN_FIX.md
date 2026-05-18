Plan written to `docs/cycle/0154-quickfix-cover-createcyclebranch-existing-branch/PLAN.md`.

Fix scope: **test-only**. `src/engine/branch.ts:32` is the uncovered `git checkout <branch>` reuse path. Prod code is correct; it just lacks a test exercising the `branchExists → true` branch. One new test in `tests/engine/branch.test.ts` covers it completely.
