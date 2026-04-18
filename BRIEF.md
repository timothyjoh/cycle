# Project Brief: cycle

> **Status:** Working draft. Captures the design discussion to date —
> decisions that are settled, and open questions still to resolve before
> implementation begins.

## Overview

**cycle** is an engine that turns work items into code changes. Installed
into any repo — brownfield or greenfield — it's invoked by *something
else* (an agent like Claude Code or OpenClaw, or a CI job) with one or
more **issues** to work through.

An **issue** is any unit of work: a free-text task, a Jira card, a GitHub
issue, a PRD, a BRIEF. Cycle's triage reads each issue and decides how
many **cycles** (phases of work) it needs — one if small, many if big.
Every cycle produced by triage lands in a single ordered queue. The
engine then churns through the queue one cycle at a time, each producing
its own branch, PR, and merge back to `main`, until the queue is empty.

Cycle runs as a blocking subprocess that streams JSONL progress events to
stdout so the calling agent can monitor, and writes artifacts to
`docs/cycle/` for a paper trail.

**cycle effectively replaces cc-pipeline.**

## Contrast with cc-pipeline

| | cc-pipeline | cycle |
|---|---|---|
| Driver | `BRIEF.md` → Epics → Phases (project vision) | 1+ issues per invocation (task, Jira card, GH issue, PRD, BRIEF) |
| Greenfield only? | Effectively yes | Works on brownfield and greenfield |
| Who invokes it | Human runs `npx cc-pipeline run` | Another agent (Claude Code, OpenClaw, …) or a CI job |
| Install model | `node_modules` via `npx` | Single bundled file committed into `.cycle/bin/` |
| UI | TUI | None — JSONL events on stdout for programmatic monitoring |
| Workflow shape | One fixed linear workflow | Library of named workflows; triage picks per cycle |
| Unit of work | Phase within a project vision | Cycle — one workflow run against one scoped piece of an issue |
| Run lifecycle | Long-lived loop across project phases | Processes a queue of cycles until empty, then exits |

## Tech Stack

- Authored in JavaScript/TypeScript.
- Bundled (rollup / esbuild) into a single self-contained file at
  `.cycle/bin/cycle.js` — no `npm install` required in the consuming repo.
- Runtime on the consuming repo: **node** + **`claude` CLI** + **git** +
  **`gh`**. Nothing else.
- Also packageable as a Claude Code skill that wraps the CLI.
- Must run locally, in **GitHub Actions**, and in **ephemeral containers**
  spun up to handle a batch of work.

## Invocation Contract

```bash
# Single freeform task
node .cycle/bin/cycle.js run "fix the login bug on Safari"

# Single issue from a tracker
node .cycle/bin/cycle.js run --issue JIRA-123

# A batch of issues
node .cycle/bin/cycle.js run --issues-file issues.json
cat issues.json | node .cycle/bin/cycle.js run --issues-stdin

# Force a specific workflow (skip triage)
node .cycle/bin/cycle.js run --workflow feature "add CSV export"

# Triage only, no execution
node .cycle/bin/cycle.js run --dry-run "…"

# Choose merge mode (default: auto)
node .cycle/bin/cycle.js run --merge-mode stack "…"
```

- **Blocking.** The parent agent waits until the pending queue is empty.
- **stdout = JSONL events** (mirrored to `.cycle/log.jsonl`).
- **Per-cycle artifacts** under `docs/cycle/<cycle-id>-<workflow>-<slug>/`.
- **Each cycle produces its own commits, branch, and PR.**

## Issue Ingestion

Every issue is materialized as a markdown file with YAML frontmatter
inside a three-stage folder state machine that shadows `tbd.jsonl`:

- **`docs/cycle/issues/tbd/`** — inbox. External agents drop new issue
  files here; cycle itself writes here when CLI input is provided.
- **`docs/cycle/issues/queued/`** — the engine has noticed the file and
  added its line to `tbd.jsonl`; awaiting triage.
