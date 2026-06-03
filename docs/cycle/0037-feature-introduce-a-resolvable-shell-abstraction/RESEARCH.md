# Research: Cycle 0037

## Cycle Context

SPEC.md (Cycle 0037, `feature`) requires replacing the two hard-coded `/bin/bash` spawn sites — `execBashStep` (`src/engine/exec-bash.ts`) and the walkthrough hook spawn (`src/engine/walkthrough.ts`) — with a single shared shell-resolution helper in a new `src/engine/shell.ts`. The helper, `resolveShell({ platform, env, config, existsSync })`, picks the shell binary by precedence: explicit `engine.shell` config → `CYCLE_SHELL` env → platform auto-discovery (POSIX `/bin/bash`; Windows probes well-known git-bash / WSL `bash.exe` paths) → a structured "unresolved" result on Windows. On Linux/macOS with no config/env the result is `/bin/bash`, keeping the spawned command byte-for-byte identical to today. When Windows resolution fails, `execBashStep` must return a `StepResult` with `status: "failed"`, non-zero `exitCode`, and a `stderr` naming searched locations + remediation — never a raw `ENOENT`. `engine.shell` (optional string) is plumbed through `loadConfig`. Per-step `shell:`, a native `pwsh` step type, and Phase-3 docs are out of scope.

## Current Codebase State

### Relevant Components

- **`execBashStep`** — the bash-step exec lane. Hard-spawns `"/bin/bash"` with array args, `shell:false`, `buildChildEnv(env)`. Signature `(repoRoot, command, env)`; resolves the script as `join(repoRoot, ".cycle", command)`. Returns a `StepResult` via the `close` handler (`status: code === 0 ? "ok" : "failed"`, `exitCode: code ?? -1`). It has **no `error`-event handler today**, so a `spawn` `ENOENT` currently rejects/emits an unhandled `error` rather than resolving a failed `StepResult` — `src/engine/exec-bash.ts:8-29` (literal at `:11`).
- **`execWalkthroughHook`** — the walkthrough hook lane. Hard-spawns `"/bin/bash"` with `[hookAbsPath]`, `shell:false`, `buildChildEnv(env)`, `detached:true`. Unlike `execBashStep` it **does** have a `child.on("error", …)` handler that resolves `{ status: "failed", exitCode: -1, … }` (so a spawn `ENOENT` already routes to a failed result here) — `src/engine/walkthrough.ts:73-122` (literal at `:82`, error handler at `:110`).
- **`StepResult` type** — `{ status: "ok" | "failed"; exitCode: number; stdout: string; stderr: string; rateLimited?: true; timedOut?: true }` — `src/engine/exec-types.ts:1-9`. The shared shape both lanes return; re-exported from `exec-bash.ts:5`.
- **`EngineConfig` type** — the config object that would gain a `shell?: string` field — `src/engine/workflow.ts:28-60`. Sibling optional-string field `walkthrough_hook?: string` (`:53`) is the closest precedent for an optional engine-level path string.
- **`loadConfig`** — parses `.cycle/workflows.yml`, validates `engine`/`triage`/`workflows`, resolves `commit` and `defaults`. New `engine.shell` plumbing lands here — `src/engine/workflow.ts:81-156`.

### Existing Patterns to Follow

