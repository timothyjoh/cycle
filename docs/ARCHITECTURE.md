# cycle — Architecture

> Companion to [`BRIEF.md`](../BRIEF.md). Where BRIEF explains *what* cycle
> is and *why*, this document explains *how* it's put together.

## 1. System Context

cycle is not a top-level application. It's a library + engine invoked by
**something else** — a parent agent or a CI job — and it acts on the
local working tree of the repo it's installed in.

```
┌──────────────────────────────────────┐
│  Parent caller                       │
│  (Claude Code, OpenClaw, GH Actions) │
└────────────────┬─────────────────────┘
                 │  spawn + 1 or more issues
                 ▼
┌──────────────────────────────────────┐
│  cycle (node .cycle/bin/cycle.js)    │
│  ┌────────────────────────────────┐  │
│  │ ingest issues                  │  │
│  │   → triage each → [cycles…]    │  │
│  │   → flatten into queue         │  │
│  │   → run cycles sequentially    │  │
│  └────────┬──────────────┬────────┘  │
│           │              │           │
│           ▼              ▼           │
│     ┌────────┐    ┌───────────┐      │
│     │ claude │    │ git / gh  │      │
│     │  CLI   │    │  / bash   │      │
│     └────────┘    └───────────┘      │
└────────────────┬─────────────────────┘
                 │  JSONL events (stdout)
                 │  artifacts (docs/cycle/<run-id>/)
                 │  commits + branches + PRs (+ merges)
                 ▼
        Parent caller observes
```

Contracts:

- **In:** one or more *issues*. An issue is any unit of work — free-text
  task, Jira card, GH issue, PRD, BRIEF. Provided positionally
  (`"task text"`), via `--issue <id>` (fetched from a tracker), via a
  file (`--issues-file`), or on stdin (`--issues-stdin`).
- **Out:** JSONL event stream on stdout; durable artifacts under
  `docs/cycle/<run-id>/`; one branch, commit set, and PR per cycle in the
  queue; a final exit code.

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
│   └── feature.yaml      # Default workflow definitions
├── prompts/
│   ├── triage.md
│   ├── investigate.md
│   ├── spec.md
│   ├── research.md
│   ├── plan.md
│   ├── build.md
│   ├── review.md
│   ├── fix.md
│   └── verify.md         # Default prompt templates
├── scripts/
│   ├── commit.sh
│   ├── pr.sh
│   └── merge.sh          # Git / gh helpers invoked by bash steps
└── CLAUDE.md             # Config docs for agents working on this repo
.claude/
└── skills/
    └── cycle.md          # (optional) Claude Code skill wrapping the CLI
