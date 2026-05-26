# cycle — Architecture

> Companion to [`BRIEF.md`](../BRIEF.md). Where the brief explains *what*
> cycle is and *why*, this document explains *how* it is put together. For
> subsystem-level implementation detail, see [`ENGINE.md`](ENGINE.md).
>
> This document describes **current shipped behavior**. Targets that are not
> yet built (pull requests, auto-merge, stacked branches, a detached daemon)
> are called out in [§12 Not Yet Built](#12-not-yet-built), not woven into
> the narrative as if present.

## 1. System Context

cycle is not a top-level application. It is a library + engine invoked by
**something else** — a parent agent or a CI job — and it acts on the local
working tree of the repo it is installed in.

```
┌──────────────────────────────────────┐
│  Parent caller                       │
│  (Claude Code, GitHub Actions, …)    │
└────────────────┬─────────────────────┘
                 │  spawn + one or more issues
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
                 │  artifacts (docs/cycle/<cycle-id>-…/)
                 │  commits + branches (pushed)
                 ▼
        Parent caller observes
```

Contracts:

- **In:** one or more *issues*. An issue is any unit of work — free-text
  task, Jira card, GH issue, PRD, brief. Any entry point (positional
  `"task text"`, or a file dropped into `docs/cycle/issues/raw/` by an
  external agent) materializes as a markdown file in the `raw/` inbox. The
  engine's triage pass then picks it up.
- **Out:** JSONL event stream on stdout (mirrored to `.cycle/log.jsonl`);
  durable per-cycle artifacts under `docs/cycle/<cycle-id>-<workflow>-<slug>/`;
  branches and commits (pushed when `push: true`); issue files advancing
  through `raw/ → todo/ → done/` as state changes; a final exit code.

## 2. Distribution & Runtime

### Bootstrap

cycle ships as the npm package **`@cycleai/cli`** (backup scope
**`@cycle-afk`**). One-time install in a repo:

```bash
npx @cycleai/cli init
```

The npm package contains the prebuilt engine bundle as a static asset.
`init` copies it into the consuming repo's `.cycle/bin/cycle.js`. Engine
version = npm package version (atomic — no separate engine release
pipeline).

Upgrades use the same package with a flag:

```bash
npx @cycleai/cli@latest init --upgrade   # refresh bundle + skill,
                                         # preserve user customizations
npx @cycleai/cli@latest init --force     # overwrite everything
```

`--upgrade` is non-destructive on user-edited files: it rewrites defaults
the user has not touched and leaves the rest in place.

### What ships into the consuming repo

```
.cycle/
├── bin/
│   └── cycle.js          # Single-file bundled engine (esbuild). Starts with
│                          # `#!/usr/bin/env node`, committed `chmod +x`, so
│                          # `./.cycle/bin/cycle.js …` runs with no `node` prefix.
├── workflows.yml         # Engine, triage, and workflow configuration (one file)
├── prompts/              # Prompt templates for each workflow step and triage
├── scripts/              # verify.sh and git helpers invoked by bash steps
.claude/
└── skills/
    └── cycle.md          # Claude Code skill; shipped by default
                          # (opt out with `cycle init --no-skill`)
docs/cycle/issues/        # raw / todo / done / failed / blocked
```

Runtime state files (`log.jsonl`, `tbd.jsonl`, `engine.lock` while an
engine is running) live under `.cycle/` and are written at first run, not
by `init`.

### Runtime requirements

- **Node.js** (≥ 22.6) — to execute the bundled `cycle.js`. The bundle is
  plain JavaScript, so no runtime flags are required. The dev loop runs
  `.ts` directly via Node's native type stripping
  (`--experimental-strip-types` on 22.6+; default on 23.6+).
- **`claude` CLI** — for the default `claudecode` agent.
- **git** and **`gh`** — branches, commits, pushes.
- Optional: **`codex`**, **`gemini`**, **`auggie`**, **`opencode`**,
  **`pi`** — if a workflow routes a step through one of these agents.

After `init` runs once, no further `npm install` is needed — the committed
`cycle.js` bundle is the engine. There are no persistent services.

### Why Node + esbuild

- **Universally present.** Node is on every CI image, container base, and
  developer machine — zero runtime-install friction.
- **Native TypeScript execution.** No TS → JS transpile in the dev loop;
  type-checking is a separate `tsc --noEmit` step.
- **`esbuild` for distribution.** A single devDependency produces the
  bundled `.cycle/bin/cycle.js` — one tool, one command.

## 3. Invocation Contract

### CLI

The canonical invocation uses the committed shebang bundle:

```bash
./.cycle/bin/cycle.js run "<task text>"     # run one freeform task to completion
./.cycle/bin/cycle.js run                    # no text → drain whatever is queued
./.cycle/bin/cycle.js run --workflow <name> "<task text>"
./.cycle/bin/cycle.js run --dry-run "<task text>"   # triage/queue preview, no execution
./.cycle/bin/cycle.js drop "<task text>"     # materialize an issue into raw/, don't run
./.cycle/bin/cycle.js status                 # log-derived queue snapshot
./.cycle/bin/cycle.js triage --dry-run       # re-run triage read-only
./.cycle/bin/cycle.js cleanup [--dry-run|--yes] [--force]  # prune orphaned cycle/* branches
```

Cross-platform fallback: `node .cycle/bin/cycle.js …` works identically
(useful on Windows where the shebang is ignored).

`run` flags:

| Flag | Purpose |
|---|---|
| `--workflow <name>` | Force a specific workflow per cycle instead of triage's choice (default `feature`) |
| `--dry-run` | Print the pending queue as `issue.ingested` events and exit; no execution |
| `--no-skip-completed` | On retry, re-derive `spec`/`research`/`plan` even if their artifacts exist |
| `--trunk` | Commit straight to the base branch instead of per-cycle branches (sets `CYCLE_TRUNK_BASED`) |

Subcommands:

| Subcommand | Purpose |
|---|---|
| `run` | Materialize any task text, then process the queue to completion (foreground, blocking) |
| `drop` | Materialize a freeform task into `raw/` and exit without running the engine |
| `status` | One-shot snapshot derived from `.cycle/log.jsonl` (queue counts, in-flight cycle) |
| `triage` | `--dry-run` re-runs triage against `raw/` without mutating state |
| `cleanup` | List (or, with `--yes`, delete) local `cycle/*` branches that have no matching `in_progress` queue row |
| `init` | Scaffold (or `--force` overwrite) the repo-local factory kit |

### Execution model

- **Blocking.** The parent caller `spawn`s cycle and waits for exit. The
  engine runs until `tbd.jsonl` is empty or a failure stops the queue. CI
  jobs and ephemeral containers depend on this contract.
- **One engine per repo.** At startup the engine acquires a PID lockfile at
  `.cycle/engine.lock`; a second concurrent invocation exits non-zero
  rather than racing the first.
- **stdout = JSONL** (mirrored to `.cycle/log.jsonl`). **stderr = freeform**
  human-legible log output, errors, stack traces.
- **Exit code.** `0` on success, `42` on rate-limit pause, non-zero on any
  other failure.

### JSONL event schema

The log is a flat, append-only stream of `{ts, event, …}` objects. New
`event` types can be added without breaking parsers that ignore unknowns.
There is no per-run ID; engine lifecycle is bracketed by `engine.start` /
`engine.stop`.

```jsonl
{"ts":"…","event":"engine.start"}
{"ts":"…","event":"issue.dropped","issue_id":"txt-20260522-120000-fix-login","path":"docs/cycle/issues/raw/…"}
{"ts":"…","event":"cycle.start","cycle_id":"0042","workflow":"feature","title":"…","issue_id":"…","attempt":1}
{"ts":"…","event":"step.start","cycle_id":"0042","step":"spec","agent":"claudecode"}
{"ts":"…","event":"step.end","cycle_id":"0042","step":"spec","status":"ok","duration_ms":12345,"artifact":"docs/cycle/0042-feature-…/SPEC.md"}
{"ts":"…","event":"commit","cycle_id":"0042","sha":"…"}
{"ts":"…","event":"cycle.end","cycle_id":"0042","status":"ok"}
{"ts":"…","event":"engine.stop","status":"ok"}
```

Failed `step.end` events (any agent) carry a head-capped `stderr` field
(2000-char cap). Successful events omit it. A skipped pre-build step on
retry emits `step.skipped {reason: "artifact_present", artifact_path}` in
lieu of `step.start` / `step.end`.

Triage-failure and rate-limit variants:

```jsonl
{"ts":"…","event":"triage.raw.failed","raw_id":"…","attempt":1,"error":"…"}
{"ts":"…","event":"engine.paused","reason":"all_triage_failed","raw_ids":["…"],"last_errors":[…]}
{"ts":"…","event":"rate_limit.hit"}
{"ts":"…","event":"engine.paused","reason":"rate_limit","retry_after":"…"}
```

> **Note:** `rate_limit.hit` and `engine.paused {reason: "rate_limit"}` are not yet emitted. The detection primitive `isRateLimitError` in `src/engine/rate-limit.ts` exists but wiring into exec modules and the run-cycle pause/retry loop is pending.

## 4. Execution Model

### Engine lifecycle

1. **Parse args.** For freeform task text, materialize a markdown file in
   `docs/cycle/issues/raw/` (`txt-<YYYYMMDD-HHMMSS>-<slug>.md`).
2. **Acquire the engine lock** (`.cycle/engine.lock`); refuse to start if a
   live engine already holds it. Emit `engine.start`.
3. **Triage `raw/`.** Enrich each raw issue, decompose large ones into
   vertical-slice children, write `todo/<id>.md`, and append rows to
   `tbd.jsonl`. (See [§4 Triage](#triage).)
4. **Process loop** (until `tbd.jsonl` has no runnable pending row):
   - **Pop** the next pending row, honoring priority tiers and the
     `depends_on` topological clamp.
   - **Allocate the cycle ID** by scanning `log.jsonl` for the highest
     existing ID and incrementing; create
     `docs/cycle/<cycle-id>-<workflow>-<slug>/`.
   - **Attempt loop** (up to `max_cycle_attempts`, default 3): load the
     workflow, execute its steps in order (each honoring its own
     `on_fail` policy and post-conditions). On a code-level gate failure,
     abandon the attempt and restart on a clean tree; on success, the
     engine commits and pushes, then emits `cycle.end`.
   - **On exhausted attempts:** stamp the issue file, move `todo/ → failed/`,
     run blocked-propagation over dependents, and continue with the next
     issue.
   - **On success:** move `todo/ → done/`; the `tbd.jsonl` row drains.
5. **Re-triage `raw/`** between cycles whenever new files have appeared.
6. **Finalize.** When nothing runnable remains, release the lock, emit
   `engine.stop`, and exit `0`.

Triage and the queue together stay a meaningful live backlog. Crash-resume
is trivial: re-invoking `cycle run` with no arguments reads the `log.jsonl`
tail to resume any in-flight cycle, then continues the pending rows.

### Triage

> **Authoritative spec:** [`RFC-001-issue-lifecycle.md`](RFC-001-issue-lifecycle.md) §5. This is a summary.

Triage is an **engine-internal subroutine** with a configurable agent — not
a workflow (no cycle id, no branch, no artifact directory). It runs at
`engine.start` and again before each pop when `raw/` is non-empty.

For each file in `raw/`, the agent enriches it with codebase context,
decomposes large issues into vertical-slice children, picks a workflow, and
emits structured JSON:

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

The engine atomically writes `todo/<id>.md` files, moves
`raw/<id>.md → done/<id>_raw.md`, and appends ordered rows to `tbd.jsonl`.
Configured in the top of `workflows.yml` (`agent`, `prompt`, `max_turns`).
Per-raw retry up to 3 attempts. On partial failure the failed subset moves
to `failed/<id>.md`; if *all* raws fail in one pass the engine emits
`engine.paused {reason: "all_triage_failed", …}` and exits, leaving the
raws in place for `cycle triage --dry-run` to re-evaluate.

### Workflows

Workflows live in **a single `workflows.yml`** at the root of `.cycle/`,
alongside engine and triage config:

```yaml
# .cycle/workflows.yml
engine:
  max_consecutive_failures: 2
  base_branch: master
  commit:
    mode: worktree-pr        # trunk | local-only | worktree-pr
    push: true

triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10

workflows:
  - name: feature
    description: Full SDLC pass for a single cycle of work.
    max_cycle_attempts: 3
    steps:
      - { name: spec,          agent: claudecode, prompt: prompts/spec.md }
      - { name: research,      agent: claudecode, prompt: prompts/research.md }
      - { name: plan,          agent: claudecode, prompt: prompts/plan.md }
      - { name: build,         agent: claudecode, prompt: prompts/build.md }
      - { name: review,        agent: claudecode, prompt: prompts/review.md }
      - { name: fix,           agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify,        agent: bash,       command: scripts/verify.sh }
      - { name: reflection,    agent: claudecode, prompt: prompts/reflection.md }
      - { name: final_fix,     agent: claudecode, prompt: prompts/final_fix.md, skip_unless: FINAL_FIXES.md }
      - { name: final_verify,  agent: bash,       command: scripts/verify.sh }
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
```

Per-step fields:

| Field | Meaning |
|---|---|
| `name` | Step identifier (also referenced by skip conditions) |
| `agent` | One of `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi`, `bash` |
| `prompt` | Path (relative to `.cycle/`) to the prompt template (AI agents) |
| `command` | Shell command (for the `bash` agent) |
| `model` | Override model for this step (`codex`/`auggie`/`opencode`/`pi` → `--model`) |
| `thinking` | Thinking level for this step (`codex`/`auggie`/`opencode`/`pi` → `--thinking`) |
| `skip_unless` | Only run if the named artifact exists in the cycle's artifact dir |
| `on_fail` | `exit` (default) \| `continue` \| `retry:N` |

### Agents

| Agent | Execution | Use for |
|---|---|---|
| `claudecode` | `claude -p` (piped) | All AI steps by default |
| `codex` | `codex` subprocess (optional `--model`/`--thinking`) | Alternative for build / fix / review |
| `gemini` | `gemini` subprocess | Alternative AI agent |
| `auggie` | `auggie` subprocess (optional `--model`/`--thinking`) | Alternative for build / fix / review |
| `opencode` | `opencode` subprocess (optional `--model`/`--thinking`) | Alternative for build / fix / review |
| `pi` | `pi` subprocess (optional `--model`/`--thinking`) | Alternative for build / fix / review |
| `bash` | Direct shell (array args, no `shell: true`) | `verify`, scripts |

New agent types require a rebuild of `cycle.js`.

## 5. Workflow Library

Four workflows ship by default. Triage selects one per slice; `--workflow`
forces a choice.

### `feature` — full SDLC

```
spec → research → plan → build → review → fix → verify → reflection → final_fix → final_verify → documentation
```

`fix` and `final_fix` are conditional (`skip_unless` gates). `reflection`
and `documentation` are non-fatal terminal steps — a failure emits a
`*.skipped` event but does not flip `cycle.end` to failed.

### `quickfix` — surgical fix

```
plan_fix → quick_fix → test_fix → verify
```

For a well-scoped issue. No spec, no research, no review.

### `document` — docs / prompt edits

```
plan_documents → authoring → review_documents → verify
```

No code, no reflection.

### `e2e-tests` — Playwright tests

```
research → test_plan → test_build → review → fix → verify
```

Writes or extends end-to-end tests against the running app; works directly
on the base branch.

> **There is no separate `epic` workflow.** An issue that needs multiple
> cycles is simply one whose triage returned multiple queue entries, each a
> standalone workflow run.

## 6. State & Artifacts

### Engine state (in `.cycle/`)

- **`.cycle/log.jsonl`** — append-only event history, mirrored from stdout.
  Source of truth for everything that has happened; never rewritten. Used
  to reconstruct cycle state, allocate the next cycle ID, and power
  `cycle status`.
- **`.cycle/tbd.jsonl`** — live, priority-ordered work queue (post-triage).
  One todo per line. Rows drain on cycle completion: removed when a cycle
  ends `ok` (file → `done/`) or exhausts its attempts (file → `failed/`).
  On the `in_progress` transition, the row's status flips and `cycle_id` is
  written. Survives a crash — the next invocation reads `log.jsonl` first to
  resume any in-flight cycle, then proceeds with the pending rows. See
  [`RFC-001-issue-lifecycle.md`](RFC-001-issue-lifecycle.md) §6.
- **`.cycle/engine.lock`** — PID lockfile held for the life of a running
  engine, enforcing one engine per repo. Released on exit; a stale lock
  (dead PID) is reclaimed by the next invocation.

Row schema for `tbd.jsonl` (the file under `todo/` is the source of truth
for body + extended frontmatter):

```json
{"id":"Jira-007-fix-login-cookie","parent":"Jira-007","title":"…","status":"pending","attempt":0,"depends_on":[],"triaged_at":"2026-05-13T02:30:00Z"}
```

When a row flips to `status: "in_progress"`, the engine writes
`"cycle_id": "0042"` to cross-reference `log.jsonl`.

### Issue state machine (`docs/cycle/issues/`)

> **Authoritative spec:** [`RFC-001-issue-lifecycle.md`](RFC-001-issue-lifecycle.md) §2.

Five folders shadow `tbd.jsonl`, giving every issue durable, git-visible
state:

```
docs/cycle/issues/
├── raw/            # Inbox — new files dropped by agents, CLI, or reflection
├── todo/           # Triaged + enriched, vertical-slice, ready to cycle
├── done/           # Successful cycles' files; decomposed parents (suffix `_raw`)
├── failed/         # Cycles that exhausted their attempt budget
└── blocked/        # depends_on chain reached a failed item
```

State transitions:

- `raw/` → triage → `todo/` (enriched) + `done/<id>_raw.md` (original)
- `todo/` → `done/`: cycle ended ok; `tbd.jsonl` row removed
- `todo/` → `failed/`: cycle exhausted `max_cycle_attempts`; `propagateBlocked` may move dependents
- `todo/` → `blocked/`: `depends_on` chain reached a failed item; `blocked_by:` written into frontmatter

For freeform text input the engine generates
`txt-<YYYYMMDD-HHMMSS>-<short-slug>.md`.

### Per-cycle artifact directory (durable)

```
docs/cycle/0042-feature-safari-login/
├── TRIAGE.md     # Only on the first cycle emitted from a given triage
├── SPEC.md
├── RESEARCH.md
├── PLAN.md
├── REVIEW.md
├── REFLECTION.md
├── touched.json  # Files this cycle's mutation steps actually changed
└── …
```

Each cycle directory is committed as part of that cycle's change. Maintainers
can keep or prune `docs/cycle/` later.

### Cycle ID

4-digit zero-padded integer (`0001`–`9999`), globally unique within the
project repo. Allocated at cycle start by scanning `log.jsonl` for the
highest existing ID and incrementing. A run is just one process execution —
a temporal boundary, not a persistent identity; cycles are the only
persistent identity the system mints.

## 7. Branching & Commit

The engine — not workflow steps — owns all git operations after a cycle's
steps complete, configured via `engine.commit` in `workflows.yml`:

```yaml
engine:
  commit:
    mode: trunk | local-only | worktree-pr
    push: true | false
```

- **`worktree-pr`** (shipped default) — each cycle gets its own
  `cycle/<workflow>/<slug>` branch, with head-SHA capture on `build`/`fix`
  `step.start` and SHA-based hard-reset on retry/resume.
- **`trunk`** — no cycle branches; the engine commits straight to the base
  branch. Enabled per-run with `--trunk` or per-repo with
  `CYCLE_TRUNK_BASED=1` in `.cycle/.env`.
- **`local-only`** — same as `trunk` but `push` is forced false.

After the steps pass, `commitCycle` stages every non-denied file (the
denylist covers `.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`,
`*.lock`, and submodule gitlinks), commits with subject
`cycle <id>: <title>`, appends any `Closes #N` lines parsed from the issue
body, and — when `push: true` — pushes with 3× backoff retry. A
`commit.scope_warning` is logged (never blocking) when a staged `src/`/`scripts/`
file is absent from the cycle's `touched.json` footprint.

## 8. Anatomy of a Typical Run

1. A parent agent runs `./.cycle/bin/cycle.js run "fix safari login bug"`.
2. cycle materializes the task into `docs/cycle/issues/raw/` and emits
   `engine.start` after acquiring `.cycle/engine.lock`.
3. Triage enriches the raw issue and writes `todo/<id>.md` plus a
   `tbd.jsonl` row (decomposing into several rows if the issue is large).
4. The process loop pops the row, scans `log.jsonl` for the highest cycle
   ID (say `0041`), allocates `0042`, and creates
   `docs/cycle/0042-feature-safari-login/`.
5. Cycle `0042` runs the `feature` steps, each emitting `step.start` /
   `step.end`. On success the engine commits and pushes, emits `cycle.end`,
   and moves the issue file from `todo/` to `done/`.
6. The loop continues until `tbd.jsonl` has no runnable row, re-triaging
   `raw/` if new files appeared. Final: `engine.stop` with status `ok`,
   exit `0`.

**Crash recovery:** if the engine crashes mid-cycle, `tbd.jsonl` still holds
the pending rows and `log.jsonl` records what happened. Re-invoking
`./.cycle/bin/cycle.js run` with no arguments resumes the in-flight cycle
from the log tail, then continues the queue.

**External agent drop:** while the engine processes one cycle, another agent
can drop a file into `raw/`; the engine picks it up on the next triage pass
instead of stopping.

## 9. Extensibility

- **New workflows.** Add an entry under `workflows:` in
  `.cycle/workflows.yml` referencing prompts in `.cycle/prompts/`. It
  becomes a valid `--workflow` argument and can be selected by triage once
  the triage prompt knows about it.
- **New prompts.** Edit markdown files in `.cycle/prompts/` — no rebuild.
- **Custom commit / verification logic.** Override scripts in
  `.cycle/scripts/`.
- **New agent types.** Require a rebuild of `.cycle/bin/cycle.js`.

## 10. Failure Modes

Two layers of retry:

- **Step-level** (`on_fail: retry:N` in workflow YAML) for transient step
  issues.
- **Cycle-level** (`max_cycle_attempts`, default 3) — on a code-level gate
  failure, the attempt is abandoned and a fresh attempt re-runs on the same
  branch with `build`/`fix` hard-reset to pre-step HEAD; pre-build artifacts
  (`SPEC.md`/`RESEARCH.md`/`PLAN.md`) are reused via the skip gate below.
- **Pre-build skip on retry:** on attempts 2+, the engine skips
  `{spec, research, plan}` if the corresponding `<artifactDir>/<STEP>.md`
  is present with `> 0` bytes (`step.skipped {reason: "artifact_present"}`).
  Opt out with `--no-skip-completed` or
  `engine.skip_completed_on_retry: false`.

| Failure | Category | Behavior |
|---|---|---|
| `verify` fails after step-level retries | Code-level gate | Attempt failure — abandon and restart. |
| `review` produces unresolvable must-fixes after `fix` | Code-level gate | Attempt failure. |
| `build` fails after step-level retries | Code-level gate | Attempt failure. |
| Attempt budget exhausted | — | Stamp + move issue to `blocked/`; skip its remaining planned cycles; `propagateBlocked` moves dependents. Queue continues with the next issue. |
| Rate limit (short) | External transient | In-process exponential backoff. No attempt consumed. |
| Rate limit (long) | External transient | Emit `engine.paused`; exit `42`. Caller re-invokes later. |
| Push network error | Infrastructure | Backoff, retry up to 3 times. No attempt consumed. |
| Push auth / git error | Environment | Fail fast — engine exits non-zero. |
| Engine uncaught exception | Internal | Crash; resume on next invocation via `tbd.jsonl` + `log.jsonl`. |
| All raws fail triage in one pass | — | `engine.paused {reason: "all_triage_failed"}`; raws stay in `raw/` for `cycle triage --dry-run`. |

The queue **halts** after `engine.max_consecutive_failures` consecutive
terminal failures (default 2): the engine emits `engine.halted` then
`engine.stop {status: "halted"}` and exits non-zero.

## 11. Integration Surfaces

### Parent agent (Claude Code, …)

Spawns cycle in the foreground, parses the JSONL events, and relays
progress back to its human. A skill at `.claude/skills/cycle.md` is
installed by default by `cycle init` (opt out via `--no-skill`). The skill
is **non-prescriptive** — it enumerates cycle's CLI surface (subcommands,
flags, exit codes, JSONL event names) and lets Claude route natural language
to the right command, rather than hard-coding an "if user says X then run Y"
dispatch.

### GitHub Actions / ephemeral containers

The same blocking invocation works under CI. A workflow file triggers on an
issue label or comment, spins up a container with `node` + `claude` + `gh` +
repo checkout, and runs `./.cycle/bin/cycle.js run "…"` in the foreground —
CI wants the exit code. Credentials are supplied via the environment; cycle
does not preflight or validate them.

## 12. Not Yet Built

The engine commits and pushes today; the broader factory model is still
landing. The following are described in the project's design history but are
**not implemented** in the current engine, and are intentionally absent from
the narrative above:

- **Pull-request creation and auto-merge.** `worktree-pr` mode creates a
  per-cycle branch and pushes it, but does not yet open a PR or merge it.
- **Stacked-branch / human-review mode** (`--merge-mode stack`).
- **A detached daemon** (`run --detach`) with `attach` / `stop` control and
  a `.cycle/cycle.pid` lifecycle. The current model is a single foreground
  engine guarded by `.cycle/engine.lock`.
- **Multi-issue batch intake flags** (`--issue <id>`, `--issues-file`,
  `--issues-stdin`) and tracker fetch scripts.
- **The HTML / TUI progress viewer.**
