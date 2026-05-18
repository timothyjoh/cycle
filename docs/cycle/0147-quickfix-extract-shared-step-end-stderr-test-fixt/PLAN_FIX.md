Need write permission. Can you approve the write to `docs/cycle/0147-quickfix-extract-shared-step-end-stderr-test-fixt/PLAN.md`?

Here's what the plan will contain:

**Fix:**
1. Create `tests/engine/_helpers/step-end-fixtures.ts` — export `git`, `workflowYml`, `findStepEnd`, and `setupRepo(stepsBody, scripts = [])` (scripts optional, default `[]`)
2. `run-cycle.step-end-stderr.test.ts:9-61` — delete inline definitions, import from helpers
3. `run-cycle.step-end-stderr-dispatch.test.ts:15-62` — same

**Key insight:** `workflowYml` and `findStepEnd` are byte-identical. `setupRepo` differs only in tmp prefix and scripts loop — merged with optional `scripts` param. `git` is also duplicated identically and gets exported too.

**Test:** No new tests needed — existing suites in both files pass as regression proof. Plus verify with `grep` that no inline function definitions remain.
