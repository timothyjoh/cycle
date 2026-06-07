<p align="center">
  <img src="./cycle-0.0.1.png" alt="cycle logo" width="400" />
</p>

# cycle

**cycle is a repo-local production cell for AFK software development.** Drop an issue into a repository and walk away. One serialized lane picks it up, splits it into buildable slices, and runs a full workflow on each: spec, build, verify, commit. You come back to reviewable commits and a log of every step.

cycle targets the two places autonomous development gets hard:

- **Brownfield repos**, where a ticket hides conventions, coupling, stale tests, and merge policy that a naive agent will miss.
- **Greenfield repos**, where a rough brief needs to become a sequence of scoped implementation cycles.

Either way, you get an ordered queue of cycles, each one logged and committed. cycle runs **one engine per repository, one cycle at a time**. To do more at once, run more instances, one per repo. cycle never forks parallel workers onto a single tree.

> **Part of an ecosystem.** cycle is the **engine**, one autonomous SDLC lane per repository. **[maestro](https://github.com/timothyjoh/maestro)** is the **control plane** above it: a chat-first, event-sourced layer that observes and orchestrates a *fleet* of cycle engines across many repos. cycle runs on its own; maestro lets you watch and steer a whole fleet at once. The bet behind both is **trustworthy AFK delivery**: fill the queues, walk away, and the fleet finishes the work or fails loudly, with a durable record either way. cycle is agent-agnostic; the ecosystem aims to be engine-agnostic.

## Host prerequisites

cycle installs a repo-local engine; it does **not** install the host environment. Before you leave it AFK, the machine needs this tooling already in place:

- **Node.js >= 22.6** to run the bundled engine.
- **git** for status, branch/reset, commit, and push operations.
- **GitHub CLI (`gh`)** when workflows or automation interact with GitHub.
- **An authenticated coding agent CLI** matching `.cycle/workflows.yml`; the default workflows use `claudecode`, which expects the `claude` CLI.
- **Repository dependencies** required by `.cycle/scripts/verify.sh`.
- **Git credentials and remote access** when push is enabled.
- **A POSIX shell** to run `agent: bash` steps: `/bin/bash` on Linux/macOS. The shell is resolvable. Native-Windows users can install git-bash (auto-discovered) or set `engine.shell` in `.cycle/workflows.yml` (or the `CYCLE_SHELL` env var) to a bash path. Full per-platform setup is deferred to a later phase.

See [`docs/runtime-environment.md`](docs/runtime-environment.md) for setup guidance. Run `cycle doctor` (alias `cycle preflight`) to check your agent CLIs and required tools on demand — see [`docs/doctor.md`](docs/doctor.md).

## What cycle is

You install cycle into a repository and invoke it from a parent agent, a CI job, a cloud VM, or your laptop. It runs until the queue empties or a safety gate stops it.

An **issue** can be almost anything:

- a one-line freeform task
- a GitHub / Jira / Linear ticket dropped into the repo
- a bug report
- a PRD or a brief
- a reflection surfaced by a previous cycle

cycle turns that into work a machine can run: it triages the issue, enriches it with codebase context, splits a large ask into vertical slices, runs the configured workflow on each, and emits branches, commits, logs, and artifacts along the way. You get back a tested, explained change to review.

## What cycle is not

Most agentic coding tools compete on interactive, parallel-agent UX. cycle skips all of it.

- **Not an interactive parallel-agent IDE.** No git worktrees racing over the same tree, no per-task diff-review or merge/PR UX. The human stays **out of the per-task loop**. The unit of parallelism is another repo-local cycle instance, coordinated from above (see **[maestro](https://github.com/timothyjoh/maestro)**), rather than workers fighting over one working tree.
- **Not mid-cycle steering.** You don't interrupt or redirect a running cycle mid-step. You steer **between cycles**: drop an issue, reprioritize the queue, let the reflection step self-feed. Steering inside a cycle is the engine's job (the workflow, reflection), not yours.
- **Not a code-review tool.** Trust comes from the engine's **guarantees**, not from a human reading every diff: completion-proof post-conditions, anti-slop empty-diff guards, verify-before-commit, halt accounting, rate-limit retries, no-op detection, and self-healing failure recovery. A cycle **finishes or fails loudly** with an auditable trail, rather than producing diffs for someone to babysit.

## Why it exists

Most agentic coding tools are good at a single interactive turn. They struggle with the rest: working through a backlog, grinding the same SDLC loop on each item, honoring a repo's quirks, recovering when a run breaks, and leaving a trail you can trust.

cycle handles that part. A parent agent or automation layer hands it work through one subprocess, and cycle runs the mechanics:

- **Intake.** Normalize freeform tasks, tracker issues, and raw markdown drops into one inbox.
- **Triage.** Inspect the repo, enrich each issue, pick a workflow, and split oversized asks into smaller cycles.
- **Execution.** Run a `spec → research → plan → build → review → fix → verify → reflection → documentation` style workflow per slice. Commit and push are engine-managed after the steps pass.
- **Quality gates.** Run verification before commit, enforce post-conditions on each step, and retry a failed cycle from a clean slate.
- **State.** Keep a live drain queue plus an append-only JSONL audit log.
- **Recovery.** Resume in-flight work after a crash, pause safely when triage fails, and block only dependent work after a terminal failure.

## The production-cell model

Every cycle is one serialized production run inside a repo-local lane:

1. Start from the current base branch.
2. Run the workflow steps with repo-aware prompts and scripts.
3. Verify the change.
4. Commit only the intended change surface.
5. Push, then move to the next queued cycle.

If a run goes bad, cycle throws the attempt away and starts over from a clean tree rather than nursing a broken one along. The point is a lane predictable enough to leave running unattended. Coordinating many repos is the orchestrator's job above cycle: one engine per repo, and maestro decides what each should work on.

## Why it works for brownfield

Autonomous coding tends to fall apart on brownfield repos. cycle assumes a repo is messy until proven otherwise:

- issue descriptions may be stale or incomplete
- tests may already be failing
- conventions may differ across subtrees
- changes may have hidden blast radius
- failures should not poison unrelated queued work

So cycle treats repo context and artifacts as real outputs. Each cycle writes its work under `docs/cycle/<cycle-id>-<workflow>-<slug>/`, keeps issue state under `docs/cycle/issues/`, and appends progress to `.cycle/log.jsonl`. The log and the work queue (`.cycle/tbd.jsonl`) are git-tracked and committed every cycle, so a fresh clone already has the full run history and the live queue. You read what happened from those files instead of reconstructing it from a chat transcript.

## What ships into a repo

`npx @cycleai/cli init` installs a small set of repo-local files:

- `.cycle/bin/cycle.js`: the bundled engine (single file, `#!/usr/bin/env node` shebang, committed executable)
- `.cycle/workflows.yml`: engine, triage, and workflow configuration
- `.cycle/prompts/`: prompt templates for each workflow step and for triage
- `.cycle/scripts/`: git / verification helpers
- `docs/cycle/issues/`: `ideas` / `inbox` / `todo` / `done` / `failed` / `blocked` issue folders
- optional `.claude/skills/cycle.md`: a Claude Code skill that teaches a parent agent how to invoke cycle

The consuming repo does not need to become a Node project. After `init`, the committed `.cycle/bin/cycle.js` bundle is the engine, with no `npm install` required.

## Quick start

Initialize cycle in a repo:

```sh
npx @cycleai/cli init
```

Run a single freeform task end to end (foreground, blocking until the queue drains):

```sh
./.cycle/bin/cycle.js run "fix the flaky login test"
```

Drop work into the inbox without starting the engine, then drain the queue later:

```sh
./.cycle/bin/cycle.js drop "investigate why checkout retries twice"
./.cycle/bin/cycle.js run        # no task text → process whatever is queued
```

Force a specific workflow (skip triage's choice):

```sh
./.cycle/bin/cycle.js run --workflow quickfix "bump the lodash pin"
```

Inspect the queue and latest log-derived status:

```sh
./.cycle/bin/cycle.js status
```

Re-run triage as a read-only diagnostic (no state mutation):

```sh
./.cycle/bin/cycle.js triage --dry-run
```

`run` flags: `--workflow <name>`, `--dry-run` (triage/queue preview only), `--no-skip-completed` (force re-derivation of pre-build artifacts on retry), `--trunk` (commit straight to the base branch instead of per-cycle branches), `--skip-preflight` (bypass the engine-start preflight gate).

**Preflight gate.** Before the first cycle starts, `cycle run` validates the execution environment: it probes every agent CLI the active workflow + triage will use (`<bin> --version`, resolving binaries the same way the engine dispatches them, honoring any `CYCLE_<AGENT>_BIN` override) and confirms the required external tools (`bash`, `git`, plus any literal tools your bash steps invoke) resolve on PATH. A wrong-platform agent build, a missing agent CLI, or a missing tool produces a single clean halt naming the resolved path and the fix, instead of a cryptic stack trace discovered mid-cycle. Under WSL, an agent or tool resolving under `/mnt/c/...` emits a non-fatal warning (it may shadow a native Linux install). Pass `--skip-preflight` to bypass the gate.

**One engine per repo.** A second `cycle run` against a repo that already has a live engine is rejected immediately — before any engine event is written — with `engine already running, pid X` on stderr and a dedicated exit code **75** (so scripts can detect "already running" specifically, distinct from the generic `1`). The running engine's `log.jsonl` and lockfile are left completely untouched. A stale lock left by a crashed engine is reclaimed automatically so a fresh `cycle run` after a crash still works.

## Upgrading

`cycle init` is for first-time scaffolding in a fresh repo: it writes every artifact unconditionally, so re-running it would clobber any prompts, workflows, or scripts you have customized. To refresh the engine in a repo that is *already* initialized, use `cycle upgrade` instead:

```sh
./.cycle/bin/cycle.js upgrade
```

`cycle upgrade` makes the safe choice the default:

- **Always refreshed** (never user-edited): `.cycle/bin/cycle.js` and `.cycle/package.json` are overwritten from the shipped engine bundle every run.
- **Preserved by default** (user-editable): `.cycle/workflows.yml`, `.cycle/prompts/**`, and `.cycle/scripts/**` are left byte-for-byte untouched.
- **Never touched** (state): `.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, and everything under `docs/cycle/issues/**`.

To pull a category back to the shipped defaults, opt in per category; the flags compose:

```sh
./.cycle/bin/cycle.js upgrade --overwrite-prompts        # refresh prompts only
./.cycle/bin/cycle.js upgrade --overwrite-workflows      # refresh workflows.yml only
./.cycle/bin/cycle.js upgrade --overwrite-scripts        # refresh scripts only
./.cycle/bin/cycle.js upgrade --overwrite-all            # all three of the above
```

For directory categories (`prompts/`, `scripts/`) an opt-in overwrite is a clean replace: the destination is removed first, so stray user-added files do not survive. Running `cycle upgrade` against a directory with no `.cycle/` errors out (pointing you to `cycle init`) and writes nothing. See [docs/upgrade.md](docs/upgrade.md) for the full contract.

## Ideas and inbox

Use `docs/cycle/issues/ideas/` for rough backlog notes, ambiguous asks, and work that needs human/agent discussion before execution. cycle does not drain `ideas/` automatically.

Use `docs/cycle/issues/inbox/` for work that is ready for triage. To promote an idea, add enough context and acceptance criteria, change `priority: idea` to `low | medium | high | critical`, move the file into `inbox/`, then run `cycle triage --dry-run` or `cycle run`.

## The default workflow, step by step

The `feature` workflow runs a full SDLC loop on every slice. Each step has one job, and the discipline is what makes the result safe to leave running:

1. **spec** writes the acceptance criteria before any code, including what should happen on bad input, a missing dependency, or a half-finished operation. Errors have to surface, never get swallowed. A clear target up front keeps the build honest.
2. **research** reads your codebase first: its conventions, its coupling, the tests that already exist. The build then works with your repo instead of pattern-matching a generic one.
3. **plan** picks the approach and writes down the failure and resilience choices: what can fail here, how the code responds, what stays idempotent on a retry. The hard calls get made before the diff, not buried inside it.
4. **build** implements one vertical slice with tests, covering the failure paths the spec named, not just the happy path.
5. **review** reads the diff for the things that bite later: swallowed errors, fail-open defaults, missing edge cases. Anything real goes into `MUST-FIX.md`.
6. **fix** runs only when review found something, and clears that list.
7. **verify** runs your real verify command (tests, build, whatever you configure) before anything is committed. A failing verify fails the cycle.
8. **reflection** looks back at the finished slice and files what it learned: follow-up issues for later, plus fix-now items it applies in this same cycle.
9. **final_fix** and **final_verify** apply those fix-now items and re-run verify.
10. **documentation** updates the docs the change actually touched.
11. **walkthrough_capture** records screenshots or video of the result, when you give it a hook.

Commit and push happen only after the steps pass. If a step fails, cycle wipes the attempt and starts over from a clean tree, up to three tries, then parks the issue and moves on.

### Make it yours

The defaults are a starting point, and they are all yours to change. `.cycle/workflows.yml` and `.cycle/prompts/` are plain files in your repo. Reorder the steps, drop the ones you don't need, add your own, or rewrite any prompt to match how your team actually works. Send a step to a different agent (`claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi`) or a different model. Write a whole new workflow and let triage choose it. Your edits survive `cycle upgrade`, which preserves `workflows.yml` and `prompts/` unless you ask it to overwrite them.

## Workflows

A workflow is an ordered list of steps defined in `.cycle/workflows.yml`; triage picks one per slice from the workflows configured in that file (or you force one with `--workflow`). See [`docs/workflows.md`](docs/workflows.md) for how to add repo-specific workflows. Four ship by default:

| Workflow | Shape | For |
|---|---|---|
| `feature` | `spec → research → plan → build → review → fix → verify → reflection → final_fix → final_verify → documentation → walkthrough_capture` | Full single-pass SDLC on a scoped slice |
| `quickfix` | `plan_fix → walkthrough_before → quick_fix → test_fix → verify → walkthrough_after` | Surgical fix for a well-scoped issue; no spec, no review |
| `document` | `plan_documents → authoring → review_documents → verify` | Documentation- and prompt-only edits; no code, no reflection |
| `e2e-tests` | `research → test_plan → test_build → review → fix → verify` | Write or extend Playwright end-to-end tests against the running app |

`fix` and `final_fix` are conditional: they run only when an earlier step produced work for them. `reflection` and `documentation` are non-fatal: a failure is logged but does not fail the cycle.

`walkthrough_capture` is the optional final step of `feature`: a delivered feature can emit screenshot/video walkthrough artifacts via a project-provided hook (`.cycle/walkthrough.sh`, or an `engine.walkthrough_hook` path in `.cycle/workflows.yml`). When a hook is present it runs at the end of the cycle, and any media it writes into the cycle's `walkthrough/` artifact dir is collected and referenced from the cycle's completion record. Repos with no hook (cycle's own CLI repo included) are unaffected: the step skips with no artifact and no failure. The same hook is reused by `quickfix`'s two phase-scoped steps, `walkthrough_before` (before the fix is applied) and `walkthrough_after` (after `verify`): each sets `CYCLE_WALKTHROUGH_PHASE` (`before`/`after`) so a single `.cycle/walkthrough.sh` can branch on phase, writing the broken and corrected behavior into `walkthrough/before/` and `walkthrough/after/` with per-phase manifests (`walkthrough-before-artifacts.json` / `walkthrough-after-artifacts.json`). An optional `engine.walkthrough_hook_timeout_ms` bounds a hook's runtime (SIGTERM→SIGKILL); when unset the hook runs to completion, so a hook that boots browsers or waits on dev servers should self-bound its own runtime or set that timeout.

There is no separate `epic` workflow. An issue that needs multiple cycles is one whose triage returned multiple queue entries, each a standalone workflow run.

Each step is executed by a configurable **agent**. `claudecode` (the `claude` CLI) is the default; `codex`, `gemini`, `auggie`, `opencode`, and `pi` are also registered, and `bash` steps run shell scripts directly (e.g. `verify`).

## Failure handling

- **Two retry layers.** Step-level (`on_fail: retry:N`) absorbs transient hiccups; cycle-level (default 3 attempts) abandons a bad attempt and restarts the workflow on a clean tree.
- **Pre-build skip on retry.** On a retry, `spec` / `research` / `plan` are skipped when their artifact already exists non-empty (override with `--no-skip-completed`).
- **Exhausted attempts** move the issue to `blocked/` and skip its remaining planned cycles, so one bad slice does not stall the rest of the queue.
- **Rate limits** trigger an in-process pause/retry loop: the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` (default 1 hour = 3,600,000 ms), and retries the same step. On first clean success after a rate-limited attempt it emits `engine.resumed { reason: "rate_limit_cleared" }`. Rate-limit retries are invisible to the consecutive-failure counter. The loop is bounded by `engine.max_rate_limit_retries` (default 24): a step rate-limited more than the cap times within one cycle emits `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` and fails the cycle through the normal terminal-failure path, so a permanent rate-limit (bad key, banned account) self-terminates instead of pausing forever.
- **Iteration-too-fast guard.** After two consecutive failures of the same step that each complete in under `engine.min_step_duration_ms` (default 2,000 ms) of wall-clock (e.g. a misconfigured agent that exits instantly), the engine fast-bails the cycle to terminal failure instead of burning the remaining attempt budget, emitting `step.warning { reason: "iteration_too_fast", duration_ms, threshold_ms }` so the cause is visible. Set `min_step_duration_ms: 0` to disable.
- **Command-output compression (opt-in token saver).** Set `engine.compress_output: true` (default `false`) to route the `claudecode` agent's simple read commands (`git status`, `ls`, `cat`, `grep`, `diff`, …) through `cycle compress-output`, which density-reduces verbose stdout (keeps head + tail lines and all error lines, elides the dense middle behind a `[… N lines/B bytes elided …]` marker) *before* it enters the model's context, saving tokens on long autonomous runs. It is wired only for the `claudecode` lane (via a generated claude `--settings` `PreToolUse` hook) and is **fail-open**: any hook error leaves the original command running unchanged, and commands with shell operators (`|`, `>`, `&&`, …) or non-read binaries are left untouched. With the flag off (the default), behavior is byte-for-byte unchanged.
- **Failed-cycle residue guard.** If a terminally-failed cycle leaves uncommitted residue in the worktree, the engine halts *before* it resumes/retries that cycle or starts the next issue, instead of piling a new cycle onto a dirty tree: `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, dirty_paths, … }` plus a stderr diagnostic naming the dirty paths and the commit / `git stash` / `git reset --hard` remediation. This matters most in trunk mode, where the residue sits directly on the base branch. The guard also survives a full engine restart: the context is persisted to `.cycle/failed-residue-context.json` and re-checked once at startup, so relaunching the engine after a failed cycle (the AFK recovery path) halts before stacking new work on the residue. Engine-owned runtime state (`.cycle/**`, `docs/cycle/**`) never trips it.
- **Crash recovery** is automatic: re-invoking `cycle run` (or bare `cycle`) resumes any in-flight cycle from the log tail, then continues the pending queue.

When every inbox issue fails triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", …}` and exits non-zero, leaving the work queue intact. Iterate with `cycle triage --dry-run` until it exits `0`, then re-fire the engine.

## Runtime requirements

- **Node.js ≥ 22.6** (the bundle is plain JS; the dev loop uses Node's native TypeScript stripping)
- **git** and **`gh`**
- an authenticated coding-agent CLI for every agent referenced by `.cycle/workflows.yml` (`claude` for the default `claudecode` workflow)
- repository dependencies needed by `.cycle/scripts/verify.sh`

Credentials are the caller's responsibility: cycle ships no env-var contract and no bundled tracker SDKs. See [`docs/runtime-environment.md`](docs/runtime-environment.md) for the full setup checklist, and run `cycle doctor` (alias `cycle preflight`) to verify your agent CLIs and required tools resolve before starting the engine — see [`docs/doctor.md`](docs/doctor.md).

## Roadmap (not yet built)

The engine today commits and pushes; the broader factory model is still landing. **Not yet implemented**: pull-request creation and auto-merge, stacked-branch / human-review mode, a detached daemon with `attach` / `stop` control, and the HTML/TUI progress viewer. The docs below describe the current shipped behavior, not these targets.

## Design docs

- [`BRIEF.md`](BRIEF.md): product brief: what cycle is and why.
- [`docs/runtime-environment.md`](docs/runtime-environment.md): host prerequisites, setup checks, and remaining doctor/preflight direction.
- [`docs/doctor.md`](docs/doctor.md): the on-demand `cycle doctor` / `cycle preflight` environment check.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system architecture, state model, and integration surfaces.
- [`docs/ENGINE.md`](docs/ENGINE.md): engine implementation reference for contributors.
- [`docs/models.md`](docs/models.md): supported agent models per CLI, the `defaults:`/per-step `model` syntax, and the live-discovery commands.
- [`docs/RFC-001-issue-lifecycle.md`](docs/RFC-001-issue-lifecycle.md): issue lifecycle, triage, queue, and blocked-work semantics.
- [`docs/RFC-003-in-cycle-remediation-and-priority-routing.md`](docs/RFC-003-in-cycle-remediation-and-priority-routing.md): in-cycle remediation and priority routing.
