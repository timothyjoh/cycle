# SPEC — Cycle 0037: Resolvable shell abstraction so bash steps run on native Windows

## WHY
Every `bash` step hard-spawns `/bin/bash` in `src/engine/exec-bash.ts`
(`execBashStep`) and the walkthrough hook does the same in
`src/engine/walkthrough.ts`. On a native Windows host (PowerShell, no WSL)
`/bin/bash` does not exist, so the spawn fails `ENOENT` and **every** bash
step — including the default `verify` step that gates every cycle — crashes.
There is no way to point the engine at git-bash, a WSL bash, or any other
POSIX-compatible shell. This makes `cycle` effectively unusable on native
Windows: the engine cannot complete a single cycle.

## CONCRETE USER BENEFIT
A user running `cycle run` on native Windows (PowerShell, git-bash
installed) can complete a cycle whose workflow includes the default `verify`
bash step, instead of the run dying at the first bash step with a
`spawn /bin/bash ENOENT` crash. The same user can override the shell
explicitly (`engine.shell` in `workflows.yml` or `CYCLE_SHELL` env) to point
at any bash they choose.

## USABLE END-STATE
On Windows, `cycle run` resolves a usable bash (configured override first,
then auto-discovered git-bash / WSL bash) and runs `.cycle/verify.sh` (and
any other `agent: bash` step) through it to completion. On Linux/macOS the
behavior is byte-for-byte unchanged: `/bin/bash` is still used and no new
config is required. When no shell can be resolved on Windows, the step fails
with a clear, actionable error naming what was searched and how to fix it —
never a raw `ENOENT` stack trace.

## Objective
This cycle replaces the two hard-coded `/bin/bash` spawn sites with a single
shared shell-resolution helper that picks the shell binary from explicit
config, then platform-aware auto-discovery, then the POSIX default. The
helper is wired into `execBashStep` and the walkthrough hook spawn so that
bash/script steps run on a native Windows PowerShell host while Linux/macOS
behavior is preserved exactly. This is Phase 2 of the cross-platform effort
and the dependency that Phase 3 (setup docs / residual gaps) builds on.

## Source Issue
`txt-20260601-230000-cross-platform-wsl-powershell-shell-abstraction` —
"Introduce a resolvable shell abstraction so bash/script steps run on native
Windows PowerShell"

## Scope

### In Scope
- New `src/engine/shell.ts` module exporting a pure-leaning
  `resolveShell({ platform, env, config, existsSync })` that returns the
  absolute shell path to spawn, using precedence: explicit `engine.shell`
  config → `CYCLE_SHELL` env → platform auto-discovery (POSIX: `/bin/bash`;
  Windows: probe a small ordered list of well-known git-bash / WSL `bash.exe`
  locations) → a structured "unresolved" result on Windows when nothing is
  found. Platform, env, and filesystem-existence checks are injectable for
  deterministic tests.
- Wire `resolveShell` into `execBashStep` (`src/engine/exec-bash.ts`) and the
  walkthrough hook spawn (`src/engine/walkthrough.ts`) so both use the
  resolved shell instead of the literal `"/bin/bash"`. Preserve the
  array-args / `shell:false` / `buildChildEnv` discipline at both sites.
- `engine.shell` config plumbing through `loadConfig` (string, optional;
  absent/non-string ⇒ unset) so a user can pin the shell per engine.

### Out of Scope
- A dedicated `pwsh` / PowerShell step type or running step scripts as native
  PowerShell — deferred; this cycle keeps step scripts POSIX-shell scripts and
  only makes the shell that runs them resolvable.
- The preflight gate's involvement in shell probing (Phase 1, already landed)
  and any new preflight checks.
- The cross-platform setup guide, README updates, and residual
  path-separator / line-ending audit — those are Phase 3
  (`...-setup-docs`).
- Per-step `shell:` override (only engine-level + env this cycle).

## Requirements
- `resolveShell` is deterministic and side-effect-free given injected
  `platform` / `env` / `existsSync`; it performs no spawning itself.