- **Subprocess discipline**: every spawn uses array args, `shell:false`, and `buildChildEnv(env)`. `buildChildEnv` strips all `CYCLE_*` vars and prepends the parent Node's bin dir to PATH — `src/engine/child-env.ts:16-33`. Both rewired spawn sites must preserve this exactly (SPEC Requirements).
- **Defensive read-site coercion of optional config**: optional numeric/boolean engine fields are coerced at the read site, not at load. E.g. `max_rate_limit_retries` → default 24 when absent/0/negative/non-integer (`src/engine/run-cycle.ts:526-528`); `walkthrough_hook_timeout_ms` → 0 (disabled) unless a valid positive integer (`src/engine/run-cycle.ts:397-400`); `compress_output` resolved as `=== true`. `engine.shell` per SPEC is "string, optional; absent/non-string ⇒ unset" — the planner chooses whether to validate-at-load (like `commit.mode`, `workflow.ts:113-120`) or coerce-at-read.
- **`walkthrough_hook` path-resolution precedent**: an explicit config path is resolved relative→repo root else absolute, with a convention fallback — `src/engine/walkthrough.ts` (`resolveWalkthroughHook`, near `:40-58`). This is the established shape for "explicit config path → auto-discovery → inert/unresolved".
- **Platform / WSL detection precedent**: preflight reads `/proc/version` (injectable, `undefined ⇒ read`, `null ⇒ not WSL`) via `readProcVersion` / `isWsl` and accepts an injectable `existsSync`-style probe and `procVersion` for deterministic tests — `src/engine/preflight.ts:84-95`, probe injection at `:190`, `:214`. `resolveShell`'s `{ platform, env, existsSync }` injection mirrors this convention.
- **Agent-binary resolution precedent (`CYCLE_<X>_BIN ?? "<bin>"`)**: each exec lane resolves its binary with an env override falling back to a default, and preflight mirrors the table in `AGENT_BINARY` (`src/engine/preflight.ts:76-81`). `CYCLE_SHELL` follows the same env-override idiom; keep preflight in mind but note shell-probing in preflight is **explicitly out of scope** this cycle (SPEC "Out of Scope").
- **Failure handling today**: `execBashStep` maps non-zero exit → `status:"failed"` but has no spawn-error path (`:20-27`); `execWalkthroughHook` maps both non-zero exit and `error` events → failed `StepResult` (`:110-113`). A failed bash `StepResult` routes through run-cycle's fatal step-failure path (`step.end { status:"failed" }` → terminal failure) — `src/engine/run-cycle.ts:530-531` (dispatch) and the surrounding failure routing. The walkthrough lane already routes non-zero/`timedOut` through the same fatal path (`run-cycle.ts:401-407`).
- **Observability**: structured JSONL events via `log.emit(...)` (`src/engine/run-cycle.ts`, e.g. `step.start` at `:391`). Bash and walkthrough steps emit `step.start` / `step.end`; the walkthrough lane adds `step.walkthrough_capture_failed` for best-effort degrade. No metrics layer. SPEC does not request new events — failure surfaces via existing `step.end { status:"failed", stderr }`.
- **Idempotency / retry-safety**: failed bash steps route through `max_cycle_attempts` retry and `max_consecutive_failures` halt accounting; no locks/dedup specific to the spawn sites. `resolveShell` is required pure/side-effect-free (no spawning), so it adds no retry-safety surface of its own.

### Dependencies & Integration Points

- **`execBashStep` ← `run-cycle.ts:531`** — called as `execBashStep(repoRoot, step.command!, cycleEnv)`. The call site has `cfg` in scope (`cfg.engine.*`, loaded at `run-cycle.ts:276`) but **`execBashStep`'s current signature does not receive config or a resolved shell** — the planner must decide how to thread the resolved shell (e.g. resolve in run-cycle and pass the binary, or pass `cfg.engine.shell` / a resolver into the lane). Same constraint at the walkthrough call site (`run-cycle.ts:401-406`).
- **`execWalkthroughHook` ← `run-cycle.ts:401-406`** — receives `(repoRoot, hook, envExtra, { timeoutMs })`; likewise has no shell/config parameter today.
- **`buildChildEnv`** — `src/engine/child-env.ts`; must wrap the resolved-shell spawn at both sites.
- **`loadConfig`** — `src/engine/workflow.ts:81`; `EngineConfig` (`:28`) is where `shell?: string` is declared and (optionally) validated.
- **No new external services or runtime dependencies** (SPEC Dependencies). `node:path`, `node:fs` `existsSync`, `process.platform` are the standard-lib touchpoints; `resolveShell` takes them injected.

### Test Infrastructure

- **Test framework**: Node built-in runner (`node:test`) with `node:assert/strict`; `.ts` run directly via `--experimental-strip-types` (no transpile). Tests live in `tests/engine/*.test.ts`.
- **Test conventions**: real-filesystem temp dirs (`mkdtemp`/`mkdir`/`writeFile`/`chmod`/`rm`) for spawn lanes; injectable seams (timers, `existsSync`, `procVersion`, `platform`) for pure logic. Note: `node:fs/promises` cannot be `mock.method`-stubbed (non-configurable ESM); use `node:fs` or real FS (CLAUDE.md *Test conventions*). Exactly-once events are cardinality-pinned with `filter(...).length === 1`.
- **Existing bash-step tests**: `tests/engine/exec-bash.test.ts` — two cases (ok stdout capture; non-zero exit → failed). Both write a real `#!/bin/bash` script and run it; **neither asserts which binary is spawned** and there is **no failure-path / spawn-error test** today — `tests/engine/exec-bash.test.ts:8-38`. SPEC requires extending these to assert the resolved binary is spawned (happy Linux path) and a Windows-unresolved failure path.
- **Existing walkthrough tests**: `tests/engine/walkthrough.test.ts` and `tests/engine/run-cycle.walkthrough.test.ts` exercise the hook lane (timeout/kill, collect/manifest, phase routing). SPEC requires verifying the resolved-shell rewire keeps the Linux fatal-failure routing unchanged.
- **New test file expected**: `tests/engine/shell.test.ts` covering `resolveShell` (POSIX default, Windows git-bash discovery, Windows WSL discovery, config override, `CYCLE_SHELL` override, config-over-env precedence, Windows-unresolved) with injected `platform`/`env`/`existsSync`, no real FS or spawning.
- **Coverage floors**: per-file floors enforced via `scripts/coverage-gate.mjs` `FLOORS` table — `scripts/coverage-gate.mjs:12-40`. SPEC Dependencies require adding a floor for `src/engine/shell.ts`. `src/engine/exec-bash.ts` has **no current floor entry** (covered only by aggregate); the planner may add one if changing the lane meaningfully. `walkthrough.ts` floor is 95 (`scripts/coverage-gate.mjs:31`). Repo-wide floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% (CLAUDE.md *Coverage policy*).
- **Structural invariants**: `scripts/structural-invariants.mjs` is the single source for build-time rules (`npm run check:invariants`). No existing invariant pins the `/bin/bash` literal or the shell module; adding one is optional and not SPEC-required.

