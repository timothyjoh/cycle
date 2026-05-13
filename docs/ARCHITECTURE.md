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
│  cycle (./.cycle/bin/cycle.js)       │
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

### Bootstrap

cycle ships as the npm package **`@cycleai/cli`** (backup scope
**`@cycle-afk`** registered for safety). One-time install in a repo:

```bash
npx @cycleai/cli init
```

The npm package contains the prebuilt engine bundle as a static asset.
`init` copies `node_modules/@cycleai/cli/dist/cycle.js` into the
consuming repo's `.cycle/bin/`. Engine version = npm package version
(atomic — no separate engine release pipeline).

Upgrades use the same package with a flag:

```bash
npx @cycleai/cli@latest init --upgrade   # refresh bundle + skill,
                                         # preserve user customizations
npx @cycleai/cli@latest init --force     # overwrite everything
```

`--upgrade` is non-destructive on user-edited files: a 3-way merge
across `workflows/`, `prompts/`, `scripts/` rewrites defaults the user
hasn't touched and leaves the rest in place (printing a diff for any
file that would otherwise be clobbered).

### What ships into the consuming repo

```
.cycle/
├── bin/
│   └── cycle.js          # Single-file bundled engine (esbuild).
│                          # Starts with `#!/usr/bin/env node`, committed
│                          # `chmod +x`, so `./.cycle/bin/cycle.js …` runs
│                          # directly with no `node` prefix on Unix.
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
│   ├── fetch-issue.sh    # Backs `--issue <id>`; dispatches on id prefix
│   │                     # (JIRA- / LIN- / gh-) to a tracker fetch
│   ├── commit.sh
│   ├── pr.sh
│   └── merge.sh          # Git / gh helpers invoked by bash steps
└── CLAUDE.md             # Config docs for agents working on this repo
.claude/
└── skills/
    └── cycle.md          # Claude Code skill; shipped by default
                          # (opt out with `cycle init --no-skill`)
```

Runtime state files (`log.jsonl`, `tbd.jsonl`, `cycle.pid` when a
daemon is alive) live under `.cycle/` and are written at first run,
not by `init`.

### Runtime requirements

- **Node.js** (≥ 22.6; ≥ 24 LTS recommended) — to execute bundled
  `cycle.js`. The bundle is plain JavaScript, so no runtime flags are
  required. Dev-loop `.ts` execution uses Node's native type stripping
  (`--experimental-strip-types` on 22.6+; default on 23.6+).
- **`claude` CLI** — for the `claudecode` agent
- **git** and **`gh`** — branches, commits, PRs, auto-merge
- Optional: **`codex`** — if a workflow routes a step through Codex
- Optional: **tracker API access** (Jira / Linear / GitHub) — only when
  `--issue` needs a remote fetch

After `init` runs once, no further `npm install` is needed in the
consuming repo — the committed `cycle.js` bundle is the engine. No
persistent services. The only daemon is the optional one a user opts
into via `cycle run --detach` (see §3); it lives only as long as its
queue, exits when done, and is one-per-repo (PID file
`.cycle/cycle.pid`).

### Why Node + esbuild

- **Universally present.** Node is on every CI image, every container
  base, and every developer machine. Zero runtime-install friction —
  no extra `curl` step in GitHub Actions or ephemeral containers.
- **Native TypeScript execution — no TS → JS transpile in the dev
  loop.** Node 22.6+ runs `.ts` files directly via
  `--experimental-strip-types`; Node 23.6+ strips types by default.
  Type-checking is a separate `tsc --noEmit` step, not a runtime
  prerequisite.
- **`esbuild` for distribution.** A single devDependency produces the
  bundled `.cycle/bin/cycle.js` — one tool, one command, no broader
  toolchain (rollup + plugins + ts-loader) required.
- **Built-in HTTP server.** `node:http` will power the future HTML
  progress viewer without adding a web framework dependency.
- A **single-executable distribution** via Node SEA
  (`node --experimental-sea-config`) is available if we later need a
  zero-runtime path for specific deployment contexts; out of MVP
  scope.

## 3. Invocation Contract

### CLI

The canonical invocation uses the committed shebang bundle:

```bash
./.cycle/bin/cycle.js run "<task text>"
./.cycle/bin/cycle.js run --issue <ticket-id>
./.cycle/bin/cycle.js run --issues-file <path>
cat issues.json | ./.cycle/bin/cycle.js run --issues-stdin
./.cycle/bin/cycle.js run --workflow <name> "<task text>"
./.cycle/bin/cycle.js run --dry-run "<task text>"
./.cycle/bin/cycle.js run --merge-mode {auto|stack} "…"

