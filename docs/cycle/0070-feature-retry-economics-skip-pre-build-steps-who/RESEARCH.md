# Research: Cycle 0070

## Cycle Context
SPEC.md asks the engine to skip pre-build workflow steps (`spec`, `research`, `plan`) on `tbd.jsonl` retry pops (`attempt > 0`) when the corresponding `<artifactDir>/<STEP>.md` already exists with > 0 bytes, emitting one `step.skipped {cycle_id, step, reason: "artifact_present", artifact_path}` event per skipped step in lieu of `step.start`/`step.end`. Behavior is opt-out via a new CLI flag `--no-skip-completed` and a workflow-level `engine.skip_completed_on_retry: false` field (CLI wins; YAML default `true`). The `attempt` value must thread from queue pops into `runCycle` opts. Log-tail resume math must treat `step.skipped` as terminal-equivalent so the resume start-index calculation is unchanged. Build/fix/verify/commit pre-step `head_sha` reset policy is untouched.

## Current Codebase State

### Relevant Components

- **`runCycle` workflow-step loop**: the single seam where step execution happens; emits `step.start` and `step.end` around either `execBashStep` or `resolveAgent(...).runStep` — `src/engine/run-cycle.ts:109-194`. Loop body starts at `for (let i = startIdx; i < wf.steps.length; i++)` at `src/engine/run-cycle.ts:111`.
- **Agent-branch artifact write seam**: where `<artifactDir>/<STEP_NAME_UPPER>.md` files (`SPEC.md`, `RESEARCH.md`, `PLAN.md`, etc.) are produced from agent stdout — `src/engine/run-cycle.ts:156-168`. Path is `join(artifactDir, ${step.name.toUpperCase()}.md)`.
- **Existing reset policy (build/fix only)**: `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` at `src/engine/run-cycle.ts:23`. Pre-step `head_sha` capture and `step.warning` self-heal at `src/engine/run-cycle.ts:114-134`. The skip rule must NOT touch this path; the two policies coexist on retry.
- **`RunCycleOpts` type**: the opts shape passed into `runCycle` — `src/engine/run-cycle.ts:63-70`. Currently `{issueId, title, workflow, cycleId?, env?, resume?}`. SPEC requires extending it with `attempt: number` (and the resolved opt-out boolean threading through).
- **Step-end stderr truncation helper**: `truncateStepEndStderr` / `MAX_STEP_END_STDERR` at `src/engine/run-cycle.ts:27-29` — convention for capped error strings, mentioned only to show the existing "head-cap helpers live here" pattern.
- **Logger seam**: `Logger.emit(event, fields)` writes `{ts, event, ...fields}` to `.cycle/log.jsonl` and to the sink — `src/engine/log.ts:8-18`. Used inside `runCycle` for every step event; the new `step.skipped` event uses this same seam.
- **`parseLogTail` completedSteps gathering**: `src/engine/log-tail.ts:47-57` — currently collects events where `e.event === "step.end"` and `e.status === "ok"`. This is the resume-math source of truth that the CLI uses to compute `startStepIndex` at `src/cli.ts:287-294`.
- **CLI resume start-index calculation**: `src/cli.ts:287-294` — iterates `wfDef.steps`, picks the first whose name is NOT in `tail.completedSteps`. SPEC requires `step.skipped` to feed `completedSteps` for this loop to advance correctly on a re-resume.
- **CLI argument parser**: `src/cli/parse-args.ts:18-73`. `run` branch at lines 54-72 uses `node:util.parseArgs` with the option set `{workflow, dry-run}` and exposes `RunArgs = {command, text, workflow, dryRun}`. SPEC requires adding `--no-skip-completed` (boolean) to that option set and to the `RunArgs` shape.
- **Workflow/engine YAML loader**: `loadConfig` at `src/engine/workflow.ts:38-65` parses `.cycle/workflows.yml`. `EngineConfig` type at `src/engine/workflow.ts:21-24` is `{max_consecutive_failures, base_branch}`. SPEC requires adding an optional `skip_completed_on_retry?: boolean` (default `true` when absent).
- **CLI cycle entry points (two call sites)**:
  - Resume call site: `src/cli.ts:307-313` — passes `{cycleId, issueId, title, workflow, resume}` into `runCycle`. The retry row's attempt count is available at `row!.attempt` (read at `src/cli.ts:320`).
  - Fresh-pop call site: `src/cli.ts:399-404` — passes `{cycleId, issueId, title, workflow}`. The popped row's attempt count is on `row.attempt` (read at `src/cli.ts:412`).
  - Both must thread the resolved `attempt` and the resolved `skipCompletedOnRetry` boolean into `RunCycleOpts`.
