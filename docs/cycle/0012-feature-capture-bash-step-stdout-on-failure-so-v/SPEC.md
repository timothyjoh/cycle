# SPEC — Cycle 0012: Capture bash-step stdout on failure

## Objective
When a `bash` step fails (e.g. `verify` → `scripts/verify.sh` → `npm test`), the engine's `step.end` event today records only a head-capped `stderr` slice. Test runners and most build tools print failure detail to **stdout**, so a failed step surfaces as `exit_code: 1, stderr: ""` with the actual cause invisible in the log — diagnosing it requires re-running the command by hand. This cycle makes a failed bash step self-diagnosable from the engine's own output by adding a head-capped `stdout` excerpt to the `step.end` event and persisting the full captured output to a per-cycle artifact that the event points to, while leaving the success path completely unchanged.

## Source Issue
`feat-bash-step-output-capture` — "Capture bash-step stdout on failure so verify failures are diagnosable from the log"

## Scope

### In Scope
- On a **failed** bash step, include a head-capped `stdout` excerpt in the `step.end` event (alongside the existing `stderr` excerpt), bounded by `truncateHeadCapped` from `src/engine/log-fmt.ts`.
- On a **failed** bash step, write the full captured `stdout` + `stderr` to a per-cycle artifact `<artifactDir>/<step>.out` and include a pointer field (the artifact path) in the `step.end` event.
- Tests covering: a failing bash step produces a capped `stdout` excerpt + `.out` artifact + pointer; a passing bash step is unchanged (no excerpt, no artifact, no pointer).

### Out of Scope
- Any change to agent (non-`bash`) step output handling — agent steps already write `<STEP>.md` artifacts and follow the completion-proof contract.
- Compressing, summarizing, or restructuring captured output beyond head-capping (tracked separately in `feat-compress-step-output`).
- Streaming or live-tailing bash output during execution.
- Changing the existing `MAX_STEP_END_STDERR` cap value or the `stderr` excerpt behavior.

## Requirements
- A failed bash step's `step.end` event MUST carry a head-capped `stdout` field sufficient to identify the failure, capped by `truncateHeadCapped(stdout, MAX)` so the event stays bounded.
- The full, uncapped captured output (stdout and stderr) MUST be recoverable from a per-cycle artifact written to the cycle's `artifactDir` (filename derived from `step.name`, e.g. `verify.out`), and the `step.end` event MUST carry a pointer (the artifact path) to it.
- On a **successful** bash step, the `step.end` event MUST NOT gain any new fields (no `stdout` excerpt, no artifact pointer) and no `.out` artifact may be written — the happy path stays silent.
- Error output MUST never be dropped silently: if the failing step produced output, it must appear in both the capped excerpt and the full artifact.
- **Failure behavior**: If the captured `stdout` and `stderr` are both empty on failure, the event still records `exit_code` and an empty/absent `stdout` excerpt (no crash, no fabricated content), and the `.out` artifact is written as an empty (or header-only) file so the pointer never dangles. If writing the `.out` artifact fails (e.g. unwritable directory), the artifact-write error MUST NOT mask the original step failure: the `step.end` event and the cycle's terminal-failure routing still fire with the original `exit_code`, and the artifact-write failure is logged/degraded rather than thrown. The capped `stdout` excerpt in the event is preserved even when the full-artifact write fails.

## Acceptance Criteria
- [ ] A failed bash step emits a `step.end` event whose `stdout` field is a non-empty, head-capped excerpt of the step's stdout (verified in a test that fails a bash step printing a known marker to stdout and asserts the marker appears in the event's `stdout` field).
- [ ] A failed bash step writes `<artifactDir>/<step>.out` containing the full captured stdout+stderr, and the `step.end` event carries a pointer field equal to that path (verified by reading the file and matching the event field).
- [ ] A **successful** bash step's `step.end` event contains no `stdout` excerpt and no artifact-pointer field, and no `.out` artifact is created (verified in a test asserting field absence and `fs` non-existence).
- [ ] Failure-path criterion: when the `.out` artifact write fails (e.g. directory made unwritable / non-existent), `runCycle` still emits `step.end` with the original `exit_code` and routes the cycle through the existing terminal-failure path, surfacing the write failure via a log entry rather than throwing or swallowing it (verified in a test that forces the write to fail).
- [ ] `npm run typecheck` clean.
- [ ] All existing tests still pass.
- [ ] Coverage floors hold (`npm run check:coverage`); `src/engine/run-cycle.ts` ≥ 90%.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node's built-in `node:test` runner (project convention; no transpile step).
- Drive `runCycle` (or the bash-step path within it) with a temporary `.cycle/` script that exits non-zero while printing a known marker to stdout, then assert against the emitted event stream and the on-disk `.out` artifact.
- Scenarios: (1) happy path — bash step exits 0, event unchanged, no `.out` file; (2) failure with stdout — capped `stdout` excerpt present, `.out` artifact written with full content, pointer field correct; (3) failure with empty stdout+stderr — no crash, empty excerpt, empty `.out` artifact, pointer present; (4) artifact-write failure — original `exit_code` preserved, terminal-failure routing intact, write error logged not thrown; (5) capping — stdout longer than the cap is truncated with the `…` marker in the event while the `.out` artifact holds the full text.
- Reuse `truncateHeadCapped` so capping is covered by exercising the existing helper through the new path.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `src/engine/run-cycle.ts` architecture note to document that failed `bash` steps emit a head-capped `stdout` excerpt and write a `<step>.out` artifact (with a pointer field in `step.end`), and that successful steps are unaffected.
- **docs/ENGINE.md**: Note the bash-step failure-output-capture behavior alongside the existing step-end/completion-proof documentation.
- **README.md**: No user-facing change to surface (engine-internal observability improvement).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `truncateHeadCapped` from `src/engine/log-fmt.ts` (already present).
- `StepResult` from `src/engine/exec-bash.ts` (already carries `stdout`/`stderr`).
- The per-cycle `artifactDir` already computed in `runCycle` (used for agent `<STEP>.md` artifacts).
- No new external services or environment variables required.