```

### Runtime requirements

- **node** (≥ 18) — to execute bundled `cycle.js`
- **`claude` CLI** — for the `claudecode` agent
- **git** and **`gh`** — branches, commits, PRs, auto-merge
- Optional: **`codex`** — if a workflow routes a step through Codex
- Optional: **tracker API access** (Jira / Linear / GitHub) — only when
  `--issue` needs a remote fetch

No `npm install` in the consuming repo. No persistent services. No
daemon.

## 3. Invocation Contract

### CLI

```bash
node .cycle/bin/cycle.js run "<task text>"
node .cycle/bin/cycle.js run --issue <ticket-id>
node .cycle/bin/cycle.js run --issues-file <path>
cat issues.json | node .cycle/bin/cycle.js run --issues-stdin
node .cycle/bin/cycle.js run --workflow <name> "<task text>"
node .cycle/bin/cycle.js run --dry-run "<task text>"
node .cycle/bin/cycle.js run --merge-mode {auto|stack} "…"
```

Flags (strawman):

| Flag | Purpose |
|---|---|
| `--issue <id>` | Fetch a ticket from Jira / Linear / GH Issues |
| `--issues-file <path>` | Load a JSON array of issues from a file |
| `--issues-stdin` | Read a JSON array of issues from stdin |
| `--workflow <name>` | Skip triage; force a specific workflow per cycle |
| `--dry-run` | Run triage only; print the queue; don't execute |
| `--merge-mode {auto\|stack}` | Default `auto` (merge each cycle to main), alternate `stack` (stacked branches, no auto-merge) |
| `--base <branch>` | Override the PR base branch (default `main`) |
| `--run-id <id>` | Override the auto-generated run ID |
| `--no-pr` | Commit locally but don't push or open PRs |

### Execution model

- **Blocking.** The parent caller `spawn`s cycle and waits for exit. One
  invocation = one run of the entire queue.
- **stdout = JSONL.** Every significant event is one JSON line.
- **stderr = freeform.** Human-legible log output, errors, stack traces.
- **Exit code.** `0` on success, non-zero on any queue failure.

### JSONL event schema (strawman)

```jsonl
{"ts":"…","event":"run.start","run_id":"…","issues":[…]}
{"ts":"…","event":"triage.start","issue":"JIRA-123"}
{"ts":"…","event":"triage.decision","issue":"JIRA-123","cycles":[…]}
{"ts":"…","event":"queue.built","total_cycles":12}
{"ts":"…","event":"cycle.start","cycle_id":"…","index":1,"total":12,"workflow":"feature","title":"…"}
{"ts":"…","event":"step.start","cycle_id":"…","step":"spec","agent":"claudecode"}
{"ts":"…","event":"step.end","cycle_id":"…","step":"spec","status":"ok","duration_ms":12345,"artifact":"docs/cycle/<run-id>/cycle-01-…/SPEC.md"}
{"ts":"…","event":"commit","cycle_id":"…","sha":"…"}
{"ts":"…","event":"pr.opened","cycle_id":"…","url":"…","number":42}
{"ts":"…","event":"pr.merged","cycle_id":"…","sha":"…"}
{"ts":"…","event":"cycle.end","cycle_id":"…","status":"ok"}
{"ts":"…","event":"run.end","status":"ok","duration_ms":…}
```

The schema is flat and additive — new `event` types can be introduced
without breaking parsers that ignore unknowns.

## 4. Execution Model

### Run lifecycle

1. **Parse args.** Normalize the input into an ordered list of issues.
2. **Bootstrap run.** Allocate `run-id`; create `docs/cycle/<run-id>/`
   and the run event log; emit `run.start`.
3. **Triage loop.** For each issue, run the triage step. Output is a
   list of 1+ cycles, each tagged with a workflow (`bug` / `feature` /
   `research`) and a spec.
4. **Build queue.** Flatten all per-issue cycle lists into a single
   ordered queue. Emit `queue.built`.
5. **Cycle loop.** For each cycle in the queue:
   - Create the branch (off `main` in `auto` mode, off the prior
     cycle's branch in `stack` mode).
   - Load the named workflow YAML; execute its steps in order.
   - Open a PR. Under `auto`, enable `gh pr merge --squash --auto` and
     wait for the merge to land on `main` before starting the next
     cycle. Under `stack`, exit immediately after opening the PR; the
     next cycle starts off the current cycle's branch.
6. **Finalize.** Emit `run.end` and exit.

### Triage

Triage is the always-first step for each incoming issue unless
`--workflow` is set. It's a `claudecode` invocation whose prompt asks for
a structured JSON output:

```json
{
  "issue_id": "JIRA-123",
  "cycles": [
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "bug",     "title": "…", "spec": "…" }
  ]
}
```

Triage artifacts land at `docs/cycle/<run-id>/triage/<issue-id>.md` (human
version) and are parsed into queue entries.

### Workflows

A workflow is a YAML file declaring an ordered list of steps:

```yaml
# .cycle/workflows/feature.yaml
name: feature
description: Full SDLC pass for a single cycle of work.
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
| `name` | Step identifier (also referenced by skip conditions) |
| `agent` | One of `claudecode`, `codex`, `bash` |
| `prompt` | Path (relative to `.cycle/`) to the prompt (AI agents) |
| `command` | Shell command (for `bash` agent) |
| `model` | Override model for this step |
| `skip_unless` | Only run if the named artifact exists |
| `timeout` | Per-step inactivity / wall-clock cap |
| `on_fail` | `exit` (default) \| `continue` \| `retry:N` |

### Agents

