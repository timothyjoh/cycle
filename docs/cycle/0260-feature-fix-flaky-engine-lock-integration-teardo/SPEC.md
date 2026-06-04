# SPEC — Cycle 0260: Harden lock-integration test teardown against descendant-process rm race

## WHY
`tests/cli/engine-lock-integration.test.ts` intermittently fails CI in its temp-directory teardown rather than in any assertion. It flaked the v0.2.0 publish run (1107/1108 passed; the single failure was this test). The signal tests (`SIGINT → …`, `SIGTERM → …`) spawn the supervisor (`node dist run`), which spawns a `run-one` child, which runs a slow bash step (`sleep 30`). After the test signals the supervisor and observes it exit, it runs `rm(root, { recursive: true, force: true })` in `finally`. But the supervisor's descendant processes (the `run-one` child and its `sleep` grandchild) are not guaranteed dead the instant the supervisor exits. A still-exiting descendant that writes into `root` (a log line, an artifact, a re-created file) races the `rm`: `rm` empties a directory, the live process drops a file back into it, and the final `rmdir` fails with `ENOTEMPTY`. `force: true` suppresses `ENOENT`, not this race. The result is a green test suite that flakes nondeterministically — eroding trust in CI and blocking clean release runs.

## CONCRETE USER BENEFIT
A developer (or release engineer) can run `tests/cli/engine-lock-integration.test.ts` repeatedly — including under the load of a full publish run — and it passes every time. The intermittent `ENOTEMPTY: directory not empty, rmdir` teardown failure no longer appears, so a green local run reliably predicts a green CI run and a publish is not aborted by a phantom teardown flake.

## USABLE END-STATE
Running the file in a loop (e.g. 20 consecutive runs) produces zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures, while the existing assertions (lock cleaned up after SIGINT; lock absent and exactly one `cycle.killed` logged after SIGTERM) remain unchanged and continue to pass. The full suite stays green.

## Objective
This cycle makes the temp-directory teardown in `tests/cli/engine-lock-integration.test.ts` robust to the known descendant-process write-after-exit race by giving every `rm(root, …)` cleanup the retry behavior Node's `fs.rm` already provides for `ENOTEMPTY`/`EBUSY`/`EPERM` (`maxRetries` + `retryDelay`). The race is in the test harness's teardown ordering, not in the production signal-handling path (the assertions already prove the supervisor exits and the lock is removed); this cycle hardens the test and explicitly confirms no production signal-propagation bug is the cause.

## Source Issue
`fix-flaky-lock-integration-teardown-enotempty` — "Fix flaky engine-lock-integration teardown (ENOTEMPTY race on rm)"

## Scope

### In Scope
- Add `maxRetries` + `retryDelay` to every `rm(root, { recursive: true, force: true })` teardown call in `tests/cli/engine-lock-integration.test.ts` (the five cleanup sites and the `fakeBinDir` cleanup), making the recursive removal retry the transient `ENOTEMPTY`/`EBUSY`/`EPERM` errors.
- Confirm (and record in the build notes) that the supervisor's signal handling is NOT leaving orphaned descendants — i.e. that this is a teardown-ordering race in the test, not a production signal-propagation bug (option 3 in the issue). If, and only if, investigation shows orphaned `run-one`/`sleep` processes survive the supervisor, this slice still ships the test hardening; the production-side fix is deferred to a sibling cycle.

### Out of Scope
- Any change to production signal-handling / process-group teardown in `src/cli.ts` or the engine (deferred to a sibling cycle, and only if option-3 investigation proves it is the cause).
- Refactoring the test's spawn/wait helpers, the slow-workflow fixture, or the shared `bootstrapRepo` setup beyond the teardown change.
- Hardening teardown in other test files (e.g. `tests/cli/run-one.test.ts`) — the issue points at the one observed-flaky file; expanding the same pattern elsewhere is a follow-up if it ever flakes.

## Requirements
- Each `rm(root, { recursive: true, force: true })` (and the `fakeBinDir` cleanup) in `tests/cli/engine-lock-integration.test.ts` MUST be called with `maxRetries: 10, retryDelay: 50` (or equivalently bounded values) alongside the existing `recursive`/`force` options.
- The existing assertions in all tests in the file MUST remain byte-for-byte unchanged in intent — lock-absence checks, exit-code `143` check, and the exactly-one `cycle.killed` cardinality check still run and still pass.
- The change MUST NOT introduce a new flake or slow the suite materially (the retry budget is bounded; on the common no-race path `rm` succeeds on the first attempt and adds no measurable delay).
- **Failure behavior**: On the descendant-write race, `rm` now retries up to the bounded `maxRetries` with `retryDelay` between attempts and removes the directory once the descendant has finished — surfacing success instead of throwing `ENOTEMPTY`. If the directory is genuinely un-removable after all retries are exhausted (a real, non-transient failure), `rm` still throws and the test still fails loudly — the race fix never silently swallows a true teardown error. A teardown error is never caught-and-ignored.

## Acceptance Criteria
- [ ] Running `tests/cli/engine-lock-integration.test.ts` 20 times in a loop produces zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures (the user-observable benefit: the SIGINT/SIGTERM tests pass reliably under repeated runs).
- [ ] Every `rm(root, …)` and the `fakeBinDir` cleanup in the file is invoked with bounded `maxRetries` + `retryDelay` (verifiable by reading the file).
- [ ] The SIGINT test still asserts the lock is absent after the supervisor exits; the SIGTERM test still asserts exit code `143`, lock absence, and exactly one `cycle.killed` event — all unchanged and passing.
- [ ] Failure-path: when the recursive removal cannot complete (a non-transient error persists past the retry budget), the teardown still throws and the test fails rather than passing silently — confirmed by reasoning recorded in the build notes (the retry only suppresses the transient codes Node's `fs.rm` retries; a hard failure still propagates).
- [ ] The build notes state whether option-3 (orphaned descendant / signal-propagation) was found to apply; if it does, the production fix is explicitly deferred to a named sibling cycle and this cycle ships only the test hardening.
- [ ] All existing tests still pass (`npm test` green).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Test framework: the repo's existing `node:test` runner (`npm test`), Node ≥ 22.6 with `--experimental-strip-types`.
- Key scenarios:
  - **Happy path / regression**: full suite (`npm test`) stays green; the file's existing SIGINT/SIGTERM/idle assertions pass.
  - **Race reproduction / fix**: run the file in a loop (e.g. `for i in $(seq 1 20); do …; done`) and confirm no teardown failure. Record the loop result in the build notes.
  - **Failure path**: reason about (and note) that the retry options only suppress the transient `ENOTEMPTY`/`EBUSY`/`EPERM` codes; a genuinely stuck directory still throws — no new try/catch swallows teardown errors.
- No new test cases are required; this hardens teardown of existing tests. No UI changes, so no E2E.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention change required. The teardown-retry pattern is a localized test fix, not a project-wide rule; do not add a floor or invariant for it unless follow-up shows the pattern needs enforcing.
- **README.md**: No user-facing change.

This is a test-hardening change with no production-code or public-interface surface; the documentation impact is limited to the in-cycle `BUILD.md` notes (loop-run result and the option-3 finding). Updating those notes is part of "done".

## Dependencies
- Node's `fs.promises.rm` `maxRetries`/`retryDelay` options (available on the repo's Node ≥ 22.6 floor) — already a dependency, no new package.
- The existing test fixtures in the file (`slowWorkflowYml`, `bootstrapRepo`, `waitForLock`, `waitForAbsence`, `waitForLogEvent`) — unchanged.
- No external services or env vars required.
