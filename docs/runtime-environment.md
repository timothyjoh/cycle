# Runtime Environment

cycle is repo-local, but it is not hermetic. It installs the production-cell machinery into a repository; it does not install every host tool, credential, agent CLI, or project dependency required to operate that cell.

This document describes what cycle owns, what the repository owns, what the host machine owns, and what an operator should check before leaving the engine AFK.

## The short version

Before running cycle, the machine should have:

- **Node.js >= 22.6** — required to run the bundled `cycle.js` engine.
- **git** — required for branch/reset/status/commit/push operations.
- **GitHub CLI (`gh`)** — required by workflows or automation that interact with GitHub.
- **At least one authenticated coding agent CLI** matching `.cycle/workflows.yml`.
  - Default workflows use `claudecode`, which expects the `claude` CLI to be installed and authenticated.
  - Other supported agent names are `codex`, `gemini`, `auggie`, `opencode`, and `pi`.
- **Repository build/test dependencies** needed by `.cycle/scripts/verify.sh`.
- **Git credentials and remote access** if `engine.commit.push: true`.

If any of those are missing, cycle may initialize successfully but fail during triage, execution, verify, commit, or push.

## Ownership boundaries

### cycle owns

These files are installed or managed by cycle:

```txt
.cycle/bin/cycle.js
.cycle/workflows.yml
.cycle/prompts/
.cycle/scripts/
.cycle/log.jsonl
.cycle/tbd.jsonl
docs/cycle/issues/
docs/cycle/<cycle-id>-<workflow>-<slug>/
```

cycle can scaffold its own engine, prompts, workflows, issue folders, queue, logs, and per-cycle artifacts.

### The repository owns

The consuming repository owns:

- its package manager and dependency install process;
- its build, lint, test, and verification commands;
- branch and merge policy;
- repo-specific workflow definitions in `.cycle/workflows.yml`;
- repo-specific prompt customizations in `.cycle/prompts/`;
- the behavior of `.cycle/scripts/verify.sh` after customization;
- whether generated cycle artifacts should be committed.

cycle can call the repo's verify script, but it cannot know every dependency or service the repo needs unless the repo encodes that in scripts and documentation.

### The host machine owns

The host machine or CI/VM image owns:

- Node.js version;
- `git` installation and authentication;
- `gh` installation and authentication;
- coding agent CLIs and their authentication state;
- network access;
- shell environment and credentials;
- language/runtime toolchains used by the repo;
- package caches and installed dependencies.

cycle currently uses this ambient environment. It does not run inside a container by default.

## Recommended setup checklist

Run these before relying on cycle unattended:

```sh
node --version                 # expect >= 22.6
git --version
git status --short
gh --version
gh auth status
claude --version               # if using the default claudecode agent
```

Confirm the repo itself can verify cleanly:

```sh
./.cycle/scripts/verify.sh
```

Confirm cycle can parse its config and inbox without mutating state:

```sh
./.cycle/bin/cycle.js triage --dry-run
```

If push is enabled, confirm the repository has a usable remote:

```sh
git remote -v
git fetch --dry-run
```

## Agent CLI expectations

Workflow steps use the `agent:` field in `.cycle/workflows.yml`.

Example:

```yaml
workflows:
  - name: feature
    steps:
      - name: spec
        agent: claudecode
      - name: verify
        agent: bash
```

The configured agent must exist on `PATH` and must already be authenticated. cycle does not log into coding agents for you.

Current agent mapping:

| Workflow agent | Expected host CLI |
|---|---|
| `claudecode` | `claude` |
| `codex` | `codex` |
| `gemini` | `gemini` |
| `auggie` | `auggie` |
| `opencode` | `opencode` |
| `pi` | `pi` |
| `bash` | shell script execution |

If a workflow references an unknown agent name, cycle fails the step. If a known agent CLI is missing or unauthenticated, the agent process fails at runtime.

`agent: bash` steps (and the walkthrough hook) run their POSIX scripts through a resolvable shell: `/bin/bash` on Linux/macOS, an auto-discovered git-bash / WSL `bash.exe` on native Windows, or an explicit `engine.shell` (`.cycle/workflows.yml`) / `CYCLE_SHELL` override. When none can be resolved the step fails with a message naming the searched paths and the fix — see [`ENGINE.md`](ENGINE.md) → *Shell resolution*.

## Git and commit expectations

cycle uses git for clean restarts, branch handling, committing, and pushing.

Depending on `engine.commit.mode`, cycle may:

- run directly on the base branch (`trunk`);
- commit locally without pushing (`local-only`);
- create/reuse cycle branches (`worktree-pr`).

If `engine.commit.push: true`, push access must already work from the host environment. cycle retries transient push failures, but it cannot fix missing credentials or an invalid remote.

## Repository dependency expectations

The initialized engine is self-contained, but the consuming repo's tests are not. If `.cycle/scripts/verify.sh` expects `npm test`, `pytest`, `go test`, a database, a browser, or another service, those dependencies must already be available.

For Node projects, that usually means running the repo's install command before asking cycle to operate:

```sh
npm install
# or pnpm install / yarn install / bun install, depending on the repo
```

For Python, Go, Rust, or polyglot repos, install the equivalent project dependencies and confirm the verify script passes before running cycle AFK.

## What cycle checks today

Today cycle validates some things when it needs them:

- workflow YAML shape and selected workflow names;
- known vs unknown workflow agents;
- prompt file presence when a step runs;
- queue and issue frontmatter shape in several paths;
- git state during branch/reset/commit operations;
- `verify.sh` failure as part of workflow execution.

These checks are useful, but many happen after work has already started.

## What cycle does not check yet

`cycle doctor` (alias `cycle preflight`) now runs the engine-start preflight on demand — it confirms the configured coding-agent CLIs are installed (and resolves them honoring `CYCLE_<AGENT>_BIN`) and that required tools (`bash`/`git` plus bash-step heads) are on PATH. See [`doctor.md`](doctor.md). It does **not** yet proactively check all of the following:

- Node.js version compatibility;
- whether `gh` is installed;
- whether the agent CLIs are authenticated;
- whether push credentials work;
- whether repo dependencies are installed;
- whether the default branch/remote can be fetched;
- whether all prompts and scripts are executable/readable before a run starts.

## Planned direction: deeper doctor checks

`cycle doctor` ships today (agent-CLI + tool resolution, read-only, safe to re-run; see [`doctor.md`](doctor.md)). It does not yet cover the broader readiness checks below — a future expansion should report actionable results such as:

```txt
✓ Node.js >= 22.6
✓ git repo detected
✓ .cycle/workflows.yml valid
✓ verify script executable
✓ agent claudecode found: claude
⚠ gh auth status could not confirm authentication
✗ origin remote is missing but push is enabled
```

The goal is to make environment readiness explicit before the production lane starts. cycle should not discover missing host prerequisites halfway through a run when it could have known at startup.