| Agent | Execution | Use for |
|---|---|---|
| `claudecode` | Claude Agent SDK (in-process) or `claude -p` (piped) | All AI steps by default |
| `codex` | `codex exec --yolo` subprocess | Alternative for build / fix / review |
| `bash` | Direct shell | `verify`, `commit`, `pr`, `merge`, scripts |

New agent types require a rebuild of `cycle.js` — explicitly out of scope
for MVP.

## 5. Workflow Library

### `research` (read-only)

```
investigate → findings
```

No commits, no PR. Writes `FINDINGS.md` to the cycle's artifact
directory.

### `bug`

```
investigate → fix → verify → commit → pr
```

Lightweight fix path.

### `feature`

```
spec → research → plan → build → review → fix → verify → commit → pr
```

Full SDLC pass. `fix` is conditional — only runs if `review` produced
must-fixes.

> **There is no separate `epic` workflow.** An issue that needs multiple
> cycles is simply one whose triage returned multiple queue entries, each
> of which is a standalone `bug` / `feature` / `research` cycle.

## 6. State & Artifacts

### Per-run artifact directory (durable)

```
docs/cycle/<run-id>/
├── RUN.md                        # Queue summary + final state
├── triage/
│   ├── JIRA-123.md
│   └── JIRA-124.md
├── cycle-01-feature-safari-login/
│   ├── SPEC.md
│   ├── PLAN.md
│   ├── REVIEW.md
│   └── …
├── cycle-02-feature-csv-export/
│   └── …
└── cycle-03-bug-timeout/
    └── …
```

Each cycle directory is committed as part of that cycle's PR. Maintainers
can keep or prune `docs/cycle/` later.

### Per-run event log (engine-private)

`.cycle/runs/<run-id>/events.jsonl` — the same JSONL stream emitted to
stdout, persisted so an agent can introspect after the fact.

> **Open:** location and whether there's also a global index. See
> [`BRIEF.md`](../BRIEF.md) §Open Questions #2.

### Run ID

Generated at run start. Proposed format: `YYYYMMDD-HHMMSS-<slug>`, where
`<slug>` is derived from the first issue's title.

### Cycle ID

Per cycle. Proposed format: `<NN>-<workflow>-<slug>` where `NN` is the
two-digit queue index and `<slug>` comes from the cycle title.

## 7. Branching & Merge Modes

Resolved. Two modes, chosen by `--merge-mode`.

### `auto` — "dark factory" mode (default)

- Each cycle branches off the current tip of the base branch (`main` by
  default, overridable with `--base`).
- Branch name: `cycle/<workflow>/<slug>`.
- After commits and push, the engine opens a PR and enables
  `gh pr merge --squash --auto`.
- Branch protection (required checks, required reviews if any) enforces
  quality.
- The engine **waits** for the PR to land on `main` before dequeuing the
  next cycle. This is polling on the merge state, not blocking on human
  review — if human review is required by branch protection, the queue
  will sit until it's approved.
- Linear history. Next cycle starts from updated `main` and sees the
  prior cycle's code.

### `stack` — human-review mode

- Cycle 1 branches off `main`. Cycle N+1 branches off cycle N's branch.
- Branch name: `cycle/<workflow>/<slug>` (unique per cycle via slug).
- After commits and push, the engine opens a PR with base = previous
  cycle's branch (or `main` for cycle 1).
- The engine does **not** wait for merge. It proceeds immediately to the
  next cycle.
- Humans review and merge the stack bottom-up in the tracker. Sequential
  dependencies work because each branch includes its predecessors'
  commits.

### Worktrees

Deferred. A future optional feature that could let the engine work on
cycles in parallel in separate worktrees. Out of MVP scope.

### Commit / PR / merge logic

Lives in `bash` steps that ship in `.cycle/scripts/` — projects can
customize (signed commits, PR templates, assigned reviewers, labels).

## 8. Anatomy of a Typical Run

Example: parent agent invokes cycle with 7 Jira issues, 3 of them big.

1. Parent runs
   `node .cycle/bin/cycle.js run --issues-file jira-todo.json`.
