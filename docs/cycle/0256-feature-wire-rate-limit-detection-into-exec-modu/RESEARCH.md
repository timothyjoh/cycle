# Research: Cycle 0256

## Cycle Context

Cycle 0256 wires the `isRateLimitError` helper (shipped in cycle 0255) into all six exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`) and into `run-cycle.ts`. When a step returns a rate-limit signal, the engine must skip `consecutive_failures` increment, emit `engine.paused { reason: "rate_limit", retry_at }`, sleep a configurable backoff (`engine.rate_limit_backoff_ms`, default 3,600,000), retry the same step, and emit `engine.resumed { reason: "rate_limit_cleared" }` on first clean retry. This closes the gap between the documented event contract and actual engine behavior, and prevents rate-limited runs from burning failure budget and halting the queue.

## Current Codebase State

### Relevant Components

- **`isRateLimitError` helper**: `src/engine/rate-limit.ts:1–14` — Pure function; accepts `{ exitCode: number | null, stderr: string, stdout: string }` (typed as `ExecResult`). Returns `true` on `exitCode === 429`, or `exitCode === 1` with `RATE_LIMIT_PATTERNS` (`"rate limit"`, `"429"`, `"too many requests"`) found case-insensitively in `stderr + stdout` combined. Exports both `ExecResult` and `isRateLimitError`.

- **`StepResult` type**: `src/engine/exec-bash.ts:5–10` — Currently `{ status: "ok" | "failed", exitCode: number, stdout: string, stderr: string }`. This is the canonical definition imported by `exec.ts`, `exec-spawn.ts`, and `run-cycle.ts`. The `rateLimited?: true` field must be added here.

- **`execBashStep`**: `src/engine/exec-bash.ts:12–33` — Bash step runner; must NOT gain rate-limit detection per SPEC (bash steps excluded).

- **`ExecModule` interface**: `src/engine/exec.ts:9–28` — `runStep(args)` returns `Promise<StepResult>`. All six agent modules implement this. `resolveAgent` at `:48` dispatches to the registry.

- **`runAgent` spawn abstraction**: `src/engine/exec-spawn.ts:18–53` — Shared spawn helper used by all six agent exec modules. Resolves `StepResult` from `child.on("close", code => ...)` at `:41–42` and `child.on("error", ...)` at `:44–46`. Currently produces `StepResult` directly without rate-limit awareness; rate-limit detection must be added in each exec module's `runStep` wrapper (post-`runAgent` call), not inside `runAgent` itself.

- **`claudecodeExec`**: `src/engine/exec-claudecode.ts:4–11` — Thin wrapper calling `runAgent` with `promptDelivery: "argv"`.
- **`codexExec`**: `src/engine/exec-codex.ts:4–11` — Thin wrapper; `promptDelivery: "stdin"`.
- **`auggieExec`**: `src/engine/exec-auggie.ts:7–14` — Thin wrapper; `promptDelivery: "file"`; reads `CYCLE_AUGGIE_BIN` env for test binary injection.
- **`geminiExec`**: `src/engine/exec-gemini.ts:4–8` — Minimal wrapper; `promptDelivery: "stdin"`.
- **`opencodeExec`**: `src/engine/exec-opencode.ts:6–13` — Thin wrapper; `promptDelivery: "stdin"`.
- **`piExec`**: `src/engine/exec-pi.ts:6–16` — Thin wrapper; `promptDelivery: "stdin"`; reads `CYCLE_PI_BIN` env for test binary injection.

- **`runCycle` main loop**: `src/engine/run-cycle.ts:247–429` — `for` loop over `wf.steps` indexed by `i`. Agent steps dispatched at `:321–349` via `resolveAgent(step.agent).runStep(...)`. Result stored in `r: StepResult` at `:320`. Failure handled at `:417–428`: emits `cycle.end { status: "failed" }` and returns. No current rate-limit check; `consecutive_failures` counter is not present in the loop body — the loop simply returns on any failure. The SPEC's requirement to "not increment `consecutive_failures`" means the new code must not take the existing failure path (the return at `:427`) when `r.rateLimited` is true.

- **`EngineConfig` type**: `src/engine/workflow.ts:27–32` — Currently `{ max_consecutive_failures: number, base_branch: string, skip_completed_on_retry?: boolean, commit: CommitConfig }`. Must gain `rate_limit_backoff_ms?: number`.

- **`CycleConfig` type**: `src/engine/workflow.ts:41–44` — `{ engine: EngineConfig, triage: TriageConfig, workflows: Workflow[] }`. Config loaded via `loadConfig` at `:46–91`; parses YAML, no numeric-field validation beyond presence checks. Adding `rate_limit_backoff_ms` to YAML requires no parser changes — YAML field will be present on `parsed.engine` and flow through the cast at `:90`.

- **`src/defaults/workflows.yml`**: Lines `3–8` — `engine:` block currently has `max_consecutive_failures`, `base_branch`, `commit`. The `rate_limit_backoff_ms: 3600000` key must be appended here. After editing, `npm run sync-defaults` copies it to `.cycle/workflows.yml`.

### Existing Patterns to Follow

- **Exec module shape**: Each agent module is a thin wrapper that calls `runAgent(...)` and returns its result. The pattern for adding rate-limit detection: `const r = await runAgent(...)`, then `if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true }`, else `return r`. See `exec-claudecode.ts:4–11` for the minimal wrapper pattern.

- **Fake binary injection in tests**: Agent tests create a temp `bin/` directory, write a shell script, `chmod 0o755`, and pass `PATH: \`${bin}:${process.env.PATH}\`` in `env`. The `auggie` and `pi` modules additionally support `CYCLE_AUGGIE_BIN` / `CYCLE_PI_BIN` env overrides (`exec-auggie.ts:9`, `exec-pi.ts:11`) to bypass PATH lookup.

