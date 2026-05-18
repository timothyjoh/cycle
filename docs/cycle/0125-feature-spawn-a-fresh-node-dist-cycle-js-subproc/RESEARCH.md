Now I have everything. Writing the research document.

```markdown
# Research: Cycle 0125

## Cycle Context

SPEC.md scopes cycle 0125 to splitting the monolithic `src/cli.ts` engine into two layers: a long-lived **supervisor** that owns the triage→pop→drain loop and consecutive-failure counter, and a short-lived **inner runner** (`run-one` CLI subcommand) that executes a single `runCycle()` call and exits with a structured exit code (0=ok, 1=retry, 2=terminal). The supervisor spawns `node dist/cycle.js run-one <args>` (array args, no shell) per cycle pop and maps the exit code to existing `terminalDrain`/`retryDrain` branches. Log safety is handled by POSIX `O_APPEND` — no lock file needed. Tests must cover exit-code mapping, spawn arg shape, and no-shell regression.

## Current Codebase State

### Relevant Components

- **Supervisor / drain loop**: `src/cli.ts:320-412` — `while (!halted)` loop that calls `popNextPending()`, `markInProgress()`, then `runCycle()` directly (line 359), then `commitCycle()` (line 370). All in-process.
- **Resume path**: `src/cli.ts:156-282` — `runResumeOnce()` function; reads log tail, computes `startStepIndex`, calls `runCycle()` with `resume: { startStepIndex }` (line 246). Also calls `commitCycle()` inline (line 258).
- **Inner cycle runner**: `src/engine/run-cycle.ts:97-292` — `runCycle(repoRoot, opts)` exported function. Accepts `opts.resume.startStepIndex` for resume. Returns `{ cycleId, status: "ok" | "failed", failingStep? }`.
- **CLI arg parser**: `src/cli/parse-args.ts:19-76` — only knows `run` and `drop` subcommands; no `run-one` subcommand exists yet.
- **Commit lifecycle**: `src/engine/commit-cycle.ts` — `commitCycle()` called by supervisor in `cli.ts` after `runCycle()` returns (lines 258, 370). Owns git commit/push/PR logic.
- **Logger**: `src/engine/log.ts:8-18` — `createLogger()` appends to `.cycle/log.jsonl` via `appendFile()`. Both supervisor and inner runner can write to the same file concurrently since `appendFile` maps to POSIX `O_APPEND`.
- **Stale-dist warning**: `src/engine/stale-dist.ts:7-30` — `emitStaleDistWarning()` called at supervisor start (`cli.ts:94`). With process-per-cycle, this is superseded (each spawn gets fresh dist), but the module stays for now.
- **`skipCompletedOnRetry` flag**: computed in supervisor at `cli.ts:91-92` from config and `--no-skip-completed` CLI arg. Currently passed to `runCycle()` directly (line 363 / 252). Must be forwarded to inner runner via CLI arg.
- **Consecutive failure counter**: `cli.ts:120-124` — `consecutiveFailures`, `failedCycles`, `halted`, `lastHaltContext` — all live in supervisor's module-level scope. Stay in supervisor per SPEC.
- **`markInProgress()`**: called in supervisor before `runCycle()` at `cli.ts:357` (main loop) and `cli.ts:235` (resume). Stays in supervisor.
- **`buildChildEnv()`**: `src/engine/child-env.ts:16-27` — prepends parent Node binary dir to PATH. Used by all existing spawn calls (`execBashStep`, `claudecodeExec`). Inner runner spawn must use this.

### Existing Patterns to Follow

- **Spawn with array args, no shell**: `execBashStep` uses `spawn("/bin/bash", [abs], { shell: false })` — `src/engine/exec-bash.ts:15`; `claudecodeExec` uses `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], { shell: false })` — `src/engine/exec-claudecode.ts:13`. Planner must use the same pattern.
- **`buildChildEnv()` for PATH**: all subprocess spawns pass `env: buildChildEnv(env ?? {})` to guarantee correct Node binary resolution — `src/engine/child-env.ts:16`.
- **Subcommand dispatch in `cli.ts`**: existing subcommands (`init`, `status`, `triage`) are handled with `if (argv[0] === "<name>")` guards at the top of `src/cli.ts:45-65`, before `parseArgs()` is called. `run-one` will need a similar early dispatch.
- **`StepResult` shape** (`{ status, exitCode, stdout, stderr }`) is the contract between exec modules and the step runner — `src/engine/exec-bash.ts:5-9`. The inner runner's exit code contract is analogous but simpler (integer only, no stdout relay needed by supervisor).
- **CLI integration tests** invoke `spawnSync("node", [distPath, "run"], { cwd: root, encoding: "utf8" })` — `tests/cli/halt.test.ts:105`, `tests/cli/multi-loop.test.ts:45`. New tests for `run-one` follow this same pattern.
- **`ensureDist()` helper**: present in all CLI test files (`tests/cli/resume.test.ts:10-13`, `tests/cli/halt.test.ts:10-13`) — reads `dist/cycle.js` to confirm build is present before spawning.

### Dependencies & Integration Points

- `src/cli.ts` imports `runCycle` from `src/engine/run-cycle.ts` (line 8) and `commitCycle` from `src/engine/commit-cycle.ts` (line 23). After refactor, supervisor no longer needs the `runCycle` import — only inner runner uses it.
- `src/cli.ts` imports `terminalDrain` from `src/engine/issue-lifecycle.ts` (line 24) and queue ops from `src/engine/queue.ts` (lines 11-16). These all stay in supervisor.
- `src/engine/run-cycle.ts` imports `createLogger` internally (line 3) — inner runner also calls `createLogger` independently, writing to same `.cycle/log.jsonl`.
- `RunCycleOpts.baseBranch` (optional, `src/engine/run-cycle.ts:93`) is derived from issue frontmatter in supervisor (`cli.ts:342-348`). Must be read by supervisor and passed to inner runner as a CLI flag.
- `cfg` (loaded via `loadConfig()`) is used by both supervisor (triage, queue policy, `max_consecutive_failures`) and the existing `runCycle()` (workflow step lookup). Inner runner re-loads config independently.

### Test Infrastructure

- **Test framework**: Node built-in `node:test`, invoked via `npm test` → `node --test --experimental-strip-types`
- **Test layout**: CLI integration tests in `tests/cli/` (8 files); engine unit tests in `tests/engine/` (30+ files)
- **CLI test pattern**: bootstrap a temp git repo, write `.cycle/workflows.yml` + bash scripts, seed `tbd.jsonl`, invoke `spawnSync("node", [distPath, "run"])`, assert on log events — `tests/cli/halt.test.ts`, `tests/cli/multi-loop.test.ts`, `tests/cli/resume.test.ts`
- **Spawn shape tested via**: `tests/engine/exec-bash.test.ts` (tests that `shell: false` is in effect); new test for inner runner spawn must assert same
- **Coverage floors** (`scripts/coverage-gate.mjs:13-18`): `src/engine/triage.ts` ≥95%, `src/engine/issue-lifecycle.ts` ≥95%, `src/engine/commit-cycle.ts` ≥95%, `src/engine/branch.ts` ≥90%, `src/engine/stale-dist.ts` ≥95%. No floor yet for `src/cli.ts` or any new `src/cli/run-one.ts` module — planner must decide whether to add one.
- **`dist/cycle.js`** is built by `node scripts/build.mjs` (esbuild, `src/cli.ts` as entry). Inner runner logic landed in the same bundle via the same entry point.

## Code References

- `src/cli.ts:38` — `const processStart = Date.now();` (used for stale-dist check; irrelevant to inner runner)
- `src/cli.ts:91-92` — `skipCompletedOnRetry` derivation from config + CLI flag
- `src/cli.ts:119-125` — supervisor-level state: `cyclesProcessed`, `consecutiveFailures`, `failedCycles`, `halted`, `haltReason`, `lastHaltContext`
- `src/cli.ts:156-282` — `runResumeOnce()`: entire resume path; calls `runCycle()` + `commitCycle()` inline
- `src/cli.ts:235` — `markInProgress()` call in resume path
- `src/cli.ts:246-253` — `runCycle()` call in resume path
- `src/cli.ts:320-412` — main drain `while` loop; pop → markInProgress (357) → runCycle (359) → commitCycle (370)
- `src/cli.ts:422-431` — `engine.halted` emit and `process.exit(halted ? 1 : 0)`
- `src/cli/parse-args.ts:55` — throws on unknown command (`argv[0]`); `run-one` not yet handled
- `src/engine/run-cycle.ts:85-95` — `RunCycleOpts` type; `resume.startStepIndex` is the resume entry point
- `src/engine/run-cycle.ts:97` — `runCycle()` export signature
- `src/engine/run-cycle.ts:262-263` — `cycle.end` emit + return `{ status: "ok" }` on success
- `src/engine/run-cycle.ts:257-258` — `cycle.end` emit + return `{ status: "failed", failingStep }` on step failure
- `src/engine/log.ts:8` — `createLogger()` uses `appendFile` → safe for multi-process concurrent writes
- `src/engine/exec-bash.ts:15` — canonical spawn pattern: array args, `shell: false`
- `src/engine/child-env.ts:16` — `buildChildEnv()` prepends Node bin dir
- `tests/cli/halt.test.ts:105` — `spawnSync("node", [distPath, "run"], ...)` — integration test invocation pattern
- `tests/cli/resume.test.ts:10-13` — `ensureDist()` helper used by all CLI tests

## Open Questions

1. **`commitCycle()` ownership**: Does `commitCycle()` move into the inner runner (so exit code already reflects commit success/failure), or stay in the supervisor (supervisor reads exit 0 from inner runner, then calls `commitCycle()` itself)? The issue file says "inner runner exits 0 on `cycle.end status:'ok'`" — implying `commitCycle` stays in supervisor. The planner must confirm and document the boundary explicitly.
2. **Inner runner stdout/stderr relay**: Does the supervisor pipe or inherit the inner runner's stdout/stderr? `cli.ts` currently emits JSON log events via `createLogger` (appends to file + `console.log` sink). If inner runner also logs via `createLogger`, events appear in the file automatically. But supervisor's `console.log` sink would miss inner runner output. Does that matter?
3. **`--resume-from-step` arg shape**: issue file says `--resume-from-step <N>` (integer step index). The planner needs to confirm whether this is an index or a step name, since `runCycle` accepts `startStepIndex` (integer).
4. **Flags to forward**: supervisor derives `baseBranch` from issue frontmatter (read at `cli.ts:340-348`); `skipCompletedOnRetry` from config+args (`cli.ts:91-92`); `workflow` from frontmatter or CLI default. All must be passed as flags to inner runner. Planner must enumerate the full flag set.
5. **Coverage floor for new inner runner module**: if a new `src/cli/run-one.ts` is created, does it need a per-file floor added to `scripts/coverage-gate.mjs`?
6. **`engine.resume` event ownership**: currently emitted in `runResumeOnce()` at `cli.ts:236-241` in supervisor, before calling `runCycle()`. After refactor it may move to inner runner (since inner runner calls `runCycle()`). Planner must decide.
```
