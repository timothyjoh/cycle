# Project Brief: cycle

> What cycle is and why it exists. For *how it's built*, see
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); for engine internals, see
> [`docs/ENGINE.md`](docs/ENGINE.md).

## Core thesis

It is up to the cycle engine and workflows to ensure the stable delivery of
working software to the user, and to demonstrate that it runs both locally and
when deployed and meets the human-given criteria.

An application can never be fully specified on the first pass, so some divergence
along the way is expected and acceptable. What is not negotiable is the end
state: every cycle must leave the application in a working, demonstrated state.
"Demonstrated" is the operative word. Passing unit tests is not proof that the
software works; the engine must actually exercise the running app (locally and,
where applicable, deployed) and show it meets the issue's acceptance criteria. A
cycle that cannot demonstrate this has not succeeded, no matter how green its
unit tests look. Verification that is skipped, degraded, or stubbed is not
verification, and a false green is a failure: such a cycle must block or fail
loudly, never drain to `done/` as if it had delivered working software.

This thesis is being operationalized incrementally. The first landed slice is
the **degenerate-verification gate** (see [`docs/ENGINE.md`](docs/ENGINE.md) →
*Degenerate verification gate*): a `verify`/`final_verify` step that exits green
having executed **zero** non-skipped tests now blocks as unverified rather than
draining to `done/`. Sibling work extends this to exercising the running app in
the verify path and to treating walkthrough degradation as a blocking gate.

## Overview

**cycle** is a repo-local production cell that turns work items into
reviewable code changes. Installed into any repo — brownfield or
greenfield — it is invoked by *something else*: an agent like Claude Code,
a CI job, a cloud worker, or a developer machine, handed one or more
**issues** to work through.

An **issue** is any unit of work: a free-text task, a Jira card, a GitHub
issue, a PRD, a brief. Triage reads each issue and decides how many
**cycles** (phases of work) it needs — one if small, several if large.
Every cycle that triage produces lands in a single ordered queue. The
engine then churns through the queue one cycle at a time, each producing
its own branch and commits, until the queue is empty. This serialization is
intentional: cycle owns one repository lane and rejects concurrent engines
in that repo rather than creating avoidable merge and state conflicts.

cycle runs as a blocking subprocess that streams JSONL progress events to
stdout so the calling agent can monitor it, and writes artifacts to
`docs/cycle/` for a paper trail.

## Why a production cell, not a chat turn

A single agent turn is good at producing one change. It is weak at the
production problem: working a backlog, repeating the SDLC loop without
drift, honoring repo-specific constraints, recovering from failure, and
leaving an auditable trail. cycle is the layer that does the boring,
repeatable mechanics so a parent agent or orchestration layer can hand off
repo-local work and walk away.

The center of gravity is **issue-driven, brownfield work** handled one
issue at a time — typically from GitHub, Jira, Linear, or user-supplied
issue files dropped into the repo. Factory-scale throughput comes from
running one serialized cycle instance per repository under a higher-level
controller, not from parallel workers editing the same repository at once.

## Runtime model

- **Bootstrap.** `npx @cycleai/cli init` scaffolds the repo once. The npm
  package ships the prebuilt engine bundle as a static asset; `init`
  copies it into `.cycle/bin/cycle.js`. Upgrades:
  `npx @cycleai/cli@latest init --upgrade` refreshes the bundle and skill
  while leaving user-customized workflows / prompts / scripts in place
  (`--force` overwrites everything).
- **Node-native.** Authored in TypeScript, bundled via `esbuild` into a
  single self-contained `.cycle/bin/cycle.js` with a `#!/usr/bin/env node`
  shebang, committed executable — so the canonical invocation is
  `./.cycle/bin/cycle.js` with no `node` prefix on Unix. No transpile step
  in the dev loop: Node 22.6+ runs `.ts` directly via type stripping, and
  type-checking is a separate `tsc --noEmit`.
- **No install in the consuming repo.** After `init`, the committed bundle
  is the engine. Runtime needs only `node` (≥ 22.6), the `claude` CLI,
  `git`, and `gh`.
- Ships a Claude Code skill at `.claude/skills/cycle.md` by default (opt
  out with `cycle init --no-skill`).

## Invocation

```bash
# Single freeform task (blocking; returns when the queue is empty)
./.cycle/bin/cycle.js run "fix the login bug on Safari"

# Drop work into the inbox, drain it later
./.cycle/bin/cycle.js drop "investigate checkout double-retry"
./.cycle/bin/cycle.js run

# Force a specific workflow (skip triage's choice)
./.cycle/bin/cycle.js run --workflow quickfix "bump the lodash pin"

# Triage/queue preview only — no execution
./.cycle/bin/cycle.js run --dry-run "…"

# Read-only status and triage diagnostics
./.cycle/bin/cycle.js status
./.cycle/bin/cycle.js triage --dry-run
```

Windows / cross-platform fallback: `node .cycle/bin/cycle.js run …` works
identically.

- **Blocking by default.** The parent waits until the pending queue is
  empty. CI jobs and ephemeral containers want this exit-code contract.
- **stdout = JSONL events**, mirrored to `.cycle/log.jsonl`.
- **One engine per repo**, enforced by a PID lockfile at
  `.cycle/engine.lock`.
- **Per-cycle artifacts** land under `docs/cycle/<cycle-id>-<workflow>-<slug>/`.

### Auth and credentials

cycle defers credential management entirely to the caller. It documents no
env-var contract, runs no preflight credential check, and ships no
`doctor` subcommand. The deployment environment (developer machine, CI
secrets, container env) is responsible for ensuring `claude`, `gh`, and any
`.cycle/scripts/*.sh` have the credentials they need.

