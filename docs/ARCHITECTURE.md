# cycle — Architecture

> Companion to [`BRIEF.md`](../BRIEF.md). Where BRIEF explains *what* cycle is
> and *why*, this document explains *how* it's put together.

## 1. System Context

cycle is not a top-level application. It's a library of workflows invoked by
**something else** — a parent agent or a CI job — and it acts on the local
working tree of the repo it's installed in.

```
┌──────────────────────────────────────┐
│  Parent caller                       │
│  (Claude Code, OpenClaw, GH Actions) │
└────────────────┬─────────────────────┘
                 │  spawn + stdin task
                 ▼
┌──────────────────────────────────────┐
│  cycle (node .cycle/bin/cycle.js)    │
│  ┌────────────────────────────────┐  │
│  │ triage → workflow → steps      │  │
│  └────────┬──────────────┬────────┘  │
│           │              │           │
│           ▼              ▼           │
│     ┌────────┐    ┌───────────┐      │
│     │ claude │    │   git /   │      │
│     │  CLI   │    │   bash    │      │
│     └────────┘    └───────────┘      │
└────────────────┬─────────────────────┘
                 │  JSONL events (stdout)
                 │  artifacts (docs/cycle/<run-id>/)
                 │  commits + PR (git + gh)
                 ▼
        Parent caller observes
```

Contracts:
- **In:** a natural-language task (positional arg) or an issue reference
  (`--issue`) which cycle fetches and normalizes.
- **Out:** JSONL event stream on stdout; durable artifacts under
  `docs/cycle/<run-id>/`; one or more commits and a PR (except `research`);
  a final exit code.

## 2. Distribution & Runtime

### What ships into the consuming repo

`cycle init` installs (proposed):

```
.cycle/
├── bin/
│   └── cycle.js          # Single-file bundled engine (rollup / esbuild)
├── workflows/
│   ├── research.yaml
│   ├── bug.yaml
│   ├── feature.yaml
│   └── epic.yaml         # Default workflow definitions
├── prompts/
│   ├── triage.md
│   ├── investigate.md
│   ├── spec.md
│   ├── research.md
│   ├── plan.md
│   ├── build.md
│   ├── review.md
│   ├── fix.md
│   ├── verify.md
│   ├── decompose.md
│   └── wrap-up.md         # Default prompt templates
└── CLAUDE.md              # Config docs for agents working on this repo
.claude/
└── skills/
    └── cycle.md           # (optional) Claude Code skill wrapping the CLI
```

### Runtime requirements

The only things that must exist in the container / environment running cycle:

- **node** (≥ 18) — to execute the bundled `cycle.js`
- **`claude` CLI** — for the `claudecode` agent used by most steps
- **git** and **`gh`** — for commits, pushes, and PR creation
- Optional: **`codex`** CLI — if workflows route any step through Codex
- Optional: **`jira` / `linear` / GitHub API access** — only if `--issue` is
  used and cycle needs to fetch remote ticket content

No `npm install` in the consuming repo. No persistent services. No daemon.

## 3. Invocation Contract

### CLI

```bash
node .cycle/bin/cycle.js run "<task text>"
node .cycle/bin/cycle.js run --issue <ticket-id>
node .cycle/bin/cycle.js run --workflow <name> "<task text>"
node .cycle/bin/cycle.js run --dry-run "<task text>"    # triage only
```

Flags (strawman):

| Flag | Purpose |
|---|---|
| `--issue <id>` | Fetch a ticket (Jira / Linear / GH Issue) and use it as the task |
| `--workflow <name>` | Skip triage; force a specific workflow |
| `--dry-run` | Run triage only; print the classification and phase decomposition; no execution |
| `--base <branch>` | Override the PR base branch (default: `main`) |
| `--run-id <id>` | Override auto-generated run ID |
| `--no-pr` | Commit locally but don't push or open a PR |

### Execution model

