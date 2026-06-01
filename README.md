<p align="center">
  <img src="./cycle-0.0.1.png" alt="cycle logo" width="400" />
</p>

# cycle

**cycle is a repo-local production cell for AFK software development.** Drop work into a repository, walk away, and let one serialized agent-operated lane triage it, break it into buildable slices, run a full workflow on each, verify the result, and produce reviewable commits — leaving a complete paper trail behind.

It is built for the two places autonomous development usually gets hard:

- **Brownfield repos**, where every ticket hides conventions, coupling, stale tests, and merge policy that a naive agent will miss.
- **Greenfield repos**, where a rough brief needs to become a sequence of scoped implementation cycles.

cycle turns those inputs into an ordered queue of durable, auditable code-production cycles. It is deliberately **one engine per repository, one cycle at a time**: the unit of scale is another repo-local cycle instance, not parallel workers fighting over the same tree.

## Host prerequisites

cycle installs a repo-local engine; it does **not** install the whole host environment. Before leaving it AFK, the machine needs the basic production-cell tooling already available:

- **Node.js >= 22.6** to run the bundled engine.
- **git** for status, branch/reset, commit, and push operations.
- **GitHub CLI (`gh`)** when workflows or automation interact with GitHub.
- **An authenticated coding agent CLI** matching `.cycle/workflows.yml`; the default workflows use `claudecode`, which expects the `claude` CLI.
- **Repository dependencies** required by `.cycle/scripts/verify.sh`.
- **Git credentials and remote access** when push is enabled.

See [`docs/runtime-environment.md`](docs/runtime-environment.md) for setup guidance and the planned `cycle doctor` / `cycle preflight` direction.

## What cycle is

cycle is an issue-driven workflow engine for autonomous code changes. You install it into a repository, invoke it from a parent agent, CI job, cloud VM, or developer machine, and it runs until its queue is empty or a safety gate tells it to stop.

An **issue** can be almost anything:

- a one-line freeform task
- a GitHub / Jira / Linear ticket dropped into the repo
- a bug report
- a PRD or a brief
- a reflection surfaced by a previous cycle

cycle's job is to make that work machine-operable: triage it, enrich it with codebase context, decompose large asks into vertical slices, run the configured workflow for each slice, and emit branches, commits, logs, and artifacts as it goes. The output is not a claim of perfection; it is a tested, explained, readily useful deliverable for human feedback.

## Why it exists

Most agentic coding tools are good at a single interactive turn. They are weaker at the production-cell problem: taking a backlog, repeatedly grinding the boring SDLC loop, respecting repo-specific constraints, recovering from failure, and leaving enough of a trail for a human to trust what happened.

cycle is that repo-local factory layer. It gives a parent agent or automation layer a single subprocess to hand work to, while cycle handles the repeatable mechanics:

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

If a run gets into a bad state, cycle abandons that attempt and restarts from a clean tree rather than nursing a compromised working tree along. The goal is not to make agents look busy — it is to make the repo-local production lane deterministic enough to leave AFK. Fleet-scale coordination belongs above cycle: run one cycle instance per repo and let an external orchestrator decide what each repository should work on.

## Why it works for brownfield

Brownfield work is where autonomous coding usually falls apart. cycle assumes the repo is messy until proven otherwise:

- issue descriptions may be stale or incomplete
- tests may already be failing
- conventions may differ across subtrees
- changes may have hidden blast radius
- failures should not poison unrelated queued work

So cycle makes repo context and artifacts first-class. Each cycle writes durable outputs under `docs/cycle/<cycle-id>-<workflow>-<slug>/`, keeps issue state under `docs/cycle/issues/`, and mirrors progress to `.cycle/log.jsonl`. A human can inspect the factory floor after the fact instead of reverse-engineering what the agent did from a chat transcript.

## What ships into a repo

`npx @cycleai/cli init` installs a small, repo-local factory kit:

- `.cycle/bin/cycle.js` — the bundled engine (single file, `#!/usr/bin/env node` shebang, committed executable)
- `.cycle/workflows.yml` — engine, triage, and workflow configuration
- `.cycle/prompts/` — prompt templates for each workflow step and for triage
- `.cycle/scripts/` — git / verification helpers
- `docs/cycle/issues/` — `ideas` / `inbox` / `todo` / `done` / `failed` / `blocked` issue folders
- optional `.claude/skills/cycle.md` — a Claude Code skill that teaches a parent agent how to invoke cycle