## Issue lifecycle

> **Authoritative spec:** [`docs/RFC-001-issue-lifecycle.md`](docs/RFC-001-issue-lifecycle.md).
> This is a summary.

Issues land in `docs/cycle/issues/inbox/` (the inbox). Triage runs at engine
start, and between cycles whenever `inbox/` is non-empty: it enriches each
inbox issue with codebase context, decomposes large issues into
vertical-slice children, and writes them to `docs/cycle/issues/todo/` with
a `workflow:` frontmatter field naming which workflow to run.

The folder state machine:

- **`inbox/`** — inbox. Strives to be empty while the engine runs.
- **`todo/`** — triaged, enriched, vertical-slice work items.
- **`done/`** — successful cycles; decomposed parents land here with a
  `_raw` suffix.
- **`failed/`** — cycles that exhausted their attempt budget.
- **`blocked/`** — items whose `depends_on` chain reached a failed item.

The live queue lives in `.cycle/tbd.jsonl` — a priority-ordered,
status-aware index that **drains** as cycles complete. The audit log is
separate: `.cycle/log.jsonl`, append-only, never rewritten.

CLI, tracker, and agent intake all materialize a file in `inbox/` — one
uniform input path.

## Triage

> **Authoritative spec:** [`docs/RFC-001-issue-lifecycle.md`](docs/RFC-001-issue-lifecycle.md) §5.

Triage is an **engine-internal subroutine**, not a workflow. It spawns a
configurable agent (`claudecode` by default) with a triage prompt, parses
the JSON output describing enriched children plus ordering, and applies the
queue mutations atomically.

```yaml
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
```

Triage **always enriches** (even when no decomposition is needed) and
**always picks a workflow** for each child. The original raw file moves to
`done/<id>_raw.md` once triage emits children. Children land in `todo/` as
`<parent>-<slug>.md` with `parent:` frontmatter linking them.

Per-raw retry up to 3 attempts. On partial failure — some inbox items decompose
cleanly while others exhaust attempts — the failed subset moves to
`failed/<id>.md`. If *every* raw fails in one pass, the engine emits
`engine.paused {reason: "all_triage_failed", …}` and exits, leaving the
inbox items in place so `cycle triage --dry-run` can re-evaluate them after edits.

## Workflows

A workflow is an ordered list of steps in `.cycle/workflows.yml`. Four ship
by default:

- **`feature`** — full single-pass SDLC:
  `spec → research → plan → build → review → fix → verify → reflection → final_fix → final_verify → documentation`.
- **`quickfix`** — surgical fix: `plan_fix → quick_fix → test_fix → verify`.
- **`document`** — docs/prompt edits only:
  `plan_documents → authoring → review_documents → verify`.
- **`e2e-tests`** — Playwright tests against the running app:
  `research → test_plan → test_build → review → fix → verify`.

There is **no separate `epic` workflow.** An issue that needs multiple
cycles is simply one whose triage produced multiple queue entries, each a
standalone workflow run. Default workflows are autonomous; custom workflows
can add human-in-the-loop steps.

## Branching, commit, and failure handling

- The engine owns all git operations after a cycle's steps complete,
  configured via `engine.commit` in `workflows.yml`
  (`mode: trunk | local-only | worktree-pr`, `push: true | false`).
- **`trunk`** commits straight to the base branch; **`worktree-pr`** (the
  shipped default) gives each cycle its own `cycle/<workflow>/<slug>`
  branch. After the steps pass, the engine stages the intended change
  surface, commits with subject `cycle <id>: <title>`, appends any
  `Closes #N` lines from the issue body, and pushes with backoff retry.
- **Two retry layers.** Step-level (`on_fail: retry:N`) for transient
  failures; cycle-level (default 3 attempts) abandons a bad attempt and
  re-runs the workflow on a clean tree, hard-resetting `build`/`fix` to
  pre-step HEAD and reusing pre-build artifacts.
- **Exhausted attempts** move the issue to `blocked/` and skip its
  remaining planned cycles — one bad slice never stalls the rest of the
  queue.
- **Rate limits** are orthogonal to attempt counting: on detection the engine
  emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps
  `engine.rate_limit_backoff_ms` (default 3,600,000 ms), and retries the
  same step in-process. On first clean success it emits
  `engine.resumed { reason: "rate_limit_cleared" }`. The engine never exits
  on rate-limit; retries do not increment `consecutive_failures`.
- The queue **halts** after `engine.max_consecutive_failures` consecutive
  terminal failures (default 2).

## What cycle is NOT

- **Not** a project-vision driver. There is no built-in
  brief → epic → phase roadmap loop; issues are supplied per invocation.
- **Not** a TUI. Progress is JSONL on stdout; humans monitor *through* the
  invoking agent.
- **Not** a service. The default mode is a blocking subprocess that
  processes a queue and exits. There is no always-on background process.
- **Not** an intra-repo parallel worker pool. cycle intentionally runs one
  engine per repository and one cycle at a time; multi-repo scheduling and
  fleet coordination belong to a future control plane outside the core
  engine.

## Not yet built

The engine commits and pushes today; the broader factory model is still
landing. Not yet implemented: pull-request creation and auto-merge,
stacked-branch / human-review mode, a detached daemon with `attach` /
`stop` control, multi-issue batch flags (`--issue` / `--issues-file`), and
the HTML/TUI progress viewer. This brief describes current shipped behavior.
