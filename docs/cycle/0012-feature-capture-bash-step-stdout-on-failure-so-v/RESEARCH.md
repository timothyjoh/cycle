I have everything needed.

```markdown
# Research: Cycle 0012

## Cycle Context
This cycle makes a failed `bash` step self-diagnosable from the engine's own output. Today a failed bash step's `step.end` event records only a head-capped `stderr` slice (`MAX_STEP_END_STDERR = 2000`), but test runners and build tools print failure detail to **stdout**, so a failure surfaces as `exit_code: 1, stderr: ""` with the cause invisible. The change adds a head-capped `stdout` excerpt to the `step.end` event on bash-step failure, and persists the full captured `stdout`+`stderr` to a per-cycle artifact (`<artifactDir>/<step>.out`) with a pointer field in the event — while leaving the success path completely unchanged and never masking the original step failure if the artifact write itself fails.

## Current Codebase State

### Relevant Components
- Bash step execution: `execBashStep(repoRoot, command, env)` spawns `/bin/bash <abs>`, accumulates `stdout` and `stderr` strings from the child streams, and resolves a `StepResult` carrying both — `src/engine/exec-bash.ts:15-36`.
- `StepResult` type: `{ status, exitCode, stdout, stderr, rateLimited?, timedOut? }` — already carries full `stdout` and `stderr` — `src/engine/exec-bash.ts:5-13`.
- Step dispatch & `step.end` emission: the per-step loop in `runCycle` dispatches `bash` steps via `execBashStep` (`src/engine/run-cycle.ts:372-373`) and emits the single terminal `step.end` event at `src/engine/run-cycle.ts:493-502`.
- Head-cap helper: `truncateHeadCapped(s, max)` — slices to `max-1` chars + `…` when over `max` — `src/engine/log-fmt.ts:1-3`.
- Cap constant: `MAX_STEP_END_STDERR = 2000` — `src/engine/run-cycle.ts:177`.
- Per-cycle artifact directory: `artifactDir` is computed once per run (trunk mode via `prepareTrunkArtifactDir`, worktree-pr mode via `createCycleBranch`/`checkoutCycleBranch`) at `src/engine/run-cycle.ts:245-266`. It is the directory where agent `<STEP>.md` artifacts are written (e.g. `join(artifactDir, \`${step.name.toUpperCase()}.md\`)` at `src/engine/run-cycle.ts:413`).

### The current `step.end` emission (the seam this cycle modifies)
`src/engine/run-cycle.ts:493-502`:
```
await log.emit("step.end", {
  cycle_id: cycleId,
  step: step.name,
  status: r.status,
  exit_code: r.exitCode,
  duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
  ...(r.status === "failed"
    ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) }
    : {}),
});
```
- The `stderr` field is conditionally spread **only** when `r.status === "failed"`; successful events omit it entirely. The gate is `r.status === "failed"`, not `r.stderr` truthiness.
- This single emission site serves **all** step kinds (agent and bash). Distinguishing bash from agent requires `step.agent === "bash"` (the pattern used at `src/engine/run-cycle.ts:372`, `:410`, `:358`).
- The success branch (`r.status === "ok"`) currently spreads nothing — the planner must keep it spreading nothing so no `.out` artifact is written and no new fields appear on the happy path.