- **Blocking.** The parent caller `spawn`s cycle and waits for exit. One
  invocation = one run. No background daemon, no detachment.
- **stdout = JSONL.** Every significant event is a single JSON line. The
  parent agent parses these to update its own UI or decision-making.
- **stderr = freeform.** Human-legible log output, errors, stack traces.
  Parents can ignore or relay it.
- **Exit code.** `0` on success, non-zero on failure (including unresolvable
  review findings, verify failures, push / PR errors).

### JSONL event schema (strawman)

```jsonl
{"ts":"2026-04-17T19:30:00Z","event":"run.start","run_id":"…","task":"…","workflow":null}
{"ts":"…","event":"triage.decision","workflow":"feature","rationale":"…"}
{"ts":"…","event":"step.start","step":"spec","agent":"claudecode"}
{"ts":"…","event":"step.end","step":"spec","duration_ms":12345,"status":"ok","artifact":"docs/cycle/<run-id>/SPEC.md"}
{"ts":"…","event":"commit","sha":"…","message":"…"}
{"ts":"…","event":"pr.opened","url":"https://github.com/…","number":42}
{"ts":"…","event":"run.end","status":"ok","duration_ms":987654}
```

The schema is intentionally flat and additive — new `event` types can be
introduced without breaking parsers that ignore unknowns.

## 4. Execution Model

### Run lifecycle

1. **Parse args.** Resolve task text (from arg or `--issue` fetch).
2. **Bootstrap run.** Allocate `run-id`; create `docs/cycle/<run-id>/` and
   per-run event log; emit `run.start`.
3. **Triage.** Unless `--workflow` is set, run the triage step. It produces
   a classification (`bug` / `feature` / `epic` / `research`) and, for
   `epic`, a phase decomposition.
4. **Dispatch.** Load the chosen workflow YAML. Execute its steps in order.
5. **Finalize.** Commit, push, open PR (unless `--no-pr` or `research`).
   Emit `run.end` and exit.

### Triage

Triage is the always-first step when no `--workflow` is given. It's a single
`claudecode` invocation whose prompt asks for a structured JSON output:

```json
{
  "workflow": "bug" | "feature" | "epic" | "research",
  "rationale": "…",
  "phases": [ { "title": "…", "summary": "…" }, … ]   // only if workflow == "epic"
}
```

`phases` is ignored for non-epic classifications. Triage output lives at
`docs/cycle/<run-id>/TRIAGE.md` (human-readable) and is parsed to pick the
next workflow.

### Workflows

A workflow is a YAML file declaring an ordered list of steps:

```yaml
# .cycle/workflows/feature.yaml
name: feature
description: Full SDLC pass for a single feature.
steps:
  - name: spec
    agent: claudecode
    prompt: prompts/spec.md
  - name: research
    agent: claudecode
    prompt: prompts/research.md
  - name: plan
    agent: claudecode
    prompt: prompts/plan.md
  - name: build
    agent: claudecode
    prompt: prompts/build.md
  - name: review
    agent: claudecode
    prompt: prompts/review.md
  - name: fix
    agent: claudecode
    prompt: prompts/fix.md
    skip_unless: MUST-FIX.md
  - name: verify
    agent: bash
    command: scripts/verify.sh
  - name: commit
    agent: bash
    command: scripts/commit.sh
  - name: pr
    agent: bash
    command: scripts/pr.sh
```

Per-step configurable fields (strawman):

| Field | Meaning |
|---|---|
| `name` | Step identifier — also referenced by skip conditions |
| `agent` | One of `claudecode`, `codex`, `bash` |
| `prompt` | Path (relative to `.cycle/`) to the prompt template (for AI agents) |
| `command` | Shell command (for `bash` agent) |
| `model` | Override model for this step (e.g., `claude-opus-4-7`) |
| `skip_unless` | Only run if the named artifact exists |
| `timeout` | Per-step inactivity / wall-clock cap |
| `on_fail` | `exit` (default) \| `continue` \| `retry:N` |

