# SPEC — Cycle 0031: Engine-Start Preflight Gate with Actionable Diagnostics

## Objective
Running `cycle run` must validate the execution environment *before* the first cycle starts, so that knowable environment faults — a wrong-platform agent build, a missing agent CLI, or a missing required external tool — produce a single clean, actionable halt naming the resolved binary path and the exact fix, instead of a cryptic raw stack trace discovered halfway through a cycle after work has already been spent. This cycle delivers that preflight gate as the first thing the engine runs after acquiring its lock, wired into `src/cli.ts`, with the agent + tool checks, the WSL `/mnt/c` shadow warning, the cardinality-pinned `engine.preflight.ok` / `engine.preflight.failed` events, and an opt-out flag for advanced users.

## Source Issue
`txt-20260602-233001-preflight-gate-requeue` — "Add an engine-start agent + tool preflight gate with actionable diagnostics (cross-platform P1)"

## Scope

### In Scope
- A new preflight module (`src/engine/preflight.ts`) that, given the active workflow config and repo root, computes the distinct agent set (workflow steps **plus triage**), probes each agent CLI and each statically-required external tool, detects the WSL `/mnt/c` shadow condition, and returns a structured pass/fail result with per-check diagnostics (resolved path + fix string).
- Engine wiring in `src/cli.ts`: run the gate after lock acquisition / config load and **before** `runTriage` and the first cycle; on failure emit `engine.preflight.failed`, emit a terminal `engine.stop { status: "halted", reason: "preflight_failed" }`, and exit non-zero with no cycle started; on success emit `engine.preflight.ok` exactly once and proceed unchanged.
- A `--skip-preflight` opt-out flag (added to `src/cli/parse-args.ts` and `RunArgs`) that bypasses the gate entirely.

### Out of Scope
- The shell abstraction (cross-platform P2, `txt-20260601-230000-cross-platform-wsl-powershell-shell-abstraction`) — not pulled in.
- Broader cross-platform setup documentation (P3) beyond the `CLAUDE.md` / `docs/ENGINE.md` updates for this gate.
- Auto-installing, auto-fixing, or auto-switching binaries. The gate only *diagnoses and halts*; remediation is the user's, surfaced via the fix string.
- Deep dependency parsing of arbitrary bash-step scripts. Tool detection covers the always-required tools (`bash`, `git`) plus statically detectable tools the configured bash steps invoke; it does not execute or fully parse scripts.