2. cycle allocates run-id `20260418-1015-jira-batch`, creates
   `docs/cycle/20260418-1015-jira-batch/` and the event log. Emits
   `run.start`.
3. Triage processes each of the 7 issues. 4 classify as single `bug` or
   `feature` cycles; 3 decompose into multi-cycle lists. Flattened total:
   12 cycles in the queue. Emits `queue.built`.
4. Engine enters the cycle loop. For cycle 1 (say `feature`):
   - Creates branch `cycle/feature/safari-login` off `main`.
   - Runs `spec → research → plan → build → review → fix → verify →
     commit → pr`. Each step emits `step.start` / `step.end`.
   - Opens PR, enables `gh pr merge --squash --auto`.
   - Polls until the PR merges (CI passes → auto-merge lands on `main`).
   - Emits `pr.merged` and `cycle.end`.
5. Engine moves to cycle 2, which branches off the updated `main`
   (including cycle 1's code). Same pattern.
6. When the 12th cycle merges, emits `run.end` with status `ok`, exit 0.

If invoked with `--merge-mode stack`: each cycle's PR is opened with the
prior cycle's branch as its base, no polling, the engine moves straight
to the next cycle. Humans merge bottom-up later.

## 9. Extensibility

- **New workflows.** Drop a YAML file in `.cycle/workflows/` referencing
  prompts in `.cycle/prompts/`. The CLI auto-discovers it; it becomes a
  valid `--workflow` argument and can be selected by triage if the
  triage prompt is updated to know about it.
- **New prompts.** Edit markdown files in `.cycle/prompts/` — no rebuild.
- **Custom commit / PR / merge logic.** Override scripts in
  `.cycle/scripts/` (or point workflow YAML to different scripts).
- **New agent types.** Out of scope for MVP; requires a rebuild of
  `.cycle/bin/cycle.js`.

## 10. Failure Modes

| Failure | Behavior (strawman) |
|---|---|
| `verify` step fails after `fix` | Re-enter `fix` once; if still failing, fail the cycle |
| `review` produces must-fixes that `fix` can't resolve | Fail the cycle |
| Push / PR creation fails | Fail the cycle; artifacts and branch remain locally |
| In `auto` mode, PR doesn't auto-merge within timeout | Fail the cycle; leave the PR open |
| Triage produces invalid classification | Fail the issue (don't add any cycles to queue); record in triage artifacts |
| Mid-queue cycle fails | **TBD** — stop the whole queue, skip and continue, or retry? See [`BRIEF.md`](../BRIEF.md) §Open Questions #4 |

## 11. Integration Surfaces

### Claude Code / OpenClaw (parent agent)

Spawns cycle, parses JSONL events, relays progress back to its human.
Because cycle is blocking and a large queue can take hours, the parent
agent is effectively pinned until cycle exits.

### Claude Code skill

A thin skill at `.claude/skills/cycle.md` tells Claude Code "when the
user asks to run cycle on an issue or batch, invoke
`node .cycle/bin/cycle.js run …`." Optional; the CLI is authoritative.

### GitHub Actions

A workflow file (e.g., `.github/workflows/cycle-on-issue.yml`) triggers
on an issue label or comment, spins up a container with node + `claude`
+ repo checkout, and invokes
`node .cycle/bin/cycle.js run --issue ${{ github.event.issue.number }}`.

### Ephemeral bug-fix containers

Same pattern as Actions, via any orchestrator (Daytona, devcontainers,
custom Docker). Self-contained `.cycle/bin/` means the container only
needs node + `claude` + `gh` preinstalled.

---

## 12. Open Architectural Questions

Tracked in [`BRIEF.md`](../BRIEF.md) §Open Questions. Summary:

2. State log location (per-run vs global).
3. Resume semantics (`--resume` vs always-fresh).
4. Queue failure handling (stop / skip / retry).
5. Skill packaging (first-class vs nice-to-have).
6. `init` scope (confirm the layout).
7. Definition of Done for cycle's own MVP.

Resolved since the last revision:

1. ✅ Branching & PR strategy — default `auto` (branch off main,
   auto-merge), alternate `stack` (stacked branches, human review). See
   §7.
