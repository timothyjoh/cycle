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

- **Blocking.** The parent agent waits for completion of the *whole queue*.
- **stdout = JSONL events** (including queue progress — cycle K of N).
- **Artifacts in `docs/cycle/<run-id>/`** for the paper trail.
- **Each cycle produces its own commits, branch, and PR.**

## Triage

Cycle's first step on each incoming issue is triage — a structured
classification that outputs one or more cycles:

```json
{
  "issue_id": "JIRA-123",
  "cycles": [
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "bug",     "title": "…", "spec": "…" }
  ]
}
```

Small issues produce a single-entry list. Larger issues decompose into
multiple. All entries from all issues flatten into one ordered queue that
the engine then processes sequentially.

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

- Per-run artifacts at `docs/cycle/<run-id>/`, with per-cycle
  subdirectories (SPEC.md, PLAN.md, REVIEW.md, FINDINGS.md, TRIAGE.md,
  etc.).
- Committed into each cycle's PR. Maintainers can prune later; default is
  to keep as a paper trail of changes and fixes over time.
- Per-run event log (exact location TBD — see Open Questions).

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

---

## Open Questions

### 2. State log location
- One log per run at `.cycle/runs/<run-id>/events.jsonl`, plus a
  `.cycle/index.jsonl` global index?
- Or one append-only global log like cc-pipeline's `pipeline.jsonl`?

### 3. Resume semantics
- Should `cycle run --resume <run-id>` pick up an interrupted queue from
  its events log (e.g., start from cycle K+1 if cycle K completed)?
- Or is every invocation fresh — the caller re-issues the remaining
  issues?
- More relevant now that a single invocation can be long (12-cycle queues).

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
