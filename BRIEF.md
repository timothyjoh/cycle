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
| Install model | `node_modules` via `npx` | `npx @cycleai/cli init` once; single bundled file committed into `.cycle/bin/` |
| UI | TUI | None — JSONL events on stdout for programmatic monitoring |
| Workflow shape | One fixed linear workflow | Library of named workflows; triage picks per cycle |
| Unit of work | Phase within a project vision | Cycle — one workflow run against one scoped piece of an issue |
| Run lifecycle | Long-lived loop across project phases | Processes a queue of cycles until empty, then exits |

## Tech Stack

- **Bootstrap.** `npx @cycleai/cli init` scaffolds the repo once. The
  npm package ships the prebuilt engine bundle as a static asset; `init`
  copies it into `.cycle/bin/cycle.js`. Upgrades: `npx @cycleai/cli@latest
  init --upgrade` refreshes the bundle and skill, leaving user-customized
  workflows / prompts / scripts in place (3-way merge; `--force`
  overwrites everything). The npm package name is also reserved as
  `@cycle-afk` as a backup scope.
- **Node-native.** Authored in TypeScript; bundled via `esbuild` into a
  single self-contained file at `.cycle/bin/cycle.js`. The bundle file
  starts with a `#!/usr/bin/env node` shebang and is committed
  executable, so the canonical invocation is `./.cycle/bin/cycle.js` —
  no `node …` prefix needed.
- No `npm install` required in the consuming repo after init — the
  committed bundle is the engine.
- Runtime on the consuming repo: **`node`** (≥ 22.6; ≥ 24 LTS
  recommended) + **`claude` CLI** + **git** + **`gh`**. Nothing else.
  - Node is the default JavaScript runtime on every CI image, container
    base, and developer machine — zero install friction.
  - **No TS → JS transpile in the dev loop.** Node 22.6+ executes `.ts`
    files directly via `--experimental-strip-types`; Node 23.6+ strips
    types by default. Type-checking runs separately (`tsc --noEmit`).
  - `esbuild` produces the single-file `.cycle/bin/cycle.js` bundle —
    one devDependency, no broader build toolchain.
  - Node's built-in `node:http` server will power the future HTML
    progress viewer without adding a web framework dependency.
- Ships a minimal Claude Code skill at `.claude/skills/cycle.md` by
  default (opt out via `cycle init --no-skill`).
- Must run locally, in **GitHub Actions**, and in **ephemeral containers**
  spun up to handle a batch of work. A single-executable distribution
  via Node SEA (`node --experimental-sea-config`) is a future option for
  contexts where requiring Node is friction; out of MVP scope.

## Invocation Contract

The canonical command form uses the shebang on the committed bundle:

```bash
# Single freeform task (blocking; parent waits until queue empty)
./.cycle/bin/cycle.js run "fix the login bug on Safari"

# Single issue from a tracker (engine shells out to fetch-issue.sh)
./.cycle/bin/cycle.js run --issue JIRA-123

# A batch of issues
./.cycle/bin/cycle.js run --issues-file issues.json
cat issues.json | ./.cycle/bin/cycle.js run --issues-stdin

# Force a specific workflow (skip triage)
./.cycle/bin/cycle.js run --workflow feature "add CSV export"

# Triage only, no execution
./.cycle/bin/cycle.js run --dry-run "…"

# Choose merge mode (default: auto)
./.cycle/bin/cycle.js run --merge-mode stack "…"

# Detached daemon mode — process the queue in the background
./.cycle/bin/cycle.js run --detach --issues-file issues.json

# Daemon control (only meaningful while a detached daemon is alive)
./.cycle/bin/cycle.js status            # one-shot JSON snapshot
./.cycle/bin/cycle.js attach            # tail .cycle/log.jsonl live
./.cycle/bin/cycle.js stop              # graceful drain
./.cycle/bin/cycle.js stop --force      # SIGTERM
```

Windows / cross-platform fallback: `node .cycle/bin/cycle.js run …`
works identically — the shebang is just a convenience on Unix.

- **Blocking by default.** The parent agent waits until the pending
  queue is empty. CI jobs and ephemeral containers want this.
- **`--detach` for interactive / long-queue use.** Spawns a daemon,
  writes its PID to `.cycle/cycle.pid`, exits immediately. A second
  `run --detach` invocation in the same repo refuses with a pointer to
  `cycle attach` / `cycle stop`. One daemon per repo.