### Agents

| Agent | Execution | Use for |
|---|---|---|
| `claudecode` | Claude Agent SDK (in-process) or `claude -p` (piped) | All AI steps by default |
| `codex` | `codex exec --yolo` subprocess | Alternative for build / fix / review |
| `bash` | Direct shell | `verify`, `commit`, `pr`, scripts |

Agent implementations live in the bundled engine; users can't add new agent
types without a rebuild of `cycle.js` (explicitly out of scope for MVP).

## 5. Workflow Library

### `research` (read-only)

```
investigate → findings
```

No commits, no PR. Writes `FINDINGS.md` to `docs/cycle/<run-id>/`. Useful
when the parent agent just wants a codebase analysis without changes.

### `bug`

```
investigate → fix → verify → commit → pr
```

Lightweight fix path. `investigate` reproduces and locates root cause.
`fix` applies the change. `verify` runs tests / reproduction.

### `feature`

```
spec → research → plan → build → review → fix → verify → commit → pr
```

Full SDLC pass. `fix` is conditional — only runs if `review` produced
must-fixes.

### `epic` (meta-workflow)

```
decompose → loop(feature) per phase → wrap-up
```

`decompose` produces N phase definitions in
`docs/cycle/<run-id>/phases/phase-K/`. The engine then runs the `feature`
workflow once per phase. Each phase produces its own branch, commits, and
PR. `wrap-up` writes a cross-phase summary.

## 6. State & Artifacts

### Per-run artifact directory (durable)

```
docs/cycle/<run-id>/
├── TASK.md              # Normalized task description
├── TRIAGE.md            # Triage decision
├── SPEC.md              # (feature)
├── RESEARCH.md          # (feature)
├── PLAN.md              # (feature)
├── REVIEW.md            # (feature)
├── FINDINGS.md          # (research)
├── phases/              # (epic)
│   ├── phase-1/
│   │   ├── SPEC.md
│   │   ├── PLAN.md
│   │   └── REVIEW.md
│   └── …
└── WRAP-UP.md           # (epic)
```

These files are committed as part of the PR. Maintainers can choose to keep
them as a paper trail or prune later; default is to keep.

### Per-run event log (engine-private)

`.cycle/runs/<run-id>/events.jsonl` — same JSONL lines emitted to stdout,
persisted so a parent agent can introspect after the fact.

> **Open:** whether this is the right location, and whether there's also a
> global index. See [`BRIEF.md`](../BRIEF.md) §Open Questions #2.

### Run ID

Generated at run start. Proposed format: `YYYYMMDD-HHMMSS-<slug>` where
`<slug>` is derived from the task title. Collision-free enough for the
single-machine / single-invocation-at-a-time model.

## 7. Branching & PR Flow

> **Open.** See [`BRIEF.md`](../BRIEF.md) §Open Questions #1 for the stacked
> vs independent epic branching decision. Strawman below.

**Bug / feature.** One branch per run, off `main` (or `--base`), named
`cycle/<workflow>/<slug>`. One PR targeting `main`.

**Epic.** `decompose` writes N phase specs. Each phase creates its own
branch `cycle/epic/<slug>/phase-<k>` — strawman is **independent branches
off `main`**, each with its own PR. Sequential dependencies between phases
are handled by merging earlier PRs before later phases are built (the
engine awaits human merge or uses `gh pr merge --auto`).

Commit and PR logic lives in `bash` steps (`scripts/commit.sh`,
`scripts/pr.sh`) that ship in `.cycle/`, so projects can customize (e.g.,
sign commits, specific PR template, different default reviewer).

## 8. Anatomy of a Typical Run

Example: parent agent invokes cycle with `"fix the login bug on Safari"`.

1. Parent runs `node .cycle/bin/cycle.js run "fix the login bug on Safari"`.
2. cycle parses the task, allocates run-id `20260417-1930-safari-login`,
   creates `docs/cycle/20260417-1930-safari-login/` and
   `.cycle/runs/20260417-1930-safari-login/events.jsonl`.
