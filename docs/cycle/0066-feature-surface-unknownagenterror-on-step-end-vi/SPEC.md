# SPEC — Cycle 0066: Extend step.end stderr surface to dispatch path

## Objective
Extend the head-capped `stderr` field on failed `step.end` events to cover the agent-dispatch failure path (the `claudecode`/`codex`/`gemini` branch in `run-cycle.ts`) so an `UnknownAgentError` — or any synthesized dispatch-time failure — is observable on disk in `.cycle/log.jsonl` without re-running the registry. Closes SPEC 0029 §Acceptance bullet 6.

## Source Issue
`refl-0029-spec-acceptance-bullet-6-deferred-to-wro` — "Surface UnknownAgentError on step.end via stderr_excerpt covering claudecode/dispatch path (closes SPEC 0029 Acceptance #6)"

## Naming reconciliation (binding)
The source issue body calls the field `stderr_excerpt`. The already-shipped bash path (cycle 0065, commit `33f2b0a`) uses the field name **`stderr`** at `src/engine/run-cycle.ts:178-180`. To preserve identical observable behavior across both failure paths, this cycle uses **`stderr`** for the dispatch path as well. Renaming the existing bash-path field is out of scope.

## Scope

### In Scope
- Broaden the failed-step `stderr` emission at `src/engine/run-cycle.ts:178-180` from `step.agent === "bash" && r.status === "failed"` to `r.status === "failed"` (any agent), using the existing `truncateStepEndStderr` helper unchanged.
- Test coverage for the dispatch path: an unknown agent name in the step config causes `resolveAgent` to throw `UnknownAgentError`, which is caught at `run-cycle.ts:149-155` and synthesized into `r.stderr = err.message`; the resulting `step.end status:"failed"` event must carry `stderr` equal to that message (verbatim, below the 2000-char cap).

### Out of Scope
- Renaming the existing `stderr` field on failed bash `step.end` events to `stderr_excerpt`.
- Routing the message anywhere other than the `step.end` payload (no new artifact, no log-line restructuring).
- Refactoring `UnknownAgentError` itself, the agent registry, or `exec.ts`/`exec-claudecode.ts`/`exec-codex.ts`/`exec-gemini.ts` dispatch internals.
- Changing `exit_code:-1` semantics on dispatch failures.
- Adding `stderr` to successful `step.end` events.
- Extracting a shared `truncateStepEndStderr`/`truncate` helper across `run-cycle.ts` and `triage.ts` (covered by sibling `refl-0065-extract-shared-head-capped-truncate-help`).

## Requirements
- The `step.end` gate becomes `r.status === "failed"` for **both** bash and agent-dispatch paths. The agent-path failure (real subprocess exit) and the dispatch-time synthesized failure (`UnknownAgentError` caught at `run-cycle.ts:149-155`) both flow through the same gate.
- The 2000-char head-kept cap with trailing `…` on overflow matches the existing `truncateStepEndStderr` helper (`src/engine/run-cycle.ts:27-29`) byte-for-byte; the helper is reused, not duplicated again.
- Successful `step.end` events on **all** paths continue to omit the `stderr` key entirely.
- `r.stderr` is the documented `StepResult.stderr` string (already `""` on dispatch-path success); the gate is on `status`, not on `stderr` truthiness, so an empty string from a failed dispatch (defensive) emits `"stderr":""` literally — matching the bash-path contract.

## Acceptance Criteria
- [ ] A failed `step.end` from the dispatch path (workflow step with `agent: bogus`) emits an event whose JSON parses to `{event:"step.end", status:"failed", stderr:"<UnknownAgentError message verbatim>"}` and includes no other shape changes (cycle_id, step, exit_code preserved).
- [ ] The dispatch-path `stderr` field is head-capped at 2000 chars with trailing `…` on overflow, observably identical to the bash-path cap (covered by an overflow test fixture).
- [ ] The existing three tests in `tests/engine/run-cycle.step-end-stderr.test.ts` still pass unchanged (successful-bash omission, failed-bash verbatim, failed-bash overflow).
- [ ] Successful agent-path `step.end` events (any non-bash agent) still omit `stderr`.
- [ ] `npm test` passes end-to-end.
- [ ] `npm run typecheck` passes without warnings.
- [ ] `npm run test:coverage` passes the per-file floor (`src/engine/triage.ts ≥ 95%`); overall coverage does not regress vs current master (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Testing Strategy
- Node's native test runner, same fixture style as `tests/engine/run-cycle.step-end-stderr.test.ts` (real `runCycle` invocation against a tmp repo + minimal `workflows.yml` + injected log scan).
- New test file: `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (or extend the existing file; prefer new file to keep bash- vs dispatch-path fixtures readable).
- Scenarios:
  1. **Unknown agent → failed dispatch carries verbatim stderr.** Workflow `{steps:[{name:"spec", agent:"bogus", prompt:"…"}]}`. Assert the failed `step.end` carries `stderr` equal to the exact `UnknownAgentError.message` string thrown by `resolveAgent("bogus")` (read the message from a direct call so the assertion is not pinned to a literal that may drift).
  2. **Successful agent path omits stderr.** Stub a registered agent's `runStep` (or use the existing test seam if any) to return `{status:"ok", exitCode:0, stdout:"…", stderr:""}` and assert the resulting `step.end` JSON has no `stderr` key.
  3. **Dispatch-path overflow head-caps at 2000.** Construct or simulate an agent that produces a `>2000`-char `r.stderr` on a failed `step.end` (either via a registered fake agent returning a long `stderr`, or by extending the dispatch synthesis if a less invasive seam exists). Assert `stderr.length === 2000` and `stderr.endsWith("…")` — mirroring the existing bash overflow test at `tests/engine/run-cycle.step-end-stderr.test.ts:113-139`.

If scenario 2 or 3 requires a registered fake agent and one does not exist in the test harness, add a minimal in-test agent registration (or, if the registry is module-frozen, add a `__test__`-style seam in `exec.ts` — but only if strictly required; the bash-path overflow test does not need one, so prefer the dispatch-only path that uses the real `UnknownAgentError` mechanism).

## Documentation Updates
- **CLAUDE.md** — Update the `### Failed bash step.end events …` paragraph (currently scoped to bash) to describe the broadened gate. Replace the "Gate is `step.agent === "bash" && r.status === "failed"`" wording with the new `r.status === "failed"` gate, and note both code paths now surface `stderr` (bash `execBashStep` failure + dispatch-time `UnknownAgentError` synthesis). Keep the line about the duplicate truncate helper.
- **docs/ARCHITECTURE.md** — If it carries an equivalent claim about the failed-`step.end` stderr surface, update it for parity (verify in build; only edit if drift exists).
- **README.md** — No user-visible CLI change; skip unless an operator-facing event reference exists in README that mentions bash-only.
- **AGENTS.md** — No update expected (verify in build).

Documentation is part of "done" — code without updated docs is incomplete. The dogfood mirror under `.cycle/` is untouched (no `src/defaults/` change).

## Dependencies
- `refl-0028-stderr-dropped-on-failed-bash-step` (DONE in cycle 0065, commit `33f2b0a`) — provides the `truncateStepEndStderr` helper at `src/engine/run-cycle.ts:27-29` and the bash-path emission this cycle widens.
- Existing `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:149-155` (no change required to that path).
- No new env vars, no external services.
