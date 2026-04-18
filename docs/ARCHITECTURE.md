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
  task, Jira card, GH issue, PRD, BRIEF. Any entry point (positional
  `"task text"`, `--issue <id>`, `--issues-file`, `--issues-stdin`, or
  files dropped into `docs/cycle/issues/tbd/` by an external agent)
  materializes as a markdown file in the `tbd/` inbox. The engine's
  scan loop then picks them up.
- **Out:** JSONL event stream on stdout (mirrored to `.cycle/log.jsonl`);
  durable per-cycle artifacts under `docs/cycle/<cycle-id>-<workflow>-<slug>/`;
  one branch, commit set, and PR per cycle; issue files advance through
  `tbd/ → queued/ → triaged/` as state changes; a final exit code.

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
| `--no-pr` | Commit locally but don't push or open PRs |

### Execution model

- **Blocking.** The parent caller `spawn`s cycle and waits for exit. The
  engine runs until `tbd.jsonl` is empty or a failure stops the queue.
- **stdout = JSONL** (mirrored to `.cycle/log.jsonl`). Every significant
  event is one JSON line.
- **stderr = freeform.** Human-legible log output, errors, stack traces.
- **Exit code.** `0` on success, non-zero on any failure.

### JSONL event schema (strawman)

```jsonl
{"ts":"…","event":"engine.start"}
{"ts":"…","event":"issue.ingested","issue_id":"JIRA-123","path":"docs/cycle/issues/queued/JIRA-123.md"}
{"ts":"…","event":"tbd.pop","issue_id":"JIRA-123"}
{"ts":"…","event":"triage.start","issue_id":"JIRA-123","attempt":1}
{"ts":"…","event":"triage.decision","issue_id":"JIRA-123","plan":[{"workflow":"feature","title":"…"},{"workflow":"feature","title":"…"}]}
{"ts":"…","event":"cycle.start","cycle_id":"0042","workflow":"feature","title":"…","issue_id":"JIRA-123","attempt":1}
{"ts":"…","event":"step.start","cycle_id":"0042","step":"spec","agent":"claudecode"}
{"ts":"…","event":"step.end","cycle_id":"0042","step":"spec","status":"ok","duration_ms":12345,"artifact":"docs/cycle/0042-feature-safari-login/SPEC.md"}
{"ts":"…","event":"commit","cycle_id":"0042","sha":"…"}
{"ts":"…","event":"pr.opened","cycle_id":"0042","url":"…","number":142}
{"ts":"…","event":"pr.merged","cycle_id":"0042","sha":"…"}
{"ts":"…","event":"cycle.end","cycle_id":"0042","status":"ok"}
{"ts":"…","event":"issue.completed","issue_id":"JIRA-123","cycles":["0042","0043"]}
{"ts":"…","event":"engine.stop","status":"ok"}
```

Cycle-attempt / abandon variants:

```jsonl
{"ts":"…","event":"cycle.attempt.failed","cycle_id":"0042","attempt":1,"reason":"verify_failed"}
{"ts":"…","event":"cycle.start","cycle_id":"0042","workflow":"feature","attempt":2}
{"ts":"…","event":"cycle.abandoned","cycle_id":"0042","attempts":3,"preservation_branch":"cycle/abandoned/0042-feature-safari-login","pr_url":"…"}
{"ts":"…","event":"issue.blocked","issue_id":"JIRA-123","blocked_cycle":"0042","path":"docs/cycle/issues/blocked/JIRA-123.md"}
```

Triage failure / rate-limit variants:

```jsonl
{"ts":"…","event":"triage.failed","issue_id":"JIRA-123","attempt":1,"reason":"invalid_json"}
{"ts":"…","event":"triage.abandoned","issue_id":"JIRA-123","attempts":3,"path":"docs/cycle/issues/failed/JIRA-123.md"}
{"ts":"…","event":"rate_limit.hit","retry_after_s":120,"tokens_remaining":0}
{"ts":"…","event":"rate_limit.resumed"}
{"ts":"…","event":"engine.paused","reason":"rate_limit","retry_after":"2026-04-18T20:00:00Z"}
```

The schema is flat and additive — new `event` types can be introduced
without breaking parsers that ignore unknowns. There is no per-run ID;
engine lifecycle is marked by `engine.start` / `engine.stop` with
timestamps.

## 4. Execution Model

### Engine lifecycle

1. **Parse args.** For any CLI-supplied input, materialize a markdown
   file in `docs/cycle/issues/tbd/` (filename derived from `id`, or a
   `txt-<ts>-<slug>` for freeform text).
