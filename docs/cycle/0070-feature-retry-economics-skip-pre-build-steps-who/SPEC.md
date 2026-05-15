# SPEC — Cycle 0070: Retry economics — skip completed pre-build steps on cycle retry

## Objective
On `tbd.jsonl` retry pops (`attempt > 0` for the same `issue_id`), the engine
should skip pre-build workflow steps (`spec`, `research`, `plan`) whose
artifact files already exist non-empty under the cycle artifact dir, emitting
one `step.skipped` event per skipped step. This stops the ~14-minute
re-derivation tax observed across cycles 0026/0027/0028, while keeping the
mid-execution restart policy for build/fix/verify/commit untouched and
preserving log-tail resume math.

## Source Issue
`refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics` —
"Retry economics: skip pre-build steps whose artifacts already exist on cycle retry"

## Scope

### In Scope
- Engine skip behavior inside `runCycle` (`src/engine/run-cycle.ts`): when
  the popped row's attempt is > 0 and a pre-build step's artifact at
  `<artifactDir>/<STEP>.md` exists with `> 0` bytes, do not invoke the
  agent. Emit `step.skipped {cycle_id, step, reason: "artifact_present",
  artifact_path}` in lieu of `step.start` / `step.end`. The skip set is
  exactly `{spec, research, plan}`. Skips advance the loop identically to
  `step.end status:ok` so log-tail resume math is unchanged.
- Opt-out: CLI flag `--no-skip-completed` (parsed in
  `src/cli/parse-args.ts`) and workflow-level
  `engine.skip_completed_on_retry: false` in `workflows.yml`. CLI flag
  wins over YAML; YAML default is `true`. Pass the resolved boolean
  through `runCycle` opts (no new global state).
- Unit-test matrix in `tests/engine/`:
  (1) attempt=0 never skips even when artifacts exist;
  (2) attempt=1 with SPEC.md, RESEARCH.md, PLAN.md all `> 0` bytes skips
      all three and emits three `step.skipped` events;
  (3) attempt=1 with only SPEC.md present skips spec, runs research+plan;
  (4) `--no-skip-completed` disables skipping (attempt=1, artifacts present,
      still re-runs);
  (5) zero-byte artifact file does NOT trigger skip (strict `> 0` bytes).

### Out of Scope
- Per-step partial-restart logic for `build`/`fix`/`verify`/`commit` — that
  cluster (`step-restart-tolerance-audit-*`) keeps its existing
  pre-step `head_sha` reset policy; this cycle changes nothing for it.
- Cross-`issue_id` artifact reuse — skip key is the current cycle's
  artifact dir only.
- The companion stderr-on-bash-failure issue
  (`refl-0028-stderr-dropped-on-failed-bash-step`) — separate cycle.
- Reflection / documentation step skipping — already non-fatal terminal
  steps; skip economics aren't worth the surface area.

## Requirements
- Skip gate is `attempt > 0 && step.name ∈ {spec, research, plan} &&
  step.agent !== "bash" && existsSync(<artifactDir>/<STEP>.md) &&
  statSync(...).size > 0 && skipCompletedOnRetry === true`.
- `step.skipped` event shape:
  `{event: "step.skipped", ts, cycle_id, step, reason: "artifact_present",
  artifact_path}`. Use the existing logger seam in `runCycle`.
- The `runCycle` workflow-step loop must NOT emit `step.start` or
  `step.end` for skipped steps (otherwise the resume-index calculation in
  `src/engine/log-tail.ts` would treat the step as already-completed via a
  different code path and double-count).
- Resume math: `findFirstUnfinishedStepIndex` (or its equivalent in
  `log-tail.ts`) must treat `step.skipped` as a terminal completion event
  for index-advancement, equivalent to `step.end status:"ok"`.
- The `attempt` value must reach `runCycle`: extend `RunCycleOpts` with
  `attempt: number` (default 0) and pass it from both call sites in
  `src/cli.ts` (fresh pop and retry pop). Resume entry is orthogonal — a
  resumed cycle that's mid-step is governed by `startStepIndex`, not by
  this skip gate.