3. Emits `run.start`. Parent agent starts showing live status.
4. Triage runs: classifies as `bug`. Writes `TRIAGE.md`. Emits
   `triage.decision`.
5. `bug` workflow loads. Engine creates branch
   `cycle/bug/safari-login` off `main`.
6. Steps run in order, each emitting `step.start` / `step.end`:
   - `investigate` → writes notes into `TASK.md`; pinpoints a cookie issue.
   - `fix` → edits source files.
   - `verify` → runs `npm test`; passes.
   - `commit` → `git commit` with generated message.
   - `pr` → `gh pr create`; emits `pr.opened` with the URL.
7. `run.end` with `status: ok`. Exit 0.

Parent agent sees the PR URL in the JSONL stream and surfaces it to the
human.

## 9. Extensibility

- **New workflows.** Drop a YAML file in `.cycle/workflows/` referencing
  prompts in `.cycle/prompts/`. The CLI auto-discovers it and it becomes a
  valid `--workflow` argument (and can be chosen by triage if the triage
  prompt is updated).
- **New prompts.** Edit markdown files in `.cycle/prompts/` — no rebuild
  needed.
- **New agent types.** Out of scope for MVP; would require a rebuild of
  `.cycle/bin/cycle.js`.
- **Custom commit / PR logic.** Override `scripts/commit.sh` or
  `scripts/pr.sh` in `.cycle/` (or wherever the workflow YAML points).

## 10. Failure Modes

| Failure | Behavior (strawman) |
|---|---|
| `verify` step fails after `fix` | Re-enter `fix` once; if still failing, exit non-zero |
| `review` produces must-fixes `fix` can't resolve | Exit non-zero; surface to parent |
| Remote push / PR creation fails | Exit non-zero; artifacts remain on disk; branch remains |
| Triage produces an invalid classification | Exit non-zero with parse error |
| Epic phase 2 fails mid-loop | Exit non-zero; phase 1 PR already exists and stands; parent decides whether to retry remaining phases |

> **Open.** Retry / escalate policy is largely TBD. See
> [`BRIEF.md`](../BRIEF.md) §Open Questions #4.

## 11. Integration Surfaces

### Claude Code / OpenClaw (parent agent)

Spawns cycle, parses JSONL events, relays progress back to its human
operator. Because cycle is blocking and can take 30+ minutes for an epic,
the parent agent is effectively pinned until cycle exits — which is
acceptable for the current design but is worth revisiting if longer runs
become common.

### Claude Code skill

A thin skill at `.claude/skills/cycle.md` tells Claude Code "when the user
asks you to run a cycle workflow, invoke `node .cycle/bin/cycle.js run
…`." The skill is optional and independent of the CLI; the CLI is
authoritative.

### GitHub Actions

A workflow file in the consuming repo (e.g.,
`.github/workflows/cycle-on-issue.yml`) that triggers on an issue label or
comment, spins up a container with node + `claude` + repo checkout, and
invokes `node .cycle/bin/cycle.js run --issue ${{ github.event.issue.number }}`.
The resulting PR lands on `main` for human review.

### Ephemeral bug-fix containers

Same pattern as Actions, but via whatever orchestrator the user prefers
(Daytona, devcontainers, custom Docker). The self-contained `.cycle/bin/`
means the container only needs node + `claude` preinstalled.

---

## 12. Open Architectural Questions

Tracked in [`BRIEF.md`](../BRIEF.md) §Open Questions. Summary:

1. Branching & PR strategy (independent vs stacked for epics).
2. State log location (per-run vs global).
3. Resume semantics (`--resume` vs always-fresh).
4. Epic failure handling (exit vs baked-in retry).
5. Skill packaging (first-class vs nice-to-have).
6. `init` scope (confirm the directory layout above).
7. Definition of Done for cycle's own MVP.