2. **Start.** Emit `engine.start`.
3. **Scan `tbd/`.** For each file not yet reflected in `tbd.jsonl`:
   `mv` it to `queued/`, then append a line to `tbd.jsonl` (dedup by
   `id`). Emit one `issue.ingested` per file.
4. **Process loop** (until `tbd.jsonl` is empty):
   - **Pop** the next issue from `tbd.jsonl`; emit `tbd.pop`.
   - **Skip if blocked** by `depends_on:` — if any dependency is still
     in `tbd/`, `queued/`, or is an unmerged cycle, re-append the line
     to the tail of `tbd.jsonl` and continue to the next entry. (Cycle
     detection: after a full pass where no issue can progress, abort.)
   - **Triage** the `queued/` file → a *plan* of 1+ cycles, each
     tagged with a workflow (`bug` / `feature` / `research`) and a
     spec. No cycle IDs assigned yet.
     - On triage failure: increment `triage_attempts` in frontmatter,
       re-append to `tbd.jsonl`. After 3 attempts, move the file to
       `failed/` with a `FAILURE.md` note; emit `triage.abandoned`.
   - **Write `TRIAGE.md`** (populated once the first cycle ID is
     assigned); `mv` the issue file from `queued/` to `triaged/`.
   - **Cycle sub-loop** (for each planned cycle):
     - **Allocate the cycle ID** by scanning `log.jsonl` for the
       highest existing ID and incrementing. Append it to the issue's
       frontmatter `cycles:`.
     - Create `docs/cycle/<cycle-id>-<workflow>-<slug>/`.
     - **Attempt loop** (up to `max_cycle_attempts`, default 3):
       - Create the branch (off `main` in `auto` mode, off the prior
         cycle's branch in `stack` mode). On attempts 2+, delete the
         prior attempt's branch first and wipe the artifact dir.
       - Load the workflow YAML; execute its steps in order. Each
         step honors its own `on_fail: retry:N` policy.
       - On a code-level failure (verify fails, review unresolvable,
         build fails, merge conflict): emit `cycle.attempt.failed`
         and loop.
       - On success: open a PR. Under `auto`, enable
         `gh pr merge --squash --auto` and poll until the PR lands
         on `main` before proceeding. Under `stack`, proceed
         immediately. Emit `cycle.end`, break the attempt loop.
     - On exhausted attempts: push final-attempt branch to
       `cycle/abandoned/<cycle-id>-<slug>`, open a `Failed Attempt: …`
       PR (no auto-merge), emit `cycle.abandoned`, then break out of
       the cycle sub-loop — the issue's remaining planned cycles are
       skipped (they consume no IDs). Move the issue file to
       `blocked/` with `BLOCKED.md`; emit `issue.blocked`. In `stack`
       mode the engine halts entirely (default `--on-abandon halt`).
     - On issue completion (all planned cycles merged): append
       `completed_at:` to the issue file in `triaged/`; emit
       `issue.completed`.
5. **Re-scan `tbd/`.** If new files appeared during the run, loop back
   to step 4.
6. **Finalize.** When `tbd.jsonl` is empty and `tbd/` is empty, emit
   `engine.stop` and exit 0.

Triage is lazy (per issue, just before its cycles run). The backlog in
`tbd/` + `tbd.jsonl` stays a meaningful live queue. Crash-resume is
trivial — re-invoking `cycle run` with no arguments picks up from
whatever's still in the folders and `tbd.jsonl`.

### Triage

Triage runs per issue as it's popped from `tbd.jsonl` (unless
`--workflow` is set, which skips triage and forces that workflow on a
single synthetic cycle per issue). It's a `claudecode` invocation whose
prompt asks for structured JSON output — a *plan* of cycles without IDs:

```json
{
  "issue_id": "JIRA-123",
  "cycles": [
    { "workflow": "feature", "title": "…", "spec": "…" },
    { "workflow": "bug",     "title": "…", "spec": "…" }
  ]
}
```

The decision is logged to `log.jsonl` as `triage.decision` (`plan: […]`);
cycle IDs are assigned lazily, one at a time, as each planned cycle
actually begins work. This means skipped cycles (an abandoned cycle's
siblings) never consume IDs. The human-readable write-up lands at
`docs/cycle/<first-cycle-id>-<workflow>-<slug>/TRIAGE.md` — one triage
doc per issue, named after the first cycle that actually ran.

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

### Engine state (in `.cycle/`)

Two global files, both at the repo root under `.cycle/`:

- **`.cycle/log.jsonl`** — append-only event history, mirrored from
  stdout. Source of truth for everything that has happened: triage
  decisions, step starts/ends, commits, PRs, merges, issue lifecycle,
  engine lifecycle. Never rewritten. Used to reconstruct cycle state,
  allocate the next cycle ID, and power the future TUI / HTML viewer.