## Code References

- `src/engine/exec-bash.ts:8-29` — `execBashStep`; hard-spawns `/bin/bash` at `:11`; close-only result handler at `:20-27` (no `error` handler).
- `src/engine/exec-types.ts:1-9` — `StepResult` shape returned by both lanes.
- `src/engine/walkthrough.ts:73-122` — `execWalkthroughHook`; `/bin/bash` literal at `:82`; spawn-`error` → failed `StepResult` at `:110`; close handler at `:111-113`.
- `src/engine/child-env.ts:16-33` — `buildChildEnv`; PATH-prepend + `CYCLE_*` strip; must wrap both rewired spawns.
- `src/engine/workflow.ts:28-60` — `EngineConfig`; `walkthrough_hook?: string` precedent at `:53`; add `shell?: string` here.
- `src/engine/workflow.ts:81-156` — `loadConfig`; `commit.mode` validation pattern at `:113-120`; defaults resolution at `:126-153`.
- `src/engine/run-cycle.ts:276` — `cfg = await loadConfig(repoRoot, mergedEnv)` (config in scope at both spawn call sites).
- `src/engine/run-cycle.ts:531` — `execBashStep(repoRoot, step.command!, cycleEnv)` call site.
- `src/engine/run-cycle.ts:397-406` — `execWalkthroughHook` call site + `walkthrough_hook_timeout_ms` defensive coercion (read-site-coercion precedent).
- `src/engine/preflight.ts:84-95` — `readProcVersion` / `isWsl` (injectable platform/WSL detection precedent).
- `src/engine/preflight.ts:76-81` — `AGENT_BINARY` `CYCLE_<X>_BIN ?? "<bin>"` env-override table (env-override idiom for `CYCLE_SHELL`).
- `tests/engine/exec-bash.test.ts:8-38` — existing bash-step tests (no binary assertion, no failure-path).
- `scripts/coverage-gate.mjs:12-40` — `FLOORS` table; add `src/engine/shell.ts`.

## Open Questions

- **Threading the resolved shell into the lanes**: `execBashStep` / `execWalkthroughHook` signatures don't currently receive config or a shell path. Should the planner (a) resolve the shell in `run-cycle.ts` and pass the binary string into the lane, or (b) add a `config`/`shell` parameter and call `resolveShell` inside the lane? The plan step must pick one and keep `buildChildEnv` discipline intact.
- **Where the Windows-unresolved failure message is constructed**: SPEC requires `execBashStep` to resolve a failed `StepResult` whose `stderr` names searched locations + remediation. Does `resolveShell` return the structured "unresolved" result (candidate list + message) for the lane to format, or does the lane own the message text? (SPEC says `resolveShell` returns a "structured unresolved result" — the planner decides the field shape.)
- **`execBashStep` spawn-error handler**: the lane has no `child.on("error", …)` today. The planner must decide whether to add one (to convert a wrong *configured* shell path's `ENOENT` into a failed `StepResult` per SPEC Requirements) versus relying solely on `resolveShell`'s unresolved branch — the two cover different failure modes (configured-but-missing vs. nothing-discovered).
- **Concrete Windows candidate paths**: the exact ordered git-bash / WSL `bash.exe` locations to probe (e.g. `C:\Program Files\Git\bin\bash.exe`, `C:\Windows\System32\bash.exe`) are not specified — the plan step should enumerate the candidate list to be documented in `docs/ENGINE.md` *Shell resolution*.
- **Whether to add a per-file coverage floor for `src/engine/exec-bash.ts`** now that it gains a failure branch (currently covered only by aggregate thresholds).