- The opt-out boolean threads from CLI args → `runCycle` opts. YAML field
  parsing lives in `src/engine/workflow.ts`; default is `true` when the
  field is absent.
- Strict `> 0` bytes (not `>= SPEC_MIN_BYTES`): a partially-written but
  non-empty SPEC.md trips the existing `SPEC_MIN_BYTES` guard on the very
  next attempt anyway. The skip gate is purely "did we generate
  something here?", not "is it good enough?".
- Engine still writes `BUILD.md` and downstream artifacts normally; no
  behavior change for non-skipped steps.
- Coverage: line ≥ 95%, branch ≥ 75%, function ≥ 90%. Per-file floor
  for `src/engine/triage.ts` is untouched; this work adds new branches
  to `src/engine/run-cycle.ts` which must be exercised.

## Acceptance Criteria
- [ ] Anchored grep against the artifact dir confirms the new event shape:
      `grep -E '^.*"event":"step.skipped".*"reason":"artifact_present".*"step":"(spec|research|plan)"' .cycle/log.jsonl`
      returns the expected lines under the retry test fixture.
- [ ] Anchored grep against `^id:` in
      `docs/cycle/issues/todo/refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics.md`
      still resolves the issue post-build (frontmatter unmodified by this cycle).
- [ ] Unit-test matrix above (5 cases) all pass and live under
      `tests/engine/`.
- [ ] `--no-skip-completed` parsed in `src/cli/parse-args.ts` and
      propagated to `runCycle`; YAML `engine.skip_completed_on_retry: false`
      has the same effect.
- [ ] CLI flag overrides YAML when both are set.
- [ ] `findFirstUnfinishedStepIndex` (or equivalent) recognizes
      `step.skipped` as terminal. New unit test in `tests/engine/`
      covering: a log with `step.start` (spec) → `step.skipped`
      (research) → `step.start` (plan) resumes at index 2 (plan).
- [ ] All existing tests still pass.
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` passes the gate
      (`scripts/coverage-gate.mjs`).
- [ ] No `npm run sync-defaults` invocation in this cycle (dogfood
      workflow.yml divergence must be preserved per CLAUDE.md).

## Testing Strategy
- Node's native `node:test` runner, no extra framework.
- Unit tests build temp repo roots via the existing test helpers (see
  `tests/engine/` for the pattern), seed `<artifactDir>/SPEC.md` etc.,
  invoke `runCycle` (or a narrower seam if extraction is justified), and
  assert on the captured `log.jsonl` JSON events.
- Stub the agent dispatcher so we can assert "agent NOT invoked for
  spec/research/plan when skipped" without spinning up claudecode.
- Log-tail recognition test reads a synthetic `log.jsonl` and asserts on
  the resume start index.
- No new integration test fixture for this cycle — the unit matrix
  covers the gate matrix fully. A future cycle can add a wall-clock
  integration test if the savings need empirical confirmation.

## Documentation Updates
- **CLAUDE.md**: extend the "Architecture quick reference" bullet about
  retry semantics with a paragraph on the skip rule (when it fires, opt-out,
  emitted event shape).
- **README.md**: add a one-line entry to the `cycle status` /
  retry-behavior section noting the skip rule and `--no-skip-completed`.
- **docs/ARCHITECTURE.md** (or `docs/RFC-001-issue-lifecycle.md` if the
  retry section lives there — check both, document in whichever already
  owns retry semantics): describe the skip gate, event, opt-out, and the
  reason it's bounded to pre-build steps.
- Documentation lives in the `documentation` workflow step; the cycle
  is incomplete if those files still describe the old re-derive
  behavior at PR-time.

## Dependencies
- No new runtime deps. Uses `node:fs/promises` (`stat`) which is already
  imported via `src/engine/queue.ts` and friends.
- No external services or env vars.
- Requires the existing log-tail resume infrastructure
  (`src/engine/log-tail.ts`) — already in master.
- Requires the `attempt` value already living on each `tbd.jsonl` row
  (`QueueRow.attempt`) and the existing increment in `src/cli.ts`'s
  retry-drain path — already in master.
