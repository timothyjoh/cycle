I have sufficient context to write the spec.

```markdown
# SPEC — Cycle 0263: `cycle doctor` on-demand environment check

## WHY
The preflight gate (`runPreflight` in `src/engine/preflight.ts`) validates every
agent CLI and required tool the active workflow needs, but it only runs as a
side effect of starting a full `cycle run`. An operator setting up a new repo —
or debugging a broken one (a missing agent binary, a WSL-shadowed `/mnt/c/`
install, a tool absent from PATH) — has no way to run those checks on demand.
They must kick off a real engine run, acquire the lock, and read scattered
`engine.preflight.*` log events to learn that, say, the `codex` binary is not
installed. There is no `cycle doctor` / `cycle preflight` command.

## CONCRETE USER BENEFIT
An operator can run `cycle doctor` in a repo and immediately see a
human-readable report — every agent CLI and required tool listed as pass / warn
/ fail with the existing remediation strings — and a process exit code (0 =
healthy, non-zero = something is broken) they can gate a setup script on. They
get this without starting the engine, without acquiring the engine lock, and
without mutating any state.

## USABLE END-STATE
Running `cycle doctor` (or its alias `cycle preflight`) in an initialized repo
prints one line per check, e.g.:

```
agent  claudecode   ok    /home/u/.local/bin/claude
agent  codex        FAIL  codex binary "codex" not found on PATH. Install it or set CYCLE_CODEX_BIN to its path.
tool   git          ok    /usr/bin/git
tool   bash         ok    /usr/bin/bash
warn   wsl_shadow   gemini resolves under /mnt/c/... (WSL /mnt/c) — ...