The consuming repo does not need to become a Node project. After `init`, the committed `.cycle/bin/cycle.js` bundle is the engine — no `npm install` required.

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

`run` flags: `--workflow <name>`, `--dry-run` (triage/queue preview only), `--no-skip-completed` (force re-derivation of pre-build artifacts on retry), `--trunk` (commit straight to the base branch instead of per-cycle branches).

## Ideas and inbox

Use `docs/cycle/issues/ideas/` for rough backlog notes, ambiguous asks, and work that needs human/agent discussion before execution. cycle does not drain `ideas/` automatically.

Use `docs/cycle/issues/inbox/` for work that is ready for triage. To promote an idea, add enough context and acceptance criteria, change `priority: idea` to `low | medium | high | critical`, move the file into `inbox/`, then run `cycle triage --dry-run` or `cycle run`.

## Workflows

A workflow is an ordered list of steps defined in `.cycle/workflows.yml`; triage picks one per slice from the workflows configured in that file (or you force one with `--workflow`). See [`docs/workflows.md`](docs/workflows.md) for how to add repo-specific workflows. Four ship by default:

| Workflow | Shape | For |
|---|---|---|
| `feature` | `spec → research → plan → build → review → fix → verify → reflection → final_fix → final_verify → documentation → walkthrough_capture` | Full single-pass SDLC on a scoped slice |
| `quickfix` | `plan_fix → walkthrough_before → quick_fix → test_fix → verify → walkthrough_after` | Surgical fix for a well-scoped issue; no spec, no review |
| `document` | `plan_documents → authoring → review_documents → verify` | Documentation- and prompt-only edits; no code, no reflection |
| `e2e-tests` | `research → test_plan → test_build → review → fix → verify` | Write or extend Playwright end-to-end tests against the running app |

`fix` and `final_fix` are conditional — they run only when an earlier step produced work for them. `reflection` and `documentation` are non-fatal: a failure is logged but does not fail the cycle.