# Detached daemon mode (one daemon per repo)
./.cycle/bin/cycle.js run --detach --issues-file <path>

# Daemon control commands (require a live daemon)
./.cycle/bin/cycle.js status               # JSON snapshot
./.cycle/bin/cycle.js attach               # tail .cycle/log.jsonl live
./.cycle/bin/cycle.js stop                 # graceful drain
./.cycle/bin/cycle.js stop --force         # SIGTERM
```

Cross-platform fallback: `node .cycle/bin/cycle.js …` works identically
(useful on Windows where the shebang is ignored).

Flags (strawman):

| Flag | Purpose |
|---|---|
| `--issue <id>` | Fetch a ticket via `.cycle/scripts/fetch-issue.sh <id>` |
| `--issues-file <path>` | Load a JSON array of issues from a file |
| `--issues-stdin` | Read a JSON array of issues from stdin |
| `--workflow <name>` | Skip triage; force a specific workflow per cycle |
| `--dry-run` | Run triage only; print the queue; don't execute |
| `--merge-mode {auto\|stack}` | Default `auto` (merge each cycle to main), alternate `stack` (stacked branches, no auto-merge) |
| `--base <branch>` | Override the PR base branch (default `main`) |
| `--no-pr` | Commit locally but don't push or open PRs |
| `--detach` | Spawn a daemon, write PID to `.cycle/cycle.pid`, exit immediately |
| `--human` | Format `status` / `attach` / `stop` output for humans instead of JSON |

Subcommands:

| Subcommand | Purpose |
|---|---|
| `run` | Process the queue (foreground by default; daemon with `--detach`) |
| `status` | One-shot JSON snapshot of the live daemon (PID, current cycle ID, queue depth, last event, elapsed). Exits non-zero if no daemon. |
| `attach` | Tail `.cycle/log.jsonl` from EOF, follow until daemon exits. Ctrl-C detaches without killing the daemon. |
| `stop` | Signal the daemon to halt gracefully after the current cycle. `--force` sends SIGTERM. |

### Execution model

- **Blocking by default.** The parent caller `spawn`s cycle and waits
  for exit. The engine runs until `tbd.jsonl` is empty or a failure
  stops the queue. CI jobs and ephemeral containers depend on this
  contract — they exit when the process exits.
- **`--detach` for interactive use.** Spawns a daemon, writes its PID
  to `.cycle/cycle.pid`, exits immediately. The daemon runs the same
  scan / process loop and writes the same JSONL log. A second
  `run --detach` in the same repo refuses with a clear error pointing
  at `cycle attach` / `cycle stop`. One daemon per repo.
- **stdout = JSONL** in foreground mode (mirrored to `.cycle/log.jsonl`).
  In detached mode, the parent receives only the daemon-start ACK on
  stdout — the JSONL stream lands in `.cycle/log.jsonl` and is consumed
  via `cycle attach`.
- **stderr = freeform.** Human-legible log output, errors, stack traces.
- **Exit code.** `0` on success, `42` on rate-limit pause, non-zero on
  any other failure. `status` / `attach` / `stop` exit `0` on success,
  non-zero if no live daemon is found.

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

> **Authoritative spec:** [`../docs/RFC-001-issue-lifecycle.md`](../RFC-001-issue-lifecycle.md) §5. This section is a summary.

Triage is an **engine-internal subroutine** with a configurable agent.
Not a workflow — no cycle id, no branch, no PR, no artifact directory.

Triggers:
1. At `engine.start`, if `log.jsonl` shows no in-flight cycle.
2. Between cycles, before each pop, when `raw/` is non-empty.

For each file in `raw/`, the agent enriches with codebase context,
decomposes large issues into vertical-slice children, picks a workflow,
and emits structured JSON:

```json
{
  "ordering": ["Jira-007-fix-login-cookie", "Jira-007-add-2fa-flow"],
  "children": [
    {
      "raw_id": "Jira-007",
      "id": "Jira-007-fix-login-cookie",
      "slug": "fix-login-cookie",
      "title": "Fix login cookie expiry on Safari 17",
      "workflow": "feature",
      "depends_on": [],
      "body": "## Context\n…\n## Acceptance\n- …"
    }
  ],
  "decomposed_parents": ["Jira-007"]
}
```

Engine atomically: writes `todo/<id>.md` files, moves
`raw/<id>.md → done/<id>_raw.md`, appends ordered lines to
`tbd.jsonl`, may rewrite `tbd.jsonl` if triage reorders existing pending
rows (in-progress rows are fenced and cannot be moved).

Configured in `workflows.yml` top section: `agent`, `prompt`,
`max_turns`. Per-raw retry up to 3 attempts. After exhaustion: raw
file → `failed/` with `triage_attempts: 3`. If ALL raws fail in one
pass: `engine.paused` and exit.

### Workflows

Workflows live in **a single `workflows.yml`** at the root of `.cycle/`,
alongside engine config and triage config:

```yaml
# .cycle/workflows.yml
engine:
  max_consecutive_failures: 2
  base_branch: master

triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10

workflows:
  - name: feature
    description: Full SDLC pass for a single cycle of work.
    max_cycle_attempts: 3
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

Three files, both at the repo root under `.cycle/`:

- **`.cycle/log.jsonl`** — append-only event history, mirrored from
  stdout. Source of truth for everything that has happened: triage
  decisions, step starts/ends, commits, PRs, merges, issue lifecycle,
  engine lifecycle. Never rewritten. Used to reconstruct cycle state,
  allocate the next cycle ID, and power the future TUI / HTML viewer.
- **`.cycle/tbd.jsonl`** — live priority-ordered work queue (post-triage).
  One **todo** per line. Rows drain on cycle completion: removed when a
  cycle ends `ok` (file → `done/`) or when attempts exhaust (file →
  `failed/`). On in_progress transition, the row's status flips and
  `cycle_id` is written. Remains populated if the engine crashes — the
  next invocation reads `log.jsonl` first to resume any in-flight cycle,
  then proceeds with the pending rows. See
  [`RFC-001-issue-lifecycle.md`](../RFC-001-issue-lifecycle.md) §6.
- **`.cycle/cycle.pid`** — present only while a `--detach` daemon is
  alive. Contains the daemon PID. `cycle status` / `attach` / `stop`
  read it to locate the running process; `cycle run --detach` refuses
  to start a second daemon if it exists and points to a live PID. The
  daemon removes the file on graceful exit; a stale file (PID is dead)
  is auto-cleaned by the next invocation. Generally gitignored.

Row schema for `tbd.jsonl` (one line per pending or in-progress todo;
the file under `todo/` is the source of truth for body + extended
frontmatter):

```json
{"id":"Jira-007-fix-login-cookie","parent":"Jira-007","title":"…","status":"pending","attempt":0,"depends_on":[],"triaged_at":"2026-05-13T02:30:00Z"}
```

When a row flips to `status: "in_progress"`, the engine writes
`"cycle_id": "0042"` to cross-reference `log.jsonl`.

### Issue state machine (`docs/cycle/issues/`)

> **Authoritative spec:** [`../RFC-001-issue-lifecycle.md`](../RFC-001-issue-lifecycle.md) §2.

Five folders shadow `tbd.jsonl`, giving every issue a durable,
git-visible state:

```
docs/cycle/issues/
├── TEMPLATE.md     # Frontmatter reference for agents creating issues
├── raw/            # Inbox — new files dropped by agents, CLI, tracker fetch, reflection
├── todo/           # Triaged + enriched, vertical-slice, ready to cycle
├── done/           # Successful cycles' files; decomposed parents (suffix `_raw`)
├── failed/         # Cycles that exhausted 3 attempts
└── blocked/        # depends_on chain reached a failed item
```

State transitions:
- `raw/` → triage subroutine → `todo/` (enriched) + `done/<id>_raw.md` (original)
- `todo/` → `done/`: cycle ended ok; tbd.jsonl row removed
- `todo/` → `failed/`: cycle exhausted `max_cycle_attempts`; row removed; `propagateBlocked` may move dependents
- `todo/` → `blocked/`: `depends_on` chain reached a failed item; `blocked_by:` written into frontmatter

Issue file naming: `<id>.md` (e.g., `Jira-007.md` in `raw/`, `Jira-007-fix-login-cookie.md` in `todo/`). For freeform text input the engine generates `txt-<YYYYMMDD-HHMMSS>-<short-slug>.md`.

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
   `./.cycle/bin/cycle.js run --issues-file jira-todo.json`.
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
true state. Re-invoking `./.cycle/bin/cycle.js run` with no
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
For short single-task runs the parent invokes cycle in the foreground
and stays pinned until exit. For multi-issue queues the parent invokes
with `--detach`, gets the daemon-start ACK back immediately, and then
either reads `.cycle/log.jsonl` directly or shells out to
`cycle attach` to follow events.

### Claude Code skill

A skill at `.claude/skills/cycle.md` is installed by default by
`cycle init` (opt out via `--no-skill`). It is **non-prescriptive** —
the skill enumerates cycle's CLI surface (subcommands, flags, exit
codes, JSONL event names, common invocation patterns) and lets Claude
route natural language to the right command shape per request. There
is no hard-coded "if user says X then run Y" dispatch.

Invocation flavors:

- **Slash command** — `/cycle "fix the safari login bug"`,
  `/cycle --issue JIRA-123`, `/cycle status`, `/cycle stop`, etc.
- **Description-triggered** — the user says "use cycle to work through
  these tickets" and Claude Code recognizes the intent.

The skill teaches Claude to split routing between two binaries:

- Bootstrap-class actions (`init`, `init --upgrade`, `init --force`)
  → `npx @cycleai/cli …`.
- Runtime actions (`run`, `status`, `attach`, `stop`) →
  `./.cycle/bin/cycle.js …`.

#### Narration model

Hybrid push / pull, designed so long-running queues don't drown the
chat:

- **Push proactively** on milestones and anything needing human
  attention: `engine.start`, `engine.stop`, `engine.paused`,
  `cycle.start`, `cycle.end`, `cycle.attempt.failed`,
  `cycle.abandoned`, `triage.abandoned`, `issue.completed`,
  `issue.blocked`, `rate_limit.hit`, `rate_limit.resumed`, fatal
  exits.
- **Pull on demand** for routine progress (`step.start`, `step.end`,
  individual `commit` / `pr.opened`). When the user asks "what's
  going on?", Claude summarizes via `cycle status` plus a tail of
  `.cycle/log.jsonl`.

#### Detach defaults

For multi-issue invocations or any `--issues-file` / `--issues-stdin`
input, the skill invokes cycle with `--detach`. Short single-task
runs stay in the foreground so output flows inline.

#### Reattach on a new session

When a new Claude Code session opens in a repo with a live daemon
(`.cycle/cycle.pid` exists, process alive), the skill prompts Claude
to run `cycle status` on the *first* cycle-related prompt and lead
with a snapshot (current cycle ID, queue depth, last event) before
acting on the user's request. No always-on SessionStart hook — the
check is gated by user intent, not session lifecycle.

What the skill explicitly **does not** do (deferred / caller's
responsibility):

- Rescheduling a follow-up invocation after exit-code-42.
- Historical queries / analytics across `log.jsonl` runs.
- Pretty-printing or visualization beyond progress relay.
- Validating credentials — see §2 and BRIEF.md §Auth and credentials.

