# Must-Fix Items: Cycle 0023

## Summary
1 critical issue. Tests + coverage pass, but `processRawWithRetry` reuses
`runTriage`'s "attempt = raw.attempts" semantics for `dryRunTriage`,
silently breaking the documented dry-run use case for any raw with
`triage_attempts > 0` (i.e., the exact post-`engine.paused` recovery
flow this feature is built for).

## Tasks

- [x] ### Task 1: `dryRunTriage` must count attempts from 0, not from `raw.attempts`
  **Status:** ✅ Fixed
  **What was done:** Applied Option 2 — `dryRunTriage` now passes `{ ...raw, attempts: 0 }` into `processRawWithRetry`, decoupling the dry-run retry budget from on-disk `triage_attempts`. `runTriage` is unchanged (still uses persistent semantics). Added two regression tests in `tests/engine/triage-dry-run.test.ts`: (a) raw with `triage_attempts: 3` gets full 3-attempt budget on dry-run and reports `attempts: 3, status: "failed", last_error` populated; (b) raw with `triage_attempts: 2` succeeds on the third dry-run attempt with `attempts: 3, status: "ok"`. All 286 tests pass; triage.ts coverage 94.92 / 94.44 / 97.50 (line +0.04 vs baseline, branch/func unchanged).
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`, `tests/engine/triage-dry-run.test.ts`

  **Problem:**
  PLAN.md §Task 2 Notes states: "`attempts` reports actual agent
  invocations in this dry-run pass (starts from 0 each run). The
  on-disk `triage_attempts` field is not consulted for the dry-run
  report."

  Implementation does the opposite. `processRawWithRetry`
  (`src/engine/triage.ts:81`) uses
  `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++)`,
  so the on-disk `triage_attempts` shrinks the dry-run retry budget.

  Concrete failure mode (the canonical SPEC use case):
  - A raw fails triage in a real run → `bumpAttempts` writes
    `triage_attempts: 3` → `moveToFailed` puts it in `failed/`.
  - `engine.paused {reason: "all_triage_failed"}` fires (SPEC's
    triggering scenario).
  - Operator edits the prompt, moves the raw back to `raw/`, runs
    `cycle triage --dry-run` to iterate.
  - The raw still carries `triage_attempts: 3` in its frontmatter.
  - `processRawWithRetry` starts the loop at `attempt=3, attempt<3` —
    runs **zero** iterations. The agent is never invoked.
  - Report row: `{raw_id, status: "failed", attempts: 0, last_error: ""}`.
    No information for the operator; the dry-run is silently useless.

  Even less degenerate: a raw with `triage_attempts: 2` gets exactly
  1 dry-run attempt instead of 3, so a single bad agent run looks like
  full retry exhaustion.

  This is not covered by any existing test — all dry-run fixtures use
  fresh raws with `triage_attempts: 0`, where the bug is invisible
  because `raw.attempts == 0` happens to coincide with "count from 0".

  **Fix:**
  Decouple the retry budget from `raw.attempts` for `dryRunTriage`.
  Two clean shapes; pick whichever feels less invasive:

  1. Add an optional `attemptStart?: number` field to `ProcessCtx`
     (default `raw.attempts`). In `dryRunTriage`, pass `attemptStart: 0`
     when constructing the ctx. `runTriage` omits it and keeps the
     persistent semantics it has today.

     ```ts
     // in processRawWithRetry
     const start = ctx.attemptStart ?? raw.attempts;
     for (let attempt = start; attempt < MAX_ATTEMPTS; attempt++) { ... }
     ```

  2. Or: have `dryRunTriage` shallow-clone each raw with `attempts: 0`
     before calling the helper. One-liner, no new ctx field:

     ```ts
     const outcome = await processRawWithRetry(
       { ...raw, attempts: 0 },
       { repoRoot, cfg, promptTemplate, runAgent },
     );
     ```

  Either is acceptable. Option 2 is the smaller diff; option 1 is
  more explicit about intent. No other code in `runTriage` should
  change.

  **Verify:**
  1. Add a regression test in `tests/engine/triage-dry-run.test.ts`:

     ```ts
     test("dryRun ignores on-disk triage_attempts and runs full retry budget", async () => {
       const root = await setupRepo();
       try {
         await writeFile(
           join(root, "docs/cycle/issues/raw/exhausted.md"),
           rawBody("exhausted", "already-tried", 3), // attempts=3
           "utf8",
         );
         let calls = 0;
         const deps: TriageDeps = {
           runAgent: async (): Promise<TriageAgentResult> => {
             calls++;
             return { exitCode: 0, stdout: "still not json", stderr: "" };
           },
         };
         const reports = await dryRunTriage(root, makeConfig(), deps);
         assert.equal(calls, 3, "agent should be invoked 3 times");
         assert.equal(reports[0].status, "failed");
         assert.equal(reports[0].attempts, 3);
         assert.ok(reports[0].last_error, "last_error must be populated");
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });
     ```

  2. Add a second case where `triage_attempts: 2` and the agent
     succeeds on the **third** dry-run attempt — assert
     `attempts === 3, status === "ok"`.

  3. Run `npm test`. Both new tests must pass.

  4. Run `npm run test:coverage`. `src/engine/triage.ts` line/branch
     coverage must not regress (currently 94.88 / 94.44 / 97.50).

  5. Quick manual sanity: write a raw with `triage_attempts: 3` to
     `docs/cycle/issues/raw/`, run `node dist/cycle.js triage --dry-run`
     with a fake claude on PATH, confirm the agent is invoked
     (`attempts: 3` in the JSON report, `last_error` populated).
