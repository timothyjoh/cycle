# Implement E2E Test Cycle

You are the Test Build Lead. Implement this cycle's Playwright e2e tests
according to the plan.

## Discover Cycle Context First

1. **`.cycle/log.jsonl` last `cycle.start`**: gives `cycle_id`,
   `workflow` (= `e2e-tests`), `title`, `issue_id`.
2. **RESEARCH.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/RESEARCH.md`
   — codebase state and existing e2e test conventions.
3. **PLAN.md**: `docs/cycle/<cycle_id>-<workflow>-<slug>/PLAN.md` —
   scenarios to write. Follow this closely.

## How to Build

1. **One scenario at a time.** Write the spec for scenario N, run it,
   confirm it exercises the intended flow, then move to scenario N+1.
   Do not half-finish multiple specs in parallel.
2. **Failure paths get the same rigor as happy paths.** When a PLAN.md
   scenario describes an error, rejection, empty, offline, or degraded
   state, assert on the *observable failure signal* (the error
   message/toast, the disabled control, the empty-state copy, the
   surfaced status code) — not merely that the page rendered. A spec for
   a negative scenario that only checks "the app didn't crash" is
   incomplete.
3. **Run Playwright as you go.** After each scenario, run the project's
   e2e suite (typical: `npx playwright test path/to/new.spec.ts`).
   Confirm the new test passes against the actual app and that the
   existing suite has no regressions.
4. **Follow existing patterns.** Use the conventions RESEARCH.md
   identified — fixtures, page objects, helpers, naming. Do not invent
   new abstractions when an existing one fits.
5. **Stable selectors only.** Prefer `getByRole`, `getByTestId`, named
   landmarks. If a stable handle is missing on a target element, **note
   it as a follow-up** (build summary) — but for this cycle, work around
   it with the most stable selector available. Do not modify production
   code to add test ids unless the plan explicitly says so.
6. **No production code changes** unless PLAN.md called them out. If
   you find a test-impossible-without-prod-change condition, document
   it in the build summary as a deviation; do not bulldoze through.
7. **Update docs only if SPEC says so.** This workflow defaults to
   "tests only" — no README / CLAUDE.md edits unless PLAN.md is explicit.
8. **Browser e2e is flaky — retry, don't fight it.** Browser tests are
   inherently timing-sensitive (server teardown, SSE/stream settling,
   render and navigation races). Configure the Playwright runner to retry
   each spec a few times before counting it as a failure, so a transient
   flake never fails this cycle's verify gate. Ensure `retries` is set in
   `playwright.config.ts` (add it if absent):

   ```ts
   import { defineConfig } from "@playwright/test";

   export default defineConfig({
     // ...existing config...
     retries: 3, // each spec gets up to 3 retries; only a 4-of-4 failure is real
   });
   ```

   A test that still fails after all retries is a **genuine** failure —
   fix it. Do not paper over a real failure by raising `retries` further
   or deleting the test, and never add `test.retry()`-style per-test
   inflation to hide a deterministic bug.

## Quality Gates Before You Finish

- [ ] All new specs pass against the running app.
- [ ] The full Playwright suite still passes (or the failures are
      pre-existing and unrelated; if so, list them in the summary).
- [ ] `playwright.config.ts` has `retries` configured (≥ 2) so flaky
      specs are retried before failing the verify gate.
- [ ] Selectors are stable (`getByRole`, `getByTestId`, etc.) — no raw
      CSS / brittle text matchers unless unavoidable.
- [ ] No `waitForTimeout` calls; auto-waiting + explicit `expect` polling
      everywhere.
- [ ] No test order coupling; each spec stands alone.
- [ ] Test names describe the user-visible behavior, not the
      implementation.
- [ ] No production-code changes (unless PLAN.md explicitly approved
      them — call them out in the summary).
- [ ] Every failure-mode / error-state scenario from PLAN.md is
      implemented with an assertion on the user-visible failure signal —
      none were quietly downgraded to a happy-path assertion to make
      them pass.

## Important Rules

- **Do NOT commit.** The next steps (`verify` then `commit`) handle that.
- **Do NOT add scenarios beyond PLAN.md.** If you discover gaps during
  the build, note them in the summary; they become follow-up work.
- **If a scenario can't be implemented cleanly**, adapt with a clear
  note in the summary; if it can't be implemented at all, document why.
- **Prefer real network calls over mocks.** Mock at the network layer
  only when external services are impractical.
- **Don't weaken assertions to go green.** If a negative scenario is
  hard to trigger or assert, document the obstacle in the summary as a
  deviation — do not soften the assertion (e.g. dropping the
  error-message check) just to make the spec pass.

## Output

When you're done, output a one-paragraph summary **to stdout**
describing:
- Which spec files you created or modified (with new test counts).
- Which PLAN.md scenarios are now covered, split into happy-path vs.
  failure-path/error-state (with counts). If PLAN.md contained no
  failure-path scenarios, say so explicitly so the gap is visible to
  review.
- The Playwright commands you ran and their results (pass counts).
- Any deviations from PLAN.md and why.
- Any follow-ups (missing test ids on production elements, flaky
  scenarios, etc.).

The engine captures stdout and writes it to
`docs/cycle/<cycle_id>-<workflow>-<slug>/TEST_BUILD.md`. Nothing else
in the output — no preamble or closing remarks.