### Existing Patterns to Follow
- Agent artifact-write pattern: `const artifactPath = join(artifactDir, \`${step.name.toUpperCase()}.md\`); await writeFile(artifactPath, sanitized, "utf8");` — `src/engine/run-cycle.ts:412-414`. `writeFile`/`readFile`/`stat` are imported from `node:fs/promises` at `src/engine/run-cycle.ts:21`. This is the canonical filename-from-step-name + `writeFile` idiom; the new `.out` filename would be derived as `join(artifactDir, \`${step.name}.out\`)` (note: the SPEC example `verify.out` is lowercase step name, unlike the uppercased `.md` artifacts).
- Conditional event-field spread: the `...(condition ? { field: value } : {})` idiom is used throughout (`src/engine/run-cycle.ts:351`, `:499-501`) — the established way to add a field only on a given branch.
- Failure handling — bash steps have no try/catch: `execBashStep` is awaited directly with no surrounding try/catch (`src/engine/run-cycle.ts:372-373`); only the **agent** branch wraps dispatch in try/catch for `UnknownAgentError` (`src/engine/run-cycle.ts:374-392`). A non-zero bash exit is reported purely via `StepResult.status === "failed"` (`src/engine/exec-bash.ts:27-33`); there is no thrown error on bash failure.
- Failure routing: after `step.end`, `r.status === "failed"` for an ordinary step (not `reflection`/`documentation`) emits `cycle.end { status: "failed", failing_step }` and returns `{ cycleId, artifactDir, status: "failed", failingStep }` — `src/engine/run-cycle.ts:503-514`. The planner must preserve this terminal-failure routing with the original `exit_code` even when the `.out` write fails.
- Best-effort side-effect pattern (relevant to "artifact-write must not mask the failure"): existing best-effort writes that must never fail the cycle are wrapped in `try { … } catch { /* never fail the cycle */ }` — see documentation append (`src/engine/run-cycle.ts:482-486`) and touched-files accumulation (`src/engine/run-cycle.ts:487-491`). This is the idiom for degrading an artifact-write failure rather than throwing.
- Failure handling — timeouts: `r.timedOut` is surfaced via a separate `step.timeout` event (`src/engine/run-cycle.ts:407-409`); the salvage path (`timeout_salvaged`) applies only to agent steps inside `STEP_ARTIFACTS` (`src/engine/run-cycle.ts:450-456`). `execBashStep` does not set `timedOut` (no timeout wiring in `src/engine/exec-bash.ts`).
- Failure handling — rate limits: the `while (true)` retry loop (`src/engine/run-cycle.ts:371-403`) retries on `r.rateLimited`; bash `StepResult` never sets `rateLimited`, so bash steps fall straight through to `break`.
- Observability: all events go through `Logger.emit(event, fields)`, which JSON-stringifies `{ ts: <ISO>, event, ...fields }` and appends one line to `.cycle/log.jsonl` — `src/engine/log.ts:8-18`. Every new field is a top-level key in that object. Existing `step.end` fields: `cycle_id`, `step`, `status`, `exit_code`, `duration_ms`, and (failure-only) `stderr`.
- Idempotency / retry-safety: the retry-skip gate (`shouldSkipForArtifact`, `src/engine/run-cycle.ts:291-302`) and completion-proof contract apply only to non-bash steps (`step.agent !== "bash"` guards at `:291` and `:410`). Bash steps are excluded from all artifact/skip/proof machinery, so the `.out` artifact is a pure observability side-effect with no skip/dedup interaction. A re-run of the same cycle would simply overwrite `<step>.out` via `writeFile` (last-write-wins, same path).
- Naming the artifact: bash steps are guaranteed to have `step.name` and `step.command` (`step.command!` is non-null-asserted at `src/engine/run-cycle.ts:373`). `step.name` is used unquoted in event payloads throughout.

### Dependencies & Integration Points
- `truncateHeadCapped` — `src/engine/log-fmt.ts` (imported at `src/engine/run-cycle.ts:23`); reuse for the new `stdout` excerpt.
- `MAX_STEP_END_STDERR` — `src/engine/run-cycle.ts:177` (exported); the same cap may apply to the `stdout` excerpt, or a sibling constant may be introduced.
- `writeFile` from `node:fs/promises` — `src/engine/run-cycle.ts:21`; used for the `.out` artifact.
- `join` from `node:path` — `src/engine/run-cycle.ts:22`; used for the artifact path.
- `artifactDir` — `src/engine/run-cycle.ts:245-266`; the directory the `.out` file is written into. It already exists by the time steps run (created during branch/trunk dir setup before the step loop).
- `StepResult.stdout` / `.stderr` — `src/engine/exec-bash.ts:5-13`; the source data, already populated by `execBashStep`.
- `Logger.emit` — `src/engine/log.ts:11-17`; the only event-emission path.
- No new external services or environment variables are required (per SPEC Dependencies).

### Test Infrastructure
- Test framework: Node's built-in `node:test` runner with `node:assert` (`strict`), run via `--experimental-strip-types` (no transpile). See `tests/engine/run-cycle.step-end-stderr.test.ts:1-2`, `tests/engine/exec-bash.test.ts:1-2`.
- Test conventions: tests live in `tests/engine/`; integration tests drive `runCycle` end-to-end against a real temp git repo. The canonical harness for bash-step `step.end` assertions is `tests/engine/run-cycle.step-end-stderr.test.ts` — it provides `workflowYml(stepsBody)` (`:15-31`), `setupRepo(stepsBody, scripts)` which `git init -b main`, writes `.cycle/workflows.yml`, and writes executable scripts to `.cycle/scripts/` (`:33-48`), and `findStepEnd(log, stepName)` which parses `.cycle/log.jsonl` and returns the matching `step.end` object (`:50-61`). Cycles run with `env: { CYCLE_BASE: "main" }` and `commit.mode: trunk`.
- This harness already exercises the three current bash-step `step.end` behaviors: success omits `stderr` (`tests/engine/run-cycle.step-end-stderr.test.ts:63-87`), failure carries verbatim `stderr` below cap (`:89-114`), failure head-caps `stderr` at 2000 chars with trailing `…` (`:116-146`). New `stdout`/`.out`-artifact tests can be added to the same file or a sibling using the same harness.
- Unit-level bash execution: `tests/engine/exec-bash.test.ts` verifies `execBashStep` captures stdout on success (`:8-22`) and reports `failed` + `exitCode` on non-zero exit (`:24-38`).
- Filesystem-failure injection: the project convention (CLAUDE.md "Test conventions") is that `node:fs/promises` **cannot** be stubbed via `mock.method` (non-configurable ESM exports). To force the `.out` write to fail, the established approach is real-filesystem manipulation — `chmod` an unwritable directory or point at a non-existent path (`chmod` is already imported in the stderr test harness, `tests/engine/run-cycle.step-end-stderr.test.ts:3`). `tests/engine/dot-env.test.ts` is cited as the working `mock.method` example for the CJS `node:fs` module.
- Failure-path test coverage for the change area: the three existing `step.end` stderr tests are all failure-path tests; there is currently **no** test asserting a bash-step `stdout` excerpt, no test for a `.out` artifact, and no test for an artifact-write failure during a bash step (these are the new scenarios this cycle adds, enumerated in the SPEC Testing Strategy).
- Coverage floor the planner must hold: `src/engine/run-cycle.ts` ≥ 90% (CLAUDE.md per-file floors; SPEC Acceptance Criteria). Enforced via `npm run check:coverage` against `.cycle/coverage.lcov`. `npm run typecheck` must be clean.