`walkthrough_capture` is the optional final step of `feature`: a delivered feature can emit screenshot/video walkthrough artifacts via a project-provided hook (`.cycle/walkthrough.sh`, or an `engine.walkthrough_hook` path in `.cycle/workflows.yml`). When a hook is present it runs at the end of the cycle, and any media it writes into the cycle's `walkthrough/` artifact dir is collected and referenced from the cycle's completion record. Repos with no hook (cycle's own CLI repo included) are unaffected — the step skips cleanly with no artifact and no failure. The same hook is reused by `quickfix`'s two phase-scoped steps, `walkthrough_before` (before the fix is applied) and `walkthrough_after` (after `verify`): each sets `CYCLE_WALKTHROUGH_PHASE` (`before`/`after`) so a single `.cycle/walkthrough.sh` can branch on phase, writing the broken and corrected behavior into `walkthrough/before/` and `walkthrough/after/` with per-phase manifests (`walkthrough-before-artifacts.json` / `walkthrough-after-artifacts.json`). An optional `engine.walkthrough_hook_timeout_ms` bounds a hook's runtime (SIGTERM→SIGKILL); when unset the hook runs to completion, so a hook that boots browsers or waits on dev servers should self-bound its own runtime or set that timeout.

There is no separate `epic` workflow. An issue that needs multiple cycles is simply one whose triage returned multiple queue entries, each a standalone workflow run.

Each step is executed by a configurable **agent**. `claudecode` (the `claude` CLI) is the default; `codex`, `gemini`, `auggie`, `opencode`, and `pi` are also registered, and `bash` steps run shell scripts directly (e.g. `verify`).

## Failure handling

- **Two retry layers.** Step-level (`on_fail: retry:N`) absorbs transient hiccups; cycle-level (default 3 attempts) abandons a bad attempt and restarts the workflow on a clean tree.
- **Pre-build skip on retry.** On a retry, `spec` / `research` / `plan` are skipped when their artifact already exists non-empty (override with `--no-skip-completed`).
- **Exhausted attempts** move the issue to `blocked/` and skip its remaining planned cycles, so one bad slice does not stall the rest of the queue.
- **Rate limits** trigger an in-process pause/retry loop: the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` (default 1 hour = 3,600,000 ms), and retries the same step. On first clean success after a rate-limited attempt it emits `engine.resumed { reason: "rate_limit_cleared" }`. Rate-limit retries are invisible to the consecutive-failure counter. The loop is bounded by `engine.max_rate_limit_retries` (default 24): a step rate-limited more than the cap times within one cycle emits `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` and fails the cycle through the normal terminal-failure path, so a permanent rate-limit (bad key, banned account) self-terminates instead of pausing forever.
- **Iteration-too-fast guard.** After two consecutive failures of the same step that each complete in under `engine.min_step_duration_ms` (default 2,000 ms) of wall-clock — e.g. a misconfigured agent that exits instantly — the engine fast-bails the cycle to terminal failure instead of burning the remaining attempt budget, emitting `step.warning { reason: "iteration_too_fast", duration_ms, threshold_ms }` so the cause is visible. Set `min_step_duration_ms: 0` to disable.
- **Command-output compression (opt-in token saver).** Set `engine.compress_output: true` (default `false`) to route the `claudecode` agent's simple read commands — `git status`, `ls`, `cat`, `grep`, `diff`, … — through `cycle compress-output`, which density-reduces verbose stdout (keeps head + tail lines and all error lines, elides the dense middle behind a `[… N lines/B bytes elided …]` marker) *before* it enters the model's context, saving tokens on long autonomous runs. It is wired only for the `claudecode` lane (via a generated claude `--settings` `PreToolUse` hook) and is **fail-open**: any hook error leaves the original command running unchanged, and commands with shell operators (`|`, `>`, `&&`, …) or non-read binaries are never touched. With the flag off (the default), behavior is byte-for-byte unchanged.
- **Crash recovery** is automatic — re-invoking `cycle run` (or bare `cycle`) resumes any in-flight cycle from the log tail, then continues the pending queue.

When every inbox issue fails triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", …}` and exits non-zero, leaving the work queue intact. Iterate with `cycle triage --dry-run` until it exits `0`, then re-fire the engine.

## Runtime requirements

- **Node.js ≥ 22.6** (the bundle is plain JS; the dev loop uses Node's native TypeScript stripping)
- **git** and **`gh`**
- an authenticated coding-agent CLI for every agent referenced by `.cycle/workflows.yml` (`claude` for the default `claudecode` workflow)
- repository dependencies needed by `.cycle/scripts/verify.sh`

Credentials are the caller's responsibility — cycle ships no env-var contract and no bundled tracker SDKs. See [`docs/runtime-environment.md`](docs/runtime-environment.md) for the full setup checklist. A first-class `cycle doctor` / `cycle preflight` command is planned but not yet built.

## Roadmap (not yet built)

The engine today commits and pushes; the broader factory model is still landing. Notably **not yet implemented**: pull-request creation and auto-merge, stacked-branch / human-review mode, `cycle doctor` / `cycle preflight`, a detached daemon with `attach` / `stop` control, and the HTML/TUI progress viewer. The docs below describe the current shipped behavior, not these targets.

## Design docs

- [`BRIEF.md`](BRIEF.md) — product brief: what cycle is and why.
- [`docs/runtime-environment.md`](docs/runtime-environment.md) — host prerequisites, setup checks, and future doctor/preflight direction.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture, state model, and integration surfaces.
- [`docs/ENGINE.md`](docs/ENGINE.md) — engine implementation reference for contributors.
- [`docs/models.md`](docs/models.md) — supported agent models per CLI, the `defaults:`/per-step `model` syntax, and the live-discovery commands.
- [`docs/RFC-001-issue-lifecycle.md`](docs/RFC-001-issue-lifecycle.md) — issue lifecycle, triage, queue, and blocked-work semantics.
- [`docs/RFC-003-in-cycle-remediation-and-priority-routing.md`](docs/RFC-003-in-cycle-remediation-and-priority-routing.md) — in-cycle remediation and priority routing.
