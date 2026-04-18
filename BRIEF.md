# Project Brief: cycle

> **Status:** Working draft. Captures the design conversation to date and the
> open questions still to be settled before implementation begins.

## Overview

**cycle** is a toolkit of autonomous development workflows installed into any
repo — brownfield or greenfield. Unlike cc-pipeline (which drives a whole
project end-to-end from a `BRIEF.md` via Epics and Phases), cycle is invoked
*by something else* — typically an agent like Claude Code or OpenClaw, or a
CI job — against a **specific task**: a bug, a feature, an epic, or a
research question.

cycle runs as a blocking subprocess, streams JSONL progress events to stdout
so the caller can monitor, writes artifacts to `docs/` for a paper trail,
and makes its own commits and pull requests.

**cycle effectively replaces cc-pipeline.**

## Contrast with cc-pipeline

| | cc-pipeline | cycle |
|---|---|---|
| Driver | `BRIEF.md` → Epics → Phases (project vision) | Per-invocation task description (bug/feature/epic/research) |
| Greenfield only? | Effectively yes | Works on brownfield and greenfield |
| Who invokes it | Human runs `npx cc-pipeline run` | Another agent (Claude Code, OpenClaw, …) or a CI job |
| Install model | `node_modules` dependency via `npx` | Single bundled file committed into `.cycle/bin/` |
| UI | TUI | None. JSONL events on stdout for programmatic monitoring |
| Workflow shape | One fixed linear workflow | Multiple named workflows, picked by triage or caller |
| Run lifecycle | Long-lived loop over phases | One task per invocation; blocks until done; exits |

## Tech Stack

- Authored in JavaScript/TypeScript.
- Bundled (rollup / esbuild) into a single self-contained file at
  `.cycle/bin/cycle.js` — no `npm install` required in the consuming repo.
- Runtime on the consuming repo: **node** + **`claude` CLI**. Nothing else.
- Also packageable as a Claude Code skill that wraps the CLI.
- Must run locally, in **GitHub Actions**, and in **ephemeral containers**
  spun up to handle a single bug or feature request.

## Invocation Contract

An agent or CI job calls:

```bash
node .cycle/bin/cycle.js run "fix the login bug on Safari"
node .cycle/bin/cycle.js run --issue JIRA-123
node .cycle/bin/cycle.js run --workflow feature "add CSV export"
node .cycle/bin/cycle.js run --dry-run "..."    # triage only, no execution
```

- **Blocking.** The parent agent waits for completion.
- **stdout = JSONL events** (`{"event":"step.start","step":"plan",…}`) the
  parent parses to surface live progress back to the human.
- **Artifacts on disk** in `docs/cycle/<run-id>/` for the paper trail.
- Each run produces its own commits and a pull request (except `research`).

## Triage (always runs first, unless `--workflow` overrides)

cycle's first step classifies the incoming task:

- **bug** → lightweight `bug` workflow (single pass)
- **feature** → full SDLC `feature` workflow (single pass)
- **epic** → `epic` meta-workflow: decompose into N phases, then run `feature`
  once per phase

If the task is classified as epic, triage also produces the phase decomposition
so the epic workflow can iterate through them.

## Default Workflow Library

### `research`
Read-only codebase analysis. No commits. No PR.
`investigate → findings` → writes `FINDINGS.md` to `docs/cycle/<run-id>/`.

### `bug`
Lightweight fix path.
`investigate → fix → verify → commit → pr`

### `feature`
Full SDLC, single pass.
`spec → research → plan → build → review → fix → verify → commit → pr`

### `epic`
Meta-workflow that decomposes and loops.
`decompose → loop(feature) per phase → wrap-up`
Each phase is an independent `feature` run with its own commits and PR.

Default workflows are **autonomous**. Custom workflows can add human-in-the-loop
steps later.

## Artifacts & State

- Per-run artifacts live in `docs/cycle/<run-id>/` (SPEC.md, PLAN.md,
  REVIEW.md, FINDINGS.md, etc.).
- Maintainers can keep or prune `docs/cycle/`; the default is to keep it as a
  paper trail of changes and fixes over time.
- Per-run event log (exact location TBD — see open questions).

## Configuration

Workflows are defined in YAML (same pattern as cc-pipeline's `workflow.yaml`,
but multi-workflow). Projects can add or override workflows. Steps reference
prompt templates in `.cycle/prompts/`. Agents per step (`claudecode`,
`codex`, `bash`) are configurable.

## What cycle is NOT

- **Not** a project vision driver. No `BRIEF.md` → Epic → Phase loop. A task
  description is supplied per invocation.
- **Not** a TUI. Progress is JSONL on stdout; humans monitor *through* the
  invoking agent, not directly.
- **Not** a long-running daemon. One invocation = one run; it blocks until
  done; it exits.

---

## Open Questions

### 1. Branching & PR strategy
- Per-run branch off `main` (or configured base), naming like
  `cycle/<workflow>/<slug>` (e.g., `cycle/bug/safari-login`)?
- For an epic with 4 phases: four independent branches each PRing `main`,
  or stacked (phase-2 off phase-1)?
  - Independent is simpler; can't express sequential dependencies.
  - Stacked handles dependencies but is harder to land.

### 2. State log location
- One log per run at `.cycle/runs/<run-id>/events.jsonl`, plus a
  `.cycle/index.jsonl` global index?
- Or one append-only global log like cc-pipeline's `pipeline.jsonl`?

### 3. Resume semantics
- Should `cycle run --resume <run-id>` pick up an interrupted run from its
  events log?
- Or is every invocation a fresh run — the caller re-issues the original task?
- CI containers are ephemeral so resume matters less there; matters more for
  long local epics.

### 4. Epic failure handling
- If phase 2 of a 4-phase epic fails (e.g., review produces must-fixes that
  `fix` can't resolve), does cycle exit non-zero and surface the failure to
  the parent agent so *it* decides what to do?
- Or does cycle have a baked-in retry/escalate policy?

### 5. Skill packaging
- Is a Claude Code skill a first-class deliverable alongside the CLI, or a
  nice-to-have?
- How does the skill surface a blocking, possibly long-running invocation
  (especially for `epic`) within a single parent agent turn?

### 6. `init` scope
What exactly does `cycle init` install into a target repo? Strawman:
  - `.cycle/bin/cycle.js` (bundled engine)
  - `.cycle/workflows/*.yaml` (default workflow definitions)
  - `.cycle/prompts/*.md` (default prompt templates)
  - `.cycle/CLAUDE.md` (config docs for Claude Code)
  - A skill file under `.claude/skills/` (if skill packaging is included)
  - Anything else?

### 7. Definition of Done for the cycle project itself
- MVP = can invoke `bug` and `feature` workflows against a simple test repo
  and produce a PR?
- How many phases of cc-pipeline work to reach MVP?
