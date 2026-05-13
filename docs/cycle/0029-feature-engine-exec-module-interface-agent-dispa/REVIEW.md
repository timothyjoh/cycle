Now write REVIEW.md to stdout (engine captures it).

```markdown
# Review: Cycle 0029

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (1 minor reliability regression, 1 minor coverage gap, 1 SPEC bullet partial, 1 working-tree drift to resolve before commit). Core refactor is sound; happy-path behavior bit-for-bit preserved per regression net.

## Code Quality Review

### Summary
Implementation cleanly matches SPEC + PLAN. `ExecModule` interface, `UnknownAgentError`, and `resolveAgent` land exactly as designed (`src/engine/exec.ts:1-28`). `claudecodeExec` body is byte-identical to the prior `execClaudecodeStep` modulo `buildChildEnv(env ?? {})` (`src/engine/exec-claudecode.ts:8-32`). `run-cycle.ts` dispatch routes through `resolveAgent` with `UnknownAgentError` caught and synthesized into a failed `StepResult`; existing `step.end status:failed` / `cycle.end failed` path is preserved (`src/engine/run-cycle.ts:67-95`). `triage.ts` deletes both guards (`runTriage` and `dryRunTriage`) and replaces inline `spawn("claude", …)` with `runAgentViaDispatch` that materializes the rendered prompt to `.cycle/.triage-<hex>.prompt.md`, calls `resolveAgent(cfg.agent).runStep`, and unlinks in `finally` (`src/engine/triage.ts:702-719`). No silent fallback to `claudecode` anywhere. CLAUDE.md Architecture quick reference updated as required.

### Findings
1. **Reliability regression**: `claudecodeExec.runStep` has no `child.on("error", …)` handler — `src/engine/exec-claudecode.ts:12-30`. Missing `claude` binary or other spawn failures emit an unhandled `error` event on `ChildProcess`, which throws synchronously. The pre-refactor triage default `runClaudecodeAgent` had `child.on("error", reject)` and absorbed this via the upstream `agent failed:` wrapping into `engine.paused`. Now triage shares the workflow path's latent crash-on-missing-binary behavior. BUILD.md claims spawn failures "surface as `{exitCode: -1, status: "failed"}`" — true only when the process actually starts; not true on ENOENT. See MUST-FIX Task 1.
2. **Coverage gap in new code**: `runAgentViaDispatch` happy-path body at `src/engine/triage.ts:710-718` (tmp path build, writeFile, `mod.runStep`, return, finally-unlink) is uncovered. Every existing triage test injects `TriageDeps.runAgent`, bypassing the dispatch adapter. The new unknown-agent triage test hits `resolveAgent` throw at line 707 before the filesystem ops. BUILD.md acknowledges; coverage net-neutral but the new filesystem ops add real surface area. See MUST-FIX Task 2.
3. **SPEC bullet 6 partial**: `step.end` payload at `src/engine/run-cycle.ts:87` only carries `{cycle_id, step, status, exit_code}`. SPEC required the `UnknownAgentError` message in the event payload. Synthesized `r.stderr = err.message` is dropped — artifact write at `:80-82` is gated on `r.status === "ok"`. The dedicated `tests/engine/exec.test.ts` and the triage `engine.paused` test do assert the message in their respective surfaces, but the run-cycle workflow path leaves operators without an on-disk reason for the failure. See MUST-FIX Task 3.
4. **Working-tree drift**: `README.md` shows a ~125-line user-facing rewrite (`M README.md`) that is not part of cycle 0029's SPEC (`§Documentation Updates`: "no user-facing CLI or workflow change. No update required this cycle") and not mentioned in BUILD.md. `commit.sh` selective-staging will likely scoop it into the cycle commit. See MUST-FIX Task 4.

### Spec Compliance Checklist
- [x] `src/engine/exec.ts` exports `ExecModule`, `UnknownAgentError`, `resolveAgent` (`src/engine/exec.ts:4-28`).
- [x] `src/engine/exec-claudecode.ts` exports an `ExecModule` registered in the dispatch table at module load; no `execClaudecodeStep` symbol remains. Verified via `grep`: only docs + bundled `.cycle/bin/cycle.js` references remain.
- [x] `run-cycle.ts` and `triage.ts` route all `claudecode`-bound spawns through `resolveAgent`; no direct `spawn("claude", …)` or `import …/exec-claudecode` outside `exec.ts` / `exec-claudecode.ts` / their tests. Verified via `grep`.
- [x] Unit test: `resolveAgent("claudecode")` returns module with `typeof .runStep === "function"` (`tests/engine/exec.test.ts:5-8`).
- [x] Unit test: `resolveAgent("foo")` throws `UnknownAgentError`; message contains `"foo"` and `claudecode` (`tests/engine/exec.test.ts:10-21`).
- [~] Unit test: `run-cycle.ts` step dispatch with unregistered agent emits `step.end status:failed` carrying the `UnknownAgentError` message. **Partial.** Test asserts `status:failed,exit_code:-1` only; message is not in event payload (only in synthesized stderr that is then dropped). See finding 3.
- [x] Unit test: `triage.ts` with `cfg.triage.agent = "foo"` produces `engine.paused {reason: "all_triage_failed"}` with `last_errors[].error` containing `"foo"` and `claudecode` (`tests/engine/triage.test.ts:799-824`).
- [x] Existing `exec-claudecode.test.ts` passes against the refactored module via `resolveAgent("claudecode").runStep(...)` (`tests/engine/exec-claudecode.test.ts:6,20`).
- [x] `npm test` passes: 290/290 green in 12.5s.
- [x] Coverage holds: line 98.11%, branch 90.72%, function 96.30%. No per-file regression in `src/engine/` (exec.ts 100/100/100; exec-claudecode.ts 100/80/100; run-cycle.ts 100/88.89/83.33; triage.ts 97.08/94.35/97.56).
- [x] `src/defaults/` untouched.
- [x] CLAUDE.md Architecture quick reference updated.
- [ ] **Extra deviation**: SPEC §Documentation Updates says README.md is unaffected; working tree shows a large unrelated rewrite. See finding 4.

## Adversarial Test Review

### Summary
Adequate. The seam-level tests are sharp (`tests/engine/exec.test.ts`). Integration tests for both unknown-agent failure paths exercise real `runCycle` / `runTriage` against tmp repos with real filesystem and real log emission — no mock abuse. The PATH-stubbed fake `claude` binary in `tests/engine/exec-claudecode.test.ts` is the right regression net. Two gaps: (a) no test exercises the new `runAgentViaDispatch` happy-path body through real dispatch; (b) no test exercises spawn-launch failure (missing `claude` binary). Both gaps are silent failure modes hidden by `TriageDeps.runAgent` injection in every other triage test.

### Findings
1. **Mock-shaped seam**: every triage test except the new unknown-agent one injects `TriageDeps.runAgent` to bypass real dispatch — `tests/engine/triage.test.ts` has 20+ such injections. The new `runAgentViaDispatch` is therefore exercised only via the synchronous `resolveAgent` throw path. Filesystem ops (mkdir/writeFile/unlink) are unverified. See MUST-FIX Task 2.
2. **Missing failure-mode test (spawn launch)**: no test asserts behavior when `claude` is not on PATH. The current implementation crashes (unhandled `error` event); a test with `env: { PATH: "/nonexistent" }` would surface this immediately and would also serve as the regression guard for MUST-FIX Task 1.
3. **Weak assertion (run-cycle unknown-agent)**: `tests/engine/run-cycle.test.ts:670-674` checks `step.end status:failed,exit_code:-1` and `cycle.end status:failed,failing_step:bogus`. Does not assert the `UnknownAgentError` message reaches any persisted surface. With SPEC bullet 6 requiring "carrying the `UnknownAgentError` message in the event payload," this test sidesteps the spec. The triage test does assert message contents (`/"foo"/`, `/claudecode/`), so the dispatch-table machinery is covered — but the run-cycle path's operator-discoverability claim is not.
4. **Assertion quality (good)**: triage test asserts `last_errors[0].error` matches both `/"foo"/` and `/claudecode/` — that's specific, not just `toBeTruthy`. The exec test asserts `instanceof UnknownAgentError` plus message regex — robust to message reformatting that preserves intent. Run-cycle test pins exact log substrings including `cycle_id` and `step` — good.

### Test Coverage
- Command run: `npm run test:coverage` (290/290 tests pass; one `npm test` run also recorded).
- Line / branch / function: **98.11 / 90.72 / 96.30** (overall). Per file (changed surfaces): `exec.ts` 100/100/100; `exec-claudecode.ts` 100/80/100; `run-cycle.ts` 100/88.89/83.33; `triage.ts` 97.08/94.35/97.56.
- Regressions vs base (per-file): None vs the documented baseline (line ≥95 / branch ≥75 / func ≥90). `triage.ts` uncovered range shifted from `runClaudecodeAgent` to `runAgentViaDispatch` — net coverage roughly unchanged but the new code is functionally broader (adds fs ops). Treat as a soft regression in surface-vs-test-ratio rather than a number drop.
- New code without tests: `runAgentViaDispatch` happy path (`src/engine/triage.ts:710-718`); `claudecodeExec.runStep` spawn-launch error semantics (no `child.on("error")` handler — implicit dead-code-on-success; explicit crash on failure with no test).
- Specific scenarios missing tests:
  - Missing `claude` binary on PATH → both `claudecodeExec.runStep` and triage `runAgentViaDispatch` need a failure-mode test.
  - `runAgentViaDispatch` tmp-file write success + `mod.runStep` success + unlink success (real dispatch end-to-end through fake `claude`).
  - `runAgentViaDispatch` `mod.runStep` throws or rejects mid-flight → does the `finally` unlink fire? (Implementation: yes — `try/finally` covers it. Test: no.)
  - `step.end` payload includes the unknown-agent error message (SPEC bullet 6 strict reading).
```
