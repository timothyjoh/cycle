# `cycle doctor` — on-demand environment check

`cycle doctor` (alias `cycle preflight`) runs the engine's start-up preflight
checks **on demand**, without starting the engine, acquiring the lock, or
mutating any state. Use it when setting up a new repo or debugging a broken one
— a missing agent binary, a WSL-shadowed `/mnt/c/` install, or a required tool
absent from PATH.

## Usage

```
cycle doctor [--workflow <name>]
cycle preflight [--workflow <name>]
```

- `--workflow <name>` selects which workflow's agent set is probed. Default
  `feature`, matching `cycle run`.
- An **unknown** `--workflow <name>` (not present in the loaded config) or a
  **value-less** trailing `--workflow` (the flag with no following name) fails
  loud: the command exits non-zero and prints a stderr message naming the bad
  value and listing the available workflow names, **before** any agent/tool probe
  runs. This is validated against the config's workflow set (not a hand-coded
  list), so a typo surfaces immediately instead of a false `doctor: all checks
  passed`. The no-arg path defaults to `feature`, and that default is now itself
  membership-validated: against a `workflows.yml` that defines no `feature`
  workflow, `cycle doctor` with no flag fails loud with the same `unknown
  workflow "feature"` diagnostic instead of false-passing.
- `doctor` and `preflight` are the same command; their output is byte-identical
  for the same repo and flags.

## What it checks

It reuses the engine-start `runPreflight` logic verbatim (no second
implementation): it resolves every agent CLI the selected workflow + triage will
use (honoring `CYCLE_<AGENT>_BIN` overrides) and probes each with
`<bin> --version`, then confirms the required tools (`bash`/`git` plus the
bare-name heads of any configured bash-step commands) resolve on the curated
PATH. A binary resolved under the WSL `/mnt/c/` mount produces a non-fatal
warning.

## Example output

```
agent  claudecode   ok    /home/u/.local/bin/claude
agent  codex        FAIL  codex binary "codex" not found on PATH. Install it or set CYCLE_CODEX_BIN to its path.
tool   git          ok    /usr/bin/git
tool   bash         ok    /usr/bin/bash
warn   gemini       gemini resolves under /mnt/c/... (WSL /mnt/c) — this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.

FAIL codex: codex binary "codex" not found on PATH. Install it or set CYCLE_CODEX_BIN to its path.
doctor: 1 check(s) failed
```

A clean run ends with `doctor: all checks passed`.

## Exit codes

- **0** — all checks passed. Warnings (e.g. `wsl_shadow`) are reported but do
  **not** flip the exit code.
- **non-zero** — at least one check failed, the config could not be loaded
  (uninitialized repo / malformed `workflows.yml`), or the selected workflow was
  unknown or value-less — an explicit `--workflow` name absent from the config, a
  value-less trailing `--workflow`, or the no-flag default `feature` against a
  config that does not define it. In the config-load and workflow-validation
  cases a clear diagnostic is printed to stderr (run `cycle init` first, or pick
  one of the listed workflows) with no stack trace and no probe run.

Because the exit code is 0 only when the environment is healthy, a setup script
can gate on it:

```sh
cycle doctor || { echo "environment not ready"; exit 1; }
```

## Read-only guarantee

The command runs entirely before lock acquisition: it does **not** create or
modify `.cycle/engine.lock`, the queue, the log, or any `docs/cycle/**` file. It
only reads `workflows.yml` and spawns harmless `<bin> --version` probes, so it is
safe to re-run any number of times.
