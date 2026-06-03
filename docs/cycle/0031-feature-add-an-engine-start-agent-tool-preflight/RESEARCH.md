# Research: Cycle 0031

## Cycle Context

SPEC.md requires a new engine-start **preflight gate** that runs once after lock acquisition and config load but before triage and the first cycle. The gate computes the distinct agent set (the active workflow's steps **plus triage**), probes each agent CLI (`<bin> --version` via `spawnSync`, resolving binaries identically to the exec lanes — honoring `CYCLE_<AGENT>_BIN` overrides), confirms required external tools (`bash`, `git` always, plus statically detectable tools that configured bash steps invoke) resolve on PATH, and detects the WSL `/mnt/c` shadow condition as a non-fatal warning. On any failure it emits a cardinality-pinned `engine.preflight.failed` event (with a `failures` payload of agent/tool, resolved path, and fix string), emits a terminal `engine.stop { status: "halted", reason: "preflight_failed" }`, and exits non-zero before any `cycle.start`. On success it emits `engine.preflight.ok` exactly once and proceeds unchanged. A `--skip-preflight` opt-out flag bypasses the gate entirely. New module `src/engine/preflight.ts`, wired into `src/cli.ts`, with `tests/engine/preflight.test.ts` and a new coverage floor.

## Current Codebase State

### Relevant Components

- **Agent registry / binary dispatch**: `REGISTRY` maps agent name → `ExecModule`; `knownAgents()` returns `Object.keys(REGISTRY)`; `resolveAgent(name)` throws `UnknownAgentError` for unknown names — `src/engine/exec.ts:45-62`. The keys are `auggie`, `claudecode`, `codex`, `gemini`, `opencode`, `pi` (`bash` is dispatched separately, not via the registry).
- **Per-lane binary resolution** (the pattern the gate must mirror): each exec lane resolves `process.env.CYCLE_<AGENT>_BIN ?? "<binary>"`:
  - `claudecode` → `process.env.CYCLE_CLAUDE_BIN ?? "claude"` — `src/engine/exec-claudecode.ts:26` (**note: agent name `claudecode`, env var `CYCLE_CLAUDE_BIN`, binary `claude` — name ≠ binary ≠ env-var-stem**)
  - `codex` → `process.env.CYCLE_CODEX_BIN ?? "codex"` — `src/engine/exec-codex.ts:14`
  - `gemini` → `process.env.CYCLE_GEMINI_BIN ?? "gemini"` — `src/engine/exec-gemini.ts:14`
  - `auggie` → `process.env.CYCLE_AUGGIE_BIN ?? "auggie"` — `src/engine/exec-auggie.ts:10`
  - `opencode` → `process.env.CYCLE_OPENCODE_BIN ?? "opencode"` — `src/engine/exec-opencode.ts:15`
  - `pi` → `process.env.CYCLE_PI_BIN ?? "pi"` — `src/engine/exec-pi.ts:11`
- **Subprocess env construction**: `buildChildEnv(extra)` strips all `CYCLE_*` vars by prefix, prepends the parent Node's bin dir (`dirname(process.execPath)`) to PATH, and overlays `extra` — `src/engine/child-env.ts:16-33`. Re-injection contract: any `CYCLE_*` var a subprocess needs must be passed via `extra`.
- **Engine startup sequence** (`src/cli.ts`): lock acquisition (`acquireLock(lockPath)`) — `src/cli.ts:178-185`; signal handlers — `186-200`; logger creation (`createLogger(cwd)`) — `189`; dir setup — `202-207`; trunk/dotenv/config load (`loadDotEnv`, `loadConfig`) — `209-211`; `engine.start` emit — `217`; **`runTriage` call** — `219-230`; resume path — `462-483`; main drain loop — `486-655`; terminal `engine.stop` emit and `process.exit` — `665-674`. The gate must be wired in after line 211 (config load) / after `engine.start` and **before** the `if (cfg)` triage block at line 219.
- **Triage agent source**: triage uses `cfg.triage.agent` (a string) dispatched via `resolveAgent(cfg.agent)` — `src/engine/triage.ts:801`. The `TriageConfig` type carries `agent: string` — `src/engine/workflow.ts:62-66`. In the shipped config triage's agent is `claudecode` — `.cycle/workflows.yml:16`.
- **CLI arg parsing**: `parseArgs(argv)` builds `RunArgs` via `nodeParseArgs`; current `RunArgs` fields are `command/text/workflow/dryRun/noSkipCompleted/trunk` — `src/cli/parse-args.ts:3-10`, `19-64`. New `--skip-preflight` boolean option is added to the `options` map (line 44-51) and the `RunArgs` type/return object.
- **Workflow / step model**: `Step.agent` union (`claudecode|bash|codex|gemini|auggie|opencode|pi`), optional `command` (bash steps), `prompt` — `src/engine/workflow.ts:6-14`. `Workflow.steps` — `21-26`. `loadConfig` resolves top-level `defaults` into each step's `agent`, so every step has a concrete `step.agent` by the time the gate reads the config — `src/engine/workflow.ts:126-153`. `validAgents = new Set([...knownAgents(), "bash"])` — `135`.
- **Feature workflow steps** (the active workflow): agent steps (`spec`, `research`, `plan`, `build`, `review`, `fix`, `reflection`, `final_fix`, `documentation`) all run `claudecode`; bash steps `verify`/`final_verify` run `scripts/verify.sh`; `walkthrough_capture` is `agent: bash` with no command — `.cycle/workflows.yml:31-42`. Bash-step commands point at `scripts/*.sh` files under `.cycle/scripts/`.

### Existing Patterns to Follow

- **Subprocess discipline**: always `spawn`/`spawnSync` with array args, `shell: false`, env via `buildChildEnv`. `runAgent` spawns with `{ cwd, env: buildChildEnv(env ?? {}), shell: false, ... }` — `src/engine/exec-spawn.ts:29`, `40-43`. The gate's `--version` probes must use `spawnSync` with array args and `buildChildEnv`.
- **Binary resolution mirror**: to resolve a probe's binary, the gate must read `CYCLE_<AGENT>_BIN ?? "<binary>"` per the table above. For `claudecode` the binary token is `claude`, not `claudecode`.
- **Cardinality-pinned events**: exactly-once engine events are asserted via `filter(predicate).length === 1`; the `expectExactlyOne(events, eventName)` helper asserts `length === 1` and returns the matched event — `tests/helpers.ts:3-10`. Canonical examples `engine.halted`/`reflection.summary`. The new `engine.preflight.ok`/`engine.preflight.failed` events follow this.
- **Event emission**: `log.emit(event, fields)` appends a JSON line `{ ts, event, ...fields }` to `.cycle/log.jsonl` and echoes to the sink — `src/engine/log.ts:11-17`. Existing events use snake_case field names (e.g. `engine.stop { status, dry_run, cycles_processed, reason }` — `src/cli.ts:665-673`; `engine.halted { failed_cycles, reason, threshold }` — `657-663`).
- **Halt-via-stop pattern**: existing terminal halts emit a final `engine.stop` with `status: "halted"` and a `reason`, then `process.exit(1)` — e.g. the triage-failed path emits `engine.stop { status: "halted", reason: "triage_failed" }` and `process.exit(1)` — `src/cli.ts:221-229`. The SPEC's `engine.stop { status: "halted", reason: "preflight_failed" }` + non-zero exit mirrors this exact shape.
- **Defensive config read at the read site**: malformed/absent config values are coerced defensively where read (never crash) — e.g. `min_step_duration_ms` resolution at `src/cli.ts:543-545`; `max_consecutive_failures ?? 2` at `247`.
- **Failure handling**: the engine's existing posture is "never a raw stack trace to the user." `runAgent`'s `child.on("error")` resolves a `StepResult { status: "failed", exitCode: -1, stderr: err.message }` rather than rejecting — `src/engine/exec-spawn.ts:65-67`. Lock-acquire failure is caught and exits 1 with the message — `src/cli.ts:179-184`. The gate must likewise catch unexpected internal errors and surface them as a preflight failure.
- **Observability**: structured JSONL events in `.cycle/log.jsonl` are the sole observability channel; no metrics system. The gate adds `engine.preflight.ok` / `engine.preflight.failed` (with a `failures` array payload).
- **Idempotency / retry-safety**: single-engine exclusion is enforced by the PID lockfile `acquireLock`/`releaseLock` — `src/engine/engine-lock.ts:17-52`, acquired before the gate runs (`src/cli.ts:180`). The gate itself is a read-only startup probe (no state mutation, no dedup keys needed); it runs once per `cycle run` invocation.
- **No existing WSL detection**: there is no current `/proc/version`/`microsoft`/`/mnt/c` detection in `src/` (the only `/mnt/c` mention is an unrelated comment in `exec-claudecode.ts:9`). The WSL probe is new and, per SPEC, must be injectable for testability and degrade to "not WSL" on a missing/unreadable `/proc/version`.

### Dependencies & Integration Points

- `src/engine/exec.ts` — `knownAgents()` / `REGISTRY` (the agent-name set); `resolveAgent` (not strictly needed by the gate, which probes binaries directly).
- The six `exec-*.ts` lanes — source of the `CYCLE_<AGENT>_BIN ?? "<binary>"` resolution the gate must replicate (`src/engine/exec-claudecode.ts`, `exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`).
- `src/engine/child-env.ts` — `buildChildEnv` for curated probe env.
- `src/engine/workflow.ts` — `CycleConfig` (`engine`, `triage`, `workflows`, `defaults`), `Workflow`, `Step`; `loadConfig` already constructed in `cli.ts` (`cfg`) at `src/cli.ts:211`.
- `src/engine/log.ts` — `createLogger` / `Logger.emit`; `log` constructed at `src/cli.ts:189`.
- `src/cli/parse-args.ts` — `RunArgs` and `parseArgs`; new `--skip-preflight` flag.
- `src/cli.ts` — wiring point between config load (`211`) and triage (`219`); `args` is available (parsed at `144`).
- `scripts/coverage-gate.mjs` — new `FLOORS` entry for `src/engine/preflight.ts` (`FLOORS` table at lines 12-35).
- `scripts/structural-invariants.mjs` — the `INVARIANTS` table includes the agent-binary hermeticity rules (`process.env.CYCLE_<AGENT>_BIN ?? "<bin>"` per lane, lines 45-86; exec-test PATH-stub bans, lines 87-118). The preflight test must respect these — it must inject stub binaries via `CYCLE_<AGENT>_BIN` (or a controlled PATH passed through the module's seams), never PATH-stub real agent names in node's bin dir.

### Test Infrastructure

- **Test framework**: Node's built-in `node:test` + `node:assert` (`strict`), run under `--experimental-strip-types` (no transpile). Engine unit tests live in `tests/engine/`; CLI/integration tests in `tests/cli/`.
- **Test conventions**: temp-dir fixtures via `mkdtemp(join(tmpdir(), "cycle-..."))`; fake binaries written as `#!/bin/bash` scripts, `chmod 0o755`, injected via `CYCLE_<AGENT>_BIN` set/deleted in `try/finally` — exemplar `tests/engine/exec-codex.test.ts:16-43`. Exactly-once events asserted with `filter(...).length === 1` / `expectExactlyOne` (`tests/helpers.ts`).
- **CLI-level harness**: `tests/cli/halt.test.ts` spawns the built `dist/cycle.js` via `spawnSync` against a bootstrapped temp git repo (`bootstrapRepo` writes `.cycle/workflows.yml`, scripts, and `docs/cycle/issues/{inbox,todo,done,blocked,failed}/`) — `tests/cli/halt.test.ts:10-42`, `seedTodo` at `44+`. This is the pattern for the SPEC's CLI-level assertion (preflight failure ⇒ no `cycle.start` in the log, non-zero exit). `ensureDist()` reads the prebuilt bundle.
- **Existing exec lane tests** already cover the missing/non-zero/`--version`-style probe shape per agent: e.g. `exec-codex.test.ts` covers non-zero exit → `status: "failed"` and stderr capture (`tests/engine/exec-codex.test.ts:47+`); analogous tests exist for each `exec-*` lane (`tests/engine/exec-{auggie,gemini,opencode,pi,claudecode}.test.ts`).
- **Failure-path test coverage in the change area**: no `tests/engine/preflight.test.ts` exists yet (new file required). Adjacent failure-path coverage that establishes the conventions to follow: `tests/cli/halt.test.ts` (terminal halt + `engine.stop`), `tests/cli/iteration-too-fast.test.ts`, `tests/engine/exec-*.test.ts` (probe-fails / missing-binary cases), `tests/engine/engine-lock-integration.test.ts` (startup-failure exit path).
- **Coverage policy**: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% aggregate (must not regress); new per-file floor for `src/engine/preflight.ts` added to `FLOORS` in `scripts/coverage-gate.mjs:12-35`. `npm run test:coverage` auto-runs `check:coverage` and `check:invariants`.

## Code References

- `src/cli.ts:178-230` — lock acquire → logger → dirs → dotenv → `loadConfig` → `engine.start` → `runTriage`; the gate slots in after `loadConfig` (211) and before the triage block (219).
- `src/cli.ts:144` — `args = parseArgs(argv)` (where `args.skipPreflight` would be read).
- `src/cli.ts:221-229` — existing `engine.stop { status: "halted", reason: "triage_failed" }` + `process.exit(1)` pattern to mirror for `preflight_failed`.
- `src/engine/exec.ts:45-56` — `REGISTRY` and `knownAgents()`.
- `src/engine/exec-codex.ts:14`, `exec-gemini.ts:14`, `exec-auggie.ts:10`, `exec-opencode.ts:15`, `exec-pi.ts:11`, `exec-claudecode.ts:26` — `CYCLE_<AGENT>_BIN ?? "<binary>"` resolution to replicate.
- `src/engine/child-env.ts:16-33` — `buildChildEnv`.
- `src/engine/exec-spawn.ts:29`, `40-43`, `65-67` — `shell:false` + array-args spawn, `buildChildEnv`, and error-to-`StepResult` (no-reject) convention.
- `src/engine/workflow.ts:6-79` — `Step`/`Workflow`/`TriageConfig`/`CycleConfig` types; `126-153` — defaults resolution ensuring concrete `step.agent`.
- `src/engine/triage.ts:801` — `resolveAgent(cfg.agent)` (triage's agent contributes to the distinct agent set).
- `src/cli/parse-args.ts:3-10`, `44-64` — `RunArgs` type, options map, return object for the new flag.
- `src/engine/log.ts:11-17` — `Logger.emit` event shape.
- `tests/helpers.ts:3-10` — `expectExactlyOne`.
- `tests/engine/exec-codex.test.ts:16-43` — temp-dir fake-binary + `CYCLE_<AGENT>_BIN` injection pattern.
- `tests/cli/halt.test.ts:10-42` — CLI spawn harness + repo bootstrap for the no-`cycle.start` / non-zero-exit assertion.
- `scripts/coverage-gate.mjs:12-35` — `FLOORS` table (add `src/engine/preflight.ts`).
- `scripts/structural-invariants.mjs:45-118` — agent-binary hermeticity invariants the preflight test must not violate.

## Open Questions

- **Distinct-agent-set source**: SPEC says "the active workflow's steps plus triage." The active workflow name is resolved per-issue in the main loop (`args.workflow`, overridable by issue frontmatter `fm.workflow` — `src/cli.ts:505-518`) and at resume (`tail.workflow` — `378-396`), not globally at startup. The planner must decide which workflow(s) the startup gate enumerates — `args.workflow` (CLI default `feature`), all configured workflows, or another resolution — since the per-issue workflow is not yet known when the gate runs after config load.
- **Static tool detection scope**: the configured bash steps reference `scripts/*.sh` (e.g. `scripts/verify.sh` — `.cycle/workflows.yml:37`), whose contents the gate does "not execute or fully parse" (SPEC Out of Scope). The exact set of statically detected tools beyond the always-required `bash`/`git` (e.g. `diff`, the test runner) and the detection mechanism (parse `step.command` filename vs. scan script contents) is unspecified and must be defined by the planner.
- **`--version` flag uniformity**: SPEC prescribes `<bin> --version` for all agents; whether every registered agent CLI supports `--version` (vs. `version`/`--help`) is not verified in-repo (the live CLIs are not installed in this environment per `exec.ts:14-17` notes) and the probe contract assumes a non-zero/error exit means failure regardless.
- **Coverage floor value**: SPEC requires a new `FLOORS` entry for `src/engine/preflight.ts` but does not fix the percentage; the planner should set it consistent with the engine-module floors (most are 90-100%).