- **`docs/cycle/issues/triaged/`** — triage has decomposed the issue
  into cycles. Frontmatter `cycles:` is populated; `completed_at:` is
  appended when every cycle has merged.
- **`docs/cycle/issues/failed/`** — triage exhausted its retries.
  Move a file back to `tbd/` to try again.

**CLI input is uniform with file-based input.** `cycle run --issue
JIRA-123`, `cycle run --issues-file …`, and `cycle run "freeform"` all
materialize files in `tbd/` first, then the engine processes them via
the same scan loop. One code path, one audit trail.

### Scan lifecycle

The engine scans `tbd/` at two moments:

1. On `engine.start` — picks up anything dropped since last run.
2. Before emitting `engine.stop` — if new files appear, keep running
   instead of exiting.

For each new file: **move first to `queued/`, then append** to
`tbd.jsonl` (dedup by `id`). Move-first ordering makes crashes
recoverable — a file in `queued/` with no matching `tbd.jsonl` line is
re-added on the next scan.

Ordering: FIFO by file mtime; optional `priority:` frontmatter (higher
first, ties broken by mtime).

### Frontmatter schema

```yaml
---
id: JIRA-123                    # required, unique identifier
source: jira                    # text | jira | linear | github | file
title: "Safari login broken"    # required
priority: 5                     # optional; higher = sooner
workflow: feature               # optional; force workflow, skip triage classification
depends_on: [JIRA-100]          # optional; defer until these are in triaged/
added_at: 2026-04-18T10:15:00Z
triage_attempts: 0              # engine-managed
cycles: [0042, 0043]            # populated after triage
completed_at: 2026-04-18T12:47:00Z  # populated when all cycles merged
---
```

Body of the markdown = issue description. A template lives at
`docs/cycle/issues/TEMPLATE.md` for external agents to copy.

## Triage (lazy, per issue)

When an issue is popped from `tbd.jsonl`, the engine runs triage on its
file in `queued/`. Triage produces a structured classification:

```json
{
  "issue_id": "JIRA-123",
  "cycles": [
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "bug",     "title": "…", "spec": "…" }
  ]
}
```

On success: write `TRIAGE.md` into the first cycle's artifact dir,
populate `cycles:` in the issue frontmatter, move the file to
`triaged/`, and run the cycles in order.

On failure (invalid JSON, agent refusal, etc.): increment
`triage_attempts` in frontmatter, re-attempt on the next loop iteration.
After 3 attempts, move to `failed/` with a `FAILURE.md` note.

Triage is lazy — it runs per issue, just before that issue's cycles. The
backlog in `tbd.jsonl` + `tbd/` stays meaningful as a visible queue.
Crash-resume is trivial: whatever's in the folders and `tbd.jsonl` when
the engine restarts is the remaining work.

## Default Workflow Library

### `research`
Read-only codebase analysis. No commits, no PR.
`investigate → findings` → writes `FINDINGS.md`.

### `bug`
Lightweight fix path.
`investigate → fix → verify → commit → pr`

### `feature`
Full SDLC, single pass.
`spec → research → plan → build → review → fix → verify → commit → pr`

There is **no separate `epic` workflow.** Issues that need multiple
cycles are simply issues whose triage produced multiple queue entries —
each entry is a standalone `bug` / `feature` / `research` cycle.

Default workflows are autonomous. Custom workflows can add
human-in-the-loop steps later.

## Branching & Merge Modes

**Default: `auto` — "dark factory" mode.**
Each cycle branches off the current tip of `main` as
`cycle/<workflow>/<slug>`, opens a PR, and auto-merges via
`gh pr merge --squash --auto`. Branch protection (required checks,
required reviews if configured) enforces quality. The next cycle starts
from the updated `main` so it sees the prior cycle's code. Linear
history.

**`--merge-mode stack` — human-review mode.**
Cycle N+1 branches off cycle N's branch instead of `main`, so it sees
N's code without waiting for merge. Each cycle opens a PR but does not
block on merge. Humans review and merge the stack bottom-up in the
tracker.

Git worktrees are deferred — future optional feature, not MVP.