## Code References
- `src/engine/exec-bash.ts:5-13` — `StepResult` type; already carries `stdout`/`stderr`.
- `src/engine/exec-bash.ts:15-36` — `execBashStep`; spawns bash, accumulates both streams, resolves `StepResult` (no timeout, no throw on non-zero exit).
- `src/engine/run-cycle.ts:21-24` — imports: `writeFile`/`readFile`/`stat` from `node:fs/promises`, `join` from `node:path`, `truncateHeadCapped` from `./log-fmt.ts`.
- `src/engine/run-cycle.ts:177` — `MAX_STEP_END_STDERR = 2000`.
- `src/engine/run-cycle.ts:372-373` — bash-step dispatch (`r = await execBashStep(...)`).
- `src/engine/run-cycle.ts:410` — `if (step.agent !== "bash")` guard wrapping all agent-only artifact/proof logic; bash steps skip this block entirely.
- `src/engine/run-cycle.ts:412-414` — canonical artifact-path + `writeFile` idiom for agent `<STEP>.md` files.
- `src/engine/run-cycle.ts:482-491` — best-effort `try/catch { /* never fail the cycle */ }` side-effect pattern.
- `src/engine/run-cycle.ts:493-502` — the `step.end` emission; conditional `stderr` spread on `r.status === "failed"`.
- `src/engine/run-cycle.ts:503-514` — terminal-failure routing (`cycle.end status:failed` + return) for non-`reflection`/`documentation` steps.
- `src/engine/log.ts:11-17` — `emit` writes `{ ts, event, ...fields }` as one JSON line to `.cycle/log.jsonl`.
- `src/engine/log-fmt.ts:1-3` — `truncateHeadCapped`.
- `tests/engine/run-cycle.step-end-stderr.test.ts` — full integration harness for bash-step `step.end` assertions (`workflowYml`, `setupRepo`, `findStepEnd`).
- `tests/engine/exec-bash.test.ts` — unit tests for `execBashStep`.
- `docs/ENGINE.md:183-185` — current "Failed step.end stderr" documentation (the doc section the SPEC says to update).

## Open Questions
- **Cap constant for `stdout`**: the SPEC requires capping by `truncateHeadCapped(stdout, MAX)` but does not state whether to reuse `MAX_STEP_END_STDERR` (2000) or introduce a separate constant. The SPEC's Out-of-Scope explicitly forbids changing `MAX_STEP_END_STDERR`'s value or the `stderr` behavior — reusing the constant for `stdout` is consistent with that, but a planner may prefer a sibling `MAX_STEP_END_STDOUT`.
- **`.out` filename casing**: the SPEC example is `verify.out` (lowercase `step.name`), whereas existing `.md` artifacts are uppercased (`VERIFY.md`). The planner should confirm the exact derivation (`${step.name}.out` vs `${step.name.toUpperCase()}.out`).
- **Pointer field name & path form**: the SPEC says the `step.end` event carries "a pointer field (the artifact path)" but does not fix the field key (e.g. `stdout_artifact`, `output_artifact`) or whether the path is absolute (as produced by `join(artifactDir, …)`) or repo-relative. Existing events use absolute `artifactPath` values internally (e.g. completion-proof `artifact` field at `src/engine/run-cycle.ts:443`).
- **Full-artifact content layout**: the SPEC requires "full captured stdout+stderr" in one `.out` file (and a "header-only" file when both are empty) but does not prescribe the exact serialization (delimiters/headers between the stdout and stderr sections). The planner must decide the on-disk format.
- **Scope to bash only vs. all failed steps**: the SPEC scopes the change to `bash` steps and excludes agent steps. The shared emission site at `src/engine/run-cycle.ts:493` serves both, so the new logic must be gated on `step.agent === "bash"` to avoid touching agent `step.end` events.
```