- **Integration test structure for `runCycle`**: Every test in `run-cycle.test.ts` follows: `mkdtemp` for `root` + `bin`, `git init`, write `workflows.yml` via `workflowYml()`/`workflowYmlBranch()` helpers, write fake binary, call `runCycle(root, { ..., env: { PATH: \`${bin}:...\`, CYCLE_BASE: "main" } })`, assert on return value and `readFile(log.jsonl)`. All cleanup in `finally`.

- **`workflowYml()` helper**: Defined inline in each test file (e.g., `run-cycle.test.ts:33–49`, `run-cycle.agent-dispatch.test.ts:15–33`). The new integration test file must define its own or share via a local helper. The YAML template uses `mode: trunk` for most tests.

- **`expectExactlyOne` helper**: `tests/helpers.ts:3–10` — Takes `events: T[]` and `eventName: string`; asserts `length === 1` and returns the matched event. Used when cardinality-pinning exactly-once events (per CLAUDE.md convention).

- **Log parsing in tests**: Tests use `readFile(join(root, ".cycle/log.jsonl"), "utf8")` then either `assert.match(log, /regex/)` for simple checks, or `log.trim().split("\n").find(l => ...)` for structured parsing. The `findStepEnd` helper pattern in `run-cycle.step-end-stderr-dispatch.test.ts:51–62` shows structured JSON line extraction.

- **Backoff sleep injection**: SPEC requires the sleep to be injectable so tests don't wait 1 hour. The pattern must be a `sleepFn` parameter on `runCycle` (added to `RunCycleOpts`) or a module-level injectable, similar to how test-only parameters are passed via `opts` in `runCycle`.

- **`RunCycleOpts` extension**: `src/engine/run-cycle.ts:191–201` — Already has optional fields (`cycleId?`, `env?`, `resume?`, `attempt?`, etc.). Adding `sleepFn?: (ms: number) => Promise<void>` follows the established opt-in pattern.

### Dependencies & Integration Points

- **`isRateLimitError` import path**: `src/engine/rate-limit.ts`. The `ExecResult` interface it exports (`{ exitCode: number | null, stderr: string, stdout: string }`) is compatible with the fields available on `StepResult` after a `runAgent` call (exitCode is `number` from the exec modules, which satisfies `number | null`).

- **`StepResult` is the single shared type**: Defined in `exec-bash.ts`, imported by `exec.ts`, `exec-spawn.ts`, and `run-cycle.ts`. Adding `rateLimited?: true` to it is the minimal type change; all existing callers that don't set the field remain valid (absent = `false`).

- **`consecutive_failures` is not tracked in `runCycle`**: The current `run-cycle.ts` loop has no `consecutive_failures` variable. The concept exists in `workflow.ts` config (`max_consecutive_failures`) and is consumed by `src/cli/run-one.ts` (the outer queue drain loop), not within `runCycle` itself. The SPEC requirement "do not increment consecutive_failures" means: do not return the `{ status: "failed" }` result that `run-one.ts` uses to count failures. The retry loop must stay inside `runCycle` and only return when the step ultimately succeeds or fails with a non-rate-limit error.

- **`src/cli/run-one.ts`**: Calls `runCycle` and evaluates its return `status` to track consecutive failures. Rate-limit retries must be invisible to `run-one.ts` — they complete inside `runCycle` before returning. No changes to `run-one.ts` are required.

- **`sync-defaults`**: `npm run sync-defaults` (script `scripts/sync-defaults.mjs`) copies `src/defaults/` to `.cycle/`. Must be run after editing `src/defaults/workflows.yml` to propagate `rate_limit_backoff_ms` to `.cycle/workflows.yml`.

- **`loadConfig` YAML parsing**: `src/engine/workflow.ts:46–91` — Validates presence of `engine`, `triage`, `workflows` keys but does not validate individual engine sub-fields. `rate_limit_backoff_ms` will flow through as-is on `parsed.engine` after the TS cast at `:90`. The `EngineConfig` type extension is needed for type-safe access in `runCycle`.

### Test Infrastructure

