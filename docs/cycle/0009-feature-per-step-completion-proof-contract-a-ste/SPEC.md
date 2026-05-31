# SPEC — Cycle 0009: Per-Step Completion-Proof Contract

## Objective
Steps in a cycle currently signal success with nothing more than an exit code of 0 plus the existence of their declared artifact file. That signal is too weak: a `review` step was observed exiting 0 while leaving a 0-byte `REVIEW.md`, and downstream steps consumed the empty artifact as if it were valid work. This cycle adds a per-step completion-proof contract to `src/engine/run-cycle.ts`: after any agent step that declares an output artifact exits 0, the engine verifies the artifact is non-empty and treats a missing, 0-byte, or whitespace-only artifact as a step failure that flows through the existing retry machinery. This closes the exit-0-but-produced-nothing class of silent failures for agent steps and subsumes reflection finding `refl-0253`.

## Source Issue
`feat-step-completion-proof` — "Per-step completion-proof contract: a step that exits 0 but produced nothing must fail"

## Scope

### In Scope
- A single declarative step→artifact mapping table that drives a post-step non-empty check after every agent step that declares an artifact (e.g. spec→`SPEC.md`, plan→`PLAN.md`, review→`REVIEW.md`, build→`BUILD.md`), composing with / consolidating the existing scattered `ARTIFACT_STEPS` guards rather than adding another one-off check.
- The completion check itself: after an agent step exits 0, if its declared artifact is missing, 0 bytes, or whitespace-only, fail the step with the descriptive error `"<step> exited 0 but <artifact> is empty — treating as failure"`, routed through the normal step-failure path (feeding retry / `max_cycle_attempts`) — not a silent pass.
- A `step.completion_check { step, artifact, status }` engine event emitted to the cycle log recording each check's outcome.

### Out of Scope
- Hung-step **timeout** handling (the engine never regaining control from a long-running step) — tracked separately in `feat-hung-step-timeout`.
- Capturing or proof-checking **bash-step** stdout — tracked separately in `feat-bash-step-output-capture`.
- The stronger "promise-tag" / explicit-completion-token variant where the agent emits a verifiable proof token; this cycle delivers only the non-empty-artifact contract.
- Steps that declare no output artifact — these are unaffected by this contract.

## Requirements
- The step→artifact relationship must be expressed as one declarative table (single source of truth) that the post-step check consults; existing per-step artifact guards must be folded into it rather than left duplicated.
- After an agent step returns exit code 0, the engine must stat the declared artifact and classify it as empty when it is absent, 0 bytes, or contains only whitespace.
- An empty-artifact result must be converted into the same kind of failure the engine already produces for a non-zero step, so it increments the existing failure/attempt counters and is eligible for retry under `max_cycle_attempts`.
- A `step.completion_check` event must be appended to the cycle log for the check, carrying at minimum the step name, the artifact path, and a status discriminating pass from fail.
- The check must apply only to agent steps that declare an artifact; agent steps with no declared artifact and bash steps must not be failed by this contract.
- **Failure behavior**: On a missing / 0-byte / whitespace-only artifact after exit 0, the engine surfaces the condition as an explicit step failure with the descriptive error message and a `status: "fail"` completion-check event — never a silent pass and never an empty artifact propagated to the next step. The failure is raised through the normal step-failure path so retry/halt policy applies unchanged. A non-empty artifact emits `status: "pass"` and the cycle proceeds exactly as today. A step with no declared artifact emits no failure from this contract (the check degrades to a no-op for that step).

## Acceptance Criteria
- [ ] A single declarative step→artifact table exists and drives a post-step non-empty check after every agent step that declares an artifact.
- [ ] An agent step that exits 0 while its declared artifact is missing, 0 bytes, or whitespace-only is recorded as a step failure carrying the message `"<step> exited 0 but <artifact> is empty — treating as failure"`.
- [ ] The empty-artifact failure routes through the existing retry / failure-count machinery (it increments the same counters a non-zero exit would) and does not silently pass.
- [ ] A `step.completion_check` event with `{ step, artifact, status }` is appended to the cycle log for the checked step; tests assert its presence cardinality-pinned via `filter(predicate).length === 1`.
- [ ] An agent step that exits 0 with a non-empty declared artifact emits `status: "pass"` and the cycle advances to the next step unchanged (regression).
- [ ] An agent step that declares no artifact is unaffected — no failure is produced by this contract for it.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node built-in test runner (`node:test`), following existing `tests/engine/run-cycle.*.test.ts` patterns, with the step executor stubbed to return controlled `{ exitCode, stdout, stderr }` results and artifacts written to a temp cycle directory.
- Key scenarios:
  - **Failure path** — agent step exits 0 but its declared artifact is missing → step fails with the descriptive error; assert failure routes through the normal failure/retry path.
  - **Failure path** — declared artifact is 0 bytes, and separately whitespace-only → both classified empty and fail.
  - **Happy path** — declared artifact is non-empty → step passes and the next step runs (regression against current behavior).
  - **No-op path** — agent step with no declared artifact → contract produces no failure.
  - **Event emission** — `step.completion_check` is emitted exactly once per checked step with the correct `step`, `artifact`, and `status`, asserted with `filter(...).length === 1` (or `expectExactlyOne` from `tests/helpers.ts`).
- Maintain coverage floors: `src/engine/run-cycle.ts` ≥ 90% line, plus global Line ≥ 95% / Branch ≥ 75% / Function ≥ 90%. Add the new tests in this cycle, not as follow-up.
- No UI is involved; no Playwright / E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add the per-step completion-proof contract to the `src/engine/run-cycle.ts` architecture notes — describe the declarative step→artifact table, the post-exit-0 non-empty check, the `step.completion_check` event, and that an empty declared artifact is treated as a retryable step failure.
- **docs/ENGINE.md**: Document the completion-proof post-condition alongside the existing spec post-condition and artifact-sanitization notes — when the check runs, what counts as empty (missing / 0-byte / whitespace-only), the emitted event shape, and how the failure feeds the retry / `max_cycle_attempts` path.
- **README.md**: No user-facing surface changes; no README update required for this cycle.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing step-dispatch and step-failure handling in `src/engine/run-cycle.ts`, including the current per-step artifact guards being consolidated and the failure/retry (`max_cycle_attempts`) machinery the new failure must route through.
- The cycle artifact directory convention (`docs/cycle/<cycle_id>-<workflow>-<slug>/`) where step artifacts such as `SPEC.md`, `PLAN.md`, `REVIEW.md`, and `BUILD.md` are written.
- The engine event-logging facility (`.cycle/log.jsonl`) used to emit `step.completion_check`.
- No new external services or environment variables are required.