This keeps the skill resilient against CLI drift — it only needs
updating when the invocation surface changes. Richer wrapping belongs
in the future TUI / HTML viewer, not the skill.

### GitHub Actions

A workflow file (e.g., `.github/workflows/cycle-on-issue.yml`) triggers
on an issue label or comment, spins up a container (usually
`ubuntu-latest`) with `node` + `claude` + repo checkout, and invokes
`./.cycle/bin/cycle.js run --issue ${{ github.event.issue.number }}`
(foreground — CI wants the exit code). Node is preinstalled on
`ubuntu-latest`; use `actions/setup-node` only to pin a specific
version. Tracker / `claude` / `gh` credentials are supplied via
GitHub Actions secrets and exported into the job env — cycle itself
does not preflight or validate them.

### Ephemeral bug-fix containers

Same pattern as Actions, via any orchestrator (Daytona, devcontainers,
custom Docker). Self-contained `.cycle/bin/` means the container only
needs `node` + `claude` + `gh` preinstalled.

---

## 12. Open Architectural Questions

All resolved. See [`BRIEF.md`](../BRIEF.md) §Resolved Decisions and
§Phase Plan.

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
5. ✅ Skill packaging — minimal `.claude/skills/cycle.md` shipped by
   default (`cycle init --no-skill` opts out). Supports `/cycle …`
   slash command and description-triggered invocation. Exit-42
   rescheduling, historical log queries, and visualization deferred
   to callers / future viewer tooling. See §11.
6. ✅ `init` scope — touches `.cycle/`, `.claude/skills/cycle.md`,
   and `docs/cycle/issues/`. `log.jsonl` and `tbd.jsonl` created on
   first run and committed by default. `cycle init --force`
   overwrites existing files. See §2.
7. ✅ Definition of Done — MVP ships after Phase 4 (full failure
   resilience; safe to leave unattended). Phase 5 is post-MVP
   polish. Validated on both the cycle repo (brownfield dog-food)
   and a greenfield test repo. See [`BRIEF.md`](../BRIEF.md)
   §Phase Plan.
8. ✅ Bootstrap & upgrade — npm package `@cycleai/cli` (backup scope
   `@cycle-afk`). `npx @cycleai/cli init` is the one-time bootstrap;
   the prebuilt engine bundle ships inside the package and `init`
   copies it to `.cycle/bin/cycle.js`. Bundle starts with
   `#!/usr/bin/env node`, committed `chmod +x`, so canonical invoke
   is `./.cycle/bin/cycle.js`. `init --upgrade` refreshes engine +
   skill via 3-way merge; `init --force` overwrites everything.
   See §2.
9. ✅ Daemon mode — engine grows an opt-in `--detach` flag (blocking
   remains default for CI / container parity). Detached run writes
   PID to `.cycle/cycle.pid`; second `run --detach` in the same repo
   refuses. Control surface: `cycle attach` (tail), `cycle status`
   (JSON snapshot), `cycle stop` (graceful), `cycle stop --force`.
   All JSON-out by default; `--human` for terminal formatting.
   See §3 and §6.
10. ✅ Skill behavior — non-prescriptive: enumerates CLI surface,
    Claude routes natural language. Hybrid push/pull narration
    (push milestones + failures, pull routine). Reattach via skill
    prose — Claude runs `cycle status` on first cycle-related prompt
    in any session with a live daemon. `--detach` is the skill's
    default for multi-issue runs. See §11.
11. ✅ Issue fetch — `--issue <id>` delegates to
    `.cycle/scripts/fetch-issue.sh` (engine ships defaults that
    dispatch on id prefix; users override per repo). No tracker SDKs
    in the engine bundle. See §2 (scripts) and BRIEF.md §Issue
    Ingestion.
12. ✅ Auth — deferred entirely to the caller. No env-var contract
    documented by the engine, no preflight credential check, no
    `cycle doctor` subcommand. CI secrets, dev-machine config, and
    container env are responsible for ensuring `claude`, `gh`, and
    fetch / commit / pr scripts are pre-authenticated. See
    BRIEF.md §Auth and credentials.
