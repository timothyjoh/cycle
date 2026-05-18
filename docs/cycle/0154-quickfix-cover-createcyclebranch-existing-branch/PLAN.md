## Fix

- File: `tests/engine/branch.test.ts` (add test, no prod code changes)
- Change: Add a test that pre-creates `cycle/feature/<slug>`, calls `createCycleBranch` with the same opts, and asserts the existing branch was checked out (not recreated)

## Test

- File: `tests/engine/branch.test.ts`
- Test name: `"createCycleBranch reuses existing branch without error (retry-drain path)"`
- Steps:
  1. `mkdtemp` temp repo, `git init -b main`, empty commit
  2. `git checkout -b cycle/feature/retry-slug` — pre-create the branch at a known SHA (capture via `git rev-parse HEAD`)
  3. `git checkout main` — return to base
  4. Call `createCycleBranch(root, { cycleId: "0099", workflow: "feature", slug: "retry-slug" })`
  5. Assert: no error thrown
  6. Assert: `await currentBranchName(root)` === `"cycle/feature/retry-slug"`
  7. Assert: `await revParseHead(root)` === the SHA captured in step 2 (checkout, not fresh branch)