- **`.cycle/tbd.jsonl`** — pending untriaged issues. One issue per
  line. Mutated: entries are appended on ingest (dedup by `id`),
  removed when an issue is popped for triage, re-appended on retry.
  Remains populated if the engine crashes — the next invocation picks
  up where it left off.

Entry schema for `tbd.jsonl` (mirrors key frontmatter fields for quick
access; the file in `queued/` is the source of truth for the full
issue):

```json
{"id":"JIRA-123","source":"jira","title":"…","path":"docs/cycle/issues/queued/JIRA-123.md","priority":5,"added_at":"2026-04-18T10:15:00Z"}
```

Where `source` is one of `text|jira|linear|github|file`, and `id` is
the caller's reference (ticket key, UUID, or a generated token like
`txt-<ts>-<slug>` for freeform task text).

### Issue state machine (`docs/cycle/issues/`)

Four folders shadow `tbd.jsonl`, giving every issue a durable,
git-visible state:

```
docs/cycle/issues/
├── TEMPLATE.md     # Frontmatter reference for agents creating issues
├── tbd/            # Inbox — new files dropped by agents or by the CLI
├── queued/         # Ingested into tbd.jsonl, awaiting triage
├── triaged/        # Decomposed into cycles; frontmatter records them
├── blocked/        # A cycle exhausted its attempts; siblings skipped
└── failed/         # Triage exhausted its retries
```

State transitions:
- `tbd/` → `queued/`: engine scan moves the file and appends to
  `tbd.jsonl`.
- `queued/` → `triaged/`: triage succeeded; `cycles:` populated in
  frontmatter.
- `queued/` → `failed/`: triage failed 3 times; `FAILURE.md` written
  alongside.
- `triaged/` → `blocked/`: a cycle from this issue exhausted its
  attempts; remaining planned cycles are skipped. `BLOCKED.md` written
  alongside; `blocked_at:` and `blocked_cycle:` populated in
  frontmatter. A human moves the file back to `tbd/` to retry.

Issue file naming: `<id>.md` (e.g., `JIRA-123.md`). For freeform text
input, the engine generates `txt-<YYYYMMDD-HHMMSS>-<short-slug>.md`.

### Per-cycle artifact directory (durable)

```
docs/cycle/0042-feature-safari-login/
├── TRIAGE.md     # Only on the first cycle emitted from a given triage
├── SPEC.md
├── RESEARCH.md
├── PLAN.md
├── REVIEW.md
├── FINDINGS.md   # research workflow only
└── …
```

Each cycle directory is committed as part of that cycle's PR. Maintainers
can keep or prune `docs/cycle/` later.

### Cycle ID

4-digit zero-padded integer (`0001`–`9999`), globally unique within the
project repo. Allocated at cycle start by scanning `log.jsonl` for the
highest existing cycle ID and incrementing. Widening beyond 4 digits is
trivial if a project ever approaches 10k cycles.

### No run ID

A "run" is just one process execution of the engine — a temporal
boundary, not a persistent identity. Engine lifecycle is marked in
`log.jsonl` by `engine.start` / `engine.stop` events with timestamps; no
ID is minted. Cycles are the only persistent identity the system needs.

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
2. cycle writes 7 markdown files into `docs/cycle/issues/tbd/` (one per
   Jira card). Emits `engine.start`.
3. Scan: each file is moved to `queued/` and a line is appended to
   `.cycle/tbd.jsonl`. Emits 7 `issue.ingested` events.
4. Process loop begins. Pops the first line from `tbd.jsonl` (say
   `JIRA-123`); emits `tbd.pop`.
5. Triage classifies `JIRA-123` as a single `feature` cycle. Logs
   `triage.decision`. Engine scans `log.jsonl`, finds the previous
   highest cycle ID was `0041`, so this cycle gets `0042`. Writes
   `TRIAGE.md` into `docs/cycle/0042-feature-safari-login/`, updates
   the issue file's `cycles: [0042]` frontmatter, moves the file to
   `triaged/`.
6. Cycle `0042` runs:
   - Branch `cycle/feature/safari-login` created off `main`.
   - `docs/cycle/0042-feature-safari-login/` gets its workflow
     artifacts.
   - Workflow steps run:
     `spec → research → plan → build → review → fix → verify → commit → pr`.
     Each emits `step.start` / `step.end`.
   - PR opened; `gh pr merge --squash --auto` enabled.
   - Engine polls until the PR lands on `main`. Emits `pr.merged` and
     `cycle.end`.
   - Since `0042` was the only cycle from `JIRA-123`, the engine
     appends `completed_at:` to the issue file in `triaged/` and emits
     `issue.completed`.
