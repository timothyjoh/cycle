# SPEC — Cycle 0020: Timeout-Specific Completion-Proof Message

## Objective
The completion-proof branch in `src/engine/run-cycle.ts` stamps a hard-coded `"<step> exited 0 but <artifact> is empty — treating as failure"` message onto `step.end.stderr` for every empty-artifact failure, including steps that were SIGTERM-killed at the timeout limit (`exit_code: 143`). This produces a self-contradictory `step.end` record — `exit_code: 143` paired with stderr text claiming the step "exited 0" — that actively misleads an operator about why a hanging step failed, costing debugging time exactly when a step is stuck. This cycle delivers a timeout-aware completion-proof message: when `r.timedOut` is true and the declared artifact is empty, `step.end.stderr` reports the timeout-and-empty cause matching the exit code, while the genuine exit-0 path keeps its existing wording. The failure→retry routing is unchanged; only the human-facing message text branches.

## Source Issue
`refl-0019-completion-proof-message-claims-exited-0` — "Emit timeout-specific completion-proof message instead of claiming exited-0 on timed-out steps"

## Scope

### In Scope
- Branch the `"nonempty"` proof-policy error message in `src/engine/run-cycle.ts` on `r.timedOut`: emit a timeout-specific message (e.g. `"<step> timed out (exit 143) and left <artifact> empty — treating as failure"`) when the step timed out and its declared artifact is empty, and keep `formatCompletionProofError` (the exited-0 wording) for the genuine `r.status === "ok"` path.
- Add a test asserting a timed-out empty artifact step produces the timeout-specific `step.end.stderr` text (not the exited-0 wording), and that the exit-0 empty-artifact path still produces the unchanged exited-0 wording.

### Out of Scope
- Any change to the completion-proof routing outcome (failed → retry), the `step.completion_check` status logic, the `step.timeout` / `step.timeout_salvaged` events, or the `max_cycle_attempts` accounting.
- The `spec-min-bytes` and `fix-conditional` proof-policy message branches — only the `"nonempty"` policy message text changes.
- Reducing or altering the `review` step timeout limit, or any change to why steps time out.

## Requirements
- A new pure formatter (e.g. `formatTimeoutProofError(stepName, artifactPath, exitCode)`) produces a message whose text reflects a timeout-induced empty artifact and references the actual exit code, parallel in shape to `formatCompletionProofError`.
- In the `"nonempty"` proof branch, when `proofError` would be set and `r.timedOut` is true, the timeout-specific formatter is used; otherwise the existing `formatCompletionProofError` is used.
- The resulting `step.end.stderr` text must not contain the substring `"exited 0"` when the step was killed by timeout (`exit_code: 143`).
- The `step.completion_check` event payload (`status: "pass" | "fail"`), the `r.status = "failed"` / `r.exitCode` assignment, and the `step.timeout_salvaged` accept-the-work path remain byte-for-byte equivalent in behavior; only the `r.stderr` string value differs on the timed-out-empty path.
- Exactly-once / cardinality-pinned event conventions are honored — no new event is introduced and no existing event's emission count changes.
- **Failure behavior**: This change governs failure-message text on an already-failing path. A timed-out step with an empty declared artifact still routes to `r.status = "failed"`, `r.exitCode` non-zero, and the unchanged retry path — the only difference is `r.stderr` now matches the exit code. A timed-out step whose artifact passes its proof continues to take the `step.timeout_salvaged` accept path unchanged. No error is swallowed; the message text is the surfaced diagnostic and must remain non-empty.

## Acceptance Criteria
- [ ] When an artifact step in `STEP_ARTIFACTS` with `proof: "nonempty"` times out (`r.timedOut === true`) and leaves an empty artifact, the emitted `step.end.stderr` contains the timeout-specific wording (references "timed out" and the exit code) and does **not** contain the substring `exited 0`.
- [ ] When the same step exits 0 cleanly with an empty artifact, the emitted `step.end.stderr` still equals the existing `formatCompletionProofError` output (`"<step> exited 0 but <artifact> is empty — treating as failure"`).
- [ ] On the timed-out-empty path, `r.status === "failed"` and `r.exitCode` is non-zero (routing outcome unchanged) — verified by the failed cycle result and the same retry behavior as before.
- [ ] `step.completion_check` is emitted exactly once for the step with `status: "fail"` on the timed-out-empty path (cardinality-pinned via `filter(...).length === 1`).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node built-in test runner (`node:test`), matching the existing `tests/engine/run-cycle*.test.ts` conventions and the in-repo event-capture / fake-agent harness.
- Key scenarios:
  - **Failure path (new branch)**: a `"nonempty"` artifact step that returns `timedOut: true` with an empty artifact → assert `step.end.stderr` matches the timeout-specific text and lacks `"exited 0"`; assert `r.status === "failed"`.
  - **Failure path (unchanged branch)**: a `"nonempty"` artifact step that exits 0 with an empty artifact → assert `step.end.stderr` equals the existing exited-0 wording.
  - **Regression**: a timed-out step whose artifact is non-empty still takes the `step.timeout_salvaged` path (`r.status === "ok"`), confirming the message branch does not affect salvage.
  - **Event cardinality**: assert `step.completion_check` fires exactly once with `status: "fail"` on the timed-out-empty path, using `filter(predicate).length === 1`.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `run-cycle.ts` completion-proof contract note to record that the `"nonempty"` proof message branches on `r.timedOut` (timeout-specific wording for SIGTERM-killed steps vs. exited-0 wording for the clean exit path), and that the routing outcome is unchanged.
- **docs/ENGINE.md** → *Completion-proof post-condition*: note the timeout-aware message branch so the documented `step.end.stderr` examples match the exit code.
- **README.md**: No user-facing surface changes; no update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `STEP_ARTIFACTS` table, `classifyArtifact`, `formatCompletionProofError`, the `r.timedOut` result field, and the `step.timeout` / `step.completion_check` / `step.timeout_salvaged` events in `src/engine/run-cycle.ts` — all already present.
- No new external services or environment variables.