- Precedence is exactly: `config.engine.shell` → `CYCLE_SHELL` → platform
  auto-discovery → unresolved. An explicitly configured shell is used
  verbatim even if `existsSync` is false (the user owns that choice); the
  failure then surfaces from the spawn, not from resolution.
- On Linux/macOS with no config and no env override, `resolveShell` returns
  `/bin/bash`, making the spawned command identical to today.
- `execBashStep` and the walkthrough hook continue to spawn with array args,
  `shell:false`, and `buildChildEnv(env)`; only the binary argument changes.
- **Failure behavior**: On Windows when no shell is configured, no
  `CYCLE_SHELL` is set, and no known `bash.exe` is found on disk,
  `execBashStep` resolves a `StepResult` with `status: "failed"`, a non-zero
  `exitCode`, and a `stderr` message that names the locations searched and the
  remediation (install git-bash / WSL, or set `engine.shell` / `CYCLE_SHELL`)
  — it must NOT throw an unhandled `ENOENT` or emit a raw stack trace, and it
  must route through the existing fatal step-failure path. A spawn that fails
  because a *configured* shell path is wrong likewise surfaces as a failed
  `StepResult` (the engine's existing spawn-error handling), never a silent
  success.

## Acceptance Criteria
- [ ] On a simulated Windows platform with a discoverable git-bash
      `bash.exe`, `resolveShell` returns that absolute path, and a unit test
      asserts `execBashStep` spawns the resolved shell (not `/bin/bash`).
- [ ] On a simulated `linux` platform with empty config/env, `resolveShell`
      returns `/bin/bash`, demonstrating the user-observable benefit that
      existing POSIX runs are unchanged.
- [ ] `engine.shell` config and `CYCLE_SHELL` env each override
      auto-discovery, with config taking precedence over env (asserted by
      unit tests with both set).
- [ ] **Failure-path:** on a simulated Windows platform with no config, no
      `CYCLE_SHELL`, and `existsSync` returning false for every candidate,
      `execBashStep` resolves `status: "failed"` with a `stderr` that names
      the searched locations and the fix — asserted by a test that inspects
      the message, with no thrown exception.
- [ ] All existing bash-step and walkthrough tests pass unchanged (Linux
      behavior preserved byte-for-byte).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node built-in test runner (`node:test`), matching existing
  `tests/engine/*.test.ts` conventions.
- New `tests/engine/shell.test.ts` covering `resolveShell`: POSIX default,
  Windows git-bash discovery, Windows WSL-bash discovery, config override,
  `CYCLE_SHELL` override, config-over-env precedence, and the Windows
  unresolved (failure) case — all with injected `platform` / `env` /
  `existsSync`, no real filesystem dependence and no real spawning.
- Extend the existing `execBashStep` test coverage to assert the resolved
  binary is what gets spawned (inject the resolver or its inputs) for both
  the happy Linux path and the Windows-unresolved failure path.
- Verify the walkthrough hook spawn still routes a non-zero/failed shell
  resolution through the existing fatal step-failure path (no behavior
  regression on Linux).
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md**: under *Subprocess discipline* / *Architecture*, document the
  new `src/engine/shell.ts` module and its resolution precedence, and note
  that bash/script steps now spawn a resolved shell (still array-args /
  `shell:false`) rather than a literal `/bin/bash`. Document the
  `engine.shell` config key and `CYCLE_SHELL` env override.
- **docs/ENGINE.md**: add a *Shell resolution* subsection describing the
  precedence, the Windows auto-discovery candidate list, the Linux
  no-change guarantee, and the Windows-unresolved failure contract.
- **README.md**: a one-line note that bash steps run on a resolvable shell
  and that native-Windows users can install git-bash or set `engine.shell`
  (full per-platform setup is deferred to Phase 3).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `src/engine/exec-bash.ts` (`execBashStep`),
  `src/engine/walkthrough.ts` hook spawn, `src/engine/child-env.ts`
  (`buildChildEnv`), and `loadConfig` config plumbing.
- A per-file coverage floor for `src/engine/shell.ts` added to
  `scripts/coverage-gate.mjs` (`FLOORS` table).
- No new external services or runtime dependencies.