7. Engine loops back. Pops `JIRA-124`. Triage decomposes into 3
   cycles (`0043`, `0044`, `0045`). Each runs in turn, branched off the
   updated `main`. After `0045` merges, `JIRA-124.md` gets its
   `completed_at:`.
8. And so on, until `tbd.jsonl` is empty. Final scan of `tbd/` —
   nothing new. Emits `engine.stop` with status `ok`. Exit 0.

**`--merge-mode stack`:** each cycle's PR is opened with the prior
cycle's branch as its base, no polling, the engine moves straight to
the next cycle. Humans merge the stack bottom-up later.

**Crash recovery:** if the engine crashes after cycle `0044` merges,
`tbd.jsonl` still has `JIRA-125`–`JIRA-127`, `log.jsonl` records
everything that did happen, and the `triaged/`/`queued/` folders reflect
true state. Re-invoking `node .cycle/bin/cycle.js run` with no
arguments picks up automatically — starting with any cycle left
mid-flight (detected from the log), then continuing through the queue.

**External agent drop:** while the engine is processing cycle `0042`,
another agent drops `JIRA-200.md` into `tbd/`. The engine sees it on
the next scan (after the current queue empties) and keeps running
instead of stopping.

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

Two layers of retry:

- **Step-level** (`on_fail: retry:N` in workflow YAML) for transient
  step issues.
- **Cycle-level** (`max_cycle_attempts: 3` per workflow) — on a
  code-level gate failure, the attempt is abandoned and a fresh
  attempt starts from a clean branch with wiped artifacts.

| Failure | Category | Behavior |
|---|---|---|
| `verify` fails after step-level retries | Code-level gate | **Attempt failure.** Abandon attempt; restart fresh. |
| `review` produces unresolvable must-fixes after `fix` | Code-level gate | **Attempt failure.** |
| `build` fails after step-level retries | Code-level gate | **Attempt failure.** |
| Merge conflict on rebase / auto-merge | Code-level gate | **Attempt failure.** |
| 3 cycle attempts exhausted | — | Push to `cycle/abandoned/<cycle-id>-<slug>`; open `Failed Attempt: …` PR; move issue to `blocked/`; skip remaining planned cycles of the issue; `cycle.abandoned` + `issue.blocked` events. `auto` mode continues to next issue; `stack` mode halts. |
| Rate limit (short) | External transient | In-process exponential backoff (30s → 5m cap). No attempt consumed. |
| Rate limit (long) | External transient | Emit `engine.paused`; exit code 42. Caller re-invokes later. Opt-in `--rate-limit-behavior sleep` stays in-process. |
| Push network error | Infrastructure | Exponential backoff, retry up to 3 times. No attempt consumed. |
| Push auth / permission error | Environment | Fail fast — engine exits non-zero. |
| `git` operation error (dirty tree, detached HEAD) | Environment | Fail fast. |
| `claude` CLI auth / setup error | Environment | Fail fast. |
| `claude` CLI transient network error | External transient | Backoff + retry. |
| Engine uncaught exception | Internal | Crash. Resume on next invocation via `tbd.jsonl` + `log.jsonl`. |
| Triage produces invalid classification | — | Increment `triage_attempts`; re-append to `tbd.jsonl`. After 3 attempts, move to `failed/` with `FAILURE.md`; emit `triage.abandoned`. |

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

5. Skill packaging (first-class vs nice-to-have).
6. `init` scope (confirm the layout).
7. Definition of Done for cycle's own MVP.

Resolved since the last revision:

1. ✅ Branching & PR strategy — default `auto` (branch off main,
   auto-merge), alternate `stack` (stacked branches, human review). See §7.
2. ✅ State log — global `.cycle/log.jsonl` (append-only) plus
   `.cycle/tbd.jsonl` (pending untriaged issues). Cycle ID is the only
   persistent identity; no run ID. See §6.
3. ✅ Resume semantics — re-invoking `cycle run` with no arguments
   continues consuming `tbd.jsonl`. No explicit `--resume` flag needed.
4. ✅ Queue failure handling — 3 attempts per cycle (fresh branch +
   wiped artifacts between attempts). On exhaustion: preservation
   branch + `Failed Attempt: …` PR; issue moves to `blocked/`;
   remaining planned cycles skip (no IDs consumed). `auto` mode
   continues to next issue; `stack` mode halts. Rate limits orthogonal
   (backoff for short, `engine.paused` + exit 42 for long). See §10.