## Artifacts & State

**Engine state (`.cycle/`).**
- `.cycle/log.jsonl` — global append-only event log. Source of truth for
  everything that has happened. Never rewritten.
- `.cycle/tbd.jsonl` — pending untriaged issues. One line per issue;
  mutated as the engine consumes work.

**Issues (`docs/cycle/issues/`).** Four folders — `tbd/`, `queued/`,
`triaged/`, `failed/` — plus a `TEMPLATE.md`. See Issue Ingestion.

**Per-cycle artifacts (`docs/cycle/<cycle-id>-<workflow>-<slug>/`).**
E.g., `docs/cycle/0042-feature-safari-login/`, containing SPEC.md,
PLAN.md, REVIEW.md, FINDINGS.md, TRIAGE.md (on the first cycle of a
triage), etc. Committed into that cycle's PR. Maintainers can keep or
prune later; default is to keep as a paper trail.

Cycle IDs are 4-digit zero-padded integers (`0001` through `9999`),
globally unique within the project repo, allocated at cycle start by
scanning `log.jsonl` for the highest existing ID.

These files also form the read contract for future tooling — a TUI and a
bun-backed HTML viewer that render queue progress from `tbd.jsonl` +
`log.jsonl` in real time.

## Configuration

Workflows are defined in YAML under `.cycle/workflows/`. Projects can add
or override workflows. Steps reference prompt templates in
`.cycle/prompts/`. Agents per step (`claudecode`, `codex`, `bash`) are
configurable.

## What cycle is NOT

- **Not** a project vision driver. No BRIEF → Epic → Phase loop of its
  own. A list of issues is supplied per invocation.
- **Not** a TUI. Progress is JSONL on stdout; humans monitor *through*
  the invoking agent.
- **Not** a long-running daemon. One invocation processes a queue and
  exits.

---

## Resolved Decisions

**Branching & PR strategy (Open Q #1).**
Each cycle creates a branch `cycle/<workflow>/<slug>` off the configured
base. Default `--merge-mode auto` auto-merges via
`gh pr merge --squash --auto`, relying on branch protection.
`--merge-mode stack` branches each cycle off the prior cycle's branch for
human-review workflows. Queue execution is sequential. No worktrees in
MVP.

**State model (Open Q #2).**
Two global files at `.cycle/`: `log.jsonl` (append-only event history,
source of truth) and `tbd.jsonl` (pending untriaged issues, mutated as
consumed). No per-run subdirectory, no per-run ID. Cycles are the only
persistent identity: 4-digit zero-padded, globally unique within the
repo. Per-cycle artifacts at
`docs/cycle/<cycle-id>-<workflow>-<slug>/`.

**Resume semantics (Open Q #3).**
Largely falls out of the state model: re-invoking `cycle run` with no
arguments continues consuming whatever is still in `tbd.jsonl`. No
explicit `--resume` flag needed. A crashed engine leaves its pending
queue in place for the next invocation.

---

## Open Questions

### 4. Queue failure handling
- If cycle 3 of 12 fails (unresolvable review findings, verify fails
  after retry, push fails), does the engine stop the whole queue and
  exit non-zero? Skip the failed cycle and continue? Retry?
- Does the answer differ between `auto` and `stack` merge modes?

### 5. Skill packaging
- Is a Claude Code skill a first-class deliverable alongside the CLI, or
  nice-to-have?
- How does the skill surface a long-running queue invocation within a
  single parent agent turn?

### 6. `init` scope
What exactly does `cycle init` install? Strawman:
  - `.cycle/bin/cycle.js` (bundled engine)
  - `.cycle/workflows/*.yaml` (default workflows)
  - `.cycle/prompts/*.md` (default prompt templates)
  - `.cycle/CLAUDE.md` (config docs for Claude Code)
  - A skill file under `.claude/skills/` if skill packaging is included

### 7. Definition of Done for the cycle project itself
- MVP = can invoke `bug` and `feature` workflows against a simple test
  repo and produce a PR?
- How many phases of work to reach MVP?