doctor: 1 check failed
```

Exit 0 when all checks pass (warnings present or not); non-zero when any check
fails. The command is read-only.

## Objective
Add a thin, user-invokable `cycle doctor` subcommand (alias `cycle preflight`)
that loads the repo config, invokes the **existing** `runPreflight` against the
active workflow, renders its `PreflightResult` as a human-readable report on
stdout, and exits 0 on a clean pass or non-zero when any check fails. It reuses
the preflight probing logic verbatim — no second implementation — and acquires
no lock and mutates no state.

## Source Issue
`feat-cycle-doctor-command` — "cycle doctor — on-demand preflight / environment check command"

## Scope

### In Scope
- A new `src/cli/doctor.ts` module exporting `runDoctor({ cwd, workflow }) →
  { stdout, stderr, exitCode }` that calls `loadConfig(cwd)` + `runPreflight`,
  formats the `checks` / `warnings` / `failures` into a human-readable report,
  and returns exit 0 (clean) / non-zero (any failure). It must NOT acquire the
  engine lock or write any file.
- Dispatch wiring in `src/cli.ts` for `argv[0] === "doctor"` and the alias
  `argv[0] === "preflight"` (same early-return pattern as `status` / `cleanup`),
  plus a `--workflow <name>` pass-through (default `feature`) so the report
  matches the workflow the operator intends to run.
- `cycle help` usage text + `CLAUDE.md` commands table + `docs/` entry.

### Out of Scope
- Interactive `init` agent selection, `--agent` flags, or writing
  `workflows.yml` — explicitly deferred by the issue; `init` stays
  non-interactive.
- Rate-limit / provider-outage retry — already implemented; nothing to do.
- Any change to `runPreflight`, `AGENT_BINARY`, or the engine-start preflight
  path in `src/cli.ts` (the `engine.preflight.*` events stay exactly as-is).
- JSON / machine-readable output mode — human-readable report only this cycle.

## Requirements
- `cycle doctor` and `cycle preflight` resolve to the same code path.
- The report lists every `PreflightCheck` (agents then tools) with its kind,
  name, pass/fail status, and resolved path; lists every `PreflightWarning`
  (e.g. `wsl_shadow`) with its message; and for each failure prints the
  existing `fix` remediation string. No probing logic is duplicated — the
  report is purely a renderer over `runPreflight`'s return value.
- Warnings do **not** affect the exit code — only `failures.length > 0` (i.e.
  `!result.ok`) yields a non-zero exit.
- The command is read-only: it must not call `acquireLock`, must not write to
  `.cycle/`, the queue, the log, or `docs/cycle/**`.
- The `--workflow` flag selects which workflow's agent set is probed; default
  `feature`, matching `cycle run`.
- **Failure behavior**:
  - **Missing/unresolvable agent binary** (e.g. `CYCLE_CODEX_BIN` pointing at a
    non-existent path, or the bin absent from PATH): the corresponding check
    renders `FAIL`, the failure's remediation string (naming the binary and the
    `CYCLE_<AGENT>_BIN` override) is printed, and the command exits non-zero.
  - **Uninitialized / unloadable config** (`loadConfig` returns nullish or
    throws): the command prints a clear diagnostic to stderr (run `cycle init`
    first / config could not be loaded) and exits non-zero — it must not crash
    with an unhandled exception or a raw stack trace.
  - **Internal preflight error**: `runPreflight` already converts internal
    errors into a single `kind: "internal"` failure; the renderer must surface
    that failure's `fix` text and exit non-zero (never swallow it).
  - Errors surface (printed to stderr and/or reflected in a non-zero exit) —
    never silently swallowed.

## Acceptance Criteria
- [ ] Running `cycle doctor` in a healthy initialized repo prints a report
      listing every agent and tool check with a pass marker and exits 0 — the
      operator can now diagnose their environment without starting the engine
      (user-observable benefit).
- [ ] `cycle preflight` produces byte-identical output to `cycle doctor` for the
      same repo/flags (alias verified).
- [ ] With an agent forced missing via `CYCLE_<AGENT>_BIN` pointing at a
      non-existent path, `cycle doctor` exits non-zero and the output names the
      failing binary and includes its remediation string (failure-path
      criterion).
- [ ] When config cannot be loaded (uninitialized repo), `cycle doctor` exits
      non-zero with a clear stderr diagnostic and no unhandled exception /
      stack trace (failure-path criterion).
- [ ] `cycle doctor` does not create or modify `.cycle/engine.lock`, the queue,
      the log, or any `docs/cycle/**` file (verified by a no-state-mutation
      test).
- [ ] `cycle help` output, the `CLAUDE.md` commands table, and a `docs/` entry
      document `cycle doctor` (and the `preflight` alias).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: `node --test` with `node:assert/strict`, matching existing
  `tests/cli/*.test.ts` (e.g. the `cleanup` / `status` CLI tests).
- **Unit tests on `runDoctor`** (preferred — exercise the renderer + exit logic
  directly, no subprocess spawn):
  - Happy path: a config whose agents/tools all resolve → `exitCode === 0`,
    stdout contains each check name with a pass marker.
  - Forced-missing agent: set `CYCLE_<AGENT>_BIN` (or inject via the same env
    seam `runPreflight` reads) to a non-existent path → `exitCode !== 0`, stdout
    contains the binary name and the remediation substring.
  - Warning present but no failure (simulated `wsl_shadow`): warning rendered,
    `exitCode === 0`.
  - Unloadable config: `runDoctor` on an uninitialized temp dir → `exitCode !==
    0`, stderr names the problem; assert no throw escapes.
  - No-state-mutation: snapshot the temp `.cycle/` dir (or assert
    `engine.lock` is absent) before/after a `runDoctor` call.
  - Alias: dispatch test confirming `doctor` and `preflight` route identically.
- Follow the **agent-binary hermeticity** convention: drive missing-agent tests
  via `CYCLE_<AGENT>_BIN`, never by PATH-stubbing a real agent name, so the
  suite stays environment-independent (see CLAUDE.md hermeticity note).
- No UI changes → no Playwright/E2E required.

## Documentation Updates
- **CLAUDE.md**: add a `cycle doctor [--workflow <name>]` row to the Commands
  table (alias `cycle preflight`) describing it as a read-only on-demand
  preflight check that reuses `runPreflight`, exits non-zero on failure, and
  does not acquire the lock or mutate state.
- **README.md / `docs/`**: surface `cycle doctor` as the environment / setup
  diagnostic command; note the `preflight` alias and that warnings don't flip
  the exit code. (A short `docs/doctor.md` or an addition to an existing
  operator-facing doc is acceptable.)

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `runPreflight`, `PreflightResult`, `AGENT_BINARY` resolution — already exist
  in `src/engine/preflight.ts`.
- `loadConfig(cwd)` — already used at engine start in `src/cli.ts`.
- The command-dispatch pattern in `src/cli.ts` (early-return blocks for
  `status` / `cleanup` / `compress-output`) and the `{ stdout, stderr,
  exitCode }` CLI-module convention used by `cleanup` / `triage` / `upgrade`.
- No external services or new env vars required (existing `CYCLE_<AGENT>_BIN`
  overrides are honored transitively through `runPreflight`).
```