- **Framework**: `node:test` with `node --experimental-strip-types`; no transpile step. Imports use `.ts` extensions. Tests run via `npm test` (which runs `pretest: npm run build` then the test suites).
- **Test file naming convention**: Focused test files named `run-cycle.<feature>.test.ts` in `tests/engine/`. New file for this cycle: `tests/engine/rate-limit-integration.test.ts` (per SPEC), or the pattern could extend `run-cycle.test.ts`. Separate file is consistent with how `run-cycle.agent-dispatch.test.ts`, `run-cycle.spec-guard.test.ts`, etc. are organized.
- **Assertion style**: `import { strict as assert } from "node:assert"`. Regex assertions on log JSONL via `assert.match(log, /pattern/)`. Structured event extraction via `log.trim().split("\n").find(...)`.
- **Coverage floors**: `src/engine/run-cycle.ts` is gated at 90% line coverage (`scripts/coverage-gate.mjs:29`); `src/engine/rate-limit.ts` at 100% (`:31`). New test file for integration coverage of the rate-limit loop in `run-cycle.ts` must keep `run-cycle.ts` at or above 90%.
- **`expectExactlyOne`**: `tests/helpers.ts:3–10` — Available for cardinality-pinned event assertions on `engine.paused` and `engine.resumed`.
- **Exec module test pattern**: Each exec module has its own `tests/engine/exec-<agent>.test.ts` with fake binary injection. Adding a `rateLimited: true` assertion to each is the expected per-module test location.

## Code References

- `src/engine/rate-limit.ts:1–14` — `isRateLimitError` pure helper; `ExecResult` interface
- `src/engine/exec-bash.ts:5–10` — `StepResult` type definition (add `rateLimited?: true` here)
- `src/engine/exec-bash.ts:12–33` — `execBashStep` (do not modify)
- `src/engine/exec.ts:9–28` — `ExecModule` interface and `runStep` signature
- `src/engine/exec.ts:39–52` — `REGISTRY` and `resolveAgent`
- `src/engine/exec-spawn.ts:18–53` — `runAgent` shared spawn; returns raw `StepResult`
- `src/engine/exec-claudecode.ts:4–11` — claudecode thin wrapper (add rate-limit detection post-`runAgent`)
- `src/engine/exec-codex.ts:4–11` — codex thin wrapper
- `src/engine/exec-auggie.ts:7–14` — auggie thin wrapper; `CYCLE_AUGGIE_BIN` test injection
- `src/engine/exec-gemini.ts:4–8` — gemini minimal wrapper
- `src/engine/exec-opencode.ts:6–13` — opencode thin wrapper
- `src/engine/exec-pi.ts:6–16` — pi thin wrapper; `CYCLE_PI_BIN` test injection
- `src/engine/run-cycle.ts:191–201` — `RunCycleOpts` type (add `sleepFn?`)
- `src/engine/run-cycle.ts:247–429` — main step loop (add rate-limit branch before failure path at `:417`)
- `src/engine/run-cycle.ts:417–428` — current failure path: emits `cycle.end`, returns `failed`
- `src/engine/workflow.ts:27–32` — `EngineConfig` type (add `rate_limit_backoff_ms?: number`)
- `src/engine/workflow.ts:46–91` — `loadConfig` YAML parser (no changes required)
- `src/defaults/workflows.yml:3–8` — `engine:` block (add `rate_limit_backoff_ms: 3600000`)
- `scripts/coverage-gate.mjs:29,31` — coverage floors for `run-cycle.ts` (90%) and `rate-limit.ts` (100%)
- `tests/helpers.ts:3–10` — `expectExactlyOne` helper for cardinality-pinned event assertions
- `tests/engine/rate-limit.test.ts:1–36` — existing unit tests for `isRateLimitError` (do not duplicate)
- `tests/engine/run-cycle.test.ts:15–49` — `workflowYml`/`workflowYmlBranch` helpers and test setup pattern
- `tests/engine/exec-claudecode.test.ts:8–27` — fake binary injection pattern for exec module tests

## Open Questions

- **`sleepFn` injection point**: Should `sleepFn` be added to `RunCycleOpts` (cleanest for tests, no module-level state) or should a module-level `_setSleepFn` be used (avoids touching the public API)? The SPEC says "injectable" but does not prescribe which mechanism. `RunCycleOpts` is the established pattern for test-only opts (see `skipCompletedOnRetry`, `attempt`).

- **Persistent rate-limit loop termination**: The SPEC says "retry until step succeeds or returns a non-rate-limit failure" but does not specify a maximum retry count. The planner must decide whether the loop is truly unbounded or needs a guard (e.g., `max_rate_limit_retries` or a wall-clock timeout). The defaults ship 1-hour backoff, so even 2 retries = 2 hours of sleep.

- **`engine.resumed` emission on partial recovery**: The SPEC says emit `engine.resumed` "on first step result with `rateLimited` absent/false and `status: 'ok'`." It is silent on whether `engine.resumed` is emitted if a rate-limited step eventually produces `status: "failed"` without `rateLimited`. The test scenario "rate-limit then hard failure" confirms `engine.resumed` is NOT emitted in that case — the planner should confirm this is the intended rule.

- **Rate-limit detection placement in exec modules vs. `runAgent`**: Adding detection in each of the six `runStep` wrappers (post-`runAgent` call) is the cleanest approach given the thin-wrapper pattern, but alternatively `runAgent` could accept an optional `isRateLimit` callback. The SPEC does not prescribe placement; the planner should decide.
