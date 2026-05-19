# Must-Fix Items: Cycle 0116

## Summary
2 critical issues, 1 minor issue found in review.

## Tasks

- [ ] ### Task 1: Resume `runCycle` call missing `baseBranch`
  **Priority:** Critical
  **Files:** `src/cli.ts`
  **Problem:** `runResumeOnce` reads `fmBaseBranch` at lines 163–169 and uses it to
    resolve `base` for the pre-resume checkout/pull (line 170), but the `runCycle`
    call at lines 243–251 omits `baseBranch`. A todo file with `base_branch: release-x`
    causes the base refresh to operate on `release-x` (correct) but the resumed cycle
    runs with `CYCLE_BASE=master` (wrong). Prompt templates and step scripts that
    reference `${CYCLE_BASE}` see the config branch, not the per-todo override.
  **Fix:** Add `baseBranch: fmBaseBranch` to the `runCycle` call in `runResumeOnce`:
    ```ts
    const rr = await runCycle(cwd, {
      cycleId: tail.cycleId,
      issueId: tail.issueId,
      title: tail.title,
      workflow: workflowName,
      resume: { startStepIndex },
      attempt: row!.attempt,
      skipCompletedOnRetry,
      baseBranch: fmBaseBranch,   // ← add this
    });
    ```
  **Verify:** Add a test (or extend Test B in `run-cycle.base-branch.test.ts`) that
    writes a todo file with `base_branch: release-x` frontmatter, calls
    `runResumeOnce` (or simulates a resume via `runCycle` with `resume:`) and asserts
    `cycle.checkout.base === "release-x"`. Also run `npm test` — all 435 tests must
    pass.

- [ ] ### Task 2: `commitCycle` calls ignore frontmatter override for push target
  **Priority:** Minor
  **Files:** `src/cli.ts`
  **Problem:** Both `commitCycle` call sites pass `baseBranch: cfg.engine.base_branch`
    (or `cfg!.engine.base_branch`). When a todo frontmatter specifies
    `base_branch: release-x` and `push: true` is configured, the push runs
    `git push origin master` instead of `git push origin release-x`.
    - Resume path: `src/cli.ts:260`
    - Main drain loop: `src/cli.ts:372`
  **Fix:**
    1. Resume path — `fmBaseBranch` is already in scope (lines 163–169). Change
       line 260:
       ```ts
       baseBranch: fmBaseBranch ?? cfg.engine.base_branch,
       ```
    2. Main drain loop — `fmBaseBranch` is already in scope (lines 335–344). Change
       line 372:
       ```ts
       baseBranch: fmBaseBranch ?? cfg!.engine.base_branch,
       ```
  **Verify:** Run `npm test` — all tests must pass. Optionally add a test that mocks
    or observes the `git push origin <branch>` arg when `fmBaseBranch` is set.

- [ ] ### Task 3: Add integration test for `cli.ts` frontmatter `base_branch` path
  **Priority:** Minor (required by AC: "frontmatter override path is exercised by at
    least one test" — current Test B bypasses `cli.ts`)
  **Files:** `tests/engine/run-cycle.base-branch.test.ts`
  **Problem:** Test B calls `runCycle` directly with `baseBranch: "release-x"`. It
    does not write a todo file with `base_branch: release-x` in frontmatter and does
    not call through `cli.ts`. The `fm.base_branch` extraction code at
    `src/cli.ts:163-169` and `src/cli.ts:335-344` has no test coverage from this
    cycle's test suite. Additionally, Test B's `cycle.base_pull` assertion passes on
    a `status: "failed"` event (no remote configured for `release-x`).
  **Fix:** Add a test that: (a) creates a todo `.md` file with `base_branch: release-x`
    in YAML frontmatter, (b) calls through the cli-level queue drain (or at minimum
    reads the frontmatter and passes it to `runCycle` as the cli code does), and
    (c) asserts `cycle.checkout.base === "release-x"`. Also fix Test B's assertion
    to check `basePull["status"]` is not `"failed"` — or set up a bare remote for
    `release-x` so the pull can actually succeed.
  **Verify:** `npm run test:coverage && npm run check:coverage` passes. All floors
    held. New test fails if the `fm.base_branch` extraction code is removed.