- **`tbd.jsonl` attempt field**: `QueueRow.attempt: number` at `src/engine/queue.ts:6-15`. Incremented by `drainFailedRetry` at `src/engine/queue.ts:161-171`. SPEC: skip key is `attempt > 0` on the popped row, with the increment already happening on retry-drain (so the *next* pop sees `attempt: N+1`).
- **Artifact dir**: produced by `createCycleBranch` / `checkoutCycleBranch` / `prepareTrunkArtifactDir` in `src/engine/branch.ts`, returned as `{artifactDir}` and bound at `src/engine/run-cycle.ts:78-99`. For `no_branch: true` workflows (this repo's dogfood), the artifact dir is `docs/cycle/<cycleId>-<workflow>-<slug>`. For branch workflows, same shape on the cycle branch.

### Existing Patterns to Follow

- **Skip gate inside loop body, log-only diversion**: precedent set by `reflection` / `documentation` non-fatal terminal steps at `src/engine/run-cycle.ts:182-190` — on certain conditions the engine emits a side event (`reflection.skipped` / `documentation.skipped`) and `continue`s the loop. SPEC's `step.skipped` follows the same shape (named event with `cycle_id`, `step`, `reason`, plus `artifact_path`) but fires *before* the agent dispatch rather than after a failure.
- **Capped-error helper colocated with use**: `truncateStepEndStderr` / `formatSpecGuardError` are exported pure helpers from `run-cycle.ts` (`src/engine/run-cycle.ts:27-33`). A new `shouldSkipForArtifact(...)` pure helper would follow that convention.
- **Opts threading without globals**: `RunCycleOpts.env`/`.resume` flow CLI → `runCycle` as plain fields; the SPEC's `attempt` and `skipCompletedOnRetry` opts should follow the same pattern (no module-level state).
- **YAML config defaults**: `loadConfig` validates structure but does not assign defaults — defaults live at call sites (e.g., `maxConsecutiveFailures = cfg?.engine?.max_consecutive_failures ?? 2` at `src/cli.ts:119`, `max_cycle_attempts ?? 3` at `src/cli.ts:393`). SPEC's YAML default of `true` for `skip_completed_on_retry` should land via the same `?? true` pattern at the CLI resolution seam.
- **CLI flag wins over YAML resolution**: no prior CLI flag overrides a YAML engine field today, so this is a new resolution pattern. SPEC dictates: if `--no-skip-completed` is set, force `false`; otherwise read `cfg.engine.skip_completed_on_retry ?? true`.
- **`step.start` / `step.end` symmetry assumption**: log-tail and resume code rely on `step.end status:"ok"` as the terminal marker. The SPEC's contract that `step.skipped` MUST NOT also emit `step.start`/`step.end` requires `parseLogTail` to additionally recognize `step.skipped` as a completion (otherwise `startStepIndex` would stop at a skipped step on a subsequent resume).
- **Test temp-repo pattern**: tests under `tests/engine/run-cycle*.test.ts` build temp git repos with `mkdtemp` + `git init -b main`, seed `.cycle/workflows.yml` + `.cycle/prompts/*` + `.cycle/scripts/*`, point a fake `claude` binary onto `PATH` via `env`, then call `runCycle` and assert on `.cycle/log.jsonl` regex matches. Reference: `tests/engine/run-cycle.test.ts:30-77`. The `workflowYml(stepsBody)` helper at lines 15-28 of that file is the canonical fixture generator.

### Dependencies & Integration Points

- **`runCycle` ← CLI fresh pop**: `src/cli.ts:399-404` calls `runCycle(cwd, {cycleId, issueId, title, workflow})`. `row.attempt` is in scope (read at `:412`).
- **`runCycle` ← CLI resume**: `src/cli.ts:307-313` calls `runCycle(cwd, {cycleId, issueId, title, workflow, resume})`. `row!.attempt` is in scope (read at `:320`). On a resume, the cycle was already mid-flight, so `attempt` is whatever was on the row when it went `in_progress`.
- **`parseLogTail` ← CLI resume**: `src/cli.ts:329-346` consumes `tail.completedSteps` to compute `startStepIndex`. New behavior: `step.skipped` events must be appended to `completedSteps` in `src/engine/log-tail.ts:47-57` (or counted equivalently).
- **`loadConfig` ← CLI startup**: `src/cli.ts:89` reads `cfg = await loadConfig(cwd)`. The resolved `skipCompletedOnRetry` boolean is computed once at CLI startup from `cfg.engine.skip_completed_on_retry` (plus the CLI flag) and threaded into both `runCycle` call sites.
- **Artifact dir ← `runCycle`**: `artifactDir` is in scope inside the loop at `src/engine/run-cycle.ts:111` via the destructure at `:78-99`. The skip gate uses `join(artifactDir, ${step.name.toUpperCase()}.md)` and `stat(...).size > 0` (or `existsSync` + `statSync`; both `node:fs` and `node:fs/promises` are already imported in surrounding modules — `fs/promises` is the current convention inside `run-cycle.ts` per `readFile` at line 20).
- **`isResumeEntry` vs. retry**: SPEC explicitly clarifies that resume-entry (mid-step crash) is governed by `startStepIndex`, NOT by the skip gate. A resumed cycle whose `startStepIndex` points at `build` already bypasses spec/research/plan via the loop bounds; the skip gate runs on a *fresh* iteration of `runCycle` from `startIdx=0` where `opts.attempt > 0`.
- **`no_branch` workflows**: SPEC requires identical skip behavior for both branch and no-branch workflows. The artifact path resolution at `:158` is workflow-agnostic — same `artifactDir`. The reset policy at `:118` already gates on `!wf.no_branch`; SPEC's skip gate has no such gate.

### Test Infrastructure

- **Framework**: Node's native `node:test`, `node:assert/strict`, spec reporter. Imports look like `import { test } from "node:test"; import { strict as assert } from "node:assert";`.
- **Layout**: per-source-file test files in `tests/engine/`. Multiple test files per source are conventional (e.g., `run-cycle.test.ts`, `run-cycle.spec-guard.test.ts`, `run-cycle.documentation.test.ts`, `run-cycle.reflection.test.ts`, `run-cycle.step-end-stderr.test.ts`). SPEC's new tests would naturally land as `tests/engine/run-cycle.skip-completed.test.ts` (or similar) alongside.
- **Mocking strategy**: no Jest/Sinon; tests build a temp repo and stub the `claude` binary by writing a shell script onto a temp directory and prepending it to `PATH` via `runCycle({env})`. Bash steps are stubbed by writing actual shell scripts into `.cycle/scripts/`. See `tests/engine/run-cycle.test.ts:32-64`.
- **Coverage tooling**: `npm run test:coverage` produces `.cycle/coverage.lcov` and runs `scripts/coverage-gate.mjs` (`posttest:coverage`). Per-file floor enforced for `src/engine/triage.ts ≥ 95%`; global floors per `CLAUDE.md` are line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- **`parseLogTail` test pattern**: `tests/engine/log-tail.test.ts` builds synthetic newline-joined JSONL via an `ev()` helper and invokes `parseLogTail(text)` directly — see `tests/engine/log-tail.test.ts:41-117`. The new "step.skipped counts toward completedSteps" test follows this exact pattern.
- **Stubbing the agent dispatcher**: SPEC suggests asserting "agent NOT invoked for spec/research/plan when skipped." The lowest-friction approach uses the existing fake-`claude`-on-PATH pattern — if the agent is stubbed to fail (e.g. `exit 1`), the skip gate must short-circuit before the dispatcher runs, observable as no `step.start` for those steps in `log.jsonl`. No new mocking primitive needed.
- **Current coverage of the change area**: `run-cycle.ts` is already exercised heavily (5+ test files). Adding skip-branch tests will require both the positive (skip fires) and the negative (gate disabled / attempt=0 / zero bytes / artifact absent) cases to keep branch coverage at the global floor.

## Code References

- `src/engine/run-cycle.ts:23` — `RESET_ELIGIBLE_STEPS` constant; existing precedent for per-step-name policy gating.
- `src/engine/run-cycle.ts:63-70` — `RunCycleOpts` type, must be extended with `attempt` and `skipCompletedOnRetry` (or one resolved boolean).
- `src/engine/run-cycle.ts:111-141` — workflow-step loop body up through `step.start` emit; new skip gate inserts before line 136's `step.start` emit and `continue`s after emitting `step.skipped`.
- `src/engine/run-cycle.ts:156-168` — artifact write seam, source of truth for the `<artifactDir>/<STEP>.md` path the gate must `stat`.
- `src/engine/run-cycle.ts:182-190` — non-fatal terminal step pattern (`reflection.skipped` / `documentation.skipped`), shape precedent for `step.skipped`.
- `src/engine/log-tail.ts:47-57` — `completedSteps` accumulator; must also accept `step.skipped`.
- `src/engine/log.ts:8-18` — `Logger.emit` seam used by every event in `runCycle`.
- `src/cli.ts:307-313` — resume call site into `runCycle`.
- `src/cli.ts:320` — `row!.attempt` (retry attempt count in scope for resume path).
- `src/cli.ts:399-404` — fresh-pop call site into `runCycle`.
- `src/cli.ts:412` — `row.attempt + 1 < maxAttempts` (attempt count in scope for fresh-pop path).
- `src/cli.ts:287-294` — `startStepIndex` calculation that consumes `tail.completedSteps`.
- `src/cli/parse-args.ts:54-72` — `run` command parser, where `--no-skip-completed` must be added.
- `src/engine/workflow.ts:21-24` — `EngineConfig` type, where `skip_completed_on_retry?: boolean` would land.
- `src/engine/queue.ts:6-15` — `QueueRow` type, source of the `attempt` value.
- `tests/engine/run-cycle.test.ts:15-77` — `workflowYml` helper and canonical `runCycle` temp-repo test shape.
- `tests/engine/log-tail.test.ts:41-117` — synthetic-JSONL test pattern for parser changes.
- `docs/cycle/0070-feature-retry-economics-skip-pre-build-steps-who/SPEC.md` — authoritative spec.

## Open Questions

- **Default workflow vs. attempt threading on resume**: SPEC says "Resume entry is orthogonal — a resumed cycle that's mid-step is governed by `startStepIndex`, not by this skip gate." This is satisfied because the resume call site passes `resume: {startStepIndex}` and the loop body starts at `startIdx`. But should the resume call site still thread `attempt`? The reset-policy code uses `isResumeEntry = !!opts.resume && i === startIdx` to gate self-heal, and that flag distinguishes "resume of in-flight cycle" from "fresh retry pop." The plan step needs to decide whether `attempt` is unconditionally passed to `runCycle` (and the skip gate self-suppresses when `opts.resume` is set), or whether the resume call site passes `attempt: 0` to short-circuit the gate. Either reads cleanly; the plan should pick one.
- **Single resolved boolean vs. two opts**: `RunCycleOpts` could carry one resolved `skipCompletedOnRetry: boolean` (already merged with CLI override), or carry the raw inputs and resolve inside `runCycle`. The CLI-level resolution is cleaner because the resolved value lives next to logging at `engine.start` if we ever want to surface it. The plan should pick one.
- **`existsSync`+`statSync` vs. async `stat`**: `run-cycle.ts` already uses `node:fs/promises` (`readFile` / `writeFile`). Mixing in `node:fs` sync helpers is the minimum-diff path but breaks the all-async convention in this file. Plan should choose.
- **Whether the `step.skipped` event payload includes `agent`**: existing `step.start` events carry `agent` (`src/engine/run-cycle.ts:139`). SPEC fixes the payload shape to `{event, ts, cycle_id, step, reason, artifact_path}` — no `agent` field. Confirming this is intentional (the SPEC text is explicit, so probably yes) is worth a single re-read by the plan step.
- **`docs/RFC-001-issue-lifecycle.md` vs. `docs/ARCHITECTURE.md` for the documentation step**: SPEC says "describe the skip gate, event, opt-out, and the reason it's bounded to pre-build steps" in whichever already owns retry semantics. Both files exist; the plan/documentation step should grep for `attempt`/`retry`/`max_cycle_attempts` to find the current owner before writing.