- **stdout = JSONL events** (mirrored to `.cycle/log.jsonl`).
- **`status` / `attach` / `stop` are JSON-out by default** so agents
  can consume them; `--human` formats for terminals.
- **Per-cycle artifacts** under `docs/cycle/<cycle-id>-<workflow>-<slug>/`.
- **Each cycle produces its own commits, branch, and PR.**

### Auth and credentials

Cycle does not document an env-var contract, run preflight credential
checks, or ship a `doctor` subcommand. Callers (developer's local
config, CI secrets, container env) are responsible for ensuring
`claude` and `gh` are pre-authenticated and any `.cycle/scripts/*.sh`
have the env vars they need.

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

**`--issue <id>` delegates fetch to a script.** The engine shells out to
`.cycle/scripts/fetch-issue.sh <id>`, which is responsible for talking
to Jira / Linear / GH and writing the markdown file into `tbd/`. Default
scripts ship for the common trackers (dispatching on the id prefix);
projects can override per repo. Credentials live in env vars the script
reads, not in the engine — see Auth and credentials above.

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
cycles: [0042, 0043]            # populated as cycle IDs are assigned
completed_at: 2026-04-18T12:47:00Z  # populated when all cycles merged
blocked_at: 2026-04-18T14:30:00Z    # populated if issue moved to blocked/
blocked_cycle: 0042             # which cycle caused the block, if any
---
```

Body of the markdown = issue description. A template lives at
`docs/cycle/issues/TEMPLATE.md` for external agents to copy.

## Triage (lazy, per issue)

When an issue is popped from `tbd.jsonl`, the engine runs triage on its
file in `queued/`. Triage produces a structured classification — a *plan*
of cycles, without IDs. IDs are allocated lazily at `cycle.start`:

```json
{
  "issue_id": "JIRA-123",
  "cycles": [
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "bug",     "title": "…", "spec": "…" }
  ]
}
```

On success: write `TRIAGE.md` into the first cycle's artifact dir, move
the issue file to `triaged/`, and run the planned cycles in order. Each
cycle gets the next sequential ID (scanned from `log.jsonl`) at its
start, and that ID is appended to the issue's frontmatter `cycles:` as
it's assigned.

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

## Cycle Attempts & Failure Handling

The engine is a "dark factory" — when a cycle can't pass its quality
gates, it's abandoned and retried from scratch rather than nursed along
in a bad state.

### Two layers of retry

- **Step-level** (`on_fail: retry:N` in workflow YAML) — transient step
  failures (flaky test, network hiccup). Tuned per step.
- **Cycle-level** (max 3 attempts, configured per workflow) — "the AI
  went down a bad path" failures that step-level retries can't fix. An
  attempt runs the workflow end-to-end; on failure it's abandoned and a
  fresh one starts.

### What counts as an attempt failure

| Triggers an attempt failure | Handled separately |
|---|---|
| `verify` fails after step-level retries | Rate limit → pause/resume (no attempt consumed) |
| `review` produces unresolvable must-fixes | Push network error → step-level retry |
| `build` fails after step-level retries | Git/auth errors → fail fast (engine exits) |
| Merge conflict on rebase / auto-merge | Engine uncaught exception → crash, resume later |

### Attempt mechanics

- **Branch.** Delete local + remote; re-create from the base between
  attempts. Fresh slate.
- **Artifacts.** Wipe `docs/cycle/<cycle-id>-<workflow>-<slug>/`
  between attempts. No context carryover — the AI may repeat a
  mistake, but that's by design; try again differently.
- **Cycle ID.** Same ID across all attempts (cycle 0042 attempted
  three times), with `attempt: N` in log events.

### When 3 attempts are exhausted

- Push the final attempt's branch to `cycle/abandoned/<cycle-id>-<slug>`.
- Open a PR titled `Failed Attempt: <title>` (cold storage with GitHub
  visibility — not intended to merge).
- Move the issue file from `triaged/` to `blocked/` with `blocked_at:`
  and `blocked_cycle:` in frontmatter; write a `BLOCKED.md` note.
- **Skip the remaining planned cycles of that issue.** They never
  started, so they consume no IDs — the next issue's first cycle gets
  the next sequential ID cleanly.
- Emit `cycle.abandoned` and `issue.blocked` events.

### Mode interaction

- **`--merge-mode auto` — default `--on-abandon continue`.** Next issue
  starts; queue keeps flowing.
- **`--merge-mode stack` — default `--on-abandon halt`.** Stack
  dependencies make a mid-stack abandon ambiguous; let a human sort it
  out.

### Rate limits

Rate limits are orthogonal to attempt counting:

- **Short transient (minutes).** In-process exponential backoff
  (30s → 60s → 120s → 300s, ~5 min cap). Emits `rate_limit.hit` /
  `rate_limit.resumed`.
- **Long exhaustion (hours).** Engine emits `engine.paused` with a
  `retry_after` hint, then exits with code `42`. A parent agent or
  cron re-invokes later; the engine picks up from `tbd.jsonl` and
  `log.jsonl`. Opt-in `--rate-limit-behavior sleep` keeps the process
  alive instead (for containers with nothing else to do).
- **Proactive awareness.** The engine tracks `anthropic-ratelimit-*`
  response headers and pauses preemptively if the next call would
  exceed the window.

### Configurability

`max_cycle_attempts` is set per workflow in `.cycle/workflows/*.yaml`
(default 3). No CLI override — each workflow's policy is baked in.

---

## Artifacts & State

**Engine state (`.cycle/`).**
- `.cycle/log.jsonl` — global append-only event log. Source of truth for
  everything that has happened. Never rewritten.
- `.cycle/tbd.jsonl` — pending untriaged issues. One line per issue;
  mutated as the engine consumes work.

**Issues (`docs/cycle/issues/`).** Five folders — `tbd/`, `queued/`,
`triaged/`, `blocked/`, `failed/` — plus a `TEMPLATE.md`. See Issue
Ingestion and Cycle Attempts & Failure Handling.

**Per-cycle artifacts (`docs/cycle/<cycle-id>-<workflow>-<slug>/`).**
E.g., `docs/cycle/0042-feature-safari-login/`, containing SPEC.md,
PLAN.md, REVIEW.md, FINDINGS.md, TRIAGE.md (on the first cycle of a
triage), etc. Committed into that cycle's PR. Maintainers can keep or
prune later; default is to keep as a paper trail.

Cycle IDs are 4-digit zero-padded integers (`0001` through `9999`),
globally unique within the project repo, allocated at cycle start by
scanning `log.jsonl` for the highest existing ID.

These files also form the read contract for future tooling — a TUI and a
Node-backed HTML viewer that render queue progress from `tbd.jsonl` +
`log.jsonl` in real time.

## Configuration

Workflows are defined in YAML under `.cycle/workflows/`. Projects can add
or override workflows. Steps reference prompt templates in
`.cycle/prompts/`. Agents per step (`claudecode`, `codex`, `bash`) are
configurable.

## Claude Code Skill

`cycle init` installs `.claude/skills/cycle.md` by default (opt out
with `--no-skill`). The skill is **non-prescriptive**: it enumerates
cycle's CLI surface (subcommands, flags, exit codes, JSONL event
names, common invocation patterns) and lets Claude route natural
language to the right command shape per request. The skill is not a
hard-coded dispatch table — there's no "if user says X then run Y"
logic, just a reference doc + behavioral guidance.

Invocation flavors:
- **Slash command.** `/cycle "fix the safari login bug"`,
  `/cycle --issue JIRA-123`, `/cycle status`, etc. Claude maps the
  surface form to the right local or `npx` invocation:
  - Bootstrap-class actions (`init`, `init --upgrade`) → `npx
    @cycleai/cli …`
  - Runtime actions (`run`, `status`, `attach`, `stop`) →
    `./.cycle/bin/cycle.js …`
- **Description-triggered.** User says "use cycle to work through
  these tickets" and Claude Code recognizes the intent.

### Narration model

The skill follows a **hybrid push / pull** model so long-running queues
don't drown the chat:

- **Push proactively** on major milestones and anything needing human
  attention: `engine.start`, `engine.stop`, `engine.paused`,
  `cycle.start`, `cycle.end`, `cycle.attempt.failed`,
  `cycle.abandoned`, `triage.abandoned`, `issue.completed`,
  `issue.blocked`, `rate_limit.hit`, `rate_limit.resumed`, fatal exits.
- **Pull on demand** for routine progress (`step.start`, `step.end`,
  individual `commit` / `pr.opened` events). When the user asks
  "what's going on?", Claude summarizes from `cycle status` + a tail
  of `.cycle/log.jsonl`.

### Reattach on new session

When a new Claude Code session opens in a repo with a live cycle
daemon (PID file present, process alive), the skill instructs Claude
to run `cycle status` on the *first* cycle-related prompt and lead
with a snapshot (current cycle ID, queue depth, last event) before
acting on the user's request. No always-on SessionStart hook — the
check is gated by the user's intent, not the session lifecycle.

### Detach defaults

For any multi-issue invocation or any `--issues-file` / `--issues-stdin`
input, the skill invokes cycle with `--detach`. Short single-task runs
remain foreground so the user sees output inline. This is a skill-side
heuristic, not an engine policy — humans calling cycle directly can
mix and match.

### What the skill does NOT do

- Reschedule a follow-up invocation after exit-code-42 (left to
  cron / caller).
- Pretty-print or visualize beyond progress relay — the future TUI /
  HTML viewer is its own surface.
- Validate auth or credentials — see Auth and credentials above.

## What cycle is NOT

- **Not** a project vision driver. No BRIEF → Epic → Phase loop of its
  own. A list of issues is supplied per invocation.
- **Not** a TUI. Progress is JSONL on stdout; humans monitor *through*
  the invoking agent.
- **Not** a service. Default mode is a blocking subprocess that
  processes a queue and exits. The `--detach` flag turns it into a
  one-per-repo daemon for interactive use, but there's still no
  always-on background process across machines or repos.

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

**Queue failure handling (Open Q #4).**
Cycles get 3 attempts; each attempt is a fresh workflow run from a
clean branch and wiped artifacts. After 3 exhausted attempts, the
branch is preserved under `cycle/abandoned/…` with a
`Failed Attempt: …`-titled PR, the issue file moves to `blocked/`, and
remaining planned cycles of the same issue are skipped. In `auto` mode
the queue continues; in `stack` mode it halts. Rate limits are
orthogonal: short transients back off in-process; long exhaustion
exits with code 42 for the caller to re-invoke later. See Cycle
Attempts & Failure Handling.

**Skill packaging (Open Q #5).**
`cycle init` installs `.claude/skills/cycle.md` by default (opt out via
`--no-skill`). Skill is minimal: supports both slash-command
(`/cycle …`) and description-triggered invocation, and relays JSONL
progress to the user. Exit-42 rescheduling, log-history queries, and
fancy visualization are left to the caller. See Claude Code Skill.

**Init scope (Open Q #6).**
`cycle init` touches three top-level directories:
- `.cycle/` — `bin/cycle.js`, `workflows/*.yaml`, `prompts/*.md`,
  `scripts/*.sh`, `CLAUDE.md`
- `.claude/skills/cycle.md` — by default (opt out via `--no-skill`)
- `docs/cycle/issues/` — `TEMPLATE.md` plus empty `tbd/`, `queued/`,
  `triaged/`, `blocked/`, `failed/` directories

`log.jsonl` and `tbd.jsonl` are created at first run under `.cycle/`
and committed by default (users can `.gitignore` for local-only
state). `cycle init --force` overwrites existing files.

**Definition of Done (Open Q #7).**
MVP ships after **Phase 4** — by which point cycle can be left
running unattended against a batch of real issues. Phase 5 is
post-MVP polish. MVP is validated on **both** the cycle repo itself
(brownfield dog-food) and a dedicated greenfield test repo. See
Phase Plan below.

**Bootstrap & upgrade (Open Q #8).**
The CLI ships as the npm package `@cycleai/cli` (backup scope
`@cycle-afk`). `npx @cycleai/cli init` is the one-time bootstrap; the
prebuilt engine bundle ships *inside* the package and `init` copies it
to `.cycle/bin/cycle.js` (with `#!/usr/bin/env node` shebang, committed
executable). Engine version = npm package version, atomic. Upgrades:
`npx @cycleai/cli@latest init --upgrade` rewrites the engine bundle and
skill, leaving user-customized workflows / prompts / scripts intact via
a 3-way merge; `--force` overwrites everything.

**Daemon mode (Open Q #9).**
Engine grows an opt-in `--detach` flag. Blocking remains the default
to preserve the CI / ephemeral-container exit-code contract. A
detached run writes `.cycle/cycle.pid`; a second `run --detach` in the
same repo refuses with a pointer to `cycle attach` / `cycle stop`.
One daemon per repo. Control surface: `cycle attach` (tail
`.cycle/log.jsonl` from EOF; Ctrl-C detaches without killing),
`cycle status` (one-shot JSON snapshot), `cycle stop` (graceful drain),
`cycle stop --force` (SIGTERM). All three are JSON-out by default;
`--human` flag formats for terminals.

**Skill behavior (Open Q #10).**
The Claude Code skill is non-prescriptive — it enumerates cycle's CLI
surface and lets Claude route. Narration is hybrid: push on major
milestones and anything failure-related, pull on demand for routine
events. On a new session entering a repo with a live daemon, the
skill prompts Claude to run `cycle status` on the first cycle-related
prompt and lead with a snapshot. Detach is the skill's default for
multi-issue runs; foreground for short single-task runs. See Claude
Code Skill.

**Issue fetch (Open Q #11).**
`--issue <id>` delegates the actual tracker fetch to
`.cycle/scripts/fetch-issue.sh`, which writes a markdown file into
`tbd/`. Default scripts ship for the common trackers (dispatch on id
prefix). Engine has no built-in tracker SDKs and no bundled
credentials — credentials live in env vars the script reads. See
Issue Ingestion.

**Auth (Open Q #12).**
Cycle defers credential management entirely to the caller. No
documented env-var contract from the engine, no preflight check, no
`cycle doctor` subcommand. The deployment environment (developer
machine, GitHub Actions secrets, container env) is responsible for
ensuring `claude`, `gh`, and any fetch / commit / pr / merge scripts
are pre-authenticated. See Auth and credentials.

---

## Phase Plan

**Phase 1 — Walking skeleton.**
`npx @cycleai/cli init` scaffolds everything (engine bundle, default
workflows, prompts, scripts, skill). `./.cycle/bin/cycle.js run
"text"` runs a single freeform task end-to-end. One workflow
implemented (`feature` — spec → plan → build → verify → commit →
pr); `review` / `fix` can be stubs. Task flows through
`tbd/ → queued/ → triaged/`. Branch, commit, PR, auto-merge. JSONL
events on stdout; `log.jsonl` + `tbd.jsonl` populated. Skill shipped.

**Phase 2 — Full default workflow library.**
`bug` and `research` workflows implemented. Triage classifies between
all three. `review` + `fix` fully wired in `feature`.

**Phase 3 — Batch ingestion.**
`--issue <id>` (tracker fetch), `--issues-file`, `--issues-stdin`.
External agents dropping files into `tbd/`. Multi-cycle triage
(decomposing a single issue into multiple cycles). Queue iteration
across many issues. `depends_on:` sequencing. Pre-emptive `tbd/`
rescans.

**Phase 4 — Failure resilience. ⛳ MVP line.**
3-attempt abandon-and-restart with fresh branches and wiped
artifacts. `blocked/` folder. `Failed Attempt:` preservation PR.
Triage retry + `failed/` folder after 3 attempts. Rate-limit handling
(short in-process backoff, long `engine.paused` + exit 42).
`--on-abandon` flag. `--detach` daemon mode with `cycle attach` /
`status` / `stop` control surface and `.cycle/cycle.pid` lock —
needed because "left running unattended against a batch of real
issues" implies multi-hour runs the user shouldn't have to babysit
in the foreground.

**Phase 5 — Polish & secondary modes (post-MVP).**
`--merge-mode stack` with stacked branches. Custom-workflow
extensibility verified. `init --upgrade` 3-way merge path battle-tested.
`.github/workflows/cycle-on-issue.yml` example. README and usage
docs. Known-good CI container image or install recipe.

**MVP validation.**
- **Brownfield dog-food.** Cycle runs in the cycle repo itself on an
  issue like "add a new prompt template" or "refactor the triage
  parser" — proving it works in a brownfield codebase.
- **Greenfield test repo.** Cycle runs in a separate minimal repo
  from a seeded BRIEF-sized task — proving it works on a fresh
  codebase.

Both paths must produce merged PRs without manual intervention for
MVP to be considered done.
