# Must-Fix Items: Cycle 0029

## Summary
1 minor reliability issue (spawn-error regression for triage), 1 minor coverage gap (new `runAgentViaDispatch` happy-path body untested), 1 SPEC-bullet partial (acceptance bullet 6 message-in-payload deferred per BUILD.md). No critical issues.

## Tasks

- [ ] ### Task 1: Add `child.on("error")` handler to `claudecodeExec.runStep`
  **Priority:** Minor
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** The new `claudecodeExec.runStep` (lines 12–30) registers `child.on("close", …)` but no `child.on("error", …)`. When `claude` is missing from PATH (ENOENT) or the spawn otherwise fails, `ChildProcess` emits an unhandled `"error"` event, which `EventEmitter` throws synchronously — crashing the engine process. The prior triage default `runClaudecodeAgent` *did* register `child.on("error", reject)`, so the engine.paused `all_triage_failed` path absorbed missing-binary failures cleanly. Routing triage through `runAgentViaDispatch` → `claudecodeExec.runStep` removes that safety net. BUILD.md claims spawn-launch errors "resolve as `{exitCode: -1, status: "failed"}`" — that's only true when the process *starts* and exits without code (close fires with `null`). On a true spawn failure, behavior is "process crash," not "failed StepResult." This is a regression for triage and a latent bug for workflow steps.
  **Fix:** In `src/engine/exec-claudecode.ts`, inside `new Promise<StepResult>(...)`, add an `error` handler that resolves with a failed `StepResult` carrying the error message:
  ```ts
  child.on("error", (err) => {
    resolve({ status: "failed", exitCode: -1, stdout: "", stderr: (err as Error).message });
  });
  ```
  Place it next to `child.on("close", …)`. This matches the new contract documented in `runAgentViaDispatch`'s NOTE comment and restores the pre-refactor triage robustness.
  **Verify:** Add a unit test in `tests/engine/exec-claudecode.test.ts` that invokes `resolveAgent("claudecode").runStep(...)` with `env: { PATH: "/nonexistent" }` and asserts `r.status === "failed"` and `r.exitCode === -1` and `r.stderr` is non-empty. Then run `npm test` — new test must pass and process must not crash.

- [ ] ### Task 2: Add a happy-path test for `runAgentViaDispatch`
  **Priority:** Minor
  **Files:** `tests/engine/triage.test.ts` (or new `tests/engine/triage-dispatch.test.ts`)
  **Problem:** The new default `runAgentViaDispatch` body in `src/engine/triage.ts:702-719` (lines 710–718 per coverage report: tmp path build, `try { writeFile / mod.runStep / return } finally { unlink }`) has zero test coverage. Every existing triage test injects `TriageDeps.runAgent`, bypassing the new dispatch adapter. The unknown-agent test exercises only the synchronous `resolveAgent` throw at line 707 — never reaches the filesystem ops. So the new code paths (tmp-file write, `mod.runStep` invocation through dispatch, tmp-file cleanup on success and on throw) are unverified. BUILD.md acknowledges this gap.
  **Fix:** Add one happy-path test that runs `runTriage` without injecting `TriageDeps.runAgent`, with `cfg.triage.agent = "claudecode"`, using the PATH-stubbed fake `claude` binary pattern from `tests/engine/exec-claudecode.test.ts` (`#!/bin/bash\necho '{"children":[…valid triage json…]}' \n`). Place one raw under `docs/cycle/issues/raw/`. Assert that triage succeeds (returns `status: "ok"` with `processed: 1`, the raw moves to `done/<id>_raw.md`, and the rendered prompt was actually passed through — e.g. by asserting `tbd.jsonl` gets the expected row). This exercises mkdir/writeFile/runStep/unlink end-to-end through the real dispatch path.
  **Verify:** Run `npm run test:coverage`; `src/engine/triage.ts` line coverage for 710–718 should report covered (line % rises above current 97.08). Net `src/engine/triage.ts` numbers should hold above CLAUDE.md baseline (line ≥95, branch ≥75, func ≥90) without per-file regression.

- [ ] ### Task 3: Persist `UnknownAgentError.message` in `step.end` payload (SPEC bullet 6 follow-through)
  **Priority:** Minor
  **Files:** `src/engine/run-cycle.ts`, `tests/engine/run-cycle.test.ts`
  **Problem:** SPEC §Acceptance bullet 6 reads: "`run-cycle.ts` step dispatch with an unregistered agent emits `step.end status:failed` carrying the `UnknownAgentError` message in the event payload." The current `step.end` emission at `src/engine/run-cycle.ts:87` carries only `{cycle_id, step, status, exit_code}`. The synthesized `r.stderr = err.message` from line 75 is dropped on the floor — the artifact write at line 81 is gated on `r.status === "ok"` and skipped, and the `step.end` event has no `stderr_excerpt` field. The new test in `tests/engine/run-cycle.test.ts` asserts only on `status:failed,exit_code:-1`, not on the `UnknownAgentError` message. BUILD.md defers full satisfaction to the `refl-0028-stderr-dropped-on-failed-bash-step` raw, but the SPEC bullet was a 0029 acceptance criterion. Operator gets a failed step with no on-disk evidence of the failure reason — only the dispatch-table list-of-known-agents is recoverable via reading the runtime registry.
  **Fix:** Two options, pick one:
  1. **Smallest, in-scope-for-0029**: extend the `step.end` payload at `src/engine/run-cycle.ts:87` to include `stderr_excerpt: r.stderr.slice(0, 2000)` when `r.status === "failed"`. Mirror the 2000-char head-keep cap already used by `engine.paused last_errors[].error`. Extend the run-cycle unknown-agent test to assert `/"stderr_excerpt":".*made-up.*claudecode/`.
  2. **Defer to refl-0028**: explicitly mark SPEC bullet 6 as partially met in REVIEW and move it. (BUILD.md already does this — adopting option 2 means skipping this task.)
  **Verify:** If option 1: new test assertion passes; existing passing tests stay green; coverage holds. If option 2: this task is documentation-only (REVIEW.md notes the deferral and links to `docs/cycle/issues/todo/refl-0028-stderr-dropped-on-failed-bash-step.md`).

- [ ] ### Task 4: Audit and resolve uncommitted `README.md` drift before commit step
  **Priority:** Minor
  **Files:** `README.md`
  **Problem:** `git status` shows `M README.md` with a ~125-line user-facing rewrite ("dark factory for AFK software development", quickstart, design-docs links). SPEC §Documentation Updates explicitly says: "README.md: no user-facing CLI or workflow change. No update required this cycle." BUILD.md does not mention touching README.md. The change appears to be working-tree carryover from a prior session, not produced by cycle 0029. If left in place, `commit.sh` selective-staging will likely scoop it into cycle 0029's commit and PR, mixing scopes.
  **Fix:** Before the `commit` step runs, confirm intent. Either: (a) stash the README change out of the cycle commit if it is unrelated to 0029, or (b) extend SPEC to explicitly include the README rewrite. Recommended path: stash with `git stash push -m "pre-0029 README drift" -- README.md` and re-apply it in a dedicated docs cycle so the diff stays surgical to the exec-module refactor.
  **Verify:** `git status` shows no `M README.md` before the cycle 0029 commit step runs. `git diff master...HEAD -- README.md` after the cycle merges returns empty.