## Requirements
- **Agent preflight.** For each distinct agent referenced by the active workflow's steps plus triage (drawn from `claudecode`/`codex`/`gemini`/`auggie`/`opencode`/`pi`; `bash` is not an agent), resolve the binary the same way the exec lanes do — honoring the `CYCLE_<AGENT>_BIN` override, falling back to the agent name on PATH — and run a cheap probe (`<bin> --version` via `spawnSync`, array args, `shell:false`, curated env via `buildChildEnv`). A non-zero/error probe means the build is missing or platform-wrong and is a failure.
- **Tool preflight.** Confirm `bash` and `git` resolve on PATH always; additionally confirm statically detectable tools invoked by the active workflow's configured bash steps (e.g. `diff`, the test runner) resolve. A missing required tool is a failure.
- **PATH hygiene under WSL.** When running under WSL (detectable via `/proc/version` containing `microsoft`, or an injected probe for testability) and a resolved agent or tool binary path begins with `/mnt/c/`, emit a non-fatal **warning** (it likely shadows a native Linux install) — the pass/fail outcome is unchanged by a warning alone.
- **Actionable failure.** Every failure diagnostic must include the resolved binary path (or "not found on PATH") and a concrete fix string. The wrong-platform-codex case must read substantially like: `codex resolved to /mnt/c/.../npm/codex — a Windows build missing the linux-x64 binary. Install natively: npm i -g @openai/codex@latest`.
- **Events.** Emit `engine.preflight.ok` on a clean pass and `engine.preflight.failed` (with a `failures` payload listing each failed check's agent/tool, resolved path, and fix) on any failure. Each must be cardinality-pinned in tests via `filter(...).length === 1`.
- **Opt-out.** `--skip-preflight` bypasses the gate; when set, neither preflight event fires and the engine proceeds directly.
- **Subprocess discipline.** All probes use `spawnSync` with array args, never `shell:true`, env via `buildChildEnv` with any needed `CYCLE_*` re-injected per the re-injection contract.
- **Non-functional.** The gate runs once at startup and must not add meaningful latency to the healthy path beyond the necessary `--version` probes (one cheap `spawnSync` per distinct agent/tool).
- **Failure behavior**: A probe that errors, exits non-zero, or whose binary cannot be resolved is recorded as a failed check (never swallowed) and routed to `engine.preflight.failed` + a clean `engine.stop`; the engine exits non-zero before any `cycle.start`. A missing/unreadable `/proc/version` degrades to "not WSL" (no shadow warning, no crash). A config with no resolvable workflow degrades to checking only the always-required tools (`bash`, `git`) plus triage's agent. The gate never throws an unhandled error that reaches the user as a raw stack trace; an unexpected internal error in the gate itself is caught and surfaced as a preflight failure with the error message.

## Acceptance Criteria
- [ ] A missing agent binary (agent's `CYCLE_<AGENT>_BIN` points at a nonexistent path) causes the engine to emit `engine.preflight.failed` with that agent's resolved path and fix, emit `engine.stop`, and exit non-zero **before** any `cycle.start` event is logged.
- [ ] A wrong-platform agent binary (probe exits non-zero) causes a clean halt whose diagnostic includes the resolved path and an install fix — no raw stack trace reaches stdout/stderr.
- [ ] A missing required tool (`bash`, `git`, or a detected step tool such as `diff` absent from PATH) causes the same clean, actionable `engine.preflight.failed` halt.
- [ ] In a simulated WSL environment with an agent or tool resolving under `/mnt/c/...`, a shadow warning is emitted and (if all probes otherwise pass) the gate still passes.
- [ ] A healthy environment emits `engine.preflight.ok` exactly once (`filter(e => e.event === "engine.preflight.ok").length === 1`) and cycles proceed unchanged.
- [ ] `cycle run --skip-preflight` runs no probes and emits neither `engine.preflight.ok` nor `engine.preflight.failed`.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` + `assert`, matching existing engine tests; run under `--experimental-strip-types`.
- New `tests/engine/preflight.test.ts` exercising the preflight module directly with injected config, an injected WSL probe, and `CYCLE_<AGENT>_BIN` overrides pointing at mock binaries (created in a temp dir) for: clean pass, missing agent binary, wrong-platform agent (mock script exits non-zero on `--version`), missing required tool, and the `/mnt/c` shadow-warning path.
- Mock the missing/wrong-platform binaries and missing tools via temp-dir fixtures and `CYCLE_<AGENT>_BIN` / a controlled PATH passed through the module's seams — do **not** PATH-stub real agent names in node's bin dir (respect the agent-binary hermeticity invariants).
- Cardinality-pin the preflight events with `filter(predicate).length === 1`; for payload assertions use the `expectExactlyOne` helper from `tests/helpers.ts`.
- Add a CLI-level assertion that, on a preflight failure, no `cycle.start` event is written to the log and the exit code is non-zero.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md**: Document the preflight gate under Commands / Workflow-defaults — the `--skip-preflight` flag, the `engine.preflight.ok` / `engine.preflight.failed` events, the agent+tool probe contract, and the WSL `/mnt/c` shadow-warning behavior. Note `src/engine/preflight.ts` in the Architecture module list.
- **docs/ENGINE.md**: Add a *Preflight gate* section covering when it runs (after lock/config load, before triage and cycle 1), what it checks (agents via `CYCLE_<AGENT>_BIN`-aware resolution + `--version` probe; required tools `bash`/`git` + detected step tools), the WSL PATH-hygiene warning, the event contract, the clean-halt-vs-crash guarantee, and the opt-out flag.
- **README.md**: Surface the preflight gate and `--skip-preflight` opt-out in the user-facing run description.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec.ts` `REGISTRY` / `knownAgents()` and the per-lane `CYCLE_<AGENT>_BIN` resolution convention (the gate must resolve binaries identically to dispatch).
- `src/engine/child-env.ts` `buildChildEnv` for curated subprocess env.
- `loadConfig` (active workflow + steps + triage agent) and the logger (`createLogger`) already constructed in `src/cli.ts`.
- `src/cli/parse-args.ts` `RunArgs` for the new `--skip-preflight` flag.
- A new per-file coverage floor for `src/engine/preflight.ts` added to the `FLOORS` table in `scripts/coverage-gate.mjs`; overall coverage must not regress (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- No external services or env vars required beyond the optional `CYCLE_<AGENT>_BIN` overrides already used by tests.
